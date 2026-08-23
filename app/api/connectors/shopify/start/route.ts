import { NextResponse } from "next/server";
import { SHOPIFY_PROVIDER, createOAuthState, normalizeShopDomain, publicShopifyError, requiredShopifyEnv } from "@/lib/ecommerce-connectors/shopify-oauth";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";
import { assertProductAccessForUser } from "@/lib/product-access";
import { workspaceAuthErrorResponse } from "@/lib/workspace-auth";

export async function GET(request: Request) {
  try {
    const session = await syncCurrentClerkUser();
    if (!session) {
      return NextResponse.json({ ok: false, code: "UNAUTHENTICATED", message: "Missing authenticated user." }, { status: 401 });
    }
    if (!session.workspace?.id) {
      return NextResponse.json({ ok: false, code: "MISSING_WORKSPACE", message: "Missing current workspace." }, { status: 400 });
    }
    await assertProductAccessForUser(session.user);

    const url = new URL(request.url);
    const shopDomain = normalizeShopDomain(url.searchParams.get("shop"));
    const { clientId, redirectUri, scopes } = requiredShopifyEnv();
    const state = await createOAuthState({
      provider: SHOPIFY_PROVIDER,
      workspaceId: session.workspace.id,
      userId: session.user.id,
      shopDomain,
      redirectUri,
      scopes
    });
    const oauthUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);

    oauthUrl.searchParams.set("client_id", clientId);
    oauthUrl.searchParams.set("scope", scopes);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("state", state.stateToken);

    return NextResponse.redirect(oauthUrl);
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);
    if (authResponse) return authResponse;
    const publicError = publicShopifyError(error);
    return NextResponse.json({ ok: false, code: publicError.code, message: publicError.message }, { status: publicError.status });
  }
}
