// src/components/Hero.jsx
import React from "react";
import logoSrc from "../assets/logo.png";

export default function Hero() {
  return (
    <div className="px-2">
      <div className="flex items-center gap-4 mb-6">
        <div className="rounded-full bg-white/6 p-2 brand-shadow">
          <img src={logoSrc} alt="logo" className="h-14 w-14 object-contain" />
        </div>
        <div>
          <div className="text-2xl font-bold text-white">Finverse</div>
          <div className="text-sm text-gray-400">AI-powered trading companion</div>
        </div>
      </div>

      <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 leading-tight">
        Trade smarter with <span className="text-indigo-400">AI-driven</span> insights.
      </h1>

      <p className="text-lg text-gray-300 max-w-xl">
        Real-time market data, predictive signals, and portfolio insights — all in one smart dashboard.
      </p>

      <ul className="mt-6 text-sm text-gray-400 space-y-2">
        <li>• Live market feed</li>
        <li>• AI-backed trade suggestions</li>
        <li>• Risk insights & alerts</li>
      </ul>
    </div>
  );
}
