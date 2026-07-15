# AWS Enterprise Demo - LocalStack

Full AWS enterprise environment setup for LocalStack testing. Creates realistic resources so your DevOps AI Dashboard looks like a real production account.

---

## Prerequisites

| Tool | Version | Install Command |
|------|---------|-----------------|
| **Docker** | Latest | `sudo apt install docker.io` |
| **AWS CLI** | Latest | `sudo apt install awscli` |
| **Python** | 3.10+ | `sudo apt install python3` |
| **pip3** | Latest | `sudo apt install python3-pip` |
| **Node.js** | 18+ | `sudo apt install nodejs` |
| **npm** | 9+ | Comes with Node.js |

### Verify versions:
```bash
docker --version
aws --version
python3 --version
node --version
```

---

## Step 1: Install Docker (if not installed)

```bash
sudo apt update
sudo apt install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
# Log out and log back in, or run:
newgrp docker
```

### Verify Docker:
```bash
docker --version
docker run hello-world
```

---

## Step 2: Start LocalStack

### Option A: Using Docker (Recommended)
```bash
# Pull and start LocalStack
docker run -d \
  --name localstack-main \
  -p 4566:4566 \
  -p 4510-4559:4510-4559 \
  localstack/localstack

# Check if running
docker ps | grep localstack
```

### Option B: Using LocalStack CLI
```bash
# Install LocalStack CLI
pip3 install localstack

# Start LocalStack
localstack start -d

# Check status
localstack status
```

### Verify LocalStack:
```bash
curl http://localhost:4566/_localstack/health
```

Expected output:
```json
{"services": {"s3": "ready", "dynamodb": "ready", ...}, "version": "..."}
```

---

## Step 3: Install AWS CLI (if not installed)

```bash
sudo apt install -y awscli

# Verify
aws --version
```

---

## Step 4: Configure AWS CLI for LocalStack

```bash
# Set dummy credentials (LocalStack doesn't validate real keys)
aws configure <<EOF
test
test
us-east-1
json
EOF

# Or set environment variables
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
```

---

## Step 5: Run the Enterprise Demo Setup

```bash
cd localstack_test

# Make scripts executable
chmod +x setup-enterprise-demo.sh cleanup-demo.sh

# Run the setup
bash setup-enterprise-demo.sh
```

This creates 30+ AWS resources:
- 8 S3 buckets with sample objects
- 6 IAM users, 4 groups, 4 roles
- 3 DynamoDB tables with data
- 4 SQS queues with messages
- 4 SNS topics
- 4 Lambda functions
- API Gateway with resources
- 3 EC2 instances
- VPC with subnets
- RDS PostgreSQL instance
- ElastiCache Redis
- Secrets Manager secrets
- SSM parameters
- CloudWatch alarms

---

## Step 6: Connect DevOps AI Dashboard

1. Start the dashboard:
```bash
cd /home/bsetec/Downloads/MCP_Project/MCP_Devops_pro
bash start.sh
```

2. Open `http://localhost:3000`
3. Toggle **"Use LocalStack"** to ON
4. Access Key: `test`, Secret Key: `test`
5. Region: `us-east-1`
6. Click **"Connect to LocalStack"**

---

## Troubleshooting

### Issue: LocalStack won't start / Docker errors

```bash
# Restart Docker
sudo systemctl restart docker
sudo systemctl restart containerd

# Remove old LocalStack container
docker rm -f localstack-main 2>/dev/null

# Start fresh
docker run -d --name localstack-main -p 4566:4566 localstack/localstack

# Or use LocalStack CLI
localstack start -d
```

### Issue: Port 4566 already in use

```bash
# Find and kill process on port 4566
sudo lsof -ti:4566 | xargs kill -9

# Or stop LocalStack
docker stop localstack-main
```

### Issue: AWS CLI not connecting to LocalStack

```bash
# Test connection
curl http://localhost:4566/_localstack/health

# Test S3
aws --endpoint-url=http://localhost:4566 s3 ls

# If fails, check LocalStack is running
docker ps | grep localstack
```

### Issue: "Connection refused" errors

```bash
# Make sure LocalStack is healthy
curl -s http://localhost:4566/_localstack/health | python3 -m json.tool

# Check logs
docker logs localstack-main --tail 50

# Restart if needed
docker restart localstack-main
```

### Issue: Docker permission denied

```bash
sudo usermod -aG docker $USER
newgrp docker
# Or use sudo with docker commands
```

### Issue: aws-cli version conflicts

```bash
# If using snap-installed aws cli:
sudo snap remove aws-cli
sudo apt install awscli

# Or install latest via pip:
pip3 install --upgrade awscli
```

---

## Cleanup

```bash
# Remove all demo resources
bash cleanup-demo.sh

# Stop LocalStack
docker stop localstack-main

# Remove LocalStack container
docker rm -f localstack-main

# Remove LocalStack data (full reset)
docker volume rm $(docker volume ls -q | grep localstack) 2>/dev/null
```

---

## Re-run Setup

```bash
# Cleanup first
bash cleanup-demo.sh

# Re-setup
bash setup-enterprise-demo.sh
```

---

## File Structure

```
localstack_test/
├── setup-enterprise-demo.sh    # Main setup (run this)
├── cleanup-demo.sh             # Remove all resources
├── localstack_issue.sh         # Docker/LocalStack restart commands
├── lambda/
│   ├── hello-world/            # Simple hello function
│   ├── billing/                # SQS billing processor
│   ├── monitoring/             # Metrics collector
│   └── notification/           # Alert sender
├── data/
│   ├── employees.json          # Employee data reference
│   ├── secrets.json            # Secrets metadata
│   └── users.json              # IAM users reference
└── README.md                   # This file
```

---

## Quick Reference

```bash
# Start everything
docker run -d --name localstack-main -p 4566:4566 localstack/localstack
bash setup-enterprise-demo.sh

# Test connection
aws --endpoint-url=http://localhost:4566 s3 ls

# Stop everything
bash cleanup-demo.sh
docker stop localstack-main
```
