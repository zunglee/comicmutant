/**
 * Live filter forms: selects, radios and checkboxes submit at once; typing in a text/search box
 * waits for a 250ms pause, so "spider" is one request, not six.
 */
import { type FormEvent, useEffect, useRef } from 'react';
import { useSubmit } from 'react-router';

const TYPING_MS = 250;

export function useFilterSubmit() {
  const submit = useSubmit();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (e: FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const el = e.target as HTMLInputElement;
    const typing = el.tagName === 'INPUT' && (el.type === 'search' || el.type === 'text');
    clearTimeout(timer.current);
    const go = () => submit(form, { replace: true, preventScrollReset: true });
    if (typing) timer.current = setTimeout(go, TYPING_MS);
    else go();
  };
}
