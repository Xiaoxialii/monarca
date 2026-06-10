import type { SchemaTable } from "@/lib/metric-validation";

export type RegistryMetricLevel = 1 | 2;
export type RegistryReportType = "daily" | "weekly" | "custom";
export type RegistryDisplayFormat = "number" | "currency" | "percent" | "decimal" | "days";

export type BusinessMetricDefinition = {
  metricId: string;
  businessName: string;
  level: RegistryMetricLevel;
  category: string;
  formula: string;
  requiredFields: string[];
  fallbackFormula: string | null;
  dimension?: string | null;
  displayFormat: RegistryDisplayFormat;
  priority: number;
  isEstimated: boolean;
  description: string;
  allowedReports: RegistryReportType[];
  missingReason?: string;
};

const allReports: RegistryReportType[] = ["daily", "weekly", "custom"];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function tableLabel(table: SchemaTable) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function findColumn(table: SchemaTable, candidates: string[]) {
  return table.columns.find((column) => candidates.some((candidate) => normalize(column.name) === normalize(candidate))) ??
    table.columns.find((column) => candidates.some((candidate) => normalize(column.name).includes(normalize(candidate))));
}

function q(table: SchemaTable, field: string) {
  return `${tableLabel(table)}.${field}`;
}

function metric(input: Omit<BusinessMetricDefinition, "allowedReports" | "fallbackFormula" | "isEstimated"> & Partial<Pick<BusinessMetricDefinition, "allowedReports" | "fallbackFormula" | "isEstimated">>): BusinessMetricDefinition {
  return {
    allowedReports: allReports,
    fallbackFormula: null,
    isEstimated: false,
    ...input
  };
}

function addIfFields(output: BusinessMetricDefinition[], definition: BusinessMetricDefinition, table: SchemaTable) {
  const available = new Set(table.columns.map((column) => normalize(column.name)));
  const hasFields = definition.requiredFields.every((field) => available.has(normalize(field)));

  if (hasFields) output.push(definition);
}

function dimensionMetrics({
  output,
  table,
  dimension,
  prefix,
  category,
  order,
  customer,
  netSales,
  returned,
  rating
}: {
  output: BusinessMetricDefinition[];
  table: SchemaTable;
  dimension: string | null;
  prefix: string;
  category: string;
  order: string | null;
  customer?: string | null;
  netSales: string | null;
  returned: string | null;
  rating: string | null;
}) {
  if (!dimension) return;
  if (order) addIfFields(output, metric({
    metricId: `${prefix}_orders`,
    businessName: `${category}订单数`,
    level: 2,
    category,
    formula: `COUNT_DISTINCT(${q(table, order)}) BY ${q(table, dimension)}`,
    requiredFields: [order, dimension],
    dimension,
    displayFormat: "number",
    priority: 1,
    description: `按${category}拆分的订单数。`
  }), table);
  if (customer) addIfFields(output, metric({
    metricId: `${prefix}_customers`,
    businessName: `${category}客户数`,
    level: 2,
    category,
    formula: `COUNT_DISTINCT(${q(table, customer)}) BY ${q(table, dimension)}`,
    requiredFields: [customer, dimension],
    dimension,
    displayFormat: "number",
    priority: 2,
    description: `按${category}拆分的客户数。`
  }), table);
  if (netSales) addIfFields(output, metric({
    metricId: `${prefix}_net_sales`,
    businessName: `${category}净销售额`,
    level: 2,
    category,
    formula: `SUM(${q(table, netSales)}) BY ${q(table, dimension)}`,
    requiredFields: [netSales, dimension],
    dimension,
    displayFormat: "currency",
    priority: 1,
    description: `按${category}拆分的净销售额。`
  }), table);
  if (netSales && order) addIfFields(output, metric({
    metricId: `${prefix}_aov`,
    businessName: `${category}平均客单价`,
    level: 2,
    category,
    formula: `SAFE_DIVIDE(SUM(${q(table, netSales)}), COUNT_DISTINCT(${q(table, order)})) BY ${q(table, dimension)}`,
    requiredFields: [netSales, order, dimension],
    dimension,
    displayFormat: "currency",
    priority: 3,
    description: `按${category}拆分的平均客单价。`
  }), table);
  if (returned && order) addIfFields(output, metric({
    metricId: `${prefix}_return_rate`,
    businessName: `${category}退货率`,
    level: 2,
    category,
    formula: `SAFE_DIVIDE(COUNT_IF(${q(table, returned)} = 1), COUNT_DISTINCT(${q(table, order)})) BY ${q(table, dimension)}`,
    requiredFields: [returned, order, dimension],
    dimension,
    displayFormat: "percent",
    priority: 4,
    description: `按${category}拆分的退货率。`
  }), table);
  if (rating) addIfFields(output, metric({
    metricId: `${prefix}_average_rating`,
    businessName: `${category}平均客户评分`,
    level: 2,
    category,
    formula: `AVG(${q(table, rating)}) BY ${q(table, dimension)}`,
    requiredFields: [rating, dimension],
    dimension,
    displayFormat: "decimal",
    priority: 5,
    description: `按${category}拆分的平均客户评分。`
  }), table);
}

