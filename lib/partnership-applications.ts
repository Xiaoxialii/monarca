export const BUSINESS_STAGE_OPTIONS = [
  { value: "OVERSEAS_STORE", label: "已有海外电商店铺" },
  { value: "DOMESTIC_READY_OVERSEAS", label: "国内销售，准备进入海外市场" },
  { value: "FACTORY_OR_SUPPLIER", label: "工厂或供应商，拥有成熟产品" },
  { value: "OVERSEAS_EXPANDING_CHANNELS", label: "已在海外销售，希望扩展新渠道" },
  { value: "OTHER", label: "其他" }
] as const;

export const SALES_CHANNEL_OPTIONS = [
  { value: "SHOPIFY", label: "Shopify" },
  { value: "AMAZON", label: "Amazon" },
  { value: "TIKTOK_SHOP", label: "TikTok Shop" },
  { value: "WALMART", label: "Walmart" },
  { value: "EBAY", label: "eBay" },
  { value: "TAOBAO_TMALL", label: "淘宝/天猫" },
  { value: "JD", label: "京东" },
  { value: "PINDUODUO", label: "拼多多" },
  { value: "INDEPENDENT_SITE", label: "其他独立站" },
  { value: "NO_ONLINE_CHANNEL", label: "暂无线上销售渠道" },
  { value: "OTHER", label: "其他" }
] as const;

export const FULFILLMENT_CAPABILITY_OPTIONS = [
  { value: "OVERSEAS_WAREHOUSE", label: "已有海外仓" },
  { value: "DOMESTIC_DIRECT_SHIPPING", label: "可以从国内直接发往海外" },
  { value: "THIRD_PARTY_CROSS_BORDER_LOGISTICS", label: "已有第三方跨境物流合作商" },
  { value: "NEED_MONARCA_SUPPORT", label: "目前没有，需要 Monarca 协助" },
  { value: "UNSURE_DISCUSS", label: "不确定，希望进一步沟通" }
] as const;

export const REQUESTED_SERVICE_OPTIONS = [
  { value: "OVERSEAS_SITE_AND_STORE_OPERATIONS", label: "海外建站与店铺运营" },
  { value: "AMAZON_OPERATIONS", label: "Amazon 运营" },
  { value: "TIKTOK_SHOP_OPERATIONS", label: "TikTok Shop 运营" },
  { value: "PRODUCT_PAGE_TITLE_IMAGE_OPTIMIZATION", label: "产品页、标题及图片优化" },
  { value: "OVERSEAS_CREATOR_MARKETING", label: "海外达人营销" },
  { value: "META_ADS", label: "Meta Ads 广告投放" },
  { value: "GOOGLE_ADS", label: "Google Ads 广告投放" },
  { value: "AMAZON_ADS", label: "Amazon Ads 广告投放" },
  { value: "OVERSEAS_PRICING_STRATEGY", label: "海外定价策略" },
  { value: "INVENTORY_REPLENISHMENT_PLANNING", label: "库存与补货规划" },
  { value: "FULL_SERVICE_OVERSEAS_OPERATIONS", label: "全流程海外代运营" },
  { value: "OTHER", label: "其他" }
] as const;

export const APPLICATION_STATUS_OPTIONS = [
  { value: "NEW", label: "新申请" },
  { value: "UNDER_REVIEW", label: "审核中" },
  { value: "QUALIFIED", label: "有潜力" },
  { value: "CONTACTED", label: "已联系" },
  { value: "ACCEPTED", label: "已接受" },
  { value: "REJECTED", label: "已拒绝" },
  { value: "ARCHIVED", label: "已归档" }
] as const;

export type BusinessStage = (typeof BUSINESS_STAGE_OPTIONS)[number]["value"];
export type SalesChannel = (typeof SALES_CHANNEL_OPTIONS)[number]["value"];
export type FulfillmentCapability = (typeof FULFILLMENT_CAPABILITY_OPTIONS)[number]["value"];
export type RequestedService = (typeof REQUESTED_SERVICE_OPTIONS)[number]["value"];
export type ApplicationStatus = (typeof APPLICATION_STATUS_OPTIONS)[number]["value"];

