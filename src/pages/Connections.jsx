import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Smartphone,
  Plus,
  RefreshCw,
  Power,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldAlert
} from 'lucide-react';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';

export const Connections = ({ liveSessions = [], onRefresh }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionId, setNewSessionId] = useState('');
  const [startingSession, setStartingSession] = useState(null);
  const [relinkingSession, setRelinkingSession] = useState(null);

  const loadSessions = async () => {
    try {
      const data = await api.getSessions();
      if (data.sessions) setSessions(data.sessions);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
    const unsubscribe = api.subscribe((event) => {
      if (['session_update', 'qr', 'connection_open', 'connection_close', 'session_deleted'].includes(event.type)) {
        loadSessions();
      }
    });
    return unsubscribe;
  }, []);

  const handleStartSession = async (sessionId, name) => {
    setStartingSession(sessionId);
    try {
      await api.startSession(sessionId, name);
      await loadSessions();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Failed to start session: ${err.message}`);
    } finally {
      setStartingSession(null);
    }
  };

  const handleStopSession = async (sessionId) => {
    if (!window.confirm(`Disconnect session ${sessionId}?`)) return;
    try {
      await api.stopSession(sessionId);
      await loadSessions();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Error stopping session: ${err.message}`);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm(`Permanently delete session [${sessionId}] and remove stored credentials?`)) return;
    try {
      await api.deleteSession(sessionId);
      await loadSessions();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Error deleting session: ${err.message}`);
    }
  };

  const handleRelinkSession = async (sessionId, sessionName) => {
    if (
      !window.confirm(
        `Regenerate clean encryption keys for [${sessionName || sessionId}]?\n\nThis completely clears corrupted Signal pre-keys (fixing "Waiting for this message" / Bad MAC errors) and displays a fresh QR code.`
      )
    )
      return;

    setRelinkingSession(sessionId);
    try {
      await api.relinkSession(sessionId, sessionName);
      await loadSessions();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Error re-linking session: ${err.message}`);
    } finally {
      setRelinkingSession(null);
    }
  };

  const handleCreateNew = async (e) => {
    e.preventDefault();
    if (!newSessionName) return;
    const cleanId = (newSessionId || newSessionName).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    setIsNewModalOpen(false);
    setNewSessionName('');
    setNewSessionId('');
    await handleStartSession(cleanId, newSessionName);
  };

  return (
    <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Header and Add Session button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            WhatsApp Multi-Device Sessions
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Connect one or more WhatsApp accounts simultaneously via Baileys multi-device protocol.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadSessions}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/30 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add WhatsApp Account</span>
          </button>
        </div>
      </div>

      {/* Troubleshooting notice for Signal Bad MAC / Waiting for message */}
      <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-xs text-amber-200">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-amber-100 flex items-center gap-2">
            <span>Fixing "Waiting for this message" & Unresponsive Bot Triggers</span>
          </p>
          <p className="text-[11px] text-amber-200/80 leading-relaxed">
            If dispatched messages show <i>"Waiting for this message"</i> on the recipient's phone or incoming keywords don't trigger the chatbot flow, WhatsApp's local end-to-end encryption keys are desynchronized (<code className="bg-amber-900/60 px-1 py-0.5 rounded text-amber-300 font-mono">Bad MAC</code>).
            Click <b>"Fix & Re-scan QR"</b> on your account below to clear stale pre-keys and generate a clean QR code.
          </p>
        </div>
      </div>

      {/* Sessions Grid */}
      {sessions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto">
          <QrCode className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-200">No WhatsApp Sessions Configured</h3>
          <p className="text-xs text-slate-400 mt-1 mb-6">
            Click the button below to initialize your primary WhatsApp account session and scan the QR code.
          </p>
          <button
            onClick={() => handleStartSession('default', 'Primary WhatsApp')}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition"
          >
            Initialize Primary Session
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sessions.map((session) => {
            const isConnected = session.status === 'connected';
            const isQR = session.status === 'qr_ready' && session.qr;
            const isConnecting = session.status === 'connecting' || startingSession === session.sessionId;

            return (
              <div
                key={session.sessionId}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar of Card */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-base font-bold text-slate-100">
                          {session.sessionName || session.sessionId}
                        </h3>
                        <StatusBadge status={session.status} />
                      </div>
                      <p className="text-xs font-mono text-slate-400 mt-1">
                        ID: {session.sessionId}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isConnected ? (
                        <>
                          <button
                            onClick={() => handleRelinkSession(session.sessionId, session.sessionName)}
                            disabled={relinkingSession === session.sessionId}
                            title="Fix Bad MAC & Generate fresh QR code"
                            className="p-2 bg-slate-800 hover:bg-amber-900/40 text-slate-400 hover:text-amber-400 rounded-xl transition"
                          >
                            <RefreshCw className={`w-4 h-4 ${relinkingSession === session.sessionId ? 'animate-spin text-amber-400' : ''}`} />
                          </button>
                          <button
                            onClick={() => handleStopSession(session.sessionId)}
                            title="Disconnect Session"
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl transition"
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleStartSession(session.sessionId, session.sessionName)}
                          disabled={isConnecting}
                          title="Connect / Generate QR"
                          className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl shadow-md transition"
                        >
                          <RefreshCw className={`w-4 h-4 ${isConnecting ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteSession(session.sessionId)}
                        title="Delete Session"
                        className="p-2 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-xl transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* QR Code or Connected Phone Display */}
                  <div className="mt-6 flex flex-col items-center justify-center p-6 rounded-xl bg-slate-950 border border-slate-800/80 min-h-[260px]">
                    {isConnected ? (
                      <div className="text-center space-y-3">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner shadow-emerald-500/30">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <div>
                          <p className="text-lg font-bold text-slate-100">
                            +{session.phoneNumber || 'Connected'}
                          </p>
                          <p className="text-xs text-emerald-400 font-semibold mt-0.5">
                            Authenticated & Ready for Campaigns
                          </p>
                        </div>
                        <p className="text-[11px] text-slate-400 max-w-xs">
                          Incoming messages will trigger the visual flow engine and auto-responder according to your rules.
                        </p>
                        <div className="pt-2">
                          <button
                            onClick={() => handleRelinkSession(session.sessionId, session.sessionName)}
                            disabled={relinkingSession === session.sessionId}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-amber-950/70 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-semibold shadow-md transition"
                            title="Regenerate clean Signal keys if messages fail to decrypt"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${relinkingSession === session.sessionId ? 'animate-spin' : ''}`} />
                            <span>Fix & Re-scan QR</span>
                          </button>
                        </div>
                      </div>
                    ) : isQR ? (
                      <div className="text-center space-y-3">
                        <div className="bg-white p-3 rounded-2xl inline-block shadow-2xl">
                          <img
                            src={session.qr}
                            alt="WhatsApp Web QR Code"
                            className="w-48 h-48 object-contain"
                          />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-200">Scan QR Code with WhatsApp</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Open WhatsApp → Linked Devices → Link a Device
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-3 py-6">
                        <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                          <Power className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-300">
                            {isConnecting ? 'Starting Engine & Fetching QR...' : 'Session is Currently Offline'}
                          </p>
                          <p className="text-xs text-slate-500 mt-1 max-w-xs">
                            {isConnecting
                              ? 'Initializing Baileys Multi-Device socket, please hold on...'
                              : 'Click "Start Session" below to initialize and display your login QR code.'}
                          </p>
                        </div>
                        {!isConnecting && (
                          <button
                            onClick={() => handleStartSession(session.sessionId, session.sessionName)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg transition"
                          >
                            Start Session
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer details */}
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Engine: @whiskeysockets/baileys</span>
                  <span>Store: MultiFileAuthState</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Session Modal */}
      <Modal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        title="Add New WhatsApp Account Session"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateNew} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Account Display Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Sales WhatsApp or Customer Support"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Session Identifier (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. sales_wa (auto-generated if empty)"
              value={newSessionId}
              onChange={(e) => setNewSessionId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400">
            Each account operates in an isolated session folder, maintaining separate authentication tokens and encryption keys.
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
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-emerald-600/30"
            >
              Create & Launch Session
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Connections;

