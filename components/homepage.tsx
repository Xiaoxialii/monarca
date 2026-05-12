"use client";

import {
  Activity,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  CircleDollarSign,
  Database,
  FileText,
  GitBranch,
  Languages,
  LineChart,
  MoveRight,
  Play,
  Search,
  Sparkles,
  Target,
  Zap
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLocale, type Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const integrations = [
  "Google Analytics",
  "Mixpanel",
  "Snowflake",
  "BigQuery",
  "PostgreSQL",
  "Stripe"
];

const featureMeta = [
  { icon: Activity, className: "bg-emerald-100/80" },
  { icon: GitBranch, className: "bg-lime-100/75" },
  { icon: BrainCircuit, className: "bg-teal-100/80" },
  { icon: Target, className: "bg-emerald-100/70" }
];

const homepageCopy = {
  en: {
    lang: "中文",
    langLabel: "Switch to Chinese",
    logo: "openAnalyst",
    nav: [
      { label: "Sources", href: "#sources" },
      { label: "Investigations", href: "#investigations" },
      { label: "Alerts", href: "#alerts" },
      { label: "Reports", href: "#reports" }
    ],
    auth: {
      login: "Log in",
      getStarted: "Get started"
    },
    hero: {
      eyebrow: "AI operating system for revenue teams",
      headline: "Your AI Growth Analyst",
      subheadline:
        "openAnalyst monitors growth metrics, explains what changed, and turns every anomaly into a clear next action.",
      primaryCta: "Connect your data",
      secondaryCta: "Explore demo workspace",
      trust: ["No credit card required", "5 min setup", "Cancel anytime"]
    },
    visual: {
      status: "Investigating",
      monitor: "Revenue monitor",
      drop: "Revenue dropped 12.4%",
      trend: "ARR trend",
      range: "Last 30 days",
      preview: "AI investigation preview",
      rootCauses: "3 root causes found",
      confidence: "91% confidence",
      actionTitle: "Recommended action",
      recommendation: "Pause two low-quality search segments and route 18 expansion-ready accounts to success.",
      owner: "Owner",
      ownerValue: "Growth + CS",
      impact: "Expected lift",
      impactValue: "$42K ARR",
      causes: [
        ["Paid search CAC", "+18%", "rose across non-brand campaigns"],
        ["Expansion pipeline", "-9%", "slowed in enterprise accounts"],
        ["Checkout errors", "+31%", "spiked after billing release"]
      ]
    },
    features: {
      eyebrow: "Revenue intelligence",
      title: "What openAnalyst helps you do",
      intro:
        "A focused operating layer for teams that want signal, explanation, and action in one place.",
      cards: [
        {
          title: "Detect anomalies",
          text: "Monitor revenue, activation, funnel, and retention shifts as they happen."
        },
        {
          title: "Find root causes",
          text: "Trace changes back to channels, cohorts, accounts, product events, and billing states."
        },
        {
          title: "Get recommendations",
          text: "Prioritize actions with owner context, expected impact, and confidence."
        },
        {
          title: "Track impact",
          text: "Close the loop by measuring whether every action moved the right metric."
        }
      ]
    },
    system: {
      eyebrow: "Why teams need it",
      title: "Growth teams have dashboards. They need judgment.",
      points: [
        {
          title: "Metrics move constantly",
          text: "openAnalyst watches the operating model even when nobody is looking."
        },
        {
          title: "Root cause takes too long",
          text: "It compares every connected source and narrows the investigation path."
        },
        {
          title: "Insights need owners",
          text: "Every finding becomes an action with a team, expected lift, and follow-up."
        }
      ]
    },
    investigation: {
      eyebrow: "Active investigation",
      title: "Revenue dropped 12.4%",
      timeline: [
        ["08:42", "openAnalyst detected a revenue anomaly across self-serve plans."],
        ["08:43", "Compared cohorts, campaigns, billing events, and product activation."],
        ["08:45", "Drafted recommendations for growth, finance, and product owners."]
      ],
      watchDemo: "Watch demo",
      steps: [
        {
          title: "AI analyzed 15+ metrics",
          text: "Revenue, activation, traffic quality, billing errors, and expansion pipeline were reviewed."
        },
        {
          title: "Identified root causes",
          text: "The drop was traced to CAC inflation, checkout friction, and late-stage pipeline compression."
        },
        {
          title: "Recommended actions",
          text: "openAnalyst proposed three actions with owners, expected lift, and confidence scores."
        }
      ]
    },
    reports: {
      eyebrow: "Reports",
      title: "A weekly growth brief that writes itself.",
      intro: "Summaries, owner updates, and impact tracking are generated from the same investigations your team already uses.",
      signal: "Weekly signal",
      status: "Auto-drafted",
      cards: [
        ["Growth brief", "What changed this week, why it happened, and where to focus next."],
        ["Impact ledger", "Track actions, owners, confidence, and ARR movement in one view."],
        ["Board-ready notes", "Turn raw metrics into crisp explanations for leadership reviews."]
      ]
    },
    integrations: {
      eyebrow: "Supported integrations",
      title: "Connect the systems your revenue team already trusts."
    }
  },
  zh: {
    lang: "EN",
    langLabel: "切换到英文",
    logo: "蝴蝶效应",
    nav: [
      { label: "数据源", href: "#sources" },
      { label: "智能调查", href: "#investigations" },
      { label: "异常提醒", href: "#alerts" },
      { label: "报告", href: "#reports" }
    ],
    auth: {
      login: "登录",
      getStarted: "开始使用"
    },
    hero: {
      eyebrow: "为团队打造的 AI 自动化数据系统",
      headline: "你的 AI 增长分析师",
      subheadline:
        "蝴蝶效应持续监控增长指标，解释发生了什么，并把每个异常转化为清晰的下一步行动。",
      primaryCta: "连接数据源",
      secondaryCta: "查看演示工作区",
      trust: ["语义层管理（映射业务）", "数据质量", "随时取消"]
    },
    visual: {
      status: "正在调查",
      monitor: "收入监控",
      drop: "收入下降 12.4%",
      trend: "ARR 趋势",
      range: "过去 30 天",
      preview: "AI 调查预览",
      rootCauses: "发现 3 个根因",
      confidence: "91% 置信度",
      actionTitle: "推荐行动",
      recommendation: "暂停两个低质量搜索分组，并将 18 个具备扩张信号的账户交给客户成功团队。",
      owner: "负责人",
      ownerValue: "增长 + CS",
      impact: "预期提升",
      impactValue: "$42K ARR",
      causes: [
        ["付费搜索 CAC", "+18%", "非品牌广告系列成本上升"],
        ["扩张管道", "-9%", "企业客户推进速度放缓"],
        ["结账错误", "+31%", "计费版本发布后错误激增"]
      ]
    },
    features: {
      eyebrow: "收入智能",
      title: "蝴蝶效应能帮你做什么",
      intro: "给团队一个专注的智能操作层：把信号、解释和行动放在同一个工作流里。",
      cards: [
        {
          title: "检测异常",
          text: "持续监控收入、激活、漏斗和留存变化。"
        },
        {
          title: "定位根因",
          text: "把指标变化追溯到渠道、客群、账户、产品事件和计费状态。"
        },
        {
          title: "获得建议",
          text: "输出优先级、负责人、预期影响和置信度。"
        },
        {
          title: "追踪影响",
          text: "持续衡量每个行动是否真的推动了目标指标。"
        }
      ]
    },
    system: {
      eyebrow: "为什么需要它",
      title: "增长不缺数据，缺的是能转化为价值的洞察。",
      points: [
        {
          title: "指标一直在变化",
          text: "蝴蝶效应会持续监控增长模型，不依赖人工盯盘。"
        },
        {
          title: "定位原因太慢",
          text: "系统会跨数据源对比，并缩短调查路径。"
        },
        {
          title: "洞察落地为价值",
          text: "每个发现都会转化为可执行行动，并持续追踪影响。"
        }
      ]
    },
    investigation: {
      eyebrow: "进行中的智能调查",
      title: "收入下降 12.4%",
      timeline: [
        ["08:42", "蝴蝶效应在自助订阅计划中检测到收入异常。"],
        ["08:43", "对比了客群、投放、计费事件和产品激活数据。"],
        ["08:45", "为增长、财务和产品团队生成了行动建议。"]
      ],
      watchDemo: "观看演示",
      steps: [
        {
          title: "AI 分析了 15+ 项指标",
          text: "系统检查了收入、激活率、流量质量、计费错误和扩张管道。"
        },
        {
          title: "识别关键根因",
          text: "收入下滑主要来自 CAC 上升、结账摩擦和后期管道收缩。"
        },
        {
          title: "推荐可执行行动",
          text: "蝴蝶效应输出了 3 个行动建议，并附带预期提升和置信度。"
        }
      ]
    },
    reports: {
      eyebrow: "报告",
      title: "自动生成每周增长简报。",
      intro: "自动同步并清洗数据，生成摘要和影响追踪，不再手动更新数据或拼报表。",
      signal: "每周信号",
      status: "自动生成",
      cards: [
        ["数据自动化", "无需手动更新数据，系统自动同步、清洗并整理关键指标。"],
        ["增长简报", "自动汇总本周发生了什么、为什么发生、下一步该关注哪里。"],
        ["管理层摘要", "把可信数据转化为适合复盘和汇报的清晰解释。"]
      ]
    },
    integrations: {
      eyebrow: "支持的数据集成",
      title: "连接增长团队已经在使用的系统。"
    }
  }
} as const;

type HomeCopy = (typeof homepageCopy)[Locale];

function Logo({ label }: { label: string }) {
  return (
    <Link href="/" className="flex items-center gap-2">
      <div className="grid size-8 place-items-center rounded-xl bg-slate-950 text-white shadow-sm">
        <Sparkles className="size-4" />
      </div>
      <span className="text-sm font-semibold tracking-normal text-slate-950">{label}</span>
    </Link>
  );
}

function TrustItem({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
      <Check className="size-4 text-emerald-700" />
      {children}
    </span>
  );
}

function HeroVisualization({ copy }: { copy: HomeCopy["visual"] }) {
  return (
    <div className="relative mx-auto h-[510px] w-full max-w-[580px] lg:mx-0">
      <div className="absolute inset-0 rounded-[44px] bg-gradient-to-br from-[#9dd8b8]/70 via-[#d6eadf]/75 to-[#aacfc1]/70 blur-3xl" />
      <div className="butterfly-float absolute right-0 top-2 z-20 grid size-16 place-items-center rounded-[24px] border border-white/70 bg-white/82 text-emerald-800 shadow-[0_20px_60px_rgba(6,78,59,0.2)] backdrop-blur">
        <BrainCircuit className="size-6" />
      </div>

      <div className="absolute left-0 right-4 top-10 h-[340px] rounded-[34px] border border-white/70 bg-[#dceee4]/70 p-5 shadow-[0_28px_90px_rgba(6,78,59,0.17)] backdrop-blur-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-400">{copy.monitor}</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">{copy.drop}</h3>
          </div>
          <div className="mt-4 rounded-full border border-rose-200 bg-rose-50/90 px-4 py-2 text-base font-semibold text-rose-600">
            -12.4%
          </div>
        </div>

        <div className="mt-6 h-[168px] overflow-hidden rounded-[28px] border border-[#b8d9c8]/80 bg-[#eef8f2]/90 p-5 shadow-[0_18px_60px_rgba(6,78,59,0.09)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-[#c8ead8] text-emerald-900">
                <LineChart className="size-5" />
              </div>
              <span className="text-base font-semibold text-slate-700">{copy.trend}</span>
            </div>
            <span className="text-sm font-medium text-slate-400">{copy.range}</span>
          </div>
          <svg viewBox="0 0 440 118" className="mt-2 h-24 w-full overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id="heroLine" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="52%" stopColor="#059669" />
                <stop offset="100%" stopColor="#0f766e" />
              </linearGradient>
              <linearGradient id="heroFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M12 92 C62 80 74 54 126 62 C177 70 184 28 236 36 C294 46 296 68 344 66 C387 64 404 48 428 28 L428 110 L12 110 Z"
              fill="url(#heroFill)"
            />
            <path
              className="butterfly-chart-line"
              d="M12 92 C62 80 74 54 126 62 C177 70 184 28 236 36 C294 46 296 68 344 66 C387 64 404 48 428 28"
              fill="none"
              stroke="url(#heroLine)"
              strokeLinecap="round"
              strokeWidth="4"
            />
            <circle cx="428" cy="28" r="6" fill="#047857" />
            <circle cx="428" cy="28" r="12" fill="#047857" opacity="0.14" />
          </svg>
        </div>
      </div>

      <div className="absolute left-5 right-0 top-[228px] z-10 rounded-[30px] border border-white/80 bg-[#e9f6ef]/94 p-4 shadow-[0_24px_70px_rgba(6,78,59,0.2)] backdrop-blur-xl sm:left-8 sm:p-5">
        <div className="mb-4 flex items-center gap-4">
          <div className="grid size-11 place-items-center rounded-2xl bg-slate-950 text-white">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-950 sm:text-lg">{copy.preview}</p>
            <p className="mt-1 text-sm text-slate-500">{copy.rootCauses}</p>
          </div>
        </div>
        <div className="space-y-2">
          {copy.causes.map(([label, value, text]) => (
            <div key={label} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/85 px-4 py-2.5">
              <div>
                <p className="text-sm font-semibold text-slate-800 sm:text-base">{label}</p>
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{text}</p>
              </div>
              <span className="shrink-0 text-base font-semibold text-emerald-700 sm:text-lg">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OperatingLayer({ copy }: { copy: HomeCopy["system"] }) {
  const icons = [Activity, GitBranch, Target];

  return (
    <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <div className="rounded-[32px] border border-slate-200/80 bg-white/76 p-6 shadow-[0_18px_70px_rgba(15,23,42,0.05)] backdrop-blur sm:p-8">
        <div className="mb-6 max-w-2xl">
          <p className="text-sm font-medium text-emerald-700">{copy.eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
            {copy.title}
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {copy.points.map((point, index) => {
            const Icon = icons[index];
            return (
              <div key={point.title} className="rounded-3xl border border-slate-200/80 bg-slate-50/80 p-5">
                <div className="mb-5 grid size-9 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                  <Icon className="size-4" />
                </div>
                <h3 className="text-base font-semibold text-slate-950">{point.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{point.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FeatureCards({ copy }: { copy: HomeCopy["features"] }) {
  return (
    <section id="alerts" className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700">{copy.eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
            {copy.title}
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-slate-500">{copy.intro}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {copy.cards.map((card, index) => {
          const meta = featureMeta[index];
          return (
            <div
              key={card.title}
              className={cn("rounded-3xl border border-white/70 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.06)]", meta.className)}
            >
              <div className="mb-8 grid size-10 place-items-center rounded-2xl bg-white/80 text-slate-950 shadow-sm">
                <meta.icon className="size-5" />
              </div>
              <h3 className="text-lg font-semibold text-slate-950">{card.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{card.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InvestigationPreview({ copy }: { copy: HomeCopy["investigation"] }) {
  return (
    <section id="investigations" className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
      <div className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.08)]">
        <div className="grid gap-0 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="border-b border-slate-200/80 p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <div className="mb-10 flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-2xl bg-rose-50 text-rose-600">
                <CircleDollarSign className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">{copy.eyebrow}</p>
                <h2 className="text-2xl font-semibold text-slate-950">{copy.title}</h2>
              </div>
            </div>

            <div className="space-y-4">
              {copy.timeline.map(([time, text]) => (
                <div key={time} className="grid grid-cols-[64px_1fr] gap-4">
                  <span className="text-sm font-medium text-slate-400">{time}</span>
                  <p className="border-l border-slate-200 pl-4 text-sm leading-6 text-slate-600">{text}</p>
                </div>
              ))}
            </div>

            <Button asChild className="mt-8 rounded-full bg-slate-950 px-5">
              <Link href="/dashboard">
                <Play className="fill-current" />
                {copy.watchDemo}
              </Link>
            </Button>
          </div>

          <div className="bg-gradient-to-br from-slate-50 via-white to-emerald-100/65 p-6 sm:p-8">
            <div className="grid gap-4">
              {copy.steps.map((step, index) => (
                <div key={step.title} className="flex items-center gap-4">
                  <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-emerald-200 bg-white text-sm font-semibold text-emerald-700 shadow-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 rounded-3xl border border-white/80 bg-white/82 p-5 shadow-[0_16px_50px_rgba(4,120,87,0.1)] backdrop-blur">
                    <p className="text-sm font-semibold text-slate-950">{step.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{step.text}</p>
                  </div>
                  {index < copy.steps.length - 1 && (
                    <MoveRight className="hidden size-5 shrink-0 text-emerald-500 lg:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReportsSection({ copy }: { copy: HomeCopy["reports"] }) {
  const icons = [FileText, BarChart3, BrainCircuit];

  return (
    <section id="reports" className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-stretch">
        <div className="rounded-[32px] border border-slate-200/80 bg-slate-950 p-6 text-white shadow-[0_30px_100px_rgba(15,23,42,0.12)] sm:p-8">
          <p className="text-sm font-medium text-emerald-300">{copy.eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">{copy.title}</h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">{copy.intro}</p>
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/8 p-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-sm font-medium text-slate-200">{copy.signal}</span>
              <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-200">{copy.status}</span>
            </div>
            <div className="mt-4 space-y-3">
              <div className="h-2 w-11/12 rounded-full bg-white/20" />
              <div className="h-2 w-8/12 rounded-full bg-white/16" />
              <div className="h-2 w-10/12 rounded-full bg-white/12" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {copy.cards.map(([title, text], index) => {
            const Icon = icons[index];
            return (
              <div key={title} className="rounded-[28px] border border-slate-200/80 bg-white/82 p-5 shadow-[0_18px_70px_rgba(15,23,42,0.06)] backdrop-blur">
                <div className="mb-8 grid size-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Integrations({ copy }: { copy: HomeCopy["integrations"] }) {
  return (
    <section id="sources" className="mx-auto max-w-7xl px-5 pb-20 pt-12 sm:px-8">
      <div className="rounded-[32px] border border-slate-200/80 bg-white/80 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.06)] backdrop-blur sm:p-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">{copy.eyebrow}</p>
            <h2 className="text-2xl font-semibold text-slate-950">{copy.title}</h2>
          </div>
          <Database className="hidden size-6 text-emerald-700 sm:block" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {integrations.map((integration) => (
            <div key={integration} className="flex h-16 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 text-sm font-semibold text-slate-600">
              {integration}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Homepage() {
  const [locale, setLocale] = useLocale("en");
  const copy = homepageCopy[locale];

  function toggleLocale() {
    setLocale(locale === "en" ? "zh" : "en");
  }

  return (
    <main
      lang={locale === "zh" ? "zh-CN" : "en"}
      className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f1faf5_46%,#ffffff_100%)] text-slate-950"
    >
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/78 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Logo label={copy.logo} />
          <div className="hidden items-center gap-7 md:flex">
            {copy.nav.map((item) => (
              <a key={item.label} href={item.href} className="text-sm font-medium text-slate-500 transition hover:text-slate-950">
                {item.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              className="rounded-full px-3 text-slate-600"
              aria-label={copy.langLabel}
              onClick={toggleLocale}
            >
              <Languages />
              {copy.lang}
            </Button>
            <Button asChild variant="ghost" className="hidden rounded-full text-slate-600 sm:inline-flex">
              <Link href="/sign-in">{copy.auth.login}</Link>
            </Button>
            <Button asChild className="rounded-full bg-slate-950 px-4 text-white hover:bg-slate-800">
              <Link href="/sign-up">{copy.auth.getStarted}</Link>
            </Button>
          </div>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-8 pt-16 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:pb-10 lg:pt-20">
        <div className="absolute left-0 right-0 top-0 -z-0 h-px bg-gradient-to-r from-transparent via-emerald-900/40 to-transparent" />
        <div className="relative z-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#9fcdb5]/80 bg-[#d8efe3]/80 px-3 py-1.5 text-sm font-medium text-emerald-950">
            <Zap className="size-4" />
            {copy.hero.eyebrow}
          </div>
          <h1 className="max-w-3xl whitespace-nowrap text-[2.65rem] font-semibold leading-tight tracking-normal text-slate-950 sm:text-6xl lg:text-7xl">
            {copy.hero.headline}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            {copy.hero.subheadline}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-11 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800">
              <Link href="/sign-up">
                {copy.hero.primaryCta}
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-full border-slate-200 bg-white/70 px-5">
              <Link href="/dashboard">
                <Search />
                {copy.hero.secondaryCta}
              </Link>
            </Button>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            {copy.hero.trust.map((item) => (
              <TrustItem key={item}>{item}</TrustItem>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <HeroVisualization copy={copy.visual} />
        </div>

      </section>

      <OperatingLayer copy={copy.system} />
      <FeatureCards copy={copy.features} />
      <InvestigationPreview copy={copy.investigation} />
      <ReportsSection copy={copy.reports} />
      <Integrations copy={copy.integrations} />
    </main>
  );
}