export type StorePartnershipApplicationInput = {
  name?: unknown;
  contact?: unknown;
  email?: unknown;
  wechat?: unknown;
  businessStage?: unknown;
  storeOrProductUrl?: unknown;
  salesChannels?: unknown;
  otherSalesChannel?: unknown;
  fulfillmentCapability?: unknown;
  requestedServices?: unknown;
  otherRequestedService?: unknown;
  businessDescription?: unknown;
  consentAccepted?: unknown;
  website?: unknown;
};

export type NormalizedStorePartnershipApplication = {
  name: string;
  email: string | null;
  wechat: string | null;
  businessStage: BusinessStage;
  storeOrProductUrl: string | null;
  salesChannels: SalesChannel[];
  otherSalesChannel: string | null;
  fulfillmentCapability: FulfillmentCapability;
  requestedServices: RequestedService[];
  otherRequestedService: string | null;
  businessDescription: string | null;
  consentAccepted: true;
  source: "PUBLIC_APPLICATION_PAGE";
};

export type ValidationResult =
  | { success: true; data: NormalizedStorePartnershipApplication }
  | { success: false; fieldErrors: Record<string, string>; message: string; honeypot?: boolean };

const businessStageValues: Set<string> = new Set(BUSINESS_STAGE_OPTIONS.map((option) => option.value));
const salesChannelValues: Set<string> = new Set(SALES_CHANNEL_OPTIONS.map((option) => option.value));
const fulfillmentValues: Set<string> = new Set(FULFILLMENT_CAPABILITY_OPTIONS.map((option) => option.value));
const serviceValues: Set<string> = new Set(REQUESTED_SERVICE_OPTIONS.map((option) => option.value));
function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function nullableText(value: unknown, maxLength: number) {
  const normalized = text(value, maxLength);
  return normalized || null;
}

function normalizeEmail(value: unknown) {
  return nullableText(value, 320)?.toLowerCase() ?? null;
}

function normalizeStringArray<T extends string>(value: unknown, allowed: Set<string>, maxItems: number): T[] {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => allowed.has(item))
  )).slice(0, maxItems) as T[];
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validWechat(value: string) {
  return /^[\p{Script=Han}A-Za-z0-9_-]+$/u.test(value);
}

function normalizeUrl(value: unknown) {
  const raw = nullableText(value, 1000);
  if (!raw) return { value: null, valid: true };
  if (["无", "沒有", "没有", "none", "n/a", "na", "not available"].includes(raw.toLowerCase())) {
    return { value: null, valid: true, intentionallyEmpty: true };
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { value: null, valid: false };
    }

    url.hash = "";
    return { value: url.toString(), valid: true, intentionallyEmpty: false };
  } catch {
    return { value: null, valid: false, intentionallyEmpty: false };
  }
}

