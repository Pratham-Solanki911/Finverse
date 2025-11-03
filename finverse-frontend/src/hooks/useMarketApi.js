// src/hooks/useMarketApi.js
import { useEffect, useRef, useState } from "react";

// Singleton WebSocket connection
let wsSingleton = null;

/**
 * Gets the singleton WebSocket connection.
 * Creates one if it doesn't exist.
 */
function getWebSocket() {
  if (wsSingleton && wsSingleton.readyState === WebSocket.OPEN) {
    return wsSingleton;
  }
  
  // --- Use wss for secure, or ws for local ---
  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  // --- Use window.location.host for deployed, or 127.0.0.1:8000 for local ---
  // const wsHost = window.location.host;
  const wsHost = "127.0.0.1:8000"; // Assuming local dev for now
  
  const wsUrl = `${wsProtocol}://${wsHost}/ws/feed`;
  console.log(`[WS] Connecting to ${wsUrl}`);
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log(`[WS] Connected to ${wsUrl}`);
  };
  ws.onerror = (err) => {
    console.error("[WS] Error:", err);
  };
  ws.onclose = () => {
    console.log("[WS] Disconnected.");
    wsSingleton = null;
  };
  
  wsSingleton = ws;
  return ws;
}

/**
 * Fetches history + connects to WebSocket for live quotes.
 * Returns: { loading, error, quote, candles (line), ohlcCandles (candle) }
 */
