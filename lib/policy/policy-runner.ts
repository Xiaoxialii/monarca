import { forecastDemand } from "@/lib/prediction/demand-forecast";
import { predictInventoryRunway } from "@/lib/prediction/inventory-runway-prediction";
import { predictRoas } from "@/lib/prediction/roas-prediction";
import { PolicyEngine } from "@/lib/policy/policy-engine";
import type { CommerceState } from "@/lib/optimization/objective";

export type ClosedLoopPolicyResult = ReturnType<PolicyEngine["runPolicy"]> & {
  predictions: {
    demand: ReturnType<typeof forecastDemand>;
    roas: ReturnType<typeof predictRoas>;
    inventoryRunway: ReturnType<typeof predictInventoryRunway>;
  };
  flow: [
    "ingest_data",
    "build_state",
    "predict_metrics",
    "optimize_profit",
    "finalize_policy",
    "prepare_execution",
    "capture_feedback",
    "update_policy"
  ];
};

export function runClosedLoopPolicy(state: CommerceState): ClosedLoopPolicyResult {
  const predictions = {
    demand: forecastDemand(state.skus),
    roas: predictRoas(state.skus),
    inventoryRunway: predictInventoryRunway(state.skus)
  };
  const policy = new PolicyEngine().runPolicy(state);

  return {
    ...policy,
    predictions,
    flow: [
      "ingest_data",
      "build_state",
      "predict_metrics",
      "optimize_profit",
      "finalize_policy",
      "prepare_execution",
      "capture_feedback",
      "update_policy"
    ]
  };
}
