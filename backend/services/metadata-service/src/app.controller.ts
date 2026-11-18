import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';

interface ProfileBody {
  type: 'postgresql' | 'mongodb' | 'csv' | 'excel';
  credentials?: Record<string, unknown>;
  connectionConfig?: Record<string, unknown>;
  tableName?: string;
  limit?: number;
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/health')
  health() {
    return this.appService.getHealth();
  }

  @Post('/profile/tables')
  tables(@Body() body: ProfileBody) {
    return this.appService.listTables(body);
  }

  @Post('/profile/columns')
  columns(@Body() body: ProfileBody) {
    return this.appService.getColumns(body);
  }

  @Post('/profile/preview')
  preview(@Body() body: ProfileBody) {
    return this.appService.getPreview(body);
  }

  @Post('/profile/stats')
  stats(@Body() body: ProfileBody) {
    return this.appService.getStats(body);
  }
}
