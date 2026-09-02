import type { CanonicalEcommerceMetricOutput } from "@/lib/metrics/canonical-ecommerce-metric-engine";
import type { AnalyticsValidationResult } from "@/lib/analytics/analytics-validation-engine";
import { buildDecisionIntelligenceV2, type DecisionIntelligenceV2 } from "@/lib/insight/counterfactual-engine";
import { buildAutonomousCommerceRuntime, type AutonomousCommerceRuntime } from "@/lib/runtime/autonomous-commerce-runtime";
import { generatePortfolioOptimizationReport, type PortfolioOptimizationBusinessReport } from "@/lib/optimization/optimization-report-generator";
import {
  optimizeSkuPortfolio,
  type PortfolioAllocationRecommendation,
  type PortfolioExecutionStep,
  type PortfolioOptimizationResult,
  type PortfolioRiskAlert,
  type SKUDecision,
  type DecisionSummary
} from "@/lib/optimization/portfolio-optimizer";
import { DEFAULT_OPTIMIZATION_POLICY } from "@/lib/optimization/policy/default-policies";
import { dynamicThresholdProfileFromPolicy } from "@/lib/optimization/policy/optimization-policy";
import type { AdsCampaignInput, CompetitiveContext, PortfolioSkuInput } from "@/lib/optimization/profit-simulation-engine";
import type { SkuAttributionMethod, SkuRoasStatus } from "@/lib/sku/sku-profit-allocation-engine";
import { calculateSkuProfitability, type CogsStatus, type ProfitValidationStatus } from "@/lib/profit/canonical-profitability-engine";
import { buildSkuOptimizationAlgorithm, type SkuOptimizationAlgorithmOutput } from "@/lib/sku/sku-optimization-engine";
import { isRevenueChannel, normalizeRevenueChannel } from "@/lib/channels/revenue-channel";
import type { DemandTrend, InventoryDecision } from "@/lib/inventory/inventory-decision-engine";

type MetricOutput = CanonicalEcommerceMetricOutput & {
  metrics: CanonicalEcommerceMetricOutput["metrics"] & {
    total_sku_count?: number;
  };
  decisionMode?: "full" | "sku";
};

type ProfitControlDriver =
  | "Revenue"
  | "Cost"
  | "Ad Spend"
  | "Conversion"
  | "Pricing"
  | "Channel Mix"
  | "Inventory"
  | "Returns"
  | "CAC";

type DecisionSignal =
  | "increase_ads"
  | "decrease_ads"
  | "adjust_price"
  | "reallocate_budget"
  | "reduce_sku_exposure"
  | "inventory_action"
  | "increase_cac_efficiency_focus"
  | "stop_scaling_negative_margin_skus";

type SkuBehaviorSignal =
  | "Profit driver SKU"
  | "Traffic generator SKU"
  | "Margin erosion SKU"
  | "Inventory risk SKU"
  | "Growth unstable SKU"
  | "Stable profit SKU";

export type ProfitControlInsight = {
  insight_id: string;
  sku: string;
  time_period: string;
  profit_change: {
    absolute: number;
    percentage: number;
  };
  root_causes: Array<{
    driver: ProfitControlDriver;
    impact: number;
    direction: "positive" | "negative";
    affected_channel: string;
    affected_skus: string[];
  }>;
  causal_chain: string[];
  cross_channel_effects: string[];
  decision_signals: DecisionSignal[];
  confidence_score: number;
  severity: "low" | "medium" | "high" | "critical";
};

export type SkuClassificationSignal = {
  sku: string;
  labels: Array<{
    signal: SkuBehaviorSignal;
    confidence_score: number;
    supporting_metrics: Record<string, number | string | null>;
    trend_direction: "positive" | "negative" | "stable" | "unknown";
  }>;
};

