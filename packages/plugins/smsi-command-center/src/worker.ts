import {
  definePlugin,
  runWorker,
  type Agent,
  type Issue,
  type PluginContext,
  type PluginJobContext,
} from "@paperclipai/plugin-sdk";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  DASHBOARD_METRICS_KEY,
  ONLINE_STATUSES,
  ONLINE_WINDOW_MS,
  PLUGIN_ID,
  SKILLS_CATALOG_KEY,
  SKILLS_SCAN_JOB_KEY,
} from "./constants.js";

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

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("smsi-command-center setup complete");

    ctx.jobs.register(SKILLS_SCAN_JOB_KEY, async (job: PluginJobContext) => {
      await scanAndCacheForAllCompanies(ctx, `${job.trigger}:${job.jobKey}`);
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

    try {
      await scanAndCacheForAllCompanies(ctx, "setup");
    } catch (error) {
      ctx.logger.warn("initial skills scan failed", {
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
