import { NextResponse } from "next/server";
import { exec, spawn, execSync } from "child_process";
import { promisify } from "util";
import pathModule from "path";
import fs from "fs";

const execAsync = promisify(exec);

const ENV_CONFIG: Record<string, { url: string; workspace: string; name: string; port: number }> = {
  dev: {
    url: process.env.MCP_DEV_URL || 'http://localhost:8082',
    workspace: process.env.MCP_DEV_WORKSPACE || '/home/bsetec/workspaces/dev',
    name: 'Development',
    port: parseInt(process.env.MCP_DEV_PORT || '8082'),
  },
  staging: {
    url: process.env.MCP_STAGING_URL || 'http://localhost:8081',
    workspace: process.env.MCP_STAGING_WORKSPACE || '/home/bsetec/workspaces/staging',
    name: 'Staging',
    port: parseInt(process.env.MCP_STAGING_PORT || '8081'),
  },
  prod: {
    url: process.env.MCP_PROD_URL || 'http://localhost:8083',
    workspace: process.env.MCP_PROD_WORKSPACE || '/home/bsetec/workspaces/prod',
    name: 'Production',
    port: parseInt(process.env.MCP_PROD_PORT || '8083'),
  },
};

const VALID_ENVS = ['dev', 'staging', 'prod'];
const activeProcesses: Record<string, import('child_process').ChildProcess> = {};
// Track current working directory per env (relative to workspace)
const currentCwd: Record<string, string> = {};

