import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, BookOpen, FileText, Sparkles, Edit3, Check, X } from 'lucide-react';
import api, { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MasteryStatusBadge, getStatusMeta } from '../components/StatusBadge';
import { PageLoader, ErrorBanner, EmptyState } from '../components/UI';

export default function SyllabusPage() {
  const { subjects, activeSubjectId, selectSubject, refreshSubjects } = useAuth();
  const navigate = useNavigate();

  const [syllabus, setSyllabus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showNewSubject, setShowNewSubject] = useState(false);
  const [subjForm, setSubjForm] = useState({ name: '', code: '', description: '' });

  const [showNewChapter, setShowNewChapter] = useState(false);
  const [chapForm, setChapForm] = useState({ title: '', description: '' });

  const [addingTopicForChapter, setAddingTopicForChapter] = useState(null);
  const [topicForm, setTopicForm] = useState({ name: '', description: '' });

  const [editingTopicId, setEditingTopicId] = useState(null);
  const [editTopicForm, setEditTopicForm] = useState({ name: '', description: '' });

  const loadSyllabus = useCallback(async () => {
    if (!activeSubjectId) {
      setSyllabus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/syllabus/${activeSubjectId}`);
      setSyllabus(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load syllabus.'));
    } finally {
      setLoading(false);
    }
  }, [activeSubjectId]);

  useEffect(() => {
    loadSyllabus();
  }, [loadSyllabus]);

  const handleCreateSubject = async (e) => {
    e.preventDefault();
    if (!subjForm.name.trim()) return;
    setError('');
    try {
      const { data } = await api.post('/subjects', subjForm);
      setSubjForm({ name: '', code: '', description: '' });
      setShowNewSubject(false);
      await refreshSubjects(data.subject._id);
      await selectSubject(data.subject._id);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create subject.'));
    }
  };

  const handleDeleteSubject = async (sid) => {
    if (!window.confirm('Delete this subject and all its chapters, topics, and documents?')) return;
    try {
      await api.delete(`/subjects/${sid}`);
      await refreshSubjects();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete subject.'));
    }
  };

  const handleCreateChapter = async (e) => {
    e.preventDefault();
    if (!chapForm.title.trim() || !activeSubjectId) return;
    try {
      await api.post('/chapters', { subjectId: activeSubjectId, ...chapForm });
      setChapForm({ title: '', description: '' });
      setShowNewChapter(false);
      await loadSyllabus();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not add chapter.'));
    }
  };

  const handleDeleteChapter = async (cid) => {
    if (!window.confirm('Delete this chapter and its topics?')) return;
    try {
      await api.delete(`/chapters/${cid}`);
      await loadSyllabus();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete chapter.'));
    }
  };

  const handleCreateTopic = async (e, chapterId) => {
    e.preventDefault();
    if (!topicForm.name.trim()) return;
    try {
      await api.post('/topics', {
        subjectId: activeSubjectId,
        chapterId,
        name: topicForm.name.trim(),
        description: topicForm.description.trim(),
      });
      setTopicForm({ name: '', description: '' });
      setAddingTopicForChapter(null);
      await loadSyllabus();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create topic.'));
    }
  };

  const handleUpdateTopic = async (topicId) => {
    try {
      await api.put(`/topics/${topicId}`, editTopicForm);
      setEditingTopicId(null);
      await loadSyllabus();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update topic.'));
    }
  };

  const handleDeleteTopic = async (topicId) => {
    if (!window.confirm('Delete this topic?')) return;
    try {
      await api.delete(`/topics/${topicId}`);
      await loadSyllabus();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete topic.'));
    }
  };

  const handleMapDocument = async (docId, newChapterId) => {
    try {
      await api.patch(`/documents/${docId}/map-chapter`, { chapterId: newChapterId || null });
      await loadSyllabus();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not map document to chapter.'));
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Syllabus &amp; Topic Mapping</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
            Organize subjects, chapters, and topics so GapFinder AI maps study materials and tracks topic-level mastery.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setShowNewSubject((v) => !v)} className="saas-btn-secondary text-xs">
            <Plus className="h-4 w-4" /> New Subject
          </button>
          {activeSubjectId && (
            <button onClick={() => setShowNewChapter((v) => !v)} className="saas-btn-primary text-xs">
              <Plus className="h-4 w-4" /> Add Chapter
            </button>
          )}
        </div>
      </div>

      <ErrorBanner message={error} onRetry={loadSyllabus} />

      {/* Subject Pills */}
      {subjects.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          {subjects.map((s) => (
            <div
              key={s._id}
              className={`inline-flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm transition ${
                s._id === activeSubjectId
                  ? 'border-indigo-300 bg-indigo-50 font-semibold text-indigo-800 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              <button onClick={() => selectSubject(s._id)} className="flex items-center gap-2">
                <span>{s.name}</span>
                {s.code && <span className="font-mono text-xs opacity-70">{s.code}</span>}
              </button>
              <button
                onClick={() => handleDeleteSubject(s._id)}
                title="Delete subject"
                className="rounded p-0.5 text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* New Subject Form */}
      {showNewSubject && (
        <form onSubmit={handleCreateSubject} className="saas-card border-indigo-200 p-6">
          <h3 className="text-base font-bold text-slate-900">Create New Subject</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <input
              type="text"
              required
              placeholder="Subject Name (e.g. Operating Systems)"
              value={subjForm.name}
              onChange={(e) => setSubjForm({ ...subjForm, name: e.target.value })}
              className="saas-input"
            />
            <input
              type="text"
              placeholder="Course Code (e.g. CS301)"
              value={subjForm.code}
              onChange={(e) => setSubjForm({ ...subjForm, code: e.target.value })}
              className="saas-input"
            />
            <input
              type="text"
              placeholder="Short description"
              value={subjForm.description}
              onChange={(e) => setSubjForm({ ...subjForm, description: e.target.value })}
              className="saas-input"
            />
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setShowNewSubject(false)} className="saas-btn-secondary text-xs">
              Cancel
            </button>
            <button type="submit" className="saas-btn-primary text-xs">
              Save Subject
            </button>
          </div>
        </form>
      )}

      {/* New Chapter Form */}
      {showNewChapter && activeSubjectId && (
        <form onSubmit={handleCreateChapter} className="saas-card border-indigo-200 p-6">
          <h3 className="text-base font-bold text-slate-900">Add Chapter</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input
              type="text"
              required
              placeholder="Chapter Title (e.g. Dynamic Programming)"
              value={chapForm.title}
              onChange={(e) => setChapForm({ ...chapForm, title: e.target.value })}
              className="saas-input"
            />
            <input
              type="text"
              placeholder="Brief chapter scope"
              value={chapForm.description}
              onChange={(e) => setChapForm({ ...chapForm, description: e.target.value })}
              className="saas-input"
            />
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setShowNewChapter(false)} className="saas-btn-secondary text-xs">
              Cancel
            </button>
            <button type="submit" className="saas-btn-primary text-xs">
              Add Chapter
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <PageLoader message="Loading syllabus tree..." />
      ) : !activeSubjectId ? (
        <EmptyState
          icon={BookOpen}
          title="No subject selected"
          description="Create your first subject above to start adding chapters, syllabus topics, and study materials."
        />
      ) : (
        <div className="space-y-5">
          {syllabus?.chapters?.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No chapters added yet"
              description="Add syllabus chapters (e.g., Arrays, Linked Lists, Trees) and topics underneath them."
              action={
                <button onClick={() => setShowNewChapter(true)} className="saas-btn-primary">
                  Add First Chapter
                </button>
              }
            />
          ) : (
            syllabus?.chapters?.map((ch) => (
              <div key={ch._id} className="saas-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-6 py-5">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="rounded-lg bg-indigo-100 px-2.5 py-0.5 font-mono text-xs font-bold text-indigo-700">
                        Ch {ch.orderIndex}
                      </span>
                      <h2 className="text-base font-bold text-slate-900">{ch.title}</h2>
                      {ch.chapterMastery !== null && (
                        <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs font-semibold text-slate-600 shadow-sm">
                          Avg {ch.chapterMastery}%
                        </span>
                      )}
                    </div>
                    {ch.description && <p className="text-xs leading-relaxed text-slate-500">{ch.description}</p>}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      <FileText className="h-3.5 w-3.5 text-indigo-500" />
                      {ch.documents?.length || 0} doc{ch.documents?.length === 1 ? '' : 's'}
                    </span>
                    <button
                      onClick={() => setAddingTopicForChapter(addingTopicForChapter === ch._id ? null : ch._id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 shadow-sm hover:bg-indigo-50"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Topic
                    </button>
                    <button
                      onClick={() => handleDeleteChapter(ch._id)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {addingTopicForChapter === ch._id && (
                  <form
                    onSubmit={(e) => handleCreateTopic(e, ch._id)}
                    className="border-b border-indigo-100 bg-indigo-50/40 px-6 py-4"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        required
                        placeholder="Topic name (e.g. Binary Search Tree Validation)"
                        value={topicForm.name}
                        onChange={(e) => setTopicForm({ ...topicForm, name: e.target.value })}
                        className="saas-input"
                      />
                      <input
                        type="text"
                        placeholder="Key concepts / description"
                        value={topicForm.description}
                        onChange={(e) => setTopicForm({ ...topicForm, description: e.target.value })}
                        className="saas-input"
                      />
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAddingTopicForChapter(null)}
                        className="saas-btn-secondary py-1.5 text-xs"
                      >
                        Cancel
                      </button>
                      <button type="submit" className="saas-btn-primary py-1.5 text-xs">
                        Save Topic
                      </button>
                    </div>
                  </form>
                )}

                <div className="divide-y divide-slate-100">
                  {ch.topics?.length === 0 ? (
                    <p className="px-6 py-5 text-xs text-slate-400">No topics mapped to this chapter yet.</p>
                  ) : (
                    ch.topics.map((topic) => (
                      <div
                        key={topic._id}
                        className="flex flex-col justify-between gap-4 px-6 py-5 transition hover:bg-slate-50/50 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          {editingTopicId === topic._id ? (
                            <div className="flex flex-col gap-2.5 sm:flex-row">
                              <input
                                value={editTopicForm.name}
                                onChange={(e) => setEditTopicForm({ ...editTopicForm, name: e.target.value })}
                                className="saas-input"
                              />
                              <input
                                value={editTopicForm.description}
                                onChange={(e) => setEditTopicForm({ ...editTopicForm, description: e.target.value })}
                                className="saas-input flex-1"
                              />
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleUpdateTopic(topic._id)}
                                  className="rounded-lg bg-emerald-600 p-2 text-white"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setEditingTopicId(null)}
                                  className="rounded-lg bg-slate-200 p-2 text-slate-700"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2.5">
                                <span className="text-[15px] font-bold text-slate-900">{topic.name}</span>
                                <MasteryStatusBadge status={topic.status} compact />
                              </div>
                              {topic.description && (
                                <p className="max-w-2xl text-xs leading-relaxed text-slate-500">{topic.description}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-400">
                                <span>{topic.questionCount || 0} questions</span>
                                <span>•</span>
                                <span>{topic.totalAttempts || 0} attempts</span>
                                {topic.relatedDocuments?.length > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="font-medium text-indigo-600">
                                      Sources: {topic.relatedDocuments.map((d) => d.originalName).join(', ')}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-4">
                          <div className="w-32">
                            <div className="mb-1.5 flex justify-between text-xs">
                              <span className="text-slate-400">Mastery</span>
                              <span className="font-mono font-bold text-slate-800">
                                {topic.masteryScore !== null ? `${topic.masteryScore}%` : '—'}
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${topic.masteryScore ?? 0}%`,
                                  backgroundColor: getStatusMeta(topic.status).bar,
                                }}
                              />
                            </div>
                          </div>

                          <button
                            onClick={() => navigate(`/assessments?topicId=${topic._id}`)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100/70"
                          >
                            <Sparkles className="h-3.5 w-3.5" /> Quiz
                          </button>

                          <button
                            onClick={() => {
                              setEditingTopicId(topic._id);
                              setEditTopicForm({ name: topic.name, description: topic.description || '' });
                            }}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTopic(topic._id)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}

          {syllabus?.unmappedDocuments?.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6">
              <h3 className="text-sm font-bold text-amber-900">Unmapped Study Materials</h3>
              <p className="mt-1 text-xs text-amber-800/80">
                Assign these documents to a chapter for sharper topic-level RAG retrieval.
              </p>
              <div className="mt-4 space-y-2.5">
                {syllabus.unmappedDocuments.map((d) => (
                  <div
                    key={d._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm"
                  >
                    <span className="font-medium text-slate-800">{d.originalName}</span>
                    <select
                      defaultValue=""
                      onChange={(e) => handleMapDocument(d._id, e.target.value)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                    >
                      <option value="">Map to chapter...</option>
                      {syllabus.chapters.map((c) => (
                        <option key={c._id} value={c._id}>
                          Ch {c.orderIndex}: {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
