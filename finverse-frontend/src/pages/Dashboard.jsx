// src/pages/Dashboard.jsx
import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
// import useNewsFeed from "../hooks/useNewsFeed.js"; // REMOVED: This logic moves to the panel
import logoSrc from "../assets/logo.png";
import SymbolSearch from "../components/SymbolSearch.jsx";
import DevStatusPanel from "../components/DevStatusPanel.jsx";
import SlidingNewsPanel from "../components/SlidingNewsPanel.jsx";
import ChartWidget from "../components/ChartWidget.jsx";
import { MessageSquare } from 'lucide-react';
import ChatPanel from "../components/ChatPanel.jsx";

export default function Dashboard() {
  const [charts, setCharts] = useState([
    { id: '1', symbol: "NIFTY 50", type: "line" }
  ]);
  const [isNewsOpen, setIsNewsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const isDevMode = searchParams.get("dev") === "true";

  // --- NEWS LOGIC IS REMOVED FROM HERE ---

  const handleSymbolSelect = (symbol) => {
    if (charts.length < 8) {
      const newChart = {
        id: Date.now().toString(),
        symbol: symbol.toUpperCase(),
        type: "line"
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

  const gridClass = `grid grid-cols-1 ${
    charts.length > 1 ? 'lg:grid-cols-2' : ''
  } gap-5`;

  return (
    // This padding is now inside the scrollable <main> from App.jsx
    <div style={{ padding: 20 }}>
      <div className="container flex-1">
        <header className="header">
          <div className="brand">
            <img src={logoSrc} className="logo" alt="Finverse" />
            <div>
              <div className="title">Finverse</div>
              <div className="subtitle">AI-powered trading companion</div>
            </div>
          </div>
          <div className="small">Mode: <strong style={{ color: "#66ff99" }}>Live (WebSocket)</strong></div>
        </header>

        <main style={{ marginTop: 18 }}>
          
          <div className="panel" style={{ 
            marginBottom: 20, 
            display: 'flex', 
            flexWrap: 'wrap',
            gap: '10px',
            justifyContent: 'space-between', 
            alignItems: 'center' 
          }}>
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

          <div className={gridClass}>
            {charts.map(chartConfig => (
              <ChartWidget
                key={chartConfig.id}
                chartConfig={chartConfig}
                onRemove={handleRemoveChart}
                onTypeChange={handleChartTypeChange}
              />
            ))}
          </div>
          
          {charts.length === 0 && (
            <div className="panel-empty" style={{textAlign: 'center', padding: '40px'}}>
              Your dashboard is empty. Add a symbol to get started.
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
  );
}

