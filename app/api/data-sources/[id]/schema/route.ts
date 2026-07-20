import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();

  try {
    const session = await requireWorkspace();
    const { id } = await params;
    const dataSource = await prisma.dataSourceConnection.findFirst({
      where: {
        id,
        workspaceId: session.workspace.id
      },
      select: {
        id: true,
        name: true,
        provider: true,
        type: true,
        status: true,
        schemas: true,
        updatedAt: true
      }
    });

    if (!dataSource) {
      return NextResponse.json({ ok: false, message: "Data source not found" }, { status: 404 });
    }

    const latestSnapshot = await prisma.schemaSnapshot.findFirst({
      where: {
        workspaceId: session.workspace.id,
        dataSourceId: dataSource.id
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        version: true,
        status: true,
        schemaJson: true,
        qualityReport: true,
        createdAt: true
      }
    });

    return NextResponse.json({
      ok: true,
      dataSource: {
        id: dataSource.id,
        name: dataSource.name,
        provider: dataSource.provider,
        type: dataSource.type,
        status: dataSource.status,
        updatedAt: dataSource.updatedAt.toISOString()
      },
      schema: dataSource.schemas,
      snapshot: latestSnapshot
        ? {
            id: latestSnapshot.id,
            version: latestSnapshot.version,
            status: latestSnapshot.status,
            schemaJson: latestSnapshot.schemaJson,
            qualityReport: latestSnapshot.qualityReport,
            createdAt: latestSnapshot.createdAt.toISOString()
          }
        : null,
      performance: {
        durationMs: Date.now() - startedAt,
        source: "schema_endpoint"
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to load data source schema");
  }
}
