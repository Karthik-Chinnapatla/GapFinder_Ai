import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  ClipboardCheck,
  Layers,
  ArrowRight,
  Clock,
  Target,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
} from 'recharts';
import api, { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MasteryStatusBadge, PriorityBadge, getStatusMeta } from '../components/StatusBadge';
import { PageLoader, ErrorBanner, EmptyState } from '../components/UI';

function MasteryRing({ score }) {
  const numeric = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : 0;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (numeric / 100) * circumference;
  const strokeColor =
    score === null ? '#CBD5E1' : numeric >= 80 ? '#059669' : numeric >= 60 ? '#4F46E5' : numeric >= 40 ? '#D97706' : '#DC2626';

  return (
    <div className="relative flex h-[86px] w-[86px] shrink-0 items-center justify-center">
      <svg className="-rotate-90 h-[86px] w-[86px]" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="7" />
        <circle
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-lg font-bold tracking-tight text-slate-900">
          {score !== null ? `${score}%` : '—'}
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { activeSubjectId } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = activeSubjectId ? `?subjectId=${activeSubjectId}` : '';
      const res = await api.get(`/dashboard${qs}`);
      setData(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load dashboard data.'));
    } finally {
      setLoading(false);
    }
  }, [activeSubjectId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) return <PageLoader message="Computing live knowledge gap diagnostics..." />;
  if (error) return <ErrorBanner message={error} onRetry={fetchDashboard} />;
  if (!data) return null;

  const {
    student,
    activeSubject,
    stats,
    topicPerformance,
    statusDistribution,
    weakestTopics,
    strongTopics,
    upcomingRevisionTasks,
    recentAssessments,
    progressTrend,
    recommendedAction,
  } = data;

  const pieData = (statusDistribution || []).filter((d) => d.count > 0);
  const horizontalBarData = (topicPerformance || []).map((t) => ({
    name: t.topicName.length > 26 ? `${t.topicName.slice(0, 25)}…` : t.topicName,
    fullName: t.topicName,
    mastery: t.status === 'insufficient_data' ? 0 : t.masteryScore ?? 0,
    status: t.status,
  }));

  return (
    <div className="space-y-8">
      {/* Top Hero Header */}
      <div className="saas-card flex flex-col justify-between gap-6 p-7 lg:flex-row lg:items-center">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
            <Target className="h-3.5 w-3.5" />
            Knowledge Gap Command Center
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Welcome back, {student?.name?.split(' ')[0]}
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-slate-500">
            {activeSubject ? (
              <>
                Diagnosing mastery across <span className="font-semibold text-slate-800">{activeSubject.name}</span>
                {activeSubject.code ? ` (${activeSubject.code})` : ''} using{' '}
                <span className="font-semibold text-slate-700">{stats.indexedDocuments}</span> indexed RAG study{' '}
                {stats.indexedDocuments === 1 ? 'material' : 'materials'}.
              </>
            ) : (
              'Create a subject and upload your study materials to start discovering knowledge gaps.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-6 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-6 py-4">
          <MasteryRing score={stats.overallKnowledgeScore} />
          <div className="space-y-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Overall Readiness</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">
                {stats.overallKnowledgeScore === null
                  ? 'Awaiting first assessment'
                  : stats.overallKnowledgeScore >= 80
                  ? 'Exam-ready mastery'
                  : stats.overallKnowledgeScore >= 60
                  ? 'Solid foundation, gaps remain'
                  : 'Focused gap closure needed'}
              </p>
            </div>
            <div className="flex items-center gap-4 pt-1 text-xs text-slate-500">
              <span>
                Revision plan: <strong className="font-mono text-indigo-600">{stats.revisionProgress ?? 0}%</strong>
              </span>
              <span>•</span>
              <span>
                Weak gaps: <strong className="font-mono text-red-600">{stats.weakTopics}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Next Action */}
      {recommendedAction && (
        <div className="relative overflow-hidden rounded-2xl border border-indigo-200/90 bg-white p-6 shadow-sm">
          <div className="absolute inset-y-0 left-0 w-1.5 bg-indigo-600" />
          <div className="flex flex-col justify-between gap-5 pl-3 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                  Recommended Next Action
                </p>
                <h2 className="text-base font-bold text-slate-900">{recommendedAction.title}</h2>
                <p className="max-w-2xl text-sm leading-relaxed text-slate-600">{recommendedAction.description}</p>
              </div>
            </div>
            <button
              onClick={() => navigate(recommendedAction.ctaPath)}
              className="saas-btn-primary shrink-0 px-5 py-2.5"
            >
              <span>{recommendedAction.ctaLabel}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* 5 KPI Cards */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
        {[
          {
            label: 'Total Subjects',
            value: stats.totalSubjects,
            sub: 'Active courses',
            icon: Layers,
            tint: 'text-indigo-600 bg-indigo-50',
          },
          {
            label: 'Topics Studied',
            value: `${stats.topicsStudied} / ${stats.totalTopics}`,
            sub: 'Syllabus coverage',
            icon: BookOpen,
            tint: 'text-slate-700 bg-slate-100',
          },
          {
            label: 'Topics Mastered',
            value: stats.topicsMastered,
            sub: '80%+ mastery tier',
            icon: CheckCircle2,
            tint: 'text-emerald-600 bg-emerald-50',
          },
          {
            label: 'Weak Topics',
            value: stats.weakTopics,
            sub: 'Need targeted revision',
            icon: AlertTriangle,
            tint: 'text-red-600 bg-red-50',
          },
          {
            label: 'Assessments Done',
            value: stats.assessmentsCompleted,
            sub: 'RAG evaluations',
            icon: ClipboardCheck,
            tint: 'text-indigo-600 bg-indigo-50',
          },
        ].map((card) => (
          <div key={card.label} className="saas-card-interactive p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">{card.label}</span>
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${card.tint}`}>
                <card.icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-4 font-mono text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
              {card.value}
            </p>
            <p className="mt-1.5 text-xs text-slate-400">{card.sub}</p>
          </div>
        ))}
      </div>

      {!activeSubject ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects configured yet"
          description="Set up your first subject and chapters, then upload study materials to activate GapFinder AI diagnostics."
          action={
            <button onClick={() => navigate('/syllabus')} className="saas-btn-primary">
              Create First Subject
            </button>
          }
        />
      ) : (
        <>
          {/* Core Diagnostic Spotlight: Weakest Topics + Mastery Breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="saas-card p-6 sm:p-7 lg:col-span-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">Your Weakest Topics &amp; Why</h2>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Evidence-backed conceptual gaps detected across your assessments
                  </p>
                </div>
                <button
                  onClick={() => navigate('/diagnosis')}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                >
                  Full Diagnosis <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {weakestTopics.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-12 text-center">
                  <Target className="mx-auto h-7 w-7 text-slate-400" />
                  <p className="mt-3 text-sm font-semibold text-slate-700">No weak topics flagged right now</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Run a RAG diagnostic assessment to uncover hidden conceptual blind spots across your syllabus.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {weakestTopics.map((t) => {
                    const meta = getStatusMeta(t.status);
                    return (
                      <div
                        key={t._id}
                        className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 transition hover:border-slate-300 hover:bg-white"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-[15px] font-bold text-slate-900">{t.name}</span>
                            <MasteryStatusBadge status={t.status} compact />
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-mono text-base font-bold text-slate-900 tabular-nums">
                              {t.masteryScore !== null ? `${t.masteryScore}%` : '—'}
                            </span>
                            <button
                              onClick={() => navigate(`/assessments?topicId=${t._id}`)}
                              className="rounded-lg border border-indigo-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-indigo-600 shadow-sm transition hover:bg-indigo-50"
                            >
                              Practice Topic
                            </button>
                          </div>
                        </div>

                        {/* Clean progress bar */}
                        <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${t.masteryScore ?? 0}%`, backgroundColor: meta.bar }}
                          />
                        </div>

                        <p className="mt-3.5 text-sm leading-relaxed text-slate-600">{t.diagnosisReason}</p>

                        {t.repeatedMistakes?.length > 0 && (
                          <div className="mt-3.5 flex flex-wrap gap-2">
                            {t.repeatedMistakes.slice(0, 2).map((m, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200/70 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700"
                              >
                                <span className="font-mono font-bold">{m.count}×</span>
                                <span>{m.concept}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mastery Distribution Donut */}
            <div className="saas-card flex flex-col justify-between p-6 sm:p-7 lg:col-span-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900">Mastery Breakdown</h2>
                <p className="mt-0.5 text-sm text-slate-500">Strong vs. weak syllabus coverage</p>

                <div className="my-5 h-48">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={78}
                          paddingAngle={4}
                        >
                          {pieData.map((entry) => (
                            <Cell key={entry.key} fill={entry.color} stroke="none" />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
                            fontSize: '12px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">
                      Add topics to view breakdown
                    </div>
                  )}
                </div>

                <div className="space-y-2.5">
                  {statusDistribution.map((s) => (
                    <div key={s.key} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2.5 font-medium text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.label}
                      </span>
                      <span className="font-mono font-bold text-slate-900">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {strongTopics.length > 0 && (
                <div className="mt-6 border-t border-slate-100 pt-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    What You Know Well
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {strongTopics.map((t) => (
                      <span
                        key={t._id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t.name} · {t.masteryScore}%
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Charts Row: Horizontal Topic Mastery Bar + Assessment Trend Area Chart */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="saas-card p-6 sm:p-7">
              <div className="mb-5">
                <h2 className="text-lg font-bold tracking-tight text-slate-900">Topic-Wise Mastery</h2>
                <p className="mt-0.5 text-sm text-slate-500">Color-coded across every syllabus topic</p>
              </div>
              <div className="h-72">
                {horizontalBarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={horizontalBarData}
                      layout="vertical"
                      margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} unit="%" />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={150}
                        tick={{ fontSize: 12, fill: '#334155', fontWeight: 500 }}
                      />
                      <Tooltip
                        formatter={(val) => [`${val}%`, 'Mastery']}
                        labelFormatter={(_l, payload) => payload?.[0]?.payload?.fullName || ''}
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid #E2E8F0',
                          boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="mastery" radius={[0, 8, 8, 0]} barSize={20}>
                        {horizontalBarData.map((entry, idx) => (
                          <Cell key={idx} fill={getStatusMeta(entry.status).bar} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    No syllabus topics yet
                  </div>
                )}
              </div>
            </div>

            <div className="saas-card p-6 sm:p-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">Learning Progress Over Time</h2>
                  <p className="mt-0.5 text-sm text-slate-500">Score trajectory across completed quizzes</p>
                </div>
                <button
                  onClick={() => navigate('/progress')}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                >
                  Details <TrendingUp className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="h-72">
                {progressTrend.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={progressTrend} margin={{ top: 10, right: 20, left: -10, bottom: 8 }}>
                      <defs>
                        <linearGradient id="dashTrendGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748B' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} unit="%" />
                      <Tooltip
                        formatter={(val) => [`${val}%`, 'Assessment Score']}
                        labelFormatter={(_l, payload) => payload?.[0]?.payload?.title || ''}
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid #E2E8F0',
                          boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="#4F46E5"
                        strokeWidth={2.5}
                        fill="url(#dashTrendGrad)"
                        dot={{ r: 5, fill: '#4F46E5', strokeWidth: 2, stroke: '#FFFFFF' }}
                        activeDot={{ r: 7 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-sm text-slate-400">
                    <p>Complete your first assessment to plot learning trends.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Row: Upcoming Revision Tasks & Recent Assessments */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="saas-card p-6 sm:p-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">Upcoming Revision Tasks</h2>
                  <p className="mt-0.5 text-sm text-slate-500">Auto-prioritized by severity of your gaps</p>
                </div>
                <button
                  onClick={() => navigate('/revision')}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                >
                  Open Plan <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {upcomingRevisionTasks.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  No pending revision tasks. Complete an assessment to generate personalized tasks.
                </p>
              ) : (
                <div className="space-y-3.5">
                  {upcomingRevisionTasks.map((task) => (
                    <div
                      key={task._id}
                      className="flex items-start justify-between gap-4 rounded-xl border border-slate-200/75 bg-slate-50/60 p-4 transition hover:border-slate-300 hover:bg-white"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <PriorityBadge priority={task.priority} />
                          <span className="truncate text-sm font-bold text-slate-900">{task.topicName}</span>
                        </div>
                        <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">{task.reason}</p>
                        <div className="flex items-center gap-3 pt-0.5 text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" /> {task.suggestedDurationMinutes} min
                          </span>
                          {task.recommendedMaterial?.sectionRef && (
                            <span className="truncate">· {task.recommendedMaterial.sectionRef}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(`/assessments?topicId=${task.topicId}`)}
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600"
                      >
                        Quiz
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="saas-card p-6 sm:p-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">Recent Assessments</h2>
                  <p className="mt-0.5 text-sm text-slate-500">Click any assessment to review RAG citations</p>
                </div>
                <button
                  onClick={() => navigate('/assessments')}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50"
                >
                  All Quizzes <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {recentAssessments.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  No completed assessments yet. Generate your first RAG quiz to begin.
                </p>
              ) : (
                <div className="space-y-3.5">
                  {recentAssessments.map((a) => (
                    <button
                      key={a._id}
                      onClick={() => navigate(`/assessments?reviewId=${a._id}`)}
                      className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200/75 bg-slate-50/60 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50/30"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-bold text-slate-900">{a.title}</p>
                        <p className="text-xs text-slate-500">
                          {a.correctCount}/{a.totalQuestions} correct · <span className="capitalize">{a.difficulty}</span> ·{' '}
                          {a.completedAt ? new Date(a.completedAt).toLocaleDateString() : ''}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-xl px-3 py-1.5 font-mono text-sm font-bold ${
                          a.scorePercentage >= 80
                            ? 'bg-emerald-50 text-emerald-700'
                            : a.scorePercentage >= 60
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {a.scorePercentage}%
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
