"use client";
import { useState } from 'react';
import PageLayout from '@/components/PageLayout';
import MultiModalChat from '@/components/MultiModalChat';
import {
  BsGraphUp,
  BsGearFill,
  BsLightning,
  BsClockHistory,
  BsCardChecklist,
  BsAlarm,
  BsTools,
  BsClipboardData,
  BsCalendar2Check,
  BsArrowRepeat,
  BsBarChart
} from 'react-icons/bs';

export default function LoadTestingPage() {
  const [testScenarios, setTestScenarios] = useState([{ name: 'Basic Scenario', load: 50 }]);
  const [results, setResults] = useState<{ scenario: string; tps: number; errors: number }[]>([]);
  const [loading, setLoading] = useState(false);

  // Add KPIs for load testing 
  const [loadTestKpis] = useState([
    { name: 'Response Time', value: '230ms', trend: 'down', target: '<300ms' },
    { name: 'Throughput', value: '542 req/s', trend: 'up', target: '>500 req/s' },
    { name: 'Error Rate', value: '1.2%', trend: 'down', target: '<2%' },
    { name: 'Concurrent Users', value: '1,250', trend: 'up', target: '>1,000' },
    { name: 'Resource Utilization', value: '68%', trend: 'stable', target: '<75%' },
    { name: 'Latency (P95)', value: '410ms', trend: 'down', target: '<500ms' },
    { name: 'Time to First Byte', value: '125ms', trend: 'down', target: '<150ms' },
    { name: 'Success Rate', value: '98.8%', trend: 'up', target: '>98%' }
  ]);
  
  const [scenarios] = useState([
    { name: 'Peak Load', description: 'Simulates maximum expected traffic', vus: 1500, duration: '10m' },
    { name: 'Stress Test', description: 'Gradually increasing load until failure', vus: 2500, duration: '15m' },
    { name: 'Soak Test', description: 'Sustained moderate load over time', vus: 800, duration: '60m' }
  ]);

  // 1. Test Scenarios
  const addScenario = () => {
    setTestScenarios([...testScenarios, { name: `Scenario ${testScenarios.length + 1}`, load: 10 }]);
  };

  // 2. Configuration
  const configureTest = () => {
    // ...placeholder...
  };

  // 3. Ramp Up
  const rampUp = () => {
    // ...placeholder...
  };

  // 4. Ramp Down
  const rampDown = () => {
    // ...placeholder...
  };

  // 5. Live Metrics
  const runTest = () => {
    setLoading(true);
    setTimeout(() => {
      setResults([...results, { scenario: testScenarios[0].name, tps: 120, errors: 2 }]);
      setLoading(false);
    }, 1500);
  };

  // 6. Result Analysis
  // ...placeholder...

  // 7. Scheduling
  // ...placeholder...

  // 8. Alerts
  // ...placeholder...

  // 9. Logging / History
  // ...placeholder...

  return (
    <PageLayout
      title="Load Testing"
      description="Simulate traffic and analyze system performance under load."
      agentType="load-testing"
    >
      {/* Add KPI Dashboard */}
      <div className="card p-4 mb-4">
        <div className="flex items-center mb-4">
          <BsBarChart className="text-green-600 dark:text-green-400 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Key Performance Indicators</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {loadTestKpis.map((kpi, idx) => (
            <div key={idx} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">{kpi.name}</div>
              <div className="flex items-end justify-between">
                <div className="text-xl font-bold text-gray-900 dark:text-white">{kpi.value}</div>
                <div className="flex items-center text-xs">
                  <span className={`mr-1 ${
                    kpi.trend === 'up' ? 'text-green-600 dark:text-green-400' : 
                    kpi.trend === 'down' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '→'}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500">Target: {kpi.target}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4 mb-4">
        <div className="flex items-center mb-2">
          <BsCardChecklist className="text-blue-600 dark:text-blue-400 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Test Scenarios</h2>
        </div>
        <ul className="list-inside list-disc ml-4 text-sm text-gray-600 dark:text-gray-400">
          {testScenarios.map((scenario, idx) => (
            <li key={idx} className="mb-1">
              {scenario.name} ({scenario.load} VUs)
            </li>
          ))}
        </ul>
        <button
          onClick={addScenario}
          className="mt-3 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded"
        >
          New Scenario
        </button>
      </div>

      {/* Test Scenario Templates */}
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <BsCardChecklist className="text-blue-600 dark:text-blue-400 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Test Scenario Templates</h2>
          </div>
          <button className="text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 px-2 py-1 rounded">
            Create New Template
          </button>
        </div>
        <div className="space-y-3">
          {scenarios.map((scenario, idx) => (
            <div key={idx} className="flex justify-between items-center border-b border-gray-200 dark:border-gray-600 pb-2 last:border-0">
              <div>
                <div className="font-medium text-gray-900 dark:text-white">{scenario.name}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">{scenario.description}</div>
              </div>
              <div className="flex space-x-4 text-sm">
                <div className="text-gray-500 dark:text-gray-400">{scenario.vus} VUs</div>
                <div className="text-gray-500 dark:text-gray-400">{scenario.duration}</div>
                <button className="text-blue-600 dark:text-blue-400 hover:underline">Run</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4 mb-4 grid grid-cols-2 gap-4">
        <button
          onClick={configureTest}
          className="flex items-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded p-2 text-gray-700 dark:text-gray-300"
        >
          <BsGearFill className="mr-2" /> Configure
        </button>
        <button
          onClick={rampUp}
          className="flex items-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded p-2 text-gray-700 dark:text-gray-300"
        >
          <BsLightning className="mr-2" /> Ramp Up
        </button>
        <button
          onClick={rampDown}
          className="flex items-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded p-2 text-gray-700 dark:text-gray-300"
        >
          <BsTools className="mr-2" /> Ramp Down
        </button>
        <button
          onClick={runTest}
          disabled={loading}
          className={`flex items-center ${loading ? 'bg-gray-200 dark:bg-gray-600' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded p-2`}
        >
          <BsGraphUp className="mr-2" /> {loading ? 'Running...' : 'Run Test'}
        </button>
      </div>

      <div className="card p-4 mb-4">
        <div className="flex items-center mb-2">
          <BsClipboardData className="text-blue-600 dark:text-blue-400 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Live Metrics & Results</h2>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
          {results.map((res, idx) => (
            <div key={idx} className="bg-gray-100 dark:bg-gray-700 p-2 rounded text-gray-900 dark:text-white">
              {res.scenario} - TPS: {res.tps}, Errors: {res.errors}
            </div>
          ))}
          {results.length === 0 && (
            <div className="text-gray-500 dark:text-gray-400">No test results yet.</div>
          )}
        </div>
      </div>

      <div className="card p-4 mb-4 grid grid-cols-2 gap-4">
        <button className="flex items-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded p-2 text-gray-700 dark:text-gray-300">
          <BsCalendar2Check className="mr-2" /> Scheduling
        </button>
        <button className="flex items-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded p-2 text-gray-700 dark:text-gray-300">
          <BsAlarm className="mr-2" /> Alerts
        </button>
        <button className="flex items-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded p-2 text-gray-700 dark:text-gray-300">
          <BsClockHistory className="mr-2" /> History
        </button>
        <button className="flex items-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded p-2 text-gray-700 dark:text-gray-300">
          <BsArrowRepeat className="mr-2" /> Analysis
        </button>
      </div>
      
      {/* Multi-Modal AI Chat Widget */}
      <MultiModalChat />
    </PageLayout>
  );
}
