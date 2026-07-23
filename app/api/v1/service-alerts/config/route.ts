import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.MCP_BACKEND_URL || 'http://127.0.0.1:8085';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/service-alerts/config`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/service-alerts/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 502 });
  }
}
