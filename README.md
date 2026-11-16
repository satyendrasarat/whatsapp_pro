# WhatsApp Automation & CRM Platform ⚡

A high-performance, independent desktop WhatsApp CRM and automation platform built from scratch without commercial license locks.

---

## 🌟 Key Features

1. **WhatsApp Multi-Device Engine (`@whiskeysockets/baileys`)**
   - Connect one or multiple WhatsApp accounts simultaneously.
   - Live QR code generation with auto-refresh.
   - MultiFileAuthState persistent encrypted session tokens.
   - Auto-reconnection backoff routines.

2. **Embedded SQLite Database (`node:sqlite`)**
   - Zero external database installation or setup required.
   - High-speed WAL mode with relational foreign key cascading.
   - Complete data schemas for Contacts, Lists, Campaigns, Message Queue, Visual Flows, and AI Knowledge items.

3. **Anti-Ban Campaign Dispatcher (`p-queue`)**
   - Randomized jitter delay (e.g. 8s – 20s) between messages to simulate natural typing and avoid WhatsApp rate-limiting.
   - Dynamic Spintax syntax parser: `{Hello|Hi|Greetings} {{name}}`.
   - Variable substitution: `{{name}}`, `{{phone}}`, `{{notes}}`, custom tags.
   - Campaign control: Start, Pause, Resume, and Cancel at any point.
   - Real-time Message Queue Inspector.

4. **Visual Interactive Flow & Chatbot Builder (`@xyflow/react`)**
   - Node-based visual canvas editor with custom WhatsApp cards.
   - Custom nodes:
     - ⚡ **Trigger Node**: Keyword matchers (e.g. `hello, hi, start, menu`).
     - 💬 **Message Node**: Automated speech responses.
     - 🔀 **Menu Node**: Multi-option branching with discrete output handles.
     - 🌿 **Condition Node**: Pattern matching and conditional branches.
   - Stateful branching dialogue memory per customer (`flow_sessions`).
   - Built-in **Interactive Flow Simulator** to test conversations live inside the app.

5. **WhatsApp Group Grabber & LID-to-Phone Resolver**
   - Fetches all participating WhatsApp groups.
   - Resolves hidden Linked Identities (`@lid`) into real international phone numbers using the Signal repository cache.
   - One-click import group participants directly into targeted Contact Lists.

6. **AI Agent & Knowledge Base Studio**
   - Reference documentation / FAQs and Product Catalog management.
   - Retrieval-Augmented Generation (RAG) query answering.
   - Supports:
     - **Local Ollama** (100% private, free offline AI)
     - **Google Gemini 1.5 Flash** (Ultra fast cloud API)
     - **OpenAI GPT-4o-mini**
     - **Built-in Smart RAG Auto-Responder** (operates automatically even without API keys).
   - Built-in **AI Studio Simulator** to test customer queries in real-time.

7. **Contact Management & Excel/CSV Importer**
   - Drag-and-drop Excel (`.xlsx`, `.xls`) or CSV files.
   - Automatic column detection (Phone, Name, Notes, Tags).
   - International phone validation with `libphonenumber-js`.
   - Audience segmentation with custom Contact Lists.

---

## 🚀 How to Run the Application

### Option 1: Desktop Mode (Electron)
Launch the full desktop application window:
```bash
npm run electron:dev
```
*(Runs the backend server, Vite dev server, and Electron desktop window concurrently).*

### Option 2: Web / Browser Mode
You can also run and use the full application in your browser:
```bash
# 1. Start backend server (serves API, WebSockets, and built UI):
npm start

# Or for hot-reloading frontend development:
npm run dev:all
```
Open your browser at:
👉 **`http://localhost:3001`** (or `http://localhost:5173` in Vite dev mode)

---

## 🛠️ Project Structure

```
D:\crmnewsarat\
├── electron/
│   ├── main.js                  # Electron main process & backend supervisor
│   └── preload.js               # Secure IPC contextBridge
├── server/
│   ├── index.js                 # Express REST & WebSocket server
│   ├── db.js                    # Embedded SQLite (node:sqlite) DAO layer
│   ├── schema.sql               # Relational database schemas
│   ├── engineHost.js            # Baileys WhatsApp Multi-Device session manager
│   ├── campaignDispatcher.js    # Anti-ban Spintax & jitter delay queue
│   ├── flowEngine.js            # Visual flow execution state machine
│   ├── aiEngine.js              # Ollama / Gemini / RAG auto-responder
│   └── groupGrabber.js          # WhatsApp group scraper & LID resolver
├── src/
│   ├── flow-nodes/              # React Flow custom node components
│   │   ├── TriggerNode.jsx
│   │   ├── MessageNode.jsx
│   │   ├── MenuNode.jsx
│   │   └── ConditionNode.jsx
│   ├── pages/
│   │   ├── Dashboard.jsx        # Analytics KPIs & live message stream
│   │   ├── Connections.jsx      # WhatsApp QR scanner & session manager
│   │   ├── Contacts.jsx         # Contact tables & Excel/CSV importer
│   │   ├── Campaigns.jsx        # Campaign creator & queue inspector
│   │   ├── FlowBuilder.jsx      # Visual interactive node canvas & simulator
│   │   ├── GroupGrabber.jsx     # Group member extractor & list importer
│   │   ├── AIAssistant.jsx      # Knowledge items, products, & AI settings
│   │   └── Settings.jsx         # Anti-ban safety controls & DB info
│   ├── components/              # Sidebar, Header, Modal, StatusBadge
│   ├── services/api.js          # REST & WebSocket client
│   ├── App.jsx
│   └── main.jsx
├── dist/                        # Production-ready bundled assets
├── data/                        # Persistent SQLite database storage
└── sessions/                    # WhatsApp encrypted session tokens
```

