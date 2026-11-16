import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { MessageSquareText } from 'lucide-react';

export const MessageNode = memo(({ data, isConnectable }) => {
  return (
    <div className="bg-slate-900 border border-slate-700 hover:border-emerald-500/60 transition-colors rounded-xl p-4 shadow-xl w-72 text-slate-100">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-slate-900"
      />
      
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800">
        <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg">
          <MessageSquareText className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400">Message Node</h4>
          <p className="text-sm font-semibold truncate">{data.label || 'Send WhatsApp Text'}</p>
        </div>
      </div>

      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 text-xs text-slate-300 whitespace-pre-wrap max-h-28 overflow-y-auto font-sans leading-relaxed">
        {data.content || 'Type message content...'}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-slate-900"
      />
    </div>
  );
});

export default MessageNode;

