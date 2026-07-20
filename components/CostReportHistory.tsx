"use client";

import React, { useState, useEffect } from "react";

interface ReportEntry {
  id: number;
  report_type: string;
  report_date: string;
  period_start: string;
  period_end: string;
  total_cost: number;
  yesterday_cost: number;
  forecast: number;
  top_services: { service: string; cost: number; percentage: number }[];
  region_breakdown: { name: string; cost: number; percentage: number }[];
  anomaly_score: number;
  anomaly_details: string;
  email_sent: boolean;
  email_recipients: string;
  generated_at: string;
  source: string;
}

export default function CostReportHistory() {
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [reportType, setReportType] = useState("daily");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { fetchHistory(); }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/v1/cost-report/history");
      const data = await res.json();
      setReports(data.reports || []);
    } catch { console.error("Failed to fetch history"); }
    setLoading(false);
  };

  const generateReport = async () => {
    setGenerating(true);
    setMessage("Generating...");
    try {
      const res = await fetch("/api/v1/cost-report/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: reportType }),
      });
      const data = await res.json();
      setMessage(`Generated! Total: $${data.total_cost?.toFixed(2)}`);
      fetchHistory();
    } catch { setMessage("Generation failed"); }
    setGenerating(false);
    setTimeout(() => setMessage(null), 5000);
  };

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400 p-4">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#2a2d35] rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Generate Report</h3>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
            <select value={reportType} onChange={e => setReportType(e.target.value)}
              className="px-3 py-2 bg-gray-50 dark:bg-[#1e2128] border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <button onClick={generateReport} disabled={generating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {generating ? "Generating..." : "Generate Now"}
          </button>
        </div>
        {message && (
          <p className={`mt-2 text-sm font-medium ${message.includes("failed") ? "text-red-500" : "text-green-500"}`}>{message}</p>
        )}
      </div>

      <div className="bg-white dark:bg-[#2a2d35] rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Report History</h3>
        {reports.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No reports generated yet. Click "Generate Now" above.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                <div onClick={() => toggleExpand(r.id)}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      r.report_type === "daily" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" :
                      r.report_type === "weekly" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400" :
                      "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                    }`}>{r.report_type}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{r.report_date}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">${r.total_cost.toFixed(2)}</span>
                    {r.anomaly_score >= 40 && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        r.anomaly_score >= 70 ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400" :
                        "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                      }`}>Anomaly: {r.anomaly_score}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.email_sent && <span className="text-green-500 text-xs">Email sent</span>}
                    <span className="text-gray-400 text-xs">{expandedId === r.id ? "▲" : "▼"}</span>
                  </div>
                </div>

                {expandedId === r.id && (
                  <div className="border-t border-gray-200 dark:border-gray-600 p-4 bg-gray-50 dark:bg-[#1e2128] space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-white dark:bg-[#2a2d35] rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Total Cost</div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">${r.total_cost.toFixed(2)}</div>
                      </div>
                      <div className="bg-white dark:bg-[#2a2d35] rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Yesterday</div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">${r.yesterday_cost.toFixed(2)}</div>
                      </div>
                      <div className="bg-white dark:bg-[#2a2d35] rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Forecast</div>
                        <div className="text-lg font-bold text-amber-600 dark:text-amber-400">${r.forecast.toFixed(2)}</div>
                      </div>
                      <div className="bg-white dark:bg-[#2a2d35] rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Anomaly</div>
                        <div className={`text-lg font-bold ${r.anomaly_score >= 70 ? "text-red-600" : r.anomaly_score >= 40 ? "text-yellow-600" : "text-green-600"}`}>{r.anomaly_score}/100</div>
                      </div>
                    </div>

                    {r.top_services.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Top Services</h4>
                        <div className="space-y-1">
                          {r.top_services.slice(0, 5).map((svc, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <span className="text-gray-700 dark:text-gray-300">{svc.service}</span>
                              <span className="text-gray-500 dark:text-gray-400">${svc.cost.toFixed(2)} ({svc.percentage}%)</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {r.anomaly_details && r.anomaly_details !== "No anomalies detected" && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                        <p className="text-xs text-yellow-700 dark:text-yellow-400">{r.anomaly_details}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
