import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  ShieldCheck,
  Database,
  Save,
  Info,
  Server,
  Bot,
  Sparkles,
  GitBranch,
  PowerOff,
  Mic,
  Volume2,
  Play,
  Bell,
  CheckCircle2,
  Terminal,
  RefreshCw,
  Copy,
  FileText,
  AlertTriangle,
  RotateCcw,
  Trash2,
  AlertOctagon
} from 'lucide-react';
import { api } from '../services/api';

export const Settings = () => {
  const [settings, setSettings] = useState({
    default_min_delay: '8',
    default_max_delay: '20',
    ai_enabled_globally: 'true',
    auto_responder_mode: 'hybrid',
    ai_provider: 'local_ollama',
    ollama_endpoint: 'http://localhost:11434',
    ollama_model: 'llama3:latest'
  });
  const [loading, setLoading] = useState(true);
  const [savedMessage, setSavedMessage] = useState(false);
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [isTestingAlert, setIsTestingAlert] = useState(false);
  const [alertSuccessMessage, setAlertSuccessMessage] = useState(false);
  const [engineLogs, setEngineLogs] = useState([]);
  const [logFilePath, setLogFilePath] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isCopiedLogs, setIsCopiedLogs] = useState(false);

  // Factory Reset Dialog States
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState('');

  const handleFactoryReset = async () => {
    if (resetConfirmInput.trim().toUpperCase() !== 'RESET') {
      setResetError('Please type RESET to confirm.');
      return;
    }
    setIsResetting(true);
    setResetError('');
    try {
      await api.factoryReset();
      setResetSuccess(true);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setResetError(err.message || 'Factory reset failed. Please check the logs.');
      setIsResetting(false);
    }
  };

  const loadEngineLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await api.getEngineLogs(250);
      if (res.logs) setEngineLogs(res.logs);
      if (res.logPath) setLogFilePath(res.logPath);
    } catch (_) {}
    finally {
      setIsLoadingLogs(false);
    }
  };

  const handleCopyLogs = () => {
    if (engineLogs.length === 0) return;
    navigator.clipboard.writeText(engineLogs.join('\n'));
    setIsCopiedLogs(true);
    setTimeout(() => setIsCopiedLogs(false), 2000);
  };

  const handleTestAlert = async () => {
    setIsTestingAlert(true);
    try {
      await api.testHandoverAlert(settings.handover_notify_phone || null);
      setAlertSuccessMessage(true);
      setTimeout(() => setAlertSuccessMessage(false), 3000);
    } catch (err) {
      alert(`Failed to send test alert: ${err.message}`);
    } finally {
      setIsTestingAlert(false);
    }
  };

  const handleTestVoice = async () => {
    setIsTestingVoice(true);
    try {
      const res = await api.testVoiceSynthesis('Hello! This is a test of your automated AI voice response for WhatsApp CRM.');
      if (res && res.audioBase64) {
        const audio = new Audio(`data:${res.mimeType || 'audio/wav'};base64,${res.audioBase64}`);
        audio.play();
      }
    } catch (err) {
      alert(`Voice synthesis test error: ${err.message}`);
    } finally {
      setIsTestingVoice(false);
    }
  };

  useEffect(() => {
    loadEngineLogs();
    api.getSettings().then((res) => {
      if (res.settings) {
        const s = { ...res.settings };
        if (!s.auto_responder_mode) {
          s.auto_responder_mode = s.ai_enabled_globally === 'false' ? 'disabled' : 'hybrid';
        }
        setSettings(s);
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const mode = settings.auto_responder_mode || 'hybrid';
      const toSave = {
        ...settings,
        auto_responder_mode: mode,
        ai_enabled_globally: mode === 'disabled' ? 'false' : 'true'
      };
      await api.saveSettings(toSave);
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2000);
    } catch (err) {
      alert(`Failed to save settings: ${err.message}`);
    }
  };

  const currentMode = settings.auto_responder_mode || (settings.ai_enabled_globally === 'false' ? 'disabled' : 'hybrid');

  return (
    <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)] max-w-4xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-emerald-400" />
          System & Anti-Ban Settings
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure safety parameters, database paths, and automated dispatch controls.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Anti-Ban Dispatch Safety Guard */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-100">
              Anti-Ban Dispatch Safety Guard
            </h3>
          </div>

          <p className="text-xs text-slate-400">
            To prevent WhatsApp multi-device account flagging, the dispatcher uses randomized jitter delays between consecutive messages.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Default Minimum Delay (Seconds)
              </label>
              <input
                type="number"
                min="3"
                max="60"
                value={settings.default_min_delay || '8'}
                onChange={(e) => setSettings({ ...settings, default_min_delay: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Default Maximum Delay (Seconds)
              </label>
              <input
                type="number"
                min="5"
                max="120"
                value={settings.default_max_delay || '20'}
                onChange={(e) => setSettings({ ...settings, default_max_delay: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Automated Auto-Responder Mode Selector */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-400" />
                Automated Auto-Responder Architecture
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose how incoming WhatsApp messages are routed between Visual Flows and the AI Agent.
              </p>
            </div>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
              currentMode === 'hybrid'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : currentMode === 'flows_only'
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                : currentMode === 'ai_only'
                ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              {currentMode === 'hybrid' && '🌟 Hybrid (Flows + AI)'}
              {currentMode === 'flows_only' && '⚡ Flows Only'}
              {currentMode === 'ai_only' && '🤖 AI Agent Only'}
              {currentMode === 'disabled' && '⏸️ Auto-Replies Paused'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
            {/* 1. Hybrid: Flows + AI */}
            <div
              onClick={() =>
                setSettings({
                  ...settings,
                  auto_responder_mode: 'hybrid',
                  ai_enabled_globally: 'true'
                })
              }
              className={`relative cursor-pointer rounded-xl p-4 border transition-all text-left ${
                currentMode === 'hybrid'
                  ? 'bg-emerald-950/30 border-emerald-500/80 ring-1 ring-emerald-500/30 shadow-lg shadow-emerald-950/50'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">Both: Flows + AI (Hybrid)</h4>
                    <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Recommended</span>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                  currentMode === 'hybrid'
                    ? 'border-emerald-500 bg-emerald-500'
                    : 'border-slate-700 bg-slate-900'
                }`}>
                  {currentMode === 'hybrid' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                Visual Flows handle matching trigger keywords and interactive menus. If an incoming inquiry doesn't match any flow, the AI Assistant answers seamlessly using your Knowledge Base & Catalog.
              </p>
            </div>

            {/* 2. Flows Only */}
            <div
              onClick={() =>
                setSettings({
                  ...settings,
                  auto_responder_mode: 'flows_only',
                  ai_enabled_globally: 'true'
                })
              }
              className={`relative cursor-pointer rounded-xl p-4 border transition-all text-left ${
                currentMode === 'flows_only'
                  ? 'bg-blue-950/30 border-blue-500/80 ring-1 ring-blue-500/30 shadow-lg shadow-blue-950/50'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <GitBranch className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">Flows Only (Strict)</h4>
                    <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Deterministic Menus</span>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                  currentMode === 'flows_only'
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-slate-700 bg-slate-900'
                }`}>
                  {currentMode === 'flows_only' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                Only triggers when customers send matching keywords or navigate interactive menus. AI responses are strictly confined to flows with an explicit AI Handover node. Unmatched messages outside flows are ignored.
              </p>
            </div>

            {/* 3. AI Agent Only */}
            <div
              onClick={() =>
                setSettings({
                  ...settings,
                  auto_responder_mode: 'ai_only',
                  ai_enabled_globally: 'true'
                })
              }
              className={`relative cursor-pointer rounded-xl p-4 border transition-all text-left ${
                currentMode === 'ai_only'
                  ? 'bg-purple-950/30 border-purple-500/80 ring-1 ring-purple-500/30 shadow-lg shadow-purple-950/50'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">AI Agent Only</h4>
                    <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">Autonomous AI</span>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                  currentMode === 'ai_only'
                    ? 'border-purple-500 bg-purple-500'
                    : 'border-slate-700 bg-slate-900'
                }`}>
                  {currentMode === 'ai_only' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                Visual flows are completely bypassed. Every incoming message is dynamically processed 24/7 by your LLM AI Agent using live Knowledge Base and Product Catalog data.
              </p>
            </div>

            {/* 4. Disabled / Manual */}
            <div
              onClick={() =>
                setSettings({
                  ...settings,
                  auto_responder_mode: 'disabled',
                  ai_enabled_globally: 'false'
                })
              }
              className={`relative cursor-pointer rounded-xl p-4 border transition-all text-left ${
                currentMode === 'disabled'
                  ? 'bg-rose-950/30 border-rose-500/80 ring-1 ring-rose-500/30 shadow-lg shadow-rose-950/50'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                    <PowerOff className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">Disabled (Manual Only)</h4>
                    <span className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">No Auto-Replies</span>
                  </div>
                </div>
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
                  currentMode === 'disabled'
                    ? 'border-rose-500 bg-rose-500'
                    : 'border-slate-700 bg-slate-900'
                }`}>
                  {currentMode === 'disabled' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                Completely stops all automated auto-replies. Incoming messages are still logged in the CRM chat log for human staff, but WhatsApp will never send automatic bot responses.
              </p>
            </div>
          </div>
        </div>

        {/* AI Voice Note Transcription & Auto-Responder */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Mic className="w-4 h-4 text-emerald-400" />
                AI Voice Note Transcription & Processing
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                When a customer sends a WhatsApp voice note, Gemini accurately transcribes their speech and the automated system (AI or Flow) responds with an instant WhatsApp message.
              </p>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Gemini Voice STT Active
            </span>
          </div>

          <div className="space-y-3.5 pt-1">
            <div className="flex items-center justify-between p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                  Voice Note Understanding
                </div>
                <div className="text-[11px] text-slate-400">
                  Automatically transcribes incoming voice notes (Hindi, English, etc.) and routes the query through your Flows & AI Agent to reply via WhatsApp text message.
                </div>
              </div>
              <span className="text-xs font-mono font-semibold px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                Enabled
              </span>
            </div>
          </div>
        </div>

        {/* Human Handover Alert Notification (Notify Self) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                Human Handover Alert Notifications (WhatsApp to Self)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically send a real-time WhatsApp alert to your own phone whenever a customer requests human help or an AI guardrail triggers handover.
              </p>
            </div>
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
              settings.notify_self_on_handover === 'true'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${settings.notify_self_on_handover === 'true' ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'}`} />
              {settings.notify_self_on_handover === 'true' ? 'Alerts Active' : 'Alerts Off'}
            </span>
          </div>

          <div className="space-y-4 pt-1">
            {/* Toggle: Notify Self on Handover */}
            <div className="flex items-center justify-between p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-slate-200">
                  Send WhatsApp Handover Alert to Self
                </div>
                <div className="text-[11px] text-slate-400">
                  When a customer asks for a human or an AI guardrail trips, the CRM immediately messages your own WhatsApp with the customer's name, phone, and inquiry.
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notify_self_on_handover === 'true'}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notify_self_on_handover: e.target.checked ? 'true' : 'false'
                    })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
              </label>
            </div>

            {/* Optional Custom Phone Number Override */}
            <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2">
              <label className="block text-xs font-semibold text-slate-200">
                Custom Alert Phone Number (Optional Override)
              </label>
              <input
                type="text"
                value={settings.handover_notify_phone || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    handover_notify_phone: e.target.value
                  })
                }
                placeholder="Leave blank to automatically send to your connected WhatsApp self number"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono placeholder:text-slate-500"
              />
              <p className="text-[10px] text-slate-400">
                If left blank, notifications land in your WhatsApp <strong>"Message yourself"</strong> chat. You can also specify an alternate phone number (with country code, e.g. <code>919876543210</code>) if another agent handles escalations.
              </p>
            </div>

            {/* Test Alert Button */}
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Test alert dispatch to verify your WhatsApp notification setup:
              </span>
              <button
                type="button"
                onClick={handleTestAlert}
                disabled={isTestingAlert}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {isTestingAlert ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    Sending Alert...
                  </>
                ) : alertSuccessMessage ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Alert Sent to WhatsApp!
                  </>
                ) : (
                  <>
                    <Bell className="w-3.5 h-3.5" />
                    Send Test Alert
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Storage & Local Architecture Info */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Database className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-bold text-slate-100">
              Storage & Embedded Engine Details
            </h3>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
              <span>Database Engine:</span>
              <span className="font-mono text-emerald-400">Embedded SQLite (node:sqlite WAL mode)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
              <span>WhatsApp Protocol Core:</span>
              <span className="font-mono text-cyan-400">@whiskeysockets/baileys Multi-Device TLS</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
              <span>Database File Path:</span>
              <span className="font-mono text-slate-400">data/whatsapp_crm.sqlite</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/60 text-slate-300">
              <span>Sessions Storage:</span>
              <span className="font-mono text-slate-400">sessions/ (MultiFileAuthState)</span>
            </div>
          </div>
        </div>

        {/* Activity Logs & Error Analysis */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Live Engine Activity & Error Analysis Logs
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time execution log capturing incoming messages, Gemini STT transcriptions, flow decisions, handover alerts, and system errors.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadEngineLogs}
                disabled={isLoadingLogs}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1 transition"
                title="Refresh log entries"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingLogs ? 'animate-spin text-emerald-400' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={handleCopyLogs}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1 transition"
                title="Copy all logs to clipboard"
              >
                <Copy className="w-3 h-3" />
                <span>{isCopiedLogs ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5 font-mono text-[10px]">
                <FileText className="w-3 h-3 text-slate-500" />
                {logFilePath || 'logs/crm_activity.log'}
              </span>
              <span>Showing last {engineLogs.length} events</span>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-300 max-h-72 overflow-y-auto space-y-1 select-text scrollbar-thin scrollbar-thumb-slate-800">
              {engineLogs.length === 0 ? (
                <div className="text-slate-500 italic py-4 text-center">
                  No log entries recorded yet. Activity will appear as messages and flows run.
                </div>
              ) : (
                engineLogs.map((line, idx) => {
                  const isError = line.includes('[ERROR]') || line.includes('[FATAL]');
                  const isSystem = line.includes('[SYSTEM]');
                  const isSTT = line.includes('[Voice STT]') || line.includes('[Inbound Voice]');
                  const isHandover = line.includes('[Handover Alert]');
                  const isFlow = line.includes('[Flow Engine]');
                  const isAutoReply = line.includes('[WhatsApp Auto-Reply]');

                  return (
                    <div
                      key={idx}
                      className={`leading-relaxed break-all ${
                        isError
                          ? 'text-rose-400 bg-rose-950/20 px-1 rounded'
                          : isHandover
                          ? 'text-amber-300 bg-amber-950/20 px-1 rounded'
                          : isSTT
                          ? 'text-cyan-300'
                          : isFlow
                          ? 'text-purple-300'
                          : isAutoReply
                          ? 'text-emerald-300'
                          : isSystem
                          ? 'text-blue-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {line}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Danger Zone: Factory Reset */}
        <div className="bg-rose-950/20 border border-rose-900/40 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-start justify-between gap-4 pb-3 border-b border-rose-900/40">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-200">
                  Danger Zone: Factory Reset Application
                </h3>
                <p className="text-xs text-rose-300/70 mt-1 max-w-2xl leading-relaxed">
                  Permanently clear all contacts, audience lists, chat histories, bulk campaigns, custom automation flows, AI knowledge base items, catalog products, and disconnect WhatsApp sessions. This completely sets the application to a brand-new factory state.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setResetConfirmInput('');
                setResetError('');
                setResetSuccess(false);
                setIsResetModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-rose-900/40 transition shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Factory Reset Application</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-rose-400/80">
            <span className="font-semibold">⚠️ Irreversible Action:</span>
            <span>All local SQLite data and Baileys multi-device authentication credentials will be erased and reset to fresh defaults.</span>
          </div>
        </div>

        {savedMessage && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-xs text-emerald-300 font-semibold text-center">
            Settings successfully saved!
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition"
          >
            <Save className="w-4 h-4" />
            <span>Save All Settings</span>
          </button>
        </div>
      </form>

      {/* Factory Reset Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 shrink-0">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Confirm Factory Reset
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  You are about to completely wipe all user data and restore the application to its original clean state.
                </p>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs space-y-2 text-slate-300">
              <div className="font-semibold text-rose-400 mb-1">The following data will be permanently wiped:</div>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-rose-400 font-bold">✕</span> All WhatsApp session keys & linked WhatsApp accounts
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-rose-400 font-bold">✕</span> All contacts, audience lists & custom tags
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-rose-400 font-bold">✕</span> Complete live chat history & inbound message logs
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-rose-400 font-bold">✕</span> All bulk campaigns & message dispatch queues
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-rose-400 font-bold">✕</span> Custom automation flows (reset to default starter templates)
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-rose-400 font-bold">✕</span> AI knowledge items, product catalog & activity logs
              </div>
            </div>

            {resetError && (
              <div className="p-3 bg-rose-950/80 border border-rose-500/40 rounded-xl text-xs text-rose-300 font-medium">
                {resetError}
              </div>
            )}

            {resetSuccess ? (
              <div className="p-4 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-center space-y-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto animate-bounce" />
                <div className="text-sm font-bold text-emerald-300">
                  Factory Reset Successful!
                </div>
                <p className="text-xs text-emerald-400/80">
                  Application set as brand new. Reloading system...
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Type <span className="font-mono font-bold text-rose-400">RESET</span> to confirm:
                  </label>
                  <input
                    type="text"
                    value={resetConfirmInput}
                    onChange={(e) => setResetConfirmInput(e.target.value)}
                    disabled={isResetting}
                    placeholder="RESET"
                    autoFocus
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsResetModalOpen(false)}
                    disabled={isResetting}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleFactoryReset}
                    disabled={isResetting || resetConfirmInput.trim().toUpperCase() !== 'RESET'}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-rose-900/40 transition cursor-pointer"
                  >
                    {isResetting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Resetting Application...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        Confirm Factory Reset
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

