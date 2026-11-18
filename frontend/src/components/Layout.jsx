import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  ClipboardCheck,
  Target,
  ListChecks,
  TrendingUp,
  MessageSquare,
  LogOut,
  Menu,
  X,
  Sparkles,
  ChevronDown,
  FlaskConical,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV_GROUPS = [
  {
    title: 'Diagnostics',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/diagnosis', label: 'Knowledge Gaps', icon: Target, badge: 'Core' },
      { to: '/revision', label: 'Revision Plan', icon: ListChecks },
      { to: '/progress', label: 'Progress Tracker', icon: TrendingUp },
    ],
  },
  {
    title: 'Learning & RAG',
    items: [
      { to: '/assessments', label: 'AI Assessments', icon: ClipboardCheck },
      { to: '/materials', label: 'Study Materials', icon: FileText },
      { to: '/syllabus', label: 'Syllabus & Topics', icon: BookOpen },
      { to: '/assistant', label: 'AI Study Assistant', icon: MessageSquare },
    ],
  },
];

const ROUTE_TITLES = {
  '/': 'Dashboard',
  '/diagnosis': 'Knowledge Gap Diagnosis',
  '/revision': 'Personalized Revision Plan',
  '/assessments': 'AI Assessment Engine',
  '/materials': 'Study Materials & RAG',
  '/syllabus': 'Syllabus & Topics',
  '/progress': 'Progress Analytics',
  '/assistant': 'AI Study Assistant',
};

function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'ST';
}

export default function Layout() {
  const { user, subjects, activeSubjectId, selectSubject, logout, welcomeMessage, clearWelcomeMessage } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const currentPageTitle = ROUTE_TITLES[location.pathname] || 'GapFinder AI';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/35 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] shrink-0 flex-col border-r border-slate-200/80 bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex h-[72px] items-center justify-between border-b border-slate-100 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-[0_2px_10px_rgba(79,70,229,0.3)]">
              <Target className="h-[18px] w-[18px]" />
            </div>
            <div>
              <span className="text-[15px] font-bold tracking-tight text-slate-900">GapFinder AI</span>
              <p className="text-[11px] font-medium text-slate-400">Diagnostic Learning OS</p>
            </div>
          </div>
          <button
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Grouped Navigation */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map(({ to, label, icon: Icon, end, badge }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `group relative flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-all ${
                        isActive
                          ? 'bg-indigo-50/90 font-semibold text-indigo-700'
                          : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-indigo-600" />
                        )}
                        <span className="flex items-center gap-3">
                          <Icon
                            className={`h-[17px] w-[17px] ${
                              isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                            }`}
                          />
                          {label}
                        </span>
                        {badge && (
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              isActive
                                ? 'bg-indigo-600 text-white'
                                : 'bg-indigo-50 text-indigo-600'
                            }`}
                          >
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom User Profile */}
        <div className="space-y-3 border-t border-slate-100 p-4">
          {user?.isDemo && (
            <div className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-900">
              <FlaskConical className="h-4 w-4 shrink-0 text-amber-600" />
              <div className="leading-tight">
                <p className="font-semibold">Sample Student Profile</p>
                <p className="mt-0.5 text-[11px] text-amber-700">Practice workspace for students</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-slate-50/70 p-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                {getInitials(user?.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-900">{user?.name}</p>
                <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-4 border-b border-slate-200/80 bg-white/85 px-5 backdrop-blur-md sm:px-8 lg:px-10">
          <div className="flex items-center gap-4">
            <button
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="hidden items-center gap-2.5 md:flex">
              <span className="text-sm font-semibold text-slate-900">{currentPageTitle}</span>
              <span className="text-slate-300">/</span>
            </div>

            {/* Subject Switcher */}
            <div className="relative">
              <select
                id="subject-switcher"
                value={activeSubjectId}
                onChange={(e) => selectSubject(e.target.value)}
                disabled={subjects.length === 0}
                className="appearance-none rounded-xl border border-slate-200 bg-slate-50/70 py-2 pl-3.5 pr-9 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-white focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:text-slate-400"
              >
                {subjects.length === 0 ? (
                  <option value="">No subjects yet</option>
                ) : (
                  subjects.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.code ? `${s.code} · ${s.name}` : s.name}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/assessments')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_1px_2px_rgba(79,70,229,0.3)] transition hover:bg-indigo-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Generate RAG Quiz</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1360px] flex-1 px-5 py-8 sm:px-8 lg:px-10 lg:py-9">
          {welcomeMessage && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{welcomeMessage}</span>
              </div>
              <button
                type="button"
                onClick={clearWelcomeMessage}
                aria-label="Dismiss message"
                className="rounded-lg p-1 text-emerald-700 transition hover:bg-emerald-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
