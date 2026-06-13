import { Dashboard } from "@/components/dashboard";
import { getRequestLocale } from "@/lib/server-locale";

export default async function ImportDataPage() {
  return <Dashboard view="import-data" defaultLocale={await getRequestLocale("en")} />;
}
