import React, { useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, DollarSign, X, ArrowUpRight, ArrowDownRight, History, Briefcase, Activity } from 'lucide-react';

export default function ExpenseManager({ isOpen, onClose, trades, portfolio, balance, onReset }) {
  const [activeTab, setActiveTab] = useState('OVERVIEW');

  const totalInvested = Object.values(portfolio).reduce((sum, h) => sum + (h.quantity * h.avgPrice), 0);
  const currentPortfolioValue = Object.values(portfolio).reduce((sum, h) => sum + (h.quantity * (h.lastPrice || h.avgPrice)), 0);
  const totalPnL = currentPortfolioValue - totalInvested;
  const pnlPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  if (!isOpen) return null;

  const tabs = ['OVERVIEW', 'TRADE LOG', 'HOLDINGS'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="expense-manager-modal glass-panel !bg-slate-950/90 !max-w-4xl" onClick={e => e.stopPropagation()}>
        <div className="modal-header border-none p-8">
          <div className="flex items-center gap-4">
             <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400">
                <Briefcase size={24} />
             </div>
             <div>
                <h2 className="text-2xl font-bold text-white tracking-tight uppercase tracking-widest text-xs font-bold text-slate-500">Portfolio Analytics</h2>
                <h3 className="text-xl font-bold text-white font-mono tracking-tighter italic">Virtual Account Management</h3>
             </div>
          </div>
          <div className="flex items-center gap-4">
             <button 
               onClick={() => { if(window.confirm('Reset virtual portfolio?')) onReset(); }}
               className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-all uppercase tracking-widest border border-red-500/20"
             >
               Reset Data
             </button>
             <button onClick={onClose} className="modal-close-btn"><X size={20} /></button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-4 px-8 mb-8 border-b border-white/5">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-4 text-xs font-bold uppercase tracking-widest transition-all relative ${
                activeTab === tab ? 'text-blue-400' : 'text-slate-500 hover:text-white'
              }`}
            >
              {tab}
              {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 shadow-lg shadow-blue-500/50"></div>}
            </button>
          ))}
        </div>

        <div className="p-8 pt-0 overflow-y-auto max-h-[70vh] trading-scrollbar">
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <div className="grid grid-cols-3 gap-6">
                <div className="stat-card">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest block mb-2">Available Balance</span>
                  <div className="text-3xl font-mono font-bold text-white tracking-tighter">
                    ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="stat-card border-blue-500/10">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest block mb-2">Current P&L</span>
                  <div className={`text-3xl font-mono font-bold tracking-tighter flex items-center gap-2 ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totalPnL >= 0 ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                    ₹{Math.abs(totalPnL).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <span className={`text-[10px] font-bold ${totalPnL >= 0 ? 'text-green-400/50' : 'text-red-400/50'} uppercase tracking-widest`}>
                    ({pnlPercent.toFixed(2)}% overall yield)
                  </span>
                </div>
                <div className="stat-card">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest block mb-2">Total Invested</span>
                  <div className="text-3xl font-mono font-bold text-slate-300 tracking-tighter">
                    ₹{totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Performance Visualization Placeholder */}
              <div className="p-8 bg-white/[0.02] border border-white/5 rounded-3xl text-center space-y-4">
                 <div className="flex justify-center"><PieChart size={48} className="text-slate-700 opacity-50" /></div>
                 <p className="text-slate-500 text-sm font-medium">Visualizing instrument-wise distribution and sector allocation...</p>
              </div>
            </div>
          )}

          {activeTab === 'TRADE LOG' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              {trades.length === 0 ? (
                <div className="text-center p-20 text-slate-500 bg-white/[0.01] rounded-3xl border border-dashed border-white/5">
                  <History size={48} className="mx-auto mb-4 opacity-20" />
                  <p>No transactions recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {trades.slice().reverse().map((trade, idx) => (
                    <div key={idx} className="p-5 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between hover:border-white/10 transition-all">
                       <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-xl text-xs font-bold ${trade.type === 'BUY' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>
                            {trade.type}
                          </div>
                          <div>
                             <div className="font-bold text-white text-base">{trade.symbol}</div>
                             <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">{new Date(trade.timestamp).toLocaleString()}</div>
                          </div>
                       </div>
                       <div className="text-right">
                          <div className="text-sm font-mono font-bold text-white tracking-tighter">
                            {trade.quantity} @ ₹{trade.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            VALUE: ₹{(trade.quantity * trade.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'HOLDINGS' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
              {Object.keys(portfolio).length === 0 ? (
                <div className="text-center p-20 text-slate-500 bg-white/[0.01] rounded-3xl border border-dashed border-white/5">
                  <Activity size={48} className="mx-auto mb-4 opacity-20" />
                  <p>Portfolio is currently empty.</p>
                </div>
              ) : (
                <div className="space-y-4">
                   {Object.entries(portfolio).map(([symbol, h]) => {
                     const pl = (h.lastPrice || h.avgPrice) - h.avgPrice;
                     const plTotal = pl * h.quantity;
                     
                     return (
                       <div key={symbol} className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl flex items-center justify-between group">
                          <div>
                             <div className="flex items-center gap-3 mb-1">
                                <span className="text-lg font-bold text-white group-hover:text-blue-400 transition-all font-mono tracking-tighter leading-none">{symbol}</span>
                                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{h.exchange || 'NSE'}</span>
                             </div>
                             <div className="text-sm text-slate-500 font-medium">QTY: {h.quantity} | Avg: ₹{h.avgPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                          </div>
                          <div className="text-right">
                             <div className={`text-lg font-mono font-bold tracking-tighter leading-none mb-1 ${plTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                ₹{plTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                             </div>
                             <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                               LTP: ₹{(h.lastPrice || h.avgPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                             </div>
                          </div>
                       </div>
                     );
                   })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const PieChart = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);
