import { m } from 'motion/react';
import { useState } from 'react';
import { data, Form, Link, redirect, useFetcher, useNavigation } from 'react-router';
import { currentUser } from '~/.server/auth';
import { countVersus, createVersus, isPrompt, listVersus } from '~/.server/community';
import { findCharacterByName, getCharacter } from '~/.server/content';
import { getSql } from '~/.server/db';
import { allow, assertSameOrigin, readForm } from '~/.server/guard';
import { SectionHead, VoteBar } from '~/components/bits';
import { IconVs } from '~/components/icons';
import { VERSUS_PROMPTS } from '~/lib/community';
import { photoSrc, photoSrcSet } from '~/lib/photos';
import { onColor } from '~/lib/theme/compute';
import type { Route } from './+types/versus';

export const meta: Route.MetaFunction = () => [
  { title: 'Versus — ComicMutant' },
  {
    name: 'description',
    content: 'Pick a side. Two characters, one question, one tug-of-war meter.',
  },
];

const PAGE = 30;

export async function loader({ request }: Route.LoaderArgs) {
  const sql = await getSql();
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const [rows, total, user] = await Promise.all([
    listVersus(sql, PAGE, (page - 1) * PAGE),
    countVersus(sql),
    currentUser(sql, request),
  ]);
  const pre = getCharacter(url.searchParams.get('a') ?? '');
  const side = (slug: string) => {
    const c = getCharacter(slug);
    return c
      ? {
          slug,
          name: c.name,
          c1: c.theme.palette.c1,
          c2: c.theme.palette.c2,
          photo: c.photo?.file ?? null,
        }
      : null;
  };
  return {
    debates: rows
      .map((r) => ({
        id: r.id,
        prompt: VERSUS_PROMPTS[r.prompt],
        official: !!r.official,
        va: r.votes_a,
        vb: r.votes_b,
        takes: r.takes,
        a: side(r.a),
        b: side(r.b),
      }))
      .filter((r) => r.a && r.b),
    page,
    pages: Math.max(1, Math.ceil(total / PAGE)),
    signedIn: !!user,
    pre: pre ? { slug: pre.slug, name: pre.name } : null,
  };
}

/** A picker sends a slug when the typeahead resolved one, else the typed name. */
function resolve(form: URLSearchParams, key: string) {
  const slug = form.get(`${key}_slug`) ?? '';
  return getCharacter(slug) ?? findCharacterByName(form.get(key) ?? '');
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  const form = await readForm(request);
  const sql = await getSql();
  const user = await currentUser(sql, request);
  if (!user) throw redirect('/login?next=/versus');
  const a = resolve(form, 'a');
  const b = resolve(form, 'b');
  const prompt = form.get('prompt');
  if (!a || !b || a.slug === b.slug || !isPrompt(prompt)) {
    return data({ error: 'Pick two different characters and a question.' }, { status: 400 });
  }
  if (!(await allow(sql, `versus:${user.id}`, 5, 3600_000))) {
    return data({ error: 'Five new debates an hour is the limit.' }, { status: 429 });
  }
  throw redirect(`/versus/${await createVersus(sql, a.slug, b.slug, prompt, user.id)}`);
}

