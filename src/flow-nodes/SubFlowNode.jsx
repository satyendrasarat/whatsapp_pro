import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitFork, CornerDownRight, ArrowRight } from 'lucide-react';

export const SubFlowNode = memo(({ data, isConnectable }) => {
  const hasTarget = !!data.targetFlowId;
  const returnOnComplete = data.returnOnComplete !== false;

  return (
    <div className="bg-slate-900 border-2 border-cyan-500/70 hover:border-cyan-400 transition-colors rounded-xl p-4 shadow-2xl w-80 text-slate-100">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="!bg-cyan-400 !w-3 !h-3 !border-2 !border-slate-900"
      />

      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-to-br from-cyan-500 to-teal-600 text-white rounded-lg shadow-md shadow-cyan-600/30">
            <GitFork className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">Sub-Flow Module</h4>
            </div>
            <p className="text-sm font-semibold truncate text-slate-100">{data.label || 'Sub-Flow Step'}</p>
          </div>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
            returnOnComplete
              ? 'bg-cyan-950/80 border-cyan-500/40 text-cyan-300'
              : 'bg-amber-950/80 border-amber-500/40 text-amber-300'
          }`}
        >
          {returnOnComplete ? 'Call & Return' : 'Handoff'}
        </span>
      </div>

      <div className="space-y-2">
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 text-xs">
          {hasTarget ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-cyan-300 font-semibold truncate">
                <span className="text-slate-400 font-normal">Flow:</span>
                <span className="truncate">{data.targetFlowName || `Flow #${data.targetFlowId}`}</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                {returnOnComplete ? (
                  <>
                    <CornerDownRight className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>Executes subflow, then returns here</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>Permanent handoff (no return)</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="text-amber-400/90 text-[11px] flex items-center gap-1">
              <span>⚠️ No flow selected. Configure in Inspector.</span>
            </div>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="!bg-cyan-500 !w-3 !h-3 !border-2 !border-slate-900"
      />
    </div>
  );
});

export default SubFlowNode;

