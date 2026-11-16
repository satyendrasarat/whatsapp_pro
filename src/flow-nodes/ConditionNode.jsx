import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

export const ConditionNode = memo(({ data, isConnectable }) => {
  return (
    <div className="bg-slate-900 border border-amber-500/80 rounded-xl p-4 shadow-xl w-64 text-slate-100">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="!bg-amber-400 !w-3 !h-3 !border-2 !border-slate-900"
      />

      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800">
        <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg">
          <GitBranch className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">Condition Check</h4>
          <p className="text-sm font-semibold truncate">{data.label || 'If Contains'}</p>
        </div>
      </div>

      {/* Question Prompt */}
      <div className="bg-slate-950/80 p-2 rounded text-xs text-slate-300 border border-slate-800 mb-2 leading-relaxed">
        <span className="text-[10px] uppercase font-bold text-amber-400/80 block mb-0.5">Prompt Question:</span>
        <span className="line-clamp-2 text-slate-200">
          {data.prompt || data.content || 'Please reply with your details below:'}
        </span>
      </div>

      <div className="bg-slate-950 p-2 rounded text-xs font-mono text-amber-200 border border-slate-800">
        Match: {data.conditionText || 'yes / agree / buy'}
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-[11px] relative">
          <span className="text-emerald-400 font-semibold">Match (Yes) Branch →</span>
          <Handle
            type="source"
            position={Position.Right}
            id="match"
            isConnectable={isConnectable}
            className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-slate-900 !-right-1.5"
          />
        </div>
        <div className="flex items-center justify-between bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-[11px] relative">
          <span className="text-rose-400 font-semibold">Default (No) Branch →</span>
          <Handle
            type="source"
            position={Position.Right}
            id="nomatch"
            isConnectable={isConnectable}
            className="!bg-rose-500 !w-3 !h-3 !border-2 !border-slate-900 !-right-1.5"
          />
        </div>
      </div>
    </div>
  );
});

export default ConditionNode;

