#!/usr/bin/env bash
set -e

# ============================================================
#  AWS Enterprise Demo - LocalStack Full Setup
#  Creates realistic AWS environment for testing
#  Usage: bash setup-enterprise-demo.sh
# ============================================================

ENDPOINT="http://localhost:4566"
AWS="aws --endpoint-url=${ENDPOINT} --region us-east-1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAMBDA_DIR="${SCRIPT_DIR}/lambda"
DATA_DIR="${SCRIPT_DIR}/data"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[SKIP]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "=============================================="
echo "  AWS Enterprise Demo - LocalStack Setup"
echo "=============================================="
echo ""

# ---------- Pre-flight checks ----------
info "Checking LocalStack connection..."
if ! curl -s "${ENDPOINT}/_localstack/health" > /dev/null 2>&1; then
  err "LocalStack is not running on ${ENDPOINT}"
  err "Start it with: docker run -d --name localstack-main -p 4566:4566 localstack/localstack"
  exit 1
fi
log "LocalStack is running"

# ---------- S3 Buckets ----------
info "Creating S3 buckets..."
for b in prod-backup dev-backup logs-bucket images-bucket hr-data finance-data app-uploads monitoring-data; do
  $AWS s3 mb "s3://${b}" >/dev/null 2>&1 && log "s3://${b}" || warn "s3://${b} (exists)"
done

# Upload sample objects to make buckets look real
echo '{"version":"1.0","env":"prod"}' | $AWS s3 cp - s3://prod-backup/config.json >/dev/null 2>&1
echo '{"version":"1.0","env":"dev"}'   | $AWS s3 cp - s3://dev-backup/config.json >/dev/null 2>&1
echo "app logs data"                    | $AWS s3 cp - s3://logs-bucket/app.log >/dev/null 2>&1
echo "monitoring data"                  | $AWS s3 cp - s3://monitoring-data/metrics.json >/dev/null 2>&1
echo "hr records"                       | $AWS s3 cp - s3://hr-data/employees.csv >/dev/null 2>&1
echo "finance data"                     | $AWS s3 cp - s3://finance-data/q4-report.pdf >/dev/null 2>&1
log "S3 sample objects uploaded"

# ---------- IAM Users ----------
info "Creating IAM users..."
for u in admin developer devops security tester intern-rahul; do
  $AWS iam create-user --user-name "$u" >/dev/null 2>&1 && log "user: $u" || warn "user: $u (exists)"
done

# ---------- IAM Groups ----------
info "Creating IAM groups..."
for g in DevOps Engineering Security Admin; do
  $AWS iam create-group --group-name "$g" >/dev/null 2>&1 && log "group: $g" || warn "group: $g (exists)"
done

# Add users to groups
$AWS iam add-user-to-group --group-name DevOps --user-name developer >/dev/null 2>&1 || true
$AWS iam add-user-to-group --group-name DevOps --user-name devops >/dev/null 2>&1 || true
$AWS iam add-user-to-group --group-name Engineering --user-name developer >/dev/null 2>&1 || true
$AWS iam add-user-to-group --group-name Engineering --user-name tester >/dev/null 2>&1 || true
$AWS iam add-user-to-group --group-name Security --user-name security >/dev/null 2>&1 || true
$AWS iam add-user-to-group --group-name Admin --user-name admin >/dev/null 2>&1 || true
log "IAM group assignments done"

# ---------- IAM Roles ----------
info "Creating IAM roles..."
for role_name in lambda-role ec2-role ecs-task-role codepipeline-role; do
  $AWS iam create-role \
    --role-name "$role_name" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    >/dev/null 2>&1 && log "role: $role_name" || warn "role: $role_name (exists)"
done

# ---------- IAM Policies ----------
info "Creating IAM policies..."
$AWS iam create-policy \
  --policy-name FullAccess \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"*","Resource":"*"}]}' \
  >/dev/null 2>&1 && log "policy: FullAccess" || warn "policy: FullAccess (exists)"

$AWS iam create-policy \
  --policy-name ReadOnlyAccess \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:Get*","s3:List*","ec2:Describe*"],"Resource":"*"}]}' \
  >/dev/null 2>&1 && log "policy: ReadOnlyAccess" || warn "policy: ReadOnlyAccess (exists)"

# ---------- DynamoDB Tables ----------
info "Creating DynamoDB tables..."

