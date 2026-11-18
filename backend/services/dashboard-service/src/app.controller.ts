import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AppService } from './app.service';

interface CreateDashboardBody {
  userId: string;
  datasourceId: string;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
}

interface UpdateDashboardBody {
  userId: string;
  datasourceId?: string;
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
}

interface CreateWidgetBody {
  userId: string;
  title: string;
  type: 'kpi' | 'chart' | 'table' | 'text';
  position?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  query?: string;
  chartType?: 'line' | 'bar' | 'pie' | 'table';
  config?: Record<string, unknown>;
}

interface UpdateWidgetBody {
  userId: string;
  title?: string;
  type?: 'kpi' | 'chart' | 'table' | 'text';
  position?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  query?: string;
  chartType?: 'line' | 'bar' | 'pie' | 'table';
  config?: Record<string, unknown>;
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/health')
  health() {
    return this.appService.getHealth();
  }

  @Get('/dashboards')
  listDashboards(@Query('userId') userId: string) {
    return this.appService.listDashboards(userId);
  }

  @Post('/dashboards')
  createDashboard(@Body() body: CreateDashboardBody) {
    return this.appService.createDashboard(body);
  }

  @Get('/dashboards/:id')
  getDashboard(@Param('id') id: string, @Query('userId') userId: string) {
    return this.appService.getDashboard(id, userId);
  }

  @Put('/dashboards/:id')
  updateDashboard(@Param('id') id: string, @Body() body: UpdateDashboardBody) {
    return this.appService.updateDashboard(id, body);
  }

  @Delete('/dashboards/:id')
  deleteDashboard(@Param('id') id: string, @Query('userId') userId: string) {
    return this.appService.deleteDashboard(id, userId);
  }

  @Post('/dashboards/:id/widgets')
  createWidget(@Param('id') id: string, @Body() body: CreateWidgetBody) {
    return this.appService.createWidget(id, body);
  }

  @Put('/dashboards/:id/widgets/:widgetId')
  updateWidget(
    @Param('id') id: string,
    @Param('widgetId') widgetId: string,
    @Body() body: UpdateWidgetBody
  ) {
    return this.appService.updateWidget(id, widgetId, body);
  }

  @Delete('/dashboards/:id/widgets/:widgetId')
  deleteWidget(
    @Param('id') id: string,
    @Param('widgetId') widgetId: string,
    @Query('userId') userId: string
  ) {
    return this.appService.deleteWidget(id, widgetId, userId);
  }
}
