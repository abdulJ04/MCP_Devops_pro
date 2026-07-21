"use client";

import React, { useState, useEffect } from "react";

interface AlertStatus {
  active: boolean;
  daily_alert: boolean;
  monthly_alert: boolean;
  today_cost: number;
  month_cost: number;
  daily_limit: number;
  monthly_limit: number;
  daily_over_by: number;
  monthly_over_by: number;
}

interface CostAlertBannerProps {
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    useLocalstack?: boolean;
  } | null;
}

export default function CostAlertBanner({ credentials }: CostAlertBannerProps) {
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const [dismissedDaily, setDismissedDaily] = useState(false);
  const [dismissedMonthly, setDismissedMonthly] = useState(false);

  useEffect(() => {
    checkAlertStatus();
    const interval = setInterval(checkAlertStatus, 300000);
    return () => clearInterval(interval);
  }, [status?.daily_alert, status?.monthly_alert]);

  const checkAlertStatus = async () => {
    try {
      const res = await fetch("/api/v1/cost-alert/status");
      const data = await res.json();
      setStatus(data);
      if (!data.daily_alert) setDismissedDaily(false);
      if (!data.monthly_alert) setDismissedMonthly(false);
    } catch (err) {
      console.error("Failed to check alert status:", err);
    }
  };

  if (!status || !status.active) return null;

  const dailyPct = status.daily_limit > 0 ? Math.round((status.today_cost / status.daily_limit) * 100) : 0;
  const monthlyPct = status.monthly_limit > 0 ? Math.round((status.month_cost / status.monthly_limit) * 100) : 0;

  const hasDaily = status.daily_alert && !dismissedDaily;
  const hasMonthly = status.monthly_alert && !dismissedMonthly;

  if (!hasDaily && !hasMonthly) return null;

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {hasDaily && (
        <div className="flex-1 min-w-[250px] bg-red-900/40 border border-red-500/50 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="animate-pulse text-xl">🚨</span>
            <div>
              <span className="text-red-300 font-bold text-sm">DAILY COST LIMIT EXCEEDED</span>
              <div className="text-white font-bold text-base">
                ${status.today_cost.toFixed(2)} / ${status.daily_limit.toFixed(2)}
              </div>
              <span className="text-red-400 text-xs">Over by ${status.daily_over_by.toFixed(2)} (+{dailyPct - 100}%)</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-24 bg-red-900/50 rounded-full h-2">
              <div className="bg-red-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(dailyPct, 100)}%` }} />
            </div>
            <button onClick={() => setDismissedDaily(true)} className="text-red-400 hover:text-white text-sm" title="Dismiss">✕</button>
          </div>
        </div>
      )}

      {hasMonthly && (
        <div className="flex-1 min-w-[250px] bg-orange-900/40 border border-orange-500/50 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <span className="text-orange-300 font-bold text-sm">MONTHLY COST LIMIT EXCEEDED</span>
              <div className="text-white font-bold text-base">
                ${status.month_cost.toFixed(2)} / ${status.monthly_limit.toFixed(2)}
              </div>
              <span className="text-orange-400 text-xs">Over by ${status.monthly_over_by.toFixed(2)} (+{monthlyPct - 100}%)</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-24 bg-orange-900/50 rounded-full h-2">
              <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(monthlyPct, 100)}%` }} />
            </div>
            <button onClick={() => setDismissedMonthly(true)} className="text-orange-400 hover:text-white text-sm" title="Dismiss">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
