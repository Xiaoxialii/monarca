import { NextResponse } from "next/server";
import { getCurrentWorkspaceContext, logWorkspaceContext } from "@/lib/current-workspace-context";
import { processAsyncJobBatch } from "@/lib/jobs/async-job-runner";
import { prisma } from "@/lib/prisma";
import {
  enqueueCompetitivePublicAdSyncJob,
  getConfirmedCompetitorBrands,
  metaAdLibraryAccessToken,
  upsertUserConfirmedCompetitorBrands
} from "@/lib/competitive-intelligence/meta-ad-library";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SyncBody = {
  sku?: string;
  brands?: string[];
  country?: string;
  category?: string | null;
  limitPerBrand?: number;
};

export async function POST(request: Request) {
  try {
    const session = await getCurrentWorkspaceContext(request);
    logWorkspaceContext("[workspace-context] competitive-intelligence.sync.POST", session);
    const body = await request.json().catch(() => ({})) as SyncBody;
    const sku = typeof body.sku === "string" ? body.sku.trim() : "";
    const requestedBrands = Array.isArray(body.brands) ? body.brands.filter((brand) => typeof brand === "string" && brand.trim()).map((brand) => brand.trim()) : [];
    if (!sku) {
      return NextResponse.json({ ok: false, code: "SKU_REQUIRED", message: "SKU is required." }, { status: 400 });
    }
    const brands = requestedBrands.length
      ? requestedBrands
      : await getConfirmedCompetitorBrands(prisma, {
          workspaceId: session.workspace.id,
          sku
        });
    if (!brands.length) {
      return NextResponse.json({ ok: false, code: "COMPETITOR_BRANDS_REQUIRED", message: "At least one confirmed competitor brand is required." }, { status: 400 });
    }
    if (requestedBrands.length) {
      await upsertUserConfirmedCompetitorBrands(prisma, {
        workspaceId: session.workspace.id,
        sku,
        brands: requestedBrands,
        category: typeof body.category === "string" ? body.category : null,
        confirmedBy: session.user.id
      });
    }

    if (!metaAdLibraryAccessToken()) {
      return NextResponse.json({
        ok: false,
        status: "UNSUPPORTED",
        code: "PUBLIC_AD_LIBRARY_TOKEN_MISSING",
        message: "Configure META_AD_LIBRARY_ACCESS_TOKEN before syncing public Meta Ad Library data."
      }, { status: 501 });
    }

    const result = await enqueueCompetitivePublicAdSyncJob(prisma, {
      workspaceId: session.workspace.id,
      sku,
      brands,
      country: body.country,
      category: typeof body.category === "string" ? body.category : null,
      trigger: "manual",
      limitPerBrand: body.limitPerBrand
    });

    void processAsyncJobBatch({
      client: prisma,
      jobId: result.job.id,
      jobType: "PUBLIC_COMPETITOR_AD_SYNC",
      limit: 1
    }).catch((error) => {
      console.warn("[competitive-intelligence] queued sync worker trigger failed", {
        workspaceId: session.workspace.id,
        jobId: result.job.id,
        message: error instanceof Error ? error.message : "Worker trigger failed."
      });
    });

    return NextResponse.json({
      ok: true,
      status: result.created ? "QUEUED" : result.job.status,
      jobId: result.job.id,
      syncRunId: result.syncRun?.id ?? null,
      created: result.created
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    return NextResponse.json({
      ok: false,
      code: "PUBLIC_COMPETITOR_AD_SYNC_FAILED",
      message: error instanceof Error ? error.message : "Failed to queue public competitor ad sync."
    }, { status: 500 });
  }
}
