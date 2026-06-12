"use client";

import {
  BarChart3,
  CheckCircle2,
  Database,
  FileText,
  Languages,
  LineChart,
  Send,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCopyLocale,
  getHtmlLang,
  LOCALE_OPTIONS,
  useLocale,
  type CopyLocale,
  type Locale
} from "@/lib/locale";

const consultingCopy: Record<CopyLocale, {
  brand: string;
  langLabel: string;
  nav: { label: string; href: string }[];
  heroTitle: string;
  heroSubtitle: string;
  heroNote: string;
  clarifyTitle: string;
  clarifyItems: string[];
  formTitle: string;
  formText: string;
  name: string;
  email: string;
  emailPlaceholder: string;
  company: string;
  role: string;
  dataSources: string;
  businessProblems: string;
  notes: string;
  optional: string;
  choose: string;
  sourceOptions: string[];
  problemOptions: string[];
  submit: string;
  submitting: string;
  success: string;
  submitAnother: string;
  error: string;
  trustTitle: string;
  trustText: string;
  trustTags: string[];
}> = {
  en: {
    brand: "Monarca AI",
    langLabel: "Switch language",
    nav: [
      { label: "Sources", href: "/#sources" },
      { label: "Reports", href: "/#reports" },
      { label: "Pricing", href: "/#pricing" }
    ],
    heroTitle: "Book a 30-min Business Consultation",
    heroSubtitle:
      "Tell us about your business goals and data setup. We’ll help you identify the right data sources, define key metrics, and design automated business reports for your team.",
    heroNote:
      "Best for teams that want to automate daily, weekly, and monthly business analysis while reducing manual data cleanup and reporting work.",
    clarifyTitle: "What this consultation helps clarify",
    clarifyItems: [
      "Which data sources your business should connect first",
      "Which metrics should become your team's core operating metrics",
      "How daily, weekly, and monthly business reports should be designed",
      "How Monarca AI can help detect anomalies, find causes, and generate recommended actions"
    ],
    formTitle: "Submit request",
    formText: "Leave your contact information and we’ll follow up to discuss your business, data, and reporting needs.",
    name: "Name",
    email: "Email / WeChat",
    emailPlaceholder: "name@example.com or WeChat ID",
    company: "Company / team",
    role: "Role",
    dataSources: "Main data sources",
    businessProblems: "Problems to solve",
    notes: "Additional context",
    optional: "Optional",
    choose: "Select an option",
    sourceOptions: ["Excel / CSV", "Database", "Google Analytics", "Stripe", "Shopify", "Mixpanel", "Other"],
    problemOptions: [
      "Daily / weekly report automation",
      "Revenue decline analysis",
      "Growth funnel analysis",
      "Customer retention analysis",
      "Ad performance analysis",
      "Executive operating reports",
      "Other"
    ],
    submit: "Submit request",
    submitting: "Submitting...",
    success:
      "We’ve received your request and will contact you soon to better understand your business, data, and reporting needs.",
    submitAnother: "Submit another request",
    error: "Failed to submit request. Please try again.",
    trustTitle: "Not a generic AI summary, but business analysis grounded in your data",
    trustText:
      "Monarca AI combines your data sources, metric definitions, and business goals to help teams generate explainable, trackable, and actionable operating reports.",
    trustTags: ["Data integration", "Metric system setup", "Automated business reports"]
  },
  zh: {
    brand: "蝴蝶效应",
    langLabel: "切换语言",
    nav: [
      { label: "数据源", href: "/#sources" },
      { label: "报告", href: "/#reports" },
      { label: "价格", href: "/#pricing" }
    ],
    heroTitle: "预约 30 分钟商业咨询",
    heroSubtitle:
      "告诉我们你的业务目标和数据现状，我们会帮你判断适合接入哪些数据源、如何设计指标体系，以及可以自动生成哪些经营报告。",
    heroNote:
      "适合希望自动化日报、周报、月经营分析，并减少人工整理数据和制作报告的团队。",
    clarifyTitle: "这次咨询可以帮你明确什么？",
    clarifyItems: [
      "你的业务数据目前适合接入哪些数据源",
      "哪些指标应该作为团队的核心经营指标",
      "日报、周报和月经营分析应该如何设计",
      "蝴蝶效应可以如何帮助你发现异常、定位原因并生成行动建议"
    ],
    formTitle: "提交预约申请",
    formText: "留下你的联系方式，我们会尽快与你沟通业务、数据和报告需求。",
    name: "姓名",
    email: "邮箱 / 微信",
    emailPlaceholder: "邮箱或微信号",
    company: "公司 / 团队名称",
    role: "角色",
    dataSources: "团队目前主要数据来源",
    businessProblems: "想解决的问题",
    notes: "补充说明",
    optional: "可选",
    choose: "请选择",
    sourceOptions: ["Excel / CSV", "数据库", "Google Analytics", "Stripe", "Shopify", "Mixpanel", "其他"],
    problemOptions: [
      "日报/周报自动化",
      "收入下降分析",
      "增长漏斗分析",
      "客户留存分析",
      "广告投放分析",
      "管理层经营报告",
      "其他"
    ],
    submit: "提交预约申请",
    submitting: "提交中...",
    success: "我们已收到你的预约申请，会在24小时内与你联系，了解你的业务、数据和报告需求。",
    submitAnother: "继续提交",
    error: "预约申请提交失败，请稍后重试。",
    trustTitle: "不是普通 AI 总结，而是基于业务数据的经营分析",
    trustText:
      "蝴蝶效应会结合你的数据源、指标口径和业务目标，帮助团队自动生成可解释、可追踪、可行动的经营报告。",
    trustTags: ["数据接入", "指标体系配置", "自动化经营报告"]
  }
};

