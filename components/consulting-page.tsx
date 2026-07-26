"use client";

import {
  CalendarDays,
  CheckCircle2,
  Languages,
  Send,
  Sparkles
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
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
  meetingTime: string;
  meetingTimePlaceholder: string;
  meetingTimeOption: string;
  businessProblems: string;
  notes: string;
  optional: string;
  choose: string;
  problemOptions: string[];
  submit: string;
  submitting: string;
  success: string;
  submitAnother: string;
  error: string;
  trustTitle: string;
  trustText: string;
  trustTags: string[];
  demo: {
    heroTitle: string;
    heroNote: string;
    formTitle: string;
    formText: string;
    submit: string;
    success: string;
  };
}> = {
  en: {
    brand: "Monarca AI",
    langLabel: "Switch language",
    nav: [
      { label: "Sources", href: "/#sources" },
      { label: "Reports", href: "/#reports" },
      { label: "Pricing", href: "/#pricing" }
    ],
    heroTitle: "Book a business consultation",
    heroSubtitle: "",
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
    formText: "Leave your contact information and we’ll follow up to discuss your business, data, and business need.",
    name: "Name",
    email: "Email / WeChat",
    emailPlaceholder: "name@example.com or WeChat ID",
    company: "Company / team",
    meetingTime: "Preferred meeting times",
    meetingTimePlaceholder: "Choose date and time",
    meetingTimeOption: "Option",
    businessProblems: "Problems to solve",
    notes: "Additional context",
    optional: "Optional",
    choose: "Select an option",
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
    trustTags: ["Data integration", "Metric system setup", "Automated business reports"],
    demo: {
      heroTitle: "Request the Monarca demo",
      heroNote: "",
      formTitle: "Send me the demo",
      formText: "",
      submit: "Send demo request",
      success: "We’ve received your request and will send the demo to your WeChat or email soon."
    }
  },
  zh: {
    brand: "Monarca AI",
    langLabel: "切换语言",
    nav: [
      { label: "数据源", href: "/#sources" },
      { label: "报告", href: "/#reports" },
      { label: "价格", href: "/#pricing" }
    ],
    heroTitle: "预约商业咨询",
    heroSubtitle: "",
    heroNote:
      "适合希望自动化日报、周报、月经营分析，并减少人工整理数据和制作报告的团队。",
    clarifyTitle: "这次咨询可以帮你明确什么？",
    clarifyItems: [
      "你的业务数据目前适合接入哪些数据源",
      "哪些指标应该作为团队的核心经营指标",
      "日报、周报和月经营分析应该如何设计",
      "Monarca AI 可以如何帮助你发现异常、定位原因并生成行动建议"
    ],
    formTitle: "提交预约申请",
    formText: "留下你的联系方式，我们会尽快与你沟通业务、数据和报告需求。",
    name: "姓名",
    email: "邮箱 / 微信",
    emailPlaceholder: "邮箱或微信号",
    company: "公司 / 团队名称",
    meetingTime: "预约会议时间",
    meetingTimePlaceholder: "选择日期和时间",
    meetingTimeOption: "备选",
    businessProblems: "想解决的问题",
    notes: "补充说明",
    optional: "可选",
    choose: "请选择",
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
      "Monarca AI 会结合你的数据源、指标口径和业务目标，帮助团队自动生成可解释、可追踪、可行动的经营报告。",
    trustTags: ["数据接入", "指标体系配置", "自动化经营报告"],
    demo: {
      heroTitle: "获取 Monarca Demo",
      heroNote: "留下微信或邮箱，我们会把 Demo 发送给你，并根据你的业务情况继续沟通。",
      formTitle: "发送 Demo",
      formText: "留下你的联系方式，我们会与你沟通业务、数据和业务需求。",
      submit: "提交 Demo 申请",
      success: "我们已收到你的申请，会尽快通过微信或邮箱发送 Demo。"
    }
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
  const searchParams = useSearchParams();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const meetingTimeInputs = useRef<Array<HTMLInputElement | null>>([]);
  const copy = consultingCopy[getCopyLocale(locale)];
  const isZh = getCopyLocale(locale) === "zh";
  const isDemoRequest = searchParams?.get("intent") === "demo";
  const pageCopy = isDemoRequest ? { ...copy, ...copy.demo } : copy;

  function openMeetingTimePicker(index: number) {
    const input = meetingTimeInputs.current[index - 1];
    if (!input) return;

    input.focus();

    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") {
      pickerInput.showPicker();
      return;
    }

    pickerInput.click();
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const problem = String(formData.get("problem") || "").trim();
    const meetingTimes = [1, 2, 3]
      .map((index) => String(formData.get(`meetingTime${index}`) || "").trim())
      .filter(Boolean);

    try {
      const response = await fetch("/api/consulting-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name") || ""),
          email: String(formData.get("email") || ""),
          companyName: String(formData.get("companyName") || ""),
          painPoints: problem ? [problem] : [],
          preferredMeetingTimes: meetingTimes,
          message: String(formData.get("message") || ""),
          source: isDemoRequest ? "demo_request" : "consulting_page"
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

      <section className="mx-auto grid min-h-[calc(100vh-56px)] max-w-7xl gap-10 px-5 py-12 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,0.9fr)_460px] lg:items-center lg:gap-14 lg:py-12">
        <div className="mx-auto min-w-0 max-w-3xl lg:mx-0 lg:pl-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            <Sparkles className="size-3.5" />
            {isDemoRequest ? (isZh ? "Demo 申请" : "Demo request") : (isZh ? "商业咨询" : "Business consultation")}
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-normal text-slate-950 sm:text-5xl lg:text-[3.5rem]">
            {pageCopy.heroTitle}
          </h1>
          {pageCopy.heroSubtitle ? (
            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-600 sm:text-lg">
              {pageCopy.heroSubtitle}
            </p>
          ) : null}
          {pageCopy.heroNote ? (
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600">
              {pageCopy.heroNote}
            </p>
          ) : null}
        </div>

        <aside className="mx-auto w-full max-w-[460px] rounded-[28px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_22px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6 lg:mx-0">
          {isSubmitted ? (
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5">
              <div className="grid size-11 place-items-center rounded-full bg-white text-emerald-800">
                <CheckCircle2 className="size-5" />
              </div>
              <p className="mt-4 text-base font-semibold text-slate-950">{pageCopy.formTitle}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{pageCopy.success}</p>
              <Button className="mt-5 rounded-full bg-slate-950 text-white hover:bg-slate-800" onClick={() => setIsSubmitted(false)}>
                {copy.submitAnother}
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold tracking-normal text-slate-950">{pageCopy.formTitle}</h2>
              {pageCopy.formText ? (
                <p className="mt-2 text-sm leading-6 text-slate-500">{pageCopy.formText}</p>
              ) : null}
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

                {!isDemoRequest ? (
                  <label className="grid gap-2">
                    <FieldLabel label={copy.meetingTime} optional={copy.optional} />
                    <div className="grid gap-2">
                      {[1, 2, 3].map((index) => (
                        <div
                          key={index}
                          className="group relative cursor-pointer overflow-hidden rounded-xl border border-emerald-100/80 bg-[linear-gradient(135deg,#ffffff_0%,#f7fffb_62%,#f1fdf7_100%)] shadow-[0_7px_18px_rgba(15,23,42,0.045)] transition focus-within:border-emerald-300 focus-within:shadow-[0_10px_24px_rgba(16,185,129,0.13)]"
                          onClick={() => openMeetingTimePicker(index)}
                        >
                          <span className="pointer-events-none absolute left-2.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-xl bg-emerald-600 text-white shadow-[0_7px_18px_rgba(16,185,129,0.24)] ring-3 ring-emerald-50 transition group-focus-within:bg-emerald-500">
                            <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-white text-[9px] font-semibold text-emerald-700 shadow-sm">
                              {index}
                            </span>
                            <CalendarDays className="size-4" />
                          </span>
                          <Input
                            ref={(node) => {
                              meetingTimeInputs.current[index - 1] = node;
                            }}
                            name={`meetingTime${index}`}
                            type="datetime-local"
                            aria-label={`${copy.meetingTimePlaceholder} ${index}`}
                            className="h-11 border-0 bg-transparent pl-16 pr-24 text-sm font-semibold text-slate-950 shadow-none outline-none ring-0 placeholder:text-slate-400 focus-visible:ring-0"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-full border border-white/80 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 shadow-sm sm:inline">
                            {copy.meetingTimeOption} {index}
                          </span>
                        </div>
                      ))}
                    </div>
                  </label>
                ) : null}

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
                  {isSubmitting ? copy.submitting : pageCopy.submit}
                </Button>
              </form>
            </>
          )}
        </aside>
      </section>
    </main>
  );
}
