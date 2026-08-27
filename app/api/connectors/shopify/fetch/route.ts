import { NextResponse } from "next/server";
import {
  SHOPIFY_PROVIDER,
  decryptConnectorToken,
  isShopifyProtectedDataAccessError,
  protectedShopifyDataAccessError,
  publicShopifyError,
  shopifyApiVersion
} from "@/lib/ecommerce-connectors/shopify-oauth";
import { shopifyInventoryScopeGranted, shopifyProductMetafieldKeys } from "@/lib/ecommerce-connectors/shopify-product-enrichment";
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

function productsQuery(includeInventoryFields: boolean) {
  return `
  query FetchShopifyProducts($first: Int!, $after: String, $metafieldKeys: [String!]) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          handle
          description
          descriptionHtml
          tags
          vendor
          productType
          category { id name fullName }
          status
          onlineStoreUrl
          seo { title description }
          featuredMedia {
            ...ProductMediaFields
          }
          media(first: 10) {
            edges {
              node {
                ...ProductMediaFields
              }
            }
          }
          collections(first: 20) {
            edges {
              node { id title handle updatedAt }
            }
          }
          options {
            id
            name
            position
            values
          }
          metafields(first: 20, keys: $metafieldKeys) {
            edges {
              node { id namespace key type value updatedAt }
            }
          }
          variants(first: 50) {
            edges {
              node {
                id
                sku
                title
                price
                compareAtPrice
                barcode
                selectedOptions { name value }
                ${includeInventoryFields ? `
                inventoryQuantity
                inventoryItem {
                  id
                  sku
                  tracked
                  requiresShipping
                  unitCost { amount currencyCode }
                  measurement { weight { value unit } }
                }
                ` : ""}
                media(first: 5) {
                  edges {
                    node {
                      ...ProductMediaFields
                    }
                  }
                }
              }
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

  fragment ProductMediaFields on Media {
    id
    mediaContentType
    alt
    preview { image { url altText width height } }
    ... on MediaImage {
      image { url altText width height }
    }
    ... on Video {
      sources { url mimeType format height width }
    }
    ... on ExternalVideo {
      originUrl
      embedUrl
    }
  }
`;
}

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

async function fetchOptionalConnection<T>(
  input: {
    client: ShopifyGraphQLClient;
    query: string;
    connectionKey: string;
    resource: string;
    variables?: Record<string, unknown>;
    maxNodes?: number;
  }
): Promise<{ nodes: T[]; warning?: { code: string; resource: string; message: string } }> {
  try {
    return {
      nodes: await input.client.fetchConnection<T>(
        input.query,
        input.connectionKey,
        input.variables ?? {},
        input.maxNodes ?? 10
      )
    };
  } catch (error) {
    if (isShopifyProtectedDataAccessError(error)) {
      return {
        nodes: [],
        warning: {
          code: "SHOPIFY_PROTECTED_CUSTOMER_DATA_REQUIRED",
          resource: input.resource,
          message: protectedShopifyDataAccessError(input.resource).message
        }
      };
    }

    throw error;
  }
}

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
    const [ordersResult, productsResult, customersResult] = await Promise.all([
      fetchOptionalConnection({ client, query: ORDERS_QUERY, connectionKey: "orders", resource: "Order" }),
      fetchOptionalConnection({
        client,
        query: productsQuery(shopifyInventoryScopeGranted(account.grantedScopes ?? account.scopes)),
        connectionKey: "products",
        resource: "Product",
        variables: { metafieldKeys: shopifyProductMetafieldKeys() }
      }),
      fetchOptionalConnection({ client, query: CUSTOMERS_QUERY, connectionKey: "customers", resource: "Customer" })
    ]);
    const warnings = [ordersResult.warning, productsResult.warning, customersResult.warning].filter(Boolean);

    if (ordersResult.warning) {
      const publicError = protectedShopifyDataAccessError("Order");

      return NextResponse.json(
        {
          ok: false,
          code: publicError.code,
          message: publicError.message,
          warnings,
          meta: {
            shopDomain: account.shopDomain,
            fetchedAt: new Date().toISOString(),
            apiVersion
          }
        },
        { status: publicError.status }
      );
    }

    return NextResponse.json({
      orders: ordersResult.nodes,
      products: productsResult.nodes,
      customers: customersResult.nodes,
      warnings,
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
