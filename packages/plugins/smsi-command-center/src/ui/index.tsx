import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import {
  usePluginData,
  type PluginPageProps,
  type PluginSidebarProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import {
  DASHBOARD_METRICS_KEY,
  REQUEST_PIPELINE_KEY,
  SKILLS_CATALOG_KEY,
  SKILLS_PAGE_ROUTE,
  WEEKLY_REPORT_DATA_KEY,
  WEEKLY_REPORT_PAGE_ROUTE,
} from "../constants.js";

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
  error?: string;
};

type SkillRecord = {
  id: string;
  name: string;
  description: string;
  sourceKey: "openclaw" | "workspace";
  sourceDirectory: string;
  relativePath: string;
  filePath: string;
  metadata: {
    author: string | null;
    version: string | null;
    category: string | null;
  };
  content: string;
};

type SkillsCatalog = {
  scannedAt: string;
  total: number;
  sources: Array<{
    key: "openclaw" | "workspace";
    label: string;
    directory: string;
    exists: boolean;
    count: number;
  }>;
  skills: SkillRecord[];
  cacheKey: string;
  error?: string;
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

type RequestPipelineData = {
  generatedAt: string;
  entries: RequestPipelineEntry[];
  cacheKey: string;
  error?: string;
};

type WeeklyReportData = {
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
  cacheKey: string;
  fromCache: boolean;
  error?: string;
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "14px",
  padding: "14px",
  background: "var(--card, transparent)",
  display: "grid",
  gap: "12px",
};

const sectionTitleStyle: CSSProperties = {
  fontSize: "12px",
  opacity: 0.75,
  fontWeight: 600,
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "8px",
};

const statTileStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "10px",
  padding: "8px",
  display: "grid",
  gap: "2px",
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
};

const rowStyle: CSSProperties = {
  border: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
  borderRadius: "8px",
  padding: "8px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "8px",
};

function hostPath(companyPrefix: string | null | undefined, suffix: string): string {
  return companyPrefix ? `/${companyPrefix}${suffix}` : suffix;
}

function skillsPagePath(companyPrefix: string | null | undefined): string {
  return hostPath(companyPrefix, `/${SKILLS_PAGE_ROUTE}`);
}

function weeklyReportPagePath(companyPrefix: string | null | undefined): string {
  return hostPath(companyPrefix, `/${WEEKLY_REPORT_PAGE_ROUTE}`);
}

function issuePath(companyPrefix: string | null | undefined, issueRef: string): string {
  return hostPath(companyPrefix, `/issues/${issueRef}`);
}

function lastHeartbeatLabel(lastHeartbeatAt: string | null): string {
  if (!lastHeartbeatAt) return "No heartbeat";
  const value = new Date(lastHeartbeatAt);
  if (!Number.isFinite(value.getTime())) return "No heartbeat";
  return value.toLocaleString();
}

function compactDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString();
}

function StatusPill({ online }: { online: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        padding: "2px 8px",
        fontSize: "11px",
        border: `1px solid ${online ? "#15803d" : "#475569"}`,
        background: online ? "color-mix(in srgb, #22c55e 18%, transparent)" : "transparent",
      }}
    >
      {online ? "online" : "offline"}
    </span>
  );
}

function skillsByQuery(skills: SkillRecord[], query: string): SkillRecord[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return skills;
  return skills.filter((skill) => {
    const haystack = `${skill.name} ${skill.description}`.toLowerCase();
    return haystack.includes(needle);
  });
}

