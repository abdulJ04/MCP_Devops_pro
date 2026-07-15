#!/usr/bin/env python3
"""
AWS MCP Server for Claude Desktop
Exposes AWS services as MCP tools for Claude to query.
Uses boto3 to connect to LocalStack or real AWS.

Auto-syncs with the DevOps AI Dashboard backend.
If dashboard has real AWS keys → Claude uses real AWS.
If dashboard has LocalStack → Claude uses LocalStack.
"""

import os
import json
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from fastmcp import FastMCP

mcp = FastMCP("AWS DevOps Tools", version="1.0.0")

# ============================================================
#  AWS Session Management
# ============================================================

_session = None
_credentials = {}
BACKEND_URL = os.environ.get("MCP_BACKEND_URL", "http://127.0.0.1:8085")

# Auto-configure LocalStack on startup as default
_credentials = {
    "aws_access_key": "test",
    "aws_secret_key": "test",
    "aws_region": "us-east-1",
    "endpoint_url": "http://localhost:4566",
    "use_localstack": True,
}

def sync_from_dashboard():
    """Read credentials from the DevOps AI Dashboard backend."""
    global _credentials, _session
    try:
        url = f"{BACKEND_URL}/sync-credentials"
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            # If backend reports not connected, clear credentials
            if not data.get("connected", False):
                _credentials = {}
                _session = None
                return "Dashboard disconnected — please login to dashboard first"
            if data.get("aws_access_key") or data.get("use_localstack"):
                _credentials = {
                    "aws_access_key": data.get("aws_access_key", "test"),
                    "aws_secret_key": data.get("aws_secret_key", "test"),
                    "aws_region": data.get("aws_region", "us-east-1"),
                    "endpoint_url": data.get("endpoint_url", ""),
                    "use_localstack": data.get("use_localstack", True),
                    "aws_session_token": data.get("aws_session_token", ""),
                }
                _session = None  # Reset session to use new credentials
                mode = "LocalStack" if data.get("use_localstack") else "Real AWS"
                return f"Synced with dashboard: {mode} (region: {_credentials['aws_region']})"
    except Exception as e:
        pass
    return "Dashboard not available, using default LocalStack config"

def get_session():
    global _session
    if _session is None:
        kwargs = {
            "aws_access_key_id": _credentials.get("aws_access_key", "test"),
            "aws_secret_access_key": _credentials.get("aws_secret_key", "test"),
            "region_name": _credentials.get("aws_region", "us-east-1"),
        }
        if _credentials.get("aws_session_token"):
            kwargs["aws_session_token"] = _credentials["aws_session_token"]
        _session = boto3.Session(**kwargs)
    return _session

def get_client(service: str):
    kwargs = {"region_name": _credentials.get("aws_region", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))}
    if _credentials.get("endpoint_url"):
        kwargs["endpoint_url"] = _credentials["endpoint_url"]
    return get_session().client(service, **kwargs)

def set_credentials(access_key: str, secret_key: str, region: str = "us-east-1",
                    endpoint_url: str = None, session_token: str = None):
    global _session, _credentials
    _credentials = {
        "aws_access_key": access_key,
        "aws_secret_key": secret_key,
        "aws_region": region,
        "endpoint_url": endpoint_url,
        "aws_session_token": session_token,
    }
    _session = None
    return "Credentials updated successfully"

def _check_credentials() -> str | None:
    """Check if credentials are configured. Returns error message if not, None if OK."""
    if not _credentials.get("aws_access_key") and not _credentials.get("use_localstack"):
        return "❌ Not connected to AWS. Please login to the AWS Dashboard first, or run sync_dashboard_credentials()."
    return None

# ============================================================
#  Configuration Tools
# ============================================================

@mcp.tool()
def sync_dashboard_credentials() -> str:
    """Sync credentials from the DevOps AI Dashboard.
    If dashboard has real AWS keys → uses real AWS.
    If dashboard has LocalStack → uses LocalStack.
    Run this to pick up credentials entered in the dashboard login page."""
    return sync_from_dashboard()

