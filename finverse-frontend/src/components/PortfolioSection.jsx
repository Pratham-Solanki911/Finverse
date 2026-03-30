import React, { useState, useEffect } from 'react';
import TradingTable from './TradingTable';
import { LayoutGrid, ListChecks, History, Wallet, TrendingUp, TrendingDown } from 'lucide-react';

const PortfolioSection = () => {
  const [activeTab, setActiveTab] = useState('holdings');
  const [data, setData] = useState({ holdings: [], positions: [], orders: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async (type) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/portfolio/${type}`);
      const result = await response.json();
      if (result.status === 'success') {
        setData(prev => ({ ...prev, [type]: result.data }));
      } else {
        throw new Error(result.detail || `Failed to fetch ${type}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab]);

  const tabs = [
    { id: 'holdings', label: 'Holdings', icon: LayoutGrid },
    { id: 'positions', label: 'Positions', icon: ListChecks },
    { id: 'orders', label: 'Orders', icon: History }
  ];

  const holdingsColumns = [
    { header: 'Instrument', accessor: d => d.tradingsymbol, className: 'font-bold text-white' },
    { header: 'Qty', accessor: d => d.quantity },
    { header: 'Avg. Price', accessor: d => d.average_price },
    { header: 'LTP', accessor: d => d.last_price },
    { 
      header: 'P&L', 
      accessor: d => d.pnl,
      render: d => (
        <span className={d.pnl >= 0 ? 'text-green-400 font-mono' : 'text-red-400 font-mono'}>
          {d.pnl >= 0 ? '+' : ''}{d.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          <span className="text-[10px] ml-1 opacity-70">
            ({((d.pnl / (d.average_price * d.quantity)) * 100).toFixed(2)}%)
          </span>
        </span>
      )
    },
    { header: 'Value', accessor: d => d.last_price * d.quantity, className: 'font-mono' }
  ];

  const positionsColumns = [
    { header: 'Instrument', accessor: d => d.tradingsymbol, className: 'font-bold text-white' },
    { header: 'Net Qty', accessor: d => d.net_quantity },
    { header: 'Avg. Price', accessor: d => d.sell_avg_price || d.buy_avg_price },
    { header: 'LTP', accessor: d => d.last_price },
    { 
      header: 'P&L', 
      accessor: d => d.pnl,
      render: d => (
        <span className={d.pnl >= 0 ? 'text-green-400 font-mono' : 'text-red-400 font-mono'}>
          {d.pnl >= 0 ? '+' : ''}{d.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      )
    }
  ];

  const ordersColumns = [
    { header: 'Time', accessor: d => d.order_timestamp.split('T')[1].split('.')[0] },
    { header: 'Instrument', accessor: d => d.tradingsymbol },
    { header: 'Type', accessor: d => d.transaction_type, render: d => (
      <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${d.transaction_type === 'BUY' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>
        {d.transaction_type}
      </span>
    )},
    { header: 'Qty', accessor: d => `${d.filled_quantity}/${d.quantity}` },
    { header: 'Price', accessor: d => d.price },
    { header: 'Status', accessor: d => d.status, render: d => (
      <span className={`text-xs ${d.status === 'complete' ? 'text-green-400' : 'text-slate-400'}`}>
        {d.status}
      </span>
    )}
  ];

  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-2xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                activeTab === tab.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' 
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <tab.icon size={16} />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Live Portfolio Sync
          </div>
        </div>
      </div>

      {error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          Error: {error}
        </div>
      ) : (
        <TradingTable 
          columns={activeTab === 'holdings' ? holdingsColumns : activeTab === 'positions' ? positionsColumns : ordersColumns}
          data={data[activeTab]}
          loading={loading}
          emptyMessage={`You have no ${activeTab} at the moment.`}
        />
      )}
    </div>
  );
};

export default PortfolioSection;
