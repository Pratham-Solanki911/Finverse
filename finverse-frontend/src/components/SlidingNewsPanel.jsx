// src/components/SlidingNewsPanel.jsx
import React, { useState, useEffect } from 'react';
import NewsPanel from './NewsPanel.jsx';
import SentimentAnalysis from './SentimentAnalysis.jsx';
import useNewsFeed from '../hooks/useNewsFeed.js'; // --- NEW: Import hook here
import './SlidingNewsPanel.css'; 

export default function SlidingNewsPanel({ 
  isOpen, 
  onClose, 
  charts = [] // Receive the list of charts
}) {
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  
  // --- NEW: Set default symbol when panel opens or charts change ---
  useEffect(() => {
    if (isOpen && charts.length > 0) {
      // If no symbol is selected OR the selected one is no longer in the list
      const symbolExists = charts.some(c => c.symbol === selectedSymbol);
      if (!selectedSymbol || !symbolExists) {
        setSelectedSymbol(charts[0].symbol);
      }
    }
  }, [isOpen, charts, selectedSymbol]);

  // --- NEW: Fetch news inside this component ---
  const { news, loading: newsLoading, error: newsError } = useNewsFeed({ 
    symbol: selectedSymbol,
  });

  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  const handleAnalyzeSentiment = async () => {
    if (!selectedSymbol || !news || news.length === 0) {
      setAnalysisError("No symbol or news articles to analyze.");
      return;
    }
    
    setAnalysisLoading(true);
    setAnalysis(null);
    setAnalysisError(null);
    
    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol, // Use the selected symbol
          news_articles: news
        })
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to analyze sentiment.");
      }
      
      const data = await response.json();
      setAnalysis(data.analysis);
      
    } catch (err) {
      console.error("Sentiment analysis error:", err);
      setAnalysisError(err.message);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // --- NEW: Clear analysis when symbol changes ---
  useEffect(() => {
    setAnalysis(null);
    setAnalysisError(null);
  }, [selectedSymbol]);


  return (
    <>
      <div
        className={`news-backdrop ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      ></div>
      
      <div className={`sliding-news-panel ${isOpen ? 'open' : ''}`}>
        <button onClick={onClose} className="news-close-btn">
          &times;
        </button>
        
        <div className="sentiment-section">
          {/* --- NEW: Symbol Selector Dropdown --- */}
          <div className="mb-4">
            <label htmlFor="symbol-select" className="block text-sm font-medium text-gray-400 mb-1">
              Analyze Instrument
            </label>
            <select
              id="symbol-select"
              value={selectedSymbol || ''}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="w-full p-2 border border-gray-700 bg-gray-900 rounded-md text-white"
            >
              {charts.map(chart => (
                <option key={chart.id} value={chart.symbol}>
                  {chart.symbol}
                </option>
              ))}
              {charts.length === 0 && <option disabled>Add a chart to analyze</option>}
            </select>
          </div>

          <button
            className="btn-primary"
            onClick={handleAnalyzeSentiment}
            disabled={analysisLoading || newsLoading || !news || news.length === 0}
            style={{width: '100%', marginBottom: '16px'}}
          >
            {analysisLoading ? "Analyzing..." : `Analyze ${selectedSymbol || ''} Sentiment`}
          </button>
          
          <SentimentAnalysis 
            analysisText={analysis}
            loading={analysisLoading} 
          />
          {analysisError && <div className="panel-error">{analysisError}</div>}
        </div>
        
        <hr className="panel-divider" />

        {/* Pass the internally fetched news down */}
        <NewsPanel news={news} loading={newsLoading} error={newsError} />
      </div>
    </>
  );
}