export default function Versus({ loaderData: d, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === 'submitting';
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <SectionHead level={1} kicker="Debates, comic-style" title="Versus" />
      <p className="mb-8 max-w-2xl">
        No threads, no walls of text. Two characters, one question, vote and drop a one-line take on
        your side. The meter moves live.
      </p>

      <section aria-labelledby="new-h" className="panel halftone mb-12 p-5">
        <h2 id="new-h" className="h-display mb-3 text-3xl">
          Start a showdown
        </h2>
        {d.signedIn ? (
          <Form
            method="post"
            className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr_1.2fr_auto]"
          >
            <Pick name="a" label="Fighter A" def={d.pre} />
            <span className="h-display hidden pb-2 text-3xl text-c1-text-card md:block">VS</span>
            <Pick name="b" label="Fighter B" def={null} />
            <label className="block">
              <span className="kicker mb-1 block text-card-fg!">Question</span>
              <select name="prompt" className="field" required>
                {Object.entries(VERSUS_PROMPTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-c1" disabled={busy}>
              <IconVs /> Go
            </button>
            {actionData?.error && (
              <p role="alert" className="text-sm md:col-span-5">
                {actionData.error}
              </p>
            )}
          </Form>
        ) : (
          <p>
            <Link to="/login?next=/versus" className="font-semibold underline">
              Sign in
            </Link>{' '}
            to start a debate. Anyone can vote.
          </p>
        )}
      </section>

      <ul className="grid gap-6 md:grid-cols-2">
        {d.debates.map((v, i) =>
          v.a && v.b ? (
            <m.li
              key={v.id}
              initial={{ y: 24 }}
              whileInView={{ y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 2) * 0.05 }}
            >
              <Link
                to={`/versus/${v.id}`}
                className="panel group block overflow-hidden transition-transform hover:-translate-y-1"
              >
                <div className="relative grid h-36 grid-cols-2 border-line border-b-[3px]">
                  {[v.a, v.b].map((s, k) => (
                    <div
                      key={s.slug}
                      className="relative overflow-hidden"
                      style={{ background: s.c1 }}
                    >
                      {s.photo && (
                        <img
                          src={photoSrc(s.photo)}
                          srcSet={photoSrcSet(s.photo)}
                          sizes="(min-width: 768px) 25vw, 50vw"
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover opacity-80 mix-blend-luminosity"
                        />
                      )}
                      {/* Name on a solid plate in the tile's colour (never over the photo), kept clear
                          of the centre VS badge. */}
                      <span
                        className={`h-display absolute bottom-2 ${k ? 'right-2 text-right' : 'left-2'} max-w-[calc(100%-3rem)] border-2 border-line px-1.5 text-2xl leading-tight`}
                        style={{ background: s.c1, color: onColor(s.c1) }}
                      >
                        {s.name}
                      </span>
                    </div>
                  ))}
                  <span className="burst absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center bg-c3 font-display text-2xl text-on-c3 transition-transform group-hover:rotate-12">
                    VS
                  </span>
                </div>
                <div className="space-y-3 p-4">
                  <p className="h-head text-xl">
                    {v.prompt}{' '}
                    {v.official && <span className="chip pointer-events-none ml-1">Official</span>}
                  </p>
                  <VoteBar a={v.va} b={v.vb} ca={v.a.c1} cb={v.b.c1} />
                  <p className="text-muted text-sm">{v.takes} takes</p>
                </div>
              </Link>
            </m.li>
          ) : null,
        )}
      </ul>
      {d.pages > 1 && (
        <nav aria-label="Debate pages" className="mt-10 flex justify-center gap-3">
          {d.page > 1 && (
            <Link to={`?page=${d.page - 1}`} className="btn">
              Newer
            </Link>
          )}
          <span className="self-center font-head">
            {d.page} / {d.pages}
          </span>
          {d.page < d.pages && (
            <Link to={`?page=${d.page + 1}`} className="btn btn-c1">
              More debates
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

/** Typeahead backed by /api/characters — the page never ships the whole roster. */
function Pick({
  name,
  label,
  def,
}: {
  name: string;
  label: string;
  def: { slug: string; name: string } | null;
}) {
  const f = useFetcher<{ hits: { slug: string; name: string; u: string }[] }>();
  const [text, setText] = useState(def?.name ?? '');
  const [slug, setSlug] = useState(def?.slug ?? '');
  const id = `pick-${name}`;
  const hits = f.data?.hits ?? [];
  return (
    <label className="block">
      <span className="kicker mb-1 block text-card-fg!">{label}</span>
      <input
        name={name}
        value={text}
        required
        autoComplete="off"
        list={id}
        placeholder="Type a name…"
        className="field"
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const hit = hits.find((h) => h.name === v);
          setSlug(hit?.slug ?? '');
          if (!hit && v.trim().length >= 2)
            f.load(`/api/characters?q=${encodeURIComponent(v.trim())}`);
        }}
      />
      <input type="hidden" name={`${name}_slug`} value={slug} />
      <datalist id={id}>
        {hits.map((h) => (
          <option key={h.slug} value={h.name}>
            {h.u}
          </option>
        ))}
      </datalist>
    </label>
  );
}
