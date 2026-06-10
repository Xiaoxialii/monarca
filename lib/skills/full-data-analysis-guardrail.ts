export type FullDataAnalysisDataScope = "FULL_DATA" | "SAMPLE_ONLY" | "PARTIAL_DATA" | "UNKNOWN";

export type FullDataAnalysisGuardrailContext = {
  reportType: string;
  schemaSnapshot?: unknown;
  dataSourceConnection?: unknown;
  metricSource?: string | null;
  rowsUsed?: number | null;
  dailyRows?: number | null;
  rowsUsedForMetrics?: number | null;
  sampleRowsCount?: number | null;
  fullDataAvailable?: boolean | null;
  expectedFullRows?: number | null;
  latestDataDate?: string | null;
  storedFilePath?: string | null;
  storageObjectKey?: string | null;
  isDatabaseSource?: boolean | null;
  businessFieldMap?: Record<string, string> | null;
  detectedIndustry?: string | null;
  outputText?: string | null;
};

export type FullDataAnalysisGuardrailResult = {
  canGenerateReport: boolean;
  dataScope: FullDataAnalysisDataScope;
  analysisSource: string;
  rowsUsed: number;
  dailyRows?: number;
  rowsUsedForMetrics?: number;
  sampleRowsCount?: number;
  expectedFullRows?: number;
  latestDataDate?: string;
  businessFieldMappingReady: boolean;
  blockingIssues: string[];
  warnings: string[];
  requiredFixes: string[];
};

const sampleMetricSources = new Set([
  "schema.samplerows",
  "schema_samplerows",
  "schema_sample_rows",
  "samplerows",
  "previewrows",
  "preview_rows",
  "sampledata",
  "sample_data",
  "headrows",
  "head_rows",
  "first500rows",
  "first_500_rows",
  "ui_preview_data"
]);