export type DecisionIntelligenceReportV1 = {
  executive_summary: {
    revenue: number;
    net_profit: number;
    margin: number;
    roas: number;
    mer: number;
    sku_count: number;
    customer_count: number;
    health_score: number;
    health_label: "strong" | "stable" | "limited" | "insufficient";
  };
  performance_overview: {
    revenue: number;
    orders: number;
    paid_orders?: number;
    cancelled_orders?: number;
    aov: number;
    gross_profit: number;
    net_profit: number;
    margin: number;
    ad_spend: number;
    roas: number;
    cac: number | null;
  };
  sku_breakdown: {
    top_revenue_skus: Array<{
      sku: string;
      product_name?: string;
      category?: string;
      variant_name?: string;
      size?: string;
      color?: string;
      revenue: number;
      quantity: number;
      share?: number;
      stock_level?: number | null;
      available_stock?: number | null;
      sales_velocity?: number;
      normalized_daily_sales_velocity?: number;
      velocity_window_days?: number;
      calculation_window_days?: number;
      velocity_calculation_basis?: "30-day normalized estimate" | "observed order window";
      velocity_confidence?: "HIGH" | "MEDIUM" | "LOW";
      data_period_days?: number;
      inventory_risk_status?: "OK" | "INSUFFICIENT_DATA" | "STOCKOUT_RISK" | "LOW_CONFIDENCE_STOCK_RISK" | "EXCESS_INVENTORY" | "OVERSTOCK_RISK" | "LIQUIDATION_RISK" | "HEALTHY" | "OBSERVATION";
      days_of_inventory?: number | null;
      inventory_confidence?: number;
      lifecycle_stage?: string;
      lifecycle_confidence?: "HIGH" | "MEDIUM" | "LOW";
      demand_trend?: DemandTrend;
      inventory_decision?: InventoryDecision;
      inventory_risk_score?: number;
      inventory_recommended_action?: InventoryDecision["recommended_action"];
      inventory_risk_reason?: string;
      inventory_value?: number | null;
      paid_dependency_score?: number;
      organic_sales_ratio?: number;
      estimated: boolean;
    }>;
    top_profit_skus: Array<{
      sku: string;
      product_name?: string;
      category?: string;
      variant_name?: string;
      size?: string;
      color?: string;
      revenue: number;
      net_profit: number;
      margin: number;
      quantity: number;
      contribution: number;
      sku_roas: number;
      roas_value?: number | null;
      roas_display?: string;
      roas_status?: SkuRoasStatus;
      attribution_method?: SkuAttributionMethod;
      attribution_confidence?: number;
      total_cost: number;
      gross_profit?: number;
      operating_cost?: number;
      contribution_profit?: number;
      ad_cost_allocated: number | null;
      profit_confidence: number;
      profitability_confidence?: number;
      validation_status?: ProfitValidationStatus;
      optimization_allowed?: boolean;
      warnings?: string[];
      cogs_status?: CogsStatus;
      cogs_confidence?: number;
      channel_breakdown: Record<string, number>;
      channel_details?: Array<{
        platform: string;
        revenue: number;
        quantity: number;
        profit: number;
        margin: number;
        share: number;
      }>;
      ad_allocation_method: "direct" | "campaign_window" | "campaign_revenue_share" | "conversion_share" | "revenue_share" | "equal_distribution" | "unavailable" | "unknown" | "none";
      ad_allocation_confidence: number;
      attribution_source?: "meta_ads" | "amazon_ads" | "shopify_ads" | "campaign_attribution" | "sku_allocation" | "revenue_share_fallback" | "unknown" | "none";
      attributed_campaigns?: Array<{
        campaign_id: string;
        raw_spend: number;
        attributed_revenue: number;
        allocated_spend: number;
        allocation_method: "direct" | "campaign_revenue_share";
      }>;
      ads_validation_status?: "PASSED" | "FAILED" | "UNKNOWN";
      ads_validation_warnings?: string[];
      ads_lineage?: {
        raw_platform_spend: number;
        sku_direct_attribution: number;
        campaign_allocation: number;
        revenue_share_fallback: number;
        final_allocated_ads: number | null;
      };
      campaign_ids?: string[];
      attribution_window_start?: string | null;
      attribution_window_end?: string | null;
      cost_breakdown: {
        cogs: number;
        shipping: number;
        ads: number;
        platform_fee: number;
        payment_fee: number;
        fulfillment: number;
        refund: number;
      };
      stock_level?: number | null;
      available_stock?: number | null;
      sales_velocity?: number;
      normalized_daily_sales_velocity?: number;
      velocity_window_days?: number;
      calculation_window_days?: number;
      velocity_calculation_basis?: "30-day normalized estimate" | "observed order window";
      velocity_confidence?: "HIGH" | "MEDIUM" | "LOW";
      data_period_days?: number;
      inventory_risk_status?: "OK" | "INSUFFICIENT_DATA" | "STOCKOUT_RISK" | "LOW_CONFIDENCE_STOCK_RISK" | "EXCESS_INVENTORY" | "OVERSTOCK_RISK" | "LIQUIDATION_RISK" | "HEALTHY" | "OBSERVATION";
      days_of_inventory?: number | null;
      stockout_risk?: "high" | "medium" | "low" | "unknown";
      overstock_risk?: "high" | "medium" | "low" | "unknown";
      refund_rate?: number;
      refund_risk?: "high" | "medium" | "low" | "unknown";
      margin_risk?: boolean;
      channel_concentration_risk?: boolean;
      attribution_risk?: boolean;
      overall_risk_score?: number;
      inventory_confidence?: number;
      lifecycle_stage?: string;
      lifecycle_confidence?: "HIGH" | "MEDIUM" | "LOW";
      demand_trend?: DemandTrend;
      inventory_decision?: InventoryDecision;
      inventory_risk_score?: number;
      inventory_recommended_action?: InventoryDecision["recommended_action"];
      inventory_risk_reason?: string;
      inventory_value?: number;
      paid_dependency_score?: number;
      organic_sales_ratio?: number;
      estimated_components: string[];
      estimated: boolean;
    }>;
    sku_concentration: {
      top_sku_revenue_share: number;
      top_5_revenue_share: number;
      concentration_level: "low" | "medium" | "high" | "unknown";
    };
  };
  ads_breakdown: {
    ad_spend: number;
    roas: number;
    mer: number;
    cac: number | null;
    campaign_performance: Array<{
      campaign_id: string;
      ad_spend: number;
      revenue: number;
      roas: number | null;
      estimated: boolean;
      attribution_status?: "attributed" | "missing";
      attribution_source?: "campaign_attribution";
      attribution_confidence?: number;
    }>;
    campaignRevenueCoverage?: number;
    skuRevenueCoverage?: number;
    fallbackUsed?: boolean;
    spend_distribution: Array<{ campaign_id: string; ad_spend: number; share: number }>;
  };
  customer_breakdown: {
    customer_count: number;
    ltv: number;
    avg_order_value_per_customer: number;
    repeat_purchase_rate: number;
    new_vs_returning_ratio: number;
    acquisition_cost: number | null;
    median_ltv: number;
    p90_ltv: number;
    p95_ltv: number;
    p99_ltv: number;
    top_10_percent_revenue_share: number;
    top_1_percent_revenue_share: number;
    active_customers: number;
    inactive_customers: number;
    avg_orders_per_customer: number;
    purchase_frequency: number;
    new_customers: number;
    dormant_customers: number;
    churned_customers: number;
    avg_customer_lifetime_days: number;
    cohort_by_first_purchase_month: Array<{
      cohort_month: string;
      customers: number;
      revenue: number;
      avg_ltv: number;
      retention_7d: number;
      retention_30d: number;
    }>;
    cohort_retention_7d: number | null;
    cohort_retention_30d: number | null;
    cohort_ltv_curve: Array<{ cohort_month: string; day_0: number; day_7: number; day_30: number; total_ltv: number }>;
    revenue_per_customer_segment: Array<{ segment: string; customers: number; revenue: number; share: number }>;
    profit_per_customer_segment: Array<{ segment: string; customers: number; profit: number; share: number }>;
    ads_cost_per_customer_segment: Array<{ segment: string; customers: number; ad_cost: number; share: number }>;
    ltv_cac_ratio: number | null;
    cac_by_cohort: Array<{ cohort_month: string; cac: number }>;
    payback_period_days: number | null;
    customer_lifecycles?: Array<{
      customer_id: string;
      first_order_date: string;
      last_order_date: string;
      lifetime_days: number;
    }>;
    median_customer_lifetime_days?: number;
    ltv_confidence?: "HIGH" | "MEDIUM" | "LOW";
    cac_confidence?: "HIGH" | "MEDIUM" | "LOW";
    cohort_confidence?: "HIGH" | "MEDIUM" | "LOW";
    customer_metric_confidence?: "HIGH" | "MEDIUM" | "LOW";
    cac?: number | null;
    cac_status?: "OK" | "INSUFFICIENT_CUSTOMER_HISTORY";
    warnings?: string[];
  };
  growth_overview: {
    revenue_growth_rate: number;
    order_growth_rate: number;
    sku_growth_rate: number;
    daily: CanonicalEcommerceMetricOutput["metrics"]["growth"]["daily"];
    weekly: CanonicalEcommerceMetricOutput["metrics"]["growth"]["weekly"];
    monthly: CanonicalEcommerceMetricOutput["metrics"]["growth"]["monthly"];
  };
  data_quality: {
    confidence_score: number;
    profit_confidence: number;
    data_coverage: number;
    missing_fields: string[];
    estimated_metrics: string[];
    data_quality_components: CanonicalEcommerceMetricOutput["metadata"]["data_quality_components"];
    analytics_validation?: AnalyticsValidationResult;
  };
  analytics_validation?: AnalyticsValidationResult;
  decision_intelligence_v2: DecisionIntelligenceV2;
  autonomous_commerce_runtime: AutonomousCommerceRuntime;
  sku_optimization_algorithm: SkuOptimizationAlgorithmOutput;
  sku_portfolio_optimization: PortfolioOptimizationResult;
  sku_portfolio_report: PortfolioOptimizationBusinessReport;
  portfolioSummary: DecisionSummary;
  allocationRecommendation: PortfolioAllocationRecommendation;
  skuDecisions: SKUDecision[];
  riskAlerts: PortfolioRiskAlert[];
  executionPlan: PortfolioExecutionStep[];
  profit_control_insights: ProfitControlInsight[];
  sku_classification_signals: SkuClassificationSignal[];
  insight_summary: string;
  metadata: {
    report_version: "decision_intelligence_v1";
    generated_at: string;
    input: "metric_engine_output_only";
    analysis_only: true;
  };
};

