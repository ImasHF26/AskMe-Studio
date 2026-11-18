import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

type WidgetType = 'kpi' | 'chart' | 'table' | 'text';
type ChartType = 'line' | 'bar' | 'pie' | 'table';

interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DashboardWidget {
  id: string;
  dashboardId: string;
  title: string;
  type: WidgetType;
  position: WidgetPosition;
  query: string;
  chartType: ChartType;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface Dashboard {
  id: string;
  datasourceId: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  widgets: DashboardWidget[];
}

interface DashboardRecord extends Dashboard {
  userId: string;
}

interface CreateDashboardInput {
  userId: string;
  datasourceId: string;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
}

interface UpdateDashboardInput {
  userId: string;
  datasourceId?: string;
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
}

interface CreateWidgetInput {
  userId: string;
  title: string;
  type: WidgetType;
  position?: WidgetPosition;
  query?: string;
  chartType?: ChartType;
  config?: Record<string, unknown>;
}

interface UpdateWidgetInput {
  userId: string;
  title?: string;
  type?: WidgetType;
  position?: WidgetPosition;
  query?: string;
  chartType?: ChartType;
  config?: Record<string, unknown>;
}

@Injectable()
export class AppService implements OnModuleInit {
  private readonly pool?: Pool;
  private dbReady = false;
  private readonly inMemoryDashboards: DashboardRecord[] = [];

  constructor() {
    const connectionString = process.env.POSTGRES_URL;
    if (connectionString) {
      this.pool = new Pool({ connectionString });
    }
  }

  async onModuleInit() {
    if (!this.pool) return;

    try {
      await this.pool.query('SELECT 1;');
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_dashboards (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          datasource_id TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          config JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await this.pool.query("ALTER TABLE app_dashboards ADD COLUMN IF NOT EXISTS datasource_id TEXT NOT NULL DEFAULT '';");
      await this.pool.query("ALTER TABLE app_dashboards ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;");
      await this.pool.query('CREATE INDEX IF NOT EXISTS idx_app_dashboards_user ON app_dashboards(user_id);');
      await this.pool.query(
        'CREATE INDEX IF NOT EXISTS idx_app_dashboards_datasource ON app_dashboards(user_id, datasource_id);'
      );

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS app_dashboard_widgets (
          id TEXT PRIMARY KEY,
          dashboard_id TEXT NOT NULL REFERENCES app_dashboards(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          type TEXT NOT NULL,
          position JSONB NOT NULL DEFAULT '{}'::jsonb,
          query_text TEXT NOT NULL DEFAULT '',
          chart_type TEXT NOT NULL DEFAULT 'table',
          config JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await this.pool.query(
        'CREATE INDEX IF NOT EXISTS idx_app_dashboard_widgets_dash ON app_dashboard_widgets(dashboard_id);'
      );
      await this.pool.query(
        'CREATE INDEX IF NOT EXISTS idx_app_dashboard_widgets_user ON app_dashboard_widgets(user_id);'
      );

      this.dbReady = true;
    } catch (error) {
      this.dbReady = false;
      console.error('PostgreSQL unavailable in dashboard-service, using in-memory fallback.');
    }
  }

  getHealth() {
    return {
      service: 'dashboard-service',
      status: 'ok',
      persistence: this.dbReady ? 'postgresql' : 'memory'
    };
  }

  async listDashboards(userId: string): Promise<Dashboard[]> {
    const safeUserId = this.requireUserId(userId);

    if (this.dbReady && this.pool) {
      const dashboardsRes = await this.pool.query(
        `SELECT id, datasource_id, name, description, config, created_at, updated_at
         FROM app_dashboards
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [safeUserId]
      );

      if (!dashboardsRes.rowCount) return [];

      const dashboardIds = dashboardsRes.rows.map((row: any) => row.id as string);
      const widgetsRes = await this.pool.query(
        `SELECT id, dashboard_id, title, type, position, query_text, chart_type, config, created_at, updated_at
         FROM app_dashboard_widgets
         WHERE user_id = $1 AND dashboard_id = ANY($2)
         ORDER BY created_at ASC`,
        [safeUserId, dashboardIds]
      );

      const widgetMap = new Map<string, DashboardWidget[]>();
      for (const row of widgetsRes.rows) {
        const arr = widgetMap.get(row.dashboard_id) || [];
        arr.push({
          id: row.id,
          dashboardId: row.dashboard_id,
          title: row.title,
          type: row.type,
          position: this.normalizePosition(row.position),
          query: row.query_text || '',
          chartType: this.normalizeChartType(row.chart_type),
          config: (row.config || {}) as Record<string, unknown>,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString()
        });
        widgetMap.set(row.dashboard_id, arr);
      }

      return dashboardsRes.rows.map((row: any) => ({
        id: row.id,
        datasourceId: row.datasource_id || '',
        name: row.name,
        description: row.description,
        config: (row.config || {}) as Record<string, unknown>,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        widgets: widgetMap.get(row.id) || []
      }));
    }

    return this.inMemoryDashboards
      .filter((dashboard) => dashboard.userId === safeUserId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((dashboard) => this.stripUserId(dashboard));
  }

  async createDashboard(payload: CreateDashboardInput): Promise<Dashboard> {
    const safeUserId = this.requireUserId(payload.userId);
    const safeDatasourceId = this.requireDatasourceId(payload.datasourceId);
    const safeName = payload.name?.trim();
    if (!safeName) {
      throw new BadRequestException('Dashboard name is required.');
    }

    const now = new Date().toISOString();
    const created: DashboardRecord = {
      id: this.newId('dsh'),
      userId: safeUserId,
      datasourceId: safeDatasourceId,
      name: safeName,
      description: payload.description?.trim() || '',
      config: payload.config || {},
      createdAt: now,
      updatedAt: now,
      widgets: []
    };

    if (this.dbReady && this.pool) {
      await this.pool.query(
        `INSERT INTO app_dashboards (id, user_id, datasource_id, name, description, config, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
        [
          created.id,
          created.userId,
          created.datasourceId,
          created.name,
          created.description,
          JSON.stringify(created.config || {}),
          created.createdAt,
          created.updatedAt
        ]
      );
      return this.getDashboard(created.id, safeUserId);
    }

    this.inMemoryDashboards.unshift(created);
    return this.stripUserId(created);
  }

  async getDashboard(dashboardId: string, userId: string): Promise<Dashboard> {
    const safeDashboardId = this.requireDashboardId(dashboardId);
    const safeUserId = this.requireUserId(userId);

    if (this.dbReady && this.pool) {
      const dashboardRes = await this.pool.query(
        `SELECT id, datasource_id, name, description, config, created_at, updated_at
         FROM app_dashboards
         WHERE id = $1 AND user_id = $2
         LIMIT 1`,
        [safeDashboardId, safeUserId]
      );

      if (!dashboardRes.rowCount) {
        throw new NotFoundException('Dashboard not found.');
      }

      const widgetsRes = await this.pool.query(
        `SELECT id, dashboard_id, title, type, position, query_text, chart_type, config, created_at, updated_at
         FROM app_dashboard_widgets
         WHERE dashboard_id = $1 AND user_id = $2
         ORDER BY created_at ASC`,
        [safeDashboardId, safeUserId]
      );

      const row = dashboardRes.rows[0];
      return {
        id: row.id,
        datasourceId: row.datasource_id || '',
        name: row.name,
        description: row.description,
        config: (row.config || {}) as Record<string, unknown>,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        widgets: widgetsRes.rows.map((widget: any) => ({
          id: widget.id,
          dashboardId: widget.dashboard_id,
          title: widget.title,
          type: widget.type,
          position: this.normalizePosition(widget.position),
          query: widget.query_text || '',
          chartType: this.normalizeChartType(widget.chart_type),
          config: (widget.config || {}) as Record<string, unknown>,
          createdAt: new Date(widget.created_at).toISOString(),
          updatedAt: new Date(widget.updated_at).toISOString()
        }))
      };
    }

    const found = this.inMemoryDashboards.find(
      (dashboard) => dashboard.id === safeDashboardId && dashboard.userId === safeUserId
    );
    if (!found) {
      throw new NotFoundException('Dashboard not found.');
    }

    return this.stripUserId(found);
  }

  async updateDashboard(dashboardId: string, payload: UpdateDashboardInput): Promise<Dashboard> {
    const safeDashboardId = this.requireDashboardId(dashboardId);
    const safeUserId = this.requireUserId(payload.userId);

    if (this.dbReady && this.pool) {
      const existing = await this.pool.query('SELECT id FROM app_dashboards WHERE id = $1 AND user_id = $2 LIMIT 1', [
        safeDashboardId,
        safeUserId
      ]);
      if (!existing.rowCount) {
        throw new NotFoundException('Dashboard not found.');
      }

      const nextName = payload.name?.trim();
      const nextDescription = payload.description?.trim();
      const nextDatasourceId =
        typeof payload.datasourceId === 'string' ? this.requireDatasourceId(payload.datasourceId) : null;
      if (typeof payload.name === 'string' && !nextName) {
        throw new BadRequestException('Dashboard name cannot be empty.');
      }

      await this.pool.query(
        `UPDATE app_dashboards
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             datasource_id = COALESCE($3, datasource_id),
             config = COALESCE($4::jsonb, config),
             updated_at = now()
         WHERE id = $5 AND user_id = $6`,
        [
          nextName || null,
          nextDescription || null,
          nextDatasourceId,
          payload.config ? JSON.stringify(payload.config) : null,
          safeDashboardId,
          safeUserId
        ]
      );

      return this.getDashboard(safeDashboardId, safeUserId);
    }

    const found = this.inMemoryDashboards.find(
      (dashboard) => dashboard.id === safeDashboardId && dashboard.userId === safeUserId
    );
    if (!found) {
      throw new NotFoundException('Dashboard not found.');
    }

    if (typeof payload.name === 'string') {
      const nextName = payload.name.trim();
      if (!nextName) {
        throw new BadRequestException('Dashboard name cannot be empty.');
      }
      found.name = nextName;
    }
    if (typeof payload.description === 'string') {
      found.description = payload.description.trim();
    }
    if (typeof payload.datasourceId === 'string') {
      found.datasourceId = this.requireDatasourceId(payload.datasourceId);
    }
    if (payload.config) {
      found.config = payload.config;
    }
    found.updatedAt = new Date().toISOString();

    return this.stripUserId(found);
  }

  async deleteDashboard(dashboardId: string, userId: string): Promise<{ ok: boolean }> {
    const safeDashboardId = this.requireDashboardId(dashboardId);
    const safeUserId = this.requireUserId(userId);

    if (this.dbReady && this.pool) {
      const deleted = await this.pool.query(
        'DELETE FROM app_dashboards WHERE id = $1 AND user_id = $2 RETURNING id',
        [safeDashboardId, safeUserId]
      );
      if (!deleted.rowCount) {
        throw new NotFoundException('Dashboard not found.');
      }
      return { ok: true };
    }

    const index = this.inMemoryDashboards.findIndex(
      (dashboard) => dashboard.id === safeDashboardId && dashboard.userId === safeUserId
    );
    if (index < 0) {
      throw new NotFoundException('Dashboard not found.');
    }
    this.inMemoryDashboards.splice(index, 1);
    return { ok: true };
  }

  async createWidget(dashboardId: string, payload: CreateWidgetInput): Promise<Dashboard> {
    const safeDashboardId = this.requireDashboardId(dashboardId);
    const safeUserId = this.requireUserId(payload.userId);
    const safeTitle = payload.title?.trim();
    if (!safeTitle) {
      throw new BadRequestException('Widget title is required.');
    }

    const safeType = this.normalizeWidgetType(payload.type);
    const safePosition = this.normalizePosition(payload.position);
    const now = new Date().toISOString();
    const widgetId = this.newId('wdg');

    if (this.dbReady && this.pool) {
      await this.assertDashboardExists(safeDashboardId, safeUserId);

      await this.pool.query(
        `INSERT INTO app_dashboard_widgets
         (id, dashboard_id, user_id, title, type, position, query_text, chart_type, config, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, $11)`,
        [
          widgetId,
          safeDashboardId,
          safeUserId,
          safeTitle,
          safeType,
          JSON.stringify(safePosition),
          payload.query?.trim() || '',
          this.normalizeChartType(payload.chartType),
          JSON.stringify(payload.config || {}),
          now,
          now
        ]
      );

      await this.touchDashboard(safeDashboardId, safeUserId);
      return this.getDashboard(safeDashboardId, safeUserId);
    }

    const dashboard = this.inMemoryDashboards.find(
      (item) => item.id === safeDashboardId && item.userId === safeUserId
    );
    if (!dashboard) {
      throw new NotFoundException('Dashboard not found.');
    }

    dashboard.widgets.push({
      id: widgetId,
      dashboardId: safeDashboardId,
      title: safeTitle,
      type: safeType,
      position: safePosition,
      query: payload.query?.trim() || '',
      chartType: this.normalizeChartType(payload.chartType),
      config: payload.config || {},
      createdAt: now,
      updatedAt: now
    });
    dashboard.updatedAt = now;
    return this.stripUserId(dashboard);
  }

  async updateWidget(dashboardId: string, widgetId: string, payload: UpdateWidgetInput): Promise<Dashboard> {
    const safeDashboardId = this.requireDashboardId(dashboardId);
    const safeWidgetId = this.requireWidgetId(widgetId);
    const safeUserId = this.requireUserId(payload.userId);

    if (this.dbReady && this.pool) {
      await this.assertDashboardExists(safeDashboardId, safeUserId);

      const existing = await this.pool.query(
        `SELECT id FROM app_dashboard_widgets
         WHERE id = $1 AND dashboard_id = $2 AND user_id = $3
         LIMIT 1`,
        [safeWidgetId, safeDashboardId, safeUserId]
      );
      if (!existing.rowCount) {
        throw new NotFoundException('Widget not found.');
      }

      const nextTitle = payload.title?.trim();
      if (typeof payload.title === 'string' && !nextTitle) {
        throw new BadRequestException('Widget title cannot be empty.');
      }

      const nextType = payload.type ? this.normalizeWidgetType(payload.type) : null;
      const nextPosition = payload.position ? this.normalizePosition(payload.position) : null;
      const nextQuery = typeof payload.query === 'string' ? payload.query.trim() : null;
      const nextChartType = payload.chartType ? this.normalizeChartType(payload.chartType) : null;
      const nextConfig = payload.config ? payload.config : null;

      await this.pool.query(
        `UPDATE app_dashboard_widgets
         SET title = COALESCE($1, title),
             type = COALESCE($2, type),
             position = COALESCE($3::jsonb, position),
             query_text = COALESCE($4, query_text),
             chart_type = COALESCE($5, chart_type),
             config = COALESCE($6::jsonb, config),
             updated_at = now()
         WHERE id = $7 AND dashboard_id = $8 AND user_id = $9`,
        [
          nextTitle || null,
          nextType,
          nextPosition ? JSON.stringify(nextPosition) : null,
          nextQuery,
          nextChartType,
          nextConfig ? JSON.stringify(nextConfig) : null,
          safeWidgetId,
          safeDashboardId,
          safeUserId
        ]
      );

      await this.touchDashboard(safeDashboardId, safeUserId);
      return this.getDashboard(safeDashboardId, safeUserId);
    }

    const dashboard = this.inMemoryDashboards.find(
      (item) => item.id === safeDashboardId && item.userId === safeUserId
    );
    if (!dashboard) {
      throw new NotFoundException('Dashboard not found.');
    }

    const widget = dashboard.widgets.find((item) => item.id === safeWidgetId);
    if (!widget) {
      throw new NotFoundException('Widget not found.');
    }

    if (typeof payload.title === 'string') {
      const nextTitle = payload.title.trim();
      if (!nextTitle) {
        throw new BadRequestException('Widget title cannot be empty.');
      }
      widget.title = nextTitle;
    }

    if (payload.type) widget.type = this.normalizeWidgetType(payload.type);
    if (payload.position) widget.position = this.normalizePosition(payload.position);
    if (typeof payload.query === 'string') widget.query = payload.query.trim();
    if (payload.chartType) widget.chartType = this.normalizeChartType(payload.chartType);
    if (payload.config) widget.config = payload.config;

    widget.updatedAt = new Date().toISOString();
    dashboard.updatedAt = widget.updatedAt;
    return this.stripUserId(dashboard);
  }

  async deleteWidget(dashboardId: string, widgetId: string, userId: string): Promise<Dashboard> {
    const safeDashboardId = this.requireDashboardId(dashboardId);
    const safeWidgetId = this.requireWidgetId(widgetId);
    const safeUserId = this.requireUserId(userId);

    if (this.dbReady && this.pool) {
      await this.assertDashboardExists(safeDashboardId, safeUserId);

      const deleted = await this.pool.query(
        `DELETE FROM app_dashboard_widgets
         WHERE id = $1 AND dashboard_id = $2 AND user_id = $3
         RETURNING id`,
        [safeWidgetId, safeDashboardId, safeUserId]
      );
      if (!deleted.rowCount) {
        throw new NotFoundException('Widget not found.');
      }

      await this.touchDashboard(safeDashboardId, safeUserId);
      return this.getDashboard(safeDashboardId, safeUserId);
    }

    const dashboard = this.inMemoryDashboards.find(
      (item) => item.id === safeDashboardId && item.userId === safeUserId
    );
    if (!dashboard) {
      throw new NotFoundException('Dashboard not found.');
    }

    const before = dashboard.widgets.length;
    dashboard.widgets = dashboard.widgets.filter((item) => item.id !== safeWidgetId);
    if (dashboard.widgets.length === before) {
      throw new NotFoundException('Widget not found.');
    }
    dashboard.updatedAt = new Date().toISOString();
    return this.stripUserId(dashboard);
  }

  private async assertDashboardExists(dashboardId: string, userId: string) {
    if (!this.pool) return;
    const result = await this.pool.query('SELECT id FROM app_dashboards WHERE id = $1 AND user_id = $2 LIMIT 1', [
      dashboardId,
      userId
    ]);
    if (!result.rowCount) {
      throw new NotFoundException('Dashboard not found.');
    }
  }

  private async touchDashboard(dashboardId: string, userId: string) {
    if (!this.pool) return;
    await this.pool.query('UPDATE app_dashboards SET updated_at = now() WHERE id = $1 AND user_id = $2', [
      dashboardId,
      userId
    ]);
  }

  private requireUserId(userId: string) {
    const safe = userId?.trim();
    if (!safe) {
      throw new BadRequestException('userId is required.');
    }
    return safe;
  }

  private requireDashboardId(dashboardId: string) {
    const safe = dashboardId?.trim();
    if (!safe) {
      throw new BadRequestException('dashboardId is required.');
    }
    return safe;
  }

  private requireDatasourceId(datasourceId: string) {
    const safe = datasourceId?.trim();
    if (!safe) {
      throw new BadRequestException('datasourceId is required.');
    }
    return safe;
  }

  private requireWidgetId(widgetId: string) {
    const safe = widgetId?.trim();
    if (!safe) {
      throw new BadRequestException('widgetId is required.');
    }
    return safe;
  }

  private normalizeWidgetType(type: WidgetType): WidgetType {
    if (['kpi', 'chart', 'table', 'text'].includes(type)) return type;
    return 'chart';
  }

  private normalizeChartType(value?: string): ChartType {
    if (value === 'line' || value === 'bar' || value === 'pie' || value === 'table') return value;
    return 'table';
  }

  private normalizePosition(position?: Partial<WidgetPosition> | null): WidgetPosition {
    const x = Number(position?.x ?? 0);
    const y = Number(position?.y ?? 0);
    const w = Number(position?.w ?? 6);
    const h = Number(position?.h ?? 4);

    return {
      x: Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0,
      y: Number.isFinite(y) ? Math.max(0, Math.floor(y)) : 0,
      w: Number.isFinite(w) ? Math.max(1, Math.floor(w)) : 6,
      h: Number.isFinite(h) ? Math.max(1, Math.floor(h)) : 4
    };
  }

  private stripUserId(dashboard: DashboardRecord): Dashboard {
    return {
      id: dashboard.id,
      datasourceId: dashboard.datasourceId || '',
      name: dashboard.name,
      description: dashboard.description,
      config: dashboard.config || {},
      createdAt: dashboard.createdAt,
      updatedAt: dashboard.updatedAt,
      widgets: dashboard.widgets
    };
  }

  private newId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  }
}
