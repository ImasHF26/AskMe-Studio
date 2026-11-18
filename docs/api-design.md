# API Design (Gateway Surface)

Base path: `/api/v1`

## 1) Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`

## 2) Datasources
- `GET /datasources`
- `POST /datasources`
- `POST /datasources/:id/test`
- `POST /datasources/:id/refresh-metadata`
- `DELETE /datasources/:id`

## 3) Dataset Explorer
- `GET /datasets/:datasourceId/tables`
- `GET /datasets/:datasourceId/tables/:tableName/columns`
- `GET /datasets/:datasourceId/tables/:tableName/profile`
- `GET /datasets/:datasourceId/tables/:tableName/preview`

## 4) Semantic Layer
- `GET /semantic/:datasourceId`
- `POST /semantic/:datasourceId/generate`
- `PUT /semantic/:datasourceId/tables/:tableId`
- `PUT /semantic/:datasourceId/columns/:columnId`
- `POST /semantic/:datasourceId/kpis`
- `POST /semantic/:datasourceId/synonyms`

## 5) Copilot + Query Playground
- `POST /copilot/query/generate`
- `POST /copilot/query/validate`
- `POST /copilot/query/execute`
- `POST /copilot/chart/recommend`
- `POST /copilot/narrative/generate`

## 6) Dashboards
- `GET /dashboards`
- `POST /dashboards`
- `GET /dashboards/:id`
- `PUT /dashboards/:id`
- `DELETE /dashboards/:id`
- `POST /dashboards/:id/widgets`
- `PUT /dashboards/:id/widgets/:widgetId`
- `DELETE /dashboards/:id/widgets/:widgetId`

## 7) Analytics
- `POST /analytics/anomalies/detect`
- `POST /analytics/forecast`

## 8) Standard Response Envelope
```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "requestId": "req_123",
    "timestamp": "2026-06-01T10:00:00Z"
  }
}
```

## 9) Role Access Matrix
- `Admin`: full access
- `Analyst`: all except user/role management
- `Viewer`: read dashboards, run approved saved queries
