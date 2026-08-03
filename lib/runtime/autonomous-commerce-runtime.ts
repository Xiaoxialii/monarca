import type { DecisionIntelligenceV2, V2DecisionSignal } from "@/lib/insight/counterfactual-engine";

export type AutonomousCommerceActionType =
  | "increase_ads"
  | "reduce_ads"
  | "kill_sku"
  | "scale_sku"
  | "adjust_pricing"
  | "reallocate_budget"
  | "inventory_rebalance"
  | "inventory_coverage_review";

export type AutonomousCommerceModule = "sku_optimization" | "ads_optimization" | "pricing_optimization" | "inventory_optimization";

export type AutonomousExecutionMode = "dry_run";

export type AutonomousCommercePlan = {
  action_id: string;
  module: AutonomousCommerceModule;
  action_type: AutonomousCommerceActionType;
  target: {
    sku?: string;
    campaign_id?: string;
    channel?: string;
  };
  priority_score: number;
  expected_profit_delta: number;
  confidence_score: number;
  status: "queued_for_review" | "blocked_by_guardrail";
  guardrails: string[];
  evidence: string[];
};

export type AutonomousCommerceRuntime = {
  version: "autonomous_commerce_runtime_v1";
  mode: AutonomousExecutionMode;
  external_write_enabled: false;
  requires_human_approval: true;
  modules: {
    sku_optimization: {
      input: "sku_metrics + profit + demand + inventory";
      actions: AutonomousCommercePlan[];
    };
    ads_optimization: {
      input: "campaign performance + SKU ROAS + decision signals";
      actions: AutonomousCommercePlan[];
    };
    pricing_optimization: {
      input: "margin + contribution profit + demand signals";
      actions: AutonomousCommercePlan[];
    };
    inventory_optimization: {
      input: "stock + sales velocity + inventory coverage";
      actions: AutonomousCommercePlan[];
    };
  };
  execution_queue: AutonomousCommercePlan[];
  learning_loop: {
    status: "ready_for_outcome_tracking";
    tracked_metrics: Array<"profit" | "margin" | "roas" | "ad_spend" | "inventory_coverage">;
    outcome_window_days: number;
    completed_events: [];
  };
};

type RuntimeSkuRow = {
  sku: string;
  revenue: number;
  net_profit: number;
  margin: number;
  contribution: number;
  sku_roas: number;
  roas_value?: number | null;
  roas_status?: string;
  ad_cost_allocated: number | null;
  stock_level?: number | null;
  available_stock?: number | null;
  sales_velocity?: number;
  days_of_inventory?: number | null;
  overall_risk_score?: number;
};

type RuntimeCampaignRow = {
  campaign_id: string;
  ad_spend: number;
  revenue: number;
  roas: number;
  estimated: boolean;
};

export type AutonomousCommerceRuntimeInput = {
  decision_intelligence_v2: DecisionIntelligenceV2;
  sku_rows: RuntimeSkuRow[];
  campaign_rows: RuntimeCampaignRow[];
  confidence_score: number;
};

export function buildAutonomousCommerceRuntime(input: AutonomousCommerceRuntimeInput): AutonomousCommerceRuntime {
  const skuActions = buildSkuOptimizationActions(input);
  const adsActions = buildAdsOptimizationActions(input);
  const pricingActions = buildPricingOptimizationActions(input);
  const inventoryActions = buildInventoryOptimizationActions(input);
  const executionQueue = [...skuActions, ...adsActions, ...pricingActions, ...inventoryActions]
    .sort((left, right) => right.priority_score - left.priority_score || right.expected_profit_delta - left.expected_profit_delta)
    .slice(0, 24);

  return {
    version: "autonomous_commerce_runtime_v1",
    mode: "dry_run",
    external_write_enabled: false,
    requires_human_approval: true,
    modules: {
      sku_optimization: {
        input: "sku_metrics + profit + demand + inventory",
        actions: skuActions
      },
      ads_optimization: {
        input: "campaign performance + SKU ROAS + decision signals",
        actions: adsActions
      },
      pricing_optimization: {
        input: "margin + contribution profit + demand signals",
        actions: pricingActions
      },
      inventory_optimization: {
        input: "stock + sales velocity + inventory coverage",
        actions: inventoryActions
      }
    },
    execution_queue: executionQueue,
    learning_loop: {
      status: "ready_for_outcome_tracking",
      tracked_metrics: ["profit", "margin", "roas", "ad_spend", "inventory_coverage"],
      outcome_window_days: 14,
      completed_events: []
    }
  };
}

