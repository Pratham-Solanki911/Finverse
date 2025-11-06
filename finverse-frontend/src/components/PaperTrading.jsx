// src/components/PaperTrading.jsx
import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, X, ShoppingCart, Wallet } from 'lucide-react';

export default function PaperTrading({ isOpen, onClose, symbol, currentPrice, onTrade }) {
  const [tradeType, setTradeType] = useState('buy'); // 'buy' or 'sell'
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState('market'); // 'market' or 'limit'
  const [limitPrice, setLimitPrice] = useState(currentPrice || 0);

  useEffect(() => {
    if (currentPrice) {
      setLimitPrice(currentPrice);
    }
  }, [currentPrice]);

  const handleTrade = () => {
    const trade = {
      symbol,
      type: tradeType,
      quantity: parseInt(quantity),
      orderType,
      price: orderType === 'market' ? currentPrice : parseFloat(limitPrice),
      timestamp: new Date().toISOString(),
      id: Date.now().toString()
    };

    onTrade(trade);
    onClose();
    setQuantity(1);
    setLimitPrice(currentPrice);
  };

  const totalValue = orderType === 'market'
    ? (currentPrice * quantity).toFixed(2)
    : (limitPrice * quantity).toFixed(2);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="paper-trading-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <ShoppingCart className="text-indigo-400" size={24} />
            <div>
              <h2 className="text-xl font-bold text-white">Paper Trading</h2>
              <div className="text-sm text-gray-400">{symbol}</div>
            </div>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <X size={20} />
          </button>
        </div>

        <div className="paper-trading-content">
          {/* Current Price Display */}
          <div className="price-display">
            <div className="text-sm text-gray-400">Current Price</div>
            <div className="text-2xl font-bold text-white">₹{currentPrice?.toFixed(2)}</div>
          </div>

          {/* Trade Type Selector */}
          <div className="trade-type-selector">
            <button
              className={`trade-type-btn ${tradeType === 'buy' ? 'active-buy' : ''}`}
              onClick={() => setTradeType('buy')}
            >
              <TrendingUp size={20} />
              Buy
            </button>
            <button
              className={`trade-type-btn ${tradeType === 'sell' ? 'active-sell' : ''}`}
              onClick={() => setTradeType('sell')}
            >
              <TrendingDown size={20} />
              Sell
            </button>
          </div>

          {/* Order Type */}
          <div className="form-group">
            <label className="form-label">Order Type</label>
            <div className="order-type-selector">
              <button
                className={`order-type-btn ${orderType === 'market' ? 'active' : ''}`}
                onClick={() => setOrderType('market')}
              >
                Market Order
              </button>
              <button
                className={`order-type-btn ${orderType === 'limit' ? 'active' : ''}`}
                onClick={() => setOrderType('limit')}
              >
                Limit Order
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div className="form-group">
            <label className="form-label">Quantity</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="form-input"
            />
          </div>

          {/* Limit Price (if limit order) */}
          {orderType === 'limit' && (
            <div className="form-group">
              <label className="form-label">Limit Price (₹)</label>
              <input
                type="number"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(parseFloat(e.target.value) || 0)}
                className="form-input"
              />
            </div>
          )}

          {/* Total Value */}
          <div className="total-value">
            <Wallet size={20} className="text-green-400" />
            <div>
              <div className="text-sm text-gray-400">Total Value</div>
              <div className="text-xl font-bold text-white">₹{totalValue}</div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleTrade}
            className={`trade-action-btn ${tradeType === 'buy' ? 'btn-buy' : 'btn-sell'}`}
          >
            {tradeType === 'buy' ? (
              <>
                <TrendingUp size={20} />
                Buy {quantity} {quantity > 1 ? 'shares' : 'share'} for ₹{totalValue}
              </>
            ) : (
              <>
                <TrendingDown size={20} />
                Sell {quantity} {quantity > 1 ? 'shares' : 'share'} for ₹{totalValue}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
