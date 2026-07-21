import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { WorkspaceRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.VIEWER]);
    const { jobId } = await context.params;
    const job = await prisma.unifiedIngestionJob.findFirst({
      where: {
        id: jobId,
        workspaceId: session.workspace.id
      },
      select: {
        id: true,
        dataSourceId: true,
        fileId: true,
        status: true,
        progress: true,
        currentStep: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!job) {
      return NextResponse.json({ ok: false, message: "Ingestion job not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      job: {
        ...job,
        startedAt: job.startedAt?.toISOString() ?? null,
        completedAt: job.completedAt?.toISOString() ?? null,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString()
      },
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      errorMessage: job.errorMessage
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) return authResponse;

    console.error("Failed to read ingestion job", error);
    return NextResponse.json({ ok: false, message: "Failed to read ingestion job." }, { status: 500 });
  }
}