async function proxyToMcp(url: string, path: string, options?: RequestInit): Promise<Response> {
  const target = `${url.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  return fetch(target, {
    ...options,
    signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ env: string }> },
) {
  const { env } = await params;
  if (!VALID_ENVS.includes(env)) {
    return NextResponse.json({ success: false, error: `Invalid environment: ${env}` }, { status: 400 });
  }

  const cfg = ENV_CONFIG[env];
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path') || '';
  const action = searchParams.get('action') || 'health';

  try {
    if (action === 'health') {
      const healthRes = await proxyToMcp(cfg.url, 'health');
      const health = await healthRes.json();
      return NextResponse.json({
        success: true,
        environment: env,
        status: health.status === 'running' ? 'running' : 'stopped',
        url: cfg.url,
        workspace: cfg.workspace,
      });
    }

    if (action === 'files') {
      const dir = searchParams.get('dir') || '.';
      const cwd = currentCwd[env] || '.';
      const targetDir = dir === '.' ? cwd : pathModule.join(cwd, dir);
      const res = await proxyToMcp(cfg.url, `files?dir=${encodeURIComponent(targetDir)}`);
      const data = await res.json();
      return NextResponse.json({ success: true, items: data.items || data, path: data.path || pathModule.join(cfg.workspace, targetDir), cwd: targetDir });
    }

    if (action === 'file') {
      const cwd = currentCwd[env] || '.';
      const fullPath = path.startsWith('/') ? path : pathModule.join(cwd, path);
      const res = await proxyToMcp(cfg.url, `file?path=${encodeURIComponent(fullPath)}`);
      const data = await res.json();
      return NextResponse.json({ success: true, content: data.content || data, path: data.path || pathModule.join(cfg.workspace, fullPath), cwd });
    }

    if (action === 'cwd') {
      const cwd = currentCwd[env] || '.';
      const fullPath = cwd === '.' ? cfg.workspace : pathModule.join(cfg.workspace, cwd);
      return NextResponse.json({ success: true, cwd, fullPath, workspace: cfg.workspace });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({
      success: false,
      error: `Cannot reach MCP server at ${cfg.url}: ${err.message || 'Connection failed'}`,
      environment: env,
    }, { status: 502 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ env: string }> },
) {
  const { env } = await params;
  if (!VALID_ENVS.includes(env)) {
    return NextResponse.json({ success: false, error: `Invalid environment: ${env}` }, { status: 400 });
  }

  const cfg = ENV_CONFIG[env];

  try {
    const body = await req.json();
    const { action, repoUrl, command, path, content, gitUsername, gitPassword } = body;

    if (action === 'start') {
      if (activeProcesses[env]) {
        return NextResponse.json({ success: true, message: `${cfg.name} MCP already running` });
      }

      const scriptPath = pathModule.join(process.cwd(), 'scripts', 'mcp-env-server.js');
      if (!fs.existsSync(scriptPath)) {
        return NextResponse.json({ success: false, error: `Server script not found: ${scriptPath}` }, { status: 500 });
      }

      const child = spawn('node', [scriptPath, env], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
      });
      child.unref();

      activeProcesses[env] = child;

      child.on('error', () => { delete activeProcesses[env]; });
      child.on('exit', () => { delete activeProcesses[env]; });

      // Wait briefly for server to start
      await new Promise((r) => setTimeout(r, 1500));

      return NextResponse.json({
        success: true,
        message: `${cfg.name} MCP started on port ${cfg.port}`,
        server: { name: env, status: 'running', port: cfg.port },
      });
    }

    if (action === 'stop') {
      const child = activeProcesses[env];
      if (child) {
        child.kill('SIGTERM');
        delete activeProcesses[env];
        setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 3000);
      }
      try {
        await execAsync(`fuser -k ${cfg.port}/tcp 2>/dev/null || true`);
      } catch {}

      return NextResponse.json({
        success: true,
        message: `${cfg.name} MCP stopped (port ${cfg.port})`,
        server: { name: env, status: 'stopped' },
      });
    }

    if (action === 'clone' && repoUrl) {
      const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repo';
      const cloneDir = pathModule.join(cfg.workspace, 'cloned-repos', repoName);
      const baseDir = pathModule.dirname(cloneDir);
      if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

      try {
        if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true });
        const startTime = Date.now();
        await execAsync(`git clone --depth 1 ${repoUrl} "${cloneDir}"`, { timeout: 120000 });
        const durationMs = Date.now() - startTime;
        // Auto-cd into the cloned repo
        currentCwd[env] = `cloned-repos/${repoName}`;
        return NextResponse.json({
          success: true, message: `Cloned ${repoName} into ${cfg.name}`,
          repoUrl, repoName, status: 'success',
          duration: `${(durationMs / 1000).toFixed(1)}s`, path: cloneDir,
          cwd: `cloned-repos/${repoName}`,
        });
      } catch (execError: unknown) {
        const err = execError as { message?: string; stderr?: string };
        return NextResponse.json({
          success: false, error: err.stderr || err.message || 'Clone failed',
          repoUrl, repoName, status: 'failed',
        });
      }
    }

    if (action === 'write' && path && content !== undefined) {
      const cwd = currentCwd[env] || '.';
      const fullPath = path.startsWith('/') ? path : pathModule.join(cwd === '.' ? cfg.workspace : pathModule.join(cfg.workspace, cwd), path);
      if (!fullPath.startsWith(cfg.workspace)) {
        return NextResponse.json({ success: false, error: 'Access denied: path outside workspace' }, { status: 403 });
      }
      try {
        fs.mkdirSync(pathModule.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
        return NextResponse.json({ success: true, path: fullPath, cwd });
      } catch (err: unknown) {
        const e = err as { message?: string };
        return NextResponse.json({ success: false, error: e.message || 'File write failed', cwd }, { status: 500 });
      }
    }

    if (action === 'exec' && command) {
      const rawCmd = command.replace(/\s*2>&1\s*$/g, '').trim();
      const cdCmdMatch = rawCmd.match(/^cd\s+(.+)/);
      if (cdCmdMatch) {
        const target = cdCmdMatch[1].trim().replace(/;.*$/, '');
        // Treat cloned-repos paths as workspace-relative (not cwd-relative)
        const currentRel = currentCwd[env] || '.';
        const newDir = target.startsWith('/')
          ? target
          : target.startsWith('cloned-repos/')
            ? pathModule.join(cfg.workspace, target)
            : pathModule.resolve(currentRel === '.' ? cfg.workspace : pathModule.join(cfg.workspace, currentRel), target);
        if (!newDir.startsWith(cfg.workspace)) {
          return NextResponse.json({ success: false, error: 'Cannot cd outside workspace', cwd: currentRel });
        }
        const newRel = pathModule.relative(cfg.workspace, newDir);
        currentCwd[env] = newRel || '.';
        return NextResponse.json({ success: true, stdout: `📂 ${newDir}\n`, stderr: '', cwd: newRel || '.' });
      }

      try {
        const cwd = currentCwd[env] || '.';
        const execDir = cwd === '.' ? cfg.workspace : pathModule.join(cfg.workspace, cwd);
        const output = execSync(command, { cwd: execDir, timeout: 30000, shell: '/bin/bash', encoding: 'utf-8' });
        return NextResponse.json({ success: true, stdout: output.toString(), stderr: '', cwd });
      } catch (execErr: unknown) {
        const e = execErr as { message?: string; stdout?: string; stderr?: string };
        const cwd = currentCwd[env] || '.';
        return NextResponse.json({
          success: e.stdout ? true : false,
          stdout: e.stdout?.toString() || '',
          stderr: e.stderr?.toString() || e.message || 'Command failed',
          cwd,
        });
      }
    }

    if (action === 'git-push' && command) {
      try {
        const esc = (s: string) => s.replace(/'/g, "'\\''");
        const askPassScript = `#!/bin/bash
PROMPT="$1"
case "$PROMPT" in
  *oken*|*sername*) echo '${esc(gitUsername || '')}' ;;
  *assword*) echo '${esc(gitPassword || '')}' ;;
  *) echo '' ;;
