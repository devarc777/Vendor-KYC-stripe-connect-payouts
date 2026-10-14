import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PaymentsModule } from './payments/payments.module';
import { VendorsModule } from './vendors/vendors.module';
import { PayoutsModule } from './payouts/payouts.module';
import { UploadsModule } from './uploads/uploads.module';
import { MailModule } from './mail/mail.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    MailModule,
    PaymentsModule,
    UploadsModule,
    AiModule,
    VendorsModule,
    PayoutsModule,
  ],
})
export class AppModule {}
