import {
  definePlugin,
  runWorker,
  type Agent,
  type Issue,
  type IssueComment,
  type PluginContext,
  type PluginJobContext,
} from "@paperclipai/plugin-sdk";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import {
  DASHBOARD_METRICS_KEY,
  REQUEST_PIPELINE_KEY,
  ONLINE_STATUSES,
  ONLINE_WINDOW_MS,
  PLUGIN_ID,
  SKILLS_CATALOG_KEY,
  SKILLS_SCAN_JOB_KEY,
  STALE_ISSUE_DAYS,
  WEEKLY_REPORT_DATA_KEY,
  WEEKLY_REPORT_JOB_KEY,
  WEEKLY_REPORT_LOOKBACK_DAYS,
} from "./constants.js";

const execFileAsync = promisify(execFile);

type DashboardAgent = {
  id: string;
  name: string;
  role: string;
  status: string;
  lastHeartbeatAt: string | null;
  online: boolean;
};

type DashboardIssueCounts = {
  todo: number;
  in_progress: number;
  in_review: number;
  done: number;
};

type DashboardRecentIssue = {
  id: string;
  identifier: string | null;
  title: string;
  status: string;
  updatedAt: string;
};

type DashboardMetrics = {
  pluginId: string;
  generatedAt: string;
  agentFleet: {
    total: number;
    online: number;
    offline: number;
    agents: DashboardAgent[];
  };
  issueCounts: DashboardIssueCounts;
  recentActivity: DashboardRecentIssue[];
};

type SkillSource = {
  key: "openclaw" | "workspace";
  label: string;
  dir: string;
};

type SkillMetadata = {
  author: string | null;
  version: string | null;
  category: string | null;
};

type SkillRecord = {
  id: string;
  name: string;
  description: string;
  sourceKey: SkillSource["key"];
  sourceDirectory: string;
  relativePath: string;
  filePath: string;
  metadata: SkillMetadata;
  content: string;
};

type SkillsCatalog = {
  scannedAt: string;
  total: number;
  sources: Array<{
    key: SkillSource["key"];
    label: string;
    directory: string;
    exists: boolean;
    count: number;
  }>;
  skills: SkillRecord[];
};

type SkillsCatalogResponse = SkillsCatalog & {
  cacheKey: string;
};

type RequestPipelineEntry = {
  commentId: string;
  issueId: string;
  issueIdentifier: string | null;
  issueTitle: string;
  issueStatus: string;
  requestSummary: string;
  requestedAt: string;
};

type RequestPipelineResponse = {
  generatedAt: string;
  entries: RequestPipelineEntry[];
  cacheKey: string;
  error?: string;
};

type HeartbeatRunSummary = {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  usageJson: Record<string, unknown> | null;
};

type WeeklyReport = {
  generatedAt: string;
  weekStart: string;
  weekEnd: string;
  whatWasBuilt: {
    closedIssueCount: number;
    closedIssues: Array<{
      id: string;
      identifier: string | null;
      title: string;
      closedAt: string;
    }>;
    commitCount: number;
    commits: Array<{
      sha: string;
      authoredAt: string;
      subject: string;
    }>;
  };
  whatWasUsed: {
    runCount: number;
    successfulRunCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCachedInputTokens: number;
    skillCount: number;
  };
  collectingDust: {
    staleIssueCount: number;
    staleIssues: Array<{
      id: string;
      identifier: string | null;
      title: string;
      status: string;
      updatedAt: string;
      daysSinceUpdate: number;
    }>;
    unusedSkillCount: number;
    unusedSkills: Array<{
      id: string;
      name: string;
      sourceDirectory: string;
    }>;
  };
  shinyObjectAudit: {
    newIssueCount: number;
    completedIssueCount: number;
    ratio: number;
  };
};

type WeeklyReportResponse = WeeklyReport & {
  cacheKey: string;
  fromCache: boolean;
  error?: string;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? date.toISOString() : null;
}

function isOnline(agent: Agent, nowMs: number): boolean {
  if (!ONLINE_STATUSES.has(agent.status)) return false;
  const heartbeatIso = toIso(agent.lastHeartbeatAt);
  if (!heartbeatIso) return false;
  const heartbeatMs = Date.parse(heartbeatIso);
  if (!Number.isFinite(heartbeatMs)) return false;
  return nowMs - heartbeatMs <= ONLINE_WINDOW_MS;
}

