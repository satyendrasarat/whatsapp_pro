import { flowsDao, flowSessionsDao, chatLogsDao, conversationStatusDao, lidMappingsDao, settingsDao } from './db.js';

export class FlowEngine {
    constructor(aiEngine = null) {
        this.aiEngine = aiEngine;
        this.broadcaster = null;
    }

    setBroadcaster(fn) {
        this.broadcaster = fn;
    }

    emitHandover(fromJid, reason = 'Visual Flow Human Handover', lastMessage = '') {
        if (typeof this.broadcaster === 'function') {
            this.broadcaster({
                type: 'human_handover_requested',
                chatJid: fromJid,
                reason,
                lastMessage
            });
            this.broadcaster({
                type: 'bot_status_changed',
                chatJid: fromJid,
                botDisabled: true
            });
        }
    }

    setAIEngine(aiEngine) {
        this.aiEngine = aiEngine;
    }

    cleanText(txt) {
        return (txt || '').trim().toLowerCase();
    }

    matchesWord(text, word) {
        if (!text || !word) return false;
        const cleanText = (text || '').trim().toLowerCase();
        const cleanWord = (word || '').trim().toLowerCase();
        if (cleanText === cleanWord) return true;
        const escaped = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|\\s|[^a-zA-Z0-9])${escaped}($|\\s|[^a-zA-Z0-9])`, 'i');
        return regex.test(cleanText) || cleanText.includes(cleanWord);
    }

    findMatchingFlow(messageText, allowWildcard = true, allowFallback = false) {
        const activeFlows = flowsDao.getActive();
        const cleaned = this.cleanText(messageText);

        let wildcardFlow = null;

        for (const flow of activeFlows) {
            let kws = [];
            if (flow.trigger_keyword) {
                kws = flow.trigger_keyword.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
            }
            // Also inspect trigger node in graph if present
            try {
                const nodes = typeof flow.nodes_graph === 'string' ? JSON.parse(flow.nodes_graph) : flow.nodes_graph;
                const trg = nodes?.find?.(n => n.type === 'trigger');
                if (trg?.data?.keyword) {
                    const nodeKws = trg.data.keyword.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                    for (const nk of nodeKws) {
                        if (!kws.includes(nk)) kws.push(nk);
                    }
                }
            } catch (e) {}

            for (const kw of kws) {
                if (kw === '*' || kw === 'any' || kw === 'all' || kw === 'catchall' || kw === 'default') {
                    if (!wildcardFlow) wildcardFlow = flow;
                } else if (kw && (cleaned === kw || this.matchesWord(cleaned, kw))) {
                    return flow;
                }
            }
        }

        // If no specific keyword matched and wildcard is allowed, return wildcard flow
        if (allowWildcard && wildcardFlow) {
            return wildcardFlow;
        }

        // If no keyword matched, check for fallback flow only when explicitly allowed
        if (allowFallback) {
            return flowsDao.getFallback();
        }

        return null;
    }

    parseGraph(flow) {
        let nodes = [];
        let edges = [];
        try {
            nodes = typeof flow.nodes_graph === 'string' ? JSON.parse(flow.nodes_graph) : flow.nodes_graph;
        } catch (e) {
            nodes = [];
        }
        try {
            edges = typeof flow.edges_graph === 'string' ? JSON.parse(flow.edges_graph) : flow.edges_graph;
        } catch (e) {
            edges = [];
        }
        return { nodes, edges };
    }

    findStartNode(nodes, edges) {
        // Look for trigger node first
        const triggerNode = nodes.find(n => n.type === 'trigger');
        if (triggerNode) {
            return triggerNode;
        }
        // Fallback: node with no incoming edges
        const targetIds = new Set(edges.map(e => e.target));
        const root = nodes.find(n => !targetIds.has(n.id));
        return root || nodes[0];
    }

    getNextNode(nodes, edges, currentNodeId, userChoice = null, sourceHandle = null) {
        const outEdges = edges.filter(e => e.source === currentNodeId);
        if (outEdges.length === 0) return null;

        // If specific sourceHandle matched
        if (sourceHandle) {
            const edge = outEdges.find(e => e.sourceHandle === sourceHandle);
            if (edge) return nodes.find(n => n.id === edge.target);
        }

        // If user choice key is provided, search edges that match label or option handle
        if (userChoice) {
            const edge = outEdges.find(e => 
                (e.label && e.label.toLowerCase() === userChoice.toLowerCase()) ||
                (e.sourceHandle && e.sourceHandle.includes(userChoice))
            );
            if (edge) return nodes.find(n => n.id === edge.target);
        }

        // Default to first outgoing edge
        const firstEdge = outEdges[0];
        return nodes.find(n => n.id === firstEdge.target);
    }

    async executeSubflow(subflowNode, parentFlow, parentNodes, parentEdges, fromJid, messageText, variables, prefixReply = '') {
        const targetFlowId = subflowNode?.data?.targetFlowId;
        if (!targetFlowId) {
            return (prefixReply ? prefixReply + '\n\n' : '') + '⚠️ [Sub-flow Node] No target flow selected in configuration.';
        }

        const subFlow = flowsDao.getById(targetFlowId);
        if (!subFlow || !subFlow.is_active) {
            return (prefixReply ? prefixReply + '\n\n' : '') + '⚠️ [Sub-flow Node] Selected sub-flow is inactive or unavailable.';
        }

        variables.call_stack = variables.call_stack || [];
        if (variables.call_stack.length >= 5) {
            return (prefixReply ? prefixReply + '\n\n' : '') + '⚠️ [Sub-flow] Maximum nesting depth (5) exceeded to prevent loops.';
        }

        const returnOnComplete = subflowNode.data?.returnOnComplete !== false;
        if (returnOnComplete) {
            const returnNode = this.getNextNode(parentNodes, parentEdges, subflowNode.id);
            if (returnNode) {
                variables.call_stack.push({
                    parentFlowId: parentFlow.id,
                    returnNodeId: returnNode.id
                });
            }
        }

        const { nodes: subNodes, edges: subEdges } = this.parseGraph(subFlow);
        const subStart = this.findStartNode(subNodes, subEdges);
        if (!subStart) {
            return (prefixReply ? prefixReply + '\n\n' : '') + '⚠️ [Sub-flow] Target flow has no nodes.';
        }

        let entryNode = subStart;
        if (subStart.type === 'trigger') {
            const afterTrigger = this.getNextNode(subNodes, subEdges, subStart.id);
            if (afterTrigger) {
                entryNode = afterTrigger;
            }
        }

        if (entryNode.type === 'message') {
            let reply = entryNode.data?.content || entryNode.data?.label || '';
            if (prefixReply) reply = prefixReply + '\n\n' + reply;

            const nextAfterEntry = this.getNextNode(subNodes, subEdges, entryNode.id);
            if (nextAfterEntry) {
                if (nextAfterEntry.type === 'menu') {
                    const options = nextAfterEntry.data?.options || [];
                    let menuPrompt = nextAfterEntry.data?.label || 'Please select an option:';
                    if (options.length > 0) {
                        menuPrompt += '\n\n' + options.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
                    }
                    reply += '\n\n' + menuPrompt;
                    flowSessionsDao.set(fromJid, subFlow.id, nextAfterEntry.id, variables);
                } else if (nextAfterEntry.type === 'condition') {
                    const prompt = nextAfterEntry.data?.prompt || nextAfterEntry.data?.content || 'Please reply:';
                    reply += '\n\n' + prompt;
                    flowSessionsDao.set(fromJid, subFlow.id, nextAfterEntry.id, variables);
                } else if (nextAfterEntry.type === 'subflow' || nextAfterEntry.type === 'sub_flow') {
                    return this.executeSubflow(nextAfterEntry, subFlow, subNodes, subEdges, fromJid, messageText, variables, reply);
                } else {
                    flowSessionsDao.set(fromJid, subFlow.id, nextAfterEntry.id, variables);
                }
            } else {
                return this.checkAndResumeParent(fromJid, variables, reply);
            }
            return reply;
        } else if (entryNode.type === 'menu') {
            const options = entryNode.data?.options || [];
            let menuPrompt = entryNode.data?.label || 'Please select an option:';
            if (options.length > 0) {
                menuPrompt += '\n\n' + options.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
            }
            if (prefixReply) menuPrompt = prefixReply + '\n\n' + menuPrompt;
            flowSessionsDao.set(fromJid, subFlow.id, entryNode.id, variables);
            return menuPrompt;
        } else if (entryNode.type === 'condition') {
            const prompt = entryNode.data?.prompt || entryNode.data?.content || 'Please reply:';
            const fullMsg = prefixReply ? prefixReply + '\n\n' + prompt : prompt;
            flowSessionsDao.set(fromJid, subFlow.id, entryNode.id, variables);
            return fullMsg;
        } else if (entryNode.type === 'ai_handover' || entryNode.type === 'ai_agent') {
            const intro = entryNode.data?.introText || entryNode.data?.content || '🤖 *AI Consultant Connected!*';
            const fullMsg = prefixReply ? prefixReply + '\n\n' + intro : intro;
            variables.ai_active = true;
            flowSessionsDao.set(fromJid, subFlow.id, entryNode.id, variables);
            return fullMsg;
        } else if (entryNode.type === 'subflow' || entryNode.type === 'sub_flow') {
            return this.executeSubflow(entryNode, subFlow, subNodes, subEdges, fromJid, messageText, variables, prefixReply);
        }

        flowSessionsDao.set(fromJid, subFlow.id, entryNode.id, variables);
        return prefixReply || 'Proceeding in sub-flow...';
    }

    checkAndResumeParent(fromJid, variables, currentReply = '') {
        if (variables.call_stack && variables.call_stack.length > 0) {
            const frame = variables.call_stack.pop();
            const parentFlow = flowsDao.getById(frame.parentFlowId);
            if (parentFlow && parentFlow.is_active) {
                const { nodes: pNodes, edges: pEdges } = this.parseGraph(parentFlow);
                const resumeNode = pNodes.find(n => n.id === frame.returnNodeId);
                if (resumeNode) {
                    if (resumeNode.type === 'message') {
                        const resumeMsg = resumeNode.data?.content || resumeNode.data?.label || '';
                        let combined = currentReply ? `${currentReply}\n\n${resumeMsg}` : resumeMsg;
                        const afterResume = this.getNextNode(pNodes, pEdges, resumeNode.id);
                        if (afterResume) {
                            if (afterResume.type === 'menu') {
                                const opts = afterResume.data?.options || [];
                                let mPrompt = afterResume.data?.label || 'Please select an option:';
                                if (opts.length > 0) {
                                    mPrompt += '\n\n' + opts.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
                                }
                                combined += '\n\n' + mPrompt;
                            } else if (afterResume.type === 'condition') {
                                const cPrompt = afterResume.data?.prompt || afterResume.data?.content || 'Please reply:';
                                combined += '\n\n' + cPrompt;
                            }
                            flowSessionsDao.set(fromJid, parentFlow.id, afterResume.id, variables);
                        } else {
                            return this.checkAndResumeParent(fromJid, variables, combined);
                        }
                        return combined;
                    } else if (resumeNode.type === 'menu') {
                        const opts = resumeNode.data?.options || [];
                        let mPrompt = resumeNode.data?.label || 'Please select an option:';
                        if (opts.length > 0) {
                            mPrompt += '\n\n' + opts.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
                        }
                        const combined = currentReply ? `${currentReply}\n\n${mPrompt}` : mPrompt;
                        flowSessionsDao.set(fromJid, parentFlow.id, resumeNode.id, variables);
                        return combined;
                    } else if (resumeNode.type === 'condition') {
                        const cPrompt = resumeNode.data?.prompt || resumeNode.data?.content || 'Please reply:';
                        const combined = currentReply ? `${currentReply}\n\n${cPrompt}` : cPrompt;
                        flowSessionsDao.set(fromJid, parentFlow.id, resumeNode.id, variables);
                        return combined;
                    } else if (resumeNode.type === 'ai_handover' || resumeNode.type === 'ai_agent') {
                        const intro = resumeNode.data?.introText || resumeNode.data?.content || '🤖 *AI Consultant Connected!*';
                        const combined = currentReply ? `${currentReply}\n\n${intro}` : intro;
                        variables.ai_active = true;
                        flowSessionsDao.set(fromJid, parentFlow.id, resumeNode.id, variables);
                        return combined;
                    } else if (resumeNode.type === 'subflow' || resumeNode.type === 'sub_flow') {
                        return this.executeSubflow(resumeNode, parentFlow, pNodes, pEdges, fromJid, '', variables, currentReply);
                    }
                }
            }
        }

        // Call stack empty: session completed
        flowSessionsDao.clear(fromJid);
        return currentReply;
    }

    async processIncoming(fromJid, messageText, draftFlow = null) {
        // 0. Check if bot is disabled for this customer (Human Agent Takeover)
        if (conversationStatusDao.isBotDisabled(fromJid)) {
            console.log(`[FlowEngine] Bot automation paused for customer ${fromJid}. Bypassing flow.`);
            return null;
        }

        let session = flowSessionsDao.get(fromJid);
        let flow = null;
        let currentNode = null;
        let variables = {};

        // 0.5. If testing in simulator with draftFlow from active canvas
        if (draftFlow && (draftFlow.nodes_graph || draftFlow.nodes)) {
            const draftNodes = typeof draftFlow.nodes_graph === 'string' ? JSON.parse(draftFlow.nodes_graph) : (draftFlow.nodes || draftFlow.nodes_graph || []);
            const draftEdges = typeof draftFlow.edges_graph === 'string' ? JSON.parse(draftFlow.edges_graph) : (draftFlow.edges || draftFlow.edges_graph || []);
            const normDraft = {
                id: draftFlow.id || 'draft',
                name: draftFlow.name || 'Draft Flow',
                trigger_keyword: (draftFlow.trigger_keyword || '').trim(),
                is_active: 1,
                nodes_graph: draftNodes,
                edges_graph: draftEdges
            };

            // If session already exists in simulator and matches a node in draft flow
            if (session && session.current_node_id && draftNodes.some(n => n.id === session.current_node_id)) {
                flow = normDraft;
                currentNode = draftNodes.find(n => n.id === session.current_node_id);
                try {
                    variables = JSON.parse(session.variables_json || '{}');
                } catch (e) {
                    variables = {};
                }
            } else {
                // Check if message matches draft flow trigger
                const trg = draftNodes.find(n => n.type === 'trigger');
                const rawKws = trg?.data?.keyword !== undefined ? trg.data.keyword : normDraft.trigger_keyword;
                const kws = (rawKws || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                const cleaned = this.cleanText(messageText);
                const isDraftFallback = normDraft.is_fallback === 1 || draftFlow.is_fallback === 1 || trg?.data?.is_fallback === true;
                const matches = isDraftFallback || kws.includes('*') || kws.includes('any') || kws.includes('all') || kws.includes('catchall') || kws.some(k => cleaned === k || this.matchesWord(cleaned, k));
                if (matches) {
                    flow = normDraft;
                    currentNode = this.findStartNode(draftNodes, draftEdges);
                    variables = {};
                    flowSessionsDao.clear(fromJid);
                } else {
                    // In simulation mode: the user is testing THIS specific draft flow!
                    // If the message does not match the draft flow keywords and is not a wildcard,
                    // STOP execution and do NOT fall through to database flows or other bots!
                    const keywordListStr = kws.length ? kws.map(k => `"${k}"`).join(', ') : 'None';
                    return `⚠️ No trigger matched for "${messageText}".\n\n📌 Trigger Keyword(s): ${keywordListStr}\n(Send one of the matching keywords above to trigger this flow, or add * to match any message.)`;
                }
            }
        }

        // 1. Session Inactivity Timeout (30 minutes)
        const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
        if (session && session.active_flow_id) {
            let isExpired = false;
            if (session.last_interaction) {
                const dateStr = session.last_interaction.endsWith('Z') ? session.last_interaction : `${session.last_interaction}Z`;
                const lastTime = new Date(dateStr).getTime();
                if (!isNaN(lastTime) && (Date.now() - lastTime > SESSION_TIMEOUT_MS)) {
                    isExpired = true;
                }
            }
            if (isExpired) {
                flowSessionsDao.clear(fromJid);
                session = null;
            } else {
                flow = flowsDao.getById(session.active_flow_id);
                if (flow && flow.is_active) {
                    const { nodes, edges } = this.parseGraph(flow);
                    currentNode = nodes.find(n => n.id === session.current_node_id);
                    try {
                        variables = JSON.parse(session.variables_json || '{}');
                    } catch (e) {
                        variables = {};
                    }
                }
            }
        }

        // 2. Allow user to breakout/reset anytime by typing a recognized flow trigger keyword (specific keyword only, NOT wildcard, NOT fallback)
        const freshKeywordFlow = this.findMatchingFlow(messageText, false, false);
        if (freshKeywordFlow) {
            flow = freshKeywordFlow;
            const { nodes, edges } = this.parseGraph(flow);
            currentNode = this.findStartNode(nodes, edges);
            variables = {};
            flowSessionsDao.clear(fromJid);
        }

        // 3. If no active session or expired, match fresh flow from message
        if (!flow || !currentNode) {
            // Match flow: check exact keywords, wildcard *, and explicit user-configured fallback flow
            flow = this.findMatchingFlow(messageText, true, true);
            if (!flow) {
                return null; // No match
            }

            const { nodes, edges } = this.parseGraph(flow);
            currentNode = this.findStartNode(nodes, edges);
            if (!currentNode) return null;

            variables = {};
        }

        const { nodes, edges } = this.parseGraph(flow);

        // Process based on currentNode type
        let reply = '';
        let nextNode = null;

        if (currentNode.type === 'trigger') {
            // Move immediately to next node
            nextNode = this.getNextNode(nodes, edges, currentNode.id);
            if (!nextNode) {
                return this.checkAndResumeParent(fromJid, variables, 'Flow started.');
            }
            if (nextNode.type === 'message') {
                reply = nextNode.data?.content || nextNode.data?.label || '';
                const afterNext = this.getNextNode(nodes, edges, nextNode.id);
                if (afterNext) {
                    if (afterNext.type === 'menu') {
                        const options = afterNext.data?.options || [];
                        let menuPrompt = afterNext.data?.label || 'Please select an option:';
                        if (options.length > 0) {
                            menuPrompt += '\n\n' + options.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
                        }
                        reply += '\n\n' + menuPrompt;
                        flowSessionsDao.set(fromJid, flow.id, afterNext.id, variables);
                    } else if (afterNext.type === 'condition') {
                        const condPrompt = afterNext.data?.prompt || afterNext.data?.content || 'Please reply:';
                        reply += '\n\n' + condPrompt;
                        flowSessionsDao.set(fromJid, flow.id, afterNext.id, variables);
                    } else if (afterNext.type === 'subflow' || afterNext.type === 'sub_flow') {
                        return this.executeSubflow(afterNext, flow, nodes, edges, fromJid, messageText, variables, reply);
                    } else if (afterNext.type === 'human_handover' || afterNext.type === 'human_agent' || afterNext.type === 'agent_handover') {
                        conversationStatusDao.setBotDisabled(fromJid, true, true, afterNext.data?.note || 'Handed over by flow node');
                        flowSessionsDao.clear(fromJid);
                        const hMsg = afterNext.data?.message || afterNext.data?.content || '🔔 Connecting you with a live human support specialist. One moment please...';
                        return reply ? `${reply}\n\n${hMsg}` : hMsg;
                    } else {
                        flowSessionsDao.set(fromJid, flow.id, afterNext.id, variables);
                    }
                } else {
                    return this.checkAndResumeParent(fromJid, variables, reply);
                }
                return reply;
            } else if (nextNode.type === 'subflow' || nextNode.type === 'sub_flow') {
                return this.executeSubflow(nextNode, flow, nodes, edges, fromJid, messageText, variables);
            } else if (nextNode.type === 'human_handover' || nextNode.type === 'human_agent' || nextNode.type === 'agent_handover') {
                conversationStatusDao.setBotDisabled(fromJid, true, true, nextNode.data?.note || 'Handed over by flow node');
                flowSessionsDao.clear(fromJid);
                return nextNode.data?.message || nextNode.data?.content || '🔔 Connecting you with a live human support specialist. One moment please...';
            } else if (nextNode && (nextNode.type === 'ai_handover' || nextNode.type === 'ai_agent')) {
                reply = nextNode.data?.introText || nextNode.data?.content || '🤖 *AI Consultant Connected!*\nAsk me anything about our products, pricing, or services.';
                variables.ai_active = true;

                const afterNext = this.getNextNode(nodes, edges, nextNode.id);
                if (afterNext) {
                    if (afterNext.type === 'condition') {
                        const condPrompt = afterNext.data?.prompt || afterNext.data?.content;
                        if (condPrompt) {
                            reply += '\n\n' + condPrompt;
                        }
                        flowSessionsDao.set(fromJid, flow.id, afterNext.id, variables);
                    } else if (afterNext.type === 'menu') {
                        const options = afterNext.data?.options || [];
                        let menuPrompt = afterNext.data?.label || 'Please select an option:';
                        if (options.length > 0) {
                            menuPrompt += '\n\n' + options.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
                        }
                        reply += '\n\n' + menuPrompt;
                        flowSessionsDao.set(fromJid, flow.id, afterNext.id, variables);
                    } else {
                        flowSessionsDao.set(fromJid, flow.id, nextNode.id, variables);
                    }
                } else {
                    flowSessionsDao.set(fromJid, flow.id, nextNode.id, variables);
                }
                return reply;
            } else if (nextNode && nextNode.type === 'menu') {
                const options = nextNode.data?.options || [];
                let menuPrompt = nextNode.data?.label || 'Please select one of the following options:';
                if (options.length > 0) {
                    menuPrompt += '\n\n' + options.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
                }
                flowSessionsDao.set(fromJid, flow.id, nextNode.id, variables);
                return menuPrompt;
            } else if (nextNode && nextNode.type === 'condition') {
                const condPrompt = nextNode.data?.prompt || nextNode.data?.content || 'Please reply:';
                flowSessionsDao.set(fromJid, flow.id, nextNode.id, variables);
                return condPrompt;
            }
        }

        if (currentNode.type === 'message') {
            reply = currentNode.data?.content || currentNode.data?.label || '';
            nextNode = this.getNextNode(nodes, edges, currentNode.id);
            if (nextNode) {
                if (nextNode.type === 'menu') {
                    const options = nextNode.data?.options || [];
                    let menuPrompt = nextNode.data?.label || 'Please select an option:';
                    if (options.length > 0) {
                        menuPrompt += '\n\n' + options.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
                    }
                    reply += '\n\n' + menuPrompt;
                    flowSessionsDao.set(fromJid, flow.id, nextNode.id, variables);
                } else if (nextNode.type === 'condition') {
                    const condPrompt = nextNode.data?.prompt || nextNode.data?.content || 'Please reply:';
                    reply += '\n\n' + condPrompt;
                    flowSessionsDao.set(fromJid, flow.id, nextNode.id, variables);
                } else if (nextNode.type === 'subflow' || nextNode.type === 'sub_flow') {
                    return this.executeSubflow(nextNode, flow, nodes, edges, fromJid, messageText, variables, reply);
                } else if (nextNode.type === 'human_handover' || nextNode.type === 'human_agent' || nextNode.type === 'agent_handover') {
                    conversationStatusDao.setBotDisabled(fromJid, true, true, nextNode.data?.note || 'Handed over by flow node');
                    flowSessionsDao.clear(fromJid);
                    const hMsg = nextNode.data?.message || nextNode.data?.content || '🔔 Connecting you with a live human support specialist. One moment please...';
                    return reply ? `${reply}\n\n${hMsg}` : hMsg;
                } else {
                    flowSessionsDao.set(fromJid, flow.id, nextNode.id, variables);
                }
            } else {
                // Flow / sub-flow branch finished: check and resume parent flow
                return this.checkAndResumeParent(fromJid, variables, reply);
            }
            return reply;
        }

        if (currentNode.type === 'condition') {
            const condWords = (currentNode.data?.conditionText || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
            const userMsg = (messageText || '').toLowerCase().trim();
            const isMatch = condWords.some(w => this.matchesWord(userMsg, w));
            const handleId = isMatch ? 'match' : 'nomatch';
            const target = this.getNextNode(nodes, edges, currentNode.id, null, handleId);

            if (target) {
                if (target.type === 'message') {
                    reply = target.data?.content || target.data?.label || '';
                    const isHumanMsg = (target.data?.label || '').toLowerCase().includes('human') || 
                                       (target.data?.content || '').toLowerCase().includes('human agent') ||
                                       (target.data?.content || '').toLowerCase().includes('human assistance');
                    if (isHumanMsg) {
                        conversationStatusDao.setBotDisabled(fromJid, true, true, target.data?.label || 'Human handover in flow');
                        this.emitHandover(fromJid);
                        flowSessionsDao.clear(fromJid);
                        return reply;
                    }

                    const followUp = this.getNextNode(nodes, edges, target.id);
                    if (followUp) {
                        if (followUp.type === 'subflow' || followUp.type === 'sub_flow') {
                            return this.executeSubflow(followUp, flow, nodes, edges, fromJid, messageText, variables, reply);
                        } else if (followUp.type === 'menu') {
                            const options = followUp.data?.options || [];
                            let menuPrompt = followUp.data?.label || 'Please select an option:';
                            if (options.length > 0) {
                                menuPrompt += '\n\n' + options.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
                            }
                            reply += '\n\n' + menuPrompt;
                            flowSessionsDao.set(fromJid, flow.id, followUp.id, variables);
                        } else if (followUp.type === 'human_handover' || followUp.type === 'human_agent' || followUp.type === 'agent_handover') {
                            conversationStatusDao.setBotDisabled(fromJid, true, true, followUp.data?.note || 'Human handover in flow');
                            this.emitHandover(fromJid);
                            flowSessionsDao.clear(fromJid);
                            const hMsg = followUp.data?.message || followUp.data?.content || '🔔 Connecting you with a live human support specialist.';
                            return `${reply}\n\n${hMsg}`;
                        } else {
                            flowSessionsDao.set(fromJid, flow.id, followUp.id, variables);
                        }
                    } else {
                        // If this was a "Continue AI / No-Match" branch and flow has an AI agent node, keep session active at the AI node!
                        const aiNode = nodes.find(n => n.type === 'ai_handover' || n.type === 'ai_agent');
                        if (aiNode && handleId === 'nomatch') {
                            variables.ai_active = true;
                            flowSessionsDao.set(fromJid, flow.id, aiNode.id, variables);
                            if (this.aiEngine && messageText && messageText.length > 2) {
                                try {
                                    const aiAnswer = await this.aiEngine.generateReply(messageText, {
                                        phone: fromJid.split('@')[0],
                                        isFlowHandover: true
                                    });
                                    if (aiAnswer) reply += '\n\n' + aiAnswer;
                                } catch (e) {}
                            }
                            return reply;
                        }
                        return this.checkAndResumeParent(fromJid, variables, reply);
                    }
                    return reply;
                } else if (target.type === 'subflow' || target.type === 'sub_flow') {
                    return this.executeSubflow(target, flow, nodes, edges, fromJid, messageText, variables);
                } else if (target.type === 'human_handover' || target.type === 'human_agent' || target.type === 'agent_handover') {
                    conversationStatusDao.setBotDisabled(fromJid, true, true, target.data?.note || 'Human handover node in flow');
                    this.emitHandover(fromJid);
                    flowSessionsDao.clear(fromJid);
                    return target.data?.message || target.data?.content || '🔔 Connecting you with a live human support specialist. One moment please...';
                } else if (target.type === 'ai_handover' || target.type === 'ai_agent') {
                    reply = target.data?.introText || target.data?.content || '🤖 *AI Consultant Connected!*\nAsk me anything about our services.';
                    variables.ai_active = true;
                    flowSessionsDao.set(fromJid, flow.id, target.id, variables);
                    return reply;
                } else if (target.type === 'menu') {
                    const options = target.data?.options || [];
                    let menuPrompt = target.data?.label || 'Please select an option:';
                    if (options.length > 0) {
                        menuPrompt += '\n\n' + options.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
                    }
                    flowSessionsDao.set(fromJid, flow.id, target.id, variables);
                    return menuPrompt;
                } else {
                    flowSessionsDao.set(fromJid, flow.id, target.id, variables);
                    return `Processing...`;
                }
            } else {
                return this.checkAndResumeParent(fromJid, variables, 'Decision processed.');
            }
        }

        if (currentNode.type === 'ai_handover' || currentNode.type === 'ai_agent') {
            const userMsg = (messageText || '').toLowerCase().trim();
            const autoEscalate = currentNode.data?.escalateOnConfusion !== false;
            const customConfusionWords = (currentNode.data?.confusionKeywords || '')
                .split(',')
                .map(w => w.trim().toLowerCase())
                .filter(Boolean);

            const defaultConfusionWords = [
                'human', 'agent', 'person', 'representative', 'operator',
                'talk to someone', 'speak to someone', 'talk to human', 'speak to human',
                'confused', 'confuse', 'confusion', "don't understand", 'not understanding', "doesn't make sense",
                'not what i asked', 'unclear', 'wrong answer', 'not helpful', 'no sense',
                'call me', 'call', 'real person', 'support specialist'
            ];

            const allConfusionWords = [...new Set([...customConfusionWords, ...defaultConfusionWords])];
            const isConfused = autoEscalate && allConfusionWords.some(w => this.matchesWord(userMsg, w));

            // Default handover notice sent to customer upon escalation
            const defaultHandoverNotice = currentNode.data?.handoverMessage || '👨‍💼 Connecting you with a live human support specialist. One moment please while our team reviews your conversation...';

            // Check if AI node has an outgoing edge (e.g. to condition check, human handover, menu, etc.)
            const nextNode = this.getNextNode(nodes, edges, currentNode.id);

            if (nextNode) {
                if (nextNode.type === 'condition') {
                    const condWords = (nextNode.data?.conditionText || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
                    const isMatch = isConfused || condWords.some(w => this.matchesWord(userMsg, w));
                    const handleId = isMatch ? 'match' : 'nomatch';
                    const target = this.getNextNode(nodes, edges, nextNode.id, null, handleId);

                    if (target) {
                        if (target.type === 'message') {
                            reply = target.data?.content || target.data?.label || '';
                            const isHumanMsg = isConfused ||
                                               (target.data?.label || '').toLowerCase().includes('human') || 
                                               (target.data?.content || '').toLowerCase().includes('human agent') ||
                                               (target.data?.content || '').toLowerCase().includes('human assistance');
                            if (isHumanMsg) {
                                conversationStatusDao.setBotDisabled(fromJid, true, true, target.data?.label || 'Human handover requested');
                                if (fromJid.endsWith('@lid')) {
                                    const m = lidMappingsDao.get(fromJid);
                                    if (m?.phone_jid) conversationStatusDao.setBotDisabled(m.phone_jid, true, true, target.data?.label || 'Human handover requested');
                                }
                                this.emitHandover(fromJid);
                                flowSessionsDao.clear(fromJid);
                                return reply;
                            } else {
                                const followUp = this.getNextNode(nodes, edges, target.id);
                                if (followUp) {
                                    flowSessionsDao.set(fromJid, flow.id, followUp.id, variables);
                                } else {
                                    flowSessionsDao.clear(fromJid);
                                }
                                return reply;
                            }
                        } else if (target.type === 'human_handover' || target.type === 'human_agent' || target.type === 'agent_handover') {
                            conversationStatusDao.setBotDisabled(fromJid, true, true, target.data?.note || 'Human handover in flow');
                            if (fromJid.endsWith('@lid')) {
                                const m = lidMappingsDao.get(fromJid);
                                if (m?.phone_jid) conversationStatusDao.setBotDisabled(m.phone_jid, true, true, target.data?.note || 'Human handover in flow');
                            }
                            this.emitHandover(fromJid);
                            flowSessionsDao.clear(fromJid);
                            return target.data?.message || target.data?.content || defaultHandoverNotice;
                        } else if (target.type === 'menu') {
                            const options = target.data?.options || [];
                            let menuPrompt = target.data?.label || 'Please select an option:';
                            if (options.length > 0) {
                                menuPrompt += '\n\n' + options.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
                            }
                            flowSessionsDao.set(fromJid, flow.id, target.id, variables);
                            return menuPrompt;
                        }
                    }
                } else if (nextNode.type === 'human_handover' || nextNode.type === 'human_agent' || nextNode.type === 'agent_handover') {
                    if (isConfused) {
                        conversationStatusDao.setBotDisabled(fromJid, true, true, nextNode.data?.note || 'Customer confusion / requested human');
                        if (fromJid.endsWith('@lid')) {
                            const m = lidMappingsDao.get(fromJid);
                            if (m?.phone_jid) conversationStatusDao.setBotDisabled(m.phone_jid, true, true, nextNode.data?.note || 'Customer confusion / requested human');
                        }
                        this.emitHandover(fromJid);
                        flowSessionsDao.clear(fromJid);
                        return nextNode.data?.message || nextNode.data?.content || defaultHandoverNotice;
                    }
                }
            }

            // Direct Smart Guardrail: If customer is confused and no explicit condition handled it, auto-transfer to human
            if (isConfused) {
                conversationStatusDao.setBotDisabled(fromJid, true, true, 'Customer confused / requested human assistance');
                if (fromJid.endsWith('@lid')) {
                    const m = lidMappingsDao.get(fromJid);
                    if (m?.phone_jid) conversationStatusDao.setBotDisabled(m.phone_jid, true, true, 'Customer confused / requested human assistance');
                }
                this.emitHandover(fromJid);
                flowSessionsDao.clear(fromJid);
                return defaultHandoverNotice;
            }

            if (!variables.ai_active) {
                reply = currentNode.data?.introText || currentNode.data?.content || '🤖 *AI Consultant Connected!*\nHello! I am your AI assistant. Ask me anything about our products, services, or pricing.';
                variables.ai_active = true;
                flowSessionsDao.set(fromJid, flow.id, currentNode.id, variables);
                return reply;
            }

            // Customer is actively talking to AI in right direction
            if (this.aiEngine) {
                try {
                    const aiReply = await this.aiEngine.generateReply(messageText, {
                        phone: fromJid.split('@')[0],
                        customSystemPrompt: currentNode.data?.systemPrompt || null,
                        isFlowHandover: true,
                        enableConfusionGuardrail: autoEscalate
                    });

                    if (aiReply) {
                        if (aiReply.includes('[HANDOVER_TO_HUMAN]')) {
                            // AI model detected confusion or could not answer in right direction
                            conversationStatusDao.setBotDisabled(fromJid, true, true, 'AI Guardrail: Conversation off-track or confusion detected');
                            if (fromJid.endsWith('@lid')) {
                                const m = lidMappingsDao.get(fromJid);
                                if (m?.phone_jid) conversationStatusDao.setBotDisabled(m.phone_jid, true, true, 'AI Guardrail: Conversation off-track or confusion detected');
                            }
                            this.emitHandover(fromJid);
                            flowSessionsDao.clear(fromJid);
                            const cleanAi = aiReply.replace(/\[HANDOVER_TO_HUMAN\]/gi, '').trim();
                            return cleanAi || defaultHandoverNotice;
                        }
                        reply = aiReply.replace(/\[HANDOVER_TO_HUMAN\]/gi, '').trim();
                    }
                } catch (e) {
                    console.error('[AI Handover] Error generating AI response:', e);
                }
            }

            if (!reply) {
                reply = "Thank you for your question! A representative will also review this shortly.";
            }

            // Keep session active at AI Handover node so customer can keep chatting continuously
            flowSessionsDao.set(fromJid, flow.id, currentNode.id, variables);
            return reply;
        }

        if (currentNode.type === 'menu') {
            const rawChoice = (messageText || '').trim();
            const options = currentNode.data?.options || [];
            
            // Check matching option by key (e.g. "1") or label (e.g. "Support")
            const matchedOptionIndex = options.findIndex(
                opt => opt.key === rawChoice || opt.label?.toLowerCase() === rawChoice.toLowerCase()
            );

            if (matchedOptionIndex !== -1) {
                const option = options[matchedOptionIndex];
                const handleId = `opt-${matchedOptionIndex}`;
                
                // Route either by explicit targetNodeId in option data or by handle edge
                let target = option.targetNodeId ? nodes.find(n => n.id === option.targetNodeId) : null;
                if (!target) {
                    target = this.getNextNode(nodes, edges, currentNode.id, rawChoice, handleId);
                }

                if (target) {
                    variables.last_choice = option.label || option.key;
                    if (target.type === 'message') {
                        reply = target.data?.content || target.data?.label || '';
                        const followUp = this.getNextNode(nodes, edges, target.id);
                        if (followUp) {
                            if (followUp.type === 'subflow' || followUp.type === 'sub_flow') {
                                return this.executeSubflow(followUp, flow, nodes, edges, fromJid, messageText, variables, reply);
                            } else if (followUp.type === 'menu') {
                                const mOpts = followUp.data?.options || [];
                                let mPrompt = followUp.data?.label || 'Please select an option:';
                                if (mOpts.length > 0) {
                                    mPrompt += '\n\n' + mOpts.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
                                }
                                reply += '\n\n' + mPrompt;
                                flowSessionsDao.set(fromJid, flow.id, followUp.id, variables);
                            } else {
                                flowSessionsDao.set(fromJid, flow.id, followUp.id, variables);
                            }
                        } else {
                            return this.checkAndResumeParent(fromJid, variables, reply);
                        }
                        return reply;
                    } else if (target.type === 'subflow' || target.type === 'sub_flow') {
                        return this.executeSubflow(target, flow, nodes, edges, fromJid, messageText, variables);
                    } else if (target.type === 'human_handover' || target.type === 'human_agent' || target.type === 'agent_handover') {
                        conversationStatusDao.setBotDisabled(fromJid, true, true, target.data?.note || 'Human handover node in flow');
                        this.emitHandover(fromJid);
                        flowSessionsDao.clear(fromJid);
                        return target.data?.message || target.data?.content || '🔔 Connecting you with a live human support specialist. One moment please...';
                    } else if (target.type === 'ai_handover' || target.type === 'ai_agent') {
                        reply = target.data?.introText || target.data?.content || '🤖 *AI Consultant Connected!*\nAsk me anything about our products, pricing, or services.';
                        variables.ai_active = true;
                        flowSessionsDao.set(fromJid, flow.id, target.id, variables);
                        return reply;
                    } else if (target.type === 'condition') {
                        flowSessionsDao.set(fromJid, flow.id, target.id, variables);
                        const prompt = target.data?.prompt || target.data?.content || `Please share your reservation details (mention if you have any special requests like VIP or outdoor seating):`;
                        return prompt;
                    } else {
                        flowSessionsDao.set(fromJid, flow.id, target.id, variables);
                        return `You selected: ${option.label}`;
                    }
                }
            }

            // If invalid option selected, maintain session at current menu node so user can try again!
            flowSessionsDao.set(fromJid, flow.id, currentNode.id, variables);
            let menuPrompt = currentNode.data?.label || 'Please select one of the following options:';
            if (options.length > 0) {
                menuPrompt += '\n\n' + options.map(o => `${o.key}️⃣ ${o.label}`).join('\n');
            }
            return `⚠️ Invalid option. ${menuPrompt}`;
        }

        if (currentNode.type === 'subflow' || currentNode.type === 'sub_flow') {
            return this.executeSubflow(currentNode, flow, nodes, edges, fromJid, messageText, variables);
        }

        if (currentNode.type === 'human_handover' || currentNode.type === 'human_agent' || currentNode.type === 'agent_handover') {
            conversationStatusDao.setBotDisabled(fromJid, true, true, currentNode.data?.note || 'Human handover node in flow');
            this.emitHandover(fromJid);
            flowSessionsDao.clear(fromJid);
            return currentNode.data?.message || currentNode.data?.content || '🔔 Connecting you with a live human support specialist. One moment please...';
        }

        // Generic fallback
        reply = currentNode.data?.content || currentNode.data?.label || 'Thank you for reaching out!';
        return this.checkAndResumeParent(fromJid, variables, reply);
    }
}

export default FlowEngine;

