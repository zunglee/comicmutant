import { hostOf } from './logic';

interface F {
  text: string;
  kind: string;
  source: string;
  interest: number;
}

/** Deduplicated source links for a fact set. */
export function FactSources({ facts }: { facts: readonly F[] }) {
  const urls = [...new Set(facts.map((f) => f.source))];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {urls.map((u) => (
        <li key={u}>
          <a
            href={u}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-[44px] items-center underline"
          >
            {hostOf(u)}
          </a>
        </li>
      ))}
    </ul>
  );
}
