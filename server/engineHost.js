import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestWaWebVersion,
    Browsers,
    downloadMediaMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sessionsDao, chatLogsDao, settingsDao, conversationStatusDao, lidMappingsDao, contactsDao, flowSessionsDao } from './db.js';
import { standardizePhone } from './phoneUtils.js';
import { voiceService } from './voiceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSIONS_DIR = process.env.CRM_USER_DATA_DIR
    ? path.join(process.env.CRM_USER_DATA_DIR, 'sessions')
    : path.join(__dirname, '..', 'sessions');

if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function extractMessageText(msg) {
    if (!msg?.message) return '';
    let m = msg.message;
    // Recursively unwrap ephemeral, viewOnce, or other wrapper messages
    while (
        m.ephemeralMessage?.message ||
        m.viewOnceMessage?.message ||
        m.viewOnceMessageV2?.message ||
        m.documentWithCaptionMessage?.message
    ) {
        m = (
            m.ephemeralMessage?.message ||
            m.viewOnceMessage?.message ||
            m.viewOnceMessageV2?.message ||
            m.documentWithCaptionMessage?.message
        );
    }
    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.documentMessage?.caption ||
        m.buttonsResponseMessage?.selectedButtonId ||
        m.listResponseMessage?.singleSelectReply?.selectedRowId ||
        m.templateButtonReplyMessage?.selectedId ||
        m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
        (m.audioMessage ? (m.audioMessage.ptt ? '🎤 [Voice Note]' : '🎵 [Audio Message]') : '') ||
        (m.imageMessage ? '📷 [Photo]' : '') ||
        (m.videoMessage ? '🎥 [Video]' : '') ||
        (m.documentMessage ? `📄 [Document: ${m.documentMessage.fileName || 'file'}]` : '') ||
        (m.stickerMessage ? '🎨 [Sticker]' : '') ||
        (m.contactMessage || m.contactsArrayMessage ? '👤 [Contact Card]' : '') ||
        (m.locationMessage || m.liveLocationMessage ? '📍 [Location]' : '') ||
        ''
    ).trim();
}

// In-memory rolling message store for Signal protocol encryption retry receipts
// Resolves and prevents "Waiting for this message. This may take a while." errors
const messageStore = new Map();
const MAX_STORED_MESSAGES = 3000;

function cacheMessage(id, message) {
    if (!id || !message) return;
    if (messageStore.size >= MAX_STORED_MESSAGES) {
        const oldestKey = messageStore.keys().next().value;
        messageStore.delete(oldestKey);
    }
    messageStore.set(id, message);
}

// Global deduplication trackers to prevent double-processing and duplicate UI messages
const sentMessageIds = new Set();
const processedMessageIds = new Set();
const MAX_TRACKED_IDS = 5000;

function trackId(set, id) {
    if (!id) return;
    if (set.size >= MAX_TRACKED_IDS) {
        const oldest = set.values().next().value;
        set.delete(oldest);
    }
    set.add(id);
}

export class EngineHost {
    constructor() {
        this.sessions = new Map(); // sessionId -> { sock, qr, status, phoneNumber }
        this.flowEngine = null;
        this.aiEngine = null;
        this.voiceService = voiceService;
        this.onEvent = () => {};
    }

    setEngines(flowEngine, aiEngine, customVoiceService = null) {
        this.flowEngine = flowEngine;
        this.aiEngine = aiEngine;
        if (customVoiceService) this.voiceService = customVoiceService;
        if (this.flowEngine && typeof this.flowEngine.setBroadcaster === 'function') {
            this.flowEngine.setBroadcaster((event) => this.broadcast(event));
        }
    }

    setEventListener(callback) {
        this.onEvent = callback;
        if (this.flowEngine && typeof this.flowEngine.setBroadcaster === 'function') {
            this.flowEngine.setBroadcaster((event) => this.broadcast(event));
        }
    }

    broadcast(event) {
        if (typeof this.onEvent === 'function') {
            this.onEvent(event);
        }
        if (event?.type === 'human_handover_requested') {
            this.notifyOwnerOnHandover(
                event.sessionId || 'default',
                event.chatJid,
                event.phone,
                event.name,
                event.lastMessage,
                event.reason
            ).catch(err => {
                console.error('[Handover Alert Error]:', err.message);
            });
        }
    }

    getSession(sessionId = 'default') {
        return this.sessions.get(sessionId);
    }

