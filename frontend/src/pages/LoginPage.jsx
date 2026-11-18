import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Target,
  ArrowRight,
  FlaskConical,
  CheckCircle2,
  Sparkles,
  BookOpen,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';

export default function LoginPage() {
  const { login, demoLogin } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      if (err?.response?.status === 404 && err?.response?.data?.userNotFound) {
        const notFoundEmail = err.response.data.email || email.trim();
        navigate('/register', {
          state: {
            prefillEmail: notFoundEmail,
            notice: `No account found for ${notFoundEmail}. Please create an account to continue.`,
          },
        });
        return;
      }
      setError(getErrorMessage(err, 'Username or password is wrong.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemo = async () => {
    setError('');
    setDemoLoading(true);
    try {
      await demoLogin();
      navigate('/');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start sample student session.'));
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Left Value & Diagnostic Preview Panel */}
      <div className="hidden w-[48%] flex-col justify-between border-r border-slate-200/80 bg-white px-14 py-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-[0_2px_12px_rgba(79,70,229,0.3)]">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-slate-900">GapFinder AI</span>
            <p className="text-[11px] font-medium text-slate-400">Knowledge Gap Detection Platform</p>
          </div>
        </div>

        <div className="max-w-lg space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" />
              Built for Students Who Don&apos;t Want to Miss Important Topics
            </div>
            <h1 className="text-4xl font-bold leading-[1.15] tracking-tight text-slate-900">
              Discover what you <span className="text-indigo-600">don&apos;t know</span> — before exam day.
            </h1>
            <p className="text-[15px] leading-relaxed text-slate-600">
              GapFinder AI doesn&apos;t just answer questions. It analyzes your syllabus, generates cited RAG
              assessments, diagnoses exact conceptual blind spots, and adapts your revision plan automatically.
            </p>
          </div>

          {/* Mini Live Product Preview Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Sample Diagnostic Snapshot · CS201
              </span>
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                Live RAG Tracking
              </span>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-red-200/80 bg-white px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">Binary Trees &amp; BSTs</p>
                    <p className="text-[11px] text-slate-500">Repeated BST vs Binary Tree confusion</p>
                  </div>
                </div>
                <span className="rounded-full bg-red-50 px-2.5 py-1 font-mono text-xs font-bold text-red-700">
                  17% · Critical
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-emerald-200/80 bg-white px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">Linked Lists Recovery</p>
                    <p className="text-[11px] text-slate-500">33% → 54% → 79% after targeted revision</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-mono text-xs font-bold text-emerald-700">
                  +46% Lift
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 text-sm text-slate-600">
            {[
              'Real vector retrieval over your PDFs, DOCX, and lecture notes',
              'Pinpoints every important concept you missed with evidence guardrails',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <BookOpen className="h-3.5 w-3.5" />
          <span>Persisted in MongoDB Atlas · Modular Python FastAPI RAG Engine</span>
        </div>
      </div>

      {/* Right Auth Form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <Target className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold text-slate-900">GapFinder AI</span>
          </div>

          <div className="saas-card p-8 sm:p-9">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Welcome</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Sign in to access your diagnostics, study materials, and revision plan.
            </p>

            {error && (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Email address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  className="saas-input"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="saas-input"
                />
              </div>

              <button type="submit" disabled={submitting} className="saas-btn-primary w-full py-3">
                <span>{submitting ? 'Logging in...' : 'Login'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <div className="my-7 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Explore Sample Profile
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <button
              type="button"
              onClick={handleDemo}
              disabled={demoLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100/80 disabled:opacity-60"
            >
              <FlaskConical className="h-4 w-4" />
              <span>{demoLoading ? 'Loading Sample Student Workspace...' : 'Try Sample Student Account'}</span>
            </button>
            <p className="mt-2.5 text-center text-xs text-slate-400">
              Preloaded with Data Structures syllabus, indexed notes &amp; gap diagnosis.
            </p>

            <p className="mt-7 text-center text-sm text-slate-600">
              New to GapFinder AI?{' '}
              <Link to="/register" className="font-semibold text-indigo-600 hover:text-indigo-700">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
