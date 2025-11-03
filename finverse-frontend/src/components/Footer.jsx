// src/components/Footer.jsx
import React from "react";
import { useSearchParams } from "react-router-dom"; // Import the hook

export default function Footer() {
  // Get the current search params and a function to update them
  const [searchParams, setSearchParams] = useSearchParams();

  const toggleDevMode = () => {
    // Check if ?dev=true is currently in the URL
    const isDev = searchParams.get("dev") === "true";
    
    // Create a new params object based on the current ones
    // This preserves any other params we might add later
    const nextParams = Object.fromEntries(searchParams);

    if (isDev) {
      // If dev mode is ON, turn it OFF by deleting the 'dev' param
      delete nextParams.dev;
    } else {
      // If dev mode is OFF, turn it ON by setting ?dev=true
      nextParams.dev = "true";
    }
    
    // Update the URL with the new set of parameters
    setSearchParams(nextParams);
  };

  return (
    <footer className="w-full text-center py-6 text-sm text-gray-500 border-t border-gray-800">
      {/* This is now a button! We make it look like text but it's clickable.
        The `title` attribute adds a nice tooltip on hover.
      */}
      <button
        onClick={toggleDevMode}
        title="Toggle Developer Mode"
        className="cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
        style={{ background: "none", border: "none", color: "inherit", padding: 0 }}
      >
        ©
      </button>
      {/* Add a space after the button */}
      {" "}
      {new Date().getFullYear()} Finverse — AI-powered trading companion
    </footer>
  );
}
