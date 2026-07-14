import { ChevronLast } from "lucide-react";

import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  compact?: boolean;
};

// The ">|" chevron doubles as the product mark: the agent takes the chart the
// last step, to a human decision. Same icon the demo header uses.
export function BrandMark({ className, compact = false }: BrandMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[0.95rem] font-semibold tracking-[-0.045em] text-foreground",
        className,
      )}
    >
      <ChevronLast
        aria-hidden="true"
        strokeWidth={2.5}
        className="h-5 w-5 text-primary"
      />
      {!compact && (
        <span className="whitespace-nowrap">
          Last<span className="text-primary">EHR</span>
        </span>
      )}
    </span>
  );
}
