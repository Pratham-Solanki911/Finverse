import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Plus, TrendingUp, Activity, Briefcase } from 'lucide-react';

const AddSymbolModal = ({ isOpen, onClose, onAdd }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setSearchTerm('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchTerm.length >= 2) {
        setLoading(true);
        try {
          const response = await fetch(`/api/search?query=${encodeURIComponent(searchTerm)}`);
          const data = await response.json();
          setResults(data.instruments || []);
          setSelectedIndex(0);
        } catch (error) {
          console.error("Search error:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      onAdd(results[selectedIndex]);
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="search-modal glass-panel !bg-slate-900/80" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-white/5 flex gap-4 items-center">
          <Search className="text-blue-400" size={24} />
          <input 
            ref={inputRef}
            autoFocus
            className="bg-transparent border-none outline-none text-xl text-white w-full placeholder:text-slate-600 font-medium"
            placeholder="Search stocks, indices, F&O..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-all">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="results-list max-h-[450px] overflow-y-auto trading-scrollbar p-2">
          {loading && (
            <div className="p-12 flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
              <span className="text-slate-500 text-sm font-medium">Searching market...</span>
            </div>
          )}

          {!loading && results.length > 0 && results.map((inst, index) => (
            <button 
              key={inst.instrument_key}
              onClick={() => { onAdd(inst); onClose(); }}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full text-left p-4 rounded-2xl flex justify-between items-center group transition-all ${
                index === selectedIndex ? 'bg-blue-600/20 border border-blue-500/30 shadow-lg' : 'hover:bg-white/5 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-xl ${index === selectedIndex ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700'}`}>
                  {inst.instrument_type === 'EQUITY' ? <Briefcase size={18} /> : <Activity size={18} />}
                </div>
                <div>
                  <div className="font-bold text-white text-base group-hover:text-blue-400 flex items-center gap-2">
                    {inst.tradingsymbol}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500 font-mono">
                      {inst.exchange}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 truncate max-w-[300px]">{inst.name}</div>
                </div>
              </div>
              <div className={`flex items-center gap-2 transition-all ${index === selectedIndex ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}>
                <span className="text-xs font-bold text-blue-400">ADD TO WORKSPACE</span>
                <Plus size={20} className="text-blue-400" />
              </div>
            </button>
          ))}

          {!loading && searchTerm.length >= 2 && results.length === 0 && (
            <div className="p-12 text-center flex flex-col items-center gap-3">
              <div className="bg-slate-800/50 p-4 rounded-full">
                <Search size={32} className="text-slate-600" />
              </div>
              <p className="text-slate-400 text-sm font-medium">No instruments found matching "{searchTerm}"</p>
            </div>
          )}

          {searchTerm.length < 2 && !loading && (
            <div className="p-8">
              <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-4">Quick Links</h4>
              <div className="grid grid-cols-2 gap-3">
                {['NIFTY 50', 'BANK NIFTY', 'RELIANCE', 'HDFCBANK'].map(s => (
                  <button 
                    key={s}
                    onClick={() => setSearchTerm(s)}
                    className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-blue-500/30 transition-all text-sm text-slate-400 hover:text-white"
                  >
                    <TrendingUp size={14} className="text-blue-500/50" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddSymbolModal;