export const ecommerceBusinessFieldMap: Record<string, string> = {
  order_id: "订单",
  order_date: "订单日期",
  customer_id: "客户",
  category: "品类",
  product_id: "商品 / SKU",
  sku: "商品 / SKU",
  quantity: "销售件数",
  unit_price: "商品单价",
  gross_sales: "商品销售额",
  net_sales: "净销售额",
  total_paid: "实付金额",
  paid_amount: "实付金额",
  is_returned: "退货",
  return_status: "退货状态",
  refund_status: "退款状态",
  customer_rating: "用户评分",
  rating: "用户评分",
  fulfillment_days: "履约天数",
  sales_channel: "销售渠道",
  channel: "销售渠道",
  country: "国家 / 市场",
  market: "国家 / 市场",
  region: "地区 / 市场"
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isSampleMetricSource(value: unknown) {
  const normalized = normalize(String(value ?? ""));
  return sampleMetricSources.has(normalized);
}

function isDailyReport(reportType: string) {
  return /daily|日报|brief/i.test(reportType) && !/weekly|周报/i.test(reportType);
}

function ecommerceFieldScore(fieldMap: Record<string, string>) {
  const keys = Object.keys(fieldMap).map(normalize);
  const requiredSignals = ["order_id", "order_date", "customer_id", "net_sales", "total_paid", "category"];
  return requiredSignals.filter((signal) => keys.includes(signal)).length;
}

function containsForbiddenBusinessTerms(text: string) {
  return /\b(column|field|database column|objects?|app|install value)\b|records contribution|AverageRating Share/i.test(text);
}

function analysisSource(context: FullDataAnalysisGuardrailContext) {
  if (context.isDatabaseSource) return "DATABASE_QUERY";
  if (context.storedFilePath) return "STORED_FILE_PATH";
  if (context.storageObjectKey) return "STORAGE_OBJECT";
  if (context.metricSource) return String(context.metricSource);
  return "UNKNOWN";
}

function dataScope(context: FullDataAnalysisGuardrailContext): FullDataAnalysisDataScope {
  if (isSampleMetricSource(context.metricSource)) return "SAMPLE_ONLY";
  if (context.isDatabaseSource) return "FULL_DATA";
  const rowsUsed = Number(context.rowsUsed ?? 0);
  const expected = Number(context.expectedFullRows ?? 0);
  if (!context.storedFilePath && !context.storageObjectKey) return rowsUsed > 0 ? "SAMPLE_ONLY" : "UNKNOWN";
  if (expected > 0 && rowsUsed > 0 && rowsUsed < expected) return "PARTIAL_DATA";
  if (rowsUsed > 0) return "FULL_DATA";
  return "UNKNOWN";
}

export function validateFullDataAnalysisContext(
  context: FullDataAnalysisGuardrailContext
): FullDataAnalysisGuardrailResult {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const requiredFixes: string[] = [];
  const scope = dataScope(context);
  const rowsUsed = Math.max(0, Math.trunc(Number(context.rowsUsed ?? 0)));
  const dailyRows = Math.max(0, Math.trunc(Number(context.dailyRows ?? 0)));
  const rowsUsedForMetrics = Math.max(0, Math.trunc(Number(context.rowsUsedForMetrics ?? 0)));
  const sampleRowsCount = Math.max(0, Math.trunc(Number(context.sampleRowsCount ?? 0)));
  const expectedFullRows = Number(context.expectedFullRows ?? 0);
  const businessFieldMap = context.businessFieldMap ?? {};
  const businessFieldMappingReady = Object.keys(businessFieldMap).length > 0;

  if (isSampleMetricSource(context.metricSource)) {
    blockingIssues.push("metricSource 指向 schema.sampleRows、previewRows、sampleData、headRows 或 first500Rows，不能生成正式业务报告。");
    requiredFixes.push("改用完整文件 storedFilePath、真实存储对象或数据库聚合查询计算 verifiedMetrics。");
  }

  if (expectedFullRows > 0 && rowsUsed > 0 && rowsUsed < expectedFullRows) {
    blockingIssues.push(`当前仅使用 ${rowsUsed} 行，少于预期完整数据 ${expectedFullRows} 行。`);
    requiredFixes.push("读取完整文件或完整数据库查询结果后重新计算 KPI。");
  }

  if (!context.isDatabaseSource && !context.storedFilePath && !context.storageObjectKey) {
    blockingIssues.push("CSV / Excel 数据源缺少 storedFilePath 或 storageObjectKey，当前只能读取样本数据。");
    requiredFixes.push("保存上传文件路径或真实存储对象 key，并基于完整文件重新生成报告。");
  }

  if (isDailyReport(context.reportType) && context.fullDataAvailable === false) {
    blockingIssues.push("日报未读取到完整数据，不能基于预览样本或部分数据生成。");
    requiredFixes.push("先读取完整文件或使用数据库聚合查询后，再计算 dailyRows 和 verifiedMetrics。");
  }

  if (isDailyReport(context.reportType) && !context.latestDataDate) {
    blockingIssues.push("日报缺少 latestDataDate，不能确定业务日期锚点。");
    requiredFixes.push("从完整数据的业务时间字段中计算最大日期 latestDataDate。");
  }

  if (isDailyReport(context.reportType) && context.latestDataDate && dailyRows <= 0) {
    blockingIssues.push("日报缺少 latestDataDate 当天的完整记录数 dailyRows。");
    requiredFixes.push("按业务日期字段统计 COUNT rows WHERE businessDate = latestDataDate。");
  }

  if (isDailyReport(context.reportType) && dailyRows > 0 && rowsUsedForMetrics > 0 && rowsUsedForMetrics !== dailyRows) {
    blockingIssues.push(`日报指标使用 ${rowsUsedForMetrics} 行，但最新业务日期完整记录数为 ${dailyRows} 行。`);
    requiredFixes.push("日报 KPI 必须只使用 latestDataDate 当天完整记录，确保 rowsUsedForMetrics === dailyRows。");
  }

  if (!businessFieldMappingReady) {
    warnings.push("businessFieldMap 缺失，报告可能暴露 column、field、records 等技术词。");
    requiredFixes.push("补充业务字段映射，将技术字段转为订单、客户、品类、净销售额等业务语言。");
  }

  if (containsForbiddenBusinessTerms(context.outputText ?? "")) {
    blockingIssues.push("报告文本包含 column、field、records contribution、objects、AverageRating Share、App 或 Install Value 等不适合当前业务的表达。");
    requiredFixes.push("用 businessFieldMap 将技术字段和 App 模板表达改写为电商业务语言。");
  }

  if (ecommerceFieldScore(businessFieldMap) >= 4 && /app|application|app_market|install/i.test(String(context.detectedIndustry ?? ""))) {
    blockingIssues.push("电商订单字段被识别成 App / 应用商店数据。");
    requiredFixes.push("将行业识别修正为 ecommerce，并使用订单、客户、品类、销售额、退货率和履约效率模板。");
  }

  return {
    canGenerateReport: blockingIssues.length === 0,
    dataScope: scope,
    analysisSource: analysisSource(context),
    rowsUsed,
    dailyRows: dailyRows > 0 ? dailyRows : undefined,
    rowsUsedForMetrics: rowsUsedForMetrics > 0 ? rowsUsedForMetrics : undefined,
    sampleRowsCount: sampleRowsCount > 0 ? sampleRowsCount : undefined,
    expectedFullRows: expectedFullRows > 0 ? expectedFullRows : undefined,
    latestDataDate: context.latestDataDate ?? undefined,
    businessFieldMappingReady,
    blockingIssues,
    warnings,
    requiredFixes
  };
}
