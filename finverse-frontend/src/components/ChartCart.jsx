import React, { useState } from 'react';
import { X, TrendingUp, CandlestickChart, GripVertical, Eye, EyeOff, Settings } from 'lucide-react';

/**
 * ChartCart Component - Dynamic cart for managing chart configurations
 * Provides a sidebar interface for controlling all charts on the dashboard
 */
const ChartCart = ({ charts, onRemove, onReorder, onTypeChange, onToggleVisibility, isOpen, onToggle }) => {
  const [draggedItem, setDraggedItem] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const handleDragStart = (e, index) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    setHoveredIndex(index);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (draggedItem !== null && draggedItem !== dropIndex) {
      onReorder(draggedItem, dropIndex);
    }
    setDraggedItem(null);
    setHoveredIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setHoveredIndex(null);
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Chart Cart Panel */}
      <div
        className={`fixed right-0 top-0 h-full bg-gradient-to-b from-[#071028] to-[#03040a]
                    border-l border-indigo-500/20 shadow-2xl z-50 transition-transform duration-300 ease-in-out
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}
                    w-80 lg:w-96`}
      >
        {/* Header */}
        <div className="p-4 border-b border-indigo-500/20">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <CandlestickChart className="w-5 h-5 text-indigo-400" />
              Chart Cart
            </h2>
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              aria-label="Close chart cart"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <p className="text-sm text-gray-400">
            {charts.length} / 8 Charts Active
          </p>
        </div>

        {/* Chart List */}
        <div className="overflow-y-auto h-[calc(100%-80px)] p-4 space-y-3">
          {charts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <CandlestickChart className="w-16 h-16 text-gray-600 mb-4" />
              <p className="text-gray-400 text-sm">
                No charts added yet.
                <br />
                Search for a symbol to get started!
              </p>
            </div>
          ) : (
            charts.map((chart, index) => (
              <div
                key={chart.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`bg-[#0a1434]/50 backdrop-blur-sm rounded-lg border transition-all duration-200
                          ${draggedItem === index ? 'opacity-50 scale-95' : 'opacity-100 scale-100'}
                          ${hoveredIndex === index && draggedItem !== null ? 'border-indigo-500 shadow-lg shadow-indigo-500/20' : 'border-indigo-500/20'}
                          ${chart.hidden ? 'opacity-60' : ''}
                          hover:border-indigo-500/40 cursor-move`}
              >
                {/* Drag Handle */}
                <div className="flex items-start gap-3 p-3">
                  <div className="pt-1 cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-4 h-4 text-gray-500" />
                  </div>

                  {/* Chart Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white text-sm truncate">
                        {chart.symbol}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium
                                      ${chart.type === 'line'
                                        ? 'bg-blue-500/20 text-blue-300'
                                        : 'bg-green-500/20 text-green-300'}`}>
                        {chart.type === 'line' ? 'Line' : 'Candle'}
                      </span>
                    </div>

                    {/* Chart Controls */}
                    <div className="flex items-center gap-1 mt-2">
                      {/* Toggle Chart Type */}
                      <button
                        onClick={() => onTypeChange(chart.id, chart.type === 'line' ? 'candle' : 'line')}
                        className="p-1.5 rounded hover:bg-white/5 transition-colors group"
                        title={`Switch to ${chart.type === 'line' ? 'candlestick' : 'line'} chart`}
                      >
                        {chart.type === 'line' ? (
                          <CandlestickChart className="w-3.5 h-3.5 text-gray-400 group-hover:text-green-400" />
                        ) : (
                          <TrendingUp className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-400" />
                        )}
                      </button>

                      {/* Toggle Visibility */}
                      <button
                        onClick={() => onToggleVisibility(chart.id)}
                        className="p-1.5 rounded hover:bg-white/5 transition-colors group"
                        title={chart.hidden ? 'Show chart' : 'Hide chart'}
                      >
                        {chart.hidden ? (
                          <EyeOff className="w-3.5 h-3.5 text-gray-400 group-hover:text-yellow-400" />
                        ) : (
                          <Eye className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-400" />
                        )}
                      </button>

                      {/* Spacer */}
                      <div className="flex-1" />

                      {/* Remove Chart */}
                      <button
                        onClick={() => onRemove(chart.id)}
                        className="p-1.5 rounded hover:bg-red-500/10 transition-colors group"
                        title="Remove chart"
                      >
                        <X className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Drop Indicator */}
                {hoveredIndex === index && draggedItem !== null && draggedItem !== index && (
                  <div className="h-0.5 bg-indigo-500 mx-3 mb-2 rounded-full" />
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Toggle Button (when closed) */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed right-4 top-20 z-40 bg-gradient-to-br from-indigo-600 to-indigo-700
                     text-white p-3 rounded-lg shadow-lg shadow-indigo-500/30
                     hover:shadow-xl hover:shadow-indigo-500/40 transition-all duration-200
                     hover:scale-105 active:scale-95 border border-indigo-400/30"
          aria-label="Open chart cart"
        >
          <div className="relative">
            <CandlestickChart className="w-5 h-5" />
            {charts.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs
                             rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {charts.length}
              </span>
            )}
          </div>
        </button>
      )}
    </>
  );
};

export default ChartCart;
