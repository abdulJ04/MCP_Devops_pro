import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.MCP_BACKEND_URL || "http://127.0.0.1:8085";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/cost/report/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Backend not reachable" }, { status: 502 });
  }
}