# Employees table
$AWS dynamodb create-table \
  --table-name Employees \
  --attribute-definitions \
    AttributeName=EmpID,AttributeType=S \
    AttributeName=Dept,AttributeType=S \
  --key-schema \
    AttributeName=EmpID,KeyType=HASH \
  --global-secondary-indexes '[{"IndexName":"DeptIndex","KeySchema":[{"AttributeName":"Dept","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST \
  >/dev/null 2>&1 && log "table: Employees" || warn "table: Employees (exists)"

# Insert employee data
for item in \
  '{"EmpID":{"S":"1001"},"Name":{"S":"Rahul Sharma"},"Dept":{"S":"Engineering"},"Role":{"S":"Senior Dev"},"Salary":{"N":"85000"}}' \
  '{"EmpID":{"S":"1002"},"Name":{"S":"Priya Patel"},"Dept":{"S":"DevOps"},"Role":{"S":"Lead"},"Salary":{"N":"92000"}}' \
  '{"EmpID":{"S":"1003"},"Name":{"S":"Amit Kumar"},"Dept":{"S":"Security"},"Role":{"S":"Analyst"},"Salary":{"N":"78000"}}' \
  '{"EmpID":{"S":"1004"},"Name":{"S":"Sneha Reddy"},"Dept":{"S":"Engineering"},"Role":{"S":"Junior Dev"},"Salary":{"N":"65000"}}' \
  '{"EmpID":{"S":"1005"},"Name":{"S":"Vikram Singh"},"Dept":{"S":"DevOps"},"Role":{"S":"Architect"},"Salary":{"N":"110000"}}'; do
  $AWS dynamodb put-item --table-name Employees --item "$item" >/dev/null 2>&1
done
log "Employees data inserted (5 records)"

# Orders table
$AWS dynamodb create-table \
  --table-name Orders \
  --attribute-definitions \
    AttributeName=OrderID,AttributeType=S \
    AttributeName=CustomerID,AttributeType=S \
  --key-schema \
    AttributeName=OrderID,KeyType=HASH \
  --global-secondary-indexes '[{"IndexName":"CustomerIndex","KeySchema":[{"AttributeName":"CustomerID","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST \
  >/dev/null 2>&1 && log "table: Orders" || warn "table: Orders (exists)"

# Insert order data
for item in \
  '{"OrderID":{"S":"ORD-001"},"CustomerID":{"S":"C100"},"Product":{"S":"Laptop"},"Amount":{"N":"1200"},"Status":{"S":"shipped"}}' \
  '{"OrderID":{"S":"ORD-002"},"CustomerID":{"S":"C101"},"Product":{"S":"Monitor"},"Amount":{"N":"450"},"Status":{"S":"delivered"}}' \
  '{"OrderID":{"S":"ORD-003"},"CustomerID":{"S":"C100"},"Product":{"S":"Keyboard"},"Amount":{"N":"75"},"Status":{"S":"pending"}}'; do
  $AWS dynamodb put-item --table-name Orders --item "$item" >/dev/null 2>&1
done
log "Orders data inserted (3 records)"

# Products table
$AWS dynamodb create-table \
  --table-name Products \
  --attribute-definitions \
    AttributeName=ProductID,AttributeType=S \
  --key-schema \
    AttributeName=ProductID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  >/dev/null 2>&1 && log "table: Products" || warn "table: Products (exists)"

for item in \
  '{"ProductID":{"S":"P001"},"Name":{"S":"MacBook Pro"},"Price":{"N":"2400"},"Stock":{"N":"15"}}' \
  '{"ProductID":{"S":"P002"},"Name":{"S":"Dell Monitor"},"Price":{"N":"350"},"Stock":{"N":"42"}}' \
  '{"ProductID":{"S":"P003"},"Name":{"S":"Mechanical Keyboard"},"Price":{"N":"85"},"Stock":{"N":"120"}}' \
  '{"ProductID":{"S":"P004"},"Name":{"S":"Wireless Mouse"},"Price":{"N":"45"},"Stock":{"N":"200"}}'; do
  $AWS dynamodb put-item --table-name Products --item "$item" >/dev/null 2>&1
done
log "Products data inserted (4 records)"

# ---------- SQS Queues ----------
info "Creating SQS queues..."
for q in orders notifications logs billing dead-letter-queue; do
  $AWS sqs create-queue --queue-name "$q" >/dev/null 2>&1 && log "queue: $q" || warn "queue: $q (exists)"
done

# Send some messages to make queues look active
$AWS sqs send-message --queue-url "${ENDPOINT}/000000000000/orders" \
  --message-body '{"orderId":"ORD-001","customer":"C100","action":"new"}' >/dev/null 2>&1
