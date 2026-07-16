import { NextRequest, NextResponse } from 'next/server';

const MCP_BACKEND_URL = process.env.MCP_BACKEND_URL || 'http://127.0.0.1:8085';

const VALID_ACTIONS = [
  'auth',
  'health',
  'inventory',
  'dashboard',
  'ec2',
  's3',
  'lambda',
  'rds',
  'iam',
  'vpc',
  'cost',
  'security',
  'cloudwatch',
  'cloudwatch_dash',
  'cloudtrail',
  'activity',
  'ebs',
  'route53',
  'elb',
  'auto_scaling',
  'ssm',
  'ecr',
  'ecs',
  'eks',
  'cloudformation',
  'codepipeline',
  'codebuild',
  'codedeploy',
  'secrets_manager',
  'parameter_store',
  'acm',
  'dynamodb',
  'sns',
  'sqs',
  'eventbridge',
  'backup',
  'budgets',
  'refresh',
  'set_timeout',
  'disconnect',
] as const;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;

  if (!VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid action: ${action}. Valid actions: ${VALID_ACTIONS.join(', ')}`,
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Allow empty body for GET-like operations
  }

  try {
    const response = await fetch(`${MCP_BACKEND_URL}/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
      headers: CORS_HEADERS,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';

    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Python backend not running on port 8085. Run: bash start.sh',
        },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return NextResponse.json(
        {
          success: false,
          error: 'Request to MCP backend timed out after 30 seconds.',
        },
        { status: 504, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: `Failed to proxy request: ${message}`,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;

  if (!VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid action: ${action}. Valid actions: ${VALID_ACTIONS.join(', ')}`,
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const response = await fetch(`${MCP_BACKEND_URL}/${action}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
      headers: CORS_HEADERS,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';

    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return NextResponse.json(
        {
          success: false,
          error: 'MCP backend is not available. Make sure the Python server is running on port 8085.',
        },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: `Failed to proxy request: ${message}`,
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
