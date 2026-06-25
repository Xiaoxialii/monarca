"use client";

import { useUser } from "@clerk/nextjs";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Check,
  Database,
  FileText,
  Languages,
  ListChecks,
  Menu,
  Rocket,
  ShoppingBag,
  Sparkles,
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

const ecommerceIntegrations = [
  { name: "Shopify", mark: "S", tone: "bg-emerald-100 text-emerald-700" },
  { name: "Klaviyo", mark: "K", tone: "bg-rose-100 text-rose-700" },
  { name: "Meta Ads", mark: "f", tone: "bg-blue-100 text-blue-700" },
  { name: "Google Ads", mark: "G", tone: "bg-amber-100 text-amber-700" },
  { name: "Google Analytics", mark: "GA", tone: "bg-orange-100 text-orange-700" },
  { name: "Amazon Ads", mark: "a", tone: "bg-slate-100 text-slate-800" },
  { name: "Amazon", mark: "A", tone: "bg-orange-100 text-orange-700" },
  { name: "TikTok", mark: "T", tone: "bg-slate-900 text-white" },
  { name: "Recharge", mark: "R", tone: "bg-violet-100 text-violet-700" },
  { name: "Attentive", mark: "At", tone: "bg-pink-100 text-pink-700" },
  { name: "NetSuite", mark: "N", tone: "bg-slate-100 text-slate-700" },
  { name: "Google Sheets", mark: "GS", tone: "bg-green-100 text-green-700" },
  { name: "Pinterest", mark: "P", tone: "bg-red-100 text-red-700" },
  { name: "Snapchat", mark: "S", tone: "bg-yellow-100 text-yellow-700" },
  { name: "Mailchimp", mark: "M", tone: "bg-amber-100 text-amber-800" },
  { name: "HubSpot", mark: "H", tone: "bg-orange-100 text-orange-700" },
  { name: "Zendesk", mark: "Z", tone: "bg-teal-100 text-teal-700" },
  { name: "Slack", mark: "#", tone: "bg-purple-100 text-purple-700" },
  { name: "Xero", mark: "X", tone: "bg-sky-100 text-sky-700" },
  { name: "LinkedIn", mark: "in", tone: "bg-blue-100 text-blue-700" },
  { name: "Instagram", mark: "IG", tone: "bg-fuchsia-100 text-fuchsia-700" },
  { name: "Yotpo", mark: "Y", tone: "bg-indigo-100 text-indigo-700" },
  { name: "WooCommerce", mark: "W", tone: "bg-purple-100 text-purple-700" },
  { name: "Square", mark: "Sq", tone: "bg-slate-100 text-slate-700" },
  { name: "Typeform", mark: "T", tone: "bg-stone-100 text-stone-700" },
  { name: "Intercom", mark: "I", tone: "bg-blue-100 text-blue-700" },
  { name: "QuickBooks", mark: "QB", tone: "bg-lime-100 text-lime-700" },
  { name: "Stripe", mark: "St", tone: "bg-indigo-100 text-indigo-700" }
];

const integrationRows = [
  ecommerceIntegrations.slice(0, 10),
  ecommerceIntegrations.slice(10, 19),
  ecommerceIntegrations.slice(19)
];

const featureMeta = [
  { icon: Database, className: "bg-emerald-100/80" },
  { icon: AlertTriangle, className: "bg-lime-100/75" },
  { icon: ListChecks, className: "bg-teal-100/80" },
  { icon: TrendingUp, className: "bg-emerald-100/70" }
];

const useCaseIcons = [ShoppingBag, Rocket, UsersRound];
const useCaseAvatars = [
  { face: "EC", role: "Ecommerce", className: "from-emerald-100 via-white to-lime-100 text-emerald-900" },
  { face: "EX", role: "Executive", className: "from-sky-100 via-white to-indigo-100 text-sky-900" },
  { face: "OP", role: "Operations", className: "from-amber-100 via-white to-rose-100 text-amber-900" }
];
const useCaseThemes = [
  {
    card: "bg-gradient-to-br from-emerald-50 via-white to-lime-50 ring-emerald-100/80",
    icon: "bg-emerald-100/70 text-emerald-800 ring-emerald-200/70",
    pill: "bg-emerald-100/75 text-emerald-800 ring-emerald-200/70",
    line: "border-emerald-300",
    action: "bg-emerald-50/85 text-emerald-950 ring-emerald-100"
  },
  {
    card: "bg-gradient-to-br from-sky-50 via-white to-indigo-50 ring-sky-100/80",
    icon: "bg-sky-100/75 text-sky-800 ring-sky-200/70",
    pill: "bg-sky-100/75 text-sky-800 ring-sky-200/70",
    line: "border-sky-300",
    action: "bg-sky-50/85 text-sky-950 ring-sky-100"
  },
  {
    card: "bg-gradient-to-br from-amber-50 via-white to-rose-50 ring-amber-100/80",
    icon: "bg-amber-100/75 text-amber-800 ring-amber-200/70",
    pill: "bg-amber-100/75 text-amber-800 ring-amber-200/70",
    line: "border-amber-300",
    action: "bg-amber-50/85 text-amber-950 ring-amber-100"
  }
];

