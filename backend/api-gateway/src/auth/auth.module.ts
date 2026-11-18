import { Module } from '@nestjs/common';
import { ApiGatewayCoreModule } from '../common/api-gateway-core.module';
import { AuthController } from './auth.controller';

@Module({
  imports: [ApiGatewayCoreModule],
  controllers: [AuthController]
})
export class AuthModule {}
