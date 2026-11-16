import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Bot, Sparkles, ShieldCheck } from 'lucide-react';

export const AIAgentNode = memo(({ data, isConnectable }) => {
  const autoEscalate = data.escalateOnConfusion !== false;

  return (
    <div className="bg-slate-900 border-2 border-purple-500/60 hover:border-purple-400 transition-colors rounded-xl p-4 shadow-2xl w-80 text-slate-100">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="!bg-purple-400 !w-3 !h-3 !border-2 !border-slate-900"
      />

      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-lg shadow-md shadow-purple-600/30">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-purple-400">AI Handover</h4>
              <Sparkles className="w-3 h-3 text-amber-400" />
            </div>
            <p className="text-sm font-semibold truncate text-slate-100">{data.label || 'AI Agent Handover'}</p>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-950 border border-purple-500/40 text-purple-300">
          Gemini
        </span>
      </div>

      <div className="space-y-2">
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 text-xs text-purple-200/90 whitespace-pre-wrap max-h-24 overflow-y-auto font-sans leading-relaxed">
          {data.introText || data.content || '🤖 Hands over to AI Agent with Knowledge Base & Catalog.'}
        </div>

        {data.systemPrompt && (
          <div className="text-[10px] text-slate-400 bg-slate-950/60 px-2 py-1 rounded border border-slate-800 font-mono truncate">
            Persona: {data.systemPrompt}
          </div>
        )}

        {autoEscalate && (
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2 text-[10px] space-y-0.5">
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Direction & Confusion Guardrail Active
            </span>
            <p className="text-slate-400 text-[9px] leading-tight">
              Continues chatting if in right direction; auto-transfers to human if sender seems confused or off-track.
            </p>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="!bg-purple-500 !w-3 !h-3 !border-2 !border-slate-900"
      />
    </div>
  );
});

export default AIAgentNode;