function buildSkuOptimizationActions(input: AutonomousCommerceRuntimeInput): AutonomousCommercePlan[] {
  const actions: AutonomousCommercePlan[] = [];
  const rankedBySku = rankingsBySku(input.decision_intelligence_v2.action_rankings);

  for (const row of input.sku_rows.slice(0, 20)) {
    const rankedSignals = rankedBySku.get(row.sku) ?? [];
    const signals = new Set(rankedSignals.map((ranking) => ranking.decision_signal));
    const roas = row.roas_value ?? row.sku_roas;

    if (row.net_profit > 0 && row.margin >= 0.2 && roas >= 2) {
      actions.push(plan({
        module: "sku_optimization",
        actionType: signals.has("increase_ads") ? "increase_ads" : "scale_sku",
        sku: row.sku,
        priority: priority(row.contribution, input.confidence_score, 0.7),
        expectedProfit: Math.max(1, row.net_profit * 0.12),
        confidence: input.confidence_score,
        evidence: [`margin=${roundRatio(row.margin)}`, `roas=${roundRatio(roas)}`, `net_profit=${roundCurrency(row.net_profit)}`]
      }));
    }

    if (row.net_profit < 0 || signals.has("stop_scaling_negative_margin_skus")) {
      actions.push(plan({
        module: "sku_optimization",
        actionType: row.net_profit < 0 ? "kill_sku" : "reduce_ads",
        sku: row.sku,
        priority: priority(Math.abs(row.net_profit), input.confidence_score, 0.9),
        expectedProfit: Math.abs(row.net_profit) || (row.ad_cost_allocated ?? 0) * 0.3,
        confidence: input.confidence_score,
        evidence: [`net_profit=${roundCurrency(row.net_profit)}`, `ad_cost_allocated=${roundCurrency(row.ad_cost_allocated ?? 0)}`]
      }));
    }
  }

  return dedupeActions(actions);
}

function buildAdsOptimizationActions(input: AutonomousCommerceRuntimeInput): AutonomousCommercePlan[] {
  const rankedAdsSignals = input.decision_intelligence_v2.action_rankings.filter((ranking) =>
    ["increase_ads", "decrease_ads", "reallocate_budget", "increase_cac_efficiency_focus"].includes(ranking.decision_signal)
  );
  const actions = rankedAdsSignals.slice(0, 8).map((ranking) => plan({
    module: "ads_optimization",
    actionType: mapDecisionSignalToAction(ranking.decision_signal),
    sku: ranking.affected_skus[0],
    priority: ranking.priority_score,
    expectedProfit: ranking.expected_profit_delta,
    confidence: ranking.confidence_score,
    evidence: ranking.evidence_insight_ids
  }));

  for (const campaign of input.campaign_rows.slice(0, 10)) {
    if (campaign.ad_spend > 0 && campaign.roas < 1.5) {
      actions.push(plan({
        module: "ads_optimization",
        actionType: "reduce_ads",
        campaignId: campaign.campaign_id,
        priority: priority(campaign.ad_spend, input.confidence_score, 0.8),
        expectedProfit: campaign.ad_spend * 0.2,
        confidence: campaign.estimated ? input.confidence_score * 0.75 : input.confidence_score,
        evidence: [`campaign_roas=${roundRatio(campaign.roas)}`, `ad_spend=${roundCurrency(campaign.ad_spend)}`]
      }));
    }
  }

  return dedupeActions(actions);
}

