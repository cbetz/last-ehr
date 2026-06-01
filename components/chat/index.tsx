export { spinner } from "./spinner";
export { BotCard, BotMessage, SystemMessage, UserMessage } from "./message";
export { Patients } from "./patients";

/** Generic loading skeleton shown while a tool streams its result UI. */
export function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-2 mb-4">
      <div className="h-[60px] w-full rounded-lg bg-muted animate-pulse" />
      <div className="h-[60px] w-full rounded-lg bg-muted animate-pulse" />
    </div>
  );
}
