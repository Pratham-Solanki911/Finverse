// src/components/SentimentAnalysis.jsx
import React from 'react';
import ReactMarkdown from 'react-markdown'; // --- NEW: Import the library ---

/**
 * Helper to get sentiment color
 */
const getSentimentClass = (text) => {
  if (!text) return 'text-gray-400';
  const s = text.toLowerCase();
  if (s.includes('positive')) return 'text-green-500';
  if (s.includes('negative')) return 'text-red-500';
  return 'text-gray-400';
};

export default function SentimentAnalysis({ analysisText, loading }) {
  if (loading) {
    return (
      <div className="sentiment-analysis-container loading">
        <div className="spinner"></div>
        <p>Analyzing sentiment...</p>
      </div>
    );
  }

  if (!analysisText) return null;

  // Extract the first line for the header
  const lines = analysisText.split('\n');
  const firstLine = lines.find(line => line.toLowerCase().includes('overall sentiment:'));
  
  return (
    <div className="sentiment-analysis-container">
      <h4 className={`sentiment-title ${getSentimentClass(firstLine)}`}>
        AI Sentiment Analysis
      </h4>
      
      {/* --- UPDATED: Use ReactMarkdown --- */}
      <div className="sentiment-details-markdown">
        <ReactMarkdown
          children={analysisText}
          components={{
            // Customize links to open in a new tab
            a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          }}
        />
      </div>
    </div>
  );
}

