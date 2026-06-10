type ReportCacheClient = {
  reportMetricCache: {
    deleteMany: (args: { where: { workspaceId: string } }) => Promise<unknown>;
  };
  metricSnapshot: {
    deleteMany: (args: { where: { workspaceId: string } }) => Promise<unknown>;
  };
  dailyBriefing: {
    deleteMany: (args: { where: { workspaceId: string } }) => Promise<unknown>;
  };
};

export async function clearWorkspaceReportCaches(prisma: ReportCacheClient, workspaceId: string) {
  await prisma.reportMetricCache.deleteMany({
    where: { workspaceId }
  });
  await prisma.metricSnapshot.deleteMany({
    where: { workspaceId }
  });
  await prisma.dailyBriefing.deleteMany({
    where: { workspaceId }
  });
}
