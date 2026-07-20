# MCP DevOps Pro

> AI-powered DevOps platform with real-time AWS monitoring, intelligent chatbot, security analysis, and Claude Desktop MCP integration.

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18-blue)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.12+-yellow)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple)](LICENSE)

---

![System Overview](docs/system_overview.png)

---

## Features

| Feature | Description |
|---------|-------------|
| **AWS Dashboard** | Real-time monitoring of 30+ AWS services with charts and metrics |
| **AI Chatbot** | Natural language commands to query and manage AWS resources |
| **Security Analysis** | Automated security audit with scoring (0-100) |
| **Cost Optimization** | Cost analysis with savings recommendations |
| **Architecture Review** | Automated architecture health scoring |
| **LLM Integration** | Claude API + Ollama (local) + Groq (free) |
| **MCP Server** | 22 tools for Claude Desktop integration |
| **Dual Mode** | LocalStack (free) for testing, Real AWS for production |
| **Dark/Light Theme** | Route-based theming — dark on dashboard, light elsewhere |
| **Voice Chat** | Speech-to-text and text-to-speech in chatbot |
| **File Upload** | Drag-and-drop image/video/file attachments |

---

## How It Works

![Data Flow](docs/data_flow.png)

```
User clicks tab → Frontend fetchAWS() → Next.js proxy → Python backend
    → boto3 API call → AWS/LocalStack → Response → Tables/Charts/Cards
```

---

## Prerequisites

| Tool | Version | Check Command |
|------|---------|---------------|
| **Node.js** | 18+ | `node --version` |
| **npm** | 9+ | `npm --version` |
| **Python** | 3.10+ | `python3 --version` |
| **pip3** | Latest | `pip3 --version` |
| **Git** | Any | `git --version` |
| **Docker** | 20+ (for LocalStack) | `docker --version` |

### Install missing tools (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install -y nodejs npm python3 python3-pip git docker.io
```

---

## Quick Start (4 Steps)

### Step 1: Clone the repository
```bash
git clone https://github.com/abdulJ04/MCP_Devops_pro.git
cd MCP_Devops_pro
```

### Step 2: Install dependencies manually (IMPORTANT — do this first!)
```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
pip3 install -r aws-mcp-server/requirements.txt
```

> **Why install manually?** The `start.sh` script tries to install dependencies, but sometimes it fails silently or the backend starts before dependencies are ready. Installing manually first ensures everything is in place.

### Step 3: Start everything
```bash
bash start.sh
```

This starts:
- Python backend on port **8085**
- Next.js frontend on port **3000**

### Step 4: Open in browser
```
http://localhost:3000
```

**That's it!** You're ready to go.

---

### ⚠️ Port 8085 Not Connected? (Common Issue)

If you see **"Backend port 8085 not connected"** or the dashboard shows no data:

**Step 1: Check if backend is running**
```bash
curl http://localhost:8085/health
```

If it returns nothing or an error, the backend is not running.

**Step 2: Kill any old process on port 8085**
```bash
lsof -ti:8085 | xargs kill -9
```

**Step 3: Start backend manually**
```bash
cd aws-mcp-server
python3 server.py
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8085
```

**Step 4: Open a new terminal and start frontend**
```bash
npm run dev
```

**Step 5: Verify both are running**
```bash
# Check backend
curl http://localhost:8085/health
# Should return: {"status":"ok","credentials_configured":true,...}

# Check frontend
curl -s http://localhost:3000 | head -5
# Should return HTML
```

**Other quick fixes:**
```bash
# Kill everything and restart clean
pkill -f "next dev"
pkill -f "server.py"
lsof -ti:8085 | xargs kill -9
lsof -ti:3000 | xargs kill -9

# Then restart
bash start.sh
```

---

## First-Time Setup Guide

### Option A: Real AWS Account (Recommended)

**Step 1: Get AWS credentials**
1. Go to [AWS Console](https://console.aws.amazon.com/) → IAM → Users → Your User
2. Click **Security Credentials** → **Create Access Key**
3. Copy the **Access Key ID** and **Secret Access Key**

**Step 2: Connect to dashboard**
1. Open `http://localhost:3000/aws-dashboard`
2. Toggle **"Use LocalStack"** to OFF
3. Enter your **Access Key ID** (starts with `AKIA`)
4. Enter your **Secret Access Key**
5. Select your **Region** (e.g., `us-east-1`)
6. Click **"Connect"**

**Step 3: Explore!**
- All 30+ AWS services will load automatically
- Try "cost analysis" for spending insights
- Try "architecture review" for infrastructure health

---