export function buildDecisionIntelligenceReportV1(metricOutput: MetricOutput): DecisionIntelligenceReportV1 {
  const metrics = metricOutput.metrics;
  const metadata = metricOutput.metadata;
  const profitabilityRevenue = Number.isFinite(metrics.business.revenue)
    ? metrics.business.revenue
    : metrics.core.revenue;
  const paidOrderCount = metrics.core.paid_orders && metrics.core.paid_orders > 0
    ? metrics.core.paid_orders
    : metrics.core.orders;
  const profitabilityAov = paidOrderCount > 0 ? roundCurrency(profitabilityRevenue / paidOrderCount) : 0;
  const totalSkuRevenue = metrics.core.sku_revenue.reduce((sum, row) => sum + row.revenue, 0);
  const economicsBySku = new Map(metrics.business.sku_unit_economics.map((row) => [row.sku, row]));
  const topRevenueSkus = metrics.core.sku_revenue.map((row) => {
    const economics = economicsBySku.get(row.sku);
    return {
      sku: row.sku,
      product_name: row.product_name,
      category: row.category,
      variant_name: row.variant_name,
      size: row.size,
      color: row.color,
      revenue: row.revenue,
      quantity: row.quantity,
      share: totalSkuRevenue > 0 ? roundRatio(row.revenue / totalSkuRevenue) : 0,
      stock_level: economics?.stock_level ?? null,
      available_stock: economics?.available_stock ?? null,
      sales_velocity: economics?.sales_velocity,
      normalized_daily_sales_velocity: economics?.normalized_daily_sales_velocity,
      velocity_window_days: economics?.velocity_window_days,
      calculation_window_days: economics?.calculation_window_days,
      velocity_calculation_basis: economics?.velocity_calculation_basis,
      velocity_confidence: economics?.velocity_confidence,
      data_period_days: economics?.data_period_days,
      inventory_risk_status: economics?.inventory_risk_status,
      days_of_inventory: economics?.days_of_inventory ?? null,
      inventory_confidence: economics?.inventory_confidence,
      lifecycle_stage: economics?.lifecycle_stage,
      lifecycle_confidence: economics?.lifecycle_confidence,
      demand_trend: economics?.demand_trend,
      inventory_decision: economics?.inventory_decision,
      inventory_risk_score: economics?.inventory_risk_score,
      inventory_recommended_action: economics?.inventory_recommended_action,
      inventory_risk_reason: economics?.inventory_risk_reason,
      inventory_value: economics?.inventory_value ?? null,
      paid_dependency_score: economics?.paid_dependency_score,
      organic_sales_ratio: economics?.organic_sales_ratio,
      estimated: row.estimated
    };
  });
  const topProfitSkus = metrics.business.sku_unit_economics.map((row) => ({
    sku: row.sku,
    product_name: row.product_name,
    category: row.category,
    variant_name: row.variant_name,
    size: row.size,
    color: row.color,
    revenue: row.revenue,
    net_profit: row.net_profit,
    margin: row.margin,
    quantity: row.quantity,
    contribution: row.contribution,
    sku_roas: row.sku_roas,
    roas_value: row.roas_value,
    roas_display: row.roas_display,
    roas_status: row.roas_status,
    attribution_method: row.attribution_method,
    attribution_confidence: row.attribution_confidence,
    gross_profit: row.gross_profit,
    operating_cost: row.operating_cost,
    contribution_profit: row.contribution_profit,
    total_cost: row.total_cost,
    ad_cost_allocated: row.ad_cost_allocated,
    profit_confidence: row.profit_confidence,
    profitability_confidence: row.profitability_confidence,
    validation_status: row.validation_status,
    optimization_allowed: row.optimization_allowed,
    warnings: row.warnings,
    cogs_status: row.cogs_status,
    cogs_confidence: row.cogs_confidence,
    channel_breakdown: row.channel_breakdown,
    channel_details: row.channel_details,
    ad_allocation_method: row.ad_allocation_method,
    ad_allocation_confidence: row.ad_allocation_confidence,
    campaign_ids: row.campaign_ids,
    attribution_window_start: row.attribution_window_start,
    attribution_window_end: row.attribution_window_end,
    cost_breakdown: row.cost_breakdown,
    stock_level: row.stock_level,
    available_stock: row.available_stock,
    sales_velocity: row.sales_velocity,
    velocity_window_days: row.velocity_window_days,
    velocity_confidence: row.velocity_confidence,
    data_period_days: row.data_period_days,
    inventory_risk_status: row.inventory_risk_status,
    days_of_inventory: row.days_of_inventory,
    stockout_risk: row.stockout_risk,
    overstock_risk: row.overstock_risk,
    refund_rate: row.refund_rate,
    refund_risk: row.refund_risk,
    margin_risk: row.margin_risk,
    channel_concentration_risk: row.channel_concentration_risk,
    attribution_risk: row.attribution_risk,
    overall_risk_score: row.overall_risk_score,
    inventory_confidence: row.inventory_confidence,
    lifecycle_stage: row.lifecycle_stage,
    lifecycle_confidence: row.lifecycle_confidence,
    demand_trend: row.demand_trend,
    inventory_decision: row.inventory_decision,
    inventory_risk_score: row.inventory_risk_score,
    inventory_recommended_action: row.inventory_recommended_action,
    inventory_risk_reason: row.inventory_risk_reason,
    inventory_value: row.inventory_value,
    paid_dependency_score: row.paid_dependency_score,
    organic_sales_ratio: row.organic_sales_ratio,
    estimated_components: row.estimated_components,
    estimated: row.estimated
  }));
  const optimizationReadiness = assessOptimizationReadiness({
    metrics,
    metadata,
    topProfitSkus,
    topRevenueSkus
  });
  const shouldDeferPortfolioOptimization = !optimizationReadiness.canOptimize;
  const top5Revenue = topRevenueSkus.slice(0, 5).reduce((sum, row) => sum + row.revenue, 0);
  const topSkuShare = topRevenueSkus[0]?.share ?? 0;
  const campaignSpend = metrics.attribution.campaign_performance.reduce((sum, row) => sum + row.ad_spend, 0);
  const healthScore = businessHealthScore({
    margin: metrics.business.margin,
    roas: metrics.business.roas,
    confidence: metadata.confidence_score,
    dataCoverage: metadata.data_coverage
  });
  const analysisSkuRows = shouldDeferPortfolioOptimization ? topProfitSkus.slice(0, 100) : topProfitSkus;
  const profitControlInsights = buildProfitControlInsights({
    skuRows: analysisSkuRows,
    totalRevenue: profitabilityRevenue,
    totalNetProfit: metrics.business.net_profit,
    portfolioMargin: metrics.business.margin,
    overallRevenueGrowthRate: metrics.growth.revenue_growth_rate,
    overallOrderGrowthRate: metrics.growth.order_growth_rate,
    confidence: metadata.confidence_score
  });
  const skuClassificationSignals = buildSkuClassificationSignals(analysisSkuRows);
  const decisionIntelligenceV2 = buildDecisionIntelligenceV2(profitControlInsights);
  const autonomousCommerceRuntime = buildAutonomousCommerceRuntime({
    decision_intelligence_v2: decisionIntelligenceV2,
    sku_rows: topProfitSkus,
    campaign_rows: metrics.attribution.campaign_performance.slice(0, 10).map((row) => ({
      ...row,
      roas: row.roas ?? 0
    })),
    confidence_score: metadata.confidence_score
  });
  const skuOptimizationAlgorithm = buildSkuOptimizationAlgorithm({
    rows: shouldDeferPortfolioOptimization
      ? []
      : topProfitSkus.map((row) => ({
        sku: row.sku,
        revenue: row.revenue,
        quantity: row.quantity,
        price: row.quantity > 0 ? roundCurrency(row.revenue / row.quantity) : 0,
        cogs: row.cost_breakdown.cogs,
        operating_cost: row.operating_cost ?? Math.max(0, row.total_cost - row.cost_breakdown.cogs - (row.ad_cost_allocated ?? 0)),
        net_profit: row.net_profit,
        ads_spend: row.ad_cost_allocated ?? 0,
        inventory: row.available_stock ?? row.stock_level ?? 0,
        sales_velocity: row.sales_velocity ?? 0,
        sales_velocity_confidence: row.velocity_confidence,
        margin: row.margin
      })),
    total_ad_budget: metrics.ads.ad_spend
  });
  const portfolioInputSkus = shouldDeferPortfolioOptimization ? [] : buildPortfolioOptimizationSkuInputs({
    profitRows: topProfitSkus,
    revenueRows: topRevenueSkus,
    metrics,
    confidence: optimizationReadiness.optimizationConfidenceScore
  });
  const portfolioAdsBudget = shouldDeferPortfolioOptimization ? metrics.ads.ad_spend : Math.max(
    metrics.ads.ad_spend,
    portfolioInputSkus.reduce((sum, row) => sum + row.ads_spend, 0)
  );
  const skuPortfolioOptimization = shouldDeferPortfolioOptimization
    ? buildDeferredPortfolioOptimization({
        inputSkuCount: metrics.total_sku_count ?? topRevenueSkus.length,
        currentProfit: metrics.business.net_profit,
        adsBudget: portfolioAdsBudget,
        confidence: optimizationReadiness.optimizationConfidenceScore,
        reasons: optimizationReadiness.blockingReasons
      })
    : withOptimizationReadinessMetadata(optimizeSkuPortfolio({
        skus: portfolioInputSkus,
        ads: buildOptimizationAdsInput({
          campaigns: metrics.attribution.campaign_performance,
          skus: portfolioInputSkus
        }),
        constraints: {
          total_ads_budget: Math.max(1, portfolioAdsBudget),
          inventory_capacity: Math.max(1, portfolioInputSkus.reduce((sum, row) => sum + row.inventory, 0)),
          available_cash: Math.max(1, metrics.business.net_profit + metrics.ads.ad_spend),
          target_margin: Math.max(0.1, Math.min(0.35, metrics.business.margin || 0.18)),
          max_price_change: 0.2,
          minimum_profit: 0,
          minimum_confidence: optimizationReadiness.optimizationConfidenceScore >= 0.7 ? 0.45 : 0.25,
          simulation_horizon_days: 30
        }
      }), optimizationReadiness);
  const skuPortfolioReport = shouldDeferPortfolioOptimization
    ? buildDeferredPortfolioOptimizationReport()
    : generatePortfolioOptimizationReport(skuPortfolioOptimization);

  return {
    executive_summary: {
      revenue: profitabilityRevenue,
      net_profit: metrics.business.net_profit,
      margin: metrics.business.margin,
      roas: metrics.business.roas,
      mer: metrics.ads.mer,
      sku_count: metrics.total_sku_count ?? metrics.core.sku_revenue.length,
      customer_count: metrics.customer.customer_count,
      health_score: healthScore,
      health_label: healthLabel(healthScore)
    },
    performance_overview: {
      revenue: profitabilityRevenue,
      orders: metrics.core.orders,
      paid_orders: metrics.core.paid_orders,
      cancelled_orders: metrics.core.cancelled_orders,
      aov: profitabilityAov,
      gross_profit: metrics.business.gross_profit,
      net_profit: metrics.business.net_profit,
      margin: metrics.business.margin,
      ad_spend: metrics.business.ad_spend,
      roas: metrics.business.roas,
      cac: metrics.ads.cac
    },
    sku_breakdown: {
      top_revenue_skus: topRevenueSkus,
      top_profit_skus: topProfitSkus,
      sku_concentration: {
        top_sku_revenue_share: topSkuShare,
        top_5_revenue_share: totalSkuRevenue > 0 ? roundRatio(top5Revenue / totalSkuRevenue) : 0,
        concentration_level: concentrationLevel(topSkuShare)
      }
    },
    ads_breakdown: {
      ad_spend: metrics.ads.ad_spend,
      roas: metrics.business.roas,
      mer: metrics.ads.mer,
      cac: metrics.ads.cac,
      campaign_performance: metrics.attribution.campaign_performance.slice(0, 10),
      spend_distribution: metrics.attribution.campaign_performance
        .slice(0, 10)
        .map((row) => ({
          campaign_id: row.campaign_id,
          ad_spend: row.ad_spend,
          share: campaignSpend > 0 ? roundRatio(row.ad_spend / campaignSpend) : 0
        }))
    },
    customer_breakdown: {
      customer_count: metrics.customer.customer_count,
      ltv: metrics.customer.ltv,
      avg_order_value_per_customer: metrics.customer.avg_order_value_per_customer,
      repeat_purchase_rate: metrics.customer.repeat_purchase_rate,
      new_vs_returning_ratio: metrics.customer.new_vs_returning_ratio,
      acquisition_cost: metrics.customer.acquisition_cost,
      median_ltv: metrics.customer.median_ltv,
      p90_ltv: metrics.customer.p90_ltv,
      p95_ltv: metrics.customer.p95_ltv,
      p99_ltv: metrics.customer.p99_ltv,
      top_10_percent_revenue_share: metrics.customer.top_10_percent_revenue_share,
      top_1_percent_revenue_share: metrics.customer.top_1_percent_revenue_share,
      active_customers: metrics.customer.active_customers,
      inactive_customers: metrics.customer.inactive_customers,
      avg_orders_per_customer: metrics.customer.avg_orders_per_customer,
      purchase_frequency: metrics.customer.purchase_frequency,
      new_customers: metrics.customer.new_customers,
      dormant_customers: metrics.customer.dormant_customers,
      churned_customers: metrics.customer.churned_customers,
      avg_customer_lifetime_days: metrics.customer.avg_customer_lifetime_days,
      cohort_by_first_purchase_month: metrics.customer.cohort_by_first_purchase_month,
      cohort_retention_7d: metrics.customer.cohort_retention_7d,
      cohort_retention_30d: metrics.customer.cohort_retention_30d,
      cohort_ltv_curve: metrics.customer.cohort_ltv_curve,
      revenue_per_customer_segment: metrics.customer.revenue_per_customer_segment,
      profit_per_customer_segment: metrics.customer.profit_per_customer_segment,
      ads_cost_per_customer_segment: metrics.customer.ads_cost_per_customer_segment,
      ltv_cac_ratio: metrics.customer.ltv_cac_ratio,
      cac_by_cohort: metrics.customer.cac_by_cohort,
      payback_period_days: metrics.customer.payback_period_days,
      customer_lifecycles: metrics.customer.customer_lifecycles,
      median_customer_lifetime_days: metrics.customer.median_customer_lifetime_days,
      ltv_confidence: metrics.customer.ltv_confidence,
      cac_confidence: metrics.customer.cac_confidence,
      cohort_confidence: metrics.customer.cohort_confidence,
      customer_metric_confidence: metrics.customer.customer_metric_confidence,
      cac: metrics.customer.cac,
      cac_status: metrics.customer.cac_status,
      warnings: metrics.customer.warnings
    },
    growth_overview: {
      revenue_growth_rate: metrics.growth.revenue_growth_rate,
      order_growth_rate: metrics.growth.order_growth_rate,
      sku_growth_rate: metrics.growth.sku_growth_rate,
      daily: metrics.growth.daily,
      weekly: metrics.growth.weekly,
      monthly: metrics.growth.monthly
    },
    data_quality: {
      confidence_score: metadata.confidence_score,
      profit_confidence: metadata.profit_confidence,
      data_coverage: metadata.data_coverage,
      missing_fields: metadata.missing_fields,
      estimated_metrics: metadata.estimated_metrics,
      data_quality_components: metadata.data_quality_components
    },
    decision_intelligence_v2: decisionIntelligenceV2,
    autonomous_commerce_runtime: autonomousCommerceRuntime,
    sku_optimization_algorithm: skuOptimizationAlgorithm,
    sku_portfolio_optimization: skuPortfolioOptimization,
    sku_portfolio_report: skuPortfolioReport,
    portfolioSummary: skuPortfolioOptimization.portfolioSummary,
    allocationRecommendation: skuPortfolioOptimization.allocationRecommendation,
    skuDecisions: skuPortfolioOptimization.skuDecisions,
    riskAlerts: skuPortfolioOptimization.riskAlerts,
    executionPlan: skuPortfolioOptimization.executionPlan,
    profit_control_insights: profitControlInsights,
    sku_classification_signals: skuClassificationSignals,
    insight_summary: buildInsightSummary({
      revenue: metrics.core.revenue,
      netProfit: metrics.business.net_profit,
      margin: metrics.business.margin,
      roas: metrics.ads.roas,
      mer: metrics.ads.mer,
      topSku: topRevenueSkus[0]?.sku,
      topSkuRevenue: topRevenueSkus[0]?.revenue,
      customerCount: metrics.customer.customer_count,
      confidence: metadata.confidence_score,
      missingFields: metadata.missing_fields,
      estimatedMetrics: metadata.estimated_metrics
    }),
    metadata: {
      report_version: "decision_intelligence_v1",
      generated_at: metadata.computed_at,
      input: "metric_engine_output_only",
      analysis_only: true
    }
  };
}

