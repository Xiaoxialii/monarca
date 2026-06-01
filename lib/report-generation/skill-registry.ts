import type { ReportBusinessType } from "@/lib/report-generation/report-types";

export type ReportSkillRule = {
  businessType: ReportBusinessType;
  title: string;
  keywords: string[];
  coreKeywords: string[];
  trendKeywords: string[];
  structureKeywords: string[];
  qualityKeywords: string[];
  riskKeywords: string[];
  opportunityKeywords: string[];
  breakdownDimensions: string[];
};

export const reportSkillRegistry: ReportSkillRule[] = [
  {
    businessType: "reviews",
    title: "用户反馈与评论",
    keywords: ["review", "sentiment", "rating", "feedback", "comment", "subjectivity"],
    coreKeywords: ["review volume", "sentiment", "positive", "negative", "rating"],
    trendKeywords: ["volume"],
    structureKeywords: ["app", "category", "product"],
    qualityKeywords: ["rating", "sentiment"],
    riskKeywords: ["negative", "low rating"],
    opportunityKeywords: ["positive", "high rating"],
    breakdownDimensions: ["产品", "类别", "评论情绪", "时间段"]
  },
  {
    businessType: "app_market",
    title: "App / 产品市场",
    keywords: ["app", "install", "rating", "price", "paid", "category"],
    coreKeywords: ["total apps", "installs", "rating", "reviews"],
    trendKeywords: ["installs", "reviews"],
    structureKeywords: ["category", "paid", "free"],
    qualityKeywords: ["rating"],
    riskKeywords: ["paid app ratio", "low rating"],
    opportunityKeywords: ["installs", "estimated"],
    breakdownDimensions: ["类别", "App", "价格区间", "评分区间"]
  },
  {
    businessType: "finance_timeseries",
    title: "金融 / 时间序列",
    keywords: ["close", "open", "high", "low", "volume", "return", "volatility", "trading"],
    coreKeywords: ["close", "volume", "range", "return", "volatility"],
    trendKeywords: ["close", "return"],
    structureKeywords: ["volume"],
    qualityKeywords: ["range"],
    riskKeywords: ["volatility", "drawdown", "range"],
    opportunityKeywords: ["volume", "return"],
    breakdownDimensions: ["日期", "成交量区间", "价格区间", "波动区间"]
  },
  {
    businessType: "ecommerce",
    title: "电商 / 订单",
    keywords: ["order", "product", "sku", "quantity", "gmv", "payment", "refund", "customer"],
    coreKeywords: ["orders", "customers", "gmv", "sales", "units", "aov"],
    trendKeywords: ["daily", "monthly", "sales"],
    structureKeywords: ["product", "category", "customer"],
    qualityKeywords: ["refund"],
    riskKeywords: ["refund", "concentration"],
    opportunityKeywords: ["aov", "units", "top"],
    breakdownDimensions: ["产品", "客户", "渠道", "地区", "时间段"]
  },
  {
    businessType: "sales",
    title: "销售表现",
    keywords: ["sales", "deal", "lead", "pipeline", "stage", "close_date", "revenue", "seller", "owner"],
    coreKeywords: ["sales", "revenue", "deal", "pipeline", "aov", "customer"],
    trendKeywords: ["daily", "monthly", "close_date", "sales"],
    structureKeywords: ["owner", "region", "product", "stage"],
    qualityKeywords: ["win rate", "conversion", "deal size"],
    riskKeywords: ["lost", "decline", "low conversion"],
    opportunityKeywords: ["high value", "pipeline", "growth"],
    breakdownDimensions: ["销售阶段", "销售负责人", "地区", "产品", "时间段"]
  },
  {
    businessType: "user_growth",
    title: "用户增长",
    keywords: ["user", "signup", "activation", "retention", "churn", "cohort", "source", "channel"],
    coreKeywords: ["users", "signup", "active", "activation", "retention"],
    trendKeywords: ["daily", "weekly", "monthly", "cohort"],
    structureKeywords: ["source", "channel", "region", "segment"],
    qualityKeywords: ["activation", "retention", "conversion"],
    riskKeywords: ["churn", "drop", "inactive"],
    opportunityKeywords: ["source", "high conversion", "retention"],
    breakdownDimensions: ["来源", "渠道", "地区", "用户分群", "时间段"]
  },
  {
    businessType: "marketing",
    title: "营销投放",
    keywords: ["campaign", "impressions", "clicks", "spend", "conversion", "ctr", "cpc", "cpa"],
    coreKeywords: ["impressions", "clicks", "spend", "conversion"],
    trendKeywords: ["spend", "conversion"],
    structureKeywords: ["campaign", "channel"],
    qualityKeywords: ["ctr", "cpc", "cpa"],
    riskKeywords: ["cpa", "cpc", "spend"],
    opportunityKeywords: ["ctr", "conversion"],
    breakdownDimensions: ["渠道", "Campaign", "广告组", "时间段"]
  },
  {
    businessType: "operations",
    title: "运营效率",
    keywords: ["operation", "inventory", "stock", "delivery", "sla", "warehouse", "ticket", "status"],
    coreKeywords: ["inventory", "stock", "sla", "delivery", "ticket", "status"],
    trendKeywords: ["daily", "weekly", "created_at", "resolved_at"],
    structureKeywords: ["status", "warehouse", "region", "priority"],
    qualityKeywords: ["sla", "resolution", "delay", "completion"],
    riskKeywords: ["delay", "failed", "backlog", "out of stock"],
    opportunityKeywords: ["capacity", "efficiency", "throughput"],
    breakdownDimensions: ["状态", "仓库", "地区", "优先级", "时间段"]
  },
  {
    businessType: "generic",
    title: "通用业务数据",
    keywords: [],
    coreKeywords: ["total", "count", "average", "sum"],
    trendKeywords: ["date", "daily", "monthly"],
    structureKeywords: ["category", "type", "status"],
    qualityKeywords: ["rate", "ratio"],
    riskKeywords: ["failed", "negative", "low"],
    opportunityKeywords: ["top", "high", "growth"],
    breakdownDimensions: ["类别", "状态", "时间段", "对象"]
  }
];

export function skillForBusinessType(businessType: ReportBusinessType) {
  return reportSkillRegistry.find((skill) => skill.businessType === businessType) ?? reportSkillRegistry.at(-1)!;
}