export function ecommerceMetricRegistryForTable(table: SchemaTable) {
  const order = findColumn(table, ["order_id"])?.name ?? null;
  const customer = findColumn(table, ["customer_id"])?.name ?? null;
  const netSales = findColumn(table, ["net_sales"])?.name ?? null;
  const totalPaid = findColumn(table, ["total_paid"])?.name ?? null;
  const grossSales = findColumn(table, ["gross_sales"])?.name ?? null;
  const quantity = findColumn(table, ["quantity"])?.name ?? null;
  const returned = findColumn(table, ["is_returned"])?.name ?? null;
  const rating = findColumn(table, ["customer_rating", "rating", "review_score"])?.name ?? null;
  const fulfillmentDays = findColumn(table, ["fulfillment_days"])?.name ?? null;
  const discountAmount = findColumn(table, ["discount_amount"])?.name ?? null;
  const unitPrice = findColumn(table, ["unit_price", "price"])?.name ?? null;
  const category = findColumn(table, ["category", "product_category"])?.name ?? null;
  const product = findColumn(table, ["product_id", "product", "sku"])?.name ?? null;
  const channel = findColumn(table, ["sales_channel", "channel"])?.name ?? null;
  const country = findColumn(table, ["country", "market"])?.name ?? null;
  const segment = findColumn(table, ["customer_segment", "segment"])?.name ?? null;
  const output: BusinessMetricDefinition[] = [];

  if (order) addIfFields(output, metric({
    metricId: "orders",
    businessName: "订单数",
    level: 1,
    category: "Orders",
    formula: `COUNT_DISTINCT(${q(table, order)})`,
    requiredFields: [order],
    displayFormat: "number",
    priority: 2,
    description: "订单规模，按订单编号去重统计。"
  }), table);
  if (customer) addIfFields(output, metric({
    metricId: "customers",
    businessName: "客户数",
    level: 1,
    category: "Customers",
    formula: `COUNT_DISTINCT(${q(table, customer)})`,
    requiredFields: [customer],
    displayFormat: "number",
    priority: 3,
    description: "客户规模，按客户编号去重统计。"
  }), table);
  if (netSales) addIfFields(output, metric({
    metricId: "net_sales",
    businessName: "净销售额",
    level: 1,
    category: "Revenue",
    formula: `SUM(${q(table, netSales)})`,
    requiredFields: [netSales],
    displayFormat: "currency",
    priority: 1,
    description: "扣除折扣、退货等影响后的销售收入。"
  }), table);
  if (totalPaid) addIfFields(output, metric({
    metricId: "total_paid",
    businessName: "实付金额",
    level: 1,
    category: "Revenue",
    formula: `SUM(${q(table, totalPaid)})`,
    requiredFields: [totalPaid],
    displayFormat: "currency",
    priority: 5,
    description: "客户实际支付金额汇总。"
  }), table);
  if (grossSales) addIfFields(output, metric({
    metricId: "gross_sales",
    businessName: "商品销售额",
    level: 1,
    category: "Revenue",
    formula: `SUM(${q(table, grossSales)})`,
    requiredFields: [grossSales],
    displayFormat: "currency",
    priority: 10,
    description: "折扣前商品销售额汇总。"
  }), table);
  if (netSales && order) addIfFields(output, metric({
    metricId: "aov",
    businessName: "平均客单价",
    level: 1,
    category: "Revenue",
    formula: `SAFE_DIVIDE(SUM(${q(table, netSales)}), COUNT_DISTINCT(${q(table, order)}))`,
    requiredFields: [netSales, order],
    displayFormat: "currency",
    priority: 4,
    description: "净销售额除以订单数。"
  }), table);
  if (quantity) addIfFields(output, metric({
    metricId: "units_sold",
    businessName: "销售件数",
    level: 1,
    category: "Orders",
    formula: `SUM(${q(table, quantity)})`,
    requiredFields: [quantity],
    displayFormat: "number",
    priority: 6,
    description: "售出商品数量汇总。"
  }), table);
  if (returned && order) addIfFields(output, metric({
    metricId: "return_rate",
    businessName: "退货率",
    level: 1,
    category: "Operations",
    formula: `SAFE_DIVIDE(COUNT_IF(${q(table, returned)} = 1), COUNT_DISTINCT(${q(table, order)}))`,
    requiredFields: [returned, order],
    displayFormat: "percent",
    priority: 7,
    description: "退货订单数除以订单数。"
  }), table);
  if (rating) addIfFields(output, metric({
    metricId: "average_rating",
    businessName: "平均客户评分",
    level: 1,
    category: "Customer Experience",
    formula: `AVG(${q(table, rating)})`,
    requiredFields: [rating],
    displayFormat: "decimal",
    priority: 8,
    description: "所有非空客户评分的订单级平均值。"
  }), table);
  if (fulfillmentDays) addIfFields(output, metric({
    metricId: "fulfillment_days",
    businessName: "平均履约天数",
    level: 1,
    category: "Operations",
    formula: `AVG(${q(table, fulfillmentDays)})`,
    requiredFields: [fulfillmentDays],
    displayFormat: "days",
    priority: 9,
    description: "所有非空履约天数的订单级平均值。"
  }), table);
  if (!netSales && !totalPaid && unitPrice && quantity) addIfFields(output, metric({
    metricId: "estimated_gmv",
    businessName: "估算GMV",
    level: 1,
    category: "Revenue",
    formula: `SUM(${q(table, unitPrice)} * ${q(table, quantity)})`,
    requiredFields: [unitPrice, quantity],
    displayFormat: "currency",
    priority: 20,
    isEstimated: true,
    description: "缺少真实收入字段时，用单价乘以数量估算。"
  }), table);

  dimensionMetrics({ output, table, dimension: category, prefix: "category", category: "品类", order, netSales, returned, rating });
  dimensionMetrics({ output, table, dimension: product, prefix: "product", category: "商品", order, netSales, returned, rating });
  dimensionMetrics({ output, table, dimension: channel, prefix: "channel", category: "渠道", order, netSales, returned, rating });
  dimensionMetrics({ output, table, dimension: country, prefix: "country", category: "国家/市场", order, netSales, returned, rating });
  dimensionMetrics({ output, table, dimension: segment, prefix: "segment", category: "客户分层", order, customer, netSales, returned, rating: null });

  if (discountAmount) addIfFields(output, metric({
    metricId: "discount_amount",
    businessName: "折扣金额",
    level: 2,
    category: "Discount",
    formula: `SUM(${q(table, discountAmount)})`,
    requiredFields: [discountAmount],
    displayFormat: "currency",
    priority: 1,
    description: "折扣金额汇总。"
  }), table);
  if (discountAmount && grossSales) addIfFields(output, metric({
    metricId: "discount_rate",
    businessName: "折扣率",
    level: 2,
    category: "Discount",
    formula: `SAFE_DIVIDE(SUM(${q(table, discountAmount)}), SUM(${q(table, grossSales)}))`,
    requiredFields: [discountAmount, grossSales],
    displayFormat: "percent",
    priority: 2,
    description: "折扣金额除以商品销售额。"
  }), table);

  return output;
}

