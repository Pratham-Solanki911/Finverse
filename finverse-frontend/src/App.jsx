// src/App.jsx
import React from "react";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";
import useProfile from "./hooks/useProfile.js";

function AppWrapper() {
  const location = useLocation();
  const { profile, loading } = useProfile();

  // Show a premium loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="text-gray-400 font-medium animate-pulse">Initializing Finverse...</p>
      </div>
    );
  }

  const hideHeaderOn = ["/"];
  const showHeader = !hideHeaderOn.includes(location.pathname);

  const hideFooterOn = ["/"];
  const showFooter = !hideFooterOn.includes(location.pathname);

  return (
    <div className="flex flex-col min-h-screen bg-[#0f172a]">
      {showHeader && <Header profile={profile} />}

      <main className="flex-1 overflow-y-auto">
        <Routes>
          {/* Public Route: Login */}
          <Route 
            path="/" 
            element={profile ? <Navigate to="/dashboard" replace /> : <Login />} 
          />

          {/* Protected Route: Dashboard */}
          <Route 
            path="/dashboard" 
            element={profile ? <Dashboard /> : <Navigate to="/" replace />} 
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {showFooter && <Footer />}
    </div>
  );
}

export default function App() { return <AppWrapper />; }


