"use client";

import { useState, useEffect, useRef } from 'react';
import React from 'react';
import PageLayout from '@/components/PageLayout';
import MultiModalChat from '@/components/MultiModalChat';
import CredentialModal from '@/components/CredentialModal';
import { 
  BsCheckCircle, 
  BsArrowRepeat, 
  BsBarChart, 
  BsGithub, 
  BsRobot, 
  BsLightning, 
  BsArrowClockwise,
  BsGit,
  BsPlay,
  BsServer,
  BsTerminal,
  BsQuestionCircle,
  BsChevronDown,
  BsChevronUp,
  BsCodeSquare,
  BsHourglassSplit,
  BsXCircle,
  BsInfoCircle
} from 'react-icons/bs';
import { FaGitlab, FaBitbucket } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

// Types for our GitHub and AI integration data
interface GitHubWorkflow {
  id: string;
  name: string;
  status: 'success' | 'running' | 'failed';
  lastRun: string;
  duration: string;
  url: string;
  branch: string;
}

interface AIAnalysis {
  id: string;
  suggestion: string;
  improvement: string;
  confidenceScore: number;
  category: 'performance' | 'security' | 'reliability' | 'cost';
  applied: boolean;
}

interface MCPServerStatus {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'error';
  lastStarted?: string;
  port: string;
  endpoint: string;
  url: string;
  workspace: string;
  mcpServers?: { name: string; ok: boolean }[];
}

interface GitPlatform {
  id: string;
  name: string;
  icon: React.ReactElement; // ✅ FIXED: JSX.Element -> React.ReactElement
  connected: boolean;
  url?: string;
}

