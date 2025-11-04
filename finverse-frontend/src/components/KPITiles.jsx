import React from "react";

function Tile({ title, value, className }) {
  return (
    <div className={`kpi ${className || ""}`}>
      <div className="label">{title}</div>
      <div className="value">{value}</div>
    </div>
  );
}

// Helper function to safely format numbers
function formatNumber(value, decimals = 2) {
  if (value == null || value === "" || value === "--") {
    return "--";
  }
  const num = Number(value);
  if (isNaN(num)) {
    return "--";
  }
  return num.toFixed(decimals);
}

export default function KPITiles({ quote }) {
  const last_price = quote?.last_price ?? quote?.lastPrice ?? quote?.last ?? null;
  const net_change = quote?.net_change ?? quote?.netChange ?? quote?.change ?? null;
  const ohlc = quote?.ohlc ?? {};
  
  // OHLC fields can have underscore prefix from Upstox SDK
  const open = ohlc.open ?? ohlc._open ?? ohlc.o ?? null;
  const high = ohlc.high ?? ohlc._high ?? ohlc.h ?? null;
  const low = ohlc.low ?? ohlc._low ?? ohlc.l ?? null;
  const close = ohlc.close ?? ohlc._close ?? ohlc.c ?? null;

  // Determine change color
  const changeNum = Number(net_change);
  const changeClass = !isNaN(changeNum) && changeNum > 0
    ? { color: "#10b981" }
    : !isNaN(changeNum) && changeNum < 0
    ? { color: "#ff6161" }
    : { color: "#cbd5e1" };

  return (
    <div>
      <div className="kpi-row">
        <Tile 
          title="Last Price" 
          value={formatNumber(last_price)} 
        />
        <div className="kpi">
          <div className="label">Net Change</div>
          <div className="value" style={changeClass}>
            {net_change != null && !isNaN(Number(net_change))
              ? (Number(net_change) > 0 ? "+" : "") + formatNumber(net_change)
              : "--"}
          </div>
        </div>
        <Tile 
          title="Open" 
          value={formatNumber(open)} 
        />
        <Tile 
          title="High" 
          value={formatNumber(high)} 
        />
        <Tile 
          title="Low" 
          value={formatNumber(low)} 
        />
      </div>
    </div>
  );
}