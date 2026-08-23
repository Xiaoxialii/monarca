"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import {
  BUSINESS_STAGE_OPTIONS,
  FULFILLMENT_CAPABILITY_OPTIONS,
  REQUESTED_SERVICE_OPTIONS,
  SALES_CHANNEL_OPTIONS,
  validateStorePartnershipApplication,
  type StorePartnershipApplicationInput
} from "@/lib/partnership-applications";
import { cn } from "@/lib/utils";

type FormLocale = "en" | "zh";

type FormState = {
  name: string;
  contact: string;
  businessStage: string;
  storeOrProductUrl: string;
  salesChannels: string[];
  otherSalesChannel: string;
  fulfillmentCapability: string;
  requestedServices: string[];
  otherRequestedService: string;
  businessDescription: string;
  consentAccepted: boolean;
  website: string;
};

const initialForm: FormState = {
  name: "",
  contact: "",
  businessStage: "",
  storeOrProductUrl: "",
  salesChannels: [],
  otherSalesChannel: "",
  fulfillmentCapability: "",
  requestedServices: [],
  otherRequestedService: "",
  businessDescription: "",
  consentAccepted: false,
  website: ""
};

const formCopy = {
  zh: {
    successTitle: "申请已收到",
    successText: "Monarca 将对你的产品、店铺和海外增长机会进行初步评估，并通过邮箱或微信与你联系。",
    backHome: "返回首页",
    sections: {
      contact: "联系方式",
      business: "业务现状",
      fulfillment: "海外履约能力",
      services: "运营需求"
    },
    fields: {
      name: "姓名",
      contact: "邮箱/微信号",
      businessStage: "业务阶段",
      storeOrProductUrl: "店铺或产品链接",
      salesChannels: "主要销售渠道",
      otherSalesChannel: "其他销售渠道",
      fulfillmentCapability: "是否具备海外发货能力",
      requestedServices: "希望 Monarca 提供哪些帮助",
      otherRequestedService: "其他运营需求",
      businessDescription: "产品和需求说明"
    },
    help: {
      contact: "填写邮箱或微信号，Monarca 将通过其中一种方式与你联系。",
      storeUrl: "支持 Shopify、Amazon、TikTok Shop、Walmart、eBay、淘宝、天猫、京东、拼多多、独立站或公开产品介绍链接。如暂无链接，请填写“无”。请勿提交店铺密码或任何登录凭证。"
    },
    placeholder: {
      select: "请选择",
      storeUrl: "https://...",
      businessDescription: "请简单介绍主要产品、目标市场、目前遇到的问题，以及希望优先拓展的海外渠道。"
    },
    consent: (
      <>
        我确认所提交的信息真实有效，并同意 Monarca 为评估合作机会处理这些信息，并通过邮箱或微信与我联系。查看
        <Link href="/privacy" className="font-semibold text-emerald-700 underline underline-offset-4">隐私政策</Link>。
      </>
    ),
    submit: "提交合作申请",
    submitting: "提交中",
    submitError: "申请提交失败，请检查信息后重试。",
    networkError: "网络连接异常，申请尚未提交。请稍后重试。"
  },
  en: {
    successTitle: "Application Received",
    successText: "Monarca will review your products, store, and overseas growth opportunity, then contact you by email or WeChat.",
    backHome: "Back Home",
    sections: {
      contact: "Contact",
      business: "Business Status",
      fulfillment: "Overseas Fulfillment",
      services: "Operations Needs"
    },
    fields: {
      name: "Name",
      contact: "Email / WeChat",
      businessStage: "Business Stage",
      storeOrProductUrl: "Store or Product Link",
      salesChannels: "Main Sales Channels",
      otherSalesChannel: "Other Sales Channel",
      fulfillmentCapability: "Overseas Fulfillment Capability",
      requestedServices: "How Monarca Can Help",
      otherRequestedService: "Other Operations Needs",
      businessDescription: "Product and Needs Description"
    },
    help: {
      contact: "Enter your email or WeChat. Monarca will contact you through one of these channels.",
      storeUrl: "Supports Shopify, Amazon, TikTok Shop, Walmart, eBay, Taobao, Tmall, JD, Pinduoduo, independent sites, or public product pages. If you do not have a link, enter \"None\". Do not submit store passwords or login credentials."
    },
    placeholder: {
      select: "Select",
      storeUrl: "https://...",
      businessDescription: "Briefly describe your main products, target markets, current challenges, and priority overseas channels."
    },
    consent: (
      <>
        I confirm that the information submitted is accurate, and agree that Monarca may process it to evaluate partnership opportunities and contact me by email or WeChat. View the{" "}
        <Link href="/privacy" className="font-semibold text-emerald-700 underline underline-offset-4">Privacy Policy</Link>.
      </>
    ),
    submit: "Submit Partnership Application",
    submitting: "Submitting",
    submitError: "Submission failed. Please check the form and try again.",
    networkError: "Network error. Your application has not been submitted. Please try again later."
  }
} as const;

