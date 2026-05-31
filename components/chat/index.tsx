"use client";

import dynamic from "next/dynamic";

export { spinner } from "./spinner";
export { BotCard, BotMessage, SystemMessage, UserMessage } from "./message";

/** Generic loading skeleton shown while a tool streams its result UI. */
export function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="h-[60px] w-full rounded-lg bg-muted animate-pulse" />
      <div className="h-[60px] w-full rounded-lg bg-muted animate-pulse" />
    </div>
  );
}

const Patients = dynamic(
  () => import("./patients").then((mod) => mod.Patients),
  {
    ssr: false,
    loading: () => <MessageSkeleton />,
  },
);

export { Patients };
