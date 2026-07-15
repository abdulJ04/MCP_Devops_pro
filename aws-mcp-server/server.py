import os
import time
import asyncio
import logging
import json
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor

import boto3
from botocore.exceptions import ClientError, BotoCoreError
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aws-mcp-server")

app = FastAPI(title="AWS MCP Server", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

EXECUTOR = ThreadPoolExecutor(max_workers=20)

_credentials: Dict[str, Any] = {}
_sessions: Dict[str, Any] = {}
_cache: Dict[str, Dict[str, Any]] = {}
METRICS_TTL = 30
INVENTORY_TTL = 300
SESSION_TIMEOUT = 3600  # 1 hour default, configurable
_session_created_at: float = 0


def _get_session() -> boto3.Session:
    if "default" not in _sessions:
        session_kwargs = {
            "aws_access_key_id": _credentials.get("aws_access_key", "test"),
            "aws_secret_access_key": _credentials.get("aws_secret_key", "test"),
            "region_name": _credentials.get("aws_region", "us-east-1"),
        }
        if _credentials.get("aws_session_token"):
            session_kwargs["aws_session_token"] = _credentials["aws_session_token"]
        logger.info(f"Creating session: key={session_kwargs['aws_access_key_id'][:8]}..., localstack={_credentials.get('use_localstack', False)}")
        _sessions["default"] = boto3.Session(**session_kwargs)
    return _sessions["default"]


def _get_client(service: str):
    kwargs = {"region_name": _credentials.get("aws_region", "us-east-1")}
    if _credentials.get("use_localstack"):
        kwargs["endpoint_url"] = _credentials.get("endpoint_url", "http://localhost:4566")
    return _get_session().client(service, **kwargs)


def _ensure_credentials(access_key=None, secret_key=None, session_token=None, aws_region=None):
    global _credentials, _sessions, _session_created_at

    # Check session timeout
    if _session_created_at > 0 and time.time() - _session_created_at > SESSION_TIMEOUT:
        logger.warning("Session expired, clearing credentials")
        _credentials.clear()
        _sessions.clear()
        _cache.clear()
        _session_created_at = 0
        raise HTTPException(status_code=401, detail="Session expired. Please reconnect.")

    if _credentials.get("use_localstack"):
        return
    if access_key and secret_key:
        if (_credentials.get("aws_access_key") != access_key or
            _credentials.get("aws_secret_key") != secret_key or
            _credentials.get("aws_session_token") != session_token):
            logger.info(f"Setting credentials: key={access_key[:8]}..., region={aws_region}")
            _credentials = {
                "aws_access_key": access_key,
                "aws_secret_key": secret_key,
                "aws_session_token": session_token,
                "aws_region": aws_region or "us-east-1",
            }
            _sessions.clear()
            _session_created_at = time.time()


@app.post("/refresh")
async def refresh_cache():
    """Clear cache so next requests fetch fresh data from AWS."""
    _cache.clear()
    return {"success": True, "message": "Cache cleared"}


@app.post("/set_timeout")
async def set_timeout(request: dict = {}):
    """Set session timeout in seconds."""
    global SESSION_TIMEOUT
    timeout = request.get("timeout", 3600)
    SESSION_TIMEOUT = int(timeout)
    return {"success": True, "timeout": SESSION_TIMEOUT}


def _cached(key: str, ttl: int):
    entry = _cache.get(key)
    if entry and time.time() - entry["ts"] < ttl:
        return entry["data"]
    return None


def _set_cache(key: str, data: Any):
    _cache[key] = {"data": data, "ts": time.time()}


def _format_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    elif size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    else:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


class AuthRequest(BaseModel):
    aws_access_key: Optional[str] = None
    aws_secret_key: Optional[str] = None
    aws_session_token: Optional[str] = None
    aws_region: Optional[str] = None
    accessKeyId: Optional[str] = None
    secretAccessKey: Optional[str] = None
    sessionToken: Optional[str] = None
    region: Optional[str] = None
    use_localstack: Optional[bool] = False
    endpoint_url: Optional[str] = None

    def get_access_key(self) -> str:
        return self.aws_access_key or self.accessKeyId or ""

    def get_secret_key(self) -> str:
        return self.aws_secret_key or self.secretAccessKey or ""

    def get_session_token(self) -> Optional[str]:
        return self.aws_session_token or self.sessionToken

    def get_region(self) -> str:
        return self.aws_region or self.region or "us-east-1"


@app.post("/auth")
async def auth(req: AuthRequest):
    global _credentials, _sessions

    if req.use_localstack:
        _credentials = {
            "aws_access_key": "test",
            "aws_secret_key": "test",
            "aws_region": req.get_region(),
            "use_localstack": True,
            "endpoint_url": req.endpoint_url or "http://localhost:4566",
        }
        _sessions.clear()
        try:
            sts = _get_client("sts")
            identity = sts.get_caller_identity()
            logger.info(f"LocalStack auth success: Account={identity.get('Account')}")
            return {"success": True, "status": "success", "account": identity.get("Account"), "arn": identity.get("Arn"), "message": "Connected to LocalStack"}
        except Exception as e:
            logger.error(f"LocalStack auth error: {e}")
            raise HTTPException(status_code=401, detail=f"LocalStack connection failed: {str(e)}")

    access_key = req.get_access_key()
    secret_key = req.get_secret_key()
    session_token = req.get_session_token()
    aws_region = req.get_region()

    if not access_key or not secret_key:
        raise HTTPException(status_code=400, detail="AWS Access Key and Secret Key are required")

    _credentials = {
        "aws_access_key": access_key,
        "aws_secret_key": secret_key,
        "aws_session_token": session_token,
        "aws_region": aws_region,
    }
    _sessions.clear()
    try:
        session = boto3.Session(
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            aws_session_token=session_token,
            region_name=aws_region,
        )
        sts = session.client("sts")
        identity = sts.get_caller_identity()
        logger.info(f"Auth success: Account={identity.get('Account')}, ARN={identity.get('Arn')}")
        return {"success": True, "status": "success", "account": identity.get("Account"), "arn": identity.get("Arn"), "message": f"Connected to AWS account {identity.get('Account')}"}
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Auth error: {error_msg}")
        if "InvalidClientTokenId" in error_msg:
            error_msg = "Invalid AWS Access Key ID - Check if your Access Key is correct and the IAM user is active"
        elif "SignatureDoesNotMatch" in error_msg:
            error_msg = "Invalid AWS Secret Access Key - Check if your Secret Key is correct"
        elif "AccessDenied" in error_msg:
            error_msg = "Access denied - Check if your IAM user has sts:GetCallerIdentity permission"
        elif "ExpiredToken" in error_msg or "expired" in error_msg.lower():
            error_msg = "Session token expired - Get new credentials from AWS SSO/CLI"
        raise HTTPException(status_code=401, detail=f"Authentication failed: {error_msg}")


@app.get("/health")
async def health():
    return {"status": "ok", "credentials_configured": bool(_credentials), "localstack": _credentials.get("use_localstack", False)}


# ============================================================
# EXISTING SERVICES (with fixed data mappings)
# ============================================================

@app.post("/ec2")
async def ec2_instances(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("ec2", METRICS_TTL)
    if cached:
        return cached

    client = _get_client("ec2")
    cw = _get_client("cloudwatch")
    result = {"instances": [], "region": _credentials.get("aws_region", "us-east-1")}

    try:
        resp = client.describe_instances()
        all_instances = []
        for reservation in resp["Reservations"]:
            for inst in reservation["Instances"]:
                all_instances.append(inst)

        def _get_instance_metrics(inst):
            instance_id = inst["InstanceId"]
            item = {
                "id": instance_id,
                "name": next((t["Value"] for t in inst.get("Tags", []) if t["Key"] == "Name"), instance_id),
                "type": inst.get("InstanceType"),
                "state": inst.get("State", {}).get("Name"),
                "private_ip": inst.get("PrivateIpAddress", ""),
                "public_ip": inst.get("PublicIpAddress", ""),
                "az": inst.get("Placement", {}).get("AvailabilityZone", ""),
                "launch_time": inst.get("LaunchTime", "").isoformat() if inst.get("LaunchTime") else None,
                "metrics": {},
            }
            try:
                now = datetime.now(timezone.utc)
                metrics_to_fetch = [
                    ("CPUUtilization", "cpu_avg", "Average"),
                    ("NetworkIn", "network_in_bytes", "Sum"),
                    ("NetworkOut", "network_out_bytes", "Sum"),
                    ("DiskReadBytes", "disk_read_bytes", "Sum"),
                ]
                for metric_name, key, stat in metrics_to_fetch:
                    try:
                        data = cw.get_metric_statistics(
                            Namespace="AWS/EC2", MetricName=metric_name,
                            Dimensions=[{"Name": "InstanceId", "Value": instance_id}],
                            StartTime=now - timedelta(hours=1), EndTime=now,
                            Period=300, Statistics=[stat],
                        )
                        dp = data.get("Datapoints", [])
                        if dp:
                            item["metrics"][key] = round(dp[-1].get(stat, 0), 2)
                    except Exception:
                        pass
            except Exception as e:
                item["metrics"]["error"] = str(e)
            return item

        loop = asyncio.get_event_loop()
        tasks = [loop.run_in_executor(EXECUTOR, _get_instance_metrics, inst) for inst in all_instances]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, dict):
                result["instances"].append(r)

    except ClientError as e:
        result["error"] = str(e)

    _set_cache("ec2", result)
    return result


@app.post("/s3")
async def s3_buckets(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("s3", INVENTORY_TTL)
    if cached:
        return cached

    s3 = _get_client("s3")
    region = _credentials.get("aws_region", "us-east-1")
    result = {"buckets": []}

    try:
        buckets = s3.list_buckets().get("Buckets", [])

        def _get_bucket_details(bucket):
            name = bucket["Name"]
            item = {
                "name": name,
                "region": region,
                "size": "0 B",
                "objectCount": 0,
                "versioning": False,
                "encryption": False,
                "publicAccess": False,
            }

            try:
                ver = s3.get_bucket_versioning(Bucket=name)
                item["versioning"] = ver.get("Status") == "Enabled"
            except ClientError:
                pass

            try:
                enc = s3.get_bucket_encryption(Bucket=name)
                rules = enc.get("ServerSideEncryptionConfiguration", {}).get("Rules", [])
                item["encryption"] = bool(rules)
            except ClientError:
                item["encryption"] = False

            try:
                access = s3.get_public_access_block(Bucket=name)
                pa = access.get("PublicAccessBlockConfiguration", {})
                item["publicAccess"] = not (pa.get("BlockPublicAcls", False) and pa.get("BlockPublicPolicy", False))
            except ClientError:
                item["publicAccess"] = False

            try:
                paginator = s3.get_paginator("list_objects_v2")
                count = 0
                total_size = 0
                for page in paginator.paginate(Bucket=name):
                    for obj in page.get("Contents", []):
                        count += 1
                        total_size += obj.get("Size", 0)
                item["objectCount"] = count
                item["size"] = _format_size(total_size)
            except ClientError:
                pass

            return item

        loop = asyncio.get_event_loop()
        tasks = [loop.run_in_executor(EXECUTOR, _get_bucket_details, b) for b in buckets]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, dict):
                result["buckets"].append(r)

    except ClientError as e:
        result["error"] = str(e)

    _set_cache("s3", result)
    return result


@app.post("/lambda")
async def lambda_functions(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("lambda", METRICS_TTL)
    if cached:
        return cached

    lam = _get_client("lambda")
    cw = _get_client("cloudwatch")
    result = {"functions": []}

    try:
        functions = lam.list_functions().get("Functions", [])

        def _get_function_metrics(fn):
            name = fn["FunctionName"]
            item = {
                "name": name,
                "runtime": fn.get("Runtime", "unknown"),
                "memory": fn.get("MemorySize", 0),
                "timeout": fn.get("Timeout", 0),
                "lastModified": fn.get("LastModified", ""),
                "state": "Active",
                "invocations": 0,
                "errors": 0,
                "avgDuration": 0,
            }
            try:
                now = datetime.now(timezone.utc)
                inv = cw.get_metric_statistics(
                    Namespace="AWS/Lambda", MetricName="Invocations",
                    Dimensions=[{"Name": "FunctionName", "Value": name}],
                    StartTime=now - timedelta(hours=24), EndTime=now,
                    Period=3600, Statistics=["Sum"],
                )
                dp = inv.get("Datapoints", [])
                item["invocations"] = round(sum(d["Sum"] for d in dp))

                errs = cw.get_metric_statistics(
                    Namespace="AWS/Lambda", MetricName="Errors",
                    Dimensions=[{"Name": "FunctionName", "Value": name}],
                    StartTime=now - timedelta(hours=24), EndTime=now,
                    Period=3600, Statistics=["Sum"],
                )
                dp = errs.get("Datapoints", [])
                item["errors"] = round(sum(d["Sum"] for d in dp))

                dur = cw.get_metric_statistics(
                    Namespace="AWS/Lambda", MetricName="Duration",
                    Dimensions=[{"Name": "FunctionName", "Value": name}],
                    StartTime=now - timedelta(hours=24), EndTime=now,
                    Period=3600, Statistics=["Average"],
                )
                dp = dur.get("Datapoints", [])
                item["avgDuration"] = round(dp[-1]["Average"], 2) if dp else 0
            except Exception:
                pass
            return item

        loop = asyncio.get_event_loop()
        tasks = [loop.run_in_executor(EXECUTOR, _get_function_metrics, fn) for fn in functions]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, dict):
                result["functions"].append(r)

    except ClientError as e:
        result["error"] = str(e)

    _set_cache("lambda", result)
    return result


@app.post("/rds")
async def rds_instances(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("rds", METRICS_TTL)
    if cached:
        return cached

    rds = _get_client("rds")
    cw = _get_client("cloudwatch")
    result = {"databases": []}

    try:
        instances = rds.describe_db_instances().get("DBInstances", [])

        def _get_db_metrics(db):
            db_id = db.get("DBInstanceIdentifier", "")
            item = {
                "name": db_id,
                "engine": db.get("Engine", ""),
                "status": db.get("DBInstanceStatus", "available"),
                "cpu": 0,
                "storage": db.get("AllocatedStorage", 0),
                "storageUsed": 0,
                "multiAZ": db.get("MultiAZ", False),
                "connections": 0,
            }
            try:
                now = datetime.now(timezone.utc)
                cpu = cw.get_metric_statistics(
                    Namespace="AWS/RDS", MetricName="CPUUtilization",
                    Dimensions=[{"Name": "DBInstanceIdentifier", "Value": db_id}],
                    StartTime=now - timedelta(hours=1), EndTime=now,
                    Period=300, Statistics=["Average"],
                )
                dp = cpu.get("Datapoints", [])
                item["cpu"] = round(dp[-1]["Average"], 2) if dp else 0

                conns = cw.get_metric_statistics(
                    Namespace="AWS/RDS", MetricName="DatabaseConnections",
                    Dimensions=[{"Name": "DBInstanceIdentifier", "Value": db_id}],
                    StartTime=now - timedelta(hours=1), EndTime=now,
                    Period=300, Statistics=["Average"],
                )
                dp = conns.get("Datapoints", [])
                item["connections"] = round(dp[-1]["Average"]) if dp else 0
            except Exception:
                pass
            return item

        loop = asyncio.get_event_loop()
        tasks = [loop.run_in_executor(EXECUTOR, _get_db_metrics, db) for db in instances]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, dict):
                result["databases"].append(r)

    except ClientError as e:
        result["error"] = str(e)

    _set_cache("rds", result)
    return result


@app.post("/iam")
async def iam_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("iam", INVENTORY_TTL)
    if cached:
        return cached

    iam = _get_client("iam")
    result = {"users": [], "roles": [], "policies": []}

    try:
        users = iam.list_users().get("Users", [])

        def _get_user_details(u):
            name = u["UserName"]
            item = {
                "name": name,
                "mfaEnabled": False,
                "lastAccess": "",
                "accessKeyAge": 0,
                "active": True,
            }
            try:
                mfa = iam.list_mfa_devices(UserName=name)
                item["mfaEnabled"] = len(mfa.get("MFADevices", [])) > 0
            except Exception:
                pass
            try:
                keys = iam.list_access_keys(UserName=name).get("AccessKeyMetadata", [])
                for k in keys:
                    create = k.get("CreateDate")
                    if create:
                        age = (datetime.now(timezone.utc) - create.replace(tzinfo=None)).days
                        if age > item["accessKeyAge"]:
                            item["accessKeyAge"] = age
            except Exception:
                pass
            return item

        loop = asyncio.get_event_loop()
        tasks = [loop.run_in_executor(EXECUTOR, _get_user_details, u) for u in users]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, dict):
                result["users"].append(r)

        roles = iam.list_roles().get("Roles", [])
        for r in roles:
            result["roles"].append({
                "name": r["RoleName"],
                "trustPolicy": str(r.get("AssumeRolePolicyDocument", ""))[:100],
                "lastUsed": "",
            })

        policies = iam.list_policies(Scope="Local").get("Policies", [])
        for p in policies:
            result["policies"].append({
                "name": p["PolicyName"],
                "type": "Managed",
                "usageCount": p.get("AttachmentCount", 0),
            })

    except ClientError as e:
        result["error"] = str(e)

    _set_cache("iam", result)
    return result


