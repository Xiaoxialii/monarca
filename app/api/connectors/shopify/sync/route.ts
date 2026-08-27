import { NextResponse } from "next/server";
import { enqueueShopifyBulkProductSync } from "@/lib/ecommerce-connectors/providers/shopify-bulk-product-sync";
import { runShopifyProductionSync } from "@/lib/ecommerce-connectors/providers/shopify-sync-engine";
import { SHOPIFY_PROVIDER } from "@/lib/ecommerce-connectors/shopify-oauth";
import { publicShopifyError } from "@/lib/ecommerce-connectors/shopify-oauth";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function POST(request: Request) {
  try {
    const session = await requireWorkspace();
    const body = await request.json().catch(() => null) as { dataSourceId?: string | null } | null;
    const result = await runShopifyProductionSync(prisma, {
      workspaceId: session.workspace.id,
      dataSourceId: body?.dataSourceId ?? null,
      force: true
    });
    const account = await prisma.ecommerceConnectorAccount.findFirst({
      where: {
        workspaceId: session.workspace.id,
        provider: SHOPIFY_PROVIDER,
        status: "connected",
        dataSourceId: body?.dataSourceId ?? undefined
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, dataSourceId: true, shopDomain: true }
    });
    const fullProductJob = account?.dataSourceId
      ? await enqueueShopifyBulkProductSync(prisma, {
          workspaceId: session.workspace.id,
          dataSourceId: account.dataSourceId,
          connectorAccountId: account.id,
          shopDomain: account.shopDomain,
          trigger: "manual"
        }).catch(() => null)
      : null;

    return NextResponse.json({
      ...result,
      fullProductJobId: fullProductJob?.id ?? null
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    const publicError = publicShopifyError(error);
    if (publicError.code !== "SHOPIFY_CONNECTOR_ERROR") {
      return NextResponse.json(
        {
          ok: false,
          code: publicError.code,
          message: publicError.message
        },
        { status: publicError.status }
      );
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
