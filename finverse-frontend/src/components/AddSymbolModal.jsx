// src/components/AddSymbolModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, X, TrendingUp } from 'lucide-react';
import useDebounce from '../hooks/useDebounce';

export default function AddSymbolModal({ isOpen, onClose, onSymbolSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debouncedQuery = useDebounce(query, 300);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    async function fetchResults() {
      setLoading(true);
      try {
        const resp = await fetch(`/api/instruments/search?q=${encodeURIComponent(debouncedQuery)}&limit=20`);
        if (!resp.ok) throw new Error("Search failed");
        const data = await resp.json();

        // Auto-sort: prioritize exact matches, then alphabetical
        const sorted = data.sort((a, b) => {
          const aStarts = a.symbol.toLowerCase().startsWith(debouncedQuery.toLowerCase());
          const bStarts = b.symbol.toLowerCase().startsWith(debouncedQuery.toLowerCase());

          if (aStarts && !bStarts) return -1;
          if (!aStarts && bStarts) return 1;
          return a.symbol.localeCompare(b.symbol);
        });

        setResults(sorted);
        setSelectedIndex(0);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchResults();
  }, [debouncedQuery]);

  const handleSelect = (symbol) => {
    onSymbolSelect(symbol);
    onClose();
    setQuery("");
    setResults([]);
  };

  const handleKeyDown = (e) => {
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex].symbol);
      }
    }
  };

  useEffect(() => {
    if (dropdownRef.current && results.length > 0) {
      const selected = dropdownRef.current.children[selectedIndex];
      if (selected) {
        selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, results.length]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="add-symbol-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <Plus className="text-green-400" size={24} />
            <h2 className="text-xl font-bold text-white">Add Symbol to Dashboard</h2>
          </div>
          <button onClick={onClose} className="modal-close-btn">
            <X size={20} />
          </button>
        </div>

        {/* Separate Search Input Entity */}
        <div className="search-input-container">
          <Search className="search-icon" size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type symbol or company name (e.g., RELIANCE, TCS)..."
            className="modal-search-input"
            autoFocus
          />
          {loading && <div className="search-spinner">⟳</div>}
        </div>

        {/* Separate Dropdown Entity with Auto-sort */}
        <div className="dropdown-container">
          {query.length > 0 && query.length < 2 && (
            <div className="search-hint">
              <TrendingUp size={16} className="text-gray-500" />
              <span>Type at least 2 characters to search...</span>
            </div>
          )}

          {query.length >= 2 && results.length === 0 && !loading && (
            <div className="search-hint">
              <span>No results found for "{query}"</span>
            </div>
          )}

          {results.length > 0 && (
            <div className="dropdown-scrollable" ref={dropdownRef}>
              {results.map((item, index) => (
                <div
                  key={item.instrument_key}
                  className={`dropdown-item ${index === selectedIndex ? 'selected' : ''}`}
                  onClick={() => handleSelect(item.symbol)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="dropdown-item-main">
                    <div className="dropdown-symbol">{item.symbol}</div>
                    <div className="dropdown-name">{item.name}</div>
                  </div>
                  <Plus size={18} className="dropdown-add-icon" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="text-xs text-gray-500">
            💡 Use ↑↓ arrow keys to navigate, Enter to select
          </div>
        </div>
      </div>
    </div>
  );
}
