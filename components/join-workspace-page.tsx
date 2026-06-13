"use client";

import { useUser } from "@clerk/nextjs";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

export function JoinWorkspacePage({ token }: { token: string }) {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useUser();
  const [status, setStatus] = useState<"idle" | "accepting" | "accepted" | "error">("idle");
  const [message, setMessage] = useState("");
  const redirectPath = useMemo(
    () => `/join-workspace?token=${encodeURIComponent(token)}`,
    [token]
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !token || status !== "idle") {
      return;
    }

    setStatus("accepting");
    fetch("/api/workspace/invite-links/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ token })
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as {
          ok?: boolean;
          message?: string;
          workspace?: { name?: string };
        } | null;

        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message || "无法接受工作区邀请。");
        }

        setStatus("accepted");
        setMessage(payload.workspace?.name ? `已加入 ${payload.workspace.name}` : "已加入工作区");
        window.setTimeout(() => router.replace("/dashboard/reports"), 900);
      })
      .catch((error) => {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "无法接受工作区邀请。");
      });
  }, [isLoaded, isSignedIn, message, router, status, token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-5 py-8">
      <section className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm">
        <BrandLogo className="mb-6" />
        <h1 className="text-2xl font-semibold tracking-tight">加入工作区</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          该链接会将你加入分享方的工作区，并授予阅读权限。
        </p>

        {!token ? (
          <div className="mt-6 rounded-lg border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
            邀请链接缺少 token，请让分享方重新生成链接。
          </div>
        ) : !isLoaded || status === "accepting" ? (
          <div className="mt-6 flex items-center gap-2 rounded-lg border bg-slate-50 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在处理邀请...
          </div>
        ) : isSignedIn && status === "accepted" ? (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="size-4" />
            {message}
          </div>
        ) : isSignedIn && status === "error" ? (
          <div className="mt-6 rounded-lg border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
            {message}
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            <Button asChild>
              <Link href={`/sign-in?redirect_url=${encodeURIComponent(redirectPath)}`}>
                登录后加入
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/sign-up?redirect_url=${encodeURIComponent(redirectPath)}`}>
                创建账号后加入
              </Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