function mapIssueCounts(issues: Issue[]): DashboardIssueCounts {
  const counts: DashboardIssueCounts = {
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
  };
  for (const issue of issues) {
    if (issue.status === "todo") counts.todo += 1;
    if (issue.status === "in_progress") counts.in_progress += 1;
    if (issue.status === "in_review") counts.in_review += 1;
    if (issue.status === "done") counts.done += 1;
  }
  return counts;
}

function mapRecentActivity(issues: Issue[]): DashboardRecentIssue[] {
  return issues
    .map((issue) => ({
      issue,
      updatedAtIso: toIso(issue.updatedAt),
    }))
    .filter((row): row is { issue: Issue; updatedAtIso: string } => Boolean(row.updatedAtIso))
    .sort((a, b) => Date.parse(b.updatedAtIso) - Date.parse(a.updatedAtIso))
    .slice(0, 5)
    .map(({ issue, updatedAtIso }) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      status: issue.status,
      updatedAt: updatedAtIso,
    }));
}

async function buildDashboardMetrics(ctx: PluginContext, companyId: string): Promise<DashboardMetrics> {
  const [agents, issues] = await Promise.all([
    ctx.agents.list({ companyId, limit: 200, offset: 0 }),
    ctx.issues.list({ companyId, limit: 200, offset: 0 }),
  ]);

  const nowMs = Date.now();
  const agentRows: DashboardAgent[] = agents
    .map((agent) => {
      const lastHeartbeatAt = toIso(agent.lastHeartbeatAt);
      return {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        status: agent.status,
        lastHeartbeatAt,
        online: isOnline(agent, nowMs),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const onlineCount = agentRows.filter((agent) => agent.online).length;

  return {
    pluginId: PLUGIN_ID,
    generatedAt: new Date(nowMs).toISOString(),
    agentFleet: {
      total: agentRows.length,
      online: onlineCount,
      offline: agentRows.length - onlineCount,
      agents: agentRows,
    },
    issueCounts: mapIssueCounts(issues),
    recentActivity: mapRecentActivity(issues),
  };
}

function getSkillSources(): SkillSource[] {
  const home = os.homedir();
  return [
    {
      key: "openclaw",
      label: "~/openclaw/skills",
      dir: path.join(home, "openclaw", "skills"),
    },
    {
      key: "workspace",
      label: "~/.openclaw/workspace/skills",
      dir: path.join(home, ".openclaw", "workspace", "skills"),
    },
  ];
}

function companySkillsCacheKey(companyId: string): string {
  return `company:${companyId}:skills-cache`;
}

function slugFromFilePath(filePath: string): string {
  const parent = path.basename(path.dirname(filePath));
  if (parent && parent.toLowerCase() !== "skills") {
    return parent;
  }
  return path.basename(filePath, path.extname(filePath));
}

function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function parseScalarValue(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function parseFrontmatter(frontmatter: string): {
  name: string | null;
  description: string | null;
  metadata: SkillMetadata;
} {
  let name: string | null = null;
  let description: string | null = null;
  const metadata: SkillMetadata = {
    author: null,
    version: null,
    category: null,
  };

  let section: string | null = null;
  for (const rawLine of frontmatter.split("\n")) {
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.search(/\S|$/);
    const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;

    const [, rawKey, rawValue] = match;
    const key = rawKey.toLowerCase();
    const value = parseScalarValue(rawValue);

    if (indent === 0 && rawValue.length === 0) {
      section = key;
      continue;
    }

    if (indent === 0) {
      section = null;
      if (key === "name") name = value || null;
      if (key === "description") description = value || null;
      if (key === "author") metadata.author = value || null;
      if (key === "version") metadata.version = value || null;
      if (key === "category") metadata.category = value || null;
      continue;
    }

    if (section === "metadata") {
      if (key === "author") metadata.author = value || null;
      if (key === "version") metadata.version = value || null;
      if (key === "category") metadata.category = value || null;
    }
  }

  return { name, description, metadata };
}

function splitFrontmatter(markdown: string): {
  frontmatter: string | null;
  body: string;
} {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: null, body: normalized };
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    return { frontmatter: null, body: normalized };
  }

  return {
    frontmatter: normalized.slice(4, end),
    body: normalized.slice(end + 5),
  };
}

function extractFallbackDescription(markdownBody: string): string {
  const lines = markdownBody
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));

  if (lines.length === 0) return "No description available.";

  const paragraph: string[] = [];
  for (const line of lines) {
    if (paragraph.length > 0 && /^[-*]/.test(line)) break;
    paragraph.push(line);
    if (line.endsWith(".")) break;
  }

  const value = paragraph.join(" ").trim();
  return value || "No description available.";
}

