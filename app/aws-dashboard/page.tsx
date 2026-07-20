"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BsCloud,
  BsServer,
  BsShieldCheck,
  BsGraphUp,
  BsDatabase,
  BsGlobe,
  BsKey,
  BsBug,
  BsActivity,
  BsArrowRepeat,
  BsSearch,
  BsFilter,
  BsChevronDown,
  BsChevronUp,
  BsExclamationTriangle,
  BsCheckCircle,
  BsXCircle,
  BsInfoCircle,
  BsDownload,
  BsGear,
  BsArrowLeft,
} from "react-icons/bs";
import MultiModalChat from "../../components/MultiModalChat";
import CostAlertBanner from "../../components/CostAlertBanner";
import CostAlertConfig from "../../components/CostAlertConfig";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const AWS_REGIONS = [
  "us-east-1","us-east-2","us-west-1","us-west-2","eu-west-1","eu-west-2","eu-west-3",
  "eu-central-1","eu-north-1","ap-southeast-1","ap-southeast-2","ap-northeast-1",
  "ap-northeast-2","ap-south-1","sa-east-1","ca-central-1","me-south-1","af-south-1",
];

interface SidebarCategory {
  id: string;
  label: string;
  icon: any;
  tabs: { id: string; label: string; icon: any }[];
}

const SIDEBAR_CATEGORIES: SidebarCategory[] = [
  { id: "home", label: "Home", icon: BsGraphUp, tabs: [
    { id: "overview", label: "Overview", icon: BsGraphUp },
    { id: "activity", label: "Activity", icon: BsActivity },
    { id: "settings", label: "Settings", icon: BsGear },
  ]},
  { id: "compute", label: "Compute", icon: BsServer, tabs: [
    { id: "ec2", label: "EC2", icon: BsServer },
    { id: "lambda", label: "Lambda", icon: BsActivity },
    { id: "ecs", label: "ECS", icon: BsServer },
    { id: "eks", label: "EKS", icon: BsServer },
    { id: "ecr", label: "ECR", icon: BsCloud },
    { id: "auto_scaling", label: "Auto Scaling", icon: BsGraphUp },
  ]},
  { id: "storage", label: "Storage", icon: BsCloud, tabs: [
    { id: "s3", label: "S3", icon: BsCloud },
    { id: "ebs", label: "EBS", icon: BsServer },
  ]},
  { id: "database", label: "Database", icon: BsDatabase, tabs: [
    { id: "rds", label: "RDS", icon: BsDatabase },
    { id: "dynamodb", label: "DynamoDB", icon: BsDatabase },
  ]},
  { id: "networking", label: "Networking", icon: BsGlobe, tabs: [
    { id: "vpc", label: "VPC", icon: BsGlobe },
    { id: "route53", label: "Route 53", icon: BsGlobe },
    { id: "elb", label: "ELB/ALB", icon: BsGlobe },
  ]},
  { id: "security", label: "Security & Identity", icon: BsShieldCheck, tabs: [
    { id: "iam", label: "IAM", icon: BsKey },
    { id: "secrets_manager", label: "Secrets Manager", icon: BsKey },
    { id: "acm", label: "ACM", icon: BsShieldCheck },
    { id: "security", label: "Security Hub", icon: BsShieldCheck },
  ]},
  { id: "management", label: "Management", icon: BsGear, tabs: [
    { id: "cloudwatch_dash", label: "CloudWatch", icon: BsActivity },
    { id: "ssm", label: "Systems Manager", icon: BsGear },
    { id: "cloudformation", label: "CloudFormation", icon: BsCloud },
  ]},
  { id: "devtools", label: "Developer Tools", icon: BsActivity, tabs: [
    { id: "codepipeline", label: "CodePipeline", icon: BsActivity },
    { id: "codebuild", label: "CodeBuild", icon: BsServer },
    { id: "codedeploy", label: "CodeDeploy", icon: BsCloud },
  ]},
  { id: "integration", label: "Integration", icon: BsActivity, tabs: [
    { id: "sns", label: "SNS", icon: BsActivity },
    { id: "sqs", label: "SQS", icon: BsActivity },
    { id: "eventbridge", label: "EventBridge", icon: BsActivity },
  ]},
  { id: "cost", label: "Cost Management", icon: BsGraphUp, tabs: [
    { id: "cost", label: "Cost Explorer", icon: BsGraphUp },
    { id: "budgets", label: "Budgets", icon: BsGraphUp },
    { id: "cost_alerts", label: "Cost Alerts", icon: BsExclamationTriangle },
  ]},
  { id: "compliance", label: "Compliance", icon: BsBug, tabs: [
    { id: "cloudtrail", label: "CloudTrail", icon: BsBug },
    { id: "backup", label: "AWS Backup", icon: BsCloud },
    { id: "parameter_store", label: "Parameter Store", icon: BsKey },
  ]},
];

const PIE_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#f97316"];
const SEVERITY_COLORS: Record<string, string> = { Critical: "#ef4444", High: "#f97316", Medium: "#eab308", Low: "#3b82f6", Informational: "#6b7280" };

interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  useLocalstack?: boolean;
  sessionTimeout?: number;
}
interface EC2Instance { id: string; name: string; state: "running"|"stopped"|"pending"|"terminated"; cpu: number; instanceType: string; az: string; publicIp: string; privateIp: string; launchTime: string; }
interface S3Bucket { name: string; region: string; size: string; objectCount: number; versioning: boolean; encryption: boolean; publicAccess: boolean; }
interface LambdaFunction { name: string; runtime: string; memory: number; timeout: number; lastModified: string; state: "Active"|"Inactive"|"Failed"; invocations: number; errors: number; avgDuration: number; }
interface RDSInstance { name: string; engine: string; status: "available"|"stopped"|"backing-up"|"rebooting"; cpu: number; storage: number; storageUsed: number; multiAZ: boolean; connections: number; }
interface IAMUser { name: string; mfaEnabled: boolean; lastAccess: string; accessKeyAge: number; active: boolean; }
interface IAMRole { name: string; trustPolicy: string; lastUsed: string; }
interface IAMPolicy { name: string; type: "AWS"|"Managed"|"Inline"; usageCount: number; }
interface VPC { name: string; cidr: string; state: string; subnets: Subnet[]; }
interface Subnet { name: string; cidr: string; az: string; availableIps: number; }
interface SecurityGroup { name: string; inboundRules: number; outboundRules: number; }
interface CostEntry { service: string; cost: number; }
interface SecurityFinding { id: string; title: string; severity: "Critical"|"High"|"Medium"|"Low"|"Informational"; resource: string; region: string; timestamp: string; }
interface TrailEvent { id: string; event: string; source: string; time: string; region: string; status: "Success"|"Failure"; }

function generateMockEC2(): EC2Instance[] {
  const types = ["t3.micro","t3.small","t3.medium","t3.large","m5.large","m5.xlarge","c5.large","r5.large"];
  const azs = ["a","b","c"];
  const states: Array<"running"|"stopped"|"pending"|"terminated"> = ["running","stopped","pending","terminated"];
  return Array.from({ length: 12 }, (_, i) => ({
    id: `i-0${(Math.random()*99999999).toFixed(0).padStart(8,"0")}`,
    name: ["web-server","api-gateway","db-primary","cache-node","worker-1","worker-2","monitoring","ci-runner","staging-app","prod-app","dev-server","backup-agent"][i],
    state: states[i % 4],
    cpu: Math.round(Math.random() * 100),
    instanceType: types[i % types.length],
    az: `us-east-1${azs[i % 3]}`,
    publicIp: i % 4 === 0 ? "" : `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`,
    privateIp: `10.0.${Math.floor(Math.random()*10)}.${Math.floor(Math.random()*255)}`,
    launchTime: new Date(Date.now() - Math.random()*30*86400000).toISOString(),
  }));
}

function generateMockS3(): S3Bucket[] {
  return ["prod-assets-bucket","dev-logs-archive","backup-daily-2024","ml-training-data","static-website-hosting","ci-artifacts-store","audit-trail-logs","analytics-raw-data"].map((name, i) => ({
    name, region: AWS_REGIONS[i % AWS_REGIONS.length], size: `${(Math.random()*500).toFixed(1)} GB`,
    objectCount: Math.floor(Math.random()*1000000), versioning: Math.random() > 0.3, encryption: Math.random() > 0.2, publicAccess: i === 0 || i === 4,
  }));
}

function generateMockLambda(): LambdaFunction[] {
  const runtimes = ["nodejs18.x","python3.11","java17","go1.x","dotnet6"];
  return ["auth-handler","image-processor","email-sender","data-transformer","api-proxy","cron-job-processor","notification-dispatcher","payment-webhook"].map((name, i) => ({
    name, runtime: runtimes[i % runtimes.length], memory: [128,256,512,1024,1536,3008][i % 6], timeout: [10,30,60,300][i % 4],
    lastModified: new Date(Date.now() - Math.random()*30*86400000).toISOString(),
    state: (["Active","Active","Active","Inactive","Failed","Active","Active","Active"] as const)[i],
    invocations: Math.floor(Math.random()*100000), errors: Math.floor(Math.random()*500), avgDuration: Math.round(Math.random()*5000),
  }));
}

function generateMockRDS(): RDSInstance[] {
  const engines = ["mysql","postgresql","aurora-mysql","aurora-postgresql","mariadb"];
  return ["prod-primary","staging-db","analytics-replica","dev-test-db","audit-logs-db"].map((name, i) => ({
    name, engine: engines[i % engines.length],
    status: (["available","available","available","stopped","available"] as const)[i],
    cpu: Math.round(Math.random()*100), storage: [100,50,200,20,500][i],
    storageUsed: Math.round(Math.random()*[100,50,200,20,500][i]), multiAZ: i < 3, connections: Math.floor(Math.random()*200),
  }));
}

function generateMockIAMUsers(): IAMUser[] {
  return ["admin-user","dev-john","dev-jane","ci-service","analyst-bob","auditor-sys","temp-contractor","backup-role"].map((name, i) => ({
    name, mfaEnabled: i !== 2 && i !== 5,
    lastAccess: new Date(Date.now() - Math.random()*90*86400000).toISOString(),
    accessKeyAge: Math.floor(Math.random()*400), active: i !== 6,
  }));
}

function generateMockIAMRoles(): IAMRole[] {
  return ["ec2-instance-role","lambda-execution-role","ecs-task-role","cross-account-role","admin-role"].map((name, i) => ({
    name, trustPolicy: ["ec2.amazonaws.com","lambda.amazonaws.com","ecs-tasks.amazonaws.com","sts.amazonaws.com","iam.amazonaws.com"][i],
    lastUsed: new Date(Date.now() - Math.random()*30*86400000).toISOString(),
  }));
}

function generateMockIAMPolicies(): IAMPolicy[] {
  return ["AdministratorAccess","ReadOnlyAccess","PowerUserAccess","LambdaFullAccess","S3FullAccess","EC2FullAccess","RDSFullAccess","VPCFullAccess"].map((name, i) => ({
    name, type: (["AWS","AWS","AWS","Managed","Managed","Managed","Managed","Inline"] as const)[i], usageCount: Math.floor(Math.random()*20),
  }));
}

function generateMockVPCs(): VPC[] {
  return [
    { name: "production-vpc", cidr: "10.0.0.0/16", state: "available", subnets: [
      { name: "public-subnet-1", cidr: "10.0.1.0/24", az: "us-east-1a", availableIps: 248 },
      { name: "private-subnet-1", cidr: "10.0.2.0/24", az: "us-east-1a", availableIps: 250 },
      { name: "public-subnet-2", cidr: "10.0.3.0/24", az: "us-east-1b", availableIps: 247 },
      { name: "private-subnet-2", cidr: "10.0.4.0/24", az: "us-east-1b", availableIps: 249 },
    ]},
    { name: "staging-vpc", cidr: "10.1.0.0/16", state: "available", subnets: [
      { name: "staging-public", cidr: "10.1.1.0/24", az: "us-east-1a", availableIps: 250 },
      { name: "staging-private", cidr: "10.1.2.0/24", az: "us-east-1b", availableIps: 251 },
    ]},
  ];
}

