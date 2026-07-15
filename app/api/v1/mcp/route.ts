import { NextResponse } from "next/server";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

const ENV_MCP_NAMES = ['production', 'staging', 'development'] as const;
type EnvName = typeof ENV_MCP_NAMES[number];

const ENV_CONFIG: Record<EnvName, { scriptName: string; port: number; workspace: string }> = {
  development: { scriptName: 'dev', port: 8082, workspace: '/home/bsetec/workspaces/dev' },
  staging: { scriptName: 'staging', port: 8081, workspace: '/home/bsetec/workspaces/staging' },
  production: { scriptName: 'prod', port: 8080, workspace: '/home/bsetec/workspaces/prod' },
};

const activeProcesses: Partial<Record<EnvName, import('child_process').ChildProcess>> = {};

const runOpenClaw = (args: string[], timeout = 30000): Promise<string> => {
  return new Promise((resolve, reject) => {
    const child = spawn('openclaw', args, { timeout });
    let stdout = '', stderr = '';
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr || `Exit code ${code}`));
      else resolve(stdout);
    });
    child.on('error', (err) => reject(err));
  });
};

const checkPort = async (port: number): Promise<boolean> => {
  try {
    const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    return data.status === 'running';
  } catch {
    return false;
  }
};

export async function GET() {
  let allMcpStatus: { name: string; ok: boolean }[] = [];

  try {
    const statusJson = await runOpenClaw(['mcp', 'status', '--json'], 15000);
    const parsed = JSON.parse(statusJson);
    type McpStatusItem = { name: string; ok: boolean };
    allMcpStatus = (parsed.servers || []).map((s: McpStatusItem) => ({ name: s.name, ok: s.ok }));
  } catch { allMcpStatus = []; }

  const servers = await Promise.all(ENV_MCP_NAMES.map(async (name) => {
    const cfg = ENV_CONFIG[name];
    const running = await checkPort(cfg.port);
    const toolNames = [`${cfg.scriptName}-filesystem`, `${cfg.scriptName}-github`];
    const envTools = allMcpStatus.filter((s) => toolNames.includes(s.name));

    return {
      id: `mcp-${name}`,
      name: `${name.charAt(0).toUpperCase() + name.slice(1)} MCP`,
      status: running ? 'running' as const : 'stopped' as const,
      endpoint: `/api/v1/${name}`,
      port: cfg.port,
      lastStarted: running ? new Date().toISOString() : undefined,
      mcpServers: envTools,
    };
  }));

  return NextResponse.json({ servers, mcpStatus: allMcpStatus });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { server, action, repoUrl } = body;

    if (server && (action === 'start' || action === 'stop')) {
      if (!ENV_MCP_NAMES.includes(server)) {
        return NextResponse.json({ success: false, error: `Unknown environment: ${server}` }, { status: 400 });
      }

      const envName = server as EnvName;
      const cfg = ENV_CONFIG[envName];

      if (action === 'start') {
        const alreadyRunning = await checkPort(cfg.port);
        if (alreadyRunning) {
          return NextResponse.json({ success: true, message: `${server} MCP already running on port ${cfg.port}` });
        }

        const scriptPath = path.join(process.cwd(), 'scripts', 'mcp-env-server.js');
        if (!fs.existsSync(scriptPath)) {
          return NextResponse.json({ success: false, error: `Server script not found: ${scriptPath}` }, { status: 500 });
        }

        return new Promise<Response>((resolve) => {
          const child = spawn('node', [scriptPath, cfg.scriptName], {
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false,
          });

          let started = false;
          child.stdout?.on('data', (data: Buffer) => {
            const msg = data.toString();
            console.log(`[${server} MCP] ${msg.trim()}`);
            if (msg.includes('Running on port') && !started) {
              started = true;
              activeProcesses[envName] = child;
              resolve(NextResponse.json({
                success: true,
                message: `${server} MCP started on port ${cfg.port}`,
                server: { name: server, status: 'running', port: cfg.port },
              }));
            }
          });

          child.stderr?.on('data', (data: Buffer) => {
            console.error(`[${server} MCP ERR] ${data.toString().trim()}`);
          });

          child.on('error', (err) => {
            if (!started) {
              started = true;
              resolve(NextResponse.json({ success: false, error: err.message }, { status: 500 }));
            }
          });

          child.on('close', (code) => {
            delete activeProcesses[envName];
            if (!started) {
              started = true;
              resolve(NextResponse.json({
                success: false,
                error: `Process exited with code ${code}`,
              }, { status: 500 }));
            }
          });

          setTimeout(() => {
            if (!started) {
              started = true;
              resolve(NextResponse.json({
                success: false, error: 'Timeout waiting for MCP server to start',
              }, { status: 500 }));
            }
          }, 10000);
        });
      }

      if (action === 'stop') {
        const child = activeProcesses[envName];
        if (child) {
          child.kill('SIGTERM');
          delete activeProcesses[envName];
          setTimeout(() => {
            try { child.kill('SIGKILL'); } catch {}
          }, 3000);
        }

        try {
          await execAsync(`kill $(lsof -ti:${cfg.port}) 2>/dev/null || true`);
        } catch {}

        return NextResponse.json({
          success: true,
          message: `${server} MCP stopped (port ${cfg.port})`,
          server: { name: server, status: 'stopped' },
        });
      }
    }

    if (action === 'clone' && repoUrl) {
      const env = body.env as EnvName | undefined;
      const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'unknown-repo';
      const cloneDir = env && ENV_CONFIG[env]
        ? path.join(ENV_CONFIG[env].workspace, 'cloned-repos', repoName)
        : path.join(process.cwd(), process.env.CLONE_DIR || 'cloned-repos', repoName);
      const baseDir = path.dirname(cloneDir);
      if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

      try {
        if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true });
        const startTime = Date.now();
        const { stdout } = await execAsync(`git clone --depth 1 ${repoUrl} "${cloneDir}"`, { timeout: 120000 });
        const durationMs = Date.now() - startTime;
        return NextResponse.json({
          success: true, message: `Cloned ${repoUrl}`,
          repoUrl, repoName, status: 'success',
          duration: `${(durationMs / 1000).toFixed(1)}s`, path: cloneDir, output: stdout,
        });
      } catch (execError: unknown) {
        const err = execError as { message?: string; stderr?: string };
        return NextResponse.json({
          success: false, error: err.stderr || err.message || 'Clone failed',
          repoUrl, repoName, status: 'failed',
        });
      }
    }

    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
