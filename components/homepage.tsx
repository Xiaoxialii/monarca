"use client";

import { Show, useUser } from "@clerk/nextjs";
import {
  Activity,
  AlertTriangle,
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
  ListChecks,
  Menu,
  MoveRight,
  Rocket,
  Search,
  ShoppingBag,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
  X,
  Zap
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import {
  getCopyLocale,
  getHtmlLang,
  LOCALE_OPTIONS,
  useLocale,
  type CopyLocale,
  type Locale
} from "@/lib/locale";
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
  { icon: Database, className: "bg-emerald-100/80" },
  { icon: AlertTriangle, className: "bg-lime-100/75" },
  { icon: ListChecks, className: "bg-teal-100/80" },
  { icon: TrendingUp, className: "bg-emerald-100/70" }
];

const teamRoleIcons = [Database, GitBranch, BarChart3, Search, Target];
const pricingIcons = [Sparkles, BrainCircuit, Database];
const useCaseIcons = [ShoppingBag, Rocket, UsersRound];

const homepageCopy = {
  en: {
    lang: "中文",
    langLabel: "Switch to Chinese",
    logo: "Monarca AI",
    nav: [
      { label: "Sources", href: "#sources" },
      { label: "Investigations", href: "#investigations" },
      { label: "Alerts", href: "#alerts" },
      { label: "Reports", href: "#reports" },
      { label: "Pricing", href: "#pricing" },
      { label: "Consulting", href: "/consulting" }
    ],
    auth: {
      login: "Log in",
      getStarted: "Get started"
    },
    hero: {
      eyebrow: "AI operating system for revenue teams",
      headline: "Your AI Data Analyst Team",
      subheadline:
        "Connect your database, spreadsheets, and business tools. Automatically generate revenue, sales, customer, and operations reports with insights and next-step recommendations.",
      teamLabel: "One AI team covering the full analytics workflow",
      team: [
        { role: "Data Engineer", text: "Connects sources and keeps pipelines clean" },
        { role: "Analytics Engineer", text: "Builds semantic layers and metric logic" },
        { role: "BI Engineer", text: "Creates reports, dashboards, and trusted views" },
        { role: "Business Intelligence", text: "Explains movement, cohorts, and root causes" },
        { role: "Growth Operations", text: "Turns insights into focused growth actions" }
      ],
      primaryCta: "Book a 30-min Business Consultation",
      secondaryCta: "View Demo",
      trust: ["No credit card required", "5 min setup", "Cancel anytime"]
    },
    visual: {
      status: "Investigating",
      monitor: "Business monitor",
      drop: "Revenue dropped 12.4% this week",
      trend: "Business trend",
      range: "Last 30 days",
      preview: "AI investigation preview",
      rootCauses: "3 root causes found",
      confidence: "91% confidence",
      actionTitle: "Recommended action",
      recommendation: "Review ad spend, replenish top-selling items, and follow up with customers at risk of churn",
      owner: "Owner",
      ownerValue: "Growth + CS",
      impact: "Next step",
      impactValue: "Action plan",
      causes: [
        ["Ad acquisition cost", "+18%", "marketing spend is less efficient this week"],
        ["Top-selling item inventory", "Low", "stock is not enough to support demand"],
        ["Repeat purchase rate", "-9%", "fewer customers are buying again"],
        ["Refund rate", "+31%", "refunds increased and need follow-up"]
      ]
    },
    features: {
      eyebrow: "Revenue intelligence",
      title: "What Monarca AI helps you do",
      cards: [
        {
          title: "Detect anomalies",
          text: "Monitor revenue, activation, funnel, and retention shifts as they happen"
        },
        {
          title: "Find root causes",
          text: "Trace changes back to channels, cohorts, accounts, product events, and billing states"
        },
        {
          title: "Get recommendations",
          text: "Prioritize actions with owner context, expected impact, and confidence"
        },
        {
          title: "Track impact",
          text: "Close the loop by measuring whether every action moved the right metric"
        }
      ]
    },
    useCases: {
      title: "How different teams use Monarca AI",
      subtitle:
        "From scattered data to actionable operating judgment, adapted to the everyday analysis workflows of different business teams.",
      consultTitle: "Want to see what reports your data can generate?",
      consultText:
        "Book a business consultation and we will design daily, weekly, and monthly operating reports around your goals, data sources, and business questions.",
      consultCta: "Book a 30-min Business Consultation",
      cards: [
        {
          title: "Ecommerce operations team",
          scene: "Orders, ads, refunds, and inventory data are scattered, making sales changes hard to explain quickly.",
          pain: "Sales drops require manual comparison across Excel, orders, and ad data.",
          finding: "Revenue decline mainly comes from rising CAC, lower repeat purchase, and low top-selling SKU inventory.",
          action: "Pause low ROI channels, restock top-selling SKU, and reactivate existing customers.",
          result: "Automatically finds why revenue declined"
        },
        {
          title: "SaaS growth team",
          scene: "Signups are healthy, but activation and paid conversion are falling, making drop-off hard to locate.",
          pain: "Product behavior, subscription, and channel data are scattered across the funnel.",
          finding: "onboarding step 2 has the highest drop-off, dragging down activation and paid conversion.",
          action: "Improve first-time experience, then track activation, retention, and paid conversion.",
          result: "Identifies conversion drop-off points"
        },
        {
          title: "Executive weekly report",
          scene: "Weekly PPT reporting is manual, metric definitions vary, and leadership cannot quickly see priorities.",
          pain: "Revenue, cost, customer, and channel data are scattered and slow to explain.",
          finding: "Automatically identifies revenue, cost, customer, and channel anomalies with priority and impact scope.",
          action: "Generate daily reports, weekly reports, and monthly operating analysis for faster reviews.",
          result: "Generates executive operating summaries"
        }
      ]
    },
    system: {
      eyebrow: "Why teams need it",
      title: "Growth teams have dashboards, They need judgment",
      points: [
        {
          title: "Metrics move constantly",
          text: "Monarca AI watches the operating model even when nobody is looking"
        },
        {
          title: "Root cause takes too long",
          text: "It compares every connected source and narrows the investigation path"
        },
        {
          title: "Insights need owners",
          text: "Every finding becomes an action with a team, expected lift, and follow-up"
        }
      ]
    },
    investigation: {
      sectionTitle: "A complete AI business investigation",
      sectionSubtitle:
        "After revenue, conversion, or cost anomalies appear, Monarca AI checks related metrics, identifies key root causes, and recommends actions with evidence.",
      eyebrow: "Active investigation",
      title: "Revenue dropped 12.4%",
      evidenceTitle: "Evidence chain",
      evidenceMetric: "Revenue dropped 18%",
      evidenceDrivers: ["iOS conversion declined", "CAC increased", "Retention Week 2 dropped"],
      confidenceLabel: "Confidence",
      confidenceValue: "82%",
      whyLabel: "Why AI believes this",
      timeline: [
        ["08:42", "System detected a revenue anomaly"],
        ["08:43", "Compared cohorts, campaigns, billing events, and product activation"],
        ["08:45", "Generated root-cause judgment and recommended actions"]
      ],
      steps: [
        {
          title: "AI analyzed 15+ metrics",
          text: "Revenue, activation, traffic quality, billing errors, and expansion pipeline were reviewed"
        },
        {
          title: "Identified root causes",
          text: "The drop was traced to CAC inflation, checkout friction, and late-stage pipeline compression"
        },
        {
          title: "Recommended actions",
          text: "Outputs three recommended actions with expected impact and confidence"
        }
      ]
    },
    reports: {
      sectionEyebrow: "Team-specific reports",
      eyebrow: "Reports",
      title: "A daily growth brief that writes itself",
      intro: "Summaries, owner updates, and impact tracking are generated from the same investigations your team already uses",
      signal: "Daily signal",
      status: "Auto-drafted",
      cards: [
        ["Growth brief", "What changed today, why it happened, and where to focus next"],
        ["Impact ledger", "Track actions, owners, confidence, and ARR movement in one view"],
        ["Board-ready notes", "Turn raw metrics into crisp explanations for leadership reviews"]
      ]
    },
    pricing: {
      eyebrow: "Pricing",
      title: "SaaS plans for growth intelligence",
      intro:
        "Choose the subscription that matches how your team wants to automate reports, analyze decisions, and operate growth",
      plans: [
        {
          name: "Professional",
          subtitle: "For teams that need ongoing automated operating analysis with dedicated analyst support",
          price: "¥2,000",
          cadence: "/ month",
          billingNote: "Annual service term, billed annually",
          badge: "Recommended",
          description:
            "Data onboarding + metric system configuration + dedicated analyst support + automated operating reports",
          features: [
            "Connect databases, Excel, SQL, CSV, and other data sources",
            "Configure a dedicated metric system and report structure",
            "Dedicated analyst support for data onboarding and adoption",
            "Auto-generate daily, weekly, and monthly operating reports",
            "Support anomaly alerts, report refresh, and metric checks"
          ],
          cta: "Book a 30-min Business Consultation",
          href: "/consulting"
        },
        {
          name: "Enterprise",
          subtitle: "Private enterprise decision system",
          price: "Custom",
          cadence: "",
          badge: "",
          features: ["Private deployment and data isolation", "Enterprise knowledge base plus business logic modeling", "Custom decision engine integrated into business workflows"],
          cta: "Contact us",
          href: "/checkout/enterprise"
        }
      ],
      addOn: {
        eyebrow: "Add-on service",
        name: "Database Setup",
        subtitle: "Build the data foundation before SaaS automation",
        price: "$200+",
        description: "For teams that need help designing databases, connecting sources, cleaning data, and preparing metric modeling",
        features: [
          "Business database and table structure",
          "Core source connection and field standards",
          "Cleaning, sync, and metric modeling readiness",
          "Consulting price varies by business complexity"
        ],
        cta: "Add database setup",
        href: "/checkout/database-setup"
      }
    },
    integrations: {
      eyebrow: "Supported integrations",
      title: "Connect the systems your revenue team already trusts"
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
      { label: "报告", href: "#reports" },
      { label: "价格", href: "#pricing" },
      { label: "预约咨询", href: "/consulting" }
    ],
    auth: {
      login: "登录",
      getStarted: "开始使用"
    },
    hero: {
      eyebrow: "为增长团队和中小企业打造的 AI 数据系统",
      headline: "你的 AI 商业分析团队",
      subheadline:
        "连接你的业务数据，自动生成经营报告，发现异常、定位原因，并给出可执行的增长建议",
      teamLabel: "一套 AI 工作流，完成从数据连接到经营洞察的全过程",
      team: [
        { role: "数据工程师", text: "建立数据库，连接数据源，清洗和同步数据" },
        { role: "分析工程师", text: "建立语义层，统一指标口径" },
        { role: "商业智能工程师", text: "生成报告、看板和可信视图" },
        { role: "经营洞察", text: "解释变化，定位关键根因" },
        { role: "增长运营", text: "把洞察转化为增长行动" }
      ],
      primaryCta: "预约 30 分钟商业咨询",
      secondaryCta: "查看 Demo",
      trust: ["语义层管理（映射业务）", "数据质量", "随时取消"]
    },
    visual: {
      status: "正在调查",
      monitor: "经营监控",
      drop: "本周收入下降 12.4%",
      trend: "经营趋势",
      range: "过去 30 天",
      preview: "AI 调查预览",
      rootCauses: "发现 3 个根因",
      confidence: "91% 置信度",
      actionTitle: "推荐行动",
      recommendation: "检查广告投放效率，补充热销商品库存，并跟进复购下降的客户群体",
      owner: "负责人",
      ownerValue: "增长 + CS",
      impact: "下一步",
      impactValue: "行动建议",
      causes: [
        ["广告获客成本", "+18%", "本周投放效率下降"],
        ["热销商品库存", "不足", "库存无法覆盖当前需求"],
        ["复购率", "-9%", "老客户再次购买减少"],
        ["退款率", "+31%", "退款增加，需要排查原因"]
      ]
    },
    features: {
      eyebrow: "",
      title: "蝴蝶效应能帮你做什么",
      cards: [
        {
          title: "汇总分散数据",
          text: "把 Excel、数据库和业务系统的数据集中到一个平台，自动生成分析报告"
        },
        {
          title: "发现异常并定位原因",
          text: "自动监控关键指标变化，并拆解到渠道、客户、产品、地区或时间段"
        },
        {
          title: "生成行动建议",
          text: "给出优先级、建议动作、影响范围和下一步处理方向"
        },
        {
          title: "追踪行动效果",
          text: "持续观察行动后指标是否改善，形成数据驱动闭环"
        }
      ]
    },
    useCases: {
      title: "不同团队如何使用蝴蝶效应",
      subtitle: "从每天要回答的业务问题出发，把分散数据转化为可执行的经营判断。",
      consultTitle: "想看看你的数据可以生成什么报告？",
      consultText: "预约一次商业咨询，我们会根据你的业务目标、数据来源和经营问题，帮你设计适合团队的日报、周报和月经营分析。",
      consultCta: "预约 30 分钟商业咨询",
      cards: [
        {
          title: "电商运营团队",
          scene: "订单、广告、退款和库存数据分散，销售一波动，就很难快速回答“为什么掉了”。",
          pain: "订单、广告、库存和复购数据都散在不同地方，需要手动拉表对比，才能回答销售额为什么掉了。",
          finding: "收入下降主要来自 CAC 上升、复购率下降和热销 SKU 库存不足。",
          action: "暂停低 ROI 渠道，优先补货热销 SKU，并召回近期未复购客户。",
          result: "自动定位收入下滑原因"
        },
        {
          title: "SaaS 增长团队",
          scene: "注册量看起来不少，但激活和付费转化下降，很难判断用户到底卡在哪一步。",
          pain: "产品行为、订阅和渠道数据分散，增长漏斗无法快速定位问题。",
          finding: "onboarding 第 2 步流失最高，激活率下降正在影响后续付费转化。",
          action: "优先优化首次体验，并持续追踪激活率、留存和付费转化。",
          result: "识别转化流失节点"
        },
        {
          title: "管理层经营周报",
          scene: "每周靠人工整理 PPT，数据口径不一致，管理层很难快速判断本周重点。",
          pain: "收入、成本、客户和渠道数据分散，周报制作耗时，解释也不统一。",
          finding: "自动识别收入、成本、客户和渠道异常，并标记优先级和影响范围。",
          action: "生成日报、周报和月经营分析，帮助管理层快速复盘和决策。",
          result: "生成管理层经营摘要"
        }
      ]
    },
    system: {
      eyebrow: "为什么需要它",
      title: "增长不缺数据，缺的是能转化为价值的洞察",
      points: [
        {
          title: "指标一直在变化",
          text: "蝴蝶效应会持续监控增长模型，不依赖人工盯盘"
        },
        {
          title: "定位原因太慢",
          text: "系统会跨数据源对比，并缩短调查路径"
        },
        {
          title: "洞察落地为价值",
          text: "每个发现都会转化为可执行行动，并持续追踪影响"
        }
      ]
    },
    investigation: {
      sectionTitle: "完整的 AI 经营调查",
      sectionSubtitle: "发现收入、转化或成本异常后，蝴蝶效应会自动检查相关指标，定位关键根因，并给出带证据链的行动建议。",
      eyebrow: "AI 如何工作",
      title: "收入下降 12.4%",
      evidenceTitle: "证据链",
      evidenceMetric: "收入下降 18%",
      evidenceDrivers: ["iOS 转化下降", "CAC 上升", "Retention Week 2 下滑"],
      confidenceLabel: "置信度",
      confidenceValue: "82%",
      whyLabel: "AI 为什么这么判断",
      timeline: [
        ["08:42", "系统检测到收入异常"],
        ["08:43", "对比了客群、投放、计费事件和产品激活数据"],
        ["08:45", "生成根因判断和行动建议"]
      ],
      steps: [
        {
          title: "AI 分析了 15+ 项指标",
          text: "系统检查了收入、激活率、流量质量、计费错误和扩张管道"
        },
        {
          title: "识别关键根因",
          text: "收入下滑主要来自 CAC 上升、结账摩擦和后期管道收缩"
        },
        {
          title: "推荐可执行行动",
          text: "输出 3 个行动建议，并附带预期影响和置信度"
        }
      ]
    },
    reports: {
      sectionEyebrow: "团队专属报告",
      eyebrow: "报告",
      title: "自动生成每天增长简报",
      intro: "自动同步并清洗数据，生成摘要和影响追踪，不再手动更新数据或拼报表",
      signal: "每日信号",
      status: "自动生成",
      cards: [
        ["数据自动化", "无需手动更新数据，系统自动同步、清洗并整理关键指标"],
        ["增长简报", "自动汇总每天发生了什么、为什么发生、下一步该关注哪里"],
        ["管理层摘要", "把可信数据转化为适合复盘和汇报的清晰解释"]
      ]
    },
    pricing: {
      eyebrow: "价格",
      title: "增长智能系统订阅方案",
      intro: "选择适合团队当前阶段的 SaaS 方案，用于报告自动化、数据分析和经营决策辅助",
      plans: [
        {
          name: "专业版",
          subtitle: "适合需要持续自动化经营分析，并希望有专属分析师协助落地的团队",
          price: "¥2,000",
          cadence: "/ 月",
          billingNote: "年度服务周期，按年支付",
          badge: "推荐",
          description: "数据接入 + 指标体系配置 + 专属分析师协助 + 自动化经营报告",
          features: [
            "连接数据库、Excel、SQL、CSV 等数据源",
            "配置专属指标体系与经营报告结构",
            "专属分析师协助数据接入与分析落地",
            "自动生成日报、周报和月经营分析",
            "支持异常提醒、报告刷新和指标口径校验"
          ],
          cta: "预约 30 分钟商业咨询",
          href: "/consulting"
        },
        {
          name: "企业版",
          subtitle: "企业级决策系统（私有化）",
          price: "按需报价",
          cadence: "",
          badge: "",
          features: ["私有化部署 / 数据安全隔离", "企业知识库 + 业务逻辑建模", "定制化决策引擎（接入业务流）"],
          cta: "联系咨询",
          href: "/checkout/enterprise"
        }
      ],
      addOn: {
        eyebrow: "附加服务",
        name: "数据库搭建",
        subtitle: "在 SaaS 自动化前建立数据基础设施",
        price: "¥2,000+",
        description: "适合需要先搭建数据库、连接数据源、清洗数据并准备指标建模的团队",
        features: [
          "业务数据库与数据表结构",
          "核心数据源连接与字段规范",
          "数据清洗、同步和指标建模准备",
          "咨询根据商业复杂程度定价"
        ],
        cta: "添加数据库搭建",
        href: "/checkout/database-setup"
      }
    },
    integrations: {
      eyebrow: "支持的数据集成",
      title: "连接增长团队已经在使用的系统"
    }
  }
} as const;

