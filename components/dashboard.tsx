"use client";

import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  Bot,
  BrainCircuit,
  Cable,
  CheckCircle2,
  Circle,
  Database,
  FileText,
  LineChart,
  MessageSquare,
  PanelLeft,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Table2,
  Zap
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { AuthControls } from "@/components/auth-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocale, type Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const dashboardCopy = {
  en: {
    navItems: [
      { label: "Overview", icon: BarChart3, active: true },
      { label: "Sources", icon: Database, active: false },
      { label: "AI chat", icon: MessageSquare, active: false },
      { label: "Insights", icon: Sparkles, active: false },
      { label: "Reports", icon: FileText, active: false },
      { label: "Settings", icon: Settings, active: false }
    ],
    segmentData: [
      { name: "Product", value: 42 },
      { name: "Sales", value: 31 },
      { name: "Success", value: 18 },
      { name: "Finance", value: 24 }
    ],
    insights: [
      {
        label: "Expansion signal",
        text: "Enterprise accounts with 3+ active connectors are 28% more likely to upgrade this quarter.",
        tone: "success"
      },
      {
        label: "Anomaly detected",
        text: "Paid search CAC rose 14% week over week while conversion quality stayed flat.",
        tone: "warning"
      },
      {
        label: "Forecast update",
        text: "ARR projection moved to $18.4M after late-stage pipeline velocity improved.",
        tone: "secondary"
      }
    ],
    sources: [
      { name: "Stripe", type: "Revenue", rows: "1.2M", status: "Synced" },
      { name: "HubSpot", type: "CRM", rows: "428K", status: "Synced" },
      { name: "Snowflake", type: "Warehouse", rows: "8.7M", status: "Syncing" },
      { name: "Amplitude", type: "Product", rows: "3.4M", status: "Synced" }
    ],
    metrics: [
      { label: "ARR", value: "$18.4M", delta: "+12.8%", icon: LineChart },
      { label: "Active sources", value: "28", delta: "+4", icon: Cable },
      { label: "Insights shipped", value: "142", delta: "+31%", icon: BrainCircuit },
      { label: "Forecast accuracy", value: "94.2%", delta: "+2.1%", icon: Activity }
    ],
    sidebar: {
      brand: "openAnalyst",
      subtitle: "Analytics OS",
      runStatusTitle: "AI run status",
      runStatusText: "17 models monitored, 4 investigations queued, 99.98% pipeline uptime."
    },
    header: {
      openNav: "Open navigation",
      searchPlaceholder: "Search metrics, customers, sources...",
      newSource: "New source",
      notifications: "Notifications"
    },
    chart: {
      title: "Insight volume",
      description: "Signals grouped by team workflow"
    },
    chat: {
      title: "Ask your data",
      description: "Context-aware analysis across connected sources",
      status: "Live",
      assistantMessage:
        "Revenue growth is being carried by enterprise expansion. The main constraint is paid acquisition efficiency.",
      userQuestion: "Which accounts should success prioritize this week?",
      assistantReply:
        "Prioritize 18 accounts with rising usage and unresolved billing stakeholders. I drafted a segment in HubSpot.",
      inputPlaceholder: "Ask about ARR, churn, pipeline...",
      sendLabel: "Send message"
    },
    feed: {
      title: "Insight feed",
      description: "Ranked actions from the AI analyst",
      viewAll: "View all"
    },
    sourcePanel: {
      title: "Data sources",
      description: "Connected systems and sync health",
      add: "Add",
      syncedStatus: "Synced"
    },
    hero: {
      badge: "AI dashboard",
      status: "Autopilot enabled",
      title: "Revenue intelligence workspace",
      description:
        "Unified metrics, live AI analysis, source health, and operational insights for modern teams.",
      export: "Export",
      run: "Run analysis"
    }
  },
  zh: {
    navItems: [
      { label: "概览", icon: BarChart3, active: true },
      { label: "数据源", icon: Database, active: false },
      { label: "AI 对话", icon: MessageSquare, active: false },
      { label: "洞察", icon: Sparkles, active: false },
      { label: "报告", icon: FileText, active: false },
      { label: "设置", icon: Settings, active: false }
    ],
    segmentData: [
      { name: "产品", value: 42 },
      { name: "销售", value: 31 },
      { name: "客户成功", value: 18 },
      { name: "财务", value: 24 }
    ],
    insights: [
      {
        label: "扩张信号",
        text: "已连接 3 个以上数据源的企业账户，本季度升级概率高 28%。",
        tone: "success"
      },
      {
        label: "异常检测",
        text: "付费搜索 CAC 周环比上升 14%，但转化质量没有同步提升。",
        tone: "warning"
      },
      {
        label: "预测更新",
        text: "后期销售管道推进速度改善后，ARR 预测上调至 $18.4M。",
        tone: "secondary"
      }
    ],
    sources: [
      { name: "Stripe", type: "收入", rows: "1.2M", status: "已同步" },
      { name: "HubSpot", type: "CRM", rows: "428K", status: "已同步" },
      { name: "Snowflake", type: "数据仓库", rows: "8.7M", status: "同步中" },
      { name: "Amplitude", type: "产品", rows: "3.4M", status: "已同步" }
    ],
    metrics: [
      { label: "ARR", value: "$18.4M", delta: "+12.8%", icon: LineChart },
      { label: "活跃数据源", value: "28", delta: "+4", icon: Cable },
      { label: "已生成洞察", value: "142", delta: "+31%", icon: BrainCircuit },
      { label: "预测准确率", value: "94.2%", delta: "+2.1%", icon: Activity }
    ],
    sidebar: {
      brand: "蝴蝶效应",
      subtitle: "数据操作系统",
      runStatusTitle: "AI 运行状态",
      runStatusText: "17 个模型监控中，4 个调查排队，数据管道可用率 99.98%。"
    },
    header: {
      openNav: "打开导航",
      searchPlaceholder: "搜索指标、客户、数据源...",
      newSource: "新建数据源",
      notifications: "通知"
    },
    chart: {
      title: "洞察数量",
      description: "按团队工作流聚合的信号"
    },
    chat: {
      title: "询问你的数据",
      description: "跨已连接数据源的上下文分析",
      status: "实时",
      assistantMessage: "收入增长主要由企业客户扩张带动，当前主要限制来自付费获客效率。",
      userQuestion: "本周应该优先关注哪些账户？",
      assistantReply:
        "建议优先处理 18 个使用量上升、但计费关系尚未明确的账户。我已在 HubSpot 中生成分组。",
      inputPlaceholder: "询问 ARR、流失、销售管道...",
      sendLabel: "发送消息"
    },
    feed: {
      title: "洞察流",
      description: "AI 分析师排序后的行动建议",
      viewAll: "查看全部"
    },
    sourcePanel: {
      title: "数据源",
      description: "已连接系统和同步健康状态",
      add: "添加",
      syncedStatus: "已同步"
    },
    hero: {
      badge: "AI 控制台",
      status: "自动化已开启",
      title: "增长智能工作区",
      description: "统一指标、实时 AI 分析、数据源健康状态和可转化为价值的运营洞察。",
      export: "导出",
      run: "运行分析"
    }
  }
} as const;