@mcp.tool()
def configure_localstack(region: str = "us-east-1") -> str:
    """Configure connection to LocalStack (free local AWS emulator).
    Use this when you want to test with LocalStack instead of real AWS."""
    result = set_credentials("test", "test", region, "http://localhost:4566")
    _credentials["use_localstack"] = True
    return f"Connected to LocalStack (region: {region}). All AWS queries will use local data."

@mcp.tool()
def configure_aws(access_key: str, secret_key: str, region: str = "us-east-1",
                  session_token: str = None) -> str:
    """Configure connection to real AWS account.
    Use this when connecting to a production AWS environment."""
    result = set_credentials(access_key, secret_key, region, None, session_token)
    _credentials["use_localstack"] = False
    return f"Connected to real AWS (region: {region}). All AWS queries will use your live AWS account."

@mcp.tool()
def get_connection_status() -> str:
    """Check current AWS connection status - LocalStack or Real AWS."""
    sync_from_dashboard()
    mode = "LocalStack" if _credentials.get("use_localstack") else "Real AWS"
    region = _credentials.get("aws_region", "us-east-1")
    key = _credentials.get("aws_access_key", "")
    key_preview = f"{key[:8]}..." if len(key) > 8 else key
    return f"Mode: {mode} | Region: {region} | Key: {key_preview}"

# ============================================================
#  EC2 Tools
# ============================================================

