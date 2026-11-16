import React, { useEffect, useState } from 'react';
import {
  Users,
  Send,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  Workflow,
  Sparkles,
  ArrowUpRight,
  Clock,
  Radio
} from 'lucide-react';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';

export const Dashboard = ({ setActiveTab, liveSessions = [] }) => {
  const [stats, setStats] = useState({
    totalContacts: 0,
    totalCampaigns: 0,
    totalSent: 0,
    totalFailed: 0,
    totalQueued: 0,
    totalFlows: 0,
    totalProducts: 0,
    connectedSessions: 0
  });
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const data = await api.getAnalytics();
      if (data.stats) setStats(data.stats);

      const logsData = await api.getChatLogs(15);
      if (logsData.logs) setRecentLogs(logsData.logs);
    } catch (err) {
      console.error('Failed to load dashboard analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = api.subscribe((event) => {
      if (['campaign_progress', 'incoming_message', 'outgoing_message', 'connection_open'].includes(event.type)) {
        loadData();
      }
    });
    return unsubscribe;
  }, []);

  const statCards = [
    {
      title: 'Total Contacts',
      value: stats.totalContacts,
      icon: Users,
      color: 'from-blue-600 to-cyan-500',
      action: () => setActiveTab('contacts'),
      actionLabel: 'Manage Contacts'
    },
    {
      title: 'Bulk Campaigns',
      value: stats.totalCampaigns,
      icon: Send,
      color: 'from-emerald-600 to-teal-500',
      action: () => setActiveTab('campaigns'),
      actionLabel: 'View Campaigns'
    },
    {
      title: 'Messages Delivered',
      value: stats.totalSent,
      subvalue: `${stats.totalFailed} failed • ${stats.totalQueued} queued`,
      icon: CheckCircle2,
      color: 'from-indigo-600 to-purple-500',
      action: () => setActiveTab('campaigns'),
      actionLabel: 'Queue Monitor'
    },
    {
      title: 'Active Sessions',
      value: liveSessions.filter((s) => s.status === 'connected').length || stats.connectedSessions,
      subvalue: 'Baileys Multi-Device',
      icon: QrCode,
      color: 'from-amber-600 to-orange-500',
      action: () => setActiveTab('connections'),
      actionLabel: 'Scan QR / Connect'
    }
  ];

  return (
    <div className="p-8 space-y-8 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 border border-emerald-500/30 p-8 shadow-2xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Active Anti-Ban Protection & Multi-Process Core
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            WhatsApp Automation & CRM Engine
          </h2>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">
            Send bulk personalized campaigns with Spintax jitter delays, automate conversations with the visual interactive node builder, extract group members, and empower customer queries with local AI RAG.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => setActiveTab('connections')}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition"
            >
              <QrCode className="w-4 h-4" />
              <span>Link WhatsApp Session</span>
            </button>
            <button
              onClick={() => setActiveTab('campaigns')}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-4 py-2.5 rounded-xl border border-slate-700 transition"
            >
              <Send className="w-4 h-4" />
              <span>Launch Campaign</span>
            </button>
            <button
              onClick={() => setActiveTab('flows')}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-4 py-2.5 rounded-xl border border-slate-700 transition"
            >
              <Workflow className="w-4 h-4" />
              <span>Open Flow Canvas</span>
            </button>
          </div>
        </div>

        {/* Ambient background decoration */}
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none" />
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl hover:border-slate-700 transition flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-400">{card.title}</p>
                  <p className="text-3xl font-black text-slate-100 mt-2">{card.value}</p>
                  {card.subvalue && (
                    <p className="text-[11px] text-slate-400 mt-1">{card.subvalue}</p>
                  )}
                </div>
                <div className={`p-3 rounded-xl bg-gradient-to-tr ${card.color} text-white shadow-md`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>

              <button
                onClick={card.action}
                className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-emerald-400 hover:text-emerald-300 group"
              >
                <span>{card.actionLabel}</span>
                <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Two Column Layout: Quick Actions & Live Activity Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Launchpad & Capabilities */}
        <div className="space-y-4 lg:col-span-1">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4">
              Automation Modules
            </h3>
            <div className="space-y-3">
              <button
                onClick={() => setActiveTab('groups')}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-100">WhatsApp Group Grabber</p>
                    <p className="text-[11px] text-slate-400">Extract members & resolve LIDs</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-500" />
              </button>

              <button
                onClick={() => setActiveTab('flows')}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
                    <Workflow className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-100">Visual Flow Builder</p>
                    <p className="text-[11px] text-slate-400">Interactive decision branches</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-500" />
              </button>

              <button
                onClick={() => setActiveTab('ai')}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 text-purple-400 rounded-lg">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-100">AI Knowledge & Catalog</p>
                    <p className="text-[11px] text-slate-400">Ollama & Gemini smart responses</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Anti-Ban Safety Parameters Widget */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">
              Anti-Ban Protection
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Jitter randomized interval ensures traffic patterns mimic natural human typing.
            </p>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Default Jitter Delay:</span>
                <span className="font-mono text-emerald-400 font-bold">8s - 20s / message</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Spintax Syntax:</span>
                <span className="font-mono text-cyan-400">{'{Hello|Hi|Greetings}'}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Multi-Device Protocol:</span>
                <span className="text-slate-400">Baileys WebSocket TLS</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Message Activity Feed */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                Live WhatsApp Message Stream
              </h3>
            </div>
            <span className="text-xs text-slate-400">Showing last {recentLogs.length} events</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 max-h-96 pr-1">
            {recentLogs.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No recent WhatsApp messages yet. Connect a session or dispatch a message to view live traffic!
              </div>
            ) : (
              recentLogs.map((log) => {
                const isIncoming = log.direction === 'incoming';
                return (
                  <div
                    key={log.id}
                    className={`p-3 rounded-xl border text-xs transition ${
                      isIncoming
                        ? 'bg-slate-950/90 border-slate-800 text-slate-200'
                        : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold px-1.5 py-0.5 rounded text-[10px] uppercase ${
                            isIncoming ? 'bg-blue-900/60 text-blue-300' : 'bg-emerald-900/60 text-emerald-300'
                          }`}
                        >
                          {log.direction}
                        </span>
                        <span className="font-mono text-slate-400">
                          {isIncoming ? log.from_jid : log.to_jid}
                        </span>
                      </div>
                      <span className="text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap font-sans mt-1 text-slate-300 leading-relaxed">
                      {log.message_text}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