### Option B: LocalStack (Free — No AWS Account Needed)

LocalStack is a local AWS emulator. Perfect for testing without spending money.

**Step 1: Start LocalStack**

```bash
# Using LocalStack CLI (recommended)
localstack start -d

# OR using Docker directly
docker run -d --name localstack-main -p 4566:4566 localstack/localstack
```

**Step 2: Create demo data using the included scripts**

The `localstack_test/` folder has ready-made scripts to create demo data:

```bash
# Navigate to the LocalStack test folder
cd localstack_test

# See what files are available
ls -la
# You'll see:
#   setup-enterprise-demo.sh  — Creates 3 EC2 instances + 8 S3 buckets + more
#   cleanup-demo.sh           — Removes all demo data
#   localstack_issue.sh       — Fixes common LocalStack issues
#   lambda/                   — Sample Lambda functions (hello-world, billing, monitoring, notification)
#   data/                     — Sample JSON data files (users, employees, secrets)

# Create demo data
bash setup-enterprise-demo.sh

# Go back to project root
cd ..
```

**What the demo script creates:**
| Resource | Count | Names |
|----------|-------|-------|
| EC2 Instances | 3 | web-server-1, api-gateway, worker-node |
| S3 Buckets | 8 | production-logs, user-uploads, backups, static-assets, dev-artifacts, ml-datasets, config-files, analytics-data |
| Lambda Functions | 4 | hello-world, billing, monitoring, notification |

**Step 3: Connect to dashboard**
1. Open `http://localhost:3000/aws-dashboard`
2. Toggle **"Use LocalStack"** to ON
3. Leave Access Key and Secret Key as `test`
4. Region: `us-east-1`
5. Click **"Connect"**

**Step 4: Explore!**
- Click any tab (EC2, S3, Lambda, etc.)
- Try the chatbot: "list ec2 instances"
- Try "security analysis" or "health check"

**Troubleshooting LocalStack:**
```bash
# If LocalStack won't start
localstack stop
localstack start -d

# If demo data creation fails
cd localstack_test
bash cleanup-demo.sh        # Clean first
bash setup-enterprise-demo.sh  # Then recreate

# If still having issues
bash localstack_issue.sh     # Auto-fix common issues

# Check LocalStack health
curl http://localhost:4566/_localstack/health
```

---

## Claude Desktop MCP Integration (Setup First!)

> **Set up MCP before using the chatbot** — This connects Claude Desktop to your AWS infrastructure for natural language management.

### What is MCP?

MCP (Model Context Protocol) lets Claude Desktop directly query and manage your AWS resources. Once configured, you can ask Claude questions like "List my EC2 instances" or "Run a security audit" and it will execute real AWS operations.

### Architecture

```
┌─────────────────┐     stdio      ┌──────────────────┐     HTTP      ┌─────────────────┐
│  Claude Desktop  │◀──────────────▶│  MCP Server       │──────────────▶│  Python Backend  │
│  (AI Assistant)  │                │  (22 AWS Tools)   │              │  (localhost:8085)│
└─────────────────┘                └──────────────────┘              └─────────────────┘
                                          │                                  │
                                          ▼                                  ▼
                                   ┌──────────────┐                ┌──────────────┐
                                   │  LocalStack   │                │  Real AWS    │
                                   │  (port 4566)  │                │  Account     │
                                   └──────────────┘                └──────────────┘
```

### How It Works

1. **You login to Dashboard** → Credentials stored in Python backend (memory only)
2. **MCP Server starts** → Auto-syncs credentials from backend via `/sync-credentials`
3. **Claude Desktop** → Calls MCP tools → MCP server queries AWS via boto3
4. **You disconnect** → Backend clears credentials → MCP detects it → Claude tools return "Not connected"

### Step 1: Install MCP dependencies
```bash
pip3 install fastmcp boto3 botocore
```

### Step 2: Configure Claude Desktop

Edit `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aws-devops": {
      "command": "python3",
      "args": [
        "/home/YOUR_USERNAME/MCP_Devops_pro/claude-mcp-server.py"
      ],
      "env": {
        "MCP_BACKEND_URL": "http://127.0.0.1:8085"
      }
    }
  }
}
```

> **Replace** `/home/YOUR_USERNAME/` with your actual home directory path.

### Step 3: Restart Claude Desktop
Close and reopen Claude Desktop to load the MCP server.

### Step 4: Login to Dashboard FIRST
1. Open `http://localhost:3000/aws-dashboard`
2. Login with LocalStack (toggle ON) or AWS credentials (toggle OFF)
3. Click **Connect**
4. Credentials auto-sync to MCP server

