import express from 'express';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import parsePhoneNumber from 'libphonenumber-js';

import { initGlobalLogger, getRecentLogs, getLogFilePath, clearAllLogs } from './logger.js';
initGlobalLogger();

import {
    contactsDao,
    listsDao,
    campaignsDao,
    messagesDao,
    flowsDao,
    flowSessionsDao,
    knowledgeDao,
    productsDao,
    sessionsDao,
    chatLogsDao,
    conversationStatusDao,
    settingsDao,
    analyticsDao,
    lidMappingsDao,
    labelsDao,
    conversationLabelsDao,
    factoryResetDatabase
} from './db.js';

import { EngineHost } from './engineHost.js';
import { CampaignDispatcher } from './campaignDispatcher.js';
import { FlowEngine } from './flowEngine.js';
import { AIEngine } from './aiEngine.js';
import { voiceService } from './voiceService.js';
import { licenseService } from './licenseService.js';
import { fetchAllGroups, extractGroupMembers, saveGroupMembersToList } from './groupGrabber.js';
import { standardizePhone } from './phoneUtils.js';

process.on('uncaughtException', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n[FATAL] Port is already in use (${err.message}). Exiting to prevent multiple server instances.\n`);
        process.exit(1);
    }
    console.error('[UNCAUGHT EXCEPTION PREVENTED CRASH]:', err.message || err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION PREVENTED CRASH]:', reason?.message || reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), version: process.env.APP_VERSION || '1.0.0' });
});

// Instantiate engines
const aiEngine = new AIEngine();
const flowEngine = new FlowEngine(aiEngine);
const engineHost = new EngineHost();
engineHost.setEngines(flowEngine, aiEngine, voiceService);

// Broadcast engine events over WebSocket
const clients = new Set();
wss.on('connection', (ws) => {
    clients.add(ws);
    // Send initial status immediately on connect
    ws.send(JSON.stringify({
        type: 'init_state',
        sessions: engineHost.getLiveStatus(),
        stats: analyticsDao.getStats()
    }));

    ws.on('close', () => clients.delete(ws));
});

function broadcastWs(data) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
}

engineHost.setEventListener(broadcastWs);
engineHost.autoRestoreSessions();
licenseService.startHeartbeat();

const campaignDispatcher = new CampaignDispatcher(engineHost, {
    onProgress: (event) => broadcastWs({ type: 'campaign_progress', ...event })
});

// -------------------------------------------------------------
// 1. Dashboard & Analytics API
// -------------------------------------------------------------
app.get('/api/analytics', (req, res) => {
    try {
        const stats = analyticsDao.getStats();
        const liveSessions = engineHost.getLiveStatus();
        res.json({ success: true, stats, liveSessions });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -------------------------------------------------------------
// 2. WhatsApp Sessions API
// -------------------------------------------------------------
app.get('/api/sessions', (req, res) => {
    try {
        const sessions = engineHost.getLiveStatus();
        res.json({ success: true, sessions });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sessions/start', async (req, res) => {
    const { sessionId = 'default', sessionName = 'Primary WhatsApp' } = req.body;
    try {
        const result = await engineHost.startSession(sessionId, sessionName);
        res.json({ success: true, result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sessions/stop', async (req, res) => {
    const { sessionId = 'default' } = req.body;
    try {
        await engineHost.stopSession(sessionId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
    try {
        await engineHost.deleteSession(req.params.sessionId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Re-link session: Clears corrupted encryption keys and generates a fresh QR code
app.post('/api/sessions/:sessionId/relink', async (req, res) => {
    const { sessionId } = req.params;
    const sessionName = req.body.sessionName || 'Primary WhatsApp';
    try {
        await engineHost.deleteSession(sessionId);
        const result = await engineHost.startSession(sessionId, sessionName);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sessions/send-direct', async (req, res) => {
    const { sessionId = 'default', toPhone, message, mediaUrl } = req.body;
    if (!toPhone || !message) {
        return res.status(400).json({ error: 'toPhone and message are required' });
    }
    try {
        const result = await engineHost.sendText(sessionId, toPhone, message, mediaUrl || null);
        res.json({ success: true, result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -------------------------------------------------------------
// 3. Contacts & Lists API
// -------------------------------------------------------------
app.get('/api/contacts', (req, res) => {
    try {
        const listId = req.query.list_id ? parseInt(req.query.list_id, 10) : null;
        const contacts = contactsDao.getAll(listId);
        res.json({ success: true, contacts });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/contacts', (req, res) => {
    const { phone, name, notes, tags, custom_fields, list_ids } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    try {
        const cleanPhone = standardizePhone(phone);
        const result = contactsDao.create({
            phone: cleanPhone,
            name,
            notes,
            tags,
            custom_fields: typeof custom_fields === 'object' ? JSON.stringify(custom_fields) : (custom_fields || '{}')
        });
        const contactId = result.lastInsertRowid;
        if (Array.isArray(list_ids) && list_ids.length > 0) {
            listsDao.setContactLists(contactId, list_ids);
        }
        res.json({ success: true, id: contactId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/contacts/:id', (req, res) => {
    const { phone, name, notes, tags, custom_fields, list_ids } = req.body;
    try {
        const existing = contactsDao.getById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Contact not found' });

        const cleanPhone = phone ? standardizePhone(phone) : existing.phone;
        contactsDao.update(req.params.id, {
            phone: cleanPhone,
            name: name !== undefined ? name : existing.name,
            notes: notes !== undefined ? notes : existing.notes,
            tags: tags !== undefined ? tags : existing.tags,
            custom_fields: custom_fields !== undefined ? (typeof custom_fields === 'object' ? JSON.stringify(custom_fields) : custom_fields) : existing.custom_fields
        });

        if (Array.isArray(list_ids)) {
            listsDao.setContactLists(parseInt(req.params.id, 10), list_ids);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/contacts/:id', (req, res) => {
    try {
        contactsDao.delete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/contacts/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Array of ids required' });
    }
    try {
        const result = contactsDao.bulkDelete(ids);
        res.json({ success: true, count: result.changes });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Bulk import contacts from parsed Excel/CSV rows
app.post('/api/contacts/import', (req, res) => {
    const { contacts, listId, listName } = req.body;
    if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'Contacts array is required' });
    }

    try {
        const normalized = [];
        for (const row of contacts) {
            const rawPhone = String(row.phone || row.mobile || row.number || '').trim();
            if (!rawPhone) continue;

            const cleanPhone = standardizePhone(rawPhone);

            if (cleanPhone && cleanPhone.length >= 7) {
                normalized.push({
                    phone: cleanPhone,
                    name: row.name || row.fullname || '',
                    notes: row.notes || '',
                    tags: row.tags || 'imported',
                    custom_fields: row.custom_fields || {}
                });
            }
        }

        const count = contactsDao.bulkUpsert(normalized);

        // Optionally associate with list
        let targetListId = listId;
        if (!targetListId && listName) {
            const l = listsDao.create(listName, `Bulk imported ${normalized.length} contacts`);
            targetListId = l.lastInsertRowid;
        }

        if (targetListId) {
            const all = contactsDao.getAll();
            const phoneMap = new Map(all.map(c => [c.phone, c.id]));
            const ids = normalized.map(c => phoneMap.get(c.phone)).filter(Boolean);
            listsDao.bulkAddMembers(targetListId, ids);
        }

        res.json({ success: true, imported: count, listId: targetListId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Contact Lists
app.get('/api/lists', (req, res) => {
    try {
        const lists = listsDao.getAll();
        res.json({ success: true, lists });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/lists', (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'List name required' });
    try {
        const result = listsDao.create(name, description);
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/lists/:id', (req, res) => {
    const { name, description = '' } = req.body;
    if (!name) return res.status(400).json({ error: 'List name required' });
    try {
        listsDao.update(req.params.id, name, description);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/lists/:id/members', (req, res) => {
    try {
        const members = listsDao.getMembers(req.params.id);
        res.json({ success: true, members });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/lists/:id/members', (req, res) => {
    try {
        const { contact_id, contact_ids } = req.body;
        if (contact_ids && Array.isArray(contact_ids)) {
            listsDao.bulkAddMembers(req.params.id, contact_ids);
        } else if (contact_id) {
            listsDao.addMember(req.params.id, contact_id);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/lists/:id', (req, res) => {
    try {
        listsDao.delete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -------------------------------------------------------------
// 4. Bulk Campaigns & Queue API
// -------------------------------------------------------------
app.get('/api/campaigns', (req, res) => {
    try {
        const campaigns = campaignsDao.getAll();
        res.json({ success: true, campaigns });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/campaigns/:id', (req, res) => {
    try {
        const campaign = campaignsDao.getById(req.params.id);
        const messages = messagesDao.getForCampaign(req.params.id);
        res.json({ success: true, campaign, messages });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/campaigns', (req, res) => {
    const {
        name,
        list_id,
        session_id = 'default',
        template_text,
        media_path = null,
        delay_min_seconds = 5,
        delay_max_seconds = 18,
        batch_count = 15,
        cooldown_seconds = 40,
        simulate_typing = true
    } = req.body;

    if (!name || !template_text || !list_id) {
        return res.status(400).json({ error: 'name, template_text, and list_id are required' });
    }

    try {
        const members = listsDao.getMembers(list_id);
        if (members.length === 0) {
            return res.status(400).json({ error: 'Selected list has 0 contacts' });
        }

        const campRes = campaignsDao.create({
            name,
            list_id,
            session_id,
            template_text,
            media_path,
            delay_min_seconds: parseInt(delay_min_seconds, 10) || 5,
            delay_max_seconds: parseInt(delay_max_seconds, 10) || 18,
            batch_count: parseInt(batch_count, 10) || 15,
            cooldown_seconds: parseInt(cooldown_seconds, 10) || 40,
            simulate_typing: simulate_typing ? 1 : 0,
            total_recipients: members.length
        });
        const campaignId = campRes.lastInsertRowid;

        // Generate message queue entries
        const msgs = members.map(m => ({
            campaign_id: campaignId,
            session_id,
            recipient_phone: m.phone,
            recipient_name: m.name || '',
            message_text: template_text,
            media_url: media_path
        }));
        messagesDao.bulkCreate(msgs);

        res.json({ success: true, campaignId, totalRecipients: members.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/campaigns/:id/start', async (req, res) => {
    try {
        const result = await campaignDispatcher.startCampaign(parseInt(req.params.id, 10));
        res.json({ success: true, result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/campaigns/:id/pause', (req, res) => {
    try {
        const ok = campaignDispatcher.pauseCampaign(parseInt(req.params.id, 10));
        res.json({ success: ok });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/campaigns/:id/resume', (req, res) => {
    try {
        const ok = campaignDispatcher.resumeCampaign(parseInt(req.params.id, 10));
        res.json({ success: ok });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/campaigns/:id/cancel', (req, res) => {
    try {
        const ok = campaignDispatcher.cancelCampaign(parseInt(req.params.id, 10));
        res.json({ success: ok });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/campaigns/:id/restart', async (req, res) => {
    try {
        const result = await campaignDispatcher.restartCampaign(parseInt(req.params.id, 10));
        res.json({ success: true, result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/campaigns/:id/retry-failed', async (req, res) => {
    try {
        const result = await campaignDispatcher.retryFailed(parseInt(req.params.id, 10));
        res.json({ success: true, result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/campaigns/:id', (req, res) => {
    try {
        campaignsDao.delete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -------------------------------------------------------------
// 5. Visual Interactive Flows API
// -------------------------------------------------------------
app.get('/api/flows', (req, res) => {
    try {
        const flows = flowsDao.getAll();
        res.json({ success: true, flows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/flows/:id', (req, res) => {
    try {
        const flow = flowsDao.getById(req.params.id);
        res.json({ success: true, flow });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/flows', (req, res) => {
    const { name, trigger_keyword, is_fallback, nodes_graph, edges_graph, is_active } = req.body;
    if (!name) return res.status(400).json({ error: 'Flow name is required' });
    try {
        const result = flowsDao.create({
            name,
            trigger_keyword,
            is_fallback,
            nodes_graph,
            edges_graph,
            is_active
        });
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/flows/:id', (req, res) => {
    try {
        flowsDao.update(req.params.id, req.body);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/flows/:id', (req, res) => {
    try {
        flowsDao.delete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// AI Flow Generator: Synthesizes a full visual flow from natural language prompt
app.post('/api/flows/generate-ai', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt description is required' });
    try {
        const flow = await aiEngine.generateFlowFromPrompt(prompt);
        res.json({ success: true, flow });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// AI Flow Editor: Modifies and expands an existing visual flow using natural language prompt
app.post('/api/flows/edit-ai', async (req, res) => {
    const { prompt, flow } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Edit prompt instruction is required' });
    if (!flow || !flow.nodes) return res.status(400).json({ error: 'Existing flow data is required' });
    try {
        const result = await aiEngine.editFlowWithAI(prompt, flow);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Interactive Flow Simulator endpoint (test in UI without needing active WhatsApp message!)
app.post('/api/flows/simulate', async (req, res) => {
    const { chatJid = 'test_simulation@s.whatsapp.net', messageText, draftFlow } = req.body;
    try {
        const reply = await flowEngine.processIncoming(chatJid, messageText, draftFlow);
        res.json({ success: true, reply: reply || 'No active flow matched or flow finished.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -------------------------------------------------------------
// 6. WhatsApp Group Grabber API
// -------------------------------------------------------------
app.get('/api/groups', async (req, res) => {
    let sessionId = req.query.sessionId || 'default';
    let session = engineHost.getSession(sessionId);
    if (!session || !session.sock || session.status !== 'connected') {
        for (const [id, s] of engineHost.sessions.entries()) {
            if (s.sock && s.status === 'connected') {
                session = s;
                sessionId = id;
                break;
            }
        }
    }
    if (!session || !session.sock || session.status !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp session is not connected' });
    }

    try {
        const groups = await fetchAllGroups(session.sock);
        res.json({ success: true, groups });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/groups/:groupJid/members', async (req, res) => {
    let sessionId = req.query.sessionId || 'default';
    let session = engineHost.getSession(sessionId);
    if (!session || !session.sock || session.status !== 'connected') {
        for (const [id, s] of engineHost.sessions.entries()) {
            if (s.sock && s.status === 'connected') {
                session = s;
                sessionId = id;
                break;
            }
        }
    }
    if (!session || !session.sock || session.status !== 'connected') {
        return res.status(400).json({ error: 'WhatsApp session is not connected' });
    }

    try {
        const result = await extractGroupMembers(session.sock, req.params.groupJid);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/groups/import-members', async (req, res) => {
    const { members, listName, listId } = req.body;
    if (!Array.isArray(members) || members.length === 0) {
        return res.status(400).json({ error: 'Members array is required' });
    }

    try {
        const result = await saveGroupMembersToList(members, listName, listId);
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -------------------------------------------------------------
// 7. AI Knowledge Base & Products API
// -------------------------------------------------------------
app.get('/api/ai/knowledge', (req, res) => {
    try {
        const items = knowledgeDao.getAll();
        res.json({ success: true, items });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/ai/knowledge', (req, res) => {
    const { title, content, tags } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    try {
        const result = knowledgeDao.create({ title, content, tags });
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/ai/knowledge/:id', (req, res) => {
    const { title, content, tags } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    try {
        knowledgeDao.update(req.params.id, { title, content, tags });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/ai/knowledge/:id', (req, res) => {
    try {
        knowledgeDao.delete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/ai/products', (req, res) => {
    try {
        const products = productsDao.getAll();
        res.json({ success: true, products });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/ai/products', (req, res) => {
    const { sku, title, price, description, image_path, in_stock = 1 } = req.body;
    if (!title || price === undefined) return res.status(400).json({ error: 'Title and price required' });
    try {
        const result = productsDao.create({ sku, title, price: parseFloat(price), description, image_path, in_stock });
        res.json({ success: true, id: result.lastInsertRowid });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/ai/products/:id', (req, res) => {
    const { sku, title, price, description, image_path, in_stock = 1 } = req.body;
    if (!title || price === undefined) return res.status(400).json({ error: 'Title and price required' });
    try {
        productsDao.update(req.params.id, {
            sku,
            title,
            price: parseFloat(price),
            description,
            image_path,
            in_stock: in_stock ? 1 : 0
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/ai/products/:id', (req, res) => {
    try {
        productsDao.delete(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Interactive AI Simulator endpoint
app.post('/api/ai/simulate', async (req, res) => {
    const { userQuery, senderName } = req.body;
    if (!userQuery) return res.status(400).json({ error: 'userQuery is required' });
    try {
        const reply = await aiEngine.generateReply(userQuery, { name: senderName });
        res.json({ success: true, reply });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/voice/test-tts', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    try {
        const result = await voiceService.synthesizeSpeech(text);
        if (!result) return res.status(500).json({ error: 'Failed to synthesize speech' });
        res.json({
            success: true,
            audioBase64: result.audioBuffer.toString('base64'),
            mimeType: result.mimeType,
            length: result.audioBuffer.length
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -------------------------------------------------------------
// 8. Settings & Chat Logs API
// -------------------------------------------------------------
app.get('/api/settings', (req, res) => {
    try {
        const settings = settingsDao.getAll();
        res.json({ success: true, settings });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/settings', (req, res) => {
    try {
        settingsDao.setMultiple(req.body);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/settings/test-handover-alert', async (req, res) => {
    const { targetPhone } = req.body || {};
    try {
        await engineHost.notifyOwnerOnHandover(
            'default',
            'demo_test@s.whatsapp.net',
            '9876543210',
            'Demo Customer (Test Alert)',
            'Hello! I need to speak with a human support agent.',
            'Manual Test Handover Alert from Settings',
            targetPhone || null
        );
        res.json({ success: true, message: 'Test alert sent to WhatsApp!' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/engine/logs', (req, res) => {
    try {
        const lines = parseInt(req.query.lines || '250', 10);
        const logs = getRecentLogs(lines);
        res.json({ success: true, logs, logPath: getLogFilePath() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// -------------------------------------------------------------
// License & Hardware Verification API
// -------------------------------------------------------------
app.get('/api/license/status', (req, res) => {
    try {
        const status = licenseService.getStatus();
        res.json({ success: true, ...status });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/license/activate', async (req, res) => {
    const { mobile } = req.body || {};
    try {
        const result = await licenseService.verifyRemote(mobile);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/license/verify', async (req, res) => {
    try {
        const result = await licenseService.verifyRemote();
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/system/factory-reset', async (req, res) => {
    try {
        console.log('[System] Factory reset requested. Initiating complete application reset...');

        // 1. Cancel all active campaigns and queues
        if (campaignDispatcher && typeof campaignDispatcher.cancelAll === 'function') {
            campaignDispatcher.cancelAll();
        }

        // 2. Disconnect and wipe all WhatsApp sessions
        await engineHost.resetAllSessions();

        // 3. Reset database tables and re-seed clean starter templates
        factoryResetDatabase();

        // 4. Reset logs
        clearAllLogs();

        // 5. Broadcast reset event over WebSocket
        broadcastWs({
            type: 'factory_reset',
            message: 'Application has been reset to factory defaults.'
        });
        broadcastWs({
            type: 'init_state',
            sessions: engineHost.getLiveStatus(),
            stats: analyticsDao.getStats()
        });

        console.log('[System] Factory reset completed successfully. Application set as new.');
        res.json({
            success: true,
            message: 'Factory reset completed successfully. All data has been cleared and the application has been reset to a brand-new state.'
        });
    } catch (err) {
        console.error('[System] Factory reset failed:', err);
        res.status(500).json({ error: 'Factory reset failed: ' + err.message });
    }
});

app.get('/api/chat/logs', (req, res) => {
    try {
        const limit = parseInt(req.query.limit || '100', 10);
        const logs = chatLogsDao.getRecent(limit);
        res.json({ success: true, logs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Live Chat Inbox Endpoints
app.get('/api/chat/conversations', (req, res) => {
    try {
        const conversations = chatLogsDao.getConversations();
        res.json({ success: true, conversations });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/chat/messages', (req, res) => {
    const { jid, limit = 100 } = req.query;
    if (!jid) return res.status(400).json({ error: 'JID parameter is required' });
    try {
        const messages = chatLogsDao.getMessagesForJid(jid, parseInt(limit, 10));
        res.json({ success: true, messages });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/chat/send', async (req, res) => {
    const { sessionId = 'default', jid, messageText, mediaUrl } = req.body;
    if (!jid || !messageText) {
        return res.status(400).json({ error: 'Both jid and messageText are required' });
    }

    try {
        let targetSessionId = sessionId;
        let session = engineHost.getSession(targetSessionId);
        if (!session || !session.sock || session.status !== 'connected') {
            for (const [id, s] of engineHost.sessions.entries()) {
                if (s.sock && s.status === 'connected') {
                    targetSessionId = id;
                    session = s;
                    break;
                }
            }
        }

        if (!session || !session.sock || session.status !== 'connected') {
            return res.status(400).json({ error: 'No active WhatsApp session is currently connected to send messages' });
        }

        await engineHost.sendText(targetSessionId, jid, messageText, mediaUrl || null);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/chat/toggle-bot', (req, res) => {
    const { jid, botDisabled } = req.body;
    if (!jid) return res.status(400).json({ error: 'JID is required' });
    try {
        conversationStatusDao.setBotDisabled(jid, !!botDisabled);
        engineHost.broadcast({
            type: 'bot_status_changed',
            chatJid: jid,
            botDisabled: !!botDisabled
        });
        res.json({ success: true, botDisabled: !!botDisabled });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/chat/resolve-human-request', (req, res) => {
    const { jid } = req.body;
    if (!jid) return res.status(400).json({ error: 'JID is required' });
    try {
        conversationStatusDao.clearHumanRequested(jid, true);
        engineHost.broadcast({
            type: 'human_request_resolved',
            chatJid: jid,
            botDisabled: false
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/chat/status/:jid', (req, res) => {
    try {
        const status = conversationStatusDao.get(req.params.jid) || { bot_disabled: 0, human_agent_requested: 0 };
        res.json({ success: true, status });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/chat/update-contact', (req, res) => {
    try {
        const { jid, name, phone } = req.body;
        if (!jid) return res.status(400).json({ error: 'jid is required' });

        const cleanPhone = phone ? phone.replace(/\D/g, '') : null;
        if (jid.endsWith('@lid')) {
            const phoneJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : null;
            lidMappingsDao.upsert(jid, phoneJid, cleanPhone, name || null);
            if (cleanPhone) {
                const existing = contactsDao.getByPhone(cleanPhone);
                if (existing) {
                    contactsDao.update(existing.id, { ...existing, name: name || existing.name });
                } else {
                    contactsDao.create({ phone: cleanPhone, name: name || '' });
                }
            }
        } else {
            const currentPhone = jid.split('@')[0];
            const existing = contactsDao.getByPhone(currentPhone);
            if (existing) {
                contactsDao.update(existing.id, { ...existing, name: name || existing.name, phone: cleanPhone || existing.phone });
            } else {
                contactsDao.create({ phone: cleanPhone || currentPhone, name: name || '' });
            }
        }

        res.json({ success: true, message: 'Contact updated successfully' });
    } catch (e) {
        console.error('Error updating contact:', e);
        res.status(500).json({ error: e.message });
    }
});

// Delete entire chat conversation for a contact (all message logs, sessions, and tags)
app.delete('/api/chat/conversations/:jid', (req, res) => {
    try {
        const jid = decodeURIComponent(req.params.jid);
        if (!jid) return res.status(400).json({ error: 'JID parameter is required' });

        const result = chatLogsDao.deleteConversation(jid);
        engineHost.broadcast({
            type: 'conversation_deleted',
            chatJid: jid,
            deletedJids: result.deletedJids
        });
        res.json({ success: true, ...result });
    } catch (e) {
        console.error('Error deleting conversation:', e);
        res.status(500).json({ error: e.message });
    }
});

// Bulk delete multiple chat conversations at once
app.post('/api/chat/conversations/bulk-delete', (req, res) => {
    try {
        const { jids } = req.body;
        if (!Array.isArray(jids) || jids.length === 0) {
            return res.status(400).json({ error: 'Array of JIDs is required' });
        }
        const result = chatLogsDao.deleteMultipleConversations(jids);
        engineHost.broadcast({
            type: 'conversations_bulk_deleted',
            deletedJids: result.deletedJids
        });
        res.json({ success: true, ...result });
    } catch (e) {
        console.error('Error bulk deleting conversations:', e);
        res.status(500).json({ error: e.message });
    }
});

// Delete individual chat message
app.delete('/api/chat/messages/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ error: 'Valid message ID is required' });
        const result = chatLogsDao.deleteMessage(id);
        if (result.deleted) {
            engineHost.broadcast({
                type: 'message_deleted',
                messageId: id,
                chatJid: result.message?.from_jid !== 'me' ? result.message?.from_jid : result.message?.to_jid
            });
        }
        res.json({ success: true, ...result });
    } catch (e) {
        console.error('Error deleting message:', e);
        res.status(500).json({ error: e.message });
    }
});

// Custom Chat Labels & Tags API
app.get('/api/chat/labels', (req, res) => {
    try {
        const labels = labelsDao.getAll();
        res.json({ success: true, labels });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/chat/labels', (req, res) => {
    const { name, color = '#10b981' } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Label name is required' });
    try {
        labelsDao.create(name.trim(), color);
        const labels = labelsDao.getAll();
        engineHost.broadcast({ type: 'labels_updated' });
        res.json({ success: true, labels });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/chat/labels/:name', (req, res) => {
    try {
        const name = decodeURIComponent(req.params.name);
        labelsDao.delete(name);
        engineHost.broadcast({ type: 'labels_updated' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/chat/conversations/:jid/labels', (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const { labels } = req.body;
    if (!Array.isArray(labels)) return res.status(400).json({ error: 'labels must be an array of strings' });
    try {
        conversationLabelsDao.set(jid, labels);
        engineHost.broadcast({
            type: 'conversation_labels_updated',
            chatJid: jid,
            labels
        });
        res.json({ success: true, labels });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});



// -------------------------------------------------------------
// 9. Static UI Bundle Serving
// -------------------------------------------------------------
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

const PORT = process.env.PORT || 3001;

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n[FATAL] Port ${PORT} is already in use by another running Node process!`);
        console.error(`Exiting immediately to prevent duplicate WhatsApp sessions.\n`);
        process.exit(1);
    } else {
        console.error('Server error:', err);
    }
});

server.listen(PORT, () => {
    console.log(`WhatsApp CRM Backend Server listening on http://localhost:${PORT}`);
});

export { app, server, engineHost };
