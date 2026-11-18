import { Module } from '@nestjs/common';
import { ApiGatewayCoreModule } from '../common/api-gateway-core.module';
import { DashboardsController } from './dashboards.controller';

@Module({
  imports: [ApiGatewayCoreModule],
  controllers: [DashboardsController]
})
export class DashboardsModule {}
