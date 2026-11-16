import React, { useState, useEffect } from 'react';
import {
  Send,
  ShieldCheck,
  Wifi,
  WifiOff,
  Sparkles,
  Paperclip,
  CheckCircle2,
  User,
  Search,
  X,
  Phone,
  AlertCircle
} from 'lucide-react';
import { api } from '../services/api';
import Modal from './Modal';

export const Header = ({ title, activeSession, onRefresh, quickDispatchTarget, onCloseQuickDispatch }) => {
  const [isQuickMsgOpen, setIsQuickMsgOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [selectedContactName, setSelectedContactName] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [contacts, setContacts] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const [inputMode, setInputMode] = useState('search'); // 'search' or 'direct'
  const [formError, setFormError] = useState('');

  const isConnected = activeSession?.status === 'connected';

  // Load contacts when modal opens
  useEffect(() => {
    if (isQuickMsgOpen) {
      api.getContacts()
        .then((res) => {
          if (res.contacts) setContacts(res.contacts);
        })
        .catch(() => {});
    }
  }, [isQuickMsgOpen]);

  // Handle external trigger (e.g. from Contacts table row click)
  useEffect(() => {
    if (quickDispatchTarget) {
      setPhone(quickDispatchTarget.phone || '');
      setSelectedContactName(quickDispatchTarget.name || '');
      setContactSearch('');
      setFormError('');
      setSendResult(null);
      setIsQuickMsgOpen(true);
    }
  }, [quickDispatchTarget]);

  const handleClose = () => {
    setIsQuickMsgOpen(false);
    setFormError('');
    setSendResult(null);
    if (onCloseQuickDispatch) onCloseQuickDispatch();
  };

  const handleSelectContact = (c) => {
    setPhone(c.phone);
    setSelectedContactName(c.name || '');
    setContactSearch('');
    setFormError('');
  };

  const handleClearSelected = () => {
    setPhone('');
    setSelectedContactName('');
    setContactSearch('');
  };

  const handleSendDirect = async (e) => {
    e.preventDefault();
    setFormError('');
    setSendResult(null);

    const targetPhone = phone.trim();
    if (!targetPhone) {
      setFormError('Please select a contact or enter a recipient phone number.');
      return;
    }
    if (!msg.trim()) {
      setFormError('Please type a message to send.');
      return;
    }

    setSending(true);
    try {
      await api.sendDirectMessage(
        targetPhone,
        msg.trim(),
        activeSession?.sessionId || 'default',
        mediaUrl.trim() || null
      );
      setSendResult({
        success: true,
        message: `Message dispatched successfully to +${targetPhone.replace(/\D/g, '')}!`
      });
      setTimeout(() => {
        handleClose();
        setPhone('');
        setSelectedContactName('');
        setMsg('');
        setMediaUrl('');
        setSendResult(null);
      }, 1500);
      if (onRefresh) onRefresh();
    } catch (err) {
      setSendResult({ success: false, message: `Failed to dispatch: ${err.message}` });
    } finally {
      setSending(false);
    }
  };

  // Filter contacts by live search input
  const matchingContacts = contactSearch.trim()
    ? contacts.filter((c) => {
        const q = contactSearch.toLowerCase();
        return (
          c.phone.includes(q) ||
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.list_names && c.list_names.toLowerCase().includes(q))
        );
      }).slice(0, 10)
    : contacts.slice(0, 6);

  return (
    <header className="h-16 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-6 flex items-center justify-between z-20">
      <div>
        <h2 className="text-lg font-bold text-slate-100">{title}</h2>
      </div>

      <div className="flex items-center gap-3">
        {/* Anti-Ban Shield Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Anti-Ban Jitter Guard Active</span>
        </div>

        {/* WhatsApp Connection Pill */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
            isConnected
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : 'bg-amber-950/60 border-amber-500/40 text-amber-300'
          }`}
        >
          {isConnected ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span>
            {isConnected
              ? `Online (${
                  activeSession?.phoneNumber
                    ? activeSession.phoneNumber.startsWith('+')
                      ? activeSession.phoneNumber
                      : '+' + activeSession.phoneNumber
                    : 'Ready'
                })`
              : 'WhatsApp Disconnected'}
          </span>
        </div>

        {/* Quick Send Message Button */}
        <button
          onClick={() => {
            setFormError('');
            setSendResult(null);
            setIsQuickMsgOpen(true);
          }}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-xl text-xs shadow-lg shadow-emerald-600/20 transition active:scale-95"
          title="Send a 1-off direct message to any number or contact"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Quick Dispatch</span>
        </button>
      </div>

      {/* Quick Dispatch Modal */}
      <Modal
        isOpen={isQuickMsgOpen}
        onClose={handleClose}
        title="Quick WhatsApp Dispatch"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSendDirect} className="space-y-4">
          {/* Recipient Selection Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">Recipient Contact</label>
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setInputMode('search')}
                  className={`px-2 py-0.5 rounded-md font-medium transition ${
                    inputMode === 'search'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Search Contacts
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('direct')}
                  className={`px-2 py-0.5 rounded-md font-medium transition ${
                    inputMode === 'direct'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Direct Phone
                </button>
              </div>
            </div>

            {/* If contact is currently selected */}
            {phone ? (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-xs">
                    {selectedContactName ? selectedContactName[0].toUpperCase() : <User className="w-3.5 h-3.5" />}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-emerald-300">
                      {selectedContactName || 'Selected Recipient'}
                    </p>
                    <p className="text-[11px] font-mono text-emerald-400/80">+{phone.replace(/\D/g, '')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearSelected}
                  className="p-1 hover:bg-emerald-900/50 text-emerald-400 rounded-lg transition text-xs flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Change</span>
                </button>
              </div>
            ) : inputMode === 'search' ? (
              /* Searchable Contact Auto-Complete & Dropdown */
              <div className="space-y-2">
                {/* Native Quick Selector Dropdown */}
                <select
                  value=""
                  onChange={(e) => {
                    const selectedId = Number(e.target.value);
                    const found = contacts.find((c) => c.id === selectedId);
                    if (found) handleSelectContact(found);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">-- Choose Contact from Address Book ({contacts.length} saved) --</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ? `${c.name} (+${c.phone})` : `+${c.phone}`} {c.list_names ? `— [${c.list_names}]` : ''}
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Or type to search (e.g. pooja, 7011...)"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto space-y-1 bg-slate-950/70 border border-slate-800/80 rounded-xl p-1.5 scrollbar-thin">
                  {matchingContacts.length === 0 ? (
                    <p className="text-[11px] text-slate-500 text-center py-2 italic">
                      No matching contacts found. Switch to "Direct Phone" above.
                    </p>
                  ) : (
                    matchingContacts.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectContact(c)}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-semibold text-slate-200">
                            {c.name || 'Unnamed'}
                          </span>
                          <span className="font-mono text-emerald-400 text-[11px]">
                            +{c.phone}
                          </span>
                        </div>
                        {c.list_names && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                            {c.list_names.split(',')[0]}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* Direct Phone Input */
              <div>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="e.g. 7011847629 or +919958648919"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  10-digit Indian numbers auto-prefix +91 on send.
                </span>
              </div>
            )}
          </div>

          {/* Message Content */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">Message Content</label>
              <button
                type="button"
                onClick={() => setMsg((prev) => prev + ' {Hello|Hi|Hey}')}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium"
              >
                + Insert Spintax
              </button>
            </div>
            <textarea
              rows={3}
              placeholder="Type your WhatsApp message here..."
              value={msg}
              onChange={(e) => {
                setMsg(e.target.value);
                setFormError('');
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          {/* Optional Media Attachment */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" />
              Optional Media / Document File Path
            </label>
            <input
              type="text"
              placeholder="e.g. C:\Users\Desktop\brochure.pdf"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Form Error Message */}
          {formError && (
            <div className="p-2.5 rounded-xl text-xs bg-rose-950/70 border border-rose-500/50 text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Send Result Banner */}
          {sendResult && (
            <div
              className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                sendResult.success
                  ? 'bg-emerald-950/70 border border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/70 border border-rose-500/50 text-rose-300'
              }`}
            >
              {sendResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              )}
              <span>{sendResult.message}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2 rounded-xl transition shadow-lg shadow-emerald-600/20"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sending ? 'Sending...' : 'Send Message Now'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </header>
  );
};

export default Header;
