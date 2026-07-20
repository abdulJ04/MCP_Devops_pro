"use client";

import React, { useState, useEffect } from "react";

interface ReportConfig {
  is_enabled: boolean;
  report_type: string;
  schedule_hour: number;
  schedule_minute: number;
  schedule_day_of_week: number;
  schedule_day_of_month: number;
  recipients: string;
  include_anomaly_detection: boolean;
  include_service_breakdown: boolean;
  include_region_breakdown: boolean;
  include_yesterday_comparison: boolean;
  smtp_host: string;
  smtp_user: string;
  updated_at: string | null;
}

export default function CostReportConfig() {
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  useEffect(() => { fetchConfig(); }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/v1/cost-report/config");
      const data = await res.json();
      setConfig(data);
    } catch { console.error("Failed to fetch config"); }
    setLoading(false);
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await fetch("/api/v1/cost-report/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setTestResult("Config saved!");
      setTimeout(() => setTestResult(null), 3000);
    } catch { setTestResult("Save failed"); }
    setSaving(false);
  };

  const generateTest = async () => {
    setTestResult("Generating...");
    try {
      const res = await fetch("/api/v1/cost-report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: config?.report_type || "daily" }),
      });
      const data = await res.json();
      setTestResult(`Report generated! Total: $${data.total_cost?.toFixed(2)}`);
    } catch { setTestResult("Generation failed"); }
    setTimeout(() => setTestResult(null), 5000);
  };

  const previewReport = async () => {
    try {
      const res = await fetch("/api/v1/cost-report/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: config?.report_type || "daily" }),
      });
      const data = await res.json();
      setPreviewHtml(data.html_preview);
    } catch { console.error("Preview failed"); }
  };

  const sendTestEmail = async () => {
    setTestResult("Sending email...");
    try {
      const res = await fetch("/api/v1/cost-report/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: config?.report_type || "daily" }),
      });
      if (res.ok) setTestResult("Email sent!");
      else setTestResult("Email failed — check SMTP config");
    } catch { setTestResult("Email failed"); }
    setTimeout(() => setTestResult(null), 5000);
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400 p-4">Loading...</div>;
  if (!config) return <div className="text-red-500 p-4">Failed to load config</div>;

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white dark:bg-[#2a2d35] rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Report Settings</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600 dark:text-gray-400">{config.is_enabled ? "Enabled" : "Disabled"}</span>
            <div onClick={() => setConfig({ ...config, is_enabled: !config.is_enabled })}
              className={`w-11 h-6 rounded-full transition-colors relative ${config.is_enabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}>
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${config.is_enabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
          </label>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Report Type</label>
            <select value={config.report_type} onChange={e => setConfig({ ...config, report_type: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e2128] border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white">
              <option value="daily">Daily Report</option>
              <option value="weekly">Weekly Report</option>
              <option value="monthly">Monthly Report</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Schedule Hour (IST)</label>
              <select value={config.schedule_hour} onChange={e => setConfig({ ...config, schedule_hour: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e2128] border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white">
                {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Minute</label>
              <select value={config.schedule_minute} onChange={e => setConfig({ ...config, schedule_minute: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e2128] border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white">
                {[0, 15, 30, 45].map(m => <option key={m} value={m}>:{String(m).padStart(2, "0")}</option>)}
              </select>
            </div>
          </div>

          {config.report_type === "weekly" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Day of Week</label>
              <select value={config.schedule_day_of_week} onChange={e => setConfig({ ...config, schedule_day_of_week: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e2128] border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white">
                {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            </div>
          )}

          {config.report_type === "monthly" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Day of Month</label>
              <select value={config.schedule_day_of_month} onChange={e => setConfig({ ...config, schedule_day_of_month: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e2128] border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white">
                {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Recipients (comma-separated)</label>
            <input type="text" value={config.recipients} onChange={e => setConfig({ ...config, recipients: e.target.value })}
              placeholder="team@company.com, manager@company.com"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e2128] border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400" />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Report Sections</label>
            {[
              { key: "include_yesterday_comparison", label: "Yesterday Comparison" },
              { key: "include_service_breakdown", label: "Service Breakdown" },
              { key: "include_region_breakdown", label: "Region Breakdown" },
              { key: "include_anomaly_detection", label: "Anomaly Detection" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(config as any)[key]} onChange={e => setConfig({ ...config, [key]: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
              </label>
            ))}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-xs text-blue-700 dark:text-blue-400">
              SMTP settings are shared with Cost Alerts. Configure SMTP in the Cost Alerts tab first.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-5">
          <button onClick={saveConfig} disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? "Saving..." : "Save Config"}
          </button>
          <button onClick={generateTest}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors">
            Generate Now
          </button>
          <button onClick={sendTestEmail}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors">
            Send Test Email
          </button>
          <button onClick={previewReport}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors">
            Preview Report
          </button>
        </div>

        {testResult && (
          <p className={`mt-3 text-sm font-medium ${testResult.includes("failed") || testResult.includes("Failed") ? "text-red-500" : "text-green-500"}`}>
            {testResult}
          </p>
        )}
      </div>

      {previewHtml && (
        <div className="bg-white dark:bg-[#2a2d35] rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Report Preview</h3>
            <button onClick={() => setPreviewHtml(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm">Close</button>
          </div>
          <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      )}
    </div>
  );
}
