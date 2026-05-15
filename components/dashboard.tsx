"use client";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Database,
  Download,
  FileText,
  LineChart,
  PanelLeft,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Table2,
  Zap
} from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
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
      { label: "Overview", href: "/dashboard", target: "#overview", icon: BarChart3 },
      { label: "Data Sources", href: "/dashboard/import-data", target: "#import-data", icon: Database },
      { label: "Metrics", href: "/dashboard/metrics", target: "#metrics", icon: LineChart },
      { label: "Reports & Analysis", href: "/dashboard/reports", target: "#reports", icon: FileText },
      { label: "Settings", href: "/dashboard/settings", target: "#settings", icon: Settings }
    ],
    sidebar: {
      brand: "openAnalyst",
      subtitle: "Data automation OS",
      statusTitle: "Workspace status",
      statusText: "Connect data to start cleaning, mapping, and generating AI insights",
      collapseLabel: "Collapse sidebar",
      expandLabel: "Expand sidebar"
    },
    header: {
      openNav: "Open navigation",
      searchPlaceholder: "Search metrics, sources, fields...",
      newSource: "Import data",
      notifications: "Notifications"
    },
    hero: {
      badge: "First setup",
      status: "Waiting for data",
      title: "Connect your data to start AI growth analysis",
      description:
        "Import the systems your team already uses, openAnalyst will sync, clean, and map your business semantics before showing any metrics",
      primary: "Import data source",
      secondary: "View metrics architecture",
      note: "No business data is displayed until a source is connected"
    },
    metrics: {
      description: "Metric cards are ready, but values stay hidden until data is imported",
      pending: "Waiting for data",
      generated: "Generated after import",
      readinessTitle: "Metric readiness",
      readinessStatus: "0/3 complete",
      readinessDescription:
        "Values stay hidden until sources, business mapping, and data quality checks are ready",
      readinessSteps: ["Source connected", "Semantic layer mapped", "Quality checks passed"],
      cards: [
        { label: "ARR / MRR", text: "Revenue system required", icon: LineChart },
        { label: "Active users", text: "Product analytics required", icon: Activity },
        { label: "Conversion rate", text: "Funnel events required", icon: BarChart3 },
        { label: "Retention", text: "Cohort data required", icon: BrainCircuit }
      ]
    },
    metricCatalog: {
      title: "Metrics Architecture",
      description: "Define how your business is measured before AI analysis begins",
      actions: ["Connect data source", "View schema"],
      hierarchy: [
        {
          title: "Primary Metrics",
          description: "Core business outcome metrics"
        },
        {
          title: "Driver Metrics",
          description: "Metrics that explain changes in primary metrics"
        },
        {
          title: "Diagnostic Metrics",
          description: "Operational metrics mapped from raw events"
        }
      ],
      tableTitle: "Metric Definitions",
      tableDescription: "AI needs structured business semantics before analysis",
      emptyBadge: "No data imported",
      emptyTitle: "Metric layer is empty",
      emptyDescription:
        "Connect a source or import a schema to generate metric definitions, Until then, this page only explains the semantic structure AI will use",
      emptySteps: [
        "Connect business data",
        "Map fields to business terms",
        "Generate metrics for AI reasoning"
      ],
      exampleTitle: "Metric Table Example",
      exampleDescription:
        "Example structure only, Real metric definitions are generated after data import",
      exampleBadge: "Example",
      exampleHeaders: ["Business Layer", "Metric Category", "Metric Name", "Definition", "Formula", "Data Source Mapping", "AI Status"],
      exampleRows: [
        {
          layer: "Primary",
          category: "Revenue",
          metric: "ARR",
          definition: "Annualized recurring revenue from active paid accounts",
          formula: "MRR x 12",
          mapping: "Stripe subscriptions -> active recurring revenue",
          status: "AI Ready",
          tags: ["Semantic", "Revenue"]
        },
        {
          layer: "Driver",
          category: "Expansion",
          metric: "Expansion ARR",
          definition: "Additional ARR generated from existing customers",
          formula: "Upgrade ARR - Downgrade ARR",
          mapping: "CRM opportunities + billing deltas",
          status: "Needs Validation",
          tags: ["Lineage", "Suggested"]
        },
        {
          layer: "Driver",
          category: "Acquisition",
          metric: "CAC",
          definition: "Average cost to acquire one new paying customer",
          formula: "Marketing Spend / New Customers",
          mapping: "Ad platforms + CRM new customer records",
          status: "Missing Mapping",
          tags: ["Cost", "Mapping"]
        },
        {
          layer: "Driver",
          category: "Activation",
          metric: "Activation Rate",
          definition: "Share of new accounts reaching the activation event",
          formula: "Activated Users / Signups",
          mapping: "product_event = onboarding_completed",
          status: "AI Ready",
          tags: ["Event", "AI mapped"]
        },
        {
          layer: "Primary",
          category: "Retention",
          metric: "Retention",
          definition: "Share of customers or revenue retained over a period",
          formula: "Retained Customers / Starting Customers",
          mapping: "Billing status + account cohort table",
          status: "Needs Validation",
          tags: ["Cohort", "Definition"]
        }
      ],
      flowTitle: "How AI uses your metrics",
      flowDescription:
        "AI does not analyze raw dashboards directly, It reasons through semantic metric structures",
      flow: ["Raw Events", "Business Semantics", "Metric Layer", "Root Cause Engine", "AI Investigations"]
    },
    schemaPage: {
      title: "Schema & Semantic Layer",
      description: "Configure how source tables and fields become business entities for AI reasoning",
      badge: "Semantic layer not configured",
      emptyTitle: "Semantic layer workspace is empty",
      emptyDescription:
        "Connect a data source to inspect tables, fields, relationships, and quality checks before metrics are generated",
      primaryAction: "Connect data source",
      secondaryAction: "Back to metrics",
      sections: [
        { title: "Tables", text: "Source tables, views, and file tabs will appear here", icon: Table2 },
        { title: "Fields", text: "Column types, owners, and semantic meanings are validated here", icon: FileText },
        { title: "Relationships", text: "Accounts, customers, subscriptions, and events are linked here", icon: BrainCircuit }
      ],
      checklistTitle: "Schema validation flow",
      checklist: ["Import source structure", "Detect field types", "Map entities and relationships", "Prepare metric definitions"]
    },
    settingsPage: {
      title: "Settings",
      description: "Manage workspace preferences, notifications, data controls, and billing",
      workspaceTitle: "Workspace",
      workspaceDescription: "Basic identity for this analytics workspace",
      workspaceName: "Workspace name",
      workspaceSlug: "Workspace URL",
      workspaceRegion: "Data region",
      save: "Save changes",
      preferencesTitle: "Preferences",
      preferences: [
        ["Language", "Use homepage language selection"],
        ["Timezone", "Asia / Shanghai"],
        ["Default view", "Overview"]
      ],
      notificationsTitle: "Notifications",
      notifications: [
        ["Anomaly alerts", "On"],
        ["Weekly growth brief", "On"],
        ["Data sync failures", "On"]
      ],
      securityTitle: "Data & security",
      security: [
        ["Access control", "Invite teammates after data import"],
        ["API keys", "No keys created"],
        ["Data retention", "Workspace default"]
      ],
      billingTitle: "Billing",
      billingPlan: "Professional",
      billingDescription: "Report automation, data analysis, and decision support",
      billingAction: "Manage plan"
    },
    onboarding: {
      title: "Data import flow",
      description: "A guided setup path for building a clean, automated analytics workspace",
      badge: "Automated sync",
      steps: [
        {
          title: "Connect sources",
          text: "Add revenue, product, CRM, ads, and warehouse systems"
        },
        {
          title: "Map business semantics",
          text: "Define how fields map to customers, revenue, accounts, and events"
        },
        {
          title: "Clean data quality",
          text: "Detect missing fields, duplicate records, and inconsistent definitions"
        },
        {
          title: "Turn on automation",
          text: "Sync and refresh metrics automatically after setup"
        }
      ]
    },
    importData: {
      description: "Start with the systems your team already uses"
    },
    connectors: {
      title: "Connect data source",
      description: "Choose a source, validate access, then import trusted business data",
      status: "Ready",
      source: "Selected source",
      sourcePicker: "Data source",
      sources: [
        { name: "SQL Server", type: "Database", kind: "database" },
        { name: "MySQL", type: "Database", kind: "database" },
        { name: "PostgreSQL", type: "Database", kind: "database" },
        { name: "Excel / CSV", type: "File upload", kind: "file" },
        { name: "Snowflake", type: "Data warehouse", kind: "warehouse" },
        { name: "BigQuery", type: "Data warehouse", kind: "warehouse" },
        { name: "Google Analytics", type: "Analytics", kind: "app" },
        { name: "Stripe", type: "Revenue", kind: "app" }
      ],
      server: "Server",
      serverPlaceholder: "server.database.windows.net or host\\instance",
      database: "Database",
      databasePlaceholder: "Optional database name",
      workspace: "Account, project, or workspace",
      workspacePlaceholder: "Workspace, project, or account id",
      tableScope: "Tables, schema, or dataset",
      tableScopePlaceholder: "Optional tables, schema, or dataset",
      fileUpload: "Upload file",
      fileDescription: "Drop an Excel or CSV file here, or choose a file from your computer",
      mode: "Data connectivity mode",
      modes: ["Import", "DirectQuery"],
      authentication: "Authentication",
      authOptions: ["Database", "Windows", "Microsoft account"],
      username: "Username",
      password: "Password",
      gateway: "Gateway",
      gatewayValue: "Use cloud connection",
      privacyLabel: "Privacy level",
      privacyValue: "Organizational",
      advanced: "Advanced options",
      sqlStatement: "SQL statement",
      sqlPlaceholder: "Optional SQL query",
      previewTitle: "Connection preview",
      previewRows: ["Tables and views are listed after validation", "AI maps fields and checks quality after import"],
      testAction: "Test connection",
      importAction: "Connect and import"
    },
    chat: {
      title: "AI assistant",
      description: "",
      status: "Setup assistant",
      collapseLabel: "Collapse AI chat",
      expandLabel: "Expand AI chat",
      assistantMessage: "Connect revenue and product data first, I can help map fields and clean definitions",
      userQuestion: "What should I connect first?",
      assistantReply: "Start with Stripe or your revenue source, then add product analytics and CRM",
      inputPlaceholder: "Ask about data, metrics, or setup...",
      sendLabel: "Send message"
    },
    reports: {
      title: "Reports & Analysis",
      description: "Automated reports will be generated after your data sources are connected",
      pending: "Waiting for data",
      cards: [
        ["Weekly growth brief", "Summaries will appear after data is imported"],
        ["Data automation log", "Refresh, cleaning, and mapping status will be tracked here"],
        ["Executive summary", "Board-ready notes will be generated from trusted metrics"]
      ],
      pageBadge: "AI analyst live",
      pageTitle: "Executive Analysis Report",
      pageSubtitle:
        "A real-time business analyst workspace that monitors revenue, explains changes, and turns insights into operations",
      periodLabel: "Reporting period",
      periodValue: "This week",
      generatedLabel: "Generated",
      generatedValue: "After data import",
      exportAction: "Export",
      shareAction: "Share",
      liveStatuses: [
        "Syncing Stripe data",
        "Processing 4.2M events",
        "Correlating retention anomalies",
        "Executive summary updated 2 min ago"
      ],
      heroLabel: "Critical business change",
      heroMetric: "Revenue",
      heroValue: "↓18%",
      heroBaseline: "vs 4-week average",
      heroSeverity: "Largest decline in 2 months",
      heroImpact: "-$42K ARR at risk",
      heroSummary:
        "AI identified a material revenue anomaly driven by conversion, acquisition efficiency, and early retention weakness",
      businessImpactLabel: "Business impact",
      ownerLabel: "Owner",
      impactLabel: "Impact",
      previewLabel: "Template preview",
      metricsTitle: "Metric snapshot",
      metricsDescription: "",
      metricCards: [
        { label: "Revenue", value: "$184K", delta: "-12.4%", detail: "Lower than prior week" },
        { label: "Activation", value: "42.8%", delta: "-6.1%", detail: "iOS signup flow declined" },
        { label: "CAC", value: "$318", delta: "+18%", detail: "Paid search efficiency weakened" },
        { label: "Retention W2", value: "61.5%", delta: "-9%", detail: "Early cohort health softened" }
      ],
      metricTrendTitle: "Metric trend",
      timelineTitle: "Custom timeline",
      timelineStartLabel: "Start year",
      timelineEndLabel: "End year",
      timelineSelectedLabel: "Selected range",
      driverChartTitle: "Multi-dimensional driver analysis",
      dimensionCards: [
        {
          title: "Country",
          items: [
            ["United States", "34%"],
            ["Japan", "21%"],
            ["United Kingdom", "14%"]
          ]
        },
        {
          title: "User profile",
          items: [
            ["SMB self-serve", "29%"],
            ["New paid users", "24%"],
            ["Mobile-first users", "18%"]
          ]
        },
        {
          title: "Channel",
          items: [
            ["Paid search", "31%"],
            ["Affiliate", "12%"],
            ["Organic", "8%"]
          ]
        }
      ],
      healthCards: [
        {
          label: "Revenue signal",
          value: "Waiting for data",
          detail: "Connect billing or warehouse tables to populate"
        },
        {
          label: "Metric coverage",
          value: "0 ready",
          detail: "Semantic definitions generate after schema mapping"
        },
        {
          label: "Data freshness",
          value: "Not connected",
          detail: "Sync cadence starts after source validation"
        }
      ],
      chartTitle: "Growth signal trend",
      chartDescription: "Preview layout, real values appear after source connection",
      insightTitle: "Growth Analysis Report",
      reasoningTitle: "Causal reasoning map",
      reasoningDescription: "How the AI connects metric movement to likely business causes",
      evidenceTitle: "Key evidence",
      evidenceMetric: "Revenue dropped 18%",
      evidenceDrivers: ["iOS conversion declined", "CAC increased", "Retention week 2 dropped"],
      confidenceLabel: "Confidence",
      confidenceValue: "82%",
      whyLabel: "Reasoning basis",
      reasoningNodes: [
        {
          title: "Revenue down",
          delta: "-18%",
          detail: "Primary anomaly against 4-week baseline",
          children: ["iOS conversion down", "CAC up", "Retention W2 down"]
        },
        {
          title: "iOS conversion down",
          delta: "-14%",
          detail: "Onboarding completion and checkout completion both weakened",
          children: ["Onboarding completion down", "Payment completion down"]
        },
        {
          title: "CAC up",
          delta: "+18%",
          detail: "Paid search efficiency deteriorated after campaign mix shifted",
          children: ["Paid efficiency down", "Low-intent traffic up"]
        }
      ],
      trustTitle: "Confidence system",
      trustDescription: "Why this conclusion is considered enterprise-safe",
      trustItems: [
        { label: "Data completeness", value: "91%", detail: "Billing, product, and campaign events are covered" },
        { label: "Attribution reliability", value: "Medium", detail: "Paid search paths show partial attribution gaps" },
        { label: "Historical consistency", value: "High", detail: "Pattern matches prior conversion-led drops" },
        { label: "Data freshness", value: "4 min", detail: "Latest warehouse sync completed successfully" }
      ],
      insights: [
        {
          step: "01",
          title: "Data performance",
          text: "Revenue declined 12.4%, activation dropped 6.1%, CAC increased 18%, and W2 retention weakened"
        },
        {
          step: "02",
          title: "Cause analysis",
          text: "The change is mainly driven by iOS conversion decline, paid search CAC inflation, and Retention W2 softness"
        },
        {
          step: "03",
          title: "Recommended actions",
          text: "Review the iOS signup and checkout flow, tighten inefficient spend, and run a W2 risk cohort recovery play"
        }
      ],
      tableTitle: "Report sections",
      tableHeaders: ["Section", "Question answered", "Data required", "Status"],
      tableRows: [
        ["Executive summary", "What changed this week", "Primary metrics", "Waiting"],
        ["Root-cause analysis", "Why did it change", "Driver metrics", "Waiting"],
        ["Data automation", "Can the data be trusted", "Sync and quality checks", "Waiting"],
        ["Action plan", "What should the team do next", "Validated insights", "Waiting"]
      ],
      actionTitle: "Action queue",
      actions: [
        "Connect revenue, product, and CRM sources",
        "Map core fields to business semantics",
        "Generate the first automated weekly report"
      ],
      commandTitle: "Action command center",
      commandDescription: "Turn analysis into operational work across teams",
      workflows: [
        {
          label: "Create Jira ticket",
          title: "Investigate iOS payment drop",
          owner: "Product",
          priority: "High",
          impact: "+6.4% conversion recovery",
          cta: "Create ticket"
        },
        {
          label: "Launch CRM workflow",
          title: "Re-engage high-risk W2 users",
          owner: "Lifecycle",
          priority: "Medium",
          impact: "+4.8% retention lift",
          cta: "Launch workflow"
        },
        {
          label: "Adjust budget",
          title: "Reduce low-ROI paid search spend",
          owner: "Growth",
          priority: "High",
          impact: "-12% CAC exposure",
          cta: "Review budget"
        }
      ],
      memoryTitle: "AI business memory",
      memoryItems: [
        "Similar iOS checkout anomaly detected 3 weeks ago",
        "Retention decline has persisted for 4 consecutive weeks",
        "CAC spike correlates with the latest non-brand search campaign launch"
      ],
      semanticTitle: "Business semantics used",
      semanticDescription: "The AI reasons through mapped business meaning, not raw dashboard fields",
      semanticMappings: [
        ["paid_amount", "Revenue"],
        ["signup_completed", "Activation"],
        ["subscription_renewed", "Retention"]
      ]
    }
  },
  zh: {
    navItems: [
      { label: "概览", href: "/dashboard", target: "#overview", icon: BarChart3 },
      { label: "数据源", href: "/dashboard/import-data", target: "#import-data", icon: Database },
      { label: "指标", href: "/dashboard/metrics", target: "#metrics", icon: LineChart },
      { label: "报告与分析", href: "/dashboard/reports", target: "#reports", icon: FileText },
      { label: "设置", href: "/dashboard/settings", target: "#settings", icon: Settings }
    ],
    sidebar: {
      brand: "蝴蝶效应",
      subtitle: "数据自动化系统",
      statusTitle: "工作区状态",
      statusText: "连接数据后，系统会自动清洗、映射业务语义，并生成 AI 洞察",
      collapseLabel: "收起侧边栏",
      expandLabel: "展开侧边栏"
    },
    header: {
      openNav: "打开导航",
      searchPlaceholder: "搜索指标、数据源、字段...",
      newSource: "导入数据",
      notifications: "通知"
    },
    hero: {
      badge: "首次设置",
      status: "等待导入数据",
      title: "先连接数据，开启 AI 增长分析",
      description:
        "导入团队已经在使用的系统蝴蝶效应会先自动同步、清洗并映射业务语义，再开始展示指标和洞察",
      primary: "导入数据源",
      secondary: "查看指标架构",
      note: "连接数据源前，不展示任何业务数据"
    },
    metrics: {
      description: "指标卡片已准备好，但在导入数据前不显示任何数值",
      pending: "等待数据",
      generated: "导入后自动生成",
      readinessTitle: "指标准备进度",
      readinessStatus: "0/3 完成",
      readinessDescription: "连接数据源、映射业务语义并通过质量检查后，才会展示可信数值",
      readinessSteps: ["连接数据源", "完成语义层映射", "通过数据质量检查"],
      cards: [
        { label: "ARR / MRR", text: "需要连接收入系统", icon: LineChart },
        { label: "活跃用户", text: "需要连接产品分析", icon: Activity },
        { label: "转化率", text: "需要连接漏斗事件", icon: BarChart3 },
        { label: "留存率", text: "需要连接用户分群数据", icon: BrainCircuit }
      ]
    },
    metricCatalog: {
      title: "指标架构",
      description: "在 AI 分析开始前，定义业务如何被衡量",
      actions: ["连接数据源", "查看 Schema"],
      hierarchy: [
        {
          title: "核心指标",
          description: "衡量业务结果的核心指标"
        },
        {
          title: "驱动指标",
          description: "解释核心指标变化的业务杠杆"
        },
        {
          title: "诊断指标",
          description: "从原始事件映射而来的运营指标"
        }
      ],
      tableTitle: "指标定义",
      tableDescription: "AI 需要结构化的业务语义，才能进行可靠分析",
      emptyBadge: "尚未导入数据",
      emptyTitle: "指标层当前为空",
      emptyDescription:
        "连接数据源或导入 Schema 后，系统才会生成指标定义当前页面只介绍 AI 分析所需的语义结构",
      emptySteps: ["连接业务数据", "映射字段到业务语义", "生成可供 AI 推理的指标"],
      exampleTitle: "指标表示例",
      exampleDescription: "仅用于展示结构真实指标会在导入数据后生成",
      exampleBadge: "示例",
      exampleHeaders: ["业务层", "指标分类", "指标名称", "定义", "公式", "数据源映射", "AI 状态"],
      exampleRows: [
        {
          layer: "核心",
          category: "收入",
          metric: "ARR",
          definition: "当前有效付费账户的年化经常性收入",
          formula: "MRR x 12",
          mapping: "Stripe subscriptions -> active recurring revenue",
          status: "AI Ready",
          tags: ["语义层", "收入"]
        },
        {
          layer: "驱动",
          category: "扩张收入",
          metric: "Expansion ARR",
          definition: "来自存量客户升级或增购产生的新增 ARR",
          formula: "升级 ARR - 降级 ARR",
          mapping: "CRM opportunities + billing deltas",
          status: "需要验证",
          tags: ["血缘", "AI 建议"]
        },
        {
          layer: "驱动",
          category: "获客",
          metric: "CAC",
          definition: "获取一个新增付费客户的平均成本",
          formula: "营销费用 / 新增客户数",
          mapping: "广告平台 + CRM 新客户记录",
          status: "缺少映射",
          tags: ["成本", "待映射"]
        },
        {
          layer: "驱动",
          category: "激活",
          metric: "激活率",
          definition: "新账户完成关键激活事件的比例",
          formula: "已激活用户 / 注册用户",
          mapping: "product_event = onboarding_completed",
          status: "AI Ready",
          tags: ["事件", "AI 映射"]
        },
        {
          layer: "核心",
          category: "留存",
          metric: "Retention",
          definition: "统计周期内保留下来的客户或收入比例",
          formula: "留存客户 / 期初客户",
          mapping: "Billing status + account cohort table",
          status: "需要验证",
          tags: ["Cohort", "定义"]
        }
      ],
      flowTitle: "AI 如何使用指标",
      flowDescription: "AI 不直接分析原始仪表盘，而是通过结构化指标语义进行推理",
      flow: ["原始事件", "业务语义", "指标层", "根因引擎", "AI 调查"]
    },
    schemaPage: {
      title: "Schema 与语义层",
      description: "配置源数据表和字段如何转化为 AI 可理解的业务实体",
      badge: "尚未配置语义层",
      emptyTitle: "语义层工作区当前为空",
      emptyDescription:
        "连接数据源后，这里会展示数据表、字段、关系和质量检查结果，再用于生成指标定义",
      primaryAction: "连接数据源",
      secondaryAction: "返回指标",
      sections: [
        { title: "数据表", text: "源数据表、视图和文件 Sheet 会显示在这里", icon: Table2 },
        { title: "字段", text: "字段类型、所属对象和业务含义会在这里校验", icon: FileText },
        { title: "关系", text: "账户、客户、订阅和事件之间的关系会在这里建立", icon: BrainCircuit }
      ],
      checklistTitle: "Schema 校验流程",
      checklist: ["导入源结构", "识别字段类型", "映射实体和关系", "准备指标定义"]
    },
    settingsPage: {
      title: "设置",
      description: "管理工作区偏好、通知、数据控制和账单",
      workspaceTitle: "工作区",
      workspaceDescription: "当前分析工作区的基础信息",
      workspaceName: "工作区名称",
      workspaceSlug: "工作区地址",
      workspaceRegion: "数据区域",
      save: "保存更改",
      preferencesTitle: "偏好设置",
      preferences: [
        ["语言", "跟随首页语言选择"],
        ["时区", "Asia / Shanghai"],
        ["默认视图", "概览"]
      ],
      notificationsTitle: "通知",
      notifications: [
        ["异常提醒", "开启"],
        ["每周增长简报", "开启"],
        ["数据同步失败", "开启"]
      ],
      securityTitle: "数据与安全",
      security: [
        ["访问权限", "导入数据后邀请团队成员"],
        ["API Keys", "暂未创建"],
        ["数据保留", "工作区默认"]
      ],
      billingTitle: "账单",
      billingPlan: "专业版",
      billingDescription: "报告自动化、数据分析和决策辅助",
      billingAction: "管理方案"
    },
    onboarding: {
      title: "数据导入流程",
      description: "用清晰的步骤，建立一个干净、自动化的分析工作区",
      badge: "自动同步",
      steps: [
        {
          title: "连接数据源",
          text: "添加收入、产品、CRM、广告和数据仓库系统"
        },
        {
          title: "映射业务语义",
          text: "定义字段如何对应客户、收入、账户和事件"
        },
        {
          title: "清洗数据质量",
          text: "检查缺失字段、重复记录和不一致的指标定义"
        },
        {
          title: "开启自动化",
          text: "设置完成后，指标会自动同步和更新"
        }
      ]
    },
    importData: {
      description: "从团队已经在使用的系统开始"
    },
    connectors: {
      title: "连接数据源",
      description: "选择数据源，验证访问权限后导入可信业务数据",
      status: "可连接",
      source: "当前数据源",
      sourcePicker: "数据源",
      sources: [
        { name: "SQL Server", type: "数据库", kind: "database" },
        { name: "MySQL", type: "数据库", kind: "database" },
        { name: "PostgreSQL", type: "数据库", kind: "database" },
        { name: "Excel / CSV", type: "文件上传", kind: "file" },
        { name: "Snowflake", type: "数据仓库", kind: "warehouse" },
        { name: "BigQuery", type: "数据仓库", kind: "warehouse" },
        { name: "Google Analytics", type: "分析工具", kind: "app" },
        { name: "Stripe", type: "收入系统", kind: "app" }
      ],
      server: "服务器",
      serverPlaceholder: "server.database.windows.net 或 host\\instance",
      database: "数据库",
      databasePlaceholder: "可选数据库名称",
      workspace: "账户、项目或工作区",
      workspacePlaceholder: "工作区、项目或账户 ID",
      tableScope: "表、Schema 或数据集",
      tableScopePlaceholder: "可选表、Schema 或数据集",
      fileUpload: "上传文件",
      fileDescription: "拖入 Excel 或 CSV 文件，或从本地选择文件",
      mode: "数据连接模式",
      modes: ["导入", "DirectQuery"],
      authentication: "认证方式",
      authOptions: ["数据库", "Windows", "Microsoft 账户"],
      username: "用户名",
      password: "密码",
      gateway: "网关",
      gatewayValue: "使用云连接",
      privacyLabel: "隐私级别",
      privacyValue: "组织内部",
      advanced: "高级选项",
      sqlStatement: "SQL 语句",
      sqlPlaceholder: "可选 SQL 查询",
      previewTitle: "连接预览",
      previewRows: ["验证后会列出表和视图", "导入后 AI 会自动映射字段并检查数据质量"],
      testAction: "测试连接",
      importAction: "连接并导入"
    },
    chat: {
      title: "AI 对话",
      description: "",
      status: "导入前助手",
      collapseLabel: "收起 AI 对话",
      expandLabel: "展开 AI 对话",
      assistantMessage: "先连接收入和产品数据我会帮助映射字段、清洗定义，并准备洞察",
      userQuestion: "先连接什么？",
      assistantReply: "建议先接入收入系统，再补充产品分析和 CRM",
      inputPlaceholder: "询问数据、指标或设置...",
      sendLabel: "发送消息"
    },
    reports: {
      title: "报告与分析",
      description: "连接数据源后，系统会自动生成增长简报和数据自动化记录",
      pending: "等待数据",
      cards: [
        ["每周增长简报", "导入数据后，这里会自动生成摘要"],
        ["数据自动化记录", "自动同步、清洗和语义映射状态会在这里追踪"],
        ["管理层摘要", "可信指标准备好后，会自动生成汇报说明"]
      ],
      pageBadge: "AI 实时分析",
      pageTitle: "经营分析报告",
      pageSubtitle: "实时监控经营变化、解释业务原因，并把洞察转化为可创造价值的行动",
      periodLabel: "报告周期",
      periodValue: "本周",
      generatedLabel: "生成状态",
      generatedValue: "导入数据后生成",
      exportAction: "导出",
      shareAction: "分享",
      liveStatuses: [
        "正在同步 Stripe 数据",
        "正在处理 420 万事件",
        "正在关联留存异常",
        "管理层摘要已于 2 分钟前更新"
      ],
      heroLabel: "关键业务变化",
      heroMetric: "收入",
      heroValue: "↓18%",
      heroBaseline: "相比 4 周平均值",
      heroSeverity: "近 2 个月最大跌幅",
      heroImpact: "¥42K ARR 存在风险",
      heroSummary: "AI 识别到一次重要收入异常，主要由转化、获客效率和早期留存共同驱动",
      businessImpactLabel: "业务影响",
      ownerLabel: "负责人",
      impactLabel: "预期影响",
      previewLabel: "模板预览",
      metricsTitle: "指标快照",
      metricsDescription: "",
      metricCards: [
        { label: "收入", value: "¥184K", delta: "-12.4%", detail: "低于上周水平" },
        { label: "激活率", value: "42.8%", delta: "-6.1%", detail: "iOS 注册链路下降" },
        { label: "CAC", value: "¥318", delta: "+18%", detail: "付费搜索效率走弱" },
        { label: "W2 留存", value: "61.5%", delta: "-9%", detail: "早期 cohort 健康度下降" }
      ],
      metricTrendTitle: "指标趋势",
      timelineTitle: "自定义时间线",
      timelineStartLabel: "起始年份",
      timelineEndLabel: "结束年份",
      timelineSelectedLabel: "已选区间",
      driverChartTitle: "多维度驱动分析",
      dimensionCards: [
        {
          title: "国家",
          items: [
            ["美国", "34%"],
            ["日本", "21%"],
            ["英国", "14%"]
          ]
        },
        {
          title: "用户画像",
          items: [
            ["中小企业自助用户", "29%"],
            ["新付费用户", "24%"],
            ["移动端优先用户", "18%"]
          ]
        },
        {
          title: "渠道",
          items: [
            ["付费搜索", "31%"],
            ["联盟渠道", "12%"],
            ["自然流量", "8%"]
          ]
        }
      ],
      healthCards: [
        {
          label: "收入信号",
          value: "等待数据",
          detail: "连接收入系统或数仓表后自动填充"
        },
        {
          label: "指标覆盖",
          value: "0 个就绪",
          detail: "完成 Schema 映射后生成语义指标"
        },
        {
          label: "数据新鲜度",
          value: "未连接",
          detail: "验证数据源后开始自动同步"
        }
      ],
      chartTitle: "增长信号趋势",
      chartDescription: "当前为预览结构，真实数值会在连接数据后展示",
      insightTitle: "数据分析增长报告",
      reasoningTitle: "因果推理图",
      reasoningDescription: "AI 如何把指标变化连接到可能的业务原因",
      evidenceTitle: "关键证据",
      evidenceMetric: "收入下降 18%",
      evidenceDrivers: ["iOS 转化下降", "CAC 上升", "Retention week2 下滑"],
      confidenceLabel: "置信度",
      confidenceValue: "82%",
      whyLabel: "原因判断依据",
      reasoningNodes: [
        {
          title: "收入下降",
          delta: "-18%",
          detail: "相对 4 周基线的核心异常",
          children: ["iOS 转化下降", "CAC 上升", "W2 留存下降"]
        },
        {
          title: "iOS 转化下降",
          delta: "-14%",
          detail: "注册完成和支付完成同时走弱",
          children: ["Onboarding 完成率下降", "支付完成率下降"]
        },
        {
          title: "CAC 上升",
          delta: "+18%",
          detail: "投放结构变化后，付费搜索效率下降",
          children: ["付费效率下降", "低意向流量增加"]
        }
      ],
      trustTitle: "置信机制",
      trustDescription: "为什么这个结论可以被企业审计和追溯",
      trustItems: [
        { label: "数据完整度", value: "91%", detail: "计费、产品和投放事件覆盖充分" },
        { label: "归因可靠性", value: "中等", detail: "付费搜索路径存在部分归因缺口" },
        { label: "历史一致性", value: "高", detail: "与过去转化驱动型收入下滑相似" },
        { label: "数据新鲜度", value: "4 分钟", detail: "最新数仓同步已完成" }
      ],
      insights: [
        {
          step: "01",
          title: "数据表现",
          text: "本周收入下降 12.4%，激活率下降 6.1%，CAC 上升 18%，W2 留存同步下滑"
        },
        {
          step: "02",
          title: "原因分析",
          text: "主要由 iOS 转化下降、付费搜索 CAC 上升和 Retention week2 下滑共同驱动"
        },
        {
          step: "03",
          title: "行动建议",
          text: "优先排查 iOS 注册与支付链路，收紧低效投放，并对 W2 风险用户做召回"
        }
      ],
      tableTitle: "报表结构",
      tableHeaders: ["模块", "回答的问题", "所需数据", "状态"],
      tableRows: [
        ["管理层摘要", "本周发生了什么变化", "一级指标", "等待中"],
        ["根因分析", "为什么会发生变化", "二级驱动指标", "等待中"],
        ["数据自动化", "数据是否可信", "同步和质量检查", "等待中"],
        ["行动计划", "团队下一步做什么", "已验证洞察", "等待中"]
      ],
      actionTitle: "行动队列",
      actions: [
        "连接收入、产品和 CRM 数据源",
        "把核心字段映射到业务语义",
        "生成第一份自动化周报"
      ],
      commandTitle: "行动指挥中心",
      commandDescription: "把分析结论转化为跨团队可执行工作流",
      workflows: [
        {
          label: "创建 Jira 任务",
          title: "排查 iOS 支付转化下降",
          owner: "产品团队",
          priority: "高",
          impact: "+6.4% 转化恢复",
          cta: "创建任务"
        },
        {
          label: "启动 CRM 流程",
          title: "召回 W2 高风险用户",
          owner: "生命周期团队",
          priority: "中",
          impact: "+4.8% 留存提升",
          cta: "启动流程"
        },
        {
          label: "调整预算",
          title: "降低低 ROI 搜索投放",
          owner: "增长团队",
          priority: "高",
          impact: "-12% CAC 风险",
          cta: "查看预算"
        }
      ],
      memoryTitle: "AI 业务记忆",
      memoryItems: [
        "3 周前检测到类似 iOS 支付异常",
        "留存下滑已经连续 4 周出现",
        "CAC 上升与最近一次非品牌搜索投放启动相关"
      ],
      semanticTitle: "使用的业务语义",
      semanticDescription: "AI 通过业务含义推理，而不是直接读原始字段",
      semanticMappings: [
        ["paid_amount", "收入"],
        ["signup_completed", "激活"],
        ["subscription_renewed", "留存"]
      ]
    }
  }
} as const;

