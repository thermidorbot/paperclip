# SMSI Command Center Plugin — Specification

## Overview

A Paperclip plugin that converges all SMSI operational tooling into the Paperclip UI. Replaces Notion as the primary dashboard and adds skills visibility, request tracking, and ops metrics.

## Architecture

- **Plugin ID:** `smsi-command-center`
- **Worker:** Handles data aggregation, scheduled jobs, event listeners
- **UI:** React components rendered into Paperclip plugin slots
- **State:** Plugin state API for persistent config and cache
- **Data:** Plugin data endpoints for UI to query worker

## UI Slots

### 1. Dashboard Widget (`dashboardWidget`)
**SMSI Overview Card** on the main Paperclip dashboard:
- Agent fleet status (online/offline, last heartbeat)
- Active issues count by status (todo, in_progress, done)
- Token costs (today, this week, this month)
- Recent Brad requests (last 5, linked to issues)

### 2. Skills Browser Page (`page`, route: `skills`)
Full catalog of OpenClaw skills available to the system:
- Table/grid view of all installed skills (both ~/openclaw/skills/ and ~/.openclaw/workspace/skills/)
- Columns: name, description, category, location, last used
- Search/filter by name or category
- Detail view shows full SKILL.md content
- Future: enable/disable per agent, install from ClawHub

### 3. Weekly Report Page (`page`, route: `weekly-report`)
Auto-generated weekly reality check:
- What was built (git commits, issues closed)
- What was used (agent run counts, skill usage)
- What's collecting dust (unused skills, stalled issues)
- Shiny object audit (new items vs. completed items ratio)
- Generated on-demand or via scheduled job (Sundays)

### 4. Request Pipeline Sidebar (`sidebarPanel`)
Brad → Agent request tracking:
- Shows recent requests extracted from issue comments tagged `[Brad]`
- Status indicators (pending, in progress, done)
- Click to navigate to linked issue

## Worker Capabilities

### Events
- `issue.created` — Track new issues for request pipeline
- `issue.updated` — Update dashboard metrics
- `run.completed` — Aggregate token costs

### Jobs
- `weekly-report` — Generate weekly reality check data
- `skills-scan` — Scan filesystem for installed skills, cache metadata

### Data Endpoints
- `dashboard-metrics` — Aggregated stats for dashboard widget
- `skills-catalog` — Cached skill list with metadata
- `weekly-report-data` — Latest weekly report content
- `request-pipeline` — Recent Brad requests

### State Keys
- `company:{id}:skills-cache` — Cached skills catalog
- `company:{id}:weekly-report` — Latest weekly report
- `company:{id}:request-log` — Brad request history

## Implementation Plan

### Phase 1: Scaffold + Dashboard Widget (SMSI-7a)
1. Create plugin scaffold using `create-paperclip-plugin`
2. Implement dashboard widget with mock data
3. Wire up to real Paperclip API for issue/agent/run stats
4. Deploy and verify in local instance

### Phase 2: Skills Browser (SMSI-7b)
1. Implement `skills-scan` job that reads SKILL.md files from filesystem
2. Build skills page UI with table, search, and detail view
3. Cache results in plugin state

### Phase 3: Request Pipeline + Weekly Report (SMSI-7c)
1. Implement request pipeline sidebar
2. Implement weekly report generation job
3. Build weekly report page UI

## File Structure

```
plugins/smsi-command-center/
├── package.json
├── manifest.json
├── SPEC.md
├── src/
│   ├── worker.ts          # Plugin worker (events, jobs, data)
│   ├── constants.ts       # Plugin ID, job keys, etc.
│   ├── ui/
│   │   ├── DashboardWidget.tsx
│   │   ├── SkillsBrowser.tsx
│   │   ├── SkillDetail.tsx
│   │   ├── WeeklyReport.tsx
│   │   ├── RequestPipeline.tsx
│   │   └── index.ts       # UI slot registrations
│   └── lib/
│       ├── skills-scanner.ts
│       ├── metrics.ts
│       └── report-generator.ts
├── tsconfig.json
└── vite.config.ts
```

## Dependencies

- `@paperclipai/plugin-sdk` (worker)
- `@paperclipai/plugin-sdk/ui` (React components)
- `react` (peer dep from host)

## Notes

- Plugin reads filesystem for skills — needs `fs` access in worker
- Token cost data comes from Paperclip's cost tracking API
- Brad requests are identified by comments containing `[Brad]` tag
- Weekly report replaces the current heartbeat-driven reality check
