import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Trash2,
  Eye,
  RefreshCw,
  Search,
  X,
  Database,
  CheckCircle2,
} from 'lucide-react';
import api, { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { DocStatusBadge } from '../components/StatusBadge';
import { PageLoader, ErrorBanner, EmptyState } from '../components/UI';

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function MaterialsPage() {
  const { activeSubjectId, activeSubject } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [selectedFile, setSelectedFile] = useState(null);
  const [chapterId, setChapterId] = useState('');
  const [docCategory, setDocCategory] = useState('notes');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const [inspecting, setInspecting] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeSubjectId) {
      setDocuments([]);
      setChapters([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [docsRes, sylRes] = await Promise.all([
        api.get(`/documents?subjectId=${activeSubjectId}`),
        api.get(`/syllabus/${activeSubjectId}`),
      ]);
      setDocuments(docsRes.data.documents || []);
      setChapters(sylRes.data.chapters || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load study materials.'));
    } finally {
      setLoading(false);
    }
  }, [activeSubjectId]);

  useEffect(() => {
    loadData();
    setSearchResults([]);
    setSearchedOnce(false);
  }, [loadData]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile || !activeSubjectId) return;
    setUploading(true);
    setUploadProgress(15);
    setError('');
    setNotice('');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('subjectId', activeSubjectId);
    if (chapterId) formData.append('chapterId', chapterId);
    formData.append('docCategory', docCategory);

    try {
      const { data } = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (evt.total) {
            setUploadProgress(Math.min(90, Math.round((evt.loaded / evt.total) * 85)));
          }
        },
      });
      setUploadProgress(100);
      setNotice(data.message || 'Document uploaded and indexed.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err, 'Upload failed.'));
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 600);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Delete this document and all its indexed RAG chunks?')) return;
    try {
      await api.delete(`/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d._id !== docId));
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete document.'));
    }
  };

  const handleReindex = async (docId) => {
    try {
      setNotice('Re-indexing document embeddings...');
      const { data } = await api.post(`/documents/${docId}/reindex`);
      setDocuments((prev) => prev.map((d) => (d._id === docId ? data.document : d)));
      setNotice('Document re-indexed successfully.');
    } catch (err) {
      setError(getErrorMessage(err, 'Re-indexing failed.'));
    }
  };

  const openInspect = async (docId) => {
    setInspectLoading(true);
    setInspecting({ document: null, chunks: [] });
    try {
      const { data } = await api.get(`/documents/${docId}`);
      setInspecting(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to inspect document chunks.'));
      setInspecting(null);
    } finally {
      setInspectLoading(false);
    }
  };

  const handleSemanticSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || !activeSubjectId) return;
    setSearching(true);
    setSearchedOnce(true);
    setError('');
    try {
      const { data } = await api.post('/documents/search', {
        subjectId: activeSubjectId,
        query: searchQuery.trim(),
        topK: 5,
      });
      setSearchResults(data.results || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Semantic search failed.'));
    } finally {
      setSearching(false);
    }
  };

  if (loading) return <PageLoader message="Loading study materials and RAG index..." />;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Study Materials &amp; RAG Index</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500">
          Upload PDFs, DOCX, or TXT notes for{' '}
          <span className="font-semibold text-slate-800">{activeSubject?.name || 'your subject'}</span>. Files are
          extracted, chunked, embedded, and stored in MongoDB for grounded assessment generation.
        </p>
      </div>

      <ErrorBanner message={error} onRetry={loadData} />

      {notice && (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{notice}</span>
        </div>
      )}

      {!activeSubjectId ? (
        <EmptyState
          icon={FileText}
          title="Select or create a subject first"
          description="Go to Syllabus & Topics to create a subject before uploading study materials."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Upload Card */}
            <form onSubmit={handleUpload} className="saas-card p-6 sm:p-7 lg:col-span-7">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Upload Study Document</h2>
              <p className="mt-1 text-sm text-slate-500">
                Supports PDF textbooks/notes, DOCX documents, TXT notes, syllabi, and previous question papers.
              </p>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files?.[0]) setSelectedFile(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                  dragActive
                    ? 'border-indigo-500 bg-indigo-50/60'
                    : 'border-slate-200 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/20'
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  {selectedFile ? selectedFile.name : 'Drag & drop your file here, or click to browse'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedFile
                    ? `${formatBytes(selectedFile.size)} · Ready to extract & embed`
                    : 'PDF, DOCX, or TXT up to 20 MB'}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Map to Chapter</label>
                  <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} className="saas-input">
                    <option value="">All chapters / General syllabus</option>
                    {chapters.map((ch) => (
                      <option key={ch._id} value={ch._id}>
                        Ch {ch.orderIndex}: {ch.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Material Type</label>
                  <select value={docCategory} onChange={(e) => setDocCategory(e.target.value)} className="saas-input">
                    <option value="notes">Lecture Notes</option>
                    <option value="textbook">Textbook Chapter</option>
                    <option value="syllabus">Syllabus Document</option>
                    <option value="question_paper">Previous Question Paper</option>
                  </select>
                </div>
              </div>

              {uploadProgress > 0 && (
                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                    <span>Uploading &amp; generating vector embeddings...</span>
                    <span className="font-mono font-semibold">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button type="submit" disabled={!selectedFile || uploading} className="saas-btn-primary">
                  <UploadCloud className="h-4 w-4" />
                  <span>{uploading ? 'Indexing with RAG...' : 'Upload & Index Material'}</span>
                </button>
              </div>
            </form>

            {/* Semantic Vector Search Tester */}
            <div className="saas-card flex flex-col p-6 sm:p-7 lg:col-span-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Database className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Semantic Retrieval Test</h2>
                  <p className="text-xs text-slate-500">Verify live vector search over MongoDB chunks</p>
                </div>
              </div>

              <form onSubmit={handleSemanticSearch} className="mt-5 flex gap-2.5">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. BST ordering invariant or AVL balance..."
                  className="saas-input min-w-0 flex-1"
                />
                <button
                  type="submit"
                  disabled={searching || !searchQuery.trim()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  <Search className="h-3.5 w-3.5" />
                  {searching ? '...' : 'Search'}
                </button>
              </form>

              <div className="mt-4 flex-1 space-y-3 overflow-y-auto max-h-72 pr-1">
                {searchResults.length > 0 ? (
                  searchResults.map((r) => (
                    <div key={r.chunkId} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-semibold text-indigo-700">{r.documentName}</span>
                        <span className="shrink-0 rounded-md bg-indigo-100/80 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-700">
                          {Math.round(r.relevanceScore * 100)}%
                        </span>
                      </div>
                      {(r.sectionTitle || r.pageNumber) && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          {r.sectionTitle}
                          {r.pageNumber ? ` · Page ${r.pageNumber}` : ''}
                        </p>
                      )}
                      <p className="mt-2 text-xs leading-relaxed text-slate-600">{r.excerpt}</p>
                    </div>
                  ))
                ) : searchedOnce ? (
                  <p className="py-10 text-center text-xs text-slate-400">
                    No matching chunks found in your uploaded materials for that query.
                  </p>
                ) : (
                  <p className="py-10 text-center text-xs leading-relaxed text-slate-400">
                    Search any concept from your syllabus to inspect top-ranked chunks &amp; similarity scores.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Documents Table */}
          <div className="saas-card overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">
                Uploaded Documents ({documents.length})
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Indexed materials and vector chunks persisted in MongoDB Atlas
              </p>
            </div>

            {documents.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">
                No study materials uploaded yet for this subject.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-6 py-3.5">Document</th>
                      <th className="px-5 py-3.5">Chapter / Category</th>
                      <th className="px-5 py-3.5">RAG Chunks</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5">Uploaded</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {documents.map((doc) => (
                      <tr key={doc._id} className="transition hover:bg-slate-50/70">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-xs font-bold uppercase text-indigo-700">
                              {doc.fileType}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{doc.originalName}</p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {formatBytes(doc.fileSize)}
                                {doc.pageCount ? ` · ${doc.pageCount} pages` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs">
                          <p className="font-semibold text-slate-800">{doc.chapterId?.title || 'General'}</p>
                          <p className="mt-0.5 capitalize text-slate-400">{doc.docCategory?.replace('_', ' ')}</p>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs font-semibold text-slate-700">
                          {doc.chunkCount || 0} chunks
                        </td>
                        <td className="px-5 py-4">
                          <DocStatusBadge status={doc.processingStatus} />
                          {doc.errorMessage && (
                            <p className="mt-1 max-w-[200px] truncate text-[11px] text-red-600" title={doc.errorMessage}>
                              {doc.errorMessage}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => openInspect(doc._id)}
                              title="Inspect extracted chunks"
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleReindex(doc._id)}
                              title="Re-index embeddings"
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(doc._id)}
                              title="Delete document"
                              className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Inspect Chunks Modal */}
      {inspecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {inspecting.document?.originalName || 'Inspecting Document'}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {inspecting.chunks?.length || 0} indexed chunks stored in MongoDB gapfinder_db.documentchunks
                </p>
              </div>
              <button
                onClick={() => setInspecting(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {inspectLoading ? (
                <PageLoader message="Fetching document chunks..." />
              ) : inspecting.chunks?.length === 0 ? (
                <p className="text-center text-sm text-slate-400">No chunks indexed for this document yet.</p>
              ) : (
                inspecting.chunks.map((ch) => (
                  <div key={ch._id} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-indigo-700">
                        Chunk #{ch.chunkIndex + 1} · {ch.sectionTitle || 'General Section'}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {ch.pageNumber ? `Page ${ch.pageNumber} · ` : ''}
                        {ch.tokenCount} words · {ch.embeddingModel}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{ch.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