esac
`;
        const askPassPath = '/tmp/git-askpass-mcp.sh';
        fs.writeFileSync(askPassPath, askPassScript, 'utf8');
        fs.chmodSync(askPassPath, 0o755);

        const cwd = currentCwd[env] || '.';
        const execDir = cwd === '.' ? cfg.workspace : pathModule.join(cfg.workspace, cwd);
        try {
          const output = execSync(command, {
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: askPassPath } as unknown as NodeJS.ProcessEnv,
            cwd: execDir, timeout: 120000, shell: '/bin/bash', encoding: 'utf-8',
          });
          return NextResponse.json({ success: true, output: output.toString(), stderr: '', cwd });
        } catch (execErr: unknown) {
          const err = execErr as { message?: string; stderr?: string; stdout?: string };
          const stdout = err.stdout?.toString() || '';
          const stderr = err.stderr?.toString() || err.message || '';
          // Detect actual git failures
          const isAuthFail = /authentication failed|anonymous|Permission denied|Could not read from remote/i.test(stderr + stdout);
          const isNothing = /nothing to commit|nothing changed/i.test(stderr + stdout);
          const isUpToDate = /Everything up-to-date/i.test(stdout);
          const isPushFail = /rejected|non-fast|error: failed/i.test(stderr + stdout);
          if (isAuthFail) {
            return NextResponse.json({ success: false, output: stdout, stderr: `❌ Authentication failed. Check your Git Platform credentials.\n\n${stderr.slice(0, 500)}`, cwd });
          }
          if (isNothing || isUpToDate) {
            return NextResponse.json({ success: true, output: stdout || 'Everything up-to-date', stderr: '', cwd });
          }
          if (isPushFail) {
            return NextResponse.json({ success: false, output: stdout, stderr: `❌ Push rejected:\n${stderr.slice(0, 500)}`, cwd });
          }
          return NextResponse.json({ success: false, output: stdout, stderr: stderr.slice(0, 500), cwd });
        }
      } catch (err: unknown) {
        const e = err as { message?: string };
        return NextResponse.json({ success: false, output: '', stderr: `Git push setup error: ${e.message}`, cwd: currentCwd[env] || '.' });
      }
    }

    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({
      success: false,
      error: `Cannot reach MCP server at ${cfg.url}: ${err.message || 'Proxy failed'}`,
      environment: env,
    }, { status: 502 });
  }
}
