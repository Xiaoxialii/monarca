"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Locale } from "@/lib/locale";

type Props = {
  children: ReactNode;
  locale: Locale;
};

type State = {
  error: Error | null;
};

export class DashboardErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[dashboard] Client render failed", {
      message: error.message,
      componentStack: errorInfo.componentStack
    });
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const isZh = this.props.locale === "zh";

    return (
      <Card className="border-amber-200 bg-amber-50 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 text-amber-950 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">
                {isZh ? "页面加载遇到问题" : "This page ran into a loading issue"}
              </p>
              <p className="mt-1 text-sm font-medium leading-6 text-amber-900">
                {isZh
                  ? "请刷新后重试。如果问题持续存在，Monarca 会在控制台保留错误信息用于排查。"
                  : "Refresh and try again. If the issue continues, Monarca keeps the browser error in the console for debugging."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
            className="shrink-0 bg-amber-950 text-white hover:bg-amber-900"
          >
            <RefreshCw className="size-4" />
            {isZh ? "刷新页面" : "Refresh"}
          </Button>
        </CardContent>
      </Card>
    );
  }
}
