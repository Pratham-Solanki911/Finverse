import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { TrendingUp, LayoutDashboard, LogOut, User } from 'lucide-react';

const Header = ({ profile }) => {
  const location = useLocation();
  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    // Redirect to backend logout endpoint
    window.location.href = '/api/auth/logout';
  };

  return (
    <header className="sticky top-0 z-50 w-full px-4 py-3">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 px-6 py-3 shadow-lg">
          {/* Logo Section */}
          <Link to="/" className="flex items-center space-x-2 group">
            <div className="bg-gradient-to-tr from-blue-500 to-purple-600 p-2 rounded-xl group-hover:rotate-12 transition-transform duration-300">
              <TrendingUp className="text-white w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">Finverse</span>
          </Link>

          {/* User Section */}
          <div className="flex items-center space-x-4">
            {profile ? (
              <div className="flex items-center space-x-4">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    {profile.user_name || 'Trader'}
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium">Verified Account</span>
                </div>
                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-500/20 to-purple-600/20 border border-white/10 flex items-center justify-center">
                  <User className="text-blue-400 w-5 h-5" />
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-xl text-sm font-bold border border-red-500/20 transition-all duration-200 group"
                >
                  <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <Link
                to="/"
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all duration-200"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

