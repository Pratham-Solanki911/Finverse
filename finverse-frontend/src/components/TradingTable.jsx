import React from 'react';

const TradingTable = ({ columns, data, loading, emptyMessage = "No data available" }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center p-12 text-slate-400 bg-slate-900/20 rounded-xl border border-dashed border-slate-700">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto trading-scrollbar">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-800">
            {columns.map((col, idx) => (
              <th key={idx} className="pb-4 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {data.map((row, rowIdx) => (
            <tr key={rowIdx} className="group hover:bg-white/[0.02] transition-colors">
              {columns.map((col, colIdx) => {
                const value = col.accessor(row);
                const isNumeric = typeof value === 'number';
                
                return (
                  <td key={colIdx} className={`py-4 px-4 text-sm ${col.className || ''}`}>
                    {col.render ? col.render(row) : (
                      <span className={isNumeric ? 'font-mono' : 'text-slate-300'}>
                        {isNumeric ? value.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : value}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TradingTable;
