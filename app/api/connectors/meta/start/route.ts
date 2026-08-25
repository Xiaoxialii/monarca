import { NextResponse } from "next/server";
import { buildMetaOAuthUrl, createMetaOAuthState, publicMetaError, requiredMetaEnv } from "@/lib/ads/meta/meta-oauth";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { PRODUCT_ACCESS_REQUIRED_CODE, assertProductAccessForUser } from "@/lib/product-access";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { WorkspaceAuthError } from "@/lib/workspace-auth-error";

function dashboardRedirect(request: Request, code: string) {
  const url = new URL("/dashboard/import-data", request.url);
  url.searchParams.set("meta_ads", "failed");
  url.searchParams.set("code", code);

  return NextResponse.redirect(url);
}

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
  await assertProductAccessForUser(session.user);

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

export async function GET(request: Request) {
  try {
    const result = await createMetaStartResult();
    if ("error" in result) return result.error;

    return NextResponse.redirect(result.oauthUrl);
  } catch (error) {
    if (error instanceof WorkspaceAuthError && error.code === PRODUCT_ACCESS_REQUIRED_CODE) {
      return dashboardRedirect(request, PRODUCT_ACCESS_REQUIRED_CODE);
    }

    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
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
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    const publicError = publicMetaError(error);
    return NextResponse.json({ ok: false, code: publicError.code, message: publicError.message }, { status: publicError.status });
  }
}
