CREATE TABLE "WorkspaceInviteLink" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'VIEWER',
  "createdBy" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkspaceInviteLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceInviteLink_tokenHash_key" ON "WorkspaceInviteLink"("tokenHash");
CREATE INDEX "WorkspaceInviteLink_workspaceId_idx" ON "WorkspaceInviteLink"("workspaceId");
CREATE INDEX "WorkspaceInviteLink_expiresAt_idx" ON "WorkspaceInviteLink"("expiresAt");

ALTER TABLE "WorkspaceInviteLink"
  ADD CONSTRAINT "WorkspaceInviteLink_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
