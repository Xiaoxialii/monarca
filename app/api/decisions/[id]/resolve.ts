import { prisma } from "@/lib/prisma";

export async function resolveDecisionReference(input: { id: string; workspaceId: string }) {
  const recommendation = await prisma.optimizationDecision.findFirst({
    where: {
      id: input.id,
      workspaceId: input.workspaceId
    },
    select: { id: true }
  });
  if (recommendation) {
    const action = await prisma.decisionAction.findFirst({
      where: {
        workspaceId: input.workspaceId,
        recommendationId: recommendation.id
      },
      select: { id: true },
      orderBy: { updatedAt: "desc" }
    });
    return { recommendationId: recommendation.id as string, actionId: action?.id as string | undefined };
  }

  const action = await prisma.decisionAction.findFirst({
    where: {
      id: input.id,
      workspaceId: input.workspaceId
    },
    select: { id: true, recommendationId: true }
  });
  if (!action) return null;

  return {
    recommendationId: action.recommendationId as string | null,
    actionId: action.id as string
  };
}
