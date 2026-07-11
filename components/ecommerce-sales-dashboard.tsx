"use client";

import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Database,
  LineChart as LineChartIcon,
  PackageSearch,
  ReceiptText,
  RefreshCcw,
  ShoppingCart,
  TrendingUp
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EcommerceSalesDashboardData } from "@/lib/dashboard/ecommerce-sales-dashboard-data";
import { useState } from "react";

type Props = {
  data: EcommerceSalesDashboardData;
  state: "ready" | "empty" | "unavailable";
  message?: string;
  embedded?: boolean;
  lineage?: {
    schemaSnapshotId: string;
    dataSourceId: string | null;
    manifestKey?: string;
    syncRunId?: string;
  };
};

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const currencyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const decimalCurrencyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

export function EcommerceSalesDashboard({ data, state, message, embedded = false, lineage }: Props) {
  const isEmpty = state !== "ready";
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const qualityVariant = data.quality.confidence_score >= 0.85 ? "success" : data.quality.confidence_score >= 0.55 ? "warning" : "secondary";
  const Root = embedded ? "section" : "main";

  const runConnectorSync = async () => {
    setIsSyncing(true);
    setSyncError(null);

    try {
      const response = await fetch("/api/connectors/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lineage?.dataSourceId ? { dataSourceId: lineage.dataSourceId } : {})
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || "Connector sync failed.");
      }

      window.location.reload();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Connector sync failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Root className={embedded ? "w-full" : "min-h-screen bg-slate-50"}>
      <div className={embedded ? "flex w-full flex-col gap-6" : "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"}>
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">
              <Database className="h-4 w-4" />
              ecommerce_canonical_v1
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">E-commerce Sales Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Canonical sales metrics across connected commerce platforms.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={qualityVariant}>Confidence {percentFormat.format(data.quality.confidence_score)}</Badge>
            <Badge variant="secondary">Coverage {percentFormat.format(data.quality.data_coverage)}</Badge>
            {data.metadata.source_platforms.map((platform) => (
              <Badge key={platform} variant="secondary">{platform}</Badge>
            ))}
          </div>
        </header>

        {isEmpty ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="font-medium text-amber-950">{message ?? "No canonical ecommerce data is available."}</p>
                <p className="mt-1 text-sm text-amber-800">
                  Run a connector sync that produces ecommerce canonical artifacts, then reload this dashboard.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button type="button" size="sm" onClick={runConnectorSync} disabled={isSyncing}>
                    {isSyncing ? "Running sync..." : "Run Connector Sync"}
                  </Button>
                  {syncError ? <span className="text-sm font-medium text-amber-900">{syncError}</span> : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={TrendingUp} label="Total Revenue" value={currencyFormat.format(data.metrics.revenue)} />
          <MetricCard icon={ShoppingCart} label="Orders Count" value={numberFormat.format(data.metrics.orders)} />
          <MetricCard icon={ReceiptText} label="AOV" value={decimalCurrencyFormat.format(data.metrics.aov)} />
          <MetricCard icon={RefreshCcw} label="Refund Rate" value={percentFormat.format(data.metrics.refund_rate)} />
          <MetricCard icon={Boxes} label="Total SKU Count" value={numberFormat.format(data.metrics.total_sku_count)} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LineChartIcon className="h-4 w-4 text-emerald-700" />
                Revenue Trend
              </CardTitle>
              <CardDescription>
                Daily revenue with latest-period growth {data.trends.growth_rate === null ? "unavailable" : percentFormat.format(data.trends.growth_rate)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartEmpty rows={data.trends.daily_revenue} label="No dated revenue rows available." />
              {data.trends.daily_revenue.length ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trends.daily_revenue} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => currencyFormat.format(Number(value))} />
                      <Line type="monotone" dataKey="revenue" stroke="#047857" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-emerald-700" />
                Aggregation
              </CardTitle>
              <CardDescription>Weekly and monthly revenue rollups.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <MiniTable
                rows={data.trends.weekly_revenue.slice(-6).map((row) => ({ label: row.period, value: currencyFormat.format(row.revenue) }))}
                emptyLabel="No weekly revenue."
              />
              <MiniTable
                rows={data.trends.monthly_revenue.slice(-6).map((row) => ({ label: row.period, value: currencyFormat.format(row.revenue) }))}
                emptyLabel="No monthly revenue."
              />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PackageSearch className="h-4 w-4 text-emerald-700" />
                SKU / Product Analysis
              </CardTitle>
              <CardDescription>
                Top SKU share {formatNullablePercent(data.sku_analysis.concentration.top_sku_share)} · concentration {data.sku_analysis.concentration.risk_level}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <RankingTable
                headers={["SKU", "Revenue", "Qty", "Share"]}
                rows={data.sku_analysis.top_skus.map((row) => [
                  row.sku,
                  currencyFormat.format(row.revenue),
                  numberFormat.format(row.quantity),
                  percentFormat.format(row.share)
                ])}
                emptyLabel="No SKU revenue rows."
              />
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Product Catalog Preview</p>
                  <p className="text-xs text-slate-500">Products and variants from canonical catalog data.</p>
                </div>
                <RankingTable
                  headers={["Product", "SKU", "Variant"]}
                  rows={data.sku_analysis.catalog_preview.map((row) => [
                    row.product_name,
                    row.sku,
                    compactId(row.variant_id)
                  ])}
                  emptyLabel="No product catalog rows."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-emerald-700" />
                Product Performance
              </CardTitle>
              <CardDescription>Revenue ranking by canonical product_id.</CardDescription>
            </CardHeader>
            <CardContent>
              <RankingTable
                headers={["Product", "Revenue", "Qty", "Share"]}
                rows={data.sku_analysis.product_performance.map((row) => [
                  row.product_name || row.product_id,
                  currencyFormat.format(row.revenue),
                  numberFormat.format(row.quantity),
                  percentFormat.format(row.share)
                ])}
                emptyLabel="No product performance rows."
              />
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <RefreshCcw className="h-4 w-4 text-emerald-700" />
                Refund Insights
              </CardTitle>
              <CardDescription>
                Refund amount {currencyFormat.format(data.refund_insights.refund_amount)} · rate {percentFormat.format(data.refund_insights.refund_rate)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {data.refund_insights.refund_trend.length ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.refund_insights.refund_trend} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => currencyFormat.format(Number(value))} />
                      <Bar dataKey="refund_amount" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">No refund trend rows.</p>
              )}
              <RankingTable
                headers={["Product", "Refund", "Qty"]}
                rows={data.refund_insights.top_refunded_products.map((row) => [
                  row.product_name || row.sku || row.product_id,
                  currencyFormat.format(row.refund_amount),
                  numberFormat.format(row.quantity)
                ])}
                emptyLabel="No refunded products."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="h-4 w-4 text-emerald-700" />
                Product Catalog Insights
              </CardTitle>
              <CardDescription>
                Products {numberFormat.format(data.catalog_health.product_count)} · Variants {numberFormat.format(data.catalog_health.variant_count)} · SKU density {data.catalog_health.sku_density === null ? "n/a" : data.catalog_health.sku_density.toFixed(2)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CatalogStat label="Products" value={numberFormat.format(data.catalog_health.product_count)} />
                <CatalogStat label="Variants" value={numberFormat.format(data.catalog_health.variant_count)} />
                <CatalogStat label="SKUs" value={numberFormat.format(data.catalog_health.sku_count)} />
                <CatalogStat label="Untracked" value={numberFormat.format(data.catalog_health.untracked_sku_count)} />
              </div>
              <MiniTable
                rows={[
                  { label: "Tracked SKUs", value: numberFormat.format(data.catalog_health.tracked_sku_count) },
                  { label: "Catalog rows", value: numberFormat.format(data.catalog_health.catalog_row_count) },
                  { label: "Top product share", value: formatNullablePercent(data.catalog_health.product_concentration) }
                ]}
              />
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.catalog_health.price_distribution} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data Quality</CardTitle>
              <CardDescription>Canonical coverage and estimated metrics.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <MiniTable
                rows={[
                  { label: "Confidence score", value: percentFormat.format(data.quality.confidence_score) },
                  { label: "Data coverage", value: percentFormat.format(data.quality.data_coverage) },
                  { label: "Estimated metrics", value: data.quality.estimated_metrics.length ? data.quality.estimated_metrics.join(", ") : "None" }
                ]}
              />
              {data.quality.missing_fields.length ? (
                <div className="flex flex-wrap gap-2">
                  {data.quality.missing_fields.map((field) => (
                    <Badge key={field} variant="warning">{field}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">No missing canonical fields detected for computed metrics.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lineage</CardTitle>
              <CardDescription>Bound to the current canonical schema snapshot.</CardDescription>
            </CardHeader>
            <CardContent>
              <MiniTable
                rows={[
                  { label: "Schema snapshot", value: lineage?.schemaSnapshotId ?? "n/a" },
                  { label: "Data source", value: lineage?.dataSourceId ?? "n/a" },
                  { label: "Sync run", value: lineage?.syncRunId ?? "n/a" },
                  { label: "Manifest", value: lineage?.manifestKey ?? "n/a" }
                ]}
              />
            </CardContent>
          </Card>
        </section>
      </div>
    </Root>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof TrendingUp; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-28 flex-col justify-between p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <Icon className="h-4 w-4 text-emerald-700" />
        </div>
        <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      </CardContent>
    </Card>
  );
}

function RankingTable({ headers, rows, emptyLabel }: { headers: string[]; rows: string[][]; emptyLabel: string }) {
  if (!rows.length) {
    return <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="truncate px-3 py-2 text-slate-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniTable({ rows, emptyLabel = "No rows." }: { rows: Array<{ label: string; value: string }>; emptyLabel?: string }) {
  if (!rows.length) return <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">{emptyLabel}</p>;

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <span className="truncate text-slate-600">{row.label}</span>
          <span className="truncate font-medium text-slate-950">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function CatalogStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ChartEmpty({ rows, label }: { rows: unknown[]; label: string }) {
  if (rows.length) return null;

  return <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">{label}</p>;
}

function formatNullablePercent(value: number | null | undefined) {
  return value === null || value === undefined ? "n/a" : percentFormat.format(value);
}

function compactId(value: string) {
  if (!value || value === "n/a") return "n/a";
  const parts = value.split(/[/:]/).filter(Boolean);

  return parts.at(-1) ?? value;
}