$AWS sqs send-message --queue-url "${ENDPOINT}/000000000000/orders" \
  --message-body '{"orderId":"ORD-002","customer":"C101","action":"new"}' >/dev/null 2>&1
$AWS sqs send-message --queue-url "${ENDPOINT}/000000000000/notifications" \
  --message-body '{"type":"alert","message":"CPU high on prod-01"}' >/dev/null 2>&1
$AWS sqs send-message --queue-url "${ENDPOINT}/000000000000/billing" \
  --message-body '{"invoiceId":"INV-100","amount":"2500"}' >/dev/null 2>&1
log "SQS sample messages sent"

# ---------- SNS Topics ----------
info "Creating SNS topics..."
for t in alerts monitoring billing system-events; do
  $AWS sns create-topic --name "$t" >/dev/null 2>&1 && log "topic: $t" || warn "topic: $t (exists)"
done

# Subscribe SQS to SNS
$AWS sns subscribe \
  --topic-arn "arn:aws:sns:us-east-1:000000000000:alerts" \
  --protocol sqs \
  --notification-endpoint "${ENDPOINT}/000000000000:notifications" \
  >/dev/null 2>&1 || true
log "SNS subscriptions configured"

# ---------- Secrets Manager ----------
info "Creating secrets..."
$AWS secretsmanager create-secret \
  --name prod/db-password \
  --secret-string 'DbP@ssw0rd!2024' \
  --description "Production database password" \
  >/dev/null 2>&1 && log "secret: prod/db-password" || warn "secret: prod/db-password (exists)"

$AWS secretsmanager create-secret \
  --name prod/api-key \
  --secret-string 'sk-prod-abc123def456ghi789' \
  --description "Production API key" \
  >/dev/null 2>&1 && log "secret: prod/api-key" || warn "secret: prod/api-key (exists)"

$AWS secretsmanager create-secret \
  --name prod/jwt-secret \
  --secret-string 'jwt-super-secret-key-2024' \
  --description "JWT signing key" \
  >/dev/null 2>&1 && log "secret: prod/jwt-secret" || warn "secret: prod/jwt-secret (exists)"

$AWS secretsmanager create-secret \
  --name dev/stripe-key \
  --secret-string 'PLACEHOLDER_STRIPE_TEST_KEY' \
  --description "Stripe test key" \
  >/dev/null 2>&1 && log "secret: dev/stripe-key" || warn "secret: dev/stripe-key (exists)"

# ---------- SSM Parameter Store ----------
info "Creating SSM parameters..."
for param in \
  "/prod/db/host=10.0.0.10" \
  "/prod/db/port=5432" \
  "/prod/db/name=production" \
  "/prod/cache/endpoint=redis://10.0.0.20:6379" \
  "/dev/db/host=10.1.0.10" \
  "/dev/db/port=5432" \
  "/dev/db/name=development" \
  "/app/version=2.4.1" \
  "/app/environment=production"; do
  name="${param%%=*}"
  value="${param#*=}"
  $AWS ssm put-parameter --name "$name" --value "$value" --type String --overwrite >/dev/null 2>&1 && \
    log "param: $name" || warn "param: $name (exists)"
done

# ---------- Lambda Functions ----------
info "Creating Lambda functions..."

# 1. hello-world
info "  Building hello-world..."
mkdir -p /tmp/lambda-hello
cat > /tmp/lambda-hello/lambda_function.py <<'PYEOF'
import json

def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "message": "Hello from LocalStack Lambda!",
            "function": "hello-world",
            "version": "1.0.0"
        })
    }
PYEOF
(cd /tmp/lambda-hello && zip -q function.zip lambda_function.py)
$AWS lambda create-function \
  --function-name hello-world \
  --runtime python3.11 \
  --handler lambda_function.lambda_handler \
  --zip-file fileb:///tmp/lambda-hello/function.zip \
  --role "arn:aws:iam::000000000000:role/lambda-role" \
  --timeout 30 \
  --memory-size 128 \
  >/dev/null 2>&1 && log "  lambda: hello-world" || warn "  lambda: hello-world (exists)"

# 2. billing-processor
info "  Building billing-processor..."
mkdir -p /tmp/lambda-billing
cat > /tmp/lambda-billing/lambda_function.py <<'PYEOF'
import json
from datetime import datetime

