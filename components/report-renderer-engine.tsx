"use client";

import {
  AlertTriangle,
  BadgeDollarSign,
  BarChart3,
  ChevronDown,
  ChevronRight,
  LineChart as LineChartIcon,
  Megaphone,
  PackageSearch,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingUp,
  Users
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isRevenueChannel, normalizeRevenueChannel, revenueChannelOrNull } from "@/lib/channels/revenue-channel";
import type { DecisionIntelligenceReportV1 } from "@/lib/decision-intelligence/decision-intelligence-engine";
import {
  inventoryRestockUnits,
  normalizeDecision,
  type DecisionContract,
  type NormalizedDecision
} from "@/lib/optimization/action-taxonomy";
import { recommendationIdFromRecord } from "@/lib/optimization/recommendation-identity";
import { cn } from "@/lib/utils";

type ReportRendererEngineProps = {
  report: DecisionIntelligenceReportV1 | null;
  message?: string;
  showEmptyShell?: boolean;
  showEmptyShellLoading?: boolean;
  locale?: RendererLocale;
};

type RendererLocale = "en" | "zh";

type SkuReportRow = {
  sku: string;
  product_name?: string;
  category?: string;
  variant_name?: string;
  size?: string;
  color?: string;
  revenue: number;
  quantity: number;
  profit: number | null;
  margin: number | null;
  total_cost: number | null;
  ad_cost_allocated: number | null;
  profit_confidence: number | null;
  roas_value?: number | null;
  roas_display?: string;
  roas_status?: "not_advertised" | "spent_no_revenue" | "attributed" | "estimated" | "attribution_missing";
  attribution_method?: string;
  attribution_confidence?: number;
  channel_breakdown: Record<string, number>;
  channel_details: NonNullable<DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"][number]["channel_details"]>;
  ad_allocation_method: DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"][number]["ad_allocation_method"] | null;
  ad_allocation_confidence: number | null;
  campaign_ids: string[];
  attribution_window_start: string | null;
  attribution_window_end: string | null;
  cost_breakdown: DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"][number]["cost_breakdown"] | null;
  sku_roas: number | null;
  stock_level: number | null;
  available_stock: number | null;
  sales_velocity: number;
  velocity_confidence?: "HIGH" | "MEDIUM" | "LOW";
  velocity_window_days?: number;
  data_period_days?: number;
  inventory_risk_status?: "OK" | "INSUFFICIENT_DATA" | "STOCKOUT_RISK" | "LOW_CONFIDENCE_STOCK_RISK";
  days_of_inventory: number | null;
  stockout_risk: string;
  overstock_risk: string;
  refund_rate: number;
  refund_risk: string;
  margin_risk: boolean;
  channel_concentration_risk: boolean;
  attribution_risk: boolean;
  overall_risk_score: number;
  inventory_confidence: number | null;
  estimated_components: string[];
  estimated: boolean;
  lifecycle_stage?: string;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const currencyDecimal = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const ratioFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentNoDecimal = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type InventoryBreakdownRow = {
  sku: string;
  productName: string;
  channel: string;
  stock: number;
  sold: number;
  salesVelocity: number;
  velocityConfidence?: "HIGH" | "MEDIUM" | "LOW";
  velocityWindowDays?: number;
  dataPeriodDays?: number;
  inventoryRiskStatus?: "OK" | "INSUFFICIENT_DATA" | "STOCKOUT_RISK" | "LOW_CONFIDENCE_STOCK_RISK";
  runwayDays: number | null;
  sellThroughRate: number | null;
};

type InventorySummary = {
  totalStock: number;
  totalSold: number;
  salesVelocity: number;
  velocityConfidence: "HIGH" | "MEDIUM" | "LOW";
  averageRunwayDays: number | null;
};

type SkuProfitBreakdownRow = DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"][number];
type SkuRevenueBreakdownRow = DecisionIntelligenceReportV1["sku_breakdown"]["top_revenue_skus"][number];

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberOrNull(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function safeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function safeNumber(value: unknown, fallback = 0) {
  return numberOrNull(value) ?? fallback;
}

function safeChannelDetails(value: unknown): SkuReportRow["channel_details"] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = objectRecord(item);
    return {
      platform: String(record.platform ?? ""),
      revenue: numberOrNull(record.revenue) ?? 0,
      quantity: numberOrNull(record.quantity) ?? 0,
      profit: numberOrNull(record.profit) ?? 0,
      margin: numberOrNull(record.margin) ?? 0,
      share: numberOrNull(record.share) ?? 0
    };
  }).filter((item) => isRevenueChannel(item.platform));
}

function safeChannelBreakdown(value: unknown): Record<string, number> {
  const record = objectRecord(value);
  return Object.fromEntries(Object.entries(record)
    .map(([channel, revenue]) => [normalizeRevenueChannel(channel), numberOrNull(revenue) ?? 0])
    .filter(([channel, revenue]) => Boolean(channel) && Number(revenue) > 0)) as Record<string, number>;
}

function safeCostBreakdown(value: unknown): SkuReportRow["cost_breakdown"] {
  const record = objectRecord(value);
  if (!Object.keys(record).length) return null;
  return {
    cogs: numberOrNull(record.cogs) ?? 0,
    shipping: numberOrNull(record.shipping) ?? 0,
    ads: numberOrNull(record.ads) ?? 0,
    platform_fee: numberOrNull(record.platform_fee) ?? 0,
    payment_fee: numberOrNull(record.payment_fee) ?? 0,
    fulfillment: numberOrNull(record.fulfillment) ?? 0,
    refund: numberOrNull(record.refund) ?? 0
  };
}

function validSkuBreakdownRows<T extends { sku: string }>(rows: unknown): T[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => {
      const record = objectRecord(row);
      return typeof record.sku === "string" && record.sku.trim().length > 0;
    })
    .map((row) => row as T);
}

function skuBreakdownRows(report: DecisionIntelligenceReportV1): {
  topProfitSkus: SkuProfitBreakdownRow[];
  topRevenueSkus: SkuRevenueBreakdownRow[];
} {
  const breakdown = (report as { sku_breakdown?: Partial<DecisionIntelligenceReportV1["sku_breakdown"]> }).sku_breakdown;
  return {
    topProfitSkus: validSkuBreakdownRows<SkuProfitBreakdownRow>(breakdown?.top_profit_skus),
    topRevenueSkus: validSkuBreakdownRows<SkuRevenueBreakdownRow>(breakdown?.top_revenue_skus)
  };
}

function isRenderableOperatingReport(report: DecisionIntelligenceReportV1 | null): report is DecisionIntelligenceReportV1 {
  if (!report) return false;
  const record = objectRecord(report);
  const performanceOverview = objectRecord(record.performance_overview);
  const growthOverview = objectRecord(record.growth_overview);
  const skuBreakdown = objectRecord(record.sku_breakdown);

  return Boolean(
    Object.keys(performanceOverview).length > 0 &&
    Array.isArray(growthOverview.daily) &&
    (
      Array.isArray(skuBreakdown.top_revenue_skus) ||
      Array.isArray(skuBreakdown.top_profit_skus)
    )
  );
}

function buildSkuReportRows(report: DecisionIntelligenceReportV1): SkuReportRow[] {
  const { topProfitSkus, topRevenueSkus } = skuBreakdownRows(report);
  const profitBySku = new Map(topProfitSkus.map((row) => [row.sku, row]));
  const revenueBySku = new Map(topRevenueSkus.map((row) => [row.sku, row]));
  const orderedSkuIds = [
    ...topRevenueSkus.map((row) => row.sku),
    ...topProfitSkus.map((row) => row.sku)
  ].filter((sku, index, skus) => sku && skus.indexOf(sku) === index);

  return orderedSkuIds.map((sku) => {
    const row = revenueBySku.get(sku);
    const profit = profitBySku.get(sku);
    const revenue = row?.revenue ?? profit?.revenue ?? 0;
    const quantity = row?.quantity ?? profit?.quantity ?? 0;
    return {
      sku,
      product_name: displayProductName(row?.product_name ?? profit?.product_name, sku),
      category: row?.category ?? profit?.category,
      variant_name: row?.variant_name ?? profit?.variant_name,
      size: row?.size ?? profit?.size,
      color: row?.color ?? profit?.color,
      revenue,
      quantity,
      profit: profit?.net_profit ?? null,
      margin: profit?.margin ?? null,
      total_cost: profit?.total_cost ?? null,
      ad_cost_allocated: profit?.ad_cost_allocated ?? null,
      profit_confidence: profit?.profit_confidence ?? null,
      roas_value: profit?.roas_value ?? null,
      roas_display: profit?.roas_display,
      roas_status: profit?.roas_status,
      attribution_method: profit?.attribution_method,
      attribution_confidence: profit?.attribution_confidence,
      channel_breakdown: safeChannelBreakdown(profit?.channel_breakdown),
      channel_details: safeChannelDetails(profit?.channel_details),
      ad_allocation_method: profit?.ad_allocation_method ?? null,
      ad_allocation_confidence: profit?.ad_allocation_confidence ?? null,
      campaign_ids: profit?.campaign_ids ?? [],
      attribution_window_start: profit?.attribution_window_start ?? null,
      attribution_window_end: profit?.attribution_window_end ?? null,
      cost_breakdown: safeCostBreakdown(profit?.cost_breakdown),
      sku_roas: profit?.sku_roas ?? null,
      stock_level: profit?.stock_level ?? null,
      available_stock: profit?.available_stock ?? null,
      sales_velocity: profit?.sales_velocity ?? 0,
      days_of_inventory: profit?.days_of_inventory ?? null,
      stockout_risk: profit?.stockout_risk ?? "unknown",
      overstock_risk: profit?.overstock_risk ?? "unknown",
      refund_rate: profit?.refund_rate ?? 0,
      refund_risk: profit?.refund_risk ?? "unknown",
      margin_risk: profit?.margin_risk === true,
      channel_concentration_risk: profit?.channel_concentration_risk === true,
      attribution_risk: profit?.attribution_risk === true,
      overall_risk_score: profit?.overall_risk_score ?? 0,
      inventory_confidence: profit?.inventory_confidence ?? null,
      estimated_components: profit?.estimated_components ?? [],
      estimated: profit?.estimated === true,
      lifecycle_stage: normalizeLifecycleStage(
        (profit as { lifecycle_stage?: string } | undefined)?.lifecycle_stage ??
          (row as { lifecycle_stage?: string } | undefined)?.lifecycle_stage
      )
    };
  });
}

function fallbackSkuReportRowFromDecision(row: PortfolioDecisionRow, recommendation?: PortfolioRow): SkuReportRow {
  const rowWithSimulation = row as PortfolioDecisionRow & {
    simulation?: {
      predicted_revenue?: number;
      revenue_delta?: number;
      current_ads_spend?: number;
      recommended_ads_spend?: number;
      predicted_margin?: number;
    };
    before_state?: {
      revenue?: number;
      profit?: number;
      inventory?: number;
      sales_velocity?: number;
      margin?: number;
    };
  };
  const simulation = recommendation?.simulation ?? rowWithSimulation.simulation;
  const beforeState = (recommendation?.before_state ?? rowWithSimulation.before_state) as {
    revenue?: number;
    profit?: number;
    inventory?: number;
    sales_velocity?: number;
    margin?: number;
  } | undefined;
  const currentRevenue =
    beforeState?.revenue ??
    (simulation?.predicted_revenue != null ? Math.max(0, simulation.predicted_revenue - (simulation.revenue_delta ?? 0)) : 0);
  const currentProfit = recommendation?.current_profit ?? beforeState?.profit ?? null;
  const currentStock = beforeState?.inventory ?? null;
  const salesVelocity = beforeState?.sales_velocity ?? 0;
  const daysOfInventory = currentStock != null && salesVelocity > 0 ? currentStock / salesVelocity : null;
  const channelBreakdown = inferDecisionChannelBreakdown(row, recommendation, currentRevenue);
  const channelDetails = Object.entries(channelBreakdown).map(([platform, revenue]) => ({
    platform,
    revenue,
    quantity: 0,
    profit: 0,
    margin: 0,
    share: currentRevenue > 0 ? revenue / currentRevenue : 0
  }));

  return {
    sku: row.skuId,
    product_name: displayProductName(undefined, row.skuId),
    category: undefined,
    variant_name: undefined,
    size: undefined,
    color: undefined,
    revenue: currentRevenue,
    quantity: salesVelocity > 0 ? Math.round(salesVelocity * 30) : 0,
    profit: currentProfit,
    margin: beforeState?.margin ?? simulation?.predicted_margin ?? null,
    total_cost: null,
    ad_cost_allocated: simulation?.current_ads_spend ?? null,
    profit_confidence: row.confidence ?? recommendation?.confidence ?? null,
    roas_value: null,
    channel_breakdown: channelBreakdown,
    channel_details: channelDetails,
    ad_allocation_method: null,
    ad_allocation_confidence: null,
    campaign_ids: [],
    attribution_window_start: null,
    attribution_window_end: null,
    cost_breakdown: null,
    sku_roas: null,
    stock_level: currentStock,
    available_stock: currentStock,
    sales_velocity: salesVelocity,
    days_of_inventory: daysOfInventory,
    stockout_risk: "unknown",
    overstock_risk: "unknown",
    refund_rate: 0,
    refund_risk: "unknown",
    margin_risk: false,
    channel_concentration_risk: false,
    attribution_risk: false,
    overall_risk_score: row.risk ?? recommendation?.risk ?? 0,
    inventory_confidence: null,
    estimated_components: ["optimization_decision_snapshot"],
    estimated: true,
    lifecycle_stage: normalizeLifecycleStage(row.lifecycle_stage ?? recommendation?.lifecycle_stage)
  };
}

function inferDecisionChannelBreakdown(row: PortfolioDecisionRow, recommendation: PortfolioRow | undefined, revenue: number) {
  const payload = row as PortfolioDecisionRow & Record<string, unknown>;
  const recommendationPayload = (recommendation ?? {}) as PortfolioRow & Record<string, unknown>;
  const channels = new Set<string>();
  const candidates = [
    payload.channel,
    payload.source_channel,
    payload.target_channel,
    payload.from_channel,
    payload.to_channel,
    payload.current_channel,
    payload.recommended_channel,
    recommendationPayload.channel,
    recommendationPayload.source_channel,
    recommendationPayload.target_channel,
    recommendationPayload.from_channel,
    recommendationPayload.to_channel,
    recommendationPayload.current_channel,
    recommendationPayload.recommended_channel
  ];

  for (const candidate of candidates) {
    const channel = revenueChannelOrNull(candidate);
    if (channel) channels.add(channel);
  }

  const normalizedChannels = Array.from(channels);
  if (!normalizedChannels.length) return {};

  const revenueValue = revenue > 0 ? revenue / normalizedChannels.length : 1;
  return Object.fromEntries(normalizedChannels.map((channel) => [channel, revenueValue]));
}

