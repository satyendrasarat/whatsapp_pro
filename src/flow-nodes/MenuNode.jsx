import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ListFilter } from 'lucide-react';

export const MenuNode = memo(({ data, isConnectable }) => {
  const options = data.options || [
    { key: '1', label: 'Option 1' },
    { key: '2', label: 'Option 2' }
  ];

  return (
    <div className="bg-slate-900 border border-purple-500/80 rounded-xl p-4 shadow-xl w-72 text-slate-100 relative">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="!bg-purple-400 !w-3 !h-3 !border-2 !border-slate-900"
      />

      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
        <div className="p-1.5 bg-purple-500/20 text-purple-400 rounded-lg">
          <ListFilter className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">Interactive Menu</h4>
          <p className="text-sm font-semibold truncate">{data.label || 'Branch Options'}</p>
        </div>
      </div>

      <div className="space-y-2">
        {options.map((opt, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs relative group"
          >
            <div className="flex items-center gap-1.5">
              <span className="bg-purple-900/60 text-purple-300 font-mono text-[10px] px-1.5 py-0.5 rounded font-bold">
                {opt.key}
              </span>
              <span className="text-slate-300 truncate max-w-[150px]">{opt.label}</span>
            </div>
            <Handle
              type="source"
              position={Position.Right}
              id={`opt-${idx}`}
              isConnectable={isConnectable}
              className="!bg-purple-500 !w-3 !h-3 !border-2 !border-slate-900 !-right-1.5"
            />
          </div>
        ))}
      </div>
    </div>
  );
});

export default MenuNode;

