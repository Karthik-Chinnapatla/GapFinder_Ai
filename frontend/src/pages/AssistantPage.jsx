import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Send, BookOpen, Trash2, Sparkles, ShieldCheck, AlertCircle } from 'lucide-react';
import api, { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PageLoader, ErrorBanner, EmptyState } from '../components/UI';

const QUICK_PROMPTS = [
  'Explain the difference between a Binary Tree and a Binary Search Tree',
  'Summarize the Circular Queue overflow condition from my notes',
  'Compare BFS and DFS graph traversals and their complexities',
  'What is the worst-case complexity of Quick Sort vs Merge Sort?',
];

export default function AssistantPage() {
  const { activeSubjectId, activeSubject } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  const loadHistory = useCallback(async () => {
    if (!activeSubjectId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/chat/history?subjectId=${activeSubjectId}`);
      setMessages(data.messages || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load chat history.'));
    } finally {
      setLoading(false);
    }
  }, [activeSubjectId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const sendMessage = async (textOverride = null) => {
    const text = (textOverride ?? input).trim();
    if (!text || !activeSubjectId || sending) return;

    setInput('');
    setError('');
    setSending(true);

    const tempId = `temp_${Date.now()}`;
    setMessages((prev) => [...prev, { _id: tempId, role: 'user', message: text }]);

    try {
      const { data } = await api.post('/chat/message', {
        subjectId: activeSubjectId,
        message: text,
      });
      setMessages((prev) => [
        ...prev.filter((m) => m._id !== tempId),
        data.userMessage,
        data.assistantMessage,
      ]);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      setError(getErrorMessage(err, 'Failed to get RAG study response.'));
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm('Clear chat history for this subject?')) return;
    try {
      await api.delete(`/chat/history?subjectId=${activeSubjectId}`);
      setMessages([]);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not clear history.'));
    }
  };

  if (loading) return <PageLoader message="Loading grounded study assistant..." />;

  return (
    <div className="flex h-[calc(100vh-9.5rem)] flex-col space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">AI Study Assistant (RAG)</h1>
          <p className="text-sm text-slate-500">
            Source-cited concept tutor grounded strictly in your uploaded{' '}
            <span className="font-semibold text-slate-800">{activeSubject?.name || 'subject'}</span> documents.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="saas-btn-secondary py-2 text-xs hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear History
          </button>
        )}
      </div>

      <ErrorBanner message={error} onRetry={loadHistory} />

      {!activeSubjectId ? (
        <EmptyState
          icon={Sparkles}
          title="No subject selected"
          description="Select or create a subject and upload study materials to ask source-cited questions."
        />
      ) : (
        <div className="saas-card flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-lg font-bold text-slate-900">
                  Ask anything from your {activeSubject?.name} notes
                </h2>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
                  Every reply retrieves matching chunks from MongoDB and attaches exact document &amp; section
                  citations.
                </p>
                <div className="mt-6 flex max-w-2xl flex-wrap justify-center gap-2.5">
                  {QUICK_PROMPTS.map((qp) => (
                    <button
                      key={qp}
                      onClick={() => sendMessage(qp)}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-xs font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50/50"
                    >
                      {qp}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m._id}
                  className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-5 py-4 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'border border-slate-200/80 bg-slate-50/75 text-slate-800'
                    }`}
                  >
                    {m.role === 'assistant' && (
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        {m.grounded ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700">
                            <ShieldCheck className="h-4 w-4" /> Grounded in your uploaded materials
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-amber-700">
                            <AlertCircle className="h-4 w-4" /> No matching source found in uploaded files
                          </span>
                        )}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{m.message}</div>

                    {m.role === 'assistant' && m.citations?.length > 0 && (
                      <div className="mt-4 space-y-2.5 border-t border-slate-200/80 pt-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                          Retrieved Citations ({m.citations.length})
                        </p>
                        {m.citations.map((c, idx) => (
                          <div key={idx} className="rounded-xl border border-indigo-100 bg-white p-3.5 text-xs shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-900">
                                <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
                                {c.documentName}
                                {c.sectionTitle ? ` · ${c.sectionTitle}` : ''}
                                {c.pageNumber ? ` · Page ${c.pageNumber}` : ''}
                              </span>
                              {c.relevanceScore > 0 && (
                                <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-700">
                                  {Math.round(c.relevanceScore * 100)}%
                                </span>
                              )}
                            </div>
                            {c.excerpt && (
                              <p className="mt-2 line-clamp-2 italic leading-relaxed text-slate-500">
                                &ldquo;{c.excerpt}&rdquo;
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {sending && (
              <div className="flex items-start">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-xs font-medium text-slate-500">
                  Searching vector embeddings and grounding answer...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex items-center gap-3 border-t border-slate-100 bg-white p-4"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about ${activeSubject?.name || 'your study materials'}...`}
              className="saas-input flex-1 py-3"
            />
            <button type="submit" disabled={!input.trim() || sending} className="saas-btn-primary px-5 py-3">
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Ask</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
