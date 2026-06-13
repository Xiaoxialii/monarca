import { Dashboard } from "@/components/dashboard";
import { getRequestLocale } from "@/lib/server-locale";

export default async function ConnectDataSourcePage({
  searchParams
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const params = await searchParams;

  return <Dashboard view="import-data-connect" initialDataSource={params.source} defaultLocale={await getRequestLocale("en")} />;
}
