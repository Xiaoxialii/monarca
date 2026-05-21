"use client";

import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  CreditCard,
  Database,
  Lock,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCopyLocale, getHtmlLang, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

export type PaymentPlan = "trial" | "database-setup" | "professional" | "enterprise";

const planIcons = {
  trial: Sparkles,
  "database-setup": Database,
  professional: BrainCircuit,
  enterprise: ShieldCheck
} as const;

const mainPlanIds = ["trial", "professional", "enterprise"] as const satisfies readonly PaymentPlan[];
const addonPlanIds = ["database-setup"] as const satisfies readonly PaymentPlan[];

const paymentCopy = {
  en: {
    brand: "Monarca AI",
    selectorBadge: "Step 1",
    selectorTitle: "Choose a plan first",
    selectorSubtitle: "Select the plan you want to start, then confirm details below",
    addonLabel: "Add-on service",
    secure: "Secure checkout",
    formTitle: "Checkout details",
    contactTitle: "Consultation details",
    contactSubtitle: "Tell us about your business context and we will confirm scope",
    paymentSubtitle: "Confirm your billing information to start the plan",
    name: "Name",
    email: "Work email",
    company: "Company",
    card: "Card number",
    expiry: "Expiry",
    cvc: "CVC",
    notes: "Business context",
    notesPlaceholder: "Data sources, team size, current reporting flow",
    dueToday: "Due today",
    nextStep: "Next step",
    protected: "Payment details are protected by encrypted checkout",
    secondary: "Back",
    plans: {
      trial: {
        badge: "One-time",
        name: "One-time Experience",
        subtitle: "Try one AI growth analysis session",
        price: "$49",
        cadence: "",
        description:
          "For teams that want to experience the AI growth analysis workflow before subscribing",
        due: "$49",
        primary: "Start experience",
        next: "After checkout, your workspace opens with a guided demo flow",
        features: [
          "One guided growth analysis experience",
          "Sample metrics and report workflow",
          "Data source and schema setup recommendation"
        ]
      },
      "database-setup": {
        badge: "Consulting",
        name: "Database Setup",
        subtitle: "Build the data foundation",
        price: "$499+",
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
        subtitle: "Report automation + data analysis + decision support",
        price: "$499",
        cadence: "/ month",
        description:
          "For teams ready to automate growth reporting and use AI to explain metric movement",
        due: "$499",
        primary: "Confirm subscription",
        next: "Your workspace opens after checkout, then you can connect data",
        features: [
          "Auto-generated business analysis reports",
          "Metric monitoring and anomaly alerts",
          "Conversational data exploration with Why-layer reasoning",
          "Causal analysis and actionable recommendations"
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
    addonLabel: "附加服务",
    secure: "安全结算",
    formTitle: "付费信息",
    contactTitle: "咨询信息",
    contactSubtitle: "告诉我们业务背景，我们会确认交付范围",
    paymentSubtitle: "填写信息后即可开始方案",
    name: "姓名",
    email: "工作邮箱",
    company: "公司",
    card: "银行卡号",
    expiry: "有效期",
    cvc: "CVC",
    notes: "业务背景",
    notesPlaceholder: "数据源、团队规模、当前报表流程",
    dueToday: "今日应付",
    nextStep: "下一步",
    protected: "支付信息通过加密结算保护",
    secondary: "返回",
    plans: {
      trial: {
        badge: "单次体验",
        name: "单次体验",
        subtitle: "体验一次 AI 增长分析流程",
        price: "¥200",
        cadence: "",
        description: "适合在订阅前，先体验一次 AI 增长分析工作流的团队",
        due: "¥200",
        primary: "开始体验",
        next: "结算后进入工作区，并开启引导式演示流程",
        features: [
          "一次引导式增长分析体验",
          "示例指标和报告生成流程",
          "数据源与 Schema 搭建建议"
        ]
      },
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
        subtitle: "报告自动化 + 数据分析 + 决策辅助",
        price: "¥2,000",
        cadence: "/ 月",
        description: "适合希望自动生成增长报告，并用 AI 解释指标变化的团队",
        due: "¥2,000",
        primary: "确认订阅",
        next: "结算后进入工作区，然后连接数据源",
        features: [
          "自动生成业务分析报告",
          "指标监控 & 异常提醒",
          "对话式数据探索和 Why 层推理",
          "因果分析和可执行决策建议"
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

export function PaymentPage({ plan }: { plan: PaymentPlan }) {
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan>(plan);
  const [fromHome, setFromHome] = useState(false);
  const [locale] = useLocale("en");
  const router = useRouter();
  const copy = paymentCopy[getCopyLocale(locale)];
  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    setFromHome(from === "home");
  }, []);

  const backLabel =
    getCopyLocale(locale) === "zh" ? "返回" : "Back";
  const selected = copy.plans[selectedPlan];
  const Icon = planIcons[selectedPlan];
  const isProfessional = selectedPlan === "professional";

  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fromHome ? "/" : "/dashboard");
  };

  return (
    <main
      lang={getHtmlLang(locale)}
      className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#eef8f2_48%,#ffffff_100%)] text-slate-950"
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

      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <Card className="mb-5 overflow-hidden rounded-[28px] border-slate-200/80 bg-white/88 shadow-[0_18px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <CardContent className="p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <Badge variant="secondary" className="mb-3 rounded-full">
                  {copy.selectorBadge}
                </Badge>
                <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
                  {copy.selectorTitle}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">{copy.selectorSubtitle}</p>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {mainPlanIds.map((planId) => {
                const planCopy = copy.plans[planId];
                const PlanIcon = planIcons[planId];
                const isSelected = selectedPlan === planId;

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
                        {planCopy.price}
                      </span>
                      {planCopy.cadence ? (
                        <span className="pb-0.5 text-xs font-medium text-slate-500">
                          {planCopy.cadence}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              {addonPlanIds.map((planId) => {
                const planCopy = copy.plans[planId];
                const PlanIcon = planIcons[planId];
                const isSelected = selectedPlan === planId;

                return (
                  <button
                    key={planId}
                    type="button"
                    onClick={() => setSelectedPlan(planId)}
                    className={cn(
                      "flex w-full flex-col gap-3 rounded-2xl border bg-slate-50/70 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40 sm:flex-row sm:items-center sm:justify-between",
                      isSelected &&
                        "border-emerald-400 bg-emerald-50/70 shadow-[0_14px_50px_rgba(4,120,87,0.1)]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
                        <PlanIcon className="size-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-emerald-700">{copy.addonLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">
                          {planCopy.name}
                        </p>
                        <p className="text-sm text-slate-500">{planCopy.subtitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold text-slate-950">{planCopy.price}</span>
                      <ArrowRight className="size-4 text-slate-500" />
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="overflow-hidden rounded-[32px] border-emerald-200 bg-gradient-to-br from-white via-emerald-50/80 to-white shadow-[0_24px_90px_rgba(4,120,87,0.12)]">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div className="grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
                <Icon className="size-6" />
              </div>
              <PlanBadge>{selected.badge}</PlanBadge>
            </div>
            <p className="text-sm font-medium text-emerald-700">{copy.secure}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl">
              {selected.name}
            </h1>
            <p className="mt-3 text-base font-medium text-slate-500">{selected.subtitle}</p>
            <div className="mt-8 flex items-end gap-1">
              <span className="text-5xl font-semibold tracking-normal text-slate-950">
                {selected.price}
              </span>
              {selected.cadence ? (
                <span className="pb-1 text-sm font-medium text-slate-500">{selected.cadence}</span>
              ) : null}
            </div>
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

        <Card className="overflow-hidden rounded-[32px] border-slate-200/80 bg-white/88 shadow-[0_24px_90px_rgba(15,23,42,0.08)] backdrop-blur">
          <CardHeader className="border-b p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl">
                  {isProfessional ? copy.formTitle : copy.contactTitle}
                </CardTitle>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {isProfessional ? copy.paymentSubtitle : copy.contactSubtitle}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{copy.name}</span>
                <Input />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{copy.company}</span>
                <Input />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-slate-500">{copy.email}</span>
                <Input type="email" />
              </label>
            </div>

            {isProfessional ? (
              <div className="mt-5 rounded-2xl border bg-slate-50/70 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CreditCard className="size-4 text-emerald-700" />
                  <p className="text-sm font-semibold">{copy.formTitle}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-xs font-medium text-slate-500">{copy.card}</span>
                    <Input placeholder="4242 4242 4242 4242" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">{copy.expiry}</span>
                    <Input placeholder="MM / YY" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-500">{copy.cvc}</span>
                    <Input placeholder="123" />
                  </label>
                </div>
              </div>
            ) : (
              <label className="mt-5 block space-y-1.5">
                <span className="text-xs font-medium text-slate-500">{copy.notes}</span>
                <textarea
                  className="min-h-[128px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring"
                  placeholder={copy.notesPlaceholder}
                />
              </label>
            )}

            <div className="mt-5 rounded-2xl border bg-emerald-50/60 p-4">
              <div className="flex items-center justify-between gap-4 border-b border-emerald-100 pb-3">
                <span className="text-sm font-medium text-slate-600">{copy.dueToday}</span>
                <span className="text-lg font-semibold text-slate-950">{selected.due}</span>
              </div>
              <div className="mt-3 flex gap-3 text-sm leading-6 text-slate-600">
                <Lock className="mt-1 size-4 shrink-0 text-emerald-700" />
                <span>{isProfessional ? copy.protected : selected.next}</span>
              </div>
            </div>

            <Button className="mt-5 h-11 w-full rounded-full bg-slate-950 text-white hover:bg-slate-800">
              {selected.primary}
              <ArrowRight />
            </Button>
            <Button variant="outline" className="mt-3 h-11 w-full rounded-full" onClick={handleGoBack}>
              {copy.secondary}
            </Button>
          </CardContent>
        </Card>
        </div>
      </section>
    </main>
  );
}
