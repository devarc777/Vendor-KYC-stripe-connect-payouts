import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripePaymentService } from '../payments/stripe-payment.service';

@Injectable()
export class PayoutsService {
  constructor(
    private prisma: PrismaService,
    private stripePaymentService: StripePaymentService,
  ) {}

    // get vendor's available balance from database (completed work orders that haven't been paid out)
  async getAvailableBalance(vendorId: string): Promise<number> {
    try {
      // database is the single source of truth for earnings
      const completedWorkOrders = await this.prisma.workOrder.findMany({
        where: {
          vendorId,
          status: 'COMPLETED',
          paymentStatus: 'COMPLETED',
        },
        include: {
          serviceBid: {
            select: {
              bidAmount: true,
            },
          },
          quoteRequest: {
            select: {
              finalPrice: true,
              counterOfferPrice: true,
              quotePrice: true,
            },
          },
        },
      });

      // Calculate total revenue
      let totalRevenue = 0;
      for (const workOrder of completedWorkOrders) {
        if (workOrder.serviceBid) {
          totalRevenue += Number(workOrder.serviceBid.bidAmount || 0);
        } else if (workOrder.quoteRequest) {
          const amount =
            workOrder.quoteRequest.finalPrice ||
            workOrder.quoteRequest.counterOfferPrice ||
            workOrder.quoteRequest.quotePrice;
          totalRevenue += Number(amount || 0);
        }
      }

      // get total amount already paid out or pending (includes requested withdrawals)
      const paidOutAmount = await this.prisma.payout.aggregate({
        where: {
          vendorId,
          status: {
            in: ['PENDING', 'PROCESSING', 'PAID'],
          },
        },
        _sum: {
          amount: true,
        },
      });

      const totalPaidOut = Number(paidOutAmount._sum.amount || 0);

      // Available balance = total revenue - total paid out
      const availableBalance = totalRevenue - totalPaidOut;

      console.log(
        `💰 Vendor balance calculation: Revenue=$${totalRevenue.toFixed(2)}, Paid Out=$${totalPaidOut.toFixed(2)}, Available=$${availableBalance.toFixed(2)}`,
      );

      return Math.max(0, availableBalance); // Ensure non-negative
    } catch (error: any) {
      console.error('Error calculating available balance:', error);
      throw new HttpException(
        'Failed to calculate available balance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

    // request a payout using Separate Charges + Transfers model:
  async requestPayout(vendorId: string, amount: number): Promise<any> {
    try {
      // Validate vendor exists and has Stripe Connect account
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: vendorId },
        select: {
          id: true,
          stripeAccountId: true,
          stripeConnectEnabled: true,
          businessName: true,
          email: true,
        },
      });

      if (!vendor) {
        throw new HttpException('Vendor not found', HttpStatus.NOT_FOUND);
      }

      if (!vendor.stripeAccountId || !vendor.stripeConnectEnabled) {
        throw new HttpException(
          'Stripe Connect account not set up. Please complete onboarding first.',
          HttpStatus.BAD_REQUEST,
        );
      }

      // check available balance (from database)
      const availableBalance = await this.getAvailableBalance(vendorId);
      if (amount > availableBalance) {
        throw new HttpException(
          `Insufficient balance. Available: $${availableBalance.toFixed(2)}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      if (amount < 1) {
        throw new HttpException(
          'Minimum payout amount is $1.00',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Convert amount to cents for Stripe
      const amountInCents = Math.round(amount * 100);

      console.log(
        `💰 Processing withdrawal request: Vendor=${vendor.businessName}, Amount=$${amount.toFixed(2)}`,
      );

      // create payout record
      const payout = await this.prisma.payout.create({
        data: {
          vendorId,
          amount,
          currency: 'USD',
          status: 'PENDING',
        },
      });

      try {
        // STEP 1: Check if vendor's account can receive payouts
        console.log('🔍 Checking vendor Stripe account status...');
        try {
          const accountStatus =
            await this.stripePaymentService.getAccountStatus(
              vendor.stripeAccountId,
            );
          console.log('📊 Vendor account status:', {
            payoutsEnabled: accountStatus.payouts_enabled,
            chargesEnabled: accountStatus.charges_enabled,
            detailsSubmitted: accountStatus.details_submitted,
          });

          if (!accountStatus.payouts_enabled) {
            throw new HttpException(
              'Payouts are not enabled for your Stripe account. Please complete your Stripe Connect onboarding and connect a bank account in your Stripe Dashboard.',
              HttpStatus.BAD_REQUEST,
            );
          }
        } catch (statusError: any) {
          if (statusError instanceof HttpException) {
            throw statusError;
          }
          console.warn(
            '⚠️ Could not check account status:',
            statusError.message,
          );
          // Continue - Stripe will validate when we try the transfer
        }

        // STEP 1.5: Check platform account balance before attempting transfer
        console.log('💰 Checking platform account balance...');
        let hasAvailableBalance = false;
        let pendingBalance = 0;
        try {
          const platformBalance = await this.stripePaymentService.getBalance();
          const availableBalance = platformBalance.available[0]?.amount || 0; // Amount in cents
          pendingBalance = platformBalance.pending[0]?.amount || 0; // Amount in cents
          const availableBalanceDollars = availableBalance / 100;
          const pendingBalanceDollars = pendingBalance / 100;

          console.log(
            `💰 Platform account balance - Available: $${availableBalanceDollars.toFixed(2)}, Pending: $${pendingBalanceDollars.toFixed(2)}`,
          );

          hasAvailableBalance = availableBalance >= amountInCents;

          if (!hasAvailableBalance) {
            console.log(
              `⚠️ Insufficient platform balance. Will queue withdrawal for processing when funds become available.`,
            );
          }
        } catch (balanceError: any) {
          console.warn(
            '⚠️ Could not check platform balance, will attempt transfer anyway:',
            balanceError.message,
          );
          hasAvailableBalance = false; // Assume insufficient, will try anyway
        }

        // update payout record with queued status if needed
        if (!hasAvailableBalance) {
          await this.prisma.payout.update({
            where: { id: payout.id },
            data: {
              failureMessage:
                'Queued: Waiting for platform funds to become available',
            },
          });
        }

        // If balance is available, process immediately
        if (hasAvailableBalance) {
          // STEP 2: Transfer funds from platform account to vendor's Stripe Connect account
          console.log(
            `💸 Transferring $${amount.toFixed(2)} from platform to vendor's Stripe account...`,
          );

          const transfer =
            await this.stripePaymentService.transferToConnectAccount({
              amount: amountInCents,
              currency: 'usd',
              destination: vendor.stripeAccountId,
              metadata: {
                vendorId,
                payoutId: payout.id,
                type: 'vendor_withdrawal',
                vendorName: vendor.businessName,
              },
            });

          console.log('✅ Transfer completed:', {
            transferId: transfer.id,
            amount: transfer.amount,
            destination: transfer.destination,
          });

          // update payout record with transfer ID
          await this.prisma.payout.update({
            where: { id: payout.id },
            data: {
              stripeTransferId: transfer.id,
              status: 'PROCESSING',
            },
          });

          // STEP 3: Wait a moment for transfer to be available (Stripe processes instantly but let's be safe)
          console.log('⏳ Waiting for transfer to settle...');
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second wait

          // STEP 4: Create payout from vendor's Stripe account to their bank
          console.log(
            '🏦 Creating payout from vendor Stripe account to bank...',
          );

          const stripePayout = await this.stripePaymentService.createPayout({
            amount: amountInCents,
            currency: 'usd',
            accountId: vendor.stripeAccountId,
            metadata: {
              vendorId,
              payoutId: payout.id,
              transferId: transfer.id,
              type: 'vendor_payout',
            },
          });

          console.log('✅ Payout created:', {
            payoutId: stripePayout.id,
            status: stripePayout.status,
            amount: stripePayout.amount,
          });

          // update payout record with final status
          const updatedPayout = await this.prisma.payout.update({
            where: { id: payout.id },
            data: {
              stripePayoutId: stripePayout.id,
              status: stripePayout.status === 'paid' ? 'PAID' : 'PROCESSING',
              paidAt: stripePayout.status === 'paid' ? new Date() : null,
              failureMessage: null,
            },
          });

          console.log('✅ Withdrawal completed successfully!');
          return updatedPayout;
        } else {
          // Balance insufficient - queue for later processing
          console.log(
            `📋 Withdrawal queued. Payout ID: ${payout.id}. Will be processed when platform funds become available.`,
          );
          return {
            ...payout,
            queued: true,
            message:
              pendingBalance > 0
                ? `Withdrawal queued. Funds are processing (Pending: $${(pendingBalance / 100).toFixed(2)}). Will be processed automatically when funds become available (typically 1-2 business days).`
                : `Withdrawal queued. Will be processed automatically when platform funds become available.`,
          };
        }
      } catch (stripeError: any) {
        // update payout status to FAILED
        await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: 'FAILED',
            failureCode: stripeError.code || 'STRIPE_ERROR',
            failureMessage: stripeError.message || 'Unknown error',
          },
        });

        console.error('❌ Withdrawal failed:', stripeError);
        console.error('❌ Error details:', {
          message: stripeError.message,
          code: stripeError.code,
          type: stripeError.type,
        });

        // Provide helpful error messages
        let errorMessage = stripeError.message || 'Unknown error';

        if (
          stripeError.message?.includes('insufficient') ||
          stripeError.code === 'insufficient_funds'
        ) {
          errorMessage = `Insufficient funds in platform account. This usually means the platform needs to be funded. Please contact support. (Technical: ${stripeError.message})`;
        } else if (
          stripeError.message?.includes('account') ||
          stripeError.message?.includes('bank')
        ) {
          errorMessage = `Bank account issue: ${stripeError.message}. Please check your Stripe Connect account settings and ensure a bank account is connected.`;
        }

        throw new HttpException(
          `Withdrawal failed: ${errorMessage}`,
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error requesting withdrawal:', error);
      throw new HttpException(
        error.message || 'Failed to process withdrawal',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

    // get vendor's payout history
  async getPayoutHistory(vendorId: string): Promise<any[]> {
    try {
      const payouts = await this.prisma.payout.findMany({
        where: { vendorId },
        orderBy: { createdAt: 'desc' },
      });

      return payouts;
    } catch (error: any) {
      console.error('Error fetching payout history:', error);
      throw new HttpException(
        'Failed to fetch payout history',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

    // get payout by ID
  async getPayoutById(payoutId: string, vendorId: string): Promise<any> {
    try {
      const payout = await this.prisma.payout.findFirst({
        where: {
          id: payoutId,
          vendorId,
        },
      });

      if (!payout) {
        throw new HttpException('Payout not found', HttpStatus.NOT_FOUND);
      }

      return payout;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error fetching payout:', error);
      throw new HttpException(
        'Failed to fetch payout',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

    // sync payout status from Stripe (for webhook handling)
  async syncPayoutStatus(
    payoutId: string,
    stripePayoutId: string,
    accountId: string,
  ): Promise<void> {
    try {
      const payout = await this.prisma.payout.findUnique({
        where: { id: payoutId },
      });

      if (!payout) {
        console.error('Payout not found:', payoutId);
        return;
      }

      const stripePayout = await this.stripePaymentService.getPayoutStatus(
        stripePayoutId,
        accountId,
      );

      let status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELED' =
        'PENDING';
      if (stripePayout.status === 'paid') {
        status = 'PAID';
      } else if (stripePayout.status === 'pending') {
        status = 'PROCESSING';
      } else if (
        stripePayout.status === 'failed' ||
        stripePayout.status === 'canceled'
      ) {
        status = stripePayout.status === 'failed' ? 'FAILED' : 'CANCELED';
      }

      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status,
          paidAt:
            stripePayout.status === 'paid'
              ? new Date(stripePayout.arrival_date * 1000)
              : null,
          failureCode: stripePayout.failure_code || null,
          failureMessage: stripePayout.failure_message || null,
        },
      });

      console.log('✅ Payout status synced:', payoutId, status);
    } catch (error: any) {
      console.error('Error syncing payout status:', error);
    }
  }

    // get organizer's available balance (completed ticket sales that haven't been paid out)
  async getOrganizerAvailableBalance(organizerId: string): Promise<number> {
    try {
      // get all completed bookings for organizer's events
      const completedBookings = await this.prisma.booking.findMany({
        where: {
          paymentStatus: 'COMPLETED',
          event: {
            organizerId,
          },
        },
        select: {
          id: true,
          totalAmount: true,
          fees: true,
        },
      });

      // Calculate total revenue (subtotal from bookings, excluding platform fees)
      let totalRevenue = 0;
      for (const booking of completedBookings) {
        const fees = booking.fees as any;
        const subtotal = fees?.subtotal || Number(booking.totalAmount) * 0.9; // If no fees breakdown, assume 90% is organizer's
        totalRevenue += Number(subtotal);
      }

      // get total amount already paid out or pending (includes requested withdrawals)
      const paidOutAmount = await this.prisma.payout.aggregate({
        where: {
          organizerId,
          status: {
            in: ['PAID', 'PROCESSING'],
          },
        },
        _sum: {
          amount: true,
        },
      });

      const totalPaidOut = Number(paidOutAmount._sum?.amount || 0);

      // Available balance = total revenue - total paid out
      const availableBalance = totalRevenue - totalPaidOut;

      return Math.max(0, availableBalance); // Ensure non-negative
    } catch (error: any) {
      console.error('Error calculating organizer available balance:', error);
      throw new HttpException(
        'Failed to calculate available balance',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

    // request a payout for organizer (transfer funds to organizer's Connect account and create payout)
  async requestOrganizerPayout(
    organizerId: string,
    amount: number,
  ): Promise<any> {
    try {
      // Validate organizer exists and has Stripe Connect account
      const organizer = await this.prisma.user.findUnique({
        where: { id: organizerId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          stripeAccountId: true,
          stripeConnectEnabled: true,
          role: true,
        },
      });

      if (!organizer) {
        throw new HttpException('Organizer not found', HttpStatus.NOT_FOUND);
      }

      if (organizer.role !== 'ORGANIZER') {
        throw new HttpException(
          'User is not an organizer',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!organizer.stripeAccountId || !organizer.stripeConnectEnabled) {
        throw new HttpException(
          'Stripe Connect account not set up. Please complete onboarding first.',
          HttpStatus.BAD_REQUEST,
        );
      }

      // check available balance
      const availableBalance =
        await this.getOrganizerAvailableBalance(organizerId);
      if (amount > availableBalance) {
        throw new HttpException(
          `Insufficient balance. Available: $${availableBalance.toFixed(2)}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      if (amount < 1) {
        throw new HttpException(
          'Minimum payout amount is $1.00',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Convert amount to cents for Stripe
      const amountInCents = Math.round(amount * 100);

      // check platform account balance before attempting transfer
      let hasAvailableBalance = false;
      let pendingBalance = 0;
      try {
        const platformBalance = await this.stripePaymentService.getBalance();
        const availableBalance = platformBalance.available[0]?.amount || 0; // Amount in cents
        pendingBalance = platformBalance.pending[0]?.amount || 0; // Amount in cents
        const availableBalanceDollars = availableBalance / 100;
        const pendingBalanceDollars = pendingBalance / 100;

        console.log(
          `💰 Platform account balance - Available: $${availableBalanceDollars.toFixed(2)}, Pending: $${pendingBalanceDollars.toFixed(2)}`,
        );

        hasAvailableBalance = availableBalance >= amountInCents;

        if (!hasAvailableBalance) {
          console.log(
            `⚠️ Insufficient platform balance. Will queue withdrawal for processing when funds become available.`,
          );
        }
      } catch (balanceError: any) {
        console.warn(
          '⚠️ Could not check platform balance, will attempt transfer anyway:',
          balanceError.message,
        );
        hasAvailableBalance = false; // Assume insufficient, will try anyway
      }

      // create payout record (always create, even if balance is insufficient)
      const payout = await this.prisma.payout.create({
        data: {
          organizerId,
          amount,
          currency: 'USD',
          status: 'PENDING',
          failureMessage: hasAvailableBalance
            ? null
            : 'Queued: Waiting for platform funds to become available',
        },
      });

      // If balance is available, process immediately
      if (hasAvailableBalance) {
        try {
          // Step 1: Transfer funds from platform to organizer's Connect account
          console.log('💸 Transferring funds to organizer Connect account...');
          const transfer =
            await this.stripePaymentService.transferToConnectAccount({
              amount: amountInCents,
              currency: 'usd',
              destination: organizer.stripeAccountId,
              metadata: {
                organizerId,
                payoutId: payout.id,
                type: 'organizer_payout',
              },
            });

          // Step 2: Create payout from organizer's Connect account to their bank
          console.log('💰 Creating payout to organizer bank account...');
          const stripePayout = await this.stripePaymentService.createPayout({
            amount: amountInCents,
            currency: 'usd',
            accountId: organizer.stripeAccountId,
            metadata: {
              organizerId,
              payoutId: payout.id,
              transferId: transfer.id,
            },
          });

          // update payout record with Stripe IDs
          const updatedPayout = await this.prisma.payout.update({
            where: { id: payout.id },
            data: {
              stripeTransferId: transfer.id,
              stripePayoutId: stripePayout.id,
              status: stripePayout.status === 'paid' ? 'PAID' : 'PROCESSING',
              paidAt: stripePayout.status === 'paid' ? new Date() : null,
              failureMessage: null,
            },
          });

          console.log(
            '✅ Organizer payout request processed:',
            updatedPayout.id,
          );
          return updatedPayout;
        } catch (stripeError: any) {
          // update payout status to FAILED
          await this.prisma.payout.update({
            where: { id: payout.id },
            data: {
              status: 'FAILED',
              failureCode: stripeError.code || 'STRIPE_ERROR',
              failureMessage: stripeError.message || 'Unknown error',
            },
          });

          console.error('❌ Stripe payout error:', stripeError);
          throw new HttpException(
            `Payout failed: ${stripeError.message || 'Unknown error'}`,
            HttpStatus.BAD_REQUEST,
          );
        }
      } else {
        // Balance insufficient - queue for later processing
        console.log(
          `📋 Withdrawal queued. Payout ID: ${payout.id}. Will be processed when platform funds become available.`,
        );
        return {
          ...payout,
          queued: true,
          message:
            pendingBalance > 0
              ? `Withdrawal queued. Funds are processing (Pending: $${(pendingBalance / 100).toFixed(2)}). Will be processed automatically when funds become available (typically 1-2 business days).`
              : `Withdrawal queued. Will be processed automatically when platform funds become available.`,
        };
      }
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error requesting organizer payout:', error);
      throw new HttpException(
        error.message || 'Failed to request payout',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

    // get organizer's payout history
  async getOrganizerPayoutHistory(organizerId: string): Promise<any[]> {
    try {
      const payouts = await this.prisma.payout.findMany({
        where: { organizerId },
        orderBy: { createdAt: 'desc' },
      });

      return payouts;
    } catch (error: any) {
      console.error('Error fetching organizer payout history:', error);
      throw new HttpException(
        'Failed to fetch payout history',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

    // get payout by ID for organizer
  async getOrganizerPayoutById(
    payoutId: string,
    organizerId: string,
  ): Promise<any> {
    try {
      const payout = await this.prisma.payout.findFirst({
        where: {
          id: payoutId,
          organizerId,
        },
      });

      if (!payout) {
        throw new HttpException('Payout not found', HttpStatus.NOT_FOUND);
      }

      return payout;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error fetching organizer payout:', error);
      throw new HttpException(
        'Failed to fetch payout',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

    // process queued payouts (for organizer and vendor) when platform funds become available
  async processQueuedPayouts(): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    try {
      // get all pending payouts that don't have Stripe IDs yet (queued payouts)
      const queuedPayouts = await this.prisma.payout.findMany({
        where: {
          status: 'PENDING',
          stripeTransferId: null,
          stripePayoutId: null,
        },
        include: {
          organizer: {
            select: {
              id: true,
              stripeAccountId: true,
              stripeConnectEnabled: true,
            },
          },
          vendor: {
            select: {
              id: true,
              stripeAccountId: true,
              stripeConnectEnabled: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc', // Process oldest first
        },
      });

      console.log(`🔄 Processing ${queuedPayouts.length} queued payouts...`);

      // check platform balance
      const platformBalance = await this.stripePaymentService.getBalance();
      const availableBalance = platformBalance.available[0]?.amount || 0;

      for (const payout of queuedPayouts) {
        const amountInCents = Math.round(Number(payout.amount) * 100);

        // Skip if platform doesn't have enough balance
        if (availableBalance < amountInCents) {
          console.log(
            `⏸️ Skipping payout ${payout.id}: Insufficient platform balance (Available: $${(availableBalance / 100).toFixed(2)}, Needed: $${(amountInCents / 100).toFixed(2)})`,
          );
          continue;
        }

        try {
          const accountId = payout.organizerId
            ? payout.organizer?.stripeAccountId
            : payout.vendor?.stripeAccountId;

          if (!accountId) {
            console.error(`❌ Payout ${payout.id}: No Stripe account found`);
            await this.prisma.payout.update({
              where: { id: payout.id },
              data: {
                status: 'FAILED',
                failureMessage: 'Stripe Connect account not found',
              },
            });
            failed++;
            continue;
          }

          // Process the payout
          if (payout.organizerId) {
            // Process organizer payout
            const transfer =
              await this.stripePaymentService.transferToConnectAccount({
                amount: amountInCents,
                currency: 'usd',
                destination: accountId,
                metadata: {
                  organizerId: payout.organizerId,
                  payoutId: payout.id,
                  type: 'organizer_payout',
                },
              });

            const stripePayout = await this.stripePaymentService.createPayout({
              amount: amountInCents,
              currency: 'usd',
              accountId: accountId,
              metadata: {
                organizerId: payout.organizerId,
                payoutId: payout.id,
                transferId: transfer.id,
              },
            });

            await this.prisma.payout.update({
              where: { id: payout.id },
              data: {
                stripeTransferId: transfer.id,
                stripePayoutId: stripePayout.id,
                status: stripePayout.status === 'paid' ? 'PAID' : 'PROCESSING',
                paidAt: stripePayout.status === 'paid' ? new Date() : null,
                failureMessage: null,
              },
            });

            console.log(`✅ Processed queued organizer payout: ${payout.id}`);
            processed++;
          } else if (payout.vendorId) {
            // Process vendor payout
            const transfer =
              await this.stripePaymentService.transferToConnectAccount({
                amount: amountInCents,
                currency: 'usd',
                destination: accountId,
                metadata: {
                  vendorId: payout.vendorId,
                  payoutId: payout.id,
                  type: 'vendor_withdrawal',
                },
              });

            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for transfer

            const stripePayout = await this.stripePaymentService.createPayout({
              amount: amountInCents,
              currency: 'usd',
              accountId: accountId,
              metadata: {
                vendorId: payout.vendorId,
                payoutId: payout.id,
                transferId: transfer.id,
                type: 'vendor_payout',
              },
            });

            await this.prisma.payout.update({
              where: { id: payout.id },
              data: {
                stripeTransferId: transfer.id,
                stripePayoutId: stripePayout.id,
                status: stripePayout.status === 'paid' ? 'PAID' : 'PROCESSING',
                paidAt: stripePayout.status === 'paid' ? new Date() : null,
                failureMessage: null,
              },
            });

            console.log(`✅ Processed queued vendor payout: ${payout.id}`);
            processed++;
          }
        } catch (error: any) {
          console.error(
            `❌ Failed to process queued payout ${payout.id}:`,
            error,
          );
          await this.prisma.payout.update({
            where: { id: payout.id },
            data: {
              status: 'FAILED',
              failureCode: error.code || 'PROCESSING_ERROR',
              failureMessage:
                error.message || 'Failed to process queued payout',
            },
          });
          failed++;
        }
      }

      console.log(
        `✅ Finished processing queued payouts. Processed: ${processed}, Failed: ${failed}`,
      );
      return { processed, failed };
    } catch (error: any) {
      console.error('❌ Error processing queued payouts:', error);
      return { processed, failed };
    }
  }
}
