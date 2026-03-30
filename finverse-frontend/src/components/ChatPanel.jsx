// src/components/ChatPanel.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Send, RefreshCcw, X, Mic, Square, Loader2, MessageSquare, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

/**
 * Message Bubble Component
 */
const MessageBubble = ({ msg }) => {
  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-sm ${
        msg.role === 'user' 
          ? 'bg-blue-600 text-white rounded-tr-none' 
          : 'bg-white/10 text-gray-200 border border-white/10 rounded-tl-none backdrop-blur-md'
      }`}>
        <ReactMarkdown
          components={{
            a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline" />,
            ul: ({ node, ...props }) => <ul className="list-disc ml-4 space-y-1 my-2" {...props} />,
            li: ({ node, ...props }) => <li className="text-inherit" {...props} />,
            p: ({ node, ...props }) => <p className="leading-relaxed" {...props} />,
            code: ({ node, ...props }) => <code className="bg-black/30 px-1 rounded text-blue-300" {...props} />,
          }}
        >
          {msg.content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default function ChatPanel({ watchedInstruments = [], recentNews = {} }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hello! I'm Finverse AI. Ask me anything about the markets or symbols you're watching." }
  ]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const id = `sess-${Date.now()}`;
    setSessionId(id);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    const userMsg = { role: 'user', content: trimmedInput };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    
    // Placeholder for stream
    setMessages(prev => [...prev, { role: 'assistant', content: '', isLoading: true }]);

    try {
      const response = await fetch(`/api/ai/chat?session_id=${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          watched_instruments: watchedInstruments,
          recent_news: recentNews
        })
      });

      if (!response.body) throw new Error("Stream error");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.content && data.content !== '[DONE]') {
                fullResponse += data.content;
                setMessages(prev => [
                  ...prev.slice(0, -1),
                  { role: 'assistant', content: fullResponse, isLoading: true }
                ]);
              }
            } catch (e) {}
          }
        }
      }

      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: fullResponse }]);
    } catch (err) {
      console.error(err);
      setError("AI unavailable. Try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-6 w-96 h-[550px] panel-glass flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-10 duration-300">
          {/* Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-blue-600/10">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <Sparkles className="text-white w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Finverse Assistant</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                  <span className="text-[10px] text-gray-400 font-medium">Ready to help</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 trading-scrollbar space-y-4">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            {isLoading && !messages[messages.length-1].content && (
              <div className="flex justify-start mb-4">
                <div className="bg-white/5 px-4 py-3 rounded-2xl animate-pulse">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-white/10 bg-white/[0.02]">
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask me something..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              />
              <button 
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="absolute right-2 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:bg-gray-700"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="mt-2 text-[10px] text-gray-500 text-center">
              Powered by Gemini Flash · Real-time Market Access
            </p>
          </div>
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 ${
          isOpen 
            ? 'bg-white/10 border border-white/20 text-white rotate-90 scale-90' 
            : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white hover:scale-110 hover:rotate-12'
        }`}
      >
        {isOpen ? <X size={28} /> : <MessageSquare size={28} />}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-5 w-5 bg-blue-500 flex items-center justify-center text-[10px] font-bold">1</span>
          </span>
        )}
      </button>
    </div>
  );
}


