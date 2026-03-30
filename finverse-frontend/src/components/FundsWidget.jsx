import React, { useState, useEffect } from 'react';
import { Wallet, Info, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const FundsWidget = () => {
  const [funds, setFunds] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFunds = async () => {
      try {
        const response = await fetch('/api/user/funds');
        const result = await response.json();
        if (result.status === 'success') {
          setFunds(result.data.equity || result.data);
        }
      } catch (err) {
        console.error("Error fetching funds:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFunds();
    const interval = setInterval(fetchFunds, 30000); // 30s update
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="h-10 w-24 bg-slate-800/50 animate-pulse rounded-lg"></div>;
  if (!funds) return null;

  const available = funds.available_margin || 0;
  const used = funds.used_margin || 0;

  return (
    <div className="flex items-center gap-6 px-6 py-2 bg-slate-900/40 rounded-2xl border border-white/5 backdrop-blur-md">
      <div className="flex flex-col">
        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center gap-1">
          <Wallet size={10} /> Available Cash
        </span>
        <span className="text-sm font-mono font-bold text-white tracking-tighter">
          ₹{available.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      </div>
      
      <div className="w-px h-8 bg-white/5"></div>
      
      <div className="flex flex-col">
        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center gap-1">
          <Info size={10} /> Used Margin
        </span>
        <span className="text-sm font-mono font-bold text-slate-300 tracking-tighter">
          ₹{used.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      </div>
    </div>
  );
};

export default FundsWidget;
