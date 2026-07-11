import { NextResponse } from "next/server";
import { buildMetaOAuthUrl, createMetaOAuthState, publicMetaError, requiredMetaEnv } from "@/lib/ads/meta/meta-oauth";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";

async function createMetaStartResult() {
  const session = await syncCurrentClerkUser();
  if (!session) {
    return {
      error: NextResponse.json({ ok: false, code: "UNAUTHENTICATED", message: "Missing authenticated user." }, { status: 401 })
    };
  }
  if (!session.workspace?.id) {
    return {
      error: NextResponse.json({ ok: false, code: "MISSING_WORKSPACE", message: "Missing current workspace." }, { status: 400 })
    };
  }

  const { clientId, redirectUri, scopes } = requiredMetaEnv();
  const state = await createMetaOAuthState({
    workspaceId: session.workspace.id,
    userId: session.user.id,
    redirectUri,
    scopes
  });
  const oauthUrl = buildMetaOAuthUrl({
    clientId,
    redirectUri,
    scopes,
    stateToken: state.stateToken
  });

  return {
    oauthUrl,
    workspaceId: session.workspace.id,
    statePrefix: state.stateToken.slice(0, 6)
  };
}

export async function GET() {
  try {
    const result = await createMetaStartResult();
    if ("error" in result) return result.error;

    return NextResponse.redirect(result.oauthUrl);
  } catch (error) {
    const publicError = publicMetaError(error);
    return NextResponse.json({ ok: false, code: publicError.code, message: publicError.message }, { status: publicError.status });
  }
}

export async function POST() {
  try {
    const result = await createMetaStartResult();
    if ("error" in result) return result.error;

    return NextResponse.json({
      ok: true,
      url: result.oauthUrl.toString(),
      statePrefix: result.statePrefix,
      workspace_id: result.workspaceId
    });
  } catch (error) {
    const publicError = publicMetaError(error);
    return NextResponse.json({ ok: false, code: publicError.code, message: publicError.message }, { status: publicError.status });
  }
}
