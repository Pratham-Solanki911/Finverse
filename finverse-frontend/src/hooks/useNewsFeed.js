// src/hooks/useNewsFeed.js
import { useState, useEffect } from 'react';

/**
 * Fetches company news for a given symbol from our *own* backend.
 */
export default function useNewsFeed({ symbol, companyName }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Use the full company name if available, otherwise fall back to the symbol
    const searchQuery = companyName || symbol;
    if (!searchQuery) return; // Don't fetch if no query is provided

    async function fetchNews() {
      setLoading(true);
      setError(null);
      setNews([]); // Clear old news

      try {
        // --- 1. Construct the URL for our backend endpoint ---
        const url = new URL('/api/ai/get_market_news', window.location.origin);
        url.searchParams.append('symbol', symbol);
        if (companyName) {
          url.searchParams.append('companyName', companyName);
        }

        // --- 2. Fetch from our backend ---
        const resp = await fetch(url.toString());
        
        if (!resp.ok) {
          const errText = await resp.text();
          try {
            // Try to parse error detail from FastAPI
            const errJson = JSON.parse(errText);
            throw new Error(errJson.detail || `HTTP error! status: ${resp.status}`);
          } catch (e) {
            throw new Error(errText || `HTTP error! status: ${resp.status}`);
          }
        }
        
        const data = await resp.json(); // This is our NewsResponse object
        
        // The backend already validates the structure
        const validNews = data.articles || [];
        setNews(validNews);

      } catch (err) {
        console.error("News fetch error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchNews();
  }, [symbol, companyName]); // Re-run this effect when the symbol or name changes

  return { news, loading, error };
}

