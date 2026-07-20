import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.MCP_BACKEND_URL || "http://127.0.0.1:8085";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get("report_type") || "";
    const limit = searchParams.get("limit") || "50";
    const res = await fetch(`${BACKEND_URL}/cost/report/history?report_type=${reportType}&limit=${limit}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Backend not reachable" }, { status: 502 });
  }
}
