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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocale, type Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

export type PaymentPlan = "database-setup" | "professional" | "enterprise";

const planIcons = {
  "database-setup": Database,
  professional: BrainCircuit,
  enterprise: ShieldCheck
} as const;

const paymentCopy = {
  en: {
    brand: "openAnalyst",
    back: "Back to pricing",
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
    secondary: "Return home",
    plans: {
      "database-setup": {
        badge: "Consulting",
        name: "Database Setup",
        subtitle: "Build the data foundation",
        price: "¥2,000+",
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
        price: "¥2,000",
        cadence: "/ month",
        description:
          "For teams ready to automate growth reporting and use AI to explain metric movement",
        due: "¥2,000",
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
    back: "返回价格",
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
    secondary: "返回首页",
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
  const [locale] = useLocale("en");
  const copy = paymentCopy[locale as Locale];
  const selected = copy.plans[plan];
  const Icon = planIcons[plan];
  const isProfessional = plan === "professional";

  return (
    <main
      lang={locale === "zh" ? "zh-CN" : "en"}
      className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#eef8f2_48%,#ffffff_100%)] text-slate-950"
    >
      <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-xl bg-slate-950 text-white">
              <Sparkles className="size-4" />
            </div>
            <span className="text-sm font-semibold">{copy.brand}</span>
          </Link>
          <Button asChild variant="ghost" className="rounded-full text-slate-600">
            <Link href="/#pricing">
              <ArrowLeft />
              {copy.back}
            </Link>
          </Button>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-10 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:py-14">
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
            <Button asChild variant="outline" className="mt-3 h-11 w-full rounded-full">
              <Link href="/">{copy.secondary}</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
