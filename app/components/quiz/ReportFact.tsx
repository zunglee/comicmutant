/** "This fact looks wrong?" → reason picker → POST /api/quiz/report. */
import { useId, useState } from 'react';
import type { QuizReportBody } from '~/lib/quiz-contract';
import { reportFact } from './api';
import { IconFlag } from './qicons';

const REASONS: { id: QuizReportBody['reason']; label: string }[] = [
  { id: 'wrong-answer', label: 'The answer is wrong' },
  { id: 'unclear', label: 'Question is unclear' },
  { id: 'typo', label: 'Typo' },
  { id: 'other', label: 'Something else' },
];

export function ReportFact({ game, index }: { game: string; index: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<QuizReportBody['reason']>('wrong-answer');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');
  const noteId = useId();

  if (state === 'done') {
    return (
      <p role="status" className="text-muted text-sm">
        Thanks! A moderator will check this fact against its source.
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="qz-hit inline-flex items-center gap-1.5 text-sm underline underline-offset-2"
      >
        <IconFlag className="size-4" />
        This fact looks wrong?
      </button>
    );
  }
  const send = async () => {
    setState('sending');
    const r = await reportFact({ game, index, reason, note: note.trim() || undefined });
    if (r.ok) setState('done');
    else {
      setErr(r.error);
      setState('error');
    }
  };
  return (
    <fieldset className="panel space-y-2 p-3">
      <legend className="px-1 font-head text-sm">What is wrong with it?</legend>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button
            key={r.id}
            type="button"
            className="chip"
            aria-pressed={reason === r.id}
            onClick={() => setReason(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <label htmlFor={noteId} className="block text-sm">
        Anything we should know? (optional)
        <input
          id={noteId}
          className="field mt-1"
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-sm btn-c3"
          disabled={state === 'sending'}
          onClick={send}
        >
          {state === 'sending' ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        {state === 'error' && (
          <span role="alert" className="text-sm">
            {err}
          </span>
        )}
      </div>
    </fieldset>
  );
}
