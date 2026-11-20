/** A figure's profile: symbol-art hero, about (with a kids' toggle), chips, story, facts, quiz, sources. */
import { useState } from 'react';
import { data, Link } from 'react-router';
import { getSql } from '~/.server/db';
import {
  ensureGuest,
  factReactions,
  myFactReactions,
  pollsFor,
  pollView,
  voterOf,
} from '~/.server/polls';
import { getFigure, getRosterRow, pendingCard, toCard } from '~/.server/sacred';
import { FactDeck } from '~/components/learn/fact-deck';
import { MiniQuiz } from '~/components/learn/mini-quiz';
import { PollCard } from '~/components/learn/poll-card';
import { StoryWalk } from '~/components/learn/story-walk';
import { CardGrid } from '~/components/sacred/figure-card';
import { SACRED_FONT_LINKS } from '~/components/sacred/fonts';
import { ChipRow, Respect, Reveal, SectionTitle } from '~/components/sacred/sections';
import { SymbolArt } from '~/components/sacred/symbol-art';
import { groupLabel, traditionLabel } from '~/components/sacred/types';
import type { Route } from './+types/sacred-figure';

export async function loader({ params, request }: Route.LoaderArgs) {
  const f = getFigure(params.slug);
  if (!f) {
    // On the roster but not written yet: a gentle holding page, not a 404.
    const row = getRosterRow(params.slug);
    if (!row) throw data('No such figure in Sacred India.', { status: 404 });
    return {
      figure: null,
      pending: pendingCard(row),
      related: [],
      family: {} as Record<string, boolean>,
      counts: {},
      mine: {},
      poll: null,
    };
  }
  const known = (slug: string) => !!getRosterRow(slug);
  const related = f.related.flatMap((s) => {
    const g = getFigure(s);
    const row = getRosterRow(s);
    return g ? [toCard(g)] : row ? [pendingCard(row)] : [];
  });
  // One calm poll per profile: its own, else a generic Sacred India one (stable by slug). Never another
  // story's tradition poll.
  const own = pollsFor(`figure:${f.slug}`);
  const pool = own.length ? own : pollsFor('sacred').filter((p) => p.scope === 'sacred');
  const pick = pool.length
    ? pool[[...f.slug].reduce((n, c) => n + c.charCodeAt(0), 0) % pool.length]
    : undefined;
  const target = `sacred:${f.slug}`;
  const sql = await getSql();
  // Issue the voter cookies now so a vote or reaction from this page is accepted (S14).
  const headers = new Headers();
  await ensureGuest(request, headers);
  const voter = await voterOf(sql, request, 'sacred');
  return data(
    {
      figure: f,
      pending: null,
      counts: await factReactions(target, sql, voter),
      mine: await myFactReactions(target, voter, sql),
      poll: pick ? await pollView(pick.id, voter, sql) : null,
      related,
      family: Object.fromEntries(
        f.family.flatMap((r) => (r.slug ? [[r.slug, known(r.slug)]] : [])),
      ),
    },
    { headers },
  );
}

export const links: Route.LinksFunction = () => SACRED_FONT_LINKS;

export const meta: Route.MetaFunction = ({ loaderData }) => {
  const f = loaderData?.figure;
  if (f)
    return [
      { title: `${f.name}: ${f.role} · Sacred India · ComicMutant` },
      { name: 'description', content: f.summary },
    ];
  if (loaderData?.pending)
    return [{ title: `${loaderData.pending.name} · Sacred India · ComicMutant` }];
  return [{ title: 'Not found · Sacred India' }];
};

/** A readable name for a source chip: the article title from the URL path, with its site. */
function sourceLabel(key: string, url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|en)\./, '');
    const seg = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '')
      .replace(/\.(html?|php)$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    const site = host.startsWith('wikipedia.') ? 'Wikipedia' : host;
    return seg.length > 1 ? `${site}: ${seg}` : site;
  } catch {
    return key;
  }
}

