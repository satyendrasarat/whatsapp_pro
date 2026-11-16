import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.CRM_USER_DATA_DIR
    ? path.join(process.env.CRM_USER_DATA_DIR, 'data')
    : path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'whatsapp_crm.sqlite');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys for high performance & reliability
try {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
} catch (e) {
    console.warn('Could not set WAL pragma:', e.message);
}

// Initialize tables from schema.sql
const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

// Migration: add anti-ban columns to campaigns table if not present
try { db.exec('ALTER TABLE campaigns ADD COLUMN batch_count INTEGER DEFAULT 15;'); } catch (_) {}
try { db.exec('ALTER TABLE campaigns ADD COLUMN cooldown_seconds INTEGER DEFAULT 40;'); } catch (_) {}
try { db.exec('ALTER TABLE campaigns ADD COLUMN simulate_typing BOOLEAN DEFAULT 1;'); } catch (_) {}

// Migration & initialization for custom chat labels
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS chat_labels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT DEFAULT '#10b981',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS conversation_labels (
            chat_jid TEXT NOT NULL,
            label_name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (chat_jid, label_name)
        );
    `);
} catch (e) {
    console.warn('Could not ensure chat_labels tables:', e.message);
}

// Seed default labels if none exist
try {
    const labelCount = db.prepare('SELECT COUNT(*) as count FROM chat_labels').get();
    if (labelCount && labelCount.count === 0) {
        const defaultLabels = [
            { name: 'VIP', color: '#8b5cf6' },
            { name: 'Lead', color: '#10b981' },
            { name: 'Urgent', color: '#f43f5e' },
            { name: 'Follow-up', color: '#f59e0b' }
        ];
        const insLabel = db.prepare('INSERT OR IGNORE INTO chat_labels (name, color) VALUES (?, ?)');
        for (const l of defaultLabels) {
            insLabel.run(l.name, l.color);
        }
    }
} catch (e) {
    console.warn('Could not seed default chat labels:', e.message);
}


// Insert default settings if not exists
const defaultSettings = [
    { key: 'ai_provider', value: 'local_ollama' },
    { key: 'ollama_endpoint', value: 'http://localhost:11434' },
    { key: 'ollama_model', value: 'llama3:latest' },
    { key: 'gemini_api_key', value: '' },
    { key: 'openai_api_key', value: '' },
    { key: 'ai_system_prompt', value: 'You are an intelligent customer support and sales assistant for WhatsApp CRM. Respond helpfully, politely, and concisely.' },
    { key: 'ai_enabled_globally', value: 'true' },
    { key: 'auto_responder_mode', value: 'hybrid' },
    { key: 'default_min_delay', value: '8' },
    { key: 'default_max_delay', value: '20' }
];

const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const s of defaultSettings) {
    insSetting.run(s.key, s.value);
}

// Insert sample flow if none exist
const flowCount = db.prepare('SELECT COUNT(*) as count FROM flows').get();
if (flowCount && flowCount.count === 0) {
    const sampleNodes = [
        {
            id: 'node-trigger',
            type: 'trigger',
            position: { x: 100, y: 150 },
            data: { label: 'Keyword Trigger', keyword: 'hello', description: 'Triggers when customer sends hello, hi, or info' }
        },
        {
            id: 'node-welcome',
            type: 'message',
            position: { x: 380, y: 150 },
            data: { label: 'Welcome Message', content: 'Hello! 👋 Welcome to our CRM Service. How can we assist you today?\n\n1️⃣ View Products\n2️⃣ Contact Sales Rep\n3️⃣ Talk to AI Assistant' }
        },
        {
            id: 'node-menu',
            type: 'menu',
            position: { x: 680, y: 150 },
            data: {
                label: 'Main Menu',
                options: [
                    { key: '1', label: 'View Products', targetNodeId: 'node-products' },
                    { key: '2', label: 'Sales Rep', targetNodeId: 'node-sales' },
                    { key: '3', label: 'AI Support', targetNodeId: 'node-ai' }
                ]
            }
        },
        {
            id: 'node-products',
            type: 'message',
            position: { x: 1000, y: 50 },
            data: { label: 'Product Catalog', content: '📦 Here are our featured packages:\n• Starter CRM Plan - $29/mo\n• Enterprise Multi-Agent Suite - $99/mo\n\nReply "ORDER" or ask anything!' }
        },
        {
            id: 'node-sales',
            type: 'message',
            position: { x: 1000, y: 200 },
            data: { label: 'Sales Routing', content: '👤 An agent has been notified and will message you shortly during business hours (9 AM - 6 PM EST).' }
        },
        {
            id: 'node-ai',
            type: 'message',
            position: { x: 1000, y: 350 },
            data: { label: 'AI Assistant Handover', content: '🤖 AI Agent is active! Feel free to ask any question about our products, pricing, or support.' }
        }
    ];

    const sampleEdges = [
        { id: 'e1-2', source: 'node-trigger', target: 'node-welcome' },
        { id: 'e2-3', source: 'node-welcome', target: 'node-menu' },
        { id: 'e3-p', source: 'node-menu', target: 'node-products', sourceHandle: 'opt-0' },
        { id: 'e3-s', source: 'node-menu', target: 'node-sales', sourceHandle: 'opt-1' },
        { id: 'e3-a', source: 'node-menu', target: 'node-ai', sourceHandle: 'opt-2' }
    ];

    db.prepare(`
        INSERT INTO flows (name, trigger_keyword, is_fallback, nodes_graph, edges_graph, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run('Welcome & Sales Menu Flow', 'hello,hi,start,menu', 0, JSON.stringify(sampleNodes), JSON.stringify(sampleEdges), 1);
}