def lambda_handler(event, context):
    for record in event.get("Records", []):
        body = json.loads(record.get("body", "{}"))
        print(f"Processing billing: {body}")

    return {
        "statusCode": 200,
        "body": json.dumps({
            "processed": len(event.get("Records", [])),
            "timestamp": datetime.utcnow().isoformat(),
            "function": "billing-processor"
        })
    }
PYEOF
(cd /tmp/lambda-billing && zip -q function.zip lambda_function.py)
$AWS lambda create-function \
  --function-name billing-processor \
  --runtime python3.11 \
  --handler lambda_function.lambda_handler \
  --zip-file fileb:///tmp/lambda-billing/function.zip \
  --role "arn:aws:iam::000000000000:role/lambda-role" \
  --timeout 60 \
  --memory-size 256 \
  >/dev/null 2>&1 && log "  lambda: billing-processor" || warn "  lambda: billing-processor (exists)"

# 3. monitoring-collector
info "  Building monitoring-collector..."
mkdir -p /tmp/lambda-monitoring
cat > /tmp/lambda-monitoring/lambda_function.py <<'PYEOF'
import json
from datetime import datetime

def lambda_handler(event, context):
    metrics = {
        "cpu_usage": 67.3,
        "memory_usage": 82.1,
        "disk_io": 1240,
        "network_in": 5200,
        "network_out": 3100,
        "timestamp": datetime.utcnow().isoformat()
    }
    return {
        "statusCode": 200,
        "body": json.dumps({"metrics": metrics, "function": "monitoring-collector"})
    }
PYEOF
(cd /tmp/lambda-monitoring && zip -q function.zip lambda_function.py)
$AWS lambda create-function \
  --function-name monitoring-collector \
  --runtime python3.11 \
  --handler lambda_function.lambda_handler \
  --zip-file fileb:///tmp/lambda-monitoring/function.zip \
  --role "arn:aws:iam::000000000000:role/lambda-role" \
  --timeout 30 \
  --memory-size 128 \
  >/dev/null 2>&1 && log "  lambda: monitoring-collector" || warn "  lambda: monitoring-collector (exists)"

# 4. notification-sender
info "  Building notification-sender..."
mkdir -p /tmp/lambda-notification
cat > /tmp/lambda-notification/lambda_function.py <<'PYEOF'
import json
from datetime import datetime

def lambda_handler(event, context):
    for record in event.get("Records", []):
        msg = json.loads(record.get("body", "{}"))
        channel = msg.get("channel", "email")
        to = msg.get("to", "user@example.com")
        subject = msg.get("subject", "Notification")
        print(f"[{channel}] Sending to {to}: {subject}")

    return {
        "statusCode": 200,
        "body": json.dumps({
            "sent": len(event.get("Records", [])),
            "function": "notification-sender",
            "timestamp": datetime.utcnow().isoformat()
        })
    }
PYEOF
(cd /tmp/lambda-notification && zip -q function.zip lambda_function.py)
$AWS lambda create-function \
  --function-name notification-sender \
  --runtime python3.11 \
  --handler lambda_function.lambda_handler \
  --zip-file fileb:///tmp/lambda-notification/function.zip \
  --role "arn:aws:iam::000000000000:role/lambda-role" \
  --timeout 30 \
  --memory-size 128 \
  >/dev/null 2>&1 && log "  lambda: notification-sender" || warn "  lambda: notification-sender (exists)"

