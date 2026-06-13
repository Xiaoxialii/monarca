import { Dashboard } from "@/components/dashboard";
import { getRequestLocale } from "@/lib/server-locale";

export default async function SettingsPage() {
  return <Dashboard view="settings" defaultLocale={await getRequestLocale("en")} />;
}
