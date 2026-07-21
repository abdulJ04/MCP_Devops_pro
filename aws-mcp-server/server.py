import os
import re
import time
import asyncio
import logging
import json
import threading
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

# Cost Alert System
from models import init_db
from cost_alerts import router as cost_alerts_router
from cost_reports import router as cost_reports_router
from scheduler import start_scheduler, stop_scheduler

app = FastAPI(title="AWS MCP Server", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler — prevents server crashes from unhandled errors
# Does NOT catch HTTPException (FastAPI handles those natively)
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    from fastapi.exceptions import HTTPException
    from starlette.responses import JSONResponse
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    logger.error(f"Unhandled error on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=200,
        content={"error": str(exc)},
    )

# Register cost alert routes
app.include_router(cost_alerts_router)
app.include_router(cost_reports_router)


@app.on_event("startup")
async def startup_event():
    init_db()
    start_scheduler()
    logger.info("Cost alert system initialized (SQLite DB + APScheduler)")


@app.on_event("shutdown")
async def shutdown_event():
    stop_scheduler()
    logger.info("Cost alert scheduler stopped")

EXECUTOR = ThreadPoolExecutor(max_workers=20)
_creds_lock = threading.RLock()

_credentials: Dict[str, Any] = {
    "aws_access_key": "test",
    "aws_secret_key": "test",
    "aws_region": "us-east-1",
    "endpoint_url": "http://localhost:4566",
    "use_localstack": True,
}
_sessions: Dict[str, Any] = {}
_cache: Dict[str, Dict[str, Any]] = {}
METRICS_TTL = 30
INVENTORY_TTL = 300
SESSION_TIMEOUT = 3600  # 1 hour default, configurable
_session_created_at: float = 0


def _get_session() -> boto3.Session:
    with _creds_lock:
        if "default" not in _sessions:
            access_key = _credentials.get("aws_access_key", "")
            secret_key = _credentials.get("aws_secret_key", "")
            if not access_key or not secret_key:
                raise HTTPException(status_code=401, detail="No AWS credentials configured. Please login to the dashboard first.")
            session_kwargs = {
                "aws_access_key_id": access_key,
                "aws_secret_access_key": secret_key,
                "region_name": _credentials.get("aws_region", "us-east-1"),
            }
            if _credentials.get("aws_session_token"):
                session_kwargs["aws_session_token"] = _credentials["aws_session_token"]
            logger.info(f"Creating session: key={access_key[:8]}..., localstack={_credentials.get('use_localstack', False)}")
            _sessions["default"] = boto3.Session(**session_kwargs)
        return _sessions["default"]


def _get_client(service: str):
    with _creds_lock:
        kwargs = {"region_name": _credentials.get("aws_region", "us-east-1")}
        if _credentials.get("use_localstack"):
            kwargs["endpoint_url"] = _credentials.get("endpoint_url", "http://localhost:4566")
            kwargs["config"] = boto3.session.Config(connect_timeout=5, read_timeout=10)
        else:
            kwargs["config"] = boto3.session.Config(connect_timeout=5, read_timeout=30, retries={"max_attempts": 2})
    return _get_session().client(service, **kwargs)


def _ensure_credentials(access_key=None, secret_key=None, session_token=None, aws_region=None, use_localstack=None):
    global _credentials, _sessions, _session_created_at

    with _creds_lock:
        # Check session timeout
        if _session_created_at > 0 and time.time() - _session_created_at > SESSION_TIMEOUT:
            logger.warning("Session expired, clearing credentials")
            _credentials.clear()
            _sessions.clear()
            _cache.clear()
            _session_created_at = 0
            raise HTTPException(status_code=401, detail="Session expired. Please reconnect.")

        # If explicitly told to use LocalStack, keep LocalStack mode
        if use_localstack is True:
            if not _credentials.get("use_localstack") or "default" not in _sessions:
                logger.info("Setting up LocalStack mode")
                _credentials = {
                    "aws_access_key": access_key or "test",
                    "aws_secret_key": secret_key or "test",
                    "aws_region": aws_region or "us-east-1",
                    "endpoint_url": "http://localhost:4566",
                    "use_localstack": True,
                }
                _sessions.clear()
            return

        # If explicitly told NOT to use LocalStack (use_localstack is False or None with live keys)
        if use_localstack is False or (access_key and secret_key and use_localstack is not True):
            # Clear LocalStack session if switching to live
            if _credentials.get("use_localstack"):
                logger.info("Switching from LocalStack to live AWS")
                _sessions.clear()
                _cache.clear()

            if access_key and secret_key:
                if (_credentials.get("aws_access_key") != access_key or
                    _credentials.get("aws_secret_key") != secret_key or
                    _credentials.get("aws_session_token") != session_token or
                    _credentials.get("use_localstack", False)):
                    logger.info(f"Setting live credentials: key={access_key[:8]}..., region={aws_region}")
                    _credentials = {
                        "aws_access_key": access_key,
                        "aws_secret_key": secret_key,
                        "aws_session_token": session_token,
                        "aws_region": aws_region or "us-east-1",
                        "use_localstack": False,
                    }
                    _sessions.clear()
                    _session_created_at = time.time()
            return

        # Keep using existing LocalStack defaults
        if _credentials.get("use_localstack"):
            return


@app.post("/refresh")
async def refresh_cache():
    """Clear cache so next requests fetch fresh data from AWS."""
    with _creds_lock:
        _cache.clear()
    return {"success": True, "message": "Cache cleared"}


@app.post("/set_timeout")
async def set_timeout(request: dict = {}):
    """Set session timeout in seconds."""
    global SESSION_TIMEOUT
    timeout = request.get("timeout", 3600)
    SESSION_TIMEOUT = int(timeout)
    return {"success": True, "timeout": SESSION_TIMEOUT}


@app.post("/disconnect")
async def disconnect():
    """Clear credentials and session — called when dashboard disconnects."""
    global _credentials, _sessions, _session_created_at
    with _creds_lock:
        _credentials = {
            "aws_access_key": "test",
            "aws_secret_key": "test",
            "aws_region": "us-east-1",
            "endpoint_url": "http://localhost:4566",
            "use_localstack": True,
        }
        _sessions.clear()
        _cache.clear()
        _session_created_at = 0
    logger.info("Dashboard disconnected — credentials reset to LocalStack defaults")
    return {"success": True, "message": "Disconnected. MCP server will require re-authentication."}


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
    global _credentials, _sessions, _session_created_at

    with _creds_lock:
        if req.use_localstack:
            try:
                test_session_kwargs = {
                    "aws_access_key_id": "test",
                    "aws_secret_access_key": "test",
                    "region_name": req.get_region(),
                }
                test_session = boto3.Session(**test_session_kwargs)
                sts = test_session.client("sts", endpoint_url=req.endpoint_url or "http://localhost:4566",
                                          config=boto3.session.Config(connect_timeout=5, read_timeout=10, retries={"max_attempts": 1}))
                identity = sts.get_caller_identity()
                _credentials = {
                    "aws_access_key": "test",
                    "aws_secret_key": "test",
                    "aws_region": req.get_region(),
                    "use_localstack": True,
                    "endpoint_url": req.endpoint_url or "http://localhost:4566",
                }
                _sessions.clear()
                _session_created_at = time.time()
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

        try:
            session = boto3.Session(
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                aws_session_token=session_token,
                region_name=aws_region,
            )
            sts = session.client("sts", config=boto3.session.Config(connect_timeout=5, read_timeout=10, retries={"max_attempts": 1}))
            identity = sts.get_caller_identity()
            logger.info(f"Auth success: Account={identity.get('Account')}, ARN={identity.get('Arn')}")
            _credentials = {
                "aws_access_key": access_key,
                "aws_secret_key": secret_key,
                "aws_session_token": session_token,
                "aws_region": aws_region,
                "use_localstack": False,
            }
            _sessions.clear()
            _session_created_at = time.time()
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


@app.get("/sync-credentials")
async def sync_credentials():
    """Return current credentials for MCP server to sync with dashboard."""
    with _creds_lock:
        connected = bool(_credentials.get("aws_access_key") or _credentials.get("use_localstack"))
        return {
            "connected": connected,
            "use_localstack": _credentials.get("use_localstack", False),
            "aws_access_key": _credentials.get("aws_access_key", ""),
            "aws_secret_key": _credentials.get("aws_secret_key", ""),
            "aws_region": _credentials.get("aws_region", "us-east-1"),
            "endpoint_url": _credentials.get("endpoint_url", ""),
            "aws_session_token": _credentials.get("aws_session_token", ""),
        }


# ============================================================
# EXISTING SERVICES (with fixed data mappings)
# ============================================================

@app.post("/ec2")
async def ec2_instances(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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

        loop = asyncio.get_running_loop()
        tasks = [loop.run_in_executor(EXECUTOR, _get_instance_metrics, inst) for inst in all_instances]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, dict):
                result["instances"].append(r)

    except Exception as e:
        logger.error(f"EC2 error: {e}")
        result["error"] = str(e)

    _set_cache("ec2", result)
    return result


@app.post("/s3")
async def s3_buckets(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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

        loop = asyncio.get_running_loop()
        tasks = [loop.run_in_executor(EXECUTOR, _get_bucket_details, b) for b in buckets]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, dict):
                result["buckets"].append(r)

    except Exception as e:
        result["error"] = str(e)

    _set_cache("s3", result)
    return result


@app.post("/lambda")
async def lambda_functions(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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

        loop = asyncio.get_running_loop()
        tasks = [loop.run_in_executor(EXECUTOR, _get_function_metrics, fn) for fn in functions]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, dict):
                result["functions"].append(r)

    except Exception as e:
        result["error"] = str(e)

    _set_cache("lambda", result)
    return result


@app.post("/rds")
async def rds_instances(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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

        loop = asyncio.get_running_loop()
        tasks = [loop.run_in_executor(EXECUTOR, _get_db_metrics, db) for db in instances]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, dict):
                result["databases"].append(r)

    except Exception as e:
        result["error"] = str(e)

    _set_cache("rds", result)
    return result


@app.post("/iam")
async def iam_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
                        age = (datetime.now(timezone.utc) - create).days
                        if age > item["accessKeyAge"]:
                            item["accessKeyAge"] = age
            except Exception:
                pass
            return item

        loop = asyncio.get_running_loop()
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

    except Exception as e:
        result["error"] = str(e)

    _set_cache("iam", result)
    return result


@app.post("/vpc")
async def vpc_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("vpc", INVENTORY_TTL)
    if cached:
        return cached

    client = _get_client("ec2")
    result = {"vpcs": [], "securityGroups": []}

    try:
        loop = asyncio.get_running_loop()
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

    except Exception as e:
        result["error"] = str(e)

    _set_cache("vpc", result)
    return result


@app.post("/cost")
async def cost_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("cost", METRICS_TTL)
    if cached:
        return cached

    # Use mock data for LocalStack (Cost Explorer not supported in free tier)
    if _credentials.get("use_localstack"):
        from mock_cost import get_mock_cost_data
        result = get_mock_cost_data()
        _set_cache("cost", result)
        return result

    result = {"today": 0, "yesterday": 0, "month": 0, "forecast": 0, "daily": [], "byService": [], "byRegion": []}

    try:
        ce = _get_client("ce")
        loop = asyncio.get_running_loop()

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

    except Exception as e:
        result["error"] = str(e)

    _set_cache("cost", result)
    return result


@app.post("/security")
async def security_findings(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("security", METRICS_TTL)
    if cached:
        return cached

    result = {"findings": []}
    finding_id = 1

    try:
        loop = asyncio.get_running_loop()
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

    except Exception as e:
        result["error"] = str(e)

    _set_cache("security", result)
    return result


@app.post("/activity")
async def activity_timeline(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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

    except Exception as e:
        result["error"] = str(e)

    _set_cache("activity", result)
    return result


# ============================================================
# 23 NEW SERVICE ENDPOINTS
# ============================================================

@app.post("/ebs")
async def ebs_volumes(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("ebs", INVENTORY_TTL)
    if cached:
        return cached

    result = {"volumes": [], "snapshots": []}
    try:
        ec2 = _get_client("ec2")
        loop = asyncio.get_running_loop()
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("ebs", result)
    return result


@app.post("/route53")
async def route53_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("route53", INVENTORY_TTL)
    if cached:
        return cached

    result = {"zones": [], "health_checks": []}
    try:
        r53 = _get_client("route53")
        loop = asyncio.get_running_loop()
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("route53", result)
    return result


@app.post("/elb")
async def elb_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("elb", INVENTORY_TTL)
    if cached:
        return cached

    result = {"load_balancers": [], "target_groups": []}
    try:
        elb = _get_client("elbv2")
        loop = asyncio.get_running_loop()
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("elb", result)
    return result


@app.post("/auto_scaling")
async def auto_scaling_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("auto_scaling", result)
    return result


@app.post("/cloudwatch_dash")
async def cloudwatch_dashboards(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("cloudwatch_dash", METRICS_TTL)
    if cached:
        return cached

    result = {"dashboards": [], "alarms": []}
    try:
        cw = _get_client("cloudwatch")
        loop = asyncio.get_running_loop()
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("cloudwatch_dash", result)
    return result


@app.post("/ssm")
async def ssm_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("ssm", INVENTORY_TTL)
    if cached:
        return cached

    result = {"documents": [], "parameters": []}
    try:
        ssm = _get_client("ssm")
        loop = asyncio.get_running_loop()
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("ssm", result)
    return result


@app.post("/ecr")
async def ecr_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("ecr", result)
    return result


@app.post("/ecs")
async def ecs_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("ecs", result)
    return result


@app.post("/eks")
async def eks_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("eks", result)
    return result


@app.post("/cloudformation")
async def cloudformation_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("cloudformation", result)
    return result


@app.post("/codepipeline")
async def codepipeline_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("codepipeline", result)
    return result


@app.post("/codebuild")
async def codebuild_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("codebuild", INVENTORY_TTL)
    if cached:
        return cached

    result = {"projects": [], "builds": []}
    try:
        cb = _get_client("codebuild")
        projects = cb.list_projects().get("projects", [])
        for name in projects:
            result["projects"].append({"name": name})
    except Exception as e:
        result["error"] = str(e)

    _set_cache("codebuild", result)
    return result


@app.post("/codedeploy")
async def codedeploy_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("codedeploy", result)
    return result


@app.post("/secrets_manager")
async def secrets_manager_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("secrets_manager", result)
    return result


@app.post("/parameter_store")
async def parameter_store_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("parameter_store", result)
    return result


@app.post("/acm")
async def acm_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("acm", result)
    return result


@app.post("/dynamodb")
async def dynamodb_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("dynamodb", result)
    return result


@app.post("/sns")
async def sns_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("sns", INVENTORY_TTL)
    if cached:
        return cached

    result = {"topics": [], "subscriptions": []}
    try:
        sns = _get_client("sns")
        loop = asyncio.get_running_loop()
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("sns", result)
    return result


@app.post("/sqs")
async def sqs_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("sqs", result)
    return result


@app.post("/eventbridge")
async def eventbridge_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("eventbridge", INVENTORY_TTL)
    if cached:
        return cached

    result = {"rules": [], "buses": []}
    try:
        eb = _get_client("events")
        loop = asyncio.get_running_loop()
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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("eventbridge", result)
    return result


@app.post("/backup")
async def backup_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("backup", INVENTORY_TTL)
    if cached:
        return cached

    result = {"vaults": [], "plans": [], "jobs": []}
    try:
        bk = _get_client("backup")
        loop = asyncio.get_running_loop()

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
    except Exception as e:
        result["error"] = str(e)

    _set_cache("backup", result)
    return result


@app.post("/budgets")
async def budgets_info(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
    cached = _cached("budgets", INVENTORY_TTL)
    if cached:
        return cached

    result = {"budgets": []}

    # Use mock budgets for LocalStack
    if _credentials.get("use_localstack", False):
        from mock_cost import get_mock_budgets
        result["budgets"] = get_mock_budgets()
        _set_cache("budgets", result)
        return result

    try:
        sts = _get_client("sts")
        identity = sts.get_caller_identity()
        account_id = identity.get("Account", "")
        
        budgets_client = _get_client("budgets")
        try:
            budgets = budgets_client.describe_budgets(AccountId=account_id).get("Budgets", [])
        except (AttributeError, ClientError):
            budgets = []
        for b in budgets:
            result["budgets"].append({
                "name": b.get("BudgetName", ""),
                "type": b.get("BudgetType", ""),
                "timeUnit": b.get("TimeUnit", ""),
                "amount": b.get("BudgetLimit", {}).get("Amount", "0"),
                "spent": b.get("CalculatedSpend", {}).get("ActualSpend", {}).get("Amount", "0"),
            })
    except Exception as e:
        result["error"] = str(e)

    _set_cache("budgets", result)
    return result


# ============================================================
# BATCH DASHBOARD ENDPOINT
# ============================================================

@app.post("/dashboard")
async def dashboard(request: dict = {}):
    _ensure_credentials(request.get("accessKeyId"), request.get("secretAccessKey"), request.get("sessionToken"), request.get("region"), request.get("use_localstack"))
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


# ============================================================
# LOCAL AI ANALYSIS ENGINE (No LLM needed - Rule-based intelligence)
# ============================================================

async def _gather_all_aws_data(request: dict = {}):
    """Gather all AWS data in parallel for analysis."""
    try:
        ec2_data, s3_data, lambda_data, rds_data, sec_data, iam_data, cost_data = await asyncio.gather(
            ec2_instances(request), s3_buckets(request),
            lambda_functions(request), rds_instances(request),
            security_findings(request), iam_info(request),
            cost_info(request),
            return_exceptions=True
        )
    except Exception:
        ec2_data = await ec2_instances(request)
        s3_data = {"buckets": []}
        lambda_data = {"functions": []}
        rds_data = {"databases": []}
        sec_data = {"findings": []}
        iam_data = {"users": []}
        cost_data = {"costs": {}}

    def safe(d, default=None):
        return d if not isinstance(d, Exception) else (default or {})

    return {
        "ec2": safe(ec2_data, {"instances": []}),
        "s3": safe(s3_data, {"buckets": []}),
        "lambda": safe(lambda_data, {"functions": []}),
        "rds": safe(rds_data, {"databases": []}),
        "iam": safe(iam_data, {"users": []}),
        "cost": safe(cost_data, {"costs": {}}),
        "security": safe(sec_data, {"findings": []}),
    }


def _analyze_security(data: dict) -> str:
    """Deep security analysis with recommendations."""
    findings = data["security"].get("findings", [])
    iam_users = data["iam"].get("users", [])
    s3_buckets = data["s3"].get("buckets", [])
    instances = data["ec2"].get("instances", [])

    report = "# Security Analysis Report\n\n"

    # Score system
    score = 100
    issues = []
    recommendations = []

    # 1. Security Group Analysis (from findings)
    open_sgs = []
    for f in findings:
        if "security group" in f.get("title", "").lower() and "0.0.0.0/0" in f.get("title", ""):
            open_sgs.append((f.get("resource", "unknown"), "open"))
            score -= 15

    if open_sgs:
        report += "## Security Groups - Open to World\n"
        report += f"**Risk Level: HIGH** | Score Impact: -{len(open_sgs)*15}\n\n"
        for sg_name, port in open_sgs:
            report += f"- **{sg_name}** - Port `{port}` open to `0.0.0.0/0`\n"
        report += "\n**Recommendation:** Restrict to specific CIDR ranges. Use VPN or bastion hosts for admin access.\n\n"
        issues.append(f"{len(open_sgs)} security groups open to internet")
        recommendations.append("Restrict security group rules to specific IP ranges")
    else:
        report += "## Security Groups\n"
        report += "**Status: OK** - No overly permissive rules found.\n\n"

    # 2. S3 Security
    unencrypted_buckets = []
    public_buckets = []
    for bucket in s3_buckets:
        name = bucket.get("name", "")
        # Check encryption from findings
        for f in findings:
            if name in f.get("resource", "") and "no encryption" in f.get("title", "").lower():
                unencrypted_buckets.append(name)
            if name in f.get("resource", "") and "public access" in f.get("title", "").lower():
                public_buckets.append(name)

    if unencrypted_buckets:
        report += "## S3 Encryption\n"
        report += f"**Risk Level: HIGH** | {len(unencrypted_buckets)} buckets unencrypted\n\n"
        for b in unencrypted_buckets[:5]:
            report += f"- `{b}` - No server-side encryption\n"
        report += "\n**Recommendation:** Enable AES-256 or KMS encryption on all buckets.\n\n"
        score -= len(unencrypted_buckets) * 10
        issues.append(f"{len(unencrypted_buckets)} S3 buckets without encryption")
        recommendations.append("Enable server-side encryption on all S3 buckets")

    if public_buckets:
        report += "## S3 Public Access\n"
        report += f"**Risk Level: CRITICAL** | {len(public_buckets)} publicly accessible buckets\n\n"
        for b in public_buckets[:5]:
            report += f"- `{b}` - Public access block not configured\n"
        report += "\n**Recommendation:** Enable all 4 public access block settings on every bucket.\n\n"
        score -= len(public_buckets) * 20
        issues.append(f"{len(public_buckets)} S3 buckets publicly accessible")
        recommendations.append("Enable public access block on all S3 buckets")

    # 3. IAM Analysis
    if iam_users:
        report += "## IAM Users\n"
        report += f"**Total Users:** {len(iam_users)}\n\n"
        mfa_disabled = [u for u in iam_users if not u.get("mfaEnabled", False)]
        if mfa_disabled:
            report += f"**Risk Level: HIGH** | {len(mfa_disabled)} users without MFA\n\n"
            for u in mfa_disabled[:5]:
                report += f"- `{u.get('name', 'unknown')}` - MFA not enabled\n"
            report += "\n**Recommendation:** Enable MFA on all IAM users, especially admin accounts.\n\n"
            score -= len(mfa_disabled) * 12
            issues.append(f"{len(mfa_disabled)} IAM users without MFA")
            recommendations.append("Enable MFA on all IAM users")
        else:
            report += "**MFA Status:** All users have MFA enabled\n\n"

    # 4. Instance Security
    public_instances = [i for i in instances if i.get("public_ip")]
    if public_instances:
        report += "## EC2 Public Exposure\n"
        report += f"**Risk Level: MEDIUM** | {len(public_instances)} instances with public IPs\n\n"
        for i in public_instances[:5]:
            report += f"- `{i.get('name', i['id'])}` - Public IP: `{i['public_ip']}`\n"
        report += "\n**Recommendation:** Use private subnets + NAT gateway. Avoid public IPs unless required.\n\n"
        score -= len(public_instances) * 5
        issues.append(f"{len(public_instances)} EC2 instances publicly exposed")
        recommendations.append("Move instances to private subnets, use NAT gateway")

    # Final score
    score = max(0, score)
    emoji = "🟢" if score >= 80 else "🟡" if score >= 50 else "🔴"
    report = f"## Overall Security Score: {emoji} {score}/100\n\n" + report

    if issues:
        report += "---\n\n## Summary of Issues\n"
        for i, issue in enumerate(issues, 1):
            report += f"{i}. {issue}\n"
        report += "\n## Priority Recommendations\n"
        for i, rec in enumerate(recommendations, 1):
            report += f"{i}. {rec}\n"

    return report


def _analyze_cost(data: dict) -> str:
    """Cost optimization analysis."""
    instances = data["ec2"].get("instances", [])
    s3_buckets = data["s3"].get("buckets", [])
    lambda_funcs = data["lambda"].get("functions", [])
    rds_dbs = data["rds"].get("databases", [])

    report = "# Cost Optimization Analysis\n\n"
    score = 100
    recommendations = []

    # 1. EC2 Cost Analysis
    running_instances = [i for i in instances if i.get("state") == "running"]
    stopped_instances = [i for i in instances if i.get("state") == "stopped"]

    if stopped_instances:
        report += "## EC2 - Stopped Instances\n"
        report += f"**Savings Opportunity:** {len(stopped_instances)} instances still incurring EBS charges\n\n"
        for i in stopped_instances[:5]:
            report += f"- `{i.get('name', i['id'])}` ({i.get('type', 'N/A')}) - Stopped since launch\n"
        report += "\n**Action:** Terminate unused stopped instances to stop EBS charges.\n\n"
        recommendations.append("Terminate stopped instances to save on EBS storage")

    if running_instances:
        instance_types = {}
        for i in running_instances:
            t = i.get("type", "unknown")
            instance_types[t] = instance_types.get(t, 0) + 1

        report += "## EC2 - Running Instances\n"
        report += f"**Total Running:** {len(running_instances)}\n\n"
        for t, count in instance_types.items():
            report += f"- `{t}` x {count}\n"

        # Check for t2/t3 burstable (often overpaying)
        burstable = [i for i in running_instances if i.get("type", "").startswith(("t2.", "t3."))]
        if burstable:
            report += f"\n**Note:** {len(burstable)} burstable instances. If consistently high CPU, consider switching to fixed-performance instances.\n"
            recommendations.append("Review burstable instances - switch to fixed-performance if CPU consistently high")
            score -= 10

        report += "\n"

    # 2. RDS Cost
    if rds_dbs:
        report += "## RDS Databases\n"
        report += f"**Total:** {len(rds_dbs)} databases\n\n"
        multi_az = [db for db in rds_dbs if db.get("multiAZ")]
        if multi_az:
            report += f"- {len(multi_az)} Multi-AZ deployments (2x cost)\n"
            report += "  **Recommendation:** Use Multi-AZ only for production. Dev/test can use single-AZ.\n"
            recommendations.append("Use single-AZ for non-production RDS instances")
            score -= 5
        report += "\n"

    # 3. S3 Lifecycle
    if s3_buckets:
        report += "## S3 Storage\n"
        report += f"**Total Buckets:** {len(s3_buckets)}\n\n"
        report += "**Recommendation:** Implement lifecycle policies to move old data to Glacier.\n"
        recommendations.append("Add S3 lifecycle policies to move old objects to cheaper storage tiers")
        score -= 5

    # 4. Lambda Optimization
    if lambda_funcs:
        report += "## Lambda Functions\n"
        report += f"**Total Functions:** {len(lambda_funcs)}\n\n"
        cold_starts = [f for f in lambda_funcs if f.get("state") == "Failed"]
        if cold_starts:
            report += f"- {len(cold_starts)} functions in failed state\n"
            recommendations.append("Review and fix failed Lambda functions")
            score -= 10
        report += "\n"

    # Summary
    score = max(0, score)
    report = f"## Cost Score: {'🟢' if score >= 80 else '🟡' if score >= 50 else '🔴'} {score}/100\n\n" + report

    if recommendations:
        report += "---\n\n## Cost Saving Recommendations\n"
        for i, rec in enumerate(recommendations, 1):
            report += f"{i}. {rec}\n"

    estimated = len(stopped_instances) * 5 + len([i for i in running_instances if "t2" in i.get("type","")]) * 10
    if estimated:
        report += f"\n**Estimated Monthly Savings:** ~${estimated}+ by optimizing these resources.\n"

    return report


def _analyze_architecture(data: dict) -> str:
    """Architecture review and best practices."""
    instances = data["ec2"].get("instances", [])
    s3_buckets = data["s3"].get("buckets", [])
    lambda_funcs = data["lambda"].get("functions", [])
    rds_dbs = data["rds"].get("databases", [])
    findings = data["security"].get("findings", [])

    report = "# Architecture Review\n\n"
    score = 100
    issues = []
    recommendations = []

    # 1. High Availability Check
    if instances:
        azs = set(i.get("az", "") for i in instances if i.get("az"))
        if len(azs) < 2 and len(instances) > 1:
            report += "## High Availability\n"
            report += "**Risk: LOW** | All instances in single AZ\n\n"
            report += f"Instances spread across: {', '.join(azs) or 'N/A'}\n\n"
            report += "**Recommendation:** Distribute instances across multiple AZs for fault tolerance.\n\n"
            score -= 20
            issues.append("All EC2 instances in single availability zone")
            recommendations.append("Distribute EC2 instances across multiple AZs")
        elif len(azs) >= 2:
            report += "## High Availability\n"
            report += f"**Status: OK** - Instances across {len(azs)} AZs\n\n"
        else:
            report += "## High Availability\n"
            report += f"**Info:** Single instance, AZ spread N/A\n\n"

    # 2. Database Redundancy
    if rds_dbs:
        single_az_rds = [db for db in rds_dbs if not db.get("multiAZ")]
        if single_az_rds:
            report += "## Database Redundancy\n"
            report += f"**Risk: MEDIUM** | {len(single_az_rds)} RDS instances without Multi-AZ\n\n"
            for db in single_az_rds[:3]:
                report += f"- `{db.get('name', 'unknown')}` - Single-AZ\n"
            report += "\n**Recommendation:** Enable Multi-AZ for production databases.\n\n"
            score -= 15
            issues.append(f"{len(single_az_rds)} RDS instances without Multi-AZ")
            recommendations.append("Enable Multi-AZ for production RDS instances")

    # 3. Network Architecture (from findings)
    open_sgs = len([f for f in findings if "security group" in f.get("title", "").lower() and "0.0.0.0/0" in f.get("title", "")])

    if open_sgs > 5:
        report += "## Network Architecture\n"
        report += f"**Risk: HIGH** | {open_sgs} overly permissive security group rules\n\n"
        report += "**Recommendation:** Implement defense-in-depth:\n"
        report += "1. Use private subnets for application tier\n"
        report += "2. Bastion host or SSM Session Manager for admin\n"
        report += "3. WAF for web-facing services\n\n"
        score -= 20
        issues.append("Excessive open security group rules")
        recommendations.append("Implement network segmentation and least-privilege access")
    elif open_sgs > 0:
        report += "## Network Architecture\n"
        report += f"**Risk: LOW** | {open_sgs} open rules (review recommended)\n\n"

    # 4. Serverless Adoption
    if instances and not lambda_funcs:
        report += "## Serverless Opportunities\n"
        report += "**Potential:** No Lambda functions found\n\n"
        report += "**Recommendation:** Consider converting suitable workloads to Lambda:\n"
        report += "- API backends\n"
        report += "- Scheduled tasks\n"
        report += "- Event-driven processing\n\n"
        recommendations.append("Evaluate serverless architecture for suitable workloads")

    # 5. Infrastructure as Code
    report += "## Infrastructure as Code\n"
    report += "**Recommendation:**\n"
    report += "- Use CloudFormation/Terraform for all resources\n"
    report += "- Implement CI/CD pipelines\n"
    report += "- Use AWS Config for compliance monitoring\n\n"
    recommendations.append("Implement Infrastructure as Code with CloudFormation/Terraform")

    # Summary
    score = max(0, score)
    report = f"## Architecture Score: {'🟢' if score >= 80 else '🟡' if score >= 50 else '🔴'} {score}/100\n\n" + report

    if issues:
        report += "---\n\n## Issues Found\n"
        for i, issue in enumerate(issues, 1):
            report += f"{i}. {issue}\n"
        report += "\n## Recommendations\n"
        for i, rec in enumerate(recommendations, 1):
            report += f"{i}. {rec}\n"

    return report


def _analyze_overall(data: dict) -> str:
    """Comprehensive health check combining all analyses."""
    sec_report = _analyze_security(data)
    cost_report = _analyze_cost(data)
    arch_report = _analyze_architecture(data)

    # Extract scores
    import re
    sec_score = re.search(r'(\d+)/100', sec_report)
    cost_score = re.search(r'(\d+)/100', cost_report)
    arch_score = re.search(r'(\d+)/100', arch_report)

    sec_val = int(sec_score.group(1)) if sec_score else 0
    cost_val = int(cost_score.group(1)) if cost_score else 0
    arch_val = int(arch_score.group(1)) if arch_score else 0
    overall = (sec_val + cost_val + arch_val) // 3

    emoji = "🟢" if overall >= 80 else "🟡" if overall >= 50 else "🔴"

    report = f"# Infrastructure Health Report\n\n"
    report += f"## Overall Score: {emoji} {overall}/100\n\n"
    report += f"| Category | Score |\n|----------|-------|\n"
    report += f"| Security | {'🟢' if sec_val >= 80 else '🟡' if sec_val >= 50 else '🔴'} {sec_val}/100 |\n"
    report += f"| Cost Optimization | {'🟢' if cost_val >= 80 else '🟡' if cost_val >= 50 else '🔴'} {cost_val}/100 |\n"
    report += f"| Architecture | {'🟢' if arch_val >= 80 else '🟡' if arch_val >= 50 else '🔴'} {arch_val}/100 |\n\n"

    report += "---\n\n"
    report += "## Security Summary\n"
    # Extract just the findings from security report
    for line in sec_report.split("\n"):
        if line.startswith("- ") or "Risk Level" in line or "Status:" in line:
            report += f"  {line}\n"

    report += "\n## Cost Summary\n"
    for line in cost_report.split("\n"):
        if line.startswith("- ") or "Savings" in line or "Total" in line:
            report += f"  {line}\n"

    report += "\n## Architecture Summary\n"
    for line in arch_report.split("\n"):
        if line.startswith("- ") or "Risk:" in line or "Status:" in line or "Potential:" in line:
            report += f"  {line}\n"

    report += "\n---\n\n**Commands for detailed analysis:**\n"
    report += "- `security analysis` - Full security report\n"
    report += "- `cost analysis` - Cost optimization report\n"
    report += "- `architecture review` - Architecture best practices\n"

    return report


# ============================================================
# GROQ FREE API INTEGRATION (Fast, Free LLM)
# ============================================================

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

async def _groq_chat(message: str, context: str = "") -> str:
    """Use Groq free API (llama3-8b) for complex queries."""
    if not GROQ_API_KEY:
        return ""

    try:
        import httpx
        system_prompt = """You are a senior DevOps/AWS cloud architect assistant.
You help users manage AWS infrastructure, analyze security, optimize costs, and recommend best practices.
Be concise, use bullet points, and provide actionable recommendations.
If you need specific AWS data, mention which AWS CLI/API command to use."""

        user_msg = message
        if context:
            user_msg = f"Current AWS Infrastructure:\n{context}\n\nUser Question: {message}"

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": "llama3-8b-instruct",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_msg}
                    ],
                    "max_tokens": 1024,
                    "temperature": 0.3,
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"]
    except Exception as e:
        logging.warning(f"Groq API error: {e}")
    return ""


# ============================================================
# OLLAMA LOCAL LLM INTEGRATION (Fast, Free, No API Key)
# ============================================================

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:1.5b")

async def _ollama_chat(message: str, context: str = "") -> str:
    """Use local Ollama LLM for complex queries."""
    try:
        import httpx
        system_prompt = """You are a senior DevOps/AWS cloud architect assistant.
You help users manage AWS infrastructure, analyze security, optimize costs, and recommend best practices.
Be concise, use bullet points, and provide actionable recommendations.
Answer in 3-5 sentences max. Use markdown formatting."""

        user_msg = message
        if context:
            user_msg = f"Current AWS Infrastructure:\n{context}\n\nUser Question: {message}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_msg}
                    ],
                    "stream": False,
                    "options": {
                        "temperature": 0.3,
                        "num_predict": 512,
                        "num_ctx": 4096,
                    }
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("message", {}).get("content", "")
    except Exception as e:
        logging.warning(f"Ollama error: {e}")
    return ""


# ============================================================
# ANTHROPIC CLAUDE API INTEGRATION (Paid - Best Quality)
# ============================================================

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

async def _claude_chat(message: str, context: str = "") -> str:
    """Use Anthropic Claude API for complex queries (requires paid API key)."""
    if not ANTHROPIC_API_KEY:
        return ""

    try:
        import httpx
        system_prompt = """You are a senior DevOps/AWS cloud architect assistant.
You help users manage AWS infrastructure, analyze security, optimize costs, and recommend best practices.
Be concise, use bullet points, and provide actionable recommendations.
Answer in 3-5 sentences max. Use markdown formatting."""

        user_msg = message
        if context:
            user_msg = f"Current AWS Infrastructure:\n{context}\n\nUser Question: {message}"

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-3-5-sonnet-20241022",
                    "max_tokens": 1024,
                    "system": system_prompt,
                    "messages": [
                        {"role": "user", "content": user_msg}
                    ],
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                return data.get("content", [{}])[0].get("text", "")
    except Exception as e:
        logging.warning(f"Anthropic API error: {e}")
    return ""


# ============================================================
# AI CHAT ENDPOINT - Smart Command Parsing + MCP Execution
# ============================================================

@app.post("/chat")
async def chat(request: dict = {}):
    message = request.get("message", "").strip()
    if not message:
        return {"response": "Please type a command or question.", "tools_used": []}

    msg = message.lower()
    tools_used = []
    response = ""

    try:
        # AWS EC2 Commands
        if any(w in msg for w in ["list ec2", "show ec2", "ec2 instances", "instances", "list servers", "show servers"]):
            tools_used.append("list_ec2_instances")
            data = await ec2_instances(request)
            instances = data.get("instances", [])
            if not instances:
                response = "No EC2 instances found.\n\n"
            else:
                running = [i for i in instances if i.get("state") == "running"]
                stopped = [i for i in instances if i.get("state") == "stopped"]
                response = f"Found **{len(instances)} EC2 instances**:\n\n"
                response += f"Running: {len(running)} | Stopped: {len(stopped)}\n\n"
                for inst in instances[:10]:
                    state_emoji = "🟢" if inst["state"] == "running" else "🔴" if inst["state"] == "stopped" else "🟡"
                    response += f"{state_emoji} **{inst.get('name', inst['id'])}** ({inst.get('type', 'N/A')}) - {inst['state']}\n"
                    if inst.get('public_ip'):
                        response += f"  Public IP: `{inst['public_ip']}`\n"
                if len(instances) > 10:
                    response += f"\n...and {len(instances)-10} more instances.\n"

        elif any(w in msg for w in ["stop instance", "stop server", "stop ec2"]):
            id_match = re.search(r'(i-[0-9a-f]+|\S+)', msg.split("stop")[-1].strip())
            if id_match:
                instance_id = id_match.group(1)
                tools_used.append("stop_ec2_instance")
                loop = asyncio.get_running_loop()
                ec2 = _get_client("ec2")
                await loop.run_in_executor(EXECUTOR, lambda: ec2.stop_instances(InstanceIds=[instance_id]))
                response = f"Instance **{instance_id}** stop command sent."
            else:
                response = "Please specify the instance ID. Example: `stop instance i-1234567890abcdef0`"

        elif any(w in msg for w in ["start instance", "start server", "start ec2"]):
            id_match = re.search(r'(i-[0-9a-f]+|\S+)', msg.split("start")[-1].strip())
            if id_match:
                instance_id = id_match.group(1)
                tools_used.append("start_ec2_instance")
                loop = asyncio.get_running_loop()
                ec2 = _get_client("ec2")
                await loop.run_in_executor(EXECUTOR, lambda: ec2.start_instances(InstanceIds=[instance_id]))
                response = f"Instance **{instance_id}** start command sent."
            else:
                response = "Please specify the instance ID. Example: `start instance i-1234567890abcdef0`"

        # S3 Commands
        elif any(w in msg for w in ["list s3", "show s3", "s3 buckets", "buckets", "list buckets"]):
            tools_used.append("list_s3_buckets")
            data = await s3_buckets(request)
            buckets = data.get("buckets", [])
            if not buckets:
                response = "No S3 buckets found.\n"
            else:
                response = f"Found **{len(buckets)} S3 buckets**:\n\n"
                for b in buckets[:15]:
                    size = b.get("size", "0 B")
                    encryption = "🔒" if b.get("encryption") else "⚠️"
                    response += f"{encryption} **{b['name']}** - {size} ({b.get('region', 'N/A')})\n"
                if len(buckets) > 15:
                    response += f"\n...and {len(buckets)-15} more buckets.\n"

        # Lambda Commands
        elif any(w in msg for w in ["list lambda", "show lambda", "lambda functions", "functions"]):
            tools_used.append("list_lambda_functions")
            data = await lambda_functions(request)
            functions = data.get("functions", [])
            if not functions:
                response = "No Lambda functions found.\n"
            else:
                response = f"Found **{len(functions)} Lambda functions**:\n\n"
                for fn in functions[:10]:
                    state_emoji = "🟢" if fn.get("state") == "Active" else "🔴"
                    response += f"{state_emoji} **{fn['name']}** - {fn.get('runtime', 'N/A')}\n"
                    response += f"  Memory: {fn.get('memory', 'N/A')} MB | Timeout: {fn.get('timeout', 'N/A')}s\n"

        # DynamoDB Commands
        elif any(w in msg for w in ["list dynamo", "dynamodb tables", "dynamo tables", "show tables"]):
            tools_used.append("list_dynamodb_tables")
            data = await dynamodb_info(request)
            tables = data.get("tables", [])
            if not tables:
                response = "No DynamoDB tables found.\n"
            else:
                response = f"Found **{len(tables)} DynamoDB tables**:\n\n"
                for t in tables[:10]:
                    response += f"📊 **{t['name']}** - Status: {t.get('status', 'N/A')}\n"

        # RDS Commands
        elif any(w in msg for w in ["list rds", "show rds", "databases", "rds instances"]):
            tools_used.append("list_rds_instances")
            data = await rds_instances(request)
            databases = data.get("databases", [])
            if not databases:
                response = "No RDS databases found.\n"
            else:
                response = f"Found **{len(databases)} RDS databases**:\n\n"
                for db in databases[:10]:
                    status_emoji = "🟢" if db.get("status") == "available" else "🔴"
                    response += f"{status_emoji} **{db['name']}** - {db.get('engine', 'N/A')} {db.get('engine_version', '')}\n"
                    response += f"  Class: {db.get('instance_class', 'N/A')} | Storage: {db.get('storage', 'N/A')} GB\n"

        # IAM Commands
        elif any(w in msg for w in ["list iam", "show iam", "iam users", "users", "list users"]):
            tools_used.append("list_iam_users")
            data = await iam_info(request)
            users = data.get("users", [])
            if not users:
                response = "No IAM users found.\n"
            else:
                response = f"Found **{len(users)} IAM users**:\n\n"
                for u in users[:10]:
                    mfa = "🔒" if u.get("mfaEnabled") else "⚠️"
                    response += f"{mfa} **{u['name']}** - Created: {u.get('created', 'N/A')}\n"

        # VPC Commands
        elif any(w in msg for w in ["list vpc", "show vpc", "vpcs", "network"]):
            tools_used.append("list_vpcs")
            data = await vpc_info(request)
            vpcs = data.get("vpcs", [])
            if not vpcs:
                response = "No VPCs found.\n"
            else:
                response = f"Found **{len(vpcs)} VPCs**:\n\n"
                for v in vpcs[:10]:
                    response += f"🌐 **{v.get('name', v['id'])}** - CIDR: {v.get('cidr', 'N/A')}\n"
                    response += f"  Subnets: {len(v.get('subnets', []))} | State: {v.get('state', 'N/A')}\n"

        # Cost Commands (basic - short commands only)
        elif msg in ["cost", "show cost", "billing", "how much", "expenses", "cost overview"]:
            tools_used.append("cost_info")
            data = await cost_info(request)
            response = f"**AWS Cost Overview**:\n\n"
            response += f"Today: **${data.get('today', 0):.2f}**\n"
            response += f"Yesterday: **${data.get('yesterday', 0):.2f}**\n"
            response += f"This Month: **${data.get('month', 0):.2f}**\n"
            response += f"Forecast: **${data.get('forecast', 0):.2f}**\n"

            by_service = data.get("byService", [])
            if by_service:
                response += "\n**Top Services:**\n"
                for svc in by_service[:5]:
                    response += f"• {svc.get('service', 'N/A')}: **${svc.get('cost', 0):.2f}**\n"

        # Security Commands (basic - short commands only)
        elif msg in ["security", "show security", "security findings", "list security", "vulnerabilities"]:
            tools_used.append("security_findings")
            data = await security_findings(request)
            findings = data.get("findings", [])
            if not findings:
                response = "No security findings. Your infrastructure looks clean!"
            else:
                critical = [f for f in findings if f.get("severity") == "Critical"]
                high = [f for f in findings if f.get("severity") == "High"]
                response = f"**Security Findings**: {len(findings)} total\n\n"
                if critical:
                    response += f"🔴 Critical: {len(critical)}\n"
                if high:
                    response += f"🟠 High: {len(high)}\n"
                response += "\n**Recent Findings:**\n"
                for f in findings[:5]:
                    sev = f.get("severity", "N/A")
                    emoji = "🔴" if sev == "Critical" else "🟠" if sev == "High" else "🟡"
                    response += f"{emoji} **{f.get('title', 'N/A')}**\n  Resource: `{f.get('resource', 'N/A')}`\n"

        # ECS Commands
        elif any(w in msg for w in ["list ecs", "show ecs", "ecs clusters", "containers"]):
            tools_used.append("list_ecs_clusters")
            data = await ecs_info(request)
            clusters = data.get("clusters", [])
            if not clusters:
                response = "No ECS clusters found.\n"
            else:
                response = f"Found **{len(clusters)} ECS clusters**:\n\n"
                for c in clusters[:10]:
                    response += f"🐳 **{c['name']}**\n"

        # SQS Commands
        elif any(w in msg for w in ["list sqs", "show sqs", "sqs queues", "queues"]):
            tools_used.append("list_sqs_queues")
            data = await sqs_info(request)
            queues = data.get("queues", [])
            if not queues:
                response = "No SQS queues found.\n"
            else:
                response = f"Found **{len(queues)} SQS queues**:\n\n"
                for q in queues[:10]:
                    response += f"📨 **{q['name']}** - Messages: {q.get('messagesAvailable', 0)} available\n"

        # SNS Commands
        elif any(w in msg for w in ["list sns", "show sns", "sns topics", "topics", "notifications"]):
            tools_used.append("list_sns_topics")
            data = await sns_info(request)
            topics = data.get("topics", [])
            if not topics:
                response = "No SNS topics found.\n"
            else:
                response = f"Found **{len(topics)} SNS topics**:\n\n"
                for t in topics[:10]:
                    response += f"📢 **{t['name']}**\n"

        # Secrets Manager
        elif any(w in msg for w in ["list secrets", "show secrets", "secrets manager"]):
            tools_used.append("list_secrets")
            data = await secrets_manager_info(request)
            secrets = data.get("secrets", [])
            if not secrets:
                response = "No secrets found in Secrets Manager.\n"
            else:
                response = f"Found **{len(secrets)} secrets**:\n\n"
                for s in secrets[:10]:
                    response += f"🔐 **{s['name']}** - Created: {s.get('created', 'N/A')}\n"

        # CloudWatch
        elif any(w in msg for w in ["cloudwatch", "alarms", "monitoring"]):
            tools_used.append("list_cloudwatch_alarms")
            data = await cloudwatch_dashboards(request)
            alarms = data.get("alarms", [])
            dashboards = data.get("dashboards", [])
            response = f"**CloudWatch Overview**:\n\n"
            response += f"Dashboards: {len(dashboards)}\n"
            response += f"Alarms: {len(alarms)}\n"
            if alarms:
                response += "\n**Alarms:**\n"
                for a in alarms[:5]:
                    state_emoji = "🔴" if a.get("state") == "ALARM" else "🟢"
                    response += f"{state_emoji} **{a['name']}** - {a.get('state', 'N/A')}\n"

        # General Status
        elif msg in ["status", "show status", "overview", "summary", "dashboard", "show overview"]:
            tools_used.extend(["ec2_instances", "s3_buckets", "lambda_functions", "rds_instances"])
            ec2_data, s3_data, lambda_data, rds_data = await asyncio.gather(
                ec2_instances(request), s3_buckets(request),
                lambda_functions(request), rds_instances(request)
            )
            ec2_count = len(ec2_data.get("instances", []))
            running = len([i for i in ec2_data.get("instances", []) if i.get("state") == "running"])
            s3_count = len(s3_data.get("buckets", []))
            lambda_count = len(lambda_data.get("functions", []))
            rds_count = len(rds_data.get("databases", []))

            response = "**Infrastructure Overview:**\n\n"
            response += f"🖥️ **EC2**: {ec2_count} instances ({running} running)\n"
            response += f"📦 **S3**: {s3_count} buckets\n"
            response += f"⚡ **Lambda**: {lambda_count} functions\n"
            response += f"🗄️ **RDS**: {rds_count} databases\n"
            response += f"\nAll systems operational."

        # Help
        elif any(w in msg for w in ["help", "what can you do", "commands", "options"]):
            response = "**Available Commands:**\n\n"
            response += "**AWS Services:**\n"
            response += "• `list ec2` - Show EC2 instances\n"
            response += "• `list s3` - Show S3 buckets\n"
            response += "• `list lambda` - Show Lambda functions\n"
            response += "• `list rds` - Show RDS databases\n"
            response += "• `list dynamo` - Show DynamoDB tables\n"
            response += "• `list iam` - Show IAM users\n"
            response += "• `list vpc` - Show VPCs\n"
            response += "• `list sqs` - Show SQS queues\n"
            response += "• `list sns` - Show SNS topics\n"
            response += "• `list ecs` - Show ECS clusters\n"
            response += "• `list secrets` - Show Secrets Manager\n\n"
            response += "**AI Analysis:**\n"
            response += "• `security analysis` - Deep security audit with score\n"
            response += "• `cost analysis` - Cost optimization report\n"
            response += "• `architecture review` - Architecture best practices\n"
            response += "• `health check` - Full infrastructure health report\n"
            response += "• `analyze <topic>` - AI-powered analysis\n\n"
            response += "**Actions:**\n"
            response += "• `stop instance <id>` - Stop an EC2 instance\n"
            response += "• `start instance <id>` - Start an EC2 instance\n\n"
            response += "**Info:**\n"
            response += "• `cost` - Show cost overview\n"
            response += "• `security` - Show security findings\n"
            response += "• `status` - Show infrastructure summary\n"
            response += "• `cloudwatch` - Show monitoring alarms\n"

        # AI Analysis Commands
        elif any(w in msg for w in ["security analysis", "security audit", "security report", "analyze security"]):
            tools_used.append("security_analysis")
            data = await _gather_all_aws_data(request)
            response = _analyze_security(data)

        elif any(w in msg for w in ["cost analysis", "cost optimization", "cost report", "optimize cost", "analyze cost"]):
            tools_used.append("cost_analysis")
            data = await _gather_all_aws_data(request)
            response = _analyze_cost(data)

        elif any(w in msg for w in ["architecture review", "architecture analysis", "arch review", "design review", "analyze architecture"]):
            tools_used.append("architecture_review")
            data = await _gather_all_aws_data(request)
            response = _analyze_architecture(data)

        elif any(w in msg for w in ["health check", "health report", "full report", "overview report"]):
            tools_used.append("health_check")
            data = await _gather_all_aws_data(request)
            response = _analyze_overall(data)

        elif any(w in msg for w in ["analyze", "analysis", "review", "audit", "assess"]):
            tools_used.append("smart_analysis")
            data = await _gather_all_aws_data(request)
            context = f"EC2: {len(data['ec2'].get('instances',[]))} instances, S3: {len(data['s3'].get('buckets',[]))} buckets, Lambda: {len(data['lambda'].get('functions',[]))} functions, RDS: {len(data['rds'].get('databases',[]))} databases, Security: {len(data['security'].get('findings',[]))} findings"

            # Try Claude first
            if ANTHROPIC_API_KEY:
                try:
                    claude_response = await _claude_chat(message, context)
                    if claude_response:
                        response = claude_response
                        tools_used.append("claude_api")
                except Exception:
                    pass

            # Try Ollama second
            if not response:
                try:
                    ollama_response = await _ollama_chat(message, context)
                    if ollama_response:
                        response = ollama_response
                        tools_used.append("ollama_local")
                except Exception:
                    pass

            # Fallback to local analysis
            if not response:
                response = _analyze_overall(data)

        # Greeting
        elif any(w in msg for w in ["hello", "hi", "hey", "good morning", "good evening"]):
            response = "Hello! I'm your DevOps AI Assistant. I can help you manage your AWS infrastructure.\n\n"
            response += "Try commands like:\n"
            response += "• `list ec2` - Show EC2 instances\n"
            response += "• `cost` - Show cost overview\n"
            response += "• `security` - Show security findings\n"
            response += "• `help` - See all commands\n"

        # Fallback - Try Claude → Ollama → Local Analysis
        else:
            tools_used.append("smart_fallback")
            data = await _gather_all_aws_data(request)
            context = f"EC2: {len(data['ec2'].get('instances',[]))} instances, S3: {len(data['s3'].get('buckets',[]))} buckets, Lambda: {len(data['lambda'].get('functions',[]))} functions, RDS: {len(data['rds'].get('databases',[]))} databases, Security: {len(data['security'].get('findings',[]))} findings"

            # Try Claude first (best quality)
            if ANTHROPIC_API_KEY:
                try:
                    claude_response = await _claude_chat(message, context)
                    if claude_response:
                        response = claude_response
                        tools_used.append("claude_api")
                except Exception:
                    pass

            # Try Ollama second (fast, local)
            if not response:
                try:
                    ollama_response = await _ollama_chat(message, context)
                    if ollama_response:
                        response = ollama_response
                        tools_used.append("ollama_local")
                except Exception:
                    pass

            # Fallback to local analysis
            if not response:
                response = _analyze_overall(data)

    except HTTPException as e:
        response = f"Connection error: {e.detail}\n\nPlease make sure you're connected to AWS. Go to the AWS Dashboard and connect first."
    except Exception as e:
        if hasattr(e, 'response') and hasattr(e.response, 'get'):
            error_code = e.response.get("Error", {}).get("Code", "Unknown")
            error_msg = e.response.get("Error", {}).get("Message", str(e))
            response = f"AWS Error ({error_code}): {error_msg}"
        else:
            response = f"Error: {str(e)}\n\nPlease try again or check your connection."

    return {"response": response, "tools_used": tools_used}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8085)
