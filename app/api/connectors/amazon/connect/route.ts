import { NextResponse } from "next/server";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import {
  buildAmazonAuthorizationUrl,
  createAmazonOAuthState,
  requiredAmazonEnv
} from "@/lib/connectors/amazon/amazon-oauth";
import { publicAmazonError } from "@/lib/connectors/amazon/amazon-errors";
import { normalizeAmazonRegion } from "@/lib/connectors/amazon/amazon-regions";
import { normalizeMarketplaceIds } from "@/lib/connectors/amazon/amazon-marketplaces";
import { PRODUCT_ACCESS_REQUIRED_CODE, assertProductAccessForUser } from "@/lib/product-access";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";
import { WorkspaceAuthError } from "@/lib/workspace-auth-error";

function dashboardRedirect(request: Request, code: string) {
  const url = new URL("/dashboard/import-data", request.url);
  url.searchParams.set("amazon", "failed");
  url.searchParams.set("code", code);

  return NextResponse.redirect(url);
}

async function createAmazonConnectResult(request: Request) {
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

  const url = new URL(request.url);
  const region = normalizeAmazonRegion(url.searchParams.get("region"));
  const marketplaceIds = normalizeMarketplaceIds(url.searchParams.get("marketplaceIds"), region);
  const env = requiredAmazonEnv();
  const state = await createAmazonOAuthState({
    workspaceId: session.workspace.id,
    userId: session.user.id,
    redirectUri: env.redirectUri,
    region,
    marketplaceIds,
    returnPath: "/dashboard/settings?section=data-sources"
  });
  const oauthUrl = buildAmazonAuthorizationUrl({
    appId: env.appId,
    stateToken: state.stateToken,
    region
  });

  return {
    oauthUrl,
    workspaceId: session.workspace.id,
    statePrefix: state.stateToken.slice(0, 6)
  };
}

export async function GET(request: Request) {
  try {
    const result = await createAmazonConnectResult(request);
    if ("error" in result) return result.error;

    return NextResponse.redirect(result.oauthUrl);
  } catch (error) {
    if (error instanceof WorkspaceAuthError && error.code === PRODUCT_ACCESS_REQUIRED_CODE) {
      return dashboardRedirect(request, PRODUCT_ACCESS_REQUIRED_CODE);
    }

    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    const publicError = publicAmazonError(error);
    return dashboardRedirect(request, publicError.code);
  }
}

export async function POST(request: Request) {
  try {
    const result = await createAmazonConnectResult(request);
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
    const publicError = publicAmazonError(error);
    return NextResponse.json({ ok: false, code: publicError.code, message: publicError.message }, { status: publicError.status });
  }
}
