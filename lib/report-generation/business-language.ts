export type BusinessLocale = "zh" | "en";

export type MetricLanguage = {
  key: string;
  label: string;
  pluralLabel: string;
  topPhrase: string;
  highestPhrase: string;
  nextFocus: string[];
  isCountLike: boolean;
};

export type DimensionLanguage = {
  key: string;
  label: string;
  pluralLabel: string;
  sampleSourceLabel: string;
  nextFocus: string[];
};

function normalize(value?: string | null) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compact(value?: string | null) {
  return normalize(value).replace(/\s+/g, "_");
}

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function titleCase(value?: string | null) {
  return String(value ?? "metric")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function businessMetricLanguage(input: {
  metricName?: string | null;
  displayName?: string | null;
  formula?: string | null;
  metricField?: string | null;
  unit?: string | null;
  locale?: BusinessLocale;
}): MetricLanguage {
  const locale = input.locale ?? "zh";
  const text = normalize([
    input.metricName,
    input.displayName,
    input.metricField,
    input.formula,
    input.unit
  ].filter(Boolean).join(" "));
  const formula = normalize(input.formula);
  const isCountFormula = /\bcount\b/i.test(input.formula ?? "") || /count_non_empty|count_distinct/i.test(input.formula ?? "");

  const zh = (key: string, label: string, pluralLabel: string, topPhrase: string, highestPhrase: string, nextFocus: string[], isCountLike = false): MetricLanguage => ({
    key,
    label,
    pluralLabel,
    topPhrase,
    highestPhrase,
    nextFocus,
    isCountLike
  });
  const en = (key: string, label: string, pluralLabel: string, topPhrase: string, highestPhrase: string, nextFocus: string[], isCountLike = false): MetricLanguage => ({
    key,
    label,
    pluralLabel,
    topPhrase,
    highestPhrase,
    nextFocus,
    isCountLike
  });

  if (includesAny(text, ["ctr", "click through", "click rate"])) {
    return locale === "zh"
      ? zh("ctr", "点击率", "点击率", "点击率最高", "点击率最高", ["曝光量", "点击量", "转化率"])
      : en("ctr", "click-through rate", "click-through rate", "has the highest click-through rate", "highest click-through rate", ["impressions", "clicks", "conversion rate"]);
  }
  if (includesAny(text, ["conversion rate", "conversion_rate", "conv rate"])) {
    return locale === "zh"
      ? zh("conversion_rate", "转化率", "转化率", "转化率最高", "转化率最高", ["订单数", "收入贡献", "获客成本"])
      : en("conversion_rate", "conversion rate", "conversion rate", "has the highest conversion rate", "highest conversion rate", ["orders", "revenue contribution", "acquisition cost"]);
  }
  if (includesAny(text, ["retention"])) {
    return locale === "zh"
      ? zh("retention", "留存率", "留存表现", "留存表现最好", "留存表现最好", ["活跃用户数", "复购表现", "流失率"])
      : en("retention", "retention", "retention performance", "has the best retention", "best retention", ["active users", "repeat behavior", "churn"]);
  }
  if (includesAny(text, ["churn"])) {
    return locale === "zh"
      ? zh("churn", "流失率", "流失率", "流失率最高", "流失率最高", ["留存率", "流失原因", "客户分群"])
      : en("churn", "churn rate", "churn rate", "has the highest churn", "highest churn", ["retention", "churn reasons", "customer segments"]);
  }
  if (includesAny(text, ["revenue", "sales", "gmv", "gross merchandise", "transaction amount", "order amount", "paid amount"])) {
    return locale === "zh"
      ? zh("revenue", "收入", "收入", "收入最高", "贡献了最多销售额", ["订单量", "客单价", "客户增长"])
      : en("revenue", "revenue", "revenue", "has the highest revenue", "highest revenue", ["order volume", "average order value", "customer growth"]);
  }
  if (includesAny(text, ["order", "orders"])) {
    return locale === "zh"
      ? zh("orders", "订单数", "订单数", "订单数最多", "带来的订单最多", ["转化率", "客单价", "收入贡献"], true)
      : en("orders", "order count", "orders", "has the most orders", "most orders", ["conversion rate", "average order value", "revenue contribution"], true);
  }
  if (includesAny(text, ["active user", "active_users"])) {
    return locale === "zh"
      ? zh("active_users", "活跃用户数", "活跃用户数", "活跃用户数最多", "活跃用户数最多", ["留存率", "使用频次", "转化表现"], true)
      : en("active_users", "active users", "active users", "has the most active users", "most active users", ["retention", "usage frequency", "conversion"], true);
  }
  if (includesAny(text, ["customer", "customers"])) {
    return locale === "zh"
      ? zh("customers", "客户数", "客户数量", "客户数量最多", "客户数量最多", ["客户增长", "收入贡献", "留存表现"], true)
      : en("customers", "customers", "customers", "has the most customers", "most customers", ["customer growth", "revenue contribution", "retention"], true);
  }
  if (includesAny(text, ["user", "users"])) {
    return locale === "zh"
      ? zh("users", "用户数", "用户数", "用户数最多", "用户数最多", ["活跃用户数", "留存率", "转化表现"], true)
      : en("users", "users", "users", "has the most users", "most users", ["active users", "retention", "conversion"], true);
  }
  if (includesAny(text, ["session", "sessions", "visit", "visits"])) {
    return locale === "zh"
      ? zh("sessions", "访问次数", "访问次数", "访问次数最多", "访问次数最多", ["转化率", "访问来源", "用户留存"], true)
      : en("sessions", "visits", "visits", "has the most visits", "most visits", ["conversion rate", "traffic source", "retention"], true);
  }
  if (includesAny(text, ["impression", "impressions"])) {
    return locale === "zh"
      ? zh("impressions", "曝光量", "曝光量", "曝光量最高", "曝光量最高", ["点击率", "点击量", "转化率"], true)
      : en("impressions", "impressions", "impressions", "has the most impressions", "most impressions", ["click-through rate", "clicks", "conversion rate"], true);
  }
  if (includesAny(text, ["click", "clicks"])) {
    return locale === "zh"
      ? zh("clicks", "点击量", "点击量", "点击量最高", "点击量最高", ["点击率", "转化率", "订单数"], true)
      : en("clicks", "clicks", "clicks", "has the most clicks", "most clicks", ["click-through rate", "conversion rate", "orders"], true);
  }
  if (includesAny(text, ["install", "installs", "download", "downloads"])) {
    return locale === "zh"
      ? zh("installs", "安装量", "安装量", "安装量最多", "安装量最多", ["评分表现", "评论情绪", "留存质量"], true)
      : en("installs", "installs", "installs", "has the most installs", "most installs", ["rating performance", "review sentiment", "retention quality"], true);
  }
  if (includesAny(text, ["record", "records", "row count", "row_count", "count", "count non empty"]) || isCountFormula || formula === "count") {
    return locale === "zh"
      ? zh("records", "记录数量", "记录数量", "记录数量最多", "记录数量最多", ["增长趋势", "收入贡献", "用户表现"], true)
      : en("records", "record count", "records", "has the most records", "most records", ["growth trend", "revenue contribution", "user performance"], true);
  }

  const fallback = titleCase(input.displayName ?? input.metricName ?? input.metricField);
  return locale === "zh"
    ? zh("metric", fallback, fallback, `${fallback}最高`, `${fallback}最高`, ["趋势变化", "分组差异", "业务影响"])
    : en("metric", fallback, fallback, `has the highest ${fallback}`, `highest ${fallback}`, ["trend changes", "segment differences", "business impact"]);
}

export function businessDimensionLanguage(field?: string | null, locale: BusinessLocale = "zh"): DimensionLanguage {
  const value = compact(field);
  const raw = titleCase(field);
  const zh = (key: string, label: string, pluralLabel: string, sampleSourceLabel: string, nextFocus: string[]): DimensionLanguage => ({
    key,
    label,
    pluralLabel,
    sampleSourceLabel,
    nextFocus
  });
  const en = (key: string, label: string, pluralLabel: string, sampleSourceLabel: string, nextFocus: string[]): DimensionLanguage => ({
    key,
    label,
    pluralLabel,
    sampleSourceLabel,
    nextFocus
  });

  if (/(^|_)(app_category|product_category|category|industry|vertical|segment|business_type)($|_)/.test(value) || includesAny(value, ["category", "industry", "vertical", "segment", "business_type"])) {
    if (includesAny(value, ["app_category"])) {
      return locale === "zh"
        ? zh("app_category", "应用类别", "应用类别", "应用类别", ["增长趋势", "收入贡献", "用户表现"])
        : en("app_category", "app category", "app categories", "app category", ["growth trend", "revenue contribution", "user performance"]);
    }
    if (includesAny(value, ["industry", "vertical"])) {
      return locale === "zh"
        ? zh("industry", "行业类别", "行业类别", "行业类别", ["增长趋势", "收入贡献", "客户表现"])
        : en("industry", "industry category", "industry categories", "industry category", ["growth trend", "revenue contribution", "customer performance"]);
    }
    if (includesAny(value, ["segment"])) {
      return locale === "zh"
        ? zh("segment", "细分领域", "细分领域", "细分领域", ["增长趋势", "收入贡献", "用户表现"])
        : en("segment", "segment", "segments", "segment", ["growth trend", "revenue contribution", "user performance"]);
    }
    return locale === "zh"
      ? zh("category", "类别", "类别", "类别", ["增长趋势", "收入贡献", "用户表现"])
      : en("category", "category", "categories", "category", ["growth trend", "revenue contribution", "user performance"]);
  }
  if (/(^|_)(region|country|city|market|state|province|geo|location)($|_)/.test(value)) {
    return locale === "zh"
      ? zh("region", "地区", "地区", "地区市场", ["订单量", "客单价", "客户增长"])
      : en("region", "region", "regions", "regional market", ["order volume", "average order value", "customer growth"]);
  }
  if (/(^|_)(channel|source|medium|campaign|traffic_source|acquisition_channel)($|_)/.test(value)) {
    return locale === "zh"
      ? zh("channel", "渠道", "渠道", "渠道来源", ["转化率", "获客成本", "收入贡献"])
      : en("channel", "channel", "channels", "channel source", ["conversion rate", "acquisition cost", "revenue contribution"]);
  }
  if (/(^|_)(app|app_name|application_name)($|_)/.test(value)) {
    return locale === "zh"
      ? zh("app", "App", "App", "App", ["安装量", "评分表现", "评论情绪"])
      : en("app", "app", "apps", "app", ["installs", "rating performance", "review sentiment"]);
  }
  if (/(^|_)(product_name|product|sku|item_name|item)($|_)/.test(value)) {
    return locale === "zh"
      ? zh("product", "产品", "产品", "产品", ["销量", "收入贡献", "复购表现"])
      : en("product", "product", "products", "product", ["sales volume", "revenue contribution", "repeat behavior"]);
  }
  if (/(^|_)(customer|customer_name|account|client)($|_)/.test(value)) {
    return locale === "zh"
      ? zh("customer", "客户", "客户", "客户群体", ["收入贡献", "复购表现", "流失风险"])
      : en("customer", "customer", "customers", "customer group", ["revenue contribution", "repeat behavior", "churn risk"]);
  }

  return locale === "zh"
    ? zh("dimension", raw, raw, raw, ["趋势变化", "分组差异", "业务影响"])
    : en("dimension", raw, raw, raw, ["trend changes", "segment differences", "business impact"]);
}

export function explainBusinessValues(values: string[], locale: BusinessLocale = "zh") {
  const explanations = values
    .map((value) => {
      const key = normalize(value);
      const zhMap: Record<string, string> = {
        "food beverage": "餐饮食品相关场景",
        "beauty personal care": "美妆个护相关场景",
        "home kitchen": "家居厨房相关场景",
        "communication": "通讯类应用",
        "finance": "金融类应用",
        "shopping": "电商或购物类应用",
        "health fitness": "健康或健身类应用",
        "education": "教育类应用",
        "entertainment": "娱乐类应用",
        "productivity": "效率工具类应用"
      };
      const enMap: Record<string, string> = {
        "food beverage": "food and beverage scenarios",
        "beauty personal care": "beauty and personal care scenarios",
        "home kitchen": "home and kitchen scenarios",
        "communication": "communication apps",
        "finance": "finance apps",
        "shopping": "commerce or shopping apps",
        "health fitness": "health or fitness apps",
        "education": "education apps",
        "entertainment": "entertainment apps",
        "productivity": "productivity apps"
      };

      return locale === "zh" ? zhMap[key] : enMap[key];
    })
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(explanations));
}

