import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VendorsService } from '../vendors/vendors.service';
import { AdminGuard } from '../admin/admin.guard';

@Controller('payouts')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(
    private readonly payoutsService: PayoutsService,
    private readonly vendorsService: VendorsService,
  ) {}

  /**
   * Get vendor's available balance
   */
  @Get('balance')
  async getBalance(@Req() req: any) {
    try {
      const vendor = await this.vendorsService.findByUserId(req.user.id);
      if (!vendor) {
        throw new HttpException('Vendor not found', HttpStatus.NOT_FOUND);
      }

      const balance = await this.payoutsService.getAvailableBalance(vendor.id);
      return { balance };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get balance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Request a payout
   */
  @Post('request')
  async requestPayout(@Req() req: any, @Body() body: { amount: number }) {
    try {
      if (!body.amount || body.amount <= 0) {
        throw new HttpException('Invalid amount', HttpStatus.BAD_REQUEST);
      }

      const vendor = await this.vendorsService.findByUserId(req.user.id);
      if (!vendor) {
        throw new HttpException('Vendor not found', HttpStatus.NOT_FOUND);
      }

      const payout = await this.payoutsService.requestPayout(
        vendor.id,
        body.amount,
      );
      return payout;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to request payout',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get payout history
   */
  @Get('history')
  async getHistory(@Req() req: any) {
    try {
      const vendor = await this.vendorsService.findByUserId(req.user.id);
      if (!vendor) {
        throw new HttpException('Vendor not found', HttpStatus.NOT_FOUND);
      }

      const history = await this.payoutsService.getPayoutHistory(vendor.id);
      return history;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get payout history',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get payout by ID
   */
  @Get(':id')
  async getPayout(@Req() req: any, @Param('id') id: string) {
    try {
      const vendor = await this.vendorsService.findByUserId(req.user.id);
      if (!vendor) {
        throw new HttpException('Vendor not found', HttpStatus.NOT_FOUND);
      }

      const payout = await this.payoutsService.getPayoutById(id, vendor.id);
      return payout;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get payout',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get organizer's available balance
   */
  @Get('organizer/balance')
  async getOrganizerBalance(@Req() req: any) {
    try {
      if (req.user.role !== 'ORGANIZER') {
        throw new HttpException(
          'Only organizers can access this endpoint',
          HttpStatus.FORBIDDEN,
        );
      }

      const balance = await this.payoutsService.getOrganizerAvailableBalance(
        req.user.id,
      );
      return { balance };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get balance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Request a payout for organizer
   */
  @Post('organizer/request')
  async requestOrganizerPayout(
    @Req() req: any,
    @Body() body: { amount: number },
  ) {
    try {
      if (req.user.role !== 'ORGANIZER') {
        throw new HttpException(
          'Only organizers can request payouts',
          HttpStatus.FORBIDDEN,
        );
      }

      if (!body.amount || body.amount <= 0) {
        throw new HttpException('Invalid amount', HttpStatus.BAD_REQUEST);
      }

      const payout = await this.payoutsService.requestOrganizerPayout(
        req.user.id,
        body.amount,
      );
      return payout;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to request payout',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get organizer's payout history
   */
  @Get('organizer/history')
  async getOrganizerHistory(@Req() req: any) {
    try {
      if (req.user.role !== 'ORGANIZER') {
        throw new HttpException(
          'Only organizers can access this endpoint',
          HttpStatus.FORBIDDEN,
        );
      }

      const history = await this.payoutsService.getOrganizerPayoutHistory(
        req.user.id,
      );
      return history;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get payout history',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get payout by ID for organizer
   */
  @Get('organizer/:id')
  async getOrganizerPayout(@Req() req: any, @Param('id') id: string) {
    try {
      if (req.user.role !== 'ORGANIZER') {
        throw new HttpException(
          'Only organizers can access this endpoint',
          HttpStatus.FORBIDDEN,
        );
      }

      const payout = await this.payoutsService.getOrganizerPayoutById(
        id,
        req.user.id,
      );
      return payout;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get payout',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Process queued payouts (admin only)
   * This endpoint processes all pending payouts that are waiting for platform funds
   */
  @Post('process-queued')
  @UseGuards(AdminGuard)
  async processQueuedPayouts() {
    try {
      const result = await this.payoutsService.processQueuedPayouts();
      return {
        success: true,
        ...result,
        message: `Processed ${result.processed} payouts, ${result.failed} failed`,
      };
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Failed to process queued payouts',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
