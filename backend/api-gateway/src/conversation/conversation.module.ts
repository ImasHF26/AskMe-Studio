import { Module } from '@nestjs/common';
import { ConversationContextResolver } from './conversation-context-resolver.service';
import { ConversationMemoryService } from './conversation-memory.service';

@Module({
  providers: [ConversationMemoryService, ConversationContextResolver],
  exports: [ConversationMemoryService, ConversationContextResolver]
})
export class ConversationModule {}
