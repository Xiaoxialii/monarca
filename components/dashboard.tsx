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
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Overview", icon: BarChart3, active: true },
  { label: "Sources", icon: Database },
  { label: "AI chat", icon: MessageSquare },
  { label: "Insights", icon: Sparkles },
  { label: "Reports", icon: FileText },
  { label: "Settings", icon: Settings }
];

const segmentData = [
  { name: "Product", value: 42 },
  { name: "Sales", value: 31 },
  { name: "Success", value: 18 },
  { name: "Finance", value: 24 }
];

const insights = [
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
];

const sources = [
  { name: "Stripe", type: "Revenue", rows: "1.2M", status: "Synced" },
  { name: "HubSpot", type: "CRM", rows: "428K", status: "Synced" },
  { name: "Snowflake", type: "Warehouse", rows: "8.7M", status: "Syncing" },
  { name: "Amplitude", type: "Product", rows: "3.4M", status: "Synced" }
];

const metrics = [
  { label: "ARR", value: "$18.4M", delta: "+12.8%", icon: LineChart },
  { label: "Active sources", value: "28", delta: "+4", icon: Cable },
  { label: "Insights shipped", value: "142", delta: "+31%", icon: BrainCircuit },
  { label: "Forecast accuracy", value: "94.2%", delta: "+2.1%", icon: Activity }
];

function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-white/72 px-3 py-4 backdrop-blur lg:block">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">蝴蝶效应</p>
          <p className="text-xs text-muted-foreground">Analytics OS</p>
        </div>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => (
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
          <p className="text-sm font-medium">AI run status</p>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          17 models monitored, 4 investigations queued, 99.98% pipeline uptime.
        </p>
      </div>
    </aside>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/86 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <PanelLeft />
        </Button>
        <div className="hidden min-w-0 flex-1 md:block">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search metrics, customers, sources..." />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
            <Plus />
            New source
          </Button>
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell />
          </Button>
          <AuthControls />
        </div>
      </div>
    </header>
  );
}

function MetricGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
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

function SegmentChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Insight volume</CardTitle>
        <CardDescription>Signals grouped by team workflow</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={segmentData} margin={{ left: -20, right: 4, top: 10 }}>
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

function ChatPanel() {
  return (
    <Card className="min-h-[420px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Ask your data</CardTitle>
            <CardDescription>Context-aware analysis across connected sources</CardDescription>
          </div>
          <Badge variant="success">Live</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex h-[340px] flex-col gap-3">
        <div className="flex gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Bot className="size-4" />
          </div>
          <div className="rounded-lg bg-secondary p-3 text-sm leading-6">
            Revenue growth is being carried by enterprise expansion. The main constraint is paid acquisition efficiency.
          </div>
        </div>
        <div className="ml-auto max-w-[86%] rounded-lg bg-primary p-3 text-sm leading-6 text-primary-foreground">
          Which accounts should success prioritize this week?
        </div>
        <div className="flex gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Bot className="size-4" />
          </div>
          <div className="rounded-lg bg-secondary p-3 text-sm leading-6">
            Prioritize 18 accounts with rising usage and unresolved billing stakeholders. I drafted a segment in HubSpot.
          </div>
        </div>
        <div className="mt-auto flex gap-2">
          <Input placeholder="Ask about ARR, churn, pipeline..." />
          <Button size="icon" aria-label="Send message">
            <Send />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightFeed() {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Insight feed</CardTitle>
          <CardDescription>Ranked actions from the AI analyst</CardDescription>
        </div>
        <Button variant="ghost" size="sm">
          View all
          <ArrowUpRight />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((insight) => (
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

function SourceManagement() {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Data sources</CardTitle>
          <CardDescription>Connected systems and sync health</CardDescription>
        </div>
        <Button variant="outline" size="sm">
          <Plus />
          Add
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sources.map((source) => (
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
              <Badge variant={source.status === "Synced" ? "success" : "warning"}>
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
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Header />
        <main className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 lg:px-6">
          <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary">AI dashboard</Badge>
                <Badge variant="success">Autopilot enabled</Badge>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Revenue intelligence workspace
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Unified metrics, live AI analysis, source health, and operational insights for modern teams.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <FileText />
                Export
              </Button>
              <Button>
                <Sparkles />
                Run analysis
              </Button>
            </div>
          </section>
          <MetricGrid />
          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <InsightFeed />
            <ChatPanel />
          </section>
          <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <SegmentChart />
            <SourceManagement />
          </section>
        </main>
      </div>
    </div>
  );
}
