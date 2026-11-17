import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Workflow,
  Plus,
  Save,
  Trash2,
  Play,
  RotateCcw,
  Zap,
  MessageSquare,
  ListFilter,
  GitBranch,
  Bot,
  Send,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Wand2,
  ArrowRight,
  CornerDownRight,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Maximize2,
  Sliders,
  PanelRightClose,
  PanelRightOpen,
  GitFork,
  Download,
  Upload,
  Headphones,
  ShieldCheck
} from 'lucide-react';
import { api } from '../services/api';
import Modal from '../components/Modal';
import TriggerNode from '../flow-nodes/TriggerNode';
import MessageNode from '../flow-nodes/MessageNode';
import MenuNode from '../flow-nodes/MenuNode';
import ConditionNode from '../flow-nodes/ConditionNode';
import AIAgentNode from '../flow-nodes/AIAgentNode';
import SubFlowNode from '../flow-nodes/SubFlowNode';
import HumanHandoverNode from '../flow-nodes/HumanHandoverNode';

const nodeTypes = {
  trigger: TriggerNode,
  message: MessageNode,
  menu: MenuNode,
  condition: ConditionNode,
  ai_handover: AIAgentNode,
  ai_agent: AIAgentNode,
  subflow: SubFlowNode,
  sub_flow: SubFlowNode,
  human_handover: HumanHandoverNode,
  human_agent: HumanHandoverNode
};

