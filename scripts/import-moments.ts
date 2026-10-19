/**
 * FR-11: one-time import of the 26 moments.
 *
 *   npm run import:moments              upload to Supabase (needs .env.local) and upsert rows
 *   npm run import:moments -- --dry-run process images + print the summary, change nothing
 *   npm run import:moments -- --local   write a dev fixture to .dev-media/ (no Supabase) for CONTENT_SOURCE=fixture
 *   add  --only 5  to process a single moment
 *
 * Idempotent (upserts by slug). Originals in private-media/ are never modified. Nothing is written to public/.
 * Captions are copied VERBATIM and read back after upload to prove it. Captions are never printed.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./lib/env";
import { processImage } from "./lib/images";
import { countPlaceholders, parseStory, storyToRow, storyToSettings } from "../src/lib/content/story";

interface MomentEntry { number: number; image: string; text: string }

const args = process.argv.slice(2);
const LOCAL = args.includes("--local");
const DRY = args.includes("--dry-run");
const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? Number(args[onlyIdx + 1]) : null;

const ROOT = process.cwd();
const JSON_PATH = path.join(ROOT, "private-media", "moments.json");
const IMG_DIR = path.join(ROOT, "private-media", "moments");
const STORY_PATH = path.join(ROOT, "private-media", "story.json");
const pad = (n: number) => String(n).padStart(2, "0");
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;

async function main() {
  loadEnvLocal();
  if (!fs.existsSync(JSON_PATH)) throw new Error(`Missing ${JSON_PATH}`);
  const parsed = JSON.parse(fs.readFileSync(JSON_PATH, "utf8")) as { moments: MomentEntry[] };
  let moments = parsed.moments;
  if (!Array.isArray(moments) || !moments.length) throw new Error("moments.json has no moments[]");
  if (ONLY) moments = moments.filter((m) => m.number === ONLY);

  // Fail early on missing files / bad numbering.
  for (const m of moments) {
    if (!Number.isInteger(m.number) || typeof m.text !== "string") throw new Error(`Bad entry for moment ${m.number}`);
    if (!fs.existsSync(path.join(IMG_DIR, m.image))) throw new Error(`Missing image for moment ${m.number}: ${m.image}`);
  }

  const sb = !LOCAL && !DRY ? makeClient() : null;
  const outDir = path.resolve(process.env.FIXTURE_DIR || ".dev-media");
  const rows: Record<string, string>[] = [];
  const fixtureMemories: unknown[] = [];

  for (const m of moments.sort((a, b) => a.number - b.number)) {
    const slug = `moment-${pad(m.number)}`;
    const srcPath = path.join(IMG_DIR, m.image);
    const srcBuf = fs.readFileSync(srcPath);
    const p = await processImage(srcBuf, path.extname(m.image));
    const fullPath = `memories/${slug}/full.webp`;
    const thumbPath = `memories/${slug}/thumb.webp`;
    const alt = `Moment ${m.number} photo`;
    let published = "no (dry run)";

    if (LOCAL) {
      for (const [rel, buf] of [[fullPath, p.full], [thumbPath, p.thumb]] as const) {
        const dest = path.join(outDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
      }
      fixtureMemories.push({
        id: `fixture-${slug}`, slug, title: `Moment ${m.number}`, caption: m.text, dateLabel: null, location: null, sortOrder: m.number,
        media: [{ id: `fixture-${slug}-img`, kind: "image", storagePath: fullPath, posterPath: thumbPath, alt, label: null, width: p.width, height: p.height, durationSeconds: null, sortOrder: 0 }],
      });
      published = "local fixture";
    } else if (sb) {
      const bucket = sb.storage.from("memories");
      for (const [rel, buf] of [[fullPath, p.full], [thumbPath, p.thumb]] as const) {
        const { error } = await bucket.upload(rel, buf, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
        if (error) throw new Error(`Upload failed for ${rel}: ${error.message}`);
      }
      const { data: mem, error: memErr } = await sb
        .from("memories")
        .upsert({ slug, title: `Moment ${m.number}`, caption: m.text, sort_order: m.number, is_published: true }, { onConflict: "slug" })
        .select("id, caption")
        .single();
      if (memErr || !mem) throw new Error(`Upsert failed for ${slug}: ${memErr?.message}`);
      if (mem.caption !== m.text) throw new Error(`Caption round-trip mismatch for ${slug}. Aborting so nothing is silently altered.`);
      await sb.from("memory_media").delete().eq("memory_id", mem.id).eq("kind", "image");
      const { error: mediaErr } = await sb.from("memory_media").insert({
        memory_id: mem.id, kind: "image", storage_path: fullPath, poster_path: thumbPath, alt_text: alt, width: p.width, height: p.height, sort_order: 0,
      });
      if (mediaErr) throw new Error(`Media insert failed for ${slug}: ${mediaErr.message}`);
      published = "yes";
    }

    rows.push({
      moment: String(m.number), source: p.srcFormat, "source size": kb(srcBuf.length), "final size": kb(p.full.length),
      thumb: kb(p.thumb.length), dimensions: `${p.width}x${p.height}`, "exif stripped": p.exifStripped ? "yes" : "NO", published,
    });
  }

  // PRD-05 FR-11 step 6: story.json (breakdown, repair, closing line), verbatim. Text is never printed.
  let storyNote = "story.json not found (skipped)";
  let storySettings: Record<string, unknown> = {};
  if (!ONLY && fs.existsSync(STORY_PATH)) {
    const story = parseStory(JSON.parse(fs.readFileSync(STORY_PATH, "utf8")));
    const placeholders = countPlaceholders(story);
    let photo: { path: string; width: number | null; height: number | null } | null = null;
    const storyDir = path.join(ROOT, "private-media", "story");
    // story.json can name the photo; otherwise use private-media/story/hand.* if it exists
    if (!story.tagTeamPhotoFile && fs.existsSync(storyDir)) story.tagTeamPhotoFile = fs.readdirSync(storyDir).find((f) => /^hand\.(jpe?g|png|heic|heif|webp)$/i.test(f)) ?? null;
    const putImage = async (file: string, rel: string, label: string): Promise<{ path: string; width: number | null; height: number | null }> => {
      const p = await processImage(fs.readFileSync(file), path.extname(file));
      if (LOCAL) {
        const dest = path.join(outDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, p.full);
      } else if (sb) {
        const { error } = await sb.storage.from("memories").upload(rel, p.full, { contentType: "image/webp", upsert: true });
        if (error) throw new Error(`Uploading the ${label} failed: ${error.message}`);
      }
      return { path: rel, width: p.width, height: p.height };
    };
    if (story.tagTeamPhotoFile) {
      const file = path.join(storyDir, story.tagTeamPhotoFile);
      if (!fs.existsSync(file)) throw new Error(`story.json tagTeam.photo not found: private-media/story/${story.tagTeamPhotoFile}`);
      photo = await putImage(file, "story/tag-team.webp", "tag-team photo");
    }
    // PRD-07 §9: the family photo named in story.json (family.image), relative to private-media/
    let familyPhoto: { path: string; width: number | null; height: number | null } | null = null;
    if (story.familyImageFile) {
      const file = path.join(ROOT, "private-media", story.familyImageFile);
      if (!fs.existsSync(file)) throw new Error(`story.json family.image not found: private-media/${story.familyImageFile}`);
      familyPhoto = await putImage(file, "story/family.webp", "family photo");
    }
    storySettings = storyToSettings(story, photo, familyPhoto);
    storyNote = `story.json: ${Object.keys(story.arc).length} story-arc text(s)${story.tagTeamPhotoFile ? " + tag-team photo" : ""}${story.familyImageFile ? " + family photo" : ""}, ${placeholders} placeholder(s) remaining${placeholders ? " (production deploy stays blocked until they are replaced)" : ""}`;
    if (sb) {
      const row = storyToRow(story, photo, familyPhoto);
      const { data: saved, error } = await sb.from("site_settings").upsert({ id: 1, ...row }, { onConflict: "id" }).select("*").single();
      if (error || !saved) throw new Error(`Saving story.json failed: ${error?.message}`);
      for (const [k, v] of Object.entries(row)) {
        if (JSON.stringify(saved[k]) !== JSON.stringify(v)) throw new Error(`story.json round-trip mismatch on ${k}. Aborting so nothing is silently altered.`);
      }
    }
  }

  if (LOCAL) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "content.json"), JSON.stringify({ settings: storySettings, memories: fixtureMemories, notes: [], littleThings: [] }));
  }

  console.table(rows);
  console.log(storyNote + ".");
  const bad = rows.filter((r) => r["exif stripped"] !== "yes");
  console.log(`${rows.length} moment(s) processed${LOCAL ? ` -> ${outDir}` : DRY ? " (dry run, nothing written)" : " and uploaded"}.${bad.length ? ` WARNING: metadata still present on ${bad.length}.` : ""}`);
  if (bad.length) process.exitCode = 1;
}

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (or use --local / --dry-run).");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
