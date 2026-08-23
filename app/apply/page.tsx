import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PartnershipApplicationForm } from "@/components/partnership-application-form";
import { BrandLogo } from "@/components/brand-logo";
import { getRequestLocale } from "@/lib/server-locale";

export const metadata: Metadata = {
  title: "提交店铺或产品｜Monarca 海外电商运营合作",
  description: "提交你的产品、店铺和海外运营需求，申请由 Monarca 提供海外建站、渠道运营、广告、达人营销与库存优化服务。"
};

const pageCopy = {
  zh: {
    eyebrow: "MONARCA 运营合作",
    title: "提交你的店铺或产品",
    subtitle: "告诉我们你的业务现状和海外运营需求，Monarca 将在收到申请后与你联系。",
    back: "返回首页"
  },
  en: {
    eyebrow: "MONARCA OPERATIONS PARTNERSHIP",
    title: "Submit Your Store or Products",
    subtitle: "Tell us about your business and overseas operations needs. Monarca will contact you after receiving your application.",
    back: "Back Home"
  }
} as const;

export default async function ApplyPage() {
  const locale = await getRequestLocale("en");
  const isZh = locale === "zh";
  const copy = pageCopy[isZh ? "zh" : "en"];

  return (
    <main className="min-h-screen overflow-hidden bg-[#e7ebe8] text-slate-950">
      <header className="border-b border-slate-200/70 bg-white/78 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandLogo className="h-10" />
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <ArrowLeft className="size-4" />
            {copy.back}
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mx-auto mb-8 max-w-3xl text-center">
          <p className="text-sm font-semibold tracking-[0.16em] text-emerald-700">{copy.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-black leading-tight tracking-normal text-slate-950 sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-4 text-lg font-medium leading-8 text-slate-700">
            {copy.subtitle}
          </p>
        </div>

        <div className="mx-auto max-w-4xl">
          <PartnershipApplicationForm locale={isZh ? "zh" : "en"} />
        </div>
      </section>
    </main>
  );
}
