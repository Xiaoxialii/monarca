import { NextResponse } from "next/server";
import { SHOPIFY_PROVIDER, createOAuthState, normalizeShopDomain, publicShopifyError, requiredShopifyEnv } from "@/lib/ecommerce-connectors/shopify-oauth";
import { syncCurrentClerkUser } from "@/lib/clerk-user-sync";

export async function GET(request: Request) {
  try {
    const session = await syncCurrentClerkUser();
    if (!session) {
      return NextResponse.json({ ok: false, code: "UNAUTHENTICATED", message: "Missing authenticated user." }, { status: 401 });
    }
    if (!session.workspace?.id) {
      return NextResponse.json({ ok: false, code: "MISSING_WORKSPACE", message: "Missing current workspace." }, { status: 400 });
    }

    const url = new URL(request.url);
    const requestedShop = url.searchParams.get("shop") || process.env.SHOPIFY_DEFAULT_SHOP_DOMAIN || process.env.NEXT_PUBLIC_SHOPIFY_DEFAULT_SHOP_DOMAIN;
    const shopDomain = normalizeShopDomain(requestedShop);
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
    const publicError = publicShopifyError(error);
    return NextResponse.json({ ok: false, code: publicError.code, message: publicError.message }, { status: publicError.status });
  }
}
