// src/pages/Login.jsx
import React, { useEffect, useState } from "react";
import Hero from "../components/Hero";
import LoginCard from "../components/LoginCard";
import Footer from "../components/Footer"; // Keep footer for this page

export default function Login() {
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      try {
        const resp = await fetch("/api/user/profile");
        if (!mounted) return;
        if (resp.ok) {
          window.location.href = "/dashboard";
        } else {
          setChecking(false);
        }
      } catch (err) {
        if (!mounted) return;
        setChecking(false);
      }
    }
    checkAuth();
    return () => (mounted = false);
  }, []);

  const onLogin = () => window.location.href = "/api/auth/authorize";

  // --- SIMPLIFIED: Removed min-h-screen and flex-col ---
  // App.jsx handles the flex-1 for <main>
  return (
    <div className="flex flex-col h-full">
      {/* --- UPDATED: flex-1 ensures this <main> fills the <main> from App.jsx --- */}
      <main className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <Hero />
          <div className="flex items-center justify-center">
            <LoginCard checking={checking} onLogin={onLogin} error={error} />
          </div>
        </div>
      </main>
      <Footer /> {/* This page has its own footer */}
    </div>
  );
}