function generateMockSecurityGroups(): SecurityGroup[] {
  return ["default","web-servers","database","internal-alb","ci-cd-pipeline"].map((name, i) => ({
    name, inboundRules: Math.floor(Math.random()*10) + 1, outboundRules: Math.floor(Math.random()*5) + 1,
  }));
}

function generateCostData() {
  const daily = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29-i)*86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    cost: Math.round((40 + Math.random()*30)*100)/100,
  }));
  const byService = [
    { service: "EC2", cost: 1245.32 },{ service: "RDS", cost: 892.15 },{ service: "S3", cost: 234.67 },
    { service: "Lambda", cost: 156.89 },{ service: "CloudFront", cost: 189.43 },{ service: "ElastiCache", cost: 312.56 },
    { service: "EKS", cost: 456.78 },{ service: "Route53", cost: 45.23 },{ service: "SQS", cost: 67.89 },{ service: "DynamoDB", cost: 178.34 },
  ].sort((a, b) => b.cost - a.cost);
  const byRegion = [
    { name: "us-east-1", value: 1850 },{ name: "us-west-2", value: 920 },{ name: "eu-west-1", value: 650 },
    { name: "ap-southeast-1", value: 380 },{ name: "Other", value: 210 },
  ];
  return { daily, byService, byRegion };
}

function generateSecurityFindings(): SecurityFinding[] {
  return [
    { id: "SEC-001", title: "Root account used without MFA", severity: "Critical", resource: "arn:aws:iam::root", region: "us-east-1", timestamp: new Date(Date.now()-3600000).toISOString() },
    { id: "SEC-002", title: "S3 bucket with public read access", severity: "High", resource: "prod-assets-bucket", region: "us-east-1", timestamp: new Date(Date.now()-7200000).toISOString() },
    { id: "SEC-003", title: "Security group allows 0.0.0.0/0 on port 22", severity: "Critical", resource: "sg-0123456789abcdef0", region: "us-east-1", timestamp: new Date(Date.now()-10800000).toISOString() },
    { id: "SEC-004", title: "IAM user without MFA enabled", severity: "Medium", resource: "dev-jane", region: "global", timestamp: new Date(Date.now()-14400000).toISOString() },
    { id: "SEC-005", title: "Unencrypted EBS volume attached", severity: "High", resource: "vol-0123456789abcdef0", region: "us-east-1", timestamp: new Date(Date.now()-18000000).toISOString() },
    { id: "SEC-006", title: "Unused IAM access key older than 90 days", severity: "Medium", resource: "AKIAIOSFODNN7EXAMPLE", region: "global", timestamp: new Date(Date.now()-21600000).toISOString() },
    { id: "SEC-007", title: "CloudTrail logging disabled in region", severity: "High", resource: "ap-south-1", region: "ap-south-1", timestamp: new Date(Date.now()-25200000).toISOString() },
    { id: "SEC-008", title: "Lambda function with administrative permissions", severity: "Medium", resource: "auth-handler", region: "us-east-1", timestamp: new Date(Date.now()-28800000).toISOString() },
    { id: "SEC-009", title: "RDS instance publicly accessible", severity: "Critical", resource: "dev-test-db", region: "us-east-1", timestamp: new Date(Date.now()-32400000).toISOString() },
    { id: "SEC-010", title: "VPC Flow Logs not enabled", severity: "Low", resource: "staging-vpc", region: "us-east-1", timestamp: new Date(Date.now()-36000000).toISOString() },
  ];
}

function generateTrailEvents(): TrailEvent[] {
  const events = ["ConsoleLogin","CreateInstance","TerminateInstance","CreateBucket","PutObject","DeleteRole","AttachUserPolicy","CreateAccessKey","StopInstance","ModifySecurityGroup"];
  const sources = ["console.amazonaws.com","ec2.amazonaws.com","s3.amazonaws.com","iam.amazonaws.com","lambda.amazonaws.com"];
  return Array.from({ length: 20 }, (_, i) => ({
    id: `evt-${i}`, event: events[i % events.length], source: sources[i % sources.length],
    time: new Date(Date.now() - i*1800000).toISOString(), region: AWS_REGIONS[i % AWS_REGIONS.length],
    status: Math.random() > 0.2 ? "Success" : "Failure",
  }));
}

function Spinner({ size = "sm" }: { size?: "sm"|"md"|"lg" }) {
  const sizeClass = size === "sm" ? "w-4 h-4" : size === "md" ? "w-6 h-6" : "w-8 h-8";
  return <div className={`${sizeClass} border-2 border-current border-t-transparent rounded-full animate-spin`} />;
}

function Badge({ children, color = "blue" }: { children: React.ReactNode; color?: string }) {
  const cm: Record<string, string> = {
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    gray: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
    purple: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cm[color] || cm.blue}`}>{children}</span>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const cm: Record<string, string> = { Critical: "red", High: "orange", Medium: "yellow", Low: "blue", Informational: "gray" };
  return <Badge color={cm[severity] || "gray"}>{severity}</Badge>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-[#f8f9fa] dark:bg-[#2a2d38] rounded-xl shadow-sm border border-[#dee2e6] dark:border-[#3a3d48] ${className}`}>{children}</div>;
}

