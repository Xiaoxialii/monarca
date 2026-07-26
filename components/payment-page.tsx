"use client";

import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  Database,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCopyLocale, getHtmlLang, useLocale, type Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

export type PaymentPlan = "database-setup" | "professional" | "enterprise";
type CheckoutCurrency = "cny" | "usd";

const planIcons = {
  "database-setup": Database,
  professional: BrainCircuit,
  enterprise: ShieldCheck
} as const;

const mainPlanIds = ["professional", "database-setup", "enterprise"] as const satisfies readonly PaymentPlan[];

const paymentCopy = {
  en: {
    brand: "Monarca AI",
    selectorBadge: "Step 1",
    selectorTitle: "Choose your profit optimization plan",
    selectorSubtitle: "Monarca is an AI profit optimization system for ecommerce teams, not a dashboard tool.",
    currentPlan: "Current plan",
    noActivePlan: "No active plan",
    loadingPlan: "Loading current plan...",
    monthlyPlan: "Monthly service",
    annualMonthlyPlan: "Annual service term, billed annually",
    addonLabel: "Add-on service",
    secure: "Secure checkout",
    formTitle: "Checkout details",
    contactTitle: "Consultation details",
    contactSubtitle: "Tell us about your business context and we will confirm scope",
    paymentSubtitle: "Confirm your billing information to start the plan",
    name: "Name",
    email: "Work email / WeChat",
    emailOptional: "Work email / WeChat",
    company: "Company",
    card: "Card number",
    expiry: "Expiry",
    cvc: "CVC",
    notes: "Business context",
    notesPlaceholder: "Data sources, team size, current reporting flow",
    redirecting: "Submitting...",
    checkoutError: "Unable to start Stripe checkout. Please try again.",
    contactError: "Unable to submit the request. Please try again.",
    checkoutSuccessTitle: "Payment completed",
    checkoutSuccessBody: "Stripe has confirmed your checkout. You can now continue to your workspace.",
    checkoutCancelledTitle: "Checkout cancelled",
    checkoutCancelledBody: "No payment was completed. You can review the plan and start checkout again.",
    goDashboard: "Go to dashboard",
    dueToday: "Due today",
    nextStep: "Next step",
    protected: "Payment details are protected by encrypted checkout",
    secondary: "Back",
    currency: "Currency",
    currencies: {
      cny: "CNY",
      usd: "USD"
    },
    stripePrices: {
      professional: {
        cny: {
          price: "$500",
          due: "Contact required"
        },
        usd: {
          price: "$500",
          due: "Contact required"
        }
      }
    },
    plans: {
      "database-setup": {
        badge: "Aligned incentives",
        name: "Performance-Based",
        subtitle: "For teams that want pricing aligned with measurable business impact",
        price: "Base fee + 5%",
        cadence: " of incremental profit",
        description:
          "Monarca shares the upside by charging based on measurable profit improvement.",
        due: "Scope first",
        primary: "Share Success",
        next: "We review your baseline profit model and confirm how incremental profit will be measured.",
        features: [
          "Profit optimization recommendations",
          "Scenario simulation",
          "Advertising budget optimization",
          "SKU portfolio optimization",
          "Performance tracking",
          "Incremental profit measurement"
        ]
      },
      professional: {
        badge: "Starter",
        name: "Starter",
        subtitle: "For ecommerce companies with fewer than 1,000 SKUs",
        price: "$500",
        cadence: "/ month",
        billingNote: "SKU-level profitability visibility for growing ecommerce teams",
        description:
          "For growing ecommerce teams that need SKU-level profitability visibility and AI-driven optimization.",
        due: "Contact required",
        primary: "Start Profit Analysis",
        next: "Submit your contact information and we will confirm onboarding details.",
        features: [
          "Connect ecommerce data sources",
          "SKU profitability analysis",
          "Product portfolio insights",
          "AI-generated business recommendations",
          "Basic profit and inventory alerts"
        ]
      },
      enterprise: {
        badge: "Portfolio scale",
        name: "Growth",
        subtitle: "For ecommerce companies with 1,000-2,000 SKUs",
        price: "$1,000",
        cadence: "/ month",
        billingNote: "For larger SKU portfolios and more complex operational decisions",
        description:
          "For growing brands managing larger SKU portfolios and complex operational decisions.",
        due: "Contact required",
        primary: "Optimize Your Portfolio",
        next: "Submit your contact information and we will confirm your growth plan setup.",
        features: [
          "Everything in Starter",
          "Advanced SKU portfolio optimization",
          "Ad spend allocation simulation",
          "Inventory investment recommendations",
          "Multi-channel analysis",
          "Advanced AI decision reports"
        ]
      }
    }
  },
  zh: {
    brand: "Monarca AI",
    selectorBadge: "第 1 步",
    selectorTitle: "选择利润优化方案",
    selectorSubtitle: "Monarca 是面向电商团队的 AI 利润优化系统，不是 dashboard 工具。",
    currentPlan: "当前套餐",
    noActivePlan: "暂无套餐",
    loadingPlan: "正在加载当前套餐...",
    monthlyPlan: "月服务",
    annualMonthlyPlan: "年度服务周期，按年支付",
    addonLabel: "附加服务",
    secure: "安全结算",
    formTitle: "付费信息",
    contactTitle: "咨询信息",
    contactSubtitle: "告诉我们业务背景，我们会确认交付范围",
    paymentSubtitle: "填写信息后即可开始方案",
    name: "姓名",
    email: "工作邮箱/微信",
    emailOptional: "工作邮箱/微信",
    company: "公司",
    card: "银行卡号",
    expiry: "有效期",
    cvc: "CVC",
    notes: "业务背景",
    notesPlaceholder: "数据源、团队规模、当前报表流程",
    redirecting: "提交中...",
    checkoutError: "暂时无法发起 Stripe 付款，请稍后重试。",
    contactError: "暂时无法提交咨询，请稍后重试。",
    checkoutSuccessTitle: "付款已完成",
    checkoutSuccessBody: "Stripe 已确认本次结算。现在可以进入工作区继续使用。",
    checkoutCancelledTitle: "付款已取消",
    checkoutCancelledBody: "本次没有完成付款。你可以确认套餐后重新发起结算。",
    goDashboard: "进入工作区",
    dueToday: "今日应付",
    nextStep: "下一步",
    protected: "支付信息通过加密结算保护",
    secondary: "返回",
    currency: "币种",
    currencies: {
      cny: "人民币",
      usd: "美元"
    },
    stripePrices: {
      professional: {
        cny: {
          price: "$500",
          due: "需要联系"
        },
        usd: {
          price: "$500",
          due: "Contact required"
        }
      }
    },
    plans: {
      "database-setup": {
        badge: "收益对齐",
        name: "Performance-Based",
        subtitle: "适合希望价格与可衡量业务结果对齐的电商公司",
        price: "基础费用 + 5%",
        cadence: " 增量利润",
        description: "Monarca 与客户共享优化收益，按可衡量利润改善收费。",
        due: "先确认范围",
        primary: "Share Success",
        next: "我们会评估你的利润基线，并确认增量利润的衡量方式。",
        features: [
          "利润优化建议",
          "方案模拟",
          "广告预算优化",
          "SKU 组合优化",
          "效果追踪",
          "增量利润衡量"
        ]
      },
      professional: {
        badge: "Starter",
        name: "Starter",
        subtitle: "适合 SKU 少于 1,000 个的电商公司",
        price: "$500",
        cadence: "/ 月",
        billingNote: "为增长型电商团队提供 SKU 级利润可视化",
        description: "适合需要 SKU 级盈利能力视图和 AI 优化建议的增长型电商团队。",
        due: "需要联系",
        primary: "Start Profit Analysis",
        next: "提交联系方式后，我们会确认接入细节。",
        features: [
          "连接电商数据源",
          "SKU 盈利能力分析",
          "产品组合洞察",
          "AI 生成经营建议",
          "基础利润和库存提醒"
        ]
      },
      enterprise: {
        badge: "Portfolio scale",
        name: "Growth",
        subtitle: "适合拥有 1,000-2,000 个 SKU 的电商公司",
        price: "$1,000",
        cadence: "/ 月",
        billingNote: "适合更大 SKU 组合和更复杂的经营决策",
        description: "适合管理更大 SKU 组合和复杂运营决策的成长型品牌。",
        due: "需要联系",
        primary: "Optimize Your Portfolio",
        next: "提交联系方式后，我们会确认 Growth 方案配置。",
        features: [
          "包含 Starter 的全部功能",
          "高级 SKU 组合优化",
          "广告支出分配模拟",
          "库存投资建议",
          "多渠道分析",
          "高级 AI 决策报告"
        ]
      }
    }
  }
} as const;

