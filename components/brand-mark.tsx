import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  compact?: boolean;
};

export function BrandMark({ className, compact = false }: BrandMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 text-[0.95rem] font-semibold tracking-[-0.045em] text-foreground",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-sm bg-primary text-primary-foreground"
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.25"
          className="h-[1.2rem] w-[1.2rem]"
        >
          <path d="M3.5 16h5l2.7-6 4.1 12 3.7-8 2.2 2H28.5" />
          <circle cx="8.5" cy="16" r="1" fill="currentColor" stroke="none" />
          <circle cx="28.5" cy="16" r="1" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {!compact && (
        <span>
          Last<span className="text-primary">EHR</span>
        </span>
      )}
    </span>
  );
}
