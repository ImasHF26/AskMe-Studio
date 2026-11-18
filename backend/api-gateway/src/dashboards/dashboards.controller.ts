import { Body, Controller, Delete, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { AppService } from '../app.service';

interface CreateDashboardBody {
  name: string;
  datasourceId: string;
  description?: string;
  config?: Record<string, unknown>;
}

interface UpdateDashboardBody {
  name?: string;
  datasourceId?: string;
  description?: string;
  config?: Record<string, unknown>;
}

interface WidgetPositionBody {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CreateDashboardWidgetBody {
  title: string;
  type: 'kpi' | 'chart' | 'table' | 'text';
  position?: WidgetPositionBody;
  query?: string;
  chartType?: 'line' | 'bar' | 'table';
  config?: Record<string, unknown>;
}

interface UpdateDashboardWidgetBody {
  title?: string;
  type?: 'kpi' | 'chart' | 'table' | 'text';
  position?: WidgetPositionBody;
  query?: string;
  chartType?: 'line' | 'bar' | 'table';
  config?: Record<string, unknown>;
}

@Controller()
export class DashboardsController {
  constructor(private readonly appService: AppService) {}

  @Get('/api/v1/dashboards')
  async dashboards(@Headers('authorization') authorization: string | undefined) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.listDashboards(user);
  }

  @Post('/api/v1/dashboards')
  async createDashboard(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateDashboardBody
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.createDashboard(user, body);
  }

  @Get('/api/v1/dashboards/:dashboardId')
  async dashboard(
    @Headers('authorization') authorization: string | undefined,
    @Param('dashboardId') dashboardId: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.getDashboard(user, dashboardId);
  }

  @Put('/api/v1/dashboards/:dashboardId')
  async updateDashboard(
    @Headers('authorization') authorization: string | undefined,
    @Param('dashboardId') dashboardId: string,
    @Body() body: UpdateDashboardBody
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.updateDashboard(user, dashboardId, body);
  }

  @Delete('/api/v1/dashboards/:dashboardId')
  async deleteDashboard(
    @Headers('authorization') authorization: string | undefined,
    @Param('dashboardId') dashboardId: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.deleteDashboard(user, dashboardId);
  }

  @Post('/api/v1/dashboards/:dashboardId/widgets')
  async createDashboardWidget(
    @Headers('authorization') authorization: string | undefined,
    @Param('dashboardId') dashboardId: string,
    @Body() body: CreateDashboardWidgetBody
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.createDashboardWidget(user, dashboardId, body);
  }

  @Put('/api/v1/dashboards/:dashboardId/widgets/:widgetId')
  async updateDashboardWidget(
    @Headers('authorization') authorization: string | undefined,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @Body() body: UpdateDashboardWidgetBody
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.updateDashboardWidget(user, dashboardId, widgetId, body);
  }

  @Delete('/api/v1/dashboards/:dashboardId/widgets/:widgetId')
  async deleteDashboardWidget(
    @Headers('authorization') authorization: string | undefined,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string
  ) {
    const user = this.appService.requireAuthUser(this.extractBearer(authorization));
    return this.appService.deleteDashboardWidget(user, dashboardId, widgetId);
  }

  private extractBearer(authorization?: string): string {
    if (!authorization) return '';
    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer') return '';
    return token || '';
  }
}