const useCaseLayout = [
  "lg:w-[35%] lg:-translate-y-1 lg:-rotate-[0.8deg]",
  "lg:w-[31%] lg:translate-y-8 lg:rotate-[0.7deg]",
  "lg:w-[34%] lg:translate-y-2 lg:-rotate-[0.35deg]"
];

const personaAvatarStyles = [
  "from-emerald-200 via-teal-100 to-white text-emerald-950 ring-emerald-100",
  "from-amber-200 via-orange-100 to-white text-amber-950 ring-amber-100",
  "from-sky-200 via-indigo-100 to-white text-sky-950 ring-sky-100",
  "from-rose-200 via-pink-100 to-white text-rose-950 ring-rose-100"
];

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
      eyebrow: "AI Revenue & Growth System",
      headline: "Identify growth opportunities and business risks earlier",
      subheadline: "",
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
      trust: ["Automated data analysis", "Real-time insights", "Actionable recommendations"]
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
          title: "Ecommerce team",
          persona:
            "We used to stitch together order, ad, and inventory data ourselves just to barely understand what happened; now Monarca AI identifies the real profit sources directly, so we know faster which products are worth scaling.",
          scene: "Orders look like they are growing, but I am not sure whether it is healthy growth.",
          insight: "AI sees growth coming from short-term channel spikes rather than stable demand.",
          action: "Identify the real growth source before increasing spend.",
          roles: ["🚀 Growth Analyst", "📣 Marketing Operator"]
        },
        {
          title: "Executive team",
          persona:
            "Monarca AI makes our operating review much faster. It automatically turns complex data changes into key points, so we no longer spend hours preparing weekly reports by hand.",
          scene: "Ad spend and inventory are both increasing, but profit is going down.",
          insight: "AI sees rising cost and weaker ad efficiency eroding margin.",
          action: "Reduce low-ROI channel spend and rebalance cost structure.",
          roles: ["⚠ Risk Analyst", "📊 Finance Operator"]
        },
        {
          title: "Operations team",
          persona:
            "We often do not know which issue to handle first, and it is hard to judge the impact range; Monarca AI locates anomalies, ranks priorities, and turns each issue into a clear executable task.",
          scene: "There is a lot of data, but no clear direction.",
          insight: "AI turns multi-dimensional data into prioritized operating actions.",
          action: "Execute the recommended next step and track impact.",
          roles: ["👤 Growth Operator", "🚀 Decision Maker"]
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
      sectionTitle: "Work with AI",
      sectionSubtitle:
        "After revenue, conversion, or cost anomalies appear, Monarca AI checks related metrics, identifies key root causes, and recommends actions with evidence.",
      eyebrow: "",
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
          price: "$600",
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
      eyebrow: "AI Revenue & Growth System",
      headline: "提前识别增长机会与业务风险",
      subheadline: "连接业务数据，自动生成增长分析与行动建议",
      teamLabel: "三类关键洞察，帮助团队更早行动",
      team: [
        { role: "更早发现增长机会", text: "识别高潜力信号、异常变化和关键增长机会，帮助团队更早把握业务窗口。" },
        { role: "更快识别风险与亏损", text: "发现利润下滑、低效投入、库存风险或业务异常，减少不必要的损失。" },
        { role: "自动生成行动建议", text: "基于数据变化自动给出下一步建议，帮助团队更快判断、执行和优化。" }
      ],
      primaryCta: "预约 30 分钟咨询",
      secondaryCta: "查看 Demo",
      trust: ["数据自动分析", "实时洞察", "可执行建议"]
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
      title: "一套 AI 工作流，完成从数据连接到经营洞察的全过程",
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
          title: "电商团队",
          persona: "以前我们总是要自己拼订单、广告和库存数据，才能勉强看清发生了什么；现在 Monarca AI 能直接识别真实利润来源，让我们更快知道哪些商品值得继续放大。",
          scene: "",
          insight: "Monarca AI 直接识别真实利润来源。",
          action: "更快知道哪些商品值得继续放大。",
          roles: ["🛒 Ecommerce Operator", "🚀 Growth Analyst"]
        },
        {
          title: "管理层",
          persona: "Monarca AI 让我们的经营复盘快了很多，它会自动把复杂的数据变化整理成重点，让我们不需要再花大量时间手工准备每周汇报。",
          scene: "",
          insight: "Monarca AI 自动把复杂变化整理成重点。",
          action: "团队能更快完成复盘和决策。",
          roles: ["👔 Executive", "📊 Business Analyst"]
        },
        {
          title: "运营团队",
          persona: "我们常常不知道该先处理哪一个，也很难判断影响范围；Monarca AI 会先帮我们定位异常、判断优先级，再把问题转成清晰可执行的任务。",
          scene: "",
          insight: "Monarca AI 先定位异常并判断优先级。",
          action: "再把问题转成清晰可执行的任务。",
          roles: ["👤 Ops Operator", "⚠ Risk Controller"]
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
      sectionTitle: "与 AI 一起工作",
      sectionSubtitle: "发现收入、转化或成本异常后，蝴蝶效应会自动检查相关指标，定位关键根因，并给出带证据链的行动建议。",
      eyebrow: "",
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

function normalizeRoleName(role: string) {
  return role.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function roleInitials(role: string) {
  const normalized = normalizeRoleName(role);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "AI";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

const businessCaseSignals = [
  { channel: "TikTok", icon: "🚀", value: "+42%", zh: "爆发增长", en: "Explosive growth", tone: "green" },
  { channel: "Amazon", icon: "📉", value: "-18%", zh: "广告亏损扩大", en: "Ad loss widening", tone: "red" },
  { channel: "Shopify", icon: "🔁", value: "82%", zh: "复购表现健康", en: "Healthy repeat purchase", tone: "blue" }
] as const;

const businessCaseRecommendations = [
  { zh: "降低 Amazon（SKU 9）广告投放 15–25%", en: "Reduce Amazon (SKU 9) ad spend by 15–25%" },
  { zh: "检查 iOS 落地页转化率", en: "Review iOS landing page conversion rate" },
  { zh: "扩大 Shopify（SKU 1992）复购库存", en: "Increase Shopify (SKU 1992) retention inventory" }
] as const;

function signalToneClass(tone: (typeof businessCaseSignals)[number]["tone"]) {
  if (tone === "green") {
    return {
      card: "bg-emerald-50/70 ring-emerald-100",
      status: "bg-emerald-100 text-emerald-800",
      icon: "bg-emerald-100 text-emerald-900"
    };
  }

  if (tone === "red") {
    return {
      card: "bg-rose-50/65 ring-rose-100",
      status: "bg-rose-100 text-rose-700",
      icon: "bg-rose-100 text-rose-700"
    };
  }

  return {
    card: "bg-sky-50/65 ring-sky-100",
    status: "bg-sky-100 text-sky-800",
    icon: "bg-sky-100 text-sky-800"
  };
}

function BusinessCaseAnalysisCard({ compact = false, isZh = false }: { compact?: boolean; isZh?: boolean }) {
  const labels = {
    case: isZh ? "业务案例" : "Business case",
    title: isZh ? "哪些问题正在拖累利润？" : "What issues are dragging profit?",
    live: isZh ? "AI 实时判断" : "AI live judgment",
    signals: isZh ? "渠道信号" : "Channel signals",
    window: isZh ? "7 天窗口" : "7-day window",
    diagnosis: isZh ? "AI 诊断" : "AI diagnosis",
    diagnosisText: isZh
      ? "美国 iOS 用户转化下降，Amazon SKU 9 是持续亏损的投放中心，Shopify（SKU 1992）复购是唯一稳定利润。"
      : "U.S. iOS conversion is declining. Amazon SKU 9 is the persistent loss-making ad center, while Shopify (SKU 1992) repeat purchase is the only stable profit source.",
    tags: isZh ? ["iOS 转化下降", "SKU 9 亏损", "SKU 1992 稳定利润"] : ["iOS conversion down", "SKU 9 loss center", "SKU 1992 stable profit"],
    actions: isZh ? "建议动作" : "Recommended actions",
    confidence: isZh ? "置信度：82%" : "Confidence: 82%"
  };

  return (
    <article
      className={cn(
        "group w-full rounded-2xl bg-white p-3.5 shadow-[0_22px_72px_rgba(15,23,42,0.10)] ring-1 ring-slate-900/[0.06] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_84px_rgba(15,23,42,0.14)]",
        compact ? "mt-5" : "mx-auto max-w-[500px]"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{labels.case}</p>
          <h3 className="mt-1.5 text-xl font-semibold leading-tight tracking-normal text-slate-950 sm:text-[1.35rem]">
            {labels.title}
          </h3>
        </div>
        <span className="shrink-0 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] sm:mr-10">
          {labels.live}
        </span>
      </div>

      <section className="mt-3.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{labels.signals}</p>
          <p className="text-xs font-medium text-slate-400">{labels.window}</p>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {businessCaseSignals.map((signal) => {
            const tone = signalToneClass(signal.tone);

            return (
              <div key={signal.channel} className={cn("rounded-2xl p-2.5 ring-1", tone.card)}>
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("grid size-7 place-items-center rounded-xl text-sm", tone.icon)}>{signal.icon}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", tone.status)}>
                    {signal.value}
                  </span>
                </div>
                <p className="mt-2 text-[13px] font-semibold leading-5 text-slate-950">{signal.channel}</p>
                <p className="text-xs leading-5 text-slate-600">{isZh ? signal.zh : signal.en}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-3 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-emerald-50/60 p-3 ring-1 ring-emerald-100/80">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{labels.diagnosis}</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-950">
              {labels.diagnosisText}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {labels.tags.map((item) => (
                <span key={item} className="rounded-full bg-white/85 px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-emerald-100/80">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{labels.actions}</p>
          <p className="text-xs font-semibold text-emerald-700">{labels.confidence}</p>
        </div>
        <div className="mt-2 space-y-1.5">
          {businessCaseRecommendations.map((action) => (
            <div key={action.zh} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.045)] ring-1 ring-slate-900/[0.05]">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                <ArrowRight className="size-3.5" />
              </span>
              <p className="text-sm font-medium leading-5 text-slate-800">{isZh ? action.zh : action.en}</p>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function HeroPreviewCardMobile({ isZh }: { isZh: boolean }) {
  return <BusinessCaseAnalysisCard compact isZh={isZh} />;
}

function HeroVisualization({ isZh }: { isZh: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-[520px] lg:mx-0">
      <div className="absolute inset-[-24px] rounded-[44px] bg-gradient-to-br from-[#9dd8b8]/50 via-[#eef8f2]/75 to-[#aacfc1]/40 blur-3xl" />
      <div className="butterfly-float absolute -right-4 -top-7 z-20 grid size-12 place-items-center rounded-[20px] bg-white/90 text-emerald-800 shadow-[0_20px_60px_rgba(6,78,59,0.16)] ring-1 ring-white/80 backdrop-blur">
        <BrainCircuit className="size-5" />
      </div>
      <div className="relative z-10">
        <BusinessCaseAnalysisCard isZh={isZh} />
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

function FeatureCards({ copy }: { copy: HomeCopy["features"] }) {
  const scrollingCards = [...copy.cards, ...copy.cards];

  return (
    <section id="alerts" className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-12">
      {copy.eyebrow || copy.title ? (
        <div className="mb-6">
          <div>
            {copy.eyebrow ? (
              <p className="text-xs font-medium text-emerald-700 sm:text-sm">{copy.eyebrow}</p>
            ) : null}
            {copy.title ? (
              <h2 className="mt-2 max-w-4xl text-2xl font-semibold leading-tight tracking-normal text-slate-950 sm:text-3xl">
                {copy.title}
              </h2>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="feature-card-marquee -mx-5 overflow-x-auto px-5 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden">
        <div className="feature-card-track flex gap-4 pr-4">
        {scrollingCards.map((card, index) => {
          const cardIndex = index % copy.cards.length;
          const meta = featureMeta[cardIndex];
          return (
            <div
              key={`${card.title}-${index}`}
              aria-hidden={index >= copy.cards.length}
              className={cn(
                "feature-card-reveal group relative min-h-[172px] w-[82vw] shrink-0 overflow-hidden rounded-3xl border border-white/70 p-4 shadow-[0_16px_50px_rgba(15,23,42,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_70px_rgba(6,78,59,0.13)] sm:w-[360px] lg:w-[380px]",
                meta.className
              )}
              style={{ "--feature-card-delay": `${cardIndex * 120}ms` } as React.CSSProperties}
            >
              <div className="mb-6 grid size-9 place-items-center rounded-2xl bg-white/85 text-slate-950 shadow-sm transition duration-300 group-hover:scale-105 group-hover:text-emerald-800">
                <meta.icon className="size-4" />
              </div>
              <h3 className="text-base font-semibold text-slate-950 sm:text-lg">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{card.text}</p>
            </div>
          );
        })}
        </div>
      </div>
    </section>
  );
}

function UseCaseSection({ copy }: { copy: HomeCopy["useCases"] }) {
  const isZh = copy.title === "不同团队如何使用蝴蝶效应";
  const labels = {
    team: isZh ? "团队角色" : "Team act"
  };

  return (
    <section className="mx-auto max-w-7xl px-5 py-9 sm:px-8 sm:py-12">
      <div className="mb-6 max-w-3xl">
        <p className="text-xs font-medium text-emerald-700 sm:text-sm">
          {isZh ? "AI Operating Stories" : "AI operating stories"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          {copy.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">{copy.subtitle}</p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        {copy.cards.map((card, index) => {
          const Icon = useCaseIcons[index];
          const avatar = useCaseAvatars[index];
          const theme = useCaseThemes[index];

          return (
            <article
              key={card.title}
              className={cn(
                "group relative flex min-w-0 flex-col overflow-visible rounded-[28px] p-4 shadow-[0_16px_48px_rgba(15,23,42,0.05)] ring-1 transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_64px_rgba(15,23,42,0.08)] lg:min-h-[270px]",
                theme.card,
                useCaseLayout[index]
              )}
            >
              <div className={cn("absolute left-8 top-[-9px] size-5 rotate-45 ring-1", theme.card)} />
              <div className="pointer-events-none absolute right-5 top-5 size-16 rounded-full bg-white/35 blur-2xl" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn("relative grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br text-xs font-bold shadow-[0_10px_26px_rgba(15,23,42,0.08)] ring-1 ring-white/80", avatar.className)}>
                    {avatar.face}
                    <span className="absolute -right-0.5 bottom-1 size-2.5 rounded-full border-2 border-white bg-emerald-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{avatar.role}</p>
                    <span className={cn("mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1", theme.pill)}>
                      {card.title}
                    </span>
                  </div>
                </div>
                <div className={cn("hidden size-8 shrink-0 place-items-center rounded-2xl ring-1 transition sm:grid", theme.icon)}>
                  <Icon className="size-3.5" />
                </div>
              </div>

              <div className="relative mt-5 rounded-[22px] bg-white/55 px-4 py-4 ring-1 ring-white/70">
                <blockquote className="text-[0.95rem] font-medium leading-7 tracking-normal text-slate-800 sm:text-[0.98rem]">
                  <span className="mr-1 text-xl font-semibold leading-none text-emerald-700/35">“</span>
                  {card.persona}
                  <span className="ml-1 text-xl font-semibold leading-none text-emerald-700/35">”</span>
                </blockquote>
              </div>

              <div className="relative mt-auto pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{labels.team}</p>
                <div className="mt-2 rounded-2xl bg-white/58 p-2.5 ring-1 ring-white/80">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex -space-x-2">
                      {card.roles.map((role, roleIndex) => (
                        <div
                          key={`${role}-avatar`}
                          className={cn(
                            "relative grid size-8 place-items-center rounded-full bg-gradient-to-br text-[10px] font-semibold shadow-[0_8px_20px_rgba(15,23,42,0.08)] ring-2 ring-white",
                            personaAvatarStyles[(index + roleIndex) % personaAvatarStyles.length]
                          )}
                          title={normalizeRoleName(role)}
                        >
                          {roleInitials(role)}
                          <span className="absolute -right-0.5 bottom-0 size-2.5 rounded-full border-2 border-white bg-emerald-500" />
                        </div>
                      ))}
                    </div>
                    <span className="rounded-full bg-slate-950/5 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                      {isZh ? "协作中" : "active"}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1.5">
                    {card.roles.map((role, roleIndex) => (
                      <div key={role} className="flex items-center gap-2 rounded-xl bg-white/62 px-2 py-1.5 ring-1 ring-slate-900/[0.04]">
                        <span
                          className={cn(
                            "grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[9px] font-semibold ring-1",
                            personaAvatarStyles[(index + roleIndex) % personaAvatarStyles.length]
                          )}
                        >
                          {roleInitials(role)}
                        </span>
                        <span className="min-w-0 truncate text-xs font-medium text-slate-700">
                          {normalizeRoleName(role)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mx-auto mt-12 max-w-3xl text-center lg:mt-20">
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
  const isZh = copy.sectionTitle === "与 AI 一起工作";
  const flow = {
    alert: {
      label: isZh ? "🔴 下降" : "🔴 Drop",
      title: isZh ? "本周收入下降 12.4%" : "Revenue dropped 12.4% this week",
      text: isZh ? "高影响异常，已进入 AI 调查链路。" : "High-impact anomaly entered the AI investigation flow."
    },
    diagnosis: {
      label: isZh ? "🟡 分析中" : "🟡 Investigating",
      title: isZh
        ? "AI 判断：CAC 上升 + 留存下降正在拉低增长"
        : "AI judgment: rising CAC + retention decline are pulling growth down",
      text: isZh ? "问题集中在获客质量和二周留存。" : "The issue is concentrated in acquisition quality and week-2 retention."
    },
    evidence: [
      { metric: "CAC", before: "12%", after: "18%", tone: "up" },
      { metric: "Retention Week 2", before: "稳定", after: "-9%", tone: "down" },
      { metric: "iOS conversion", before: "正常", after: isZh ? "下降" : "down", tone: "down" }
    ],
    actions: isZh
      ? ["降低低 ROI 渠道投放", "优化获客结构", "复查 Week 2 留存路径"]
      : ["Reduce low-ROI channel spend", "Optimize acquisition mix", "Review Week 2 retention path"]
  };
  const aiOps = isZh
    ? ["AI 正在分析渠道 ROI", "已分析 24 个指标", "正在对比二周留存", "正在检查 iOS 转化", "正在识别高影响异常"]
    : ["AI is analyzing channel ROI", "24 metrics analyzed", "Comparing Week 2 retention", "Checking iOS conversion", "Detecting high-impact anomalies"];

  return (
    <section id="investigations" className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
      <div className="mb-6 max-w-3xl">
        {copy.eyebrow ? (
          <p className="text-xs font-medium text-emerald-700 sm:text-sm">{copy.eyebrow}</p>
        ) : null}
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
          {copy.sectionTitle}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">{copy.sectionSubtitle}</p>
      </div>

      <div className="overflow-hidden rounded-[30px] bg-white p-3 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.06] sm:p-6">
        <div className="relative mx-auto max-w-4xl overflow-hidden">
          <div className="absolute bottom-4 left-4 top-5 w-px bg-gradient-to-b from-rose-200 via-amber-200 to-emerald-200 sm:left-5" />

          <div className="relative grid gap-5">
            <div className="relative grid min-w-0 gap-3 pl-11 sm:pl-14">
              <div className="absolute left-0 top-1 grid size-9 place-items-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100 sm:size-10">
                <AlertTriangle className="size-4" />
              </div>
              <div className="min-w-0 rounded-[24px] bg-rose-50/80 p-3 ring-1 ring-rose-100 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">{flow.alert.label}</span>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    {isZh ? "⚡ 高影响" : "⚡ High impact"}
                  </span>
                </div>
                <h3 className="mt-3 break-words text-xl font-semibold leading-tight text-rose-700 sm:text-3xl">{flow.alert.title}</h3>
                <p className="mt-2 text-sm leading-6 text-rose-900/70">{flow.alert.text}</p>
              </div>
            </div>

            <div className="relative grid min-w-0 gap-3 pl-11 sm:pl-14">
              <div className="absolute left-0 top-1 grid size-9 place-items-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100 sm:size-10">
                <BrainCircuit className="size-4" />
              </div>
              <div className="min-w-0 overflow-hidden rounded-[24px] bg-slate-50/90 p-3 ring-1 ring-slate-900/[0.05] sm:p-4">
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{flow.diagnosis.label}</span>
                <h3 className="mt-3 break-words text-base font-semibold leading-7 text-slate-950 sm:text-lg">{flow.diagnosis.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{flow.diagnosis.text}</p>
                <div className="mt-3 overflow-hidden rounded-2xl bg-white/80 px-3 py-2 ring-1 ring-slate-900/[0.05]">
                  <div className="ai-ops-track flex gap-2">
                    {[...aiOps, ...aiOps].map((item, index) => (
                      <span key={`${item}-${index}`} className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative grid min-w-0 gap-3 pl-11 sm:pl-14">
              <div className="absolute left-0 top-1 grid size-9 place-items-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-100 sm:size-10">
                <BarChart3 className="size-4" />
              </div>
              <div className="min-w-0 rounded-[24px] bg-white p-3 ring-1 ring-slate-900/[0.06] sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{isZh ? "证据层" : "Evidence"}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {flow.evidence.map((item) => (
                    <div key={item.metric} className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-900/[0.04]">
                      <p className="text-xs font-semibold text-slate-500">{item.metric}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                        <span>{item.before}</span>
                        <ArrowRight className="size-3.5 text-slate-400" />
                        <span className={item.tone === "up" ? "text-rose-600" : "text-emerald-700"}>{item.after}</span>
                        <span className={item.tone === "up" ? "text-rose-600" : "text-emerald-700"}>{item.tone === "up" ? "↑" : "↓"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative grid min-w-0 gap-3 pl-11 sm:pl-14">
              <div className="absolute left-0 top-1 grid size-9 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 sm:size-10">
                <Check className="size-4" />
              </div>
              <div className="min-w-0 rounded-[24px] bg-emerald-50/80 p-3 ring-1 ring-emerald-100 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{isZh ? "行动建议" : "Action"}</p>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                    {isZh ? "🟢 下一步明确" : "🟢 Stable next step"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {flow.actions.map((action) => (
                    <div key={action} className="flex min-w-0 items-center gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-emerald-100">
                      <ArrowRight className="size-4 shrink-0 text-emerald-700" />
                      <p className="break-words text-sm font-semibold leading-5 text-emerald-950">{action}</p>
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
  const primaryPlan = copy.plans[0];
  const enterprisePlan = copy.plans[1];

  return (
    <section id="pricing" className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <div className="overflow-hidden rounded-[30px] bg-gradient-to-r from-emerald-950 via-emerald-800 to-teal-700 p-5 text-white shadow-[0_24px_90px_rgba(6,78,59,0.18)] sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">{copy.eyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">{copy.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50/80">{copy.intro}</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 sm:divide-x sm:divide-white/16">
            <div className="sm:pr-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{primaryPlan.name}</h3>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800">{primaryPlan.badge}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-emerald-50/75">{primaryPlan.description}</p>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-4xl font-semibold tracking-normal">{primaryPlan.price}</span>
                <span className="pb-1 text-sm text-emerald-50/75">{primaryPlan.cadence}</span>
              </div>
              <Button asChild className="mt-4 h-10 w-full rounded-full bg-white px-3 text-xs font-semibold text-emerald-950 hover:bg-emerald-50 sm:text-[13px]">
                <Link href={`${primaryPlan.href}?from=home`}>
                  {primaryPlan.cta}
                  <ArrowRight />
                </Link>
              </Button>
            </div>

            <div className="sm:pl-5">
              <h3 className="text-lg font-semibold">{enterprisePlan.name}</h3>
              <p className="mt-2 text-sm leading-6 text-emerald-50/75">{enterprisePlan.subtitle}</p>
              <div className="mt-4 text-3xl font-semibold tracking-normal">{enterprisePlan.price}</div>
              <div className="mt-4 space-y-2">
                {enterprisePlan.features.slice(0, 3).map((feature) => (
                  <div key={feature} className="flex gap-2 text-sm leading-5 text-emerald-50/82">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-200" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <Button asChild className="mt-4 h-10 w-full rounded-full border-white/25 bg-white/10 text-sm font-semibold text-white hover:bg-white/16" variant="outline">
                <Link href={`${enterprisePlan.href}?from=home`}>
                  {enterprisePlan.cta}
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Integrations({ copy }: { copy: HomeCopy["integrations"] }) {
  return (
    <section id="sources" className="mx-auto max-w-7xl px-5 pb-14 pt-10 sm:px-8">
      <div className="overflow-hidden rounded-[32px] bg-[#e84824] py-7 shadow-[0_24px_90px_rgba(190,55,24,0.18)]">
        <div className="mb-6 flex flex-col gap-2 px-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70 sm:text-sm">{copy.eyebrow}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl">{copy.title}</h2>
          </div>
          <Database className="hidden size-7 text-white/80 sm:block" />
        </div>
        <div className="space-y-4">
          {integrationRows.map((row, rowIndex) => (
            <div key={rowIndex} className={cn("integration-marquee overflow-hidden", rowIndex % 2 === 1 && "integration-marquee-reverse")}>
              <div className="integration-marquee-track flex gap-4 px-5 sm:px-7">
                {[...row, ...row].map((integration, index) => (
                  <div
                    key={`${integration.name}-${rowIndex}-${index}`}
                    className="flex h-14 shrink-0 items-center gap-3 rounded-2xl bg-white/94 px-5 text-slate-900 shadow-[0_10px_30px_rgba(94,24,12,0.16)] ring-1 ring-white/70"
                    aria-hidden={index >= row.length}
                  >
                    <span className={cn("grid size-8 place-items-center rounded-xl text-xs font-bold", integration.tone)}>
                      {integration.mark}
                    </span>
                    <span className="text-sm font-semibold sm:text-base">{integration.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Homepage({ defaultLocale = "en" }: { defaultLocale?: Locale }) {
  const [locale, setLocale] = useLocale(defaultLocale);
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

      <section className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-10 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:gap-12 lg:px-8 lg:pb-14 lg:pt-18">
        <div className="absolute left-0 right-0 top-0 -z-0 hidden h-px bg-gradient-to-r from-transparent via-emerald-900/40 to-transparent lg:block" />
        <div className="relative z-10">
          <div className="mb-7 inline-flex max-w-full items-center gap-2 rounded-full border border-[#9fcdb5]/80 bg-[#d8efe3]/80 px-3 py-1.5 text-xs font-medium text-emerald-950 sm:text-sm lg:mb-7 lg:text-xs">
            <Zap className="size-3.5 sm:size-4" />
            {copy.hero.eyebrow}
          </div>
          <h1
            className="max-w-2xl text-[2.45rem] font-black leading-[1.02] tracking-normal text-slate-950 sm:text-[3.4rem] lg:text-[3.18rem] lg:leading-[1.02]"
          >
            {isZh ? (
              <span className="block">
                <span className="hero-title-shimmer block">提前识别</span>
                <span className="mt-0.5 block">
                  <span className="hero-title-shimmer inline-block">增长机会</span>
                  <span className="hero-title-shimmer mx-2 inline-block">与</span>
                  <span className="hero-title-shimmer inline-block">业务风险</span>
                </span>
              </span>
            ) : (
              <span className="hero-title-shimmer">{copy.hero.headline}</span>
            )}
          </h1>
          {copy.hero.subheadline ? (
            <p className="mt-6 max-w-xl text-base leading-[1.7] text-slate-600 lg:mt-6 lg:text-[1.02rem] lg:leading-8">
              <span className="lg:hidden">{copy.hero.subheadline}</span>
              <span className="hidden lg:inline">{copy.hero.subheadline}</span>
            </p>
          ) : null}
          <div className="mt-9 flex flex-col gap-3 sm:flex-row lg:mt-9">
            <Button asChild className="h-12 w-full rounded-full bg-slate-950 px-5 text-sm text-white hover:bg-slate-800 sm:w-auto lg:h-10">
              <Link href="/consulting">
                {copy.hero.primaryCta}
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 w-full rounded-full border-slate-200 bg-white/70 px-5 text-sm sm:w-auto lg:h-10">
              <Link href="/sign-up">
                {copy.hero.secondaryCta}
                <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="mt-7 hidden flex-col gap-3 sm:flex-row sm:items-center sm:gap-5 lg:flex">
            {copy.hero.trust.map((item) => (
              <TrustItem key={item}>{item}</TrustItem>
            ))}
          </div>
          <div className="lg:hidden">
            <HeroPreviewCardMobile isZh={isZh} />
          </div>
        </div>

        <div className="relative z-10 hidden lg:flex lg:justify-end">
          <HeroVisualization isZh={isZh} />
        </div>

      </section>

      <FeatureCards copy={copy.features} />
      <UseCaseSection copy={copy.useCases} />
      <InvestigationPreview copy={copy.investigation} />
      <ReportsSection copy={copy.reports} />
      <Integrations copy={copy.integrations} />
      <PricingSection copy={copy.pricing} />
    </main>
  );
}
