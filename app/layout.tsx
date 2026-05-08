import type { Metadata } from "next";
import "./globals.css";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = {
  title: "蝴蝶效应",
  description: "A modern AI analytics SaaS dashboard."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthShell>{children}</AuthShell>
      </body>
    </html>
  );
}
