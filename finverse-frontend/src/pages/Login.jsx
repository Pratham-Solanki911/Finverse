import React from 'react';
import { ShieldCheck, TrendingUp, BarChart3, ArrowRight } from 'lucide-react';

const Login = () => {
  const handleLogin = () => {
    // Redirect to the backend authorization endpoint
    window.location.href = '/api/auth/authorize';
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#0f172a]">
      {/* Dynamic Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Main Content Card */}
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          {/* Logo/Brand Section */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg mb-4">
              <TrendingUp className="text-white w-10 h-10" />
            </div>
            <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2">Finverse</h1>
            <p className="text-gray-400 text-center font-medium">Your Ultimate Trading Companion</p>
          </div>

          {/* Features Section */}
          <div className="space-y-4 mb-10">
            <div className="flex items-start space-x-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all duration-300">
              <div className="bg-blue-500/20 p-2 rounded-lg">
                <BarChart3 className="text-blue-400 w-5 h-5" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">Live Market Insights</h3>
                <p className="text-gray-400 text-xs mt-1">Real-time data and advanced analytics at your fingertips.</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all duration-300">
              <div className="bg-purple-500/20 p-2 rounded-lg">
                <ShieldCheck className="text-purple-400 w-5 h-5" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">Secure Connectivity</h3>
                <p className="text-gray-400 text-xs mt-1">Direct integration with Upstox for safe and fast execution.</p>
              </div>
            </div>
          </div>

          {/* Login Button */}
          <button
            onClick={handleLogin}
            className="group relative w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-500/20 transition-all duration-300 flex items-center justify-center overflow-hidden"
          >
            <div className="absolute inset-0 w-3 bg-white/20 -skew-x-12 -translate-x-10 group-hover:translate-x-96 transition-all duration-1000"></div>
            <span>Connect with Upstox</span>
            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>

          {/* Footer Info */}
          <p className="mt-8 text-center text-xs text-gray-500 leading-relaxed">
            By connecting, you agree to our <span className="text-gray-400 underline cursor-pointer hover:text-white transition-colors">Terms of Service</span> and <span className="text-gray-400 underline cursor-pointer hover:text-white transition-colors">Privacy Policy</span>.
          </p>
        </div>

        {/* Floating Badges (Premium touch) */}
        <div className="mt-8 flex justify-center space-x-6">
          <div className="flex items-center space-x-2 text-gray-400 text-xs font-semibold bg-white/5 px-4 py-2 rounded-full border border-white/10">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
            <span>System Online</span>
          </div>
          <div className="flex items-center space-x-2 text-gray-400 text-xs font-semibold bg-white/5 px-4 py-2 rounded-full border border-white/10">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>Bank-Grade Security</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

