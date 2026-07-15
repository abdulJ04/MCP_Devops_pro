#!/usr/bin/env bash
set -e

# ============================================================
#  AWS Enterprise Demo - LocalStack Cleanup
#  Removes all demo resources
#  Usage: bash cleanup-demo.sh
# ============================================================

ENDPOINT="http://localhost:4566"
AWS="aws --endpoint-url=${ENDPOINT} --region us-east-1"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[SKIP]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }

echo ""
echo "=============================================="
echo "  AWS Enterprise Demo - Cleanup"
echo "=============================================="
echo ""

# ---------- API Gateway ----------
info "Deleting API Gateway..."
for api_id in $($AWS apigateway get-rest-apis --query 'items[].id' --output text 2>/dev/null); do
  $AWS apigateway delete-rest-api --rest-api-id "$api_id" >/dev/null 2>&1 && log "  deleted api: $api_id" || true
done

# ---------- EC2 Instances ----------
info "Terminating EC2 instances..."
INSTANCE_IDS=$($AWS ec2 describe-instances --query 'Reservations[].Instances[?State.Name!=`terminated`].InstanceId' --output text 2>/dev/null || echo "")
if [ -n "$INSTANCE_IDS" ]; then
  $AWS ec2 terminate-instances --instance-ids $INSTANCE_IDS >/dev/null 2>&1 && log "  instances terminated" || true
else
  warn "  no instances found"
fi

# ---------- EC2 Security Groups (non-default) ----------
info "Deleting security groups..."
for sg_id in $($AWS ec2 describe-security-groups --query 'SecurityGroups[?GroupName!=`default`].GroupId' --output text 2>/dev/null); do
  $AWS ec2 delete-security-group --group-id "$sg_id" >/dev/null 2>&1 && log "  sg: $sg_id" || true
done

# ---------- VPCs (non-default) ----------
info "Deleting VPCs..."
for vpc_id in $($AWS ec2 describe-vpcs --query 'Vpcs[?IsDefault==`false`].VpcId' --output text 2>/dev/null); do
  # Delete subnets first
  for sub_id in $($AWS ec2 describe-subnets --filters "Name=vpc-id,Values=$vpc_id" --query 'Subnets[].SubnetId' --output text 2>/dev/null); do
    $AWS ec2 delete-subnet --subnet-id "$sub_id" >/dev/null 2>&1 || true
  done
  $AWS ec2 delete-vpc --vpc-id "$vpc_id" >/dev/null 2>&1 && log "  vpc: $vpc_id" || true
done

# ---------- RDS ----------
info "Deleting RDS instances..."
for db_id in $($AWS rds describe-db-instances --query 'DBInstances[].DBInstanceIdentifier' --output text 2>/dev/null); do
  $AWS rds delete-db-instance --db-instance-identifier "$db_id" --skip-final-snapshot >/dev/null 2>&1 && log "  rds: $db_id" || true
done

# ---------- ElastiCache ----------
info "Deleting ElastiCache clusters..."
for cluster_id in $($AWS elasticache describe-cache-clusters --query 'CacheClusters[].CacheClusterId' --output text 2>/dev/null); do
  $AWS elasticache delete-cache-cluster --cache-cluster-id "$cluster_id" >/dev/null 2>&1 && log "  elasticache: $cluster_id" || true
done

# ---------- Lambda ----------
info "Deleting Lambda functions..."
for fn in $($AWS lambda list-functions --query 'Functions[].FunctionName' --output text 2>/dev/null); do
  $AWS lambda delete-function --function-name "$fn" >/dev/null 2>&1 && log "  lambda: $fn" || true
done

# ---------- DynamoDB ----------
info "Deleting DynamoDB tables..."
for table in $($AWS dynamodb list-tables --query 'TableNames[]' --output text 2>/dev/null); do
  $AWS dynamodb delete-table --table-name "$table" >/dev/null 2>&1 && log "  table: $table" || true
done

