// src/components/LoginCard.jsx
import React from "react";

export default function LoginCard({ checking = false, onLogin, error = null }) {
  return (
    <div className="w-full max-w-md">
      <div className="card-glass p-8 rounded-2xl border-gray-800 shadow-lg">
        <h3 className="text-2xl font-semibold text-white mb-1">Welcome back</h3>
        <p className="text-sm text-gray-400 mb-6">Sign in with your Upstox account to access live data and insights.</p>

        {checking ? (
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <div className="text-sm text-gray-300">Checking authentication…</div>
          </div>
        ) : (
          <>
            {/* Clean icon: right-arrow */}
            <button
              onClick={onLogin}
              className="btn-primary w-full mb-3 inline-flex items-center justify-center gap-3"
              style={{ padding: "12px 16px" }}
            >
              <span>Login with Upstox</span>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path d="M5 12h14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 5l7 7-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button onClick={() => window.location.href="/dashboard"} className="btn-ghost w-full text-left">
              Continue as guest (demo)
            </button>

            {error && <div className="mt-4 text-sm text-rose-400">{error}</div>}

            <div className="mt-6 text-xs text-gray-500">By signing in, you allow Finverse to read your market data for the dashboard experience.</div>
          </>
        )}
      </div>
    </div>
  );
}
