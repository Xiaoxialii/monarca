import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { prisma } from "@/lib/prisma";
import { listActionTrackingRecords } from "@/lib/optimization/action-tracking-store";

export const dynamic = "force-dynamic";

type PrismaWithOptimizationDecision = typeof prisma & {
  optimizationDecision: {
    findMany(args: unknown): Promise<unknown[]>;
  };
};

export async function GET(request: Request) {
  const { workspaceId } = await resolveActionSession();
  const status = new URL(request.url).searchParams.get("status");

  try {
    const decisions = await (prisma as PrismaWithOptimizationDecision).optimizationDecision.findMany({
      where: {
        workspaceId,
        ...(status ? { decisionStatus: status.toUpperCase() } : {})
      },
      orderBy: { updatedAt: "desc" }
    });

    return NextResponse.json({ ok: true, decisions });
  } catch {
    const actions = await listActionTrackingRecords({ workspaceId });
    return NextResponse.json({ ok: true, decisions: actions });
  }
}
