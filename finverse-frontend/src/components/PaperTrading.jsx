import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, DollarSign, Wallet, ArrowRight } from 'lucide-react';

export default function PaperTrading({ isOpen, onClose, instrument, balance, onTrade }) {
  const [quantity, setQuantity] = useState(1);
  const [type, setType] = useState('BUY');
  const [orderType, setOrderType] = useState('MARKET'); // MARKET, LIMIT
  const [limitPrice, setLimitPrice] = useState(0);
  const [lastPrice, setLastPrice] = useState(0);

  useEffect(() => {
    if (isOpen && instrument) {
      // Small simulation for price if not readily available
      setLastPrice(instrument.last_price || 150.25);
      setLimitPrice(instrument.last_price || 150.25);
    }
  }, [isOpen, instrument]);

  if (!isOpen || !instrument) return null;

  const currentPrice = lastPrice;
  const executionPrice = orderType === 'MARKET' ? currentPrice : limitPrice;
  const totalAmount = quantity * executionPrice;
  const canAfford = type === 'SELL' || totalAmount <= balance;

  const handleSubmit = () => {
    if (!canAfford) return;
    
    onTrade({
      symbol: instrument.tradingsymbol,
      instrument_key: instrument.instrument_key,
      quantity: parseInt(quantity),
      price: parseFloat(executionPrice),
      type: type,
      order_type: orderType,
      timestamp: new Date().toISOString(),
      status: 'COMPLETE'
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="trading-modal glass-panel !bg-slate-950/90" onClick={e => e.stopPropagation()}>
        <div className="modal-header border-none pb-0">
          <div className="flex items-center gap-3">
             <div className={`p-2 rounded-xl ${type === 'BUY' ? 'bg-blue-500' : 'bg-orange-500'} text-white shadow-lg`}>
                <TrendingUp size={20} />
             </div>
             <div>
                <h2 className="text-xl font-bold text-white">Paper Trade</h2>
                <span className="text-xs text-slate-500 font-mono italic tracking-wider">{instrument.tradingsymbol}</span>
             </div>
          </div>
          <button onClick={onClose} className="modal-close-btn"><X size={20} /></button>
        </div>

        <div className="p-8 space-y-8">
          {/* Balance Bar */}
          <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-2xl border border-white/5 shadow-inner">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Available Balance</span>
              <span className="text-lg font-mono font-bold text-white tracking-tighter">
                ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400">
              <Wallet size={20} />
            </div>
          </div>

          {/* Buy/Sell Toggles */}
          <div className="flex gap-2 p-1.5 bg-slate-900 rounded-2xl border border-white/5 shadow-2xl">
            <button 
              className={`flex-1 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${type === 'BUY' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-500 hover:text-slate-300'}`}
              onClick={() => setType('BUY')}
            >
              LONG/BUY
            </button>
            <button 
              className={`flex-1 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${type === 'SELL' ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/30' : 'text-slate-500 hover:text-slate-300'}`}
              onClick={() => setType('SELL')}
            >
              SHORT/SELL
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="input-group">
              <label>Quantity</label>
              <input 
                type="number" 
                value={quantity} 
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full bg-slate-900/50 border border-white/5 rounded-2xl p-4 text-white text-lg font-mono outline-none focus:border-blue-500/50 transition-all font-bold"
              />
            </div>

            <div className="input-group">
              <label>Order Type</label>
              <div className="flex gap-2 bg-slate-900/50 p-1.5 rounded-2xl border border-white/5 h-[62px]">
                <button 
                  onClick={() => setOrderType('MARKET')}
                  className={`flex-1 rounded-xl text-xs font-bold transition-all ${orderType === 'MARKET' ? 'bg-white/10 text-white' : 'text-slate-600 hover:text-white'}`}
                >
                  MARKET
                </button>
                <button 
                  onClick={() => setOrderType('LIMIT')}
                  className={`flex-1 rounded-xl text-xs font-bold transition-all ${orderType === 'LIMIT' ? 'bg-white/10 text-white' : 'text-slate-600 hover:text-white'}`}
                >
                  LIMIT
                </button>
              </div>
            </div>
          </div>

          {orderType === 'LIMIT' && (
            <div className="input-group animate-in fade-in slide-in-from-top-4 duration-300">
              <label>Limit Price</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="0.05"
                  value={limitPrice} 
                  onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900/50 border border-white/5 rounded-2xl p-4 text-white text-lg font-mono outline-none focus:border-blue-500/50 transition-all font-bold"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-500 font-bold uppercase">
                  LTP: {currentPrice.toFixed(2)}
                </div>
              </div>
            </div>
          )}

          {/* Summary Section */}
          <div className="p-6 bg-slate-900/50 rounded-3xl border border-white/5 space-y-4">
             <div className="flex justify-between items-center text-xs text-slate-500 font-bold uppercase tracking-widest">
                <span>Estimated Value</span>
                <span className="font-mono tracking-tighter text-slate-300">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
             </div>
             <div className="flex justify-between items-center border-t border-white/5 pt-4">
                <span className="text-sm font-bold text-slate-300 uppercase tracking-tighter">Required Funds</span>
                <span className={`text-xl font-mono font-bold tracking-tighter ${canAfford ? 'text-white' : 'text-orange-500'}`}>
                  ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
             </div>
          </div>

          <button 
            onClick={handleSubmit}
            disabled={!canAfford}
            className={`w-full py-4 rounded-3xl font-bold text-lg transition-all flex items-center justify-center gap-3 active:scale-95 shadow-2xl ${
              !canAfford 
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-white/5' 
              : type === 'BUY' 
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20' 
                : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-500/20'
            }`}
          >
            {!canAfford ? 'INSUFFICIENT FUNDS' : `${type === 'BUY' ? 'EXECUTE BUY' : 'EXECUTE SELL'} ORDER`}
            <ArrowRight size={20} className={!canAfford ? 'hidden' : 'animate-pulse'} />
          </button>
        </div>
      </div>
    </div>
  );
}
