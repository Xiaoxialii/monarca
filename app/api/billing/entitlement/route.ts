import { NextResponse } from "next/server";
import { getBillingAccessState } from "@/lib/billing/entitlements";
import { requireAuth, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireAuth();
    const entitlement = await getBillingAccessState(session.workspace.id);

    return NextResponse.json({ ok: true, entitlement });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) return authResponse;

    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Failed to load entitlement." },
      { status: 500 }
    );
  }
}
