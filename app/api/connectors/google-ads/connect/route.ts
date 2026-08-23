import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import {
  buildGoogleAdsAuthorizationUrl,
  createGoogleAdsOAuthState,
  googleAdsUseMock,
  requiredGoogleAdsEnv
} from "@/lib/connectors/google-ads/google-ads-oauth";
import { publicGoogleAdsError } from "@/lib/connectors/google-ads/google-ads-errors";
import { assertProductAccessForUser } from "@/lib/product-access";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

function dashboardRedirect(request: Request, code: string) {
  const url = new URL("/dashboard/import-data", request.url);
  url.searchParams.set("google_ads", "failed");
  url.searchParams.set("code", code);

  return NextResponse.redirect(url);
}

async function createGoogleAdsConnectResult(request: Request) {
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

  if (googleAdsUseMock()) {
    const url = new URL("/api/connectors/google-ads/callback", request.url);
    url.searchParams.set("mock", "true");
    return {
      oauthUrl: url,
      workspaceId: session.workspace.id,
      statePrefix: "mock"
    };
  }

  const env = requiredGoogleAdsEnv();
  const state = await createGoogleAdsOAuthState({
    workspaceId: session.workspace.id,
    userId: session.user.id,
    redirectUri: env.redirectUri
  });
  const oauthUrl = buildGoogleAdsAuthorizationUrl({
    clientId: env.clientId,
    redirectUri: env.redirectUri,
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
    const result = await createGoogleAdsConnectResult(request);
    if ("error" in result) return result.error;

    return NextResponse.redirect(result.oauthUrl);
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    const publicError = publicGoogleAdsError(error);
    return dashboardRedirect(request, publicError.code);
  }
}

export async function POST(request: Request) {
  try {
    const result = await createGoogleAdsConnectResult(request);
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
    const publicError = publicGoogleAdsError(error);
    return NextResponse.json({ ok: false, code: publicError.code, message: publicError.message }, { status: publicError.status });
  }
}
