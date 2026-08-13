import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueDueShopifySyncs, SHOPIFY_SYNC_BATCH_SIZE } from "@/lib/ecommerce-connectors/shopify-sync-scheduler";
import { processJob } from "@/lib/jobs/async-job-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const headerSecret = request.headers.get("x-cron-secret") ?? "";

  return authorization === `Bearer ${secret}` || headerSecret === secret;
}

export async function POST(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Number.isFinite(Number(body?.batchSize))
    ? Math.max(1, Math.min(Number(body.batchSize), SHOPIFY_SYNC_BATCH_SIZE))
    : SHOPIFY_SYNC_BATCH_SIZE;
  const result = await enqueueDueShopifySyncs(prisma, { batchSize });
  after(() => {
    for (const item of result.enqueued) {
      void processJob(item.jobId).catch((error) => {
        console.error("Failed to process scheduled Shopify sync job", { jobId: item.jobId, error });
      });
    }
  });

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return POST(request);
}
