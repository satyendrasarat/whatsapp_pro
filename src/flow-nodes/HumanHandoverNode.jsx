import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Headphones, ShieldAlert } from 'lucide-react';

export const HumanHandoverNode = memo(({ data, isConnectable }) => {
  return (
    <div className="bg-slate-900 border-2 border-amber-500/80 hover:border-amber-400 transition-colors rounded-xl p-4 shadow-2xl w-80 text-slate-100">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="!bg-amber-400 !w-3 !h-3 !border-2 !border-slate-900"
      />

      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-lg shadow-md shadow-amber-600/30">
            <Headphones className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Human Handover</h4>
            </div>
            <p className="text-sm font-semibold truncate text-slate-100">{data.label || 'Live Agent Handover'}</p>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-950/80 border border-amber-500/40 text-amber-300 flex items-center gap-1">
          <ShieldAlert className="w-3 h-3 text-amber-400" />
          Live Agent
        </span>
      </div>

      <div className="space-y-2">
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 text-xs text-amber-200/90 whitespace-pre-wrap max-h-24 overflow-y-auto font-sans leading-relaxed">
          {data.message || data.content || '🔔 Connecting you with a live human support specialist. One moment please...'}
        </div>

        <div className="text-[10px] text-amber-400/80 bg-amber-950/40 px-2 py-1 rounded border border-amber-900/50 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>Pauses bot & alerts human agent in Live Inbox</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="!bg-amber-500 !w-3 !h-3 !border-2 !border-slate-900"
      />
    </div>
  );
});

export default HumanHandoverNode;
