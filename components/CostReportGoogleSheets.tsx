"use client";

import React, { useState, useEffect } from "react";

interface ReportConfig {
  google_sheets_enabled: boolean;
  apps_script_url: string;
}

export default function CostReportGoogleSheets() {
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gsStatus, setGsStatus] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => { fetchConfig(); }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/v1/cost-report/config");
      const data = await res.json();
      setConfig({ google_sheets_enabled: data.google_sheets_enabled, apps_script_url: data.apps_script_url || "" });
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
      setGsStatus("Config saved!");
      setTimeout(() => setGsStatus(null), 3000);
    } catch { setGsStatus("Save failed"); }
    setSaving(false);
  };

  const testGoogleSheets = async () => {
    if (!config?.apps_script_url) { setGsStatus("Enter Apps Script URL first"); return; }
    setGsStatus("Testing connection...");
    try {
      const res = await fetch("/api/v1/cost-report/google-sheets/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apps_script_url: config.apps_script_url }),
      });
      const data = await res.json();
      if (data.success) setGsStatus("Connected to Google Sheet!");
      else setGsStatus(`Failed: ${data.error || data.detail || "Unknown error"}`);
    } catch { setGsStatus("Connection failed — check URL and Sheet sharing"); }
    setTimeout(() => setGsStatus(null), 8000);
  };

  const pushToSheet = async () => {
    if (!config?.apps_script_url) { setGsStatus("Enter Apps Script URL first"); return; }
    setGsStatus("Pushing data...");
    try {
      const body: any = { apps_script_url: config.apps_script_url, report_type: "daily" };
      if (fromDate) body.from_date = fromDate;
      if (toDate) body.to_date = toDate;
      const res = await fetch("/api/v1/cost-report/google-sheets/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) setGsStatus(`Pushed ${data.rows_pushed || 0} rows to Google Sheet!`);
      else setGsStatus(`Push failed: ${data.detail || "Unknown"}`);
    } catch { setGsStatus("Push failed — check URL"); }
    setTimeout(() => setGsStatus(null), 5000);
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400 p-4">Loading...</div>;
  if (!config) return <div className="text-red-500 p-4">Failed to load config</div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white dark:bg-[#2a2d35] rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Google Sheets Auto-Entry</h3>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600 dark:text-gray-400">{config.google_sheets_enabled ? "Enabled" : "Disabled"}</span>
            <div onClick={() => setConfig({ ...config, google_sheets_enabled: !config.google_sheets_enabled })}
              className={`w-11 h-6 rounded-full transition-colors relative ${config.google_sheets_enabled ? "bg-green-600" : "bg-gray-300 dark:bg-gray-600"}`}>
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${config.google_sheets_enabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
          </label>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Apps Script Web App URL</label>
            <input type="text" value={config.apps_script_url} onChange={e => setConfig({ ...config, apps_script_url: e.target.value })}
              placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1e2128] border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400" />
          </div>

          <div className="bg-gray-50 dark:bg-[#1e2128] border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date Range Filter (Optional)</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">From</label>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                  min="2020-01-01" max="2030-12-31"
                  className="w-full px-3 py-1.5 bg-white dark:bg-[#2a2d35] border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white font-mono" />
              </div>
              <span className="text-gray-400 mt-4">to</span>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">To</label>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                  min="2020-01-01" max="2030-12-31"
                  className="w-full px-3 py-1.5 bg-white dark:bg-[#2a2d35] border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white font-mono" />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty to push all data. Filtered push replaces sheet content with selected range only.</p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">Setup Steps:</p>
            <ol className="text-xs text-blue-600 dark:text-blue-500 space-y-1 list-decimal list-inside">
              <li>Create Google Sheet, share as &quot;Anyone with link&quot; (Editor)</li>
              <li>Extensions → Apps Script → paste doPost code</li>
              <li>Deploy → Web app → Execute as &quot;Me&quot;, Access &quot;Anyone&quot;</li>
              <li>Run doPost once in editor → Allow permissions</li>
              <li>Copy Web App URL and paste above</li>
            </ol>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={testGoogleSheets}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors">
              Test Connection
            </button>
            <button onClick={pushToSheet}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors">
              {fromDate || toDate ? "Push Filtered Data" : "Push All Data"}
            </button>
            <button onClick={saveConfig} disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {saving ? "Saving..." : "Save Config"}
            </button>
          </div>

          {gsStatus && (
            <p className={`text-sm font-medium ${gsStatus.includes("Failed") || gsStatus.includes("failed") ? "text-red-500" : "text-green-500"}`}>{gsStatus}</p>
          )}
        </div>
      </div>
    </div>
  );
}