function joinValues(values: string[], locale: BusinessLocale) {
  const visible = values.filter(Boolean).slice(0, 3);

  if (locale === "zh") return visible.join("、");
  if (visible.length <= 1) return visible[0] ?? "";
  if (visible.length === 2) return `${visible[0]} and ${visible[1]}`;
  return `${visible.slice(0, -1).join(", ")}, and ${visible.at(-1)}`;
}

export function topDimensionInsightText(input: {
  metricName?: string | null;
  displayName?: string | null;
  metricField?: string | null;
  formula?: string | null;
  dimension?: string | null;
  values: string[];
  topShare?: number | null;
  locale?: BusinessLocale;
}) {
  const locale = input.locale ?? "zh";
  const metric = businessMetricLanguage(input);
  const dimension = businessDimensionLanguage(input.dimension, locale);
  const topValues = joinValues(input.values, locale);
  const explanations = explainBusinessValues(input.values, locale);
  const nextFocus = Array.from(new Set([...dimension.nextFocus, ...metric.nextFocus])).slice(0, 3);

  if (locale === "en") {
    return {
      title: `Which ${dimension.pluralLabel} have the ${metric.highestPhrase}?`,
      conclusion: `${topValues} ${input.values.length > 1 ? "are" : "is"} the ${dimension.pluralLabel} with the ${metric.highestPhrase}.`,
      explanation: explanations.length
        ? `This suggests the current sample is mainly coming from ${joinValues(explanations, locale)}.`
        : `This shows where the current ${metric.pluralLabel} is concentrated across ${dimension.pluralLabel}.`,
      nextAction: `Next, review ${nextFocus.join(", ")} for these ${dimension.pluralLabel}.`,
      body: `${topValues} ${input.values.length > 1 ? "are" : "is"} the ${dimension.pluralLabel} with the ${metric.highestPhrase}. ${explanations.length
        ? `This suggests the current sample is mainly coming from ${joinValues(explanations, locale)}.`
        : `This shows where the current ${metric.pluralLabel} is concentrated across ${dimension.pluralLabel}.`} Next, review ${nextFocus.join(", ")} for these ${dimension.pluralLabel}.`
    };
  }

  const shareText = typeof input.topShare === "number" ? `，前三合计占比 ${(input.topShare * 100).toFixed(1)}%` : "";
  const explanation = explanations.length
    ? `说明当前样本主要来自${joinValues(explanations, locale)}`
    : `说明当前${metric.pluralLabel}主要集中在这些${dimension.sampleSourceLabel}`;

  return {
    title: `哪些${dimension.pluralLabel}的${metric.pluralLabel}最多？`,
    conclusion: `这份数据中，${topValues} 这几个${dimension.pluralLabel}的${metric.topPhrase}${shareText}。`,
    explanation: `${explanation}。`,
    nextAction: `建议接下来重点查看这些${dimension.pluralLabel}的${nextFocus.join("、")}。`,
    body: `这份数据中，${topValues} 这几个${dimension.pluralLabel}的${metric.topPhrase}${shareText}。${explanation}。建议接下来重点查看这些${dimension.pluralLabel}的${nextFocus.join("、")}。`
  };
}

