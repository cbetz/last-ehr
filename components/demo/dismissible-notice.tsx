"use client";

import { useEffect, useState } from "react";

import { IconClose } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

// A notice bar the visitor can dismiss for good (per browser, localStorage).
// Rendered visible on the server so the text stays crawlable and first-time
// visitors see no layout shift; it hides after mount if previously dismissed.
export function DismissibleNotice({
  storageKey,
  className,
  children,
}: {
  storageKey: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === "1") setDismissed(true);
    } catch {
      // Storage unavailable (private mode); keep showing the notice.
    }
  }, [storageKey]);

  if (dismissed) return null;

  return (
    <div className={cn("relative", className)}>
      {children}
      <button
        type="button"
        aria-label="Dismiss notice"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(storageKey, "1");
          } catch {
            // Storage unavailable; the notice just returns next visit.
          }
        }}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconClose className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