async function walkForSkillFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await walkForSkillFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name === "SKILL.md") {
      result.push(fullPath);
    }
  }

  return result;
}

async function parseSkillFile(filePath: string, source: SkillSource): Promise<SkillRecord> {
  const raw = await fs.readFile(filePath, "utf-8");
  const { frontmatter, body } = splitFrontmatter(raw);
  const parsed = frontmatter ? parseFrontmatter(frontmatter) : {
    name: null,
    description: null,
    metadata: { author: null, version: null, category: null },
  };
  const fallbackName = humanizeSlug(slugFromFilePath(filePath));
  const fallbackDescription = extractFallbackDescription(body);
  const relativePath = path.relative(source.dir, filePath);
  const id = `${source.key}:${relativePath}`;

  return {
    id,
    name: parsed.name ?? fallbackName,
    description: parsed.description ?? fallbackDescription,
    sourceKey: source.key,
    sourceDirectory: source.label,
    relativePath,
    filePath,
    metadata: parsed.metadata,
    content: raw,
  };
}

async function scanSkillsCatalog(ctx: PluginContext): Promise<SkillsCatalog> {
  const sources = getSkillSources();
  const sourceSummaries: SkillsCatalog["sources"] = [];
  const skills: SkillRecord[] = [];

  for (const source of sources) {
    try {
      const stat = await fs.stat(source.dir);
      if (!stat.isDirectory()) {
        sourceSummaries.push({
          key: source.key,
          label: source.label,
          directory: source.dir,
          exists: false,
          count: 0,
        });
        continue;
      }

      const files = await walkForSkillFiles(source.dir);
      const parsed = await Promise.all(files.map((filePath) => parseSkillFile(filePath, source)));
      parsed.sort((a, b) => a.name.localeCompare(b.name));
      skills.push(...parsed);
      sourceSummaries.push({
        key: source.key,
        label: source.label,
        directory: source.dir,
        exists: true,
        count: parsed.length,
      });
    } catch {
      sourceSummaries.push({
        key: source.key,
        label: source.label,
        directory: source.dir,
        exists: false,
        count: 0,
      });
    }
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));

  const payload: SkillsCatalog = {
    scannedAt: new Date().toISOString(),
    total: skills.length,
    sources: sourceSummaries,
    skills,
  };

  ctx.logger.info("skills scan complete", {
    sourceSummaries,
    total: payload.total,
  });

  return payload;
}

async function listCompanyIds(ctx: PluginContext): Promise<string[]> {
  const companyIds: string[] = [];
  const limit = 200;
  let offset = 0;

  while (true) {
    const companies = await ctx.companies.list({ limit, offset });
    for (const company of companies) {
      companyIds.push(company.id);
    }
    if (companies.length < limit) break;
    offset += companies.length;
  }

  return companyIds;
}

async function writeSkillsCache(ctx: PluginContext, companyId: string, catalog: SkillsCatalog): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", stateKey: companySkillsCacheKey(companyId) },
    catalog,
  );
}

async function readSkillsCache(ctx: PluginContext, companyId: string): Promise<SkillsCatalog | null> {
  const cache = await ctx.state.get({ scopeKind: "instance", stateKey: companySkillsCacheKey(companyId) });
  if (!cache || typeof cache !== "object") return null;
  return cache as SkillsCatalog;
}

