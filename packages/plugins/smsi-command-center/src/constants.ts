export const PLUGIN_ID = "smsi.command-center";
export const PLUGIN_VERSION = "0.1.0";
export const SKILLS_PAGE_ROUTE = "skills";
export const WEEKLY_REPORT_PAGE_ROUTE = "weekly-report";
export const DASHBOARD_METRICS_KEY = "dashboard-metrics";
export const SKILLS_CATALOG_KEY = "skills-catalog";
export const REQUEST_PIPELINE_KEY = "request-pipeline";
export const WEEKLY_REPORT_DATA_KEY = "weekly-report-data";
export const SKILLS_SCAN_JOB_KEY = "skills-scan";
export const WEEKLY_REPORT_JOB_KEY = "weekly-report";

export const SLOT_IDS = {
  skillsPage: "smsi-command-center-skills-page",
  weeklyReportPage: "smsi-command-center-weekly-report-page",
  sidebar: "smsi-command-center-skills-sidebar",
  sidebarPanel: "smsi-command-center-request-pipeline-panel",
  dashboardWidget: "smsi-command-center-dashboard-widget",
} as const;

export const EXPORT_NAMES = {
  skillsPage: "SmsiCommandCenterSkillsPage",
  weeklyReportPage: "SmsiCommandCenterWeeklyReportPage",
  sidebar: "SmsiCommandCenterSkillsSidebarEntry",
  sidebarPanel: "SmsiCommandCenterRequestPipelinePanel",
  dashboardWidget: "SmsiCommandCenterDashboardWidget",
} as const;

export const ONLINE_STATUSES = new Set(["active", "idle", "running"]);

export const ONLINE_WINDOW_MS = 10 * 60 * 1000;

export const WEEKLY_REPORT_LOOKBACK_DAYS = 7;
export const STALE_ISSUE_DAYS = 14;
