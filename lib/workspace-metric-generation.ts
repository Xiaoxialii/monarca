import { ConnectionStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { buildSemanticLayer, generateSemanticMetrics } from "@/lib/semantic-layer";
import { validateWorkspaceMetrics } from "@/lib/metric-validation";

type MetricGenerationClient = PrismaClient | Prisma.TransactionClient;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function tablesFromWorkspaceSchema(schemaJson: unknown) {
  const schema = asRecord(schemaJson);
  const tables = Array.isArray(schema.tables) ? schema.tables : [];

  return tables.flatMap((table) => {
    const tableRecord = asRecord(table);
    const name = typeof tableRecord.name === "string" ? tableRecord.name : "";

    if (!name) {
      return [];
    }

    const columns = Array.isArray(tableRecord.columns) ? tableRecord.columns : [];

    return [{
      name,
      schema: typeof tableRecord.schema === "string" ? tableRecord.schema : undefined,
      columns: columns.flatMap((column) => {
        const columnRecord = asRecord(column);
        const columnName = typeof columnRecord.name === "string" ? columnRecord.name : "";

        if (!columnName) {
          return [];
        }

        return [{
          name: columnName,
          type: typeof columnRecord.type === "string" ? columnRecord.type : "unknown",
          nullable: typeof columnRecord.nullable === "boolean" ? columnRecord.nullable : true
        }];
      })
    }];
  });
}

function tableLabel(table: ReturnType<typeof tablesFromWorkspaceSchema>[number]) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function uniqueTables(tables: ReturnType<typeof tablesFromWorkspaceSchema>) {
  const seen = new Set<string>();

  return tables.filter((table) => {
    const key = tableLabel(table).toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function getConnectedWorkspaceSchemaContext(client: MetricGenerationClient, workspaceId: string) {
  const dataSources = await client.dataSourceConnection.findMany({
    where: {
      workspaceId,
      isActive: true,
      status: ConnectionStatus.CONNECTED
    },
    select: {
      id: true
    }
  });
  const snapshots = dataSources.length > 0
    ? await client.schemaSnapshot.findMany({
      where: {
        workspaceId,
        dataSourceId: {
          in: dataSources.map((source) => source.id)
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    })
    : [];
  const snapshotBySource = new Map<string, typeof snapshots[number]>();

  for (const snapshot of snapshots) {
    if (snapshot.dataSourceId && !snapshotBySource.has(snapshot.dataSourceId)) {
      snapshotBySource.set(snapshot.dataSourceId, snapshot);
    }
  }

  let selectedSnapshots = Array.from(snapshotBySource.values());

  if (selectedSnapshots.length === 0) {
    const latestSnapshot = await client.schemaSnapshot.findFirst({
      where: {
        workspaceId
      },
      orderBy: {
        version: "desc"
      }
    });

    selectedSnapshots = latestSnapshot ? [latestSnapshot] : [];
  }

  return {
    primarySnapshot: selectedSnapshots[0] ?? null,
    snapshots: selectedSnapshots,
    tables: uniqueTables(selectedSnapshots.flatMap((snapshot) => tablesFromWorkspaceSchema(snapshot.schemaJson)))
  };
}

export async function generateWorkspaceMetricsFromConnectedSources(
  client: MetricGenerationClient,
  {
    workspaceId,
    userId
  }: {
    workspaceId: string;
    userId?: string | null;
  }
) {
  const context = await getConnectedWorkspaceSchemaContext(client, workspaceId);

  if (!context.primarySnapshot) {
    return {
      ...context,
      semanticLayer: null,
      generatedMetricCount: 0,
      validationResults: []
    };
  }

  const semanticLayer = buildSemanticLayer(context.tables);
  const generatedMetricCount = await generateSemanticMetrics(client, {
    workspaceId,
    userId,
    semanticLayer
  });
  const validationResults = await validateWorkspaceMetrics(client, {
    workspaceId,
    tables: context.tables
  });

  await client.schemaSnapshot.update({
    where: {
      id: context.primarySnapshot.id
    },
    data: {
      schemaJson: {
        ...asRecord(context.primarySnapshot.schemaJson),
        semanticLayer
      },
      qualityReport: {
        ...asRecord(context.primarySnapshot.qualityReport),
        semanticFieldCount: semanticLayer.fields.length,
        businessEntityCount: semanticLayer.entities.length,
        generatedMetricCount
      }
    }
  });

  return {
    ...context,
    semanticLayer,
    generatedMetricCount,
    validationResults
  };
}
