import { NextResponse } from "next/server";
import { resolveActionSession } from "@/app/api/actions/session";
import { prisma } from "@/lib/prisma";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { workspaceId } = await resolveActionSession(request);
    const rows = await prisma.decisionLearning.findMany({
      where: {
        workspaceId,
        success: true
      },
      orderBy: [
        { incrementalProfit: "desc" },
        { accuracyScore: "desc" },
        { createdAt: "desc" }
      ],
      take: 100
    });

    return NextResponse.json({
      ok: true,
      patterns: rows.map((row) => ({
        id: row.id,
        actionType: row.actionType,
        learningPattern: row.learningPattern,
        incrementalProfit: row.incrementalProfit,
        accuracyScore: row.accuracyScore,
        featureSnapshot: row.featureSnapshot,
        learningJson: row.learningJson,
        createdAt: row.createdAt.toISOString()
      }))
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    throw error;
  }
}
