# DevOps AI Agents Platform

Full-stack DevOps platform with CI/CD pipeline, OpenClaw AI agent chat, and real-time AWS Monitoring Dashboard powered by Python MCP backend + boto3.

---

## Features

- **AWS Monitoring Dashboard** - Real-time monitoring of 30+ AWS services
- **CI/CD Pipeline** - Git operations, code cloning, deployment workflows
- **OpenClaw AI Agent** - Chat-based DevOps assistant
- **LocalStack Support** - Test with free LocalStack (no AWS account needed)
- **Real AWS Support** - Connect to production AWS accounts
- **Auto-Refresh** - Configurable refresh intervals (5s to 1h)
- **Collapsible Sidebar** - Grouped service categories

---

## Prerequisites

Before you start, make sure you have:

| Tool | Version | Install Command |
|------|---------|-----------------|
| **Node.js** | 18+ | `sudo apt install nodejs` |
| **npm** | 9+ | Comes with Node.js |
| **Python** | 3.10+ | `sudo apt install python3` |
| **pip3** | Latest | `sudo apt install python3-pip` |
| **Git** | Latest | `sudo apt install git` |

### Check versions:
```bash
node --version    # Should show v18.x or higher
npm --version     # Should show 9.x or higher
python3 --version # Should show 3.10 or higher
git --version     # Any recent version
```

---

## Quick Start (Recommended)

### Step 1: Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/Devops-AI-Agents.git
cd Devops-AI-Agents
```

### Step 2: Run the one-click startup script
```bash
bash start.sh
```

That's it! The script will:
1. Install all npm dependencies
2. Install all Python dependencies
3. Start the Python backend on port 8085
4. Start the Next.js frontend on port 3000

### Step 3: Open in browser
```
http://localhost:3000
```

---

## Manual Installation

If the startup script doesn't work, follow these steps:

### Step 1: Install npm dependencies
```bash
npm install
```

### Step 2: Install Python dependencies
```bash
pip3 install -r aws-mcp-server/requirements.txt
```

### Step 3: Start Python backend
```bash
cd aws-mcp-server
python3 server.py &
cd ..
```

### Step 4: Start Next.js frontend
```bash
npm run dev
```

### Step 5: Open in browser
```
http://localhost:3000
```

---

## LocalStack Setup (Free Testing - No AWS Account Needed)

LocalStack provides a free local AWS emulator. This is the easiest way to test.

### Step 1: Install Docker
```bash
sudo apt install docker.io
sudo systemctl start docker
sudo usermod -aG docker $USER
# Log out and log back in
```

### Step 2: Start LocalStack
- Once you try to test localstack into local goto MCP_Devops_pro/localstack_test
- Next run setup-enterprise-demo.sh
- If any issue run cleanup-demo.sh && localstack_issue.sh
- or follow below instruction.

```bash
docker run -d --name localstack-main -p 4566:4566 localstack/localstack
```

### Step 3: Create demo resources (optional)
```bash
# Set alias for aws cli (localstack)
alias aws='aws --endpoint-url=http://localhost:4566'

# Create S3 buckets
aws s3 mb s3://my-app-bucket
aws s3 mb s3://my-backup-bucket

# Create EC2 instances
aws ec2 run-instances --image-id ami-0c55b159cbfafe1f0 --instance-type t2.micro --count 3

# Create IAM user
aws iam create-user --user-name test-user
```

### Step 4: Connect to dashboard
1. Open `http://localhost:3000`
2. Toggle **"Use LocalStack"** to ON (default)
3. Leave Access Key and Secret Key as any value (e.g., `test` / `test`)
4. Click **"Connect to LocalStack"**

---

## Real AWS Setup

To connect to your real AWS account:

