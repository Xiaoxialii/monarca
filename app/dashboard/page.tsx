import { Dashboard } from "@/components/dashboard";
import { getRequestLocale } from "@/lib/server-locale";

export default async function DashboardPage() {
  return <Dashboard view="reports" defaultLocale={await getRequestLocale("en")} />;
}
