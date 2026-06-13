"use client";

import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  CreditCard,
  Database,
  Loader2,
  Lock,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCopyLocale, getHtmlLang, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

export type PaymentPlan = "database-setup" | "professional" | "enterprise";
type CheckoutCurrency = "cny" | "usd";

const planIcons = {
  "database-setup": Database,
  professional: BrainCircuit,
  enterprise: ShieldCheck
} as const;

const mainPlanIds = ["professional", "enterprise", "database-setup"] as const satisfies readonly PaymentPlan[];

const paymentCopy = {
  en: {
    brand: "Monarca AI",
    selectorBadge: "Step 1",
    selectorTitle: "Choose a plan first",
    selectorSubtitle: "Select the plan you want to start, then confirm details below",
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
          price: "¥2,000",
          due: "评估后报价"
        },
        usd: {
          price: "¥2,000",
          due: "Quote after review"
        }
      }
    },
    plans: {
      "database-setup": {
        badge: "Consulting",
        name: "Database Setup",
        subtitle: "Build the data foundation",
        price: "$200+",
        cadence: "",
        description:
          "For teams that need a clean business database before analytics automation starts",
        due: "Scope first",
        primary: "Submit setup request",
        next: "We review your data sources and confirm a complexity-based quote",
        features: [
          "Business database and table structure design",
          "Core source connection and field standards",
          "Data cleaning, sync setup, and metric modeling prep"
        ]
      },
      professional: {
        badge: "Recommended",
        name: "Professional",
        subtitle: "Ongoing automated operating analysis with dedicated analyst support",
        price: "¥2,000",
        cadence: "/ month",
        billingNote: "Annual service term, billed annually",
        description:
          "Data onboarding + metric system configuration + dedicated analyst support + automated operating reports.",
        due: "Quote after review",
        primary: "Start professional",
        next: "Your workspace opens after checkout, then you can connect data",
        features: [
          "Connect databases, Excel, SQL, CSV, and other data sources",
          "Configure a dedicated metric system and report structure",
          "Dedicated analyst support for data onboarding and adoption",
          "Auto-generate daily, weekly, and monthly operating reports",
          "Support anomaly alerts, report refresh, and metric checks"
        ]
      },
      enterprise: {
        badge: "Private deployment",
        name: "Enterprise",
        subtitle: "Private enterprise decision system",
        price: "Custom",
        cadence: "",
        description:
          "For organizations that need private deployment, business logic modeling, and custom decision engines",
        due: "Custom quote",
        primary: "Request consultation",
        next: "We schedule a solution review and scope the enterprise deployment",
        features: [
          "Private deployment and data security isolation",
          "Enterprise knowledge base plus business logic modeling",
          "Custom decision engine integrated into business workflows"
        ]
      }
    }
  },
  zh: {
    brand: "蝴蝶效应",
    selectorBadge: "第 1 步",
    selectorTitle: "先选择套餐",
    selectorSubtitle: "选择要开始的方案，下方结算信息会自动更新",
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
          price: "¥2,000",
          due: "评估后报价"
        },
        usd: {
          price: "¥2,000",
          due: "Quote after review"
        }
      }
    },
    plans: {
      "database-setup": {
        badge: "咨询定价",
        name: "数据库搭建",
        subtitle: "建立数据基础设施",
        price: "¥2,000+",
        cadence: "",
        description: "适合在分析自动化开始前，需要先建立干净业务数据库的团队",
        due: "先确认范围",
        primary: "提交搭建需求",
        next: "我们会评估数据源和业务复杂度，再确认最终报价",
        features: [
          "业务数据库与数据表结构设计",
          "核心数据源连接和字段规范定义",
          "数据清洗、同步设置和指标建模准备"
        ]
      },
      professional: {
        badge: "推荐",
        name: "专业版",
        subtitle: "适合需要持续自动化经营分析，并希望有专属分析师协助落地的团队",
        price: "¥2,000",
        cadence: "/ 月",
        billingNote: "年度服务周期，按年支付",
        description: "数据接入 + 指标体系配置 + 专属分析师协助 + 自动化经营报告",
        due: "评估后报价",
        primary: "开通专业版",
        next: "结算后进入工作区，然后连接数据源",
        features: [
          "连接数据库、Excel、SQL、CSV 等数据源",
          "配置专属指标体系与经营报告结构",
          "专属分析师协助数据接入与分析落地",
          "自动生成日报、周报和月经营分析",
          "支持异常提醒、报告刷新和指标口径校验"
        ]
      },
      enterprise: {
        badge: "私有化",
        name: "企业版",
        subtitle: "企业级决策系统",
        price: "按需报价",
        cadence: "",
        description: "适合需要私有化部署、业务逻辑建模和定制决策引擎的组织",
        due: "按需报价",
        primary: "提交咨询",
        next: "我们会安排方案评审，并确认企业部署范围",
        features: [
          "私有化部署和数据安全隔离",
          "企业知识库 + 业务逻辑建模",
          "定制化决策引擎接入业务流"
        ]
      }
    }
  }
} as const;

function PlanBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
      {children}
    </span>
  );
}

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

export function PaymentPage({ plan }: { plan: PaymentPlan }) {
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan>(plan);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutStatus, setCheckoutStatus] = useState<"success" | "cancelled" | null>(null);
  const [entitlement, setEntitlement] = useState<BillingEntitlementSummary | null>(null);
  const [isLoadingEntitlement, setIsLoadingEntitlement] = useState(true);
  const [locale] = useLocale("en");
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
  const selected = copy.plans[selectedPlan];
  const Icon = planIcons[selectedPlan];
  const hasCurrencyPrice = selectedPlan === "professional";
  const usesStripe = false;
  const selectedCurrencyPrice = hasCurrencyPrice
    ? copy.stripePrices[selectedPlan][checkoutCurrency]
    : null;
  const selectedPrice = selectedCurrencyPrice?.price ?? selected.price;
  const selectedDue = selectedCurrencyPrice?.due ?? selected.due;
  const selectedBillingNote = "billingNote" in selected ? selected.billingNote : "";
  const currentPlanName =
    entitlement?.planType === "MONTHLY"
      ? copy.monthlyPlan
      : copy.noActivePlan;
  const currentPlanTypeLabel =
    entitlement?.planType === "MONTHLY"
      ? copy.monthlyPlan
      : null;
  const localeKey = getCopyLocale(locale);
  const contactMethodLabel = localeKey === "zh" ? "工作邮箱/微信" : "Work email / WeChat";
  const billingEmailLabel = localeKey === "zh" ? "工作邮箱" : "Work email";
  const formTitle =
    selectedPlan === "database-setup"
      ? localeKey === "zh"
        ? "搭建需求"
        : "Setup request"
      : selectedPlan === "professional"
        ? localeKey === "zh"
          ? "评估需求"
          : "Needs review"
      : usesStripe
        ? copy.formTitle
        : copy.contactTitle;
  const formSubtitle =
    selectedPlan === "database-setup"
      ? localeKey === "zh"
        ? "填写信息后，我们会确认数据库搭建范围"
        : "Tell us what you need built and we will confirm the setup scope"
      : selectedPlan === "professional"
        ? localeKey === "zh"
          ? "填写信息后，我们会在24小时内联系你"
          : "Submit your details and we will contact you within 24 hours"
      : usesStripe
        ? copy.paymentSubtitle
        : copy.contactSubtitle;
  const requestSuccessMessage =
    selectedPlan === "database-setup"
      ? localeKey === "zh"
        ? "提交成功！我们会评估数据源和业务复杂度，再确认最终报价"
        : "Submitted. We will evaluate your data sources and business complexity, then confirm the final quote."
      : selectedPlan === "enterprise"
        ? localeKey === "zh"
          ? "提交成功！我们会安排方案评审，并确认企业部署范围"
          : "Submitted. We will schedule a solution review and confirm the enterprise deployment scope."
        : selectedPlan === "professional"
          ? localeKey === "zh"
            ? "提交成功！我们会在24小时内，与您联系！"
            : "Submitted. We will contact you within 24 hours."
          : selected.next;
  const summaryTitle =
    selectedPlan === "professional"
      ? localeKey === "zh"
        ? "评估后报价"
        : "Quote after review"
      : copy.dueToday;
  const summaryValue = selectedPlan === "professional" ? "" : selectedDue;
  const summaryDescription =
    selectedPlan === "professional"
      ? localeKey === "zh"
        ? "提交后我们会在24小时内，与您联系！"
        : "Submit your request and we will contact you within 24 hours."
      : selected.next;
  const planEyebrow =
    selectedPlan === "professional"
      ? localeKey === "zh"
        ? "评估需求"
        : "Needs review"
      : copy.secure;

  const handleCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCheckoutMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/help-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          source: "checkout",
          plan: selectedPlan,
          name,
          company,
          email,
          notes,
          locale
        })
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        throw new Error(typeof data?.message === "string" ? data.message : copy.contactError);
      }

      setCheckoutMessage(requestSuccessMessage);
    } catch (error) {
      setCheckoutMessage(error instanceof Error ? error.message : copy.contactError);
    } finally {
      setIsSubmitting(false);
    }
  };

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
      className="relative isolate z-30 min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#ffffff_0%,#eef8f2_48%,#ffffff_100%)] text-slate-950"
    >
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
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

        <Card className="mb-5 overflow-hidden rounded-[28px] border-slate-200/80 bg-white/88 shadow-[0_18px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <CardContent className="p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <Badge variant="secondary" className="mb-3 rounded-full">
                  {copy.selectorBadge}
                </Badge>
                <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
                  {copy.selectorTitle}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">{copy.selectorSubtitle}</p>
              </div>
              <div className="w-full rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 sm:w-auto sm:min-w-56">
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
            <div className="grid gap-3 lg:grid-cols-3">
              {mainPlanIds.map((planId) => {
                const planCopy = copy.plans[planId];
                const PlanIcon = planIcons[planId];
                const isSelected = selectedPlan === planId;
                const planPrice =
                  planId === "professional"
                    ? copy.stripePrices.professional[checkoutCurrency].price
                    : planCopy.price;

                return (
                  <button
                    key={planId}
                    type="button"
                    onClick={() => setSelectedPlan(planId)}
                    className={cn(
                      "rounded-2xl border bg-white p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40",
                      isSelected &&
                        "border-emerald-400 bg-emerald-50/70 shadow-[0_14px_50px_rgba(4,120,87,0.12)]"
                    )}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="grid size-10 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
                        <PlanIcon className="size-5" />
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          isSelected
                            ? "bg-emerald-700 text-white"
                            : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {planCopy.badge}
                      </span>
                    </div>
                    <p className="text-base font-semibold text-slate-950">{planCopy.name}</p>
                    <p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">
                      {planCopy.subtitle}
                    </p>
                    <div className="mt-4 flex items-end gap-1">
                      <span className="text-2xl font-semibold text-slate-950">
                        {planPrice}
                      </span>
                      {planCopy.cadence ? (
                        <span className="pb-0.5 text-xs font-medium text-slate-500">
                          {planCopy.cadence}
                        </span>
                      ) : null}
                    </div>
                    {planId === "professional" ? (
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {locale === "zh" ? "年度服务周期，按年支付" : "Annual service term, billed annually"}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="relative z-10 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="relative z-10 overflow-hidden rounded-[32px] border-emerald-200 bg-gradient-to-br from-white via-emerald-50/80 to-white shadow-[0_24px_90px_rgba(4,120,87,0.12)]">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div className="grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
                <Icon className="size-6" />
              </div>
              <PlanBadge>{selected.badge}</PlanBadge>
            </div>
            <p className="text-sm font-medium text-emerald-700">{planEyebrow}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl">
              {selected.name}
            </h1>
            <p className="mt-3 text-base font-medium text-slate-500">{selected.subtitle}</p>
            <div className="mt-8 flex items-end gap-1">
              <span className="text-5xl font-semibold tracking-normal text-slate-950">
                {selectedPrice}
              </span>
              {selected.cadence ? (
                <span className="pb-1 text-sm font-medium text-slate-500">{selected.cadence}</span>
              ) : null}
            </div>
            {selectedBillingNote ? (
              <p className="mt-2 text-sm font-medium text-slate-500">{selectedBillingNote}</p>
            ) : null}
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-600">{selected.description}</p>

            <div className="mt-8 space-y-3">
              {selected.features.map((feature) => (
                <div key={feature} className="flex gap-3 text-sm leading-6 text-slate-700">
                  <Check className="mt-1 size-4 shrink-0 text-emerald-700" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="relative z-20 overflow-hidden rounded-[32px] border-slate-200/80 bg-white/95 shadow-[0_24px_90px_rgba(15,23,42,0.08)] backdrop-blur">
          <form
            action={usesStripe ? "/api/stripe/checkout" : undefined}
            method={usesStripe ? "GET" : undefined}
            onSubmit={handleCheckout}
          >
          <input type="hidden" name="plan" value={selectedPlan} />
          <CardHeader className="border-b p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl">
                  {formTitle}
                </CardTitle>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {formSubtitle}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{copy.name}</span>
                <Input
                  name="name"
                  autoComplete="name"
                  className="h-12 bg-white"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{copy.company}</span>
                <Input
                  name="organization"
                  autoComplete="organization"
                  className="h-12 bg-white"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-slate-500">
                  {usesStripe ? billingEmailLabel : contactMethodLabel}
                </span>
                <Input
                  name="email"
                  type={usesStripe ? "email" : "text"}
                  autoComplete={usesStripe ? "email" : "off"}
                  className="h-12 bg-white"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            </div>

            {usesStripe ? (
              <div className="mt-5 space-y-4 rounded-2xl border bg-slate-50/70 p-4">
                {hasCurrencyPrice ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-500">{copy.currency}</p>
                    <div className="relative z-10 grid grid-cols-2 gap-2 rounded-full bg-slate-200/70 p-1">
                      {(["cny", "usd"] as const).map((currency) => (
                        <label
                          key={currency}
                          className={cn(
                            "flex h-9 cursor-pointer items-center justify-center rounded-full text-sm font-semibold transition",
                            checkoutCurrency === currency
                              ? "bg-white text-slate-950 shadow-sm"
                              : "text-slate-500 hover:text-slate-800"
                          )}
                        >
                          <input
                            type="radio"
                            name="currency"
                            value={currency}
                            checked={checkoutCurrency === currency}
                            onChange={() => setCheckoutCurrency(currency)}
                            className="sr-only"
                          />
                          {copy.currencies[currency]}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4 text-emerald-700" />
                  <p className="text-sm font-semibold">{copy.secure}</p>
                </div>
                <p className="text-sm leading-6 text-slate-600">{copy.protected}</p>
              </div>
            ) : (
              <label className="mt-5 block space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{copy.notes}</span>
                <textarea
                  className="min-h-[128px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring"
                  placeholder={copy.notesPlaceholder}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            )}

            {!usesStripe ? (
              <div className="mt-5 rounded-2xl border bg-emerald-50/60 p-4">
                <div className="flex items-center justify-between gap-4 border-b border-emerald-100 pb-3">
                  <span className="text-sm font-medium text-slate-600">{summaryTitle}</span>
                  {summaryValue ? (
                    <span className="text-lg font-semibold text-slate-950">{summaryValue}</span>
                  ) : null}
                </div>
                <div className="mt-3 flex gap-3 text-sm leading-6 text-slate-600">
                  <Lock className="mt-1 size-4 shrink-0 text-emerald-700" />
                  <span>{summaryDescription}</span>
                </div>
              </div>
            ) : null}

            {checkoutMessage ? (
              <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                {checkoutMessage}
              </p>
            ) : null}

            <Button
              type="submit"
              className="relative z-10 mt-5 h-12 w-full cursor-pointer rounded-full bg-slate-950 text-white hover:bg-slate-800"
              disabled={isSubmitting}
            >
              {isSubmitting ? copy.redirecting : selected.primary}
              {isSubmitting ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mt-3 h-11 w-full rounded-full"
              onClick={handleGoBack}
            >
              {copy.secondary}
            </Button>
          </CardContent>
          </form>
        </Card>
        </div>
      </section>
    </main>
  );
}