### Step 1: Get AWS credentials
1. Go to AWS Console → IAM → Users → Your User → Security Credentials
2. Create an Access Key (if you don't have one)
3. Copy the **Access Key ID** and **Secret Access Key**

### Step 2: Get session token (if using SSO)
```bash
aws sts get-session-token --duration-seconds 3600
```

### Step 3: Connect to dashboard
1. Open `http://localhost:3000`
2. Toggle **"Use LocalStack"** to OFF
3. Enter your **Access Key ID** (starts with `AKIA`)
4. Enter your **Secret Access Key**
5. Enter your **Session Token** (if using SSO)
6. Select your **Region**
7. Click **"Connect to AWS"**

---

## Configuration

### Refresh Interval
- Click the refresh dropdown in the header
- Select your preferred interval: 5s, 10s, 30s, 1m, 5m, 10m, 30m, or 1h
- Setting is saved to localStorage and persists across refreshes

### Session Timeout
- Default: 1 hour
- Can be changed in Settings tab
- Options: 15min, 30min, 1hr, 2hr, 24hr

### Sidebar
- Click the arrow to collapse/expand sidebar
- Categories: Home, Compute, Storage, Database, Networking, Security, etc.
- Click category to expand/collapse

---

## API Endpoints

The Python backend runs on `http://localhost:8085` with these endpoints:

| Endpoint | Description |
|----------|-------------|
| `POST /ec2` | EC2 instances |
| `POST /s3` | S3 buckets |
| `POST /lambda` | Lambda functions |
| `POST /rds` | RDS databases |
| `POST /iam` | IAM users, roles, policies |
| `POST /vpc` | VPCs and security groups |
| `POST /dynamodb` | DynamoDB tables |
| `POST /sqs` | SQS queues |
| `POST /sns` | SNS topics |
| `POST /secrets_manager` | Secrets Manager |
| `POST /parameter_store` | SSM Parameters |
| `POST /cost` | Cost Explorer data |
| `POST /security` | Security findings |
| `POST /activity` | CloudTrail events |
| `POST /refresh` | Clear cache |
| `POST /set_timeout` | Set session timeout |

---

## Project Structure

```
Devops-AI-Agents/
├── app/
│   ├── api/v1/aws/          # Next.js API routes (proxy to Python backend)
│   │   └── route.ts         # Main AWS endpoint
│   ├── aws-dashboard/       # AWS Dashboard page
│   │   └── page.tsx         # Main dashboard component
│   └── page.tsx             # Home page
├── aws-mcp-server/
│   ├── server.py            # Python FastAPI + boto3 backend
│   └── requirements.txt     # Python dependencies
├── claude-mcp-server.py     # MCP Server for Claude Desktop integration
├── components/
│   └── Sidebar.tsx          # Main app sidebar
├── start.sh                 # One-click startup script
├── package.json             # Node.js dependencies
└── README.md                # This file
```

---

## Troubleshooting

### "Python backend not running on port 8085"
```bash
# Start the backend manually
cd aws-mcp-server
python3 server.py
```

### "npm install fails"
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### "pip3 install fails"
```bash
# Upgrade pip first
pip3 install --upgrade pip
pip3 install -r aws-mcp-server/requirements.txt
```

### "LocalStack connection refused"
```bash
# Check if LocalStack is running
docker ps | grep localstack

# Restart if needed
docker restart localstack-main

# Check logs
docker logs localstack-main
```

### "Port 3000 already in use"
```bash
# Kill existing process
lsof -ti:3000 | xargs kill -9

# Or use a different port
npm run dev -- -p 3001
```

### "Dashboard shows no data"
1. Check if backend is running: `curl http://localhost:8085/refresh`
2. Check browser console for errors
3. Verify credentials are correct
4. Try clicking "Disconnect" and reconnect

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
```

---

## Ports

| Service | Port | Description |
|---------|------|-------------|
| Next.js Frontend | 3000 | Main UI |
| Python Backend | 8085 | AWS API proxy |
| LocalStack | 4566 | Local AWS emulator |
| Dev MCP | 8082 | Dev environment |
| Staging MCP | 8081 | Staging environment |
| Prod MCP | 8083 | Production environment |

---

## Claude Desktop MCP Integration

Connect this DevOps platform to Claude Desktop as an MCP (Model Context Protocol) server. This lets Claude query your AWS infrastructure directly using natural language.

### Architecture
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude Desktop  │────▶│  MCP Server       │────▶│  Python Backend  │
│  (AI Assistant)  │     │  (claude-mcp-     │     │  (server:8085)   │
│                  │     │   server.py)      │     │                  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                         │
                               ▼                         ▼
                        ┌──────────────┐         ┌──────────────┐
                        │  LocalStack   │         │  Real AWS    │
                        │  (port 4566)  │         │  Account     │
                        └──────────────┘         └──────────────┘
```

### How It Works
1. **Dashboard Login** → Credentials stored in Python backend (memory)
2. **MCP Server** → Auto-syncs credentials from backend via `/sync-credentials`
3. **Claude Desktop** → Calls MCP tools → MCP server queries AWS via boto3
4. **Dashboard Disconnect** → Backend clears credentials → MCP detects disconnection → Claude tools return "Not connected" message

### Step 1: Install Python Dependencies
```bash
pip3 install fastmcp boto3 botocore
```

### Step 2: Configure Claude Desktop

Edit `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aws-devops-tools": {
      "command": "python3",
      "args": [
        "/path/to/MCP_Devops_pro/claude-mcp-server.py"
      ],
      "env": {
        "AWS_ACCESS_KEY_ID": "test",
        "AWS_SECRET_ACCESS_KEY": "test",
        "AWS_DEFAULT_REGION": "us-east-1"
      }
    }
  }
}
```

### Step 3: Restart Claude Desktop
Close and reopen Claude Desktop to load the MCP server.

### Step 4: Login to Dashboard
1. Open `http://localhost:3000/aws-dashboard`
2. Toggle LocalStack ON (for testing) or OFF (for real AWS)
3. Click **Connect**
4. Credentials auto-sync to MCP server

### Step 5: Use in Claude Desktop
Ask Claude questions like:
- "List all EC2 instances"
- "Show me S3 buckets"
- "What Lambda functions are deployed?"
- "Run a security audit"
- "Show VPC and security groups"

### Available MCP Tools (25+)

| Tool | Description |
|------|-------------|
| `list_ec2_instances` | List all EC2 instances with status, type, IP |
| `get_ec2_instance_status` | Get detailed instance status + CPU metrics |
| `stop_ec2_instance` | Stop a running EC2 instance |
| `start_ec2_instance` | Start a stopped EC2 instance |
| `list_s3_buckets` | List all S3 buckets with object counts |
| `list_s3_objects` | List objects in a specific bucket |
| `list_lambda_functions` | List all Lambda functions |
| `invoke_lambda_function` | Invoke a Lambda function |
| `list_dynamodb_tables` | List DynamoDB tables with status |
| `query_dynamodb_table` | Scan a DynamoDB table |
| `list_sqs_queues` | List SQS queues with message counts |
| `list_iam_users` | List IAM users with MFA status |
| `list_vpcs` | List VPCs with subnets and CIDR blocks |
| `list_security_groups` | List security groups with rules |
| `list_secrets` | List Secrets Manager secrets |
| `list_sns_topics` | List SNS topics |
| `list_rds_instances` | List RDS databases |
| `list_ecs_clusters` | List ECS clusters |
| `list_cloudwatch_alarms` | List CloudWatch alarms |
| `get_cost_overview` | Get AWS cost overview |
| `security_audit` | Run security audit across services |
| `sync_dashboard_credentials` | Re-sync credentials from dashboard |
| `get_connection_status` | Check current connection status |
| `configure_localstack` | Switch to LocalStack mode |
| `configure_aws` | Switch to real AWS mode |

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

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS, Recharts
- **Backend**: Python 3.10+, FastAPI, boto3, FastMCP
- **MCP Server**: FastMCP, boto3 (Claude Desktop integration)
- **Infrastructure**: Docker, LocalStack (optional)

---

## License

MIT

---

## Quick Reference Card (Print This!)

### Start the project:
```bash
cd Devops-AI-Agents
bash start.sh
```

### Open in browser:
```
http://localhost:3000
```

### Stop the project:
Press `Ctrl+C` in the terminal

### If something breaks:
```bash
# Kill all Node processes
pkill -f "next dev"

# Kill Python backend
pkill -f "server.py"

# Restart
bash start.sh
```

### LocalStack test credentials:
- Access Key: `test`
- Secret Key: `test`
- Region: `us-east-1`
- Toggle: ON

### AWS credentials:
- Access Key: `AKIA...` (your real key)
- Secret Key: `...` (your real secret)
- Region: `ap-south-1` (or your region)
- Toggle: OFF

---

## Environment Variables

Copy `.env.example` to `.env.local` and update the paths:
```bash
cp .env.example .env.local
```

Update these lines with your paths:
```
MCP_DEV_WORKSPACE=/home/YOUR_USERNAME/workspaces/dev
MCP_STAGING_WORKSPACE=/home/YOUR_USERNAME/workspaces/staging
MCP_PROD_WORKSPACE=/home/YOUR_USERNAME/workspaces/prod
```

---

## Support

If you face any issues:
1. Check the Troubleshooting section above
2. Check if all services are running
3. Check browser console for errors
4. Check terminal for Python/Node errors
