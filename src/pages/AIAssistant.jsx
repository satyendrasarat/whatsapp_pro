import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  BookOpen,
  Package,
  Plus,
  Trash2,
  Edit2,
  Bot,
  Send,
  Cpu,
  Key,
  Save,
  CheckCircle2,
  Search
} from 'lucide-react';
import { api } from '../services/api';
import Modal from '../components/Modal';

export const AIAssistant = () => {
  const [activeTab, setActiveTab] = useState('knowledge'); // 'knowledge', 'products', 'settings', 'simulator'
  const [knowledgeItems, setKnowledgeItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  // Knowledge Item Modal (Create & Edit)
  const [isKbModalOpen, setIsKbModalOpen] = useState(false);
  const [editingKbId, setEditingKbId] = useState(null);
  const [kbForm, setKbForm] = useState({ title: '', content: '', tags: '' });

  // Product Modal (Create & Edit)
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [editingProdId, setEditingProdId] = useState(null);
  const [prodForm, setProdForm] = useState({
    sku: '',
    title: '',
    price: '',
    description: '',
    in_stock: 1
  });

  // Simulator state
  const [simQuery, setSimQuery] = useState('');
  const [simHistory, setSimHistory] = useState([
    {
      sender: 'bot',
      text: '🤖 AI Studio Agent online! Ask questions about your knowledge base or product catalog to verify automated WhatsApp responses.'
    }
  ]);
  const [simLoading, setSimLoading] = useState(false);

  const loadAll = async () => {
    try {
      const [kRes, pRes, sRes] = await Promise.all([
        api.getKnowledgeItems(),
        api.getProducts(),
        api.getSettings()
      ]);
      if (kRes.items) setKnowledgeItems(kRes.items);
      if (pRes.products) setProducts(pRes.products);
      if (sRes.settings) setSettings(sRes.settings);
    } catch (err) {
      console.error('Failed to load AI data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleOpenCreateKb = () => {
    setEditingKbId(null);
    setKbForm({ title: '', content: '', tags: '' });
    setIsKbModalOpen(true);
  };

  const handleOpenEditKb = (item) => {
    setEditingKbId(item.id);
    setKbForm({
      title: item.title,
      content: item.content,
      tags: item.tags || ''
    });
    setIsKbModalOpen(true);
  };

  const handleSaveKb = async (e) => {
    e.preventDefault();
    if (!kbForm.title || !kbForm.content) return;
    try {
      if (editingKbId) {
        await api.updateKnowledgeItem(editingKbId, kbForm);
      } else {
        await api.createKnowledgeItem(kbForm);
      }
      setKbForm({ title: '', content: '', tags: '' });
      setEditingKbId(null);
      setIsKbModalOpen(false);
      await loadAll();
    } catch (err) {
      alert(`Error saving knowledge item: ${err.message}`);
    }
  };

  const handleDeleteKb = async (id) => {
    if (!window.confirm('Delete this knowledge item?')) return;
    try {
      await api.deleteKnowledgeItem(id);
      await loadAll();
    } catch (err) {
      alert(`Error deleting item: ${err.message}`);
    }
  };

  const handleOpenCreateProd = () => {
    setEditingProdId(null);
    setProdForm({ sku: '', title: '', price: '', description: '', in_stock: 1 });
    setIsProdModalOpen(true);
  };

  const handleOpenEditProd = (p) => {
    setEditingProdId(p.id);
    setProdForm({
      sku: p.sku || '',
      title: p.title,
      price: p.price,
      description: p.description || '',
      in_stock: p.in_stock ? 1 : 0
    });
    setIsProdModalOpen(true);
  };

  const handleSaveProd = async (e) => {
    e.preventDefault();
    if (!prodForm.title || prodForm.price === '' || prodForm.price === undefined) return;
    try {
      if (editingProdId) {
        await api.updateProduct(editingProdId, prodForm);
      } else {
        await api.createProduct(prodForm);
      }
      setProdForm({ sku: '', title: '', price: '', description: '', in_stock: 1 });
      setEditingProdId(null);
      setIsProdModalOpen(false);
      await loadAll();
    } catch (err) {
      alert(`Error saving product: ${err.message}`);
    }
  };

  const handleDeleteProd = async (id) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      await api.deleteProduct(id);
      await loadAll();
    } catch (err) {
      alert(`Error deleting product: ${err.message}`);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await api.saveSettings(settings);
      alert('AI Settings successfully updated!');
    } catch (err) {
      alert(`Error saving settings: ${err.message}`);
    }
  };

  const handleSimulate = async (e) => {
    e.preventDefault();
    if (!simQuery.trim()) return;

    const query = simQuery.trim();
    setSimHistory((prev) => [...prev, { sender: 'user', text: query }]);
    setSimQuery('');
    setSimLoading(true);

    try {
      const res = await api.simulateAI(query, 'VIP Customer');
      setSimHistory((prev) => [...prev, { sender: 'bot', text: res.reply || 'No response.' }]);
    } catch (err) {
      setSimHistory((prev) => [...prev, { sender: 'bot', text: `AI Error: ${err.message}` }]);
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            AI Knowledge Base & Auto-Responder Studio
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Supercharge incoming WhatsApp chats with local Ollama or cloud LLMs trained on your documents and product catalog.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('knowledge')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'knowledge' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Knowledge Items ({knowledgeItems.length})
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'products' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Products ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'simulator' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Test Simulator
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'settings' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            AI Engine Config
          </button>
        </div>
      </div>

      {/* Tab 1: Knowledge Base */}
      {activeTab === 'knowledge' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">
              Reference documentation, policies, and FAQs queried by the AI auto-responder.
            </span>
            <button
              onClick={handleOpenCreateKb}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Knowledge Document</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {knowledgeItems.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-100">{item.title}</h3>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEditKb(item)}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg transition"
                        title="Edit Knowledge Document"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteKb(item.id)}
                        className="p-1.5 hover:bg-rose-950 text-slate-500 hover:text-rose-400 rounded-lg transition"
                        title="Delete Knowledge Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {item.content}
                  </p>
                </div>

                {item.tags && (
                  <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap gap-1">
                    {item.tags.split(',').map((t, i) => (
                      <span key={i} className="bg-slate-950 px-2 py-0.5 rounded text-[10px] text-emerald-400 font-mono">
                        #{t.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Products Catalog */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">
              Inventory and product packages referenced during customer sales inquiries.
            </span>
            <button
              onClick={handleOpenCreateProd}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => (
              <div
                key={p.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-purple-400 uppercase">
                        SKU: {p.sku || 'N/A'}
                      </span>
                      <h3 className="text-sm font-bold text-slate-100 mt-0.5">{p.title}</h3>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEditProd(p)}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-lg transition"
                        title="Edit Product"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteProd(p.id)}
                        className="p-1.5 hover:bg-rose-950 text-slate-500 hover:text-rose-400 rounded-lg transition"
                        title="Delete Product"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xl font-black text-emerald-400 mt-2">${p.price}</p>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed line-clamp-3">
                    {p.description || 'No description'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px]">
                  <span className={p.in_stock ? 'text-emerald-400 font-semibold' : 'text-rose-400'}>
                    {p.in_stock ? '● In Stock' : '○ Out of Stock'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Interactive AI Test Simulator */}
      {activeTab === 'simulator' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-6 max-w-3xl mx-auto flex flex-col h-[520px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-400" />
                Live AI Response Simulator
              </h3>
              <p className="text-[11px] text-slate-400">
                Tests query answering using active knowledge items, products, and selected provider.
              </p>
            </div>
            <span className="text-xs font-mono text-purple-400">
              Provider: {settings.ai_provider || 'local_ollama'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {simHistory.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-2xl text-xs whitespace-pre-wrap leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-none shadow-md'
                      : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-none shadow-md'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {simLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-950 border border-slate-800 text-emerald-400 p-3 rounded-2xl text-xs flex items-center gap-2 animate-pulse">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  <span>AI Agent is retrieving context and generating response...</span>
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSimulate} className="pt-3 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              placeholder="Ask a customer question (e.g. 'What are your prices?' or 'What are your hours?')..."
              value={simQuery}
              onChange={(e) => setSimQuery(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              disabled={simLoading}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg transition flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Ask AI</span>
            </button>
          </form>
        </div>
      )}

      {/* Tab 4: AI Settings */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-2xl mx-auto space-y-5">
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider pb-2 border-b border-slate-800">
            AI Engine Configuration
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Active LLM Provider
            </label>
            <select
              value={settings.ai_provider || 'local_ollama'}
              onChange={(e) => setSettings({ ...settings, ai_provider: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="local_ollama">Local Ollama (Zero Cost / Completely Private)</option>
              <option value="gemini_api">Google Gemini 1.5 Flash (Ultra Fast Cloud API)</option>
              <option value="openai_api">OpenAI GPT-4o-mini</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ollama Local Endpoint
              </label>
              <input
                type="text"
                value={settings.ollama_endpoint || 'http://localhost:11434'}
                onChange={(e) => setSettings({ ...settings, ollama_endpoint: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ollama Model Name
              </label>
              <input
                type="text"
                value={settings.ollama_model || 'llama3:latest'}
                onChange={(e) => setSettings({ ...settings, ollama_model: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Google Gemini API Key
            </label>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={settings.gemini_api_key || ''}
              onChange={(e) => setSettings({ ...settings, gemini_api_key: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              OpenAI API Key
            </label>
            <input
              type="password"
              placeholder="sk-..."
              value={settings.openai_api_key || ''}
              onChange={(e) => setSettings({ ...settings, openai_api_key: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              AI System Prompt Persona
            </label>
            <textarea
              rows={4}
              value={settings.ai_system_prompt || ''}
              onChange={(e) => setSettings({ ...settings, ai_system_prompt: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none font-sans leading-relaxed"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition"
            >
              <Save className="w-4 h-4" />
              <span>Save AI Settings</span>
            </button>
          </div>
        </form>
      )}

      {/* Add / Edit Knowledge Item Modal */}
      <Modal
        isOpen={isKbModalOpen}
        onClose={() => setIsKbModalOpen(false)}
        title={editingKbId ? 'Edit Knowledge Document / FAQ' : 'Add Knowledge Document / FAQ'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveKb} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Document Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Return Policy, Business Hours, or Pricing Details"
              value={kbForm.title}
              onChange={(e) => setKbForm({ ...kbForm, title: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Document Content / Answers</label>
            <textarea
              required
              rows={5}
              placeholder="Detailed explanation, instructions, or answers..."
              value={kbForm.content}
              onChange={(e) => setKbForm({ ...kbForm, content: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Tags (Comma separated)</label>
            <input
              type="text"
              placeholder="e.g. hours, policy, refund"
              value={kbForm.tags}
              onChange={(e) => setKbForm({ ...kbForm, tags: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsKbModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg"
            >
              {editingKbId ? 'Save Changes' : 'Save Knowledge Item'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={isProdModalOpen}
        onClose={() => setIsProdModalOpen(false)}
        title={editingProdId ? 'Edit Product in Catalog' : 'Add Product to Catalog'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveProd} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Product Title</label>
              <input
                type="text"
                required
                placeholder="e.g. CRM Suite Pro"
                value={prodForm.title}
                onChange={(e) => setProdForm({ ...prodForm, title: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Price</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="49.99"
                value={prodForm.price}
                onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">SKU / Item Code</label>
              <input
                type="text"
                placeholder="e.g. PRO-LICENSE-01"
                value={prodForm.sku}
                onChange={(e) => setProdForm({ ...prodForm, sku: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Availability Status</label>
              <select
                value={prodForm.in_stock}
                onChange={(e) => setProdForm({ ...prodForm, in_stock: parseInt(e.target.value, 10) })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value={1}>● In Stock (Active)</option>
                <option value={0}>○ Out of Stock</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
            <textarea
              rows={3}
              placeholder="Features, specifications, or packaging details..."
              value={prodForm.description}
              onChange={(e) => setProdForm({ ...prodForm, description: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsProdModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg"
            >
              {editingProdId ? 'Save Product Changes' : 'Add Product'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AIAssistant;

