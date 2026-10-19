# Our Little Memory Bucket

Private, mobile-first keepsake site. Spec: `PRD/PRD-04.md` (supersedes PRD-03, 02, 01). Theme: "The Ride" (bike through the mountains, golden hour).
Stack: Next.js 15 (App Router) + TypeScript + Tailwind 3 (fonts self-hosted via @fontsource: Bebas Neue, DM Sans, Fraunces, Caveat), Supabase (Postgres, private Storage, Auth), Vercel.

## Status
- [x] **Phase 1 Foundation**: scaffold, ride theme, Supabase wiring, migrations 0001+0002 + dev seed, flirty gate "The Checkpoint" (FR-00), middleware
- [x] **Phase 2 Recipient experience**: Welcome, 26-moment tour, Top of the Mountain, Saddlebag, Route (grid + timeline), Stop detail with photo/video/voice players, Postcards, Pit Stops, Summit letter, Pull Over, About, Note (disabled)
- [ ] Phase 3 Admin
- [ ] Phase 4 Polish and launch

## Setup
1. `npm install`
2. Create a Supabase project and run, in order, `supabase/migrations/0001_init.sql` then `0002_ride_theme.sql`, then `0003_prd04.sql` in the SQL editor (0001 also creates the private `memories` bucket).
3. Copy `.env.example` to `.env.local` and fill it in. In production set the same variables in Vercel.
   - `GATE_ANSWERS` and `GATE_SECRET` are yours to set. Never commit them or paste them in chat.
   - Generate a secret: `openssl rand -base64 48`
4. Local dev only: `supabase/seed.sql` adds placeholder content. **Never run it in production.**
5. `npm run dev`

## Putting the 26 moments in
Put the photos and `moments.json` in `private-media/` (never committed), then:
- `npm run import:moments -- --dry-run` checks everything without uploading.
- `npm run import:moments` converts (HEIC to JPEG, rotate, strip EXIF/GPS, resize, WebP + thumbnail), uploads to the private `memories` bucket and upserts the rows. It is safe to re-run. Needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- `npm run import:moments -- --local` writes the processed files to `.dev-media/` instead, so you can preview before Supabase is set up: `CONTENT_SOURCE=fixture npm run dev` (dev only, disabled in production).
- `npm run dev:fixture` makes a fully synthetic preview in `.dev-fixture/` (`FIXTURE_DIR=.dev-fixture CONTENT_SOURCE=fixture npm run dev`).

## Launch check
`npm run vercel-build` runs `scripts/check-launch.mjs` first. On a production deploy it fails while required env vars are missing or the Top of the Mountain `closing_message` (in `site_settings`) is empty or still a placeholder. Previews and local builds are not blocked.

## Scripts
`npm run lint` · `npm run typecheck` · `npm test` · `npm run build`

## Gate copy
All gate messages and clues have defaults in `src/lib/gate/copy.ts` (server only, never shipped to the browser). Override any of them in `site_settings` (`gate_question`, `gate_wrong_1`, `gate_clue_1`, `gate_clue_2`, `gate_wrong_more`, `gate_rate_limited`, `gate_success`). Wrap a letter in `**double asterisks**` to render it as a number-plate badge.

## Revoking access
Change `GATE_SECRET` in Vercel and redeploy: every device is logged out.

## Notes
- `middleware.ts` lives in `src/` (required when using a `src` folder).
- `_prototype-v0/` is the earlier static prototype, kept for reference.
- `_to_delete/` holds a partial `node_modules` left by a failed install on the synced folder. You can delete it.

## Story arc (PRD-05)

- Run migration `supabase/migrations/0004_story_arc.sql` after 0001–0003.
- `private-media/story.json` (breakdown words, repair lines, closing line) is imported verbatim by `npm run import:moments` into `site_settings`. It is never committed.
- `npm run check-launch` (also run on Vercel production builds) blocks deploys while any `[[` / `[DEV]` placeholder, empty closing line or empty breakdown words remain.

## Admin (`/admin`)

1. In Supabase → Auth → URL configuration, add `https://<your-domain>/admin/auth/callback` (and the local one) as a redirect URL.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `GATE_SECRET`.
3. Open `/admin`, enter `ADMIN_EMAIL`, click the emailed link. Any other email gets the same reply and no link.