type HomeCopy = (typeof homepageCopy)[CopyLocale];

function Logo({ label, className }: { label: string; className?: string }) {
  return (
    <Link href="/" className="flex items-center" aria-label={label}>
      <BrandLogo label={label} className={cn("h-12", className)} />
    </Link>
  );
}

function TrustItem({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <Check className="size-3.5 text-emerald-700" />
      {children}
    </span>
  );
}

function TeamRoster({ copy }: { copy: HomeCopy["hero"] }) {
  return (
    <div className="mt-5 max-w-2xl rounded-[26px] border border-emerald-100/80 bg-white/72 p-3 shadow-[0_16px_50px_rgba(6,78,59,0.07)] backdrop-blur">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
        {copy.teamLabel}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {copy.team.map((member, index) => {
          const Icon = teamRoleIcons[index];

          return (
            <div
              key={member.role}
              className={cn(
                "flex items-start gap-2.5 rounded-2xl border border-slate-200/75 bg-slate-50/80 p-2.5",
                index === copy.team.length - 1 && "sm:col-span-2"
              )}
            >
              <div className="grid size-7 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
                <Icon className="size-3.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-950">{member.role}</p>
                <p className="mt-0.5 text-xs leading-4 text-slate-500">{member.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeroWorkflowMobile({ copy }: { copy: HomeCopy["hero"] }) {
  const mobileTextByRole: Record<string, string> = {
    "Data Engineer": "Connect, clean, and sync data",
    "Analytics Engineer": "Standardize metric logic",
    "BI Engineer": "Generate reports and dashboards",
    "Business Intelligence": "Explain root causes",
    "Growth Operations": "Recommend next actions",
    数据工程师: "连接、清洗和同步数据",
    分析工程师: "统一指标口径",
    商业智能工程师: "生成报告和看板",
    经营洞察: "解释变化原因",
    增长运营: "输出行动建议"
  };

  return (
    <div className="mt-5 rounded-[24px] border border-emerald-100/80 bg-white/78 p-4 shadow-[0_14px_42px_rgba(6,78,59,0.06)] backdrop-blur">
      <p className="text-sm font-semibold leading-6 text-emerald-900">{copy.teamLabel}</p>
      <div className="mt-3 grid gap-2">
        {copy.team.map((member, index) => {
          const Icon = teamRoleIcons[index];

          return (
            <div
              key={member.role}
              className="flex min-h-16 items-center gap-3 rounded-2xl border border-slate-200/75 bg-slate-50/85 px-3 py-2.5"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-5 text-slate-950">{member.role}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">
                  {mobileTextByRole[member.role] ?? member.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HeroPreviewCardMobile({ copy }: { copy: HomeCopy["visual"] }) {
  const causes = copy.causes.slice(0, 3);

  return (
    <div className="mt-5 w-full rounded-[24px] border border-emerald-100/90 bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-5 shadow-[0_14px_40px_rgba(6,78,59,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{copy.monitor}</p>
          <h3 className="mt-2 text-lg font-semibold leading-tight text-slate-950">{copy.drop}</h3>
        </div>
        <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-600">
          -12.4%
        </span>
      </div>
      <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/82 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-emerald-700" />
          <p className="text-sm font-semibold text-slate-900">
            {copy.preview}，{copy.rootCauses}
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {causes.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-600">{label}</span>
              <span className={cn("font-semibold", value.startsWith("-") || value.startsWith("+") ? "text-rose-600" : "text-slate-950")}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroVisualization({ copy }: { copy: HomeCopy["visual"] }) {
  return (
    <div className="relative mx-auto h-[440px] w-full max-w-[520px] lg:mx-0">
      <div className="absolute inset-0 rounded-[44px] bg-gradient-to-br from-[#9dd8b8]/70 via-[#d6eadf]/75 to-[#aacfc1]/70 blur-3xl" />
      <div className="butterfly-float absolute right-0 top-2 z-20 grid size-14 place-items-center rounded-[22px] border border-white/70 bg-white/82 text-emerald-800 shadow-[0_20px_60px_rgba(6,78,59,0.2)] backdrop-blur">
        <BrainCircuit className="size-5" />
      </div>

      <div className="absolute left-0 right-4 top-8 h-[292px] rounded-[32px] border border-white/70 bg-[#dceee4]/70 p-5 shadow-[0_28px_90px_rgba(6,78,59,0.17)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-400">{copy.monitor}</p>
            <h3 className="mt-2 text-xl font-semibold tracking-normal text-slate-950 sm:text-2xl">{copy.drop}</h3>
          </div>
          <div className="mt-3 rounded-full border border-rose-200 bg-rose-50/90 px-3 py-1.5 text-sm font-semibold text-rose-600">
            -12.4%
          </div>
        </div>

        <div className="mt-5 h-[140px] overflow-hidden rounded-[26px] border border-[#b8d9c8]/80 bg-[#eef8f2]/90 p-4 shadow-[0_18px_60px_rgba(6,78,59,0.09)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-2xl bg-[#c8ead8] text-emerald-900">
                <LineChart className="size-4" />
              </div>
              <span className="text-sm font-semibold text-slate-700">{copy.trend}</span>
            </div>
            <span className="text-xs font-medium text-slate-400">{copy.range}</span>
          </div>
          <svg viewBox="0 0 440 118" className="mt-1 h-20 w-full overflow-visible" aria-hidden="true">
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

      <div className="absolute left-5 right-0 top-[190px] z-10 rounded-[28px] border border-white/80 bg-[#e9f6ef]/94 p-4 shadow-[0_24px_70px_rgba(6,78,59,0.2)] backdrop-blur-xl sm:left-7">
        <div className="mb-3 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-slate-950 text-white">
            <Sparkles className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950 sm:text-base">{copy.preview}</p>
            <p className="mt-1 text-xs text-slate-500">{copy.rootCauses}</p>
          </div>
        </div>
        <div className="space-y-2">
          {copy.causes.map(([label, value, text]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/85 px-3.5 py-2">
              <div>
                <p className="text-xs font-semibold text-slate-800 sm:text-sm">{label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{text}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-emerald-700 sm:text-base">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileNavDrawer({
  copy,
  isAuthenticated,
  isOpen,
  onClose
}: {
  copy: HomeCopy;
  isAuthenticated: boolean;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  const ctaHref = isAuthenticated ? "/dashboard" : "/sign-up";

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/35"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex w-[min(86vw,320px)] flex-col bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <Logo label={copy.logo} className="h-10" />
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 place-items-center rounded-full border border-slate-200 text-slate-600"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-6 space-y-1">
          {copy.nav.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={onClose}
              className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
            >
              {item.label}
              <ArrowRight className="size-4" />
            </a>
          ))}
          {!isAuthenticated ? (
            <Link
              href="/sign-in"
              onClick={onClose}
              className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
            >
              {copy.auth.login}
              <ArrowRight className="size-4" />
            </Link>
          ) : null}
        </div>
        <div className="mt-auto border-t border-slate-100 pt-4">
          <Button asChild className="h-11 w-full rounded-full bg-slate-950 text-sm text-white hover:bg-slate-800">
            <Link href={ctaHref} onClick={onClose}>
              {copy.auth.getStarted}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </aside>
    </div>
  );
}

function OperatingLayer({ copy }: { copy: HomeCopy["system"] }) {
  const icons = [Activity, GitBranch, Target];

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <div className="min-w-0 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/76 p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)] backdrop-blur sm:rounded-[30px] sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-medium text-emerald-700 sm:text-sm">{copy.eyebrow}</p>
          <h2 className="mt-2 max-w-full break-words text-2xl font-semibold leading-tight tracking-normal text-slate-950 sm:text-3xl lg:whitespace-nowrap">
            {copy.title}
          </h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {copy.points.map((point, index) => {
            const Icon = icons[index];
            return (
              <div key={point.title} className="rounded-3xl border border-slate-200/80 bg-slate-50/80 p-4">
                <div className="mb-4 grid size-8 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                  <Icon className="size-4" />
                </div>
                <h3 className="text-base font-semibold text-slate-950">{point.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{point.text}</p>
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
    <section id="alerts" className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-12">
      <div className="mb-6">
        <div>
          {copy.eyebrow ? (
            <p className="text-xs font-medium text-emerald-700 sm:text-sm">{copy.eyebrow}</p>
          ) : null}
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            {copy.title}
          </h2>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {copy.cards.map((card, index) => {
          const meta = featureMeta[index];
          return (
            <div
              key={card.title}
              className={cn("rounded-3xl border border-white/70 p-4 shadow-[0_16px_50px_rgba(15,23,42,0.06)]", meta.className)}
            >
              <div className="mb-6 grid size-9 place-items-center rounded-2xl bg-white/80 text-slate-950 shadow-sm">
                <meta.icon className="size-4" />
              </div>
              <h3 className="text-base font-semibold text-slate-950 sm:text-lg">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{card.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UseCaseMockup({ index, isZh }: { index: number; isZh: boolean }) {
  if (index === 1) {
    const steps = [
      { label: isZh ? "注册" : "Signup", value: "100%", width: "w-full" },
      { label: "onboarding 2", value: "-42%", width: "w-[58%]", alert: true },
      { label: isZh ? "激活" : "Activation", value: "31%", width: "w-[42%]" },
      { label: isZh ? "付费" : "Paid", value: "12%", width: "w-[28%]" }
    ];

    return (
      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/78 p-3 shadow-[0_10px_34px_rgba(15,23,42,0.045)]">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500">{isZh ? "增长漏斗" : "Growth funnel"}</span>
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
            {isZh ? "第 2 步流失" : "Step 2 drop"}
          </span>
        </div>
        <div className="space-y-1.5">
          {steps.map((step) => (
            <div key={step.label} className="grid grid-cols-[86px_1fr_36px] items-center gap-2">
              <span className="truncate text-[11px] text-slate-500">{step.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`${step.width} h-full rounded-full ${step.alert ? "bg-rose-300" : "bg-emerald-300"}`} />
              </div>
              <span className={`text-right text-[11px] font-semibold ${step.alert ? "text-rose-600" : "text-slate-700"}`}>
                {step.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (index === 2) {
    const items = [
      [isZh ? "收入" : "Revenue", "-6.1%", "text-rose-600"],
      [isZh ? "成本" : "Cost", "+4.3%", "text-amber-600"],
      [isZh ? "客户" : "Customers", "-0.9%", "text-slate-700"],
      [isZh ? "渠道" : "Channel", isZh ? "异常" : "Alert", "text-emerald-700"]
    ];

    return (
      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/78 p-3 shadow-[0_10px_34px_rgba(15,23,42,0.045)]">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-500">{isZh ? "本周重点" : "Weekly summary"}</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            {isZh ? "经营摘要" : "Brief"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {items.map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-2">
              <p className="text-[10px] font-medium text-slate-500">{label}</p>
              <p className={`mt-0.5 text-xs font-semibold ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 h-1.5 w-10/12 rounded-full bg-emerald-100">
          <div className="h-full w-7/12 rounded-full bg-emerald-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/78 p-3 shadow-[0_10px_34px_rgba(15,23,42,0.045)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500">{isZh ? "经营分析" : "Operations view"}</span>
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
          {isZh ? "收入下降" : "Revenue down"}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_74px] gap-2">
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2">
          <svg viewBox="0 0 120 42" className="h-11 w-full" aria-hidden="true">
            <path d="M4 12 C22 8 30 18 45 15 C62 12 67 28 82 25 C98 22 105 34 116 31" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
            <path d="M4 12 C22 8 30 18 45 15 C62 12 67 28 82 25 C98 22 105 34 116 31 L116 42 L4 42 Z" fill="#d1fae5" opacity="0.72" />
          </svg>
        </div>
        <div className="grid gap-1">
          <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">CAC +18%</span>
          <span className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-600">{isZh ? "复购 -9%" : "Repeat -9%"}</span>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">SKU {isZh ? "不足" : "low"}</span>
        </div>
      </div>
    </div>
  );
}

function UseCaseSection({ copy }: { copy: HomeCopy["useCases"] }) {
  const labels = ["痛点", "AI 发现", "建议行动"];
  const englishLabels = ["Pain point", "AI finding", "Recommended action"];
  const isZh = copy.title === "不同团队如何使用蝴蝶效应";
  const fieldLabels = isZh ? labels : englishLabels;

  return (
    <section className="mx-auto max-w-7xl px-5 py-9 sm:px-8 sm:py-11">
      <div className="mb-5 max-w-3xl">
        <p className="text-xs font-medium text-emerald-700 sm:text-sm">
          {isZh ? "团队案例" : "Team use cases"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          {copy.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">{copy.subtitle}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {copy.cards.map((card, index) => {
          const Icon = useCaseIcons[index];
          const rows = [card.pain, card.finding, card.action];

          return (
            <article
              key={card.title}
              className="group flex min-w-0 flex-col rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfffd_100%)] p-4 shadow-[0_14px_50px_rgba(15,23,42,0.045)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_18px_60px_rgba(4,120,87,0.1)] sm:p-4"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100 transition group-hover:bg-emerald-100">
                  <Icon className="size-3.5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold leading-6 text-slate-950">{card.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{card.scene}</p>
                </div>
              </div>

              <UseCaseMockup index={index} isZh={isZh} />

              <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
                {rows.map((text, rowIndex) => (
                  <div key={fieldLabels[rowIndex]} className="grid gap-1 py-2.5">
                    <span className="text-[11px] font-semibold text-emerald-800">
                      {fieldLabels[rowIndex]}
                    </span>
                    <p className="text-sm leading-6 text-slate-700">{text}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <span className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                  {card.result}
                </span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mx-auto mt-6 max-w-3xl text-center">
        <h3 className="text-lg font-semibold tracking-normal text-slate-950">{copy.consultTitle}</h3>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">{copy.consultText}</p>
        <Button asChild className="mt-4 h-11 w-full rounded-full bg-slate-950 px-5 text-sm text-white hover:bg-slate-800 sm:w-auto">
          <Link href="/consulting">
            {copy.consultCta}
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function InvestigationPreview({ copy }: { copy: HomeCopy["investigation"] }) {
  return (
    <section id="investigations" className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <div className="mb-6 max-w-3xl">
        <p className="text-xs font-medium text-emerald-700 sm:text-sm">{copy.eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          {copy.sectionTitle}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">{copy.sectionSubtitle}</p>
      </div>
      <div className="overflow-hidden rounded-[30px] border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="grid gap-0 lg:grid-cols-[0.88fr_1.12fr]">
          <div className="border-b border-slate-200/80 p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="mb-8 flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-2xl bg-rose-50 text-rose-600">
                <CircleDollarSign className="size-4" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 sm:text-sm">{copy.eyebrow}</p>
                <h2 className="text-xl font-semibold text-slate-950 sm:text-2xl">{copy.title}</h2>
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
          </div>

          <div className="bg-gradient-to-br from-slate-50 via-white to-emerald-100/65 p-5 sm:p-6">
            <div className="grid gap-3">
              {copy.steps.map((step, index) => (
                <div key={step.title} className="flex items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-2xl border border-emerald-200 bg-white text-xs font-semibold text-emerald-700 shadow-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 rounded-3xl border border-white/80 bg-white/82 p-4 shadow-[0_16px_50px_rgba(4,120,87,0.1)] backdrop-blur">
                    <p className="text-sm font-semibold text-slate-950">{step.title}</p>
                    <p className="mt-1.5 text-sm leading-6 text-slate-500">{step.text}</p>
                  </div>
                  {index < copy.steps.length - 1 && (
                    <MoveRight className="hidden size-5 shrink-0 text-emerald-500 lg:block" />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-3xl border border-emerald-200/80 bg-white/90 p-4 shadow-[0_18px_60px_rgba(4,120,87,0.1)]">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    {copy.evidenceTitle}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-950">
                    {copy.whyLabel}
                  </h3>
                </div>
                <div className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
                  {copy.confidenceLabel}: {copy.confidenceValue}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[0.7fr_auto_1fr] lg:items-center">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-950">{copy.evidenceMetric}</p>
                </div>
                <ArrowRight className="hidden size-5 text-slate-400 lg:block" />
                <div className="grid gap-2">
                  {copy.evidenceDrivers.map((driver) => (
                    <div key={driver} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                      <span className="size-1.5 rounded-full bg-emerald-700" aria-hidden="true" />
                      <span className="text-sm font-medium text-slate-700">{driver}</span>
                    </div>
                  ))}
                </div>
              </div>
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
    <section id="reports" className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <p className="mb-4 text-xs font-medium text-emerald-700 sm:text-sm">{copy.sectionEyebrow}</p>
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-stretch">
        <div className="rounded-[30px] border border-slate-200/80 bg-slate-950 p-5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.12)] sm:p-6">
          <p className="text-xs font-medium text-emerald-300 sm:text-sm">{copy.eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">{copy.title}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">{copy.intro}</p>
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/8 p-4">
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
              <div key={title} className="rounded-[26px] border border-slate-200/80 bg-white/82 p-4 shadow-[0_18px_70px_rgba(15,23,42,0.06)] backdrop-blur">
                <div className="mb-6 grid size-9 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Icon className="size-4" />
                </div>
                <h3 className="text-base font-semibold text-slate-950 sm:text-lg">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PricingSection({ copy }: { copy: HomeCopy["pricing"] }) {
  const displayPlans = [
    ...copy.plans,
    {
      name: copy.addOn.name,
      subtitle: copy.addOn.subtitle,
      price: copy.addOn.price,
      cadence: "",
      badge: copy.addOn.eyebrow,
      description: copy.addOn.description,
      features: copy.addOn.features,
      cta: copy.addOn.cta,
      href: copy.addOn.href
    }
  ];

  return (
    <section id="pricing" className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <div className="mb-6 max-w-3xl">
        <p className="text-xs font-medium text-emerald-700 sm:text-sm">{copy.eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          {copy.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">{copy.intro}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {displayPlans.map((plan, index) => {
          const Icon = pricingIcons[index];
          const isFeatured = index === 0;

          return (
            <div
              key={plan.name}
              className={cn(
                "relative flex min-h-[400px] flex-col rounded-[28px] border bg-white/84 p-5 shadow-[0_20px_80px_rgba(15,23,42,0.06)] backdrop-blur",
                isFeatured && "border-emerald-300 bg-gradient-to-br from-white via-emerald-50/80 to-white shadow-[0_24px_90px_rgba(4,120,87,0.13)]"
              )}
            >
              {plan.badge ? (
                <span className="absolute right-5 top-5 rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">
                  {plan.badge}
                </span>
              ) : null}

              <div className="mb-5 grid size-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
                <Icon className="size-4" />
              </div>
              <h3 className="text-lg font-semibold text-slate-950 sm:text-xl">{plan.name}</h3>
              <p className="mt-2 text-sm font-medium text-slate-500">{plan.subtitle}</p>
              {"description" in plan && plan.description ? (
                <p className="mt-3 rounded-2xl bg-white/70 p-3 text-sm leading-6 text-slate-700">
                  {plan.description}
                </p>
              ) : null}

              <div className="mt-5 flex items-end gap-1">
                <span className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">{plan.price}</span>
                {plan.cadence ? (
                  <span className="pb-1 text-sm font-medium text-slate-500">{plan.cadence}</span>
                ) : null}
              </div>
              <div className="mt-5 space-y-2.5">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex gap-2.5 text-sm leading-6 text-slate-600">
                    <Check className="mt-1 size-3.5 shrink-0 text-emerald-700" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <Button
                asChild
                className={cn(
                  "mt-auto h-10 rounded-full text-sm",
                  isFeatured ? "bg-slate-950 text-white hover:bg-slate-800" : "bg-white text-slate-950 hover:bg-slate-50"
                )}
                variant={isFeatured ? "default" : "outline"}
              >
                <Link href={`${plan.href}?from=home`}>
                  {plan.cta}
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>

    </section>
  );
}

function Integrations({ copy }: { copy: HomeCopy["integrations"] }) {
  return (
    <section id="sources" className="mx-auto max-w-7xl px-5 pb-14 pt-10 sm:px-8">
      <div className="rounded-[30px] border border-slate-200/80 bg-white/80 p-5 shadow-[0_20px_80px_rgba(15,23,42,0.06)] backdrop-blur sm:p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 sm:text-sm">{copy.eyebrow}</p>
            <h2 className="text-xl font-semibold text-slate-950 sm:text-2xl">{copy.title}</h2>
          </div>
          <Database className="hidden size-6 text-emerald-700 sm:block" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {integrations.map((integration) => (
            <div key={integration} className="flex h-14 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 text-sm font-semibold text-slate-600">
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
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const copy = homepageCopy[getCopyLocale(locale)];
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const isAuthenticated = isLoaded && isSignedIn;
  const isZh = getCopyLocale(locale) === "zh";

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

  return (
    <main
      lang={getHtmlLang(locale)}
      className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f1faf5_46%,#ffffff_100%)] text-slate-950"
    >
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/78 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6 lg:h-14 lg:px-8">
          <Logo label={copy.logo} className="h-10 sm:h-11" />
          <div className="hidden items-center gap-6 lg:flex">
            {copy.nav.map((item) => (
              <a key={item.label} href={item.href} className="text-xs font-medium text-slate-500 transition hover:text-slate-950">
                {item.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 sm:gap-2 sm:px-3 lg:text-xs">
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
            {isAuthenticated ? (
              <Button asChild className="hidden h-9 rounded-full bg-slate-950 px-4 text-xs text-white hover:bg-slate-800 lg:inline-flex">
                <Link href="/dashboard">{copy.auth.getStarted}</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="hidden h-9 rounded-full text-xs text-slate-600 lg:inline-flex">
                  <Link href="/sign-in">{copy.auth.login}</Link>
                </Button>
                <Button asChild className="hidden h-9 rounded-full bg-slate-950 px-4 text-xs text-white hover:bg-slate-800 lg:inline-flex">
                  <Link href="/sign-up">{copy.auth.getStarted}</Link>
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              className="grid size-10 place-items-center rounded-full border border-slate-200 text-slate-700 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
          </div>
        </nav>
      </header>
      <MobileNavDrawer
        copy={copy}
        isAuthenticated={isAuthenticated}
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
      />

      <section className="relative mx-auto grid max-w-7xl gap-7 px-4 pb-8 pt-9 sm:px-6 sm:pt-12 lg:grid-cols-[0.98fr_1.02fr] lg:items-start lg:gap-10 lg:px-8 lg:pb-10 lg:pt-20">
        <div className="absolute left-0 right-0 top-0 -z-0 hidden h-px bg-gradient-to-r from-transparent via-emerald-900/40 to-transparent lg:block" />
        <div className="relative z-10">
          <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-[#9fcdb5]/80 bg-[#d8efe3]/80 px-3 py-1.5 text-xs font-medium text-emerald-950 sm:text-sm lg:mb-5 lg:text-xs">
            <Zap className="size-3.5 sm:size-4" />
            {copy.hero.eyebrow}
          </div>
          <h1 className="max-w-3xl text-[2.35rem] font-semibold leading-[1.1] tracking-normal text-slate-950 sm:text-5xl lg:whitespace-nowrap lg:text-[3.25rem] lg:leading-[1.08]">
            {isZh ? (
              <>
                <span className="block sm:inline lg:inline">你的 AI</span>
                <span className="block sm:inline lg:inline"> 商业分析团队</span>
              </>
            ) : (
              copy.hero.headline
            )}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-[1.6] text-slate-600 lg:mt-5 lg:text-base lg:leading-7">
            <span className="lg:hidden">
              {isZh
                ? "连接业务数据，自动生成经营报告，发现异常并给出增长建议。"
                : "Connect business data, generate reports, detect anomalies, and get growth recommendations."}
            </span>
            <span className="hidden lg:inline">{copy.hero.subheadline}</span>
          </p>
          <div className="hidden lg:block">
            <TeamRoster copy={copy.hero} />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:mt-7">
            <Show when="signed-out">
              <Button asChild className="h-12 w-full rounded-full bg-slate-950 px-5 text-sm text-white hover:bg-slate-800 sm:w-auto lg:h-10">
                <Link href="/consulting">
                  {copy.hero.primaryCta}
                  <ArrowRight />
                </Link>
              </Button>
            </Show>
            <Show when="signed-in">
              <Button asChild className="h-12 w-full rounded-full bg-slate-950 px-5 text-sm text-white hover:bg-slate-800 sm:w-auto lg:h-10">
                <Link href="/consulting">
                  {copy.hero.primaryCta}
                  <ArrowRight />
                </Link>
              </Button>
            </Show>
            <Button asChild variant="outline" className="h-12 w-full rounded-full border-slate-200 bg-white/70 px-5 text-sm sm:w-auto lg:h-10">
              <Link href="/sign-up">
                {copy.hero.secondaryCta}
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="mt-5 hidden flex-col gap-3 sm:flex-row sm:items-center sm:gap-5 lg:flex">
            {copy.hero.trust.map((item) => (
              <TrustItem key={item}>{item}</TrustItem>
            ))}
          </div>
          <div className="lg:hidden">
            <HeroWorkflowMobile copy={copy.hero} />
            <HeroPreviewCardMobile copy={copy.visual} />
          </div>
        </div>

        <div className="relative z-10 hidden pt-8 lg:flex lg:justify-end">
          <HeroVisualization copy={copy.visual} />
        </div>

      </section>

      <OperatingLayer copy={copy.system} />
      <FeatureCards copy={copy.features} />
      <UseCaseSection copy={copy.useCases} />
      <InvestigationPreview copy={copy.investigation} />
      <ReportsSection copy={copy.reports} />
      <PricingSection copy={copy.pricing} />
      <Integrations copy={copy.integrations} />
    </main>
  );
}
