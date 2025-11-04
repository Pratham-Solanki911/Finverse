// src/pages/Dashboard.jsx
import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
// import useNewsFeed from "../hooks/useNewsFeed.js"; // REMOVED: This logic moves to the panel
import logoSrc from "../assets/logo.png";
import SymbolSearch from "../components/SymbolSearch.jsx";
import DevStatusPanel from "../components/DevStatusPanel.jsx";
import SlidingNewsPanel from "../components/SlidingNewsPanel.jsx";
import ChartWidget from "../components/ChartWidget.jsx";
import ChartCart from "../components/ChartCart.jsx";
import CanvasBackground from "../components/CanvasBackground.jsx";
import { MessageSquare, LayoutDashboard } from 'lucide-react';
import ChatPanel from "../components/ChatPanel.jsx";

export default function Dashboard() {
  const [charts, setCharts] = useState([
    { id: '1', symbol: "NIFTY 50", type: "line", hidden: false }
  ]);
  const [isNewsOpen, setIsNewsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const isDevMode = searchParams.get("dev") === "true";

  // --- NEWS LOGIC IS REMOVED FROM HERE ---

  const handleSymbolSelect = (symbol) => {
    if (charts.length < 8) {
      const newChart = {
        id: Date.now().toString(),
        symbol: symbol.toUpperCase(),
        type: "line",
        hidden: false
      };
      setCharts(prev => [...prev, newChart]);
    } else {
      console.warn("Max charts reached");
    }
  };

  const handleRemoveChart = (id) => {
    setCharts(prev => prev.filter(c => c.id !== id));
  };

  const handleChartTypeChange = (id, newType) => {
    setCharts(prev =>
      prev.map(c => (c.id === id ? { ...c, type: newType } : c))
    );
  };

  const handleReorderCharts = (fromIndex, toIndex) => {
    setCharts(prev => {
      const newCharts = [...prev];
      const [movedChart] = newCharts.splice(fromIndex, 1);
      newCharts.splice(toIndex, 0, movedChart);
      return newCharts;
    });
  };

  const handleToggleVisibility = (id) => {
    setCharts(prev =>
      prev.map(c => (c.id === id ? { ...c, hidden: !c.hidden } : c))
    );
  };

  // Filter visible charts for display
  const visibleCharts = charts.filter(c => !c.hidden);

  // Dynamic grid layout based on number of visible charts
  const getGridClass = () => {
    const count = visibleCharts.length;
    if (count === 0) return 'grid grid-cols-1';
    if (count === 1) return 'grid grid-cols-1 max-w-5xl mx-auto';
    if (count === 2) return 'grid grid-cols-1 lg:grid-cols-2 gap-5';
    if (count <= 4) return 'grid grid-cols-1 lg:grid-cols-2 gap-5';
    if (count <= 6) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5';
    return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5';
  };

  return (
    <>
      {/* Animated Canvas Background */}
      <CanvasBackground />

      {/* Main Dashboard Content */}
      <div style={{ padding: 20, position: 'relative', zIndex: 1 }} className={`transition-all duration-300 ${isCartOpen ? 'mr-80 lg:mr-96' : ''}`}>
        <div className="container flex-1">
        {/* Enhanced Header with Dashboard Canvas Feel */}
        <header className="header relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/10 via-purple-600/10 to-pink-600/10 animate-pulse" style={{ animationDuration: '3s' }} />
          <div className="relative z-10 flex items-center justify-between">
            <div className="brand">
              <img src={logoSrc} className="logo" alt="Finverse" />
              <div>
                <div className="title flex items-center gap-2">
                  <LayoutDashboard className="w-5 h-5 text-indigo-400" />
                  Finverse Dashboard
                </div>
                <div className="subtitle">AI-powered trading companion</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-xs text-gray-400">
                Mode: <strong className="text-green-400">Live (WebSocket)</strong>
              </div>
              <button
                onClick={() => setIsCartOpen(!isCartOpen)}
                className="px-3 py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30
                         hover:bg-indigo-600/30 transition-all duration-200 text-sm font-medium
                         text-white flex items-center gap-2"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">Chart Cart</span>
                {charts.length > 0 && (
                  <span className="bg-indigo-500 text-white text-xs rounded-full px-2 py-0.5">
                    {charts.length}
                  </span>
                )}
              </button>
            </div>
          </div>
          <div className="small">Mode: <strong style={{ color: "#10b981" }}>Live (WebSocket)</strong></div>
        </header>

        <main style={{ marginTop: 18 }}>

          {/* Enhanced Control Panel */}
          <div className="panel relative overflow-hidden" style={{
            marginBottom: 20,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.05) 0%, rgba(99, 102, 241, 0.02) 100%)'
          }}>
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            <div style={{ flex: '1 1 400px', minWidth: '300px' }}>
              <SymbolSearch onSymbolSelect={handleSymbolSelect} />
            </div>

            <button
              className="btn-primary"
              style={{ padding: '10px 16px', flexShrink: 0 }}
              onClick={() => setIsNewsOpen(true)}
            >
              AI News Feed
            </button>
          </div>

          {/* Canvas Grid for Charts */}
          <div className={getGridClass()}>
            {visibleCharts.map(chartConfig => (
              <div
                key={chartConfig.id}
                className="transform transition-all duration-300 hover:scale-[1.02] hover:z-10"
              >
                <ChartWidget
                  chartConfig={chartConfig}
                  onRemove={handleRemoveChart}
                  onTypeChange={handleChartTypeChange}
                />
              </div>
            ))}
          </div>

          {visibleCharts.length === 0 && (
            <div className="panel-empty relative overflow-hidden" style={{textAlign: 'center', padding: '60px 40px'}}>
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5" />
              <div className="relative z-10">
                <LayoutDashboard className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400 text-lg mb-2">Your dashboard canvas is empty</p>
                <p className="text-gray-500 text-sm">Add a symbol to start building your dashboard</p>
              </div>
            </div>
          )}

          {isDevMode && (
            <aside className="panel" style={{marginTop: '20px'}}> 
              <h3 style={{ marginTop: 0 }}>Dev Status (Chart Config)</h3>
              <pre className="pre">{JSON.stringify(charts, null, 2)}</pre>
            </aside>
          )}
        </main>
      </div>

      {/* --- UPDATED: Pass the entire charts list --- */}
      <SlidingNewsPanel
        isOpen={isNewsOpen}
        onClose={() => setIsNewsOpen(false)}
        charts={charts}
      />

      {/* Chart Cart Component */}
      <ChartCart
        charts={charts}
        onRemove={handleRemoveChart}
        onReorder={handleReorderCharts}
        onTypeChange={handleChartTypeChange}
        onToggleVisibility={handleToggleVisibility}
        isOpen={isCartOpen}
        onToggle={() => setIsCartOpen(!isCartOpen)}
      />

      <button
        className="chat-float-btn"
        onClick={() => setIsChatOpen(true)}
        title="Open AI Chat"
      >
        <MessageSquare size={24} />
      </button>

      <ChatPanel
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
      </div>
    </>
  );
}

