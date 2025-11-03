// src/hooks/useProfile.js
import { useState, useEffect } from 'react';

export default function useProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/user/profile')
      .then(res => {
        if (res.ok) return res.json();
        return null;
      })
      .then(data => {
        setProfile(data);
      })
      .catch(() => {
        setProfile(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []); // Runs once on mount

  return { profile, loading };
}