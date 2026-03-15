import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  EXPORT_NAMES,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SKILLS_PAGE_ROUTE,
  SKILLS_SCAN_JOB_KEY,
  SLOT_IDS,
  WEEKLY_REPORT_JOB_KEY,
  WEEKLY_REPORT_PAGE_ROUTE,
} from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "SMSI Command Center",
  description: "Operational dashboard widget for SMSI agent fleet health and issue flow.",
  author: "SMSI",
  categories: ["automation", "ui"],
  capabilities: [
    "ui.page.register",
    "ui.sidebar.register",
    "ui.dashboardWidget.register",
    "events.subscribe",
    "jobs.schedule",
    "plugin.state.read",
    "plugin.state.write",
    "companies.read",
    "agents.read",
    "issues.read",
    "issue.comments.read",
    "http.outbound",
  ],
  jobs: [
    {
      jobKey: SKILLS_SCAN_JOB_KEY,
      displayName: "Skills Scan",
      description: "Scans local OpenClaw skill directories and refreshes the cached skills catalog.",
    },
    {
      jobKey: WEEKLY_REPORT_JOB_KEY,
      displayName: "Weekly Report",
      description: "Generates weekly operational reality-check metrics and summary.",
      schedule: "0 12 * * 0",
    },
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "page",
        id: SLOT_IDS.skillsPage,
        displayName: "Skills",
        exportName: EXPORT_NAMES.skillsPage,
        routePath: SKILLS_PAGE_ROUTE,
      },
      {
        type: "page",
        id: SLOT_IDS.weeklyReportPage,
        displayName: "Weekly Report",
        exportName: EXPORT_NAMES.weeklyReportPage,
        routePath: WEEKLY_REPORT_PAGE_ROUTE,
      },
      {
        type: "sidebar",
        id: SLOT_IDS.sidebar,
        displayName: "Skills",
        exportName: EXPORT_NAMES.sidebar,
      },
      {
        type: "sidebarPanel",
        id: SLOT_IDS.sidebarPanel,
        displayName: "Request Pipeline",
        exportName: EXPORT_NAMES.sidebarPanel,
      },
      {
        type: "dashboardWidget",
        id: SLOT_IDS.dashboardWidget,
        displayName: "SMSI Command Center",
        exportName: EXPORT_NAMES.dashboardWidget,
      },
    ],
  },
};

export default manifest;
