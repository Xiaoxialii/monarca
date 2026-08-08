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
  { icon: Database, className: "bg-[#eee8dc] text-[#40382c]" },
  { icon: AlertTriangle, className: "bg-lime-100/75" },
  { icon: ListChecks, className: "bg-teal-100/80" },
  { icon: TrendingUp, className: "bg-[#0f5f49] text-emerald-50" }
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
      { label: "Profit Optimization", href: "#investigations" },
      { label: "Alerts", href: "#alerts" }
    ],
    auth: {
      login: "Log in",
      getStarted: "Get started"
    },
    hero: {
      eyebrow: "Ecommerce Profit Optimization System",
      headline: "AI Profit Optimization System",
      subheadline: "Connect data. Execute optimal profit decisions",
      teamLabel: "Three-layer profit control that turns data changes into operating actions",
      team: [
        { role: "Find growth opportunities earlier", text: "Identify high-potential signals, abnormal shifts, and key growth windows before the team misses them." },
        { role: "Spot risk and loss faster", text: "Detect profit drops, inefficient spend, inventory risk, and operating anomalies before they create avoidable loss." },
        { role: "Output optimal operating decisions", text: "Recommend what to adjust next based on budget, inventory, and gross-margin constraints." }
      ],
      primaryCta: "Book consultation",
      secondaryCta: "View Demo",
      trust: ["Profit diagnosis", "Scenario simulation", "Optimal decisions"]
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
      eyebrow: "",
      title: "",
      cards: [
        {
          title: "Build Your Profit Intelligence Layer",
          text: "Connect ecommerce, advertising, inventory, and operational data into a unified view of your business and SKU-level profitability."
        },
        {
          title: "Understand What Drives Profit",
          text: "Analyze products, customers, channels, costs, and operational constraints to identify what is truly driving or hurting profitability."
        },
        {
          title: "Simulate Thousands of Strategies",
          text: "Evaluate thousands of possible business scenarios across advertising spend, inventory allocation, pricing, and SKU portfolio decisions to find the most profitable path."
        },
        {
          title: "Execute & Optimize Continuously",
          text: "Receive AI-powered recommendations with expected profit impact, track real-world outcomes, and continuously improve decisions through a closed-loop system."
        }
      ]
    },
    useCases: {
      title: "How different teams use Monarca AI",
      subtitle: "",
      consultTitle: "Want to see what profit opportunities your data can reveal?",
      consultText: "",
      consultCta: "Book consultation",
      cards: [
        {
          title: "Ecommerce team",
          persona:
            "Monarca AI helps us see which SKUs are truly profitable, which ads are wasting budget, and which inventory is creating risk.",
          scene: "",
          insight: "Monarca AI identifies the real profit sources directly.",
          action: "Know faster which products are worth scaling.",
          roles: ["🛒 Ecommerce Operator", "🚀 Growth Analyst"]
        },
        {
          title: "Executive team",
          persona:
            "Monarca AI turns scattered operating data into profit decisions, so we quickly know where we are making money, where we are losing money, and what to do next.",
          scene: "",
          insight: "Monarca AI automatically turns complex changes into key points.",
          action: "The team completes reviews and decisions faster.",
          roles: ["👔 Executive", "📊 Business Analyst"]
        },
        {
          title: "Operations team",
          persona:
            "Sales, ads, inventory, and costs change every day, but it is hard to know what to handle first. Monarca AI diagnoses profit anomalies, simulates options, and outputs the best execution action.",
          scene: "",
          insight: "Monarca AI locates anomalies and ranks priorities first.",
          action: "Then it turns the issue into a clear executable task.",
          roles: ["👤 Ops Operator", "⚠ Risk Controller"]
        }
      ]
    },
    system: {
      eyebrow: "Why teams need it",
      title: "Growth teams have dashboards. Profit teams need a control system",
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
      sectionTitle: "AI Profit Optimization Engine",
      sectionSubtitle:
        "After revenue, conversion, cost, or inventory anomalies appear, Monarca AI diagnoses profit drivers, simulates cross-channel scenarios, and outputs the optimal operating decision.",
      eyebrow: "",
      title: "Revenue dropped 12.4%",
      evidenceTitle: "Driver chain",
      evidenceMetric: "Revenue dropped 18%",
      evidenceDrivers: ["iOS conversion declined", "CAC increased", "Retention Week 2 dropped"],
      confidenceLabel: "Confidence",
      confidenceValue: "82%",
      whyLabel: "Why AI believes this",
      timeline: [
        ["08:42", "System detected a revenue anomaly"],
        ["08:43", "Compared cohorts, campaigns, billing events, and product activation"],
        ["08:45", "Generated profit-control decision and expected impact"]
      ],
      steps: [
        {
          title: "AI diagnosed profit drivers",
          text: "Revenue, activation, traffic quality, billing errors, and expansion pipeline were reviewed"
        },
        {
          title: "Identified root causes",
          text: "The drop was traced to CAC inflation, checkout friction, and late-stage pipeline compression"
        },
        {
          title: "Optimized operating decisions",
          text: "Outputs budget, channel, inventory, and SKU-level decisions with expected profit impact"
        }
      ]
    },
    reports: {
      sectionEyebrow: "Team-specific control briefs",
      eyebrow: "Control brief",
      title: "A daily profit-control brief that writes itself",
      intro: "Decision summaries, owner updates, and impact tracking are generated from the same control loop your team already uses",
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
      title: "AI profit optimization pricing",
      intro:
        "Monarca is not a dashboard tool. It is an AI profit optimization system built to identify, simulate, and track measurable ecommerce profit decisions.",
      plans: [
        {
          name: "Starter",
          subtitle: "For ecommerce companies with fewer than 1,000 SKUs",
          price: "$500",
          cadence: "/ month",
          billingNote: "SKU-level profitability visibility for growing ecommerce teams",
          badge: "Starter",
          description:
            "For growing ecommerce teams that need SKU-level profitability visibility and AI-driven optimization.",
          features: [
            "Connect ecommerce data sources",
            "SKU profitability analysis",
            "Product portfolio insights",
            "AI-generated business recommendations",
            "Basic profit and inventory alerts"
          ],
          cta: "Start Profit Analysis",
          href: "/sign-up"
        },
        {
          name: "Performance-Based",
          subtitle: "For teams that want pricing aligned with measurable business impact",
          price: "Base fee + 5%",
          cadence: " of incremental profit",
          billingNote: "Monarca shares the upside by charging based on measured profit improvement",
          badge: "Aligned incentives",
          description:
            "Pay based on the profit decisions Monarca helps you make.",
          features: [
            "Profit optimization recommendations",
            "Scenario simulation",
            "Advertising budget optimization",
            "SKU portfolio optimization",
            "Performance tracking",
            "Incremental profit measurement"
          ],
          cta: "Share Success",
          href: "/consulting?plan=performance"
        },
        {
          name: "Growth",
          subtitle: "For ecommerce companies with 1,000-2,000 SKUs",
          price: "$1,000",
          cadence: "/ month",
          billingNote: "For larger SKU portfolios and more complex operational decisions",
          badge: "Portfolio scale",
          description:
            "For growing brands managing larger SKU portfolios and complex operational decisions.",
          features: [
            "Everything in Starter",
            "Advanced SKU portfolio optimization",
            "Ad spend allocation simulation",
            "Inventory investment recommendations",
            "Multi-channel analysis",
            "Advanced AI decision reports"
          ],
          cta: "Optimize Your Portfolio",
          href: "/consulting?plan=growth"
        }
      ],
      addOn: {
        eyebrow: "Value model",
        name: "Profit decision alignment",
        subtitle: "Pay based on the profit decisions Monarca helps you make",
        price: "",
        description: "Monarca measures recommendation impact so teams can connect optimization work to incremental profit.",
        features: [
          "Decision-level expected profit impact",
          "Scenario simulation before action",
          "Performance tracking after action",
          "Incremental profit measurement"
        ],
        cta: "Discuss pricing",
        href: "/consulting"
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
    logo: "Monarca AI",
    nav: [
      { label: "数据源", href: "#sources" },
      { label: "利润优化", href: "#investigations" },
      { label: "异常提醒", href: "#alerts" }
    ],
    auth: {
      login: "登录",
      getStarted: "开始使用"
    },
    hero: {
      eyebrow: "电商利润优化系统",
      headline: "AI Profit Optimization System",
      subheadline: "连接数据，执行最优利润决策",
      teamLabel: "三层利润控制，把数据变化转成经营动作",
      team: [
        { role: "更早发现增长机会", text: "识别高潜力信号、异常变化和关键增长机会，帮助团队更早把握业务窗口。" },
        { role: "更快识别风险与亏损", text: "发现利润下滑、低效投入、库存风险或业务异常，减少不必要的损失。" },
        { role: "输出最优经营决策", text: "基于预算、库存和毛利约束，给出下一步应该调整什么以及预期利润影响。" }
      ],
      primaryCta: "预约咨询",
      secondaryCta: "查看 Demo",
      trust: ["利润诊断", "方案模拟", "最优决策"]
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
      title: "",
      cards: [
        {
          title: "连接分散数据",
          text: "连接 Excel、数据库和业务系统，进入统一的利润控制系统"
        },
        {
          title: "发现增长机会",
          text: "拆解收入、利润、广告、库存和 SKU 表现，定位真正影响利润的因素"
        },
        {
          title: "生成最优决策",
          text: "围绕预算、库存、渠道和 SKU，输出带预期利润影响的经营动作"
        },
        {
          title: "追踪行动效果",
          text: "持续监控行动后的指标变化，形成数据驱动的经营闭环"
        }
      ]
    },
    useCases: {
      title: "不同团队如何使用 Monarca AI",
      subtitle: "从日常经营问题出发，把分散数据转化为可执行的经营判断。",
      consultTitle: "想知道你的数据里有哪些利润机会？",
      consultText: "",
      consultCta: "预约咨询",
      cards: [
        {
          title: "电商团队",
          persona:
            "Monarca AI 帮我们看清哪些 SKU 真正赚钱、哪些广告在浪费预算、哪些库存正在形成风险。",
          scene: "",
          insight: "Monarca AI 直接识别真实利润来源。",
          action: "更快知道哪些产品值得放大。",
          roles: ["Ecommerce Operator", "Growth Analyst"]
        },
        {
          title: "增长团队",
          persona:
            "Monarca AI 把流量、转化、复购和毛利放在一起判断，而不是只看 GMV 或 ROAS。",
          scene: "",
          insight: "Monarca AI 判断增长是否真正带来利润。",
          action: "避免把预算投向低质量增长。",
          roles: ["Growth Lead", "Performance Marketer"]
        },
        {
          title: "管理层",
          persona:
            "Monarca AI 帮我们把复杂经营数据转化成每日可执行的决策摘要。",
          scene: "",
          insight: "Monarca AI 解释业务变化背后的利润影响。",
          action: "更快决定该补货、控投放还是调整价格。",
          roles: ["Executive", "Business Analyst"]
        }
      ]
    },
    investigation: {
      sectionTitle: "AI 利润控制系统",
      sectionSubtitle: "发现收入、转化、成本或库存异常后，Monarca AI 会诊断利润驱动因素，模拟跨渠道方案，并输出最优经营决策。",
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
        ["08:45", "生成利润控制决策和预期影响"]
      ],
      steps: [
        {
          title: "AI 诊断利润驱动因素",
          text: "系统检查收入、转化、流量质量、成本和库存变化"
        },
        {
          title: "识别关键根因",
          text: "下滑主要来自 CAC 上升、结账摩擦和库存限制"
        },
        {
          title: "优化经营决策",
          text: "输出预算、渠道、库存和 SKU 层面的动作与预期利润影响"
        }
      ]
    },
    reports: {
      sectionEyebrow: "团队专属控制简报",
      eyebrow: "自动化报告",
      title: "自动生成每日利润控制简报",
      intro: "决策摘要、负责人更新和效果追踪，来自同一套利润控制循环",
      signal: "每日信号",
      status: "自动生成",
      cards: [
        ["增长简报", "今天发生了什么、为什么发生、下一步关注哪里"],
        ["行动账本", "统一记录动作、负责人、置信度和利润影响"],
        ["管理层摘要", "把可信数据转化为适合复盘和汇报的清晰解释"]
      ]
    },
    pricing: {
      eyebrow: "价格",
      title: "面向电商利润优化的三档方案",
      intro: "Monarca 不是 dashboard 工具，而是一套 AI 利润优化系统，用来识别、模拟并追踪可衡量的电商利润决策。",
      plans: [
        {
          name: "Starter",
          subtitle: "适合 SKU 少于 1,000 个的电商公司",
          price: "$500",
          cadence: "/ 月",
          billingNote: "为增长型电商团队提供 SKU 级利润可视化",
          badge: "Starter",
          description: "适合需要 SKU 级盈利能力视图和 AI 优化建议的增长型电商团队。",
          features: [
            "连接电商数据源",
            "SKU 盈利能力分析",
            "产品组合洞察",
            "AI 生成经营建议",
            "基础利润和库存提醒"
          ],
          cta: "Start Profit Analysis",
          href: "/sign-up"
        },
        {
          name: "Performance-Based",
          subtitle: "适合希望价格与可衡量业务结果对齐的电商公司",
          price: "基础费用 + 5%",
          cadence: " 增量利润",
          billingNote: "Monarca 与客户共享优化收益，按可衡量利润改善收费",
          badge: "收益对齐",
          description: "Pay based on the profit decisions Monarca helps you make.",
          features: [
            "利润优化建议",
            "方案模拟",
            "广告预算优化",
            "SKU 组合优化",
            "效果追踪",
            "增量利润衡量"
          ],
          cta: "Share Success",
          href: "/consulting?plan=performance"
        },
        {
          name: "Growth",
          subtitle: "适合拥有 1,000-2,000 个 SKU 的电商公司",
          price: "$1,000",
          cadence: "/ 月",
          billingNote: "适合更大 SKU 组合和更复杂的经营决策",
          badge: "Portfolio scale",
          description: "适合管理更大 SKU 组合和复杂运营决策的成长型品牌。",
          features: [
            "包含 Starter 的全部功能",
            "高级 SKU 组合优化",
            "广告支出分配模拟",
            "库存投资建议",
            "多渠道分析",
            "高级 AI 决策报告"
          ],
          cta: "Optimize Your Portfolio",
          href: "/consulting?plan=growth"
        }
      ],
      addOn: {
        eyebrow: "价值主张",
        name: "利润决策对齐",
        subtitle: "Pay based on the profit decisions Monarca helps you make.",
        price: "",
        description: "Monarca 会衡量建议带来的利润影响，让团队把优化工作和增量利润连接起来。",
        features: [
          "决策级预期利润影响",
          "行动前方案模拟",
          "行动后效果追踪",
          "增量利润衡量"
        ],
        cta: "咨询方案",
        href: "/consulting"
      }
    },
    integrations: {
      eyebrow: "支持的数据集成",
      title: "连接收入团队已经在使用的系统"
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
  { channel: "Amazon", icon: "📉", value: "-18%", zh: "SKU 1992 降低投放", en: "Reduce SKU 1992 spend", tone: "red" },
  { channel: "Shopify", icon: "📦", value: "P1", zh: "库存优先级提升", en: "Inventory priority up", tone: "blue" },
  { channel: "TikTok", icon: "🧪", value: "Test", zh: "维持测试投放", en: "Maintain test spend", tone: "green" }
] as const;

const businessCaseRecommendations = [
  { zh: "减少 Amazon SKU 1992 广告投放", en: "Reduce Amazon SKU 1992 ad spend" },
  { zh: "Shopify 提升库存优先级", en: "Raise Shopify inventory priority" },
  { zh: "TikTok 维持测试投放", en: "Maintain TikTok test spend" },
  { zh: "建议涨价 +5%", en: "Increase price by +5%" }
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
    case: isZh ? "利润控制" : "Profit control",
    title: isZh ? "今日最优利润策略" : "Today’s optimal profit strategy",
    live: isZh ? "AI 实时优化" : "AI live optimization",
    signals: isZh ? "跨渠道决策" : "Cross-channel decisions",
    window: isZh ? "7 天窗口" : "7-day window",
    diagnosis: isZh ? "优化层" : "Optimization layer",
    diagnosisText: isZh
      ? "系统已完成预算、库存、渠道和价格约束模拟，当前最优动作组合预计提升利润 +18.4%。"
      : "The system simulated budget, inventory, channel, and pricing constraints. The current best action set is expected to lift profit by +18.4%.",
    tags: isZh ? ["Amazon 降投放", "Shopify 保库存", "TikTok 保持测试", "价格 +5%"] : ["Amazon spend down", "Shopify inventory protected", "TikTok test maintained", "Price +5%"],
    actions: isZh ? "最优决策" : "Optimal decisions",
    confidence: isZh ? "预计利润提升：+18.4%" : "Expected profit lift: +18.4%"
  };

  return (
    <article
      className={cn(
        "group w-full min-w-0 overflow-hidden rounded-2xl bg-white p-3.5 shadow-[0_22px_72px_rgba(15,23,42,0.10)] ring-1 ring-slate-900/[0.06] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_84px_rgba(15,23,42,0.14)]",
        compact ? "mt-5 max-w-[calc(100vw-2rem)]" : "mx-auto max-w-[500px]"
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[13rem]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{labels.case}</p>
          <h3 className="mt-1.5 text-lg font-semibold leading-tight tracking-normal text-slate-950 sm:whitespace-nowrap sm:text-[1.18rem]">
            {labels.title}
          </h3>
        </div>
        <span className="max-w-full shrink-0 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] sm:mr-10">
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
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{labels.actions}</p>
          <p className="min-w-0 text-right text-xs font-semibold text-emerald-700">{labels.confidence}</p>
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

function HeroVisualization({ isZh }: { isZh: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-[520px] lg:mx-0">
      <div className="absolute inset-[-18px] rounded-[44px] bg-white/70 shadow-[0_28px_90px_rgba(15,23,42,0.08)]" />
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
  const isZh = copy.cards[0]?.title === "连接分散数据";
  const scrollingCards = [...copy.cards, ...copy.cards];

  return (
    <section id="alerts" className="mx-auto max-w-7xl px-5 pb-10 pt-2 sm:px-8 sm:pb-12 sm:pt-3">
      {copy.eyebrow || copy.title ? (
        <div className="mb-6">
          <div>
            {copy.eyebrow ? (
              <p className="text-xs font-medium text-emerald-700 sm:text-sm">{copy.eyebrow}</p>
            ) : null}
            {copy.title ? (
              <h2 className="mt-2 max-w-none text-2xl font-semibold leading-tight tracking-normal text-slate-950 sm:text-3xl xl:whitespace-nowrap">
                {copy.title}
              </h2>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="mx-auto mb-12 max-w-4xl px-1 py-8 text-center sm:mb-14 sm:py-10">
        <p className="text-xl font-semibold leading-tight tracking-normal text-slate-400 sm:text-2xl lg:text-3xl">
          {isZh ? "Monarca 连接电商与经营数据。" : "Monarca connects ecommerce and operational data."}
        </p>
        <p className="mt-2 text-xl font-semibold leading-tight tracking-normal text-slate-950 sm:text-2xl lg:text-3xl">
          {isZh
            ? "分析 SKU 级利润表现，模拟数千种经营场景，并执行利润最大化行动。"
            : "Analyzes SKU-level profitability, simulates thousands of business scenarios, and recommends profit-maximizing actions."}
        </p>
      </div>
      <p className="mb-4 px-1 text-sm font-medium text-emerald-700 sm:text-base">{isZh ? "工作方式" : "How it works"}</p>
      <div className="feature-card-marquee -mx-5 overflow-x-auto px-5 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden">
        <div className="overflow-hidden rounded-[34px] shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
          <div className="feature-card-track flex gap-0">
        {scrollingCards.map((card, index) => {
          const cardIndex = index % copy.cards.length;
          const meta = featureMeta[cardIndex];
          return (
            <div
              key={`${card.title}-${index}`}
              aria-hidden={index >= copy.cards.length}
              className={cn(
                "feature-card-reveal group relative min-h-[156px] w-[82vw] shrink-0 overflow-hidden border-y border-r border-white/70 p-5 transition duration-300 sm:w-[360px] lg:w-[390px]",
                meta.className
              )}
              style={{ "--feature-card-delay": `${cardIndex * 120}ms` } as React.CSSProperties}
            >
              <div className="mb-6 grid size-9 place-items-center rounded-2xl bg-white/85 text-slate-950 shadow-sm transition duration-300 group-hover:scale-105 group-hover:text-emerald-800">
                <meta.icon className="size-4" />
              </div>
              <p className={cn("mb-2 text-xs font-semibold uppercase tracking-[0.18em]", cardIndex === 0 || cardIndex === 3 ? "text-white/80" : "text-emerald-700/80")}>
                Step {cardIndex + 1}
              </p>
              <h3 className={cn("text-base font-semibold sm:text-lg", cardIndex === 0 || cardIndex === 3 ? "text-white" : "text-slate-950")}>{card.title}</h3>
              <p className={cn("mt-2 text-sm leading-6", cardIndex === 0 || cardIndex === 3 ? "text-white/82" : "text-slate-600")}>{card.text}</p>
            </div>
          );
        })}
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroEyebrowBadge({ label }: { label: string }) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#9fcdb5]/80 bg-[#d8efe3]/80 px-3 py-1.5 text-xs font-medium text-emerald-950 sm:text-sm">
      <Zap className="size-3.5 sm:size-4" />
      {label}
    </div>
  );
}

function SkuSimulationScene({ isZh }: { isZh: boolean }) {
  const scenarios = [
    { sku: "SKU_00479", platform: "Amazon", metric: "Inventory 558u", spend: "Ad +$140", profit: "+$12.9K", signal: "Best", className: "left-[5%] top-[24%] w-[58%] sku-float-a" },
    { sku: "SKU_00806", platform: "Shopify", metric: "Stock 170u", spend: "Hold ads", profit: "+$8.7K", signal: "Hold", className: "right-[7%] top-[43%] w-[50%] sku-float-b" },
    { sku: "SKU_01306", platform: "Meta Ads", metric: "ROAS gate", spend: "Budget +8%", profit: "+$7.4K", signal: "Scale", className: "left-[12%] top-[62%] w-[54%] sku-float-c" },
    { sku: "SKU_01588", platform: "Amazon", metric: "Coverage 45d", spend: "Test +$69", profit: "+$6.2K", signal: "Test", className: "right-[14%] top-[76%] w-[46%] sku-float-d" },
    { sku: "SKU_00085", platform: "Meta Ads", metric: "Margin 42%", spend: "Test spend", profit: "+$5.1K", signal: "Test", className: "left-[34%] top-[35%] w-[42%] sku-float-e" }
  ];

  return (
    <section className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen pb-6 pt-1 lg:pb-8">
      <div className="relative min-h-[176px] overflow-hidden bg-gradient-to-r from-[#020617] via-[#050816] to-[#020617] px-8 py-4 text-white shadow-[0_18px_56px_rgba(2,6,23,0.28)] sm:px-12 lg:min-h-[192px] lg:px-16">
        <div className="absolute inset-0 opacity-15 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200 sm:text-sm">
              {isZh ? "实时 SKU 组合优化" : "Live SKU portfolio optimizing"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-900/20 px-3 py-1.5 text-xs font-semibold text-[#047857] ring-1 ring-[#047857]/35 sm:text-sm">
              {isZh ? "利润提升 +18.4%" : "Profit lift +18.4%"}
            </span>
            <span className="rounded-full bg-cyan-300/12 px-3 py-1.5 text-xs font-semibold text-cyan-50 ring-1 ring-cyan-200/20 sm:text-sm">
              {isZh ? "运行中" : "Running"}
            </span>
          </div>
        </div>

        <div className="sku-combo-marquee relative mt-3 h-[100px] overflow-hidden sm:h-[112px]">
          <div className="sku-combo-track flex h-full w-max">
            {[0, 1].map((copyIndex) => (
              <div key={copyIndex} className="relative h-full w-screen shrink-0" aria-hidden={copyIndex === 1}>
                {scenarios.map((scenario, index) => (
                  <div
                    key={`${scenario.sku}-${copyIndex}`}
                    className={cn(
                      "sku-combo-pill absolute grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.06] px-3 py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.12)] backdrop-blur-sm",
                      scenario.className
                    )}
                    style={{ "--sku-row-delay": `${index * 150}ms` } as React.CSSProperties}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-semibold sm:text-sm">{scenario.sku}</p>
                        <span className="rounded-full bg-cyan-300/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-cyan-50">
                          {scenario.platform}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-slate-300">
                        <span>{scenario.metric}</span>
                        <span className="text-slate-500">/</span>
                        <span>{scenario.spend}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-[#047857] sm:text-sm">{scenario.profit}</p>
                    </div>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {scenario.signal}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="sku-simulation-orbit relative mt-2 h-1 rounded-full bg-white/10">
          <span className="absolute left-0 top-0 h-full w-1/3 rounded-full bg-gradient-to-r from-cyan-200 to-sky-200" />
        </div>
      </div>
    </section>
  );
}

function UseCaseSection({ copy }: { copy: HomeCopy["useCases"] }) {
  const isZh = copy.title === "不同团队如何使用 Monarca AI";
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
        {copy.subtitle ? (
          <p className="mt-3 text-sm leading-6 text-slate-500">{copy.subtitle}</p>
        ) : null}
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
        {copy.consultText ? <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">{copy.consultText}</p> : null}
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
  const isZh = copy.sectionTitle === "AI 利润控制系统";
  const flow = {
    alert: {
      label: isZh ? "利润机会" : "Profit opportunity",
      title: isZh ? "本周可控利润预计提升 18.4%" : "Controllable profit is projected to rise 18.4% this week",
      text: isZh
        ? "系统已识别高利润增长机会：不止解释变化，而是模拟最优经营动作并推动执行。"
        : "The system identified a high-profit growth opportunity: it simulates the best operating moves and turns them into action."
    },
    diagnosis: {
      label: isZh ? "机会识别" : "Opportunity detected",
      title: isZh
        ? "利润驱动因素：高毛利 SKU 需求上升、复购效率改善、Amazon 库存可承接放量"
        : "Profit drivers: high-margin SKU demand is rising, repeat efficiency improved, and Amazon inventory can absorb scale",
      text: isZh
        ? "机会来自广告效率、复购质量和高毛利 SKU 供给之间的正向联动。"
        : "The opportunity comes from the positive interaction between ad efficiency, repeat quality, and high-margin SKU supply."
    },
    evidence: [
      { metric: "Meta CAC", before: "18%", after: "12%", note: isZh ? "释放 SKU 利润率" : "unlocks SKU margin", tone: "down" },
      { metric: "Shopify Retention W2", before: isZh ? "稳定" : "stable", after: "+9%", note: isZh ? "提升 LTV" : "improves LTV", tone: "up" },
      { metric: "Amazon SKU supply", before: isZh ? "受限" : "limited", after: isZh ? "充足" : "healthy", note: isZh ? "支持利润放大" : "supports profit scaling", tone: "up" }
    ],
    decisions: isZh
      ? ["降低低 ROI 渠道投放", "优化获客结构", "复查 Week 2 留存路径"]
      : ["Reduce low-ROI channel spend", "Optimize acquisition mix", "Review Week 2 retention path"]
  };
  const aiOps = isZh
    ? ["读取 Amazon / Shopify / Ads 利润链路", "模拟利润放大方案", "确认库存和毛利空间", "计算 SKU 级净利润提升", "优化跨渠道增长分配"]
    : ["Reading Amazon / Shopify / Ads profit paths", "Simulating profit scaling scenarios", "Confirming inventory and margin headroom", "Computing SKU-level profit lift", "Optimizing cross-channel growth allocation"];
  const processSteps = isZh
    ? ["数据", "理解", "模拟", "优化", "执行", "衡量", "学习", "优化"]
    : ["DATA", "UNDERSTAND", "SIMULATE", "OPTIMIZE", "EXECUTE", "MEASURE", "LEARN", "OPTIMIZE"];
  const simulations = isZh
    ? [
        { name: "维持当前投放结构", impact: "0%", detail: "利润继续受 CAC 与库存约束压缩" },
        { name: "将 18% 预算迁移到高毛利 SKU", impact: "+18.4%", detail: "提升 Shopify + Amazon 可控净利" },
        { name: "放大高复购受众", impact: "+6.1%", detail: "增加高质量点击，扩大利润率上行空间" }
      ]
    : [
        { name: "Keep current spend mix", impact: "0%", detail: "Profit remains compressed by CAC and inventory constraints" },
        { name: "Move 18% budget to high-margin SKUs", impact: "+18.4%", detail: "Improves Shopify + Amazon controllable net profit" },
        { name: "Scale high-repeat audiences", impact: "+6.1%", detail: "Adds higher-quality clicks and expands margin upside" }
      ];
  const bestDecision = {
    title: isZh ? "最优策略：预算迁移 + 高毛利 SKU 供给保护" : "Best strategy: budget migration + high-margin SKU supply protection",
    impact: "+18.4%",
    confidence: "86%",
    constraints: isZh ? ["预算上限", "库存约束", "毛利底线"] : ["Budget cap", "Inventory constraint", "Margin floor"],
    actions: isZh
      ? [
          "从低 ROAS 广告组迁移 18% 预算到 SKU_01306 / SKU_01126",
          "TikTok 高复购人群加预算，扩大正向 ROAS",
          "Shopify 保留高毛利变体库存，优先承接新增付费流量",
          "Amazon 只放大库存充足且净利率高于 28% 的 SKU"
        ]
      : [
          "Move 18% budget from low-ROAS ad sets to SKU_01306 / SKU_01126",
          "Increase TikTok budget for high-repeat audiences with positive ROAS",
          "Reserve Shopify inventory for high-margin variants receiving incremental paid traffic",
          "Scale only Amazon SKUs with enough inventory and net margin above 28%"
        ]
  };
  const channels = isZh
    ? [
        { name: "Amazon", decision: "+12% 预算", impact: "高毛利 SKU" },
        { name: "Shopify", decision: "保护库存", impact: "承接转化" },
        { name: "Meta Ads", decision: "+18% 高效投放", impact: "扩大转化" },
        { name: "TikTok", decision: "放大高复购人群", impact: "提升利润率" }
      ]
    : [
        { name: "Amazon", decision: "+12% budget", impact: "High-margin SKUs" },
        { name: "Shopify", decision: "Protect inventory", impact: "Capture conversion" },
        { name: "Meta Ads", decision: "+18% efficient spend", impact: "Expand conversion" },
        { name: "TikTok", decision: "Scale repeat audiences", impact: "Lift margin" }
      ];

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
        <div className="relative mx-auto max-w-5xl overflow-hidden">
          <div className="absolute bottom-4 left-4 top-5 w-px bg-gradient-to-b from-emerald-200 via-sky-200 to-emerald-200 sm:left-5" />

          <div className="relative grid gap-5">
            <div className="relative grid min-w-0 gap-3 pl-11 sm:pl-14">
              <div className="absolute left-0 top-1 grid size-9 place-items-center rounded-2xl bg-slate-50 text-slate-700 ring-1 ring-slate-200 sm:size-10">
                <Zap className="size-4" />
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-[13rem_1fr] sm:items-center">
                <p className="border-l-2 border-slate-200 pl-4 font-serif text-2xl font-medium leading-tight tracking-normal text-slate-400 sm:text-3xl">
                  {isZh ? "利润优化链路" : "Profit Control Flow"}
                </p>
                <div className="min-w-0 rounded-[24px] bg-white p-3 ring-1 ring-slate-900/[0.06] sm:p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {processSteps.map((step, index) => (
                      <div key={`${step}-${index}`} className="flex items-center gap-2">
                        <div
                          className={cn(
                            "min-w-[6.8rem] rounded-2xl px-3 py-2 text-center text-[0.65rem] font-bold tracking-[0.12em] ring-1 sm:min-w-[7.4rem]",
                            index >= 6
                              ? "bg-[#0f5f49] text-emerald-50 ring-[#0f5f49]"
                              : "bg-emerald-50 text-emerald-800 ring-emerald-100"
                          )}
                        >
                          {step}
                        </div>
                        {index < processSteps.length - 1 ? (
                          <span
                            className={cn(
                              "text-sm font-black leading-none",
                              index === 6 ? "text-emerald-800" : "text-slate-400"
                            )}
                          >
                            {index === 6 ? "↺" : "→"}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative grid min-w-0 gap-3 pl-11 sm:pl-14">
              <div className="absolute left-0 top-1 grid size-9 place-items-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-amber-100 sm:size-10">
                <BrainCircuit className="size-4" />
              </div>
              <p className="border-l-2 border-slate-200 pl-4 font-serif text-2xl font-medium leading-tight tracking-normal text-slate-400 sm:text-3xl">
                {isZh ? "理解" : "UNDERSTAND"}
              </p>
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
              <p className="text-sm font-semibold leading-tight tracking-normal text-slate-950 sm:text-base">
                {isZh ? "跨渠道驱动因素" : "Cross-Channel Drivers"}
              </p>
              <div className="min-w-0 rounded-[24px] bg-white p-3 ring-1 ring-slate-900/[0.06] sm:p-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  {flow.evidence.map((item) => (
                    <div key={item.metric} className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-900/[0.04]">
                      <p className="text-xs font-semibold text-slate-500">{item.metric}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                        <span>{item.before}</span>
                        <ArrowRight className="size-3.5 text-slate-400" />
                        <span className="text-emerald-700">{item.after}</span>
                        <span className="text-emerald-700">{item.tone === "up" ? "↑" : "↓"}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative grid min-w-0 gap-3 pl-11 sm:pl-14">
              <div className="absolute left-0 top-1 grid size-9 place-items-center rounded-2xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 sm:size-10">
                <TrendingUp className="size-4" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="border-l-2 border-slate-200 pl-4 font-serif text-2xl font-medium leading-tight tracking-normal text-slate-400 sm:text-3xl">
                  {isZh ? "模拟层" : "Simulation Layer"}
                </p>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-100">
                  {isZh ? "滚动模拟中" : "Simulation running"}
                </span>
              </div>
              <div className="min-w-0 overflow-hidden rounded-[24px] bg-indigo-50/70 p-3 ring-1 ring-indigo-100 sm:p-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  {simulations.map((scenario) => (
                    <div key={scenario.name} className="rounded-2xl bg-white px-3 py-3 ring-1 ring-indigo-100">
                      <p className="text-xs font-semibold text-slate-500">{scenario.name}</p>
                      <p className={cn("mt-2 text-xl font-semibold", scenario.impact === "0%" ? "text-slate-500" : "text-emerald-700")}>{scenario.impact}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{scenario.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 overflow-hidden rounded-2xl bg-white/80 px-3 py-2 ring-1 ring-indigo-100">
                  <div className="ai-ops-track flex gap-2">
                    {[...aiOps, ...aiOps].map((item, index) => (
                      <span key={`simulation-${item}-${index}`} className="shrink-0 whitespace-nowrap rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative grid min-w-0 gap-3 pl-11 sm:pl-14">
              <div className="absolute left-0 top-1 grid size-9 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 sm:size-10">
                <Check className="size-4" />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="border-l-2 border-slate-200 pl-4 font-serif text-2xl font-medium leading-tight tracking-normal text-slate-400 sm:text-3xl">
                  {isZh ? "优化层 · 最优决策" : "Optimization Layer · Best Decision"}
                </p>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">
                  {isZh ? "预期利润 +18.4%" : "Expected profit +18.4%"}
                </span>
              </div>
              <div className="min-w-0 rounded-[24px] bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 p-3 text-white ring-1 ring-emerald-700/70 shadow-[0_18px_60px_rgba(6,78,59,0.18)] sm:p-4">
                <h3 className="break-words text-base font-semibold leading-7 text-white sm:text-lg">{bestDecision.title}</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/8 px-3 py-2 ring-1 ring-emerald-200/18">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/85 sm:text-sm">{isZh ? "利润影响" : "Profit impact"}</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-100">{bestDecision.impact}</p>
                  </div>
                  <div className="rounded-2xl bg-white/8 px-3 py-2 ring-1 ring-emerald-200/18">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/85 sm:text-sm">{isZh ? "置信度" : "Confidence"}</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{bestDecision.confidence}</p>
                  </div>
                  <div className="rounded-2xl bg-white/8 px-3 py-2 ring-1 ring-emerald-200/18">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/85 sm:text-sm">{isZh ? "约束" : "Constraints"}</p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-emerald-50">{bestDecision.constraints.join(" / ")}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {bestDecision.actions.map((action) => (
                    <div key={action} className="flex min-w-0 items-start gap-2 rounded-2xl bg-white/8 px-3 py-2 ring-1 ring-emerald-200/18">
                      <ArrowRight className="size-4 shrink-0 text-emerald-200" />
                      <p className="break-words text-sm font-semibold leading-5 text-white">{action}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {channels.map((channel) => (
                    <div key={channel.name} className="rounded-2xl bg-emerald-300/10 px-3 py-2 ring-1 ring-emerald-200/18">
                      <p className="text-xs font-semibold text-emerald-100">{channel.name}</p>
                      <p className="mt-1 text-sm font-semibold text-white">{channel.decision}</p>
                      <p className="text-xs leading-5 text-emerald-50/70">{channel.impact}</p>
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
  const isZh = copy.eyebrow === "价格";

  return (
    <section id="pricing" className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <div className="overflow-hidden rounded-[30px] bg-gradient-to-r from-emerald-950 via-emerald-800 to-teal-700 p-5 text-white shadow-[0_24px_90px_rgba(6,78,59,0.18)] sm:p-7">
        <div className="flex flex-col gap-5 py-8 text-center sm:py-10 lg:items-center">
          <p className="mx-auto max-w-2xl text-sm leading-6 text-emerald-50/80 sm:text-base">
            {isZh ? "连接你的电商、广告和库存数据，开始执行最优利润决策。" : "Connect your commerce, ads, and inventory data to generate optimal profit decisions."}
          </p>
          <Button asChild className="h-12 w-full rounded-full bg-white px-8 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 sm:w-auto">
            <Link href="/sign-up">
              {isZh ? "开始" : "Start"}
              <ArrowRight />
            </Link>
          </Button>
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
      className="min-h-screen overflow-hidden bg-[#fbfcfa] text-slate-950"
    >
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/78 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6 lg:h-14 lg:px-8">
          <div className="flex items-center gap-5">
            <Logo label={copy.logo} className="h-10 sm:h-11" />
            <div className="hidden items-center gap-3 lg:flex">
              <Button asChild className="h-10 rounded-full bg-slate-950 px-5 text-sm text-white hover:bg-slate-800">
                <Link href="/consulting">
                  {copy.hero.primaryCta}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-10 rounded-full border-slate-200 bg-white/70 px-5 text-sm text-slate-950 hover:bg-white">
                <Link href="/consulting?intent=demo">
                  {copy.hero.secondaryCta}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
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

      <div className="mx-auto flex max-w-7xl justify-center px-4 pt-6 sm:px-6 sm:pt-7 lg:px-8">
        <HeroEyebrowBadge label={copy.hero.eyebrow} />
      </div>

      <section className="hero-grid-paper relative mx-auto grid max-w-7xl gap-6 overflow-hidden px-4 pb-2 pt-6 text-center sm:px-6 sm:pb-3 sm:pt-8 lg:min-h-[405px] lg:items-center lg:overflow-visible lg:px-8 lg:pb-2 lg:pt-8">
        <div className="absolute left-0 right-0 top-0 -z-0 hidden h-px bg-gradient-to-r from-transparent via-emerald-900/40 to-transparent lg:block" />
        <div className="relative z-10 mx-auto flex w-full max-w-[calc(100vw-2rem)] flex-col items-center overflow-hidden lg:max-w-6xl lg:overflow-visible">
          <h1
            className="w-full max-w-5xl break-words text-[3rem] font-black leading-[0.98] tracking-normal text-[#063f35] [overflow-wrap:anywhere] sm:text-[4.05rem] sm:[overflow-wrap:normal] lg:text-[4.6rem] lg:leading-[0.97] xl:text-[5.15rem]"
          >
            {isZh ? (
              <span className="block">
                <span className="block text-slate-950">AI Profit Agent</span>
                <span className="hero-title-shimmer block whitespace-normal break-words [overflow-wrap:anywhere] sm:[overflow-wrap:normal]">利润优化</span>
              </span>
            ) : (
              <span className="block">
                <span className="block text-slate-950">AI Profit Agent</span>
                <span className="hero-title-shimmer block whitespace-normal break-words [overflow-wrap:anywhere] sm:[overflow-wrap:normal]">Profit Optimization</span>
              </span>
            )}
          </h1>
          {copy.hero.subheadline ? (
            <p className="mt-4 max-w-[calc(100vw-2rem)] break-words text-xl font-medium leading-[1.42] text-[#064e3b] [overflow-wrap:anywhere] sm:max-w-3xl sm:text-2xl sm:[overflow-wrap:normal] lg:mt-5 lg:text-[1.55rem] lg:leading-[1.3]">
              <span className="lg:hidden">{copy.hero.subheadline}</span>
              <span className="hidden lg:inline">{copy.hero.subheadline}</span>
            </p>
          ) : null}
          <div className="mt-4 hidden flex-col gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-5 lg:flex">
            {copy.hero.trust.map((item) => (
              <TrustItem key={item}>{item}</TrustItem>
            ))}
          </div>
        </div>

        <div className="relative z-10 hidden">
          <HeroVisualization isZh={isZh} />
        </div>

      </section>

      <SkuSimulationScene isZh={isZh} />
      <FeatureCards copy={copy.features} />
      <InvestigationPreview copy={copy.investigation} />
      <UseCaseSection copy={copy.useCases} />
      <Integrations copy={copy.integrations} />
      <PricingSection copy={copy.pricing} />
    </main>
  );
}
