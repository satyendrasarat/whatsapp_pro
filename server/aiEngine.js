import { knowledgeDao, productsDao, settingsDao } from './db.js';

export class AIEngine {
    constructor() {}

    async buildContext(userQuery) {
        // Strip voice note labels for accurate RAG database searches
        const cleanQuery = (userQuery || '')
            .replace(/^(?:🎤\s*\[(?:Voice Note|Audio Message)\]:?\s*)/i, '')
            .trim();

        // 1. Search knowledge items
        const knowledgeMatches = cleanQuery ? knowledgeDao.search(cleanQuery) : [];
        // If query search had no hits, grab top 3 knowledge items
        const kbItems = knowledgeMatches.length > 0 ? knowledgeMatches.slice(0, 5) : knowledgeDao.getAll().slice(0, 3);

        // 2. Search products
        const productMatches = cleanQuery ? productsDao.search(cleanQuery) : [];
        const prods = productMatches.length > 0 ? productMatches.slice(0, 5) : productsDao.getAll().slice(0, 3);

        let context = 'COMPANY KNOWLEDGE BASE:\n';
        if (kbItems.length === 0) {
            context += 'None available.\n';
        } else {
            kbItems.forEach((k, idx) => {
                context += `${idx + 1}. [${k.title}]: ${k.content}\n`;
            });
        }

        context += '\nPRODUCT CATALOG:\n';
        if (prods.length === 0) {
            context += 'No products listed.\n';
        } else {
            prods.forEach((p, idx) => {
                context += `${idx + 1}. SKU: ${p.sku || 'N/A'} | ${p.title} - $${p.price} | In Stock: ${p.in_stock ? 'Yes' : 'No'}\nDescription: ${p.description || 'N/A'}\n`;
            });
        }

        return { context, kbItems, prods, hasDirectMatch: (knowledgeMatches.length > 0 || productMatches.length > 0) };
    }