type DashboardCopy = (typeof dashboardCopy)[Locale];

function Sidebar({ copy }: { copy: DashboardCopy }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-white/72 px-3 py-4 backdrop-blur lg:block">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">{copy.sidebar.brand}</p>
          <p className="text-xs text-muted-foreground">{copy.sidebar.subtitle}</p>
        </div>
      </div>
      <nav className="space-y-1">
        {copy.navItems.map((item) => (
          <button
            key={item.label}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground",
              item.active && "bg-secondary text-foreground"
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="mt-6 rounded-lg border bg-background p-3">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="size-4 text-teal-600" />
          <p className="text-sm font-medium">{copy.sidebar.runStatusTitle}</p>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{copy.sidebar.runStatusText}</p>
      </div>
    </aside>
  );
}

function Header({ copy }: { copy: DashboardCopy }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/86 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={copy.header.openNav}>
          <PanelLeft />
        </Button>
        <div className="hidden min-w-0 flex-1 md:block">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder={copy.header.searchPlaceholder} />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
            <Plus />
            {copy.header.newSource}
          </Button>
          <Button variant="ghost" size="icon" aria-label={copy.header.notifications}>
            <Bell />
          </Button>
          <AuthControls />
        </div>
      </div>
    </header>
  );
}

function MetricGrid({ copy }: { copy: DashboardCopy }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {copy.metrics.map((metric) => (
        <Card key={metric.label}>
          <CardContent className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="grid size-8 place-items-center rounded-md bg-secondary">
                <metric.icon className="size-4" />
              </div>
              <Badge variant="success">{metric.delta}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{metric.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SegmentChart({ copy }: { copy: DashboardCopy }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.chart.title}</CardTitle>
        <CardDescription>{copy.chart.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...copy.segmentData]} margin={{ left: -20, right: 4, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: "rgba(15, 118, 110, 0.06)" }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))"
                }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#0f766e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function ChatPanel({ copy }: { copy: DashboardCopy }) {
  return (
    <Card className="min-h-[420px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{copy.chat.title}</CardTitle>
            <CardDescription>{copy.chat.description}</CardDescription>
          </div>
          <Badge variant="success">{copy.chat.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex h-[340px] flex-col gap-3">
        <div className="flex gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Bot className="size-4" />
          </div>
          <div className="rounded-lg bg-secondary p-3 text-sm leading-6">
            {copy.chat.assistantMessage}
          </div>
        </div>
        <div className="ml-auto max-w-[86%] rounded-lg bg-primary p-3 text-sm leading-6 text-primary-foreground">
          {copy.chat.userQuestion}
        </div>
        <div className="flex gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Bot className="size-4" />
          </div>
          <div className="rounded-lg bg-secondary p-3 text-sm leading-6">
            {copy.chat.assistantReply}
          </div>
        </div>
        <div className="mt-auto flex gap-2">
          <Input placeholder={copy.chat.inputPlaceholder} />
          <Button size="icon" aria-label={copy.chat.sendLabel}>
            <Send />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightFeed({ copy }: { copy: DashboardCopy }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{copy.feed.title}</CardTitle>
          <CardDescription>{copy.feed.description}</CardDescription>
        </div>
        <Button variant="ghost" size="sm">
          {copy.feed.viewAll}
          <ArrowUpRight />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {copy.insights.map((insight) => (
          <div key={insight.label} className="rounded-lg border bg-background p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Badge variant={insight.tone as "success" | "warning" | "secondary"}>
                {insight.label}
              </Badge>
              <Circle className="size-2 fill-current text-teal-600" />
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{insight.text}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SourceManagement({ copy }: { copy: DashboardCopy }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{copy.sourcePanel.title}</CardTitle>
          <CardDescription>{copy.sourcePanel.description}</CardDescription>
        </div>
        <Button variant="outline" size="sm">
          <Plus />
          {copy.sourcePanel.add}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {copy.sources.map((source) => (
            <div
              key={source.name}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[1.2fr_0.8fr_0.6fr_auto]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary">
                  <Table2 className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{source.name}</p>
                  <p className="text-xs text-muted-foreground sm:hidden">{source.type}</p>
                </div>
              </div>
              <p className="hidden text-sm text-muted-foreground sm:block">{source.type}</p>
              <p className="hidden text-sm text-muted-foreground sm:block">{source.rows}</p>
              <Badge variant={source.status === copy.sourcePanel.syncedStatus ? "success" : "warning"}>
                <CheckCircle2 className="mr-1 size-3" />
                {source.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const [locale] = useLocale("en");
  const copy = dashboardCopy[locale];

  return (
    <div className="flex min-h-screen" lang={locale === "zh" ? "zh-CN" : "en"}>
      <Sidebar copy={copy} />
      <div className="min-w-0 flex-1">
        <Header copy={copy} />
        <main className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 lg:px-6">
          <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary">{copy.hero.badge}</Badge>
                <Badge variant="success">{copy.hero.status}</Badge>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {copy.hero.title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {copy.hero.description}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <FileText />
                {copy.hero.export}
              </Button>
              <Button>
                <Sparkles />
                {copy.hero.run}
              </Button>
            </div>
          </section>
          <MetricGrid copy={copy} />
          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <InsightFeed copy={copy} />
            <ChatPanel copy={copy} />
          </section>
          <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <SegmentChart copy={copy} />
            <SourceManagement copy={copy} />
          </section>
        </main>
      </div>
    </div>
  );
}
