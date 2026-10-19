/**
 * Generates SYNTHETIC preview content (no real photos or text) into .dev-fixture/ so the whole UI can be
 * exercised without Supabase. Use: npm run dev:fixture && FIXTURE_DIR=.dev-fixture npm run dev:preview
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const dir = path.resolve(process.env.FIXTURE_DIR || ".dev-fixture");
const TRICKY = [
  "restarunt  double  space....",
  "line one\nline two\n\nline four",
  "chupuuu 😏 \"quoted\" it's <b>&</b>",
  "என் அன்பே, நீ தான் எல்லாம்",
  "lowercase start, no final period",
];
const SIZES: [number, number][] = [[900, 1600], [1600, 900], [1200, 1200], [1500, 2000]];

async function img(file: string, w: number, h: number, label: string, long: number) {
  const s = Math.min(1, long / Math.max(w, h));
  const W = Math.round(w * s), H = Math.round(h * s);
  const hue = (label.length * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="hsl(${hue},55%,72%)"/><text x="50%" y="50%" font-size="${Math.round(W / 6)}" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).webp({ quality: 80 }).toFile(file);
  return { W, H };
}

async function main() {
  fs.rmSync(dir, { recursive: true, force: true });
  const memories: unknown[] = [];
  for (let n = 1; n <= 26; n++) {
    const id = `moment-${String(n).padStart(2, "0")}`;
    const [w, h] = SIZES[n % SIZES.length];
    const { W, H } = await img(path.join(dir, "memories", id, "full.webp"), w, h, `#${n}`, 2000);
    await img(path.join(dir, "memories", id, "thumb.webp"), w, h, `#${n}`, 600);
    memories.push({
      id: `fx-${id}`, slug: id, title: `Moment ${n}`, caption: `[synthetic] ${TRICKY[n % TRICKY.length]}`, dateLabel: null, location: null, sortOrder: n,
      media: [{ id: `fx-${id}-img`, kind: "image", storagePath: `memories/${id}/full.webp`, posterPath: `memories/${id}/thumb.webp`, alt: `Moment ${n} photo`, label: null, width: W, height: H, durationSeconds: null, sortOrder: 0 }],
    });
  }
  // one multi-media stop: image + voice note + video
  const sid = "stop-extra";
  const base = path.join(dir, "memories", sid);
  fs.mkdirSync(base, { recursive: true });
  const { W, H } = await img(path.join(base, "full.webp"), 1200, 900, "stop", 2000);
  await img(path.join(base, "thumb.webp"), 1200, 900, "stop", 600);
  const media: unknown[] = [{ id: "fx-s-img", kind: "image", storagePath: `memories/${sid}/full.webp`, posterPath: `memories/${sid}/thumb.webp`, alt: "Synthetic photo", label: "A photo", width: W, height: H, durationSeconds: null, sortOrder: 0 }];
  try {
    execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=4", path.join(base, "voice.mp3")], { stdio: "ignore" });
    media.push({ id: "fx-s-aud", kind: "audio", storagePath: `memories/${sid}/voice.mp3`, posterPath: null, alt: "Voice note", label: "A voice note", width: null, height: null, durationSeconds: 4, sortOrder: 1 });
    execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=15:duration=3", "-pix_fmt", "yuv420p", path.join(base, "clip.mp4")], { stdio: "ignore" });
    await img(path.join(base, "poster.webp"), 640, 360, "play", 640);
    media.push({ id: "fx-s-vid", kind: "video", storagePath: `memories/${sid}/clip.mp4`, posterPath: `memories/${sid}/poster.webp`, alt: "Synthetic clip", label: "A clip", width: 640, height: 360, durationSeconds: 3, sortOrder: 2 });
  } catch { console.log("ffmpeg not found: skipping synthetic audio/video"); }
  memories.push({ id: "fx-stop", slug: sid, title: "A synthetic stop", caption: "[synthetic] a stop with a photo, a voice note and a clip", dateLabel: "Someday", location: null, sortOrder: 27, media });

  const content = {
    settings: {
      closingMessage: "[DEV] synthetic closing line",
      arc: { tagTeamText: "[DEV] synthetic tag-team words\nwith a second line", stormNote: "[DEV] synthetic storm note", ringMessage: "[DEV] synthetic ring message", ringAfterMend: "[DEV] synthetic after-mend words", familyCaption: "[DEV] synthetic family caption", ringStory: "[DEV] A synthetic story, with commas, and a full stop. Then a long pause...... and the slow end: almost there" },
      breakdownScreens: ["[DEV] synthetic words, card one", "[DEV] card two\nwith a  double  space....", "[DEV] card three, lowercase no period"],
      letterParagraphs: ["[synthetic] Dear you,", "A paragraph\nwith a break."],
      letterSignature: "Me", letterDateLabel: "Today",
    },
    memories,
    notes: [{ id: "n1", category: "Things", title: "A postcard", body: "[synthetic] hello\nfrom the road" }, { id: "n2", category: null, title: "Another", body: "[synthetic] second" }],
    littleThings: [{ id: "l1", kind: "song", title: "A song", description: "[synthetic]", imagePath: null, url: "https://example.com" }, { id: "l2", kind: "place", title: "A place", description: null, imagePath: null, url: null }],
  };
  fs.writeFileSync(path.join(dir, "content.json"), JSON.stringify(content, null, 2));
  console.log(`Synthetic fixture written to ${dir}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
