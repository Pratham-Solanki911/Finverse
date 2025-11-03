// src/components/ChartWidget.jsx
import React, { useRef } from 'react';
import useMarketApi from '../hooks/useMarketApi';
import KPITiles from './KPITiles';
import PriceChart from './PriceChart';

export default function ChartWidget({ chartConfig, onRemove, onTypeChange }) {
  const { symbol, type } = chartConfig;
  const { loading, error, quote, candles, ohlcCandles } = useMarketApi({ symbol });
  const chartRef = useRef(null);

  // Pass the correct data to the chart based on type
  const chartData = type === 'line' ? candles : ohlcCandles;

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ marginTop: 0, marginBottom: 10 }}>
          {quote?.name || symbol}
          {loading && " (Loading...)"}
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select 
            value={type} 
            onChange={(e) => onTypeChange(chartConfig.id, e.target.value)}
            className="btn-ghost" // Re-using a style
            style={{ background: 'var(--bg)', border: '1px solid var(--panel)' }}
          >
            <option value="line">Line</option>
            <option value="candle">Candlestick</option>
          </select>
          <button 
            onClick={() => onRemove(chartConfig.id)}
            className="btn-ghost"
            style={{ color: '#ff6161' }}
          >
            Remove
          </button>
        </div>
      </div>

      {error && <div className="panel-error">Error: {error}</div>}

      <KPITiles quote={quote} />

      <div style={{ marginTop: 16 }}>
        <PriceChart
          ref={chartRef}
          initialData={chartData}
          chartType={type}
        />
      </div>
    </div>
  );
}