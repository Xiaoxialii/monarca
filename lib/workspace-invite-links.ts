import { createHash, randomBytes } from "node:crypto";

export const workspaceInviteCookieName = "monarca_workspace_id";
export const workspaceInviteTokenBytes = 32;
export const workspaceInviteTtlDays = 7;

export function createWorkspaceInviteToken() {
  return randomBytes(workspaceInviteTokenBytes).toString("base64url");
}

export function hashWorkspaceInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function workspaceInviteExpiresAt(now = new Date()) {
  return new Date(now.getTime() + workspaceInviteTtlDays * 24 * 60 * 60 * 1000);
}

export function workspaceInviteUrl(request: Request, token: string) {
  const url = new URL("/join-workspace", request.url);
  url.searchParams.set("token", token);
  return url.toString();
}
