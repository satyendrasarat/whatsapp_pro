import React from 'react';

export const StatusBadge = ({ status }) => {
  const s = (status || '').toLowerCase();

  const map = {
    connected: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    open: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    qr_ready: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    connecting: 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse',
    disconnected: 'bg-slate-700/40 text-slate-400 border-slate-600',
    running: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 animate-pulse',
    completed: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    paused: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    cancelled: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    queued: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    sent: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    failed: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    pending: 'bg-slate-700/40 text-slate-300 border-slate-600'
  };

  const style = map[s] || 'bg-slate-800 text-slate-300 border-slate-700';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s === 'connected' || s === 'running' ? 'bg-emerald-400' : s === 'qr_ready' ? 'bg-amber-400' : s === 'failed' ? 'bg-rose-400' : 'bg-slate-400'}`} />
      <span className="capitalize">{status}</span>
    </span>
  );
};

export default StatusBadge;