@mcp.tool()
def list_ec2_instances() -> str:
    """List all EC2 instances with their status, type, IP addresses, and tags.
    Returns instance ID, name, state, instance type, private/public IP."""
    err = _check_credentials()
    if err: return err
    ec2 = get_client("ec2")
    try:
        resp = ec2.describe_instances()
        instances = []
        for reservation in resp["Reservations"]:
            for inst in reservation["Instances"]:
                name = next((t["Value"] for t in inst.get("Tags", []) if t["Key"] == "Name"), "unnamed")
                instances.append({
                    "id": inst["InstanceId"],
                    "name": name,
                    "state": inst["State"]["Name"],
                    "type": inst.get("InstanceType", ""),
                    "private_ip": inst.get("PrivateIpAddress", ""),
                    "public_ip": inst.get("PublicIpAddress", ""),
                    "az": inst.get("Placement", {}).get("AvailabilityZone", ""),
                })
        if not instances:
            return "No EC2 instances found"
        return json.dumps(instances, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

@mcp.tool()
def get_ec2_instance_status(instance_id: str) -> str:
    """Get detailed status of a specific EC2 instance including CPU, network, and disk metrics."""
    err = _check_credentials()
    if err: return err
    ec2 = get_client("ec2")
    cw = get_client("cloudwatch")
    try:
        resp = ec2.describe_instance_status(InstanceIds=[instance_id])
        if not resp["InstanceStatuses"]:
            return f"Instance {instance_id} not found or not running"
        inst = resp["InstanceStatuses"][0]
        result = {
            "instance_id": instance_id,
            "system_status": inst["SystemStatus"]["Status"],
            "instance_status": inst["InstanceStatus"]["Status"],
        }
        # Get CPU metric
        try:
            now = datetime.now(timezone.utc)
            cpu = cw.get_metric_statistics(
                Namespace="AWS/EC2", MetricName="CPUUtilization",
                Dimensions=[{"Name": "InstanceId", "Value": instance_id}],
                StartTime=now - timedelta(hours=1), EndTime=now,
                Period=300, Statistics=["Average"],
            )
            dp = cpu.get("Datapoints", [])
            result["cpu_avg"] = round(dp[-1]["Average"], 2) if dp else "N/A"
        except Exception:
            result["cpu_avg"] = "N/A"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

@mcp.tool()
def stop_ec2_instance(instance_id: str) -> str:
    """Stop a running EC2 instance."""
    err = _check_credentials()
    if err: return err
    ec2 = get_client("ec2")
    try:
        ec2.stop_instances(InstanceIds=[instance_id])
        return f"Instance {instance_id} is stopping"
    except ClientError as e:
        return f"Error: {str(e)}"

@mcp.tool()
def start_ec2_instance(instance_id: str) -> str:
    """Start a stopped EC2 instance."""
    err = _check_credentials()
    if err: return err
    ec2 = get_client("ec2")
    try:
        ec2.start_instances(InstanceIds=[instance_id])
        return f"Instance {instance_id} is starting"
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  S3 Tools
# ============================================================

@mcp.tool()
def list_s3_buckets() -> str:
    """List all S3 buckets with their names, creation dates, and object counts."""
    err = _check_credentials()
    if err: return err
    s3 = get_client("s3")
    try:
        buckets = s3.list_buckets().get("Buckets", [])
        result = []
        for b in buckets:
            name = b["Name"]
            try:
                objs = s3.list_objects_v2(Bucket=name)
                count = objs.get("KeyCount", 0)
            except Exception:
                count = 0
            result.append({
                "name": name,
                "created": b["CreationDate"].isoformat() if b.get("CreationDate") else "",
                "objects": count,
            })
        if not result:
            return "No S3 buckets found"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

@mcp.tool()
def list_s3_objects(bucket_name: str) -> str:
    """List all objects in an S3 bucket with their keys, sizes, and last modified dates."""
    err = _check_credentials()
    if err: return err
    s3 = get_client("s3")
    try:
        paginator = s3.get_paginator("list_objects_v2")
        objects = []
        for page in paginator.paginate(Bucket=bucket_name):
            for obj in page.get("Contents", []):
                objects.append({
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"].isoformat() if obj.get("LastModified") else "",
                })
        if not objects:
            return f"No objects in bucket {bucket_name}"
        return json.dumps(objects, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  Lambda Tools
# ============================================================

@mcp.tool()
def list_lambda_functions() -> str:
    """List all Lambda functions with their runtime, memory, timeout, and last modified date."""
    err = _check_credentials()
    if err: return err
    lam = get_client("lambda")
    try:
        functions = lam.list_functions().get("Functions", [])
        result = []
        for fn in functions:
            result.append({
                "name": fn["FunctionName"],
                "runtime": fn.get("Runtime", ""),
                "memory": fn.get("MemorySize", 0),
                "timeout": fn.get("Timeout", 0),
                "last_modified": fn.get("LastModified", ""),
            })
        if not result:
            return "No Lambda functions found"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

@mcp.tool()
def invoke_lambda_function(function_name: str) -> str:
    """Invoke a Lambda function and return the response."""
    err = _check_credentials()
    if err: return err
    lam = get_client("lambda")
    try:
        response = lam.invoke(
            FunctionName=function_name,
            InvocationType="RequestResponse",
            Payload=json.dumps({"test": True}),
        )
        payload = response["Payload"].read().decode()
        return f"Status: {response['StatusCode']}\nPayload: {payload}"
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  DynamoDB Tools
# ============================================================

@mcp.tool()
def list_dynamodb_tables() -> str:
    """List all DynamoDB tables with their status and item counts."""
    err = _check_credentials()
    if err: return err
    ddb = get_client("dynamodb")
    try:
        tables = ddb.list_tables().get("TableNames", [])
        result = []
        for name in tables:
            try:
                desc = ddb.describe_table(TableName=name).get("Table", {})
                result.append({
                    "name": name,
                    "status": desc.get("TableStatus", ""),
                    "items": desc.get("ItemCount", 0),
                    "size": desc.get("TableSizeBytes", 0),
                })
            except Exception:
                result.append({"name": name, "status": "unknown"})
        if not result:
            return "No DynamoDB tables found"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

@mcp.tool()
def query_dynamodb_table(table_name: str, limit: int = 10) -> str:
    """Scan a DynamoDB table and return items (up to limit)."""
    err = _check_credentials()
    if err: return err
    ddb = get_client("dynamodb")
    try:
        resp = ddb.scan(TableName=table_name, Limit=limit)
        items = resp.get("Items", [])
        # Convert DynamoDB format to readable format
        readable = []
        for item in items:
            readable.append({k: list(v.values())[0] for k, v in item.items()})
        return json.dumps(readable, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  SQS Tools
# ============================================================

@mcp.tool()
def list_sqs_queues() -> str:
    """List all SQS queues with their names and approximate message counts."""
    err = _check_credentials()
    if err: return err
    sqs = get_client("sqs")
    try:
        urls = sqs.list_queues().get("QueueUrls", [])
        result = []
        for url in urls:
            name = url.split("/")[-1]
            try:
                attrs = sqs.get_queue_attributes(
                    QueueUrl=url,
                    AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"]
                ).get("Attributes", {})
                result.append({
                    "name": name,
                    "messages_available": int(attrs.get("ApproximateNumberOfMessages", 0)),
                    "messages_in_flight": int(attrs.get("ApproximateNumberOfMessagesNotVisible", 0)),
                })
            except Exception:
                result.append({"name": name})
        if not result:
            return "No SQS queues found"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  IAM Tools
# ============================================================

@mcp.tool()
def list_iam_users() -> str:
    """List all IAM users with their groups, MFA status, and access key age."""
    err = _check_credentials()
    if err: return err
    iam = get_client("iam")
    try:
        users = iam.list_users().get("Users", [])
        result = []
        for u in users:
            name = u["UserName"]
            mfa = False
            key_age = 0
            try:
                mfa_devices = iam.list_mfa_devices(UserName=name)
                mfa = len(mfa_devices.get("MFADevices", [])) > 0
            except Exception:
                pass
            try:
                keys = iam.list_access_keys(UserName=name).get("AccessKeyMetadata", [])
                for k in keys:
                    if k.get("CreateDate"):
                        age = (datetime.now(timezone.utc) - k["CreateDate"].replace(tzinfo=None)).days
                        if age > key_age:
                            key_age = age
            except Exception:
                pass
            try:
                groups = iam.list_groups_for_user(UserName=name)
                group_names = [g["GroupName"] for g in groups.get("Groups", [])]
            except Exception:
                group_names = []
            result.append({
                "name": name,
                "groups": group_names,
                "mfa_enabled": mfa,
                "access_key_age_days": key_age,
            })
        if not result:
            return "No IAM users found"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  VPC / Network Tools
# ============================================================

@mcp.tool()
def list_vpcs() -> str:
    """List all VPCs with their CIDR blocks, subnets, and state."""
    err = _check_credentials()
    if err: return err
    ec2 = get_client("ec2")
    try:
        vpcs = ec2.describe_vpcs().get("Vpcs", [])
        subnets = ec2.describe_subnets().get("Subnets", [])
        subnets_by_vpc = {}
        for s in subnets:
            vpc_id = s["VpcId"]
            if vpc_id not in subnets_by_vpc:
                subnets_by_vpc[vpc_id] = []
            subnets_by_vpc[vpc_id].append({
                "name": next((t["Value"] for t in s.get("Tags", []) if t["Key"] == "Name"), s["SubnetId"]),
                "cidr": s.get("CidrBlock", ""),
                "az": s.get("AvailabilityZone", ""),
            })
        result = []
        for v in vpcs:
            vpc_id = v["VpcId"]
            result.append({
                "id": vpc_id,
                "name": next((t["Value"] for t in v.get("Tags", []) if t["Key"] == "Name"), vpc_id),
                "cidr": v.get("CidrBlock", ""),
                "state": v.get("State", ""),
                "subnets": subnets_by_vpc.get(vpc_id, []),
            })
        if not result:
            return "No VPCs found"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

@mcp.tool()
def list_security_groups() -> str:
    """List all security groups with their inbound and outbound rules."""
    err = _check_credentials()
    if err: return err
    ec2 = get_client("ec2")
    try:
        sgs = ec2.describe_security_groups().get("SecurityGroups", [])
        result = []
        for sg in sgs:
            inbound = []
            for perm in sg.get("IpPermissions", []):
                ports = []
                if "FromPort" in perm and "ToPort" in perm:
                    if perm["FromPort"] == perm["ToPort"]:
                        ports.append(str(perm["FromPort"]))
                    else:
                        ports.append(f"{perm['FromPort']}-{perm['ToPort']}")
                for ip_range in perm.get("IpRanges", []):
                    inbound.append({
                        "protocol": perm.get("IpProtocol", ""),
                        "ports": ", ".join(ports) if ports else "all",
                        "cidr": ip_range.get("CidrIp", ""),
                    })
            result.append({
                "name": sg["GroupName"],
                "id": sg["GroupId"],
                "inbound_rules": len(inbound),
                "inbound_details": inbound[:5],
            })
        if not result:
            return "No security groups found"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  Secrets Manager Tools
# ============================================================

@mcp.tool()
def list_secrets() -> str:
    """List all secrets in Secrets Manager (names only, not values for security)."""
    err = _check_credentials()
    if err: return err
    sm = get_client("secretsmanager")
    try:
        secrets = sm.list_secrets().get("SecretList", [])
        result = []
        for s in secrets:
            result.append({
                "name": s["Name"],
                "description": s.get("Description", ""),
                "created": s.get("CreatedDate", "").isoformat() if s.get("CreatedDate") else "",
            })
        if not result:
            return "No secrets found"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  SNS Tools
# ============================================================

@mcp.tool()
def list_sns_topics() -> str:
    """List all SNS topics."""
    err = _check_credentials()
    if err: return err
    sns = get_client("sns")
    try:
        topics = sns.list_topics().get("Topics", [])
        result = []
        for t in topics:
            arn = t["TopicArn"]
            name = arn.split(":")[-1]
            result.append({"name": name, "arn": arn})
        if not result:
            return "No SNS topics found"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  Cost Explorer Tools
# ============================================================

@mcp.tool()
def get_cost_overview() -> str:
    """Get AWS cost overview - today, yesterday, this month, and daily trend."""
    err = _check_credentials()
    if err: return err
    ce = get_client("ce")
    try:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday_start = today_start - timedelta(days=1)
        month_start = today_start.replace(day=1)

        def get_cost(start, end):
            r = ce.get_cost_and_usage(
                TimePeriod={"Start": start.strftime("%Y-%m-%d"), "End": end.strftime("%Y-%m-%d")},
                Granularity="DAILY", Metrics=["UnblendedCost"],
            )
            vals = r.get("ResultsByTime", [])
            return float(vals[0]["Total"]["UnblendedCost"]["Amount"]) if vals else 0

        today = get_cost(today_start, now)
        yesterday = get_cost(yesterday_start, today_start)
        month = get_cost(month_start, now)

        return json.dumps({
            "today": round(today, 2),
            "yesterday": round(yesterday, 2),
            "this_month": round(month, 2),
        }, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  RDS Tools
# ============================================================

@mcp.tool()
def list_rds_instances() -> str:
    """List all RDS database instances with engine, status, and size."""
    err = _check_credentials()
    if err: return err
    rds = get_client("rds")
    try:
        instances = rds.describe_db_instances().get("DBInstances", [])
        result = []
        for db in instances:
            result.append({
                "name": db.get("DBInstanceIdentifier", ""),
                "engine": db.get("Engine", ""),
                "status": db.get("DBInstanceStatus", ""),
                "class": db.get("DBInstanceClass", ""),
                "storage": db.get("AllocatedStorage", 0),
                "multi_az": db.get("MultiAZ", False),
            })
        if not result:
            return "No RDS instances found"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  ECS / Container Tools
# ============================================================

@mcp.tool()
def list_ecs_clusters() -> str:
    """List all ECS clusters and their services."""
    err = _check_credentials()
    if err: return err
    ecs = get_client("ecs")
    try:
        cluster_arns = ecs.list_clusters().get("clusterArns", [])
        result = []
        for arn in cluster_arns:
            name = arn.split("/")[-1]
            try:
                svcs = ecs.list_services(cluster=name).get("serviceArns", [])
                result.append({"name": name, "services": len(svcs)})
            except Exception:
                result.append({"name": name, "services": 0})
        if not result:
            return "No ECS clusters found"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  CloudWatch Tools
# ============================================================

@mcp.tool()
def list_cloudwatch_alarms() -> str:
    """List all CloudWatch alarms with their state and metric."""
    err = _check_credentials()
    if err: return err
    cw = get_client("cloudwatch")
    try:
        alarms = cw.describe_alarms().get("MetricAlarms", [])
        result = []
        for a in alarms:
            result.append({
                "name": a["AlarmName"],
                "state": a.get("StateValue", ""),
                "metric": a.get("MetricName", ""),
                "namespace": a.get("Namespace", ""),
                "threshold": a.get("Threshold", 0),
            })
        if not result:
            return "No CloudWatch alarms found"
        return json.dumps(result, indent=2)
    except ClientError as e:
        return f"Error: {str(e)}"

# ============================================================
#  Security Audit Tool
# ============================================================

@mcp.tool()
def security_audit() -> str:
    """Run a security audit across AWS services. Checks for:
    - S3 buckets without encryption
    - Security groups with open 0.0.0.0/0 rules
    - IAM users without MFA
    """
    err = _check_credentials()
    if err: return err
    findings = []
    try:
        # Check S3 encryption
        s3 = get_client("s3")
        buckets = s3.list_buckets().get("Buckets", [])
        for bucket in buckets:
            try:
                s3.get_bucket_encryption(Bucket=bucket["Name"])
            except ClientError:
                findings.append(f"CRITICAL: S3 bucket '{bucket['Name']}' has no encryption")

        # Check security groups
        ec2 = get_client("ec2")
        sgs = ec2.describe_security_groups().get("SecurityGroups", [])
        for sg in sgs:
            for perm in sg.get("IpPermissions", []):
                for ip_range in perm.get("IpRanges", []):
                    if ip_range.get("CidrIp") == "0.0.0.0/0":
                        port = perm.get("FromPort", "all")
                        severity = "CRITICAL" if port in [22, 3389] else "HIGH"
                        findings.append(f"{severity}: SG '{sg['GroupName']}' allows 0.0.0.0/0 on port {port}")

        # Check IAM MFA
        iam = get_client("iam")
        users = iam.list_users().get("Users", [])
        for u in users:
            name = u["UserName"]
            mfa = iam.list_mfa_devices(UserName=name)
            if not mfa.get("MFADevices"):
                findings.append(f"MEDIUM: IAM user '{name}' has no MFA enabled")

        if not findings:
            return "No security issues found"
        return "Security Audit Findings:\n" + "\n".join(findings)
    except ClientError as e:
        return f"Error during audit: {str(e)}"

# ============================================================
#  Main
# ============================================================

if __name__ == "__main__":
    print("Starting AWS MCP Server for Claude Desktop...")
    # Sync credentials from dashboard on startup
    sync_result = sync_from_dashboard()
    print(f"Dashboard sync: {sync_result}")
    print("Tools: list_ec2, list_s3, list_lambda, list_dynamodb, security_audit,")
    print("       sync_dashboard_credentials, configure_localstack, configure_aws")
    print()
    mcp.run(transport="stdio")
