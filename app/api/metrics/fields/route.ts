import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { apiErrorResponse } from "@/lib/api-errors";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function GET() {
  try {
    const session = await requireWorkspace();
    const snapshot = await prisma.schemaSnapshot.findFirst({
      where: {
        workspaceId: session.workspace.id
      },
      orderBy: {
        version: "desc"
      }
    });

    const schemaJson = asRecord(snapshot?.schemaJson);
    const tables = Array.isArray(schemaJson?.tables) ? schemaJson.tables : [];

    return NextResponse.json({
      ok: true,
      tables: tables.flatMap((table) => {
        const tableRecord = asRecord(table);
        const tableName = typeof tableRecord?.name === "string" ? tableRecord.name : "";
        const tableSchema = typeof tableRecord?.schema === "string" ? tableRecord.schema : null;

        if (!tableName) {
          return [];
        }

        const columns = Array.isArray(tableRecord?.columns) ? tableRecord.columns : [];

        return [{
          name: tableName,
          schema: tableSchema,
          columns: columns.flatMap((column) => {
            const columnRecord = asRecord(column);
            const columnName = typeof columnRecord?.name === "string" ? columnRecord.name : "";

            if (!columnName) {
              return [];
            }

            return [{
              key: `${tableSchema ? `${tableSchema}.` : ""}${tableName}.${columnName}`,
              table: tableName,
              schema: tableSchema,
              name: columnName,
              type: typeof columnRecord?.type === "string" ? columnRecord.type : "unknown",
              nullable: typeof columnRecord?.nullable === "boolean" ? columnRecord.nullable : true
            }];
          })
        }];
      })
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    return apiErrorResponse(error, "Failed to load schema fields");
  }
}