async function scanAndCacheForAllCompanies(ctx: PluginContext, reason: string): Promise<void> {
  const [catalog, companyIds] = await Promise.all([scanSkillsCatalog(ctx), listCompanyIds(ctx)]);

  if (companyIds.length === 0) {
    ctx.logger.warn("skills scan found no companies to cache", { reason });
    return;
  }

  await Promise.all(companyIds.map((companyId) => writeSkillsCache(ctx, companyId, catalog)));
  ctx.logger.info("skills cache updated for all companies", {
    reason,
    companyCount: companyIds.length,
    totalSkills: catalog.total,
  });
}

async function ensureCompanySkillsCatalog(ctx: PluginContext, companyId: string): Promise<SkillsCatalogResponse> {
  const cacheKey = companySkillsCacheKey(companyId);
  const cached = await readSkillsCache(ctx, companyId);
  if (cached && Array.isArray(cached.skills) && cached.skills.length > 0) {
    return {
      ...cached,
      cacheKey,
    };
  }

  const catalog = await scanSkillsCatalog(ctx);
  await writeSkillsCache(ctx, companyId, catalog);
  return {
    ...catalog,
    cacheKey,
  };
}

function companyRequestLogKey(companyId: string): string {
  return `company:${companyId}:request-log`;
}

function companyWeeklyReportKey(companyId: string): string {
  return `company:${companyId}:weekly-report`;
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function extractBradRequestSummary(commentBody: string): string | null {
  const lines = commentBody
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^\[Brad\]\s*(.+)$/i);
    if (!match) continue;
    const summary = normalizeWhitespace(match[1] ?? "");
    if (!summary) return "Brad request";
    return summary.length > 180 ? `${summary.slice(0, 177)}...` : summary;
  }

  return null;
}

function compareByRequestedAtDesc(a: RequestPipelineEntry, b: RequestPipelineEntry): number {
  return Date.parse(b.requestedAt) - Date.parse(a.requestedAt);
}

async function collectRequestPipelineEntries(ctx: PluginContext, companyId: string): Promise<RequestPipelineEntry[]> {
  const issues = await ctx.issues.list({ companyId, limit: 200, offset: 0 });
  const commentsByIssue = await Promise.all(issues.map(async (issue) => ({
    issue,
    comments: await ctx.issues.listComments(issue.id, companyId),
  })));

  const entries: RequestPipelineEntry[] = [];
  for (const row of commentsByIssue) {
    for (const comment of row.comments) {
      const requestSummary = extractBradRequestSummary(comment.body);
      if (!requestSummary) continue;
      const requestedAt = toIso(comment.createdAt);
      if (!requestedAt) continue;
      entries.push({
        commentId: comment.id,
        issueId: row.issue.id,
        issueIdentifier: row.issue.identifier,
        issueTitle: row.issue.title,
        issueStatus: row.issue.status,
        requestSummary,
        requestedAt,
      });
    }
  }

  entries.sort(compareByRequestedAtDesc);
  return entries.slice(0, 40);
}

async function writeRequestPipelineCache(
  ctx: PluginContext,
  companyId: string,
  entries: RequestPipelineEntry[],
): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", stateKey: companyRequestLogKey(companyId) },
    { generatedAt: new Date().toISOString(), entries },
  );
}

async function readRequestPipelineCache(
  ctx: PluginContext,
  companyId: string,
): Promise<{ generatedAt: string; entries: RequestPipelineEntry[] } | null> {
  const raw = await ctx.state.get({ scopeKind: "instance", stateKey: companyRequestLogKey(companyId) });
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { generatedAt?: unknown; entries?: unknown };
  if (!Array.isArray(value.entries) || typeof value.generatedAt !== "string") return null;
  return {
    generatedAt: value.generatedAt,
    entries: value.entries as RequestPipelineEntry[],
  };
}

async function syncRequestPipelineForCompany(
  ctx: PluginContext,
  companyId: string,
  reason: string,
): Promise<RequestPipelineResponse> {
  const entries = await collectRequestPipelineEntries(ctx, companyId);
  const generatedAt = new Date().toISOString();
  await writeRequestPipelineCache(ctx, companyId, entries);
  ctx.logger.info("request pipeline refreshed", {
    companyId,
    reason,
    entries: entries.length,
  });
  return {
    generatedAt,
    entries,
    cacheKey: companyRequestLogKey(companyId),
  };
}

