import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/health')
  health() {
    return this.appService.health();
  }

  @Get('/policy')
  policy() {
    return this.appService.policy();
  }

  @Post('/intent/analyze')
  analyzeIntent(@Body() body: { question: string; semanticLayer?: unknown }) {
    return this.appService.analyzeIntent(body as any);
  }
}
