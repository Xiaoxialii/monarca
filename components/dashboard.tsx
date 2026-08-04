"use client";

import { useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  CreditCard,
  Database,
  FileText,
  HelpCircle,
  LineChart,
  Loader2,
  Lock,
  Users,
  PanelLeft,
  Plus,
  RefreshCw,
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
import { EcommerceSalesDashboard } from "@/components/ecommerce-sales-dashboard";
import { NewProductLaunchOptimizer } from "@/components/new-product-launch-optimizer";
import { DecisionAnalysisEnginePanel, ReportRendererEngine } from "@/components/report-renderer-engine";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { EcommerceSalesDashboardData } from "@/lib/dashboard/ecommerce-sales-dashboard-data";
import type { DecisionIntelligenceReportV1 } from "@/lib/decision-intelligence/decision-intelligence-engine";
import {
  getCopyLocale,
  getHtmlLang,
  LOCALE_OPTIONS,
  useLocale,
  type CopyLocale,
  type Locale
} from "@/lib/locale";
import { explainKpi } from "@/lib/kpi-explanation";
import { buildKpiFrameworkTree, diagnoseQualityKpis } from "@/lib/kpi-framework";
import { hasDisplayableMetricResult } from "@/lib/metric-visibility";
import { contextualMetricName } from "@/lib/report-generation/metric-name-normalizer";
import {
  isValidTrendMetricName,
  isValidTrendSeries
} from "@/lib/report-trend-guardrails.mjs";
import { FILE_UPLOAD_MAX_BYTES, FILE_UPLOAD_MAX_MB } from "@/lib/upload-limits";
import { cn } from "@/lib/utils";

type DataSourceType = "oauth" | "credentials" | "file";
type DataSourceAuthMode = "oauth" | "api_key" | "file_upload";

type DataSourceDefinition = {
  name: string;
  provider: string;
  type: string;
  kind: "database" | "warehouse" | "file" | "app";
  dataSourceType: DataSourceType;
  authMode: DataSourceAuthMode;
};

const dashboardCopy = {
  en: {
    navItems: [
      { label: "Data Sources", href: "/dashboard/import-data", target: "#import-data", icon: Database },
      { label: "Profit Optimization", href: "/dashboard/optimization", target: "#reports", icon: BrainCircuit },
      { label: "Optimization Tracker", href: "/dashboard/action-tracker", target: "#action-tracker", icon: Activity },
      { label: "Launch Simulator", href: "/dashboard/launch-optimizer", target: "#launch-optimizer", icon: Plus },
      { label: "Operating Reports", href: "/dashboard/report", target: "#report", icon: FileText },
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
      searchPlaceholder: "Search SKU...",
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
        { name: "SQL Server", provider: "sql_server", type: "Database", kind: "database", dataSourceType: "credentials", authMode: "api_key" },
        { name: "PostgreSQL", provider: "postgresql", type: "Database", kind: "database", dataSourceType: "credentials", authMode: "api_key" },
        { name: "MySQL", provider: "mysql", type: "Database", kind: "database", dataSourceType: "credentials", authMode: "api_key" },
        { name: "Excel / CSV", provider: "excel_csv", type: "File upload", kind: "file", dataSourceType: "file", authMode: "file_upload" },
        { name: "Snowflake", provider: "snowflake", type: "Data warehouse", kind: "warehouse", dataSourceType: "credentials", authMode: "api_key" },
        { name: "BigQuery", provider: "bigquery", type: "Data warehouse", kind: "warehouse", dataSourceType: "credentials", authMode: "api_key" },
        { name: "Google Analytics", provider: "google_analytics", type: "Analytics", kind: "app", dataSourceType: "oauth", authMode: "oauth" },
        { name: "Shopify", provider: "shopify", type: "Ecommerce", kind: "app", dataSourceType: "oauth", authMode: "oauth" },
        { name: "Stripe", provider: "stripe", type: "Revenue", kind: "app", dataSourceType: "oauth", authMode: "oauth" },
        { name: "Meta Ads", provider: "meta_ads", type: "Advertising", kind: "app", dataSourceType: "oauth", authMode: "oauth" }
      ] satisfies DataSourceDefinition[],
      server: "Server",
      serverPlaceholder: "server.database.windows.net or host\\instance",
      database: "Database",
      databasePlaceholder: "Optional database name",
      readOnlyTitle: "Read-only connection. Data is not imported.",
      readOnlyDescription: "The system reads schema metadata and aggregate metrics only. It does not copy, store, or sync your business detail rows.",
      readOnlyTip: "Use a read-only database user for this connection.",
      connectionSuccess: "Connection successful. Schema has been identified; future reports will be generated from read-only aggregate queries.",
      databaseConnected: "{provider} database connected. The system will query aggregate results in read-only mode and will not copy or store your business detail data.",
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
      pageTitle: "Profit Optimization",
      pageSubtitle:
        "Real-time business intelligence from your connected data",
      periodLabel: "Reporting period",
      periodValue: "This week",
      generatedLabel: "Generated",
      generatedValue: "After data import",
      generateAction: "Update",
      generatingAction: "Updating...",
      exportAction: "Export",
      shareAction: "Share",
      databaseCtaTitle: "Connect business data",
      databaseCtaEmpty: "After importing a database, AI will automatically generate an analysis report",
      databaseCtaConnected: "Manage connected database",
      databaseCtaDisconnected: "Manage database",
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
      { label: "数据源", href: "/dashboard/import-data", target: "#import-data", icon: Database },
      { label: "利润优化", href: "/dashboard/optimization", target: "#reports", icon: BrainCircuit },
      { label: "Optimization Tracker", href: "/dashboard/action-tracker", target: "#action-tracker", icon: Activity },
      { label: "产品发布", href: "/dashboard/launch-optimizer", target: "#launch-optimizer", icon: Plus },
      { label: "经营报表", href: "/dashboard/report", target: "#report", icon: FileText },
      { label: "设置", href: "/dashboard/settings", target: "#settings", icon: Settings }
    ],
    dataNavItems: [
      { label: "数据源", href: "/dashboard/import-data", target: "#import-data", icon: Database }
    ],
    sidebar: {
      brand: "Monarca AI",
      subtitle: "",
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
      searchPlaceholder: "搜索 SKU...",
      newSource: "导入数据",
      help: "帮助",
      notifications: "通知"
    },
    hero: {
      badge: "首次设置",
      status: "等待导入数据",
      title: "先连接数据，开启 AI 增长分析",
      description:
        "导入团队已经在使用的系统，Monarca AI 会先自动同步、清洗并映射业务语义，再开始展示指标和洞察",
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
        { name: "SQL Server", provider: "sql_server", type: "数据库", kind: "database", dataSourceType: "credentials", authMode: "api_key" },
        { name: "PostgreSQL", provider: "postgresql", type: "数据库", kind: "database", dataSourceType: "credentials", authMode: "api_key" },
        { name: "MySQL", provider: "mysql", type: "数据库", kind: "database", dataSourceType: "credentials", authMode: "api_key" },
        { name: "Excel / CSV", provider: "excel_csv", type: "文件上传", kind: "file", dataSourceType: "file", authMode: "file_upload" },
        { name: "Snowflake", provider: "snowflake", type: "数据仓库", kind: "warehouse", dataSourceType: "credentials", authMode: "api_key" },
        { name: "BigQuery", provider: "bigquery", type: "数据仓库", kind: "warehouse", dataSourceType: "credentials", authMode: "api_key" },
        { name: "Google Analytics", provider: "google_analytics", type: "分析工具", kind: "app", dataSourceType: "oauth", authMode: "oauth" },
        { name: "Shopify", provider: "shopify", type: "电商平台", kind: "app", dataSourceType: "oauth", authMode: "oauth" },
        { name: "Stripe", provider: "stripe", type: "收入系统", kind: "app", dataSourceType: "oauth", authMode: "oauth" },
        { name: "Meta Ads", provider: "meta_ads", type: "广告平台", kind: "app", dataSourceType: "oauth", authMode: "oauth" }
      ] satisfies DataSourceDefinition[],
      server: "服务器",
      serverPlaceholder: "server.database.windows.net 或 host\\instance",
      database: "数据库",
      databasePlaceholder: "可选数据库名称",
      readOnlyTitle: "只读连接，数据不入库",
      readOnlyDescription: "系统只会读取表结构和聚合指标，用于生成分析报告。不会复制、保存或同步你的业务明细数据。",
      readOnlyTip: "建议使用只读数据库账号连接。",
      connectionSuccess: "连接成功。已完成表结构识别，后续报告将基于只读聚合查询生成。",
      databaseConnected: "{provider} 数据库已连接。系统将以只读方式查询聚合结果，不会复制或存储你的业务明细数据。",
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
      pageTitle: "利润优化",
      pageSubtitle: "来自已连接数据的实时业务智能",
      periodLabel: "报告周期",
      periodValue: "今日",
      generatedLabel: "生成状态",
      generatedValue: "导入数据后生成",
      generateAction: "更新",
      generatingAction: "更新中...",
      exportAction: "导出",
      shareAction: "分享",
      databaseCtaTitle: "连接业务数据",
      databaseCtaEmpty: "导入数据库后，AI 将自动生成经营分析报告",
      databaseCtaConnected: "管理已连接数据库",
      databaseCtaDisconnected: "管理数据库",
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
  | "launch-optimizer"
  | "action-tracker"
  | "report"
  | "sales"
  | "settings";

type EcommerceDashboardPayload = {
  data: EcommerceSalesDashboardData;
  state: "ready" | "empty" | "unavailable";
  message?: string;
  lineage?: {
    schemaSnapshotId: string;
    dataSourceId: string | null;
    manifestKey?: string;
    syncRunId?: string;
  };
};

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
  connectionStatus?: string | null;
  syncStatus?: string | null;
  statusReason?: string | null;
  statusAction?: string | null;
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
    shopDomain?: string | null;
    adAccountId?: string | null;
    adAccountName?: string | null;
    adAccountCurrency?: string | null;
  } | null;
  schema?: {
    tableCount?: number | null;
    columnCount?: number | null;
    scannedAt?: string | null;
    unifiedIngestion?: {
      status?: string | null;
      source?: string | null;
      sampledRows?: number | null;
      totalParsedRows?: number | null;
      detectedSchema?: {
        detected_type?: string | null;
        confidence?: number | null;
        fields?: Array<{
          name: string;
          path?: string | null;
          type?: string | null;
        }>;
      };
      semantic?: {
        confidence?: number | null;
        memory_hits?: number | null;
        engine_candidates?: number | null;
        mappings?: Record<string, string>;
        mapping_details?: Array<{
          field: string;
          canonical: string;
          confidence?: number | null;
          source?: string | null;
        }>;
        unknown_fields?: string[];
      };
      canonical?: {
        schemaVersion?: string | null;
        rowCounts?: Record<string, unknown>;
        mappingConfidence?: number | null;
        unknownFieldCount?: number | null;
      };
      learning?: {
        records_updated?: number | null;
        memory_size?: number | null;
        average_memory_confidence?: number | null;
      };
    } | null;
    tables?: Array<{
      name: string;
      schema?: string | null;
      columns: Array<{
        name: string;
        displayName?: string | null;
        semanticName?: string | null;
        rawHeaderPath?: string[] | null;
        type?: string | null;
        nullable?: boolean | null;
      }>;
    }>;
  } | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  deletedAt?: string | null;
  retentionExpiresAt?: string | null;
};

const CANONICAL_MAPPING_OPTIONS = [
  "revenue",
  "order_id",
  "order_date",
  "sku",
  "product_name",
  "product_id",
  "customer_id",
  "email_hash",
  "country",
  "ad_spend",
  "campaign_id",
  "adset_id",
  "ad_id",
  "impressions",
  "clicks",
  "conversions",
  "attribution_revenue",
  "event_date",
  "conversion_event",
  "refund_amount",
  "refund_id",
  "refund_reason",
  "quantity",
  "price",
  "status",
  "currency",
  "unknown"
] as const;
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
let connectedSourcesWorkspaceIdCache: string | null = null;
let connectedSourcesUserIdCache: string | null = null;
let analysisReportsPageDataCache: unknown = null;
let reportsPageDataCache: unknown = null;
const CONNECTED_SOURCES_BROWSER_CACHE_PREFIX = "monarca.connectedSources.v2";
const CONNECTED_SOURCES_BROWSER_CACHE_TTL_MS = 10 * 60 * 1000;

function connectedSourcesBrowserCacheKey(workspaceId: string, userId?: string | null) {
  return `${CONNECTED_SOURCES_BROWSER_CACHE_PREFIX}:${userId ?? "anonymous"}:${workspaceId}`;
}

function isOperationalConnectedSource(source: ConnectedSourceRow) {
  return (source.syncStatus || source.status || "").toUpperCase() === "CONNECTED";
}

function readConnectedSourcesMemoryCache(workspaceId?: string | null, userId?: string | null) {
  if (!workspaceId || connectedSourcesWorkspaceIdCache !== workspaceId) return null;
  if ((connectedSourcesUserIdCache ?? null) !== (userId ?? null)) return null;

  return connectedSourcesCache;
}

function readConnectedSourcesBrowserCache(workspaceId?: string | null, userId?: string | null) {
  if (typeof window === "undefined") return null;
  if (!workspaceId) return null;

  try {
    const raw = window.localStorage.getItem(connectedSourcesBrowserCacheKey(workspaceId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      savedAt?: number;
      workspaceId?: string | null;
      userId?: string | null;
      sources?: ConnectedSourceRow[];
    };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > CONNECTED_SOURCES_BROWSER_CACHE_TTL_MS) return null;
    if (parsed.workspaceId !== workspaceId) return null;
    if ((parsed.userId ?? null) !== (userId ?? null)) return null;
    return Array.isArray(parsed.sources) ? parsed.sources : null;
  } catch {
    return null;
  }
}

function writeConnectedSourcesBrowserCache(sources: ConnectedSourceRow[], workspaceId: string | null, userId?: string | null) {
  if (typeof window === "undefined") return;
  if (!workspaceId) return;

  try {
    window.localStorage.setItem(
      connectedSourcesBrowserCacheKey(workspaceId, userId),
      JSON.stringify({ savedAt: Date.now(), workspaceId, userId: userId ?? null, sources })
    );
  } catch {
    // Ignore storage failures; the in-memory cache still works during this session.
  }
}

