"use client";

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import AgentChat from './AgentChat';
import { BsRobot, BsLightningCharge, BsBraces, BsPlay, BsStop, BsHourglassSplit } from 'react-icons/bs';

interface PageLayoutProps {
  title: string;
  description: string;
  agentType: string;
  children?: React.ReactNode;
  onWorkflowCreate?: (name: string, initialStatus: 'success' | 'running' | 'failed', branch: string) => string;
  onWorkflowUpdate?: (workflowId: string, newStatus: 'success' | 'running' | 'failed', durationOverride?: string) => void;
  gitCredentials?: Record<string, { username: string; token: string }>;
}

export default function PageLayout({ 
  title, 
  description, 
  agentType,
  children,
  onWorkflowCreate,
  onWorkflowUpdate,
  gitCredentials,
}: PageLayoutProps) {
  const [openclawOnline, setOpenclawOnline] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval>>();

  const checkOpenClaw = async () => {
    try {
      const res = await fetch('/api/v1/openclaw', { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      setOpenclawOnline(data.status === 'connected');
    } catch {
      setOpenclawOnline(false);
    }
  };

  const toggleOpenClaw = async () => {
    setToggling(true);
    const wantsToStart = openclawOnline !== true;
    try {
      await fetch('/api/v1/openclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: wantsToStart ? 'start' : 'stop' }),
      });
      await new Promise((r) => setTimeout(r, wantsToStart ? 2000 : 1000));
      await checkOpenClaw();
    } catch {}
    setToggling(false);
  };

  useEffect(() => {
    checkOpenClaw();
    pollingRef.current = setInterval(checkOpenClaw, 10000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto px-4 py-6"
    >
      {/* Header Section with Gradient */}
      <div className="mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-500/10 via-purple-500/5 to-transparent rounded-full -mr-20 -mt-20 z-0"></div>
        
        <div className="relative z-10">
          <div className="flex items-center mb-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-500 flex items-center justify-center mr-3 shadow-md">
              {agentType === 'ci-cd' ? <BsBraces className="text-white" size={20} /> :
               agentType === 'cloud-infrastructure' ? <BsLightningCharge className="text-white" size={20} /> :
               <BsRobot className="text-white" size={20} />}
            </div>
            <motion.h1 
              className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-500 to-blue-500"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {title}
            </motion.h1>
          </div>
          
          <motion.p 
            className="text-lg ml-13 pl-0.5 text-gray-600 max-w-3xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            {description}
          </motion.p>
          
          <div className="h-1 w-24 bg-gradient-to-r from-indigo-600 via-purple-500 to-blue-500 rounded-full mt-4"></div>
        </div>
      </div>
      
      {/* AI Agent Pulse Indicator + Start/Stop — real OpenClaw health */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <div className="relative mr-2">
            {openclawOnline === null ? (
              <div className="h-3 w-3 bg-yellow-400 rounded-full"></div>
            ) : (
              <>
                <div className={`h-3 w-3 ${openclawOnline ? 'bg-green-500' : 'bg-red-500'} rounded-full`}></div>
                {openclawOnline && (
                  <div className="absolute top-0 left-0 h-3 w-3 bg-green-500 rounded-full animate-ping opacity-75"></div>
                )}
              </>
            )}
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            OpenClaw AI Agent{' '}
            {openclawOnline === null ? (
              <span className="text-yellow-600 dark:text-yellow-400">checking...</span>
            ) : openclawOnline ? (
              <span className="text-green-600 dark:text-green-400">active</span>
            ) : (
              <span className="text-red-600 dark:text-red-400">disconnected</span>
            )}
          </p>
        </div>
        <button
          onClick={toggleOpenClaw}
          disabled={toggling || openclawOnline === null}
          className={`flex items-center text-xs px-3 py-1.5 rounded-md transition-colors ${
            openclawOnline
              ? 'bg-red-100 hover:bg-red-200 text-red-700'
              : 'bg-green-100 hover:bg-green-200 text-green-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {toggling ? (
            <><BsHourglassSplit className="mr-1 animate-spin" /> {openclawOnline ? 'Stopping...' : 'Starting...'}</>
          ) : openclawOnline ? (
            <><BsStop className="mr-1" /> Stop</>
          ) : (
            <><BsPlay className="mr-1" /> Start</>
          )}
        </button>
      </div>
      
      {/* Main Content Grid with Enhanced Styling */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div 
          className="order-2 lg:order-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="p-1 bg-gradient-to-r from-indigo-600 via-purple-500 to-blue-500"></div>
          <div className="p-4">
            <AgentChat agentType={agentType} openclawOnline={openclawOnline} onWorkflowCreate={onWorkflowCreate} onWorkflowUpdate={onWorkflowUpdate} gitCredentials={gitCredentials} />
          </div>
        </motion.div>
        
        <motion.div 
          className="order-1 lg:order-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {children}
        </motion.div>
      </div>
      
      {/* Subtle AI Pattern Background */}
      <div className="fixed top-0 right-0 w-full h-full pointer-events-none opacity-5 z-0">
        <div className="absolute top-10 right-10 w-40 h-40 border-4 border-indigo-600 rounded-full"></div>
        <div className="absolute bottom-20 right-20 w-60 h-60 border-4 border-purple-500 rounded-full"></div>
        <div className="absolute top-40 left-10 w-20 h-20 border-4 border-blue-500 rounded-full"></div>
      </div>
    </motion.div>
  );
}
