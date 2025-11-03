// src/components/NewsPanel.jsx
import React from "react";

function NewsItem({ item }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="news-item"
    >
      {/* --- NEW: Image --- */}
      {item.imageUrl && (
        <img 
          src={item.imageUrl} 
          alt={item.headline} 
          className="news-item-image"
          // Add a fallback in case the image link is broken
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      )}
      <div className="news-item-content">
        <div className="news-item-header">
          <span className="news-item-source">{item.sourceName}</span>
          <span className="news-item-time">{item.publishedTime}</span>
        </div>
        <h4 className="news-item-headline">{item.headline}</h4>
        <p className="news-item-summary">{item.summary}</p>
      </div>
    </a>
  );
}

export default function NewsPanel({ news, loading, error }) {
  let content;

  if (loading) {
    content = <div className="panel-loading">Loading AI News Feed...</div>;
  } else if (error) {
    content = <div className="panel-error">Error: {error}</div>;
  } else if (news.length === 0) {
    content = <div className="panel-empty">No news found for this symbol.</div>;
  } else {
    // Show the AI-curated news items
    content = news.map((item, index) => (
      <NewsItem key={item.id || item.url || index} item={item} />
    ));
  }

  return (
    <div className="news-panel">
      <h3 style={{ marginTop: 0, marginBottom: 16 }}>AI News Feed</h3>
      <div className="news-list">
        {content}
      </div>
    </div>
  );
}

