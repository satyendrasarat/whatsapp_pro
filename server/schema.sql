-- WhatsApp Automation & CRM Platform Database Schema
-- Embedded SQLite compatible (node:sqlite)

-- 1. Contacts & Segmentation
CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE,
    name TEXT,
    notes TEXT,
    tags TEXT,
    custom_fields TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS list_members (
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (list_id, contact_id)
);

-- 2. Bulk Campaigns & Queue
CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    list_id INTEGER REFERENCES lists(id),
    session_id TEXT DEFAULT 'default',
    template_text TEXT NOT NULL,
    media_path TEXT,
    delay_min_seconds INTEGER DEFAULT 5,
    delay_max_seconds INTEGER DEFAULT 18,
    batch_count INTEGER DEFAULT 15,
    cooldown_seconds INTEGER DEFAULT 40,
    simulate_typing BOOLEAN DEFAULT 1,
    status TEXT DEFAULT 'pending', -- pending, running, paused, completed, cancelled
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    recipient_name TEXT,
    message_text TEXT NOT NULL,
    media_url TEXT,
    status TEXT DEFAULT 'queued', -- queued, sent, delivered, read, failed
    whatsapp_message_id TEXT,
    error_message TEXT,
    sent_at DATETIME
);

-- 3. Visual Automation Flows
CREATE TABLE IF NOT EXISTS flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    trigger_keyword TEXT,
    is_fallback BOOLEAN DEFAULT 0,
    nodes_graph TEXT NOT NULL, -- JSON formatted React Flow nodes
    edges_graph TEXT NOT NULL, -- JSON formatted React Flow edges
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flow_sessions (
    chat_jid TEXT PRIMARY KEY,
    active_flow_id INTEGER REFERENCES flows(id) ON DELETE SET NULL,
    current_node_id TEXT,
    variables_json TEXT,
    last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. AI Knowledge Base & Products
CREATE TABLE IF NOT EXISTS knowledge_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE,
    title TEXT NOT NULL,
    price REAL NOT NULL,
    description TEXT,
    image_path TEXT,
    in_stock BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. WhatsApp Sessions & Configuration
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    session_name TEXT,
    status TEXT DEFAULT 'disconnected', -- disconnected, qr_ready, connecting, connected
    phone_number TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    from_jid TEXT,
    to_jid TEXT,
    message_text TEXT,
    direction TEXT, -- incoming, outgoing
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- 6. Live Chat Inbox & Human Agent Takeover
CREATE TABLE IF NOT EXISTS conversation_status (
    chat_jid TEXT PRIMARY KEY,
    bot_disabled INTEGER DEFAULT 0,
    human_agent_requested INTEGER DEFAULT 0,
    notes TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. WhatsApp LID (Linked Identity) to Phone Mapping Cache
CREATE TABLE IF NOT EXISTS lid_mappings (
    lid TEXT PRIMARY KEY,
    phone_jid TEXT,
    phone_number TEXT,
    push_name TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Custom Chat Labels & Tags
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



