import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ListChecks,
  RefreshCw,
  Clock,
  BookOpen,
  Sparkles,
  CheckCircle2,
  Circle,
  PlayCircle,
} from 'lucide-react';
import api, { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { PriorityBadge } from '../components/StatusBadge';
import { PageLoader, ErrorBanner, EmptyState } from '../components/UI';

export default function RevisionPage() {
  const { activeSubjectId, activeSubject } = useAuth();
  const navigate = useNavigate();

  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadPlan = useCallback(async () => {
    if (!activeSubjectId) {
      setPlan(null);
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/revision/plan?subjectId=${activeSubjectId}`);
      setPlan(data.plan);
      setTasks(data.tasks || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load revision plan.'));
    } finally {
      setLoading(false);
    }
  }, [activeSubjectId]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const handleRefresh = async () => {
    if (!activeSubjectId) return;
    setRefreshing(true);
    setError('');
    try {
      const { data } = await api.post('/revision/plan/refresh', { subjectId: activeSubjectId });
      setPlan(data.plan);
      setTasks(data.tasks || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not refresh revision plan.'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleToggleActivity = async (task, actIdx) => {
    const updatedActivities = task.activities.map((a, idx) => (idx === actIdx ? { ...a, done: !a.done } : a));
    try {
      const { data } = await api.patch(`/revision/tasks/${task._id}`, { activities: updatedActivities });
      setTasks((prev) => prev.map((t) => (t._id === task._id ? data.task : t)));
      if (data.plan) setPlan(data.plan);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update checklist item.'));
    }
  };

  const handleSetStatus = async (task, nextStatus) => {
    try {
      const { data } = await api.patch(`/revision/tasks/${task._id}`, { status: nextStatus });
      setTasks((prev) => prev.map((t) => (t._id === task._id ? data.task : t)));
      if (data.plan) setPlan(data.plan);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update task status.'));
    }
  };

  if (loading) return <PageLoader message="Building your personalized revision plan..." />;

  const activeTasks = tasks.filter((t) => t.status !== 'completed');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const totalRemainingMin = activeTasks.reduce((acc, t) => acc + (t.suggestedDurationMinutes || 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Personalized Revision Plan</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
            Dynamically prioritized for{' '}
            <span className="font-semibold text-slate-800">{activeSubject?.name || 'your subject'}</span> based on
            your latest diagnostic gaps. Completed milestones are always preserved.
          </p>
        </div>

        {activeSubjectId && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="saas-btn-secondary shrink-0 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Recommendations'}
          </button>
        )}
      </div>

      <ErrorBanner message={error} onRetry={loadPlan} />

      {!activeSubjectId ? (
        <EmptyState
          icon={ListChecks}
          title="No subject selected"
          description="Select or create a subject to view its dynamic revision plan."
        />
      ) : (
        <>
          {plan && (
            <div className="saas-card p-6 sm:p-7">
              <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
                <div className="space-y-1.5">
                  <h2 className="text-lg font-bold tracking-tight text-slate-900">{plan.title}</h2>
                  <p className="text-sm text-slate-600">{plan.summary}</p>
                  <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-indigo-500" />
                      <strong>{totalRemainingMin} min</strong> estimated remaining study time
                    </span>
                    <span>•</span>
                    <span>
                      <strong>{completedTasks.length}</strong> of <strong>{tasks.length}</strong> tasks finished
                    </span>
                  </div>
                </div>
                <div className="shrink-0 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-5 py-3.5 text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Plan Completion</p>
                  <p className="mt-0.5 font-mono text-3xl font-bold text-indigo-600 tabular-nums">
                    {plan.overallProgress}%
                  </p>
                </div>
              </div>
              <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                  style={{ width: `${plan.overallProgress}%` }}
                />
              </div>
            </div>
          )}

          {tasks.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="No revision tasks queued yet"
              description="Complete a diagnostic RAG assessment first so GapFinder AI can identify your weak concepts and build a tailored plan."
              action={
                <button onClick={() => navigate('/assessments')} className="saas-btn-primary">
                  Take Diagnostic Assessment
                </button>
              }
            />
          ) : (
            <div className="space-y-8">
              {activeTasks.length > 0 && (
                <div className="space-y-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Active Priority Queue ({activeTasks.length})
                  </h3>
                  {activeTasks.map((task) => (
                    <div key={task._id} className="saas-card p-6 sm:p-7">
                      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <PriorityBadge priority={task.priority} />
                            <h4 className="text-base font-bold text-slate-900">{task.topicName}</h4>
                            {task.currentMastery !== null && (
                              <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700">
                                {task.currentMastery}% → Target {task.targetMastery}%
                              </span>
                            )}
                          </div>
                          <p className="max-w-3xl text-sm leading-relaxed text-slate-600">{task.reason}</p>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                          <button
                            onClick={() => navigate(`/assessments?topicId=${task.topicId}`)}
                            className="saas-btn-primary px-4 py-2 text-xs"
                          >
                            <Sparkles className="h-3.5 w-3.5" /> Start Topic Quiz
                          </button>
                          <button
                            onClick={() =>
                              handleSetStatus(task, task.status === 'in_progress' ? 'completed' : 'in_progress')
                            }
                            className="saas-btn-secondary px-3.5 py-2 text-xs"
                          >
                            {task.status === 'in_progress' ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Mark Complete
                              </>
                            ) : (
                              <>
                                <PlayCircle className="h-3.5 w-3.5 text-indigo-600" /> Start Session
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          Suggested duration: <strong className="text-slate-800">{task.suggestedDurationMinutes} min</strong>
                        </span>
                        {task.recommendedMaterial?.documentName && (
                          <span className="inline-flex items-center gap-1.5">
                            <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
                            Study material:{' '}
                            <strong className="text-slate-800">{task.recommendedMaterial.documentName}</strong>
                            {task.recommendedMaterial.sectionRef ? ` (${task.recommendedMaterial.sectionRef})` : ''}
                          </span>
                        )}
                      </div>

                      {task.activities?.length > 0 && (
                        <div className="mt-5 space-y-2 rounded-xl border border-slate-200/70 bg-slate-50/70 p-4">
                          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Action Checklist
                          </p>
                          {task.activities.map((act, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleToggleActivity(task, idx)}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white"
                            >
                              {act.done ? (
                                <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-emerald-600" />
                              ) : (
                                <Circle className="h-[18px] w-[18px] shrink-0 text-slate-300" />
                              )}
                              <span className={act.done ? 'text-slate-400 line-through' : 'text-slate-700'}>
                                {act.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {completedTasks.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    Completed Revision Milestones ({completedTasks.length})
                  </h3>
                  {completedTasks.map((task) => (
                    <div
                      key={task._id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/35 p-5"
                    >
                      <div className="flex items-start gap-3.5">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-900">{task.topicName}</p>
                          <p className="text-xs leading-relaxed text-slate-600">{task.reason}</p>
                          {task.completedAt && (
                            <p className="text-[11px] font-medium text-emerald-700">
                              Completed on {new Date(task.completedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleSetStatus(task, 'pending')}
                        className="saas-btn-secondary px-3 py-1.5 text-xs"
                      >
                        Reopen
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
