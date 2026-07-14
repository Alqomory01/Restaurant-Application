export type Role = "HEAD_CHEF" | "KITCHEN_STAFF" | "MANAGER" | "STORE_KEEPER";

export interface User {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role: Role;
  branch: number | null;
}

export interface Ingredient {
  id: number;
  name: string;
  default_unit: string;
  unit_cost: string;
}

export interface RecipeIngredient {
  id?: number;
  ingredient: number;
  ingredient_name?: string;
  qty: string;
  /** Read-only, always the ingredient's own default_unit — see backend model note. */
  unit?: string;
  is_optional: boolean;
}

export interface CookingStep {
  id?: number;
  step_number: number;
  title: string;
  description: string;
  duration_minutes: number | null;
  temperature_c: number | null;
}

export type RecipeStatus = "ACTIVE" | "DEVELOPMENT" | "DISCONTINUED";

export interface Recipe {
  id: number;
  name: string;
  category: string;
  yield_qty: string;
  yield_unit: string;
  prep_time_minutes: number;
  selling_price: string;
  target_food_cost_pct: string | null;
  allergen_info: string;
  status: RecipeStatus;
  ingredients: RecipeIngredient[];
  steps: CookingStep[];
}

export interface KitchenStock {
  id: number;
  ingredient: number;
  ingredient_name: string;
  qty_on_hand: string;
  reorder_threshold: string;
  unit: string;
  below_threshold: boolean;
  updated_at: string;
}

export type ServicePeriod = "BREAKFAST" | "LUNCH" | "DINNER" | "ALL_DAY";
export type PlanStatus = "DRAFT" | "SUBMITTED";
export type PlanItemStatus = "PENDING" | "IN_PROGRESS" | "BLOCKED" | "COMPLETE";

export interface ProductionPlanItem {
  id: number;
  recipe: number;
  recipe_name: string;
  planned_qty: string;
  unit: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  scheduled_time: string | null;
  status: PlanItemStatus;
  batch_id: number | null;
  batch_code: string | null;
}

export interface ProductionPlan {
  id: number;
  service_date: string;
  service_period: ServicePeriod;
  status: PlanStatus;
  created_by: number | null;
  created_at: string;
  items: ProductionPlanItem[];
}

export type QualityCheck = "PASSED" | "CONDITIONAL" | "FAILED";
export type BatchStatus = "IN_PROGRESS" | "COMPLETE";

export interface IngredientDeduction {
  id: number;
  ingredient: number;
  ingredient_name: string;
  theoretical_qty: string;
  actual_qty: string;
  unit_cost_at_time: string;
}

export interface BatchProduction {
  id: number;
  plan_item: number;
  recipe_name: string;
  batch_code: string;
  planned_qty: string;
  actual_qty: string | null;
  quality_check: QualityCheck | "";
  quality_notes: string;
  substitution_notes: string;
  produced_by: number | null;
  started_at: string;
  completed_at: string | null;
  status: BatchStatus;
  deductions: IngredientDeduction[];
}

export type Urgency = "NORMAL" | "HIGH" | "URGENT";
export type StockRequestStatus = "PENDING" | "FULFILLED" | "CANCELLED";

export interface StockRequest {
  id: number;
  request_code: string;
  ingredient: number;
  ingredient_name: string;
  qty_requested: string;
  urgency: Urgency;
  reason: string;
  status: StockRequestStatus;
  raised_by: number | null;
  raised_by_name: string | null;
  raised_at: string;
  resolved_at: string | null;
}

export interface DashboardData {
  batches_today_total: number;
  batches_today_complete: number;
  production_efficiency_pct: number | null;
  /** Real prior-day figure (not projected) — powers the trend arrow. */
  production_efficiency_pct_yesterday: number | null;
  ingredient_shortfall_count: number;
  wastage_today_count: number;
  wastage_yesterday_count: number;
  wastage_today_value?: number | null;
  actual_food_cost_pct?: number | null;
  actual_food_cost_pct_yesterday?: number | null;
}

export interface CostingRow {
  recipe_id: number;
  recipe_name: string;
  theoretical_cost_per_unit: string;
  actual_cost_per_unit: string | null;
  theoretical_food_cost_pct: string | null;
  actual_food_cost_pct: string | null;
  target_food_cost_pct: string | null;
}

export type CostingStatus = "on_target" | "watch" | "over_target" | "no_data";

export interface CostingSummaryRow {
  recipe_id: number;
  recipe_name: string;
  status: CostingStatus;
}

export interface InsufficientStockError {
  detail: string;
  shortfalls: string[];
}

export interface AuditLogEntry {
  id: number;
  actor: number | null;
  actor_name: string | null;
  action: string;
  model_name: string;
  object_id: string;
  object_repr: string;
  detail: string;
  created_at: string;
}

export type WastageReason = "OVER_PRODUCTION" | "PREP_WASTE" | "SPOILAGE" | "DROPPED" | "OTHER";

export interface WastageEntry {
  id: number;
  ingredient: number | null;
  ingredient_name: string | null;
  batch: number | null;
  batch_code: string | null;
  recipe_name: string | null;
  qty: string;
  unit: string;
  reason: WastageReason;
  notes: string;
  /** null when the requesting user's role isn't allowed to see cost figures. */
  value: string | null;
  logged_by: number | null;
  logged_by_name: string | null;
  logged_at: string;
}

export interface BatchEfficiencyRow {
  recipe_id: number;
  recipe_name: string;
  batches_count: number;
  planned_qty: number;
  actual_qty: number;
  production_efficiency_pct: number | null;
  wasted_qty: number;
  /** (actual - wasted) / actual — a proxy for "how much of what was made got
   * used", pending real POS sell-through data. */
  utilization_pct: number | null;
  /** Manager only. */
  wasted_value?: number;
}

export interface WastageByReasonRow {
  reason: WastageReason;
  count: number;
  /** Manager only. */
  value?: number;
}

export interface WastageSummary {
  total_count: number;
  by_reason: WastageByReasonRow[];
  /** Manager only. */
  total_value?: number;
}

export interface StaffOutputRow {
  user_id: number;
  name: string;
  batches_completed: number;
  wastage_logged: number;
  /** Manager only. */
  wastage_value?: number;
}

export interface ReportsData {
  date_from: string;
  date_to: string;
  batch_efficiency: BatchEfficiencyRow[];
  wastage_summary: WastageSummary;
  staff_output: StaffOutputRow[];
}
