import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";

export async function GET() {
  const session = await syncCurrentClerkUser();

  if (!session) {
    return NextResponse.json({ hasData: false, briefing: null, insights: [], recommendations: [] }, { status: 401 });
  }

  const briefing = await prisma.dailyBriefing.findFirst({
    where: {
      workspaceId: session.workspace.id
    },
    orderBy: {
      briefingDate: "desc"
    },
    include: {
      insights: {
        orderBy: {
          createdAt: "desc"
        },
        include: {
          recommendations: {
            orderBy: {
              createdAt: "desc"
            }
          }
        }
      }
    }
  });

  const insights = briefing?.insights ?? [];
  const recommendations = insights.flatMap((insight) => insight.recommendations);

  return NextResponse.json({
    workspaceId: session.workspace.id,
    hasData: Boolean(briefing || insights.length || recommendations.length),
    briefing,
    insights,
    recommendations
  });
}