async function ensureRequestPipeline(ctx: PluginContext, companyId: string): Promise<RequestPipelineResponse> {
  const cached = await readRequestPipelineCache(ctx, companyId);
  if (cached) {
    return {
      generatedAt: cached.generatedAt,
      entries: cached.entries,
      cacheKey: companyRequestLogKey(companyId),
    };
  }
  return await syncRequestPipelineForCompany(ctx, companyId, "cache-miss");
}

function toFiniteNumber(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : 0;
}

function safeDateMs(value: Date | string | null | undefined): number | null {
  const iso = toIso(value);
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function isWithinRange(ms: number | null, fromMs: number, toMs: number): boolean {
  if (ms === null) return false;
  return ms >= fromMs && ms <= toMs;
}

function daysSince(ms: number, nowMs: number): number {
  return Math.floor((nowMs - ms) / (24 * 60 * 60 * 1000));
}

async function listAllIssues(ctx: PluginContext, companyId: string): Promise<Issue[]> {
  const all: Issue[] = [];
  const limit = 200;
  let offset = 0;

  while (true) {
    const page = await ctx.issues.list({ companyId, limit, offset });
    all.push(...page);
    if (page.length < limit) break;
    offset += page.length;
    if (all.length >= 2000) break;
  }

  return all;
}

async function getHeartbeatRunsForCompany(ctx: PluginContext, companyId: string): Promise<HeartbeatRunSummary[]> {
  const apiUrl = process.env.PAPERCLIP_API_URL;
  const apiKey = process.env.PAPERCLIP_API_KEY;
  if (!apiUrl || !apiKey) {
    return [];
  }

  const url = new URL(`/api/companies/${companyId}/heartbeat-runs?limit=500`, apiUrl);
  const response = await ctx.http.fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`heartbeat-runs fetch failed (${response.status})`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) return [];

  const rows: HeartbeatRunSummary[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.status !== "string" || typeof row.createdAt !== "string") continue;
    rows.push({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt,
      startedAt: typeof row.startedAt === "string" ? row.startedAt : null,
      finishedAt: typeof row.finishedAt === "string" ? row.finishedAt : null,
      usageJson: row.usageJson && typeof row.usageJson === "object" ? row.usageJson as Record<string, unknown> : null,
    });
  }
  return rows;
}

async function getRecentGitCommits(lookbackDays: number): Promise<Array<{ sha: string; authoredAt: string; subject: string }>> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { stdout } = await execFileAsync("git", [
      "log",
      `--since=${since}`,
      "--pretty=format:%H|%aI|%s",
      "--max-count=50",
    ], { cwd: process.cwd() });

    const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    const commits = lines.map((line) => {
      const [sha, authoredAt, ...subjectParts] = line.split("|");
      return {
        sha: sha ?? "",
        authoredAt: authoredAt ?? "",
        subject: subjectParts.join("|").trim(),
      };
    }).filter((row) => row.sha.length > 0 && row.authoredAt.length > 0 && row.subject.length > 0);
    return commits;
  } catch {
    return [];
  }
}