export default function SacredFigure({ loaderData: d }: Route.ComponentProps) {
  const [kid, setKid] = useState(false);
  const f = d.figure;
  if (!f) {
    const p = d.pending;
    if (!p) return null;
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="mx-auto size-48">
          <SymbolArt symbol={p.symbol} c1={p.palette.c1} c2={p.palette.c2} />
        </div>
        <h1 className="h-display sr-rise mt-4 text-6xl">{p.name}</h1>
        <p className="mt-3 text-lg text-muted">
          This profile is still being written and checked against its sources. Please come back
          soon.
        </p>
        <Link to={`/sacred/${p.tradition}`} className="btn btn-c3 mt-6">
          Back to {traditionLabel(p.tradition)}
        </Link>
      </div>
    );
  }
  const { c1, c2 } = f.palette;
  const sources = Object.entries(f.sources);
  return (
    <article
      className="mx-auto max-w-5xl px-4 pb-8"
      style={{ '--sc-a': c1, '--sc-b': c2 } as React.CSSProperties}
    >
      <nav aria-label="Breadcrumb" className="pt-6 text-sm">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/sacred" className="sacred-crumb">
              Sacred India
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link to={`/sacred/${f.tradition}`} className="sacred-crumb">
              {traditionLabel(f.tradition)}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li className="text-muted">{groupLabel(f.group)}</li>
        </ol>
      </nav>

      <header className="sacred-hero mt-4">
        <div className="size-44 flex-none sm:size-56">
          <SymbolArt
            symbol={f.symbol}
            c1={c1}
            c2={c2}
            label={`Abstract ${f.symbol} pattern for ${f.name}`}
          />
        </div>
        <div className="space-y-2">
          <h1 className="h-display sr-rise text-6xl sm:text-7xl">{f.name}</h1>
          {f.native && (
            <p
              lang={f.tradition === 'sikh' ? 'pa' : 'hi'}
              className="sc-native sr-rise text-2xl"
              style={{ '--d': '0.2s' } as React.CSSProperties}
            >
              {f.native}
            </p>
          )}
          <p className="sr-rise text-lg" style={{ '--d': '0.4s' } as React.CSSProperties}>
            {f.role}
          </p>
          {f.aka.length > 0 && (
            <p
              className="sr-rise text-muted text-sm"
              style={{ '--d': '0.6s' } as React.CSSProperties}
            >
              Also known as {f.aka.join(', ')}
            </p>
          )}
        </div>
      </header>

      <section aria-labelledby="about-h" className="mt-12">
        <Reveal>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <SectionTitle id="about-h" kicker="Who" title="About" />
            <button
              type="button"
              className="btn"
              aria-pressed={kid}
              onClick={() => setKid((v) => !v)}
            >
              Kids’ version
            </button>
          </div>
          <div className="sacred-prose space-y-4 text-lg" aria-live="polite">
            {kid ? (
              <p>{f.kidSummary}</p>
            ) : (
              <>
                <p className="font-semibold">{f.summary}</p>
                <p>{f.about}</p>
              </>
            )}
          </div>
          {f.teaches.length > 0 && (
            <div className="panel mt-6 max-w-xl p-5">
              <h3 className="kicker mb-2">What it teaches</h3>
              <ul className="list-disc space-y-1 pl-5">
                {f.teaches.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </Reveal>
      </section>

      <hr className="sacred-rule my-12" />

      <Reveal>
        <div className="grid gap-6 sm:grid-cols-2">
          <ChipRow label="Emblems and companions" items={f.emblems.map((text) => ({ text }))} />
          <ChipRow
            label="Family"
            items={f.family.map((r) => ({
              text: `${r.relation}: ${r.name}`,
              to: r.slug && d.family[r.slug] ? `/sacred/f/${r.slug}` : undefined,
            }))}
          />
          <ChipRow label="Texts" items={f.texts.map((text) => ({ text }))} />
          <ChipRow label="Places" items={f.places.map((text) => ({ text }))} />
          <ChipRow label="Festivals" items={f.festivals.map((text) => ({ text }))} />
        </div>
      </Reveal>

      <section id="story" aria-labelledby="story-h" className="mt-16">
        <Reveal>
          <SectionTitle id="story-h" kicker="Story walk" title="The story, step by step" />
          <div className="sacred-left">
            <StoryWalk steps={f.story} realm="sacred" />
          </div>
        </Reveal>
      </section>

      <section id="facts" aria-label={`Facts about ${f.name}`} className="mt-16">
        <Reveal>
          <div className="sacred-left">
            <FactDeck
              title={`${f.facts.length} facts about ${f.name}`}
              facts={f.facts}
              realm="sacred"
              target={`sacred:${f.slug}`}
              kid={kid}
              counts={d.counts}
              mine={d.mine}
            />
          </div>
        </Reveal>
      </section>

      <section id="quiz" aria-labelledby="quiz-h" className="mt-16">
        <Reveal>
          <SectionTitle id="quiz-h" kicker="Try it" title="Small quiz">
            {f.quiz.length} questions, no scores kept.
          </SectionTitle>
          <div className="sacred-left">
            <MiniQuiz items={f.quiz} realm="sacred" kid={kid} />
          </div>
          {d.poll && (
            <div className="sacred-left mt-8">
              <PollCard pollId={d.poll.id} realm="sacred" initial={d.poll} />
            </div>
          )}
        </Reveal>
      </section>

      {d.related.length > 0 && (
        <section aria-labelledby="rel-h" className="mt-16">
          <Reveal>
            <SectionTitle id="rel-h" kicker="Keep reading" title="Related figures" />
            <CardGrid cards={d.related} row />
          </Reveal>
        </section>
      )}

      <section aria-labelledby="src-h" className="mt-16">
        <Reveal>
          <SectionTitle id="src-h" kicker="Check it yourself" title="Sources" />
          <ul className="flex flex-wrap gap-2">
            {sources.map(([k, url]) => (
              <li key={k}>
                <a href={url} target="_blank" rel="noreferrer noopener" className="sacred-chip">
                  {sourceLabel(k, url)}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-muted text-sm">
            Each fact above also links to the page that supports it.
          </p>
          <div className="mt-6">
            <Respect />
          </div>
        </Reveal>
      </section>
    </article>
  );
}
