// src/components/Header.jsx
import React from "react";
// --- UPDATED: Use a relative path from src/components/ ---
import logoSrc from "../assets/logo.png";

// Accept the profile prop
export default function Header({ small = false, profile = null }) {
  return (
    <header className={`w-full ${small ? "py-3" : "py-4"} px-6 bg-transparent border-b border-gray-800`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-white/6 p-1 brand-shadow">
            <img src={logoSrc} alt="Finverse" className="h-8 w-8 object-contain" />
          </div>
          <div>
            <div className="text-white text-lg font-semibold">Finverse</div>
            <div className="text-xs text-gray-400">AI Trading Companion</div>
          </div>
        </div>

        <nav className="flex items-center gap-4">
          {/* NEW: Show profile name */}
          {profile && (
            <span className="text-sm text-gray-300">
              {profile.name || profile.user_name || 'User'}
            </span>
          )}
          <a href="/dashboard" className="text-sm text-gray-300 hover:text-white">Dashboard</a>
          <button
            onClick={() => { document.cookie = "upstox_access_token=; Max-Age=0; path=/;"; window.location.href = "/"; }}
            className="btn-primary"
            style={{ padding: "8px 14px", fontSize: 14 }}
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}