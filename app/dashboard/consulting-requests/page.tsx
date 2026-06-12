import { WorkspaceRole } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceRole, WorkspaceAuthError } from "@/lib/workspace-auth";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  NEW: "新申请",
  CONTACTED: "已联系",
  QUALIFIED: "有潜力客户",
  CLOSED: "已关闭",
  ARCHIVED: "归档"
};

function parseList(value: string | null) {
  if (!value) return "-";

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length ? parsed.join("、") : "-";
  } catch {
    return value;
  }
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

export default async function ConsultingRequestsPage() {
  try {
    await requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  } catch (error) {
    if (error instanceof WorkspaceAuthError && error.status === 401) {
      redirect("/sign-in");
    }

    redirect("/dashboard");
  }

  const requests = await prisma.consultingRequest.findMany({
    orderBy: { createdAt: "desc" }
  });

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-6 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">内部管理</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">咨询预约申请</h1>
            <p className="mt-2 text-sm text-slate-500">
              查看从 /consulting 页面提交的商业咨询申请，按提交时间倒序排列。
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            返回 Dashboard
          </Link>
        </header>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  {["提交时间", "姓名", "邮箱 / 微信", "公司 / 团队名称", "角色", "数据来源", "想解决的问题", "补充说明", "状态"].map((header) => (
                    <th key={header} className="border-b border-slate-200 px-4 py-3">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.length ? requests.map((request) => (
                  <tr key={request.id} className="align-top transition hover:bg-slate-50/70">
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-600">{formatDate(request.createdAt)}</td>
                    <td className="border-b border-slate-100 px-4 py-3 font-medium text-slate-950">{request.name}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{request.email}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{request.companyName || "-"}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{request.role || "-"}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{parseList(request.dataSources)}</td>
                    <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{parseList(request.painPoints)}</td>
                    <td className="max-w-[320px] border-b border-slate-100 px-4 py-3 text-slate-700">
                      <span className="line-clamp-4 whitespace-pre-wrap">{request.message || "-"}</span>
                    </td>
                    <td className="border-b border-slate-100 px-4 py-3">
                      <span className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        {statusLabels[request.status] ?? request.status}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-500" colSpan={9}>
                      暂无咨询申请。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