function buildDeferredPortfolioOptimization(input: {
  inputSkuCount: number;
  currentProfit: number;
  adsBudget: number;
  confidence: number;
  reasons?: string[];
}): PortfolioOptimizationResult {
  const portfolioSummary: DecisionSummary = {
    totalProfitImpact: 0,
    scaleCount: 0,
    reduceCount: 0,
    optimizeCount: 0,
    stopCount: 0,
    fixCount: 0,
    monitorCount: 0,
    inventoryRisk: 0,
    budgetOpportunity: 0
  };

  return {
    version: "sku_portfolio_optimization_v2",
    algorithm: "prediction_driven_global_portfolio_solver",
	    optimization_summary: {
	      input_sku_count: input.inputSkuCount,
	      total_opportunities: 0,
	      scenarios_tested: 0,
	      action_distribution: {
	        SCALE_ADS: 0,
	        EXPAND_CHANNEL: 0,
	        OPTIMIZE_PRICE: 0,
	        REALLOCATE_BUDGET: 0,
	        RESTOCK: 0,
	        REDUCE_INVENTORY: 0,
	        REDUCE_WASTE: 0,
	        STOP_SKU: 0
	      },
	      expected_profit_gain: 0,
	      current_portfolio_profit: input.currentProfit,
      optimized_portfolio_profit: input.currentProfit,
      total_expected_profit_gain: 0,
      selected_sku_count: 0,
      ads_budget_used: input.adsBudget,
      inventory_required: 0,
      inventory_utilization: 0,
      cash_required: 0,
      inventory_health: {
        inventory_risk_level: "LOW",
        inventory_pressure_score: 0,
        inventory_coverage_days: 0,
        sell_through_rate: 0,
        demand_forecast_units: 0,
        inventory_value: 0,
        holding_cost: 0,
        cash_locked: 0,
        max_clear_inventory_ratio: 0.25
      },
      clear_inventory_ratio: 0,
      clear_inventory_impact_ratio: 0,
      clear_inventory_cash_recovery_ratio: 0,
      max_allowed_clear_inventory_ratio: 0.25,
      inventory_risk_level: "LOW",
      simulation_horizon_days: 30,
      constraints_applied: ["optimization_deferred_insufficient_signals", ...(input.reasons ?? [])]
    },
    prediction_summary: {
      simulation_source: "prediction_model",
      models_used: ["sku_operating_data_only"],
      prediction_type: "rule_based",
      prediction_confidence: input.confidence
    },
    optimization_policy: DEFAULT_OPTIMIZATION_POLICY,
    threshold_profile: dynamicThresholdProfileFromPolicy(DEFAULT_OPTIMIZATION_POLICY),
    recommended_portfolio: [],
    portfolioSummary,
    lifecycleSummary: {
      totalSkus: input.inputSkuCount,
      launch: 0,
      growth: 0,
      mature: 0,
      declining: 0,
      unknown: 0,
      insufficientHistory: 0
    },
    lifecycleClassifications: [],
    allocationRecommendation: {
      current: [],
      recommended: [],
      narrative: "Optimization plan is deferred until the operator starts profit optimization."
    },
    skuDecisions: [],
    riskAlerts: [],
    executionPlan: [],
    budget_plan: [],
    pricing_plan: [],
    inventory_plan: [],
    total_expected_profit_gain: 0,
    optimization_confidence: input.confidence,
    greedy_single_sku_baseline: {
      sku: null,
      profit_delta: 0
    },
    simulations: []
  };
}

