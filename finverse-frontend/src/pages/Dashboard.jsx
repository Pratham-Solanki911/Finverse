import React, { useState, useEffect, useCallback } from 'react';
import { Search, TrendingUp, Newspaper, BrainCircuit, Activity, BarChart3, MessageSquare, ShoppingCart, Wallet, PieChart, Plus, Briefcase } from 'lucide-react';
import SymbolSearch from '../components/SymbolSearch';
import PriceChart from '../components/PriceChart';
import NewsPanel from '../components/NewsPanel';
import SentimentAnalysis from '../components/SentimentAnalysis';
import ChatPanel from '../components/ChatPanel';
import PortfolioSection from '../components/PortfolioSection';
import FundsWidget from '../components/FundsWidget';

// GitHub Feature Components
import CanvasBackground from '../components/CanvasBackground';
import AddSymbolModal from '../components/AddSymbolModal';
import PaperTrading from '../components/PaperTrading';
import ExpenseManager from '../components/ExpenseManager';
import ChartCart from '../components/ChartCart';

const Dashboard = () => {
  const [charts, setCharts] = useState(() => {
    try {
      const saved = localStorage.getItem('finverse_charts');
      return saved ? JSON.parse(saved) : [{
        symbol: 'NIFTY 50',
        name: 'NIFTY 50 Index',
        instrument_key: 'NSE_INDEX|Nifty 50',
        visible: true
      }];
    } catch (e) {
      console.error("Error parsing charts from localStorage", e);
      return [{
        symbol: 'NIFTY 50',
        name: 'NIFTY 50 Index',
        instrument_key: 'NSE_INDEX|Nifty 50',
        visible: true
      }];
    }
  });
  
  const [activeChartId, setActiveChartId] = useState(charts[0]?.instrument_key);
  const selectedInstrument = charts.find(c => c.instrument_key === activeChartId) || charts[0];

  // --- Paper Trading State ---
  const [paperBalance, setPaperBalance] = useState(() => {
    try {
      const saved = localStorage.getItem('finverse_balance');
      return saved ? parseFloat(saved) : 1000000;
    } catch (e) {
      return 1000000;
    }
  });
  
  const [paperTrades, setPaperTrades] = useState(() => {
    try {
      const saved = localStorage.getItem('finverse_trades');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [paperPortfolio, setPaperPortfolio] = useState(() => {
    try {
      const saved = localStorage.getItem('finverse_portfolio');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // --- UI State ---
  const [activeView, setActiveView] = useState('market'); // 'market' or 'portfolio'
  const [isModalOpen, setIsModalOpen] = useState({
    search: false,
    trading: false,
    expense: false,
    cart: false
  });

  const [historyData, setHistoryData] = useState([]);
  const [news, setNews] = useState([]);
  const [sentiment, setSentiment] = useState(null);
  const [loading, setLoading] = useState({
    history: false,
    news: false,
    sentiment: false
  });

  // --- Persistence Effects ---
  useEffect(() => {
    localStorage.setItem('finverse_charts', JSON.stringify(charts));
    localStorage.setItem('finverse_balance', paperBalance.toString());
    localStorage.setItem('finverse_trades', JSON.stringify(paperTrades));
    localStorage.setItem('finverse_portfolio', JSON.stringify(paperPortfolio));
  }, [charts, paperBalance, paperTrades, paperPortfolio]);

  // --- Data Fetching ---
  const fetchData = useCallback(async (instrument) => {
    if (!instrument) return;
    const { symbol, name } = instrument;

    setLoading({ history: true, news: true, sentiment: true });
    
    try {
      const historyResp = await fetch(`/api/history/${encodeURIComponent(symbol)}?interval=1day`);
      if (historyResp.ok) {
        const data = await historyResp.json();
        const formatted = (data.candles || []).map(c => ({
          x: new Date(c[0]),
          o: c[1], h: c[2], l: c[3], c: c[4],
          t: new Date(c[0]), y: c[4]
        }));
        setHistoryData(formatted);
      }
    } catch (e) { console.error("History fetch error:", e); }
    setLoading(prev => ({ ...prev, history: false }));

    let fetchedNews = [];
    try {
      const newsResp = await fetch(`/api/ai/get_market_news?symbol=${encodeURIComponent(symbol)}&companyName=${encodeURIComponent(name || '')}`);
      if (newsResp.ok) {
        const data = await newsResp.json();
        fetchedNews = data.articles || [];
        setNews(fetchedNews);
      }
    } catch (e) { console.error("News fetch error:", e); }
    setLoading(prev => ({ ...prev, news: false }));

    if (fetchedNews.length > 0) {
      try {
        const sentResp = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, news_articles: fetchedNews })
        });
        if (sentResp.ok) {
          const data = await sentResp.json();
          setSentiment(data.analysis);
        }
      } catch (e) { console.error("Sentiment analysis error:", e); }
    } else {
        setSentiment("No recent news found for sentiment analysis.");
    }
    setLoading(prev => ({ ...prev, sentiment: false }));
  }, []);

  useEffect(() => {
    fetchData(selectedInstrument);
  }, [selectedInstrument, fetchData]);

  // --- Workspace Handlers ---
  const handleAddSymbol = (inst) => {
    const exists = charts.find(c => c.instrument_key === inst.instrument_key);
    if (!exists) {
      const newChart = { ...inst, symbol: inst.tradingsymbol, visible: true };
      setCharts([...charts, newChart]);
      setActiveChartId(inst.instrument_key);
    } else {
      setActiveChartId(inst.instrument_key);
    }
    setIsModalOpen(prev => ({ ...prev, search: false }));
  };

  const handleRemoveChart = (id) => {
    const filtered = charts.filter(c => c.instrument_key !== id);
    setCharts(filtered);
    if (activeChartId === id) {
      setActiveChartId(filtered[0]?.instrument_key);
    }
  };

  const toggleChartVisibility = (id) => {
    setCharts(charts.map(c => c.instrument_key === id ? { ...c, visible: !c.visible } : c));
  };

  // --- Paper Trading Handlers ---
  const handlePaperTrade = (trade) => {
    const totalCost = trade.quantity * trade.price;
    
    if (trade.type === 'BUY') {
      if (paperBalance < totalCost) return;
      setPaperBalance(prev => prev - totalCost);
      
      setPaperPortfolio(prev => {
        const existing = prev[trade.symbol] || { quantity: 0, avgPrice: 0 };
        const newQty = existing.quantity + trade.quantity;
        const newAvg = ((existing.quantity * existing.avgPrice) + totalCost) / newQty;
        return { ...prev, [trade.symbol]: { ...trade, quantity: newQty, avgPrice: newAvg } };
      });
    } else {
      const existing = paperPortfolio[trade.symbol];
      if (!existing || existing.quantity < trade.quantity) return;
      
      setPaperBalance(prev => prev + totalCost);
      setPaperPortfolio(prev => {
        const newQty = existing.quantity - trade.quantity;
        if (newQty <= 0) {
          const { [trade.symbol]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [trade.symbol]: { ...existing, quantity: newQty } };
      });
    }
    
    setPaperTrades(prev => [...prev, trade]);
  };

  const handleResetPaper = () => {
    setPaperBalance(1000000);
    setPaperTrades([]);
    setPaperPortfolio({});
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-gray-100 p-4 lg:p-8 trading-scrollbar relative overflow-hidden">
      <CanvasBackground />

      {/* Top Bar: Navigation & Tools */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <Activity className="text-blue-500 w-8 h-8" />
              Finverse Workstation
            </h1>
            <div className="flex items-center gap-2 mt-2">
              <button 
                onClick={() => setActiveView('market')}
                className={`text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl transition-all border ${activeView === 'market' ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20' : 'text-slate-500 border-white/5 hover:text-white hover:bg-white/5'}`}
              >
                Market Analysis
              </button>
              <button 
                onClick={() => setActiveView('portfolio')}
                className={`text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl transition-all border ${activeView === 'portfolio' ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20' : 'text-slate-500 border-white/5 hover:text-white hover:bg-white/5'}`}
              >
                Upstox Portfolio
              </button>
            </div>
          </div>

          <div className="h-12 w-px bg-white/5 mx-2 hidden md:block"></div>

          {/* Workstation Quick Actions */}
          <div className="flex items-center gap-3">
             <button 
               onClick={() => setIsModalOpen(prev => ({ ...prev, trading: true }))}
               className="p-3 bg-white/5 rounded-2xl text-slate-400 hover:text-white hover:bg-blue-600/20 hover:border-blue-500/30 border border-transparent transition-all group"
               title="Paper Trade"
             >
                <TrendingUp size={20} className="group-hover:scale-110 transition-transform" />
             </button>
             <button 
               onClick={() => setIsModalOpen(prev => ({ ...prev, expense: true }))}
               className="p-3 bg-white/5 rounded-2xl text-slate-400 hover:text-white hover:bg-green-600/20 hover:border-green-500/30 border border-transparent transition-all group"
               title="Portfolio Analytics"
             >
                <Briefcase size={20} className="group-hover:scale-110 transition-transform" />
             </button>
             <button 
               onClick={() => setIsModalOpen(prev => ({ ...prev, cart: true }))}
               className="p-3 bg-white/5 rounded-2xl text-slate-400 hover:text-white hover:bg-indigo-600/20 hover:border-indigo-500/30 border border-transparent transition-all group"
               title="Workstation Sidebar"
             >
                <ShoppingCart size={20} className="group-hover:scale-110 transition-transform" />
             </button>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-6">
          <FundsWidget />
          <button 
            onClick={() => setIsModalOpen(prev => ({ ...prev, search: true }))}
            className="w-full md:w-80 group flex items-center justify-between p-4 bg-slate-900/60 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all text-slate-500 hover:text-slate-300"
          >
            <div className="flex items-center gap-4">
              <Search size={20} className="group-hover:text-blue-400 transition-colors" />
              <span className="text-sm font-medium">Search Command (Ctrl+K)</span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-1 bg-white/5 rounded-lg border border-white/5">⌘ K</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto relative z-10">
        {activeView === 'market' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in">
            {/* Left/Main Column: Chart & Summary */}
            <div className="lg:col-span-8 space-y-8">
              {/* Chart Section */}
              <div className="panel-card !p-0 overflow-hidden group border-white/5 shadow-2xl">
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-600/20 p-2.5 rounded-2xl text-blue-400">
                      <BarChart3 size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                        {selectedInstrument?.symbol || 'Select Instrument'}
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-white/5 text-slate-500 font-mono italic">
                          {selectedInstrument?.exchange || 'NSE'}
                        </span>
                      </h2>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest italic">Live Market Workspace</span>
                    </div>
                  </div>
                  <div className="flex gap-2 bg-slate-900/40 p-1.5 rounded-2xl border border-white/5">
                    <button className="px-4 py-2 text-[10px] font-bold rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 transition-all">LINE</button>
                    <button className="px-4 py-2 text-[10px] font-bold rounded-xl text-slate-600 hover:text-white transition-all uppercase tracking-widest">CANDLE</button>
                  </div>
                </div>
                
                <div className="p-4 h-[500px]">
                  {loading.history ? (
                    <div className="w-full h-full flex flex-col items-center justify-center space-y-4">
                        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                        <p className="text-slate-500 text-sm font-medium">Synchronizing workspace...</p>
                    </div>
                  ) : selectedInstrument ? (
                    <PriceChart initialData={historyData} chartType="line" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                       <LayoutTemplate size={48} className="opacity-10" />
                       <p className="text-sm font-medium">Add a symbol from the search or sidebar to view charts</p>
                    </div>
                  )}
                </div>
              </div>

              {/* AI Sentiment Summary */}
              <div className="panel-card bg-gradient-to-br from-[#1e293b]/80 to-[#0f172a]/80 border-blue-500/20 relative overflow-hidden group shadow-2xl">
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
                <div className="flex items-center gap-4 mb-6">
                  <div className="bg-purple-600/20 p-2.5 rounded-2xl text-purple-400">
                    <BrainCircuit size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight uppercase tracking-widest text-[10px] text-slate-500">AI Sentiment Engine</h2>
                    <h3 className="text-lg font-bold text-white">Gemini Market Analysis</h3>
                  </div>
                </div>
                <SentimentAnalysis analysisText={sentiment} loading={loading.sentiment} />
              </div>
            </div>

            {/* Right Sidebar: News Feed */}
            <div className="lg:col-span-4 space-y-8">
              <div className="panel-card h-full flex flex-col bg-[#0f172a]/40 border-white/5 shadow-2xl">
                <div className="flex items-center gap-4 mb-6">
                  <div className="bg-green-600/20 p-2.5 rounded-2xl text-green-400">
                    <Newspaper size={24} />
                  </div>
                  <div>
                    <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Market Pulse</h2>
                    <h3 className="text-lg font-bold text-white tracking-tight italic">Global Intelligence</h3>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto trading-scrollbar pr-2 max-h-[850px]">
                  <NewsPanel news={news} loading={loading.news} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in">
            <PortfolioSection />
          </div>
        )}
      </div>

      {/* Feature Modals */}
      <AddSymbolModal 
        isOpen={isModalOpen.search} 
        onClose={() => setIsModalOpen(prev => ({ ...prev, search: false }))} 
        onAdd={handleAddSymbol} 
      />
      
      <PaperTrading 
        isOpen={isModalOpen.trading}
        onClose={() => setIsModalOpen(prev => ({ ...prev, trading: false }))}
        instrument={selectedInstrument}
        balance={paperBalance}
        onTrade={handlePaperTrade}
      />

      <ExpenseManager 
        isOpen={isModalOpen.expense}
        onClose={() => setIsModalOpen(prev => ({ ...prev, expense: false }))}
        trades={paperTrades}
        portfolio={paperPortfolio}
        balance={paperBalance}
        onReset={handleResetPaper}
      />

      {isModalOpen.cart && (
        <ChartCart 
          carts={charts} 
          activeId={activeChartId}
          onRemove={handleRemoveChart} 
          onToggleVisibility={toggleChartVisibility}
          onSelect={(id) => { setActiveChartId(id); setIsModalOpen(prev => ({ ...prev, cart: false })); }}
          onClose={() => setIsModalOpen(prev => ({ ...prev, cart: false }))} 
        />
      )}

      {/* Floating AI Chat Assistant */}
      <div className="fixed bottom-8 right-8 z-50">
        <ChatPanel 
          watchedInstruments={charts.map(c => c.symbol)} 
          recentNews={{ [selectedInstrument?.symbol]: news }} 
        />
      </div>
    </div>
  );
};

const LayoutTemplate = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M7 3v18" />
    <path d="M3 14h18" />
  </svg>
);

export default Dashboard;