async function generateWeeklyReport(ctx: PluginContext, companyId: string): Promise<WeeklyReport> {
  const nowMs = Date.now();
  const lookbackMs = WEEKLY_REPORT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const staleAfterMs = STALE_ISSUE_DAYS * 24 * 60 * 60 * 1000;
  const weekStartMs = nowMs - lookbackMs;

  const [issues, skillsCatalog, heartbeatRuns, commits] = await Promise.all([
    listAllIssues(ctx, companyId),
    ensureCompanySkillsCatalog(ctx, companyId),
    getHeartbeatRunsForCompany(ctx, companyId).catch(() => []),
    getRecentGitCommits(WEEKLY_REPORT_LOOKBACK_DAYS),
  ]);

  const closedIssues = issues
    .map((issue) => {
      const closedAt = toIso(issue.completedAt) ?? toIso(issue.updatedAt);
      return { issue, closedAt };
    })
    .filter((row): row is { issue: Issue; closedAt: string } => Boolean(row.closedAt))
    .filter((row) => row.issue.status === "done")
    .filter((row) => isWithinRange(Date.parse(row.closedAt), weekStartMs, nowMs))
    .sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt))
    .slice(0, 20)
    .map((row) => ({
      id: row.issue.id,
      identifier: row.issue.identifier,
      title: row.issue.title,
      closedAt: row.closedAt,
    }));

  const staleIssues = issues
    .filter((issue) => issue.status !== "done" && issue.status !== "cancelled")
    .map((issue) => {
      const updatedMs = safeDateMs(issue.updatedAt);
      if (updatedMs === null) return null;
      const inactiveMs = nowMs - updatedMs;
      if (inactiveMs < staleAfterMs) return null;
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        status: issue.status,
        updatedAt: new Date(updatedMs).toISOString(),
        daysSinceUpdate: daysSince(updatedMs, nowMs),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
    .slice(0, 20);

  const newIssueCount = issues.filter((issue) => {
    const createdMs = safeDateMs(issue.createdAt);
    return isWithinRange(createdMs, weekStartMs, nowMs);
  }).length;

  const completedIssueCount = closedIssues.length;
  const ratio = completedIssueCount === 0
    ? newIssueCount
    : Number((newIssueCount / completedIssueCount).toFixed(2));

  const runRowsInWindow = heartbeatRuns.filter((run) => {
    const createdMs = safeDateMs(run.createdAt);
    return isWithinRange(createdMs, weekStartMs, nowMs);
  });

  const usageTotals = runRowsInWindow.reduce((acc, run) => {
    const usage = run.usageJson ?? {};
    acc.input += toFiniteNumber((usage as Record<string, unknown>).inputTokens);
    acc.output += toFiniteNumber((usage as Record<string, unknown>).outputTokens);
    acc.cached += toFiniteNumber((usage as Record<string, unknown>).cachedInputTokens);
    return acc;
  }, { input: 0, output: 0, cached: 0 });

  const unusedSkills = (skillsCatalog.skills ?? [])
    .slice(0, 12)
    .map((skill) => ({
      id: skill.id,
      name: skill.name,
      sourceDirectory: skill.sourceDirectory,
    }));

  return {
    generatedAt: new Date(nowMs).toISOString(),
    weekStart: new Date(weekStartMs).toISOString(),
    weekEnd: new Date(nowMs).toISOString(),
    whatWasBuilt: {
      closedIssueCount: closedIssues.length,
      closedIssues,
      commitCount: commits.length,
      commits,
    },
    whatWasUsed: {
      runCount: runRowsInWindow.length,
      successfulRunCount: runRowsInWindow.filter((run) => run.status === "succeeded").length,
      totalInputTokens: usageTotals.input,
      totalOutputTokens: usageTotals.output,
      totalCachedInputTokens: usageTotals.cached,
      skillCount: skillsCatalog.total,
    },
    collectingDust: {
      staleIssueCount: staleIssues.length,
      staleIssues,
      unusedSkillCount: unusedSkills.length,
      unusedSkills,
    },
    shinyObjectAudit: {
      newIssueCount,
      completedIssueCount,
      ratio,
    },
  };
}

async function writeWeeklyReportCache(ctx: PluginContext, companyId: string, report: WeeklyReport): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", stateKey: companyWeeklyReportKey(companyId) },
    report,
  );
}

async function readWeeklyReportCache(ctx: PluginContext, companyId: string): Promise<WeeklyReport | null> {
  const raw = await ctx.state.get({ scopeKind: "instance", stateKey: companyWeeklyReportKey(companyId) });
  if (!raw || typeof raw !== "object") return null;
  return raw as WeeklyReport;
}

