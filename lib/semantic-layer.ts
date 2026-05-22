import {
  MetricExpressionType,
  MetricLayer,
  MetricMaintainerRole,
  MetricStatus,
  PrismaClient,
  type Prisma
} from "@prisma/client";
import type { IntrospectedTable } from "@/lib/database-introspection";

type SemanticField = {
  table: string;
  field: string;
  dataType?: string | null;
  semanticType: string;
  businessMeaning: string;
  confidence: number;
};

type BusinessEntity = {
  name: string;
  table: string;
  confidence: number;
  fields: string[];
};

type MetricDraft = {
  layer: MetricLayer;
  category: string;
  name: string;
  definition: string;
  formula: string;
  expressionType: MetricExpressionType;
  unit?: string;
  sourceFields: SemanticField[];
  tags: string[];
  status: MetricStatus;
};

type SemanticLayerResult = {
  fields: SemanticField[];
  entities: BusinessEntity[];
  metrics: MetricDraft[];
};

type SemanticTransaction = Prisma.TransactionClient | PrismaClient;

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function tableKey(table: IntrospectedTable) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function fieldIncludes(field: string, keywords: string[]) {
  const normalized = normalize(field);
  return keywords.some((keyword) => normalized.includes(keyword));
}

function inferSemanticType(field: string, tableName: string): Omit<SemanticField, "table" | "field" | "dataType"> | null {
  const normalizedField = normalize(field);
  const normalizedTable = normalize(tableName);

  if (fieldIncludes(normalizedField, ["customer_id", "account_id", "user_id", "client_id"])) {
    return {
      semanticType: "entity_identifier",
      businessMeaning: "Customer or user identity",
      confidence: 0.92
    };
  }

  if (fieldIncludes(normalizedField, ["revenue", "amount", "paid", "price", "payment", "mrr", "arr", "gmv"])) {
    return {
      semanticType: "revenue_value",
      businessMeaning: "Monetary value used for revenue analysis",
      confidence: normalizedTable.includes("subscription") || normalizedTable.includes("payment") ? 0.94 : 0.84
    };
  }

  if (fieldIncludes(normalizedField, ["spend", "cost", "cac", "budget", "cpc", "cpa"])) {
    return {
      semanticType: "cost_value",
      businessMeaning: "Cost or acquisition efficiency signal",
      confidence: 0.86
    };
  }

  if (fieldIncludes(normalizedField, ["signup", "activation", "activated", "onboarding", "conversion", "converted"])) {
    return {
      semanticType: "activation_event",
      businessMeaning: "Lifecycle or conversion event",
      confidence: 0.88
    };
  }

  if (fieldIncludes(normalizedField, ["renew", "retention", "churn", "cancel", "status"])) {
    return {
      semanticType: "retention_signal",
      businessMeaning: "Retention, churn, or subscription state",
      confidence: 0.82
    };
  }

  if (fieldIncludes(normalizedField, ["country", "region", "market", "city", "geo"])) {
    return {
      semanticType: "geography_dimension",
      businessMeaning: "Geographic segmentation dimension",
      confidence: 0.9
    };
  }

  if (fieldIncludes(normalizedField, ["channel", "campaign", "source", "medium", "utm", "ad_group"])) {
    return {
      semanticType: "acquisition_dimension",
      businessMeaning: "Acquisition or marketing attribution dimension",
      confidence: 0.87
    };
  }

  if (fieldIncludes(normalizedField, ["date", "time", "created_at", "updated_at", "occurred_at", "timestamp", "day", "month"])) {
    return {
      semanticType: "time_dimension",
      businessMeaning: "Time grain for trend analysis",
      confidence: 0.91
    };
  }

  if (fieldIncludes(normalizedField, ["close", "open", "high", "low", "volume"])) {
    return {
      semanticType: "performance_value",
      businessMeaning: "Performance or market movement value",
      confidence: 0.78
    };
  }

  if (fieldIncludes(normalizedField, ["sentiment_polarity", "polarity", "sentiment_score", "rating", "score"])) {
    return {
      semanticType: "sentiment_score",
      businessMeaning: "Numeric sentiment, rating, or satisfaction score",
      confidence: 0.9
    };
  }

  if (fieldIncludes(normalizedField, ["sentiment_subjectivity", "subjectivity"])) {
    return {
      semanticType: "sentiment_subjectivity",
      businessMeaning: "Review subjectivity or opinion intensity score",
      confidence: 0.86
    };
  }

  if (fieldIncludes(normalizedField, ["sentiment", "label", "category"])) {
    return {
      semanticType: "sentiment_label",
      businessMeaning: "Categorical sentiment label",
      confidence: 0.84
    };
  }

  if (fieldIncludes(normalizedField, ["review", "comment", "feedback", "message", "text"])) {
    return {
      semanticType: "feedback_text",
      businessMeaning: "Customer feedback or review text",
      confidence: 0.87
    };
  }

  if (fieldIncludes(normalizedField, ["app", "product", "sku", "item", "title"])) {
    return {
      semanticType: "product_dimension",
      businessMeaning: "Product, app, or item dimension",
      confidence: 0.78
    };
  }

  return null;
}

