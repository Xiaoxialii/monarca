import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { prisma } from "@/lib/prisma";
import { listActionTrackingRecords } from "@/lib/optimization/action-tracking-store";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

type PrismaWithOptimizationDecision = typeof prisma & {
  optimizationDecision: {
    findMany(args: unknown): Promise<unknown[]>;
  };
};

export async function GET(request: Request) {
  try {
    const { workspaceId } = await resolveActionSession(request);
    const status = new URL(request.url).searchParams.get("status");
    const decisions = await (prisma as PrismaWithOptimizationDecision).optimizationDecision.findMany({
      where: {
        workspaceId,
        ...(status ? { decisionStatus: status.toUpperCase() } : {})
      },
      orderBy: { updatedAt: "desc" }
    });

    return NextResponse.json({ ok: true, decisions });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;

    const { workspaceId } = await resolveActionSession(request);
    const actions = await listActionTrackingRecords({ workspaceId });
    return NextResponse.json({ ok: true, decisions: actions });
  }
}
