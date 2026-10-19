import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Global: every feature module needs the DB; importing it everywhere is noise.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