const englishOptionLabels: Record<string, string> = {
  OVERSEAS_STORE: "Existing overseas ecommerce store",
  DOMESTIC_READY_OVERSEAS: "Selling domestically, preparing to enter overseas markets",
  FACTORY_OR_SUPPLIER: "Factory or supplier with mature products",
  OVERSEAS_EXPANDING_CHANNELS: "Already selling overseas, expanding new channels",
  OTHER: "Other",
  SHOPIFY: "Shopify",
  AMAZON: "Amazon",
  TIKTOK_SHOP: "TikTok Shop",
  WALMART: "Walmart",
  EBAY: "eBay",
  TAOBAO_TMALL: "Taobao / Tmall",
  JD: "JD",
  PINDUODUO: "Pinduoduo",
  INDEPENDENT_SITE: "Other independent site",
  NO_ONLINE_CHANNEL: "No online sales channel yet",
  OVERSEAS_WAREHOUSE: "Existing overseas warehouse",
  DOMESTIC_DIRECT_SHIPPING: "Can ship directly from China to overseas customers",
  THIRD_PARTY_CROSS_BORDER_LOGISTICS: "Existing third-party cross-border logistics partner",
  NEED_MONARCA_SUPPORT: "Not yet, need Monarca support",
  UNSURE_DISCUSS: "Not sure, would like to discuss",
  OVERSEAS_SITE_AND_STORE_OPERATIONS: "Overseas site and store operations",
  AMAZON_OPERATIONS: "Amazon operations",
  TIKTOK_SHOP_OPERATIONS: "TikTok Shop operations",
  PRODUCT_PAGE_TITLE_IMAGE_OPTIMIZATION: "Product page, title, and image optimization",
  OVERSEAS_CREATOR_MARKETING: "Overseas creator marketing",
  META_ADS: "Meta Ads",
  GOOGLE_ADS: "Google Ads",
  AMAZON_ADS: "Amazon Ads",
  OVERSEAS_PRICING_STRATEGY: "Overseas pricing strategy",
  INVENTORY_REPLENISHMENT_PLANNING: "Inventory and replenishment planning",
  FULL_SERVICE_OVERSEAS_OPERATIONS: "Full-service overseas operations"
};

function optionLabel(option: { value: string; label: string }, locale: FormLocale) {
  return locale === "en" ? englishOptionLabels[option.value] ?? option.label : option.label;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;

  return <p id={id} className="mt-1.5 text-sm font-medium text-red-700">{message}</p>;
}

function RequiredMark() {
  return <span className="text-red-600" aria-label="必填">*</span>;
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_70px_rgba(15,23,42,0.05)] sm:p-7">
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200 to-transparent" />
      <div className="butterfly-float pointer-events-none absolute -left-2 -top-2 grid size-12 place-items-center rounded-2xl border border-emerald-100 bg-emerald-50/85 shadow-[0_16px_42px_rgba(6,78,59,0.10)] backdrop-blur">
        <BrandLogo compact className="h-7 w-7 opacity-75" />
      </div>
      {title ? <h2 className="pl-8 text-lg font-semibold text-slate-950">{title}</h2> : null}
      {children}
    </section>
  );
}

function toggleValue(values: string[], value: string) {
  if (value === "NO_ONLINE_CHANNEL") {
    return values.includes(value) ? [] : [value];
  }

  const next = values.includes(value) ? values.filter((item) => item !== value) : [...values.filter((item) => item !== "NO_ONLINE_CHANNEL"), value];
  return next;
}

