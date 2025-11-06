// src/components/ExpenseManager.jsx
import React, { useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, DollarSign, PieChart, ArrowUpRight, ArrowDownRight, X } from 'lucide-react';

export default function ExpenseManager({ isOpen, onClose, trades, portfolio, balance }) {
  const [view, setView] = useState('overview'); // 'overview', 'trades', 'portfolio'

  // Calculate total P&L
  const totalPnL = trades.reduce((sum, trade) => {
    if (trade.type === 'sell') {
      return sum + (trade.quantity * trade.price);
    } else {
      return sum - (trade.quantity * trade.price);
    }
  }, 0);

  const totalInvested = trades
    .filter(t => t.type === 'buy')
    .reduce((sum, trade) => sum + (trade.quantity * trade.price), 0);

  const totalRealized = trades
    .filter(t => t.type === 'sell')
    .reduce((sum, trade) => sum + (trade.quantity * trade.price), 0);

  // Calculate portfolio value
  const portfolioValue = Object.values(portfolio).reduce((sum, holding) => {
    return sum + (holding.quantity * holding.avgPrice);
  }, 0);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="expense-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <Wallet className="text-green-400" size={24} />
            <h2 className="text-xl font-bold text-white">Portfolio & Expense Manager</h2>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <X size={20} />
          </button>
        </div>

        {/* View Tabs */}
        <div className="view-tabs">
          <button
            className={`tab-btn ${view === 'overview' ? 'active' : ''}`}
            onClick={() => setView('overview')}
          >
            <PieChart size={18} />
            Overview
          </button>
          <button
            className={`tab-btn ${view === 'trades' ? 'active' : ''}`}
            onClick={() => setView('trades')}
          >
            <DollarSign size={18} />
            Trade History
          </button>
          <button
            className={`tab-btn ${view === 'portfolio' ? 'active' : ''}`}
            onClick={() => setView('portfolio')}
          >
            <TrendingUp size={18} />
            Portfolio
          </button>
        </div>

        <div className="expense-content">
          {/* Overview */}
          {view === 'overview' && (
            <div className="overview-section">
              <div className="stat-cards">
                <div className="stat-card">
                  <div className="stat-icon wallet">
                    <Wallet size={24} />
                  </div>
                  <div className="stat-info">
                    <div className="stat-label">Available Balance</div>
                    <div className="stat-value">₹{balance.toFixed(2)}</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon invested">
                    <ArrowDownRight size={24} />
                  </div>
                  <div className="stat-info">
                    <div className="stat-label">Total Invested</div>
                    <div className="stat-value">₹{totalInvested.toFixed(2)}</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon portfolio">
                    <PieChart size={24} />
                  </div>
                  <div className="stat-info">
                    <div className="stat-label">Portfolio Value</div>
                    <div className="stat-value">₹{portfolioValue.toFixed(2)}</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className={`stat-icon ${totalPnL >= 0 ? 'profit' : 'loss'}`}>
                    {totalPnL >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                  </div>
                  <div className="stat-info">
                    <div className="stat-label">Total P&L</div>
                    <div className={`stat-value ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="summary-card">
                <h3 className="summary-title">Trading Summary</h3>
                <div className="summary-grid">
                  <div className="summary-item">
                    <span className="summary-label">Total Trades:</span>
                    <span className="summary-value">{trades.length}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Buy Orders:</span>
                    <span className="summary-value text-green-400">
                      {trades.filter(t => t.type === 'buy').length}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Sell Orders:</span>
                    <span className="summary-value text-red-400">
                      {trades.filter(t => t.type === 'sell').length}
                    </span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Holdings:</span>
                    <span className="summary-value">{Object.keys(portfolio).length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Trade History */}
          {view === 'trades' && (
            <div className="trades-section">
              {trades.length === 0 ? (
                <div className="empty-state">
                  <DollarSign size={48} className="text-gray-600" />
                  <p className="text-gray-400">No trades yet</p>
                  <p className="text-sm text-gray-500">Start trading to see your history here</p>
                </div>
              ) : (
                <div className="trades-list">
                  {[...trades].reverse().map((trade) => (
                    <div key={trade.id} className="trade-item">
                      <div className="trade-left">
                        <div className={`trade-type-badge ${trade.type}`}>
                          {trade.type === 'buy' ? (
                            <TrendingUp size={14} />
                          ) : (
                            <TrendingDown size={14} />
                          )}
                          {trade.type.toUpperCase()}
                        </div>
                        <div className="trade-details">
                          <div className="trade-symbol">{trade.symbol}</div>
                          <div className="trade-meta">
                            {trade.quantity} shares @ ₹{trade.price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="trade-right">
                        <div className={`trade-amount ${trade.type === 'buy' ? 'text-red-400' : 'text-green-400'}`}>
                          {trade.type === 'buy' ? '-' : '+'}₹{(trade.quantity * trade.price).toFixed(2)}
                        </div>
                        <div className="trade-date">
                          {new Date(trade.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Portfolio */}
          {view === 'portfolio' && (
            <div className="portfolio-section">
              {Object.keys(portfolio).length === 0 ? (
                <div className="empty-state">
                  <PieChart size={48} className="text-gray-600" />
                  <p className="text-gray-400">No holdings yet</p>
                  <p className="text-sm text-gray-500">Buy stocks to build your portfolio</p>
                </div>
              ) : (
                <div className="portfolio-list">
                  {Object.entries(portfolio).map(([symbol, holding]) => (
                    <div key={symbol} className="portfolio-item">
                      <div className="portfolio-header">
                        <div className="portfolio-symbol">{symbol}</div>
                        <div className="portfolio-quantity">{holding.quantity} shares</div>
                      </div>
                      <div className="portfolio-details">
                        <div className="portfolio-detail">
                          <span className="detail-label">Avg Price:</span>
                          <span className="detail-value">₹{holding.avgPrice.toFixed(2)}</span>
                        </div>
                        <div className="portfolio-detail">
                          <span className="detail-label">Total Value:</span>
                          <span className="detail-value">
                            ₹{(holding.quantity * holding.avgPrice).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
