"use client";

import React, { useState, useEffect } from "react";

interface AlertConfig {
  daily_limit: number;
  monthly_limit: number;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  is_active: boolean;
}

interface CostAlertConfigProps {
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    useLocalstack?: boolean;
  } | null;
  onConfigSaved?: () => void;
}

const DAILY_LIMITS = [50, 70, 100, 200, 500, 1000];
const MONTHLY_LIMITS = [500, 1000, 2000, 5000, 10000];

export default function CostAlertConfig({ credentials, onConfigSaved }: CostAlertConfigProps) {
  const [config, setConfig] = useState<AlertConfig>({
    daily_limit: 70,
    monthly_limit: 2000,
    email: "",
    smtp_host: "",
    smtp_port: 465,
    smtp_user: "",
    smtp_password: "",
    is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [showEmailConfig, setShowEmailConfig] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/cost-alert/config");
      const data = await res.json();
      if (data.smtp_password === "***") data.smtp_password = "";
      setConfig(data);
    } catch (err) {
      console.error("Failed to load alert config:", err);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/v1/cost-alert/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("✅ Configuration saved!");
        onConfigSaved?.();
      } else {
        setMessage("❌ Failed to save");
      }
    } catch (err) {
      setMessage("❌ Error saving config");
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const testEmail = async () => {
    setTesting(true);
    setMessage("");
    try {
      const res = await fetch("/api/v1/cost-alert/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setMessage("✅ Test email sent! Check your inbox.");
      } else {
        setMessage(`❌ ${data.detail || data.error || "Failed to send test email"}`);
      }
    } catch (err) {
      setMessage("❌ Error sending test email");
    } finally {
      setTesting(false);
      setTimeout(() => setMessage(""), 5000);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#1e2128] rounded-xl p-6 border border-[#2a2d48]">
        <div className="animate-pulse text-gray-400">Loading alert configuration...</div>
      </div>
    );
  }

  return (
    <div className="bg-[#1e2128] rounded-xl p-6 border border-[#2a2d48]">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-2xl">🔔</span> Cost Alert Configuration
        </h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.is_active}
            onChange={(e) => setConfig({ ...config, is_active: e.target.checked })}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm text-gray-300">Enabled</span>
        </label>
      </div>

      {/* Threshold Selection */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Daily Limit ($)</label>
          <select
            value={config.daily_limit}
            onChange={(e) => setConfig({ ...config, daily_limit: Number(e.target.value) })}
            className="w-full bg-[#2a2d48] text-white rounded-lg px-4 py-3 border border-[#3a3d58] focus:border-[#0078D4] focus:outline-none"
          >
            {DAILY_LIMITS.map((v) => (
              <option key={v} value={v}>${v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-2">Monthly Limit ($)</label>
          <select
            value={config.monthly_limit}
            onChange={(e) => setConfig({ ...config, monthly_limit: Number(e.target.value) })}
            className="w-full bg-[#2a2d48] text-white rounded-lg px-4 py-3 border border-[#3a3d58] focus:border-[#0078D4] focus:outline-none"
          >
            {MONTHLY_LIMITS.map((v) => (
              <option key={v} value={v}>${v.toLocaleString()}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Email Configuration Toggle */}
      <button
        onClick={() => setShowEmailConfig(!showEmailConfig)}
        className="w-full text-left text-sm text-[#0078D4] hover:text-[#3396FF] mb-4 flex items-center gap-1"
      >
        <span>{showEmailConfig ? "▼" : "▶"}</span>
        {config.email ? "Email configured" : "Configure email alerts"}
      </button>

      {/* Email Configuration */}
      {showEmailConfig && (
        <div className="bg-[#2a2d48] rounded-lg p-4 mb-4 space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Alert Email</label>
            <input
              type="email"
              value={config.email}
              onChange={(e) => setConfig({ ...config, email: e.target.value })}
              placeholder="you@yourdomain.com"
              className="w-full bg-[#1e2128] text-white rounded-lg px-4 py-2 border border-[#3a3d58] focus:border-[#0078D4] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">SMTP Host</label>
              <input
                type="text"
                value={config.smtp_host}
                onChange={(e) => setConfig({ ...config, smtp_host: e.target.value })}
                placeholder="mail.yourdomain.com"
                className="w-full bg-[#1e2128] text-white rounded-lg px-4 py-2 border border-[#3a3d58] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">SMTP Port</label>
              <input
                type="number"
                value={config.smtp_port}
                onChange={(e) => setConfig({ ...config, smtp_port: Number(e.target.value) })}
                className="w-full bg-[#1e2128] text-white rounded-lg px-4 py-2 border border-[#3a3d58] focus:border-[#0078D4] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">SMTP Username</label>
            <input
              type="text"
              value={config.smtp_user}
              onChange={(e) => setConfig({ ...config, smtp_user: e.target.value })}
              placeholder="alerts@yourdomain.com"
              className="w-full bg-[#1e2128] text-white rounded-lg px-4 py-2 border border-[#3a3d58] focus:border-[#0078D4] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">SMTP Password</label>
            <input
              type="password"
              value={config.smtp_password}
              onChange={(e) => setConfig({ ...config, smtp_password: e.target.value })}
              placeholder="••••••••"
              className="w-full bg-[#1e2128] text-white rounded-lg px-4 py-2 border border-[#3a3d58] focus:border-[#0078D4] focus:outline-none"
            />
          </div>
          <button
            onClick={testEmail}
            disabled={testing || !config.email || !config.smtp_host}
            className="w-full bg-[#2E8B57] hover:bg-[#3aa06a] text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? "Sending test..." : "📧 Send Test Email"}
          </button>
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={saveConfig}
        disabled={saving}
        className="w-full bg-[#0078D4] hover:bg-[#005A9E] text-white rounded-lg px-4 py-3 font-medium disabled:opacity-50"
      >
        {saving ? "Saving..." : "💾 Save Configuration"}
      </button>

      {/* Status Message */}
      {message && (
        <div className={`mt-3 text-center text-sm ${message.startsWith("✅") ? "text-green-400" : "text-red-400"}`}>
          {message}
        </div>
      )}

      {/* Info */}
      <div className="mt-4 text-xs text-gray-500 text-center">
        Backend monitors cost every 1 hour and sends email when threshold exceeded.
        <br />Works even when dashboard is closed.
      </div>
    </div>
  );
}