    async generateReply(userQuery, senderInfo = {}) {
        const settings = settingsDao.getAll();
        const mode = settings.auto_responder_mode || (settings.ai_enabled_globally === 'false' ? 'disabled' : 'hybrid');

        if (mode === 'disabled' || settings.ai_enabled_globally === 'false') {
            return null;
        }

        // In 'flows_only' mode, AI replies only when explicitly invoked via Flow AI Handover
        if (mode === 'flows_only' && !senderInfo.isFlowHandover && !senderInfo.customSystemPrompt) {
            return null;
        }

        const { context, kbItems, prods, hasDirectMatch } = await this.buildContext(userQuery);
        const systemPrompt = senderInfo.customSystemPrompt || settings.ai_system_prompt || 'You are an intelligent WhatsApp customer support assistant.';
        const provider = settings.ai_provider || 'local_ollama';

        const guardrailInstruction = senderInfo.enableConfusionGuardrail !== false
            ? '\n4. Direction & Confusion Guardrail: If the customer appears confused, dissatisfied, expresses that the answer is wrong/unclear, or asks to speak with a human or real person, start your response with [HANDOVER_TO_HUMAN].'
            : '';

        const voiceNoteInstruction = senderInfo.isVoiceNote
            ? '\n5. Spoken Voice Note Adaptation: The customer sent an audio voice message. Keep your response conversational, concise, and natural so that when read aloud as a voice reply it sounds smooth, human, and pleasant. Avoid complex markdown tables or raw web URLs.'
            : '';

        const fullPrompt = `${systemPrompt}

Current Customer: ${senderInfo.name || 'Valued Customer'} (${senderInfo.phone || 'WhatsApp User'})
Customer Inquiry: "${userQuery}"

Relevant Reference Context:
${context}

Instructions:
1. Answer the customer concisely and politely in WhatsApp-friendly format (emojis, short paragraphs, bullet points where helpful).
2. Base your response strictly on the provided Knowledge Base and Product Catalog when relevant.
3. If the answer is not in the context, politely let them know an agent will follow up shortly.${guardrailInstruction}${voiceNoteInstruction}`;

        // 1. Try Ollama if configured
        if (provider === 'local_ollama') {
            try {
                const endpoint = settings.ollama_endpoint || 'http://localhost:11434';
                const model = settings.ollama_model || 'llama3:latest';
                
                const response = await fetch(`${endpoint}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model,
                        prompt: fullPrompt,
                        stream: false
                    }),
                    signal: AbortSignal.timeout(10000)
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.response) return data.response.trim();
                }
            } catch (err) {
                console.warn('Ollama request failed or timed out:', err.message);
                // Fallthrough to Gemini / OpenAI / Built-in RAG
            }
        }

        // 2. Try Gemini API
        if (settings.gemini_api_key) {
            const geminiModels = [
                'gemini-3.5-flash-lite',
                'gemini-3.5-flash',
                'gemini-2.5-flash-lite',
                'gemini-flash-latest'
            ];

            for (const model of geminiModels) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.gemini_api_key}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: fullPrompt }] }]
                        }),
                        signal: AbortSignal.timeout(10000)
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (text) {
                            console.log(`[Gemini API] Generated response using ${model}`);
                            return text.trim();
                        }
                    } else {
                        const errData = await response.json().catch(() => ({}));
                        console.warn(`[Gemini API] ${model} returned HTTP ${response.status}:`, errData.error?.message || response.statusText);
                    }
                } catch (err) {
                    console.warn(`[Gemini API] ${model} failed:`, err.message);
                }
            }
        }

        // 3. Try OpenAI API
        if (settings.openai_api_key) {
            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.openai_api_key}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: fullPrompt }
                        ]
                    }),
                    signal: AbortSignal.timeout(10000)
                });

                if (response.ok) {
                    const data = await response.json();
                    const text = data.choices?.[0]?.message?.content;
                    if (text) return text.trim();
                }
            } catch (err) {
                console.warn('OpenAI API call failed:', err.message);
            }
        }

        // 4. Built-in High-Quality RAG Rule-Based Auto-Responder Fallback
        // Only return if there is an actual relevant match in KB or Products
        if (hasDirectMatch && (kbItems.length > 0 || prods.length > 0)) {
            let smartReply = 'Hello! Thanks for reaching out. Based on your inquiry:\n\n';
            if (kbItems.length > 0) {
                smartReply += `📌 *${kbItems[0].title}*\n${kbItems[0].content}\n\n`;
            }
            if (prods.length > 0) {
                smartReply += `🛍️ *Featured Product:* ${prods[0].title} - \$${prods[0].price}\n${prods[0].description || ''}\n\n`;
            }
            smartReply += 'Reply if you need more details or type *help* to see options!';
            return smartReply;
        }

        return null;
    }

    normalizeFlowGraph(flow) {
        if (!flow || !Array.isArray(flow.nodes)) return flow;

        const nodes = flow.nodes.map((node, index) => {
            let type = (node.type || 'message').toLowerCase();
            const data = { ...(node.data || {}) };

            // 1. Normalize type
            if (type === 'ai_agent' || type === 'ai' || type === 'assistant' || type === 'agent') {
                type = 'ai_handover';
            } else if (type === 'sub_flow' || type === 'subworkflow' || type === 'sub_workflow') {
                type = 'subflow';
            } else if (type === 'question' || type === 'choice' || type === 'options') {
                if (Array.isArray(data.options) && data.options.length > 0) {
                    type = 'menu';
                } else {
                    type = 'condition';
                }
            } else if (type === 'action' || type === 'text' || type === 'reply' || type === 'response') {
                type = 'message';
            }

            // 2. Normalize content / label
            if (!data.content && data.message) data.content = data.message;
            if (!data.content && data.text) data.content = data.text;
            if (!data.label) data.label = node.id || 'Node';

            // 3. Normalize Menu options
            if (type === 'menu') {
                if (Array.isArray(data.options)) {
                    data.options = data.options.map((opt, optIdx) => {
                        if (typeof opt === 'string') {
                            return { key: String(optIdx + 1), label: opt };
                        }
                        return { key: String(opt.key || optIdx + 1), label: opt.label || opt.text || `Option ${optIdx + 1}` };
                    });
                } else {
                    data.options = [
                        { key: '1', label: 'Option 1' },
                        { key: '2', label: 'Option 2' }
                    ];
                }
            }

            // 4. Normalize Condition
            if (type === 'condition') {
                if (!data.prompt && (data.message || data.content || data.question)) {
                    data.prompt = data.message || data.content || data.question;
                }
                if (!data.conditionText && (data.condition || data.match || data.keywords)) {
                    data.conditionText = data.condition || data.match || data.keywords;
                }
                if (!data.conditionText) {
                    data.conditionText = 'yes, agree, confirm, urgent, vip';
                }
            }

            // 5. Normalize AI Handover
            if (type === 'ai_handover') {
                if (!data.introText && (data.message || data.content || data.greeting)) {
                    data.introText = data.message || data.content || data.greeting;
                }
                if (!data.introText) {
                    data.introText = '🤖 *AI Consultant Connected!*\nAsk me anything about our services or products.';
                }
                if (!data.systemPrompt) {
                    data.systemPrompt = 'You are a helpful and polite WhatsApp customer support and sales assistant.';
                }
            }

            // 6. Ensure clean position
            const position = node.position || {
                x: 60 + index * 340,
                y: 180 + (index % 3) * 120
            };

            return {
                ...node,
                id: node.id || `node-${index + 1}`,
                type,
                position,
                data
            };
        });

        // Normalize Edges
        const edges = (flow.edges || []).map((edge, edgeIdx) => {
            return {
                id: edge.id || `e-${edge.source}-${edge.target || edgeIdx}`,
                source: edge.source,
                target: edge.target,
                sourceHandle: edge.sourceHandle || null,
                label: edge.label || '',
                animated: true,
                style: { stroke: '#10b981', strokeWidth: 2 },
                markerEnd: { type: 'arrowclosed', color: '#10b981' }
            };
        });

        return {
            ...flow,
            nodes,
            edges
        };
    }

    async generateFlowFromPrompt(userPrompt) {
        const settings = settingsDao.getAll();
        const systemPrompt = `You are an elite conversational workflow architect and WhatsApp chatbot automation engineer.
Your job is to transform a natural language user request into a complete, high-converting, professional visual chatbot workflow (React Flow format).

SUPPORTED NODE TYPES & SCHEMAS:
1. "trigger":
   - id: "node-trigger-1"
   - type: "trigger"
   - position: { "x": 60, "y": 180 }
   - data: { "label": "Keyword Trigger", "keyword": "comma, separated, trigger, words (e.g. menu, food, order) OR '*' for catch-all wildcard (triggers on ANY incoming message)" }

2. "message":
   - id: "node-msg-1", "node-msg-2", etc.
   - type: "message"
   - position: { "x": ..., "y": ... }
   - data: { "label": "Short Descriptive Title", "content": "Engaging WhatsApp message text with appropriate emojis, bold headers (*...*), and clear bullet points" }

3. "menu":
   - id: "node-menu-1", etc.
   - type: "menu"
   - position: { "x": ..., "y": ... }
   - data: {
       "label": "Interactive Menu Title",
       "options": [
         { "key": "1", "label": "Option 1 Title" },
         { "key": "2", "label": "Option 2 Title" },
         { "key": "3", "label": "Ask AI Consultant" }
       ]
     }
   - Branch handles MUST be named: "opt-0" (key 1), "opt-1" (key 2), "opt-2" (key 3)...

4. "condition":
   - id: "node-cond-1", etc.
   - type: "condition"
   - position: { "x": ..., "y": ... }
   - data: {
       "label": "Qualification or Preference Check",
       "prompt": "Clear question sent to customer before decision (e.g. 'Please share your details (mention if you have any special VIP or outdoor requests):')",
       "conditionText": "comma, separated, match, words (e.g. 'vip, special, outdoor, yes, urgent')"
     }
   - Branch handles:
     * "match" (Green branch: Customer reply contains any match words)
     * "nomatch" (Red branch: Customer reply contains none of the match words)

5. "ai_handover":
   - id: "node-ai-1", etc.
   - type: "ai_handover"
   - position: { "x": ..., "y": ... }
   - data: {
       "label": "AI Expert Handover",
       "introText": "🤖 *AI Specialist Connected!*\nAsk me any question about our products, pricing, or custom requests.",
       "systemPrompt": "Domain-specific persona directive for Gemini (e.g. 'You are an expert sales consultant assisting customers with inquiries. Answer accurately from catalog.')",
       "escalateOnConfusion": true,
       "confusionKeywords": "human, agent, person, confused, help, representative, operator, real person, call me",
       "handoverMessage": "🔔 Connecting you with a live human support specialist. One moment please..."
     }

6. "human_handover":
   - id: "node-human-1", etc.
   - type: "human_handover"
   - position: { "x": ..., "y": ... }
   - data: {
       "label": "Human Agent Handover",
       "message": "🔔 Connecting you with a live human support specialist. One moment please...",
       "note": "Customer requested live support or AI guardrail triggered"
     }

UX & LAYOUT ARCHITECTURE RULES:
- Progression is strictly Left-to-Right without overlapping:
  * Trigger: x: 60, y: 180
  * Root Step (Greeting, Menu, or AI): x: 380, y: 180
  * Next layer / Options / Escalation: x: 740 (fanned vertically at y: 60, 220, 380, etc.)
  * Subsequent branches / Confirmations / Handover: x: 1100 (fanned vertically at y: 60, 220, 380)
  * Keep 340px horizontal spacing and 160px vertical spacing.
- When to use Condition Nodes:
  Whenever qualifying leads, checking VIP/urgency, verifying yes/no confirmation, or sorting preferences. Always connect BOTH the 'match' (Yes) and 'nomatch' (No) handles to respective follow-up nodes!
- When to use AI Handover & Human Handover:
  Whenever the user prompt mentions AI, intelligent assistance, support escalation, or continuous conversational Q&A. Connect an outgoing edge from the AI node to a 'human_handover' node for confusion escalation or live takeover!
  When user wants an automated catch-all AI flow with guardrail, set Trigger keyword to '*', connect to 'ai_handover', and wire to 'human_handover'.

EDGE CONNECTIONS:
- All edges must include:
  { "id": "e-...", "source": "node-...", "target": "node-...", "label": "Optional handle label", "animated": true, "style": { "stroke": "#10b981", "strokeWidth": 2 }, "markerEnd": { "type": "arrowclosed", "color": "#10b981" } }
- From Menu: specify "sourceHandle": "opt-0", "opt-1", etc.
- From Condition: specify "sourceHandle": "match" (for Yes) and "nomatch" (for No/Default).

OUTPUT FORMAT:
Output MUST be strictly a valid JSON object only. No markdown formatting, no backticks, no outer text.
{
  "name": "Professional Flow Name",
  "trigger_keyword": "trigger, words, comma, separated",
  "nodes": [...],
  "edges": [...]
}`;

        const promptText = `${systemPrompt}\n\nUSER PROMPT:\n"${userPrompt}"`;

        // 1. Try Gemini Models
        if (settings.gemini_api_key) {
            const geminiModels = [
                'gemini-3.5-flash-lite',
                'gemini-3.5-flash',
                'gemini-2.5-flash-lite',
                'gemini-flash-latest'
            ];

            for (const model of geminiModels) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.gemini_api_key}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: promptText }] }],
                            generationConfig: {
                                responseMimeType: "application/json"
                            }
                        }),
                        signal: AbortSignal.timeout(35000)
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (rawText) {
                            const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
                            const parsed = JSON.parse(cleaned);
                            if (parsed.nodes && parsed.edges) {
                                console.log(`[AI Flow Generator] Successfully synthesized flow using ${model}`);
                                return this.normalizeFlowGraph(parsed);
                            }
                        }
                    }
                } catch (err) {
                    console.warn(`[AI Flow Generator] Gemini ${model} failed:`, err.message);
                }
            }
        }

        // 2. Try OpenAI
        if (settings.openai_api_key) {
            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.openai_api_key}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        response_format: { type: "json_object" }
                    }),
                    signal: AbortSignal.timeout(15000)
                });

                if (response.ok) {
                    const data = await response.json();
                    const raw = data.choices?.[0]?.message?.content;
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed.nodes && parsed.edges) return parsed;
                    }
                }
            } catch (err) {
                console.warn('[AI Flow Generator] OpenAI failed:', err.message);
            }
        }

        // 3. Fallback Smart Rule-Based Flow Synthesizer
        return this.generateSmartDefaultFlow(userPrompt);
    }

    async editFlowWithAI(userPrompt, currentFlow) {
        const settings = settingsDao.getAll();
        const flowSummary = {
            name: currentFlow.name || 'Custom Flow',
            trigger_keyword: currentFlow.trigger_keyword || '',
            nodes: (currentFlow.nodes || []).map(n => ({
                id: n.id,
                type: n.type,
                position: n.position,
                data: n.data
            })),
            edges: (currentFlow.edges || []).map(e => ({
                id: e.id,
                source: e.source,
                target: e.target,
                sourceHandle: e.sourceHandle,
                label: e.label,
                animated: e.animated !== false
            }))
        };

        const systemPrompt = `You are an expert visual workflow engineer and conversational UX designer for WhatsApp CRM.
Your task is to EDIT and ENHANCE an existing visual chatbot workflow based on the user's modification prompt.

EXISTING FLOW SPECIFICATION (JSON):
${JSON.stringify(flowSummary, null, 2)}

SUPPORTED NODE TYPES:
1. "trigger": data: { label: "...", keyword: "comma separated words" }
2. "message": data: { label: "...", content: "WhatsApp text with emojis/spintax" }
3. "menu": data: { label: "...", options: [{ key: "1", label: "..." }, { key: "2", label: "..." }] }
   - Branch handles must be named: opt-0, opt-1, opt-2, etc. (corresponding to index 0, 1, 2...)
4. "condition": data: { label: "...", prompt: "Question asked to customer before branching", conditionText: "words to match" }
   - Branch handles: "match" (for Yes) and "nomatch" (for No/Default)
5. "ai_handover": data: { label: "...", introText: "Greeting when AI takes over", systemPrompt: "Optional persona directive" }

CRITICAL RULES FOR EDITING:
1. PRESERVE & RESPECT EXISTING WORKFLOW: Keep existing node IDs and logic intact unless the user explicitly asks to remove, replace, or rewire them.
2. ADDING NEW NODES:
   - Generate unique IDs (e.g. node-msg-123, node-menu-456, node-cond-789).
   - Position new nodes logically to the right (x = parentNode.x + 340) or below (y spacing >= 160) without overlapping existing nodes.
   - Always wire new nodes with valid edges connecting from the appropriate parent handle to the new node id.
   - For menu options, ensure option keys are sequential and handles follow opt-0, opt-1, opt-2...
3. MODIFYING NODES:
   - If user asks to change text, tone, language, or options, edit the corresponding node's "data" object.
4. TRIGGER KEYWORDS:
   - If the user asks to add or change trigger keywords, update "trigger_keyword" and the trigger node data.
5. SUMMARY:
   - Include a brief 1-sentence "summary" explaining what specific edits were performed.

CRITICAL OUTPUT FORMAT:
You MUST return ONLY a strictly valid JSON object. No markdown, no triple backticks, no explanations outside JSON.
{
  "name": "Updated Flow Name",
  "trigger_keyword": "updated, keywords",
  "nodes": [...all nodes, updated and preserved...],
  "edges": [...all edges, updated and preserved...],
  "summary": "Short 1-sentence summary of modifications"
}`;

        const promptText = `${systemPrompt}\n\nUSER'S EDIT INSTRUCTION:\n"${userPrompt}"`;

        // 1. Try Gemini Models
        if (settings.gemini_api_key) {
            const geminiModels = [
                'gemini-3.5-flash-lite',
                'gemini-3.5-flash',
                'gemini-2.5-flash-lite',
                'gemini-flash-latest'
            ];

            for (const model of geminiModels) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.gemini_api_key}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: promptText }] }],
                            generationConfig: {
                                responseMimeType: "application/json"
                            }
                        }),
                        signal: AbortSignal.timeout(35000)
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (rawText) {
                            const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
                            const parsed = JSON.parse(cleaned);
                            if (parsed.nodes && parsed.edges) {
                                console.log(`[AI Flow Editor] Successfully modified flow using ${model}`);
                                const normalized = this.normalizeFlowGraph({
                                    name: parsed.name || currentFlow.name,
                                    trigger_keyword: parsed.trigger_keyword || currentFlow.trigger_keyword,
                                    nodes: parsed.nodes,
                                    edges: parsed.edges
                                });
                                return {
                                    flow: normalized,
                                    summary: parsed.summary || 'Flow successfully updated as per your instructions.'
                                };
                            }
                        }
                    }
                } catch (err) {
                    console.warn(`[AI Flow Editor] Gemini ${model} failed:`, err.message);
                }
            }
        }

        // 2. Try OpenAI
        if (settings.openai_api_key) {
            try {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${settings.openai_api_key}`
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userPrompt }
                        ],
                        response_format: { type: "json_object" }
                    }),
                    signal: AbortSignal.timeout(15000)
                });

                if (response.ok) {
                    const data = await response.json();
                    const raw = data.choices?.[0]?.message?.content;
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (parsed.nodes && parsed.edges) {
                            return {
                                flow: {
                                    name: parsed.name || currentFlow.name,
                                    trigger_keyword: parsed.trigger_keyword || currentFlow.trigger_keyword,
                                    nodes: parsed.nodes,
                                    edges: parsed.edges
                                },
                                summary: parsed.summary || 'Flow updated using OpenAI.'
                            };
                        }
                    }
                }
            } catch (err) {
                console.warn('[AI Flow Editor] OpenAI failed:', err.message);
            }
        }

        // 3. Fallback Smart Rule-Based Flow Modifier
        return this.applySmartEditFallback(userPrompt, currentFlow);
    }

    applySmartEditFallback(userPrompt, currentFlow) {
        const p = (userPrompt || '').toLowerCase();
        const nodes = JSON.parse(JSON.stringify(currentFlow.nodes || []));
        const edges = JSON.parse(JSON.stringify(currentFlow.edges || []));
        const suffix = Date.now().toString().slice(-4);

        // Find max x and y to place new nodes safely
        let maxX = 100;
        let maxY = 100;
        let lastNode = nodes[nodes.length - 1] || null;
        for (const n of nodes) {
            if (n.position?.x > maxX) {
                maxX = n.position.x;
                lastNode = n;
            }
            if (n.position?.y > maxY) maxY = n.position.y;
        }

        if (p.includes('discount') || p.includes('offer') || p.includes('coupon') || p.includes('deal')) {
            const newNodeId = `node-msg-discount-${suffix}`;
            nodes.push({
                id: newNodeId,
                type: 'message',
                position: { x: maxX + 340, y: lastNode ? lastNode.position.y : 180 },
                data: {
                    label: 'Discount Offer',
                    content: '🎉 *Special Deal for You!*\nUse promo code *SAVE20* at checkout for an instant 20% discount on your order today!'
                }
            });
            if (lastNode) {
                edges.push({
                    id: `e-discount-${suffix}`,
                    source: lastNode.id,
                    target: newNodeId,
                    label: 'Offer',
                    animated: true
                });
            }
            return {
                flow: { ...currentFlow, nodes, edges },
                summary: 'Added 20% discount promotional step connected to your workflow.'
            };
        }

        if (p.includes('ai') || p.includes('handover') || p.includes('handoff') || p.includes('gemini') || p.includes('assistant')) {
            const newNodeId = `node-ai-${suffix}`;
            nodes.push({
                id: newNodeId,
                type: 'ai_handover',
                position: { x: maxX + 340, y: lastNode ? lastNode.position.y : 180 },
                data: {
                    label: 'AI Knowledge Handover',
                    introText: '🤖 *AI Consultant Connected!*\nAsk me anything about our products, pricing, or policies.',
                    systemPrompt: 'You are an intelligent customer support assistant specializing in answering customer inquiries.'
                }
            });
            if (lastNode) {
                let sourceHandle = null;
                if (lastNode.type === 'menu' && lastNode.data?.options?.length > 0) {
                    sourceHandle = `opt-${lastNode.data.options.length - 1}`;
                }
                edges.push({
                    id: `e-ai-${suffix}`,
                    source: lastNode.id,
                    sourceHandle,
                    target: newNodeId,
                    label: 'Ask AI',
                    animated: true
                });
            }
            return {
                flow: { ...currentFlow, nodes, edges },
                summary: 'Added AI Agent Handover node connected to your workflow.'
            };
        }

        if (p.includes('agent') || p.includes('human') || p.includes('support') || p.includes('call') || p.includes('helpdesk')) {
            const newNodeId = `node-msg-agent-${suffix}`;
            nodes.push({
                id: newNodeId,
                type: 'message',
                position: { x: maxX + 340, y: lastNode ? lastNode.position.y + 120 : 260 },
                data: {
                    label: 'Human Support Desk',
                    content: '👨‍💼 *Live Agent Support*\nAn executive has been alerted and will join this WhatsApp chat in under 5 minutes. Feel free to leave extra details!'
                }
            });
            if (lastNode) {
                edges.push({
                    id: `e-agent-${suffix}`,
                    source: lastNode.id,
                    target: newNodeId,
                    label: 'Talk to Agent',
                    animated: true
                });
            }
            return {
                flow: { ...currentFlow, nodes, edges },
                summary: 'Added live human agent support handoff step.'
            };
        }

        if (p.includes('condition') || p.includes('check') || p.includes('yes') || p.includes('no')) {
            const condId = `node-cond-${suffix}`;
            const yesId = `node-msg-yes-${suffix}`;
            const noId = `node-msg-no-${suffix}`;

            nodes.push({
                id: condId,
                type: 'condition',
                position: { x: maxX + 340, y: 160 },
                data: {
                    label: 'Customer Decision Check',
                    conditionText: 'yes, agree, confirmed, sure, ok'
                }
            });
            nodes.push({
                id: yesId,
                type: 'message',
                position: { x: maxX + 680, y: 80 },
                data: {
                    label: 'Yes Response',
                    content: '✅ Excellent! Your confirmation is recorded. We are processing your request now.'
                }
            });
            nodes.push({
                id: noId,
                type: 'message',
                position: { x: maxX + 680, y: 260 },
                data: {
                    label: 'No Response',
                    content: '❌ No problem at all! Let us know if you change your mind or need any further assistance.'
                }
            });

            if (lastNode) {
                edges.push({ id: `e-cond-in-${suffix}`, source: lastNode.id, target: condId, animated: true });
            }
            edges.push({ id: `e-cond-yes-${suffix}`, source: condId, sourceHandle: 'match', target: yesId, label: 'Yes', animated: true });
            edges.push({ id: `e-cond-no-${suffix}`, source: condId, sourceHandle: 'nomatch', target: noId, label: 'No', animated: true });

            return {
                flow: { ...currentFlow, nodes, edges },
                summary: 'Added condition branch checking for Yes / No confirmation.'
            };
        }

        if (p.includes('polish') || p.includes('tone') || p.includes('friendly') || p.includes('professional') || p.includes('emoji')) {
            nodes.forEach(n => {
                if (n.type === 'message' && n.data?.content) {
                    if (!n.data.content.includes('👋') && !n.data.content.includes('✨')) {
                        n.data.content = `✨ ${n.data.content}\n\n🙏 *Thank you for connecting with us!*`;
                    }
                }
            });
            return {
                flow: { ...currentFlow, nodes, edges },
                summary: 'Polished messages across all nodes with friendly greetings and formatting.'
            };
        }

        // General Append Step
        const genId = `node-msg-step-${suffix}`;
        nodes.push({
            id: genId,
            type: 'message',
            position: { x: maxX + 340, y: lastNode ? lastNode.position.y : 180 },
            data: {
                label: userPrompt.length > 20 ? userPrompt.slice(0, 18) + '...' : userPrompt,
                content: `ℹ️ *Update:*\n${userPrompt}\n\nReply anytime to proceed!`
            }
        });
        if (lastNode) {
            edges.push({ id: `e-gen-${suffix}`, source: lastNode.id, target: genId, animated: true });
        }

        return {
            flow: { ...currentFlow, nodes, edges },
            summary: `Appended step: "${userPrompt.slice(0, 30)}..."`
        };
    }

    generateSmartDefaultFlow(userPrompt) {
        const p = (userPrompt || '').toLowerCase();
        const flowTitle = userPrompt.length > 30 ? userPrompt.slice(0, 28) + '...' : userPrompt;

        if (p.includes('any message') || p.includes('*') || p.includes('wildcard') || p.includes('confusion') || p.includes('confused') || (p.includes('ai') && (p.includes('human') || p.includes('handover') || p.includes('direction')))) {
            return {
                name: 'AI Agent with Smart Human Guardrail',
                trigger_keyword: '*',
                nodes: [
                    {
                        id: 'node-trigger-1',
                        type: 'trigger',
                        position: { x: 60, y: 180 },
                        data: { label: 'Any Message Trigger', keyword: '*' }
                    },
                    {
                        id: 'node-ai-1',
                        type: 'ai_handover',
                        position: { x: 380, y: 180 },
                        data: {
                            label: 'AI Expert Handover',
                            introText: '🤖 *AI Assistant Connected!*\nHello! How can I help you today? Feel free to ask any questions about our products, pricing, or services.',
                            systemPrompt: 'You are an intelligent, polite AI consultant. Answer customer questions dynamically and accurately using the knowledge base and catalog. If you cannot answer or the customer asks for a human, politely guide them.',
                            escalateOnConfusion: true,
                            confusionKeywords: 'human, agent, person, confused, call me, speak to someone, operator, help, live person',
                            handoverMessage: '🔔 Connecting you with a live human support specialist. One moment please...'
                        }
                    },
                    {
                        id: 'node-human-1',
                        type: 'human_handover',
                        position: { x: 740, y: 180 },
                        data: {
                            label: 'Live Human Support',
                            message: '🔔 You are now connected to our live human support desk. An operator will reply directly.',
                            note: 'Transferred via AI smart guardrail'
                        }
                    }
                ],
                edges: [
                    { id: 'e-trig-ai', source: 'node-trigger-1', target: 'node-ai-1', animated: true, style: { stroke: '#10b981', strokeWidth: 2 }, markerEnd: { type: 'arrowclosed', color: '#10b981' } },
                    { id: 'e-ai-human', source: 'node-ai-1', target: 'node-human-1', label: 'Confusion Escalation', animated: true, style: { stroke: '#ef4444', strokeWidth: 2 }, markerEnd: { type: 'arrowclosed', color: '#ef4444' } }
                ]
            };
        }

        if (p.includes('estate') || p.includes('property') || p.includes('rent') || p.includes('flat')) {
            return {
                name: 'Real Estate Assistant',
                trigger_keyword: 'property, flat, rent, buy, estate',
                nodes: [
                    {
                        id: 'node-trigger-1',
                        type: 'trigger',
                        position: { x: 60, y: 180 },
                        data: { label: 'Keyword Trigger', keyword: 'property, rent, buy' }
                    },
                    {
                        id: 'node-menu-1',
                        type: 'menu',
                        position: { x: 380, y: 160 },
                        data: {
                            label: 'Property Services',
                            options: [
                                { key: '1', label: 'Buy Residential Flat' },
                                { key: '2', label: 'Rental Properties' },
                                { key: '3', label: 'Speak with Agent' }
                            ]
                        }
                    },
                    {
                        id: 'node-msg-1',
                        type: 'message',
                        position: { x: 740, y: 60 },
                        data: { label: 'Buying Info', content: '🏢 *Residential Properties*\nWe have premium 2BHK and 3BHK flats available. Reply with your preferred location!' }
                    },
                    {
                        id: 'node-msg-2',
                        type: 'message',
                        position: { x: 740, y: 220 },
                        data: { label: 'Rental Info', content: '🔑 *Rental Listings*\nFurnished & semi-furnished apartments starting from $800/mo. What is your move-in date?' }
                    },
                    {
                        id: 'node-msg-3',
                        type: 'message',
                        position: { x: 740, y: 380 },
                        data: { label: 'Agent Contact', content: '👨‍💼 An executive property consultant will call you within 15 minutes. Thank you!' }
                    }
                ],
                edges: [
                    { id: 'e-trig-menu', source: 'node-trigger-1', target: 'node-menu-1', animated: true },
                    { id: 'e-opt-0', source: 'node-menu-1', sourceHandle: 'opt-0', target: 'node-msg-1', label: 'Buy Flat', animated: true },
                    { id: 'e-opt-1', source: 'node-menu-1', sourceHandle: 'opt-1', target: 'node-msg-2', label: 'Rentals', animated: true },
                    { id: 'e-opt-2', source: 'node-menu-1', sourceHandle: 'opt-2', target: 'node-msg-3', label: 'Agent', animated: true }
                ]
            };
        }

        // Generic Interactive Customer Flow
        return {
            name: flowTitle || 'Automated Customer Flow',
            trigger_keyword: 'hi, hello, help, info, support',
            nodes: [
                {
                    id: 'node-trigger-1',
                    type: 'trigger',
                    position: { x: 60, y: 180 },
                    data: { label: 'Keyword Trigger', keyword: 'hi, hello, help, start' }
                },
                {
                    id: 'node-menu-1',
                    type: 'menu',
                    position: { x: 380, y: 160 },
                    data: {
                        label: 'Main Menu',
                        options: [
                            { key: '1', label: 'Pricing & Plans' },
                            { key: '2', label: 'Support & FAQs' },
                            { key: '3', label: 'Talk to Human Agent' }
                        ]
                    }
                },
                {
                    id: 'node-msg-1',
                    type: 'message',
                    position: { x: 740, y: 60 },
                    data: { label: 'Pricing Details', content: '💎 *Our Plans:*\n• Starter: $29/mo\n• Growth: $79/mo\n• Enterprise: Custom\nReply *BUY* to get started!' }
                },
                {
                    id: 'node-msg-2',
                    type: 'message',
                    position: { x: 740, y: 220 },
                    data: { label: 'FAQ Answers', content: '❓ *Frequently Asked Questions*\nCheck our docs or ask any specific question and our AI will answer instantly.' }
                },
                {
                    id: 'node-msg-3',
                    type: 'message',
                    position: { x: 740, y: 380 },
                    data: { label: 'Human Handoff', content: '👨‍💼 A customer support agent has been notified and will reply shortly. Please hold on!' }
                }
            ],
            edges: [
                { id: 'e-trig-menu', source: 'node-trigger-1', target: 'node-menu-1', animated: true },
                { id: 'e-opt-0', source: 'node-menu-1', sourceHandle: 'opt-0', target: 'node-msg-1', label: 'Pricing', animated: true },
                { id: 'e-opt-1', source: 'node-menu-1', sourceHandle: 'opt-1', target: 'node-msg-2', label: 'Support', animated: true },
                { id: 'e-opt-2', source: 'node-menu-1', sourceHandle: 'opt-2', target: 'node-msg-3', label: 'Human', animated: true }
            ]
        };
    }
}

export default AIEngine;