export function PartnershipApplicationForm({ locale = "zh" }: { locale?: FormLocale }) {
  const copy = formCopy[locale];
  const [form, setForm] = useState<FormState>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const localValidation = useMemo(() => validateStorePartnershipApplication(form as StorePartnershipApplicationInput), [form]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const validation = validateStorePartnershipApplication(form as StorePartnershipApplicationInput);

    if (!validation.success) {
      setFieldErrors(validation.fieldErrors);
      setFormError(validation.message);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/partnership-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        setFieldErrors(payload?.fieldErrors ?? {});
        setFormError(payload?.message || copy.submitError);
        return;
      }

      setSubmitted(true);
    } catch {
      setFormError(copy.networkError);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section className="mx-auto max-w-3xl rounded-[28px] border border-emerald-100 bg-white p-6 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-10">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-800">
          <Check className="size-6" />
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-normal text-slate-950">{copy.successTitle}</h1>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-slate-600">
          {copy.successText}
        </p>
        <Button asChild className="mt-6 h-12 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white hover:bg-slate-800">
          <Link href="/">{copy.backHome}</Link>
        </Button>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <input
        type="text"
        name="website"
        value={form.website}
        onChange={(event) => setField("website", event.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      <SectionCard title={copy.sections.contact}>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">{copy.fields.name} <RequiredMark /></span>
            <input
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "name-error" : undefined}
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
              maxLength={100}
            />
            <FieldError id="name-error" message={fieldErrors.name} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">{copy.fields.contact} <RequiredMark /></span>
            <input
              value={form.contact}
              onChange={(event) => setField("contact", event.target.value)}
              aria-invalid={Boolean(fieldErrors.contact)}
              aria-describedby={fieldErrors.contact ? "contact-error" : "contact-help"}
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
              maxLength={320}
            />
            <p id="contact-help" className="mt-1.5 text-xs leading-5 text-slate-500">{copy.help.contact}</p>
            <FieldError id="contact-error" message={fieldErrors.contact} />
          </label>
        </div>
      </SectionCard>

      <SectionCard title={copy.sections.business}>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">{copy.fields.businessStage} <RequiredMark /></span>
            <select
              value={form.businessStage}
              onChange={(event) => setField("businessStage", event.target.value)}
              aria-invalid={Boolean(fieldErrors.businessStage)}
              aria-describedby={fieldErrors.businessStage ? "businessStage-error" : undefined}
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
            >
              <option value="">{copy.placeholder.select}</option>
              {BUSINESS_STAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{optionLabel(option, locale)}</option>
              ))}
            </select>
            <FieldError id="businessStage-error" message={fieldErrors.businessStage} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">{copy.fields.storeOrProductUrl} <RequiredMark /></span>
            <input
              type="url"
              value={form.storeOrProductUrl}
              onChange={(event) => setField("storeOrProductUrl", event.target.value)}
              aria-invalid={Boolean(fieldErrors.storeOrProductUrl)}
              aria-describedby={fieldErrors.storeOrProductUrl ? "storeOrProductUrl-error" : "store-url-help"}
              placeholder={copy.placeholder.storeUrl}
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
              maxLength={1000}
            />
            <p id="store-url-help" className="mt-1.5 text-xs leading-5 text-slate-500">{copy.help.storeUrl}</p>
            <FieldError id="storeOrProductUrl-error" message={fieldErrors.storeOrProductUrl} />
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold text-slate-800">{copy.fields.salesChannels} <RequiredMark /></legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SALES_CHANNEL_OPTIONS.map((option) => (
              <label key={option.value} className={cn("flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium", form.salesChannels.includes(option.value) ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-700")}>
                <input
                  type="checkbox"
                  checked={form.salesChannels.includes(option.value)}
                  onChange={() => setField("salesChannels", toggleValue(form.salesChannels, option.value))}
                  className="size-4 accent-emerald-700"
                />
                {optionLabel(option, locale)}
              </label>
            ))}
          </div>
          <FieldError id="salesChannels-error" message={fieldErrors.salesChannels} />
        </fieldset>

        {form.salesChannels.includes("OTHER") ? (
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-800">{copy.fields.otherSalesChannel} <RequiredMark /></span>
            <input
              value={form.otherSalesChannel}
              onChange={(event) => setField("otherSalesChannel", event.target.value)}
              aria-invalid={Boolean(fieldErrors.otherSalesChannel)}
              aria-describedby={fieldErrors.otherSalesChannel ? "otherSalesChannel-error" : undefined}
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
              maxLength={200}
            />
            <FieldError id="otherSalesChannel-error" message={fieldErrors.otherSalesChannel} />
          </label>
        ) : null}
      </SectionCard>

      <SectionCard title={copy.sections.fulfillment}>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-slate-800">{copy.fields.fulfillmentCapability} <RequiredMark /></legend>
          <div className="mt-3 grid gap-2">
            {FULFILLMENT_CAPABILITY_OPTIONS.map((option) => (
              <label key={option.value} className={cn("flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium", form.fulfillmentCapability === option.value ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-700")}>
                <input
                  type="radio"
                  name="fulfillmentCapability"
                  checked={form.fulfillmentCapability === option.value}
                  onChange={() => setField("fulfillmentCapability", option.value)}
                  className="size-4 accent-emerald-700"
                />
                {optionLabel(option, locale)}
              </label>
            ))}
          </div>
          <FieldError id="fulfillmentCapability-error" message={fieldErrors.fulfillmentCapability} />
        </fieldset>
      </SectionCard>

      <SectionCard title={copy.sections.services}>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-slate-800">{copy.fields.requestedServices} <RequiredMark /></legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {REQUESTED_SERVICE_OPTIONS.map((option) => (
              <label key={option.value} className={cn("flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium", form.requestedServices.includes(option.value) ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-700")}>
                <input
                  type="checkbox"
                  checked={form.requestedServices.includes(option.value)}
                  onChange={() => setField("requestedServices", form.requestedServices.includes(option.value) ? form.requestedServices.filter((item) => item !== option.value) : [...form.requestedServices, option.value])}
                  className="size-4 accent-emerald-700"
                />
                {optionLabel(option, locale)}
              </label>
            ))}
          </div>
          <FieldError id="requestedServices-error" message={fieldErrors.requestedServices} />
        </fieldset>

        {form.requestedServices.includes("OTHER") ? (
          <label className="mt-4 block">
            <span className="text-sm font-semibold text-slate-800">{copy.fields.otherRequestedService} <RequiredMark /></span>
            <input
              value={form.otherRequestedService}
              onChange={(event) => setField("otherRequestedService", event.target.value)}
              aria-invalid={Boolean(fieldErrors.otherRequestedService)}
              aria-describedby={fieldErrors.otherRequestedService ? "otherRequestedService-error" : undefined}
              className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
              maxLength={200}
            />
            <FieldError id="otherRequestedService-error" message={fieldErrors.otherRequestedService} />
          </label>
        ) : null}

        <label className="mt-5 block">
          <span className="text-sm font-semibold text-slate-800">{copy.fields.businessDescription}</span>
          <textarea
            value={form.businessDescription}
            onChange={(event) => setField("businessDescription", event.target.value)}
            placeholder={copy.placeholder.businessDescription}
            className="mt-2 min-h-36 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
            maxLength={2000}
          />
          <span className="mt-1 block text-right text-xs text-slate-500">{form.businessDescription.length}/2000</span>
        </label>
      </SectionCard>

      <SectionCard>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={form.consentAccepted}
            onChange={(event) => setField("consentAccepted", event.target.checked)}
            aria-invalid={Boolean(fieldErrors.consentAccepted)}
            aria-describedby={fieldErrors.consentAccepted ? "consentAccepted-error" : undefined}
            className="mt-1 size-4 shrink-0 accent-emerald-700"
          />
          <span className="text-sm font-medium leading-6 text-slate-700">
            {copy.consent}
          </span>
        </label>
        <FieldError id="consentAccepted-error" message={fieldErrors.consentAccepted} />
      </SectionCard>

      {formError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">
          {formError}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div />
        <Button
          type="submit"
          disabled={isSubmitting || (!localValidation.success && Object.keys(fieldErrors).length > 0)}
          className="h-12 rounded-full bg-slate-950 px-7 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {copy.submitting}
            </>
          ) : (
            <>
              {copy.submit}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
