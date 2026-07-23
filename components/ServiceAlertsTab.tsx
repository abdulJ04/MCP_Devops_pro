"use client";

import React, { useState, useEffect, useCallback } from "react";

interface ServiceAlertConfig {
  id: number;
  service: string;
  enabled: boolean;
  metric: string;
  threshold: number;
  operator: string;
  label: string;
  icon: string;
}

interface AlertEntry {
  service: string;
  label: string;
  icon: string;
  severity: string;
  message: string;
  timestamp: string;
}

interface ServiceAlertsStatus {
  alerts: AlertEntry[];
  services_under_alert: number;
  total_enabled: number;
}

export default function ServiceAlertsTab() {
  const [configs, setConfigs] = useState<ServiceAlertConfig[]>([]);
  const [status, setStatus] = useState<ServiceAlertsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/service-alerts/config");
      const data = await res.json();
      if (data.success) setConfigs(data.configs);
    } catch { /* ignore */ }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/service-alerts/status");
      const data = await res.json();
      if (data.success) setStatus(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConfigs(), fetchStatus()]).finally(() => setLoading(false));
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchConfigs, fetchStatus]);

  const toggleAlert = async (service: string, enabled: boolean) => {
    setConfigs(prev => prev.map(c => c.service === service ? { ...c, enabled } : c));
    setSaving(true);
    try {
      const res = await fetch("/api/v1/service-alerts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs: [{ service, enabled }] }),
      });
      const data = await res.json();
      if (!data.success) {
        setConfigs(prev => prev.map(c => c.service === service ? { ...c, enabled: !enabled } : c));
      }
    } catch {
      setConfigs(prev => prev.map(c => c.service === service ? { ...c, enabled: !enabled } : c));
    }
    setSaving(false);
  };

  const updateThreshold = async (service: string, threshold: number) => {
    setConfigs(prev => prev.map(c => c.service === service ? { ...c, threshold } : c));
    try {
      await fetch("/api/v1/service-alerts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs: [{ service, threshold }] }),
      });
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  const activeAlerts = status?.alerts || [];
  const hasActiveAlerts = activeAlerts.length > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Service Alerts</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Enable alerts for each service. When a threshold is crossed, you will be notified.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${status && status.total_enabled > 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
            {status?.total_enabled || 0} Enabled
          </span>
          {hasActiveAlerts && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {status?.services_under_alert || 0} Active
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {hasActiveAlerts && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Active Alerts</h3>
          {activeAlerts.slice(0, 5).map((alert, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
              alert.severity === "CRITICAL"
                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
            }`}>
              <span className="text-lg mt-0.5">{alert.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-800 dark:text-gray-200">{alert.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    alert.severity === "CRITICAL"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                  }`}>{alert.severity}</span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{alert.message}</p>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
          {activeAlerts.length > 5 && (
            <p className="text-sm text-gray-500 text-center">+{activeAlerts.length - 5} more alerts</p>
          )}
        </div>
      )}

      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">Alert Configuration</h3>
        <div className="bg-white dark:bg-[#2a2d38] rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#22252e]">
                <th className="text-left p-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10" />
                <th className="text-left p-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Service</th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Metric</th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Condition</th>
                <th className="text-left p-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Threshold</th>
                <th className="text-center p-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Status</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((cfg) => {
                const active = activeAlerts.find(a => a.service === cfg.service);
                const isFiring = !!active;
                const toggleId = `toggle-${cfg.service}`;

                return (
                  <tr key={cfg.service} className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-[#323540] transition-colors ${isFiring ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}>
                    <td className="p-3 text-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          id={toggleId}
                          checked={cfg.enabled}
                          onChange={(e) => toggleAlert(cfg.service, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-500 peer-checked:bg-orange-500"></div>
                      </label>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{cfg.icon}</span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cfg.label}</span>
                      </div>
                    </td>
                    <td className="p-3 text-sm text-gray-600 dark:text-gray-400">{cfg.metric.replace(/_/g, " ")}</td>
                    <td className="p-3 text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-mono">{cfg.operator === ">" ? ">" : cfg.operator === "<" ? "<" : "="}</span>
                    </td>
                    <td className="p-3">
                      {cfg.operator === "=" ? (
                        <span className="text-sm text-gray-400 italic">Event-based</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={cfg.threshold}
                            onChange={(e) => updateThreshold(cfg.service, parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#1e2128] text-gray-700 dark:text-gray-300 text-center"
                            step="any"
                            min="0"
                          />
                          <span className="text-xs text-gray-400">{cfg.service.includes("cpu") || cfg.service.includes("memory") || cfg.service.includes("error") ? "%" : cfg.service.includes("cost") ? "$" : ""}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {isFiring ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                          Alerting
                        </span>
                      ) : cfg.enabled ? (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">OK</span>
                      ) : (
                        <span className="text-xs text-gray-400">Disabled</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {saving && (
        <div className="fixed bottom-6 right-6 bg-orange-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          Saving...
        </div>
      )}
    </div>
  );
}