@app.post("/vpc")
async def vpc_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("vpc", INVENTORY_TTL)
    if cached:
        return cached

    client = _get_client("ec2")
    result = {"vpcs": [], "securityGroups": []}

    try:
        loop = asyncio.get_event_loop()
        vpcs_resp, subnets_resp, sgs_resp = await asyncio.gather(
            loop.run_in_executor(EXECUTOR, lambda: client.describe_vpcs()),
            loop.run_in_executor(EXECUTOR, lambda: client.describe_subnets()),
            loop.run_in_executor(EXECUTOR, lambda: client.describe_security_groups()),
        )

        subnets_by_vpc = {}
        for s in subnets_resp.get("Subnets", []):
            vpc_id = s["VpcId"]
            if vpc_id not in subnets_by_vpc:
                subnets_by_vpc[vpc_id] = []
            subnets_by_vpc[vpc_id].append({
                "name": next((t["Value"] for t in s.get("Tags", []) if t["Key"] == "Name"), s["SubnetId"]),
                "cidr": s.get("CidrBlock", ""),
                "az": s.get("AvailabilityZone", ""),
                "availableIps": s.get("AvailableIpAddressCount", 0),
            })

        for v in vpcs_resp.get("Vpcs", []):
            vpc_id = v["VpcId"]
            result["vpcs"].append({
                "name": next((t["Value"] for t in v.get("Tags", []) if t["Key"] == "Name"), vpc_id),
                "cidr": v.get("CidrBlock", ""),
                "state": v.get("State", "available"),
                "subnets": subnets_by_vpc.get(vpc_id, []),
            })

        for sg in sgs_resp.get("SecurityGroups", []):
            result["securityGroups"].append({
                "name": sg["GroupName"],
                "inboundRules": len(sg.get("IpPermissions", [])),
                "outboundRules": len(sg.get("IpPermissionsEgress", [])),
            })

    except ClientError as e:
        result["error"] = str(e)

    _set_cache("vpc", result)
    return result


