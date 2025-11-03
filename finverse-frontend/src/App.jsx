// src/App.jsx
import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
// --- UPDATED: Use absolute paths from /src ---
import Login from "/src/pages/Login.jsx";
import Dashboard from "/src/pages/Dashboard.jsx";
import Header from "/src/components/Header.jsx";
import Footer from "/src/components/Footer.jsx";
import useProfile from "/src/hooks/useProfile.js";

function AppWrapper() {
  const location = useLocation();
  const { profile } = useProfile();

  const hideHeaderOn = ["/"];
  const showHeader = !hideHeaderOn.includes(location.pathname);
  
  const hideFooterOn = ["/"];
  const showFooter = !hideFooterOn.includes(location.pathname);

  return (
    <div className="flex flex-col min-h-screen">
      {showHeader && <Header profile={profile} />}
      
      {/* --- THIS IS THE FIX --- */}
      {/* We make the main content area scrollable, not the whole page */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>
      
      {showFooter && <Footer />}
    </div>
  );
}

export default function App() { return <AppWrapper />; }