# ---------- API Gateway ----------
info "Creating API Gateway..."
API_ID=$($AWS apigateway create-rest-api --name "EnterpriseAPI" --description "Demo enterprise API" --query 'id' --output text 2>/dev/null || echo "")
if [ -n "$API_ID" ] && [ "$API_ID" != "None" ]; then
  log "api-gateway: EnterpriseAPI (id: $API_ID)"

  # Get root resource ID
  ROOT_ID=$($AWS apigateway get-resources --rest-api-id "$API_ID" --query 'items[0].id' --output text 2>/dev/null || echo "")

  if [ -n "$ROOT_ID" ] && [ "$ROOT_ID" != "None" ]; then
    # Create /health resource
    HEALTH_ID=$($AWS apigateway create-resource --rest-api-id "$API_ID" --parent-id "$ROOT_ID" --path-part "health" --query 'id' --output text 2>/dev/null || echo "")
    if [ -n "$HEALTH_ID" ] && [ "$HEALTH_ID" != "None" ]; then
      $AWS apigateway put-method --rest-api-id "$API_ID" --resource-id "$HEALTH_ID" --http-method GET --authorization-type NONE >/dev/null 2>&1 || true
      log "  resource: /health"
    fi

    # Create /orders resource
    ORDERS_ID=$($AWS apigateway create-resource --rest-api-id "$API_ID" --parent-id "$ROOT_ID" --path-part "orders" --query 'id' --output text 2>/dev/null || echo "")
    if [ -n "$ORDERS_ID" ] && [ "$ORDERS_ID" != "None" ]; then
      $AWS apigateway put-method --rest-api-id "$API_ID" --resource-id "$ORDERS_ID" --http-method GET --authorization-type NONE >/dev/null 2>&1 || true
      $AWS apigateway put-method --rest-api-id "$API_ID" --resource-id "$ORDERS_ID" --http-method POST --authorization-type NONE >/dev/null 2>&1 || true
      log "  resource: /orders"
    fi

    # Create /users resource
    USERS_ID=$($AWS apigateway create-resource --rest-api-id "$API_ID" --parent-id "$ROOT_ID" --path-part "users" --query 'id' --output text 2>/dev/null || echo "")
    if [ -n "$USERS_ID" ] && [ "$USERS_ID" != "None" ]; then
      $AWS apigateway put-method --rest-api-id "$API_ID" --resource-id "$USERS_ID" --http-method GET --authorization-type NONE >/dev/null 2>&1 || true
      log "  resource: /users"
    fi
  fi
else
  warn "api-gateway: skipped"
fi

# ---------- EC2 (Instances) ----------
info "Creating EC2 instances..."
for i in 1 2 3; do
  NAME="demo-server-0${i}"
  $AWS ec2 run-instances \
    --image-id ami-0c55b159cbfafe1f0 \
    --instance-type t2.micro \
    --count 1 \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${NAME}},{Key=Environment,Value=production},{Key=Team,Value=devops}]" \
    >/dev/null 2>&1 && log "  ec2: ${NAME}" || warn "  ec2: ${NAME} (exists)"
done

# ---------- EC2 Security Groups ----------
info "Creating security groups..."
$AWS ec2 create-security-group \
  --group-name web-sg \
  --description "Web server security group" \
  >/dev/null 2>&1 && log "  sg: web-sg" || warn "  sg: web-sg (exists)"

$AWS ec2 authorize-security-group-ingress \
  --group-name web-sg \
  --protocol tcp --port 80 --cidr 0.0.0.0/0 \
  >/dev/null 2>&1 || true

$AWS ec2 authorize-security-group-ingress \
  --group-name web-sg \
  --protocol tcp --port 443 --cidr 0.0.0.0/0 \
  >/dev/null 2>&1 || true

$AWS ec2 create-security-group \
  --group-name db-sg \
  --description "Database security group" \
  >/dev/null 2>&1 && log "  sg: db-sg" || warn "  sg: db-sg (exists)"

$AWS ec2 authorize-security-group-ingress \
  --group-name db-sg \
  --protocol tcp --port 5432 --cidr 10.0.0.0/16 \
  >/dev/null 2>&1 || true

# ---------- VPC ----------
info "Creating VPC..."
VPC_ID=$($AWS ec2 create-vpc --cidr-block 10.0.0.0/16 --query 'Vpc.VpcId' --output text 2>/dev/null || echo "")
if [ -n "$VPC_ID" ] && [ "$VPC_ID" != "None" ]; then
  log "  vpc: $VPC_ID"
  $AWS ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block 10.0.1.0/24 --availability-zone us-east-1a >/dev/null 2>&1 || true
  $AWS ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block 10.0.2.0/24 --availability-zone us-east-1b >/dev/null 2>&1 || true
  log "  subnets created"
else
  warn "  vpc: skipped"
fi

# ---------- RDS ----------
info "Creating RDS instances..."
$AWS rds create-db-instance \
  --db-instance-identifier prod-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username admin \
  --master-user-password 'Admin123!' \
  --allocated-storage 20 \
  --no-publicly-accessible \
  >/dev/null 2>&1 && log "  rds: prod-db" || warn "  rds: prod-db (exists)"

# ---------- ElastiCache (Redis) ----------
info "Creating ElastiCache clusters..."
$AWS elasticache create-cache-cluster \
  --cache-cluster-id prod-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1 \
  >/dev/null 2>&1 && log "  elasticache: prod-redis" || warn "  elasticache: prod-redis (exists)"

