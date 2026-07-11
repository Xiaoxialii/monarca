export type ActionTrackingStatus =
  | "pending"
  | "accepted"
  | "running"
  | "completed"
  | "learned"
  | "rejected"
  | "expired"
  | "blocked";

export type ActionMetricsSnapshot = {
  revenue?: number;
  profit?: number;
  roas?: number;
  sold_units?: number;
  stock?: number;
  ad_spend?: number;
};

export type ActionEvaluationResult = {
  predicted_vs_actual_gap: number;
  error_rate: number;
  result_label: "win" | "neutral" | "miss";
  learning_feedback: string;
  evaluated_at: string;
};

export type ActionTrackingRecord = {
  action_id: string;
  workspace_id: string;
  sku: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  accepted_by: string | null;
  accepted_at: string | null;
  rejected_at?: string | null;
  status: ActionTrackingStatus;
  observation_window_days: number;
  baseline_metrics: ActionMetricsSnapshot;
  predicted_metrics: ActionMetricsSnapshot;
  actual_metrics: ActionMetricsSnapshot;
  evaluation_result: ActionEvaluationResult | null;
  confidence_score: number;
  learning_feedback: string | null;
  created_at: string;
  updated_at: string;
};
