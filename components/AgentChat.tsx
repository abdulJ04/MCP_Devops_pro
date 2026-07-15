'use client';

import { useState, useRef, useEffect } from 'react';
import { BsSend, BsRobot, BsLightningCharge, BsStars } from 'react-icons/bs';
import { motion, AnimatePresence } from 'framer-motion';
import CredentialModal from './CredentialModal';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

interface AgentChatProps {
  agentType: string;
  openclawOnline?: boolean | null;
  onWorkflowCreate?: (name: string, initialStatus: 'success' | 'running' | 'failed', branch: string) => string;
  onWorkflowUpdate?: (workflowId: string, newStatus: 'success' | 'running' | 'failed', durationOverride?: string) => void;
  gitCredentials?: Record<string, { username: string; token: string }>;
}

export default function AgentChat({ agentType, openclawOnline, onWorkflowCreate, onWorkflowUpdate, gitCredentials }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hello! I'm your DevOps AI assistant. I can manage MCP servers, clone repos, and execute DevOps tasks using your configured tools. Try asking me to clone a repo or start a server!`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastClonePathRef = useRef<string>('');
  const [isTypingNew, setIsTypingNew] = useState(false);
  const openclawOnlineRef = useRef(openclawOnline);

  useEffect(() => {
    openclawOnlineRef.current = openclawOnline;
  }, [openclawOnline]);

  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [credentialType, setCredentialType] = useState<'sudo' | 'git'>('sudo');
  const [pendingMessage, setPendingMessage] = useState('');
  const credentialResolverRef = useRef<((creds: Record<string, string> | null) => void) | null>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => setIsTypingNew(true), 300);
      return () => clearTimeout(timer);
    }
    setIsTypingNew(false);
  }, [loading]);

  // Call MCP API for operations like clone/start
  const callMcpApi = async (action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    try {
      const env = (payload.env as string) || 'dev';
      const res = await fetch(`/api/v1/mcp/${env}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload })
      });
      return await res.json();
    } catch (error) {
      console.error('MCP API call failed:', error);
      return { success: false, error: 'Failed to connect to MCP server' };
    }
  };

  const handleCredentialSubmit = (creds: Record<string, string>) => {
    if (credentialResolverRef.current) {
      credentialResolverRef.current(creds);
      credentialResolverRef.current = null;
    }
  };

  const handleCredentialCancel = () => {
    if (credentialResolverRef.current) {
      credentialResolverRef.current(null);
      credentialResolverRef.current = null;
    }
  };

  // Call OpenClaw agent via our proxy
  const callOpenClaw = async (message: string, credentials?: Record<string, string> | null): Promise<Record<string, unknown>> => {
    try {
      const res = await fetch('/api/v1/openclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, credentials })
      });
      return await res.json();
    } catch (error) {
      console.error('OpenClaw call failed:', error);
      return { success: false, error: 'Failed to connect to OpenClaw' };
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (openclawOnline === false) {
      setMessages(prev => [...prev, {
        role: 'assistant' as const,
        content: '⚠️ OpenClaw AI Agent is **disconnected**. Click the **Start** button above to start the OpenClaw gateway, then try again.',
        timestamp: new Date(),
      }]);
      setInput('');
      return;
    }

    const userInput = input.trim();
    const lowerInput = userInput.toLowerCase();

    const userMessage = { role: 'user' as const, content: userInput, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      let aiResponse = '';

      // Handle GitHub clone commands
      if (/\bclone\b/.test(lowerInput) && (lowerInput.includes('github') || lowerInput.includes('repo'))) {
        const urlMatch = userInput.match(/https?:\/\/github\.com\/[^\s]+/);
        const repoUrl = urlMatch ? urlMatch[0] : 'https://github.com/example/repo';
        const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'repo';

        // Extract target environment from message (e.g. "on stage", "on dev")
        const envMatch = lowerInput.match(/on\s+(dev|development|stage|staging|prod|production)/);
        const envMap: Record<string, string> = {
          dev: 'dev', development: 'dev',
          stage: 'staging', staging: 'staging',
          prod: 'prod', production: 'prod',
        };
        const env = envMatch ? envMap[envMatch[1]] : 'dev';
        const envLabel = { dev: 'Development', staging: 'Staging', prod: 'Production' }[env] || 'Development';

        aiResponse = `🔄 Cloning ${repoUrl} into ${envLabel} workspace...`;
        setMessages(prev => [...prev, { role: 'assistant' as const, content: aiResponse, timestamp: new Date() }]);

        const wfId = onWorkflowCreate?.(`Clone ${repoName}`, 'running', env) || '';
        const result = await callMcpApi('clone', { repoUrl, env });

        if (result.success) {
          const res = result as { path?: string; duration?: string };
          if (res.path) lastClonePathRef.current = res.path;
          aiResponse = `✅ Successfully cloned ${repoName} into ${envLabel}!\n\n📁 Path: ${res.path || 'N/A'}\n⏱️ Duration: ${res.duration || 'N/A'}`;
          if (wfId) onWorkflowUpdate?.(wfId, 'success', res.duration);
        } else {
          aiResponse = `❌ Clone failed: ${String(result.error)}`;
          if (wfId) onWorkflowUpdate?.(wfId, 'failed');
        }
      }
      // Handle MCP server health check (proxy pattern — servers run independently)
      else if (lowerInput.includes('start') && lowerInput.includes('mCP')) {
        let server = 'development';
        let env = 'dev';
        if (lowerInput.includes('staging') || lowerInput.includes('stage')) { server = 'staging'; env = 'staging'; }
        else if (lowerInput.includes('production') || lowerInput.includes('prod')) { server = 'production'; env = 'prod'; }

        aiResponse = `🔍 Checking ${server} MCP server...`;
        setMessages(prev => [...prev, { role: 'assistant' as const, content: aiResponse, timestamp: new Date() }]);

        try {
          const res = await fetch(`/api/v1/mcp/${env}?action=health`);
          const result = await res.json();
          if (result.success && result.status === 'running') {
            aiResponse = `✅ ${server.charAt(0).toUpperCase() + server.slice(1)} MCP server is running!\n\n• URL: ${result.url}\n• Workspace: ${result.workspace}`;
          } else {
            aiResponse = `❌ ${server.charAt(0).toUpperCase() + server.slice(1)} MCP server is not reachable.\n\nMake sure the MCP server is running at ${result.url || env} and try again.`;
          }
        } catch {
          aiResponse = `❌ Could not connect to ${server} MCP server. Is it running?`;
        }
      }
      // For all other messages, send to OpenClaw agent
      else {
        // ── File creation handler ──
        const fileCreateMatch = userInput.match(/(?:create|make)\s+(?:a\s+)?(?:file\s+)?(?:called\s+|named\s+)?['"]?([a-zA-Z0-9_\-./\\]+)['"]?(?:\s+with\s+(?:content\s+)?)?(.+)?/i);
        const writeMatch = userInput.match(/write\s+(.+?)\s+(?:to|into)\s+(?:file\s+)?['"]?([a-zA-Z0-9_\-./\\]+)['"]?/i);
        const isFileOp = lowerInput.includes('create') || lowerInput.includes('write') || (lowerInput.includes('make') && lowerInput.includes('file'));

        if (isFileOp) {
          const envMatch = lowerInput.match(/on\s+(dev|development|stage|staging|prod|production)/);
          const envMap: Record<string, string> = {
            dev: 'dev', development: 'dev',
            stage: 'staging', staging: 'staging',
            prod: 'prod', production: 'prod',
          };
          const env = envMatch ? envMap[envMatch[1]] : 'dev';
          const envLabel = { dev: 'Development', staging: 'Staging', prod: 'Production' }[env] || 'Development';

          let filePath: string | null = null;
          let content = '';

          if (fileCreateMatch && fileCreateMatch[1]) {
            filePath = fileCreateMatch[1];
            content = fileCreateMatch[2] || '';
            // Try to extract actual desired content from the remaining sentence
            const contentExtract = content.match(/add\s+['"](.+?)['"]\s+inside/i)
              || content.match(/(?:with|containing)\s+(?:content\s+|text\s+)?['"](.+?)['"]/i)
              || content.match(/text\s+['"](.+?)['"]/i);
            if (contentExtract) {
              content = contentExtract[1];
            }
          } else if (writeMatch && writeMatch[2]) {
            content = writeMatch[1];
            filePath = writeMatch[2];
          }

          if (filePath) {
            // Determine target path: if lastClonePathRef is set, create inside cloned repo
            let writePath = filePath;
            if (!filePath.startsWith('/')) {
              // Relative filename — use cloned repo if available
              if (lastClonePathRef.current) {
                writePath = `${lastClonePathRef.current}/${filePath}`;
              }
              // else: pass relative path as-is — server resolves against its cwd
            }

            aiResponse = `📝 Creating file \`${writePath}\` in ${envLabel}...`;
            setMessages(prev => [...prev, { role: 'assistant' as const, content: aiResponse, timestamp: new Date() }]);

            const wfId = onWorkflowCreate?.(`Create ${filePath}`, 'running', env) || '';
            const result = await callMcpApi('write', { path: writePath, content, env });

            if (result.success) {
              aiResponse = `✅ Created \`${filePath}\` at ${result.path || 'N/A'}!\n\n${content ? `Content: \`${content}\`` : ''}`;
              if (wfId) onWorkflowUpdate?.(wfId, 'success');
            } else {
              aiResponse = `❌ File create failed: ${String(result.error)}`;
              if (wfId) onWorkflowUpdate?.(wfId, 'failed');
            }
          } else {
            aiResponse = `❌ Could not understand file path. Try: "create file test.txt with content hello"`;
            const errMsg = { role: 'assistant' as const, content: aiResponse, timestamp: new Date() };
            setMessages(prev => [...prev, errMsg]);
            setLoading(false);
            return;
          }
        }
        // ── Git operation handler (push, pull, status, log, etc.) ──
        else if (
          lowerInput.includes('push') || lowerInput.includes('pull') ||
          (lowerInput.includes('git') && (lowerInput.includes('commit') || lowerInput.includes('add') || lowerInput.includes('push') || lowerInput.includes('pull') || lowerInput.includes('status') || lowerInput.includes('log') || lowerInput.includes('fetch') || lowerInput.includes('checkout') || lowerInput.includes('stage') || lowerInput.includes('branch') || lowerInput.includes('merge') || lowerInput.includes('config') || lowerInput.includes('remote') || lowerInput.includes('init') || lowerInput.includes('reset') || lowerInput.includes('stash') || lowerInput.includes('tag') || lowerInput.includes('rebase') || lowerInput.includes('diff') || lowerInput.includes('show') || lowerInput.includes('blame') || lowerInput.includes('revert') || lowerInput.includes('cherry') || lowerInput.includes('submodule') || lowerInput.includes('worktree') || lowerInput.includes('archive') || lowerInput.includes('bisect') || lowerInput.includes('clean') || lowerInput.includes('describe') || lowerInput.includes('grep')))
        ) {
          const envMatch = lowerInput.match(/on\s+(dev|development|stage|staging|prod|production)/);
          const envMap: Record<string, string> = {
            dev: 'dev', development: 'dev',
            stage: 'staging', staging: 'staging',
            prod: 'prod', production: 'prod',
          };
          const env = envMatch ? envMap[envMatch[1]] : 'dev';
          const envLabel = { dev: 'Development', staging: 'Staging', prod: 'Production' }[env] || 'Development';

          const isPull = lowerInput.includes('pull');
          const isPush = lowerInput.includes('push') || lowerInput.includes('commit') || lowerInput.includes('add');

          // Use stored git credentials or pop-up
          let gitUser = '';
          let gitPass = '';
          const needsCreds = isPush || isPull;
          if (needsCreds && gitCredentials && Object.keys(gitCredentials).length > 0) {
            const firstEntry = Object.entries(gitCredentials)[0];
            if (firstEntry) {
              gitUser = firstEntry[1].username || '';
              gitPass = firstEntry[1].token;
            }
          } else if (needsCreds) {
            setCredentialType('git');
            setPendingMessage(userInput);
            setShowCredentialModal(true);
            const creds = await new Promise<Record<string, string> | null>((resolve) => {
              credentialResolverRef.current = resolve;
            });
            setShowCredentialModal(false);
            if (!creds) {
              aiResponse = `❌ Git ${isPush ? 'push' : 'pull'} cancelled. Credentials required.`;
              const cancelMsg = { role: 'assistant' as const, content: aiResponse, timestamp: new Date() };
              setMessages(prev => [...prev, cancelMsg]);
              setLoading(false);
              return;
            }
            gitUser = creds.gitUsername || '';
            gitPass = creds.gitPassword;
          }

          // Get clone path (from stored ref or find via exec)
          let repoDir = lastClonePathRef.current;
          if (!repoDir) {
            const findResult = await callMcpApi('exec', { command: 'cd . && ls -d cloned-repos/*/ 2>/dev/null || echo "NO_REPOS"', env });
            if (findResult.success && findResult.stdout && !(findResult.stdout as string).includes('NO_REPOS')) {
              const repos = (findResult.stdout as string).trim().split('\n');
              repoDir = repos[0].trim();
              if (repoDir) lastClonePathRef.current = repoDir;
            }
          }

          if (!repoDir) {
            if (isPull || isPush) {
              aiResponse = `❌ No cloned repos found in ${envLabel}. Clone a repo first.`;
              const errMsg = { role: 'assistant' as const, content: aiResponse, timestamp: new Date() };
              setMessages(prev => [...prev, errMsg]);
              setLoading(false);
              return;
            }
            // For status/config/log etc., run in workspace root
            repoDir = '.';
          }

          // Set server-side cwd to repo directory for stateful commands
          if (repoDir !== '.') {
            await callMcpApi('exec', { command: 'cd . 2>&1', env });
            await callMcpApi('exec', { command: `cd ${repoDir} 2>&1`, env });
          }

          if (isPush) {
            const commitMatch = userInput.match(/(?:with\s+)?(?:message|msg)\s+['"](.+?)['"]/i);
            const commitMsg = commitMatch ? commitMatch[1] : 'Update via DevOps AI Agent';
            const gitName = gitUser || 'DevOps AI Agent';
            const gitEmail = gitUser ? `${gitUser}@users.noreply.github.com` : 'agent@devops-ai.local';
            aiResponse = `🔄 Pushing changes in ${envLabel}...`;
            setMessages(prev => [...prev, { role: 'assistant' as const, content: aiResponse, timestamp: new Date() }]);
            const wfId = onWorkflowCreate?.('Git Push', 'running', env) || '';
            const gitCmds = `git config user.name "${gitName}" && git config user.email "${gitEmail}" && git add . && git commit -m "${commitMsg}" 2>&1 && git push 2>&1; echo "EXIT:$?"`;
            const pushResult = await callMcpApi('git-push', { command: gitCmds, env, gitUsername: gitUser, gitPassword: gitPass });
            const pushOut = (pushResult.output || pushResult.stdout || '') as string;
            const pushErr = (pushResult.stderr || '') as string;
            const pushCleaned = pushOut.replace(/EXIT:\d+\s*$/, '').trim();
            const hasAuthError = /authentication failed|anonymous|Permission denied|Could not read from remote/i.test(pushErr + pushCleaned);
            const hasPushError = /rejected|non-fast|error: failed/i.test(pushErr + pushCleaned);
            const isUpToDate = /Everything up-to-date/i.test(pushCleaned);
            const isNothing = /nothing to commit|nothing changed/i.test(pushCleaned);

            if (pushResult.success && !hasAuthError && !hasPushError) {
              const detail = isUpToDate ? 'Everything up-to-date' : isNothing ? 'Nothing to commit' : `💬 ${commitMsg}`;
              aiResponse = `✅ Git push complete!\n\n📂 Repo: ${repoDir}\n${detail}${pushCleaned && !isUpToDate && !isNothing ? `\n\n\`\`\`\n${pushCleaned.slice(0, 500)}\n\`\`\`` : ''}`;
              if (wfId) onWorkflowUpdate?.(wfId, 'success');
            } else {
              const errMsg = hasAuthError
                ? '❌ Authentication failed. Check your Git Platform Integration credentials (GitHub token needs `repo` scope).'
                : hasPushError
                  ? `❌ Push rejected:\n${pushErr.slice(0, 500)}`
                  : `❌ Push failed:\n${(pushErr || pushCleaned || 'Unknown error').slice(0, 500)}`;
              aiResponse = errMsg;
              if (wfId) onWorkflowUpdate?.(wfId, 'failed');
            }
          } else if (isPull) {
            aiResponse = `🔄 Pulling latest changes in ${envLabel}...`;
            setMessages(prev => [...prev, { role: 'assistant' as const, content: aiResponse, timestamp: new Date() }]);
            const wfId = onWorkflowCreate?.('Git Pull', 'running', env) || '';
            const gitCmds = `git pull 2>&1; echo "EXIT:$?"`;
            const pullResult = await callMcpApi('git-push', { command: gitCmds, env, gitUsername: gitUser, gitPassword: gitPass });
            const pullOut = (pullResult.output || pullResult.stdout || '') as string;
            const pullErr = (pullResult.stderr || '') as string;
            const pullCleaned = pullOut.replace(/EXIT:\d+\s*$/, '').trim();
            const hasAuthError = /authentication failed|anonymous|Permission denied|Could not read from remote/i.test(pullErr + pullCleaned);
            const isUpToDate = /Already up to date/i.test(pullCleaned);
            const hasConflict = /CONFLICT|conflict|merge failed/i.test(pullErr + pullCleaned);

            if (pullResult.success && !hasAuthError && !hasConflict) {
              aiResponse = `✅ Git pull complete!\n\n📂 Repo: ${repoDir}\n${isUpToDate ? 'Already up-to-date' : `\`\`\`\n${pullCleaned.slice(0, 500)}\n\`\`\``}`;
              if (wfId) onWorkflowUpdate?.(wfId, 'success');
            } else {
              const errMsg = hasAuthError
                ? '❌ Authentication failed. Check your Git Platform Integration credentials.'
                : hasConflict
                  ? `❌ Merge conflict:\n${(pullErr || pullCleaned).slice(0, 500)}`
                  : `❌ Pull failed:\n${(pullErr || pullCleaned || 'Unknown error').slice(0, 500)}`;
              aiResponse = errMsg;
              if (wfId) onWorkflowUpdate?.(wfId, 'failed');
            }
          } else {
            // status, log, config, etc. — no credentials needed
            aiResponse = `🔄 Running git operation in ${envLabel}...`;
            setMessages(prev => [...prev, { role: 'assistant' as const, content: aiResponse, timestamp: new Date() }]);
            const gitCmdMatch = userInput.match(/git\s+(.+)/i);
            const gitSubCmd = gitCmdMatch ? gitCmdMatch[1] : userInput;
            const gitCmds = `git ${gitSubCmd} 2>&1; echo "DONE"`;
            const result = await callMcpApi('exec', { command: gitCmds, env });
            if (result.success || result.stdout) {
              const out = (result.stdout || '') as string;
              const cleaned = out.replace(/DONE\s*$/, '').trim();
              aiResponse = `📋 Result:\n\`\`\`\n${cleaned.slice(0, 1000) || 'No output'}\n\`\`\``;
            } else {
              aiResponse = `❌ Git command failed: ${String(result.stderr || result.error)}`;
            }
          }
        }
        // ── "give/show github username" — return from stored credentials ──
        else if (lowerInput.match(/(?:give|show|get|what)\s+(?:me\s+)?(?:the\s+)?(?:github|git)\s*(?:user)?name/i)) {
          if (gitCredentials && Object.keys(gitCredentials).length > 0) {
            const firstEntry = Object.entries(gitCredentials)[0];
            const username = firstEntry?.[1]?.username;
            aiResponse = username
              ? `Your stored GitHub username is: **${username}**`
              : `Stored credentials found but no username set. Your token/password is saved.`;
          } else {
            aiResponse = `No git credentials stored. Go to Git Platform Integration above and connect a platform first.`;
          }
        }
        // ── Natural language command handler (list, show, run, check, etc.) ──
        else if (
          lowerInput.match(/^(?:list|list out|list all|listout)\s+(?:the\s+)?(?:this\s+)?(?:folder|dir|directory|file)?\s*(.+)/i) ||
          lowerInput.match(/^show\s+(?:me\s+)?(?:the\s+)?(?:contents?\s+of\s+)?(.+)/i) ||
          lowerInput.match(/^check\s+(?:the\s+)?(.+)/i) ||
          lowerInput.match(/^(?:run|execute)\s+(.+)/i) ||
          lowerInput.match(/^what'?s\s+in\s+(.+)/i) ||
          lowerInput.match(/^(?:ls|cat|pwd|whoami|date|df|du|ps|top|free|uname|which|whereis|type|echo)\s+/i) ||
          lowerInput.match(/^(?:mkdir|rmdir|rm|cp|mv|chmod|chown|touch|head|tail|grep|sort|wc|diff|file|find|locate)\s+/i) ||
          lowerInput.match(/^(?:disk|memory|cpu|network|process|service|system)\s+/i) ||
          lowerInput.match(/^(?:go\s+to|enter|cd)\s+(.+)/i) ||
          lowerInput.match(/^open\s+(?:folder|dir|directory|file|path)\s+(.+)/i) ||
          // Multi-step tasks: "enter folder, create file, push"
          lowerInput.match(/,\s*(?:next|then)?\s*(?:create|push|git|add|commit|make)/i)
        ) {
          const envMatch = lowerInput.match(/on\s+(dev|development|stage|staging|prod|production)/);
          const envMap: Record<string, string> = {
            dev: 'dev', development: 'dev',
            stage: 'staging', staging: 'staging',
            prod: 'prod', production: 'prod',
          };
          const env = envMatch ? envMap[envMatch[1]] : 'dev';

          // Split multi-step tasks by comma / "next" / "then"
          const steps = userInput
            .split(/,|(?:\s+(?:next|then|and\s+then)\s+)/i)
            .map(s => s.trim())
            .filter(s => s.length > 0);

          if (steps.length > 1) {
            // Multi-step task — execute each step sequentially
            let stepGitUser = '';
            let stepGitPass = '';
            if (gitCredentials && Object.keys(gitCredentials).length > 0) {
              const firstEntry = Object.entries(gitCredentials)[0];
              if (firstEntry) {
                stepGitUser = firstEntry[1].username || '';
                stepGitPass = firstEntry[1].token;
              }
            }
            for (let i = 0; i < steps.length; i++) {
              const step = steps[i];
              const stepLower = step.toLowerCase();
              let stepCmd = '';

              // Detect cd / enter / go to
              const cdMatch = step.match(/^(?:cd|enter|go\s+to)\s+(.+)/i);
              if (cdMatch) {
                stepCmd = `cd ${cdMatch[1].trim()}`;
                // Update lastClonePathRef if cd'ing into a cloned repo
                const cdTarget = cdMatch[1].trim();
                if (cdTarget.startsWith('cloned-repos/') || cdTarget.includes('/cloned-repos/')) {
                  const repoPath = cdTarget.startsWith('cloned-repos/') ? cdTarget : cdTarget.substring(cdTarget.indexOf('cloned-repos/'));
                  lastClonePathRef.current = repoPath;
                }
              }
              // Detect "create file" / "create text file"
              else if (step.match(/create\s+(?:a\s+)?(?:text\s+)?(?:file\s+)?(?:called\s+|named\s+)?(.+?)(?:\s+with\s+content\s+(.+))?/i)) {
                const createMatch = step.match(/create\s+(?:a\s+)?(?:text\s+)?(?:file\s+)?(?:called\s+|named\s+)?(.+?)(?:\s+with\s+content\s+(.+))?/i);
                const fileName = createMatch![1].trim();
                const fileContent = createMatch![2] || `Auto-created on ${new Date().toLocaleString()}`;
                stepCmd = `echo "${fileContent}" > ${fileName}`;
              }
              // Detect "make file" or "make text file"
              else if (step.match(/^make\s+(?:a\s+)?(?:text\s+)?file\s+(?:called\s+|named\s+)?(.+?)(?:\s+with\s+content\s+(.+))?/i)) {
                const makeMatch = step.match(/^make\s+(?:a\s+)?(?:text\s+)?file\s+(?:called\s+|named\s+)?(.+?)(?:\s+with\s+content\s+(.+))?/i);
                const fileName = makeMatch![1].trim();
                const fileContent = makeMatch![2] || `Auto-created on ${new Date().toLocaleString()}`;
                stepCmd = `echo "${fileContent}" > ${fileName}`;
              }
              // Detect git push / push
              else if (stepLower.match(/^(?:git\s+)?push/)) {
                const commitMsg = step.match(/(?:with\s+)?(?:message|msg)\s+['"](.+?)['"]/i);
                const msg = commitMsg ? commitMsg[1] : 'Update via DevOps AI Agent';
                const mName = stepGitUser || 'DevOps AI Agent';
                const mEmail = stepGitUser ? `${stepGitUser}@users.noreply.github.com` : 'agent@devops-ai.local';
                stepCmd = `git config user.name "${mName}" && git config user.email "${mEmail}" && git add . && git commit -m "${msg}" 2>&1 && git push 2>&1; echo "EXIT:$?"`;
              }
              // Detect git pull / pull
              else if (stepLower.match(/^(?:git\s+)?pull/)) {
                stepCmd = `git pull 2>&1; echo "EXIT:$?"`;
              }
              // Detect git add
              else if (stepLower.match(/^(?:git\s+)?add/)) {
                stepCmd = step;
              }
              // Detect git commit
              else if (stepLower.match(/^(?:git\s+)?commit/)) {
                stepCmd = step;
              }
              // Detect ls / list
              else if (step.match(/^(?:list|ls)\s+(.+)/i) || stepLower === 'list' || stepLower === 'ls') {
                stepCmd = stepLower === 'list' || stepLower === 'ls' ? 'ls -la' : `ls -la ${step.match(/^(?:list|ls)\s+(.+)/i)![1].trim()}`;
              }
              else {
                // Treat as direct shell command
                stepCmd = step;
              }

              if (stepCmd) {
                const isGitOp = stepLower.match(/^(?:git\s+)?(?:push|pull)/);
                let result;
                if (isGitOp && (stepGitUser || stepGitPass)) {
                  result = await callMcpApi('git-push', { command: stepCmd, env, gitUsername: stepGitUser, gitPassword: stepGitPass });
                } else {
                  result = await callMcpApi('exec', { command: `${stepCmd} 2>&1`, env });
                }
                const out = (result.stdout || result.output || '') as string;
                const err = (result.stderr || '') as string;
                aiResponse = i === 0 ? `✅ **Step ${i + 1}:** \`${stepCmd}\`\n\n${out.slice(0, 1000)}${err ? `\n⚠️ ${err.slice(0, 500)}` : ''}` : '';
                setMessages(prev => [...prev, { role: 'assistant' as const, content: `✅ **Step ${i + 1}:** \`${stepCmd}\`\n\n${out.slice(0, 1000)}${err ? `\n⚠️ ${err.slice(0, 500)}` : ''}`, timestamp: new Date() }]);
              }
            }
            setLoading(false);
            return;
          }

          // Map natural language to shell command (single step)
          let shellCmd = '';
          const trimmed = userInput.trim();

          // "cd / enter / go to [path]"
          const cdMatch = trimmed.match(/^(?:cd|enter|go\s+to)\s+(.+)/i);
          // "list [path]" or "list out [path]"
          const listMatch = cdMatch ? null : trimmed.match(/^(?:list|list out|list all|listout)\s+(?:the\s+)?(?:this\s+)?(?:folder|dir|directory|file)?\s*(.+)/i);
          // "show (me) [path]"
          const showMatch = cdMatch ? null : trimmed.match(/^show\s+(?:me\s+)?(?:the\s+)?(?:contents?\s+of\s+)?(.+)/i);
          // "check [path]"
          const checkMatch = cdMatch ? null : trimmed.match(/^check\s+(?:the\s+)?(.+)/i);
          // "what's in [path]"
          const whatInMatch = cdMatch ? null : trimmed.match(/^what'?s\s+in\s+(.+)/i);
          // "run/execute [command]"
          const runMatch = cdMatch ? null : trimmed.match(/^(?:run|execute)\s+(.+)/i);
          // "open [path]"
          const openMatch = cdMatch ? null : trimmed.match(/^open\s+(?:folder|dir|directory|file|path)\s+(.+)/i);
          // Direct commands (ls, cat, pwd, etc.)
          const directCmdMatch = cdMatch ? null : trimmed.match(/^(ls|cat|pwd|whoami|date|df|du|ps|top|free|uname|which|whereis|type|echo|mkdir|rmdir|rm|cp|mv|chmod|chown|touch|head|tail|grep|sort|wc|diff|file|find|locate)\s+/i);
          // System info queries
          const sysMatch = cdMatch ? null : trimmed.match(/^(disk|memory|cpu|network|process|service|system)\s*/i);
          // "create directory/folder [name]"
          const mkdirMatch = cdMatch ? null : trimmed.match(/^(?:create|make)\s+(?:a\s+)?(?:dir|directory|folder)\s+(?:called\s+|named\s+)?(.+)/i);

          if (cdMatch) shellCmd = `cd ${cdMatch[1].trim()}`;
          else if (listMatch) shellCmd = `ls -la ${listMatch[1].trim()}`;
          else if (showMatch) {
            const target = showMatch[1].trim();
            shellCmd = /\.[a-zA-Z0-9]{1,5}$/.test(target) ? `cat "${target}"` : `ls -la "${target}"`;
          }
          else if (checkMatch) shellCmd = `ls -la ${checkMatch[1].trim()}`;
          else if (whatInMatch) shellCmd = `ls -la ${whatInMatch[1].trim()}`;
          else if (runMatch) shellCmd = runMatch[1].trim();
          else if (openMatch) shellCmd = `ls -la ${openMatch[1].trim()}`;
          else if (mkdirMatch) shellCmd = `mkdir -p ${mkdirMatch[1].trim()}`;
          else if (directCmdMatch) shellCmd = trimmed;
          else if (sysMatch) {
            const topic = sysMatch[1].toLowerCase();
            if (topic === 'disk') shellCmd = 'df -h';
            else if (topic === 'memory') shellCmd = 'free -h';
            else if (topic === 'cpu') shellCmd = 'lscpu || cat /proc/cpuinfo';
            else if (topic === 'network') shellCmd = 'ip a 2>/dev/null || ifconfig';
            else if (topic === 'process') shellCmd = 'ps aux --sort=-%mem | head -20';
            else if (topic === 'service') shellCmd = 'systemctl list-units --type=service --state=running 2>/dev/null || service --status-all 2>/dev/null';
            else if (topic === 'system') shellCmd = 'uname -a';
          }

          if (shellCmd) {
            const isCd = shellCmd.startsWith('cd ');
            aiResponse = isCd ? `📂 Changing directory...` : `🔄 Running: \`${shellCmd}\``;
            setMessages(prev => [...prev, { role: 'assistant' as const, content: aiResponse, timestamp: new Date() }]);
            const wfId = !isCd ? onWorkflowCreate?.(`Command: ${shellCmd.slice(0, 40)}`, 'running', env) || '' : '';
            const result = await callMcpApi('exec', { command: `${shellCmd} 2>&1${isCd ? '' : '; echo "DONE"'}`, env });
            if (result.success || result.stdout) {
              const out = (result.stdout || '') as string;
              if (isCd) {
                const pathInfo = out.replace(/^📂\s*/, '').trim();
                // If cd'ed into a cloned repo, update lastClonePathRef
                const cdTarget = shellCmd.replace(/^cd\s+/, '').trim();
                if (cdTarget.startsWith('cloned-repos/') || cdTarget.includes('/cloned-repos/')) {
                  const repoPath = cdTarget.startsWith('cloned-repos/') ? cdTarget : cdTarget.substring(cdTarget.indexOf('cloned-repos/'));
                  lastClonePathRef.current = repoPath;
                }
                aiResponse = `📂 Current directory: **${pathInfo || 'workspace'}**`;
              } else {
                const cleaned = out.replace(/DONE\s*$/, '').trim();
                aiResponse = `✅ Output:\n\`\`\`\n${cleaned.slice(0, 2000) || 'No output'}\n\`\`\``;
              }
              if (wfId) onWorkflowUpdate?.(wfId, 'success');
            } else {
              aiResponse = `❌ Command failed:\n\`\`\`\n${String(result.stderr || result.error).slice(0, 1000)}\n\`\`\``;
              if (wfId) onWorkflowUpdate?.(wfId, 'failed');
            }
          } else {
            aiResponse = `❌ Could not understand command. Try: "list /home/user/Downloads" or "run ls -la"`;
            const errMsg = { role: 'assistant' as const, content: aiResponse, timestamp: new Date() };
            setMessages(prev => [...prev, errMsg]);
            setLoading(false);
            return;
          }
        }
        // ── Universal command execution + chat fallback ──
        else {
          const envMatch = lowerInput.match(/on\s+(dev|development|stage|staging|prod|production)/);
          const envMap: Record<string, string> = { dev: 'dev', development: 'dev', stage: 'staging', staging: 'staging', prod: 'prod', production: 'prod' };
          const env = envMatch ? envMap[envMatch[1]] : 'dev';

          // Heuristic: detect if this is a chat message vs a command
          const trimmed = userInput.trim();
          const words = trimmed.split(/\s+/).filter(Boolean);
          // Short greetings always go to chat
          const isChatGreeting = /^(hi|hello|hey|thanks|thank you|good|bye|ok|okay|yes|no|yep|nope|great|nice|awesome|cool|sure|fine|well)\s*$/i.test(trimmed) && words.length <= 2;
          // Questions go to OpenClaw AI when online
          const isQuestion = /^(what|how|why|when|where|who|which|is|are|can|could|would|should|do|does|did|will|tell|explain|describe|define|list|show me|help|give me|compare|difference between|how to|how do|what is|what are|what does|what's|who is|who are|where is|where are|when is|when are|why is|why are|can you|could you|would you|should i)\b/i.test(trimmed);
          // Known shell commands execute as terminal
          const isKnownCmd = /^(ls|cd|pwd|cat|echo|mkdir|rmdir|rm|cp|mv|chmod|chown|touch|head|tail|grep|sort|wc|diff|find|locate|git|docker|kubectl|npm|node|python|pip|apt|yum|dnf|sudo|systemctl|service|ssh|scp|rsync|curl|wget|tar|zip|unzip|ps|top|free|df|du|uname|whoami|date|cal|history|clear|exit|man|which|whereis|type|file|stat|du|df|mount|umount|fdisk| parted|lsblk|lsof|netstat|ss|ip|ifconfig|ping|traceroute|nslookup|dig|host|who|w|last|lastlog|id|groups|su|newgrp|useradd|userdel|usermod|groupadd|groupdel|passwd|shadow|gshadow|hosts|resolv|nsswitch|fstab|mtab|crontab|at|batch|nohup|screen|tmux|jobs|fg|bg|kill|killall|pkill|xkill|nice|renice|time|timeout|wait|sleep|test|true|false|yes|seq|yes|shuf|cut|tr|sed|awk|tee|xargs|env|export|set|unset|alias|unalias|source|exec|bash|sh|zsh|fish|csh|ksh)\b/i.test(trimmed);

          // Priority: greeting → question → command
          const shouldChat = (isChatGreeting || isQuestion) && openclawOnline;
          const isChat = shouldChat;

          if (isChat && openclawOnline) {
            // Send to OpenClaw AI as a chat
            setMessages(prev => [...prev, { role: 'assistant' as const, content: '🤔 Thinking via OpenClaw...', timestamp: new Date() }]);
            const openclawResult = await callOpenClaw(userInput);
            if (!openclawOnlineRef.current) {
              aiResponse = '⚠️ OpenClaw disconnected while processing.';
            } else if (openclawResult.success) {
              const res = openclawResult.response as { text?: string; content?: string; message?: string } | undefined;
              const responseText = res?.text || res?.content || res?.message || JSON.stringify(openclawResult.response);
              aiResponse = `💬 OpenClaw says:\n\n${responseText}`;
            } else {
              aiResponse = `❌ OpenClaw error: ${String(openclawResult.error)}`;
            }
          } else {
            // Execute as terminal command
            // Check if sudo needed → show pop-up
            let needsSudo = false;
            let sudoPassword = '';
            if (lowerInput.includes('sudo')) {
              setCredentialType('sudo');
              setPendingMessage(userInput);
              setShowCredentialModal(true);
              const creds = await new Promise<Record<string, string> | null>((resolve) => {
                credentialResolverRef.current = resolve;
              });
              setShowCredentialModal(false);
              if (creds && creds.password) {
                needsSudo = true;
                sudoPassword = creds.password;
              } else {
                aiResponse = `❌ Sudo access denied. Command cancelled.`;
                setMessages(prev => [...prev, { role: 'assistant' as const, content: aiResponse, timestamp: new Date() }]);
                setLoading(false);
                return;
              }
            }

            let execCmd = trimmed;
            if (needsSudo && sudoPassword) {
              // Replace "sudo -S" with piped password, replace "sudo" with piped sudo -S
              const esc = sudoPassword.replace(/"/g, '\\"');
              execCmd = trimmed
                .replace(/\bsudo\s+-S\b/g, `echo "${esc}" | sudo -S`)
                .replace(/\bsudo\b/g, `echo "${esc}" | sudo -S`);
            }

            aiResponse = `🔄 Running: \`${execCmd.slice(0, 80)}\``;
            setMessages(prev => [...prev, { role: 'assistant' as const, content: aiResponse, timestamp: new Date() }]);
            const wfId = onWorkflowCreate?.(`Cmd: ${execCmd.slice(0, 40)}`, 'running', env) || '';
            const result = await callMcpApi('exec', { command: `${execCmd} 2>&1; echo "EXIT:$?"`, env });
            const out = (result.stdout || '') as string;
            const err = (result.stderr || result.error || '') as string;
            const cleaned = out.replace(/EXIT:\d+\s*$/, '').trim();

            if ((result.success || out) && cleaned) {
              aiResponse = `✅ Output:\n\`\`\`\n${cleaned.slice(0, 2000)}\n\`\`\``;
              if (wfId) onWorkflowUpdate?.(wfId, 'success');
            } else if (err && !cleaned) {
              // Command failed — check if "not found" → fallback to OpenClaw
              if (/not found|No such file|command not found/i.test(err) && openclawOnline) {
                setMessages(prev => [...prev, { role: 'assistant' as const, content: '🤔 Thinking via OpenClaw...', timestamp: new Date() }]);
                const openclawResult = await callOpenClaw(userInput);
                if (!openclawOnlineRef.current) {
                  aiResponse = '⚠️ OpenClaw disconnected while processing.';
                } else if (openclawResult.success) {
                  const res = openclawResult.response as { text?: string; content?: string; message?: string } | undefined;
                  const responseText = res?.text || res?.content || res?.message || JSON.stringify(openclawResult.response);
                  aiResponse = `💬 OpenClaw says:\n\n${responseText}`;
                } else {
                  aiResponse = `❌ OpenClaw error: ${String(openclawResult.error)}`;
                }
                if (wfId) onWorkflowUpdate?.(wfId, 'success');
              } else {
                aiResponse = `❌ Command failed:\n\`\`\`\n${err.slice(0, 1000)}\n\`\`\``;
                if (wfId) onWorkflowUpdate?.(wfId, 'failed');
              }
            } else {
              aiResponse = `✅ Command completed (no output)`;
              if (wfId) onWorkflowUpdate?.(wfId, 'success');
            }
          }
        }
      }

      const aiMessage = {
        role: 'assistant' as const,
        content: aiResponse,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Agent chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant' as const,
        content: '❌ Sorry, an error occurred while processing your request. Please try again.',
        timestamp: new Date()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const getAgentTheme = () => {
    const themes: Record<string, string> = {
      "ci-cd": "from-blue-600 via-indigo-600 to-indigo-700",
      "cloud-infrastructure": "from-sky-500 via-blue-600 to-blue-700",
      "code-analysis": "from-indigo-600 via-purple-600 to-purple-700",
      "security-scanning": "from-red-500 via-red-600 to-red-700",
      "container-orchestration": "from-cyan-500 via-blue-600 to-blue-700",
      "performance-monitoring": "from-emerald-500 via-teal-600 to-teal-700",
      "load-testing": "from-amber-500 via-orange-500 to-orange-600",
      "incident-response": "from-rose-500 via-red-600 to-red-700",
    };

    return themes[agentType] || "from-indigo-600 via-purple-600 to-blue-700";
  };

  const agentTheme = getAgentTheme();
  const messageVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: { duration: 0.2 } }
  };

  return (
    <div className="flex flex-col h-[500px] border-0 rounded-xl overflow-hidden shadow-lg bg-white">
      {/* Enhanced Header with Gradient */}
      <div className={`bg-gradient-to-r ${agentTheme} p-4 lg:p-5 text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="relative">
              <BsRobot size={20} className="mr-2" />
              <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 ${openclawOnline ? 'bg-green-400' : 'bg-red-400'} rounded-full`}>
                {openclawOnline !== false && (
                  <span className={`absolute inset-0 w-full h-full ${openclawOnline ? 'bg-green-400' : 'bg-red-400'} rounded-full animate-ping opacity-75`}></span>
                )}
              </span>
            </div>
            <div>
              <h3 className="font-semibold flex items-center">
                {agentType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                <BsLightningCharge className="ml-2 text-yellow-300" size={14} />
              </h3>
              <div className="text-xs text-white/80 flex items-center mt-1">
                <span className={`w-1.5 h-1.5 ${openclawOnline ? 'bg-green-400' : 'bg-red-400'} rounded-full mr-1.5`}></span>
                {openclawOnline ? 'Powered by OpenClaw' : 'OpenClaw Disconnected'}
              </div>
            </div>
          </div>
          <div className={`flex items-center ${openclawOnline ? 'bg-white/10' : 'bg-red-500/20'} rounded-full px-2 py-0.5 text-xs backdrop-blur-sm`}>
            <BsStars className={`mr-1 ${openclawOnline ? 'text-yellow-300' : 'text-red-300'}`} size={10} />
            {openclawOnline ? 'Connected' : 'Offline'}
          </div>
        </div>
      </div>

      {/* Improved Chat Area */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-3 bg-gradient-to-b from-gray-50 to-white">
        <AnimatePresence>
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={messageVariants}
              transition={{ duration: 0.3, delay: idx * 0.1 }}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${
                  msg.role === 'user'
                    ? `bg-gradient-to-br ${agentTheme} text-white rounded-tr-none`
                    : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                {msg.timestamp && (
                  <div className={`text-xs ${msg.role === 'user' ? 'text-white/70' : 'text-gray-400'} mt-2 text-right`}>
                    {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Enhanced Typing Indicator */}
        {loading && (
          <motion.div
            className="flex justify-start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="bg-white border border-gray-100 text-gray-800 rounded-2xl rounded-tl-none shadow-sm p-4 max-w-[85%]">
              <div className="flex items-center">
                <div className="mr-2">
                  <BsRobot className="text-gray-400" size={14} />
                </div>
                {isTypingNew ? (
                  <div className="flex space-x-1.5">
                    <motion.div
                      className="w-2 h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.8, repeat: Infinity, repeatType: "loop" }}
                    />
                    <motion.div
                      className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.8, delay: 0.2, repeat: Infinity, repeatType: "loop" }}
                    />
                    <motion.div
                      className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.8, delay: 0.4, repeat: Infinity, repeatType: "loop" }}
                    />
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">Processing via OpenClaw...</div>
                )}
              </div>
            </div>
          </motion.div>
        )}

      </div>

      {/* Enhanced Input Area */}
      <form onSubmit={handleSend} className="p-4 lg:p-5 border-t border-gray-100 bg-white">
        <div className="flex items-center bg-gray-50 rounded-xl border border-gray-200 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-sm">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={openclawOnline === false ? 'OpenClaw is offline. Click Start above...' : 'Type a message or command...'}
            className="flex-1 px-4 py-3 bg-transparent border-none focus:outline-none text-sm"
            disabled={loading || openclawOnline === false}
          />
          <button
            type="submit"
            className={`m-1.5 p-2.5 rounded-lg ${input.trim() && openclawOnline !== false ? `bg-gradient-to-r ${agentTheme}` : 'bg-gray-200'} text-white transition-all`}
            disabled={loading || !input.trim() || openclawOnline === false}
          >
            <BsSend size={16} />
          </button>
        </div>
        <div className="mt-2 text-center">
          <span className={`text-xs ${openclawOnline === false ? 'text-red-500' : 'text-gray-500'}`}>
            {openclawOnline === false ? '⚠️ OpenClaw offline — click Start above' : 'Connected to OpenClaw gateway'}
          </span>
        </div>
      </form>

      <CredentialModal
        isOpen={showCredentialModal}
        type={credentialType}
        message={pendingMessage}
        onSubmit={handleCredentialSubmit}
        onCancel={handleCredentialCancel}
      />
    </div>
  );
}