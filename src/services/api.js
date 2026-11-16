const BASE_URL = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001';

class ApiService {
  constructor() {
    this.ws = null;
    this.wsListeners = new Set();
    this.initWebSocket();
  }

  initWebSocket() {
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('Connected to WhatsApp CRM WebSocket server');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          for (const listener of this.wsListeners) {
            listener(data);
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected. Reconnecting in 3s...');
        setTimeout(() => this.initWebSocket(), 3000);
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
      };
    } catch (e) {
      console.warn('WebSocket init exception:', e);
    }
  }

  subscribe(listener) {
    this.wsListeners.add(listener);
    return () => this.wsListeners.delete(listener);
  }

  async request(endpoint, options = {}) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }
    return res.json();
  }

  // Analytics
  getAnalytics() {
    return this.request('/analytics');
  }

  // Sessions
  getSessions() {
    return this.request('/sessions');
  }

  startSession(sessionId, sessionName) {
    return this.request('/sessions/start', {
      method: 'POST',
      body: JSON.stringify({ sessionId, sessionName })
    });
  }

  stopSession(sessionId) {
    return this.request('/sessions/stop', {
      method: 'POST',
      body: JSON.stringify({ sessionId })
    });
  }

  deleteSession(sessionId) {
    return this.request(`/sessions/${sessionId}`, { method: 'DELETE' });
  }

  relinkSession(sessionId, sessionName = 'Primary WhatsApp') {
    return this.request(`/sessions/${sessionId}/relink`, {
      method: 'POST',
      body: JSON.stringify({ sessionName })
    });
  }

  sendDirectMessage(jid, messageText, sessionId = 'default', mediaUrl = null) {
    return this.request('/chat/send', {
      method: 'POST',
      body: JSON.stringify({ jid, messageText, sessionId, mediaUrl })
    });
  }

  // Contacts
  getContacts(listId = null) {
    return this.request(listId ? `/contacts?list_id=${listId}` : '/contacts');
  }

  createContact(contact) {
    return this.request('/contacts', {
      method: 'POST',
      body: JSON.stringify(contact)
    });
  }

  updateContact(id, contact) {
    return this.request(`/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(contact)
    });
  }

  deleteContact(id) {
    return this.request(`/contacts/${id}`, { method: 'DELETE' });
  }

  bulkDeleteContacts(ids) {
    return this.request('/contacts/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
  }

  importContacts(contacts, listId, listName) {
    return this.request('/contacts/import', {
      method: 'POST',
      body: JSON.stringify({ contacts, listId, listName })
    });
  }

  // Lists
  getLists() {
    return this.request('/lists');
  }

  createList(name, description) {
    return this.request('/lists', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });
  }

  updateList(id, name, description) {
    return this.request(`/lists/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, description })
    });
  }

  getListMembers(listId) {
    return this.request(`/lists/${listId}/members`);
  }

  deleteList(listId) {
    return this.request(`/lists/${listId}`, { method: 'DELETE' });
  }

  // Campaigns
  getCampaigns() {
    return this.request('/campaigns');
  }

  getCampaignDetails(id) {
    return this.request(`/campaigns/${id}`);
  }

  createCampaign(campaign) {
    return this.request('/campaigns', {
      method: 'POST',
      body: JSON.stringify(campaign)
    });
  }

  startCampaign(id) {
    return this.request(`/campaigns/${id}/start`, { method: 'POST' });
  }

  pauseCampaign(id) {
    return this.request(`/campaigns/${id}/pause`, { method: 'POST' });
  }

  resumeCampaign(id) {
    return this.request(`/campaigns/${id}/resume`, { method: 'POST' });
  }

  cancelCampaign(id) {
    return this.request(`/campaigns/${id}/cancel`, { method: 'POST' });
  }

  restartCampaign(id) {
    return this.request(`/campaigns/${id}/restart`, { method: 'POST' });
  }

  retryFailedCampaign(id) {
    return this.request(`/campaigns/${id}/retry-failed`, { method: 'POST' });
  }

  deleteCampaign(id) {
    return this.request(`/campaigns/${id}`, { method: 'DELETE' });
  }

  // Visual Flows
  getFlows() {
    return this.request('/flows');
  }

  getFlow(id) {
    return this.request(`/flows/${id}`);
  }

  createFlow(flow) {
    return this.request('/flows', {
      method: 'POST',
      body: JSON.stringify(flow)
    });
  }

  updateFlow(id, flow) {
    return this.request(`/flows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(flow)
    });
  }

  deleteFlow(id) {
    return this.request(`/flows/${id}`, { method: 'DELETE' });
  }

  simulateFlow(chatJid, messageText, draftFlow = null) {
    return this.request('/flows/simulate', {
      method: 'POST',
      body: JSON.stringify({ chatJid, messageText, draftFlow })
    });
  }

  generateFlowWithAI(prompt) {
    return this.request('/flows/generate-ai', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
  }

  editFlowWithAI(prompt, flow) {
    return this.request('/flows/edit-ai', {
      method: 'POST',
      body: JSON.stringify({ prompt, flow })
    });
  }

  // Groups
  getGroups(sessionId = 'default') {
    return this.request(`/groups?sessionId=${encodeURIComponent(sessionId)}`);
  }

  getGroupMembers(groupJid, sessionId = 'default') {
    return this.request(`/groups/${encodeURIComponent(groupJid)}/members?sessionId=${encodeURIComponent(sessionId)}`);
  }

  importGroupMembers(members, listName, listId) {
    return this.request('/groups/import-members', {
      method: 'POST',
      body: JSON.stringify({ members, listName, listId })
    });
  }

  // AI Knowledge & Products
  getKnowledgeItems() {
    return this.request('/ai/knowledge');
  }

  createKnowledgeItem(item) {
    return this.request('/ai/knowledge', {
      method: 'POST',
      body: JSON.stringify(item)
    });
  }

  updateKnowledgeItem(id, item) {
    return this.request(`/ai/knowledge/${id}`, {
      method: 'PUT',
      body: JSON.stringify(item)
    });
  }

  deleteKnowledgeItem(id) {
    return this.request(`/ai/knowledge/${id}`, { method: 'DELETE' });
  }

  getProducts() {
    return this.request('/ai/products');
  }

  createProduct(product) {
    return this.request('/ai/products', {
      method: 'POST',
      body: JSON.stringify(product)
    });
  }

  updateProduct(id, product) {
    return this.request(`/ai/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(product)
    });
  }

  deleteProduct(id) {
    return this.request(`/ai/products/${id}`, { method: 'DELETE' });
  }

  simulateAI(userQuery, senderName = 'Test User') {
    return this.request('/ai/simulate', {
      method: 'POST',
      body: JSON.stringify({ userQuery, senderName })
    });
  }

  testVoiceSynthesis(text) {
    return this.request('/voice/test-tts', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
  }

  // Settings
  getSettings() {
    return this.request('/settings');
  }

  saveSettings(settings) {
    return this.request('/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  }

  testHandoverAlert(targetPhone = null) {
    return this.request('/settings/test-handover-alert', {
      method: 'POST',
      body: JSON.stringify({ targetPhone })
    });
  }

  getEngineLogs(lines = 250) {
    return this.request(`/engine/logs?lines=${lines}`);
  }

  factoryReset() {
    return this.request('/system/factory-reset', {
      method: 'POST'
    });
  }

  // Chat Logs & Live Inbox
  getChatLogs(limit = 100) {
    return this.request(`/chat/logs?limit=${limit}`);
  }

  getConversations() {
    return this.request('/chat/conversations');
  }

  getConversationMessages(jid, limit = 100) {
    return this.request(`/chat/messages?jid=${encodeURIComponent(jid)}&limit=${limit}`);
  }

  toggleCustomerBot(jid, botDisabled) {
    return this.request('/chat/toggle-bot', {
      method: 'POST',
      body: JSON.stringify({ jid, botDisabled })
    });
  }

  resolveHumanRequest(jid) {
    return this.request('/chat/resolve-human-request', {
      method: 'POST',
      body: JSON.stringify({ jid })
    });
  }

  getCustomerStatus(jid) {
    return this.request(`/chat/status/${encodeURIComponent(jid)}`);
  }

  updateContact(jid, name, phone) {
    return this.request('/chat/update-contact', {
      method: 'POST',
      body: JSON.stringify({ jid, name, phone })
    });
  }

  deleteConversation(jid) {
    return this.request(`/chat/conversations/${encodeURIComponent(jid)}`, {
      method: 'DELETE'
    });
  }

  getChatLabels() {
    return this.request('/chat/labels');
  }

  createChatLabel(name, color = '#10b981') {
    return this.request('/chat/labels', {
      method: 'POST',
      body: JSON.stringify({ name, color })
    });
  }

  deleteChatLabel(name) {
    return this.request(`/chat/labels/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });
  }

  setConversationLabels(jid, labels) {
    return this.request(`/chat/conversations/${encodeURIComponent(jid)}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels })
    });
  }
}

export const api = new ApiService();
export default api;

