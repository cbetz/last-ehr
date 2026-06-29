import { cookies } from "next/headers";
import { z } from "zod";

// Node runtime to match the chat route.
export const runtime = "nodejs";

const COOKIE_NAME = "medplum_access_token";

const bodySchema = z.object({ accessToken: z.string().min(1) });

// POST establishes (or refreshes) the server-set, HttpOnly session cookie that
// /api/chat reads. The client posts its live Medplum access token here so the
// token is never written to a JS-readable document.cookie.
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response("Bad Request", { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, parsed.data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Short-lived; the client refreshes it from the live Medplum session
    // before each send.
    maxAge: 60 * 60,
  });

  return new Response(null, { status: 204 });
}

// DELETE clears the session cookie on sign-out.
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  return new Response(null, { status: 204 });
}
