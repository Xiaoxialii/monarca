import { WorkspaceMemberStatus } from "@prisma/client";
import { syncCurrentClerkUserIdentity } from "@/lib/clerk-user-sync";
import { ensureReportEntitlement } from "@/lib/report-entitlements";
import { WorkspaceAuthError } from "@/lib/workspace-auth-error";

export type CurrentWorkspaceContext = {
  user: NonNullable<Awaited<ReturnType<typeof syncCurrentClerkUserIdentity>>>["user"];
  workspace: NonNullable<Awaited<ReturnType<typeof syncCurrentClerkUserIdentity>>>["user"]["memberships"][number]["workspace"];
  membership: NonNullable<Awaited<ReturnType<typeof syncCurrentClerkUserIdentity>>>["user"]["memberships"][number];
};

export async function getCurrentWorkspaceContext(_request?: Request | null): Promise<CurrentWorkspaceContext> {
  void _request;
  const identity = await syncCurrentClerkUserIdentity();

  if (!identity) {
    throw new WorkspaceAuthError("Unauthorized", 401);
  }

  const activeMemberships = identity.user.memberships.filter(
    (membership) => membership.status === WorkspaceMemberStatus.ACTIVE
  );

  if (activeMemberships.length === 0) {
    throw new WorkspaceAuthError("No active workspace membership", 403);
  }

  if (activeMemberships.length > 1) {
    throw new WorkspaceAuthError("User has multiple active workspace memberships; data migration is required.", 409);
  }

  const membership = activeMemberships[0];
  await ensureReportEntitlement(membership.workspace.id);

  return {
    user: identity.user,
    workspace: membership.workspace,
    membership
  };
}

export function logWorkspaceContext(
  label: string,
  context: Pick<CurrentWorkspaceContext, "user" | "workspace">
) {
  console.info(label, {
    userId: context.user.id,
    workspaceId: context.workspace.id,
    workspaceName: context.workspace.name
  });
}
