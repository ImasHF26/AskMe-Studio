import { Module } from '@nestjs/common';
import { ApiGatewayCoreModule } from '../common/api-gateway-core.module';
import { SemanticLayerController } from './semantic-layer.controller';
import { SemanticMcpEnricherService } from './semantic-mcp-enricher.service';

@Module({
  imports: [ApiGatewayCoreModule],
  controllers: [SemanticLayerController],
  providers: [SemanticMcpEnricherService],
  exports: [SemanticMcpEnricherService]
})
export class SemanticLayerModule {}
