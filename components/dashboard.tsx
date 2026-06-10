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
  Copy,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
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
import {
  getCopyLocale,
  getHtmlLang,
  LOCALE_OPTIONS,
  useLocale,
  type CopyLocale,
  type Locale
} from "@/lib/locale";
import { hasDisplayableMetricResult } from "@/lib/metric-visibility";
import { contextualMetricName } from "@/lib/report-generation/metric-name-normalizer";
import {
  isValidTrendMetricName,
  isValidTrendSeries
} from "@/lib/report-trend-guardrails.mjs";
import { FILE_UPLOAD_MAX_BYTES, FILE_UPLOAD_MAX_MB } from "@/lib/upload-limits";
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
      ["Language", "Saved to your account"],
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
      dismissLabel: "Hide onboarding guide",
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
      title: "AI Analyst",
      description: "Ask follow-up questions about this report",
      status: "",
      collapseLabel: "Collapse AI Follow-up Analysis",
      expandLabel: "Expand AI Follow-up Analysis",
      assistantMessage: "Generate a report to ask follow-up questions.",
      userQuestion: "What should I prioritize next?",
      assistantReply: "Once the report is ready, I will suggest questions based on the current metrics, findings, and risks.",
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
        "Real-time business intelligence from your connected data",
      periodLabel: "Reporting period",
      periodValue: "This week",
      generatedLabel: "Generated",
      generatedValue: "After data import",
      generateAction: "Generate report",
      generatingAction: "Generating...",
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
      previewLabel: "Preview",
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
      monitoringTitle: "AI monitoring scope",
      monitoringMoreLabel: "More...",
      monitoringCollapseLabel: "Show less",
      monitoringSignalLabel: "Signals AI would inspect",
      monitoringExamples: [
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
        ["语言", "已保存到当前账号"],
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
      dismissLabel: "不再显示",
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
      title: "AI 分析助手",
      description: "继续追问当前报告",
      status: "",
      collapseLabel: "收起 AI 分析助手",
      expandLabel: "展开 AI 分析助手",
      assistantMessage: "生成报告后，可以继续追问分析结果。",
      userQuestion: "下一步应该优先处理什么？",
      assistantReply: "报告生成后，我会基于当前指标、发现和风险给出追问建议。",
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
      pageSubtitle: "来自已连接数据的实时业务智能",
      periodLabel: "报告周期",
      periodValue: "今日",
      generatedLabel: "生成状态",
      generatedValue: "导入数据后生成",
      generateAction: "生成报告",
      generatingAction: "生成中...",
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
      previewLabel: "预览",
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
      monitoringTitle: "AI 监控范围",
      monitoringMoreLabel: "更多...",
      monitoringCollapseLabel: "收起",
      monitoringSignalLabel: "AI 会检查的信号",
      monitoringExamples: [
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
  metricStatus?: string;
  validation?: {
    validation_status: "valid" | "warning" | "invalid" | "needs_review" | "execution_failed";
    validation_errors: string[];
    validation_warnings: string[];
    suggested_metric_name?: string;
    suggested_formula?: string;
    suggested_source_table?: string;
    confidence_score: number;
  } | null;
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

const billingEntitlementStorageKey = "monarca-sidebar-billing-entitlement-v2";

function cachedSidebarEntitlement(userId?: string | null) {
  if (sidebarEntitlementCache && (!userId || sidebarEntitlementCache.userId === userId)) {
    return sidebarEntitlementCache.entitlement;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cached = window.localStorage.getItem(billingEntitlementStorageKey);
    const parsed = cached ? JSON.parse(cached) as { userId?: string | null; entitlement?: BillingEntitlementSummary | null } : null;
    if (!parsed?.entitlement || (userId && parsed.userId !== userId)) {
      return null;
    }

    sidebarEntitlementCache = { userId: parsed.userId ?? null, entitlement: parsed.entitlement };
    return parsed.entitlement;
  } catch {
    return null;
  }
}

function setSidebarEntitlementCache(entitlement: BillingEntitlementSummary | null, userId?: string | null) {
  sidebarEntitlementCache = entitlement ? { userId: userId ?? null, entitlement } : null;

  if (typeof window === "undefined") {
    return;
  }

  if (entitlement) {
    window.localStorage.setItem(billingEntitlementStorageKey, JSON.stringify({ userId: userId ?? null, entitlement }));
  } else {
    window.localStorage.removeItem(billingEntitlementStorageKey);
  }
}

let sidebarEntitlementCache: { userId: string | null; entitlement: BillingEntitlementSummary } | null = null;
let connectedSourcesCache: ConnectedSourceRow[] | null = null;
let reportsPageDataCache: unknown = null;

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
  const isZh = copy.sidebar.brand === "蝴蝶效应";
  const [entitlement, setEntitlement] = useState<BillingEntitlementSummary | null>(() => null);
  const [isLoadingEntitlement, setIsLoadingEntitlement] = useState(true);
  const accountName = user?.fullName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? "";
  const accountEmail = user?.primaryEmailAddress?.emailAddress;
  const accountImageUrl = user?.imageUrl;
  const accountInitials = accountName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || accountEmail?.[0]?.toUpperCase() || "U";
  const currentPlan =
    entitlement?.planType === "MONTHLY"
      ? isZh ? "专业版" : "Professional"
      : entitlement?.planType === "ONE_TIME"
        ? isZh ? "单次报告" : "One-time Report"
        : isZh ? "免费版" : "Free";
  const planActionLabel = entitlement?.planType === "FREE" || !entitlement
    ? copy.sidebar.subscribe
    : isZh ? "套餐" : "Plan";

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      setSidebarEntitlementCache(null);
      setEntitlement(null);
      setIsLoadingEntitlement(false);
      return;
    }

    let isCancelled = false;
    const userScopedCachedEntitlement = cachedSidebarEntitlement(user?.id);
    if (userScopedCachedEntitlement) {
      setEntitlement(userScopedCachedEntitlement);
      setIsLoadingEntitlement(false);
    } else {
      setEntitlement(null);
      setIsLoadingEntitlement(true);
    }

    async function loadEntitlement(force = false) {
      const cached = cachedSidebarEntitlement(user?.id);
      if (!force && cached) {
        setEntitlement(cached);
        setIsLoadingEntitlement(false);
        return;
      }

      if (!cached) {
        setIsLoadingEntitlement(true);
      }

      try {
        const response = await fetch("/api/billing/entitlement", { cache: "no-store" });
        const payload = await response.json().catch(() => null);

        if (!isCancelled && payload?.ok) {
          const nextEntitlement = payload.entitlement as BillingEntitlementSummary;
          setSidebarEntitlementCache(nextEntitlement, user?.id);
          setEntitlement(nextEntitlement);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingEntitlement(false);
        }
      }
    }

    void loadEntitlement();
    const refreshEntitlement = () => {
      void loadEntitlement(true);
    };

    window.addEventListener("monarca-billing-entitlement-updated", refreshEntitlement);

    return () => {
      isCancelled = true;
      window.removeEventListener("monarca-billing-entitlement-updated", refreshEntitlement);
    };
  }, [isLoaded, isSignedIn, user?.id]);

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
            title={`${accountName}${currentPlan ? ` · ${currentPlan}` : ""}`}
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
                  <p className="truncate text-xs text-muted-foreground">
                    {isLoadingEntitlement ? (isZh ? "加载套餐中..." : "Loading plan...") : currentPlan}
                  </p>
                </div>
              </div>
              <span className="inline-flex h-7 shrink-0 items-center rounded-md border bg-secondary/35 px-2 text-xs font-medium text-muted-foreground">
                {planActionLabel}
              </span>
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}

function Header({
  copy,
  locale,
  onLocaleChange
}: {
  copy: DashboardCopy;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
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
          <label className="hidden items-center gap-2 rounded-md border bg-white px-2 py-1 text-sm font-medium text-muted-foreground shadow-sm sm:flex">
            <select
              value={locale}
              onChange={(event) => onLocaleChange(event.target.value as Locale)}
              className="bg-transparent text-sm font-medium text-foreground outline-none"
              aria-label={copy.settingsPage.preferences[0]?.[0] ?? "Language"}
            >
              {LOCALE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
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
  const [isValidatingMetrics, setIsValidatingMetrics] = useState(false);
  const [activeMetricActionId, setActiveMetricActionId] = useState<string | null>(null);

  const refreshMetricRows = async (shouldGenerate = false) => {
    const response = await fetch("/api/metrics", { cache: "no-store" });
    const payload = response.ok ? await response.json().catch(() => null) : null;

    if (payload?.ok && Array.isArray(payload.metrics)) {
      if (payload.metrics.length > 0) {
        setMetricRows(payload.metrics as EditableMetricRow[]);
        return;
      }

      if (shouldGenerate) {
        const generateResponse = await fetch("/api/metrics", { method: "POST" });

        if (generateResponse.ok) {
          await refreshMetricRows(false);
          return;
        }
      }
    }

    setMetricRows([]);
  };

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

  const deleteMetric = async (id: string) => {
    setActiveMetricActionId(id);

    try {
      await fetch(`/api/metrics/${id}`, { method: "DELETE" });
      setMetricRows((rows) => rows.filter((row) => row.id !== id));
    } finally {
      setActiveMetricActionId(null);
    }
  };

  const validateAllMetrics = async () => {
    setIsValidatingMetrics(true);

    try {
      await fetch("/api/metrics/validate", { method: "POST" });
      await refreshMetricRows(false);
    } finally {
      setIsValidatingMetrics(false);
    }
  };

  const validateMetric = async (id: string) => {
    setActiveMetricActionId(id);

    try {
      await fetch(`/api/metrics/${id}/validate`, { method: "POST" });
      await refreshMetricRows(false);
    } finally {
      setActiveMetricActionId(null);
    }
  };

  const applyMetricSuggestion = async (row: EditableMetricRow) => {
    if (!row.validation?.suggested_formula) {
      return;
    }

    setActiveMetricActionId(row.id);

    try {
      await fetch(`/api/metrics/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applySuggestion: true })
      });
      await refreshMetricRows(false);
    } finally {
      setActiveMetricActionId(null);
    }
  };

  const editMetricFormula = async (row: EditableMetricRow) => {
    const nextFormula = window.prompt(isZh ? "编辑指标公式" : "Edit metric formula", row.formula);

    if (!nextFormula || nextFormula.trim() === row.formula.trim()) {
      return;
    }

    setActiveMetricActionId(row.id);

    try {
      await fetch(`/api/metrics/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formula: nextFormula.trim() })
      });
      await refreshMetricRows(false);
    } finally {
      setActiveMetricActionId(null);
    }
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
      "Negative Sentiment Rate": "负向情绪占比",
      "Share of reviews marked as negative": "被识别为负向情绪的评论占比",
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

  const validationLabel = (row: EditableMetricRow) => {
    const status = row.validation?.validation_status;

    if (!status) return isZh ? "未校验" : "Not checked";
    if (status === "valid") return isZh ? "通过" : "Valid";
    if (status === "warning") return isZh ? "需确认" : "Warning";
    if (status === "invalid") return isZh ? "未通过" : "Invalid";
    if (status === "execution_failed") return isZh ? "执行失败" : "Execution failed";
    return isZh ? "需复核" : "Needs review";
  };

  const validationClassName = (row: EditableMetricRow) => {
    const status = row.validation?.validation_status;

    if (status === "valid") return "border-emerald-200 bg-emerald-50 text-emerald-800";
    if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
    if (status === "invalid" || status === "execution_failed") return "border-rose-200 bg-rose-50 text-rose-700";
    return "border-slate-200 bg-slate-50 text-slate-700";
  };

  const translateValidationMessage = (message?: string) => {
    if (!message) return "";
    if (!isZh) return message;

    const tableNotFound = /^Table not found:\s*(.+)$/i.exec(message);
    if (tableNotFound) {
      return `未找到数据表：${tableNotFound[1]}`;
    }

    const fieldNotFound = /^Field not found:\s*(.+)$/i.exec(message);
    if (fieldNotFound) {
      return `未找到字段：${fieldNotFound[1]}`;
    }

    const numericField = /^(SUM|AVG) requires a numeric field:\s*(.+)$/i.exec(message);
    if (numericField) {
      return `${numericField[1].toUpperCase()} 需要使用数值字段：${numericField[2]}`;
    }

    const groupByField = /^GROUP BY\/BY field should be a category or time field:\s*(.+)$/i.exec(message);
    if (groupByField) {
      return `分组字段建议使用类别或时间字段：${groupByField[1]}`;
    }

    const joinKey = /^Cross-table metric should explicitly join on\s*(.+)$/i.exec(message);
    if (joinKey) {
      return `跨表指标建议明确使用 ${joinKey[1]} 作为关联键`;
    }

    const entityCount = /^Entity scale metrics should use COUNT_DISTINCT for\s*(.+)$/i.exec(message);
    if (entityCount) {
      return `总体规模类指标建议对 ${entityCount[1]} 使用 COUNT_DISTINCT 去重`;
    }

    const ratioDenominator = /^Ratio denominator may need COUNT_DISTINCT\((.+)\) instead of COUNT\(\*\)$/i.exec(message);
    if (ratioDenominator) {
      return `比例分母可能需要使用 COUNT_DISTINCT(${ratioDenominator[1]})，而不是 COUNT(*)`;
    }

    const dictionary: Record<string, string> = {
      "Formula does not reference any schema field": "公式没有引用任何当前数据结构中的字段",
      "COUNT_IF requires a field condition": "COUNT_IF 需要明确的字段条件",
      "COUNT_DISTINCT_IF requires an entity field and a condition field": "COUNT_DISTINCT_IF 需要一个实体字段和一个条件字段",
      "COUNT_NON_EMPTY requires a field": "COUNT_NON_EMPTY 需要指定一个字段",
      "COUNT_IF uses a placeholder target value; choose an explicit value before reporting": "COUNT_IF 使用了占位值 target，生成报告前需要选择明确的条件值",
      "Ratio metrics should use SAFE_DIVIDE so the execution logic and business formula handle zero denominators consistently": "比例类指标应使用 SAFE_DIVIDE，确保公式口径和执行逻辑都能处理分母为 0 的情况",
      "Sentiment metrics must use Sentiment, Sentiment_Polarity, or Sentiment_Subjectivity fields": "情绪类指标必须使用 Sentiment、Sentiment_Polarity 或 Sentiment_Subjectivity 字段",
      "Rating or score metrics should use Rating or Score fields": "评分类指标建议使用 Rating 或 Score 字段",
      "Reviews is usually a numeric review count field; use SUM(Reviews) instead of COUNT(Reviews)": "Reviews 通常是数值型评论量字段，建议使用 SUM(Reviews)，不要使用 COUNT(Reviews)",
      "Revenue/Income metrics should not use SUM(Price) unless explicitly marked as price_sum or total_list_price": "收入类指标不应直接使用 SUM(Price)，除非明确标记为 price_sum 或 total_list_price",
      "Estimated revenue formula is allowed but must remain clearly labeled as estimated": "预估收入公式可以使用，但指标名称需要明确标记为 estimated / 预估",
      "Positive/Negative Sentiment Rate must be based on the Sentiment field, not Category or another dimension": "正向/负向情绪占比必须基于 Sentiment 字段，不能使用 Category 或其他维度字段",
      "Cross-table metric references multiple tables but no join key was found": "该指标引用了多张表，但没有找到可用的关联键",
      "Category sentiment analysis across googleplaystore tables requires an App join key": "跨 googleplaystore 表分析分类情绪时，需要使用 App 字段作为关联键"
    };

    return dictionary[message] ?? message;
  };

  const validationIssue = (row: EditableMetricRow) => {
    const error = row.validation?.validation_errors?.[0];
    const warning = row.validation?.validation_warnings?.[0];

    if (error) return translateValidationMessage(error);
    if (warning) return translateValidationMessage(warning);
    return row.validation ? (isZh ? "公式和字段通过规则校验" : "Formula and fields passed rule validation") : (isZh ? "点击重新校验" : "Run validation");
  };

  const validationSuggestion = (row: EditableMetricRow) => {
    if (row.validation?.suggested_formula) {
      return row.validation.suggested_formula;
    }

    if (row.validation?.suggested_metric_name) {
      return row.validation.suggested_metric_name;
    }

    return row.validation?.validation_status === "valid"
      ? (isZh ? "无需修正" : "No correction needed")
      : (isZh ? "暂无建议" : "No suggestion");
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isValidatingMetrics || metricRows.length === 0}
              onClick={() => void validateAllMetrics()}
            >
              <CheckCircle2 />
              {isValidatingMetrics ? (isZh ? "校验中" : "Validating") : (isZh ? "校验全部" : "Validate all")}
            </Button>
            <Button type="button" size="sm" onClick={() => void openMetricBuilder()}>
              <Plus />
              {isZh ? "新增指标" : "Add metric"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[1640px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[90px]" />
              <col className="w-[120px]" />
              <col className="w-[170px]" />
              <col className="w-[260px]" />
              <col className="w-[280px]" />
              <col className="w-[240px]" />
              <col className="w-[120px]" />
              <col className="w-[260px]" />
              <col className="w-[240px]" />
              <col className="w-[110px]" />
              <col className="w-[150px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b bg-secondary/80 text-xs text-muted-foreground backdrop-blur">
              <tr>
                {copy.metricCatalog.exampleHeaders.map((header) => (
                  <th key={header} className="px-4 py-3 font-medium">
                    {header}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">
                  {isZh ? "校验状态" : "Validation"}
                </th>
                <th className="px-4 py-3 font-medium">
                  {isZh ? "问题说明" : "Issue"}
                </th>
                <th className="px-4 py-3 font-medium">
                  {isZh ? "修正建议" : "Suggestion"}
                </th>
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
                    <td className="px-4 py-4">
                      <div className="h-7 rounded-full bg-secondary" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-5 rounded-md bg-secondary" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-5 rounded-md bg-secondary" />
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
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-medium", validationClassName(row))}>
                      {validationLabel(row)}
                    </span>
                    {row.validation?.confidence_score ? (
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {row.validation.confidence_score}%
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs leading-5 text-muted-foreground">
                    <span className="line-clamp-3" title={validationIssue(row)}>
                      {validationIssue(row)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="line-clamp-3 max-w-full whitespace-normal break-all rounded-md border bg-secondary/35 px-2 py-1.5 font-mono text-[11px] leading-5">
                      {formatFormula(validationSuggestion(row))}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={activeMetricActionId === row.id}
                        onClick={() => void validateMetric(row.id)}
                      >
                        {isZh ? "校验" : "Check"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={activeMetricActionId === row.id || !row.validation?.suggested_formula}
                        onClick={() => void applyMetricSuggestion(row)}
                      >
                        {isZh ? "采用" : "Apply"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={activeMetricActionId === row.id}
                        onClick={() => void editMetricFormula(row)}
                      >
                        {isZh ? "编辑" : "Edit"}
                      </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={copy.metricCatalog.deleteMetric}
                      disabled={activeMetricActionId === row.id}
                      onClick={() => void deleteMetric(row.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                    </div>
                  </td>
                </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center">
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
  const activeMembers = members.filter((member) => member.status !== "removed");
  const shouldShowInviteHint = !isLoading && !errorMessage && activeMembers.length <= 1;
  const shouldShowMemberList = isLoading || members.length > 0;
  const teamMembersLoadError =
    copy.settingsPage.title === "设置"
      ? "团队成员加载失败，请稍后重试"
      : "Failed to load team members";

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
	    } catch {
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
	          {errorMessage ? <p className="text-xs text-rose-600">{teamMembersLoadError}</p> : null}

	          {shouldShowInviteHint ? (
	            <p className="rounded-lg border bg-secondary/25 p-3 text-xs text-muted-foreground">
	              {copy.settingsPage.teamMembersEmpty}
	            </p>
	          ) : null}

          {shouldShowMemberList ? (
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
          </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

type BillingEntitlementSummary = {
  planType: "FREE" | "ONE_TIME" | "MONTHLY";
  status: "free" | "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "expired";
  canConnectDataSource: boolean;
  canGenerateReport: boolean;
  remainingReportGenerations: number | null;
  isUnlimitedReports: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  upgradeRequiredReason: string | null;
};

function SettingsBillingPanel({ copy }: { copy: DashboardCopy }) {
  const isZh = copy.settingsPage.title === "设置";
  const [entitlement, setEntitlement] = useState<BillingEntitlementSummary | null>(null);
  const [isLoadingEntitlement, setIsLoadingEntitlement] = useState(true);
  const [isCancellingSubscription, setIsCancellingSubscription] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadEntitlement() {
      setIsLoadingEntitlement(true);

      try {
        const response = await fetch("/api/billing/entitlement", { cache: "no-store" });
        const payload = await response.json().catch(() => null);

        if (!isCancelled && payload?.ok) {
          const nextEntitlement = payload.entitlement as BillingEntitlementSummary;
          setSidebarEntitlementCache(nextEntitlement);
          setEntitlement(nextEntitlement);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingEntitlement(false);
        }
      }
    }

    void loadEntitlement();

    return () => {
      isCancelled = true;
    };
  }, []);

  const currentPlan =
    entitlement?.planType === "MONTHLY"
      ? isZh ? "月付无限版" : "Monthly Unlimited"
      : entitlement?.planType === "ONE_TIME"
        ? isZh ? "单次报告" : "One-time Report"
        : isZh ? "免费版" : "Free";
  const formatDate = (value: string | null) =>
    value ? new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", { dateStyle: "medium" }).format(new Date(value)) : "-";
  const planTypeLabel =
    entitlement?.planType === "MONTHLY"
      ? isZh ? "年度套餐，按月支付" : "Annual plan, paid monthly"
      : entitlement?.planType === "ONE_TIME"
        ? isZh ? "一次性付费" : "One-time payment"
        : isZh ? "免费" : "Free";
  const statusLabel = entitlement?.status ?? "free";
  const usageLabel = entitlement?.isUnlimitedReports
    ? isZh ? "无限" : "Unlimited"
    : String(entitlement?.remainingReportGenerations ?? 0);
  const stateMessage = !entitlement || entitlement.planType === "FREE"
    ? isZh ? "免费版只能查看 dashboard，请升级后连接数据并生成报告" : "Free: view dashboard only. Upgrade to connect data and generate reports."
    : entitlement.planType === "ONE_TIME" && (entitlement.remainingReportGenerations ?? 0) <= 0
      ? isZh ? "单次报告已使用完，请再次购买或升级专业版" : "You have used your one-time report generation. Buy another report or upgrade to Professional."
      : entitlement.planType === "MONTHLY" && entitlement.cancelAtPeriodEnd
        ? isZh ? `套餐仍可使用至 ${formatDate(entitlement.currentPeriodEnd)}` : `Your plan remains active until ${formatDate(entitlement.currentPeriodEnd)}.`
        : entitlement.status === "expired"
          ? isZh ? "订阅已过期，请重新开通" : "Subscription expired. Please reactivate"
          : isZh ? "套餐权限可用" : "Plan access is active";
  const planCards = isZh
    ? [
        {
          name: "单次报告",
          price: "¥99",
          description: "不限数据源连接，包含 1 次完整报告生成",
          href: "/checkout/trial",
          action: "再次购买",
          tone: "outline"
        },
        {
          name: "专业版",
          price: "¥2,000 / 月",
          description: "数据整合 + 专业团队定制指标体系 + 自动化报告",
          href: "/checkout/professional",
          action: entitlement?.planType === "MONTHLY" ? "当前套餐" : "开通专业版",
          tone: entitlement?.planType === "MONTHLY" ? "current" : "primary"
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
          name: "One-time Report",
          price: "$20",
          description: "Unlimited data source connections plus 1 complete report generation",
          href: "/checkout/trial",
          action: "Buy again",
          tone: "outline"
        },
        {
          name: "Professional",
          price: "$600 / mo",
          description: "Data integration, expert-assisted metric configuration, and automated reports",
          href: "/checkout/professional",
          action: entitlement?.planType === "MONTHLY" ? "Current plan" : "Start professional",
          tone: entitlement?.planType === "MONTHLY" ? "current" : "primary"
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
  const billingStats = isZh
    ? [
        ["当前套餐", currentPlan],
        ["套餐类型", planTypeLabel],
        ["数据源连接", entitlement?.canConnectDataSource ? "允许，不限数量" : "需要升级"],
        ["报告生成", entitlement?.canGenerateReport ? usageLabel : "需要升级或再次购买"],
        ["有效期", formatDate(entitlement?.currentPeriodEnd ?? null)],
        ["订阅状态", statusLabel]
      ]
    : [
        ["Current plan", currentPlan],
        ["Plan type", planTypeLabel],
        ["Data source connections", entitlement?.canConnectDataSource ? "Allowed, unlimited" : "Upgrade required"],
        ["Report generations", entitlement?.canGenerateReport ? usageLabel : "Upgrade or buy again"],
        ["Valid until", formatDate(entitlement?.currentPeriodEnd ?? null)],
        ["Subscription status", statusLabel]
      ];
  const canCancelSubscription =
    entitlement?.planType === "MONTHLY" &&
    (entitlement.status === "active" || entitlement.status === "trialing") &&
    !entitlement.cancelAtPeriodEnd;

  async function handleCancelSubscription() {
    if (!canCancelSubscription) return;

    const confirmed = window.confirm(
      isZh
        ? "确定要取消订阅吗？取消后当前周期内仍可继续使用。"
        : "Cancel this subscription? Access remains available until the current period ends."
    );

    if (!confirmed) return;

    setIsCancellingSubscription(true);

    try {
      const response = await fetch("/api/billing/subscription/cancel", {
        method: "POST"
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || "Failed to cancel subscription.");
      }

      const entitlementResponse = await fetch("/api/billing/entitlement", { cache: "no-store" });
      const entitlementPayload = await entitlementResponse.json().catch(() => null);

      if (entitlementPayload?.ok) {
        const nextEntitlement = entitlementPayload.entitlement as BillingEntitlementSummary;
        setSidebarEntitlementCache(nextEntitlement);
        setEntitlement(nextEntitlement);
        window.dispatchEvent(new Event("monarca-billing-entitlement-updated"));
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : isZh ? "取消订阅失败" : "Failed to cancel subscription.");
    } finally {
      setIsCancellingSubscription(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="overflow-hidden bg-gradient-to-br from-white via-emerald-50/70 to-white shadow-sm">
        <CardHeader className="border-b p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-base">{copy.settingsPage.billingTitle}</CardTitle>
              <CardDescription className="mt-1">{copy.settingsPage.billingDescription}</CardDescription>
              <p className="mt-2 text-sm font-medium text-emerald-800">
                {isLoadingEntitlement ? (isZh ? "正在加载套餐权限..." : "Loading entitlement...") : stateMessage}
              </p>
            </div>
            <Badge variant="secondary">{currentPlan}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
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
                {entitlement?.planType === "MONTHLY" ? isZh ? "管理订阅" : "Manage subscription" : isZh ? "开通专业版" : "Start Professional"}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/checkout/trial">
                {isZh ? "购买单次报告" : "Buy another report"}
                <ArrowRight className="size-4" />
              </a>
            </Button>
            {canCancelSubscription ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancelSubscription}
                disabled={isCancellingSubscription}
              >
                {isCancellingSubscription
                  ? isZh ? "正在取消..." : "Canceling..."
                  : isZh ? "取消订阅" : "Cancel subscription"}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
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
            <CardTitle className="text-base">{isZh ? "套餐权限说明" : "Plan permissions"}</CardTitle>
            <CardDescription className="mt-1">
              {isZh ? "所有权限由当前工作区套餐决定" : "Access is determined by the current workspace plan"}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {(isZh
              ? [
                  ["免费版", "仅可查看 dashboard。升级后才能连接数据并生成报告。"],
                  ["单次报告", "不限数据源连接，包含 1 次完整报告生成；Daily、Weekly、AI Brief、Insights 和 Action Recommendations 属于同一次生成。"],
                  ["专业版", "年度服务周期，按月付款；包含数据接入协助、指标体系配置和自动化报告。"]
                ]
              : [
                  ["Free", "View dashboard only. Upgrade to connect data and generate reports."],
                  ["One-time Report", "Unlimited data source connections plus 1 complete report generation. Daily, Weekly, AI Brief, Insights, and Action Recommendations count as the same generation."],
                  ["Professional", "Annual service term, paid monthly, with expert-assisted data onboarding, metric configuration, and automated reports."]
                ]).map(([plan, description]) => (
              <div key={plan} className="px-4 py-3">
                <p className="text-sm font-medium">{plan}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden bg-white shadow-sm">
          <CardHeader className="border-b p-4">
            <CardTitle className="text-base">{isZh ? "套餐操作" : "Plan actions"}</CardTitle>
            <CardDescription className="mt-1">
              {isZh ? "购买新的单次报告或开通专业版" : "Buy another one-time report or start Professional"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="rounded-lg border bg-secondary/20 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-700" />
                <p className="text-sm font-semibold">{currentPlan}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {stateMessage}
              </p>
            </div>
            <Button asChild className="w-full" size="sm">
              <a href="/checkout/professional">
                <CreditCard className="size-4" />
                {isZh ? "开通专业版" : "Start Professional"}
              </a>
            </Button>
            <Button asChild variant="outline" className="w-full" size="sm">
              <a href="/checkout/trial">{isZh ? "购买单次报告" : "Buy another report"}</a>
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
          <ConnectedDataOverview copy={copy} connectedSources={connectedSources} />
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

function buildReportChatMessages(
  copy: DashboardCopy,
  reportPayload: { briefing?: { payloadJson?: { metricResults?: ReportMetricEvidenceResult[] } | null } | null } | null,
  isReportView: boolean
) {
  const isZh = copy.chat.sendLabel === "发送消息";

  if (!isReportView) {
    return [
      { role: "assistant" as const, content: copy.chat.assistantMessage },
      { role: "user" as const, content: copy.chat.userQuestion },
      { role: "assistant" as const, content: copy.chat.assistantReply }
    ];
  }

  const metricResults = reportPayload?.briefing?.payloadJson?.metricResults ?? [];
  const computedText = metricResults
    .filter((result) => result.status === "computed")
    .map((result) => [
      result.metricName,
      result.displayName,
      result.metricCategory,
      result.businessType,
      result.formula
    ].filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();

  if (!computedText) {
    return [
      {
        role: "assistant" as const,
        content: isZh ? "生成报告后，可以继续追问分析结果。" : "Generate a report to ask follow-up questions."
      }
    ];
  }

  const hasAppOrReviews = /app|install|rating|review|sentiment|category/.test(computedText);
  const hasSalesOrRevenue = /revenue|sales|gmv|order|product|channel|roi|cost|margin/.test(computedText);
  const hasFinanceTimeseries = /close|adj close|volume|drawdown|return|volatility|trading|price/.test(computedText);
  const questions = hasAppOrReviews
    ? (isZh
      ? [
          "哪些类别贡献了最多安装量？",
          "哪些 App 的负向反馈最高？",
          "哪些指标存在口径限制？",
          "下一步最应该优先处理什么？"
        ]
      : [
          "Which category drives the most installs?",
          "Which apps have the highest negative feedback?",
          "What should I prioritize next?",
          "Which metrics have reliability caveats?"
        ])
    : hasSalesOrRevenue
      ? (isZh
        ? [
            "哪些产品贡献了最多收入？",
            "哪些渠道转化最低？",
            "哪些品类退款率最高？",
            "哪些对象值得优先放大？"
          ]
        : [
            "Which product drove the revenue change?",
            "Which channel has the highest ROI?",
            "Which segment declined most?"
          ])
      : hasFinanceTimeseries
        ? (isZh
          ? [
              "当前价格趋势如何？",
              "最大回撤是多少？",
              "哪些时间段成交量异常？",
              "当前波动风险高吗？"
            ]
          : [
              "How is the current price trend?",
              "What is the max drawdown?",
              "Which periods show unusual trading volume?",
              "Is current volatility risk elevated?"
            ])
      : (isZh
        ? ["这份报告最重要的发现是什么？", "下一步应该优先处理什么？", "哪些指标需要注意口径？"]
        : ["What is the most important finding in this report?", "What should I prioritize next?", "Which metrics need caveats?"]);

  return [
    {
      role: "assistant" as const,
      content: isZh ? "可以围绕当前报告继续追问，例如：" : "You can ask follow-up questions about this report, for example:"
    },
    ...questions.slice(0, 4).map((content) => ({ role: "user" as const, content }))
  ];
}

function ChatPanel({
  copy,
  className,
  isCollapsed,
  onToggle,
  isReportView = false
}: {
  copy: DashboardCopy;
  className?: string;
  isCollapsed: boolean;
  onToggle: () => void;
  isReportView?: boolean;
}) {
  const isZh = copy.chat.title.includes("分析师");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>(
    buildReportChatMessages(copy, null, isReportView)
  );
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    if (!isReportView) {
      setMessages(buildReportChatMessages(copy, null, false));
      setInputValue("");
      setErrorMessage(null);
      return;
    }

    const refreshReportMessages = () => {
      void fetch("/api/dashboard/reports", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (!isCancelled) {
            setMessages(buildReportChatMessages(copy, payload, true));
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setMessages(buildReportChatMessages(copy, null, true));
          }
        });
    };

    refreshReportMessages();
    window.addEventListener("monarca-report-updated", refreshReportMessages);
    setInputValue("");
    setErrorMessage(null);

    return () => {
      isCancelled = true;
      window.removeEventListener("monarca-report-updated", refreshReportMessages);
    };
  }, [copy, isReportView]);

  const sendMessage = async () => {
    const content = inputValue.trim();

    if (!content || isSending) {
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content }];

    setMessages(nextMessages);
    setInputValue("");
    setIsSending(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: nextMessages.slice(-10)
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || (isZh ? "AI 分析失败" : "AI analysis failed"));
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: String(payload.reply || (isZh ? "我暂时没有生成回复，请再试一次。" : "I could not generate a reply. Please try again."))
        }
      ]);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const upgradeMessage = isZh ? "请先升级套餐" : "Please upgrade your plan first";
      const fallbackMessage = isZh ? "AI 分析失败" : "AI analysis failed";
      setErrorMessage(
        isZh
          ? upgradeMessage
          : /upgrade|billing|entitlement|ChatGPT|OpenAI|Failed/i.test(rawMessage)
            ? upgradeMessage
            : rawMessage || fallbackMessage
      );
      setMessages((current) => current.filter((message) => message !== nextMessages[nextMessages.length - 1]));
      setInputValue(content);
    } finally {
      setIsSending(false);
    }
  };

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
                <p className="text-xs text-muted-foreground">{copy.chat.description}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" aria-label={copy.chat.collapseLabel} onClick={onToggle}>
              <ChevronRight />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
            {messages.map((message, index) =>
              message.role === "assistant" ? (
                <div key={`${message.role}-${index}-${message.content}`} className="flex gap-2">
                  <div className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-foreground">
                    <Bot className="size-4" />
                  </div>
                  <div className="rounded-lg border bg-secondary/45 px-3 py-2 text-sm leading-6">
                    {message.content}
                  </div>
                </div>
              ) : (
                <div
                  key={`${message.role}-${index}-${message.content}`}
                  className="ml-auto max-w-[82%] rounded-lg bg-primary px-3 py-2 text-sm leading-6 text-primary-foreground"
                >
                  {message.content}
                </div>
              )
            )}
            {isSending ? (
              <div className="flex gap-2">
                <div className="grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-foreground">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-lg border bg-secondary/45 px-3 py-2 text-sm leading-6 text-muted-foreground">
                  {isZh ? "正在继续分析..." : "Analyzing..."}
                </div>
              </div>
            ) : null}
            {errorMessage ? <p className="px-1 text-xs leading-5 text-rose-600">{errorMessage}</p> : null}
          </div>
          <form
            className="mt-auto rounded-lg border bg-background p-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <div className="flex gap-2">
              <Input
                className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
                placeholder={copy.chat.inputPlaceholder}
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                disabled={isSending}
              />
              <Button
                type="submit"
                size="icon"
                className="size-9 shrink-0"
                aria-label={copy.chat.sendLabel}
                disabled={isSending || !inputValue.trim()}
              >
                <Send />
              </Button>
            </div>
          </form>
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
  const databaseType = selectedSource.name === "PostgreSQL" ? "postgresql" : null;
  const defaultDatabasePort = "5432";
  const directApiUploadMaxBytes = 4 * 1024 * 1024;
  const largeUploadMaxBytes = FILE_UPLOAD_MAX_BYTES;
  const isSupportedDatabase = databaseType !== null;
  const isZh = copy.connectors.title === "连接数据源";
  const showWizard = connectionPage || wizardStarted;
  const connectPageHref = `/dashboard/import-data/connect?source=${encodeURIComponent(selectedSource.name)}`;
  const addSelectedSource = (source: ConnectedSourceRow) => {
    onAddConnectedSource(source);
    window.dispatchEvent(new Event("monarca-data-sources-updated"));
    if (!connectionPage) {
      setWizardStarted(false);
    }
  };
  const friendlyConnectionMessage = (message: string) => {
    if (message.includes("PostgreSQL") || message.includes("DATABASE_URL")) {
      return isZh
        ? "数据库连接地址不是 PostgreSQL。请把 DATABASE_URL 改为 Neon/PostgreSQL 连接串后重试。"
        : "The application database URL is not PostgreSQL. Set DATABASE_URL to your Neon/PostgreSQL connection string and try again.";
    }

    if (message.includes("pool timeout") || message.includes("failed to retrieve a connection")) {
      return isZh
        ? "数据库暂时无法连接，请检查 PostgreSQL / Neon 连接地址后再继续"
        : "The database is unavailable. Check the PostgreSQL / Neon connection string before continuing.";
    }

    return message;
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
  const uploadSmallFile = (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    return fetch("/api/data-sources/upload", {
      method: "POST",
      body: formData
    });
  };
  const uploadLargeFile = async (file: File) => {
    const presignResponse = await fetch("/api/uploads/presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || "application/octet-stream"
      })
    });
    const presignPayload = await presignResponse.json().catch(() => null) as {
      ok?: boolean;
      message?: string;
      provider?: string;
      uploadUrl?: string;
      path?: string;
      token?: string;
      bucket?: string;
    } | null;

    if (!presignResponse.ok || !presignPayload?.ok || !presignPayload.uploadUrl || !presignPayload.path) {
      throw new Error(presignPayload?.message || (isZh ? "无法准备大文件上传" : "Failed to prepare large file upload"));
    }

    const uploadFormData = new FormData();
    uploadFormData.append("cacheControl", "3600");
    uploadFormData.append("", file);

    const uploadResponse = await fetch(presignPayload.uploadUrl, {
      method: "PUT",
      body: uploadFormData
    });
    const uploadPayload = await uploadResponse.json().catch(() => null) as {
      Key?: string;
      path?: string;
      fullPath?: string;
      error?: string;
      message?: string;
    } | null;

    if (!uploadResponse.ok) {
      throw new Error(uploadPayload?.message || uploadPayload?.error || (isZh
        ? "大文件直传失败。请检查 Supabase Storage CORS 或 bucket 配置。"
        : "Large file direct upload failed. Check Supabase Storage CORS or bucket settings."));
    }

    const uploadedPath = uploadPayload?.path ??
      (uploadPayload?.fullPath && presignPayload.bucket && uploadPayload.fullPath.startsWith(`${presignPayload.bucket}/`)
        ? uploadPayload.fullPath.slice(presignPayload.bucket.length + 1)
        : null) ??
      presignPayload.path;

    return fetch("/api/data-sources/upload/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        path: uploadedPath,
        bucket: presignPayload.bucket,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream"
      })
    });
  };

  const handleFileUpload = async (file: File) => {
    if (isUploadingFile) {
      return;
    }

    setSelectedFile(file);
    if (file.size > largeUploadMaxBytes) {
      setConnectionResult({
        ok: false,
        message: isZh
          ? `文件过大。当前最大支持 ${FILE_UPLOAD_MAX_MB}MB。`
          : `File is too large. Maximum upload size is ${FILE_UPLOAD_MAX_MB}MB.`
      });
      return;
    }

    setIsUploadingFile(true);
    setConnectionResult(null);

    try {
      const response = file.size <= directApiUploadMaxBytes
        ? await uploadSmallFile(file)
        : await uploadLargeFile(file);
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
      const message = error instanceof Error ? error.message : isZh ? "文件上传失败" : "File upload failed";

      setConnectionResult({
        ok: false,
        message: friendlyConnectionMessage(message)
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
                    ? "当前版本仅支持 PostgreSQL 的连接测试"
                    : "This wizard currently supports PostgreSQL connection testing"}
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

type ReportMetricEvidenceResult = {
  metricId: string;
  metricName: string;
  displayName?: string;
  unit?: string | null;
  formula: string;
  status: "computed" | "skipped" | "failed";
  scope?: "global" | "group" | "entity" | "ranking" | "comparison" | "diagnostic" | "internal";
  value?: number | string | null;
  currentValue?: number | string | null;
  previousValue?: number | string | null;
  absoluteChange?: number | null;
  percentChange?: number | null;
  direction?: "up" | "down" | "flat" | "unknown";
  changeDirection?: "up" | "down" | "flat" | "unknown";
  metricDirection?: MetricDirection;
  currentRangeLabel?: string;
  previousRangeLabel?: string;
  currentStartDate?: string | null;
  currentEndDate?: string | null;
  previousStartDate?: string | null;
  previousEndDate?: string | null;
  changePercent?: number | null;
  displayText?: string | null;
  tooltipText?: string | null;
  dateRangePreset?: string;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  dateField?: string | null;
  hasTimeField?: boolean;
  rows?: Array<{
    dimension: string;
    value: number | string | null;
    sampleSize?: number | null;
    negativeCount?: number | null;
  }>;
  computedAt: string;
  error?: string;
  metricType?: string;
  metricCategory?: string;
  businessType?: string;
  sourceDataset?: string;
  semanticRole?: string | null;
  priority?: number | null;
  isCoreMetric?: boolean;
  isBusinessMetric?: boolean;
  isInternalMetric?: boolean;
  isDiagnosticMetric?: boolean;
  isBenchmarkMetric?: boolean;
  isEstimated?: boolean;
  requiresDeduplication?: boolean;
  sampleSize?: number | null;
  warningTypes?: string[];
  validationStatus?: string | null;
  warning?: string;
};

type ReportTimeRange = "TODAY" | "7D" | "30D" | "90D" | "12M" | "ALL" | "CUSTOM";
type MetricDirection = "higher_is_better" | "lower_is_better" | "neutral";

type SelectedReportDateRange = {
  preset: ReportTimeRange;
  startDate?: string;
  endDate?: string;
  previousStartDate?: string;
  previousEndDate?: string;
};

type ReportTimeConfigViewData = {
  hasTimeField: boolean;
  defaultTimeField?: string;
  availableTimeFields?: string[];
  selectedRange?: ReportTimeRange;
  granularity?: "day" | "week" | "month" | "year";
  dateRangePreset?: ReportTimeRange;
  startDate?: string | null;
  endDate?: string | null;
};

type ReportTrendMetricViewData = {
  metricName: string;
  businessModule?: string;
  dateField?: string;
  granularity?: "day" | "week" | "month" | "year";
  currentValue?: number | null;
  previousValue?: number | null;
  absoluteChange?: number | null;
  percentChange?: number | null;
  currentRangeLabel?: string;
  previousRangeLabel?: string;
  currentStartDate?: string | null;
  currentEndDate?: string | null;
  previousStartDate?: string | null;
  previousEndDate?: string | null;
  changePercent?: number | null;
  changeDirection?: "up" | "down" | "flat" | "unknown";
  metricDirection?: MetricDirection;
  displayText?: string | null;
  tooltipText?: string | null;
  trendDirection?: "up" | "down" | "flat" | "volatile" | "unknown";
  timeSeries?: Array<{ date: string; value: number | null }>;
};

type ReportTrendChartViewData = {
  title: string;
  chartType: "line_chart" | "bar_chart" | "area_chart" | "combo_chart" | "multi_series_line_chart";
  xAxis?: string;
  yAxis?: string;
  series?: Array<{ date: string; value: number | null }>;
  description?: string;
  insightHint?: string;
};

type ReportEntitlementViewData = {
  firstFreeReportUsed: boolean;
  oneTimeReportAvailable: boolean;
  subscriptionStatus: "free" | "active" | "cancelled" | "expired" | string;
  subscriptionPlan?: "free" | "one_time" | "monthly" | "enterprise" | string | null;
  monthlyUnlimited: boolean;
  currentPeriodEnd?: string | null;
  canGenerateReport: boolean;
  reason?:
    | "FIRST_FREE_REPORT_AVAILABLE"
    | "ONE_TIME_REPORT_AVAILABLE"
    | "SUBSCRIPTION_ACTIVE"
    | "FREE_REPORT_USED"
    | "SUBSCRIPTION_EXPIRED"
    | "NO_ACCESS"
    | null;
  accessType?: "free_first_report" | "one_time_purchase" | "subscription" | null;
  upgradeRequired: boolean;
};

function reportEntitlementMessage(entitlement: ReportEntitlementViewData | null | undefined, locale: Locale) {
  const isZh = locale === "zh";

  if (!entitlement) {
    return isZh ? "正在加载报告生成权限..." : "Loading report generation access...";
  }

  if (entitlement.monthlyUnlimited && entitlement.subscriptionStatus === "active") {
    return "";
  }

  if (entitlement.oneTimeReportAvailable) {
    return isZh ? "你有 1 次已购买的报告生成机会" : "You have 1 purchased report generation available";
  }

  if (!entitlement.firstFreeReportUsed) {
    return isZh ? "你可以免费生成第一份 AI 数据分析报告" : "You can generate your first AI data analysis report for free";
  }

  return isZh ? "免费报告已使用。升级后可继续生成新报告。" : "Your free report has been used. Upgrade to generate new reports.";
}

function reportGenerateButtonLabel(entitlement: ReportEntitlementViewData | null | undefined, locale: Locale, fallback: string) {
  if (!entitlement) return fallback;

  if (!entitlement.firstFreeReportUsed && entitlement.accessType === "free_first_report") {
    return locale === "zh" ? "免费生成报告" : "Generate your first report for free";
  }

  return locale === "zh" ? "生成报告" : "Generate report";
}

type ReportModeView = "daily_brief" | "weekly_report" | "custom_report" | "history";

function reportModeTabs(locale: Locale): Array<{ value: ReportModeView; label: string }> {
  const isZh = locale === "zh";
  return [
    { value: "daily_brief", label: isZh ? "日报" : "Daily Brief" },
    { value: "weekly_report", label: isZh ? "周报" : "Weekly Report" },
    { value: "custom_report", label: isZh ? "月经营分析" : "Monthly Review" },
    { value: "history", label: isZh ? "历史记录" : "History" }
  ];
}

function reportModeDefaultDateRange(mode: Exclude<ReportModeView, "history">): SelectedReportDateRange {
  if (mode === "daily_brief") return { preset: "ALL" };
  if (mode === "weekly_report") return { preset: "ALL" };
  return { preset: "ALL" };
}

function formatDateOnly(value?: string | Date | null) {
  if (!value) return "-";
  if (typeof value === "string") {
    const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function reportDateText(value: string) {
  return value
    .replace(/\b(\d{4}-\d{2}-\d{2})[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, "$1")
    .replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+\d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?\b/gi, (_match, month, day, year) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

type ReportListItem = {
  id: string;
  title: string;
  summary: string;
  targetObjects?: string[];
  keyEvidence?: string;
  businessJudgment?: string;
  recommendedAction?: string;
  caveat?: string;
  details?: string;
  currentValue?: number | string | null;
  previousValue?: number | string | null;
  percentChange?: number | null;
  metricKind?: string;
};

type DailyDimensionComparisonRow = {
  id: string;
  name: string;
  sampleSmall?: boolean;
  todayOrders?: number | null;
  yesterdayOrders?: number | null;
  ordersChange?: number | null;
  todayCustomers?: number | null;
  yesterdayCustomers?: number | null;
  customersChange?: number | null;
  todayNetSales?: number | null;
  yesterdayNetSales?: number | null;
  netSalesChange?: number | null;
  todayAov?: number | null;
  yesterdayAov?: number | null;
  aovChange?: number | null;
  todayReturnRate?: number | null;
  yesterdayReturnRate?: number | null;
  returnRateChange?: number | null;
  todayRating?: number | null;
  yesterdayRating?: number | null;
  ratingChange?: number | null;
  todayFulfillmentDays?: number | null;
  yesterdayFulfillmentDays?: number | null;
  fulfillmentDaysChange?: number | null;
  businessJudgment?: string;
};

type DailyDimensionComparisonTable = {
  id: string;
  type: "category" | "product" | "channel" | "market" | "segment";
  label: string;
  rows: DailyDimensionComparisonRow[];
  summaries: string[];
};

function reportListItems(value: unknown, fallbackTitle: string, maxItems = 20): ReportListItem[] {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map((item, index) => {
        const record = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
        return {
        id: String(record.id ?? `${fallbackTitle}-${index}`),
        title: reportDateText(String(record.title ?? fallbackTitle)),
        summary: reportDateText(String(record.summary ?? record.finding ?? record.action ?? record.recommendedAction ?? record.currentConclusion ?? "")),
        targetObjects: Array.isArray(record.targetObjects) ? record.targetObjects.map((target) => reportDateText(String(target))) : [],
        keyEvidence: typeof record.keyEvidence === "string" ? reportDateText(record.keyEvidence) : "",
        businessJudgment: typeof record.businessJudgment === "string" ? reportDateText(record.businessJudgment) : "",
        recommendedAction: typeof record.recommendedAction === "string" ? reportDateText(record.recommendedAction) : "",
        caveat: typeof record.caveat === "string" ? reportDateText(record.caveat) : "",
        details: typeof record.details === "string" ? reportDateText(record.details) : "",
        currentValue: typeof record.currentValue === "number" || typeof record.currentValue === "string" ? record.currentValue : null,
        previousValue: typeof record.previousValue === "number" || typeof record.previousValue === "string" ? record.previousValue : null,
        percentChange: typeof record.percentChange === "number" ? record.percentChange : null,
        metricKind: typeof record.metricKind === "string" ? record.metricKind : ""
      };
    })
    : [];
}

function numberFromReportValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,%+,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function reportDimensionComparisons(value: unknown): DailyDimensionComparisonTable[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const record = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    const type = String(record.type ?? "");
    if (!["category", "product", "channel", "market", "segment"].includes(type)) return [];
    const rows = Array.isArray(record.rows) ? record.rows.flatMap((row, rowIndex) => {
      const rowRecord = row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : {};
      const name = reportDateText(String(rowRecord.name ?? ""));
      if (!name) return [];
      return [{
        id: String(rowRecord.id ?? `${type}-${rowIndex}`),
        name,
        sampleSmall: rowRecord.sampleSmall === true,
        todayOrders: numberFromReportValue(rowRecord.todayOrders),
        yesterdayOrders: numberFromReportValue(rowRecord.yesterdayOrders),
        ordersChange: numberFromReportValue(rowRecord.ordersChange),
        todayCustomers: numberFromReportValue(rowRecord.todayCustomers),
        yesterdayCustomers: numberFromReportValue(rowRecord.yesterdayCustomers),
        customersChange: numberFromReportValue(rowRecord.customersChange),
        todayNetSales: numberFromReportValue(rowRecord.todayNetSales),
        yesterdayNetSales: numberFromReportValue(rowRecord.yesterdayNetSales),
        netSalesChange: numberFromReportValue(rowRecord.netSalesChange),
        todayAov: numberFromReportValue(rowRecord.todayAov),
        yesterdayAov: numberFromReportValue(rowRecord.yesterdayAov),
        aovChange: numberFromReportValue(rowRecord.aovChange),
        todayReturnRate: numberFromReportValue(rowRecord.todayReturnRate),
        yesterdayReturnRate: numberFromReportValue(rowRecord.yesterdayReturnRate),
        returnRateChange: numberFromReportValue(rowRecord.returnRateChange),
        todayRating: numberFromReportValue(rowRecord.todayRating),
        yesterdayRating: numberFromReportValue(rowRecord.yesterdayRating),
        ratingChange: numberFromReportValue(rowRecord.ratingChange),
        todayFulfillmentDays: numberFromReportValue(rowRecord.todayFulfillmentDays),
        yesterdayFulfillmentDays: numberFromReportValue(rowRecord.yesterdayFulfillmentDays),
        fulfillmentDaysChange: numberFromReportValue(rowRecord.fulfillmentDaysChange),
        businessJudgment: reportDateText(String(rowRecord.businessJudgment ?? ""))
      }];
    }) : [];
    if (!rows.length) return [];
    return [{
      id: String(record.id ?? `dimension-${index}`),
      type: type as DailyDimensionComparisonTable["type"],
      label: reportDateText(String(record.label ?? type)),
      rows,
      summaries: Array.isArray(record.summaries) ? record.summaries.map((summary) => reportDateText(String(summary))).filter(Boolean).slice(0, 3) : []
    }];
  });
}

function demoReportContent(mode: ReportModeView, locale: Locale): Record<string, unknown> {
  const isZh = locale === "zh";
  const dailyKpis = [
    { id: "demo-net-sales", title: isZh ? "净销售额" : "Net Sales", currentValue: 27118, previousValue: 28870, percentChange: -0.061, metricKind: "revenue" },
    { id: "demo-orders", title: isZh ? "订单数" : "Orders", currentValue: 680, previousValue: 700, percentChange: -0.029, metricKind: "orders" },
    { id: "demo-customers", title: isZh ? "客户数" : "Customers", currentValue: 656, previousValue: 662, percentChange: -0.009, metricKind: "customers" },
    { id: "demo-aov", title: isZh ? "客单价" : "AOV", currentValue: 39.88, previousValue: 41.27, percentChange: -0.034, metricKind: "aov" },
    { id: "demo-units", title: isZh ? "销售件数" : "Units Sold", currentValue: 1120, previousValue: 1180, percentChange: -0.05, metricKind: "units" },
    { id: "demo-rating", title: isZh ? "平均客户评分" : "Average Rating", currentValue: 4.18, previousValue: 4.26, percentChange: -0.018, metricKind: "rating" },
    { id: "demo-fulfillment", title: isZh ? "平均履约天数" : "Fulfillment Days", currentValue: 3.71, previousValue: 3.6, percentChange: 0.03, metricKind: "fulfillment_days" },
    { id: "demo-return", title: isZh ? "退货率" : "Return Rate", currentValue: 0, previousValue: 0, percentChange: null, metricKind: "return_rate", caveat: isZh ? "近期订单退货可能存在业务滞后，需结合后续退货记录观察。" : "Returns may lag recent orders; watch later return records." }
  ];
  const dimensionComparisons = [
    {
      id: "demo-category",
      type: "category",
      label: isZh ? "品类" : "Category",
      rows: [
        { id: "food", name: "Food & Beverage", todayOrders: 144, yesterdayOrders: 128, ordersChange: 0.125, todayNetSales: 4056, yesterdayNetSales: 4008, netSalesChange: 0.012, todayAov: 28.17, yesterdayAov: 31.31, aovChange: -0.1, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.28, yesterdayRating: 4.25, ratingChange: 0.007, businessJudgment: isZh ? "订单增长但客单价下降，收入增长质量需要继续观察。" : "Orders grew while AOV fell, so revenue quality needs monitoring." },
        { id: "beauty", name: "Beauty & Personal Care", todayOrders: 129, yesterdayOrders: 139, ordersChange: -0.072, todayNetSales: 3901, yesterdayNetSales: 4478, netSalesChange: -0.129, todayAov: 30.24, yesterdayAov: 32.22, aovChange: -0.061, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.27, yesterdayRating: 4.31, ratingChange: -0.009, businessJudgment: isZh ? "订单和客单价同步回落，是收入下降的主要拖累之一。" : "Orders and AOV both declined, making this a revenue drag." },
        { id: "home", name: "Home & Kitchen", todayOrders: 122, yesterdayOrders: 121, ordersChange: 0.008, todayNetSales: 4407, yesterdayNetSales: 4451, netSalesChange: -0.01, todayAov: 36.12, yesterdayAov: 36.79, aovChange: -0.018, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.14, yesterdayRating: 4.2, ratingChange: -0.014, businessJudgment: isZh ? "订单基本稳定，但客单价和评分回落，需要看商品结构。" : "Orders were stable, but AOV and rating fell; inspect product mix." }
      ],
      summaries: [
        isZh ? "Food & Beverage 今日订单最高，较昨日增长 12.5%。" : "Food & Beverage led orders and grew 12.5% versus yesterday.",
        isZh ? "Beauty & Personal Care 净销售额回落，优先判断来自订单量还是客单价。" : "Beauty & Personal Care revenue fell; separate order and AOV effects."
      ]
    },
    {
      id: "demo-product",
      type: "product",
      label: isZh ? "商品" : "Product",
      rows: [
        { id: "p05001", name: "P05001", todayOrders: 42, yesterdayOrders: 36, ordersChange: 0.167, todayNetSales: 2580, yesterdayNetSales: 2260, netSalesChange: 0.142, todayAov: 61.43, yesterdayAov: 62.78, aovChange: -0.022, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.45, yesterdayRating: 4.39, ratingChange: 0.014, businessJudgment: isZh ? "订单增长且评分稳定，可作为低风险曝光测试对象。" : "Orders grew with stable ratings, making it a low-risk exposure test candidate." },
        { id: "p03118", name: "P03118", todayOrders: 35, yesterdayOrders: 41, ordersChange: -0.146, todayNetSales: 1490, yesterdayNetSales: 1840, netSalesChange: -0.19, todayAov: 42.57, yesterdayAov: 44.88, aovChange: -0.051, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.08, yesterdayRating: 4.22, ratingChange: -0.033, businessJudgment: isZh ? "订单、收入和评分同步回落，需要检查商品页、库存或评价变化。" : "Orders, revenue, and rating all declined; inspect product page, stock, or review changes." },
        { id: "p08742", name: "P08742", todayOrders: 29, yesterdayOrders: 24, ordersChange: 0.208, todayNetSales: 970, yesterdayNetSales: 820, netSalesChange: 0.183, todayAov: 33.45, yesterdayAov: 34.17, aovChange: -0.021, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.31, yesterdayRating: 4.26, ratingChange: 0.012, sampleSmall: true, businessJudgment: isZh ? "订单增长但样本较少，适合继续观察，不直接下强结论。" : "Orders grew on a small sample; continue observing before drawing a strong conclusion." }
      ],
      summaries: [
        isZh ? "P05001 订单和收入同步增长，适合作为曝光测试候选。" : "P05001 grew in both orders and revenue, making it an exposure test candidate.",
        isZh ? "P03118 多项指标回落，建议优先查看库存、页面和评价记录。" : "P03118 declined across several metrics; review stock, page, and reviews."
      ]
    },
    {
      id: "demo-channel",
      type: "channel",
      label: isZh ? "渠道" : "Channel",
      rows: [
        { id: "online", name: "Online Store", todayOrders: 286, yesterdayOrders: 274, ordersChange: 0.044, todayNetSales: 11980, yesterdayNetSales: 11640, netSalesChange: 0.029, todayAov: 41.89, yesterdayAov: 42.48, aovChange: -0.014, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.23, yesterdayRating: 4.25, ratingChange: -0.005, businessJudgment: isZh ? "渠道订单增长但客单价略降，需关注低价商品占比。" : "Orders grew while AOV softened; watch low-price product mix." },
        { id: "marketplace", name: "Marketplace", todayOrders: 228, yesterdayOrders: 252, ordersChange: -0.095, todayNetSales: 8610, yesterdayNetSales: 10120, netSalesChange: -0.149, todayAov: 37.76, yesterdayAov: 40.16, aovChange: -0.06, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.16, yesterdayRating: 4.24, ratingChange: -0.019, businessJudgment: isZh ? "订单和客单价同步回落，是今日收入下降的重要渠道拖累。" : "Orders and AOV both fell, making this a key channel drag." },
        { id: "social", name: "Social Commerce", todayOrders: 166, yesterdayOrders: 174, ordersChange: -0.046, todayNetSales: 6528, yesterdayNetSales: 7110, netSalesChange: -0.082, todayAov: 39.33, yesterdayAov: 40.86, aovChange: -0.037, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.14, yesterdayRating: 4.28, ratingChange: -0.033, businessJudgment: isZh ? "收入回落伴随评分下降，需要排查投放商品和履约体验。" : "Revenue fell with rating decline; inspect promoted products and fulfillment experience." }
      ],
      summaries: [
        isZh ? "Online Store 仍是最稳渠道，但客单价略有压力。" : "Online Store remains the steadiest channel, though AOV is under pressure.",
        isZh ? "Marketplace 今日拖累明显，优先拆解流量、转化和商品结构。" : "Marketplace is the largest drag; split traffic, conversion, and product mix."
      ]
    },
    {
      id: "demo-market",
      type: "market",
      label: isZh ? "市场" : "Market",
      rows: [
        { id: "us", name: "United States", todayOrders: 218, yesterdayOrders: 210, ordersChange: 0.038, todayNetSales: 9560, yesterdayNetSales: 9120, netSalesChange: 0.048, todayAov: 43.85, yesterdayAov: 43.43, aovChange: 0.01, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.29, yesterdayRating: 4.27, ratingChange: 0.005, todayFulfillmentDays: 3.42, yesterdayFulfillmentDays: 3.38, fulfillmentDaysChange: 0.012, businessJudgment: isZh ? "订单和收入同步增长，且客单价稳定，是今日表现较好的市场。" : "Orders and revenue grew with stable AOV, making this a stronger market today." },
        { id: "de", name: "Germany", todayOrders: 146, yesterdayOrders: 158, ordersChange: -0.076, todayNetSales: 5860, yesterdayNetSales: 6720, netSalesChange: -0.128, todayAov: 40.14, yesterdayAov: 42.53, aovChange: -0.056, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.11, yesterdayRating: 4.25, ratingChange: -0.033, todayFulfillmentDays: 4.12, yesterdayFulfillmentDays: 3.78, fulfillmentDaysChange: 0.09, businessJudgment: isZh ? "履约变慢且评分下降，可能影响市场体验和后续转化。" : "Fulfillment slowed and rating declined, which may affect experience and conversion." },
        { id: "jp", name: "Japan", todayOrders: 118, yesterdayOrders: 126, ordersChange: -0.063, todayNetSales: 4930, yesterdayNetSales: 5200, netSalesChange: -0.052, todayAov: 41.78, yesterdayAov: 41.27, aovChange: 0.012, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.2, yesterdayRating: 4.22, ratingChange: -0.005, todayFulfillmentDays: 3.64, yesterdayFulfillmentDays: 3.55, fulfillmentDaysChange: 0.025, businessJudgment: isZh ? "订单回落但客单价稳定，优先看流量或转化变化。" : "Orders declined while AOV stayed stable; inspect traffic or conversion." }
      ],
      summaries: [
        isZh ? "United States 收入和订单同步增长，是今日较优市场。" : "United States grew in both revenue and orders.",
        isZh ? "Germany 履约变慢且评分下降，需要优先排查体验。" : "Germany has slower fulfillment and lower rating; prioritize experience checks."
      ]
    },
    {
      id: "demo-segment",
      type: "segment",
      label: isZh ? "客户分层" : "Customer Segment",
      rows: [
        { id: "new", name: "New", todayCustomers: 310, yesterdayCustomers: 318, customersChange: -0.025, todayOrders: 322, yesterdayOrders: 332, ordersChange: -0.03, todayNetSales: 11340, yesterdayNetSales: 12280, netSalesChange: -0.077, todayAov: 35.22, yesterdayAov: 36.99, aovChange: -0.048, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.13, yesterdayRating: 4.22, ratingChange: -0.021, businessJudgment: isZh ? "新客规模和客单价回落，需要判断新增质量和首单商品结构。" : "New customer scale and AOV declined; inspect acquisition quality and first-order mix." },
        { id: "returning", name: "Returning", todayCustomers: 237, yesterdayCustomers: 240, customersChange: -0.013, todayOrders: 258, yesterdayOrders: 262, ordersChange: -0.015, todayNetSales: 11260, yesterdayNetSales: 11340, netSalesChange: -0.007, todayAov: 43.64, yesterdayAov: 43.28, aovChange: 0.008, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.24, yesterdayRating: 4.28, ratingChange: -0.009, businessJudgment: isZh ? "老客表现基本稳定，是今日收入的稳定来源。" : "Returning customers were broadly stable and supported revenue." },
        { id: "vip", name: "VIP", todayCustomers: 54, yesterdayCustomers: 50, customersChange: 0.08, todayOrders: 62, yesterdayOrders: 58, ordersChange: 0.069, todayNetSales: 3590, yesterdayNetSales: 3310, netSalesChange: 0.085, todayAov: 57.9, yesterdayAov: 57.07, aovChange: 0.015, todayReturnRate: 0, yesterdayReturnRate: 0, returnRateChange: null, todayRating: 4.36, yesterdayRating: 4.34, ratingChange: 0.005, businessJudgment: isZh ? "VIP 客户规模和收入增长，适合观察是否可加强复购运营。" : "VIP customers and revenue grew; consider stronger retention plays." }
      ],
      summaries: [
        isZh ? "New 用户规模最高，但客单价和评分下滑，需要判断新增质量。" : "New users are largest, but AOV and rating fell; assess acquisition quality.",
        isZh ? "VIP 表现较好，可作为下阶段复购运营对象。" : "VIP performed well and can support next-stage retention actions."
      ]
    }
  ];
  const scaleMonthlyKpi = (item: Record<string, unknown>, days: number) => {
    const kind = String(item.metricKind ?? "");
    const shouldScale = kind === "revenue" || kind === "orders" || kind === "customers" || kind === "units";
    return {
      ...item,
      currentValue: shouldScale && typeof item.currentValue === "number" ? item.currentValue * days : item.currentValue,
      previousValue: shouldScale && typeof item.previousValue === "number" ? item.previousValue * days : item.previousValue
    };
  };

  const dailyContent = {
    isDemo: true,
    reportMode: "daily_brief",
    reportTitle: isZh ? "2026-06-09 Demo 电商经营日报" : "2026-06-09 Demo Ecommerce Daily Report",
    latestDataDate: "2026-06-09",
    latestDateNotice: isZh ? "Demo 示例" : "Demo",
    dailySampleSize: 680,
    totalRows: 82911,
    fullDataValidated: true,
    aiBrief: [
      { id: "demo-brief-1", businessJudgment: isZh ? "今日净销售额较昨日下降 6.1%，主要由订单数和客单价共同拖累。" : "Net sales declined 6.1%, driven by lower orders and AOV." },
      { id: "demo-brief-2", businessJudgment: isZh ? "平均客户评分下降且履约天数变长，需要观察体验指标。" : "Rating declined while fulfillment slowed, so experience quality needs monitoring." },
      { id: "demo-brief-3", businessJudgment: isZh ? "Food & Beverage 订单增长，但客单价下降，适合进一步拆解商品结构。" : "Food & Beverage orders grew, but AOV fell; inspect product mix." }
    ],
    dailyKpis,
    dimensionComparisons,
    keyChanges: [
      {
        id: "demo-finding-revenue",
        title: isZh ? "今日收入下滑，订单数和客单价共同拖累" : "Revenue declined from both orders and AOV",
        caveat: "High",
        keyEvidence: isZh ? "净销售额 27.1K vs 28.9K，-6.1%；订单数 680 vs 700，-2.9%；客单价 39.88 vs 41.27，-3.4%" : "Net sales 27.1K vs 28.9K, -6.1%; orders 680 vs 700, -2.9%; AOV 39.88 vs 41.27, -3.4%",
        businessJudgment: isZh ? "收入下降不是单一因素造成，而是订单规模减少和单笔订单价值下降共同影响。" : "The decline came from both smaller order scale and lower basket value.",
        recommendedAction: isZh ? "优先按品类、渠道和市场拆解订单数与客单价变化。" : "Break down order and AOV changes by category, channel, and market."
      },
      {
        id: "demo-finding-experience",
        title: isZh ? "评分下降且履约变慢，体验指标需要观察" : "Rating declined while fulfillment slowed",
        caveat: "Medium",
        keyEvidence: isZh ? "平均客户评分 4.18 vs 4.26，-1.8%；履约天数 3.71 vs 3.60，+3.0%" : "Average rating 4.18 vs 4.26, -1.8%; fulfillment days 3.71 vs 3.60, +3.0%",
        businessJudgment: isZh ? "履约变慢可能影响客户体验和后续评分。" : "Slower fulfillment may affect customer experience and future ratings.",
        recommendedAction: isZh ? "查看评分下降明显的品类和履约变慢的市场。" : "Inspect categories with rating declines and markets with slower fulfillment."
      },
      {
        id: "demo-finding-dimension-source",
        title: isZh ? "二级维度显示变化来源集中在渠道、品类和市场体验" : "Secondary dimensions show change sources across channel, category, and market experience",
        caveat: "Medium",
        keyEvidence: isZh
          ? "Food & Beverage 订单 144，较昨日 +12.5%，但客单价 -10.0%；Marketplace 净销售额 -14.9%；Germany 履约天数 +9.0%、评分 -3.3%；VIP 净销售额 +8.5%。"
          : "Food & Beverage orders 144, +12.5% vs yesterday, but AOV -10.0%; Marketplace net sales -14.9%; Germany fulfillment days +9.0% and rating -3.3%; VIP net sales +8.5%.",
        businessJudgment: isZh
          ? "收入变化不是单一 KPI 问题，渠道拖累、品类客单价下降和市场履约变慢同时存在，VIP 客群则提供了正向线索。"
          : "The revenue movement is not a single-KPI issue: channel drag, lower category AOV, and slower market fulfillment coexist, while VIP customers provide a positive signal.",
        recommendedAction: isZh
          ? "优先拆解 Marketplace 的商品结构、Food & Beverage 的低客单价订单，以及 Germany 的履约明细；同时观察 VIP 是否适合下阶段复购运营。"
          : "Prioritize Marketplace product mix, low-AOV Food & Beverage orders, and Germany fulfillment details; also test whether VIP customers can support retention actions."
      }
    ],
    dataCaveats: [
      { id: "demo-caveat", title: isZh ? "Demo 示例数据" : "Demo data", summary: isZh ? "当前为固定演示数据，不代表你的真实业务。连接真实数据后会自动切换。" : "This is fixed demo data. Connect real data to switch to your own report." }
    ]
  };

  if (mode === "weekly_report") {
    return {
      ...dailyContent,
      reportMode: "weekly_report",
      reportTitle: isZh ? "2026-06-03 至 2026-06-09 Demo 电商经营周报" : "2026-06-03 to 2026-06-09 Demo Ecommerce Weekly Report",
      currentPeriodStart: "2026-06-03",
      currentPeriodEnd: "2026-06-09",
      previousPeriodStart: "2026-05-27",
      previousPeriodEnd: "2026-06-02",
      currentPeriodComplete: true,
      weeklyKpis: dailyKpis.map((item) => ({ ...item, currentValue: typeof item.currentValue === "number" ? item.currentValue * 7 : item.currentValue, previousValue: typeof item.previousValue === "number" ? item.previousValue * 7 : item.previousValue })),
      weeklyDimensionComparisons: dimensionComparisons,
      keyFindings: dailyContent.keyChanges,
      growthOpportunities: dailyContent.keyChanges.slice(0, 1),
      nextWeekActions: dailyContent.keyChanges
    };
  }

  if (mode === "custom_report") {
    const monthlyKpis = dailyKpis.map((item) => scaleMonthlyKpi(item, 9));
    const dailyAverageMetrics = [
      {
        id: "demo-daily-average-revenue",
        title: isZh ? "日均净销售额" : "Average Daily Net Sales",
        summary: isZh ? "本月日均 27.1K，上月同期日均 28.9K，环比 -6.1%。" : "This month average 27.1K; prior-month same-day average 28.9K; change -6.1%.",
        keyEvidence: isZh ? "本月累计 244.1K / 9 天；上月同期 259.8K / 9 天。" : "This month total 244.1K / 9 days; prior-month same-day 259.8K / 9 days.",
        businessJudgment: isZh ? "当前收入节奏低于上月同期，需要拆解订单和客单价来源。" : "Revenue pace is below the prior-month same-day period; separate order and AOV effects."
      },
      {
        id: "demo-daily-average-orders",
        title: isZh ? "日均订单数" : "Average Daily Orders",
        summary: isZh ? "本月日均 680 单，上月同期日均 700 单，环比 -2.9%。" : "This month average 680 orders; prior-month same-day average 700; change -2.9%.",
        keyEvidence: isZh ? "本月累计 6.1K 单；上月同期 6.3K 单。" : "This month total 6.1K orders; prior-month same-day 6.3K.",
        businessJudgment: isZh ? "订单节奏小幅回落，需判断是流量、转化还是库存导致。" : "Order pace declined slightly; check traffic, conversion, or stock."
      },
      {
        id: "demo-daily-average-customers",
        title: isZh ? "日均客户数" : "Average Daily Customers",
        summary: isZh ? "本月日均客户数 656，上月同期 662，环比 -0.9%。" : "This month average customers 656; prior-month same-day 662; change -0.9%.",
        keyEvidence: isZh ? "客户规模基本稳定，但订单和客单价仍回落。" : "Customer scale is broadly stable while orders and AOV still declined.",
        businessJudgment: isZh ? "更可能是购买频次或商品结构影响收入，而不是客户规模大幅流失。" : "Revenue pressure is more likely from purchase frequency or product mix than major customer loss."
      },
      {
        id: "demo-daily-average-units",
        title: isZh ? "日均销售件数" : "Average Daily Units",
        summary: isZh ? "本月日均 1.1K 件，上月同期 1.2K 件，环比 -5.0%。" : "This month average 1.1K units; prior-month same-day 1.2K; change -5.0%.",
        keyEvidence: isZh ? "销售件数下降幅度大于订单数，说明单笔购买件数可能减少。" : "Units fell more than orders, suggesting fewer items per order.",
        businessJudgment: isZh ? "建议检查组合购买、加购商品和高频品类表现。" : "Review bundles, add-ons, and high-frequency categories."
      }
    ];
    return {
      ...dailyContent,
      reportMode: "custom_report",
      reportTitle: isZh ? "2026-06-01 至 2026-06-09 Demo 月经营分析" : "2026-06-01 to 2026-06-09 Demo Monthly Review",
      currentMonthStart: "2026-06-01",
      currentMonthEnd: "2026-06-09",
      comparisonMonthStart: "2026-05-01",
      comparisonMonthEnd: "2026-05-09",
      selectedMonth: "2026-06",
      comparisonType: "previous_month_same_day",
      currentMonthComplete: false,
      monthlyKpis,
      monthlyDailyAverages: dailyAverageMetrics,
      monthlyDimensionComparisons: dimensionComparisons,
      monthlyTrends: dailyContent.keyChanges,
      changeDrivers: dailyContent.keyChanges,
      topMovers: dailyContent.keyChanges,
      monthlyRisks: dailyContent.keyChanges.slice(1),
      monthlyOpportunities: dailyContent.keyChanges.slice(0, 1),
      nextMonthActions: dailyContent.keyChanges
    };
  }

  if (mode === "history") {
    return {
      isDemo: true,
      reportMode: "history",
      reportHistory: [
        {
          id: "demo-history-daily-2026-06-09",
          reportMode: "daily_brief",
          reportTimeMode: "daily_business_report",
          title: isZh ? "2026-06-09 Demo 电商经营日报" : "2026-06-09 Demo Ecommerce Daily Report",
          status: isZh ? "Demo 示例" : "Demo",
          generatedAt: "2026-06-09T09:00:00.000Z",
          summaryJson: {
            summary: isZh ? "净销售额较昨日下降 6.1%，订单数和客单价共同拖累。" : "Net sales declined 6.1%, driven by lower orders and AOV."
          }
        },
        {
          id: "demo-history-weekly-2026-06-09",
          reportMode: "weekly_report",
          reportTimeMode: "weekly_business_report",
          title: isZh ? "2026-06-03 至 2026-06-09 Demo 电商经营周报" : "2026-06-03 to 2026-06-09 Demo Ecommerce Weekly Report",
          status: isZh ? "Demo 示例" : "Demo",
          generatedAt: "2026-06-09T09:10:00.000Z",
          summaryJson: {
            summary: isZh ? "最近 7 天对比前 7 天，重点关注收入节奏、品类结构和体验指标。" : "The latest 7 days focus on revenue pace, category mix, and experience metrics."
          }
        },
        {
          id: "demo-history-monthly-2026-06",
          reportMode: "custom_report",
          reportTimeMode: "monthly_business_review",
          title: isZh ? "2026-06-01 至 2026-06-09 Demo 月经营分析" : "2026-06-01 to 2026-06-09 Demo Monthly Review",
          status: isZh ? "Demo 示例" : "Demo",
          generatedAt: "2026-06-09T09:20:00.000Z",
          summaryJson: {
            summary: isZh ? "本月尚未结束，优先用日均净销售额、日均订单和结构变化判断经营节奏。" : "The month is incomplete, so daily averages and mix changes are used to judge pace."
          }
        }
      ]
    };
  }

  return dailyContent;
}

function reportPercentText(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function weeklyKpiTone(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-slate-500";
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-slate-600";
}

function dailyKpiTone(item: ReportListItem) {
  const value = item.percentChange;
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-slate-500";
  const lowerIsBetter = item.metricKind === "return_rate" || item.metricKind === "fulfillment_days";
  const improved = lowerIsBetter ? value < 0 : value > 0;
  if (Math.abs(value) < 0.0001) return "text-slate-600";
  return improved ? "text-emerald-700" : "text-rose-700";
}

function dailyKpiChangeLabel(item: ReportListItem, locale: Locale, comparisonLabel?: string) {
  if (item.metricKind === "fulfillment_days" && typeof item.percentChange === "number" && item.percentChange > 0) {
    return locale === "zh" ? "变慢" : "slower";
  }
  if (item.metricKind === "fulfillment_days" && typeof item.percentChange === "number" && item.percentChange < 0) {
    return locale === "zh" ? "变快" : "faster";
  }
  return comparisonLabel ?? (locale === "zh" ? "较昨日" : "vs yesterday");
}

function weeklyKpiValueText(value?: number | string | null) {
  if (typeof value === "number") return formatReportMetricValue(value);
  if (typeof value !== "string") return "-";
  const number = Number(value);
  return Number.isFinite(number) ? formatReportMetricValue(number) : value;
}

function evidenceMetricCards(evidence?: string) {
  if (!evidence) return [];
  return evidence.split(/[；;]/).flatMap((part, index) => {
    const text = part.trim();
    if (!text) return [];
    const match = /^(.+?)\s+([^\s]+)\s+vs\s+([^，,]+)[，,]\s*([+-]?\d+(?:\.\d+)?%|昨日无可比数据|-)$/i.exec(text);
    if (!match) return [];
    return [{
      id: `${text}-${index}`,
      label: match[1].trim(),
      current: match[2].trim(),
      previous: match[3].trim(),
      change: match[4].trim()
    }];
  });
}

function evidenceChangeTone(change: string) {
  if (/^\+/.test(change)) return "text-emerald-700";
  if (/^-/.test(change)) return "text-rose-700";
  return "text-slate-500";
}

function priorityBadgeClass(priority?: string) {
  if (/^high$/i.test(priority ?? "")) return "bg-rose-50 text-rose-700";
  if (/^medium$/i.test(priority ?? "")) return "bg-amber-50 text-amber-700";
  if (/^low$/i.test(priority ?? "")) return "bg-slate-100 text-slate-700";
  return "bg-amber-50 text-amber-700";
}

function ReportComposerList({
  title,
  items,
  emptyText,
  className = "",
  maxItems = 3
}: {
  title: string;
  items: Array<{
    id: string;
    title: string;
    summary: string;
    targetObjects?: string[];
    keyEvidence?: string;
    businessJudgment?: string;
    recommendedAction?: string;
    caveat?: string;
    details?: string;
  }>;
  emptyText: string;
  className?: string;
  maxItems?: number;
}) {
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      </div>
      {items.length ? (
        <div className="mt-3 space-y-3">
          {items.slice(0, maxItems).map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                {item.caveat ? <Badge variant="secondary" className={cn("text-[11px]", priorityBadgeClass(item.caveat))}>{item.caveat}</Badge> : null}
              </div>
              {item.targetObjects?.length ? (
                <p className="mt-2 text-xs font-medium text-slate-700">{item.targetObjects.join("、")}</p>
              ) : null}
              {item.summary ? <p className="mt-2 text-xs leading-5 text-slate-800">{item.summary}</p> : null}
              {item.keyEvidence ? (
                evidenceMetricCards(item.keyEvidence).length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {evidenceMetricCards(item.keyEvidence).map((metric) => (
                      <div key={metric.id} className="rounded-md border border-slate-100 bg-white p-2">
                        <p className="text-[11px] font-medium text-muted-foreground">{metric.label}</p>
                        <div className="mt-1 flex items-end justify-between gap-2">
                          <p className="text-sm font-semibold tabular-nums text-slate-950">{metric.current}</p>
                          <p className={cn("text-xs font-semibold tabular-nums", evidenceChangeTone(metric.change))}>{metric.change}</p>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">昨日 {metric.previous}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">证据：{item.keyEvidence}</p>
                )
              ) : null}
              {item.businessJudgment ? <p className="mt-2 text-xs leading-5 text-slate-700">业务判断：{item.businessJudgment}</p> : null}
              {item.recommendedAction ? <p className="mt-2 text-xs leading-5 text-emerald-800">建议动作：{item.recommendedAction}</p> : null}
              {item.details ? (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-slate-700">查看详情</summary>
                  <p className="mt-1 leading-5">{item.details}</p>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}

function WeeklyPeriodTile({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div className={cn(
      "min-w-0 overflow-hidden rounded-lg border px-3 py-2",
      tone === "accent" ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-slate-50"
    )}>
      <p className="truncate text-[10px] font-medium leading-4 text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-[clamp(10px,0.72vw,11px)] font-medium leading-4 text-slate-950">{value}</p>
    </div>
  );
}

type WeeklyDecisionItem = {
  id: string;
  title: string;
  badge: string;
  tone: "risk" | "watch" | "opportunity" | "action";
  objects: string[];
  summary: string;
  evidence: string[];
  recommendation: string;
  detail: string;
  priority?: "P1" | "P2" | "P3";
};

function compactSentence(value: string | undefined | null, fallback: string, maxLength = 110) {
  const text = reportDateText(value || fallback).replace(/\s+/g, " ").trim();
  const first = text.split(/[。.!?；;]/).find(Boolean)?.trim() ?? text;
  return first.length > maxLength ? `${first.slice(0, maxLength)}...` : first;
}

function businessOpportunityCopy(value: string | undefined | null, locale: Locale, fallback = "") {
  const text = reportDateText(value || fallback).replace(/\s+/g, " ").trim();
  if (!text || locale !== "zh") return text;

  return text
    .replace(/^qualityEvidence\s*:\s*/i, "评分证据：")
    .replace(/^scaleEvidence\s*:\s*/i, "规模证据：")
    .replace(/^count\s*:\s*/i, "候选数量：")
    .replace(/\bAverageRating\b/gi, "评分")
    .replace(/\baverageRating\b/g, "评分")
    .replace(/\brecords\b/gi, "样本量")
    .replace(/\bsample\s*count\b/gi, "样本量")
    .replace(/\bfield\s*name\b/gi, "字段")
    .replace(/\bmean\s*\/\s*median\s*ratio\b/gi, "平均值可能被少数高值拉高")
    .replace(/\bmean\s*median\s*ratio\b/gi, "平均值可能被少数高值拉高")
    .replace(/评分\s*(?:高于|>|>=)\s*P75/gi, "评分表现排在前 25%")
    .replace(/评分\s*(?:低于|<|<=)\s*P25/gi, "评分处于后 25%")
    .replace(/高于\s*P75/gi, "高于大多数对象")
    .replace(/低于\s*P25/gi, "低于大多数对象")
    .replace(/记录数量\s*(?:不高|较低|偏低)/g, "当前样本量还不大")
    .replace(/样本数量\s*(?:不高|较低|偏低)/g, "当前样本量还不大")
    .replace(/样本量\s*(?:不高|较低|偏低|低于或接近(?:中位数|median)|<=\s*(?:median|中位数))/gi, "当前样本量还不大")
    .replace(/规模\s*(?:不高|较低|偏低|低于或接近(?:中位数|median)|<=\s*(?:median|中位数))/gi, "当前规模还较小")
    .replace(/低于或接近\s*(?:median|中位数)/gi, "当前规模还较小")
    .replace(/<=\s*(?:median|中位数)/gi, "当前规模还较小")
    .replace(/\bpercentile\b/gi, "分位表现")
    .replace(/\bmedian\b/gi, "多数对象的一般水平")
    .replace(/P75/gi, "前 25%")
    .replace(/P25/gi, "后 25%");
}

function compactEvidence(item: ReportListItem, fallback: string) {
  const source = item.keyEvidence || item.details || item.summary || fallback;
  return source.split(/[；;\n]/).map((part) => part.replace(/^证据[:：]\s*/, "").trim()).filter(Boolean).slice(0, 3);
}

function normalizeDecisionKey(value: string) {
  return value.toLowerCase().replace(/[0-9.,%+\-\s]+/g, " ").replace(/[^a-z\u4e00-\u9fa5]+/g, " ").trim();
}

function rankOpportunities(items: ReportListItem[], locale: Locale): WeeklyDecisionItem[] {
  const isZh = locale === "zh";
  const seen = new Set<string>();
  return items.flatMap((item, index) => {
    const key = normalizeDecisionKey(`${item.title} ${item.targetObjects?.[0] ?? ""}`).slice(0, 48);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      id: `opportunity-${item.id || index}`,
      title: compactSentence(businessOpportunityCopy(item.title, locale), isZh ? `机会 ${index + 1}` : `Opportunity ${index + 1}`, 28),
      badge: index === 0 ? (isZh ? "高潜力" : "High potential") : (isZh ? "可验证" : "Testable"),
      tone: "opportunity" as const,
      objects: item.targetObjects ?? [],
      summary: compactSentence(businessOpportunityCopy(item.businessJudgment || item.summary, locale), businessOpportunityCopy(item.title, locale)),
      evidence: compactEvidence(item, item.title).map((evidence) => businessOpportunityCopy(evidence, locale)).slice(0, 2),
      recommendation: compactSentence(businessOpportunityCopy(item.recommendedAction, locale), isZh ? "做小范围验证，观察放量后核心指标是否保持。" : "Run a small validation test and monitor whether metrics hold after scale-up.", 120),
      detail: [item.keyEvidence, item.details].filter(Boolean).join("\n")
    }];
  }).slice(0, 4);
}

function rankActions(items: ReportListItem[], locale: Locale): WeeklyDecisionItem[] {
  const isZh = locale === "zh";
  const seen = new Set<string>();
  return items.flatMap((item, index) => {
    const actionText = item.recommendedAction || item.summary || item.title;
    const key = normalizeDecisionKey(actionText).slice(0, 64);
    if (seen.has(key)) return [];
    seen.add(key);
    const priority: "P1" | "P2" | "P3" = index === 0 ? "P1" : index === 1 ? "P2" : "P3";
    const actionTitle = priority === "P1"
      ? (isZh ? "拆解本周变化来源" : "Break down weekly movement drivers")
      : priority === "P2"
        ? (isZh ? "验证增长机会对象" : "Validate growth opportunity objects")
        : (isZh ? "检查质量与体验风险" : "Check quality and experience risks");
    return [{
      id: `action-${item.id || index}`,
      title: actionTitle,
      badge: priority,
      priority,
      tone: "action" as const,
      objects: item.targetObjects ?? [],
      summary: compactSentence(item.businessJudgment || item.keyEvidence, isZh ? "将当前发现转化为可验证任务。" : "Turn this finding into a verifiable task.", 110),
      evidence: compactEvidence(item, item.title).slice(0, 2),
      recommendation: compactSentence(actionText, isZh ? "明确负责对象、产出和复盘口径。" : "Define owner, output, and review criteria.", 120),
      detail: [item.keyEvidence, item.details, item.recommendedAction].filter(Boolean).join("\n")
    }];
  }).slice(0, 5);
}

function DecisionBadge({ item }: { item: WeeklyDecisionItem }) {
  const className = item.tone === "risk"
    ? "bg-orange-50 text-orange-700"
    : item.tone === "watch"
      ? "bg-amber-50 text-amber-700"
      : item.tone === "opportunity"
        ? "bg-emerald-50 text-emerald-700"
        : item.priority === "P1"
          ? "bg-blue-50 text-blue-700"
          : item.priority === "P2"
            ? "bg-orange-50 text-orange-700"
            : "bg-slate-100 text-slate-700";
  return <Badge variant="secondary" className={cn("rounded-md text-[11px]", className)}>{item.badge}</Badge>;
}

function EvidenceList({ evidence }: { evidence: string[] }) {
  if (!evidence.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
      {evidence.slice(0, 2).map((line, index) => (
        <li key={`${line}-${index}`} className="flex gap-2">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
          <span className="line-clamp-1">{line}</span>
        </li>
      ))}
    </ul>
  );
}

function SummaryStatCard({
  label,
  headline,
  description,
  tone
}: {
  label: string;
  headline: string;
  description: string;
  tone: "risk" | "opportunity" | "action";
}) {
  const toneClass = tone === "risk"
    ? "border-orange-100 bg-orange-50/60"
    : tone === "opportunity"
      ? "border-emerald-100 bg-emerald-50/60"
      : "border-blue-100 bg-blue-50/60";
  return (
    <div className={cn("rounded-2xl border p-4", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 line-clamp-1 text-sm font-semibold text-slate-950">{headline}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function InsightDecisionCard({ item }: { item: WeeklyDecisionItem }) {
  return (
    <article className={cn(
      "rounded-xl border bg-white p-3.5 transition hover:border-slate-300 hover:shadow-sm",
      item.tone === "risk" ? "border-l-4 border-l-orange-300" : item.tone === "opportunity" ? "border-l-4 border-l-emerald-300" : ""
    )}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="max-w-[460px] line-clamp-2 text-sm font-semibold leading-5 text-slate-950">{item.title}</h4>
        <DecisionBadge item={item} />
      </div>
      {item.objects.length ? <p className="mt-2 line-clamp-1 text-xs font-medium text-slate-600">{item.objects.join("、")}</p> : null}
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-700">{item.summary}</p>
      <EvidenceList evidence={item.evidence} />
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-emerald-800">{item.recommendation}</p>
      {item.detail ? (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium text-slate-700">查看详情</summary>
          <p className="mt-2 whitespace-pre-line leading-5">{item.detail}</p>
        </details>
      ) : null}
    </article>
  );
}

function ActionChecklist({ items, title, emptyText }: { items: WeeklyDecisionItem[]; title: string; emptyText: string }) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      </div>
      {items.length ? (
        <div className="mt-3 divide-y divide-slate-100">
          {items.map((item) => (
            <article key={item.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <h4 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950">{item.title}</h4>
                <DecisionBadge item={item} />
              </div>
              {item.objects.length ? <p className="mt-2 line-clamp-1 text-xs font-medium text-slate-600">{item.objects.join("、")}</p> : null}
              <p className="mt-2 text-xs font-semibold text-slate-500">为什么做</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-700">{item.summary}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">预期产出</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-emerald-800">{item.recommendation}</p>
              {item.detail ? (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-slate-700">查看详情</summary>
                  <p className="mt-2 whitespace-pre-line leading-5">{item.detail}</p>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">{emptyText}</p>
      )}
    </section>
  );
}

function WeeklyDecisionPanel({
  opportunities,
  actions,
  locale
}: {
  opportunities: ReportListItem[];
  actions: ReportListItem[];
  locale: Locale;
}) {
  const isZh = locale === "zh";
  const opportunityItems = rankOpportunities(opportunities, locale);
  const actionItems = rankActions(actions, locale);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <SummaryStatCard label={isZh ? "增长机会" : "Opportunities"} headline={opportunityItems[0]?.title ?? (isZh ? "暂无直接机会" : "No direct opportunity")} description={opportunityItems[0]?.evidence[0] ?? (isZh ? "当前没有可直接行动的增长机会。" : "No directly actionable opportunity yet.")} tone="opportunity" />
        <SummaryStatCard label={isZh ? "下周行动" : "Next actions"} headline={actionItems[0]?.title ?? (isZh ? "暂无行动项" : "No action item")} description={actionItems[0]?.summary ?? (isZh ? "暂无下周行动。" : "No next action yet.")} tone="action" />
      </div>
      <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
        <div className="space-y-4 xl:col-span-7">
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">{isZh ? "增长机会" : "Growth Opportunities"}</h3>
            </div>
            {opportunityItems.length ? <div className="grid gap-3 2xl:grid-cols-2">{opportunityItems.slice(0, 4).map((item) => <InsightDecisionCard key={item.id} item={item} />)}</div> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">{isZh ? "暂无增长机会。" : "No opportunities yet."}</p>}
          </section>
        </div>
        <div className="xl:col-span-5">
          <ActionChecklist items={actionItems.slice(0, 3)} title={isZh ? "下周行动" : "Next Week Actions"} emptyText={isZh ? "暂无下周行动。" : "No next actions yet."} />
        </div>
      </div>
    </div>
  );
}

function valueFromContent(content: Record<string, unknown>, key: string) {
  const value = content[key];
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function reportRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function DailyReportHeader({
  content,
  locale,
  briefItems = []
}: {
  content: Record<string, unknown>;
  locale: Locale;
  briefItems?: ReportListItem[];
}) {
  const isZh = locale === "zh";
  const latestDataDate = String(content.latestDataDate ?? "-");
  const dailyRows = valueFromContent(content, "dailySampleSize") ?? "-";
  const totalRows = valueFromContent(content, "totalRows") ?? "-";
  const validated = content.fullDataValidated === true;

  return (
    <Card className="border bg-white shadow-sm">
      <CardHeader className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-xl">{String(content.reportTitle ?? (isZh ? `${latestDataDate} 经营日报` : `${latestDataDate} Business Daily`))}</CardTitle>
            <CardDescription className="mt-2 text-sm leading-6">
              {isZh
                ? `数据最新日期：${latestDataDate}｜今日订单：${formatReportMetricValue(dailyRows)}｜总记录数：${formatReportMetricValue(totalRows)}｜${validated ? "完整数据已校验" : "完整数据待确认"}`
                : `Latest data date: ${latestDataDate} | Today's orders: ${formatReportMetricValue(dailyRows)} | Total rows: ${formatReportMetricValue(totalRows)} | ${validated ? "Full data validated" : "Full data pending"}`}
            </CardDescription>
          </div>
          {content.latestDateNotice ? (
            <Badge variant="secondary" className="w-fit">
              {String(content.latestDateNotice)}
            </Badge>
          ) : null}
        </div>
        {briefItems.length ? (
          <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
            <h3 className="text-sm font-semibold text-emerald-900">{isZh ? "核心摘要" : "Executive Summary"}</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-900">
              {briefItems.slice(0, 3).map((item) => (
                <li key={item.id} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-700" />
                  <span>{item.businessJudgment || item.summary || item.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardHeader>
    </Card>
  );
}

function DailyKpiBoard({
  items,
  locale,
  title,
  currentLabel,
  previousLabel,
  comparisonLabel
}: {
  items: ReportListItem[];
  locale: Locale;
  title?: string;
  currentLabel?: string;
  previousLabel?: string;
  comparisonLabel?: string;
}) {
  const isZh = locale === "zh";
  const currentText = currentLabel ?? (isZh ? "今日" : "Today");
  const previousText = previousLabel ?? (isZh ? "昨日" : "Yesterday");
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-950">{title ?? (isZh ? "KPI 看板" : "KPI Board")}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.slice(0, 8).map((item) => (
          <div
            key={item.id}
            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-sm"
          >
            <div className="absolute inset-x-0 top-0 h-0.5 bg-slate-900/5" />
            <div className="flex min-w-0 items-start justify-between gap-3">
              <p className="min-w-0 truncate text-[11px] font-semibold text-slate-600">{item.title}</p>
              <div className="shrink-0 text-right">
                <p className={cn("text-[12px] font-semibold tabular-nums leading-none", dailyKpiTone(item))}>{reportPercentText(item.percentChange)}</p>
                <p className="mt-1 text-[9px] font-medium text-muted-foreground">{dailyKpiChangeLabel(item, locale, comparisonLabel)}</p>
              </div>
            </div>
            <p className="mt-4 break-words text-[clamp(16px,1.55vw,20px)] font-semibold leading-none tracking-tight text-slate-950 tabular-nums">
              {weeklyKpiValueText(item.currentValue)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-lg bg-white/80 px-2 py-1">
                <p className="font-medium text-muted-foreground">{currentText}</p>
                <p className="mt-0.5 truncate font-semibold text-slate-800 tabular-nums">{weeklyKpiValueText(item.currentValue)}</p>
              </div>
              <div className="rounded-lg bg-white/80 px-2 py-1 text-right">
                <p className="font-medium text-muted-foreground">{previousText}</p>
                <p className="mt-0.5 truncate font-semibold text-slate-800 tabular-nums">{weeklyKpiValueText(item.previousValue)}</p>
              </div>
            </div>
            {item.caveat ? (
              item.caveat.length > 18 ? (
                <p className="mt-2 rounded-lg bg-amber-50/70 px-2 py-1.5 text-[10px] leading-4 text-amber-800">{item.caveat}</p>
              ) : (
                <Badge variant="secondary" className="mt-2 text-[10px]">{item.caveat}</Badge>
              )
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

type DimensionSortKey = "orders" | "netSales" | "ordersChange" | "netSalesChange" | "aovChange" | "returnRateChange" | "ratingChange";

function dimensionSortValue(row: DailyDimensionComparisonRow, key: DimensionSortKey) {
  if (key === "orders") return row.todayOrders;
  if (key === "netSales") return row.todayNetSales;
  if (key === "ordersChange") return row.ordersChange;
  if (key === "netSalesChange") return row.netSalesChange;
  if (key === "aovChange") return row.aovChange;
  if (key === "returnRateChange") return row.returnRateChange;
  return row.ratingChange;
}

function dimensionCellValue(value?: number | null, format: "number" | "money" | "percent" | "rating" | "days" = "number") {
  if (value == null || !Number.isFinite(value)) return "-";
  if (format === "percent") return reportPercentText(value);
  if (format === "rating") return value.toFixed(2);
  if (format === "days") return value.toFixed(2);
  return weeklyKpiValueText(value);
}

function dimensionChangeValue(value?: number | null) {
  return value == null || !Number.isFinite(value) ? "昨日无数据" : reportPercentText(value);
}

function dimensionRowIsGrowing(row: DailyDimensionComparisonRow) {
  if (typeof row.netSalesChange === "number" && Number.isFinite(row.netSalesChange)) return row.netSalesChange > 0;
  if (typeof row.ordersChange === "number" && Number.isFinite(row.ordersChange)) return row.ordersChange > 0;
  return false;
}

function tabLabelsForDimensionType(type: DailyDimensionComparisonTable["type"], isZh: boolean) {
  const labels: Record<DailyDimensionComparisonTable["type"], string> = {
    category: isZh ? "品类" : "Category",
    product: isZh ? "商品" : "Product",
    channel: isZh ? "渠道" : "Channel",
    market: isZh ? "市场" : "Market",
    segment: isZh ? "客户分层" : "Segment"
  };

  return labels[type];
}

function DailyDimensionComparisonPanel({
  tables,
  fallbackItems,
  locale,
  title,
  subtitle,
  currentLabel,
  previousLabel
}: {
  tables: DailyDimensionComparisonTable[];
  fallbackItems: ReportListItem[];
  locale: Locale;
  title?: string;
  subtitle?: string;
  currentLabel?: string;
  previousLabel?: string;
}) {
  const isZh = locale === "zh";
  const currentText = currentLabel ?? (isZh ? "今日" : "Today");
  const previousText = previousLabel ?? (isZh ? "昨日" : "Yesterday");
  const tabOrder: DailyDimensionComparisonTable["type"][] = ["category", "product", "channel", "market", "segment"];
  const [activeType, setActiveType] = useState<DailyDimensionComparisonTable["type"]>(tables[0]?.type ?? "category");
  const [sortKey, setSortKey] = useState<DimensionSortKey>("orders");
  const activeTable = tables.find((table) => table.type === activeType) ?? {
    id: `empty-${activeType}`,
    type: activeType,
    label: tabLabelsForDimensionType(activeType, isZh),
    rows: [],
    summaries: []
  };
  const sortedRows = [...(activeTable?.rows ?? [])]
    .sort((left, right) => Number(dimensionSortValue(right, sortKey) ?? -Infinity) - Number(dimensionSortValue(left, sortKey) ?? -Infinity))
    .slice(0, 5);
  const tabLabels: Record<DailyDimensionComparisonTable["type"], string> = {
    category: isZh ? "品类" : "Category",
    product: isZh ? "商品" : "Product",
    channel: isZh ? "渠道" : "Channel",
    market: isZh ? "市场" : "Market",
    segment: isZh ? "客户分层" : "Segment"
  };
  const sortOptions: Array<{ value: DimensionSortKey; label: string }> = [
    { value: "orders", label: isZh ? "按今日订单数" : "Today orders" },
    { value: "netSales", label: isZh ? "按今日净销售额" : "Today net sales" },
    { value: "ordersChange", label: isZh ? "按订单变化" : "Order change" },
    { value: "netSalesChange", label: isZh ? "按销售额变化" : "Sales change" },
    { value: "aovChange", label: isZh ? "按客单价变化" : "AOV change" },
    { value: "returnRateChange", label: isZh ? "按退货率变化" : "Return change" },
    { value: "ratingChange", label: isZh ? "按评分变化" : "Rating change" }
  ];

  if (!tables.length) {
    const visibleItems = fallbackItems.slice(0, 5);
    return (
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-950">{title ?? (isZh ? "二级指标对比" : "Dimension Comparison")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {subtitle ?? (isZh ? "按品类、商品、渠道、市场和客户分层拆解今日表现，并对比昨日变化。" : "Breaks down today's performance by category, product, channel, market, and segment, compared with yesterday.")}
          </p>
        </div>
        {visibleItems.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {visibleItems.map((item) => {
              const evidence = [item.keyEvidence, item.businessJudgment, item.recommendedAction].filter(Boolean) as string[];
              return (
                <article key={item.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <h4 className="text-sm font-semibold leading-5 text-slate-950">{item.title}</h4>
                  {item.targetObjects?.length ? <p className="mt-2 line-clamp-1 text-xs font-medium text-slate-600">{item.targetObjects.join("、")}</p> : null}
                  {item.summary ? <p className="mt-3 text-sm leading-6 text-slate-700">{item.summary}</p> : null}
                  <EvidenceList evidence={evidence} />
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">
            {isZh ? "当前报告暂无可展示的二级维度对比。" : "No dimension comparison is available for this report yet."}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{title ?? (isZh ? "二级指标对比" : "Dimension Comparison")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {subtitle ?? (isZh ? "按品类、商品、渠道、市场和客户分层拆解今日表现，并对比昨日变化。" : "Breaks down today's performance by category, product, channel, market, and segment, compared with yesterday.")}
          </p>
        </div>
        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as DimensionSortKey)}
          className="h-9 rounded-md border bg-white px-3 text-xs font-medium text-slate-700"
        >
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {tabOrder.map((type) => {
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveType(type)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition",
                activeTable?.type === type ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {tabLabels[type]}
            </button>
          );
        })}
      </div>
      {activeTable ? (
        <>
          <div className="mt-4 grid gap-3">
            {sortedRows.length ? sortedRows.map((row) => {
              const tiles = [
                activeTable.type === "segment"
                  ? { label: isZh ? `${currentText}客户` : `${currentText} Customers`, value: dimensionCellValue(row.todayCustomers), change: dimensionChangeValue(row.customersChange), tone: weeklyKpiTone(row.customersChange) }
                  : null,
                { label: isZh ? `${currentText}订单` : `${currentText} Orders`, value: dimensionCellValue(row.todayOrders), change: dimensionChangeValue(row.ordersChange), tone: weeklyKpiTone(row.ordersChange) },
                { label: isZh ? `${currentText}净销售额` : `${currentText} Net Sales`, value: dimensionCellValue(row.todayNetSales, "money"), change: dimensionChangeValue(row.netSalesChange), tone: weeklyKpiTone(row.netSalesChange) },
                { label: isZh ? `${currentText}客单价` : `${currentText} AOV`, value: dimensionCellValue(row.todayAov), change: dimensionChangeValue(row.aovChange), tone: weeklyKpiTone(row.aovChange) },
                { label: isZh ? `${currentText}平均评分` : `${currentText} Rating`, value: dimensionCellValue(row.todayRating, "rating"), change: dimensionChangeValue(row.ratingChange), tone: weeklyKpiTone(row.ratingChange) }
              ].filter(Boolean) as Array<{ label: string; value: string; change: string; tone: string }>;

              return (
                <article
                  key={row.id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    dimensionRowIsGrowing(row) ? "border-emerald-100 bg-emerald-50/70" : "border-slate-100 bg-slate-50/60"
                  )}
                >
                  <div className="grid gap-3 2xl:grid-cols-[220px_minmax(0,1fr)_minmax(260px,0.7fr)] 2xl:items-start">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">
                        {activeTable.type === "product" ? (isZh ? "商品 / SKU" : "Product / SKU") : activeTable.label}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <h4 className="break-words text-sm font-semibold text-slate-950">{row.name}</h4>
                        {row.sampleSmall ? <Badge variant="secondary" className="text-[11px]">{isZh ? "样本较少" : "Small sample"}</Badge> : null}
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                      {tiles.map((tile) => (
                        <div key={tile.label} className="min-w-0 rounded-md border border-white/70 bg-white/80 px-3 py-2">
                          <p className="break-words text-[clamp(11px,1vw,12px)] font-medium leading-4 text-muted-foreground">{tile.label}</p>
                          <div className="mt-1 flex min-w-0 flex-wrap items-end justify-between gap-x-2 gap-y-1">
                            <span className="break-words text-[clamp(14px,1.5vw,18px)] font-semibold leading-6 tabular-nums text-slate-950">{tile.value}</span>
                            <span className={cn("break-words text-[clamp(11px,1.1vw,13px)] font-semibold leading-5 tabular-nums", tile.tone)}>{tile.change}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-md bg-white/70 px-3 py-2 text-xs leading-5 text-slate-700">
                      <p className="font-medium text-slate-950">{isZh ? "业务判断" : "Judgment"}</p>
                      <p className="mt-1">{row.businessJudgment}</p>
                    </div>
                  </div>

                  <details className="mt-3 rounded-md border border-white/70 bg-white/70 px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none font-medium text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                      {isZh ? `查看${previousText}值与更多口径` : `View ${previousText} values and details`}
                    </summary>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {activeTable.type === "segment" ? <span>{isZh ? `${previousText}客户数` : `${previousText} customers`}：{dimensionCellValue(row.yesterdayCustomers)}（{dimensionChangeValue(row.customersChange)}）</span> : null}
                      <span>{isZh ? `${previousText}订单` : `${previousText} orders`}：{dimensionCellValue(row.yesterdayOrders)}</span>
                      <span>{isZh ? `${previousText}净销售额` : `${previousText} net sales`}：{dimensionCellValue(row.yesterdayNetSales, "money")}</span>
                      <span>{isZh ? `${previousText}客单价` : `${previousText} AOV`}：{dimensionCellValue(row.yesterdayAov)}</span>
                      <span>{isZh ? "退货率" : "Return rate"}：{dimensionCellValue(row.todayReturnRate, "percent")} / {dimensionCellValue(row.yesterdayReturnRate, "percent")}（{dimensionChangeValue(row.returnRateChange)}）</span>
                      <span>{isZh ? "评分变化" : "Rating change"}：{dimensionCellValue(row.yesterdayRating, "rating")} → {dimensionCellValue(row.todayRating, "rating")}（{dimensionChangeValue(row.ratingChange)}）</span>
                      {activeTable.type === "market" ? <span>{isZh ? "履约天数" : "Fulfillment days"}：{dimensionCellValue(row.yesterdayFulfillmentDays, "days")} → {dimensionCellValue(row.todayFulfillmentDays, "days")}（{dimensionChangeValue(row.fulfillmentDaysChange)}）</span> : null}
                    </div>
                  </details>
                </article>
              );
            }) : (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">
                {isZh ? `当前暂无${tabLabels[activeTable.type]}维度的对比数据。` : `No ${tabLabels[activeTable.type]} comparison data is available yet.`}
              </p>
            )}
          </div>
          {activeTable.summaries.length ? (
            <ul className="mt-4 space-y-2 border-t pt-3 text-sm leading-6 text-slate-700">
              {activeTable.summaries.map((summary, index) => (
                <li key={`${summary}-${index}`} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                  <span>{summary}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">
          {isZh ? "当前报告暂无可展示的二级维度对比。" : "No dimension comparison is available for this report yet."}
        </p>
      )}
    </section>
  );
}

function DailyFindings({ items, locale }: { items: ReportListItem[]; locale: Locale }) {
  const isZh = locale === "zh";
  return (
    <ReportComposerList
      title={isZh ? "关键发现" : "Key Findings"}
      items={items.slice(0, 5)}
      emptyText={isZh ? "暂无足够证据生成关键发现。" : "No key findings with enough evidence yet."}
      maxItems={5}
    />
  );
}

function DailyDataNotes({ items, locale }: { items: ReportListItem[]; locale: Locale }) {
  const isZh = locale === "zh";
  return (
    <details className="rounded-xl border bg-white p-4 text-sm shadow-sm">
      <summary className="cursor-pointer font-semibold text-slate-950">{isZh ? "数据口径提醒" : "Data Notes"}</summary>
      <div className="mt-3">
        <ReportComposerList title="" items={items.slice(0, 3)} emptyText={isZh ? "暂无数据口径提醒。" : "No data notes."} maxItems={3} className="border-0 bg-transparent p-0 shadow-none" />
      </div>
    </details>
  );
}

function DailyValidationFailedView({ content, locale }: { content: Record<string, unknown>; locale: Locale }) {
  const isZh = locale === "zh";
  const audit = reportRecord(content.reportDataAudit);
  const guardrail = reportRecord(audit.fullDataGuardrail);
  const rowsUsed = audit.rowsUsedForMetrics ?? guardrail.rowsUsedForMetrics ?? guardrail.rowsUsed ?? audit.totalRows ?? "-";
  const expectedRows = audit.expectedFullRows ?? "-";
  const issues = reportListItems(content.dataCaveats ?? content.keyChanges, "Validation");

  return (
    <div className="space-y-3">
      <Card className="border border-rose-100 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>{isZh ? "当前未通过完整数据校验" : "Full Data Validation Failed"}</CardTitle>
          <CardDescription>
            {isZh
              ? `当前数据来源：${String(audit.analysisSource ?? "-")}｜使用行数：${String(rowsUsed)}｜预期完整行数：${String(expectedRows)}｜最新业务日期：${String(audit.latestDataDate ?? "无法确认")}`
              : `Source: ${String(audit.analysisSource ?? "-")} | Rows used: ${String(rowsUsed)} | Expected rows: ${String(expectedRows)} | Latest business date: ${String(audit.latestDataDate ?? "unknown")}`}
          </CardDescription>
        </CardHeader>
      </Card>
      <ReportComposerList title={isZh ? "失败原因与修复动作" : "Failure Reasons and Fixes"} items={issues} emptyText={isZh ? "暂无失败原因。" : "No failure reason available."} maxItems={6} />
    </div>
  );
}

function DailyBusinessReportView({ content, locale }: { content: Record<string, unknown>; locale: Locale }) {
  const briefItems = reportListItems(content.aiBrief, "Brief").slice(0, 3);
  const kpis = reportListItems(content.dailyKpis, "KPI", 8);
  const dimensionComparisons = [
    ...reportListItems(content.categoryPerformance, "Category"),
    ...reportListItems(content.productPerformance, "Product"),
    ...reportListItems(content.channelPerformance, "Channel"),
    ...reportListItems(content.marketPerformance, "Market"),
    ...reportListItems(content.segmentPerformance, "Segment")
  ];
  const dimensionComparisonTables = reportDimensionComparisons(content.dimensionComparisons);
  const findings = [
    ...reportListItems(content.keyChanges, "Finding"),
    ...reportListItems(content.categoryPerformance, "Category"),
    ...reportListItems(content.productPerformance, "Product"),
    ...reportListItems(content.channelPerformance, "Channel"),
    ...reportListItems(content.marketPerformance, "Market"),
    ...reportListItems(content.segmentPerformance, "Segment")
  ];

  return (
    <div className="space-y-3">
      <DailyReportHeader content={content} locale={locale} briefItems={briefItems} />
      <DailyKpiBoard items={kpis} locale={locale} />
      <DailyDimensionComparisonPanel tables={dimensionComparisonTables} fallbackItems={dimensionComparisons} locale={locale} />
      <DailyFindings items={findings} locale={locale} />
      <DailyDataNotes items={reportListItems(content.dataCaveats, "Caveat")} locale={locale} />
    </div>
  );
}

function ReportModeSummaryPanel({
  mode,
  content,
  locale
}: {
  mode: "daily_brief" | "weekly_report" | "custom_report" | "snapshot_report";
  content: Record<string, unknown> | null | undefined;
  locale: Locale;
}) {
  const isZh = locale === "zh";
  const effectiveMode = content?.reportMode === "snapshot_report" || content?.reportTimeMode === "snapshot_report"
    ? "snapshot_report"
    : mode;
  if (!content) {
    return (
      <Card className="border bg-white shadow-sm">
        <CardContent className="p-5 text-sm text-muted-foreground">
          {isZh ? "暂无该类型报告。生成后会显示在这里。" : "No report of this type yet. Generate one to view it here."}
        </CardContent>
      </Card>
    );
  }

  if (effectiveMode === "weekly_report") {
    const weeklyKpiItems = reportListItems(content.weeklyKpis ?? content.weeklyKpiChanges, "KPI");
    const keyFindingItems = reportListItems(content.keyFindings ?? content.weeklyKpiChanges, "Finding");
    const dimensionComparisonTables = reportDimensionComparisons(content.weeklyDimensionComparisons ?? content.dimensionComparisons);
    const opportunityItems = reportListItems(content.growthOpportunities, "Opportunity");
    const actionItems = reportListItems(content.nextWeekActions, "Action");
    const currentPeriod = `${String(content.currentPeriodStart ?? content.weekStart ?? "-")} 至 ${String(content.currentPeriodEnd ?? content.weekEnd ?? "-")}`;
    const previousPeriod = `${String(content.previousPeriodStart ?? content.comparisonWeekStart ?? "-")} 至 ${String(content.previousPeriodEnd ?? content.comparisonWeekEnd ?? "-")}`;
    const currentComplete = content.currentPeriodComplete === true;
    const currentOrders = weeklyKpiItems.find((item) => item.metricKind === "orders")?.currentValue;
    return (
      <div className="space-y-3">
        <Card className="border bg-white shadow-sm">
          <CardHeader className="p-4">
            <div className="grid min-w-0 gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="min-w-0 break-words text-base leading-6">
                    {String(content.reportTitle ?? (isZh ? `${currentPeriod} 电商经营周报` : `${currentPeriod} Ecommerce Weekly Report`))}
                  </CardTitle>
                  <Badge variant="secondary" className={currentComplete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>
                    {currentComplete ? (isZh ? "当前周期完整" : "Complete period") : (isZh ? "当前周期不足 7 天" : "Partial period")}
                  </Badge>
                </div>
                <CardDescription className="mt-2 max-w-5xl text-sm leading-6">
                  {isZh
                    ? `数据最新日期：${String(content.latestDataDate ?? "-")}｜当前周期：${currentPeriod}｜对比周期：${previousPeriod}｜当前周期订单数：${weeklyKpiValueText(currentOrders)}｜总记录数：${weeklyKpiValueText(content.totalRows as number | string | null)}｜${content.fullDataValidated ? "完整数据已校验" : "完整数据未校验"}`
                    : `Latest data date: ${String(content.latestDataDate ?? "-")} | Current period: ${currentPeriod} | Comparison period: ${previousPeriod} | Current-period orders: ${weeklyKpiValueText(currentOrders)} | Total rows: ${weeklyKpiValueText(content.totalRows as number | string | null)} | ${content.fullDataValidated ? "full data validated" : "full data not validated"}`}
                </CardDescription>
              </div>
              <div className="grid min-w-0 gap-2 sm:grid-cols-3">
                <WeeklyPeriodTile label={isZh ? "最近 7 天" : "Latest 7 days"} value={currentPeriod} tone="accent" />
                <WeeklyPeriodTile label={isZh ? "前 7 天" : "Previous 7 days"} value={previousPeriod} />
                <WeeklyPeriodTile label={isZh ? "数据最新日期" : "Latest data date"} value={String(content.latestDataDate ?? "-")} />
              </div>
            </div>
          </CardHeader>
        </Card>
        {content.weeklyKpiSummary ? (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 shadow-sm">
            <p className="mb-1 text-xs font-semibold text-emerald-800">{isZh ? "核心摘要" : "Executive Summary"}</p>
            <p className="text-sm leading-6 text-slate-800">
              {String(content.weeklyKpiSummary)}
            </p>
          </div>
        ) : null}
        <DailyKpiBoard
          items={weeklyKpiItems}
          locale={locale}
          title={isZh ? "KPI 看板" : "KPI Board"}
          currentLabel={isZh ? "最近 7 天" : "Latest 7 days"}
          previousLabel={isZh ? "前 7 天" : "Previous 7 days"}
          comparisonLabel={isZh ? "较前 7 天" : "vs previous 7 days"}
        />
        <DailyDimensionComparisonPanel
          tables={dimensionComparisonTables}
          fallbackItems={[]}
          locale={locale}
          title={isZh ? "二级指标对比" : "Dimension Comparison"}
          subtitle={isZh ? "按品类、商品、渠道、市场和客户分层拆解最近 7 天表现，并对比前 7 天变化。" : "Breaks down the latest 7 days by category, product, channel, market, and segment, compared with the previous 7 days."}
          currentLabel={isZh ? "最近 7 天" : "Latest 7 days"}
          previousLabel={isZh ? "前 7 天" : "Previous 7 days"}
        />
        <ReportComposerList
          title={isZh ? "关键发现" : "Key Findings"}
          items={keyFindingItems}
          emptyText={isZh ? "暂无足够证据生成周报关键发现。" : "No weekly key findings with enough evidence yet."}
          maxItems={5}
        />
        <WeeklyDecisionPanel opportunities={opportunityItems} actions={actionItems} locale={locale} />
        <DailyDataNotes items={reportListItems(content.dataCaveats, "Caveat")} locale={locale} />
      </div>
    );
  }

  if (effectiveMode === "custom_report" && Array.isArray(content.monthlyKpis)) {
    const monthlyKpiItems = reportListItems(content.monthlyKpis, "KPI");
    const dimensionComparisonTables = reportDimensionComparisons(content.monthlyDimensionComparisons);
    const keyFindingItems = reportListItems(content.keyFindings, "Finding");
    const dailyAverageItems = reportListItems(content.monthlyDailyAverages, "DailyAverage");
    const trendItems = reportListItems(content.monthlyTrends, "Trend");
    const driverItems = reportListItems(content.changeDrivers, "Driver");
    const moverItems = reportListItems(content.topMovers, "Mover");
    const riskItems = reportListItems(content.monthlyRisks, "Risk");
    const opportunityItems = reportListItems(content.monthlyOpportunities, "Opportunity");
    const actionItems = reportListItems(content.nextMonthActions, "Action");
    const currentPeriod = `${String(content.currentMonthStart ?? "-")} 至 ${String(content.currentMonthEnd ?? "-")}`;
    const previousPeriod = `${String(content.comparisonMonthStart ?? "-")} 至 ${String(content.comparisonMonthEnd ?? "-")}`;
    const isComplete = content.currentMonthComplete === true;
    const currentOrders = monthlyKpiItems.find((item) => item.metricKind === "orders")?.currentValue;

    return (
      <div className="space-y-3">
        <Card className="border bg-white shadow-sm">
          <CardHeader className="p-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{String(content.reportTitle ?? (isZh ? "月经营分析" : "Monthly Business Review"))}</CardTitle>
                  <Badge variant="secondary" className={isComplete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>
                    {isComplete ? (isZh ? "当前月份完整" : "Complete month") : (isZh ? "本月尚未结束" : "Month to date")}
                  </Badge>
                </div>
                <CardDescription className="mt-2 max-w-5xl text-sm leading-6">
                  {isZh
                    ? "按月汇总经营表现，分析收入、订单、客户、品类、渠道、市场和客户分层变化，辅助制定下月经营策略。"
                    : "Monthly operating review across revenue, orders, customers, category, channel, market, and segment changes."}
                </CardDescription>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
                  <label className="space-y-1 text-xs font-semibold text-slate-600">
                    <span>{isZh ? "选择月份" : "Select month"}</span>
                    <input
                      type="month"
                      readOnly
                      value={String(content.selectedMonth ?? "")}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-slate-600">
                    <span>{isZh ? "对比方式" : "Comparison type"}</span>
                    <select
                      value="previous_month"
                      disabled
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 disabled:opacity-100"
                    >
                      <option value="previous_month">{isZh ? "环比上月" : "Previous month"}</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="grid gap-2">
                <WeeklyPeriodTile label={isZh ? "数据最新日期" : "Latest data date"} value={String(content.latestDataDate ?? "-")} />
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              <WeeklyPeriodTile label={isZh ? "本月周期" : "Current month"} value={currentPeriod} tone="accent" />
              <WeeklyPeriodTile label={isZh ? "对比周期" : "Comparison month"} value={previousPeriod} />
              <WeeklyPeriodTile label={isZh ? "本月订单数" : "Current orders"} value={weeklyKpiValueText(currentOrders)} />
              <WeeklyPeriodTile label={isZh ? "完整数据" : "Full data"} value={content.fullDataValidated ? (isZh ? "已校验" : "Validated") : (isZh ? "未校验" : "Not validated")} />
            </div>
          </CardHeader>
        </Card>
        {!isComplete ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-sm leading-6 text-amber-900">
            {isZh
              ? "当前月份尚未结束，本报告展示的是月内累计表现。与完整上月对比时，建议同时查看日均指标，避免直接用累计值误判。"
              : "The current month is not complete. This report shows month-to-date performance; compare daily averages when reading against a complete prior month."}
          </div>
        ) : null}
        <ReportComposerList
          title={isZh ? "核心摘要" : "Executive Summary"}
          items={keyFindingItems}
          emptyText={isZh ? "暂无月度核心摘要。" : "No monthly summary yet."}
          maxItems={3}
        />
        <DailyKpiBoard
          items={monthlyKpiItems}
          locale={locale}
          title={isZh ? "KPI 看板" : "KPI Board"}
          currentLabel={isZh ? "本月累计" : "This month"}
          previousLabel={isZh ? "上月同期" : "Prior-month same days"}
          comparisonLabel={isZh ? "较上月同期" : "vs prior-month same days"}
        />
        {!isComplete ? (
          <ReportComposerList
            title={isZh ? "日均节奏" : "Average Daily Pace"}
            items={dailyAverageItems}
            emptyText={isZh ? "暂无可计算的日均指标。" : "No daily-average metrics available yet."}
            maxItems={4}
          />
        ) : null}
        <ReportComposerList
          title={isZh ? "月内趋势" : "Monthly Trend"}
          items={trendItems}
          emptyText={isZh ? "当前月份可用趋势点不足。" : "Not enough monthly trend points yet."}
          maxItems={5}
        />
        <ReportComposerList
          title={isZh ? "月度变化来源" : "Monthly Change Drivers"}
          items={driverItems}
          emptyText={isZh ? "暂无足够证据拆解月度变化来源。" : "No monthly driver evidence yet."}
          maxItems={6}
        />
        <DailyDimensionComparisonPanel
          tables={dimensionComparisonTables}
          fallbackItems={[]}
          locale={locale}
          title={isZh ? "二级指标拆解" : "Dimension Breakdown"}
          subtitle={isZh ? "按品类、商品、渠道、市场和客户分层拆解本月表现，并对比上月同期变化。" : "Breaks down this month by category, product, channel, market, and segment, compared with prior-month same days."}
          currentLabel={isZh ? "本月" : "This month"}
          previousLabel={isZh ? "上月同期" : "Prior-month same days"}
        />
        <ReportComposerList
          title={isZh ? "Top 拉动 / Top 拖累" : "Top Pulls / Drags"}
          items={moverItems}
          emptyText={isZh ? "暂无可比较的拉动或拖累对象。" : "No comparable pull or drag objects yet."}
          maxItems={6}
        />
        <div className="grid gap-3 xl:grid-cols-2">
          <ReportComposerList
            title={isZh ? "月度风险" : "Monthly Risks"}
            items={riskItems}
            emptyText={isZh ? "暂无趋势性月度风险。" : "No monthly trend risks yet."}
            maxItems={5}
          />
          <ReportComposerList
            title={isZh ? "月度增长机会" : "Monthly Growth Opportunities"}
            items={opportunityItems}
            emptyText={isZh ? "暂无下月可执行增长机会。" : "No actionable next-month opportunities yet."}
            maxItems={5}
          />
        </div>
        <ReportComposerList
          title={isZh ? "下月行动计划" : "Next Month Action Plan"}
          items={actionItems}
          emptyText={isZh ? "暂无下月行动计划。" : "No next-month action plan yet."}
          maxItems={5}
        />
        <DailyDataNotes items={reportListItems(content.dataCaveats, "Caveat")} locale={locale} />
      </div>
    );
  }

  if (mode === "daily_brief" && content.validationStatus === "failed") {
    return <DailyValidationFailedView content={content} locale={locale} />;
  }

  if (mode === "daily_brief" && (Array.isArray(content.aiBrief) || Array.isArray(content.dailyKpis))) {
    return <DailyBusinessReportView content={content} locale={locale} />;
  }

  return (
    <div className="space-y-3">
      <Card className="border bg-white shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{effectiveMode === "snapshot_report" ? (isZh ? "当前数据快照" : "Snapshot Report") : (isZh ? "今日 / 最新概览" : "Today / Latest Overview")}</CardTitle>
            {content.latestDataDate ? <Badge variant="secondary">{String(content.latestDataDate)}</Badge> : null}
          </div>
          <CardDescription>{String(content.todayOverview ?? content.overview ?? "")}</CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        <ReportComposerList title={effectiveMode === "snapshot_report" ? (isZh ? "关键发现" : "Key Findings") : (isZh ? "关键变化" : "Key Changes")} items={reportListItems(content.keyChanges ?? content.keyFindings, "Change")} emptyText={effectiveMode === "snapshot_report" ? (isZh ? "当前没有足够证据生成高置信发现。" : "There is not enough evidence for high-confidence findings.") : (isZh ? "当前没有足够证据生成关键变化。" : "No key changes with enough evidence yet.")} />
        <ReportComposerList title={effectiveMode === "snapshot_report" ? (isZh ? "当前风险" : "Current Risks") : (isZh ? "今日风险" : "Risks")} items={reportListItems(content.risks, "Risk")} emptyText={isZh ? "当前没有足够证据生成高置信风险。" : "There is not enough evidence for high-confidence risks."} />
        <ReportComposerList title={effectiveMode === "snapshot_report" ? (isZh ? "当前机会" : "Current Opportunities") : (isZh ? "今日机会" : "Opportunities")} items={reportListItems(content.opportunities, "Opportunity")} emptyText={isZh ? "当前没有可直接行动的增长机会。" : "There are no directly actionable growth opportunities yet."} />
        <ReportComposerList title={effectiveMode === "snapshot_report" ? (isZh ? "建议行动" : "Recommended Actions") : (isZh ? "今日优先行动" : "Priority Actions")} items={reportListItems(content.priorityActions, "Action")} emptyText={isZh ? "补充时间字段后，可生成日报、周报和趋势变化。" : "Add a time field to generate daily, weekly, and trend changes."} />
      </div>
      <ReportComposerList title={isZh ? "数据提醒" : "Data Caveats"} items={reportListItems(content.dataCaveats, "Caveat")} emptyText={isZh ? "暂无数据提醒。" : "No data caveats yet."} />
    </div>
  );
}

function ReportHistoryPanel({
  history,
  locale
}: {
  history: Array<{
    id: string;
    reportMode: string;
    reportTimeMode: string;
    title: string;
    status: string;
    generatedAt: string;
    summaryJson?: Record<string, unknown> | null;
  }>;
  locale: Locale;
}) {
  const isZh = locale === "zh";
  if (!history.length) {
    return (
      <Card className="border bg-white shadow-sm">
        <CardContent className="p-5 text-sm text-muted-foreground">
          {isZh ? "暂无历史报告。" : "No report history yet."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {history.map((item) => (
        <div key={item.id} className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <Badge variant="secondary">{item.status}</Badge>
              <Badge variant="secondary">{item.reportTimeMode}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{formatReportDate(item.generatedAt)}</p>
            {item.summaryJson?.summary ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{String(item.summaryJson.summary)}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">{isZh ? "查看" : "View"}</Button>
            <Button variant="outline" size="sm">{isZh ? "导出" : "Export"}</Button>
            <Button variant="outline" size="sm">{isZh ? "删除" : "Delete"}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportsPage({
  copy,
  locale,
  hasConnectedDatabase,
  isLoadingConnectedSources
}: {
  copy: DashboardCopy;
  locale: Locale;
  hasConnectedDatabase: boolean;
  isLoadingConnectedSources: boolean;
}) {
  type ReportData = {
    requestedLocale?: Locale;
    reportLocale?: Locale | null;
    usedLocaleFallback?: boolean;
    reportEntitlement?: ReportEntitlementViewData;
    briefing?: {
      title: string;
      summary: string;
      confidence?: number | null;
      createdAt?: string;
      payloadJson?: {
        generatedAt?: string;
        dataSourceName?: string;
        metricResults?: ReportMetricEvidenceResult[];
        timeConfig?: ReportTimeConfigViewData;
        trendMetrics?: ReportTrendMetricViewData[];
        trendCharts?: ReportTrendChartViewData[];
        structuredReport?: StructuredReportViewData;
        composedReports?: Record<string, Record<string, unknown>>;
      } | null;
    } | null;
    reportHistory?: Array<{
      id: string;
      reportMode: string;
      reportTimeMode: string;
      title: string;
      status: string;
      generatedAt: string;
      summaryJson?: Record<string, unknown> | null;
    }>;
  };
  const setupStateStorageKey = "monarca-report-setup-state-v1";
  const [cachedSetupState, setCachedSetupState] = useState(() => {
    if (typeof window === "undefined") {
      return { hasConnectedData: false, hasReport: false };
    }

    const cached = window.localStorage.getItem(setupStateStorageKey);
    if (!cached) {
      return { hasConnectedData: false, hasReport: false };
    }

    try {
      const parsed = JSON.parse(cached) as Partial<{ hasConnectedData: boolean; hasReport: boolean }>;
      return {
        hasConnectedData: parsed.hasConnectedData === true,
        hasReport: parsed.hasReport === true
      };
    } catch {
      return { hasConnectedData: false, hasReport: false };
    }
  });
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportGenerationMessage, setReportGenerationMessage] = useState<string | null>(null);
  const [isDemoBannerDismissed, setIsDemoBannerDismissed] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(() => reportsPageDataCache as ReportData | null);
  const [reportDataByMode, setReportDataByMode] = useState<Partial<Record<ReportModeView, ReportData>>>(() =>
    reportsPageDataCache ? { custom_report: reportsPageDataCache as ReportData } : {}
  );
  const [isLoadingReport, setIsLoadingReport] = useState(() => !reportsPageDataCache);
  const [activeReportMode, setActiveReportMode] = useState<ReportModeView>("daily_brief");
  const isReportsZh = copy.reports.pageTitle === "分析报告";
  const activeReportData = activeReportMode === "history"
    ? (reportDataByMode.history ?? reportDataByMode.custom_report ?? reportData)
    : (reportDataByMode[activeReportMode] ?? (activeReportMode === "custom_report" ? reportData : null));

  const loadReportData = useCallback(async (mode: ReportModeView = activeReportMode) => {
    setIsLoadingReport(true);

    try {
      const modeDateRange = mode === "history" ? reportModeDefaultDateRange("custom_report") : reportModeDefaultDateRange(mode);
      const response = await fetch(`/api/dashboard/reports?${reportDateRangeQuery(modeDateRange)}&reportMode=${mode}`, {
        cache: "no-store"
      });
      const payload = await response.json().catch(() => null) as ReportData | null;

      if (response.ok) {
        setReportDataByMode((current) => ({ ...current, [mode]: payload ?? undefined }));
        if (mode === "custom_report") {
          reportsPageDataCache = payload;
          setReportData(payload);
        } else if (payload?.reportEntitlement) {
          setReportData((current) => current ?? payload);
        }
      }
      return payload;
    } finally {
      setIsLoadingReport(false);
    }
  }, [activeReportMode]);

  useEffect(() => {
    void loadReportData(activeReportMode);
  }, [activeReportMode, loadReportData]);

  const generateReport = useCallback(async (reportMode: Exclude<ReportModeView, "history"> = "custom_report") => {
    setIsGeneratingReport(true);
    setReportGenerationMessage(null);
    const modeDateRange = reportModeDefaultDateRange(reportMode);

    try {
      const response = await fetch("/api/dashboard/reports/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          locale,
          reportMode,
          dateRange: modeDateRange,
          userRequested: true,
          idempotencyKey: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
        })
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        async?: boolean;
        jobId?: string;
        code?: string;
        computedMetricCount?: number;
        generatedAt?: string;
        message?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(reportGenerationErrorMessage(payload, locale));
      }

      if (payload.async) {
        setReportGenerationMessage(
          isReportsZh ? "报告正在后台生成，完成后会自动刷新。" : "Report is generating in the background and will refresh when complete."
        );

        for (let attempt = 0; attempt < 30; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const latest = await loadReportData(reportMode);
          const generatedAt = latest?.briefing?.payloadJson?.generatedAt ?? latest?.briefing?.createdAt;
          const hasMetrics = latest?.briefing?.payloadJson?.metricResults?.some((result) => result.status === "computed");

          if (generatedAt && hasMetrics) {
            setReportGenerationMessage(
              isReportsZh
                ? `报告已更新 · 上次更新时间：${formatReportDate(generatedAt)}`
                : `Report updated · Last updated: ${formatReportDate(generatedAt)}`
            );
            window.dispatchEvent(new Event("monarca-report-updated"));
            return;
          }
        }

        setReportGenerationMessage(
          isReportsZh ? "报告仍在后台生成，请稍后刷新查看。" : "Report is still generating. Refresh later to view it."
        );
        return;
      }

      setReportGenerationMessage(
        isReportsZh
          ? `已计算 ${payload.computedMetricCount ?? 0} 个指标，报告已更新 · 上次更新时间：${formatReportDate(payload.generatedAt)}`
          : `Computed ${payload.computedMetricCount ?? 0} metrics. Report updated · Last updated: ${formatReportDate(payload.generatedAt)}`
      );
      await loadReportData(reportMode);
      window.dispatchEvent(new Event("monarca-report-updated"));
    } catch (error) {
      const fallback = isReportsZh ? "报告生成失败" : "Failed to generate report";
      setReportGenerationMessage(error instanceof Error ? localeSafeText(error.message, fallback, locale) : fallback);
    } finally {
      setIsGeneratingReport(false);
    }
  }, [isReportsZh, loadReportData, locale]);

  const lastReportUpdatedAt =
    activeReportData?.briefing?.payloadJson?.generatedAt ?? activeReportData?.briefing?.createdAt ?? reportData?.briefing?.payloadJson?.generatedAt ?? reportData?.briefing?.createdAt;
  const reportEntitlement = activeReportData?.reportEntitlement ?? reportData?.reportEntitlement;
  const reportEntitlementText = reportEntitlementMessage(reportEntitlement, locale);
  const briefing = activeReportData?.briefing ?? null;
  const reportMetricResults = briefing?.payloadJson?.metricResults ?? [];
  const composedReports = briefing?.payloadJson?.composedReports ?? {};
  const dailyBriefReport = composedReports.daily_brief ?? null;
  const weeklyReport = composedReports.weekly_report ?? null;
  const reportHistory = activeReportData?.reportHistory ?? reportData?.reportHistory ?? [];
  const hasReportMetrics = reportMetricResults.some((result) => result.status === "computed");
  const hasReportContent = Boolean(briefing) || hasReportMetrics;
  const hasAnyReportContent = Boolean(reportData?.briefing) ||
    Object.values(reportDataByMode).some((data) => Boolean(data?.briefing));
  const isWaitingForActiveModeData = !hasReportContent && (isLoadingReport || hasAnyReportContent);
  const isLoadingReportsWorkspaceState = isLoadingReport || isLoadingConnectedSources;
  const showDemoReport = !hasReportMetrics;
  const demoMode = activeReportMode;
  const demoContent = demoReportContent(demoMode, locale);
  const reportPageTitle = copy.reports.pageTitle;
  const shouldShowOnboarding = false;
  const displayedHasConnectedData = hasConnectedDatabase || cachedSetupState.hasConnectedData || isLoadingConnectedSources;
  const displayedHasReport = hasReportMetrics || cachedSetupState.hasReport;
  const shouldShowSetupProgress =
    !shouldShowOnboarding && (displayedHasConnectedData || displayedHasReport || isLoadingReportsWorkspaceState);

  useEffect(() => {
    if (isLoadingReportsWorkspaceState) {
      return;
    }

    const nextState = {
      hasConnectedData: hasConnectedDatabase,
      hasReport: hasReportMetrics
    };

    setCachedSetupState(nextState);
    window.localStorage.setItem(setupStateStorageKey, JSON.stringify(nextState));
  }, [hasConnectedDatabase, hasReportMetrics, isLoadingReportsWorkspaceState]);

  return (
    <section id="reports" className="dashboard-density flex min-h-full min-w-0 max-w-full flex-col gap-3 overflow-hidden scroll-mt-20">
      <div className="flex flex-col gap-4 px-1 pb-1 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <Badge className="mb-2 border-emerald-700/20 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
            {copy.reports.pageBadge}
          </Badge>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {reportPageTitle}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {copy.reports.pageSubtitle}
          </p>
        </div>
        <div className="flex w-full flex-col items-start gap-2 xl:w-auto xl:items-end">
          <div className="whitespace-nowrap rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            {isReportsZh ? "上次更新时间" : "Last updated"}{" "}
            <span className="text-slate-950">
              {lastReportUpdatedAt ? formatReportDate(lastReportUpdatedAt) : (isReportsZh ? "尚未生成" : "Not generated yet")}
            </span>
          </div>
          {reportEntitlementText ? (
            <div className="max-w-sm rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs font-medium leading-5 text-emerald-900 shadow-sm">
              {reportEntitlementText}
            </div>
          ) : null}
          <div className="flex w-full flex-nowrap items-center gap-2 xl:w-auto">
            {reportEntitlement?.canGenerateReport !== false ? (
              <Button
                size="sm"
                onClick={() => generateReport(activeReportMode === "history" ? "custom_report" : activeReportMode)}
                disabled={isGeneratingReport}
                className="whitespace-nowrap"
              >
                <RefreshCw className={cn(isGeneratingReport && "animate-spin")} />
                {isGeneratingReport
                  ? copy.reports.generatingAction
                  : reportGenerateButtonLabel(reportEntitlement, locale, copy.reports.generateAction)}
              </Button>
            ) : (
              <>
                <Button asChild size="sm" className="whitespace-nowrap">
                  <a href="/checkout/professional">{isReportsZh ? "升级套餐" : "Upgrade plan"}</a>
                </Button>
                <Button asChild variant="outline" size="sm" className="whitespace-nowrap">
                  <a href="/checkout/trial">{isReportsZh ? "购买一次报告" : "Buy one report"}</a>
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" className="whitespace-nowrap">
              <Download />
              {copy.reports.exportAction}
            </Button>
            <Button variant="outline" size="sm" className="whitespace-nowrap">
              <Share2 />
              {copy.reports.shareAction}
            </Button>
          </div>
        </div>
      </div>
      {reportGenerationMessage && hasReportMetrics ? (
        <div className="rounded-xl border bg-white px-4 py-3 text-sm text-muted-foreground shadow-sm">
          {reportGenerationMessage}
        </div>
      ) : null}

      {shouldShowSetupProgress ? (
        <ReportSetupProgress
          isZh={isReportsZh}
          hasConnectedData={displayedHasConnectedData}
          hasReport={displayedHasReport}
        />
      ) : null}

      {!isLoadingReportsWorkspaceState && !displayedHasConnectedData && !displayedHasReport && !shouldShowOnboarding ? (
        <ReportDatabaseCta copy={copy} hasConnectedDatabase={hasConnectedDatabase} />
      ) : null}

      {!shouldShowOnboarding ? (
        <div className="sticky top-0 z-40 -mx-4 bg-slate-50/95 px-4 py-2 backdrop-blur lg:-mx-6 lg:px-6">
          <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-2 shadow-sm">
            {reportModeTabs(locale).map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveReportMode(tab.value)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  activeReportMode === tab.value
                    ? "bg-slate-950 text-white"
                    : "text-muted-foreground hover:bg-secondary"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {showDemoReport ? (
          <div className="space-y-3">
            {!isDemoBannerDismissed ? (
              <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm leading-6 text-emerald-900 shadow-sm">
                <p>
                  <span className="font-semibold">{isReportsZh ? "Demo 示例" : "Demo"}</span>
                  <span className="ml-2">
                    {isReportsZh
                      ? "当前展示演示报告，连接并校验真实数据后会自动切换为真实报告。"
                      : "Showing a demo report. Validated real data will replace it automatically."}
                  </span>
                </p>
                <button
                  type="button"
                  aria-label={isReportsZh ? "关闭 Demo 提示" : "Dismiss demo notice"}
                  onClick={() => setIsDemoBannerDismissed(true)}
                  className="mt-0.5 rounded-md p-1 text-emerald-800 transition hover:bg-emerald-100 hover:text-emerald-950"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : null}
            {demoMode === "history" ? (
              <ReportHistoryPanel
                history={(demoContent.reportHistory as NonNullable<ReportData["reportHistory"]>) ?? []}
                locale={isReportsZh ? "zh" : "en"}
              />
            ) : (
              <ReportModeSummaryPanel
                mode={demoMode}
                content={demoContent}
                locale={isReportsZh ? "zh" : "en"}
              />
            )}
          </div>
        ) : hasReportMetrics && briefing ? (
          <>
            {activeReportMode === "daily_brief" ? (
              <ReportModeSummaryPanel mode="daily_brief" content={dailyBriefReport} locale={isReportsZh ? "zh" : "en"} />
            ) : activeReportMode === "weekly_report" ? (
              <ReportModeSummaryPanel mode="weekly_report" content={weeklyReport} locale={isReportsZh ? "zh" : "en"} />
            ) : activeReportMode === "history" ? (
              <ReportHistoryPanel history={reportHistory} locale={isReportsZh ? "zh" : "en"} />
            ) : activeReportMode === "custom_report" ? (
              <ReportModeSummaryPanel mode="custom_report" content={composedReports.custom_report ?? briefing.payloadJson} locale={isReportsZh ? "zh" : "en"} />
            ) : (
              <ReportGeneratedPanel
                briefing={briefing}
                metricResults={reportMetricResults}
                locale={isReportsZh ? "zh" : "en"}
              />
            )}
          </>
        ) : isWaitingForActiveModeData ? (
          <Card className="border bg-white shadow-sm">
            <CardContent className="p-5 text-sm text-muted-foreground">
              {isReportsZh ? "正在加载当前报告..." : "Loading the current report..."}
            </CardContent>
          </Card>
        ) : isLoadingReport ? (
          <Card className="border bg-white shadow-sm">
            <CardContent className="p-5 text-sm text-muted-foreground">
              {copy.reports.generatingAction}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}

function formatReportMetricValue(value: unknown) {
  if (typeof value === "number") {
    if (Math.abs(value) >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toLocaleString(undefined, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
      })}B`;
    }
    if (Math.abs(value) >= 1_000_000) {
      return `${(value / 1_000_000).toLocaleString(undefined, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2
      })}M`;
    }
    if (Math.abs(value) >= 1_000) {
      return `${(value / 1_000).toLocaleString(undefined, {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1
      })}K`;
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  return value == null ? "-" : String(value);
}

function containsCjkText(value?: string | null) {
  return /[\u3400-\u9fff]/.test(value ?? "");
}

function reportGenerationErrorMessage(
  payload: { code?: string; message?: string } | null,
  locale: Locale
) {
  const isZh = locale === "zh";
  const fallback = isZh ? "报告生成失败" : "Failed to generate report";
  const entitlementMessages: Record<string, { en: string; zh: string }> = {
    NO_ACTIVE_PLAN: {
      en: "The selected plan is not available.",
      zh: "所选套餐不可用。"
    },
    REPORT_LIMIT_REACHED: {
      en: "You have used your one-time report generation. Buy another report or upgrade to monthly unlimited.",
      zh: "单次报告生成次数已用完，请再次购买或升级月付无限版。"
    },
    SUBSCRIPTION_EXPIRED: {
      en: "Your subscription has expired or the payment failed. Please reactivate your plan.",
      zh: "订阅已过期或支付失败，请重新开通。"
    },
    PAYMENT_REQUIRED: {
      en: "Please choose a plan to generate reports.",
      zh: "请选择套餐后再生成报告。"
    },
    PLAN_REQUIRED: {
      en: "Please choose a plan to generate reports.",
      zh: "请选择套餐后再生成报告。"
    },
    NO_REPORT_ACCESS: {
      en: "Your free report has already been used. Upgrade or purchase a report to generate another one.",
      zh: "免费报告已使用。请升级套餐或购买一次报告后继续生成。"
    }
  };
  const localized = payload?.code ? entitlementMessages[payload.code]?.[isZh ? "zh" : "en"] : undefined;

  return localized ?? localeSafeText(payload?.message, fallback, locale);
}

function localeSafeText(value: string | undefined | null, fallback: string, locale: Locale) {
  const text = value?.trim();
  if (!text) return fallback;
  if (locale === "en" && containsCjkText(text)) return fallback;

  return text;
}

function titleCaseMetricText(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const zhMetricNameMap: Array<[RegExp, string]> = [
  [/^total apps?$/i, "App 总数"],
  [/^total products?$/i, "产品总数"],
  [/^total installs?$/i, "总安装量"],
  [/^raw total installs?$/i, "原始总安装量"],
  [/^deduped total installs?$/i, "去重总安装量"],
  [/^total reviews?$/i, "总评论数"],
  [/^raw total reviews?$/i, "原始总评论数"],
  [/^deduped total reviews?$/i, "去重总评论数"],
  [/^review volume$/i, "有效评论量"],
  [/^valid review volume$/i, "有效评论量"],
  [/^sentiment sample size$/i, "情绪样本量"],
  [/^positive sentiment rate$/i, "正向反馈率"],
  [/^negative sentiment rate$/i, "负向反馈率"],
  [/^neutral sentiment rate$/i, "中性反馈率"],
  [/^average sentiment polarity$/i, "平均情绪极性"],
  [/^average sentiment subjectivity$/i, "平均情绪主观性"],
  [/^sentiment distribution$/i, "评论情绪构成"],
  [/^free vs paid apps?$/i, "免费 / 付费 App 结构"],
  [/^installs vs rating$/i, "安装量 vs 评分"],
  [/^installs vs negative sentiment rate$/i, "安装量 vs 负向反馈率"],
  [/^reviews vs sentiment$/i, "评论量 vs 情绪"],
  [/^average rating$/i, "平均评分"],
  [/^median rating$/i, "评分中位数"],
  [/^maximum rating$/i, "最高评分"],
  [/^minimum rating$/i, "最低评分"],
  [/^paid app ratio$/i, "付费 App 占比"],
  [/^paid ratio$/i, "付费占比"],
  [/^estimated paid app install value$/i, "估算付费安装价值"],
  [/^estimated revenue$/i, "估算收入"],
  [/^average installs per app$/i, "单 App 平均安装量"],
  [/^median installs$/i, "安装量中位数"],
  [/^installs mean median ratio$/i, "安装量均值 / 中位数比"],
  [/^average close price$/i, "平均收盘价"],
  [/^start price$/i, "起始价格"],
  [/^end price$/i, "期末价格"],
  [/^cumulative return$/i, "累计收益率"],
  [/^annualized return$/i, "年化收益率"],
  [/^annualized volatility$/i, "年化波动率"],
  [/^max drawdown$/i, "最大回撤"],
  [/^total trading volume$/i, "总成交量"],
  [/^average daily range$/i, "平均日内价差"],
  [/^best daily return$/i, "单日最大涨幅"],
  [/^worst daily return$/i, "单日最大跌幅"],
  [/^close price stddev$/i, "收盘价标准差"],
  [/^trading volume stddev$/i, "成交量标准差"],
  [/^top (\d+) app installs share$/i, "Top $1 App 安装量占比"],
  [/^top (\d+) category installs share$/i, "Top $1 类别安装量占比"],
  [/^top (\d+) app reviews share$/i, "Top $1 App 评论数占比"],
  [/^top (\d+) category reviews share$/i, "Top $1 类别评论数占比"]
];

const zhMetricTermMap: Record<string, string> = {
  app: "App",
  apps: "App",
  product: "产品",
  products: "产品",
  category: "类别",
  categories: "类别",
  type: "类型",
  sentiment: "情绪",
  rating: "评分",
  reviews: "评论数",
  review: "评论",
  volume: "规模",
  installs: "安装量",
  install: "安装量",
  revenue: "收入",
  price: "价格",
  records: "记录数",
  count: "数量",
  average: "平均",
  median: "中位数",
  minimum: "最低",
  maximum: "最高",
  polarity: "极性",
  subjectivity: "主观性",
  positive: "正向",
  negative: "负向",
  neutral: "中性",
  daily: "日度",
  range: "价差",
  trading: "交易",
  close: "收盘",
  return: "收益率",
  distribution: "分布"
};

function localizedMetricName(value: string, locale: Locale): string {
  const readable = titleCaseMetricText(value);
  if (locale !== "zh") return readable;

  for (const [pattern, label] of zhMetricNameMap) {
    if (pattern.test(readable)) {
      return readable.replace(pattern, label);
    }
  }

  const topByMatch = /^top\s+(.+?)\s+by\s+(.+)$/i.exec(readable);
  if (topByMatch) {
    return `Top ${localizedMetricName(topByMatch[1], locale)}（按${localizedMetricName(topByMatch[2], locale)}）`;
  }

  const versusMatch = /^(.+?)\s+vs\s+(.+)$/i.exec(readable);
  if (versusMatch) {
    return `${localizedMetricName(versusMatch[1], locale)} vs ${localizedMetricName(versusMatch[2], locale)}`;
  }

  return readable
    .split(" ")
    .map((part) => zhMetricTermMap[part.toLowerCase()] ?? part)
    .join("");
}

function isRatingReportMetric(result: ReportMetricEvidenceResult) {
  const text = normalizeReportMetricText([
    result.metricName,
    result.displayName,
    result.formula,
    result.metricCategory,
    result.semanticRole
  ].filter(Boolean).join(" "));

  return (text.includes("rating") || text.includes("score")) &&
    !text.includes("review") &&
    !text.includes("sentiment") &&
    !text.includes("confidence") &&
    !text.includes("impact");
}

function isInvalidRatingMetricValue(result: ReportMetricEvidenceResult) {
  if (!isRatingReportMetric(result)) return false;
  const value = reportResultNumber(result);
  if (value == null) return false;
  return value < 0 || value > 5;
}

function normalizedReportMetricDedupeKey(result: ReportMetricEvidenceResult) {
  const display = normalizeReportMetricText(contextualMetricName(result.displayName || result.metricName, result.formula))
    .replace(/average/g, "avg")
    .replace(/sentiment_polarity/g, "sentiment polarity")
    .replace(/sentimentpolarity/g, "sentiment polarity")
    .replace(/_/g, " ");
  const formula = normalizeReportMetricText(result.formula)
    .replace(/count_non_empty/g, "count")
    .replace(/average/g, "avg")
    .replace(/_/g, " ");

  return `${display}|${formula}|${reportMetricScope(result)}`;
}

function dedupeReportMetricResults(results: ReportMetricEvidenceResult[]) {
  const byKey = new Map<string, ReportMetricEvidenceResult>();

  for (const result of results) {
    const key = normalizedReportMetricDedupeKey(result);
    const existing = byKey.get(key);

    if (!existing || reportCoreKpiPriority(result) < reportCoreKpiPriority(existing)) {
      byKey.set(key, result);
    }
  }

  return Array.from(byKey.values());
}

function objectMetricDisplay(result: ReportMetricEvidenceResult, locale: Locale = "zh") {
  const isZh = locale === "zh";
  const rawName = contextualMetricName(result.displayName || result.metricName, result.formula);
  const byMatch = /^(.+?)\s+by\s+(.+)$/i.exec(rawName.trim());
  const formulaDimension = /\s+BY\s+([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)?)/i.exec(result.formula)?.[1]
    ?.split(".")
    .at(-1);
  const metricPart = byMatch?.[1] ?? rawName.replace(/\s+by\s+.+$/i, "");
  const dimensionPart = byMatch?.[2] ?? formulaDimension ?? "Object";
  const isRating = /rating|score/i.test(metricPart) && !/review|sentiment/i.test(metricPart);
  const topRow = isRating
    ? result.rows?.find((row) => {
        const rowValue = Number(row.value);
        return Number.isFinite(rowValue) && rowValue >= 0 && rowValue <= 5;
      })
    : result.rows?.[0];

  if (!topRow) {
    return {
      title: localizedMetricName(rawName, locale),
      value: formatReportMetricValue(result.value),
      dimensionLabel: null as string | null,
      helper: null as string | null
    };
  }

  const value = Number(topRow.value);
  const formattedValue = isRating && Number.isFinite(value) && value >= 0 && value <= 5
    ? value.toFixed(2)
    : formatReportMetricValue(topRow.value);
  const title = isZh
    ? `Top ${localizedMetricName(dimensionPart, locale)}（按${localizedMetricName(metricPart, locale)}）`
    : `Top ${titleCaseMetricText(dimensionPart)} by ${titleCaseMetricText(metricPart)}`;

  return {
    title,
    value: `${topRow.dimension}: ${formattedValue}`,
    dimensionLabel: localizedMetricName(dimensionPart, locale),
    helper: isRating && topRow.sampleSize != null
      ? (isZh
        ? `平均评分 · 样本量 ${formatReportMetricValue(topRow.sampleSize)}`
        : `Average rating · sample size ${formatReportMetricValue(topRow.sampleSize)}`)
      : (isZh ? "对象级结果，不是全局总值" : "Object-level result, not a global total")
  };
}

function formatReportDate(value?: string) {
  if (!value) return "-";
  return formatDateOnly(value);
}

const nonBusinessMetricTokens = [
  "confidence",
  "impactscore",
  "impact_score",
  "dataqualityscore",
  "data_quality_score",
  "version",
  "applied_steps_count",
  "status",
  "anomalytype",
  "anomaly_type",
  "internal_score",
  "debug",
  "system_score"
];

const objectLevelMetricTokens = [
  "by_app",
  "by_apps",
  "by_category",
  "by_categories",
  "by_product",
  "by_products",
  "by_sku",
  "by_customer",
  "by_user",
  "by_account",
  "by_region",
  "by_country",
  "by_city",
  "by_channel",
  "by_source",
  "by_segment",
  "by_type",
  "by_campaign",
  "top_app",
  "top_category",
  "top_product",
  "top_group",
  "bottom_app",
  "bottom_category",
  "bottom_product",
  "ranking"
];

function normalizeReportMetricText(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isObjectLevelReportMetricText(value: string) {
  const normalized = normalizeReportMetricText(value);

  return objectLevelMetricTokens.some((token) => normalized.includes(token)) ||
    /\bBY\s+[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)?/i.test(value);
}

function isBusinessReportMetricResult(result: ReportMetricEvidenceResult) {
  const rawText = [
    result.metricName,
    result.displayName,
    result.formula,
    result.metricCategory,
    result.sourceDataset
  ].filter(Boolean).join(" ");
  const text = normalizeReportMetricText(rawText);

  return !nonBusinessMetricTokens.some((token) => text.includes(token)) &&
    !isObjectLevelReportMetricText(rawText);
}

function isNonInternalReportMetricResult(result: ReportMetricEvidenceResult) {
  const rawText = [
    result.metricName,
    result.displayName,
    result.formula,
    result.metricCategory,
    result.metricType,
    result.sourceDataset
  ].filter(Boolean).join(" ");
  const text = normalizeReportMetricText(rawText);

  return !nonBusinessMetricTokens.some((token) => text.includes(token));
}

function isBusinessStructuredMetric(metric: {
  displayName?: string;
  name?: string;
  formula?: string;
  category?: string;
  explanation?: string;
}) {
  const rawText = [
    metric.displayName,
    metric.name,
    metric.formula,
    metric.category,
    metric.explanation
  ].filter(Boolean).join(" ");
  const text = normalizeReportMetricText(rawText);

  return !nonBusinessMetricTokens.some((token) => text.includes(token)) &&
    !isObjectLevelReportMetricText(rawText);
}

type ReportMetricStatusFilter =
  | "all"
  | "verified"
  | "estimated"
  | "dedup"
  | "smallSample"
  | "limited"
  | "failed";

type ReportMetricTypeFilter =
  | "all"
  | "core"
  | "comparison"
  | "distribution"
  | "ranking"
  | "trend"
  | "auxiliary";

const reportMetricStatusFilters: Array<{ value: ReportMetricStatusFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "verified", label: "已验证" },
  { value: "estimated", label: "估算值" },
  { value: "dedup", label: "未去重" },
  { value: "smallSample", label: "小样本" },
  { value: "limited", label: "口径限制" },
  { value: "failed", label: "计算失败" }
];

const reportMetricTypeFilters: Array<{ value: ReportMetricTypeFilter; label: string }> = [
  { value: "all", label: "全部类型" },
  { value: "core", label: "核心指标" },
  { value: "comparison", label: "对比指标" },
  { value: "distribution", label: "分布指标" },
  { value: "ranking", label: "排名指标" },
  { value: "trend", label: "趋势指标" },
  { value: "auxiliary", label: "辅助指标" }
];

const reportMetricTypeLabelMap: Record<ReportMetricTypeFilter, string> = {
  all: "全部类型",
  core: "核心指标",
  comparison: "对比指标",
  distribution: "分布指标",
  ranking: "排名指标",
  trend: "趋势指标",
  auxiliary: "辅助指标"
};

const reportMetricStatusFilterLabelMap: Record<ReportMetricStatusFilter, { zh: string; en: string }> = {
  all: { zh: "全部", en: "All" },
  verified: { zh: "已验证", en: "Verified" },
  estimated: { zh: "估算值", en: "Estimated" },
  dedup: { zh: "未去重", en: "Raw / not deduped" },
  smallSample: { zh: "小样本", en: "Small sample" },
  limited: { zh: "口径限制", en: "Definition caveats" },
  failed: { zh: "计算失败", en: "Failed" }
};

const reportMetricTypeFilterLabelMap: Record<ReportMetricTypeFilter, { zh: string; en: string }> = {
  all: { zh: "全部类型", en: "All types" },
  core: { zh: "核心指标", en: "Core metrics" },
  comparison: { zh: "对比指标", en: "Comparison metrics" },
  distribution: { zh: "分布指标", en: "Distribution metrics" },
  ranking: { zh: "排名指标", en: "Ranking metrics" },
  trend: { zh: "趋势指标", en: "Trend metrics" },
  auxiliary: { zh: "辅助指标", en: "Auxiliary metrics" }
};

function reportMetricStatusFilterLabel(value: ReportMetricStatusFilter, locale: Locale) {
  return locale === "zh" ? reportMetricStatusFilterLabelMap[value].zh : reportMetricStatusFilterLabelMap[value].en;
}

function reportMetricTypeFilterLabel(value: ReportMetricTypeFilter, locale: Locale) {
  return locale === "zh" ? reportMetricTypeFilterLabelMap[value].zh : reportMetricTypeFilterLabelMap[value].en;
}

function metricWarningTypes(result: ReportMetricEvidenceResult) {
  return new Set([
    ...(Array.isArray(result.warningTypes) ? result.warningTypes : []),
    result.warning ?? ""
  ].map((value) => normalizeReportMetricText(String(value))).filter(Boolean));
}

function isEstimatedReportMetric(result: ReportMetricEvidenceResult) {
  const text = normalizeReportMetricText([
    result.metricName,
    result.displayName,
    result.formula,
    result.warning
  ].filter(Boolean).join(" "));
  const warnings = metricWarningTypes(result);

  return Boolean(result.isEstimated) ||
    warnings.has("estimated_value") ||
    text.includes("estimated") ||
    /price\s*\*\s*(installs|quantity|volume)/i.test(result.formula);
}

function requiresDedupedReportMetric(result: ReportMetricEvidenceResult) {
  const text = normalizeReportMetricText([
    result.metricName,
    result.displayName,
    result.formula,
    result.warning
  ].filter(Boolean).join(" "));
  const warnings = metricWarningTypes(result);

  return Boolean(result.requiresDeduplication) ||
    warnings.has("deduplication_warning") ||
    warnings.has("raw_metric") ||
    text.includes("dedup") ||
    text.includes("raw_metric") ||
    text.includes("raw_total");
}

function isSmallSampleReportMetric(result: ReportMetricEvidenceResult) {
  const warnings = metricWarningTypes(result);

  return (typeof result.sampleSize === "number" && result.sampleSize < 20) ||
    warnings.has("small_sample") ||
    warnings.has("small_sample_warning");
}

function hasLimitedReportMetricScope(result: ReportMetricEvidenceResult) {
  const warnings = metricWarningTypes(result);

  return Boolean(result.warning) ||
    warnings.has("missing_benchmark") ||
    warnings.has("raw_metric") ||
    warnings.has("invalid_or_missing_value") ||
    isEstimatedReportMetric(result) ||
    requiresDedupedReportMetric(result) ||
    isSmallSampleReportMetric(result);
}

function reportMetricScope(result: ReportMetricEvidenceResult): NonNullable<ReportMetricEvidenceResult["scope"]> {
  if (result.scope) return result.scope;
  if (Array.isArray(result.rows) && result.rows.length > 0) return "ranking";
  if (isObjectLevelReportMetricText([
    result.metricName,
    result.displayName,
    result.formula,
    result.metricCategory,
    result.sourceDataset
  ].filter(Boolean).join(" "))) {
    return "group";
  }
  return "global";
}

function reportMetricDisplayType(result: ReportMetricEvidenceResult): ReportMetricTypeFilter {
  const type = normalizeReportMetricText(result.metricType ?? "");
  const category = normalizeReportMetricText(result.metricCategory ?? "");
  const name = normalizeReportMetricText(`${result.metricName} ${result.displayName ?? ""} ${result.formula}`);
  const scope = reportMetricScope(result);

  if (scope === "ranking" || type.includes("ranking")) return "ranking";
  if (type.includes("trend") || category.includes("trend") || name.includes("period_change")) return "trend";
  if (
    type.includes("distribution") ||
    category.includes("distribution") ||
    name.includes("median") ||
    name.includes("percentile") ||
    name.includes("p75") ||
    name.includes("p90") ||
    name.includes("stddev")
  ) {
    return "distribution";
  }
  if (
    type.includes("comparison") ||
    type.includes("benchmark") ||
    result.isBenchmarkMetric ||
    name.includes("share") ||
    name.includes("threshold") ||
    name.includes("vs")
  ) {
    return "comparison";
  }
  if (type.includes("diagnostic") || category.includes("diagnostic") || result.isDiagnosticMetric) return "auxiliary";
  return "core";
}

function inferReportMetricBusinessModule(result: ReportMetricEvidenceResult, locale: Locale = "zh") {
  const isZh = locale === "zh";
  const text = normalizeReportMetricText([
    result.businessType,
    result.metricCategory,
    result.metricType,
    result.semanticRole,
    result.metricName,
    result.displayName,
    result.formula,
    result.sourceDataset
  ].filter(Boolean).join(" "));

  if (text.includes("sentiment") || text.includes("review") || text.includes("rating")) {
    return text.includes("review") || text.includes("sentiment")
      ? (isZh ? "用户反馈" : "Customer Feedback")
      : (isZh ? "评分与质量" : "Ratings & Quality");
  }
  if (text.includes("app") || text.includes("installs") || text.includes("download") || text.includes("category")) {
    return text.includes("price") || text.includes("paid") || text.includes("monetization")
      ? (isZh ? "变现" : "Monetization")
      : (isZh ? "市场规模" : "Market Scale");
  }
  if (text.includes("revenue") || text.includes("sales") || text.includes("gmv") || text.includes("amount")) {
    return isZh ? "收入与销售" : "Revenue & Sales";
  }
  if (text.includes("cost") || text.includes("margin") || text.includes("profit") || text.includes("roi")) {
    return isZh ? "成本与利润" : "Cost & Profit";
  }
  if (text.includes("conversion") || text.includes("cvr") || text.includes("retention") || text.includes("churn")) {
    return isZh ? "转化与留存" : "Conversion & Retention";
  }
  if (
    text.includes("close") ||
    text.includes("volume") ||
    text.includes("drawdown") ||
    text.includes("return") ||
    text.includes("volatility")
  ) {
    return isZh ? "金融 / 时间序列" : "Finance / Time Series";
  }
  if (reportMetricDisplayType(result) === "ranking" || reportMetricScope(result) !== "global") {
    return isZh ? "排名与对象" : "Rankings & Objects";
  }
  if (hasLimitedReportMetricScope(result)) {
    return isZh ? "数据质量" : "Data Quality";
  }
  return isZh ? "通用业务指标" : "Business Metrics";
}

function isReportDashboardMetric(result: ReportMetricEvidenceResult) {
  if (result.isInternalMetric) return false;
  if (!isNonInternalReportMetricResult(result)) return false;
  if (result.status !== "failed" && !hasDisplayableMetricResult(result)) return false;
  if (isNoisyZeroDistributionMetric(result)) return false;
  if (isInvalidRatingMetricValue(result)) return false;

  return true;
}

function isNoisyZeroDistributionMetric(result: ReportMetricEvidenceResult) {
  const value = reportResultNumber(result);
  if (value !== 0) return false;

  const text = normalizeReportMetricText([
    result.metricName,
    result.displayName,
    result.formula,
    result.metricCategory,
    result.metricType
  ].filter(Boolean).join(" "));

  return text.includes("price") &&
    (
      text.includes("median") ||
      text.includes("minimum") ||
      text.includes("p25") ||
      text.includes("p50") ||
      text.includes("p75") ||
      text.includes("p90") ||
      text.includes("p95") ||
      text.includes("percentile")
    );
}

function reportCoreKpiPriority(result: ReportMetricEvidenceResult) {
  const name = normalizeReportMetricText(`${result.displayName ?? ""} ${result.metricName}`);
  const category = normalizeReportMetricText(result.metricCategory ?? "");
  const business = normalizeReportMetricText(result.businessType ?? result.sourceDataset ?? "");

  if (typeof result.priority === "number") return result.priority;
  if (name.includes("total_apps") || name.includes("total_products")) return 10;
  if (name.includes("total_installs") || name.includes("usage") || name.includes("downloads")) return 12;
  if (name.includes("review_volume") || name.includes("valid_review")) return 14;
  if (name.includes("negative_sentiment_rate")) return 16;
  if (name.includes("positive_sentiment_rate")) return 17;
  if (name.includes("average_rating")) return 18;
  if (name.includes("average_sentiment_polarity")) return 19;
  if (name.includes("paid_app_ratio") || name.includes("paid_ratio")) return 24;
  if (name.includes("estimated_paid") || name.includes("estimated_value")) return 26;
  if (name.includes("cumulative_return")) return 30;
  if (name.includes("max_drawdown")) return 31;
  if (name.includes("annualized_volatility")) return 32;
  if (name.includes("annualized_return")) return 33;
  if (name.includes("average_close_price") || name.includes("end_price") || name.includes("start_price")) return 36;
  if (name.includes("total_trading_volume")) return 38;
  if (category.includes("revenue") || name.includes("revenue") || name.includes("gmv")) return 40;
  if (category.includes("quality") || category.includes("risk")) return 45;
  if (business.includes("finance")) return 70;
  return 90;
}

function selectReportCoreKpis(results: ReportMetricEvidenceResult[]) {
  const byDisplayKey = new Map<string, ReportMetricEvidenceResult>();
  const candidates = results
    .filter((result) => result.status === "computed")
    .filter(hasDisplayableMetricResult)
    .filter((result) => reportMetricScope(result) === "global")
    .filter((result) => !["comparison", "distribution", "ranking", "auxiliary"].includes(reportMetricDisplayType(result)));

  for (const result of candidates) {
    const displayKey = normalizeReportMetricText(contextualMetricName(result.displayName || result.metricName, result.formula));
    const existing = byDisplayKey.get(displayKey);
    if (!existing || reportCoreKpiPriority(result) < reportCoreKpiPriority(existing)) {
      byDisplayKey.set(displayKey, result);
    }
  }

  return Array.from(byDisplayKey.values())
    .sort((left, right) => reportCoreKpiPriority(left) - reportCoreKpiPriority(right))
    .slice(0, 8);
}

function reportMetricBadges(result: ReportMetricEvidenceResult, maxCount = 2, locale: Locale = "zh") {
  const isZh = locale === "zh";
  const badges: Array<{ label: string; className?: string }> = [];

  if (result.status === "failed") {
    badges.push({ label: isZh ? "计算失败" : "Failed", className: "text-rose-700" });
  } else if (result.status === "computed" || result.validationStatus === "passed") {
    badges.push({ label: isZh ? "已验证" : "Verified", className: "text-emerald-700" });
  }
  if (isEstimatedReportMetric(result)) badges.push({ label: isZh ? "估算值" : "Estimated", className: "text-amber-700" });
  if (requiresDedupedReportMetric(result)) badges.push({ label: isZh ? "未去重" : "Raw", className: "text-amber-700" });
  if (isSmallSampleReportMetric(result)) badges.push({ label: isZh ? "小样本" : "Small sample", className: "text-amber-700" });
  if (result.isDiagnosticMetric || reportMetricDisplayType(result) === "auxiliary") {
    badges.push({ label: isZh ? "辅助指标" : "Auxiliary", className: "text-slate-600" });
  }
  if (metricWarningTypes(result).has("missing_benchmark")) {
    badges.push({ label: isZh ? "缺少基准" : "No benchmark", className: "text-amber-700" });
  }

  return badges.slice(0, maxCount);
}

function reportMetricShortDescription(result: ReportMetricEvidenceResult, locale: Locale = "zh") {
  const isZh = locale === "zh";
  const name = normalizeReportMetricText(`${result.displayName ?? ""} ${result.metricName}`);
  const businessModule = inferReportMetricBusinessModule(result, locale);

  if (name.includes("negative_sentiment_rate")) return isZh ? "整体负向反馈占比，用于判断用户体验风险" : "Overall negative feedback share for user experience risk.";
  if (name.includes("positive_sentiment_rate")) return isZh ? "整体正向反馈占比，用于判断用户满意度" : "Overall positive feedback share for user satisfaction.";
  if (name.includes("review_volume")) return isZh ? "有效评论样本量" : "Valid review sample size.";
  if (name.includes("total_installs")) return isZh ? "安装规模指标，注意原始口径限制" : "Install scale metric; raw definitions may need deduplication.";
  if (name.includes("average_rating")) return isZh ? "公开评分的平均水平" : "Average public rating level.";
  if (name.includes("estimated")) return isZh ? "方向性估算指标，不代表真实收入" : "Directional estimate, not actual revenue.";
  if (businessModule === (isZh ? "金融 / 时间序列" : "Finance / Time Series")) {
    return isZh ? "金融时序指标，用于观察价格、收益或交易规模" : "Finance time-series metric for price, return, or trading scale.";
  }
  if (businessModule === (isZh ? "排名与对象" : "Rankings & Objects")) {
    return isZh ? "对象级结果，适合放入排名和排查线索" : "Object-level result for rankings and investigation leads.";
  }
  return isZh ? `${businessModule}下的业务指标` : `Business metric in ${businessModule}.`;
}

type ReportChartType =
  | "horizontal_bar_chart"
  | "bar_chart"
  | "ranking_table"
  | "donut_chart"
  | "scatter_plot"
  | "line_chart";

type ReportChartGroup = "core_trends" | "risk_quality" | "structure" | "relationship" | "monetization" | "auxiliary";

type ReportChartDatum = {
  label: string;
  value: number;
  secondaryValue?: number;
  secondaryLabel?: string;
  badge?: string;
};

type ReportChartConfig = {
  id: string;
  title: string;
  chartType: ReportChartType;
  businessModule: string;
  description: string;
  insightHint: string;
  priority: number;
  group: ReportChartGroup;
  chartGroup: ReportChartGroup;
  businessQuestion: string;
  linkedInsightIds: string[];
  linkedMetricIds: string[];
  displaySize: "medium" | "large" | "full_width";
  metricIds: string[];
  data: ReportChartDatum[];
  xAxis?: string;
  yAxis?: string;
  caveats?: string[];
  aggregationType?: "SUM" | "AVG" | "COUNT" | "COUNT_DISTINCT" | "MAX" | "MIN";
  dimensionLabel?: string;
  metricLabel?: string;
  timeField?: string;
  incompletePeriod?: boolean;
  debugNote?: string;
};

const reportChartColors = ["#047857", "#0f172a", "#0ea5e9", "#f59e0b", "#e11d48", "#7c3aed", "#64748b"];

function localizedReportChartText(value: string | undefined, locale: Locale) {
  if (!value || locale === "zh") return value ?? "";

  const normalized = value.trim();
  const translations: Record<string, string> = {
    "用户反馈": "Customer Feedback",
    "评分与质量": "Ratings & Quality",
    "市场规模": "Market Scale",
    "变现": "Monetization",
    "收入与销售": "Revenue & Sales",
    "成本与利润": "Cost & Profit",
    "转化与留存": "Conversion & Retention",
    "金融 / 时间序列": "Finance / Time Series",
    "排名与对象": "Rankings & Objects",
    "数据质量": "Data Quality",
    "通用业务指标": "Business Metrics",
    "趋势分析": "Trend Analysis",
    "风险与机会": "Risks & Opportunities",
    "展示分组或对象的规模排名。": "Shows scale rankings across groups or objects.",
    "展示对象级质量或反馈排名。": "Shows object-level quality or feedback rankings.",
    "适合判断规模来源是否集中在头部类别或对象。": "Use this to see whether scale is concentrated in top categories or objects.",
    "适合定位高表现、低表现或需要排查的对象。": "Use this to find high performers, low performers, or objects that need review.",
    "基于时间字段展示指标变化。": "Shows metric changes over business time.",
    "适合观察趋势、峰值和周期波动。": "Use this to review trend shifts, peaks, and periodic volatility.",
    "按业务时间字段展示指标变化。": "Shows metric changes by business time.",
    "用于识别增长、下滑和波动。": "Use this to identify growth, decline, and volatility.",
    "估算口径，仅作方向判断": "Estimated definition; directional only",
    "小样本线索": "Small sample lead"
  };

  return translations[normalized] ?? value;
}

function chartGroupLabel(group: ReportChartGroup, locale: Locale) {
  const isZh = locale === "zh";
  if (group === "core_trends") return isZh ? "核心趋势" : "Core trends";
  if (group === "risk_quality") return isZh ? "风险与质量" : "Risk & quality";
  if (group === "structure") return isZh ? "结构分析" : "Structure";
  if (group === "relationship") return isZh ? "关系分析" : "Relationships";
  if (group === "monetization") return isZh ? "变现 / 定价分析" : "Monetization / pricing";
  return isZh ? "辅助分析" : "Auxiliary";
}

function chartGroupDescription(group: ReportChartGroup, locale: Locale) {
  const isZh = locale === "zh";
  if (group === "core_trends") return isZh ? "优先展示销售额、订单量、客户数和客单价等结果指标。" : "Outcome metrics such as sales, orders, customers, and order value.";
  if (group === "risk_quality") return isZh ? "展示评分、退款、负向反馈和转化等风险质量信号。" : "Risk and quality signals such as ratings, refunds, negative feedback, and conversion.";
  if (group === "structure") return isZh ? "展示品类、渠道、客户群体等结构差异。" : "Breakdowns across category, channel, segment, and similar dimensions.";
  if (group === "relationship") return isZh ? "展示指标之间的关系，解释变化来源。" : "Relationships between metrics that explain changes.";
  if (group === "monetization") return isZh ? "展示价格、折扣和变现相关辅助分析。" : "Pricing, discount, and monetization analysis.";
  return isZh ? "展示辅助分布和诊断指标，默认折叠。" : "Supporting distributions and diagnostic metrics, folded by default.";
}

function chartMetricText(value = "", locale: Locale = "zh") {
  const normalized = normalizeReportMetricText(value);
  const raw = value.toLowerCase();
  const isZh = locale === "zh";

  const zhEntries: Array<[RegExp, string]> = [
    [/average.*customer.*rating|customer.*rating|average_rating|rating|score/, "平均客户评分"],
    [/gross_sales|grosssales|sales_amount|total_sales|sales|revenue|gmv|estimated_gmv/, "销售额"],
    [/discount_amount|discountamount|discount/, "折扣金额"],
    [/average_order_value|aov|average.*price|avg.*price/, "平均价格"],
    [/price/, "价格"],
    [/total_orders|order_count|orders|records/, "订单数"],
    [/total_customers|customer_count|customers/, "客户数"],
    [/install/, "安装量"],
    [/review_volume|reviews/, "评论量"],
    [/negative_sentiment_rate/, "负向反馈率"],
    [/positive_sentiment_rate/, "正向反馈率"],
    [/conversion_rate|cvr/, "转化率"],
    [/trading_volume|volume/, "交易量"],
    [/close_price|close/, "收盘价"]
  ];

  if (isZh) {
    if (/评分/.test(value)) return /客户/.test(value) ? "平均客户评分" : "平均评分";
    if (/销售额|销售金额|收入/.test(value)) return "销售额";
    if (/折扣/.test(value)) return "折扣金额";
    if (/订单/.test(value)) return "订单数";
    if (/客户/.test(value)) return "客户数";
    if (/价格/.test(value)) return /平均/.test(value) ? "平均价格" : "价格";
    if (/gross\s*sales/.test(raw)) return "销售额";
    if (/discount\s*amount/.test(raw)) return "折扣金额";
    const match = zhEntries.find(([pattern]) => pattern.test(normalized));
    if (match) return match[1];
    return value
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function chartDimensionText(value = "", locale: Locale = "zh") {
  const normalized = normalizeReportMetricText(value);
  const isZh = locale === "zh";
  if (!isZh) return chartMetricText(value, locale);
  if (/category|品类/.test(normalized)) return "品类";
  if (/sales_channel|saleschannel|channel|source|platform/.test(normalized)) return "渠道";
  if (/customer_segment|customersegment|segment/.test(normalized)) return "客户群体";
  if (/region|country|city/.test(normalized)) return "地区";
  if (/status/.test(normalized)) return "状态";
  if (/product|sku|app/.test(normalized)) return "对象";
  return value || "分组";
}

function inferChartAggregationType(text = "", chartType?: ReportChartType): NonNullable<ReportChartConfig["aggregationType"]> {
  const normalized = normalizeReportMetricText(text);
  if (/avg|average|mean|rating|score|rate|ratio|price/.test(normalized) && !/total|sum|gross/.test(normalized)) return "AVG";
  if (/count_distinct|unique|distinct/.test(normalized)) return "COUNT_DISTINCT";
  if (/count|orders|customers|records|reviews|tickets|sessions/.test(normalized) || chartType === "ranking_table") return "COUNT";
  if (/max|highest/.test(normalized)) return "MAX";
  if (/min|lowest/.test(normalized)) return "MIN";
  return "SUM";
}

function rankingChartTitle(result: ReportMetricEvidenceResult, locale: Locale, yAxis: string) {
  const isZh = locale === "zh";
  const byMatch = /\bBY\s+(.+)$/i.exec(result.formula);
  const dimension = chartDimensionText(byMatch?.[1] ?? result.rows?.[0]?.dimension ?? result.metricName, locale);
  const aggregation = inferChartAggregationType(`${result.metricName} ${result.displayName ?? ""} ${result.formula}`, "horizontal_bar_chart");
  const metric = chartMetricText(yAxis || result.metricName, locale);

  if (!isZh) return `${dimension} ranking by ${aggregation} ${metric}`;
  if (aggregation === "AVG") return `各${dimension}${metric.startsWith("平均") ? metric : `平均${metric}`}排名`;
  if (aggregation === "COUNT" || aggregation === "COUNT_DISTINCT") return `各${dimension}${metric}排名`;
  return `各${dimension}总${metric}排名`;
}

function trendChartTitle(metricName: string, locale: Locale) {
  const metric = chartMetricText(metricName, locale);
  return locale === "zh" ? `${metric}趋势` : `${metric} trend`;
}

function isRatingChartMetric(label = "") {
  return /rating|score|评分/i.test(label);
}

function hasInvalidRatingRange(label: string, data: ReportChartDatum[]) {
  return isRatingChartMetric(label) && data.some((row) => row.value < 0 || row.value > 5);
}

function parseChartDate(value: string) {
  return parseReportTrendDate(value);
}

function isLatestBucketIncomplete(data: ReportChartDatum[], aggregationType?: ReportChartConfig["aggregationType"]) {
  const latest = data.at(-1);
  if (!latest) return false;

  const latestDate = parseChartDate(latest.label);
  if (latestDate) {
    const now = new Date();
    const sameDay = latestDate.getFullYear() === now.getFullYear() &&
      latestDate.getMonth() === now.getMonth() &&
      latestDate.getDate() === now.getDate();
    const monthBucket = /^\d{4}-\d{2}$/.test(latest.label);
    const sameMonth = monthBucket && latestDate.getFullYear() === now.getFullYear() && latestDate.getMonth() === now.getMonth();
    const yearBucket = /^\d{4}$/.test(latest.label);
    const sameYear = yearBucket && latestDate.getFullYear() === now.getFullYear();
    if (sameDay || sameMonth || sameYear) return true;
  }

  if (["COUNT", "COUNT_DISTINCT", "SUM"].includes(String(aggregationType ?? "")) && data.length >= 4) {
    const previous = data.slice(-4, -1);
    const average = previous.reduce((sum, row) => sum + Math.abs(row.value), 0) / previous.length;
    return average > 0 && Math.abs(latest.value) < average * 0.5;
  }

  return false;
}

function trendInsight(chart: Pick<ReportChartConfig, "data" | "yAxis" | "aggregationType" | "incompletePeriod">, locale: Locale) {
  const isZh = locale === "zh";
  const data = chart.data;
  const metric = chartMetricText(chart.yAxis ?? "", locale);
  if (data.length < 2) return isZh ? `${metric}当前可用趋势点不足，暂不判断变化。` : `${metric} has too few trend points to infer a change.`;

  const completeData = chart.incompletePeriod ? data.slice(0, -1) : data;
  const usable = completeData.length >= 2 ? completeData : data;
  const max = usable.reduce((best, row) => row.value > best.value ? row : best, usable[0]);
  const first = usable[0];
  const last = usable.at(-1)!;
  const change = first.value ? (last.value - first.value) / Math.abs(first.value) : 0;
  const caveat = chart.incompletePeriod
    ? (isZh ? "最近一期数据可能未完整，末尾变化仅作参考。" : "The latest period may be incomplete, so the end movement is for reference only.")
    : "";

  let sentence: string;
  if (/discount|折扣/.test(metric.toLowerCase())) {
    sentence = isZh
      ? `${metric}在 ${max.label} 达到高点，可能对应促销或折扣活动。`
      : `${metric} peaked around ${max.label}, which may align with promotion or discount activity.`;
  } else if (/评分|rating|score/i.test(metric)) {
    const range = Math.max(...usable.map((row) => row.value)) - Math.min(...usable.map((row) => row.value));
    sentence = isZh
      ? `${metric}${range < 0.3 ? "整体较稳定" : "出现波动"}，最近完整周期为 ${last.label}。`
      : `${metric} is ${range < 0.3 ? "mostly stable" : "moving noticeably"}, with ${last.label} as the latest complete period.`;
  } else if (Math.abs(change) < 0.05) {
    sentence = isZh
      ? `${metric}整体较稳定，峰值出现在 ${max.label}。`
      : `${metric} is broadly stable, with a peak around ${max.label}.`;
  } else if (change > 0) {
    sentence = isZh
      ? `${metric}从 ${first.label} 到 ${last.label} 整体上升，峰值出现在 ${max.label}。`
      : `${metric} increased from ${first.label} to ${last.label}, peaking around ${max.label}.`;
  } else {
    sentence = isZh
      ? `${metric}在 ${max.label} 达到峰值后回落，最近完整周期为 ${last.label}。`
      : `${metric} peaked around ${max.label} and then pulled back by ${last.label}.`;
  }

  return caveat ? `${sentence}${caveat}` : sentence;
}

function rankingInsight(chart: Pick<ReportChartConfig, "data" | "yAxis" | "dimensionLabel" | "aggregationType">, locale: Locale) {
  const isZh = locale === "zh";
  const top = chart.data[0];
  const second = chart.data[1];
  const metric = chartMetricText(chart.yAxis ?? "", locale);
  const dimension = chart.dimensionLabel ?? (isZh ? "分组" : "group");
  if (!top) return isZh ? `${dimension}排名暂无足够数据。` : `There is not enough data for the ${dimension} ranking.`;
  const gap = second && second.value ? Math.abs((top.value - second.value) / Math.abs(second.value)) : null;
  if (isZh) {
    return gap != null && gap > 0.3
      ? `${top.label} 的${metric}最高，明显高于其他${dimension}。`
      : `${top.label} 的${metric}排名最高，可优先查看其对整体表现的贡献。`;
  }
  return gap != null && gap > 0.3
    ? `${top.label} leads ${metric} and is clearly above other ${dimension}.`
    : `${top.label} leads ${metric}; review its contribution to the overall result.`;
}

function chartInsight(chart: ReportChartConfig, locale: Locale) {
  if (chart.chartType === "line_chart" || chart.chartType === "bar_chart") return trendInsight(chart, locale);
  if (chart.chartType === "horizontal_bar_chart" || chart.chartType === "ranking_table") return rankingInsight(chart, locale);
  if (chart.chartType === "scatter_plot") return chart.insightHint;
  if (chart.chartType === "donut_chart") {
    const top = [...chart.data].sort((left, right) => right.value - left.value)[0];
    return locale === "zh"
      ? `${top?.label ?? "主要分组"}占比最高，是当前结构中的主要组成部分。`
      : `${top?.label ?? "The leading segment"} has the largest share in the current mix.`;
  }
  return chart.insightHint;
}

function chartGroupFromConfig(chart: Pick<ReportChartConfig, "chartType" | "yAxis" | "title">): ReportChartGroup {
  const text = normalizeReportMetricText(`${chart.title} ${chart.yAxis ?? ""}`);
  if (chart.chartType === "scatter_plot") return "relationship";
  if (/price|discount|折扣|价格/.test(text)) return "monetization";
  if (/refund|churn|negative|risk|quality|rating|score|sentiment|评分|质量|负向/.test(text)) return "risk_quality";
  if (chart.chartType === "horizontal_bar_chart" || chart.chartType === "ranking_table" || chart.chartType === "donut_chart") return "structure";
  return "core_trends";
}

function chartPriority(chart: Pick<ReportChartConfig, "group" | "yAxis" | "chartType" | "priority">) {
  const text = normalizeReportMetricText(chart.yAxis ?? "");
  if (chart.group === "core_trends") {
    if (/revenue|sales|gmv|销售额/.test(text)) return 1;
    if (/orders|订单/.test(text)) return 2;
    if (/customers|客户/.test(text)) return 3;
    if (/average_order_value|客单价/.test(text)) return 4;
    return 8 + chart.priority;
  }
  if (chart.group === "risk_quality") return 10 + chart.priority;
  if (chart.group === "structure") return 20 + chart.priority;
  if (chart.group === "relationship") return 30 + chart.priority;
  if (chart.group === "monetization") return 45 + chart.priority;
  return 70 + chart.priority;
}

type ChartRecommendationSignal = {
  id: string;
  text: string;
  evidenceMetrics: string[];
};

type ChartRecommendationContext = {
  keyFindings?: ChartRecommendationSignal[];
  businessRisks?: ChartRecommendationSignal[];
  growthOpportunities?: ChartRecommendationSignal[];
  nextActions?: ChartRecommendationSignal[];
  coreKpis?: ReportMetricEvidenceResult[];
};

function recommendationSignalsFromStructuredReport(report?: StructuredReportViewData | null): ChartRecommendationSignal[] {
  const generated = report?.generatedInsights;
  const nextActions = generated?.nextActionPlan?.actionInsights ?? [];
  const items = [
    ...(generated?.keyFindings ?? []),
    ...(generated?.businessRisks ?? []),
    ...(generated?.growthOpportunities ?? []),
    ...nextActions
  ];

  return items.map((item, index) => {
    const record = item as Record<string, unknown>;
    return {
      id: typeof record.id === "string" ? record.id : `insight-${index}`,
      text: [
        record.title,
        record.summary,
        record.finding,
        record.currentConclusion,
        record.supportingEvidence,
        record.businessMeaning,
        record.recommendedDecision,
        record.recommendedAction,
        record.evidence
      ].filter(Boolean).join(" "),
      evidenceMetrics: Array.isArray(record.evidenceMetrics) ? record.evidenceMetrics.map(String) : []
    };
  });
}

function chartSignalScore(chart: Pick<ReportChartConfig, "yAxis" | "title" | "businessQuestion">, signals: ChartRecommendationSignal[] = []) {
  const chartText = normalizeReportMetricText(`${chart.title} ${chart.yAxis ?? ""} ${chart.businessQuestion}`);
  return signals.reduce((score, signal) => {
    const signalText = normalizeReportMetricText(`${signal.text} ${signal.evidenceMetrics.join(" ")}`);
    if (!signalText) return score;
    if (/total_orders|orders|订单/.test(signalText) && /orders|订单/.test(chartText)) return score + 80;
    if (/total_customers|customers|客户/.test(signalText) && /customers|客户/.test(chartText)) return score + 80;
    if (/estimated_gmv|gross_sales|grosssales|revenue|gmv|销售额/.test(signalText) && /sales|revenue|gmv|销售额/.test(chartText)) return score + 90;
    if (/category|品类|contribution/.test(signalText) && /category|品类/.test(chartText)) return score + 70;
    if (/rating|score|评分/.test(signalText) && /rating|score|评分/.test(chartText)) return score + 70;
    if (/discount|折扣/.test(signalText) && /discount|折扣/.test(chartText)) return score + 70;
    return signal.evidenceMetrics.some((metric) => chartText.includes(normalizeReportMetricText(metric))) ? score + 50 : score;
  }, 0);
}

function chartLinkedInsightIds(chart: Pick<ReportChartConfig, "yAxis" | "title" | "businessQuestion">, signals: ChartRecommendationSignal[] = []) {
  const chartText = normalizeReportMetricText(`${chart.title} ${chart.yAxis ?? ""} ${chart.businessQuestion}`);
  return signals.flatMap((signal) => {
    const signalText = normalizeReportMetricText(`${signal.text} ${signal.evidenceMetrics.join(" ")}`);
    if (
      signal.evidenceMetrics.some((metric) => chartText.includes(normalizeReportMetricText(metric))) ||
      (/total_orders|orders|订单/.test(signalText) && /orders|订单/.test(chartText)) ||
      (/total_customers|customers|客户/.test(signalText) && /customers|客户/.test(chartText)) ||
      (/estimated_gmv|gross_sales|grosssales|revenue|gmv|销售额/.test(signalText) && /sales|revenue|gmv|销售额/.test(chartText)) ||
      (/category|品类|contribution/.test(signalText) && /category|品类/.test(chartText)) ||
      (/rating|score|评分/.test(signalText) && /rating|score|评分/.test(chartText)) ||
      (/discount|折扣/.test(signalText) && /discount|折扣/.test(chartText))
    ) {
      return [signal.id];
    }
    return [];
  });
}

function chartBusinessQuestion(chart: Pick<ReportChartConfig, "group" | "yAxis" | "dimensionLabel" | "chartType">, locale: Locale) {
  const isZh = locale === "zh";
  const metric = chartMetricText(chart.yAxis ?? "", locale);
  if (chart.group === "core_trends") return isZh ? `${metric}是否在当前周期发生明显变化？` : `Is ${metric} changing materially in the current period?`;
  if (chart.group === "risk_quality") return isZh ? `${metric}是否暴露风险或质量变化？` : `Does ${metric} reveal a risk or quality change?`;
  if (chart.group === "structure") return isZh ? `哪些${chart.dimensionLabel ?? "分组"}贡献了主要${metric}？` : `Which ${chart.dimensionLabel ?? "groups"} contribute the most ${metric}?`;
  if (chart.group === "relationship") return isZh ? `两个关键指标之间是否存在风险或机会关系？` : "Is there a risk or opportunity relationship between key metrics?";
  if (chart.group === "monetization") return isZh ? `${metric}是否解释了收入或价格变化？` : `Does ${metric} explain revenue or pricing changes?`;
  return isZh ? `${metric}是否提供辅助诊断线索？` : `Does ${metric} provide supporting diagnostic context?`;
}

function finalizeChart(chart: ReportChartConfig, locale: Locale, signals: ChartRecommendationSignal[] = []): ReportChartConfig {
  const group = chart.group ?? chart.chartGroup ?? chartGroupFromConfig(chart);
  const linkedInsightIds = Array.from(new Set([...(chart.linkedInsightIds ?? []), ...chartLinkedInsightIds(chart, signals)]));
  const linkedMetricIds = Array.from(new Set([...(chart.linkedMetricIds ?? []), ...(chart.metricIds ?? [])]));
  const signalScore = chartSignalScore(chart, signals);

  return {
    ...chart,
    group,
    chartGroup: group,
    businessQuestion: chart.businessQuestion || chartBusinessQuestion({ ...chart, group }, locale),
    linkedInsightIds,
    linkedMetricIds,
    priority: Math.max(0, chart.priority - signalScore),
    insightHint: chart.insightHint || chartInsight({ ...chart, group, chartGroup: group, businessQuestion: chart.businessQuestion || "", linkedInsightIds, linkedMetricIds }, locale)
  };
}

function chartDedupeKey(chart: ReportChartConfig) {
  const metric = normalizeReportMetricText(chart.metricLabel ?? chart.yAxis ?? chart.title);
  const dimension = normalizeReportMetricText(chart.dimensionLabel ?? "");
  const question = normalizeReportMetricText(chart.businessQuestion);
  const xAxis = normalizeReportMetricText(chart.timeField ?? chart.xAxis ?? "");
  return [
    chart.chartType,
    chart.metricIds[0] ?? "",
    metric,
    dimension,
    xAxis,
    normalizeReportMetricText(chart.aggregationType ?? ""),
    question
  ].join("|");
}

function chartDisplayDedupeKeys(chart: ReportChartConfig) {
  const title = normalizeReportMetricText(chart.title);
  const metric = normalizeReportMetricText(chart.metricLabel ?? chart.yAxis ?? chart.title);
  const xAxis = normalizeReportMetricText(chart.timeField ?? chart.xAxis ?? "");
  const question = normalizeReportMetricText(chart.businessQuestion);
  const metricTrendKey = metric && xAxis ? `${chart.chartType}|metric-time|${metric}|${xAxis}` : "";
  const titleKey = title ? `${chart.chartType}|title|${title}` : "";
  const questionKey = question ? `${chart.chartType}|question|${question}` : "";

  return Array.from(new Set([titleKey, metricTrendKey, questionKey].filter(Boolean)));
}

function mergeChartText(left: string, right: string) {
  if (!right || left.includes(right)) return left;
  if (!left) return right;
  return `${left} ${right}`;
}

function dedupeCharts(charts: ReportChartConfig[], locale: Locale, signals: ChartRecommendationSignal[] = []) {
  const byKey = new Map<string, ReportChartConfig>();

  for (const rawChart of charts.map((chart) => finalizeChart(chart, locale, signals)).sort((left, right) => chartPriority(left) - chartPriority(right))) {
    const keys = [
      chartDedupeKey(rawChart),
      `${rawChart.chartType}|${normalizeReportMetricText(rawChart.yAxis ?? rawChart.title)}|${normalizeReportMetricText(rawChart.xAxis ?? rawChart.timeField ?? "")}`,
      `${rawChart.chartType}|${normalizeReportMetricText(rawChart.businessQuestion)}`
    ];
    const existingKey = keys.find((key) => byKey.has(key));

    if (!existingKey) {
      byKey.set(keys[0], rawChart);
      continue;
    }

    const existing = byKey.get(existingKey)!;
    const winner = chartPriority(rawChart) < chartPriority(existing) ? rawChart : existing;
    const loser = winner === rawChart ? existing : rawChart;
    byKey.delete(existingKey);
    byKey.set(chartDedupeKey(winner), {
      ...winner,
      insightHint: mergeChartText(winner.insightHint, loser.insightHint),
      linkedInsightIds: Array.from(new Set([...winner.linkedInsightIds, ...loser.linkedInsightIds])),
      linkedMetricIds: Array.from(new Set([...winner.linkedMetricIds, ...loser.linkedMetricIds])),
      caveats: Array.from(new Set([...(winner.caveats ?? []), ...(loser.caveats ?? [])]))
    });
  }

  return Array.from(byKey.values()).sort((left, right) => chartPriority(left) - chartPriority(right));
}

function reportMetricNumericRows(result: ReportMetricEvidenceResult, limit = 10, locale: Locale = "zh") {
  const isZh = locale === "zh";

  return (result.rows ?? [])
    .flatMap((row) => {
      const value = typeof row.value === "number" ? row.value : Number(row.value);
      if (!row.dimension || !Number.isFinite(value)) return [];
      if (isRatingReportMetric(result) && (value < 0 || value > 5)) return [];
      return [{
        label: row.dimension,
        value,
        secondaryValue: row.sampleSize ?? undefined,
        secondaryLabel: row.negativeCount != null
          ? (isZh
            ? `负向 ${formatReportMetricValue(row.negativeCount)} / 样本 ${formatReportMetricValue(row.sampleSize)}`
            : `Negative ${formatReportMetricValue(row.negativeCount)} / sample ${formatReportMetricValue(row.sampleSize)}`)
          : undefined,
        badge: row.sampleSize != null && row.sampleSize < 20 ? (isZh ? "小样本线索" : "Small sample lead") : undefined
      }];
    })
    .sort((left, right) => right.value - left.value)
    .slice(0, limit);
}

function isDateLikeDimension(value: string) {
  return /^\d{4}(-\d{1,2}){0,2}$/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value);
}

function metricNameIncludes(result: ReportMetricEvidenceResult, tokens: string[]) {
  const text = normalizeReportMetricText([
    result.metricName,
    result.displayName,
    result.formula,
    result.metricCategory,
    result.semanticRole
  ].filter(Boolean).join(" "));

  return tokens.some((token) => text.includes(normalizeReportMetricText(token)));
}

function buildSentimentDistributionChart(results: ReportMetricEvidenceResult[], locale: Locale = "zh"): ReportChartConfig | null {
  const isZh = locale === "zh";
  const positive = results.find((result) => metricNameIncludes(result, ["positive_sentiment_rate"]));
  const negative = results.find((result) => metricNameIncludes(result, ["negative_sentiment_rate"]));
  const neutral = results.find((result) => metricNameIncludes(result, ["neutral_sentiment_rate"]));
  const metrics = [positive, negative, neutral].filter(Boolean) as ReportMetricEvidenceResult[];
  const data = metrics.flatMap((result) => {
    const value = reportResultNumber(result);
    if (value == null || !Number.isFinite(value)) return [];
    const label = metricNameIncludes(result, ["positive"])
      ? (isZh ? "正向" : "Positive")
      : metricNameIncludes(result, ["negative"])
        ? (isZh ? "负向" : "Negative")
        : (isZh ? "中性" : "Neutral");
    return [{ label, value: Math.abs(value) <= 1 ? value * 100 : value }];
  });

  if (data.length < 2) return null;

  return {
    id: "sentiment-distribution",
    title: isZh ? "评论情绪构成" : "Sentiment distribution",
    chartType: "donut_chart",
    businessModule: isZh ? "用户反馈" : "Customer Feedback",
    description: isZh ? "展示正向、负向和中性反馈占比。" : "Shows the share of positive, negative, and neutral feedback.",
    insightHint: isZh ? "适合判断用户反馈结构，以及负向反馈是否达到关注阈值。" : "Use this to understand feedback mix and whether negative feedback reaches an attention threshold.",
    priority: 20,
    group: "risk_quality",
    chartGroup: "risk_quality",
    businessQuestion: isZh ? "当前评论情绪结构是否暴露体验风险？" : "Does the sentiment mix reveal an experience risk?",
    linkedInsightIds: [],
    linkedMetricIds: metrics.map((metric) => metric.metricId),
    displaySize: "medium",
    metricIds: metrics.map((metric) => metric.metricId),
    data
  };
}

function buildPaidDistributionChart(results: ReportMetricEvidenceResult[], locale: Locale = "zh"): ReportChartConfig | null {
  const isZh = locale === "zh";
  const paidRatio = results.find((result) => metricNameIncludes(result, ["paid_app_ratio", "paid_ratio"]));
  if (!paidRatio) return null;
  const value = reportResultNumber(paidRatio);

  if (value == null || !Number.isFinite(value) || value < 0) return null;

  const paidPercent = Math.abs(value) <= 1 ? value * 100 : value;
  if (paidPercent > 100) return null;

  return {
    id: "paid-free-distribution",
    title: isZh ? "免费 / 付费 App 构成" : "Free vs paid app mix",
    chartType: "donut_chart",
    businessModule: isZh ? "变现" : "Monetization",
    description: isZh ? "展示付费 App 占比和免费 App 占比。" : "Shows the share of paid and free apps.",
    insightHint: isZh ? "适合判断市场是否以免费下载、广告或内购模式为主。" : "Use this to see whether the market is dominated by free downloads, ads, or in-app monetization.",
    priority: 35,
    group: "monetization",
    chartGroup: "monetization",
    businessQuestion: isZh ? "免费和付费构成是否影响变现模式判断？" : "Does the free vs paid mix affect monetization interpretation?",
    linkedInsightIds: [],
    linkedMetricIds: [paidRatio.metricId],
    displaySize: "medium",
    metricIds: [paidRatio.metricId],
    data: [
      { label: isZh ? "付费" : "Paid", value: paidPercent },
      { label: isZh ? "免费" : "Free", value: Math.max(0, 100 - paidPercent) }
    ],
    caveats: isEstimatedReportMetric(paidRatio) ? [isZh ? "估算口径，仅作方向判断" : "Estimated definition; directional only"] : []
  };
}

function buildRankingCharts(results: ReportMetricEvidenceResult[], locale: Locale = "zh"): ReportChartConfig[] {
  const isZh = locale === "zh";

  return results
    .filter((result) => result.status === "computed")
    .filter((result) => reportMetricScope(result) !== "global" || Array.isArray(result.rows))
    .flatMap((result) => {
      const rows = reportMetricNumericRows(result, 10, locale);
      if (rows.length < 2 || rows.some((row) => isDateLikeDimension(row.label))) return [];

      const isRateOrQuality = metricNameIncludes(result, [
        "negative",
        "positive",
        "sentiment",
        "rating",
        "quality",
        "conversion",
        "refund",
        "churn"
      ]);
      const isCategoryScale = metricNameIncludes(result, ["category", "installs", "revenue", "orders", "volume", "reviews"]);
      const yAxis = chartMetricText(contextualMetricName(result.displayName || result.metricName, result.formula), locale);
      const aggregationType = inferChartAggregationType(`${result.metricName} ${result.displayName ?? ""} ${result.formula}`, isRateOrQuality ? "ranking_table" : "horizontal_bar_chart");
      const dimensionLabel = chartDimensionText(/\bBY\s+(.+)$/i.exec(result.formula)?.[1] ?? result.metricName, locale);
      const title = rankingChartTitle(result, locale, yAxis);
      const group = chartGroupFromConfig({ chartType: isRateOrQuality ? "ranking_table" : "horizontal_bar_chart", yAxis, title });
      const businessQuestion = chartBusinessQuestion({ chartType: isRateOrQuality ? "ranking_table" : "horizontal_bar_chart", yAxis, dimensionLabel, group }, locale);

      return [{
        id: `ranking-${result.metricId}`,
        title,
        chartType: isRateOrQuality ? "ranking_table" : "horizontal_bar_chart",
        businessModule: inferReportMetricBusinessModule(result, locale),
        description: isRateOrQuality
          ? (isZh ? "展示对象级质量或反馈排名。" : "Shows object-level quality or feedback rankings.")
          : (isZh ? "展示分组或对象的规模排名。" : "Shows scale rankings across groups or objects."),
        insightHint: rankingInsight({ data: rows, yAxis, dimensionLabel, aggregationType }, locale),
        priority: isCategoryScale ? 10 : 25,
        group,
        chartGroup: group,
        businessQuestion,
        linkedInsightIds: [],
        linkedMetricIds: [result.metricId],
        displaySize: isRateOrQuality ? "large" : "large",
        metricIds: [result.metricId],
        data: rows,
        yAxis,
        aggregationType,
        dimensionLabel,
        metricLabel: yAxis,
        caveats: reportMetricBadges(result, 4, locale).map((badge) => badge.label)
      } satisfies ReportChartConfig];
    })
    .slice(0, 4);
}

function buildTrendCharts(results: ReportMetricEvidenceResult[], locale: Locale = "zh"): ReportChartConfig[] {
  const isZh = locale === "zh";

  return results.flatMap((result) => {
    const rows = reportMetricNumericRows(result, 24, locale)
      .sort((left, right) => left.label.localeCompare(right.label));
    if (rows.length < 3 || !rows.every((row) => isDateLikeDimension(row.label))) return [];
    const yAxis = chartMetricText(contextualMetricName(result.displayName || result.metricName, result.formula), locale);
    if (!isValidTrendMetricName(result.metricName, result.metricCategory) || !isValidTrendSeries({
      metricName: result.metricName,
      metricCategory: result.metricCategory,
      yAxis,
      values: rows.map((row) => row.value)
    })) return [];
    if (hasInvalidRatingRange(yAxis, rows)) return [];
    const aggregationType = inferChartAggregationType(`${result.metricName} ${result.displayName ?? ""} ${result.formula}`, "line_chart");
    const incompletePeriod = isLatestBucketIncomplete(rows, aggregationType);
    const title = trendChartTitle(yAxis, locale);
    const group = chartGroupFromConfig({ chartType: "line_chart", yAxis, title });
    const businessQuestion = chartBusinessQuestion({ chartType: "line_chart", yAxis, group }, locale);
    const caveats = [
      ...(incompletePeriod ? [isZh ? "未完整周期" : "Incomplete period"] : []),
      ...(hasInvalidRatingRange(yAxis, rows) ? [isZh ? "评分范围异常" : "Invalid rating range"] : [])
    ];
    const chartBase = { data: rows, yAxis, aggregationType, incompletePeriod };

    return [{
      id: `trend-${result.metricId}`,
      title,
      chartType: "line_chart",
      businessModule: inferReportMetricBusinessModule(result, locale),
      description: isZh ? "基于时间字段展示指标变化。" : "Shows metric changes over business time.",
      insightHint: trendInsight(chartBase, locale),
      priority: 15,
      group,
      chartGroup: group,
      businessQuestion,
      linkedInsightIds: [],
      linkedMetricIds: [result.metricId],
      displaySize: "large",
      metricIds: [result.metricId],
      data: rows,
      xAxis: isZh ? "时间" : "Time",
      yAxis,
      aggregationType,
      metricLabel: yAxis,
      incompletePeriod,
      caveats
    } satisfies ReportChartConfig];
  }).slice(0, 2);
}

const reportTimeRangeOptions: Array<{ value: ReportTimeRange; label: string }> = [
  { value: "TODAY", label: "Today" },
  { value: "7D", label: "7D" },
  { value: "30D", label: "30D" },
  { value: "12M", label: "12M" },
  { value: "ALL", label: "All" },
  { value: "CUSTOM", label: "Custom" }
];

const reportTimeRangeDays: Partial<Record<ReportTimeRange, number>> = {
  "TODAY": 1,
  "7D": 7,
  "30D": 30,
  "90D": 90,
  "12M": 365
};

function reportTimeRangeLabel(range: ReportTimeRange, locale: Locale) {
  if (locale !== "zh") return reportTimeRangeOptions.find((option) => option.value === range)?.label ?? range;
  if (range === "TODAY") return "今天";
  if (range === "ALL") return "全部";
  if (range === "CUSTOM") return "自定义";
  return range;
}

function comparisonCurrentRangeLabel(range: ReportTimeRange, locale: Locale) {
  if (locale !== "zh") {
    if (range === "CUSTOM") return "Current range";
    if (range === "ALL") return "All-time scope";
    return `Last ${range === "12M" ? "12 months" : `${reportTimeRangeDays[range] ?? 30} days`}`;
  }

  if (range === "TODAY") return "今天";
  if (range === "7D") return "近 7 天";
  if (range === "30D") return "近 30 天";
  if (range === "90D") return "近 90 天";
  if (range === "12M") return "近 12 个月";
  if (range === "CUSTOM") return "当前区间";
  return "全周期口径";
}

function comparisonPreviousRangeLabel(range: ReportTimeRange, locale: Locale) {
  if (locale !== "zh") {
    if (range === "CUSTOM") return "previous equal-length range";
    if (range === "12M") return "previous 12 months";
    return `previous ${reportTimeRangeDays[range] ?? 30} days`;
  }

  if (range === "TODAY") return "前 1 天";
  if (range === "7D") return "前 7 天";
  if (range === "30D") return "前 30 天";
  if (range === "90D") return "前 90 天";
  if (range === "12M") return "前 12 个月";
  return "前一等长区间";
}

function formatComparisonDate(value?: string | null) {
  if (!value) return null;
  const date = parseReportTrendDate(value);
  return date ? formatDateOnly(date) : value.slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDateOnly(date: Date) {
  return formatDateOnly(date);
}

function previousRangeFromCurrent(currentStart?: string | null, currentEnd?: string | null) {
  const start = currentStart ? parseReportTrendDate(currentStart) : null;
  const end = currentEnd ? parseReportTrendDate(currentEnd) : null;

  if (!start || !end || start.getTime() > end.getTime()) {
    return { previousStartDate: null, previousEndDate: null };
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  const durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -durationDays + 1);

  return {
    previousStartDate: isoDateOnly(previousStart),
    previousEndDate: isoDateOnly(previousEnd)
  };
}

function signedComparisonPercent(value: number, locale: Locale) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  })}%`;
}

function metricDirectionFromText(metricName: string, metricCategory?: string | null): MetricDirection {
  const text = normalizeReportMetricText(`${metricName} ${metricCategory ?? ""}`);

  if (/(cac|cost|refund|return|churn|cancel|negative|complaint|defect|error|failure|latency|delay|risk|loss|bad_debt|chargeback|unsubscribe|bounce)/.test(text)) {
    return "lower_is_better";
  }

  if (/(neutral|estimate|estimated|diagnostic|ratio_unknown)/.test(text)) {
    return "neutral";
  }

  return "higher_is_better";
}

function comparisonToneClass(changePercent: number | null | undefined, metricDirection: MetricDirection) {
  if (changePercent == null || !Number.isFinite(changePercent) || metricDirection === "neutral" || Math.abs(changePercent) < 0.0001) {
    return "text-slate-600";
  }

  const improved = metricDirection === "higher_is_better" ? changePercent > 0 : changePercent < 0;
  return improved ? "text-emerald-700" : "text-rose-700";
}

type MetricComparisonDisplay = {
  currentRangeLabel: string;
  previousRangeLabel?: string;
  currentStartDate?: string | null;
  currentEndDate?: string | null;
  previousStartDate?: string | null;
  previousEndDate?: string | null;
  changePercent?: number | null;
  changeDirection: "up" | "down" | "flat" | "unknown";
  metricDirection: MetricDirection;
  displayText: string;
  deltaText?: string;
  tooltipText: string;
  toneClass: string;
  hasComparablePeriod: boolean;
};

function buildMetricComparisonDisplay({
  range,
  locale,
  hasTimeField,
  changePercent,
  currentStartDate,
  currentEndDate,
  previousStartDate,
  previousEndDate,
  metricDirection,
  displayText,
  tooltipText
}: {
  range: ReportTimeRange;
  locale: Locale;
  hasTimeField: boolean;
  changePercent?: number | null;
  currentStartDate?: string | null;
  currentEndDate?: string | null;
  previousStartDate?: string | null;
  previousEndDate?: string | null;
  metricDirection: MetricDirection;
  displayText?: string | null;
  tooltipText?: string | null;
}): MetricComparisonDisplay {
  const isZh = locale === "zh";
  const currentRangeLabel = comparisonCurrentRangeLabel(range, locale);
  const previousRangeLabel = comparisonPreviousRangeLabel(range, locale);
  const normalizedCurrentStart = formatComparisonDate(currentStartDate);
  const normalizedCurrentEnd = formatComparisonDate(currentEndDate);
  const inferredPreviousRange = previousRangeFromCurrent(normalizedCurrentStart, normalizedCurrentEnd);
  const normalizedPreviousStart = formatComparisonDate(previousStartDate) ?? inferredPreviousRange.previousStartDate;
  const normalizedPreviousEnd = formatComparisonDate(previousEndDate) ?? inferredPreviousRange.previousEndDate;
  const hasComparablePeriod = range !== "ALL" && changePercent != null && Number.isFinite(changePercent);
  const changeDirection = changePercent == null || !Number.isFinite(changePercent)
    ? "unknown"
    : Math.abs(changePercent) < 0.0001
      ? "flat"
      : changePercent > 0
        ? "up"
        : "down";

  if (!hasTimeField) {
    return {
      currentRangeLabel: isZh ? "全周期口径" : "All-time scope",
      changeDirection: "unknown",
      metricDirection,
      displayText: isZh ? "全周期口径" : "All-time scope",
      tooltipText: isZh ? "当前数据缺少时间字段，无法生成周期对比。" : "The current data does not include a time field, so period comparison cannot be generated.",
      toneClass: "text-slate-600",
      hasComparablePeriod: false
    };
  }

  if (range === "ALL") {
    return {
      currentRangeLabel,
      changeDirection: "unknown",
      metricDirection,
      displayText: isZh ? "全周期口径" : "All-time scope",
      tooltipText: tooltipText ?? (isZh ? "全周期口径。" : "All-time scope."),
      toneClass: "text-slate-600",
      hasComparablePeriod: false
    };
  }

  if (!hasComparablePeriod) {
    return {
      currentRangeLabel,
      previousRangeLabel,
      currentStartDate: normalizedCurrentStart,
      currentEndDate: normalizedCurrentEnd,
      previousStartDate: normalizedPreviousStart,
      previousEndDate: normalizedPreviousEnd,
      changePercent: null,
      changeDirection: "unknown",
      metricDirection,
      displayText: isZh ? "暂无可比周期" : "No comparable period",
      tooltipText: tooltipText ?? (isZh
        ? "当前指标暂无可用的前一对比周期。"
        : "No previous comparison period is available for this metric."),
      toneClass: "text-slate-600",
      hasComparablePeriod: false
    };
  }

  const percentText = signedComparisonPercent(changePercent, locale);
  const computedDisplayText = isZh
    ? `${currentRangeLabel}较${previousRangeLabel} ${percentText}`
    : `${currentRangeLabel} vs ${previousRangeLabel} ${percentText}`;
  const computedTooltipText = normalizedCurrentStart && normalizedCurrentEnd && normalizedPreviousStart && normalizedPreviousEnd
    ? (isZh
      ? `当前区间：${normalizedCurrentStart} 至 ${normalizedCurrentEnd}；对比区间：${normalizedPreviousStart} 至 ${normalizedPreviousEnd}。`
      : `Current range: ${normalizedCurrentStart} to ${normalizedCurrentEnd}; comparison range: ${normalizedPreviousStart} to ${normalizedPreviousEnd}.`)
    : (isZh ? "当前指标使用前一等长区间进行对比。" : "This metric is compared with the previous equal-length period.");

  return {
    currentRangeLabel,
    previousRangeLabel,
    currentStartDate: normalizedCurrentStart,
    currentEndDate: normalizedCurrentEnd,
    previousStartDate: normalizedPreviousStart,
    previousEndDate: normalizedPreviousEnd,
    changePercent,
    changeDirection,
    metricDirection,
    displayText: displayText ?? computedDisplayText,
    deltaText: isZh ? `较${previousRangeLabel} ${percentText}` : `vs ${previousRangeLabel} ${percentText}`,
    tooltipText: tooltipText ?? computedTooltipText,
    toneClass: comparisonToneClass(changePercent, metricDirection),
    hasComparablePeriod: true
  };
}

function reportDateRangeQuery(range: SelectedReportDateRange) {
  const params = new URLSearchParams({ dateRangePreset: range.preset });

  if (range.startDate) params.set("startDate", range.startDate);
  if (range.endDate) params.set("endDate", range.endDate);
  if (range.previousStartDate) params.set("previousStartDate", range.previousStartDate);
  if (range.previousEndDate) params.set("previousEndDate", range.previousEndDate);

  return params.toString();
}

function parseReportTrendDate(value: string) {
  const normalized = /^\d{4}$/.test(value) ? `${value}-01-01` : /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
  const date = new Date(normalized);

  return Number.isFinite(date.getTime()) ? date : null;
}

function filterReportTrendSeries(
  series: Array<{ date: string; value: number | null }> = [],
  selectedRange: ReportTimeRange
) {
  const valid = series.filter((row) => row.value != null && parseReportTrendDate(row.date));

  if (selectedRange === "ALL" || selectedRange === "CUSTOM") return valid;

  const days = reportTimeRangeDays[selectedRange];
  const latest = valid.map((row) => parseReportTrendDate(row.date)).filter((date): date is Date => Boolean(date)).sort((left, right) => right.getTime() - left.getTime())[0];

  if (!days || !latest) return valid;

  const cutoff = new Date(latest);
  cutoff.setDate(latest.getDate() - days);

  return valid.filter((row) => {
    const date = parseReportTrendDate(row.date);
    return date ? date >= cutoff : false;
  });
}

function trendChartDataFromMetric(metric: ReportTrendMetricViewData, selectedRange: ReportTimeRange): ReportChartDatum[] {
  return filterReportTrendSeries(metric.timeSeries ?? [], selectedRange).map((row) => ({
    label: row.date,
    value: Number(row.value)
  })).filter((row) => Number.isFinite(row.value));
}

function trendDirectionFromValues(currentValue: number | null, previousValue: number | null): ReportTrendMetricViewData["trendDirection"] {
  if (currentValue == null || previousValue == null || previousValue === 0) return "unknown";
  const percentChange = (currentValue - previousValue) / Math.abs(previousValue);

  if (Math.abs(percentChange) < 0.01) return "flat";
  return percentChange > 0 ? "up" : "down";
}

function trendMetricsForSelectedRange(
  trendMetrics: ReportTrendMetricViewData[] = [],
  selectedRange: ReportTimeRange
): ReportTrendMetricViewData[] {
  return trendMetrics.map((metric) => {
    const allSeries = (metric.timeSeries ?? [])
      .map((row) => ({ ...row, dateValue: parseReportTrendDate(row.date) }))
      .filter((row): row is { date: string; value: number; dateValue: Date } =>
        row.value != null && Number.isFinite(row.value) && Boolean(row.dateValue)
      )
      .sort((left, right) => left.dateValue.getTime() - right.dateValue.getTime());
    const series = selectedRange === "ALL" || selectedRange === "CUSTOM"
      ? allSeries
      : filterReportTrendSeries(metric.timeSeries ?? [], selectedRange)
        .map((row) => ({ ...row, dateValue: parseReportTrendDate(row.date) }))
        .filter((row): row is { date: string; value: number; dateValue: Date } =>
          row.value != null && Number.isFinite(row.value) && Boolean(row.dateValue)
        )
        .sort((left, right) => left.dateValue.getTime() - right.dateValue.getTime());
    const latestDate = allSeries.at(-1)?.dateValue ?? null;
    const metricDirection = metric.metricDirection ?? metricDirectionFromText(metric.metricName, metric.businessModule);

    const currentRange = (() => {
      if (!latestDate || selectedRange === "ALL" || selectedRange === "CUSTOM") return null;
      const days = reportTimeRangeDays[selectedRange];
      if (!days) return null;
      const currentEnd = new Date(latestDate);
      currentEnd.setHours(23, 59, 59, 999);
      const currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() - days + 1);
      currentStart.setHours(0, 0, 0, 0);
      const previousEnd = new Date(currentStart.getTime() - 1);
      const previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - days + 1);
      previousStart.setHours(0, 0, 0, 0);
      return { currentStart, currentEnd, previousStart, previousEnd };
    })();

    if (series.length === 0) {
      return {
        ...metric,
        currentValue: null,
        previousValue: null,
        absoluteChange: null,
        percentChange: null,
        trendDirection: "unknown",
        changeDirection: "unknown",
        metricDirection,
        timeSeries: []
      };
    }

    if (series.length === 1) {
      return {
        ...metric,
        currentValue: series[0].value,
        previousValue: null,
        absoluteChange: null,
        percentChange: null,
        trendDirection: "unknown",
        changeDirection: "unknown",
        metricDirection,
        timeSeries: series.map((row) => ({ date: row.date, value: row.value }))
      };
    }

    const currentSeries = currentRange
      ? allSeries.filter((row) => row.dateValue >= currentRange.currentStart && row.dateValue <= currentRange.currentEnd)
      : series;
    const previousSeries = currentRange
      ? allSeries.filter((row) => row.dateValue >= currentRange.previousStart && row.dateValue <= currentRange.previousEnd)
      : [];
    const currentValue = currentSeries.at(-1)?.value ?? series.at(-1)!.value;
    const previousValue = previousSeries.at(-1)?.value ?? (currentRange ? null : series[0].value);
    const absoluteChange = previousValue != null ? currentValue - previousValue : null;
    const percentChange = absoluteChange != null && previousValue ? absoluteChange / Math.abs(previousValue) : null;
    const currentStartDate = currentRange ? isoDateOnly(currentRange.currentStart) : series[0].date;
    const currentEndDate = currentRange ? isoDateOnly(currentRange.currentEnd) : series.at(-1)!.date;
    const previousStartDate = currentRange ? isoDateOnly(currentRange.previousStart) : null;
    const previousEndDate = currentRange ? isoDateOnly(currentRange.previousEnd) : null;
    const comparison = buildMetricComparisonDisplay({
      range: selectedRange,
      locale: "zh",
      hasTimeField: true,
      changePercent: percentChange,
      currentStartDate,
      currentEndDate,
      previousStartDate,
      previousEndDate,
      metricDirection
    });

    return {
      ...metric,
      currentValue,
      previousValue,
      absoluteChange,
      percentChange,
      currentRangeLabel: comparison.currentRangeLabel,
      previousRangeLabel: comparison.previousRangeLabel,
      currentStartDate,
      currentEndDate,
      previousStartDate,
      previousEndDate,
      changePercent: percentChange,
      changeDirection: comparison.changeDirection,
      metricDirection,
      displayText: comparison.displayText,
      tooltipText: comparison.tooltipText,
      trendDirection: trendDirectionFromValues(currentValue, previousValue),
      timeSeries: series.map((row) => ({ date: row.date, value: row.value }))
    };
  });
}

function trendMetricForReportMetric(result: ReportMetricEvidenceResult, trendMetrics: ReportTrendMetricViewData[] = []) {
  const resultText = normalizeReportMetricText([
    result.metricName,
    result.displayName,
    result.formula
  ].filter(Boolean).join(" "));

  return trendMetrics.find((metric) => {
    const metricText = normalizeReportMetricText(metric.metricName);
    return metricText.length > 2 && (resultText.includes(metricText) || metricText.includes(resultText));
  }) ?? null;
}

function reportTrendChartsFromPayload(
  trendMetrics: ReportTrendMetricViewData[] = [],
  trendCharts: ReportTrendChartViewData[] = [],
  selectedRange: ReportTimeRange,
  locale: Locale = "zh"
): ReportChartConfig[] {
  const isZh = locale === "zh";
  const metricCharts = trendMetrics.flatMap((metric, index) => {
    const data = trendChartDataFromMetric(metric, selectedRange);
    if (data.length < 2) return [];
    const metricLabel = contextualMetricName(metric.metricName, metric.metricName);
    if (!isValidTrendMetricName(metric.metricName) || !isValidTrendSeries({
      metricName: metric.metricName,
      yAxis: metricLabel,
      values: data.map((row) => row.value)
    })) return [];
    const yAxis = chartMetricText(metricLabel, locale);
    if (hasInvalidRatingRange(yAxis, data)) return [];
    const isVolume = /volume|orders|reviews|installs|tickets|records/i.test(metric.metricName);
    const aggregationType = inferChartAggregationType(metric.metricName, isVolume ? "bar_chart" : "line_chart");
    const incompletePeriod = isLatestBucketIncomplete(data, aggregationType);
    const title = trendChartTitle(yAxis, locale);
    const group = chartGroupFromConfig({ chartType: isVolume ? "bar_chart" : "line_chart", yAxis, title });
    const businessQuestion = chartBusinessQuestion({ chartType: isVolume ? "bar_chart" : "line_chart", yAxis, group }, locale);
    const caveats = incompletePeriod ? [isZh ? "未完整周期" : "Incomplete period"] : [];
    const chartBase = { data, yAxis, aggregationType, incompletePeriod };

    return [{
      id: `payload-trend-${metric.metricName}-${index}`,
      title,
      chartType: isVolume ? "bar_chart" : "line_chart",
      businessModule: metric.businessModule ?? (isZh ? "趋势分析" : "Trend Analysis"),
      description: isZh
        ? `按 ${metric.dateField ?? "业务时间"} 查看指标变化。`
        : `Shows changes by ${metric.dateField ?? "business time"}.`,
      insightHint: trendInsight(chartBase, locale),
      priority: index,
      group,
      chartGroup: group,
      businessQuestion,
      linkedInsightIds: [],
      linkedMetricIds: [metric.metricName],
      displaySize: "large",
      metricIds: [],
      data,
      xAxis: isZh ? "时间" : "Time",
      yAxis,
      aggregationType,
      metricLabel: yAxis,
      timeField: metric.dateField,
      incompletePeriod,
      caveats,
      debugNote: metric.businessModule ? `${isZh ? "业务类型" : "Business type"}：${metric.businessModule}` : undefined
    } satisfies ReportChartConfig];
  });

  if (metricCharts.length) return metricCharts.slice(0, 4);

  return trendCharts.flatMap((chart, index) => {
    const data = filterReportTrendSeries(chart.series ?? [], selectedRange).map((row) => ({
      label: row.date,
      value: Number(row.value)
    })).filter((row) => Number.isFinite(row.value));
    if (data.length < 2) return [];
    if (!isValidTrendMetricName(chart.yAxis ?? chart.title) || !isValidTrendSeries({
      metricName: chart.yAxis ?? chart.title,
      yAxis: chart.yAxis ?? chart.title,
      values: data.map((row) => row.value)
    })) return [];
    const yAxis = chartMetricText(chart.yAxis ?? chart.title, locale);
    if (hasInvalidRatingRange(yAxis, data)) return [];
    const aggregationType = inferChartAggregationType(chart.yAxis ?? chart.title, chart.chartType === "bar_chart" ? "bar_chart" : "line_chart");
    const incompletePeriod = isLatestBucketIncomplete(data, aggregationType);
    const title = trendChartTitle(yAxis, locale);
    const group = chartGroupFromConfig({ chartType: chart.chartType === "bar_chart" ? "bar_chart" : "line_chart", yAxis, title });
    const businessQuestion = chartBusinessQuestion({ chartType: chart.chartType === "bar_chart" ? "bar_chart" : "line_chart", yAxis, group }, locale);
    const caveats = incompletePeriod ? [isZh ? "未完整周期" : "Incomplete period"] : [];
    const chartBase = { data, yAxis, aggregationType, incompletePeriod };

    return [{
      id: `payload-trend-chart-${index}`,
      title,
      chartType: chart.chartType === "bar_chart" ? "bar_chart" : "line_chart",
      businessModule: isZh ? "趋势分析" : "Trend Analysis",
      description: chart.description ?? (isZh ? "按业务时间字段展示指标变化。" : "Shows metric changes by business time."),
      insightHint: trendInsight(chartBase, locale),
      priority: index,
      group,
      chartGroup: group,
      businessQuestion,
      linkedInsightIds: [],
      linkedMetricIds: [chart.yAxis ?? chart.title],
      displaySize: "large",
      metricIds: [],
      data,
      xAxis: chart.xAxis ?? (isZh ? "时间" : "Time"),
      yAxis,
      aggregationType,
      metricLabel: yAxis,
      timeField: chart.xAxis,
      incompletePeriod,
      caveats,
      debugNote: chart.yAxis ? `${isZh ? "原始字段" : "Raw field"}：${chart.yAxis}` : undefined
    } satisfies ReportChartConfig];
  }).slice(0, 4);
}

function buildScatterChart(results: ReportMetricEvidenceResult[], locale: Locale = "zh"): ReportChartConfig | null {
  const isZh = locale === "zh";
  const scaleMetric = results.find((result) =>
    Array.isArray(result.rows) &&
    metricNameIncludes(result, ["installs", "reviews", "revenue", "orders", "volume", "usage"])
  );
  const qualityMetric = results.find((result) =>
    Array.isArray(result.rows) &&
    result.metricId !== scaleMetric?.metricId &&
    metricNameIncludes(result, ["rating", "sentiment", "conversion", "quality", "negative"])
  );

  if (!scaleMetric || !qualityMetric) return null;

  const qualityByLabel = new Map(reportMetricNumericRows(qualityMetric, 50, locale).map((row) => [row.label, row.value]));
  const data = reportMetricNumericRows(scaleMetric, 50, locale)
    .flatMap((row) => {
      const qualityValue = qualityByLabel.get(row.label);
      if (qualityValue == null) return [];
      return [{
        label: row.label,
        value: row.value,
        secondaryValue: qualityValue,
        secondaryLabel: contextualMetricName(qualityMetric.displayName || qualityMetric.metricName, qualityMetric.formula)
      }];
    })
    .slice(0, 20);

  if (data.length < 3) return null;

  return {
    id: `scatter-${scaleMetric.metricId}-${qualityMetric.metricId}`,
    title: isZh ? "规模与质量关系" : "Scale vs quality relationship",
    chartType: "scatter_plot",
    businessModule: isZh ? "风险与机会" : "Risks & Opportunities",
    description: isZh ? "把规模指标和质量指标放在一起，识别高规模低质量或高质量低规模对象。" : "Compares scale and quality to surface high-scale low-quality or high-quality low-scale objects.",
    insightHint: isZh ? "右下区域通常代表需要排查的高规模低质量对象，左上区域可作为增长候选。" : "Lower-quality high-scale objects need review; higher-quality lower-scale objects can become growth candidates.",
    priority: 18,
    group: "relationship",
    chartGroup: "relationship",
    businessQuestion: isZh ? "规模增长是否伴随质量风险或机会？" : "Does scale growth come with quality risks or opportunities?",
    linkedInsightIds: [],
    linkedMetricIds: [scaleMetric.metricId, qualityMetric.metricId],
    displaySize: "large",
    metricIds: [scaleMetric.metricId, qualityMetric.metricId],
    data,
    xAxis: chartMetricText(contextualMetricName(scaleMetric.displayName || scaleMetric.metricName, scaleMetric.formula), locale),
    yAxis: chartMetricText(contextualMetricName(qualityMetric.displayName || qualityMetric.metricName, qualityMetric.formula), locale)
  };
}

function recommendReportCharts(
  results: ReportMetricEvidenceResult[],
  locale: Locale = "zh",
  context: ChartRecommendationContext = {}
) {
  const signals = [
    ...(context.keyFindings ?? []),
    ...(context.businessRisks ?? []),
    ...(context.growthOpportunities ?? []),
    ...(context.nextActions ?? [])
  ];
  const computed = results
    .filter((result) => result.status === "computed")
    .filter(hasDisplayableMetricResult)
    .filter(isNonInternalReportMetricResult);
  const charts = [
    ...buildRankingCharts(computed, locale),
    ...buildTrendCharts(computed, locale),
    buildSentimentDistributionChart(computed, locale),
    buildPaidDistributionChart(computed, locale),
    buildScatterChart(computed, locale)
  ].filter(Boolean) as ReportChartConfig[];
  const byId = new Map<string, ReportChartConfig>();

  for (const chart of dedupeCharts(charts, locale, signals)) {
    if (!byId.has(chart.id)) byId.set(chart.id, chart);
  }

  return Array.from(byId.values());
}

function matchesReportMetricStatusFilter(result: ReportMetricEvidenceResult, filter: ReportMetricStatusFilter) {
  if (filter === "all") return true;
  if (filter === "verified") return result.status === "computed" || result.validationStatus === "passed";
  if (filter === "estimated") return isEstimatedReportMetric(result);
  if (filter === "dedup") return requiresDedupedReportMetric(result);
  if (filter === "smallSample") return isSmallSampleReportMetric(result);
  if (filter === "limited") return hasLimitedReportMetricScope(result);
  if (filter === "failed") return result.status === "failed";
  return true;
}

function matchesReportMetricTypeFilter(result: ReportMetricEvidenceResult, filter: ReportMetricTypeFilter) {
  return filter === "all" || reportMetricDisplayType(result) === filter;
}

function ReportChartTooltip({
  active,
  payload,
  label,
  chart,
  locale = "zh"
}: {
  active?: boolean;
  payload?: Array<{ value?: unknown; name?: string; payload?: ReportChartDatum }>;
  label?: string;
  chart?: ReportChartConfig;
  locale?: Locale;
}) {
  const isZh = locale === "zh";
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;

  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-slate-950">{datum?.label ?? label}</p>
      {payload.map((entry) => (
        <p key={`${entry.name}-${entry.value}`} className="mt-1 text-muted-foreground">
          {entry.name ?? (isZh ? "数值" : "Value")}：{formatReportMetricValue(entry.value)}
        </p>
      ))}
      {chart?.dimensionLabel ? (
        <p className="mt-1 text-muted-foreground">{isZh ? "维度" : "Dimension"}：{chart.dimensionLabel}</p>
      ) : null}
      {chart?.metricLabel || chart?.yAxis ? (
        <p className="mt-1 text-muted-foreground">{isZh ? "指标" : "Metric"}：{chart.metricLabel ?? chart.yAxis}</p>
      ) : null}
      {chart?.aggregationType ? (
        <p className="mt-1 text-muted-foreground">{isZh ? "聚合" : "Aggregation"}：{chart.aggregationType}</p>
      ) : null}
      {datum?.secondaryLabel && datum.secondaryValue != null ? (
        <p className="mt-1 text-muted-foreground">
          {datum.secondaryLabel}：{formatReportMetricValue(datum.secondaryValue)}
        </p>
      ) : null}
    </div>
  );
}

function reportHorizontalAxisLabel(value: unknown) {
  const label = String(value ?? "");

  return label.length > 26 ? `${label.slice(0, 23)}...` : label;
}

function reportHorizontalAxisWidth(data: ReportChartDatum[]) {
  const maxLabelLength = data.reduce((max, row) => Math.max(max, reportHorizontalAxisLabel(row.label).length), 0);

  return Math.min(280, Math.max(168, maxLabelLength * 8 + 36));
}

function ReportHorizontalBarChart({ chart, locale = "zh" }: { chart: ReportChartConfig; locale?: Locale }) {
  const axisWidth = reportHorizontalAxisWidth(chart.data);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chart.data} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 18 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" tickFormatter={(value) => formatReportMetricValue(value)} />
          <YAxis
            dataKey="label"
            type="category"
            width={axisWidth}
            tick={{ fontSize: 11 }}
            tickLine={false}
            tickFormatter={reportHorizontalAxisLabel}
          />
          <Tooltip content={<ReportChartTooltip chart={chart} locale={locale} />} />
          <Bar dataKey="value" name={chart.yAxis ?? (locale === "zh" ? "数值" : "Value")} radius={[0, 6, 6, 0]} fill="#047857" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReportLineChart({ chart, locale = "zh" }: { chart: ReportChartConfig; locale?: Locale }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chart.data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id={`chart-fill-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#047857" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#047857" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis tickFormatter={(value) => formatReportMetricValue(value)} tick={{ fontSize: 11 }} tickLine={false} />
          <Tooltip content={<ReportChartTooltip chart={chart} locale={locale} />} />
          <Area type="monotone" dataKey="value" name={chart.yAxis ?? (locale === "zh" ? "数值" : "Value")} stroke="#047857" fill={`url(#chart-fill-${chart.id})`} strokeWidth={2} />
          <Line type="monotone" dataKey="value" stroke="#047857" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReportBarTrendChart({ chart, locale = "zh" }: { chart: ReportChartConfig; locale?: Locale }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chart.data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis tickFormatter={(value) => formatReportMetricValue(value)} tick={{ fontSize: 11 }} tickLine={false} />
          <Tooltip content={<ReportChartTooltip chart={chart} locale={locale} />} />
          <Bar dataKey="value" name={chart.yAxis ?? (locale === "zh" ? "数值" : "Value")} radius={[6, 6, 0, 0]} fill="#047857" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReportDonutChart({ chart, locale = "zh" }: { chart: ReportChartConfig; locale?: Locale }) {
  return (
    <div className="grid gap-3">
      <div className="mx-auto h-52 w-full max-w-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Pie data={chart.data} dataKey="value" nameKey="label" innerRadius={52} outerRadius={76} paddingAngle={3}>
              {chart.data.map((entry, index) => (
                <Cell key={entry.label} fill={reportChartColors[index % reportChartColors.length]} />
              ))}
            </Pie>
            <Tooltip content={<ReportChartTooltip chart={chart} locale={locale} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-2">
        {chart.data.map((entry, index) => (
          <div
            key={entry.label}
            className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-secondary/30 px-3 py-2 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: reportChartColors[index % reportChartColors.length] }}
              />
              <span className="min-w-0 truncate text-muted-foreground">
                {entry.label}
              </span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{formatReportMetricValue(entry.value)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportScatterChart({ chart, locale = "zh" }: { chart: ReportChartConfig; locale?: Locale }) {
  const isZh = locale === "zh";
  const data = chart.data.map((entry) => ({
    label: entry.label,
    x: entry.value,
    y: entry.secondaryValue ?? 0
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 16, bottom: 16, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            name={chart.xAxis ?? (isZh ? "规模" : "Scale")}
            tickFormatter={(value) => formatReportMetricValue(value)}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={chart.yAxis ?? (isZh ? "质量" : "Quality")}
            tickFormatter={(value) => formatReportMetricValue(value)}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const datum = payload[0]?.payload as { label?: string; x?: number; y?: number };
              return (
                <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-sm">
                  <p className="font-semibold text-slate-950">{datum.label}</p>
                  <p className="mt-1 text-muted-foreground">{chart.xAxis}：{formatReportMetricValue(datum.x)}</p>
                  <p className="mt-1 text-muted-foreground">{chart.yAxis}：{formatReportMetricValue(datum.y)}</p>
                </div>
              );
            }}
          />
          <Scatter data={data} fill="#047857" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReportRankingTable({ chart, locale = "zh" }: { chart: ReportChartConfig; locale?: Locale }) {
  const isZh = locale === "zh";
  const hasSampleColumn = chart.data.some((row) => row.secondaryValue != null || row.badge);

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-secondary text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{isZh ? "对象" : "Object"}</th>
              <th className="px-3 py-2 text-right font-medium">{isZh ? "数值" : "Value"}</th>
              {hasSampleColumn ? <th className="px-3 py-2 text-right font-medium">{isZh ? "样本" : "Sample"}</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {chart.data.slice(0, 10).map((row, index) => (
              <tr key={`${row.label}-${index}`}>
                <td className="px-3 py-2 font-medium">{row.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <div className="flex flex-col items-end gap-1">
                    <span>{formatReportMetricValue(row.value)}</span>
                    {row.badge ? (
                      <Badge variant="secondary" className="text-[10px] text-amber-700">
                        {row.badge}
                      </Badge>
                    ) : null}
                  </div>
                </td>
                {hasSampleColumn ? (
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                    {row.secondaryLabel ?? (row.secondaryValue != null ? formatReportMetricValue(row.secondaryValue) : "-")}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportChartCard({ chart, locale = "zh" }: { chart: ReportChartConfig; locale?: Locale }) {
  const title = locale === "zh" ? chart.title : localizedMetricName(localizedReportChartText(chart.title, locale), locale);
  const groupLabel = chartGroupLabel(chart.group, locale);
  const description = localizedReportChartText(chart.description, locale);
  const insightHint = localizedReportChartText(chartInsight(chart, locale), locale);
  const caveats = chart.caveats?.map((caveat) => localizedReportChartText(caveat, locale));

  return (
    <div className={cn(
      "rounded-xl border bg-white p-4 shadow-sm",
      chart.displaySize === "large" && "lg:col-span-2",
      chart.displaySize === "full_width" && "lg:col-span-3"
    )}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            <Badge variant="secondary" className="text-[11px] text-emerald-700">
              {groupLabel}
            </Badge>
            {chart.incompletePeriod ? (
              <Badge variant="secondary" className="text-[11px] text-amber-700">
                {locale === "zh" ? "未完整周期" : "Incomplete period"}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {chart.chartType === "horizontal_bar_chart" ? <ReportHorizontalBarChart chart={chart} locale={locale} /> : null}
      {chart.chartType === "bar_chart" ? <ReportBarTrendChart chart={chart} locale={locale} /> : null}
      {chart.chartType === "line_chart" ? <ReportLineChart chart={chart} locale={locale} /> : null}
      {chart.chartType === "donut_chart" ? <ReportDonutChart chart={chart} locale={locale} /> : null}
      {chart.chartType === "scatter_plot" ? <ReportScatterChart chart={chart} locale={locale} /> : null}
      {chart.chartType === "ranking_table" ? <ReportRankingTable chart={chart} locale={locale} /> : null}
      <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
        {insightHint}
      </p>
      {caveats?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {caveats.slice(0, 3).map((caveat) => (
            <Badge key={caveat} variant="secondary" className="text-[11px] text-amber-700">
              {caveat}
            </Badge>
          ))}
        </div>
      ) : null}
      {chart.debugNote ? (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">{locale === "zh" ? "查看口径" : "View definition"}</summary>
          <p className="mt-1">{chart.debugNote}</p>
        </details>
      ) : null}
    </div>
  );
}

function ReportChartGroupSection({
  group,
  charts,
  locale
}: {
  group: ReportChartGroup;
  charts: ReportChartConfig[];
  locale: Locale;
}) {
  if (!charts.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">{chartGroupLabel(group, locale)}</h3>
          <p className="text-xs text-muted-foreground">{chartGroupDescription(group, locale)}</p>
        </div>
        <Badge variant="secondary">{locale === "zh" ? `${charts.length} 张` : `${charts.length} charts`}</Badge>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {charts.map((chart) => (
          <ReportChartCard key={chart.id} chart={chart} locale={locale} />
        ))}
      </div>
    </section>
  );
}

function chartSections(charts: ReportChartConfig[]) {
  return (["core_trends", "risk_quality", "structure", "relationship", "monetization", "auxiliary"] as ReportChartGroup[])
    .map((group) => ({
      group,
      charts: charts
        .filter((chart) => chart.group === group)
        .sort((left, right) => chartPriority(left) - chartPriority(right))
    }));
}

function ReportRecommendedCharts({ charts, locale = "zh" }: { charts: ReportChartConfig[]; locale?: Locale }) {
  const isZh = locale === "zh";

  if (!charts.length) return null;
  const sortedCharts = [...charts].sort((left, right) => chartPriority(left) - chartPriority(right));
  const visibleCharts = sortedCharts.slice(0, 5);
  const hiddenCharts = sortedCharts.slice(5);
  const grouped = chartSections(visibleCharts);
  const hiddenGrouped = chartSections(hiddenCharts);

  return (
    <div className="rounded-xl border bg-secondary/10 p-3">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            {isZh
              ? "基于当前数据生成的关键可视化，帮助快速查看趋势、结构、排名和异常对象"
              : "Key visualizations generated from the current data to help review trends, structure, rankings, and outlier objects"}
          </p>
        </div>
        <Badge variant="secondary">{isZh ? `${charts.length} 个图表` : `${charts.length} charts`}</Badge>
      </div>
      <div className="space-y-5">
        {grouped.map(({ group, charts: groupCharts }) => (
          <ReportChartGroupSection key={group} group={group} charts={groupCharts} locale={locale} />
        ))}
        {hiddenCharts.length ? (
          <details className="rounded-xl border bg-white p-3">
            <summary className="cursor-pointer text-sm font-medium">{isZh ? `查看更多图表（${hiddenCharts.length}）` : `View more charts (${hiddenCharts.length})`}</summary>
            <div className="mt-4 space-y-5">
              {hiddenGrouped.map(({ group, charts: groupCharts }) => (
                <ReportChartGroupSection key={group} group={group} charts={groupCharts} locale={locale} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function ReportTrendAnalysisSection({
  timeConfig,
  trendMetrics,
  trendCharts,
  selectedRange,
  onRangeChange,
  showRangeSelector = true,
  locale = "zh"
}: {
  timeConfig?: ReportTimeConfigViewData;
  trendMetrics?: ReportTrendMetricViewData[];
  trendCharts?: ReportTrendChartViewData[];
  selectedRange: ReportTimeRange;
  onRangeChange: (range: ReportTimeRange) => void;
  showRangeSelector?: boolean;
  locale?: Locale;
}) {
  const isZh = locale === "zh";
  const hasTimeField = Boolean(timeConfig?.hasTimeField);
  const charts = hasTimeField ? reportTrendChartsFromPayload(trendMetrics, trendCharts, selectedRange, locale) : [];
  const sortedCharts = [...charts].sort((left, right) => chartPriority(left) - chartPriority(right));
  const visibleCharts = sortedCharts.slice(0, 5);
  const hiddenCharts = sortedCharts.slice(5);
  const chartGroups = chartSections(visibleCharts);
  const hiddenChartGroups = chartSections(hiddenCharts);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-semibold">{isZh ? "趋势分析" : "Trend analysis"}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {hasTimeField
              ? (isZh
                ? "按时间查看核心指标变化，识别增长、下滑和波动。"
                : "Review core metric changes over time to identify growth, decline, and volatility.")
              : (isZh
                ? "当前数据缺少时间字段，无法生成趋势分析。"
                : "The current data does not include a time field, so trend analysis cannot be generated.")}
          </p>
          {hasTimeField && timeConfig?.defaultTimeField ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {isZh ? "时间字段" : "Time field"}：{timeConfig.defaultTimeField} · {isZh ? "粒度" : "Granularity"}：{timeConfig.granularity ?? "month"}
            </p>
          ) : null}
        </div>
        {hasTimeField && showRangeSelector ? (
          <div className="flex flex-wrap items-center gap-1 rounded-full border bg-secondary/30 p-1">
            {reportTimeRangeOptions.map((range) => (
              <button
                key={range.value}
                type="button"
                onClick={() => onRangeChange(range.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  selectedRange === range.value
                    ? "bg-slate-900 text-white"
                    : "text-muted-foreground hover:bg-white"
                )}
              >
                {reportTimeRangeLabel(range.value, locale)}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {hasTimeField ? (
        charts.length ? (
          <div className="mt-4 space-y-5">
            {chartGroups.map(({ group, charts: groupCharts }) => (
              <ReportChartGroupSection key={group} group={group} charts={groupCharts} locale={locale} />
            ))}
            {hiddenCharts.length ? (
              <details className="rounded-xl border bg-white p-3">
                <summary className="cursor-pointer text-sm font-medium">{isZh ? `查看更多图表（${hiddenCharts.length}）` : `View more charts (${hiddenCharts.length})`}</summary>
                <div className="mt-4 space-y-5">
                  {hiddenChartGroups.map(({ group, charts: groupCharts }) => (
                    <ReportChartGroupSection key={group} group={group} charts={groupCharts} locale={locale} />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border bg-secondary/20 p-4 text-sm leading-6 text-muted-foreground">
            {isZh
              ? "已识别时间字段，但当前报告还没有可展示的趋势序列。重新生成报告后，系统会按业务时间生成 7D / 30D / 90D / 12M 趋势。"
              : "A time field was detected, but this report does not have a trend series to display yet. Regenerate the report to create 7D / 30D / 90D / 12M trends from business time."}
          </div>
        )
      ) : (
        <div className="mt-4 rounded-xl border bg-secondary/20 p-4 text-sm leading-6 text-muted-foreground">
          {isZh
            ? "上传包含 date、created_at、timestamp、order_date 或 event_time 等字段的数据后，系统可以生成 7D / 30D / 90D / 12M 趋势分析。"
            : "Upload data with fields such as date, created_at, timestamp, order_date, or event_time to generate 7D / 30D / 90D / 12M trend analysis."}
        </div>
      )}
    </div>
  );
}

type MetricMonitoringAlert = {
  id: string;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  badge: string;
  meta?: string;
};

function signedPercentText(value: number, locale: Locale) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  })}%`;
}

function metricMonitoringSeverityFromPercent(value: number): MetricMonitoringAlert["severity"] {
  const absolute = Math.abs(value);
  if (absolute >= 0.5) return "high";
  if (absolute >= 0.2) return "medium";
  return "low";
}

function buildMetricMonitoringAlerts(
  results: ReportMetricEvidenceResult[],
  trendMetrics: ReportTrendMetricViewData[] = [],
  selectedRange: ReportTimeRange = "30D",
  locale: Locale = "zh"
): MetricMonitoringAlert[] {
  const isZh = locale === "zh";
  const alerts: MetricMonitoringAlert[] = [];
  const trendAlerts = trendMetrics
    .filter((metric) => metric.percentChange != null && Number.isFinite(metric.percentChange))
    .sort((left, right) => Math.abs(right.percentChange ?? 0) - Math.abs(left.percentChange ?? 0))
    .slice(0, 3);

  for (const metric of trendAlerts) {
    const percentChange = metric.percentChange ?? 0;
    const metricName = localizedMetricName(metric.metricName, locale);
    const comparison = buildMetricComparisonDisplay({
      range: selectedRange,
      locale,
      hasTimeField: true,
      changePercent: percentChange,
      currentStartDate: metric.currentStartDate,
      currentEndDate: metric.currentEndDate,
      previousStartDate: metric.previousStartDate,
      previousEndDate: metric.previousEndDate,
      metricDirection: metric.metricDirection ?? metricDirectionFromText(metric.metricName, metric.businessModule),
      displayText: metric.displayText,
      tooltipText: metric.tooltipText
    });
    const direction = percentChange > 0
      ? (isZh ? "上升" : "increased")
      : percentChange < 0
        ? (isZh ? "下降" : "decreased")
        : (isZh ? "持平" : "remained flat");

    alerts.push({
      id: `trend-${normalizeReportMetricText(metric.metricName)}`,
      title: isZh
        ? `${metricName} ${comparison.currentRangeLabel}较${comparison.previousRangeLabel ?? "前一等长区间"}${direction}`
        : `${metricName} ${direction} ${comparison.currentRangeLabel} vs ${comparison.previousRangeLabel ?? "previous equal-length range"}`,
      description: isZh
        ? `${metricName} ${comparison.displayText}。`
        : `${metricName} changed ${signedPercentText(percentChange, locale)} for ${comparison.currentRangeLabel} vs ${comparison.previousRangeLabel ?? "the previous equal-length range"}.`,
      severity: metricMonitoringSeverityFromPercent(percentChange),
      badge: isZh ? "周期变化" : "Period change",
      meta: metric.previousValue != null && metric.currentValue != null
        ? `${formatReportMetricValue(metric.previousValue)} → ${formatReportMetricValue(metric.currentValue)}`
        : undefined
    });
  }

  const negativeRate = results.find((result) => {
    const name = normalizeReportMetricText(`${result.metricName} ${result.displayName ?? ""}`);
    return result.status === "computed" &&
      reportMetricScope(result) === "global" &&
      name.includes("negative_sentiment_rate");
  });
  const negativeRateValue = negativeRate ? reportResultNumber(negativeRate) : null;
  if (negativeRate && negativeRateValue != null) {
    const normalizedRate = negativeRateValue > 1 ? negativeRateValue / 100 : negativeRateValue;
    if (normalizedRate > 0.2 && normalizedRate <= 1) {
      alerts.push({
        id: "threshold-negative-sentiment-rate",
        title: isZh ? "负向反馈超过关注阈值" : "Negative feedback is above the attention threshold",
        description: isZh
          ? `整体负向反馈率为 ${(normalizedRate * 100).toFixed(1)}%，高于 20% 关注阈值。`
          : `The overall negative feedback rate is ${(normalizedRate * 100).toFixed(1)}%, above the 20% attention threshold.`,
        severity: normalizedRate >= 0.35 ? "high" : "medium",
        badge: isZh ? "阈值" : "Threshold"
      });
    }
  }

  const caveatMetric = results.find((result) =>
    result.status === "computed" &&
    reportMetricScope(result) === "global" &&
    requiresDedupedReportMetric(result)
  );
  if (caveatMetric) {
    const metricName = localizedMetricName(caveatMetric.displayName || caveatMetric.metricName, locale);
    alerts.push({
      id: `definition-${caveatMetric.metricId}`,
      title: isZh ? `${metricName} 存在原始口径限制` : `${metricName} uses a raw definition`,
      description: isZh
        ? `${metricName} 当前为原始口径，规模和集中度判断建议同时参考去重版本。`
        : `${metricName} is currently based on a raw definition; use deduped metrics before relying on scale or concentration decisions.`,
      severity: "medium",
      badge: isZh ? "口径限制" : "Definition caveat"
    });
  }

  const byId = new Map<string, MetricMonitoringAlert>();
  for (const alert of alerts) {
    if (!byId.has(alert.id)) byId.set(alert.id, alert);
  }

  return Array.from(byId.values())
    .sort((left, right) => {
      const severityWeight = { high: 0, medium: 1, low: 2 };
      return severityWeight[left.severity] - severityWeight[right.severity];
    })
    .slice(0, 5);
}

function MetricMonitoringAlertsSection({
  alerts,
  locale = "zh"
}: {
  alerts: MetricMonitoringAlert[];
  locale?: Locale;
}) {
  const isZh = locale === "zh";
  const severityClassName: Record<MetricMonitoringAlert["severity"], string> = {
    high: "border-rose-200 bg-rose-50 text-rose-800",
    medium: "border-amber-200 bg-amber-50 text-amber-800",
    low: "border-slate-200 bg-slate-50 text-slate-700"
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">{isZh ? "异常变化" : "Unusual changes"}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {isZh
              ? "优先展示明确周期对比、阈值触发和影响判断的口径提醒。"
              : "Highlights period changes, threshold triggers, and definition caveats that affect interpretation."}
          </p>
        </div>
        <Badge variant="secondary">{isZh ? `${alerts.length} 条` : `${alerts.length} items`}</Badge>
      </div>
      {alerts.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-xl border bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{alert.description}</p>
                  {alert.meta ? <p className="mt-2 text-xs font-medium text-slate-700">{alert.meta}</p> : null}
                </div>
                <Badge variant="secondary" className={cn("shrink-0 border text-[11px]", severityClassName[alert.severity])}>
                  {alert.badge}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border bg-secondary/20 p-4 text-sm leading-6 text-muted-foreground">
          {isZh
            ? "当前时间范围内没有识别到明显异常变化。后续有历史快照、阈值或趋势数据后会自动展示。"
            : "No material unusual changes were detected for the current range. This section will populate when history, thresholds, or trend data are available."}
        </div>
      )}
    </div>
  );
}

function ReportMetricEvidencePanel({
  metricResults,
  generatedAt,
  timeConfig,
  trendMetrics,
  trendCharts,
  structuredReport,
  selectedRange,
  onRangeChange,
  locale = "zh",
  isLoading = false
}: {
  metricResults?: ReportMetricEvidenceResult[];
  generatedAt?: string;
  timeConfig?: ReportTimeConfigViewData;
  trendMetrics?: ReportTrendMetricViewData[];
  trendCharts?: ReportTrendChartViewData[];
  structuredReport?: StructuredReportViewData | null;
  selectedRange: ReportTimeRange;
  onRangeChange: (range: ReportTimeRange) => void;
  locale?: Locale;
  isLoading?: boolean;
}) {
  const isZh = locale === "zh";
  const [statusFilter, setStatusFilter] = useState<ReportMetricStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<ReportMetricTypeFilter>("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const displayResults = dedupeReportMetricResults((metricResults ?? []).filter(isReportDashboardMetric));
  const selectedRangeTrendMetrics = trendMetricsForSelectedRange(trendMetrics, selectedRange);
  const computedResults = displayResults.filter((result) => result.status === "computed");
  const coreKpis = selectReportCoreKpis(displayResults);
  const recommendationSignals = recommendationSignalsFromStructuredReport(structuredReport);
  const recommendationContext: ChartRecommendationContext = {
    keyFindings: recommendationSignals,
    businessRisks: recommendationSignals,
    growthOpportunities: recommendationSignals,
    nextActions: recommendationSignals,
    coreKpis
  };
  const recommendedCharts = recommendReportCharts(displayResults, locale, recommendationContext);
  const selectedRangeTrendCharts = reportTrendChartsFromPayload(selectedRangeTrendMetrics, trendCharts, selectedRange, locale);
  const selectedRangeTrendDisplayKeys = new Set(
    selectedRangeTrendCharts
      .map((chart) => finalizeChart(chart, locale, recommendationSignals))
      .flatMap(chartDisplayDedupeKeys)
  );
  const selectedRangeRecommendedCharts = dedupeCharts(
    recommendedCharts
      .filter((chart) => !chart.id.startsWith("payload-trend"))
      .filter((chart) => {
        const finalizedChart = finalizeChart(chart, locale, recommendationSignals);
        return !chartDisplayDedupeKeys(finalizedChart).some((key) => selectedRangeTrendDisplayKeys.has(key));
      }),
    locale,
    recommendationSignals
  );
  const anomalyAlerts = buildMetricMonitoringAlerts(displayResults, selectedRangeTrendMetrics, selectedRange, locale);
  const hasTimeField = Boolean(timeConfig?.hasTimeField);
  const modules = Array.from(new Set(displayResults.map((result) => inferReportMetricBusinessModule(result, locale)))).sort();
  const visibleResults = displayResults
    .filter((result) => matchesReportMetricStatusFilter(result, statusFilter))
    .filter((result) => matchesReportMetricTypeFilter(result, typeFilter))
    .filter((result) => typeFilter !== "all" || reportMetricDisplayType(result) !== "ranking")
    .filter((result) => moduleFilter === "all" || inferReportMetricBusinessModule(result, locale) === moduleFilter)
    .sort((left, right) =>
      inferReportMetricBusinessModule(left, locale).localeCompare(inferReportMetricBusinessModule(right, locale), isZh ? "zh-Hans-CN" : "en-US") ||
      reportCoreKpiPriority(left) - reportCoreKpiPriority(right)
    );
  const groupedResults = visibleResults.reduce((groups, result) => {
    const businessModule = inferReportMetricBusinessModule(result, locale);
    const values = groups.get(businessModule) ?? [];
    values.push(result);
    groups.set(businessModule, values);
    return groups;
  }, new Map<string, ReportMetricEvidenceResult[]>());
  const latestComputedAt = computedResults
    .map((result) => result.computedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <Card className="border-slate-200/70 bg-white/90 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{isZh ? "指标监控看板" : "Metric Monitoring Dashboard"}</CardTitle>
            <CardDescription>
              {isZh
                ? "基于每日更新数据，持续监控核心指标、趋势变化和异常波动。"
                : "Monitor core metrics, trend changes, and unusual movements from daily-updated data."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 text-xs text-muted-foreground sm:justify-end">
            <Badge variant="secondary">{isZh ? `${displayResults.length} 个可展示指标` : `${displayResults.length} displayable metrics`}</Badge>
            <span>{isZh ? "上次更新时间" : "Last updated"}：{formatReportDate(generatedAt ?? latestComputedAt)}</span>
            {hasTimeField ? (
              <div className="flex flex-wrap items-center gap-1 rounded-full border bg-secondary/30 p-1">
                {reportTimeRangeOptions.map((range) => (
                  <button
                    key={range.value}
                    type="button"
                    onClick={() => onRangeChange(range.value)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition",
                      selectedRange === range.value
                        ? "bg-slate-900 text-white"
                        : "text-muted-foreground hover:bg-white"
                    )}
                  >
                    {reportTimeRangeLabel(range.value, locale)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="rounded-xl border bg-secondary/20 p-4 text-sm text-muted-foreground">
            {isZh ? "正在读取最新报告证据" : "Loading the latest report evidence"}
          </div>
        ) : displayResults.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {coreKpis.map((result) => {
                const metricDisplay = objectMetricDisplay(result, locale);
                const trendMetric = trendMetricForReportMetric(result, selectedRangeTrendMetrics);
                const hasBackendRangeValue = result.currentValue != null || result.value != null;
                const displayValue = result.currentValue != null
                  ? formatReportMetricValue(result.currentValue)
                  : metricDisplay.value;
                const metricDirection = result.metricDirection ?? trendMetric?.metricDirection ?? metricDirectionFromText(
                  `${result.metricName} ${result.displayName ?? ""}`,
                  result.metricCategory ?? result.businessType
                );
                const fallbackPreviousRange = previousRangeFromCurrent(
                  result.currentStartDate ?? result.dateRangeStart ?? timeConfig?.startDate,
                  result.currentEndDate ?? result.dateRangeEnd ?? timeConfig?.endDate
                );
                const fallbackChangePercent = comparisonPercentFromValues(
                  result.currentValue ?? result.value ?? trendMetric?.currentValue,
                  result.previousValue ?? trendMetric?.previousValue
                );
                const comparison = buildMetricComparisonDisplay({
                  range: selectedRange,
                  locale,
                  hasTimeField: Boolean(hasTimeField && result.hasTimeField !== false),
                  changePercent: result.changePercent ?? result.percentChange ?? trendMetric?.changePercent ?? trendMetric?.percentChange ?? fallbackChangePercent,
                  currentStartDate: result.currentStartDate ?? result.dateRangeStart ?? trendMetric?.currentStartDate ?? timeConfig?.startDate,
                  currentEndDate: result.currentEndDate ?? result.dateRangeEnd ?? trendMetric?.currentEndDate ?? timeConfig?.endDate,
                  previousStartDate: result.previousStartDate ?? trendMetric?.previousStartDate ?? fallbackPreviousRange.previousStartDate,
                  previousEndDate: result.previousEndDate ?? trendMetric?.previousEndDate ?? fallbackPreviousRange.previousEndDate,
                  metricDirection,
                  displayText: result.displayText ?? trendMetric?.displayText,
                  tooltipText: result.tooltipText ?? trendMetric?.tooltipText
                });
                return (
                  <div key={`core-${result.metricId}`} className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="space-y-2">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <p className="min-w-0 text-sm font-semibold leading-5">{metricDisplay.title}</p>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          {reportMetricBadges(result, 2, locale).slice(0, 1).map((badge) => (
                            <Badge key={badge.label} variant="secondary" className={cn("text-[11px]", badge.className)}>
                              {badge.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {reportMetricBadges(result, 2, locale).slice(1).map((badge) => (
                          <Badge key={badge.label} variant="secondary" className={cn("text-[11px]", badge.className)}>
                            {badge.label}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">{reportMetricShortDescription(result, locale)}</p>
                    </div>
                    <p className="mt-4 text-2xl font-semibold tracking-tight">{displayValue}</p>
                    <div className="mt-2 space-y-1 text-xs">
                      <p className="text-muted-foreground">
                        {result.hasTimeField === false || !hasTimeField || !hasBackendRangeValue && !trendMetric
                          ? (isZh ? "全周期口径" : "All-time scope")
                          : comparison.currentRangeLabel}
                      </p>
                      <p className={cn("flex items-center gap-1 font-medium", comparison.toneClass)}>
                        <span>{comparison.hasComparablePeriod ? comparison.displayText : comparison.displayText}</span>
                        <HelpCircle
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-label={comparison.tooltipText}
                        >
                          <title>{comparison.tooltipText}</title>
                        </HelpCircle>
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{inferReportMetricBusinessModule(result, locale)}</p>
                    <details className="mt-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer font-medium text-foreground">{isZh ? "查看口径" : "View definition"}</summary>
                      <div className="mt-2 space-y-2 rounded-lg bg-secondary/30 p-2">
                        <code className="block overflow-x-auto">{result.formula}</code>
                        <p>{isZh ? "数据源" : "Data source"}：{result.sourceDataset ?? "-"}</p>
                        <p>{isZh ? "计算时间" : "Calculated at"}：{formatReportDate(result.computedAt)}</p>
                        {result.warning ? <p>{isZh ? "提醒" : "Warning"}：{result.warning}</p> : null}
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>

            <ReportTrendAnalysisSection
              timeConfig={timeConfig}
              trendMetrics={selectedRangeTrendMetrics}
              trendCharts={trendCharts}
              selectedRange={selectedRange}
              onRangeChange={onRangeChange}
              showRangeSelector={false}
              locale={locale}
            />

            <MetricMonitoringAlertsSection alerts={anomalyAlerts} locale={locale} />

            <ReportRecommendedCharts charts={selectedRangeRecommendedCharts} locale={locale} />

            <details className="rounded-xl border bg-white p-3 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                {isZh ? `指标明细（${visibleResults.length}）` : `Metric details (${visibleResults.length})`}
              </summary>
              <div className="mt-3 space-y-4">
            <div className="space-y-3 rounded-xl border bg-secondary/10 p-3">
              <div className="flex flex-wrap gap-2">
                {reportMetricStatusFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      statusFilter === filter.value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "bg-white text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {reportMetricStatusFilterLabel(filter.value, locale)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {reportMetricTypeFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setTypeFilter(filter.value)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      typeFilter === filter.value
                        ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                        : "bg-white text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {reportMetricTypeFilterLabel(filter.value, locale)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setModuleFilter("all")}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    moduleFilter === "all"
                      ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                      : "bg-white text-muted-foreground hover:bg-secondary"
                  )}
                >
                  {isZh ? "全部模块" : "All modules"}
                </button>
                {modules.map((module) => (
                  <button
                    key={module}
                    type="button"
                    onClick={() => setModuleFilter(module)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      moduleFilter === module
                        ? "border-emerald-700 bg-emerald-50 text-emerald-800"
                        : "bg-white text-muted-foreground hover:bg-secondary"
                    )}
                  >
                    {module}
                  </button>
                ))}
              </div>
            </div>

            {visibleResults.length ? (
              <div className="space-y-4">
                {Array.from(groupedResults.entries()).map(([module, results]) => (
                  <div key={module} className="rounded-xl border bg-white p-4">
                    {(() => {
                      const primaryResults = (typeFilter === "all"
                        ? results.filter((result) => !["comparison", "distribution", "auxiliary"].includes(reportMetricDisplayType(result)))
                        : results
                      ).slice(0, 8);
                      const primaryIds = new Set(primaryResults.map((result) => result.metricId));
                      const foldedResults = results.filter((result) => !primaryIds.has(result.metricId));

                      return (
                        <>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">{module}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isZh
                            ? `${results.length} 个${typeFilter === "all" ? "指标" : reportMetricTypeLabelMap[typeFilter]}`
                            : `${results.length} ${typeFilter === "all" ? "metrics" : reportMetricTypeFilterLabel(typeFilter, locale)}`}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      {primaryResults.map((result) => {
                        const metricDisplay = objectMetricDisplay(result, locale);
                        return (
                          <div key={`${module}-${result.metricId}`} className="rounded-xl border bg-white px-4 py-3 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold leading-5">{metricDisplay.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {metricDisplay.dimensionLabel
                                    ? `${metricDisplay.dimensionLabel}: ${result.rows?.[0]?.dimension} · ${metricDisplay.helper}`
                                    : reportMetricShortDescription(result, locale)}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                                {reportMetricBadges(result, 2, locale).map((badge) => (
                                  <Badge key={badge.label} variant="secondary" className={cn("text-[11px]", badge.className)}>
                                    {badge.label}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <p className="mt-4 text-xl font-semibold">{metricDisplay.value}</p>
                            <details className="mt-3 text-xs text-muted-foreground">
                              <summary className="cursor-pointer font-medium text-foreground">{isZh ? "查看口径" : "View definition"}</summary>
                              <div className="mt-2 space-y-2 rounded-lg bg-secondary/30 p-2">
                                <code className="block overflow-x-auto">{result.formula}</code>
                                <p>{isZh ? "数据源" : "Data source"}：{result.sourceDataset ?? "-"}</p>
                                <p>{isZh ? "范围" : "Scope"}：{reportMetricScope(result)}</p>
                                <p>{isZh ? "计算时间" : "Calculated at"}：{formatReportDate(result.computedAt)}</p>
                                {result.warning ? <p>{isZh ? "提醒" : "Warning"}：{result.warning}</p> : null}
                                {result.error ? <p className="text-rose-700">{isZh ? "错误" : "Error"}：{result.error}</p> : null}
                              </div>
                            </details>
                          </div>
                        );
                      })}
                    </div>
                    {foldedResults.length ? (
                      <details className="mt-3 rounded-xl border bg-secondary/20 p-3 text-sm">
                        <summary className="cursor-pointer font-medium text-slate-900">
                          {isZh ? `查看分布详情和辅助指标（${foldedResults.length}）` : `View distribution details and auxiliary metrics (${foldedResults.length})`}
                        </summary>
                        <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                          {foldedResults.map((result) => {
                            const metricDisplay = objectMetricDisplay(result, locale);
                            return (
                              <div key={`${module}-folded-${result.metricId}`} className="rounded-xl border bg-white px-4 py-3 text-sm">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-semibold leading-5">{metricDisplay.title}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {metricDisplay.dimensionLabel
                                        ? `${metricDisplay.dimensionLabel}: ${result.rows?.[0]?.dimension} · ${metricDisplay.helper}`
                                        : reportMetricShortDescription(result, locale)}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                                    {reportMetricBadges(result, 2, locale).map((badge) => (
                                      <Badge key={badge.label} variant="secondary" className={cn("text-[11px]", badge.className)}>
                                        {badge.label}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                                <p className="mt-4 text-xl font-semibold">{metricDisplay.value}</p>
                                <details className="mt-3 text-xs text-muted-foreground">
                                  <summary className="cursor-pointer font-medium text-foreground">{isZh ? "查看口径" : "View definition"}</summary>
                                  <div className="mt-2 space-y-2 rounded-lg bg-secondary/30 p-2">
                                    <code className="block overflow-x-auto">{result.formula}</code>
                                    <p>{isZh ? "数据源" : "Data source"}：{result.sourceDataset ?? "-"}</p>
                                    <p>{isZh ? "范围" : "Scope"}：{reportMetricScope(result)}</p>
                                    <p>{isZh ? "计算时间" : "Calculated at"}：{formatReportDate(result.computedAt)}</p>
                                    {result.warning ? <p>{isZh ? "提醒" : "Warning"}：{result.warning}</p> : null}
                                    {result.error ? <p className="text-rose-700">{isZh ? "错误" : "Error"}：{result.error}</p> : null}
                                  </div>
                                </details>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ) : null}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border bg-secondary/20 p-4 text-sm text-muted-foreground">
                {isZh
                  ? "当前筛选条件下没有指标。可以切换状态、类型或业务模块查看全部结果。"
                  : "No metrics match the current filters. Change status, type, or business module to view more results."}
              </div>
            )}
              </div>
            </details>
          </>
        ) : (
          <div className="rounded-xl border bg-secondary/20 p-4 text-sm text-muted-foreground">
            {isZh
              ? "暂无可展示的业务指标。系统内部字段、调试指标和无效值已被过滤。"
              : "No displayable business metrics yet. Internal fields, debug metrics, and invalid values are filtered out."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function reportResultNumber(result: { value?: number | string | null }) {
  if (typeof result.value === "number") return result.value;
  if (typeof result.value === "string") {
    const parsed = Number(result.value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numericReportMetricValue(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function comparisonPercentFromValues(current: number | string | null | undefined, previous: number | string | null | undefined) {
  const currentNumber = numericReportMetricValue(current);
  const previousNumber = numericReportMetricValue(previous);

  if (currentNumber == null || previousNumber == null || previousNumber === 0) {
    return null;
  }

  return (currentNumber - previousNumber) / Math.abs(previousNumber);
}

function reportResultDisplay(result: { metricName: string; value?: number | string | null }) {
  const value = reportResultNumber(result);
  const name = result.metricName.toLowerCase();

  if (value != null && (name.includes("rate") || name.includes("ratio")) && Math.abs(value) <= 1) {
    return `${(value * 100).toFixed(1)}%`;
  }

  return formatReportMetricValue(result.value);
}

function buildReportNarrative(
  results: Array<{
    metricName: string;
    formula: string;
    value?: number | string | null;
    rows?: Array<{ dimension: string; value: number | string | null }>;
  }>
) {
  const byName = (keyword: string) => results.find((result) =>
    result.metricName.toLowerCase().includes(keyword)
  );
  const reviewVolume = byName("review volume");
  const sentiment = byName("sentiment_polarity") ?? byName("sentiment polarity");
  const positiveRate = byName("positive sentiment");
  const averageRating = byName("average rating");
  const totalApps = byName("total apps");
  const closePrice = byName("close price");
  const volatility = byName("volatility");
  const tradingVolume = byName("trading volume");
  const totalInstalls = byName("installs");
  const keyMetrics = [
    reviewVolume,
    sentiment,
    positiveRate,
    averageRating,
    totalApps,
    closePrice,
    volatility,
    tradingVolume,
    totalInstalls
  ].filter(Boolean).slice(0, 5) as typeof results;

  const overview = keyMetrics.length
    ? `本次报告已基于真实聚合结果生成。当前最值得关注的是 ${keyMetrics
      .slice(0, 3)
      .map((result) => `${result.metricName}（${reportResultDisplay(result)}）`)
      .join("、")}，这些指标可以用于判断用户反馈、产品表现和市场波动`
    : "本次报告已完成指标计算，但可用于分析的结果仍然较少，建议继续补充业务数据";

  const findings = keyMetrics.map((result) => ({
    title: result.metricName,
    value: reportResultDisplay(result),
    description: result.rows?.length
      ? `${result.metricName} 的最高项是 ${result.rows[0].dimension}，数值为 ${formatReportMetricValue(result.rows[0].value)}`
      : `${result.metricName} 为 ${reportResultDisplay(result)}，需结合业务口径和分组维度解释`
  }));

  const anomalySignals = [
    volatility && reportResultNumber(volatility) != null
      ? `价格波动率为 ${reportResultDisplay(volatility)}，需要持续观察是否出现异常放大`
      : null,
    sentiment && reportResultNumber(sentiment) != null
      ? `平均情绪分数为 ${reportResultDisplay(sentiment)}，可作为用户反馈质量的早期信号`
      : null,
    positiveRate && reportResultNumber(positiveRate) != null
      ? `正向反馈占比为 ${reportResultDisplay(positiveRate)}，适合继续按产品或类别拆解`
      : null,
    tradingVolume && reportResultNumber(tradingVolume) != null
      ? `成交量达到 ${reportResultDisplay(tradingVolume)}，说明该时间范围内市场关注度较高`
      : null
  ].filter(Boolean) as string[];

  return {
    overview,
    findings,
    anomalySignals: anomalySignals.length
      ? anomalySignals
      : ["当前未发现明显异常，但建议继续监控核心指标的变化趋势"],
    impact: [
      "评论量、情绪和评分指标可以帮助判断用户满意度与产品体验问题",
      "价格、成交量和波动指标可以帮助识别市场风险与短期关注度变化",
      "安装量、App 数量和评分指标可以帮助判断产品组合的增长质量"
    ],
    actions: [
      "优先使用已生成的对象级排名和分组聚合，定位变化最明显的对象",
      "为核心指标设置异常阈值，后续报告可以自动标记明显波动",
      "把高评论量、低评分或负面情绪集中的对象列为排查重点"
    ]
  };
}

type StructuredReportMetricViewData = {
    metricId: string;
    displayName: string;
    displayValue: string;
    formula: string;
    explanation: string;
    grain: string;
    warning?: string;
    isEstimated?: boolean;
};

type GeneratedRiskViewData = {
  id: string;
  title: string;
  type: string;
  riskType?: string;
  severity?: "high" | "medium" | "low";
  evidenceMetrics: string[];
  evidenceValues?: Record<string, string | number | null>;
  metricEvidence?: string;
  comparisonEvidence?: string;
  comparison?: string;
  objects?: Array<Record<string, string | number | null>>;
  affectedObjects?: Array<Record<string, string | number | null>>;
  businessMeaning: string;
  businessImpact?: string;
  recommendedAction: string;
  caveat?: string;
  confidenceReason?: string;
};

type GeneratedOpportunityViewData = {
  id: string;
  title: string;
  type: string;
  opportunityType?: string;
  priority?: "high" | "medium" | "low";
  evidenceMetrics: string[];
  evidenceValues?: Record<string, string | number | null>;
  metricEvidence?: string;
  comparisonEvidence?: string;
  comparison?: string;
  objects?: Array<Record<string, string | number | null>>;
  targetObjects?: Array<Record<string, string | number | null>>;
  businessMeaning: string;
  recommendedAction: string;
  caveat?: string;
  confidenceReason?: string;
};

type GeneratedInsightsViewData = {
  executiveSummary?: Array<{
    id: string;
    title: string;
    findingType?: string;
    summary?: string;
    finding: string;
    currentConclusion?: string;
    supportingEvidence?: string;
    deeperAnalysisResult?: string;
    businessImplication?: string;
    recommendedDecision?: string;
    caveat?: string;
    businessMeaning: string;
    riskOrOpportunity?: string;
    nextAction?: string;
    confidenceReason?: string;
    limitations?: string[];
    evidenceMetrics: string[];
    evidenceValues: Record<string, string | number | null>;
    evidenceObjects?: Array<Record<string, string | number | null>>;
    comparedGroups?: Array<Record<string, string | number | null>>;
    joinedTables?: string[];
    joinKey?: string;
    sourceDatasets?: string[];
    technicalDetails?: {
      joinedTables?: string[];
      joinKey?: string;
      sourceDatasets?: string[];
      fieldMapping?: Record<string, string>;
      joinConfidence?: number;
      caveat?: string;
    };
    nextBreakdown?: string[];
    confidence: number;
  }>;
  keyFindings?: Array<{
    id: string;
    title: string;
    findingType?: string;
    summary?: string;
    finding: string;
    currentConclusion?: string;
    supportingEvidence?: string;
    deeperAnalysisResult?: string;
    businessImplication?: string;
    recommendedDecision?: string;
    caveat?: string;
    businessMeaning: string;
    riskOrOpportunity?: string;
    nextAction?: string;
    confidenceReason?: string;
    limitations?: string[];
    evidenceMetrics: string[];
    evidenceValues: Record<string, string | number | null>;
    evidenceObjects?: Array<Record<string, string | number | null>>;
    comparedGroups?: Array<Record<string, string | number | null>>;
    joinedTables?: string[];
    joinKey?: string;
    sourceDatasets?: string[];
    technicalDetails?: {
      joinedTables?: string[];
      joinKey?: string;
      sourceDatasets?: string[];
      fieldMapping?: Record<string, string>;
      joinConfidence?: number;
      caveat?: string;
    };
    nextBreakdown?: string[];
    confidence: number;
  }>;
  businessRisks?: GeneratedRiskViewData[];
  growthOpportunities?: GeneratedOpportunityViewData[];
  risks?: GeneratedRiskViewData[];
  opportunities?: GeneratedOpportunityViewData[];
  recommendedActions?: Array<{
    id: string;
    title: string;
    type?: "business_action" | "data_quality_action";
    actionType?:
      | "optimize_risk_object"
      | "scale_opportunity_object"
      | "validate_roi"
      | "improve_conversion"
      | "reduce_negative_feedback"
      | "expand_high_performing_segment"
      | "fix_data_quality_for_decision"
      | "create_deduped_metric"
      | "collect_revenue_field"
      | "build_benchmark"
      | "run_growth_test"
      | "collect_missing_business_data"
      | "reallocate_budget"
      | "improve_retention"
      | "reduce_cost"
      | "investigate_anomaly";
    priority: "high" | "medium" | "low";
    basedOn: string[];
    currentFinding?: string;
    whyItMatters?: string;
    recommendedAction?: string;
    evidence?: string;
    targetObjects?: string[];
    targetSegment?: string;
    action: string;
    expectedOutcome: string;
    expectedImpact?: string;
    estimatedRoiOrValue?: number | string;
    roiConfidence?: "high" | "medium" | "low" | "unavailable";
    caveats?: string[];
    requiredDataIfAny?: string[];
    evidenceMetrics?: string[];
    evidenceRankings?: string[];
    referencedObjects?: string[];
    referencedFields?: string[];
    suggestedBreakdowns?: string[];
  }>;
  nextActionPlan?: {
    autoGeneratedResults: Array<{
      id: string;
      title: string;
      type: string;
      resultSummary: string;
      keyObjects: string[];
      keyMetrics: string[];
      businessMeaning: string;
      sourceInsightIds: string[];
    }>;
    actionInsights?: Array<{
      id: string;
      title: string;
      priority: "high" | "medium" | "low";
      actionType: string;
      currentFinding: string;
      evidence: string;
      keyEvidence?: string;
      targetObjects: string[];
      targetSegment?: string;
      businessMeaning: string;
      recommendedAction: string;
      executionSteps?: string[];
      deliverable?: string;
      ownerHint?: string;
      timeHorizon?: "today" | "this_week" | "this_month";
      expectedImpact: string;
      caveat?: string;
      confidence: number;
      basedOn: string[];
      evidenceMetrics: string[];
      evidenceRankings: string[];
    }>;
    priorityActions?: Array<{
      id: string;
      title: string;
      priority: "high" | "medium" | "low";
      actionType: string;
      currentFinding?: string;
      evidence?: string;
      keyEvidence?: string;
      targetObjects: string[];
      targetSegment?: string;
      businessMeaning?: string;
      recommendedAction: string;
      executionSteps?: string[];
      deliverable?: string;
      ownerHint?: string;
      timeHorizon?: "today" | "this_week" | "this_month";
      expectedImpact: string;
      caveat?: string;
      confidence?: number;
      basedOn: string[];
      evidenceMetrics: string[];
      evidenceRankings: string[];
    }>;
    missingDataRequests: Array<{
      id: string;
      missingFieldType: string;
      suggestedFields: string[];
      whyNeeded: string;
      whatItEnables: string;
      priority: "high" | "medium" | "low";
    }>;
    caveats: Array<{
      id: string;
      type: string;
      message: string;
      affectedMetrics: string[];
      displayMode: "badge" | "tooltip" | "collapsed_detail";
    }>;
  };
  dataLimitations?: Array<{
    id: string;
    title?: string;
    limitation?: string;
    impact?: string;
    suggestedFix?: string;
    message: string;
  }>;
};

type StructuredReportViewData = {
  title: string;
  coreSummary: string;
  coreSummaryBullets?: string[];
  dataOverview: string[];
  coreMetricOverview: StructuredReportMetricViewData[];
  keyFindings?: string[];
  modules: Array<{
    businessType: string;
    title: string;
    summary: string;
    coreMetrics: StructuredReportMetricViewData[];
    metricExplanation: string[];
    businessMeaning: string[];
    risks: string[];
    nextBreakdowns: string[];
  }>;
  trendAnalysis: string[];
  structureAnalysis: string[];
  topObjectAnalysis: string[];
  risks: string[];
  opportunities: string[];
  risksAndOpportunities?: string[];
  businessRisks?: GeneratedInsightsViewData["businessRisks"];
  growthOpportunities?: GeneratedInsightsViewData["growthOpportunities"];
  dataLimitations?: GeneratedInsightsViewData["dataLimitations"];
  generatedInsights?: GeneratedInsightsViewData;
  recommendations: Array<{
    title: string;
    type?: "business_action" | "data_quality_action";
    basedOn: string;
    action: string;
    reason: string;
    priorityDimension: string;
    priority: "High" | "Medium" | "Low";
    referencedObjects?: string[];
    referencedFields?: string[];
  }>;
  limitations: string[];
  evidence: string[];
};

function reportDetailFields(fields?: string[]) {
  return (fields ?? []).filter((field) => {
    const normalized = field.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

    return Boolean(normalized) && ![
      "id",
      "row_id",
      "internal_id",
      "status",
      "anomalytype",
      "anomaly_type",
      "applied_steps_count",
      "created_at",
      "updated_at",
      "deleted",
      "enabled",
      "flag"
    ].includes(normalized) && !/^(debug|internal|system)_/.test(normalized);
  });
}

function evidenceObjectLabel(row: Record<string, string | number | null>, index = 0) {
  return String(
    row.dimension ??
    row.App ??
    row.Product ??
    row.product ??
    row.category ??
    row.Category ??
    row.group ??
    row.Group ??
    `对象 ${index + 1}`
  );
}

function isNumericBucketLabel(label: string) {
  const normalized = label.trim();

  return /^\d+(\.\d+)?$/.test(normalized) ||
    /^\d+(\.\d+)?\s*[-–]\s*\d+(\.\d+)?$/.test(normalized);
}

function isBusinessObjectLabel(label: string) {
  const normalized = label.trim().toLowerCase();

  if (!normalized || normalized === "unknown" || /^对象\s*\d+$/.test(normalized)) return false;
  if (isNumericBucketLabel(label)) return false;

  return true;
}

function businessObjectRows(rows?: Array<Record<string, string | number | null>>, options?: { excludeTinySamples?: boolean }) {
  return (rows ?? []).filter((row, index) => {
    const label = evidenceObjectLabel(row, index);
    const sampleSize = sentimentSampleSizeFromRow(row);

    if (!isBusinessObjectLabel(label)) return false;
    if (options?.excludeTinySamples && sampleSize != null && sampleSize < 5) return false;

    return true;
  });
}

function hasTinyObjectSample(rows?: Array<Record<string, string | number | null>>) {
  return (rows ?? []).some((row) => {
    const sampleSize = sentimentSampleSizeFromRow(row);

    return sampleSize != null && sampleSize < 5;
  });
}

function metricValueLabel(key: string, locale: Locale = "zh") {
  const raw = key.trim();
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const label = (() => {
    if (["records", "count", "sample_size", "samplesize", "sentiment_sample_size", "sentimentsamplesize"].includes(normalized) || /^样本量$/.test(raw)) {
      return { zh: "样本量", en: "Sample size" };
    }
    if (["negative_count", "negativecount", "negative_reviews", "negativereviews"].includes(normalized) || /^负向.*数$/.test(raw) || /^负面.*数$/.test(raw)) {
      return { zh: "负向数", en: "Negative count" };
    }
    if (["positive_count", "positivecount", "positive_reviews", "positivereviews"].includes(normalized) || /^正向.*数$/.test(raw)) {
      return { zh: "正向数", en: "Positive count" };
    }
    if (["reviews", "review_count", "reviewcount"].includes(normalized) || /^评论数$/.test(raw)) {
      return { zh: "评论数", en: "Reviews" };
    }
    if ((normalized.includes("negative") && normalized.includes("rate")) || /^负向.*率$/.test(raw) || /^负面.*率$/.test(raw)) {
      return { zh: "负向率", en: "Negative rate" };
    }
    if ((normalized.includes("positive") && normalized.includes("rate")) || /^正向.*率$/.test(raw)) {
      return { zh: "正向率", en: "Positive rate" };
    }
    if (normalized.includes("rating") || /^评分$/.test(raw)) {
      return { zh: "评分", en: "Rating" };
    }
    if (normalized.includes("installs") || /^安装量$/.test(raw)) {
      return { zh: "安装量", en: "Installs" };
    }
    if (normalized.includes("revenue") || normalized.includes("value") || /^估算值$/.test(raw)) {
      return { zh: "估算值", en: "Estimated value" };
    }

    return null;
  })();

  if (label) return locale === "zh" ? label.zh : label.en;

  return locale === "zh" ? titleCaseMetricText(key) : titleCaseMetricText(raw);
}

function metricValueText(key: string, value: string | number | null, locale: Locale = "zh") {
  if (value == null) return null;
  const normalized = key.toLowerCase();
  const separator = locale === "zh" ? "：" : ": ";

  if (typeof value === "number" && (normalized.includes("rate") || normalized.includes("share") || normalized.includes("ratio")) && Math.abs(value) <= 1) {
    return `${metricValueLabel(key, locale)}${separator}${(value * 100).toFixed(1)}%`;
  }

  return `${metricValueLabel(key, locale)}${separator}${formatReportMetricValue(value)}`;
}

function evidenceRowNumber(row: Record<string, string | number | null>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function evidenceObjectValues(row: Record<string, string | number | null>, limit = 4, locale: Locale = "zh") {
  const hiddenKeys = new Set(["dimension", "App", "Product", "product", "category", "Category", "group", "Group"]);
  const priorityKeys = [
    "negativeRate",
    "negative_rate",
    "positiveRate",
    "positive_rate",
    "sentimentSampleSize",
    "sentiment_sample_size",
    "sampleSize",
    "sample_size",
    "records",
    "negativeCount",
    "negative_count",
    "negativeReviews",
    "negative_reviews",
    "positiveCount",
    "positive_count",
    "reviews",
    "reviewCount",
    "averageRating",
    "installs",
    "value"
  ];
  const visibleEntries = Object.entries(row)
    .filter(([key, value]) => !hiddenKeys.has(key) && value !== null && value !== undefined && String(value).trim() !== "")
    .filter(([key]) => !["applied_steps_count", "status", "anomalyType", "created_at", "updated_at", "debug"].includes(key));
  const businessEntries = visibleEntries.filter(([key]) => key !== "value");
  const entries = (businessEntries.length ? businessEntries : visibleEntries)
    .sort(([left], [right]) => {
      const leftIndex = priorityKeys.findIndex((key) => key.toLowerCase() === left.toLowerCase());
      const rightIndex = priorityKeys.findIndex((key) => key.toLowerCase() === right.toLowerCase());

      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
    })
    .map(([key, value]) => metricValueText(key, value, locale))
    .filter((value): value is string => Boolean(value));
  const negativeRate = evidenceRowNumber(row, ["negativeRate", "negative_rate"]);
  const sampleSize = evidenceRowNumber(row, ["sentimentSampleSize", "sentiment_sample_size", "sampleSize", "sample_size", "records", "reviews"]);
  const smallSampleNote = negativeRate != null && sampleSize != null && sampleSize < 20
    ? (locale === "zh" ? "小样本线索" : "Small-sample lead")
    : null;

  return [...entries.slice(0, limit), smallSampleNote].filter((value): value is string => Boolean(value));
}

function rowNumberByPattern(row: Record<string, string | number | null>, patterns: RegExp[]) {
  for (const [key, value] of Object.entries(row)) {
    if (!patterns.some((pattern) => pattern.test(key))) continue;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function boundedRateValue(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= 0 && value <= 1) return value;
  if (value > 1 && value <= 100) return value / 100;

  return null;
}

function explicitNegativeRateFromRow(row: Record<string, string | number | null>) {
  return boundedRateValue(rowNumberByPattern(row, [
    /^negative_?rate$/i,
    /^negativeSentimentRate$/i,
    /^negative.*sentiment.*rate$/i,
    /^sentiment.*negative.*rate$/i,
    /^negative.*feedback.*rate$/i,
    /^负向.*率$/,
    /^负面.*率$/
  ]));
}

function negativeCountFromRow(row: Record<string, string | number | null>) {
  return rowNumberByPattern(row, [
    /^negative_?count$/i,
    /^negativeReviews?$/i,
    /^negative.*reviews?$/i,
    /^negative.*count$/i,
    /^负向.*数$/,
    /^负面.*数$/
  ]);
}

function sentimentSampleSizeFromRow(row: Record<string, string | number | null>) {
  return rowNumberByPattern(row, [
    /^sentimentSampleSize$/i,
    /^sentiment_sample_size$/i,
    /^sampleSize$/i,
    /^sample_size$/i,
    /^records$/i,
    /^样本量$/
  ]);
}

function evidenceValueByPattern(values: Record<string, string | number | null> | undefined, patterns: RegExp[]) {
  for (const [key, value] of Object.entries(values ?? {})) {
    if (!patterns.some((pattern) => pattern.test(key))) continue;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function normalizedShare(topSum: number, totalValue: number | null) {
  if (!totalValue || !Number.isFinite(topSum) || topSum <= 0) return null;
  const totalCandidates = [totalValue, totalValue * 1_000, totalValue * 1_000_000, totalValue * 1_000_000_000]
    .filter((value) => Number.isFinite(value) && value > 0);
  const validShares = totalCandidates
    .map((total) => topSum / total)
    .filter((share) => Number.isFinite(share) && share >= 0 && share <= 1.000001);

  if (!validShares.length) return null;

  return Math.min(1, Math.max(...validShares));
}

function formatPercent(share: number) {
  return `${(share * 100).toFixed(1)}%`;
}

function metricWarningLabel(metric: { warning?: string; isEstimated?: boolean }, locale: Locale = "zh") {
  const isZh = locale === "zh";
  if (!metric.warning) return null;
  if (metric.isEstimated) return isZh ? "估算值" : "Estimated";
  if (/去重|重复|原始记录|dedup|duplicate|raw/i.test(metric.warning)) return isZh ? "未去重" : "Raw";

  return isZh ? "口径限制" : "Caveat";
}

function StructuredReportView({ report, locale }: { report: StructuredReportViewData; locale: Locale }) {
  const isZh = locale === "zh";
  const text = {
    fallbackFindingTitle: isZh ? "核心业务指标已完成计算" : "Core business metrics are available",
    fallbackEvidence: isZh ? "关键指标已完成计算，完整口径可在详情中查看" : "Key metrics have been computed; definitions are available in details.",
    fallbackDeeperAnalysis: isZh
      ? "当前未形成足够对象级证据，因此不会包装成强业务发现。"
      : "Object-level evidence is limited, so this is not presented as a strong business finding.",
    fallbackImplication: isZh
      ? "该结果适合辅助理解整体表现，具体风险或机会以对象级排名和分组对比为准。"
      : "Use this to understand overall performance; object-level risks or opportunities require rankings or group comparisons.",
    fallbackDecision: isZh ? "优先查看已识别的风险对象、增长机会和下一步行动。" : "Prioritize the identified risk objects, growth opportunities, and next actions.",
    fallbackCaveat: isZh ? "对象级证据有限" : "Object-level evidence is limited",
    fallbackSummary: isZh
      ? "当前报告只展示业务指标、关键发现和下一步经营动作；技术口径已收起到详情。"
      : "This report shows business metrics, key findings, and next actions. Technical lineage is kept in details.",
    coreSummary: isZh ? "核心摘要" : "Executive Summary",
    keyMetrics: isZh ? "业务 KPI 看板" : "Business KPI Board",
    keyMetricsDescription: isZh
      ? "只展示业务优先级最高的 6-8 个指标，完整口径放在详情里"
      : "Only the 6-8 highest-priority business KPIs are shown; full definitions are kept in details.",
    keyFindings: isZh ? "关键发现" : "Key Findings",
    noKeyFindings: isZh
      ? "当前没有足够的对象级或分组级业务证据生成关键发现；已计算指标可在关键指标和图表中查看。"
      : "There is not enough object-level or group-level business evidence to produce key findings. Computed KPIs are available in the metric and chart sections.",
    currentConclusion: isZh ? "当前结论" : "Current Conclusion",
    evidence: isZh ? "证据" : "Evidence",
    deeperAnalysis: isZh ? "进一步分析结论" : "Further Analysis",
    lineageDetails: isZh ? "查看口径 / 关联逻辑" : "View definitions / lineage",
    topCategoryContribution: isZh ? "头部类别贡献" : "Top Category Contribution",
    category: isZh ? "类别" : "Category",
    installs: isZh ? "安装量" : "Installs",
    rating: isZh ? "评分" : "Rating",
    negativeRateReviews: isZh ? "负向率 / 评论" : "Negative Rate / Reviews",
    missingCategoryQuality: isZh
      ? "当前只有类别规模排名，暂不能判断头部类别是否伴随质量风险。"
      : "Only category scale ranking is available, so category-level quality risk cannot be judged yet.",
    negativeCandidates: isZh ? "负向反馈候选对象" : "Negative Feedback Candidates",
    negativeRate: isZh ? "负向率" : "Negative rate",
    sampleSize: isZh ? "样本量" : "sample size",
    sampleMissing: isZh ? "样本量缺失，无法判断可靠性" : "sample size missing; reliability cannot be judged",
    negativeCount: isZh ? "负向数" : "negative count",
    smallSampleLead: isZh ? "小样本线索" : "Small-sample lead",
    validationLead: isZh ? "待验证线索" : "Needs validation",
    negativeSampleCaveat: isZh
      ? "对象级负向率需结合评论样本量判断；小样本 100% 负向率仅作为排查线索，不作为强风险结论。"
      : "Object-level negative rates must be read with sample size; 100% negative rates from small samples are investigation leads, not strong risk conclusions.",
    evidenceObjects: isZh ? "证据对象" : "Evidence Objects",
    viewFullRanking: isZh ? "查看完整排名" : "View full ranking",
    businessMeaning: isZh ? "业务含义" : "Business Meaning",
    recommendedDecision: isZh ? "建议决策" : "Recommended Decision",
    caveatPrefix: isZh ? "口径提醒：" : "Caveat: ",
    businessRisks: isZh ? "业务风险" : "Business Risks",
    businessRisksDescription: isZh
      ? "基于阈值、趋势、分布、Top Share 或对象级聚合"
      : "Based on thresholds, trends, distributions, top share, or object-level aggregations",
    riskSummary: isZh ? "优先展示有具体对象和证据的业务风险；样本集中仅作为口径提醒，不进入风险模块。" : "Only business risks with concrete objects and evidence are highlighted; sample concentration is treated as a data caveat, not a risk module item.",
    noBusinessRisks: isZh
      ? "当前没有足够的对比、阈值或对象级证据生成业务风险"
      : "There is not enough comparison, threshold, or object-level evidence to generate business risks.",
    growthOpportunities: isZh ? "增长机会" : "Growth Opportunities",
    growthDescription: isZh ? "只展示来自对象级排名或分组聚合的机会" : "Only opportunities backed by object rankings or group aggregations are shown.",
    growthSummary: isZh ? "机会必须有对象、质量或规模证据，并转成可执行实验建议。" : "Opportunities require target objects and evidence, then translate into testable actions.",
    noGrowth: isZh ? "当前缺少对象级排名或分组对比，暂不能识别具体机会对象" : "Object-level rankings or group comparisons are missing, so specific opportunity objects cannot be identified yet.",
    targetObjects: isZh ? "对象" : "Objects",
    keyEvidence: isZh ? "关键证据" : "Key evidence",
    businessJudgment: isZh ? "业务判断" : "Business judgment",
    recommendedActionShort: isZh ? "建议动作" : "Recommended action",
    viewDetails: isZh ? "查看详情" : "View details",
    viewAll: isZh ? "查看全部" : "View all",
    nextActions: isZh ? "下一步行动" : "Next Actions",
    nextActionsDescription: isZh
      ? "把已完成的分析结果转成经营动作；数据补强只保留影响可信度和 ROI 判断的事项。"
      : "Turns completed analysis into operating actions; data improvements are limited to items that affect credibility or ROI decisions.",
    businessActions: isZh ? "业务行动" : "Business Actions",
    dataActions: isZh ? "数据补强" : "Data Improvements",
    objects: isZh ? "对象：" : "Objects: ",
    evidencePrefix: isZh ? "证据：" : "Evidence: ",
    currentInsight: isZh ? "当前洞察" : "Current Insight",
    systemJudgment: isZh ? "系统判断" : "System Judgment",
    executionChecklist: isZh ? "查看执行清单" : "View execution checklist",
    deliverable: isZh ? "产出物：" : "Deliverable: ",
    expectedImpact: isZh ? "预期影响：" : "Expected impact: ",
    whyNeeded: isZh ? "为什么需要：" : "Why needed: ",
    executionAction: isZh ? "执行动作：" : "Action: ",
    output: isZh ? "输出物：" : "Output: ",
    decisionImpact: isZh ? "决策影响：" : "Decision impact: ",
    requiredData: isZh ? "需要补充：" : "Required data: ",
    noBusinessActions: isZh ? "当前没有足够的风险对象、机会对象或分组证据生成业务行动" : "There is not enough risk-object, opportunity-object, or group evidence to generate business actions.",
    noDataActions: isZh ? "当前没有必须补强的数据字段或口径动作" : "No required data fields or definition improvements are needed right now.",
    viewLimitations: isZh ? "查看口径与限制" : "View definitions and limitations",
    limitationSummaryDefault: isZh ? "当前没有需要单独提示的口径限制" : "No standalone definition limitations need to be highlighted."
  };
  const zhMetricLabel = (metricName: string) => {
    const raw = metricName.toLowerCase();

    if (/total\s*customers?|customer\s*count|unique\s*customers?/.test(raw)) return "客户总数";
    if (/total\s*orders?|order\s*count|orders?\s*total/.test(raw)) return "订单总数";
    if (/estimated\s*gmv|gmv|revenue|sales\s*amount|total\s*sales/.test(raw)) return "销售额";
    if (/\baov\b|average\s*order\s*value/.test(raw)) return "客单价";
    if (/repeat\s*purchase\s*rate|repurchase/.test(raw)) return "复购率";

    return metricName;
  };
  const metricByLabel = (patterns: RegExp[]) =>
    report.coreMetricOverview.find((metric) =>
      patterns.some((pattern) => pattern.test(metric.displayName.toLowerCase()))
    );
  const legacySummaryMetric = (item: string) => {
    const match = item.match(/^(.+?)\s+is\s+([^,，.。]+).*giving a business-level signal/i);
    if (!match) return null;

    return {
      label: zhMetricLabel(match[1].trim()),
      value: match[2].trim()
    };
  };
  const zhNaturalSummaryBullets = (items: string[]) => {
    if (!isZh) return items;

    const customers = metricByLabel([/total\s*customers?/, /customer\s*count/, /unique\s*customers?/]) ??
      null;
    const orders = metricByLabel([/total\s*orders?/, /order\s*count/]) ?? null;
    const revenue = metricByLabel([/estimated\s*gmv/, /\bgmv\b/, /revenue/, /sales\s*amount/, /total\s*sales/]) ?? null;
    const aov = metricByLabel([/\baov\b/, /average\s*order\s*value/]) ?? null;
    const repeatRate = metricByLabel([/repeat\s*purchase\s*rate/, /repurchase/]) ?? null;
    const legacyMetrics = items.flatMap((item) => {
      const parsed = legacySummaryMetric(item);
      return parsed ? [parsed] : [];
    });
    const legacyCustomers = legacyMetrics.find((metric) => metric.label === "客户总数");
    const legacyOrders = legacyMetrics.find((metric) => metric.label === "订单总数");
    const customerValue = customers?.displayValue ?? legacyCustomers?.value;
    const orderValue = orders?.displayValue ?? legacyOrders?.value;
    const rewritten: string[] = [];

    if (customerValue && orderValue) {
      const parts = [
        `本次数据覆盖 ${customerValue} 位客户和 ${orderValue} 笔订单`,
        revenue ? `销售额为 ${revenue.displayValue}` : "",
        aov ? `客单价为 ${aov.displayValue}` : "",
        repeatRate ? `复购率为 ${repeatRate.displayValue}` : ""
      ].filter(Boolean);

      rewritten.push(`${parts.join("，")}，样本规模可以支持基础的电商经营分析。后续可重点分析客户贡献、订单规模、商品表现、复购情况和销售趋势。`);
    } else if (customerValue) {
      rewritten.push(`本次数据覆盖 ${customerValue} 位客户，可用于分析客户结构、订单贡献和复购情况。`);
    } else if (orderValue) {
      rewritten.push(`当前共有 ${orderValue} 笔订单，说明数据可以支持订单规模、商品表现和销售趋势分析。`);
    }

    const normalized = items
      .filter((item) => !/giving a business-level signal|^[A-Za-z][A-Za-z\s]+ is /i.test(item))
      .map((item) => item
        .replace(/\bTotal Customers\b/g, "客户总数")
        .replace(/\bTotal Orders\b/g, "订单总数")
        .replace(/\bEstimated GMV\b/g, "销售额")
        .replace(/\bRevenue\b/g, "销售额")
        .replace(/\bAOV\b/g, "客单价")
        .replace(/\bRepeat Purchase Rate\b/g, "复购率")
      );

    return Array.from(new Set([...rewritten, ...normalized])).slice(0, 3);
  };
  const rawSummaryBullets = report.coreSummaryBullets?.length ? report.coreSummaryBullets : [report.coreSummary].filter(Boolean);
  const summaryBullets = zhNaturalSummaryBullets(rawSummaryBullets)
    .map((item) => localeSafeText(item, "", locale))
    .filter(Boolean)
    .slice(0, 3);
  const keyMetrics = report.coreMetricOverview.filter(isBusinessStructuredMetric).slice(0, 8);
  const nonBusinessFindingPattern = /More aggregation evidence|Structured aggregation evidence|directional observation|technical|system missing|当前结论仍需要|当前缺少结构化聚合证据|方向性观察|缺少业务基准支撑强判断|可以用于判断|可以分析/i;
  const findingHasBusinessContent = (item: {
    title?: string;
    summary?: string;
    finding?: string;
    currentConclusion?: string;
    supportingEvidence?: string;
    deeperAnalysisResult?: string;
    businessMeaning?: string;
    businessImplication?: string;
    recommendedDecision?: string;
    nextAction?: string;
  }) => {
    const joined = [
      item.title,
      item.summary,
      item.finding,
      item.currentConclusion,
      item.supportingEvidence,
      item.deeperAnalysisResult,
      item.businessMeaning,
      item.businessImplication,
      item.recommendedDecision,
      item.nextAction
    ].filter(Boolean).join(" ");

    return Boolean(joined.trim()) &&
      !nonBusinessFindingPattern.test(joined);
  };
  const structuredFindings = (report.generatedInsights?.keyFindings ?? [])
    .filter((item) => item.id !== "generic-directional")
    .filter(findingHasBusinessContent)
    .slice(0, 4);
  const fallbackFindings = (report.keyFindings ?? [])
    .filter((item) => item && !nonBusinessFindingPattern.test(item))
    .filter((item) => locale === "zh" || !containsCjkText(item))
    .slice(0, 4)
    .map((item, index) => ({
      id: `finding-summary-${index}`,
      title: isZh ? "关键业务发现" : "Key business finding",
      summary: item,
      finding: item,
      currentConclusion: item,
      supportingEvidence: "",
      deeperAnalysisResult: "",
      businessImplication: "",
      recommendedDecision: "",
      caveat: "",
      businessMeaning: "",
      riskOrOpportunity: undefined,
      nextAction: "",
      confidenceReason: "",
      limitations: [],
      evidenceMetrics: [],
      evidenceValues: {},
      evidenceObjects: [],
      joinedTables: [],
      joinKey: undefined,
      nextBreakdown: [],
      confidence: 0.65
    }));
  const findings = structuredFindings.length
    ? structuredFindings
    : fallbackFindings;
  const earlyBusinessText = (value: string | undefined | null, fallback = "") => {
    if (!value) return fallback;
    if (nonBusinessFindingPattern.test(value)) return fallback;
    if (locale === "en" && containsCjkText(value)) return fallback;

    return value
      .replace(/CSV\s*-\s*[^，。；;]+/g, "")
      .replace(/\b(joined tables?|join key|threshold|Top\/Bottom ranking support)\b/gi, "")
      .trim() || fallback;
  };
  const localeDynamicText = (value: string | undefined | null, fallback = "") => {
    if (!value) return fallback;
    const normalized = String(value)
      .replace(/（[^）]*[\u3400-\u9fff][^）]*）/g, "")
      .replace(/\([^)]*[\u3400-\u9fff][^)]*\)/g, "")
      .replace(/[，、]/g, ", ")
      .replace(/。/g, ". ")
      .replace(/：/g, ": ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) return fallback;
    if (locale === "en" && containsCjkText(normalized)) return fallback;

    return normalized;
  };
  const opportunityBusinessText = (value: string | undefined | null, fallback = "") =>
    businessOpportunityCopy(localeDynamicText(value, fallback), locale, fallback);
  const opportunityTechnicalCriterion = (item: GeneratedOpportunityViewData) => {
    const raw = [
      item.comparisonEvidence,
      item.comparison,
      item.metricEvidence
    ].find((part) => /P75|P25|median|percentile|AverageRating|records|sample count|field name/i.test(String(part ?? "")));

    if (!raw) return "";

    return String(raw)
      .replace(/,\s*/g, "；")
      .replace(/，\s*/g, "；")
      .replace(/\s+/g, " ")
      .trim();
  };
  const localeObjectSummary = (rows?: Array<Record<string, string | number | null>>) => {
    const labels = businessObjectRows(rows)
      .slice(0, 3)
      .map((row, index) => {
        const label = evidenceObjectLabel(row, index);

        if (!isBusinessObjectLabel(label)) return "";
        if (locale === "en" && containsCjkText(label)) return "";

        const values = evidenceObjectValues(row, 2, locale)
          .map((value) => localeDynamicText(value))
          .filter(Boolean);

        return values.length ? `${label} (${values.join(", ")})` : label;
      })
      .filter(Boolean);

    return labels.join(locale === "zh" ? "、" : ", ");
  };
  const joinSentenceParts = (parts: string[]) => {
    const visibleParts = parts.map((part) => localeDynamicText(part)).filter(Boolean);
    const joined = visibleParts.join(locale === "zh" ? "" : " ");

    if (locale === "en" && containsCjkText(joined)) return "";

    return joined;
  };
  const firstSentence = (value: string | undefined | null, fallback = "") => {
    const normalized = localeDynamicText(value, fallback);

    if (!normalized) return fallback;

    const parts = normalized
      .split(locale === "zh" ? /[。！？]/ : /(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    return parts[0] ?? normalized;
  };
  const compactEvidenceValues = (values?: Record<string, string | number | null>) =>
    Object.entries(values ?? {})
      .filter(([key, value]) =>
        value != null &&
        String(value).trim() &&
        !/objects?|groups?|examples?/i.test(key)
      )
      .slice(0, 2)
      .map(([key, value]) => `${key}: ${String(value)}`);
  const compactBusinessEvidenceValues = (values?: Record<string, string | number | null>) =>
    compactEvidenceValues(values).map((value) => businessOpportunityCopy(value, locale));
  const riskBadgeLabel = (item: GeneratedRiskViewData) => {
    const type = item.riskType ?? item.type;

    if (/sample|structure|concentration/i.test(type)) return isZh ? "样本结构风险" : "Sample structure";
    if (/data|estimated|dedup|benchmark|limitation/i.test(type)) return isZh ? "数据口径限制" : "Data limitation";
    if (/negative/i.test(type)) return isZh ? "负向反馈风险" : "Negative feedback";
    if (/conversion/i.test(type)) return isZh ? "转化风险" : "Conversion risk";
    if (/high_volume_low_quality|quality/i.test(type)) return isZh ? "高规模低质量" : "High scale, low quality";

    return item.severity === "high" ? (isZh ? "业务风险" : "Business risk") : (isZh ? "关注" : "Watch");
  };
  const caveatBadgeLabel = (value: string | undefined | null) => {
    const normalized = localeDynamicText(value);

    if (!normalized) return "";
    if (/records|样本|sample|structure|覆盖|集中/i.test(normalized)) return isZh ? "样本口径" : "Sample caveat";
    if (/estimated|估算/i.test(normalized)) return isZh ? "估算值" : "Estimated";
    if (/dedup|duplicate|去重|重复/i.test(normalized)) return isZh ? "未去重" : "Raw";

    return isZh ? "口径提醒" : "Caveat";
  };
  const backendBusinessRisks = report.generatedInsights?.businessRisks ?? report.businessRisks ?? [];
  const backendGrowthOpportunities = report.generatedInsights?.growthOpportunities ?? report.growthOpportunities ?? [];
  const backendDataLimitations = report.generatedInsights?.dataLimitations ?? report.dataLimitations ?? [];
  const businessRiskItems = backendBusinessRisks.flatMap((item) => {
    const rawObjects = item.affectedObjects ?? item.objects ?? [];
    const visibleObjects = businessObjectRows(rawObjects, { excludeTinySamples: true });
    const hasOnlyTinyObjects = rawObjects.length > 0 && !visibleObjects.length && hasTinyObjectSample(rawObjects);
    const objectSummary = localeObjectSummary(visibleObjects);

    if (hasOnlyTinyObjects && /negative|sentiment|负向|负面|情绪/i.test([item.title, item.businessImpact, item.businessMeaning].join(" "))) {
      return [];
    }
    const metricEvidenceText = localeDynamicText(item.metricEvidence);
    const comparisonText = localeDynamicText(item.comparisonEvidence ?? item.comparison);
    const meaningText = earlyBusinessText(item.businessMeaning, "");
    const impactText = earlyBusinessText(item.businessImpact, "");
    const decisionText = earlyBusinessText(item.recommendedAction, "");
    const caveatText = earlyBusinessText(item.caveat, "");
    const targetObjects = visibleObjects
      .slice(0, 5)
      .map((row, index) => evidenceObjectLabel(row, index))
      .filter((label) => isBusinessObjectLabel(label));
    const keyEvidence = [
      metricEvidenceText,
      comparisonText,
      ...compactEvidenceValues(item.evidenceValues)
    ].filter(Boolean).slice(0, 2);
    const businessJudgment = firstSentence(meaningText || impactText, isZh
      ? "当前发现需要结合对象级指标继续判断业务影响"
      : "This finding needs object-level metrics before judging business impact.");
    const recommendedAction = firstSentence(decisionText, isZh
      ? "优先补充或比较相关对象的质量、转化、收入和反馈表现"
      : "Compare quality, conversion, revenue, and feedback for the related objects.");
    const fullDetails = joinSentenceParts([
      objectSummary ? `${isZh ? "对象：" : "Objects: "}${objectSummary}${isZh ? "。" : "."}` : "",
      metricEvidenceText ? `${metricEvidenceText}${isZh ? "。" : "."}` : "",
      comparisonText ? `${comparisonText}${isZh ? "。" : "."}` : "",
      meaningText ? `${meaningText}${isZh ? "。" : "."}` : "",
      impactText ? `${impactText}${isZh ? "。" : "."}` : "",
      decisionText ? `${isZh ? "建议决策：" : "Action: "}${decisionText}` : "",
      caveatText ? `${isZh ? "口径提醒：" : "Caveat: "}${caveatText}` : "",
      item.confidenceReason ? `${isZh ? "置信依据：" : "Confidence: "}${item.confidenceReason}` : ""
    ]);

    if (!keyEvidence.length && !targetObjects.length && !businessJudgment.trim()) return [];

    return [{
      id: item.id,
      title: earlyBusinessText(item.title, isZh ? "业务风险" : "Business risk"),
      badge: riskBadgeLabel(item),
      targetObjects,
      keyEvidence,
      businessJudgment,
      recommendedAction,
      caveatBadge: caveatBadgeLabel(caveatText),
      caveat: caveatText,
      details: fullDetails
    }];
  }).slice(0, 5);
  const growthOpportunityItems = backendGrowthOpportunities.flatMap((item) => {
    const rawObjects = item.targetObjects ?? item.objects ?? [];
    const visibleObjects = businessObjectRows(rawObjects, { excludeTinySamples: true });
    const objectSummary = localeObjectSummary(visibleObjects);
    const title = opportunityBusinessText(earlyBusinessText(item.title, isZh ? "增长机会" : "Growth opportunity"), isZh ? "增长机会" : "Growth opportunity");
    const metricEvidenceText = opportunityBusinessText(item.metricEvidence);
    const comparisonText = opportunityBusinessText(item.comparisonEvidence ?? item.comparison);
    const meaningText = opportunityBusinessText(earlyBusinessText(item.businessMeaning, ""));
    const decisionText = opportunityBusinessText(earlyBusinessText(item.recommendedAction, ""));
    const caveatText = opportunityBusinessText(earlyBusinessText(item.caveat, ""));
    const technicalCriterion = opportunityTechnicalCriterion(item);
    const targetObjects = visibleObjects
      .slice(0, 5)
      .map((row, index) => evidenceObjectLabel(row, index))
      .filter((label) => isBusinessObjectLabel(label));
    const keyEvidence = [
      metricEvidenceText,
      comparisonText,
      ...compactBusinessEvidenceValues(item.evidenceValues)
    ].filter(Boolean).slice(0, 2);
    const businessJudgment = firstSentence(meaningText, isZh
      ? "当前对象具备进一步验证的增长潜力"
      : "These objects are candidates for growth validation.");
    const recommendedAction = firstSentence(decisionText, isZh
      ? "用小规模曝光、推荐位或投放测试验证机会"
      : "Validate with a small exposure, placement, or acquisition test.");
    const fullDetails = joinSentenceParts([
      objectSummary ? `${isZh ? "候选对象：" : "Candidates: "}${objectSummary}${isZh ? "。" : "."}` : "",
      metricEvidenceText ? `${metricEvidenceText}${isZh ? "。" : "."}` : "",
      comparisonText ? `${comparisonText}${isZh ? "。" : "."}` : "",
      meaningText ? `${meaningText}${isZh ? "。" : "."}` : "",
      decisionText ? `${isZh ? "测试动作：" : "Test action: "}${decisionText}` : "",
      caveatText ? `${isZh ? "口径提醒：" : "Caveat: "}${caveatText}` : "",
      technicalCriterion ? `${isZh ? "技术口径：" : "Technical definition: "}${technicalCriterion}` : "",
      item.confidenceReason ? `${isZh ? "置信依据：" : "Confidence: "}${item.confidenceReason}` : ""
    ]);

    if (!keyEvidence.length && !targetObjects.length && !businessJudgment.trim()) return [];

    return [{
      id: item.id,
      title,
      badge: item.priority === "high" ? (isZh ? "高机会" : "High") : item.priority === "low" ? (isZh ? "低优先级" : "Low") : (isZh ? "机会" : "Opportunity"),
      targetObjects,
      keyEvidence,
      businessJudgment,
      recommendedAction,
      caveatBadge: caveatBadgeLabel(caveatText),
      caveat: caveatText,
      details: fullDetails
    }];
  }).slice(0, 5);
  const limitationCards = backendDataLimitations.slice(0, 5).map((item) => ({
    id: item.id,
    title: localeDynamicText(item.title, isZh ? "数据口径与限制" : "Definition and limitation"),
    body: localeDynamicText(
      `${item.limitation ?? item.message ?? ""}${item.impact ? `${isZh ? "。影响：" : ". Impact: "}${item.impact}` : ""}${item.suggestedFix ? `${isZh ? "。建议：" : ". Suggested fix: "}${item.suggestedFix}` : ""}`,
      isZh ? "该限制已收入口径详情。" : "This limitation is available in the definition details."
    )
  }));
  const insightActions = report.generatedInsights?.recommendedActions ?? [];
  const nextActionPlan = report.generatedInsights?.nextActionPlan;
  const nextActionInsights = nextActionPlan?.actionInsights ?? nextActionPlan?.priorityActions ?? [];
  const missingDataRequests = nextActionPlan?.missingDataRequests ?? [];
  const actionCaveats = nextActionPlan?.caveats ?? [];
  const businessActions = insightActions.filter((item) => item.type !== "data_quality_action").slice(0, 3);
  const dataQualityActions = insightActions.filter((item) => item.type === "data_quality_action").slice(0, 3);
  const fallbackBusinessRecommendations = report.recommendations.filter((item) => item.type !== "data_quality_action").slice(0, 3);
  const fallbackDataRecommendations = report.recommendations.filter((item) => item.type === "data_quality_action").slice(0, 3);
  const priorityActions = [...businessActions, ...dataQualityActions].slice(0, 5);
  const fallbackPriorityActions = [...fallbackBusinessRecommendations, ...fallbackDataRecommendations].slice(0, 5);
  const normalizedPriorityActions = nextActionInsights.length
    ? nextActionInsights.map((item) => ({
      id: item.id,
      title: item.title,
      priority: item.priority,
      actionType: item.actionType,
      basedOn: item.basedOn,
      targetObjects: item.targetObjects,
      currentFinding: item.currentFinding,
      whyItMatters: item.businessMeaning,
      businessMeaning: item.businessMeaning,
      recommendedAction: item.recommendedAction,
      action: item.recommendedAction,
      expectedOutcome: item.expectedImpact,
      expectedImpact: item.expectedImpact,
      keyEvidence: item.keyEvidence ?? item.evidence,
      executionSteps: item.executionSteps ?? [],
      deliverable: item.deliverable,
      ownerHint: item.ownerHint,
      timeHorizon: item.timeHorizon,
      estimatedRoiOrValue: undefined,
      caveats: item.caveat ? [item.caveat] : [],
      requiredDataIfAny: [],
      evidenceMetrics: item.evidenceMetrics,
      evidenceRankings: item.evidenceRankings,
      referencedObjects: item.targetObjects,
      referencedFields: [],
      targetSegment: item.targetSegment,
      evidence: item.evidence,
      confidence: item.confidence
    }))
    : priorityActions.map((item) => ({
      ...item,
      evidence: item.evidence ?? item.evidenceMetrics?.join("、") ?? item.basedOn.join("、"),
      keyEvidence: item.evidence ?? item.evidenceMetrics?.join("、") ?? item.basedOn.join("、"),
      businessMeaning: item.whyItMatters ?? item.expectedImpact ?? item.expectedOutcome,
      executionSteps: [],
      deliverable: undefined,
      ownerHint: undefined,
      timeHorizon: undefined,
      confidence: undefined
    }));
  const isDataAction = (item: (typeof normalizedPriorityActions)[number]) =>
    item.actionType === "fix_data_quality_for_decision" ||
    item.actionType === "collect_missing_business_data" ||
    (item.requiredDataIfAny?.length ?? 0) > 0;
  const objectGroupKey = (objects?: string[]) => (objects ?? [])
    .map((object) => object.toLowerCase().replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .sort()
    .slice(0, 4)
    .join("|");
  const visibleActionObjects = (objects?: string[]) => (objects ?? [])
    .map((object) => localeDynamicText(object, ""))
    .map((object) => object.trim())
    .filter((object) => object && isBusinessObjectLabel(object) && !/^-?\d+(\.\d+)?$/.test(object))
    .slice(0, 5);
  const actionFallbackCopy = (item: {
    actionType?: string;
    title?: string;
    targetObjects?: string[];
    referencedObjects?: string[];
    recommendedAction?: string;
    action?: string;
    expectedImpact?: string;
    expectedOutcome?: string;
    deliverable?: string;
  }) => {
    const objects = visibleActionObjects(item.targetObjects?.length ? item.targetObjects : item.referencedObjects);
    const objectText = objects.length ? objects.join(", ") : "the identified objects";

    if (item.actionType === "reduce_negative_feedback") {
      return {
        title: "Review negative-feedback app candidates",
        currentFinding: `${objectText} have been flagged as negative-feedback candidates in the current report.`,
        businessMeaning: "These apps may concentrate user experience issues. Treat them as investigation leads when sample size is limited.",
        recommendedAction: "Review negative comments, group issues by feature defects, performance, ads experience, version changes, pricing, and compatibility, then prioritize the top themes.",
        deliverable: "Negative feedback issue list",
        expectedImpact: "Reduce the impact of negative feedback on ratings, retention, conversion, and word of mouth."
      };
    }

    if (item.actionType === "scale_opportunity_object" || item.actionType === "expand_high_performing_segment") {
      return {
        title: "Screen high-quality growth candidates",
        currentFinding: `${objectText} are the strongest category or object candidates in the current report.`,
        businessMeaning: "These segments already show scale or quality signals and can be used to build a focused growth-test pool.",
        recommendedAction: "Screen for apps with ratings above the overall average or 4.5+, negative sentiment below the overall average, enough review samples, and room to grow installs.",
        deliverable: "Growth-test candidate list",
        expectedImpact: "Turn category scale into validated ASO, recommendation, or paid acquisition tests."
      };
    }

    if (item.actionType === "fix_data_quality_for_decision") {
      return {
        title: "Generate deduped scale metrics",
        currentFinding: "Some scale metrics may use raw records and can be inflated by duplicate entities.",
        businessMeaning: "Raw scale can overstate market size, review volume, or concentration.",
        recommendedAction: "Generate Deduped Total Installs, Deduped Total Reviews, and Deduped Top Share, then compare them with the raw metrics.",
        deliverable: "Raw vs Deduped comparison table",
        expectedImpact: "Improve confidence in market scale, concentration, and opportunity prioritization."
      };
    }

    if (item.actionType === "collect_missing_business_data") {
      return {
        title: "Add actual revenue and cost fields",
        currentFinding: "Estimated value can support directional prioritization, but actual ROI cannot be verified without revenue and cost fields.",
        businessMeaning: "Monetization decisions need actual revenue, cost, ad spend, or acquisition cost fields.",
        recommendedAction: "Add paid_amount, order_amount, transaction_amount, revenue, cost, ad_spend, and acquisition_cost to validate estimated value and calculate actual ROI / ROAS.",
        deliverable: "Estimated Value vs Actual Revenue / ROI / ROAS validation table",
        expectedImpact: "Determine whether estimated value can support monetization, campaign return, and resource allocation decisions."
      };
    }

    return {
      title: "Prioritize the identified operating action",
      currentFinding: objects.length
        ? `${objectText} are the main objects surfaced by the current report.`
        : "The current report has surfaced an actionable operating signal.",
      businessMeaning: "This signal can guide the next operating decision, but the details should stay tied to the available evidence.",
      recommendedAction: "Use the identified objects and metrics to decide the next operating action.",
      deliverable: "Operating action checklist",
      expectedImpact: "Improve the accuracy and focus of the next operating decision."
    };
  };
  const localizedActionField = (
    value: string | undefined | null,
    fallback: string
  ) => localeDynamicText(value, fallback);
  const actionTitleText = (item: {
    actionType?: string;
    title: string;
    recommendedAction?: string;
    action?: string;
    requiredDataIfAny?: string[];
  }) => {
    if (item.actionType === "fix_data_quality_for_decision") return isZh ? "生成去重后的规模指标" : "Generate deduped scale metrics";
    if (item.actionType === "collect_missing_business_data" && /paid_amount|order_amount|transaction_amount|revenue|cost|ad_spend|acquisition_cost|真实收入|收入|成本|ROI|ROAS/i.test([
      item.title,
      item.recommendedAction,
      item.action,
      ...(item.requiredDataIfAny ?? [])
    ].join(" "))) {
      return isZh ? "补充真实收入和成本字段" : "Add actual revenue and cost fields";
    }
    if (item.actionType === "scale_opportunity_object" || item.actionType === "expand_high_performing_segment") {
      return isZh ? "筛选头部类别中的高质量增长候选" : "Screen high-quality growth candidates";
    }
    if (item.actionType === "reduce_negative_feedback") return isZh ? "排查负向反馈候选 App" : "Review negative-feedback app candidates";

    return localeDynamicText(item.title, isZh ? item.title : actionFallbackCopy(item).title);
  };
  const conciseCaveats = (caveats?: string[]) => (caveats ?? []).map((caveat) => {
    if (!isZh) {
      if (/小样本|small sample/i.test(caveat)) return "Small-sample lead";
      if (/估算|estimated/i.test(caveat)) return "Estimated";
      if (/去重|重复|原始|dedup|raw/i.test(caveat)) return "Raw metric";

      return localeDynamicText(caveat, "Caveat");
    }
    if (/小样本/.test(caveat)) return "小样本线索";
    if (/估算/.test(caveat)) return "估算值";
    if (/去重|重复|原始/.test(caveat)) return "未去重";

    return caveat;
  });
  const isDedupCaveat = (caveat: string) => /未去重|去重|重复|原始|dedup|duplicate|raw metric|raw definition/i.test(caveat);
  const businessActionCaveatText = (caveats?: string[]) => {
    const labels = conciseCaveats(caveats);

    if (labels.some(isDedupCaveat)) {
      return isZh
        ? "安装量为原始口径，正式判断前建议参考去重版本。"
        : "Install metrics use the raw definition; use deduped values before making final decisions.";
    }

    return "";
  };
  const conciseBusinessCaveats = (caveats?: string[]) => conciseCaveats(caveats).filter((caveat) => !isDedupCaveat(caveat));
  const dedupedNormalizedPriorityActions = normalizedPriorityActions.filter((item, index, items) => {
    if (isDataAction(item)) return true;

    const key = objectGroupKey(item.targetObjects?.length ? item.targetObjects : item.referencedObjects);
    if (!key) return true;

    return items.findIndex((candidate) =>
      !isDataAction(candidate) &&
      objectGroupKey(candidate.targetObjects?.length ? candidate.targetObjects : candidate.referencedObjects) === key
    ) === index;
  });
  const businessNextActions = dedupedNormalizedPriorityActions.filter((item) => !isDataAction(item)).slice(0, 3);
  const dataRequestActions = missingDataRequests.map((item) => ({
    id: `missing-action-${item.id}`,
    title: item.missingFieldType === "revenue"
      ? (isZh ? "补充真实收入和成本字段" : "Add actual revenue and cost fields")
      : item.missingFieldType === "cost"
        ? (isZh ? "补真实成本字段" : "Add actual cost fields")
        : item.missingFieldType === "time"
          ? (isZh ? "补时间字段" : "Add time fields")
          : item.missingFieldType === "entity_id"
    ? (isZh ? "生成稳定实体口径" : "Add stable entity identifiers")
            : (isZh ? "补强决策数据" : "Add decision data"),
    priority: item.priority,
    actionType: "collect_missing_business_data",
    basedOn: [item.whyNeeded],
    targetObjects: [],
    currentFinding: "",
    whyItMatters: item.whyNeeded,
    recommendedAction: item.missingFieldType === "revenue"
      ? (isZh
        ? "补充 paid_amount、order_amount、transaction_amount、revenue、cost、ad_spend、acquisition_cost，用于验证 Estimated Paid App Install Value，并计算真实 ROI / ROAS。"
        : "Add paid_amount, order_amount, transaction_amount, revenue, cost, ad_spend, and acquisition_cost to validate Estimated Paid App Install Value and calculate actual ROI / ROAS.")
      : `${isZh ? "补充" : "Add"} ${item.suggestedFields.join(isZh ? "、" : ", ")}${isZh ? "。" : "."}`,
    action: item.missingFieldType === "revenue"
      ? (isZh
        ? "补充 paid_amount、order_amount、transaction_amount、revenue、cost、ad_spend、acquisition_cost，用于验证 Estimated Paid App Install Value，并计算真实 ROI / ROAS。"
        : "Add paid_amount, order_amount, transaction_amount, revenue, cost, ad_spend, and acquisition_cost to validate Estimated Paid App Install Value and calculate actual ROI / ROAS.")
      : `${isZh ? "补充" : "Add"} ${item.suggestedFields.join(isZh ? "、" : ", ")}${isZh ? "。" : "."}`,
    expectedOutcome: item.whatItEnables,
    expectedImpact: item.whatItEnables,
    keyEvidence: item.whyNeeded,
    executionSteps: item.missingFieldType === "revenue"
      ? (isZh
        ? ["补充 paid_amount、order_amount、transaction_amount、revenue、cost、ad_spend、acquisition_cost。", "将收入和成本字段接入 ROI / ROAS 指标计算。"]
        : ["Add paid_amount, order_amount, transaction_amount, revenue, cost, ad_spend, and acquisition_cost.", "Use the revenue and cost fields in ROI / ROAS calculations."])
      : [`${isZh ? "补充" : "Add"} ${item.suggestedFields.join(isZh ? "、" : ", ")}${isZh ? "。" : "."}`, isZh ? "将新增字段接入后续指标计算和报告生成。" : "Use the new fields in future metric calculation and report generation."],
    deliverable: item.missingFieldType === "revenue" ? (isZh ? "Estimated Value vs Actual Revenue / ROI / ROAS 验证表" : "Estimated Value vs Actual Revenue / ROI / ROAS validation table") : (isZh ? "数据补充清单" : "Data collection checklist"),
    ownerHint: undefined,
    timeHorizon: "this_month" as const,
    estimatedRoiOrValue: undefined,
    caveats: [],
    requiredDataIfAny: item.suggestedFields,
    evidenceMetrics: [],
    evidenceRankings: [],
    referencedObjects: [],
    referencedFields: [],
    targetSegment: undefined,
    evidence: item.whyNeeded,
    confidence: undefined
  }));
  const dataNextActions = [
    ...dedupedNormalizedPriorityActions.filter(isDataAction),
    ...dataRequestActions
  ].filter((item, index, items) => items.findIndex((candidate) => candidate.title === item.title) === index)
    .slice(0, Math.min(2, Math.max(0, 5 - businessNextActions.length)));
  const limitationSummary = limitationCards.length
    ? isZh
      ? "部分指标存在估算、未去重、缺少 benchmark 或样本量限制，已在相关行动建议中标注"
      : "Some metrics have estimation, deduplication, benchmark, or sample-size caveats. They are marked in the relevant actions."
    : text.limitationSummaryDefault;
  const limitations = [
    ...report.dataOverview,
    ...report.limitations,
    ...report.evidence
  ].filter(Boolean);
  const actionDetails = (fields?: string[]) => {
    const detailFields = reportDetailFields(fields);

    if (!detailFields.length) return null;

    return (
      <details className="mt-2 text-xs leading-5 text-muted-foreground">
        <summary className="cursor-pointer font-medium text-slate-600">{isZh ? "查看口径" : "View definitions"}</summary>
        <p className="mt-1">
          {isZh ? "相关字段：" : "Related fields: "}{detailFields.join(isZh ? "、" : ", ")}
        </p>
      </details>
    );
  };
  const displayActionText = (action: string, fields?: string[], fallback?: string) => {
    const detailFields = reportDetailFields(fields);
    const fieldPhrase = detailFields.length
      ? isZh
        ? `，重点按 ${detailFields.slice(0, 2).join(" 和 ")} 对比`
        : `, compare by ${detailFields.slice(0, 2).join(" and ")}`
      : "";

    const cleaned = action
      .replace(/，重点使用[^。]+维度/g, fieldPhrase)
      .replace(/基于真实存在的 [^。]+ 维度生成/g, detailFields.length ? `基于 ${detailFields.slice(0, 2).join(" 和 ")} 生成` : "基于可用业务维度生成")
      .replace(/\s+/g, " ")
      .trim();

    return localeDynamicText(cleaned, fallback ?? (isZh ? "" : "Use the identified objects to decide the next operating action."));
  };
  const executionStepsFor = (item: {
    actionType?: string;
    targetObjects?: string[];
    executionSteps?: string[];
    recommendedAction?: string;
    action?: string;
  }) => {
    const providedSteps = item.executionSteps?.length ? item.executionSteps
      .slice(0, 5)
      .map((step) => localeDynamicText(step))
      .filter(Boolean) : [];

    if (providedSteps.length) return providedSteps;

    const localizedObjects = visibleActionObjects(item.targetObjects);
    const objects = localizedObjects.length ? localizedObjects.join(isZh ? "、" : ", ") : (isZh ? "重点对象" : "the priority objects");
    if (item.actionType === "reduce_negative_feedback") {
      return isZh
        ? [
          `拉取 ${objects} 的负向评论原文。`,
          "按功能缺陷、性能卡顿、广告体验、版本问题、价格/付费、兼容性分类。",
          "统计每类问题的出现次数和代表性评论。",
          "输出 Top 3 负面问题主题和对应修复建议。"
        ]
        : [
          `Review the negative comments for ${objects}.`,
          "Classify issues by feature defects, performance, ads experience, version changes, pricing, and compatibility.",
          "Count each issue theme and capture representative comments.",
          "Produce the top 3 issue themes and recommended fixes."
        ];
    }
    if (item.actionType === "scale_opportunity_object" || item.actionType === "expand_high_performing_segment") {
      return isZh
        ? [
          `把 ${objects} 与其他类别做对比表。`,
          "列出 installs、rating、review volume、negative sentiment rate。",
          "筛选高评分、低负向反馈、安装量仍有提升空间的 App。",
          "输出增长实验候选清单。"
        ]
        : [
          `Compare ${objects} against the remaining categories.`,
          "Include installs, rating, review volume, and negative sentiment rate.",
          "Screen for apps with high ratings, low negative feedback, and room to grow installs.",
          "Produce a growth-test candidate list."
        ];
    }

    return [displayActionText(item.recommendedAction ?? item.action ?? "", undefined, actionFallbackCopy(item).recommendedAction)].filter(Boolean);
  };
  const deliverableForDisplay = (item: {
    actionType?: string;
    deliverable?: string;
  }) => {
    if (item.deliverable) return localeDynamicText(item.deliverable, isZh ? item.deliverable : actionFallbackCopy(item).deliverable);
    if (item.actionType === "reduce_negative_feedback") return isZh ? "负向反馈问题清单" : "Negative feedback issue list";
    if (item.actionType === "scale_opportunity_object") return isZh ? "增长实验候选清单" : "Growth-test candidate list";
    if (item.actionType === "expand_high_performing_segment") return isZh ? "头部类别质量风险对比表" : "Top category quality-risk comparison table";
    if (item.actionType === "collect_missing_business_data") return isZh ? "Estimated Value vs Actual Revenue / ROI / ROAS 验证表" : "Estimated Value vs Actual Revenue / ROI / ROAS validation table";
    if (item.actionType === "fix_data_quality_for_decision") return isZh ? "Raw vs Deduped 对比表" : "Raw vs Deduped comparison table";

    return isZh ? "经营行动清单" : "Operating action checklist";
  };
  const dataActionCopy = (item: {
    actionType?: string;
    title: string;
    whyItMatters?: string;
    evidence?: string;
    recommendedAction?: string;
    action?: string;
    expectedImpact?: string;
    expectedOutcome?: string;
    deliverable?: string;
  }) => {
    if (item.actionType === "fix_data_quality_for_decision") {
      return {
        whyNeeded: isZh ? "Total Installs、Total Reviews 和 Top Share 当前可能受重复 App 影响。" : "Total Installs, Total Reviews, and Top Share may be affected by duplicate app records.",
        action: isZh ? "生成 Deduped Total Installs、Deduped Total Reviews、Deduped Top Share，并与 Raw 指标并列展示。" : "Generate Deduped Total Installs, Deduped Total Reviews, and Deduped Top Share, then show them next to the raw metrics.",
        output: isZh ? "Raw vs Deduped Total Installs / Reviews / Top Share 对比表" : "Raw vs Deduped Total Installs / Reviews / Top Share comparison table",
        decisionImpact: isZh ? "提高市场规模、集中度和机会优先级判断的可信度。" : "Improve confidence in market scale, concentration, and opportunity prioritization."
      };
    }
    if (item.actionType === "collect_missing_business_data") {
      return {
        whyNeeded: isZh ? "当前 Estimated Paid App Install Value 只能作为估算变现信号，缺少真实收入和成本字段时无法判断 ROI / ROAS。" : "Estimated Paid App Install Value is only a directional monetization signal; actual revenue and cost fields are required to judge ROI / ROAS.",
        action: isZh ? "补充 paid_amount、order_amount、transaction_amount、revenue、cost、ad_spend、acquisition_cost，用于验证 Estimated Paid App Install Value，并计算真实 ROI / ROAS。" : "Add paid_amount, order_amount, transaction_amount, revenue, cost, ad_spend, and acquisition_cost to validate Estimated Paid App Install Value and calculate actual ROI / ROAS.",
        output: isZh ? "Estimated Value vs Actual Revenue / ROI / ROAS 验证表" : "Estimated Value vs Actual Revenue / ROI / ROAS validation table",
        decisionImpact: isZh ? "判断估算价值是否能支撑真实变现、投放回报和资源投入决策。" : "Determine whether the estimated value can support monetization, campaign return, and resource allocation decisions."
      };
    }

    return {
      whyNeeded: localeDynamicText(item.whyItMatters ?? item.evidence, isZh ? "该数据会影响报告可信度和经营判断。" : "This data affects report credibility and operating decisions."),
      action: displayActionText(item.recommendedAction ?? item.action ?? "", undefined, actionFallbackCopy(item).recommendedAction),
      output: localeDynamicText(item.deliverable, isZh ? "数据补强结果" : "Data improvement output"),
      decisionImpact: localeDynamicText(item.expectedImpact ?? item.expectedOutcome, isZh ? "提升后续报告和行动优先级判断的可信度。" : "Improve confidence in future reports and action prioritization.")
    };
  };
  const displayFindingSummary = (item: { summary?: string; finding?: string; businessMeaning?: string }) => {
    const raw = item.summary ?? item.finding ?? "";
    if (locale === "en" && containsCjkText(raw)) {
      return text.fallbackSummary;
    }
    const mixedMetricList = raw.includes(" 为 ") &&
      raw.split("；").length >= 3 &&
      /installs|category|trading volume|sentiment|rating/i.test(raw);

    if (mixedMetricList) {
      return item.businessMeaning ??
        (isZh
          ? "这些指标来自不同业务模块，只能说明当前已完成基础计算；需要按业务模块分别解读，不能混成同一个经营结论"
          : "These metrics come from different business modules. They show that baseline calculations are complete, but they should be interpreted by module rather than merged into one operating conclusion.");
    }

    return raw;
  };
  const blockedFindingAction = /建议比较|建议分析|建议查看|建议提取|下一步验证|后续可以|继续拆解|可用于判断|反映当前情况|当前可以|可以直接|可以做方向观察|当前指标可以|缺少业务基准支撑强判断|已经具备.*信息|可以用于识别/;
  const technicalLineagePattern = /CSV\s*-|\.csv\b|joined\s+tables?|join\s+key|source\s+(dataset|table)|field\s+mapping|technical\s+lineage|schema\s+details|关联表|关联键|关联字段|关联数据源|字段映射|源表|技术\s*lineage|建立关联|跨表关联|通过[^。；;]*字段[^。；;]*(关联|join)|Top\/Bottom\s*排名|threshold|指标口径限制|置信度依据|已验证指标共同支撑|未去重口径风险|缺少质量排名|强风险结论/i;
  const hasTechnicalLineageText = (text?: string) => Boolean(text && technicalLineagePattern.test(text));
  const businessFindingFallback = (text: string, item?: { joinedTables?: string[]; joinKey?: string }) => {
    const source = `${text} ${(item?.joinedTables ?? []).join(" ")} ${item?.joinKey ?? ""}`;

    if (/app/i.test(source)) {
      return isZh
        ? "当前可在 App 视角同时观察安装量、评分和用户反馈；高安装但评分或反馈偏弱的 App 应优先进入排查清单。"
        : "The report can compare installs, ratings, and user feedback from the same App view. Apps with high scale but weak quality signals should be prioritized for review.";
    }

    if (/product|sku|商品|产品/i.test(source)) {
      return isZh
        ? "当前可在产品视角对比规模、质量和反馈表现；高规模低质量对象应优先优化，高质量低规模对象可作为增长候选。"
        : "The report can compare scale, quality, and feedback at the product level. High-scale low-quality objects should be optimized first, while high-quality low-scale objects can be growth candidates.";
    }

    return isZh
      ? "当前可在同一业务对象视角对比关键表现；报告应优先呈现风险对象、机会对象和对应业务动作。"
      : "The report can compare key business performance from the same object view and should prioritize risk objects, opportunity objects, and the actions tied to them.";
  };
  const businessSafeFindingText = (text: string, fallback: string, item?: { joinedTables?: string[]; joinKey?: string }) => {
    if (!text) return fallback;
    if (locale === "en" && containsCjkText(text)) return fallback || businessFindingFallback(text, item);
    if (!hasTechnicalLineageText(text)) return text;

    const cleaned = text
      .replace(/\n+/g, "。")
      .split(/[。！？!?；;]+/)
      .map((part) => part.trim())
      .filter((part) => part && !hasTechnicalLineageText(part))
      .join("。");

    return cleaned || businessFindingFallback(text, item);
  };
  const safeFindingText = (text: string, fallback: string, item?: { joinedTables?: string[]; joinKey?: string }) => {
    const candidate = text && !blockedFindingAction.test(text) ? text : fallback;

    return businessSafeFindingText(candidate, fallback, item);
  };
  const technicalDatasetLabel = (value: string) =>
    value
      .replace(/^CSV\s*-\s*/i, "")
      .replace(/\.csv$/i, "")
      .trim();
  const findingTechnicalDetails = (item: {
    joinedTables?: string[];
    joinKey?: string;
    sourceDatasets?: string[];
    technicalDetails?: {
      joinedTables?: string[];
      joinKey?: string;
      sourceDatasets?: string[];
      fieldMapping?: Record<string, string>;
      joinConfidence?: number;
      caveat?: string;
    };
    currentConclusion?: string;
    supportingEvidence?: string;
    deeperAnalysisResult?: string;
    businessImplication?: string;
    businessMeaning?: string;
    confidenceReason?: string;
  }) => {
    const details = item.technicalDetails ?? {};
    const joinedTables = details.joinedTables ?? item.joinedTables ?? [];
    const sourceDatasets = details.sourceDatasets ?? item.sourceDatasets ?? [];
    const joinKey = details.joinKey ?? item.joinKey;
    const lines: string[] = [];

    if (joinedTables.length) {
      lines.push(isZh
        ? `关联数据：${joinedTables.map(technicalDatasetLabel).join("、")}`
        : `Linked data: ${joinedTables.map(technicalDatasetLabel).join(", ")}`
      );
    } else if (sourceDatasets.length) {
      lines.push(isZh
        ? `关联数据：${sourceDatasets.map(technicalDatasetLabel).join("、")}`
        : `Linked data: ${sourceDatasets.map(technicalDatasetLabel).join(", ")}`
      );
    }

    if (joinKey) {
      lines.push(isZh ? `关联字段：${joinKey}` : `Join field: ${joinKey}`);
    }

    const fieldMapping = details.fieldMapping ? Object.entries(details.fieldMapping) : [];
    if (fieldMapping.length) {
      lines.push(isZh
        ? `字段映射：${fieldMapping.slice(0, 4).map(([from, to]) => `${from} → ${to}`).join("；")}`
        : `Field mapping: ${fieldMapping.slice(0, 4).map(([from, to]) => `${from} → ${to}`).join("; ")}`
      );
    }

    if (typeof details.joinConfidence === "number") {
      lines.push(isZh ? `关联置信度：${Math.round(details.joinConfidence * 100)}%` : `Join confidence: ${Math.round(details.joinConfidence * 100)}%`);
    }

    if (details.caveat) {
      lines.push(isZh ? `口径提醒：${details.caveat}` : `Caveat: ${localeDynamicText(details.caveat, "See definition details.")}`);
    }

    if (item.confidenceReason) {
      lines.push(isZh ? `置信度依据：${item.confidenceReason}` : `Confidence reason: ${localeDynamicText(item.confidenceReason, "See definition details.")}`);
    }

    if (!lines.length && [
      item.currentConclusion,
      item.supportingEvidence,
      item.deeperAnalysisResult,
      item.businessImplication,
      item.businessMeaning
    ].some(hasTechnicalLineageText)) {
      lines.push(isZh ? "技术关联信息已收起，主报告仅展示业务结论。" : "Technical lineage is collapsed; the main report only shows business conclusions.");
    }

    return lines;
  };
  const findingConclusion = (item: {
    currentConclusion?: string;
    summary?: string;
    finding?: string;
    businessMeaning?: string;
    joinedTables?: string[];
    joinKey?: string;
  }) => safeFindingText(
    item.currentConclusion ?? displayFindingSummary(item),
    isZh ? "当前已有指标结果，但旧报告缺少可直接展示的系统判断。" : "Metrics are available, but this saved report does not include a directly displayable business conclusion.",
    item
  );
  const findingEvidence = (item: {
    supportingEvidence?: string;
    evidenceMetrics?: string[];
    evidenceValues?: Record<string, string | number | null>;
    joinedTables?: string[];
    joinKey?: string;
  }) => {
    if (item.supportingEvidence) {
      return businessSafeFindingText(item.supportingEvidence, "", item);
    }

    const values = Object.entries(item.evidenceValues ?? {})
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .slice(0, 4)
      .map(([key, value]) => `${key} = ${formatReportMetricValue(value)}`)
      .join("；");

    return values || item.evidenceMetrics?.slice(0, 4).join("、") || "";
  };
  const findingDeeperAnalysis = (item: {
    deeperAnalysisResult?: string;
    finding?: string;
    summary?: string;
    joinedTables?: string[];
    joinKey?: string;
  }) => safeFindingText(
    item.deeperAnalysisResult ?? item.finding ?? item.summary ?? "",
    isZh ? "当前缺少结构化进一步分析结论；本卡片不展示任务式建议。" : "Structured deeper analysis is not available for this saved report.",
    item
  );
  const findingDecision = (item: {
    recommendedDecision?: string;
    nextAction?: string;
    joinedTables?: string[];
    joinKey?: string;
  }) => {
    const decision = item.recommendedDecision ?? item.nextAction ?? "";

    return decision
      ? safeFindingText(
        decision,
        isZh
          ? "建议先把相关对象加入体验排查清单，重点查看负面反馈、评分变化、用户影响面和可执行优化项。"
          : "Put the relevant objects on the experience review list and focus on negative feedback, rating changes, user impact, and actionable fixes.",
        item
      )
      : "";
  };
  const findingImplication = (item: {
    businessImplication?: string;
    businessMeaning?: string;
    joinedTables?: string[];
    joinKey?: string;
  }) => businessSafeFindingText(item.businessImplication ?? item.businessMeaning ?? "", "", item);
  const findingCaveat = (item: {
    caveat?: string;
    limitations?: string[];
    joinedTables?: string[];
    joinKey?: string;
  }) => businessSafeFindingText(item.caveat ?? item.limitations?.[0] ?? "", "", item);
  const findingTextBundle = (item: {
    title?: string;
    currentConclusion?: string;
    summary?: string;
    finding?: string;
    supportingEvidence?: string;
    deeperAnalysisResult?: string;
    businessMeaning?: string;
    businessImplication?: string;
    recommendedDecision?: string;
    nextAction?: string;
  }) => [
    item.title,
    item.currentConclusion,
    item.summary,
    item.finding,
    item.supportingEvidence,
    item.deeperAnalysisResult,
    item.businessMeaning,
    item.businessImplication,
    item.recommendedDecision,
    item.nextAction
  ].filter(Boolean).join(" ");
  const categoryInstallInsight = (item: {
    title?: string;
    evidenceObjects?: Array<Record<string, string | number | null>>;
    evidenceValues?: Record<string, string | number | null>;
    currentConclusion?: string;
    summary?: string;
    finding?: string;
    supportingEvidence?: string;
  }) => {
    const text = findingTextBundle(item);
    const hasCategorySignal = /category|类别/i.test(text) ||
      (item.evidenceObjects ?? []).some((row) => row.Category || row.category);
    const hasInstallSignal = /install|安装/i.test(text) ||
      (item.evidenceObjects ?? []).some((row) => rowNumberByPattern(row, [/installs?/i, /安装/]) != null);

    if (!hasCategorySignal || !hasInstallSignal) return null;

    const rows = (item.evidenceObjects ?? [])
      .map((row, index) => {
        const label = evidenceObjectLabel(row, index);
        const installs = rowNumberByPattern(row, [/installs?/i, /安装/, /^value$/i]);
        const rating = rowNumberByPattern(row, [/rating/i, /score/i, /评分/]);
        const reviewVolume = rowNumberByPattern(row, [/review/i, /评论/]);
        const negativeRate = rowNumberByPattern(row, [/negative.*rate/i, /负向.*率/]);

        return { label, installs, rating, reviewVolume, negativeRate };
      })
      .filter((row) => row.installs != null)
      .sort((left, right) => (right.installs ?? 0) - (left.installs ?? 0))
      .slice(0, 3);

    if (!rows.length) return null;

    const totalInstalls = evidenceValueByPattern(item.evidenceValues, [/total.*installs?/i, /总.*安装/]);
    const topSum = rows.reduce((sum, row) => sum + (row.installs ?? 0), 0);
    const share = normalizedShare(topSum, totalInstalls);
    const hasQualityData = rows.some((row) => row.rating != null || row.reviewVolume != null || row.negativeRate != null);

    return { rows, topSum, share, hasQualityData };
  };
  const negativeFeedbackRows = (item: {
    title?: string;
    evidenceObjects?: Array<Record<string, string | number | null>>;
    currentConclusion?: string;
    summary?: string;
    finding?: string;
    supportingEvidence?: string;
    deeperAnalysisResult?: string;
  }) => {
    const text = findingTextBundle(item);
    if (!/negative|负向|负面|sentiment|情绪/i.test(text)) return [];

    return (item.evidenceObjects ?? [])
      .map((row, index) => {
        const label = evidenceObjectLabel(row, index);
        const negativeRate = explicitNegativeRateFromRow(row);
        const sampleSize = sentimentSampleSizeFromRow(row);
        const negativeCount = negativeCountFromRow(row);

        return { label, negativeRate, sampleSize, negativeCount };
      })
      .filter((row) => row.negativeRate != null || row.negativeCount != null)
      .slice(0, 5);
  };
  const businessSummaryBullets = summaryBullets
    .map((item) => businessSafeFindingText(
      item,
      text.fallbackSummary,
      {}
    ))
    .filter((item) => item && !hasTechnicalLineageText(item))
    .slice(0, 3);
  const visibleSummaryBullets = businessSummaryBullets.length
    ? businessSummaryBullets
    : [text.fallbackSummary];

  return (
    <div className="grid gap-3">
      <Card className="border-emerald-100 bg-emerald-50/35 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-emerald-800">{text.coreSummary}</p>
            <Badge variant="secondary">AI Brief</Badge>
          </div>
          <div className="mt-3 grid gap-2">
            {visibleSummaryBullets.map((item, index) => (
              <div key={`${index}-${item}`} className="flex gap-2 text-sm leading-6 text-slate-700">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-700" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{text.keyMetrics}</CardTitle>
          <CardDescription>{text.keyMetricsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {keyMetrics.map((metric) => (
            <div key={metric.metricId} className="min-w-0 rounded-2xl border bg-secondary/10 p-4" title={`公式：${metric.formula}\n口径：${metric.grain}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold">{metric.displayName}</p>
                {metric.warning ? (
                  <Badge variant="secondary" className="shrink-0 text-amber-800">
                    {metricWarningLabel(metric, locale)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{metric.displayValue}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {localeSafeText(
                  metric.explanation,
                  isZh ? "当前报告中的核心业务指标。" : "Core business KPI from the current report.",
                  locale
                )}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{text.keyFindings}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {findings.length ? findings.map((item) => {
            const technicalDetails = findingTechnicalDetails(item);
            const categoryInsight = categoryInstallInsight(item);
            const negativeRows = negativeFeedbackRows(item);

            return (
            <div key={item.id} className="rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold">{businessSafeFindingText(item.title, isZh ? "关键业务发现" : "Key business finding", item)}</p>
                <Badge variant="secondary">{Math.round((item.confidence ?? 0.7) * 100)}%</Badge>
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500">{text.currentConclusion}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{findingConclusion(item)}</p>
                </div>
                {findingEvidence(item) ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">{text.evidence}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{findingEvidence(item)}</p>
                  </div>
                ) : null}
                {findingDeeperAnalysis(item) ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">{text.deeperAnalysis}</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-800">{findingDeeperAnalysis(item)}</p>
                  </div>
                ) : null}
                {technicalDetails.length ? (
                  <details className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs leading-5 text-slate-600">
                    <summary className="cursor-pointer font-medium text-slate-700">{text.lineageDetails}</summary>
                    <div className="mt-2 space-y-1">
                      {technicalDetails.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
              {categoryInsight ? (
                <div className="mt-3 rounded-xl bg-emerald-50/60 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-emerald-900">{text.topCategoryContribution}</p>
                    {categoryInsight.share != null ? (
                      <Badge variant="secondary" className="text-emerald-800">
                        Top 3 Category Installs Share: {formatPercent(categoryInsight.share)}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 grid gap-1">
                    {categoryInsight.rows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 text-xs leading-5 text-emerald-950">
                        <span className="min-w-0 truncate font-medium">{row.label}</span>
                        <span className="shrink-0 text-emerald-800">{formatReportMetricValue(row.installs)} installs</span>
                      </div>
                    ))}
                  </div>
                  {categoryInsight.share != null ? (
                    <p className="mt-2 text-xs leading-5 text-emerald-900">
                      {isZh
                        ? `前三类合计约 ${formatReportMetricValue(categoryInsight.topSum)} installs，占总安装量 ${formatPercent(categoryInsight.share)}。`
                        : `The top three categories total about ${formatReportMetricValue(categoryInsight.topSum)} installs, accounting for ${formatPercent(categoryInsight.share)} of total installs.`}
                    </p>
                  ) : null}
                  {categoryInsight.hasQualityData ? (
                    <div className="mt-3 overflow-hidden rounded-lg border border-emerald-100 bg-white">
                      <div className="grid grid-cols-4 gap-2 border-b bg-emerald-50/70 px-3 py-2 text-[11px] font-semibold text-emerald-900">
                        <span>{text.category}</span>
                        <span>{text.installs}</span>
                        <span>{text.rating}</span>
                        <span>{text.negativeRateReviews}</span>
                      </div>
                      {categoryInsight.rows.map((row) => (
                        <div key={`${row.label}-quality`} className="grid grid-cols-4 gap-2 border-b px-3 py-2 text-[11px] text-slate-700 last:border-b-0">
                          <span className="truncate font-medium">{row.label}</span>
                          <span>{formatReportMetricValue(row.installs)}</span>
                          <span>{row.rating != null ? formatReportMetricValue(row.rating) : "-"}</span>
                          <span>
                            {row.negativeRate != null ? formatPercent(row.negativeRate > 1 ? row.negativeRate / 100 : row.negativeRate) : "-"}
                            {row.reviewVolume != null ? ` / ${formatReportMetricValue(row.reviewVolume)}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 rounded-lg bg-white/80 px-3 py-2 text-xs leading-5 text-amber-900">
                      {text.missingCategoryQuality}
                    </p>
                  )}
                </div>
              ) : null}
              {negativeRows.length ? (
                <div className="mt-3 rounded-xl bg-amber-50/70 p-3">
                  <p className="text-xs font-semibold text-amber-950">{text.negativeCandidates}</p>
                  <div className="mt-2 grid gap-1">
                    {negativeRows.map((row) => {
                      const rate = row.negativeRate == null
                        ? "-"
                        : formatPercent(row.negativeRate);
                      const smallSample = row.sampleSize != null && row.sampleSize < 20;
                      const missingSample = row.sampleSize == null;

                      return (
                        <div key={row.label} className="grid gap-1 rounded-lg bg-white/70 px-3 py-2 text-xs leading-5 text-amber-950 md:grid-cols-[1fr_auto] md:items-center">
                          <span className="min-w-0 truncate font-medium">{row.label}</span>
                          <span className="flex flex-wrap items-center gap-2 text-amber-800">
                            <span>{text.negativeRate} {rate}</span>
                            <span>{missingSample ? text.sampleMissing : `${text.sampleSize} ${row.sampleSize}`}</span>
                            <span>{text.negativeCount} {row.negativeCount ?? "-"}</span>
                            {smallSample ? <Badge variant="secondary" className="text-amber-800">{text.smallSampleLead}</Badge> : null}
                            {missingSample ? <Badge variant="secondary" className="text-amber-800">{text.validationLead}</Badge> : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-amber-900">
                    {text.negativeSampleCaveat}
                  </p>
                </div>
              ) : null}
              {item.evidenceObjects?.length && !categoryInsight && !negativeRows.length ? (
                <div className="mt-3 rounded-xl bg-emerald-50/60 p-3">
                  <p className="text-xs font-semibold text-emerald-900">{text.evidenceObjects}</p>
                  <div className="mt-2 grid gap-1">
                    {item.evidenceObjects.slice(0, 3).map((row, index) => {
                      const label = evidenceObjectLabel(row, index);
                      const values = evidenceObjectValues(row, 4, locale).join(" · ");

                      return (
                        <div key={`${label}-${index}`} className="rounded-lg bg-white/60 px-2 py-1.5 text-xs leading-5 text-emerald-950">
                          <p className="font-medium break-words">{label}</p>
                          {values ? <p className="mt-0.5 break-words text-emerald-800">{values}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                  {item.evidenceObjects.length > 3 ? (
                    <details className="mt-2 text-xs text-emerald-900">
                      <summary className="cursor-pointer font-medium">{text.viewFullRanking}</summary>
                      <div className="mt-2 max-h-44 overflow-auto rounded-lg border border-emerald-100 bg-white">
                        {item.evidenceObjects.slice(3, 10).map((row, index) => {
                          const label = evidenceObjectLabel(row, index + 3);
                          const values = evidenceObjectValues(row, 4, locale).join(" · ");

                          return (
                            <div key={`${label}-detail-${index}`} className="border-b px-3 py-2 last:border-b-0">
                              <p className="break-words font-medium text-slate-700">{label}</p>
                              {values ? <p className="mt-0.5 break-words text-muted-foreground">{values}</p> : null}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : null}
              {findingImplication(item) ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-500">{text.businessMeaning}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{findingImplication(item)}</p>
                </div>
              ) : null}
              {item.riskOrOpportunity ? (
                <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  {businessSafeFindingText(item.riskOrOpportunity, "", item)}
                </p>
              ) : null}
              {findingDecision(item) ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-slate-500">{text.recommendedDecision}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-700">{findingDecision(item)}</p>
                </div>
              ) : null}
              {findingCaveat(item) ? (
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{text.caveatPrefix}{findingCaveat(item)}</p>
              ) : null}
              {item.limitations?.length ? (
                <div className="mt-3 space-y-1">
                  {item.limitations.slice(0, 2).map((limitation) => (
                    <p key={limitation} className="text-xs leading-5 text-slate-500">
                      {businessSafeFindingText(
                        limitation,
                        isZh ? "该限制已收入口径详情。" : "This limitation is available in the definition details.",
                        item
                      )}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
            );
          }) : (
            <p className="text-sm leading-6 text-muted-foreground md:col-span-2">{text.noKeyFindings}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        {businessRiskItems.length ? (
          <Card className="border bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{text.businessRisks}</CardTitle>
              <CardDescription>{text.businessRisksDescription}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{text.riskSummary}</p>
              {businessRiskItems.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-xl border bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-semibold leading-5">{item.title}</p>
                    <Badge variant="secondary" className="shrink-0">{item.badge}</Badge>
                  </div>
                  {item.targetObjects.length ? (
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{text.targetObjects}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.targetObjects.slice(0, 5).map((object) => (
                          <span key={object} className="rounded-full border bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                            {object}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {item.keyEvidence.length ? (
                    <div className="mt-2 grid gap-1">
                      <p className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{text.keyEvidence}</p>
                      {item.keyEvidence.slice(0, 2).map((evidence) => (
                        <p key={evidence} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs leading-5 text-slate-700">{evidence}</p>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 grid gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{text.businessJudgment}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-700">{item.businessJudgment}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{text.recommendedActionShort}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-700">{item.recommendedAction}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.caveatBadge ? <Badge variant="secondary" className="border bg-white text-[11px]">{item.caveatBadge}</Badge> : null}
                    {item.details ? (
                      <details className="text-xs text-slate-600">
                        <summary className="cursor-pointer font-medium text-slate-700">{isZh ? "查看口径" : "View definitions"}</summary>
                        <p className="mt-2 rounded-lg bg-slate-50 p-2 leading-5">{item.details}</p>
                      </details>
                    ) : null}
                  </div>
                </div>
              ))}
              {businessRiskItems.length > 3 ? (
                <details className="rounded-xl border border-dashed p-3 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-700">{text.viewAll}</summary>
                  <div className="mt-2 space-y-2">
                    {businessRiskItems.slice(3).map((item) => (
                      <div key={item.id} className="rounded-lg bg-slate-50 p-2">
                        <p className="font-semibold text-slate-800">{item.title}</p>
                        <p className="mt-1 leading-5">{item.businessJudgment}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card className="border bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{text.businessRisks}</CardTitle>
              <CardDescription>{text.businessRisksDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs leading-5 text-muted-foreground">{text.noBusinessRisks}</p>
            </CardContent>
          </Card>
        )}
        <Card className="border bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{text.growthOpportunities}</CardTitle>
            <CardDescription>{text.growthDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {growthOpportunityItems.length ? <>
              <p className="rounded-lg bg-emerald-50/70 px-3 py-2 text-xs leading-5 text-emerald-900">{text.growthSummary}</p>
              {growthOpportunityItems.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-xl border bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-semibold leading-5">{item.title}</p>
                    <Badge variant="secondary" className="shrink-0">{item.badge}</Badge>
                  </div>
                  {item.targetObjects.length ? (
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{text.targetObjects}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.targetObjects.slice(0, 5).map((object) => (
                          <span key={object} className="rounded-full border bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800">
                            {object}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {item.keyEvidence.length ? (
                    <div className="mt-2 grid gap-1">
                      <p className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{text.keyEvidence}</p>
                      {item.keyEvidence.slice(0, 2).map((evidence) => (
                        <p key={evidence} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs leading-5 text-slate-700">{evidence}</p>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 grid gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{text.businessJudgment}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-700">{item.businessJudgment}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-normal text-slate-500">{text.recommendedActionShort}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-700">{item.recommendedAction}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.caveatBadge ? <Badge variant="secondary" className="border bg-white text-[11px]">{item.caveatBadge}</Badge> : null}
                    {item.details ? (
                      <details className="text-xs text-slate-600">
                        <summary className="cursor-pointer font-medium text-slate-700">{text.viewDetails}</summary>
                        <p className="mt-2 rounded-lg bg-slate-50 p-2 leading-5">{item.details}</p>
                      </details>
                    ) : null}
                  </div>
                </div>
              ))}
              {growthOpportunityItems.length > 3 ? (
                <details className="rounded-xl border border-dashed p-3 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium text-slate-700">{text.viewAll}</summary>
                  <div className="mt-2 space-y-2">
                    {growthOpportunityItems.slice(3).map((item) => (
                      <div key={item.id} className="rounded-lg bg-slate-50 p-2">
                        <p className="font-semibold text-slate-800">{item.title}</p>
                        <p className="mt-1 leading-5">{item.businessJudgment}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </> : (
              <p className="text-xs leading-5 text-muted-foreground">{text.noGrowth}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border bg-white shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{text.nextActions}</CardTitle>
          <CardDescription>{text.nextActionsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-xs font-semibold text-slate-500">{text.businessActions}</p>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {businessNextActions.length ? businessNextActions.map((item) => {
                const actionCopy = actionFallbackCopy(item);
                const objects = visibleActionObjects(item.targetObjects?.length ? item.targetObjects : item.referencedObjects);
                const caveats = conciseBusinessCaveats(item.caveats);
                const caveatText = businessActionCaveatText(item.caveats);

                return (
                  <div key={item.id} className="rounded-2xl border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{actionTitleText(item)}</p>
                      </div>
                      <Badge variant="secondary">{item.priority === "high" ? "High" : item.priority === "low" ? "Low" : "Medium"}</Badge>
                    </div>
                    {objects?.length ? (
                      <p className="mt-1 text-xs leading-5 text-emerald-800">{text.objects}{objects.join(isZh ? "、" : ", ")}</p>
                    ) : null}
                    {item.keyEvidence ?? item.evidence ? (
                      <p className="mt-2 text-xs leading-5 text-slate-600">
                        {text.evidencePrefix}{localizedActionField(item.keyEvidence ?? item.evidence, isZh ? "当前报告已形成可执行证据。" : "The report has produced actionable evidence.")}
                      </p>
                    ) : null}
                    <div className="mt-3 rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-700">{text.currentInsight}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-700">
                        {localizedActionField(
                          item.currentFinding,
                          isZh ? "当前报告已形成对象、分组或指标级判断。" : actionCopy.currentFinding
                        )}
                      </p>
                      {item.businessMeaning ? (
                        <>
                          <p className="mt-3 text-xs font-semibold text-slate-700">{text.businessMeaning}</p>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {localizedActionField(item.businessMeaning, isZh ? "该发现会影响后续经营判断。" : actionCopy.businessMeaning)}
                          </p>
                        </>
                      ) : null}
                      {item.recommendedAction ?? item.action ? (
                        <>
                          <p className="mt-3 text-xs font-semibold text-slate-700">{text.systemJudgment}</p>
                          <p className="mt-2 text-xs leading-5 text-emerald-800">
                            {displayActionText(item.recommendedAction ?? item.action ?? "", undefined, actionCopy.recommendedAction)}
                          </p>
                        </>
                      ) : null}
                      {executionStepsFor(item).length ? (
                        <details className="mt-3 text-xs leading-5 text-slate-600">
                          <summary className="cursor-pointer font-semibold text-slate-700">{text.executionChecklist}</summary>
                          <ol className="mt-2 list-decimal space-y-1 pl-4">
                            {executionStepsFor(item).map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        </details>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-700">{text.deliverable}{deliverableForDisplay(item)}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {text.expectedImpact}{localizedActionField(item.expectedImpact ?? item.expectedOutcome, isZh ? "提升后续经营判断的准确性。" : actionCopy.expectedImpact)}
                    </p>
                    {caveatText ? (
                      <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{text.caveatPrefix}{caveatText}</p>
                    ) : null}
                    {caveats.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {caveats.slice(0, 3).map((caveat) => (
                          <Badge key={caveat} variant="secondary" className="text-amber-800">{caveat}</Badge>
                        ))}
                      </div>
                    ) : null}
                    {actionDetails(item.referencedFields)}
                  </div>
                );
              }) : fallbackPriorityActions.filter((item) => item.type !== "data_quality_action").slice(0, 3).map((item) => (
                <div key={item.title} className="rounded-2xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{localeDynamicText(item.title, isZh ? item.title : "Recommended action")}</p>
                    <Badge variant="secondary">{item.priority}</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{text.evidencePrefix}{localizedActionField(item.basedOn, isZh ? "当前报告已形成可执行证据。" : "The report has produced actionable evidence.")}</p>
                  {item.referencedObjects?.length ? (
                    <p className="mt-1 text-xs leading-5 text-emerald-800">{text.objects}{visibleActionObjects(item.referencedObjects).join(isZh ? "、" : ", ")}</p>
                  ) : null}
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{text.executionAction}{displayActionText(item.action, item.referencedFields, "Use the identified objects to decide the next operating action.")}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{text.expectedImpact}{localizedActionField(item.reason, isZh ? "提升后续经营判断的准确性。" : "Improve the accuracy of the next operating decision.")}</p>
                  {actionDetails(item.referencedFields)}
                </div>
              ))}
              {!businessNextActions.length && !fallbackPriorityActions.filter((item) => item.type !== "data_quality_action").length ? (
                <p className="text-xs leading-5 text-muted-foreground">{text.noBusinessActions}</p>
              ) : null}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500">{text.dataActions}</p>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {dataNextActions.length ? dataNextActions.map((item) => {
                const caveats = conciseCaveats(item.caveats);
                const copy = dataActionCopy(item);

                return (
                <div key={item.id} className="rounded-2xl border border-dashed p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{actionTitleText(item)}</p>
                    <Badge variant="secondary">{item.priority}</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{text.whyNeeded}{copy.whyNeeded}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{text.executionAction}{copy.action}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-700">{text.output}{copy.output}</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-800">{text.decisionImpact}{copy.decisionImpact}</p>
                  {item.requiredDataIfAny?.length ? (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{text.requiredData}{item.requiredDataIfAny.join(isZh ? "、" : ", ")}</p>
                  ) : null}
                  {caveats.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {caveats.slice(0, 3).map((caveat) => (
                        <Badge key={caveat} variant="secondary" className="text-amber-800">{caveat}</Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                );
              }) : (
                <p className="text-xs leading-5 text-muted-foreground">{text.noDataActions}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <details className="rounded-2xl border bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold">{text.viewLimitations}</summary>
        <div className="mt-3 grid gap-2">
          <p className="text-xs leading-5 text-muted-foreground">{limitationSummary}</p>
          {limitationCards.map((item) => (
            <div key={item.id} className="rounded-xl border bg-secondary/10 p-3">
              <p className="text-xs font-semibold">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.body}</p>
            </div>
          ))}
          {limitations.slice(0, 10).map((item) => (
            <p key={item} className="text-xs leading-5 text-muted-foreground">
              {localeDynamicText(item, isZh ? "该限制已收入口径详情。" : "This limitation is available in the definition details.")}
            </p>
          ))}
          {actionCaveats.map((item) => (
            <div key={item.id} className="rounded-xl border bg-secondary/10 p-3">
              <p className="text-xs font-semibold">{localeDynamicText(item.type, isZh ? "口径提醒" : "Caveat")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {localeDynamicText(item.message, isZh ? "该限制已收入口径详情。" : "This caveat is available in the definition details.")}
              </p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function ReportGeneratedPanel({
  briefing,
  metricResults,
  locale = "en"
}: {
  briefing: {
    title: string;
    summary: string;
    confidence?: number | null;
    createdAt?: string;
    payloadJson?: {
      generatedAt?: string;
      dataSourceName?: string;
      structuredReport?: StructuredReportViewData;
    } | null;
  };
  metricResults: ReportMetricEvidenceResult[];
  locale?: Locale;
}) {
  const computedResults = metricResults
    .filter((result) => result.status === "computed")
    .filter(hasDisplayableMetricResult)
    .filter(isBusinessReportMetricResult);
  const failedResults = metricResults.filter((result) => result.status === "failed");
  const narrative = buildReportNarrative(computedResults);
  const structuredReport = briefing.payloadJson?.structuredReport;

  return (
    <div className="grid gap-3">
      {structuredReport ? (
        <StructuredReportView report={structuredReport} locale={locale} />
      ) : (
        <>
      <Card className="border bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">核心结论</CardTitle>
          <CardDescription>
            基于当前已计算指标生成的经营分析，不展示原始明细
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/45 p-4">
            <p className="text-sm leading-7 text-slate-700">{narrative.overview}</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border p-4">
              <p className="text-sm font-semibold">关键发现</p>
              <div className="mt-3 space-y-3">
                {narrative.findings.slice(0, 4).map((finding) => (
                  <div key={finding.title} className="border-b pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">{finding.title}</p>
                      <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold">
                        {finding.value}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{finding.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <p className="text-sm font-semibold">异常信号</p>
              <div className="mt-3 space-y-2">
                {narrative.anomalySignals.map((signal) => (
                  <div key={signal} className="flex gap-2 text-xs leading-5 text-muted-foreground">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span>{signal}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border p-4">
              <p className="text-sm font-semibold">行动建议</p>
              <div className="mt-3 space-y-2">
                {narrative.actions.map((action, index) => (
                  <div key={action} className="flex gap-2 text-xs leading-5 text-muted-foreground">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-50 text-[11px] font-semibold text-emerald-800">
                      {index + 1}
                    </span>
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <p className="text-sm font-semibold">业务影响</p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {narrative.impact.map((item) => (
                <p key={item} className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  {item}
                </p>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
        </>
      )}

      {failedResults.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
          <CardContent className="p-4 text-sm text-amber-900">
            {failedResults.length} 个指标计算失败，已从本次报告中排除
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ReportSetupProgress({
  isZh,
  hasConnectedData,
  hasReport
}: {
  isZh: boolean;
  hasConnectedData: boolean;
  hasReport: boolean;
}) {
  const steps = isZh
    ? [
        { label: "数据已连接", done: hasConnectedData },
        { label: "字段已识别", done: hasConnectedData },
        { label: "指标已生成", done: hasReport },
        { label: "报告已生成", done: hasReport }
      ]
    : [
        { label: "Data connected", done: hasConnectedData },
        { label: "Schema mapped", done: hasConnectedData },
        { label: "Metrics generated", done: hasReport },
        { label: "Report ready", done: hasReport }
      ];

  return (
    <Card className="border-emerald-100 bg-white/90 shadow-sm">
      <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {steps.map((step) => (
            <div
              key={step.label}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                step.done
                  ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-secondary/35 text-muted-foreground"
              )}
            >
              <CheckCircle2 className={cn("size-3.5", step.done ? "text-emerald-700" : "text-slate-400")} />
              {step.label}
            </div>
          ))}
        </div>
        <Button asChild variant="outline" size="sm" className="w-full md:w-auto">
          <a href="/dashboard/import-data">
            {isZh ? "管理数据源" : "Manage data sources"}
            <ArrowRight />
          </a>
        </Button>
      </CardContent>
    </Card>
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

// Kept temporarily for comparison while the report page demo uses the metric evidence panel.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ReportSystemDemoPanel({ locale }: { locale: Locale }) {
  const isZh = locale === "zh";
  const monitoringItems = isZh
    ? [
        {
          index: "01",
          title: "经营指标变化",
          badge: "指标",
          summary: "识别核心经营、财务和绩效指标中的异常波动",
          tags: ["核心 KPI", "历史基线", "波动幅度"]
        },
        {
          index: "02",
          title: "客户与用户变化",
          badge: "人群",
          summary: "解释不同分群、cohort、使用行为和复购行为的变化",
          tags: ["用户分群", "cohort", "行为路径"]
        },
        {
          index: "03",
          title: "渠道与区域表现",
          badge: "市场",
          summary: "对比区域、渠道、门店、团队或业务单元的基线变化",
          tags: ["区域", "渠道", "业务单元"]
        },
        {
          index: "04",
          title: "流程转化",
          badge: "流程",
          summary: "定位用户、订单、线索或任务在关键业务流程中的流失位置",
          tags: ["流程步骤", "完成率", "流失点"]
        }
      ]
    : [
        {
          index: "01",
          title: "Business metric changes",
          badge: "Metrics",
          summary: "Detect unusual movement in core operating and financial metrics.",
          tags: ["Core KPI", "Baseline", "Variance"]
        },
        {
          index: "02",
          title: "Customer and user changes",
          badge: "Audience",
          summary: "Explain changes across segments, cohorts, behavior, and repeat purchase.",
          tags: ["Segments", "Cohort", "Path"]
        },
        {
          index: "03",
          title: "Channel and market performance",
          badge: "Market",
          summary: "Compare baseline shifts across regions, channels, stores, teams, or business units.",
          tags: ["Region", "Channel", "Unit"]
        },
        {
          index: "04",
          title: "Process conversion",
          badge: "Flow",
          summary: "Locate where users, orders, leads, or tasks drop in key business processes.",
          tags: ["Steps", "Completion", "Drop-off"]
        }
      ];
  const setupCards = isZh
    ? [
        { title: "分析前准备", items: ["连接业务数据", "确认指标定义"] },
        { title: "AI 将生成", items: ["趋势检查", "证据链"] },
        { title: "下一步", items: ["生成第一份报告", "检查指标逻辑"] }
      ]
    : [
        { title: "Before analysis", items: ["Connect business data", "Confirm metric definitions"] },
        { title: "AI will generate", items: ["Trend checks", "Evidence chains"] },
        { title: "Next steps", items: ["Generate first report", "Review metric logic"] }
      ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <Card className="border bg-white shadow-sm">
        <CardContent className="flex min-h-[460px] flex-col p-5">
          <Badge className="w-fit border-emerald-700/20 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
            {isZh ? "AI briefing 预览" : "AI briefing preview"}
          </Badge>
          <p className="mt-6 text-sm font-medium text-muted-foreground">
            {isZh ? "今日经营简报" : "Today's business briefing"}
          </p>
          <h3 className="mt-3 text-[clamp(28px,4vw,44px)] font-semibold leading-tight tracking-normal text-slate-950">
            {isZh ? "准备生成第一份经营简报" : "Ready to generate your first briefing"}
          </h3>
          <div className="mt-6 flex flex-wrap gap-2">
            {(isZh
              ? [["数据源", "待确认"], ["Schema", "待生成"], ["指标", "待确认"], ["报告", "未生成"]]
              : [["Data source", "Pending"], ["Schema", "Pending"], ["Metrics", "Pending"], ["Report", "Not generated"]]
            ).map(([label, value]) => (
              <Badge key={label} variant="secondary" className="rounded-full border bg-white px-3 py-1.5 text-xs">
                {label}<span className="ml-1 font-semibold text-rose-700">{value}</span>
              </Badge>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-6 text-muted-foreground">
            {isZh
              ? "AI 简报预览，连接业务数据后会展示真实数值和证据链。"
              : "Preview of the AI briefing. Real values and evidence chains appear after connecting business data."}
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {setupCards.map((card) => (
              <div key={card.title} className="rounded-xl border bg-slate-50/60 p-3">
                <p className="text-sm font-semibold text-slate-950">{card.title}</p>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                  {card.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-700" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-8">
            <Button asChild>
              <a href="/dashboard/import-data">
                {isZh ? "展开证据链" : "Expand evidence chain"}
                <ArrowRight />
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="/dashboard/reports">{isZh ? "查看趋势" : "View trend"} <ArrowRight /></a>
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="border bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BrainCircuit className="size-5 text-emerald-700" />
            {isZh ? "AI 监控范围" : "AI monitoring scope"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {monitoringItems.map((item) => (
            <div key={item.index} className="rounded-xl border border-slate-200 bg-white p-3 first:border-emerald-200 first:bg-emerald-50/50">
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-xs font-semibold text-emerald-800">
                  {item.index}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                    <Badge variant="secondary" className="text-[11px]">{item.badge}</Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span key={tag} className="rounded-full border bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function buildDemoReportMetricEvidence(locale: Locale, selectedRange: ReportTimeRange): {
  generatedAt: string;
  timeConfig: ReportTimeConfigViewData;
  metricResults: ReportMetricEvidenceResult[];
  trendMetrics: ReportTrendMetricViewData[];
  trendCharts: ReportTrendChartViewData[];
} {
  const isZh = locale === "zh";
  const generatedAt = "2026-06-09T23:59:00.000Z";
  const rangeStart = "2026-01-01";
  const rangeEnd = "2026-06-09";
  const trendSeries = {
    netSales: [
      { date: "2026-06-03", value: 29480 },
      { date: "2026-06-04", value: 31240 },
      { date: "2026-06-05", value: 30390 },
      { date: "2026-06-06", value: 31960 },
      { date: "2026-06-07", value: 30580 },
      { date: "2026-06-08", value: 28900 },
      { date: "2026-06-09", value: 27120 }
    ],
    orders: [
      { date: "2026-06-03", value: 735 },
      { date: "2026-06-04", value: 760 },
      { date: "2026-06-05", value: 742 },
      { date: "2026-06-06", value: 778 },
      { date: "2026-06-07", value: 751 },
      { date: "2026-06-08", value: 700 },
      { date: "2026-06-09", value: 680 }
    ],
    rating: [
      { date: "2026-06-03", value: 4.24 },
      { date: "2026-06-04", value: 4.22 },
      { date: "2026-06-05", value: 4.27 },
      { date: "2026-06-06", value: 4.21 },
      { date: "2026-06-07", value: 4.25 },
      { date: "2026-06-08", value: 4.26 },
      { date: "2026-06-09", value: 4.18 }
    ]
  };
  const scopeByRange: Record<ReportTimeRange, {
    start: string;
    end: string;
    previousStart: string | null;
    previousEnd: string | null;
    netSales: number;
    previousNetSales: number | null;
    orders: number;
    previousOrders: number | null;
    customers: number;
    previousCustomers: number | null;
    aov: number;
    previousAov: number | null;
    totalPaid: number;
    rating: number;
    previousRating: number | null;
  }> = {
    TODAY: {
      start: "2026-06-09",
      end: "2026-06-09",
      previousStart: "2026-06-08",
      previousEnd: "2026-06-08",
      netSales: 27120,
      previousNetSales: 28900,
      orders: 680,
      previousOrders: 700,
      customers: 656,
      previousCustomers: 662,
      aov: 39.88,
      previousAov: 41.27,
      totalPaid: 33680,
      rating: 4.18,
      previousRating: 4.26
    },
    "7D": {
      start: "2026-06-03",
      end: "2026-06-09",
      previousStart: "2026-05-27",
      previousEnd: "2026-06-02",
      netSales: 211670,
      previousNetSales: 224800,
      orders: 5146,
      previousOrders: 5290,
      customers: 4820,
      previousCustomers: 4920,
      aov: 41.13,
      previousAov: 42.50,
      totalPaid: 262470,
      rating: 4.23,
      previousRating: 4.27
    },
    "30D": {
      start: "2026-05-11",
      end: "2026-06-09",
      previousStart: "2026-04-11",
      previousEnd: "2026-05-10",
      netSales: 642900,
      previousNetSales: 671400,
      orders: 15520,
      previousOrders: 15880,
      customers: 11240,
      previousCustomers: 11380,
      aov: 41.42,
      previousAov: 42.28,
      totalPaid: 797200,
      rating: 4.05,
      previousRating: 4.08
    },
    "90D": {
      start: "2026-03-12",
      end: "2026-06-09",
      previousStart: "2025-12-12",
      previousEnd: "2026-03-11",
      netSales: 1908400,
      previousNetSales: 1835200,
      orders: 46120,
      previousOrders: 44480,
      customers: 16950,
      previousCustomers: 16420,
      aov: 41.38,
      previousAov: 41.26,
      totalPaid: 2366700,
      rating: 4.04,
      previousRating: 4.02
    },
    "12M": {
      start: "2026-01-01",
      end: "2026-06-09",
      previousStart: null,
      previousEnd: null,
      netSales: 3428884.38,
      previousNetSales: null,
      orders: 82911,
      previousOrders: null,
      customers: 17900,
      previousCustomers: null,
      aov: 41.36,
      previousAov: null,
      totalPaid: 4252736.92,
      rating: 4.04,
      previousRating: null
    },
    ALL: {
      start: rangeStart,
      end: rangeEnd,
      previousStart: null,
      previousEnd: null,
      netSales: 3428884.38,
      previousNetSales: null,
      orders: 82911,
      previousOrders: null,
      customers: 17900,
      previousCustomers: null,
      aov: 41.36,
      previousAov: null,
      totalPaid: 4252736.92,
      rating: 4.04,
      previousRating: null
    },
    CUSTOM: {
      start: rangeStart,
      end: rangeEnd,
      previousStart: null,
      previousEnd: null,
      netSales: 3428884.38,
      previousNetSales: null,
      orders: 82911,
      previousOrders: null,
      customers: 17900,
      previousCustomers: null,
      aov: 41.36,
      previousAov: null,
      totalPaid: 4252736.92,
      rating: 4.04,
      previousRating: null
    }
  };
  const scope = scopeByRange[selectedRange] ?? scopeByRange.ALL;
  const change = (current: number, previous: number | null) => previous ? (current - previous) / Math.abs(previous) : null;
  const direction = (current: number, previous: number | null): "up" | "down" | "flat" | "unknown" => {
    if (previous == null) return "unknown";
    if (Math.abs(current - previous) < 0.0001) return "flat";
    return current > previous ? "up" : "down";
  };
  const baseMetric = (metric: Omit<ReportMetricEvidenceResult, "status" | "computedAt" | "dateRangePreset" | "dateRangeStart" | "dateRangeEnd" | "dateField" | "hasTimeField" | "sourceDataset" | "businessType" | "validationStatus">): ReportMetricEvidenceResult => ({
    ...metric,
    status: "computed",
    computedAt: generatedAt,
    dateRangePreset: selectedRange,
    dateRangeStart: scope.start,
    dateRangeEnd: scope.end,
    dateField: "order_date",
    hasTimeField: true,
    sourceDataset: isZh ? "Demo 电商订单数据" : "Demo ecommerce orders",
    businessType: "ecommerce",
    validationStatus: "passed"
  });

  const metricResults: ReportMetricEvidenceResult[] = [
    baseMetric({
      metricId: "demo_net_sales",
      metricName: "net_sales",
      displayName: isZh ? "净销售额" : "Net Sales",
      metricCategory: "Revenue",
      formula: "SUM(net_sales)",
      value: scope.netSales,
      currentValue: scope.netSales,
      previousValue: scope.previousNetSales,
      percentChange: change(scope.netSales, scope.previousNetSales),
      changePercent: change(scope.netSales, scope.previousNetSales),
      changeDirection: direction(scope.netSales, scope.previousNetSales),
      currentStartDate: scope.start,
      currentEndDate: scope.end,
      previousStartDate: scope.previousStart,
      previousEndDate: scope.previousEnd,
      unit: "currency",
      priority: 1,
      isCoreMetric: true
    }),
    baseMetric({
      metricId: "demo_orders",
      metricName: "orders",
      displayName: isZh ? "订单数" : "Orders",
      metricCategory: "Orders",
      formula: "COUNT DISTINCT order_id",
      value: scope.orders,
      currentValue: scope.orders,
      previousValue: scope.previousOrders,
      percentChange: change(scope.orders, scope.previousOrders),
      changePercent: change(scope.orders, scope.previousOrders),
      changeDirection: direction(scope.orders, scope.previousOrders),
      currentStartDate: scope.start,
      currentEndDate: scope.end,
      previousStartDate: scope.previousStart,
      previousEndDate: scope.previousEnd,
      priority: 2,
      isCoreMetric: true
    }),
    baseMetric({
      metricId: "demo_customers",
      metricName: "customers",
      displayName: isZh ? "客户数" : "Customers",
      metricCategory: "Customers",
      formula: "COUNT DISTINCT customer_id",
      value: scope.customers,
      currentValue: scope.customers,
      previousValue: scope.previousCustomers,
      percentChange: change(scope.customers, scope.previousCustomers),
      changePercent: change(scope.customers, scope.previousCustomers),
      changeDirection: direction(scope.customers, scope.previousCustomers),
      currentStartDate: scope.start,
      currentEndDate: scope.end,
      previousStartDate: scope.previousStart,
      previousEndDate: scope.previousEnd,
      priority: 3,
      isCoreMetric: true
    }),
    baseMetric({
      metricId: "demo_aov",
      metricName: "average_order_value",
      displayName: isZh ? "客单价" : "AOV",
      metricCategory: "Revenue",
      formula: "SUM(net_sales) / COUNT DISTINCT order_id",
      value: scope.aov,
      currentValue: scope.aov,
      previousValue: scope.previousAov,
      percentChange: change(scope.aov, scope.previousAov),
      changePercent: change(scope.aov, scope.previousAov),
      changeDirection: direction(scope.aov, scope.previousAov),
      currentStartDate: scope.start,
      currentEndDate: scope.end,
      previousStartDate: scope.previousStart,
      previousEndDate: scope.previousEnd,
      unit: "currency",
      priority: 4,
      isCoreMetric: true
    }),
    baseMetric({
      metricId: "demo_total_paid",
      metricName: "total_paid",
      displayName: isZh ? "实付金额" : "Total Paid",
      metricCategory: "Revenue",
      formula: "SUM(total_paid)",
      value: scope.totalPaid,
      currentValue: scope.totalPaid,
      unit: "currency",
      priority: 5,
      isCoreMetric: true
    }),
    baseMetric({
      metricId: "demo_average_rating",
      metricName: "average_rating",
      displayName: isZh ? "平均客户评分" : "Average Rating",
      metricCategory: "Quality",
      formula: "AVG(customer_rating) IGNORE NULLS",
      value: scope.rating,
      currentValue: scope.rating,
      previousValue: scope.previousRating,
      percentChange: change(scope.rating, scope.previousRating),
      changePercent: change(scope.rating, scope.previousRating),
      changeDirection: direction(scope.rating, scope.previousRating),
      currentStartDate: scope.start,
      currentEndDate: scope.end,
      previousStartDate: scope.previousStart,
      previousEndDate: scope.previousEnd,
      metricDirection: "higher_is_better",
      priority: 8,
      isCoreMetric: true,
      sampleSize: 77382
    }),
    baseMetric({
      metricId: "demo_category_orders",
      metricName: "category_orders_by_category",
      displayName: isZh ? "品类订单数" : "Category Orders",
      metricCategory: "Category Performance",
      formula: "COUNT DISTINCT order_id BY category",
      scope: "group",
      value: 16620,
      priority: 20,
      rows: [
        { dimension: "Food & Beverage", value: 16620, sampleSize: 16620 },
        { dimension: "Beauty & Personal Care", value: 16420, sampleSize: 16420 },
        { dimension: "Home & Kitchen", value: 14776, sampleSize: 14776 },
        { dimension: "Electronics", value: 13720, sampleSize: 13720 },
        { dimension: "Fashion Accessories", value: 12840, sampleSize: 12840 }
      ]
    }),
    baseMetric({
      metricId: "demo_category_net_sales",
      metricName: "category_net_sales_by_category",
      displayName: isZh ? "品类净销售额" : "Category Net Sales",
      metricCategory: "Category Performance",
      formula: "SUM(net_sales) BY category",
      scope: "group",
      value: 724300,
      priority: 21,
      rows: [
        { dimension: "Electronics", value: 724300, sampleSize: 13720 },
        { dimension: "Home & Kitchen", value: 535900, sampleSize: 14776 },
        { dimension: "Fashion Accessories", value: 508200, sampleSize: 12840 },
        { dimension: "Food & Beverage", value: 468500, sampleSize: 16620 },
        { dimension: "Beauty & Personal Care", value: 496800, sampleSize: 16420 }
      ]
    }),
    baseMetric({
      metricId: "demo_channel_net_sales",
      metricName: "channel_net_sales_by_sales_channel",
      displayName: isZh ? "渠道净销售额" : "Channel Net Sales",
      metricCategory: "Channel Performance",
      formula: "SUM(net_sales) BY sales_channel",
      scope: "group",
      value: 1128400,
      priority: 22,
      rows: [
        { dimension: "Marketplace", value: 1128400, sampleSize: 27120 },
        { dimension: "Website", value: 1036500, sampleSize: 24980 },
        { dimension: "Mobile App", value: 782600, sampleSize: 18850 },
        { dimension: "Retail Partner", value: 481384, sampleSize: 11961 }
      ]
    }),
    baseMetric({
      metricId: "demo_country_net_sales",
      metricName: "country_net_sales_by_country",
      displayName: isZh ? "市场净销售额" : "Country Net Sales",
      metricCategory: "Market Performance",
      formula: "SUM(net_sales) BY country",
      scope: "group",
      value: 829600,
      priority: 23,
      rows: [
        { dimension: "United States", value: 829600, sampleSize: 19880 },
        { dimension: "Germany", value: 681300, sampleSize: 16240 },
        { dimension: "United Kingdom", value: 603500, sampleSize: 14520 },
        { dimension: "Canada", value: 528200, sampleSize: 12860 },
        { dimension: "Australia", value: 444900, sampleSize: 10370 }
      ]
    }),
    baseMetric({
      metricId: "demo_segment_customers",
      metricName: "segment_customers_by_customer_segment",
      displayName: isZh ? "客户分层客户数" : "Segment Customers",
      metricCategory: "Customer Segments",
      formula: "COUNT DISTINCT customer_id BY customer_segment",
      scope: "group",
      value: 9200,
      priority: 24,
      rows: [
        { dimension: "New", value: 9200, sampleSize: 9200 },
        { dimension: "Returning", value: 6200, sampleSize: 6200 },
        { dimension: "At Risk", value: 1800, sampleSize: 1800 },
        { dimension: "VIP", value: 700, sampleSize: 700 }
      ]
    })
  ];

  const trendMetrics: ReportTrendMetricViewData[] = [
    {
      metricName: "net_sales",
      businessModule: isZh ? "收入与销售" : "Revenue & Sales",
      dateField: "order_date",
      granularity: "day",
      currentValue: scope.netSales,
      previousValue: scope.previousNetSales,
      absoluteChange: scope.previousNetSales == null ? null : scope.netSales - scope.previousNetSales,
      percentChange: change(scope.netSales, scope.previousNetSales),
      changePercent: change(scope.netSales, scope.previousNetSales),
      changeDirection: direction(scope.netSales, scope.previousNetSales),
      metricDirection: "higher_is_better",
      currentStartDate: scope.start,
      currentEndDate: scope.end,
      previousStartDate: scope.previousStart,
      previousEndDate: scope.previousEnd,
      timeSeries: trendSeries.netSales
    },
    {
      metricName: "orders",
      businessModule: isZh ? "订单规模" : "Orders",
      dateField: "order_date",
      granularity: "day",
      currentValue: scope.orders,
      previousValue: scope.previousOrders,
      absoluteChange: scope.previousOrders == null ? null : scope.orders - scope.previousOrders,
      percentChange: change(scope.orders, scope.previousOrders),
      changePercent: change(scope.orders, scope.previousOrders),
      changeDirection: direction(scope.orders, scope.previousOrders),
      metricDirection: "higher_is_better",
      currentStartDate: scope.start,
      currentEndDate: scope.end,
      previousStartDate: scope.previousStart,
      previousEndDate: scope.previousEnd,
      timeSeries: trendSeries.orders
    },
    {
      metricName: "average_rating",
      businessModule: isZh ? "评分与质量" : "Ratings & Quality",
      dateField: "order_date",
      granularity: "day",
      currentValue: scope.rating,
      previousValue: scope.previousRating,
      absoluteChange: scope.previousRating == null ? null : scope.rating - scope.previousRating,
      percentChange: change(scope.rating, scope.previousRating),
      changePercent: change(scope.rating, scope.previousRating),
      changeDirection: direction(scope.rating, scope.previousRating),
      metricDirection: "higher_is_better",
      currentStartDate: scope.start,
      currentEndDate: scope.end,
      previousStartDate: scope.previousStart,
      previousEndDate: scope.previousEnd,
      timeSeries: trendSeries.rating
    }
  ];

  return {
    generatedAt,
    timeConfig: {
      hasTimeField: true,
      defaultTimeField: "order_date",
      availableTimeFields: ["order_date"],
      selectedRange,
      granularity: "day",
      dateRangePreset: selectedRange,
      startDate: scope.start,
      endDate: scope.end
    },
    metricResults,
    trendMetrics,
    trendCharts: [
      {
        title: isZh ? "近 7 天净销售额趋势" : "Net sales trend, last 7 days",
        chartType: "line_chart",
        xAxis: "order_date",
        yAxis: isZh ? "净销售额" : "Net Sales",
        series: trendSeries.netSales,
        description: isZh ? "展示 Demo 电商订单数据中最近 7 天净销售额变化。" : "Shows the last 7 days of net sales in the demo ecommerce dataset.",
        insightHint: isZh ? "6 月 9 日净销售额较前一日回落，需要拆解订单数和客单价。" : "Net sales declined on June 9; inspect orders and AOV."
      },
      {
        title: isZh ? "近 7 天订单趋势" : "Orders trend, last 7 days",
        chartType: "bar_chart",
        xAxis: "order_date",
        yAxis: isZh ? "订单数" : "Orders",
        series: trendSeries.orders,
        description: isZh ? "展示 Demo 电商订单数据中最近 7 天订单规模。" : "Shows the last 7 days of order volume in the demo ecommerce dataset.",
        insightHint: isZh ? "订单数从 6 月 8 日的 700 单降至 6 月 9 日的 680 单。" : "Orders declined from 700 to 680."
      }
    ]
  };
}

function ReportPage({ locale }: { locale: Locale }) {
  const isZh = locale === "zh";
  type LegacyReportData = {
    reportEntitlement?: ReportEntitlementViewData;
    briefing?: {
      createdAt?: string;
      payloadJson?: {
        generatedAt?: string;
        metricResults?: ReportMetricEvidenceResult[];
        timeConfig?: ReportTimeConfigViewData;
        trendMetrics?: ReportTrendMetricViewData[];
        trendCharts?: ReportTrendChartViewData[];
        structuredReport?: StructuredReportViewData;
      } | null;
    } | null;
  };
  const [reportData, setReportData] = useState<LegacyReportData | null>(() => reportsPageDataCache as LegacyReportData | null);
  const [isLoadingReportEvidence, setIsLoadingReportEvidence] = useState(() => !reportsPageDataCache);
  const [isUpdatingMetrics, setIsUpdatingMetrics] = useState(false);
  const [metricsUpdateMessage, setMetricsUpdateMessage] = useState<string | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<SelectedReportDateRange>({ preset: "ALL" });

  const loadReportEvidence = useCallback(async (dateRange: SelectedReportDateRange = selectedDateRange) => {
    setIsLoadingReportEvidence(true);

    try {
      const response = await fetch(`/api/dashboard/reports?${reportDateRangeQuery(dateRange)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as LegacyReportData | null;

      if (response.ok) {
        reportsPageDataCache = payload;
        setReportData(payload);
      }
      return payload;
    } finally {
      setIsLoadingReportEvidence(false);
    }
  }, [selectedDateRange]);

  useEffect(() => {
    void loadReportEvidence();
  }, [loadReportEvidence]);

  const handleReportRangeChange = useCallback((range: ReportTimeRange) => {
    const nextRange = { preset: range };
    setSelectedDateRange(nextRange);
  }, []);

  const updateMetrics = useCallback(async () => {
    setIsUpdatingMetrics(true);
    setMetricsUpdateMessage(null);

    try {
      const response = await fetch("/api/dashboard/reports/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          locale,
          userRequested: true,
          dateRange: selectedDateRange,
          idempotencyKey: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
        })
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        async?: boolean;
        jobId?: string;
        code?: string;
        computedMetricCount?: number;
        generatedAt?: string;
        message?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(reportGenerationErrorMessage(payload, locale));
      }

      if (payload.async) {
        setMetricsUpdateMessage(isZh ? "报告正在后台生成，完成后会自动刷新。" : "Report is generating in the background and will refresh when complete.");

        for (let attempt = 0; attempt < 30; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const latest = await loadReportEvidence(selectedDateRange);
          const generatedAt = latest?.briefing?.payloadJson?.generatedAt ?? latest?.briefing?.createdAt;
          const hasMetrics = latest?.briefing?.payloadJson?.metricResults?.some((result) => result.status === "computed");

          if (generatedAt && hasMetrics) {
            setMetricsUpdateMessage(
              isZh
                ? `报告已更新 · ${formatReportDate(generatedAt)}`
                : `Report updated · ${formatReportDate(generatedAt)}`
            );
            window.dispatchEvent(new Event("monarca-report-updated"));
            return;
          }
        }

        setMetricsUpdateMessage(isZh ? "报告仍在后台生成，请稍后刷新查看。" : "Report is still generating. Refresh later to view it.");
        return;
      }

      setMetricsUpdateMessage(
        isZh
          ? `已更新 ${payload.computedMetricCount ?? 0} 个指标 · ${formatReportDate(payload.generatedAt)}`
          : `Updated ${payload.computedMetricCount ?? 0} metrics · ${formatReportDate(payload.generatedAt)}`
      );
      await loadReportEvidence(selectedDateRange);
      window.dispatchEvent(new Event("monarca-report-updated"));
    } catch (error) {
      const fallback = isZh ? "指标更新失败" : "Failed to update metrics";
      setMetricsUpdateMessage(error instanceof Error ? localeSafeText(error.message, fallback, locale) : fallback);
    } finally {
      setIsUpdatingMetrics(false);
    }
  }, [isZh, loadReportEvidence, locale, selectedDateRange]);

  const latestMetricResults = reportData?.briefing?.payloadJson?.metricResults ?? [];
  const latestGeneratedAt = reportData?.briefing?.payloadJson?.generatedAt ?? reportData?.briefing?.createdAt;
  const latestTimeConfig = reportData?.briefing?.payloadJson?.timeConfig;
  const latestTrendMetrics = reportData?.briefing?.payloadJson?.trendMetrics ?? [];
  const latestTrendCharts = reportData?.briefing?.payloadJson?.trendCharts ?? [];
  const latestStructuredReport = reportData?.briefing?.payloadJson?.structuredReport ?? null;
  const hasRealReportMetrics = latestMetricResults.some((result) => result.status === "computed");
  const demoMetricEvidence = useMemo(() => buildDemoReportMetricEvidence(locale, selectedDateRange.preset), [locale, selectedDateRange.preset]);
  const hasComparableReportMetrics = latestMetricResults.some((result) =>
    result.status === "computed" &&
    selectedDateRange.preset !== "ALL" &&
    (
      typeof result.changePercent === "number" ||
      typeof result.percentChange === "number" ||
      result.previousValue != null
    )
  );
  const shouldShowRealReportMetrics = hasRealReportMetrics && (selectedDateRange.preset === "ALL" || hasComparableReportMetrics);
  const reportEntitlement = reportData?.reportEntitlement;
  const reportEntitlementText = reportEntitlementMessage(reportEntitlement, locale);

  return (
    <section id="report" className="dashboard-density flex min-w-0 max-w-full flex-col gap-4 overflow-hidden scroll-mt-20 xl:h-full">
      <div className="flex flex-col gap-3 px-1 pb-1 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{isZh ? "报表" : "Reports"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isZh
              ? "查看经营指标、历史趋势与 AI 数据标注"
              : "Review business metrics, historical trends, and AI data annotations"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {metricsUpdateMessage ? (
            <p className="text-xs font-medium text-muted-foreground">{metricsUpdateMessage}</p>
          ) : null}
          {reportEntitlementText ? (
            <div className="max-w-sm rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs font-medium leading-5 text-emerald-900 shadow-sm">
              {reportEntitlementText}
            </div>
          ) : null}
          {reportEntitlement?.canGenerateReport !== false ? (
            <Button type="button" onClick={() => void updateMetrics()} disabled={isUpdatingMetrics}>
              <RefreshCw className={cn("size-4", isUpdatingMetrics && "animate-spin")} />
              {isUpdatingMetrics
                ? isZh ? "更新中..." : "Updating..."
                : reportGenerateButtonLabel(reportEntitlement, locale, isZh ? "更新指标" : "Update metrics")}
            </Button>
          ) : (
            <>
              <Button asChild type="button">
                <a href="/checkout/professional">{isZh ? "升级套餐" : "Upgrade plan"}</a>
              </Button>
              <Button asChild type="button" variant="outline">
                <a href="/checkout/trial">{isZh ? "购买一次报告" : "Buy one report"}</a>
              </Button>
            </>
          )}
        </div>
      </div>

      {shouldShowRealReportMetrics || isLoadingReportEvidence ? (
        <ReportMetricEvidencePanel
          metricResults={latestMetricResults}
          generatedAt={latestGeneratedAt}
          timeConfig={latestTimeConfig}
          trendMetrics={latestTrendMetrics}
          trendCharts={latestTrendCharts}
          structuredReport={latestStructuredReport}
          selectedRange={selectedDateRange.preset}
          onRangeChange={handleReportRangeChange}
          locale={locale}
          isLoading={isLoadingReportEvidence}
        />
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-sm leading-6 text-emerald-900 shadow-sm">
            <span className="font-semibold">{isZh ? "Demo 示例" : "Demo"}</span>
            <span className="ml-2">
              {isZh
                ? "当前展示演示报告，连接并校验真实数据后会自动切换为真实报告。"
                : "Showing a demo report. Validated real data will replace it automatically."}
            </span>
          </div>
          <ReportMetricEvidencePanel
            metricResults={demoMetricEvidence.metricResults}
            generatedAt={demoMetricEvidence.generatedAt}
            timeConfig={demoMetricEvidence.timeConfig}
            trendMetrics={demoMetricEvidence.trendMetrics}
            trendCharts={demoMetricEvidence.trendCharts}
            structuredReport={null}
            selectedRange={selectedDateRange.preset}
            onRangeChange={handleReportRangeChange}
            locale={locale}
            isLoading={false}
          />
        </div>
      )}
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
  const [locale, setLocale, isLocaleReady] = useLocale("en");
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [connectedSources, setConnectedSources] = useState<ConnectedSourceRow[]>(() => connectedSourcesCache ?? []);
  const [isLoadingConnectedSources, setIsLoadingConnectedSources] = useState(() => !connectedSourcesCache);
  const copy = dashboardCopy[getCopyLocale(locale)];
  const isReportsView = view === "reports";
  const hasChatPanel = view !== "settings";
  const activeTarget =
    view === "import-data" || view === "import-data-connect"
      ? "#import-data"
      : view === "metrics" || view === "schema"
        ? "#metrics"
      : view === "report"
        ? "#report"
      : isReportsView
        ? "#reports"
        : view === "settings"
          ? "#settings"
          : "#overview";

  const addConnectedSource = (source: ConnectedSourceRow) => {
    setConnectedSources((current) => {
      const next = current.some((item) => item.id === source.id) ? current : [source, ...current];
      connectedSourcesCache = next;
      return next;
    });
  };

  const updateConnectedSource = (source: ConnectedSourceRow) => {
    setConnectedSources((current) => {
      const next = current.map((item) => (item.id === source.id ? source : item));
      connectedSourcesCache = next;
      return next;
    });
  };

  const removeConnectedSource = (sourceId: string) => {
    const previousSources = connectedSources;
    const failureMessage = copy.connectors.title === "连接数据源"
      ? "删除数据源失败，请确认当前账号有 Owner / Admin 权限后重试"
      : "Failed to remove data source. Confirm your account has Owner / Admin access and try again.";

    setConnectedSources((current) => {
      const next = current.filter((source) => source.id !== sourceId);
      connectedSourcesCache = next;
      return next;
    });

    void fetch(`/api/data-sources/${sourceId}`, {
      method: "DELETE"
    }).then(async (response) => {
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        connectedSourcesCache = previousSources;
        setConnectedSources(previousSources);
        window.alert(payload?.message || failureMessage);
        return;
      }

      window.dispatchEvent(new Event("monarca-data-sources-updated"));
    }).catch(() => {
      connectedSourcesCache = previousSources;
      setConnectedSources(previousSources);
      window.alert(failureMessage);
    });
  };

  const loadConnectedSources = useCallback(async () => {
    setIsLoadingConnectedSources(true);

    try {
      const response = await fetch("/api/data-sources", { cache: "no-store" });
      const payload = await response.json().catch(() => null);

      if (response.ok && payload?.ok && Array.isArray(payload.dataSources)) {
        const nextSources = payload.dataSources as ConnectedSourceRow[];
        connectedSourcesCache = nextSources;
        setConnectedSources(nextSources);
      }
    } finally {
      setIsLoadingConnectedSources(false);
    }
  }, []);

  useEffect(() => {
    void loadConnectedSources();

    const refreshConnectedSources = () => {
      void loadConnectedSources();
    };

    window.addEventListener("monarca-data-sources-updated", refreshConnectedSources);

    return () => {
      window.removeEventListener("monarca-data-sources-updated", refreshConnectedSources);
    };
  }, [loadConnectedSources]);

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
        <Header copy={copy} locale={locale} onLocaleChange={setLocale} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <main
            className={cn(
              "mx-auto grid min-h-full max-w-[1500px] gap-4 px-4 lg:px-6 xl:items-start",
              isReportsView ? "py-3" : "py-5",
              hasChatPanel
                ? isChatCollapsed
                  ? "xl:grid-cols-[minmax(0,1fr)_76px]"
                  : isReportsView
                    ? "xl:grid-cols-[minmax(0,1fr)_324px]"
                    : "xl:grid-cols-[minmax(0,1fr)_360px]"
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
                <ReportsPage
                  copy={copy}
                  locale={locale}
                  hasConnectedDatabase={connectedSources.length > 0}
                  isLoadingConnectedSources={isLoadingConnectedSources}
                />
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
                isReportView={isReportsView || view === "report"}
                className="min-w-0 xl:sticky xl:top-3 xl:col-start-2 xl:row-span-4 xl:row-start-1"
              />
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