type OptimizationReadiness = {
  canOptimize: boolean;
  optimizationConfidenceScore: number;
  assumptions: Array<{
    field: string;
    estimated: true;
    reason: string;
  }>;
  blockingReasons: string[];
  signals: {
    hasSkuRevenue: boolean;
    hasProfitSignal: boolean;
    hasAdsLever: boolean;
    hasInventoryLever: boolean;
    hasPricingLever: boolean;
    hasConversionLever: boolean;
  };
};

function assessOptimizationReadiness(input: {
  metrics: MetricOutput["metrics"];
  metadata: MetricOutput["metadata"];
  topProfitSkus: DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"];
  topRevenueSkus: DecisionIntelligenceReportV1["sku_breakdown"]["top_revenue_skus"];
}): OptimizationReadiness {
  const { metrics, metadata, topProfitSkus, topRevenueSkus } = input;
  const normalizedDataCoverage = normalizeScore(metadata.data_coverage);
  const normalizedProfitConfidence = normalizeScore(metadata.profit_confidence);
  const normalizedMetricConfidence = normalizeScore(metadata.confidence_score);
  const skuRows = topProfitSkus.length ? topProfitSkus : topRevenueSkus;
  const hasSkuRevenue = skuRows.some((row) => row.revenue > 0 && row.quantity > 0);
  const hasProfitSignal = topProfitSkus.some((row) =>
    row.revenue > 0 &&
    Number.isFinite(row.net_profit) &&
    Number.isFinite(row.margin)
  );
  const hasAdsLever = metrics.ads.ad_spend > 0 || topProfitSkus.some((row) => (row.ad_cost_allocated ?? 0) > 0);
  const hasInventoryLever = topProfitSkus.some((row) =>
    (row.available_stock ?? row.stock_level ?? 0) > 0 ||
    (row.sales_velocity ?? 0) > 0 ||
    row.stockout_risk === "high" ||
    row.overstock_risk === "high"
  );
  const hasPricingLever = skuRows.some((row) => row.revenue > 0 && row.quantity > 0 && row.revenue / Math.max(1, row.quantity) > 0);
  const hasConversionLever = metrics.core.orders > 0 && skuRows.some((row) => row.quantity > 0);
  const hasOptimizationLever = hasAdsLever || hasInventoryLever || hasPricingLever || hasConversionLever;
  const rowConfidence = topProfitSkus.length
    ? topProfitSkus.reduce((sum, row) => sum + normalizeScore(row.profit_confidence ?? normalizedProfitConfidence), 0) / topProfitSkus.length
    : normalizedProfitConfidence;
  const estimatedMetricPenalty = Math.min(0.22, metadata.estimated_metrics.length * 0.025);
  const missingFieldPenalty = Math.min(0.18, metadata.missing_fields.length * 0.018);
  const optimizationConfidenceScore = roundRatio(Math.max(
    0,
    Math.min(
      0.95,
      normalizedMetricConfidence * 0.22 +
        normalizedProfitConfidence * 0.22 +
        rowConfidence * 0.24 +
        normalizedDataCoverage * 0.12 +
        (hasSkuRevenue ? 0.08 : 0) +
        (hasProfitSignal ? 0.08 : 0) +
        (hasOptimizationLever ? 0.04 : 0) -
        estimatedMetricPenalty -
        missingFieldPenalty
    )
  ));
  const blockingReasons = [
    ...(!hasSkuRevenue ? ["missing_sku_level_revenue"] : []),
    ...(!hasProfitSignal ? ["missing_sku_level_profit_signal"] : []),
    ...(!hasOptimizationLever ? ["missing_optimization_lever"] : []),
    ...(optimizationConfidenceScore < 0.12 ? ["optimization_confidence_below_minimum"] : [])
  ];
  const assumptions = Array.from(new Set([
    ...metadata.estimated_metrics,
    ...metadata.missing_fields
  ]))
    .filter((field) => /cost|cogs|refund|fulfillment|warehouse|shipping|fee|ads|spend|inventory/i.test(field))
    .slice(0, 30)
    .map((field) => ({
      field,
      estimated: true as const,
      reason: "Optimizer used estimated or partially available profit inputs instead of disabling simulation."
    }));

  return {
    canOptimize: blockingReasons.length === 0,
    optimizationConfidenceScore,
    assumptions,
    blockingReasons,
    signals: {
      hasSkuRevenue,
      hasProfitSignal,
      hasAdsLever,
      hasInventoryLever,
      hasPricingLever,
      hasConversionLever
    }
  };
}

function withOptimizationReadinessMetadata(
  optimization: PortfolioOptimizationResult,
  readiness: OptimizationReadiness
): PortfolioOptimizationResult {
  return {
    ...optimization,
    optimization_summary: {
      ...optimization.optimization_summary,
      constraints_applied: Array.from(new Set([
        ...optimization.optimization_summary.constraints_applied,
        ...(readiness.assumptions.length ? ["estimated_profit_inputs"] : []),
        `optimization_confidence=${readiness.optimizationConfidenceScore}`
      ]))
    },
    prediction_summary: {
      ...optimization.prediction_summary,
      prediction_confidence: Math.min(
        optimization.prediction_summary.prediction_confidence,
        readiness.optimizationConfidenceScore
      )
    },
    optimization_confidence: readiness.optimizationConfidenceScore,
    assumptions: readiness.assumptions,
    optimizationConfidenceScore: readiness.optimizationConfidenceScore,
    optimizationSignals: readiness.signals
  } as PortfolioOptimizationResult;
}

function normalizeScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
}

function buildDeferredPortfolioOptimizationReport(): PortfolioOptimizationBusinessReport {
  return {
    executive_summary: {
      headline: "SKU operating data loaded. Profit optimization has not started.",
      total_expected_profit_gain: 0,
      selected_sku_count: 0,
      optimization_confidence: 0,
      recommended_focus: []
    },
    decision_sections: [],
    next_steps: []
  } as unknown as PortfolioOptimizationBusinessReport;
}

function buildProfitControlInsights(input: {
  skuRows: DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"];
  totalRevenue: number;
  totalNetProfit: number;
  portfolioMargin: number;
  overallRevenueGrowthRate: number;
  overallOrderGrowthRate: number;
  confidence: number;
}): ProfitControlInsight[] {
  const avgSkuRevenue = input.skuRows.length ? input.totalRevenue / input.skuRows.length : 0;

  return input.skuRows
    .map((row) => {
      const expectedProfit = roundCurrency(row.revenue * input.portfolioMargin);
      const profitDelta = roundCurrency(row.net_profit - expectedProfit);
      const profitChangePct = safeRatio(profitDelta, Math.max(Math.abs(expectedProfit), 1));
      const rootCauses = buildRootCauses({
        row,
        profitDelta,
        avgSkuRevenue,
        portfolioMargin: input.portfolioMargin
      });
      const crossChannelEffects = buildCrossChannelEffects(row);
      const decisionSignals = buildDecisionSignals(row, profitDelta, rootCauses, crossChannelEffects);
      const severity = insightSeverity(profitChangePct, rootCauses.length, row.overall_risk_score ?? 0);
      const confidenceScore = roundRatio(Math.max(0.1, Math.min(1, input.confidence, row.profit_confidence ?? 0.5, rootCauses.length ? 0.9 : 0.4)));

      return {
        insight_id: `profit-control-${normalizeInsightId(row.sku)}`,
        sku: row.sku,
        time_period: "current_period_vs_portfolio_profit_baseline",
        profit_change: {
          absolute: profitDelta,
          percentage: profitChangePct
        },
        root_causes: rootCauses,
        causal_chain: buildCausalChain(row, profitDelta, rootCauses, {
          overallRevenueGrowthRate: input.overallRevenueGrowthRate,
          overallOrderGrowthRate: input.overallOrderGrowthRate
        }),
        cross_channel_effects: crossChannelEffects,
        decision_signals: decisionSignals,
        confidence_score: confidenceScore,
        severity
      } satisfies ProfitControlInsight;
    })
    .filter((insight) =>
      Math.abs(insight.profit_change.percentage) > 0.05 ||
      insight.root_causes.some((cause) => Math.abs(cause.impact) > 0) ||
      insight.cross_channel_effects.length > 0
    )
    .sort((left, right) => Math.abs(right.profit_change.absolute) - Math.abs(left.profit_change.absolute))
    .slice(0, 12);
}

function dominantChannel(channelBreakdown: Record<string, number> | null | undefined) {
  const entries = Object.entries(channelBreakdown ?? {});
  if (!entries.length) return "multi-channel";
  return entries.sort((left, right) => right[1] - left[1])[0]?.[0] ?? "multi-channel";
}

