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

export function ReportRendererEngine({ report, message }: ReportRendererEngineProps) {
  const [skuSearch, setSkuSearch] = useState("");
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
    const normalizedSearch = skuSearch.trim().toLowerCase();
    return skuRows
      .filter((row) => !normalizedSearch || row.sku.toLowerCase().includes(normalizedSearch))
      .filter((row) => skuChannel === "all" || row.channel_details.some((channel) => channel.platform === skuChannel) || row.channel_breakdown[skuChannel] > 0)
      .sort((a, b) => {
        const aRankValue = skuChannel === "all" ? a.revenue : getSkuChannelRevenue(a, skuChannel);
        const bRankValue = skuChannel === "all" ? b.revenue : getSkuChannelRevenue(b, skuChannel);
        return bRankValue - aRankValue || b.revenue - a.revenue || a.sku.localeCompare(b.sku);
      });
  }, [skuRows, skuSearch, skuChannel]);

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
              searchTerm={skuSearch}
              onSearchChange={setSkuSearch}
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
  searchTerm,
  onSearchChange,
  channelTags,
  selectedChannel,
  onChannelChange,
  expandedSku,
  onToggleExpanded
}: {
  rows: SkuReportRow[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
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

  return (
    <div className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b px-6 pb-5">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search SKU"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
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
          "relative max-h-[640px] w-full max-w-full min-w-0 overflow-x-scroll overflow-y-auto bg-white",
          "cursor-grab overscroll-x-contain overscroll-y-auto [scrollbar-gutter:stable]",
          "[&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar]:w-3",
          "[&::-webkit-scrollbar-track]:bg-slate-100",
          "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300",
          isDraggingTable && "cursor-grabbing select-none"
        )}
      >
        <table className="w-[2060px] min-w-[2060px] table-fixed text-left text-sm">
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
            <col className="w-[180px]" />
            <col className="w-[120px]" />
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
              <th className="px-3 py-3">Risk</th>
              <th className="px-3 py-3">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, index) => {
              const lowMargin = row.margin !== null && row.margin < 0.1;
              const isExpanded = expandedSku === row.sku;
              const fees = row.cost_breakdown ? row.cost_breakdown.platform_fee + row.cost_breakdown.payment_fee : null;
              return (
                <Fragment key={row.sku}>
                  <tr key={row.sku} className={cn("hover:bg-slate-50", index < 5 && "bg-emerald-50/40", lowMargin && "bg-rose-50/60")}>
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
                    <td className="px-3 py-3"><RiskBadge value={row.overall_risk_score >= 0.75 ? "high" : row.overall_risk_score >= 0.45 ? "medium" : "low"} /></td>
                    <td className="px-3 py-3"><ConfidenceBadge value={row.profit_confidence} /></td>
                  </tr>
                  {isExpanded ? (
                    <tr key={`${row.sku}-details`} className="bg-white">
                      <td colSpan={15} className="px-5 py-4">
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

export function DecisionAnalysisEnginePanel({ report, message, locale = "en" }: { report: DecisionIntelligenceReportV1 | null; message?: string; locale?: RendererLocale }) {
  const isZh = locale === "zh";

  if (!report) {
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
      <SkuPortfolioOptimizationPanel report={report} locale={locale} />
    </section>
  );
}

function SkuPortfolioOptimizationPanel({ report, locale }: { report: DecisionIntelligenceReportV1; locale: RendererLocale }) {
  const isZh = locale === "zh";
  const optimization = report.sku_portfolio_optimization;
  const summary = optimization.optimization_summary;
  const selectedRows = optimization.recommended_portfolio;
  const decisionRows = optimization.skuDecisions ?? report.skuDecisions ?? [];
  const decisionSummary = optimization.portfolioSummary ?? report.portfolioSummary ?? {
    totalProfitImpact: optimization.total_expected_profit_gain,
    scaleCount: selectedRows.length,
    reduceCount: 0,
    optimizeCount: 0,
    stopCount: 0,
    fixCount: 0,
    monitorCount: 0,
    inventoryRisk: 0,
    budgetOpportunity: summary.ads_budget_used
  };
  const allocationRecommendation = optimization.allocationRecommendation ?? report.allocationRecommendation ?? {
    current: [
      { bucket: "Acquisition SKUs", share: 0.7, amount: summary.ads_budget_used * 0.7 },
      { bucket: "Profit SKUs", share: 0.2, amount: summary.ads_budget_used * 0.2 },
      { bucket: "Testing", share: 0.1, amount: summary.ads_budget_used * 0.1 }
    ],
    recommended: [
      { bucket: "Profit Growth SKUs", share: 0.75, amount: summary.ads_budget_used * 0.75 },
      { bucket: "High Potential Fixes", share: 0.2, amount: summary.ads_budget_used * 0.2 },
      { bucket: "Exit / Testing", share: 0.05, amount: summary.ads_budget_used * 0.05 }
    ],
    narrative: "Budget is shifted from lower-response exposure toward SKUs with stronger estimated marginal profit."
  };
  const portfolioRowsBySku = new Map(selectedRows.map((row) => [row.sku, row]));
  const sourceRows = report.sku_breakdown.top_profit_skus.length ? report.sku_breakdown.top_profit_skus : report.sku_breakdown.top_revenue_skus;
  const sourceSkuIds = sourceRows.length
    ? sourceRows.map((row) => row.sku)
    : Array.from(new Set(optimization.simulations.map((row) => row.sku)));
  const currentSkuCount = sourceRows.length || summary.input_sku_count || sourceSkuIds.length;
  const liftRate = summary.current_portfolio_profit > 0 ? optimization.total_expected_profit_gain / summary.current_portfolio_profit : 0;
  const simulationHorizonDays = summary.simulation_horizon_days ?? optimization.recommended_portfolio[0]?.simulation_horizon?.days ?? 30;
  const [actionStatuses, setActionStatuses] = useState<Record<string, "pending" | "accepted" | "rejected">>({});
  const [trackedOutcomeRows, setTrackedOutcomeRows] = useState<ActionOutcomeRow[]>(seedActionOutcomeRows);
  const [selectedOutcomeRow, setSelectedOutcomeRow] = useState<ActionOutcomeRow | null>(null);
  const [decisionSkuSearch, setDecisionSkuSearch] = useState("");
  const [decisionActionFilter, setDecisionActionFilter] = useState<PortfolioDecisionFilter>("ALL");
  const normalizedDecisionSkuSearch = decisionSkuSearch.trim().toLowerCase();
  const filteredDecisionRows = decisionRows
    .filter((row) => decisionFilterMatchesRow(row, decisionActionFilter))
    .filter((row) => !normalizedDecisionSkuSearch || row.skuId.toLowerCase().includes(normalizedDecisionSkuSearch));

  const acceptDecisionAction = async (row: PortfolioDecisionRow) => {
    const recommendation = portfolioRowsBySku.get(row.skuId);
    setActionStatuses((current) => ({ ...current, [decisionRowKey(row)]: "accepted" }));
    if (recommendation) {
      setTrackedOutcomeRows((current) => upsertOutcomeRow(current, portfolioRowToOutcomeRow(recommendation, locale)));
    }

    await fetch("/api/actions/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku: row.skuId,
        action_type: row.action,
        action_payload: {
          action: row.sourceAction,
          sku_role: row.skuRole,
          recommended_actions: row.recommendedActions,
          decision_drivers: row.decisionDrivers,
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

  return (
    <div className="space-y-5 rounded-lg border bg-white p-4">
      <div className="grid items-stretch gap-4 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-base font-semibold text-slate-950">{isZh ? "优化模拟" : "Optimization Simulation"}</p>
          <p className="mt-1 text-sm text-slate-500">{isZh ? "当前方案 vs 优化后方案" : "Current vs Optimized"}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-500">{isZh ? "当前组合" : "Current Portfolio"}</p>
              <p className="mt-4 break-words text-[34px] font-bold leading-tight text-slate-950">{numberFormat.format(currentSkuCount)} SKUs</p>
              <p className="mt-3 break-words text-sm leading-6 text-slate-600">{isZh ? "当前预计利润" : "Estimated Current Profit"}: {currencyDecimal.format(summary.current_portfolio_profit)}</p>
              <p className="break-words text-sm leading-6 text-slate-600">{isZh ? "广告预算" : "Ad Spend"}: {currencyDecimal.format(summary.ads_budget_used)}</p>
            </div>
            <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-sm font-semibold text-emerald-800">{isZh ? "AI 优化组合" : "AI Optimized Portfolio"}</p>
              <p className="mt-4 break-words text-[34px] font-bold leading-tight text-emerald-950">{numberFormat.format(summary.selected_sku_count)} SKUs</p>
              <p className="mt-3 break-words text-sm leading-6 text-emerald-900">{isZh ? "预计利润" : "Profit"}: {currencyDecimal.format(summary.optimized_portfolio_profit)}</p>
              <p className="break-words text-sm leading-6 text-emerald-900">{isZh ? "预计提升" : "Impact"}: +{currencyDecimal.format(optimization.total_expected_profit_gain)} / +{percent.format(liftRate)}</p>
            </div>
          </div>
        </div>
        <PortfolioAllocationPanel allocation={allocationRecommendation} locale={locale} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">{isZh ? "利润决策智能系统" : "Profit Decision Intelligence"}</p>
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? "Monarca AI 决定如何在 SKU 间分配广告、库存和资金，以最大化组合利润。"
              : "Monarca AI determines how to allocate advertising, inventory, and capital across SKUs to maximize total profit."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">{isZh ? "预测模型模拟" : "prediction-model simulation"}</Badge>
          <Badge tone="neutral">{isZh ? "未来" : "next"} {simulationHorizonDays} {isZh ? "天" : "days"}</Badge>
          <Badge tone="neutral">{isZh ? "预测类型" : "prediction type"} {optimization.prediction_summary.prediction_type ?? "rule_based"}</Badge>
          <Badge tone="neutral">{isZh ? "预测可信度" : "prediction confidence"} {percent.format(optimization.prediction_summary.prediction_confidence)}</Badge>
          <Badge tone="neutral">{isZh ? "置信度" : "confidence"} {percent.format(optimization.optimization_confidence)}</Badge>
        </div>
      </div>

      <div className="space-y-4">
        <PortfolioDecisionSummaryCard
          summary={decisionSummary}
          locale={locale}
          activeAction={decisionActionFilter}
          onActionChange={setDecisionActionFilter}
        />

        <div className="rounded-lg border p-4">
          <p className="text-sm font-semibold text-slate-950">{isZh ? "Top Decisions" : "Top Decisions"}</p>
          <p className="mt-1 text-xs text-slate-500">
            {isZh
              ? `这些不是指标排名，而是系统在组合约束下选择的下一步经营动作。${decisionActionFilter === "ALL" ? "" : `当前筛选：${decisionFilterLabel(decisionActionFilter, locale)}。`}`
              : `These are not metric rankings; they are the next operating actions selected under portfolio constraints.${decisionActionFilter === "ALL" ? "" : ` Filtered by ${decisionFilterLabel(decisionActionFilter, locale)}.`}`}
          </p>
          <div className="mt-4 max-w-xl">
            <label className="sr-only" htmlFor="portfolio-sku-search">{isZh ? "搜索 SKU" : "Search SKU"}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                id="portfolio-sku-search"
                value={decisionSkuSearch}
                onChange={(event) => setDecisionSkuSearch(event.target.value)}
                placeholder={isZh ? "搜索 SKU" : "Search SKU"}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>
          <div className="mt-4 max-h-[460px] overflow-auto rounded-lg border">
            <table className="min-w-[1180px] w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[16%]" />
                <col className="w-[13%]" />
                <col className="w-[24%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3">{isZh ? "组合角色" : "Portfolio Role"}</th>
                  <th className="px-3 py-3">{isZh ? "动作" : "Action"}</th>
                  <th className="px-3 py-3">{isZh ? "建议执行" : "Recommended Action"}</th>
                  <th className="px-3 py-3">{isZh ? `预计利润影响 / ${simulationHorizonDays}天` : `Estimated Profit Impact / ${simulationHorizonDays}d`}</th>
                  <th className="px-3 py-3">{isZh ? "Why This Action" : "Why This Action"}</th>
                  <th className="px-3 py-3">{isZh ? "操作" : "Action"}</th>
                  <th className="px-3 py-3">{isZh ? "决策状态" : "Decision Status"}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredDecisionRows.length ? filteredDecisionRows.map((row) => (
                  <tr key={`${row.skuId}-${row.action}-${row.sourceAction}`}>
                    <td className="px-3 py-3 font-semibold text-slate-900">{row.skuId}</td>
                    <td className="px-3 py-3"><RoleBadge role={row.skuRole ?? "PROFIT"} locale={locale} /></td>
                    <td className="px-3 py-3 font-semibold text-slate-950">
                      <DecisionBadge action={row.action ?? "MONITOR"} locale={locale} />
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      <div className="max-w-[220px] text-xs font-semibold leading-5 text-slate-800">
                        {(row.recommendedActions ?? row.recommendedExecution ?? [portfolioScenarioActionLabel(row.sourceAction, locale)])[0]}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-emerald-700">{signedCurrency(row.expectedProfitImpact ?? row.estimatedProfitImpact)}</td>
                    <td className="px-3 py-3 text-slate-700">
                      <DecisionDriversCell
                        action={row.action ?? "MONITOR"}
                        drivers={row.decisionDrivers ?? buildFallbackDecisionDrivers(portfolioRowsBySku.get(row.skuId))}
                        causalExplanation={row.causalExplanation ?? buildFallbackCausalExplanation(portfolioRowsBySku.get(row.skuId))}
                        confidenceBreakdown={row.confidence_breakdown}
                        locale={locale}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => acceptDecisionAction(row)}
                          className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => rejectDecisionAction(row)}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Reject
                        </button>
                        {portfolioRowsBySku.get(row.skuId) ? (
                          <button
                            type="button"
                            onClick={() => setSelectedOutcomeRow(portfolioRowToOutcomeRow(portfolioRowsBySku.get(row.skuId)!, locale))}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            {isZh ? "模拟详情" : "Simulation Details"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <RecommendationStatusBadge
                        status={actionStatuses[decisionRowKey(row)] === "accepted" ? "accepted" : actionStatuses[decisionRowKey(row)] === "rejected" ? "rejected" : "awaiting_decision"}
                        locale={locale}
                      />
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td className="px-3 py-6 text-sm font-medium text-slate-500" colSpan={8}>
                      {normalizedDecisionSkuSearch
                        ? (isZh ? "没有匹配的 SKU 决策。" : "No SKU decisions match this search.")
                        : (isZh ? "暂无 SKU 推荐数据。" : "No SKU recommendation rows available.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ActionOutcomeTracker rows={trackedOutcomeRows} locale={locale} onSelect={setSelectedOutcomeRow} />
        </div>
      </div>

      {selectedOutcomeRow ? (
        <ActionTrackingDrawer row={selectedOutcomeRow} locale={locale} onClose={() => setSelectedOutcomeRow(null)} />
      ) : null}
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

function PortfolioDecisionSummaryCard({
  summary,
  locale,
  activeAction,
  onActionChange
}: {
  summary: DecisionIntelligenceReportV1["portfolioSummary"];
  locale: RendererLocale;
  activeAction: PortfolioDecisionFilter;
  onActionChange: (action: PortfolioDecisionFilter) => void;
}) {
  const isZh = locale === "zh";
  const toggleAction = (action: PortfolioDecisionFilter) => {
    onActionChange(activeAction === action ? "ALL" : action);
  };

  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-950">{isZh ? "Portfolio Decision Summary" : "Portfolio Decision Summary"}</p>
          <p className="mt-1 text-xs leading-5 text-emerald-900">
            {isZh
              ? "组合层面决定下一步应该放大、降投/停止、优化或继续观察哪些 SKU。"
              : "Portfolio-level view of what to scale, reduce, optimize, or monitor next."}
          </p>
        </div>
        <div className="rounded-lg bg-emerald-900 px-4 py-3 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-100">{isZh ? "Estimated Profit Impact" : "Estimated Profit Impact"}</p>
          <p className="mt-1 text-2xl font-bold">{signedCurrency(summary.totalProfitImpact)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <DecisionSummaryMetric label="Scale" value={`${numberFormat.format(summary.scaleCount)} SKUs`} tone="success" icon="🚀" active={activeAction === "SCALE"} onClick={() => toggleAction("SCALE")} />
        <DecisionSummaryMetric label="Reduce" value={`${numberFormat.format(summary.reduceCount ?? summary.stopCount ?? 0)} SKUs`} tone="danger" icon="🛑" active={activeAction === "REDUCE"} onClick={() => toggleAction("REDUCE")} />
        <DecisionSummaryMetric label="Optimize" value={`${numberFormat.format(summary.optimizeCount ?? summary.fixCount ?? 0)} SKUs`} tone="warning" icon="🔧" active={activeAction === "OPTIMIZE"} onClick={() => toggleAction("OPTIMIZE")} />
        <DecisionSummaryMetric label="Monitor" value={`${numberFormat.format(summary.monitorCount)} SKUs`} tone="neutral" icon="◌" active={activeAction === "MONITOR"} onClick={() => toggleAction("MONITOR")} />
        <DecisionSummaryMetric label={isZh ? "Inventory Risk" : "Inventory Risk"} value={numberFormat.format(summary.inventoryRisk)} tone="warning" active={activeAction === "INVENTORY_RISK"} onClick={() => toggleAction("INVENTORY_RISK")} />
        <DecisionSummaryMetric label={isZh ? "Budget Opportunity" : "Budget Opportunity"} value={currencyDecimal.format(summary.budgetOpportunity)} tone="success" active={activeAction === "BUDGET_OPPORTUNITY"} onClick={() => toggleAction("BUDGET_OPPORTUNITY")} />
      </div>
    </div>
  );
}

function DecisionSummaryMetric({
  label,
  value,
  tone,
  icon,
  active = false,
  onClick
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "neutral";
  icon?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
      "rounded-lg bg-white p-3 text-left ring-1 transition",
      onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2",
      tone === "success" && "ring-emerald-100",
      tone === "warning" && "ring-amber-100",
      tone === "danger" && "ring-rose-100",
      tone === "neutral" && "ring-slate-100",
      active && tone === "success" && "bg-emerald-100 ring-emerald-300",
      active && tone === "warning" && "bg-amber-100 ring-amber-300",
      active && tone === "danger" && "bg-rose-100 ring-rose-300",
      active && tone === "neutral" && "bg-slate-100 ring-slate-300"
    );
  const content = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{icon ? `${icon} ` : ""}{label}</p>
      <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={active}>
        {content}
      </button>
    );
  }

  return (
    <div className={className}>
      {content}
    </div>
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

function PortfolioAllocationPanel({
  allocation,
  locale
}: {
  allocation: DecisionIntelligenceReportV1["allocationRecommendation"];
  locale: RendererLocale;
}) {
  const isZh = locale === "zh";

  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-sm font-semibold text-slate-950">{isZh ? "Portfolio Impact" : "Portfolio Impact"}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {isZh
          ? "展示资源如何从收入导向迁移到利润优化导向。"
          : "Shows how resources move from revenue-focused allocation to profit-optimized allocation."}
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <AllocationColumn title={isZh ? "Before: Revenue-focused" : "Before: Revenue-focused"} rows={allocation.current} />
        <AllocationColumn title={isZh ? "After: Profit-optimized allocation" : "After: Profit-optimized allocation"} rows={allocation.recommended} accent />
      </div>
      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
        {localizeDecisionText(allocation.narrative, locale)}
      </p>
    </div>
  );
}

function AllocationColumn({
  title,
  rows,
  accent = false
}: {
  title: string;
  rows: Array<{ bucket: string; share: number; amount: number }>;
  accent?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border p-3", accent ? "border-emerald-100 bg-emerald-50/50" : "bg-slate-50")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.bucket}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-700">{row.bucket}</span>
              <span className="text-slate-500">{percent.format(row.share)} · {currencyDecimal.format(row.amount)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-100">
              <div className={cn("h-full rounded-full", accent ? "bg-emerald-500" : "bg-slate-400")} style={{ width: `${Math.max(2, Math.min(100, row.share * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
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

function ActionOutcomeTracker({ rows, locale, onSelect }: { rows: ActionOutcomeRow[]; locale: RendererLocale; onSelect: (row: ActionOutcomeRow) => void }) {
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

function localizeDecisionText(text: string, locale: RendererLocale) {
  if (locale !== "zh") return text;
  return text
    .replace("Estimated marginal profit impact is", "预计边际利润影响")
    .replace("Margin remains stable or improves in the selected simulation.", "所选模拟中利润率保持稳定或改善。")
    .replace("Inventory can support the simulated demand window.", "库存可承接模拟需求窗口。")
    .replace("Portfolio solver favors reducing exposure versus keeping current allocation.", "组合求解器倾向于降低曝光，而不是维持当前分配。")
    .replace("Ad budget can be protected or reallocated.", "广告预算可被保护或重新分配。")
    .replace("Predicted margin is below the portfolio threshold.", "预测利润率低于组合阈值。")
    .replace("Price simulation indicates margin can be improved before scaling.", "价格模拟显示放大前可先改善利润率。")
    .replace("Inventory coverage constrains the growth scenario.", "库存覆盖限制了增长方案。")
    .replace("The fix improves contribution margin.", "该修复动作可改善贡献利润率。")
    .replace("Current evidence is not strong enough for immediate scale or stop action.", "当前证据不足以立即放大或停止。")
    .replace("Revenue simulation changes by", "收入模拟变化")
    .replace("Budget is shifted from lower-response exposure toward SKUs with stronger estimated marginal profit.", "预算从低响应曝光转向预计边际利润更强的 SKU。")
    .replace("Current budget stays constrained while the portfolio is filtered toward higher-confidence profit actions.", "当前预算保持约束，同时组合筛选到更高可信度的利润动作。")
    .replace("was selected over", "优于")
    .replace("because its opportunity score is", "因为机会分数为")
    .replace("versus", "对比")
    .replace("Higher-priority SKUs such as", "排序更靠前的 SKU 如")
    .replace("receive allocation first because their simulated profit impact is stronger.", "会先获得资源，因为模拟利润影响更强。")
    .replace("This SKU is among the highest-ranked portfolio opportunities in the current simulation set.", "该 SKU 属于当前模拟集中排名最高的组合机会。");
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

function RiskBadge({ value }: { value: string }) {
  const normalized = value || "unknown";
  const tone = normalized === "high" ? "danger" : normalized === "medium" ? "warning" : normalized === "low" ? "success" : "neutral";
  return <Badge tone={tone}>{normalized}</Badge>;
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return <Badge tone="neutral">No Data</Badge>;
  const tone = value < 0.3 ? "danger" : value < 0.6 ? "warning" : "success";
  return <Badge tone={tone}>{percent.format(value)}</Badge>;
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