What it does: memories (create, edit, reorder, publish, delete with their files), media upload straight to Supabase Storage via signed URLs (photos are resized and EXIF-stripped in the browser, video posters generated), postcards, little things, settings (gate copy, welcome, story arc, letter), and "View as her" (6-hour preview cookie). Publishing a memory requires alt text on every media item. Text is saved exactly as typed.
Every API route re-checks the Supabase session and `ADMIN_EMAIL` on the server and rejects cross-origin writes.

## Day and night

`SkyClock` (in the root layout) runs one 60-second sky cycle and switches the whole app between light and dark with it (reduced-motion users stay in light mode). The colour tokens in `globals.css` have night values under `html[data-mode="night"]` and crossfade via registered `@property` tokens. Base Camp and the summit use `SkyBackdrop` + `LiveScene` (sun and moon, stars, scrolling mountains, the bike with its headlight at night). The bike image is `public/rider.webp`.

## The story after Moment 26 (v2)

Moment 26 → `/the-breakdown` (bike stops; after 5 s a round PUSH button; 8 taps grow it into a heart) → `/the-breakdown/words` (the tag-team moment: one photo + words) → `/the-breakdown/storm` (8 s: rain, thunder, sun, then a note) → `/the-ring` (cracked diamond ring; one button mends it; message) → `/the-end`.

Copy and photo come from `private-media/story.json` (verbatim), then `npm run import:moments` (add `-- --local` for the local preview):

```json
{
  "push": { "hint": "…", "pushing": "…" },
  "tagTeam": { "text": "…", "photo": "file-name.jpg" },
  "storm": { "note": "…" },
  "ring": { "button": "…", "message": "…", "continueButton": "…" }
}
```
`photo` is a file in `private-media/story/`. Any key you leave out uses a built-in DRAFT line (see `DEFAULT_ARC` in `src/lib/content/defaults.ts`); `npm run check:launch` lists which ones are still drafts. Run migration `0005_story_arc_v2.sql`. All of it is editable in `/admin/settings`.

## PRD-07 refinements

- Welcome always shows one button, "Let's begin 🏍️" → Moment 1 (no resume, no "start from the beginning").
- `/the-breakdown`: title "Uh oh… the bike stopped 🥺" fades in, holds, fades out, then the reassurance line (`breakdownReassure`) and the PUSH button appear. After the heart, only the heart, the words and Next remain. Timings live in `BREAKDOWN_AT` (`src/lib/story/flow.ts`).
- No Back buttons on `/the-breakdown` and `/the-breakdown/words`.
- No visible header text on any page (no "Saddlebag" link, no status label). The road progress bar stays; a hidden heading keeps each page announced.
- `/the-breakdown/storm`: centered message (`stormMessage`) from ~1s until the sun comes out.
- New editable story-arc keys (stored in `site_settings.story_arc`, no migration): `breakdownReassure`, `stormMessage`. In `story.json` they are `breakdown.reassure` and `storm.message`. The breakdown title still comes from `breakdown_title` (default is the PRD-07 copy).

### PRD-07 §7–8 (gate tip and ring typewriter)

- Gate: the tip "Tip: the word you used to call me 😉" is always visible under the question (`site_settings.gate_tip`, migration `0006_gate_tip.sql`; run it in Supabase). Clues: 1st miss → "ends with a", 2nd miss → "starts with m", 3rd+ adds the "my love" line. The letter badges render in lowercase. The answer is never stored in code: set `GATE_ANSWERS` yourself.
- Ring: `ring.story` from `story.json` (verbatim, stored as story-arc key `ringStory`) types out under the cracked ring (~40ms/char, pauses at commas, full stops and runs of dots, slower tail). Tap the text to finish. The "Mend it 🤍" button appears only after typing ends. `npm run check:launch` blocks production if the ring story is missing.

### PRD-07 §9 (family reward slide)

- After the ring mends: mended message → (~1s) `ring.afterMend` → (~1s) the "click and see...." button (`ring.afterMendButton`) → `/our-family`.
- `/our-family`: golden sky, white flash, the photo fades and scales in with sparkles, the caption (`family.caption`) fades in, then the quiet "Ride to the top 🏔️" button → `/the-end`. No header text.
- `family.image` in `story.json` (e.g. `family.png`, kept in `private-media/`) is converted to WebP with EXIF stripped by `npm run import:moments` and stored privately as `story/family.webp`. `check:launch` blocks production if the family photo is missing.
