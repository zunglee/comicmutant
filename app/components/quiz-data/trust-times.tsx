import { QUESTION_SECONDS } from '~/lib/quiz-contract';

/**
 * One game's answer pace against the reading floor, as a table (time, floor, margin) so it reads the
 * same with a screen reader, and a margin that is under the floor says so in words as well as colour.
 */
export function TrustTimes({ times, floors }: { times: number[]; floors: number[] }) {
  const rows = times.map((t, i) => {
    const floor = floors[i] ?? 0;
    // The server caps a timeout at the clock plus grace, so any answer at or past the clock ran out.
    return { n: i + 1, t, floor, margin: t - floor, timedOut: t >= QUESTION_SECONDS };
  });
  const under = rows.filter((r) => !r.timedOut && r.margin < 0).length;
  const timeouts = rows.filter((r) => r.timedOut).length;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold underline">
        Times against the reading floor:{' '}
        {under === 0
          ? 'every answer slower than its floor'
          : `${under} of ${rows.length} faster than the floor`}
        {timeouts > 0 && ` · ${timeouts} timed out`}
      </summary>
      <div className="mt-2 overflow-hidden rounded border-2 border-line">
        <table className="w-full text-center text-xs tabular-nums">
          <caption className="sr-only">
            Per answer: time taken, reading floor, and the margin
          </caption>
          <thead>
            <tr className="bg-bg">
              <th scope="col" className="p-1 text-left font-semibold">
                Q
              </th>
              <th scope="col" className="p-1 font-semibold">
                Time
              </th>
              <th scope="col" className="p-1 font-semibold">
                Floor
              </th>
              <th scope="col" className="p-1 font-semibold">
                Margin
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.n} className="border-line border-t">
                <th scope="row" className="p-1 text-left font-normal">
                  {r.n}
                </th>
                {r.timedOut ? (
                  <td colSpan={3} className="p-1 italic">
                    timed out (the clock ran out)
                  </td>
                ) : (
                  <>
                    <td className="p-1">{r.t.toFixed(1)} s</td>
                    <td className="p-1">{r.floor.toFixed(1)} s</td>
                    <td className={`p-1 ${r.margin < 0 ? 'font-bold' : ''}`}>
                      {r.margin >= 0 ? '+' : '\u2212'}
                      {Math.abs(r.margin).toFixed(1)} s{r.margin < 0 && ' (under)'}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
