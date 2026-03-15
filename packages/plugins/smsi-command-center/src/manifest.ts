import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { EXPORT_NAMES, PAGE_ROUTE, PLUGIN_ID, PLUGIN_VERSION, SKILLS_SCAN_JOB_KEY, SLOT_IDS } from "./constants.js";

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
    "jobs.schedule",
    "plugin.state.read",
    "plugin.state.write",
    "companies.read",
    "agents.read",
    "issues.read",
  ],
  jobs: [
    {
      jobKey: SKILLS_SCAN_JOB_KEY,
      displayName: "Skills Scan",
      description: "Scans local OpenClaw skill directories and refreshes the cached skills catalog.",
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
        id: SLOT_IDS.page,
        displayName: "Skills",
        exportName: EXPORT_NAMES.page,
        routePath: PAGE_ROUTE,
      },
      {
        type: "sidebar",
        id: SLOT_IDS.sidebar,
        displayName: "Skills",
        exportName: EXPORT_NAMES.sidebar,
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
