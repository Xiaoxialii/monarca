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
import type { DecisionIntelligenceReportV1 } from "@/lib/decision-intelligence/decision-intelligence-engine";
import { cn } from "@/lib/utils";

type ReportRendererEngineProps = {
  report: DecisionIntelligenceReportV1 | null;
  message?: string;
  showEmptyShell?: boolean;
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
  runwayDays: number | null;
  sellThroughRate: number | null;
};

type InventorySummary = {
  totalStock: number;
  totalSold: number;
  salesVelocity: number;
  averageRunwayDays: number | null;
};

function buildSkuReportRows(report: DecisionIntelligenceReportV1): SkuReportRow[] {
  const profitBySku = new Map(report.sku_breakdown.top_profit_skus.map((row) => [row.sku, row]));

  return report.sku_breakdown.top_revenue_skus.map((row) => {
    const profit = profitBySku.get(row.sku);
    return {
      sku: row.sku,
      product_name: displayProductName(row.product_name ?? profit?.product_name, row.sku),
      category: row.category ?? profit?.category,
      variant_name: row.variant_name ?? profit?.variant_name,
      size: row.size ?? profit?.size,
      color: row.color ?? profit?.color,
      revenue: row.revenue,
      quantity: row.quantity,
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
      channel_breakdown: profit?.channel_breakdown ?? {},
      channel_details: profit?.channel_details ?? [],
      ad_allocation_method: profit?.ad_allocation_method ?? null,
      ad_allocation_confidence: profit?.ad_allocation_confidence ?? null,
      campaign_ids: profit?.campaign_ids ?? [],
      attribution_window_start: profit?.attribution_window_start ?? null,
      attribution_window_end: profit?.attribution_window_end ?? null,
      cost_breakdown: profit?.cost_breakdown ?? null,
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
      estimated: profit?.estimated === true
    };
  });
}