# ---------- SNS Subscriptions ----------
info "Creating SNS subscriptions..."
ALERTS_ARN="arn:aws:sns:us-east-1:000000000000:alerts"
$AWS sns subscribe --topic-arn "$ALERTS_ARN" --protocol email --notification-endpoint "admin@company.com" >/dev/null 2>&1 || true
$AWS sns subscribe --topic-arn "$ALERTS_ARN" --protocol sms --notification-endpoint "+1234567890" >/dev/null 2>&1 || true
log "SNS subscriptions done"

# ---------- CloudWatch (basic alarms) ----------
info "Creating CloudWatch alarms..."
$AWS cloudwatch put-metric-alarm \
  --alarm-name "HighCPU-EC2" \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  >/dev/null 2>&1 && log "  alarm: HighCPU-EC2" || warn "  alarm: HighCPU-EC2 (exists)"

$AWS cloudwatch put-metric-alarm \
  --alarm-name "HighMemory-RDS" \
  --metric-name FreeableMemory \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 500000000 \
  --comparison-operator LessThanThreshold \
  --evaluation-periods 2 \
  >/dev/null 2>&1 && log "  alarm: HighMemory-RDS" || warn "  alarm: HighMemory-RDS (exists)"

# ---------- Cleanup temp ----------
rm -rf /tmp/lambda-hello /tmp/lambda-billing /tmp/lambda-monitoring /tmp/lambda-notification

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo "=============================================="
echo "  SETUP COMPLETE - Resources Created"
echo "=============================================="
echo ""
echo -e "${CYAN}S3 Buckets:${NC}"
$AWS s3 ls 2>/dev/null | awk '{print "  " $3}' || true
echo ""
echo -e "${CYAN}IAM Users:${NC}"
$AWS iam list-users --query 'Users[].UserName' --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/  /' || true
echo ""
echo -e "${CYAN}IAM Groups:${NC}"
$AWS iam list-groups --query 'Groups[].GroupName' --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/  /' || true
echo ""
echo -e "${CYAN}DynamoDB Tables:${NC}"
$AWS dynamodb list-tables --query 'TableNames[]' --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/  /' || true
echo ""
echo -e "${CYAN}SQS Queues:${NC}"
$AWS sqs list-queues --query 'QueueUrls[]' --output text 2>/dev/null | awk -F/ '{print "  "$NF}' || true
echo ""
echo -e "${CYAN}SNS Topics:${NC}"
$AWS sns list-topics --query 'Topics[].TopicArn' --output text 2>/dev/null | awk -F: '{print "  "$NF}' || true
echo ""
echo -e "${CYAN}Lambda Functions:${NC}"
$AWS lambda list-functions --query 'Functions[].FunctionName' --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/  /' || true
echo ""
echo -e "${CYAN}Secrets:${NC}"
$AWS secretsmanager list-secrets --query 'SecretList[].Name' --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/  /' || true
echo ""
echo -e "${CYAN}SSM Parameters:${NC}"
$AWS ssm describe-parameters --query 'Parameters[].Name' --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/  /' || true
echo ""
echo -e "${CYAN}EC2 Instances:${NC}"
$AWS ec2 describe-instances --query 'Reservations[].Instances[].[Tags[?Key==`Name`].Value|[0],State.Name,InstanceType]' --output text 2>/dev/null | awk '{printf "  %-20s %-12s %s\n", $1, $2, $3}' || true
echo ""
echo -e "${CYAN}Security Groups:${NC}"
$AWS ec2 describe-security-groups --query 'SecurityGroups[].[GroupName,GroupId]' --output text 2>/dev/null | awk '{printf "  %-20s %s\n", $1, $2}' || true
echo ""
echo -e "${CYAN}RDS Instances:${NC}"
$AWS rds describe-db-instances --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceStatus,Engine]' --output text 2>/dev/null | awk '{printf "  %-15s %-12s %s\n", $1, $2, $3}' || true
echo ""
echo -e "${CYAN}API Gateway:${NC}"
$AWS apigateway get-rest-apis --query 'items[].[name,id]' --output text 2>/dev/null | awk '{printf "  %-20s %s\n", $1, $2}' || true
echo ""
echo -e "${CYAN}CloudWatch Alarms:${NC}"
$AWS cloudwatch describe-alarms --query 'MetricAlarms[].AlarmName' --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/  /' || true
echo ""
echo "=============================================="
echo -e "${GREEN}All resources created successfully!${NC}"
echo "Open your DevOps AI Dashboard and connect to LocalStack."
echo "=============================================="
