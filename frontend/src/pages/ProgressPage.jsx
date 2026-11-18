import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Award, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import api, { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MasteryStatusBadge, getStatusMeta } from '../components/StatusBadge';
import { PageLoader, ErrorBanner, EmptyState } from '../components/UI';

export default function ProgressPage() {
  const { activeSubjectId } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProgress = useCallback(async () => {
    if (!activeSubjectId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/progress/overview?subjectId=${activeSubjectId}`);
      setData(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load progress analytics.'));
    } finally {
      setLoading(false);
    }
  }, [activeSubjectId]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  if (loading) return <PageLoader message="Calculating longitudinal mastery trajectories..." />;
  if (error) return <ErrorBanner message={error} onRetry={loadProgress} />;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Progress &amp; Gap Closure Tracker</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
          Measure how your knowledge gaps shrink across repeated RAG assessments in{' '}
          <span className="font-semibold text-slate-800">{data?.subject?.name || 'your subject'}</span>.
        </p>
      </div>

      {!activeSubjectId || !data?.subject ? (
        <EmptyState
          icon={TrendingUp}
          title="No progress history yet"
          description="Take diagnostic assessments and complete revision tasks to visualize your mastery growth over time."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            <div className="saas-card p-6">
              <p className="text-xs font-semibold text-slate-500">Overall Mastery</p>
              <p className="mt-3 font-mono text-3xl font-bold text-slate-900 tabular-nums">
                {data.overallMastery !== null ? `${data.overallMastery}%` : '—'}
              </p>
              <p className="mt-1.5 text-xs text-slate-400">Across diagnosed topics</p>
            </div>
            <div className="saas-card p-6">
              <p className="text-xs font-semibold text-slate-500">Revision Completion</p>
              <p className="mt-3 font-mono text-3xl font-bold text-indigo-600 tabular-nums">
                {data.revisionCompletionPct}%
              </p>
              <p className="mt-1.5 text-xs text-slate-400">
                {data.completedRevisionTasks} of {data.totalRevisionTasks} tasks done
              </p>
            </div>
            <div className="saas-card p-6">
              <p className="text-xs font-semibold text-slate-500">Improved Topics</p>
              <p className="mt-3 font-mono text-3xl font-bold text-emerald-600 tabular-nums">
                {data.improvedTopics?.length || 0}
              </p>
              <p className="mt-1.5 text-xs text-slate-400">Gained &ge; +5% mastery</p>
            </div>
            <div className="saas-card p-6">
              <p className="text-xs font-semibold text-slate-500">Recovered From Weak</p>
              <p className="mt-3 font-mono text-3xl font-bold text-emerald-600 tabular-nums">
                {data.previouslyWeakTopics?.length || 0}
              </p>
              <p className="mt-1.5 text-xs text-slate-400">Moved out of weak tier</p>
            </div>
          </div>

          {data.improvedTopics?.length > 0 && (
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/45 p-6">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-emerald-600" />
                <h2 className="text-base font-bold text-emerald-950">Measurable Gap Reduction Highlights</h2>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.improvedTopics.map((t) => (
                  <div key={t.topicId} className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-900">{t.topicName}</span>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-800">
                        +{t.delta}%
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-700">
                      {t.trajectory.map((pt, idx) => (
                        <React.Fragment key={idx}>
                          <span
                            className={`rounded-md px-2 py-1 font-semibold ${
                              idx === t.trajectory.length - 1
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {pt.score}%
                          </span>
                          {idx < t.trajectory.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-slate-400" />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="saas-card p-6 sm:p-7">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Assessment Score Trend</h2>
            <p className="mt-0.5 text-sm text-slate-500">Chronological performance across completed RAG assessments</p>
            <div className="mt-6 h-72">
              {data.assessmentTrends?.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.assessmentTrends} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748B' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748B' }} unit="%" />
                    <Tooltip
                      formatter={(val) => [`${val}%`, 'Score']}
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
                      fill="url(#scoreGrad)"
                      dot={{ r: 5, fill: '#4F46E5', strokeWidth: 2, stroke: '#FFFFFF' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Complete assessments to see your score trend chart.
                </div>
              )}
            </div>
          </div>

          <div className="saas-card p-6 sm:p-7">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Topic-Wise Mastery Progression</h2>
            <p className="mt-0.5 text-sm text-slate-500">Every recorded mastery checkpoint per syllabus topic</p>
            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              {(data.topicTrajectories || []).map((t) => (
                <div key={t.topicId} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{t.topicName}</span>
                      <MasteryStatusBadge status={t.status} compact />
                    </div>
                    <span className="font-mono text-base font-bold text-slate-900 tabular-nums">
                      {t.currentMastery !== null ? `${t.currentMastery}%` : '—'}
                    </span>
                  </div>

                  <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-slate-200/80">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${t.currentMastery ?? 0}%`,
                        backgroundColor: getStatusMeta(t.status).bar,
                      }}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-slate-500">
                      {t.trajectory.length > 0 ? (
                        t.trajectory.map((pt, i) => (
                          <React.Fragment key={i}>
                            <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-slate-700 shadow-sm">
                              {pt.score}%
                            </span>
                            {i < t.trajectory.length - 1 && <span>→</span>}
                          </React.Fragment>
                        ))
                      ) : (
                        <span>No checkpoints yet</span>
                      )}
                    </div>
                    <button
                      onClick={() => navigate(`/assessments?topicId=${t.topicId}`)}
                      className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Retake Quiz
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {data.assessmentTrends?.length > 0 && (
            <div className="saas-card overflow-hidden">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-bold tracking-tight text-slate-900">Completed Assessments Log</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-6 py-3.5">Assessment</th>
                      <th className="px-5 py-3.5">Difficulty</th>
                      <th className="px-5 py-3.5">Score</th>
                      <th className="px-5 py-3.5">Date</th>
                      <th className="px-6 py-3.5 text-right">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...data.assessmentTrends].reverse().map((a) => (
                      <tr key={a.id} className="transition hover:bg-slate-50/70">
                        <td className="px-6 py-4 font-semibold text-slate-900">{a.title}</td>
                        <td className="px-5 py-4 capitalize text-slate-500">{a.difficulty}</td>
                        <td className="px-5 py-4 font-mono font-bold text-slate-900">
                          {a.score}% ({a.correctCount}/{a.totalQuestions})
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">
                          {new Date(a.date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => navigate(`/assessments?reviewId=${a.id}`)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