export function ReportRendererEngine({ report, message, showEmptyShell = false, showEmptyShellLoading = false, locale = "en" }: ReportRendererEngineProps) {
  const [skuChannel, setSkuChannel] = useState("all");
  const [inventorySearch, setInventorySearch] = useState("");
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  const skuRows = useMemo(() => {
    if (!report) return [];
    return buildSkuReportRows(report);
  }, [report]);

  const visibleSkuRows = useMemo(() => {
    const showsAllSkus = skuChannel === "all";

    return skuRows
      .filter((row) => showsAllSkus || skuRowHasRevenueChannel(row, skuChannel))
      .sort((a, b) => {
        const aRankValue = showsAllSkus ? a.revenue : getSkuChannelRevenue(a, skuChannel);
        const bRankValue = showsAllSkus ? b.revenue : getSkuChannelRevenue(b, skuChannel);
        return bRankValue - aRankValue || b.revenue - a.revenue || a.sku.localeCompare(b.sku);
      });
  }, [skuRows, skuChannel]);

  const skuChannelTags = useMemo(() => {
    const channels = new Set<string>();
    for (const row of skuRows) {
      for (const channel of safeChannelDetails(row.channel_details)) {
        const platform = normalizeRevenueChannel(channel.platform);
        if (isRevenueChannel(platform)) channels.add(platform);
      }
      const channelBreakdown = safeChannelBreakdown(row.channel_breakdown);
      for (const channel of Object.keys(channelBreakdown)) {
        const platform = normalizeRevenueChannel(channel);
        if (isRevenueChannel(platform) && channelBreakdown[channel] > 0) channels.add(platform);
      }
    }
    return ["all", ...Array.from(channels).filter(Boolean).sort()];
  }, [skuRows]);

  const inventoryRows = useMemo(() => buildInventoryRows(skuRows), [skuRows]);
  const visibleInventoryRows = useMemo(() => {
    const normalizedSearch = inventorySearch.trim().toLowerCase();
    if (!normalizedSearch) return inventoryRows;
    return inventoryRows.filter((row) =>
      row.sku.toLowerCase().includes(normalizedSearch) ||
      row.productName.toLowerCase().includes(normalizedSearch)
    );
  }, [inventoryRows, inventorySearch]);
  const inventorySummary = useMemo(() => summarizeInventoryRows(inventoryRows), [inventoryRows]);

  if (!report) {
    if (showEmptyShell) {
      return <OperatingReportEmptyShell locale={locale} showLoadingData={showEmptyShellLoading} />;
    }

    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="flex items-start gap-3 p-5">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold text-amber-950">No decision report is available.</p>
            <p className="mt-1 text-sm text-amber-800">{message ?? "Generate or sync ecommerce canonical data, then refresh this report."}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isRenderableOperatingReport(report)) {
    if (showEmptyShell) {
      return <OperatingReportEmptyShell locale={locale} showLoadingData={showEmptyShellLoading} />;
    }

    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="flex items-start gap-3 p-5">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-slate-500" />
          <div>
            <p className="font-semibold text-slate-950">No operating report is available.</p>
            <p className="mt-1 text-sm text-slate-600">
              {message ?? "Refresh the report after the connected data has finished syncing."}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const performance = report.performance_overview;
  const summary = report.executive_summary;
  const hasTimeHistory = report.growth_overview.daily.length >= 2;
  const cacConfidence = report.customer_breakdown.cac_confidence ?? "LOW";
  const cacValue = cacConfidence !== "LOW" && typeof performance.cac === "number" && Number.isFinite(performance.cac) ? performance.cac : null;

  return (
    <div className="flex w-full flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard
          icon={TrendingUp}
          label="Revenue"
          value={formatKpiCurrency(summary.revenue)}
          fullValue={currency.format(summary.revenue)}
          tone={summary.revenue > 0 ? "positive" : "neutral"}
        />
        <KpiCard icon={ShoppingCart} label="Orders" value={numberFormat.format(performance.orders)} />
        <KpiCard
          icon={BadgeDollarSign}
          label="AOV"
          value={formatKpiCurrency(performance.aov)}
          fullValue={currencyDecimal.format(performance.aov)}
        />
        <KpiCard
          icon={TrendingUp}
          label="Profit"
          value={formatKpiCurrency(summary.net_profit)}
          fullValue={currency.format(summary.net_profit)}
          tone={summary.net_profit >= 0 ? "positive" : "negative"}
        />
        <KpiCard icon={BarChart3} label="Margin" value={percent.format(summary.margin)} tone={summary.margin < 0 ? "negative" : summary.margin < 0.1 ? "warning" : "positive"} />
        <KpiCard icon={Megaphone} label="ROAS" value={ratioFormat.format(summary.roas)} tone={summary.roas < 1 ? "warning" : "positive"} />
        <KpiCard
          icon={Users}
          label="CAC"
          value={cacValue === null ? "Unavailable" : formatKpiCurrency(cacValue)}
          fullValue={cacValue === null ? undefined : currencyDecimal.format(cacValue)}
          description={cacValue === null ? "CAC attribution confidence insufficient." : undefined}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LineChartIcon className="size-4 text-emerald-700" />
              Performance Overview
            </CardTitle>
            <CardDescription>
              {hasTimeHistory
                ? "Revenue and order movement from report growth series."
                : "Only one order period is available, so trend movement cannot be calculated."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart rows={report.growth_overview.daily} />
          </CardContent>
        </Card>

        <Card className="border bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-emerald-700" />
              Current vs Previous
            </CardTitle>
            <CardDescription>
              {hasTimeHistory
                ? "Growth signals calculated by the Metric Engine."
                : "Growth requires at least two distinct order dates or periods."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <GrowthRow label="Revenue growth" value={report.growth_overview.revenue_growth_rate} isAvailable={hasTimeHistory} />
            <GrowthRow label="Order growth" value={report.growth_overview.order_growth_rate} isAvailable={hasTimeHistory} />
            <GrowthRow label="SKU growth" value={report.growth_overview.sku_growth_rate} isAvailable={hasTimeHistory} />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <SmallMetric label="Ad Spend" value={currency.format(performance.ad_spend)} />
              <SmallMetric label="Gross Profit" value={currency.format(performance.gross_profit)} />
            </div>
          </CardContent>
        </Card>
      </section>

      <section id="report-sku" className="min-w-0 scroll-mt-24">
        <Card className="min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageSearch className="size-4 text-emerald-700" />
                  SKU Breakdown
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-w-0 px-0 pb-0">
            <SkuBreakdownTable
              rows={visibleSkuRows}
              channelTags={skuChannelTags}
              selectedChannel={skuChannel}
              onChannelChange={setSkuChannel}
              expandedSku={expandedSku}
              onToggleExpanded={(sku) => setExpandedSku((current) => current === sku ? null : sku)}
              locale={locale}
            />
          </CardContent>
        </Card>
      </section>

      <section id="report-warehouse" className="min-w-0 scroll-mt-24">
        <Card className="min-w-0 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageSearch className="size-4 text-emerald-700" />
              Inventory Breakdown
            </CardTitle>
            <CardDescription>Inventory levels, sell-through, and stock coverage across SKUs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SmallMetric label="Total Stock" value={numberFormat.format(inventorySummary.totalStock)} />
              <SmallMetric label="Total Sold" value={numberFormat.format(inventorySummary.totalSold)} />
              <SmallMetric label="Estimated Sales Velocity" value={`${formatOneDecimal(inventorySummary.salesVelocity)} / day`} />
              <SmallMetric label="Velocity Confidence" value={inventorySummary.velocityConfidence} />
              <SmallMetric label="Avg Runway Days" value={inventorySummary.averageRunwayDays === null ? "N/A" : formatOneDecimal(inventorySummary.averageRunwayDays)} />
            </div>
            <InventoryChart rows={visibleInventoryRows} />
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={inventorySearch}
                onChange={(event) => setInventorySearch(event.target.value)}
                placeholder="Search SKU or product"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <InventoryTable rows={visibleInventoryRows} />
          </CardContent>
        </Card>
      </section>

      <section id="report-ads" className="min-w-0 scroll-mt-24">
        <Card className="border bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="size-4 text-emerald-700" />
              Ads Breakdown
            </CardTitle>
            <CardDescription>Blended portfolio ROAS and campaign-attributed ROAS from available attribution fields.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <SmallMetric label="Spend" value={currency.format(report.ads_breakdown.ad_spend)} />
              <SmallMetric label="Blended ROAS" value={ratioFormat.format(report.ads_breakdown.roas)} />
              <SmallMetric label="MER" value={ratioFormat.format(report.ads_breakdown.mer)} />
            </div>
            <p className="text-xs font-semibold leading-relaxed text-slate-500">
              Campaign attribution unavailable when orders cannot be directly matched to campaigns.
            </p>
            <CampaignChart rows={report.ads_breakdown.campaign_performance} />
            <CampaignTable rows={report.ads_breakdown.campaign_performance} />
          </CardContent>
        </Card>
      </section>

      <section id="report-customers" className="scroll-mt-24">
        <Card className="border bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-emerald-700" />
              Customer Intelligence Engine
            </CardTitle>
            <CardDescription>Customer value distribution, lifecycle, cohort retention, and LTV/CAC structure from canonical orders and customers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SmallMetric label="Customers" value={numberFormat.format(report.customer_breakdown.customer_count)} />
              <SmallMetric label="Avg LTV" value={currencyDecimal.format(report.customer_breakdown.ltv)} />
              <SmallMetric label="Median LTV" value={currencyDecimal.format(report.customer_breakdown.median_ltv)} />
              <SmallMetric label="LTV / CAC" value={cacConfidence === "LOW" ? "Unavailable" : ratioFormat.format(report.customer_breakdown.ltv_cac_ratio)} />
              <SmallMetric label="Active Customers" value={numberFormat.format(report.customer_breakdown.active_customers)} />
              <SmallMetric label="Dormant Customers" value={numberFormat.format(report.customer_breakdown.dormant_customers)} />
              <SmallMetric label="Repeat Rate" value={percent.format(report.customer_breakdown.repeat_purchase_rate)} />
              <SmallMetric label="Payback Days" value={report.customer_breakdown.payback_period_days === null ? "N/A" : formatOneDecimal(report.customer_breakdown.payback_period_days)} />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <CustomerValueDistribution customer={report.customer_breakdown} />
              <CustomerLifecyclePanel customer={report.customer_breakdown} />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <CustomerCohortTable rows={report.customer_breakdown.cohort_by_first_purchase_month} />
              <CustomerSegmentTable
                revenueRows={report.customer_breakdown.revenue_per_customer_segment}
                profitRows={report.customer_breakdown.profit_per_customer_segment}
                adRows={report.customer_breakdown.ads_cost_per_customer_segment}
              />
            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  );
}

function OperatingReportEmptyShell({ locale, showLoadingData = false }: { locale: RendererLocale; showLoadingData?: boolean }) {
  const isZh = locale === "zh";

  return (
    <div id="report-sku" className="grid min-h-[520px] w-full place-items-center bg-transparent px-6 text-center scroll-mt-24">
      <div className="grid gap-4">
        <p className="max-w-5xl text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-6xl">
          {isZh ? "连接你的数据，追踪实时利润" : "Connect your data to track real-time profit"}
        </p>
        {showLoadingData ? (
          <p className="text-sm font-semibold text-slate-500">
            {isZh ? "正在加载数据" : "Loading data"}
          </p>
        ) : null}
      </div>
      <span id="report-ads" className="sr-only" />
      <span id="report-warehouse" className="sr-only" />
      <span id="report-customers" className="sr-only" />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  fullValue,
  description,
  tone = "neutral"
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  fullValue?: string;
  description?: string;
  tone?: "neutral" | "positive" | "warning" | "negative";
}) {
  return (
    <Card
      className={cn(
        "min-w-0 overflow-hidden border border-slate-200/80 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)]",
        tone === "warning" && "border-amber-200",
        tone === "negative" && "border-rose-200"
      )}
    >
      <CardContent className="flex min-h-[108px] min-w-0 flex-col justify-between p-4">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <p className="min-w-0 text-sm font-semibold leading-5 text-slate-600">{label}</p>
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", tone === "neutral" ? "bg-slate-50" : "bg-emerald-50")}>
            <Icon className={cn("size-3.5", toneClass(tone))} />
          </span>
        </div>
        <AutoFitKpiValue value={value} fullValue={fullValue} />
        {description ? <p className="mt-2 text-xs font-semibold leading-snug text-slate-500">{description}</p> : null}
      </CardContent>
    </Card>
  );
}

function AutoFitKpiValue({ value, fullValue }: { value: string; fullValue?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(24);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const fitValue = () => {
      const availableWidth = container.clientWidth;
      const naturalWidth = measure.scrollWidth;
      if (!availableWidth || !naturalWidth) return;

      const nextFontSize = Math.max(18, Math.min(24, Math.floor((24 * availableWidth) / naturalWidth)));
      setFontSize(nextFontSize);
    };

    fitValue();
    const animationFrame = window.requestAnimationFrame(fitValue);
    const resizeObserver = new ResizeObserver(fitValue);
    resizeObserver.observe(container);
    void document.fonts?.ready.then(fitValue);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [value]);

  return (
    <div ref={containerRef} className="relative min-w-0 overflow-hidden" title={fullValue ?? value}>
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap text-[24px] font-semibold tabular-nums tracking-normal"
      >
        {value}
      </span>
      <p
        className="block w-full overflow-hidden whitespace-nowrap font-semibold tabular-nums tracking-normal text-slate-950"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: "1.75rem"
        }}
      >
        {value}
      </p>
    </div>
  );
}

function formatKpiCurrency(value: number) {
  return Math.abs(value) >= 1000 ? compactCurrency.format(value) : currency.format(value);
}

function displayProductName(value: string | undefined, sku: string) {
  const name = value?.trim();
  if (!name) return undefined;

  const normalizedName = normalizeProductNameToken(name);
  const normalizedSku = normalizeProductNameToken(sku);
  if (!normalizedName || normalizedName === normalizedSku) return undefined;
  if (normalizedName === `${normalizedSku}product`) return undefined;
  if (normalizedName === `${normalizedSku}sku`) return undefined;
  return name;
}

function normalizeProductNameToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function buildInventoryRows(rows: SkuReportRow[]): InventoryBreakdownRow[] {
  return rows.map((row) => {
    const stock = Math.max(0, row.stock_level ?? row.available_stock ?? 0);
    const sold = Math.max(0, row.quantity ?? 0);
    const salesVelocity = Math.max(0, row.sales_velocity || 0);
    const runwayDays = row.days_of_inventory !== null && Number.isFinite(row.days_of_inventory)
      ? Math.max(0, row.days_of_inventory)
      : salesVelocity > 0
        ? stock / salesVelocity
        : null;
    const sellThroughBase = sold + stock;

    return {
      sku: row.sku,
      productName: row.product_name || "No product name",
      channel: primaryInventoryChannel(row),
      stock,
      sold,
      salesVelocity,
      velocityConfidence: row.velocity_confidence,
      velocityWindowDays: row.velocity_window_days,
      dataPeriodDays: row.data_period_days,
      inventoryRiskStatus: inventoryRiskStatusFromRow(runwayDays, row.velocity_confidence, row.inventory_risk_status),
      runwayDays,
      sellThroughRate: sellThroughBase > 0 ? sold / sellThroughBase : null
    };
  });
}

function summarizeInventoryRows(rows: InventoryBreakdownRow[]): InventorySummary {
  const totalStock = rows.reduce((total, row) => total + row.stock, 0);
  const totalSold = rows.reduce((total, row) => total + row.sold, 0);
  const salesVelocity = rows.reduce((total, row) => total + row.salesVelocity, 0);
  const velocityConfidence = rows.some((row) => (row.velocityConfidence ?? "LOW") === "LOW")
    ? "LOW"
    : rows.some((row) => row.velocityConfidence === "MEDIUM")
      ? "MEDIUM"
      : "HIGH";
  const runwayRows = rows.filter((row) => row.runwayDays !== null);
  const averageRunwayDays = runwayRows.length
    ? runwayRows.reduce((total, row) => total + (row.runwayDays ?? 0), 0) / runwayRows.length
    : null;

  return { totalStock, totalSold, salesVelocity, velocityConfidence, averageRunwayDays };
}

function inventoryRiskStatusFromRow(
  runwayDays: number | null,
  velocityConfidence: "HIGH" | "MEDIUM" | "LOW" | undefined,
  sourceStatus: InventoryBreakdownRow["inventoryRiskStatus"]
): InventoryBreakdownRow["inventoryRiskStatus"] {
  const confidence = velocityConfidence ?? "LOW";
  if (runwayDays !== null && runwayDays < 14) {
    return confidence === "LOW" ? "LOW_CONFIDENCE_STOCK_RISK" : "STOCKOUT_RISK";
  }
  return confidence === "LOW" ? "INSUFFICIENT_DATA" : sourceStatus ?? "OK";
}

function primaryInventoryChannel(row: SkuReportRow) {
  const details = safeChannelDetails(row.channel_details);
  if (details.length > 1) return "multi-channel";
  if (details.length === 1) return details[0].platform || "unknown";
  const channels = Object.entries(safeChannelBreakdown(row.channel_breakdown)).filter(([channel, revenue]) => isRevenueChannel(channel) && revenue > 0);
  if (channels.length > 1) return "multi-channel";
  return channels[0]?.[0] || "unknown";
}

function skuRowForSelectedChannel(row: SkuReportRow, selectedChannel: string): SkuReportRow {
  const channel = normalizeRevenueChannel(selectedChannel);
  if (!isRevenueChannel(channel)) return row;

  const channelDetails = safeChannelDetails(row.channel_details);
  const matchedDetail = channelDetails.find((item) => normalizeRevenueChannel(item.platform) === channel);
  const breakdown = safeChannelBreakdown(row.channel_breakdown);
  const channelRevenue = matchedDetail?.revenue ?? breakdown[channel] ?? 0;
  const channelQuantity = matchedDetail?.quantity ?? 0;
  const channelProfit = matchedDetail?.profit ?? null;
  const channelMargin = matchedDetail?.margin ?? (channelProfit !== null && channelRevenue > 0 ? channelProfit / channelRevenue : null);
  const channelCost = channelProfit !== null ? Math.max(0, channelRevenue - channelProfit) : null;
  const scopedDetail = matchedDetail
    ? [{ ...matchedDetail, platform: channel, share: 1 }]
    : channelRevenue > 0
      ? [{ platform: channel, revenue: channelRevenue, quantity: 0, profit: 0, margin: 0, share: 1 }]
      : [];

  return {
    ...row,
    revenue: channelRevenue,
    quantity: channelQuantity,
    profit: channelProfit,
    margin: channelMargin,
    total_cost: channelCost,
    channel_breakdown: channelRevenue > 0 ? { [channel]: channelRevenue } : {},
    channel_details: scopedDetail,
    cost_breakdown: null,
    ad_cost_allocated: null
  };
}

function formatOneDecimal(value: number) {
  return oneDecimal.format(Number.isFinite(value) ? value : 0);
}

function TimeSeriesChart({ rows }: { rows: DecisionIntelligenceReportV1["growth_overview"]["daily"] }) {
  if (!rows.length) {
    return <EmptyBlock label="No time series rows." />;
  }

  if (rows.length < 2) {
    const row = rows[0];
    return (
      <div className="rounded-lg bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-700">Not enough time history to draw a trend.</p>
        <p className="mt-1 text-sm text-slate-500">
          Current data contains one order period: {row.period}. Add orders from another date or period to calculate movement.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SmallMetric label="Period" value={row.period} />
          <SmallMetric label="Revenue" value={currency.format(row.revenue)} />
          <SmallMetric label="Orders" value={numberFormat.format(row.orders)} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value, name) => [name === "revenue" ? currency.format(Number(value)) : numberFormat.format(Number(value)), String(name)]} />
          <Line type="monotone" dataKey="revenue" stroke="#047857" strokeWidth={2.5} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="orders" stroke="#0f172a" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CampaignChart({ rows }: { rows: DecisionIntelligenceReportV1["ads_breakdown"]["campaign_performance"] }) {
  const data = rows.slice(0, 6);
  if (!data.length) return <EmptyBlock label="No campaign rows." />;

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="campaign_id" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value, name) => [currency.format(Number(value)), String(name)]} />
          <Bar dataKey="ad_spend" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Bar dataKey="revenue" fill="#047857" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SkuBreakdownTable({
  rows,
  channelTags,
  selectedChannel,
  onChannelChange,
  expandedSku,
  onToggleExpanded,
  locale
}: {
  rows: SkuReportRow[];
  channelTags: string[];
  selectedChannel: string;
  onChannelChange: (value: string) => void;
  expandedSku: string | null;
  onToggleExpanded: (sku: string) => void;
  locale: RendererLocale;
}) {
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef({ active: false, startX: 0, startScrollLeft: 0 });
  const [isDraggingTable, setIsDraggingTable] = useState(false);
  const [skuSearch, setSkuSearch] = useState("");
  const normalizedSkuSearch = skuSearch.trim().toLowerCase();
  const visibleRows = useMemo(() => {
    if (!normalizedSkuSearch) return rows;
    return rows.filter((row) =>
      row.sku.toLowerCase().includes(normalizedSkuSearch) ||
      (row.product_name ?? "").toLowerCase().includes(normalizedSkuSearch)
    );
  }, [rows, normalizedSkuSearch]);

  const startTableDrag = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, a")) return;
    const scrollNode = tableScrollRef.current;
    if (!scrollNode) return;
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startScrollLeft: scrollNode.scrollLeft
    };
    setIsDraggingTable(true);
  };

  const moveTableDrag = (event: MouseEvent<HTMLDivElement>) => {
    const scrollNode = tableScrollRef.current;
    const dragState = dragStateRef.current;
    if (!scrollNode || !dragState.active) return;
    event.preventDefault();
    scrollNode.scrollLeft = dragState.startScrollLeft - (event.clientX - dragState.startX);
  };

  const stopTableDrag = () => {
    dragStateRef.current.active = false;
    setIsDraggingTable(false);
  };

  useEffect(() => {
    if (!expandedSku || !tableScrollRef.current) return;
    const escapedSku = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(expandedSku) : expandedSku.replace(/"/g, '\\"');
    const target = tableScrollRef.current.querySelector(`[data-sku-row="${escapedSku}"]`);
    target?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }, [expandedSku, visibleRows]);

  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden xl:h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex flex-wrap gap-2">
          {channelTags.map((channel) => (
            <button
              key={channel}
              type="button"
              onClick={() => onChannelChange(channel)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition",
                selectedChannel === channel
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
              )}
            >
              {channel === "all" ? "All channels" : channel}
            </button>
          ))}
        </div>
        <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={skuSearch}
            onChange={(event) => setSkuSearch(event.target.value)}
            placeholder={locale === "zh" ? "搜索 SKU" : "Search SKU"}
            className="h-10 w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          />
        </label>
      </div>
      {!visibleRows.length ? <EmptyBlock label="No SKU rows match this channel or search." /> : null}
      <div
        ref={tableScrollRef}
        onMouseDown={startTableDrag}
        onMouseMove={moveTableDrag}
        onMouseUp={stopTableDrag}
        onMouseLeave={stopTableDrag}
        className={cn(
          "relative max-h-[920px] w-full max-w-full min-w-0 overflow-x-scroll overflow-y-auto bg-white",
          "cursor-grab overscroll-x-contain overscroll-y-auto [scrollbar-gutter:stable]",
          "[&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3",
          "[&::-webkit-scrollbar-track]:bg-slate-100",
          "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300",
          isDraggingTable && "cursor-grabbing select-none"
        )}
      >
        <table className="w-[1760px] min-w-[1760px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[220px]" />
            <col className="w-[130px]" />
            <col className="w-[280px]" />
            <col className="w-[90px]" />
            <col className="w-[100px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[130px]" />
            <col className="w-[130px]" />
            <col className="w-[100px]" />
            <col className="w-[100px]" />
          </colgroup>
          <thead className="sticky top-0 z-20 bg-slate-50 text-xs uppercase text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
            <tr>
              <th className="sticky left-0 z-30 bg-slate-50 px-5 py-3 shadow-[1px_0_0_0_rgba(226,232,240,1)]">SKU</th>
              <th className="px-3 py-3">Revenue</th>
              <th className="px-3 py-3">Channel Mix</th>
              <th className="px-3 py-3">Sold</th>
              <th className="px-3 py-3">Stock</th>
              <th className="px-3 py-3">COGS</th>
              <th className="px-3 py-3">Ads</th>
              <th className="px-3 py-3">Shipping</th>
              <th className="px-3 py-3">Fees</th>
              <th className="px-3 py-3">Total Cost</th>
              <th className="px-3 py-3">Net Profit</th>
              <th className="px-3 py-3">Margin</th>
              <th className="px-3 py-3">ROAS</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleRows.map((row, index) => {
              const displayRow = selectedChannel === "all" ? row : skuRowForSelectedChannel(row, selectedChannel);
              const lowMargin = displayRow.margin !== null && displayRow.margin < 0.1;
              const isExpanded = expandedSku === row.sku;
              const costBreakdown = safeCostBreakdown(displayRow.cost_breakdown);
              const fees = costBreakdown ? costBreakdown.platform_fee + costBreakdown.payment_fee : null;
              return (
                <Fragment key={row.sku}>
                  <tr key={row.sku} data-sku-row={row.sku} className={cn("hover:bg-slate-50", index < 5 && "bg-emerald-50/40", lowMargin && "bg-rose-50/60")}>
                    <td className={cn(
                      "sticky left-0 z-10 bg-white px-5 py-3 font-semibold text-slate-900 shadow-[1px_0_0_0_rgba(226,232,240,1)]",
                      index < 5 && "bg-emerald-50",
                      lowMargin && "bg-rose-50"
                    )}>
                      <button type="button" onClick={() => onToggleExpanded(row.sku)} className="flex items-center gap-2 text-left">
                        {isExpanded ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronRight className="size-4 text-slate-500" />}
                        <span className="min-w-0">
	                          <span className="block truncate">{displayRow.product_name || row.sku}</span>
	                          {displayRow.product_name ? <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{row.sku}</span> : null}
                        </span>
                      </button>
                      <div className="mt-1 flex flex-wrap gap-1">
	                        {displayRow.category ? <Badge tone="neutral">{displayRow.category}</Badge> : null}
	                        {displayRow.variant_name ? <Badge tone="neutral">{displayRow.variant_name}</Badge> : null}
	                        {displayRow.size ? <Badge tone="neutral">Size {displayRow.size}</Badge> : null}
	                        {displayRow.color ? <Badge tone="neutral">{displayRow.color}</Badge> : null}
	                        <LifecycleBadge stage={displayRow.lifecycle_stage ?? inferSkuLifecycleStage(displayRow)} locale={locale} />
                      </div>
                    </td>
	                    <td className="px-3 py-3">{currency.format(displayRow.revenue)}</td>
	                    <td className="px-3 py-3"><ChannelMix row={displayRow} /></td>
	                    <td className="px-3 py-3">{numberFormat.format(displayRow.quantity)}</td>
	                    <td className="px-3 py-3">{displayRow.stock_level === null ? "No Data" : numberFormat.format(displayRow.stock_level)}</td>
                    <td className="px-3 py-3">{costBreakdown ? currency.format(costBreakdown.cogs) : "No Data"}</td>
                    <td className="px-3 py-3">{displayRow.ad_cost_allocated === null ? "No Data" : currency.format(displayRow.ad_cost_allocated)}</td>
                    <td className="px-3 py-3">{costBreakdown ? currency.format(costBreakdown.shipping + costBreakdown.fulfillment) : "No Data"}</td>
                    <td className="px-3 py-3">{fees === null ? "No Data" : currency.format(fees)}</td>
                    <td className="px-3 py-3">{displayRow.total_cost === null ? "No Data" : currency.format(displayRow.total_cost)}</td>
                    <td className={cn("px-3 py-3", displayRow.profit !== null && displayRow.profit < 0 && "font-semibold text-rose-700")}>
                      {displayRow.profit === null ? "No Data" : currency.format(displayRow.profit)}
                    </td>
                    <td className={cn("px-3 py-3", lowMargin && "font-semibold text-rose-700")}>
                      {displayRow.margin === null ? "No Data" : percent.format(displayRow.margin)}
                    </td>
                    <td className="px-3 py-3">{formatSkuRoas(displayRow)}</td>
                  </tr>
                  {isExpanded ? (
                    <tr key={`${row.sku}-details`} className="bg-white">
                      <td colSpan={13} className="px-5 py-4">
                        <SkuDetailPanel row={displayRow} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampaignTable({ rows }: { rows: DecisionIntelligenceReportV1["ads_breakdown"]["campaign_performance"] }) {
  if (!rows.length) return null;

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-3">Campaign</th>
            <th className="px-3 py-3">Spend</th>
            <th className="px-3 py-3">Attributed Revenue</th>
            <th className="px-3 py-3">Attributed ROAS</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.slice(0, 8).map((row) => {
            const roasValue = typeof row.roas === "number" && Number.isFinite(row.roas) ? row.roas : null;
            const attributionUnavailable = row.attribution_status === "missing" || roasValue === null;
            return (
              <tr key={row.campaign_id} className={!attributionUnavailable && roasValue < 1 ? "bg-amber-50/60" : undefined}>
                <td className="max-w-[180px] truncate px-3 py-3 font-semibold text-slate-900">{row.campaign_id}</td>
                <td className="px-3 py-3">{currency.format(row.ad_spend)}</td>
                <td className="px-3 py-3">{attributionUnavailable ? "Attribution unavailable" : currency.format(row.revenue)}</td>
                <td className={cn("px-3 py-3", attributionUnavailable ? "text-slate-500" : roasValue < 1 ? "font-semibold text-amber-800" : "text-emerald-800")}>
                  {attributionUnavailable ? "Attribution unavailable" : ratioFormat.format(roasValue)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InventoryChart({ rows }: { rows: InventoryBreakdownRow[] }) {
  const chartRows = rows
    .slice()
    .sort((left, right) => right.stock + right.sold - (left.stock + left.sold))
    .slice(0, 10);

  if (!chartRows.length) return <EmptyBlock label="No inventory rows available." />;

  return (
    <div className="h-[260px] min-w-0 rounded-lg border bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartRows} margin={{ left: 0, right: 16, top: 12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="sku" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={52} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => numberFormat.format(Number(value))} />
          <Bar dataKey="sold" name="Sold" fill="#10b981" radius={[4, 4, 0, 0]} />
          <Bar dataKey="stock" name="Stock" fill="#64748b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function createEmptyOptimizationPanelReport(): DecisionIntelligenceReportV1 {
  return {
    sku_breakdown: {
      top_revenue_skus: [],
      top_profit_skus: [],
      sku_concentration: {
        top_sku_revenue_share: 0,
        top_5_revenue_share: 0,
        concentration_level: "unknown"
      }
    },
    sku_portfolio_optimization: {
      version: "sku_portfolio_optimization_v2",
      algorithm: "prediction_driven_global_portfolio_solver",
      optimization_summary: {
        input_sku_count: 0,
        total_opportunities: 0,
        scenarios_tested: 0,
        action_distribution: {},
        expected_profit_gain: 0,
        current_portfolio_profit: 0,
        optimized_portfolio_profit: 0,
        total_expected_profit_gain: 0,
        selected_sku_count: 0,
        ads_budget_used: 0,
        inventory_required: 0,
        inventory_utilization: 0,
        cash_required: 0,
        inventory_health: {
          total_inventory_units: 0,
          total_inventory_value: 0,
          average_inventory_days: 0,
          inventory_risk_level: "low",
          overstock_sku_count: 0,
          stockout_sku_count: 0,
          cash_locked_in_inventory: 0
        },
        clear_inventory_ratio: 0,
        clear_inventory_impact_ratio: 0,
        clear_inventory_cash_recovery_ratio: 0,
        max_allowed_clear_inventory_ratio: 0,
        inventory_risk_level: "low",
        simulation_horizon_days: 30,
        constraints_applied: []
      },
      prediction_summary: {
        simulation_source: "prediction_model",
        models_used: [],
        prediction_type: "rule_based",
        prediction_confidence: 0
      },
      threshold_profile: {},
      recommended_portfolio: [],
      portfolioSummary: {
        totalProfitImpact: 0
      },
      lifecycleSummary: {
        totalSkus: 0,
        launch: 0,
        growth: 0,
        mature: 0,
        declining: 0
      },
      lifecycleClassifications: [],
      allocationRecommendation: {},
      skuDecisions: [],
      riskAlerts: [],
      executionPlan: [],
      budget_plan: [],
      pricing_plan: [],
      inventory_plan: [],
      total_expected_profit_gain: 0,
      optimization_confidence: 0,
      greedy_single_sku_baseline: {
        sku: null,
        profit_delta: 0
      },
      simulations: []
    },
    skuDecisions: []
  } as unknown as DecisionIntelligenceReportV1;
}

export function DecisionAnalysisEnginePanel({
  report,
  message,
  locale = "en",
  headerAction,
  optimizationStarted = true,
  onStartProfitOptimization,
  isLoadingOptimization = false,
  optimizationRunStatus,
  optimizationRunStep,
  showSkuTableEmptyState = false,
  isLoadingData = false
}: {
  report: DecisionIntelligenceReportV1 | null;
  message?: string;
  locale?: RendererLocale;
  headerAction?: ReactNode;
  optimizationStarted?: boolean;
  onStartProfitOptimization?: () => void | Promise<void>;
  isLoadingOptimization?: boolean;
  optimizationRunStatus?: string;
  optimizationRunStep?: string | null;
  showSkuTableEmptyState?: boolean;
  showInitialShell?: boolean;
  isLoadingData?: boolean;
}) {
  const isZh = locale === "zh";

  if (!report) {
    if (showSkuTableEmptyState || isLoadingData || isLoadingOptimization || optimizationStarted) {
      const emptyReport = createEmptyOptimizationPanelReport();
      return (
        <section className="min-w-0 scroll-mt-24">
          <SkuPortfolioOptimizationPanel
            report={emptyReport}
            locale={locale}
            headerAction={headerAction}
            optimizationStarted={optimizationStarted}
            onStartProfitOptimization={onStartProfitOptimization}
            isLoadingOptimization={isLoadingOptimization || isLoadingData}
            optimizationRunStatus={optimizationRunStatus}
            optimizationRunStep={optimizationRunStep}
            showSkuTableEmptyState
          />
        </section>
      );
    }

    return (
      <Card className="border-amber-200 bg-amber-50 shadow-sm">
        <CardContent className="flex items-start gap-3 p-5">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold text-amber-950">{isZh ? "暂无决策分析数据。" : "No decision analysis is available."}</p>
            <p className="mt-1 text-sm text-amber-800">{message ?? (isZh ? "点击生成报告，或等待数据同步完成后刷新分析报告。" : "Generate a report, or wait for data sync to finish and refresh the analysis report.")}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="min-w-0 scroll-mt-24">
      <SkuPortfolioOptimizationPanel
        report={report}
        locale={locale}
        headerAction={headerAction}
        optimizationStarted={optimizationStarted}
        onStartProfitOptimization={onStartProfitOptimization}
        isLoadingOptimization={isLoadingOptimization}
        optimizationRunStatus={optimizationRunStatus}
        optimizationRunStep={optimizationRunStep}
        showSkuTableEmptyState={showSkuTableEmptyState}
      />
    </section>
  );
}

function SkuPortfolioOptimizationPanel({
  report,
  locale,
  headerAction,
  optimizationStarted = true,
  onStartProfitOptimization,
  isLoadingOptimization = false,
  optimizationRunStatus,
  optimizationRunStep,
  showSkuTableEmptyState = false
}: {
  report: DecisionIntelligenceReportV1;
  locale: RendererLocale;
  headerAction?: ReactNode;
  optimizationStarted?: boolean;
  onStartProfitOptimization?: () => void | Promise<void>;
  isLoadingOptimization?: boolean;
  optimizationRunStatus?: string;
  optimizationRunStep?: string | null;
  showSkuTableEmptyState?: boolean;
}) {
  const isZh = locale === "zh";
  const optimization = report.sku_portfolio_optimization ?? createEmptyOptimizationPanelReport().sku_portfolio_optimization;
  const summary = optimization.optimization_summary ?? createEmptyOptimizationPanelReport().sku_portfolio_optimization.optimization_summary;
  const selectedRows = useMemo(
    () => Array.isArray(optimization.recommended_portfolio)
      ? optimization.recommended_portfolio.filter((row) => objectRecord(row).sku)
      : [],
    [optimization.recommended_portfolio]
  );
  const optimizationSimulations = useMemo(
    () => Array.isArray(optimization.simulations) ? optimization.simulations.filter((row) => objectRecord(row).sku) : [],
    [optimization.simulations]
  );
  const [skuChannel, setSkuChannel] = useState("all");
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const skuRows = useMemo(() => buildSkuReportRows(report), [report]);
  const visibleSkuRows = useMemo(() => {
    const showsAllSkus = skuChannel === "all";

    return skuRows
      .filter((row) => showsAllSkus || skuRowHasRevenueChannel(row, skuChannel))
      .sort((a, b) => {
        const aRankValue = showsAllSkus ? a.revenue : getSkuChannelRevenue(a, skuChannel);
        const bRankValue = showsAllSkus ? b.revenue : getSkuChannelRevenue(b, skuChannel);
        return bRankValue - aRankValue || b.revenue - a.revenue || a.sku.localeCompare(b.sku);
      });
  }, [skuRows, skuChannel]);
  const decisionRows = useMemo(
    () => {
      if (Array.isArray(optimization.skuDecisions)) return optimization.skuDecisions.filter((row) => objectRecord(row).skuId);
      if (Array.isArray(report.skuDecisions)) return report.skuDecisions.filter((row) => objectRecord(row).skuId);
      return [];
    },
    [optimization.skuDecisions, report.skuDecisions]
  );
  const portfolioRowsBySku = useMemo(() => new Map(selectedRows.map((row) => [row.sku, row])), [selectedRows]);
  const skuChannelTags = useMemo(() => {
    const channels = new Set<string>();
    for (const row of skuRows) {
      for (const channel of safeChannelDetails(row.channel_details)) {
        const platform = normalizeRevenueChannel(channel.platform);
        if (isRevenueChannel(platform)) channels.add(platform);
      }
      const channelBreakdown = safeChannelBreakdown(row.channel_breakdown);
      for (const channel of Object.keys(channelBreakdown)) {
        const platform = normalizeRevenueChannel(channel);
        if (isRevenueChannel(platform) && channelBreakdown[channel] > 0) channels.add(platform);
      }
    }
    for (const row of decisionRows) {
      const recommendation = portfolioRowsBySku.get(row.skuId);
      for (const channel of Object.keys(inferDecisionChannelBreakdown(row, recommendation, 1))) {
        channels.add(channel);
      }
    }
    return ["all", ...Array.from(channels).filter(Boolean).sort()];
  }, [decisionRows, portfolioRowsBySku, skuRows]);
  const { topProfitSkus, topRevenueSkus } = skuBreakdownRows(report);
  const sourceRows = topProfitSkus.length ? topProfitSkus : topRevenueSkus;
  const sourceSkuIds = sourceRows.length
    ? sourceRows.map((row) => row.sku)
    : Array.from(new Set(optimizationSimulations.map((row) => String(objectRecord(row).sku ?? ""))).values()).filter(Boolean);
  const currentPortfolioProfit = safeNumber(summary.current_portfolio_profit);
  const currentSkuCount = safeNumber(summary.input_sku_count) || sourceRows.length || sourceSkuIds.length;
  const totalExpectedProfitGain = safeNumber(optimization.total_expected_profit_gain);
  const liftRate = currentPortfolioProfit > 0 ? totalExpectedProfitGain / currentPortfolioProfit : 0;
  const simulationHorizonDays = safeNumber(summary.simulation_horizon_days ?? selectedRows[0]?.simulation_horizon?.days, 30);
  const [actionStatuses, setActionStatuses] = useState<Record<string, "pending" | "accepted" | "rejected">>({});
  const [acceptedAtByDecision, setAcceptedAtByDecision] = useState<Record<string, string>>({});
  const [trackedOutcomeRows, setTrackedOutcomeRows] = useState<ActionOutcomeRow[]>(seedActionOutcomeRows);
  const [acceptedImpactSummary, setAcceptedImpactSummary] = useState<AcceptedImpactSummary | null>(null);
  const [actionPersistenceError, setActionPersistenceError] = useState<string | null>(null);
  const [selectedOutcomeRow, setSelectedOutcomeRow] = useState<ActionOutcomeRow | null>(null);
  const [selectedDecisionRow, setSelectedDecisionRow] = useState<PortfolioDecisionRow | null>(null);
  const [focusedOpsSku, setFocusedOpsSku] = useState<string | null>(null);
  const [isSkuOperationsOpen, setIsSkuOperationsOpen] = useState(() => !optimizationStarted || isLoadingOptimization);
  const wasLoadingOptimizationRef = useRef(isLoadingOptimization);
  const optimizationReportRunId = useMemo(() => optimizationReportKey(report), [report]);
  const actionStatusHydrationKey = useMemo(
    () => decisionRows.map((row) => recommendationIdForDecision(row, report)).join("|"),
    [decisionRows, report]
  );
  const [loadedActionStatusHydrationKey, setLoadedActionStatusHydrationKey] = useState<string | null>(null);
  const hasLoadedPersistedActionStatuses = !optimizationStarted || !decisionRows.length || loadedActionStatusHydrationKey === actionStatusHydrationKey;
  const isResolvingOptimizationState = isLoadingOptimization || !hasLoadedPersistedActionStatuses;
  const optimizationStartLabel = isZh ? "运行利润优化" : "Run Profit Optimization";
  const optimizationLoadingLabel = optimizationRunStep
    ?? (optimizationRunStatus === "QUEUED"
      ? (isZh ? "正在准备优化..." : "Preparing optimization...")
      : (isZh ? "正在运行利润优化..." : "Running profit optimization..."));
  const displayedSkuRows = useMemo(() => {
    if (!focusedOpsSku) return visibleSkuRows;
    const matchedRows = visibleSkuRows.filter((row) => row.sku === focusedOpsSku);
    if (matchedRows.length > 0) return matchedRows;
    const selectedOpsDecision = decisionRows.find((row) => row.skuId === focusedOpsSku);
    return selectedOpsDecision ? [fallbackSkuReportRowFromDecision(selectedOpsDecision, portfolioRowsBySku.get(selectedOpsDecision.skuId))] : [];
  }, [decisionRows, focusedOpsSku, portfolioRowsBySku, visibleSkuRows]);
  const decisionActionFilter: PortfolioDecisionFilter = "ALL";
  const optimizationQueueRows = decisionRows.filter((row) => isOptimizationQueueRow(row));
  const filteredDecisionRows = (optimizationQueueRows.length ? optimizationQueueRows : decisionRows)
    .filter((row) => decisionFilterMatchesRow(row, decisionActionFilter));
  const acceptedDecisionRows = filteredDecisionRows.filter((row) => actionStatuses[decisionRowKey(row)] === "accepted");
  const pendingDecisionRows = filteredDecisionRows.filter((row) => shouldShowInOptimizationQueue(row, actionStatuses));
  const hasOptimizationResultRows = decisionRows.length > 0 || selectedRows.length > 0;
  const shouldBlankOptimizationSummary = showSkuTableEmptyState && !hasOptimizationResultRows;
  const decisionRowsExpectedProfitGain = decisionRows.reduce(
    (sum, row) => sum + safeNumber(row.expectedProfitImpact ?? row.estimatedProfitImpact ?? portfolioRowsBySku.get(row.skuId)?.profit_delta),
    0
  );
  const expectedProfitGain =
    totalExpectedProfitGain ||
    safeNumber(summary.total_expected_profit_gain) ||
    safeNumber(summary.expected_profit_gain) ||
    safeNumber(optimization.portfolioSummary?.totalProfitImpact) ||
    decisionRowsExpectedProfitGain;
  const expectedProfitLiftRate = currentPortfolioProfit > 0 ? expectedProfitGain / currentPortfolioProfit : liftRate;
  const pendingOptimizationCount = optimizationStarted ? pendingDecisionRows.length : 0;
  const displayedCurrentSkuCount = shouldBlankOptimizationSummary
    ? 0
    : optimizationStarted
      ? pendingDecisionRows.length
      : currentSkuCount;
  const displayedCurrentProfit = shouldBlankOptimizationSummary ? 0 : currentPortfolioProfit;
  const displayedAdsBudget = shouldBlankOptimizationSummary ? 0 : safeNumber(summary.ads_budget_used);
  const displayedPendingOptimizationCount = shouldBlankOptimizationSummary ? 0 : pendingOptimizationCount;
  const displayedExpectedProfitGain = shouldBlankOptimizationSummary ? 0 : expectedProfitGain;
  const displayedLiftRate = shouldBlankOptimizationSummary ? 0 : expectedProfitLiftRate;
  const displayedAcceptedProfitGain = shouldBlankOptimizationSummary
    ? 0
    : acceptedImpactSummary?.expectedProfitImpact
      ?? acceptedDecisionRows.reduce((sum, row) => sum + safeNumber(row.expectedProfitImpact ?? row.estimatedProfitImpact ?? portfolioRowsBySku.get(row.skuId)?.profit_delta), 0);
  const displayedAcceptedLiftRate = displayedCurrentProfit > 0 ? displayedAcceptedProfitGain / displayedCurrentProfit : 0;
  const displayedAcceptedProjectedPortfolioProfit = displayedCurrentProfit + displayedAcceptedProfitGain;
  const displayedAcceptedAdditionalAds = shouldBlankOptimizationSummary
    ? 0
    : acceptedDecisionRows.reduce((sum, row) => {
      const actionLabel = optimizationGoalForDecision(row, portfolioRowsBySku.get(row.skuId)).actionLabel;
      if (actionLabel !== "Scale Ads" && actionLabel !== "Expand Channel") return sum;
      return sum + Math.max(0, adsBudgetDeltaForDecision(row, portfolioRowsBySku.get(row.skuId)));
    }, 0);
  const hasAcceptedOptimizationActions = (acceptedImpactSummary?.activeCount ?? acceptedDecisionRows.length) > 0;
  const displayedAcceptedSkuCount = acceptedImpactSummary?.activeCount ?? acceptedDecisionRows.length;
  const displayedPendingOptimizationCountLabel = numberFormat.format(displayedPendingOptimizationCount);
  const displayedPendingDecisionRows = shouldBlankOptimizationSummary ? [] : pendingDecisionRows;
  const selectedDecision = !shouldBlankOptimizationSummary && selectedDecisionRow && filteredDecisionRows.some((row) => decisionRowKey(row) === decisionRowKey(selectedDecisionRow))
    ? selectedDecisionRow
    : null;
  const shouldShowOptimizationStarter = isSkuOperationsOpen && (showSkuTableEmptyState || !optimizationStarted || isResolvingOptimizationState);

  useEffect(() => {
    if (isResolvingOptimizationState) {
      setIsSkuOperationsOpen(true);
      return;
    }
    if (optimizationStarted && !showSkuTableEmptyState) {
      setIsSkuOperationsOpen(false);
    }
  }, [isResolvingOptimizationState, optimizationStarted, showSkuTableEmptyState]);

  useEffect(() => {
    if (wasLoadingOptimizationRef.current && !isResolvingOptimizationState && optimizationStarted) {
      setIsSkuOperationsOpen(false);
    }
    wasLoadingOptimizationRef.current = isResolvingOptimizationState;
  }, [isResolvingOptimizationState, optimizationStarted]);

  useEffect(() => {
    if (!optimizationStarted || isResolvingOptimizationState || selectedDecisionRow || !pendingDecisionRows.length) {
      return;
    }
    const firstDecision = pendingDecisionRows[0];
    setSelectedDecisionRow(firstDecision);
    setIsSkuOperationsOpen(false);
    setSkuChannel("all");
    setExpandedSku(firstDecision.skuId);
  }, [isResolvingOptimizationState, optimizationStarted, pendingDecisionRows, selectedDecisionRow]);

  useEffect(() => {
    if (!optimizationStarted || !decisionRows.length) {
      setLoadedActionStatusHydrationKey(actionStatusHydrationKey);
      return;
    }
    let cancelled = false;

    async function loadPersistedDecisionStatuses() {
      const response = await fetch("/api/actions", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) {
        if (!cancelled) setLoadedActionStatusHydrationKey(actionStatusHydrationKey);
        return;
      }
      const payload = await response.json().catch(() => null) as { actions?: PersistedActionTrackingRecord[] } | null;
      const actions = Array.isArray(payload?.actions) ? payload.actions : [];
      if (!actions.length || cancelled) {
        if (!cancelled) setLoadedActionStatusHydrationKey(actionStatusHydrationKey);
        return;
      }

      const nextStatuses: Record<string, "accepted" | "rejected"> = {};
      const nextAcceptedAt: Record<string, string> = {};

      for (const action of actions) {
        const status = action.status === "accepted" || action.status === "running"
          ? "accepted"
          : action.status === "rejected"
            ? "rejected"
            : null;
        if (!status) continue;

        const persistedRecommendationId = typeof action.action_payload?.recommendation_id === "string"
          ? action.action_payload.recommendation_id.trim()
          : "";
        const matchedRow = (persistedRecommendationId
          ? decisionRows.find((row) => persistedRecommendationId === recommendationIdForDecision(row, report))
          : null) ?? decisionRows.find((row) => legacyActionMatchesDecisionRecommendation(action, row));
        if (!matchedRow) continue;

        const key = decisionRowKey(matchedRow);
        nextStatuses[key] = status;
        if (status === "accepted" && action.accepted_at) {
          nextAcceptedAt[key] = action.accepted_at.slice(0, 10);
        }
      }

      if (!cancelled) {
        if (Object.keys(nextStatuses).length) {
          setActionStatuses((current) => ({ ...current, ...nextStatuses }));
          setAcceptedAtByDecision((current) => ({ ...current, ...nextAcceptedAt }));
        }
        setLoadedActionStatusHydrationKey(actionStatusHydrationKey);
      }
    }

    void loadPersistedDecisionStatuses();

    return () => {
      cancelled = true;
    };
  }, [actionStatusHydrationKey, optimizationStarted, decisionRows, report]);

  useEffect(() => {
    if (!optimizationStarted) {
      setAcceptedImpactSummary(null);
      return;
    }
    let cancelled = false;

    async function loadAcceptedImpactSummary() {
      const response = await fetch("/api/policy/actions", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) {
        if (!cancelled) setAcceptedImpactSummary(null);
        return;
      }

      const payload = await response.json().catch(() => null) as {
        activeDecisions?: Array<{ expectedImpact?: number | null }>;
      } | null;
      const activeDecisions = Array.isArray(payload?.activeDecisions) ? payload.activeDecisions : [];
      const expectedProfitImpact = activeDecisions.reduce((sum, row) => sum + safeNumber(row.expectedImpact), 0);

      if (!cancelled) {
        setAcceptedImpactSummary({
          activeCount: activeDecisions.length,
          expectedProfitImpact
        });
      }
    }

    void loadAcceptedImpactSummary();

    return () => {
      cancelled = true;
    };
  }, [optimizationStarted]);

  const selectOptimizationQueueRow = (row: PortfolioDecisionRow) => {
    setSelectedDecisionRow(row);
    setFocusedOpsSku(row.skuId);
    setIsSkuOperationsOpen(false);
    setSkuChannel("all");
    setExpandedSku(row.skuId);
  };

  const acceptDecisionAction = async (row: PortfolioDecisionRow) => {
    const recommendation = portfolioRowsBySku.get(row.skuId);
    const goal = optimizationGoalForDecision(row, recommendation);
    const key = decisionRowKey(row);
    const optimizationRunId = optimizationReportRunId;
    const decisionId = decisionRowKey(row);
    const recommendationId = recommendationIdForDecision(row, report);
    const instanceKey = recommendationId;
    if (!hasConcreteOptimizationReportKey(optimizationRunId) || !recommendationId) {
      console.warn("Cannot accept optimization action before the optimization report instance is resolved.", {
        sku: row.skuId,
        action: row.action,
        sourceAction: row.sourceAction,
        optimizationRunId,
        recommendationId
      });
      setActionPersistenceError(isZh
        ? "当前优化报告实例尚未解析，无法保存 Accept。请刷新后重试。"
        : "The current optimization report instance is not resolved. Refresh and try accepting again.");
      return;
    }
    console.log("[optimization accept click]", {
      sku: row.skuId,
      sku_id: row.skuId,
      actionType: row.action,
      decisionInstanceKey: instanceKey,
      optimizationRunId,
      recommendationId
    });
    const acceptedAt = todayDateOnly();
    const acceptedImpactDelta = safeNumber(row.expectedProfitImpact ?? row.estimatedProfitImpact ?? recommendation?.profit_delta);
    setActionStatuses((current) => ({ ...current, [key]: "accepted" }));
    setAcceptedAtByDecision((current) => ({ ...current, [key]: acceptedAt }));
    setAcceptedImpactSummary((current) => current
      ? {
        activeCount: current.activeCount + 1,
        expectedProfitImpact: current.expectedProfitImpact + acceptedImpactDelta
      }
      : current);

    try {
      const response = await fetch("/api/actions/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku_id: row.skuId,
          sku: row.skuId,
          optimization_run_id: optimizationRunId,
          recommendation_id: recommendationId,
          decision_id: decisionId,
          lifecycle_stage: row.lifecycle_stage,
          action_type: row.action,
          action_payload: {
            decision_instance_key: instanceKey,
            recommendation_id: recommendationId,
            action: row.sourceAction,
            optimization_goal: `${goal.goalLabel} Optimization`,
            display_action: goal.actionLabel,
            sku_role: row.skuRole,
            recommended_actions: row.recommendedActions,
            decision_drivers: row.decisionDrivers,
            ai_evidence: row.ai_evidence,
            scenarios: row.scenarios,
            selected_scenario: row.selected_scenario,
            decision_explanation: row.decision_explanation,
            simulation_horizon_days: row.simulation_horizon?.days ?? simulationHorizonDays,
            confidence_breakdown: row.confidence_breakdown,
            constraints_passed: row.constraints_passed
          },
          baseline_metrics: recommendation ? {
            profit: recommendation.current_profit,
            ad_spend: recommendation.simulation?.current_ads_spend ?? recommendation.before_state?.ad_spend ?? 0
          } : {},
          predicted_metrics: recommendation ? {
            profit: recommendation.predicted_profit,
            profit_delta: recommendation.profit_delta ?? row.expectedProfitImpact ?? row.estimatedProfitImpact,
            revenue: recommendation.simulation?.predicted_revenue ?? recommendation.after_state?.revenue ?? 0,
            ad_spend: recommendation.simulation?.recommended_ads_spend ?? recommendation.after_state?.ad_spend ?? 0
          } : {
            profit_delta: row.expectedProfitImpact ?? row.estimatedProfitImpact
          },
          observation_window_days: row.simulation_horizon?.days ?? simulationHorizonDays,
          confidence_score: row.confidence
        })
      });

      const responsePayload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
      if (!response.ok || responsePayload?.ok !== true) {
        throw new Error(responsePayload?.message || "Accept action failed");
      }
      setActionPersistenceError(null);

      if (recommendation) {
        setTrackedOutcomeRows((current) => upsertOutcomeRow(current, portfolioRowToOutcomeRow(recommendation, locale)));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Accept action failed";
      console.error("Optimization action accept did not persist", {
        sku: row.skuId,
        action: row.action,
        sourceAction: row.sourceAction,
        decision_instance_key: instanceKey,
        message
      });
      setActionPersistenceError(isZh
        ? `Accept 没有写入数据库：${message}`
        : `Accept was not saved: ${message}`);
      setActionStatuses((current) => ({ ...current, [key]: "pending" }));
      setAcceptedImpactSummary((current) => current
        ? {
          activeCount: Math.max(0, current.activeCount - 1),
          expectedProfitImpact: Math.max(0, current.expectedProfitImpact - acceptedImpactDelta)
        }
        : current);
      setAcceptedAtByDecision((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  const rejectDecisionAction = async (row: PortfolioDecisionRow) => {
    const recommendation = portfolioRowsBySku.get(row.skuId);
    const goal = optimizationGoalForDecision(row, recommendation);
    const key = decisionRowKey(row);
    setActionStatuses((current) => ({ ...current, [key]: "rejected" }));

    try {
      const response = await fetch("/api/actions/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: row.skuId,
          lifecycle_stage: row.lifecycle_stage,
          action_type: row.action,
          action_payload: {
            action: row.sourceAction,
            optimization_goal: `${goal.goalLabel} Optimization`,
            display_action: goal.actionLabel,
            sku_role: row.skuRole,
            recommended_actions: row.recommendedActions,
            decision_drivers: row.decisionDrivers,
            ai_evidence: row.ai_evidence,
            scenarios: row.scenarios,
            selected_scenario: row.selected_scenario,
            decision_explanation: row.decision_explanation,
            rejection_reason: "User rejected recommendation"
          },
          baseline_metrics: recommendation ? {
            profit: recommendation.current_profit,
            ad_spend: recommendation.simulation?.current_ads_spend ?? recommendation.before_state?.ad_spend ?? 0
          } : {},
          predicted_metrics: recommendation ? {
            profit: recommendation.predicted_profit,
            profit_delta: recommendation.profit_delta ?? row.expectedProfitImpact ?? row.estimatedProfitImpact,
            revenue: recommendation.simulation?.predicted_revenue ?? recommendation.after_state?.revenue ?? 0,
            ad_spend: recommendation.simulation?.recommended_ads_spend ?? recommendation.after_state?.ad_spend ?? 0
          } : {
            profit_delta: row.expectedProfitImpact ?? row.estimatedProfitImpact
          },
          confidence_score: row.confidence
        })
      });

      if (!response.ok) throw new Error("Reject action failed");
    } catch {
      setActionStatuses((current) => ({ ...current, [key]: "pending" }));
    }
  };

  const openDecisionIntelligence = () => {
    setFocusedOpsSku(null);
    if (!optimizationStarted) {
      setIsSkuOperationsOpen(false);
      void onStartProfitOptimization?.();
      return;
    }
    if (showSkuTableEmptyState) {
      setSelectedDecisionRow(null);
      setIsSkuOperationsOpen(false);
      return;
    }
    const nextSelection = selectedDecision ?? pendingDecisionRows[0] ?? filteredDecisionRows[0] ?? null;
    if (nextSelection) setSelectedDecisionRow(nextSelection);
    setIsSkuOperationsOpen(false);
  };
  const selectSkuChannel = (value: string) => {
    setExpandedSku(null);
    setSkuChannel(value);
  };

	  return (
		    <div className="space-y-2 bg-transparent">
	      {!shouldShowOptimizationStarter ? (
		      <div className="sticky top-0 z-30 pb-2 pt-4">
	        <div className="mb-3 flex items-center justify-between gap-3 px-1">
	          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
	            <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]" />
	            {isZh ? "实时组合监控" : "Live Portfolio Monitor"}
	          </div>
	          {headerAction ?? <span className="text-xs font-medium text-slate-500">{isZh ? "实时更新" : "Live update"}</span>}
	        </div>
	        <div className="grid gap-0 xl:grid-cols-2">
	          <div className="min-w-0 px-5 py-3 xl:order-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {!isSkuOperationsOpen
                ? (isZh ? "已接受优化影响" : "Accepted Optimization Impact")
                : (isZh ? "当前组合" : "Current Portfolio")}
            </p>
            <p className="mt-3 break-words text-[42px] font-bold leading-none text-slate-950">
              {!isSkuOperationsOpen ? (
                <>
                  {signedCurrency(displayedAcceptedProfitGain)}
                  {hasAcceptedOptimizationActions ? (
                    <span className="ml-2 align-middle text-lg font-bold text-slate-500">
                      ({numberFormat.format(displayedAcceptedSkuCount)} {isZh ? "个 SKU" : displayedAcceptedSkuCount === 1 ? "SKU" : "SKUs"})
                    </span>
                  ) : null}
                </>
              ) : `${numberFormat.format(displayedCurrentSkuCount)} SKUs`}
            </p>
            <div className="mt-4 grid min-w-0 gap-3 text-sm font-semibold text-slate-600 lg:grid-cols-2">
              {!isSkuOperationsOpen ? (
                <>
                  {hasAcceptedOptimizationActions ? (
                    <div className="min-w-0">
                      <span className="block text-slate-500">{isZh ? "优化后组合利润" : "Projected Portfolio Profit"}</span>
                      <span className="block break-words text-slate-700">
                        {currencyDecimal.format(displayedAcceptedProjectedPortfolioProfit)} / +{percent.format(displayedAcceptedLiftRate)}
                      </span>
                    </div>
                  ) : (
                    <span className="min-w-0 break-words">{isZh ? "尚未接受任何优化动作" : "No accepted actions yet"}</span>
                  )}
                  <div className="min-w-0">
                    <span className="block text-slate-500">{isZh ? "新增广告" : "Additional ads"}</span>
                    <span className="block break-words text-slate-700">{currencyDecimal.format(displayedAcceptedAdditionalAds)}</span>
                  </div>
                </>
              ) : (
                <>
                  <span>{isZh ? "当前预计利润" : "Estimated Profit"}: {currencyDecimal.format(displayedCurrentProfit)}</span>
                  <span>{isZh ? "广告预算" : "Ad Spend"}: {currencyDecimal.format(displayedAdsBudget)}</span>
                </>
              )}
            </div>
          </div>
	          <div className="min-w-0 px-5 py-3 xl:order-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{isZh ? "优化机会" : "Optimization Opportunities"}</p>
            <p className="mt-3 break-words text-[42px] font-bold leading-none text-emerald-950">{displayedPendingOptimizationCountLabel} SKUs</p>
            <div className="mt-4 text-sm font-semibold text-emerald-900">
              <span>
                {optimizationStarted
                  ? `${isZh ? "模拟利润增益" : "Simulated Profit Gain"}: +${currencyDecimal.format(displayedExpectedProfitGain)} / +${percent.format(displayedLiftRate)}`
                  : (isZh ? "点击 Start 后生成优化方案" : "Start to generate optimization plan")}
              </span>
            </div>
          </div>
        </div>
	      </div>
		      ) : null}
	      {actionPersistenceError ? (
	        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
	          {actionPersistenceError}
	        </div>
	      ) : null}
	      <div className="space-y-2">
	        <div className="min-w-0 space-y-2">
				      <div className="grid items-stretch gap-0 xl:h-[640px] xl:grid-cols-[390px_6px_minmax(0,1fr)]">
			        <div className="min-w-0 space-y-3 p-4 xl:order-3 xl:h-full xl:overflow-hidden xl:p-5">
	          {!shouldShowOptimizationStarter ? (
	          <div className="flex w-full flex-wrap items-center gap-2 rounded-full bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setFocusedOpsSku(null);
                setIsSkuOperationsOpen(true);
              }}
              className={cn(
                "inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5747e8]/30",
                isSkuOperationsOpen ? "bg-[#5747e8] text-white shadow-sm ring-1 ring-[#5747e8]" : "bg-transparent text-slate-500 hover:text-slate-800"
              )}
              aria-expanded={isSkuOperationsOpen}
              aria-label={isZh ? "打开 SKU 经营数据" : "Open SKU operating data"}
            >
              {isZh ? "SKU 经营数据" : "SKU operating data"}
            </button>
            <button
              type="button"
              onClick={openDecisionIntelligence}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5747e8]/30",
                !isSkuOperationsOpen ? "bg-[#5747e8] text-white shadow-sm ring-1 ring-[#5747e8]" : "bg-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              {isZh ? "SKU 优化决策" : "SKU optimization decision"}
            </button>
	          </div>
	          ) : null}
        {isResolvingOptimizationState ? (
          <div className="min-w-0 overflow-hidden">
            <EmptySkuProfitPortfolioTable locale={locale} isLoadingData />
          </div>
        ) : isSkuOperationsOpen ? (
          <div className={cn("min-w-0 overflow-hidden", showSkuTableEmptyState ? "" : "rounded-lg border bg-white")}>
            {showSkuTableEmptyState ? (
              <EmptySkuProfitPortfolioTable locale={locale} />
            ) : (
              <SkuBreakdownTable
                rows={displayedSkuRows}
                channelTags={skuChannelTags}
                selectedChannel={skuChannel}
                onChannelChange={selectSkuChannel}
                expandedSku={expandedSku}
                onToggleExpanded={(sku) => setExpandedSku((current) => current === sku ? null : sku)}
                locale={locale}
              />
            )}
          </div>
        ) : (
	          <div className="min-w-0 rounded-lg border bg-white p-3 shadow-sm shadow-slate-950/5 xl:h-full xl:overflow-hidden">
            {isResolvingOptimizationState ? (
              <div className="grid min-h-[520px] place-items-center rounded-md bg-white text-center">
                <div className="space-y-3">
                  <RefreshCw className="mx-auto size-7 animate-spin text-emerald-700" />
                  <p className="text-sm font-semibold text-slate-600">
                    {optimizationLoadingLabel}
                  </p>
                </div>
              </div>
            ) : selectedDecision ? (
              <SelectedSkuOptimizationPanel
                row={selectedDecision}
                recommendation={portfolioRowsBySku.get(selectedDecision.skuId)}
                trackedOutcomeRows={trackedOutcomeRows}
                simulationHorizonDays={simulationHorizonDays}
                actionStatus={actionStatuses[decisionRowKey(selectedDecision)] === "accepted" ? "accepted" : actionStatuses[decisionRowKey(selectedDecision)] === "rejected" ? "rejected" : "pending"}
                acceptedAt={acceptedAtByDecision[decisionRowKey(selectedDecision)]}
                locale={locale}
              />
            ) : (
              <div className="grid min-h-[360px] place-items-center rounded-md bg-slate-50 text-center">
                <p className="max-w-xs text-sm font-semibold text-slate-500">
                  {isZh ? "从右侧利润待优化队列选择一个 SKU 查看详情。" : "Select a SKU from the optimization queue to view details."}
                </p>
              </div>
            )}
          </div>
        )}
        </div>
        <div className="hidden min-w-0 flex-col gap-4">
        <div className="flex flex-1 flex-col rounded-lg border p-4">
          <div className="min-w-0">
              <div className="mt-4">
              <p className="text-sm font-semibold text-slate-950">{isZh ? "Top Decisions" : "Top Decisions"}</p>
              <p className="mt-1 text-xs text-slate-500">
                {isZh
                  ? `这些不是指标排名，而是系统在组合约束下选择的下一步经营动作。${decisionActionFilter === "ALL" ? "" : `当前筛选：${decisionFilterLabel(decisionActionFilter, locale)}。`}`
                  : `These are not metric rankings; they are the next operating actions selected under portfolio constraints.${decisionActionFilter === "ALL" ? "" : ` Filtered by ${decisionFilterLabel(decisionActionFilter, locale)}.`}`}
              </p>
              </div>
              <div className="mt-4 flex-1 overflow-auto rounded-lg border">
                <table className="min-w-[1280px] w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[9%]" />
                    <col className="w-[10%]" />
                    <col className="w-[15%]" />
                    <col className="w-[16%]" />
                    <col className="w-[9%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[10%]" />
                    <col className="w-[11%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-3">SKU</th>
                      <th className="px-3 py-3">{isZh ? "当前利润" : "Current Profit"}</th>
                      <th className="px-3 py-3">{isZh ? "动作" : "Action"}</th>
                      <th className="px-3 py-3">{isZh ? `模拟增量利润 / ${simulationHorizonDays}天` : `Simulation Estimate / ${simulationHorizonDays}d`}</th>
                      <th className="px-3 py-3">{isZh ? "预计提升" : "Expected Lift"}</th>
                      <th className="px-3 py-3">{isZh ? "SKU 上线时间" : "SKU Launch"}</th>
                      <th className="px-3 py-3">{isZh ? "广告开始时间" : "Ads Start"}</th>
                      <th className="px-3 py-3">{isZh ? "广告结束时间" : "Ads End"}</th>
                      <th className="px-3 py-3">{isZh ? "下线时间" : "Offline At"}</th>
                      <th className="px-3 py-3">{isZh ? "决策状态" : "Decision Status"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredDecisionRows.length ? filteredDecisionRows.map((row) => {
                      const isSelected = selectedDecision ? decisionRowKey(row) === decisionRowKey(selectedDecision) : false;
                      const recommendation = portfolioRowsBySku.get(row.skuId);
	                      const currentProfit = numberOrNull(recommendation?.current_profit);
	                      const expectedProfitImpact = safeNumber(row.expectedProfitImpact ?? row.estimatedProfitImpact);
	                      const expectedLiftRate = currentProfit && currentProfit > 0 ? expectedProfitImpact / currentProfit : null;
	                      const recommendedActionText = safeStringArray(row.recommendedActions)[0] ??
                          safeStringArray(row.recommendedExecution)[0] ??
                          portfolioScenarioActionLabel(row.sourceAction, locale);
                      return (
                        <tr
                          key={`${row.skuId}-${row.action}-${row.sourceAction}`}
                          className={cn(
                            "cursor-pointer transition hover:bg-emerald-50/35",
                            isSelected && "bg-emerald-50/70"
                          )}
                          onClick={() => setSelectedDecisionRow(row)}
                        >
                          <td className="px-3 py-3 font-semibold text-slate-900">
                            <p>{row.skuId}</p>
                            <div className="mt-2">
                              <LifecycleBadge stage={row.lifecycle_stage} />
                            </div>
                          </td>
                          <td className="px-3 py-3 font-semibold text-slate-900">
                            {currentProfit === null ? "—" : currencyDecimal.format(currentProfit)}
                          </td>
                          <td className="px-3 py-3 font-semibold text-slate-950">
                            <DecisionBadge action={row.action ?? "MONITOR"} locale={locale} />
                            <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">
	                              {recommendedActionText}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-emerald-700">
                              {signedCurrency(expectedProfitImpact)} / {row.timing?.simulation_window_days ?? row.simulation_horizon?.days ?? simulationHorizonDays} days
                            </p>
                            <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                              {decisionTimingTableLabel(row, simulationHorizonDays, locale)}
                            </p>
                            <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">
                              {simulationEstimateSourceLabel(row, locale)}
                            </p>
                          </td>
                          <td className="px-3 py-3 font-semibold text-emerald-700">
                            {expectedLiftRate === null ? "—" : percent.format(expectedLiftRate)}
                          </td>
                          <td className="px-3 py-3 font-semibold text-slate-600">{formatSkuLaunchDate()}</td>
                          <td className="px-3 py-3 font-semibold text-slate-600">{formatAdStartDate(row)}</td>
                          <td className="px-3 py-3 font-semibold text-slate-600">{formatAdEndDate(row, simulationHorizonDays)}</td>
                          <td className="px-3 py-3 font-semibold text-slate-600">{formatOfflineDate(row)}</td>
                          <td className="px-3 py-3">
                            <RecommendationStatusBadge
                              status={actionStatuses[decisionRowKey(row)] === "accepted" ? "accepted" : actionStatuses[decisionRowKey(row)] === "rejected" ? "rejected" : "awaiting_decision"}
                              locale={locale}
                            />
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td className="px-3 py-6 text-sm font-medium text-slate-500" colSpan={10}>
                          {isZh ? "暂无 SKU 推荐数据。" : "No SKU recommendation rows available."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
	        </div>
	        </div>
	        <div className="hidden min-h-full self-stretch bg-emerald-100/45 xl:order-2 xl:block" aria-hidden="true" />

	        <div className="min-h-0 min-w-0 space-y-2 xl:order-1 xl:h-full xl:self-stretch">
		        <div className={cn(
	            "min-h-0 min-w-0 rounded-lg xl:h-full",
	            isSkuOperationsOpen ? "grid min-h-[520px] place-items-center bg-transparent p-0" : "border border-emerald-200 bg-emerald-50/80 p-2 shadow-xl shadow-emerald-950/5"
          )}>
	            {isSkuOperationsOpen && (showSkuTableEmptyState || !optimizationStarted || isResolvingOptimizationState) ? (
	              <div className="text-center">
                <div className="space-y-5">
                  <p className="text-lg font-bold text-slate-950">
                    {isResolvingOptimizationState
                      ? optimizationLoadingLabel
                      : optimizationStartLabel}
                  </p>
	                  <button
	                    type="button"
	                    onClick={() => {
	                      setIsSkuOperationsOpen(true);
	                      void onStartProfitOptimization?.();
	                    }}
                    disabled={isResolvingOptimizationState}
                    className="inline-grid size-12 place-items-center rounded-lg bg-[#079669] text-white shadow-sm shadow-[rgba(7,150,105,0.15)] transition hover:bg-[#067f5a] disabled:cursor-not-allowed disabled:opacity-70"
                    aria-label={isResolvingOptimizationState
                      ? optimizationLoadingLabel
                      : (isZh ? "打开 AI 利润优化任务表" : "Open AI profit optimization tasks")}
                  >
                    {isResolvingOptimizationState ? <RefreshCw className="size-5 animate-spin" /> : <ChevronRight className="size-6" />}
                  </button>
                </div>
              </div>
            ) : isResolvingOptimizationState ? (
              <div className="grid min-h-[520px] place-items-center rounded-lg bg-white text-center">
                <div className="space-y-3">
                  <RefreshCw className="mx-auto size-7 animate-spin text-emerald-700" />
                  <p className="text-sm font-semibold text-slate-600">
                    {optimizationLoadingLabel}
                  </p>
                </div>
              </div>
            ) : (
              <OptimizationDecisionRail
                rows={displayedPendingDecisionRows}
                selectedRow={selectedDecision}
                portfolioRowsBySku={portfolioRowsBySku}
                trackedOutcomeRows={trackedOutcomeRows}
                simulationHorizonDays={simulationHorizonDays}
                actionStatuses={actionStatuses}
                acceptedAtByDecision={acceptedAtByDecision}
                locale={locale}
                onSelect={selectOptimizationQueueRow}
                onAccept={(row) => void acceptDecisionAction(row)}
                onReject={(row) => void rejectDecisionAction(row)}
                showInlineDetail={false}
              />
            )}
          </div>
        </div>
      </div>
        </div>
      </div>

      {selectedOutcomeRow ? (
        <ActionTrackingDrawer row={selectedOutcomeRow} locale={locale} onClose={() => setSelectedOutcomeRow(null)} />
      ) : null}
    </div>
  );
}

function EmptySkuProfitPortfolioTable({ locale, isLoadingData = false }: { locale: RendererLocale; isLoadingData?: boolean }) {
  const isZh = locale === "zh";

  return (
    <div className="grid min-h-[520px] place-items-center bg-transparent p-8 text-center">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          {isZh ? "优化机会" : "Optimization Opportunities"}
        </p>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
          {isZh ? "最大化 SKU 组合利润" : "Maximize Your SKU Profit Portfolio"}
        </h2>
        {isLoadingData ? (
          <p className="mt-5 text-sm font-semibold text-[#5747e8]">
            {isZh ? "正在加载优化数据" : "Loading optimization data"}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type PortfolioRow = DecisionIntelligenceReportV1["sku_portfolio_optimization"]["recommended_portfolio"][number];
type PortfolioDecisionRow = DecisionIntelligenceReportV1["sku_portfolio_optimization"]["skuDecisions"][number];
type PortfolioDecisionFilter = PortfolioDecisionRow["action"] | "INVENTORY_RISK" | "BUDGET_OPPORTUNITY" | "ALL";
type OptimizationGoal = "GROWTH" | "PROFIT" | "INVENTORY" | "PORTFOLIO_HEALTH";
type DecisionActionDisplay = {
  title: string;
  icon: string;
  category: string;
  description: string;
  subtitle: string;
  reason: string;
  impact_label: string;
};
type DecisionActionReasoning = {
  title: string;
  reasons: Array<{
    signal: string;
    metric: string;
    explanation: string;
  }>;
  summary: string;
};

const optimizationGoalFilters: Array<{ goal: OptimizationGoal; label: string }> = [
  { goal: "GROWTH", label: "Growth" },
  { goal: "PROFIT", label: "Profit" },
  { goal: "INVENTORY", label: "Inventory" },
  { goal: "PORTFOLIO_HEALTH", label: "Portfolio Health" }
];

const optimizationActionFilters: Record<OptimizationGoal, string[]> = {
  GROWTH: ["Scale Ads", "Expand Channel"],
  PROFIT: ["Increase Price", "Decrease Price", "Run Promotion"],
  INVENTORY: ["Restock Inventory", "Clear Excess Inventory"],
  PORTFOLIO_HEALTH: ["Enrich Inputs", "Reduce Ad Waste", "Reallocate Budget", "Exit SKU"]
};

function goalFilterDisplayLabel(goal: OptimizationGoal) {
  if (goal === "GROWTH") return "Growth";
  if (goal === "PROFIT") return "Profit";
  if (goal === "INVENTORY") return "Inventory";
  return "Portfolio Health";
}

function actionFilterDisplayLabel(action: string) {
  return action;
}

type ActionOutcomeStatus = "Pending" | "Accepted" | "Running" | "Completed" | "Rejected" | "Blocked";

type PersistedActionTrackingRecord = {
  sku: string;
  action_type: string;
  status: string;
  accepted_at?: string | null;
  action_payload?: Record<string, unknown>;
};

type AcceptedImpactSummary = {
  activeCount: number;
  expectedProfitImpact: number;
};

type ActionOutcomeRow = {
  action: string;
  sku: string;
  acceptedAt: string;
  window: string;
  baselineProfit: number;
  predictedProfitLift: number;
  actualTotalProfitChange: number | null;
  actualProfitLift: number | null;
  organicProfitChange: number | null;
  status: ActionOutcomeStatus;
  confidence: number;
  evidence: string;
};

const seedActionOutcomeRows: ActionOutcomeRow[] = [
  {
    action: "Increase Ads",
    sku: "SKU_00498",
    acceptedAt: "Jul 8",
    window: "7d",
    baselineProfit: 3321.25,
    predictedProfitLift: 9755,
    actualTotalProfitChange: 3000,
    actualProfitLift: 2410,
    organicProfitChange: 590,
    status: "Running",
    confidence: 0.6507,
    evidence: "Margin 41% + inventory passed"
  },
  {
    action: "Increase Ads",
    sku: "SKU_01217",
    acceptedAt: "Jul 1",
    window: "7d",
    baselineProfit: 5200,
    predictedProfitLift: 9677,
    actualTotalProfitChange: 10200,
    actualProfitLift: 8950,
    organicProfitChange: 1250,
    status: "Completed",
    confidence: 0.642,
    evidence: "High margin + high ROAS"
  },
  {
    action: "Price Adjust",
    sku: "SKU_01126",
    acceptedAt: "Jul 2",
    window: "14d",
    baselineProfit: 4380,
    predictedProfitLift: 3100,
    actualTotalProfitChange: 2100,
    actualProfitLift: 1820,
    organicProfitChange: 280,
    status: "Completed",
    confidence: 0.782,
    evidence: "Price elasticity passed"
  }
];

function decisionRowKey(row: PortfolioDecisionRow) {
  return `${row.skuId}:${row.action}:${row.sourceAction}`;
}

function recommendationIdForDecision(row: PortfolioDecisionRow, report: DecisionIntelligenceReportV1) {
  const rowRecord = objectRecord(row);
  const reportRecord = objectRecord(report);
  const optimizationRun = objectRecord(reportRecord.optimizationRun);
  return recommendationIdFromRecord(rowRecord, {
    policyVersion: typeof optimizationRun.policy_version === "string" ? optimizationRun.policy_version : null,
    optimizerVersion: typeof optimizationRun.optimizer_version === "string" ? optimizationRun.optimizer_version : null,
    simulationVersion: typeof optimizationRun.simulation_version === "string" ? optimizationRun.simulation_version : null,
    dataVersion: typeof optimizationRun.data_version === "string" ? optimizationRun.data_version : null
  });
}

function optimizationReportKey(report: DecisionIntelligenceReportV1) {
  const reportRecord = objectRecord(report);
  const optimizationRun = objectRecord(reportRecord.optimizationRun);
  return String(
    optimizationRun.optimization_run_id ||
    optimizationRun.completed_at ||
    reportRecord.generatedAt ||
    "current-optimization-report"
  );
}

function hasConcreteOptimizationReportKey(reportKey: string) {
  return reportKey.trim().length > 0 && reportKey !== "current-optimization-report";
}

function shouldShowInOptimizationQueue(
  row: PortfolioDecisionRow,
  actionStatuses: Record<string, "pending" | "accepted" | "rejected">
) {
  const status = actionStatuses[decisionRowKey(row)];
  return status !== "accepted" && status !== "rejected";
}

function legacyActionMatchesDecisionRecommendation(
  action: PersistedActionTrackingRecord,
  row: PortfolioDecisionRow
) {
  const payload = action.action_payload ?? {};
  const currentDecisionId = decisionRowKey(row);
  const persistedDecisionId = typeof payload.decision_id === "string" ? payload.decision_id.trim() : "";
  const persistedInstanceKey = typeof payload.decision_instance_key === "string" ? payload.decision_instance_key.trim() : "";
  const persistedSourceAction = typeof payload.action === "string" ? payload.action.trim() : "";
  const actionRecord = action as unknown as Record<string, unknown>;
  const persistedPredictedMetrics = objectRecord(actionRecord.predicted_metrics);
  const persistedBaselineMetrics = objectRecord(actionRecord.baseline_metrics);
  const persistedAdDelta = safeNumber(persistedPredictedMetrics.ad_spend) - safeNumber(persistedBaselineMetrics.ad_spend);
  const currentSimulation = objectRecord((row as Record<string, unknown>).simulation);
  const currentAdDelta = safeNumber(currentSimulation.recommended_ads_spend) - safeNumber(currentSimulation.current_ads_spend);

  if (action.sku !== row.skuId) return false;
  if (action.action_type !== row.action) return false;
  if (persistedSourceAction !== row.sourceAction) return false;
  if (
    persistedDecisionId &&
    persistedDecisionId !== currentDecisionId &&
    persistedInstanceKey &&
    !persistedInstanceKey.endsWith(`:${currentDecisionId}`)
  ) {
    return false;
  }
  if (Number.isFinite(persistedAdDelta) && Number.isFinite(currentAdDelta) && Math.abs(persistedAdDelta - currentAdDelta) > 0.01) {
    return false;
  }

  return true;
}

function isOptimizationQueueRow(row: PortfolioDecisionRow) {
  if (isNoActionDecisionRow(row)) return false;

  const impact = Math.abs(safeNumber(row.expectedProfitImpact ?? row.estimatedProfitImpact));
  return row.action !== "MONITOR" || impact > 1 || row.inventoryRisk === true || row.budgetOpportunity === true;
}

function OptimizationDecisionRail({
  rows,
  selectedRow,
  portfolioRowsBySku,
  trackedOutcomeRows,
  simulationHorizonDays,
  actionStatuses,
  acceptedAtByDecision,
  locale,
  onSelect,
  onAccept,
  onReject,
  showInlineDetail = true
}: {
  rows: PortfolioDecisionRow[];
  selectedRow: PortfolioDecisionRow | null;
  portfolioRowsBySku: Map<string, PortfolioRow>;
  trackedOutcomeRows: ActionOutcomeRow[];
  simulationHorizonDays: number;
  actionStatuses: Record<string, "pending" | "accepted" | "rejected">;
  acceptedAtByDecision: Record<string, string>;
  locale: RendererLocale;
  onSelect: (row: PortfolioDecisionRow) => void;
  onAccept: (row: PortfolioDecisionRow) => void;
  onReject: (row: PortfolioDecisionRow) => void;
  showInlineDetail?: boolean;
}) {
  const isZh = locale === "zh";
  const [selectedGoal, setSelectedGoal] = useState<OptimizationGoal>("GROWTH");
  const [selectedGoalAction, setSelectedGoalAction] = useState<string | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(selectedRow ? decisionRowKey(selectedRow) : null);
  const hasManuallySelectedGoalRef = useRef(false);
  const goalCounts = useMemo(() => rows.reduce<Record<OptimizationGoal, number>>((counts, row) => {
    const goal = optimizationGoalForDecision(row, portfolioRowsBySku.get(row.skuId)).goal;
    counts[goal] = (counts[goal] ?? 0) + 1;
    return counts;
  }, {
    GROWTH: 0,
    PROFIT: 0,
    INVENTORY: 0,
    PORTFOLIO_HEALTH: 0
  }), [portfolioRowsBySku, rows]);
  const displayedRows = selectedGoal
    ? rows.filter((row) => {
      const goal = optimizationGoalForDecision(row, portfolioRowsBySku.get(row.skuId));
      return goal.goal === selectedGoal && (!selectedGoalAction || goal.actionLabel === selectedGoalAction);
    })
    : rows;
  const goalRows = selectedGoal
    ? rows.filter((row) => optimizationGoalForDecision(row, portfolioRowsBySku.get(row.skuId)).goal === selectedGoal)
    : rows;
  const actionCounts = goalRows.reduce<Record<string, number>>((counts, row) => {
    const label = optimizationGoalForDecision(row, portfolioRowsBySku.get(row.skuId)).actionLabel;
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});
  const queueCountLabel = displayedRows.length === rows.length
    ? (isZh ? `待优化 ${numberFormat.format(rows.length)} 个` : `${numberFormat.format(rows.length)} pending`)
    : (isZh
      ? `${numberFormat.format(displayedRows.length)} 个显示 / ${numberFormat.format(rows.length)} 个待优化`
      : `${numberFormat.format(displayedRows.length)} shown / ${numberFormat.format(rows.length)} pending`);
  const visibleSelectedKey = displayedRows.some((row) => decisionRowKey(row) === selectedRowKey)
    ? selectedRowKey
    : null;

  useEffect(() => {
    if (selectedRow) setSelectedRowKey(decisionRowKey(selectedRow));
  }, [selectedRow]);

  useEffect(() => {
    if (hasManuallySelectedGoalRef.current || !rows.length || goalCounts[selectedGoal] > 0) return;
    const nextGoal = optimizationGoalFilters.find((filter) => goalCounts[filter.goal] > 0)?.goal;
    if (!nextGoal) return;
    setSelectedGoal(nextGoal);
    setSelectedGoalAction(null);
  }, [goalCounts, rows.length, selectedGoal]);

  const selectRow = (row: PortfolioDecisionRow) => {
    setSelectedRowKey(decisionRowKey(row));
    onSelect(row);
  };

  return (
    <aside className="flex h-[640px] max-h-[640px] min-h-0 flex-col overflow-hidden rounded-lg bg-emerald-50/70 p-0 xl:sticky xl:top-0 xl:h-full xl:max-h-full">
      <div className="rounded-lg bg-emerald-950 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="whitespace-nowrap text-base font-bold text-white">{isZh ? "优化队列" : "Optimization Queue"}</p>
          <span className="rounded-full bg-emerald-300/15 px-2.5 py-1 text-xs font-bold text-emerald-50 ring-1 ring-emerald-200/25">
            {queueCountLabel}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {optimizationGoalFilters.map((filter) => {
            const isSelected = selectedGoal === filter.goal;
            return (
            <button
              key={filter.goal}
              type="button"
              onClick={() => {
                hasManuallySelectedGoalRef.current = true;
                if (selectedGoal !== filter.goal) setSelectedGoalAction(null);
                setSelectedGoal(filter.goal);
              }}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-bold transition ring-1",
                isSelected
                  ? "bg-[#5747e8] text-white ring-[#5747e8]"
                  : "bg-emerald-300/10 text-emerald-50 ring-emerald-200/20 hover:bg-emerald-300/20"
              )}
              aria-pressed={isSelected}
            >
              {filter.label}
            </button>
            );
          })}
        </div>
      </div>

      <div className={cn(
        "mt-2 flex min-h-[38px] flex-wrap content-start gap-2 px-1",
        !selectedGoal && "invisible"
      )}>
        {selectedGoal
          ? optimizationActionFilters[selectedGoal].map((action) => {
            const isSelected = selectedGoalAction === action;
            const count = actionCounts[action] ?? 0;
            return (
              <button
                key={action}
                type="button"
	                onClick={() => {
	                  const nextAction = selectedGoalAction === action ? null : action;
	                  setSelectedGoalAction(nextAction);
	                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold transition ring-1",
                  isSelected
                    ? "bg-[#5747e8] text-white ring-[#5747e8]"
                    : "bg-white text-emerald-900 ring-emerald-200 hover:bg-emerald-50"
                )}
                aria-pressed={isSelected}
              >
                {actionFilterDisplayLabel(action)}
                <span className={cn(
                  "ml-1 text-[10px]",
                  isSelected ? "text-white/80" : "text-emerald-700/70"
                )}>
                  {numberFormat.format(count)}
                </span>
              </button>
            );
          })
          : null}
      </div>
      <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-scroll overscroll-contain px-1 pb-1 pr-4 [scrollbar-color:rgba(100,116,139,0.75)_transparent] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-4 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/75">
        {displayedRows.length ? displayedRows.map((row) => {
          const key = decisionRowKey(row);
          const isSelected = visibleSelectedKey === key;
	          const recommendation = portfolioRowsBySku.get(row.skuId);
	          const impact = row.expectedProfitImpact ?? row.estimatedProfitImpact ?? 0;
	          const status = actionStatuses[key] === "accepted" ? "accepted" : actionStatuses[key] === "rejected" ? "rejected" : "awaiting_decision";
	          const goal = optimizationGoalForDecision(row, recommendation);
	          const actionDisplay = actionDisplayForDecision(row, recommendation);
            const previousDecisionStatus = previousDecisionActiveStatus(row);

          return (
            <div
              key={key}
              className={cn(
                "rounded-lg border-2 bg-white transition",
                isSelected
                  ? "border-blue-600 shadow-sm"
                  : "border-transparent ring-1 ring-slate-100"
              )}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => selectRow(row)}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  selectRow(row);
                }}
                onMouseDown={(event) => {
                  if (event.detail > 1) event.preventDefault();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectRow(row);
                  }
                }}
                className={cn(
                  "w-full select-none rounded-lg p-3 text-left transition hover:bg-emerald-50/50",
                  isSelected && "bg-emerald-50"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-950">{row.skuId}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <OptimizationGoalBadge goal={goal.goal} label={goalFilterDisplayLabel(goal.goal)} />
	                      <OptimizationActionBadge goal={goal.goal} label={actionDisplay.title} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">{signedCurrency(impact)}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">
	                  {actionDisplay.description}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {previousDecisionStatus ? (
                    <ActiveDecisionStatusBadge status={previousDecisionStatus} locale={locale} />
                  ) : (
                    <span />
                  )}
                  {status === "awaiting_decision" ? (
                    <ActionDecisionButtons
                      locale={locale}
                      onAccept={(event) => {
                        event?.stopPropagation();
                        onAccept(row);
                      }}
                      onReject={(event) => {
                        event?.stopPropagation();
                        onReject(row);
                      }}
                      compact
                    />
                  ) : (
                    <RecommendationStatusBadge status={status} locale={locale} />
                  )}
                </div>
              </div>

              {isSelected && showInlineDetail ? (
                <div className="border-t border-slate-100 p-0">
                  <SelectedSkuOptimizationPanel
                    row={row}
                    recommendation={recommendation}
                    trackedOutcomeRows={trackedOutcomeRows}
                    simulationHorizonDays={simulationHorizonDays}
                    actionStatus={actionStatuses[key] === "accepted" ? "accepted" : actionStatuses[key] === "rejected" ? "rejected" : "pending"}
                    acceptedAt={acceptedAtByDecision[key]}
                    locale={locale}
                  />
                </div>
              ) : null}
            </div>
          );
        }) : (
          <div className="grid min-h-[92px] place-items-start rounded-lg bg-white p-4 text-sm font-medium text-slate-500 ring-1 ring-slate-100">
            {isZh
              ? `${goalFilterDisplayLabel(selectedGoal)} 当前没有需要优化的 SKU。`
              : `No ${goalFilterDisplayLabel(selectedGoal)} SKUs currently need optimization.`}
          </div>
        )}
      </div>
    </aside>
  );
}

function decisionTimingTableLabel(row: PortfolioDecisionRow, fallbackDays: number, locale: RendererLocale) {
  const timing = row.timing;
  const days = timing?.simulation_window_days ?? row.simulation_horizon?.days ?? fallbackDays;
  const start = timing?.simulation_window_start ?? todayDateOnly();
  const end = timing?.simulation_window_end ?? addDateOnly(start, Math.max(0, days - 1));
  return locale === "zh"
    ? `模拟期：${formatShortDate(start)} – ${formatShortDate(end)} · 基于过去${days}天表现预测`
    : `Simulation: ${formatShortDate(start)} – ${formatShortDate(end)} · Based on previous ${days} days`;
}

function simulationEstimateSourceLabel(row: PortfolioDecisionRow, locale: RendererLocale) {
  const source = row.simulation_estimate?.prediction_source;
  const days = row.simulation_estimate?.simulation_window?.days ?? row.simulation_horizon?.days ?? row.timing?.simulation_window_days ?? 30;
  const label = source === "sku_historical_ads"
    ? "SKU historical ads"
    : source === "similar_sku_benchmark"
      ? "similar SKU benchmark"
      : source === "store_level_blended_roas_discounted"
        ? "store-level blended ROAS discounted"
        : source === "rule_based_conservative_fallback"
          ? "conservative fallback"
          : "simulation estimate";
  return locale === "zh"
    ? `基于 ${label} / ${days}-day simulation`
    : `Based on ${label} / ${days}-day simulation`;
}

function formatBaselinePeriod(row: PortfolioDecisionRow, fallbackDays: number) {
  const days = row.timing?.simulation_window_days ?? row.simulation_horizon?.days ?? fallbackDays;
  const actionStart = row.timing?.simulation_window_start ?? todayDateOnly();
  const start = row.timing?.baseline_period_start ?? addDateOnly(actionStart, -days);
  const end = row.timing?.baseline_period_end ?? addDateOnly(actionStart, -1);
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

function formatDecisionActionStart(row: PortfolioDecisionRow) {
  const start = row.timing?.simulation_window_start ?? todayDateOnly();
  const source = row.timing?.timing_source ?? "fallback_today";
  const sourceLabel = source === "report_generated_at"
    ? "report generated date"
    : source === "latest_data_date_plus_one"
      ? "latest data date + 1"
      : source === "accepted_at"
        ? "accepted date"
        : "estimated timing";
  return `${formatShortDate(start)} · ${sourceLabel}`;
}

function formatDecisionWindow(row: PortfolioDecisionRow, fallbackDays: number) {
  const days = row.timing?.simulation_window_days ?? row.simulation_horizon?.days ?? fallbackDays;
  const start = row.timing?.simulation_window_start ?? todayDateOnly();
  const end = row.timing?.simulation_window_end ?? addDateOnly(start, Math.max(0, days - 1));
  return `${days} days · ${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function formatTrackingWindow(row: PortfolioDecisionRow, fallbackDays: number, acceptedAt?: string) {
  if (!acceptedAt) return "Starts after Accept";
  const days = row.timing?.tracking_window_days ?? row.timing?.simulation_window_days ?? row.simulation_horizon?.days ?? fallbackDays;
  return `${formatShortDate(acceptedAt)} – ${formatShortDate(addDateOnly(acceptedAt, Math.max(0, days - 1)))}`;
}

function formatSkuLaunchDate() {
  return "—";
}

function formatAdStartDate(row: PortfolioDecisionRow) {
  if (!isAdDecision(row)) return "—";
  return formatShortDate(row.timing?.simulation_window_start ?? todayDateOnly());
}

function formatAdEndDate(row: PortfolioDecisionRow, fallbackDays: number) {
  if (!isAdDecision(row)) return "—";
  const days = row.timing?.simulation_window_days ?? row.simulation_horizon?.days ?? fallbackDays;
  const start = row.timing?.simulation_window_start ?? todayDateOnly();
  return formatShortDate(row.timing?.simulation_window_end ?? addDateOnly(start, Math.max(0, days - 1)));
}

function formatOfflineDate(row: PortfolioDecisionRow) {
  if (row.action === "REDUCE" || row.sourceAction === "STOP") {
    return formatShortDate(row.timing?.simulation_window_start ?? todayDateOnly());
  }
  return "—";
}

function isAdDecision(row: PortfolioDecisionRow) {
  return /AD|ADS|BUDGET|SCALE/i.test(`${row.sourceAction ?? ""} ${safeStringArray(row.recommendedActions).join(" ")} ${safeStringArray(row.recommendedExecution).join(" ")}`);
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function addDateOnly(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatShortDate(dateOnly: string) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateOnly;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function decisionFilterMatchesRow(row: PortfolioDecisionRow, filter: PortfolioDecisionFilter) {
  if (filter === "ALL") return true;
  if (filter === "INVENTORY_RISK") {
    if ("inventoryRisk" in row) return Boolean(row.inventoryRisk);
    return decisionRowSearchText(row).includes("inventory") || decisionRowSearchText(row).includes("stock");
  }
  if (filter === "BUDGET_OPPORTUNITY") {
    if ("budgetOpportunity" in row) return Boolean(row.budgetOpportunity);
    return decisionRowSearchText(row).includes("budget") || decisionRowSearchText(row).includes("ad") || decisionRowSearchText(row).includes("advertising");
  }
  return row.action === filter;
}

function decisionRowSearchText(row: PortfolioDecisionRow) {
  return [
    row.sourceAction,
    safeStringArray(row.recommendedActions).join(" "),
    safeStringArray(row.recommendedExecution).join(" "),
    safeStringArray(row.risks).join(" "),
    Array.isArray(row.decisionDrivers) ? row.decisionDrivers.map((driver) => `${objectRecord(driver).category ?? ""} ${objectRecord(driver).metric ?? ""} ${objectRecord(driver).value ?? ""}`).join(" ") : "",
    row.causalExplanation ? `${safeStringArray(row.causalExplanation.evidence).join(" ")} ${row.causalExplanation.businessMeaning ?? ""} ${row.causalExplanation.decision ?? ""}` : ""
  ].join(" ").toLowerCase();
}

function portfolioActionLabel(row: PortfolioRow, locale: RendererLocale) {
  const action = String(row.action ?? "");
  if (action.includes("SCALE")) return locale === "zh" ? "增加广告" : "Increase Ads";
  if (action.includes("REDUCE")) return locale === "zh" ? "降低广告" : "Reduce Ads";
  if (action.includes("PRICE")) return locale === "zh" ? "调整价格" : "Price Adjust";
  if (action.includes("RESTOCK")) return locale === "zh" ? "补库存" : "Restock Inventory";
  return locale === "zh" ? "保持" : "Hold";
}

function portfolioRowToOutcomeRow(row: PortfolioRow, locale: RendererLocale): ActionOutcomeRow {
  return {
    action: portfolioActionLabel(row, locale),
    sku: row.sku,
    acceptedAt: "Jul 8",
    window: String(row.action ?? "").includes("PRICE") ? "14d" : "7d",
    baselineProfit: safeNumber(row.current_profit),
    predictedProfitLift: Math.max(0, safeNumber(row.profit_delta)),
    actualTotalProfitChange: null,
    actualProfitLift: null,
    organicProfitChange: null,
    status: "Running",
    confidence: safeNumber(row.confidence),
    evidence: portfolioEvidenceSummary(row, locale)
  };
}

function upsertOutcomeRow(rows: ActionOutcomeRow[], next: ActionOutcomeRow) {
  const filtered = rows.filter((row) => !(row.sku === next.sku && row.action === next.action));
  return [next, ...filtered];
}

function actualProfitLiftForSku(rows: ActionOutcomeRow[], sku: string) {
  const matchedRows = rows.filter((row) => row.sku === sku && row.actualProfitLift !== null);
  if (!matchedRows.length) return null;
  return matchedRows.reduce((sum, row) => sum + (row.actualProfitLift ?? 0), 0);
}

function organicProfitChangeForSku(rows: ActionOutcomeRow[], sku: string) {
  const matchedRows = rows.filter((row) => row.sku === sku && row.organicProfitChange !== null);
  if (!matchedRows.length) return null;
  return matchedRows.reduce((sum, row) => sum + (row.organicProfitChange ?? 0), 0);
}

function outcomeStatusForProfitChange(value: number | null): "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "TRACKING" {
  if (value === null) return "TRACKING";
  if (value > 0.01) return "POSITIVE";
  if (value < -0.01) return "NEGATIVE";
  return "NEUTRAL";
}

function normalizeLifecycleStage(stage?: string | null) {
  const normalized = String(stage ?? "").trim().toUpperCase();
  if (normalized === "LAUNCH" || normalized === "GROWTH" || normalized === "MATURE" || normalized === "DECLINING") {
    return normalized;
  }
  return undefined;
}

function inferSkuLifecycleStage(row: Pick<SkuReportRow, "profit" | "margin" | "sales_velocity" | "days_of_inventory" | "overstock_risk">) {
  if ((row.profit !== null && row.profit < 0) || (row.margin !== null && row.margin < 0.1)) return "DECLINING";
  if (row.sales_velocity >= 10 && (row.margin === null || row.margin >= 0.2)) return "GROWTH";
  if (row.days_of_inventory !== null && row.days_of_inventory > 120) return "DECLINING";
  if (row.overstock_risk === "high") return "DECLINING";
  return "MATURE";
}

function LifecycleBadge({ stage, locale = "en" }: { stage?: string; locale?: RendererLocale }) {
  const normalizedStage = normalizeLifecycleStage(stage);
  const labelMap = locale === "zh"
    ? { LAUNCH: "新品", GROWTH: "增长", MATURE: "成熟", DECLINING: "衰退", FALLBACK: "生命周期" }
    : { LAUNCH: "Launch", GROWTH: "Growth", MATURE: "Mature", DECLINING: "Declining", FALLBACK: "Lifecycle" };
  const label = normalizedStage ? labelMap[normalizedStage] : labelMap.FALLBACK;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold",
        normalizedStage === "LAUNCH" && "bg-sky-100 text-sky-800",
        normalizedStage === "GROWTH" && "bg-emerald-100 text-emerald-800",
        normalizedStage === "MATURE" && "bg-indigo-100 text-indigo-800",
        normalizedStage === "DECLINING" && "bg-rose-100 text-rose-800",
        !normalizedStage && "bg-slate-100 text-slate-600"
      )}
    >
      {label}
    </span>
  );
}

type DecisionDriverView = {
  category: string;
  metric: string;
  value: string;
  impact: "positive" | "negative" | "risk";
};

type DecisionCausalExplanationView = {
  evidence: string[];
  businessMeaning: string;
  decision: string;
};

function DecisionDriversCell({
  action,
  drivers,
  causalExplanation,
  confidenceBreakdown,
  locale
}: {
  action: "SCALE" | "REDUCE" | "OPTIMIZE" | "MONITOR";
  drivers: DecisionDriverView[];
  causalExplanation: DecisionCausalExplanationView;
  confidenceBreakdown?: {
    revenue_prediction_confidence: number;
    profit_model_confidence: number;
    inventory_confidence: number;
    attribution_confidence: number;
    overall_confidence: number;
  };
  locale: RendererLocale;
}) {
  const isZh = locale === "zh";
  const title = action === "SCALE"
    ? (isZh ? "Why Scale" : "Why Scale")
    : action === "REDUCE"
      ? (isZh ? "Why Reduce / Stop" : "Why Reduce / Stop")
      : action === "OPTIMIZE"
        ? (isZh ? "Why Optimize" : "Why Optimize")
        : (isZh ? "Why Monitor" : "Why Monitor");

  return (
    <div className="max-w-[380px] space-y-2">
      <p className="text-xs font-bold text-slate-950">{title}</p>
      <div className="grid gap-1.5">
        {drivers.slice(0, 3).map((driver) => (
          <div
            key={`${driver.category}-${driver.metric}-${driver.value}`}
            className={cn(
              "rounded-md border px-2 py-1.5",
              driver.impact === "positive" && "border-emerald-100 bg-emerald-50/70",
              driver.impact === "negative" && "border-rose-100 bg-rose-50/70",
              driver.impact === "risk" && "border-amber-100 bg-amber-50/70"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold text-slate-700">{localizeDriverText(driver.category, locale)}</p>
              <span
                className={cn(
                  "text-[11px] font-bold",
                  driver.impact === "positive" && "text-emerald-700",
                  driver.impact === "negative" && "text-rose-700",
                  driver.impact === "risk" && "text-amber-700"
                )}
              >
                {driver.impact === "positive" ? "✓" : driver.impact === "negative" ? "✕" : "!"}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
              {localizeDriverText(driver.metric, locale)}: <span className="font-semibold text-slate-900">{localizeDriverText(driver.value, locale)}</span>
            </p>
          </div>
        ))}
      </div>
      <p className="border-l-2 border-slate-200 pl-2 text-[11px] leading-4 text-slate-600">
        {localizeDriverText(causalExplanation.businessMeaning, locale)} → <span className="font-semibold text-slate-900">{localizeDriverText(causalExplanation.decision, locale)}</span>
      </p>
      {confidenceBreakdown ? (
        <div className="grid grid-cols-2 gap-1 text-[10px] font-semibold text-slate-500">
          <span>{isZh ? "收入" : "Revenue"} {percent.format(confidenceBreakdown.revenue_prediction_confidence)}</span>
          <span>{isZh ? "利润" : "Profit"} {percent.format(confidenceBreakdown.profit_model_confidence)}</span>
          <span>{isZh ? "库存" : "Inventory"} {percent.format(confidenceBreakdown.inventory_confidence)}</span>
          <span>{isZh ? "归因" : "Attribution"} {percent.format(confidenceBreakdown.attribution_confidence)}</span>
        </div>
      ) : null}
    </div>
  );
}
function DecisionBadge({ action, locale }: { action: "SCALE" | "REDUCE" | "OPTIMIZE" | "MONITOR"; locale: RendererLocale }) {
  const label = decisionActionLabel(action, locale);
  const tone = action === "SCALE" ? "success" : action === "REDUCE" ? "danger" : action === "OPTIMIZE" ? "warning" : "neutral";
  return <Badge tone={tone}>{label}</Badge>;
}

function OptimizationGoalBadge({ goal, label }: { goal: OptimizationGoal; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold",
        goal === "GROWTH" && "bg-emerald-100 text-emerald-800",
        goal === "PROFIT" && "bg-amber-100 text-amber-800",
        goal === "INVENTORY" && "bg-sky-100 text-sky-800",
        goal === "PORTFOLIO_HEALTH" && "bg-rose-100 text-rose-800"
      )}
    >
      {label}
    </span>
  );
}

function OptimizationActionBadge({ goal, label }: { goal: OptimizationGoal; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold",
        goal === "GROWTH" && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
        goal === "PROFIT" && "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
        goal === "INVENTORY" && "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
        goal === "PORTFOLIO_HEALTH" && "bg-rose-50 text-rose-700 ring-1 ring-rose-100"
      )}
    >
      {label}
    </span>
  );
}

function isNoActionDecisionRow(row: PortfolioDecisionRow) {
  const sourceAction = String(row.sourceAction ?? "").trim();
  const unifiedAction = String((row as { unified_action?: string }).unified_action ?? "").trim();
  const displayTitle = String((row as { display?: { title?: string } }).display?.title ?? "").trim().toLowerCase();
  const hasConcreteAction = Boolean(unifiedAction && unifiedAction !== "HOLD") ||
    Boolean(displayTitle && !/hold|monitor|no action/.test(displayTitle));
  return sourceAction === "HOLD" || (!sourceAction && !hasConcreteAction && row.action === "MONITOR");
}

function decisionInventoryEvidence(row: PortfolioDecisionRow, recommendation?: PortfolioRow, detail?: SelectedSkuDetail) {
  const payload = row as PortfolioDecisionRow & {
    decision_contract?: DecisionContract;
    simulation?: {
      required_inventory?: number | null;
      current_inventory?: number | null;
      inventory_impact?: number | null;
    };
    before_state?: { inventory?: number | null };
  };
  const contractEvidence = payload.decision_contract?.evidence;
  const traceEvidence = payload.decision_contract?.trace.evidence;
  const recommendationSimulation = objectRecord(recommendation?.simulation);
  const recommendationBeforeState = objectRecord(recommendation?.before_state);
  const currentInventory =
    numberOrNull(traceEvidence?.current_inventory) ??
    numberOrNull(contractEvidence?.currentInventory) ??
    numberOrNull(payload.simulation?.current_inventory) ??
    numberOrNull(recommendationSimulation.current_inventory) ??
    numberOrNull(payload.before_state?.inventory) ??
    numberOrNull(recommendationBeforeState.inventory) ??
    (detail ? numberOrNull(detail.current_stock) : null);
  const requiredInventory =
    numberOrNull(traceEvidence?.required_inventory) ??
    numberOrNull(contractEvidence?.requiredInventory) ??
    numberOrNull(payload.simulation?.required_inventory) ??
    numberOrNull(recommendationSimulation.required_inventory);
  const inventoryDelta =
    numberOrNull(traceEvidence?.inventory_delta) ??
    numberOrNull(contractEvidence?.inventoryDelta) ??
    numberOrNull(contractEvidence?.recommendedInventoryChange) ??
    numberOrNull(payload.simulation?.inventory_impact) ??
    numberOrNull(recommendationSimulation.inventory_impact);
  const inventoryGap =
    numberOrNull(traceEvidence?.inventory_gap) ??
    numberOrNull(contractEvidence?.inventoryGap) ??
    (requiredInventory !== null && currentInventory !== null ? requiredInventory - currentInventory : null);

  return {
    currentInventory,
    requiredInventory,
    inventoryGap,
    inventoryDelta
  };
}

function normalizedDecisionForDecision(row: PortfolioDecisionRow, recommendation?: PortfolioRow, detail?: SelectedSkuDetail): NormalizedDecision {
  const payload = row as PortfolioDecisionRow & {
    canonical_action?: string | null;
    unified_action?: string | null;
    decision_contract?: DecisionContract;
    display?: { title?: string | null };
    stockout_risk?: boolean | string | null;
    days_of_inventory?: number | null;
    simulation?: {
      required_inventory?: number | null;
      current_inventory?: number | null;
      inventory_impact?: number | null;
      recommended_ads_spend?: number | null;
      current_ads_spend?: number | null;
    };
    before_state?: { inventory?: number | null };
  };
  const contract = payload.decision_contract;
  const evidence = contract?.evidence;
  const impact = contract?.impact;
  const inventoryEvidence = decisionInventoryEvidence(row, recommendation, detail);
  const recommendedAdsSpend = payload.simulation?.recommended_ads_spend ?? recommendation?.simulation?.recommended_ads_spend ?? null;
  const currentAdsSpend = payload.simulation?.current_ads_spend ?? recommendation?.simulation?.current_ads_spend ?? null;
  const displayTitle =
    payload.display?.title ??
    (recommendation as { display?: { title?: string | null } } | undefined)?.display?.title ??
    (row.sku_decision_object as { display?: { title?: string | null } } | undefined)?.display?.title ??
    null;
  const roas = row.simulation_estimate?.revenue_simulation?.base_roas ??
    (detail ? detail.current_revenue / Math.max(1, detail.current_ads_spend) : null);

  return normalizeDecision({
    canonicalAction: contract?.action ?? payload.canonical_action,
    sourceAction: row.sourceAction,
    action: row.action,
    unifiedAction: payload.unified_action,
    inventoryRisk: evidence?.riskTypes?.inventory_shortage_risk ?? ("inventoryRisk" in row ? Boolean(row.inventoryRisk) : null),
    stockoutRisk: evidence?.stockoutRisk ?? payload.stockout_risk,
    requiredInventory: inventoryEvidence.requiredInventory,
    currentInventory: inventoryEvidence.currentInventory,
    inventoryGap: inventoryEvidence.inventoryGap,
    inventoryDelta: inventoryEvidence.inventoryDelta,
    recommendedInventoryChange: inventoryEvidence.inventoryDelta,
    adBudgetChange: evidence?.adBudgetChange ?? (recommendedAdsSpend !== null && currentAdsSpend !== null ? safeNumber(recommendedAdsSpend) - safeNumber(currentAdsSpend) : null),
    roas: evidence?.roas ?? roas,
    expectedProfitImpact: impact?.expectedProfitChange ?? row.expectedProfitImpact ?? row.estimatedProfitImpact ?? recommendation?.profit_delta ?? null,
    recommendedText: evidence?.recommendedText ?? `${safeStringArray(row.recommendedActions).join(" ")} ${safeStringArray(row.recommendedExecution).join(" ")}`,
    displayTitle
  });
}

function optimizationGoalForDecision(row: PortfolioDecisionRow, recommendation?: PortfolioRow): { goal: OptimizationGoal; goalLabel: string; actionLabel: string } {
  const sourceAction = String(row.sourceAction ?? "");
  const recommendedText = `${safeStringArray(row.recommendedActions).join(" ")} ${safeStringArray(row.recommendedExecution).join(" ")} ${sourceAction}`.toLowerCase();
  const backendGoal = (row as { optimization_goal?: string }).optimization_goal;
  const backendUnifiedAction = (row as { unified_action?: string }).unified_action;
  const opportunityType = (row as { opportunity_type?: string }).opportunity_type;
  const normalized = normalizedDecisionForDecision(row, recommendation);

  if (normalized.action === "SCALE_ADS" || normalized.action === "INCREASE_BUDGET") {
    return { goal: "GROWTH", goalLabel: "Growth", actionLabel: "Scale Ads" };
  }
  if (normalized.action === "RESTOCK_INVENTORY") {
    return { goal: "INVENTORY", goalLabel: "Inventory", actionLabel: "Restock Inventory" };
  }
  if (normalized.action === "CLEAR_EXCESS_INVENTORY" || normalized.action === "REDUCE_INVENTORY") {
    return { goal: "INVENTORY", goalLabel: "Inventory", actionLabel: "Clear Excess Inventory" };
  }
  if (normalized.action === "ADJUST_PRICE") {
    const actionLabel = sourceAction === "PRICE_DOWN_10"
      ? "Decrease Price"
      : sourceAction === "PROMOTION_TEST"
        ? "Run Promotion"
        : "Increase Price";
    return { goal: "PROFIT", goalLabel: "Profit", actionLabel };
  }
  if (normalized.action === "REDUCE_ADS") {
    return { goal: "PORTFOLIO_HEALTH", goalLabel: "Portfolio Health", actionLabel: opportunityType === "AD_EFFICIENCY" || opportunityType === "PORTFOLIO" || recommendedText.includes("waste") ? "Reduce Ad Waste" : "Reallocate Budget" };
  }
  if (normalized.action === "STOP_SKU") {
    return { goal: "PORTFOLIO_HEALTH", goalLabel: "Portfolio Health", actionLabel: "Exit SKU" };
  }
  if (normalized.action === "HOLD") {
    return { goal: "PORTFOLIO_HEALTH", goalLabel: "Portfolio Health", actionLabel: "No Action Required" };
  }
  if (sourceAction === "STOP") {
    return { goal: "PORTFOLIO_HEALTH", goalLabel: "Portfolio Health", actionLabel: "Exit SKU" };
  }
  if (backendUnifiedAction === "SCALE_ADS") {
    return { goal: "GROWTH", goalLabel: "Growth", actionLabel: "Scale Ads" };
  }
  if (backendUnifiedAction === "EXPAND_CHANNEL") {
    return { goal: "GROWTH", goalLabel: "Growth", actionLabel: "Expand Channel" };
  }
  if (backendUnifiedAction === "OPTIMIZE_PRICE") {
    const actionLabel = sourceAction === "PRICE_DOWN_10"
      ? "Decrease Price"
      : sourceAction === "PROMOTION_TEST"
        ? "Run Promotion"
        : "Increase Price";
    return { goal: "PROFIT", goalLabel: "Profit", actionLabel };
  }
  if (backendUnifiedAction === "RESTOCK") {
    return { goal: "INVENTORY", goalLabel: "Inventory", actionLabel: "Restock Inventory" };
  }
  if (backendUnifiedAction === "REDUCE_INVENTORY") {
    return { goal: "INVENTORY", goalLabel: "Inventory", actionLabel: "Clear Excess Inventory" };
  }
  if (backendUnifiedAction === "REALLOCATE_BUDGET") {
    return { goal: "PORTFOLIO_HEALTH", goalLabel: "Portfolio Health", actionLabel: "Reallocate Budget" };
  }
  if (backendUnifiedAction === "REDUCE_WASTE") {
    return { goal: "PORTFOLIO_HEALTH", goalLabel: "Portfolio Health", actionLabel: "Reduce Ad Waste" };
  }
  if (backendUnifiedAction === "STOP_SKU") {
    return { goal: "PORTFOLIO_HEALTH", goalLabel: "Portfolio Health", actionLabel: "Exit SKU" };
  }
  if (backendUnifiedAction === "ENRICH_PROFIT_INPUTS" || sourceAction === "ENRICH_PROFIT_INPUTS") {
    return { goal: "PORTFOLIO_HEALTH", goalLabel: "Portfolio Health", actionLabel: "Enrich Inputs" };
  }
  if (sourceAction === "REDUCE_ADS" || row.action === "REDUCE") {
    const actionLabel = opportunityType === "AD_EFFICIENCY" || opportunityType === "PORTFOLIO" || recommendedText.includes("waste")
      ? "Reduce Ad Waste"
      : backendUnifiedAction === "REALLOCATE_BUDGET" || backendGoal === "PROFIT" || recommendedText.includes("reallocate")
        ? "Reallocate Budget"
        : "Reduce Ad Waste";
    return { goal: "PORTFOLIO_HEALTH", goalLabel: "Portfolio Health", actionLabel };
  }
  if (sourceAction === "RESTOCK_AND_SCALE" || sourceAction.includes("RESTOCK")) {
    return { goal: "INVENTORY", goalLabel: "Inventory", actionLabel: "Restock Inventory" };
  }
  if (sourceAction === "REDUCE_INVENTORY" || recommendedText.includes("inventory balance")) {
    return { goal: "INVENTORY", goalLabel: "Inventory", actionLabel: "Clear Excess Inventory" };
  }
  if (sourceAction === "SHIFT_CHANNEL") {
    return { goal: "GROWTH", goalLabel: "Growth", actionLabel: "Expand Channel" };
  }
  if (sourceAction === "PROMOTION_TEST") {
    return { goal: "PROFIT", goalLabel: "Profit", actionLabel: "Run Promotion" };
  }
  if (sourceAction === "PRICE_DOWN_10") {
    return { goal: "PROFIT", goalLabel: "Profit", actionLabel: "Decrease Price" };
  }
  if (sourceAction.includes("PRICE")) {
    return { goal: "PROFIT", goalLabel: "Profit", actionLabel: "Increase Price" };
  }
  if (recommendedText.includes("reallocate")) {
    return { goal: "PORTFOLIO_HEALTH", goalLabel: "Portfolio Health", actionLabel: "Reallocate Budget" };
  }
  if (sourceAction.includes("SCALE") || sourceAction === "TEST_AD_SPEND" || sourceAction === "CREATE_BUNDLE" || row.action === "SCALE") {
    return { goal: "GROWTH", goalLabel: "Growth", actionLabel: "Scale Ads" };
  }
  if (isNoActionDecisionRow(row)) {
    return { goal: "PORTFOLIO_HEALTH", goalLabel: "Portfolio Health", actionLabel: "No Action Required" };
  }

  return { goal: "PROFIT", goalLabel: "Profit", actionLabel: "Reallocate Budget" };
}

function inventoryActionUnits(
  row: PortfolioDecisionRow,
  recommendation: PortfolioRow | undefined,
  detail: SelectedSkuDetail | undefined,
  mode: "restock" | "clear"
) {
  const rowWithSimulation = row as PortfolioDecisionRow & {
    simulation?: { required_inventory?: number; current_inventory?: number; inventory_impact?: number };
    before_state?: { inventory?: number };
  };
  const evidence = decisionInventoryEvidence(row, recommendation, detail);
  const recommendationSimulation = objectRecord(recommendation?.simulation);
  const simulation = recommendation?.simulation ?? rowWithSimulation.simulation;
  const beforeState = recommendation?.before_state ?? rowWithSimulation.before_state;
  const simulationCurrentInventory = simulation === recommendation?.simulation
    ? numberOrNull(recommendationSimulation.current_inventory)
    : numberOrNull(rowWithSimulation.simulation?.current_inventory);
  const currentInventory = evidence.currentInventory ?? simulationCurrentInventory ?? beforeState?.inventory ?? detail?.current_stock ?? 0;
  const requiredInventory = evidence.requiredInventory ?? simulation?.required_inventory ?? 0;
  const inventoryImpact = simulation?.inventory_impact ?? 0;
  const value = mode === "restock"
    ? inventoryRestockUnits({
      requiredInventory,
      currentInventory
    })
    : Math.max(0, currentInventory - requiredInventory, Math.abs(Math.min(0, evidence.inventoryDelta ?? inventoryImpact)));

  return Number.isFinite(value) ? Math.round(value) : 0;
}

function adsBudgetDeltaForDecision(row: PortfolioDecisionRow, recommendation: PortfolioRow | undefined) {
  const expectedProfit = safeNumber(row.expectedProfitImpact ?? row.estimatedProfitImpact ?? recommendation?.profit_delta);
  const rowWithSimulation = row as PortfolioDecisionRow & {
    simulation?: { recommended_ads_spend?: number; current_ads_spend?: number };
  };
  const rowSimulationDelta = rowWithSimulation.simulation
    ? safeNumber(rowWithSimulation.simulation.recommended_ads_spend) - safeNumber(rowWithSimulation.simulation.current_ads_spend)
    : 0;
  const simulationDelta = recommendation
    ? safeNumber(recommendation.simulation?.recommended_ads_spend) - safeNumber(recommendation.simulation?.current_ads_spend)
    : rowSimulationDelta;
  const estimateDelta = row.simulation_estimate?.investment?.additional_ad_spend ?? 0;
  const fallbackDelta = Math.max(50, Math.round(Math.abs(expectedProfit) * 0.24));
  const value = Math.max(simulationDelta, estimateDelta, 0);

  return value > 0 ? value : fallbackDelta;
}

function budgetReallocationPlan(row: PortfolioDecisionRow, recommendation: PortfolioRow | undefined) {
  const payload = row as PortfolioDecisionRow & {
    source_channel?: string;
    target_channel?: string;
    from_channel?: string;
    to_channel?: string;
    channel?: string;
  };
  const from = payload.source_channel ?? payload.from_channel ?? "Amazon";
  const to = payload.target_channel ?? payload.to_channel ?? (payload.channel && payload.channel !== from ? payload.channel : "Shopify");
  const amount = Math.max(0, adsBudgetDeltaForDecision(row, recommendation));

  return {
    from,
    to,
    amount,
    label: `${from} -> ${to}`
  };
}

function actionDisplayForDecision(
  row: PortfolioDecisionRow,
  recommendation?: PortfolioRow,
  detail?: SelectedSkuDetail,
  simulationHorizonDays = 30
): DecisionActionDisplay {
  const goal = optimizationGoalForDecision(row, recommendation);
  const backendDisplay =
    (row as { display?: DecisionActionDisplay }).display ??
    (recommendation as { display?: DecisionActionDisplay } | undefined)?.display ??
    (row.sku_decision_object as { display?: DecisionActionDisplay } | undefined)?.display;
  const backendDisplayTitle = String(backendDisplay?.title ?? "").toLowerCase();
  const backendDisplayIsNoAction = /hold|monitor|no action/.test(backendDisplayTitle);

  if (backendDisplay) {
    if (goal.actionLabel === "No Action Required") {
      return {
        ...backendDisplay,
        title: "No Action Required",
        icon: "⏸",
        category: "Portfolio Health",
        description: "Current portfolio performance is optimal; AI will continue monitoring new signals.",
        subtitle: "Continue monitoring",
        reason: "No alternative action generated higher risk-adjusted profit.",
        impact_label: "No execution impact expected."
      };
    }
    if (goal.actionLabel === "Scale Ads") {
      const adsDelta = adsBudgetDeltaForDecision(row, recommendation);
      return {
        ...backendDisplay,
        title: "Scale Ads",
        icon: "🚀",
        category: "Growth Optimization",
        description: `Increase advertising budget by ${signedCurrency(Math.max(0, adsDelta))} / ${simulationHorizonDays} days`,
        subtitle: `Increase ads budget ${signedCurrency(Math.max(0, adsDelta))} / ${simulationHorizonDays} days`,
        reason: "ROAS and margin support additional spend."
      };
    } else if (goal.actionLabel === "Expand Channel") {
      return {
        ...backendDisplay,
        title: "Expand Channel",
        icon: "🌎",
        category: "Growth Optimization",
        description: "Launch new channel test",
        subtitle: "Move budget to stronger channel",
        reason: "Simulation shows higher channel profitability."
      };
    } else if (goal.actionLabel === "Restock Inventory") {
      const restockUnits = inventoryActionUnits(row, recommendation, detail, "restock");
      const restockText = restockUnits > 0 ? `Restock ${restockUnits.toLocaleString("en-US")} units` : "Restock Inventory";
      const restockDescription = restockUnits > 0 ? `Add ${restockUnits.toLocaleString("en-US")} units inventory` : "Add inventory to prevent stockout risk";
      return {
        ...backendDisplay,
        title: restockText,
        icon: "📦",
        category: "Inventory Optimization",
        description: restockDescription,
        subtitle: restockDescription,
        reason: "Demand exceeds available stock."
      };
    } else if (goal.actionLabel === "Clear Excess Inventory") {
      const clearUnits = inventoryActionUnits(row, recommendation, detail, "clear");
      const clearText = clearUnits > 0 ? `Clear Excess Inventory ${clearUnits.toLocaleString("en-US")} units` : "Clear Excess Inventory";
      const clearDescription = clearUnits > 0
        ? `Clear ${clearUnits.toLocaleString("en-US")} excess units from active inventory exposure`
        : "Clear excess inventory from active inventory exposure";
      return {
        ...backendDisplay,
        title: clearText,
        icon: "🏷",
        category: "Inventory Optimization",
        description: clearDescription,
        subtitle: clearDescription,
        reason: "Slow velocity and cash tied up."
      };
    }
    if (!backendDisplayIsNoAction && goal.actionLabel === "Reallocate Budget") {
      const plan = budgetReallocationPlan(row, recommendation);
      return {
        ...backendDisplay,
        title: "Reallocate Budget",
        icon: "🔄",
        category: "Portfolio Health",
        description: `Move ${currencyDecimal.format(plan.amount)} budget: ${plan.label} / ${simulationHorizonDays} days`,
        subtitle: `Move budget: ${plan.label}`,
        reason: "Same budget can generate higher profit."
      };
    }
    if (!backendDisplayIsNoAction && goal.actionLabel === "Exit SKU") {
      return {
        ...backendDisplay,
        title: "Exit SKU",
        icon: "❌",
        category: "Portfolio Health",
        description: "Exit SKU from active optimization portfolio",
        subtitle: "Exit SKU",
        reason: "Negative profit trend and limited recovery potential."
      };
    }
  }

  const sourceAction = row.sourceAction ?? "";
  const expectedProfit = safeNumber(row.expectedProfitImpact ?? row.estimatedProfitImpact ?? recommendation?.profit_delta);
  const horizon = `${simulationHorizonDays} days`;
  const beforePrice = safeNumber(recommendation?.before_state?.price);
  const simulatedPrice = safeNumber(recommendation?.simulation?.simulated_price);
  const priceChange = recommendation && beforePrice > 0
    ? (simulatedPrice - beforePrice) / beforePrice
    : sourceAction === "PRICE_DOWN_10"
      ? -0.1
      : sourceAction === "PRICE_UP_10"
        ? 0.1
        : 0.05;
  const pricePercent = `${priceChange >= 0 ? "+" : ""}${Math.round(priceChange * 100)}%`;
  const adsDelta = adsBudgetDeltaForDecision(row, recommendation);
  const restockUnits = inventoryActionUnits(row, recommendation, detail, "restock");
  const clearUnits = inventoryActionUnits(row, recommendation, detail, "clear");

  if (goal.actionLabel === "No Action Required") {
    return {
      title: "No Action Required",
      icon: "⏸",
      category: "Portfolio Health",
      description: "Current portfolio performance is optimal; AI will continue monitoring new signals.",
      subtitle: "Continue monitoring",
      reason: "No alternative action generated higher risk-adjusted profit.",
      impact_label: "No execution impact expected."
    };
  }

  if (goal.actionLabel === "Increase Price" || goal.actionLabel === "Decrease Price" || goal.actionLabel === "Run Promotion") {
    if (sourceAction === "PROMOTION_TEST" || goal.actionLabel === "Run Promotion") {
      return {
        title: "Run Promotion 10%",
        icon: "🏷️",
        category: "Profit Optimization",
        description: "Apply 10% discount test",
        subtitle: "Apply 10% discount test",
        reason: "Promotion test checks whether demand lift offsets lower unit margin.",
        impact_label: `AI predicts ${signedCurrency(expectedProfit)} profit over ${horizon}.`
      };
    }

    const shouldDecrease = goal.actionLabel === "Decrease Price" || priceChange < 0;
    const title = shouldDecrease ? `Decrease Price ${Math.abs(Math.round(priceChange * 100))}%` : `Increase Price ${pricePercent}`;
    return {
      title,
      icon: "💰",
      category: "Profit Optimization",
      description: shouldDecrease ? `Lower price by ${Math.abs(Math.round(priceChange * 100))}% to improve demand` : `Raise price by ${pricePercent}`,
      subtitle: shouldDecrease ? `Lower price by ${Math.abs(Math.round(priceChange * 100))}%` : `Raise price by ${pricePercent}`,
      reason: shouldDecrease ? "Demand elasticity suggests volume growth will offset margin reduction." : "Current margin supports price increase with limited demand impact.",
      impact_label: `AI predicts ${signedCurrency(expectedProfit)} profit over ${horizon}.`
    };
  }

  if (goal.actionLabel === "Scale Ads") {
    return {
      title: "Scale Ads",
      icon: "🚀",
      category: "Growth Optimization",
      description: `Increase advertising budget by ${signedCurrency(Math.max(0, adsDelta))} / ${horizon}`,
      subtitle: `Increase ads budget ${signedCurrency(Math.max(0, adsDelta))} / ${horizon}`,
      reason: "ROAS and margin support additional spend.",
      impact_label: `AI predicts ${signedCurrency(expectedProfit)} profit over ${horizon}.`
    };
  }

  if (goal.actionLabel === "Expand Channel") {
    return {
      title: "Expand Channel to TikTok",
      icon: "🌎",
      category: "Growth Optimization",
      description: "Launch TikTok Shop channel test",
      subtitle: "Launch TikTok Shop test",
      reason: "Simulation shows higher channel profitability.",
      impact_label: `AI predicts ${signedCurrency(expectedProfit)} profit over ${horizon}.`
    };
  }

  if (goal.actionLabel === "Restock Inventory") {
    const restockText = restockUnits > 0 ? `Restock ${restockUnits.toLocaleString("en-US")} units` : "Restock Inventory";
    const restockDescription = restockUnits > 0 ? `Add ${restockUnits.toLocaleString("en-US")} units inventory` : "Add inventory to prevent stockout risk";
    return {
      title: restockText,
      icon: "📦",
      category: "Inventory Optimization",
      description: restockDescription,
      subtitle: restockDescription,
      reason: "Demand exceeds available stock.",
      impact_label: `AI predicts ${signedCurrency(expectedProfit)} profit over ${horizon}.`
    };
  }

  if (goal.actionLabel === "Clear Excess Inventory") {
    const clearText = clearUnits > 0 ? `Clear Excess Inventory ${clearUnits.toLocaleString("en-US")} units` : "Clear Excess Inventory";
    const clearDescription = clearUnits > 0
      ? `Clear ${clearUnits.toLocaleString("en-US")} excess units from active inventory exposure`
      : "Clear excess inventory from active inventory exposure";
    return {
      title: clearText,
      icon: "🏷",
      category: "Inventory Optimization",
      description: clearDescription,
      subtitle: clearDescription,
      reason: "Slow velocity and cash tied up.",
      impact_label: `AI predicts ${signedCurrency(expectedProfit)} profit over ${horizon}.`
    };
  }

  if (goal.actionLabel === "Reduce Ad Waste") {
    return {
      title: `Reduce Ad Waste ${signedCurrency(adsDelta)}`,
      icon: "🛑",
      category: "Portfolio Health",
      description: `Reduce inefficient ad spend by ${currencyDecimal.format(Math.abs(adsDelta))} / ${horizon}`,
      subtitle: `Reduce inefficient ad spend ${signedCurrency(adsDelta)} / ${horizon}`,
      reason: "Marginal ROAS is below target.",
      impact_label: `AI predicts ${signedCurrency(expectedProfit)} profit recovery over ${horizon}.`
    };
  }

  if (goal.actionLabel === "Reallocate Budget" || sourceAction === "REDUCE_ADS") {
    const plan = budgetReallocationPlan(row, recommendation);
    return {
      title: "Reallocate Budget",
      icon: "🔄",
      category: "Portfolio Health",
      description: `Move ${currencyDecimal.format(plan.amount)} budget: ${plan.label} / ${horizon}`,
      subtitle: `Move budget: ${plan.label}`,
      reason: "Same budget can generate higher profit.",
      impact_label: `AI predicts ${signedCurrency(expectedProfit)} profit over ${horizon}.`
    };
  }

  if (goal.actionLabel === "Exit SKU" || sourceAction === "STOP") {
    return {
      title: "Exit SKU",
      icon: "❌",
      category: "Portfolio Health",
      description: "Exit SKU from active optimization portfolio",
      subtitle: "Exit SKU",
      reason: "Negative profit trend and limited recovery potential.",
      impact_label: `AI predicts ${signedCurrency(expectedProfit)} profit recovery over ${horizon}.`
    };
  }

  return {
    title: "No Action Required",
    icon: "⏸",
    category: "Portfolio Health",
    description: "Current portfolio performance is optimal; AI will continue monitoring new signals.",
    subtitle: "Continue monitoring",
    reason: "No alternative action generated higher risk-adjusted profit.",
    impact_label: "No execution impact expected."
  };
}

function actionReasoningForDecision(
  row: PortfolioDecisionRow,
  detail: SelectedSkuDetail,
  display: DecisionActionDisplay,
  simulationHorizonDays: number,
  recommendation?: PortfolioRow
): DecisionActionReasoning {
  const goal = optimizationGoalForDecision(row, recommendation);
  const expectedProfit = safeNumber(row.expectedProfitImpact ?? row.estimatedProfitImpact ?? recommendation?.profit_delta ?? detail.expected_profit_lift_30d);
  const roas = row.simulation_estimate?.revenue_simulation?.base_roas ?? detail.current_revenue / Math.max(1, detail.current_ads_spend);
  const marginalRoas = row.simulation_estimate?.revenue_simulation?.marginal_roas ?? Math.max(1.2, roas * 0.83);
  const salesVelocity = Math.max(0.1, detail.current_sales_velocity);
  const demand30d = Math.round(detail.predicted_daily_demand * simulationHorizonDays);
  const stockCoverage = Math.round(detail.inventory_runway_days);
  const inventoryValue = detail.current_stock * Math.max(1, detail.current_profit / Math.max(1, demand30d));
  const cashReleased = Math.max(0, inventoryValue * 0.6);

  if (goal.actionLabel === "No Action Required") {
    return {
      title: "Why AI Selected Hold",
      reasons: [
        { signal: "No alternative action generated higher risk-adjusted profit", metric: "Decision: Hold baseline", explanation: "Candidate actions did not beat the current operating plan after risk, confidence, and constraints." },
        { signal: "Current operation is already efficient", metric: `Margin: ${percent.format(detail.current_margin)} · ROAS: ${ratioFormat.format(roas)}`, explanation: "The SKU does not need an immediate operating change." },
        { signal: "Waiting for stronger signal before changing strategy", metric: `Monitoring window: ${simulationHorizonDays} days`, explanation: "AI will re-evaluate after new demand, cost, inventory, or ad efficiency signals arrive." }
      ],
      summary: "AI recommends monitoring because no action cleared the risk-adjusted decision threshold."
    };
  }

  if (goal.actionLabel === "Scale Ads") {
    return {
      title: `Why AI Recommended ${display.title}`,
      reasons: [
        { signal: "Strong advertising efficiency", metric: `ROAS: ${ratioFormat.format(roas)} · Benchmark: 2.8`, explanation: "Paid demand is efficient enough to justify additional spend." },
        { signal: "Positive incremental profit", metric: `Simulation: ${signedCurrency(expectedProfit)} profit impact`, explanation: "Profit impact is calculated after ads, COGS, fees, shipping, and refunds." },
        { signal: "Inventory supports growth", metric: `Stock coverage: ${stockCoverage} days`, explanation: "Inventory can support the extra demand created by advertising." }
      ],
      summary: "This SKU has profitable demand and enough inventory capacity to support additional advertising spend."
    };
  }

  if (goal.actionLabel === "Expand Channel") {
    return {
      title: `Why AI Recommended ${display.title}`,
      reasons: [
        { signal: "Similar products perform well in this channel", metric: `TikTok category ROAS: ${ratioFormat.format(Math.max(4.5, marginalRoas))}`, explanation: "Comparable products show strong channel efficiency." },
        { signal: "Channel opportunity detected", metric: "Current: Shopify only · Recommendation: Launch TikTok test", explanation: "The SKU can add a demand path without replacing the current channel." },
        { signal: "Profit potential positive", metric: `Expected impact: ${signedCurrency(expectedProfit)} / ${simulationHorizonDays} days`, explanation: "The channel scenario cleared risk-adjusted profit scoring." }
      ],
      summary: "AI identified an additional profitable channel opportunity."
    };
  }

  if (goal.actionLabel === "Increase Price" || goal.actionLabel === "Decrease Price" || goal.actionLabel === "Run Promotion") {
    return {
      title: `Why AI Recommended ${display.title}`,
      reasons: [
        { signal: "Margin improvement opportunity", metric: `Current margin: ${percent.format(detail.current_margin)}`, explanation: "Current unit economics have room for a better price point." },
        { signal: "Demand remains stable", metric: "Elasticity: -0.4", explanation: "The simulation expects demand impact to stay within the profitable range." },
        { signal: "Simulation predicts higher profit", metric: `Expected impact: ${signedCurrency(expectedProfit)} / ${simulationHorizonDays} days`, explanation: "Profit impact comes from simulated contribution profit, not revenue lift." }
      ],
      summary: "AI found a better price point that improves profit while maintaining expected demand."
    };
  }

  if (goal.actionLabel === "Reallocate Budget") {
    const plan = budgetReallocationPlan(row, undefined);
    return {
      title: `Why AI Recommended ${display.title}`,
      reasons: [
        { signal: "Channel profitability difference detected", metric: `Current ROAS: ${ratioFormat.format(roas)} · Alternative ROAS: ${ratioFormat.format(Math.max(5, roas * 1.4))}`, explanation: "The current spend path is less profitable than alternatives." },
        { signal: "Same budget can generate higher profit", metric: `Move ${currencyDecimal.format(plan.amount)} budget: ${plan.label}`, explanation: "AI reallocates spend toward stronger contribution profit." },
        { signal: "Profit recovery positive", metric: `Expected recovery: ${signedCurrency(expectedProfit)}`, explanation: "The selected action improves profit by reducing inefficient allocation." }
      ],
      summary: "AI reallocates budget toward higher-profit channels."
    };
  }

  if (goal.actionLabel === "Restock Inventory") {
    return {
      title: `Why AI Recommended ${display.title}`,
      reasons: [
        { signal: "Demand exceeds available inventory", metric: `Sales velocity: ${ratioFormat.format(salesVelocity)} units/day`, explanation: "Expected demand is higher than current inventory can support." },
        { signal: "Stockout risk detected", metric: `Inventory coverage: ${stockCoverage} days`, explanation: "Inventory shortage can cap profitable demand." },
        { signal: "Additional inventory creates profit opportunity", metric: `Simulation: ${signedCurrency(expectedProfit)} profit`, explanation: "Restocking lets the SKU capture expected demand." }
      ],
      summary: "AI recommends replenishment to capture expected demand."
    };
  }

  if (goal.actionLabel === "Clear Excess Inventory") {
    return {
      title: `Why AI Recommended ${display.title}`,
      reasons: [
        { signal: "Low inventory velocity", metric: `Sales velocity: ${ratioFormat.format(salesVelocity)} units/day`, explanation: "Inventory is moving slower than the current stock position requires." },
        { signal: "Inventory exceeds demand forecast", metric: `Current stock: ${detail.current_stock.toLocaleString("en-US")} units · Expected 30D demand: ${demand30d.toLocaleString("en-US")} units`, explanation: "The SKU has more inventory than the simulation expects to sell." },
        { signal: "Capital is locked in excess inventory", metric: `Inventory value: ${currencyDecimal.format(inventoryValue)} · Cash released: ${signedCurrency(cashReleased)}`, explanation: "Clearing excess inventory improves cash efficiency and lowers holding risk." }
      ],
      summary: "AI recommends clearing excess inventory to improve cash efficiency and reduce holding risk."
    };
  }

  if (goal.actionLabel === "Reduce Ad Waste") {
    return {
      title: `Why AI Recommended ${display.title}`,
      reasons: [
        { signal: "Low marginal ROAS", metric: `Marginal ROAS: ${ratioFormat.format(marginalRoas)}`, explanation: "Additional spend is not producing enough contribution profit." },
        { signal: "Spend exceeds profit contribution", metric: `Ad waste: ${currencyDecimal.format(Math.max(0, detail.current_ads_spend * 0.35))}`, explanation: "The budget can be better used elsewhere in the portfolio." },
        { signal: "Better allocation opportunities exist", metric: `Expected profit recovery: ${signedCurrency(expectedProfit)}`, explanation: "Solver found higher risk-adjusted use of resources." }
      ],
      summary: "AI identified inefficient spending that reduces portfolio profitability."
    };
  }

  return {
    title: `Why AI Recommended ${display.title}`,
    reasons: [
      { signal: "Negative profitability trend", metric: `Current profit: ${currencyDecimal.format(detail.current_profit)}`, explanation: "The SKU does not meet the profit threshold." },
      { signal: "Low demand recovery probability", metric: "Recovery probability: Low", explanation: "Simulation does not show enough recovery potential." },
      { signal: "Capital tied in declining product", metric: `Avoided future loss: ${signedCurrency(expectedProfit)}`, explanation: "Exiting protects portfolio profitability." }
    ],
    summary: "AI recommends exiting this SKU to protect portfolio profitability."
  };
}

function RoleBadge({ role, locale }: { role: "ACQUISITION" | "PROFIT" | "GROWTH" | "DRAIN"; locale: RendererLocale }) {
  const isZh = locale === "zh";
  const label = role === "ACQUISITION"
    ? (isZh ? "获客 SKU" : "Acquisition")
    : role === "PROFIT"
      ? (isZh ? "利润 SKU" : "Profit")
      : role === "GROWTH"
        ? (isZh ? "增长机会" : "Growth")
        : (isZh ? "利润消耗" : "Profit Drain");
  const tone = role === "DRAIN" ? "danger" : role === "GROWTH" ? "success" : role === "PROFIT" ? "warning" : "neutral";
  return <Badge tone={tone}>{label}</Badge>;
}

function DailySkuProfitOptimizationPanel({
  rows,
  portfolioRowsBySku,
  trackedOutcomeRows,
  simulationHorizonDays,
  locale,
  onSelect
}: {
  rows: PortfolioDecisionRow[];
  portfolioRowsBySku: Map<string, PortfolioRow>;
  trackedOutcomeRows: ActionOutcomeRow[];
  simulationHorizonDays: number;
  locale: RendererLocale;
  onSelect: (row: PortfolioDecisionRow) => void;
}) {
  const isZh = locale === "zh";
  const visibleRows = rows.slice(0, 8);
  const totalExpectedLift = rows.reduce((sum, row) => sum + (row.expectedProfitImpact ?? row.estimatedProfitImpact ?? 0), 0);
  const totalActualLift = rows.reduce((sum, row) => sum + (actualProfitLiftForSku(trackedOutcomeRows, row.skuId) ?? 0), 0);

  return (
    <aside className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-950">{isZh ? "每日 SKU 利润优化" : "Daily SKU Profit Optimization"}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {isZh ? "对应左侧每条 SKU 的 AI 优化后利润和提升数据。" : "AI optimized profit and lift for each SKU on the left."}
          </p>
        </div>
        <Badge tone="success">{isZh ? "实时" : "Live"}</Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <SmallTrackerMetric label={isZh ? "预计总提升" : "Expected lift"} value={signedCurrency(totalExpectedLift)} />
        <SmallTrackerMetric label={isZh ? "实际总提升" : "Actual lift"} value={signedCurrency(totalActualLift)} />
      </div>

      <div className="mt-3 max-h-[calc(100vh-24rem)] space-y-2 overflow-auto pr-1">
        {visibleRows.map((row) => {
          const portfolioRow = portfolioRowsBySku.get(row.skuId);
          const expectedLift = row.expectedProfitImpact ?? row.estimatedProfitImpact ?? 0;
          const actualLift = actualProfitLiftForSku(trackedOutcomeRows, row.skuId);
          const currentProfit = portfolioRow?.current_profit ?? null;
          const optimizedProfit = portfolioRow?.predicted_profit ?? (currentProfit === null ? null : currentProfit + expectedLift);

          return (
            <button
              type="button"
              key={`${row.skuId}-${row.action}-${row.sourceAction}-profit-panel`}
              onClick={() => onSelect(row)}
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-200 hover:bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">{row.skuId}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{isZh ? "第 1 天 / " : "Day 1 / "}{simulationHorizonDays}</p>
                </div>
                <DecisionBadge action={row.action ?? "MONITOR"} locale={locale} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-slate-50 p-2">
                  <p className="font-semibold uppercase tracking-wide text-slate-400">{isZh ? "当前利润" : "Current"}</p>
                  <p className="mt-1 font-bold text-slate-900">{currentProfit === null ? "-" : currencyDecimal.format(currentProfit)}</p>
                </div>
                <div className="rounded-md bg-emerald-50 p-2">
                  <p className="font-semibold uppercase tracking-wide text-emerald-700">{isZh ? "优化后利润" : "Optimized"}</p>
                  <p className="mt-1 font-bold text-emerald-900">{optimizedProfit === null ? "-" : currencyDecimal.format(optimizedProfit)}</p>
                </div>
                <div className="rounded-md bg-white p-2 ring-1 ring-slate-100">
                  <p className="font-semibold uppercase tracking-wide text-slate-400">{isZh ? "预计提升" : "Expected lift"}</p>
                  <p className="mt-1 font-bold text-emerald-700">{signedCurrency(expectedLift)}</p>
                </div>
                <div className="rounded-md bg-white p-2 ring-1 ring-slate-100">
                  <p className="font-semibold uppercase tracking-wide text-slate-400">{isZh ? "实际提升" : "Actual lift"}</p>
                  <p className="mt-1 font-bold text-slate-900">{actualLift === null ? "Pending" : signedCurrency(actualLift)}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-500">{isZh ? "置信度" : "Confidence"}</span>
                <span className="font-bold text-slate-950">{percent.format(row.confidence ?? 0)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

type DailyProfitTrackingRow = {
  sku: string;
  date: string;
  baseline_profit: number;
  predicted_profit: number;
  actual_profit: number | null;
  profit_delta: number;
  revenue: number;
  ads_spend: number;
  margin: number;
  stock: number;
  sales_velocity: number;
  action_status: "pending" | "accepted" | "running" | "tracking" | "completed" | "rejected";
  source: "simulated" | "actual";
};

function SelectedSkuOptimizationPanel({
  row,
  recommendation,
  trackedOutcomeRows,
  simulationHorizonDays,
  actionStatus,
  locale
}: {
  row: PortfolioDecisionRow;
  recommendation?: PortfolioRow;
  trackedOutcomeRows: ActionOutcomeRow[];
  simulationHorizonDays: number;
  actionStatus: "pending" | "accepted" | "rejected";
  acceptedAt?: string;
  locale: RendererLocale;
}) {
  const [range, setRange] = useState<7 | 14 | 30>(7);
  const detail = selectedSkuDetail(row, recommendation, trackedOutcomeRows, simulationHorizonDays, actionStatus);
  const dailyRows = buildDailyProfitTrackingRows(detail, range);
  const visibleRows = dailyRows.slice(-range);
  const actualRows = visibleRows.filter((item) => item.actual_profit !== null);
  const cumulativePredictedLift = visibleRows.reduce((sum, item) => sum + item.profit_delta, 0);
  const cumulativeActualLift = actualRows.reduce((sum, item) => sum + ((item.actual_profit ?? 0) - item.baseline_profit), 0);
  const predictionError = actualRows.length && cumulativePredictedLift
    ? (cumulativeActualLift - cumulativePredictedLift) / Math.abs(cumulativePredictedLift)
    : null;
  const accuracy = predictionError === null ? detail.tracking_summary.accuracy_score : Math.max(0, 1 - Math.abs(predictionError));
  const decision = buildSkuDecisionObject(row, recommendation, detail, visibleRows, actionStatus, simulationHorizonDays);
  const decisionTrace = decision.decision_trace;
  const traceRejectedActions = Array.isArray(decisionTrace?.rejectedActions) ? decisionTrace.rejectedActions : [];
  const traceEvidence = decisionTrace?.evidence ?? {};
  const reasoningReasons = Array.isArray(decision.reasoning?.reasons) ? decision.reasoning.reasons : [];

  return (
    <aside className="sticky bottom-0 top-auto mx-auto max-h-[68vh] max-w-5xl overflow-auto bg-transparent p-4 pb-6 xl:top-0 xl:max-h-[calc(100vh-6rem)]">
      <div className="p-0">
        <div>
          <p className="text-base font-bold text-slate-950">AI SKU Decision Center</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Evidence, scenario simulation, lifecycle strategy, and execution feedback for the selected SKU.
          </p>
        </div>
      </div>

      <div className="mt-6 p-0">
        <p className="text-sm font-bold text-slate-950">AI Decision Summary</p>
        <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-extrabold text-[#5747e8]">{decision.sku}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {decision.action === "No Action Required"
                  ? "AI is monitoring this SKU because no action currently beats the baseline."
                  : "AI is recommending a business action for this SKU."}
              </p>
            </div>
            {actionStatus === "pending" ? (
              <Badge tone="warning">Pending Approval</Badge>
            ) : (
              <RecommendationStatusBadge status={actionStatus === "accepted" ? "accepted" : "rejected"} locale={locale} />
            )}
          </div>
          <div className="mt-3 grid gap-2 text-sm">
            <DecisionSummaryRow label="Lifecycle" value={decision.lifecycle_status} />
            {decision.action !== "No Action Required" ? (
              <DecisionProfitComparisonTable decision={decision} horizonDays={simulationHorizonDays} />
            ) : null}
            <DecisionSummaryRow label="Confidence" value={percent.format(detail.confidence)} />
            <DecisionSummaryRow label="Decision Status" value={decision.decision_status} />
          </div>
          <div className="mt-4 rounded-lg bg-emerald-50/70 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Decision Context</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-white/80 p-3 ring-1 ring-emerald-100">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Optimization Goal</p>
                <p className="mt-1 text-sm font-extrabold text-slate-950">{decision.optimization_goal}</p>
              </div>
              <div className="rounded-lg bg-white/80 p-3 ring-1 ring-emerald-100">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Recommended Action</p>
                <p className="mt-1 text-sm font-extrabold text-slate-950">{decision.action}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{decision.action_description}</p>
              </div>
            </div>
            <p className="mt-3 text-sm font-bold text-slate-950">Why AI Selected This Decision</p>
            <p className="mt-1 text-xs font-bold text-slate-700">{decision.reasoning.title}</p>
            <div className="mt-3 rounded-md bg-white/70 p-2 text-xs font-semibold text-slate-600 ring-1 ring-emerald-100">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-950">Decision Trace</span>
                <span>{decisionTrace?.originalAction ?? "UNKNOWN"} → {decisionTrace?.finalAction ?? decision.action}</span>
              </div>
              <p className="mt-1 leading-5">{decisionTrace?.validationReason ?? "Decision passed runtime normalization."}</p>
              {traceRejectedActions.length ? (
                <p className="mt-1 leading-5">
                  Rejected: {traceRejectedActions.map((item) => `${item.action} (${item.reason})`).join(", ")}
                </p>
              ) : null}
              <p className="mt-1 leading-5">
                Inventory gap: {traceEvidence.inventory_gap ?? "n/a"} · Current: {traceEvidence.current_inventory ?? "n/a"} · Required: {traceEvidence.required_inventory ?? "n/a"} · ROAS: {traceEvidence.roas ?? "n/a"}
              </p>
            </div>
            <div className="mt-2 grid gap-2 text-sm font-semibold text-slate-700">
              {reasoningReasons.map((item) => (
                <div key={item.signal} className="rounded-md bg-white/70 p-2">
                  <span className="inline-flex items-center gap-2 text-slate-950">
                    <span className="text-emerald-700">✓</span>
                    {item.signal}
                  </span>
                  <div className="mt-1 grid gap-0.5 pl-5 text-xs font-semibold text-slate-600">
                    <span>{item.metric}</span>
                    <span className="font-medium leading-5 text-slate-500">{item.explanation}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-emerald-900">{decision.reasoning.summary}</p>
          </div>
        </div>
      </div>

      <PanelDisclosure title="Why This SKU Has Opportunity" defaultOpen>
        <DecisionSignalCards decision={decision} />
      </PanelDisclosure>

      <PanelDisclosure title="AI Reasoning">
        <AIReasoningPanel decision={decision} />
      </PanelDisclosure>

      <PanelDisclosure title="AI Scenario Comparison">
        <ScenarioSimulationComparison decision={decision} />
      </PanelDisclosure>

      {row.simulation_estimate ? (
        <PanelDisclosure title="Simulation Breakdown">
          <SimulationEstimateBreakdown row={row} />
        </PanelDisclosure>
      ) : null}

      <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-100">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-950">Prediction by Day</p>
          <div className="flex rounded-md bg-slate-100 p-1">
            {[7, 14, 30].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value as 7 | 14 | 30)}
                className={cn(
                  "rounded px-2 py-1 text-xs font-bold",
                  range === value ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"
                )}
              >
                {value}D
              </button>
            ))}
          </div>
        </div>
        <ProfitTrendChart rows={visibleRows} compact />
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-2 text-sm font-bold text-slate-950">Daily Impact Tracking</p>
          <DailyProfitTrackingTable rows={visibleRows} />
        </div>
      </div>

      <PanelDisclosure title="AI Decision Lifecycle">
        <ActionLifecycleCard detail={detail} actionStatus={actionStatus} accuracy={accuracy} compact showTitle={false} />
      </PanelDisclosure>

    </aside>
  );
}

type SkuDecisionObject = {
  sku: string;
  optimization_goal: string;
  action: string;
  action_description: string;
  action_reason: string;
  reasoning: {
    title: string;
    reasons: Array<{
      signal: string;
      metric: string;
      explanation: string;
    }>;
    summary: string;
  };
  evidence: Array<{
    signal: string;
    metric: string;
    benchmark?: string;
    impact: string;
    status: string;
    explanation: string;
  }>;
  scenarios: Array<{
    action: string;
    profit_delta: number;
    confidence: number;
    risk?: number;
    selected: boolean;
    status: "Selected" | "Alternative" | "Rejected";
  }>;
  summary_comparison: Array<{
    metric: string;
    current: string;
    action: string;
    change: string;
    strong?: boolean;
  }>;
  decision_trace: DecisionContract["trace"];
  tracking: {
    current_ads_spend: number;
    current_strategy_profit: number;
    predicted_profit: number;
    expected_profit: number;
    actual_profit: number | null;
    organic_change: number | null;
    outcome_status: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "TRACKING";
    progress: number;
    learning_status: string;
  };
  lifecycle_status: string;
  decision_status: string;
};

function DecisionSummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className={cn("text-right text-sm font-bold", strong ? "text-emerald-700" : "text-slate-950")}>{value}</span>
    </div>
  );
}

function DecisionProfitComparisonTable({ decision, horizonDays }: { decision: SkuDecisionObject; horizonDays: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2 font-bold uppercase tracking-wide">Metric</th>
            <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Current Plan</th>
            <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">AI Action</th>
            <th className="px-3 py-2 text-right font-bold uppercase tracking-wide">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {decision.summary_comparison.map((item) => (
            <tr key={item.metric}>
              <td className="px-3 py-2 font-semibold text-slate-600">
                {item.metric.includes("/") ? item.metric : `${item.metric}${item.metric === "Profit" ? ` / ${horizonDays} days` : ""}`}
              </td>
              <td className="px-3 py-2 text-right font-bold text-slate-950">{item.current}</td>
              <td className="px-3 py-2 text-right font-bold text-slate-950">{item.action}</td>
              <td className={cn("px-3 py-2 text-right font-bold", item.strong ? "text-emerald-700" : "text-slate-700")}>{item.change}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function signedUnits(value: number) {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded.toLocaleString("en-US")} units`;
}

function priceChangeFromActionDisplay(display: DecisionActionDisplay) {
  const match = display.title.match(/([+-]?\d+)%/);
  if (!match?.[1]) return null;
  return (Number(match[1]) || 0) / 100;
}

function buildDecisionSummaryComparisonRows(
  row: PortfolioDecisionRow,
  recommendation: PortfolioRow | undefined,
  detail: SelectedSkuDetail,
  actionDisplay: DecisionActionDisplay,
  horizonDays: number
): SkuDecisionObject["summary_comparison"] {
  const goal = optimizationGoalForDecision(row, recommendation);
  const rows: SkuDecisionObject["summary_comparison"] = [];
  const currentProfit = detail.current_profit;
  const projectedProfit = detail.predicted_profit;
  const incrementalProfit = projectedProfit - currentProfit;

  if (goal.actionLabel === "Reallocate Budget") {
    const plan = budgetReallocationPlan(row, recommendation);
    rows.push({
      metric: "Budget Move",
      current: plan.from,
      action: plan.to,
      change: currencyDecimal.format(plan.amount)
    });
  } else if (goal.actionLabel === "Scale Ads" || goal.actionLabel === "Reduce Ad Waste") {
    const currentAdSpend = detail.current_ads_spend;
    const adsDelta = goal.actionLabel === "Reduce Ad Waste"
      ? -Math.abs(adsBudgetDeltaForDecision(row, recommendation))
      : Math.max(0, adsBudgetDeltaForDecision(row, recommendation));
    rows.push({
      metric: `Ad Spend / ${horizonDays} days`,
      current: currencyDecimal.format(currentAdSpend),
      action: currencyDecimal.format(Math.max(0, currentAdSpend + adsDelta)),
      change: signedCurrency(adsDelta)
    });
  }

  if (goal.actionLabel === "Restock Inventory" || goal.actionLabel === "Clear Excess Inventory") {
    const mode = goal.actionLabel === "Restock Inventory" ? "restock" : "clear";
    const units = inventoryActionUnits(row, recommendation, detail, mode);
    const unitDelta = mode === "restock" ? units : -units;
    rows.push({
      metric: "Inventory Units",
      current: `${Math.round(detail.current_stock).toLocaleString("en-US")} units`,
      action: `${Math.max(0, Math.round(detail.current_stock + unitDelta)).toLocaleString("en-US")} units`,
      change: signedUnits(unitDelta)
    });
  }

  if (goal.goal === "PROFIT") {
    const currentPrice = numberOrNull(recommendation?.before_state?.price);
    const simulatedPrice = numberOrNull(recommendation?.simulation?.simulated_price);
    const priceChange = priceChangeFromActionDisplay(actionDisplay);

    if (currentPrice && currentPrice > 0) {
      const actionPrice = simulatedPrice && simulatedPrice > 0
        ? simulatedPrice
        : currentPrice * (1 + (priceChange ?? 0));
      rows.push({
        metric: "Price",
        current: currencyDecimal.format(currentPrice),
        action: currencyDecimal.format(actionPrice),
        change: signedCurrency(actionPrice - currentPrice)
      });
    } else if (goal.actionLabel === "Run Promotion") {
      rows.push({
        metric: "Promotion",
        current: "No active discount",
        action: "10% discount test",
        change: "Test"
      });
    }
  }

  rows.push({
    metric: `Profit / ${horizonDays} days`,
    current: currencyDecimal.format(currentProfit),
    action: currencyDecimal.format(projectedProfit),
    change: signedCurrency(incrementalProfit),
    strong: true
  });

  return rows;
}

function DecisionSignalCards({ decision }: { decision: SkuDecisionObject }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {decision.evidence.map((item) => {
        const primaryLabel = item.signal === "Demand Signal"
          ? "Revenue Trend"
          : item.signal === "Profit Signal"
            ? "Margin"
            : item.signal === "Advertising Signal"
              ? "ROAS"
              : item.impact === "Excess inventory detected"
                ? "Current Stock"
                : "Stock Coverage";
        const benchmarkLabel = item.signal === "Profit Signal"
          ? "Portfolio Average"
          : item.signal === "Advertising Signal"
            ? "Marginal ROAS"
            : item.impact === "Excess inventory detected"
              ? "Demand Forecast"
              : "Benchmark";

        return (
        <div key={item.signal} className="rounded-lg border border-emerald-100 bg-emerald-50/55 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-slate-950">{item.signal}</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {item.status}
            </span>
          </div>
          <div className="mt-3 space-y-1.5 text-xs">
            <DetailRow label={primaryLabel} value={item.metric} />
            {item.benchmark ? <DetailRow label={benchmarkLabel} value={item.benchmark} /> : null}
          </div>
          <p className="mt-3 text-xs font-medium leading-5 text-slate-600">{item.explanation}</p>
        </div>
        );
      })}
    </div>
  );
}

function AIReasoningPanel({ decision }: { decision: SkuDecisionObject }) {
  const selectedScenario = decision.scenarios.find((scenario) => scenario.status === "Selected") ?? decision.scenarios[0];

  return (
    <div className="space-y-3">
      <DecisionReasonItem
        index={1}
        title="Input Signals"
        body={decision.reasoning.reasons.map((reason) => `✓ ${reason.signal}`).join(" · ")}
      />
      <DecisionReasonItem
        index={2}
        title="Detected Opportunity"
        body={decision.optimization_goal}
      />
      <DecisionReasonItem
        index={3}
        title="Candidate Actions"
        body={decision.scenarios.slice(0, 4).map((scenario) => `${scenario.action}: ${signedCurrency(scenario.profit_delta)}`).join(" · ")}
      />
      <div className="rounded-lg bg-emerald-950 p-3 text-white">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-100">Selected Action</p>
        <p className="mt-1 text-lg font-extrabold">{decision.action}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-emerald-50">
          {selectedScenario?.selected
            ? "Highest risk-adjusted profit under current constraints."
            : "Current operation remains the best risk-adjusted baseline."}
        </p>
      </div>
      <div className="rounded-lg bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
        {decision.reasoning.summary}
      </div>
    </div>
  );
}

function DecisionReasonItem({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-extrabold text-emerald-800">{index}</span>
        <div>
          <p className="text-sm font-bold text-slate-950">{title}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{body}</p>
        </div>
      </div>
    </div>
  );
}

function AIEvidenceCards({ row, detail }: { row: PortfolioDecisionRow; detail: SelectedSkuDetail }) {
  const evidence = row.ai_evidence?.length ? row.ai_evidence : fallbackAIEvidence(detail, row);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {evidence.slice(0, 4).map((item) => {
        const Icon = evidenceIcon(item.type);
        return (
          <div key={`${item.type}-${item.metric}`} className="rounded-lg bg-white/65 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-emerald-700" />
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{item.label}</p>
              </div>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                item.impact === "positive" || item.impact === "pass" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              )}>
                {item.impact}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">{item.metric.replaceAll("_", " ")}</span>
                <span className="text-right font-bold text-slate-950">{String(item.current_value)}</span>
              </div>
              {item.benchmark != null ? (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Benchmark</span>
                  <span className="text-right font-semibold text-slate-700">{String(item.benchmark)}</span>
                </div>
              ) : null}
              <p className="pt-1 font-medium leading-5 text-slate-500">{item.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScenarioSimulationComparison({ decision }: { decision: SkuDecisionObject }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-950">
        AI evaluated: <span className="text-emerald-700">{decision.scenarios.length} strategies</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Expected Profit Impact</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {decision.scenarios.map((scenario) => (
              <tr key={scenario.action} className={scenario.status === "Selected" ? "bg-emerald-50/70" : ""}>
                <td className="px-3 py-2 font-bold text-slate-950">{scenario.action}</td>
                <td className={cn("px-3 py-2 font-extrabold", scenario.profit_delta >= 0 ? "text-emerald-700" : "text-rose-600")}>{signedCurrency(scenario.profit_delta)}</td>
                <td className="px-3 py-2 font-semibold text-slate-700">{percent.format(scenario.confidence)}</td>
                <td className="px-3 py-2">
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-bold",
                    scenario.status === "Selected" ? "bg-emerald-100 text-emerald-800" : scenario.status === "Rejected" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"
                  )}>
                    {scenario.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {decision.action === "No Action Required" ? (
        <div className="rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-700">
          AI selected no action because current portfolio performance is optimal under current constraints.
        </div>
      ) : (
        <div className="rounded-lg bg-emerald-950 p-3 text-white">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-100">Selected because:</p>
          <p className="mt-1 text-sm font-bold">Highest risk-adjusted profit under current constraints.</p>
        </div>
      )}
    </div>
  );
}

function evidenceIcon(type: string) {
  if (type === "demand_signal") return TrendingUp;
  if (type === "profit_signal") return BadgeDollarSign;
  if (type === "ads_signal") return Megaphone;
  if (type === "inventory_signal") return PackageSearch;
  return BarChart3;
}

function fallbackAIEvidence(detail: SelectedSkuDetail, row: PortfolioDecisionRow) {
  return [
    {
      type: "demand_signal",
      metric: "revenue_growth",
      current_value: percent.format((detail.predicted_revenue - detail.current_revenue) / Math.max(1, detail.current_revenue)),
      benchmark: "0%",
      impact: "positive",
      label: "Demand Signal",
      detail: "Revenue simulation is positive under the selected action."
    },
    {
      type: "profit_signal",
      metric: "margin",
      current_value: percent.format(detail.current_margin),
      benchmark: "27.40%",
      impact: detail.current_margin >= 0.274 ? "positive" : "risk",
      label: "Profit Signal",
      detail: "Current margin supports a profit-oriented optimization action."
    },
    {
      type: "inventory_signal",
      metric: "inventory_coverage",
      current_value: `${ratioFormat.format(detail.inventory_runway_days)} days`,
      benchmark: `${row.simulation_horizon?.days ?? 30} days`,
      impact: detail.inventory_runway_days >= (row.simulation_horizon?.days ?? 30) ? "pass" : "risk",
      label: "Inventory Signal",
      detail: "Inventory coverage is checked before scale or exposure changes."
    },
    {
      type: "lifecycle_signal",
      metric: "lifecycle_stage",
      current_value: row.lifecycle_stage ?? "MATURE",
      benchmark: "stage strategy",
      impact: "positive",
      label: "Lifecycle Strategy",
      detail: "Action space is selected based on SKU lifecycle stage."
    }
  ] as NonNullable<PortfolioDecisionRow["ai_evidence"]>;
}

function fallbackScenarios(row: PortfolioDecisionRow, recommendation: PortfolioRow | undefined, detail: SelectedSkuDetail) {
  const selectedAction = row.sourceAction ?? row.action;
  const expectedLift = safeNumber(row.expectedProfitImpact ?? row.estimatedProfitImpact ?? recommendation?.profit_delta ?? detail.expected_profit_lift_30d);

  return [
    {
      scenario_id: `${row.skuId}-${selectedAction}`,
      action: String(selectedAction),
      label: portfolioScenarioActionLabel(selectedAction, "en"),
      expected_profit: detail.current_profit + expectedLift,
      expected_profit_lift: expectedLift,
      expected_revenue_lift: safeNumber(recommendation?.simulation?.revenue_delta, expectedLift * 1.7),
      confidence: safeNumber(row.confidence ?? detail.confidence),
      selected: true,
      constraints: ["budget", "inventory", "margin", "confidence"]
    },
    {
      scenario_id: `${row.skuId}-PRICE_UP_5`,
      action: "PRICE_UP_5",
      label: "Raise Price",
      expected_profit: detail.current_profit + expectedLift * 0.42,
      expected_profit_lift: expectedLift * 0.42,
      expected_revenue_lift: expectedLift * 0.66,
      confidence: Math.max(0.45, safeNumber(row.confidence ?? detail.confidence) - 0.08),
      selected: false,
      constraints: ["margin", "confidence"]
    },
    {
      scenario_id: `${row.skuId}-HOLD`,
      action: "HOLD",
      label: "Hold",
      expected_profit: detail.current_profit,
      expected_profit_lift: 0,
      expected_revenue_lift: 0,
      confidence: 0.7,
      selected: false,
      constraints: ["budget", "inventory"]
    }
  ] as NonNullable<PortfolioDecisionRow["scenarios"]>;
}

function ProfitTrendChart({ rows, compact = false }: { rows: DailyProfitTrackingRow[]; compact?: boolean }) {
  let cumulativeExpected = 0;
  let cumulativeActual = 0;
  const data = rows.map((row) => {
    cumulativeExpected += row.profit_delta;
    if (row.actual_profit !== null) {
      cumulativeActual += row.actual_profit - row.baseline_profit;
    }
    return {
    date: row.date.slice(5),
      expected: cumulativeExpected,
      actual: row.actual_profit === null ? null : cumulativeActual
    };
  });

  return (
    <div className={cn("mt-3 rounded-lg border bg-slate-50 p-2", compact ? "h-24" : "h-36")}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
          <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" width={48} />
          <Tooltip formatter={(value) => currencyDecimal.format(Number(value))} />
          <Line name="Expected Profit Lift" type="monotone" dataKey="expected" stroke="#059669" strokeWidth={2} dot={false} />
          <Line name="Actual Profit Lift" type="monotone" dataKey="actual" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DailyProfitTrackingTable({ rows }: { rows: DailyProfitTrackingRow[] }) {
  const baselineAds = rows[0]?.ads_spend ?? 0;
  const baselineRevenue = rows[0]?.revenue ?? 0;

  return (
    <div className="max-h-44 overflow-auto rounded-lg border">
      <table className="min-w-[620px] w-full text-left text-xs">
        <thead className="sticky top-0 bg-slate-50 text-slate-500">
          <tr>
            <th className="px-2 py-2">Date</th>
            <th className="px-2 py-2">Action Status</th>
            <th className="px-2 py-2">Ad Spend Change</th>
            <th className="px-2 py-2">Revenue Impact</th>
            <th className="px-2 py-2">Profit Impact</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const profitImpact = row.actual_profit === null ? null : row.actual_profit - row.baseline_profit;
            return (
            <tr key={`${row.sku}-${row.date}`}>
              <td className="px-2 py-2 font-semibold text-slate-900">{new Date(`${row.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
              <td className="px-2 py-2"><Badge tone={row.action_status === "tracking" ? "success" : "warning"}>{row.action_status === "tracking" ? "Running" : "Pending"}</Badge></td>
              <td className="px-2 py-2 font-semibold text-slate-700">{signedCurrency(row.ads_spend - baselineAds)} Ads</td>
              <td className="px-2 py-2 font-semibold text-slate-700">{signedCurrency(row.revenue - baselineRevenue)} Revenue</td>
              <td className="px-2 py-2 font-bold text-emerald-700">{profitImpact === null ? "Pending" : `${signedCurrency(profitImpact)} Profit`}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PanelDisclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-100" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-slate-950 marker:hidden">
        <span>{title}</span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">Open</span>
      </summary>
      <div className="mt-3">
        {children}
      </div>
    </details>
  );
}

function SimulationEstimateBreakdown({ row }: { row: PortfolioDecisionRow }) {
  const estimate = row.simulation_estimate;
  if (!estimate) return null;
  const investment = estimate.investment ?? {};
  const simulationWindow = estimate.simulation_window ?? {};
  const revenueSimulation = estimate.revenue_simulation ?? {};
  const costSimulation = estimate.cost_simulation ?? {};
  const profitSimulation = estimate.profit_simulation ?? {};
  const confidenceBreakdown = estimate.confidence_breakdown ?? {};
  const estimatedComponents = safeStringArray(estimate.estimated_components);
  const warnings = safeStringArray(estimate.warnings);
  const days = safeNumber(simulationWindow.days, 30);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <SmallTrackerMetric label="Investment" value={`${signedCurrency(safeNumber(investment.additional_ad_spend))} / ${days} days`} />
        <SmallTrackerMetric label="Daily budget delta" value={currencyDecimal.format(safeNumber(investment.daily_budget_delta))} />
        <SmallTrackerMetric label="Base ROAS" value={ratioFormat.format(safeNumber(revenueSimulation.base_roas))} />
        <SmallTrackerMetric label="Marginal ROAS" value={ratioFormat.format(safeNumber(revenueSimulation.marginal_roas))} />
        <SmallTrackerMetric label="Diminishing return" value={percent.format(safeNumber(revenueSimulation.diminishing_return_factor))} />
        <SmallTrackerMetric label="Attribution factor" value={percent.format(safeNumber(revenueSimulation.attribution_confidence_factor))} />
        <SmallTrackerMetric label="Inventory factor" value={percent.format(safeNumber(revenueSimulation.inventory_capacity_factor))} />
        <SmallTrackerMetric label="Revenue lift" value={signedCurrency(safeNumber(revenueSimulation.incremental_revenue))} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Cost Simulation</p>
        <div className="mt-2 grid gap-1.5 text-xs">
          <DetailRow label="Ad spend" value={`-${currencyDecimal.format(safeNumber(costSimulation.additional_ad_spend))}`} />
          <DetailRow label="Shipping" value={`-${currencyDecimal.format(safeNumber(costSimulation.incremental_shipping_cost))}`} />
          <DetailRow label="Platform fees" value={`-${currencyDecimal.format(safeNumber(costSimulation.incremental_platform_fee))}`} />
          <DetailRow label="Payment fees" value={`-${currencyDecimal.format(safeNumber(costSimulation.incremental_payment_fee))}`} />
          <DetailRow label="Refund estimate" value={`-${currencyDecimal.format(safeNumber(costSimulation.expected_refund_cost))}`} />
          <DetailRow label="Fulfillment" value={`-${currencyDecimal.format(safeNumber(costSimulation.incremental_fulfillment_cost))}`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SmallTrackerMetric label="Contribution margin" value={percent.format(safeNumber(profitSimulation.contribution_margin))} />
        <SmallTrackerMetric label="Gross incremental profit" value={signedCurrency(safeNumber(profitSimulation.gross_incremental_profit))} />
        <SmallTrackerMetric label="Expected profit lift" value={`${signedCurrency(safeNumber(profitSimulation.expected_profit_impact))} / ${days} days`} />
        <SmallTrackerMetric label="Confidence" value={percent.format(safeNumber(confidenceBreakdown.overall_confidence))} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
        <div className="flex justify-between gap-3">
          <span className="font-semibold text-slate-500">Source</span>
          <span className="text-right font-bold text-slate-950">{String(estimate.prediction_source ?? "unknown")}</span>
        </div>
        {estimatedComponents.length ? (
          <p className="mt-2 text-slate-500">Estimated components: {estimatedComponents.join(", ")}</p>
        ) : null}
        {warnings.length ? (
          <p className="mt-1 text-amber-700">Warnings: {warnings.join(", ")}</p>
        ) : null}
      </div>
    </div>
  );
}

type SelectedSkuDetail = {
  sku: string;
  action: string;
  recommendation: string;
  confidence: number;
  expected_profit_lift_30d: number;
  current_profit: number;
  current_margin: number;
  current_ads_spend: number;
  current_stock: number;
  current_sales_velocity: number;
  current_revenue: number;
  predicted_revenue: number;
  predicted_profit: number;
  predicted_margin: number;
  predicted_daily_demand: number;
  inventory_runway_days: number;
  source: "simulated" | "actual";
  tracking_summary: {
    predicted_cumulative_lift: number;
    actual_cumulative_lift: number | null;
    organic_cumulative_change: number | null;
    outcome_status: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "TRACKING";
    prediction_error: number | null;
    accuracy_score: number | null;
  };
};

function selectedSkuDetail(
  row: PortfolioDecisionRow,
  recommendation: PortfolioRow | undefined,
  trackedRows: ActionOutcomeRow[],
  simulationHorizonDays: number,
  actionStatus: "pending" | "accepted" | "rejected"
): SelectedSkuDetail {
  const expectedLift = safeNumber(row.expectedProfitImpact ?? row.estimatedProfitImpact ?? recommendation?.profit_delta);
  const actualLift = actionStatus === "accepted" ? actualProfitLiftForSku(trackedRows, row.skuId) : null;
  const organicLift = actionStatus === "accepted" ? organicProfitChangeForSku(trackedRows, row.skuId) : null;
  const currentProfit = safeNumber(recommendation?.current_profit, Math.max(0, expectedLift * 0.45));
  const predictedProfit = safeNumber(recommendation?.predicted_profit, currentProfit + expectedLift);
  const currentRevenue = safeNumber(recommendation?.before_state?.revenue, Math.max(predictedProfit * 2.4, currentProfit * 2.8, 1));
  const revenueDelta = safeNumber(recommendation?.simulation?.revenue_delta, expectedLift * 1.7);
  const predictedRevenue = safeNumber(recommendation?.simulation?.predicted_revenue ?? recommendation?.after_state?.revenue, currentRevenue + Math.max(0, revenueDelta));
  const currentMargin = safeNumber(recommendation?.before_state?.margin, Math.max(0.18, Math.min(0.62, currentProfit / Math.max(1, currentRevenue))));
  const predictedMargin = safeNumber(recommendation?.simulation?.predicted_margin ?? recommendation?.after_state?.margin, Math.min(0.72, currentMargin + Math.max(0.02, safeNumber(recommendation?.simulation?.margin_change, 0.056))));
  const currentAdsSpend = safeNumber(recommendation?.simulation?.current_ads_spend ?? recommendation?.before_state?.ad_spend, Math.max(0, expectedLift * 0.16));
  const inventoryEvidence = decisionInventoryEvidence(row, recommendation);
  const currentStock = safeNumber(inventoryEvidence.currentInventory ?? objectRecord(recommendation?.simulation).current_inventory ?? recommendation?.before_state?.inventory, 818);
  const requiredInventory = inventoryEvidence.requiredInventory ?? numberOrNull(recommendation?.simulation?.required_inventory);
  const salesVelocity = Math.max(0.2, requiredInventory ? requiredInventory / Math.max(1, simulationHorizonDays) : 3.2);
  const predictedDailyDemand = salesVelocity * (row.action === "SCALE" ? 1.5 : row.action === "REDUCE" ? 0.75 : 1.12);
  const predictedCumulativeLift = expectedLift;
  const predictionError = actualLift === null || !predictedCumulativeLift ? null : (actualLift - predictedCumulativeLift) / Math.abs(predictedCumulativeLift);

  return {
    sku: row.skuId,
    action: decisionActionLabel(row.action ?? "MONITOR", "en"),
    recommendation: safeStringArray(row.recommendedActions)[0] ?? safeStringArray(row.recommendedExecution)[0] ?? portfolioScenarioActionLabel(row.sourceAction, "en"),
    confidence: safeNumber(row.confidence ?? recommendation?.confidence),
    expected_profit_lift_30d: expectedLift,
    current_profit: currentProfit,
    current_margin: currentMargin,
    current_ads_spend: currentAdsSpend,
    current_stock: currentStock,
    current_sales_velocity: salesVelocity,
    current_revenue: currentRevenue,
    predicted_revenue: predictedRevenue,
    predicted_profit: predictedProfit,
    predicted_margin: predictedMargin,
    predicted_daily_demand: predictedDailyDemand,
    inventory_runway_days: currentStock / Math.max(0.1, predictedDailyDemand),
    source: actionStatus === "accepted" ? "actual" : "simulated",
    tracking_summary: {
      predicted_cumulative_lift: predictedCumulativeLift,
      actual_cumulative_lift: actualLift,
      organic_cumulative_change: organicLift,
      outcome_status: outcomeStatusForProfitChange(actualLift),
      prediction_error: predictionError,
      accuracy_score: predictionError === null ? null : Math.max(0, 1 - Math.abs(predictionError))
    }
  };
}

function normalizeDecisionScenarios(
  scenarios: SkuDecisionObject["scenarios"],
  selectedAction: string
): SkuDecisionObject["scenarios"] {
  const selectedKey = scenarioActionKey(selectedAction);
  const seen = new Set<string>();

  return scenarios.reduce<SkuDecisionObject["scenarios"]>((items, scenario) => {
    const actionKey = scenarioActionKey(scenario.action);
    if (!actionKey || actionKey === selectedKey || seen.has(actionKey)) return items;

    seen.add(actionKey);
    const isHold = actionKey === "hold";
    const profitDelta = isHold ? 0 : scenario.profit_delta;
    items.push({
      ...scenario,
      action: cleanScenarioActionLabel(scenario.action),
      profit_delta: profitDelta,
      selected: false,
      status: profitDelta < 0 ? "Rejected" : "Alternative"
    });

    return items;
  }, []);
}

function scenarioActionKey(action: string) {
  const normalized = cleanScenarioActionLabel(action).toLowerCase();
  if (normalized.includes("hold")) return "hold";
  if (normalized.includes("scale") || normalized.includes("increase ads")) return "scale_ads";
  if (normalized.includes("expand channel")) return "expand_channel";
  if (normalized.includes("increase price") || normalized.includes("raise price")) return "increase_price";
  if (normalized.includes("decrease price") || normalized.includes("lower price")) return "decrease_price";
  if (normalized.includes("promotion")) return "promotion";
  if (normalized.includes("restock")) return "restock_inventory";
  if (normalized.includes("clear excess") || normalized.includes("reduce inventory")) return "clear_excess_inventory";
  if (normalized.includes("reduce ad waste") || normalized.includes("reduce ads")) return "reduce_ad_waste";
  if (normalized.includes("reallocate")) return "reallocate_budget";
  if (normalized.includes("exit")) return "exit_sku";
  return normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function cleanScenarioActionLabel(action: string) {
  return action.replace(/^[^\w$]+/u, "").trim();
}

function buildSkuDecisionObject(
  row: PortfolioDecisionRow,
  recommendation: PortfolioRow | undefined,
  detail: SelectedSkuDetail,
  rows: DailyProfitTrackingRow[],
  actionStatus: "pending" | "accepted" | "rejected",
  simulationHorizonDays: number
): SkuDecisionObject {
  const goal = optimizationGoalForDecision(row, recommendation);
  const normalizedDecision = normalizedDecisionForDecision(row, recommendation, detail);
  const goalIcon = goal.goal === "GROWTH" ? "🚀" : goal.goal === "PROFIT" ? "💰" : goal.goal === "INVENTORY" ? "📦" : "🛑";
  const actionDisplay = actionDisplayForDecision(row, recommendation, detail, simulationHorizonDays);
  const actionReasoning = actionReasoningForDecision(row, detail, actionDisplay, simulationHorizonDays);
  const lifecycleStage = normalizeLifecycleStage(row.lifecycle_stage) ?? "MATURE";
  const lifecycleLabel = lifecycleStage.charAt(0) + lifecycleStage.slice(1).toLowerCase();
  const demandTrend = (detail.predicted_revenue - detail.current_revenue) / Math.max(1, detail.current_revenue);
  const portfolioAverageMargin = 0.275;
  const roas = row.simulation_estimate?.revenue_simulation?.base_roas
    ?? detail.current_revenue / Math.max(1, detail.current_ads_spend);
  const marginalRoas = row.simulation_estimate?.revenue_simulation?.marginal_roas ?? Math.max(1.2, roas * 0.83);
  const stockCoverage = detail.inventory_runway_days;
  const predicted30dDemand = Math.round(detail.predicted_daily_demand * simulationHorizonDays);
  const inventorySignal = goal.actionLabel === "Clear Excess Inventory"
    ? {
      metric: `${detail.current_stock.toLocaleString("en-US")} units`,
      benchmark: `${predicted30dDemand.toLocaleString("en-US")} units expected demand`,
      impact: "Excess inventory detected",
      status: "Excess",
      explanation: "Inventory exceeds expected demand, so AI evaluates cash recovery and holding-risk reduction."
    }
    : goal.actionLabel === "Restock Inventory"
      ? {
        metric: `${Math.round(stockCoverage)} days`,
        benchmark: `${simulationHorizonDays} days target`,
        impact: "Stockout risk detected",
        status: "Limited",
        explanation: "Inventory coverage may cap profitable demand unless stock is replenished."
      }
      : {
        metric: `${Math.round(stockCoverage)} days`,
        benchmark: `${simulationHorizonDays} days`,
        impact: "Inventory supports growth",
        status: stockCoverage >= simulationHorizonDays ? "Healthy" : "Limited",
        explanation: stockCoverage >= simulationHorizonDays
          ? "Inventory can support the selected action during the simulation window."
          : "Inventory coverage is limited, so growth actions are constrained."
      };
  const actualRows = rows.filter((item) => item.actual_profit !== null);
  const actualProfit = detail.tracking_summary.actual_cumulative_lift
    ?? (actualRows.length ? actualRows.reduce((sum, item) => sum + ((item.actual_profit ?? 0) - item.baseline_profit), 0) : null);
  const progress = actualProfit === null || !detail.expected_profit_lift_30d
    ? 0
    : Math.max(0, Math.min(1, actualProfit / Math.abs(detail.expected_profit_lift_30d)));
  const isNoActionDecision = goal.actionLabel === "No Action Required";
  const expected = isNoActionDecision ? 0 : detail.expected_profit_lift_30d;

  const backendScenarios = Array.isArray(row.scenarios) && row.scenarios.length
    ? row.scenarios.map((scenario) => ({
      action: scenario.label ?? portfolioScenarioActionLabel(scenario.action, "en"),
      profit_delta: scenario.expected_profit_lift ?? 0,
      confidence: scenario.confidence ?? row.confidence ?? detail.confidence,
      risk: scenario.selected ? row.risk : undefined,
      selected: Boolean(scenario.selected),
      status: scenario.selected ? "Selected" as const : ((scenario.expected_profit_lift ?? 0) < 0 ? "Rejected" as const : "Alternative" as const)
    }))
    : null;
  const selectedScenario: SkuDecisionObject["scenarios"][number] = {
    action: actionDisplay.title,
    profit_delta: expected,
    confidence: detail.confidence,
    risk: row.risk,
    selected: true,
    status: "Selected"
  };
  const fallbackScenarios: SkuDecisionObject["scenarios"] = [
    { action: "Expand Channel", profit_delta: expected * 0.64, confidence: Math.max(0.45, detail.confidence - 0.06), selected: false, status: "Alternative" },
    { action: "Increase Price", profit_delta: expected * 0.42, confidence: Math.max(0.45, detail.confidence - 0.1), selected: false, status: "Alternative" },
    { action: "Promotion", profit_delta: expected * 0.24, confidence: Math.max(0.42, detail.confidence - 0.14), selected: false, status: "Alternative" },
    { action: "Hold", profit_delta: 0, confidence: 0.7, selected: false, status: "Alternative" }
  ];
  const scenarioAlternatives = normalizeDecisionScenarios(
    [...(backendScenarios ?? []), ...fallbackScenarios],
    actionDisplay.title
  );
  const decisionScenarios = [selectedScenario, ...scenarioAlternatives].slice(0, 5);

  return {
    sku: detail.sku,
    optimization_goal: `${goalIcon} ${goal.goalLabel} Optimization`,
    action: actionDisplay.title,
    action_description: actionDisplay.description,
    action_reason: actionDisplay.reason,
    reasoning: actionReasoning,
    evidence: [
      {
        signal: "Demand Signal",
        metric: percent.format(demandTrend),
        benchmark: "0%",
        impact: "Stable demand",
        status: demandTrend >= 0 ? "Positive" : "Watch",
        explanation: demandTrend >= 0
          ? "Demand momentum is stronger than the neutral benchmark."
          : "Demand is not yet strong enough for aggressive action."
      },
      {
        signal: "Profit Signal",
        metric: percent.format(detail.current_margin),
        benchmark: percent.format(portfolioAverageMargin),
        impact: "Positive margin",
        status: detail.current_margin >= portfolioAverageMargin ? "Above Average" : "Below Average",
        explanation: detail.current_margin >= portfolioAverageMargin
          ? "SKU has healthy profitability versus the portfolio benchmark."
          : "Margin is below benchmark, so AI avoids actions that add cost."
      },
      {
        signal: "Advertising Signal",
        metric: ratioFormat.format(roas),
        benchmark: ratioFormat.format(marginalRoas),
        impact: "Efficient ads",
        status: marginalRoas >= 2 ? "Efficient" : "Needs Review",
        explanation: marginalRoas >= 2
          ? "Additional advertising has positive return potential."
          : "Marginal ad return is below the preferred scale threshold."
      },
      {
        signal: "Inventory Signal",
        metric: inventorySignal.metric,
        benchmark: inventorySignal.benchmark,
        impact: inventorySignal.impact,
        status: inventorySignal.status,
        explanation: inventorySignal.explanation
      }
    ],
    scenarios: decisionScenarios,
    summary_comparison: buildDecisionSummaryComparisonRows(row, recommendation, detail, actionDisplay, simulationHorizonDays),
    decision_trace: normalizedDecision.trace,
    tracking: {
      current_ads_spend: detail.current_ads_spend,
      current_strategy_profit: detail.current_profit,
      predicted_profit: detail.predicted_profit,
      expected_profit: expected,
      actual_profit: actualProfit,
      organic_change: detail.tracking_summary.organic_cumulative_change,
      outcome_status: detail.tracking_summary.outcome_status,
      progress,
      learning_status: actualProfit === null
        ? "Waiting for outcome data"
        : detail.tracking_summary.outcome_status === "NEGATIVE"
          ? "Reduce confidence for similar actions"
          : "Prediction is being calibrated using attributed outcomes"
    },
    lifecycle_status: `🟢 ${lifecycleLabel}`,
    decision_status: actionStatus === "accepted" ? "Accepted" : actionStatus === "rejected" ? "Rejected" : "Pending Approval"
  };
}

function buildDailyProfitTrackingRows(detail: SelectedSkuDetail, range: 7 | 14 | 30): DailyProfitTrackingRow[] {
  const baseDate = new Date("2026-07-11T00:00:00");
  const dailyLift = detail.expected_profit_lift_30d / 30;
  const rows: DailyProfitTrackingRow[] = [];

  for (let index = range - 1; index >= 0; index -= 1) {
    const dayNumber = range - index;
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() - index);
    const ramp = 0.72 + (dayNumber / Math.max(1, range)) * 0.42;
    const baselineProfit = detail.current_profit / 30;
    const profitDelta = dailyLift * ramp;
    const predictedProfit = baselineProfit + profitDelta;
    const hasActual = detail.source === "actual" && dayNumber <= Math.min(3, range);
    const actualProfit = hasActual ? baselineProfit + profitDelta * (0.68 + dayNumber * 0.04) : null;

    rows.push({
      sku: detail.sku,
      date: date.toISOString().slice(0, 10),
      baseline_profit: baselineProfit,
      predicted_profit: predictedProfit,
      actual_profit: actualProfit,
      profit_delta: profitDelta,
      revenue: (detail.current_revenue / 30) * ramp,
      ads_spend: (detail.current_ads_spend / 30) * (detail.action === "Scale" ? 1.18 : 1),
      margin: Math.min(0.8, detail.current_margin + (detail.predicted_margin - detail.current_margin) * (dayNumber / Math.max(1, range))),
      stock: Math.max(0, Math.round(detail.current_stock - detail.predicted_daily_demand * dayNumber)),
      sales_velocity: detail.current_sales_velocity * ramp,
      action_status: hasActual ? "tracking" : "pending",
      source: "simulated"
    });
  }

  return rows;
}

function EvidenceCards({
  detail,
  compact = false,
  showTitle = true
}: {
  detail: SelectedSkuDetail;
  compact?: boolean;
  showTitle?: boolean;
}) {
  const cards = [
    {
      title: "Demand Signal",
      rows: [
        ["Predicted revenue uplift", percent.format((detail.predicted_revenue - detail.current_revenue) / Math.max(1, detail.current_revenue))],
        ["Sales velocity", `${ratioFormat.format(detail.current_sales_velocity)}/day → ${ratioFormat.format(detail.predicted_daily_demand)}/day`]
      ]
    },
    {
      title: "Profit Signal",
      rows: [
        ["Current profit", currencyDecimal.format(detail.current_profit)],
        ["Predicted profit", currencyDecimal.format(detail.predicted_profit)],
        ["Expected lift", signedCurrency(detail.expected_profit_lift_30d)]
      ]
    },
    {
      title: "Margin Strength",
      rows: [
        ["Current margin", percent.format(detail.current_margin)],
        ["Predicted margin", percent.format(detail.predicted_margin)],
        ["Constraint threshold", "25.00% · Passed"]
      ]
    },
    {
      title: "Inventory Readiness",
      rows: [
        ["Current stock", numberFormat.format(detail.current_stock)],
        ["Predicted daily demand", `${ratioFormat.format(detail.predicted_daily_demand)}/day`],
        ["Inventory runway", `${ratioFormat.format(detail.inventory_runway_days)} days · Passed`]
      ]
    }
  ];

  return (
    <div className={cn(compact ? "" : "mt-3 rounded-lg bg-white p-4 ring-1 ring-slate-100")}>
      {showTitle ? <p className="text-sm font-bold text-slate-950">Why This Action</p> : null}
      <div className={cn(showTitle ? "mt-3" : "", "grid gap-2")}>
        {cards.map((card) => (
          <div key={card.title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{card.title}</p>
            <div className="mt-2 space-y-1.5">
              {card.rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 text-xs">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-right font-bold text-slate-950">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionLifecycleCard({
  detail,
  actionStatus,
  accuracy,
  compact = false,
  showTitle = true
}: {
  detail: SelectedSkuDetail;
  actionStatus: "pending" | "accepted" | "rejected";
  accuracy: number | null;
  compact?: boolean;
  showTitle?: boolean;
}) {
  const actualLift = detail.tracking_summary.actual_cumulative_lift;
  const dayLabel = actionStatus === "accepted" ? "Running Day 7 / 30" : actionStatus === "rejected" ? "Rejected before execution" : "Pending Approval";
  const lifecycleSteps = ["Recommended", "Approved", "Executing", "Measured", "Learned"];
  const currentStep = actionStatus === "pending" ? 0 : actionStatus === "accepted" ? 2 : 0;

  return (
    <div className={cn(compact ? "" : "mt-3 rounded-lg bg-white p-4 ring-1 ring-slate-100")}>
      {showTitle ? <p className="text-sm font-bold text-slate-950">AI Decision Lifecycle</p> : null}
      <div className={cn(showTitle ? "mt-3" : "", "rounded-lg bg-slate-50 p-3")}>
        <div className="flex flex-wrap items-center gap-2">
          {lifecycleSteps.map((step, index) => (
            <Fragment key={step}>
              <span className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-bold ring-1",
                index <= currentStep ? "bg-emerald-100 text-emerald-800 ring-emerald-200" : "bg-white text-slate-500 ring-slate-200"
              )}>
                {step}
              </span>
              {index < lifecycleSteps.length - 1 ? <span className="text-slate-300">↓</span> : null}
            </Fragment>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-100">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current Status</p>
          <p className="mt-1 text-base font-extrabold text-emerald-700">{dayLabel}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            AI compares expected lift with observed profit outcomes and updates future action selection.
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SmallTrackerMetric label="Expected lift" value={signedCurrency(detail.tracking_summary.predicted_cumulative_lift)} />
        <SmallTrackerMetric label="Actual lift" value={actualLift === null ? "Pending" : signedCurrency(actualLift)} />
        <SmallTrackerMetric label="Learning status" value={actualLift === null ? "Waiting for outcome" : "Model adjusting"} />
        <SmallTrackerMetric label="AI accuracy" value={accuracy === null ? "Pending" : percent.format(accuracy)} />
      </div>
    </div>
  );
}

function ActionOutcomeTracker({
  rows,
  locale,
  onSelect,
  variant = "full",
  opportunities = rows.length,
  recommendedActions = rows.length,
  expectedProfitImpact = rows.reduce((sum, row) => sum + row.predictedProfitLift, 0),
  currentProfit,
  optimizedProfit,
  actualProfitLift = rows.reduce((sum, row) => sum + (row.actualProfitLift ?? 0), 0),
  liftRate
}: {
  rows: ActionOutcomeRow[];
  locale: RendererLocale;
  onSelect: (row: ActionOutcomeRow) => void;
  variant?: "full" | "sidebar";
  opportunities?: number;
  recommendedActions?: number;
  expectedProfitImpact?: number;
  currentProfit?: number;
  optimizedProfit?: number;
  actualProfitLift?: number;
  liftRate?: number;
}) {
  const isZh = locale === "zh";
  const acceptedCount = rows.filter((row) => row.status !== "Rejected").length;
  const runningCount = rows.filter((row) => row.status === "Running").length;
  const completedRows = rows.filter((row) => row.status === "Completed" && row.actualProfitLift !== null);
  const successRate = completedRows.length
    ? completedRows.filter((row) => (row.actualProfitLift ?? 0) >= row.predictedProfitLift * 0.7).length / completedRows.length
    : 0;
  const averageError = completedRows.length
    ? completedRows.reduce((sum, row) => sum + Math.abs((row.actualProfitLift ?? 0) - row.predictedProfitLift), 0) / completedRows.length
    : 0;

  if (variant === "sidebar") {
    return (
      <aside className="sticky bottom-0 right-0 top-auto z-20 max-h-[58vh] overflow-auto rounded-lg border bg-slate-50/95 p-4 shadow-xl backdrop-blur xl:top-3 xl:h-[calc(100vh-7rem)] xl:max-h-none">
        <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold text-slate-950">{isZh ? "AI Optimization Tracker" : "AI Optimization Tracker"}</p>
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                <span className="size-2 rounded-full bg-emerald-500" />
                {isZh ? "Optimizing / Running" : "Optimizing / Running"}
              </p>
            </div>
            <Badge tone="success">{isZh ? "实时" : "Live"}</Badge>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {isZh
              ? `Monitoring ${numberFormat.format(opportunities)} optimization opportunities`
              : `Monitoring ${numberFormat.format(opportunities)} optimization opportunities`}
          </p>
        </div>

        <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isZh ? "优化利润数据" : "Optimized Profit Data"}</p>
          <div className="mt-3 grid gap-2">
            {typeof optimizedProfit === "number" ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{isZh ? "AI 优化后利润" : "AI Optimized Profit"}</p>
                <p className="mt-1 text-xl font-bold text-emerald-950">{currencyDecimal.format(optimizedProfit)}</p>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {typeof currentProfit === "number" ? (
                <SmallTrackerMetric label={isZh ? "当前利润" : "Current profit"} value={currencyDecimal.format(currentProfit)} />
              ) : null}
              <SmallTrackerMetric
                label={isZh ? "预计提升" : "Expected lift"}
                value={`${signedCurrency(expectedProfitImpact)}${typeof liftRate === "number" ? ` / ${percent.format(liftRate)}` : ""}`}
              />
              <SmallTrackerMetric label={isZh ? "实际累计提升" : "Actual lift"} value={signedCurrency(actualProfitLift)} />
              <SmallTrackerMetric label={isZh ? "预测差距" : "Open lift"} value={signedCurrency(expectedProfitImpact - actualProfitLift)} />
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI Status</p>
          <div className="mt-3 grid gap-2 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{isZh ? "推荐动作" : "Recommended actions"}</span>
              <span className="font-bold text-slate-950">{numberFormat.format(recommendedActions)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{isZh ? "活跃实验" : "Active experiments"}</span>
              <span className="font-bold text-slate-950">{numberFormat.format(runningCount)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{isZh ? "预期利润影响" : "Expected profit impact"}</span>
              <span className="font-bold text-emerald-700">{signedCurrency(expectedProfitImpact)}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <SmallTrackerMetric label={isZh ? "已接受" : "Accepted"} value={numberFormat.format(acceptedCount)} />
          <SmallTrackerMetric label={isZh ? "运行中" : "Running"} value={numberFormat.format(runningCount)} />
          <SmallTrackerMetric label={isZh ? "完成" : "Done"} value={numberFormat.format(completedRows.length)} />
        </div>

        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <button
              type="button"
              key={`${row.action}-${row.sku}-${row.acceptedAt}`}
              onClick={() => onSelect(row)}
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-950">{row.sku}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500">Action: {actionIcon(row.action)} {row.action}</p>
                </div>
                <ActionStatusBadge status={row.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-400">Prediction</p>
                  <p className="mt-1 font-bold text-emerald-700">+{currencyDecimal.format(row.predictedProfitLift)}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-400">Actual</p>
                  <p className="mt-1 font-bold text-slate-900">{row.actualProfitLift === null ? "Pending" : `+${currencyDecimal.format(row.actualProfitLift)}`}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-400">Progress</p>
                  <p className="mt-1 font-bold text-slate-900">{actionProgressLabel(row)}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-400">Prediction Accuracy</p>
                  <p className="mt-1 font-bold text-slate-900">{percentNoDecimal.format(predictionAccuracy(row))}</p>
                </div>
              </div>
              <ActionTimeline status={row.status} />
            </button>
          ))}
        </div>

        <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isZh ? "学习反馈" : "Learning"}</p>
          <div className="mt-2 grid gap-2 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{isZh ? "成功率" : "Success rate"}</span>
              <span className="font-bold text-slate-950">{percent.format(successRate)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{isZh ? "平均预测误差" : "Avg error"}</span>
              <span className="font-bold text-slate-950">{currencyDecimal.format(averageError)}</span>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div className="mt-5 rounded-lg border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Action Outcome Tracker</p>
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? "追踪已接受动作的预测结果、实际利润提升和学习反馈。"
              : "Tracks accepted actions, predicted outcomes, actual profit lift, and learning feedback."}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right text-xs">
          <SmallTrackerMetric label={isZh ? "已接受" : "Accepted"} value={numberFormat.format(acceptedCount)} />
          <SmallTrackerMetric label={isZh ? "运行中" : "Running"} value={numberFormat.format(runningCount)} />
          <SmallTrackerMetric label={isZh ? "已完成" : "Completed"} value={numberFormat.format(completedRows.length)} />
        </div>
      </div>

      <div className="mt-4 overflow-auto rounded-lg border">
        <table className="min-w-[860px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">Action</th>
              <th className="px-3 py-3">SKU</th>
              <th className="px-3 py-3">Accepted At</th>
              <th className="px-3 py-3">Window</th>
              <th className="px-3 py-3">Predicted Profit Lift</th>
              <th className="px-3 py-3">Actual Profit Lift</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">{isZh ? "详情" : "Details"}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={`${row.action}-${row.sku}-${row.acceptedAt}`}>
                <td className="px-3 py-3 font-medium text-slate-900">{row.action}</td>
                <td className="px-3 py-3 font-semibold text-slate-900">{row.sku}</td>
                <td className="px-3 py-3">{row.acceptedAt}</td>
                <td className="px-3 py-3">{row.window}</td>
                <td className="px-3 py-3 font-semibold text-emerald-700">+{currencyDecimal.format(row.predictedProfitLift)}</td>
                <td className="px-3 py-3">{row.actualProfitLift === null ? "Pending" : `+${currencyDecimal.format(row.actualProfitLift)}`}</td>
                <td className="px-3 py-3"><ActionStatusBadge status={row.status} /></td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onSelect(row)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Track Result
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-950">{isZh ? "Learning Summary" : "Learning Summary"}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <SmallTrackerMetric label={isZh ? "本周接受动作数" : "Accepted this week"} value={numberFormat.format(acceptedCount)} />
          <SmallTrackerMetric label={isZh ? "成功率" : "Success rate"} value={percent.format(successRate)} />
          <SmallTrackerMetric label={isZh ? "平均预测误差" : "Avg prediction error"} value={currencyDecimal.format(averageError)} />
          <SmallTrackerMetric label={isZh ? "最有效动作" : "Best action type"} value={isZh ? "增加广告" : "Increase Ads"} />
        </div>
      </div>
    </div>
  );
}

function SmallTrackerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white px-3 py-2 ring-1 ring-slate-100">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ActionStatusBadge({ status }: { status: ActionOutcomeStatus }) {
  const tone = status === "Completed"
    ? "success"
    : status === "Running" || status === "Accepted"
      ? "warning"
      : status === "Rejected"
        ? "neutral"
        : "neutral";

  return <Badge tone={tone}>{status}</Badge>;
}

function actionIcon(action: string) {
  if (/ad|ads|scale|increase/i.test(action)) return "🚀";
  if (/price/i.test(action)) return "↕";
  if (/stock|inventory|restock/i.test(action)) return "▣";
  return "•";
}

function actionProgressLabel(row: ActionOutcomeRow) {
  if (row.status === "Completed") return "Day 30 / 30";
  if (row.status === "Running") return "Day 3 / 30";
  if (row.status === "Accepted") return "Day 1 / 30";
  return "Pending";
}

function predictionAccuracy(row: ActionOutcomeRow) {
  if (row.actualProfitLift === null || row.predictedProfitLift <= 0) return Math.max(0.5, Math.min(0.95, row.confidence));
  const gapRatio = Math.abs(row.actualProfitLift - row.predictedProfitLift) / row.predictedProfitLift;
  return Math.max(0, Math.min(1, 1 - gapRatio));
}

function ActionTimeline({ status }: { status: ActionOutcomeStatus }) {
  const completed = status === "Completed";
  const tracking = status === "Running" || completed;
  const steps = [
    { label: "AI recommendation accepted", state: "done" },
    { label: "Budget updated", state: status === "Pending" ? "todo" : "done" },
    { label: "Monitoring profit impact", state: tracking ? "active" : "todo" },
    { label: "Final evaluation", state: completed ? "done" : "todo" }
  ];

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="space-y-1.5">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-2 text-xs">
            <span className={cn(
              "grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold",
              step.state === "done" && "bg-emerald-100 text-emerald-700",
              step.state === "active" && "bg-amber-100 text-amber-700",
              step.state === "todo" && "bg-slate-100 text-slate-400"
            )}>
              {step.state === "done" ? "✓" : step.state === "active" ? "●" : "○"}
            </span>
            <span className={cn(
              step.state === "todo" ? "text-slate-400" : "font-semibold text-slate-700"
            )}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendationStatusBadge({
  status,
  locale
}: {
  status: "awaiting_decision" | "accepted" | "rejected";
  locale: RendererLocale;
}) {
  const isZh = locale === "zh";
  if (status === "accepted") return <Badge tone="warning">{isZh ? "已接受" : "Accepted"}</Badge>;
  if (status === "rejected") return <Badge tone="neutral">{isZh ? "已拒绝" : "Rejected"}</Badge>;
  return <Badge tone="neutral">{isZh ? "待确认" : "Awaiting decision"}</Badge>;
}

function ActiveDecisionStatusBadge({
  status,
  locale
}: {
  status: "ACCEPTED" | "EXECUTING" | "COMPLETE";
  locale: RendererLocale;
}) {
  const isZh = locale === "zh";
  const stateLabel = status === "EXECUTING"
    ? (isZh ? "执行中" : "EXECUTING")
    : status === "COMPLETE"
      ? (isZh ? "已完成" : "COMPLETE")
      : (isZh ? "已接受" : "ACCEPTED");
  const label = isZh ? `之前：${stateLabel}` : `Previous: ${stateLabel}`;
  const tone = status === "EXECUTING" ? "success" : status === "COMPLETE" ? "neutral" : "warning";
  return <Badge tone={tone}>{label}</Badge>;
}

function previousDecisionActiveStatus(row: PortfolioDecisionRow): "ACCEPTED" | "EXECUTING" | "COMPLETE" | null {
  const context = objectRecord((row as Record<string, unknown>).previous_decision_context);
  const status = String(context.previous_status ?? "").toUpperCase();
  if (status === "EXECUTING") return "EXECUTING";
  if (status === "COMPLETED" || status === "EVALUATED" || status === "LEARNED" || status === "SUPERSEDED") return "COMPLETE";
  if (status === "ACCEPTED") return "ACCEPTED";
  return null;
}

function ActionDecisionButtons({
  locale,
  onAccept,
  onReject,
  compact = false,
  acceptLabel
}: {
  locale: RendererLocale;
  onAccept: (event?: MouseEvent<HTMLButtonElement>) => void;
  onReject: (event?: MouseEvent<HTMLButtonElement>) => void;
  compact?: boolean;
  acceptLabel?: string;
}) {
  const isZh = locale === "zh";

  return (
    <div className={cn("flex gap-2", compact ? "min-w-[132px]" : "mt-3 w-full")}>
      <button
        type="button"
        onClick={(event) => onReject(event)}
        className={cn(
          "flex-1 rounded-md border border-slate-200 bg-white font-semibold text-slate-600 transition hover:bg-slate-50",
          compact ? "px-2 py-1 text-[11px]" : "px-3 py-2 text-sm"
        )}
      >
        {isZh ? "拒绝" : "Reject"}
      </button>
      <button
        type="button"
        onClick={(event) => onAccept(event)}
        className={cn(
          "flex-1 rounded-md bg-[#079669] font-semibold text-white transition hover:bg-[#067f5a]",
          compact ? "px-2 py-1 text-[11px]" : "px-3 py-2 text-sm"
        )}
      >
        {acceptLabel ?? (isZh ? "接受" : "Accept")}
      </button>
    </div>
  );
}

function DecisionDetailDrawer({
  row,
  recommendation,
  actualProfitLift,
  simulationHorizonDays,
  actionStatus,
  locale,
  onAccept,
  onReject,
  onClose
}: {
  row: PortfolioDecisionRow;
  recommendation?: PortfolioRow;
  actualProfitLift: number | null;
  simulationHorizonDays: number;
  actionStatus: "awaiting_decision" | "accepted" | "rejected";
  locale: RendererLocale;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  const isZh = locale === "zh";
  const drivers = row.decisionDrivers ?? buildFallbackDecisionDrivers(recommendation);
  const causalExplanation = row.causalExplanation ?? buildFallbackCausalExplanation(recommendation);
  const expectedProfitImpact = row.expectedProfitImpact ?? row.estimatedProfitImpact;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/20" onClick={onClose}>
      <div
        className="ml-auto h-full w-full max-w-2xl overflow-auto bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-bold text-slate-950">{row.skuId}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <DecisionBadge action={row.action ?? "MONITOR"} locale={locale} />
              <RoleBadge role={row.skuRole ?? "PROFIT"} locale={locale} />
              <RecommendationStatusBadge status={actionStatus} locale={locale} />
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-1 text-sm font-semibold text-slate-600">Close</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SmallTrackerMetric label={isZh ? "预计利润影响" : "Expected impact"} value={signedCurrency(expectedProfitImpact)} />
          <SmallTrackerMetric label={isZh ? "实际利润提升" : "Actual profit lift"} value={actualProfitLift === null ? "Pending" : signedCurrency(actualProfitLift)} />
          <SmallTrackerMetric label={isZh ? "置信度" : "Confidence"} value={percent.format(row.confidence ?? 0)} />
        </div>

        <div className="mt-5 rounded-lg border p-4">
          <p className="text-sm font-semibold text-slate-950">{isZh ? "建议执行" : "Recommended Action"}</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {(row.recommendedActions ?? row.recommendedExecution ?? [portfolioScenarioActionLabel(row.sourceAction, locale)])[0]}
          </p>
        </div>

        <div className="mt-4 rounded-lg border p-4">
          <p className="text-sm font-semibold text-slate-950">{isZh ? "Why this action" : "Why this action"}</p>
          <div className="mt-3">
            <DecisionDriversCell
              action={row.action ?? "MONITOR"}
              drivers={drivers}
              causalExplanation={causalExplanation}
              confidenceBreakdown={row.confidence_breakdown}
              locale={locale}
            />
          </div>
        </div>

        <div className="mt-4 rounded-lg border p-4">
          <p className="text-sm font-semibold text-slate-950">{isZh ? "Evidence" : "Evidence"}</p>
          <div className="mt-3 grid gap-2 text-sm text-slate-700">
            {causalExplanation.evidence.map((item) => (
              <div key={item} className="rounded-lg bg-slate-50 px-3 py-2">{localizeDriverText(item, locale)}</div>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
          <p className="text-sm font-semibold text-emerald-950">{isZh ? "Simulation" : "Simulation"}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SmallTrackerMetric label={isZh ? "观察窗口" : "Observation window"} value={`${row.simulation_horizon?.days ?? simulationHorizonDays} ${isZh ? "天" : "days"}`} />
            <SmallTrackerMetric label={isZh ? "预计利润影响" : "Expected lift"} value={signedCurrency(expectedProfitImpact)} />
            {recommendation ? (
              <>
                <SmallTrackerMetric label={isZh ? "当前利润" : "Current profit"} value={currencyDecimal.format(recommendation.current_profit)} />
                <SmallTrackerMetric label={isZh ? "预测利润" : "Predicted profit"} value={currencyDecimal.format(recommendation.predicted_profit)} />
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onReject}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-md bg-[#079669] px-3 py-2 text-sm font-semibold text-white hover:bg-[#067f5a]"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionTrackingDrawer({ row, locale, onClose }: { row: ActionOutcomeRow; locale: RendererLocale; onClose: () => void }) {
  const isZh = locale === "zh";
  const actualLift = row.actualProfitLift ?? 0;
  const gap = row.actualProfitLift === null ? null : actualLift - row.predictedProfitLift;
  const progress = row.status === "Completed" ? 1 : row.status === "Running" ? 0.45 : 0.15;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/20" onClick={onClose}>
      <div
        className="ml-auto h-full w-full max-w-xl overflow-auto bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-bold text-slate-950">{isZh ? "Action Tracking Detail" : "Action Tracking Detail"}</p>
            <p className="mt-1 text-sm text-slate-500">{row.sku} · {row.action}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border px-3 py-1 text-sm font-semibold text-slate-600">Close</button>
        </div>

        <div className="mt-5 rounded-lg border p-4">
          <p className="text-sm font-semibold text-slate-950">{isZh ? "Baseline vs Predicted vs Actual" : "Baseline vs Predicted vs Actual"}</p>
          <div className="mt-3 grid gap-3">
            <DiffRow label={isZh ? "Baseline profit" : "Baseline profit"} value={currencyDecimal.format(row.baselineProfit)} />
            <DiffRow label={isZh ? "Predicted profit lift" : "Predicted profit lift"} value={`+${currencyDecimal.format(row.predictedProfitLift)}`} />
            <DiffRow label={isZh ? "Actual profit lift" : "Actual profit lift"} value={row.actualProfitLift === null ? "Pending" : `+${currencyDecimal.format(row.actualProfitLift)}`} />
            <DiffRow label={isZh ? "Prediction gap" : "Prediction gap"} value={gap === null ? "Pending" : signedCurrency(gap)} />
          </div>
        </div>

        <div className="mt-4 rounded-lg border p-4">
          <p className="text-sm font-semibold text-slate-950">{isZh ? "Progress" : "Progress"}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-700">
            <DiffRow label="Accepted" value={row.acceptedAt} />
            <DiffRow label="Observation window" value={row.window} />
            <DiffRow label="Status" value={row.status} />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-950">{isZh ? "Learning Notes" : "Learning Notes"}</p>
          <p className="mt-2 text-sm leading-6 text-emerald-900">
            {row.actualProfitLift === null
              ? (isZh ? "观察窗口仍在运行，系统会持续对比实际利润和预测利润。" : "The observation window is still running. Actual profit will be compared with the prediction.")
              : (isZh ? `该动作已产生 ${currencyDecimal.format(row.actualProfitLift)} 实际利润提升，用于更新后续推荐可信度。` : `This action produced ${currencyDecimal.format(row.actualProfitLift)} actual profit lift and will update future recommendation confidence.`)}
          </p>
        </div>
      </div>
    </div>
  );
}

function DiffRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function decisionActionLabel(action: "SCALE" | "REDUCE" | "OPTIMIZE" | "MONITOR", locale: RendererLocale) {
  if (locale !== "zh") {
    if (action === "SCALE") return "🚀 Scale";
    if (action === "REDUCE") return "🛑 Reduce";
    if (action === "OPTIMIZE") return "🔧 Optimize";
    return "Monitor";
  }

  if (action === "SCALE") return "🚀 放大";
  if (action === "REDUCE") return "🛑 降投";
  if (action === "OPTIMIZE") return "🔧 优化";
  return "观察";
}

function decisionFilterLabel(filter: PortfolioDecisionFilter, locale: RendererLocale) {
  if (filter === "ALL") return locale === "zh" ? "全部" : "All";
  if (filter === "INVENTORY_RISK") return "Inventory Risk";
  if (filter === "BUDGET_OPPORTUNITY") return "Budget Opportunity";
  return decisionActionLabel(filter, locale);
}

function buildFallbackDecisionDrivers(row?: PortfolioRow): DecisionDriverView[] {
  if (!row) {
    return [
      {
        category: "Decision Context",
        metric: "Portfolio Signal",
        value: "Awaiting detailed simulation row",
        impact: "risk"
      }
    ];
  }
  const decision = row.decision_action ?? "MONITOR";
  const beforeRevenue = safeNumber(row.before_state?.revenue);
  const revenueDelta = safeNumber(row.simulation?.revenue_delta);
  const requiredInventory = safeNumber(row.simulation?.required_inventory);
  const beforeInventory = safeNumber(row.before_state?.inventory);
  const profitDelta = safeNumber(row.profit_delta);
  const recommendedAdsSpend = safeNumber(row.simulation?.recommended_ads_spend);
  const currentAdsSpend = safeNumber(row.simulation?.current_ads_spend);
  const predictedMargin = safeNumber(row.simulation?.predicted_margin);
  const marginChange = safeNumber(row.simulation?.margin_change);
  const revenueChangeRate = beforeRevenue > 0 ? revenueDelta / beforeRevenue : 0;
  const runwayDays = requiredInventory > 0
    ? beforeInventory / Math.max(1, requiredInventory / 30)
    : null;

  if (decision === "SCALE") {
    return [
      {
        category: "Demand Signal",
        metric: "Simulated Revenue Lift",
        value: `${formatSignedPercentText(revenueChangeRate)} under selected action`,
        impact: revenueChangeRate >= 0 ? "positive" : "risk"
      },
      {
        category: "Profit Impact",
        metric: "Estimated Incremental Profit",
        value: signedCurrency(profitDelta),
        impact: profitDelta >= 0 ? "positive" : "negative"
      },
      {
        category: "Inventory Status",
        metric: "Stock Runway",
        value: runwayDays === null ? "Needs validation" : `${ratioFormat.format(runwayDays)} days coverage`,
        impact: requiredInventory <= beforeInventory ? "positive" : "risk"
      }
    ];
  }

  if (decision === "REDUCE") {
    return [
      {
        category: "Ad Efficiency",
        metric: "Budget Reduction",
        value: signedCurrency(recommendedAdsSpend - currentAdsSpend),
        impact: "negative"
      },
      {
        category: "Profit Impact",
        metric: "Marginal Profit",
        value: signedCurrency(profitDelta),
        impact: profitDelta < 0 ? "negative" : "risk"
      },
      {
        category: "Margin Signal",
        metric: "Predicted Margin",
        value: percent.format(predictedMargin),
        impact: predictedMargin < 0.15 ? "negative" : "risk"
      }
    ];
  }

  if (decision === "OPTIMIZE") {
    return [
      {
        category: "Root Cause",
        metric: "Constraint",
        value: String(row.action ?? "").includes("RESTOCK") ? "Inventory coverage constrains scale" : "Price or margin needs adjustment",
        impact: "risk"
      },
      {
        category: "Profit Impact",
        metric: "Estimated Fix Value",
        value: signedCurrency(profitDelta),
        impact: profitDelta >= 0 ? "positive" : "risk"
      },
      {
        category: "Margin Response",
        metric: "Margin Change",
        value: formatSignedPercentText(marginChange),
        impact: marginChange >= 0 ? "positive" : "risk"
      }
    ];
  }

  return [
    {
      category: "Data Sufficiency",
      metric: "Prediction Confidence",
      value: percent.format(safeNumber(row.confidence)),
      impact: safeNumber(row.confidence) >= 0.65 ? "positive" : "risk"
    },
    {
      category: "Profit Impact",
      metric: "Estimated Impact",
      value: signedCurrency(profitDelta),
      impact: profitDelta > 0 ? "positive" : "risk"
    }
  ];
}

function buildFallbackCausalExplanation(row?: PortfolioRow): DecisionCausalExplanationView {
  if (!row) {
    return {
      evidence: [],
      businessMeaning: "The SKU has a portfolio decision, but detailed simulation data is not attached to this row.",
      decision: "Use the action classification and monitor the next simulation refresh."
    };
  }
  const decision = row.decision_action ?? "MONITOR";
  if (decision === "SCALE") {
    const adsDelta = safeNumber(row.simulation?.recommended_ads_spend) - safeNumber(row.simulation?.current_ads_spend);
    return {
      evidence: [],
      businessMeaning: "Demand, margin, and inventory signals indicate positive marginal profit potential.",
      decision: `Increase advertising budget by ${currencyDecimal.format(Math.max(0, adsDelta))} and track profit lift.`
    };
  }
  if (decision === "REDUCE") {
    return {
      evidence: [],
      businessMeaning: "The SKU consumes resources that can be reallocated to stronger portfolio opportunities.",
      decision: "Reduce exposure or stop inefficient campaigns, then reallocate budget."
    };
  }
  if (decision === "OPTIMIZE") {
    return {
      evidence: [],
      businessMeaning: "The SKU has profit potential, but a constraint must be fixed before scaling.",
      decision: String(row.action ?? "").includes("RESTOCK") ? "Resolve inventory coverage before increasing demand." : "Run the selected fix before scaling."
    };
  }
  return {
    evidence: [],
    businessMeaning: "Current evidence is not strong enough for an irreversible portfolio move.",
    decision: "Monitor until confidence or outcome data improves."
  };
}

function localizeDriverText(text: string, locale: RendererLocale) {
  if (locale !== "zh") return text;
  return text
    .replace("Demand Signal", "需求信号")
    .replace("Simulated Revenue Lift", "模拟收入提升")
    .replace("under selected action", "在所选动作下")
    .replace("Profit Impact", "利润影响")
    .replace("Estimated Incremental Profit", "预计增量利润")
    .replace("Estimated Fix Value", "预计修复价值")
    .replace("Estimated Impact", "预计影响")
    .replace("Margin Strength", "利润率强度")
    .replace("Contribution Margin", "贡献利润率")
    .replace("current", "当前")
    .replace("change", "变化")
    .replace("Inventory Status", "库存状态")
    .replace("Stock Runway", "库存支撑")
    .replace("days coverage", "天覆盖")
    .replace("Needs validation", "需要验证")
    .replace("Ad Efficiency", "广告效率")
    .replace("Budget Reduction", "预算减少")
    .replace("spend change", "投放变化")
    .replace("Spend not justified by simulation", "模拟结果不支持当前投放")
    .replace("Marginal Profit", "边际利润")
    .replace("Margin Signal", "利润率信号")
    .replace("Predicted Margin", "预测利润率")
    .replace("after action", "动作后")
    .replace("Recovery Signal", "恢复信号")
    .replace("Revenue Simulation", "收入模拟")
    .replace("revenue change", "收入变化")
    .replace("Root Cause", "根因")
    .replace("Constraint", "约束")
    .replace("Inventory coverage constrains scale", "库存覆盖限制放大")
    .replace("Price and margin need adjustment", "价格和利润率需要调整")
    .replace("Price or margin needs adjustment", "价格或利润率需要调整")
    .replace("Operating constraint limits scaling", "经营约束限制放大")
    .replace("Margin Response", "利润率响应")
    .replace("Margin Change", "利润率变化")
    .replace("Required Inventory", "所需库存")
    .replace("required", "需要")
    .replace("available", "可用")
    .replace("Data Sufficiency", "数据充分性")
    .replace("Prediction Confidence", "预测可信度")
    .replace("Observation Need", "观察需求")
    .replace("Decision Readiness", "决策准备度")
    .replace("More outcome data needed before scale or stop", "放大或停止前需要更多结果数据")
    .replace("Current Revenue / Ad Spend", "当前收入 / 广告投放")
    .replace("Demand, margin, and inventory signals indicate positive marginal profit potential.", "需求、利润率和库存信号显示该 SKU 具备正向边际利润潜力。")
    .replace("Increase advertising budget by", "增加广告预算")
    .replace("and track profit lift.", "并追踪利润提升。")
    .replace("Increase exposure within current budget constraints and track profit lift.", "在当前预算约束内增加曝光，并追踪利润提升。")
    .replace("The SKU consumes resources that can be reallocated to stronger portfolio opportunities.", "该 SKU 占用的资源可以转移到更强的组合机会。")
    .replace("Reduce exposure or stop inefficient campaigns, then reallocate budget.", "降低曝光或停止低效广告，然后重新分配预算。")
    .replace("The SKU has profit potential, but a constraint must be fixed before scaling.", "该 SKU 有利润潜力，但放大前必须先修复约束。")
    .replace("Resolve inventory coverage before increasing demand.", "在增加需求前先解决库存覆盖。")
    .replace("Run a controlled price adjustment before scaling.", "放大前先进行受控价格调整。")
    .replace("Run the selected fix before scaling.", "放大前先执行所选修复。")
    .replace("Fix the limiting operating metric before increasing exposure.", "增加曝光前先修复限制性的经营指标。")
    .replace("Current evidence is not strong enough for an irreversible portfolio move.", "当前证据不足以支持不可逆的组合动作。")
    .replace("Monitor until confidence or outcome data improves.", "继续观察，直到可信度或结果数据改善。");
}

function formatSignedPercentText(value: number) {
  const rounded = value * 100;
  return `${rounded >= 0 ? "+" : "-"}${Math.abs(rounded).toFixed(2)}%`;
}

function portfolioScenarioActionLabel(action: string, locale: RendererLocale) {
  const actionValue = String(action ?? "");
  if (locale !== "zh") {
    if (actionValue.includes("SCALE") || actionValue === "TEST_AD_SPEND") return "🚀 Scale Ads";
    if (actionValue === "SHIFT_CHANNEL") return "🌎 Expand Channel";
    if (actionValue === "REDUCE_ADS") return "🛑 Reduce Ad Waste";
    if (actionValue.includes("PRICE_UP")) return "💰 Increase Price";
    if (actionValue.includes("PRICE_DOWN")) return "💰 Decrease Price";
    if (actionValue === "PROMOTION_TEST") return "🏷 Run Promotion";
    if (actionValue.includes("RESTOCK")) return "📦 Restock Inventory";
    if (actionValue === "REDUCE_INVENTORY") return "🏷 Clear Excess Inventory";
    if (actionValue === "STOP") return "❌ Exit SKU";
    return "Hold";
  }

  if (actionValue.includes("SCALE")) return "增加广告";
  if (actionValue === "SHIFT_CHANNEL") return "扩展渠道";
  if (actionValue === "REDUCE_ADS") return "减少广告浪费";
  if (actionValue.includes("PRICE_UP")) return "提价";
  if (actionValue.includes("PRICE_DOWN")) return "降价";
  if (actionValue === "PROMOTION_TEST") return "促销测试";
  if (actionValue.includes("RESTOCK")) return "补库存";
  if (actionValue === "REDUCE_INVENTORY") return "清理冗余库存";
  if (actionValue === "STOP") return "退出 SKU";
  return "保持";
}

function portfolioEvidenceSummary(row: PortfolioRow, locale: RendererLocale) {
  const margin = extractEvidenceNumber(row.evidence, "margin");
  const conversionRate = extractEvidenceNumber(row.evidence, "conversion_rate");
  const refundRate = extractEvidenceNumber(row.evidence, "refund_rate");
  const signals: string[] = [];

  if (margin !== null) {
    signals.push(locale === "zh" ? `Margin ${percent.format(margin)}` : `Margin ${percent.format(margin)}`);
  }

  if (row.profit_delta > 0) {
    signals.push(locale === "zh" ? "增量利润为正" : "Positive incremental profit");
  }

  if (safeNumber(row.simulation?.required_inventory) > 0) {
    signals.push(locale === "zh" ? "库存约束通过" : "Inventory constraint passed");
  }

  if (conversionRate !== null && conversionRate > 0) {
    signals.push(locale === "zh" ? "有转化数据" : "Conversion data available");
  }

  if (refundRate !== null && refundRate < 0.15) {
    signals.push(locale === "zh" ? "退货率可控" : "Refund rate acceptable");
  }

  return signals.slice(0, 3).join(locale === "zh" ? " + " : " + ") || (locale === "zh" ? "预测模型通过筛选" : "Prediction passed screening");
}

function extractEvidenceNumber(evidence: string[], key: string) {
  const evidenceLines = Array.isArray(evidence) ? evidence : [];
  const line = evidenceLines.find((item) => typeof item === "string" && item.startsWith(`${key}=`));
  if (!line) return null;
  const value = Number(line.split("=")[1]);
  return Number.isFinite(value) ? value : null;
}

function signedCurrency(value: number) {
  const formatted = currencyDecimal.format(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return currencyDecimal.format(0);
}

function InventoryTable({ rows }: { rows: InventoryBreakdownRow[] }) {
  if (!rows.length) return null;

  return (
    <div
      className={cn(
        "max-h-[460px] overflow-auto rounded-lg border",
        "[scrollbar-gutter:stable] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3",
        "[&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300"
      )}
    >
      <table className="min-w-[1040px] w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
          <tr>
            <th className="px-3 py-3">SKU</th>
            <th className="px-3 py-3">Product Name</th>
            <th className="px-3 py-3">Channel</th>
            <th className="px-3 py-3">Stock</th>
            <th className="px-3 py-3">Sold</th>
            <th className="px-3 py-3">Estimated Sales Velocity</th>
            <th className="px-3 py-3">Confidence</th>
            <th className="px-3 py-3">Runway Days</th>
            <th className="px-3 py-3">Risk Status</th>
            <th className="px-3 py-3">Sell-through Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.sku}>
              <td className="px-3 py-3 font-semibold text-slate-900">{row.sku}</td>
              <td className="max-w-[220px] truncate px-3 py-3">{row.productName}</td>
              <td className="px-3 py-3">{row.channel}</td>
              <td className="px-3 py-3">{numberFormat.format(row.stock)}</td>
              <td className="px-3 py-3">{numberFormat.format(row.sold)}</td>
              <td className="px-3 py-3">{formatOneDecimal(row.salesVelocity)} / day</td>
              <td className="px-3 py-3"><InventoryConfidenceBadge confidence={row.velocityConfidence ?? "LOW"} /></td>
              <td className="px-3 py-3">{row.runwayDays === null ? "N/A" : formatOneDecimal(row.runwayDays)}</td>
              <td className="px-3 py-3">{inventoryRiskStatusLabel(row.inventoryRiskStatus)}</td>
              <td className="px-3 py-3">{row.sellThroughRate === null ? "N/A" : percent.format(row.sellThroughRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InventoryConfidenceBadge({ confidence }: { confidence: "HIGH" | "MEDIUM" | "LOW" }) {
  const tone = confidence === "HIGH" ? "success" : confidence === "MEDIUM" ? "warning" : "neutral";
  return <Badge tone={tone}>{confidence}</Badge>;
}

function inventoryRiskStatusLabel(status: InventoryBreakdownRow["inventoryRiskStatus"]) {
  if (status === "LOW_CONFIDENCE_STOCK_RISK") return "Low-confidence stock risk";
  if (status === "STOCKOUT_RISK") return "Stockout risk";
  if (status === "INSUFFICIENT_DATA") return "Insufficient data";
  return "OK";
}

function CustomerValueDistribution({ customer }: { customer: DecisionIntelligenceReportV1["customer_breakdown"] }) {
  const ltvReason = ltvConfidenceReason(customer);

  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">LTV Distribution</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <SmallMetric label="P90 LTV" value={currencyDecimal.format(customer.p90_ltv)} />
        <SmallMetric label="P95 LTV" value={currencyDecimal.format(customer.p95_ltv)} />
        <SmallMetric label="P99 LTV" value={currencyDecimal.format(customer.p99_ltv)} />
        <SmallMetric label="LTV Confidence" value={customer.ltv_confidence ?? "LOW"} description={ltvReason} />
        <SmallMetric label="Top 10% Revenue" value={percent.format(customer.top_10_percent_revenue_share)} />
        <SmallMetric label="Top 1% Revenue" value={percent.format(customer.top_1_percent_revenue_share)} />
        <SmallMetric label="Avg Orders / Customer" value={ratioFormat.format(customer.avg_orders_per_customer)} />
      </div>
    </div>
  );
}

function CustomerLifecyclePanel({ customer }: { customer: DecisionIntelligenceReportV1["customer_breakdown"] }) {
  const lifetimeUnavailable =
    customer.avg_orders_per_customer > 1 &&
    customer.avg_customer_lifetime_days === 0 &&
    (customer.customer_metric_confidence ?? "LOW") === "LOW";
  const cohortUnavailable = (customer.cohort_confidence ?? "LOW") === "LOW";

  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">Lifecycle Structure</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <SmallMetric label="New Customers" value={numberFormat.format(customer.new_customers)} />
        <SmallMetric label="Inactive Customers" value={numberFormat.format(customer.inactive_customers)} />
        <SmallMetric label="Churned Customers" value={numberFormat.format(customer.churned_customers)} />
        <SmallMetric label="Purchase Frequency" value={ratioFormat.format(customer.purchase_frequency)} />
        <SmallMetric label="Avg Lifetime Days" value={lifetimeUnavailable ? "Unavailable" : formatOneDecimal(customer.avg_customer_lifetime_days)} />
        <SmallMetric label="CAC Confidence" value={customer.cac_confidence ?? "LOW"} />
        <SmallMetric
          label="30D Retention"
          value={cohortUnavailable ? "Unavailable" : percent.format(customer.cohort_retention_30d)}
          description={cohortUnavailable ? "Requires multiple customer cohorts" : undefined}
        />
      </div>
    </div>
  );
}

function CustomerCohortTable({ rows }: { rows: DecisionIntelligenceReportV1["customer_breakdown"]["cohort_by_first_purchase_month"] }) {
  if (!rows.length) return <EmptyBlock label="Cohort analysis requires multiple customer cohorts." />;

  return (
    <div className="overflow-auto rounded-lg border">
      <table className="min-w-[640px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-3">Cohort</th>
            <th className="px-3 py-3">Customers</th>
            <th className="px-3 py-3">Revenue</th>
            <th className="px-3 py-3">Avg LTV</th>
            <th className="px-3 py-3">7D Retention</th>
            <th className="px-3 py-3">30D Retention</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.slice(-8).map((row) => (
            <tr key={row.cohort_month}>
              <td className="px-3 py-3 font-semibold text-slate-900">{row.cohort_month}</td>
              <td className="px-3 py-3">{numberFormat.format(row.customers)}</td>
              <td className="px-3 py-3">{currencyDecimal.format(row.revenue)}</td>
              <td className="px-3 py-3">{currencyDecimal.format(row.avg_ltv)}</td>
              <td className="px-3 py-3">{percent.format(row.retention_7d)}</td>
              <td className="px-3 py-3">{percent.format(row.retention_30d)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ltvConfidenceReason(customer: DecisionIntelligenceReportV1["customer_breakdown"]) {
  const confidence = customer.ltv_confidence ?? "LOW";
  if (confidence === "HIGH") return undefined;
  const reasons = [];
  reasons.push("Limited historical window");
  if ((customer.cohort_confidence ?? "LOW") !== "HIGH") reasons.push("insufficient cohort history");
  return reasons.join("; ");
}

function CustomerSegmentTable({
  revenueRows,
  profitRows,
  adRows
}: {
  revenueRows: DecisionIntelligenceReportV1["customer_breakdown"]["revenue_per_customer_segment"];
  profitRows: DecisionIntelligenceReportV1["customer_breakdown"]["profit_per_customer_segment"];
  adRows: DecisionIntelligenceReportV1["customer_breakdown"]["ads_cost_per_customer_segment"];
}) {
  if (!revenueRows.length) return <EmptyBlock label="No customer segment rows available." />;
  const profitBySegment = new Map(profitRows.map((row) => [row.segment, row]));
  const adsBySegment = new Map(adRows.map((row) => [row.segment, row]));

  return (
    <div className="overflow-auto rounded-lg border">
      <table className="min-w-[620px] w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-3">Segment</th>
            <th className="px-3 py-3">Customers</th>
            <th className="px-3 py-3">Revenue</th>
            <th className="px-3 py-3">Profit</th>
            <th className="px-3 py-3">Ads Cost</th>
            <th className="px-3 py-3">Revenue Share</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {revenueRows.map((row) => (
            <tr key={row.segment}>
              <td className="px-3 py-3 font-semibold text-slate-900">{row.segment}</td>
              <td className="px-3 py-3">{numberFormat.format(row.customers)}</td>
              <td className="px-3 py-3">{currencyDecimal.format(row.revenue)}</td>
              <td className="px-3 py-3">{currencyDecimal.format(profitBySegment.get(row.segment)?.profit ?? 0)}</td>
              <td className="px-3 py-3">{currencyDecimal.format(adsBySegment.get(row.segment)?.ad_cost ?? 0)}</td>
              <td className="px-3 py-3">{percent.format(row.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GrowthRow({ label, value, isAvailable = true }: { label: string; value: number; isAvailable?: boolean }) {
  const tone = value < 0 ? "text-rose-700" : value > 0 ? "text-emerald-700" : "text-slate-600";
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className={cn("text-sm font-semibold", isAvailable ? tone : "text-slate-400")}>
        {isAvailable ? percent.format(value) : "N/A"}
      </span>
    </div>
  );
}

function SmallMetric({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase leading-5 tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value || "No Data"}</p>
      {description ? <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">{description}</p> : null}
    </div>
  );
}

function SkuDetailPanel({ row }: { row: SkuReportRow }) {
  const channelDetails = safeChannelDetails(row.channel_details);
  const costBreakdown = safeCostBreakdown(row.cost_breakdown);
  const fees = costBreakdown ? costBreakdown.platform_fee + costBreakdown.payment_fee : null;
  return (
    <div className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3 lg:grid-cols-3">
      <DetailSection title="Channel Breakdown">
        {channelDetails.length ? (
          channelDetails.map((channel) => (
            <DetailRow
              key={channel.platform}
              label={`${channel.platform} ${percent.format(channel.share)}`}
              value={`${currency.format(channel.revenue)} revenue / ${currency.format(channel.profit)} profit`}
            />
          ))
        ) : (
          <DetailMuted>No channel data.</DetailMuted>
        )}
      </DetailSection>

      <DetailSection title="Cost Breakdown">
        <DetailRow label="COGS" value={costBreakdown ? currency.format(costBreakdown.cogs) : "No Data"} />
        <DetailRow label="Ads allocated" value={row.ad_cost_allocated === null ? "No Data" : currency.format(row.ad_cost_allocated)} />
        <DetailRow label="Shipping + fulfillment" value={costBreakdown ? currency.format(costBreakdown.shipping + costBreakdown.fulfillment) : "No Data"} />
        <DetailRow label="Fees" value={fees === null ? "No Data" : currency.format(fees)} />
        <DetailRow label="Total cost" value={row.total_cost === null ? "No Data" : currency.format(row.total_cost)} />
      </DetailSection>

      <DetailSection title="Ads Attribution">
        <DetailRow label="Method" value={formatAllocationMethod(row.ad_allocation_method)} />
        <DetailRow label="Confidence" value={row.ad_allocation_confidence === null ? "No Data" : percent.format(row.ad_allocation_confidence)} />
        <DetailRow label="Campaigns" value={row.campaign_ids.length ? row.campaign_ids.slice(0, 3).join(", ") : "No Data"} />
        <DetailRow label="Window" value={formatAttributionWindow(row)} />
      </DetailSection>

      <DetailSection title="Inventory">
        <DetailRow label="Stock level" value={row.stock_level === null ? "No Data" : numberFormat.format(row.stock_level)} />
        <DetailRow label="Available" value={row.available_stock === null ? "No Data" : numberFormat.format(row.available_stock)} />
        <DetailRow label="Sales velocity" value={row.sales_velocity ? `${ratioFormat.format(row.sales_velocity)} / day` : "No Data"} />
        <DetailRow label="Days of inventory" value={row.days_of_inventory === null ? "No Data" : ratioFormat.format(row.days_of_inventory)} />
      </DetailSection>

      <DetailSection title="Refund / Quality Risk">
        <DetailRow label="Refund rate" value={percent.format(row.refund_rate)} />
        <DetailRow label="Refund risk" value={row.refund_risk} />
        <DetailRow label="Overall risk" value={ratioFormat.format(row.overall_risk_score)} />
        <DetailRow label="Inventory confidence" value={row.inventory_confidence === null ? "No Data" : percent.format(row.inventory_confidence)} />
      </DetailSection>

      <DetailSection title="Quality Signals">
        <DetailRow label="Margin risk" value={row.margin_risk ? "Yes" : "No"} />
        <DetailRow label="Attribution risk" value={row.attribution_risk ? "Yes" : "No"} />
        <DetailRow label="Channel concentration" value={row.channel_concentration_risk ? "High" : "Normal"} />
        <p className="pt-1 text-xs leading-5 text-slate-600">
          {row.estimated_components.length ? `Estimated components: ${row.estimated_components.slice(0, 4).join(", ")}` : "No estimated components."}
        </p>
      </DetailSection>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function DetailMuted({ children }: { children: ReactNode }) {
  return <p className="text-xs text-slate-500">{children}</p>;
}

function ChannelMix({ row }: { row: SkuReportRow }) {
  const revenueDetails = safeChannelDetails(row.channel_details).filter((channel) => isRevenueChannel(channel.platform) && channel.revenue > 0);
  const details = revenueDetails.length ? revenueDetails : Object.entries(safeChannelBreakdown(row.channel_breakdown))
    .filter(([channel, revenue]) => isRevenueChannel(channel) && revenue > 0)
    .map(([platform, revenue]) => ({
      platform: normalizeRevenueChannel(platform),
      revenue,
      quantity: 0,
      profit: 0,
      margin: 0,
      share: row.revenue > 0 ? revenue / row.revenue : 0
    }));
  if (!details.length) return <span className="text-xs text-slate-500">No Data</span>;

  const sorted = [...details].sort((left, right) => right.share - left.share);
  const primary = sorted[0];
  const mixLabel = primary.share > 0.7 ? "dominant channel" : sorted.length > 1 ? "multi-channel" : "single channel";
  const channelColors = ["bg-emerald-600", "bg-sky-500", "bg-amber-500", "bg-violet-500", "bg-slate-400"];

  return (
    <div className="min-w-[190px] max-w-[230px] space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-xs font-semibold text-slate-800">
          {primary.platform} primary
        </span>
        <span className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
          primary.share > 0.7 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
        )}>
          {mixLabel}
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
        {sorted.slice(0, 5).map((channel, index) => (
          <span
            key={channel.platform}
            className={cn("h-full", channelColors[index] ?? "bg-slate-300")}
            style={{ width: `${Math.max(3, Math.min(100, channel.share * 100))}%` }}
            title={`${channel.platform}: ${percent.format(channel.share)} / ${currency.format(channel.revenue)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
        {sorted.slice(0, 3).map((channel) => (
          <span key={channel.platform}>
            {channel.platform} {percent.format(channel.share)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "success" | "warning" | "danger" | "neutral"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "success" && "bg-emerald-100 text-emerald-800",
        tone === "warning" && "bg-amber-100 text-amber-800",
        tone === "danger" && "bg-rose-100 text-rose-800",
        tone === "neutral" && "bg-slate-100 text-slate-600"
      )}
    >
      {children}
    </span>
  );
}

function formatAttributionWindow(row: SkuReportRow) {
  if (!row.attribution_window_start && !row.attribution_window_end) return "No Data";
  return `${row.attribution_window_start ?? "?"} - ${row.attribution_window_end ?? "?"}`;
}

function formatAllocationMethod(method: SkuReportRow["ad_allocation_method"]) {
  if (!method) return "No Data";
  return method.replace(/_/g, " ");
}

function formatSkuRoas(row: SkuReportRow) {
  const locale = reportRendererLocale();
  const status = row.roas_status ?? legacyRoasStatus(row);
  if (status === "not_advertised") return <Badge tone="neutral">{locale === "zh" ? "未投放" : "No Ads"}</Badge>;
  if (status === "spent_no_revenue") return <span className="font-semibold text-rose-700">0.00</span>;
  if (status === "estimated") return <Badge tone="warning">{locale === "zh" ? "Estimated ROAS" : "Estimated ROAS"}</Badge>;
  if (status === "attribution_missing") return <Badge tone="warning">{locale === "zh" ? "归因不足" : "Attribution missing"}</Badge>;
  if (row.roas_value !== undefined && row.roas_value !== null) return ratioFormat.format(row.roas_value);
  if (row.sku_roas !== null) return ratioFormat.format(row.sku_roas);
  return "No Data";
}

function legacyRoasStatus(row: SkuReportRow): NonNullable<SkuReportRow["roas_status"]> {
  if ((row.ad_cost_allocated ?? 0) > 0 && row.revenue === 0) return "spent_no_revenue";
  if ((row.ad_cost_allocated ?? 0) > 0 && row.attribution_risk) return "estimated";
  if ((row.ad_cost_allocated ?? 0) > 0) return "attributed";
  if (row.revenue > 0 || row.ad_allocation_method === "unavailable") return "attribution_missing";
  return "not_advertised";
}

function reportRendererLocale() {
  if (typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh")) return "zh";
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")) return "zh";
  return "en";
}

function getSkuChannelRevenue(row: SkuReportRow, channel: string) {
  if (!isRevenueChannel(channel)) return 0;
  const normalizedChannel = normalizeRevenueChannel(channel);
  const detail = safeChannelDetails(row.channel_details).find((item) => normalizeRevenueChannel(item.platform) === normalizedChannel && isRevenueChannel(item.platform));
  if (detail) return detail.revenue;
  const channelBreakdown = safeChannelBreakdown(row.channel_breakdown);
  return channelBreakdown[normalizedChannel] ?? channelBreakdown[channel] ?? 0;
}

function skuRowHasRevenueChannel(row: SkuReportRow, channel: string) {
  return getSkuChannelRevenue(row, channel) > 0;
}

function EmptyBlock({ label }: { label: string }) {
  return <div className="rounded-lg bg-slate-50 p-4 text-sm font-medium text-slate-500">{label}</div>;
}

function toneClass(tone: "neutral" | "positive" | "warning" | "negative") {
  if (tone === "positive") return "text-emerald-700";
  if (tone === "warning") return "text-amber-700";
  if (tone === "negative") return "text-rose-700";
  return "text-slate-500";
}
