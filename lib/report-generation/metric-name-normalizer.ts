function titleCaseToken(token: string) {
  const upper = token.toUpperCase();

  if (["ARR", "MRR", "GMV", "CAC", "CTR", "CPC", "CPA", "ROI", "SKU", "AOV"].includes(upper)) {
    return upper;
  }

  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export function normalizeMetricName(name: string) {
  return name
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(titleCaseToken)
    .join(" ")
    .replace(/\bSentiment Polarity\b/g, "Sentiment Polarity")
    .replace(/\bSentiment Subjectivity\b/g, "Sentiment Subjectivity")
    .replace(/\bStddev\b/g, "StdDev");
}

function labelFromExpression(expression: string) {
  const refs = Array.from(expression.matchAll(/([A-Za-z_][\w]*)\.([A-Za-z_][\w]*)/g));
  const raw = refs.at(-1)?.[2] ?? expression.split(".").at(-1) ?? expression;

  return normalizeMetricName(raw.replace(/[()`"]/g, "").trim());
}

export function contextualMetricName(name: string, formula = "") {
  const topShareMatch = /^TOP_N_SHARE\s*\(\s*(.+?)\s+BY\s+(.+?),\s*(\d+)\s*\)$/i.exec(formula.trim());

  if (topShareMatch) {
    const metricLabel = labelFromExpression(topShareMatch[1]);
    const dimensionLabel = labelFromExpression(topShareMatch[2]);
    const count = topShareMatch[3];

    return `Top ${count} ${dimensionLabel} ${metricLabel} Share`;
  }

  return normalizeMetricName(name);
}

export function metricNameKey(name: string) {
  return normalizeMetricName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^average_/, "avg_")
    .replace(/^avg_/, "average_")
    .replace(/_score$/, "_sentiment_score")
    .replace(/_polarity$/, "_sentiment_polarity")
    .replace(/_sentiment_sentiment_polarity$/, "_sentiment_polarity")
    .replace(/^_+|_+$/g, "");
}