async function ensureWeeklyReport(
  ctx: PluginContext,
  companyId: string,
  forceRefresh: boolean,
): Promise<WeeklyReportResponse> {
  const cacheKey = companyWeeklyReportKey(companyId);
  if (!forceRefresh) {
    const cached = await readWeeklyReportCache(ctx, companyId);
    if (cached?.generatedAt) {
      return {
        ...cached,
        cacheKey,
        fromCache: true,
      };
    }
  }

  const report = await generateWeeklyReport(ctx, companyId);
  await writeWeeklyReportCache(ctx, companyId, report);
  return {
    ...report,
    cacheKey,
    fromCache: false,
  };
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("smsi-command-center setup complete");

    ctx.jobs.register(SKILLS_SCAN_JOB_KEY, async (job: PluginJobContext) => {
      await scanAndCacheForAllCompanies(ctx, `${job.trigger}:${job.jobKey}`);
    });
    ctx.jobs.register(WEEKLY_REPORT_JOB_KEY, async (job: PluginJobContext) => {
      const companyIds = await listCompanyIds(ctx);
      await Promise.all(companyIds.map(async (companyId) => {
        const report = await generateWeeklyReport(ctx, companyId);
        await writeWeeklyReportCache(ctx, companyId, report);
      }));
      ctx.logger.info("weekly report generation completed", {
        trigger: job.trigger,
        runId: job.runId,
        companyCount: companyIds.length,
      });
    });

    ctx.events.on("issue.created", async (event) => {
      await syncRequestPipelineForCompany(ctx, event.companyId, "event:issue.created");
    });
    ctx.events.on("issue.updated", async (event) => {
      await syncRequestPipelineForCompany(ctx, event.companyId, "event:issue.updated");
    });

    ctx.data.register(DASHBOARD_METRICS_KEY, async (params) => {
      const companyId = typeof params.companyId === "string" ? params.companyId : "";
      if (!companyId) {
        return {
          pluginId: PLUGIN_ID,
          generatedAt: new Date().toISOString(),
          error: "companyId is required",
        };
      }

      return await buildDashboardMetrics(ctx, companyId);
    });

    ctx.data.register(SKILLS_CATALOG_KEY, async (params) => {
      const companyId = typeof params.companyId === "string" ? params.companyId : "";
      if (!companyId) {
        return {
          scannedAt: new Date().toISOString(),
          total: 0,
          sources: [],
          skills: [],
          cacheKey: "",
          error: "companyId is required",
        };
      }

      return await ensureCompanySkillsCatalog(ctx, companyId);
    });
    ctx.data.register(REQUEST_PIPELINE_KEY, async (params) => {
      const companyId = typeof params.companyId === "string" ? params.companyId : "";
      if (!companyId) {
        return {
          generatedAt: new Date().toISOString(),
          entries: [],
          cacheKey: "",
          error: "companyId is required",
        };
      }

      const refresh = params.refresh === true
        || (typeof params.refresh === "number" && params.refresh > 0)
        || (typeof params.refreshTick === "number" && params.refreshTick > 0);
      if (refresh) {
        return await syncRequestPipelineForCompany(ctx, companyId, "manual-refresh");
      }

      return await ensureRequestPipeline(ctx, companyId);
    });
    ctx.data.register(WEEKLY_REPORT_DATA_KEY, async (params) => {
      const companyId = typeof params.companyId === "string" ? params.companyId : "";
      if (!companyId) {
        return {
          generatedAt: new Date().toISOString(),
          weekStart: new Date().toISOString(),
          weekEnd: new Date().toISOString(),
          whatWasBuilt: { closedIssueCount: 0, closedIssues: [], commitCount: 0, commits: [] },
          whatWasUsed: {
            runCount: 0,
            successfulRunCount: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCachedInputTokens: 0,
            skillCount: 0,
          },
          collectingDust: {
            staleIssueCount: 0,
            staleIssues: [],
            unusedSkillCount: 0,
            unusedSkills: [],
          },
          shinyObjectAudit: { newIssueCount: 0, completedIssueCount: 0, ratio: 0 },
          cacheKey: "",
          fromCache: true,
          error: "companyId is required",
        };
      }

      const refresh = params.refresh === true
        || (typeof params.refresh === "number" && params.refresh > 0)
        || (typeof params.refreshTick === "number" && params.refreshTick > 0);
      return await ensureWeeklyReport(ctx, companyId, refresh);
    });

    try {
      const companyIds = await listCompanyIds(ctx);
      await Promise.all([
        scanAndCacheForAllCompanies(ctx, "setup"),
        Promise.all(companyIds.map((companyId) => syncRequestPipelineForCompany(ctx, companyId, "setup"))),
      ]);
    } catch (error) {
      ctx.logger.warn("initial setup sync failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async onHealth() {
    return {
      status: "ok",
      message: "SMSI Command Center ready",
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