@app.post("/cost")
async def cost_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("cost", METRICS_TTL)
    if cached:
        return cached

    result = {"today": 0, "yesterday": 0, "month": 0, "forecast": 0, "daily": [], "byService": [], "byRegion": []}

    try:
        ce = _get_client("ce")
        loop = asyncio.get_event_loop()

        def _get_daily_cost(start, end):
            r = ce.get_cost_and_usage(
                TimePeriod={"Start": start.strftime("%Y-%m-%d"), "End": end.strftime("%Y-%m-%d")},
                Granularity="DAILY", Metrics=["UnblendedCost"],
            )
            vals = r.get("ResultsByTime", [])
            return float(vals[0]["Total"]["UnblendedCost"]["Amount"]) if vals else 0

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday_start = today_start - timedelta(days=1)
        month_start = today_start.replace(day=1)

        today_cost, yesterday_cost, month_cost, daily_resp, by_svc_resp, by_region_resp = await asyncio.gather(
            loop.run_in_executor(EXECUTOR, _get_daily_cost, today_start, now),
            loop.run_in_executor(EXECUTOR, _get_daily_cost, yesterday_start, today_start),
            loop.run_in_executor(EXECUTOR, _get_daily_cost, month_start, now),
            loop.run_in_executor(EXECUTOR, lambda: ce.get_cost_and_usage(
                TimePeriod={"Start": (now - timedelta(days=30)).strftime("%Y-%m-%d"), "End": now.strftime("%Y-%m-%d")},
                Granularity="DAILY", Metrics=["UnblendedCost"],
            )),
            loop.run_in_executor(EXECUTOR, lambda: ce.get_cost_and_usage(
                TimePeriod={"Start": month_start.strftime("%Y-%m-%d"), "End": now.strftime("%Y-%m-%d")},
                Granularity="MONTHLY", Metrics=["UnblendedCost"],
                GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
            )),
            loop.run_in_executor(EXECUTOR, lambda: ce.get_cost_and_usage(
                TimePeriod={"Start": month_start.strftime("%Y-%m-%d"), "End": now.strftime("%Y-%m-%d")},
                Granularity="MONTHLY", Metrics=["UnblendedCost"],
                GroupBy=[{"Type": "DIMENSION", "Key": "REGION"}],
            )),
        )

        result["today"] = round(today_cost, 2)
        result["yesterday"] = round(yesterday_cost, 2)
        result["month"] = round(month_cost, 2)

        for dp in daily_resp.get("ResultsByTime", []):
            result["daily"].append({
                "date": dp["TimePeriod"]["Start"],
                "cost": round(float(dp["Total"]["UnblendedCost"]["Amount"]), 2),
            })

        for g in by_svc_resp.get("ResultsByTime", [{}])[0].get("Groups", []):
            result["byService"].append({
                "service": g["Keys"][0],
                "cost": round(float(g["Total"]["UnblendedCost"]["Amount"]), 2),
            })

        for g in by_region_resp.get("ResultsByTime", [{}])[0].get("Groups", []):
            result["byRegion"].append({
                "name": g["Keys"][0],
                "value": round(float(g["Total"]["UnblendedCost"]["Amount"]), 2),
            })

    except ClientError as e:
        result["error"] = str(e)

    _set_cache("cost", result)
    return result