function buildPricingOptimizationActions(input: AutonomousCommerceRuntimeInput): AutonomousCommercePlan[] {
  return input.sku_rows
    .filter((row) => row.revenue > 0 && (row.margin < 0.12 || row.net_profit < 0))
    .slice(0, 12)
    .map((row) => plan({
      module: "pricing_optimization",
      actionType: "adjust_pricing",
      sku: row.sku,
      priority: priority(Math.abs(row.net_profit) + row.revenue * Math.max(0, 0.18 - row.margin), input.confidence_score, 0.75),
      expectedProfit: Math.max(1, row.revenue * Math.max(0.03, 0.18 - row.margin)),
      confidence: input.confidence_score,
      evidence: [`margin=${roundRatio(row.margin)}`, `revenue=${roundCurrency(row.revenue)}`, `net_profit=${roundCurrency(row.net_profit)}`]
    }));
}

function buildInventoryOptimizationActions(input: AutonomousCommerceRuntimeInput): AutonomousCommercePlan[] {
  return input.sku_rows
    .filter((row) => row.sales_velocity != null && row.sales_velocity > 0 && row.days_of_inventory != null)
    .slice(0, 20)
    .flatMap((row) => {
      const coverage = row.days_of_inventory ?? 0;
      if (coverage < 14 || coverage > 90) {
        return [plan({
          module: "inventory_optimization",
          actionType: coverage < 14 ? "inventory_coverage_review" : "inventory_rebalance",
          sku: row.sku,
          priority: priority(Math.abs(30 - coverage), input.confidence_score, 0.65),
          expectedProfit: Math.max(1, row.net_profit * 0.05),
          confidence: input.confidence_score,
          evidence: [`sales_velocity=${roundRatio(row.sales_velocity ?? 0)}`, `inventory_coverage_days=${roundRatio(coverage)}`]
        })];
      }
      return [];
    });
}

function rankingsBySku(rankings: DecisionIntelligenceV2["action_rankings"]) {
  const grouped = new Map<string, DecisionIntelligenceV2["action_rankings"]>();
  for (const ranking of rankings) {
    for (const sku of ranking.affected_skus) {
      grouped.set(sku, [...(grouped.get(sku) ?? []), ranking]);
    }
  }
  return grouped;
}

function mapDecisionSignalToAction(signal: V2DecisionSignal): AutonomousCommerceActionType {
  if (signal === "increase_ads") return "increase_ads";
  if (signal === "decrease_ads" || signal === "increase_cac_efficiency_focus") return "reduce_ads";
  if (signal === "adjust_price") return "adjust_pricing";
  if (signal === "reallocate_budget") return "reallocate_budget";
  if (signal === "inventory_action") return "inventory_coverage_review";
  if (signal === "stop_scaling_negative_margin_skus") return "kill_sku";
  return "scale_sku";
}

function plan(input: {
  module: AutonomousCommerceModule;
  actionType: AutonomousCommerceActionType;
  sku?: string;
  campaignId?: string;
  priority: number;
  expectedProfit: number;
  confidence: number;
  evidence: string[];
}): AutonomousCommercePlan {
  const confidence = roundRatio(Math.max(0, Math.min(1, input.confidence)));
  const guardrails = [
    "dry_run_only",
    "requires_human_approval",
    "no_external_write"
  ];

  return {
    action_id: [
      "autonomous",
      input.module,
      input.actionType,
      normalizeId(input.sku ?? input.campaignId ?? "portfolio")
    ].join("-"),
    module: input.module,
    action_type: input.actionType,
    target: {
      sku: input.sku,
      campaign_id: input.campaignId,
      channel: input.campaignId ? "paid_media" : undefined
    },
    priority_score: roundRatio(input.priority),
    expected_profit_delta: roundCurrency(input.expectedProfit),
    confidence_score: confidence,
    status: confidence >= 0.5 ? "queued_for_review" : "blocked_by_guardrail",
    guardrails,
    evidence: input.evidence
  };
}

function dedupeActions(actions: AutonomousCommercePlan[]) {
  const byId = new Map<string, AutonomousCommercePlan>();
  for (const action of actions) {
    const current = byId.get(action.action_id);
    if (!current || action.priority_score > current.priority_score) byId.set(action.action_id, action);
  }
  return Array.from(byId.values()).sort((left, right) => right.priority_score - left.priority_score);
}

function priority(signalMagnitude: number, confidence: number, multiplier: number) {
  return Math.max(0, signalMagnitude) * 0.01 * multiplier + confidence * 2;
}

function normalizeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "target";
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRatio(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
