export const PLUGIN_ID = "smsi.command-center";
export const PLUGIN_VERSION = "0.1.0";
export const PAGE_ROUTE = "skills";
export const DASHBOARD_METRICS_KEY = "dashboard-metrics";
export const SKILLS_CATALOG_KEY = "skills-catalog";
export const SKILLS_SCAN_JOB_KEY = "skills-scan";

export const SLOT_IDS = {
  page: "smsi-command-center-skills-page",
  sidebar: "smsi-command-center-skills-sidebar",
  dashboardWidget: "smsi-command-center-dashboard-widget",
} as const;

export const EXPORT_NAMES = {
  page: "SmsiCommandCenterSkillsPage",
  sidebar: "SmsiCommandCenterSkillsSidebarEntry",
  dashboardWidget: "SmsiCommandCenterDashboardWidget",
} as const;

export const ONLINE_STATUSES = new Set(["active", "idle", "running"]);

export const ONLINE_WINDOW_MS = 10 * 60 * 1000;
