import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ApiGatewayCoreModule } from './common/api-gateway-core.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { DatasourcesModule } from './datasources/datasources.module';
import { SemanticLayerModule } from './semantic-layer/semantic-layer.module';
import { TextToSqlModule } from './text-to-sql/text-to-sql.module';

@Module({
  imports: [
    ApiGatewayCoreModule,
    AuthModule,
    DatasourcesModule,
    SemanticLayerModule,
    DashboardsModule,
    TextToSqlModule
  ],
  controllers: [AppController]
})
export class AppModule {}
