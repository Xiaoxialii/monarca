import { ProfitOptimizer } from "@/lib/optimization/solver";
import type { CommerceState, Decision } from "@/lib/optimization/objective";

export class DecisionMaker {
  constructor(private readonly optimizer = new ProfitOptimizer()) {}

  run(state: CommerceState): Decision[] {
    return this.optimizer.solve(state);
  }
}