export function validateStorePartnershipApplication(input: StorePartnershipApplicationInput): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const honeypot = text(input.website, 200);

  if (honeypot) {
    return {
      success: false,
      fieldErrors: { website: "Submission rejected." },
      message: "Submission rejected.",
      honeypot: true
    };
  }

  const name = text(input.name, 100);
  const contact = nullableText(input.contact, 320);
  let email = normalizeEmail(input.email);
  let wechat = nullableText(input.wechat, 100);
  const contactLooksLikeEmail = Boolean(contact?.includes("@"));

  if (!email && !wechat && contact) {
    if (contactLooksLikeEmail) {
      email = normalizeEmail(contact);
    } else {
      wechat = text(contact, 100);
    }
  }
  const businessStage = typeof input.businessStage === "string" && businessStageValues.has(input.businessStage)
    ? input.businessStage as BusinessStage
    : null;
  const url = normalizeUrl(input.storeOrProductUrl);
  const salesChannels = normalizeStringArray<SalesChannel>(input.salesChannels, salesChannelValues, 12);
  const requestedServices = normalizeStringArray<RequestedService>(input.requestedServices, serviceValues, 12);
  const fulfillmentCapability = typeof input.fulfillmentCapability === "string" && fulfillmentValues.has(input.fulfillmentCapability)
    ? input.fulfillmentCapability as FulfillmentCapability
    : null;
  const otherSalesChannel = nullableText(input.otherSalesChannel, 200);
  const otherRequestedService = nullableText(input.otherRequestedService, 200);
  const businessDescription = nullableText(input.businessDescription, 2000);
  const consentAccepted = input.consentAccepted === true;

  if (name.length < 2) {
    fieldErrors.name = "请输入姓名，至少 2 个字符。";
  }

  if (!email && !wechat) {
    fieldErrors.contact = "请填写邮箱或微信号。";
    fieldErrors.email = "请至少填写邮箱或微信号中的一项。";
    fieldErrors.wechat = "请至少填写邮箱或微信号中的一项。";
  }

  if (email && !validEmail(email)) {
    fieldErrors.email = "请输入有效的邮箱地址。";
    if (contactLooksLikeEmail) fieldErrors.contact = "请输入有效的邮箱地址。";
  }

  if (wechat && !validWechat(wechat)) {
    fieldErrors.wechat = "微信号仅支持中文、英文、数字、下划线和连字符。";
    if (contact && !contactLooksLikeEmail) fieldErrors.contact = "微信号仅支持中文、英文、数字、下划线和连字符。";
  }

  if (!businessStage) {
    fieldErrors.businessStage = "请选择业务阶段。";
  }

  if (!url.valid) {
    fieldErrors.storeOrProductUrl = "请输入有效的 HTTP/HTTPS 网页链接。";
  } else if (!url.value && !url.intentionallyEmpty) {
    fieldErrors.storeOrProductUrl = "请填写店铺或产品链接。";
  }

  if (salesChannels.length === 0) {
    fieldErrors.salesChannels = "请至少选择一个主要销售渠道。";
  }

  if (salesChannels.includes("NO_ONLINE_CHANNEL") && salesChannels.length > 1) {
    fieldErrors.salesChannels = "选择“暂无线上销售渠道”时，不能同时选择其他渠道。";
  }

  if (salesChannels.includes("OTHER") && !otherSalesChannel) {
    fieldErrors.otherSalesChannel = "请补充说明其他销售渠道。";
  }

  if (!fulfillmentCapability) {
    fieldErrors.fulfillmentCapability = "请选择海外发货能力。";
  }

  if (requestedServices.length === 0) {
    fieldErrors.requestedServices = "请至少选择一项希望 Monarca 提供的帮助。";
  }

  if (requestedServices.includes("OTHER") && !otherRequestedService) {
    fieldErrors.otherRequestedService = "请补充说明其他运营需求。";
  }

  if (!consentAccepted) {
    fieldErrors.consentAccepted = "请确认并同意联系与数据处理授权。";
  }

  if (Object.keys(fieldErrors).length > 0 || !businessStage || !fulfillmentCapability || !consentAccepted) {
    return {
      success: false,
      fieldErrors,
      message: "请检查表单中标记的字段。"
    };
  }

  return {
    success: true,
    data: {
      name,
      email,
      wechat,
      businessStage,
      storeOrProductUrl: url.value,
      salesChannels,
      otherSalesChannel: salesChannels.includes("OTHER") ? otherSalesChannel : null,
      fulfillmentCapability,
      requestedServices,
      otherRequestedService: requestedServices.includes("OTHER") ? otherRequestedService : null,
      businessDescription,
      consentAccepted: true,
      source: "PUBLIC_APPLICATION_PAGE"
    }
  };
}

export function labelForOption<T extends string>(options: readonly { value: T; label: string }[], value: string | null | undefined) {
  return options.find((option) => option.value === value)?.label ?? value ?? "-";
}
