import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { getRequestHtmlLang } from "@/lib/server-locale";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.monarcadata.com"),
  title: {
    default: "Monarca AI",
    template: "%s | Monarca AI"
  },
  description: "Monarca AI helps teams turn connected business data into AI analytics reports, metric monitoring, and actionable operating insights.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: "https://www.monarcadata.com",
    siteName: "Monarca AI",
    title: "Monarca AI",
    description: "AI analytics reports, metric monitoring, and actionable operating insights for connected business data.",
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
    title: "Monarca AI",
    description: "AI analytics reports, metric monitoring, and actionable operating insights for connected business data.",
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
      </body>
    </html>
  );
}