// Ensure Default AI Guardrail Template always exists in flows (Inactive by default)
const templateFlowName = 'AI Concierge with Smart Human Escalation (Template)';
const existingTemplate = db.prepare('SELECT id FROM flows WHERE name = ?').get(templateFlowName);
if (!existingTemplate) {
    const aiTemplateNodes = [
        {
            id: 'node-trigger-1',
            type: 'trigger',
            position: { x: 60, y: 180 },
            data: { label: 'Catch-All Trigger (*)', keyword: '*' }
        },
        {
            id: 'node-ai-1',
            type: 'ai_handover',
            position: { x: 380, y: 180 },
            data: {
                label: 'AI Expert Assistant',
                introText: '🤖 *AI Specialist Connected!*\nWelcome! Ask me any question about our products, pricing, or custom requests.',
                systemPrompt: 'You are an expert sales and support consultant assisting customers over WhatsApp. Answer accurately from the live catalog and knowledge base. Be friendly, concise, and professional.',
                escalateOnConfusion: true,
                confusionKeywords: 'human, agent, person, confused, help, call me, speak to someone, operator',
                handoverMessage: '🔔 Connecting you with a live human support specialist. One moment please while our team reviews your conversation...'
            }
        },
        {
            id: 'node-human-1',
            type: 'human_handover',
            position: { x: 740, y: 180 },
            data: {
                label: 'Live Human Support Handover',
                message: '🔔 Connecting you with a live human support specialist. One moment please while our team reviews your conversation...',
                note: 'Customer requested live support or AI guardrail triggered due to confusion.'
            }
        }
    ];

    const aiTemplateEdges = [
        {
            id: 'e-trigger-ai',
            source: 'node-trigger-1',
            target: 'node-ai-1',
            animated: true,
            style: { stroke: '#10b981', strokeWidth: 2 },
            markerEnd: { type: 'arrowclosed', color: '#10b981' }
        },
        {
            id: 'e-ai-human',
            source: 'node-ai-1',
            target: 'node-human-1',
            label: 'Escalate to Human',
            animated: true,
            style: { stroke: '#ef4444', strokeWidth: 2 },
            markerEnd: { type: 'arrowclosed', color: '#ef4444' }
        }
    ];

    db.prepare(`
        INSERT INTO flows (name, trigger_keyword, is_fallback, nodes_graph, edges_graph, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        templateFlowName,
        '*',
        0,
        JSON.stringify(aiTemplateNodes),
        JSON.stringify(aiTemplateEdges),
        0 // Status Inactive by default
    );
}

// Insert sample knowledge base & product if empty
const kbCount = db.prepare('SELECT COUNT(*) as count FROM knowledge_items').get();
if (kbCount && kbCount.count === 0) {
    db.prepare('INSERT INTO knowledge_items (title, content, tags) VALUES (?, ?, ?)').run(
        'Company Overview & Hours',
        'We provide automated WhatsApp CRM and campaign automation tools. Our office hours are Monday to Friday 9 AM to 6 PM EST. Live support is available 24/7 via ticket.',
        'hours,support,company'
    );
    db.prepare('INSERT INTO knowledge_items (title, content, tags) VALUES (?, ?, ?)').run(
        'Pricing & Refund Policy',
        'Starter plans cost $29/month. Enterprise plans cost $99/month. All plans come with a 14-day money-back guarantee with zero questions asked.',
        'pricing,refund,cost'
    );
}

const prodCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
if (prodCount && prodCount.count === 0) {
    db.prepare('INSERT INTO products (sku, title, price, description, in_stock) VALUES (?, ?, ?, ?, ?)').run(
        'CRM-PRO-01',
        'WhatsApp CRM Pro License',
        49.00,
        'Full desktop automation suite with unlimited contacts, flow builder, and multi-session WhatsApp support.',
        1
    );
    db.prepare('INSERT INTO products (sku, title, price, description, in_stock) VALUES (?, ?, ?, ?, ?)').run(
        'AI-ADDON-02',
        'AI Auto-Responder Addon',
        29.00,
        'Automated AI agent query resolution connected to your local knowledge base or Ollama/Gemini API.',
        1
    );
}

// Contacts DAO
export const contactsDao = {
    getAll: (listId = null) => {
        if (listId) {
            return db.prepare(`
                SELECT c.*, GROUP_CONCAT(l.name, ', ') as list_names, GROUP_CONCAT(l.id, ',') as list_ids
                FROM contacts c
                JOIN list_members lm_filter ON c.id = lm_filter.contact_id AND lm_filter.list_id = ?
                LEFT JOIN list_members lm ON c.id = lm.contact_id
                LEFT JOIN lists l ON lm.list_id = l.id
                GROUP BY c.id
                ORDER BY c.id DESC
            `).all(listId);
        }
        return db.prepare(`
            SELECT c.*, GROUP_CONCAT(l.name, ', ') as list_names, GROUP_CONCAT(l.id, ',') as list_ids
            FROM contacts c
            LEFT JOIN list_members lm ON c.id = lm.contact_id
            LEFT JOIN lists l ON lm.list_id = l.id
            GROUP BY c.id
            ORDER BY c.id DESC
        `).all();
    },
    getById: (id) => db.prepare('SELECT * FROM contacts WHERE id = ?').get(id),
    getByPhone: (phone) => db.prepare('SELECT * FROM contacts WHERE phone = ?').get(phone),
    create: (contact) => {
        const stmt = db.prepare(`
            INSERT INTO contacts (phone, name, notes, tags, custom_fields)
            VALUES (?, ?, ?, ?, ?)
        `);
        return stmt.run(contact.phone, contact.name || '', contact.notes || '', contact.tags || '', contact.custom_fields || '{}');
    },
    update: (id, contact) => {
        const stmt = db.prepare(`
            UPDATE contacts SET phone = ?, name = ?, notes = ?, tags = ?, custom_fields = ?
            WHERE id = ?
        `);
        return stmt.run(contact.phone, contact.name || '', contact.notes || '', contact.tags || '', contact.custom_fields || '{}', id);
    },
    delete: (id) => db.prepare('DELETE FROM contacts WHERE id = ?').run(id),
    bulkDelete: (ids) => {
        if (!ids || ids.length === 0) return { changes: 0 };
        const placeholders = ids.map(() => '?').join(',');
        return db.prepare(`DELETE FROM contacts WHERE id IN (${placeholders})`).run(...ids);
    },
    bulkUpsert: (contactsArray) => {
        const stmt = db.prepare(`
            INSERT INTO contacts (phone, name, notes, tags, custom_fields)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(phone) DO UPDATE SET
                name = COALESCE(excluded.name, contacts.name),
                notes = COALESCE(excluded.notes, contacts.notes),
                tags = COALESCE(excluded.tags, contacts.tags),
                custom_fields = COALESCE(excluded.custom_fields, contacts.custom_fields)
        `);
        let count = 0;
        for (const c of contactsArray) {
            if (!c.phone) continue;
            stmt.run(c.phone, c.name || '', c.notes || '', c.tags || '', c.custom_fields ? JSON.stringify(c.custom_fields) : '{}');
            count++;
        }
        return count;
    }
};

// Lists DAO
export const listsDao = {
    getAll: () => {
        const lists = db.prepare(`
            SELECT l.*, COUNT(lm.contact_id) as member_count
            FROM lists l
            LEFT JOIN list_members lm ON l.id = lm.list_id
            GROUP BY l.id
            ORDER BY l.id DESC
        `).all();
        return lists;
    },
    getById: (id) => db.prepare('SELECT * FROM lists WHERE id = ?').get(id),
    create: (name, description = '') => {
        return db.prepare('INSERT INTO lists (name, description) VALUES (?, ?)').run(name, description);
    },
    update: (id, name, description = '') => {
        return db.prepare('UPDATE lists SET name = ?, description = ? WHERE id = ?').run(name, description, id);
    },
    delete: (id) => db.prepare('DELETE FROM lists WHERE id = ?').run(id),
    getMembers: (listId) => {
        return db.prepare(`
            SELECT c.* FROM contacts c
            JOIN list_members lm ON c.id = lm.contact_id
            WHERE lm.list_id = ?
            ORDER BY c.name ASC
        `).all(listId);
    },
    addMember: (listId, contactId) => {
        return db.prepare('INSERT OR IGNORE INTO list_members (list_id, contact_id) VALUES (?, ?)').run(listId, contactId);
    },
    removeMember: (listId, contactId) => {
        return db.prepare('DELETE FROM list_members WHERE list_id = ? AND contact_id = ?').run(listId, contactId);
    },
    bulkAddMembers: (listId, contactIds) => {
        const stmt = db.prepare('INSERT OR IGNORE INTO list_members (list_id, contact_id) VALUES (?, ?)');
        for (const cid of contactIds) {
            stmt.run(listId, cid);
        }
    },
    setContactLists: (contactId, listIds = []) => {
        db.prepare('DELETE FROM list_members WHERE contact_id = ?').run(contactId);
        const stmt = db.prepare('INSERT OR IGNORE INTO list_members (list_id, contact_id) VALUES (?, ?)');
        for (const lid of listIds) {
            if (lid) stmt.run(lid, contactId);
        }
    }
};

// Campaigns DAO
export const campaignsDao = {
    getAll: () => {
        return db.prepare(`
            SELECT c.*, l.name as list_name
            FROM campaigns c
            LEFT JOIN lists l ON c.list_id = l.id
            ORDER BY c.id DESC
        `).all();
    },
    getById: (id) => {
        return db.prepare(`
            SELECT c.*, l.name as list_name
            FROM campaigns c
            LEFT JOIN lists l ON c.list_id = l.id
            WHERE c.id = ?
        `).get(id);
    },
    create: (campaign) => {
        return db.prepare(`
            INSERT INTO campaigns (name, list_id, session_id, template_text, media_path, delay_min_seconds, delay_max_seconds, batch_count, cooldown_seconds, simulate_typing, status, total_recipients)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            campaign.name,
            campaign.list_id || null,
            campaign.session_id || 'default',
            campaign.template_text,
            campaign.media_path || null,
            campaign.delay_min_seconds !== undefined ? campaign.delay_min_seconds : 5,
            campaign.delay_max_seconds !== undefined ? campaign.delay_max_seconds : 18,
            campaign.batch_count !== undefined ? campaign.batch_count : 15,
            campaign.cooldown_seconds !== undefined ? campaign.cooldown_seconds : 40,
            campaign.simulate_typing !== undefined ? (campaign.simulate_typing ? 1 : 0) : 1,
            campaign.status || 'pending',
            campaign.total_recipients || 0
        );
    },
    updateStatus: (id, status) => {
        return db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(status, id);
    },
    incrementStats: (id, sentDelta = 0, failedDelta = 0) => {
        return db.prepare(`
            UPDATE campaigns
            SET sent_count = sent_count + ?, failed_count = failed_count + ?
            WHERE id = ?
        `).run(sentDelta, failedDelta, id);
    },
    resetStats: (id) => {
        return db.prepare('UPDATE campaigns SET sent_count = 0, failed_count = 0, status = "pending" WHERE id = ?').run(id);
    },
    delete: (id) => db.prepare('DELETE FROM campaigns WHERE id = ?').run(id)
};

