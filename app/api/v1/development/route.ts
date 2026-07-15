import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "Development MCP",
    status: "running",
    version: "1.0.0",
    endpoints: {
      status: "/api/v1/development (GET)",
      prompt: "/api/v1/development (POST - prompt)",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt } = body;

    if (prompt) {
      return NextResponse.json({
        success: true,
        message: `Development MCP received: ${prompt}`,
        action: "processed",
      });
    }

    return NextResponse.json({ success: false, error: "Missing prompt field" }, { status: 400 });
  } catch (error: unknown) {
    console.error("Development MCP error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}