function inferBusinessEntities(tables: IntrospectedTable[], fields: SemanticField[]): BusinessEntity[] {
  return tables.map((table) => {
    const key = tableKey(table);
    const tableFields = fields.filter((field) => field.table === key);
    const normalizedTable = normalize(table.name);

    if (normalizedTable.includes("subscription") || normalizedTable.includes("billing")) {
      return {
        name: "Subscription",
        table: key,
        confidence: 0.9,
        fields: tableFields.map((field) => field.field)
      };
    }

    if (normalizedTable.includes("customer") || normalizedTable.includes("account") || normalizedTable.includes("user")) {
      return {
        name: "Customer",
        table: key,
        confidence: 0.88,
        fields: tableFields.map((field) => field.field)
      };
    }

    if (normalizedTable.includes("event") || normalizedTable.includes("activity")) {
      return {
        name: "Product Event",
        table: key,
        confidence: 0.84,
        fields: tableFields.map((field) => field.field)
      };
    }

    if (normalizedTable.includes("campaign") || normalizedTable.includes("ad") || normalizedTable.includes("marketing")) {
      return {
        name: "Acquisition",
        table: key,
        confidence: 0.86,
        fields: tableFields.map((field) => field.field)
      };
    }

    if (normalizedTable.includes("review") || normalizedTable.includes("feedback") || normalizedTable.includes("comment")) {
      return {
        name: "Customer Feedback",
        table: key,
        confidence: 0.9,
        fields: tableFields.map((field) => field.field)
      };
    }

    return {
      name: "Business Record",
      table: key,
      confidence: tableFields.length > 0 ? 0.7 : 0.45,
      fields: tableFields.map((field) => field.field)
    };
  });
}

function firstField(fields: SemanticField[], semanticType: string) {
  return fields.find((field) => field.semanticType === semanticType);
}

function fieldsByType(fields: SemanticField[], semanticType: string) {
  return fields.filter((field) => field.semanticType === semanticType);
}

