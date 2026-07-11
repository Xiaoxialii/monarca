# Shopify app production config

Monarca uses the standard Shopify OAuth authorize URL:

```text
/admin/oauth/authorize
```

The production Shopify app must therefore use the legacy install flow and must
match Monarca's production host.

## Required production settings

- App URL: `https://www.monarcadata.com/`
- Embedded app: `false`
- Allowed redirection URL: `https://www.monarcadata.com/api/connectors/shopify/callback`
- Preferences URL: `https://www.monarcadata.com/dashboard/import-data`
- Admin API scopes: `read_orders,read_products,read_customers,read_fulfillments,write_draft_orders,write_orders,write_products`
- Use legacy install flow: `true`

## Deploy through Shopify CLI

Use the Shopify app client ID shown in the Partner Dashboard credentials page.
At the time of writing, Monarca's Partner app is:

```text
1c61e8b65c919c0c883c1a15f8724b97
```

```bash
cp shopify.app.production.toml.example shopify.app.production.toml
```

Edit `shopify.app.production.toml` and set:

```toml
client_id = "1c61e8b65c919c0c883c1a15f8724b97"
```

Then link or deploy with Shopify CLI:

```bash
npx --yes @shopify/cli@latest app config link --client-id 1c61e8b65c919c0c883c1a15f8724b97 --config production
npx --yes @shopify/cli@latest app deploy --config production
```

The deploy creates a new app version/release. Confirm it becomes active in the
Shopify Dev Dashboard, then reconnect Shopify from Monarca.

Do not reveal or use the Admin API token. Monarca should continue using OAuth.
