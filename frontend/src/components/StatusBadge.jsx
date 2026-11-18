import React from 'react';

const STATUS_STYLES = {
  critical_weakness: {
    label: 'Critical Weakness',
    shortLabel: 'Critical',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200/80',
    dot: 'bg-red-500',
    bar: '#DC2626',
    softBg: 'bg-red-50/50',
  },
  needs_improvement: {
    label: 'Needs Improvement',
    shortLabel: 'Weak',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200/80',
    dot: 'bg-amber-500',
    bar: '#D97706',
    softBg: 'bg-amber-50/50',
  },
  developing: {
    label: 'Developing',
    shortLabel: 'Developing',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200/80',
    dot: 'bg-indigo-500',
    bar: '#4F46E5',
    softBg: 'bg-indigo-50/50',
  },
  mastered: {
    label: 'Mastered',
    shortLabel: 'Mastered',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200/80',
    dot: 'bg-emerald-500',
    bar: '#059669',
    softBg: 'bg-emerald-50/50',
  },
  insufficient_data: {
    label: 'Insufficient Data',
    shortLabel: 'Needs Data',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200/80',
    dot: 'bg-slate-400',
    bar: '#94A3B8',
    softBg: 'bg-slate-50',
  },
};

export function getStatusMeta(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.insufficient_data;
}

export function MasteryStatusBadge({ status, compact = false }) {
  const meta = getStatusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${meta.bg} ${meta.text} ${meta.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {compact ? meta.shortLabel : meta.label}
    </span>
  );
}

const PRIORITY_STYLES = {
  critical: 'bg-red-50 text-red-700 border-red-200/90',
  high: 'bg-amber-50 text-amber-800 border-amber-200/90',
  medium: 'bg-indigo-50 text-indigo-700 border-indigo-200/90',
  low: 'bg-slate-100 text-slate-700 border-slate-200/90',
};

export function PriorityBadge({ priority }) {
  const cls = PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${cls}`}
    >
      {priority}
    </span>
  );
}

const DOC_STATUS_STYLES = {
  indexed: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  processing: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
  uploaded: 'bg-amber-50 text-amber-800 border-amber-200/80',
  failed: 'bg-red-50 text-red-700 border-red-200/80',
};

export function DocStatusBadge({ status }) {
  const cls = DOC_STATUS_STYLES[status] || DOC_STATUS_STYLES.uploaded;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold capitalize ${cls}`}
    >
      {status}
    </span>
  );
}