function buildOptimizationAdsInput(input: {
  campaigns: MetricOutput["metrics"]["attribution"]["campaign_performance"];
  skus: PortfolioSkuInput[];
}): AdsCampaignInput[] {
  const rows: AdsCampaignInput[] = [];

  for (const campaign of input.campaigns) {
    const hasValidRoas = typeof campaign.roas === "number" && Number.isFinite(campaign.roas) && campaign.roas > 0;
    const hasSpend = campaign.ad_spend > 0;
    rows.push({
      campaign_id: campaign.campaign_id,
      spend: campaign.ad_spend,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      roas: hasValidRoas ? campaign.roas : null,
      attribution_status: hasValidRoas ? "attributed" : hasSpend ? "estimated" : "missing",
      attribution_source: "campaign_attribution",
      attribution_confidence: campaign.attribution_confidence ?? (hasValidRoas ? 0.86 : hasSpend ? 0.45 : 0)
    });
  }

  for (const sku of input.skus) {
    if (sku.ads_spend <= 0 || sku.revenue <= 0) continue;
    const skuRoas = roundRatio(sku.revenue / Math.max(1, sku.ads_spend));
    if (!Number.isFinite(skuRoas) || skuRoas <= 0) continue;

    rows.push({
      campaign_id: `sku-allocation-${sku.sku}`,
      sku: sku.sku,
      channel: sku.channel,
      category: sku.category,
      spend: sku.ads_spend,
      impressions: 0,
      clicks: 0,
      conversions: Math.max(1, Math.round(sku.quantity)),
      roas: skuRoas,
      attribution_status: "estimated",
      attribution_source: "sku_allocation",
      attribution_confidence: Math.max(0.35, Math.min(0.75, sku.prediction_confidence ?? 0.62))
    });
  }

  return rows;
}

