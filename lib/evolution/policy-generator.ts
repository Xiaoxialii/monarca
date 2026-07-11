import { roundRatio, safeRatio, type CommerceState } from "@/lib/optimization/objective";
import type { EvolutionEngineResult, GeneratedPolicy } from "@/lib/evolution/types";

export function generatePoliciesFromFeedback(input: {
  state: CommerceState;
  evolution: EvolutionEngineResult;
  allowMutation: boolean;
}): GeneratedPolicy[] {
  if (!input.allowMutation && input.evolution.confidence_updates.length === 0) return [];

  const generated = new Map<string, GeneratedPolicy>();
  for (const sku of input.state.skus) {
    const roas = sku.roas ?? safeRatio(sku.revenue, sku.adSpend);
    const margin = sku.margin ?? safeRatio(sku.grossProfit, sku.revenue);
    const velocity = sku.salesVelocity;

    if (roas > 3 && margin > 0.22 && sku.inventory > velocity * 21) {
      addPolicy(generated, {
        policy_id: "policy_scale_high_roas_inventory_supported_skus",
        rule: "IF ROAS > 3 AND margin > 22% AND inventory > 21 days of velocity THEN scale_ads",
        action: "scale_ads",
        confidence: confidence(input.evolution, 0.82),
        evidence: [`sku=${sku.skuId}`, `roas=${roundRatio(roas)}`, `margin=${roundRatio(margin)}`, `inventory=${sku.inventory}`],
        rollback_token: "policy:scale_high_roas_inventory_supported_skus:rollback:v_next"
      });
    }

    if (margin < 0.12 && sku.revenue > 0) {
      addPolicy(generated, {
        policy_id: "policy_raise_price_low_margin_skus",
        rule: "IF margin < 12% AND revenue > 0 THEN raise_price",
        action: "raise_price",
        confidence: confidence(input.evolution, 0.72),
        evidence: [`sku=${sku.skuId}`, `margin=${roundRatio(margin)}`, `revenue=${sku.revenue}`],
        rollback_token: "policy:raise_price_low_margin_skus:rollback:v_next"
      });
    }

    if (sku.adSpend > 0 && roas < 1) {
      addPolicy(generated, {
        policy_id: "policy_reduce_ads_negative_roas_skus",
        rule: "IF ad_spend > 0 AND ROAS < 1 THEN reduce_ads",
        action: "reduce_ads",
        confidence: confidence(input.evolution, 0.78),
        evidence: [`sku=${sku.skuId}`, `roas=${roundRatio(roas)}`, `ad_spend=${sku.adSpend}`],
        rollback_token: "policy:reduce_ads_negative_roas_skus:rollback:v_next"
      });
    }
  }

  for (const ruleChange of input.evolution.rule_changes) {
    addPolicy(generated, {
      policy_id: `policy_${ruleChange.rule_id}`,
      rule: ruleChange.proposed_rule,
      action: inferAction(ruleChange.proposed_rule),
      confidence: ruleChange.confidence,
      evidence: ruleChange.evidence,
      rollback_token: ruleChange.rollback_token
    });
  }

  return Array.from(generated.values()).sort((left, right) => right.confidence - left.confidence || left.policy_id.localeCompare(right.policy_id));
}

function addPolicy(map: Map<string, GeneratedPolicy>, policy: GeneratedPolicy) {
  const current = map.get(policy.policy_id);
  if (!current || policy.confidence > current.confidence) map.set(policy.policy_id, policy);
}

function confidence(evolution: EvolutionEngineResult, base: number) {
  const updates = evolution.confidence_updates;
  const avg = updates.length ? updates.reduce((sum, row) => sum + row.next_confidence, 0) / updates.length : base;
  return roundRatio(Math.max(0.35, Math.min(0.95, base * 0.65 + avg * 0.35)));
}

function inferAction(rule: string): GeneratedPolicy["action"] {
  if (rule.includes("scale_ads") || rule.includes("expand_budget")) return "scale_ads";
  if (rule.includes("reduce_ads")) return "reduce_ads";
  if (rule.includes("raise_price")) return "raise_price";
  if (rule.includes("stop")) return "stop_sku";
  if (rule.includes("inventory")) return "inventory_review";
  return "hold";
}
