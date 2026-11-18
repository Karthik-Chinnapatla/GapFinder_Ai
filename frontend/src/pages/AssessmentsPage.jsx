import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Clock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  BookOpen,
  FileText,
  ArrowRight,
  History,
  AlertTriangle,
} from 'lucide-react';
import api, { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MasteryStatusBadge } from '../components/StatusBadge';
import { PageLoader, ErrorBanner, EmptyState } from '../components/UI';

const ALL_Q_TYPES = [
  { id: 'mcq', label: 'Multiple Choice' },
  { id: 'true_false', label: 'True / False' },
  { id: 'short_answer', label: 'Short Answer' },
  { id: 'conceptual', label: 'Conceptual' },
];

export default function AssessmentsPage() {
  const { activeSubjectId, activeSubject } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [syllabus, setSyllabus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [mode, setMode] = useState('builder');

  const [selectedTopicIds, setSelectedTopicIds] = useState([]);
  const [difficulty, setDifficulty] = useState('medium');
  const [questionCount, setQuestionCount] = useState(5);
  const [questionTypes, setQuestionTypes] = useState(['mcq', 'true_false', 'short_answer', 'conceptual']);
  const [enableTimer, setEnableTimer] = useState(true);
  const [timerMinutes, setTimerMinutes] = useState(10);
  const [generating, setGenerating] = useState(false);

  const [activeAssessment, setActiveAssessment] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [reviewData, setReviewData] = useState(null);
  const timerRef = useRef(null);

  const loadBase = useCallback(async () => {
    if (!activeSubjectId) {
      setSyllabus(null);
      setHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [sylRes, histRes] = await Promise.all([
        api.get(`/syllabus/${activeSubjectId}`),
        api.get(`/assessments?subjectId=${activeSubjectId}`),
      ]);
      setSyllabus(sylRes.data);
      setHistory(histRes.data.assessments || []);

      const preTopic = searchParams.get('topicId');
      if (preTopic) setSelectedTopicIds([preTopic]);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load assessment workspace.'));
    } finally {
      setLoading(false);
    }
  }, [activeSubjectId, searchParams]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  useEffect(() => {
    const revId = searchParams.get('reviewId');
    if (revId) openAssessment(revId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (mode !== 'taking') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
      setSecondsLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [mode]);

  const allTopics = (syllabus?.chapters || []).flatMap((ch) =>
    (ch.topics || []).map((t) => ({ ...t, chapterTitle: ch.title, chapterOrder: ch.orderIndex }))
  );

  const toggleTopic = (tid) => {
    setSelectedTopicIds((prev) => (prev.includes(tid) ? prev.filter((x) => x !== tid) : [...prev, tid]));
  };

  const toggleQType = (qt) => {
    setQuestionTypes((prev) => {
      if (prev.includes(qt)) return prev.length > 1 ? prev.filter((x) => x !== qt) : prev;
      return [...prev, qt];
    });
  };

  const handleGenerate = async () => {
    if (!activeSubjectId) return;
    setGenerating(true);
    setError('');
    try {
      const { data } = await api.post('/assessments/generate', {
        subjectId: activeSubjectId,
        topicIds: selectedTopicIds,
        difficulty,
        questionCount: Number(questionCount),
        questionTypes,
        timeLimitMinutes: enableTimer ? Number(timerMinutes) : null,
      });
      setActiveAssessment(data.assessment);
      setQuestions(data.questions || []);
      setAnswers({});
      setCurrentIndex(0);
      setElapsedSeconds(0);
      setSecondsLeft(enableTimer ? Number(timerMinutes) * 60 : null);
      setMode('taking');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not generate assessment. Ensure study materials are indexed.'));
    } finally {
      setGenerating(false);
    }
  };

  const openAssessment = async (assessmentId) => {
    setError('');
    try {
      const { data } = await api.get(`/assessments/${assessmentId}`);
      if (data.assessment.status === 'completed') {
        setReviewData(data);
        setMode('review');
      } else {
        setActiveAssessment(data.assessment);
        setQuestions(data.questions || []);
        setAnswers({});
        setCurrentIndex(0);
        setElapsedSeconds(0);
        setSecondsLeft(data.assessment.timeLimitMinutes ? data.assessment.timeLimitMinutes * 60 : null);
        setMode('taking');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load assessment details.'));
    }
  };

  const handleSubmit = async () => {
    if (!activeAssessment) return;
    setSubmitting(true);
    setError('');
    try {
      const formatted = questions.map((q) => ({
        questionId: q._id,
        selectedAnswer: answers[q._id] || '',
      }));
      const { data } = await api.post(`/assessments/${activeAssessment._id}/submit`, {
        answers: formatted,
        timeSpentSeconds: elapsedSeconds,
      });
      setReviewData(data);
      setMode('review');
      setSearchParams({});
      await loadBase();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to evaluate assessment.'));
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (sec) => {
    if (sec === null) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (loading && mode === 'builder') return <PageLoader message="Preparing RAG Assessment Engine..." />;

  if (mode === 'taking' && activeAssessment && questions.length > 0) {
    const q = questions[currentIndex];
    const answeredCount = Object.values(answers).filter((v) => String(v || '').trim().length > 0).length;
    const progressPct = Math.round(((currentIndex + 1) / questions.length) * 100);

    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="saas-card flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">{activeAssessment.title}</p>
            <p className="mt-1 text-sm text-slate-500">
              Question <strong className="text-slate-900">{currentIndex + 1}</strong> of {questions.length} ·{' '}
              {answeredCount} answered
            </p>
          </div>
          <div className="flex items-center gap-3">
            {secondsLeft !== null && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 font-mono text-xs font-bold ${
                  secondsLeft < 60
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                {formatTime(secondsLeft)}
              </span>
            )}
            <button onClick={handleSubmit} disabled={submitting} className="saas-btn-primary text-xs">
              {submitting ? 'Evaluating & Diagnosing...' : 'Submit Assessment'}
            </button>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-indigo-600 transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>

        <ErrorBanner message={error} />

        <div className="saas-card p-7 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                {q.topicName}
              </span>
              <span className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold uppercase text-slate-500">
                {q.questionType.replace('_', ' ')}
              </span>
              <span className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold capitalize text-slate-500">
                {q.difficulty}
              </span>
            </div>
            {q.sourceCitation?.documentName && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <FileText className="h-3.5 w-3.5" />
                Grounded in {q.sourceCitation.documentName}
                {q.sourceCitation.pageNumber ? ` (p. ${q.sourceCitation.pageNumber})` : ''}
              </span>
            )}
          </div>

          <h2 className="mt-6 whitespace-pre-line text-lg font-bold leading-relaxed text-slate-900">
            {q.prompt}
          </h2>

          <div className="mt-7">
            {q.questionType === 'mcq' || q.questionType === 'true_false' ? (
              <div className="space-y-3">
                {(q.options || []).map((opt, idx) => {
                  const selected = answers[q._id] === opt;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [q._id]: opt }))}
                      className={`flex w-full items-center gap-3.5 rounded-xl border px-5 py-4 text-left text-sm transition ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50/70 font-semibold text-indigo-950 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                          selected
                            ? 'border-indigo-600 bg-indigo-600 text-white'
                            : 'border-slate-300 text-slate-500'
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="leading-relaxed">{opt}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div>
                <textarea
                  rows={5}
                  value={answers[q._id] || ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q._id]: e.target.value }))}
                  placeholder="Write your clear, concept-focused explanation here..."
                  className="saas-input p-4 leading-relaxed"
                />
                <p className="mt-2 text-xs text-slate-400">
                  Evaluated semantically against your uploaded study material chunks.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            className="saas-btn-secondary text-xs"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {questions.map((item, idx) => {
              const hasAns = Boolean(answers[item._id]?.trim());
              return (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-9 w-9 rounded-xl text-xs font-bold transition ${
                    idx === currentIndex
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : hasAns
                      ? 'border border-indigo-200 bg-indigo-50 text-indigo-700'
                      : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {currentIndex < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={submitting} className="saas-btn-primary text-xs">
              {submitting ? 'Evaluating...' : 'Finish & Diagnose'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'review' && reviewData) {
    const { assessment, questions: reviewedQs = [], updatedTopics = [] } = reviewData;
    return (
      <div className="space-y-8">
        <div className="saas-card flex flex-wrap items-center justify-between gap-6 p-7">
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Diagnostic Evaluation Complete</p>
            <h1 className="text-2xl font-bold text-slate-900">{assessment.title}</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
              {assessment.diagnosticSummary?.summaryText}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-400">Score</p>
              <p className="font-mono text-4xl font-bold text-slate-900 tabular-nums">{assessment.scorePercentage}%</p>
              <p className="text-xs text-slate-500">
                {assessment.correctCount}/{assessment.totalQuestions} correct
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => navigate('/diagnosis')} className="saas-btn-primary text-xs">
                View Gap Diagnosis <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => {
                  setMode('builder');
                  setReviewData(null);
                  setSearchParams({});
                }}
                className="saas-btn-secondary py-2 text-xs"
              >
                New Assessment
              </button>
            </div>
          </div>
        </div>

        {updatedTopics.length > 0 && (
          <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-6">
            <h2 className="text-base font-bold text-slate-900">Updated Topic Mastery &amp; Revision Sync</h2>
            <p className="mt-1 text-xs text-slate-600">
              Your personalized revision plan was automatically refreshed from these results.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {updatedTopics.map((t) => (
                <div key={t._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold text-slate-900">{t.name}</span>
                    <span className="font-mono text-base font-bold text-slate-900">
                      {t.masteryScore !== null ? `${t.masteryScore}%` : '—'}
                    </span>
                  </div>
                  <div className="mt-2">
                    <MasteryStatusBadge status={t.status} compact />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-5">
          {reviewedQs.map((q) => {
            const ans = q.studentAnswer;
            const isCorrect = Boolean(ans?.isCorrect);
            const cite = q.sourceCitation || ans?.citation || {};
            return (
              <div
                key={q._id}
                className={`saas-card p-6 ${isCorrect ? 'border-emerald-200/90' : 'border-red-200/90'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span className="font-mono text-xs font-bold uppercase text-slate-400">Q{q.questionIndex}</span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {q.topicName}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isCorrect ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
                </div>

                <p className="mt-4 whitespace-pre-line text-[15px] font-semibold leading-relaxed text-slate-900">
                  {q.prompt}
                </p>

                <div className="mt-4 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <span className="font-semibold text-slate-500">Your Answer</span>
                    <p className="mt-1.5 text-sm font-medium text-slate-900">{ans?.selectedAnswer || '(No answer)'}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/45 p-4">
                    <span className="font-semibold text-emerald-800">Source-Grounded Reference</span>
                    <p className="mt-1.5 text-sm font-medium text-emerald-950">{q.correctAnswer}</p>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-slate-700">{ans?.aiFeedback || q.explanation}</p>

                {!isCorrect && ans?.identifiedMisconception && (
                  <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                    <span>
                      <strong>Detected Conceptual Gap:</strong> {ans.identifiedMisconception}
                    </span>
                  </div>
                )}

                {cite.documentName && (
                  <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/45 p-4 text-xs">
                    <div className="flex flex-wrap items-center gap-2 font-semibold text-indigo-900">
                      <BookOpen className="h-4 w-4 text-indigo-600" />
                      <span>Citation: {cite.documentName}</span>
                      {cite.sectionTitle && <span className="text-indigo-600">· {cite.sectionTitle}</span>}
                      {cite.pageNumber && <span className="font-mono text-indigo-600">· Page {cite.pageNumber}</span>}
                    </div>
                    {cite.excerpt && (
                      <p className="mt-2 italic leading-relaxed text-slate-600">&ldquo;{cite.excerpt}&rdquo;</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">AI Assessment Engine (RAG)</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
          Generate source-grounded diagnostic quizzes for{' '}
          <span className="font-semibold text-slate-800">{activeSubject?.name || 'your subject'}</span> directly
          from your indexed study materials with automatic topic mastery diagnosis.
        </p>
      </div>

      <ErrorBanner message={error} onRetry={loadBase} />

      {!activeSubjectId ? (
        <EmptyState
          icon={Sparkles}
          title="No subject selected"
          description="Create a subject and upload study materials first to generate RAG-grounded assessments."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="saas-card p-6 sm:p-7 lg:col-span-8">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Configure Diagnostic Assessment</h2>
            <p className="mt-1 text-sm text-slate-500">
              Select specific topics (or leave unselected to diagnose across all chapters in {activeSubject?.name}).
            </p>

            <div className="mt-6">
              <div className="mb-2.5 flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Target Topics ({selectedTopicIds.length === 0 ? 'All topics' : `${selectedTopicIds.length} selected`})
                </label>
                {selectedTopicIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTopicIds([])}
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    Clear selection
                  </button>
                )}
              </div>
              {allTopics.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 p-5 text-xs text-slate-400">
                  No syllabus topics found. Add topics on the Syllabus page first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  {allTopics.map((t) => {
                    const active = selectedTopicIds.includes(t._id);
                    return (
                      <button
                        key={t._id}
                        type="button"
                        onClick={() => toggleTopic(t._id)}
                        className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
                          active
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm'
                            : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <span>{t.name}</span>
                        {t.masteryScore !== null && (
                          <span className="font-mono text-[11px] opacity-70">{t.masteryScore}%</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Difficulty</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="saas-input">
                  <option value="adaptive">Adaptive (Matches gaps)</option>
                  <option value="easy">Easy (Foundations)</option>
                  <option value="medium">Medium (Exam level)</option>
                  <option value="hard">Hard (Deep reasoning)</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Number of Questions</label>
                <select
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="saas-input"
                >
                  {[3, 5, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} Questions
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Optional Timer</label>
                <div className="flex items-center gap-2.5 pt-1">
                  <input
                    type="checkbox"
                    checked={enableTimer}
                    onChange={(e) => setEnableTimer(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <input
                    type="number"
                    min={2}
                    max={60}
                    disabled={!enableTimer}
                    value={timerMinutes}
                    onChange={(e) => setTimerMinutes(Number(e.target.value))}
                    className="saas-input w-24 py-2 disabled:bg-slate-50"
                  />
                  <span className="text-xs font-medium text-slate-500">min</span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <label className="mb-2.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Question Formats
              </label>
              <div className="flex flex-wrap gap-2.5">
                {ALL_Q_TYPES.map((qt) => {
                  const checked = questionTypes.includes(qt.id);
                  return (
                    <button
                      key={qt.id}
                      type="button"
                      onClick={() => toggleQType(qt.id)}
                      className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                        checked
                          ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {qt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-6">
              <p className="text-xs text-slate-500">
                Indexed study documents ready:{' '}
                <strong className="font-mono text-slate-900">{syllabus?.summary?.indexedDocuments || 0}</strong>
              </p>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || allTopics.length === 0}
                className="saas-btn-primary px-6 py-3"
              >
                <Sparkles className="h-4 w-4" />
                <span>{generating ? 'Retrieving Chunks & Generating...' : 'Generate RAG Assessment'}</span>
              </button>
            </div>
          </div>

          <div className="saas-card p-6 lg:col-span-4">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <History className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Assessment History</h2>
                <p className="text-xs text-slate-500">Click to inspect citations</p>
              </div>
            </div>
            {history.length === 0 ? (
              <p className="py-12 text-center text-xs text-slate-400">
                No assessments taken yet for {activeSubject?.name}.
              </p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {history.map((a) => (
                  <button
                    key={a._id}
                    onClick={() => openAssessment(a._id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-left transition hover:border-indigo-200 hover:bg-indigo-50/35"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-xs font-bold text-slate-900">{a.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {a.status === 'completed'
                          ? `${a.correctCount}/${a.totalQuestions} · ${new Date(a.completedAt).toLocaleDateString()}`
                          : 'In progress — click to resume'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${
                        a.status !== 'completed'
                          ? 'bg-amber-50 text-amber-700'
                          : a.scorePercentage >= 80
                          ? 'bg-emerald-50 text-emerald-700'
                          : a.scorePercentage >= 60
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {a.status === 'completed' ? `${a.scorePercentage}%` : 'Resume'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
