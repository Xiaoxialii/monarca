import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { getRequestHtmlLang } from "@/lib/server-locale";
import "./globals.css";

const siteDescription =
  "Monarca is an AI-powered ecommerce growth operator that manages advertising, creator marketing, and inventory to help brands grow globally and profitably.";
const siteTitle = "Monarca AI | AI Agent for Global Ecommerce Growth";

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
    "ecommerce growth operator",
    "global ecommerce growth",
    "creator marketing operations",
    "ecommerce advertising management",
    "inventory operations"
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
