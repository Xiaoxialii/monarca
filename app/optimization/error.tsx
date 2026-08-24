"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function OptimizationErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[optimization] Client page failed", {
    message: error.message,
    digest: error.digest
  });

  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f8fb] px-6 py-10 text-slate-950">
      <Card className="w-full max-w-2xl border-amber-200 bg-amber-50 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">Optimization page failed to load</p>
              <p className="mt-1 text-sm font-medium leading-6 text-amber-900">
                Refresh and try again. If it still fails, the browser console will include the error details for debugging.
              </p>
            </div>
          </div>
          <Button type="button" onClick={reset} className="shrink-0 bg-amber-950 text-white hover:bg-amber-900">
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