type DashboardCopy = (typeof dashboardCopy)[Locale];
type DashboardView = "overview" | "import-data" | "metrics" | "schema" | "reports" | "settings";

function navLabel(copy: DashboardCopy, href: string) {
  return copy.navItems.find((item) => item.target === href)?.label ?? "";
}

function Sidebar({
  copy,
  activeTarget,
  isCollapsed,
  onToggle
}: {
  copy: DashboardCopy;
  activeTarget: string;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "hidden shrink-0 border-r bg-white/72 px-3 py-4 backdrop-blur transition-[width] duration-200 lg:block",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      <div
        className={cn(
          "mb-6 flex items-center",
          isCollapsed ? "flex-col gap-2 px-0" : "justify-between gap-2 px-2"
        )}
      >
        <div className={cn("flex min-w-0 items-center gap-2", isCollapsed && "justify-center")}>
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          {!isCollapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{copy.sidebar.brand}</p>
              <p className="truncate text-xs text-muted-foreground">{copy.sidebar.subtitle}</p>
            </div>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={isCollapsed ? copy.sidebar.expandLabel : copy.sidebar.collapseLabel}
          onClick={onToggle}
        >
          {isCollapsed ? <ChevronRight /> : <ChevronLeft />}
        </Button>
      </div>
      <nav className="space-y-1">
        {copy.navItems.map((item) => {
          const isActive = item.target === activeTarget;

          return (
            <a
              key={item.label}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "flex h-9 w-full items-center rounded-md text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground",
                isCollapsed ? "justify-center px-0" : "gap-2 px-2",
                isActive && "bg-secondary text-foreground"
              )}
            >
              <item.icon className="size-4" />
              <span className={cn(isCollapsed && "sr-only")}>{item.label}</span>
            </a>
          );
        })}
      </nav>
      {isCollapsed ? (
        <div
          className="mt-6 grid h-10 place-items-center rounded-lg border bg-background"
          title={copy.sidebar.statusTitle}
        >
          <Zap className="size-4 text-teal-600" />
        </div>
      ) : (
        <div className="mt-6 rounded-lg border bg-background p-3">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="size-4 text-teal-600" />
            <p className="text-sm font-medium">{copy.sidebar.statusTitle}</p>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{copy.sidebar.statusText}</p>
        </div>
      )}
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
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <a href="/dashboard/import-data">
              <Plus />
              {copy.header.newSource}
            </a>
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

function SetupHero({ copy }: { copy: DashboardCopy }) {
  const overviewLabel = navLabel(copy, "#overview");

  return (
    <section id="overview" className="scroll-mt-20">
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight">{overviewLabel}</h2>
      </div>
      <Card className="overflow-hidden border-emerald-100 bg-gradient-to-br from-white via-emerald-50/70 to-white">
        <CardContent className="p-6 sm:p-7">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{copy.hero.badge}</Badge>
            <Badge variant="warning">{copy.hero.status}</Badge>
          </div>
          <h1 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            {copy.hero.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {copy.hero.description}
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="rounded-full px-5">
              <a href="/dashboard/import-data">
                <Database />
                {copy.hero.primary}
              </a>
            </Button>
            <Button asChild variant="outline" className="rounded-full px-5">
              <a href="/dashboard/metrics">
                <LineChart />
                {copy.hero.secondary}
              </a>
            </Button>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-700" />
            {copy.hero.note}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function MetricPlaceholder({
  metric,
  pending,
  generated
}: {
  metric: DashboardCopy["metrics"]["cards"][number];
  pending: string;
  generated: string;
}) {
  return (
    <Card className="border-border/70 bg-white/85 shadow-sm">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid size-9 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-800">
              <metric.icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{metric.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.text}</p>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {pending}
          </Badge>
        </div>
        <div className="mt-3 rounded-md border border-dashed bg-secondary/40 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-600/60" aria-hidden="true" />
            {generated}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricGrid({ copy }: { copy: DashboardCopy }) {
  return (
    <section id="metrics" className="scroll-mt-20">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{navLabel(copy, "#metrics")}</h2>
          <p className="text-sm text-muted-foreground">{copy.metrics.description}</p>
        </div>
      </div>
      <Card className="overflow-hidden border-emerald-100 bg-gradient-to-br from-white via-emerald-50/45 to-white shadow-sm">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {copy.metrics.cards.map((metric) => (
              <MetricPlaceholder
                key={metric.label}
                metric={metric}
                pending={copy.metrics.pending}
                generated={copy.metrics.generated}
              />
            ))}
          </div>
          <div className="mt-3 rounded-lg border bg-white/80 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-700" />
                <p className="text-sm font-semibold">{copy.metrics.readinessTitle}</p>
              </div>
              <Badge variant="secondary">{copy.metrics.readinessStatus}</Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {copy.metrics.readinessDescription}
            </p>
            <div className="mt-3 grid gap-2">
              {copy.metrics.readinessSteps.map((step) => (
                <div key={step} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-600/70" aria-hidden="true" />
                  {step}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function MetricCatalogPage({ copy }: { copy: DashboardCopy }) {
  const statusClassName = (status: string) => {
    if (status.includes("Ready")) {
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    }

    if (status.includes("Missing") || status.includes("缺少")) {
      return "border-amber-200 bg-amber-50 text-amber-800";
    }

    return "border-slate-200 bg-slate-50 text-slate-700";
  };

  return (
    <section id="metrics" className="scroll-mt-20">
      <Card className="mb-4 overflow-hidden bg-white shadow-sm">
        <CardContent className="p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] xl:items-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {navLabel(copy, "#metrics")}
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {copy.metricCatalog.title}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {copy.metricCatalog.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {copy.metricCatalog.actions.map((action, index) => (
                  <Button key={action} asChild variant={index === 0 ? "default" : "outline"} size="sm">
                    <a href={index === 0 ? "/dashboard/import-data" : "/dashboard/schema"}>
                      {index === 0 ? <Database /> : <Table2 />}
                      {action}
                    </a>
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-secondary/25 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="size-4 text-emerald-700" />
                <h2 className="text-sm font-semibold">{copy.metricCatalog.flowTitle}</h2>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {copy.metricCatalog.flowDescription}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {copy.metricCatalog.flow.map((step, index) => (
                  <div key={step} className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs font-medium">
                      <span className="grid size-5 place-items-center rounded-md bg-emerald-50 text-[11px] font-semibold text-emerald-800">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </div>
                    {index < copy.metricCatalog.flow.length - 1 ? (
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <div className="grid gap-3 lg:grid-cols-3">
          {copy.metricCatalog.hierarchy.map((card, index) => (
            <Card key={card.title} className="overflow-hidden bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div
                    className={cn(
                      "grid size-10 place-items-center rounded-lg",
                      index === 1 ? "bg-indigo-50 text-indigo-700" : "bg-emerald-50 text-emerald-800"
                    )}
                  >
                    {index === 0 ? <LineChart className="size-5" /> : index === 1 ? <Activity className="size-5" /> : <BrainCircuit className="size-5" />}
                  </div>
                  <div className="flex h-10 w-20 items-center justify-center gap-1 rounded-lg border bg-secondary/30">
                    {[0, 1, 2].map((node) => (
                      <div key={node} className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-emerald-700/70" />
                        {node < 2 ? <span className="h-px w-3 bg-border" /> : null}
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-base font-semibold">{card.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden border-dashed bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
              <div>
                <Badge variant="secondary">{copy.metricCatalog.emptyBadge}</Badge>
                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {copy.metricCatalog.tableTitle}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight">
                  {copy.metricCatalog.emptyTitle}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {copy.metricCatalog.tableDescription}
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {copy.metricCatalog.emptyDescription}
                </p>
              </div>
              <div className="rounded-xl border bg-secondary/25 p-3">
                {copy.metricCatalog.emptySteps.map((step, index) => (
                  <div key={step} className="flex items-center gap-3 border-b py-3 last:border-b-0">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-sm font-semibold text-emerald-800">
                      {index + 1}
                    </span>
                    <p className="text-sm font-medium">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden bg-white shadow-sm">
          <CardHeader className="border-b p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">{copy.metricCatalog.exampleTitle}</CardTitle>
                <CardDescription className="mt-1 text-sm leading-6">
                  {copy.metricCatalog.exampleDescription}
                </CardDescription>
              </div>
              <Badge variant="secondary" className="w-fit">
                {copy.metricCatalog.exampleBadge}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 border-b bg-secondary/80 text-xs text-muted-foreground backdrop-blur">
                  <tr>
                    {copy.metricCatalog.exampleHeaders.map((header) => (
                      <th key={header} className="px-4 py-3 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {copy.metricCatalog.exampleRows.map((row) => (
                    <tr key={`${row.layer}-${row.category}-${row.metric}`} className="align-top transition hover:bg-secondary/25">
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{row.layer}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.category}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-emerald-800">{row.metric}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {row.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="max-w-[280px] px-4 py-3 leading-6 text-muted-foreground">
                        <span className="block rounded-md border border-transparent px-2 py-1 transition hover:border-border hover:bg-background">
                          {row.definition}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <code className="inline-block rounded-md border bg-secondary/45 px-2 py-1 text-xs transition hover:border-emerald-200 hover:bg-emerald-50">
                          {row.formula}
                        </code>
                      </td>
                      <td className="max-w-[260px] px-4 py-3 leading-6 text-muted-foreground">
                        <span className="block rounded-md border border-transparent px-2 py-1 transition hover:border-border hover:bg-background">
                          {row.mapping}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-medium", statusClassName(row.status))}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

      </div>
    </section>
  );
}

function SchemaPage({ copy }: { copy: DashboardCopy }) {
  return (
    <section id="schema" className="scroll-mt-20">
      <Card className="overflow-hidden bg-white shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {navLabel(copy, "#metrics")}
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {copy.schemaPage.title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {copy.schemaPage.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href="/dashboard/import-data">
                  <Database />
                  {copy.schemaPage.primaryAction}
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="/dashboard/metrics">
                  <LineChart />
                  {copy.schemaPage.secondaryAction}
                </a>
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-xl border border-dashed bg-secondary/20 p-4">
              <Badge variant="secondary">{copy.schemaPage.badge}</Badge>
              <h2 className="mt-4 text-xl font-semibold tracking-tight">{copy.schemaPage.emptyTitle}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {copy.schemaPage.emptyDescription}
              </p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {copy.schemaPage.sections.map((section) => (
                  <div key={section.title} className="rounded-lg border bg-white p-3">
                    <div className="mb-3 grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
                      <section.icon className="size-4" />
                    </div>
                    <p className="text-sm font-semibold">{section.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{section.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-secondary/25 p-4">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-700" />
                <h2 className="text-sm font-semibold">{copy.schemaPage.checklistTitle}</h2>
              </div>
              <div className="space-y-2">
                {copy.schemaPage.checklist.map((item, index) => (
                  <div key={item} className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-emerald-50 text-xs font-semibold text-emerald-800">
                      {index + 1}
                    </span>
                    <p className="text-sm font-medium">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SettingsPage({ copy }: { copy: DashboardCopy }) {
  return (
    <section id="settings" className="scroll-mt-20">
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {navLabel(copy, "#settings")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {copy.settingsPage.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {copy.settingsPage.description}
        </p>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <Card className="overflow-hidden bg-white shadow-sm">
            <CardHeader className="border-b p-4">
              <div className="flex items-center gap-2">
                <Settings className="size-4 text-emerald-700" />
                <div>
                  <CardTitle className="text-base">{copy.settingsPage.workspaceTitle}</CardTitle>
                  <CardDescription className="mt-1">
                    {copy.settingsPage.workspaceDescription}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {copy.settingsPage.workspaceName}
                  </span>
                  <Input defaultValue={copy.sidebar.brand} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {copy.settingsPage.workspaceSlug}
                  </span>
                  <Input defaultValue="openanalyst.app/workspace" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {copy.settingsPage.workspaceRegion}
                  </span>
                  <Input defaultValue="Asia Pacific" />
                </label>
              </div>
              <div className="mt-4 flex justify-end">
                <Button size="sm">{copy.settingsPage.save}</Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <SettingsListCard
              icon={Settings}
              title={copy.settingsPage.preferencesTitle}
              rows={copy.settingsPage.preferences}
            />
            <SettingsListCard
              icon={Bell}
              title={copy.settingsPage.notificationsTitle}
              rows={copy.settingsPage.notifications}
            />
          </div>
        </div>

        <div className="grid gap-4">
          <SettingsListCard
            icon={Database}
            title={copy.settingsPage.securityTitle}
            rows={copy.settingsPage.security}
          />
          <Card className="overflow-hidden bg-gradient-to-br from-white via-emerald-50/65 to-white shadow-sm">
            <CardContent className="p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
                  <FileText className="size-5" />
                </div>
                <Badge variant="secondary">{copy.settingsPage.billingPlan}</Badge>
              </div>
              <h2 className="text-base font-semibold">{copy.settingsPage.billingTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {copy.settingsPage.billingDescription}
              </p>
              <Button asChild className="mt-4 w-full" size="sm">
                <a href="/#pricing">
                  {copy.settingsPage.billingAction}
                  <ArrowRight />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function SettingsListCard({
  icon: Icon,
  title,
  rows
}: {
  icon: typeof Settings;
  title: string;
  rows: readonly (readonly [string, string])[];
}) {
  return (
    <Card className="overflow-hidden bg-white shadow-sm">
      <CardHeader className="border-b p-4">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-emerald-700" />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-sm font-medium">{label}</span>
            <Badge variant="secondary" className="shrink-0">
              {value}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ImportDataSection({ copy }: { copy: DashboardCopy }) {
  return (
    <section id="import-data" className="scroll-mt-20">
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight">{navLabel(copy, "#import-data")}</h2>
        <p className="text-sm text-muted-foreground">{copy.importData.description}</p>
      </div>
      <div className="grid gap-4">
        <OnboardingFlow copy={copy} />
        <ConnectorPanel copy={copy} />
      </div>
    </section>
  );
}

function OnboardingFlow({ copy }: { copy: DashboardCopy }) {
  return (
    <Card className="overflow-hidden border-emerald-100 bg-gradient-to-r from-white via-emerald-50/35 to-white shadow-sm">
      <CardContent className="p-4">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-base font-semibold tracking-tight">{copy.onboarding.title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.onboarding.description}</p>
          </div>
          <Badge variant="secondary">{copy.onboarding.badge}</Badge>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          {copy.onboarding.steps.map((step, index) => (
            <div key={step.title} className="relative rounded-lg border bg-white/85 p-3">
              <div className="mb-3 flex items-center gap-2">
                <div className="grid size-7 shrink-0 place-items-center rounded-md bg-emerald-50 text-xs font-semibold text-emerald-800">
                  {index + 1}
                </div>
                <p className="text-sm font-medium">{step.title}</p>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{step.text}</p>
              {index < copy.onboarding.steps.length - 1 ? (
                <ArrowRight className="absolute -right-3 top-6 hidden size-4 text-emerald-700/60 md:block" />
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ChatPanel({
  copy,
  className,
  isCollapsed,
  onToggle
}: {
  copy: DashboardCopy;
  className?: string;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  if (isCollapsed) {
    return (
      <section id="ai-chat" className={cn("scroll-mt-20", className)}>
        <Card className="flex min-h-[76px] items-center justify-between gap-3 border-emerald-100 bg-white/85 p-3 shadow-sm xl:h-[calc(100vh-7rem)] xl:flex-col xl:justify-start">
          <Button variant="ghost" size="icon" aria-label={copy.chat.expandLabel} onClick={onToggle}>
            <ChevronLeft />
          </Button>
          <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="size-5" />
          </div>
          <div className="hidden min-h-0 flex-1 items-center justify-center xl:flex">
            <p className="[writing-mode:vertical-rl] rotate-180 text-xs font-semibold tracking-wide text-muted-foreground">
              {navLabel(copy, "#ai-chat")}
            </p>
          </div>
          <Badge variant="secondary" className="hidden xl:inline-flex">
            AI
          </Badge>
        </Card>
      </section>
    );
  }

  return (
    <section id="ai-chat" className={cn("scroll-mt-20", className)}>
      <Card className="flex min-h-[480px] flex-col overflow-hidden border bg-white shadow-sm xl:h-[calc(100vh-7rem)]">
        <CardHeader className="border-b px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
                <Bot className="size-4" />
              </div>
              <div>
                <CardTitle className="text-sm">{copy.chat.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{copy.chat.status}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" aria-label={copy.chat.collapseLabel} onClick={onToggle}>
              <ChevronRight />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
          <div className="flex gap-2">
            <div className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-foreground">
              <Bot className="size-4" />
            </div>
            <div className="rounded-lg border bg-secondary/45 px-3 py-2 text-sm leading-6">
              {copy.chat.assistantMessage}
            </div>
          </div>
          <div className="ml-auto max-w-[82%] rounded-lg bg-primary px-3 py-2 text-sm leading-6 text-primary-foreground">
            {copy.chat.userQuestion}
          </div>
          <div className="flex gap-2">
            <div className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-foreground">
              <Bot className="size-4" />
            </div>
            <div className="rounded-lg border bg-secondary/45 px-3 py-2 text-sm leading-6">
              {copy.chat.assistantReply}
            </div>
          </div>
          <div className="mt-auto rounded-lg border bg-background p-1.5">
            <div className="flex gap-2">
              <Input
                className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
                placeholder={copy.chat.inputPlaceholder}
              />
              <Button size="icon" className="size-9 shrink-0" aria-label={copy.chat.sendLabel}>
                <Send />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function ConnectorPanel({ copy }: { copy: DashboardCopy }) {
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);
  const [selectedMode, setSelectedMode] = useState<string>(copy.connectors.modes[0]);
  const [selectedAuth, setSelectedAuth] = useState<string>(copy.connectors.authOptions[0]);
  const selectedSource = copy.connectors.sources[selectedSourceIndex] ?? copy.connectors.sources[0];
  const isFileSource = selectedSource.kind === "file";
  const isSqlLikeSource = selectedSource.kind === "database" || selectedSource.kind === "warehouse";

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="border-b p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base">{copy.connectors.title}</CardTitle>
            <CardDescription className="mt-1 text-sm leading-6">
              {copy.connectors.description}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit shrink-0">{copy.connectors.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-lg border bg-background">
            <div className="border-b bg-secondary/20 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {copy.connectors.sourcePicker}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {copy.connectors.sources.map((source, index) => (
                  <button
                    key={source.name}
                    type="button"
                    onClick={() => setSelectedSourceIndex(index)}
                    className={cn(
                      "rounded-md border bg-background px-3 py-2 text-left transition hover:bg-secondary",
                      index === selectedSourceIndex && "border-primary bg-primary text-primary-foreground"
                    )}
                  >
                    <span className="block text-sm font-semibold">{source.name}</span>
                    <span
                      className={cn(
                        "mt-1 block text-xs",
                        index === selectedSourceIndex ? "text-primary-foreground/75" : "text-muted-foreground"
                      )}
                    >
                      {source.type}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="border-b p-3">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
                  {isFileSource ? <FileText className="size-5" /> : <Database className="size-5" />}
                </div>
                <div>
                  <p className="text-sm font-semibold">{selectedSource.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedSource.type}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-4">
              {isFileSource ? (
                <div className="rounded-lg border border-dashed bg-secondary/25 p-5 text-center">
                  <FileText className="mx-auto size-8 text-emerald-800" />
                  <p className="mt-3 text-sm font-semibold">{copy.connectors.fileUpload}</p>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                    {copy.connectors.fileDescription}
                  </p>
                  <Button variant="outline" size="sm" className="mt-4">
                    <Plus />
                    {copy.connectors.fileUpload}
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {isSqlLikeSource ? copy.connectors.server : copy.connectors.workspace}
                    </span>
                    <Input
                      placeholder={
                        isSqlLikeSource
                          ? copy.connectors.serverPlaceholder
                          : copy.connectors.workspacePlaceholder
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {isSqlLikeSource ? copy.connectors.database : copy.connectors.tableScope}
                    </span>
                    <Input
                      placeholder={
                        isSqlLikeSource
                          ? copy.connectors.databasePlaceholder
                          : copy.connectors.tableScopePlaceholder
                      }
                    />
                  </label>
                </div>
              )}

              {!isFileSource ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{copy.connectors.mode}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {copy.connectors.modes.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSelectedMode(mode)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-left text-sm font-medium transition hover:bg-secondary",
                          selectedMode === mode && "border-primary bg-primary text-primary-foreground"
                        )}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {!isFileSource ? (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {copy.connectors.authentication}
                  </p>
                  <div className="grid gap-2 md:grid-cols-3">
                    {copy.connectors.authOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setSelectedAuth(option)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-left text-sm font-medium transition hover:bg-secondary",
                          selectedAuth === option && "border-primary bg-primary text-primary-foreground"
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {!isFileSource ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {copy.connectors.username}
                    </span>
                    <Input />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {copy.connectors.password}
                    </span>
                    <Input type="password" />
                  </label>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">{copy.connectors.gateway}</p>
                  <p className="mt-1 text-sm font-medium">{copy.connectors.gatewayValue}</p>
                </div>
                <div className="rounded-md border bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground">{copy.connectors.privacyLabel}</p>
                  <p className="mt-1 text-sm font-medium">{copy.connectors.privacyValue}</p>
                </div>
              </div>

              <div className="rounded-lg border bg-secondary/20 p-3">
                <p className="text-sm font-semibold">{copy.connectors.advanced}</p>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    {isFileSource ? copy.connectors.tableScope : copy.connectors.sqlStatement}
                  </span>
                  <Input
                    placeholder={
                      isFileSource ? copy.connectors.tableScopePlaceholder : copy.connectors.sqlPlaceholder
                    }
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{copy.connectors.previewTitle}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {selectedSource.name}
                </p>
              </div>
              <Badge variant="secondary">{selectedSource.type}</Badge>
            </div>
            <div className="space-y-2 rounded-lg border border-dashed bg-secondary/25 p-3">
              {copy.connectors.previewRows.map((row) => (
                <div key={row} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-700/70" aria-hidden="true" />
                  {row}
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2">
              <Button variant="outline" size="sm">
                <CheckCircle2 />
                {copy.connectors.testAction}
              </Button>
              <Button size="sm">
                {copy.connectors.importAction}
                <ArrowRight />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportsPanel({ copy }: { copy: DashboardCopy }) {
  return (
    <section id="reports" className="scroll-mt-20">
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight">{navLabel(copy, "#reports")}</h2>
        <p className="text-sm text-muted-foreground">{copy.reports.description}</p>
      </div>
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          {copy.reports.cards.map(([title, text]) => (
            <div key={title} className="rounded-lg border border-dashed bg-background p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="grid size-9 place-items-center rounded-md bg-secondary">
                  <FileText className="size-4" />
                </div>
                <Badge variant="secondary">{copy.reports.pending}</Badge>
              </div>
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

const reportTrendData = [
  { period: "D1", revenue: 38, activation: 44 },
  { period: "D2", revenue: 42, activation: 46 },
  { period: "D3", revenue: 39, activation: 43 },
  { period: "D4", revenue: 48, activation: 51 },
  { period: "D5", revenue: 45, activation: 54 },
  { period: "D6", revenue: 52, activation: 56 },
  { period: "D7", revenue: 57, activation: 61 }
];

const reportMetricTrendData = [
  { period: "2019", revenue: 96, activation: 31, retention: 54 },
  { period: "2020", revenue: 114, activation: 35, retention: 56 },
  { period: "2021", revenue: 138, activation: 39, retention: 59 },
  { period: "2022", revenue: 162, activation: 43, retention: 63 },
  { period: "2023", revenue: 188, activation: 47, retention: 67 },
  { period: "2024", revenue: 211, activation: 45, retention: 65 },
  { period: "2025", revenue: 204, activation: 42, retention: 62 },
  { period: "2026", revenue: 184, activation: 41, retention: 61 }
];

const reportDriverData = [
  { driver: "iOS", impact: 38 },
  { driver: "CAC", impact: 31 },
  { driver: "W2", impact: 24 },
  { driver: "Billing", impact: 12 },
  { driver: "US", impact: 34 },
  { driver: "Japan", impact: 21 },
  { driver: "SMB", impact: 29 },
  { driver: "New users", impact: 24 },
  { driver: "Paid search", impact: 31 }
];

function ReportLiveStatusBar({ copy }: { copy: DashboardCopy }) {
  return (
    <div className="rounded-xl border bg-slate-950 p-3 text-white shadow-sm">
      <div className="grid gap-2 lg:grid-cols-4">
        {copy.reports.liveStatuses.map((status, index) => (
          <div key={status} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span
              className={cn(
                "size-2 rounded-full",
                index === 0 ? "animate-pulse bg-emerald-300" : "bg-white/35"
              )}
              aria-hidden="true"
            />
            <span className="truncate text-xs text-slate-200">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportHeroInsight({ copy }: { copy: DashboardCopy }) {
  return (
    <Card className="overflow-hidden border-emerald-700/20 bg-gradient-to-br from-white via-emerald-50/70 to-white shadow-sm">
      <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <Badge className="border-emerald-700/20 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
            {copy.reports.heroLabel}
          </Badge>
          <div className="mt-5 flex flex-wrap items-end gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{copy.reports.heroMetric}</p>
              <h1 className="mt-2 text-6xl font-semibold tracking-tight text-slate-950">
                {copy.reports.heroValue}
              </h1>
            </div>
            <div className="pb-2">
              <p className="text-lg font-semibold text-slate-700">{copy.reports.heroBaseline}</p>
              <p className="mt-1 text-sm text-muted-foreground">{copy.reports.heroSeverity}</p>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">
            {copy.reports.heroSummary}
          </p>
        </div>

        <div className="grid rounded-xl border bg-white/80 p-4">
          <div className="rounded-lg border bg-rose-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-rose-700">
              {copy.reports.businessImpactLabel}
            </p>
            <p className="mt-2 text-2xl font-semibold text-rose-700">{copy.reports.heroImpact}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportReasoningTrustSection({ copy }: { copy: DashboardCopy }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{copy.reports.reasoningTitle}</CardTitle>
          <CardDescription>{copy.reports.reasoningDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {copy.reports.reasoningNodes.map((node, index) => (
            <details
              key={node.title}
              open={index < 2}
              className="group rounded-xl border bg-background p-4 open:bg-emerald-50/35"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-emerald-50 text-sm font-semibold text-emerald-800">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-semibold">{node.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{node.detail}</p>
                  </div>
                </div>
                <Badge variant="secondary">{node.delta}</Badge>
              </summary>
              <div className="ml-11 mt-4 grid gap-2 sm:grid-cols-3">
                {node.children.map((child) => (
                  <div key={child} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
                    <ArrowRight className="size-3 text-emerald-700" />
                    <span className="text-sm text-muted-foreground">{child}</span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{copy.reports.trustTitle}</CardTitle>
          <CardDescription>{copy.reports.trustDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {copy.reports.trustItems.map((item) => (
            <div key={item.label} className="rounded-xl border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{item.label}</p>
                <span className="text-sm font-semibold text-emerald-800">{item.value}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportActionCommandCenter({ copy }: { copy: DashboardCopy }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{copy.reports.commandTitle}</CardTitle>
        <CardDescription>{copy.reports.commandDescription}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-3">
        {copy.reports.workflows.map((workflow) => (
          <div key={workflow.title} className="rounded-xl border bg-background p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <Badge variant="secondary">{workflow.label}</Badge>
              <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">
                {workflow.priority}
              </Badge>
            </div>
            <h3 className="text-base font-semibold">{workflow.title}</h3>
            <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
              <div className="flex justify-between gap-3">
                <span>{copy.reports.ownerLabel}</span>
                <span className="font-medium text-foreground">{workflow.owner}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>{copy.reports.impactLabel}</span>
                <span className="font-medium text-foreground">{workflow.impact}</span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ReportMemorySemanticSection({ copy }: { copy: DashboardCopy }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{copy.reports.memoryTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {copy.reports.memoryItems.map((item) => (
            <div key={item} className="flex gap-3 rounded-xl border bg-background p-3">
              <BrainCircuit className="mt-0.5 size-4 shrink-0 text-emerald-700" />
              <p className="text-sm leading-6 text-muted-foreground">{item}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{copy.reports.semanticTitle}</CardTitle>
          <CardDescription>{copy.reports.semanticDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {copy.reports.semanticMappings.map(([field, meaning]) => (
            <div key={field} className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3">
              <code className="rounded-md bg-white px-2 py-1 text-xs text-muted-foreground">{field}</code>
              <ArrowRight className="size-4 text-emerald-700" />
              <span className="text-sm font-semibold">{meaning}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportMetricsVisualization({ copy }: { copy: DashboardCopy }) {
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(reportMetricTrendData.length - 1);
  const visibleMetricTrendData = reportMetricTrendData.slice(rangeStart, rangeEnd + 1);
  const selectedStart = reportMetricTrendData[rangeStart]?.period;
  const selectedEnd = reportMetricTrendData[rangeEnd]?.period;
  const maxRangeIndex = reportMetricTrendData.length - 1;
  const startPercent = (rangeStart / maxRangeIndex) * 100;
  const endPercent = (rangeEnd / maxRangeIndex) * 100;

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{copy.reports.metricsTitle}</h2>
          {copy.reports.metricsDescription ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {copy.reports.metricsDescription}
            </p>
          ) : null}
        </div>
        <Badge variant="secondary">{copy.reports.previewLabel}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {copy.reports.metricCards.map((metric) => {
          const isNegative = metric.delta.startsWith("-");
          const isPositiveCost = metric.label === "CAC" || metric.label.includes("CAC");

          return (
            <div key={metric.label} className="rounded-lg border bg-secondary/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    isNegative || isPositiveCost
                      ? "bg-rose-50 text-rose-700"
                      : "bg-emerald-50 text-emerald-700"
                  )}
                >
                  {metric.delta}
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{metric.value}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{metric.detail}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4">
        <div className="rounded-lg border bg-background p-4">
          <h3 className="text-sm font-semibold">{copy.reports.metricTrendTitle}</h3>
          <div className="mt-3 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={visibleMetricTrendData} margin={{ left: 0, right: 18, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="metricRevenue" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#047857" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#047857" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="metricRetention" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#64748b" stopOpacity={0.16} />
                    <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <YAxis hide domain={[25, 230]} />
                <Tooltip
                  cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)"
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#047857"
                  strokeWidth={2.5}
                  fill="url(#metricRevenue)"
                  name={copy.reports.metricCards[0].label}
                />
                <Area
                  type="monotone"
                  dataKey="retention"
                  stroke="#64748b"
                  strokeWidth={2}
                  fill="url(#metricRetention)"
                  name={copy.reports.metricCards[3].label}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 px-1 pb-1">
            <div className="relative h-9">
              <div className="absolute left-0 right-0 top-4 h-1.5 rounded-full bg-slate-200" />
              <div
                className="absolute top-4 h-1.5 rounded-full bg-emerald-700"
                style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }}
              />
              <input
                aria-label={copy.reports.timelineStartLabel}
                type="range"
                min={0}
                max={maxRangeIndex}
                value={rangeStart}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setRangeStart(Math.min(next, rangeEnd));
                }}
                className="pointer-events-none absolute inset-x-0 top-1 z-20 h-8 w-full cursor-ew-resize appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-emerald-700 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-700"
              />
              <input
                aria-label={copy.reports.timelineEndLabel}
                type="range"
                min={0}
                max={maxRangeIndex}
                value={rangeEnd}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setRangeEnd(Math.max(next, rangeStart));
                }}
                className="pointer-events-none absolute inset-x-0 top-1 z-30 h-8 w-full cursor-ew-resize appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-emerald-700 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-700"
              />
            </div>
            <div className="mt-1 flex justify-between gap-2 text-[11px] text-muted-foreground">
              {reportMetricTrendData.map((item) => (
                <span key={item.period}>{item.period}</span>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {copy.reports.timelineSelectedLabel}: {selectedStart} - {selectedEnd}
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-background p-4">
          <h3 className="text-sm font-semibold">{copy.reports.driverChartTitle}</h3>
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reportDriverData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="driver"
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                />
                <YAxis hide domain={[0, 45]} />
                <Tooltip
                  cursor={{ fill: "rgba(4,120,87,0.06)" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)"
                  }}
                />
                <Bar dataKey="impact" fill="#047857" radius={[8, 8, 2, 2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {copy.reports.dimensionCards.map((dimension) => (
              <div key={dimension.title} className="rounded-lg border bg-white p-3">
                <p className="text-sm font-semibold">{dimension.title}</p>
                <div className="mt-3 space-y-2">
                  {dimension.items.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-muted-foreground">{label}</span>
                      <span className="font-semibold text-emerald-800">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportInsightCard({ copy }: { copy: DashboardCopy }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold">{copy.reports.insightTitle}</h2>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {copy.reports.insights.map((item) => (
          <div key={item.step} className="rounded-lg border bg-secondary/20 p-3">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-md bg-emerald-50 text-sm font-semibold text-emerald-800">
                {item.step}
              </span>
              <p className="font-medium">{item.title}</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">
              {copy.reports.evidenceTitle}
            </p>
            <h3 className="mt-2 text-sm font-semibold text-foreground">
              {copy.reports.whyLabel}
            </h3>
          </div>
          <Badge className="w-fit bg-emerald-700 text-white hover:bg-emerald-700">
            {copy.reports.confidenceLabel} {copy.reports.confidenceValue}
          </Badge>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="rounded-md border bg-white p-3 text-sm font-semibold">
            {copy.reports.evidenceMetric}
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {copy.reports.evidenceDrivers.map((driver) => (
              <div key={driver} className="flex items-center gap-2 rounded-md border bg-white px-3 py-2">
                <span className="size-1.5 rounded-full bg-emerald-700" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">{driver}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportTrendCard({ copy }: { copy: DashboardCopy }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{copy.reports.chartTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy.reports.chartDescription}
          </p>
        </div>
        <Badge variant="secondary">{copy.reports.previewLabel}</Badge>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={reportTrendData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="reportRevenue" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#047857" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#047857" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="reportActivation" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="period"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748b", fontSize: 12 }}
            />
            <YAxis hide domain={[30, 68]} />
            <Tooltip
              cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)"
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#047857"
              strokeWidth={2.5}
              fill="url(#reportRevenue)"
              name={copy.reports.healthCards[0].label}
            />
            <Area
              type="monotone"
              dataKey="activation"
              stroke="#4f46e5"
              strokeWidth={2.5}
              fill="url(#reportActivation)"
              name={copy.reports.insights[0].title}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ReportsPage({ copy }: { copy: DashboardCopy }) {
  return (
    <section id="reports" className="space-y-4 scroll-mt-20">
      <div className="flex flex-col gap-4 rounded-xl border bg-white/80 p-4 shadow-sm xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <Badge className="mb-3 border-emerald-700/20 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
            {copy.reports.pageBadge}
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {copy.reports.pageTitle}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {copy.reports.pageSubtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm">
            <Download />
            {copy.reports.exportAction}
          </Button>
          <Button variant="outline" size="sm">
            <Share2 />
            {copy.reports.shareAction}
          </Button>
        </div>
      </div>

      <ReportHeroInsight copy={copy} />
      <ReportMetricsVisualization copy={copy} />
      <ReportInsightCard copy={copy} />
      <ReportReasoningTrustSection copy={copy} />
      <ReportTrendCard copy={copy} />
      <ReportActionCommandCenter copy={copy} />
      <ReportMemorySemanticSection copy={copy} />
    </section>
  );
}

export function Dashboard({ view = "overview" }: { view?: DashboardView }) {
  const [locale, , isLocaleReady] = useLocale("en");
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const copy = dashboardCopy[locale];
  const activeTarget =
    view === "import-data"
      ? "#import-data"
      : view === "metrics" || view === "schema"
        ? "#metrics"
        : view === "reports"
          ? "#reports"
          : view === "settings"
          ? "#settings"
          : "#overview";

  if (!isLocaleReady) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="flex min-h-screen" lang={locale === "zh" ? "zh-CN" : "en"}>
      <Sidebar
        copy={copy}
        activeTarget={activeTarget}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed((current) => !current)}
      />
      <div className="min-w-0 flex-1">
        <Header copy={copy} />
        <main
          className={cn(
            "mx-auto grid max-w-[1500px] gap-4 px-4 py-5 lg:px-6 xl:items-start",
            isChatCollapsed ? "xl:grid-cols-[minmax(0,1fr)_76px]" : "xl:grid-cols-[minmax(0,1fr)_430px]"
          )}
        >
          {view === "import-data" ? (
            <div className="min-w-0 xl:col-start-1">
              <ImportDataSection copy={copy} />
            </div>
          ) : view === "metrics" ? (
            <div className="min-w-0 xl:col-start-1">
              <MetricCatalogPage copy={copy} />
            </div>
          ) : view === "schema" ? (
            <div className="min-w-0 xl:col-start-1">
              <SchemaPage copy={copy} />
            </div>
          ) : view === "settings" ? (
            <div className="min-w-0 xl:col-start-1">
              <SettingsPage copy={copy} />
            </div>
          ) : view === "reports" ? (
            <div className="min-w-0 xl:col-start-1">
              <ReportsPage copy={copy} />
            </div>
          ) : (
            <>
              <div className="min-w-0 xl:col-start-1">
                <SetupHero copy={copy} />
              </div>
              <div className="min-w-0 xl:col-start-1">
                <MetricGrid copy={copy} />
              </div>
            </>
          )}
          <ChatPanel
            copy={copy}
            isCollapsed={isChatCollapsed}
            onToggle={() => setIsChatCollapsed((current) => !current)}
            className="min-w-0 xl:sticky xl:top-[76px] xl:col-start-2 xl:row-span-4 xl:row-start-1"
          />
          {view === "overview" ? (
            <div className="min-w-0 xl:col-start-1">
              <ReportsPanel copy={copy} />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
