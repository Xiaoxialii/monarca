import { WorkspaceRole } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, WorkspaceAuthError } from "@/lib/workspace-auth";
import {
  APPLICATION_STATUS_OPTIONS,
  BUSINESS_STAGE_OPTIONS,
  FULFILLMENT_CAPABILITY_OPTIONS,
  REQUESTED_SERVICE_OPTIONS,
  SALES_CHANNEL_OPTIONS,
  labelForOption
} from "@/lib/partnership-applications";
import { PartnershipApplicationStatusForm } from "@/components/partnership-application-status-form";

export const dynamic = "force-dynamic";

function jsonList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function labels(options: readonly { value: string; label: string }[], value: unknown) {
  const items = jsonList(value);
  return items.length ? items.map((item) => labelForOption(options, item)).join("、") : "-";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function searchParamsUrl(params: Record<string, string | number | null | undefined>) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      next.set(key, String(value));
    }
  }

  const query = next.toString();
  return `/admin/partnership-applications${query ? `?${query}` : ""}`;
}

export default async function PartnershipApplicationsAdminPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  } catch (error) {
    if (error instanceof WorkspaceAuthError && error.status === 401) {
      redirect("/sign-in");
    }

    redirect("/dashboard");
  }

  const resolved = await searchParams;
  const q = typeof resolved.q === "string" ? resolved.q.trim() : "";
  const status = typeof resolved.status === "string" ? resolved.status : "";
  const businessStage = typeof resolved.businessStage === "string" ? resolved.businessStage : "";
  const selectedId = typeof resolved.id === "string" ? resolved.id : "";
  const page = Math.max(1, Number(typeof resolved.page === "string" ? resolved.page : "1") || 1);
  const pageSize = 20;
  const statusValues = new Set(APPLICATION_STATUS_OPTIONS.map((item) => item.value));
  const stageValues = new Set(BUSINESS_STAGE_OPTIONS.map((item) => item.value));
  const where = {
    ...(statusValues.has(status as never) ? { status: status as never } : {}),
    ...(stageValues.has(businessStage as never) ? { businessStage: businessStage as never } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { wechat: { contains: q, mode: "insensitive" as const } },
            { storeOrProductUrl: { contains: q, mode: "insensitive" as const } }
          ]
        }
      : {})
  };
  const [applications, total, selected] = await Promise.all([
    prisma.storePartnershipApplication.findMany({
      where,
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.storePartnershipApplication.count({ where }),
    selectedId ? prisma.storePartnershipApplication.findUnique({ where: { id: selectedId } }) : null
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="min-h-screen bg-[#fbfcfa] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">内部管理</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">店铺与产品合作申请</h1>
            <p className="mt-2 text-sm text-slate-500">仅 workspace owner / admin 可访问，默认按提交时间倒序排列。</p>
          </div>
          <Link href="/dashboard" className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
            返回 Dashboard
          </Link>
        </header>

        <form className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_220px_220px_auto]">
          <input
            name="q"
            defaultValue={q}
            placeholder="搜索姓名、邮箱、微信、店铺链接"
            className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
          />
          <select name="status" defaultValue={status} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100">
            <option value="">全部状态</option>
            {APPLICATION_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select name="businessStage" defaultValue={businessStage} className="h-10 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100">
            <option value="">全部业务阶段</option>
            {BUSINESS_STAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button className="h-10 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white">筛选</button>
        </form>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    {["提交时间", "姓名", "联系方式", "业务阶段", "主要渠道", "所需服务", "履约能力", "状态", "详情"].map((header) => (
                      <th key={header} className="border-b border-slate-200 px-4 py-3">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {applications.length ? applications.map((application) => (
                    <tr key={application.id} className="align-top transition hover:bg-slate-50/70">
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-600">{formatDate(application.submittedAt)}</td>
                      <td className="border-b border-slate-100 px-4 py-3 font-medium text-slate-950">{application.name}</td>
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                        <div>{application.email || "-"}</div>
                        <div>{application.wechat || "-"}</div>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{labelForOption(BUSINESS_STAGE_OPTIONS, application.businessStage)}</td>
                      <td className="max-w-[220px] border-b border-slate-100 px-4 py-3 text-slate-700">{labels(SALES_CHANNEL_OPTIONS, application.salesChannels)}</td>
                      <td className="max-w-[260px] border-b border-slate-100 px-4 py-3 text-slate-700">{labels(REQUESTED_SERVICE_OPTIONS, application.requestedServices)}</td>
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{labelForOption(FULFILLMENT_CAPABILITY_OPTIONS, application.fulfillmentCapability)}</td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <span className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          {labelForOption(APPLICATION_STATUS_OPTIONS, application.status)}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <Link className="font-semibold text-emerald-700 underline underline-offset-4" href={searchParamsUrl({ q, status, businessStage, page, id: application.id })}>
                          查看
                        </Link>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="px-4 py-10 text-center text-slate-500" colSpan={9}>暂无申请。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
              <span>共 {total} 条，第 {page} / {pageCount} 页</span>
              <div className="flex gap-2">
                <Link className="rounded-lg border border-slate-200 px-3 py-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-40" aria-disabled={page <= 1} href={searchParamsUrl({ q, status, businessStage, page: Math.max(1, page - 1) })}>上一页</Link>
                <Link className="rounded-lg border border-slate-200 px-3 py-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-40" aria-disabled={page >= pageCount} href={searchParamsUrl({ q, status, businessStage, page: Math.min(pageCount, page + 1) })}>下一页</Link>
              </div>
            </div>
          </section>

          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {selected ? (
              <div>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">{selected.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(selected.submittedAt)}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">
                    {labelForOption(APPLICATION_STATUS_OPTIONS, selected.status)}
                  </span>
                </div>
                <PartnershipApplicationStatusForm applicationId={selected.id} currentStatus={selected.status} />
                <dl className="mt-5 space-y-3 text-sm">
                  {[
                    ["邮箱", selected.email || "-"],
                    ["微信", selected.wechat || "-"],
                    ["业务阶段", labelForOption(BUSINESS_STAGE_OPTIONS, selected.businessStage)],
                    ["店铺或产品链接", selected.storeOrProductUrl || "-"],
                    ["主要渠道", labels(SALES_CHANNEL_OPTIONS, selected.salesChannels)],
                    ["其他渠道", selected.otherSalesChannel || "-"],
                    ["履约能力", labelForOption(FULFILLMENT_CAPABILITY_OPTIONS, selected.fulfillmentCapability)],
                    ["所需服务", labels(REQUESTED_SERVICE_OPTIONS, selected.requestedServices)],
                    ["其他服务", selected.otherRequestedService || "-"],
                    ["来源", selected.source]
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="font-semibold text-slate-500">{label}</dt>
                      <dd className="mt-1 break-words font-medium text-slate-950">
                        {label === "店铺或产品链接" && value !== "-" ? (
                          <a href={value} target="_blank" rel="noreferrer" className="text-emerald-700 underline underline-offset-4">{value}</a>
                        ) : value}
                      </dd>
                    </div>
                  ))}
                  <div>
                    <dt className="font-semibold text-slate-500">产品和需求说明</dt>
                    <dd className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-slate-700">{selected.businessDescription || "-"}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="text-sm text-slate-500">选择一条申请查看完整详情并更新状态。</p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
