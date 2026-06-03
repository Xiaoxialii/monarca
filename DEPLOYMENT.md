# Production Deployment

## 1. GitHub

Push `main` to GitHub, then import the repository in Vercel.

## 2. Neon PostgreSQL

Create a Neon project and database. Use the pooled connection string for `DATABASE_URL`.
This project uses Prisma with PostgreSQL. `DATABASE_URL` must start with
`postgresql://` or `postgres://`.

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
```

Run migrations after the Vercel environment variables are configured:

```bash
npm run db:migrate:deploy
```

## 3. Vercel Environment Variables

Copy `.env.example` into Vercel Project Settings -> Environment Variables and replace placeholders with production values.

Required before first production test:

- `DATABASE_URL`
- `APP_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`
- `APP_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- Stripe price IDs used by checkout
- `RESEND_API_KEY`
- `HELP_REQUEST_FROM_EMAIL`
- `HELP_REQUEST_RECIPIENT_EMAIL`

## 4. Stripe Webhook

After Vercel deployment, create a Stripe webhook endpoint:

```text
https://YOUR_DOMAIN/api/stripe/webhook
```

Copy the generated `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

Subscribe the endpoint to these events:

- `checkout.session.completed`
- `checkout.session.expired`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

For local testing, forward events with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Then copy the printed `whsec_...` value into local `.env` as
`STRIPE_WEBHOOK_SECRET` and restart the dev server.

## 5. Cloudflare R2

Create an R2 bucket and API token with object read/write permission for that bucket.

Set:

```env
R2_ENDPOINT="https://ACCOUNT_ID.r2.cloudflarestorage.com"
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET="monarca-uploads"
R2_PUBLIC_BASE_URL="https://files.your-domain.com"
```

`R2_PUBLIC_BASE_URL` is optional. File upload still stores the bucket/key without it.

## 6. Smoke Test

Test these flows after deployment:

- `/sign-up`
- `/sign-in`
- `/dashboard`
- workspace auto-create after first login
- file upload from dashboard
- `/checkout/professional`
- Stripe webhook delivery
