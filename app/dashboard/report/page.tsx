import { Dashboard } from "@/components/dashboard";
import { getRequestLocale } from "@/lib/server-locale";

export default async function ReportPage() {
  return <Dashboard view="report" defaultLocale={await getRequestLocale("en")} />;
}