# ---------- SQS ----------
info "Deleting SQS queues..."
for queue_url in $($AWS sqs list-queues --query 'QueueUrls[]' --output text 2>/dev/null); do
  $AWS sqs delete-queue --queue-url "$queue_url" >/dev/null 2>&1 && log "  queue: $(basename $queue_url)" || true
done

# ---------- SNS ----------
info "Deleting SNS topics..."
for topic_arn in $($AWS sns list-topics --query 'Topics[].TopicArn' --output text 2>/dev/null); do
  $AWS sns delete-topic --topic-arn "$topic_arn" >/dev/null 2>&1 && log "  topic: $(echo $topic_arn | awk -F: '{print $NF}')" || true
done

# ---------- S3 ----------
info "Deleting S3 buckets..."
for bucket in $($AWS s3 ls --query 'Buckets[].Name' --output text 2>/dev/null); do
  $AWS s3 rm "s3://${bucket}" --recursive >/dev/null 2>&1 || true
  $AWS s3 rb "s3://${bucket}" >/dev/null 2>&1 && log "  bucket: $bucket" || true
done

# ---------- Secrets Manager ----------
info "Deleting secrets..."
for secret in $($AWS secretsmanager list-secrets --query 'SecretList[].Name' --output text 2>/dev/null); do
  $AWS secretsmanager delete-secret --secret-id "$secret" --force-delete-without-recovery >/dev/null 2>&1 && log "  secret: $secret" || true
done

# ---------- SSM ----------
info "Deleting SSM parameters..."
for param in $($AWS ssm describe-parameters --query 'Parameters[].Name' --output text 2>/dev/null); do
  $AWS ssm delete-parameter --name "$param" >/dev/null 2>&1 && log "  param: $param" || true
done

# ---------- IAM (last, since other resources depend on them) ----------
info "Removing IAM group memberships..."
for group in $($AWS iam list-groups --query 'Groups[].GroupName' --output text 2>/dev/null); do
  for user in $($AWS iam get-group --group-name "$group" --query 'Users[].UserName' --output text 2>/dev/null); do
    $AWS iam remove-user-from-group --group-name "$group" --user-name "$user" >/dev/null 2>&1 || true
  done
done

info "Deleting IAM policies..."
for policy_arn in $($AWS iam list-policies --scope Local --query 'Policies[].Arn' --output text 2>/dev/null); do
  $AWS iam delete-policy --policy-arn "$policy_arn" >/dev/null 2>&1 && log "  policy: $(basename $policy_arn)" || true
done

info "Deleting IAM groups..."
for group in $($AWS iam list-groups --query 'Groups[].GroupName' --output text 2>/dev/null); do
  $AWS iam delete-group --group-name "$group" >/dev/null 2>&1 && log "  group: $group" || true
done

info "Deleting IAM roles..."
for role in $($AWS iam list-roles --query 'Roles[].RoleName' --output text 2>/dev/null); do
  $AWS iam delete-role --role-name "$role" >/dev/null 2>&1 && log "  role: $role" || true
done

info "Deleting IAM users..."
for user in $($AWS iam list-users --query 'Users[].UserName' --output text 2>/dev/null); do
  # Delete access keys first
  for key_id in $($AWS iam list-access-keys --user-name "$user" --query 'AccessKeyMetadata[].AccessKeyId' --output text 2>/dev/null); do
    $AWS iam delete-access-key --user-name "$user" --access-key-id "$key_id" >/dev/null 2>&1 || true
  done
  $AWS iam delete-user --user-name "$user" >/dev/null 2>&1 && log "  user: $user" || true
done

# ---------- CloudWatch ----------
info "Deleting CloudWatch alarms..."
for alarm in $($AWS cloudwatch describe-alarms --query 'MetricAlarms[].AlarmName' --output text 2>/dev/null); do
  $AWS cloudwatch delete-alarms --alarm-names "$alarm" >/dev/null 2>&1 && log "  alarm: $alarm" || true
done

echo ""
echo "=============================================="
echo -e "${GREEN}CLEANUP COMPLETE${NC}"
echo "All demo resources have been removed."
echo "=============================================="