export default function CiCdPage() {
  // State for GitHub workflows
  const [workflows, setWorkflows] = useState<GitHubWorkflow[]>([]);
  
  // State for AI analysis
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis[]>([]);
  
  // ✅ Ref to make sure AI analysis only auto-runs ONCE after initial workflow load
  const hasRunInitialAnalysis = useRef(false);
  
  // ✅ Ref for the custom question input (instead of document.querySelector)
  const customQuestionInputRef = useRef<HTMLInputElement>(null);
  
  const [mcpServers, setMcpServers] = useState<MCPServerStatus[]>([]);
  const [openClawMcpServers, setOpenClawMcpServers] = useState<{ name: string; ok: boolean }[]>([]);
  
  // Loading states
  const [loading, setLoading] = useState({
    github: false,
    ai: false,
    mcp: false,
    git: false
  });
  
  // Feedback message
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackType, setFeedbackType] = useState<'info' | 'success' | 'error'>('info');
  const [feedbackVerifying, setFeedbackVerifying] = useState(false);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Stored git credentials (username + token per platform)
  const [gitCredentials, setGitCredentials] = useState<Record<string, { username: string; token: string }>>({});
  const [gitCredModal, setGitCredModal] = useState<string | null>(null);

  // Load git credentials from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('git-credentials');
      if (stored) {
        const parsed = JSON.parse(stored);
        setGitCredentials(parsed);
        // Sync platform connection status
        setGitPlatforms(prev => prev.map(p => ({
          ...p,
          connected: p.id === 'github' ? true : !!parsed[p.id],
          url: parsed[p.id] ? `https://${p.id}.com/organization/repo` : p.url,
        })));
      }
    } catch {}
  }, []);

  // Persist git credentials to localStorage
  useEffect(() => {
    if (Object.keys(gitCredentials).length > 0) {
      localStorage.setItem('git-credentials', JSON.stringify(gitCredentials));
    }
  }, [gitCredentials]);

  // Git platforms
  const [gitPlatforms, setGitPlatforms] = useState<GitPlatform[]>([
    {
      id: 'github',
      name: 'GitHub',
      icon: <BsGithub size={18} />,
      connected: false,
    },
    {
      id: 'gitlab',
      name: 'GitLab',
      icon: <FaGitlab size={18} />,
      connected: false
    },
    {
      id: 'bitbucket',
      name: 'Bitbucket',
      icon: <FaBitbucket size={18} />,
      connected: false
    }
  ]);

  // AI-generated placeholder questions
  const aiQuestions = [
    "How can I optimize my Docker build steps to reduce build time?",
    "What are the common failure points in my CI pipeline for the feature branch?",
    "How should I configure resource limits for my Kubernetes deployments?"
  ];
  
  // Selected question
  const [selectedQuestion, setSelectedQuestion] = useState('');
  
  // Expanded sections
  const [expandedSections, setExpandedSections] = useState({
    gitPlatforms: true,
    mcpServers: true,
    workflows: true,
    aiQuestions: true,
    aiAnalysis: true
  });

  // Toggle section expansion
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Fetch GitHub workflows — replaces mock with real API call
  const fetchGitHubWorkflows = async () => {
    setLoading(prev => ({ ...prev, github: true }));
    try {
      const res = await fetch('/api/github/workflows').catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setWorkflows(data);
      }
    } catch {}
    setLoading(prev => ({ ...prev, github: false }));
  };

  // Fetch AI analysis
  const fetchAIAnalysis = async () => {
    setLoading(prev => ({ ...prev, ai: true }));
    
    try {
      // TODO: Replace with real call to your AI/MCP backend
      // const response = await fetch('/api/ai/analyze-workflows', { method: 'POST', body: JSON.stringify({ workflows }) });
      
      setTimeout(() => {
        const mockAnalysis: AIAnalysis[] = [
          {
            id: 'ai-1',
            suggestion: 'Optimize Docker Image Caching',
            improvement: 'Current Docker build times could be reduced by ~42% by implementing proper layer caching strategies in your Dockerfiles.',
            confidenceScore: 0.89,
            category: 'performance',
            applied: false
          },
          {
            id: 'ai-2',
            suggestion: 'Parallelize Test Execution',
            improvement: 'Split your test suite into multiple parallel jobs to reduce total build time by approximately 65%.',
            confidenceScore: 0.78,
            category: 'performance',
            applied: false
          },
          {
            id: 'ai-3',
            suggestion: 'Add Secret Scanning',
            improvement: 'Implement automated secret scanning in your pipeline to detect potential credential leaks before they reach production.',
            confidenceScore: 0.95,
            category: 'security',
            applied: false
          }
        ];
        
        setAiAnalysis(mockAnalysis);
        setLoading(prev => ({ ...prev, ai: false }));
      }, 2000);
    } catch (error) {
      console.error("Error fetching AI analysis:", error);
      setLoading(prev => ({ ...prev, ai: false }));
    }
  };

  // Apply AI optimization
  const applyAIOptimization = (id: string) => {
    setAiAnalysis(prev => 
      prev.map(item => 
        item.id === id ? { ...item, applied: true } : item
      )
    );
    
    setFeedbackMessage(`Optimization "${aiAnalysis.find(a => a.id === id)?.suggestion}" has been applied successfully.`);
  };

  // ✅ FIXED: createWorkflow now RETURNS the new workflow's id,
  // so callers (like the chat) can later UPDATE that same workflow
  // instead of creating a duplicate one.
  const createWorkflow = (
    name: string, 
    initialStatus: 'success' | 'running' | 'failed', 
    branch: string
  ): string => {
    const newWorkflow: GitHubWorkflow = {
      id: `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      status: initialStatus,
      lastRun: new Date().toISOString(),
      duration: initialStatus === 'running' ? '0s' : '0m 0s',
      url: '#',
      branch
    };
    
    setWorkflows(prev => [...prev, newWorkflow]);
    return newWorkflow.id; // ✅ caller can now track this exact workflow
  };

  // ✅ NEW: dedicated update function (separate from create).
  // This is the function the chat widget should call when a 
  // "running" task (e.g. a clone) finishes with success/failure.
  const updateWorkflowStatus = (
    workflowId: string, 
    newStatus: 'success' | 'running' | 'failed',
    durationOverride?: string
  ) => {
    setWorkflows(prev => 
      prev.map(w => 
        w.id === workflowId 
          ? { 
              ...w, 
              status: newStatus,
              duration: durationOverride 
                ? durationOverride 
                : (newStatus === 'success' || newStatus === 'failed')
                  ? `${Math.floor(Math.random() * 10) + 1}m ${Math.floor(Math.random() * 60)}s`
                  : w.duration
            } 
          : w
      )
    );
  };

  // Toggle MCP server start/stop via env proxy
  const toggleMcpServer = async (serverId: string) => {
    setLoading(prev => ({ ...prev, mcp: true }));
    
    try {
      const targetServer = mcpServers.find(s => s.id === serverId);
      if (!targetServer) return;

      const wantsToStart = targetServer.status !== 'running';
      const envMap: Record<string, string> = {
        'mcp-development': 'dev',
        'mcp-staging': 'staging',
        'mcp-production': 'prod',
      };
      const env = envMap[serverId] || serverId.split('-').pop() || 'dev';

      const res = await fetch(`/api/v1/mcp/${env}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: wantsToStart ? 'start' : 'stop' }),
      });
      const result = await res.json();

      if (result.success) {
        const newStatus = wantsToStart ? 'running' as const : 'stopped' as const;
        const updatedServers = mcpServers.map(s => {
          if (s.id === serverId) {
            return {
              ...s,
              status: newStatus,
              lastStarted: newStatus === 'running' ? new Date().toISOString() : s.lastStarted,
            };
          }
          return s;
        });
        setMcpServers(updatedServers);

        if (wantsToStart) {
          showFeedbackMessage(`${targetServer.name} started on ${targetServer.url}`);
          const wfId = createWorkflow(`Start ${targetServer.name}`, 'running', 'main');
          setTimeout(() => updateWorkflowStatus(wfId, 'success'), 2000);
        } else {
          showFeedbackMessage(`${targetServer.name} stopped`);
        }
      } else {
        showFeedbackMessage(result.error || `Failed to ${wantsToStart ? 'start' : 'stop'} server`);
      }
    } catch (error) {
      console.error("Error toggling MCP server:", error);
      showFeedbackMessage('Failed to toggle server');
    } finally {
      setLoading(prev => ({ ...prev, mcp: false }));
    }
  };

  // Connect to Git platform
  const connectGitPlatform = async (platformId: string) => {
    const platform = gitPlatforms.find(p => p.id === platformId);
    if (!platform) return;

    // If disconnecting, clear credentials
    if (platform.connected) {
      setGitCredentials(prev => {
        const next = { ...prev };
        delete next[platformId];
        localStorage.setItem('git-credentials', JSON.stringify(next));
        return next;
      });
      setGitPlatforms(prev => prev.map(p =>
        p.id === platformId ? { ...p, connected: false, url: undefined } : p
      ));
      showFeedbackMessage(`Disconnected from ${platform.name}`);
      return;
    }

    // If connecting, show credential modal
    setGitCredModal(platformId);
  };

  const handleGitCredentialSubmit = async (creds: Record<string, string>) => {
    const platformId = gitCredModal;
    if (!platformId) return;
    const platform = gitPlatforms.find(p => p.id === platformId);
    if (!platform) return;

    if (!creds.gitPassword || creds.gitPassword.trim() === '') {
      showFeedbackMessage('Token/password is required to connect');
      return;
    }

    // Verify credentials against platform API
    showFeedbackMessage(`⏳ Verifying ${platform.name} credentials...`, 'info', true);

    try {
      const res = await fetch('/api/v1/verify-git', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: platformId,
          token: creds.gitPassword.trim(),
          username: creds.gitUsername || '',
        }),
      });
      const result = await res.json();

      if (result.verified) {
        setGitCredentials(prev => ({
          ...prev,
          [platformId]: { username: result.login || creds.gitUsername || '', token: creds.gitPassword.trim() }
        }));
        setGitPlatforms(prev => prev.map(p =>
          p.id === platformId ? { ...p, connected: true, url: `https://${p.id}.com/organization/repo` } : p
        ));
        setGitCredModal(null);
        showFeedbackMessage(`✅ ${result.message || `Connected to ${platform.name}`}`, 'success');
      } else {
        showFeedbackMessage(`❌ ${result.message || 'Verification failed. Check your token.'}`, 'error');
      }
    } catch {
      showFeedbackMessage(`❌ Could not verify ${platform.name} credentials. Check your network.`, 'error');
    }
  };

  const handleGitCredentialCancel = () => {
    setGitCredModal(null);
  };

  // Ask AI a question
  const askAIQuestion = (question: string) => {
    setSelectedQuestion(question);
    showFeedbackMessage(`Analyzing: "${question}". The AI is processing your question...`);
    
    setTimeout(() => {
      showFeedbackMessage(`AI Response: Based on my analysis of your CI/CD pipelines, I recommend optimizing your test parallelization strategy. You could reduce build times by up to 35% with proper test distribution across multiple runners.`);
    }, 2000);
  };

  // Helper function to show feedback message with auto-dismiss
  const showFeedbackMessage = (message: string, type: 'info' | 'success' | 'error' = 'info', verifying = false) => {
    setFeedbackMessage(message);
    setFeedbackType(type);
    setFeedbackVerifying(verifying);
    
    if (feedbackTimeout.current) {
      clearTimeout(feedbackTimeout.current);
    }
    
    if (!verifying) {
      feedbackTimeout.current = setTimeout(() => {
        setFeedbackMessage('');
        setFeedbackVerifying(false);
      }, type === 'error' ? 10000 : 6000);
    }
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimeout.current) {
        clearTimeout(feedbackTimeout.current);
      }
    };
  }, []);

  // Fetch MCP server statuses via env-specific proxy
  const fetchMcpServers = async () => {
    try {
      const envs = [
        { id: 'mcp-development', name: 'Development MCP', env: 'dev', url: process.env.NEXT_PUBLIC_MCP_DEV_URL || 'http://localhost:8082', workspace: process.env.NEXT_PUBLIC_MCP_DEV_WORKSPACE || '/home/bsetec/workspaces/dev' },
      ];

      const results = await Promise.allSettled(
        envs.map(async (e) => {
          const res = await fetch(`/api/v1/mcp/${e.env}?action=health`);
          return { ...e, data: await res.json() };
        })
      );

      const servers: MCPServerStatus[] = [];
      for (const [i, result] of results.entries()) {
        const e = envs[i];
        if (result.status === 'fulfilled' && result.value.data.success) {
          servers.push({
            id: e.id,
            name: e.name,
            status: result.value.data.status === 'running' ? 'running' : 'stopped',
            endpoint: `/api/v1/mcp/${e.env}`,
            port: result.value.data.url || e.url,
            url: e.url,
            workspace: e.workspace,
            lastStarted: result.value.data.status === 'running' ? new Date().toISOString() : undefined,
          });
        } else {
          servers.push({
            id: e.id,
            name: e.name,
            status: 'stopped',
            endpoint: `/api/v1/mcp/${e.env}`,
            port: e.url,
            url: e.url,
            workspace: e.workspace,
          });
        }
      }
      setMcpServers(servers);

      // Also fetch OpenClaw MCP status
      try {
        const ocRes = await fetch('/api/v1/mcp');
        const ocData = await ocRes.json();
        if (ocData.mcpStatus) setOpenClawMcpServers(ocData.mcpStatus);
      } catch {}
    } catch (err) {
      console.error('Failed to fetch MCP servers:', err);
    }
  };

  // Fetch MCP servers on mount
  useEffect(() => {
    fetchMcpServers();
  }, []);

  // Auto-run AI analysis ONCE after first real workflow is added
  useEffect(() => {
    if (workflows.length > 0 && !hasRunInitialAnalysis.current) {
      hasRunInitialAnalysis.current = true;
      fetchAIAnalysis();
    }
  }, [workflows]);

  // ✅ FIXED: uses a ref instead of document.querySelector('input')
  const handleCustomQuestionSubmit = () => {
    const value = customQuestionInputRef.current?.value;
    if (value) {
      askAIQuestion(value);
      if (customQuestionInputRef.current) {
        customQuestionInputRef.current.value = '';
      }
    }
  };

  return (
    <PageLayout
      title="CI/CD Pipeline Management"
      description="Optimize your continuous integration and delivery pipelines with AI-driven insights."
      agentType="ci-cd"
      onWorkflowCreate={createWorkflow}
      onWorkflowUpdate={updateWorkflowStatus}
      gitCredentials={gitCredentials}
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-msGray-600">Total Workflows</div>
              <div className="text-2xl font-semibold">{workflows.length}</div>
            </div>
            <div className="p-3 rounded-full bg-green-100">
              <BsCodeSquare size={20} className="text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="card p-4 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-msGray-600">Running Workflows</div>
              <div className="text-2xl font-semibold">{workflows.filter(w => w.status === 'running').length}</div>
            </div>
            <div className="p-3 rounded-full bg-blue-100">
              <BsHourglassSplit size={20} className="text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="card p-4 border-l-4 border-l-red-500">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-msGray-600">Failed Workflows</div>
              <div className="text-2xl font-semibold">{workflows.filter(w => w.status === 'failed').length}</div>
            </div>
            <div className="p-3 rounded-full bg-red-100">
              <BsXCircle size={20} className="text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Git Platform Integration */}
      <motion.div 
        className="card mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => toggleSection('gitPlatforms')}>
          <div className="flex items-center">
            <BsGit size={20} className="text-msBlue-600 mr-2" />
            <h3 className="text-xl font-semibold">Git Platform Integration</h3>
          </div>
          <button className="text-msGray-500 hover:text-msGray-700">
            {expandedSections.gitPlatforms ? <BsChevronUp /> : <BsChevronDown />}
          </button>
        </div>
        
        <AnimatePresence>
          {expandedSections.gitPlatforms && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {gitPlatforms.map(platform => (
                  <div 
                    key={platform.id} 
                    className={`border rounded-md p-4 transition-all duration-300 ${
                      platform.connected 
                        ? 'bg-green-50 border-green-200 hover:border-green-300' 
                        : 'bg-msGray-50 border-msGray-200 hover:border-msGray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center">
                        <span className="mr-2 text-msGray-600">{platform.icon}</span>
                        <h4 className="font-medium">{platform.name}</h4>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        platform.connected 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-msGray-200 text-msGray-600'
                      }`}>
                        {platform.connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                    
                    {platform.connected && platform.url && (
                      <div className="text-xs text-msGray-600 mb-3 truncate">
                        Repository: <a href={platform.url} target="_blank" rel="noopener noreferrer" className="text-msBlue-600 hover:underline">{platform.url}</a>
                      </div>
                    )}
                    
                    <button
                      onClick={() => connectGitPlatform(platform.id)}
                      className={`w-full text-sm py-1.5 rounded-md transition-colors ${
                        platform.connected 
                          ? 'bg-msGray-100 hover:bg-msGray-200 text-msGray-700' 
                          : 'bg-msBlue-600 hover:bg-msBlue-700 text-white'
                      }`}
                      disabled={loading.git}
                    >
                      {platform.connected ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
              <div className="text-sm text-msGray-600 bg-msBlue-50 p-3 rounded-md border border-msBlue-100 flex items-start">
                <BsInfoCircle className="text-msBlue-600 mr-2 mt-0.5" />
                <p>Connect your Git repositories to enable automatic workflow discovery and CI/CD pipeline integration.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      
      {/* MCP Server Controls */}
      <motion.div 
        className="card mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => toggleSection('mcpServers')}>
          <div className="flex items-center">
            <BsServer size={20} className="text-msBlue-600 mr-2" />
            <h3 className="text-xl font-semibold">Development MCP</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-msGray-500">Local @ :8082</span>
            <button className="text-msGray-500 hover:text-msGray-700">
              {expandedSections.mcpServers ? <BsChevronUp /> : <BsChevronDown />}
            </button>
          </div>
        </div>
        
        <AnimatePresence>
          {expandedSections.mcpServers && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              >
                {/* Development MCP Server */}
                <div className="space-y-4 mb-6">
                  {mcpServers.map(server => (
                  <div key={server.id} className="border rounded-md p-4 bg-white hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-medium mb-1">{server.name}</h4>
                        <div className="text-sm text-msGray-600">
                          <span className="mr-3">URL: {server.url}</span>
                          <span className="mr-3">Workspace: {server.workspace}</span>
                          {server.status === 'running' && server.lastStarted && (
                            <span>Connected: {new Date(server.lastStarted).toLocaleTimeString()}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center">
                        <span className={`flex items-center mr-3 px-2 py-1 rounded-full text-xs ${
                          server.status === 'running' 
                            ? 'bg-green-100 text-green-700' 
                            : server.status === 'error'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-msGray-200 text-msGray-600'
                        }`}>
                          <span className={`w-2 h-2 rounded-full mr-1 ${
                            server.status === 'running' 
                              ? 'bg-green-500' 
                              : server.status === 'error'
                                ? 'bg-red-500'
                                : 'bg-msGray-500'
                          }`}></span>
                          {server.status.charAt(0).toUpperCase() + server.status.slice(1)}
                        </span>
                        
                        <button
                          onClick={() => toggleMcpServer(server.id)}
                          className={`flex items-center rounded-md px-3 py-1.5 text-sm transition-colors ${
                            server.status === 'running'
                              ? 'bg-msGray-100 hover:bg-msGray-200 text-msGray-700'
                              : 'bg-msBlue-600 hover:bg-msBlue-700 text-white'
                          }`}
                          disabled={loading.mcp}
                        >
                          {server.status === 'running' ? (
                            <>
                              <BsTerminal className="mr-1" />
                              Stop
                            </>
                          ) : (
                            <>
                              <BsPlay className="mr-1" />
                              Start
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    
                    {server.status === 'running' && server.mcpServers && (
                      <motion.div 
                        className="mt-3 pt-3 border-t border-green-200"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="text-sm text-msGray-600">
                          <span className="font-medium text-msGray-700">MCP Tools Connected:</span>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {server.mcpServers.map((mcp) => (
                              <span
                                key={mcp.name}
                                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                  mcp.ok
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full mr-1 ${
                                  mcp.ok ? 'bg-green-500' : 'bg-red-500'
                                }`}></span>
                                {mcp.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                ))}
              </div>

              {/* OpenClaw MCP Tools Status */}
              {openClawMcpServers.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold text-msGray-500 uppercase tracking-wider mb-3">MCP Tools (OpenClaw)</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {openClawMcpServers.map((mcp) => {
                      const icons: Record<string, React.ReactNode> = {
                        docker: <span className="text-lg">🐳</span>,
                        filesystem: <span className="text-lg">📁</span>,
                        github: <BsGithub size={18} />,
                        kubernetes: <span className="text-lg">☸️</span>,
                      };
                      return (
                        <div key={mcp.name} className={`border rounded-md p-3 text-sm ${
                          mcp.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            {icons[mcp.name] || <BsCodeSquare />}
                            <span className="font-medium capitalize">{mcp.name}</span>
                          </div>
                          <div className="flex items-center">
                            <span className={`w-2 h-2 rounded-full mr-1 ${
                              mcp.ok ? 'bg-green-500' : 'bg-red-500'
                            }`}></span>
                            <span className={mcp.ok ? 'text-green-700' : 'text-red-700'}>
                              {mcp.ok ? 'Connected' : 'Error'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* GitHub Workflow Integration */}
      <motion.div 
        className="card mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => toggleSection('workflows')}>
          <div className="flex items-center">
            <BsGithub size={20} className="text-msBlue-600 mr-2" />
            <h3 className="text-xl font-semibold">GitHub Workflow Status</h3>
          </div>
          <div className="flex items-center">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                fetchGitHubWorkflows();
              }}
              className="flex items-center bg-msGray-100 hover:bg-msGray-200 rounded-md px-3 py-1 text-sm mr-2"
              disabled={loading.github}
            >
              <BsArrowClockwise className={`mr-1 ${loading.github ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button className="text-msGray-500 hover:text-msGray-700">
              {expandedSections.workflows ? <BsChevronUp /> : <BsChevronDown />}
            </button>
          </div>
        </div>
        
        <AnimatePresence>
          {expandedSections.workflows && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {loading.github ? (
                <div className="flex justify-center items-center py-8">
                  <BsArrowClockwise className="animate-spin text-msBlue-600 mr-2" />
                  <span>Loading workflows...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {workflows.map(workflow => (
                    <div 
                      key={workflow.id} 
                      className={`border rounded-md p-4 transition-all duration-200 ${
                        workflow.status === 'success'
                          ? 'bg-green-50 border-green-200'
                          : workflow.status === 'running'
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                        <div>
                          <div className="flex items-center mb-1">
                            {workflow.status === 'success' && <BsCheckCircle className="text-green-600 mr-1" />}
                            {workflow.status === 'running' && <BsArrowRepeat className="text-blue-600 animate-spin mr-1" />}
                            {workflow.status === 'failed' && <BsXCircle className="text-red-600 mr-1" />}
                            <h4 className="font-medium">{workflow.name}</h4>
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-msGray-200 text-msGray-700">{workflow.branch}</span>
                          </div>
                          <div className="flex flex-wrap text-sm text-msGray-600">
                            <span className="mr-3">
                              Last Run: {new Date(workflow.lastRun).toLocaleString()}
                            </span>
                            <span className="mr-3">
                              Duration: {workflow.duration}
                            </span>
                            <a 
                              href={workflow.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-msBlue-600 hover:underline text-sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Details
                            </a>
                          </div>
                        </div>
                        
                        <div className="mt-2 sm:mt-0">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                            workflow.status === 'success'
                              ? 'bg-green-100 text-green-800'
                              : workflow.status === 'running'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-red-100 text-red-800'
                          }`}>
                            {workflow.status === 'success' && 'Success'}
                            {workflow.status === 'running' && 'Running'}
                            {workflow.status === 'failed' && 'Failed'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* AI Questions & Analysis */}
      <motion.div 
        className="card mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <div className="flex items-center mb-4 justify-between cursor-pointer" onClick={() => toggleSection('aiQuestions')}>
          <div className="flex items-center">
            <BsQuestionCircle size={20} className="text-msBlue-600 mr-2" />
            <h3 className="text-xl font-semibold">Ask AI About Your CI/CD</h3>
          </div>
          <button className="text-msGray-500 hover:text-msGray-700">
            {expandedSections.aiQuestions ? <BsChevronUp /> : <BsChevronDown />}
          </button>
        </div>
        
        <AnimatePresence>
          {expandedSections.aiQuestions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="space-y-3 mb-4">
                <p className="text-msGray-600">Select a question or type your own:</p>
                
                <div className="space-y-2">
                  {aiQuestions.map((question, index) => (
                    <button
                      key={index}
                      onClick={() => askAIQuestion(question)}
                      className={`block w-full text-left p-3 rounded-md border hover:bg-msBlue-50 hover:border-msBlue-200 transition-colors ${
                        selectedQuestion === question
                          ? 'bg-msBlue-50 border-msBlue-300 shadow-sm'
                          : 'bg-white border-msGray-200'
                      }`}
                    >
                      {question}
                    </button>
                  ))}
                </div>
                
                <div className="flex mt-4">
                  <input
                    ref={customQuestionInputRef}
                    type="text"
                    placeholder="Ask a custom question about your CI/CD pipelines..."
                    className="flex-grow px-4 py-2 border border-msGray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-msBlue-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomQuestionSubmit()}
                  />
                  <button
                    onClick={handleCustomQuestionSubmit}
                    className="bg-msBlue-600 hover:bg-msBlue-700 text-white px-4 py-2 rounded-r-md"
                  >
                    Ask AI
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* AI Analysis Integration */}
      <motion.div 
        className="card mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      >
        <div className="flex items-center justify-between mb-4 cursor-pointer" onClick={() => toggleSection('aiAnalysis')}>
          <div className="flex items-center">
            <BsRobot size={20} className="text-msBlue-600 mr-2" />
            <h3 className="text-xl font-semibold">AI Pipeline Analysis</h3>
          </div>
          <div className="flex items-center">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                fetchAIAnalysis();
              }}
              className="flex items-center bg-msGray-100 hover:bg-msGray-200 rounded-md px-3 py-1 text-sm mr-2"
              disabled={loading.ai || workflows.length === 0}
            >
              <BsArrowClockwise className={`mr-1 ${loading.ai ? 'animate-spin' : ''}`} />
              Analyze
            </button>
            <button className="text-msGray-500 hover:text-msGray-700">
              {expandedSections.aiAnalysis ? <BsChevronUp /> : <BsChevronDown />}
            </button>
          </div>
        </div>
        
        <AnimatePresence>
          {expandedSections.aiAnalysis && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {loading.ai ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <div className="flex items-center">
                    <BsRobot className="text-msBlue-600 mr-2" size={24} />
                    <span className="text-msGray-700 font-medium">AI analyzing your CI/CD pipelines...</span>
                  </div>
                  <div className="w-48 h-1.5 bg-msGray-200 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-msBlue-600 rounded-full" 
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  {aiAnalysis.length > 0 ? (
                    <div className="space-y-4">
                      {aiAnalysis.map(analysis => (
                        <div 
                          key={analysis.id} 
                          className={`border rounded-md p-4 ${
                            analysis.applied
                              ? 'bg-green-50 border-green-200'
                              : 'bg-white border-msGray-200 hover:border-msBlue-200 transition-colors'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className={`px-2 py-1 rounded-full text-xs ${
                              analysis.category === 'performance'
                                ? 'bg-blue-100 text-blue-800'
                                : analysis.category === 'security'
                                  ? 'bg-red-100 text-red-800'
                                  : analysis.category === 'reliability'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-green-100 text-green-800'
                            }`}>
                              {analysis.category.charAt(0).toUpperCase() + analysis.category.slice(1)}
                            </div>
                            <div className="flex items-center">
                              <BsBarChart className="text-msGray-600 mr-1" />
                              <span className="text-sm text-msGray-600">
                                Confidence: {Math.round(analysis.confidenceScore * 100)}%
                              </span>
                            </div>
                          </div>
                          <h4 className="text-lg font-medium mb-1">{analysis.suggestion}</h4>
                          <p className="text-msGray-600 mb-3">{analysis.improvement}</p>
                          {!analysis.applied && (
                            <div className="flex justify-end">
                              <button
                                onClick={() => applyAIOptimization(analysis.id)}
                                className="flex items-center bg-msBlue-600 hover:bg-msBlue-700 text-white rounded-md px-3 py-1 text-sm transition-colors"
                              >
                                <BsLightning className="mr-1" />
                                Apply Optimization
                              </button>
                            </div>
                          )}
                          {analysis.applied && (
                            <div className="flex items-center text-green-600">
                              <BsCheckCircle className="mr-1" />
                              <span className="text-sm font-medium">Optimization Applied</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-msGray-500">
                      <BsRobot size={32} className="mx-auto mb-2 text-msGray-400" />
                      <p>No AI analysis available yet. Click &quot;Analyze&quot; to get started.</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      
      {/* Feedback message with animated success/error */}
      <AnimatePresence>
        {feedbackMessage && (
          <motion.div 
            className={`mt-4 p-4 rounded-xl shadow-lg border-2 flex items-center gap-3 ${
              feedbackType === 'success'
                ? 'bg-green-50 text-green-800 border-green-400'
                : feedbackType === 'error'
                ? 'bg-red-50 text-red-800 border-red-400'
                : feedbackVerifying
                ? 'bg-blue-50 text-blue-800 border-blue-400'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            {feedbackVerifying ? (
              <svg className="animate-spin h-5 w-5 text-blue-600 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : feedbackType === 'success' ? (
              <svg className="h-5 w-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <motion.path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4 }} />
              </svg>
            ) : feedbackType === 'error' ? (
              <motion.svg className="h-5 w-5 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                initial={{ rotate: 0 }} animate={{ rotate: [0, -10, 10, -5, 0] }} transition={{ duration: 0.5 }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </motion.svg>
            ) : (
              <svg className="h-5 w-5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="text-sm font-medium">{feedbackMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Multi-Modal AI Chat Widget */}
      {/* ✅ FIXED: now passes BOTH create + update so chat can move 
          a workflow from running -> success/failed without duplicating it */}
      <MultiModalChat 
        onWorkflowCreate={createWorkflow}
        onWorkflowUpdate={updateWorkflowStatus}
        agentType="ci-cd"
      />

      <CredentialModal
        isOpen={gitCredModal !== null}
        type="git"
        message={`Connect to ${gitPlatforms.find(p => p.id === gitCredModal)?.name || 'Git'} platform`}
        onSubmit={handleGitCredentialSubmit}
        onCancel={handleGitCredentialCancel}
      />
    </PageLayout>
  );
}