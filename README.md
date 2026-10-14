# Vendor KYC · Stripe Connect · Payouts

Vendor KYC with Stripe Identity, Stripe Connect onboarding, payout withdrawals, and AI-assisted vendor profile setup.

## What's included

- Multi-step vendor onboarding (business, docs, identity, Google, AI training, review)
- Stripe Identity verification
- Stripe Connect account create / status
- Vendor payouts / withdrawals
- AI onboarding Q&A profiling
- Supporting auth, mail, uploads, and Prisma schema from the source marketplace modules

## Stack

NestJS · Prisma · Stripe Identity · Stripe Connect · Next.js onboarding UI

## Structure

- `src/vendors` — onboarding, Identity, Connect, AI onboarding service
- `src/payouts` — earnings and withdrawals
- `src/payments` — Stripe helpers
- `src/ai` — AI service used by vendor onboarding
- `src/uploads` — document uploads for onboarding
- `frontend/app/vendor/onboarding` — wizard UI
- `frontend/app/vendor/payouts` — payouts UI

## Setup

1. Copy `.env.example` to `.env`
2. `npm install`
3. `npx prisma generate`
4. `npm run start:dev`

Extracted from production marketplace work under NDA. Branding removed from package metadata.
