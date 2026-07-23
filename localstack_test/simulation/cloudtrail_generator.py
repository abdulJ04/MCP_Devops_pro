import random
import json
from datetime import datetime, timezone, timedelta
from .base_generator import BaseGenerator
from .logger import log
from .state_manager import state
from .event_bus import event_bus

EVENT_SOURCES = {
    "ec2.amazonaws.com": ["RunInstances", "StopInstances", "StartInstances", "TerminateInstances", "DescribeInstances", "ModifyInstanceAttribute", "CreateSecurityGroup", "AuthorizeSecurityGroupIngress"],
    "s3.amazonaws.com": ["PutObject", "GetObject", "DeleteObject", "CreateBucket", "DeleteBucket", "ListBuckets", "PutBucketLifecycle"],
    "iam.amazonaws.com": ["CreateUser", "DeleteUser", "CreateAccessKey", "DeleteAccessKey", "UpdateAccessKey", "AttachUserPolicy", "DetachUserPolicy", "CreateGroup", "AddUserToGroup"],
    "lambda.amazonaws.com": ["Invoke", "CreateFunction", "DeleteFunction", "UpdateFunctionCode", "UpdateFunctionConfiguration"],
    "dynamodb.amazonaws.com": ["PutItem", "UpdateItem", "DeleteItem", "Query", "Scan", "CreateTable", "DeleteTable"],
    "sqs.amazonaws.com": ["SendMessage", "ReceiveMessage", "DeleteMessage", "CreateQueue", "DeleteQueue"],
    "sns.amazonaws.com": ["Publish", "CreateTopic", "DeleteTopic", "Subscribe", "Unsubscribe"],
    "secretsmanager.amazonaws.com": ["CreateSecret", "DeleteSecret", "PutSecretValue", "GetSecretValue", "RotateSecret"],
}

USER_ARNS = [
    "arn:aws:iam::000000000000:user/admin",
    "arn:aws:iam::000000000000:user/developer",
    "arn:aws:iam::000000000000:user/devops",
    "arn:aws:iam::000000000000:user/security",
    "arn:aws:iam::000000000000:user/john.doe",
    "arn:aws:iam::000000000000:user/jane.smith",
    "arn:aws:iam::000000000000:root",
]

SOURCE_IPS = ["192.168.1.100", "10.0.0.50", "172.16.0.25", "203.0.113.45", "198.51.100.22"]
USER_AGENTS = [
    "aws-sdk-python/1.0.0",
    "aws-cli/2.15.0",
    "console.amazonaws.com",
    "Terraform/1.7.0",
    "CloudFormation",
    "boto3/1.26.0",
]


class CloudTrailGenerator(BaseGenerator):
    def __init__(self):
        super().__init__("CloudTrail", 5)

    def generate(self):
        ct = self.get_client("cloudtrail")

        source = random.choice(list(EVENT_SOURCES.keys()))
        event_name = random.choice(EVENT_SOURCES[source])
        user = random.choice(USER_ARNS)
        ip = random.choice(SOURCE_IPS)
        agent = random.choice(USER_AGENTS)

        event_time = datetime.now(timezone.utc) - timedelta(seconds=random.randint(0, 300))

        cloudtrail_event = {
            "eventVersion": "1.08",
            "userIdentity": {
                "type": "IAMUser",
                "arn": user,
                "accountId": "000000000000",
                "userName": user.split("/")[-1],
            },
            "eventTime": event_time.isoformat(),
            "eventSource": source,
            "eventName": event_name,
            "awsRegion": "us-east-1",
            "sourceIPAddress": ip,
            "userAgent": agent,
            "requestParameters": {"resourceId": f"res-{random.randint(1000,9999)}"},
            "responseElements": {"requestId": f"req-{random.randint(10000,99999)}"},
            "eventID": f"{random.randint(10000000,99999999)}-{random.randint(1000,9999)}-{random.randint(1000,9999)}-{random.randint(1000,9999)}-{random.randint(100000000000,999999999999)}",
            "readOnly": random.choice([True, False]),
            "resources": [{
                "ARN": f"arn:aws:{source.split('.')[0]}::000000000000:resource/{random.randint(1,999)}",
                "accountId": "000000000000",
                "type": "AWS::" + source.split('.')[0].upper() + "::Resource",
            }],
            "eventType": random.choice(["AwsApiCall", "AwsConsoleCall"]),
            "recipientAccountId": "000000000000",
        }

        try:
            ct.lookup_events(
                StartTime=event_time - timedelta(hours=1),
                EndTime=event_time + timedelta(hours=1),
                MaxResults=1,
            )
            log.info(f"{event_name} via {source}", component=self.name)
            event_bus.publish("cloudtrail.event", {
                "event_name": event_name,
                "source": source,
                "user": user,
            })
        except Exception:
            pass

    def discover_existing(self):
        ct = self.get_client("cloudtrail")
        try:
            trails = ct.describe_trails().get("trailList", [])
            log.info(f"Discovered {len(trails)} CloudTrail trails", component=self.name)
        except Exception:
            pass