### Step 5: Use in Claude Desktop
Ask Claude questions like:
- "List all EC2 instances"
- "Show me S3 buckets with their sizes"
- "What Lambda functions are deployed?"
- "Run a security audit"
- "Show VPC and security groups"
- "What's my AWS cost today?"

### Available MCP Tools (22)

| Tool | Description |
|------|-------------|
| `sync_dashboard_credentials` | Re-sync credentials from dashboard |
| `configure_localstack` | Switch to LocalStack mode |
| `configure_aws` | Switch to real AWS mode |
| `get_connection_status` | Check current connection status |
| `list_ec2_instances` | List EC2 with status/type/IP/tags |
| `get_ec2_instance_status` | Detailed instance + CPU metrics |
| `stop_ec2_instance` | Stop an EC2 instance |
| `start_ec2_instance` | Start an EC2 instance |
| `list_s3_buckets` | List S3 with object counts |
| `list_s3_objects` | List objects in a bucket |
| `list_lambda_functions` | List Lambda functions |
| `invoke_lambda_function` | Invoke a Lambda function |
| `list_dynamodb_tables` | List DynamoDB tables |
| `query_dynamodb_table` | Scan a DynamoDB table |
| `list_sqs_queues` | List SQS queues |
| `list_iam_users` | List IAM users with MFA |
| `list_vpcs` | List VPCs with subnets |
| `list_security_groups` | List security groups with rules |
| `list_secrets` | List Secrets Manager |
| `list_sns_topics` | List SNS topics |
| `get_cost_overview` | Get cost overview |
| `list_rds_instances` | List RDS databases |
| `list_ecs_clusters` | List ECS clusters |
| `list_cloudwatch_alarms` | List CloudWatch alarms |
| `security_audit` | Cross-service security audit |

### Credential Sync Flow
```
Dashboard Login → POST /auth → Backend stores credentials
                              ↓
MCP Server → GET /sync-credentials → Gets credentials from backend
                              ↓
Claude Desktop → Calls MCP tool → MCP server uses credentials → Returns result

Dashboard Disconnect → POST /disconnect → Backend clears credentials
                              ↓
MCP Server → GET /sync-credentials → connected: false
                              ↓
Claude Desktop → Calls MCP tool → Returns "Not connected" error
```

### Troubleshooting MCP

**MCP server not loading in Claude Desktop:**
```bash
# Test the MCP server directly
python3 /path/to/claude-mcp-server.py

# Check syntax
python3 -c "import ast; ast.parse(open('claude-mcp-server.py').read()); print('OK')"
```

**Claude says "Not connected":**
1. Open dashboard at `http://localhost:3000/aws-dashboard`
2. Login with credentials
3. MCP auto-syncs — try again in Claude

**Permission prompts in Claude Desktop:**
- Click the dropdown next to "Always allow" → Select "Always allow" for each tool
- Or go to Settings → Connectors → aws-devops-tools → Enable auto-approve

---

## AI Chatbot

The chatbot supports natural language commands with a 3-layer architecture:

### Layer 1: Direct Commands
```
"list ec2 instances"    → Shows all EC2 instances
"list s3 buckets"       → Shows all S3 buckets
"list lambda functions" → Shows all Lambda functions
"stop instance i-xxx"   → Stops an EC2 instance
"cost"                  → Shows cost overview
"security"              → Shows security findings
"help"                  → Shows all available commands
```

### Layer 2: AI Analysis
```
"security analysis"     → Deep security audit (score 0-100)
"cost analysis"         → Cost optimization recommendations
"architecture review"   → Architecture health check
"health check"          → Combined analysis of all three
```

### Layer 3: LLM Chat (for anything else)
```
"How to reduce my AWS bill?"
"What's the best instance type for my workload?"
"Explain my security findings"
```

**LLM Priority:**
1. Claude API (paid, best quality)
2. Ollama (free, local, ~6-11s response)
3. Local AI engine (instant, rule-based)

---

## API Reference

