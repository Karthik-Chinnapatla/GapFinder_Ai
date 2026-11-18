import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Target,
  AlertTriangle,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Info,
  CheckCircle2,
} from 'lucide-react';
import api, { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MasteryStatusBadge, getStatusMeta } from '../components/StatusBadge';
import { PageLoader, ErrorBanner, EmptyState } from '../components/UI';

export default function DiagnosisPage() {
  const { activeSubjectId, updateThresholds } = useAuth();
  const navigate = useNavigate();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showConfig, setShowConfig] = useState(false);
  const [thresholds, setThresholds] = useState({
    criticalMax: 39,
    needsImprovementMax: 59,
    developingMax: 79,
    minAttemptsForDiagnosis: 3,
  });
  const [savingConfig, setSavingConfig] = useState(false);

  const loadReport = useCallback(async () => {
    if (!activeSubjectId) {
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/diagnosis/report?subjectId=${activeSubjectId}`);
      setReport(data);
      if (data.thresholds) setThresholds(data.thresholds);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load diagnostic report.'));
    } finally {
      setLoading(false);
    }
  }, [activeSubjectId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleSaveThresholds = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    setError('');
    try {
      await updateThresholds(thresholds);
      await loadReport();
      setShowConfig(false);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save thresholds.'));
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) return <PageLoader message="Running topic-level knowledge gap diagnosis..." />;

  const summary = report?.summary || {};
  const topics = report?.topics || [];
  const weakTopics = [
    ...(report?.buckets?.critical_weakness || []),
    ...(report?.buckets?.needs_improvement || []),
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
            <Target className="h-3.5 w-3.5" /> Flagship Diagnostic Engine
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Knowledge Gap Diagnosis</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
            Topic-level mastery analysis for{' '}
            <span className="font-semibold text-slate-800">{report?.subject?.name || 'your subject'}</span>{' '}
            evaluating accuracy, difficulty weights, repeated conceptual mistakes, and improvement trends.
          </p>
        </div>

        <button onClick={() => setShowConfig((v) => !v)} className="saas-btn-secondary shrink-0 text-xs">
          <SlidersHorizontal className="h-4 w-4" />
          Configure Thresholds
        </button>
      </div>

      <ErrorBanner message={error} onRetry={loadReport} />

      {/* Configurable Thresholds Drawer */}
      {showConfig && (
        <form onSubmit={handleSaveThresholds} className="saas-card border-indigo-200 p-6 sm:p-7">
          <h2 className="text-base font-bold text-slate-900">Configurable Mastery Classification Thresholds</h2>
          <p className="mt-1 text-sm text-slate-500">
            Customize mastery cutoffs and the minimum question attempts required before diagnosing a topic.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-red-700">Critical Max (%)</label>
              <input
                type="number"
                value={thresholds.criticalMax}
                onChange={(e) => setThresholds({ ...thresholds, criticalMax: Number(e.target.value) })}
                className="saas-input font-mono"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-amber-700">Needs Improvement Max (%)</label>
              <input
                type="number"
                value={thresholds.needsImprovementMax}
                onChange={(e) => setThresholds({ ...thresholds, needsImprovementMax: Number(e.target.value) })}
                className="saas-input font-mono"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-indigo-700">Developing Max (%)</label>
              <input
                type="number"
                value={thresholds.developingMax}
                onChange={(e) => setThresholds({ ...thresholds, developingMax: Number(e.target.value) })}
                className="saas-input font-mono"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">Min Attempts to Diagnose</label>
              <input
                type="number"
                min={1}
                max={10}
                value={thresholds.minAttemptsForDiagnosis}
                onChange={(e) => setThresholds({ ...thresholds, minAttemptsForDiagnosis: Number(e.target.value) })}
                className="saas-input font-mono"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setShowConfig(false)} className="saas-btn-secondary text-xs">
              Cancel
            </button>
            <button type="submit" disabled={savingConfig} className="saas-btn-primary text-xs">
              {savingConfig ? 'Reclassifying...' : 'Save & Recalculate'}
            </button>
          </div>
        </form>
      )}

      {!activeSubjectId || topics.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No diagnostic data yet"
          description="Add syllabus topics and complete at least one RAG assessment so GapFinder AI can compute topic mastery."
        />
      ) : (
        <>
          {/* 5 Summary Tier Cards */}
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
            {[
              {
                label: 'Critical Weakness',
                count: summary.criticalCount || 0,
                range: `0–${thresholds.criticalMax}% mastery`,
                accent: 'border-t-red-500',
                numCls: 'text-red-600',
              },
              {
                label: 'Needs Improvement',
                count: summary.needsImprovementCount || 0,
                range: `${thresholds.criticalMax + 1}–${thresholds.needsImprovementMax}% mastery`,
                accent: 'border-t-amber-500',
                numCls: 'text-amber-600',
              },
              {
                label: 'Developing',
                count: summary.developingCount || 0,
                range: `${thresholds.needsImprovementMax + 1}–${thresholds.developingMax}% mastery`,
                accent: 'border-t-indigo-500',
                numCls: 'text-indigo-600',
              },
              {
                label: 'Mastered',
                count: summary.masteredCount || 0,
                range: `${thresholds.developingMax + 1}–100% mastery`,
                accent: 'border-t-emerald-500',
                numCls: 'text-emerald-600',
              },
              {
                label: 'Insufficient Data',
                count: summary.insufficientCount || 0,
                range: `< ${thresholds.minAttemptsForDiagnosis} attempts`,
                accent: 'border-t-slate-400',
                numCls: 'text-slate-700',
              },
            ].map((item) => (
              <div key={item.label} className={`saas-card border-t-[3px] p-5 ${item.accent}`}>
                <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                <p className={`mt-3 font-mono text-3xl font-bold tabular-nums ${item.numCls}`}>{item.count}</p>
                <p className="mt-1.5 text-xs text-slate-400">{item.range}</p>
              </div>
            ))}
          </div>

          {/* Why Weak Topics Are Flagged */}
          {weakTopics.length > 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900">
                  Why These Topics Are Flagged as Knowledge Gaps
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Root-cause conceptual explanations generated from your missed answers
                </p>
              </div>
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {weakTopics.map((t) => {
                  const meta = getStatusMeta(t.status);
                  return (
                    <div key={t._id} className="saas-card flex flex-col justify-between p-6">
                      <div>
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <AlertTriangle
                                className={`h-4 w-4 shrink-0 ${
                                  t.status === 'critical_weakness' ? 'text-red-600' : 'text-amber-600'
                                }`}
                              />
                              <h3 className="text-base font-bold text-slate-900">{t.name}</h3>
                            </div>
                            <p className="text-xs text-slate-400">
                              Chapter {t.chapterOrder}: {t.chapterTitle}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                              {t.masteryScore}%
                            </span>
                            <div className="mt-1.5">
                              <MasteryStatusBadge status={t.status} compact />
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${t.masteryScore ?? 0}%`, backgroundColor: meta.bar }}
                          />
                        </div>

                        <p className="mt-4 rounded-xl border border-slate-200/70 bg-slate-50/80 p-4 text-sm leading-relaxed text-slate-700">
                          {t.diagnosisReason}
                        </p>

                        {t.repeatedMistakes?.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                              Repeated Conceptual Mistakes
                            </p>
                            <ul className="space-y-2">
                              {t.repeatedMistakes.map((m, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50/50 px-3.5 py-2 text-xs text-red-800"
                                >
                                  <span>{m.concept}</span>
                                  <span className="shrink-0 rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-red-700 shadow-sm">
                                    {m.count}×
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                        <span className="text-xs font-medium text-slate-500">
                          {t.correctCount}/{t.totalAttempts} correct ({t.accuracy}% accuracy)
                        </span>
                        <button
                          onClick={() => navigate(`/assessments?topicId=${t._id}`)}
                          className="saas-btn-primary px-4 py-2 text-xs"
                        >
                          <Sparkles className="h-3.5 w-3.5" /> Targeted Retest
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Complete Topic Mastery Matrix */}
          <div className="saas-card overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Complete Topic Mastery Matrix — {report?.subject?.name}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Topics with fewer than {thresholds.minAttemptsForDiagnosis} attempted questions remain in{' '}
                <strong className="text-slate-700">Insufficient Data</strong> to avoid premature misdiagnosis.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-3.5">Topic &amp; Diagnostic Note</th>
                    <th className="px-5 py-3.5">Mastery</th>
                    <th className="px-5 py-3.5">Accuracy</th>
                    <th className="px-5 py-3.5">Trend</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topics.map((t) => (
                    <tr key={t._id} className="transition hover:bg-slate-50/70">
                      <td className="px-6 py-5">
                        <p className="font-semibold text-slate-900">{t.name}</p>
                        <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{t.diagnosisReason}</p>
                      </td>
                      <td className="px-5 py-5">
                        <div className="flex items-center gap-3">
                          <span className="w-11 font-mono text-sm font-bold text-slate-900 tabular-nums">
                            {t.status === 'insufficient_data'
                              ? '—'
                              : t.masteryScore !== null
                              ? `${t.masteryScore}%`
                              : '—'}
                          </span>
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${t.status === 'insufficient_data' ? 0 : t.masteryScore ?? 0}%`,
                                backgroundColor: getStatusMeta(t.status).bar,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-5 font-mono text-xs text-slate-600">
                        {t.totalAttempts > 0 ? `${t.correctCount}/${t.totalAttempts} (${t.accuracy}%)` : '0 attempts'}
                      </td>
                      <td className="px-5 py-5">
                        {t.trendDelta > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            <TrendingUp className="h-3.5 w-3.5" /> +{t.trendDelta}%
                          </span>
                        ) : t.trendDelta < 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
                            <TrendingDown className="h-3.5 w-3.5" /> {t.trendDelta}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Baseline</span>
                        )}
                      </td>
                      <td className="px-5 py-5">
                        <MasteryStatusBadge status={t.status} />
                      </td>
                      <td className="px-6 py-5 text-right">
                        <button
                          onClick={() => navigate(`/assessments?topicId=${t._id}`)}
                          className="rounded-lg border border-indigo-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-indigo-600 shadow-sm transition hover:bg-indigo-50"
                        >
                          {t.status === 'insufficient_data' ? 'Diagnose' : 'Practice'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {report?.buckets?.insufficient_data?.length > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 text-xs leading-relaxed text-slate-600 shadow-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
              <p>
                <strong className="text-slate-900">Evidence Guardrail Active:</strong>{' '}
                {report.buckets.insufficient_data.map((t) => t.name).join(', ')}{' '}
                {report.buckets.insufficient_data.length === 1 ? 'has' : 'have'} fewer than{' '}
                {thresholds.minAttemptsForDiagnosis} evaluated questions and will not be mislabeled until sufficient
                diagnostic evidence is gathered.
              </p>
            </div>
          )}

          {summary.masteredCount > 0 && weakTopics.length === 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span>All diagnosed topics are currently above the weakness threshold!</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
