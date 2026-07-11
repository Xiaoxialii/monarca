import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { loadEcommerceSalesDashboardData } from "@/lib/dashboard/ecommerce-sales-dashboard-loader";
import { getRequestLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

export default async function EcommerceDashboardPage({
  searchParams
}: {
  searchParams?: Promise<{ dataSourceId?: string }>;
}) {
  const session = await syncCurrentClerkUser();
  if (!session) redirect("/sign-in");

  const params = await searchParams;
  const result = await loadEcommerceSalesDashboardData({
    workspaceId: session.workspace.id,
    dataSourceId: params?.dataSourceId ?? null
  });

  return (
    <Dashboard
      view="sales"
      defaultLocale={await getRequestLocale("en")}
      ecommerceDashboard={{
        data: result.data,
        state: result.state,
        message: result.message,
        lineage: result.lineage
      }}
    />
  );
}
