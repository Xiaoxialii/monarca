import { NextResponse } from "next/server";
import {
  SHOPIFY_PROVIDER,
  decryptConnectorToken,
  publicShopifyError,
  shopifyApiVersion
} from "@/lib/ecommerce-connectors/shopify-oauth";
import { ShopifyGraphQLClient } from "@/lib/ecommerce-connectors/providers/shopify-graphql";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, workspaceAuthErrorResponse } from "@/lib/workspace-auth";

const ORDERS_QUERY = `
  query FetchShopifyOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after) {
      edges {
        node {
          id
          name
          createdAt
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const PRODUCTS_QUERY = `
  query FetchShopifyProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          vendor
          productType
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CUSTOMERS_QUERY = `
  query FetchShopifyCustomers($first: Int!, $after: String) {
    customers(first: $first, after: $after) {
      edges {
        node {
          id
          createdAt
          numberOfOrders
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export async function GET() {
  try {
    const session = await requireWorkspace();
    const apiVersion = shopifyApiVersion();
    const account = await prisma.ecommerceConnectorAccount.findFirst({
      where: {
        workspaceId: session.workspace.id,
        provider: SHOPIFY_PROVIDER,
        status: "connected"
      },
      orderBy: { updatedAt: "desc" }
    });

    if (!account) {
      return NextResponse.json(
        { ok: false, code: "SHOPIFY_ACCOUNT_NOT_FOUND", message: "No connected Shopify account was found for this workspace." },
        { status: 404 }
      );
    }

    const accessToken = decryptConnectorToken(account.encryptedAccessToken);
    const client = new ShopifyGraphQLClient({
      shopDomain: account.shopDomain,
      accessToken,
      apiVersion
    });
    const [orders, products, customers] = await Promise.all([
      client.fetchConnection(ORDERS_QUERY, "orders", {}, 10),
      client.fetchConnection(PRODUCTS_QUERY, "products", {}, 10),
      client.fetchConnection(CUSTOMERS_QUERY, "customers", {}, 10)
    ]);

    return NextResponse.json({
      orders,
      products,
      customers,
      meta: {
        shopDomain: account.shopDomain,
        fetchedAt: new Date().toISOString(),
        apiVersion
      }
    });
  } catch (error) {
    const authResponse = workspaceAuthErrorResponse(error);

    if (authResponse) {
      return authResponse;
    }

    const publicError = publicShopifyError(error);
    return NextResponse.json(
      { ok: false, code: publicError.code, message: publicError.message },
      { status: publicError.status }
    );
  }
}
