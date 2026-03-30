import React from 'react';
import { ShoppingCart, X, Move, Eye, EyeOff, LayoutTemplate, Briefcase, Trash2, ArrowRight } from 'lucide-react';

const ChartCart = ({ carts, activeId, onRemove, onToggleVisibility, onSelect, onClose }) => {
  return (
    <div className="chart-cart-sidebar glass-panel !border-l border-white/5 shadow-2xl">
      <div className="sidebar-header flex justify-between items-center p-6 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-3">
           <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
             <ShoppingCart size={18} />
           </div>
           <h3 className="text-sm font-bold text-white uppercase tracking-widest">Chart Workspace</h3>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-500 hover:text-white">
          <X size={20}/>
        </button>
      </div>

      <div className="p-6 h-[calc(100%-80px)] overflow-y-auto trading-scrollbar space-y-4">
        {carts.length === 0 ? (
          <div className="p-8 text-center bg-white/[0.01] rounded-2xl border border-dashed border-white/5 space-y-3">
             <div className="mx-auto w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-slate-700">
               <Briefcase size={20} />
             </div>
             <p className="text-xs text-slate-500 font-medium">Your workspace is empty. Add symbols to begin analysis.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {carts.map((chart, index) => (
              <div 
                key={chart.instrument_key} 
                onClick={() => onSelect(chart.instrument_key)}
                className={`cart-item group cursor-pointer p-4 rounded-2xl border transition-all relative overflow-hidden ${
                  activeId === chart.instrument_key 
                  ? 'bg-blue-600/10 border-blue-500/30 shadow-lg' 
                  : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                }`}
              >
                {activeId === chart.instrument_key && (
                  <div className="absolute left-0 top-0 w-1 h-full bg-blue-500"></div>
                )}
                
                <div className="flex justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg transition-all ${activeId === chart.instrument_key ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-600 group-hover:bg-slate-700'}`}>
                      <Activity size={14} />
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm group-hover:text-blue-400 transition-colors uppercase tracking-tight">{chart.symbol}</div>
                      <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">{chart.exchange || 'NSE'}</div>
                    </div>
                  </div>
                  
                  <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onToggleVisibility(chart.instrument_key); }} 
                      className="p-2 rounded-lg hover:bg-white/10 text-slate-500 hover:text-white"
                    >
                      {chart.visible ? <Eye size={16}/> : <EyeOff size={16} className="text-orange-400"/>}
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onRemove(chart.instrument_key); }} 
                      className="p-2 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400"
                    >
                      <Trash2 size={16}/>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Workspace Quick Stats (Dynamic Mock) */}
        {carts.length > 0 && (
          <div className="mt-8 p-6 bg-slate-900/50 rounded-3xl border border-white/5 space-y-4">
             <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Active Monitors</span>
                <span className="text-xs font-mono font-bold text-white">{carts.filter(c => c.visible).length} / {carts.length}</span>
             </div>
             <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Workspace Health</span>
                <div className="flex gap-1">
                   {[1,2,3,4,5].map(i => <div key={i} className={`w-1 h-3 rounded-full ${i <= 4 ? 'bg-green-500' : 'bg-slate-800'}`}></div>)}
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Activity = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

export default ChartCart;