export function SmsiCommandCenterDashboardWidget({ context }: PluginWidgetProps) {
  const companyId = context.companyId ?? null;
  const query = usePluginData<DashboardMetrics>(DASHBOARD_METRICS_KEY, { companyId });

  const counts = useMemo(() => {
    const c = query.data?.issueCounts;
    return c ?? { todo: 0, in_progress: 0, in_review: 0, done: 0 };
  }, [query.data]);

  const agents = query.data?.agentFleet?.agents ?? [];
  const recentActivity = query.data?.recentActivity ?? [];

  return (
    <section style={cardStyle} aria-label="SMSI Command Center">
      <header style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "baseline" }}>
        <strong>SMSI Command Center</strong>
        <span style={{ fontSize: "11px", opacity: 0.7 }}>
          {query.data?.generatedAt ? `Updated ${compactDate(query.data.generatedAt)}` : "Loading"}
        </span>
      </header>

      {query.loading ? <div style={{ fontSize: "12px", opacity: 0.8 }}>Loading metrics...</div> : null}
      {query.error ? <div style={{ fontSize: "12px", color: "var(--destructive)" }}>Failed to load dashboard metrics.</div> : null}
      {query.data?.error ? <div style={{ fontSize: "12px", color: "var(--destructive)" }}>{query.data.error}</div> : null}

      <section style={{ display: "grid", gap: "8px" }}>
        <div style={sectionTitleStyle}>Issue Counts</div>
        <div style={statsGridStyle}>
          <div style={statTileStyle}>
            <strong>{counts.todo}</strong>
            <span style={{ fontSize: "11px", opacity: 0.75 }}>todo</span>
          </div>
          <div style={statTileStyle}>
            <strong>{counts.in_progress}</strong>
            <span style={{ fontSize: "11px", opacity: 0.75 }}>in progress</span>
          </div>
          <div style={statTileStyle}>
            <strong>{counts.in_review}</strong>
            <span style={{ fontSize: "11px", opacity: 0.75 }}>in review</span>
          </div>
          <div style={statTileStyle}>
            <strong>{counts.done}</strong>
            <span style={{ fontSize: "11px", opacity: 0.75 }}>done</span>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gap: "8px" }}>
        <div style={sectionTitleStyle}>Agent Fleet ({query.data?.agentFleet?.online ?? 0}/{query.data?.agentFleet?.total ?? 0} online)</div>
        <div style={listStyle}>
          {agents.length === 0 ? <div style={{ fontSize: "12px", opacity: 0.7 }}>No agents found.</div> : null}
          {agents.slice(0, 6).map((agent) => (
            <article key={agent.id} style={rowStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {agent.name}
                </div>
                <div style={{ fontSize: "11px", opacity: 0.75 }}>
                  {agent.role} • {agent.status} • {lastHeartbeatLabel(agent.lastHeartbeatAt)}
                </div>
              </div>
              <StatusPill online={agent.online} />
            </article>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gap: "8px" }}>
        <div style={sectionTitleStyle}>Recent Activity</div>
        <div style={listStyle}>
          {recentActivity.length === 0 ? <div style={{ fontSize: "12px", opacity: 0.7 }}>No recent issue updates.</div> : null}
          {recentActivity.map((issue) => (
            <article key={issue.id} style={rowStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {issue.identifier ? `${issue.identifier}: ` : ""}
                  {issue.title}
                </div>
                <div style={{ fontSize: "11px", opacity: 0.75 }}>
                  {issue.status} • {compactDate(issue.updatedAt)}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export function SmsiCommandCenterSkillsPage({ context }: PluginPageProps) {
  const companyId = context.companyId ?? null;
  const query = usePluginData<SkillsCatalog>(SKILLS_CATALOG_KEY, { companyId });
  const [search, setSearch] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const skills = query.data?.skills ?? [];
  const filtered = useMemo(() => skillsByQuery(skills, search), [skills, search]);

  const selected = useMemo(() => {
    if (!filtered.length) return null;
    if (!selectedSkillId) return filtered[0] ?? null;
    return filtered.find((skill) => skill.id === selectedSkillId) ?? filtered[0] ?? null;
  }, [filtered, selectedSkillId]);

  return (
    <section style={{ display: "grid", gap: "14px", padding: "16px" }}>
      <header style={{ display: "grid", gap: "6px" }}>
        <h1 style={{ margin: 0, fontSize: "22px" }}>Skills Browser</h1>
        <div style={{ fontSize: "13px", opacity: 0.72 }}>
          {query.data?.total ?? 0} skills installed
          {query.data?.scannedAt ? ` • Updated ${compactDate(query.data.scannedAt)}` : ""}
        </div>
      </header>

      {query.loading ? <div style={{ fontSize: "13px" }}>Loading skills catalog...</div> : null}
      {query.error ? <div style={{ color: "var(--destructive)", fontSize: "13px" }}>Failed to load skills catalog.</div> : null}
      {query.data?.error ? <div style={{ color: "var(--destructive)", fontSize: "13px" }}>{query.data.error}</div> : null}

      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by skill name or description"
          style={{
            flex: "1 1 320px",
            minWidth: "220px",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "8px 10px",
            background: "var(--background)",
            color: "var(--foreground)",
          }}
        />
        <button
          type="button"
          onClick={() => query.refresh()}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "8px 10px",
            background: "var(--card)",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 1.2fr) minmax(300px, 1fr)",
          gap: "12px",
          alignItems: "start",
        }}
      >
        <section style={{ border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "color-mix(in srgb, var(--card) 70%, transparent)" }}>
                <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid var(--border)" }}>Name</th>
                <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid var(--border)" }}>Description</th>
                <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid var(--border)" }}>Category</th>
                <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid var(--border)" }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((skill) => {
                const selectedRow = selected?.id === skill.id;
                return (
                  <tr
                    key={skill.id}
                    onClick={() => setSelectedSkillId(skill.id)}
                    style={{
                      cursor: "pointer",
                      background: selectedRow ? "color-mix(in srgb, var(--accent) 40%, transparent)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "10px", borderBottom: "1px solid color-mix(in srgb, var(--border) 65%, transparent)", fontWeight: 600 }}>
                      {skill.name}
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid color-mix(in srgb, var(--border) 65%, transparent)" }}>
                      <div style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}>
                        {skill.description}
                      </div>
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid color-mix(in srgb, var(--border) 65%, transparent)" }}>
                      {skill.metadata.category ?? "-"}
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid color-mix(in srgb, var(--border) 65%, transparent)" }}>
                      {skill.sourceDirectory}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "14px", opacity: 0.75 }}>
                    No skills match this search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "12px", display: "grid", gap: "10px" }}>
          {!selected ? (
            <div style={{ opacity: 0.75, fontSize: "13px" }}>Select a skill to inspect SKILL.md content.</div>
          ) : (
            <>
              <header style={{ display: "grid", gap: "4px" }}>
                <strong style={{ fontSize: "16px" }}>{selected.name}</strong>
                <div style={{ fontSize: "12px", opacity: 0.72 }}>
                  {selected.sourceDirectory} • {selected.relativePath}
                </div>
                <div style={{ fontSize: "12px", opacity: 0.72 }}>
                  Category: {selected.metadata.category ?? "-"} • Author: {selected.metadata.author ?? "-"} • Version: {selected.metadata.version ?? "-"}
                </div>
              </header>
              <div style={{ fontSize: "13px" }}>{selected.description}</div>
              <pre
                style={{
                  margin: 0,
                  maxHeight: "520px",
                  overflow: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "10px",
                  background: "color-mix(in srgb, var(--card) 72%, transparent)",
                  fontSize: "12px",
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                }}
              >
                {selected.content}
              </pre>
            </>
          )}
        </section>
      </div>
    </section>
  );
}

function issueReference(entry: RequestPipelineEntry): string {
  return entry.issueIdentifier ?? entry.issueId;
}

function issueStatusTone(status: string): string {
  if (status === "done") return "#16a34a";
  if (status === "in_progress") return "#2563eb";
  if (status === "blocked") return "#dc2626";
  if (status === "in_review") return "#d97706";
  return "#64748b";
}

export function SmsiCommandCenterWeeklyReportPage({ context }: PluginPageProps) {
  const companyId = context.companyId ?? null;
  const [refreshTick, setRefreshTick] = useState(0);
  const query = usePluginData<WeeklyReportData>(WEEKLY_REPORT_DATA_KEY, { companyId, refreshTick });

  return (
    <section style={{ display: "grid", gap: "14px", padding: "16px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <h1 style={{ margin: 0, fontSize: "22px" }}>Weekly Report</h1>
          <div style={{ fontSize: "13px", opacity: 0.72 }}>
            {query.data?.generatedAt ? `Generated ${compactDate(query.data.generatedAt)}` : "Generating..."}
            {query.data ? ` • ${query.data.fromCache ? "cached" : "fresh"}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setRefreshTick((tick) => tick + 1);
            query.refresh();
          }}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "8px 10px",
            background: "var(--card)",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          Regenerate
        </button>
      </header>

      {query.loading ? <div style={{ fontSize: "13px" }}>Loading weekly report...</div> : null}
      {query.error ? <div style={{ color: "var(--destructive)", fontSize: "13px" }}>Failed to load weekly report.</div> : null}
      {query.data?.error ? <div style={{ color: "var(--destructive)", fontSize: "13px" }}>{query.data.error}</div> : null}

      {query.data ? (
        <div style={{ display: "grid", gap: "12px" }}>
          <section style={cardStyle}>
            <strong>What Was Built</strong>
            <div style={{ fontSize: "13px", opacity: 0.78 }}>
              Closed issues: {query.data.whatWasBuilt.closedIssueCount} • Commits: {query.data.whatWasBuilt.commitCount}
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              {query.data.whatWasBuilt.closedIssues.slice(0, 8).map((issue) => (
                <div key={issue.id} style={rowStyle}>
                  <span style={{ fontSize: "13px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {issue.identifier ? `${issue.identifier}: ` : ""}
                    {issue.title}
                  </span>
                  <span style={{ fontSize: "11px", opacity: 0.7 }}>{compactDate(issue.closedAt)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              {query.data.whatWasBuilt.commits.slice(0, 8).map((commit) => (
                <div key={commit.sha} style={rowStyle}>
                  <code style={{ fontSize: "11px" }}>{commit.sha.slice(0, 7)}</code>
                  <span style={{ fontSize: "13px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {commit.subject}
                  </span>
                  <span style={{ fontSize: "11px", opacity: 0.7 }}>{compactDate(commit.authoredAt)}</span>
                </div>
              ))}
            </div>
          </section>

          <section style={cardStyle}>
            <strong>What Was Used</strong>
            <div style={statsGridStyle}>
              <div style={statTileStyle}><strong>{query.data.whatWasUsed.runCount}</strong><span style={{ fontSize: "11px", opacity: 0.75 }}>runs</span></div>
              <div style={statTileStyle}><strong>{query.data.whatWasUsed.successfulRunCount}</strong><span style={{ fontSize: "11px", opacity: 0.75 }}>succeeded</span></div>
              <div style={statTileStyle}><strong>{query.data.whatWasUsed.totalInputTokens}</strong><span style={{ fontSize: "11px", opacity: 0.75 }}>input tokens</span></div>
              <div style={statTileStyle}><strong>{query.data.whatWasUsed.totalOutputTokens}</strong><span style={{ fontSize: "11px", opacity: 0.75 }}>output tokens</span></div>
            </div>
          </section>

          <section style={cardStyle}>
            <strong>What&apos;s Collecting Dust</strong>
            <div style={{ fontSize: "13px", opacity: 0.78 }}>
              Stale issues: {query.data.collectingDust.staleIssueCount} • Potentially unused skills: {query.data.collectingDust.unusedSkillCount}
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              {query.data.collectingDust.staleIssues.slice(0, 8).map((issue) => (
                <div key={issue.id} style={rowStyle}>
                  <span style={{ fontSize: "13px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {issue.identifier ? `${issue.identifier}: ` : ""}
                    {issue.title}
                  </span>
                  <span style={{ fontSize: "11px", opacity: 0.7 }}>{issue.daysSinceUpdate}d stale</span>
                </div>
              ))}
            </div>
          </section>

          <section style={cardStyle}>
            <strong>Shiny Object Audit</strong>
            <div style={{ fontSize: "13px", opacity: 0.78 }}>
              New issues: {query.data.shinyObjectAudit.newIssueCount} • Completed: {query.data.shinyObjectAudit.completedIssueCount} • Ratio: {query.data.shinyObjectAudit.ratio}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export function SmsiCommandCenterRequestPipelinePanel({ context }: PluginSidebarProps) {
  const companyId = context.companyId ?? null;
  const query = usePluginData<RequestPipelineData>(REQUEST_PIPELINE_KEY, { companyId });
  return (
    <section style={{ display: "grid", gap: "8px", padding: "10px 8px" }}>
      <header style={{ display: "grid", gap: "2px" }}>
        <strong style={{ fontSize: "12px" }}>Request Pipeline</strong>
        <span style={{ fontSize: "11px", opacity: 0.7 }}>
          {query.data?.generatedAt ? `Updated ${compactDate(query.data.generatedAt)}` : "Loading..."}
        </span>
      </header>

      {query.loading ? <div style={{ fontSize: "12px", opacity: 0.75 }}>Loading requests...</div> : null}
      {query.error ? <div style={{ fontSize: "12px", color: "var(--destructive)" }}>Failed to load request pipeline.</div> : null}
      {query.data?.error ? <div style={{ fontSize: "12px", color: "var(--destructive)" }}>{query.data.error}</div> : null}

      <div style={{ display: "grid", gap: "6px" }}>
        {(query.data?.entries ?? []).slice(0, 10).map((entry) => {
          const issueRef = issueReference(entry);
          return (
            <a
              key={entry.commentId}
              href={issuePath(context.companyPrefix, issueRef)}
              style={{
                border: "1px solid color-mix(in srgb, var(--border) 70%, transparent)",
                borderRadius: "8px",
                padding: "8px",
                display: "grid",
                gap: "4px",
                textDecoration: "none",
                color: "inherit",
                background: "color-mix(in srgb, var(--card) 75%, transparent)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "11px", opacity: 0.75 }}>{issueRef}</span>
                <span
                  style={{
                    fontSize: "10px",
                    color: issueStatusTone(entry.issueStatus),
                    border: "1px solid currentColor",
                    borderRadius: "999px",
                    padding: "1px 6px",
                    textTransform: "lowercase",
                  }}
                >
                  {entry.issueStatus}
                </span>
              </div>
              <div style={{ fontSize: "12px", fontWeight: 600 }}>{entry.requestSummary}</div>
              <div style={{ fontSize: "11px", opacity: 0.68 }}>{compactDate(entry.requestedAt)}</div>
            </a>
          );
        })}
        {(query.data?.entries?.length ?? 0) === 0 && !query.loading ? (
          <div style={{ fontSize: "12px", opacity: 0.7 }}>No Brad-tagged requests found.</div>
        ) : null}
      </div>
    </section>
  );
}

export function SmsiCommandCenterSkillsSidebarEntry({ context }: PluginSidebarProps) {
  const skillsHref = skillsPagePath(context.companyPrefix);
  const weeklyHref = weeklyReportPagePath(context.companyPrefix);
  const pathName = typeof window !== "undefined" ? window.location.pathname : "";
  const skillsActive = pathName === skillsHref;
  const weeklyActive = pathName === weeklyHref;
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <a
        href={skillsHref}
        aria-current={skillsActive ? "page" : undefined}
        className={[
          "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors",
          skillsActive ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
        ].join(" ")}
      >
        <span aria-hidden="true" style={{ width: "16px", display: "inline-flex" }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h10" />
            <circle cx="18" cy="18" r="2" />
          </svg>
        </span>
        <span className="flex-1 truncate">Skills</span>
      </a>
      <a
        href={weeklyHref}
        aria-current={weeklyActive ? "page" : undefined}
        className={[
          "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors",
          weeklyActive ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
        ].join(" ")}
      >
        <span aria-hidden="true" style={{ width: "16px", display: "inline-flex" }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16" />
            <path d="M4 12h10" />
            <path d="M4 19h16" />
          </svg>
        </span>
        <span className="flex-1 truncate">Weekly Report</span>
      </a>
    </div>
  );
}