export function ReportRendererEngine({ report, message, showEmptyShell = false, locale = "en" }: ReportRendererEngineProps) {
  const [skuChannel, setSkuChannel] = useState("all");
  const [inventorySearch, setInventorySearch] = useState("");
  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  const skuRows = useMemo(() => {
    if (!report) return [];

    const profitBySku = new Map(report.sku_breakdown.top_profit_skus.map((row) => [row.sku, row]));

    return report.sku_breakdown.top_revenue_skus.map((row) => {
      const profit = profitBySku.get(row.sku);
      return {
        sku: row.sku,
        product_name: displayProductName(row.product_name ?? profit?.product_name, row.sku),
        category: row.category ?? profit?.category,
        variant_name: row.variant_name ?? profit?.variant_name,
        size: row.size ?? profit?.size,
        color: row.color ?? profit?.color,
        revenue: row.revenue,
        quantity: row.quantity,
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
        channel_breakdown: profit?.channel_breakdown ?? {},
        channel_details: profit?.channel_details ?? [],
        ad_allocation_method: profit?.ad_allocation_method ?? null,
        ad_allocation_confidence: profit?.ad_allocation_confidence ?? null,
        campaign_ids: profit?.campaign_ids ?? [],
        attribution_window_start: profit?.attribution_window_start ?? null,
        attribution_window_end: profit?.attribution_window_end ?? null,
        cost_breakdown: profit?.cost_breakdown ?? null,
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
        estimated: profit?.estimated === true
      };
    });
  }, [report]);

  const visibleSkuRows = useMemo(() => {
    return skuRows
      .filter((row) => skuChannel === "all" || row.channel_details.some((channel) => channel.platform === skuChannel) || row.channel_breakdown[skuChannel] > 0)
      .sort((a, b) => {
        const aRankValue = skuChannel === "all" ? a.revenue : getSkuChannelRevenue(a, skuChannel);
        const bRankValue = skuChannel === "all" ? b.revenue : getSkuChannelRevenue(b, skuChannel);
        return bRankValue - aRankValue || b.revenue - a.revenue || a.sku.localeCompare(b.sku);
      });
  }, [skuRows, skuChannel]);

  const skuChannelTags = useMemo(() => {
    const channels = new Set<string>();
    for (const row of skuRows) {
      for (const channel of row.channel_details) channels.add(channel.platform);
      for (const channel of Object.keys(row.channel_breakdown)) channels.add(channel);
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
      return <OperatingReportEmptyShell locale={locale} />;
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

  const performance = report.performance_overview;
  const summary = report.executive_summary;

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
          value={performance.cac ? formatKpiCurrency(performance.cac) : "No Data"}
          fullValue={performance.cac ? currencyDecimal.format(performance.cac) : undefined}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LineChartIcon className="size-4 text-emerald-700" />
              Performance Overview
            </CardTitle>
            <CardDescription>Revenue and order movement from report growth series.</CardDescription>
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
            <CardDescription>Growth signals calculated by the Metric Engine.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <GrowthRow label="Revenue growth" value={report.growth_overview.revenue_growth_rate} />
            <GrowthRow label="Order growth" value={report.growth_overview.order_growth_rate} />
            <GrowthRow label="SKU growth" value={report.growth_overview.sku_growth_rate} />
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
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SmallMetric label="Total Stock" value={numberFormat.format(inventorySummary.totalStock)} />
              <SmallMetric label="Total Sold" value={numberFormat.format(inventorySummary.totalSold)} />
              <SmallMetric label="Sales Velocity" value={`${formatOneDecimal(inventorySummary.salesVelocity)} / day`} />
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
            <CardDescription>Campaign spend, revenue, and ROAS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <SmallMetric label="Spend" value={currency.format(report.ads_breakdown.ad_spend)} />
              <SmallMetric label="ROAS" value={ratioFormat.format(report.ads_breakdown.roas)} />
              <SmallMetric label="MER" value={ratioFormat.format(report.ads_breakdown.mer)} />
            </div>
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
              <SmallMetric label="LTV / CAC" value={ratioFormat.format(report.customer_breakdown.ltv_cac_ratio)} />
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

function OperatingReportEmptyShell({ locale }: { locale: RendererLocale }) {
  const isZh = locale === "zh";

  return (
    <div id="report-sku" className="grid min-h-[520px] w-full place-items-center bg-transparent px-6 text-center scroll-mt-24">
      <p className="max-w-5xl text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-6xl">
        {isZh ? "连接你的数据，追踪实时利润" : "Connect your data to track real-time profit"}
      </p>
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
  tone = "neutral"
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  fullValue?: string;
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
      runwayDays,
      sellThroughRate: sellThroughBase > 0 ? sold / sellThroughBase : null
    };
  });
}

function summarizeInventoryRows(rows: InventoryBreakdownRow[]): InventorySummary {
  const totalStock = rows.reduce((total, row) => total + row.stock, 0);
  const totalSold = rows.reduce((total, row) => total + row.sold, 0);
  const salesVelocity = rows.reduce((total, row) => total + row.salesVelocity, 0);
  const runwayRows = rows.filter((row) => row.runwayDays !== null);
  const averageRunwayDays = runwayRows.length
    ? runwayRows.reduce((total, row) => total + (row.runwayDays ?? 0), 0) / runwayRows.length
    : null;

  return { totalStock, totalSold, salesVelocity, averageRunwayDays };
}

function primaryInventoryChannel(row: SkuReportRow) {
  if (row.channel_details.length > 1) return "multi-channel";
  if (row.channel_details.length === 1) return row.channel_details[0].platform || "unknown";
  const channels = Object.entries(row.channel_breakdown).filter(([, revenue]) => revenue > 0);
  if (channels.length > 1) return "multi-channel";
  return channels[0]?.[0] || "unknown";
}

function formatOneDecimal(value: number) {
  return oneDecimal.format(Number.isFinite(value) ? value : 0);
}

function TimeSeriesChart({ rows }: { rows: DecisionIntelligenceReportV1["growth_overview"]["daily"] }) {
  if (!rows.length) {
    return <EmptyBlock label="No time series rows." />;
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
  onToggleExpanded
}: {
  rows: SkuReportRow[];
  channelTags: string[];
  selectedChannel: string;
  onChannelChange: (value: string) => void;
  expandedSku: string | null;
  onToggleExpanded: (sku: string) => void;
}) {
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef({ active: false, startX: 0, startScrollLeft: 0 });
  const [isDraggingTable, setIsDraggingTable] = useState(false);

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
  }, [expandedSku, rows]);

  return (
    <div className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2">
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
      </div>
      {!rows.length ? <EmptyBlock label="No SKU rows match this channel or search." /> : null}
      <div
        ref={tableScrollRef}
        onMouseDown={startTableDrag}
        onMouseMove={moveTableDrag}
        onMouseUp={stopTableDrag}
        onMouseLeave={stopTableDrag}
        className={cn(
          "relative max-h-[560px] w-full max-w-full min-w-0 overflow-x-scroll overflow-y-auto bg-white",
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
            {rows.map((row, index) => {
              const lowMargin = row.margin !== null && row.margin < 0.1;
              const isExpanded = expandedSku === row.sku;
              const fees = row.cost_breakdown ? row.cost_breakdown.platform_fee + row.cost_breakdown.payment_fee : null;
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
                          <span className="block truncate">{row.product_name || row.sku}</span>
                          {row.product_name ? <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">{row.sku}</span> : null}
                        </span>
                      </button>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.category ? <Badge tone="neutral">{row.category}</Badge> : null}
                        {row.variant_name ? <Badge tone="neutral">{row.variant_name}</Badge> : null}
                        {row.size ? <Badge tone="neutral">Size {row.size}</Badge> : null}
                        {row.color ? <Badge tone="neutral">{row.color}</Badge> : null}
                        {row.estimated ? <Badge tone="warning">estimated</Badge> : null}
                        {row.attribution_risk ? <Badge tone="warning">attribution fallback</Badge> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">{currency.format(row.revenue)}</td>
                    <td className="px-3 py-3"><ChannelMix row={row} /></td>
                    <td className="px-3 py-3">{numberFormat.format(row.quantity)}</td>
                    <td className="px-3 py-3">{row.stock_level === null ? "No Data" : numberFormat.format(row.stock_level)}</td>
                    <td className="px-3 py-3">{row.cost_breakdown ? currency.format(row.cost_breakdown.cogs) : "No Data"}</td>
                    <td className="px-3 py-3">{row.ad_cost_allocated === null ? "No Data" : currency.format(row.ad_cost_allocated)}</td>
                    <td className="px-3 py-3">{row.cost_breakdown ? currency.format(row.cost_breakdown.shipping + row.cost_breakdown.fulfillment) : "No Data"}</td>
                    <td className="px-3 py-3">{fees === null ? "No Data" : currency.format(fees)}</td>
                    <td className="px-3 py-3">{row.total_cost === null ? "No Data" : currency.format(row.total_cost)}</td>
                    <td className={cn("px-3 py-3", row.profit !== null && row.profit < 0 && "font-semibold text-rose-700")}>
                      {row.profit === null ? "No Data" : currency.format(row.profit)}
                    </td>
                    <td className={cn("px-3 py-3", lowMargin && "font-semibold text-rose-700")}>
                      {row.margin === null ? "No Data" : percent.format(row.margin)}
                    </td>
                    <td className="px-3 py-3">{formatSkuRoas(row)}</td>
                  </tr>
                  {isExpanded ? (
                    <tr key={`${row.sku}-details`} className="bg-white">
                      <td colSpan={13} className="px-5 py-4">
                        <SkuDetailPanel row={row} />
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
            <th className="px-3 py-3">Revenue</th>
            <th className="px-3 py-3">ROAS</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.slice(0, 8).map((row) => (
            <tr key={row.campaign_id} className={row.roas < 1 ? "bg-amber-50/60" : undefined}>
              <td className="max-w-[180px] truncate px-3 py-3 font-semibold text-slate-900">{row.campaign_id}</td>
              <td className="px-3 py-3">{currency.format(row.ad_spend)}</td>
              <td className="px-3 py-3">{currency.format(row.revenue)}</td>
              <td className={cn("px-3 py-3", row.roas < 1 ? "font-semibold text-amber-800" : "text-emerald-800")}>{ratioFormat.format(row.roas)}</td>
            </tr>
          ))}
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

export function DecisionAnalysisEnginePanel({
  report,
  message,
  locale = "en",
  headerAction,
  optimizationStarted = true,
  onStartProfitOptimization,
  isLoadingOptimization = false,
  showSkuTableEmptyState = false,
  showInitialShell = false
}: {
  report: DecisionIntelligenceReportV1 | null;
  message?: string;
  locale?: RendererLocale;
  headerAction?: ReactNode;
  optimizationStarted?: boolean;
  onStartProfitOptimization?: () => void | Promise<void>;
  isLoadingOptimization?: boolean;
  showSkuTableEmptyState?: boolean;
  showInitialShell?: boolean;
}) {
  const isZh = locale === "zh";

  if (!report) {
    if (showSkuTableEmptyState || showInitialShell) {
      return (
        <InitialProfitOptimizationShell
          locale={locale}
          headerAction={headerAction}
          showSkuTableEmptyState={showSkuTableEmptyState}
          isLoadingOptimization={isLoadingOptimization}
          onStartProfitOptimization={showSkuTableEmptyState ? undefined : onStartProfitOptimization}
        />
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
        showSkuTableEmptyState={showSkuTableEmptyState}
      />
    </section>
  );
}

function InitialProfitOptimizationShell({
  locale,
  headerAction,
  showSkuTableEmptyState,
  isLoadingOptimization,
  onStartProfitOptimization
}: {
  locale: RendererLocale;
  headerAction?: ReactNode;
  showSkuTableEmptyState: boolean;
  isLoadingOptimization: boolean;
  onStartProfitOptimization?: () => void | Promise<void>;
}) {
  const isZh = locale === "zh";

  return (
    <section className="min-w-0 scroll-mt-24">
      <div className="space-y-5 bg-transparent">
        <div className="sticky top-0 z-30 py-4">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]" />
              {isZh ? "实时组合监控" : "Live Portfolio Monitor"}
            </div>
            {headerAction ?? <span className="text-xs font-medium text-slate-500">{isZh ? "加载中" : "Loading"}</span>}
          </div>
          {!showSkuTableEmptyState ? (
            <div className="grid gap-0 xl:grid-cols-2">
              <div className="min-w-0 px-5 py-3 xl:order-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isZh ? "当前组合" : "Current Portfolio"}</p>
                <p className="mt-3 break-words text-[42px] font-bold leading-none text-slate-950">0 SKUs</p>
                <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-2">
                  <span>{isZh ? "当前预计利润" : "Estimated Profit"}: $0.00</span>
                  <span>{isZh ? "广告预算" : "Ad Spend"}: $0.00</span>
                </div>
              </div>
              <div className="min-w-0 px-5 py-3 xl:order-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{isZh ? "推荐优化" : "Recommended Optimization"}</p>
                <p className="mt-3 break-words text-[42px] font-bold leading-none text-emerald-950">0 SKUs</p>
                <div className="mt-4 text-sm font-semibold text-emerald-900">
                  <span>{isZh ? "预计提升" : "Impact"}: +$0.00 / +0.00%</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="grid items-stretch gap-0 xl:grid-cols-[390px_6px_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3 p-4 xl:order-1 xl:p-5">
            <div className="grid min-h-[360px] place-items-center rounded-lg bg-transparent p-0">
              <div className="text-center">
                <div className="space-y-5">
                  <p className="text-lg font-bold text-slate-950">
                    {isZh ? "开始利润优化" : "Start profit optimization"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (!showSkuTableEmptyState) void onStartProfitOptimization?.();
                    }}
                    disabled={isLoadingOptimization}
                    className="inline-grid size-12 place-items-center rounded-lg bg-[#079669] text-white shadow-sm shadow-[rgba(7,150,105,0.15)] transition hover:bg-[#067f5a] disabled:cursor-not-allowed disabled:opacity-70"
                    aria-label={isZh ? "打开 AI 利润优化任务表" : "Open AI profit optimization tasks"}
                  >
                    {isLoadingOptimization ? <RefreshCw className="size-5 animate-spin" /> : <ChevronRight className="size-6" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="hidden min-h-full self-stretch bg-emerald-100/45 xl:order-2 xl:block" aria-hidden="true" />
          <div className="min-w-0 space-y-4 xl:order-3">
            <div className="flex w-full flex-wrap items-center gap-2 rounded-full bg-slate-100 p-1">
              <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm ring-1 ring-emerald-200">
                {isZh ? "SKU 经营数据" : "SKU operating data"}
              </span>
              <span className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500">
                {isZh ? "SKU 优化智能" : "SKU optimization intelligence"}
              </span>
            </div>
            <div className="min-w-0 overflow-hidden rounded-lg border bg-white">
              <EmptySkuProfitPortfolioTable locale={locale} />
            </div>
          </div>
        </div>
      </div>
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
  showSkuTableEmptyState = false
}: {
  report: DecisionIntelligenceReportV1;
  locale: RendererLocale;
  headerAction?: ReactNode;
  optimizationStarted?: boolean;
  onStartProfitOptimization?: () => void | Promise<void>;
  isLoadingOptimization?: boolean;
  showSkuTableEmptyState?: boolean;
}) {
  const isZh = locale === "zh";
  const optimization = report.sku_portfolio_optimization;
  const summary = optimization.optimization_summary;
  const selectedRows = optimization.recommended_portfolio;
  const [skuChannel, setSkuChannel] = useState("all");
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const skuRows = useMemo(() => buildSkuReportRows(report), [report]);
  const visibleSkuRows = useMemo(() => {
    return skuRows
      .filter((row) => skuChannel === "all" || row.channel_details.some((channel) => channel.platform === skuChannel) || row.channel_breakdown[skuChannel] > 0)
      .sort((a, b) => {
        const aRankValue = skuChannel === "all" ? a.revenue : getSkuChannelRevenue(a, skuChannel);
        const bRankValue = skuChannel === "all" ? b.revenue : getSkuChannelRevenue(b, skuChannel);
        return bRankValue - aRankValue || b.revenue - a.revenue || a.sku.localeCompare(b.sku);
      });
  }, [skuRows, skuChannel]);
  const skuChannelTags = useMemo(() => {
    const channels = new Set<string>();
    for (const row of skuRows) {
      for (const channel of row.channel_details) channels.add(channel.platform);
      for (const channel of Object.keys(row.channel_breakdown)) channels.add(channel);
    }
    return ["all", ...Array.from(channels).filter(Boolean).sort()];
  }, [skuRows]);
  const decisionRows = optimization.skuDecisions ?? report.skuDecisions ?? [];
  const portfolioRowsBySku = new Map(selectedRows.map((row) => [row.sku, row]));
  const sourceRows = report.sku_breakdown.top_profit_skus.length ? report.sku_breakdown.top_profit_skus : report.sku_breakdown.top_revenue_skus;
  const sourceSkuIds = sourceRows.length
    ? sourceRows.map((row) => row.sku)
    : Array.from(new Set(optimization.simulations.map((row) => row.sku)));
  const currentSkuCount = sourceRows.length || summary.input_sku_count || sourceSkuIds.length;
  const liftRate = summary.current_portfolio_profit > 0 ? optimization.total_expected_profit_gain / summary.current_portfolio_profit : 0;
  const simulationHorizonDays = summary.simulation_horizon_days ?? optimization.recommended_portfolio[0]?.simulation_horizon?.days ?? 30;
  const [actionStatuses, setActionStatuses] = useState<Record<string, "pending" | "accepted" | "rejected">>({});
  const [acceptedAtByDecision, setAcceptedAtByDecision] = useState<Record<string, string>>({});
  const [trackedOutcomeRows, setTrackedOutcomeRows] = useState<ActionOutcomeRow[]>(seedActionOutcomeRows);
  const [selectedOutcomeRow, setSelectedOutcomeRow] = useState<ActionOutcomeRow | null>(null);
  const [selectedDecisionRow, setSelectedDecisionRow] = useState<PortfolioDecisionRow | null>(null);
  const [isSkuOperationsOpen, setIsSkuOperationsOpen] = useState(true);
  const wasLoadingOptimizationRef = useRef(isLoadingOptimization);
  const decisionActionFilter: PortfolioDecisionFilter = "ALL";
  const optimizationQueueRows = decisionRows.filter((row) => isOptimizationQueueRow(row));
  const filteredDecisionRows = (optimizationQueueRows.length ? optimizationQueueRows : decisionRows)
    .filter((row) => decisionFilterMatchesRow(row, decisionActionFilter));
  const pendingDecisionRows = filteredDecisionRows.filter((row) => {
    const status = actionStatuses[decisionRowKey(row)];
    return status !== "accepted" && status !== "rejected";
  });
  const pendingOptimizationCount = optimizationStarted ? pendingDecisionRows.length : 0;
  const displayedCurrentSkuCount = showSkuTableEmptyState ? 0 : currentSkuCount;
  const displayedCurrentProfit = showSkuTableEmptyState ? 0 : summary.current_portfolio_profit;
  const displayedAdsBudget = showSkuTableEmptyState ? 0 : summary.ads_budget_used;
  const displayedPendingOptimizationCount = showSkuTableEmptyState ? 0 : pendingOptimizationCount;
  const displayedExpectedProfitGain = showSkuTableEmptyState ? 0 : optimization.total_expected_profit_gain;
  const displayedLiftRate = showSkuTableEmptyState ? 0 : liftRate;
  const displayedPendingDecisionRows = showSkuTableEmptyState ? [] : pendingDecisionRows;
  const selectedDecision = !showSkuTableEmptyState && selectedDecisionRow && filteredDecisionRows.some((row) => decisionRowKey(row) === decisionRowKey(selectedDecisionRow))
    ? selectedDecisionRow
    : null;

  useEffect(() => {
    if (wasLoadingOptimizationRef.current && !isLoadingOptimization && optimizationStarted) {
      setIsSkuOperationsOpen(true);
    }
    wasLoadingOptimizationRef.current = isLoadingOptimization;
  }, [isLoadingOptimization, optimizationStarted]);

  const selectOptimizationQueueRow = (row: PortfolioDecisionRow) => {
    setSelectedDecisionRow((current) => current && decisionRowKey(current) === decisionRowKey(row) ? null : row);
    setSkuChannel("all");
    setExpandedSku(row.skuId);
  };

  const acceptDecisionAction = async (row: PortfolioDecisionRow) => {
    const recommendation = portfolioRowsBySku.get(row.skuId);
    setActionStatuses((current) => ({ ...current, [decisionRowKey(row)]: "accepted" }));
    setAcceptedAtByDecision((current) => ({ ...current, [decisionRowKey(row)]: todayDateOnly() }));
    if (recommendation) {
      setTrackedOutcomeRows((current) => upsertOutcomeRow(current, portfolioRowToOutcomeRow(recommendation, locale)));
    }

    await fetch("/api/actions/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: row.skuId,
        lifecycle_stage: row.lifecycle_stage,
        action_type: row.action,
        action_payload: {
          action: row.sourceAction,
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
          ad_spend: recommendation.simulation.current_ads_spend
        } : {},
        predicted_metrics: recommendation ? {
          profit: recommendation.predicted_profit,
          revenue: recommendation.simulation.predicted_revenue,
          ad_spend: recommendation.simulation.recommended_ads_spend
        } : {
          profit_delta: row.expectedProfitImpact ?? row.estimatedProfitImpact
        },
        observation_window_days: row.simulation_horizon?.days ?? simulationHorizonDays,
        confidence_score: row.confidence
      })
    }).catch(() => null);
  };

  const rejectDecisionAction = async (row: PortfolioDecisionRow) => {
    setActionStatuses((current) => ({ ...current, [decisionRowKey(row)]: "rejected" }));
    await fetch("/api/actions/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: row.skuId,
        action_type: row.action
      })
    }).catch(() => null);
  };

  const openDecisionIntelligence = () => {
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

  return (
	    <div className="space-y-5 bg-transparent">
	      <div className="sticky top-0 z-30 py-4">
	        <div className="mb-3 flex items-center justify-between gap-3 px-1">
	          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
	            <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]" />
	            {isZh ? "实时组合监控" : "Live Portfolio Monitor"}
	          </div>
	          {headerAction ?? <span className="text-xs font-medium text-slate-500">{isZh ? "实时更新" : "Live update"}</span>}
	        </div>
	        <div className="grid gap-0 xl:grid-cols-2">
	          <div className="min-w-0 px-5 py-3 xl:order-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isZh ? "当前组合" : "Current Portfolio"}</p>
            <p className="mt-3 break-words text-[42px] font-bold leading-none text-slate-950">{numberFormat.format(displayedCurrentSkuCount)} SKUs</p>
            <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-2">
              <span>{isZh ? "当前预计利润" : "Estimated Profit"}: {currencyDecimal.format(displayedCurrentProfit)}</span>
              <span>{isZh ? "广告预算" : "Ad Spend"}: {currencyDecimal.format(displayedAdsBudget)}</span>
            </div>
          </div>
	          <div className="min-w-0 px-5 py-3 xl:order-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{isZh ? "推荐优化" : "Recommended Optimization"}</p>
            <p className="mt-3 break-words text-[42px] font-bold leading-none text-emerald-950">{numberFormat.format(displayedPendingOptimizationCount)} SKUs</p>
            <div className="mt-4 text-sm font-semibold text-emerald-900">
              <span>
                {optimizationStarted
                  ? `${isZh ? "预计提升" : "Impact"}: +${currencyDecimal.format(displayedExpectedProfitGain)} / +${percent.format(displayedLiftRate)}`
                  : (isZh ? "点击 Start 后生成优化方案" : "Start to generate optimization plan")}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-5">
        <div className="min-w-0 space-y-5">
		      <div className="grid items-stretch gap-0 xl:grid-cols-[390px_6px_minmax(0,1fr)]">
		        <div className="min-w-0 space-y-3 p-4 xl:order-3 xl:p-5">
          <div className="flex w-full flex-wrap items-center gap-2 rounded-full bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setIsSkuOperationsOpen(true)}
              className={cn(
                "inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200",
                isSkuOperationsOpen ? "bg-white text-slate-950 shadow-sm ring-1 ring-emerald-200" : "bg-transparent text-slate-500 hover:text-slate-800"
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
                "rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200",
                !isSkuOperationsOpen ? "bg-white text-slate-950 shadow-sm ring-1 ring-emerald-200" : "bg-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              {isZh ? "SKU 优化智能" : "SKU optimization intelligence"}
            </button>
          </div>
        {isSkuOperationsOpen ? (
          <div className="min-w-0 overflow-hidden rounded-lg border bg-white">
            {showSkuTableEmptyState ? (
              <EmptySkuProfitPortfolioTable locale={locale} />
            ) : (
              <SkuBreakdownTable
                rows={visibleSkuRows}
                channelTags={skuChannelTags}
                selectedChannel={skuChannel}
                onChannelChange={setSkuChannel}
                expandedSku={expandedSku}
                onToggleExpanded={(sku) => setExpandedSku((current) => current === sku ? null : sku)}
              />
            )}
          </div>
        ) : (
          <div className="min-w-0 rounded-lg border bg-white p-3 shadow-sm shadow-slate-950/5">
            {isLoadingOptimization ? (
              <div className="grid min-h-[520px] place-items-center rounded-md bg-white text-center">
                <div className="space-y-3">
                  <RefreshCw className="mx-auto size-7 animate-spin text-emerald-700" />
                  <p className="text-sm font-semibold text-slate-600">
                    {isZh ? "正在生成利润优化方案..." : "Generating profit optimization plan..."}
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
                      const currentProfit = recommendation?.current_profit ?? null;
                      const expectedProfitImpact = row.expectedProfitImpact ?? row.estimatedProfitImpact;
                      const expectedLiftRate = currentProfit && currentProfit > 0 ? expectedProfitImpact / currentProfit : null;
                      return (
                        <tr
                          key={`${row.skuId}-${row.action}-${row.sourceAction}`}
                          className={cn(
                            "cursor-pointer transition hover:bg-emerald-50/35",
                            isSelected && "bg-emerald-50/70 ring-1 ring-inset ring-emerald-200"
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
                              {(row.recommendedActions ?? row.recommendedExecution ?? [portfolioScenarioActionLabel(row.sourceAction, locale)])[0]}
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

        <div className="min-w-0 space-y-4 xl:order-1">
	        <div className={cn(
            "min-w-0 space-y-4 rounded-lg",
            isSkuOperationsOpen ? "grid min-h-[360px] place-items-center bg-transparent p-0" : "border border-emerald-200 bg-emerald-50/80 p-3 shadow-xl shadow-emerald-950/5"
          )}>
            {isSkuOperationsOpen && (showSkuTableEmptyState || !optimizationStarted || isLoadingOptimization) ? (
              <div className="text-center">
                <div className="space-y-5">
                  <p className="text-lg font-bold text-slate-950">
                    {isZh ? "开始利润优化" : "Start profit optimization"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (showSkuTableEmptyState) return;
                      setIsSkuOperationsOpen(false);
                      void onStartProfitOptimization?.();
                    }}
                    disabled={isLoadingOptimization}
                    className="inline-grid size-12 place-items-center rounded-lg bg-[#079669] text-white shadow-sm shadow-[rgba(7,150,105,0.15)] transition hover:bg-[#067f5a]"
                    aria-label={isZh ? "打开 AI 利润优化任务表" : "Open AI profit optimization tasks"}
                  >
                    {isLoadingOptimization ? <RefreshCw className="size-5 animate-spin" /> : <ChevronRight className="size-6" />}
                  </button>
                </div>
              </div>
            ) : isLoadingOptimization ? (
              <div className="grid min-h-[520px] place-items-center rounded-lg bg-white text-center">
                <div className="space-y-3">
                  <RefreshCw className="mx-auto size-7 animate-spin text-emerald-700" />
                  <p className="text-sm font-semibold text-slate-600">
                    {isZh ? "正在生成利润优化方案..." : "Generating profit optimization plan..."}
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

function EmptySkuProfitPortfolioTable({ locale }: { locale: RendererLocale }) {
  const isZh = locale === "zh";

  return (
    <div className="grid min-h-[520px] place-items-center bg-white p-8 text-center">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          {isZh ? "推荐优化" : "Recommended Optimization"}
        </p>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
          {isZh ? "最大化 SKU 组合利润" : "Maximize Your SKU Profit Portfolio"}
        </h2>
      </div>
    </div>
  );
}

type PortfolioRow = DecisionIntelligenceReportV1["sku_portfolio_optimization"]["recommended_portfolio"][number];
type PortfolioDecisionRow = DecisionIntelligenceReportV1["sku_portfolio_optimization"]["skuDecisions"][number];
type PortfolioDecisionFilter = PortfolioDecisionRow["action"] | "INVENTORY_RISK" | "BUDGET_OPPORTUNITY" | "ALL";

type ActionOutcomeStatus = "Pending" | "Accepted" | "Running" | "Completed" | "Rejected" | "Blocked";

type ActionOutcomeRow = {
  action: string;
  sku: string;
  acceptedAt: string;
  window: string;
  baselineProfit: number;
  predictedProfitLift: number;
  actualProfitLift: number | null;
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
    actualProfitLift: 2410,
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
    actualProfitLift: 8950,
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
    actualProfitLift: 1820,
    status: "Completed",
    confidence: 0.782,
    evidence: "Price elasticity passed"
  }
];

function decisionRowKey(row: PortfolioDecisionRow) {
  return `${row.skuId}:${row.action}:${row.sourceAction}`;
}

function isOptimizationQueueRow(row: PortfolioDecisionRow) {
  const impact = Math.abs(row.expectedProfitImpact ?? row.estimatedProfitImpact ?? 0);
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

  return (
    <aside className="sticky top-0 max-h-[calc(100vh-6rem)] overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
      <div className="rounded-lg bg-emerald-950 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-bold text-white">{isZh ? "利润待优化队列" : "Profit Optimization Queue"}</p>
          <span className="rounded-full bg-emerald-300/15 px-2.5 py-1 text-xs font-bold text-emerald-50 ring-1 ring-emerald-200/25">
            {isZh ? `待优化 ${numberFormat.format(rows.length)} 个` : `${numberFormat.format(rows.length)} pending`}
          </span>
        </div>
      </div>

      <div className="mt-3 max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto pr-4 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-emerald-100/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-emerald-950/45">
        {rows.length ? rows.map((row) => {
          const key = decisionRowKey(row);
          const isSelected = selectedRow ? decisionRowKey(selectedRow) === key : false;
          const recommendation = portfolioRowsBySku.get(row.skuId);
          const impact = row.expectedProfitImpact ?? row.estimatedProfitImpact ?? 0;
          const status = actionStatuses[key] === "accepted" ? "accepted" : actionStatuses[key] === "rejected" ? "rejected" : "awaiting_decision";

          return (
            <div key={key} className="rounded-lg bg-white ring-1 ring-slate-100">
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(row)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(row);
                  }
                }}
                className={cn(
                  "w-full rounded-lg p-3 text-left transition hover:bg-emerald-50/50",
                  isSelected && "bg-emerald-50 ring-1 ring-inset ring-emerald-200"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-950">{row.skuId}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <LifecycleBadge stage={row.lifecycle_stage} />
                      <DecisionBadge action={row.action ?? "MONITOR"} locale={locale} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">{signedCurrency(impact)}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">
                  {(row.recommendedActions ?? row.recommendedExecution ?? [portfolioScenarioActionLabel(row.sourceAction, locale)])[0]}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">{recommendation ? percent.format(recommendation.confidence) : percent.format(row.confidence)}</span>
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
          <div className="rounded-lg bg-white p-4 text-sm font-medium text-slate-500 ring-1 ring-slate-100">
            {isZh ? "暂无需要优化的 SKU。" : "No SKUs currently need optimization."}
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
  const days = row.simulation_estimate?.simulation_window.days ?? row.simulation_horizon?.days ?? row.timing?.simulation_window_days ?? 30;
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
  return /AD|ADS|BUDGET|SCALE/i.test(`${row.sourceAction ?? ""} ${row.recommendedActions?.join(" ") ?? ""} ${row.recommendedExecution?.join(" ") ?? ""}`);
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
    row.recommendedActions?.join(" "),
    row.recommendedExecution?.join(" "),
    row.risks?.join(" "),
    row.decisionDrivers?.map((driver) => `${driver.category} ${driver.metric} ${driver.value}`).join(" "),
    row.causalExplanation ? `${row.causalExplanation.evidence.join(" ")} ${row.causalExplanation.businessMeaning} ${row.causalExplanation.decision}` : ""
  ].join(" ").toLowerCase();
}

function portfolioActionLabel(row: PortfolioRow, locale: RendererLocale) {
  if (row.action.includes("SCALE")) return locale === "zh" ? "增加广告" : "Increase Ads";
  if (row.action.includes("REDUCE")) return locale === "zh" ? "降低广告" : "Reduce Ads";
  if (row.action.includes("PRICE")) return locale === "zh" ? "调整价格" : "Price Adjust";
  if (row.action.includes("RESTOCK")) return locale === "zh" ? "补库存" : "Restock Inventory";
  return locale === "zh" ? "保持" : "Hold";
}

function portfolioRowToOutcomeRow(row: PortfolioRow, locale: RendererLocale): ActionOutcomeRow {
  return {
    action: portfolioActionLabel(row, locale),
    sku: row.sku,
    acceptedAt: "Jul 8",
    window: row.action.includes("PRICE") ? "14d" : "7d",
    baselineProfit: row.current_profit,
    predictedProfitLift: Math.max(0, row.profit_delta),
    actualProfitLift: null,
    status: "Running",
    confidence: row.confidence,
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

function LifecycleBadge({ stage }: { stage?: string }) {
  const label = stage === "LAUNCH" ? "Launch" : stage === "GROWTH" ? "Growth" : stage === "MATURE" ? "Mature" : stage === "DECLINING" ? "Declining" : "Lifecycle";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold",
        stage === "LAUNCH" && "bg-sky-100 text-sky-800",
        stage === "GROWTH" && "bg-emerald-100 text-emerald-800",
        stage === "MATURE" && "bg-indigo-100 text-indigo-800",
        stage === "DECLINING" && "bg-rose-100 text-rose-800",
        !stage && "bg-slate-100 text-slate-600"
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
  acceptedAt,
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
  const isZh = locale === "zh";
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

  return (
    <aside className="sticky bottom-0 top-auto mx-auto max-h-[68vh] max-w-5xl overflow-auto bg-transparent p-4 pb-6 xl:top-0 xl:max-h-[calc(100vh-6rem)]">
      <div className="p-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-slate-950">AI SKU Decision Center</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Evidence, scenario simulation, lifecycle strategy, and execution feedback for the selected SKU.
            </p>
          </div>
          <Badge tone="success">{detail.source}</Badge>
        </div>
      </div>

      <div className="mt-6 p-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-500">{isZh ? "选中 SKU" : "Selected SKU Summary"}</p>
            <p className="mt-1 text-lg font-bold text-slate-950">{detail.sku}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <LifecycleBadge stage={row.lifecycle_stage} />
              {row.lifecycle?.confidence !== undefined ? (
                <span className="text-xs font-semibold text-slate-500">{isZh ? "生命周期置信度" : "Lifecycle confidence"}: {percent.format(row.lifecycle.confidence)}</span>
              ) : null}
            </div>
          </div>
          {actionStatus === "pending" ? null : (
            <RecommendationStatusBadge status={actionStatus === "accepted" ? "accepted" : "rejected"} locale={locale} />
          )}
        </div>
        <div className="mt-3 space-y-1.5 text-sm">
          <DetailRow label="Action" value={detail.action} />
          <DetailRow label="Recommendation" value={detail.recommendation} />
          <DetailRow label={isZh ? "Baseline Period" : "Baseline Period"} value={formatBaselinePeriod(row, simulationHorizonDays)} />
          <DetailRow label={isZh ? "Action Start" : "Action Start"} value={formatDecisionActionStart(row)} />
          <DetailRow label={isZh ? "Simulation Window" : "Simulation Window"} value={formatDecisionWindow(row, simulationHorizonDays)} />
          <DetailRow label={isZh ? "Tracking Window" : "Tracking Window"} value={formatTrackingWindow(row, simulationHorizonDays, acceptedAt)} />
        </div>
        {row.lifecycle?.signals?.length ? (
          <div className="mt-4 rounded-lg bg-white/55 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{isZh ? "Lifecycle Why" : "Lifecycle Why"}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.lifecycle.signals.slice(0, 6).map((signal) => (
                <span key={signal} className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold text-slate-600">
                  {signal.replaceAll("_", " ")}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SmallTrackerMetric label="Confidence" value={percent.format(detail.confidence)} />
          <SmallTrackerMetric label={`Expected lift ${simulationHorizonDays}d`} value={`${signedCurrency(detail.expected_profit_lift_30d)} / ${simulationHorizonDays} days`} />
          <SmallTrackerMetric label="Current profit" value={currencyDecimal.format(detail.current_profit)} />
          <SmallTrackerMetric label="Actual lift" value={detail.tracking_summary.actual_cumulative_lift === null ? "Pending" : signedCurrency(detail.tracking_summary.actual_cumulative_lift)} />
        </div>
      </div>

      <PanelDisclosure title="Operating signals">
        <div className="grid grid-cols-2 gap-2">
          <SmallTrackerMetric label="Margin" value={percent.format(detail.current_margin)} />
          <SmallTrackerMetric label="Ads spend" value={currencyDecimal.format(detail.current_ads_spend)} />
          <SmallTrackerMetric label="Stock" value={numberFormat.format(detail.current_stock)} />
          <SmallTrackerMetric label="Sales velocity" value={`${ratioFormat.format(detail.current_sales_velocity)}/day`} />
        </div>
      </PanelDisclosure>

      <PanelDisclosure title="Why AI Recommended">
        <AIEvidenceCards row={row} detail={detail} />
      </PanelDisclosure>

      <PanelDisclosure title="Simulation Comparison">
        <ScenarioSimulationComparison row={row} recommendation={recommendation} detail={detail} />
      </PanelDisclosure>

      {row.simulation_estimate ? (
        <PanelDisclosure title="Simulation Breakdown">
          <SimulationEstimateBreakdown row={row} />
        </PanelDisclosure>
      ) : null}

      <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-100">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-950">Daily Profit Optimization</p>
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
        <div className="mt-3 grid grid-cols-2 gap-2">
          <SmallTrackerMetric label="Avg predicted lift/day" value={signedCurrency(cumulativePredictedLift / Math.max(1, visibleRows.length))} />
          <SmallTrackerMetric label="Cumulative predicted" value={signedCurrency(cumulativePredictedLift)} />
          <SmallTrackerMetric label="Cumulative actual" value={actualRows.length ? signedCurrency(cumulativeActualLift) : "Pending"} />
          <SmallTrackerMetric label="Prediction error" value={predictionError === null ? "Pending" : percent.format(predictionError)} />
        </div>
      </div>

      <PanelDisclosure title="Daily tracking rows">
        <DailyProfitTrackingTable rows={visibleRows} />
      </PanelDisclosure>

      <PanelDisclosure title="Action Lifecycle">
        <ActionLifecycleCard detail={detail} actionStatus={actionStatus} accuracy={accuracy} compact showTitle={false} />
      </PanelDisclosure>

    </aside>
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

function ScenarioSimulationComparison({
  row,
  recommendation,
  detail
}: {
  row: PortfolioDecisionRow;
  recommendation?: PortfolioRow;
  detail: SelectedSkuDetail;
}) {
  const scenarios = (row.scenarios?.length ? row.scenarios : recommendation?.scenarios?.length ? recommendation.scenarios : fallbackScenarios(row, recommendation, detail)).slice(0, 4);
  const selected = row.selected_scenario ?? recommendation?.selected_scenario ?? scenarios.find((scenario) => scenario.selected) ?? scenarios[0];
  const explanation = row.decision_explanation ?? recommendation?.decision_explanation;

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-slate-500">Current profit</span>
          <span className="font-bold text-slate-950">{currencyDecimal.format(detail.current_profit)}</span>
        </div>
      </div>
      <div className="grid gap-2">
        {scenarios.map((scenario) => (
          <div
            key={scenario.scenario_id ?? scenario.action}
            className={cn(
              "rounded-lg p-3",
              scenario.selected ? "bg-emerald-50 text-emerald-950" : "bg-white/65 text-slate-950"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">{scenario.label ?? scenario.action}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{percent.format(scenario.confidence ?? 0)} confidence</p>
              </div>
              <p className={cn("text-base font-bold", (scenario.expected_profit_lift ?? 0) >= 0 ? "text-emerald-700" : "text-rose-600")}>
                {signedCurrency(scenario.expected_profit_lift ?? 0)}
              </p>
            </div>
          </div>
        ))}
      </div>
      {selected ? (
        <div className="rounded-lg bg-emerald-950 p-3 text-white">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-100">AI Selected</p>
          <p className="mt-1 text-sm font-bold">{selected.label ?? selected.action}</p>
          <p className="mt-2 text-xs leading-5 text-emerald-50">
            {explanation?.selection_reason ?? "Selected because it provides the strongest expected profit while satisfying budget, inventory, margin, and confidence constraints."}
          </p>
        </div>
      ) : null}
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
  const expectedLift = row.expectedProfitImpact ?? row.estimatedProfitImpact ?? recommendation?.profit_delta ?? detail.expected_profit_lift_30d;

  return [
    {
      scenario_id: `${row.skuId}-${selectedAction}`,
      action: String(selectedAction),
      label: portfolioScenarioActionLabel(selectedAction, "en"),
      expected_profit: detail.current_profit + expectedLift,
      expected_profit_lift: expectedLift,
      expected_revenue_lift: recommendation?.simulation.revenue_delta ?? expectedLift * 1.7,
      confidence: row.confidence ?? detail.confidence,
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
      confidence: Math.max(0.45, (row.confidence ?? detail.confidence) - 0.08),
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
  const data = rows.map((row) => ({
    date: row.date.slice(5),
    baseline: row.baseline_profit,
    predicted: row.predicted_profit,
    actual: row.actual_profit
  }));

  return (
    <div className={cn("mt-3 rounded-lg border bg-slate-50 p-2", compact ? "h-24" : "h-36")}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
          <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" width={48} />
          <Tooltip formatter={(value) => currencyDecimal.format(Number(value))} />
          <Line type="monotone" dataKey="baseline" stroke="#94a3b8" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="predicted" stroke="#059669" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="actual" stroke="#0f172a" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DailyProfitTrackingTable({ rows }: { rows: DailyProfitTrackingRow[] }) {
  return (
    <div className="max-h-44 overflow-auto rounded-lg border">
      <table className="min-w-[760px] w-full text-left text-xs">
        <thead className="sticky top-0 bg-slate-50 text-slate-500">
          <tr>
            <th className="px-2 py-2">Date</th>
            <th className="px-2 py-2">Baseline Profit</th>
            <th className="px-2 py-2">Predicted Profit</th>
            <th className="px-2 py-2">Actual Profit</th>
            <th className="px-2 py-2">Profit Lift</th>
            <th className="px-2 py-2">Ads Spend</th>
            <th className="px-2 py-2">Revenue</th>
            <th className="px-2 py-2">Margin</th>
            <th className="px-2 py-2">Stock</th>
            <th className="px-2 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={`${row.sku}-${row.date}`}>
              <td className="px-2 py-2 font-semibold text-slate-900">{row.date}</td>
              <td className="px-2 py-2">{currencyDecimal.format(row.baseline_profit)}</td>
              <td className="px-2 py-2">{currencyDecimal.format(row.predicted_profit)}</td>
              <td className="px-2 py-2">{row.actual_profit === null ? "Pending actual" : currencyDecimal.format(row.actual_profit)}</td>
              <td className="px-2 py-2 font-semibold text-emerald-700">{signedCurrency(row.profit_delta)}</td>
              <td className="px-2 py-2">{currencyDecimal.format(row.ads_spend)}</td>
              <td className="px-2 py-2">{currencyDecimal.format(row.revenue)}</td>
              <td className="px-2 py-2">{percent.format(row.margin)}</td>
              <td className="px-2 py-2">{numberFormat.format(row.stock)}</td>
              <td className="px-2 py-2"><Badge tone={row.action_status === "completed" ? "success" : row.action_status === "rejected" ? "neutral" : "warning"}>{row.action_status === "pending" ? "Waiting for feedback" : row.action_status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PanelDisclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="mt-3 rounded-lg bg-white p-3 ring-1 ring-slate-100">
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

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <SmallTrackerMetric label="Investment" value={`${signedCurrency(estimate.investment.additional_ad_spend)} / ${estimate.simulation_window.days} days`} />
        <SmallTrackerMetric label="Daily budget delta" value={currencyDecimal.format(estimate.investment.daily_budget_delta)} />
        <SmallTrackerMetric label="Base ROAS" value={ratioFormat.format(estimate.revenue_simulation.base_roas)} />
        <SmallTrackerMetric label="Marginal ROAS" value={ratioFormat.format(estimate.revenue_simulation.marginal_roas)} />
        <SmallTrackerMetric label="Diminishing return" value={percent.format(estimate.revenue_simulation.diminishing_return_factor)} />
        <SmallTrackerMetric label="Attribution factor" value={percent.format(estimate.revenue_simulation.attribution_confidence_factor)} />
        <SmallTrackerMetric label="Inventory factor" value={percent.format(estimate.revenue_simulation.inventory_capacity_factor)} />
        <SmallTrackerMetric label="Revenue lift" value={signedCurrency(estimate.revenue_simulation.incremental_revenue)} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Cost Simulation</p>
        <div className="mt-2 grid gap-1.5 text-xs">
          <DetailRow label="Ad spend" value={`-${currencyDecimal.format(estimate.cost_simulation.additional_ad_spend)}`} />
          <DetailRow label="Shipping" value={`-${currencyDecimal.format(estimate.cost_simulation.incremental_shipping_cost)}`} />
          <DetailRow label="Platform fees" value={`-${currencyDecimal.format(estimate.cost_simulation.incremental_platform_fee)}`} />
          <DetailRow label="Payment fees" value={`-${currencyDecimal.format(estimate.cost_simulation.incremental_payment_fee)}`} />
          <DetailRow label="Refund estimate" value={`-${currencyDecimal.format(estimate.cost_simulation.expected_refund_cost)}`} />
          <DetailRow label="Fulfillment" value={`-${currencyDecimal.format(estimate.cost_simulation.incremental_fulfillment_cost)}`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SmallTrackerMetric label="Contribution margin" value={percent.format(estimate.profit_simulation.contribution_margin)} />
        <SmallTrackerMetric label="Gross incremental profit" value={signedCurrency(estimate.profit_simulation.gross_incremental_profit)} />
        <SmallTrackerMetric label="Expected profit lift" value={`${signedCurrency(estimate.profit_simulation.expected_profit_impact)} / ${estimate.simulation_window.days} days`} />
        <SmallTrackerMetric label="Confidence" value={percent.format(estimate.confidence_breakdown.overall_confidence)} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
        <div className="flex justify-between gap-3">
          <span className="font-semibold text-slate-500">Source</span>
          <span className="text-right font-bold text-slate-950">{estimate.prediction_source}</span>
        </div>
        {estimate.estimated_components.length ? (
          <p className="mt-2 text-slate-500">Estimated components: {estimate.estimated_components.join(", ")}</p>
        ) : null}
        {estimate.warnings.length ? (
          <p className="mt-1 text-amber-700">Warnings: {estimate.warnings.join(", ")}</p>
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
  const expectedLift = row.expectedProfitImpact ?? row.estimatedProfitImpact ?? recommendation?.profit_delta ?? 0;
  const actualLift = actualProfitLiftForSku(trackedRows, row.skuId);
  const currentProfit = recommendation?.current_profit ?? Math.max(0, expectedLift * 0.45);
  const predictedProfit = recommendation?.predicted_profit ?? currentProfit + expectedLift;
  const currentRevenue = recommendation?.before_state?.revenue ?? Math.max(predictedProfit * 2.4, currentProfit * 2.8, 1);
  const predictedRevenue = recommendation?.simulation.predicted_revenue ?? recommendation?.after_state?.revenue ?? currentRevenue + Math.max(0, recommendation?.simulation.revenue_delta ?? expectedLift * 1.7);
  const currentMargin = recommendation?.before_state?.margin ?? Math.max(0.18, Math.min(0.62, currentProfit / Math.max(1, currentRevenue)));
  const predictedMargin = recommendation?.simulation.predicted_margin ?? recommendation?.after_state?.margin ?? Math.min(0.72, currentMargin + Math.max(0.02, recommendation?.simulation.margin_change ?? 0.056));
  const currentAdsSpend = recommendation?.simulation.current_ads_spend ?? recommendation?.before_state?.ad_spend ?? Math.max(0, expectedLift * 0.16);
  const currentStock = recommendation?.before_state?.inventory ?? recommendation?.simulation.required_inventory ?? 818;
  const salesVelocity = Math.max(0.2, recommendation?.simulation.required_inventory ? recommendation.simulation.required_inventory / Math.max(1, simulationHorizonDays) : 3.2);
  const predictedDailyDemand = salesVelocity * (row.action === "SCALE" ? 1.5 : row.action === "REDUCE" ? 0.75 : 1.12);
  const predictedCumulativeLift = expectedLift;
  const predictionError = actualLift === null || !predictedCumulativeLift ? null : (actualLift - predictedCumulativeLift) / Math.abs(predictedCumulativeLift);

  return {
    sku: row.skuId,
    action: decisionActionLabel(row.action ?? "MONITOR", "en"),
    recommendation: (row.recommendedActions ?? row.recommendedExecution ?? [portfolioScenarioActionLabel(row.sourceAction, "en")])[0],
    confidence: row.confidence ?? recommendation?.confidence ?? 0,
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
    source: actionStatus === "accepted" || actualLift !== null ? "actual" : "simulated",
    tracking_summary: {
      predicted_cumulative_lift: predictedCumulativeLift,
      actual_cumulative_lift: actualLift,
      prediction_error: predictionError,
      accuracy_score: predictionError === null ? null : Math.max(0, 1 - Math.abs(predictionError))
    }
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
    const hasActual = dayNumber <= Math.min(3, range);
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
  const variance = actualLift === null ? null : actualLift - detail.tracking_summary.predicted_cumulative_lift;

  return (
    <div className={cn(compact ? "" : "mt-3 rounded-lg bg-white p-4 ring-1 ring-slate-100")}>
      {showTitle ? <p className="text-sm font-bold text-slate-950">Action Lifecycle</p> : null}
      <div className={showTitle ? "mt-3" : ""}>
        <ActionTimeline status={actionStatus === "accepted" ? "Running" : actionStatus === "rejected" ? "Rejected" : "Pending"} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SmallTrackerMetric label="Predicted lift" value={signedCurrency(detail.tracking_summary.predicted_cumulative_lift)} />
        <SmallTrackerMetric label="Actual lift" value={actualLift === null ? "Pending" : signedCurrency(actualLift)} />
        <SmallTrackerMetric label="Variance" value={variance === null ? "Pending" : signedCurrency(variance)} />
        <SmallTrackerMetric label="Accuracy" value={accuracy === null ? "Pending" : percent.format(accuracy)} />
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

function ActionDecisionButtons({
  locale,
  onAccept,
  onReject,
  compact = false
}: {
  locale: RendererLocale;
  onAccept: (event?: MouseEvent<HTMLButtonElement>) => void;
  onReject: (event?: MouseEvent<HTMLButtonElement>) => void;
  compact?: boolean;
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
        {isZh ? "接受" : "Accept"}
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
  const revenueChangeRate = row.before_state.revenue > 0 ? row.simulation.revenue_delta / row.before_state.revenue : 0;
  const runwayDays = row.simulation.required_inventory > 0
    ? row.before_state.inventory / Math.max(1, row.simulation.required_inventory / 30)
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
        value: signedCurrency(row.profit_delta),
        impact: row.profit_delta >= 0 ? "positive" : "negative"
      },
      {
        category: "Inventory Status",
        metric: "Stock Runway",
        value: runwayDays === null ? "Needs validation" : `${ratioFormat.format(runwayDays)} days coverage`,
        impact: row.simulation.required_inventory <= row.before_state.inventory ? "positive" : "risk"
      }
    ];
  }

  if (decision === "REDUCE") {
    return [
      {
        category: "Ad Efficiency",
        metric: "Budget Reduction",
        value: signedCurrency(row.simulation.recommended_ads_spend - row.simulation.current_ads_spend),
        impact: "negative"
      },
      {
        category: "Profit Impact",
        metric: "Marginal Profit",
        value: signedCurrency(row.profit_delta),
        impact: row.profit_delta < 0 ? "negative" : "risk"
      },
      {
        category: "Margin Signal",
        metric: "Predicted Margin",
        value: percent.format(row.simulation.predicted_margin),
        impact: row.simulation.predicted_margin < 0.15 ? "negative" : "risk"
      }
    ];
  }

  if (decision === "OPTIMIZE") {
    return [
      {
        category: "Root Cause",
        metric: "Constraint",
        value: row.action.includes("RESTOCK") ? "Inventory coverage constrains scale" : "Price or margin needs adjustment",
        impact: "risk"
      },
      {
        category: "Profit Impact",
        metric: "Estimated Fix Value",
        value: signedCurrency(row.profit_delta),
        impact: row.profit_delta >= 0 ? "positive" : "risk"
      },
      {
        category: "Margin Response",
        metric: "Margin Change",
        value: formatSignedPercentText(row.simulation.margin_change),
        impact: row.simulation.margin_change >= 0 ? "positive" : "risk"
      }
    ];
  }

  return [
    {
      category: "Data Sufficiency",
      metric: "Prediction Confidence",
      value: percent.format(row.confidence),
      impact: row.confidence >= 0.65 ? "positive" : "risk"
    },
    {
      category: "Profit Impact",
      metric: "Estimated Impact",
      value: signedCurrency(row.profit_delta),
      impact: row.profit_delta > 0 ? "positive" : "risk"
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
    return {
      evidence: [],
      businessMeaning: "Demand, margin, and inventory signals indicate positive marginal profit potential.",
      decision: `Increase advertising budget by ${currencyDecimal.format(Math.max(0, row.simulation.recommended_ads_spend - row.simulation.current_ads_spend))} and track profit lift.`
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
      decision: row.action.includes("RESTOCK") ? "Resolve inventory coverage before increasing demand." : "Run the selected fix before scaling."
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
  if (locale !== "zh") {
    if (action.includes("SCALE")) return "Increase Ads";
    if (action.includes("REDUCE")) return "Reduce Ads";
    if (action.includes("PRICE_UP")) return "Raise Price";
    if (action.includes("PRICE_DOWN")) return "Lower Price";
    if (action.includes("RESTOCK")) return "Restock";
    return "Hold";
  }

  if (action.includes("SCALE")) return "增加广告";
  if (action.includes("REDUCE")) return "降低广告";
  if (action.includes("PRICE_UP")) return "提价";
  if (action.includes("PRICE_DOWN")) return "降价";
  if (action.includes("RESTOCK")) return "补库存";
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

  if (row.simulation.required_inventory > 0) {
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
  const line = evidence.find((item) => item.startsWith(`${key}=`));
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
      <table className="min-w-[880px] w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
          <tr>
            <th className="px-3 py-3">SKU</th>
            <th className="px-3 py-3">Product Name</th>
            <th className="px-3 py-3">Channel</th>
            <th className="px-3 py-3">Stock</th>
            <th className="px-3 py-3">Sold</th>
            <th className="px-3 py-3">Sales Velocity</th>
            <th className="px-3 py-3">Runway Days</th>
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
              <td className="px-3 py-3">{row.runwayDays === null ? "N/A" : formatOneDecimal(row.runwayDays)}</td>
              <td className="px-3 py-3">{row.sellThroughRate === null ? "N/A" : percent.format(row.sellThroughRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerValueDistribution({ customer }: { customer: DecisionIntelligenceReportV1["customer_breakdown"] }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">LTV Distribution</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <SmallMetric label="P90 LTV" value={currencyDecimal.format(customer.p90_ltv)} />
        <SmallMetric label="P95 LTV" value={currencyDecimal.format(customer.p95_ltv)} />
        <SmallMetric label="P99 LTV" value={currencyDecimal.format(customer.p99_ltv)} />
        <SmallMetric label="Top 10% Revenue" value={percent.format(customer.top_10_percent_revenue_share)} />
        <SmallMetric label="Top 1% Revenue" value={percent.format(customer.top_1_percent_revenue_share)} />
        <SmallMetric label="Avg Orders / Customer" value={ratioFormat.format(customer.avg_orders_per_customer)} />
      </div>
    </div>
  );
}

function CustomerLifecyclePanel({ customer }: { customer: DecisionIntelligenceReportV1["customer_breakdown"] }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">Lifecycle Structure</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <SmallMetric label="New Customers" value={numberFormat.format(customer.new_customers)} />
        <SmallMetric label="Inactive Customers" value={numberFormat.format(customer.inactive_customers)} />
        <SmallMetric label="Churned Customers" value={numberFormat.format(customer.churned_customers)} />
        <SmallMetric label="Purchase Frequency" value={ratioFormat.format(customer.purchase_frequency)} />
        <SmallMetric label="Avg Lifetime Days" value={formatOneDecimal(customer.avg_customer_lifetime_days)} />
        <SmallMetric label="30D Retention" value={percent.format(customer.cohort_retention_30d)} />
      </div>
    </div>
  );
}

function CustomerCohortTable({ rows }: { rows: DecisionIntelligenceReportV1["customer_breakdown"]["cohort_by_first_purchase_month"] }) {
  if (!rows.length) return <EmptyBlock label="No customer cohort rows available." />;

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

function GrowthRow({ label, value }: { label: string; value: number }) {
  const tone = value < 0 ? "text-rose-700" : value > 0 ? "text-emerald-700" : "text-slate-600";
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className={cn("text-sm font-semibold", tone)}>{percent.format(value)}</span>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase leading-5 tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value || "No Data"}</p>
    </div>
  );
}

function SkuDetailPanel({ row }: { row: SkuReportRow }) {
  const fees = row.cost_breakdown ? row.cost_breakdown.platform_fee + row.cost_breakdown.payment_fee : null;
  return (
    <div className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3 lg:grid-cols-3">
      <DetailSection title="Channel Breakdown">
        {row.channel_details.length ? (
          row.channel_details.map((channel) => (
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
        <DetailRow label="COGS" value={row.cost_breakdown ? currency.format(row.cost_breakdown.cogs) : "No Data"} />
        <DetailRow label="Ads allocated" value={row.ad_cost_allocated === null ? "No Data" : currency.format(row.ad_cost_allocated)} />
        <DetailRow label="Shipping + fulfillment" value={row.cost_breakdown ? currency.format(row.cost_breakdown.shipping + row.cost_breakdown.fulfillment) : "No Data"} />
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
  const details = row.channel_details.length ? row.channel_details : Object.entries(row.channel_breakdown)
    .filter(([, revenue]) => revenue > 0)
    .map(([platform, revenue]) => ({
      platform,
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
  const detail = row.channel_details.find((item) => item.platform === channel);
  if (detail) return detail.revenue;
  return row.channel_breakdown[channel] ?? 0;
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
