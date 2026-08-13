export type AmazonOrder = {
  AmazonOrderId?: string;
  PurchaseDate?: string;
  LastUpdateDate?: string;
  OrderStatus?: string;
  FulfillmentChannel?: string;
  SalesChannel?: string;
  MarketplaceId?: string;
  BuyerInfo?: { BuyerEmail?: string };
  ShippingAddress?: {
    City?: string;
    StateOrRegion?: string;
    CountryCode?: string;
  };
  OrderTotal?: {
    CurrencyCode?: string;
    Amount?: string;
  };
};

export type AmazonOrderItem = {
  OrderItemId?: string;
  SellerSKU?: string;
  ASIN?: string;
  Title?: string;
  QuantityOrdered?: number;
  ItemPrice?: { CurrencyCode?: string; Amount?: string };
  ItemTax?: { CurrencyCode?: string; Amount?: string };
  ShippingPrice?: { CurrencyCode?: string; Amount?: string };
  PromotionDiscount?: { CurrencyCode?: string; Amount?: string };
};

export type AmazonCatalogItem = {
  asin?: string;
  attributes?: Record<string, unknown>;
  summaries?: Array<{
    itemName?: string;
    brandName?: string;
    browseClassification?: { displayName?: string };
    marketplaceId?: string;
  }>;
};

export type AmazonInventorySummary = {
  asin?: string;
  sellerSku?: string;
  totalQuantity?: number;
  inventoryDetails?: {
    fulfillableQuantity?: number;
    reservedQuantity?: { totalReservedQuantity?: number };
    inboundWorkingQuantity?: number;
    inboundShippedQuantity?: number;
    inboundReceivingQuantity?: number;
  };
};

export type AmazonFinancialEvent = Record<string, unknown>;