### Backend Endpoints (`http://localhost:8085`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth` | POST | Authenticate with AWS or LocalStack |
| `/refresh` | POST | Clear cache for fresh data |
| `/disconnect` | POST | Clear credentials |
| `/set_timeout` | POST | Set session timeout |
| `/health` | GET | Health check |
| `/sync-credentials` | GET | MCP server credential sync |
| `/ec2` | POST | EC2 instances + CloudWatch metrics |
| `/s3` | POST | S3 buckets + encryption + object count |
| `/lambda` | POST | Lambda functions + invocation metrics |
| `/rds` | POST | RDS instances + connection metrics |
| `/iam` | POST | IAM users, roles, policies |
| `/vpc` | POST | VPCs, subnets, security groups |
| `/cost` | POST | Cost Explorer data (daily, by service, by region) |
| `/security` | POST | Cross-service security audit |
| `/activity` | POST | CloudTrail events (last 24h) |
| `/ebs` | POST | EBS volumes and snapshots |
| `/route53` | POST | Route 53 hosted zones |
| `/elb` | POST | Load balancers and target groups |
| `/auto_scaling` | POST | Auto Scaling groups |
| `/cloudwatch_dash` | POST | CloudWatch dashboards and alarms |
| `/ssm` | POST | SSM documents and parameters |
| `/ecr` | POST | ECR repositories |
| `/ecs` | POST | ECS clusters and services |
| `/eks` | POST | EKS clusters |
| `/cloudformation` | POST | CloudFormation stacks |
| `/codepipeline` | POST | CodePipeline pipelines |
| `/codebuild` | POST | CodeBuild projects |
| `/codedeploy` | POST | CodeDeploy applications |
| `/secrets_manager` | POST | Secrets Manager secrets |
| `/parameter_store` | POST | SSM Parameter Store |
| `/acm` | POST | ACM certificates |
| `/dynamodb` | POST | DynamoDB tables |
| `/sns` | POST | SNS topics and subscriptions |
| `/sqs` | POST | SQS queues |
| `/eventbridge` | POST | EventBridge rules |
| `/backup` | POST | AWS Backup vaults and plans |
| `/budgets` | POST | AWS Budgets |
| `/dashboard` | POST | Batch: all core services in parallel |
| `/chat` | POST | AI chatbot endpoint |

---

## LLM Configuration (Optional)

The chatbot works without any API keys (local AI engine). To enable better AI responses:

### Ollama (Free, Local)
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull qwen2.5:1.5b

# Start Ollama (runs on localhost:11434)
ollama serve
```

### Groq (Free, Cloud)
```bash
# Get key from https://console.groq.com
export GROQ_API_KEY="gsk_..."
```

### Anthropic Claude (Paid, Best Quality)
```bash
# Get key from https://console.anthropic.com
export ANTHROPIC_API_KEY="sk-ant-..."
```

Set these in `start.sh` or export before running:
```bash
export OLLAMA_URL="http://localhost:11434"
export OLLAMA_MODEL="qwen2.5:1.5b"
export GROQ_API_KEY=""
export ANTHROPIC_API_KEY=""
```

---

## Project Structure

```
MCP_Devops_pro/
├── app/                              # Next.js App Router
│   ├── page.tsx                      # Homepage
│   ├── layout.tsx                    # Root layout
│   ├── aws-dashboard/page.tsx        # AWS Dashboard (2,172 lines)
│   ├── ci-cd/page.tsx                # CI/CD Pipeline
│   ├── cloud-infrastructure/page.tsx # Cloud Infrastructure
│   ├── code-analysis/page.tsx        # Code Analysis
│   ├── container-orchestration/      # Container Orchestration
│   ├── security-scanning/page.tsx    # Security Scanning
│   ├── performance-monitoring/       # Performance Monitoring
│   ├── load-testing/page.tsx         # Load Testing
│   ├── incident-response/page.tsx    # Incident Response
│   ├── about/page.tsx                # About
│   └── api/v1/
│       ├── aws/route.ts              # AWS proxy
│       ├── chat/route.ts             # Chat proxy
│       └── mcp/route.ts              # MCP server management
│
├── aws-mcp-server/                   # Python Backend
│   ├── server.py                     # FastAPI server (2,584 lines)
│   ├── requirements.txt              # Python dependencies
│   ├── Dockerfile                    # Docker build
│   └── docker-compose.yml            # Docker compose
│
├── claude-mcp-server.py              # MCP Server for Claude Desktop (764 lines)
│
├── components/                       # React Components
│   ├── MultiModalChat.tsx            # AI Chatbot (817 lines)
│   ├── AgentChat.tsx                 # Agent Chat (894 lines)
│   ├── Sidebar.tsx                   # Navigation sidebar
│   ├── ThemeProvider.tsx              # Dark/light theme
│   └── ...
│
├── docs/                             # Documentation
│   ├── PROJECT_DOCUMENTATION.md      # Full documentation
│   ├── system_overview.png           # Architecture diagram
│   └── data_flow.png                 # Data flow diagram
│
├── localstack_test/                  # LocalStack demo scripts
│   ├── setup-enterprise-demo.sh      # Create demo data
│   └── cleanup-demo.sh               # Clean demo data
│
├── start.sh                          # One-click startup
├── package.json                      # Node.js dependencies
├── next.config.js                    # Next.js config
└── tailwind.config.js                # Tailwind config
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js | 15.5.20 |
| Frontend | React | 18.2.0 |
| Frontend | TypeScript | 5.2.2 |
| Frontend | Tailwind CSS | 3.3.0 |
| Frontend | Recharts | 3.9.2 |
| Frontend | Framer Motion | 10.16.4 |
| Backend | Python | 3.12+ |
| Backend | FastAPI | 0.110+ |
| Backend | boto3 | 1.34+ |
| Backend | Uvicorn | 0.27+ |
| MCP | FastMCP | 2.0+ |
| Infra | LocalStack | 2026.7+ |
| Infra | Ollama | Latest |