export const FlowBuilder = () => {
  const [flows, setFlows] = useState([]);
  const [selectedFlowId, setSelectedFlowId] = useState(null);
  const [flowName, setFlowName] = useState('');
  const [triggerKeywords, setTriggerKeywords] = useState('');
  const [isFallback, setIsFallback] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Selected item for inspector (node or edge)
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);

  // ReactFlow instance ref for fitView
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  // AI Flow Generator Modal state
  const [isAIPromptOpen, setIsAIPromptOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState(null);

  // Live Simulator state
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // AI Flow Editor (Co-Pilot) in Flow Configuration state
  const [aiEditPrompt, setAiEditPrompt] = useState('');
  const [isAIEditing, setIsAIEditing] = useState(false);
  const [aiEditSummary, setAiEditSummary] = useState(null);
  const [undoHistory, setUndoHistory] = useState([]);
  const [isAIEditorExpanded, setIsAIEditorExpanded] = useState(true);

  const [simChat, setSimChat] = useState([
    { sender: 'bot', text: 'Chatbot simulator ready. Send a keyword like "help" or "menu" to test.' }
  ]);
  const [simInput, setSimInput] = useState('');
  const [simJid, setSimJid] = useState(`sim_${Date.now()}@s.whatsapp.net`);
  const fileInputRef = useRef(null);

  const loadFlows = async () => {
    try {
      const res = await api.getFlows();
      if (res.flows && res.flows.length > 0) {
        setFlows(res.flows);
        if (!selectedFlowId) {
          loadSingleFlow(res.flows[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load flows:', err);
    }
  };

  const loadSingleFlow = (flow) => {
    setSelectedFlowId(flow.id);
    setFlowName(flow.name);
    setTriggerKeywords(flow.trigger_keyword || '');
    setIsFallback(!!flow.is_fallback);
    setIsActive(!!flow.is_active);

    try {
      const parsedNodes = typeof flow.nodes_graph === 'string' ? JSON.parse(flow.nodes_graph) : flow.nodes_graph;
      const parsedEdges = typeof flow.edges_graph === 'string' ? JSON.parse(flow.edges_graph) : flow.edges_graph;
      setNodes(parsedNodes || []);
      setEdges(parsedEdges || []);
    } catch (e) {
      console.error('Failed to parse flow graph:', e);
    }
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  useEffect(() => {
    loadFlows();
  }, []);

  const onConnect = useCallback(
    (params) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#10b981', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' }
          },
          eds
        )
      );
    },
    [setEdges]
  );

  const onNodeClick = (event, node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  };

  const onEdgeClick = (event, edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  };

  const onPaneClick = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
  };

  const onNodesDelete = useCallback(
    (deletedNodes) => {
      const deletedIds = new Set(deletedNodes.map((n) => n.id));
      if (selectedNode && deletedIds.has(selectedNode.id)) {
        setSelectedNode(null);
      }
    },
    [selectedNode]
  );

  const onEdgesDelete = useCallback(
    (deletedEdges) => {
      const deletedIds = new Set(deletedEdges.map((e) => e.id));
      if (selectedEdge && deletedIds.has(selectedEdge.id)) {
        setSelectedEdge(null);
      }
    },
    [selectedEdge]
  );

  // Delete currently selected node and its connected edges
  const handleDeleteSelectedNode = () => {
    if (!selectedNode) return;
    const targetId = selectedNode.id;
    setNodes((nds) => nds.filter((n) => n.id !== targetId));
    setEdges((eds) => eds.filter((e) => e.source !== targetId && e.target !== targetId));
    setSelectedNode(null);
  };

  // Delete currently selected edge
  const handleDeleteSelectedEdge = () => {
    if (!selectedEdge) return;
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
    setSelectedEdge(null);
  };

  const handleSaveFlow = async () => {
    if (!flowName.trim()) {
      alert('Please enter a flow name');
      return;
    }

    const triggerNode = nodes.find((n) => n.type === 'trigger');
    const effectiveTriggerKeywords = triggerNode?.data?.keyword !== undefined
      ? triggerNode.data.keyword
      : triggerKeywords;

    const payload = {
      name: flowName.trim(),
      trigger_keyword: (effectiveTriggerKeywords || '').trim(),
      is_fallback: isFallback ? 1 : 0,
      nodes_graph: JSON.stringify(nodes),
      edges_graph: JSON.stringify(edges),
      is_active: isActive ? 1 : 0
    };

    try {
      if (selectedFlowId) {
        await api.updateFlow(selectedFlowId, payload);
      } else {
        const res = await api.createFlow(payload);
        setSelectedFlowId(res.id);
      }
      alert(`Flow "${flowName}" saved successfully!`);
      await loadFlows();
    } catch (err) {
      alert(`Failed to save flow: ${err.message}`);
    }
  };

  const handleCreateNewFlow = () => {
    setSelectedFlowId(null);
    setFlowName('New Interactive Flow');
    setTriggerKeywords('help, info, start');
    setIsFallback(false);
    setIsActive(true);

    const initialNodes = [
      {
        id: 'node-trigger-1',
        type: 'trigger',
        position: { x: 80, y: 160 },
        data: { label: 'Keyword Trigger', keyword: 'help, info, start' }
      },
      {
        id: 'node-msg-1',
        type: 'message',
        position: { x: 420, y: 160 },
        data: { label: 'Greeting Response', content: 'Hello! Welcome to our automated WhatsApp service. How can we assist you today?' }
      }
    ];

    const initialEdges = [
      {
        id: 'e-init-1',
        source: 'node-trigger-1',
        target: 'node-msg-1',
        animated: true,
        style: { stroke: '#10b981', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' }
      }
    ];

    setNodes(initialNodes);
    setEdges(initialEdges);
    setSelectedNode(null);
    setSelectedEdge(null);
    if (reactFlowInstance) {
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 100);
    }
  };

  // Load standard pre-built AI Agent + Smart Guardrail Template (status inactive by default)
  const handleLoadAITemplate = () => {
    setSelectedFlowId(null);
    setFlowName('AI Concierge with Smart Human Escalation');
    setTriggerKeywords('*');
    setIsFallback(false);
    setIsActive(false); // Inactive status by default as requested

    const templateNodes = [
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

    const templateEdges = [
      {
        id: 'e-trigger-ai',
        source: 'node-trigger-1',
        target: 'node-ai-1',
        animated: true,
        style: { stroke: '#10b981', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' }
      },
      {
        id: 'e-ai-human',
        source: 'node-ai-1',
        target: 'node-human-1',
        label: 'Escalate to Human',
        animated: true,
        style: { stroke: '#ef4444', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' }
      }
    ];

    setNodes(templateNodes);
    setEdges(templateEdges);
    setSelectedNode(null);
    setSelectedEdge(null);
    if (reactFlowInstance) {
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 100);
    }
  };

  const handleDeleteFlow = async () => {
    if (!selectedFlowId) return;
    if (!window.confirm(`Permanently delete flow "${flowName}"?`)) return;
    try {
      await api.deleteFlow(selectedFlowId);
      setSelectedFlowId(null);
      await loadFlows();
    } catch (err) {
      alert(`Error deleting flow: ${err.message}`);
    }
  };

  // Export current flow graph as a distributable .json file
  const handleExportJSON = () => {
    try {
      const exportData = {
        version: '1.0',
        name: flowName || 'Exported Flow',
        trigger_keyword: triggerKeywords || '',
        is_fallback: isFallback ? 1 : 0,
        is_active: isActive ? 1 : 0,
        nodes: nodes || [],
        edges: edges || [],
        exported_at: new Date().toISOString()
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const safeName = (flowName || 'flow').trim().toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeName || 'flow'}.flow.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    }
  };

  // Import flow from a JSON file (load to canvas or save as new flow)
  const handleImportFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileText = await file.text();
      let parsed = JSON.parse(fileText);

      let importedNodes = [];
      let importedEdges = [];
      let importedName = flowName || 'Imported Flow';
      let importedTrigger = triggerKeywords || '';
      let importedFallback = isFallback;

      if (Array.isArray(parsed)) {
        importedNodes = parsed;
      } else if (parsed && typeof parsed === 'object') {
        importedNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
        importedEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
        if (parsed.name) importedName = parsed.name;
        if (parsed.trigger_keyword !== undefined) importedTrigger = parsed.trigger_keyword;
        if (parsed.is_fallback !== undefined) importedFallback = !!parsed.is_fallback;
      }

      if (importedNodes.length === 0) {
        throw new Error('No valid nodes found in the imported JSON file.');
      }

      const shouldSaveAsNew = window.confirm(
        `Importing flow: "${importedName}"\n\nClick "OK" to import as a BRAND NEW flow in the database.\nClick "Cancel" to load it directly into the current canvas.`
      );

      if (shouldSaveAsNew) {
        const payload = {
          name: `${importedName} (Imported)`,
          trigger_keyword: importedTrigger,
          is_fallback: importedFallback ? 1 : 0,
          nodes_graph: JSON.stringify(importedNodes),
          edges_graph: JSON.stringify(importedEdges),
          is_active: 1
        };
        const res = await api.createFlow(payload);
        await loadFlows();
        setSelectedFlowId(res.id);
        setFlowName(payload.name);
        setTriggerKeywords(payload.trigger_keyword);
        setIsFallback(false);
        setIsActive(true);
        setNodes(importedNodes);
        setEdges(importedEdges);
        alert(`Successfully imported and created new flow "${payload.name}"!`);
      } else {
        setFlowName(importedName);
        setTriggerKeywords(importedTrigger);
        setIsFallback(importedFallback);
        setNodes(importedNodes);
        setEdges(importedEdges);
        setSelectedNode(null);
        setSelectedEdge(null);
        alert(`Loaded "${importedName}" into canvas. Click "Save Flow" to save your changes.`);
      }

      if (reactFlowInstance) {
        setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 150);
      }
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Smart Node Insertion: Places neatly to the right and auto-connects to selected node!
  const addNode = (type) => {
    const id = `node-${type}-${Date.now().toString().slice(-4)}`;
    let posX = 100;
    let posY = 180;

    if (selectedNode) {
      posX = selectedNode.position.x + 340;
      // Stagger vertical position if multiple children exist
      const siblingsNear = nodes.filter((n) => Math.abs(n.position.x - posX) < 80);
      posY = selectedNode.position.y + siblingsNear.length * 140;
    } else if (nodes.length > 0) {
      const maxRight = Math.max(...nodes.map((n) => n.position.x || 0));
      posX = maxRight + 340;
      posY = 180;
    }

    const position = { x: posX, y: posY };

    let data = { label: `New ${type.toUpperCase()}` };
    if (type === 'message') {
      data = { label: 'WhatsApp Message', content: 'Hello! How can we assist you today?' };
    } else if (type === 'menu') {
      data = {
        label: 'Menu Options',
        options: [
          { key: '1', label: 'View Pricing' },
          { key: '2', label: 'Talk to Agent' }
        ]
      };
    } else if (type === 'condition') {
      data = {
        label: 'Condition Check',
        prompt: 'Please reply with your details or preference:',
        conditionText: 'yes, agree, buy'
      };
    } else if (type === 'ai_handover') {
      data = {
        label: 'AI Knowledge Handover',
        introText: '🤖 *AI Specialist Connected!*\nAsk me anything about our products, pricing, or services.',
        systemPrompt: 'You are an intelligent WhatsApp customer support and sales assistant.'
      };
    } else if (type === 'subflow' || type === 'sub_flow') {
      data = {
        label: 'Sub-Flow Step',
        targetFlowId: '',
        targetFlowName: '',
        returnOnComplete: true
      };
    } else if (type === 'human_handover' || type === 'human_agent') {
      data = {
        label: 'Human Agent Handover',
        message: '🔔 Connecting you with a live human support specialist. One moment please...',
        note: 'Customer reached live support handover'
      };
    }

    const newNode = { id, type, position, data };
    setNodes((nds) => [...nds, newNode]);

    // If a node was selected, auto-link to the new node!
    if (selectedNode) {
      let edgeSourceHandle = null;
      let edgeLabel = '';

      if (selectedNode.type === 'menu') {
        const options = selectedNode.data?.options || [];
        const existingEdges = edges.filter((e) => e.source === selectedNode.id);
        const usedHandles = new Set(existingEdges.map((e) => e.sourceHandle));
        const freeOptIdx = options.findIndex((opt, idx) => !usedHandles.has(`opt-${idx}`));
        const targetOptIdx = freeOptIdx !== -1 ? freeOptIdx : 0;
        edgeSourceHandle = `opt-${targetOptIdx}`;
        edgeLabel = options[targetOptIdx]?.label || `Option ${targetOptIdx + 1}`;
      } else if (selectedNode.type === 'condition') {
        const existingEdges = edges.filter((e) => e.source === selectedNode.id);
        const usedHandles = new Set(existingEdges.map((e) => e.sourceHandle));
        if (!usedHandles.has('match')) {
          edgeSourceHandle = 'match';
          edgeLabel = 'Match (Yes)';
        } else {
          edgeSourceHandle = 'nomatch';
          edgeLabel = 'Default (No)';
        }
      }

      const newEdge = {
        id: `e-${selectedNode.id}-${id}-${Date.now().toString().slice(-3)}`,
        source: selectedNode.id,
        target: id,
        sourceHandle: edgeSourceHandle,
        label: edgeLabel,
        animated: true,
        style: { stroke: '#10b981', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' }
      };

      setEdges((eds) => [...eds, newEdge]);
    }

    setSelectedNode(newNode);
    setSelectedEdge(null);
  };

  // Update selected node data with instant real-time canvas reflection
  const updateSelectedNodeData = (field, value) => {
    if (!selectedNode) return;
    if (selectedNode.type === 'trigger' && field === 'keyword') {
      setTriggerKeywords(value);
    }
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          const updated = {
            ...n,
            data: { ...n.data, [field]: value }
          };
          setSelectedNode(updated);
          return updated;
        }
        return n;
      })
    );
  };

  // AI Flow Generator Call
  const handleGenerateAIFlow = async () => {
    if (!aiPrompt.trim()) {
      alert('Please describe your flow prompt');
      return;
    }

    setIsAIGenerating(true);
    setAiStatusMessage('Synthesizing flow architecture with AI...');
    try {
      const res = await api.generateFlowWithAI(aiPrompt.trim());
      if (res.flow) {
        const gen = res.flow;
        setFlowName(gen.name || 'AI Generated Flow');
        setTriggerKeywords(gen.trigger_keyword || 'hi, hello, menu');
        setIsActive(true);

        const formattedNodes = (gen.nodes || []).map((n) => ({
          ...n,
          type: n.type || 'message'
        }));

        const formattedEdges = (gen.edges || []).map((e) => ({
          ...e,
          animated: true,
          style: { stroke: '#10b981', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' }
        }));

        setNodes(formattedNodes);
        setEdges(formattedEdges);
        setSelectedNode(null);
        setSelectedEdge(null);
        setIsAIPromptOpen(false);
        setAiPrompt('');
        setAiStatusMessage(null);

        setTimeout(() => {
          if (reactFlowInstance) reactFlowInstance.fitView({ padding: 0.2 });
        }, 150);
      }
    } catch (err) {
      alert(`AI Flow Generation failed: ${err.message}`);
      setAiStatusMessage(null);
    } finally {
      setIsAIGenerating(false);
    }
  };

  // AI Flow Editor: Modifies and expands current flow as per prompt
  const handleApplyAIEdit = async (customPrompt) => {
    const promptToUse = typeof customPrompt === 'string' ? customPrompt : aiEditPrompt;
    if (!promptToUse || !promptToUse.trim()) return;

    setIsAIEditing(true);
    setAiEditSummary(null);

    // Snapshot current state for 1-click Undo
    setUndoHistory((prev) => [
      {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
        flowName,
        triggerKeywords
      },
      ...prev.slice(0, 4)
    ]);

    try {
      const currentFlowData = {
        name: flowName,
        trigger_keyword: triggerKeywords,
        nodes,
        edges
      };

      const res = await api.editFlowWithAI(promptToUse, currentFlowData);
      if (res.flow) {
        if (res.flow.nodes) {
          const formattedNodes = res.flow.nodes.map((n) => ({
            ...n,
            data: { ...n.data }
          }));
          setNodes(formattedNodes);
        }
        if (res.flow.edges) {
          const formattedEdges = res.flow.edges.map((e) => ({
            ...e,
            animated: e.animated !== false,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' }
          }));
          setEdges(formattedEdges);
        }
        if (res.flow.name) setFlowName(res.flow.name);
        if (res.flow.trigger_keyword) setTriggerKeywords(res.flow.trigger_keyword);

        setAiEditSummary(res.summary || 'Flow updated successfully!');
        setAiEditPrompt('');

        setTimeout(() => {
          if (reactFlowInstance) {
            reactFlowInstance.fitView({ padding: 0.2, duration: 400 });
          }
        }, 150);
      }
    } catch (err) {
      alert(`AI Flow Editor error: ${err.message}`);
    } finally {
      setIsAIEditing(false);
    }
  };

  const handleUndoAIEdit = () => {
    if (undoHistory.length === 0) return;
    const [previous, ...rest] = undoHistory;
    setNodes(previous.nodes);
    setEdges(previous.edges);
    setFlowName(previous.flowName);
    setTriggerKeywords(previous.triggerKeywords);
    setUndoHistory(rest);
    setAiEditSummary('Reverted to previous flow version.');
    setTimeout(() => {
      if (reactFlowInstance) reactFlowInstance.fitView({ padding: 0.2 });
    }, 100);
  };

  // Interactive Flow Simulator
  const handleSimulateSend = async (e) => {
    e.preventDefault();
    if (!simInput.trim()) return;

    const userMsg = simInput.trim();
    setSimChat((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setSimInput('');

    const triggerNode = nodes.find((n) => n.type === 'trigger');
    const effectiveTriggerKeywords = triggerNode?.data?.keyword !== undefined
      ? triggerNode.data.keyword
      : triggerKeywords;

    const draftFlow = {
      id: selectedFlowId || 'draft',
      name: flowName || 'Draft Flow',
      trigger_keyword: (effectiveTriggerKeywords || '').trim(),
      is_fallback: isFallback ? 1 : 0,
      nodes_graph: nodes,
      edges_graph: edges,
      is_active: 1
    };

    try {
      const res = await api.simulateFlow(simJid, userMsg, draftFlow);
      setSimChat((prev) => [
        ...prev,
        { sender: 'bot', text: res.reply || 'No response generated.' }
      ]);
    } catch (err) {
      setSimChat((prev) => [
        ...prev,
        { sender: 'bot', text: `Error: ${err.message}` }
      ]);
    }
  };

  const handleResetSimulator = () => {
    const newJid = `sim_${Date.now()}@s.whatsapp.net`;
    setSimJid(newJid);
    setSimChat([
      { sender: 'bot', text: 'Chat session reset. Send any message or trigger word to test flow.' }
    ]);
  };

  return (
    <div className="flex h-full w-full bg-slate-950 overflow-hidden relative">
      {/* Main Flow Canvas & Toolbar */}
      <div className="flex-1 min-w-0 flex flex-col h-full border-r border-slate-800 overflow-hidden relative">
        {/* Top Control Bar */}
        <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 z-10 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Workflow className="w-5 h-5 text-emerald-400 shrink-0" />
            <select
              value={selectedFlowId || ''}
              onChange={(e) => {
                const found = flows.find((f) => f.id === parseInt(e.target.value, 10));
                if (found) loadSingleFlow(found);
              }}
              className="bg-slate-950 border border-slate-700 text-xs font-bold text-slate-100 rounded-xl px-2.5 sm:px-3 py-1.5 focus:outline-none focus:border-emerald-500 max-w-[140px] sm:max-w-xs truncate cursor-pointer"
            >
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} {f.is_active ? '(Active)' : '(Disabled)'}
                </option>
              ))}
            </select>

            <button
              onClick={handleCreateNewFlow}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-700 transition shrink-0"
              title="Create new blank workflow"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Flow</span>
            </button>

            {/* Load Default AI Guardrail Template Button */}
            <button
              onClick={handleLoadAITemplate}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-950/80 to-teal-950/80 hover:from-emerald-900/90 hover:to-teal-900/90 text-emerald-300 hover:text-emerald-200 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl border border-emerald-500/40 transition shadow-sm active:scale-95 shrink-0"
              title="Load default AI Agent + Smart Guardrail Template (Wildcard * trigger, auto-human escalation, status inactive)"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">AI Guardrail Template</span>
            </button>

            {/* AI Flow Builder Button */}
            <button
              onClick={() => setIsAIPromptOpen(true)}
              className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl shadow-lg shadow-purple-600/30 transition active:scale-95 shrink-0"
              title="Generate full flow automatically using AI and your Gemini API key"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>AI Flow Builder</span>
            </button>

            {/* AI Flow Editor Button */}
            <button
              onClick={() => {
                setIsSidebarOpen(true);
                setIsAIEditorExpanded(true);
                setTimeout(() => {
                  const el = document.getElementById('ai-flow-editor-input');
                  if (el) {
                    el.focus();
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, 100);
              }}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-purple-950/70 text-purple-200 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-xl border border-purple-500/30 shadow-md transition active:scale-95 shrink-0"
              title="Edit this existing flow as per natural language prompt"
            >
              <Wand2 className="w-3.5 h-3.5 text-pink-400" />
              <span>AI Editor</span>
            </button>
          </div>

          {/* Quick Node Add Buttons */}
          <div className="hidden xl:flex items-center gap-2 shrink-0">
            <button
              onClick={() => addNode('message')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-blue-900/40 text-blue-300 text-xs font-semibold border border-slate-700 transition"
              title={selectedNode ? "Add and link Message node" : "Add Message node"}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>+ Message</span>
            </button>
            <button
              onClick={() => addNode('menu')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-purple-900/40 text-purple-300 text-xs font-semibold border border-slate-700 transition"
              title={selectedNode ? "Add and link Menu node" : "Add Menu node"}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>+ Menu</span>
            </button>
            <button
              onClick={() => addNode('condition')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-amber-900/40 text-amber-300 text-xs font-semibold border border-slate-700 transition"
              title={selectedNode ? "Add and link Condition node" : "Add Condition node"}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>+ Condition</span>
            </button>
            <button
              onClick={() => addNode('ai_handover')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-900/40 to-indigo-900/40 hover:from-purple-800/60 hover:to-indigo-800/60 text-purple-200 hover:text-white text-xs font-semibold border border-purple-500/40 transition shadow-sm active:scale-95"
              title={selectedNode ? "Add and link AI Agent Handover node" : "Add AI Agent Handover node"}
            >
              <Bot className="w-3.5 h-3.5 text-purple-400" />
              <span>+ AI Agent</span>
            </button>
            <button
              onClick={() => addNode('subflow')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-cyan-900/40 text-cyan-300 text-xs font-semibold border border-slate-700 transition"
              title={selectedNode ? "Add and link Sub-Flow node" : "Add Sub-Flow node"}
            >
              <GitFork className="w-3.5 h-3.5 text-cyan-400" />
              <span>+ Sub-Flow</span>
            </button>
            <button
              onClick={() => addNode('human_handover')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-amber-900/40 text-amber-300 text-xs font-semibold border border-slate-700 transition"
              title={selectedNode ? "Add and link Human Agent Handover node" : "Add Human Agent Handover node"}
            >
              <Headphones className="w-3.5 h-3.5 text-amber-400" />
              <span>+ Human Agent</span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Export Flow as JSON */}
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-700 transition shrink-0"
              title="Export current flow as JSON to save, backup, or distribute"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden lg:inline">Export</span>
            </button>

            {/* Import Flow from JSON */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-700 transition shrink-0"
              title="Import flow from a .json file"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden lg:inline">Import</span>
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportFileSelected}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl border transition ${
                isSimulatorOpen
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{isSimulatorOpen ? 'Hide Simulator' : 'Test Simulator'}</span>
            </button>

            <button
              onClick={handleSaveFlow}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 sm:px-4 py-1.5 rounded-xl shadow-lg shadow-emerald-600/30 transition shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Flow</span>
            </button>

            {selectedFlowId && (
              <button
                onClick={handleDeleteFlow}
                className="p-1.5 sm:p-2 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded-xl transition shrink-0"
                title="Delete Flow"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            {/* Toggle Panel Button */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`p-1.5 sm:p-2 rounded-xl border transition shrink-0 ${
                isSidebarOpen
                  ? 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title={isSidebarOpen ? "Hide Inspector Panel" : "Show Inspector Panel"}
            >
              {isSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* React Flow Canvas */}
        <div className="flex-1 w-full h-full relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            nodeTypes={nodeTypes}
            onInit={setReactFlowInstance}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            className="bg-slate-950"
          >
            <Controls className="!bg-slate-900 !border-slate-800 !fill-slate-300" />
            <MiniMap
              nodeColor="#10b981"
              maskColor="rgba(15, 23, 42, 0.8)"
              className="!bg-slate-900 !border !border-slate-800 !rounded-xl"
            />
            <Background color="#334155" gap={20} size={1} />
          </ReactFlow>

          {/* Quick FitView & Floating Inspector Toggle */}
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 bg-slate-900/95 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xl backdrop-blur-sm transition"
                title="Show Properties Panel"
              >
                <PanelRightOpen className="w-3.5 h-3.5 text-emerald-400" />
                <span>Show Panel</span>
              </button>
            )}
            <button
              onClick={() => reactFlowInstance && reactFlowInstance.fitView({ padding: 0.2 })}
              className="p-2 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs flex items-center gap-1.5 shadow-lg backdrop-blur-sm transition"
              title="Recenter all nodes"
            >
              <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Center View</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar: Flow Settings, Node Inspector & Live Chat Simulator */}
      {isSidebarOpen && (
        <aside className="w-80 sm:w-88 lg:w-96 shrink-0 flex-shrink-0 min-w-[320px] max-w-[420px] bg-slate-900 border-l border-slate-800 flex flex-col h-full select-none overflow-y-auto z-10 shadow-2xl transition-all">
          {/* Flow Metadata Config */}
          <div className="p-4 border-b border-slate-800 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Flow Configuration
              </h3>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition"
                title="Hide inspector panel"
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Flow Title
              </label>
              <input
                type="text"
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-semibold"
              />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Trigger Keywords (Comma separated)
            </label>
            <input
              type="text"
              placeholder="e.g. hello, hi, menu, support"
              value={triggerKeywords}
              onChange={(e) => setTriggerKeywords(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-300">Active Status</span>
            <button
              onClick={() => setIsActive(!isActive)}
              className="text-slate-300 hover:text-white"
            >
              {isActive ? (
                <ToggleRight className="w-6 h-6 text-emerald-400" />
              ) : (
                <ToggleLeft className="w-6 h-6 text-slate-600" />
              )}
            </button>
          </div>

          {/* AI Flow Co-Pilot / Prompt Editor in Flow Configuration */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="bg-gradient-to-br from-purple-950/40 via-indigo-950/20 to-slate-950 border border-purple-500/30 rounded-2xl p-3 space-y-2.5 shadow-lg">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsAIEditorExpanded(!isAIEditorExpanded)}
                  className="text-xs font-bold text-purple-200 flex items-center gap-1.5 hover:text-white transition"
                >
                  <Wand2 className="w-3.5 h-3.5 text-pink-400" />
                  <span>AI Flow Editor</span>
                </button>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-500/30">
                    Prompt Control
                  </span>
                </div>
              </div>

              {isAIEditorExpanded && (
                <>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Modify, expand or translate this flow using natural language prompt:
                  </p>

                  <textarea
                    id="ai-flow-editor-input"
                    rows={3}
                    value={aiEditPrompt}
                    onChange={(e) => setAiEditPrompt(e.target.value)}
                    placeholder="e.g. Add 20% discount coupon step after Option 1, or Add a condition checking for 'urgent'..."
                    className="w-full bg-slate-950/90 border border-purple-500/30 rounded-xl p-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-400 resize-none font-sans"
                  />

                  {/* Quick Preset Action Chips */}
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setAiEditPrompt('Add a 20% discount coupon offer step with code SAVE20')}
                      className="text-[10px] bg-slate-900/90 hover:bg-purple-900/50 text-purple-300 border border-purple-500/20 px-2 py-1 rounded-lg transition"
                    >
                      + Discount Step
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiEditPrompt('Add an AI agent handover step to dynamically answer customer questions with live catalog')}
                      className="text-[10px] bg-slate-900/90 hover:bg-indigo-900/50 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-lg transition"
                    >
                      🤖 + AI Handover
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiEditPrompt('Add a live human agent support handoff step with phone contact')}
                      className="text-[10px] bg-slate-900/90 hover:bg-blue-900/50 text-blue-300 border border-blue-500/20 px-2 py-1 rounded-lg transition"
                    >
                      + Human Agent
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiEditPrompt('Add a condition check for customer Yes / No confirmation')}
                      className="text-[10px] bg-slate-900/90 hover:bg-amber-900/50 text-amber-300 border border-amber-500/20 px-2 py-1 rounded-lg transition"
                    >
                      + Condition
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiEditPrompt('Polish and enrich all message nodes with friendly tone and emojis')}
                      className="text-[10px] bg-slate-900/90 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/20 px-2 py-1 rounded-lg transition"
                    >
                      ✨ Polish Messages
                    </button>
                  </div>

                  {/* Execute Button & Undo */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleApplyAIEdit()}
                      disabled={isAIEditing || !aiEditPrompt.trim()}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white text-xs font-semibold py-2 px-3 rounded-xl shadow-md shadow-purple-600/30 transition active:scale-95"
                    >
                      {isAIEditing ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5 animate-spin text-purple-200" />
                          <span>Applying Edits...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>Apply AI Edit</span>
                        </>
                      )}
                    </button>

                    {undoHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUndoAIEdit}
                        className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 text-xs font-semibold flex items-center gap-1 transition"
                        title="Revert previous AI edit"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Undo</span>
                      </button>
                    )}
                  </div>

                  {/* Summary Feedback */}
                  {aiEditSummary && (
                    <div className="p-2 bg-purple-950/60 border border-purple-500/40 rounded-xl text-[11px] text-purple-200 flex items-start gap-1.5 animate-fadeIn">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{aiEditSummary}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Selected Item Inspector: Node or Edge */}
        <div className="p-4 border-b border-slate-800 space-y-3 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {selectedNode ? 'Node Properties' : selectedEdge ? 'Connection Properties' : 'Inspector'}
            </h3>
            {selectedNode && (
              <button
                onClick={handleDeleteSelectedNode}
                className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 font-semibold"
                title="Delete this node"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Node</span>
              </button>
            )}
            {selectedEdge && (
              <button
                onClick={handleDeleteSelectedEdge}
                className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 font-semibold"
                title="Delete connection"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Connection</span>
              </button>
            )}
          </div>

          {selectedNode ? (
            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 font-mono uppercase block">
                    Type: {selectedNode.type}
                  </span>
                  <span className="font-semibold text-slate-200">{selectedNode.id}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-800 text-emerald-400">
                    Selected
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Node Label
                </label>
                <input
                  type="text"
                  value={selectedNode.data?.label || ''}
                  onChange={(e) => updateSelectedNodeData('label', e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {selectedNode.type === 'trigger' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Keywords to Match
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data?.keyword || ''}
                      onChange={(e) => updateSelectedNodeData('keyword', e.target.value)}
                      placeholder="e.g. hello, hi, menu"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Separate multiple trigger words with commas. Use <strong className="text-emerald-400">*</strong> to match <em>any</em> message (catch-all wildcard trigger).
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isFallback}
                        onChange={(e) => setIsFallback(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer mt-0.5 accent-emerald-500"
                      />
                      <div>
                        <span className="text-xs font-semibold text-slate-200">Default Catch-All Fallback</span>
                        <p className="text-[10px] text-slate-400 leading-relaxed">
                          When checked, this flow triggers as fallback when no other keyword matches. (Leave unchecked for strict keyword matching).
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {selectedNode.type === 'message' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-400">
                      WhatsApp Message Text
                    </label>
                    <button
                      type="button"
                      onClick={() => updateSelectedNodeData('content', (selectedNode.data?.content || '') + ' {Hello|Hi|Hey}')}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      + Spintax
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={selectedNode.data?.content || ''}
                    onChange={(e) => updateSelectedNodeData('content', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none font-sans"
                    placeholder="Enter message text that will be sent to the customer..."
                  />
                </div>
              )}

              {selectedNode.type === 'condition' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Prompt Message (Sent to Customer Before Decision)
                    </label>
                    <textarea
                      rows={3}
                      value={selectedNode.data?.prompt || selectedNode.data?.content || ''}
                      onChange={(e) => updateSelectedNodeData('prompt', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none font-sans leading-relaxed"
                      placeholder="e.g. Please share your reservation details (mention if you have any special requests like VIP or outdoor seating):"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      This message asks the customer a question. Their reply is then evaluated against the match words below.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Condition Match Words (Comma separated)
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data?.conditionText || ''}
                      onChange={(e) => updateSelectedNodeData('conditionText', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                      placeholder="e.g. yes, agree, buy, confirmed"
                    />
                  </div>

                  <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 text-[11px]">
                    <p className="text-emerald-400 font-semibold">• Match (Yes) Branch: Fires if message contains match words.</p>
                    <p className="text-rose-400 font-semibold">• Default (No) Branch: Fires if message doesn't match.</p>
                  </div>
                </div>
              )}

              {selectedNode.type === 'menu' && (
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    Menu Options (Branch Handles)
                  </label>
                  {(selectedNode.data?.options || []).map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={opt.key}
                        onChange={(e) => {
                          const newOpts = [...selectedNode.data.options];
                          newOpts[idx].key = e.target.value;
                          updateSelectedNodeData('options', newOpts);
                        }}
                        className="w-10 bg-slate-950 border border-slate-800 rounded-lg p-1 text-center font-mono text-purple-400 font-bold"
                      />
                      <input
                        type="text"
                        value={opt.label}
                        onChange={(e) => {
                          const newOpts = [...selectedNode.data.options];
                          newOpts[idx].label = e.target.value;
                          updateSelectedNodeData('options', newOpts);
                        }}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs text-slate-200"
                      />
                      {selectedNode.data.options.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newOpts = selectedNode.data.options.filter((_, i) => i !== idx);
                            updateSelectedNodeData('options', newOpts);
                          }}
                          className="p-1 hover:bg-rose-950 text-slate-500 hover:text-rose-400 rounded transition"
                          title="Remove option"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const cur = selectedNode.data?.options || [];
                      const nextKey = String(cur.length + 1);
                      updateSelectedNodeData('options', [
                        ...cur,
                        { key: nextKey, label: `Option ${nextKey}` }
                      ]);
                    }}
                    className="w-full py-1.5 text-[11px] font-semibold rounded-lg bg-slate-950 hover:bg-slate-800 text-purple-400 border border-slate-800 transition"
                  >
                    + Add Menu Option
                  </button>
                </div>
              )}

              {selectedNode.type === 'ai_handover' && (
                <div className="space-y-3">
                  <div className="p-2.5 bg-gradient-to-r from-purple-950/60 to-indigo-950/40 border border-purple-500/30 rounded-xl text-xs space-y-1">
                    <p className="font-semibold text-purple-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      Dynamic AI Agent Handover
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      When a contact reaches this step, Google Gemini takes over the conversation using your live Knowledge Base & Product Catalog.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-400">
                        Introductory Greeting Message
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedNodeData(
                            'introText',
                            (selectedNode.data?.introText || '') + ' {Hello|Hi|Greetings}'
                          )
                        }
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium"
                      >
                        + Spintax
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={selectedNode.data?.introText || ''}
                      onChange={(e) => updateSelectedNodeData('introText', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none focus:border-purple-500 resize-none font-sans"
                      placeholder="e.g. 🤖 Handing you over to our AI Specialist! Ask any question about our services."
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Specialized AI Persona / Prompt Directive (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={selectedNode.data?.systemPrompt || ''}
                      onChange={(e) => updateSelectedNodeData('systemPrompt', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none focus:border-purple-500 resize-none font-mono text-[11px]"
                      placeholder="e.g. You are a senior sales consultant specializing in party orders and catering..."
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Leave empty to use global AI Assistant settings.
                    </p>
                  </div>

                  {/* Smart Direction & Confusion Guardrail */}
                  <div className="p-3 bg-slate-950/80 border border-purple-500/30 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedNode.data?.escalateOnConfusion !== false}
                          onChange={(e) => updateSelectedNodeData('escalateOnConfusion', e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-0 bg-slate-900 border-slate-700"
                        />
                        <span className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          Direction & Confusion Guardrail
                        </span>
                      </label>
                      <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        Human Safety Net
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      AI keeps answering as long as customer questions are in the right direction. If customer appears confused, frustrated, or asks for help, conversation automatically transfers to a human agent.
                    </p>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                        Confusion & Escalation Keywords (Comma separated)
                      </label>
                      <input
                        type="text"
                        value={selectedNode.data?.confusionKeywords !== undefined ? selectedNode.data.confusionKeywords : 'human, agent, confused, don\'t understand, not what i asked, unclear, help, talk to someone, speak to human, call me'}
                        onChange={(e) => updateSelectedNodeData('confusionKeywords', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-purple-500 font-mono"
                        placeholder="e.g. human, agent, confused, don't understand, help"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                        Handover Notice Message (Informs Sender)
                      </label>
                      <textarea
                        rows={2}
                        value={selectedNode.data?.handoverMessage !== undefined ? selectedNode.data.handoverMessage : '👨‍💼 Connecting you with a live human support specialist. One moment please while our team reviews your conversation...'}
                        onChange={(e) => updateSelectedNodeData('handoverMessage', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-[11px] text-slate-200 focus:outline-none focus:border-purple-500 font-sans resize-none"
                        placeholder="Message sent to customer upon human takeover..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {(selectedNode.type === 'subflow' || selectedNode.type === 'sub_flow') && (
                <div className="space-y-3">
                  <div className="p-2.5 bg-gradient-to-r from-cyan-950/60 to-teal-950/40 border border-cyan-500/30 rounded-xl text-xs space-y-1">
                    <p className="font-semibold text-cyan-200 flex items-center gap-1.5">
                      <GitFork className="w-3.5 h-3.5 text-cyan-400" />
                      Modular Sub-Flow Execution
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Call another workflow as a modular sub-routine (like n8n). When the sub-flow finishes, it can automatically resume this flow!
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Target Flow to Execute:
                    </label>
                    <select
                      value={selectedNode.data?.targetFlowId || ''}
                      onChange={(e) => {
                        const targetId = e.target.value;
                        const targetFlow = flows.find((f) => String(f.id) === String(targetId));
                        updateSelectedNodeData('targetFlowId', targetId);
                        updateSelectedNodeData('targetFlowName', targetFlow ? targetFlow.name : '');
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-cyan-300 font-semibold focus:outline-none focus:border-cyan-500"
                    >
                      <option value="">-- Choose a Sub-Flow --</option>
                      {flows
                        .filter((f) => String(f.id) !== String(selectedFlowId))
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name} {f.is_active ? '(Active)' : '(Disabled)'}
                          </option>
                        ))}
                    </select>
                    {flows.filter((f) => String(f.id) !== String(selectedFlowId)).length === 0 && (
                      <p className="text-[10px] text-amber-400 mt-1">
                        No other flows found. Create another flow first to use as a sub-flow!
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                      Execution Behavior:
                    </label>
                    <div className="space-y-1.5">
                      <label className="flex items-start gap-2 p-2 bg-slate-950/70 border border-slate-800 rounded-xl cursor-pointer hover:border-cyan-500/50 transition">
                        <input
                          type="radio"
                          name="returnBehavior"
                          checked={selectedNode.data?.returnOnComplete !== false}
                          onChange={() => updateSelectedNodeData('returnOnComplete', true)}
                          className="mt-0.5 text-cyan-500 focus:ring-0"
                        />
                        <div className="text-[11px]">
                          <span className="font-semibold text-slate-200 block">Call & Return to Parent (Recommended)</span>
                          <span className="text-slate-400 text-[10px]">
                            Runs sub-flow. Once completed, returns to the next connected node in this main flow.
                          </span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 p-2 bg-slate-950/70 border border-slate-800 rounded-xl cursor-pointer hover:border-amber-500/50 transition">
                        <input
                          type="radio"
                          name="returnBehavior"
                          checked={selectedNode.data?.returnOnComplete === false}
                          onChange={() => updateSelectedNodeData('returnOnComplete', false)}
                          className="mt-0.5 text-amber-500 focus:ring-0"
                        />
                        <div className="text-[11px]">
                          <span className="font-semibold text-slate-200 block">Permanent Handoff</span>
                          <span className="text-slate-400 text-[10px]">
                            Hands over conversation to sub-flow permanently. Does not return to this flow.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {(selectedNode.type === 'human_handover' || selectedNode.type === 'human_agent') && (
                <div className="space-y-3">
                  <div className="p-2.5 bg-gradient-to-r from-amber-950/60 to-orange-950/40 border border-amber-500/40 rounded-xl text-xs space-y-1">
                    <p className="font-semibold text-amber-200 flex items-center gap-1.5">
                      <Headphones className="w-3.5 h-3.5 text-amber-400" />
                      Live Human Agent Handover
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      When a contact reaches this step, bot automation is automatically paused for them, and an alert is pinned in your Live Chat Inbox for human agent takeover.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-400">
                        Handover Notice Message to Customer
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          updateSelectedNodeData(
                            'message',
                            (selectedNode.data?.message || selectedNode.data?.content || '') + ' {Hello|Hi|Greetings}'
                          )
                        }
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium"
                      >
                        + Spintax
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={selectedNode.data?.message || selectedNode.data?.content || ''}
                      onChange={(e) => {
                        updateSelectedNodeData('message', e.target.value);
                        updateSelectedNodeData('content', e.target.value);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none font-sans"
                      placeholder="e.g. 🔔 Connecting you with a live human support specialist. One moment please..."
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Internal Escalation Note / Tag (Optional)
                    </label>
                    <input
                      type="text"
                      value={selectedNode.data?.note || ''}
                      onChange={(e) => updateSelectedNodeData('note', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-amber-300 focus:outline-none focus:border-amber-500 font-mono"
                      placeholder="e.g. VIP Table Request / Billing Issue"
                    />
                  </div>
                </div>
              )}

              {/* Branch Quick Action */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">
                  Add Child Step from this Node:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => addNode('message')}
                    className="p-1.5 bg-slate-950 hover:bg-blue-900/40 text-blue-300 border border-slate-800 rounded-lg text-[10px] font-semibold transition truncate"
                    title="Add Message Node"
                  >
                    + Message
                  </button>
                  <button
                    onClick={() => addNode('menu')}
                    className="p-1.5 bg-slate-950 hover:bg-purple-900/40 text-purple-300 border border-slate-800 rounded-lg text-[10px] font-semibold transition truncate"
                    title="Add Menu Node"
                  >
                    + Menu
                  </button>
                  <button
                    onClick={() => addNode('condition')}
                    className="p-1.5 bg-slate-950 hover:bg-amber-900/40 text-amber-300 border border-slate-800 rounded-lg text-[10px] font-semibold transition truncate"
                    title="Add Condition Node"
                  >
                    + Condition
                  </button>
                  <button
                    onClick={() => addNode('ai_handover')}
                    className="p-1.5 bg-slate-950 hover:bg-indigo-900/40 text-indigo-300 border border-slate-800 rounded-lg text-[10px] font-semibold transition truncate"
                    title="Add AI Agent Node"
                  >
                    + AI Agent
                  </button>
                  <button
                    onClick={() => addNode('subflow')}
                    className="p-1.5 bg-slate-950 hover:bg-cyan-900/40 text-cyan-300 border border-slate-800 rounded-lg text-[10px] font-semibold transition truncate"
                    title="Add Sub-Flow Node"
                  >
                    + Sub-Flow
                  </button>
                  <button
                    onClick={() => addNode('human_handover')}
                    className="p-1.5 bg-slate-950 hover:bg-orange-900/40 text-orange-300 border border-slate-800 rounded-lg text-[10px] font-semibold transition truncate"
                    title="Add Human Handover Node"
                  >
                    + Human
                  </button>
                </div>
              </div>

              {/* Red Delete Node Button */}
              <div className="pt-2">
                <button
                  onClick={handleDeleteSelectedNode}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-rose-950/70 hover:bg-rose-900 border border-rose-500/50 text-rose-300 rounded-xl text-xs font-semibold transition shadow-md"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Selected Node</span>
                </button>
              </div>
            </div>
          ) : selectedEdge ? (
            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-500 font-mono uppercase block">
                  Connection Link
                </span>
                <p className="text-slate-300 text-[11px] mt-1 font-mono">
                  {selectedEdge.source} → {selectedEdge.target}
                </p>
                {selectedEdge.sourceHandle && (
                  <p className="text-emerald-400 text-[10px] font-mono">
                    Handle: {selectedEdge.sourceHandle}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Connection Label
                </label>
                <input
                  type="text"
                  value={selectedEdge.label || ''}
                  onChange={(e) => {
                    const newLabel = e.target.value;
                    setEdges((eds) =>
                      eds.map((ed) => (ed.id === selectedEdge.id ? { ...ed, label: newLabel } : ed))
                    );
                    setSelectedEdge((prev) => ({ ...prev, label: newLabel }));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  placeholder="e.g. Yes / Option 1"
                />
              </div>

              <button
                onClick={handleDeleteSelectedEdge}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-rose-950/70 hover:bg-rose-900 border border-rose-500/50 text-rose-300 rounded-xl text-xs font-semibold transition shadow-md"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Disconnect This Link</span>
              </button>
            </div>
          ) : (
            <div className="text-center py-10 space-y-2 text-slate-500 text-xs">
              <HelpCircle className="w-8 h-8 mx-auto text-slate-600" />
              <p className="font-semibold text-slate-400">No Item Selected</p>
              <p className="text-[11px] leading-relaxed">
                Click any node or connection arrow to edit its text, choices, or delete it.
              </p>
              <div className="pt-3">
                <span className="text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-2 py-1 rounded">
                  Tip: Press Backspace or Delete to remove
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Live Chat Simulator Drawer */}
        {isSimulatorOpen && (
          <div className="h-80 border-t border-slate-800 bg-slate-950 flex flex-col">
            <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" />
                Live Flow Test Simulator
              </span>
              <button
                onClick={handleResetSimulator}
                title="Reset simulation session"
                className="p-1 hover:bg-slate-800 text-slate-400 rounded transition"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
              {simChat.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] p-2 rounded-xl text-xs whitespace-pre-wrap leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-slate-800 text-slate-200 rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSimulateSend} className="p-2 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                placeholder="Type customer reply..."
                value={simInput}
                onChange={(e) => setSimInput(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}
      </aside>
      )}

      {/* AI Flow Builder Modal */}
      <Modal
        isOpen={isAIPromptOpen}
        onClose={() => {
          if (!isAIGenerating) setIsAIPromptOpen(false);
        }}
        title="✨ AI WhatsApp Flow Builder"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <div className="p-3 bg-purple-950/40 border border-purple-500/40 rounded-xl text-xs text-purple-200 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-300" />
              Powered by Google Gemini AI
            </p>
            <p className="text-[11px] text-purple-300/90 leading-relaxed">
              Describe your business automation flow in natural language. The AI will synthesize all trigger keywords, interactive menus, branching conditions, and responses directly onto the canvas.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              What kind of chatbot workflow do you want to create?
            </label>
            <textarea
              rows={4}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. Create a customer service flow for a real estate agency with options for buying flats, rental listings, and talking to an agent..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-purple-500 resize-none leading-relaxed"
            />
          </div>

          {/* Quick Prompt Templates */}
          <div>
            <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
              Or click a pre-made business template:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setAiPrompt('Real estate lead generation bot with options to Buy 2BHK/3BHK flats, Rent apartments, and talk to a property consultant.')}
                className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left text-slate-300 hover:text-purple-300 transition"
              >
                🏢 <strong>Real Estate Agency</strong>
                <p className="text-[10px] text-slate-500 mt-0.5">Buying, Renting & Agent Handoff</p>
              </button>

              <button
                type="button"
                onClick={() => setAiPrompt('E-commerce store assistant for tracking order status, browsing product categories, and requesting refunds.')}
                className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left text-slate-300 hover:text-purple-300 transition"
              >
                🛍️ <strong>E-Commerce & Retail</strong>
                <p className="text-[10px] text-slate-500 mt-0.5">Track Orders & Product Catalog</p>
              </button>

              <button
                type="button"
                onClick={() => setAiPrompt('Medical clinic appointment booking bot with doctor schedule, clinic timings, and emergency contact.')}
                className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left text-slate-300 hover:text-purple-300 transition"
              >
                🩺 <strong>Clinic & Healthcare</strong>
                <p className="text-[10px] text-slate-500 mt-0.5">Book Appointment & Clinic Hours</p>
              </button>

              <button
                type="button"
                onClick={() => setAiPrompt('24/7 customer support bot with plans & pricing, frequently asked questions, and human support escalation.')}
                className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left text-slate-300 hover:text-purple-300 transition"
              >
                ❓ <strong>24/7 Customer Support</strong>
                <p className="text-[10px] text-slate-500 mt-0.5">Pricing Tiers & Instant FAQ</p>
              </button>
            </div>
          </div>

          {/* Status Message */}
          {aiStatusMessage && (
            <div className="p-2.5 rounded-xl text-xs bg-purple-950/70 border border-purple-500/50 text-purple-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400 animate-spin flex-shrink-0" />
              <span>{aiStatusMessage}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              disabled={isAIGenerating}
              onClick={() => setIsAIPromptOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isAIGenerating || !aiPrompt.trim()}
              onClick={handleGenerateAIFlow}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-5 py-2 rounded-xl shadow-lg shadow-purple-600/30 transition"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>{isAIGenerating ? 'Generating Flow...' : 'Generate with AI'}</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FlowBuilder;
