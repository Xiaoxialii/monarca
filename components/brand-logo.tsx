import Image from "next/image";
import { cn } from "@/lib/utils";

function ButterflyMark({ label, className }: { label: string; className?: string }) {
  return (
    <Image
      src="/brand-mark.png"
      alt={label}
      width={64}
      height={64}
      priority
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

export function BrandLogo({
  compact = false,
  label = "蝴蝶效应",
  className
}: {
  compact?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 bg-transparent text-slate-950", className)}
      aria-label={label}
    >
      <ButterflyMark label={label} className={compact ? "h-full w-full" : "h-full min-h-8 w-auto"} />
      {!compact ? (
        label === "蝴蝶效应" ? (
          <span className="whitespace-nowrap text-[1.45em] font-black leading-none tracking-normal">
            蝴蝶效应
          </span>
        ) : (
          <span className="whitespace-nowrap text-[1.05em] font-semibold tracking-normal">
            {label}
          </span>
        )
      ) : null}
    </span>
  );
}