---

## Ports

| Service | Port | Description |
|---------|------|-------------|
| Next.js Frontend | `3000` | Main UI |
| Python Backend | `8085` | AWS API + Chat |
| LocalStack | `4566` | Local AWS emulator |
| Ollama | `11434` | Local LLM server |
| Dev MCP | `8082` | Dev environment |
| Staging MCP | `8081` | Staging environment |
| Prod MCP | `8083` | Production environment |

---

## Available Commands

```bash
# Start everything
bash start.sh

# Start only frontend
npm run dev

# Start only backend
cd aws-mcp-server && python3 server.py

# Install all dependencies
npm install && pip3 install -r aws-mcp-server/requirements.txt

# Build for production
npm run build

# Run linter
npm run lint

# Create LocalStack demo data
cd localstack_test && bash setup-enterprise-demo.sh

# Clean LocalStack demo data
cd localstack_test && bash cleanup-demo.sh
```

---

## Troubleshooting

### Backend not starting (port 8085 in use)
```bash
lsof -ti:8085 | xargs kill -9
cd aws-mcp-server && python3 server.py
```

### Frontend not starting (port 3000 in use)
```bash
lsof -ti:3000 | xargs kill -9
npm run dev
```

### npm install fails
```bash
rm -rf node_modules package-lock.json
npm install
```

### pip3 install fails
```bash
pip3 install --upgrade pip
pip3 install -r aws-mcp-server/requirements.txt
```

### LocalStack connection refused
```bash
# Check if running
localstack status

# Start it
localstack start -d

# Create demo data
cd localstack_test && bash setup-enterprise-demo.sh
```

### Dashboard shows no data
1. Check backend: `curl http://localhost:8085/health`
2. Check browser console for errors
3. Try disconnect and reconnect
4. Verify credentials are correct

### "Address already in use" error
```bash
# Kill all processes on the port
lsof -ti:8085 | xargs kill -9
lsof -ti:3000 | xargs kill -9

# Restart
bash start.sh
```

---

## Environment Variables

Set in `start.sh` or export before running:

| Variable | Default | Purpose |
|----------|---------|---------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama LLM server |
| `OLLAMA_MODEL` | `qwen2.5:1.5b` | Ollama model name |
| `GROQ_API_KEY` | `""` | Groq API key (optional) |
| `ANTHROPIC_API_KEY` | `""` | Anthropic API key (optional) |
| `MCP_BACKEND_URL` | `http://127.0.0.1:8085` | Backend URL for MCP sync |

---

## Quick Reference Card

```
START:    bash start.sh
STOP:     Ctrl+C
OPEN:     http://localhost:3000
BACKEND:  http://localhost:8085
HEALTH:   curl http://localhost:8085/health

LOCALSTACK:
  Access Key: test
  Secret Key: test
  Region:     us-east-1
  Toggle:     ON

AWS:
  Access Key: AKIA... (your key)
  Secret Key: ...     (your secret)
  Region:     us-east-1 (your region)
  Toggle:     OFF

CHATBOT:
  "list ec2 instances"
  "security analysis"
  "cost analysis"
  "health check"
  "help"

MCP (Claude Desktop):
  Config: ~/.config/Claude/claude_desktop_config.json
  Tools:  22 AWS management tools
```

---

## Documentation

- [Full Documentation](docs/PROJECT_DOCUMENTATION.md) — Complete project docs (1,354 lines)
- [System Overview](docs/system_overview.png) — Architecture diagram
- [Data Flow](docs/data_flow.png) — Request/response flow

---

## License

MIT

---

## Support

If you face any issues:
1. Check the [Troubleshooting](#troubleshooting) section
2. Check if all services are running (`curl http://localhost:8085/health`)
3. Check browser console for errors
4. Check terminal for Python/Node errors