export default function useMarketApi({ symbol = "NIFTY 50" } = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quote, setQuote] = useState(null);
  const [candles, setCandles] = useState([]); // For line chart: { t, y }
  const [ohlcCandles, setOhlcCandles] = useState([]); // NEW: For candlestick: { x, o, h, l, c }
  
  const instrumentKeyRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!symbol) {
      setLoading(false);
      setError("No symbol provided.");
      return;
    }

    // 1. Reset state on symbol change
    setLoading(true);
    setError(null);
    setQuote(null);
    setCandles([]);
    setOhlcCandles([]); // NEW: Reset OHLC
    
    const ws = getWebSocket();

    // 2. Unsubscribe from previous symbol (if any)
    if (instrumentKeyRef.current) {
      console.log(`[WS] Unsubscribing from ${instrumentKeyRef.current}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "unsubscribe",
          key: instrumentKeyRef.current
        }));
      }
      instrumentKeyRef.current = null;
    }

    // 3. Load Initial Data (History + Quote)
    async function loadInitial() {
      try {
        const [qRes, hRes] = await Promise.all([
          fetch(`/api/quote/${encodeURIComponent(symbol)}`),
          fetch(`/api/history/${encodeURIComponent(symbol)}`)
        ]);

        if (!qRes.ok) {
           const errText = await qRes.text();
           throw new Error(`Quote fetch failed for ${symbol}: ${qRes.status} ${errText}`);
        }
        const q = await qRes.json();
        console.log(`✅ Quote data received for ${symbol}:`, q);
        setQuote(q);

        if (!hRes.ok) {
          const errText = await hRes.text();
          throw new Error(`History fetch failed for ${symbol}: ${hRes.status} ${errText}`);
        }
        const h = await hRes.json();
        console.log(`✅ History data received for ${symbol}:`, h);
        
        if (!h.instrument_key) throw new Error("instrument_key not found in history response");
        
        const currentKey = h.instrument_key;
        instrumentKeyRef.current = currentKey;
        
        // Handle both formats: NSE_EQ|INE002A01018 and NSE_EQ:RELIANCE
        const normalizedKey = currentKey.replace('|', ':');
        
        // --- NEW: Map historical candles to BOTH formats ---
        const mapped = (h.candles || [])
          .map((c) => {
            try {
              if (Array.isArray(c)) {
                // [timestamp, open, high, low, close, volume, oi]
                const [timestamp, open, high, low, close] = c;
                const dateObj = new Date(timestamp);
                const o = Number(open);
                const hNum = Number(high);
                const l = Number(low);
                const cNum = Number(close);
                
                if (isNaN(dateObj.getTime()) || isNaN(o) || isNaN(hNum) || isNaN(l) || isNaN(cNum)) return null;

                return {
                  line: { t: dateObj, y: cNum },
                  candle: { x: dateObj.getTime(), o: o, h: hNum, l: l, c: cNum }
                };
              }
              return null;
            } catch (err) { 
              console.warn("Error mapping candle:", err);
              return null; 
            }
          })
          .filter(Boolean); // Remove any nulls
            
        const lineData = mapped.map(m => m.line);
        const candleData = mapped.map(m => m.candle);
        
        console.log(`✅ Mapped ${lineData.length} candles for ${symbol}`);
        setCandles(lineData);
        setOhlcCandles(candleData); // NEW: Set OHLC data
        
        // 4. SUBSCRIBE to new symbol
        const subscribe = () => {
          if (ws.readyState === WebSocket.OPEN) {
            console.log(`[WS] Subscribing to ${currentKey}`);
            ws.send(JSON.stringify({
              type: "subscribe",
              key: currentKey
            }));
          } else {
            console.warn("[WS] WebSocket not open. Will try on open.");
          }
        };

        if (ws.readyState === WebSocket.OPEN) {
          subscribe();
        } else {
          ws.addEventListener('open', subscribe, { once: true });
        }
        
        // 5. Set up the message listener
        const onMessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle live feed updates
            if (data.type === 'live_feed' && data.feeds) {
              // Try both normalized key formats
              const feed = data.feeds[normalizedKey] || data.feeds[currentKey];
              
              if (feed && feed.ltpc && feed.ltpc.ltp) {
                const ltp = Number(feed.ltpc.ltp);
                const ts = new Date(data.currentTs || Date.now());

                if (!isNaN(ltp)) {
                  console.log(`📊 Live update for ${symbol}: ${ltp}`);
                  
                  // Update quote object
                  setQuote(prev => ({
                    ...prev,
                    last_price: ltp,
                    timestamp: ts.toISOString(),
                    // Optimistically update net_change if we have an open price
                    net_change: (prev?.ohlc?.open) ? (ltp - prev.ohlc.open) : prev?.net_change
                  }));
                  
                  // Update line chart data (append new point)
                  setCandles(prev => {
                    const updated = [...prev, { t: ts, y: ltp }];
                    // Keep last 2000 points
                    return updated.slice(-2000);
                  });

                  // --- NEW: Update candlestick data ---
                  setOhlcCandles(prev => {
                    if (prev.length === 0) return [];
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    
                    // This is a simple update: just update the last candle's C, H, L.
                    // A proper live candle would require time-bucketing (e.g., new candle every 1 min).
                    // For this demo, we'll just update the current last candle.
                    last.c = ltp;
                    last.h = Math.max(last.h, ltp);
                    last.l = Math.min(last.l, ltp);
                    
                    return updated;
                  });
                }
              }
            }
          } catch (err) {
            console.warn("[WS] Failed to parse message:", err);
          }
        };

        ws.addEventListener('message', onMessage);
        
        // Store cleanup function
        cleanupRef.current = () => {
          ws.removeEventListener('message', onMessage);
          ws.removeEventListener('open', subscribe);
        };

      } catch (err) {
        console.error(`❌ Load error for ${symbol}:`, err);
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }

    loadInitial();

    // 6. Main Cleanup Function
    return () => {
      console.log(`[WS] Cleanup triggered for ${symbol}`);
      
      // Remove event listeners
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      
      // Unsubscribe from WebSocket
      if (instrumentKeyRef.current && wsSingleton && wsSingleton.readyState === WebSocket.OPEN) {
        console.log(`[WS] Unsubscribing from ${instrumentKeyRef.current}`);
        wsSingleton.send(JSON.stringify({
          type: "unsubscribe",
          key: instrumentKeyRef.current
        }));
      }
    };
  }, [symbol]); // Re-run effect when symbol changes
  
  // NEW: Return ohlcCandles
  return { loading, error, quote, candles, ohlcCandles };
}
