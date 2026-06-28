import { NextResponse } from "next/server";
import { runShopifyProductionSync } from "@/lib/ecommerce-connectors/providers/shopify-sync-engine";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function POST(request: Request) {
  try {
    const session = await requireWorkspace();
    const body = await request.json().catch(() => null) as { dataSourceId?: string | null } | null;
    const result = await runShopifyProductionSync(prisma, {
      workspaceId: session.workspace.id,
      dataSourceId: body?.dataSourceId ?? null
    });

    return NextResponse.json(result);
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        ok: false,
        code: "SHOPIFY_SYNC_FAILED",
        message: error instanceof Error ? error.message : "Shopify sync failed."
      },
      { status: 500 }
    );
  }
}
