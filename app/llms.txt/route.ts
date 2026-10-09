import { getLlmsIndex } from "@/lib/docs/llms";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  return new Response(getLlmsIndex(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