@app.post("/security")
async def security_findings(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("security", METRICS_TTL)
    if cached:
        return cached

    result = {"findings": []}
    finding_id = 1

    try:
        loop = asyncio.get_event_loop()
        s3_client = _get_client("s3")
        ec2_client = _get_client("ec2")
        iam_client = _get_client("iam")

        try:
            buckets = s3_client.list_buckets().get("Buckets", [])
            for bucket in buckets:
                try:
                    enc = s3_client.get_bucket_encryption(Bucket=bucket["Name"])
                    rules = enc.get("ServerSideEncryptionConfiguration", {}).get("Rules", [])
                    if not rules:
                        result["findings"].append({
                            "id": f"SEC-{finding_id:03d}", "title": f"S3 bucket '{bucket['Name']}' has no encryption",
                            "severity": "High", "resource": bucket["Name"], "region": _credentials.get("aws_region", "us-east-1"),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
                        finding_id += 1
                except ClientError:
                    result["findings"].append({
                        "id": f"SEC-{finding_id:03d}", "title": f"S3 bucket '{bucket['Name']}' has no encryption",
                        "severity": "High", "resource": bucket["Name"], "region": _credentials.get("aws_region", "us-east-1"),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    finding_id += 1

                try:
                    access = s3_client.get_public_access_block(Bucket=bucket["Name"])
                    pa = access.get("PublicAccessBlockConfiguration", {})
                    if not pa.get("BlockPublicAcls", False):
                        result["findings"].append({
                            "id": f"SEC-{finding_id:03d}", "title": f"S3 bucket '{bucket['Name']}' has public access",
                            "severity": "Critical", "resource": bucket["Name"], "region": _credentials.get("aws_region", "us-east-1"),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
                        finding_id += 1
                except ClientError:
                    pass
        except Exception:
            pass

        try:
            sgs = ec2_client.describe_security_groups().get("SecurityGroups", [])
            for sg in sgs:
                for perm in sg.get("IpPermissions", []):
                    for ip_range in perm.get("IpRanges", []):
                        if ip_range.get("CidrIp") == "0.0.0.0/0":
                            port = perm.get("FromPort", "all")
                            result["findings"].append({
                                "id": f"SEC-{finding_id:03d}",
                                "title": f"Security group '{sg['GroupName']}' allows 0.0.0.0/0 on port {port}",
                                "severity": "Critical" if port in [22, 3389] else "High",
                                "resource": sg["GroupId"], "region": _credentials.get("aws_region", "us-east-1"),
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })
                            finding_id += 1
                            break
        except Exception:
            pass

        try:
            users = iam_client.list_users().get("Users", [])
            for u in users:
                name = u["UserName"]
                mfa = iam_client.list_mfa_devices(UserName=name)
                if not mfa.get("MFADevices"):
                    result["findings"].append({
                        "id": f"SEC-{finding_id:03d}", "title": f"IAM user '{name}' without MFA enabled",
                        "severity": "Medium", "resource": name, "region": "global",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    finding_id += 1
        except Exception:
            pass

    except ClientError as e:
        result["error"] = str(e)

    _set_cache("security", result)
    return result


@app.post("/activity")
async def activity_timeline(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("activity", METRICS_TTL)
    if cached:
        return cached

    result = {"events": []}

    try:
        ct = _get_client("cloudtrail")
        now = datetime.now(timezone.utc)
        events = ct.lookup_events(
            StartTime=now - timedelta(hours=24), EndTime=now,
            MaxResults=50,
        )

        for i, evt in enumerate(events.get("Events", [])):
            source = evt.get("EventSource", "")
            category = "other"
            if "ec2" in source.lower():
                category = "ec2"
            elif "s3" in source.lower():
                category = "s3"
            elif "iam" in source.lower():
                category = "iam"
            elif "lambda" in source.lower():
                category = "lambda"

            result["events"].append({
                "id": f"evt-{i}",
                "event": evt.get("EventName", ""),
                "source": source,
                "time": evt.get("EventTime", "").isoformat() if evt.get("EventTime") else "",
                "region": _credentials.get("aws_region", "us-east-1"),
                "status": "Success",
            })

    except ClientError as e:
        result["error"] = str(e)

    _set_cache("activity", result)
    return result


# ============================================================
# 23 NEW SERVICE ENDPOINTS
# ============================================================

@app.post("/ebs")
async def ebs_volumes(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("ebs", INVENTORY_TTL)
    if cached:
        return cached

    result = {"volumes": [], "snapshots": []}
    try:
        ec2 = _get_client("ec2")
        loop = asyncio.get_event_loop()
        vols_resp, snaps_resp = await asyncio.gather(
            loop.run_in_executor(EXECUTOR, lambda: ec2.describe_volumes()),
            loop.run_in_executor(EXECUTOR, lambda: ec2.describe_snapshots(OwnerIds=["self"])),
        )
        for v in vols_resp.get("Volumes", []):
            attachments = v.get("Attachments", [])
            result["volumes"].append({
                "id": v["VolumeId"],
                "size": v.get("Size", 0),
                "type": v.get("VolumeType", "gp2"),
                "state": v.get("State", ""),
                "encrypted": v.get("Encrypted", False),
                "instanceId": attachments[0]["InstanceId"] if attachments else None,
                "az": v.get("AvailabilityZone", ""),
            })
        for s in snaps_resp.get("Snapshots", []):
            result["snapshots"].append({
                "id": s["SnapshotId"],
                "volumeId": s.get("VolumeId", ""),
                "state": s.get("State", ""),
                "size": s.get("VolumeSize", 0),
                "startTime": s.get("StartTime", "").isoformat() if s.get("StartTime") else "",
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("ebs", result)
    return result


@app.post("/route53")
async def route53_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("route53", INVENTORY_TTL)
    if cached:
        return cached

    result = {"zones": [], "health_checks": []}
    try:
        r53 = _get_client("route53")
        loop = asyncio.get_event_loop()
        zones_resp, hc_resp = await asyncio.gather(
            loop.run_in_executor(EXECUTOR, lambda: r53.list_hosted_zones()),
            loop.run_in_executor(EXECUTOR, lambda: r53.list_health_checks()),
        )
        for z in zones_resp.get("HostedZones", []):
            result["zones"].append({
                "id": z["Id"], "name": z["Name"], "recordCount": z.get("ResourceRecordSetCount", 0),
                "private": z.get("Config", {}).get("PrivateZone", False),
            })
        for hc in hc_resp.get("HealthChecks", []):
            result["health_checks"].append({
                "id": hc["Id"], "name": hc.get("HealthCheckConfig", {}).get("FullyQualifiedDomainName", ""),
                "status": hc.get("HealthCheckConfig", {}).get("Type", ""),
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("route53", result)
    return result


@app.post("/elb")
async def elb_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("elb", INVENTORY_TTL)
    if cached:
        return cached

    result = {"load_balancers": [], "target_groups": []}
    try:
        elb = _get_client("elbv2")
        loop = asyncio.get_event_loop()
        lb_resp, tg_resp = await asyncio.gather(
            loop.run_in_executor(EXECUTOR, lambda: elb.describe_load_balancers()),
            loop.run_in_executor(EXECUTOR, lambda: elb.describe_target_groups()),
        )
        for lb in lb_resp.get("LoadBalancers", []):
            result["load_balancers"].append({
                "name": lb["LoadBalancerName"],
                "arn": lb["LoadBalancerArn"],
                "dns": lb.get("DNSName", ""),
                "type": lb.get("Type", "application"),
                "state": lb.get("State", {}).get("Code", ""),
                "vpcId": lb.get("VpcId", ""),
            })
        for tg in tg_resp.get("TargetGroups", []):
            result["target_groups"].append({
                "name": tg["TargetGroupName"],
                "protocol": tg.get("Protocol", ""),
                "port": tg.get("Port", 0),
                "vpcId": tg.get("VpcId", ""),
                "targetCount": tg.get("TargetHealthDescriptions", []) and len(tg["TargetHealthDescriptions"]),
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("elb", result)
    return result


@app.post("/auto_scaling")
async def auto_scaling_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("auto_scaling", INVENTORY_TTL)
    if cached:
        return cached

    result = {"groups": [], "activities": []}
    try:
        asg = _get_client("autoscaling")
        resp = asg.describe_auto_scaling_groups()
        for g in resp.get("AutoScalingGroups", []):
            result["groups"].append({
                "name": g["AutoScalingGroupName"],
                "minSize": g.get("MinSize", 0),
                "maxSize": g.get("MaxSize", 0),
                "desired": g.get("DesiredCapacity", 0),
                "instances": len(g.get("Instances", [])),
                "health": g.get("HealthCheckType", ""),
            })
        acts = asg.describe_scaling_activities(MaxRecords=10)
        for a in acts.get("Activities", []):
            result["activities"].append({
                "id": a["ActivityId"],
                "description": a.get("Description", ""),
                "cause": a.get("Cause", ""),
                "status": a.get("StatusCode", ""),
                "startTime": a.get("StartTime", "").isoformat() if a.get("StartTime") else "",
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("auto_scaling", result)
    return result


@app.post("/cloudwatch_dash")
async def cloudwatch_dashboards(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("cloudwatch_dash", METRICS_TTL)
    if cached:
        return cached

    result = {"dashboards": [], "alarms": []}
    try:
        cw = _get_client("cloudwatch")
        loop = asyncio.get_event_loop()
        dash_resp, alarm_resp = await asyncio.gather(
            loop.run_in_executor(EXECUTOR, lambda: cw.list_dashboards()),
            loop.run_in_executor(EXECUTOR, lambda: cw.describe_alarms()),
        )
        for d in dash_resp.get("DashboardEntries", []):
            result["dashboards"].append({
                "name": d["DashboardName"],
                "lastModified": d.get("LastModified", "").isoformat() if d.get("LastModified") else "",
                "size": d.get("Size", 0),
            })
        for a in alarm_resp.get("MetricAlarms", []):
            result["alarms"].append({
                "name": a["AlarmName"],
                "state": a.get("StateValue", ""),
                "metric": a.get("MetricName", ""),
                "namespace": a.get("Namespace", ""),
                "threshold": a.get("Threshold", 0),
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("cloudwatch_dash", result)
    return result


@app.post("/ssm")
async def ssm_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("ssm", INVENTORY_TTL)
    if cached:
        return cached

    result = {"documents": [], "parameters": []}
    try:
        ssm = _get_client("ssm")
        loop = asyncio.get_event_loop()
        docs_resp, params_resp = await asyncio.gather(
            loop.run_in_executor(EXECUTOR, lambda: ssm.list_documents()),
            loop.run_in_executor(EXECUTOR, lambda: ssm.describe_parameters()),
        )
        for d in docs_resp.get("DocumentIdentifiers", []):
            result["documents"].append({
                "name": d["Name"],
                "type": d.get("DocumentType", ""),
                "platform": d.get("PlatformTypes", []),
            })
        for p in params_resp.get("Parameters", []):
            result["parameters"].append({
                "name": p["Name"],
                "type": p.get("Type", ""),
                "tier": p.get("Tier", "Standard"),
                "version": p.get("Version", 0),
                "lastModified": p.get("LastModifiedDate", "").isoformat() if p.get("LastModifiedDate") else "",
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("ssm", result)
    return result


@app.post("/ecr")
async def ecr_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("ecr", INVENTORY_TTL)
    if cached:
        return cached

    result = {"repositories": []}
    try:
        ecr = _get_client("ecr")
        repos = ecr.describe_repositories().get("repositories", [])
        for r in repos:
            result["repositories"].append({
                "name": r["repositoryName"],
                "arn": r["repositoryArn"],
                "uri": r.get("repositoryUri", ""),
                "createdAt": r.get("createdAt", "").isoformat() if r.get("createdAt") else "",
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("ecr", result)
    return result


@app.post("/ecs")
async def ecs_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("ecs", INVENTORY_TTL)
    if cached:
        return cached

    result = {"clusters": [], "services": []}
    try:
        ecs = _get_client("ecs")
        cluster_arns = ecs.list_clusters().get("clusterArns", [])
        for arn in cluster_arns:
            name = arn.split("/")[-1]
            result["clusters"].append({"name": name, "arn": arn})
            try:
                svcs = ecs.list_services(cluster=name).get("serviceArns", [])
                if svcs:
                    details = ecs.describe_services(cluster=name, services=svcs).get("services", [])
                    for s in details:
                        result["services"].append({
                            "name": s["serviceName"],
                            "cluster": name,
                            "status": s.get("status", ""),
                            "desired": s.get("desiredCount", 0),
                            "running": s.get("runningCount", 0),
                        })
            except Exception:
                pass
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("ecs", result)
    return result


@app.post("/eks")
async def eks_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("eks", INVENTORY_TTL)
    if cached:
        return cached

    result = {"clusters": []}
    try:
        eks = _get_client("eks")
        cluster_names = eks.list_clusters().get("clusters", [])
        for name in cluster_names:
            try:
                desc = eks.describe_cluster(name=name).get("cluster", {})
                result["clusters"].append({
                    "name": name,
                    "status": desc.get("status", ""),
                    "version": desc.get("version", ""),
                    "endpoint": desc.get("endpoint", ""),
                    "vpcId": desc.get("resourcesVpcConfig", {}).get("vpcId", ""),
                })
            except Exception:
                result["clusters"].append({"name": name, "status": "unknown"})
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("eks", result)
    return result


@app.post("/cloudformation")
async def cloudformation_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("cloudformation", INVENTORY_TTL)
    if cached:
        return cached

    result = {"stacks": []}
    try:
        cfn = _get_client("cloudformation")
        stacks = cfn.list_stacks(StackStatusFilter=[
            "CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE", "CREATE_IN_PROGRESS", "DELETE_IN_PROGRESS"
        ]).get("StackSummaries", [])
        for s in stacks:
            result["stacks"].append({
                "name": s["StackName"],
                "status": s.get("StackStatus", ""),
                "description": s.get("Description", ""),
                "creationTime": s.get("CreationTime", "").isoformat() if s.get("CreationTime") else "",
                "lastUpdatedTime": s.get("LastUpdatedTime", "").isoformat() if s.get("LastUpdatedTime") else "",
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("cloudformation", result)
    return result


@app.post("/codepipeline")
async def codepipeline_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("codepipeline", INVENTORY_TTL)
    if cached:
        return cached

    result = {"pipelines": []}
    try:
        cp = _get_client("codepipeline")
        pipelines = cp.list_pipelines().get("pipelines", [])
        for p in pipelines:
            result["pipelines"].append({
                "name": p["name"],
                "arn": p.get("arn", ""),
                "version": p.get("version", 0),
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("codepipeline", result)
    return result


@app.post("/codebuild")
async def codebuild_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("codebuild", INVENTORY_TTL)
    if cached:
        return cached

    result = {"projects": [], "builds": []}
    try:
        cb = _get_client("codebuild")
        projects = cb.list_projects().get("projects", [])
        for name in projects:
            result["projects"].append({"name": name})
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("codebuild", result)
    return result


@app.post("/codedeploy")
async def codedeploy_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("codedeploy", INVENTORY_TTL)
    if cached:
        return cached

    result = {"applications": [], "deployments": []}
    try:
        cd = _get_client("codedeploy")
        apps = cd.list_applications().get("applications", [])
        for name in apps:
            result["applications"].append({"name": name})
        deps = cd.list_deployments().get("deployments", [])
        for d_id in deps[:10]:
            try:
                dep = cd.get_deployment(deploymentId=d_id).get("deploymentInfo", {})
                result["deployments"].append({
                    "id": d_id,
                    "application": dep.get("applicationName", ""),
                    "status": dep.get("status", ""),
                    "createTime": dep.get("createTime", "").isoformat() if dep.get("createTime") else "",
                })
            except Exception:
                pass
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("codedeploy", result)
    return result


@app.post("/secrets_manager")
async def secrets_manager_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("secrets_manager", INVENTORY_TTL)
    if cached:
        return cached

    result = {"secrets": []}
    try:
        sm = _get_client("secretsmanager")
        secrets = sm.list_secrets().get("SecretList", [])
        for s in secrets:
            result["secrets"].append({
                "name": s["Name"],
                "arn": s.get("ARN", ""),
                "description": s.get("Description", ""),
                "createdDate": s.get("CreatedDate", "").isoformat() if s.get("CreatedDate") else "",
                "lastChanged": s.get("LastChangedDate", "").isoformat() if s.get("LastChangedDate") else "",
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("secrets_manager", result)
    return result


@app.post("/parameter_store")
async def parameter_store_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("parameter_store", INVENTORY_TTL)
    if cached:
        return cached

    result = {"parameters": []}
    try:
        ssm = _get_client("ssm")
        params = ssm.describe_parameters().get("Parameters", [])
        for p in params:
            result["parameters"].append({
                "name": p["Name"],
                "type": p.get("Type", ""),
                "tier": p.get("Tier", "Standard"),
                "version": p.get("Version", 0),
                "lastModified": p.get("LastModifiedDate", "").isoformat() if p.get("LastModifiedDate") else "",
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("parameter_store", result)
    return result


@app.post("/acm")
async def acm_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("acm", INVENTORY_TTL)
    if cached:
        return cached

    result = {"certificates": []}
    try:
        acm = _get_client("acm")
        certs = acm.list_certificates().get("CertificateSummaryList", [])
        for c in certs:
            result["certificates"].append({
                "arn": c.get("CertificateArn", ""),
                "domain": c.get("DomainName", ""),
                "status": c.get("Status", ""),
                "type": c.get("Type", ""),
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("acm", result)
    return result


@app.post("/dynamodb")
async def dynamodb_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("dynamodb", INVENTORY_TTL)
    if cached:
        return cached

    result = {"tables": []}
    try:
        ddb = _get_client("dynamodb")
        table_names = ddb.list_tables().get("TableNames", [])
        for name in table_names:
            try:
                desc = ddb.describe_table(TableName=name).get("Table", {})
                result["tables"].append({
                    "name": name,
                    "status": desc.get("TableStatus", ""),
                    "sizeBytes": desc.get("TableSizeBytes", 0),
                    "itemCount": desc.get("ItemCount", 0),
                    "billingMode": desc.get("BillingModeSummary", {}).get("BillingMode", "PROVISIONED"),
                })
            except Exception:
                result["tables"].append({"name": name, "status": "unknown"})
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("dynamodb", result)
    return result


@app.post("/sns")
async def sns_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("sns", INVENTORY_TTL)
    if cached:
        return cached

    result = {"topics": [], "subscriptions": []}
    try:
        sns = _get_client("sns")
        loop = asyncio.get_event_loop()
        topics_resp, subs_resp = await asyncio.gather(
            loop.run_in_executor(EXECUTOR, lambda: sns.list_topics()),
            loop.run_in_executor(EXECUTOR, lambda: sns.list_subscriptions()),
        )
        for t in topics_resp.get("Topics", []):
            arn = t["TopicArn"]
            name = arn.split(":")[-1]
            result["topics"].append({"name": name, "arn": arn})
        for s in subs_resp.get("Subscriptions", []):
            result["subscriptions"].append({
                "arn": s.get("SubscriptionArn", ""),
                "protocol": s.get("Protocol", ""),
                "topicArn": s.get("TopicArn", ""),
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("sns", result)
    return result


@app.post("/sqs")
async def sqs_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("sqs", INVENTORY_TTL)
    if cached:
        return cached

    result = {"queues": []}
    try:
        sqs = _get_client("sqs")
        queue_urls = sqs.list_queues().get("QueueUrls", [])
        for url in queue_urls:
            name = url.split("/")[-1]
            try:
                attrs = sqs.get_queue_attributes(
                    QueueUrl=url,
                    AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible", "CreatedTimestamp"]
                ).get("Attributes", {})
                result["queues"].append({
                    "name": name,
                    "url": url,
                    "messagesAvailable": int(attrs.get("ApproximateNumberOfMessages", 0)),
                    "messagesInFlight": int(attrs.get("ApproximateNumberOfMessagesNotVisible", 0)),
                })
            except Exception:
                result["queues"].append({"name": name, "url": url, "messagesAvailable": 0, "messagesInFlight": 0})
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("sqs", result)
    return result


@app.post("/eventbridge")
async def eventbridge_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("eventbridge", INVENTORY_TTL)
    if cached:
        return cached

    result = {"rules": [], "buses": []}
    try:
        eb = _get_client("events")
        loop = asyncio.get_event_loop()
        rules_resp, buses_resp = await asyncio.gather(
            loop.run_in_executor(EXECUTOR, lambda: eb.list_rules()),
            loop.run_in_executor(EXECUTOR, lambda: eb.list_event_buses()),
        )
        for r in rules_resp.get("Rules", []):
            result["rules"].append({
                "name": r["Name"],
                "state": r.get("State", ""),
                "scheduleExpression": r.get("ScheduleExpression", ""),
                "eventCount": len(r.get("Targets", [])),
            })
        for b in buses_resp.get("EventBuses", []):
            result["buses"].append({
                "name": b["Name"],
                "arn": b.get("Arn", ""),
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("eventbridge", result)
    return result


@app.post("/backup")
async def backup_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("backup", INVENTORY_TTL)
    if cached:
        return cached

    result = {"vaults": [], "plans": [], "jobs": []}
    try:
        bk = _get_client("backup")
        loop = asyncio.get_event_loop()

        def _get_vaults():
            try:
                return bk.describe_backup_vaults().get("BackupVaultList", [])
            except Exception:
                try:
                    return bk.list_backup_vaults().get("BackupVaultList", [])
                except Exception:
                    return []

        vaults, plans_resp, jobs_resp = await asyncio.gather(
            loop.run_in_executor(EXECUTOR, _get_vaults),
            loop.run_in_executor(EXECUTOR, lambda: bk.list_backup_plans()),
            loop.run_in_executor(EXECUTOR, lambda: bk.list_backup_jobs(MaxResults=10)),
        )
        for v in vaults:
            result["vaults"].append({
                "name": v.get("BackupVaultName", ""),
                "arn": v.get("BackupVaultArn", ""),
                "recoveryPoints": v.get("NumberOfRecoveryPoints", 0),
            })
        for p in plans_resp.get("BackupPlansList", []):
            result["plans"].append({
                "id": p.get("BackupPlanId", ""),
                "name": p.get("BackupPlanName", ""),
                "creationDate": p.get("CreationDate", "").isoformat() if p.get("CreationDate") else "",
            })
        for j in jobs_resp.get("BackupJobs", []):
            result["jobs"].append({
                "id": j.get("BackupJobId", ""),
                "state": j.get("State", ""),
                "resource": j.get("ResourceArn", ""),
                "startTime": j.get("CreationDate", "").isoformat() if j.get("CreationDate") else "",
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("backup", result)
    return result


@app.post("/budgets")
async def budgets_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("budgets", INVENTORY_TTL)
    if cached:
        return cached

    result = {"budgets": []}
    try:
        ce = _get_client("ce")
        try:
            budgets = ce.describe_budgets().get("Budgets", [])
        except AttributeError:
            budgets = []
        for b in budgets:
            result["budgets"].append({
                "name": b.get("BudgetName", ""),
                "type": b.get("BudgetType", ""),
                "timeUnit": b.get("TimeUnit", ""),
                "amount": b.get("BudgetLimit", {}).get("Amount", "0"),
                "spent": b.get("CalculatedSpend", {}).get("ActualSpend", {}).get("Amount", "0"),
            })
    except ClientError as e:
        result["error"] = str(e)

    _set_cache("budgets", result)
    return result


# ============================================================
# BATCH DASHBOARD ENDPOINT
# ============================================================

@app.post("/dashboard")
async def dashboard(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"))
    cached = _cached("dashboard", METRICS_TTL)
    if cached:
        return cached

    ec2_data, s3_data, lambda_data, rds_data, iam_data, vpc_data, cost_data, security_data, activity_data = \
        await asyncio.gather(
            ec2_instances(request),
            s3_buckets(request),
            lambda_functions(request),
            rds_instances(request),
            iam_info(request),
            vpc_info(request),
            cost_info(request),
            security_findings(request),
            activity_timeline(request),
        )

    result = {
        "ec2": ec2_data, "s3": s3_data, "lambda": lambda_data, "rds": rds_data,
        "iam": iam_data, "vpc": vpc_data, "cost": cost_data, "security": security_data,
        "activity": activity_data,
    }

    _set_cache("dashboard", result)
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8085)
