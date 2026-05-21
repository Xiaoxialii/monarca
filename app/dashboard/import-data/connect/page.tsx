import { Dashboard } from "@/components/dashboard";

export default async function ConnectDataSourcePage({
  searchParams
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const params = await searchParams;

  return <Dashboard view="import-data-connect" initialDataSource={params.source} />;
}
