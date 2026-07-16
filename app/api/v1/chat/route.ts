import { NextRequest, NextResponse } from 'next/server';

const MCP_BACKEND_URL = process.env.MCP_BACKEND_URL || 'http://127.0.0.1:8085';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const res = await fetch(`${MCP_BACKEND_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json({ error: errorText }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Backend server not running. Please start: cd aws-mcp-server && python server.py' },
      { status: 503 }
    );
  }
}
