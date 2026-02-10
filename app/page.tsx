'use client';

import { useChat } from 'ai/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';

interface SyncStatus {
  sheetsConfigured: boolean;
  totalPilots: number;
  availablePilots: number;
  totalDrones: number;
  availableDrones: number;
  totalMissions: number;
  activeMissions: number;
  lastSync: string | null;
}

const SUGGESTED_PROMPTS = [
  { text: 'Show all available pilots', full: 'Show me all available pilots with their skills and locations.' },
  { text: 'Drone fleet status', full: 'Give me a complete overview of the drone fleet status and availability.' },
  { text: 'Mission overview', full: 'Show me all current missions with their assignment status and priorities.' },
  { text: 'Run conflict detection', full: 'Run a full conflict detection scan on all current assignments.' },
  { text: 'Best match for PRJ001', full: 'Find the best pilot and drone match for mission PRJ001.' },
  { text: 'Urgent reassignment', full: 'Pilot P002 (Neha) has called in sick. Handle the urgent reassignment for her missions.' },
];

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages, setInput } =
    useChat({ api: '/api/chat' });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fetch sync status on mount
  useEffect(() => {
    fetch('/api/sync')
      .then((r) => r.json())
      .then((data) => setSyncStatus(data))
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  const handleTextAreaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(e);
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
    },
    [handleInputChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.trim() && !isLoading) {
          handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
          if (inputRef.current) {
            inputRef.current.style.height = 'auto';
          }
        }
      }
    },
    [input, isLoading, handleSubmit]
  );

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      setInput(prompt);
      setTimeout(() => {
        const form = document.querySelector('form');
        if (form) {
          form.requestSubmit();
        }
      }, 100);
    },
    [setInput]
  );

  const handleClearChat = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  const handleSync = useCallback(async () => {
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pull' }),
      });
      const data = await res.json();
      if (data.success) {
        const statusRes = await fetch('/api/sync');
        const statusData = await statusRes.json();
        setSyncStatus(statusData);
      }
    } catch {
      // silent fail for sync
    }
  }, []);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - Stats Panel */}
      <div
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } transition-all duration-300 overflow-hidden bg-white border-r border-gray-200 flex-shrink-0`}
      >
        <div className="w-64 p-5 h-full flex flex-col">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Operations Dashboard
          </h3>

          {syncStatus ? (
            <div className="space-y-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 font-medium">Pilots</p>
                <p className="text-sm font-semibold text-gray-800">{syncStatus.availablePilots}/{syncStatus.totalPilots} available</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 font-medium">Drones</p>
                <p className="text-sm font-semibold text-gray-800">{syncStatus.availableDrones}/{syncStatus.totalDrones} available</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 font-medium">Missions</p>
                <p className="text-sm font-semibold text-gray-800">{syncStatus.activeMissions} active of {syncStatus.totalMissions}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 font-medium">Google Sheets</p>
                <p className="text-sm font-semibold text-gray-800">{syncStatus.sheetsConfigured ? 'Connected' : 'Not configured'}</p>
              </div>

              {syncStatus.lastSync && (
                <p className="text-xs text-gray-400 mt-2">
                  Last sync: {new Date(syncStatus.lastSync).toLocaleTimeString()}
                </p>
              )}

              <button
                onClick={handleSync}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
              >
                <RotateCcw size={14} />
                Sync Now
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="header-gradient text-white shadow-lg flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Toggle sidebar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
              </button>
              <h1 className="text-lg font-bold leading-tight">Skylark Agent</h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleClearChat}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Clear chat"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <WelcomeScreen onPromptClick={handleSuggestedPrompt} />
          ) : (
            <div className="max-w-4xl mx-auto px-4 py-6">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isLoading && (
                <div className="flex items-start gap-3 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Sparkles size={16} className="text-white" />
                  </div>
                  <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-blue-400 rounded-full typing-dot" />
                      <div className="w-2 h-2 bg-blue-400 rounded-full typing-dot" />
                      <div className="w-2 h-2 bg-blue-400 rounded-full typing-dot" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-white/80 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto px-4 py-3">
            {messages.length > 0 && (
              <div className="flex gap-2 mb-2 overflow-x-auto pb-1 scrollbar-hide">
                {SUGGESTED_PROMPTS.slice(0, 4).map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestedPrompt(prompt.full)}
                    className="flex-shrink-0 text-xs px-3 py-1.5 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 text-gray-600 rounded-full transition-colors whitespace-nowrap"
                    disabled={isLoading}
                  >
                    {prompt.text}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleTextAreaChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Skylark Agent anything about pilots, drones, or missions..."
                  rows={1}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm placeholder:text-gray-400 transition-all"
                  style={{ maxHeight: '200px' }}
                  disabled={isLoading}
                />
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- COMPONENTS ----

function WelcomeScreen({ onPromptClick }: { onPromptClick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome to Skylark Agent</h2>
      <p className="text-gray-500 text-center max-w-md mb-8">
        Your AI-powered Drone Operations Coordinator. I can help you manage pilots, drones, missions, and detect conflicts.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl w-full">
        {SUGGESTED_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            onClick={() => onPromptClick(prompt.full)}
            className="flex items-center px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-all text-left group shadow-sm"
          >
            <span className="text-sm text-gray-700 group-hover:text-blue-700 font-medium">
              {prompt.text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: { role: string; content: string; id: string } }) {
  const isUser = message.role === 'user';

  if (!message.content) return null;

  return (
    <div className={`flex items-start gap-3 mb-6 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isUser
            ? 'bg-gray-700 text-white'
            : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
        }`}
      >
        {isUser ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        ) : (
          <Sparkles size={16} />
        )}
      </div>

      {/* Message content */}
      <div
        className={`max-w-[85%] ${
          isUser
            ? 'bg-blue-600 text-white rounded-2xl rounded-tr-md px-4 py-3'
            : 'bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm border border-gray-100'
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="chat-message text-sm text-gray-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
