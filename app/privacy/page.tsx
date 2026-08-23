import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "隐私政策｜Monarca AI",
  description: "Monarca AI 对用户提交信息的处理说明。"
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#e7ebe8] px-4 py-10 text-slate-950 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_70px_rgba(15,23,42,0.05)] sm:p-8">
        <h1 className="text-3xl font-black tracking-normal">隐私政策</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          Monarca 会使用你主动提交的姓名、联系方式、产品、店铺、供应链和运营需求信息，用于评估合作机会并与你联系。
          我们不会要求你提交店铺密码、Access Token、API key 或任何第三方平台登录凭证。
        </p>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          申请信息仅供 Monarca 内部评估、沟通和合作管理使用。你可以通过 Monarca 官网提供的联系方式请求更正或删除已提交的信息。
        </p>
        <Link href="/apply" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white">
          返回申请页
        </Link>
      </article>
    </main>
  );
}