function Sidebar({
  copy,
  activeTarget,
  isCollapsed
}: {
  copy: DashboardCopy;
  activeTarget: string;
  isCollapsed: boolean;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  const isZh = copy.header.help === "帮助";
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
      : isZh ? "免费版" : "Free";
  const planStatusLabel = isZh ? "当前套餐" : "Current plan";

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
        className={cn(
          "group relative z-[110] flex w-full items-center rounded-md text-sm font-medium text-muted-foreground transition hover:z-[10000] hover:bg-secondary hover:text-foreground focus-visible:z-[10000]",
          isCollapsed ? "min-h-12 justify-center px-0 py-1.5" : "h-9 gap-2 px-2",
          isCollapsed && isActive && "bg-secondary text-foreground",
          isActive && "bg-secondary text-foreground"
        )}
      >
        {isCollapsed && isActive ? (
          <span className="absolute left-[-0.75rem] top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-slate-950" aria-hidden="true" />
        ) : null}
        <item.icon className="size-4" />
        <span className={cn(
          isCollapsed && "sr-only"
        )}>{item.label}</span>
        {isCollapsed ? (
          <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-[10000] max-w-none -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-950 px-3 py-2 text-center text-sm font-semibold leading-snug text-white opacity-0 shadow-[0_18px_45px_rgba(2,6,23,0.28)] transition [writing-mode:horizontal-tb] before:absolute before:-left-1 before:top-1/2 before:size-2 before:-translate-y-1/2 before:rotate-45 before:bg-slate-950 before:content-[''] group-hover:opacity-100 group-focus-visible:opacity-100">
            {item.label}
          </span>
        ) : null}
      </a>
    );
  };
  const settingsNavItem = copy.navItems.find((item) => item.target === "#settings");
  const primaryNavItems = copy.navItems.filter((item) => item.target !== "#settings");

  return (
    <aside
      className={cn(
        "relative z-[100] hidden h-screen shrink-0 flex-col border-r bg-white px-3 pb-4 pt-4 transition-[width] duration-200 lg:flex",
        isCollapsed ? "w-20 overflow-visible" : "w-64"
      )}
    >
      <div
        className={cn(
          "mb-6 flex items-center",
          isCollapsed ? "flex-col gap-2 px-0" : "justify-between gap-2 px-2"
        )}
      >
        <div className={cn("flex min-w-0 items-center gap-3", isCollapsed && "justify-center")}>
          <div className={cn("flex min-w-0 items-center gap-3", isCollapsed && "flex-col gap-1")}>
            <BrandLogo compact label={copy.sidebar.brand} className="h-10 w-10 shrink-0" />
            {isCollapsed ? (
              <span className="max-w-[4rem] text-center text-[10px] font-semibold leading-tight text-emerald-800">
                {isZh ? "增长利润" : "Improve profit"}
              </span>
            ) : null}
          </div>
          {!isCollapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{copy.sidebar.brand}</p>
              {copy.sidebar.subtitle ? (
                <p className="truncate text-xs text-muted-foreground">{copy.sidebar.subtitle}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <nav className={cn("flex-1 space-y-1", isCollapsed ? "overflow-visible" : "overflow-y-auto")}>
        {primaryNavItems.map((item) => (
          <div key={item.label}>
            {renderNavItem(item)}
            {!isCollapsed && item.target === "#report" && activeTarget === "#report" ? (
              <ReportSectionNav isZh={isZh} placement="sidebar" />
            ) : null}
          </div>
        ))}
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
          <button
            type="button"
            title={`${accountName}${currentPlan ? ` · ${currentPlan}` : ""}`}
            className="mx-auto grid size-10 place-items-center overflow-hidden rounded-full bg-teal-600 text-sm font-semibold text-white"
          >
            {accountImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={accountImageUrl} alt={accountName} className="size-full object-cover" />
            ) : (
              accountInitials
            )}
          </button>
        ) : (
          <div className="px-2">
            <div
              className="flex items-end justify-between gap-3 rounded-lg px-1.5 py-1.5"
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
                {planStatusLabel}
              </span>
            </div>
          </div>
        )}
        {settingsNavItem ? (
          <div className={cn("mt-3", isCollapsed ? "" : "px-2")}>
            {renderNavItem(settingsNavItem)}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function Header({
  copy,
  activeTarget,
  locale,
  onLocaleChange
}: {
  copy: DashboardCopy;
  activeTarget: string;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const isZh = getCopyLocale(locale) === "zh";
  const currentPageTitle = navLabel(copy, activeTarget) || (isZh ? "工作台" : "Workspace");
  const mobileNavItems = copy.navItems
    .filter((item) => item.href === "/dashboard/report" || item.href === "/dashboard/settings")
    .map((item) => ({
      ...item,
      label: item.href === "/dashboard/report"
        ? (isZh ? "报表页" : "Reports Page")
        : (isZh ? "设置页" : "Settings Page")
    }));

  return (
    <header className="sticky top-0 z-20 border-b bg-slate-50/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={copy.header.openNav}
          aria-expanded={isMobileNavOpen}
          onClick={() => setIsMobileNavOpen((current) => !current)}
        >
          {isMobileNavOpen ? <X /> : <PanelLeft />}
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-slate-900 sm:text-base">{currentPageTitle}</h1>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          <label className="hidden h-9 items-center gap-2 rounded-md bg-white px-3 text-sm font-medium text-muted-foreground shadow-sm ring-1 ring-slate-200 sm:flex">
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
          <Button asChild size="sm" className="hidden bg-indigo-600 text-white hover:bg-indigo-700 sm:inline-flex">
            <a href="/checkout/professional">Upgrade</a>
          </Button>
          <Button variant="ghost" size="icon" aria-label={copy.header.notifications}>
            <Bell />
          </Button>
          <AuthControls />
        </div>
      </div>
      {isMobileNavOpen ? (
        <div className="border-t bg-white px-4 py-3 shadow-lg lg:hidden">
          <nav className="grid gap-2">
            {mobileNavItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileNavOpen(false)}
                className="flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm transition active:scale-[0.99]"
              >
                <item.icon className="size-4 text-slate-500" />
                <span>{item.label}</span>
              </a>
            ))}
          </nav>
        </div>
      ) : null}
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
    { href: "/dashboard/optimization", icon: FileText }
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
    <Card className="overflow-hidden border-emerald-200 bg-white shadow-sm shadow-emerald-950/5">
      <CardHeader className="border-b p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{copy.metricCatalog.importedTableTitle}</CardTitle>
              <Badge variant="secondary" className="w-fit">
                {isLoadingMetrics
                  ? (isZh ? "读取中" : "Loading")
                  : (isZh ? `共 ${metricRows.length} 个指标` : `${metricRows.length} metrics`)}
              </Badge>
            </div>
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
  deletedSources,
  isLoadingConnectedSources = false,
  onUpdateConnectedSource,
  onRemoveConnectedSource,
  onRestoreDeletedSource,
  onPermanentlyDeleteSource
}: {
  copy: DashboardCopy;
  connectedSources?: ConnectedSourceRow[];
  deletedSources?: ConnectedSourceRow[];
  isLoadingConnectedSources?: boolean;
  onUpdateConnectedSource?: (source: ConnectedSourceRow) => void;
  onRemoveConnectedSource?: (sourceId: string) => void;
  onRestoreDeletedSource?: (sourceId: string) => void;
  onPermanentlyDeleteSource?: (sourceId: string) => void;
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
              deletedSources={deletedSources ?? []}
              isLoadingConnectedSources={isLoadingConnectedSources}
              onUpdateConnectedSource={onUpdateConnectedSource ?? (() => {})}
              onRemoveConnectedSource={onRemoveConnectedSource ?? (() => {})}
              onRestoreDeletedSource={onRestoreDeletedSource ?? (() => {})}
              onPermanentlyDeleteSource={onPermanentlyDeleteSource ?? (() => {})}
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

function sourceStatusLabel(status: string | null | undefined, isZh: boolean) {
  const normalized = (status ?? "").toUpperCase();
  const labels: Record<string, string> = isZh
    ? {
        CONNECTED: "已连接",
        SYNCING: "同步中",
        PENDING_PERMISSION: "等待授权",
        PENDING_FIRST_SYNC: "等待首次同步",
        FAILED_AUTH: "授权失败",
        FAILED_SYNC: "同步失败",
        DISCONNECTED: "已断开"
      }
    : {
        CONNECTED: "Connected",
        SYNCING: "Syncing",
        PENDING_PERMISSION: "Permission needed",
        PENDING_FIRST_SYNC: "Pending first sync",
        FAILED_AUTH: "Auth failed",
        FAILED_SYNC: "Sync failed",
        DISCONNECTED: "Disconnected"
      };

  return labels[normalized] ?? (status || (isZh ? "未知" : "Unknown"));
}

function sourceStatusBadgeClass(status: string | null | undefined) {
  const normalized = (status ?? "").toUpperCase();

  if (normalized === "CONNECTED") return "bg-emerald-50 text-emerald-800";
  if (normalized === "SYNCING" || normalized === "PENDING_FIRST_SYNC") return "bg-sky-50 text-sky-800";
  if (normalized === "PENDING_PERMISSION") return "bg-amber-50 text-amber-800";
  if (normalized === "FAILED_AUTH" || normalized === "FAILED_SYNC") return "bg-rose-50 text-rose-800";
  if (normalized === "DISCONNECTED") return "bg-slate-100 text-slate-600";

  return "bg-slate-100 text-slate-700";
}

function sourceStatusActionLabel(action: string | null | undefined, isZh: boolean) {
  if (action === "UPDATE_PERMISSION") return isZh ? "更新权限" : "Update Permission";
  if (action === "SYNC_NOW") return isZh ? "立即同步" : "Sync Now";
  if (action === "RECONNECT") return isZh ? "重新连接" : "Reconnect";

  return null;
}

function valueAsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function valueAsNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function schemaFromSchemaEndpointPayload(payload: unknown): ConnectedSourceRow["schema"] | null {
  const response = valueAsRecord(payload);
  const snapshot = valueAsRecord(response.snapshot);
  const snapshotJson = valueAsRecord(snapshot.schemaJson);
  const sourceSchema = valueAsRecord(response.schema);
  const rawUploadSchema = valueAsRecord(snapshotJson.rawUploadSchema);
  const schema = Object.keys(sourceSchema).length > 0
    ? sourceSchema
    : Object.keys(rawUploadSchema).length > 0
      ? rawUploadSchema
      : snapshotJson;
  const unifiedIngestion = valueAsRecord(schema.unifiedIngestion ?? rawUploadSchema.unifiedIngestion ?? snapshotJson.unifiedIngestion);
  const semantic = valueAsRecord(unifiedIngestion.semantic);
  const detectedSchema = valueAsRecord(unifiedIngestion.detectedSchema);
  const canonical = valueAsRecord(unifiedIngestion.canonical);
  const learning = valueAsRecord(unifiedIngestion.learning);
  const tables = Array.isArray(schema.tables) ? schema.tables : [];
  const tableRows = tables.map((table) => {
    const tableRecord = valueAsRecord(table);
    const columns = Array.isArray(tableRecord.columns) ? tableRecord.columns : [];

    return {
      name: typeof tableRecord.name === "string" ? tableRecord.name : "",
      schema: typeof tableRecord.schema === "string" ? tableRecord.schema : null,
      columns: columns.map((column) => {
        const columnRecord = valueAsRecord(column);

        return {
          name: typeof columnRecord.name === "string" ? columnRecord.name : "",
          displayName: typeof columnRecord.displayName === "string" ? columnRecord.displayName : null,
          semanticName: typeof columnRecord.semanticName === "string" ? columnRecord.semanticName : null,
          rawHeaderPath: Array.isArray(columnRecord.rawHeaderPath)
            ? columnRecord.rawHeaderPath.filter((item): item is string => typeof item === "string")
            : null,
          type: typeof columnRecord.type === "string" ? columnRecord.type : null,
          nullable: typeof columnRecord.nullable === "boolean" ? columnRecord.nullable : null
        };
      }).filter((column) => column.name)
    };
  }).filter((table) => table.name);
  const detectedFields = Array.isArray(detectedSchema.fields) ? detectedSchema.fields : [];
  const mappingDetails = Array.isArray(semantic.mapping_details)
    ? semantic.mapping_details
    : Array.isArray(semantic.mappingDetails)
      ? semantic.mappingDetails
      : [];
  const semanticMappings = Object.fromEntries(
    Object.entries(valueAsRecord(semantic.mappings)).map(([field, canonical]) => [
      field,
      typeof canonical === "string" ? canonical : String(canonical)
    ])
  );

  return {
    tableCount: valueAsNumber(schema.tableCount) ?? tableRows.length,
    columnCount: valueAsNumber(schema.columnCount) ?? tableRows.reduce((sum, table) => sum + table.columns.length, 0),
    scannedAt: typeof schema.scannedAt === "string"
      ? schema.scannedAt
      : typeof snapshot.createdAt === "string"
        ? snapshot.createdAt
        : null,
    unifiedIngestion: Object.keys(unifiedIngestion).length > 0
      ? {
          status: typeof unifiedIngestion.status === "string" ? unifiedIngestion.status : null,
          source: typeof unifiedIngestion.source === "string" ? unifiedIngestion.source : null,
          sampledRows: valueAsNumber(unifiedIngestion.sampledRows),
          totalParsedRows: valueAsNumber(unifiedIngestion.totalParsedRows),
          detectedSchema: {
            detected_type: typeof detectedSchema.detected_type === "string" ? detectedSchema.detected_type : null,
            confidence: valueAsNumber(detectedSchema.confidence),
            fields: detectedFields.map((field) => {
              const record = valueAsRecord(field);
              return {
                name: typeof record.name === "string" ? record.name : "",
                path: typeof record.path === "string" ? record.path : "",
                type: typeof record.type === "string" ? record.type : null
              };
            }).filter((field) => field.name)
          },
          semantic: {
            confidence: valueAsNumber(semantic.confidence),
            memory_hits: valueAsNumber(semantic.memory_hits),
            engine_candidates: valueAsNumber(semantic.engine_candidates),
            mappings: semanticMappings,
            mapping_details: mappingDetails.map((mapping) => {
              const record = valueAsRecord(mapping);
              return {
                field: typeof record.field === "string" ? record.field : "",
                canonical: typeof record.canonical === "string" ? record.canonical : "",
                confidence: valueAsNumber(record.confidence),
                source: typeof record.source === "string" ? record.source : "engine"
              };
            }).filter((mapping) => mapping.field),
            unknown_fields: Array.isArray(semantic.unknown_fields)
              ? semantic.unknown_fields.filter((field): field is string => typeof field === "string")
              : []
          },
          canonical: {
            schemaVersion: typeof canonical.schemaVersion === "string" ? canonical.schemaVersion : null,
            rowCounts: valueAsRecord(canonical.rowCounts),
            mappingConfidence: valueAsNumber(canonical.mappingConfidence),
            unknownFieldCount: valueAsNumber(canonical.unknownFieldCount)
          },
          learning: {
            records_updated: valueAsNumber(learning.records_updated),
            memory_size: valueAsNumber(learning.memory_size),
            average_memory_confidence: valueAsNumber(learning.average_memory_confidence)
          }
        }
      : null,
    tables: tableRows
  };
}

function mappingRowsForSource(source: ConnectedSourceRow) {
  const details = source.schema?.unifiedIngestion?.semantic?.mapping_details ?? [];
  const fields = source.schema?.unifiedIngestion?.detectedSchema?.fields ?? [];
  const fieldTypes = new Map(fields.map((field) => [field.name, field.type ?? "unknown"]));

  if (details.length > 0) {
    return details.map((mapping) => ({
      field: mapping.field,
      canonical: mapping.canonical || "unknown",
      confidence: mapping.confidence ?? source.schema?.unifiedIngestion?.semantic?.confidence ?? null,
      source: mapping.source ?? "engine",
      type: fieldTypes.get(mapping.field) ?? "unknown"
    }));
  }

  const mappings = source.schema?.unifiedIngestion?.semantic?.mappings ?? {};
  const mappingEntries = Object.entries(mappings);

  if (mappingEntries.length > 0) {
    return mappingEntries.map(([field, canonical]) => ({
      field,
      canonical: canonical || "unknown",
      confidence: source.schema?.unifiedIngestion?.semantic?.confidence ?? null,
      source: "engine",
      type: fieldTypes.get(field) ?? "unknown"
    }));
  }

  return (source.schema?.tables ?? []).flatMap((table) =>
    table.columns.map((column) => {
      const semanticName = column.semanticName && CANONICAL_MAPPING_OPTIONS.includes(column.semanticName as typeof CANONICAL_MAPPING_OPTIONS[number])
        ? column.semanticName
        : guessCanonicalConceptFromField(column.name);

      return {
        field: column.rawHeaderPath?.length ? column.rawHeaderPath.join(".") : `${table.name}.${column.name}`,
        canonical: semanticName,
        confidence: semanticName === "unknown" ? 0.35 : 0.55,
        source: "schema",
        type: column.type ?? "unknown"
      };
    })
  );
}

function mappingConfidenceLabel(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  const normalized = value > 1 ? value / 100 : value;

  return `${Math.round(normalized * 100)}%`;
}

function guessCanonicalConceptFromField(fieldName: string): typeof CANONICAL_MAPPING_OPTIONS[number] {
  const normalized = fieldName.toLowerCase().replace(/[\s.-]+/g, "_");

  if (/(^|_)sku($|_)/.test(normalized)) return "sku";
  if (normalized.includes("campaign")) return "campaign_id";
  if (normalized.includes("adset")) return "adset_id";
  if (normalized === "ad_id" || normalized.endsWith("_ad_id")) return "ad_id";
  if (normalized.includes("impression")) return "impressions";
  if (normalized.includes("click")) return "clicks";
  if (normalized.includes("conversion")) return "conversions";
  if (normalized.includes("spend") || normalized.includes("cost")) return "ad_spend";
  if (normalized.includes("revenue") || normalized.includes("sales") || normalized.includes("gmv")) return "revenue";
  if (normalized.includes("order") && normalized.includes("date")) return "order_date";
  if (normalized === "order_id" || normalized.endsWith("_order_id")) return "order_id";
  if (normalized.includes("product") && normalized.includes("name")) return "product_name";
  if (normalized === "product_id" || normalized.endsWith("_product_id")) return "product_id";
  if (normalized.includes("customer")) return "customer_id";
  if (normalized.includes("quantity") || normalized === "qty") return "quantity";
  if (normalized.includes("price") || normalized.includes("amount")) return "price";
  if (normalized.includes("currency")) return "currency";
  if (normalized.includes("status")) return "status";
  if (normalized.includes("date") || normalized.includes("month")) return "event_date";

  return "unknown";
}

function SettingsConnectedSourcesPanel({
  copy,
  connectedSources,
  deletedSources,
  isLoadingConnectedSources = false,
  onUpdateConnectedSource,
  onRemoveConnectedSource,
  onRestoreDeletedSource,
  onPermanentlyDeleteSource
}: {
  copy: DashboardCopy;
  connectedSources: ConnectedSourceRow[];
  deletedSources: ConnectedSourceRow[];
  isLoadingConnectedSources?: boolean;
  onUpdateConnectedSource: (source: ConnectedSourceRow) => void;
  onRemoveConnectedSource: (sourceId: string) => void;
  onRestoreDeletedSource: (sourceId: string) => void;
  onPermanentlyDeleteSource: (sourceId: string) => void;
}) {
  const [expandedSourceIds, setExpandedSourceIds] = useState<string[]>([]);
  const [expandedTableKeys, setExpandedTableKeys] = useState<string[]>([]);
  const [loadingSchemaSourceIds, setLoadingSchemaSourceIds] = useState<string[]>([]);
  const [schemaLoadErrors, setSchemaLoadErrors] = useState<Record<string, string>>({});
  const [rescanningSourceId, setRescanningSourceId] = useState<string | null>(null);
  const [fetchingShopifySourceId, setFetchingShopifySourceId] = useState<string | null>(null);
  const [syncingShopifySourceId, setSyncingShopifySourceId] = useState<string | null>(null);
  const [syncingMetaSourceId, setSyncingMetaSourceId] = useState<string | null>(null);
  const [mappingOverrides, setMappingOverrides] = useState<Record<string, string>>({});
  const [mappingFeedback, setMappingFeedback] = useState<Record<string, {
    status: "saving" | "saved" | "error";
    message?: string;
  }>>({});
  const [shopifyFetchResults, setShopifyFetchResults] = useState<Record<string, {
    ok: boolean;
    message: string;
    shopDomain?: string | null;
    fetchedAt?: string | null;
    counts?: {
      orders: number;
      products: number;
      customers: number;
    };
    sampleOrderNames?: string[];
    warnings?: string[];
  }>>({});
  const [shopifySyncResults, setShopifySyncResults] = useState<Record<string, {
    ok: boolean;
    message: string;
    syncRunId?: string | null;
    manifestKey?: string | null;
    duplicateOrdersDetected?: number;
    testOrdersFiltered?: number;
    cancelledOrdersFiltered?: number;
    currencyMismatch?: boolean;
    dataMode?: "FULL" | "FALLBACK" | string | null;
    confidenceScore?: number | null;
    estimationUsed?: boolean;
    missingFields?: string[];
  }>>({});
  const [metaSyncResults, setMetaSyncResults] = useState<Record<string, {
    ok: boolean;
    message: string;
    syncRunId?: string | null;
    manifestKey?: string | null;
    rows?: number;
    adAccountId?: string | null;
  }>>({});
  const isZh = copy.connectors.connectedCountLabel.includes("个");
  const connectedCountLabel = isLoadingConnectedSources
    ? (isZh ? "加载中" : "Loading")
    : `${connectedSources.length} ${copy.connectors.connectedCountLabel}`;
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
        fetchShopify: "拉取 Shopify 数据",
        fetchingShopify: "拉取中",
        syncShopify: "同步 Shopify",
        syncingShopify: "同步中",
        syncMetaAds: "同步 Meta Ads",
        syncingMetaAds: "同步中",
        recentScan: "最近扫描",
        noTables: "暂未读取到表结构",
        fieldNullable: "可为空",
        fieldRequired: "必填",
        deletedTitle: "已删除数据源",
        deletedDescription: "删除的数据源会保留 30 天。你可以在保留期内恢复，也可以立即彻底删除。",
        deletedAt: "删除时间",
        retentionUntil: "保留至",
        restore: "恢复",
        permanentDelete: "彻底删除",
        noDeleted: "暂无已删除数据源",
        mappingTitle: "字段映射确认",
        mappingDescription: "确认原始字段到 Canonical 概念的映射，系统会写入语义记忆用于后续自动识别。",
        mappingUnavailable: "这个数据源还没有语义映射结果。请重新上传或更新数据源后再确认字段映射。",
        rawField: "原始字段",
        canonicalConcept: "Canonical 概念",
        confidence: "置信度",
        confirmMapping: "确认",
        rejectMapping: "拒绝",
        savingMapping: "保存中",
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
        fetchShopify: "Fetch Shopify Data",
        fetchingShopify: "Fetching",
        syncShopify: "Sync Shopify",
        syncingShopify: "Syncing",
        syncMetaAds: "Sync Meta Ads",
        syncingMetaAds: "Syncing",
        recentScan: "Last scan",
        noTables: "No tables found yet",
        fieldNullable: "nullable",
        fieldRequired: "required",
        deletedTitle: "Deleted data sources",
        deletedDescription: "Deleted data sources are retained for 30 days. You can restore them during retention or permanently delete them now.",
        deletedAt: "Deleted",
        retentionUntil: "Retained until",
        restore: "Restore",
        permanentDelete: "Delete permanently",
        noDeleted: "No deleted data sources",
        mappingTitle: "Field mapping review",
        mappingDescription: "Confirm raw field to canonical concept mappings. Confirmed mappings are saved into semantic memory for future ingestion.",
        mappingUnavailable: "This source has no semantic mapping result yet. Re-upload or update the source before confirming mappings.",
        rawField: "Raw field",
        canonicalConcept: "Canonical concept",
        confidence: "Confidence",
        confirmMapping: "Confirm",
        rejectMapping: "Reject",
        savingMapping: "Saving",
        on: "On",
        off: "Off"
      };

  const loadSourceSchema = async (source: ConnectedSourceRow) => {
    setLoadingSchemaSourceIds((current) => current.includes(source.id) ? current : [...current, source.id]);
    setSchemaLoadErrors((current) => {
      const next = { ...current };
      delete next[source.id];
      return next;
    });

    try {
      const response = await fetch(`/api/data-sources/${source.id}/schema`, {
        cache: "no-store"
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || (isZh ? "读取数据源结构失败" : "Failed to load source schema"));
      }

      const schema = schemaFromSchemaEndpointPayload(payload);
      onUpdateConnectedSource({
        ...source,
        schema: schema ?? source.schema
      });
    } catch (error) {
      setSchemaLoadErrors((current) => ({
        ...current,
        [source.id]: error instanceof Error ? error.message : (isZh ? "读取数据源结构失败" : "Failed to load source schema")
      }));
    } finally {
      setLoadingSchemaSourceIds((current) => current.filter((id) => id !== source.id));
    }
  };

  const toggleSourceSchema = (source: ConnectedSourceRow) => {
    const sourceId = source.id;
    const willExpand = !expandedSourceIds.includes(sourceId);

    setExpandedSourceIds((current) =>
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId]
    );

    if (willExpand && !source.schema?.unifiedIngestion && (source.schema?.tables ?? []).length === 0) {
      void loadSourceSchema(source);
    }
  };

  const toggleTable = (sourceId: string, tableName: string) => {
    const key = `${sourceId}:${tableName}`;
    setExpandedTableKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  };

  const mappingStateKey = (sourceId: string, field: string) => `${sourceId}:${field}`;

  const updateMappingOverride = (sourceId: string, field: string, value: string) => {
    setMappingOverrides((current) => ({
      ...current,
      [mappingStateKey(sourceId, field)]: value
    }));
  };

  const submitMappingFeedback = async (
    source: ConnectedSourceRow,
    mapping: ReturnType<typeof mappingRowsForSource>[number],
    feedback: "confirm" | "edit" | "reject"
  ) => {
    const key = mappingStateKey(source.id, mapping.field);
    const correctedMapping = mappingOverrides[key] ?? mapping.canonical ?? "unknown";

    setMappingFeedback((current) => ({
      ...current,
      [key]: { status: "saving" }
    }));

    try {
      const response = await fetch("/api/semantic/mappings/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataSourceId: source.id,
          fieldName: mapping.field,
          platform: source.provider?.toLowerCase?.() || source.schema?.unifiedIngestion?.source || "excel",
          previousMapping: mapping.canonical,
          correctedMapping,
          feedback
        })
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || (isZh ? "映射确认失败" : "Failed to save mapping feedback"));
      }

      setMappingFeedback((current) => ({
        ...current,
        [key]: {
          status: "saved",
          message: isZh ? "已写入语义记忆" : "Saved to semantic memory"
        }
      }));
    } catch (error) {
      setMappingFeedback((current) => ({
        ...current,
        [key]: {
          status: "error",
          message: error instanceof Error ? error.message : (isZh ? "映射确认失败" : "Failed to save mapping feedback")
        }
      }));
    }
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

  const fetchShopifyData = async (sourceId: string) => {
    setFetchingShopifySourceId(sourceId);

    try {
      const response = await fetch("/api/connectors/shopify/fetch");
      const payload = await response.json().catch(() => null) as {
        orders?: Array<{ name?: string | null }>;
        products?: unknown[];
        customers?: unknown[];
        meta?: {
          shopDomain?: string | null;
          fetchedAt?: string | null;
        };
        warnings?: Array<{ message?: string | null }>;
        message?: string;
        dataMode?: "FULL" | "FALLBACK" | string | null;
        confidenceScore?: number | null;
        estimationUsed?: boolean;
        missingFields?: string[];
      } | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.message || (isZh ? "Shopify 数据拉取失败" : "Shopify fetch failed"));
      }

      setShopifyFetchResults((current) => ({
        ...current,
        [sourceId]: {
          ok: true,
          message: isZh ? "Shopify 数据拉取成功" : "Shopify data fetched",
          shopDomain: payload.meta?.shopDomain ?? null,
          fetchedAt: payload.meta?.fetchedAt ?? null,
          counts: {
            orders: payload.orders?.length ?? 0,
            products: payload.products?.length ?? 0,
            customers: payload.customers?.length ?? 0
          },
          sampleOrderNames: (payload.orders ?? [])
            .map((order) => order.name)
            .filter((name): name is string => Boolean(name))
            .slice(0, 5),
          warnings: (payload.warnings ?? [])
            .map((warning) => warning.message)
            .filter((message): message is string => Boolean(message))
        }
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : isZh ? "Shopify 数据拉取失败" : "Shopify fetch failed";

      setShopifyFetchResults((current) => ({
        ...current,
        [sourceId]: {
          ok: false,
          message
        }
      }));
    } finally {
      setFetchingShopifySourceId(null);
    }
  };

  const syncShopifyData = async (sourceId: string) => {
    setSyncingShopifySourceId(sourceId);

    try {
      const response = await fetch("/api/connectors/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSourceId: sourceId })
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        reused?: boolean;
        syncRunId?: string | null;
        manifest?: {
          manifest_key?: string | null;
          guardrailReport?: {
            duplicateOrdersDetected?: number;
            testOrdersFiltered?: number;
            cancelledOrdersFiltered?: number;
            currencyMismatch?: boolean;
          };
        };
        manifestKey?: string | null;
        guardrailReport?: {
          duplicateOrdersDetected?: number;
          testOrdersFiltered?: number;
          cancelledOrdersFiltered?: number;
          currencyMismatch?: boolean;
        };
        dataMode?: "FULL" | "FALLBACK" | string | null;
        confidenceScore?: number | null;
        estimationUsed?: boolean;
        missingFields?: string[];
        message?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || (isZh ? "Shopify 同步失败" : "Shopify sync failed"));
      }

      const guardrailReport = payload.guardrailReport ?? payload.manifest?.guardrailReport;

      setShopifySyncResults((current) => ({
        ...current,
        [sourceId]: {
          ok: true,
          message: payload.reused
            ? (isZh ? "已复用现有 Shopify 同步结果" : "Reused existing Shopify sync")
            : (isZh ? "Shopify 同步完成" : "Shopify sync completed"),
          syncRunId: payload.syncRunId ?? null,
          manifestKey: payload.manifestKey ?? payload.manifest?.manifest_key ?? null,
          duplicateOrdersDetected: guardrailReport?.duplicateOrdersDetected ?? 0,
          testOrdersFiltered: guardrailReport?.testOrdersFiltered ?? 0,
          cancelledOrdersFiltered: guardrailReport?.cancelledOrdersFiltered ?? 0,
          currencyMismatch: Boolean(guardrailReport?.currencyMismatch),
          dataMode: payload.dataMode ?? null,
          confidenceScore: payload.confidenceScore ?? null,
          estimationUsed: Boolean(payload.estimationUsed),
          missingFields: payload.missingFields ?? []
        }
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : isZh ? "Shopify 同步失败" : "Shopify sync failed";

      setShopifySyncResults((current) => ({
        ...current,
        [sourceId]: {
          ok: false,
          message
        }
      }));
    } finally {
      setSyncingShopifySourceId(null);
    }
  };

  const syncMetaAdsData = async (sourceId: string) => {
    setSyncingMetaSourceId(sourceId);

    try {
      const response = await fetch("/api/connectors/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSourceId: sourceId })
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        syncRunId?: string | null;
        manifest?: {
          manifest_key?: string | null;
          row_counts?: {
            ecommerce_ads?: number;
          };
          ad_account_id?: string | null;
        };
        manifestKey?: string | null;
        rowCounts?: {
          ecommerce_ads?: number;
        };
        adAccountId?: string | null;
        message?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || (isZh ? "Meta Ads 同步失败" : "Meta Ads sync failed"));
      }

      setMetaSyncResults((current) => ({
        ...current,
        [sourceId]: {
          ok: true,
          message: isZh ? "Meta Ads 同步完成" : "Meta Ads sync completed",
          syncRunId: payload.syncRunId ?? null,
          manifestKey: payload.manifestKey ?? payload.manifest?.manifest_key ?? null,
          rows: payload.rowCounts?.ecommerce_ads ?? payload.manifest?.row_counts?.ecommerce_ads ?? 0,
          adAccountId: payload.adAccountId ?? payload.manifest?.ad_account_id ?? null
        }
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : isZh ? "Meta Ads 同步失败" : "Meta Ads sync failed";

      setMetaSyncResults((current) => ({
        ...current,
        [sourceId]: {
          ok: false,
          message
        }
      }));
    } finally {
      setSyncingMetaSourceId(null);
    }
  };

  return (
    <div className="grid gap-4">
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
        {isLoadingConnectedSources ? (
          <div className="rounded-lg border border-dashed bg-secondary/20 p-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-white text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
              <div>
                <p className="text-sm font-semibold">{isZh ? "正在更新数据源" : "Updating data sources"}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {isZh ? "正在同步已连接数据源状态，请稍候" : "Refreshing connected source status."}
                </p>
              </div>
            </div>
          </div>
        ) : connectedSources.length > 0 ? (
          <div className="grid gap-3">
            {connectedSources.map((source) => {
              const isExpanded = expandedSourceIds.includes(source.id);
              const tables = source.schema?.tables ?? [];
              const scannedAt = source.schema?.scannedAt ?? source.lastSyncAt;
              const isShopifySource = source.provider === "shopify";
              const isMetaAdsSource = source.provider === "meta_ads";
              const shopifyFetchResult = shopifyFetchResults[source.id];
              const shopifySyncResult = shopifySyncResults[source.id];
              const metaSyncResult = metaSyncResults[source.id];
              const semanticMappingRows = mappingRowsForSource(source);
              const unifiedIngestion = source.schema?.unifiedIngestion ?? null;
              const isLoadingSchema = loadingSchemaSourceIds.includes(source.id);
              const schemaLoadError = schemaLoadErrors[source.id];
              const displayStatus = source.syncStatus || source.status;
              const statusActionLabel = sourceStatusActionLabel(source.statusAction, isZh);
              const shopDomain = source.config?.shopDomain;
              const statusActionHref = isShopifySource && source.statusAction === "UPDATE_PERMISSION" && shopDomain
                ? `/api/connectors/shopify/start?shop=${encodeURIComponent(shopDomain)}`
                : null;

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
                          <Badge variant="secondary" className={sourceStatusBadgeClass(displayStatus)}>
                            {sourceStatusLabel(displayStatus, isZh)}
                          </Badge>
                        </div>
                        {source.statusReason ? (
                          <p className="mt-1 text-sm font-medium text-amber-800">
                            {source.statusReason}
                          </p>
                        ) : null}
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
                            {isShopifySource ? "Shop" : isMetaAdsSource ? "Ad Account" : labels.host}: {isShopifySource ? (source.config?.shopDomain ?? "—") : isMetaAdsSource ? (source.config?.adAccountId ?? "—") : (source.config?.host ?? "—")}
                          </span>
                          {!isShopifySource && !isMetaAdsSource ? (
                          <span className="rounded-full bg-white px-2.5 py-1">
                            {labels.database}: {source.config?.database ?? "—"}
                          </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      {statusActionLabel && statusActionHref ? (
                        <Button asChild type="button" variant="outline" size="sm">
                          <a href={statusActionHref}>
                            {statusActionLabel}
                          </a>
                        </Button>
                      ) : null}
                      {isShopifySource ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={syncingShopifySourceId === source.id}
                          onClick={() => void syncShopifyData(source.id)}
                        >
                          <RefreshCw className={cn("size-4", syncingShopifySourceId === source.id && "animate-spin")} />
                          {syncingShopifySourceId === source.id ? labels.syncingShopify : labels.syncShopify}
                        </Button>
                      ) : null}
                      {isMetaAdsSource ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={syncingMetaSourceId === source.id}
                          onClick={() => void syncMetaAdsData(source.id)}
                        >
                          <RefreshCw className={cn("size-4", syncingMetaSourceId === source.id && "animate-spin")} />
                          {syncingMetaSourceId === source.id ? labels.syncingMetaAds : labels.syncMetaAds}
                        </Button>
                      ) : null}
                      {isShopifySource ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={fetchingShopifySourceId === source.id}
                          onClick={() => void fetchShopifyData(source.id)}
                        >
                          <RefreshCw className={cn("size-4", fetchingShopifySourceId === source.id && "animate-spin")} />
                          {fetchingShopifySourceId === source.id ? labels.fetchingShopify : labels.fetchShopify}
                        </Button>
                      ) : null}
	                      <Button
	                        type="button"
	                        variant="outline"
	                        size="sm"
	                        disabled={isLoadingSchema}
	                        onClick={() => toggleSourceSchema(source)}
	                      >
	                        {isLoadingSchema ? (
	                          <RefreshCw className="size-4 animate-spin" />
	                        ) : null}
	                        {isLoadingSchema ? (isZh ? "读取结构" : "Loading schema") : isExpanded ? labels.hideSchema : labels.viewSchema}
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

                  {shopifyFetchResult ? (
                    <div
                      className={cn(
                        "mt-4 rounded-lg border px-3 py-2 text-xs",
                        shopifyFetchResult.ok
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-rose-200 bg-rose-50 text-rose-800"
                      )}
                    >
                      <p className="font-semibold">{shopifyFetchResult.message}</p>
                      {shopifyFetchResult.ok && shopifyFetchResult.counts ? (
                        <div className="mt-1.5 space-y-1 text-muted-foreground">
                          <p>
                            {shopifyFetchResult.shopDomain ?? source.config?.shopDomain ?? source.name} · {formatRelativeSourceDate(shopifyFetchResult.fetchedAt ?? null, isZh)}
                          </p>
                          <p>
                            Orders: {shopifyFetchResult.counts.orders} · Products: {shopifyFetchResult.counts.products} · Customers: {shopifyFetchResult.counts.customers}
                          </p>
                          {shopifyFetchResult.sampleOrderNames?.length ? (
                            <p>Orders sample: {shopifyFetchResult.sampleOrderNames.join(", ")}</p>
                          ) : null}
                          {shopifyFetchResult.warnings?.map((warning) => (
                            <p key={warning}>{warning}</p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {shopifySyncResult ? (
                    <div
                      className={cn(
                        "mt-4 rounded-lg border px-3 py-2 text-xs",
                        shopifySyncResult.ok
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-rose-200 bg-rose-50 text-rose-800"
                      )}
                    >
                      <p className="font-semibold">{shopifySyncResult.message}</p>
                      {shopifySyncResult.ok ? (
                        <div className="mt-1.5 space-y-1 text-muted-foreground">
                          <p>syncRunId: {shopifySyncResult.syncRunId ?? "—"}</p>
                          <p>manifest: {shopifySyncResult.manifestKey ?? "—"}</p>
                          <p>
                            duplicate orders: {shopifySyncResult.duplicateOrdersDetected ?? 0} · test filtered: {shopifySyncResult.testOrdersFiltered ?? 0} · cancelled filtered: {shopifySyncResult.cancelledOrdersFiltered ?? 0}
                          </p>
                          {shopifySyncResult.dataMode ? (
                            <p>
                              {shopifySyncResult.dataMode === "FALLBACK"
                                ? (isZh ? "Data Quality: Partial ⚠ Shopify API 限制导致订单、明细、退款或客户指标缺失。" : "Data Quality: Partial ⚠ Shopify API limitations prevent order, line item, refund, or customer metrics.")
                                : (isZh ? "Data Quality: Full ✔" : "Data Quality: Full ✔")}
                            </p>
                          ) : null}
                          {shopifySyncResult.confidenceScore != null ? (
                            <p>confidence: {Math.round(shopifySyncResult.confidenceScore * 100)}%</p>
                          ) : null}
                          {shopifySyncResult.missingFields?.length ? (
                            <p>missing: {shopifySyncResult.missingFields.join(", ")}</p>
                          ) : null}
                          {shopifySyncResult.currencyMismatch ? (
                            <p>{isZh ? "检测到多币种，销售额聚合会被标记为受限。" : "Multiple currencies detected; revenue aggregation is marked limited."}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {metaSyncResult ? (
                    <div
                      className={cn(
                        "mt-4 rounded-lg border px-3 py-2 text-xs",
                        metaSyncResult.ok
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                          : "border-rose-200 bg-rose-50 text-rose-800"
                      )}
                    >
                      <p className="font-semibold">{metaSyncResult.message}</p>
                      {metaSyncResult.ok ? (
                        <div className="mt-1.5 space-y-1 text-muted-foreground">
                          <p>syncRunId: {metaSyncResult.syncRunId ?? "—"}</p>
                          <p>manifest: {metaSyncResult.manifestKey ?? "—"}</p>
                          <p>
                            {isZh ? "广告账户" : "Ad account"}: {metaSyncResult.adAccountId ?? source.config?.adAccountId ?? "—"} · ecommerce_ads rows: {metaSyncResult.rows ?? 0}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

	                  {isExpanded ? (
	                    <div className="mt-4 rounded-lg border bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        tables
                      </p>
	                      {schemaLoadError ? (
	                        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
	                          {schemaLoadError}
	                        </p>
	                      ) : null}
	                      {isLoadingSchema && tables.length === 0 ? (
	                        <p className="mt-3 rounded-md border border-dashed bg-secondary/20 px-3 py-2 text-sm text-muted-foreground">
	                          <Loader2 className="mr-2 inline size-4 animate-spin" />
	                          {isZh ? "正在读取表结构" : "Loading schema"}
	                        </p>
	                      ) : tables.length > 0 ? (
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
                      <div className="mt-4 rounded-lg border bg-secondary/10 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold">{labels.mappingTitle}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {labels.mappingDescription}
                            </p>
                          </div>
                          {unifiedIngestion ? (
                            <div className="flex flex-wrap gap-2 text-xs">
                              <Badge variant="secondary">
                                {unifiedIngestion.detectedSchema?.detected_type ?? "unknown"}
                              </Badge>
                              <Badge variant="secondary">
                                {labels.confidence} {mappingConfidenceLabel(unifiedIngestion.semantic?.confidence)}
                              </Badge>
                            </div>
                          ) : null}
                        </div>
                        {semanticMappingRows.length > 0 ? (
                          <div className="mt-3 overflow-hidden rounded-md border bg-white">
                            <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(160px,0.9fr)_96px_160px] gap-2 border-b bg-secondary/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              <span>{labels.rawField}</span>
                              <span>{labels.canonicalConcept}</span>
                              <span>{labels.confidence}</span>
                              <span className="text-right">{isZh ? "操作" : "Action"}</span>
                            </div>
                            <div className="divide-y">
                              {semanticMappingRows.map((mapping) => {
                                const key = mappingStateKey(source.id, mapping.field);
                                const feedbackState = mappingFeedback[key];
                                const selectedMapping = mappingOverrides[key] ?? mapping.canonical;

                                return (
                                  <div
                                    key={key}
                                    className="grid grid-cols-[minmax(0,1.1fr)_minmax(160px,0.9fr)_96px_160px] items-center gap-2 px-3 py-2 text-xs"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate font-medium text-foreground">{mapping.field}</p>
                                      <p className="mt-0.5 truncate text-muted-foreground">
                                        {mapping.type} · {mapping.source}
                                      </p>
                                    </div>
                                    <select
                                      value={selectedMapping}
                                      onChange={(event) => updateMappingOverride(source.id, mapping.field, event.target.value)}
                                      className="h-8 rounded-md border bg-white px-2 text-xs outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
                                    >
                                      {CANONICAL_MAPPING_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        "w-fit",
                                        (mapping.confidence ?? 0) < 0.7 && "bg-amber-50 text-amber-800"
                                      )}
                                    >
                                      {mappingConfidenceLabel(mapping.confidence)}
                                    </Badge>
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 px-2"
                                        disabled={feedbackState?.status === "saving"}
                                        onClick={() => void submitMappingFeedback(
                                          source,
                                          mapping,
                                          selectedMapping === mapping.canonical ? "confirm" : "edit"
                                        )}
                                      >
                                        {feedbackState?.status === "saving" ? labels.savingMapping : labels.confirmMapping}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="size-8 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                        disabled={feedbackState?.status === "saving"}
                                        aria-label={`${labels.rejectMapping} ${mapping.field}`}
                                        onClick={() => void submitMappingFeedback(source, mapping, "reject")}
                                      >
                                        <X className="size-3.5" />
                                      </Button>
                                    </div>
                                    {feedbackState?.message ? (
                                      <p
                                        className={cn(
                                          "col-span-4 text-[11px]",
                                          feedbackState.status === "error" ? "text-rose-700" : "text-emerald-800"
                                        )}
                                      >
                                        {feedbackState.message}
                                      </p>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="mt-3 rounded-md border border-dashed bg-white px-3 py-2 text-sm text-muted-foreground">
                            {labels.mappingUnavailable}
                          </p>
                        )}
                      </div>
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
    <Card className="overflow-hidden bg-white shadow-sm">
      <CardHeader className="border-b p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{labels.deletedTitle}</CardTitle>
            <CardDescription className="mt-1 text-sm leading-6">
              {labels.deletedDescription}
            </CardDescription>
          </div>
          <Badge variant="secondary">{deletedSources.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {deletedSources.length > 0 ? (
          <div className="grid gap-3">
            {deletedSources.map((source) => (
              <div key={source.id} className="rounded-lg border border-dashed bg-slate-50/80 p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="flex min-w-0 gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                      <Database className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-semibold">{source.name}</p>
                        <Badge variant="secondary">{source.status || "DISCONNECTED"}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full bg-white px-2.5 py-1">
                          {source.provider} · {sourceTypeLabel(copy, source)}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1">
                          {labels.deletedAt}: {formatDateOnly(source.deletedAt)}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1">
                          {labels.retentionUntil}: {formatDateOnly(source.retentionExpiresAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onRestoreDeletedSource(source.id)}
                    >
                      <RefreshCw className="size-4" />
                      {labels.restore}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                      onClick={() => onPermanentlyDeleteSource(source.id)}
                    >
                      <Trash2 className="size-4" />
                      {labels.permanentDelete}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-secondary/20 p-4">
            <p className="text-sm font-semibold">{labels.noDeleted}</p>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
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
      ? isZh ? "专业版" : "Professional"
      : isZh ? "免费版" : "Free";
  const formatDate = (value: string | null) =>
    value ? new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", { dateStyle: "medium" }).format(new Date(value)) : "-";
  const planTypeLabel =
    entitlement?.planType === "MONTHLY"
      ? isZh ? "年度服务周期，按年支付" : "Annual service term, billed annually"
      : isZh ? "免费" : "Free";
  const statusLabel = entitlement?.status ?? "free";
  const usageLabel = entitlement?.isUnlimitedReports
    ? isZh ? "无限" : "Unlimited"
    : String(entitlement?.remainingReportGenerations ?? 0);
  const stateMessage = !entitlement || entitlement.planType === "FREE"
    ? isZh ? "免费版只能查看 dashboard，请升级后连接数据并生成报告" : "Free: view dashboard only. Upgrade to connect data and generate reports."
    : entitlement.planType === "MONTHLY" && entitlement.cancelAtPeriodEnd
        ? isZh ? `套餐仍可使用至 ${formatDate(entitlement.currentPeriodEnd)}` : `Your plan remains active until ${formatDate(entitlement.currentPeriodEnd)}.`
        : entitlement.status === "expired"
          ? isZh ? "订阅已过期，请重新开通" : "Subscription expired. Please reactivate"
          : isZh ? "套餐权限可用" : "Plan access is active";
  const billingStats = isZh
    ? [
        ["当前套餐", currentPlan],
        ["套餐类型", planTypeLabel],
        ["数据源连接", entitlement?.canConnectDataSource ? "允许，不限数量" : "需要升级"],
        ["报告生成", entitlement?.canGenerateReport ? usageLabel : "需要升级"],
        ["有效期", formatDate(entitlement?.currentPeriodEnd ?? null)],
        ["订阅状态", statusLabel]
      ]
    : [
        ["Current plan", currentPlan],
        ["Plan type", planTypeLabel],
        ["Data source connections", entitlement?.canConnectDataSource ? "Allowed, unlimited" : "Upgrade required"],
        ["Report generations", entitlement?.canGenerateReport ? usageLabel : "Upgrade required"],
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
              <a href={entitlement?.planType === "MONTHLY" ? "/checkout/enterprise" : "/checkout/professional"}>
                <CreditCard className="size-4" />
                {entitlement?.planType === "MONTHLY" ? isZh ? "升级企业版" : "Upgrade to Enterprise" : isZh ? "开通专业版" : "Start Professional"}
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
  onRemoveConnectedSource,
  isLoadingConnectedSources,
  connectionPage = false,
  initialSourceName
}: {
  copy: DashboardCopy;
  connectedSources: ConnectedSourceRow[];
  onAddConnectedSource: (source: ConnectedSourceRow) => void;
  onRemoveConnectedSource: (sourceId: string) => void;
  isLoadingConnectedSources: boolean;
  connectionPage?: boolean;
  initialSourceName?: string;
}) {
  const searchParams = useSearchParams();
  const isZh = copy.connectors.connectedCountLabel.includes("个");
  const [shopifyPermissionIssue, setShopifyPermissionIssue] = useState<ShopifyConnectorMessage | null>(null);
  const connectorError = shopifyConnectorErrorMessage(searchParams, isZh) ?? shopifyPermissionIssue;

  useEffect(() => {
    let isActive = true;

    void fetch("/api/connectors/shopify/status", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);

        if (!isActive) return;
        if (response.ok && payload?.scopeStatus === "NEEDS_REAUTHORIZATION") {
          setShopifyPermissionIssue(shopifyConnectorReauthorizationMessage(payload, isZh));
          return;
        }

        setShopifyPermissionIssue(null);
      })
      .catch(() => {
        if (isActive) setShopifyPermissionIssue(null);
      });

    return () => {
      isActive = false;
    };
  }, [isZh]);

  return (
    <section id="import-data" className="scroll-mt-20">
      {connectorError ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">{connectorError.title}</p>
              <p className="mt-1 font-medium leading-6">{connectorError.message}</p>
                {connectorError.missingPermissions.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {connectorError.missingPermissions.map((permission) => (
                      <span key={permission} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-900 ring-1 ring-amber-200">
                        {permission}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            {connectorError.actionHref ? (
              <Button asChild size="sm" className="bg-amber-900 text-white hover:bg-amber-950">
                <a href={connectorError.actionHref}>{connectorError.actionLabel}</a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {connectionPage ? (
        <div className="grid gap-4">
          <ConnectorPanel
            copy={copy}
            onAddConnectedSource={onAddConnectedSource}
            connectionPage={connectionPage}
            initialSourceName={initialSourceName}
          />
        </div>
      ) : (
        <div className="mt-5 grid gap-5">
          <DataSourcesWorkspace
            copy={copy}
            connectedSources={connectedSources}
            onRemoveConnectedSource={onRemoveConnectedSource}
            isLoadingConnectedSources={isLoadingConnectedSources}
            onConnect={(sourceName) => {
              if (typeof window !== "undefined") {
                window.location.href = `/dashboard/import-data/connect?source=${encodeURIComponent(sourceName)}`;
              }
            }}
          />
        </div>
      )}
    </section>
  );
}

type ShopifyConnectorMessage = {
  title: string;
  message: string;
  missingPermissions: string[];
  actionHref: string | null;
  actionLabel: string;
};

function shopifyConnectorErrorMessage(searchParams: URLSearchParams | ReadonlyURLSearchParamsLike | null, isZh: boolean) {
  if (searchParams?.get("shopify") !== "failed") return null;

  const code = searchParams.get("code");
  if (code === "SHOPIFY_SCOPES_NOT_GRANTED") {
    const shop = searchParams.get("shop");
    const actionHref = shop ? `/api/connectors/shopify/start?shop=${encodeURIComponent(shop)}` : "/dashboard/import-data/connect?source=Shopify";
    return {
      title: isZh ? "Shopify 权限需要更新" : "Shopify permissions need update",
      message: isZh
        ? "当前授权缺少同步所需权限。无需卸载应用，点击按钮重新授权即可。"
        : "This store is missing required sync permissions. No uninstall is needed; update permissions to continue.",
      missingPermissions: isZh ? ["订单", "商品", "客户数据"] : ["Orders", "Products", "Customer data"],
      actionHref,
      actionLabel: isZh ? "更新 Shopify 权限" : "Update Shopify Permissions"
    };
  }

  return {
    title: isZh ? "Shopify 连接失败" : "Shopify connection failed",
    message: isZh
      ? `错误代码：${code ?? "unknown"}。请检查店铺域名和应用权限后重试。`
      : `Error code: ${code ?? "unknown"}. Check the shop domain and app permissions, then try again.`,
    missingPermissions: [],
    actionHref: null,
    actionLabel: ""
  };
}

function shopifyScopePermissionLabels(missingScopes: unknown, isZh: boolean) {
  const scopes = Array.isArray(missingScopes)
    ? missingScopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  const labels = new Set<string>();

  scopes.forEach((scope) => {
    if (scope.includes("order")) labels.add(isZh ? "订单" : "Orders");
    if (scope.includes("product")) labels.add(isZh ? "商品" : "Products");
    if (scope.includes("customer")) labels.add(isZh ? "客户数据" : "Customer data");
  });

  if (labels.size === 0) {
    return isZh ? ["订单", "商品", "客户数据"] : ["Orders", "Products", "Customer data"];
  }

  return Array.from(labels);
}

function shopifyConnectorReauthorizationMessage(payload: Record<string, unknown>, isZh: boolean): ShopifyConnectorMessage {
  const shop = typeof payload.shopDomain === "string" ? payload.shopDomain : "";
  const actionHref = shop ? `/api/connectors/shopify/start?shop=${encodeURIComponent(shop)}` : "/dashboard/import-data/connect?source=Shopify";

  return {
    title: isZh ? "Shopify 权限需要更新" : "Shopify permissions need update",
    message: isZh
      ? "当前 Shopify 授权低于新版同步要求。无需卸载应用，重新授权后会恢复已连接业务源。"
      : "This Shopify authorization is missing permissions required by the current sync version. No uninstall is needed; update permissions to restore the connected source.",
    missingPermissions: shopifyScopePermissionLabels(payload.missingScopes, isZh),
    actionHref,
    actionLabel: isZh ? "更新 Shopify 权限" : "Update Shopify Permissions"
  };
}

type ReadonlyURLSearchParamsLike = {
  get(name: string): string | null;
};

type BusinessDatasetView = {
  name: string;
  rowsLabel: string;
};

type BusinessSourceView = {
  id: string;
  name: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  lastSyncLabel: string;
  datasets: BusinessDatasetView[];
  summaryLabel: string;
  sourceRows: ConnectedSourceRow[];
};

function inferBusinessSourceKey(source: ConnectedSourceRow) {
  const value = [
    source.name,
    source.provider,
    source.type,
    source.config?.fileName
  ].filter(Boolean).join(" ").toLowerCase();

  if (value.includes("shopify")) return "shopify";
  if (value.includes("meta") || value.includes("facebook") || value.includes("ad")) return "meta_ads";
  if (value.includes("amazon")) return "amazon";
  if (
    value.includes("excel") ||
    value.includes("csv") ||
    value.includes("xlsx") ||
    value.includes("xls") ||
    value.includes("file") ||
    value.includes("upload")
  ) {
    return "file";
  }
  if (value.includes("inventory") || value.includes("stock")) return "inventory";
  if (
    value.includes("database") ||
    value.includes("sql") ||
    value.includes("postgres") ||
    value.includes("mysql") ||
    value.includes("snowflake") ||
    value.includes("bigquery")
  ) {
    return "database";
  }

  return null;
}

function businessDatasetRows(source: ConnectedSourceRow) {
  return source.schema?.unifiedIngestion?.totalParsedRows ?? source.schema?.unifiedIngestion?.sampledRows ?? 0;
}

function formatBusinessNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function businessSourceStatus(rows: ConnectedSourceRow[]) {
  if (rows.some((source) => (source.syncStatus || source.status || "").toUpperCase() === "CONNECTED")) {
    return "CONNECTED";
  }

  return rows.find((source) => {
    const status = (source.syncStatus || source.status || "").toUpperCase();
    return status !== "CONNECTED";
  })?.syncStatus || rows[0]?.syncStatus || rows[0]?.status || "CONNECTED";
}

function buildBusinessSources(connectedSources: ConnectedSourceRow[], isZh: boolean): BusinessSourceView[] {
  const grouped = new Map<string, ConnectedSourceRow[]>();
  const ungrouped: ConnectedSourceRow[] = [];

  connectedSources.forEach((source) => {
    const key = inferBusinessSourceKey(source);
    if (!key) {
      ungrouped.push(source);
      return;
    }

    grouped.set(key, [...(grouped.get(key) ?? []), source]);
  });

  const definitions: Array<{
    id: string;
    name: string;
    typeLabel: string;
    summaryLabel: string;
    fallbackDatasets: BusinessDatasetView[];
  }> = [
    {
      id: "shopify",
      name: "Shopify",
      typeLabel: isZh ? "电商系统" : "Ecommerce",
      summaryLabel: isZh ? "订单、商品、客户和库存" : "Orders, products, customers, and inventory",
      fallbackDatasets: [
        { name: isZh ? "订单" : "Orders", rowsLabel: "82,911 rows" },
        { name: isZh ? "商品" : "Products", rowsLabel: "2,000 SKUs" },
        { name: isZh ? "客户" : "Customers", rowsLabel: "17,900 users" },
        { name: isZh ? "退款" : "Refunds", rowsLabel: "1,200 records" }
      ]
    },
    {
      id: "meta_ads",
      name: "Meta Ads",
      typeLabel: isZh ? "广告投放" : "Advertising",
      summaryLabel: isZh ? "活动、花费和广告表现" : "Campaigns, ad spend, and performance",
      fallbackDatasets: [
        { name: isZh ? "广告活动" : "Campaigns", rowsLabel: "128 campaigns" },
        { name: isZh ? "广告花费" : "Ad Spend", rowsLabel: "$47.14 today" },
        { name: isZh ? "广告表现" : "Performance", rowsLabel: "ready" }
      ]
    },
    {
      id: "amazon",
      name: "Amazon",
      typeLabel: isZh ? "电商渠道" : "Marketplace",
      summaryLabel: isZh ? "销售、费用和渠道利润" : "Sales, fees, and channel profit",
      fallbackDatasets: [
        { name: isZh ? "订单" : "Orders", rowsLabel: "31,420 rows" },
        { name: isZh ? "商品" : "Products", rowsLabel: "2,000 SKUs" },
        { name: isZh ? "费用" : "Fees", rowsLabel: "ready" }
      ]
    },
    {
      id: "inventory",
      name: "Inventory",
      typeLabel: isZh ? "运营库存" : "Operations",
      summaryLabel: isZh ? "库存、在库 SKU 和补货状态" : "Stock, SKU coverage, and replenishment status",
      fallbackDatasets: [
        { name: isZh ? "SKU 库存" : "SKU Stock", rowsLabel: "2,000 SKUs" },
        { name: isZh ? "库存风险" : "Inventory Risk", rowsLabel: "ready" }
      ]
    },
    {
      id: "file",
      name: isZh ? "上传数据" : "Uploaded data",
      typeLabel: isZh ? "文件数据源" : "File source",
      summaryLabel: isZh ? "上传的 Excel、CSV 和业务文件" : "Uploaded Excel, CSV, and business files",
      fallbackDatasets: [
        { name: isZh ? "上传文件" : "Uploaded files", rowsLabel: "ready" }
      ]
    },
    {
      id: "database",
      name: isZh ? "业务数据库" : "Database",
      typeLabel: isZh ? "数据仓库" : "Data warehouse",
      summaryLabel: isZh ? "数据库表结构和聚合指标" : "Schema, tables, and metric-ready data",
      fallbackDatasets: [
        { name: isZh ? "业务表" : "Business tables", rowsLabel: "schema ready" },
        { name: isZh ? "指标层" : "Metric layer", rowsLabel: "ready" }
      ]
    }
  ];

  const knownSources = definitions.flatMap((definition) => {
    const rows = grouped.get(definition.id) ?? [];
    if (rows.length === 0) return [];

    const detectedDatasets = rows.map((source) => {
      const rowsCount = businessDatasetRows(source);
      const sourceName = source.config?.fileName || source.name;

      return {
        name: sourceName.replace(/^Excel -\s*/i, "").replace(/_enriched\.xlsx$/i, ""),
        rowsLabel: rowsCount > 0 ? `${formatBusinessNumber(rowsCount)} ${isZh ? "行" : "rows"}` : (isZh ? "已连接" : "connected")
      };
    });

    const status = businessSourceStatus(rows);

    return [{
      ...definition,
      status,
      statusLabel: sourceStatusLabel(status, isZh),
      lastSyncLabel: isZh ? "今天" : "Today",
      datasets: detectedDatasets.length > 0 ? detectedDatasets : definition.fallbackDatasets,
      sourceRows: rows
    }];
  });

  const genericSources = ungrouped.map((source) => {
    const rowsCount = businessDatasetRows(source);
    const sourceName = source.config?.fileName || source.name;
    const typeLabel = source.provider || source.type || (isZh ? "业务数据源" : "Business source");

    return {
      id: `source-${source.id}`,
      name: sourceName,
      typeLabel,
      summaryLabel: isZh ? "已连接业务数据源" : "Connected business data source",
      status: source.syncStatus || source.status,
      statusLabel: sourceStatusLabel(source.syncStatus || source.status, isZh),
      lastSyncLabel: source.lastSyncAt
        ? new Date(source.lastSyncAt).toLocaleDateString(isZh ? "zh-CN" : "en-US")
        : (isZh ? "今天" : "Today"),
      datasets: [{
        name: sourceName,
        rowsLabel: rowsCount > 0 ? `${formatBusinessNumber(rowsCount)} ${isZh ? "行" : "rows"}` : (isZh ? "已连接" : "connected")
      }],
      sourceRows: [source]
    };
  });

  return [...knownSources, ...genericSources];
}

function businessSourceIcon(sourceId: string) {
  if (sourceId === "meta_ads") return <BarChart3 className="size-5" />;
  if (sourceId === "inventory") return <Table2 className="size-5" />;
  if (sourceId === "database") return <Database className="size-5" />;
  return <Activity className="size-5" />;
}

function resolveDatabaseConnectorType(source: DataSourceDefinition) {
  const identity = `${source.provider ?? ""} ${source.name}`.toLowerCase();

  if (identity.includes("postgres")) return "postgresql";
  if (identity.includes("mysql")) return "mysql";

  return null;
}

function resolveConnectorSourceName(name: string, copy: DashboardCopy) {
  const lowerName = name.toLowerCase();
  const findSource = (predicate: (source: DataSourceDefinition) => boolean) =>
    copy.connectors.sources.find(predicate)?.name ?? null;

  if (lowerName.includes("meta")) return findSource((source) => source.provider === "meta_ads");
  if (lowerName.includes("shopify")) return findSource((source) => source.provider === "shopify");
  if (lowerName.includes("postgres")) return findSource((source) => source.provider === "postgresql");
  if (lowerName.includes("mysql")) return findSource((source) => source.provider === "mysql");
  if (lowerName.includes("excel") || lowerName.includes("csv")) {
    return findSource((source) => source.authMode === "file_upload");
  }

  return null;
}

function DataSourcesWorkspace({
  copy,
  connectedSources,
  onRemoveConnectedSource,
  isLoadingConnectedSources,
  onConnect
}: {
  copy: DashboardCopy;
  connectedSources: ConnectedSourceRow[];
  onRemoveConnectedSource: (sourceId: string) => void;
  isLoadingConnectedSources: boolean;
  onConnect: (sourceName: string) => void;
}) {
  const isZh = copy.connectors.connectedCountLabel.includes("个");
  const [workspaceSources, setWorkspaceSources] = useState<ConnectedSourceRow[]>(connectedSources);
  const businessSources = useMemo(
    () => buildBusinessSources(workspaceSources.length > 0 ? workspaceSources : connectedSources, isZh),
    [connectedSources, isZh, workspaceSources]
  );
  const hasAnySources = connectedSources.length > 0 || workspaceSources.length > 0;

  useEffect(() => {
    setWorkspaceSources(connectedSources);
  }, [connectedSources]);

  const removeBusinessSource = (source: BusinessSourceView) => {
    const sourceIds = source.sourceRows.map((row) => row.id);
    setWorkspaceSources((current) => current.filter((row) => !sourceIds.includes(row.id)));
    sourceIds.forEach((sourceId) => onRemoveConnectedSource(sourceId));
  };
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(300px,400px)_minmax(0,1fr)] xl:items-start">
      <section className="mt-6 min-w-0 overflow-hidden rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 xl:mt-10">
          <div className="flex items-center justify-between gap-3">
            <div className="w-full">
              <h3 className="text-center text-lg font-semibold tracking-tight text-slate-950">
                {isZh ? "已连接业务源" : "Connected Sources"}
              </h3>
            </div>
          </div>

          {isLoadingConnectedSources && !hasAnySources && businessSources.length === 0 ? (
            <div className="mt-5 rounded-3xl bg-slate-50 p-8 text-sm font-semibold text-slate-500 ring-1 ring-slate-200">
              <Loader2 className="mr-2 inline size-4 animate-spin" />
              {isZh ? "正在加载已连接业务源" : "Loading connected business sources"}
            </div>
          ) : businessSources.length > 0 ? (
            <div className="mt-5 grid max-h-[60vh] gap-3 overflow-y-scroll overscroll-contain pr-2 [scrollbar-color:#cbd5e1_transparent] [scrollbar-width:thin] sm:grid-cols-2 xl:max-h-[520px] xl:grid-cols-1">
              {businessSources.map((source) => (
                <div
                  key={source.id}
                  className="relative flex items-center gap-4 rounded-[28px] border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50/60"
                >
                  <button
                    type="button"
                    className="absolute -right-2.5 -top-2.5 grid size-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`${isZh ? "删除" : "Delete"} ${source.name}`}
                    onClick={() => removeBusinessSource(source)}
                  >
                    <X className="size-3.5" />
                  </button>
                  <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600">
                    {businessSourceIcon(source.id)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-base font-semibold text-slate-950">{source.name}</h4>
                        <p className="mt-1 truncate text-sm font-medium text-slate-500">{source.typeLabel}</p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", sourceStatusBadgeClass(source.status))}>
                        {source.statusLabel}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500">
                      <span>{source.datasets.length} {isZh ? "个数据集" : source.datasets.length === 1 ? "dataset" : "datasets"}</span>
                      <span className="size-1 rounded-full bg-slate-300" aria-hidden="true" />
                      <span>{isZh ? "最近同步" : "Last sync"} {source.lastSyncLabel}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-sm font-semibold text-slate-500">
              {isZh ? "连接你的电商数据，解锁 AI 利润智能。" : "Connect your commerce data. Unlock AI profit intelligence."}
            </div>
          )}
      </section>

      <AvailableIntegrationsWorkspace copy={copy} onConnect={onConnect} />
    </div>
  );
}

function AvailableIntegrationsWorkspace({
  copy,
  onConnect
}: {
  copy: DashboardCopy;
  onConnect: (sourceName: string) => void;
}) {
  const isZh = copy.connectors.connectedCountLabel.includes("个");
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const groups = [
    {
      title: isZh ? "电商" : "Ecommerce",
      integrations: [
        { name: "Shopify", description: isZh ? "订单、商品、客户" : "Orders, products, customers" },
        { name: "Amazon", description: isZh ? "市场销售和费用" : "Marketplace sales and fees" },
        { name: "WooCommerce", description: isZh ? "店铺销售数据" : "Store sales data" },
        { name: "TikTok Shop", description: isZh ? "社交电商数据" : "Social commerce data" }
      ]
    },
    {
      title: isZh ? "广告" : "Advertising",
      integrations: [
        { name: "Meta Ads", description: isZh ? "花费、活动、表现" : "Spend, campaigns, performance" },
        { name: "Google Ads", description: isZh ? "搜索和购物广告" : "Search and shopping ads" },
        { name: "TikTok Ads", description: isZh ? "内容投放表现" : "Creative and spend performance" }
      ]
    },
    {
      title: isZh ? "数据库" : "Database",
      integrations: [
        { name: "PostgreSQL", description: isZh ? "业务数据库" : "Operational database" },
        { name: "MySQL", description: isZh ? "业务数据库" : "Operational database" },
        { name: "SQL Server", description: isZh ? "企业数据库" : "Enterprise database" },
        { name: "Snowflake", description: isZh ? "数据仓库" : "Data warehouse" },
        { name: "BigQuery", description: isZh ? "数据仓库" : "Data warehouse" }
      ]
    },
    {
      title: isZh ? "文件" : "Files",
      integrations: [
        { name: "Excel / CSV", description: isZh ? "上传业务文件" : "Upload business files" },
        { name: "Google Sheets", description: isZh ? "表格数据" : "Spreadsheet data" }
      ]
    }
  ];
  const activeGroup = groups[activeGroupIndex] ?? groups[0];

  return (
    <div className="mx-auto mt-6 w-full max-w-[860px] xl:mt-10">
      <h3 className="text-center text-lg font-semibold tracking-tight text-slate-950">
        {isZh ? "一键连接你的电商数据" : "Connect your commerce data in one click"}
      </h3>

      <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex justify-center">
        <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-slate-100 p-1">
          {groups.map((group, index) => {
            const isActive = index === activeGroupIndex;

            return (
              <button
                key={group.title}
                type="button"
                onClick={() => setActiveGroupIndex(index)}
                className={cn(
                  "whitespace-nowrap rounded-full px-5 py-2 text-sm font-semibold transition",
                  isActive ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"
                )}
              >
                {group.title}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto mt-5 max-h-[520px] max-w-[760px] overflow-y-auto rounded-3xl bg-slate-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {activeGroup.integrations.map((integration) => {
            const resolvedSourceName = resolveConnectorSourceName(integration.name, copy);
            const isSupported = Boolean(resolvedSourceName);

            return (
              <div key={integration.name} className="min-h-[132px] rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{integration.name}</p>
                    <p className="mt-1 text-sm font-medium leading-snug text-slate-500">{integration.description}</p>
                  </div>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
                    {integration.name.includes("Ads") ? <BarChart3 className="size-4" /> : integration.name.includes("Excel") || integration.name.includes("Sheets") ? <FileText className="size-4" /> : <Database className="size-4" />}
                  </span>
                </div>
                {isSupported ? (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-4 h-8 rounded-full bg-[#079669] px-4 text-xs font-semibold text-white hover:bg-[#067f5a]"
                    onClick={() => {
                      if (resolvedSourceName) onConnect(resolvedSourceName);
                    }}
                  >
                    {copy.connectors.connectAction}
                    <ArrowRight className="size-4" />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      </section>
    </div>
  );
}

function ConnectedDataDropdown({
  copy,
  connectedSources
}: {
  copy: DashboardCopy;
  connectedSources: ConnectedSourceRow[];
}) {
  const isZh = copy.connectors.connectedCountLabel.includes("个");
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownSources, setDropdownSources] = useState<ConnectedSourceRow[]>(connectedSources);
  const [isRefreshingDropdownSources, setIsRefreshingDropdownSources] = useState(false);
  const visibleSources = dropdownSources.length > 0 ? dropdownSources : connectedSources;

  useEffect(() => {
    if (connectedSources.length > 0) {
      setDropdownSources(connectedSources);
    }
  }, [connectedSources]);

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    setIsRefreshingDropdownSources(true);

    void fetch("/api/data-sources", {
      cache: "no-store",
      signal: controller.signal
    }).then(async (response) => {
      const payload = await response.json().catch(() => null);

      if (response.ok && payload?.ok && Array.isArray(payload.dataSources)) {
        setDropdownSources(payload.dataSources as ConnectedSourceRow[]);
      }
    }).catch((error) => {
      if (error instanceof Error && error.name === "AbortError") return;
      console.warn("[dashboard] Failed to refresh connected data dropdown", error);
    }).finally(() => {
      setIsRefreshingDropdownSources(false);
    });

    return () => controller.abort();
  }, [isOpen]);

  return (
    <div className="grid w-full gap-3">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50"
      >
        <Database className="size-4 text-emerald-800" />
        {isZh ? "已连接数据" : "Connected data"}
        <ChevronDown className={cn("size-4 text-slate-500 transition", isOpen && "rotate-180")} />
      </button>

      {isOpen ? (
        <div className="w-full max-w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-xl">
          {isRefreshingDropdownSources && visibleSources.length === 0 ? (
            <div className="flex items-center gap-3 px-4 py-5 text-sm font-semibold text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {isZh ? "正在加载已连接数据" : "Loading connected data"}
            </div>
          ) : visibleSources.length > 0 ? (
            visibleSources.map((source) => {
              const sourceMeta = [
                source.provider || source.type,
                source.status || (isZh ? "已连接" : "Connected")
              ].filter(Boolean).join(" · ");

              return (
                <div
                  key={source.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-emerald-50/70"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                      <Database className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{source.name}</p>
                      <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{sourceMeta}</p>
                    </div>
                  </div>
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-700" />
                </div>
              );
            })
          ) : (
            <div className="px-4 py-5 text-sm font-medium text-slate-500">
              {isZh ? "当前没有已连接的数据源" : "No connected data sources"}
            </div>
          )}
        </div>
      ) : null}
    </div>
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
  const [databasePort, setDatabasePort] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [databaseUser, setDatabaseUser] = useState("");
  const [databasePassword, setDatabasePassword] = useState("");
  const [databaseSsl, setDatabaseSsl] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isConnectingDatabase, setIsConnectingDatabase] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadedFileSource, setUploadedFileSource] = useState<ConnectedSourceRow | null>(null);
  const [shopifyShopDomain, setShopifyShopDomain] = useState("");
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
	  const isFileSource = selectedSource.authMode === "file_upload";
	  const isOAuthSource = selectedSource.authMode === "oauth";
	  const isShopifySource = selectedSource.provider === "shopify";
	  const isMetaAdsSource = selectedSource.provider === "meta_ads";
	  const isSqlLikeSource = selectedSource.kind === "database" || selectedSource.kind === "warehouse";
  const databaseType = resolveDatabaseConnectorType(selectedSource);
  const defaultDatabasePort = databaseType === "mysql" ? "3306" : "5432";
  const directApiUploadMaxBytes = Math.min(FILE_UPLOAD_MAX_BYTES, 4 * 1024 * 1024);
  const largeUploadMaxBytes = FILE_UPLOAD_MAX_BYTES;
  const effectiveDatabasePort = databasePort || defaultDatabasePort;
  const isZh = copy.connectors.title === "连接数据源";
  const databaseHostPreview = databaseHost || (isZh ? "服务器预设 / 未配置" : "Server preset / not configured");
  const databaseNamePreview = databaseName || (isZh ? "服务器预设 / 未配置" : "Server preset / not configured");
	  const isSupportedDatabase = databaseType !== null;
	  const showWizard = connectionPage || wizardStarted;
	  const connectPageHref = `/dashboard/import-data/connect?source=${encodeURIComponent(selectedSource.name)}`;
	  const normalizeShopifyShopInput = (value: string) => value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
	  const isValidShopifyShopDomain = (value: string) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value);
	  const connectDataSource = (source: DataSourceDefinition) => {
	    const sourceDatabaseType = resolveDatabaseConnectorType(source);

	    if ((source.kind === "database" || source.kind === "warehouse") && !sourceDatabaseType) {
	      setConnectionResult({
	        ok: false,
	        message: isZh
	          ? "当前版本支持 PostgreSQL 和 MySQL 数据库连接。其他数据库和数据仓库即将支持。"
	          : "This version supports PostgreSQL and MySQL database connections. Other databases and warehouses are coming soon."
	      });
	      setWizardStarted(true);
	      return;
	    }

	    if (source.authMode === "oauth") {
	      if (source.provider === "shopify") {
	        const shopDomain = normalizeShopifyShopInput(shopifyShopDomain);

	        if (!isValidShopifyShopDomain(shopDomain)) {
	          setConnectionResult({
	            ok: false,
	            message: isZh
	              ? "请输入有效的 Shopify 店铺域名，例如 your-store.myshopify.com。不能使用 admin.shopify.com、localhost 或空值。"
	              : "Enter a valid Shopify store domain, for example your-store.myshopify.com. admin.shopify.com, localhost, and empty values are not allowed."
	          });
	          setWizardStarted(true);
	          return;
	        }

	        window.location.href = `/api/connectors/shopify/start?shop=${encodeURIComponent(shopDomain)}`;
	        return;
	      }

	      if (source.provider === "meta_ads") {
	        window.location.href = "/api/connectors/meta/start";
	        return;
	      }

	      setConnectionResult({
	        ok: false,
	        message: isZh
	          ? `${source.name} OAuth 接入尚未启用。`
	          : `${source.name} OAuth is not enabled yet.`
	      });
	      setWizardStarted(true);
	      return;
	    }

	    if (source.authMode === "file_upload") {
	      window.location.href = connectPageHref;
	      return;
	    }

	    window.location.href = connectPageHref;
	  };
	  const startSelectedSourceConnection = () => {
	    if (selectedSource.provider === "shopify") {
	      setWizardStarted(true);
	      setConnectionResult(null);
	      return;
	    }

	    connectDataSource(selectedSource);
	  };
  const addSelectedSource = (source: ConnectedSourceRow) => {
    onAddConnectedSource(source);
    window.dispatchEvent(new Event("monarca-data-sources-updated"));
    if (!connectionPage) {
      setWizardStarted(false);
    }
  };
  const friendlyConnectionMessage = (message: string) => {
    if (message.includes("DATABASE_PRESET_INCOMPLETE")) {
      const cleanedMessage = message.replace(/^DATABASE_PRESET_INCOMPLETE:\s*/, "");

      return isZh
        ? cleanedMessage
        : `The ${selectedSource.name} server preset is incomplete. Fill Host, Database, and Username in this form, or configure the matching database environment variables in Vercel.`;
    }

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

    if (
      message.includes("Please choose a plan to connect data sources") ||
      message.includes("请先升级套餐后再连接数据源") ||
      message.includes("请选择套餐后再连接数据源")
    ) {
      return isZh ? "请先升级套餐后再连接数据源。" : "Please choose a plan to connect data sources.";
    }

    if (
      message.includes("Please choose a plan to generate reports") ||
      message.includes("请先升级套餐后再生成报告") ||
      message.includes("请选择套餐后再生成报告")
    ) {
      return isZh ? "请先升级套餐后再生成报告。" : "Please choose a plan to generate reports.";
    }

    return message;
  };
  const resetConnectionResult = () => {
    setConnectionResult(null);
    setSchemaResult(null);
  };
  const previewSchemaTables = (tables: NonNullable<ConnectedSourceRow["schema"]>["tables"] = []) =>
    tables.map((table) => ({
      name: table.name,
      schema: table.schema ?? undefined,
      columns: table.columns.map((column) => ({
        name: column.name,
        type: column.type ?? "unknown"
      }))
    }));
  const databaseConnectionPayload = () => ({
    type: databaseType,
    host: databaseHost,
    port: Number(effectiveDatabasePort),
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
  const uploadNetworkErrorMessage = (scope: "api" | "direct") => {
    if (scope === "direct") {
      return isZh
        ? "文件直传存储失败。大文件不能回退到 Vercel Function 上传，请在 Cloudflare R2 bucket CORS 中允许 https://www.monarcadata.com 后重试。"
        : "Direct file upload failed. Large files cannot fall back to Vercel Function upload; allow https://www.monarcadata.com in Cloudflare R2 bucket CORS and try again.";
    }

    return isZh
      ? "无法连接上传服务。请检查网络后重试；大文件需要通过 Cloudflare R2 直传。"
      : "Could not reach the upload service. Check your network and try again; larger files must use Cloudflare R2 direct upload.";
  };
  type UploadResponsePayload = {
    ok?: boolean;
    message?: string;
    error?: string;
    dataSource?: ConnectedSourceRow;
    schema?: {
      tableCount?: number;
    };
  };
  const responsePayload = async (response: Response): Promise<UploadResponsePayload | null> => {
    const text = await response.text().catch(() => "");

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as UploadResponsePayload;
    } catch {
      return {
        ok: false,
        message: text.slice(0, 240)
      };
    }
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
    }).catch(() => null);

    if (!presignResponse) {
      if (file.size <= directApiUploadMaxBytes) {
        return uploadSmallFile(file);
      }

      throw new Error(uploadNetworkErrorMessage("api"));
    }

    const presignPayload = await responsePayload(presignResponse) as {
      ok?: boolean;
      message?: string;
      provider?: string;
      uploadUrl?: string;
      key?: string;
      path?: string;
      token?: string;
      bucket?: string;
      contentType?: string;
      uploadOrigin?: string;
      corsPolicy?: unknown;
    } | null;
    const uploadOrigin = presignPayload?.uploadOrigin ??
      (presignPayload?.uploadUrl
        ? (() => {
            try {
              return new URL(presignPayload.uploadUrl).origin;
            } catch {
              return null;
            }
          })()
        : null);

    console.info("Upload presign response", {
      ok: presignResponse.ok,
      status: presignResponse.status,
      statusText: presignResponse.statusText,
      provider: presignPayload?.provider,
      bucket: presignPayload?.bucket,
      uploadOrigin,
      corsPolicy: presignPayload?.corsPolicy,
      key: presignPayload?.key ?? presignPayload?.path,
      contentType: presignPayload?.contentType
    });

    if (!presignResponse.ok || !presignPayload?.ok || !presignPayload.uploadUrl || !presignPayload.path) {
      if (
        presignPayload?.message?.includes("R2 storage is not configured") &&
        file.size <= directApiUploadMaxBytes
      ) {
        return uploadSmallFile(file);
      }
      throw new Error(presignPayload?.message || (isZh ? "无法准备大文件上传" : "Failed to prepare large file upload"));
    }

    const uploadContentType = presignPayload.contentType || file.type || "application/octet-stream";

    const uploadResponse = await fetch(presignPayload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": uploadContentType
      },
      body: file
    }).catch(() => null);

    if (!uploadResponse) {
      if (file.size <= directApiUploadMaxBytes) {
        return uploadSmallFile(file);
      }

      throw new Error(uploadNetworkErrorMessage("direct"));
    }

    const uploadText = await uploadResponse.text().catch(() => "");
    const uploadPayload = uploadText
      ? (() => {
          try {
            return JSON.parse(uploadText) as {
      Key?: string;
      path?: string;
      fullPath?: string;
      error?: string;
      message?: string;
            };
          } catch {
            return { message: uploadText };
          }
        })()
      : null;

    console.info("R2 direct upload response", {
      ok: uploadResponse.ok,
      status: uploadResponse.status,
      statusText: uploadResponse.statusText,
      body: uploadText.slice(0, 1000)
    });

    if (!uploadResponse.ok) {
      if (file.size <= directApiUploadMaxBytes) {
        return uploadSmallFile(file);
      }

      throw new Error(uploadPayload?.message || uploadPayload?.error || (isZh
        ? "大文件直传失败。请检查 Cloudflare R2 CORS、bucket 或凭证配置。"
        : "Large file direct upload failed. Check Cloudflare R2 CORS, bucket, or credentials."));
    }

    const uploadedKey = presignPayload.key ?? uploadPayload?.path ??
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
        key: uploadedKey,
        path: uploadedKey,
        bucket: presignPayload.bucket,
        fileName: file.name,
        fileSize: file.size,
        mimeType: uploadContentType
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
        ? await uploadSmallFile(file).catch(() => null)
        : await uploadLargeFile(file);

      if (!response) {
        throw new Error(uploadNetworkErrorMessage("api"));
      }

      const payload = await responsePayload(response);

      if (!response.ok || !payload?.ok || !payload?.dataSource) {
        if (response.status === 401 || payload?.message === "Unauthorized" || payload?.error === "Unauthorized") {
          throw new Error(isZh
            ? "登录状态已失效。请在本地 3100 重新登录后再上传。"
            : "Your session expired. Sign in again on local port 3100 before uploading.");
        }

        if (response.status === 403 || payload?.message === "Forbidden" || payload?.error === "Forbidden") {
          throw new Error(isZh
            ? "当前账号没有上传权限。请使用 Owner / Admin 账号登录后重试。"
            : "Your account does not have upload permission. Sign in as an Owner or Admin and try again.");
        }

        throw new Error(payload?.message || (isZh
          ? "文件上传失败，请稍后重试。"
          : "File upload failed. Please try again."));
      }

      setSchemaResult({
        tableCount: payload.schema?.tableCount ?? 0,
        tables: previewSchemaTables(payload.dataSource.schema?.tables)
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
      const message = error instanceof Error ? error.message : isZh ? "连接失败" : "Connection failed";

      setConnectionResult({
        ok: false,
        message: friendlyConnectionMessage(message)
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
          port: Number(effectiveDatabasePort),
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
        message: copy.connectors.databaseConnected.replace("{provider}", selectedSource.name)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : isZh ? "连接数据库失败" : "Database connection failed";

      setConnectionResult({
        ok: false,
        message: friendlyConnectionMessage(message)
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
    setDatabasePort("");
    setShopifyShopDomain("");
  }, [selectedSource.name]);

  return (
    <Card className="mx-auto h-full w-full max-w-[820px] overflow-visible border-0 bg-transparent shadow-none">
      <CardContent className="p-0">
        <div className={cn("grid gap-4", showWizard && "2xl:grid-cols-[minmax(0,1fr)_340px]")}>
          <div className="rounded-lg border bg-background">
            <div className={cn("bg-secondary/20 px-4 py-3", showWizard ? "hidden" : "block")}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {copy.connectors.sourcePicker}
                </p>
              </div>
              <div className="mx-auto grid max-w-[680px] gap-2 sm:grid-cols-2 xl:grid-cols-3">
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
                      "min-h-[52px] rounded-md border bg-background px-3 py-2 text-left transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2",
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
                <Button
                  asChild
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                >
                  <a href="/dashboard/import-data">{copy.connectors.changeSourceAction}</a>
                </Button>
              </div>
            </div>
            <div className="space-y-4 p-4">
	              {isOAuthSource ? (
	                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-5">
	                  <div className="flex items-start gap-3">
	                    <Database className="mt-1 size-6 text-emerald-800" />
	                    <div>
	                      <p className="text-sm font-semibold">
	                        {isShopifySource
	                          ? (isZh ? "连接 Shopify" : "Connect Shopify")
	                          : isMetaAdsSource
	                            ? (isZh ? "连接 Meta Ads" : "Connect Meta Ads")
	                          : (isZh ? `连接 ${selectedSource.name}` : `Connect ${selectedSource.name}`)}
	                      </p>
	                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
	                        {isShopifySource
	                          ? (isZh
	                              ? "输入你自己的 myshopify.com 店铺域名后，将跳转到 Shopify OAuth 授权页面。授权成功后只保存加密 token 和连接元数据。"
	                              : "Enter your own myshopify.com store domain to open Shopify OAuth. After install, Monarca stores only encrypted token and connection metadata.")
	                          : isMetaAdsSource
	                            ? (isZh
	                                ? "将跳转到 Meta OAuth 授权页面。授权成功后只保存加密 token、广告账户 ID 和连接元数据。"
	                                : "This opens Meta OAuth. After authorization, Monarca stores only encrypted token, ad account ID, and connection metadata.")
	                          : (isZh
	                              ? "该数据源将通过 OAuth 授权连接，不需要在 Monarca 输入 API key。"
	                              : "This source uses OAuth. You do not enter API keys in Monarca.")}
	                      </p>
	                      {isShopifySource ? (
	                        <label className="mt-4 block">
	                          <span className="mb-1.5 block text-xs font-medium text-emerald-950">
	                            {isZh ? "你的 Shopify 店铺" : "Your Shopify store"}
	                          </span>
	                          <Input
	                            value={shopifyShopDomain}
	                            onChange={(event) => {
	                              setShopifyShopDomain(event.target.value);
	                              resetConnectionResult();
	                            }}
	                            placeholder="your-store.myshopify.com"
	                            autoCapitalize="none"
	                            autoCorrect="off"
	                            spellCheck={false}
	                          />
	                          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
	                            {isZh
	                              ? "只允许 *.myshopify.com。不要输入 admin.shopify.com、localhost、API key 或 token。"
	                              : "Only *.myshopify.com is allowed. Do not enter admin.shopify.com, localhost, API keys, or tokens."}
	                          </p>
	                        </label>
	                      ) : null}
	                    </div>
	                  </div>
	                </div>
	              ) : isFileSource ? (
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
                  <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800 md:col-span-2">
                    <p className="font-semibold">{copy.connectors.readOnlyTitle}</p>
                    <p className="mt-1">{copy.connectors.readOnlyDescription}</p>
                    <p className="mt-1 font-medium">{copy.connectors.readOnlyTip}</p>
                  </div>
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
                      placeholder={
                        isSqlLikeSource
                          ? (isZh ? "例如 db.example.com，留空使用服务器预设" : "e.g. db.example.com, blank uses server preset")
                          : copy.connectors.workspacePlaceholder
                      }
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
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Port
                    </span>
                    <Input
                      inputMode="numeric"
                      value={databasePort}
                      onChange={(event) => {
                        setDatabasePort(event.target.value.replace(/[^\d]/g, ""));
                        resetConnectionResult();
                      }}
                      placeholder={defaultDatabasePort}
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

	              {!isFileSource && !isOAuthSource ? (
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

	              {!isFileSource && !isOAuthSource ? (
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

	              {!isFileSource && !isOAuthSource ? (
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

              {!isOAuthSource ? (
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
              ) : null}
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
	              {isOAuthSource ? (
	                <>
	                  {[
	                    `${isZh ? "类型" : "Type"}: ${selectedSource.name}`,
	                    `${isZh ? "授权方式" : "Auth"}: OAuth`,
	                    isShopifySource
	                      ? `${isZh ? "数据口径" : "Schema"}: ecommerce_canonical_v1`
	                      : isMetaAdsSource
	                        ? `${isZh ? "数据口径" : "Schema"}: ecommerce_ads`
	                      : `${isZh ? "状态" : "Status"}: ${isZh ? "待接入" : "not enabled"}`,
	                    `${isZh ? "Token 存储" : "Token storage"}: ${isZh ? "加密保存" : "encrypted"}`
	                  ].map((row) => (
	                    <div key={row} className="flex items-center gap-2 text-xs text-muted-foreground">
	                      <span className="size-1.5 rounded-full bg-emerald-700/70" aria-hidden="true" />
	                      {row}
	                    </div>
	                  ))}
	                </>
	              ) : isFileSource ? (
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
                    `${isZh ? "地址" : "Host"}: ${databaseHostPreview}`,
                    `${isZh ? "数据库" : "Database"}: ${databaseNamePreview}`,
                    `Port: ${effectiveDatabasePort} (${databasePort ? (isZh ? "自定义" : "custom") : (isZh ? "自动" : "auto")})`,
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
                    ? "当前版本支持 PostgreSQL 和 MySQL 的连接测试"
                    : "This wizard currently supports PostgreSQL and MySQL connection testing"}
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
	              {isOAuthSource ? (
	                <Button type="button" size="sm" onClick={() => connectDataSource(selectedSource)}>
	                  {isShopifySource
	                    ? (isZh ? "连接 Shopify" : "Connect Shopify")
	                    : isMetaAdsSource
	                      ? (isZh ? "连接 Meta Ads" : "Connect Meta Ads")
	                    : (isZh ? `连接 ${selectedSource.name}` : `Connect ${selectedSource.name}`)}
	                  <ArrowRight />
	                </Button>
	              ) : isFileSource ? (
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
        {!showWizard ? (
          <div className="mt-3 flex justify-center">
            <Button type="button" size="sm" className="h-8 rounded-full bg-[#079669] px-5 text-white hover:bg-[#067f5a]" onClick={startSelectedSourceConnection}>
              {copy.connectors.connectAction}
              <ArrowRight />
            </Button>
          </div>
        ) : null}

      </CardContent>
    </Card>
  );
}

type ReportMetricEvidenceResult = {
  metricId: string;
  metricName: string;
  kpiId?: string;
  kpiName?: string;
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

type ReportAvailableDateRange = {
  startDate?: string | null;
  endDate?: string | null;
  latestDataDate?: string | null;
  dateField?: string | null;
};

type KpiAssetLibraryViewData = {
  total_kpi_count?: number;
  kpi_registry?: Array<{
    kpi_id?: string;
    kpi_name?: string;
    group_name?: string;
    category?: "business_scale" | "efficiency" | "quality" | "experience" | string;
    definition?: string;
    direction?: "higher_is_better" | "lower_is_better" | "unknown" | string;
    source_columns?: string[];
    formula?: string;
    sample_value?: number | string | null;
    components?: Array<{
      role?: string;
      source_column?: string;
      raw_header_path?: string[];
    }>;
  }>;
  column_mapping?: Record<string, string>;
  excluded_columns?: Array<{
    column?: string;
    name?: string;
    reason?: string;
  }>;
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
    | "ONE_TIME_REPORT_AVAILABLE"
    | "SUBSCRIPTION_ACTIVE"
    | "SUBSCRIPTION_EXPIRED"
    | "NO_ACCESS"
    | null;
  accessType?: "one_time_purchase" | "subscription" | null;
  upgradeRequired: boolean;
};

function reportEntitlementMessage(entitlement: ReportEntitlementViewData | null | undefined, locale: Locale) {
  const isZh = locale === "zh";

  if (!entitlement) {
    return "";
  }

  if (entitlement.monthlyUnlimited && entitlement.subscriptionStatus === "active") {
    return "";
  }

  if (entitlement.oneTimeReportAvailable) {
    return isZh ? "你有 1 次已购买的报告生成机会" : "You have 1 purchased report generation available";
  }

  return isZh ? "请选择套餐后生成新报告。" : "Please choose a plan to generate new reports.";
}

function reportGenerateButtonLabel(entitlement: ReportEntitlementViewData | null | undefined, locale: Locale, fallback: string) {
  return entitlement ? (locale === "zh" ? "生成报告" : "Generate report") : fallback;
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
      en: "Please upgrade your plan to continue generating reports.",
      zh: "请升级套餐后继续生成报告。"
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
      en: "Please choose a plan to generate reports.",
      zh: "请选择套餐后再生成报告。"
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

function formatReportMetricValue(value: unknown) {
  if (typeof value === "number") {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    });
  }

  return value == null ? "-" : String(value);
}

function isRankReportMetricName(value?: string | null) {
  const compact = compactKpiText(value);
  return compact === "全国排名" || compact === "省区排名" || compact === "进步排名" || compact.includes("排名");
}

function formatReportSummaryMetricValue(value: unknown, metricName?: string | null, locale: Locale = "zh") {
  const numeric = numericReportMetricValue(value as number | string | null | undefined);
  if (numeric == null) return value == null ? "-" : String(value);
  const numberLocale = locale === "zh" ? "zh-CN" : "en-US";

  if (isRankReportMetricName(metricName)) {
    return Math.round(numeric).toLocaleString(numberLocale, { maximumFractionDigits: 0 });
  }

  return numeric.toLocaleString(numberLocale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });
}

function usesPerTenThousandRateUnit(context?: string | null, unit?: string | null) {
  if (unit === "basis_points") return true;
  const text = compactKpiText(context);
  return text.includes("发件端求助率") || text.includes("遗失破损率");
}

function formatReportMetricRate(value: unknown, context?: string | null, unit?: string | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value == null ? "-" : String(value);
  const multiplier = usesPerTenThousandRateUnit(context, unit) ? 10000 : 100;
  const suffix = "%";

  return `${(value * multiplier).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  })}${suffix}`;
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

function formatDateOnly(value?: string | Date | null) {
  if (!value) return "-";
  if (typeof value === "string") {
    const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
    const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizedDateOnly(value?: string | Date | null) {
  const text = formatDateOnly(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function dateOnlyUtcTime(value?: string | Date | null) {
  const text = normalizedDateOnly(value);
  if (!text) return null;
  const [year, month, day] = text.split("-").map(Number);
  const time = Date.UTC(year, month - 1, day);
  return Number.isFinite(time) ? time : null;
}

function addDaysToDateOnly(value: string | undefined | null, days: number) {
  const time = dateOnlyUtcTime(value);
  if (time == null) return normalizedDateOnly(value);
  const date = new Date(time);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function clampDateOnly(value?: string | null, min?: string | null, max?: string | null) {
  const text = normalizedDateOnly(value);
  if (!text) return undefined;
  const time = dateOnlyUtcTime(text);
  const minTime = dateOnlyUtcTime(min);
  const maxTime = dateOnlyUtcTime(max);
  if (time == null) return undefined;
  if (minTime != null && time < minTime) return normalizedDateOnly(min) ?? text;
  if (maxTime != null && time > maxTime) return normalizedDateOnly(max) ?? text;
  return text;
}

function resolveSelectedReportDateRangeWindow(
  range: SelectedReportDateRange,
  available?: ReportAvailableDateRange | null
): Pick<SelectedReportDateRange, "startDate" | "endDate"> {
  const availableStart = normalizedDateOnly(available?.startDate);
  const availableEnd = normalizedDateOnly(available?.latestDataDate ?? available?.endDate) ?? normalizedDateOnly(available?.endDate);
  const minDate = availableStart ?? availableEnd;
  const maxDate = availableEnd ?? availableStart;

  if (!minDate && !maxDate) {
    return {
      startDate: normalizedDateOnly(range.startDate) ?? undefined,
      endDate: normalizedDateOnly(range.endDate) ?? undefined
    };
  }

  if (range.preset === "CUSTOM") {
    const startDate = clampDateOnly(range.startDate ?? minDate, minDate, maxDate);
    const endDate = clampDateOnly(range.endDate ?? maxDate, minDate, maxDate);
    return { startDate, endDate };
  }

  if (range.preset === "ALL") {
    return { startDate: minDate ?? undefined, endDate: maxDate ?? undefined };
  }

  const daysByPreset: Partial<Record<ReportTimeRange, number>> = {
    TODAY: 0,
    "7D": 6,
    "30D": 29,
    "90D": 89,
    "12M": 364
  };
  const endDate = maxDate ?? minDate;
  const dayOffset = daysByPreset[range.preset] ?? 0;
  const rawStartDate = addDaysToDateOnly(endDate, -dayOffset);
  return {
    startDate: clampDateOnly(rawStartDate, minDate, maxDate),
    endDate: endDate ?? undefined
  };
}

function reportDateText(value: string) {
  return value
    .replace(/\b(\d{4}-\d{2}-\d{2})[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, "$1")
    .replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+\d{1,2}:\d{2}:\d{2}(?:\s?[AP]M)?\b/gi, (_match, month, day, year) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

function formatReportDate(value?: string, options: { locale?: Locale; timeZone?: string | null } = {}) {
  if (!value) return "-";
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return formatDateOnly(value);
  }

  const formatterOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  };

  if (options.timeZone) {
    formatterOptions.timeZone = options.timeZone;
  }

  return new Intl.DateTimeFormat(options.locale === "en" ? "en-US" : "zh-CN", formatterOptions)
    .format(date)
    .replace(/\//g, "-");
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

function analysisReportTimeRangeLabel(range: ReportTimeRange, locale: Locale) {
  if (locale !== "zh") {
    if (range === "TODAY") return "Daily analysis";
    if (range === "7D") return "Weekly analysis";
    if (range === "30D") return "Monthly analysis";
    if (range === "12M") return "Annual analysis";
    if (range === "ALL") return "All-time analysis";
    if (range === "CUSTOM") return "Custom analysis";
    return reportTimeRangeLabel(range, locale);
  }

  if (range === "TODAY") return "日报分析";
  if (range === "7D") return "周报分析";
  if (range === "30D") return "月报分析";
  if (range === "12M") return "年度分析";
  if (range === "ALL") return "全量分析";
  if (range === "CUSTOM") return "自定义分析";
  return reportTimeRangeLabel(range, locale);
}

function analysisReportModeForRange(range: ReportTimeRange) {
  if (range === "TODAY") return "daily_brief";
  if (range === "7D") return "weekly_report";
  return "custom_report";
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

function signedComparisonToneClass(changePercent: number | null | undefined) {
  if (changePercent == null || !Number.isFinite(changePercent) || Math.abs(changePercent) < 0.0001) {
    return "text-slate-500";
  }

  return changePercent > 0 ? "text-emerald-400" : "text-rose-400";
}

function comparisonPeriodLabel(range: ReportTimeRange | string | null | undefined, locale: Locale) {
  const key = String(range ?? "").toUpperCase();

  if (locale !== "zh") {
    if (key === "TODAY" || key === "DAILY") return "vs previous day";
    if (key === "7D" || key === "WEEKLY") return "vs previous week";
    if (key === "30D" || key === "MONTHLY") return "vs previous month";
    if (key === "12M" || key === "YEARLY") return "vs previous year";
    if (key === "CUSTOM") return "vs previous range";
    return "vs previous period";
  }

  if (key === "TODAY" || key === "DAILY") return "较上一日";
  if (key === "7D" || key === "WEEKLY") return "较上周";
  if (key === "30D" || key === "MONTHLY") return "较上月";
  if (key === "12M" || key === "YEARLY") return "较上年";
  if (key === "CUSTOM") return "较上一时间段";
  return "较上一周期";
}

function comparisonDateRangeLabel(startDate?: string | null, endDate?: string | null) {
  const start = formatComparisonDate(startDate);
  const end = formatComparisonDate(endDate);

  if (!start || !end) return null;
  if (start === end) return start;
  return `${start} - ${end}`;
}

function signedComparisonPercentWithPeriod(
  value: number,
  locale: Locale,
  range: ReportTimeRange | string | null | undefined,
  currentStartDate?: string | null,
  currentEndDate?: string | null,
  previousStartDate?: string | null,
  previousEndDate?: string | null
) {
  const inferredPreviousRange = previousRangeFromCurrent(
    formatComparisonDate(currentStartDate),
    formatComparisonDate(currentEndDate)
  );
  const concretePreviousRange = comparisonDateRangeLabel(
    previousStartDate ?? inferredPreviousRange.previousStartDate,
    previousEndDate ?? inferredPreviousRange.previousEndDate
  );
  const periodLabel = concretePreviousRange
    ? (locale === "zh" ? `较 ${concretePreviousRange}` : `vs ${concretePreviousRange}`)
    : comparisonPeriodLabel(range, locale);

  return `${periodLabel} ${signedComparisonPercent(value, locale)}`;
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

async function fetchReportJson<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallbackMessage: string
): Promise<{ response: Response; payload: T | null }> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(input, init);
      const payload = await response.json().catch(() => null) as T | null;
      return { response, payload };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }

  throw new Error(lastError instanceof Error && lastError.message !== "Failed to fetch"
    ? lastError.message
    : fallbackMessage);
}

type ProfitOptimizationJobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "PAUSED" | "CANCELLED";

type ProfitOptimizationJob = {
  id: string;
  status: ProfitOptimizationJobStatus;
  progress?: number | null;
  currentStep?: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
  resultReference?: {
    generated?: Array<{
      snapshotId?: string | null;
      mode?: string | null;
      state?: string | null;
      optimizationType?: string | null;
    }>;
  } | null;
};

type ProfitOptimizationJobPayload = {
  ok?: boolean;
  jobId?: string;
  status?: ProfitOptimizationJobStatus;
  currentStep?: string | null;
  message?: string;
};

type ProfitOptimizationJobStatusPayload = {
  ok?: boolean;
  message?: string;
  job?: ProfitOptimizationJob;
};

type ProfitOptimizationDecisionReportPayload = {
  ok?: boolean;
  message?: string | null;
  snapshot?: {
    id?: string | null;
    sourceDecisionSnapshotId?: string | null;
    latestSnapshot?: boolean | null;
  } | null;
  optimizationRun?: {
    optimization_run_id?: string | null;
    completed_at?: string | null;
  } | null;
} | null;

function profitOptimizationStatusMessage(
  status: ProfitOptimizationJobStatus | undefined,
  currentStep: string | null | undefined,
  isZh: boolean
) {
  if (currentStep && currentStep !== "Queued") return currentStep;
  switch (status) {
    case "QUEUED":
      return isZh ? "正在准备优化..." : "Preparing optimization...";
    case "PROCESSING":
      return isZh ? "正在分析 SKU 组合..." : "Analyzing SKU portfolio...";
    case "COMPLETED":
      return isZh ? "优化已完成。" : "Optimization completed.";
    case "FAILED":
      return isZh ? "优化运行失败。" : "Optimization failed.";
    default:
      return isZh ? "正在评估优化方案..." : "Evaluating optimization scenarios...";
  }
}

async function waitForProfitOptimizationJob(
  jobId: string,
  input: {
    isZh: boolean;
    onStatus: (job: ProfitOptimizationJob) => void;
  }
) {
  const terminalStatuses = new Set<ProfitOptimizationJobStatus>(["COMPLETED", "FAILED", "CANCELLED"]);

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 800 : 2000));
    const { response, payload } = await fetchReportJson<ProfitOptimizationJobStatusPayload>(
      `/api/jobs/${encodeURIComponent(jobId)}`,
      { cache: "no-store" },
      input.isZh
        ? "无法获取优化任务状态，请刷新页面后重试。"
        : "Could not load optimization job status. Refresh the page and try again."
    );
    if (!response.ok || !payload?.ok || !payload.job) {
      throw new Error(payload?.message || (input.isZh ? "优化任务状态读取失败" : "Failed to load optimization job status"));
    }

    input.onStatus(payload.job);
    if (terminalStatuses.has(payload.job.status)) return payload.job;
  }

  throw new Error(input.isZh ? "优化任务仍在运行，请稍后刷新查看。" : "Optimization is still running. Refresh later to view it.");
}

function optimizationDecisionReportRunId(payload: ProfitOptimizationDecisionReportPayload) {
  const optimizationRun = payload?.optimizationRun;
  return typeof optimizationRun?.optimization_run_id === "string" && optimizationRun.optimization_run_id.trim()
    ? optimizationRun.optimization_run_id.trim()
    : null;
}

function optimizationJobSnapshotId(job: ProfitOptimizationJob | null | undefined) {
  const generated = job?.resultReference?.generated;
  if (!Array.isArray(generated)) return null;
  const fullSnapshot = generated.find((item) => item?.mode === "full" && typeof item.snapshotId === "string" && item.snapshotId.trim());
  const firstSnapshot = generated.find((item) => typeof item?.snapshotId === "string" && item.snapshotId.trim());
  return (fullSnapshot?.snapshotId ?? firstSnapshot?.snapshotId ?? null)?.trim() || null;
}

function optimizationDecisionReportSnapshotId(payload: ProfitOptimizationDecisionReportPayload) {
  const snapshot = payload?.snapshot;
  const sourceDecisionSnapshotId = typeof snapshot?.sourceDecisionSnapshotId === "string" ? snapshot.sourceDecisionSnapshotId.trim() : "";
  if (sourceDecisionSnapshotId) return sourceDecisionSnapshotId;
  return typeof snapshot?.id === "string" && snapshot.id.trim() ? snapshot.id.trim() : null;
}

function ReportDateRangeSelector({
  selectedRange,
  customStartDate,
  customEndDate,
  availableDateRange,
  onRangeChange,
  onCustomRangeChange,
  locale = "zh",
  labelVariant = "default"
}: {
  selectedRange: ReportTimeRange;
  customStartDate?: string;
  customEndDate?: string;
  availableDateRange?: ReportAvailableDateRange | null;
  onRangeChange: (range: ReportTimeRange) => void;
  onCustomRangeChange?: (startDate: string, endDate: string) => void;
  locale?: Locale;
  labelVariant?: "default" | "analysis";
}) {
  const isZh = locale === "zh";
  const [customDraftStartDate, setCustomDraftStartDate] = useState(customStartDate ?? "");
  const [customDraftEndDate, setCustomDraftEndDate] = useState(customEndDate ?? "");
  const availableStartDate = availableDateRange?.startDate ?? undefined;
  const availableEndDate = availableDateRange?.endDate ?? availableDateRange?.latestDataDate ?? undefined;
  const clampDate = useCallback((value: string) => {
    if (availableStartDate && value < availableStartDate) return availableStartDate;
    if (availableEndDate && value > availableEndDate) return availableEndDate;
    return value;
  }, [availableEndDate, availableStartDate]);
  const customRangeStartValue = clampDate(customDraftStartDate || customStartDate || availableStartDate || "");
  const customRangeEndValue = clampDate(customDraftEndDate || customEndDate || availableEndDate || "");

  useEffect(() => {
    if (selectedRange !== "CUSTOM") return;
    setCustomDraftStartDate(customStartDate ?? availableStartDate ?? "");
    setCustomDraftEndDate(customEndDate ?? availableEndDate ?? "");
  }, [availableEndDate, availableStartDate, customEndDate, customStartDate, selectedRange]);

  return (
    <div className="flex flex-col items-end gap-2">
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
            {labelVariant === "analysis"
              ? analysisReportTimeRangeLabel(range.value, locale)
              : reportTimeRangeLabel(range.value, locale)}
          </button>
        ))}
      </div>
      {selectedRange === "CUSTOM" ? (
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          <span className="text-muted-foreground">
            {availableDateRange?.dateField
              ? `${isZh ? "时间字段" : "Time field"}：${availableDateRange.dateField}`
              : isZh ? "自定义区间" : "Custom range"}
          </span>
          <Input
            type="date"
            value={customRangeStartValue}
            min={availableStartDate}
            max={availableEndDate}
            onChange={(event) => {
              const nextStartDate = clampDate(event.target.value);
              const nextEndDate = customRangeEndValue;
              setCustomDraftStartDate(nextStartDate);
              if (nextStartDate && nextEndDate && nextStartDate <= nextEndDate) {
                onCustomRangeChange?.(nextStartDate, nextEndDate);
              }
            }}
            className="h-8 w-36 text-xs"
            aria-label={isZh ? "开始日期" : "Start date"}
          />
          <span className="text-muted-foreground">-</span>
          <Input
            type="date"
            value={customRangeEndValue}
            min={availableStartDate}
            max={availableEndDate}
            onChange={(event) => {
              const nextStartDate = customRangeStartValue;
              const nextEndDate = clampDate(event.target.value);
              setCustomDraftEndDate(nextEndDate);
              if (nextStartDate && nextEndDate && nextStartDate <= nextEndDate) {
                onCustomRangeChange?.(nextStartDate, nextEndDate);
              }
            }}
            className="h-8 w-36 text-xs"
            aria-label={isZh ? "结束日期" : "End date"}
          />
          {availableStartDate && availableEndDate ? (
            <span className="text-muted-foreground">
              {availableStartDate} - {availableEndDate}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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

type PowerBiKpiRiskLevel = "low" | "medium" | "high";

type PowerBiKpiDetailItem = {
  label: string;
  value: string;
};

type FormulaBreakdownComponent = {
  name: string;
  score: number | null;
  maxScore?: number | null;
  status: "valid" | "missing" | "zero" | "invalid";
};

type FormulaBreakdown = {
  title: string;
  expressionLabel: string;
  formulaText: string;
  valueText: string;
  resultText: string;
  components: FormulaBreakdownComponent[];
  finalScore: number | null;
  maxScore?: number | null;
  consistencyStatus: "matched" | "mismatched" | "partial" | "missing";
  warning?: string;
};

type PowerBiKpiItem = {
  id: string;
  name: string;
  value: unknown;
  status: "valid" | "missing" | "zero";
  displayFlag: true;
  numerator: number | null;
  denominator: number | null;
  rate: number | null;
  score: number | null;
  zeroLine?: number | null;
  fullScoreLine?: number | null;
  orderVolume?: number;
  previousValue?: unknown;
  changePercent?: number | null;
  direction: MetricDirection;
  riskLevel: PowerBiKpiRiskLevel;
  formula?: string;
  formulaBreakdown?: FormulaBreakdown;
  details: PowerBiKpiDetailItem[];
  result?: ReportMetricEvidenceResult;
};

type PowerBiKpiGroup = {
  id: string;
  name: string;
  weight: number;
  score: number;
  rate: number;
  orderVolume: number;
  hasOrderVolume?: boolean;
  consistencyStatus?: "consistent" | "inconsistent" | "conflict_detected";
  consistencyWarnings?: string[];
  status: "filled" | "missing";
  message?: string;
  suggestedKpis?: string[];
  riskLevel: PowerBiKpiRiskLevel;
  formulaBreakdowns?: FormulaBreakdown[];
  kpis: PowerBiKpiItem[];
};

const fixedLogisticsKpiGroups = [
  {
    name: "散件揽收 (20)",
    aliases: ["散件揽收"],
    suggestedKpis: ["首揽及时率(7)", "及时揽收率(3)", "网点取消率(5)", "发件端求助率(5)", "淘逆加分"]
  },
  {
    name: "时效达成 (20)",
    aliases: ["时效达成"],
    suggestedKpis: ["交件及时率(10)", "24点签收率(含乡镇)(10)"]
  },
  {
    name: "投递规范 (30)",
    aliases: ["投递规范"],
    suggestedKpis: ["派签求助-外部平台(15)", "派签求助-增值件(5)", "遗失破损率(5)", "拍照签收率-覆盖率", "拍照签收率-合格率"]
  },
  {
    name: "问题解决 (30)",
    aliases: ["问题解决"],
    suggestedKpis: ["网点接通率(5)", "客户求助(13)", "网点查件(7)", "预警工单(5)"]
  },
  {
    name: "加减分项",
    aliases: ["加减分项", "加减分"],
    suggestedKpis: ["申诉率", "不配合处理减分", "逾期减分", "内部人员申诉", "总减分"]
  }
] as const;

const requiredAdjustmentKpis = [
  { name: "申诉率", aliases: ["申诉率", "申诉率减分"] },
  { name: "不配合处理减分", aliases: ["不配合处理减分"] },
  { name: "逾期减分", aliases: ["逾期减分"] },
  { name: "内部人员申诉", aliases: ["内部人员申诉"] },
  { name: "总减分", aliases: ["总减分"] }
];

const logisticsFormulaSpecs = [
  {
    id: "pickup_total",
    title: "散件揽收总得分",
    parentAliases: ["散件揽收总得分", "散件揽收得分"],
    groupAliases: ["散件揽收"],
    maxScore: 20,
    components: [
      { name: "首揽及时率得分", aliases: ["首揽及时率"] },
      { name: "及时揽收率得分", aliases: ["及时揽收率"] },
      { name: "网点取消率得分", aliases: ["网点取消率"] },
      { name: "发件端求助率得分", aliases: ["发件端求助率", "发件端求助"] },
      { name: "淘逆加分得分", aliases: ["淘逆加分"] }
    ]
  },
  {
    id: "timeliness_total",
    title: "时效达成总得分",
    parentAliases: ["时效达成总得分", "时效达成得分"],
    groupAliases: ["时效达成"],
    maxScore: 20,
    components: [
      { name: "交件及时率得分", aliases: ["交件及时率"] },
      { name: "24点签收率(含乡镇)得分", aliases: ["24点签收率(含乡镇)", "24点签收率", "24点签收率含乡镇"] }
    ]
  },
  {
    id: "delivery_total",
    title: "投递规范总得分",
    parentAliases: ["投递规范总得分", "投递规范得分"],
    groupAliases: ["投递规范"],
    maxScore: 30,
    components: [
      { name: "派签求助-外部平台得分", aliases: ["派签求助-外部平台", "派签求助外部平台"] },
      { name: "派签求助-增值件得分", aliases: ["派签求助-增值件", "派签求助增值件"] },
      { name: "遗失破损率得分", aliases: ["遗失破损率"] },
      { name: "拍照签收率最终得分", aliases: ["拍照签收率", "拍照签收率最终得分", "最终得分"] }
    ]
  },
  {
    id: "first_resolution_total",
    title: "工单一次性解决率总分",
    parentAliases: ["工单一次性解决率总分", "工单一次性解决率 总分"],
    groupAliases: ["问题解决"],
    maxScore: 25,
    components: [
      { name: "客户求助得分", aliases: ["客户求助"] },
      { name: "网点查件得分", aliases: ["网点查件"] },
      { name: "预警工单得分", aliases: ["预警工单"] }
    ]
  },
  {
    id: "problem_resolution_total",
    title: "问题解决率总得分",
    parentAliases: ["问题解决率总得分", "问题解决总得分", "问题解决得分"],
    groupAliases: ["问题解决"],
    maxScore: 30,
    components: [
      { name: "工单一次性解决率总分", aliases: ["工单一次性解决率总分", "工单一次性解决率 总分"] },
      { name: "网点接通率得分", aliases: ["网点接通率"] }
    ]
  },
  {
    id: "adjustment_total",
    title: "加减分项总得分",
    parentAliases: ["加减分项总得分", "加减分总得分", "总减分"],
    groupAliases: ["加减分项", "加减分"],
    maxScore: null,
    components: [
      { name: "申诉率减分", aliases: ["申诉率减分", "申诉率"] },
      { name: "不配合处理减分", aliases: ["不配合处理减分"] },
      { name: "逾期减分", aliases: ["逾期减分"] },
      { name: "内部人员申诉减分", aliases: ["内部人员申诉"] },
      { name: "其他减分", aliases: ["其他减分"] }
    ]
  },
  {
    id: "kpi_total",
    title: "KPI总分",
    parentAliases: ["KPI总分", "kpi_total_score", "total_score"],
    groupAliases: [],
    maxScore: 100,
    components: [
      { name: "散件揽收总得分", aliases: ["散件揽收总得分", "散件揽收得分"] },
      { name: "时效达成总得分", aliases: ["时效达成总得分", "时效达成得分"] },
      { name: "投递规范总得分", aliases: ["投递规范总得分", "投递规范得分"] },
      { name: "问题解决率总得分", aliases: ["问题解决率总得分", "问题解决总得分", "问题解决得分"] },
      { name: "加减分项总得分", aliases: ["加减分项总得分", "加减分总得分", "总减分"] }
    ]
  }
] as const;

function compactKpiText(value?: string | null) {
  return String(value ?? "")
    .replace(/[（(]\s*-?\d+(?:\.\d+)?\s*[)）]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

function kpiGroupBaseName(value?: string | null) {
  return String(value ?? "")
    .replace(/[（(]\s*-?\d+(?:\.\d+)?\s*[)）]/g, "")
    .trim();
}

function kpiGroupWeight(value?: string | null) {
  const match = String(value ?? "").match(/[（(]\s*(-?\d+(?:\.\d+)?)\s*[)）]/)?.[1];
  return match ? Number(match) : null;
}

function reportMetricDisplayName(result: ReportMetricEvidenceResult) {
  return result.kpiName || result.displayName || result.metricName;
}

function isSummaryKpiName(value?: string | null) {
  const compact = compactKpiText(value);
  return compact === "kpi总分" ||
    compact === "得分率" ||
    compact === "核心模块总分" ||
    compact === "全国排名" ||
    compact === "省区排名" ||
    compact === "进步排名" ||
    compact === "业务量" ||
    compact === "签收量" ||
    compact === "日均业务量" ||
    compact === "日均签收量" ||
    compact === "kpitotalscore" ||
    compact === "scorerate" ||
    compact === "totalscore";
}

function summaryKpiSortPriority(value?: string | null) {
  const compact = compactKpiText(value);
  const order = [
    "kpi总分",
    "得分率",
    "全国排名",
    "省区排名",
    "进步排名",
    "业务量",
    "签收量",
    "日均业务量",
    "日均签收量",
    "核心模块总分",
    "kpitotalscore",
    "scorerate",
    "totalscore"
  ];
  const index = order.indexOf(compact);
  return index >= 0 ? index : 999;
}

function isKpiLeafAssetName(value?: string | null) {
  return /(分子|分母|公式|源列)$/.test(String(value ?? "").trim());
}

function isKpiGroupScoreAsset(asset: NonNullable<KpiAssetLibraryViewData["kpi_registry"]>[number]) {
  if (!asset.group_name || !asset.kpi_name) return false;
  return compactKpiText(asset.group_name) === compactKpiText(asset.kpi_name);
}

function reportMetricResultKeys(result: ReportMetricEvidenceResult) {
  return [
    result.kpiId,
    result.metricId,
    result.kpiName,
    result.displayName,
    result.metricName
  ]
    .filter(Boolean)
    .map((value) => compactKpiText(value));
}

function kpiAssetKeys(asset: NonNullable<KpiAssetLibraryViewData["kpi_registry"]>[number]) {
  return [
    asset.kpi_id,
    asset.kpi_name
  ]
    .filter(Boolean)
    .map((value) => compactKpiText(value));
}

function findReportMetricForAsset(
  results: ReportMetricEvidenceResult[],
  asset: NonNullable<KpiAssetLibraryViewData["kpi_registry"]>[number]
) {
  const assetKeys = new Set(kpiAssetKeys(asset));
  if (!assetKeys.size) return undefined;
  return results.find((result) => reportMetricResultKeys(result).some((key) => assetKeys.has(key)));
}

function reportMetricChangePercent(result?: ReportMetricEvidenceResult) {
  if (!result) return null;
  return result.changePercent ?? result.percentChange ?? comparisonPercentFromValues(result.currentValue ?? result.value, result.previousValue);
}

function reportMetricRiskLevel(result?: ReportMetricEvidenceResult, assetDirection?: string): PowerBiKpiRiskLevel {
  if (!result) return "medium";
  if (result.status === "failed") return "high";

  const direction = (result.metricDirection ?? assetDirection ?? metricDirectionFromText(reportMetricDisplayName(result), result.metricCategory)) as MetricDirection;
  const changePercent = reportMetricChangePercent(result);
  if (changePercent != null && Number.isFinite(changePercent) && direction !== "neutral") {
    const deteriorated = direction === "higher_is_better" ? changePercent < -0.0001 : changePercent > 0.0001;
    if (deteriorated && Math.abs(changePercent) >= 0.05) return "high";
    if (deteriorated) return "medium";
  }

  const name = `${reportMetricDisplayName(result)} ${result.metricCategory ?? ""}`;
  const isNegativeMetric = /(取消|投诉|求助|逾期|异常|失败|风险|减分|cancel|complaint|late|delay|risk|failure)/i.test(name);
  const numericValue = numericReportMetricValue(result.currentValue ?? result.value);
  if (isNegativeMetric && numericValue != null && numericValue > 0) return numericValue > 5 ? "high" : "medium";

  return "low";
}

function mergeKpiRiskLevel(levels: PowerBiKpiRiskLevel[]): PowerBiKpiRiskLevel {
  if (levels.includes("high")) return "high";
  if (levels.includes("medium")) return "medium";
  return "low";
}

function powerBiKpiDetails(
  result: ReportMetricEvidenceResult | undefined,
  asset: NonNullable<KpiAssetLibraryViewData["kpi_registry"]>[number] | undefined,
  locale: Locale
): PowerBiKpiDetailItem[] {
  const isZh = locale === "zh";
  const details: PowerBiKpiDetailItem[] = [];

  details.push({
    label: isZh ? "今日" : "Current",
    value: formatReportMetricValue(result?.currentValue ?? result?.value ?? asset?.sample_value)
  });
  details.push({
    label: isZh ? "昨日" : "Previous",
    value: formatReportMetricValue(result?.previousValue)
  });

  const changePercent = reportMetricChangePercent(result);
  details.push({
    label: isZh ? "变化" : "Change",
    value: changePercent == null ? "-" : signedComparisonPercent(changePercent, locale)
  });

  const components = Array.isArray(asset?.components) ? asset.components : [];
  for (const component of components.slice(0, 4)) {
    const role = component.role || (isZh ? "组成项" : "Component");
    const sourceColumn = component.source_column || component.raw_header_path?.join(" / ");
    if (sourceColumn) {
      details.push({ label: role, value: sourceColumn });
    }
  }

  const formula = result?.formula || asset?.formula;
  if (formula) details.push({ label: isZh ? "公式" : "Formula", value: formula });
  if (result?.sourceDataset) details.push({ label: isZh ? "数据源" : "Dataset", value: result.sourceDataset });
  if (result?.error) details.push({ label: isZh ? "错误" : "Error", value: result.error });

  return details;
}

function logisticsFixedGroupMatch(groupName: string, fixedGroup: typeof fixedLogisticsKpiGroups[number]) {
  const compactGroupName = compactKpiText(groupName);
  return fixedGroup.aliases.some((alias) => compactGroupName === compactKpiText(alias) || compactGroupName.includes(compactKpiText(alias)));
}

function powerBiKpiDataStatus(value: unknown): PowerBiKpiItem["status"] {
  if (value == null || value === "") return "missing";
  const numeric = numericReportMetricValue(value as number | string | null | undefined);
  if (numeric === 0) return "zero";
  return "valid";
}

function powerBiKpiScore(kpi: PowerBiKpiItem) {
  return typeof kpi.score === "number" && Number.isFinite(kpi.score) ? kpi.score : 0;
}

function kpiWeightFromName(value: string) {
  const match = value.match(/[（(]\s*(-?\d+(?:\.\d+)?)\s*[)）]/)?.[1];
  return match ? Number(match) : null;
}

function kpiScoreConsistencyFlags(kpis: PowerBiKpiItem[], groupWeight: number) {
  const flags: string[] = [];

  for (const kpi of kpis) {
    const weight = kpiWeightFromName(kpi.name);
    const score = powerBiKpiScore(kpi);

    if (kpi.score == null && kpi.status !== "missing") {
      flags.push(`${kpi.name}:missing_score`);
      continue;
    }

    if (weight != null && score > weight + 0.01) {
      flags.push(`${kpi.name}:score_mismatch`);
    }

    if (
      typeof kpi.rate === "number" &&
      Number.isFinite(kpi.rate) &&
      typeof kpi.score === "number" &&
      Number.isFinite(kpi.score) &&
      kpi.score > 0 &&
      kpi.score < 0.01 &&
      kpiWeightFromName(kpi.name) != null
    ) {
      flags.push(`${kpi.name}:normalization_conflict`);
    }
  }

  const totalScore = kpis.reduce((total, kpi) => total + powerBiKpiScore(kpi), 0);
  if (groupWeight > 0 && totalScore > groupWeight + 0.01) {
    flags.push("group_score_mismatch");
  }

  return Array.from(new Set(flags));
}

function aggregatePowerBiKpiGroup(kpis: PowerBiKpiItem[], weight: number | null | undefined) {
  const groupWeight = typeof weight === "number" && Number.isFinite(weight) ? weight : 0;
  const groupScore = kpis.reduce((total, kpi) => total + powerBiKpiScore(kpi), 0);
  const orderVolume = kpis.reduce((total, kpi) => total + (typeof kpi.orderVolume === "number" && Number.isFinite(kpi.orderVolume) ? kpi.orderVolume : 0), 0);
  const hasOrderVolume = kpis.some((kpi) => typeof kpi.orderVolume === "number" && Number.isFinite(kpi.orderVolume));
  const consistencyWarnings = kpiScoreConsistencyFlags(kpis, groupWeight);

  return {
    weight: groupWeight,
    score: Number(groupScore.toFixed(2)),
    rate: groupWeight > 0 ? Number((groupScore / groupWeight).toFixed(4)) : 0,
    orderVolume,
    hasOrderVolume,
    consistencyStatus: consistencyWarnings.some((warning) => warning.includes("normalization_conflict"))
      ? "conflict_detected" as const
      : consistencyWarnings.length
        ? "inconsistent" as const
        : "consistent" as const,
    consistencyWarnings
  };
}

function groupMetricValue(
  results: ReportMetricEvidenceResult[],
  fixedGroup: typeof fixedLogisticsKpiGroups[number],
  suffixes: string[]
) {
  const aliases = fixedGroup.aliases.map((alias) => compactKpiText(alias));
  const compactSuffixes = suffixes.map((suffix) => compactKpiText(suffix));

  for (const result of results) {
    const name = compactKpiText(reportMetricDisplayName(result));
    const matched = aliases.some((alias) =>
      compactSuffixes.some((suffix) => name === `${alias}${suffix}`)
    );
    if (!matched) continue;

    const value = numericReportMetricValue(result.currentValue ?? result.value);
    if (value != null) return value;
  }

  return null;
}

function exactReportMetricByAliases(results: ReportMetricEvidenceResult[], aliases: readonly string[]) {
  const targets = new Set(aliases.map(compactKpiText).filter(Boolean));

  return results.find((result) => {
    if (result.status !== "computed") return false;
    return [
      result.metricId,
      result.kpiId,
      result.metricName,
      result.kpiName,
      result.displayName
    ].map(compactKpiText).some((item) => targets.has(item));
  }) ?? null;
}

function metricScoreByAliases(results: ReportMetricEvidenceResult[], aliases: readonly string[]) {
  const aliasKeys = aliases.map(compactKpiText).filter(Boolean);
  const scoreLike = results.find((result) => {
    if (result.status !== "computed") return false;
    const fields = [
      result.metricId,
      result.kpiId,
      result.metricName,
      result.kpiName,
      result.displayName
    ].map(compactKpiText);
    return fields.some((field) =>
      aliasKeys.some((alias) => field === alias || field.includes(alias) || alias.includes(field)) &&
      isScoreLikeReportMetricKey(field)
    );
  });

  const scoreLikeValue = reportMetricScoreValue(scoreLike);
  if (scoreLikeValue != null) return scoreLikeValue;

  const exact = exactReportMetricByAliases(results, aliases);
  const exactFields = exact ? [
    exact.metricId,
    exact.kpiId,
    exact.metricName,
    exact.kpiName,
    exact.displayName
  ].map(compactKpiText) : [];
  if (exactFields.some(isScoreLikeReportMetricKey)) {
    const exactValue = reportMetricScoreValue(exact);
    if (exactValue != null) return exactValue;
  }

  return null;
}

function isScoreLikeReportMetricKey(value?: string | null) {
  const key = compactKpiText(value);
  return key === "总减分" || /(最终得分|总得分|总分|得分|减分)$/.test(key);
}

function reportMetricScoreValue(result?: ReportMetricEvidenceResult | null) {
  if (!result) return null;
  const directScore = numericReportMetricValue((result as { score?: number | string | null }).score);
  if (directScore != null) return directScore;
  return numericReportMetricValue(result.currentValue ?? result.value);
}

function kpiScoreByAliases(kpis: PowerBiKpiItem[], aliases: readonly string[]) {
  const aliasKeys = aliases.map(compactKpiText).filter(Boolean);
  const matched = kpis.find((kpi) => {
    const name = compactKpiText(kpi.name);
    return aliasKeys.some((alias) => name === alias || name.includes(alias) || alias.includes(name));
  });

  return matched?.score ?? null;
}

function explicitAdjustmentTotalScore(kpis: PowerBiKpiItem[]) {
  const totalKpi = kpis.find((kpi) => {
    const key = compactKpiText(kpi.name);
    return key === "总减分" || key === "加减分项总得分" || key === "加减分总得分";
  });
  if (!totalKpi) return null;
  const explicitValue = numericReportMetricValue(totalKpi.value as number | string | null | undefined);
  if (explicitValue != null) return explicitValue;
  if (typeof totalKpi.score === "number" && Number.isFinite(totalKpi.score)) return totalKpi.score;
  return null;
}

function isAdjustmentGroupName(value?: string | null) {
  const key = compactKpiText(value);
  return key === "加减分项" || key === "加减分";
}

function isAdjustmentTotalKpiName(value?: string | null) {
  const key = compactKpiText(value);
  return key === "总减分" || key === "加减分项总得分" || key === "加减分总得分";
}

function displayScoreForPowerBiGroup(group: PowerBiKpiGroup) {
  if (!isAdjustmentGroupName(group.name)) return group.score;
  return explicitAdjustmentTotalScore(group.kpis) ?? group.score;
}

function displayScoreForPowerBiKpi(kpi: PowerBiKpiItem) {
  if (!isAdjustmentTotalKpiName(kpi.name)) return kpi.score;
  return numericReportMetricValue(kpi.value as number | string | null | undefined) ?? kpi.score;
}

function formulaScoreText(value: number | null) {
  return value == null ? "缺失" : value.toFixed(2);
}

function formulaComponentStatus(score: number | null): FormulaBreakdownComponent["status"] {
  if (score == null) return "missing";
  if (!Number.isFinite(score)) return "invalid";
  if (score === 0) return "zero";
  return "valid";
}

function buildFormulaBreakdown(
  spec: typeof logisticsFormulaSpecs[number],
  results: ReportMetricEvidenceResult[],
  kpis: PowerBiKpiItem[] = []
): FormulaBreakdown {
  const components = spec.components.map((component) => {
    const score = metricScoreByAliases(results, component.aliases) ?? kpiScoreByAliases(kpis, component.aliases);
    return {
      name: component.name,
      score,
      maxScore: kpiWeightFromName(component.name),
      status: formulaComponentStatus(score)
    };
  });
  const finalScore = metricScoreByAliases(results, spec.parentAliases);
  const validSum = components.reduce((total, component) => total + (component.score ?? 0), 0);
  const hasMissing = components.some((component) => component.status === "missing" || component.status === "invalid");
  const consistencyStatus: FormulaBreakdown["consistencyStatus"] = finalScore == null
    ? "missing"
    : hasMissing
      ? "partial"
      : Math.abs(validSum - finalScore) <= 0.01
        ? "matched"
        : "mismatched";

  return {
    title: spec.title,
    expressionLabel: spec.title,
    formulaText: `${spec.title} = ${components.map((component) => component.name).join(" + ")}`,
    valueText: `${spec.title} = ${components.map((component) => formulaScoreText(component.score)).join(" + ")}`,
    resultText: `${spec.title} = ${formulaScoreText(finalScore)}`,
    components,
    finalScore,
    maxScore: spec.maxScore,
    consistencyStatus,
    warning: consistencyStatus === "mismatched"
      ? `子项合计 ${validSum.toFixed(2)} 与父级得分 ${formulaScoreText(finalScore)} 不一致`
      : consistencyStatus === "partial"
        ? "存在缺失子指标，公式只能展示部分拆解"
        : consistencyStatus === "missing"
          ? "父级汇总指标缺失"
          : undefined
  };
}

function formulaBreakdownsForGroup(groupName: string, results: ReportMetricEvidenceResult[], kpis: PowerBiKpiItem[]) {
  const groupKey = compactKpiText(groupName);
  return logisticsFormulaSpecs
    .filter((spec) => spec.id !== "kpi_total")
    .filter((spec) => spec.groupAliases.some((alias) => groupKey.includes(compactKpiText(alias))))
    .map((spec) => buildFormulaBreakdown(spec, results, kpis))
    .filter((breakdown) => breakdown.finalScore != null || breakdown.components.some((component) => component.status !== "missing"));
}

function inferredAdjustmentKpi(name: string, index: number, locale: Locale): PowerBiKpiItem {
  const result: ReportMetricEvidenceResult | undefined = undefined;
  return {
    id: `adjustment-${compactKpiText(name) || index}`,
    name,
    value: 0,
    status: "zero",
    displayFlag: true,
    numerator: null,
    denominator: null,
    rate: null,
    score: 0,
    zeroLine: null,
    fullScoreLine: null,
    previousValue: 0,
    changePercent: 0,
    direction: "lower_is_better",
    riskLevel: "low",
    details: [
      { label: locale === "zh" ? "今日" : "Current", value: "0" },
      { label: locale === "zh" ? "昨日" : "Previous", value: "0" },
      { label: locale === "zh" ? "变化" : "Change", value: signedComparisonPercent(0, locale) },
      { label: locale === "zh" ? "口径" : "Definition", value: locale === "zh" ? "数据缺失时按 0 自动推断。" : "Inferred as 0 when source data is missing." }
    ],
    result
  };
}

function missingPowerBiKpi(name: string, index: number, locale: Locale): PowerBiKpiItem {
  return {
    id: `missing-${compactKpiText(name) || index}`,
    name,
    value: null,
    status: "missing",
    displayFlag: true,
    numerator: null,
    denominator: null,
    rate: null,
    score: null,
    zeroLine: null,
    fullScoreLine: null,
    previousValue: null,
    changePercent: null,
    direction: "neutral",
    riskLevel: "low",
    details: [
      { label: locale === "zh" ? "得分" : "Score", value: "-" },
      { label: locale === "zh" ? "率值" : "Rate", value: "-" },
      { label: locale === "zh" ? "状态" : "Status", value: locale === "zh" ? "缺失" : "Missing" }
    ]
  };
}

function stripKpiComponentSuffix(value?: string | null) {
  return compactKpiText(value)
    .replace(/(最终得分|总得分|得分率|率值|占比|得分|总分|分子|分母)$/g, "");
}

function resultMatchesBusinessKpi(result: ReportMetricEvidenceResult, aliases: string[]) {
  const name = compactKpiText(reportMetricDisplayName(result));
  if (!name || isSummaryKpiName(reportMetricDisplayName(result))) return false;
  return aliases.some((alias) => {
    const compactAlias = compactKpiText(alias);
    const strippedName = stripKpiComponentSuffix(name);
    return name === compactAlias ||
      strippedName === compactAlias ||
      name.startsWith(compactAlias) ||
      name.includes(compactAlias) ||
      strippedName.includes(compactAlias);
  });
}

function componentRankForBusinessKpi(result: ReportMetricEvidenceResult, aliases: string[]) {
  const name = compactKpiText(reportMetricDisplayName(result));
  const exactAlias = aliases.some((alias) => name === compactKpiText(alias));

  if (/(最终得分|总得分|总分)$/.test(name)) return 0;
  if (/得分$/.test(name)) return 1;
  if (exactAlias) return 2;
  if (/(率值|占比)$/.test(name)) return 5;
  if (/(分子|分母)$/.test(name)) return 9;
  return 4;
}

function componentValue(components: ReportMetricEvidenceResult[], pattern: RegExp) {
  const result = components.find((component) => pattern.test(compactKpiText(reportMetricDisplayName(component))));
  return numericReportMetricValue(result?.currentValue ?? result?.value);
}

function appealRateDetails(
  components: ReportMetricEvidenceResult[],
  locale: Locale
): PowerBiKpiDetailItem[] {
  const isZh = locale === "zh";
  const responsibility = componentValue(components, /责任量$/);
  const rate = componentValue(components, /率值$/);
  const rawScore = componentValue(components, /得分$/);
  const penalty = componentValue(components, /申诉率减分$/);

  return [
    { label: isZh ? "责任量" : "Responsibility volume", value: formatReportMetricValue(responsibility) },
    { label: isZh ? "率值" : "Rate", value: formatReportMetricRate(rate, "申诉率") },
    { label: isZh ? "得分" : "Score", value: formatReportMetricValue(rawScore) },
    { label: isZh ? "申诉率减分" : "Appeal-rate deduction", value: formatReportMetricValue(penalty) }
  ];
}

function isAppealRateKpiName(value?: string | null) {
  return compactKpiText(value) === "申诉率";
}

function kpiCoreFields(components: ReportMetricEvidenceResult[], displayName?: string | null) {
  const standalone = components.find((component) => {
    const name = compactKpiText(reportMetricDisplayName(component));
    return !/(最终得分|总得分|得分率|率值|占比|得分|总分|分子|分母)$/.test(name);
  });
  const standaloneValue = numericReportMetricValue(standalone?.currentValue ?? standalone?.value);
  const scoreComponent = components.find((component) => /(最终得分|总得分|总分|得分)$/.test(compactKpiText(reportMetricDisplayName(component))));
  const scoreComponentValue = numericReportMetricValue(scoreComponent?.currentValue ?? scoreComponent?.value);
  const appealPenaltyValue = isAppealRateKpiName(displayName) ? componentValue(components, /申诉率减分$/) : null;
  const hasRateComponent = components.some((component) => /(率值|占比)$/.test(compactKpiText(reportMetricDisplayName(component))));
  const hasCalculationComponent = components.some((component) => /(分子|分母|零分线|满分线)$/.test(compactKpiText(reportMetricDisplayName(component))));

  return {
    numerator: componentValue(components, /分子$/),
    denominator: componentValue(components, /分母$/),
    rate: componentValue(components, /(率值|占比)$/),
    score: appealPenaltyValue ?? (scoreComponent ? scoreComponentValue : (hasRateComponent || hasCalculationComponent ? null : standaloneValue)),
    zeroLine: componentValue(components, /零分线$/),
    fullScoreLine: componentValue(components, /满分线$/)
  };
}

function businessKpiDetails(
  chosen: ReportMetricEvidenceResult,
  components: ReportMetricEvidenceResult[],
  locale: Locale,
  displayName?: string
): PowerBiKpiDetailItem[] {
  const isZh = locale === "zh";
  const kpiName = reportMetricDisplayName(chosen);
  const core = kpiCoreFields(components, displayName ?? kpiName);
  if (isAppealRateKpiName(displayName ?? kpiName)) {
    return appealRateDetails(components, locale);
  }

  const details = [
    { label: isZh ? "得分" : "Score", value: formatReportMetricValue(core.score) },
    { label: isZh ? "率值" : "Rate", value: formatReportMetricRate(core.rate, kpiName) },
    { label: isZh ? "零分线" : "Zero line", value: formatReportMetricRate(core.zeroLine, kpiName) },
    { label: isZh ? "满分线" : "Full-score line", value: formatReportMetricRate(core.fullScoreLine, kpiName) },
    ...powerBiKpiDetails(chosen, undefined, locale)
  ];
  const chosenId = chosen.metricId;

  for (const component of components) {
    if (component.metricId === chosenId) continue;
    if (/(分子|分母)$/.test(compactKpiText(reportMetricDisplayName(component)))) continue;
    const value = component.currentValue ?? component.value;
    if (value == null) continue;
    const componentName = reportMetricDisplayName(component);
    const isRateLike = /(率值|占比|得分率|零分线|满分线)$/.test(compactKpiText(componentName));
    details.push({
      label: componentName,
      value: isRateLike ? formatReportMetricRate(value, componentName, component.unit) : formatReportMetricValue(value)
    });
  }

  if (!details.some((detail) => detail.label === (isZh ? "定义" : "Definition"))) {
    details.push({
      label: isZh ? "定义" : "Definition",
      value: isZh ? "业务级 KPI，组件字段只用于下钻说明。" : "Business-level KPI; component fields are only used in drill-down."
    });
  }

  return details;
}

function powerBiKpiFromBusinessName(
  results: ReportMetricEvidenceResult[],
  displayName: string,
  aliases: string[],
  index: number,
  locale: Locale
) {
  const candidates = results
    .filter((result) => result.status === "computed")
    .filter((result) => resultMatchesBusinessKpi(result, [displayName, ...aliases]))
    .sort((left, right) =>
      componentRankForBusinessKpi(left, [displayName, ...aliases]) - componentRankForBusinessKpi(right, [displayName, ...aliases])
    );
  const chosen = candidates.find((candidate) => (candidate.currentValue ?? candidate.value) != null) ?? candidates[0];

  if (!chosen) {
    return null;
  }

  const direction = chosen.metricDirection ?? metricDirectionFromText(displayName, chosen.metricCategory);
  const riskLevel = reportMetricRiskLevel(chosen);
  const core = kpiCoreFields(candidates, displayName);
  const isAdjustmentTotal = isAdjustmentTotalKpiName(displayName) || aliases.some((alias) => isAdjustmentTotalKpiName(alias));
  const explicitScore = isAdjustmentTotal ? numericReportMetricValue(chosen.currentValue ?? chosen.value) : null;
  const score = explicitScore ?? core.score;
  const kpiValue = score ?? chosen.currentValue ?? chosen.value;
  return {
    id: chosen.kpiId || chosen.metricId || `${compactKpiText(displayName)}-${index}`,
    name: displayName,
    value: kpiValue,
    status: powerBiKpiDataStatus(kpiValue),
    displayFlag: true,
    numerator: core.numerator,
    denominator: core.denominator,
    rate: core.rate,
    score,
    zeroLine: core.zeroLine,
    fullScoreLine: core.fullScoreLine,
    previousValue: chosen.previousValue,
    changePercent: reportMetricChangePercent(chosen),
    direction,
    riskLevel,
    formula: chosen.formula,
    details: businessKpiDetails(chosen, candidates, locale, displayName),
    result: chosen
  } satisfies PowerBiKpiItem;
}

function guaranteeFixedLogisticsGroups(
  groups: PowerBiKpiGroup[],
  results: ReportMetricEvidenceResult[],
  locale: Locale
): PowerBiKpiGroup[] {
  return fixedLogisticsKpiGroups.map((fixedGroup, groupIndex) => {
    const matchedGroups = groups.filter((group) => logisticsFixedGroupMatch(group.name, fixedGroup));
    const directResultKpis = fixedGroup.name === "加减分项"
      ? requiredAdjustmentKpis
          .map((definition, index) => powerBiKpiFromBusinessName(results, definition.name, definition.aliases, index, locale))
          .filter(Boolean)
      : fixedGroup.suggestedKpis
          .map((name, index) => powerBiKpiFromBusinessName(results, name, [], index, locale))
	          .filter(Boolean);
	    const matchedKpis = [
	      ...(directResultKpis as PowerBiKpiItem[]),
	      ...(directResultKpis.length ? [] : matchedGroups.flatMap((group) => group.kpis))
	    ];
    const seen = new Set<string>();
    const kpis = matchedKpis.filter((kpi) => {
      const key = compactKpiText(kpi.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

	    if (fixedGroup.name === "加减分项") {
	      for (const definition of requiredAdjustmentKpis) {
	        const key = compactKpiText(definition.name);
	        if (!seen.has(key)) {
	          kpis.push(inferredAdjustmentKpi(definition.name, kpis.length, locale));
	          seen.add(key);
	        }
	      }
	    } else if (!kpis.length) {
	      for (const name of fixedGroup.suggestedKpis) {
	        const key = compactKpiText(name);
	        if (!seen.has(key)) {
	          kpis.push(missingPowerBiKpi(name, kpis.length, locale));
	          seen.add(key);
	        }
	      }
	    }

    const firstMatchedGroup = matchedGroups[0];
    const status: PowerBiKpiGroup["status"] = kpis.length ? "filled" : "missing";
    const groupWeight = kpiGroupWeight(fixedGroup.name) ?? firstMatchedGroup?.weight ?? 0;
    const rawAggregation = aggregatePowerBiKpiGroup(kpis, groupWeight);
    const adjustmentScore = fixedGroup.name === "加减分项" ? explicitAdjustmentTotalScore(kpis) : null;
    const aggregation = adjustmentScore == null
      ? rawAggregation
      : {
          ...rawAggregation,
          score: Number(adjustmentScore.toFixed(2)),
          rate: groupWeight > 0 ? Number((adjustmentScore / groupWeight).toFixed(4)) : 0,
          consistencyWarnings: rawAggregation.consistencyWarnings.filter((warning) => warning !== "group_score_mismatch")
        };
    const explicitOrderVolume = groupMetricValue(results, fixedGroup, ["订单量", "业务量"]);
    const formulaBreakdowns = formulaBreakdownsForGroup(fixedGroup.name, results, kpis);

    return {
      id: compactKpiText(fixedGroup.name) || `fixed-logistics-${groupIndex}`,
      name: fixedGroup.name,
      weight: aggregation.weight,
      score: aggregation.score,
      rate: aggregation.rate,
      orderVolume: explicitOrderVolume ?? aggregation.orderVolume,
      hasOrderVolume: explicitOrderVolume != null || aggregation.hasOrderVolume,
      status,
      message: status === "missing" ? "暂无数据" : undefined,
      suggestedKpis: status === "missing" ? [...fixedGroup.suggestedKpis] : undefined,
      riskLevel: status === "missing" ? "medium" : mergeKpiRiskLevel(kpis.map((kpi) => kpi.riskLevel)),
      formulaBreakdowns,
      kpis
    };
  });
}

function buildPowerBiKpiGroups(
  results: ReportMetricEvidenceResult[],
  assetLibrary: KpiAssetLibraryViewData | null | undefined,
  locale: Locale
): { summaryResults: ReportMetricEvidenceResult[]; groups: PowerBiKpiGroup[] } {
  const assets = Array.isArray(assetLibrary?.kpi_registry) ? assetLibrary.kpi_registry : [];
  const computedSummaryResults = results
    .filter((result) => result.status === "computed")
    .filter((result) => isSummaryKpiName(reportMetricDisplayName(result)))
    .sort((left, right) => summaryKpiSortPriority(reportMetricDisplayName(left)) - summaryKpiSortPriority(reportMetricDisplayName(right)));
  const summaryResultKeys = new Set(computedSummaryResults.map((result) => compactKpiText(reportMetricDisplayName(result))));
  const syntheticSummaryResults = assets
    .filter((asset) => isSummaryKpiName(asset.kpi_name))
    .filter((asset) => !summaryResultKeys.has(compactKpiText(asset.kpi_name)))
    .map((asset, index): ReportMetricEvidenceResult => ({
      metricId: asset.kpi_id || `summary-asset-${index}`,
      metricName: asset.kpi_name || `Summary ${index + 1}`,
      kpiId: asset.kpi_id,
      kpiName: asset.kpi_name,
      displayName: asset.kpi_name,
      formula: asset.formula || "",
      status: "computed",
      value: asset.sample_value ?? null,
      currentValue: asset.sample_value ?? null,
      previousValue: null,
      metricDirection: asset.direction === "higher_is_better" || asset.direction === "lower_is_better" ? asset.direction : "neutral",
      computedAt: ""
    }));
  const summaryResults = [...computedSummaryResults, ...syntheticSummaryResults]
    .sort((left, right) => summaryKpiSortPriority(reportMetricDisplayName(left)) - summaryKpiSortPriority(reportMetricDisplayName(right)));

  if (assets.length) {
    const groupedAssets = new Map<string, typeof assets>();
    for (const asset of assets) {
      if (isSummaryKpiName(asset.kpi_name)) continue;
      const groupName = kpiGroupBaseName(asset.group_name || kpiAssetCategoryLabel(asset.category, locale));
      const values = groupedAssets.get(groupName) ?? [];
      values.push(asset);
      groupedAssets.set(groupName, values);
    }

    const groups = Array.from(groupedAssets.entries()).map(([groupName, groupAssets], groupIndex) => {
      const scoreAsset = groupAssets.find(isKpiGroupScoreAsset);
      const seen = new Set<string>();
      const kpis = groupAssets
        .filter((asset) => asset !== scoreAsset)
        .filter((asset) => asset.kpi_name && !isKpiLeafAssetName(asset.kpi_name))
        .map((asset, index) => {
          const result = findReportMetricForAsset(results, asset);
          const displayName = asset.kpi_name || result?.displayName || result?.metricName || `KPI ${index + 1}`;
          const key = compactKpiText(displayName);
          if (seen.has(key)) return null;
          seen.add(key);
          const direction = (result?.metricDirection ?? asset.direction ?? metricDirectionFromText(displayName, result?.metricCategory)) as MetricDirection;
          const riskLevel = reportMetricRiskLevel(result, asset.direction);
          return {
	            id: asset.kpi_id || result?.metricId || `${groupName}-${index}`,
	            name: displayName,
	            value: result?.currentValue ?? result?.value ?? asset.sample_value,
	            status: powerBiKpiDataStatus(result?.currentValue ?? result?.value ?? asset.sample_value),
	            displayFlag: true,
	            numerator: null,
            denominator: null,
            rate: null,
            score: numericReportMetricValue(result?.currentValue ?? result?.value ?? asset.sample_value),
            previousValue: result?.previousValue,
            changePercent: reportMetricChangePercent(result),
            direction,
            riskLevel,
            formula: result?.formula || asset.formula,
            details: powerBiKpiDetails(result, asset, locale),
            result
          } satisfies PowerBiKpiItem;
        })
        .filter(Boolean) as PowerBiKpiItem[];

      return {
        id: compactKpiText(groupName) || `group-${groupIndex}`,
        name: groupName,
        ...aggregatePowerBiKpiGroup(kpis, kpiGroupWeight(groupAssets.find((asset) => asset.group_name)?.group_name)),
	        status: kpis.length ? "filled" : "missing",
        riskLevel: mergeKpiRiskLevel(kpis.map((kpi) => kpi.riskLevel)),
        kpis
      } satisfies PowerBiKpiGroup;
    });

    return {
      summaryResults,
      groups: guaranteeFixedLogisticsGroups(groups, results, locale)
    };
  }

  const fallbackGroupsMap = new Map<string, ReportMetricEvidenceResult[]>();
  for (const result of results.filter((item) => !isSummaryKpiName(reportMetricDisplayName(item)))) {
    const groupName = inferReportMetricBusinessModule(result, locale);
    const values = fallbackGroupsMap.get(groupName) ?? [];
    values.push(result);
    fallbackGroupsMap.set(groupName, values);
  }

  const groups = Array.from(fallbackGroupsMap.entries()).map(([groupName, groupResults], groupIndex) => {
    const kpis = groupResults.slice(0, 80).map((result, index) => {
      const name = reportMetricDisplayName(result);
      const direction = result.metricDirection ?? metricDirectionFromText(name, result.metricCategory);
      const riskLevel = reportMetricRiskLevel(result);
      return {
	        id: result.metricId || `${groupName}-${index}`,
	        name,
	        value: result.currentValue ?? result.value,
	        status: powerBiKpiDataStatus(result.currentValue ?? result.value),
	        displayFlag: true,
	        numerator: null,
        denominator: null,
        rate: null,
        score: numericReportMetricValue(result.currentValue ?? result.value),
        previousValue: result.previousValue,
        changePercent: reportMetricChangePercent(result),
        direction,
        riskLevel,
        formula: result.formula,
        details: powerBiKpiDetails(result, undefined, locale),
        result
      } satisfies PowerBiKpiItem;
    });

    return {
      id: compactKpiText(groupName) || `fallback-group-${groupIndex}`,
      name: groupName,
      ...aggregatePowerBiKpiGroup(kpis, kpiGroupWeight(groupName)),
	      status: kpis.length ? "filled" : "missing",
      riskLevel: mergeKpiRiskLevel(kpis.map((kpi) => kpi.riskLevel)),
      kpis
    } satisfies PowerBiKpiGroup;
  });

  return { summaryResults, groups: guaranteeFixedLogisticsGroups(groups, results, locale) };
}

function FormulaBreakdownCard({
  breakdown,
  locale
}: {
  breakdown: FormulaBreakdown;
  locale: Locale;
}) {
  const isZh = locale === "zh";
  const statusLabel = {
    matched: isZh ? "已匹配" : "Matched",
    mismatched: isZh ? "不一致" : "Mismatched",
    partial: isZh ? "部分缺失" : "Partial",
    missing: isZh ? "缺失" : "Missing"
  }[breakdown.consistencyStatus];
  const statusClass = {
    matched: "bg-emerald-50 text-emerald-700",
    mismatched: "bg-rose-50 text-rose-700",
    partial: "bg-amber-50 text-amber-700",
    missing: "bg-slate-100 text-slate-600"
  }[breakdown.consistencyStatus];

  return (
    <div className="rounded-xl border bg-white px-4 py-3 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-950">{breakdown.title}</p>
          {typeof breakdown.maxScore === "number" ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {isZh ? `满分：${breakdown.maxScore}` : `Max score: ${breakdown.maxScore}`}
            </p>
          ) : null}
        </div>
        <Badge variant="secondary" className={cn("text-[11px]", statusClass)}>
          {statusLabel}
        </Badge>
      </div>
      <div className="mt-3 space-y-1 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs leading-6 text-slate-800">
        <p>{breakdown.expressionLabel}</p>
        <p>= {breakdown.components.map((component) => component.name).join(" + ")}</p>
        <p>= {breakdown.components.map((component) => formulaScoreText(component.score)).join(" + ")}</p>
        <p>= {formulaScoreText(breakdown.finalScore)}</p>
      </div>
      {breakdown.warning ? (
        <p className="mt-2 text-xs font-medium text-amber-700">{breakdown.warning}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {breakdown.components.map((component) => (
          <span key={`${breakdown.title}-${component.name}`} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
            {component.name}：{formulaScoreText(component.score)}
          </span>
        ))}
      </div>
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
  assetLibrary,
  selectedRange,
  customStartDate,
  customEndDate,
  availableDateRange,
  onRangeChange,
  onCustomRangeChange,
  locale = "zh",
  isLoading = false
}: {
  metricResults?: ReportMetricEvidenceResult[];
  generatedAt?: string;
  timeConfig?: ReportTimeConfigViewData;
  trendMetrics?: ReportTrendMetricViewData[];
  trendCharts?: ReportTrendChartViewData[];
  structuredReport?: StructuredReportViewData | null;
  assetLibrary?: KpiAssetLibraryViewData | null;
  selectedRange: ReportTimeRange;
  customStartDate?: string;
  customEndDate?: string;
  availableDateRange?: ReportAvailableDateRange | null;
  onRangeChange: (range: ReportTimeRange) => void;
  onCustomRangeChange?: (startDate: string, endDate: string) => void;
  locale?: Locale;
  isLoading?: boolean;
}) {
  const isZh = locale === "zh";
  const [customDraftStartDate, setCustomDraftStartDate] = useState(customStartDate ?? "");
  const [customDraftEndDate, setCustomDraftEndDate] = useState(customEndDate ?? "");
  const powerBiResults = dedupeReportMetricResults((metricResults ?? []).filter((result) => !result.isInternalMetric && isNonInternalReportMetricResult(result)));
  const displayResults = dedupeReportMetricResults((metricResults ?? []).filter(isReportDashboardMetric));
  const selectedRangeTrendMetrics = trendMetricsForSelectedRange(trendMetrics, selectedRange);
  const computedResults = powerBiResults.filter((result) => result.status === "computed");
  const { summaryResults, groups: powerBiGroups } = buildPowerBiKpiGroups(powerBiResults, assetLibrary, locale);
  const kpiTotalFormulaBreakdown = buildFormulaBreakdown(logisticsFormulaSpecs.find((spec) => spec.id === "kpi_total")!, powerBiResults);
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
  const hasTimeField = Boolean(
    timeConfig?.hasTimeField ||
    availableDateRange?.dateField ||
    availableDateRange?.startDate ||
    availableDateRange?.endDate ||
    availableDateRange?.latestDataDate
  );
  const modules = Array.from(new Set(displayResults.map((result) => inferReportMetricBusinessModule(result, locale)))).sort();
  const visibleResults = displayResults
    .filter((result) => matchesReportMetricStatusFilter(result, "all"))
    .filter((result) => matchesReportMetricTypeFilter(result, "all"))
    .filter((result) => reportMetricDisplayType(result) !== "ranking")
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
  const statusFilter: ReportMetricStatusFilter = "all";
  const typeFilter: ReportMetricTypeFilter = "all";
  const moduleFilter: string = "all";
  const setStatusFilter = (_value: ReportMetricStatusFilter) => undefined;
  const setTypeFilter = (_value: ReportMetricTypeFilter) => undefined;
  const setModuleFilter = (_value: string) => undefined;
  const latestComputedAt = computedResults
    .map((result) => result.computedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const availableStartDate = availableDateRange?.startDate ?? timeConfig?.startDate ?? undefined;
  const availableEndDate = availableDateRange?.endDate ?? availableDateRange?.latestDataDate ?? timeConfig?.endDate ?? undefined;
  const clampDate = useCallback((value: string) => {
    if (availableStartDate && value < availableStartDate) return availableStartDate;
    if (availableEndDate && value > availableEndDate) return availableEndDate;
    return value;
  }, [availableEndDate, availableStartDate]);
  const customRangeStartValue = clampDate(customDraftStartDate || customStartDate || availableStartDate || "");
  const customRangeEndValue = clampDate(customDraftEndDate || customEndDate || availableEndDate || "");

  useEffect(() => {
    if (selectedRange !== "CUSTOM") return;
    setCustomDraftStartDate(customStartDate ?? availableStartDate ?? "");
    setCustomDraftEndDate(customEndDate ?? availableEndDate ?? "");
  }, [availableEndDate, availableStartDate, customEndDate, customStartDate, selectedRange]);

  return (
    <Card className="border-slate-200/70 bg-white/90 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{isZh ? "指标监控看板" : "Metric Monitoring Dashboard"}</CardTitle>
            <CardDescription>
              {isZh
                ? "按摘要、一级分组、二级 KPI 和点击明细组织展示。"
                : "Structured by summary, KPI groups, KPI rows, and click-through details."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 text-xs text-muted-foreground sm:justify-end">
            <Badge variant="secondary">
              {isZh
                ? `${powerBiResults.length} 个可展示指标`
                : `${powerBiResults.length} displayable metrics`}
            </Badge>
            <span>{isZh ? "上次更新时间" : "Last updated"}：{formatReportDate(generatedAt ?? latestComputedAt)}</span>
            {hasTimeField ? (
              <div className="flex flex-col items-end gap-2">
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
                {selectedRange === "CUSTOM" ? (
                  <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {availableDateRange?.dateField || timeConfig?.defaultTimeField
                        ? `${isZh ? "时间字段" : "Time field"}：${availableDateRange?.dateField ?? timeConfig?.defaultTimeField}`
                        : isZh ? "自定义区间" : "Custom range"}
                    </span>
                    <Input
                      type="date"
                      value={customRangeStartValue}
                      min={availableStartDate}
                      max={availableEndDate}
                      onChange={(event) => {
                        const nextStartDate = clampDate(event.target.value);
                        const nextEndDate = customRangeEndValue;
                        setCustomDraftStartDate(nextStartDate);
                        if (nextStartDate && nextEndDate && nextStartDate <= nextEndDate) {
                          onCustomRangeChange?.(nextStartDate, nextEndDate);
                        }
                      }}
                      className="h-8 w-36 text-xs"
                      aria-label={isZh ? "开始日期" : "Start date"}
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="date"
                      value={customRangeEndValue}
                      min={availableStartDate}
                      max={availableEndDate}
                      onChange={(event) => {
                        const nextStartDate = customRangeStartValue;
                        const nextEndDate = clampDate(event.target.value);
                        setCustomDraftEndDate(nextEndDate);
                        if (nextStartDate && nextEndDate && nextStartDate <= nextEndDate) {
                          onCustomRangeChange?.(nextStartDate, nextEndDate);
                        }
                      }}
                      className="h-8 w-36 text-xs"
                      aria-label={isZh ? "结束日期" : "End date"}
                    />
                    {availableStartDate && availableEndDate ? (
                      <span className="text-muted-foreground">
                        {availableStartDate} - {availableEndDate}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-xl border bg-secondary/20 p-4 text-sm font-medium text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {isZh ? "正在计算所选时间范围的指标..." : "Computing metrics for the selected date range..."}
          </div>
        ) : powerBiResults.length ? (
          <>
            {summaryResults.length ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  {summaryResults.map((result) => {
                    const changePercent = reportMetricChangePercent(result);
                    const displayName = reportMetricDisplayName(result);
                    const comparisonPreset = result.dateRangePreset ?? selectedRange;
                    const comparisonCurrentStart = result.currentStartDate ?? result.dateRangeStart ?? null;
                    const comparisonCurrentEnd = result.currentEndDate ?? result.dateRangeEnd ?? null;
                    return (
                      <div key={`summary-${result.metricId}`} className="rounded-xl border bg-slate-950 px-5 py-4 text-white shadow-sm">
                        <p className="text-xs font-medium text-slate-300">{displayName}</p>
                        <p className="mt-3 text-3xl font-semibold tracking-tight">
                          {formatReportSummaryMetricValue(result.currentValue ?? result.value, displayName, locale)}
                        </p>
                        <p className={cn("mt-2 text-xs font-medium", signedComparisonToneClass(changePercent))}>
                          {changePercent == null
                            ? (isZh ? "暂无对比" : "No comparison")
                            : signedComparisonPercentWithPeriod(
                              changePercent,
                              locale,
                              comparisonPreset,
                              comparisonCurrentStart,
                              comparisonCurrentEnd,
                              result.previousStartDate,
                              result.previousEndDate
                            )}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {kpiTotalFormulaBreakdown.finalScore != null || kpiTotalFormulaBreakdown.components.some((component) => component.status !== "missing") ? (
                  <FormulaBreakdownCard breakdown={kpiTotalFormulaBreakdown} locale={locale} />
                ) : null}
              </div>
            ) : null}

            {powerBiGroups.length ? (
              <div className="space-y-3">
                {powerBiGroups.map((group) => (
                  <details key={group.id} className="group rounded-xl border bg-white shadow-sm">
                    <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                      <div className="flex min-w-0 items-center gap-2">
                        <ChevronRight className="size-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90" />
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-slate-950">
                            {group.name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {group.status === "missing"
                              ? (isZh ? "暂无数据，保留固定分组" : "No data yet, fixed group retained")
                              : (isZh ? `${group.kpis.length} 个 KPI，默认折叠` : `${group.kpis.length} KPIs, collapsed by default`)}
                          </p>
                        </div>
	                      </div>
	                      <div className="text-right text-sm font-semibold text-slate-900">
	                        <span>{isZh ? "得分" : "Score"}：{formatReportMetricValue(displayScoreForPowerBiGroup(group))}</span>
	                        <span className="ml-3 text-muted-foreground">
	                          {isZh ? "得分率" : "Rate"}：{formatReportMetricRate(group.rate)}
	                        </span>
	                        {group.hasOrderVolume ? (
	                          <span className="ml-3 text-muted-foreground">
	                            {isZh ? "订单量" : "Order volume"}：{formatReportMetricValue(group.orderVolume)}
	                          </span>
	                        ) : null}
	                      </div>
                      <Badge variant="secondary" className="hidden text-[11px] sm:inline-flex">
                        {group.kpis.length} KPI
                      </Badge>
                    </summary>
                    <div className="border-t bg-slate-50/60 px-3 py-3">
                      {group.status === "missing" ? (
                        <div className="rounded-xl border bg-white px-4 py-4 text-sm">
                          <p className="font-semibold text-slate-950">{group.message ?? (isZh ? "暂无数据" : "No data")}</p>
                          {group.suggestedKpis?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {group.suggestedKpis.map((name) => (
                                <Badge key={`${group.id}-${name}`} variant="secondary" className="text-[11px]">
                                  {name}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                      <div className="space-y-3">
                        {group.formulaBreakdowns?.length ? (
                          <div className="grid gap-3 lg:grid-cols-2">
                            {group.formulaBreakdowns.map((breakdown) => (
                              <FormulaBreakdownCard
                                key={`${group.id}-formula-${breakdown.title}`}
                                breakdown={breakdown}
                                locale={locale}
                              />
                            ))}
                          </div>
                        ) : null}
                        <div className="overflow-hidden rounded-xl border bg-white">
                          <div className="grid grid-cols-[minmax(0,1fr)_110px_110px] gap-3 border-b bg-slate-50 px-3 py-2 text-xs font-semibold text-muted-foreground">
                            <span>{isZh ? "KPI" : "KPI"}</span>
                            <span className="text-right">{isZh ? "得分" : "Score"}</span>
                            <span className="text-right">{isZh ? "率值" : "Rate"}</span>
                          </div>
                          <div className="divide-y">
                            {group.kpis.map((kpi) => (
                              <details key={kpi.id} className="group/kpi">
                                <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_110px_110px] gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                                  <span className="flex min-w-0 items-center gap-2">
                                    <ChevronRight className="size-3.5 shrink-0 text-slate-400 transition-transform group-open/kpi:rotate-90" />
                                    <span className="truncate font-medium text-slate-950">{kpi.name}</span>
                                  </span>
                                  <span className="text-right font-semibold tabular-nums text-slate-900">
                                    {formatReportMetricValue(displayScoreForPowerBiKpi(kpi))}
                                  </span>
                                  <span className="text-right font-semibold tabular-nums text-slate-900">
                                    {formatReportMetricRate(kpi.rate, kpi.name)}
                                  </span>
                                </summary>
                                <div className="grid gap-2 bg-slate-50 px-8 py-3 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                                  {kpi.formulaBreakdown ? (
                                    <div className="sm:col-span-2 lg:col-span-3">
                                      <FormulaBreakdownCard breakdown={kpi.formulaBreakdown} locale={locale} />
                                    </div>
                                  ) : null}
                                  {kpi.details.map((detail, index) => (
                                    <div key={`${kpi.id}-detail-${index}`} className="min-w-0 rounded-lg bg-white px-3 py-2">
                                      <p className="font-medium text-muted-foreground">{detail.label}</p>
                                      <p className="mt-1 break-words font-semibold text-slate-900">{detail.value}</p>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            ))}
                          </div>
                        </div>
                      </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border bg-secondary/20 p-4 text-sm text-muted-foreground">
                {isZh
                  ? "暂无可分组的 KPI。生成报告后会按一级指标折叠展示。"
                  : "No grouped KPIs yet. Generated reports will render as collapsible KPI groups."}
              </div>
            )}
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
            <Badge variant="secondary">{isZh ? `${powerBiResults.length} 个可展示指标` : `${powerBiResults.length} displayable metrics`}</Badge>
            <span>{isZh ? "上次更新时间" : "Last updated"}：{formatReportDate(generatedAt ?? latestComputedAt)}</span>
            {hasTimeField ? (
              <div className="flex flex-col items-end gap-2">
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
                {selectedRange === "CUSTOM" ? (
                  <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {availableDateRange?.dateField || timeConfig?.defaultTimeField
                        ? `${isZh ? "时间字段" : "Time field"}：${availableDateRange?.dateField ?? timeConfig?.defaultTimeField}`
                        : isZh ? "自定义区间" : "Custom range"}
                    </span>
                    <Input
                      type="date"
                      value={customRangeStartValue}
                      min={availableStartDate}
                      max={availableEndDate}
                      onChange={(event) => {
                        const nextStartDate = clampDate(event.target.value);
                        const nextEndDate = customRangeEndValue;
                        setCustomDraftStartDate(nextStartDate);
                        if (nextStartDate && nextEndDate && nextStartDate <= nextEndDate) {
                          onCustomRangeChange?.(nextStartDate, nextEndDate);
                        }
                      }}
                      className="h-8 w-36 text-xs"
                      aria-label={isZh ? "开始日期" : "Start date"}
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="date"
                      value={customRangeEndValue}
                      min={availableStartDate}
                      max={availableEndDate}
                      onChange={(event) => {
                        const nextStartDate = customRangeStartValue;
                        const nextEndDate = clampDate(event.target.value);
                        setCustomDraftEndDate(nextEndDate);
                        if (nextStartDate && nextEndDate && nextStartDate <= nextEndDate) {
                          onCustomRangeChange?.(nextStartDate, nextEndDate);
                        }
                      }}
                      className="h-8 w-36 text-xs"
                      aria-label={isZh ? "结束日期" : "End date"}
                    />
                    {availableStartDate && availableEndDate ? (
                      <span className="text-muted-foreground">
                        {availableStartDate} - {availableEndDate}
                      </span>
                    ) : null}
                  </div>
                ) : null}
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
        ) : powerBiResults.length ? (
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
                const currentNumber = numericReportMetricValue(result.currentValue ?? result.value ?? trendMetric?.currentValue);
                const previousNumber = numericReportMetricValue(result.previousValue ?? trendMetric?.previousValue);
                const kpiExplanation = currentNumber == null
                  ? null
                  : explainKpi({
                      name: metricDisplay.title,
                      today: currentNumber,
                      yesterday: previousNumber,
                      change_pct: result.changePercent ?? result.percentChange ?? trendMetric?.changePercent ?? trendMetric?.percentChange ?? fallbackChangePercent,
                      definition: reportMetricShortDescription(result, locale),
                      formula: result.formula,
                      direction: metricDirection === "neutral" ? null : metricDirection
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
                      <summary className="cursor-pointer font-medium text-foreground">{isZh ? "解释" : "Explain"}</summary>
                      <div className="mt-2 space-y-2 rounded-lg bg-secondary/30 p-2">
                        {kpiExplanation ? (
                          <>
                            <p className="font-semibold text-slate-800">
                              {kpiExplanation.title}（{displayValue}）
                            </p>
                            <p>
                              <span className="font-semibold text-slate-700">{isZh ? "定义" : "Definition"}：</span>
                              {kpiExplanation.meaning}
                            </p>
                            <p>
                              <span className="font-semibold text-slate-700">{isZh ? "计算逻辑" : "Calculation"}：</span>
                              {kpiExplanation.calculation}
                            </p>
                            {result.formula ? (
                              <div>
                                <p className="font-semibold text-slate-700">{isZh ? "计算公式" : "Formula"}：</p>
                                <code className="mt-1 block whitespace-pre-wrap break-words rounded-md bg-white/80 px-2 py-1.5 text-[11px] leading-5 text-slate-800">
                                  {result.formula}
                                </code>
                              </div>
                            ) : null}
                            {kpiExplanation.comparison ? (
                              <p>
                                <span className="font-semibold text-slate-700">{isZh ? "对比" : "Comparison"}：</span>
                                {kpiExplanation.comparison}
                              </p>
                            ) : null}
                            {kpiExplanation.note ? (
                              <p>
                                <span className="font-semibold text-slate-700">{isZh ? "判断" : "Note"}：</span>
                                {kpiExplanation.note}
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <p>{reportMetricShortDescription(result, locale)}</p>
                        )}
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

function kpiAssetCategoryLabel(category: string | undefined, locale: Locale) {
  const isZh = locale === "zh";
  const labels: Record<string, string> = {
    business_scale: isZh ? "业务规模" : "Business Scale",
    efficiency: isZh ? "时效效率" : "Efficiency",
    quality: isZh ? "处理质量" : "Quality",
    experience: isZh ? "客户体验" : "Experience"
  };
  return labels[String(category ?? "")] ?? (category || (isZh ? "未分类" : "Uncategorized"));
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

type LogisticsAiAnalysisReport = {
  analysisVersion?: string;
  executive_summary?: {
    overall_assessment?: string;
    key_message?: string;
    score_interpretation?: string;
  } | string;
  score_decomposition?: Array<{
    group_name?: string;
    group_score?: number | string | null;
    group_rate?: number | string | null;
    interpretation?: string;
  }>;
  key_risks?: Array<{
    risk_name?: string;
    related_group?: string;
    evidence?: string[];
    business_impact?: string;
  }>;
  root_cause_hypotheses?: Array<{
    hypothesis?: string;
    evidence?: string[];
    confidence?: "low" | "medium" | "high" | string;
  }>;
  driver_analysis?: Array<{
    group_name?: string;
    top_drivers?: string[];
    weak_drivers?: string[];
  }>;
  causal_chains?: Array<{
    chain?: string;
  }>;
  driver_root_causes?: Array<{
    group_name?: string;
    cause?: string;
    evidence_kpis?: string[];
  }>;
	  insights?: {
	    what_happened?: string[];
	    why_it_happened?: string[];
	    so_what?: string[];
	  };
	  analysis_process?: {
	    kpi_decomposition?: string[];
	    driver_detection_logic?: string[];
	    bottleneck_ranking_logic?: string[];
	    causal_chain_logic?: string[];
	  };
	  causal_chain_analysis?: {
    causal_chain?: Array<{
      stage?: string;
      chain?: string;
    }>;
    chain_nodes?: Array<{
      stage?: string;
      kpi_name?: string | null;
      value?: number | string | null;
      score?: number | string | null;
      rate?: number | string | null;
      maxScore?: number | string | null;
      rateLabel?: string | null;
	      calculationBreakdown?: {
	        type?: "formula" | "result" | string;
	        title?: string;
	        expression?: string;
	        valueText?: string;
	        resultText?: string;
	        components?: Array<{
	          name?: string;
	          score?: number | string | null;
	          maxScore?: number | string | null;
        }>;
        finalScore?: number | string | null;
        maxScore?: number | string | null;
      } | null;
      status?: "valid" | "missing" | string;
    }>;
    bottlenecks?: {
      primary_bottleneck_group?: string;
      primary_bottleneck_kpi?: string;
      primary_bottleneck_evidence?: {
        value?: number | string | null;
        score?: number | string | null;
        rate?: number | string | null;
        maxScore?: number | string | null;
        rateLabel?: string | null;
      } | null;
      secondary_bottlenecks?: string[];
    };
    impact_analysis?: Array<{
      kpi_name?: string;
      group_name?: string;
      value?: number | string | null;
      score?: number | string | null;
      rate?: number | string | null;
      maxScore?: number | string | null;
      rateLabel?: string | null;
      impact_level?: "low" | "medium" | "high" | string;
      reason?: string;
    }>;
    system_insight?: {
      root_cause_stage?: string;
      explanation?: string;
    };
  };
  action_plan?: {
    p0?: string[];
    p1?: string[];
    p2?: string[];
  };
	  top_3_drivers?: Array<{
	    rank?: number;
	    name?: string;
	    kpi_name?: string;
    priority?: "low" | "medium" | "high" | string;
	    why?: string;
	    reason?: string;
	    impact_score?: number | string | null;
	    impact_level?: "low" | "medium" | "high" | string;
	    evidence?: Array<{
	      kpi_name?: string;
	      value?: number | string | null;
	      score?: number | string | null;
	      maxScore?: number | string | null;
	      rate?: number | string | null;
	      signal?: "weak" | "strong" | "normal" | string;
	    }>;
	    impact_chain?: string[];
	  }>;
	  top_3_kpis?: Array<{
	    name?: string;
	    impact_score?: number | string | null;
	    reason?: string;
	  }>;
	  primary_bottleneck_result?: {
	    kpi?: string;
	    reason?: string;
	    impact?: string;
	  };
	  causal_chain?: string;
	  decision_plan?: {
	    p0?: string[];
	    p1?: string[];
	    p2?: string[];
	  };
	  decision?: {
	    p0?: string[];
	    p1?: string[];
	    p2?: string[];
	  };
		  result_generation?: {
		    top_3_kpis?: Array<{
		      name?: string;
		      impact_score?: number | string | null;
	      reason?: string;
	    }>;
	    primary_bottleneck?: {
	      kpi?: string;
	      reason?: string;
	      impact?: string;
	    };
	    causal_chain?: string;
	    decision?: {
	      p0?: string[];
	      p1?: string[];
	      p2?: string[];
		    };
		  };
		  process_kpi_analysis?: {
		    process_health_summary?: string;
		    process_kpi_analysis?: Array<{
		      kpi_name?: string;
		      group_name?: string;
		      stage?: "upstream" | "midstream" | "downstream" | string;
		      performance_level?: "strong" | "medium" | "weak" | string;
		      impact_score?: number | string | null;
		      score?: number | string | null;
		      max_score?: number | string | null;
		      rate?: number | string | null;
		      value?: number | string | null;
		      interpretation?: string;
		    }>;
		    bottleneck?: {
		      kpi_name?: string;
		      reason?: string;
		      system_impact?: string;
		    };
		    process_flow?: string[];
		    causal_propagation?: Array<{ chain?: string }>;
		    recommendations?: {
		      p0?: string[];
		      p1?: string[];
		      p2?: string[];
		    };
		  };
	  kpi_role_classification?: {
    classified_kpis?: Array<{
      kpi_name?: string;
      role?: "result" | "driver" | "process" | string;
      reason?: string;
      causal_position?: "upstream" | "midstream" | "downstream" | string;
      influences?: string[];
      influenced_by?: string[];
    }>;
    role_distribution?: {
      result?: number;
      driver?: number;
      process?: number;
    };
    system_view?: {
      key_result_kpis?: string[];
      key_driver_kpis?: string[];
      key_process_kpis?: string[];
    };
  };
  key_insight?: string;
  data_notes?: string[];
};

function formatDecisionAnalysisNumber(value: number | string | null | undefined) {
  const numeric = numericReportMetricValue(value as number | string | null | undefined);
  if (numeric === null) return "-";
  return numeric.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDecisionAnalysisRate(value: number | string | null | undefined) {
  const numeric = numericReportMetricValue(value as number | string | null | undefined);
  if (numeric === null) return "-";
  const percent = Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
  return `${percent.toFixed(2)}%`;
}

function decisionNodeEvidenceText(value: {
  value?: number | string | null;
  score?: number | string | null;
  rate?: number | string | null;
  maxScore?: number | string | null;
  rateLabel?: string | null;
} | null | undefined, locale: Locale) {
  const isZh = locale === "zh";
  if (!value) return isZh ? "暂无数据" : "No data";
  const maxScore = numericReportMetricValue(value.maxScore as number | string | null | undefined);
  const parts = [
    value.score !== null && value.score !== undefined
      ? `${isZh ? "得分" : "Score"} ${formatDecisionAnalysisNumber(value.score)}${maxScore !== null ? ` / ${formatDecisionAnalysisNumber(maxScore)}` : ""}`
      : null,
    value.rate !== null && value.rate !== undefined
      ? `${value.rateLabel || (isZh ? "率值" : "Rate")} ${formatDecisionAnalysisRate(value.rate)}`
      : null,
    value.value !== null && value.value !== undefined
      ? `${isZh ? "当前值" : "Value"} ${formatDecisionAnalysisNumber(value.value)}`
      : null
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : (isZh ? "暂无数据" : "No data");
}

function AiLogisticsAnalysisReportPanel({
  report,
  locale = "zh"
}: {
  report: LogisticsAiAnalysisReport | null | undefined;
  locale?: Locale;
	}) {
		  const isZh = locale === "zh";
		  const resultGeneration = report?.result_generation;
		  const resultTopKpis = Array.isArray(resultGeneration?.top_3_kpis)
		    ? resultGeneration.top_3_kpis.slice(0, 3)
		    : Array.isArray(report?.top_3_kpis)
		      ? report.top_3_kpis.slice(0, 3)
		      : [];
		  const fallbackTopDrivers = Array.isArray(report?.top_3_drivers) ? report.top_3_drivers.slice(0, 3) : [];
		  const topDrivers = resultTopKpis.length
		    ? resultTopKpis.map((driver, index) => ({
		        rank: index + 1,
		        name: driver.name,
		        kpi_name: driver.name,
		        impact_score: driver.impact_score,
		        reason: driver.reason,
		        why: driver.reason,
		        priority: index === 0 ? "high" : index === 1 ? "medium" : "low",
		        impact_level: index === 0 ? "high" : index === 1 ? "medium" : "low",
		        evidence: [],
		        impact_chain: []
		      }))
		    : fallbackTopDrivers;
		  const primaryBottleneck = resultGeneration?.primary_bottleneck ?? report?.primary_bottleneck_result ?? null;
		  const causalChain = typeof resultGeneration?.causal_chain === "string"
		    ? resultGeneration.causal_chain
		    : typeof report?.causal_chain === "string" ? report.causal_chain : "";
		  const causalNodes = Array.isArray(report?.causal_chain_analysis?.chain_nodes)
		    ? report.causal_chain_analysis.chain_nodes
		    : [];
		  const decisionPlan = resultGeneration?.decision ?? report?.decision ?? report?.decision_plan ?? {};
		  const processAnalysis = report?.process_kpi_analysis;
		  const processKpis = Array.isArray(processAnalysis?.process_kpi_analysis)
		    ? processAnalysis.process_kpi_analysis.slice(0, 6)
		    : [];
		  const priorityLabels = {
    p0: isZh ? "P0 立即处理" : "P0 Immediate",
    p1: isZh ? "P1 流程改进" : "P1 Process",
    p2: isZh ? "P2 系统优化" : "P2 System"
  };

  if (!report) {
    return (
      <Card className="border bg-white shadow-sm">
        <CardContent className="p-5 text-sm text-muted-foreground">
          {isZh ? "暂无经营分析报告。请先生成报表后查看分析。" : "No analysis report yet. Generate a report first."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card className="border bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{isZh ? "决策优先级" : "Decision Priorities"}</CardTitle>
          <CardDescription>
            {isZh ? "只保留 Top 3 驱动、一条因果链和 P0/P1/P2 决策" : "Top 3 drivers, one causal chain, and P0/P1/P2 decisions only"}
          </CardDescription>
		        </CardHeader>
		        <CardContent className="grid gap-4">
		          <div className="grid gap-3 lg:grid-cols-3">
            {topDrivers.length ? topDrivers.map((driver, index) => (
              <div key={`${driver.kpi_name}-${index}`} className="rounded-xl border bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-muted-foreground">
                    Top {driver.rank ?? index + 1}
                  </span>
                  <span className={cn(
                    "rounded-full px-2 py-1 text-xs font-semibold",
                    (driver.priority ?? driver.impact_level) === "high" ? "bg-rose-50 text-rose-700" :
                      (driver.priority ?? driver.impact_level) === "medium" ? "bg-amber-50 text-amber-700" :
                        "bg-emerald-50 text-emerald-700"
                  )}>
                    {driver.priority ?? driver.impact_level ?? "low"}
                  </span>
                </div>
	                <p className="mt-3 text-base font-semibold text-slate-950">{driver.name || driver.kpi_name || "-"}</p>
	                {driver.impact_score !== null && driver.impact_score !== undefined ? (
	                  <p className="mt-1 text-xs font-semibold text-slate-500">
	                    {isZh ? "影响分" : "Impact"} {formatDecisionAnalysisNumber(driver.impact_score)}
	                  </p>
	                ) : null}
	                <div className="mt-3 grid gap-3 text-sm leading-6">
	                  {driver.reason || driver.why ? (
	                    <p className="rounded-lg bg-white px-2 py-1.5 text-xs font-medium leading-5 text-slate-700">
	                      {driver.reason || driver.why}
	                    </p>
	                  ) : null}
		                  {driver.evidence?.length ? (
		                    <div>
		                      <p className="text-xs font-semibold text-slate-500">{isZh ? "相关数据" : "Related Data"}</p>
	                      <div className="mt-2 grid gap-1.5">
	                        {driver.evidence.slice(0, 2).map((evidence, evidenceIndex) => (
	                          <div key={`${driver.kpi_name}-${evidence.kpi_name}-${evidenceIndex}`} className="grid gap-1 rounded-lg bg-white px-2 py-1.5 text-xs">
	                            <span className="font-medium text-slate-700">{evidence.kpi_name || driver.kpi_name || "-"}</span>
	                            <span className="font-semibold text-slate-950">
	                              {isZh ? "得分" : "Score"} {formatDecisionAnalysisNumber(evidence.score ?? evidence.value)}
	                              {evidence.maxScore !== null && evidence.maxScore !== undefined ? ` / ${formatDecisionAnalysisNumber(evidence.maxScore)}` : ""}
	                            </span>
	                          </div>
	                        ))}
	                      </div>
                    </div>
                  ) : null}
                  {driver.impact_chain?.length ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">{isZh ? "影响链" : "Impact Chain"}</p>
                      <p className="mt-1 rounded-lg bg-white px-2 py-1.5 text-xs font-semibold leading-5 text-slate-800">
                        {driver.impact_chain[0]}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            )) : (
              <div className="rounded-xl border bg-slate-50/70 p-4 text-sm text-muted-foreground lg:col-span-3">
                {isZh ? "暂无 Top 3 决策驱动。" : "No top decision drivers."}
              </div>
	            )}
	          </div>

	          {primaryBottleneck?.kpi ? (
	            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
	              <div className="flex flex-wrap items-start justify-between gap-3">
	                <div>
	                  <p className="text-sm font-semibold text-rose-950">{isZh ? "主瓶颈" : "Primary Bottleneck"}</p>
	                  <p className="mt-2 text-lg font-semibold text-slate-950">{primaryBottleneck.kpi}</p>
	                </div>
	                <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-rose-700">
	                  {isZh ? "P0 优先" : "P0"}
	                </span>
	              </div>
	              {primaryBottleneck.reason ? (
	                <p className="mt-3 text-sm leading-6 text-slate-700">{primaryBottleneck.reason}</p>
	              ) : null}
	              {primaryBottleneck.impact ? (
	                <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm leading-6 text-slate-700">{primaryBottleneck.impact}</p>
	              ) : null}
	            </div>
	          ) : null}

	          <div className="rounded-xl border bg-slate-950 p-4 text-white">
            <p className="text-sm font-semibold text-slate-200">{isZh ? "核心因果路径" : "Core Causal Path"}</p>
            <p className="mt-3 text-base font-semibold leading-7">
              {causalChain || (isZh ? "暂无可展示的决策链路。" : "No decision chain available.")}
            </p>
            {causalNodes.length ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {causalNodes.map((node, index) => (
                  <div key={`${node.stage}-${node.kpi_name}-${index}`} className="rounded-xl border border-white/10 bg-white p-3 text-slate-950">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold leading-5">{node.stage || "-"}</p>
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">{node.kpi_name || (isZh ? "未匹配到指标" : "No matched KPI")}</p>
                      </div>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-1 text-xs font-semibold",
                        node.status === "valid" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {node.status === "valid" ? (isZh ? "有数据" : "valid") : (isZh ? "缺失" : "missing")}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-medium leading-6 text-slate-700">
                      {decisionNodeEvidenceText(node, locale)}
                    </p>
                    {node.calculationBreakdown ? (
                      <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                          {isZh ? "查看计算过程" : "View calculation"}
                        </summary>
	                        <div className="mt-2 rounded-md bg-white p-2 font-mono text-xs leading-6 text-slate-800">
	                          <p>{node.calculationBreakdown.title || node.kpi_name || "-"}</p>
	                          <p>= {node.calculationBreakdown.expression || "-"}</p>
	                          <p>{node.calculationBreakdown.valueText || `= ${node.calculationBreakdown.components?.map((component) => formatDecisionAnalysisNumber(component.score)).join(" + ") || "-"}`}</p>
	                          <p>{node.calculationBreakdown.resultText || `= ${formatDecisionAnalysisNumber(node.calculationBreakdown.finalScore)}`}</p>
	                        </div>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
	            ) : null}
	          </div>

	          <div className="grid gap-3 lg:grid-cols-3">
	            {(["p0", "p1", "p2"] as const).map((priority) => {
              const actions = Array.isArray(decisionPlan[priority]) ? decisionPlan[priority]!.slice(0, 2) : [];
              return (
                <div key={priority} className="rounded-xl border bg-white p-4">
                  <p className="font-semibold text-slate-950">{priorityLabels[priority]}</p>
                  <div className="mt-3 grid gap-2">
                    {actions.length ? actions.map((action) => (
                      <p key={action} className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-muted-foreground">
                        {action}
                      </p>
                    )) : (
                      <p className="rounded-lg bg-slate-50 p-3 text-sm text-muted-foreground">
                        {isZh ? "暂无决策动作。" : "No decision action."}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

	          {report.key_insight ? (
	            <div className="rounded-xl border border-emerald-100 bg-emerald-50/55 p-4">
	              <p className="text-sm font-semibold text-emerald-950">{isZh ? "关键洞察" : "Key Insight"}</p>
	              <p className="mt-2 text-sm leading-6 text-emerald-900">{report.key_insight}</p>
	            </div>
	          ) : null}

		        </CardContent>
      </Card>

      {processAnalysis ? (
        <Card className="border bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{isZh ? "过程 KPI 执行健康" : "Process KPI Health"}</CardTitle>
            <CardDescription>
              {isZh ? "只分析执行过程层 KPI，不混入驱动或结果指标" : "Process KPIs only, separated from decisions"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
	            <div className="rounded-xl border bg-white p-4">
	              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
	                <div>
	                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
	                    {processAnalysis.process_health_summary || (isZh ? "只分析执行过程层 KPI，不混入驱动或结果指标。" : "Process KPIs only.")}
	                  </p>
	                </div>
	                {processAnalysis.bottleneck?.kpi_name ? (
	                  <span className="w-fit rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
	                    {isZh ? "过程瓶颈" : "Bottleneck"} · {processAnalysis.bottleneck.kpi_name}
	                  </span>
	                ) : null}
	              </div>

	              {Array.isArray(processAnalysis.process_flow) && processAnalysis.process_flow.length ? (
	                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-700">
	                  {processAnalysis.process_flow.join(" → ")}
	                </div>
	              ) : null}

	              {processKpis.length ? (
	                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
	                  {processKpis.map((kpi) => {
	                    const level = kpi.performance_level || "medium";
	                    const stageLabel = kpi.stage === "upstream"
	                      ? (isZh ? "前置" : "Upstream")
	                      : kpi.stage === "midstream"
	                        ? (isZh ? "中段" : "Midstream")
	                        : (isZh ? "末端" : "Downstream");
	                    return (
	                      <div key={`${kpi.group_name}-${kpi.kpi_name}`} className="rounded-xl border bg-slate-50/70 p-3">
	                        <div className="flex items-start justify-between gap-2">
	                          <div className="min-w-0">
	                            <p className="font-semibold leading-5 text-slate-950">{kpi.kpi_name || "-"}</p>
	                            <p className="mt-1 text-xs font-semibold text-slate-500">{stageLabel}</p>
	                          </div>
	                          <span className={cn(
	                            "shrink-0 rounded-full px-2 py-1 text-xs font-semibold",
	                            level === "weak" ? "bg-rose-50 text-rose-700" :
	                              level === "strong" ? "bg-emerald-50 text-emerald-700" :
	                                "bg-amber-50 text-amber-700"
	                          )}>
	                            {level}
	                          </span>
	                        </div>
	                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
	                          <div className="rounded-lg bg-white p-2">
	                            <p className="text-muted-foreground">{isZh ? "得分" : "Score"}</p>
	                            <p className="mt-1 font-semibold text-slate-950">
	                              {formatDecisionAnalysisNumber(kpi.score)}
	                              {kpi.max_score !== null && kpi.max_score !== undefined ? ` / ${formatDecisionAnalysisNumber(kpi.max_score)}` : ""}
	                            </p>
	                          </div>
	                          <div className="rounded-lg bg-white p-2">
	                            <p className="text-muted-foreground">{isZh ? "率值" : "Rate"}</p>
	                            <p className="mt-1 font-semibold text-slate-950">{formatDecisionAnalysisRate(kpi.rate)}</p>
	                          </div>
	                        </div>
	                        {kpi.interpretation ? (
	                          <p className="mt-3 text-xs leading-5 text-muted-foreground">{kpi.interpretation}</p>
	                        ) : null}
	                      </div>
	                    );
	                  })}
	                </div>
	              ) : null}

	              {processAnalysis.bottleneck?.reason || processAnalysis.bottleneck?.system_impact ? (
	                <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/45 p-3 text-sm leading-6 text-amber-950">
	                  {processAnalysis.bottleneck.reason ? <p>{processAnalysis.bottleneck.reason}</p> : null}
	                  {processAnalysis.bottleneck.system_impact ? <p className="mt-1">{processAnalysis.bottleneck.system_impact}</p> : null}
	                </div>
	              ) : null}

	              {Array.isArray(processAnalysis.causal_propagation) && processAnalysis.causal_propagation.length ? (
	                <div className="mt-4 grid gap-2">
	                  {processAnalysis.causal_propagation.slice(0, 3).map((item, index) => (
	                    <p key={`${item.chain}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium leading-6 text-slate-700">
	                      {item.chain}
	                    </p>
	                  ))}
	                </div>
	              ) : null}
	            </div>
          </CardContent>
        </Card>
      ) : null}

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
	      reportDataAudit?: {
	        totalRows?: number | null;
	        expectedFullRows?: number | null;
	        dailyRows?: number | null;
	        rowsUsedForMetrics?: number | null;
	        dateField?: string | null;
	        latestDataDate?: string | null;
	      } | null;
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
	  const reportDataAudit = briefing.payloadJson?.reportDataAudit;
	  const totalSourceRows = reportDataAudit?.totalRows ?? reportDataAudit?.expectedFullRows ?? null;
	  const dailyAnalysisRows = reportDataAudit?.dailyRows ?? reportDataAudit?.rowsUsedForMetrics ?? null;
	  const dateFilterText = reportDataAudit?.dateField
	    ? `${reportDataAudit.dateField}${reportDataAudit.latestDataDate ? ` = ${reportDataAudit.latestDataDate}` : ""}`
	    : null;

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
	          <CardContent className="grid gap-3 p-4 text-sm text-amber-900">
	            <p>{failedResults.length} 个指标计算失败，已从本次报告中排除</p>
	            {reportDataAudit ? (
	              <div className="grid gap-2 rounded-lg border border-amber-200/80 bg-white/65 p-3 text-xs leading-5 text-amber-950 sm:grid-cols-3">
	                <p>
	                  <span className="font-semibold">数据源总行数</span>
	                  <span className="ml-2">{totalSourceRows ?? "未知"}</span>
	                </p>
	                <p>
	                  <span className="font-semibold">日报分析行数</span>
	                  <span className="ml-2">{dailyAnalysisRows ?? "未知"}</span>
	                </p>
	                <p>
	                  <span className="font-semibold">日期过滤</span>
	                  <span className="ml-2">{dateFilterText ?? "未识别"}</span>
	                </p>
	              </div>
	            ) : null}
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

const officialProblemTicketMetrics = {
  primary: [
    { id: "ticket_denominator_count", label: "工单分母数", aliases: ["ticket_denominator_count", "工单分母数"] },
    { id: "unresolved_ticket_count", label: "一次性未解决工单数", aliases: ["unresolved_ticket_count", "一次性未解决工单数"] },
    { id: "first_contact_resolution_rate", label: "一次性解决率", aliases: ["first_contact_resolution_rate", "一次性解决率"] },
    { id: "unresolved_ticket_rate", label: "一次性未解决率", aliases: ["unresolved_ticket_rate", "一次性未解决率"] }
  ],
  secondary: [
    { id: "unresolved_ticket_count_by_ticket_type", label: "按工单类型未解决数", aliases: ["unresolved_ticket_count_by_ticket_type", "按工单类型未解决数"] },
    { id: "unresolved_ticket_rate_by_ticket_type", label: "按工单类型未解决率", aliases: ["unresolved_ticket_rate_by_ticket_type", "按工单类型未解决率"] },
    { id: "unresolved_ticket_count_by_branch", label: "按责任网点未解决数", aliases: ["unresolved_ticket_count_by_branch", "按责任网点未解决数"] },
    { id: "unresolved_ticket_rate_by_branch", label: "按责任网点未解决率", aliases: ["unresolved_ticket_rate_by_branch", "按责任网点未解决率"] },
    { id: "urge_order_count", label: "催单数", aliases: ["urge_order_count", "催单数"] },
    { id: "followup_unresolved_count", label: "回访未解决数", aliases: ["followup_unresolved_count", "回访未解决数"] },
    { id: "second_ticket_count", label: "二次工单数", aliases: ["second_ticket_count", "二次工单数"] },
    { id: "repeat_contact_count", label: "重复进线数", aliases: ["repeat_contact_count", "重复进线数"] },
    { id: "unresolved_reason_count", label: "按未解决原因统计", aliases: ["unresolved_reason_count", "按未解决原因统计"] }
  ]
};

type OfficialProblemTicketMetric = {
  id: string;
  label: string;
  aliases: string[];
};

type SemanticProblemTicketMetric = {
  id: string;
  label: string;
  maxScore: number;
  score: ReportMetricEvidenceResult | null;
  rate: ReportMetricEvidenceResult | null;
};

function compactOfficialMetricText(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, "").replace(/[()（）/_-]/g, "");
}

function officialMetricValue(result: ReportMetricEvidenceResult | null | undefined) {
  if (!result) return null;
  return numericReportMetricValue(result.currentValue ?? result.value);
}

function formatOfficialMetricPercentChange(value: number) {
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent > 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function officialMetricName(result: ReportMetricEvidenceResult) {
  return result.kpiName || result.displayName || result.metricName || result.metricId;
}

function formatOfficialMetricValue(result: ReportMetricEvidenceResult | null | undefined) {
  const value = officialMetricValue(result);
  if (value == null) return "-";
  const name = compactOfficialMetricText(officialMetricName(result!));
  if (name.includes("得分") || name.includes("总分") || name.includes("score")) {
    return formatReportMetricValue(value);
  }
  if (result?.unit === "percent" || name.includes("率值") || name.endsWith("率") || name.includes("rate")) {
    const percent = Math.abs(value) <= 1 ? value * 100 : value;
    return `${percent.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
  }
  return formatReportMetricValue(value);
}

function formatMaxScoreValue(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function findOfficialMetricResult(metricResults: ReportMetricEvidenceResult[], metric: OfficialProblemTicketMetric) {
  const targets = new Set(metric.aliases.map(compactOfficialMetricText));

  return metricResults.find((result) => {
    if (result.status !== "computed") return false;
    const haystack = [
      result.metricId,
      result.kpiId,
      result.metricName,
      result.kpiName,
      result.displayName
    ].map(compactOfficialMetricText);

    return haystack.some((item) => targets.has(item));
  }) ?? null;
}

function findExactMetricResult(metricResults: ReportMetricEvidenceResult[], aliases: string[]) {
  const targets = new Set(aliases.map(compactOfficialMetricText));
  return metricResults.find((result) => {
    if (result.status !== "computed") return false;
    return [
      result.metricId,
      result.kpiId,
      result.metricName,
      result.kpiName,
      result.displayName
    ].map(compactOfficialMetricText).some((item) => targets.has(item));
  }) ?? null;
}

function findSemanticProblemTicketResult(
  metricResults: ReportMetricEvidenceResult[],
  driverName: string,
  valueKind: "score" | "rate"
) {
  const driver = compactOfficialMetricText(driverName);
  const kind = valueKind === "score" ? "得分" : "率值";
  return metricResults.find((result) => {
    if (result.status !== "computed") return false;
    const haystack = [
      result.metricId,
      result.kpiId,
      result.metricName,
      result.kpiName,
      result.displayName
    ].map(compactOfficialMetricText);
    return haystack.some((item) => {
      return item.includes("工单一次性解决率") && item.includes(driver) && item.includes(kind);
    });
  }) ?? null;
}

function findSemanticProblemResolutionResult(
  metricResults: ReportMetricEvidenceResult[],
  driverName: string,
  valueKind: "score" | "rate"
) {
  const driver = compactOfficialMetricText(driverName);
  const kind = valueKind === "score" ? "得分" : "率值";
  return metricResults.find((result) => {
    if (result.status !== "computed") return false;
    const haystack = [
      result.metricId,
      result.kpiId,
      result.metricName,
      result.kpiName,
      result.displayName
    ].map(compactOfficialMetricText);
    return haystack.some((item) => item.includes(driver) && item.includes(kind));
  }) ?? null;
}

function buildSemanticProblemTicketMetrics(metricResults: ReportMetricEvidenceResult[]) {
  const primary = [
    {
      id: "problem_resolution_total_score",
      label: "问题解决率总得分",
      maxScore: 30,
      result: findExactMetricResult(metricResults, ["问题解决率总得分", "problem_resolution_total_score"])
    }
  ].filter((item) => item.result);

  const secondarySummary = [
    {
      id: "first_contact_resolution_total_score",
      label: "工单一次性解决率总分",
      maxScore: 25,
      result: findExactMetricResult(metricResults, ["工单一次性解决率总分", "工单一次性解决率 总分"])
    }
  ].filter((item) => item.result);

  const secondaryLeaf: SemanticProblemTicketMetric[] = [
    {
      id: "network_contact_rate",
      label: "网点接通率",
      maxScore: 5,
      score: findSemanticProblemResolutionResult(metricResults, "网点接通率", "score"),
      rate: findSemanticProblemResolutionResult(metricResults, "网点接通率", "rate")
    }
  ].filter((item) => item.score || item.rate);

  const tertiaryDefinitions = [
    { label: "客户求助", maxScore: 13 },
    { label: "网点查件", maxScore: 7 },
    { label: "预警工单", maxScore: 5 }
  ];
  const tertiary: SemanticProblemTicketMetric[] = tertiaryDefinitions.map((definition) => ({
    id: compactOfficialMetricText(definition.label),
    label: definition.label,
    maxScore: definition.maxScore,
    score: findSemanticProblemTicketResult(metricResults, definition.label, "score"),
    rate: findSemanticProblemTicketResult(metricResults, definition.label, "rate")
  })).filter((item) => item.score || item.rate);

  return { primary, secondarySummary, secondaryLeaf, tertiary };
}

function OfficialLogisticsRegistryPanel({
  metricResults,
  locale
}: {
  metricResults: ReportMetricEvidenceResult[];
  locale: Locale;
}) {
  const isZh = locale === "zh";
  const [expandedSummaryId, setExpandedSummaryId] = useState<string | null>(null);
  const [expandedDriverId, setExpandedDriverId] = useState<string | null>(null);
  const registryPrimary = officialProblemTicketMetrics.primary.map((metric) => ({
    metric,
    result: findOfficialMetricResult(metricResults, metric)
  }));
  const registrySecondary = officialProblemTicketMetrics.secondary.map((metric) => ({
    metric,
    result: findOfficialMetricResult(metricResults, metric)
  }));
  const hasRegistryData = [...registryPrimary, ...registrySecondary].some((item) => item.result);
  const semanticMetrics = buildSemanticProblemTicketMetrics(metricResults);
  const semanticFormulaBreakdowns = useMemo(() => {
    const entries = [
      ["problem_resolution_total_score", "problem_resolution_total"],
      ["first_contact_resolution_total_score", "first_resolution_total"]
    ].map(([metricId, formulaId]) => {
      const spec = logisticsFormulaSpecs.find((item) => item.id === formulaId);
      return spec ? [metricId, buildFormulaBreakdown(spec, metricResults)] as const : null;
    }).filter((item): item is readonly [string, FormulaBreakdown] => Boolean(item));

    return new Map(entries);
  }, [metricResults]);

  const renderMetric = (metric: OfficialProblemTicketMetric) => {
    const result = findOfficialMetricResult(metricResults, metric);
    const percentChange = result?.percentChange ?? result?.changePercent ?? null;
    const rows = Array.isArray(result?.rows) ? result.rows : [];

    return (
      <div key={metric.id} className="rounded-xl border bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">{metric.label}</p>
            {result ? (
              <p className="mt-1 text-xs text-muted-foreground">{officialMetricName(result)}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">{isZh ? "当前未生成该官方指标" : "Not generated in current report"}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-slate-950">{formatOfficialMetricValue(result)}</p>
            {typeof percentChange === "number" ? (
              <p className={cn("mt-1 text-xs font-semibold", percentChange > 0 ? "text-rose-600" : percentChange < 0 ? "text-emerald-700" : "text-muted-foreground")}>
                {formatOfficialMetricPercentChange(percentChange)}
              </p>
            ) : null}
          </div>
        </div>
        {rows.length ? (
          <div className="mt-3 grid gap-2">
            {rows.slice(0, 3).map((row) => (
              <div key={`${metric.id}-${row.dimension}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                <span className="truncate text-muted-foreground">{row.dimension}</span>
                <span className="font-semibold tabular-nums">{formatReportMetricValue(row.value)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  const renderSemanticSummaryMetric = (item: { id: string; label: string; maxScore: number; result: ReportMetricEvidenceResult | null }) => {
    const isExpanded = expandedSummaryId === item.id;
    const scoreValue = officialMetricValue(item.result);
    const scoreRate = scoreValue == null ? null : scoreValue / item.maxScore;
    const formulaBreakdown = semanticFormulaBreakdowns.get(item.id);

    return (
      <div key={item.id} className="rounded-xl border bg-white p-3 shadow-sm">
        <button
          type="button"
          className="grid w-full gap-3 text-left"
          onClick={() => setExpandedSummaryId((current) => current === item.id ? null : item.id)}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">{item.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.result ? officialMetricName(item.result) : (isZh ? "当前未生成该指标" : "Not generated")}</p>
            </div>
            <p className="text-lg font-semibold tabular-nums text-slate-950">{formatOfficialMetricValue(item.result)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
            <p className="font-semibold tabular-nums text-slate-950">
              {isZh ? `满分：${formatMaxScoreValue(item.maxScore)}` : `Max score: ${formatMaxScoreValue(item.maxScore)}`}
            </p>
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            {isExpanded
              ? (isZh ? "收起公式拆解" : "Hide formula breakdown")
              : (isZh ? "点击查看公式拆解" : "Click to view formula breakdown")}
          </p>
        </button>
        {isExpanded ? (
          <div className="mt-3 rounded-xl border bg-slate-50/70 p-3">
            <p className="text-sm font-semibold text-slate-950">{isZh ? "计算拆解" : "Formula Breakdown"}</p>
            {formulaBreakdown ? (
              <div className="mt-3 rounded-lg bg-white px-3 py-2 font-mono text-xs leading-6 text-slate-800">
                <p>{formulaBreakdown.title}</p>
                <p>= {formulaBreakdown.components.map((component) => component.name).join(" + ")}</p>
                <p>= {formulaBreakdown.components.map((component) => formulaScoreText(component.score)).join(" + ")}</p>
                <p>= {formulaScoreText(formulaBreakdown.finalScore)}</p>
              </div>
            ) : (
              <div className="mt-3 rounded-lg bg-white px-3 py-2 text-xs leading-6 text-slate-800">
                <p>{item.label}</p>
                <p>{isZh ? "得分" : "Score"}：{scoreValue == null ? "-" : formatReportMetricValue(scoreValue)}</p>
                <p>{isZh ? "满分" : "Max score"}：{formatMaxScoreValue(item.maxScore)}</p>
                <p>{isZh ? "得分率" : "Score rate"}：{scoreRate == null ? "-" : `${(scoreRate * 100).toFixed(2)}%`}</p>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {isZh ? "得分来源" : "Score source"}：{item.result ? officialMetricName(item.result) : "-"}
            </p>
          </div>
        ) : null}
      </div>
    );
  };

  const renderSemanticDriverMetric = (item: SemanticProblemTicketMetric) => {
    const isExpanded = expandedDriverId === item.id;
    const scoreValue = officialMetricValue(item.score);
    const rateValue = officialMetricValue(item.rate);

    return (
      <div key={item.id} className="rounded-xl border bg-white p-3 shadow-sm">
        <button
          type="button"
          className="grid w-full gap-3 text-left"
          onClick={() => setExpandedDriverId((current) => current === item.id ? null : item.id)}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">{item.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.rate ? `${isZh ? "率值" : "Rate"} ${formatOfficialMetricValue(item.rate)}` : (isZh ? "当前未生成率值" : "Rate not generated")}
              </p>
            </div>
            <p className="text-lg font-semibold tabular-nums text-slate-950">{formatOfficialMetricValue(item.score)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
            <p className="font-semibold tabular-nums text-slate-950">
              {isZh ? `满分：${formatMaxScoreValue(item.maxScore)}` : `Max score: ${formatMaxScoreValue(item.maxScore)}`}
            </p>
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            {isExpanded
              ? (isZh ? "收起公式拆解" : "Hide formula breakdown")
              : (isZh ? "点击查看公式拆解" : "Click to view formula breakdown")}
          </p>
        </button>
        {isExpanded ? (
          <div className="mt-3 rounded-xl border bg-slate-50/70 p-3">
            <p className="text-sm font-semibold text-slate-950">{isZh ? "公式计算拆解" : "Formula Breakdown"}</p>
            <div className="mt-3 rounded-lg bg-white px-3 py-2 font-mono text-xs leading-6 text-slate-800">
              <p>{item.label}{isZh ? "得分" : " score"}</p>
              <p>= {item.score ? officialMetricName(item.score) : `${item.label}${isZh ? "得分" : " score"}`}</p>
              <p>= {scoreValue == null ? "缺失" : formatReportMetricValue(scoreValue)}</p>
              <p>{isZh ? "满分" : "Max score"} = {formatMaxScoreValue(item.maxScore)}</p>
              <p>{item.label}{isZh ? "率值" : " rate"}</p>
              <p>= {item.rate ? officialMetricName(item.rate) : `${item.label}${isZh ? "率值" : " rate"}`}</p>
              <p>= {rateValue == null ? "缺失" : formatOfficialMetricValue(item.rate)}</p>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
              <p>{isZh ? "得分来源" : "Score source"}：{item.score ? officialMetricName(item.score) : "-"}</p>
              <p>{isZh ? "率值来源" : "Rate source"}：{item.rate ? officialMetricName(item.rate) : "-"}</p>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <Card className="border bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{isZh ? "问题解决 / 工单指标" : "Problem Resolution / Ticket Metrics"}</CardTitle>
        {hasRegistryData ? (
          <CardDescription>
            {isZh
              ? "来自 business_metric_registry，优先展示一级指标和二级拆解。"
              : "From business_metric_registry, with primary metrics and drill-down metrics first."}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {hasRegistryData ? (
          <>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{isZh ? "一级指标" : "Primary Metrics"}</p>
                <Badge variant="secondary">{officialProblemTicketMetrics.primary.length} KPI</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {officialProblemTicketMetrics.primary.map(renderMetric)}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{isZh ? "二级拆解" : "Drill-down Metrics"}</p>
                <Badge variant="secondary">{officialProblemTicketMetrics.secondary.length} KPI</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {officialProblemTicketMetrics.secondary.map(renderMetric)}
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{isZh ? "一级指标" : "Primary Metrics"}</p>
                <Badge variant="secondary">{semanticMetrics.primary.length} KPI</Badge>
              </div>
              {semanticMetrics.primary.length ? (
                <div className="grid gap-3">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {semanticMetrics.primary.map(renderSemanticSummaryMetric)}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border bg-slate-50 p-3 text-sm text-muted-foreground">{isZh ? "当前没有可展示的问题解决一级指标。" : "No problem-resolution primary metrics are available."}</p>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{isZh ? "二级拆解" : "Drill-down Metrics"}</p>
                <Badge variant="secondary">{semanticMetrics.secondaryLeaf.length + semanticMetrics.secondarySummary.length} KPI</Badge>
              </div>
              {semanticMetrics.secondaryLeaf.length || semanticMetrics.secondarySummary.length ? (
                <div className="grid gap-3">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {semanticMetrics.secondaryLeaf.map(renderSemanticDriverMetric)}
                    {semanticMetrics.secondarySummary.map(renderSemanticSummaryMetric)}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border bg-slate-50 p-3 text-sm text-muted-foreground">{isZh ? "当前没有可展示的问题解决二级拆解。" : "No problem-resolution drill-down metrics are available."}</p>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{isZh ? "三级拆解" : "Level 3 Breakdown"}</p>
                <Badge variant="secondary">{semanticMetrics.tertiary.length} KPI</Badge>
              </div>
              {semanticMetrics.tertiary.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {semanticMetrics.tertiary.map(renderSemanticDriverMetric)}
                </div>
              ) : (
                <p className="rounded-xl border bg-slate-50 p-3 text-sm text-muted-foreground">{isZh ? "当前没有可展示的问题解决三级拆解。" : "No problem-resolution level 3 breakdown is available."}</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
  const isZh = locale === "zh";
  type AnalysisReportData = {
    reportRunId?: string | null;
    primaryDataSourceId?: string | null;
    dataSourceIds?: string[];
    reportMode?: string;
    sourceSnapshotVersion?: number | null;
    reportRun?: Record<string, unknown> | null;
    reportScope?: Record<string, unknown> | null;
    hasConnectedDataSource?: boolean;
    status?: string;
    code?: string;
    reportEntitlement?: ReportEntitlementViewData;
    briefing?: {
      createdAt?: string;
	      payloadJson?: {
	        generatedAt?: string;
	        aiReport?: LogisticsAiAnalysisReport;
	        metricResults?: ReportMetricEvidenceResult[];
	        timeConfig?: ReportTimeConfigViewData;
	        cache?: {
	          status?: "hit" | "miss" | "stale";
	          cacheKey?: string;
	          generatedAt?: string;
	          staleAt?: string | null;
	        };
	        reportDataAudit?: ReportAvailableDateRange & {
	          dateRangeStart?: string | null;
	          dateRangeEnd?: string | null;
	        };
	      } | null;
	    } | null;
	    reportHistory?: Array<Record<string, unknown>>;
	    availableDateRange?: ReportAvailableDateRange | null;
	  };
	  const [reportData, setReportData] = useState<AnalysisReportData | null>(() => analysisReportsPageDataCache as AnalysisReportData | null);
	  const [isLoading, setIsLoading] = useState(() => !analysisReportsPageDataCache);
	  const [isGenerating, setIsGenerating] = useState(false);
	  const [statusMessage, setStatusMessage] = useState<string | null>(null);
	  const [selectedAnalysisDateRange, setSelectedAnalysisDateRange] = useState<SelectedReportDateRange>({ preset: "ALL" });
  const [analysisDecisionReportPayload, setAnalysisDecisionReportPayload] = useState<{
    ok?: boolean;
    state?: "ready" | "empty" | "unavailable";
    message?: string;
    hasConnectedDataSource?: boolean;
    decision_report?: DecisionIntelligenceReportV1 | null;
    optimizationRun?: {
      completed_at?: string | null;
      started_at?: string | null;
      policy_version?: string | null;
      analyzed_sku_count?: number | null;
    } | null;
  } | null>(null);
  const [isLoadingAnalysisDecisionReport, setIsLoadingAnalysisDecisionReport] = useState(() => hasConnectedDatabase);
  const [hasStartedProfitOptimization, setHasStartedProfitOptimization] = useState(false);
  const [isRunningProfitOptimization, setIsRunningProfitOptimization] = useState(false);
  const [profitOptimizationRunStatus, setProfitOptimizationRunStatus] = useState<ProfitOptimizationJobStatus | "IDLE">("IDLE");
  const [profitOptimizationRunStep, setProfitOptimizationRunStep] = useState<string | null>(null);
  const analysisDecisionReportRequestRef = useRef(0);
  const reportApiHasConnectedDatabase = reportData?.hasConnectedDataSource === true;
  const decisionApiHasConnectedDatabase = analysisDecisionReportPayload?.hasConnectedDataSource === true || Boolean(analysisDecisionReportPayload?.decision_report);
  const effectiveHasConnectedDatabase = hasConnectedDatabase || reportApiHasConnectedDatabase || decisionApiHasConnectedDatabase;

	  useEffect(() => {
	    if (effectiveHasConnectedDatabase || reportData === null) return;
	    analysisReportsPageDataCache = null;
	    setReportData(null);
    setAnalysisDecisionReportPayload(null);
	    setIsLoading(false);
    setIsLoadingAnalysisDecisionReport(false);
    setHasStartedProfitOptimization(false);
    setIsRunningProfitOptimization(false);
    setProfitOptimizationRunStatus("IDLE");
    setProfitOptimizationRunStep(null);
	    setIsGenerating(false);
	    setStatusMessage(null);
	  }, [effectiveHasConnectedDatabase, reportData]);

	  const loadAnalysisReport = useCallback(async (dateRange: SelectedReportDateRange = selectedAnalysisDateRange) => {
	    setIsLoading(true);
	    try {
	      const { response, payload } = await fetchReportJson<AnalysisReportData>(
          `/api/dashboard/reports?${reportDateRangeQuery(dateRange)}&reportMode=${analysisReportModeForRange(dateRange.preset)}`,
          { cache: "no-store" },
          isZh
            ? "无法连接到 Monarca 报表服务，请刷新页面后重试。"
            : "Could not reach the Monarca report service. Refresh the page and try again."
        );
	      if (response.ok) {
	        analysisReportsPageDataCache = payload;
	        setReportData(payload);
      }
	      return payload;
	    } catch (error) {
	      setStatusMessage(error instanceof Error ? error.message : (isZh ? "报表加载失败" : "Failed to load report"));
	      return null;
	    } finally {
	      setIsLoading(false);
	    }
	  }, [isZh, selectedAnalysisDateRange]);

  useEffect(() => {
    void loadAnalysisReport();
  }, [loadAnalysisReport]);

  const loadAnalysisDecisionReport = useCallback(async (mode: "sku" | "full" = "sku") => {
    const requestId = analysisDecisionReportRequestRef.current + 1;
    analysisDecisionReportRequestRef.current = requestId;
    setIsLoadingAnalysisDecisionReport(true);
    try {
      const modeQuery = mode === "sku" ? "mode=sku&" : "";
      const { response, payload } = await fetchReportJson<typeof analysisDecisionReportPayload>(
        `/api/dashboard/ecommerce/decision-report?${modeQuery}_=${Date.now()}`,
        { cache: "no-store" },
        isZh
          ? "无法连接到 Monarca 优化服务，请刷新页面后重试。"
          : "Could not reach the Monarca optimization service. Refresh the page and try again."
      );
      if (response.ok && payload?.ok) {
        if (analysisDecisionReportRequestRef.current === requestId) {
          setAnalysisDecisionReportPayload(payload);
          if (payload.decision_report || payload.optimizationRun?.completed_at) {
            setHasStartedProfitOptimization(true);
          }
        }
      }
      return payload;
    } catch (error) {
      if (analysisDecisionReportRequestRef.current === requestId) {
        setAnalysisDecisionReportPayload({
          ok: false,
          state: "unavailable",
          message: error instanceof Error ? error.message : (isZh ? "优化报表加载失败" : "Failed to load optimization report"),
          decision_report: null
        });
      }
      return null;
    } finally {
      if (analysisDecisionReportRequestRef.current === requestId) {
        setIsLoadingAnalysisDecisionReport(false);
      }
    }
  }, [isZh]);

  useEffect(() => {
    if (!effectiveHasConnectedDatabase) return;
    void loadAnalysisDecisionReport("full");
  }, [effectiveHasConnectedDatabase, loadAnalysisDecisionReport]);

  const startProfitOptimization = useCallback(async () => {
    setStatusMessage(null);
    setHasStartedProfitOptimization(true);
    setIsRunningProfitOptimization(true);
    setProfitOptimizationRunStatus("QUEUED");
    setProfitOptimizationRunStep(profitOptimizationStatusMessage("QUEUED", null, isZh));
    try {
      const { response, payload } = await fetchReportJson<ProfitOptimizationJobPayload>(
        "/api/dashboard/ecommerce/optimize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userRequested: true })
        },
        isZh
          ? "优化任务没有到达 Monarca 服务，请刷新页面后重试。"
          : "The optimization request did not reach Monarca. Refresh the page and try again."
      );

      if (!response.ok || !payload?.ok || !payload.jobId) {
        throw new Error(payload?.message || (isZh ? "创建优化任务失败" : "Failed to create optimization job"));
      }

      setProfitOptimizationRunStatus(payload.status ?? "QUEUED");
      setProfitOptimizationRunStep(profitOptimizationStatusMessage(payload.status, payload.currentStep, isZh));

      const completedJob = await waitForProfitOptimizationJob(payload.jobId, {
        isZh,
        onStatus: (job) => {
          setProfitOptimizationRunStatus(job.status);
          setProfitOptimizationRunStep(profitOptimizationStatusMessage(job.status, job.currentStep, isZh));
        }
      });

      if (completedJob.status !== "COMPLETED") {
        throw new Error(completedJob.errorMessage || (isZh ? "优化任务未完成" : "Optimization job did not complete"));
      }

      setProfitOptimizationRunStatus("COMPLETED");
      setProfitOptimizationRunStep(profitOptimizationStatusMessage("COMPLETED", completedJob.currentStep, isZh));
      const completedSnapshotId = optimizationJobSnapshotId(completedJob);
      let latestReport = await loadAnalysisDecisionReport("full");
      for (
        let attempt = 0;
        attempt < 8 && (completedSnapshotId
          ? optimizationDecisionReportSnapshotId(latestReport) !== completedSnapshotId
          : optimizationDecisionReportRunId(latestReport) !== completedJob.id);
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, attempt < 2 ? 750 : 1500));
        latestReport = await loadAnalysisDecisionReport("full");
      }
      if (!latestReport?.ok) {
        throw new Error(latestReport?.message || (isZh ? "优化完成，但最新决策报表刷新失败" : "Optimization completed, but the latest decision report could not be refreshed"));
      }
      const latestReportMatchesJob = completedSnapshotId
        ? optimizationDecisionReportSnapshotId(latestReport) === completedSnapshotId
        : optimizationDecisionReportRunId(latestReport) === completedJob.id;
      if (!latestReportMatchesJob) {
        throw new Error(isZh
          ? "优化已完成，但页面尚未读到本次优化生成的最新报表，请稍后刷新。"
          : "Optimization completed, but the latest report for this run is not available yet. Refresh shortly.");
      }
      setStatusMessage(isZh ? "利润优化已完成，推荐已刷新。" : "Profit optimization completed and recommendations refreshed.");
    } catch (error) {
      setProfitOptimizationRunStatus("FAILED");
      setProfitOptimizationRunStep(error instanceof Error ? error.message : (isZh ? "优化运行失败" : "Optimization failed"));
      setStatusMessage(error instanceof Error ? error.message : (isZh ? "优化运行失败" : "Optimization failed"));
    } finally {
      setIsRunningProfitOptimization(false);
    }
  }, [isZh, loadAnalysisDecisionReport]);

	  const generateAnalysisReport = useCallback(async (dateRange: SelectedReportDateRange = selectedAnalysisDateRange) => {
	    setIsGenerating(true);
	    setStatusMessage(null);
	    const requestedAt = Date.now();
	    try {
      const { response, payload } = await fetchReportJson<{ ok?: boolean; async?: boolean; message?: string; generatedAt?: string }>(
        "/api/dashboard/reports/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locale,
            userRequested: true,
            reportMode: analysisReportModeForRange(dateRange.preset),
            dateRange,
            idempotencyKey: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
          })
        },
        isZh
          ? "生成请求没有到达 Monarca 服务，请刷新页面后重试。"
          : "The generate request did not reach the Monarca service. Refresh the page and try again."
      );

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || (isZh ? "生成报告失败" : "Failed to generate report"));
      }

	      if (payload.async) {
	        setStatusMessage(isZh ? "报告正在后台生成，完成后会自动刷新。" : "Report is generating in the background and will refresh automatically.");
	        for (let attempt = 0; attempt < 30; attempt += 1) {
	          await new Promise((resolve) => setTimeout(resolve, 3000));
	          const latest = await loadAnalysisReport(dateRange);
	          const generatedAt = latest?.briefing?.payloadJson?.generatedAt ?? latest?.briefing?.createdAt;
	          const generatedTime = generatedAt ? new Date(generatedAt).getTime() : 0;
	          if (latest?.briefing?.payloadJson?.aiReport && generatedTime >= requestedAt - 2000) {
            setStatusMessage(isZh ? "经营分析报告已更新。" : "Operational analysis updated.");
            window.dispatchEvent(new Event("monarca-report-updated"));
            return;
          }
        }
        setStatusMessage(isZh ? "报告仍在后台生成，请稍后刷新查看。" : "Report is still generating. Refresh later to view it.");
	        return;
	      }

	      await loadAnalysisReport(dateRange);
      await loadAnalysisDecisionReport("full");
	      setStatusMessage(isZh ? "经营分析报告已更新。" : "Operational analysis updated.");
	      window.dispatchEvent(new Event("monarca-report-updated"));
	    } catch (error) {
	      setStatusMessage(error instanceof Error ? error.message : (isZh ? "生成报告失败" : "Failed to generate report"));
	    } finally {
	      setIsGenerating(false);
	    }
	  }, [isZh, loadAnalysisDecisionReport, loadAnalysisReport, locale, selectedAnalysisDateRange]);

	  const aiReport = reportData?.briefing?.payloadJson?.aiReport ?? null;
	  const latestMetricResults = reportData?.briefing?.payloadJson?.metricResults ?? [];
	  const isAnalysisCacheMiss = reportData?.briefing?.payloadJson?.cache?.status === "miss";
	  const shouldShowEmptyAnalysisState = !effectiveHasConnectedDatabase;
	  const shouldShowSkuTableEmptyState = !effectiveHasConnectedDatabase;
	  const shouldShowInitialAnalysisShell = isLoading || (isLoadingAnalysisDecisionReport && !analysisDecisionReportPayload);
	  const entitlement = reportData?.reportEntitlement;
	  const entitlementText = reportEntitlementMessage(entitlement, locale);
	  const latestPayloadAudit = reportData?.briefing?.payloadJson?.reportDataAudit;
	  const analysisAvailableDateRange: ReportAvailableDateRange | null = {
	    startDate: reportData?.availableDateRange?.startDate ?? latestPayloadAudit?.dateRangeStart ?? latestPayloadAudit?.startDate ?? reportData?.briefing?.payloadJson?.timeConfig?.startDate ?? null,
	    endDate: reportData?.availableDateRange?.endDate ?? latestPayloadAudit?.dateRangeEnd ?? latestPayloadAudit?.endDate ?? latestPayloadAudit?.latestDataDate ?? reportData?.briefing?.payloadJson?.timeConfig?.endDate ?? null,
	    latestDataDate: reportData?.availableDateRange?.latestDataDate ?? latestPayloadAudit?.latestDataDate ?? null,
	    dateField: reportData?.availableDateRange?.dateField ?? latestPayloadAudit?.dateField ?? reportData?.briefing?.payloadJson?.timeConfig?.defaultTimeField ?? null
	  };
  const resolvedAnalysisDateRange = useMemo<SelectedReportDateRange>(() => ({
    ...selectedAnalysisDateRange,
    ...resolveSelectedReportDateRangeWindow(selectedAnalysisDateRange, analysisAvailableDateRange)
  }), [
    analysisAvailableDateRange?.endDate,
    analysisAvailableDateRange?.latestDataDate,
    analysisAvailableDateRange?.startDate,
    selectedAnalysisDateRange
  ]);
  const analysisRangeStartText = formatDateOnly(resolvedAnalysisDateRange.startDate);
  const analysisRangeEndText = formatDateOnly(resolvedAnalysisDateRange.endDate);
  const analysisRangeLabel = `${isZh ? "分析时间范围" : "Analysis range"}：${analysisRangeStartText} - ${analysisRangeEndText}`;

	  const handleAnalysisRangeChange = useCallback((range: ReportTimeRange) => {
	    const baseRange: SelectedReportDateRange = range === "CUSTOM"
	      ? {
	          preset: range,
	          startDate: selectedAnalysisDateRange.startDate ?? analysisAvailableDateRange?.startDate ?? undefined,
	          endDate: selectedAnalysisDateRange.endDate ?? analysisAvailableDateRange?.endDate ?? analysisAvailableDateRange?.latestDataDate ?? undefined
	        }
	      : { preset: range };
	    const nextRange = {
	      ...baseRange,
	      ...resolveSelectedReportDateRangeWindow(baseRange, analysisAvailableDateRange)
	    };
	    setStatusMessage(null);
	    setSelectedAnalysisDateRange(nextRange);
	  }, [analysisAvailableDateRange?.endDate, analysisAvailableDateRange?.latestDataDate, analysisAvailableDateRange?.startDate, selectedAnalysisDateRange.endDate, selectedAnalysisDateRange.startDate]);

	  const handleCustomAnalysisRangeChange = useCallback((startDate: string, endDate: string) => {
	    const baseRange: SelectedReportDateRange = { preset: "CUSTOM", startDate, endDate };
	    const nextRange = {
	      ...baseRange,
	      ...resolveSelectedReportDateRangeWindow(baseRange, analysisAvailableDateRange)
	    };
	    setStatusMessage(null);
	    setSelectedAnalysisDateRange(nextRange);
	  }, [analysisAvailableDateRange?.endDate, analysisAvailableDateRange?.latestDataDate, analysisAvailableDateRange?.startDate]);

  const reportHeaderAction = (
    <div className="flex flex-wrap items-center justify-end gap-4 text-xs font-semibold text-slate-500">
      <span>
        {analysisDecisionReportPayload?.optimizationRun?.completed_at
          ? `${isZh ? "优化完成时间" : "Optimized"} ${formatReportDate(analysisDecisionReportPayload.optimizationRun.completed_at)}`
          : (isZh ? "尚未优化" : "Not optimized")}
      </span>
      {entitlementText ? <span className="max-w-sm text-emerald-800">{entitlementText}</span> : null}
      {entitlement?.canGenerateReport !== false ? (
        <button
          type="button"
          onClick={() => void generateAnalysisReport(resolvedAnalysisDateRange)}
          disabled={isGenerating}
          className="inline-flex items-center gap-1.5 font-bold text-slate-950 transition hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={cn("size-3.5", isGenerating && "animate-spin")} />
          {isGenerating ? copy.reports.generatingAction : copy.reports.generateAction}
        </button>
      ) : (
        <a href="/checkout/professional" className="font-bold text-slate-950 transition hover:text-emerald-700">
          {isZh ? "升级套餐" : "Upgrade plan"}
        </a>
      )}
    </div>
  );
  const optimizationDecisionReport = useMemo(() => {
    const report = analysisDecisionReportPayload?.decision_report ?? null;
    const optimizationRun = analysisDecisionReportPayload?.optimizationRun ?? null;
    if (!report || !optimizationRun) return report;
    return {
      ...report,
      optimizationRun
    } as DecisionIntelligenceReportV1;
  }, [analysisDecisionReportPayload?.decision_report, analysisDecisionReportPayload?.optimizationRun]);

	  return (
    <section id="reports" className="dashboard-density flex min-w-0 max-w-full flex-col gap-2 overflow-hidden scroll-mt-20">

      {statusMessage ? (
        <div className="rounded-xl border bg-white px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm">
          {statusMessage}
        </div>
      ) : null}

      {shouldShowEmptyAnalysisState ? (
        <>
          <DecisionAnalysisEnginePanel
            report={optimizationDecisionReport}
            message={analysisDecisionReportPayload?.message}
            locale={locale}
            headerAction={reportHeaderAction}
            optimizationStarted={hasStartedProfitOptimization}
            onStartProfitOptimization={startProfitOptimization}
            isLoadingOptimization={isRunningProfitOptimization || (hasStartedProfitOptimization && isLoadingAnalysisDecisionReport)}
            optimizationRunStatus={profitOptimizationRunStatus}
            optimizationRunStep={profitOptimizationRunStep}
            showSkuTableEmptyState
            showInitialShell={shouldShowInitialAnalysisShell}
            isLoadingData={false}
          />
        </>
      ) : isLoading ? (
        <DecisionAnalysisEnginePanel
          report={optimizationDecisionReport}
          message={analysisDecisionReportPayload?.message}
          locale={locale}
          headerAction={reportHeaderAction}
          optimizationStarted={hasStartedProfitOptimization}
          onStartProfitOptimization={startProfitOptimization}
          isLoadingOptimization={isRunningProfitOptimization || (hasStartedProfitOptimization && isLoadingAnalysisDecisionReport)}
          optimizationRunStatus={profitOptimizationRunStatus}
          optimizationRunStep={profitOptimizationRunStep}
          showSkuTableEmptyState={shouldShowSkuTableEmptyState}
          showInitialShell
          isLoadingData={!shouldShowSkuTableEmptyState}
        />
      ) : (
	        <>
	          <DecisionAnalysisEnginePanel
	            report={optimizationDecisionReport}
	            message={analysisDecisionReportPayload?.message}
		          locale={locale}
              headerAction={reportHeaderAction}
              optimizationStarted={hasStartedProfitOptimization}
              onStartProfitOptimization={startProfitOptimization}
              isLoadingOptimization={isRunningProfitOptimization || (hasStartedProfitOptimization && isLoadingAnalysisDecisionReport)}
              optimizationRunStatus={profitOptimizationRunStatus}
              optimizationRunStep={profitOptimizationRunStep}
              showSkuTableEmptyState={shouldShowSkuTableEmptyState}
              showInitialShell={shouldShowInitialAnalysisShell}
              isLoadingData={!shouldShowSkuTableEmptyState && shouldShowInitialAnalysisShell}
	          />
		          {!isAnalysisCacheMiss ? (
		            <>
		              <OfficialLogisticsRegistryPanel metricResults={latestMetricResults} locale={locale} />
		              <AiLogisticsAnalysisReportPanel report={aiReport} locale={locale} />
		            </>
		          ) : null}
		        </>
	      )}
    </section>
  );
}

function ReportPage({
  locale,
  hasConnectedDatabase,
  isLoadingConnectedSources
}: {
  locale: Locale;
  hasConnectedDatabase: boolean;
  isLoadingConnectedSources: boolean;
}) {
  const isZh = locale === "zh";
  type DecisionReportApiPayload = {
    ok?: boolean;
    state?: "ready" | "empty" | "unavailable" | "stale";
    status?: string;
    message?: string;
    hasConnectedDataSource?: boolean;
    decision_report?: DecisionIntelligenceReportV1 | null;
    generated_at?: string;
    source_platforms?: string[];
    code?: string;
    jobId?: string;
  };
  const [decisionReportPayload, setDecisionReportPayload] = useState<DecisionReportApiPayload | null>(
    null
  );
  const [isLoadingDecisionReport, setIsLoadingDecisionReport] = useState(false);
  const [decisionReportError, setDecisionReportError] = useState<string | null>(null);
  const [decisionReportRange, setDecisionReportRange] = useState<SelectedReportDateRange>({ preset: "ALL" });
  const decisionReportIsReady = decisionReportPayload?.ok === true
    && decisionReportPayload.state === "ready"
    && Boolean(decisionReportPayload.decision_report);
  const shouldShowDecisionReportEmpty = Boolean(decisionReportPayload)
    && !decisionReportIsReady;
  const decisionReportIsRefreshing = decisionReportPayload?.state === "stale" || decisionReportPayload?.status === "STALE";
  const reportApiHasConnectedDatabase = decisionReportPayload?.hasConnectedDataSource === true || Boolean(decisionReportPayload?.decision_report);
  const effectiveHasConnectedDatabase = hasConnectedDatabase || reportApiHasConnectedDatabase;

  const loadDecisionReport = useCallback(async () => {
    if (isLoadingConnectedSources) return;

    const cacheKey = reportDateRangeQuery(decisionReportRange);
    setIsLoadingDecisionReport(true);
    setDecisionReportError(null);

    try {
      const { response, payload } = await fetchReportJson<DecisionReportApiPayload>(
        `/api/dashboard/ecommerce/report?${cacheKey}&_=${Date.now()}`,
        { cache: "no-store" },
        isZh
          ? "无法连接到 Monarca 报表服务，请刷新页面后重试。"
          : "Could not reach the Monarca report service. Refresh the page and try again."
      );

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message || (isZh ? "经营报表加载失败" : "Failed to load decision report"));
      }

      setDecisionReportPayload(payload);
      return payload;
    } catch (error) {
      setDecisionReportError(error instanceof Error ? error.message : (isZh ? "经营报表加载失败" : "Failed to load decision report"));
      return null;
    } finally {
      setIsLoadingDecisionReport(false);
    }
  }, [decisionReportRange, isLoadingConnectedSources, isZh]);

  const handleDecisionReportRangeChange = useCallback((range: ReportTimeRange) => {
    setDecisionReportRange((current) => ({
      preset: range,
      startDate: range === "CUSTOM" ? current.startDate : undefined,
      endDate: range === "CUSTOM" ? current.endDate : undefined
    }));
  }, []);

  const handleDecisionReportCustomRangeChange = useCallback((startDate: string, endDate: string) => {
    setDecisionReportRange({
      preset: "CUSTOM",
      startDate,
      endDate
    });
  }, []);

  useEffect(() => {
    if (!decisionReportIsRefreshing || isLoadingDecisionReport) return;

    const timeout = window.setTimeout(() => {
      void loadDecisionReport();
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [decisionReportIsRefreshing, isLoadingDecisionReport, loadDecisionReport]);

  useEffect(() => {
    if (isLoadingConnectedSources) return;

    void loadDecisionReport();
  }, [isLoadingConnectedSources, loadDecisionReport]);

  return (
    <section id="report" className="dashboard-density flex min-w-0 max-w-full flex-col gap-4 overflow-hidden scroll-mt-20 xl:h-full">
      <div className="flex flex-col gap-3 px-1 pb-1 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <ReportSectionNav isZh={isZh} />
        </div>
        <Button
          type="button"
          onClick={() => void loadDecisionReport()}
          disabled={isLoadingDecisionReport || isLoadingConnectedSources}
        >
          <RefreshCw className={cn("size-4", isLoadingDecisionReport && "animate-spin")} />
          {isLoadingDecisionReport ? (isZh ? "加载中..." : "Loading...") : (isZh ? "刷新报表" : "Refresh report")}
        </Button>
      </div>

      <div className="flex justify-end">
        <ReportDateRangeSelector
          selectedRange={decisionReportRange.preset}
          customStartDate={decisionReportRange.startDate}
          customEndDate={decisionReportRange.endDate}
          onRangeChange={handleDecisionReportRangeChange}
          onCustomRangeChange={handleDecisionReportCustomRangeChange}
          locale={locale}
          labelVariant="analysis"
        />
      </div>

      {isLoadingConnectedSources ? (
        <ReportRendererEngine report={null} showEmptyShell showEmptyShellLoading locale={locale} />
      ) : !effectiveHasConnectedDatabase && isLoadingDecisionReport ? (
        <ReportRendererEngine report={null} showEmptyShell showEmptyShellLoading locale={locale} />
      ) : !effectiveHasConnectedDatabase && !decisionReportPayload && !decisionReportError ? (
        <ReportRendererEngine report={null} showEmptyShell locale={locale} />
      ) : isLoadingDecisionReport && !decisionReportPayload ? (
        <ReportRendererEngine report={null} showEmptyShell showEmptyShellLoading locale={locale} />
      ) : decisionReportIsReady ? (
        <ReportRendererEngine
          report={decisionReportPayload?.decision_report ?? null}
          message={decisionReportPayload?.message}
          locale={locale}
        />
      ) : decisionReportError ? (
        <Card className="border-rose-200 bg-rose-50 shadow-sm">
          <CardContent className="p-5 text-sm font-medium text-rose-900">
            {decisionReportError}
          </CardContent>
        </Card>
      ) : shouldShowDecisionReportEmpty ? (
        <ReportRendererEngine report={null} showEmptyShell locale={locale} />
      ) : (
        <ReportRendererEngine report={null} showEmptyShell locale={locale} />
      )}
    </section>
  );


}

type DecisionImpactSummary = {
  totalDecisionsGenerated: number;
  acceptedDecisions: number;
  completedActions: number;
  estimatedProfitImpact: number;
  realizedProfitImpact: number;
  predictionAccuracy: number | null;
};

type DecisionImpactRow = {
  id: string;
  sku: string;
  actionType?: string;
  sourceAction?: string | null;
  recommendedAction: string;
  decisionDrivers: string[];
  expectedImpact: number;
  actualImpact: number | null;
  status: string;
  executionStatus: "NOT_STARTED" | "EXECUTING" | "COMPLETED";
  measurementStatus: "NOT_STARTED" | "TRACKING" | "COMPLETED";
  observationDays: number;
  observationWindow: number;
  evaluationStatus: "PENDING" | "EVALUATED";
  confidence: number;
  estimatedCompletion: string | null;
  lifecycle: {
    recommended: string;
    accepted: string | null;
    executing: string | null;
    completed: string | null;
    evaluated: string | null;
  };
  learning: string | null;
};

type DecisionImpactPayload = {
  summary: DecisionImpactSummary;
  activeDecisions: DecisionImpactRow[];
  completedActions: DecisionImpactRow[];
  outcomeAnalysis: Array<{
    id: string;
    sku: string;
    decision: string;
    predictedProfit: number;
    realizedProfit: number;
    impactRatio: number | null;
    learning: string;
  }>;
  learningInsights: {
    bestPerformingActions: Array<{ action: string; averageProfitLift: number; count: number }>;
    mostReliableSignals: string[];
  };
};

type DecisionOutcomeDetail = {
  recommendation?: {
    recommendationJson?: Record<string, unknown>;
    expectedMetricsJson?: Record<string, unknown>;
    evidenceJson?: Record<string, unknown>;
    status?: string;
  } | null;
  baseline?: {
    periodStart?: string;
    periodEnd?: string;
    metricsJson?: Record<string, unknown>;
  } | null;
  outcome?: {
    status?: string;
    actualMetricsJson?: Record<string, unknown>;
    impactJson?: Record<string, unknown>;
    accuracy?: number | null;
    learningSignals?: unknown;
  } | null;
  executionMetrics?: Array<{
    date?: string;
    metricType?: string;
    metricsJson?: Record<string, unknown>;
  }>;
  learnings?: Array<{
    accuracyScore?: number;
    learningJson?: unknown;
    createdAt?: string;
  }>;
};

function ActionTrackerPage({
  locale
}: {
  locale: Locale;
}) {
  const isZh = locale === "zh";
  const [payload, setPayload] = useState<DecisionImpactPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDecisionBucket, setSelectedDecisionBucket] = useState<"active" | "completed">("active");
  const [selectedRunningTaskIndex, setSelectedRunningTaskIndex] = useState(0);
  const [selectedDetailTask, setSelectedDetailTask] = useState<DecisionImpactRow | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<DecisionOutcomeDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [emptyRefreshAttempt, setEmptyRefreshAttempt] = useState(0);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("/api/policy/actions", {
        cache: "no-store",
        signal: controller.signal
      });
      const data = await response.json().catch(() => null) as DecisionImpactPayload | null;

      if (response.ok && data?.summary) {
        setPayload(data);
        if (data.activeDecisions.length + data.completedActions.length > 0) {
          setEmptyRefreshAttempt(0);
        }
      } else {
        setPayload(null);
      }
    } catch (error) {
      console.warn("[action-tracker] Failed to load actions", error);
      setPayload(null);
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }, []);

  const openDecisionDetail = useCallback(async (task: DecisionImpactRow) => {
    setSelectedDetailTask(task);
    setSelectedDetail(null);
    setIsLoadingDetail(true);
    try {
      const response = await fetch(`/api/decisions/${encodeURIComponent(task.id)}/outcome`, { cache: "no-store" });
      const detail = await response.json().catch(() => null) as (DecisionOutcomeDetail & { ok?: boolean }) | null;
      if (response.ok && detail?.ok) setSelectedDetail(detail);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (isLoading || !payload?.summary || payload.activeDecisions.length + payload.completedActions.length > 0 || emptyRefreshAttempt >= 4) {
      return;
    }

    const retryId = window.setTimeout(() => {
      setEmptyRefreshAttempt((current) => current + 1);
      void refresh();
    }, 3000);

    return () => window.clearTimeout(retryId);
  }, [emptyRefreshAttempt, isLoading, payload, refresh]);

  const activeDecisionCount = payload?.activeDecisions.length ?? 0;
  const completedDecisionCount = payload?.completedActions.length ?? 0;
  const shouldShowEmptyDecisionLoop = !isLoading && activeDecisionCount + completedDecisionCount === 0;
  const shouldShowDecisionTrackerLoadingState = isLoading || shouldShowEmptyDecisionLoop;
  const shouldShowDecisionTrackerLoadingLabel = isLoading;
	  const activeExpectedProfitImpact = (payload?.activeDecisions ?? []).reduce((sum, row) => sum + row.expectedImpact, 0);
	  const activeRealizedProfitImpact = (payload?.activeDecisions ?? []).reduce((sum, row) => sum + (row.actualImpact ?? 0), 0);
	  const activeRealizationRate = activeExpectedProfitImpact > 0
	    ? Math.round((activeRealizedProfitImpact / activeExpectedProfitImpact) * 100)
	    : null;
  const hasAcceptedDecisionData = activeDecisionCount + completedDecisionCount > 0;
  const runningTasks = [...(payload?.activeDecisions ?? [])]
    .sort((a, b) => decisionTaskProgress(a).percent - decisionTaskProgress(b).percent);
  const runningTaskProgressNodes = runningTasks.reduce<Array<{ percent: number; taskIndexes: number[] }>>((nodes, task, index) => {
    const percent = decisionTaskProgress(task).percent;
    const existing = nodes.find((node) => node.percent === percent);
    if (existing) {
      existing.taskIndexes.push(index);
    } else {
      nodes.push({ percent, taskIndexes: [index] });
    }
    return nodes;
  }, []);
  const normalizedRunningTaskIndex = Math.min(selectedRunningTaskIndex, Math.max(0, runningTasks.length - 1));
  const selectedRunningTaskNode = runningTaskProgressNodes.find((node) => node.taskIndexes.includes(normalizedRunningTaskIndex))
    ?? runningTaskProgressNodes[0]
    ?? null;
  const selectedRunningTasks = selectedRunningTaskNode
    ? selectedRunningTaskNode.taskIndexes.map((index) => runningTasks[index]).filter(Boolean)
    : [];
  const completedTasks = payload?.completedActions ?? [];

  return (
    <section id="action-tracker" className="dashboard-density flex min-w-0 max-w-full flex-col gap-5 scroll-mt-20">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedDecisionBucket("active")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide transition",
            selectedDecisionBucket === "active"
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
              : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-emerald-700"
          )}
        >
          {isZh ? `Active Strategies ${activeDecisionCount}` : `Active Strategies ${activeDecisionCount}`}
        </button>
        <button
          type="button"
          onClick={() => setSelectedDecisionBucket("completed")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide transition",
            selectedDecisionBucket === "completed"
              ? "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
              : "bg-white text-slate-500 ring-1 ring-slate-200 hover:text-slate-800"
          )}
        >
          {isZh ? `Completed Strategies ${completedDecisionCount}` : `Completed Strategies ${completedDecisionCount}`}
        </button>
      </div>

      <div className="flex flex-wrap items-start gap-x-16 gap-y-6">
        <DecisionTextMetric
          label={isZh ? "Active Strategies" : "Active Strategies"}
          value={formatInteger(activeDecisionCount)}
          description={isZh ? "已接受或正在执行并等待效果验证的优化策略" : "Accepted or executing optimization strategies waiting for outcome validation"}
        />
        <DecisionTextMetric
          label={isZh ? "预计利润影响" : "Expected Profit Impact"}
          value={formatSignedMoney(activeExpectedProfitImpact)}
          description={isZh ? "接受决策后预计应该产生的利润提升" : "Profit lift expected after accepted AI decisions"}
        />
	        <DecisionTextMetric
	          label={isZh ? "已实现利润影响" : "Realized Profit Impact"}
	          value={!hasAcceptedDecisionData ? "-" : activeRealizedProfitImpact ? `${formatSignedMoney(activeRealizedProfitImpact)} (${activeRealizationRate ?? 0}% Realized / Expected)` : (isZh ? "采集中" : "Collecting")}
	          description={!hasAcceptedDecisionData
              ? (isZh ? "还没有已接受的优化决策" : "No accepted optimization decisions yet")
              : (isZh ? "当前 active decisions 已经产生的利润提升" : "Profit lift already realized by current active decisions")}
	        />
        <DecisionTextMetric
          label={isZh ? "实现率" : "Realization Rate"}
          value={activeRealizationRate == null ? "-" : `${activeRealizationRate}%`}
          description={isZh ? "Realized Profit Impact ÷ Expected Profit Impact × 100" : "Realized Profit Impact ÷ Expected Profit Impact × 100"}
        />
      </div>

      {shouldShowDecisionTrackerLoadingState ? (
        <div className="grid min-h-[360px] place-items-center text-center">
          <div className="grid gap-4">
            <p className="text-3xl font-bold text-slate-950">
              {isZh ? "追踪你的优化决策影响" : "Track the impact of your optimization decisions"}
            </p>
            {shouldShowDecisionTrackerLoadingLabel ? (
              <p className="text-sm font-semibold text-slate-500">
                {isZh ? "正在加载数据" : "Loading data"}
              </p>
            ) : shouldShowEmptyDecisionLoop ? (
              <p className="text-sm font-semibold text-slate-500">
                {isZh ? "还没有已接受的优化决策。" : "No accepted optimization decisions yet."}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectedDecisionBucket === "active" && runningTasks.length ? (
        <div className="space-y-4">
          <div className="w-full">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-500">
              <span>{isZh ? "任务进度" : "Task progress"}</span>
            </div>
            <div className="relative mt-8 h-20 pr-16">
              <span className="absolute right-0 top-[-1.65rem] w-12 text-center text-xs font-bold text-slate-500">%</span>
              <span className="absolute right-0 top-11 w-12 text-center text-xs font-bold text-slate-500">{isZh ? "任务" : "tasks"}</span>
              <div className="absolute left-0 right-16 top-5 h-px bg-slate-200" />
              {runningTaskProgressNodes.map((node, nodeIndex) => {
                const isSelected = selectedRunningTaskNode?.taskIndexes[0] === node.taskIndexes[0];
                const primaryTask = runningTasks[node.taskIndexes[0]];
                const taskCount = node.taskIndexes.length;
                const previousNode = runningTaskProgressNodes[nodeIndex - 1];
                const isCloseToPrevious = previousNode ? node.percent - previousNode.percent < 8 : false;
                const labelOffsetClass = isCloseToPrevious ? "-top-12" : "-top-8";
                return (
	                  <button
	                    key={`${node.percent}-${node.taskIndexes.join("-")}`}
	                    type="button"
	                    onClick={() => setSelectedRunningTaskIndex(node.taskIndexes[0])}
	                    className="absolute top-3 -translate-x-1/2 text-center"
	                    style={{ left: `calc(${node.percent}% - ${(node.percent / 100) * 4}rem)` }}
	                    aria-label={`${primaryTask?.sku ?? "Task"} ${node.percent} percent`}
	                  >
                    <span className={cn(
                      "absolute left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm transition",
                      labelOffsetClass,
                      isSelected ? "bg-[#635bff] text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"
                    )}>
                      {node.percent}
                    </span>
                    <span className={cn(
                      "mx-auto block size-4 rounded-full ring-2 ring-white transition",
                      isSelected ? "bg-[#079669] shadow-sm shadow-emerald-900/20" : "bg-slate-300 hover:bg-emerald-300"
                    )} />
                    <span className={cn(
                      "mt-2 block whitespace-nowrap text-[10px] font-bold",
                      isSelected ? "text-emerald-700" : "text-slate-400"
                    )}>
                      {taskCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <h2 className="mx-auto max-w-5xl text-xl font-bold text-slate-950">{isZh ? "进行中的任务" : "Active Tasks"}</h2>
          {selectedRunningTasks.length ? (
            <div className={cn(
              "grid w-full gap-4",
              selectedRunningTasks.length === 1 ? "max-w-2xl grid-cols-1" : "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
            )}>
              {selectedRunningTasks.map((task) => {
                const progress = decisionTaskProgress(task);
                const observedImpactLabel = task.actualImpact == null
                  ? (isZh ? "采集中..." : "Collecting data...")
                  : formatSignedMoney(task.actualImpact);
                return (
	                  <div
	                    key={task.id}
	                    className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5"
	                  >
		                  <div className="flex flex-wrap items-start justify-between gap-4">
		                    <div>
		                      <p className="text-xl font-semibold text-slate-950">{task.sku}</p>
		                      {task.recommendedAction.toUpperCase() !== "HOLD" ? (
		                        <p className="mt-1.5 text-xs font-semibold text-slate-500">{task.recommendedAction}</p>
		                      ) : null}
		                    </div>
		                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
		                      {decisionTaskStatusLabel(task, isZh)}
		                    </span>
		                  </div>
	
		                  <div className="mt-4 grid gap-3 text-xs font-semibold text-slate-600 sm:grid-cols-2">
		                    <div className="rounded-xl bg-slate-50 p-2.5">
		                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{isZh ? "执行状态" : "Execution Status"}</p>
		                      <p className="mt-1 font-semibold text-slate-950">{executionStatusLabel(task.executionStatus, isZh)}</p>
		                    </div>
		                    <div className="rounded-xl bg-slate-50 p-2.5">
		                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{isZh ? "影响衡量" : "Impact Measurement"}</p>
		                      <p className="mt-1 font-semibold text-slate-950">
	                        {progress.currentDay > 0
                            ? (isZh ? `第 ${progress.currentDay} / ${progress.totalDays} 天` : `Day ${progress.currentDay} / ${progress.totalDays}`)
                            : (isZh ? "等待测量数据" : "Waiting for measurement data")}
	                      </p>
	                    </div>
	                  </div>

		                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
		                    <div>
		                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{isZh ? "AI 预测" : "AI Prediction"}</p>
		                      <p className="mt-1.5 text-xs font-semibold text-slate-500">{isZh ? "期待利润提升" : "Expected Profit Lift"}</p>
		                      <p className="mt-1 text-xl font-semibold text-slate-950">{formatSignedMoney(task.expectedImpact)}</p>
		                    </div>
		                    <div>
		                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{isZh ? "当前结果" : "Current Result"}</p>
		                      <p className="mt-1.5 text-xs font-semibold text-slate-500">{isZh ? "观察到的利润影响" : "Observed Profit Impact"}</p>
		                      <p className="mt-1 text-xl font-semibold text-slate-950">{observedImpactLabel}</p>
		                    </div>
		                  </div>

	                  <div className="mt-4">
	                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
	                      <span>{isZh ? "衡量进度" : "Measurement Progress"}</span>
	                      <span>{progress.percent}%</span>
                    </div>
	                    <div className="mt-2 h-2 rounded-full bg-slate-100">
	                      <div className="h-full rounded-full bg-slate-950" style={{ width: `${progress.percent}%` }} />
	                    </div>
                  </div>

		                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
		                    <div>
		                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{isZh ? "预测置信度" : "Prediction Confidence"}</p>
		                      <p className="mt-1 text-base font-semibold text-slate-950">{task.confidence}%</p>
	                    </div>
	                    <DecisionLifecycleMini task={task} isZh={isZh} />
	                    <div className="text-right text-xs font-semibold text-slate-500">
	                      <p>{isZh ? "接受时间" : "Accepted"}: {formatActionDate(task.lifecycle.accepted)}</p>
	                      <p>{isZh ? "预计完成" : "Est. complete"}: {formatActionDate(task.estimatedCompletion)}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => void openDecisionDetail(task)}>
                      {isZh ? "查看详情" : "View Details"}
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedDecisionBucket === "completed" ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{isZh ? "已完成决策（历史学习）" : "Completed Decisions (Historical Learning)"}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {isZh ? "这里展示 AI 做过什么，结果如何。" : "See what AI decided and how the outcome performed."}
            </p>
          </div>
          {completedTasks.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-3 pr-5">SKU</th>
                    <th className="px-5 py-3">Action</th>
                    <th className="px-5 py-3">Predicted</th>
                    <th className="px-5 py-3">Actual</th>
                    <th className="py-3 pl-5">Accuracy</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {completedTasks.map((task) => (
                    <tr key={task.id}>
                      <td className="py-4 pr-5 font-bold text-slate-950">{task.sku}</td>
                      <td className="px-5 py-4 font-semibold text-slate-700">{task.recommendedAction}</td>
                      <td className="px-5 py-4 font-bold text-emerald-700">{formatSignedMoney(task.expectedImpact)}</td>
                      <td className="px-5 py-4 font-bold text-slate-950">{formatSignedMoney(task.actualImpact ?? 0)}</td>
                      <td className="py-4 pl-5 font-bold text-slate-950">
                        <div className="flex items-center justify-between gap-3">
                          <span>{decisionAccuracy(task)}</span>
                          <Button type="button" variant="outline" size="sm" onClick={() => void openDecisionDetail(task)}>
                            {isZh ? "详情" : "Details"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm font-semibold text-slate-500">{isZh ? "暂无已完成决策。" : "No completed decisions yet."}</p>
          )}
        </div>
      ) : null}

      {selectedDetailTask ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={isZh ? "关闭详情" : "Close details"}
            onClick={() => {
              setSelectedDetailTask(null);
              setSelectedDetail(null);
            }}
          />
          <div className="relative h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
                  {isZh ? "结果闭环" : "Outcome Loop"}
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">{selectedDetailTask.recommendedAction}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{selectedDetailTask.sku}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedDetailTask(null);
                  setSelectedDetail(null);
                }}
              >
                {isZh ? "关闭" : "Close"}
              </Button>
            </div>

            {isLoadingDetail ? (
              <div className="mt-8 flex items-center gap-3 text-sm font-semibold text-slate-500">
                <RefreshCw className="size-4 animate-spin" />
                {isZh ? "正在读取真实结果" : "Loading real outcome"}
              </div>
            ) : (
              <div className="mt-8 space-y-5">
                <DecisionDetailMetricGrid
                  isZh={isZh}
                  expectedImpact={selectedDetailTask.expectedImpact}
                  actualImpact={numberFromDetail(selectedDetail?.outcome?.impactJson, "incrementalProfit") ?? selectedDetailTask.actualImpact}
                  accuracy={selectedDetail?.outcome?.accuracy ?? selectedDetail?.learnings?.[0]?.accuracyScore ?? null}
                />
                <DecisionDetailSection
                  title={isZh ? "为什么 AI 推荐" : "Why AI Recommended This"}
                  items={detailEntries(selectedDetail?.recommendation?.evidenceJson ?? selectedDetail?.recommendation?.recommendationJson)}
                />
                <DecisionDetailSection
                  title={isZh ? "Baseline Snapshot" : "Baseline Snapshot"}
                  items={detailEntries(selectedDetail?.baseline?.metricsJson)}
                />
                <DecisionDetailSection
                  title={isZh ? "Actual Outcome" : "Actual Outcome"}
                  items={detailEntries(selectedDetail?.outcome?.actualMetricsJson)}
                />
                <DecisionDetailSection
                  title={isZh ? "Learning" : "Learning"}
                  items={detailEntries(selectedDetail?.learnings?.[0]?.learningJson ?? selectedDetail?.outcome?.learningSignals)}
                  emptyText={isZh ? "等待评估窗口和真实业务数据。" : "Waiting for the evaluation window and real business data."}
                />
              </div>
            )}
          </div>
        </div>
      ) : null}

    </section>
  );
}

function DecisionDetailMetricGrid({
  isZh,
  expectedImpact,
  actualImpact,
  accuracy
}: {
  isZh: boolean;
  expectedImpact: number;
  actualImpact: number | null;
  accuracy: number | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{isZh ? "Expected" : "Expected"}</p>
        <p className="mt-2 text-xl font-bold text-emerald-700">{formatSignedMoney(expectedImpact)}</p>
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{isZh ? "Actual" : "Actual"}</p>
        <p className="mt-2 text-xl font-bold text-slate-950">{actualImpact == null ? "-" : formatSignedMoney(actualImpact)}</p>
      </div>
      <div className="rounded-xl border border-slate-200 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{isZh ? "Accuracy" : "Accuracy"}</p>
        <p className="mt-2 text-xl font-bold text-slate-950">{accuracy == null ? "-" : `${Math.round(accuracy * 100)}%`}</p>
      </div>
    </div>
  );
}

function DecisionDetailSection({
  title,
  items,
  emptyText = "No data yet."
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
  emptyText?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-sm font-bold text-slate-950">{title}</h3>
      {items.length ? (
        <dl className="mt-3 grid gap-2 text-sm">
          {items.slice(0, 8).map((item) => (
            <div key={item.label} className="flex items-start justify-between gap-4">
              <dt className="font-semibold text-slate-500">{humanizeDetailKey(item.label)}</dt>
              <dd className="max-w-[60%] text-right font-bold text-slate-950">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm font-semibold text-slate-500">{emptyText}</p>
      )}
    </div>
  );
}

function DecisionTextMetric({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div className="max-w-[260px]">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
      {description ? <p className="mt-2 text-xs font-semibold leading-snug text-slate-500">{description}</p> : null}
    </div>
  );
}

function DecisionLifecycleMini({ task, isZh }: { task: DecisionImpactRow; isZh: boolean }) {
  return (
    <div className="min-w-[160px] text-center text-xs font-semibold text-slate-500">
      <p className="font-bold uppercase tracking-wide">{isZh ? "决策阶段" : "Decision Stage"}</p>
      <p className="mt-1 text-slate-950">{decisionStageLabel(task, isZh)}</p>
    </div>
  );
}

function decisionStageLabel(task: DecisionImpactRow, isZh: boolean) {
  if (task.status === "learned") return isZh ? "已学习" : "Learned";
  if (task.evaluationStatus === "EVALUATED") return isZh ? "已评估" : "Evaluated";
  if (task.measurementStatus === "TRACKING") return isZh ? "衡量影响中" : "Measuring Impact";
  if (task.executionStatus === "EXECUTING") return isZh ? "执行中" : "Executing";
  if (task.lifecycle.accepted) return isZh ? "已接受" : "Accepted";
  return isZh ? "等待中" : "Pending";
}

function decisionTaskStatusLabel(task: DecisionImpactRow, isZh: boolean) {
  if (task.status === "completed" || task.status === "learned") return isZh ? "已完成" : "Completed";
  if (task.measurementStatus === "TRACKING") return isZh ? "衡量影响中" : "Measuring Impact";
  if (task.executionStatus === "EXECUTING") return isZh ? "执行中" : "Executing";
  if (task.lifecycle.accepted) return isZh ? "已接受" : "Accepted";
  return isZh ? "等待中" : "Pending";
}

function executionStatusLabel(status: DecisionImpactRow["executionStatus"], isZh: boolean) {
  if (status === "COMPLETED") return isZh ? "完成" : "Completed";
  if (status === "EXECUTING") return isZh ? "执行中" : "Executing";
  return isZh ? "未开始" : "Not Started";
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatSignedMoney(value: number) {
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.abs(value));
  return value > 0 ? `+${formatted}` : formatted;
}

function formatActionDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function decisionAccuracy(task: DecisionImpactRow) {
  if (!task.expectedImpact || task.actualImpact == null) return "No Data";
  return `${Math.round((Math.min(task.actualImpact, task.expectedImpact) / Math.max(1, task.expectedImpact)) * 100)}%`;
}

function detailEntries(value: unknown): Array<{ label: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== null && typeof entry !== "undefined")
    .map(([label, entry]) => ({
      label,
      value: detailValue(entry)
    }))
    .filter((entry) => entry.value.length > 0);
}

function detailValue(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return Math.abs(value) >= 1000 ? formatInteger(value) : String(Math.round(value * 100) / 100);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.slice(0, 3).map(detailValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 3);
    return entries.map(([key, entry]) => `${humanizeDetailKey(key)}: ${detailValue(entry)}`).filter(Boolean).join(" | ");
  }
  return "";
}

function numberFromDetail(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function humanizeDetailKey(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function decisionTaskProgress(task: DecisionImpactRow) {
  const totalDays = Math.max(1, task.observationWindow || 30);
  const currentDay = Math.max(0, Math.min(totalDays, task.observationDays || 0));
  return {
    currentDay,
    totalDays,
    percent: Math.min(100, Math.max(0, Math.round((currentDay / totalDays) * 100)))
  };
}

function ReportSectionNav({ isZh, placement = "inline" }: { isZh: boolean; placement?: "inline" | "sidebar" }) {
  const items = [
    { href: "#report-sku", label: isZh ? "SKU" : "SKU", icon: Table2 },
    { href: "#report-ads", label: isZh ? "广告" : "Ads", icon: BarChart3 },
    { href: "#report-warehouse", label: isZh ? "仓库" : "Warehouse", icon: Database },
    { href: "#report-customers", label: isZh ? "用户" : "Customers", icon: Users }
  ];
  const isSidebar = placement === "sidebar";

  return (
    <nav
      className={cn(
        isSidebar
          ? "ml-6 mt-1 grid gap-1 border-l border-slate-200 pl-3"
          : "mt-3 flex max-w-full gap-2 overflow-x-auto pb-1"
      )}
      aria-label={isZh ? "报表板块导航" : "Report section navigation"}
    >
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-emerald-800",
            isSidebar
              ? "rounded-md px-2 py-1.5 hover:bg-emerald-50"
              : "rounded-full border bg-white px-3 py-1.5 shadow-sm hover:border-emerald-200 hover:bg-emerald-50"
          )}
        >
          <item.icon className="size-4" />
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function Dashboard({
  view = "overview",
  initialDataSource,
  defaultLocale = "en",
  ecommerceDashboard
}: {
  view?: DashboardView;
  initialDataSource?: string;
  defaultLocale?: Locale;
  ecommerceDashboard?: EcommerceDashboardPayload;
}) {
  const [locale, setLocale, isLocaleReady] = useLocale(defaultLocale);
  const { isLoaded: isUserLoaded } = useUser();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [connectedSources, setConnectedSources] = useState<ConnectedSourceRow[]>([]);
  const [deletedSources, setDeletedSources] = useState<ConnectedSourceRow[]>([]);
  const [isLoadingConnectedSources, setIsLoadingConnectedSources] = useState(true);
  const copy = dashboardCopy[getCopyLocale(locale)];
  const isReportsView = view === "reports";
  const hasOperationalConnectedSource = connectedSources.some(isOperationalConnectedSource);

  useEffect(() => {
    setIsSidebarCollapsed(true);
  }, [isUserLoaded]);

  const activeTarget =
    view === "import-data" || view === "import-data-connect"
      ? "#import-data"
      : view === "metrics" || view === "schema"
        ? "#metrics"
      : view === "report"
        ? "#report"
      : view === "sales"
        ? "#sales"
      : isReportsView
        ? "#reports"
      : view === "launch-optimizer"
          ? "#launch-optimizer"
        : view === "action-tracker"
          ? "#action-tracker"
        : view === "settings"
          ? "#settings"
          : "#overview";

  const addConnectedSource = (source: ConnectedSourceRow) => {
    setConnectedSources((current) => {
      const next = current.some((item) => item.id === source.id) ? current : [source, ...current];
      connectedSourcesCache = next;
      writeConnectedSourcesBrowserCache(next, connectedSourcesWorkspaceIdCache, connectedSourcesUserIdCache);
      return next;
    });
  };

  const updateConnectedSource = (source: ConnectedSourceRow) => {
    setConnectedSources((current) => {
      const next = current.map((item) => (item.id === source.id ? source : item));
      connectedSourcesCache = next;
      writeConnectedSourcesBrowserCache(next, connectedSourcesWorkspaceIdCache, connectedSourcesUserIdCache);
      return next;
    });
  };

  const removeConnectedSource = (sourceId: string) => {
    const previousSources = connectedSources;
    const previousDeletedSources = deletedSources;
    const failureMessage = copy.connectors.title === "连接数据源"
      ? "删除数据源失败，请确认当前账号有 Owner / Admin 权限后重试"
      : "Failed to remove data source. Confirm your account has Owner / Admin access and try again.";
    const sourceToRemove = connectedSources.find((source) => source.id === sourceId);

    setConnectedSources((current) => {
      const next = current.filter((source) => source.id !== sourceId);
      connectedSourcesCache = next;
      writeConnectedSourcesBrowserCache(next, connectedSourcesWorkspaceIdCache, connectedSourcesUserIdCache);
      return next;
    });
    if (sourceToRemove) {
      setDeletedSources((current) => [{
        ...sourceToRemove,
        status: "DISCONNECTED",
        deletedAt: new Date().toISOString(),
        retentionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }, ...current.filter((source) => source.id !== sourceId)]);
    }

    void fetch(`/api/data-sources/${sourceId}`, {
      method: "DELETE"
    }).then(async (response) => {
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        connectedSourcesCache = previousSources;
        writeConnectedSourcesBrowserCache(previousSources, connectedSourcesWorkspaceIdCache, connectedSourcesUserIdCache);
        setConnectedSources(previousSources);
        setDeletedSources(previousDeletedSources);
        window.alert(payload?.message || failureMessage);
        return;
      }

      window.dispatchEvent(new Event("monarca-data-sources-updated"));
    }).catch(() => {
      connectedSourcesCache = previousSources;
      writeConnectedSourcesBrowserCache(previousSources, connectedSourcesWorkspaceIdCache, connectedSourcesUserIdCache);
      setConnectedSources(previousSources);
      setDeletedSources(previousDeletedSources);
      window.alert(failureMessage);
    });
  };

  const restoreDeletedSource = (sourceId: string) => {
    const failureMessage = copy.connectors.title === "连接数据源"
      ? "恢复数据源失败，请确认当前账号有 Owner / Admin 权限后重试"
      : "Failed to restore data source. Confirm your account has Owner / Admin access and try again.";

    void fetch(`/api/data-sources/${sourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" })
    }).then(async (response) => {
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        window.alert(payload?.message || failureMessage);
        return;
      }

      window.dispatchEvent(new Event("monarca-data-sources-updated"));
    }).catch(() => {
      window.alert(failureMessage);
    });
  };

  const permanentlyDeleteSource = (sourceId: string) => {
    const isZh = copy.connectors.title === "连接数据源";
    const confirmed = window.confirm(
      isZh
        ? "确定要彻底删除这个数据源吗？此操作不可恢复。"
        : "Permanently delete this data source? This cannot be undone."
    );

    if (!confirmed) return;

    const previousDeletedSources = deletedSources;
    const failureMessage = isZh
      ? "彻底删除数据源失败，请确认当前账号有 Owner / Admin 权限后重试"
      : "Failed to permanently delete data source. Confirm your account has Owner / Admin access and try again.";

    setDeletedSources((current) => current.filter((source) => source.id !== sourceId));

    void fetch(`/api/data-sources/${sourceId}?permanent=true`, {
      method: "DELETE"
    }).then(async (response) => {
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setDeletedSources(previousDeletedSources);
        window.alert(payload?.message || failureMessage);
        return;
      }

      window.dispatchEvent(new Event("monarca-data-sources-updated"));
    }).catch(() => {
      setDeletedSources(previousDeletedSources);
      window.alert(failureMessage);
    });
  };

  const loadConnectedSources = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setIsLoadingConnectedSources(true);
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch("/api/data-sources", {
        cache: "no-store",
        signal: controller.signal
      });
      const payload = await response.json().catch(() => null);

      if (response.ok && payload?.ok && Array.isArray(payload.dataSources)) {
        const nextSources = payload.dataSources as ConnectedSourceRow[];
        const nextWorkspaceId = typeof payload.workspace?.id === "string" ? payload.workspace.id : null;
        const nextUserId = connectedSourcesUserIdCache;
        const workspaceChanged = Boolean(
          nextWorkspaceId &&
          connectedSourcesWorkspaceIdCache &&
          nextWorkspaceId !== connectedSourcesWorkspaceIdCache
        );
        if (workspaceChanged || nextSources.length === 0) {
          analysisReportsPageDataCache = null;
          reportsPageDataCache = null;
        }
        connectedSourcesWorkspaceIdCache = nextWorkspaceId;
        connectedSourcesCache = nextSources;
        writeConnectedSourcesBrowserCache(nextSources, nextWorkspaceId, nextUserId);
        setConnectedSources(nextSources);
        setDeletedSources(Array.isArray(payload.deletedDataSources) ? payload.deletedDataSources as ConnectedSourceRow[] : []);
      }
    } catch (error) {
      console.warn("[dashboard] Failed to load connected sources", error);
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoadingConnectedSources(false);
    }
  }, []);

  useEffect(() => {
    if (!isUserLoaded) return;

    const refreshConnectedSources = () => {
      void loadConnectedSources();
    };

    let isActive = true;

    const hydrateWorkspaceSources = async () => {
      let currentWorkspaceId: string | null = null;
      let currentUserId: string | null = null;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          signal: controller.signal
        });
        const payload = await response.json().catch(() => null);
        currentWorkspaceId = typeof payload?.currentWorkspace?.id === "string" ? payload.currentWorkspace.id : null;
        currentUserId = typeof payload?.currentUser?.id === "string" ? payload.currentUser.id : null;
      } catch (error) {
        console.warn("[dashboard] Failed to resolve current workspace", error);
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!isActive) return;

      const userChanged = (connectedSourcesUserIdCache ?? null) !== (currentUserId ?? null);
      if (userChanged) {
        analysisReportsPageDataCache = null;
        reportsPageDataCache = null;
        connectedSourcesCache = null;
      }
      connectedSourcesUserIdCache = currentUserId;

      const cachedSources =
        readConnectedSourcesMemoryCache(currentWorkspaceId, currentUserId) ??
        readConnectedSourcesBrowserCache(currentWorkspaceId, currentUserId);
      if (cachedSources) {
        connectedSourcesWorkspaceIdCache = currentWorkspaceId;
        connectedSourcesUserIdCache = currentUserId;
        connectedSourcesCache = cachedSources;
        setConnectedSources(cachedSources);
        setIsLoadingConnectedSources(false);
      }

      void loadConnectedSources({ silent: Boolean(cachedSources) });
    };

    void hydrateWorkspaceSources();
    window.addEventListener("monarca-data-sources-updated", refreshConnectedSources);

    return () => {
      isActive = false;
      window.removeEventListener("monarca-data-sources-updated", refreshConnectedSources);
    };
  }, [isUserLoaded, loadConnectedSources]);

  if (!isLocaleReady) {
    return <div className="h-screen bg-background" />;
  }

  return (
    <div className="flex h-screen overflow-hidden" lang={getHtmlLang(locale)}>
      <Sidebar
        copy={copy}
        activeTarget={activeTarget}
        isCollapsed={isSidebarCollapsed}
      />
      <div className="min-w-0 flex h-full flex-1 flex-col overflow-hidden">
        <Header copy={copy} activeTarget={activeTarget} locale={locale} onLocaleChange={setLocale} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <main
            className={cn(
              "mx-auto grid min-h-full max-w-[1500px] gap-4 px-4 lg:px-6 xl:grid-cols-1 xl:items-start",
              isReportsView ? "py-3" : "py-5"
            )}
          >
            {view === "import-data" || view === "import-data-connect" ? (
              <div className="min-w-0 xl:col-start-1">
                <ImportDataSection
                  copy={copy}
                  connectedSources={connectedSources}
                  onAddConnectedSource={addConnectedSource}
                  onRemoveConnectedSource={removeConnectedSource}
                  isLoadingConnectedSources={isLoadingConnectedSources}
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
                  deletedSources={deletedSources}
                  isLoadingConnectedSources={isLoadingConnectedSources}
                  onUpdateConnectedSource={updateConnectedSource}
                  onRemoveConnectedSource={removeConnectedSource}
                  onRestoreDeletedSource={restoreDeletedSource}
                  onPermanentlyDeleteSource={permanentlyDeleteSource}
                />
              </div>
            ) : view === "reports" ? (
              <div className="flex min-h-0 min-w-0 flex-col xl:col-start-1">
                <ReportsPage
                  copy={copy}
                  locale={locale}
                  hasConnectedDatabase={hasOperationalConnectedSource}
                  isLoadingConnectedSources={isLoadingConnectedSources}
                />
              </div>
            ) : view === "launch-optimizer" ? (
              <div id="launch-optimizer" className="min-w-0 xl:col-start-1">
                <NewProductLaunchOptimizer
                  locale={getCopyLocale(locale)}
                  hasConnectedData={hasOperationalConnectedSource}
                  isLoadingConnectedData={isLoadingConnectedSources}
                />
              </div>
            ) : view === "action-tracker" ? (
              <div id="action-tracker" className="min-w-0 xl:col-start-1">
                <ActionTrackerPage
                  locale={getCopyLocale(locale)}
                />
              </div>
            ) : view === "report" ? (
              <div className="min-w-0 xl:col-start-1">
                <ReportPage
                  locale={locale}
                  hasConnectedDatabase={hasOperationalConnectedSource}
                  isLoadingConnectedSources={isLoadingConnectedSources}
                />
              </div>
            ) : view === "sales" && ecommerceDashboard ? (
              <div className="min-w-0 xl:col-start-1">
                <EcommerceSalesDashboard
                  data={ecommerceDashboard.data}
                  state={ecommerceDashboard.state}
                  message={ecommerceDashboard.message}
                  lineage={ecommerceDashboard.lineage}
                  embedded
                />
              </div>
            ) : (
              <>
                <div className="min-w-0 xl:col-start-1">
                  <SetupHero copy={copy} />
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