    async startSession(sessionId = 'default', sessionName = 'Primary WhatsApp') {
        if (this.sessions.has(sessionId)) {
            const current = this.sessions.get(sessionId);
            if (current.status === 'connected') {
                return { sessionId, status: 'connected', qr: null };
            }
        }

        const sessionFolder = path.join(SESSIONS_DIR, sessionId);
        if (!fs.existsSync(sessionFolder)) {
            fs.mkdirSync(sessionFolder, { recursive: true });
        }

        const sessionData = {
            sock: null,
            qr: null,
            status: 'connecting',
            phoneNumber: null,
            name: sessionName,
            isTerminated: false,
            reconnectTimer: null
        };
        this.sessions.set(sessionId, sessionData);
        sessionsDao.upsert(sessionId, sessionName, 'connecting');
        this.broadcast({ type: 'session_update', sessionId, status: 'connecting' });

        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
            const { version } = await fetchLatestWaWebVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

            const sock = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: 'silent' }),
                browser: Browsers.windows('Desktop'),
                markOnlineOnConnect: true,
                syncFullHistory: false,
                printQRInTerminal: false,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 90000,
                generateHighQualityLinkPreview: true,
                getMessage: async (key) => {
                    if (!key?.id) return undefined;
                    return messageStore.get(key.id) || undefined;
                }
            });

            sessionData.sock = sock;

            sock.ev.on('creds.update', saveCreds);

            // Listen for WhatsApp LID to Phone number share events
            sock.ev.on('chats.phoneNumberShare', ({ lid, jid }) => {
                if (lid && jid) {
                    console.log(`[LID Resolution] WhatsApp shared phone number: ${lid} -> ${jid}`);
                    const phone = jid.split('@')[0];
                    lidMappingsDao.upsert(lid, jid, phone, null);
                }
            });

            // Listen for contact sync events to map LIDs and contact names
            sock.ev.on('contacts.upsert', (contacts) => {
                for (const c of contacts) {
                    if (c?.lid) {
                        const phone = c.id ? c.id.split('@')[0] : null;
                        const phoneJid = c.id ? (c.id.includes('@') ? c.id : `${c.id}@s.whatsapp.net`) : null;
                        const name = c.name || c.notify || null;
                        lidMappingsDao.upsert(c.lid, phoneJid, phone, name);
                    }
                }
            });

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    try {
                        const qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
                        sessionData.qr = qrDataUrl;
                        sessionData.status = 'qr_ready';
                        sessionsDao.upsert(sessionId, sessionName, 'qr_ready');
                        this.broadcast({
                            type: 'qr',
                            sessionId,
                            qr: qrDataUrl,
                            status: 'qr_ready'
                        });
                    } catch (qrErr) {
                        console.error('Failed to generate QR data URL:', qrErr);
                    }
                }

                if (connection === 'open') {
                    const phone = sock.user?.id ? sock.user.id.split(':')[0] : 'Unknown';
                    sessionData.status = 'connected';
                    sessionData.phoneNumber = phone;
                    sessionData.qr = null;
                    sessionsDao.upsert(sessionId, sessionName, 'connected', phone);
                    this.broadcast({
                        type: 'connection_open',
                        sessionId,
                        phoneNumber: phone,
                        status: 'connected'
                    });
                    console.log(`WhatsApp Session [${sessionId}] connected as ${phone}!`);
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const isLoggedOut = statusCode === DisconnectReason.loggedOut;
                    const isConflict = 
                        lastDisconnect?.error?.node?.content?.[0]?.attrs?.type === 'replaced' ||
                        lastDisconnect?.error?.message?.includes('conflict') ||
                        statusCode === 440;

                    sessionData.status = 'disconnected';
                    sessionData.qr = null;
                    sessionsDao.upsert(sessionId, sessionName, 'disconnected');
                    this.broadcast({
                        type: 'connection_close',
                        sessionId,
                        status: 'disconnected',
                        loggedOut: isLoggedOut
                    });

                    if (sessionData.isTerminated) {
                        console.log(`WhatsApp Session [${sessionId}] closed (terminated/deleted by user).`);
                        return;
                    }

                    if (isLoggedOut) {
                        console.log(`WhatsApp Session [${sessionId}] logged out.`);
                        sessionData.isTerminated = true;
                        try {
                            fs.rmSync(sessionFolder, { recursive: true, force: true });
                        } catch (e) {}
                        this.sessions.delete(sessionId);
                        sessionsDao.delete(sessionId);
                        this.broadcast({ type: 'session_deleted', sessionId });
                        return;
                    }

                    if (isConflict) {
                        console.warn(`[WhatsApp Conflict] Session [${sessionId}] was disconnected because another client or WhatsApp Web connected. Pausing auto-reconnect.`);
                        return;
                    }

                    console.log(`WhatsApp Session [${sessionId}] connection closed. Attempting reconnect in 5s...`);
                    if (sessionData.reconnectTimer) clearTimeout(sessionData.reconnectTimer);
                    sessionData.reconnectTimer = setTimeout(() => {
                        if (!sessionData.isTerminated) {
                            this.startSession(sessionId, sessionName);
                        }
                    }, 5000);
                }
            });

            sock.ev.on('messages.upsert', async ({ messages, type }) => {
                for (const msg of messages) {
                    if (msg?.key?.id && msg?.message) {
                        cacheMessage(msg.key.id, msg.message);
                    }
                }

                for (const msg of messages) {
                    if (msg.key.fromMe) {
                        const msgId = msg.key?.id;
                        // If this message was dispatched by our server (via sendText / quick dispatch / bot reply),
                        // it was already logged and broadcasted. Skip to prevent duplicate bubble!
                        if (msgId && sentMessageIds.has(msgId)) {
                            continue;
                        }
                        if (msgId) {
                            trackId(sentMessageIds, msgId);
                        }

                        const toJid = msg.key.remoteJid;
                        if (toJid && toJid !== 'status@broadcast' && !toJid.endsWith('@g.us') && !toJid.endsWith('@newsletter')) {
                            const text = extractMessageText(msg);
                            if (text) {
                                const logRes = chatLogsDao.log(sessionId, 'me', toJid, text, 'outgoing');
                                if (!logRes?.isDuplicate) {
                                    this.broadcast({
                                        type: 'outgoing_message',
                                        id: logRes?.id,
                                        sessionId,
                                        to: toJid,
                                        text,
                                        timestamp: new Date()
                                    });
                                }
                            }
                        }
                        continue;
                    }

                    // For incoming messages: ONLY process 'notify' events to avoid re-triggering on synced history
                    if (type !== 'notify') continue;

                    // Deduplicate incoming message IDs
                    const incomingMsgId = msg.key?.id;
                    if (incomingMsgId) {
                        if (processedMessageIds.has(incomingMsgId)) {
                            continue;
                        }
                        trackId(processedMessageIds, incomingMsgId);
                    }

                    const fromJid = msg.key.remoteJid;
                    if (!fromJid || fromJid === 'status@broadcast') continue;

                    // Skip WhatsApp groups and newsletter channels for direct 1-on-1 auto-replies
                    if (fromJid.endsWith('@g.us') || fromJid.endsWith('@newsletter')) continue;

                    let messageText = extractMessageText(msg);

                    // Detect and handle incoming audio/voice messages
                    let isVoiceNote = false;
                    let cleanTranscription = '';
                    let unwrapped = msg.message;
                    while (
                        unwrapped?.ephemeralMessage?.message ||
                        unwrapped?.viewOnceMessage?.message ||
                        unwrapped?.viewOnceMessageV2?.message ||
                        unwrapped?.documentWithCaptionMessage?.message
                    ) {
                        unwrapped = (
                            unwrapped.ephemeralMessage?.message ||
                            unwrapped.viewOnceMessage?.message ||
                            unwrapped.viewOnceMessageV2?.message ||
                            unwrapped.documentWithCaptionMessage?.message
                        );
                    }

                    const audioMsg = unwrapped?.audioMessage;
                    if (audioMsg) {
                        isVoiceNote = true;
                        console.log(`[WhatsApp Inbound Voice] Audio message received from ${fromJid} (ptt: ${Boolean(audioMsg.ptt)}, seconds: ${audioMsg.seconds || 0})`);

                        try {
                            const audioBuffer = await downloadMediaMessage(
                                msg,
                                'buffer',
                                {},
                                {
                                    logger: pino({ level: 'silent' }),
                                    reuploadRequest: sock.updateMediaMessage
                                }
                            );
                            if (audioBuffer && audioBuffer.length > 0 && this.voiceService) {
                                const rawMime = audioMsg.mimetype || 'audio/ogg';
                                const transcription = await this.voiceService.transcribeAudio(audioBuffer, rawMime);
                                if (transcription && transcription.trim()) {
                                    cleanTranscription = transcription.trim();
                                    console.log(`[WhatsApp Voice STT] Transcribed: "${cleanTranscription}"`);
                                    messageText = `🎤 [Voice Note]: ${cleanTranscription}`;
                                }
                            }
                        } catch (sttErr) {
                            console.warn(`[WhatsApp Voice STT] Audio processing failed for ${fromJid}:`, sttErr.message);
                        }
                    }

                    if (!messageText) {
                        const keys = Object.keys(msg.message || {});
                        if (keys.length > 0) {
                            console.log(`[messages.upsert] Message from ${fromJid} without extractable text. Keys:`, keys);
                        }
                        continue;
                    }

                    // Track pushName & resolve LID if available
                    const pushName = msg.pushName || '';
                    const senderPn = msg.key?.senderPn || msg.key?.participantPn;

                    if (fromJid.endsWith('@lid')) {
                        let resolvedPhoneNum = null;
                        let resolvedPhoneJid = null;
                        if (senderPn) {
                            resolvedPhoneJid = senderPn.endsWith('@s.whatsapp.net') ? senderPn : `${senderPn.split('@')[0]}@s.whatsapp.net`;
                            resolvedPhoneNum = resolvedPhoneJid.split('@')[0];
                        }
                        lidMappingsDao.upsert(fromJid, resolvedPhoneJid, resolvedPhoneNum, pushName || null);
                    } else if (pushName && fromJid.endsWith('@s.whatsapp.net')) {
                        const phone = fromJid.split('@')[0];
                        const existingContact = contactsDao.getByPhone(phone);
                        if (!existingContact) {
                            try { contactsDao.create({ phone, name: pushName }); } catch (_) {}
                        }
                    }

                    const senderPhone = fromJid.split('@')[0];
                    console.log(`[WhatsApp Inbound] Received from ${fromJid} (${senderPhone}${pushName ? ` - ${pushName}` : ''}): "${messageText}"`);

                    // 1. Log incoming message (with deduplication check)
                    const logRes = chatLogsDao.log(sessionId, fromJid, 'me', messageText, 'incoming');
                    if (!logRes?.isDuplicate) {
                        this.broadcast({
                            type: 'incoming_message',
                            id: logRes?.id,
                            sessionId,
                            from: fromJid,
                            senderPhone,
                            text: messageText,
                            timestamp: new Date()
                        });
                    }

                    // 1b. Check if bot is disabled for this specific customer (Human Agent Takeover)
                    if (conversationStatusDao.isBotDisabled(fromJid)) {
                        console.log(`[Human Agent Takeover] Bot automation is toggled OFF for ${fromJid}. Message forwarded to Live Chat Inbox only.`);
                        continue;
                    }

                    // 2. Check Auto-Responder Configuration Mode
                    const allSettings = settingsDao.getAll();
                    let responderMode = allSettings.auto_responder_mode;
                    if (!responderMode) {
                        responderMode = (allSettings.ai_enabled_globally === 'false') ? 'disabled' : 'hybrid';
                    }

                    if (responderMode === 'disabled') {
                        console.log(`[Auto-Responder] Mode is 'disabled' (manual operator). Skipping automated replies for ${fromJid}.`);
                        continue;
                    }

                    let replyText = null;
                    const queryForBot = (cleanTranscription || messageText).trim();

                    if (responderMode === 'ai_only') {
                        // Mode: AI Only (Bypasses visual flows; all incoming messages consult AI Agent directly)
                        if (this.aiEngine) {
                            try {
                                replyText = await this.aiEngine.generateReply(queryForBot, { phone: senderPhone, isVoiceNote });
                                if (replyText) {
                                    console.log(`[AI Engine Only Generated] Reply: "${replyText.slice(0, 60)}"`);
                                }
                            } catch (aiErr) {
                                console.error('AI engine execution error:', aiErr);
                            }
                        }
                    } else if (responderMode === 'flows_only') {
                        // Mode: Flows Only (Only Visual Flows respond; AI responds ONLY if an explicit AI Handover node is hit)
                        if (this.flowEngine) {
                            try {
                                replyText = await this.flowEngine.processIncoming(fromJid, queryForBot);
                                if (replyText) {
                                    console.log(`[Flow Engine Matched] Triggered reply: "${replyText.slice(0, 60)}"`);
                                }
                            } catch (flowErr) {
                                console.error('Flow engine execution error:', flowErr);
                            }
                        }
                        // Note: Unmatched messages outside flows do NOT fall back to AI!
                    } else {
                        // Mode: 'hybrid' (Both Flows & AI Fallback - Recommended)
                        // Step A: Check Visual Flows first
                        if (this.flowEngine) {
                            try {
                                replyText = await this.flowEngine.processIncoming(fromJid, queryForBot);
                                if (replyText) {
                                    console.log(`[Flow Engine Matched] Triggered reply: "${replyText.slice(0, 60)}"`);
                                }
                            } catch (flowErr) {
                                console.error('Flow engine execution error:', flowErr);
                            }
                        }

                        // Step B: If no flow matched, fall through to AI Assistant
                        if (!replyText && this.aiEngine) {
                            try {
                                replyText = await this.aiEngine.generateReply(queryForBot, { phone: senderPhone, isVoiceNote });
                                if (replyText) {
                                    console.log(`[AI Engine Fallback Generated] Reply: "${replyText.slice(0, 60)}"`);
                                }
                            } catch (aiErr) {
                                console.error('AI engine execution error:', aiErr);
                            }
                        }
                    }

                    // 3b. Smart Direction & Confusion Guardrail Handler:
                    // If AI generated [HANDOVER_TO_HUMAN], immediately trigger Human Takeover!
                    if (replyText && replyText.includes('[HANDOVER_TO_HUMAN]')) {
                        console.log(`[AI Guardrail Handover Triggered] Confusion/human handover requested for ${fromJid}. Escalating to live agent.`);
                        
                        // Clean replyText so customer receives the polite handover notice without the internal token
                        replyText = replyText.replace(/\[HANDOVER_TO_HUMAN\]/gi, '').trim();
                        if (!replyText) {
                            replyText = '🔔 Connecting you with a live human support specialist. One moment please while our team reviews your conversation...';
                        }

                        try {
                            // Flag human takeover and disable bot for this contact in conversation_status
                            conversationStatusDao.setBotDisabled(fromJid, true, true, 'AI Guardrail: Confusion or human assistance requested');
                            
                            // If JID is a LID, also flag the mapped phone JID (if resolved)
                            if (fromJid.endsWith('@lid')) {
                                const mapping = lidMappingsDao.get(fromJid);
                                if (mapping?.phone_jid) {
                                    conversationStatusDao.setBotDisabled(mapping.phone_jid, true, true, 'AI Guardrail: Confusion or human assistance requested');
                                }
                            }

                            // Broadcast events in real-time to the Live Chat Inbox
                            this.broadcast({
                                type: 'human_handover_requested',
                                sessionId,
                                chatJid: fromJid,
                                phone: senderPhone,
                                name: pushName,
                                lastMessage: messageText,
                                reason: 'AI Guardrail: Confusion or human assistance requested'
                            });
                            this.broadcast({
                                type: 'bot_status_changed',
                                chatJid: fromJid,
                                botDisabled: true
                            });

                            // Clear any active flow session so bot doesn't resume
                            if (typeof flowSessionsDao?.clear === 'function') {
                                flowSessionsDao.clear(fromJid);
                            }
                        } catch (guardrailErr) {
                            console.error('[AI Guardrail] Error setting takeover status:', guardrailErr.message);
                        }
                    }

                    // 4. Send reply directly to fromJid as a standard WhatsApp message!
                    if (replyText) {
                        try {
                            await this.sendText(sessionId, fromJid, replyText);
                            console.log(`[WhatsApp Auto-Reply] Successfully dispatched reply to ${fromJid}: "${replyText.slice(0, 60)}..."`);
                        } catch (sendErr) {
                            console.error(`Failed to send automated reply to ${fromJid}:`, sendErr.message);
                        }
                    } else {
                        console.log(`[WhatsApp Inbound] No flow or AI rule matched for "${messageText}"`);
                    }
                }
            });

            sock.ev.on('messages.update', async (updates) => {
                for (const { key, update } of updates) {
                    if (update?.message && key?.id) {
                        cacheMessage(key.id, update.message);
                    }
                }
            });

            return { sessionId, status: 'starting' };
        } catch (err) {
            console.error(`Error initializing session ${sessionId}:`, err);
            sessionData.status = 'error';
            sessionsDao.upsert(sessionId, sessionName, 'error');
            this.broadcast({ type: 'session_error', sessionId, error: err.message });
            throw err;
        }
    }

    async simulateTyping(sessionId, toPhone, durationMs = 2000) {
        let session = this.sessions.get(sessionId || 'default');
        if (!session || !session.sock || session.status !== 'connected') {
            for (const [id, s] of this.sessions.entries()) {
                if (s.sock && s.status === 'connected') {
                    session = s;
                    sessionId = id;
                    break;
                }
            }
        }
        if (!session || !session.sock || session.status !== 'connected') return;

        let jid = (typeof toPhone === 'string' && toPhone.includes('@'))
            ? toPhone
            : `${standardizePhone(toPhone)}@s.whatsapp.net`;

        try {
            await session.sock.sendPresenceUpdate('composing', jid);
            await new Promise(r => setTimeout(r, Math.max(500, durationMs)));
            await session.sock.sendPresenceUpdate('paused', jid);
        } catch (err) {
            console.warn(`[Presence Typing] Notice for ${jid}:`, err.message);
        }
    }

    async sendText(sessionId, toPhone, message, mediaUrl = null) {
        let session = this.sessions.get(sessionId || 'default');
        if (!session || !session.sock || session.status !== 'connected') {
            for (const [id, s] of this.sessions.entries()) {
                if (s.sock && s.status === 'connected') {
                    session = s;
                    sessionId = id;
                    break;
                }
            }
        }
        if (!session || !session.sock || session.status !== 'connected') {
            throw new Error(`WhatsApp session [${sessionId || 'default'}] is not active or connected.`);
        }

        let jid;
        if (typeof toPhone === 'string' && toPhone.includes('@')) {
            jid = toPhone;
        } else {
            const cleanedPhone = standardizePhone(toPhone);
            jid = `${cleanedPhone}@s.whatsapp.net`;
        }

        let result;
        let cleanFileName = '';
        if (mediaUrl) {
            let cleanPath = typeof mediaUrl === 'string' ? mediaUrl.trim() : '';
            // Strip leading and trailing quotes (very common when copying path from Windows Explorer)
            cleanPath = cleanPath.replace(/^["']+|["']+$/g, '').trim();
            if (cleanPath.startsWith('file:///')) {
                cleanPath = decodeURIComponent(cleanPath.replace(/^file:\/\/\//, ''));
            }

            const isRemoteUrl = cleanPath.startsWith('http://') || cleanPath.startsWith('https://');

            if (!isRemoteUrl && !fs.existsSync(cleanPath)) {
                throw new Error(`Attachment file not found at: "${cleanPath}". Please verify the file path exists on your PC.`);
            }

            cleanFileName = path.basename(cleanPath);
            const ext = path.extname(cleanPath).toLowerCase();

            const mimeLookup = {
                // Images
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp',
                '.gif': 'image/gif',
                '.bmp': 'image/bmp',
                '.svg': 'image/svg+xml',
                // Data & Documents
                '.json': 'application/json',
                '.pdf': 'application/pdf',
                '.csv': 'text/csv',
                '.txt': 'text/plain',
                '.xml': 'application/xml',
                '.html': 'text/html',
                '.htm': 'text/html',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.doc': 'application/msword',
                '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                '.xls': 'application/vnd.ms-excel',
                '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                '.ppt': 'application/vnd.ms-powerpoint',
                // Archives
                '.zip': 'application/zip',
                '.rar': 'application/x-rar-compressed',
                '.7z': 'application/x-7z-compressed',
                '.tar': 'application/x-tar',
                '.gz': 'application/gzip',
                // Videos
                '.mp4': 'video/mp4',
                '.mov': 'video/quicktime',
                '.avi': 'video/x-msvideo',
                '.mkv': 'video/x-matroska',
                '.webm': 'video/webm',
                // Audio
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.ogg': 'audio/ogg',
                '.m4a': 'audio/mp4',
                '.aac': 'audio/aac'
            };

            const mimeType = mimeLookup[ext] || 'application/octet-stream';
            const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg'];
            const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
            const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];

            if (isRemoteUrl) {
                if (imageExts.includes(ext)) {
                    result = await session.sock.sendMessage(jid, {
                        image: { url: cleanPath },
                        caption: message || ''
                    });
                } else if (videoExts.includes(ext)) {
                    result = await session.sock.sendMessage(jid, {
                        video: { url: cleanPath },
                        caption: message || ''
                    });
                } else if (audioExts.includes(ext)) {
                    result = await session.sock.sendMessage(jid, {
                        audio: { url: cleanPath },
                        mimetype: mimeType,
                        ptt: false
                    });
                } else {
                    result = await session.sock.sendMessage(jid, {
                        document: { url: cleanPath },
                        mimetype: mimeType,
                        fileName: cleanFileName || 'document',
                        caption: message || ''
                    });
                }
            } else {
                const buffer = fs.readFileSync(cleanPath);

                if (imageExts.includes(ext)) {
                    result = await session.sock.sendMessage(jid, {
                        image: buffer,
                        caption: message || ''
                    });
                } else if (videoExts.includes(ext)) {
                    result = await session.sock.sendMessage(jid, {
                        video: buffer,
                        caption: message || '',
                        mimetype: mimeType
                    });
                } else if (audioExts.includes(ext)) {
                    result = await session.sock.sendMessage(jid, {
                        audio: buffer,
                        mimetype: mimeType,
                        ptt: false
                    });
                } else {
                    // Documents: JSON, PDF, CSV, TXT, DOCX, XLSX, etc.
                    result = await session.sock.sendMessage(jid, {
                        document: buffer,
                        mimetype: mimeType,
                        fileName: cleanFileName || 'document',
                        caption: message || ''
                    });
                }
            }
        } else {
            result = await session.sock.sendMessage(jid, { text: message });
        }

        // Cache outgoing message so Baileys can satisfy Signal Protocol retry requests
        if (result?.key?.id) {
            trackId(sentMessageIds, result.key.id);
            if (result.message) {
                cacheMessage(result.key.id, result.message);
            }
        }

        // Log outgoing message (with deduplication safeguard)
        const logDisplay = message || (cleanFileName ? `📎 [Attachment: ${cleanFileName}]` : '');
        const logRes = chatLogsDao.log(sessionId, 'me', jid, logDisplay, 'outgoing');
        if (!logRes?.isDuplicate) {
            this.broadcast({
                type: 'outgoing_message',
                id: logRes?.id,
                sessionId,
                to: jid,
                text: logDisplay,
                timestamp: new Date()
            });
        }

        return result;
    }

    async sendVoiceNote(sessionId, toPhone, audioBuffer, mimeType = 'audio/wav', captionOrTranscript = '') {
        let session = this.sessions.get(sessionId || 'default');
        if (!session || !session.sock || session.status !== 'connected') {
            for (const [id, s] of this.sessions.entries()) {
                if (s.sock && s.status === 'connected') {
                    session = s;
                    sessionId = id;
                    break;
                }
            }
        }
        if (!session || !session.sock || session.status !== 'connected') {
            throw new Error(`WhatsApp session [${sessionId || 'default'}] is not active or connected.`);
        }

        let jid;
        if (typeof toPhone === 'string' && toPhone.includes('@')) {
            jid = toPhone;
        } else {
            const cleanedPhone = standardizePhone(toPhone);
            jid = `${cleanedPhone}@s.whatsapp.net`;
        }

        // WhatsApp Push-To-Talk voice note with waveform
        const result = await session.sock.sendMessage(jid, {
            audio: audioBuffer,
            mimetype: mimeType,
            ptt: true
        });

        // Cache outgoing message so Baileys can satisfy Signal Protocol retry requests
        if (result?.key?.id) {
            trackId(sentMessageIds, result.key.id);
            if (result.message) {
                cacheMessage(result.key.id, result.message);
            }
        }

        // Log outgoing voice note in chat_logs
        const displayMsg = captionOrTranscript ? `🎵 [Voice Reply]: ${captionOrTranscript}` : '🎵 [Voice Reply]';
        const logRes = chatLogsDao.log(sessionId, 'me', jid, displayMsg, 'outgoing');
        if (!logRes?.isDuplicate) {
            this.broadcast({
                type: 'outgoing_message',
                id: logRes?.id,
                sessionId,
                to: jid,
                text: displayMsg,
                timestamp: new Date()
            });
        }

        return result;
    }

    async stopSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.isTerminated = true;
            if (session.reconnectTimer) {
                clearTimeout(session.reconnectTimer);
                session.reconnectTimer = null;
            }
            if (session.sock) {
                try {
                    session.sock.ev.removeAllListeners();
                    session.sock.end(undefined);
                } catch (e) {}
                session.sock = null;
            }
            session.status = 'disconnected';
            session.qr = null;
            sessionsDao.upsert(sessionId, session.name || sessionId, 'disconnected');
            this.broadcast({ type: 'session_update', sessionId, status: 'disconnected' });
        }
    }

    async deleteSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.isTerminated = true;
            if (session.reconnectTimer) {
                clearTimeout(session.reconnectTimer);
                session.reconnectTimer = null;
            }
            if (session.sock) {
                try {
                    session.sock.ev.removeAllListeners();
                    session.sock.end(undefined);
                } catch (e) {}
                session.sock = null;
            }
        }
        this.sessions.delete(sessionId);
        sessionsDao.delete(sessionId);

        const sessionFolder = path.join(SESSIONS_DIR, sessionId);
        if (fs.existsSync(sessionFolder)) {
            try {
                fs.rmSync(sessionFolder, { recursive: true, force: true });
            } catch (e) {
                console.error(`Failed to delete session folder ${sessionId}:`, e.message);
            }
        }
        this.broadcast({ type: 'session_deleted', sessionId });
    }

    async resetAllSessions() {
        for (const [sessionId, session] of this.sessions.entries()) {
            session.isTerminated = true;
            if (session.reconnectTimer) {
                clearTimeout(session.reconnectTimer);
                session.reconnectTimer = null;
            }
            if (session.sock) {
                try {
                    session.sock.ev.removeAllListeners();
                    session.sock.end(undefined);
                } catch (_) {}
                session.sock = null;
            }
        }
        this.sessions.clear();

        if (fs.existsSync(SESSIONS_DIR)) {
            try {
                const entries = fs.readdirSync(SESSIONS_DIR);
                for (const entry of entries) {
                    const fullPath = path.join(SESSIONS_DIR, entry);
                    try {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                    } catch (e) {
                        console.warn(`Could not delete session folder ${entry}:`, e.message);
                    }
                }
            } catch (_) {}
        }

        this.sessions.set('default', {
            id: 'default',
            name: 'Primary WhatsApp',
            status: 'disconnected',
            qr: null,
            sock: null,
            reconnectAttempts: 0,
            phoneNumber: null,
            isTerminated: false
        });

        this.broadcast({
            type: 'session_update',
            sessionId: 'default',
            status: 'disconnected',
            qr: null,
            phoneNumber: null
        });
    }

    async autoRestoreSessions() {
        const dbSessions = sessionsDao.getAll();
        const activeIds = new Set(dbSessions.map(s => s.session_id));

        // Clean up any orphaned folders from disk that are no longer in DB
        if (fs.existsSync(SESSIONS_DIR)) {
            const dirs = fs.readdirSync(SESSIONS_DIR);
            for (const dir of dirs) {
                if (!activeIds.has(dir)) {
                    console.log(`Cleaning up orphaned session directory: ${dir}`);
                    try {
                        fs.rmSync(path.join(SESSIONS_DIR, dir), { recursive: true, force: true });
                    } catch (e) {}
                }
            }
        }

        // Only restore valid sessions from database
        for (const s of dbSessions) {
            const sessionFolder = path.join(SESSIONS_DIR, s.session_id);
            const credPath = path.join(sessionFolder, 'creds.json');
            if (fs.existsSync(credPath)) {
                console.log(`Auto-restoring WhatsApp session [${s.session_id}]...`);
                this.startSession(s.session_id, s.session_name || 'Primary WhatsApp').catch(err => {
                    console.warn(`Failed auto-restoring session ${s.session_id}:`, err.message);
                });
            }
        }
    }

    async notifyOwnerOnHandover(sessionId = 'default', customerJid, customerPhone, customerName, lastMessage, reason, overridePhone = null) {
        const allSettings = settingsDao.getAll();
        if (allSettings.notify_self_on_handover !== 'true' && !overridePhone) {
            return;
        }

        let session = this.sessions.get(sessionId || 'default');
        if (!session || !session.sock || session.status !== 'connected') {
            for (const [id, s] of this.sessions.entries()) {
                if (s.sock && s.status === 'connected') {
                    session = s;
                    sessionId = id;
                    break;
                }
            }
        }
        if (!session || !session.sock || session.status !== 'connected') {
            console.warn('[Handover Alert] Cannot notify owner: WhatsApp session is not connected.');
            throw new Error('WhatsApp session is not connected or logged in.');
        }

        // Determine target recipient (custom phone or self connected number)
        let targetJid = null;
        const alertPhone = overridePhone || allSettings.handover_notify_phone;
        if (alertPhone && alertPhone.trim()) {
            const raw = alertPhone.trim();
            targetJid = raw.includes('@') ? raw : `${standardizePhone(raw)}@s.whatsapp.net`;
        } else if (session.sock.user?.id) {
            const rawId = session.sock.user.id;
            const selfPhone = rawId.split(':')[0].split('@')[0];
            targetJid = `${selfPhone}@s.whatsapp.net`;
        }

        if (!targetJid) {
            console.warn('[Handover Alert] Cannot notify owner: could not determine self JID.');
            throw new Error('Could not determine recipient WhatsApp phone number.');
        }

        // Avoid self-alert loop if handover was triggered by self JID
        if (customerJid && targetJid && (customerJid === targetJid || customerJid.startsWith(targetJid.split('@')[0]))) {
            return;
        }

        // Resolve phone and name if JID was an LID
        let phoneDisplay = customerPhone || '';
        let nameDisplay = customerName || '';
        if (customerJid && customerJid.endsWith('@lid')) {
            const mapping = lidMappingsDao.get(customerJid);
            if (mapping?.phone_number) phoneDisplay = mapping.phone_number;
            if (mapping?.push_name && !nameDisplay) nameDisplay = mapping.push_name;
        }
        if (!phoneDisplay && customerJid) {
            phoneDisplay = customerJid.replace(/@.*$/, '');
        }

        const formattedSender = nameDisplay ? `${nameDisplay} (+${phoneDisplay})` : `+${phoneDisplay}`;
        const cleanMsg = (lastMessage || '').replace(/^(?:🎤\s*\[(?:Voice Note|Audio Message)\]:?\s*)/i, '').trim() || '(No text / Voice Note)';
        const timeDisplay = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const alertText = 
`🚨 *CRM Alert: Human Handover Needed!*

👤 *Customer:* ${formattedSender}
💬 *Last Message:*
"${cleanMsg}"

⚠️ *Trigger Reason:* ${reason || 'Human support requested'}
🕒 *Time:* ${timeDisplay}

👉 *Bot has been paused for this contact. Please open Live Chat Inbox on your desktop CRM to assist.*`;

        try {
            console.log(`[Handover Alert] Sending WhatsApp alert to owner (${targetJid})...`);
            await session.sock.sendMessage(targetJid, { text: alertText });
            console.log(`[Handover Alert] Successfully notified owner at ${targetJid}`);
        } catch (err) {
            console.error('[Handover Alert] Failed to send alert to owner:', err.message);
        }
    }

    getLiveStatus() {
        const dbSessions = sessionsDao.getAll();
        const list = [];
        const processedIds = new Set();

        for (const s of dbSessions) {
            processedIds.add(s.session_id);
            const live = this.sessions.get(s.session_id);
            const isLive = live && live.status === 'connected' && !!live.sock;
            const currentStatus = isLive ? 'connected' : (live?.status || (s.status === 'connected' ? 'connecting' : s.status));
            list.push({
                sessionId: s.session_id,
                sessionName: s.session_name,
                name: s.session_name,
                status: currentStatus,
                phoneNumber: live?.phoneNumber || s.phone_number,
                hasQR: !!live?.qr,
                qr: live?.qr || null
            });
        }

        for (const [id, s] of this.sessions.entries()) {
            if (!processedIds.has(id)) {
                list.push({
                    sessionId: id,
                    sessionName: s.name,
                    name: s.name,
                    status: s.status,
                    phoneNumber: s.phoneNumber,
                    hasQR: !!s.qr,
                    qr: s.qr
                });
            }
        }

        return list;
    }
}

export default EngineHost;

