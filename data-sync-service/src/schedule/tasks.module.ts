import { CacheModule, Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { L1IngestionModule } from '../l1Ingestion/l1Ingestion.module';
import { L2IngestionModule } from '../l2Ingestion/l2Ingestion.module';
import { EigenlayerModule } from '../grpc/eigenlayer.module';

@Module({
  imports: [
    CacheModule.register(),
    L1IngestionModule,
    L2IngestionModule,
    EigenlayerModule,
  ],
  providers: [TasksService],
})
export class TasksModule {}
