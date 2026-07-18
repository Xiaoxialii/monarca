import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { buildDecisionImpactPayload } from "@/lib/policy/action-impact-tracker";
import { listActionTrackingRecords } from "@/lib/optimization/action-tracking-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const { workspaceId } = await resolveActionSession();
  const actions = await listActionTrackingRecords({ workspaceId });
  return NextResponse.json({
    ok: true,
    ...buildDecisionImpactPayload(actions)
  });
}