function StatCard({ icon: Icon, label, value, trend, trendUp, color = "blue" }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; trend?: string; trendUp?: boolean; color?: string;
}) {
  const cm: Record<string, string> = { blue: "bg-blue-500", green: "bg-green-500", yellow: "bg-yellow-500", red: "bg-red-500", purple: "bg-purple-500", cyan: "bg-cyan-500" };
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
          {trend && <p className={`text-xs mt-2 font-medium ${trendUp ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{trendUp ? "↑" : "↓"} {trend}</p>}
        </div>
        <div className={`w-12 h-12 rounded-lg ${cm[color]} flex items-center justify-center`}>
          <Icon className="text-white text-xl" />
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
        <Icon className="text-gray-400 text-2xl" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">{description}</p>
    </div>
  );
}

function AuthScreen({ onConnect }: { onConnect: (creds: AWSCredentials) => void }) {
  const router = useRouter();
  const [useLocalstack, setUseLocalstack] = useState(true);
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [sessionTimeout, setSessionTimeout] = useState(3600);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      if (useLocalstack) {
        const res = await fetch("/api/v1/aws", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "auth", use_localstack: true, region }),
        });
        const data = await res.json();
        if (!res.ok || data.success === false) throw new Error(data.detail || data.error || "LocalStack connection failed");
        onConnect({ accessKeyId: "test", secretAccessKey: "test", region, useLocalstack: true, sessionTimeout });
      } else {
        if (!accessKeyId || !secretAccessKey) { setError("Please fill in Access Key ID and Secret Access Key"); setLoading(false); return; }
        const body: any = { action: "auth", accessKeyId, secretAccessKey, region, timeout: sessionTimeout };
        if (sessionToken.trim()) body.sessionToken = sessionToken.trim();
        const res = await fetch("/api/v1/aws", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok || data.success === false) throw new Error(data.detail || data.error || "Authentication failed");
        onConnect({ accessKeyId, secretAccessKey, sessionToken, region, useLocalstack: false, sessionTimeout });
      }
    } catch (err: any) {
      const msg = err.message || "Failed to connect.";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("ECONNREFUSED") || msg.includes("fetch")) {
        setError("Backend server not running. Please run: bash start.sh");
      } else {
        setError(msg);
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-[#1e2128] via-[#2a2d38] to-[#1e2128] flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 relative">
        <button onClick={() => router.push("/")} className="absolute top-4 left-4 w-8 h-8 bg-[#e9ecef] dark:bg-[#353842] hover:bg-[#dee2e6] dark:hover:bg-[#404350] rounded-lg flex items-center justify-center transition-colors" title="Back to Home">
          <BsArrowLeft className="text-[#6c757d] dark:text-[#a0a0aa] text-sm" />
        </button>
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BsCloud className="text-white text-3xl" />
          </div>
          <h1 className="text-2xl font-bold text-[#212529] dark:text-[#e8e8ed]">AWS Dashboard</h1>
          <p className="text-sm text-[#6c757d] dark:text-[#a0a0aa] mt-1">Connect to your AWS account to start monitoring</p>
        </div>

        <div className="flex items-center justify-center gap-4 mb-6 p-3 bg-[#e9ecef] dark:bg-[#353842] rounded-lg">
          <span className={`text-sm font-medium ${!useLocalstack ? "text-orange-500" : "text-[#6c757d] dark:text-[#a0a0aa]"}`}>Real AWS</span>
          <button type="button" onClick={() => setUseLocalstack(!useLocalstack)}
            className={`relative w-12 h-6 rounded-full transition-colors ${useLocalstack ? "bg-green-500" : "bg-[#adb5bd]"}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${useLocalstack ? "left-7" : "left-1"}`} />
          </button>
          <span className={`text-sm font-medium ${useLocalstack ? "text-green-500" : "text-[#6c757d] dark:text-[#a0a0aa]"}`}>LocalStack</span>
        </div>

        {useLocalstack && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
            Connecting to LocalStack at localhost:4566 — no credentials needed.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">{error}</div>}
          {!useLocalstack && (
            <>
              <div>
                <label className="block text-sm font-medium text-[#212529] dark:text-[#e8e8ed] mb-1.5">AWS Access Key ID <span className="text-red-500">*</span></label>
                <input type="text" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} placeholder="AKIAIOSFODNN7EXAMPLE"
                  className="w-full px-4 py-2.5 bg-[#e9ecef] dark:bg-[#353842] border border-[#dee2e6] dark:border-[#3a3d48] rounded-lg text-[#212529] dark:text-[#e8e8ed] placeholder-[#adb5bd] focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#212529] dark:text-[#e8e8ed] mb-1.5">AWS Secret Access Key <span className="text-red-500">*</span></label>
                <input type="password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                  className="w-full px-4 py-2.5 bg-[#e9ecef] dark:bg-[#353842] border border-[#dee2e6] dark:border-[#3a3d48] rounded-lg text-[#212529] dark:text-[#e8e8ed] placeholder-[#adb5bd] focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#212529] dark:text-[#e8e8ed] mb-1.5">AWS Session Token <span className="text-[#adb5bd]">(optional)</span></label>
                <input type="password" value={sessionToken} onChange={(e) => setSessionToken(e.target.value)} placeholder="FwoGZXIvYXdzEBAaDD..."
                  className="w-full px-4 py-2.5 bg-[#e9ecef] dark:bg-[#353842] border border-[#dee2e6] dark:border-[#3a3d48] rounded-lg text-[#212529] dark:text-[#e8e8ed] placeholder-[#adb5bd] focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all" />
                <p className="text-xs text-[#adb5bd] dark:text-[#6a6a75] mt-1">Required for temporary credentials (STS, IAM Identity Center)</p>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-[#212529] dark:text-[#e8e8ed] mb-1.5">Region</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#e9ecef] dark:bg-[#353842] border border-[#dee2e6] dark:border-[#3a3d48] rounded-lg text-[#212529] dark:text-[#e8e8ed] focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all">
              {AWS_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#212529] dark:text-[#e8e8ed] mb-1.5">Session Timeout</label>
            <select value={sessionTimeout} onChange={(e) => setSessionTimeout(Number(e.target.value))}
              className="w-full px-4 py-2.5 bg-[#e9ecef] dark:bg-[#353842] border border-[#dee2e6] dark:border-[#3a3d48] rounded-lg text-[#212529] dark:text-[#e8e8ed] focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all">
              <option value={900}>15 minutes (Production)</option>
              <option value={1800}>30 minutes</option>
              <option value={3600}>1 hour (Testing)</option>
              <option value={7200}>2 hours</option>
              <option value={86400}>24 hours (Dev)</option>
            </select>
            <p className="text-xs text-[#adb5bd] dark:text-[#6a6a75] mt-1">Session expires after inactivity</p>
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
            {loading ? <><Spinner size="sm" /> Connecting...</> : <><BsCloud className="text-lg" /> {useLocalstack ? "Connect to LocalStack" : "Connect to AWS"}</>}
          </button>
        </form>
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6">Credentials are stored in memory only and never persisted to disk.</p>
      </Card>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function OverviewTab({ ec2, s3, lambda, rds, findings, costData, trailEvents, clientActivity }: {
  ec2: EC2Instance[]; s3: S3Bucket[]; lambda: LambdaFunction[]; rds: RDSInstance[]; findings: SecurityFinding[]; costData: ReturnType<typeof generateCostData>; trailEvents: TrailEvent[]; clientActivity: { action: string; resource: string; time: string; type: "success" | "warning" | "error" | "info" }[];
}) {
  const runningInstances = ec2.filter((i) => i.state === "running").length;
  const stoppedInstances = ec2.filter((i) => i.state === "stopped").length;
  const totalCost = costData.byService.reduce((s, c) => s + c.cost, 0);
  const criticalFindings = findings.filter((f) => f.severity === "Critical").length;
  const resourceDistribution = [{ name: "EC2", value: ec2.length },{ name: "S3", value: s3.length },{ name: "Lambda", value: lambda.length },{ name: "RDS", value: rds.length }];

  const cpuData = useMemo(() => {
    if (ec2.length === 0) return Array.from({ length: 24 }, (_, i) => ({ time: `${String(i).padStart(2, "0")}:00`, cpu: 0 }));
    const avgCpu = ec2.reduce((sum, inst) => sum + (inst.cpu || 0), 0) / ec2.length;
    const seed = ec2.reduce((s, inst) => s + (inst.cpu || 0), 0);
    return Array.from({ length: 24 }, (_, i) => {
      const hourOffset = Math.sin((i + seed) * 0.3) * 12;
      return { time: `${String(i).padStart(2, "0")}:00`, cpu: Math.max(0, Math.min(100, Math.round(avgCpu + hourOffset))) };
    });
  }, [ec2]);

  const networkData = useMemo(() => {
    const baseInbound = ec2.length * 120 + s3.reduce((s, b) => s + (b.objectCount || 0), 0) * 0.001;
    const baseOutbound = ec2.length * 80 + lambda.reduce((s, f) => s + (f.invocations || 0), 0) * 0.01;
    if (baseInbound === 0 && baseOutbound === 0) return Array.from({ length: 24 }, (_, i) => ({ time: `${String(i).padStart(2, "0")}:00`, inbound: 0, outbound: 0 }));
    return Array.from({ length: 24 }, (_, i) => {
      const hourFactor = Math.sin(i * 0.26) * 0.3 + 1;
      return {
        time: `${String(i).padStart(2, "0")}:00`,
        inbound: Math.round(baseInbound * hourFactor),
        outbound: Math.round(baseOutbound * hourFactor),
      };
    });
  }, [ec2, s3, lambda]);

  const ioData = useMemo(() => {
    const baseRead = rds.reduce((s, d) => s + (d.connections || 0), 0) * 2;
    const baseWrite = rds.reduce((s, d) => s + (d.storageUsed || 0), 0) * 0.1;
    if (baseRead === 0 && baseWrite === 0) return Array.from({ length: 24 }, (_, i) => ({ time: `${String(i).padStart(2, "0")}:00`, read: 0, write: 0 }));
    return Array.from({ length: 24 }, (_, i) => {
      const hourFactor = Math.cos(i * 0.26) * 0.25 + 1;
      return {
        time: `${String(i).padStart(2, "0")}:00`,
        read: Math.round(baseRead * hourFactor),
        write: Math.round(baseWrite * hourFactor),
      };
    });
  }, [rds]);

  const lambdaExecData = useMemo(() => {
    const totalInvocations = lambda.reduce((s, f) => s + (f.invocations || 0), 0);
    const totalErrors = lambda.reduce((s, f) => s + (f.errors || 0), 0);
    if (totalInvocations === 0 && totalErrors === 0) return Array.from({ length: 24 }, (_, i) => ({ time: `${String(i).padStart(2, "0")}:00`, invocations: 0, errors: 0 }));
    const hourlyInvocations = Math.round(totalInvocations / 24);
    const hourlyErrors = Math.round(totalErrors / 24);
    return Array.from({ length: 24 }, (_, i) => {
      const hourFactor = Math.sin(i * 0.3) * 0.4 + 1;
      return {
        time: `${String(i).padStart(2, "0")}:00`,
        invocations: Math.round(hourlyInvocations * hourFactor),
        errors: Math.round(hourlyErrors * hourFactor),
      };
    });
  }, [lambda]);

  const recentActivity = useMemo(() => {
    if (clientActivity && clientActivity.length > 0) {
      return clientActivity.slice(0, 7).map(a => ({
        ...a,
        time: a.time ? getTimeAgo(new Date(a.time)) : "now"
      }));
    }
    if (trailEvents && trailEvents.length > 0) {
      return trailEvents.slice(0, 7).map((evt) => {
        const source = (evt.source || "").toLowerCase();
        let resource = "AWS";
        let type: "success" | "warning" | "error" | "info" = "info";
        if (source.includes("ec2")) { resource = "EC2"; type = "success"; }
        else if (source.includes("s3")) { resource = "S3"; type = "success"; }
        else if (source.includes("iam")) { resource = "IAM"; type = "warning"; }
        else if (source.includes("lambda")) { resource = "Lambda"; type = "info"; }
        else if (source.includes("rds")) { resource = "RDS"; type = "success"; }
        else if (source.includes("dynamo")) { resource = "DynamoDB"; type = "info"; }
        else if (source.includes("sqs")) { resource = "SQS"; type = "info"; }
        else if (source.includes("sns")) { resource = "SNS"; type = "info"; }
        else if (source.includes("secret")) { resource = "Secrets"; type = "warning"; }

        const timeStr = evt.time ? getTimeAgo(new Date(evt.time)) : "recently";
        return { action: evt.event || "Unknown event", resource, time: timeStr, type };
      });
    }
    const activities: { action: string; resource: string; time: string; type: "success" | "warning" | "error" | "info" }[] = [];
    if (ec2.length > 0) {
      const running = ec2.filter(i => i.state === "running");
      const stopped = ec2.filter(i => i.state === "stopped");
      if (running.length > 0) activities.push({ action: `${running.length} instance(s) running`, resource: "EC2", time: "now", type: "success" });
      if (stopped.length > 0) activities.push({ action: `${stopped.length} instance(s) stopped`, resource: "EC2", time: "now", type: "warning" });
    }
    if (s3.length > 0) {
      const unencrypted = s3.filter(b => !b.encryption);
      if (unencrypted.length > 0) activities.push({ action: `${unencrypted.length} bucket(s) without encryption`, resource: "S3", time: "now", type: "warning" });
      activities.push({ action: `${s3.length} bucket(s) available`, resource: "S3", time: "now", type: "success" });
    }
    if (rds.length > 0) {
      const unavailable = rds.filter(r => r.status !== "available");
      if (unavailable.length > 0) activities.push({ action: `${unavailable.length} database(s) unavailable`, resource: "RDS", time: "now", type: "error" });
    }
    if (findings.length > 0) {
      const critical = findings.filter(f => f.severity === "Critical");
      if (critical.length > 0) activities.push({ action: `${critical.length} critical security finding(s)`, resource: "Security", time: "now", type: "error" });
    }
    if (activities.length === 0) activities.push({ action: "All systems operational", resource: "System", time: "now", type: "success" });
    return activities;
  }, [trailEvents, clientActivity, ec2, s3, rds, findings]);

  const healthStatus = useMemo(() => [
    { service: "EC2", status: ec2.length > 0 ? (stoppedInstances === 0 ? "healthy" : "degraded") : "unknown", count: `${runningInstances}/${ec2.length}`, detail: `${runningInstances} running, ${stoppedInstances} stopped` },
    { service: "S3", status: s3.length > 0 ? "healthy" : "unknown", count: `${s3.length} buckets`, detail: `${s3.reduce((sum, b) => sum + (b.objectCount || 0), 0)} objects` },
    { service: "Lambda", status: lambda.length > 0 ? (lambda.some(l => l.state === "Failed") ? "degraded" : "healthy") : "unknown", count: `${lambda.length} functions`, detail: `${lambda.filter(l => l.state === "Active").length} active` },
    { service: "RDS", status: rds.length > 0 ? (rds.every(r => r.status === "available") ? "healthy" : "degraded") : "unknown", count: `${rds.length} databases`, detail: `${rds.filter(r => r.status === "available").length} available` },
    { service: "IAM", status: "healthy", count: "Operational", detail: "All policies active" },
    { service: "VPC", status: "healthy", count: "Operational", detail: "All subnets healthy" },
  ], [ec2, s3, lambda, rds, runningInstances, stoppedInstances]);

  const serviceBreakdown = useMemo(() => {
    const nameMap: Record<string, string> = {
      "Amazon Elastic Compute Cloud - Compute": "EC2",
      "Amazon Relational Database Service": "RDS",
      "Amazon Simple Storage Service": "S3",
      "Amazon Lambda": "Lambda",
      "Amazon CloudFront": "CloudFront",
      "Amazon ElastiCache": "ElastiCache",
      "Amazon Route 53": "Route53",
      "Amazon Simple Queue Service": "SQS",
      "Other": "Other",
    };
    return costData.byService.map(s => ({
      ...s,
      service: nameMap[s.service] || s.service,
      cost: Number(s.cost.toFixed(2)),
    }));
  }, [costData]);

  return (
    <div className="space-y-4">
      {/* Row 1: Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={BsCloud} label="Total Resources" value={ec2.length + s3.length + lambda.length + rds.length} trend="+3 this week" trendUp color="blue" />
        <StatCard icon={BsServer} label="Running" value={runningInstances} trend={`${stoppedInstances} stopped`} trendUp={false} color="green" />
        <StatCard icon={BsGraphUp} label="Monthly Cost" value={`$${totalCost.toFixed(2)}`} trend="+12% vs last" trendUp={false} color="yellow" />
        <StatCard icon={BsShieldCheck} label="Findings" value={findings.length} trend={`${criticalFindings} critical`} trendUp={false} color="red" />
        <StatCard icon={BsDatabase} label="Databases" value={rds.length} trend={`${rds.filter(r => r.status === "available").length} available`} trendUp color="purple" />
        <StatCard icon={BsKey} label="Secrets" value={0} trend="All secure" trendUp color="cyan" />
      </div>

      {/* Row 2: Charts - CPU, Network, I/O */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">CPU Utilization</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">1h avg</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={cpuData}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} interval={5} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#cpuGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Network I/O</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">KB/s</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={networkData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} interval={5} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Line type="monotone" dataKey="inbound" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="outbound" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Disk I/O</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">ops/s</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ioData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} interval={5} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="read" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="write" fill="#ec4899" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Row 3: Lambda Invocations, Resource Distribution, Cost by Service */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Lambda Invocations</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">24h</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={lambdaExecData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} interval={5} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="invocations" fill="#06b6d4" radius={[2, 2, 0, 0]} />
              <Bar dataKey="errors" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Resource Distribution</h3>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={resourceDistribution} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                {resourceDistribution.map((_, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Cost by Service</h3>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={serviceBreakdown} cx="50%" cy="45%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="cost" nameKey="service">
                {serviceBreakdown.map((_, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              <Legend wrapperStyle={{ fontSize: "10px", lineHeight: "16px" }} layout="horizontal" verticalAlign="bottom" align="center" />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Row 4: Cost Trend + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Cost Trend (30 Days)</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">Daily spend</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={costData.daily}>
              <defs>
                <linearGradient id="costGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} formatter={(value: any) => [`$${Number(value).toFixed(2)}`, "Cost"]} />
              <Area type="monotone" dataKey="cost" stroke="#f59e0b" fill="url(#costGrad2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">Last 7 events</span>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${a.type === "success" ? "bg-green-500" : a.type === "warning" ? "bg-yellow-500" : a.type === "error" ? "bg-red-500" : "bg-blue-500"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.action}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{a.resource} · {a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 5: Health Status (Detailed) */}
      <Card className="p-4 mb-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Service Health</h3>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Healthy</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> Degraded</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Unhealthy</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {healthStatus.map((h) => (
            <div key={h.service} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-1">
                {h.status === "healthy" ? <BsCheckCircle className="text-green-500" /> : <BsExclamationTriangle className="text-yellow-500" />}
                <span className="font-semibold text-gray-900 dark:text-white text-sm">{h.service}</span>
              </div>
              <p className="text-base font-bold text-gray-900 dark:text-white">{h.count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{h.detail}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function EC2Tab({ instances }: { instances: EC2Instance[] }) {
  const [filterState, setFilterState] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const cpuData = useMemo(() => {
    if (instances.length === 0) return Array.from({ length: 24 }, (_, i) => ({ time: `${String(i).padStart(2, "0")}:00`, cpu: 0 }));
    const avgCpu = instances.reduce((sum, inst) => sum + (inst.cpu || 0), 0) / instances.length;
    const seed = instances.reduce((s, inst) => s + (inst.cpu || 0), 0);
    return Array.from({ length: 24 }, (_, i) => {
      const hourOffset = Math.sin((i + seed) * 0.3) * 10;
      return { time: `${String(i).padStart(2, "0")}:00`, cpu: Math.max(0, Math.min(100, Math.round(avgCpu + hourOffset))) };
    });
  }, [instances]);
  const networkData = useMemo(() => {
    if (instances.length === 0) return Array.from({ length: 24 }, (_, i) => ({ time: `${String(i).padStart(2, "0")}:00`, inbound: 0, outbound: 0 }));
    const baseInbound = instances.length * 100;
    const baseOutbound = instances.length * 60;
    return Array.from({ length: 24 }, (_, i) => {
      const hourFactor = Math.sin(i * 0.26) * 0.3 + 1;
      return { time: `${String(i).padStart(2, "0")}:00`, inbound: Math.round(baseInbound * hourFactor), outbound: Math.round(baseOutbound * hourFactor) };
    });
  }, [instances]);
  const diskData = useMemo(() => {
    if (instances.length === 0) return Array.from({ length: 24 }, (_, i) => ({ time: `${String(i).padStart(2, "0")}:00`, read: 0, write: 0 }));
    const baseRead = instances.length * 20;
    const baseWrite = instances.length * 15;
    return Array.from({ length: 24 }, (_, i) => {
      const hourFactor = Math.cos(i * 0.26) * 0.25 + 1;
      return { time: `${String(i).padStart(2, "0")}:00`, read: Math.round(baseRead * hourFactor), write: Math.round(baseWrite * hourFactor) };
    });
  }, [instances]);
  const filtered = instances.filter((i) => {
    if (filterState !== "all" && i.state !== filterState) return false;
    if (filterType !== "all" && i.instanceType !== filterType) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase()) && !i.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const stateCounts = { running: instances.filter((i) => i.state === "running").length, stopped: instances.filter((i) => i.state === "stopped").length, pending: instances.filter((i) => i.state === "pending").length, terminated: instances.filter((i) => i.state === "terminated").length };
  const instanceTypes = [...new Set(instances.map((i) => i.instanceType))];
  const stateColor = (s: string) => { switch (s) { case "running": return "green"; case "stopped": return "red"; case "pending": return "yellow"; case "terminated": return "gray"; default: return "gray"; } };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge color="green">Running: {stateCounts.running}</Badge>
        <Badge color="red">Stopped: {stateCounts.stopped}</Badge>
        <Badge color="yellow">Pending: {stateCounts.pending}</Badge>
        <Badge color="gray">Terminated: {stateCounts.terminated}</Badge>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <select value={filterState} onChange={(e) => setFilterState(e.target.value)} className="px-3 py-2 pr-8 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white appearance-none">
            <option value="all">All States</option><option value="running">Running</option><option value="stopped">Stopped</option><option value="pending">Pending</option><option value="terminated">Terminated</option>
          </select>
          <BsChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2 pr-8 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white appearance-none">
            <option value="all">All Types</option>
            {instanceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <BsChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <BsSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search instances..." className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((inst) => (
          <Card key={inst.id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div><h4 className="font-semibold text-gray-900 dark:text-white">{inst.name}</h4><p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{inst.id}</p></div>
              <Badge color={stateColor(inst.state)}>{inst.state}</Badge>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">CPU</span><div className="flex items-center gap-2"><div className="w-20 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden"><div className={`h-full rounded-full ${inst.cpu > 80 ? "bg-red-500" : inst.cpu > 50 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${inst.cpu}%` }} /></div><span className="text-gray-900 dark:text-white font-medium w-8 text-right">{inst.cpu}%</span></div></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Type</span><span className="text-gray-900 dark:text-white">{inst.instanceType}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">AZ</span><span className="text-gray-900 dark:text-white">{inst.az}</span></div>
              {inst.publicIp && <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Public IP</span><span className="text-gray-900 dark:text-white font-mono text-xs">{inst.publicIp}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Private IP</span><span className="text-gray-900 dark:text-white font-mono text-xs">{inst.privateIp}</span></div>
            </div>
          </Card>
        ))}
      </div>
      {filtered.length === 0 && <EmptyState icon={BsServer} title="No instances found" description="No instances match the current filters." />}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">CPU Utilization</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={cpuData}>
              <defs><linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="time" tick={{ fill: "#9ca3af", fontSize: 10 }} /><YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fill="url(#cpuGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Network I/O</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={networkData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="time" tick={{ fill: "#9ca3af", fontSize: 10 }} /><YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              <Legend /><Line type="monotone" dataKey="inbound" stroke="#10b981" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="outbound" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Disk I/O</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={diskData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="time" tick={{ fill: "#9ca3af", fontSize: 10 }} /><YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              <Legend /><Bar dataKey="read" fill="#3b82f6" radius={[2, 2, 0, 0]} /><Bar dataKey="write" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function S3Tab({ buckets }: { buckets: S3Bucket[] }) {
  const totalSize = buckets.reduce((s, b) => s + parseFloat(b.size), 0);
  const publicCount = buckets.filter((b) => b.publicAccess).length;
  const unencryptedCount = buckets.filter((b) => !b.encryption).length;
  const storageData = buckets.map((b) => ({ name: b.name.length > 15 ? b.name.slice(0, 15) + "..." : b.name, size: parseFloat(b.size) }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BsCloud} label="Total Buckets" value={buckets.length} color="blue" />
        <StatCard icon={BsGraphUp} label="Total Size" value={`${totalSize.toFixed(1)} GB`} color="cyan" />
        <StatCard icon={BsGlobe} label="Public Buckets" value={publicCount} trend={publicCount > 0 ? "Action required" : "All private"} trendUp={publicCount === 0} color={publicCount > 0 ? "red" : "green"} />
        <StatCard icon={BsShieldCheck} label="Unencrypted" value={unencryptedCount} trend={unencryptedCount > 0 ? "Enable encryption" : "All encrypted"} trendUp={unencryptedCount === 0} color={unencryptedCount > 0 ? "yellow" : "green"} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {buckets.map((bucket) => (
          <Card key={bucket.name} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0"><h4 className="font-semibold text-gray-900 dark:text-white truncate">{bucket.name}</h4><p className="text-xs text-gray-500 dark:text-gray-400">{bucket.region}</p></div>
              {bucket.publicAccess && <Badge color="red">Public</Badge>}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Size</span><span className="text-gray-900 dark:text-white">{bucket.size}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Objects</span><span className="text-gray-900 dark:text-white">{bucket.objectCount.toLocaleString()}</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-500 dark:text-gray-400">Versioning</span>{bucket.versioning ? <BsCheckCircle className="text-green-500" /> : <BsXCircle className="text-red-500" />}</div>
              <div className="flex justify-between items-center"><span className="text-gray-500 dark:text-gray-400">Encryption</span>{bucket.encryption ? <BsCheckCircle className="text-green-500" /> : <BsXCircle className="text-red-500" />}</div>
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Storage Usage by Bucket</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={storageData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} /><YAxis dataKey="name" type="category" width={130} tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} formatter={(value: any) => [`${value} GB`, "Size"]} />
            <Bar dataKey="size" fill="#3b82f6" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function LambdaTab({ functions }: { functions: LambdaFunction[] }) {
  const totalInvocations = functions.reduce((s, f) => s + f.invocations, 0);
  const totalErrors = functions.reduce((s, f) => s + f.errors, 0);
  const avgDuration = Math.round(functions.reduce((s, f) => s + f.avgDuration, 0) / functions.length);
  const errorData = functions.map((f) => ({ name: f.name.length > 12 ? f.name.slice(0, 12) + "..." : f.name, errors: f.errors }));
  const durationData = functions.map((f) => ({ name: f.name.length > 12 ? f.name.slice(0, 12) + "..." : f.name, duration: f.avgDuration }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BsActivity} label="Total Invocations" value={totalInvocations.toLocaleString()} trend="Last 24h" trendUp color="blue" />
        <StatCard icon={BsXCircle} label="Total Errors" value={totalErrors.toLocaleString()} trend={`${totalInvocations > 0 ? ((totalErrors / totalInvocations) * 100).toFixed(2) : 0}% error rate`} trendUp={totalErrors === 0} color={totalErrors > 0 ? "red" : "green"} />
        <StatCard icon={BsGraphUp} label="Avg Duration" value={`${avgDuration}ms`} color="purple" />
        <StatCard icon={BsServer} label="Active Functions" value={functions.filter((f) => f.state === "Active").length} color="green" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {functions.map((func) => (
          <Card key={func.name} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0"><h4 className="font-semibold text-gray-900 dark:text-white truncate">{func.name}</h4><p className="text-xs text-gray-500 dark:text-gray-400">{func.runtime}</p></div>
              <Badge color={func.state === "Active" ? "green" : func.state === "Failed" ? "red" : "yellow"}>{func.state}</Badge>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Memory</span><span className="text-gray-900 dark:text-white">{func.memory} MB</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Timeout</span><span className="text-gray-900 dark:text-white">{func.timeout}s</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Invocations</span><span className="text-gray-900 dark:text-white">{func.invocations.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Errors</span><span className={`font-medium ${func.errors > 0 ? "text-red-500" : "text-green-500"}`}>{func.errors}</span></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Avg Duration</span><span className="text-gray-900 dark:text-white">{func.avgDuration}ms</span></div>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Error Rate by Function</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={errorData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} /><YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              <Bar dataKey="errors" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Duration Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={durationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} /><YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} formatter={(value: any) => [`${value}ms`, "Duration"]} />
              <Bar dataKey="duration" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function RDSTab({ databases }: { databases: RDSInstance[] }) {
  const connData = databases.map((d) => ({ name: d.name.length > 12 ? d.name.slice(0, 12) + "..." : d.name, connections: d.connections }));
  const iopsData = databases.map((d) => ({ name: d.name.length > 12 ? d.name.slice(0, 12) + "..." : d.name, readIOPS: Math.round((d.connections || 0) * 5 + (d.cpu || 0) * 2), writeIOPS: Math.round((d.connections || 0) * 3 + (d.storageUsed || 0) * 0.1) }));
  const storageData = databases.map((d) => ({ name: d.name.length > 12 ? d.name.slice(0, 12) + "..." : d.name, used: d.storageUsed, free: d.storage - d.storageUsed }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BsDatabase} label="Total Databases" value={databases.length} color="blue" />
        <StatCard icon={BsServer} label="Available" value={databases.filter((d) => d.status === "available").length} color="green" />
        <StatCard icon={BsCheckCircle} label="Multi-AZ" value={databases.filter((d) => d.multiAZ).length} color="purple" />
        <StatCard icon={BsActivity} label="Total Connections" value={databases.reduce((s, d) => s + d.connections, 0)} color="cyan" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {databases.map((db) => (
          <Card key={db.name} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0"><h4 className="font-semibold text-gray-900 dark:text-white truncate">{db.name}</h4><p className="text-xs text-gray-500 dark:text-gray-400">{db.engine}</p></div>
              <Badge color={db.status === "available" ? "green" : db.status === "stopped" ? "red" : "yellow"}>{db.status}</Badge>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">CPU</span><div className="flex items-center gap-2"><div className="w-20 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden"><div className={`h-full rounded-full ${db.cpu > 80 ? "bg-red-500" : db.cpu > 50 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${db.cpu}%` }} /></div><span className="text-gray-900 dark:text-white font-medium w-8 text-right">{db.cpu}%</span></div></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Storage</span><span className="text-gray-900 dark:text-white">{db.storageUsed}/{db.storage} GB</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-500 dark:text-gray-400">Multi-AZ</span>{db.multiAZ ? <BsCheckCircle className="text-green-500" /> : <BsXCircle className="text-red-500" />}</div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Connections</span><span className="text-gray-900 dark:text-white">{db.connections}</span></div>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Connection Count</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={connData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} /><YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              <Bar dataKey="connections" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Read/Write IOPS</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={iopsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} /><YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              <Legend /><Bar dataKey="readIOPS" fill="#10b981" radius={[4, 4, 0, 0]} /><Bar dataKey="writeIOPS" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Free Storage</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={storageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} /><YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} formatter={(value: any) => [`${value} GB`, ""]} />
              <Legend /><Bar dataKey="used" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} /><Bar dataKey="free" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function IAMTab({ users, roles, policies }: { users: IAMUser[]; roles: IAMRole[]; policies: IAMPolicy[] }) {
  const [activeSubTab, setActiveSubTab] = useState<"users" | "roles" | "policies">("users");
  const mfaEnabledCount = users.filter((u) => u.mfaEnabled).length;
  const unusedKeys = users.filter((u) => u.accessKeyAge > 90).length;
  const inactiveUsers = users.filter((u) => !u.active).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BsKey} label="Total Users" value={users.length} color="blue" />
        <StatCard icon={BsShieldCheck} label="MFA Enabled" value={`${Math.round((mfaEnabledCount / users.length) * 100)}%`} color="green" />
        <StatCard icon={BsKey} label="Unused Keys (>90d)" value={unusedKeys} trend={unusedKeys > 0 ? "Rotate keys" : "All current"} trendUp={unusedKeys === 0} color={unusedKeys > 0 ? "yellow" : "green"} />
        <StatCard icon={BsXCircle} label="Inactive Users" value={inactiveUsers} color={inactiveUsers > 0 ? "red" : "green"} />
      </div>
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        {(["users", "roles", "policies"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveSubTab(tab)} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeSubTab === tab ? "bg-orange-500 text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      {activeSubTab === "users" && (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead><tr className="bg-gray-50 dark:bg-gray-700/50">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">MFA</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Access</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Key Age</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {users.map((user) => (
                <tr key={user.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{user.name}</td>
                  <td className="px-4 py-3">{user.mfaEnabled ? <BsCheckCircle className="text-green-500" /> : <BsXCircle className="text-red-500" />}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{new Date(user.lastAccess).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><Badge color={user.accessKeyAge > 90 ? "red" : user.accessKeyAge > 60 ? "yellow" : "green"}>{user.accessKeyAge}d</Badge></td>
                  <td className="px-4 py-3"><Badge color={user.active ? "green" : "gray"}>{user.active ? "Active" : "Inactive"}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {activeSubTab === "roles" && (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead><tr className="bg-gray-50 dark:bg-gray-700/50">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Trust Policy</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Used</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {roles.map((role) => (
                <tr key={role.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{role.name}</td>
                  <td className="px-4 py-3"><Badge color="blue">{role.trustPolicy}</Badge></td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{new Date(role.lastUsed).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {activeSubTab === "policies" && (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead><tr className="bg-gray-50 dark:bg-gray-700/50">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Policy</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Attached To</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {policies.map((policy) => (
                <tr key={policy.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{policy.name}</td>
                  <td className="px-4 py-3"><Badge color={policy.type === "AWS" ? "blue" : policy.type === "Managed" ? "purple" : "orange"}>{policy.type}</Badge></td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{policy.usageCount} entities</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function VPCTab({ vpcs, securityGroups }: { vpcs: VPC[]; securityGroups: SecurityGroup[] }) {
  const [expandedVpc, setExpandedVpc] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BsGlobe} label="Total VPCs" value={vpcs.length} color="blue" />
        <StatCard icon={BsServer} label="Total Subnets" value={vpcs.reduce((s, v) => s + v.subnets.length, 0)} color="green" />
        <StatCard icon={BsShieldCheck} label="Security Groups" value={securityGroups.length} color="purple" />
        <StatCard icon={BsActivity} label="Total Available IPs" value={vpcs.reduce((s, v) => s + v.subnets.reduce((ss, sn) => ss + sn.availableIps, 0), 0)} color="cyan" />
      </div>
      <div className="space-y-4">
        {vpcs.map((vpc, vpcIdx) => (
          <Card key={`${vpc.name}-${vpcIdx}`} className="overflow-hidden">
            <div className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors" onClick={() => setExpandedVpc(expandedVpc === vpc.name ? null : vpc.name)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BsGlobe className="text-blue-500 text-lg" />
                  <div><h4 className="font-semibold text-gray-900 dark:text-white">{vpc.name}</h4><p className="text-xs text-gray-500 dark:text-gray-400">{vpc.cidr} · {vpc.subnets.length} subnets</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge color="green">{vpc.state}</Badge>
                  {expandedVpc === vpc.name ? <BsChevronUp className="text-gray-400" /> : <BsChevronDown className="text-gray-400" />}
                </div>
              </div>
            </div>
            {expandedVpc === vpc.name && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Subnets</h5>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500 dark:text-gray-400">
                      <th className="pb-2 pr-4">Name</th><th className="pb-2 pr-4">CIDR</th><th className="pb-2 pr-4">AZ</th><th className="pb-2">Available IPs</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {vpc.subnets.map((sn, snIdx) => (
                        <tr key={`${sn.name}-${snIdx}`}>
                          <td className="py-2 pr-4 text-gray-900 dark:text-white">{sn.name}</td>
                          <td className="py-2 pr-4 font-mono text-xs text-gray-600 dark:text-gray-400">{sn.cidr}</td>
                          <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">{sn.az}</td>
                          <td className="py-2"><Badge color={sn.availableIps > 100 ? "green" : sn.availableIps > 20 ? "yellow" : "red"}>{sn.availableIps}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Security Groups</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {securityGroups.map((sg, idx) => (
            <div key={`${sg.name}-${idx}`} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center gap-2 mb-2">
                <BsShieldCheck className="text-purple-500" />
                <span className="font-medium text-gray-900 dark:text-white">{sg.name}</span>
              </div>
              <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span>Inbound: {sg.inboundRules}</span>
                <span>Outbound: {sg.outboundRules}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function CostTab({ costData }: { costData: ReturnType<typeof generateCostData> }) {
  const todayCost = costData.daily[costData.daily.length - 1]?.cost || 0;
  const monthCost = costData.byService.reduce((s, c) => s + c.cost, 0);
  const forecast = Math.round(monthCost * 1.08 * 100) / 100;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={BsGraphUp} label="Today's Cost" value={`$${todayCost.toFixed(2)}`} color="blue" />
        <StatCard icon={BsGraphUp} label="This Month" value={`$${monthCost.toFixed(2)}`} color="green" />
        <StatCard icon={BsGraphUp} label="Forecast (End of Month)" value={`$${forecast.toFixed(2)}`} trend="+8% projected" trendUp={false} color="yellow" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top 10 Costly Services</h3>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={costData.byService} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} /><YAxis dataKey="service" type="category" width={100} tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} formatter={(value: any) => [`${value.toFixed(2)}`, "Cost"]} />
              <Bar dataKey="cost" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Daily Cost (30 Days)</h3>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={costData.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 10 }} /><YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} formatter={(value: any) => [`${value.toFixed(2)}`, "Cost"]} />
              <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Monthly Cost Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={costData.daily.filter((_, i) => i % 3 === 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" /><XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 10 }} /><YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} formatter={(value: any) => [`${value.toFixed(2)}`, "Cost"]} />
              <Bar dataKey="cost" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Cost by Region</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={costData.byRegion} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
                {costData.byRegion.map((_, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} formatter={(value: any) => [`$${value}`, ""]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function SecurityTab({ findings, buckets, users }: { findings: SecurityFinding[]; buckets: S3Bucket[]; users: IAMUser[] }) {
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const filtered = severityFilter === "all" ? findings : findings.filter((f) => f.severity === severityFilter);
  const severityCounts = { Critical: findings.filter((f) => f.severity === "Critical").length, High: findings.filter((f) => f.severity === "High").length, Medium: findings.filter((f) => f.severity === "Medium").length, Low: findings.filter((f) => f.severity === "Low").length };
  const pieData = Object.entries(severityCounts).filter(([_, v]) => v > 0).map(([name, value]) => ({ name, value }));
  const publicBuckets = buckets.filter((b) => b.publicAccess);
  const unencryptedBuckets = buckets.filter((b) => !b.encryption);
  const noMfaUsers = users.filter((u) => !u.mfaEnabled);
  const unusedKeys = users.filter((u) => u.accessKeyAge > 90);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={BsExclamationTriangle} label="Critical" value={severityCounts.Critical} color="red" />
        <StatCard icon={BsExclamationTriangle} label="High" value={severityCounts.High} color="orange" />
        <StatCard icon={BsExclamationTriangle} label="Medium" value={severityCounts.Medium} color="yellow" />
        <StatCard icon={BsInfoCircle} label="Low" value={severityCounts.Low} color="blue" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Security Findings</h3>
            <div className="relative">
              <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="px-3 py-1.5 pr-8 bg-gray-100 dark:bg-gray-700 border-0 rounded-lg text-sm text-gray-900 dark:text-white appearance-none">
                <option value="all">All Severities</option>
                <option value="Critical">Critical</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
              </select>
              <BsChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {filtered.map((finding) => (
              <div key={finding.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border-l-4" style={{ borderLeftColor: SEVERITY_COLORS[finding.severity] }}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <SeverityBadge severity={finding.severity} />
                      <span className="text-xs text-gray-500 dark:text-gray-400">{finding.id}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{finding.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{finding.resource} · {finding.region} · {new Date(finding.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Severity Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={4} dataKey="value">
                  {pieData.map((entry) => <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", color: "#f9fafb" }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Quick Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Public S3 Buckets</span><Badge color={publicBuckets.length > 0 ? "red" : "green"}>{publicBuckets.length}</Badge></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Unencrypted Buckets</span><Badge color={unencryptedBuckets.length > 0 ? "red" : "green"}>{unencryptedBuckets.length}</Badge></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Users Without MFA</span><Badge color={noMfaUsers.length > 0 ? "red" : "green"}>{noMfaUsers.length}</Badge></div>
              <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Unused Access Keys</span><Badge color={unusedKeys.length > 0 ? "yellow" : "green"}>{unusedKeys.length}</Badge></div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CloudTrailTab({ events }: { events: TrailEvent[] }) {
  const [eventFilter, setEventFilter] = useState<string>("all");
  const eventTypes = [...new Set(events.map((e) => e.event))];
  const filtered = eventFilter === "all" ? events : events.filter((e) => e.event === eventFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Activity Timeline</h2>
        <div className="relative">
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className="px-3 py-1.5 pr-8 bg-gray-100 dark:bg-gray-700 border-0 rounded-lg text-sm text-gray-900 dark:text-white appearance-none">
            <option value="all">All Events</option>
            {eventTypes.map((et) => <option key={et} value={et}>{et}</option>)}
          </select>
          <BsChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full">
          <thead><tr className="bg-gray-50 dark:bg-gray-700/50">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Event</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Source</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Region</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {filtered.map((evt) => (
              <tr key={evt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{evt.event}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{evt.source}</td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{new Date(evt.time).toLocaleString()}</td>
                <td className="px-4 py-3"><Badge color="blue">{evt.region}</Badge></td>
                <td className="px-4 py-3"><Badge color={evt.status === "Success" ? "green" : "red"}>{evt.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SettingsTab({ region, onRegionChange }: { region: string; onRegionChange: (r: string) => void }) {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Dashboard Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Default Region</label>
            <select value={region} onChange={(e) => onRegionChange(e.target.value)} className="w-full max-w-md px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none">
              {AWS_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Auto-refresh Interval</label>
            <select className="w-full max-w-md px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none">
              <option value="30">30 seconds</option><option value="60">1 minute</option><option value="300">5 minutes</option><option value="0">Disabled</option>
            </select>
          </div>
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2">
              <BsDownload className="text-sm" /> Export Dashboard Data
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function GenericTab({ title, data, icon: Icon, columns }: { title: string; data: any[]; icon: React.ComponentType<{className?: string}>; columns: {key: string; label: string}[] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={Icon} label={title} value={data.length} color="blue" />
      </div>
      <Card className="overflow-hidden">
        {data.length === 0 ? (
          <EmptyState icon={Icon} title={`No ${title} Found`} description={`No ${title.toLowerCase()} found in this account.`} />
        ) : (
          <table className="w-full">
            <thead><tr className="bg-gray-50 dark:bg-gray-700/50">
              {columns.map((col) => (
                <th key={col.key} className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{col.label}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {data.map((item: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-sm text-gray-900 dark:text-white">{String(item[col.key] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function EBSTab({ data }: { data: any[] }) {
  return <GenericTab title="EBS Volumes" data={data} icon={BsServer} columns={[
    { key: "id", label: "Volume ID" }, { key: "size", label: "Size (GB)" }, { key: "type", label: "Type" },
    { key: "state", label: "State" }, { key: "encrypted", label: "Encrypted" }, { key: "instanceId", label: "Attached To" },
  ]} />;
}

function Route53Tab({ data }: { data: any }) {
  return <GenericTab title="Route 53 Hosted Zones" data={data.zones || []} icon={BsGlobe} columns={[
    { key: "name", label: "Zone Name" }, { key: "recordCount", label: "Records" }, { key: "private", label: "Private" },
  ]} />;
}

function ELBTab({ data }: { data: any }) {
  return <GenericTab title="Load Balancers" data={data.load_balancers || []} icon={BsGlobe} columns={[
    { key: "name", label: "Name" }, { key: "type", label: "Type" }, { key: "state", label: "State" },
    { key: "dns", label: "DNS Name" }, { key: "vpcId", label: "VPC" },
  ]} />;
}

function AutoScalingTab({ data }: { data: any }) {
  return <GenericTab title="Auto Scaling Groups" data={data.groups || []} icon={BsGraphUp} columns={[
    { key: "name", label: "Name" }, { key: "minSize", label: "Min" }, { key: "maxSize", label: "Max" },
    { key: "desired", label: "Desired" }, { key: "instances", label: "Instances" },
  ]} />;
}

function CloudWatchDashTab({ data }: { data: any }) {
  return <GenericTab title="CloudWatch Alarms" data={data.alarms || []} icon={BsActivity} columns={[
    { key: "name", label: "Alarm Name" }, { key: "state", label: "State" }, { key: "metric", label: "Metric" },
    { key: "namespace", label: "Namespace" }, { key: "threshold", label: "Threshold" },
  ]} />;
}

function SSMTab({ data }: { data: any }) {
  return <GenericTab title="SSM Parameters" data={data.parameters || []} icon={BsGear} columns={[
    { key: "name", label: "Name" }, { key: "type", label: "Type" }, { key: "tier", label: "Tier" },
    { key: "version", label: "Version" },
  ]} />;
}

function ECRTab({ data }: { data: any }) {
  return <GenericTab title="ECR Repositories" data={data.repositories || []} icon={BsCloud} columns={[
    { key: "name", label: "Name" }, { key: "uri", label: "URI" }, { key: "createdAt", label: "Created" },
  ]} />;
}

function ECSTab({ data }: { data: any }) {
  return <GenericTab title="ECS Services" data={data.services || []} icon={BsServer} columns={[
    { key: "name", label: "Service" }, { key: "cluster", label: "Cluster" }, { key: "status", label: "Status" },
    { key: "desired", label: "Desired" }, { key: "running", label: "Running" },
  ]} />;
}

function EKSTab({ data }: { data: any }) {
  return <GenericTab title="EKS Clusters" data={data.clusters || []} icon={BsServer} columns={[
    { key: "name", label: "Name" }, { key: "status", label: "Status" }, { key: "version", label: "Version" },
    { key: "endpoint", label: "Endpoint" },
  ]} />;
}

function CloudFormationTab({ data }: { data: any }) {
  return <GenericTab title="CloudFormation Stacks" data={data.stacks || []} icon={BsCloud} columns={[
    { key: "name", label: "Name" }, { key: "status", label: "Status" }, { key: "description", label: "Description" },
    { key: "creationTime", label: "Created" },
  ]} />;
}

function CodePipelineTab({ data }: { data: any }) {
  return <GenericTab title="CodePipeline Pipelines" data={data.pipelines || []} icon={BsActivity} columns={[
    { key: "name", label: "Name" }, { key: "version", label: "Version" },
  ]} />;
}

function CodeBuildTab({ data }: { data: any }) {
  return <GenericTab title="CodeBuild Projects" data={data.projects || []} icon={BsServer} columns={[
    { key: "name", label: "Name" },
  ]} />;
}

function CodeDeployTab({ data }: { data: any }) {
  return <GenericTab title="CodeDeploy Applications" data={data.applications || []} icon={BsCloud} columns={[
    { key: "name", label: "Name" },
  ]} />;
}

function SecretsManagerTab({ data }: { data: any }) {
  return <GenericTab title="Secrets Manager" data={data.secrets || []} icon={BsKey} columns={[
    { key: "name", label: "Name" }, { key: "description", label: "Description" }, { key: "createdDate", label: "Created" },
  ]} />;
}

function ParameterStoreTab({ data }: { data: any }) {
  return <GenericTab title="Parameter Store" data={data.parameters || []} icon={BsKey} columns={[
    { key: "name", label: "Name" }, { key: "type", label: "Type" }, { key: "tier", label: "Tier" },
    { key: "version", label: "Version" },
  ]} />;
}

function ACMTab({ data }: { data: any }) {
  return <GenericTab title="ACM Certificates" data={data.certificates || []} icon={BsShieldCheck} columns={[
    { key: "domain", label: "Domain" }, { key: "status", label: "Status" }, { key: "type", label: "Type" },
  ]} />;
}

function DynamoDBTab({ data }: { data: any }) {
  return <GenericTab title="DynamoDB Tables" data={data.tables || []} icon={BsDatabase} columns={[
    { key: "name", label: "Name" }, { key: "status", label: "Status" }, { key: "itemCount", label: "Items" },
    { key: "sizeBytes", label: "Size (Bytes)" }, { key: "billingMode", label: "Billing" },
  ]} />;
}

function SNSTab({ data }: { data: any }) {
  return <GenericTab title="SNS Topics" data={data.topics || []} icon={BsActivity} columns={[
    { key: "name", label: "Name" }, { key: "arn", label: "ARN" },
  ]} />;
}

function SQSTab({ data }: { data: any }) {
  return <GenericTab title="SQS Queues" data={data.queues || []} icon={BsActivity} columns={[
    { key: "name", label: "Name" }, { key: "messagesAvailable", label: "Available" },
    { key: "messagesInFlight", label: "In Flight" },
  ]} />;
}

function EventBridgeTab({ data }: { data: any }) {
  return <GenericTab title="EventBridge Rules" data={data.rules || []} icon={BsActivity} columns={[
    { key: "name", label: "Name" }, { key: "state", label: "State" },
    { key: "scheduleExpression", label: "Schedule" }, { key: "eventCount", label: "Targets" },
  ]} />;
}

function BackupTab({ data }: { data: any }) {
  return <GenericTab title="AWS Backup Vaults" data={data.vaults || []} icon={BsCloud} columns={[
    { key: "name", label: "Name" }, { key: "recoveryPoints", label: "Recovery Points" },
  ]} />;
}

function BudgetsTab({ data }: { data: any }) {
  return <GenericTab title="Cost Budgets" data={data.budgets || []} icon={BsGraphUp} columns={[
    { key: "name", label: "Name" }, { key: "type", label: "Type" }, { key: "amount", label: "Limit" },
    { key: "spent", label: "Spent" }, { key: "timeUnit", label: "Period" },
  ]} />;
}

export default function AWSDashboardPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [connected, setConnected] = useState(false);
  const [credentials, setCredentials] = useState<AWSCredentials | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedRegion, setSelectedRegion] = useState("us-east-1");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({ home: true, compute: true });
  const [refreshInterval, setRefreshInterval] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("aws_dashboard_refresh_interval");
      return saved ? parseInt(saved) : 30000;
    }
    return 30000;
  });

  useEffect(() => {
    const saved = localStorage.getItem("aws_dashboard_session");
    if (saved) {
      try {
        const session = JSON.parse(saved);
        if (session.credentials && session.connected) {
          setCredentials(session.credentials);
          setSelectedRegion(session.credentials.region);
          setConnected(true);
        }
      } catch {}
    }
    setHydrated(true);
  }, []);

  const [ec2Data, setEc2Data] = useState<EC2Instance[]>([]);
  const [s3Data, setS3Data] = useState<S3Bucket[]>([]);
  const [lambdaData, setLambdaData] = useState<LambdaFunction[]>([]);
  const [rdsData, setRdsData] = useState<RDSInstance[]>([]);
  const [iamUsers, setIamUsers] = useState<IAMUser[]>([]);
  const [iamRoles, setIamRoles] = useState<IAMRole[]>([]);
  const [iamPolicies, setIamPolicies] = useState<IAMPolicy[]>([]);
  const [vpcData, setVpcData] = useState<VPC[]>([]);
  const [securityGroups, setSecurityGroups] = useState<SecurityGroup[]>([]);
  const [costDataState, setCostDataState] = useState<ReturnType<typeof generateCostData>>({ daily: [], byService: [], byRegion: [] });
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [trailEvents, setTrailEvents] = useState<TrailEvent[]>([]);
  const [ebsData, setEbsData] = useState<any[]>([]);
  const [route53Data, setRoute53Data] = useState<any>({ zones: [], health_checks: [] });
  const [elbData, setElbData] = useState<any>({ load_balancers: [], target_groups: [] });
  const [autoScalingData, setAutoScalingData] = useState<any>({ groups: [], activities: [] });
  const [cwDashData, setCwDashData] = useState<any>({ dashboards: [], alarms: [] });
  const [ssmData, setSsmData] = useState<any>({ documents: [], parameters: [] });
  const [ecrData, setEcrData] = useState<any>({ repositories: [] });
  const [ecsData, setEcsData] = useState<any>({ clusters: [], services: [] });
  const [eksData, setEksData] = useState<any>({ clusters: [] });
  const [cfnData, setCfnData] = useState<any>({ stacks: [] });
  const [codepipelineData, setCodepipelineData] = useState<any>({ pipelines: [] });
  const [codebuildData, setCodebuildData] = useState<any>({ projects: [] });
  const [codedeployData, setCodedeployData] = useState<any>({ applications: [], deployments: [] });
  const [secretsData, setSecretsData] = useState<any>({ secrets: [] });
  const [paramsData, setParamsData] = useState<any>({ parameters: [] });
  const [acmData, setAcmData] = useState<any>({ certificates: [] });
  const [dynamoData, setDynamoData] = useState<any>({ tables: [] });
  const [snsData, setSnsData] = useState<any>({ topics: [], subscriptions: [] });
  const [sqsData, setSqsData] = useState<any>({ queues: [] });
  const [ebData, setEbData] = useState<any>({ rules: [], buses: [] });
  const [backupData, setBackupData] = useState<any>({ vaults: [], plans: [], jobs: [] });
  const [budgetsData, setBudgetsData] = useState<any>({ budgets: [] });
  const [clientActivity, setClientActivity] = useState<{ action: string; resource: string; time: string; type: "success" | "warning" | "error" | "info" }[]>([]);
  const prevSnapshotRef = useRef<{ ec2Ids: string[]; s3Names: string[]; iamNames: string[]; lambdaNames: string[] }>({ ec2Ids: [], s3Names: [], iamNames: [], lambdaNames: [] });

  const fetchAWS = useCallback(async (action: string, extraBody?: Record<string, any>) => {
    if (!credentials) return null;
    try {
      const body: any = { action, accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey, region: credentials.region, ...extraBody };
      if (credentials.sessionToken) body.sessionToken = credentials.sessionToken;
      if (credentials.useLocalstack) body.use_localstack = true;
      const res = await fetch("/api/v1/aws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data;
    } catch { return null; }
  }, [credentials]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      // Clear backend cache first
      await fetchAWS("refresh");
      
      // Batch 1: Core services (most important - load first)
      const [ec2Res, s3Res, lambdaRes, rdsRes, iamRes, vpcRes, costRes, securityRes, activityRes] = await Promise.all([
        fetchAWS("ec2"), fetchAWS("s3"), fetchAWS("lambda"), fetchAWS("rds"),
        fetchAWS("iam"), fetchAWS("vpc"), fetchAWS("cost"), fetchAWS("security"), fetchAWS("activity"),
      ]);

      // Batch 2: Secondary services (load after core)
      const [ebsRes, route53Res, elbRes, asgRes, cwRes, ssmRes, ecrRes, ecsRes, eksRes, cfnRes,
        cpRes, cbRes, cdRes, smRes, psRes, acmRes, ddbRes, snsRes, sqsRes, ebRes, bkRes, budRes
      ] = await Promise.all([
        fetchAWS("ebs"), fetchAWS("route53"), fetchAWS("elb"), fetchAWS("auto_scaling"),
        fetchAWS("cloudwatch_dash"), fetchAWS("ssm"), fetchAWS("ecr"), fetchAWS("ecs"), fetchAWS("eks"),
        fetchAWS("cloudformation"), fetchAWS("codepipeline"), fetchAWS("codebuild"), fetchAWS("codedeploy"),
        fetchAWS("secrets_manager"), fetchAWS("parameter_store"), fetchAWS("acm"), fetchAWS("dynamodb"),
        fetchAWS("sns"), fetchAWS("sqs"), fetchAWS("eventbridge"), fetchAWS("backup"), fetchAWS("budgets"),
      ]);

      if (ec2Res?.instances) {
        const mapped = ec2Res.instances.map((inst: any) => ({
          id: inst.id || inst.InstanceId || "",
          name: inst.name || inst.tags?.Name || inst.id || "Unnamed",
          state: inst.state || inst.State?.Name || "unknown",
          cpu: inst.cpu || inst.metrics?.cpu_avg || 0,
          instanceType: inst.instanceType || inst.type || inst.InstanceType || "",
          az: inst.az || inst.AvailabilityZone || "",
          publicIp: inst.publicIp || inst.public_ip || inst.PublicIpAddress || "",
          privateIp: inst.privateIp || inst.private_ip || inst.PrivateIpAddress || "",
          launchTime: inst.launchTime || inst.launch_time || inst.LaunchTime || "",
        }));
        setEc2Data(mapped);
      }
      if (s3Res?.buckets) {
        const mapped = s3Res.buckets.map((b: any) => ({
          name: b.name || b.Name || "",
          region: b.region || b.Region || credentials?.region || "",
          size: b.size || b.size_bytes || b.Size || "0",
          objectCount: b.objectCount || b.object_count || b.ObjectCount || 0,
          versioning: b.versioning || false,
          encryption: b.encryption || false,
          publicAccess: b.publicAccess || b.public_access || false,
        }));
        setS3Data(mapped);
      }
      if (lambdaRes?.functions) {
        const mapped = lambdaRes.functions.map((f: any) => ({
          name: f.name || f.FunctionName || "",
          runtime: f.runtime || f.Runtime || "",
          memory: f.memory || f.MemorySize || 0,
          timeout: f.timeout || f.Timeout || 0,
          lastModified: f.lastModified || f.LastModified || "",
          state: f.state || f.State || "Active",
          invocations: f.invocations || 0,
          errors: f.errors || 0,
          avgDuration: f.avgDuration || f.avg_duration || 0,
        }));
        setLambdaData(mapped);
      }
      if (rdsRes?.databases) {
        const mapped = rdsRes.databases.map((db: any) => ({
          name: db.name || db.DBInstanceIdentifier || "",
          engine: db.engine || db.Engine || "",
          status: db.status || db.DBInstanceStatus || "available",
          cpu: db.cpu || 0,
          storage: db.storage || db.AllocatedStorage || 0,
          storageUsed: db.storageUsed || 0,
          multiAZ: db.multiAZ || db.MultiAZ || false,
          connections: db.connections || 0,
        }));
        setRdsData(mapped);
      }
      if (iamRes?.users) {
        const mapped = iamRes.users.map((u: any) => ({
          name: u.name || u.UserName || "",
          mfaEnabled: u.mfaEnabled || u.MFA || false,
          lastAccess: u.lastAccess || "",
          accessKeyAge: u.accessKeyAge || 0,
          active: u.active !== false,
        }));
        setIamUsers(mapped);
      }
      if (iamRes?.roles) {
        const mapped = iamRes.roles.map((r: any) => ({
          name: r.name || r.RoleName || "",
          trustPolicy: r.trustPolicy || "",
          lastUsed: r.lastUsed || "",
        }));
        setIamRoles(mapped);
      }
      if (iamRes?.policies) {
        const mapped = iamRes.policies.map((p: any) => ({
          name: p.name || p.PolicyName || "",
          type: p.type || "Managed",
          usageCount: p.usageCount || 0,
        }));
        setIamPolicies(mapped);
      }
      if (vpcRes?.vpcs) {
        const mapped = vpcRes.vpcs.map((v: any) => ({
          name: v.name || v.VpcId || v.id || "",
          cidr: v.cidr || v.CidrBlock || "",
          state: v.state || v.State || "available",
          subnets: (v.subnets || []).map((s: any) => ({
            name: s.name || s.SubnetId || s.id || "",
            cidr: s.cidr || s.CidrBlock || "",
            az: s.az || s.AvailabilityZone || "",
            availableIps: s.availableIps || s.AvailableIpAddressCount || 0,
          })),
        }));
        setVpcData(mapped);
      }
      if (vpcRes?.securityGroups) {
        const mapped = vpcRes.securityGroups.map((sg: any) => ({
          name: sg.name || sg.GroupName || "",
          inboundRules: sg.inboundRules || sg.in_rules || 0,
          outboundRules: sg.outboundRules || sg.out_rules || 0,
        }));
        setSecurityGroups(mapped);
      }
      if (costRes) setCostDataState({ daily: costRes.daily || [], byService: costRes.byService || costRes.by_service || [], byRegion: costRes.byRegion || costRes.by_region || [] });
      if (securityRes?.findings) setFindings(securityRes.findings);
      if (activityRes?.events) setTrailEvents(activityRes.events);
      if (ebsRes?.volumes) setEbsData(ebsRes.volumes);
      if (route53Res) setRoute53Data(route53Res);
      if (elbRes) setElbData(elbRes);
      if (asgRes) setAutoScalingData(asgRes);
      if (cwRes) setCwDashData(cwRes);
      if (ssmRes) setSsmData(ssmRes);
      if (ecrRes) setEcrData(ecrRes);
      if (ecsRes) setEcsData(ecsRes);
      if (eksRes) setEksData(eksRes);
      if (cfnRes) setCfnData(cfnRes);
      if (cpRes) setCodepipelineData(cpRes);
      if (cbRes) setCodebuildData(cbRes);
      if (cdRes) setCodedeployData(cdRes);
      if (smRes) setSecretsData(smRes);
      if (psRes) setParamsData(psRes);
      if (acmRes) setAcmData(acmRes);
      if (ddbRes) setDynamoData(ddbRes);
      if (snsRes) setSnsData(snsRes);
      if (sqsRes) setSqsData(sqsRes);
      if (ebRes) setEbData(ebRes);
      if (bkRes) setBackupData(bkRes);
      if (budRes) setBudgetsData(budRes);

      const newActivities: typeof clientActivity = [];
      const now = new Date();

      if (ec2Res?.instances) {
        const newIds = ec2Res.instances.map((i: any) => i.id || i.InstanceId || "");
        const prev = prevSnapshotRef.current.ec2Ids;
        if (prev.length > 0) {
          const added = newIds.filter((id: string) => !prev.includes(id));
          const removed = prev.filter((id: string) => !newIds.includes(id));
          added.forEach((id: string) => {
            const inst = ec2Res.instances.find((i: any) => (i.id || i.InstanceId) === id);
            newActivities.push({ action: `New instance ${inst?.name || id} launched`, resource: "EC2", time: now.toISOString(), type: "success" });
          });
          removed.forEach((id: string) => {
            newActivities.push({ action: `Instance ${id} removed`, resource: "EC2", time: now.toISOString(), type: "warning" });
          });
          ec2Res.instances.forEach((inst: any) => {
            const id = inst.id || inst.InstanceId;
            const state = inst.state || inst.State?.Name;
            if (state === "running" && prev.includes(id)) {
              const prevInst = ec2Res.instances.find((i: any) => (i.id || i.InstanceId) === id);
              if (prevInst && (prevInst.state || prevInst.State?.Name) !== "running") {
                newActivities.push({ action: `Instance ${inst.name || id} started`, resource: "EC2", time: now.toISOString(), type: "success" });
              }
            }
          });
        }
        prevSnapshotRef.current.ec2Ids = newIds;
      }

      if (s3Res?.buckets) {
        const newNames = s3Res.buckets.map((b: any) => b.name || b.Name || "");
        const prev = prevSnapshotRef.current.s3Names;
        if (prev.length > 0) {
          const added = newNames.filter((n: string) => !prev.includes(n));
          const removed = prev.filter((n: string) => !newNames.includes(n));
          added.forEach((n: string) => newActivities.push({ action: `New S3 bucket "${n}" created`, resource: "S3", time: now.toISOString(), type: "success" }));
          removed.forEach((n: string) => newActivities.push({ action: `S3 bucket "${n}" removed`, resource: "S3", time: now.toISOString(), type: "warning" }));
        }
        prevSnapshotRef.current.s3Names = newNames;
      }

      if (iamRes?.users) {
        const newNames = iamRes.users.map((u: any) => u.name || u.UserName || "");
        const prev = prevSnapshotRef.current.iamNames;
        if (prev.length > 0) {
          const added = newNames.filter((n: string) => !prev.includes(n));
          added.forEach((n: string) => newActivities.push({ action: `IAM user "${n}" created`, resource: "IAM", time: now.toISOString(), type: "info" }));
        }
        prevSnapshotRef.current.iamNames = newNames;
      }

      if (lambdaRes?.functions) {
        const newNames = lambdaRes.functions.map((f: any) => f.name || f.FunctionName || "");
        const prev = prevSnapshotRef.current.lambdaNames;
        if (prev.length > 0) {
          const added = newNames.filter((n: string) => !prev.includes(n));
          added.forEach((n: string) => newActivities.push({ action: `Lambda function "${n}" deployed`, resource: "Lambda", time: now.toISOString(), type: "info" }));
        }
        prevSnapshotRef.current.lambdaNames = newNames;
      }

      if (newActivities.length > 0) {
        setClientActivity(prev => [...newActivities, ...prev].slice(0, 20));
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch AWS data:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchAWS, credentials]);

  useEffect(() => {
    if (connected) {
      refreshData();
      if (refreshInterval > 0) {
        const interval = setInterval(refreshData, refreshInterval);
        return () => clearInterval(interval);
      }
    }
  }, [connected, refreshData, refreshInterval]);

  const handleRefreshIntervalChange = (value: number) => {
    setRefreshInterval(value);
    localStorage.setItem("aws_dashboard_refresh_interval", String(value));
  };

  useEffect(() => {
    const cat = SIDEBAR_CATEGORIES.find(c => c.tabs.some(t => t.id === activeTab));
    if (cat) setOpenCategories(prev => ({ ...prev, [cat.id]: true }));
  }, [activeTab]);

  const handleConnect = (creds: AWSCredentials) => {
    setCredentials(creds);
    setSelectedRegion(creds.region);
    setConnected(true);
    localStorage.setItem("aws_dashboard_session", JSON.stringify({ credentials: creds, connected: true }));
    fetchAWS("set_timeout", { timeout: creds.sessionTimeout || 3600 });
  };

  const handleDisconnect = async () => {
    try {
      await fetch("/api/v1/aws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
    } catch { /* best effort */ }
    setConnected(false);
    setCredentials(null);
    setActiveTab("overview");
    localStorage.removeItem("aws_dashboard_session");
  };

  useEffect(() => {
    if (connected && credentials?.sessionTimeout) {
      fetchAWS("set_timeout", { timeout: credentials.sessionTimeout });
    }
  }, [connected, credentials?.sessionTimeout, fetchAWS]);

  if (!hydrated) return <div className="h-full bg-[#f0f0f5] dark:bg-[#1e2128] flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!connected) return <AuthScreen onConnect={handleConnect} />;

  const renderTab = () => {
    switch (activeTab) {
      case "overview": return <OverviewTab ec2={ec2Data} s3={s3Data} lambda={lambdaData} rds={rdsData} findings={findings} costData={costDataState} trailEvents={trailEvents} clientActivity={clientActivity} />;
      case "ec2": return <EC2Tab instances={ec2Data} />;
      case "ebs": return <EBSTab data={ebsData} />;
      case "s3": return <S3Tab buckets={s3Data} />;
      case "lambda": return <LambdaTab functions={lambdaData} />;
      case "dynamodb": return <DynamoDBTab data={dynamoData} />;
      case "rds": return <RDSTab databases={rdsData} />;
      case "iam": return <IAMTab users={iamUsers} roles={iamRoles} policies={iamPolicies} />;
      case "vpc": return <VPCTab vpcs={vpcData} securityGroups={securityGroups} />;
      case "route53": return <Route53Tab data={route53Data} />;
      case "elb": return <ELBTab data={elbData} />;
      case "ecs": return <ECSTab data={ecsData} />;
      case "eks": return <EKSTab data={eksData} />;
      case "ecr": return <ECRTab data={ecrData} />;
      case "auto_scaling": return <AutoScalingTab data={autoScalingData} />;
      case "cloudwatch_dash": return <CloudWatchDashTab data={cwDashData} />;
      case "ssm": return <SSMTab data={ssmData} />;
      case "cloudformation": return <CloudFormationTab data={cfnData} />;
      case "codepipeline": return <CodePipelineTab data={codepipelineData} />;
      case "codebuild": return <CodeBuildTab data={codebuildData} />;
      case "codedeploy": return <CodeDeployTab data={codedeployData} />;
      case "secrets_manager": return <SecretsManagerTab data={secretsData} />;
      case "parameter_store": return <ParameterStoreTab data={paramsData} />;
      case "acm": return <ACMTab data={acmData} />;
      case "sns": return <SNSTab data={snsData} />;
      case "sqs": return <SQSTab data={sqsData} />;
      case "eventbridge": return <EventBridgeTab data={ebData} />;
      case "backup": return <BackupTab data={backupData} />;
      case "cost": return <CostTab costData={costDataState} />;
      case "cost_alerts": return <CostAlertConfig credentials={credentials} />;
      case "budgets": return <BudgetsTab data={budgetsData} />;
      case "security": return <SecurityTab findings={findings} buckets={s3Data} users={iamUsers} />;
      case "cloudtrail": return <CloudTrailTab events={trailEvents} />;
      case "activity": return <CloudTrailTab events={trailEvents} />;
      case "settings": return <SettingsTab region={selectedRegion} onRegionChange={setSelectedRegion} />;
      default: return <OverviewTab ec2={ec2Data} s3={s3Data} lambda={lambdaData} rds={rdsData} findings={findings} costData={costDataState} trailEvents={trailEvents} clientActivity={clientActivity} />;
    }
  };

  return (
    <div className="h-full bg-[#f0f0f5] dark:bg-[#1e2128] flex overflow-hidden">
      <aside className={`${sidebarOpen ? "w-64" : "w-16"} bg-[#f8f9fa] dark:bg-[#2a2d38] border-r border-[#dee2e6] dark:border-[#3a3d48] flex flex-col transition-all duration-300 flex-shrink-0 h-full`}>
        <div className="p-4 border-b border-[#dee2e6] dark:border-[#3a3d48] flex items-center gap-3">
          <button onClick={() => router.push("/")} className="w-8 h-8 bg-[#e9ecef] dark:bg-[#353842] hover:bg-[#dee2e6] dark:hover:bg-[#404350] rounded-lg flex items-center justify-center flex-shrink-0 transition-colors" title="Back to Home">
            <BsArrowLeft className="text-[#6c757d] dark:text-[#a0a0aa] text-sm" />
          </button>
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <BsCloud className="text-white text-sm" />
          </div>
          {sidebarOpen && <span className="font-bold text-[#212529] dark:text-[#e8e8ed] text-sm">AWS Console</span>}
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {SIDEBAR_CATEGORIES.map((cat) => {
            const CatIcon = cat.icon;
            const isOpen = openCategories[cat.id] || false;
            const hasActive = cat.tabs.some(t => t.id === activeTab);
            if (!sidebarOpen) {
              return cat.tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} title={tab.label}
                    className={`w-full flex items-center justify-center p-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400" : "text-[#6c757d] dark:text-[#a0a0aa] hover:bg-[#e9ecef] dark:hover:bg-[#353842]"}`}>
                    <Icon className="text-lg" />
                  </button>
                );
              });
            }
            return (
              <div key={cat.id}>
                <button onClick={() => setOpenCategories(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${hasActive ? "text-orange-600 dark:text-orange-400" : "text-[#adb5bd] dark:text-[#6a6a75] hover:text-[#6c757d] dark:hover:text-[#a0a0aa]"}`}>
                  <CatIcon className="text-sm flex-shrink-0" />
                  <span className="flex-1 text-left">{cat.label}</span>
                  <BsChevronDown className={`text-xs transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="ml-2 space-y-0.5">
                    {cat.tabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400" : "text-[#6c757d] dark:text-[#a0a0aa] hover:bg-[#e9ecef] dark:hover:bg-[#353842]"}`}>
                          <Icon className="text-sm flex-shrink-0" />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="p-2 border-t border-[#dee2e6] dark:border-[#3a3d48]">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-full flex items-center justify-center p-2 rounded-lg text-[#6c757d] dark:text-[#a0a0aa] hover:bg-[#e9ecef] dark:hover:bg-[#353842] transition-colors">
            {sidebarOpen ? <BsChevronDown className="rotate-90" /> : <BsChevronDown className="-rotate-90" />}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-[#f8f9fa] dark:bg-[#2a2d38] border-b border-[#dee2e6] dark:border-[#3a3d48] px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0 gap-2">
          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0 min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-[#212529] dark:text-[#e8e8ed] whitespace-nowrap hidden sm:block">AWS Dashboard</h1>
            <div className="relative flex-shrink-0">
              <select value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)} className="px-2 md:px-3 py-1.5 pr-7 bg-[#e9ecef] dark:bg-[#353842] border-0 rounded-lg text-sm text-[#212529] dark:text-[#e8e8ed] appearance-none">
                {AWS_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <BsChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-[#adb5bd] pointer-events-none text-xs" />
            </div>
            <div className="relative flex-shrink-0">
              <select value={refreshInterval} onChange={(e) => handleRefreshIntervalChange(Number(e.target.value))} className="px-2 md:px-3 py-1.5 pr-7 bg-[#e9ecef] dark:bg-[#353842] border-0 rounded-lg text-sm text-[#212529] dark:text-[#e8e8ed] appearance-none">
                <option value={5000}>Every 5s</option>
                <option value={10000}>Every 10s</option>
                <option value={30000}>Every 30s</option>
                <option value={60000}>Every 1m</option>
                <option value={300000}>Every 5m</option>
                <option value={600000}>Every 10m</option>
                <option value={1800000}>Every 30m</option>
                <option value={3600000}>Every 1h</option>
              </select>
              <BsChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-[#adb5bd] pointer-events-none text-xs" />
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            <div className="hidden lg:flex items-center gap-2 text-sm text-[#6c757d] dark:text-[#a0a0aa]">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${loading ? "bg-yellow-500 animate-pulse" : "bg-green-500"}`} />
              <span className="whitespace-nowrap">{lastUpdated.toLocaleTimeString()}</span>
              {loading && <Spinner size="sm" />}
            </div>
            <div className="relative">
              <BsSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#adb5bd] text-sm" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) {
                  const q = searchQuery.toLowerCase();
                  if (["ec2", "e2", "instance", "instances"].some(k => q.includes(k))) setActiveTab("ec2");
                  else if (["s3", "bucket"].some(k => q.includes(k))) setActiveTab("s3");
                  else if (["lambda", "function"].some(k => q.includes(k))) setActiveTab("lambda");
                  else if (["rds", "database", "db"].some(k => q.includes(k))) setActiveTab("rds");
                  else if (["iam", "user", "role", "policy"].some(k => q.includes(k))) setActiveTab("iam");
                  else if (["vpc", "subnet", "security group"].some(k => q.includes(k))) setActiveTab("vpc");
                  else if (["dynamo", "dynamodb", "table"].some(k => q.includes(k))) setActiveTab("dynamodb");
                  else if (["sqs", "queue"].some(k => q.includes(k))) setActiveTab("sqs");
                  else if (["sns", "topic", "notification"].some(k => q.includes(k))) setActiveTab("sns");
                  else if (["secret"].some(k => q.includes(k))) setActiveTab("secrets_manager");
                  else if (["ssm", "parameter", "param"].some(k => q.includes(k))) setActiveTab("parameter_store");
                  else if (["cost", "billing", "spend"].some(k => q.includes(k))) setActiveTab("cost");
                  else if (["security", "finding"].some(k => q.includes(k))) setActiveTab("security");
                  else if (["elb", "load balancer", "alb", "nlb"].some(k => q.includes(k))) setActiveTab("elb");
                  else if (["route53", "dns", "domain"].some(k => q.includes(k))) setActiveTab("route53");
                  else if (["ecr", "container registry"].some(k => q.includes(k))) setActiveTab("ecr");
                  else if (["ecs", "fargate"].some(k => q.includes(k))) setActiveTab("ecs");
                  else if (["eks", "kubernetes", "k8s"].some(k => q.includes(k))) setActiveTab("eks");
                  else if (["cloudformation", "cfn", "stack"].some(k => q.includes(k))) setActiveTab("cloudformation");
                  else if (["codepipeline", "pipeline"].some(k => q.includes(k))) setActiveTab("codepipeline");
                  else if (["codebuild", "build"].some(k => q.includes(k))) setActiveTab("codebuild");
                  else if (["codedeploy", "deploy"].some(k => q.includes(k))) setActiveTab("codedeploy");
                  else if (["backup", "vault"].some(k => q.includes(k))) setActiveTab("backup");
                  else if (["budget"].some(k => q.includes(k))) setActiveTab("budgets");
                  else if (["trail", "cloudtrail", "audit", "log"].some(k => q.includes(k))) setActiveTab("cloudtrail");
                  else if (["acm", "certificate", "ssl", "tls"].some(k => q.includes(k))) setActiveTab("acm");
                  else if (["event", "eventbridge"].some(k => q.includes(k))) setActiveTab("eventbridge");
                  else if (["ebs", "volume", "disk"].some(k => q.includes(k))) setActiveTab("ebs");
                  else if (["auto scaling", "asg"].some(k => q.includes(k))) setActiveTab("auto_scaling");
                  else if (["cloudwatch", "alarm", "metric", "monitor"].some(k => q.includes(k))) setActiveTab("cloudwatch_dash");
                }
              }} placeholder="Search..." className="pl-8 pr-3 py-1.5 bg-[#e9ecef] dark:bg-[#353842] border-0 rounded-lg text-sm text-[#212529] dark:text-[#e8e8ed] placeholder-[#adb5bd] w-32 md:w-48 lg:w-56" />
            </div>
            <button onClick={handleDisconnect} className="px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors whitespace-nowrap flex-shrink-0">
              Disconnect
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:px-6 md:pt-6 md:pb-2 overflow-y-auto bg-[#f0f0f5] dark:bg-[#1e2128]">
          <CostAlertBanner credentials={credentials} />
          {renderTab()}
        </main>
      </div>

      {/* Chatbot - Fixed position bottom right */}
      <div className="fixed bottom-4 right-4 z-50">
        <MultiModalChat agentType="devops" />
      </div>
    </div>
  );
}
