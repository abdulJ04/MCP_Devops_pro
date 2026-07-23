# MCP DevOps Pro — Complete Project Documentation

> **Version:** 0.1.0
> **Repository:** https://github.com/abdulJ04/MCP_Devops_pro
> **Last Updated:** July 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [API Reference](#4-api-reference)
5. [Chatbot & AI Engine](#5-chatbot--ai-engine)
6. [MCP Server Integration](#6-mcp-server-integration)
7. [Development Guide](#7-development-guide)

---

## 1. Project Overview

### What is MCP DevOps Pro?

MCP DevOps Pro is an **AI-powered DevOps platform** that provides a unified dashboard for monitoring and managing AWS infrastructure. It combines a modern web frontend, a Python FastAPI backend, and an MCP (Model Context Protocol) server that integrates directly with Claude Desktop for natural language infrastructure management.

### Problem It Solves

Managing AWS infrastructure requires switching between multiple AWS consoles, writing custom scripts, and manually analyzing security and cost data. MCP DevOps Pro consolidates everything into a single dashboard with AI-powered analysis and a chatbot that can execute real AWS operations.

### Key Features

| Feature | Description |
|---|---|
| **Real-time AWS Dashboard** | Monitor EC2, S3, Lambda, RDS, IAM, VPC, and 20+ AWS services from one interface |
| **AI Chatbot** | Natural language commands to query and manage AWS resources |
| **Security Analysis** | Automated security audit with scoring (Critical/High/Medium/Low findings) |
| **Cost Optimization** | Cost analysis with savings recommendations |
| **Architecture Review** | Automated architecture health scoring |
| **MCP Integration** | Connect to Claude Desktop for conversational infrastructure management |
| **Dual Mode** | LocalStack (free/local) for testing, real AWS for production |
| **Dark/Light Theme** | Route-based theming — dark on dashboard, light on other pages |

### Project Stats

| Metric | Value |
|---|---|
| Total Lines of Code | 15,080 |
| Backend Endpoints | 32 FastAPI routes |
| MCP Tools | 22 (Claude Desktop) |
| AWS Services Covered | 25+ |
| React Pages | 11 |
| API Proxy Routes | 8 |
| LLM Integrations | 3 (Claude, Ollama, Groq) |
| Largest File | `aws-mcp-server/server.py` (2,584 lines) |

### High-Level System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MCP DevOps Pro — System Overview                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐     ┌──────────────┐     ┌──────────────┐              │
│   │          │     │              │     │              │              │
│   │ Browser  │────→│  Next.js     │────→│  Python      │              │
│   │ :3000    │←────│  API Proxy   │←────│  FastAPI     │              │
│   │          │     │              │     │  :8085       │              │
│   └──────────┘     └──────────────┘     └──────┬───────┘              │
│                                                 │                      │
│                              ┌──────────────────┼──────────────┐       │
│                              │                  │              │       │
│                              ▼                  ▼              ▼       │
│                       ┌──────────┐      ┌──────────┐   ┌──────────┐  │
│                       │ AWS      │      │LocalStack│   │ Ollama   │  │
│                       │ (Live)   │      │ :4566    │   │ :11434   │  │
│                       └──────────┘      └──────────┘   └──────────┘  │
│                                                                         │
│   ┌──────────────┐                                                      │
│   │ Claude       │←── stdio ──→ ┌──────────────┐                       │
│   │ Desktop      │              │ MCP Server   │──→ /sync-credentials  │
│   └──────────────┘              │ 22 Tools     │                       │
│                                 └──────────────┘                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

### Frontend

| Technology | Version | Purpose | Config File |
|---|---|---|---|
| Next.js | ^15.5.20 | React framework (App Router) | `next.config.js` |
| React | ^18.2.0 | UI library | `package.json` |
| TypeScript | ^5.2.2 | Type safety | `tsconfig.json` |
| Tailwind CSS | ^3.3.0 | Utility-first CSS | `tailwind.config.js` |
| Recharts | ^3.9.2 | Data visualization charts | `package.json` |
| Framer Motion | ^10.16.4 | Animations | `package.json` |
| react-icons | ^5.0.1 | Icon library (Bootstrap icons) | `package.json` |
| @modelcontextprotocol/sdk | ^1.29.0 | MCP protocol SDK | `package.json` |

### Backend

| Technology | Version | Purpose | Config File |
|---|---|---|---|
| Python 3 | 3.12+ | Backend language | — |
| FastAPI | >=0.110.0 | REST API framework | `server.py` |
| Uvicorn | >=0.27.0 | ASGI server | `server.py` |
| boto3 | >=1.34.0 | AWS SDK | `requirements.txt` |
| Pydantic | >=2.0.0 | Data validation | `server.py` |
| FastMCP | >=2.0.0 | MCP protocol server | `claude-mcp-server.py` |
| Mangum | >=0.17.0 | Lambda adapter | `requirements.txt` |

### Infrastructure & External Services

| Service | Endpoint | Purpose |
|---|---|---|
| LocalStack | `localhost:4566` | Free local AWS emulator for testing |
| Ollama | `localhost:11434` | Local LLM server (qwen2.5:1.5b) |
| Claude Desktop | stdio transport | MCP client for conversational AI |
| Groq API | cloud | Free cloud LLM (llama3-8b-instruct) |
| Anthropic API | cloud | Paid LLM (claude-3-5-sonnet-20241022) |

### Custom Theme System

The project uses a route-based theme system defined in `tailwind.config.js`:

**Microsoft Blue Palette (msBlue):**

| Key | Hex | Usage |
|---|---|---|
| `msBlue-100` | `#E6F2FF` | Light backgrounds |
| `msBlue-300` | `#99CBFF` | Borders, hover states |
| `msBlue-500` | `#3396FF` | Interactive elements |
| `msBlue-600` | `#0078D4` | Primary actions |
| `msBlue-700` | `#005A9E` | Hover states |
| `msBlue-900` | `#002F52` | Dark text |

**Gray Palette (msGray):**

| Key | Hex | Usage |
|---|---|---|
| `msGray-50` | `#f9fafb` | Page backgrounds |
| `msGray-100` | `#F5F5F5` | Card backgrounds |
| `msGray-300` | `#CCCCCC` | Borders |
| `msGray-500` | `#999999` | Secondary text |
| `msGray-900` | `#333333` | Primary text |

**Theme Behavior:**
- AWS Dashboard (`/aws-dashboard`): Always dark theme
- All other pages: Always light theme
- Implementation: `ThemeProvider.tsx` + `LayoutShell.tsx`

---

## 3. System Architecture

### 3.1 Complete Data Flow

This diagram shows how data flows from a user's browser click all the way to AWS and back:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Complete Data Flow: Dashboard Tab Click                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. USER ACTION                                                             │
│  ┌─────────────┐                                                            │
│  │ Click "EC2" │                                                            │
│  │ Tab         │                                                            │
│  └──────┬──────┘                                                            │
│         │                                                                   │
│         ▼                                                                   │
│  2. FRONTEND (aws-dashboard/page.tsx)                                       │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ fetchAWS("ec2", { accessKeyId, secretKey, ... }) │                      │
│  │ POST /api/v1/aws                                  │                      │
│  └──────────────────────┬───────────────────────────┘                      │
│                         │                                                   │
│                         ▼                                                   │
│  3. NEXT.JS API PROXY (app/api/v1/aws/route.ts)                            │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ Validates action name against whitelist          │                      │
│  │ Proxies request to http://127.0.0.1:8085/ec2     │                      │
│  │ Returns response to frontend                      │                      │
│  └──────────────────────┬───────────────────────────┘                      │
│                         │                                                   │
│                         ▼                                                   │
│  4. PYTHON BACKEND (aws-mcp-server/server.py)                              │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ a. _ensure_credentials() — validates/sets creds  │                      │
│  │ b. _cached("ec2", 30) — checks cache (30s TTL)  │                      │
│  │ c. _get_client("ec2") — creates boto3 client     │                      │
│  │ d. ec2.describe_instances() — AWS API call        │                      │
│  │ e. cloudwatch.get_metric_statistics() — metrics   │                      │
│  │ f. _set_cache("ec2", data) — stores in cache      │                      │
│  │ g. Returns JSON response                          │                      │
│  └──────────────────────┬───────────────────────────┘                      │
│                         │                                                   │
│                         ▼                                                   │
│  5. AWS API (or LocalStack)                                                 │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ Live AWS: api.ec2.us-east-1.amazonaws.com        │                      │
│  │ LocalStack: localhost:4566 (emulator)             │                      │
│  └──────────────────────┬───────────────────────────┘                      │
│                         │                                                   │
│                         ▼                                                   │
│  6. RESPONSE FLOW (reverse)                                                 │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ AWS JSON → Backend formats → Next.js proxies →    │                      │
│  │ Frontend renders: table, charts, cards            │                      │
│  └──────────────────────────────────────────────────┘                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Authentication Flow                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐                                                            │
│  │  User opens │                                                            │
│  │  Dashboard  │                                                            │
│  └──────┬──────┘                                                            │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────┐     ┌──────────────────┐     ┌────────────────────┐      │
│  │ AuthScreen   │────→│ POST /auth       │────→│ sts.get_caller_    │      │
│  │ (credentials)│     │ { accessKeyId,   │     │ identity()         │      │
│  │              │     │   secretKey,     │     │ (boto3 validation) │      │
│  │  OR          │     │   region }       │     └────────┬───────────┘      │
│  │ LocalStack   │     └──────────────────┘              │                  │
│  │ toggle       │                              ┌────────┴────────┐         │
│  └──────────────┘                              │                 │         │
│                                                ▼                 ▼         │
│                                         ┌──────────┐     ┌──────────┐     │
│                                         │ SUCCESS  │     │ FAILURE  │     │
│                                         │ Store    │     │ Return   │     │
│                                         │ creds in │     │ 401 error│     │
│                                         │ _creds   │     │ No state │     │
│                                         └────┬─────┘     │ change   │     │
│                                              │           └──────────┘     │
│                                              ▼                            │
│                                     ┌──────────────────┐                  │
│                                     │ Dashboard loads  │                  │
│                                     │ Tabs appear      │                  │
│                                     │ Data fetching    │                  │
│                                     │ begins           │                  │
│                                     └──────────────────┘                  │
│                                                                             │
│  CREDENTIAL STORAGE:                                                        │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ Python in-memory dict (_credentials):             │                      │
│  │ {                                                  │                      │
│  │   "aws_access_key": "AKIA...",                     │                      │
│  │   "aws_secret_key": "wJal...",                     │                      │
│  │   "aws_region": "us-east-1",                       │                      │
│  │   "use_localstack": False,                         │                      │
│  │ }                                                  │                      │
│  │ Session timeout: configurable (default 1 hour)     │                      │
│  │ Thread safety: threading.RLock on all mutations    │                      │
│  └──────────────────────────────────────────────────┘                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Caching Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Caching Strategy                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TTL = Time To Live (cache duration)                                        │
│                                                                             │
│  ┌────────────────────┬──────────┬──────────────────────────────────┐      │
│  │ Data Type          │ TTL      │ Services                         │      │
│  ├────────────────────┼──────────┼──────────────────────────────────┤      │
│  │ Real-time Metrics  │ 30 sec   │ EC2, Lambda, RDS, Cost, Security │      │
│  │ Inventory Data     │ 300 sec  │ S3, IAM, VPC, EBS, Route53, ELB  │      │
│  │ Activity Logs      │ 30 sec   │ CloudTrail events                │      │
│  └────────────────────┴──────────┴──────────────────────────────────┘      │
│                                                                             │
│  Cache Flow:                                                                │
│  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ Request │───→│ Cache    │────│ Hit?     │────│ Return   │              │
│  │ arrives │    │ Lookup   │    │ Yes: <30s│    │ cached   │              │
│  └─────────┘    └────┬─────┘    └────┬─────┘    └──────────┘              │
│                      │               │                                     │
│                      │          No: expired                                │
│                      │               │                                     │
│                      │               ▼                                     │
│                      │        ┌──────────┐    ┌──────────┐                │
│                      │        │ boto3    │────│ Store in │                │
│                      │        │ API call │    │ cache    │                │
│                      │        └──────────┘    └──────────┘                │
│                                                                             │
│  Cache Invalidation:                                                        │
│  - POST /refresh  → clears _cache (keeps sessions)                         │
│  - POST /disconnect → clears _cache + _sessions + _credentials             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Parallel Execution Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Parallel Data Fetching                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  /dashboard endpoint (line 1643):                                           │
│                                                                             │
│  ┌──────────────────────────────────────────────────┐                      │
│  │          asyncio.gather(*[                         │                      │
│  │            ec2_instances(),    ─┐                  │                      │
│  │            s3_buckets(),       │                  │                      │
│  │            lambda_functions(), │  9 services      │                      │
│  │            rds_instances(),    │  running          │                      │
│  │            iam_info(),         │  in parallel      │                      │
│  │            vpc_info(),         │  via ThreadPool   │                      │
│  │            cost_info(),        │  Executor         │                      │
│  │            security_findings(),│  (20 workers)     │                      │
│  │            activity_timeline()─┘                  │                      │
│  │          ])                                        │                      │
│  └──────────────────────────────────────────────────┘                      │
│                                                                             │
│  ThreadPoolExecutor(max_workers=20):                                        │
│  - Each AWS service call runs in a separate thread                         │
│  - boto3 clients are thread-safe                                           │
│  - asyncio.gather() awaits all results                                     │
│  - Total response time = max(slowest service) instead of sum(all)          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. API Reference

### 4.1 Auth Endpoints

#### POST /auth

Authenticate with AWS (live) or LocalStack.

**Request Body:**
```json
{
  "accessKeyId": "AKIAIOSFODNN7EXAMPLE",
  "secretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  "sessionToken": "optional-for-STS-temporary-creds",
  "region": "us-east-1",
  "use_localstack": false,
  "endpoint_url": "http://localhost:4566"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "status": "success",
  "account": "123456789012",
  "arn": "arn:aws:iam::123456789012:root",
  "message": "Connected to AWS account 123456789012"
}
```

**Error Response (401):**
```json
{
  "detail": "Authentication failed: Invalid AWS Access Key ID"
}
```

**Key Behavior:**
- Validates credentials via `sts.get_caller_identity()` BEFORE storing
- Failed auth does NOT corrupt global state
- LocalStack auth uses `test/test` keys with `endpoint_url`

**boto3 Calls:** `sts.get_caller_identity()`

---

#### POST /refresh

Clear cache so next requests fetch fresh data from AWS.

**Request Body:** `{}`

**Response (200):**
```json
{
  "success": true,
  "message": "Cache cleared"
}
```

**Key Behavior:**
- Only clears `_cache` dict
- Does NOT clear sessions (prevents data loss on reload)

---

#### POST /disconnect

Clear credentials and session — called when dashboard disconnects.

**Request Body:** `{}`

**Response (200):**
```json
{
  "success": true,
  "message": "Disconnected. MCP server will require re-authentication."
}
```

**Key Behavior:**
- Resets `_credentials` to LocalStack defaults
- Clears `_sessions` and `_cache`

---

#### POST /set_timeout

Set session timeout in seconds.

**Request Body:**
```json
{
  "timeout": 3600
}
```

**Response (200):**
```json
{
  "success": true,
  "timeout": 3600
}
```

---

### 4.2 Core AWS Endpoints

#### POST /ec2

List EC2 instances with CloudWatch metrics.

**Request Body:** `{}`

**Response (200):**
```json
{
  "instances": [
    {
      "id": "i-0abc123def456789",
      "name": "web-server-1",
      "type": "t2.micro",
      "state": "running",
      "public_ip": "54.123.45.67",
      "private_ip": "10.0.1.50",
      "az": "us-east-1a",
      "launch_time": "2026-07-15T10:30:00Z",
      "cpu_avg": 12.5,
      "network_in": 1048576,
      "network_out": 2097152,
      "disk_read": 524288
    }
  ],
  "region": "us-east-1"
}
```

**boto3 Calls:**
- `ec2.describe_instances()`
- `cloudwatch.get_metric_statistics()` (CPU, NetworkIn, NetworkOut, DiskReadOps)

**Cache TTL:** 30 seconds

---

#### POST /s3

List S3 buckets with versioning, encryption, and object count.

**Request Body:** `{}`

**Response (200):**
```json
{
  "buckets": [
    {
      "name": "production-logs",
      "region": "us-east-1",
      "size": "2.4 GB",
      "object_count": 15234,
      "versioning": "Enabled",
      "encryption": "Enabled",
      "public_access": "Blocked"
    }
  ]
}
```

**boto3 Calls:**
- `s3.list_buckets()`
- `s3.get_bucket_versioning()`
- `s3.get_bucket_encryption()`
- `s3.get_public_access_block()`
- `s3.list_objects_v2()` (paginator for count/size)

**Cache TTL:** 300 seconds

---

#### POST /lambda

List Lambda functions with invocation metrics.

**Request Body:** `{}`

**Response (200):**
```json
{
  "functions": [
    {
      "name": "notification-handler",
      "runtime": "python3.12",
      "memory": 256,
      "timeout": 30,
      "state": "Active",
      "invocations_24h": 1523,
      "errors_24h": 3,
      "avg_duration": 145.2
    }
  ]
}
```

**boto3 Calls:**
- `lambda.list_functions()`
- `cloudwatch.get_metric_statistics()` (Invocations, Errors, Duration)

**Cache TTL:** 30 seconds

---

#### POST /rds

List RDS instances with connection metrics.

**Request Body:** `{}`

**Response (200):**
```json
{
  "instances": [
    {
      "name": "prod-database",
      "engine": "postgres",
      "status": "available",
      "cpu": 35.2,
      "storage": "100 GB",
      "multi_az": true,
      "connections": 45
    }
  ]
}
```

**boto3 Calls:**
- `rds.describe_db_instances()`
- `cloudwatch.get_metric_statistics()` (CPU, DatabaseConnections)

**Cache TTL:** 30 seconds

---

#### POST /iam

List IAM users, roles, and policies.

**Request Body:** `{}`

**Response (200):**
```json
{
  "users": [
    {
      "name": "admin-user",
      "mfa_enabled": true,
      "access_key_age": 120,
      "groups": ["Admin"],
      "last_activity": "2026-07-15"
    }
  ],
  "roles": [
    {
      "name": "LambdaExecutionRole",
      "trust_service": "lambda.amazonaws.com"
    }
  ],
  "policies": [
    {
      "name": "AdministratorAccess",
      "type": "Managed",
      "usage_count": 5
    }
  ]
}
```

**boto3 Calls:**
- `iam.list_users()`, `iam.list_mfa_devices()`, `iam.list_access_keys()`
- `iam.list_roles()`, `iam.list_policies()`

**Cache TTL:** 300 seconds

---

#### POST /vpc

List VPCs, subnets, and security groups.

**Request Body:** `{}`

**Response (200):**
```json
{
  "vpcs": [
    {
      "id": "vpc-0abc123",
      "cidr": "10.0.0.0/16",
      "state": "available",
      "subnets": [
        {
          "id": "subnet-0def456",
          "cidr": "10.0.1.0/24",
          "az": "us-east-1a",
          "available_ips": 245
        }
      ]
    }
  ],
  "security_groups": [
    {
      "name": "web-sg",
      "inbound_rules": 5,
      "outbound_rules": 2
    }
  ]
}
```

**boto3 Calls:**
- `ec2.describe_vpcs()`, `ec2.describe_subnets()`, `ec2.describe_security_groups()`

**Cache TTL:** 300 seconds

---

#### POST /cost

Cost Explorer data with daily trends and breakdowns.

**Request Body:** `{}`

**Response (200):**
```json
{
  "today": 45.23,
  "yesterday": 38.67,
  "month": 1234.56,
  "daily_trend": [
    {"date": "2026-07-01", "amount": 42.10},
    {"date": "2026-07-02", "amount": 39.85}
  ],
  "by_service": [
    {"service": "EC2", "amount": 456.78},
    {"service": "S3", "amount": 123.45}
  ],
  "by_region": [
    {"region": "us-east-1", "amount": 890.12},
    {"region": "eu-west-1", "amount": 344.44}
  ]
}
```

**boto3 Calls:** `ce.get_cost_and_usage()` (6 parallel queries)

**Cache TTL:** 30 seconds

---

#### POST /security

Cross-service security audit.

**Request Body:** `{}`

**Response (200):**
```json
{
  "findings": [
    {
      "id": "SEC-001",
      "title": "S3 Bucket Without Encryption",
      "severity": "High",
      "resource": "my-bucket",
      "region": "us-east-1",
      "timestamp": "2026-07-15T10:30:00Z"
    }
  ],
  "summary": {
    "critical": 2,
    "high": 5,
    "medium": 8,
    "low": 3
  }
}
```

**boto3 Calls:**
- S3: `get_bucket_encryption()`, `get_public_access_block()`
- EC2: `describe_security_groups()` (0.0.0.0/0 check)
- IAM: `list_mfa_devices()` (MFA check)

**Cache TTL:** 30 seconds

---

#### POST /activity

CloudTrail events from the last 24 hours.

**Request Body:** `{}`

**Response (200):**
```json
{
  "events": [
    {
      "event_name": "RunInstances",
      "event_source": "ec2.amazonaws.com",
      "time": "2026-07-15T10:30:00Z",
      "region": "us-east-1",
      "status": "Success"
    }
  ]
}
```

**boto3 Calls:** `cloudtrail.lookup_events()` (last 24h, max 50)

**Cache TTL:** 30 seconds

---

### 4.3 Extended AWS Endpoints

All extended endpoints follow the same pattern: POST with `{}`, return JSON.

| Endpoint | boto3 Calls | Cache TTL |
|---|---|---|
| POST /ebs | `ec2.describe_volumes()`, `ec2.describe_snapshots()` | 300s |
| POST /route53 | `route53.list_hosted_zones()`, `route53.list_health_checks()` | 300s |
| POST /elb | `elbv2.describe_load_balancers()`, `elbv2.describe_target_groups()` | 300s |
| POST /auto_scaling | `autoscaling.describe_auto_scaling_groups()`, `describe_scaling_activities()` | 300s |
| POST /cloudwatch_dash | `cloudwatch.list_dashboards()`, `cloudwatch.describe_alarms()` | 300s |
| POST /ssm | `ssm.list_documents()`, `ssm.describe_parameters()` | 300s |
| POST /ecr | `ecr.describe_repositories()` | 300s |
| POST /ecs | `ecs.list_clusters()`, `ecs.list_services()`, `ecs.describe_services()` | 300s |
| POST /eks | `eks.list_clusters()`, `eks.describe_cluster()` | 300s |
| POST /cloudformation | `cfn.list_stacks()` | 300s |
| POST /codepipeline | `codepipeline.list_pipelines()` | 300s |
| POST /codebuild | `codebuild.list_projects()` | 300s |
| POST /codedeploy | `codedeploy.list_applications()`, `codedeploy.list_deployments()` | 300s |
| POST /secrets_manager | `secretsmanager.list_secrets()` | 300s |
| POST /parameter_store | `ssm.describe_parameters()` | 300s |
| POST /acm | `acm.list_certificates()` | 300s |
| POST /dynamodb | `dynamodb.list_tables()`, `dynamodb.describe_table()` | 300s |
| POST /sns | `sns.list_topics()`, `sns.list_subscriptions()` | 300s |
| POST /sqs | `sqs.list_queues()`, `sqs.get_queue_attributes()` | 300s |
| POST /eventbridge | `events.list_rules()`, `events.list_event_buses()` | 300s |
| POST /backup | `backup.describe_backup_vaults()`, `backup.list_backup_plans()` | 300s |
| POST /budgets | `budgets.describe_budgets()` | 300s |

---

### 4.4 Utility Endpoints

#### POST /dashboard

Batch endpoint — calls all 9 core services in parallel.

**Request Body:** `{}`

**Response:** Combined JSON of ec2, s3, lambda, rds, iam, vpc, cost, security, activity.

**Implementation:** Uses `asyncio.gather()` with `ThreadPoolExecutor(max_workers=20)`

---

#### GET /health

Health check endpoint.

**Response (200):**
```json
{
  "status": "ok",
  "credentials_configured": true,
  "localstack": false
}
```

---

#### GET /sync-credentials

Return current credentials for MCP server sync.

**Response (200):**
```json
{
  "connected": true,
  "use_localstack": false,
  "aws_access_key": "AKIA...",
  "aws_secret_key": "wJal...",
  "aws_region": "us-east-1",
  "endpoint_url": "",
  "aws_session_token": ""
}
```

---

## 5. Chatbot & AI Engine

### 5.1 Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Chatbot Three-Layer Architecture                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User Message: "list my ec2 instances"                                      │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ LAYER 1: Command Recognition                     │                      │
│  │ (keyword matching — instant response)             │                      │
│  │                                                   │                      │
│  │ Pattern: "list ec2" OR "show ec2" OR "instances" │                      │
│  │ Match: YES → call ec2_instances() → format        │                      │
│  └──────────────────────┬───────────────────────────┘                      │
│                         │                                                   │
│                    No match?                                                │
│                         │                                                   │
│                         ▼                                                   │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ LAYER 2: AI Analysis Engine                      │                      │
│  │ (rule-based scoring — 0-100)                      │                      │
│  │                                                   │                      │
│  │ Keywords: "security analysis", "cost analysis",  │                      │
│  │           "architecture review", "health check"  │                      │
│  │ Match: YES → run analysis → return report        │                      │
│  └──────────────────────┬───────────────────────────┘                      │
│                         │                                                   │
│                    No match?                                                │
│                         │                                                   │
│                         ▼                                                   │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ LAYER 3: LLM Fallback Chain                      │                      │
│  │ (AI-generated response)                           │                      │
│  │                                                   │                      │
│  │ Priority:                                         │                      │
│  │  1. Anthropic Claude (paid, best quality)         │                      │
│  │  2. Ollama qwen2.5:1.5b (free, local, ~6-11s)   │                      │
│  │  3. Local rule-based analysis (instant)           │                      │
│  └──────────────────────────────────────────────────┘                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Layer 1: Command Recognition

All supported commands and their patterns:

| User Input Pattern | Action | Backend Function |
|---|---|---|
| `list ec2`, `show ec2`, `instances`, `list servers` | List EC2 instances | `ec2_instances()` |
| `stop instance i-xxx` | Stop an EC2 instance | `ec2.stop_instances()` |
| `start instance i-xxx` | Start an EC2 instance | `ec2.start_instances()` |
| `list s3`, `buckets`, `show s3` | List S3 buckets | `s3_buckets()` |
| `list lambda`, `functions` | List Lambda functions | `lambda_functions()` |
| `list rds`, `databases` | List RDS instances | `rds_instances()` |
| `list iam`, `users` | List IAM users | `iam_info()` |
| `list vpc`, `network` | List VPCs | `vpc_info()` |
| `cost`, `billing`, `spending` | Cost overview | `cost_info()` |
| `security`, `vulnerabilities` | Security findings | `security_findings()` |
| `status`, `overview`, `dashboard` | Full status (4 services parallel) | Multiple endpoints |
| `help` | Show available commands | Static response |
| `hello`, `hi` | Greeting with suggestions | Static response |

### 5.3 Layer 2: AI Analysis Engine

#### Security Analysis (`_analyze_security`)

Scoring system (0-100):

| Check | Points | Description |
|---|---|---|
| Security Groups open 0.0.0.0/0 | -20 per finding | Public exposure risk |
| S3 buckets without encryption | -15 per finding | Data at rest unprotected |
| IAM users without MFA | -10 per finding | Authentication weakness |
| S3 buckets with public access | -25 per finding | Data exposure risk |

**Score Interpretation:**
- 80-100: Excellent security posture
- 60-79: Good, minor improvements needed
- 40-59: Moderate risk, action recommended
- 0-39: Critical issues, immediate action required

#### Cost Analysis (`_analyze_cost`)

Checks for:
- Stopped EC2 instances still incurring costs
- Burstable instance types (t2/t3) that could be optimized
- Multi-AZ RDS costs vs. single-AZ
- S3 lifecycle policies missing

#### Architecture Review (`_analyze_architecture`)

Checks for:
- Availability Zone distribution (single AZ = risk)
- Database redundancy (single RDS = single point of failure)
- Network segmentation (VPC/subnet structure)
- Serverless opportunities (Lambda vs. EC2)

#### Health Check (`_analyze_overall`)

Combines all three analyses into a single report with:
- Overall score (average of security + cost + architecture)
- Top 3 critical findings
- Recommended actions
- Infrastructure summary

### 5.4 Layer 3: LLM Fallback Chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LLM Fallback Chain                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Unrecognized message arrives                                               │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────┐                                                  │
│  │ 1. Claude API        │  Check: ANTHROPIC_API_KEY set?                   │
│  │    claude-3-5-sonnet │  Quality: ★★★★★                                  │
│  │    Cost: ~$0.003/1K  │  Latency: ~2-5s                                  │
│  └──────────┬───────────┘                                                  │
│             │ No key?                                                       │
│             ▼                                                               │
│  ┌──────────────────────┐                                                  │
│  │ 2. Ollama (Local)    │  Check: Ollama running on :11434?               │
│  │    qwen2.5:1.5b      │  Quality: ★★★☆☆                                  │
│  │    Cost: FREE         │  Latency: ~6-11s                                 │
│  └──────────┬───────────┘                                                  │
│             │ Not running?                                                  │
│             ▼                                                               │
│  ┌──────────────────────┐                                                  │
│  │ 3. Local AI Engine   │  Always available                                 │
│  │    Rule-based        │  Quality: ★★☆☆☆                                   │
│  │    Cost: FREE         │  Latency: <1s (instant)                          │
│  └──────────────────────┘                                                  │
│                                                                             │
│  LLM System Prompt:                                                         │
│  "You are a senior DevOps/AWS cloud architect assistant.                    │
│   Provide clear, actionable advice. Use markdown formatting."               │
│                                                                             │
│  Context Sent to LLM:                                                       │
│  - Infrastructure summary (instance count, bucket count, etc.)             │
│  - Current costs                                                            │
│  - Security findings count                                                  │
│  - User's question                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. MCP Server Integration

### 6.1 What is MCP?

MCP (Model Context Protocol) is a standard for connecting AI assistants to external tools and data sources. The MCP server in this project allows Claude Desktop to directly interact with AWS infrastructure.

### 6.2 Claude Desktop Configuration

```json
{
  "mcpServers": {
    "aws-devops": {
      "command": "python3",
      "args": ["/home/bsetec/Downloads/MCP_Project/MCP_Devops_pro/claude-mcp-server.py"],
      "env": {
        "MCP_BACKEND_URL": "http://127.0.0.1:8085"
      }
    }
  }
}
```

**File:** `~/.config/Claude/claude_desktop_config.json`

### 6.3 MCP Server Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MCP Server Architecture                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐                                                          │
│  │ Claude       │                                                          │
│  │ Desktop      │                                                          │
│  │              │                                                          │
│  │ User: "List  │                                                          │
│  │ my EC2       │                                                          │
│  │ instances"   │                                                          │
│  └──────┬───────┘                                                          │
│         │ stdio (stdin/stdout)                                              │
│         │                                                                   │
│         ▼                                                                   │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ claude-mcp-server.py                              │                      │
│  │ FastMCP("AWS DevOps Tools", version="1.0.0")     │                      │
│  │ Transport: stdio                                   │                      │
│  │                                                    │                      │
│  │ @mcp.tool() list_ec2_instances()                  │                      │
│  │   → sync_from_dashboard() (HTTP GET)              │                      │
│  │   → get_client("ec2")                             │                      │
│  │   → ec2.describe_instances()                      │                      │
│  │   → return formatted results                      │                      │
│  └──────────────────────┬───────────────────────────┘                      │
│                         │                                                   │
│                    HTTP │ (credential sync)                                 │
│                         │                                                   │
│                         ▼                                                   │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ Python Backend (localhost:8085)                    │                      │
│  │ GET /sync-credentials                             │                      │
│  │ → returns current AWS credentials                 │                      │
│  └──────────────────────────────────────────────────┘                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 All 22 MCP Tools

| Tool Name | Description | AWS Service |
|---|---|---|
| `sync_dashboard_credentials` | Re-sync credentials from dashboard backend | — |
| `configure_localstack` | Switch to LocalStack mode | — |
| `configure_aws` | Switch to real AWS | — |
| `get_connection_status` | Check current connection status | — |
| `list_ec2_instances` | List all EC2 instances with status/type/IP/tags | EC2 |
| `get_ec2_instance_status` | Detailed status of specific EC2 instance + CPU | EC2 + CloudWatch |
| `stop_ec2_instance` | Stop a running EC2 instance | EC2 |
| `start_ec2_instance` | Start a stopped EC2 instance | EC2 |
| `list_s3_buckets` | List all S3 buckets with object counts | S3 |
| `list_s3_objects` | List all objects in an S3 bucket | S3 |
| `list_lambda_functions` | List all Lambda functions | Lambda |
| `invoke_lambda_function` | Invoke a Lambda function | Lambda |
| `list_dynamodb_tables` | List all DynamoDB tables with status | DynamoDB |
| `query_dynamodb_table` | Scan a DynamoDB table | DynamoDB |
| `list_sqs_queues` | List all SQS queues with message counts | SQS |
| `list_iam_users` | List all IAM users with groups/MFA/key age | IAM |
| `list_vpcs` | List all VPCs with CIDR/subnets/state | VPC/EC2 |
| `list_security_groups` | List all security groups with rules | VPC/EC2 |
| `list_secrets` | List Secrets Manager secrets | Secrets Manager |
| `list_sns_topics` | List all SNS topics | SNS |
| `get_cost_overview` | Get cost overview (today/yesterday/month) | Cost Explorer |
| `list_rds_instances` | List all RDS instances | RDS |
| `list_ecs_clusters` | List all ECS clusters and services | ECS |
| `list_cloudwatch_alarms` | List all CloudWatch alarms | CloudWatch |
| `security_audit` | Run cross-service security audit | S3 + EC2 + IAM |

### 6.5 Credential Sync Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Credential Sync Flow                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SCENARIO 1: Fresh Start                                                    │
│  ┌─────────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐     │
│  │ MCP Server  │───→│ GET      │───→│ Backend has  │───→│ Use      │     │
│  │ starts      │    │ /sync-   │    │ LocalStack   │    │ LocalStack│     │
│  │             │    │ creds    │    │ defaults     │    │ mode     │     │
│  └─────────────┘    └──────────┘    └──────────────┘    └──────────┘     │
│                                                                             │
│  SCENARIO 2: Dashboard Connected First                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐        │
│  │ User     │───→│ Dashboard│───→│ Backend has  │───→│ MCP syncs│        │
│  │ logs in  │    │ auth     │    │ live AWS     │    │ live AWS │        │
│  │ to       │    │ with     │    │ credentials  │    │ creds    │        │
│  │ dashboard│    │ live key │    │              │    │          │        │
│  └──────────┘    └──────────┘    └──────────────┘    └──────────┘        │
│                                                                             │
│  SCENARIO 3: Re-sync from Claude Desktop                                   │
│  ┌─────────────┐    ┌──────────┐    ┌──────────────┐                     │
│  │ User runs   │───→│ MCP tool │───→│ Gets latest  │                     │
│  │ sync_       │    │ calls    │    │ credentials  │                     │
│  │ dashboard_  │    │ /sync-   │    │ from backend │                     │
│  │ credentials │    │ creds    │    │              │                     │
│  └─────────────┘    └──────────┘    └──────────────┘                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Development Guide

### 7.1 Project File Structure

```
MCP_Devops_pro/
├── app/                              # Next.js App Router pages
│   ├── page.tsx                      # Homepage (landing page)
│   ├── layout.tsx                    # Root layout
│   ├── loading.tsx                   # Loading spinner
│   ├── globals.css                   # Global styles
│   ├── aws-dashboard/page.tsx        # Main AWS Dashboard (2,172 lines)
│   ├── ci-cd/page.tsx                # CI/CD Pipeline
│   ├── cloud-infrastructure/page.tsx # Cloud Infrastructure
│   ├── code-analysis/page.tsx        # Code Analysis
│   ├── container-orchestration/      # Container Orchestration
│   ├── security-scanning/page.tsx    # Security Scanning
│   ├── performance-monitoring/       # Performance Monitoring
│   ├── load-testing/page.tsx         # Load Testing
│   ├── incident-response/page.tsx    # Incident Response
│   ├── about/page.tsx                # About page
│   └── api/v1/
│       ├── aws/route.ts              # AWS proxy (action dispatch)
│       ├── aws/[action]/route.ts     # Dynamic AWS action route
│       ├── chat/route.ts             # Chat proxy to backend
│       ├── mcp/route.ts              # MCP server management
│       ├── mcp/[env]/route.ts        # Per-environment MCP proxy
│       ├── openclaw/route.ts         # OpenClaw AI agent proxy
│       ├── development/route.ts      # Development environment
│       └── verify-git/route.ts       # Git credential verification
│
├── aws-mcp-server/                   # Python FastAPI backend
│   ├── server.py                     # Main server (2,584 lines)
│   ├── requirements.txt              # Python dependencies
│   ├── Dockerfile                    # Docker build
│   └── docker-compose.yml            # Docker compose
│
├── claude-mcp-server.py              # MCP server for Claude Desktop (764 lines)
│
├── components/                       # Shared React components
│   ├── MultiModalChat.tsx            # AI chatbot widget (817 lines)
│   ├── AgentChat.tsx                 # Agent chat interface (894 lines)
│   ├── CredentialModal.tsx           # AWS credential modal
│   ├── LayoutShell.tsx               # Layout wrapper
│   ├── Sidebar.tsx                   # Navigation sidebar
│   ├── ThemeProvider.tsx              # Dark/light theme
│   ├── FeatureCard.tsx               # Feature card
│   └── PageLayout.tsx                # Page layout
│
├── scripts/
│   ├── mcp-env-server.js             # Node.js MCP server per env
│   ├── start-mcp-servers.sh          # Start all MCP servers
│   └── stop-mcp-servers.sh           # Stop all MCP servers
│
├── localstack_test/                  # LocalStack test scripts
│   ├── setup-enterprise-demo.sh      # Demo data setup
│   ├── cleanup-demo.sh               # Demo cleanup
│   └── lambda/                       # Lambda test functions
│
├── Makefile                           # One-click startup (make start)
├── package.json                      # Node.js dependencies
├── next.config.js                    # Next.js config
├── tailwind.config.js                # Tailwind config
└── tsconfig.json                     # TypeScript config
```

### 7.2 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/abdulJ04/MCP_Devops_pro.git
cd MCP_Devops_pro

# 2. Start everything
make start

# 3. Open browser
# Frontend: http://localhost:3000
# Backend:  http://localhost:8085
```

### 7.3 How to Add a New AWS Service

**Step 1:** Add endpoint in `aws-mcp-server/server.py`:

```python
@app.post("/new_service")
async def new_service(request: dict = {}):
    _ensure_credentials(**request)
    cache_key = "new_service"
    cached = _cached(cache_key, INVENTORY_TTL)
    if cached:
        return cached

    client = _get_client("new_service")
    # ... boto3 calls ...
    result = {"data": [...]}
    _set_cache(cache_key, result)
    return result
```

**Step 2:** Add to `/dashboard` batch endpoint:

```python
# In dashboard() function, add to asyncio.gather():
new_service_data = new_service(),
```

**Step 3:** Add chatbot command in `/chat` endpoint:

```python
if any(w in msg for w in ["new service", "show new"]):
    tools_used.append("new_service")
    data = await new_service(request)
    response = format_response(data)
```

**Step 4:** Add MCP tool in `claude-mcp-server.py`:

```python
@mcp.tool()
def list_new_service() -> str:
    """List new service resources."""
    client = get_client("new_service")
    # ... boto3 calls ...
    return formatted_result
```

### 7.4 Environment Variables

| Variable | Location | Default | Purpose |
|---|---|---|---|
| `OLLAMA_URL` | `.env.development` | `http://localhost:11434` | Ollama LLM server URL |
| `OLLAMA_MODEL` | `.env.development` | `qwen2.5:1.5b` | Ollama model name |
| `GROQ_API_KEY` | `.env.development` | `""` | Groq API key (optional) |
| `ANTHROPIC_API_KEY` | `.env.development` | `""` | Anthropic API key (optional) |
| `MCP_BACKEND_URL` | `claude-mcp-server.py` | `http://127.0.0.1:8085` | Backend URL for MCP sync |
| `OPENCLAW_HOST` | `next.config.js` | `localhost` | OpenClaw agent host |
| `OPENCLAW_PORT` | `next.config.js` | `18789` | OpenClaw agent port |
| `MCP_DEV_URL` | `next.config.js` | `http://localhost:8082` | Dev MCP server URL |
| `MCP_STAGING_URL` | `next.config.js` | `http://localhost:8081` | Staging MCP server URL |
| `MCP_PROD_URL` | `next.config.js` | `http://localhost:8083` | Prod MCP server URL |

### 7.5 Line Count Breakdown

| File | Lines | Purpose |
|---|---|---|
| `aws-mcp-server/server.py` | 2,584 | Backend (all AWS endpoints + chat + AI) |
| `app/aws-dashboard/page.tsx` | 2,172 | AWS Dashboard UI |
| `app/cloud-infrastructure/page.tsx` | 1,196 | Cloud Infrastructure page |
| `app/ci-cd/page.tsx` | 1,172 | CI/CD page |
| `components/AgentChat.tsx` | 894 | Agent chat interface |
| `components/MultiModalChat.tsx` | 817 | AI chatbot widget |
| `claude-mcp-server.py` | 764 | MCP server (Claude Desktop) |
| `app/container-orchestration/page.tsx` | 735 | Container Orchestration page |
| `app/security-scanning/page.tsx` | 968 | Security Scanning page |
| `app/code-analysis/page.tsx` | 540 | Code Analysis page |
| Other files | ~3,140 | Config, pages, components, scripts |
| **Total** | **15,080** | |

### 7.6 Dual Mode: LocalStack vs Real AWS

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Dual Mode Architecture                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LOCALSTACK MODE (Testing/Demo)                                             │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ Credentials: test/test                            │                      │
│  │ Endpoint: http://localhost:4566                   │                      │
│  │ Use case: Free testing, demo, development         │                      │
│  │ Setup: localstack start -d                        │                      │
│  │ Data: recreated via setup-enterprise-demo.sh      │                      │
│  └──────────────────────────────────────────────────┘                      │
│                                                                             │
│  REAL AWS MODE (Production)                                                 │
│  ┌──────────────────────────────────────────────────┐                      │
│  │ Credentials: User's actual AWS keys               │                      │
│  │ Endpoint: api.*.amazonaws.com (standard)          │                      │
│  │ Use case: Real infrastructure monitoring          │                      │
│  │ Setup: Enter keys in dashboard AuthScreen         │                      │
│  │ Data: Live AWS account data                       │                      │
│  └──────────────────────────────────────────────────┘                      │
│                                                                             │
│  SWITCHING:                                                                 │
│  - Auth with use_localstack: true → LocalStack mode                        │
│  - Auth with real AWS keys → Live AWS mode                                 │
│  - /disconnect → resets to LocalStack defaults                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Thread Safety

The backend uses `threading.RLock` to protect global state from race conditions:

```python
_creds_lock = threading.RLock()

# Protected operations:
# - _ensure_credentials() — credential switching
# - _get_session() — boto3 session creation
# - _get_client() — boto3 client creation
# - /auth — authentication
# - /refresh — cache clearing
# - /disconnect — credential reset
# - /sync-credentials — credential reading
```

This prevents issues when:
- 31 parallel dashboard requests arrive simultaneously
- Multiple browser tabs connect with different credentials
- Claude Desktop MCP server syncs while dashboard is active

---

*Documentation generated for MCP DevOps Pro v0.1.0*
*Total project size: 15,080 lines across 54 source files*
