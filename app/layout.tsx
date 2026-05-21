import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monarca AI",
  description: "Monarca AI is a modern AI analytics SaaS dashboard"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
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
