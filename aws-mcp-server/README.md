# AWS MCP Server

FastMCP backend for AWS resource management and monitoring.

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the server:
```bash
python server.py
```

The server runs on `http://localhost:8085`.

## Docker

```bash
docker-compose up -d
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /auth` | Authenticate with AWS credentials |
| `GET /health` | Health check |
| `GET /inventory` | Auto-discover all AWS resources |
| `GET /ec2` | EC2 instances with metrics |
| `GET /s3` | S3 buckets with details |
| `GET /lambda` | Lambda functions with metrics |
| `GET /rds` | RDS instances with metrics |
| `GET /iam` | IAM users, roles, policies |
| `GET /vpc` | VPCs, subnets, security groups |
| `GET /cost` | Cost Explorer data |
| `GET /security` | Security findings |
| `GET /cloudwatch` | CloudWatch metrics |
| `GET /cloudtrail` | CloudTrail events |
| `GET /activity` | Activity timeline |

## Usage

1. Authenticate first:
```bash
curl -X POST http://localhost:8085/auth \
  -H "Content-Type: application/json" \
  -d '{"aws_access_key": "YOUR_KEY", "aws_secret_key": "YOUR_SECRET", "aws_region": "us-east-1"}'
```

2. Then query any endpoint:
```bash
curl http://localhost:8085/ec2
curl http://localhost:8085/s3
curl http://localhost:8085/inventory
```

## Caching

- Metrics cache: 30 seconds
- Inventory cache: 5 minutes
