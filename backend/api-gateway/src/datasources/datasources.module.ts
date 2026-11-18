import { Module } from '@nestjs/common';
import { ApiGatewayCoreModule } from '../common/api-gateway-core.module';
import { DatasourcesController } from './datasources.controller';

@Module({
  imports: [ApiGatewayCoreModule],
  controllers: [DatasourcesController]
})
export class DatasourcesModule {}
