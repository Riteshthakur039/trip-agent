import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const backendBase =
    process.env.AG_UI_AGENT_URL?.replace(/\/ag-ui\/?$/, "") ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${backendBase}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ ok: true, ...data });
    }
    return NextResponse.json({ ok: false, status: res.status }, { status: 502 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
