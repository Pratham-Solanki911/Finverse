// src/components/ChatPanel.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Send, RefreshCcw, X, Mic, Square, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown'; // --- NEW: Import the library ---

/**
 * Message Bubble Component
 */
const MessageBubble = ({ msg }) => {
  return (
    <div className={`chat-message ${msg.role}`}>
      <div className="chat-bubble">
        {/* --- UPDATED: Use ReactMarkdown --- */}
        <ReactMarkdown
          children={msg.content}
          components={{
            // Customize links to open in a new tab
            a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />,
            // Customize list and item styles if needed
            ul: ({node, ...props}) => <ul className="chat-list" {...props} />,
            li: ({node, ...props}) => <li className="chat-list-item" {...props} />,
          }}
        />
      </div>
    </div>
  );
};

/**
 * Main Chat Panel Component
 */
export default function ChatPanel({ isOpen, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  // ... (useEffect for session ID, history, and scroll remain the same) ...
  // ... (Speech-to-Text logic remains the same) ...
  // ... (handleSend and handleClearHistory logic remains the same) ...

  // --- All existing logic from the previous file ---
  // Effect to generate a session ID on mount
  useEffect(() => {
    const newSessionId = `finverse-session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setSessionId(newSessionId);
  }, []);

  // Effect to fetch history when session ID is set
  useEffect(() => {
    if (!sessionId) return;
    
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/ai/chat/history/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages.map(msg => ({
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: msg.content
            })));
          } else {
            setMessages([
              { role: 'assistant', content: "Hello! I'm Finverse AI. How can I help you today?" }
            ]);
          }
        }
      } catch (err) {
        console.error("Error fetching chat history:", err);
        setError("Could not fetch history.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, [sessionId]);

  // Effect to scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Speech-to-Text Setup ---
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) {
      console.warn("Speech recognition not supported in this browser.");
      return;
    }

    const SpeechRecognition = window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setInput(finalTranscript || interimTranscript);
    };

    recognitionRef.current.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setError(`Speech error: ${event.error}`);
      setIsRecording(false);
    };
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      if (recognitionRef.current) {
        setInput(''); 
        recognitionRef.current.start();
        setIsRecording(true);
        setError(null);
      } else {
        setError("Speech recognition is not available.");
      }
    }
  };

  // --- Chat Logic ---
  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || !sessionId || isLoading) return;

    const userMessage = { role: 'user', content: trimmedInput };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    // Add assistant placeholder
    setMessages(prev => [...prev, { role: 'assistant', content: '', isLoading: true }]);

    try {
      const response = await fetch(`/api/ai/chat?session_id=${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          model: 'gemini-flash-lite-latest',
          messages: newMessages.map(msg => ({ role: msg.role, content: msg.content })),
          // You can pass context here later
          // watched_instruments: [], 
          // recent_news: {},
        })
      });

      if (!response.body) throw new Error("Response body is null.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = '';
      let fullResponse = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          if (line.startsWith('data: ')) {
            const dataChunk = line.substring(6);
            
            try {
              const json = JSON.parse(dataChunk);
              
              if (json.error) {
                setError(json.error);
                break;
              }
              if (json.content === '[DONE]') {
                break;
      }
              if (json.content) {
                fullResponse += json.content;
                // Update the last message (the placeholder)
                setMessages(prev => [
                  ...prev.slice(0, -1),
                  { role: 'assistant', content: fullResponse, isLoading: true }
                ]);
              }
            } catch (e) {
              console.warn("Error parsing stream JSON:", e, dataChunk);
            }
          }
        }
        streamBuffer = lines[lines.length - 1]; 
      }
      
      // Finalize the message (remove isLoading flag)
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: fullResponse }
      ]);

    } catch (err) {
      console.error("Chat fetch error:", err);
      const errText = `Sorry, I encountered an error: ${err.message}`;
      setError(errText);
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: errText }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!sessionId || !confirm("Are you sure you want to clear this chat?")) return;
    
    try {
      await fetch(`/api/ai/chat/history/${sessionId}`, { method: 'DELETE' });
      setMessages([
        { role: 'assistant', content: "Chat history cleared. How can I help?" }
      ]);
      setError(null);
    } catch (err) {
      console.error("Error clearing history:", err);
      setError("Could not clear history.");
    }
  };
  // --- End of existing logic ---


  if (!isOpen) return null;

  return (
    <div className="chat-panel-backdrop" onClick={onClose}>
      <div className="chat-panel-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="chat-panel-header">
          <h3 className="chat-panel-title">Finverse AI Chat</h3>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleClearHistory} 
              className="chat-panel-icon-btn" 
              title="Clear Chat History"
            >
              <RefreshCcw size={16} />
            </button>
            <button onClick={onClose} className="chat-panel-icon-btn" title="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        
        {/* Messages */}
        <div className="chat-panel-messages" ref={messagesEndRef}>
          {messages.map((msg, index) => (
            msg.isLoading ? (
              <div key={index} className="chat-message assistant">
                <div className="chat-bubble">
                  {msg.content ? (
                    // --- UPDATED: Use ReactMarkdown for streaming content ---
                    <ReactMarkdown children={msg.content} />
                  ) : (
                    <Loader2 size={20} className="animate-spin" />
                  )}
                  
                  {/* Blinking cursor */}
                  {!msg.content && <span className="blinking-cursor"></span>}
                  {msg.content && <span className="blinking-cursor-inline"></span>}
                </div>
              </div>
            ) : (
              <MessageBubble key={index} msg={msg} />
            )
          ))}
          {error && <div className="chat-message-error">{error}</div>}
        </div>
        
        {/* Input Area */}
        <div className="chat-panel-input-area">
          <div className="chat-panel-input-wrapper">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about your watchlist or market trends..."
              className="chat-panel-input"
              rows={1}
            />
            <button 
              onClick={toggleRecording} 
              className={`chat-panel-icon-btn small ${isRecording ? 'recording' : ''}`}
              title={isRecording ? "Stop Recording" : "Record Voice"}
            >
              {isRecording ? <Square size={16} /> : <Mic size={16} />}
            </button>
          </div>
          <button 
            onClick={handleSend} 
            className="chat-panel-send-btn" 
            disabled={isLoading || input.trim().length === 0}
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}

