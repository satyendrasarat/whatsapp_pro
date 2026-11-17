import React, { useState, useEffect } from 'react';
import {
  Send,
  Plus,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Trash2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sliders,
  Sparkles,
  Eye,
  RefreshCw,
  ShieldCheck,
  Timer,
  Zap,
  Paperclip,
  FolderOpen,
  X
} from 'lucide-react';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import { pickAttachmentFile } from '../utils/filePicker';

export const Campaigns = ({ liveSessions = [] }) => {
  const [campaigns, setCampaigns] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeProgress, setActiveProgress] = useState({});

  // New Campaign Form Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    list_id: '',
    session_id: 'default',
    template_text: '{Hello|Hi|Hey} {{name}}, we have an exciting update regarding our services! Would you like more details?',
    media_path: '',
    delay_min_seconds: 5,
    delay_max_seconds: 18,
    batch_count: 15,
    cooldown_seconds: 40,
    simulate_typing: true
  });

  // Message Queue Inspector Modal
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignMessages, setCampaignMessages] = useState([]);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  const loadData = async () => {
    try {
      const [cRes, lRes] = await Promise.all([api.getCampaigns(), api.getLists()]);
      if (cRes.campaigns) setCampaigns(cRes.campaigns);
      if (lRes.lists) setLists(lRes.lists);
    } catch (err) {
      console.error('Failed to load campaigns/lists:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = api.subscribe((event) => {
      if (event.type === 'campaign_progress') {
        loadData();
        if (event.campaignId) {
          setActiveProgress((prev) => ({
            ...prev,
            [event.campaignId]: {
              status: event.status,
              recipient: event.recipient,
              cooldownSeconds: event.cooldownSeconds,
              batchCount: event.batchCount,
              typingDurationMs: event.typingDurationMs,
              timestamp: Date.now()
            }
          }));
        }
        // If current campaign is open in inspector, reload its messages
        if (selectedCampaign && selectedCampaign.id === event.campaignId) {
          api.getCampaignDetails(event.campaignId).then((res) => {
            if (res.messages) setCampaignMessages(res.messages);
          });
        }
      }
    });
    return unsubscribe;
  }, [selectedCampaign]);

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!form.name || !form.list_id || !form.template_text) {
      alert('Please fill out Campaign Name, Target List, and Template Text.');
      return;
    }
    try {
      await api.createCampaign(form);
      setIsNewModalOpen(false);
      setForm({
        name: '',
        list_id: '',
        session_id: 'default',
        template_text: '{Hello|Hi|Hey} {{name}}, how can we help you today?',
        media_path: '',
        delay_min_seconds: 5,
        delay_max_seconds: 18,
        batch_count: 15,
        cooldown_seconds: 40,
        simulate_typing: true
      });
      await loadData();
    } catch (err) {
      alert(`Failed to create campaign: ${err.message}`);
    }
  };

  const handleStart = async (id) => {
    try {
      await api.startCampaign(id);
      await loadData();
    } catch (err) {
      alert(`Error starting campaign: ${err.message}`);
    }
  };

  const handlePause = async (id) => {
    try {
      await api.pauseCampaign(id);
      await loadData();
    } catch (err) {
      alert(`Error pausing campaign: ${err.message}`);
    }
  };

  const handleResume = async (id) => {
    try {
      await api.resumeCampaign(id);
      await loadData();
    } catch (err) {
      alert(`Error resuming campaign: ${err.message}`);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this campaign? Unsent messages will be aborted.')) return;
    try {
      await api.cancelCampaign(id);
      await loadData();
    } catch (err) {
      alert(`Error cancelling campaign: ${err.message}`);
    }
  };

  const handleRestart = async (id) => {
    if (!window.confirm('Restart this campaign from the beginning? All messages will be re-queued.')) return;
    try {
      await api.restartCampaign(id);
      await loadData();
    } catch (err) {
      alert(`Error restarting campaign: ${err.message}`);
    }
  };

  const handleRetryFailed = async (id) => {
    try {
      await api.retryFailedCampaign(id);
      await loadData();
    } catch (err) {
      alert(`Error retrying failed messages: ${err.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Permanently delete this campaign and its message history?')) return;
    try {
      await api.deleteCampaign(id);
      await loadData();
    } catch (err) {
      alert(`Error deleting campaign: ${err.message}`);
    }
  };

  const openInspector = async (campaign) => {
    setSelectedCampaign(campaign);
    setIsInspectorOpen(true);
    try {
      const res = await api.getCampaignDetails(campaign.id);
      if (res.messages) setCampaignMessages(res.messages);
    } catch (err) {
      console.error('Failed to load message queue:', err);
    }
  };

  // Helper to insert Spintax or Variable pills into template
  const insertSnippet = (snippet) => {
    setForm((prev) => ({
      ...prev,
      template_text: prev.template_text + ' ' + snippet
    }));
  };

  return (
    <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Send className="w-5 h-5 text-emerald-400" />
            Bulk WhatsApp Campaigns & Dispatch Queue
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Send bulk personalized messages with anti-ban delay jittering, Spintax randomization, and queue control.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Bulk Campaign</span>
          </button>
        </div>
      </div>

      {/* Campaigns List */}
      {campaigns.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto">
          <Send className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-200">No Campaigns Created</h3>
          <p className="text-xs text-slate-400 mt-1 mb-6">
            Create your first broadcast campaign to send personalized WhatsApp messages to an audience list.
          </p>
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition"
          >
            Create First Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((camp) => {
            const total = camp.total_recipients || 0;
            const sent = camp.sent_count || 0;
            const failed = camp.failed_count || 0;
            const processed = sent + failed;
            const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

            const isRunning = camp.status === 'running';
            const isPaused = camp.status === 'paused';
            const isCompleted = camp.status === 'completed';
            const isCancelled = camp.status === 'cancelled';
            const isPending = camp.status === 'pending';

            return (
              <div
                key={camp.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-bold text-slate-100">{camp.name}</h3>
                      <StatusBadge status={camp.status} />
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-semibold">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        Anti-Ban Guard Active
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 mt-2 text-xs text-slate-400">
                      <span>Target: <strong className="text-slate-200">{camp.list_name || 'List #' + camp.list_id}</strong></span>
                      <span className="text-slate-600">•</span>
                      <span>Sender: <span className="font-mono text-emerald-400">{camp.session_id}</span></span>
                      <span className="text-slate-600">•</span>
                      <span>Jitter: <span className="font-mono text-slate-200">{camp.delay_min_seconds || 5}s - {camp.delay_max_seconds || 18}s</span></span>
                      <span className="text-slate-600">•</span>
                      <span>Batch: <span className="font-mono text-cyan-300 font-semibold">{camp.batch_count || 15} msgs</span></span>
                      <span className="text-slate-600">•</span>
                      <span>Cooldown: <span className="font-mono text-amber-300 font-semibold">{camp.cooldown_seconds || 40}s</span></span>
                      <span className="text-slate-600">•</span>
                      <span>
                        {camp.simulate_typing !== 0 ? (
                          <span className="text-emerald-400 font-medium">✍️ Typing Mimic ON</span>
                        ) : (
                          <span className="text-slate-500">Typing OFF</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Campaign Controls */}
                  <div className="flex items-center gap-2">
                    {isPending && (
                      <button
                        onClick={() => handleStart(camp.id)}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-md"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Start</span>
                      </button>
                    )}
                    {isRunning && (
                      <button
                        onClick={() => handlePause(camp.id)}
                        className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-md"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </button>
                    )}
                    {isPaused && (
                      <button
                        onClick={() => handleResume(camp.id)}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-md"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Resume</span>
                      </button>
                    )}
                    {(isRunning || isPaused) && (
                      <button
                        onClick={() => handleCancel(camp.id)}
                        className="flex items-center gap-1.5 bg-slate-800 hover:bg-rose-950 text-rose-400 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-700 transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    )}
                    {(isCompleted || isCancelled) && (
                      <button
                        onClick={() => handleRestart(camp.id)}
                        className="flex items-center gap-1.5 bg-slate-800 hover:bg-emerald-950 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-700 transition"
                        title="Re-run campaign"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Restart</span>
                      </button>
                    )}
                    {(isCompleted || isCancelled || isPaused) && failed > 0 && (
                      <button
                        onClick={() => handleRetryFailed(camp.id)}
                        className="flex items-center gap-1.5 bg-rose-950/70 hover:bg-rose-900 text-rose-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-rose-500/50 transition"
                        title="Retry only failed messages"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Retry Failed ({failed})</span>
                      </button>
                    )}
                    <button
                      onClick={() => openInspector(camp)}
                      className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-700 transition"
                      title="Inspect message queue"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-400" />
                      <span>Queue</span>
                    </button>
                    <button
                      onClick={() => handleDelete(camp.id)}
                      className="p-1.5 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded-xl transition"
                      title="Delete campaign"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Live Anti-Ban Status Banner */}
                {isRunning && activeProgress[camp.id] && (
                  <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-950/90 border border-slate-700/70 text-xs">
                    {activeProgress[camp.id].status === 'cooldown' && (
                      <div className="flex items-center gap-2 text-amber-400 font-semibold animate-pulse">
                        <Timer className="w-4 h-4 text-amber-400" />
                        <span>
                          Batch Cooldown in Progress: Pausing for ~{activeProgress[camp.id].cooldownSeconds || 40}s anti-ban rest before next wave...
                        </span>
                      </div>
                    )}
                    {activeProgress[camp.id].status === 'typing' && (
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                        <span className="inline-block animate-bounce">✍️</span>
                        <span>
                          Simulating human typing to {activeProgress[camp.id].recipient}...
                        </span>
                      </div>
                    )}
                    {activeProgress[camp.id].status === 'rate_limit_backoff' && (
                      <div className="flex items-center gap-2 text-rose-400 font-semibold animate-pulse">
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span>
                          Rate-Limit Protection: Session resting 45s to avoid WhatsApp ban...
                        </span>
                      </div>
                    )}
                    {activeProgress[camp.id].status === 'sent' && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>
                          Dispatched to {activeProgress[camp.id].recipient} (Batch msg #{activeProgress[camp.id].sentInBatch || 1})
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Progress Bar & Stats */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-300 font-medium">
                    <span>
                      Progress: <strong className="text-emerald-400">{percent}%</strong> ({sent} sent, {failed} failed of {total} total)
                    </span>
                    <span className="text-slate-400">
                      Remaining: {Math.max(0, total - processed)}
                    </span>
                  </div>

                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800 flex">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${total > 0 ? (sent / total) * 100 : 0}%` }}
                    />
                    <div
                      className="bg-rose-500 h-full transition-all duration-300"
                      style={{ width: `${total > 0 ? (failed / total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Template Preview */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs font-mono text-slate-300 whitespace-pre-wrap">
                  {camp.template_text}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Campaign Modal */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        title="Create Bulk WhatsApp Campaign"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateCampaign} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Campaign Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. VIP Customer VIP Announcement"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Target Contact List
              </label>
              <select
                required
                value={form.list_id}
                onChange={(e) => setForm({ ...form, list_id: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Select an audience list</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.member_count || 0} contacts)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Account Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Sender WhatsApp Account
            </label>
            <select
              value={form.session_id}
              onChange={(e) => setForm({ ...form, session_id: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="default">Default Primary Account</option>
              {liveSessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.sessionName || s.sessionId} ({s.status})
                </option>
              ))}
            </select>
          </div>

          {/* Anti-Ban Throttle & Batching Controls */}
          <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Anti-Ban Engine & Human Mimicry Controls
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Safe Dispatch Mode
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Min Delay (Sec)
                </label>
                <input
                  type="number"
                  min="2"
                  max="30"
                  value={form.delay_min_seconds}
                  onChange={(e) => setForm({ ...form, delay_min_seconds: parseInt(e.target.value, 10) || 3 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <span className="text-[10px] text-slate-500">Min 3s recommended</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Max Delay (Sec)
                </label>
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={form.delay_max_seconds}
                  onChange={(e) => setForm({ ...form, delay_max_seconds: parseInt(e.target.value, 10) || 15 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <span className="text-[10px] text-slate-500">Random jitter window</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Batch Size (Msgs)
                </label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={form.batch_count}
                  onChange={(e) => setForm({ ...form, batch_count: parseInt(e.target.value, 10) || 10 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono text-cyan-300"
                />
                <span className="text-[10px] text-slate-500">Pause after N msgs</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Cooldown (Sec)
                </label>
                <input
                  type="number"
                  min="10"
                  max="600"
                  value={form.cooldown_seconds}
                  onChange={(e) => setForm({ ...form, cooldown_seconds: parseInt(e.target.value, 10) || 40 })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono text-amber-300"
                />
                <span className="text-[10px] text-slate-500">Rest pause (e.g. 40s)</span>
              </div>
            </div>

            <div className="pt-1 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.simulate_typing}
                  onChange={(e) => setForm({ ...form, simulate_typing: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 bg-slate-900 border-slate-700"
                />
                <span className="text-xs text-slate-200 font-medium flex items-center gap-1.5">
                  <span>Simulate Natural Human Typing Presence</span>
                  <span className="text-[10px] text-emerald-400 font-mono">(Baileys socket composing chatstate)</span>
                </span>
              </label>
            </div>
          </div>

          {/* Template Body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Message Template (Spintax & Variables Supported)
              </label>
              {/* Quick helper pills */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => insertSnippet('{{name}}')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 text-[10px] font-mono font-bold"
                >
                  + {'{{name}}'}
                </button>
                <button
                  type="button"
                  onClick={() => insertSnippet('{{phone}}')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-400 text-[10px] font-mono font-bold"
                >
                  + {'{{phone}}'}
                </button>
                <button
                  type="button"
                  onClick={() => insertSnippet('{Hello|Hi|Greetings}')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-purple-400 text-[10px] font-mono font-bold"
                >
                  + Spintax
                </button>
              </div>
            </div>

            <textarea
              required
              rows={5}
              value={form.template_text}
              onChange={(e) => setForm({ ...form, template_text: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
            />
          </div>

          {/* Optional Media Attachment */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-emerald-400" />
                <span>Media / Document Attachment (Optional)</span>
              </label>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const picked = await pickAttachmentFile({
                      title: 'Select Attachment for Campaign (All formats supported)'
                    });
                    if (picked?.filePath) {
                      setForm({ ...form, media_path: picked.filePath.replace(/^["']+|["']+$/g, '') });
                    }
                  } catch (err) {
                    console.error('File pick failed:', err);
                  }
                }}
                className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 px-2.5 py-1 rounded-lg transition active:scale-95 cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Browse File...</span>
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Click Browse File or paste path (PNG, JPG, JSON, PDF, CSV, XLSX, etc.)"
                value={form.media_path}
                onChange={(e) => setForm({ ...form, media_path: e.target.value.replace(/^["']+|["']+$/g, '') })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3 pr-8 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
              />
              {form.media_path && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, media_path: '' })}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-400 transition"
                  title="Remove attachment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {form.media_path && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900/90 border border-emerald-500/30 rounded-lg text-[11px] text-slate-300">
                <span className="text-emerald-400 font-medium">Attached:</span>
                <span className="truncate flex-1 font-mono text-slate-200">
                  {form.media_path.split(/[/\\]/).pop()}
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-500">
                  {form.media_path.split('.').pop()}
                </span>
              </div>
            )}
            <p className="text-[10px] text-slate-400">
              Supports Images (.png, .jpg), Documents (.json, .pdf, .csv, .xlsx, .docx, .txt), Videos (.mp4), and Audio (.mp3).
            </p>
          </div>

          <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Active Anti-Ban Protection Suite:
            </p>
            <ul className="text-[11px] text-emerald-400/90 list-disc list-inside space-y-0.5">
              <li><strong>Randomized Jitter:</strong> {form.delay_min_seconds}s to {form.delay_max_seconds}s interval + micro-jitter between individual messages.</li>
              <li><strong>Batching & Resting Cooldown:</strong> Pauses for ~{form.cooldown_seconds}s after every {form.batch_count} messages to mimic human resting rhythms.</li>
              <li><strong>Typing Presence:</strong> {form.simulate_typing ? 'Sends Baileys socket composing chatstate for realistic duration before sending.' : 'Typing simulation disabled.'}</li>
              <li><strong>Hash Randomization:</strong> Invisible zero-width unicode chars appended to ensure unique cryptographic byte fingerprints.</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsNewModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-5 py-2 rounded-xl transition shadow-lg shadow-emerald-600/30"
            >
              Create Campaign & Queue Messages
            </button>
          </div>
        </form>
      </Modal>

      {/* Queue Inspector Modal */}
      <Modal
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        title={`Message Queue Inspector: ${selectedCampaign?.name || ''}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center text-xs text-slate-300">
            <span>Total Messages in Queue: <strong>{campaignMessages.length}</strong></span>
            <div className="flex gap-2">
              <span className="text-emerald-400 font-semibold">
                Sent: {campaignMessages.filter((m) => m.status === 'sent').length}
              </span>
              <span>•</span>
              <span className="text-rose-400 font-semibold">
                Failed: {campaignMessages.filter((m) => m.status === 'failed').length}
              </span>
              <span>•</span>
              <span className="text-sky-400 font-semibold">
                Queued: {campaignMessages.filter((m) => m.status === 'queued').length}
              </span>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 sticky top-0 text-slate-400 font-bold uppercase">
                <tr>
                  <th className="p-3">Status</th>
                  <th className="p-3">Recipient</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Message Preview</th>
                  <th className="p-3">Sent At / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {campaignMessages.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/40">
                    <td className="p-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="p-3 font-mono text-emerald-400 font-semibold">
                      +{m.recipient_phone}
                    </td>
                    <td className="p-3 text-slate-300">{m.recipient_name || '-'}</td>
                    <td className="p-3 text-slate-400 max-w-xs truncate">{m.message_text}</td>
                    <td className="p-3 text-slate-400">
                      {m.status === 'sent'
                        ? new Date(m.sent_at).toLocaleTimeString()
                        : m.error_message ? <span className="text-rose-400 font-mono text-[10px]">{m.error_message}</span> : 'Pending'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Campaigns;