function createMetricDrafts(fields: SemanticField[]): MetricDraft[] {
  const drafts: MetricDraft[] = [];
  const revenueField = firstField(fields, "revenue_value");
  const costField = firstField(fields, "cost_value");
  const customerField = firstField(fields, "entity_identifier");
  const activationField = firstField(fields, "activation_event");
  const retentionField = firstField(fields, "retention_signal");
  const performanceFields = fieldsByType(fields, "performance_value");
  const feedbackTextField = firstField(fields, "feedback_text");
  const sentimentScoreField = firstField(fields, "sentiment_score");
  const sentimentSubjectivityField = firstField(fields, "sentiment_subjectivity");
  const sentimentLabelField = firstField(fields, "sentiment_label");
  const productDimensionField = firstField(fields, "product_dimension");

  if (revenueField) {
    drafts.push({
      layer: MetricLayer.PRIMARY,
      category: "Revenue",
      name: "Revenue",
      definition: "Total monetary value recognized from mapped revenue fields",
      formula: `SUM(${revenueField.table}.${revenueField.field})`,
      expressionType: MetricExpressionType.AGGREGATE,
      unit: "currency",
      sourceFields: [revenueField],
      tags: ["Revenue", "AI Generated", "Core KPI"],
      status: MetricStatus.NEEDS_VALIDATION
    });

    if (fieldIncludes(revenueField.field, ["mrr"])) {
      drafts.push({
        layer: MetricLayer.PRIMARY,
        category: "Revenue",
        name: "ARR",
        definition: "Annual recurring revenue estimated from recurring monthly revenue",
        formula: `SUM(${revenueField.table}.${revenueField.field}) * 12`,
        expressionType: MetricExpressionType.CALCULATION,
        unit: "currency",
        sourceFields: [revenueField],
        tags: ["Revenue", "Recurring", "AI Generated"],
        status: MetricStatus.NEEDS_VALIDATION
      });
    }
  }

  if (customerField) {
    drafts.push({
      layer: MetricLayer.PRIMARY,
      category: "Customer",
      name: "Active Customers",
      definition: "Distinct active customer or user identities found in connected data",
      formula: `COUNT_DISTINCT(${customerField.table}.${customerField.field})`,
      expressionType: MetricExpressionType.AGGREGATE,
      unit: "count",
      sourceFields: [customerField],
      tags: ["Customer", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (costField && customerField) {
    drafts.push({
      layer: MetricLayer.DRIVER,
      category: "Acquisition",
      name: "CAC",
      definition: "Acquisition cost divided by new customer count",
      formula: `SUM(${costField.table}.${costField.field}) / COUNT_DISTINCT(${customerField.table}.${customerField.field})`,
      expressionType: MetricExpressionType.CALCULATION,
      unit: "currency",
      sourceFields: [costField, customerField],
      tags: ["Acquisition", "Cost", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (activationField && customerField) {
    drafts.push({
      layer: MetricLayer.DRIVER,
      category: "Activation",
      name: "Activation Rate",
      definition: "Share of users or accounts reaching an activation or onboarding milestone",
      formula: `COUNT(${activationField.table}.${activationField.field}) / COUNT_DISTINCT(${customerField.table}.${customerField.field})`,
      expressionType: MetricExpressionType.RATE,
      unit: "percent",
      sourceFields: [activationField, customerField],
      tags: ["Activation", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (retentionField && customerField) {
    drafts.push({
      layer: MetricLayer.DRIVER,
      category: "Retention",
      name: "Retention",
      definition: "Customer continuity signal inferred from status, renewal, or churn fields",
      formula: `COUNT_ACTIVE(${retentionField.table}.${retentionField.field}) / COUNT_DISTINCT(${customerField.table}.${customerField.field})`,
      expressionType: MetricExpressionType.RATE,
      unit: "percent",
      sourceFields: [retentionField, customerField],
      tags: ["Retention", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (performanceFields.length > 0) {
    const field = performanceFields[0];
    drafts.push({
      layer: MetricLayer.DIAGNOSTIC,
      category: "Performance",
      name: `Average ${field.field}`,
      definition: `Average movement of ${field.field} from uploaded or connected records`,
      formula: `AVG(${field.table}.${field.field})`,
      expressionType: MetricExpressionType.AGGREGATE,
      sourceFields: [field],
      tags: ["Performance", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (feedbackTextField || sentimentLabelField || sentimentScoreField) {
    const field = feedbackTextField ?? sentimentLabelField ?? sentimentScoreField;

    if (field) {
      drafts.push({
        layer: MetricLayer.PRIMARY,
        category: "Customer Feedback",
        name: "Review Volume",
        definition: "Total number of customer review or feedback records",
        formula: `COUNT(${field.table}.${field.field})`,
        expressionType: MetricExpressionType.AGGREGATE,
        unit: "count",
        sourceFields: [field],
        tags: ["Feedback", "AI Generated"],
        status: MetricStatus.NEEDS_VALIDATION
      });
    }
  }

  if (sentimentScoreField) {
    drafts.push({
      layer: MetricLayer.DRIVER,
      category: "Customer Feedback",
      name: "Average Sentiment Score",
      definition: "Average customer sentiment polarity or rating score",
      formula: `AVG(${sentimentScoreField.table}.${sentimentScoreField.field})`,
      expressionType: MetricExpressionType.AGGREGATE,
      unit: "score",
      sourceFields: [sentimentScoreField],
      tags: ["Sentiment", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (sentimentLabelField) {
    drafts.push({
      layer: MetricLayer.DRIVER,
      category: "Customer Feedback",
      name: "Positive Sentiment Rate",
      definition: "Share of reviews classified as positive sentiment",
      formula: `COUNT_IF(${sentimentLabelField.table}.${sentimentLabelField.field} = 'Positive') / COUNT(${sentimentLabelField.table}.${sentimentLabelField.field})`,
      expressionType: MetricExpressionType.RATE,
      unit: "percent",
      sourceFields: [sentimentLabelField],
      tags: ["Sentiment", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (sentimentSubjectivityField) {
    drafts.push({
      layer: MetricLayer.DIAGNOSTIC,
      category: "Customer Feedback",
      name: "Average Subjectivity",
      definition: "Average subjectivity score across review text",
      formula: `AVG(${sentimentSubjectivityField.table}.${sentimentSubjectivityField.field})`,
      expressionType: MetricExpressionType.AGGREGATE,
      unit: "score",
      sourceFields: [sentimentSubjectivityField],
      tags: ["Feedback", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  if (productDimensionField && sentimentScoreField) {
    drafts.push({
      layer: MetricLayer.DIAGNOSTIC,
      category: "Customer Feedback",
      name: "Sentiment by Product",
      definition: "Average sentiment score grouped by product, app, or item",
      formula: `AVG(${sentimentScoreField.table}.${sentimentScoreField.field}) BY ${productDimensionField.table}.${productDimensionField.field}`,
      expressionType: MetricExpressionType.CALCULATION,
      unit: "score",
      sourceFields: [sentimentScoreField, productDimensionField],
      tags: ["Sentiment", "Product", "AI Generated"],
      status: MetricStatus.NEEDS_VALIDATION
    });
  }

  return drafts;
}

export function buildSemanticLayer(tables: IntrospectedTable[]): SemanticLayerResult {
  const fields = tables.flatMap((table) => {
    const key = tableKey(table);

    return table.columns.flatMap((column) => {
      const semantic = inferSemanticType(column.name, table.name);

      if (!semantic) {
        return [];
      }

      return [{
        table: key,
        field: column.name,
        dataType: column.type,
        ...semantic
      }];
    });
  });

  const entities = inferBusinessEntities(tables, fields);
  const metrics = createMetricDrafts(fields);

  return { fields, entities, metrics };
}

export async function generateSemanticMetrics(
  tx: SemanticTransaction,
  {
    workspaceId,
    userId,
    semanticLayer
  }: {
    workspaceId: string;
    userId?: string | null;
    semanticLayer: SemanticLayerResult;
  }
) {
  const currentMetricNames = semanticLayer.metrics.map((metric) => metric.name);

  await tx.metricDefinition.updateMany({
    where: {
      workspaceId,
      maintainerRole: MetricMaintainerRole.AI,
      isActive: true,
      name: {
        notIn: currentMetricNames.length > 0 ? currentMetricNames : ["__none__"]
      }
    },
    data: {
      isActive: false
    }
  });

  for (const metric of semanticLayer.metrics) {
    await tx.metricDefinition.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: metric.name
        }
      },
      create: {
        workspaceId,
        layer: metric.layer,
        category: metric.category,
        name: metric.name,
        definition: metric.definition,
        formula: metric.formula,
        expressionType: metric.expressionType,
        unit: metric.unit,
        mappingJson: {
          sourceFields: metric.sourceFields
        },
        lineageJson: {
          generatedFrom: "schema_semantic_detection",
          semanticTypes: metric.sourceFields.map((field) => field.semanticType)
        },
        maintainerRole: MetricMaintainerRole.AI,
        maintainerUserId: userId ?? null,
        status: metric.status,
        tagsJson: metric.tags
      },
      update: {
        isActive: true,
        layer: metric.layer,
        category: metric.category,
        definition: metric.definition,
        formula: metric.formula,
        expressionType: metric.expressionType,
        unit: metric.unit,
        mappingJson: {
          sourceFields: metric.sourceFields
        },
        lineageJson: {
          generatedFrom: "schema_semantic_detection",
          semanticTypes: metric.sourceFields.map((field) => field.semanticType)
        },
        maintainerRole: MetricMaintainerRole.AI,
        maintainerUserId: userId ?? null,
        status: metric.status,
        tagsJson: metric.tags
      }
    });
  }

  return semanticLayer.metrics.length;
}
