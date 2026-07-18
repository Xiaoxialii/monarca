import { Dashboard } from "@/components/dashboard";
import { getRequestLocale } from "@/lib/server-locale";

export default async function ActionTrackerPage() {
  return <Dashboard view="action-tracker" defaultLocale={await getRequestLocale("en")} />;
}
