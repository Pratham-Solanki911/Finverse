// src/components/SymbolSearch.jsx
import React, { useState, useEffect, useRef } from 'react';
import useDebounce from '../hooks/useDebounce';

export default function SymbolSearch({ onSymbolSelect, onDropdownStateChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 300); // 300ms delay
  const wrapperRef = useRef(null);

  // Notify parent when dropdown state changes
  useEffect(() => {
    if (onDropdownStateChange) {
      onDropdownStateChange(isOpen);
    }
  }, [isOpen, onDropdownStateChange]);

  useEffect(() => {
    // Hide results when clicking outside
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      setIsOpen(false);
      return;
    }

    async function fetchResults() {
      setLoading(true);
      try {
        const resp = await fetch(`/api/instruments/search?q=${encodeURIComponent(debouncedQuery)}&limit=10`);
        if (!resp.ok) throw new Error("Search failed");
        const data = await resp.json();
        setResults(data);
        setIsOpen(true);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchResults();
  }, [debouncedQuery]); // Only runs when debouncedQuery changes

  const handleSelect = (symbol) => {
    setQuery(symbol); // Set input text to the selected symbol
    setIsOpen(false);
    // Don't clear results so they can be shown again on refocus
    onSymbolSelect(symbol); // Pass the selected symbol up to the Dashboard
  };

  return (
    <div className="search-wrapper" ref={wrapperRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (query.length >= 2 && results.length > 0) {
            setIsOpen(true);
          }
        }}
        placeholder="Search for a symbol (e.g., RELIANCE)..."
        className="search-input"
      />
      {loading && <div className="search-loading">Loading...</div>}
      
      {isOpen && results.length > 0 && (
        <ul className="search-results">
          {results.map((item) => (
            <li 
              key={item.instrument_key}
              onClick={() => handleSelect(item.symbol)}
            >
              <div className="search-result-symbol">{item.symbol}</div>
              <div className="search-result-name">{item.name}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}