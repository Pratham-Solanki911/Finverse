// src/components/PriceChart.jsx
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Chart, LineElement, PointElement, LineController, LinearScale, TimeScale, Tooltip, Legend, CategoryScale } from "chart.js";
import 'chartjs-adapter-date-fns';
import { CandlestickElement, OhlcElement, CandlestickController } from 'chartjs-chart-financial';

// --- NEW: Import the zoom plugin ---
// (Make sure you have run: npm install chartjs-plugin-zoom)
import Zoom from 'chartjs-plugin-zoom';

// --- NEW: Register the zoom plugin ---
Chart.register(
  LineController, LineElement, PointElement, LinearScale, TimeScale, 
  Tooltip, Legend, CategoryScale,
  CandlestickElement, OhlcElement, CandlestickController,
  Zoom // Register Zoom
);

const PriceChart = forwardRef(function PriceChart({ 
  initialData = [], 
  chartType = 'line' // NEW PROP: 'line' or 'candle'
}, ref) {
  // --- FIX: Define refs and helper function here ---
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  // Helper to format data based on type
  const formatData = (data) => {
    return (data || [])
      .filter(d => d)
      .map(d => {
        if (chartType === 'line') {
          // Line data is {t, y} -> map to {x, y}
          if (!d.t || d.y == null) return null;
          return { 
            x: d.t instanceof Date ? d.t : new Date(d.t), 
            y: Number(d.y) 
          };
        }
        // Candle data is {x, o, h, l, c} -> just ensure x is a Date
        if (!d.x || d.o == null || d.h == null || d.l == null || d.c == null) return null;
        return { 
          ...d, 
          x: d.x instanceof Date ? d.x : new Date(d.x) 
        };
      })
      .filter(d => d && d.x && !isNaN(d.x.getTime())); // Filter out any invalid dates
  };

  // create chart on mount
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    
    const validData = formatData(initialData);

    console.info(`[PriceChart] 🎨 Creating ${chartType} chart with`, validData.length, "initial points");

    const cfg = {
      type: chartType === 'candle' ? 'candlestick' : 'line',
      data: {
        datasets: [{
          label: chartType === 'line' ? "Close" : "OHLC",
          data: validData,
          // Line chart styles
          tension: 0.15,
          borderWidth: 2,
          borderColor: 'rgb(16, 185, 129)',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: chartType === 'line', // Only fill for line charts
          // --- NEW: Candlestick styles ---
          color: {
            up: '#10b981', // Green for up
            down: '#ff6161', // Red for down
            unchanged: '#cbd5e1', // Gray for unchanged
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        scales: {
          x: {
            type: "time",
            time: { 
              tooltipFormat: "PPpp",
              displayFormats: {
                millisecond: 'HH:mm:ss.SSS',
                second: 'HH:mm:ss',
                minute: 'HH:mm',
                hour: 'HH:mm',
                day: 'MMM d',
                week: 'MMM d',
                month: 'MMM yyyy',
                quarter: 'MMM yyyy',
                year: 'yyyy'
              }
            },
            ticks: {
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 10,
              color: '#9ca3af' // Muted ticks
            },
            grid: {
              display: true,
              color: 'rgba(255, 255, 255, 0.05)' // Darker grid
            }
          },
          y: {
            title: { display: true, text: "Price (INR)", color: '#9ca3af' },
            beginAtZero: false,
            ticks: {
              color: '#9ca3af' // Muted ticks
            },
            grid: {
              display: true,
              color: 'rgba(255, 255, 255, 0.05)' // Darker grid
            }
          }
        },
        plugins: { 
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 10,
            cornerRadius: 4
          },
          // --- NEW: Zoom/Pan Configuration ---
          zoom: {
            pan: {
              enabled: true,
              mode: 'x', // Pan only on the x-axis
              threshold: 10,
            },
            zoom: {
              wheel: {
                enabled: true,
              },
              pinch: {
                enabled: true
              },
              mode: 'x', // Zoom only on the x-axis
            }
          }
        }
      }
    };

    chartRef.current = new Chart(ctx, cfg);
    console.info("[PriceChart] ✅ Chart created successfully");

    return () => {
      try { 
        if (chartRef.current) {
          chartRef.current.destroy(); 
          console.info("[PriceChart] 🗑️ Chart destroyed");
        }
      } catch (e) { 
        console.warn("[PriceChart] ⚠️ Error destroying chart:", e);
      }
      chartRef.current = null;
    };
    // Re-create chart if chartType changes
  }, [chartType]); 

  // respond to initialData prop changes
  useEffect(() => {
    try {
      if (!chartRef.current) return;
      
      const validData = formatData(initialData);
      
      const ds = chartRef.current.data.datasets[0];
      ds.data = validData;
      chartRef.current.update();
      
      console.info(`[PriceChart] 🔄 ${chartType} data updated -`, validData.length, "points");
      if (validData.length === 0) {
        console.warn("[PriceChart] ⚠️ No valid data to display!");
      }
    } catch (e) {
      console.error("[PriceChart] ❌ Failed to apply initialData:", e);
    }
  }, [initialData, chartType]); // Also re-run on chartType

  useImperativeHandle(ref, () => ({
    appendPoint: (point) => {
      try {
        if (!chartRef.current || chartType !== 'line') return; // Only append for line charts
        
        const ds = chartRef.current.data.datasets[0];
        const validPoint = {
          x: point.t instanceof Date ? point.t : new Date(point.t),
          y: Number(point.y)
        };
        
        // --- FIX: Corrected the typo here ---
        if (isNaN(validPoint.x.getTime()) || isNaN(validPoint.y)) return;

        ds.data.push(validPoint);
        if (ds.data.length > 2000) ds.data.shift();
        chartRef.current.update("none");
      } catch (err) {
        console.warn("[PriceChart] ⚠️ appendPoint error:", err);
      }
    },
    setData: (pointsArray) => {
      try {
        if (!chartRef.current) return;
        const validData = formatData(pointsArray);
        const ds = chartRef.current.data.datasets[0];
        ds.data = validData;
        chartRef.current.update();
        console.info("[PriceChart] 📊 setData -", validData.length, "points");
      } catch (err) {
        console.error("[PriceChart] ❌ setData error:", err);
      }
    },
    getChartInstance: () => chartRef.current
  }), [chartType]); // Re-create handle if chartType changes

  return (
    <div style={{ height: 360 }} className="canvasWrap panel">
      <canvas ref={canvasRef} />
    </div>
  );
});

export default PriceChart;


