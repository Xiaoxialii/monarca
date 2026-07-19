import { NextResponse } from "next/server";
import { ConnectionStatus } from "@prisma/client";
import { resolveActionSession } from "@/app/api/actions/session";
import { buildDecisionImpactPayload } from "@/lib/policy/action-impact-tracker";
import { listActionTrackingRecords } from "@/lib/optimization/action-tracking-store";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const { workspaceId } = await resolveActionSession();
  const hasConnectedData = await hasConnectedDataSource(workspaceId);
  if (!hasConnectedData) {
    return NextResponse.json({
      ok: true,
      ...buildDecisionImpactPayload([])
    });
  }

  const actions = await listActionTrackingRecords({ workspaceId });
  return NextResponse.json({
    ok: true,
    ...buildDecisionImpactPayload(actions)
  });
}

async function hasConnectedDataSource(workspaceId: string) {
  try {
    const count = await prisma.dataSourceConnection.count({
      where: {
        workspaceId,
        isActive: true,
        status: ConnectionStatus.CONNECTED
      }
    });
    return count > 0;
  } catch {
    return false;
  }
}
