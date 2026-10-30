import { SectionHead } from '~/components/bits';
import type { Route } from './+types/about';

export const meta: Route.MetaFunction = () => [{ title: 'About & credits — ComicMutant' }];

export default function About() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-10">
      <SectionHead level={1} kicker="The fine print, made fun" title="About" />
      <div className="panel space-y-4 p-6 leading-relaxed">
        <p>
          ComicMutant is an unofficial, non-commercial fan site. No ads, no merchandise, no paid
          anything. We are not affiliated with, sponsored by or endorsed by Marvel, DC, Raj Comics,
          Diamond Comics, Image, Dark Horse, Shueisha, any film studio or any other rights holder.
          Character names and trademarks belong to their owners.
        </p>
        <h2 className="h-display text-3xl">The two-sided rule</h2>
        <p>
          <strong>Published characters</strong> appear only as facts, trivia, quiz questions, story
          summaries written in our own words, colour themes and abstract motif animations. We never
          reproduce comic art, covers, logos, film stills or quotes, and we never invent new stories
          or outcomes for them.
        </p>
        <p>
          <strong>CM Originals</strong> are our own characters. They are the only ones drawn as
          figures, and the only cast in the Arena games.
        </p>
        <h2 className="h-display text-3xl">Credits</h2>
        <p>
          Character photos (where shown) come from Wikimedia Commons under CC licences, credited on
          each character page. Fonts: Bangers, Russo One and Chakra Petch (SIL Open Font License).
          Every animation is generated in your browser by our own code.
        </p>
        <h2 className="h-display text-3xl">Secrets</h2>
        <p>
          The site hides a few easter eggs. Try the classic cheat code on your keyboard, or type a
          sound effect anywhere that isn't a text box. Type the site's own name and see what
          happens.
        </p>
        <h2 className="h-display text-3xl">Found a wrong fact?</h2>
        <p>
          Every character page links its sources. Drop a hot take on the page and a mod will check
          it.
        </p>
      </div>
    </div>
  );
}
