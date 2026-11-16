import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap } from 'lucide-react';

export const TriggerNode = memo(({ data, isConnectable }) => {
  return (
    <div className="bg-slate-900 border-2 border-emerald-500 rounded-xl p-4 shadow-xl w-64 text-slate-100">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800">
        <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
          <Zap className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Trigger</h4>
          <p className="text-sm font-semibold">{data.label || 'Keyword Trigger'}</p>
        </div>
      </div>
      <div className="text-xs text-slate-400 space-y-1">
        <p className="font-mono bg-slate-950 px-2 py-1 rounded text-emerald-300 border border-slate-800 truncate">
          Keywords: {data.keyword || 'hello, hi, start'}
        </p>
        <p className="text-[11px] text-slate-500 italic">
          {data.keyword === '*' || data.keyword === 'any'
            ? '⚡ Wildcard Trigger: Fires on ANY incoming message'
            : (data.description || 'Fires when customer sends matching words')}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-slate-900"
      />
    </div>
  );
});

export default TriggerNode;

