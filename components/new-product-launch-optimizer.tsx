"use client";

import {
  CheckCircle2,
  ChevronRight
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  generateLaunchPlan,
  type LaunchPlan,
  type LaunchProductInput
} from "@/lib/launch/new-product-launch-optimizer";
import { cn } from "@/lib/utils";

const EMPTY_PRODUCT: LaunchProductInput = {
  productName: "",
  sku: "",
  category: "",
  subcategory: "",
  sellingPrice: 0,
  cogs: 0,
  initialInventory: 0,
  targetMarket: "",
  targetCustomer: "",
  productDescription: "",
  supplierLeadTimeDays: 0,
  fulfillmentCost: 0
};

const PRODUCT_INPUT_FIELDS = [
  "Start with Product description",
  "SKU",
  "Category",
  "Price",
  "Target Market",
  "Fulfillment Cost",
  "Target Customer",
  "Product Description"
];

const IMPORTED_NEW_PRODUCTS: Array<LaunchProductInput & { createdDate?: string }> = [];

type InputMode = "manual" | "import";
type LaunchWorkspaceView = "recommendation" | "intelligence";

export function NewProductLaunchOptimizer({
  locale = "en",
  hasConnectedData = true,
  isLoadingConnectedData = false
}: {
  locale?: "en" | "zh";
  hasConnectedData?: boolean;
  isLoadingConnectedData?: boolean;
}) {
  const isZh = locale === "zh";
  const [mode, setMode] = useState<InputMode>("manual");
  const [product, setProduct] = useState<LaunchProductInput>(EMPTY_PRODUCT);
  const [selectedImportedSku, setSelectedImportedSku] = useState("");
  const [plan, setPlan] = useState<LaunchPlan | null>(null);
  const [workspaceView, setWorkspaceView] = useState<LaunchWorkspaceView>("recommendation");
  const [hasGeneratedPlan, setHasGeneratedPlan] = useState(false);
  const [manualHasInput, setManualHasInput] = useState(false);

  useEffect(() => {
    if (!isLoadingConnectedData && !hasConnectedData && mode === "import") {
      setMode("manual");
      setHasGeneratedPlan(false);
    }
  }, [hasConnectedData, isLoadingConnectedData, mode]);

  const selectedImportedProduct = useMemo(
    () => IMPORTED_NEW_PRODUCTS.find((item) => item.sku === selectedImportedSku) ?? null,
    [selectedImportedSku]
  );

  const generatePlan = (nextProduct = mode === "import" ? selectedImportedProduct : product) => {
    if (!nextProduct) {
      setHasGeneratedPlan(false);
      return;
    }

    if (mode === "manual" && !manualHasInput) {
      setHasGeneratedPlan(false);
      return;
    }

    setProduct(nextProduct);
    setPlan(generateLaunchPlan(nextProduct));
    setHasGeneratedPlan(true);
    setWorkspaceView("recommendation");
  };

  return (
    <section className="min-h-[calc(100vh-5rem)] overflow-hidden rounded-[28px] bg-[#edf1f6] text-slate-950">
      <div className="grid min-h-[calc(100vh-5rem)] grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-slate-200 bg-white xl:border-b-0 xl:border-r">
          <div className="px-7 pt-6">
            <div className="flex rounded-full bg-slate-100 p-1">
              <ModeButton
                active={mode === "manual"}
                onClick={() => {
                  setMode("manual");
                  setHasGeneratedPlan(false);
                }}
              >
                {isZh ? "手动输入" : "Manual Product Input"}
              </ModeButton>
              <ModeButton
                active={mode === "import"}
                onClick={() => {
                  if (!isLoadingConnectedData && !hasConnectedData) return;
                  setMode("import");
                  setHasGeneratedPlan(false);
                }}
                disabled={!isLoadingConnectedData && !hasConnectedData}
              >
                {isZh ? "导入新品" : "Import New Products"}
              </ModeButton>
            </div>
          </div>

          <div className="px-7 pb-4 pt-8">
            {mode === "manual" ? (
              <ManualProductInput
                product={product}
                setProduct={setProduct}
                isZh={isZh}
                onHasInputChange={setManualHasInput}
              />
            ) : isLoadingConnectedData ? (
              <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-sm font-semibold leading-6 text-[#5747e8]">
                {isZh ? "正在更新数据" : "Updating data"}
              </div>
            ) : hasConnectedData ? (
              <ImportProducts
                selectedSku={selectedImportedSku}
                products={IMPORTED_NEW_PRODUCTS}
                isZh={isZh}
                onSelect={(sku) => {
                  setSelectedImportedSku(sku);
                  setHasGeneratedPlan(false);
                }}
              />
            ) : (
              <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-sm font-semibold leading-6 text-slate-500">
                {isZh ? "连接数据源后可导入新品。" : "Connect a data source to import new products."}
              </div>
            )}
          </div>

          <div className="shrink-0 bg-white px-7 pb-8 pt-2">
            <div className="flex justify-end">
            <button
              type="button"
              onClick={() => generatePlan()}
              aria-label={isZh ? "生成上市计划" : "Generate launch plan"}
              disabled={isLoadingConnectedData || (mode === "manual" && !manualHasInput) || (mode === "import" && !selectedImportedProduct)}
              className="flex h-12 items-center justify-center rounded-2xl bg-[#079669] px-7 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(7,150,105,0.24)] transition hover:bg-[#067f5a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isZh ? "开始" : "Start"}
            </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 overflow-y-auto bg-[#e7ebe8]">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-6 pb-7 pt-12 lg:px-8">
            {mode === "import" && isLoadingConnectedData ? (
              <div className="flex min-h-[calc(100vh-11rem)] items-center justify-center bg-[#e7ebe8] text-center">
                <p className="text-sm font-semibold text-[#5747e8]">
                  {isZh ? "正在更新数据" : "Updating data"}
                </p>
              </div>
            ) : !hasGeneratedPlan || !plan ? (
              <div className="flex min-h-[calc(100vh-11rem)] items-center justify-center text-center">
                <h2 className="max-w-[560px] text-2xl font-semibold leading-tight tracking-tight text-slate-950 lg:text-3xl">
                  {isZh ? "把每一次新品上市变成利润机会" : "Turn every new product launch into a profit opportunity"}
                </h2>
              </div>
            ) : (
            <>
            <div className="mx-auto flex w-fit rounded-full bg-slate-200/70 p-1">
              <WorkspaceTab active={workspaceView === "recommendation"} onClick={() => setWorkspaceView("recommendation")}>
                Recommendation
              </WorkspaceTab>
              <WorkspaceTab active={workspaceView === "intelligence"} onClick={() => setWorkspaceView("intelligence")}>
                Recommendation Intelligence
              </WorkspaceTab>
            </div>

            {workspaceView === "recommendation" ? (
            <div className="mx-auto w-full max-w-[860px] space-y-4">
              <section className="rounded-[28px] bg-white px-5 py-5 shadow-sm ring-1 ring-slate-200/70">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {isZh ? "Recommended Launch Plan" : "Recommended Launch Plan"}
                </p>
                <div className="mt-5 max-w-[520px] space-y-3.5">
                  <PlanLine
                    label="Primary channel"
                    value={`${plan.selected_plan.primary_channel} · ${getChannelBudgetShare(plan, plan.selected_plan.primary_channel)} budget`}
                  />
                  <PlanLine
                    label="Secondary channel"
                    value={`${plan.selected_plan.secondary_channel} · ${getChannelBudgetShare(plan, plan.selected_plan.secondary_channel)} budget`}
                  />
                  <PlanLine label="Budget" value={`${formatMoney(plan.ad_budget_plan.total_budget)} / ${plan.ad_budget_plan.period_days} days`} />
                  <PlanLine label="Inventory" value={`${plan.inventory_plan.total_inventory.toLocaleString()} units`} />
                  <PlanLine label="Revenue" value={formatMoney(plan.selected_plan.expected_revenue_30d)} />
                </div>
              </section>
              <div className="mx-auto lg:max-w-[240px]">
                <button
                  type="button"
                  className="h-11 w-full rounded-2xl bg-[#079669] px-4 text-sm font-semibold text-white transition hover:bg-[#067f5a]"
                >
                  {isZh ? "Accept Plan" : "Accept Plan"}
                </button>
              </div>
            </div>
            ) : null}

            {workspaceView === "intelligence" ? (
            <section className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200/70">
              <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">AI Launch Report</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight">Launch Decision Report</h3>
                </div>
                <p className="text-sm font-semibold text-slate-500">{plan.product.productName}</p>
              </div>

              <div className="overflow-hidden rounded-[28px] border border-slate-200">
                <ReportSection title="Product Intelligence" subtitle="Product economics and launch fit" defaultOpen>
                  <div className="grid gap-3 md:grid-cols-4">
                    <SignalTile label="Product Type" value={readable(plan.product_intelligence.product_type)} />
                    <SignalTile label="Price Band" value={readable(plan.product_intelligence.price_band)} />
                    <SignalTile label="Margin" value={`${plan.product_intelligence.margin}%`} />
                    <SignalTile label="Seasonality" value={readable(plan.product_intelligence.seasonality)} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {plan.product_intelligence.signals.map((signal) => (
                      <span key={signal} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                        {signal}
                      </span>
                    ))}
                  </div>
                </ReportSection>

                <ReportSection title="Recommended Channels" subtitle="Budget and inventory allocation" defaultOpen>
                  <div className="grid gap-3 lg:grid-cols-3">
                    {plan.channel_strategy.map((channel, index) => (
                      <div key={channel.channel} className="rounded-3xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-lg font-semibold">{rankLabel(index)} {channel.channel}</p>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
                            {channel.score}/100
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <SignalTile label="Budget" value={formatMoney(channel.budget)} compact />
                          <SignalTile label="Inventory" value={`${channel.inventory} units`} compact />
                        </div>
                        <p className="mt-4 text-sm font-semibold text-slate-500">{channel.goal}</p>
                        <ul className="mt-3 space-y-2">
                          {channel.reason.slice(0, 2).map((reason) => (
                            <li key={reason} className="flex gap-2 text-sm text-slate-600">
                              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </ReportSection>

                <ReportSection title="Why AI Chose This" subtitle="Evidence from similar products, demand, customers, and inventory">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <EvidenceCard title="Similar Products" value={`${plan.similar_products.analyzed_count} analyzed`} details={plan.reasoning.similar_products} />
                    <EvidenceCard title="Demand Forecast" value={`${plan.demand_forecast.expected_orders.toLocaleString()} orders`} details={plan.reasoning.demand_signal} />
                    <EvidenceCard title="Customer Signal" value={`${plan.customer_signal.audience_quality_score}/100`} details={plan.reasoning.customer_quality} />
                    <EvidenceCard title="Inventory Logic" value={`${plan.inventory_plan.total_inventory.toLocaleString()} units`} details={plan.reasoning.inventory_logic} />
                  </div>
                </ReportSection>

                <ReportSection title="AI Scenario Comparison" subtitle="AI tested 5 launch strategies">
                  <div className="overflow-hidden rounded-3xl border border-slate-200">
                    <div className="grid grid-cols-5 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <span>Strategy</span>
                      <span>Budget</span>
                      <span>Profit</span>
                      <span>Risk</span>
                      <span>Decision</span>
                    </div>
                    {plan.scenarios.map((scenario) => (
                      <div key={scenario.strategy} className="grid grid-cols-5 border-t border-slate-100 px-4 py-4 text-sm font-semibold text-slate-800">
                        <span>{scenario.strategy}</span>
                        <span>{formatMoney(scenario.budget)}</span>
                        <span className="text-emerald-800">{formatMoney(scenario.profit)}</span>
                        <span>{scenario.risk}</span>
                        <span>{scenario.selected ? "Selected" : "Alternative"}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
                    AI selected {plan.selected_plan.strategy}: {plan.selected_plan.reason}
                  </p>
                </ReportSection>
              </div>
            </section>
            ) : null}
            </>
            )}
          </div>
        </main>
      </div>
    </section>
  );
}

function ManualProductInput({
  product,
  setProduct,
  isZh,
  onHasInputChange
}: {
  product: LaunchProductInput;
  setProduct: (product: LaunchProductInput) => void;
  isZh: boolean;
  onHasInputChange: (hasInput: boolean) => void;
}) {
  const [rawInput, setRawInput] = useState(productToPrompt);

  return (
    <div>
      <label className="block">
        <textarea
          value={rawInput}
          onChange={(event) => {
            const nextValue = event.target.value;
            setRawInput(nextValue);
            setProduct(parseProductPrompt(nextValue, product));
            onHasInputChange(hasProductPromptDetails(nextValue));
          }}
          spellCheck={false}
          className="min-h-[360px] w-full resize-none rounded-[28px] border border-slate-200 bg-white px-6 py-6 text-[13px] font-medium leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
          placeholder={isZh ? "输入新品信息..." : "Enter product details..."}
        />
      </label>
    </div>
  );
}

function productToPrompt() {
  return PRODUCT_INPUT_FIELDS.join("\n");
}

function hasProductPromptDetails(rawInput: string) {
  return PRODUCT_INPUT_FIELDS.some((field) => Boolean(readPromptValue(rawInput, [field])));
}

function parseProductPrompt(rawInput: string, fallback: LaunchProductInput): LaunchProductInput {
  const productName = readPromptValue(rawInput, ["Start with Product description", "Product Name"]) || fallback.productName;
  const sku = readPromptValue(rawInput, ["SKU"]) || fallback.sku;
  const category = readPromptValue(rawInput, ["Category"]) || fallback.category;
  const sellingPrice = readNumberPromptValue(rawInput, ["Price", "Selling Price"], fallback.sellingPrice);
  const targetMarket = readPromptValue(rawInput, ["Target Market"]) || fallback.targetMarket;
  const fulfillmentCost = readNumberPromptValue(rawInput, ["Fulfillment Cost"], fallback.fulfillmentCost);
  const targetCustomer = readPromptValue(rawInput, ["Target Customer"]) || fallback.targetCustomer;
  const productDescription = readPromptValue(rawInput, ["Product Description"]) || fallback.productDescription;

  return {
    ...fallback,
    productName,
    sku,
    category,
    sellingPrice,
    targetMarket,
    fulfillmentCost,
    targetCustomer,
    productDescription
  };
}

function readNumberPromptValue(rawInput: string, labels: string[], fallback: number) {
  const rawValue = readPromptValue(rawInput, labels);
  if (!rawValue) return fallback;
  const parsed = Number(rawValue.replace(/[$,%]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readPromptValue(rawInput: string, labels: string[]) {
  const lines = rawInput.split(/\r?\n/);
  const normalizedLabels = labels.map(normalizePromptLabel);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const [maybeLabel, ...inlineValueParts] = line.split(":");
    const normalizedLineLabel = normalizePromptLabel(maybeLabel);

    if (!normalizedLabels.includes(normalizedLineLabel)) continue;

    const inlineValue = inlineValueParts.join(":").trim();
    if (inlineValue) return inlineValue;

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const candidate = lines[nextIndex]?.trim() ?? "";
      if (!candidate) continue;
      const candidateLabel = normalizePromptLabel(candidate.replace(/:$/, ""));
      if (PRODUCT_INPUT_FIELDS.map(normalizePromptLabel).includes(candidateLabel)) return "";
      return candidate;
    }
  }

  return "";
}

function normalizePromptLabel(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function ImportProducts({
  selectedSku,
  products,
  isZh,
  onSelect
}: {
  selectedSku: string;
  products: Array<LaunchProductInput & { createdDate?: string }>;
  isZh: boolean;
  onSelect: (sku: string) => void;
}) {
  if (products.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-sm font-semibold leading-6 text-slate-500">
        {isZh ? "当前没有可导入的新品数据。" : "No imported new product data is available."}
      </div>
    );
  }

  return (
    <div>
      <div className="max-h-[520px] overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-3">
        <div className="space-y-3">
          {products.map((item) => (
            <button
              type="button"
              key={item.sku}
              onClick={() => onSelect(item.sku)}
              className={cn(
                "w-full rounded-2xl border p-4 text-left transition",
                selectedSku === item.sku ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{item.sku}</p>
                  <p className="mt-1 text-sm font-medium text-slate-600">{item.productName}</p>
                </div>
                <ChevronRight className="size-5 text-slate-400" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
                <span>{item.category}</span>
                <span>{formatMoney(item.sellingPrice)}</span>
                <span>Cost {formatMoney(item.cogs)}</span>
                <span>{item.initialInventory} units</span>
                {item.createdDate ? <span className="col-span-2">Created {item.createdDate}</span> : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportSection({
  title,
  subtitle,
  defaultOpen = false,
  children
}: {
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-t border-slate-200 first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden">
        <div>
          <h4 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h4>
          <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-slate-400 transition group-open:rotate-90" />
      </summary>
      <div className="px-5 pb-5">
        {children}
      </div>
    </details>
  );
}

function EvidenceCard({ title, value, details }: { title: string; value: string; details: string[] }) {
  return (
    <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <div className="mt-4 space-y-3">
        {details.slice(0, 4).map((detail) => (
          <p key={detail} className="flex gap-2 text-sm font-medium leading-5 text-slate-600">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <span>{detail}</span>
          </p>
        ))}
      </div>
    </section>
  );
}

function WorkspaceTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-5 py-3 text-sm font-semibold transition",
        active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
      )}
    >
      {children}
    </button>
  );
}

function ModeButton({ active, onClick, disabled = false, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex-1 rounded-full px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"
      )}
    >
      {children}
    </button>
  );
}

function SignalTile({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn("rounded-2xl bg-slate-50 px-4 py-3", compact && "bg-white ring-1 ring-slate-200")}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function PlanLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function getChannelBudgetShare(plan: LaunchPlan, channelName: string) {
  const channel = plan.channel_strategy.find((item) => item.channel === channelName);
  const totalBudget = plan.ad_budget_plan.total_budget;

  if (!channel || totalBudget <= 0) return "0%";

  return `${((channel.budget / totalBudget) * 100).toFixed(1)}%`;
}

function rankLabel(index: number) {
  return ["🥇", "🥈", "🥉"][index] ?? "•";
}

function readable(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}
