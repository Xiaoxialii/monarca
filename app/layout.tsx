import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { getRequestHtmlLang } from "@/lib/server-locale";
import "./globals.css";

const siteDescription =
  "Monarca AI is an AI decision system that helps ecommerce businesses optimize SKU profitability, advertising spend, and inventory decisions to maximize profit.";
const siteTitle = "Monarca AI | AI Profit Optimization for Ecommerce";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.monarcadata.com"),
  title: {
    default: siteTitle,
    template: "%s | Monarca AI"
  },
  description: siteDescription,
  keywords: [
    "monarca",
    "Monarca",
    "Monarca AI",
    "ecommerce profit optimization",
    "SKU portfolio optimization",
    "advertising spend optimization",
    "inventory decision system",
    "AI decision system"
  ],
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: "https://www.monarcadata.com",
    siteName: "Monarca AI",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/brand-mark.png",
        width: 64,
        height: 64,
        alt: "Monarca AI"
      }
    ]
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
    images: ["/brand-mark.png"]
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? {
        google: process.env.GOOGLE_SITE_VERIFICATION
      }
    : undefined,
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" }
    ]
  }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const htmlLang = await getRequestHtmlLang("en");

  return (
    <html lang={htmlLang}>
      <body>
        <ClerkProvider
          signInFallbackRedirectUrl="/dashboard"
          signInForceRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
          signUpForceRedirectUrl="/dashboard"
          afterSignOutUrl="/"
        >
          {children}
        </ClerkProvider>
        <Analytics />
      </body>
    </html>
  );
}
