import { Module } from '@nestjs/common';
import { AppService } from '../app.service';
import { AuthService } from '../auth/auth.service';
import { ConversationModule } from '../conversation/conversation.module';
import { DatasourceConnectionService } from '../datasources/datasource-connection.service';
import { DatasourceManagerService } from '../datasources/datasource-manager.service';
import { SemanticVectorService } from '../semantic-layer/semantic-vector.service';
import { SemanticModelingService } from '../semantic-layer/semantic-modeling.service';
import { SqlSecurityGuardService } from '../copilot/sql-security-guard.service';
import { QueryExecutionService } from '../copilot/query-execution.service';
import { StatisticalForecastService } from '../copilot/statistical-forecast.service';
import { TextToSqlGeneratorService } from '../copilot/text-to-sql-generator.service';
import { DatasourceCryptoService } from './crypto/datasource-crypto.service';
import { DatabaseService } from './database/database.service';

@Module({
  imports: [ConversationModule],
  providers: [
    AppService,
    AuthService,
    DatasourceManagerService,
    SemanticVectorService,
    SemanticModelingService,
    SqlSecurityGuardService,
    QueryExecutionService,
    StatisticalForecastService,
    TextToSqlGeneratorService,
    DatabaseService,
    DatasourceCryptoService,
    DatasourceConnectionService
  ],
  exports: [
    AppService,
    AuthService,
    DatasourceManagerService,
    SemanticVectorService,
    SemanticModelingService,
    SqlSecurityGuardService,
    QueryExecutionService,
    StatisticalForecastService,
    TextToSqlGeneratorService,
    DatabaseService,
    DatasourceCryptoService,
    DatasourceConnectionService
  ]
})
export class ApiGatewayCoreModule {}
