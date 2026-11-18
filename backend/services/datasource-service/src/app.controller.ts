import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';

interface TestDatasourceBody {
  type: 'postgresql' | 'mongodb' | 'csv' | 'excel';
  name?: string;
  credentials?: Record<string, unknown>;
  connectionConfig?: Record<string, unknown>;
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/health')
  health() {
    return this.appService.getHealth();
  }

  @Post('/connections/test')
  async testConnection(@Body() body: TestDatasourceBody) {
    return this.appService.testConnection(body);
  }
}