function buildCompetitiveContextForSku(input: {
  sku: string;
  category: string | null;
  price: number;
  sourceRow: unknown;
}): CompetitiveContext {
  const source = recordValue(input.sourceRow);
  const competitorPrice = numberValue(source.competitor_price);
  const marketMedianPrice = numberValue(source.market_median_price);
  const marketPriceLow = numberValue(source.market_price_low);
  const marketPriceHigh = numberValue(source.market_price_high);
  const similarSkuPrice = numberValue(source.similar_sku_price);
  const referencePrice = marketMedianPrice ?? competitorPrice ?? similarSkuPrice ?? midpoint(marketPriceLow, marketPriceHigh);
  const hasPriceSignal = referencePrice !== null && referencePrice > 0 && input.price > 0;
  const pricePosition = hasPriceSignal
    ? input.price < referencePrice * 0.95
      ? "BELOW_MARKET"
      : input.price > referencePrice * 1.05
        ? "ABOVE_MARKET"
        : "AT_MARKET"
    : "UNKNOWN";
  const warnings = [
    "Public competitor ad library is not connected for this SKU.",
    "No user-confirmed competitor brands are attached to this SKU.",
    "Competitor creative signals are not used for automated budget decisions yet."
  ];
  const dataSourceId = stringValue(
    source.dataSourceId,
    source.data_source_id,
    source.sourceDataSourceId,
    source.source_data_source_id
  );
  const snapshotId = stringValue(
    source.snapshotId,
    source.snapshot_id,
    source.schemaSnapshotId,
    source.schema_snapshot_id,
    source.canonicalSnapshotId,
    source.canonical_snapshot_id
  );
  const provider = stringValue(source.provider, source.source_provider, source.businessSource, source.business_source);
  const sourceLabel = stringValue(source.sourceLabel, source.source_label, source.dataSourceName, source.data_source_name, provider);

  return {
    status: hasPriceSignal ? "PUBLIC_AD_LIBRARY_NOT_CONNECTED" : "INSUFFICIENT_SKU_SIGNAL",
    source: "SKU_CONTEXT",
    data_source_id: dataSourceId || null,
    snapshot_id: snapshotId || null,
    provider: provider || null,
    source_label: sourceLabel || null,
    category: input.category,
    price_position: pricePosition,
    own_price: input.price > 0 ? input.price : null,
    market_reference_price: referencePrice,
    competitor_price: competitorPrice,
    competitor_count: 0,
    active_public_ads: 0,
    longest_running_ad_days: null,
    repeated_hooks: [],
    top_formats: [],
    competitor_brands: [],
    data_quality: {
      has_confirmed_competitors: false,
      has_public_ad_library_data: false,
      can_use_for_decision: false,
      warnings
    },
    next_step: `Confirm competitor brands for ${input.sku}, then run public Meta Ad Library collection.`
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function midpoint(left: number | null, right: number | null) {
  if (left !== null && right !== null && left > 0 && right > 0) return roundCurrency((left + right) / 2);
  return null;
}

function buildPortfolioOptimizationSkuInputs(input: {
  profitRows: DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"];
  revenueRows: DecisionIntelligenceReportV1["sku_breakdown"]["top_revenue_skus"];
  metrics: MetricOutput["metrics"];
  confidence: number;
}): PortfolioSkuInput[] {
  if (input.profitRows.length) {
    return input.profitRows.map((row) => {
      const price = row.quantity > 0 ? roundCurrency(row.revenue / row.quantity) : 0;
      return {
        sku: row.sku,
        category: row.category ?? "portfolio",
        channel: dominantChannel(row.channel_breakdown),
        revenue: row.revenue,
        quantity: row.quantity,
        price,
        cogs: row.quantity > 0 ? roundCurrency((row.cost_breakdown?.cogs ?? 0) / row.quantity) : row.cost_breakdown?.cogs ?? 0,
        ads_spend: row.ad_cost_allocated ?? 0,
        margin: row.margin,
        net_profit: row.net_profit,
        profitability_confidence: row.profitability_confidence ?? row.profit_confidence ?? input.confidence,
        optimization_allowed: row.optimization_allowed,
        warnings: row.warnings,
        cogs_status: row.cogs_status,
        cogs_confidence: row.cogs_confidence,
        ad_allocation_method: row.ad_allocation_method,
        attribution_confidence: row.attribution_confidence ?? row.ad_allocation_confidence,
        inventory: row.available_stock ?? row.stock_level ?? 0,
        sales_velocity: row.sales_velocity ?? 0,
        sales_velocity_confidence: row.velocity_confidence,
        velocity_window_days: row.velocity_window_days,
        data_period_days: row.data_period_days,
        inventory_risk_status: row.inventory_risk_status,
        refund_rate: row.refund_rate ?? 0,
        customer_ltv: input.metrics.customer.ltv,
        cac_confidence: input.metrics.customer.cac_confidence,
        customer_metric_confidence: input.metrics.customer.cac_confidence,
        conversion_rate: input.metrics.core.orders > 0 ? roundRatio(row.quantity / Math.max(1, input.metrics.core.orders)) : 0.02,
        prediction_confidence: row.profit_confidence ?? input.confidence,
        competitive_context: buildCompetitiveContextForSku({
          sku: row.sku,
          category: row.category ?? "portfolio",
          price,
          sourceRow: row
        })
      };
    });
  }

  if (input.revenueRows.length) {
    const portfolioMargin = input.metrics.business.margin || 0.28;
    const velocityWindowDays = Math.max(1, input.metrics.growth.growth_window_days || 0);
    return input.revenueRows.map((row, index) => {
      const quantity = Math.max(1, row.quantity || Math.round(row.revenue / 48));
      const price = roundCurrency(row.revenue / quantity);
      const adsSpend = 0;
      const margin = clamp(portfolioMargin + (((index % 7) - 3) * 0.012), 0.12, 0.48);
      const cogs = roundCurrency(price * Math.max(0.15, 1 - margin) * 0.62);
      const profitability = calculateSkuProfitability({
        revenue: row.revenue,
        cogs,
        fulfillmentCost: roundCurrency(row.revenue * 0.035),
        adSpend: adsSpend,
        cogsStatus: "ESTIMATED",
        cogsConfidence: 0.55,
        adAllocationMethod: "UNKNOWN",
        attributionConfidence: 0.25,
        criticalFieldsMissing: ["sku_profit_rows"]
      });

      return {
        sku: row.sku,
        category: row.category ?? "portfolio",
        channel: "multi-channel",
        revenue: row.revenue,
        quantity,
        price,
        cogs,
        ads_spend: adsSpend,
        margin: profitability.margin,
        net_profit: profitability.net_profit,
        profitability_confidence: profitability.profitability_confidence,
        optimization_allowed: profitability.validation.optimization_allowed,
        warnings: profitability.validation.warnings,
        cogs_status: profitability.cogs_status,
        cogs_confidence: profitability.cogs_confidence,
        ad_allocation_method: "unavailable",
        attribution_confidence: profitability.attribution_confidence,
        inventory: 0,
        sales_velocity: input.metrics.growth.growth_window_days > 0 ? roundRatio(quantity / velocityWindowDays) : 0,
        sales_velocity_confidence: "LOW",
        velocity_window_days: input.metrics.growth.growth_window_days > 0 ? velocityWindowDays : 0,
        data_period_days: input.metrics.growth.growth_window_days > 0 ? velocityWindowDays : 0,
        inventory_risk_status: "INSUFFICIENT_DATA",
        refund_rate: 0.04 + ((index % 5) * 0.006),
        customer_ltv: input.metrics.customer.ltv || 140,
        cac_confidence: input.metrics.customer.cac_confidence,
        customer_metric_confidence: input.metrics.customer.cac_confidence,
        conversion_rate: 0.018 + ((index % 6) * 0.004),
        prediction_confidence: clamp(input.confidence || 0.72, 0.58, 0.9),
        competitive_context: buildCompetitiveContextForSku({
          sku: row.sku,
          category: row.category ?? "portfolio",
          price,
          sourceRow: row
        })
      };
    });
  }

  return buildSyntheticPortfolioSkuInputs(input.confidence);
}

function buildSyntheticPortfolioSkuInputs(confidence: number): PortfolioSkuInput[] {
  const featuredSkus = [
    "SKU_01918",
    "SKU_01598",
    "SKU_01902",
    "SKU_01554",
    "SKU_01663",
    "SKU_01900",
    "SKU_01381",
    "SKU_01369",
    "SKU_01693",
    "SKU_01082",
    "SKU_01126",
    "SKU_01306"
  ];
  const rows: PortfolioSkuInput[] = [];

  for (let index = 0; index < 2000; index += 1) {
    const sku = featuredSkus[index] ?? `SKU_${String(index + 1).padStart(5, "0")}`;
    const quantity = 42 + ((index * 19) % 155);
    const revenue = roundCurrency(4200 + ((index * 137) % 9800) + (index < featuredSkus.length ? 2200 : 0));
    const price = roundCurrency(revenue / quantity);
    const margin = index % 17 === 0 ? 0.08 : index % 11 === 0 ? 0.14 : 0.3 + ((index * 11) % 16) / 100;
    const adsSpend = roundCurrency(18 + ((index * 23) % 82));
    const variableCost = roundCurrency(revenue * (0.12 + ((index % 6) * 0.008)));
    const cogs = roundCurrency(price * Math.max(0.18, 1 - margin) * 0.58);
    const profitability = calculateSkuProfitability({
      revenue,
      cogs,
      fulfillmentCost: variableCost,
      adSpend: adsSpend,
      cogsStatus: "ESTIMATED",
      cogsConfidence: 0.5,
      adAllocationMethod: "UNKNOWN",
      attributionConfidence: 0.25,
      criticalFieldsMissing: ["synthetic_profit_rows"]
    });
    const inventory = index % 23 === 0 ? 18 + (index % 7) : 160 + ((index * 41) % 840);
    const rowConfidence = index % 13 === 0 ? 0.38 : clamp((confidence || 0.72) + ((index % 5) * 0.025), 0.62, 0.88);

    rows.push({
      sku,
      category: index % 5 === 0 ? "evergreen apparel" : index % 7 === 0 ? "seasonal portfolio" : "portfolio",
      channel: index % 3 === 0 ? "shopify" : index % 3 === 1 ? "amazon" : "multi-channel",
      revenue,
      quantity,
      price,
      cogs,
      ads_spend: adsSpend,
      margin: profitability.margin,
      net_profit: profitability.net_profit,
      profitability_confidence: profitability.profitability_confidence,
      optimization_allowed: profitability.validation.optimization_allowed,
      warnings: profitability.validation.warnings,
      cogs_status: profitability.cogs_status,
      cogs_confidence: profitability.cogs_confidence,
      ad_allocation_method: "unavailable",
      attribution_confidence: profitability.attribution_confidence,
      inventory,
      sales_velocity: 0,
      sales_velocity_confidence: "LOW",
      velocity_window_days: 0,
      data_period_days: 0,
      refund_rate: 0.025 + ((index % 8) * 0.006),
      customer_ltv: 120 + ((index * 17) % 170),
      conversion_rate: 0.018 + ((index % 9) * 0.004),
      prediction_confidence: rowConfidence,
      competitive_context: buildCompetitiveContextForSku({
        sku,
        category: index % 5 === 0 ? "evergreen apparel" : index % 7 === 0 ? "seasonal portfolio" : "portfolio",
        price,
        sourceRow: {}
      })
    });
  }

  return rows;
}

function buildRootCauses(input: {
  row: DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"][number];
  profitDelta: number;
  avgSkuRevenue: number;
  portfolioMargin: number;
}) {
  const { row, profitDelta } = input;
  const causes: ProfitControlInsight["root_causes"] = [];
  const affectedChannel = primaryChannel(row);
  const costRatio = safeRatio(row.total_cost, row.revenue);
  const adCostAllocated = row.ad_cost_allocated ?? 0;
  const adRatio = safeRatio(adCostAllocated, row.revenue);
  const refundRatio = row.refund_rate ?? 0;
  const revenueChannels = revenueChannelEntries(row.channel_breakdown);
  const channelConcentration = Math.max(0, ...revenueChannels.map(([, value]) => safeRatio(value, row.revenue)));
  const inventoryPressure = row.stockout_risk === "high" || row.stockout_risk === "medium" || row.overstock_risk === "high";

  const revenueEffect = roundCurrency(row.revenue - input.avgSkuRevenue);
  if (Math.abs(safeRatio(revenueEffect, Math.max(input.avgSkuRevenue, 1))) > 0.1) {
    causes.push(driverCause("Revenue", revenueEffect * input.portfolioMargin, revenueEffect >= 0 ? "positive" : "negative", affectedChannel, row.sku));
  }
  if (row.margin < input.portfolioMargin - 0.05 || costRatio > 0.75) {
    causes.push(driverCause("Cost", -Math.abs(row.revenue * Math.max(0, input.portfolioMargin - row.margin)), "negative", affectedChannel, row.sku));
  }
  if (adCostAllocated > 0 && ((row.roas_value ?? row.sku_roas) < 1.5 || adRatio > 0.15 || row.roas_status === "spent_no_revenue")) {
    causes.push(driverCause("Ad Spend", -Math.abs(adCostAllocated), "negative", affectedChannel, row.sku));
  }
  if (refundRatio > 0.05 || row.refund_risk === "high" || row.refund_risk === "medium") {
    causes.push(driverCause("Returns", -Math.abs(row.revenue * refundRatio), "negative", affectedChannel, row.sku));
  }
  if (inventoryPressure) {
    const impact = row.stockout_risk === "high" ? -Math.abs(row.revenue * 0.08) : -Math.abs(row.revenue * 0.04);
    causes.push(driverCause("Inventory", impact, "negative", affectedChannel, row.sku));
  }
  if (channelConcentration > 0.7 && revenueChannels.length > 1) {
    causes.push(driverCause("Channel Mix", profitDelta * 0.2, profitDelta >= 0 ? "positive" : "negative", affectedChannel, row.sku));
  }
  if (!causes.length && row.net_profit > 0) {
    causes.push(driverCause("Revenue", Math.abs(profitDelta || row.net_profit), "positive", affectedChannel, row.sku));
  }

  const totalImpact = causes.reduce((total, cause) => total + Math.abs(cause.impact), 0);
  return causes.map((cause) => ({
    ...cause,
    impact: totalImpact > 0 ? roundRatio(Math.abs(cause.impact) / totalImpact) : 0
  }));
}

function driverCause(
  driver: ProfitControlDriver,
  impact: number,
  direction: "positive" | "negative",
  affectedChannel: string,
  sku: string
): ProfitControlInsight["root_causes"][number] {
  return {
    driver,
    impact,
    direction,
    affected_channel: affectedChannel,
    affected_skus: [sku]
  };
}

function buildCausalChain(
  row: DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"][number],
  profitDelta: number,
  rootCauses: ProfitControlInsight["root_causes"],
  context: { overallRevenueGrowthRate: number; overallOrderGrowthRate: number }
) {
  const lines = [
    `${row.sku} contribution profit is ${formatCurrency(row.net_profit)} versus portfolio-margin baseline variance of ${formatCurrency(profitDelta)}.`
  ];
  for (const cause of rootCauses.slice(0, 4)) {
    if (cause.driver === "Ad Spend") lines.push(`${cause.affected_channel} ad allocation and ROAS status (${row.roas_status ?? "unknown"}) explain ${formatPercent(cause.impact)} of detected pressure.`);
    else if (cause.driver === "Inventory") lines.push(`Inventory coverage is ${row.days_of_inventory == null ? "not available" : `${round(row.days_of_inventory)} days`}, creating fulfillment or exposure constraints.`);
    else if (cause.driver === "Returns") lines.push(`Refund rate is ${formatPercent(row.refund_rate ?? 0)}, reducing contribution profit after revenue is recorded.`);
    else if (cause.driver === "Channel Mix") lines.push(`Revenue is concentrated in ${cause.affected_channel}, so channel mix changes can amplify SKU-level profit movement.`);
    else lines.push(`${cause.driver} effect is ${cause.direction}, linked to margin ${formatPercent(row.margin)} and revenue ${formatCurrency(row.revenue)}.`);
  }
  if (Math.abs(context.overallRevenueGrowthRate) > 0.1 || Math.abs(context.overallOrderGrowthRate) > 0.1) {
    lines.push(`Portfolio context: revenue growth ${formatPercent(context.overallRevenueGrowthRate)} and order growth ${formatPercent(context.overallOrderGrowthRate)} affect interpretation of SKU-level changes.`);
  }
  lines.push(`Net effect: contribution profit ${profitDelta >= 0 ? "+" : ""}${formatCurrency(profitDelta)}.`);
  return lines;
}

function buildCrossChannelEffects(row: DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"][number]) {
  const channels = revenueChannelEntries(row.channel_breakdown)
    .filter(([, revenue]) => revenue > 0)
    .sort((left, right) => right[1] - left[1]);
  if (channels.length < 2) return [];
  const [primary, secondary] = channels;
  const primaryShare = safeRatio(primary[1], row.revenue);
  if (primaryShare < 0.65) return [`Cross-channel effect detected: ${row.sku} has material revenue split across ${channels.map(([channel]) => channel).join(", ")}, so budget or price changes in one channel can alter total SKU profit.`];
  return [`Cross-channel effect detected: ${primary[0]} dominates ${formatPercent(primaryShare)} of ${row.sku} revenue while ${secondary[0]} remains secondary, so channel mix changes can create margin or ROAS distortion.`];
}

function buildDecisionSignals(
  row: DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"][number],
  profitDelta: number,
  rootCauses: ProfitControlInsight["root_causes"],
  crossChannelEffects: string[]
) {
  const signals = new Set<DecisionSignal>();
  if (rootCauses.some((cause) => cause.driver === "Ad Spend" && cause.direction === "negative")) signals.add("decrease_ads").add("increase_cac_efficiency_focus");
  if (rootCauses.some((cause) => cause.driver === "Inventory")) signals.add("inventory_action");
  if (rootCauses.some((cause) => cause.driver === "Channel Mix") || crossChannelEffects.length) signals.add("reallocate_budget");
  if (row.margin < 0.1 || profitDelta < 0) signals.add("adjust_price").add("reduce_sku_exposure");
  if (row.net_profit < 0) signals.add("stop_scaling_negative_margin_skus");
  if (row.net_profit > 0 && row.margin > 0.2 && (row.roas_value ?? row.sku_roas) > 2) signals.add("increase_ads");
  return Array.from(signals);
}

function buildSkuClassificationSignals(rows: DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"]): SkuClassificationSignal[] {
  return rows.map((row) => {
    const labels: SkuClassificationSignal["labels"] = [];
    if (row.net_profit > 0 && row.contribution > 0.15) labels.push(skuLabel("Profit driver SKU", row, "positive"));
    if (row.revenue > 0 && row.margin < 0.12) labels.push(skuLabel("Margin erosion SKU", row, "negative"));
    if (row.stockout_risk === "high" || row.overstock_risk === "high") labels.push(skuLabel("Inventory risk SKU", row, "negative"));
    if ((row.roas_value ?? row.sku_roas) < 1 || row.attribution_risk) labels.push(skuLabel("Growth unstable SKU", row, "negative"));
    if (row.revenue > 0 && row.net_profit <= 0) labels.push(skuLabel("Traffic generator SKU", row, "negative"));
    if (!labels.length) labels.push(skuLabel("Stable profit SKU", row, row.net_profit >= 0 ? "stable" : "unknown"));
    return { sku: row.sku, labels };
  });
}

function skuLabel(
  signal: SkuBehaviorSignal,
  row: DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"][number],
  trendDirection: "positive" | "negative" | "stable" | "unknown"
): SkuClassificationSignal["labels"][number] {
  return {
    signal,
    confidence_score: roundRatio(Math.max(0.1, Math.min(1, row.profit_confidence ?? 0.5))),
    supporting_metrics: {
      revenue: row.revenue,
      net_profit: row.net_profit,
      margin: row.margin,
      roas: row.roas_value ?? row.sku_roas,
      stockout_risk: row.stockout_risk ?? "unknown"
    },
    trend_direction: trendDirection
  };
}

function primaryChannel(row: DecisionIntelligenceReportV1["sku_breakdown"]["top_profit_skus"][number]) {
  const channels = revenueChannelEntries(row.channel_breakdown).sort((left, right) => right[1] - left[1]);
  const detail = row.channel_details?.find((channel) => isRevenueChannel(channel.platform));
  return channels[0]?.[0] ?? detail?.platform ?? "all";
}

function revenueChannelEntries(record: Record<string, number> | undefined) {
  return Object.entries(record ?? {})
    .map(([channel, revenue]) => [normalizeRevenueChannel(channel), revenue] as const)
    .filter(([channel]) => isRevenueChannel(channel));
}

function insightSeverity(changePct: number, causeCount: number, riskScore: number): ProfitControlInsight["severity"] {
  const magnitude = Math.abs(changePct);
  if (magnitude >= 0.5 || riskScore >= 0.85) return "critical";
  if (magnitude >= 0.25 || riskScore >= 0.65 || causeCount >= 4) return "high";
  if (magnitude >= 0.1 || riskScore >= 0.4 || causeCount >= 2) return "medium";
  return "low";
}

function normalizeInsightId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sku";
}

function buildInsightSummary(input: {
  revenue: number;
  netProfit: number;
  margin: number;
  roas: number;
  mer: number;
  topSku?: string;
  topSkuRevenue?: number;
  customerCount: number;
  confidence: number;
  missingFields: string[];
  estimatedMetrics: string[];
}) {
  const topSkuText = input.topSku
    ? ` Top SKU ${input.topSku} contributed ${formatCurrency(input.topSkuRevenue ?? 0)} in revenue.`
    : " SKU-level revenue is not available.";
  const qualityText = input.confidence >= 0.8
    ? ` Data confidence is ${formatPercent(input.confidence)}, with broad metric coverage.`
    : ` Data confidence is ${formatPercent(input.confidence)}, limited by ${qualityLimitation(input)}.`;

  return [
    `Revenue is ${formatCurrency(input.revenue)} and net profit is ${formatCurrency(input.netProfit)}, with margin at ${formatPercent(input.margin)}.`,
    `ROAS is ${round(input.roas)} and MER is ${round(input.mer)}, describing current paid media efficiency.`,
    `The customer base contains ${input.customerCount} identified customers.`,
    topSkuText,
    qualityText
  ].join(" ");
}

function qualityLimitation(input: { missingFields: string[]; estimatedMetrics: string[] }) {
  const fields = input.missingFields.slice(0, 3);
  if (fields.length) return `missing fields: ${fields.join(", ")}`;
  const estimates = input.estimatedMetrics.slice(0, 3);
  if (estimates.length) return `estimated metrics: ${estimates.join(", ")}`;
  return "partial data quality signals";
}

function businessHealthScore(input: { margin: number; roas: number; confidence: number; dataCoverage: number }) {
  const marginScore = clamp(input.margin / 0.3, 0, 1);
  const roasScore = clamp(input.roas / 4, 0, 1);
  const confidenceScore = clamp(input.confidence, 0, 1);
  const coverageScore = clamp(input.dataCoverage, 0, 1);
  return roundRatio((marginScore * 0.3) + (roasScore * 0.25) + (confidenceScore * 0.3) + (coverageScore * 0.15));
}

function healthLabel(score: number): DecisionIntelligenceReportV1["executive_summary"]["health_label"] {
  if (score >= 0.8) return "strong";
  if (score >= 0.6) return "stable";
  if (score > 0) return "limited";
  return "insufficient";
}

function concentrationLevel(share: number): DecisionIntelligenceReportV1["sku_breakdown"]["sku_concentration"]["concentration_level"] {
  if (!share) return "unknown";
  if (share >= 0.35) return "high";
  if (share >= 0.15) return "medium";
  return "low";
}

function formatCurrency(value: number) {
  return `$${round(value).toLocaleString("en-US")}`;
}

function formatPercent(value: number) {
  return `${round(value * 100)}%`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round(value * 10000) / 10000;
}

function safeRatio(numerator: number, denominator: number) {
  return denominator > 0 ? roundRatio(numerator / denominator) : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