function FieldLabel({ label, optional }: { label: string; optional?: string }) {
  return (
    <span className="flex items-center justify-between gap-3 text-sm font-medium text-slate-800">
      {label}
      {optional ? <span className="text-xs font-normal text-slate-400">{optional}</span> : null}
    </span>
  );
}

export function ConsultingPage() {
  const [locale, setLocale] = useLocale("zh");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const copy = consultingCopy[getCopyLocale(locale)];
  const isZh = getCopyLocale(locale) === "zh";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const dataSource = String(formData.get("dataSource") || "").trim();
    const problem = String(formData.get("problem") || "").trim();

    try {
      const response = await fetch("/api/consulting-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") || ""),
          email: String(formData.get("email") || ""),
          companyName: String(formData.get("companyName") || ""),
          role: String(formData.get("role") || ""),
          dataSources: dataSource ? [dataSource] : [],
          painPoints: problem ? [problem] : [],
          message: String(formData.get("message") || ""),
          source: "consulting_page"
        })
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(typeof data?.message === "string" ? data.message : copy.error);
      }

      setIsSubmitted(true);
      event.currentTarget.reset();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : copy.error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      lang={getHtmlLang(locale)}
      className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f2faf6_48%,#ffffff_100%)] text-slate-950"
    >
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/82 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6 lg:h-14 lg:px-8">
          <Link href="/" className="flex items-center" aria-label={copy.brand}>
            <BrandLogo label={copy.brand} className="h-10 sm:h-11" />
          </Link>
          <div className="hidden items-center gap-6 lg:flex">
            {copy.nav.map((item) => (
              <Link key={item.label} href={item.href} className="text-xs font-medium text-slate-500 transition hover:text-slate-950">
                {item.label}
              </Link>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
            <Languages className="size-4" />
            <span className="sr-only">{copy.langLabel}</span>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
              className="cursor-pointer appearance-none bg-transparent text-sm font-medium outline-none lg:text-xs"
              aria-label={copy.langLabel}
            >
              {LOCALE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-10 pt-10 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_440px] lg:items-start lg:pb-16 lg:pt-16">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            <Sparkles className="size-3.5" />
            {isZh ? "商业咨询" : "Business consultation"}
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-normal text-slate-950 sm:text-5xl">
            {copy.heroTitle}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
            {copy.heroSubtitle}
          </p>
          <p className="mt-4 max-w-2xl rounded-2xl border border-emerald-100 bg-white/72 p-4 text-sm leading-6 text-emerald-950 shadow-sm">
            {copy.heroNote}
          </p>

          <div className="mt-8 rounded-[28px] border border-slate-200/80 bg-white/82 p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)] backdrop-blur sm:p-6">
            <h2 className="text-xl font-semibold tracking-normal text-slate-950">{copy.clarifyTitle}</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {copy.clarifyItems.map((item, index) => {
                const icons = [Database, LineChart, FileText, BarChart3];
                const Icon = icons[index];

                return (
                  <div key={item} className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100">
                      <Icon className="size-3.5" />
                    </span>
                    <p className="text-sm leading-6 text-slate-700">{item}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_22px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6">
          {isSubmitted ? (
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5">
              <div className="grid size-11 place-items-center rounded-full bg-white text-emerald-800">
                <CheckCircle2 className="size-5" />
              </div>
              <p className="mt-4 text-base font-semibold text-slate-950">{copy.formTitle}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy.success}</p>
              <Button className="mt-5 rounded-full bg-slate-950 text-white hover:bg-slate-800" onClick={() => setIsSubmitted(false)}>
                {copy.submitAnother}
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold tracking-normal text-slate-950">{copy.formTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{copy.formText}</p>
              <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <label className="grid gap-2">
                    <FieldLabel label={copy.name} />
                    <Input name="name" required placeholder={isZh ? "你的姓名" : "Your name"} />
                  </label>
                  <label className="grid gap-2">
                    <FieldLabel label={copy.email} />
                    <Input name="email" required type="text" placeholder={copy.emailPlaceholder} />
                  </label>
                </div>

                <label className="grid gap-2">
                  <FieldLabel label={copy.company} optional={copy.optional} />
                  <Input name="companyName" placeholder={isZh ? "公司或团队名称" : "Company or team name"} />
                </label>

                <label className="grid gap-2">
                  <FieldLabel label={copy.role} optional={copy.optional} />
                  <Input name="role" placeholder={isZh ? "例如：创始人、运营负责人、增长负责人" : "Founder, operations, growth, etc."} />
                </label>

                <label className="grid gap-2">
                  <FieldLabel label={copy.dataSources} optional={copy.optional} />
                  <select name="dataSource" className="h-10 rounded-md border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">{copy.choose}</option>
                    {copy.sourceOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <FieldLabel label={copy.businessProblems} optional={copy.optional} />
                  <select name="problem" className="h-10 rounded-md border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">{copy.choose}</option>
                    {copy.problemOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <FieldLabel label={copy.notes} optional={copy.optional} />
                  <textarea
                    name="message"
                    className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder={isZh ? "简单描述你的业务、数据来源或当前最想解决的问题" : "Briefly describe your business, data setup, or the main question you want to solve"}
                  />
                </label>

                {submitError ? (
                  <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {submitError}
                  </p>
                ) : null}

                <Button className="mt-1 h-11 w-full rounded-full bg-slate-950 text-sm text-white hover:bg-slate-800" disabled={isSubmitting}>
                  <Send className="size-4" />
                  {isSubmitting ? copy.submitting : copy.submit}
                </Button>
              </form>
            </>
          )}
        </aside>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-14 sm:px-8">
        <div className="rounded-[28px] border border-emerald-100 bg-white/82 p-5 text-center shadow-[0_18px_70px_rgba(15,23,42,0.05)] backdrop-blur sm:p-6">
          <h2 className="text-xl font-semibold tracking-normal text-slate-950">{copy.trustTitle}</h2>
          <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-500">{copy.trustText}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {copy.trustTags.map((tag) => (
              <span key={tag} className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
