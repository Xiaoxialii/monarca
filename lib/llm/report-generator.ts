import { explainDecisions } from "@/lib/llm/explainer";
import type { Decision } from "@/lib/optimization/objective";

export type HumanReadablePolicyReport = {
  title: string;
  summary: string;
  explanations: ReturnType<typeof explainDecisions>;
};

export function generatePolicyReport(decisions: Decision[]): HumanReadablePolicyReport {
  const scaleCount = decisions.filter((decision) => decision.action === "SCALE").length;
  const stopCount = decisions.filter((decision) => decision.action === "STOP").length;
  const fixCount = decisions.filter((decision) => decision.action === "FIX").length;

  return {
    title: "Monarca Profit Policy Report",
    summary: `${decisions.length} decisions generated: ${scaleCount} SCALE, ${stopCount} STOP, ${fixCount} FIX.`,
    explanations: explainDecisions(decisions)
  };
}
