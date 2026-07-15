import { NextResponse } from "next/server";
import { spawn, execSync } from "child_process";
import { writeFileSync, chmodSync } from "fs";

/**
 * OpenClaw Integration Route
 * 
 * Proxies requests to the local OpenClaw gateway using the CLI.
 * OpenClaw runs on port 18789 with RPC-based communication.
 * We use `openclaw agent -m "message"` to send messages and get replies.
 */

export async function GET() {
  try {
    const host = process.env.OPENCLAW_HOST || 'localhost';
    const port = process.env.OPENCLAW_PORT || '18789';
    const baseUrl = `http://${host}:${port}`;

    const healthRes = await fetch(`${baseUrl}/health`);
    const health = await healthRes.json();
    
    return NextResponse.json({
      status: "connected",
      openclaw: health,
      endpoint: baseUrl,
      method: "openclaw agent CLI",
    });
  } catch {
    const host = process.env.OPENCLAW_HOST || 'localhost';
    const port = process.env.OPENCLAW_PORT || '18789';
    return NextResponse.json(
      { status: "disconnected", error: `OpenClaw gateway not reachable at ${host}:${port}` },
      { status: 503 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    // Handle start/stop actions for OpenClaw gateway
    if (action === 'start') {
      execSync('systemctl --user start openclaw-gateway.service 2>/dev/null || true');
      await new Promise((r) => setTimeout(r, 2000));
      return NextResponse.json({ success: true, message: 'OpenClaw gateway started on port 18789' });
    }

    if (action === 'stop') {
      execSync('systemctl --user stop openclaw-gateway.service 2>/dev/null || true');
      await new Promise((r) => setTimeout(r, 1000));
      return NextResponse.json({ success: true, message: 'OpenClaw gateway stopped' });
    }

    const { message, agent, channel, sessionId, credentials } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing required field: message (string)" },
        { status: 400 }
      );
    }

    const lowerMsg = message.toLowerCase();
    const startTime = Date.now();

    // ── Helper: extract system command from natural language ──
    const extractSudoCommand = (): string | null => {
      const sudoPrefix = lowerMsg.match(/^sudo\s+(.+)/);
      if (sudoPrefix) return sudoPrefix[1];

      if (lowerMsg.includes('apt') || lowerMsg.includes('apt-get')) {
        if (lowerMsg.includes('update')) return 'apt update';
        if (lowerMsg.includes('upgrade')) return 'apt upgrade -y';
        const installMatch = message.match(/install\s+['"]?(\S+)['"]?/i);
        if (installMatch) return `apt install -y ${installMatch[1].replace(/[^a-zA-Z0-9._+\-]/g, '')}`;
        const removeMatch = message.match(/(?:remove|purge)\s+['"]?(\S+)['"]?/i);
        if (removeMatch) return `apt ${lowerMsg.includes('purge') ? 'purge' : 'remove'} -y ${removeMatch[1].replace(/[^a-zA-Z0-9._+\-]/g, '')}`;
      }

      const sysctlMatch = lowerMsg.match(/systemctl\s+(enable|disable|start|stop|restart|reload|status)\s+(\S+)/);
      if (sysctlMatch) return `systemctl ${sysctlMatch[1]} ${sysctlMatch[2]}`;

      const svcMatch = lowerMsg.match(/service\s+(\S+)\s+(start|stop|restart|reload|status)/);
      if (svcMatch) return `service ${svcMatch[1]} ${svcMatch[2]}`;

      const pkgInstall = message.match(/install\s+['"]?(\S+)['"]?/i);
      if (pkgInstall) return `apt install -y ${pkgInstall[1].replace(/[^a-zA-Z0-9._+\-]/g, '')}`;

      if (lowerMsg.includes('update') || lowerMsg.includes('upgrade')) return 'apt update';

      return null;
    };

    // ── Helper: check if message is a git auth command ──
    const getGitCommand = (): string | null => {
      const gitMatch = message.match(/^(git\s+(push|pull|clone|fetch|checkout)\b.*)/i);
      if (gitMatch) return gitMatch[1];
      const gitEmbedded = message.match(/(git\s+(push|pull|clone|fetch|checkout)\s+\S+)/i);
      if (gitEmbedded) return gitEmbedded[1];
      return null;
    };

    // ── Sudo command execution ──
    if (credentials?.sudoPassword) {
      const sudoCmd = extractSudoCommand();
      if (sudoCmd) {
        try {
          const fullCmd = `echo "${credentials.sudoPassword.replace(/"/g, '\\"')}" | sudo -S ${sudoCmd}`;
          console.log(`[OpenClaw] Executing sudo: ${sudoCmd}`);
          const output = execSync(fullCmd, { timeout: 120000, shell: '/bin/bash' });
          const durationMs = Date.now() - startTime;
          return NextResponse.json({
            success: true,
            message: 'Command executed',
            response: { text: output.toString().trim() || 'Command completed successfully.' },
            duration: `${durationMs}ms`,
          });
        } catch (execErr: unknown) {
          const err = execErr as { message?: string; stderr?: string; stdout?: string };
          const durationMs = Date.now() - startTime;
          const stderrText = err.stderr?.toString() || '';
          const stdoutText = err.stdout?.toString() || '';
          return NextResponse.json({
            success: true,
            response: { text: stdoutText || stderrText || `sudo command failed: ${err.message}` },
            duration: `${durationMs}ms`,
          });
        }
      }
    }

    // ── Git command execution ──
    if (credentials?.gitPassword) {
      const gitCmd = getGitCommand();
      if (gitCmd) {
        try {
          const gitEnv = { ...process.env };
          if (credentials.gitUsername) (gitEnv as Record<string, string>).GIT_USERNAME = credentials.gitUsername;
          if (credentials.gitPassword) (gitEnv as Record<string, string>).GIT_PASSWORD = credentials.gitPassword;
          (gitEnv as Record<string, string>).GIT_TERMINAL_PROMPT = '0';

          const escGit = (s: string) => s.replace(/'/g, "'\\''");
          const askPassScript = `#!/bin/bash
PROMPT="$1"
case "$PROMPT" in
  *oken*|*sername*) echo '${escGit(credentials.gitUsername || '')}' ;;
  *assword*) echo '${escGit(credentials.gitPassword || '')}' ;;
  *) echo '' ;;
esac
`;
          const askPassPath = '/tmp/git-askpass-opencode.sh';
          writeFileSync(askPassPath, askPassScript, 'utf8');
          chmodSync(askPassPath, 0o755);
          (gitEnv as Record<string, string>).GIT_ASKPASS = askPassPath;

          console.log(`[OpenClaw] Executing git: ${gitCmd}`);
          const output = execSync(gitCmd, { env: gitEnv, timeout: 120000 });
          const durationMs = Date.now() - startTime;
          return NextResponse.json({
            success: true,
            message: 'Git operation completed',
            response: { text: output.toString().trim() || 'Git operation completed successfully.' },
            duration: `${durationMs}ms`,
          });
        } catch (execErr: unknown) {
          const err = execErr as { message?: string; stderr?: string; stdout?: string };
          const durationMs = Date.now() - startTime;
          const stderrText = err.stderr?.toString() || '';
          const stdoutText = err.stdout?.toString() || '';
          return NextResponse.json({
            success: true,
            response: { text: stdoutText || stderrText || `git command failed: ${err.message}` },
            duration: `${durationMs}ms`,
          });
        }
      }
    }

    // ── Proxy to OpenClaw AI agent (no credential hints — just env vars) ──
    const childEnv = { ...process.env };
    if (credentials?.sudoPassword) (childEnv as Record<string, string>).SUDO_PASSWORD = credentials.sudoPassword;
    if (credentials?.gitUsername) (childEnv as Record<string, string>).GIT_USERNAME = credentials.gitUsername;
    if (credentials?.gitPassword) (childEnv as Record<string, string>).GIT_PASSWORD = credentials.gitPassword;

    const args: string[] = ["agent"];
    const targetAgent = agent || process.env.OPENCLAW_AGENT || "main";
    args.push("--agent", targetAgent);
    
    if (channel) args.push("--channel", channel);
    if (sessionId) args.push("--session-id", sessionId);
    
    args.push("--json");
    args.push("-m", message);

    const command = `openclaw ${args.join(" ")}`;
    console.log(`[OpenClaw] Executing: ${command}`);

    try {
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn("openclaw", args, {
          timeout: 120000,
          env: childEnv,
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        child.stderr?.on("data", (data: Buffer) => {
          stderr += data.toString();
        });

        child.on("close", (code: number | null) => {
          if (code !== 0) {
            reject(new Error(stderr || `Process exited with code ${code}`));
          } else {
            resolve({ stdout, stderr });
          }
        });

        child.on("error", (err: Error) => {
          reject(err);
        });
      });

      const durationMs = Date.now() - startTime;
      console.log(`[OpenClaw] Response received in ${durationMs}ms`);

      let response: { raw?: unknown; text: string };
      try {
        const parsed = JSON.parse(result.stdout.trim());
        const replyText = parsed?.result?.payloads?.[0]?.text || parsed?.text;
        response = { raw: parsed, text: replyText };
      } catch {
        response = { text: result.stdout.trim() };
      }

      return NextResponse.json({
        success: true,
        message: "Agent response received",
        response,
        duration: `${durationMs}ms`,
      });

    } catch (execError: unknown) {
      const durationMs = Date.now() - startTime;
      const err = execError as { message?: string; stderr?: string };
      
      console.error("[OpenClaw] Command failed:", err.message);
      console.error("[OpenClaw] Stderr:", err.stderr);

      return NextResponse.json({
        success: false,
        error: err.stderr || err.message || "OpenClaw agent command failed",
        command,
        duration: `${durationMs}ms`,
      }, { status: 500 });
    }

  } catch (error: unknown) {
    console.error("OpenClaw proxy error:", error);
    const err = error as { message?: string };
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}