type BillingEntitlementSummary = {
  planType: "FREE" | "ONE_TIME" | "MONTHLY";
  status: "free" | "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "expired";
  canConnectDataSource: boolean;
  canGenerateReport: boolean;
  remainingReportGenerations: number | null;
  isUnlimitedReports: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  upgradeRequiredReason: string | null;
};

export function PaymentPage({ plan, defaultLocale = "en" }: { plan: PaymentPlan; defaultLocale?: Locale }) {
  void plan;
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutStatus, setCheckoutStatus] = useState<"success" | "cancelled" | null>(null);
  const [entitlement, setEntitlement] = useState<BillingEntitlementSummary | null>(null);
  const [isLoadingEntitlement, setIsLoadingEntitlement] = useState(true);
  const [locale] = useLocale(defaultLocale);
  const [checkoutCurrency, setCheckoutCurrency] = useState<CheckoutCurrency>("cny");
  const router = useRouter();
  const copy = paymentCopy[getCopyLocale(locale)];
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const checkout = searchParams.get("checkout");
    const message = searchParams.get("message");

    setCheckoutStatus(checkout === "success" || checkout === "cancelled" ? checkout : null);
    setCheckoutMessage(checkout === "error" && message ? message : "");
  }, []);
  useEffect(() => {
    setCheckoutCurrency(getCopyLocale(locale) === "zh" ? "cny" : "usd");
  }, [locale]);
  useEffect(() => {
    let isMounted = true;

    async function loadEntitlement() {
      setIsLoadingEntitlement(true);

      try {
        const response = await fetch("/api/billing/entitlement", { cache: "no-store" });
        const payload = await response.json().catch(() => null);

        if (isMounted && response.ok && payload?.ok) {
          setEntitlement(payload.entitlement as BillingEntitlementSummary);
        }
      } catch {
        if (isMounted) setEntitlement(null);
      } finally {
        if (isMounted) setIsLoadingEntitlement(false);
      }
    }

    void loadEntitlement();

    return () => {
      isMounted = false;
    };
  }, []);

  const backLabel =
    getCopyLocale(locale) === "zh" ? "返回" : "Back";
  const currentPlanName =
    entitlement?.planType === "MONTHLY"
      ? copy.monthlyPlan
      : copy.noActivePlan;
  const currentPlanTypeLabel =
    entitlement?.planType === "MONTHLY"
      ? copy.monthlyPlan
      : null;
  const localeKey = getCopyLocale(locale);

  const handleGoBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  };

  return (
    <main
      lang={getHtmlLang(locale)}
      className="relative isolate z-30 min-h-screen overflow-x-hidden bg-[#fbfbf8] text-slate-950"
    >
      <header className="border-b border-slate-200/70 bg-[#fbfbf8]/90 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center" aria-label={copy.brand}>
            <BrandLogo label={copy.brand} className="h-10" />
          </Link>
          <Button variant="ghost" className="rounded-full text-slate-600" onClick={handleGoBack}>
            <ArrowLeft />
            {backLabel}
          </Button>
        </nav>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <div className="mx-auto mb-9 max-w-5xl text-center">
          <Badge variant="secondary" className="mb-4 rounded-full border border-emerald-100 bg-white px-3 py-1 text-emerald-800 shadow-sm">
            {localeKey === "zh" ? "AI 利润优化定价" : "AI profit optimization pricing"}
          </Badge>
          <h1 className="whitespace-nowrap text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl">
            {copy.selectorTitle}
          </h1>
          <div className="mx-auto mt-6 inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
            <span className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white">
              {localeKey === "zh" ? "按月" : "Monthly"}
            </span>
          </div>
        </div>

        {checkoutStatus ? (
          <Card
            className={cn(
              "mb-5 overflow-hidden rounded-[24px] border bg-white shadow-[0_14px_50px_rgba(15,23,42,0.06)]",
              checkoutStatus === "success" ? "border-emerald-200" : "border-amber-200"
            )}
          >
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex gap-4">
                <div
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-full",
                    checkoutStatus === "success"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  )}
                >
                  <Check className="size-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    {checkoutStatus === "success"
                      ? copy.checkoutSuccessTitle
                      : copy.checkoutCancelledTitle}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {checkoutStatus === "success"
                      ? copy.checkoutSuccessBody
                      : copy.checkoutCancelledBody}
                  </p>
                </div>
              </div>
              {checkoutStatus === "success" ? (
                <Button
                  type="button"
                  className="h-10 shrink-0 rounded-full bg-slate-950 text-white hover:bg-slate-800"
                  onClick={() => router.push("/dashboard")}
                >
                  {copy.goDashboard}
                  <ArrowRight />
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {checkoutMessage ? (
          <p className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            {checkoutMessage}
          </p>
        ) : null}

        <Card className="mb-6 overflow-hidden rounded-[30px] border-slate-200/80 bg-white shadow-[0_18px_70px_rgba(15,23,42,0.06)]">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-4 flex justify-end">
              <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:w-auto sm:min-w-56">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  {copy.currentPlan}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-950">
                    {isLoadingEntitlement ? copy.loadingPlan : currentPlanName}
                  </span>
                  {!isLoadingEntitlement && currentPlanTypeLabel ? (
                    <Badge variant="secondary" className="rounded-full">
                      {currentPlanTypeLabel}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {mainPlanIds.map((planId) => {
                const planCopy = copy.plans[planId];
                const PlanIcon = planIcons[planId];
                const isRecommended = planId === "database-setup";
                const planPrice =
                  planId === "professional"
                    ? copy.stripePrices.professional[checkoutCurrency].price
                    : planCopy.price;
                const checkoutHref = `/api/stripe/checkout?plan=${encodeURIComponent(planId)}&currency=${encodeURIComponent(checkoutCurrency)}`;

                return (
                  <Link
                    key={planId}
                    href={checkoutHref}
                    className={cn(
                      "relative flex min-h-[420px] flex-col rounded-[26px] border bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_60px_rgba(15,23,42,0.08)]",
                      isRecommended && "border-slate-950 shadow-[0_22px_70px_rgba(15,23,42,0.12)]"
                    )}
                  >
                    {isRecommended ? (
                      <div className="absolute right-4 top-4 rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                        {localeKey === "zh" ? "推荐" : "Recommended"}
                      </div>
                    ) : null}
                    <div className="mb-5 flex items-start justify-between gap-3 pr-24">
                      <div className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-800">
                        <PlanIcon className="size-5" />
                      </div>
                    </div>
                    <p className="text-xl font-semibold text-slate-950">{planCopy.name}</p>
                    <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">
                      {planCopy.subtitle}
                    </p>
                    <div className="mt-6 flex items-end gap-1">
                      <span className="text-4xl font-semibold tracking-normal text-slate-950">
                        {planPrice}
                      </span>
                      {planCopy.cadence ? (
                        <span className="pb-1 text-sm font-medium text-slate-500">
                          {planCopy.cadence}
                        </span>
                      ) : null}
                    </div>
                    {"billingNote" in planCopy && planCopy.billingNote ? (
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {planCopy.billingNote}
                      </p>
                    ) : null}
                    <div className="mt-6 h-px bg-slate-100" />
                    <ul className="mt-5 grid gap-3">
                      {planCopy.features.slice(0, 5).map((feature) => (
                        <li key={feature} className="flex gap-2 text-sm leading-5 text-slate-700">
                          <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <span
                      className={cn(
                        "mt-auto flex h-11 items-center justify-center rounded-full text-sm font-semibold",
                        isRecommended ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-950"
                      )}
                    >
                      {planCopy.primary}
                    </span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
