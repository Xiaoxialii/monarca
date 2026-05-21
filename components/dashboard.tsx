"use client";

import { useUser } from "@clerk/nextjs";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  BrainCircuit,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CreditCard,
  Database,
  Download,
  FileText,
  HelpCircle,
  LineChart,
  Lock,
  Users,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Share2,
  Table2,
  Trash2,
  Copy
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { AuthControls } from "@/components/auth-shell";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCopyLocale, getHtmlLang, useLocale, type CopyLocale, type Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const dashboardCopy = {
  en: {
    navItems: [
      { label: "Analysis Report", href: "/dashboard/reports", target: "#reports", icon: BrainCircuit },
      { label: "Reports", href: "/dashboard/report", target: "#report", icon: FileText },
      { label: "Settings", href: "/dashboard/settings", target: "#settings", icon: Settings }
    ],
    dataNavItems: [
      { label: "Data Sources", href: "/dashboard/import-data", target: "#import-data", icon: Database }
    ],
    sidebar: {
      brand: "Monarca AI",
      subtitle: "Data automation OS",
      statusTitle: "Workspace status",
      statusText: "Connect data to start cleaning, mapping, and generating AI insights",
      subscribe: "Subscribe",
      collapseLabel: "Collapse sidebar",
      expandLabel: "Expand sidebar"
    },
    account: {
      name: "Amy",
      email: "amy@example.com",
      plan: "Pro",
      billing: "Upgrade plan"
    },
    header: {
      openNav: "Open navigation",
      searchPlaceholder: "Search metrics, sources, fields...",
      newSource: "Import data",
      help: "Help",
      notifications: "Notifications"
    },
    hero: {
      badge: "First setup",
      status: "Waiting for data",
      title: "Connect your data to start AI growth analysis",
      description:
        "Import the systems your team already uses, Monarca AI will sync, clean, and map your business semantics before showing any metrics",
      primary: "Import data source",
      secondary: "View metrics architecture",
      note: "No business data is displayed until a source is connected",
      guideTitle: "新手引导",
      guideDescription: "Complete these steps to turn raw systems into your first AI growth report",
      guideSteps: [
        {
          title: "Connect data source",
          text: "Import revenue, product, CRM, ads, or warehouse data"
        },
        {
          title: "Generate Schema",
          text: "Let AI inspect tables, fields, relationships, and quality"
        },
        {
          title: "Confirm metric definitions",
          text: "Review ARR, CAC, retention, activation, and formulas"
        },
        {
          title: "Generate first report",
          text: "Create the first daily growth brief with causes and actions"
        }
      ]
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
      title: "Metric Semantic Layer",
      description: "AI learns how your business measures revenue, acquisition, activation, and retention",
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
      exampleTitle: "Business metrics",
      exampleDescription: "After data import, AI generates business metrics from connected schemas",
      previewTitle: "Connect data to generate business metrics",
      previewDescription:
        "AI will create metric definitions, formulas, source mappings, and ownership context after trusted data is imported",
      previewStatus: "Waiting for data",
      previewGenerated: "Generated after import",
      importedTableTitle: "Metric object table",
      exampleBadge: "Example",
      addMetric: "Add metric",
      deleteMetric: "Delete metric",
      actionHeader: "Actions",
      fieldPicker: "Insert schema field",
      semanticTitle: "Semantic Metric Workspace",
      semanticDescription: "AI turns schemas into business concepts, KPI relationships, and reasoning-ready metrics",
      domainTitle: "Business domains",
      allDomains: "All metrics",
      formulaLabel: "Formula",
      mappedFieldsLabel: "Mapped fields",
      confidenceLabel: "AI confidence",
      semanticTagsLabel: "Semantic meaning",
      editMetric: "Edit",
      closeEdit: "Done",
      aiPanelTitle: "AI semantic reasoning",
      aiPanelDescription: "The system is learning how your schema represents revenue, acquisition, activation, and retention",
      detectedTitle: "Detected concept",
      recommendedTitle: "Suggested related KPIs",
      lineageTitle: "Semantic lineage",
      relationshipTitle: "Metric relationships",
      exampleHeaders: ["Business Layer", "Metric Category", "Metric Name", "Definition", "Formula", "Data Source Mapping", "Generated By"],
      newMetric: {
        layer: "Driver",
        category: "Custom",
        metric: "New Metric",
        definition: "Describe the business meaning",
        formula: "",
        mapping: "Current schema fields",
        status: "AI",
        tags: ["Custom", "Editable"]
      },
      exampleRows: [
        {
          layer: "Primary",
          category: "Revenue",
          metric: "ARR",
          definition: "Annualized recurring revenue from active paid accounts",
          formula: "MRR x 12",
          mapping: "Stripe subscriptions -> active recurring revenue",
          status: "AI",
          tags: ["Semantic", "Revenue"]
        },
        {
          layer: "Driver",
          category: "Expansion",
          metric: "Expansion ARR",
          definition: "Additional ARR generated from existing customers",
          formula: "Upgrade ARR - Downgrade ARR",
          mapping: "CRM opportunities + billing deltas",
          status: "Amy",
          tags: ["Lineage", "Suggested"]
        },
        {
          layer: "Driver",
          category: "Acquisition",
          metric: "CAC",
          definition: "Average cost to acquire one new paying customer",
          formula: "Marketing Spend / New Customers",
          mapping: "Ad platforms + CRM new customer records",
          status: "Amy",
          tags: ["Cost", "Mapping"]
        },
        {
          layer: "Driver",
          category: "Activation",
          metric: "Activation Rate",
          definition: "Share of new accounts reaching the activation event",
          formula: "Activated Users / Signups",
          mapping: "product_event = onboarding_completed",
          status: "AI",
          tags: ["Event", "AI mapped"]
        },
        {
          layer: "Primary",
          category: "Retention",
          metric: "Retention",
          definition: "Share of customers or revenue retained over a period",
          formula: "Retained Customers / Starting Customers",
          mapping: "Billing status + account cohort table",
          status: "Amy",
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
    groupWorkspace: "Workspace settings",
    groupData: "Data management",
    groupAccount: "Account & notifications",
    tabBasicInfo: "Basic information",
    tabMembersRoles: "Members & roles",
    tabSecuritySettings: "Security settings",
    tabSources: "Data sources",
    tabMetricDefinitions: "Metric definitions",
    tabDataPermissions: "Data permissions",
    tabBilling: "Billing",
    tabNotifications: "Notifications",
    dataPermissionsTitle: "Data permissions",
    dataPermissionsDescription: "Control who can view, connect, and validate business data",
    dataPermissions: [
      ["Source access", "Owner / Admin"],
      ["Metric management", "Owner / Admin"],
      ["Report visibility", "Workspace members"]
    ],
    workspaceTitle: "Workspace",
    workspaceDescription: "Basic identity for this analytics workspace",
    workspaceName: "Workspace name",
    workspaceSlug: "Workspace URL",
    workspaceRegion: "Data region",
    workspaceIndustry: "Industry",
    workspaceBusinessType: "Business type",
    workspaceRefreshFrequency: "Data refresh frequency",
    workspaceRefreshOptions: ["Daily", "Hourly", "Manual"],
    workspaceSave: "Save changes",
    connectedSourcesTitle: "Connected data sources",
    connectedSourcesDescription: "Manage currently connected sources in this workspace",
    connectedSourcesRemoveLabel: "Remove",
    connectedSourcesEmpty: "No data source connected yet",
    preferencesTitle: "Workspace preferences",
    preferences: [
      ["Language", "Use homepage language selection"],
      ["Timezone", "Asia / Shanghai"],
      ["Default view", "Overview"]
    ],
    notificationsTitle: "Notifications",
    notifications: [
      ["Anomaly alerts", "On"],
      ["Daily growth brief", "On"],
      ["Data sync failures", "On"]
    ],
    securityTitle: "Data & security",
    security: [
      ["Access control", "Invite teammates after data import"],
      ["API keys", "No keys created"],
      ["Data retention", "Workspace default"]
    ],
    teamMembersTitle: "Team members",
    teamMembersDescription:
      "Invite teammates to collaborate on business metrics, review roles, and adjust access as your team grows",
    teamMembersEmpty:
      "Invite team members to view AI insights, reports, and operating workflows together.",
    teamInviteButton: "Invite member",
    teamInviteTitle: "Invite team member",
    teamInviteDescription:
      "Members can access workspace data only after approval by the workspace owner or admin",
    teamInviteEmailLabel: "Email",
    teamInviteRoleLabel: "Role",
    teamInviteCancel: "Cancel",
    teamInviteSubmit: "Send invite",
    teamInviteSubmitting: "Sending",
    teamInviteNotice:
      "Invite by email directly. Invited teammates show as pending until they join and link their workspace account.",
    teamMembersRoleTitle: "Role",
    teamMembersStatusTitle: "Status",
    teamMembersStatusLabels: {
      active: "Active",
      invited: "Invited",
      removed: "Removed"
    },
    teamMembersRoleLabels: {
      owner: "Owner",
      admin: "Admin",
      viewer: "Viewer"
    },
    teamRoleOptions: [
      { value: "admin", label: "Admin" },
      { value: "viewer", label: "Viewer" }
    ],
    teamMembersRemoveLabel: "Remove",
    teamMembersRemovingLabel: "Removing",
    billingTitle: "Billing",
    billingPlan: "Professional",
    billingDescription: "Report automation, data analysis, and decision support",
    billingAction: "Manage plan",
    teamStatusLabels: {
      active: "Active",
      invited: "Invited",
      removed: "Removed"
    }
  },
    onboarding: {
      title: "First data import flow",
      description: "",
      badge: "Automated sync",
      steps: [
        {
          title: "Connect business data",
          text: "Bring in the systems your team already uses"
        },
        {
          title: "Understand your business",
          text: "Map fields into customers, revenue, accounts, and events"
        },
        {
          title: "Find key metrics",
          text: "Generate business metrics for AI reasoning"
        },
        {
          title: "Start automated analysis",
          text: "Monitor changes and generate reports continuously"
        }
      ]
    },
    importData: {
      description: "Start with the systems your team already uses",
      connectedTitle: "Connected data",
      connectedDescription: "Connected sources, sync status, and last refresh will appear here",
      connectedCount: "0 connected",
      connectedEmptyTitle: "No data sources connected",
      connectedEmptyText: "Choose a source below and validate access to save the connection and scan schema"
    },
    connectors: {
      title: "Connect data source",
      description: "Choose a source, validate access, then save the connection and read schema structure",
      status: "Ready",
      connectedTitle: "Connected databases",
      connectedDescription: "Manage sources that have already been connected to this workspace",
      connectedStatus: "Connected",
      connectedCountLabel: "connected",
      editAction: "Edit",
      doneAction: "Done",
      deleteAction: "Remove",
      lastSyncLabel: "Last sync",
      syncModeLabel: "Mode",
      noConnectedTitle: "No connected databases yet",
      noConnectedText: "Connected databases will appear here after the connection is saved and schema is scanned",
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
      connectAction: "Connect",
      changeSourceAction: "Change source",
      schemaTitle: "Current schema",
      schemaBadge: "Example",
      schemaDescription: "No data source is connected yet, this example shows how the current schema will appear after validation",
      schemaTables: [
        { name: "accounts", fields: ["account_id", "segment", "created_at", "country"] },
        { name: "subscriptions", fields: ["subscription_id", "account_id", "mrr", "status"] },
        { name: "events", fields: ["event_name", "user_id", "device", "occurred_at"] },
        { name: "campaigns", fields: ["campaign_id", "channel", "spend", "new_customers"] }
      ],
      testAction: "Test connection",
      importAction: "Connect and import"
    },
    chat: {
      title: "AI Follow-up Analysis",
      description: "",
      status: "",
      collapseLabel: "Collapse AI Follow-up Analysis",
      expandLabel: "Expand AI Follow-up Analysis",
      assistantMessage: "Ask attribution questions across revenue, retention, channels, and user cohorts",
      userQuestion: "Which user segment drove the revenue drop?",
      assistantReply: "Break it down by country, device, channel, and cohort; start with the segment with the largest variance",
      inputPlaceholder: "Ask about data, metrics, or setup...",
      sendLabel: "Send message"
    },
    reports: {
      title: "Reports & Analysis",
      description: "Automated reports will be generated after your data sources are connected",
      pending: "Waiting for data",
      cards: [
        ["Daily growth brief", "Summaries will appear after data is imported"],
        ["Data automation log", "Refresh, cleaning, and mapping status will be tracked here"],
        ["Executive summary", "Board-ready notes will be generated from trusted metrics"]
      ],
      pageBadge: "AI intelligence live",
      pageTitle: "Analysis Report",
      pageSubtitle:
        "A real-time business intelligence workspace that monitors revenue, explains changes, and turns insights into operations",
      periodLabel: "Reporting period",
      periodValue: "This week",
      generatedLabel: "Generated",
      generatedValue: "After data import",
      exportAction: "Export",
      shareAction: "Share",
      databaseCtaTitle: "Connect business data",
      databaseCtaEmpty: "After importing a database, AI will automatically generate an analysis report",
      databaseCtaConnected: "Manage connected database",
      databaseCtaDisconnected: "Connect database",
      liveStatuses: [
        "Syncing Stripe data",
        "Processing 4.2M events",
        "Correlating retention anomalies",
        "Executive summary updated 2 min ago"
      ],
      heroLabel: "Critical business change",
      heroMetric: "Revenue",
      heroValue: "Pending",
      heroBaseline: "Available after analysis",
      heroSeverity: "No report generated yet",
      heroImpact: "Business impact will appear after analysis",
      heroSummary:
        "AI identified a material revenue anomaly driven by conversion, acquisition efficiency, and early retention weakness",
      businessImpactLabel: "Business impact",
      ownerLabel: "Owner",
      impactLabel: "Impact",
      previewLabel: "Template preview",
      metricsTitle: "Metric snapshot",
      metricsDescription: "",
      emptyReportTitle: "Today's business briefing",
      emptyReportDescription:
        "AI briefing preview, real numbers and evidence appear after connecting business data",
      emptyBriefingBadge: "AI briefing preview",
      emptyBriefingMetric: "Ready to generate your first briefing",
      emptyBriefingTimeComparisons: [
        ["Data source", "Pending"],
        ["Schema", "Pending"],
        ["Metrics", "Pending"],
        ["Report", "Not generated"]
      ],
      emptyBriefingSections: [
        ["Before analysis", "Connect business data", "Confirm metric definitions"],
        ["AI will prepare", "Trend checks", "Evidence chains"],
        ["Next steps", "Generate the first report", "Review metric logic"]
      ],
      emptyBriefingActions: ["Expand evidence chain", "View trend", "View cohort"],
      demoTitle: "AI is monitoring",
      demoSwitchLabel: "More...",
      demoCollapseLabel: "Show less",
      demoSignalLabel: "Signals AI would inspect",
      demoExamples: [
        {
          title: "Business metric shifts",
          metric: "Metrics",
          summary:
            "Detect unexpected movement in core operating, financial, and performance metrics",
          signals: ["Core KPIs", "Baseline", "Variance"]
        },
        {
          title: "Customer and user changes",
          metric: "Audience",
          summary:
            "Explain changes across segments, cohorts, usage patterns, and repeat behavior",
          signals: ["Segments", "Cohorts", "Behavior"]
        },
        {
          title: "Cost efficiency",
          metric: "Efficiency",
          summary:
            "Track how spend, resources, and operational effort convert into business outcomes",
          signals: ["Cost", "Output", "ROI"]
        },
        {
          title: "Channel and region performance",
          metric: "Markets",
          summary:
            "Compare regions, channels, stores, teams, or business units against expected baselines",
          signals: ["Region", "Channel", "Business unit"]
        },
        {
          title: "Process conversion",
          metric: "Flow",
          summary:
            "Find where people, orders, leads, or tasks drop off across key business workflows",
          signals: ["Funnel steps", "Completion", "Drop-off"]
        }
      ],
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
        ["Executive summary", "What changed today", "Primary metrics", "Waiting"],
        ["Root-cause analysis", "Why did it change", "Driver metrics", "Waiting"],
        ["Data automation", "Can the data be trusted", "Sync and quality checks", "Waiting"],
        ["Action plan", "What should the team do next", "Validated insights", "Waiting"]
      ],
      actionTitle: "Action queue",
      actions: [
        "Connect revenue, product, and CRM sources",
        "Map core fields to business semantics",
        "Generate the first automated daily report"
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
      { label: "分析报告", href: "/dashboard/reports", target: "#reports", icon: BrainCircuit },
      { label: "报表", href: "/dashboard/report", target: "#report", icon: FileText },
      { label: "设置", href: "/dashboard/settings", target: "#settings", icon: Settings }
    ],
    dataNavItems: [
      { label: "数据源", href: "/dashboard/import-data", target: "#import-data", icon: Database }
    ],
    sidebar: {
      brand: "蝴蝶效应",
      subtitle: "数据自动化系统",
      statusTitle: "工作区状态",
      statusText: "连接数据后，系统会自动清洗、映射业务语义，并生成 AI 洞察",
      subscribe: "订阅",
      collapseLabel: "收起侧边栏",
      expandLabel: "展开侧边栏"
    },
    account: {
      name: "Amy",
      email: "amy@example.com",
      plan: "Pro",
      billing: "升级套餐"
    },
    header: {
      openNav: "打开导航",
      searchPlaceholder: "搜索指标、数据源、字段...",
      newSource: "导入数据",
      help: "帮助",
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
      note: "连接数据源前，不展示任何业务数据",
      guideTitle: "Onboarding guide",
      guideDescription: "完成这 4 步，把原始系统转化为第一份 AI 增长报告",
      guideSteps: [
        {
          title: "连接数据源",
          text: "导入收入、产品、CRM、广告或数仓数据"
        },
        {
          title: "生成 Schema",
          text: "让 AI 识别表、字段、关系和数据质量"
        },
        {
          title: "确认指标定义",
          text: "确认 ARR、CAC、留存、激活和公式口径"
        },
        {
          title: "生成第一份报告",
          text: "生成包含原因和行动建议的每日增长简报"
        }
      ]
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
      title: "指标语义层",
      description: "让 AI 学习你的业务如何衡量收入、获客、激活和留存",
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
      exampleTitle: "业务指标",
      exampleDescription: "导入数据后，AI 会基于已连接的 Schema 自动生成业务指标",
      previewTitle: "连接数据后 AI 将自动生成业务指标",
      previewDescription: "导入可信数据后，会生成指标定义、公式、数据源映射和维护信息",
      previewStatus: "等待导入",
      previewGenerated: "导入后生成",
      importedTableTitle: "指标对象表",
      exampleBadge: "示例",
      addMetric: "新增指标",
      deleteMetric: "删除指标",
      actionHeader: "操作",
      fieldPicker: "插入 Schema 字段",
      semanticTitle: "语义指标工作区",
      semanticDescription: "AI 将 Schema 转化为业务概念、指标关系和可推理的指标层",
      domainTitle: "业务域",
      allDomains: "全部指标",
      formulaLabel: "公式",
      mappedFieldsLabel: "映射字段",
      confidenceLabel: "AI 置信度",
      semanticTagsLabel: "语义含义",
      editMetric: "编辑",
      closeEdit: "完成",
      aiPanelTitle: "AI 语义推理",
      aiPanelDescription: "系统正在学习你的 Schema 如何表达收入、获客、激活和留存",
      detectedTitle: "识别到的业务概念",
      recommendedTitle: "建议关联指标",
      lineageTitle: "语义血缘",
      relationshipTitle: "指标关系",
      exampleHeaders: ["业务层", "指标分类", "指标名称", "定义", "公式", "数据源映射", "生成者"],
      newMetric: {
        layer: "驱动",
        category: "自定义",
        metric: "新指标",
        definition: "描述业务含义",
        formula: "",
        mapping: "当前 Schema 字段",
        status: "AI",
        tags: ["自定义", "可编辑"]
      },
      exampleRows: [
        {
          layer: "核心",
          category: "收入",
          metric: "ARR",
          definition: "当前有效付费账户的年化经常性收入",
          formula: "MRR x 12",
          mapping: "Stripe subscriptions -> active recurring revenue",
          status: "AI",
          tags: ["语义层", "收入"]
        },
        {
          layer: "驱动",
          category: "扩张收入",
          metric: "Expansion ARR",
          definition: "来自存量客户升级或增购产生的新增 ARR",
          formula: "升级 ARR - 降级 ARR",
          mapping: "CRM opportunities + billing deltas",
          status: "Amy",
          tags: ["血缘", "AI 建议"]
        },
        {
          layer: "驱动",
          category: "获客",
          metric: "CAC",
          definition: "获取一个新增付费客户的平均成本",
          formula: "营销费用 / 新增客户数",
          mapping: "广告平台 + CRM 新客户记录",
          status: "Amy",
          tags: ["成本", "待映射"]
        },
        {
          layer: "驱动",
          category: "激活",
          metric: "激活率",
          definition: "新账户完成关键激活事件的比例",
          formula: "已激活用户 / 注册用户",
          mapping: "product_event = onboarding_completed",
          status: "AI",
          tags: ["事件", "AI 映射"]
        },
        {
          layer: "核心",
          category: "留存",
          metric: "Retention",
          definition: "统计周期内保留下来的客户或收入比例",
          formula: "留存客户 / 期初客户",
          mapping: "Billing status + account cohort table",
          status: "Amy",
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
      groupWorkspace: "工作区设置",
      groupData: "数据管理",
      groupAccount: "账户与通知",
      tabBasicInfo: "基本信息",
      tabMembersRoles: "成员与角色",
      tabSecuritySettings: "安全设置",
      tabSources: "数据源",
      tabMetricDefinitions: "指标定义",
      tabDataPermissions: "数据权限",
      tabBilling: "账单",
      tabNotifications: "通知",
      dataPermissionsTitle: "数据权限",
      dataPermissionsDescription: "管理谁可以查看、连接和校验业务数据",
      dataPermissions: [
        ["数据源访问", "Owner / Admin"],
        ["指标管理", "Owner / Admin"],
        ["报告可见范围", "工作区成员"]
      ],
      workspaceTitle: "工作区",
      workspaceDescription: "当前分析工作区的基础信息",
      workspaceName: "工作区名称",
      workspaceSlug: "工作区地址",
      workspaceRegion: "数据区域",
      workspaceIndustry: "行业",
      workspaceBusinessType: "业务类型",
      workspaceRefreshFrequency: "数据刷新频率",
      workspaceRefreshOptions: ["每日", "每小时", "手动"],
      workspaceSave: "保存更改",
      preferencesTitle: "偏好设置",
      preferences: [
        ["语言", "跟随首页语言选择"],
        ["时区", "Asia / Shanghai"],
        ["默认视图", "概览"]
      ],
      notificationsTitle: "通知",
      notifications: [
        ["异常提醒", "开启"],
        ["每日增长简报", "开启"],
        ["数据同步失败", "开启"]
      ],
      securityTitle: "数据与安全",
      security: [
        ["访问权限", "导入数据后邀请团队成员"],
        ["API Keys", "暂未创建"],
        ["数据保留", "工作区默认"]
      ],
      teamMembersTitle: "团队成员",
      teamMembersDescription:
        "邀请团队成员一起配置指标和共享经营洞察，持续优化增长决策",
      teamMembersEmpty:
        "邀请团队成员查看 AI 洞察、经营报告和运营工作台",
      teamInviteButton: "邀请成员",
      teamInviteTitle: "邀请团队成员",
      teamInviteDescription: "仅工作区 owner / admin 审核通过后，成员可查看工作区分析数据",
      teamInviteEmailLabel: "邮箱",
      teamInviteRoleLabel: "角色",
      teamInviteCancel: "取消",
      teamInviteSubmit: "发送邀请",
      teamInviteSubmitting: "发送中",
      connectedSourcesTitle: "已连接数据源",
      connectedSourcesDescription: "管理当前工作区已连接的数据源",
      connectedSourcesRemoveLabel: "移除",
      connectedSourcesEmpty: "尚未连接数据源",
      teamMembersRemoveLabel: "移除",
      teamMembersRemovingLabel: "移除中",
      teamMembersRoleTitle: "角色",
      teamMembersStatusTitle: "状态",
      teamMembersRoleLabels: {
        owner: "Owner",
        admin: "管理员",
        viewer: "观察者"
      },
      teamRoleOptions: [
        { value: "admin", label: "管理员" },
        { value: "viewer", label: "观察者" }
      ],
      teamMembersStatusLabels: {
        active: "已生效",
        invited: "待接受",
        removed: "已移除"
      },
    teamInviteNotice: "支持邮箱邀请。未注册成员会显示为待接受状态，完成注册后可激活成员关系。",
      billingTitle: "账单",
      billingPlan: "专业版",
      billingDescription: "报告自动化、数据分析和决策辅助",
      billingAction: "管理方案"
    },
    onboarding: {
      title: "首次数据导入流程",
      description: "",
      badge: "自动同步",
      steps: [
        {
          title: "连接业务数据",
          text: "接入团队已经在使用的系统"
        },
        {
          title: "理解你的业务",
          text: "把字段映射为客户、收入、账户和事件"
        },
        {
          title: "发现关键指标",
          text: "生成可供 AI 推理的业务指标"
        },
        {
          title: "开始自动分析",
          text: "持续监控变化并自动生成报告"
        }
      ]
    },
    importData: {
      description: "从团队已经在使用的系统开始",
      connectedTitle: "当前已连接的数据",
      connectedDescription: "连接后会在这里显示数据源、同步状态和最近更新时间",
      connectedCount: "0 个已连接",
      connectedEmptyTitle: "尚未连接数据源",
      connectedEmptyText: "选择下方数据源并验证权限后，即可保存连接并扫描数据结构"
    },
    connectors: {
      title: "连接数据源",
      description: "选择数据源，验证访问权限后保存连接并读取数据结构",
      status: "可连接",
      connectedTitle: "已连接数据库",
      connectedDescription: "管理当前工作区已经连接的数据源",
      connectedStatus: "已连接",
      connectedCountLabel: "个已连接",
      editAction: "编辑",
      doneAction: "完成",
      deleteAction: "删除连接",
      lastSyncLabel: "最近同步",
      syncModeLabel: "模式",
      noConnectedTitle: "当前尚未连接数据库",
      noConnectedText: "保存连接并读取结构后，数据库会显示在这里",
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
      connectAction: "连接",
      changeSourceAction: "重新选择",
      schemaTitle: "当前 Schema",
      schemaBadge: "示例",
      schemaDescription: "尚未连接数据源，以下示例展示验证后当前 Schema 的呈现方式",
      schemaTables: [
        { name: "accounts", fields: ["account_id", "segment", "created_at", "country"] },
        { name: "subscriptions", fields: ["subscription_id", "account_id", "mrr", "status"] },
        { name: "events", fields: ["event_name", "user_id", "device", "occurred_at"] },
        { name: "campaigns", fields: ["campaign_id", "channel", "spend", "new_customers"] }
      ],
      testAction: "测试连接",
      importAction: "连接并导入"
    },
    chat: {
      title: "AI继续分析",
      description: "",
      status: "",
      collapseLabel: "收起 AI继续分析",
      expandLabel: "展开 AI继续分析",
      assistantMessage: "可以直接问我收入、留存、渠道或用户群体的归因问题",
      userQuestion: "收入下降主要来自哪个用户群体？",
      assistantReply: "可以按国家、设备、渠道和 cohort 拆解，优先查看美国 iOS 新付费用户",
      inputPlaceholder: "询问数据、指标或设置...",
      sendLabel: "发送消息"
    },
    reports: {
      title: "报告与分析",
      description: "连接数据源后，系统会自动生成增长简报和数据自动化记录",
      pending: "等待数据",
      cards: [
        ["每天增长简报", "导入数据后，这里会自动生成摘要"],
        ["数据自动化记录", "自动同步、清洗和语义映射状态会在这里追踪"],
        ["管理层摘要", "可信指标准备好后，会自动生成汇报说明"]
      ],
      pageBadge: "AI 实时分析",
      pageTitle: "分析报告",
      pageSubtitle: "实时监控经营变化、解释业务原因，并把洞察转化为可创造价值的行动",
      periodLabel: "报告周期",
      periodValue: "今日",
      generatedLabel: "生成状态",
      generatedValue: "导入数据后生成",
      exportAction: "导出",
      shareAction: "分享",
      databaseCtaTitle: "连接业务数据",
      databaseCtaEmpty: "导入数据库后，AI 将自动生成经营分析报告",
      databaseCtaConnected: "管理已连接数据库",
      databaseCtaDisconnected: "连接数据库",
      liveStatuses: [
        "正在同步 Stripe 数据",
        "正在处理 420 万事件",
        "正在关联留存异常",
        "管理层摘要已于 2 分钟前更新"
      ],
      heroLabel: "关键业务变化",
      heroMetric: "收入",
      heroValue: "待生成",
      heroBaseline: "完成分析后展示",
      heroSeverity: "尚未生成报告",
      heroImpact: "业务影响会在分析完成后展示",
      heroSummary: "AI 识别到一次重要收入异常，主要由转化、获客效率和早期留存共同驱动",
      businessImpactLabel: "业务影响",
      ownerLabel: "负责人",
      impactLabel: "预期影响",
      previewLabel: "模板预览",
      metricsTitle: "指标快照",
      metricsDescription: "",
      emptyReportTitle: "今日经营简报",
      emptyReportDescription: "AI 简报预览，连接业务数据后会展示真实数值和证据链",
      emptyBriefingBadge: "AI briefing 预览",
      emptyBriefingMetric: "准备生成第一份经营简报",
      emptyBriefingTimeComparisons: [
        ["数据源", "待确认"],
        ["Schema", "待生成"],
        ["指标", "待确认"],
        ["报告", "未生成"]
      ],
      emptyBriefingSections: [
        ["分析前准备", "连接业务数据", "确认指标定义"],
        ["AI 将生成", "趋势检查", "证据链"],
        ["下一步", "生成第一份报告", "检查指标逻辑"]
      ],
      emptyBriefingActions: ["展开证据链", "查看趋势", "查看 cohort"],
      demoTitle: "AI 正在监控",
      demoSwitchLabel: "更多...",
      demoCollapseLabel: "收起",
      demoSignalLabel: "AI 会检查的信号",
      demoExamples: [
        {
          title: "经营指标变化",
          metric: "指标",
          summary: "识别核心经营、财务和绩效指标中的异常波动",
          signals: ["核心 KPI", "历史基线", "波动幅度"]
        },
        {
          title: "客户与用户变化",
          metric: "人群",
          summary: "解释不同分群、cohort、使用行为和复购行为的变化",
          signals: ["用户分群", "cohort", "行为路径"]
        },
        {
          title: "成本效率",
          metric: "效率",
          summary: "追踪投入、资源和运营动作如何转化为业务结果",
          signals: ["成本", "产出", "ROI"]
        },
        {
          title: "渠道与区域表现",
          metric: "市场",
          summary: "对比区域、渠道、门店、团队或业务单元的基线变化",
          signals: ["区域", "渠道", "业务单元"]
        },
        {
          title: "流程转化",
          metric: "流程",
          summary: "定位用户、订单、线索或任务在关键业务流程中的流失位置",
          signals: ["流程步骤", "完成率", "流失点"]
        }
      ],
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
      evidenceMetric: "核心指标变化待分析",
      evidenceDrivers: ["字段语义", "指标定义", "数据质量"],
      confidenceLabel: "置信度",
      confidenceValue: "82%",
      whyLabel: "原因判断依据",
      reasoningNodes: [
        {
          title: "指标变化",
          delta: "待分析",
          detail: "连接数据并生成报告后展示真实异常",
          children: ["趋势变化", "维度拆解", "证据链"]
        },
        {
          title: "维度拆解",
          delta: "待分析",
          detail: "按地区、渠道、用户类型或业务单元定位变化来源",
          children: ["地区", "渠道", "用户类型"]
        },
        {
          title: "原因判断",
          delta: "待分析",
          detail: "根据业务语义和指标关系解释可能原因",
          children: ["指标关系", "历史基线", "数据新鲜度"]
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
          text: "连接数据后，AI 会先分析核心指标的变化方向、幅度和历史基线"
        },
        {
          step: "02",
          title: "原因分析",
          text: "AI 会结合字段语义、指标定义和维度拆解，解释可能的业务原因"
        },
        {
          step: "03",
          title: "行动建议",
          text: "AI 会把可信洞察转化为后续行动建议，并保留对应证据链"
        }
      ],
      tableTitle: "报表结构",
      tableHeaders: ["模块", "回答的问题", "所需数据", "状态"],
      tableRows: [
        ["管理层摘要", "今天发生了什么变化", "一级指标", "等待中"],
        ["根因分析", "为什么会发生变化", "二级驱动指标", "等待中"],
        ["数据自动化", "数据是否可信", "同步和质量检查", "等待中"],
        ["行动计划", "团队下一步做什么", "已验证洞察", "等待中"]
      ],
      actionTitle: "行动队列",
      actions: [
        "连接收入、产品和 CRM 数据源",
        "把核心字段映射到业务语义",
        "生成第一份自动化日报"
      ],
      commandTitle: "行动指挥中心",
      commandDescription: "把分析结论转化为跨团队可执行工作流",
      workflows: [
        {
          label: "创建 Jira 任务",
          title: "排查关键流程异常",
          owner: "产品团队",
          priority: "高",
          impact: "+6.4% 转化恢复",
          cta: "创建任务"
        },
        {
          label: "启动 CRM 流程",
          title: "跟进高风险客户或用户群体",
          owner: "生命周期团队",
          priority: "中",
          impact: "+4.8% 留存提升",
          cta: "启动流程"
        },
        {
          label: "调整预算",
          title: "优化低效率投入",
          owner: "增长团队",
          priority: "高",
          impact: "-12% CAC 风险",
          cta: "查看预算"
        }
      ],
      memoryTitle: "AI 业务记忆",
      memoryItems: [
        "系统会记录相似异常是否重复出现",
        "系统会追踪关键指标是否持续变化",
        "系统会把指标波动与历史业务动作关联"
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

type DashboardCopy = (typeof dashboardCopy)[CopyLocale];
type DashboardView =
  | "overview"
  | "import-data"
  | "import-data-connect"
  | "metrics"
  | "schema"
  | "reports"
  | "report"
  | "settings";

type TeamMemberRole = "owner" | "admin" | "viewer";
type TeamMemberStatus = "active" | "invited" | "removed";
type TeamMemberRow = {
  id: string;
  userId: string | null;
  name: string | null;
  email: string;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  joinedAt: string;
};
type ConnectedSourceRow = {
  id: string;
  name: string;
  provider: string;
  type: string;
  status: string;
  connectionMode?: string | null;
  authMethod?: string | null;
  config?: {
    type?: string | null;
    host?: string | null;
    port?: number | null;
    database?: string | null;
    ssl?: boolean | null;
    fileName?: string | null;
    fileSize?: number | null;
    extension?: string | null;
  } | null;
  schema?: {
    tableCount?: number | null;
    columnCount?: number | null;
    scannedAt?: string | null;
    tables?: Array<{
      name: string;
      schema?: string | null;
      columns: Array<{
        name: string;
        type?: string | null;
        nullable?: boolean | null;
      }>;
    }>;
  } | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
};
type SettingsTab =
  | "basic"
  | "members"
  | "security"
  | "sources"
  | "metrics"
  | "data-permissions"
  | "billing"
  | "notifications";
type EditableMetricRow = {
  id: string;
  layer: string;
  category: string;
  metric: string;
  definition: string;
  formula: string;
  mapping: string;
  status: string;
  tags: string[];
};
type MetricFieldOption = {
  key: string;
  table: string;
  schema?: string | null;
  name: string;
  type?: string | null;
  nullable?: boolean | null;
};
type MetricFieldTable = {
  name: string;
  schema?: string | null;
  columns: MetricFieldOption[];
};
type MetricSuggestion = {
  id: string;
  title: string;
  category: string;
  layer: string;
  definition: string;
  formula: string;
  optimization: string;
  tags: string[];
  sourceFields: MetricFieldOption[];
};

function navLabel(copy: DashboardCopy, href: string) {
  if (href === "#metrics") {
    return copy.metricCatalog.exampleTitle;
  }

  return (
    [...copy.navItems, ...copy.dataNavItems].find((item) => item.target === href)?.label ??
    (href === "#ai-chat" ? copy.chat.title : "")
  );
}

function SidebarSubscribeLink({
  copy,
  isCollapsed
}: {
  copy: DashboardCopy;
  isCollapsed: boolean;
}) {
  return (
    <a
      href="/checkout/professional"
      title={isCollapsed ? copy.sidebar.subscribe : undefined}
      className={cn(
        "flex h-9 w-full items-center rounded-md text-sm font-medium text-emerald-800 transition hover:bg-emerald-50",
        isCollapsed ? "justify-center px-0" : "gap-2 px-2"
      )}
    >
      <CreditCard className="size-4" />
      <span className={cn(isCollapsed && "sr-only")}>{copy.sidebar.subscribe}</span>
    </a>
  );
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
  const { isLoaded, isSignedIn, user } = useUser();
  const accountName = user?.fullName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? "";
  const accountEmail = user?.primaryEmailAddress?.emailAddress;
  const accountImageUrl = user?.imageUrl;
  const accountInitials = accountName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || accountEmail?.[0]?.toUpperCase() || "U";

  const renderNavItem = (item: DashboardCopy["navItems"][number]) => {
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
  };

  return (
    <aside
      className={cn(
        "hidden h-screen shrink-0 flex-col border-r bg-white/72 px-3 pb-4 pt-4 backdrop-blur transition-[width] duration-200 lg:flex",
        isCollapsed ? "w-20" : "w-64"
      )}
    >
      <div
        className={cn(
          "mb-6 flex items-center",
          isCollapsed ? "flex-col gap-2 px-0" : "justify-between gap-2 px-2"
        )}
      >
        <div className={cn("flex min-w-0 items-center gap-3", isCollapsed && "justify-center")}>
          <BrandLogo compact label={copy.sidebar.brand} className="h-10 w-10 shrink-0" />
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
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {copy.navItems.map(renderNavItem)}
      </nav>
      <div className="mt-auto pt-3">
        {!isLoaded ? (
          <div className={cn("animate-pulse rounded-lg bg-secondary/70", isCollapsed ? "mx-auto size-10 rounded-full" : "mx-2 h-12")} />
        ) : !isSignedIn ? (
          isCollapsed ? null : (
            <div className="px-2">
              <a
                href="/sign-in"
                className="flex h-10 items-center justify-center rounded-lg border text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                登录
              </a>
            </div>
          )
        ) : isCollapsed ? (
          <a
            href="/checkout/professional"
            title={`${accountName}${accountEmail ? ` · ${accountEmail}` : ""}`}
            className="mx-auto grid size-10 place-items-center overflow-hidden rounded-full bg-teal-600 text-sm font-semibold text-white transition hover:bg-teal-700"
          >
            {accountImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={accountImageUrl} alt={accountName} className="size-full object-cover" />
            ) : (
              accountInitials
            )}
          </a>
        ) : (
          <div className="px-2">
            <a
              href="/checkout/professional"
              className="flex items-end justify-between gap-3 rounded-lg px-1.5 py-1.5 transition hover:bg-secondary/75"
            >
              <div className="flex min-w-0 items-end gap-2.5">
                <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-teal-600 text-sm font-semibold text-white">
                  {accountImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={accountImageUrl} alt={accountName} className="size-full object-cover" />
                  ) : (
                    accountInitials
                  )}
                </div>
                <div className="min-w-0 pb-0.5">
                  <p className="truncate text-sm font-semibold">{accountName}</p>
                  {accountEmail ? (
                    <p className="truncate text-xs text-muted-foreground">{accountEmail}</p>
                  ) : null}
                </div>
              </div>
              <span className="inline-flex h-7 shrink-0 items-center rounded-md border bg-secondary/35 px-2 text-xs font-medium text-muted-foreground">
                升级
              </span>
            </a>
          </div>
        )}
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
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <a href="/support">
              <HelpCircle />
              {copy.header.help}
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
  const reportsLabel = navLabel(copy, "#reports");
  const guideRoutes = [
    { href: "/dashboard/import-data", icon: Database },
    { href: "/dashboard/schema", icon: Table2 },
    { href: "/dashboard/metrics", icon: LineChart },
    { href: "/dashboard/reports", icon: FileText }
  ];

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
          <div className="mt-6 rounded-xl border bg-white/80 p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold tracking-tight">{copy.hero.guideTitle}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {copy.hero.guideDescription}
                </p>
              </div>
              <Badge variant="secondary" className="w-fit shrink-0">0/4</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              {copy.hero.guideSteps.map((step, index) => {
                const GuideIcon = guideRoutes[index]?.icon ?? CheckCircle2;

                return (
                  <a
                    key={step.title}
                    href={guideRoutes[index]?.href ?? "/dashboard"}
                    className="group rounded-lg border bg-background p-3 transition hover:border-emerald-200 hover:bg-emerald-50/50"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-md bg-emerald-50 text-xs font-semibold text-emerald-800">
                          {index + 1}
                        </span>
                        <GuideIcon className="size-4 text-emerald-800" />
                      </div>
                      <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-emerald-800" />
                    </div>
                    <p className="text-sm font-semibold">{step.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.text}</p>
                  </a>
                );
              })}
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-emerald-100 bg-emerald-50/40 p-4">
              <div className="mb-3">
                <p className="text-sm font-semibold">{reportsLabel}</p>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                  {copy.reports.description}
                </p>
              </div>
              <div className="grid gap-2 lg:grid-cols-3">
                {copy.reports.cards.map(([title, text]) => (
                  <div
                    key={title}
                    className="rounded-lg border border-dashed bg-white/85 p-3 shadow-sm shadow-emerald-900/5"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary">
                        <FileText className="size-4" />
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {copy.reports.pending}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
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

function SemanticMetricObjects({ copy }: { copy: DashboardCopy }) {
  const hasImportedData = true;
  const isZh = copy.metricCatalog.exampleBadge === "示例";

  const [metricRows, setMetricRows] = useState<EditableMetricRow[]>([]);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(true);
  const [isMetricBuilderOpen, setIsMetricBuilderOpen] = useState(false);
  const [fieldTables, setFieldTables] = useState<MetricFieldTable[]>([]);
  const [selectedMetricTableKey, setSelectedMetricTableKey] = useState("");
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>([]);
  const [metricSuggestions, setMetricSuggestions] = useState<MetricSuggestion[]>([]);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string>("");
  const [isManualMetricMode, setIsManualMetricMode] = useState(false);
  const [manualMetricName, setManualMetricName] = useState("");
  const [manualMetricCategory, setManualMetricCategory] = useState("");
  const [manualMetricLayer, setManualMetricLayer] = useState("DRIVER");
  const [manualMetricDefinition, setManualMetricDefinition] = useState("");
  const [manualMetricFormula, setManualMetricFormula] = useState("");
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [isSavingMetric, setIsSavingMetric] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const loadMetrics = async (shouldGenerate = true) => {
      const response = await fetch("/api/metrics", { cache: "no-store" });
      const payload = response.ok ? await response.json().catch(() => null) : null;

      if (isCancelled) {
        return;
      }

      if (payload?.ok && Array.isArray(payload.metrics) && payload.metrics.length > 0) {
        setMetricRows(payload.metrics as EditableMetricRow[]);
        return;
      }

      if (shouldGenerate) {
        const generateResponse = await fetch("/api/metrics", { method: "POST" });

        if (generateResponse.ok) {
          await loadMetrics(false);
          return;
        }
      }

      setMetricRows([]);
    };

    setIsLoadingMetrics(true);
    setMetricRows([]);

    void loadMetrics()
      .catch(() => {
        if (!isCancelled) {
          setMetricRows([]);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingMetrics(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [copy]);

  const deleteMetric = (id: string) => {
    setMetricRows((rows) => rows.filter((row) => row.id !== id));
  };

  const openMetricBuilder = async () => {
    setIsMetricBuilderOpen(true);
    setBuilderError(null);
    setMetricSuggestions([]);
    setSelectedSuggestionId("");
    setIsManualMetricMode(false);
    setManualMetricName("");
    setManualMetricCategory("");
    setManualMetricLayer("DRIVER");
    setManualMetricDefinition("");
    setManualMetricFormula("");
    setSelectedFieldKeys([]);
    setSelectedMetricTableKey("");
    setIsLoadingFields(true);

    try {
      const response = await fetch("/api/metrics/fields", { cache: "no-store" });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || (isZh ? "无法读取字段" : "Failed to load fields"));
      }

      const tables = Array.isArray(payload.tables) ? payload.tables as MetricFieldTable[] : [];
      setFieldTables(tables);
      setSelectedMetricTableKey(tables[0] ? `${tables[0].schema ?? ""}.${tables[0].name}` : "");
    } catch (error) {
      setBuilderError(error instanceof Error ? error.message : isZh ? "无法读取字段" : "Failed to load fields");
    } finally {
      setIsLoadingFields(false);
    }
  };

  const selectedFields = fieldTables.flatMap((table) => table.columns).filter((field) =>
    selectedFieldKeys.includes(field.key)
  );
  const visibleFieldTables = selectedMetricTableKey
    ? fieldTables.filter((table) => `${table.schema ?? ""}.${table.name}` === selectedMetricTableKey)
    : fieldTables.slice(0, 1);

  const changeMetricTable = (tableKey: string) => {
    setSelectedMetricTableKey(tableKey);
    setSelectedFieldKeys([]);
    setMetricSuggestions([]);
    setSelectedSuggestionId("");
    setIsManualMetricMode(false);
    setBuilderError(null);
  };

  const toggleBuilderField = (fieldKey: string) => {
    setSelectedFieldKeys((current) =>
      current.includes(fieldKey)
        ? current.filter((key) => key !== fieldKey)
        : [...current, fieldKey]
    );
    setMetricSuggestions([]);
    setSelectedSuggestionId("");
    setIsManualMetricMode(false);
    setBuilderError(null);
  };

  const fieldReference = (field: MetricFieldOption) =>
    `${field.schema ? `${field.schema}.` : ""}${field.table}.${field.name}`;

  const startManualMetric = () => {
    if (selectedFields.length === 0) {
      setBuilderError(isZh ? "请至少选择一个字段" : "Select at least one field");
      return;
    }

    const firstField = selectedFields[0];
    setIsManualMetricMode(true);
    setSelectedSuggestionId("manual");
    setBuilderError(null);
    setManualMetricName((current) => current || firstField.name);
    setManualMetricCategory((current) => current || (isZh ? "自定义" : "Custom"));
    setManualMetricDefinition((current) =>
      current || (isZh ? `基于 ${firstField.name} 定义的自定义业务指标` : `Custom business metric based on ${firstField.name}`)
    );
    setManualMetricFormula((current) => current || `COUNT(${fieldReference(firstField)})`);
  };

  const manualMetricProposal = (): MetricSuggestion | null => {
    if (!manualMetricName.trim() || !manualMetricDefinition.trim() || !manualMetricFormula.trim()) {
      return null;
    }

    return {
      id: "manual",
      title: manualMetricName.trim(),
      category: manualMetricCategory.trim() || (isZh ? "自定义" : "Custom"),
      layer: manualMetricLayer,
      definition: manualMetricDefinition.trim(),
      formula: manualMetricFormula.trim(),
      optimization: isZh ? "用户手动编辑的指标定义" : "User-edited metric definition",
      tags: ["User Added"],
      sourceFields: selectedFields
    };
  };

  const generateMetricSuggestions = async () => {
    if (selectedFields.length === 0) {
      setBuilderError(isZh ? "请至少选择一个字段" : "Select at least one field");
      return;
    }

    setIsGeneratingSuggestions(true);
    setBuilderError(null);

    try {
      const response = await fetch("/api/metrics/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: selectedFields })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || (isZh ? "生成方案失败" : "Failed to generate suggestions"));
      }

      const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
      setMetricSuggestions(suggestions);
      setSelectedSuggestionId(suggestions[0]?.id ?? "");
    } catch (error) {
      setBuilderError(error instanceof Error ? error.message : isZh ? "生成方案失败" : "Failed to generate suggestions");
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const confirmMetricSuggestion = async () => {
    const proposal = selectedSuggestionId === "manual"
      ? manualMetricProposal()
      : metricSuggestions.find((suggestion) => suggestion.id === selectedSuggestionId);

    if (!proposal) {
      setBuilderError(isZh ? "请选择或编辑一个完整方案" : "Select or complete a proposal");
      return;
    }

    setIsSavingMetric(true);
    setBuilderError(null);

    try {
      const response = await fetch("/api/metrics/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok || !payload.metric) {
        throw new Error(payload?.message || (isZh ? "写入指标失败" : "Failed to save metric"));
      }

      setMetricRows((rows) => {
        const nextRow = payload.metric as EditableMetricRow;
        const existingIndex = rows.findIndex((row) => row.id === nextRow.id);

        if (existingIndex >= 0) {
          return rows.map((row) => (row.id === nextRow.id ? nextRow : row));
        }

        return [nextRow, ...rows.filter((row) => row.id !== nextRow.id)];
      });
      setIsMetricBuilderOpen(false);
      setIsManualMetricMode(false);
    } catch (error) {
      setBuilderError(error instanceof Error ? error.message : isZh ? "写入指标失败" : "Failed to save metric");
    } finally {
      setIsSavingMetric(false);
    }
  };

  const formatFormula = (formula: string) => formula.replace(/\bx\b/g, "×").replace(/->/g, "→");

  const translateMetricText = (value: string) => {
    if (!isZh) {
      return value;
    }

    const translations: Record<string, string> = {
      "Customer Feedback": "用户反馈",
      "Review Volume": "评论数量",
      "Total number of customer review or feedback records": "用户评论或反馈记录总数",
      "Average Sentiment Score": "平均情绪分数",
      "Average customer sentiment polarity or rating score": "用户情绪极性或评分的平均值",
      "Positive Sentiment Rate": "正向情绪占比",
      "Share of reviews classified as positive sentiment": "被识别为正向情绪的评论占比",
      "Average Subjectivity": "平均主观性",
      "Average subjectivity score across review text": "评论文本主观性得分的平均值",
      "Sentiment by Product": "按产品分析情绪",
      "Average sentiment score grouped by product, app, or item": "按产品、App 或项目分组的平均情绪分数",
      Revenue: "收入",
      "Active Customers": "活跃客户",
      "Activation Rate": "激活率",
      Retention: "留存",
      "Review": "评论",
      Feedback: "反馈",
      Sentiment: "情绪",
      Product: "产品",
      "AI Generated": "AI 生成",
      "AI Suggested": "AI 建议",
      "User Added": "用户新增",
      "Core KPI": "核心指标",
      Customer: "客户",
      Acquisition: "获客",
      Activation: "激活",
      Cost: "成本",
      Recurring: "经常性收入",
      Performance: "表现",
      Average: "平均值",
      Volume: "数量",
      Rate: "占比",
      Classification: "分类",
      Diagnostic: "诊断"
    };

    if (value.endsWith(" Volume")) {
      return `${value.replace(/ Volume$/, "")} 数量`;
    }

    if (value.startsWith("Average ")) {
      return `平均 ${value.replace(/^Average /, "")}`;
    }

    if (value.endsWith(" Rate")) {
      return `${value.replace(/ Rate$/, "")} 占比`;
    }

    if (value.includes(" by ")) {
      return value.replace(" by ", " 按 ");
    }

    return translations[value] ?? value;
  };

  const layerLabel = (layer: string) => {
    const normalized = layer.toUpperCase();

    if (!isZh) {
      return normalized === "PRIMARY" ? "Primary" : normalized === "DRIVER" ? "Driver" : normalized === "DIAGNOSTIC" ? "Diagnostic" : layer;
    }

    if (normalized === "PRIMARY") return "核心";
    if (normalized === "DRIVER") return "驱动";
    if (normalized === "DIAGNOSTIC") return "诊断";
    return layer;
  };

  const statusLabel = (status: string) => {
    if (status === "AI") {
      return "AI";
    }

    return status;
  };

  const statusClassName = (status: string) => {
    if (status === "AI") {
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    }

    if (status !== "AI") {
      return "border-indigo-200 bg-indigo-50 text-indigo-800";
    }

    return "border-slate-200 bg-slate-50 text-slate-700";
  };

  if (!hasImportedData) {
    return (
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
              {copy.metricCatalog.previewStatus}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="rounded-xl border border-dashed border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-white p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
                  <BrainCircuit className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold tracking-tight">
                    {copy.metricCatalog.previewTitle}
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {copy.metricCatalog.previewDescription}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="w-fit shrink-0">
                {copy.metricCatalog.importedTableTitle}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {copy.metrics.cards.map((metric) => (
                <div key={metric.label} className="rounded-lg border bg-white/85 p-3 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-800">
                      <metric.icon className="size-4" />
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {copy.metricCatalog.previewGenerated}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold">{metric.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.text}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    {isMetricBuilderOpen ? (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4 py-5">
        <div className="h-[92vh] w-full max-w-[1500px] overflow-hidden rounded-xl border bg-white shadow-xl">
          <div className="flex items-start justify-between gap-4 border-b p-4">
            <div>
              <h3 className="text-base font-semibold">{isZh ? "新增指标" : "Create metric"}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {isZh
                  ? "从已连接数据结构里选择字段，AI 会生成可选指标方案"
                  : "Select fields from the connected schema, then let AI suggest metric definitions"}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsMetricBuilderOpen(false)}>
              {isZh ? "关闭" : "Close"}
            </Button>
          </div>

          <div className="grid h-[calc(92vh-77px)] gap-0 overflow-hidden lg:grid-cols-[minmax(0,1.18fr)_minmax(520px,0.82fr)]">
            <div className="overflow-y-auto border-r p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{isZh ? "1. 选择字段" : "1. Select fields"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isZh ? "可选择一个或多个字段组合成指标" : "Choose one or more fields to model a metric"}
                  </p>
                </div>
                <Badge variant="secondary">{selectedFields.length}</Badge>
              </div>

              {isLoadingFields ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {isZh ? "正在读取 Schema 字段..." : "Loading schema fields..."}
                </div>
              ) : fieldTables.length > 0 ? (
                <div className="grid gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {isZh ? "选择数据表" : "Select table"}
                    </span>
                    <select
                      value={selectedMetricTableKey}
                      onChange={(event) => changeMetricTable(event.target.value)}
                      className="h-11 w-full rounded-md border bg-white px-3 text-sm font-medium outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                    >
                      {fieldTables.map((table) => {
                        const key = `${table.schema ?? ""}.${table.name}`;

                        return (
                          <option key={key} value={key}>
                            {table.schema ? `${table.schema}.` : ""}{table.name}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  {visibleFieldTables.map((table) => (
                    <div key={`${table.schema ?? ""}.${table.name}`} className="rounded-lg border">
                      <div className="border-b bg-secondary/30 px-3 py-2">
                        <p className="text-sm font-semibold">
                          {table.schema ? `${table.schema}.` : ""}{table.name}
                        </p>
                      </div>
                      <div className="grid gap-1 p-2 sm:grid-cols-2">
                        {table.columns.map((field) => (
                          <label
                            key={field.key}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-2 text-sm transition hover:bg-secondary/40",
                              selectedFieldKeys.includes(field.key) && "border-emerald-600 bg-emerald-50"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selectedFieldKeys.includes(field.key)}
                              onChange={() => toggleBuilderField(field.key)}
                              className="size-4 accent-emerald-700"
                            />
                            <span className="min-w-0 flex-1 truncate">{field.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{field.type ?? "field"}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  {isZh ? "还没有可用字段，请先连接数据源" : "No fields available yet. Connect a data source first"}
                </div>
              )}
            </div>

            <div className="grid content-start gap-4 overflow-y-auto p-4">
              <div>
                <p className="text-sm font-semibold">{isZh ? "2. AI 优化方案" : "2. AI proposals"}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {isZh
                    ? "AI 会根据字段类型生成指标定义、公式和使用建议"
                    : "AI generates definitions, formulas, and modeling guidance from selected fields"}
                </p>
                <Button
                  type="button"
                  className="mt-3 w-full"
                  disabled={selectedFields.length === 0 || isGeneratingSuggestions}
                  onClick={() => void generateMetricSuggestions()}
                >
                  {isGeneratingSuggestions
                    ? (isZh ? "生成中..." : "Generating...")
                    : (isZh ? "生成指标方案" : "Generate proposals")}
                  <ArrowRight />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 w-full"
                  disabled={selectedFields.length === 0}
                  onClick={startManualMetric}
                >
                  <Plus className="size-4" />
                  {isZh ? "自己编辑" : "Edit manually"}
                </Button>
              </div>

              {builderError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {builderError}
                </div>
              ) : null}

              {metricSuggestions.length > 0 ? (
                <div className="grid gap-2">
                  {metricSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => setSelectedSuggestionId(suggestion.id)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition hover:bg-secondary/35",
                        selectedSuggestionId === suggestion.id && "border-emerald-700 bg-emerald-50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{translateMetricText(suggestion.title)}</p>
                        <Badge variant="secondary">{layerLabel(suggestion.layer)}</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {translateMetricText(suggestion.definition)}
                      </p>
                      <code className="mt-2 block max-w-full whitespace-normal break-all rounded-md border bg-white px-2 py-1.5 font-mono text-xs leading-5">
                        {formatFormula(suggestion.formula)}
                      </code>
                      <p className="mt-2 text-xs leading-5 text-emerald-800">
                        {suggestion.optimization}
                      </p>
                    </button>
                  ))}
                </div>
              ) : null}

              {isManualMetricMode ? (
                <div className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{isZh ? "自己编辑指标" : "Manual metric"}</p>
                    <Badge variant="secondary">{selectedFields.length} {isZh ? "个字段" : "fields"}</Badge>
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {isZh ? "指标名称" : "Metric name"}
                    </span>
                    <Input
                      value={manualMetricName}
                      onChange={(event) => setManualMetricName(event.target.value)}
                      placeholder={isZh ? "例如：评论数量" : "e.g. Review volume"}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {isZh ? "指标分类" : "Category"}
                      </span>
                      <Input
                        value={manualMetricCategory}
                        onChange={(event) => setManualMetricCategory(event.target.value)}
                        placeholder={isZh ? "例如：用户反馈" : "e.g. Customer feedback"}
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">
                        {isZh ? "业务层" : "Layer"}
                      </span>
                      <select
                        value={manualMetricLayer}
                        onChange={(event) => setManualMetricLayer(event.target.value)}
                        className="h-10 rounded-md border bg-white px-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                      >
                        <option value="PRIMARY">{isZh ? "核心" : "Primary"}</option>
                        <option value="DRIVER">{isZh ? "驱动" : "Driver"}</option>
                        <option value="DIAGNOSTIC">{isZh ? "诊断" : "Diagnostic"}</option>
                      </select>
                    </label>
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {isZh ? "业务定义" : "Definition"}
                    </span>
                    <textarea
                      value={manualMetricDefinition}
                      onChange={(event) => setManualMetricDefinition(event.target.value)}
                      rows={3}
                      className="min-h-20 rounded-md border bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                      placeholder={isZh ? "说明这个指标代表什么业务含义" : "Describe what this metric means for the business"}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {isZh ? "公式" : "Formula"}
                    </span>
                    <textarea
                      value={manualMetricFormula}
                      onChange={(event) => setManualMetricFormula(event.target.value)}
                      rows={3}
                      className="min-h-20 rounded-md border bg-white px-3 py-2 font-mono text-xs outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                      placeholder={`COUNT(${selectedFields[0] ? fieldReference(selectedFields[0]) : "table.field"})`}
                    />
                  </label>
                </div>
              ) : null}

              <div className="border-t pt-3">
                <p className="text-sm font-semibold">{isZh ? "3. 确认添加" : "3. Confirm add"}</p>
                <Button
                  type="button"
                  className="mt-3 w-full"
                  disabled={
                    isSavingMetric ||
                    (selectedSuggestionId === "manual"
                      ? !manualMetricName.trim() || !manualMetricDefinition.trim() || !manualMetricFormula.trim()
                      : !selectedSuggestionId)
                  }
                  onClick={() => void confirmMetricSuggestion()}
                >
                  {isSavingMetric ? (isZh ? "添加中..." : "Adding...") : (isZh ? "确认添加" : "Confirm add")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    <Card className="overflow-hidden bg-white shadow-sm">
      <CardHeader className="border-b p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{copy.metricCatalog.importedTableTitle}</CardTitle>
            <CardDescription className="mt-1 text-sm leading-6">
              {copy.metricCatalog.exampleDescription}
            </CardDescription>
          </div>
            <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => void openMetricBuilder()}>
              <Plus />
              {isZh ? "新增指标" : "Add metric"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[1180px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[90px]" />
              <col className="w-[120px]" />
              <col className="w-[170px]" />
              <col className="w-[260px]" />
              <col className="w-[320px]" />
              <col className="w-[300px]" />
              <col className="w-[110px]" />
              <col className="w-[80px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b bg-secondary/80 text-xs text-muted-foreground backdrop-blur">
              <tr>
                {copy.metricCatalog.exampleHeaders.map((header) => (
                  <th key={header} className="px-4 py-3 font-medium">
                    {header}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">
                  {copy.metricCatalog.actionHeader}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoadingMetrics ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <tr key={`metric-loading-${index}`} className="animate-pulse">
                    <td className="px-4 py-4">
                      <div className="h-8 rounded-md bg-secondary" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-5 rounded-md bg-secondary" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-5 rounded-md bg-secondary" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-5 rounded-md bg-secondary" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-8 rounded-md bg-secondary" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-5 rounded-md bg-secondary" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-7 rounded-full bg-secondary" />
                    </td>
                    <td className="px-4 py-4" />
                  </tr>
                ))
              ) : metricRows.length > 0 ? (
                metricRows.map((row) => (
                <tr key={row.id} className="align-top transition hover:bg-secondary/25">
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{layerLabel(row.layer)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {translateMetricText(row.category)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-emerald-800">{translateMetricText(row.metric)}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                          {translateMetricText(tag)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 leading-6 text-muted-foreground">
                    <span className="block rounded-md border border-transparent px-2 py-1">
                      {translateMetricText(row.definition)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="block max-w-full whitespace-normal break-all rounded-md border bg-secondary/45 px-2 py-1.5 font-mono text-xs leading-5">
                      {formatFormula(row.formula)}
                    </code>
                  </td>
                  <td className="px-4 py-3 leading-6 text-muted-foreground">
                    <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-transparent px-2 py-1" title={row.mapping}>
                      {row.mapping}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-medium", statusClassName(row.status))}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={copy.metricCatalog.deleteMetric}
                      onClick={() => deleteMetric(row.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center">
                    <div className="mx-auto max-w-md">
                      <p className="text-sm font-semibold">
                        {isZh ? "暂无指标对象" : "No metrics yet"}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {isZh
                          ? "连接数据源并读取 Schema 后，可以让 AI 生成指标，或从字段中手动新增指标"
                          : "After connecting a source and scanning schema, generate metrics with AI or add one from fields"}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    </>
  );
}

function MetricCatalogPage({ copy }: { copy: DashboardCopy }) {
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

        <SemanticMetricObjects copy={copy} />

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

function SettingsPage({
  copy,
  connectedSources,
  onUpdateConnectedSource,
  onRemoveConnectedSource
}: {
  copy: DashboardCopy;
  connectedSources?: ConnectedSourceRow[];
  onUpdateConnectedSource?: (source: ConnectedSourceRow) => void;
  onRemoveConnectedSource?: (sourceId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("basic");
  const groups: Array<{
    title: string;
    items: Array<{ id: SettingsTab; label: string; icon: typeof Settings }>;
  }> = [
    {
      title: copy.settingsPage.groupWorkspace,
      items: [
        { id: "basic", label: copy.settingsPage.tabBasicInfo, icon: Settings },
        { id: "members", label: copy.settingsPage.tabMembersRoles, icon: Users },
        { id: "security", label: copy.settingsPage.tabSecuritySettings, icon: ShieldCheck }
      ]
    },
    {
      title: copy.settingsPage.groupData,
      items: [
        { id: "sources", label: copy.settingsPage.tabSources, icon: Database },
        { id: "metrics", label: copy.settingsPage.tabMetricDefinitions, icon: LineChart },
        { id: "data-permissions", label: copy.settingsPage.tabDataPermissions, icon: Lock }
      ]
    },
    {
      title: copy.settingsPage.groupAccount,
      items: [
        { id: "billing", label: copy.settingsPage.tabBilling, icon: CreditCard },
        { id: "notifications", label: copy.settingsPage.tabNotifications, icon: Bell }
      ]
    }
  ] as const;

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

      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        <aside className="rounded-lg border bg-white p-2 shadow-sm">
          {groups.map((group, groupIndex) => (
            <div key={group.title} className={cn(groupIndex > 0 && "mt-3")}>
              <p className="px-2 py-2 text-xs font-semibold text-muted-foreground">{group.title}</p>
              <div className="grid gap-1">
                {group.items.map((tab) => {
                  const TabIcon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition",
                        isActive
                          ? "bg-emerald-50 text-emerald-800"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <TabIcon className="size-4 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <div className="min-w-0">
          {activeTab === "basic" ? <SettingsWorkspacePanel copy={copy} /> : null}
          {activeTab === "members" ? <SettingsTeamPanel copy={copy} /> : null}
          {activeTab === "security" ? <SettingsSecurityPanel copy={copy} /> : null}
          {activeTab === "sources" ? (
            <SettingsConnectedSourcesPanel
              copy={copy}
              connectedSources={connectedSources ?? []}
              onUpdateConnectedSource={onUpdateConnectedSource ?? (() => {})}
              onRemoveConnectedSource={onRemoveConnectedSource ?? (() => {})}
            />
          ) : null}
          {activeTab === "metrics" ? <SemanticMetricObjects copy={copy} /> : null}
          {activeTab === "data-permissions" ? <SettingsDataPermissionsPanel copy={copy} /> : null}
          {activeTab === "billing" ? <SettingsBillingPanel copy={copy} /> : null}
          {activeTab === "notifications" ? <SettingsNotificationPanel copy={copy} /> : null}
        </div>
      </div>
    </section>
  );
}

function SettingsWorkspacePanel({ copy }: { copy: DashboardCopy }) {
  const isZh = copy.settingsPage.title === "设置";
  const industryOptions = isZh
    ? [
        "科技 / SaaS",
        "电商 / 零售",
        "金融服务",
        "教育 / 在线学习",
        "医疗健康",
        "游戏 / 娱乐",
        "媒体 / 内容",
        "餐饮 / 本地生活",
        "旅游 / 酒店",
        "房地产 / 物业",
        "制造业",
        "物流 / 供应链",
        "专业服务 / 咨询",
        "消费品",
        "非营利组织",
        "其他"
      ]
    : [
        "Technology / SaaS",
        "E-commerce / Retail",
        "Financial Services",
        "Education / Online Learning",
        "Healthcare",
        "Gaming / Entertainment",
        "Media / Content",
        "Food & Local Services",
        "Travel / Hospitality",
        "Real Estate / Property",
        "Manufacturing",
        "Logistics / Supply Chain",
        "Professional Services / Consulting",
        "Consumer Goods",
        "Nonprofit",
        "Other"
      ];

  return (
    <div className="grid w-full gap-4">
        <div className="grid gap-4">
          <Card className="w-full overflow-hidden bg-white shadow-none">
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
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                  <Input defaultValue="monarca.app/workspace" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {copy.settingsPage.workspaceRegion}
                  </span>
                  <Input defaultValue="Asia Pacific" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {copy.settingsPage.workspaceIndustry}
                  </span>
                  <select
                    defaultValue={industryOptions[0]}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {industryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {copy.settingsPage.workspaceBusinessType}
                  </span>
                  <Input defaultValue="Subscription / B2B" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {copy.settingsPage.workspaceRefreshFrequency}
                  </span>
                  <select
                    defaultValue={copy.settingsPage.workspaceRefreshOptions[0]}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {copy.settingsPage.workspaceRefreshOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 flex justify-end">
                <Button size="sm">{copy.settingsPage.workspaceSave}</Button>
              </div>
            </CardContent>
          </Card>

        </div>

    </div>
  );
}

function formatSourceDate(value: string | null | undefined, isZh: boolean) {
  if (!value) {
    return isZh ? "暂无" : "None";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return isZh ? "暂无" : "None";
  }

  return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}

function formatRelativeSourceDate(value: string | null | undefined, isZh: boolean) {
  if (!value) {
    return isZh ? "暂无" : "None";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return isZh ? "暂无" : "None";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  const minute = 60;
  const hour = minute * 60;
  const day = hour * 24;

  if (diffSeconds < minute) {
    return isZh ? "刚刚" : "Just now";
  }

  if (diffSeconds < hour) {
    const minutes = Math.floor(diffSeconds / minute);
    return isZh ? `${minutes} 分钟前` : `${minutes} min ago`;
  }

  if (diffSeconds < day) {
    const hours = Math.floor(diffSeconds / hour);
    return isZh ? `${hours} 小时前` : `${hours} hr ago`;
  }

  const days = Math.floor(diffSeconds / day);
  return isZh ? `${days} 天前` : `${days} days ago`;
}

function sourceTypeLabel(copy: DashboardCopy, source: ConnectedSourceRow) {
  const catalogSource = copy.connectors.sources.find(
    (item) => item.name === source.provider || item.name === source.name
  );

  return catalogSource?.type ?? source.type;
}

function SettingsConnectedSourcesPanel({
  copy,
  connectedSources,
  onUpdateConnectedSource,
  onRemoveConnectedSource
}: {
  copy: DashboardCopy;
  connectedSources: ConnectedSourceRow[];
  onUpdateConnectedSource: (source: ConnectedSourceRow) => void;
  onRemoveConnectedSource: (sourceId: string) => void;
}) {
  const [expandedSourceIds, setExpandedSourceIds] = useState<string[]>([]);
  const [expandedTableKeys, setExpandedTableKeys] = useState<string[]>([]);
  const [rescanningSourceId, setRescanningSourceId] = useState<string | null>(null);
  const isZh = copy.connectors.connectedCountLabel.includes("个");
  const connectedCountLabel = `${connectedSources.length} ${copy.connectors.connectedCountLabel}`;
  const labels = isZh
    ? {
        host: "Host",
        port: "Port",
        database: "Database",
        ssl: "SSL",
        schema: "Schema",
        columns: "Columns",
        tables: "Tables",
        columnUnit: "字段",
        tableUnit: "张表",
        scanned: "结构扫描",
        connected: "连接时间",
        mode: "模式",
        auth: "认证",
        viewSchema: "查看结构",
        hideSchema: "收起结构",
        rescan: "更新数据源",
        rescanning: "更新中",
        recentScan: "最近扫描",
        noTables: "暂未读取到表结构",
        fieldNullable: "可为空",
        fieldRequired: "必填",
        on: "开启",
        off: "关闭"
      }
    : {
        host: "Host",
        port: "Port",
        database: "Database",
        ssl: "SSL",
        schema: "Schema",
        columns: "columns",
        tables: "tables",
        columnUnit: "columns",
        tableUnit: "tables",
        scanned: "Scanned",
        connected: "Connected",
        mode: "Mode",
        auth: "Auth",
        viewSchema: "View schema",
        hideSchema: "Hide schema",
        rescan: "Update source",
        rescanning: "Updating",
        recentScan: "Last scan",
        noTables: "No tables found yet",
        fieldNullable: "nullable",
        fieldRequired: "required",
        on: "On",
        off: "Off"
      };

  const toggleSourceSchema = (sourceId: string) => {
    setExpandedSourceIds((current) =>
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId]
    );
  };

  const toggleTable = (sourceId: string, tableName: string) => {
    const key = `${sourceId}:${tableName}`;
    setExpandedTableKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  };

  const rescanSource = async (sourceId: string) => {
    setRescanningSourceId(sourceId);

    try {
      const response = await fetch(`/api/data-sources/${sourceId}/rescan`, {
        method: "POST"
      });
      const payload = await response.json().catch(() => null);

      if (response.ok && payload?.ok && payload.dataSource) {
        onUpdateConnectedSource(payload.dataSource as ConnectedSourceRow);
        setExpandedSourceIds((current) =>
          current.includes(sourceId) ? current : [...current, sourceId]
        );
      }
    } finally {
      setRescanningSourceId(null);
    }
  };

  return (
    <Card className="overflow-hidden bg-white shadow-sm">
      <CardHeader className="border-b p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{copy.connectors.connectedTitle}</CardTitle>
            <CardDescription className="mt-1 text-sm leading-6">
              {copy.connectors.connectedDescription}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{connectedCountLabel}</Badge>
            <Button asChild variant="outline" size="sm">
              <a href="/dashboard/import-data">
                <Database className="size-4" />
                {copy.connectors.connectAction}
              </a>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {connectedSources.length > 0 ? (
          <div className="grid gap-3">
            {connectedSources.map((source) => {
              const isExpanded = expandedSourceIds.includes(source.id);
              const tables = source.schema?.tables ?? [];
              const scannedAt = source.schema?.scannedAt ?? source.lastSyncAt;

              return (
                <div key={source.id} className="rounded-lg border bg-secondary/10 p-4">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                    <div className="flex min-w-0 gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
                        <Database className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-semibold">{source.name}</p>
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-800">
                            {source.status || copy.connectors.connectedStatus}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {source.schema?.tableCount ?? 0} tables · {source.schema?.columnCount ?? 0} columns
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {labels.recentScan}: {formatRelativeSourceDate(scannedAt, isZh)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full bg-white px-2.5 py-1">
                            {source.provider} · {sourceTypeLabel(copy, source)}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1">
                            {labels.host}: {source.config?.host ?? "—"}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1">
                            {labels.database}: {source.config?.database ?? "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleSourceSchema(source.id)}
                      >
                        {isExpanded ? labels.hideSchema : labels.viewSchema}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={rescanningSourceId === source.id}
                        onClick={() => void rescanSource(source.id)}
                      >
                        <RefreshCw className={cn("size-4", rescanningSourceId === source.id && "animate-spin")} />
                        {rescanningSourceId === source.id ? labels.rescanning : labels.rescan}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 shrink-0 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                        aria-label={`${copy.connectors.deleteAction} ${source.name}`}
                        onClick={() => onRemoveConnectedSource(source.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-4 rounded-lg border bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        tables
                      </p>
                      {tables.length > 0 ? (
                        <div className="mt-3 grid gap-2">
                          {tables.map((table) => {
                            const tableName = table.schema ? `${table.schema}.${table.name}` : table.name;
                            const tableKey = `${source.id}:${tableName}`;
                            const isTableExpanded = expandedTableKeys.includes(tableKey);

                            return (
                              <div key={tableName} className="rounded-md border bg-secondary/10">
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium transition hover:bg-secondary/40"
                                  onClick={() => toggleTable(source.id, tableName)}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <ChevronDown
                                      className={cn(
                                        "size-4 shrink-0 text-muted-foreground transition-transform",
                                        !isTableExpanded && "-rotate-90"
                                      )}
                                    />
                                    <span className="truncate">{tableName}</span>
                                  </span>
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    {table.columns.length} {labels.columnUnit}
                                  </span>
                                </button>
                                {isTableExpanded ? (
                                  <div className="grid gap-1 border-t px-3 py-2">
                                    {table.columns.map((column) => (
                                      <div
                                        key={`${tableName}.${column.name}`}
                                        className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-xs"
                                      >
                                        <span className="font-medium text-foreground">{column.name}</span>
                                        <span className="text-muted-foreground">
                                          {column.type ?? "field"} ·{" "}
                                          {column.nullable ? labels.fieldNullable : labels.fieldRequired}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-3 rounded-md border border-dashed bg-secondary/20 px-3 py-2 text-sm text-muted-foreground">
                          {labels.noTables}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-secondary/20 p-4">
            <p className="text-sm font-semibold">{copy.connectors.noConnectedTitle}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.connectors.noConnectedText}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsDataPermissionsPanel({ copy }: { copy: DashboardCopy }) {
  return (
    <Card className="overflow-hidden bg-white shadow-sm">
      <CardHeader className="border-b p-4">
        <div className="flex items-center gap-2">
          <Lock className="size-4 text-emerald-700" />
          <div>
            <CardTitle className="text-base">{copy.settingsPage.dataPermissionsTitle}</CardTitle>
            <CardDescription className="mt-1">
              {copy.settingsPage.dataPermissionsDescription}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {copy.settingsPage.dataPermissions.map(([label, value]) => (
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

function SettingsTeamPanel({ copy }: { copy: DashboardCopy }) {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserRole, setCurrentUserRole] = useState<TeamMemberRole>("viewer");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inviteMode, setInviteMode] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamMemberRole>("viewer");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const canInvite = currentUserRole === "owner" || currentUserRole === "admin";

  useEffect(() => {
    let isCancelled = false;
    const loadMembers = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/workspace/members", { cache: "no-store" });
        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload || !Array.isArray(payload.members)) {
          throw new Error(payload?.error || "Failed to load team members");
        }

        if (!isCancelled) {
          setCurrentUserId(payload.currentUserId ?? "");
          setCurrentUserRole((payload.currentUserRole as TeamMemberRole) || "viewer");
          setMembers(payload.members as TeamMemberRow[]);
        }
      } catch (error) {
        if (!isCancelled) {
          setCurrentUserId("");
          setCurrentUserRole("viewer");
          setMembers([]);
          setErrorMessage(error instanceof Error ? error.message : "Failed to load team members");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadMembers();

    return () => {
      isCancelled = true;
    };
  }, []);

  const visibleRoleOptions = (target: TeamMemberRow): TeamMemberRole[] => {
    if (target.userId === currentUserId) {
      return [];
    }

    if (currentUserRole === "owner") {
      return ["owner", "admin", "viewer"];
    }

    return [];
  };

  const inviteRoleOptions = (): TeamMemberRole[] => {
    if (currentUserRole === "owner") {
      return ["owner", "admin", "viewer"];
    }

    if (currentUserRole === "admin") {
      return ["viewer"];
    }

    return [];
  };

  const canModifyMember = (member: TeamMemberRow) => visibleRoleOptions(member).length > 0;
  const canRemoveMemberRow = (member: TeamMemberRow) => {
    if (member.userId === currentUserId) {
      return false;
    }

    if (member.status === "removed") {
      return false;
    }

    if (currentUserRole === "owner") {
      return true;
    }

    if (currentUserRole === "admin" && member.role === "viewer") {
      return true;
    }

    return false;
  };

  const statusBadge = (status: TeamMemberStatus) => {
    if (status === "removed") {
      return {
        label: copy.settingsPage.teamMembersStatusLabels.removed,
        className: "border-slate-200 bg-slate-100 text-slate-500"
      };
    }

    if (status === "invited") {
      return {
        label: copy.settingsPage.teamMembersStatusLabels.invited,
        className: "border-amber-200 bg-amber-50 text-amber-700"
      };
    }

    return {
      label: copy.settingsPage.teamMembersStatusLabels.active,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700"
    };
  };

  const roleBadge = (role: TeamMemberRole) => (
    <Badge variant="secondary" className="shrink-0">
      {copy.settingsPage.teamMembersRoleLabels[role]}
    </Badge>
  );

  const handleInvite = async () => {
    if (!inviteEmail.trim() || isBusy) {
      return;
    }

    setIsBusy(true);
    setInviteError(null);
    setInviteLink(null);

    try {
      const response = await fetch("/api/workspace/members/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.member) {
        throw new Error(payload?.message || "Invite failed");
      }

      const invitedMember = payload.member as TeamMemberRow;
      setMembers((current) => [
        invitedMember,
        ...current.filter((member) => member.id !== invitedMember.id && member.email !== invitedMember.email)
      ]);
      setInviteLink(typeof payload.inviteUrl === "string" ? payload.inviteUrl : null);
      setInviteMode(false);
      setInviteEmail("");
      setInviteRole("viewer");
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Invite failed");
    } finally {
      setIsBusy(false);
    }
  };

  const handleRoleChange = async (member: TeamMemberRow, nextRole: TeamMemberRole) => {
    if (member.role === nextRole || isBusy) {
      return;
    }

    setIsBusy(true);
    setUpdatingMemberId(member.id);

    try {
      const response = await fetch(`/api/workspace/members/${member.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.updated) {
        throw new Error(payload?.message || payload?.error || "Update failed");
      }

      setMembers((current) =>
        current.map((row) => (row.id === member.id ? ({ ...row, ...payload.updated } as TeamMemberRow) : row))
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Update failed");
    } finally {
      setIsBusy(false);
      setUpdatingMemberId(null);
    }
  };

  const handleRemove = async (member: TeamMemberRow) => {
    if (isBusy || !canRemoveMemberRow(member)) {
      return;
    }

    setIsBusy(true);
    setRemovingMemberId(member.id);

    try {
      const response = await fetch(`/api/workspace/members/${member.id}/remove`, {
        method: "PATCH"
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.removed) {
        throw new Error(payload?.message || payload?.error || "Failed to remove member");
      }

      setMembers((current) =>
        current.map((row) => (row.id === member.id ? ({ ...row, ...payload.removed } as TeamMemberRow) : row))
      );
	    } catch (error) {
	      setMembers((current) =>
	        current.map((row) =>
	          row.id === member.id ? ({ ...row, status: "removed" } as TeamMemberRow) : row
	        )
	      );
	      setErrorMessage(null);
	    } finally {
      setIsBusy(false);
      setRemovingMemberId(null);
    }
  };

  return (
    <div className="grid gap-4">
      <Card className="overflow-hidden bg-white shadow-sm">
        <CardHeader className="border-b p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">{copy.settingsPage.teamMembersTitle}</CardTitle>
              <CardDescription className="mt-1 text-sm leading-6">
                {copy.settingsPage.teamMembersDescription}
              </CardDescription>
            </div>
            {canInvite ? (
              <Button size="sm" onClick={() => setInviteMode((current) => !current)}>
                <Users className="size-4" />
                {copy.settingsPage.teamInviteButton}
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-4">
          {inviteMode ? (
            <Card className="border border-dashed bg-secondary/25 p-4">
              <p className="text-sm font-semibold">{copy.settingsPage.teamInviteTitle}</p>
              <p className="mt-1 text-xs text-muted-foreground">{copy.settingsPage.teamInviteDescription}</p>
              <p className="mt-1 text-xs text-muted-foreground">{copy.settingsPage.teamInviteNotice}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {copy.settingsPage.teamInviteEmailLabel}
                  </span>
                  <Input
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder={copy.settingsPage.teamInviteEmailLabel}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {copy.settingsPage.teamInviteRoleLabel}
                  </span>
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as TeamMemberRole)}
                    className="h-10 rounded-md border bg-white px-3 text-sm text-foreground"
                  >
                    {inviteRoleOptions().map((role) => (
                      <option key={role} value={role}>
                        {copy.settingsPage.teamMembersRoleLabels[role]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2 md:col-span-2">
                  <Button size="sm" disabled={isBusy || !inviteEmail.trim()} onClick={handleInvite}>
                    {isBusy ? copy.settingsPage.teamInviteSubmitting : copy.settingsPage.teamInviteSubmit}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setInviteMode(false)}>
                    {copy.settingsPage.teamInviteCancel}
                  </Button>
                </div>
              </div>
              {inviteError ? <p className="text-xs text-rose-600">{inviteError}</p> : null}
            </Card>
          ) : null}

          {inviteLink ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <p className="font-semibold">邀请已创建。如果邮箱仍未收到，可复制下面链接发给对方。</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 truncate rounded bg-white/80 px-2 py-1 text-[11px] text-emerald-950">
                  {inviteLink}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void navigator.clipboard?.writeText(inviteLink)}
                >
                  <Copy />
                  复制邀请链接
                </Button>
              </div>
            </div>
          ) : null}

	          {isLoading ? <p className="text-xs text-muted-foreground">Loading...</p> : null}
	          {errorMessage ? <p className="text-xs text-rose-600">{errorMessage}</p> : null}

	          {!isLoading && members.filter((member) => member.status !== "removed").length <= 1 ? (
	            <p className="rounded-lg border bg-secondary/25 p-3 text-xs text-muted-foreground">
	              {copy.settingsPage.teamMembersEmpty}
	            </p>
	          ) : null}

          <div className="divide-y rounded-xl border">
            {isLoading ? (
              <div className="flex items-center gap-3 p-3">
                <div className="size-9 shrink-0 animate-pulse rounded-full bg-secondary" />
                <div className="grid flex-1 gap-2">
                  <div className="h-3 w-32 animate-pulse rounded bg-secondary" />
                  <div className="h-3 w-48 animate-pulse rounded bg-secondary" />
                </div>
              </div>
            ) : null}
            {members.map((member) => (
              <div key={member.id} className={cn("grid gap-3 p-3 md:grid-cols-[1fr_auto] md:items-center", {
                "opacity-75": member.status === "removed"
              })}>
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                      {((member.name || member.email || "U").slice(0, 1) ?? "U").toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.name ?? member.email}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    </div>
                    {member.status !== "removed" ? roleBadge(member.role) : null}
                    <Badge variant="secondary" className={statusBadge(member.status).className}>
                      {statusBadge(member.status).label}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canModifyMember(member) ? (
                    <select
                      value={member.role}
                      disabled={isBusy && updatingMemberId === member.id}
                      onChange={(event) => {
                        void handleRoleChange(member, event.target.value as TeamMemberRole);
                      }}
                      className="h-9 rounded-md border bg-white px-3 text-xs text-foreground"
                    >
                      {visibleRoleOptions(member).map((role) => (
                        <option key={role} value={role}>
                          {copy.settingsPage.teamMembersRoleLabels[role]}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  {canRemoveMemberRow(member) && member.status !== "removed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      onClick={() => {
                        void handleRemove(member);
                      }}
                      disabled={isBusy && removingMemberId === member.id}
                    >
                    {removingMemberId === member.id && isBusy
                      ? copy.settingsPage.teamMembersRemovingLabel ?? "Removing"
                      : copy.settingsPage.teamMembersRemoveLabel ?? "Remove"}
                  </Button>
                  ) : null}
                </div>
              </div>
            ))}

	            {members.length === 0 && !isLoading ? (
	              <p className="p-3 text-xs text-muted-foreground">{copy.settingsPage.teamMembersEmpty}</p>
	            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsBillingPanel({ copy }: { copy: DashboardCopy }) {
  const isZh = copy.settingsPage.title === "设置";
  const currentPlan = isZh ? "专业版" : "Professional";
  const planCards = isZh
    ? [
        {
          name: "单次体验",
          price: "¥200",
          description: "适合先体验 AI 分析流程",
          href: "/checkout/trial",
          action: "降级到体验",
          tone: "outline"
        },
        {
          name: "专业版",
          price: "¥499 / 月",
          description: "自动生成增长简报、经营分析和报表验证",
          href: "/checkout/professional",
          action: "当前套餐",
          tone: "current"
        },
        {
          name: "企业版",
          price: "定制",
          description: "适合多工作区、权限隔离和企业级数据治理",
          href: "/checkout/enterprise",
          action: "升级套餐",
          tone: "primary"
        }
      ]
    : [
        {
          name: "One-time trial",
          price: "$49",
          description: "Try the AI analysis workflow before subscribing",
          href: "/checkout/trial",
          action: "Downgrade to trial",
          tone: "outline"
        },
        {
          name: "Professional",
          price: "$499 / mo",
          description: "Daily briefings, analysis reports, and data validation",
          href: "/checkout/professional",
          action: "Current plan",
          tone: "current"
        },
        {
          name: "Enterprise",
          price: "Custom",
          description: "Workspace controls, governance, and enterprise data workflows",
          href: "/checkout/enterprise",
          action: "Upgrade plan",
          tone: "primary"
        }
      ];
  const history = isZh
    ? [
        ["2026 年 5 月", "专业版", "¥499", "已支付"],
        ["2026 年 4 月", "专业版", "¥499", "已支付"],
        ["2026 年 3 月", "单次体验", "¥200", "已支付"]
      ]
    : [
        ["May 2026", "Professional", "$499", "Paid"],
        ["Apr 2026", "Professional", "$499", "Paid"],
        ["Mar 2026", "One-time trial", "$49", "Paid"]
      ];
  const billingStats = isZh
    ? [
        ["当前套餐", currentPlan],
        ["下次扣款", "2026-06-18"],
        ["付款方式", "Visa 4242"]
      ]
    : [
        ["Current plan", currentPlan],
        ["Next billing date", "2026-06-18"],
        ["Payment method", "Visa 4242"]
      ];

  return (
    <div className="grid gap-4">
      <Card className="overflow-hidden bg-gradient-to-br from-white via-emerald-50/70 to-white shadow-sm">
        <CardHeader className="border-b p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-base">{copy.settingsPage.billingTitle}</CardTitle>
              <CardDescription className="mt-1">{copy.settingsPage.billingDescription}</CardDescription>
            </div>
            <Badge variant="secondary">{currentPlan}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-3">
            {billingStats.map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-white/80 p-3">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <a href="/checkout/professional">
                <CreditCard className="size-4" />
                {isZh ? "管理当前订阅" : "Manage subscription"}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/checkout/enterprise">
                {isZh ? "升级套餐" : "Upgrade plan"}
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/checkout/trial">{isZh ? "降级套餐" : "Downgrade plan"}</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-3">
        {planCards.map((plan) => (
          <Card key={plan.name} className="overflow-hidden bg-white shadow-sm">
            <CardHeader className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  <CardDescription className="mt-1 leading-5">{plan.description}</CardDescription>
                </div>
                {plan.tone === "current" ? (
                  <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">
                    {isZh ? "当前" : "Current"}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex h-full flex-col gap-4 p-4 pt-0">
              <p className="text-2xl font-semibold tracking-normal">{plan.price}</p>
              <Button
                asChild
                size="sm"
                variant={plan.tone === "primary" ? "default" : "outline"}
                disabled={plan.tone === "current"}
                className="mt-auto w-full"
              >
                <a href={plan.href}>{plan.action}</a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <Card className="overflow-hidden bg-white shadow-sm">
          <CardHeader className="border-b p-4">
            <CardTitle className="text-base">{isZh ? "订阅与发票历史" : "Subscription and invoice history"}</CardTitle>
            <CardDescription className="mt-1">
              {isZh ? "查看过去的订阅记录、付款状态和发票" : "Review past subscriptions, payment status, and invoices"}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {history.map(([period, plan, amount, status]) => (
              <div key={`${period}-${plan}`} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <p className="text-sm font-medium">{period}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{plan}</p>
                </div>
                <div className="flex items-center gap-2 md:justify-end">
                  <Badge variant="secondary">{status}</Badge>
                  <span className="text-sm font-semibold">{amount}</span>
                </div>
                <Button variant="ghost" size="sm" className="justify-start md:justify-center">
                  <Download className="size-4" />
                  {isZh ? "发票" : "Invoice"}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden bg-white shadow-sm">
          <CardHeader className="border-b p-4">
            <CardTitle className="text-base">{isZh ? "付款管理" : "Payment management"}</CardTitle>
            <CardDescription className="mt-1">
              {isZh ? "更新付款方式，或完成当前套餐付款" : "Update payment method or complete the current subscription payment"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="rounded-lg border bg-secondary/20 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-700" />
                <p className="text-sm font-semibold">{isZh ? "付款方式已保存" : "Payment method saved"}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {isZh ? "Visa 4242 将用于下一次订阅扣款" : "Visa 4242 will be used for the next billing cycle"}
              </p>
            </div>
            <Button asChild className="w-full" size="sm">
              <a href="/checkout/professional">
                <CreditCard className="size-4" />
                {isZh ? "立即付费" : "Pay now"}
              </a>
            </Button>
            <Button variant="outline" className="w-full" size="sm">
              {isZh ? "更新付款方式" : "Update payment method"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingsSecurityPanel({ copy }: { copy: DashboardCopy }) {
  return <SettingsListCard icon={Database} title={copy.settingsPage.securityTitle} rows={copy.settingsPage.security} />;
}

function SettingsNotificationPanel({ copy }: { copy: DashboardCopy }) {
  return (
    <SettingsListCard
      icon={Bell}
      title={copy.settingsPage.notificationsTitle}
      rows={copy.settingsPage.notifications}
    />
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

function ImportDataSection({
  copy,
  connectedSources,
  onAddConnectedSource,
  connectionPage = false,
  initialSourceName
}: {
  copy: DashboardCopy;
  connectedSources: ConnectedSourceRow[];
  onAddConnectedSource: (source: ConnectedSourceRow) => void;
  connectionPage?: boolean;
  initialSourceName?: string;
}) {
  const isZh = navLabel(copy, "#import-data") === "数据源";

  return (
    <section id="import-data" className="scroll-mt-20">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{navLabel(copy, "#import-data")}</h2>
          <p className="text-sm text-muted-foreground">{copy.importData.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/dashboard/reports">
              <BrainCircuit className="size-4" />
              {isZh ? "回到报告" : "Back to analysis"}
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/dashboard/report">
              <FileText className="size-4" />
              {isZh ? "回到报表" : "Back to reports"}
            </a>
          </Button>
        </div>
      </div>
      <div className="grid gap-4">
        {!connectionPage ? (
          <>
            <OnboardingFlow copy={copy} />
            <ConnectedDataOverview copy={copy} connectedSources={connectedSources} />
          </>
        ) : null}
        <ConnectorPanel
          copy={copy}
          onAddConnectedSource={onAddConnectedSource}
          connectionPage={connectionPage}
          initialSourceName={initialSourceName}
        />
      </div>
    </section>
  );
}

function ConnectedDataOverview({
  copy,
  connectedSources
}: {
  copy: DashboardCopy;
  connectedSources: ConnectedSourceRow[];
}) {
  const connectedCountLabel = `${connectedSources.length} ${copy.connectors.connectedCountLabel}`;

  return (
    <Card className="overflow-hidden bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
              <Database className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight">
                {copy.importData.connectedTitle}
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {copy.importData.connectedDescription}
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="w-fit shrink-0">
            {connectedCountLabel}
          </Badge>
        </div>
        {connectedSources.length > 0 ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {connectedSources.map((source) => (
              <div key={source.id} className="flex items-center gap-3 rounded-lg border bg-secondary/15 p-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-800">
                  <Database className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{source.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {source.provider} · {source.status}
                  </p>
                </div>
                <Badge variant="secondary">{copy.connectors.connectedStatus}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed bg-secondary/25 p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-md bg-background text-muted-foreground">
              <Database className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{copy.importData.connectedEmptyTitle}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {copy.importData.connectedEmptyText}
              </p>
            </div>
          </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OnboardingFlow({ copy }: { copy: DashboardCopy }) {
  return (
    <Card className="overflow-hidden border-emerald-100 bg-gradient-to-r from-white via-emerald-50/35 to-white shadow-sm">
      <CardContent className="p-4">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-base font-semibold tracking-tight">{copy.onboarding.title}</h3>
            {copy.onboarding.description ? (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {copy.onboarding.description}
              </p>
            ) : null}
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
                {copy.chat.status ? (
                  <p className="text-xs text-muted-foreground">{copy.chat.status}</p>
                ) : null}
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

function ConnectorPanel({
  copy,
  onAddConnectedSource,
  connectionPage = false,
  initialSourceName
}: {
  copy: DashboardCopy;
  onAddConnectedSource: (source: ConnectedSourceRow) => void;
  connectionPage?: boolean;
  initialSourceName?: string;
}) {
  const initialSourceIndex = Math.max(
    0,
    copy.connectors.sources.findIndex((source) => source.name === initialSourceName)
  );
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(initialSourceIndex);
  const [selectedMode, setSelectedMode] = useState<string>(copy.connectors.modes[0]);
  const [selectedAuth, setSelectedAuth] = useState<string>(copy.connectors.authOptions[0]);
  const [wizardStarted, setWizardStarted] = useState(connectionPage);
  const [databaseHost, setDatabaseHost] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [databaseUser, setDatabaseUser] = useState("");
  const [databasePassword, setDatabasePassword] = useState("");
  const [databaseSsl, setDatabaseSsl] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isConnectingDatabase, setIsConnectingDatabase] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadedFileSource, setUploadedFileSource] = useState<ConnectedSourceRow | null>(null);
  const [connectionResult, setConnectionResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isScanningSchema, setIsScanningSchema] = useState(false);
  const [schemaResult, setSchemaResult] = useState<{
    tableCount: number;
    tables: Array<{
      name: string;
      schema?: string;
      columns: Array<{ name: string; type: string; primaryKey?: boolean; foreignKey?: boolean }>;
    }>;
  } | null>(null);
  const selectedSource = copy.connectors.sources[selectedSourceIndex] ?? copy.connectors.sources[0];
  const isFileSource = selectedSource.kind === "file";
  const isSqlLikeSource = selectedSource.kind === "database" || selectedSource.kind === "warehouse";
  const databaseType =
    selectedSource.name === "MySQL" ? "mysql" : selectedSource.name === "PostgreSQL" ? "postgresql" : null;
  const defaultDatabasePort = databaseType === "postgresql" ? "5432" : "3306";
  const isSupportedDatabase = databaseType !== null;
  const isZh = copy.connectors.title === "连接数据源";
  const showWizard = connectionPage || wizardStarted;
  const connectPageHref = `/dashboard/import-data/connect?source=${encodeURIComponent(selectedSource.name)}`;
  const addSelectedSource = (source: ConnectedSourceRow) => {
    onAddConnectedSource(source);
    if (!connectionPage) {
      setWizardStarted(false);
    }
  };
  const resetConnectionResult = () => {
    setConnectionResult(null);
    setSchemaResult(null);
  };
  const databaseConnectionPayload = () => ({
    type: databaseType,
    host: databaseHost,
    database: databaseName,
    username: databaseUser,
    password: databasePassword,
    ssl: databaseSsl
  });

  const handleFileUpload = async (file: File) => {
    if (isUploadingFile) {
      return;
    }

    setSelectedFile(file);
    setIsUploadingFile(true);
    setConnectionResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/data-sources/upload", {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok || !payload?.dataSource) {
        throw new Error(payload?.message || (isZh ? "文件上传失败" : "File upload failed"));
      }

      setSchemaResult({
        tableCount: payload.schema?.tableCount ?? 0,
        tables: payload.dataSource.schema?.tables ?? []
      });
      const uploadedSource = payload.dataSource as ConnectedSourceRow;
      addSelectedSource(uploadedSource);
      setUploadedFileSource(uploadedSource);
      setConnectionResult({
        ok: true,
        message: isZh ? "文件已上传，数据结构已保存" : "File uploaded and schema saved"
      });
    } catch (error) {
      setConnectionResult({
        ok: false,
        message: error instanceof Error ? error.message : isZh ? "文件上传失败" : "File upload failed"
      });
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleTestConnection = async () => {
    if (!databaseType || isTestingConnection) {
      return;
    }

    setIsTestingConnection(true);
    setConnectionResult(null);

    try {
      const response = await fetch("/api/data-sources/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(databaseConnectionPayload())
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || (isZh ? "连接失败" : "Connection failed"));
      }

      setConnectionResult({
        ok: true,
        message: isZh ? "连接测试通过" : "Connection verified"
      });
    } catch (error) {
      setConnectionResult({
        ok: false,
        message: error instanceof Error ? error.message : isZh ? "连接失败" : "Connection failed"
      });
    } finally {
      setIsTestingConnection(false);
    }
  };
  const handleConnectDatabase = async () => {
    if (!databaseType || isConnectingDatabase || connectionResult?.ok !== true) {
      return;
    }

    setIsConnectingDatabase(true);
    setConnectionResult(null);

    try {
      const response = await fetch("/api/data-sources/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: databaseType,
          host: databaseHost,
          database: databaseName,
          username: databaseUser,
          password: databasePassword,
          ssl: databaseSsl,
          mode: selectedMode
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok || !payload?.dataSource) {
        throw new Error(payload?.message || (isZh ? "连接数据库失败" : "Database connection failed"));
      }

      setSchemaResult({
        tableCount: payload.schema?.tableCount ?? 0,
        tables: []
      });
      addSelectedSource(payload.dataSource as ConnectedSourceRow);
      setConnectionResult({
        ok: true,
        message: isZh ? "数据库已连接，正在扫描数据结构" : "Database connected, schema scan started"
      });
    } catch (error) {
      setConnectionResult({
        ok: false,
        message: error instanceof Error ? error.message : isZh ? "连接数据库失败" : "Database connection failed"
      });
    } finally {
      setIsConnectingDatabase(false);
    }
  };

  const handleScanSchema = async () => {
    if (!databaseType || isScanningSchema) {
      return;
    }

    setIsScanningSchema(true);

    try {
      const response = await fetch("/api/data-sources/introspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(databaseConnectionPayload())
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || (isZh ? "扫描失败" : "Schema scan failed"));
      }

      setSchemaResult({
        tableCount: payload.schema?.tableCount ?? 0,
        tables: payload.schema?.tables ?? []
      });
      setConnectionResult({
        ok: true,
        message: isZh ? "数据结构扫描完成" : "Schema scan completed"
      });
    } catch (error) {
      setConnectionResult({
        ok: false,
        message: error instanceof Error ? error.message : isZh ? "扫描失败" : "Schema scan failed"
      });
    } finally {
      setIsScanningSchema(false);
    }
  };

  useEffect(() => {
    setConnectionResult(null);
    setSchemaResult(null);
    setSelectedFile(null);
    setUploadedFileSource(null);
  }, [selectedSource.name]);

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
        <div className={cn("grid gap-4", showWizard && "2xl:grid-cols-[minmax(0,1fr)_340px]")}>
          <div className="rounded-lg border bg-background">
            <div className={cn("bg-secondary/20 p-3", showWizard ? "hidden" : "block")}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {copy.connectors.sourcePicker}
                </p>
                <Button asChild type="button" size="sm" className="h-8 rounded-full">
                  <a href={connectPageHref}>
                    {copy.connectors.connectAction}
                    <ArrowRight />
                  </a>
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {copy.connectors.sources.map((source, index) => (
                  <button
                    key={source.name}
                    type="button"
                    onClick={() => {
                      setSelectedSourceIndex(index);
                      if (!connectionPage) {
                        setWizardStarted(false);
                      }
                      resetConnectionResult();
                    }}
                    className={cn(
                      "rounded-md border bg-background px-3 py-2 text-left transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2",
                      index === selectedSourceIndex &&
                        "border-emerald-700 bg-slate-950 text-white hover:bg-slate-950"
                    )}
                  >
                    <span className="block text-sm font-semibold">{source.name}</span>
                    <span
                      className={cn(
                        "mt-1 block text-xs",
                        index === selectedSourceIndex ? "text-white/75" : "text-muted-foreground"
                      )}
                    >
                      {source.type}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {showWizard ? (
              <>
            <div className="border-b bg-secondary/20 p-3">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-800">
                  {isFileSource ? <FileText className="size-5" /> : <Database className="size-5" />}
                </div>
                <div>
                  <p className="text-sm font-semibold">{selectedSource.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedSource.type}</p>
                </div>
                <Button asChild type="button" variant="outline" size="sm" className="ml-auto">
                  <a href="/dashboard/import-data">{copy.connectors.changeSourceAction}</a>
                </Button>
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
                  {selectedFile ? (
                    <p className="mx-auto mt-3 w-fit rounded-full bg-white px-3 py-1 text-xs font-medium text-muted-foreground">
                      {selectedFile.name}
                    </p>
                  ) : null}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file) {
                        void handleFileUpload(file);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    disabled={isUploadingFile || Boolean(uploadedFileSource)}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadedFileSource ? <CheckCircle2 /> : <Plus />}
                    {isUploadingFile
                      ? (isZh ? "上传中..." : "Uploading...")
                      : uploadedFileSource
                        ? (isZh ? "已上传" : "Uploaded")
                        : (isZh ? "选择文件" : "Choose file")}
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <p className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800 md:col-span-2">
                    {isZh
                      ? `默认使用服务器预设连接，端口自动使用 ${defaultDatabasePort}。下面信息可留空，仅在需要覆盖预设时填写。`
                      : `Uses the server preset by default, with port ${defaultDatabasePort} filled automatically. Leave these blank unless you need to override the preset.`}
                  </p>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {isSqlLikeSource ? "Host" : copy.connectors.workspace}
                    </span>
                    <Input
                      value={databaseHost}
                      onChange={(event) => {
                        setDatabaseHost(event.target.value);
                        resetConnectionResult();
                      }}
                      placeholder={isSqlLikeSource ? "127.0.0.1" : copy.connectors.workspacePlaceholder}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {copy.connectors.database}
                    </span>
                    <Input
                      value={databaseName}
                      onChange={(event) => {
                        setDatabaseName(event.target.value);
                        resetConnectionResult();
                      }}
                      placeholder={copy.connectors.databasePlaceholder}
                    />
                  </label>
                  <label className="flex items-center gap-2 self-end rounded-md border bg-secondary/20 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={databaseSsl}
                      onChange={(event) => {
                        setDatabaseSsl(event.target.checked);
                        resetConnectionResult();
                      }}
                      className="size-4 accent-emerald-700"
                    />
                    <span className="text-sm font-medium">SSL</span>
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
                    <Input
                      value={databaseUser}
                      onChange={(event) => {
                        setDatabaseUser(event.target.value);
                        resetConnectionResult();
                      }}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {copy.connectors.password}
                    </span>
                    <Input
                      type="password"
                      value={databasePassword}
                      onChange={(event) => {
                        setDatabasePassword(event.target.value);
                        resetConnectionResult();
                      }}
                    />
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
              </>
            ) : null}
          </div>

          {showWizard ? (
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
              {isFileSource ? (
                <>
                  {[
                    `${isZh ? "类型" : "Type"}: ${selectedSource.name}`,
                    `${isZh ? "文件" : "File"}: ${selectedFile?.name ?? "-"}`,
                    `${isZh ? "格式" : "Format"}: ${selectedFile?.name.split(".").pop()?.toUpperCase() ?? "CSV / XLSX"}`,
                    `${isZh ? "处理方式" : "Mode"}: ${isZh ? "上传并读取结构" : "Upload and scan schema"}`
                  ].map((row) => (
                    <div key={row} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-emerald-700/70" aria-hidden="true" />
                      {row}
                    </div>
                  ))}
                </>
              ) : isSupportedDatabase ? (
                <>
                  {[
                    `${isZh ? "类型" : "Type"}: ${selectedSource.name}`,
                    `${isZh ? "地址" : "Host"}: ${databaseHost || "-"}`,
                    `${isZh ? "数据库" : "Database"}: ${databaseName || "-"}`,
                    `Port: ${defaultDatabasePort} (${isZh ? "自动" : "auto"})`,
                    `SSL: ${databaseSsl ? "On" : "Off"}`
                  ].map((row) => (
                    <div key={row} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-emerald-700/70" aria-hidden="true" />
                      {row}
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-xs leading-5 text-muted-foreground">
                  {isZh
                    ? "当前版本先支持 MySQL 和 PostgreSQL 的连接测试"
                    : "This wizard currently supports connection testing for MySQL and PostgreSQL"}
                </div>
              )}
            </div>
            {connectionResult ? (
              <div
                className={cn(
                  "mt-3 rounded-lg border px-3 py-2 text-xs font-medium",
                  connectionResult.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                )}
              >
                {connectionResult.message}
              </div>
            ) : null}
            {schemaResult ? (
              <div className="mt-3 rounded-lg border bg-secondary/20 p-3">
                <p className="text-xs font-semibold text-foreground">
                  {isZh ? `已扫描 ${schemaResult.tableCount} 张表` : `Scanned ${schemaResult.tableCount} tables`}
                </p>
                <div className="mt-2 space-y-2">
                  {schemaResult.tables.slice(0, 4).map((table) => (
                    <div key={`${table.schema ?? ""}.${table.name}`} className="rounded-md bg-background px-2 py-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{table.schema ? `${table.schema}.` : ""}{table.name}</span>
                      <span> · {table.columns.length} {isZh ? "个字段" : "columns"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-3 grid gap-2">
              {isFileSource ? (
                uploadedFileSource ? (
                  <Button asChild type="button" size="sm">
                    <a href="/dashboard/import-data">
                      {isZh ? "完成上传" : "Finish upload"}
                      <ArrowRight />
                    </a>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={isUploadingFile}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploadingFile
                      ? (isZh ? "上传中..." : "Uploading...")
                      : (isZh ? "选择文件并上传" : "Choose file and upload")}
                    <ArrowRight />
                  </Button>
                )
              ) : (
                <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!isSupportedDatabase || isTestingConnection}
                  onClick={handleTestConnection}
                >
                  <CheckCircle2 />
                  {isTestingConnection ? (isZh ? "测试中..." : "Testing...") : copy.connectors.testAction}
                </Button>
              <Button
                size="sm"
                disabled={!isSupportedDatabase || connectionResult?.ok !== true || isConnectingDatabase}
                onClick={handleConnectDatabase}
              >
                {isConnectingDatabase
                  ? (isZh ? "连接中..." : "Connecting...")
                  : (isZh ? "连接数据库" : "Connect database")}
                <ArrowRight />
              </Button>
                </>
              )}
            </div>
          </div>
          ) : null}
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

function ReportsPage({
  copy,
  hasConnectedDatabase
}: {
  copy: DashboardCopy;
  hasConnectedDatabase: boolean;
}) {
  return (
    <section id="reports" className="flex min-h-full flex-col gap-3 scroll-mt-20">
      <div className="flex flex-col gap-3 px-1 pb-1 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl">
          <Badge className="mb-2 border-emerald-700/20 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
            {copy.reports.pageBadge}
          </Badge>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {copy.reports.pageTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
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

      <ReportDatabaseCta copy={copy} hasConnectedDatabase={hasConnectedDatabase} />
      <div className="flex min-h-0 flex-1 flex-col">
        <ReportEmptyPreview copy={copy} />
      </div>
    </section>
  );
}

function ReportDatabaseCta({
  copy,
  hasConnectedDatabase
}: {
  copy: DashboardCopy;
  hasConnectedDatabase: boolean;
}) {
  return (
    <Card className="overflow-hidden border-emerald-100 bg-gradient-to-r from-white via-emerald-50/45 to-white shadow-sm">
      <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
            <Database className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{copy.reports.databaseCtaTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">{copy.reports.databaseCtaEmpty}</p>
          </div>
        </div>
        <Button asChild className="w-full sm:w-auto" size="sm">
          <a href="/dashboard/import-data">
            {hasConnectedDatabase
              ? copy.reports.databaseCtaConnected
              : copy.reports.databaseCtaDisconnected}
            <ArrowRight />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

function ReportEmptyPreview({ copy }: { copy: DashboardCopy }) {
  const visibleMonitoringItems = copy.reports.demoExamples;

  return (
    <Card className="h-full overflow-hidden border-emerald-100 bg-gradient-to-br from-white via-emerald-50/35 to-white shadow-sm">
      <CardContent className="h-full p-4">
        <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(310px,0.82fr)] xl:items-stretch">
          <div className="flex h-full flex-col rounded-2xl border bg-white/88 p-5 shadow-sm sm:p-6">
            <Badge className="mb-5 border-emerald-700/20 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
              {copy.reports.emptyBriefingBadge}
            </Badge>
            <p className="text-sm font-medium text-muted-foreground">{copy.reports.emptyReportTitle}</p>
            <h2 className="mt-3 max-w-full whitespace-nowrap text-[clamp(1.75rem,3.15vw,2.85rem)] font-semibold leading-[1.08] tracking-normal text-slate-950">
              {copy.reports.emptyBriefingMetric}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {copy.reports.emptyBriefingTimeComparisons.map(([label, value], index) => {
                const isPositive = value.startsWith("+");

                return (
                  <div
                    key={label}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                      index === 0
                        ? "border-rose-200 bg-rose-50 text-rose-800"
                        : "border-slate-200 bg-white text-muted-foreground"
                    )}
                  >
                    <span>{label}</span>
                    <span className={isPositive ? "text-emerald-700" : "text-rose-700"}>{value}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              {copy.reports.emptyReportDescription}
            </p>

            <div className="mt-5 flex flex-1 flex-col">
              <div className="grid gap-2.5 md:grid-cols-3">
                {copy.reports.emptyBriefingSections.map(([title, ...items]) => (
                  <div key={title} className="h-full rounded-xl border bg-secondary/15 p-3">
                    <p className="text-sm font-semibold">{title}</p>
                    <div className="mt-2 space-y-1.5">
                      {items.map((item) => (
                        <div key={item} className="flex gap-2 text-xs leading-5 text-muted-foreground">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-700" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 md:mt-auto md:pt-4">
                {copy.reports.emptyBriefingActions.map((action, index) => (
                  <Button key={action} variant={index === 0 ? "default" : "outline"} size="sm">
                    {action}
                    <ArrowRight />
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-full rounded-2xl border bg-white/70 p-3">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-2">
                <BrainCircuit className="size-4 text-emerald-700" />
                <p className="text-sm font-semibold">{copy.reports.demoTitle}</p>
              </div>
            </div>

            <div className="grid gap-2.5">
              {visibleMonitoringItems.map((example, index) => (
                <div
                  key={example.title}
                  className={cn(
                    "rounded-xl border bg-white/82 p-2.5 transition hover:border-emerald-200 hover:bg-emerald-50/45",
                    index === 0 && "border-emerald-200 bg-emerald-50/70"
                  )}
                >
                  <div className="flex gap-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-xs font-semibold text-emerald-800">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{example.title}</h3>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {example.metric}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{example.summary}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {example.signals.map((signal) => (
                          <span
                            key={signal}
                            className="rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                          >
                            {signal}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportPage({ locale }: { locale: Locale }) {
  const isZh = locale === "zh";
  const [selectedRange, setSelectedRange] = useState("30D");

  const timeRanges = ["7D", "30D", "90D", "12M"] as const;
  const trendDataBase = [
    { period: "05-01", revenue: 126, arr: 412, cac: 43, retention: 89, activation: 48, conversion: 12.8 },
    { period: "05-04", revenue: 124, arr: 410, cac: 44, retention: 88, activation: 47, conversion: 12.4 },
    { period: "05-08", revenue: 120, arr: 406, cac: 46, retention: 87, activation: 46, conversion: 12.1 },
    { period: "05-12", revenue: 114, arr: 398, cac: 49, retention: 84, activation: 45, conversion: 11.6 },
    { period: "05-16", revenue: 118, arr: 401, cac: 47, retention: 85, activation: 46, conversion: 11.9 },
    { period: "05-20", revenue: 121, arr: 405, cac: 45, retention: 86, activation: 46, conversion: 12.2 },
    { period: "05-24", revenue: 119, arr: 404, cac: 46, retention: 85, activation: 45, conversion: 12.0 },
    { period: "05-28", revenue: 122, arr: 407, cac: 45, retention: 86, activation: 46, conversion: 12.3 },
    { period: "06-01", revenue: 125, arr: 411, cac: 44, retention: 87, activation: 47, conversion: 12.5 },
    { period: "06-04", revenue: 123, arr: 409, cac: 45, retention: 86, activation: 46, conversion: 12.2 },
    { period: "06-08", revenue: 117, arr: 402, cac: 48, retention: 84, activation: 45, conversion: 11.8 },
    { period: "06-12", revenue: 115, arr: 400, cac: 49, retention: 83, activation: 44, conversion: 11.5 }
  ];

  const rangeSizeMap: Record<(typeof timeRanges)[number], number> = {
    "7D": 7,
    "30D": 9,
    "90D": 12,
    "12M": 12
  };

  const trendData = trendDataBase.slice(-rangeSizeMap[selectedRange as keyof typeof rangeSizeMap]);
	  const sparkData = trendDataBase.slice(-7);
	  const currencySymbol = isZh ? "¥" : "$";

  const metricCards = [
	    {
	      label: isZh ? "收入" : "Revenue",
	      value: `${currencySymbol}1.26M`,
	      delta: "-3.2%",
	      positive: false,
	      key: "revenue" as const
	    },
	    { label: "ARR", value: `${currencySymbol}4.11M`, delta: "+1.4%", positive: true, key: "arr" as const },
	    { label: "CAC", value: `${currencySymbol}452`, delta: "+6.8%", positive: false, key: "cac" as const },
    { label: "Retention", value: "84.2%", delta: "-1.9%", positive: false, key: "retention" as const },
    { label: "Activation", value: "45.3%", delta: "+0.8%", positive: true, key: "activation" as const },
    { label: "Conversion", value: "11.7%", delta: "-0.6%", positive: false, key: "conversion" as const }
  ];

  const annotations = [
    {
      date: isZh ? "5 月 12 日" : "May 12",
      text: isZh ? "AI 标注关键指标变化和可能原因" : "AI annotates metric movement and possible causes"
    },
    {
      date: isZh ? "6 月 8 日" : "Jun 8",
      text: isZh ? "AI 标注维度差异和数据质量信号" : "AI annotates dimension variance and data quality signals"
    }
  ];

  const aiInsights = [
    isZh ? "连接数据后，AI 会总结最近发现和异常提醒" : "After data is connected, AI summarizes recent findings and alerts",
    isZh ? "建议下一步会基于指标定义和证据链生成" : "Next-step suggestions are generated from metric definitions and evidence",
    isZh ? "趋势解释会结合历史基线、维度变化和数据新鲜度" : "Trend explanations combine baselines, dimensions, and freshness"
  ];

  return (
    <section id="report" className="flex flex-col gap-4 scroll-mt-20 xl:h-full">
      <div className="flex flex-col gap-3 px-1 pb-1 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{isZh ? "报表" : "Reports"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isZh
              ? "查看经营指标、历史趋势与 AI 数据标注"
              : "Review business metrics, historical trends, and AI data annotations"}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border bg-white/80 p-1">
          {timeRanges.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setSelectedRange(range)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                selectedRange === range
                  ? "bg-slate-900 text-white"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metricCards.map((metric) => (
          <Card key={metric.label} className="border-slate-200/70 bg-white/90 shadow-sm">
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                <span
                  className={cn(
                    "text-xs font-medium",
                    metric.positive ? "text-emerald-700" : "text-rose-700"
                  )}
                >
                  {metric.delta}
                </span>
              </div>
              <p className="text-lg font-semibold leading-none">{metric.value}</p>
              <div className="h-8">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparkData}>
                    <Area
                      type="monotone"
                      dataKey={metric.key}
                      stroke={metric.positive ? "#047857" : "#334155"}
                      strokeWidth={2}
                      fill={metric.positive ? "rgba(5,150,105,0.14)" : "rgba(71,85,105,0.12)"}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.35fr)_320px]">
        <div className="grid gap-4 xl:min-h-0">
          <Card className="border-slate-200/70 bg-white/90 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{isZh ? "收入趋势" : "Revenue trend"}</CardTitle>
              <CardDescription>
                {isZh
                  ? "AI 在图表上自动标注异常、可能原因和指标关联"
                  : "AI annotations highlight anomalies, likely causes, and metric relationships"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="reportRevenueMain" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.24} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <YAxis hide />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#047857"
                      strokeWidth={2.5}
                      fill="url(#reportRevenueMain)"
                    />
                    <Line type="monotone" dataKey="cac" stroke="#0f172a" strokeWidth={1.8} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {annotations.map((item) => (
                  <div key={item.date} className="rounded-xl border bg-emerald-50/45 p-3">
                    <p className="text-xs font-semibold text-emerald-800">{item.date}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-200/70 bg-white/90 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{isZh ? "用户与留存" : "Users and retention"}</CardTitle>
                <CardDescription>DAU / WAU / MAU · Cohort · Activation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border bg-secondary/30 p-2">
                    <p className="text-[11px] text-muted-foreground">DAU</p>
                    <p className="text-sm font-semibold">12.4k</p>
                  </div>
                  <div className="rounded-lg border bg-secondary/30 p-2">
                    <p className="text-[11px] text-muted-foreground">WAU</p>
                    <p className="text-sm font-semibold">51.8k</p>
                  </div>
                  <div className="rounded-lg border bg-secondary/30 p-2">
                    <p className="text-[11px] text-muted-foreground">MAU</p>
                    <p className="text-sm font-semibold">198k</p>
                  </div>
                </div>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                      <YAxis hide />
                      <Tooltip />
                      <Area type="monotone" dataKey="retention" stroke="#0f766e" strokeWidth={2} fill="rgba(20,184,166,0.12)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200/70 bg-white/90 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{isZh ? "获客与转化" : "Acquisition and conversion"}</CardTitle>
                <CardDescription>CAC · Conversion · Funnel · Channel</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData.slice(-6)}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                      <YAxis hide />
                      <Tooltip />
                      <Bar dataKey="cac" fill="#047857" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-xl border bg-secondary/20 p-3">
                  <p className="text-xs font-semibold">{isZh ? "AI 数据标注" : "AI data annotation"}</p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <li>{isZh ? "不同用户群体的转化差异" : "Conversion variance across user segments"}</li>
                    <li>{isZh ? "投入效率和渠道表现变化" : "Acquisition efficiency and channel performance changes"}</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200/70 bg-white/90 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{isZh ? "数据验证" : "Data validation"}</CardTitle>
              <CardDescription>
                {isZh
                  ? "查看原始指标、时间粒度、数据来源和语义映射"
                  : "Inspect raw metrics, time granularity, sources, and semantic mapping"}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {[
                [isZh ? "原始指标" : "Raw metric", "revenue, arr, cac, retention"],
                [isZh ? "时间粒度" : "Time granularity", isZh ? "日 / 周 / 月" : "day / week / month"],
                [isZh ? "数据来源" : "Data source", "Stripe, GA, CRM"],
                [isZh ? "语义层映射" : "Semantic mapping", "paid_amount → revenue"]
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit border-slate-200/70 bg-white/92 shadow-sm xl:sticky xl:top-[76px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{isZh ? "AI Insights" : "AI Insights"}</CardTitle>
            <CardDescription>{isZh ? "最近发现、异常提醒与后续建议" : "Recent findings, alerts, and next analysis steps"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {aiInsights.map((insight, index) => (
              <div
                key={insight}
                className={cn(
                  "rounded-xl border p-3 text-sm leading-6",
                  index === 0 ? "border-emerald-200 bg-emerald-50/60" : "bg-white"
                )}
              >
                {insight}
              </div>
            ))}
            <Button variant="outline" className="mt-1 w-full justify-between">
              {isZh ? "建议继续分析" : "Suggested follow-up analysis"}
              <ArrowRight />
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function Dashboard({
  view = "overview",
  initialDataSource
}: {
  view?: DashboardView;
  initialDataSource?: string;
}) {
  const [locale, , isLocaleReady] = useLocale("en");
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [connectedSources, setConnectedSources] = useState<ConnectedSourceRow[]>([]);
  const copy = dashboardCopy[getCopyLocale(locale)];
  const isReportsView = view === "reports";
  const hasChatPanel = view !== "settings";
  const activeTarget =
    view === "import-data" || view === "import-data-connect" || view === "metrics" || view === "schema"
      ? "#data"
      : view === "report"
        ? "#report"
      : isReportsView
        ? "#reports"
        : view === "settings"
          ? "#settings"
          : "#overview";

  const addConnectedSource = (source: ConnectedSourceRow) => {
    setConnectedSources((current) =>
      current.some((item) => item.id === source.id) ? current : [source, ...current]
    );
  };

  const updateConnectedSource = (source: ConnectedSourceRow) => {
    setConnectedSources((current) =>
      current.map((item) => (item.id === source.id ? source : item))
    );
  };

  const removeConnectedSource = (sourceId: string) => {
    const previousSources = connectedSources;

    setConnectedSources((current) => current.filter((source) => source.id !== sourceId));

    void fetch(`/api/data-sources/${sourceId}`, {
      method: "DELETE"
    }).then((response) => {
      if (!response.ok) {
        setConnectedSources(previousSources);
      }
    }).catch(() => {
      setConnectedSources(previousSources);
    });
  };

  useEffect(() => {
    let isCancelled = false;

    void fetch("/api/data-sources", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!isCancelled && payload?.ok && Array.isArray(payload.dataSources)) {
          setConnectedSources(payload.dataSources as ConnectedSourceRow[]);
        }
      })
      .catch(() => undefined);

    return () => {
      isCancelled = true;
    };
  }, []);

  if (!isLocaleReady) {
    return <div className="h-screen bg-background" />;
  }

  return (
    <div className="flex h-screen overflow-hidden" lang={getHtmlLang(locale)}>
      <Sidebar
        copy={copy}
        activeTarget={activeTarget}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed((current) => !current)}
      />
      <div className="min-w-0 flex h-full flex-1 flex-col overflow-hidden">
        <Header copy={copy} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <main
            className={cn(
              "mx-auto grid min-h-full max-w-[1500px] gap-4 px-4 lg:px-6 xl:items-start",
              isReportsView ? "py-3" : "py-5",
              hasChatPanel
                ? isChatCollapsed
                  ? "xl:grid-cols-[minmax(0,1fr)_76px]"
                  : "xl:grid-cols-[minmax(0,1fr)_430px]"
                : "xl:grid-cols-1"
            )}
          >
            {view === "import-data" || view === "import-data-connect" ? (
              <div className="min-w-0 xl:col-start-1">
                <ImportDataSection
                  copy={copy}
                  connectedSources={connectedSources}
                  onAddConnectedSource={addConnectedSource}
                  connectionPage={view === "import-data-connect"}
                  initialSourceName={initialDataSource}
                />
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
              <div className="min-w-0">
                <SettingsPage
                  copy={copy}
                  connectedSources={connectedSources}
                  onUpdateConnectedSource={updateConnectedSource}
                  onRemoveConnectedSource={removeConnectedSource}
                />
              </div>
            ) : view === "reports" ? (
              <div className="flex min-h-0 min-w-0 flex-col xl:col-start-1">
                <ReportsPage copy={copy} hasConnectedDatabase={connectedSources.length > 0} />
              </div>
            ) : view === "report" ? (
              <div className="min-w-0 xl:col-start-1">
                <ReportPage locale={locale} />
              </div>
            ) : (
              <>
                <div className="min-w-0 xl:col-start-1">
                  <SetupHero copy={copy} />
                </div>
              </>
            )}
            {hasChatPanel ? (
              <ChatPanel
                copy={copy}
                isCollapsed={isChatCollapsed}
                onToggle={() => setIsChatCollapsed((current) => !current)}
                className="min-w-0 xl:sticky xl:top-[76px] xl:col-start-2 xl:row-span-4 xl:row-start-1"
              />
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