// Messages DAO
export const messagesDao = {
    getForCampaign: (campaignId) => {
        return db.prepare('SELECT * FROM messages WHERE campaign_id = ? ORDER BY id ASC').all(campaignId);
    },
    create: (msg) => {
        return db.prepare(`
            INSERT INTO messages (campaign_id, session_id, recipient_phone, recipient_name, message_text, media_url, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            msg.campaign_id,
            msg.session_id,
            msg.recipient_phone,
            msg.recipient_name || '',
            msg.message_text,
            msg.media_url || null,
            msg.status || 'queued'
        );
    },
    bulkCreate: (messages) => {
        const stmt = db.prepare(`
            INSERT INTO messages (campaign_id, session_id, recipient_phone, recipient_name, message_text, media_url, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const m of messages) {
            stmt.run(
                m.campaign_id,
                m.session_id,
                m.recipient_phone,
                m.recipient_name || '',
                m.message_text,
                m.media_url || null,
                'queued'
            );
        }
    },
    updateStatus: (id, status, errorMsg = null, waMsgId = null) => {
        return db.prepare(`
            UPDATE messages
            SET status = ?, error_message = ?, whatsapp_message_id = ?, sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END
            WHERE id = ?
        `).run(status, errorMsg, waMsgId, status, id);
    },
    getQueuedForCampaign: (campaignId) => {
        return db.prepare("SELECT * FROM messages WHERE campaign_id = ? AND status = 'queued' ORDER BY id ASC").all(campaignId);
    },
    resetForCampaign: (campaignId, onlyFailed = false) => {
        if (onlyFailed) {
            return db.prepare("UPDATE messages SET status = 'queued', error_message = null WHERE campaign_id = ? AND status = 'failed'").run(campaignId);
        }
        return db.prepare("UPDATE messages SET status = 'queued', error_message = null, whatsapp_message_id = null WHERE campaign_id = ?").run(campaignId);
    }
};

// Flows DAO
export const flowsDao = {
    getAll: () => db.prepare('SELECT * FROM flows ORDER BY id DESC').all(),
    getById: (id) => db.prepare('SELECT * FROM flows WHERE id = ?').get(id),
    getActive: () => db.prepare('SELECT * FROM flows WHERE is_active = 1').all(),
    getFallback: () => db.prepare('SELECT * FROM flows WHERE is_fallback = 1 AND is_active = 1 LIMIT 1').get(),
    create: (flow) => {
        return db.prepare(`
            INSERT INTO flows (name, trigger_keyword, is_fallback, nodes_graph, edges_graph, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            flow.name,
            flow.trigger_keyword || '',
            flow.is_fallback ? 1 : 0,
            typeof flow.nodes_graph === 'string' ? flow.nodes_graph : JSON.stringify(flow.nodes_graph),
            typeof flow.edges_graph === 'string' ? flow.edges_graph : JSON.stringify(flow.edges_graph),
            flow.is_active !== undefined ? (flow.is_active ? 1 : 0) : 1
        );
    },
    update: (id, flow) => {
        return db.prepare(`
            UPDATE flows
            SET name = ?, trigger_keyword = ?, is_fallback = ?, nodes_graph = ?, edges_graph = ?, is_active = ?
            WHERE id = ?
        `).run(
            flow.name,
            flow.trigger_keyword || '',
            flow.is_fallback ? 1 : 0,
            typeof flow.nodes_graph === 'string' ? flow.nodes_graph : JSON.stringify(flow.nodes_graph),
            typeof flow.edges_graph === 'string' ? flow.edges_graph : JSON.stringify(flow.edges_graph),
            flow.is_active ? 1 : 0,
            id
        );
    },
    delete: (id) => db.prepare('DELETE FROM flows WHERE id = ?').run(id)
};

// Flow Sessions DAO
export const flowSessionsDao = {
    get: (chatJid) => db.prepare('SELECT * FROM flow_sessions WHERE chat_jid = ?').get(chatJid),
    set: (chatJid, flowId, currentNodeId, variables = {}) => {
        let validFlowId = null;
        if (typeof flowId === 'number' && flowId > 0) {
            const exists = db.prepare('SELECT id FROM flows WHERE id = ?').get(flowId);
            if (exists) validFlowId = flowId;
        }
        return db.prepare(`
            INSERT INTO flow_sessions (chat_jid, active_flow_id, current_node_id, variables_json, last_interaction)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(chat_jid) DO UPDATE SET
                active_flow_id = excluded.active_flow_id,
                current_node_id = excluded.current_node_id,
                variables_json = excluded.variables_json,
                last_interaction = CURRENT_TIMESTAMP
        `).run(chatJid, validFlowId, currentNodeId, JSON.stringify(variables));
    },
    clear: (chatJid) => db.prepare('DELETE FROM flow_sessions WHERE chat_jid = ?').run(chatJid)
};

// Knowledge Items DAO
export const knowledgeDao = {
    getAll: () => db.prepare('SELECT * FROM knowledge_items ORDER BY id DESC').all(),
    getById: (id) => db.prepare('SELECT * FROM knowledge_items WHERE id = ?').get(id),
    create: (item) => db.prepare('INSERT INTO knowledge_items (title, content, tags) VALUES (?, ?, ?)').run(item.title, item.content, item.tags || ''),
    update: (id, item) => db.prepare('UPDATE knowledge_items SET title = ?, content = ?, tags = ? WHERE id = ?').run(item.title, item.content, item.tags || '', id),
    delete: (id) => db.prepare('DELETE FROM knowledge_items WHERE id = ?').run(id),
    search: (query) => {
        const pattern = `%${query}%`;
        return db.prepare('SELECT * FROM knowledge_items WHERE title LIKE ? OR content LIKE ? OR tags LIKE ?').all(pattern, pattern, pattern);
    }
};

// Products DAO
export const productsDao = {
    getAll: () => db.prepare('SELECT * FROM products ORDER BY id DESC').all(),
    getById: (id) => db.prepare('SELECT * FROM products WHERE id = ?').get(id),
    create: (p) => db.prepare('INSERT INTO products (sku, title, price, description, image_path, in_stock) VALUES (?, ?, ?, ?, ?, ?)').run(
        p.sku || null, p.title, p.price, p.description || '', p.image_path || null, p.in_stock ? 1 : 0
    ),
    update: (id, p) => db.prepare('UPDATE products SET sku = ?, title = ?, price = ?, description = ?, image_path = ?, in_stock = ? WHERE id = ?').run(
        p.sku || null, p.title, p.price, p.description || '', p.image_path || null, p.in_stock ? 1 : 0, id
    ),
    delete: (id) => db.prepare('DELETE FROM products WHERE id = ?').run(id),
    search: (query) => {
        const pattern = `%${query}%`;
        return db.prepare('SELECT * FROM products WHERE title LIKE ? OR description LIKE ? OR sku LIKE ?').all(pattern, pattern, pattern);
    }
};

// Sessions DAO
export const sessionsDao = {
    getAll: () => db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all(),
    get: (sessionId) => db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId),
    upsert: (sessionId, sessionName, status, phoneNumber = null) => {
        return db.prepare(`
            INSERT INTO sessions (session_id, session_name, status, phone_number, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(session_id) DO UPDATE SET
                session_name = COALESCE(excluded.session_name, sessions.session_name),
                status = excluded.status,
                phone_number = COALESCE(excluded.phone_number, sessions.phone_number),
                updated_at = CURRENT_TIMESTAMP
        `).run(sessionId, sessionName, status, phoneNumber);
    },
    delete: (sessionId) => db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId)
};

// Chat Logs DAO
export const chatLogsDao = {
    log: (sessionId, fromJid, toJid, text, direction) => {
        // Prevent duplicate logging of identical messages within 3 seconds
        try {
            const recent = db.prepare(`
                SELECT id FROM chat_logs 
                WHERE message_text = ? AND direction = ?
                  AND (from_jid = ? OR to_jid = ? OR from_jid = ? OR to_jid = ?)
                  AND timestamp >= datetime('now', '-3 seconds')
                ORDER BY id DESC LIMIT 1
            `).get(text, direction, fromJid, toJid, toJid, fromJid);
            if (recent) {
                return { id: recent.id, isDuplicate: true };
            }
        } catch (_) {}

        const res = db.prepare(`
            INSERT INTO chat_logs (session_id, from_jid, to_jid, message_text, direction)
            VALUES (?, ?, ?, ?, ?)
        `).run(sessionId, fromJid, toJid, text, direction);
        return { id: res.lastInsertRowid, isDuplicate: false };
    },
    getRecent: (limit = 100) => {
        return db.prepare('SELECT * FROM chat_logs ORDER BY id DESC LIMIT ?').all(limit);
    },
    getConversations: () => {
        const rows = db.prepare(`
            WITH RawChats AS (
                SELECT 
                    cl.id,
                    cl.session_id,
                    CASE WHEN cl.direction = 'incoming' THEN cl.from_jid ELSE cl.to_jid END AS contact_jid,
                    cl.message_text,
                    cl.direction,
                    cl.timestamp
                FROM chat_logs cl
                WHERE (cl.from_jid != 'me' AND cl.from_jid IS NOT NULL) OR (cl.to_jid != 'me' AND cl.to_jid IS NOT NULL)
            ),
            ResolvedChats AS (
                SELECT 
                    rc.*,
                    COALESCE(
                        lm.phone_number,
                        NULLIF(REPLACE(REPLACE(REPLACE(REPLACE(rc.contact_jid, '@s.whatsapp.net', ''), '@c.us', ''), '+', ''), ' ', ''), ''),
                        rc.contact_jid
                    ) as canonical_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY COALESCE(
                            lm.phone_number,
                            NULLIF(REPLACE(REPLACE(REPLACE(REPLACE(rc.contact_jid, '@s.whatsapp.net', ''), '@c.us', ''), '+', ''), ' ', ''), ''),
                            rc.contact_jid
                        )
                        ORDER BY rc.id DESC
                    ) as rn
                FROM RawChats rc
                LEFT JOIN lid_mappings lm ON lm.lid = rc.contact_jid
            )
            SELECT 
                rc.id,
                rc.session_id,
                rc.contact_jid,
                rc.message_text AS last_message,
                rc.direction AS last_direction,
                rc.timestamp AS last_timestamp,
                COALESCE(c.name, lm.push_name, lm_rev.push_name, '') AS contact_name,
                COALESCE(lm.phone_number, lm_rev.phone_number) AS resolved_phone,
                COALESCE(lm.push_name, lm_rev.push_name) AS push_name,
                MAX(COALESCE(cs.bot_disabled, 0)) AS bot_disabled,
                MAX(COALESCE(cs.human_agent_requested, 0)) AS human_agent_requested,
                GROUP_CONCAT(DISTINCT cl.label_name) AS labels
            FROM ResolvedChats rc
            LEFT JOIN lid_mappings lm ON lm.lid = rc.contact_jid
            LEFT JOIN lid_mappings lm_rev ON (lm_rev.phone_number = REPLACE(REPLACE(rc.contact_jid, '@s.whatsapp.net', ''), '@c.us', ''))
            LEFT JOIN contacts c ON (
                c.phone = REPLACE(REPLACE(REPLACE(REPLACE(rc.contact_jid, '@s.whatsapp.net', ''), '@c.us', ''), '+', ''), ' ', '')
                OR (lm.phone_number IS NOT NULL AND c.phone = lm.phone_number)
            )
            LEFT JOIN conversation_status cs ON (
                cs.chat_jid = rc.contact_jid
                OR (lm.phone_jid IS NOT NULL AND cs.chat_jid = lm.phone_jid)
                OR (lm.phone_number IS NOT NULL AND cs.chat_jid = lm.phone_number || '@s.whatsapp.net')
                OR (lm_rev.lid IS NOT NULL AND cs.chat_jid = lm_rev.lid)
            )
            LEFT JOIN conversation_labels cl ON (
                cl.chat_jid = rc.contact_jid
                OR (lm.phone_jid IS NOT NULL AND cl.chat_jid = lm.phone_jid)
                OR (lm.phone_number IS NOT NULL AND cl.chat_jid = lm.phone_number || '@s.whatsapp.net')
                OR (lm_rev.lid IS NOT NULL AND cl.chat_jid = lm_rev.lid)
            )
            WHERE rc.rn = 1
            GROUP BY rc.canonical_id
            ORDER BY rc.id DESC
        `).all();

        return rows.map(r => ({
            ...r,
            labels: r.labels ? r.labels.split(',').filter(Boolean) : []
        }));
    },
    deleteConversation: (chatJid) => {
        const jids = getRelatedJids(chatJid);
        const placeholders = jids.map(() => '?').join(',');

        // 1. Delete chat logs
        db.prepare(`DELETE FROM chat_logs WHERE from_jid IN (${placeholders}) OR to_jid IN (${placeholders})`).run(...jids, ...jids);

        // 2. Delete conversation status
        db.prepare(`DELETE FROM conversation_status WHERE chat_jid IN (${placeholders})`).run(...jids);

        // 3. Delete flow sessions
        db.prepare(`DELETE FROM flow_sessions WHERE chat_jid IN (${placeholders})`).run(...jids);

        // 4. Delete conversation labels
        db.prepare(`DELETE FROM conversation_labels WHERE chat_jid IN (${placeholders})`).run(...jids);

        return { deletedJids: jids };
    },
    deleteMultipleConversations: (chatJids) => {
        if (!Array.isArray(chatJids) || chatJids.length === 0) return { deletedJids: [] };
        const allJids = new Set();
        for (const jid of chatJids) {
            const rel = getRelatedJids(jid);
            for (const r of rel) allJids.add(r);
        }
        const jids = Array.from(allJids);
        if (jids.length === 0) return { deletedJids: [] };
        const placeholders = jids.map(() => '?').join(',');

        db.prepare(`DELETE FROM chat_logs WHERE from_jid IN (${placeholders}) OR to_jid IN (${placeholders})`).run(...jids, ...jids);
        db.prepare(`DELETE FROM conversation_status WHERE chat_jid IN (${placeholders})`).run(...jids);
        db.prepare(`DELETE FROM flow_sessions WHERE chat_jid IN (${placeholders})`).run(...jids);
        db.prepare(`DELETE FROM conversation_labels WHERE chat_jid IN (${placeholders})`).run(...jids);

        return { deletedJids: jids };
    },
    deleteMessage: (id) => {
        const row = db.prepare('SELECT id, from_jid, to_jid FROM chat_logs WHERE id = ?').get(id);
        if (!row) return { deleted: false };
        db.prepare('DELETE FROM chat_logs WHERE id = ?').run(id);
        return { deleted: true, message: row };
    },
    getMessagesForJid: (jid, limit = 100) => {
        const jids = getRelatedJids(jid);
        const placeholders = jids.map(() => '?').join(',');
        return db.prepare(`
            SELECT * FROM (
                SELECT * FROM chat_logs
                WHERE from_jid IN (${placeholders}) OR to_jid IN (${placeholders})
                ORDER BY id DESC
                LIMIT ?
            )
            ORDER BY id ASC
        `).all(...jids, ...jids, limit);
    }
};

// Helper: Resolve all linked WhatsApp identities (LID, phone_jid, phone_number)
export const getRelatedJids = (chatJid) => {
    if (!chatJid) return [];
    const jidSet = new Set([chatJid]);
    try {
        const lidEntry = db.prepare('SELECT * FROM lid_mappings WHERE lid = ?').get(chatJid);
        if (lidEntry) {
            if (lidEntry.phone_jid) jidSet.add(lidEntry.phone_jid);
            if (lidEntry.phone_number) {
                const clean = lidEntry.phone_number.replace(/\D/g, '');
                if (clean) {
                    jidSet.add(`${clean}@s.whatsapp.net`);
                    jidSet.add(`${clean}@c.us`);
                }
            }
        } else {
            const cleanNumber = chatJid.replace(/@.*$/, '').replace(/\D/g, '');
            if (cleanNumber) {
                jidSet.add(`${cleanNumber}@s.whatsapp.net`);
                jidSet.add(`${cleanNumber}@c.us`);
                const mappedLids = db.prepare('SELECT lid, phone_jid FROM lid_mappings WHERE phone_number = ? OR phone_jid LIKE ?').all(cleanNumber, `%${cleanNumber}%`);
                for (const row of mappedLids) {
                    if (row.lid) jidSet.add(row.lid);
                    if (row.phone_jid) jidSet.add(row.phone_jid);
                }
            }
        }
    } catch (e) {
        console.warn('Error resolving related JIDs:', e.message);
    }
    return Array.from(jidSet);
};

// Conversation Status & Human Agent Takeover DAO
export const conversationStatusDao = {
    get: (chatJid) => {
        const jids = getRelatedJids(chatJid);
        const placeholders = jids.map(() => '?').join(',');
        const row = db.prepare(`
            SELECT 
                COALESCE(MAX(bot_disabled), 0) as bot_disabled,
                COALESCE(MAX(human_agent_requested), 0) as human_agent_requested,
                GROUP_CONCAT(notes) as notes
            FROM conversation_status 
            WHERE chat_jid IN (${placeholders})
        `).get(...jids);
        return {
            bot_disabled: row?.bot_disabled ? 1 : 0,
            human_agent_requested: row?.human_agent_requested ? 1 : 0,
            notes: row?.notes || null
        };
    },
    isBotDisabled: (chatJid) => {
        const jids = getRelatedJids(chatJid);
        const placeholders = jids.map(() => '?').join(',');
        const row = db.prepare(`
            SELECT COALESCE(MAX(bot_disabled), 0) as bot_disabled 
            FROM conversation_status 
            WHERE chat_jid IN (${placeholders})
        `).get(...jids);
        return row ? !!row.bot_disabled : false;
    },
    setBotDisabled: (chatJid, botDisabled, humanAgentRequested = false, notes = null) => {
        const jids = getRelatedJids(chatJid);
        const stmt = db.prepare(`
            INSERT INTO conversation_status (chat_jid, bot_disabled, human_agent_requested, notes, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(chat_jid) DO UPDATE SET
                bot_disabled = excluded.bot_disabled,
                human_agent_requested = CASE 
                    WHEN excluded.bot_disabled = 0 THEN 0 
                    WHEN excluded.human_agent_requested = 1 THEN 1 
                    ELSE conversation_status.human_agent_requested 
                END,
                notes = COALESCE(excluded.notes, conversation_status.notes),
                updated_at = CURRENT_TIMESTAMP
        `);
        for (const j of jids) {
            stmt.run(j, botDisabled ? 1 : 0, humanAgentRequested ? 1 : 0, notes);
        }
    },
    clearHumanRequested: (chatJid, alsoEnableBot = true) => {
        const jids = getRelatedJids(chatJid);
        const placeholders = jids.map(() => '?').join(',');
        if (alsoEnableBot) {
            return db.prepare(`
                UPDATE conversation_status 
                SET human_agent_requested = 0, bot_disabled = 0, updated_at = CURRENT_TIMESTAMP 
                WHERE chat_jid IN (${placeholders})
            `).run(...jids);
        }
        return db.prepare(`
            UPDATE conversation_status 
            SET human_agent_requested = 0, updated_at = CURRENT_TIMESTAMP 
            WHERE chat_jid IN (${placeholders})
        `).run(...jids);
    },
    getAll: () => {
        return db.prepare('SELECT * FROM conversation_status').all();
    }
};

// LID (Linked Identity) to Phone Mapping DAO
export const lidMappingsDao = {
    get: (lid) => {
        return db.prepare('SELECT * FROM lid_mappings WHERE lid = ?').get(lid);
    },
    getByPhone: (phone) => {
        const cleanPhone = phone.replace(/\D/g, '');
        return db.prepare('SELECT * FROM lid_mappings WHERE phone_number = ? OR phone_jid LIKE ?').get(cleanPhone, `%${cleanPhone}%`);
    },
    upsert: (lid, phoneJid = null, phoneNumber = null, pushName = null) => {
        let cleanPhone = phoneNumber ? phoneNumber.replace(/\D/g, '') : null;
        if (!cleanPhone && phoneJid) {
            cleanPhone = phoneJid.split('@')[0].replace(/\D/g, '');
        }
        return db.prepare(`
            INSERT INTO lid_mappings (lid, phone_jid, phone_number, push_name, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(lid) DO UPDATE SET
                phone_jid = COALESCE(excluded.phone_jid, lid_mappings.phone_jid),
                phone_number = COALESCE(excluded.phone_number, lid_mappings.phone_number),
                push_name = COALESCE(excluded.push_name, lid_mappings.push_name),
                updated_at = CURRENT_TIMESTAMP
        `).run(lid, phoneJid, cleanPhone, pushName);
    },
    getAll: () => {
        return db.prepare('SELECT * FROM lid_mappings ORDER BY updated_at DESC').all();
    }
};

// Custom Chat Labels DAO
export const labelsDao = {
    getAll: () => {
        return db.prepare(`
            SELECT 
                cl.id,
                cl.name,
                cl.color,
                cl.created_at,
                COUNT(DISTINCT conv_l.chat_jid) as chat_count
            FROM chat_labels cl
            LEFT JOIN conversation_labels conv_l ON conv_l.label_name = cl.name
            GROUP BY cl.id
            ORDER BY cl.name ASC
        `).all();
    },
    getByName: (name) => {
        return db.prepare('SELECT * FROM chat_labels WHERE name = ?').get(name);
    },
    create: (name, color = '#10b981') => {
        return db.prepare('INSERT OR IGNORE INTO chat_labels (name, color) VALUES (?, ?)').run(name.trim(), color);
    },
    delete: (name) => {
        db.prepare('DELETE FROM conversation_labels WHERE label_name = ?').run(name);
        return db.prepare('DELETE FROM chat_labels WHERE name = ?').run(name);
    }
};

// Conversation Labels DAO (associating tags with chat JIDs)
export const conversationLabelsDao = {
    get: (chatJid) => {
        const rows = db.prepare('SELECT label_name FROM conversation_labels WHERE chat_jid = ?').all(chatJid);
        return rows.map(r => r.label_name);
    },
    set: (chatJid, labelsArray) => {
        const jids = getRelatedJids(chatJid);
        const placeholders = jids.map(() => '?').join(',');

        db.prepare(`DELETE FROM conversation_labels WHERE chat_jid IN (${placeholders})`).run(...jids);

        const insertStmt = db.prepare('INSERT OR IGNORE INTO conversation_labels (chat_jid, label_name) VALUES (?, ?)');
        for (const jid of jids) {
            for (const label of labelsArray) {
                if (label && typeof label === 'string' && label.trim()) {
                    insertStmt.run(jid, label.trim());
                }
            }
        }
        return true;
    },
    add: (chatJid, labelName) => {
        return db.prepare('INSERT OR IGNORE INTO conversation_labels (chat_jid, label_name) VALUES (?, ?)').run(chatJid, labelName.trim());
    },
    remove: (chatJid, labelName) => {
        return db.prepare('DELETE FROM conversation_labels WHERE chat_jid = ? AND label_name = ?').run(chatJid, labelName.trim());
    }
};

// Settings DAO
export const settingsDao = {
    getAll: () => {
        const rows = db.prepare('SELECT * FROM settings').all();
        const obj = {};
        for (const r of rows) obj[r.key] = r.value;
        return obj;
    },
    get: (key) => {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return row ? row.value : null;
    },
    set: (key, value) => {
        return db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
    },
    setMultiple: (entries) => {
        const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
        for (const [k, v] of Object.entries(entries)) {
            stmt.run(k, String(v));
        }
    }
};

// Analytics & Dashboard DAO
export const analyticsDao = {
    getStats: () => {
        const totalContacts = db.prepare('SELECT COUNT(*) as count FROM contacts').get()?.count || 0;
        const totalCampaigns = db.prepare('SELECT COUNT(*) as count FROM campaigns').get()?.count || 0;
        const totalSent = db.prepare("SELECT COUNT(*) as count FROM messages WHERE status = 'sent'").get()?.count || 0;
        const totalFailed = db.prepare("SELECT COUNT(*) as count FROM messages WHERE status = 'failed'").get()?.count || 0;
        const totalQueued = db.prepare("SELECT COUNT(*) as count FROM messages WHERE status = 'queued'").get()?.count || 0;
        const totalFlows = db.prepare('SELECT COUNT(*) as count FROM flows WHERE is_active = 1').get()?.count || 0;
        const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get()?.count || 0;
        const connectedSessions = db.prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'connected'").get()?.count || 0;

        return {
            totalContacts,
            totalCampaigns,
            totalSent,
            totalFailed,
            totalQueued,
            totalFlows,
            totalProducts,
            connectedSessions
        };
    }
};

export function factoryResetDatabase() {
    try {
        db.exec('PRAGMA foreign_keys = OFF;');

        db.exec(`
            DELETE FROM list_members;
            DELETE FROM lists;
            DELETE FROM contacts;
            DELETE FROM messages;
            DELETE FROM campaigns;
            DELETE FROM flow_sessions;
            DELETE FROM flows;
            DELETE FROM knowledge_items;
            DELETE FROM products;
            DELETE FROM chat_logs;
            DELETE FROM conversation_labels;
            DELETE FROM conversation_status;
            DELETE FROM lid_mappings;
            DELETE FROM chat_labels;
            DELETE FROM sessions;
            DELETE FROM settings;
        `);

        try {
            db.exec("DELETE FROM sqlite_sequence WHERE name IN ('contacts', 'lists', 'campaigns', 'messages', 'flows', 'knowledge_items', 'products', 'chat_logs', 'chat_labels');");
        } catch (_) {}

        db.exec('PRAGMA foreign_keys = ON;');
        db.exec('VACUUM;');

        // 1. Seed default chat labels
        const defaultLabels = [
            { name: 'VIP', color: '#8b5cf6' },
            { name: 'Lead', color: '#10b981' },
            { name: 'Urgent', color: '#f43f5e' },
            { name: 'Follow-up', color: '#f59e0b' }
        ];
        const insLabel = db.prepare('INSERT OR IGNORE INTO chat_labels (name, color) VALUES (?, ?)');
        for (const l of defaultLabels) {
            insLabel.run(l.name, l.color);
        }

        // 2. Seed default settings
        const defaultSettings = [
            { key: 'ai_provider', value: 'local_ollama' },
            { key: 'ollama_endpoint', value: 'http://localhost:11434' },
            { key: 'ollama_model', value: 'llama3:latest' },
            { key: 'gemini_api_key', value: '' },
            { key: 'openai_api_key', value: '' },
            { key: 'ai_system_prompt', value: 'You are an intelligent customer support and sales assistant for WhatsApp CRM. Respond helpfully, politely, and concisely.' },
            { key: 'ai_enabled_globally', value: 'true' },
            { key: 'auto_responder_mode', value: 'hybrid' },
            { key: 'default_min_delay', value: '8' },
            { key: 'default_max_delay', value: '20' },
            { key: 'notify_self_on_handover', value: 'true' },
            { key: 'handover_notify_phone', value: '' }
        ];
        const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
        for (const s of defaultSettings) {
            insSetting.run(s.key, s.value);
        }

        // 3. Seed default primary session
        db.prepare("INSERT INTO sessions (session_id, session_name, status) VALUES ('default', 'Primary WhatsApp', 'disconnected')").run();

        // 4. Seed sample welcome & sales menu flow
        const sampleNodes = [
            {
                id: 'node-trigger',
                type: 'trigger',
                position: { x: 100, y: 150 },
                data: { label: 'Keyword Trigger', keyword: 'hello', description: 'Triggers when customer sends hello, hi, or info' }
            },
            {
                id: 'node-welcome',
                type: 'message',
                position: { x: 380, y: 150 },
                data: { label: 'Welcome Message', content: 'Hello! 👋 Welcome to our CRM Service. How can we assist you today?\\n\\n1️⃣ View Products\\n2️⃣ Contact Sales Rep\\n3️⃣ Talk to AI Assistant' }
            },
            {
                id: 'node-menu',
                type: 'menu',
                position: { x: 680, y: 150 },
                data: {
                    label: 'Main Menu',
                    options: [
                        { key: '1', label: 'View Products', targetNodeId: 'node-products' },
                        { key: '2', label: 'Sales Rep', targetNodeId: 'node-sales' },
                        { key: '3', label: 'AI Support', targetNodeId: 'node-ai' }
                    ]
                }
            },
            {
                id: 'node-products',
                type: 'message',
                position: { x: 1000, y: 50 },
                data: { label: 'Product Catalog', content: '📦 Here are our featured packages:\\n• Starter CRM Plan - $29/mo\\n• Enterprise Multi-Agent Suite - $99/mo\\n\\nReply "ORDER" or ask anything!' }
            },
            {
                id: 'node-sales',
                type: 'message',
                position: { x: 1000, y: 200 },
                data: { label: 'Sales Routing', content: '👤 An agent has been notified and will message you shortly during business hours (9 AM - 6 PM EST).' }
            },
            {
                id: 'node-ai',
                type: 'message',
                position: { x: 1000, y: 350 },
                data: { label: 'AI Assistant Handover', content: '🤖 AI Agent is active! Feel free to ask any question about our products, pricing, or support.' }
            }
        ];

        const sampleEdges = [
            { id: 'e1-2', source: 'node-trigger', target: 'node-welcome' },
            { id: 'e2-3', source: 'node-welcome', target: 'node-menu' },
            { id: 'e3-p', source: 'node-menu', target: 'node-products', sourceHandle: 'opt-0' },
            { id: 'e3-s', source: 'node-menu', target: 'node-sales', sourceHandle: 'opt-1' },
            { id: 'e3-a', source: 'node-menu', target: 'node-ai', sourceHandle: 'opt-2' }
        ];

        db.prepare(`
            INSERT INTO flows (name, trigger_keyword, is_fallback, nodes_graph, edges_graph, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run('Welcome & Sales Menu Flow', 'hello,hi,start,menu', 0, JSON.stringify(sampleNodes), JSON.stringify(sampleEdges), 1);

        // 5. Seed default AI Concierge Template (Inactive)
        const aiTemplateNodes = [
            {
                id: 'node-trigger-1',
                type: 'trigger',
                position: { x: 60, y: 180 },
                data: { label: 'Catch-All Trigger (*)', keyword: '*' }
            },
            {
                id: 'node-ai-1',
                type: 'ai_handover',
                position: { x: 380, y: 180 },
                data: {
                    label: 'AI Expert Assistant',
                    introText: '🤖 *AI Specialist Connected!*\\nWelcome! Ask me any question about our products, pricing, or custom requests.',
                    systemPrompt: 'You are an expert sales and support consultant assisting customers over WhatsApp. Answer accurately from the live catalog and knowledge base. Be friendly, concise, and professional.',
                    escalateOnConfusion: true,
                    confusionKeywords: 'human, agent, person, confused, help, call me, speak to someone, operator',
                    handoverMessage: '🔔 Connecting you with a live human support specialist. One moment please while our team reviews your conversation...'
                }
            },
            {
                id: 'node-human-1',
                type: 'human_handover',
                position: { x: 740, y: 180 },
                data: {
                    label: 'Live Human Support Handover',
                    message: '🔔 Connecting you with a live human support specialist. One moment please while our team reviews your conversation...',
                    note: 'Customer requested live support or AI guardrail triggered due to confusion.'
                }
            }
        ];

        const aiTemplateEdges = [
            {
                id: 'e-trigger-ai',
                source: 'node-trigger-1',
                target: 'node-ai-1',
                animated: true,
                style: { stroke: '#10b981', strokeWidth: 2 },
                markerEnd: { type: 'arrowclosed', color: '#10b981' }
            },
            {
                id: 'e-ai-human',
                source: 'node-ai-1',
                target: 'node-human-1',
                label: 'Escalate to Human',
                animated: true,
                style: { stroke: '#ef4444', strokeWidth: 2 },
                markerEnd: { type: 'arrowclosed', color: '#ef4444' }
            }
        ];

        db.prepare(`
            INSERT INTO flows (name, trigger_keyword, is_fallback, nodes_graph, edges_graph, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            'AI Concierge with Smart Human Escalation (Template)',
            '*',
            0,
            JSON.stringify(aiTemplateNodes),
            JSON.stringify(aiTemplateEdges),
            0
        );

        // 6. Seed sample knowledge base
        db.prepare('INSERT INTO knowledge_items (title, content, tags) VALUES (?, ?, ?)').run(
            'Company Overview & Hours',
            'We provide automated WhatsApp CRM and campaign automation tools. Our office hours are Monday to Friday 9 AM to 6 PM EST. Live support is available 24/7 via ticket.',
            'hours,support,company'
        );
        db.prepare('INSERT INTO knowledge_items (title, content, tags) VALUES (?, ?, ?)').run(
            'Pricing & Refund Policy',
            'Starter plans cost $29/month. Enterprise plans cost $99/month. All plans come with a 14-day money-back guarantee with zero questions asked.',
            'pricing,refund,cost'
        );

        // 7. Seed sample products
        db.prepare('INSERT INTO products (sku, title, price, description, in_stock) VALUES (?, ?, ?, ?, ?)').run(
            'CRM-PRO-01',
            'WhatsApp CRM Pro License',
            49.00,
            'Full desktop automation suite with unlimited contacts, flow builder, and multi-session WhatsApp support.',
            1
        );
        db.prepare('INSERT INTO products (sku, title, price, description, in_stock) VALUES (?, ?, ?, ?, ?)').run(
            'AI-ADDON-02',
            'AI Auto-Responder Addon',
            29.00,
            'Automated AI agent query resolution connected to your local knowledge base or Ollama/Gemini API.',
            1
        );

        return true;
    } catch (err) {
        console.error('Factory reset database error:', err);
        throw err;
    }
}

export default db;

