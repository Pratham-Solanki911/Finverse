// src/components/DevStatusPanel.jsx
import React from "react";

// This component contains the "Status" card JSX.
// It accepts the data it needs as props.
export default function DevStatusPanel({ currentSymbol, loading, error, quote }) {
  return (
    <aside className="panel">
      <h3 style={{ marginTop: 0 }}>Status</h3>
      <div className="small">Symbol: {currentSymbol}</div>
      <div className="small">Loading: {String(loading)}</div>
      <div className="small">Error: {error ?? "none"}</div>
      <div style={{ marginTop: 12 }} className="small">
        Quote preview:
      </div>
      <pre className="pre">{JSON.stringify(quote ?? "no quote", null, 2)}</pre>
    </aside>
  );
}
