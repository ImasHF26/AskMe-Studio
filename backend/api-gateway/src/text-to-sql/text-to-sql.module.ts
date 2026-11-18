import { Module } from '@nestjs/common';
import { ApiGatewayCoreModule } from '../common/api-gateway-core.module';
import { TextToSqlController } from './text-to-sql.controller';

@Module({
  imports: [ApiGatewayCoreModule],
  controllers: [TextToSqlController]
})
export class TextToSqlModule {}
