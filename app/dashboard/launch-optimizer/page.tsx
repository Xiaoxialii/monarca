import { Dashboard } from "@/components/dashboard";
import { getRequestLocale } from "@/lib/server-locale";

export default async function LaunchOptimizerPage() {
  return <Dashboard view="launch-optimizer" defaultLocale={await getRequestLocale("en")} />;
}
