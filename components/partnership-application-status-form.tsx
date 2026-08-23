"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { APPLICATION_STATUS_OPTIONS } from "@/lib/partnership-applications";

export function PartnershipApplicationStatusForm({
  applicationId,
  currentStatus
}: {
  applicationId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  async function updateStatus() {
    setMessage("");
    const response = await fetch(`/api/partnership-applications/${applicationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success) {
      setMessage(payload?.message || "状态更新失败。");
      return;
    }

    setMessage("状态已更新。");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
        >
          {APPLICATION_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={updateStatus}
          disabled={isPending || status === currentStatus}
          className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          保存状态
        </button>
      </div>
      {message ? <p className="text-xs font-medium text-slate-600">{message}</p> : null}
    </div>
  );
}
