import type { LaunchProductInput } from "@/lib/launch/new-product-launch-optimizer";
import type { ChannelFit } from "@/lib/launch/product-intelligence/channel-fit-engine";
import type { CustomerQualitySignal } from "@/lib/launch/product-intelligence/customer-quality-engine";
import type { LaunchDemandForecast } from "@/lib/launch/product-intelligence/launch-demand-model";

export type LaunchScenarioV2 = {
  strategy: "Growth Launch" | "Balanced Launch" | "Conservative Test" | "Marketplace Validation" | "Owned Channel Test";
  budget: number;
  inventory: number;
  revenue: number;
  profit: number;
  margin: number;
  risk: "Low" | "Medium" | "High";
  risk_score: number;
  confidence: number;
  execution_feasibility: number;
  constraints: {
    budget_passed: boolean;
    inventory_passed: boolean;
    margin_passed: boolean;
    cash_passed: boolean;
  };
  launch_score: number;
  selected: boolean;
};

export function generateLaunchScenarios(
  product: LaunchProductInput,
  demand: LaunchDemandForecast,
  customer: CustomerQualitySignal,
  channels: ChannelFit[]
): LaunchScenarioV2[] {
  const baseOrders = Math.max(20, demand.expected_orders);
  const baseMargin = product.sellingPrice > 0
    ? Math.max(0.08, (product.sellingPrice - product.cogs - product.fulfillmentCost) / product.sellingPrice)
    : 0.35;
  const definitions = [
    { strategy: "Growth Launch" as const, budget: 3000, orderFactor: 1.25, inventoryFactor: 1, risk: "High" as const, confidenceDelta: -8 },
    { strategy: "Balanced Launch" as const, budget: 1200, orderFactor: 0.82, inventoryFactor: 0.6, risk: "Medium" as const, confidenceDelta: 0 },
    { strategy: "Conservative Test" as const, budget: 500, orderFactor: 0.35, inventoryFactor: 0.25, risk: "Low" as const, confidenceDelta: 6 },
    { strategy: "Marketplace Validation" as const, budget: 800, orderFactor: 0.48, inventoryFactor: 0.35, risk: "Medium" as const, confidenceDelta: -1 },
    { strategy: "Owned Channel Test" as const, budget: 650, orderFactor: 0.38, inventoryFactor: 0.3, risk: "Low" as const, confidenceDelta: 4 }
  ];

  const riskPenalty = { Low: 250, Medium: 650, High: 1600 };
  const riskScore = { Low: 0.15, Medium: 0.3, High: 0.62 };
  const topChannelScore = channels[0]?.score ?? 70;
  const executionFeasibility = Math.min(1, (topChannelScore + customer.audience_quality_score) / 170);
  const availableBudget = 3000;
  const cashAvailable = Math.max(5000, product.initialInventory * product.cogs * 1.4);
  const minimumMargin = 8;

  const scenarios = definitions.map((definition) => {
    const orders = Math.round(baseOrders * definition.orderFactor);
    const revenue = Math.round(orders * product.sellingPrice);
    const platformFee = revenue * 0.08;
    const refund = revenue * 0.055;
    const fulfillment = orders * product.fulfillmentCost;
    const profit = Math.round(revenue * baseMargin - definition.budget - platformFee - refund - fulfillment);
    const confidence = Math.max(45, Math.min(88, demand.confidence + definition.confidenceDelta));
    const inventory = Math.max(40, Math.round(product.initialInventory * definition.inventoryFactor));
    const margin = Math.round((profit / Math.max(revenue, 1)) * 1000) / 10;
    const constraints = {
      budget_passed: definition.budget <= availableBudget,
      inventory_passed: orders <= product.initialInventory,
      margin_passed: margin >= minimumMargin,
      cash_passed: inventory * product.cogs <= cashAvailable
    };
    const constraintPenalty = Object.values(constraints).every(Boolean) ? 0 : 5000;
    const launch_score = Math.round(
      profit * (confidence / 100) * executionFeasibility - riskPenalty[definition.risk] - constraintPenalty
    );

    return {
      strategy: definition.strategy,
      budget: definition.budget,
      inventory,
      revenue,
      profit,
      margin,
      risk: definition.risk,
      risk_score: riskScore[definition.risk],
      confidence,
      execution_feasibility: Math.round(executionFeasibility * 100) / 100,
      constraints,
      launch_score,
      selected: false
    };
  });

  const bestScore = Math.max(...scenarios.map((scenario) => scenario.launch_score));
  return scenarios.map((scenario) => ({ ...scenario, selected: scenario.launch_score === bestScore }));
}
