import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.MCP_BACKEND_URL || "http://127.0.0.1:8085";

export async function GET(request: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/cost/alert/status`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Backend not reachable" }, { status: 502 });
  }
}
