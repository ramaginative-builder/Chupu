// Production launch guard (runs as part of `vercel-build`). Fails a PRODUCTION deploy while launch inputs are missing.
// Local builds and preview deploys are not blocked.
import fs from "node:fs";

const isProd = process.env.VERCEL_ENV === "production" || process.env.LAUNCH_CHECK === "1";
if (!isProd) { console.log("check:launch skipped (not a production deploy)."); process.exit(0); }

const problems = [];
if (process.env.CONTENT_SOURCE === "fixture") problems.push("CONTENT_SOURCE=fixture must not be set in production.");
for (const k of ["GATE_ANSWERS", "GATE_SECRET", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!process.env[k]) problems.push(`Missing env var ${k}.`);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  try {
    const cols = "closing_message,story_arc,breakdown_title,breakdown_screens,repair_button,repair_line,repair_continue,repair_continue_button,welcome_heading,welcome_body,letter_paragraphs,note_paragraphs";
    const res = await fetch(`${url}/rest/v1/site_settings?select=${cols}&id=eq.1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const row = (await res.json())?.[0] ?? {};
    const isPh = (s) => typeof s === "string" && (s.includes("[[") || s.includes("[DEV]"));
    if (!row.closing_message || !row.closing_message.trim()) problems.push("closing_message is empty: the Top of the Mountain closing line is still needed (story.json -> closingLine).");
    const arc = row.story_arc && typeof row.story_arc === "object" ? row.story_arc : {};
    const draft = ["pushHint", "pushing", "pushDone", "tagTeamText", "stormNote", "ringButton", "ringMessage", "ringContinueButton"].filter((k) => typeof arc[k] !== "string" || !arc[k].trim());
    if (draft.length) console.warn(`note: story arc still uses the built-in DRAFT text for: ${draft.join(", ")} (set them in story.json -> push / tagTeam / storm / ring).`);
    if (typeof arc.ringStory !== "string" || !arc.ringStory.trim()) problems.push("The ring screen message is missing (story.json -> ring.story); import it before deploying.");
    if (!arc.familyPhoto) problems.push("The family slide has no photo (story.json -> family.image); import it before deploying.");
    if (!arc.tagTeamPhoto) console.warn("note: no tag-team photo set (story.json -> tagTeam.photo); that screen will show text only.");
    const flat = Object.entries({ ...row, ...Object.fromEntries(Object.entries(arc).filter(([, v]) => typeof v === "string")) }).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]));
    const bad = [...new Set(flat.filter(([, v]) => isPh(v)).map(([k]) => k))];
    if (bad.length) problems.push(`Placeholder text ([[...]] or [DEV]) is still present in: ${bad.join(", ")}.`);
    const mem = await fetch(`${url}/rest/v1/memories?select=slug&or=(caption.ilike.*[[*,title.ilike.*[DEV]*)&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const memRows = await mem.json();
    if (Array.isArray(memRows) && memRows.length) problems.push("A memory still contains placeholder or [DEV] text.");
  } catch (e) {
    problems.push(`Could not read site_settings to verify content (${e instanceof Error ? e.message : e}).`);
  }
}
if (fs.existsSync(".dev-fixture") && process.env.VERCEL_ENV === "production") console.log("note: .dev-fixture present but ignored in production.");

if (problems.length) {
  console.error("\nLaunch check failed:\n - " + problems.join("\n - ") + "\n");
  process.exit(1);
}
console.log("check:launch OK");
