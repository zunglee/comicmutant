# Security

Threat model: a public fan site with nickname accounts and short user text. Assets worth protecting:
account sessions, the integrity of votes/reports (brigading), the server's CPU/memory, visitors'
privacy, and the site's reputation (abuse in takes). No payments, no email, no personal data.

## Configuration (production refuses to start without these)

| Variable | Why |
|---|---|
| `COMICMUTANT_ORIGIN` | exact site origin for the cross-site POST check |
| `COMICMUTANT_SECRET` (32+ chars) | keys rate-limit bucket hashes; peppers password hashes |
| `COMICMUTANT_IP_HEADER` | which header carries the client IP: `cf-connecting-ip` (only behind Cloudflare), `x-forwarded-for` (right-most hop, appended by your proxy), or `none` |

See `.env.example`. Client-supplied IP headers are never trusted by default; with `none`, all
clients share one rate-limit bucket (fails closed).

## Controls

| Area | Control | Where |
|---|---|---|
| Passwords | PBKDF2-SHA256 100k (Workers' ceiling) over an HMAC pepper; constant-work for unknown names; ≤4 hashes in flight, else 503 | `.server/auth.ts` |
| Sessions | random 256-bit token, stored as SHA-256; `__Host-` cookie, HttpOnly, SameSite=Lax, Secure in prod; 21-day rolling idle expiry; banned → sessions deleted | `.server/auth.ts` |
| CSRF | Origin must equal `COMICMUTANT_ORIGIN` (unparseable/`null` → 403); no Origin → `Sec-Fetch-Site: cross-site` refused; SameSite=Lax | `.server/guard.ts#assertSameOrigin` |
| Request bodies | urlencoded only, 8 KB cap enforced while streaming, before auth or hashing | `.server/guard.ts#readForm` |
| Rate limits | fixed-window counters (one atomic upsert), HMAC-hashed keys; join 5/h/IP, login 30/15 min/IP + 8/15 min/IP+name, takes 6/min, reactions 60/min, reports 20/h, new debates 5/h, votes 30/min/voter, new guest voters 5/h/IP/debate | routes + `allow()` |
| Redirects | `safeNext` refuses control chars and backslashes, then requires same origin after URL parsing | `.server/auth.ts` |
| XSS | React escaping only (no `dangerouslySetInnerHTML`); theme cookies resolve to known slugs before reaching inline styles; content URLs must be `https://`; production CSP with a per-request script nonce | `entry.server.tsx`, `lib/schema.ts` |
| Takes | NFKC + zero-width/bidi stripping, stacked-mark limit, look-alike-tolerant block list, link filter (incl. `[.]`/`dot`), 220 chars | `.server/community.ts#checkTake` |
| Reports | only from accounts ≥1 h old with a visible take; ≤5 per reporter per author per day; 3 trusted reports auto-hide; a mod-restored take can't be auto-hidden again | `report()` |
| Votes | fans as themselves; guests by random HttpOnly cookie id (never IP/UA-derived) | `api/vote.ts`, `.server/voter.ts` |
| Moderation | `/mod` (role `mod`): restore / keep hidden / soft-ban (sessions, votes, reactions removed); mods can't be banned there; every action logged in `mod_actions` | `modRule()` |
| Names | 3–20 `[A-Za-z0-9_]`, reserved staff/brand names, look-alike skeleton unique | `validName`, `users.skeleton` |
| Headers | nosniff, Referrer-Policy, Permissions-Policy, COOP, HSTS (prod) on documents and data requests; frame-ancestors none | `entry.server.tsx` |
| Caching | anonymous GET documents `s-maxage=60` + `Vary: Cookie`; anything with a session `private, no-store` | `entry.server.tsx#cachePolicy` |
| Dev surfaces | `/lab/clips` 404s in production unless `COMICMUTANT_LAB=1` | `routes/lab-clips.tsx` |

## Known limits

- `style-src 'unsafe-inline'` remains (React style attributes carry theme colours).
- Guests who clear cookies can vote again, bounded by 5 new guest voters per IP per debate per hour.
- No email recovery by design: a lost password means a new nickname.
- Block list is deliberately short; reports + mods carry the rest.

Reviews: `reports/2026-10-30-build.md` § Reviews lists every finding and its fix.
