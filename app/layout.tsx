import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { getRequestHtmlLang } from "@/lib/server-locale";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monarca AI",
  description: "Monarca AI is a modern AI analytics SaaS dashboard"
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
