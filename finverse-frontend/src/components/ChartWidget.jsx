// src/components/ChartWidget.jsx
import React, { useRef, useState } from 'react';
import useMarketApi from '../hooks/useMarketApi';
import KPITiles from './KPITiles';
import PriceChart from './PriceChart';
import { X, TrendingUp, CandlestickChart, Maximize2, RefreshCw } from 'lucide-react';

export default function ChartWidget({ chartConfig, onRemove, onTypeChange }) {
  const { symbol, type } = chartConfig;
  const { loading, error, quote, candles, ohlcCandles } = useMarketApi({ symbol });
  const chartRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);

  // Pass the correct data to the chart based on type
  const chartData = type === 'line' ? candles : ohlcCandles;

  // Determine price change direction
  const priceChange = quote?.netChange || 0;
  const isPositive = priceChange >= 0;

  return (
    <div
      className="panel relative overflow-hidden group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: 'linear-gradient(135deg, rgba(7, 16, 40, 0.9) 0%, rgba(3, 4, 10, 0.95) 100%)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${isHovered ? 'rgba(99, 102, 241, 0.4)' : 'rgba(79, 70, 229, 0.2)'}`,
        transition: 'all 0.3s ease',
        boxShadow: isHovered ? '0 8px 32px rgba(79, 70, 229, 0.2)' : 'none'
      }}
    >
      {/* Animated gradient border effect */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: 'linear-gradient(45deg, rgba(79, 70, 229, 0.1), rgba(139, 92, 246, 0.1), rgba(236, 72, 153, 0.1))',
          backgroundSize: '200% 200%',
          animation: 'gradient-shift 3s ease infinite',
          pointerEvents: 'none'
        }}
      />

      {/* Top color indicator bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1 transition-all duration-300"
        style={{
          background: isPositive
            ? 'linear-gradient(90deg, rgba(34, 197, 94, 0.6), rgba(34, 197, 94, 0.2))'
            : 'linear-gradient(90deg, rgba(239, 68, 68, 0.6), rgba(239, 68, 68, 0.2))'
        }}
      />

      {/* Header */}
      <div className="relative z-10" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full ${isPositive ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}
            style={{ animationDuration: '2s' }}
          />
          <h2 style={{ marginTop: 0, marginBottom: 0, fontSize: '1.1rem', fontWeight: 600 }}>
            {quote?.name || symbol}
          </h2>
          {loading && (
            <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {/* Chart Type Toggle */}
          <button
            onClick={() => onTypeChange(chartConfig.id, type === 'line' ? 'candle' : 'line')}
            className="p-2 rounded-lg hover:bg-white/5 transition-all duration-200 group/btn"
            title={`Switch to ${type === 'line' ? 'candlestick' : 'line'} chart`}
            style={{
              border: '1px solid rgba(99, 102, 241, 0.2)',
              background: 'rgba(79, 70, 229, 0.1)'
            }}
          >
            {type === 'line' ? (
              <CandlestickChart className="w-4 h-4 text-gray-400 group-hover/btn:text-green-400 transition-colors" />
            ) : (
              <TrendingUp className="w-4 h-4 text-gray-400 group-hover/btn:text-blue-400 transition-colors" />
            )}
          </button>

          {/* Remove Button */}
          <button
            onClick={() => onRemove(chartConfig.id)}
            className="p-2 rounded-lg hover:bg-red-500/10 transition-all duration-200 group/btn"
            title="Remove chart"
            style={{
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}
          >
            <X className="w-4 h-4 text-gray-400 group-hover/btn:text-red-400 transition-colors" />
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="panel-error mb-3 flex items-center gap-2 animate-pulse">
          <span className="w-2 h-2 bg-red-500 rounded-full" />
          Error: {error}
        </div>
      )}

      {/* KPI Tiles */}
      <div className="relative z-10">
        <KPITiles quote={quote} />
      </div>

      {/* Chart Canvas Area */}
      <div
        className="relative mt-4 rounded-lg overflow-hidden"
        style={{
          background: 'rgba(0, 0, 0, 0.2)',
          border: '1px solid rgba(99, 102, 241, 0.1)',
          padding: '12px'
        }}
      >
        {/* Canvas grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: `
              linear-gradient(rgba(99, 102, 241, 0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(99, 102, 241, 0.5) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px',
            pointerEvents: 'none'
          }}
        />

        <PriceChart
          ref={chartRef}
          initialData={chartData}
          chartType={type}
        />
      </div>

      {/* Chart Type Badge */}
      <div
        className="absolute bottom-4 right-4 z-20 px-2 py-1 rounded text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: type === 'line'
            ? 'rgba(59, 130, 246, 0.2)'
            : 'rgba(34, 197, 94, 0.2)',
          border: `1px solid ${type === 'line' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
          color: type === 'line' ? 'rgb(147, 197, 253)' : 'rgb(134, 239, 172)'
        }}
      >
        {type === 'line' ? 'Line Chart' : 'Candlestick'}
      </div>
    </div>
  );
}