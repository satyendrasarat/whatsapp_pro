import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  User,
  Bot,
  UserCheck,
  RotateCcw,
  Headphones,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  Sparkles,
  ArrowDown,
  Edit3,
  X,
  Phone,
  Trash2,
  Tag,
  Plus,
  AlertTriangle,
  Volume2,
  VolumeX,
  Mic,
  Paperclip
} from 'lucide-react';
import { api } from '../services/api';
import { playIncomingBeep, playNeedsHumanAlert, isAudioEnabled, setAudioEnabled } from '../utils/soundEffects';
import { pickAttachmentFile } from '../utils/filePicker';

const PRESET_COLORS = [
  { name: 'Emerald', value: '#10b981' },
  { name: 'Sky Blue', value: '#0ea5e9' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose Red', value: '#f43f5e' },
  { name: 'Amber Orange', value: '#f59e0b' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' }
];

export const LiveChatInbox = () => {
  const [conversations, setConversations] = useState([]);
  const [selectedJid, setSelectedJid] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState(null); // { filePath, fileName }
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all', 'needs_human', 'bot_paused', 'bot_active' or custom label name
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [activeContactStatus, setActiveContactStatus] = useState({ bot_disabled: 0, human_agent_requested: 0 });
  
  // Contact editing
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [isSavingContact, setIsSavingContact] = useState(false);

  // Labels & Tagging
  const [labels, setLabels] = useState([]);
  const [isCreatingLabel, setIsCreatingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#10b981');
  const [isSavingLabel, setIsSavingLabel] = useState(false);
  const [isTaggingOpen, setIsTaggingOpen] = useState(false);

  // Chat Deletion & Bulk Selection
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedJidsForDelete, setSelectedJidsForDelete] = useState(new Set());
  const [isConfirmingBulkDelete, setIsConfirmingBulkDelete] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [singleDeleteTarget, setSingleDeleteTarget] = useState(null);

  // Audio Notifications State
  const [soundOn, setSoundOn] = useState(() => isAudioEnabled());
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setAudioEnabled(next);
    if (next) {
      playIncomingBeep();
    }
  };

  const messagesEndRef = useRef(null);
  const chatScrollContainerRef = useRef(null);
  const selectedJidRef = useRef(null);
  const tagDropdownRef = useRef(null);

  // Keep ref strictly synchronized with state to prevent stale closures in timers
  useEffect(() => {
    selectedJidRef.current = selectedJid;
  }, [selectedJid]);

  // Click-outside listener for label dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target)) {
        setIsTaggingOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Intelligent formatting for WhatsApp Phone Numbers & Multi-Device LIDs
  const getContactDisplay = (conv) => {
    if (!conv) return { name: 'Unknown', subtitle: '', isLid: false, avatarChar: '?' };
    const jid = conv.contact_jid || '';
    const isLid = jid.endsWith('@lid');
    const rawNumber = jid.replace(/@.*$/, '');
    const resolvedPhone = conv.resolved_phone || '';
    const name = conv.contact_name || conv.push_name || '';

    let displayName = '';
    let subtitle = '';

    if (name) {
      displayName = name;
      if (resolvedPhone) {
        subtitle = `+${resolvedPhone}`;
      } else if (isLid) {
        subtitle = `WhatsApp LID: ${rawNumber}`;
      } else {
        subtitle = `+${rawNumber}`;
      }
    } else {
      if (resolvedPhone) {
        displayName = `+${resolvedPhone}`;
        subtitle = isLid ? `LID Identity: ${rawNumber}` : '';
      } else if (isLid) {
        displayName = `Customer (${rawNumber.slice(-4)})`;
        subtitle = `LID Identity: ${rawNumber}`;
      } else {
        displayName = `+${rawNumber}`;
        subtitle = '';
      }
    }

    const cleanChar = displayName.replace(/^\+/, '').trim();
    const avatarChar = (cleanChar ? cleanChar[0] : 'U').toUpperCase();

    return { name: displayName, subtitle, isLid, avatarChar, rawNumber, resolvedPhone, originalName: name };
  };

  // Cross-Identity Matcher (Matches JID, LID, Phone number symmetrically)
  const isSameContact = (c, target, extraPhone = null) => {
    if (!c || !target) return false;
    const cJid = (typeof c === 'string' ? c : (c.contact_jid || '')).toLowerCase().trim();
    const targetJid = (typeof target === 'string' ? target : (target.contact_jid || '')).toLowerCase().trim();
    if (cJid && targetJid && cJid === targetJid) return true;

    const extractDigits = (val) => {
      if (!val) return '';
      return String(val).replace(/@.*$/, '').replace(/\D/g, '');
    };

    const cClean = extractDigits(cJid);
    const cResolved = typeof c === 'object' && c.resolved_phone ? extractDigits(c.resolved_phone) : '';
    const cSet = new Set([cClean, cResolved].filter((d) => d.length >= 7));

    const targetClean = extractDigits(targetJid);
    const targetResolved = typeof target === 'object' && target.resolved_phone 
      ? extractDigits(target.resolved_phone) 
      : (extraPhone ? extractDigits(extraPhone) : '');
    const targetSet = new Set([targetClean, targetResolved].filter((d) => d.length >= 7));

    for (const d of cSet) {
      if (targetSet.has(d)) return true;
    }
    return false;
  };

  const openEditModal = (conv) => {
    if (!conv) return;
    const info = getContactDisplay(conv);
    setEditName(info.originalName || '');
    setEditPhone(info.resolvedPhone || (info.isLid ? '' : info.rawNumber));
    setIsEditingContact(true);
  };

  const handleSaveContact = async (e) => {
    e?.preventDefault();
    if (!selectedJid) return;
    setIsSavingContact(true);
    try {
      await api.updateContact(selectedJid, editName.trim(), editPhone.trim());
      setIsEditingContact(false);
      await loadConversations();
    } catch (err) {
      alert(`Failed to save contact: ${err.message}`);
    } finally {
      setIsSavingContact(false);
    }
  };

  const loadConversations = async () => {
    try {
      const res = await api.getConversations();
      if (res.conversations) {
        setConversations(res.conversations);
        const currentActive = selectedJidRef.current;
        // Only auto-select the very first contact on initial page load if nothing is selected
        if (!currentActive && res.conversations.length > 0) {
          const firstJid = res.conversations[0].contact_jid;
          selectedJidRef.current = firstJid;
          setSelectedJid(firstJid);
          setActiveContactStatus({
            bot_disabled: res.conversations[0].bot_disabled,
            human_agent_requested: res.conversations[0].human_agent_requested
          });
        } else if (currentActive) {
          // Keep the user's active contact selection untouched across LID and phone identity changes!
          const current = res.conversations.find((c) => isSameContact(c, currentActive));
          if (current) {
            setActiveContactStatus({
              bot_disabled: current.bot_disabled,
              human_agent_requested: current.human_agent_requested
            });
          }
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  };

  const loadLabels = async () => {
    try {
      const res = await api.getChatLabels();
      if (res && res.labels) {
        setLabels(res.labels);
      }
    } catch (err) {
      console.error('Failed to load chat labels:', err);
    }
  };

  const loadMessages = async (jid, isBackground = false) => {
    if (!jid) return;
    if (!isBackground) {
      setIsLoadingMessages(true);
    }
    try {
      const [msgRes, statusRes] = await Promise.all([
        api.getConversationMessages(jid, 150),
        api.getCustomerStatus(jid).catch(() => ({ status: { bot_disabled: 0, human_agent_requested: 0 } }))
      ]);

      if (msgRes.messages) {
        setMessages(msgRes.messages);
      }
      if (statusRes.status) {
        setActiveContactStatus(statusRes.status);
      }
    } catch (err) {
      console.error('Failed to load messages for jid:', jid, err);
    } finally {
      if (!isBackground) {
        setIsLoadingMessages(false);
      }
      scrollToBottom();
    }
  };

  useEffect(() => {
    loadConversations();
    loadLabels();
    const interval = setInterval(loadConversations, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedJid) {
      loadMessages(selectedJid, false);
    }
  }, [selectedJid]);

  // Real-time WebSocket updates
  useEffect(() => {
    const unsubscribe = api.subscribe((event) => {
      if (event.type === 'incoming_message') {
        playIncomingBeep();
        const isCurrentChat = selectedJidRef.current && isSameContact(event.from, selectedJidRef.current);
        if (isCurrentChat && event.text) {
          setMessages((prev) => {
            const isDup = prev.some((m) => (event.id && m.id === event.id) || (m.message_text === event.text && m.direction === 'incoming' && Math.abs(new Date(m.timestamp || Date.now()) - new Date(event.timestamp || Date.now())) < 3000));
            if (isDup) return prev;
            return [...prev, {
              id: event.id || Date.now(),
              from_jid: event.from,
              to_jid: 'me',
              message_text: event.text,
              direction: 'incoming',
              timestamp: event.timestamp || new Date().toISOString()
            }];
          });
          scrollToBottom();
        }
        setConversations((prev) =>
          prev.map((c) =>
            isSameContact(c, event.from)
              ? { ...c, last_message: event.text, last_direction: 'incoming', last_timestamp: new Date().toISOString() }
              : c
          )
        );
        loadConversations();
        if (selectedJidRef.current) {
          loadMessages(selectedJidRef.current, true);
        }
      } else if (event.type === 'outgoing_message') {
        const isCurrentChat = selectedJidRef.current && isSameContact(event.to, selectedJidRef.current);
        if (isCurrentChat && event.text) {
          setMessages((prev) => {
            const isDup = prev.some((m) => (event.id && m.id === event.id) || (m.message_text === event.text && m.direction === 'outgoing' && Math.abs(new Date(m.timestamp || Date.now()) - new Date(event.timestamp || Date.now())) < 3000));
            if (isDup) return prev;
            return [...prev, {
              id: event.id || Date.now(),
              from_jid: 'me',
              to_jid: event.to,
              message_text: event.text,
              direction: 'outgoing',
              timestamp: event.timestamp || new Date().toISOString()
            }];
          });
          scrollToBottom();
        }
        setConversations((prev) =>
          prev.map((c) =>
            isSameContact(c, event.to)
              ? { ...c, last_message: event.text, last_direction: 'outgoing', last_timestamp: new Date().toISOString() }
              : c
          )
        );
        loadConversations();
        if (selectedJidRef.current) {
          loadMessages(selectedJidRef.current, true);
        }
      } else if (event.type === 'bot_status_changed') {
        loadConversations();
        if (isSameContact(event.chatJid, selectedJidRef.current)) {
          setActiveContactStatus((prev) => ({
            ...prev,
            bot_disabled: event.botDisabled ? 1 : 0,
            human_agent_requested: event.botDisabled ? prev.human_agent_requested : 0
          }));
        }
      } else if (event.type === 'human_handover_requested') {
        playNeedsHumanAlert();
        loadConversations();
        if (isSameContact(event.chatJid, selectedJidRef.current)) {
          setActiveContactStatus({
            human_agent_requested: 1,
            bot_disabled: 1
          });
        }
      } else if (event.type === 'human_request_resolved') {
        loadConversations();
        if (isSameContact(event.chatJid, selectedJidRef.current)) {
          setActiveContactStatus({
            human_agent_requested: 0,
            bot_disabled: 0
          });
        }
      } else if (event.type === 'conversation_deleted') {
        if (isSameContact(event.chatJid, selectedJidRef.current)) {
          setSelectedJid(null);
          selectedJidRef.current = null;
          setMessages([]);
        }
        loadConversations();
        loadLabels();
      } else if (event.type === 'conversations_bulk_deleted') {
        if (selectedJidRef.current && event.deletedJids?.some((j) => isSameContact(j, selectedJidRef.current))) {
          setSelectedJid(null);
          selectedJidRef.current = null;
          setMessages([]);
        }
        loadConversations();
        loadLabels();
      } else if (event.type === 'message_deleted') {
        if (event.messageId) {
          setMessages((prev) => prev.filter((m) => m.id !== event.messageId));
        }
        loadConversations();
      } else if (event.type === 'labels_updated') {
        loadLabels();
        loadConversations();
      } else if (event.type === 'conversation_labels_updated') {
        loadConversations();
        loadLabels();
      }
    });

    return unsubscribe;
  }, [selectedJid]);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  const handleAttachFile = async () => {
    try {
      const picked = await pickAttachmentFile({
        title: 'Select Attachment for Chat (All formats supported)'
      });
      if (picked?.filePath) {
        setAttachment(picked);
      }
    } catch (err) {
      console.error('Attach file failed:', err);
    }
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && !attachment) || !selectedJid || isSending) return;

    const messageText = inputText.trim();
    const mediaUrl = attachment?.filePath || null;
    const mediaName = attachment?.fileName || (mediaUrl ? mediaUrl.split(/[/\\]/).pop() : '');

    setInputText('');
    setAttachment(null);
    setIsSending(true);

    try {
      await api.sendDirectMessage(selectedJid, messageText, 'default', mediaUrl);
      const displayContent = messageText || `📎 [Attachment: ${mediaName}]`;
      // Append optimistically to messages list
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          from_jid: 'me',
          to_jid: selectedJid,
          message_text: displayContent,
          direction: 'outgoing',
          timestamp: new Date().toISOString()
        }
      ]);
      scrollToBottom();
      loadConversations();
    } catch (err) {
      alert(`Failed to send message: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleBot = async () => {
    if (!selectedJid) return;
    const newDisabledState = !activeContactStatus.bot_disabled;
    try {
      await api.toggleCustomerBot(selectedJid, newDisabledState);
      setActiveContactStatus((prev) => ({
        ...prev,
        bot_disabled: newDisabledState ? 1 : 0,
        human_agent_requested: newDisabledState ? prev.human_agent_requested : 0
      }));
      setConversations((prev) =>
        prev.map((c) =>
          isSameContact(c, selectedJid)
            ? { ...c, bot_disabled: newDisabledState ? 1 : 0, human_agent_requested: newDisabledState ? c.human_agent_requested : 0 }
            : c
        )
      );
    } catch (err) {
      alert(`Failed to update bot state: ${err.message}`);
    }
  };

  const handleResolveHumanRequest = async () => {
    if (!selectedJid) return;
    try {
      await api.resolveHumanRequest(selectedJid);
      setActiveContactStatus({
        bot_disabled: 0,
        human_agent_requested: 0
      });
      setConversations((prev) =>
        prev.map((c) =>
          isSameContact(c, selectedJid)
            ? { ...c, human_agent_requested: 0, bot_disabled: 0 }
            : c
        )
      );
    } catch (err) {
      alert(`Failed to resolve request: ${err.message}`);
    }
  };

  // Label Management: Toggle label on active conversation
  const handleToggleLabel = async (labelName) => {
    if (!selectedJid) return;
    const selectedConv = conversations.find((c) => isSameContact(c, selectedJid));
    const currentLabels = Array.isArray(selectedConv?.labels) ? selectedConv.labels : [];
    const nextLabels = currentLabels.includes(labelName)
      ? currentLabels.filter((l) => l !== labelName)
      : [...currentLabels, labelName];

    // Optimistically update conversations in state
    setConversations((prev) =>
      prev.map((c) =>
        isSameContact(c, selectedJid) ? { ...c, labels: nextLabels } : c
      )
    );

    try {
      await api.setConversationLabels(selectedJid, nextLabels);
      await loadLabels();
    } catch (err) {
      alert(`Failed to update labels: ${err.message}`);
      loadConversations();
    }
  };

  // Label Management: Create a new custom label
  const handleCreateLabel = async (e) => {
    e?.preventDefault();
    if (!newLabelName.trim()) return;
    setIsSavingLabel(true);
    try {
      const res = await api.createChatLabel(newLabelName.trim(), newLabelColor);
      if (res.labels) setLabels(res.labels);
      const createdName = newLabelName.trim();
      setNewLabelName('');
      setIsCreatingLabel(false);
      // Auto-tag current active contact if open
      if (selectedJid) {
        await handleToggleLabel(createdName);
      }
      await loadLabels();
      await loadConversations();
    } catch (err) {
      alert(`Failed to create label: ${err.message}`);
    } finally {
      setIsSavingLabel(false);
    }
  };

  // Label Management: Delete label permanently
  const handleDeleteLabel = async (labelName) => {
    if (!confirm(`Are you sure you want to delete label "${labelName}"? It will be removed from all chats.`)) return;
    try {
      await api.deleteChatLabel(labelName);
      if (filterTab === labelName) setFilterTab('all');
      await loadLabels();
      await loadConversations();
    } catch (err) {
      alert(`Failed to delete label: ${err.message}`);
    }
  };

  // Chat Deletion: Delete entire conversation history
  const handleDeleteConversation = async () => {
    if (!selectedJid) return;
    setIsDeleting(true);
    try {
      await api.deleteConversation(selectedJid);
      setIsConfirmingDelete(false);
      setSelectedJid(null);
      selectedJidRef.current = null;
      setMessages([]);
      await loadConversations();
      await loadLabels();
    } catch (err) {
      alert(`Failed to delete conversation: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk Delete: Toggle select a chat for bulk delete
  const toggleSelectChat = (jid, forceChecked = null, e = null) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setSelectedJidsForDelete((prev) => {
      const next = new Set(prev);
      const shouldCheck = forceChecked !== null ? forceChecked : !next.has(jid);
      if (shouldCheck) {
        next.add(jid);
      } else {
        next.delete(jid);
      }
      return next;
    });
  };

  // Select/Deselect all filtered conversations
  const toggleSelectAll = () => {
    if (selectedJidsForDelete.size === filteredConversations.length && filteredConversations.length > 0) {
      setSelectedJidsForDelete(new Set());
    } else {
      setSelectedJidsForDelete(new Set(filteredConversations.map((c) => c.contact_jid)));
    }
  };

  // Bulk delete selected conversations
  const handleBulkDelete = async () => {
    if (selectedJidsForDelete.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const jidsArray = Array.from(selectedJidsForDelete);
      await api.deleteConversations(jidsArray);

      if (selectedJid && jidsArray.some((j) => isSameContact(j, selectedJid))) {
        setSelectedJid(null);
        selectedJidRef.current = null;
        setMessages([]);
      }

      setSelectedJidsForDelete(new Set());
      setIsConfirmingBulkDelete(false);
      await loadConversations();
      await loadLabels();
    } catch (err) {
      alert(`Failed to delete conversations: ${err.message}`);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Delete a specific conversation initiated from a sidebar quick delete button
  const handleConfirmSingleDelete = async () => {
    if (!singleDeleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deleteConversation(singleDeleteTarget);
      if (selectedJid && isSameContact(singleDeleteTarget, selectedJid)) {
        setSelectedJid(null);
        selectedJidRef.current = null;
        setMessages([]);
      }
      setSingleDeleteTarget(null);
      await loadConversations();
      await loadLabels();
    } catch (err) {
      alert(`Failed to delete conversation: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete an individual chat message
  const handleDeleteChatMessage = async (msgId) => {
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      await api.deleteChatMessage(msgId);
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      await loadConversations();
    } catch (err) {
      alert(`Failed to delete message: ${err.message}`);
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    const info = getContactDisplay(c);
    const phone = info.rawNumber;
    const resolved = info.resolvedPhone;
    const name = (c.contact_name || c.push_name || info.name).toLowerCase();
    const query = searchQuery.toLowerCase().trim();

    const matchesSearch = !query || phone.includes(query) || resolved.includes(query) || name.includes(query);
    if (!matchesSearch) return false;

    if (filterTab === 'needs_human') return c.human_agent_requested === 1;
    if (filterTab === 'bot_paused') return c.bot_disabled === 1;
    if (filterTab === 'bot_active') return c.bot_disabled === 0;

    // Custom label tab filtering
    const isCustomLabel = labels.some((l) => l.name === filterTab);
    if (isCustomLabel) {
      return Array.isArray(c.labels) && c.labels.includes(filterTab);
    }

    return true;
  });

  const selectedConversation = conversations.find((c) => isSameContact(c, selectedJid));
  const selectedContactInfo = getContactDisplay(selectedConversation || (selectedJid ? { contact_jid: selectedJid } : null));

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Left Column: Conversations List */}
      <aside className="w-80 md:w-96 flex flex-col border-r border-slate-800 bg-slate-900/60 select-none">
        {/* Header & Search */}
        <div className="p-3.5 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>Live Chat Inbox</span>
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleSound}
                className={`p-1.5 rounded-lg border transition ${
                  soundOn
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/60'
                    : 'bg-slate-800/80 border-slate-700 text-slate-500 hover:text-slate-300'
                }`}
                title={soundOn ? 'Audio Alerts: ON (Click to mute)' : 'Audio Alerts: MUTED (Click to unmute)'}
              >
                {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => {
                  loadConversations();
                  loadLabels();
                }}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition"
                title="Refresh conversations"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by phone, name, or message..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          {/* Filter Pills with Dynamic Custom Label Tabs & + New Label */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-1 scrollbar-none">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 ${
                filterTab === 'all'
                  ? 'bg-slate-800 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              All ({conversations.length})
            </button>
            <button
              onClick={() => setFilterTab('needs_human')}
              className={`px-2 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
                filterTab === 'needs_human'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-500/50 shadow-sm'
                  : 'text-amber-400/80 hover:text-amber-300 hover:bg-slate-800/40'
              }`}
            >
              <span>🚨 Needs Human</span>
              <span className="text-[9px] bg-amber-500/20 px-1 rounded-full font-mono">
                {conversations.filter((c) => c.human_agent_requested === 1).length}
              </span>
            </button>
            <button
              onClick={() => setFilterTab('bot_paused')}
              className={`px-2 py-1 rounded-lg font-semibold transition shrink-0 ${
                filterTab === 'bot_paused'
                  ? 'bg-rose-950/70 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              Paused
            </button>
            <button
              onClick={() => setFilterTab('bot_active')}
              className={`px-2 py-1 rounded-lg font-semibold transition shrink-0 ${
                filterTab === 'bot_active'
                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              Active
            </button>

            {/* Dynamic Custom Label Tabs */}
            {labels.map((lbl) => {
              const isSelected = filterTab === lbl.name;
              const matchCount = conversations.filter(
                (c) => Array.isArray(c.labels) && c.labels.includes(lbl.name)
              ).length;

              return (
                <button
                  key={lbl.id || lbl.name}
                  onClick={() => setFilterTab(lbl.name)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-slate-800 text-slate-100 border shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                  style={isSelected ? { borderColor: `${lbl.color || '#10b981'}80` } : {}}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: lbl.color || '#10b981' }}
                  />
                  <span>{lbl.name}</span>
                  {matchCount > 0 && (
                    <span
                      className="text-[9px] px-1 py-0.2 rounded-full font-mono"
                      style={{
                        backgroundColor: `${lbl.color || '#10b981'}25`,
                        color: lbl.color || '#10b981'
                      }}
                    >
                      {matchCount}
                    </span>
                  )}
                </button>
              );
            })}

            {/* + New Label Button */}
            <button
              onClick={() => setIsCreatingLabel(true)}
              className="px-2 py-1 rounded-lg font-semibold text-slate-400 hover:text-emerald-300 hover:bg-slate-800/60 border border-dashed border-slate-700 hover:border-emerald-500/50 transition shrink-0 flex items-center gap-1"
              title="Create a new custom label & tab"
            >
              <Plus className="w-3 h-3 text-emerald-400" />
              <span>New Label</span>
            </button>
          </div>
        </div>

        {/* Bulk Selection / Action Toolbar */}
        {filteredConversations.length > 0 && (
          <div className="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
            <label
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-slate-100 font-medium"
            >
              <input
                type="checkbox"
                checked={filteredConversations.length > 0 && selectedJidsForDelete.size === filteredConversations.length}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = selectedJidsForDelete.size > 0 && selectedJidsForDelete.size < filteredConversations.length;
                  }
                }}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-emerald-500"
              />
              <span className="text-[11px]">
                {selectedJidsForDelete.size > 0 
                  ? `${selectedJidsForDelete.size} of ${filteredConversations.length} selected` 
                  : `Select All (${filteredConversations.length})`}
              </span>
            </label>

            {selectedJidsForDelete.size > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsConfirmingBulkDelete(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-300 hover:text-rose-200 text-[11px] font-semibold transition active:scale-95 shadow"
                  title="Delete all selected conversations"
                >
                  <Trash2 className="w-3 h-3 text-rose-400" />
                  <span>Delete ({selectedJidsForDelete.size})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedJidsForDelete(new Set())}
                  className="px-2 py-1 rounded-lg text-slate-400 hover:text-slate-200 text-[11px] hover:bg-slate-800 transition"
                  title="Clear selection"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        {/* Conversation List Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-12 px-4 text-slate-500 text-xs space-y-1">
              <MessageSquare className="w-8 h-8 mx-auto text-slate-700" />
              <p className="font-semibold text-slate-400">No conversations found</p>
              <p className="text-[11px]">
                {filterTab !== 'all'
                  ? `No conversations matching tab "${filterTab}".`
                  : 'Incoming WhatsApp chats will automatically appear here in real-time.'}
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const contactInfo = getContactDisplay(conv);
              const isSelected = isSameContact(conv, selectedJid);
              const isHumanRequested = conv.human_agent_requested === 1;
              const isBotDisabled = conv.bot_disabled === 1;

              return (
                <div
                  key={conv.contact_jid}
                  onClick={() => {
                    selectedJidRef.current = conv.contact_jid;
                    setSelectedJid(conv.contact_jid);
                    setActiveContactStatus({
                      bot_disabled: conv.bot_disabled,
                      human_agent_requested: conv.human_agent_requested
                    });
                  }}
                  className={`p-3.5 cursor-pointer transition flex items-start gap-2.5 relative group ${
                    isSelected
                      ? 'bg-slate-800/90 border-l-4 border-emerald-500'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  {/* Select Checkbox (Individual Choice) */}
                  <label
                    onClick={(e) => e.stopPropagation()}
                    className="pt-1.5 shrink-0 cursor-pointer p-0.5 rounded hover:bg-slate-700/50 transition flex items-center justify-center"
                    title="Select this chat to delete"
                  >
                    <input
                      type="checkbox"
                      checked={selectedJidsForDelete.has(conv.contact_jid)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelectChat(conv.contact_jid, e.target.checked);
                      }}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-emerald-500"
                    />
                  </label>

                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-slate-800 to-slate-700 border border-slate-700 flex items-center justify-center text-slate-200 font-bold text-xs shrink-0 shadow">
                    {contactInfo.avatarChar}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="text-xs font-bold text-slate-100 truncate">
                          {contactInfo.name}
                        </h3>
                        {contactInfo.isLid && !contactInfo.resolvedPhone && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-950/70 border border-indigo-500/40 text-indigo-300 font-mono shrink-0">
                            LID
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-slate-500 font-mono">
                          {conv.last_timestamp
                            ? new Date(conv.last_timestamp.endsWith('Z') ? conv.last_timestamp : conv.last_timestamp + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </span>
                        {/* Hover Quick Delete Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSingleDeleteTarget(conv.contact_jid);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-950/80 text-slate-500 hover:text-rose-400 transition"
                          title="Delete this conversation"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                      {conv.last_direction === 'outgoing' && (
                        <Check className="w-3 h-3 text-emerald-400 shrink-0 inline" />
                      )}
                      <span className="truncate">{conv.last_message || 'Media or attachment'}</span>
                    </p>

                    {/* Status Pills & Assigned Labels */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {isHumanRequested && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-950 border border-amber-500/60 text-amber-300 flex items-center gap-1 animate-pulse">
                          <Headphones className="w-2.5 h-2.5" />
                          Needs Human
                        </span>
                      )}
                      {isBotDisabled ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-300">
                          Bot Paused
                        </span>
                      ) : (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
                          Bot Active
                        </span>
                      )}

                      {/* Display Assigned Labels on List Item */}
                      {Array.isArray(conv.labels) && conv.labels.map((lbl) => {
                        const lObj = labels.find((l) => l.name === lbl);
                        const color = lObj?.color || '#10b981';
                        return (
                          <span
                            key={lbl}
                            style={{
                              borderColor: `${color}40`,
                              color: color,
                              backgroundColor: `${color}15`
                            }}
                            className="text-[9px] font-semibold px-1.5 py-0.2 rounded border flex items-center gap-1"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                            <span>{lbl}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Right Column: Chat Window */}
      <section className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden relative">
        {selectedJid ? (
          <>
            {/* Chat Header */}
            <div className="p-3.5 px-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 shadow-md shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold text-sm shadow shrink-0">
                  {selectedContactInfo.avatarChar}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-100 whitespace-nowrap">{selectedContactInfo.name}</h3>
                    {selectedContactInfo.isLid && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-950 border border-indigo-500/50 text-indigo-300 font-mono shrink-0">
                        WhatsApp LID
                      </span>
                    )}

                    {/* Active Labels Badges with quick-remove */}
                    {Array.isArray(selectedConversation?.labels) && selectedConversation.labels.map((lbl) => {
                      const lObj = labels.find((l) => l.name === lbl);
                      const color = lObj?.color || '#10b981';
                      return (
                        <span
                          key={lbl}
                          style={{
                            borderColor: `${color}60`,
                            color: color,
                            backgroundColor: `${color}20`
                          }}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1.5 shrink-0"
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                          <span>{lbl}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleLabel(lbl);
                            }}
                            className="hover:opacity-80 transition ml-0.5"
                            title={`Remove ${lbl} tag`}
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      );
                    })}

                    {/* Tag Button & Dropdown */}
                    <div className="relative inline-block" ref={tagDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsTaggingOpen(!isTaggingOpen)}
                        className="text-[11px] bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-emerald-300 px-2 py-0.5 rounded-lg border border-slate-700 flex items-center gap-1 transition shrink-0"
                        title="Add or remove labels for this contact"
                      >
                        <Tag className="w-3 h-3 text-emerald-400" />
                        <span>Tag</span>
                      </button>

                      {isTaggingOpen && (
                        <div className="absolute left-0 top-full mt-1.5 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                          <div className="text-[11px] font-bold text-slate-400 px-2 py-1 border-b border-slate-800 flex items-center justify-between">
                            <span>Assign Labels</span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsTaggingOpen(false);
                                setIsCreatingLabel(true);
                              }}
                              className="text-emerald-400 hover:text-emerald-300 text-[10px] flex items-center gap-0.5"
                            >
                              <Plus className="w-3 h-3" />
                              <span>New</span>
                            </button>
                          </div>
                          <div className="max-h-48 overflow-y-auto py-1 space-y-0.5">
                            {labels.length === 0 ? (
                              <div className="text-[11px] text-slate-500 px-2 py-2 text-center">
                                No labels created yet.
                              </div>
                            ) : (
                              labels.map((lbl) => {
                                const isTagged = Array.isArray(selectedConversation?.labels) && selectedConversation.labels.includes(lbl.name);
                                return (
                                  <button
                                    key={lbl.id || lbl.name}
                                    type="button"
                                    onClick={() => handleToggleLabel(lbl.name)}
                                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center justify-between transition ${
                                      isTagged
                                        ? 'bg-slate-800 text-slate-100 font-semibold'
                                        : 'text-slate-300 hover:bg-slate-800/60'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <span
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: lbl.color || '#10b981' }}
                                      />
                                      <span className="truncate">{lbl.name}</span>
                                    </div>
                                    {isTagged && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                    <span>{selectedContactInfo.subtitle || (selectedContactInfo.isLid ? `LID: ${selectedContactInfo.rawNumber}` : `+${selectedContactInfo.rawNumber}`)}</span>
                    <button
                      onClick={() => openEditModal(selectedConversation || { contact_jid: selectedJid })}
                      className="text-slate-400 hover:text-emerald-400 transition ml-1 flex items-center gap-1 text-[11px] bg-slate-800/80 hover:bg-slate-700/80 px-1.5 py-0.5 rounded border border-slate-700 font-sans shrink-0"
                      title="Edit customer name or mobile number"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Controls: Bot Switch, Resolve Flag & Delete Chat */}
              <div className="flex items-center gap-2 shrink-0">
                {activeContactStatus.human_agent_requested === 1 && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-950 border border-amber-500 text-amber-300 flex items-center gap-1 shrink-0 animate-pulse">
                    <AlertCircle className="w-3 h-3 text-amber-400" />
                    Human Takeover Requested
                  </span>
                )}
                {activeContactStatus.human_agent_requested === 1 && (
                  <button
                    onClick={handleResolveHumanRequest}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-amber-500/40 transition active:scale-95 shadow shrink-0"
                    title="Mark human escalation as resolved"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Resolve Flag</span>
                  </button>
                )}

                {/* Prominent Bot Toggle Switch */}
                <button
                  onClick={handleToggleBot}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold border transition shadow-lg active:scale-95 ${
                    activeContactStatus.bot_disabled
                      ? 'bg-rose-950/80 hover:bg-rose-900 border-rose-500/60 text-rose-200'
                      : 'bg-emerald-950/80 hover:bg-emerald-900 border-emerald-500/60 text-emerald-200'
                  }`}
                  title={
                    activeContactStatus.bot_disabled
                      ? 'Click to turn automated bot back ON for this contact'
                      : 'Click to turn automated bot OFF (manual human takeover)'
                  }
                >
                  {activeContactStatus.bot_disabled ? (
                    <>
                      <ToggleLeft className="w-4 h-4 text-rose-400" />
                      <span>Bot is Paused</span>
                    </>
                  ) : (
                    <>
                      <ToggleRight className="w-4 h-4 text-emerald-400" />
                      <span>Bot is Active</span>
                    </>
                  )}
                </button>

                {/* Provision to Delete Chat */}
                <button
                  onClick={() => setIsConfirmingDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 text-xs font-semibold border border-slate-700 hover:border-rose-500/50 transition active:scale-95 shadow shrink-0"
                  title="Delete chat conversation with this contact"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden md:inline">Delete Chat</span>
                </button>
              </div>
            </div>

            {/* Inactive Bot Takeover Banner */}
            {activeContactStatus.bot_disabled ? (
              <div className="bg-amber-950/40 border-b border-amber-500/30 px-5 py-2 flex items-center justify-between text-xs text-amber-300 shrink-0">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Human Takeover Active:</strong> Automated flows and AI replies are paused for this contact. You are chatting in 100% manual operator mode.
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-950/30 border-b border-emerald-500/20 px-5 py-2 flex items-center justify-between text-xs text-emerald-300 shrink-0">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Bot Automation Active:</strong> Inbound messages from this contact trigger interactive flows or AI. Toggle the switch above to take over.
                  </span>
                </div>
              </div>
            )}

            {/* Message Area */}
            <div
              ref={chatScrollContainerRef}
              className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 bg-slate-950"
            >
              {isLoadingMessages ? (
                <div className="text-center py-16 text-slate-500 text-xs">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <span>Loading conversation history...</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-20 text-slate-500 text-xs space-y-1">
                  <MessageSquare className="w-8 h-8 mx-auto text-slate-700" />
                  <p className="font-semibold text-slate-400">No messages yet with this contact</p>
                  <p className="text-[11px]">Type below to send the first message directly to their WhatsApp.</p>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isIncoming = msg.direction === 'incoming';
                  const timeFormatted = msg.timestamp
                    ? new Date(msg.timestamp.endsWith('Z') ? msg.timestamp : msg.timestamp + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '';

                  return (
                    <div
                      key={msg.id || index}
                      className={`flex flex-col group ${isIncoming ? 'items-start' : 'items-end'}`}
                    >
                      <div className="flex items-end gap-1.5 max-w-[85%] sm:max-w-[70%]">
                        {!isIncoming && msg.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteChatMessage(msg.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition shrink-0"
                            title="Delete this message"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                        <div
                          className={`rounded-2xl px-4 py-2.5 shadow-md text-xs leading-relaxed font-sans whitespace-pre-wrap break-words ${
                            isIncoming
                              ? 'bg-slate-800 text-slate-100 rounded-tl-sm border border-slate-700/60'
                              : 'bg-emerald-700 text-white rounded-tr-sm shadow-emerald-900/30'
                          }`}
                        >
                          {msg.message_text?.startsWith('🎤 [Voice Note]') && (
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 mb-1 pb-1 border-b border-slate-700/50">
                              <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                              <span>Voice Note (Transcribed)</span>
                            </div>
                          )}
                          {msg.message_text?.startsWith('🎵 [Voice Reply]') && (
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-200 mb-1 pb-1 border-b border-emerald-600/50">
                              <Volume2 className="w-3.5 h-3.5 text-emerald-200" />
                              <span>AI Voice Note Reply</span>
                            </div>
                          )}
                          {msg.message_text?.includes('📎 [Attachment:') && (
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-200 mb-1 pb-1 border-b border-emerald-600/50">
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>Media / Document Attachment</span>
                            </div>
                          )}
                          {msg.message_text?.replace(/^(?:🎤\s*\[Voice Note\]:?\s*|🎵\s*\[Voice Reply\]:?\s*)/i, '') || msg.message_text}
                          <div
                            className={`flex items-center justify-end gap-1 text-[9px] mt-1 ${
                              isIncoming ? 'text-slate-400' : 'text-emerald-200'
                            }`}
                          >
                            <span>{timeFormatted}</span>
                            {!isIncoming && <CheckCheck className="w-3 h-3 text-emerald-200" />}
                          </div>
                        </div>
                        {isIncoming && msg.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteChatMessage(msg.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition shrink-0"
                            title="Delete this message"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Attachment preview banner */}
            {attachment && (
              <div className="px-5 py-2 bg-slate-950/95 border-t border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Paperclip className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-slate-200 font-mono text-[11px] truncate">
                    {attachment.fileName || attachment.filePath.split(/[/\\]/).pop()}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-slate-500 px-1.5 py-0.5 bg-slate-800 rounded">
                    {attachment.filePath.split('.').pop()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                  title="Remove attachment"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Chat Composer */}
            <form
              onSubmit={handleSendMessage}
              className="p-3.5 px-5 bg-slate-900 border-t border-slate-800 flex items-center gap-2.5 shrink-0"
            >
              <button
                type="button"
                onClick={handleAttachFile}
                className="w-10 h-10 rounded-2xl bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-emerald-400 flex items-center justify-center transition active:scale-95 shrink-0 cursor-pointer"
                title="Attach file (PNG, JPG, JSON, PDF, CSV, XLSX, etc.)"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <textarea
                rows={1}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  attachment
                    ? `Add caption (optional) & press Enter to dispatch attachment...`
                    : `Type a message to ${selectedContactInfo.name}... (Press Enter to send)`
                }
                className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none font-sans leading-relaxed"
              />

              <button
                type="submit"
                disabled={(!inputText.trim() && !attachment) || isSending}
                className="h-10 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-600/30 active:scale-95 shrink-0 cursor-pointer"
              >
                {isSending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Send</span>
                  </>
                )}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 shadow-xl">
              <MessageSquare className="w-8 h-8 text-emerald-500/50" />
            </div>
            <h3 className="text-base font-extrabold text-slate-300">Live 2-Way Chat Inbox</h3>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Select any customer conversation on the left to review chat history, chat in real-time, or toggle automated bot replies on/off.
            </p>
          </div>
        )}
      </section>

      {/* Delete Conversation Confirmation Modal */}
      {isConfirmingDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-400 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-500/40 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Delete Chat Conversation</h3>
                <p className="text-[11px] text-slate-400">Permanently delete message logs and records</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete the complete conversation history with{' '}
              <strong className="text-white">{selectedContactInfo.name}</strong>?
            </p>
            <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-xl text-[11px] text-rose-300 leading-relaxed">
              ⚠️ This will permanently erase all message logs, active flow sessions, and tags for this contact from the database. This action cannot be reversed.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConversation}
                disabled={isDeleting}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Conversation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Conversations Confirmation Modal */}
      {isConfirmingBulkDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-950/80 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-100">Delete {selectedJidsForDelete.size} Selected Conversations?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                This will permanently remove all message logs, automated bot sessions, and label assignments for the {selectedJidsForDelete.size} selected chats. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmingBulkDelete(false)}
                disabled={isBulkDeleting}
                className="flex-1 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="flex-1 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-900/30 transition flex items-center justify-center gap-2"
              >
                {isBulkDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete {selectedJidsForDelete.size} Chats</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Conversation Quick Delete Confirmation Modal */}
      {singleDeleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-950/80 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-100">Delete Conversation?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Are you sure you want to permanently delete all messages and history with this contact? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSingleDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSingleDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-900/30 transition flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete Chat</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Label & Manage Labels Modal */}
      {isCreatingLabel && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Create New Label / Tab</h3>
                  <p className="text-[11px] text-slate-400">Labels organize chats and appear as dynamic filter tabs</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreatingLabel(false)}
                className="text-slate-400 hover:text-slate-200 transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLabel} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Label Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. VIP, Hot Lead, Billing, Order Done..."
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Label Color
                </label>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setNewLabelColor(c.value)}
                      style={{ backgroundColor: c.value }}
                      className={`w-6 h-6 rounded-full transition transform active:scale-95 flex items-center justify-center shadow ${
                        newLabelColor === c.value ? 'ring-2 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                      }`}
                      title={c.name}
                    >
                      {newLabelColor === c.value && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 text-[11px]">Preview:</span>
                  <span
                    style={{
                      borderColor: `${newLabelColor}60`,
                      color: newLabelColor,
                      backgroundColor: `${newLabelColor}20`
                    }}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: newLabelColor }} />
                    <span>{newLabelName.trim() || 'Label Preview'}</span>
                  </span>
                </div>
              </div>

              {/* Existing Labels Quick Management */}
              {labels.length > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                    Existing Labels
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {labels.map((l) => (
                      <span
                        key={l.id || l.name}
                        style={{
                          borderColor: `${l.color || '#10b981'}50`,
                          color: l.color || '#10b981',
                          backgroundColor: `${l.color || '#10b981'}15`
                        }}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-lg border flex items-center gap-1.5"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: l.color || '#10b981' }} />
                        <span>{l.name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteLabel(l.name)}
                          className="hover:text-rose-400 hover:opacity-100 opacity-60 transition ml-1"
                          title={`Delete label "${l.name}"`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreatingLabel(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newLabelName.trim() || isSavingLabel}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition shadow"
                >
                  {isSavingLabel ? 'Creating...' : 'Create Label & Add Tab'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer / Link Phone Modal */}
      {isEditingContact && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">Customer Details & Mobile Number</h3>
              </div>
              <button
                onClick={() => setIsEditingContact(false)}
                className="text-slate-400 hover:text-slate-200 transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sarat Chandra"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Real Mobile Number (Country code + Phone, e.g. 917011847629)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 917011847629"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  WhatsApp Multi-Device often uses internal LIDs for privacy. Entering the phone number links all CRM notes and past campaign records to this customer.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditingContact(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingContact}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition shadow"
                >
                  {isSavingContact ? 'Saving...' : 'Save Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveChatInbox;
