# Frontend Architecture (Vue 3 + Vuetify)

## 1) Frontend Modules
- Framework: Vue 3 + TypeScript
- UI: Vuetify + custom design tokens
- State: Pinia
- Routing: Vue Router
- Charts: ApexCharts
- Layout engine: Vue Grid Layout
- HTTP: Axios with JWT interceptors

## 2) Design System Direction
- Theme modes: dark and light.
- Visual style: premium SaaS with soft glassmorphism surfaces.
- Palette baseline:
  - Primary: `#00A878`
  - Secondary: `#00C2A8`
  - Accent: `#7BE495`
  - Dark BG: `#0B1020`
  - Light BG: `#F7FAFC`
- Motion: route transitions, staggered skeleton loading, hover elevation.

## 3) Page Architecture

### Authentication
- `/auth/login`
- `/auth/register`
- Features: validation, token persistence, session refresh.

### Workspace Dashboard
- `/workspace`
- Panels: AI chat, query preview, chart preview, narrative insight panel.
- Layout: split panes with resizable columns.

### Data Sources Manager
- `/datasources`
- Connector cards: PostgreSQL, MongoDB, CSV, Excel.
- Actions: create, test, refresh schema, disable.

### Dataset Explorer
- `/datasets/:sourceId/:datasetId`
- Views: tables, columns, statistics, sample rows, profiling badges.

### Semantic Layer Editor
- `/semantic/:sourceId`
- Editors: dimensions, measures, joins, KPI formulas, synonyms.

### Dashboard Builder
- `/dashboards/:dashboardId/edit`
- Drag-and-drop grid, widget resize handles, widget config modal.

### Query Playground
- `/playground`
- Input: NL question.
- Output: generated SQL/Mongo query, result grid, chart, narrative.

## 4) Core Component Hierarchy

```txt
AppShell
  |- WorkspaceLayout
      |- DashboardSidebar
      |- AIChatPanel
      |- QueryPreviewPanel
      |- DashboardCanvas
          |- KPIWidget
          |- ChartWidget
          |- NarrativePanel
      |- WidgetEditorModal
  |- DataSourceManager
  |- DatasetExplorer
  |- SemanticLayerEditor
```

## 5) Pinia Stores
- `authStore`: user, JWT, role claims.
- `workspaceStore`: current datasource, active question, loading states.
- `datasetStore`: schema, stats, previews.
- `semanticStore`: entities, columns, KPIs, synonyms.
- `dashboardStore`: dashboards, widgets, layouts.
- `queryStore`: generated query, execution result, history records.

## 6) UX Microcopy and Loading States
- `Analyzing dataset...`
- `Generating SQL...`
- `Detecting KPIs...`
- `Building dashboard...`

Each async region renders:
- skeleton states for cards/tables/charts
- progress timeline in query playground
- retry CTA on failed generation

## 7) Frontend Folder Structure

```txt
frontend/
  src/
    app/
      router/
      plugins/
      theme/
    components/
      chat/
      dashboard/
      dataset/
      semantic/
      common/
    views/
      auth/
      workspace/
      datasources/
      datasets/
      semantic/
      dashboards/
      playground/
    stores/
    services/
      api/
      adapters/
    types/
    utils/
```
