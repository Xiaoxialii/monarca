import { Dashboard } from "@/components/dashboard";
import { getRequestLocale } from "@/lib/server-locale";

export default async function ReportsPage() {
  return <Dashboard view="reports" defaultLocale={await getRequestLocale("en")} />;
}
