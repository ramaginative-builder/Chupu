import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import MomentCard from "@/components/MomentCard";
import { splitEmoji } from "@/lib/emoji";
import type { TourMoment } from "@/lib/content/types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function render(text: string, n = 1): string {
  const m: TourMoment = { number: n, slug: `moment-${String(n).padStart(2, "0")}`, text, imageUrl: null, alt: `Moment ${n}`, width: 3, height: 4 } as TourMoment;
  const html = renderToStaticMarkup(createElement(MomentCard, { moment: m }));
  const mm = html.match(/<p data-moment-text[^>]*>([\s\S]*?)<\/p>/);
  expect(mm).toBeTruthy();
  return mm![1];
}

describe("moment text is rendered verbatim", () => {
  const tricky = [
    "restarunt  double  space....",
    "  leading and trailing  ",
    "line one\nline two\n\nline four",
    "chupuuu 😏 \"quoted\" it's <b>&</b>",
    "என் அன்பே, நீ தான் எல்லாம்",
    "lowercase start, no period",
  ];
  it.each(tricky)("keeps %j exactly", (t) => {
    expect(render(t)).toBe(esc(t));
  });

  it("matches the JSON text for all 26 when the real content is present", () => {
    const f = path.resolve(__dirname, "../.dev-media/content.json");
    const alt = path.resolve(__dirname, "../private-media/moments.json");
    const file = [alt, f].find((x) => fs.existsSync(x));
    if (!file) return;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const list: { caption?: string; text?: string }[] = Array.isArray(data) ? data : (data.memories ?? data.moments ?? []);
    const texts = list.map((x) => x.caption ?? x.text).filter((x): x is string => typeof x === "string");
    texts.slice(0, 26).forEach((t, i) => expect(render(t, i + 1)).toBe(esc(t)));
  });

  it("styles never transform the text", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");
    const card = fs.readFileSync(path.resolve(__dirname, "../src/components/MomentCard.tsx"), "utf8");
    for (const bad of ["text-transform", "capitalize", "uppercase", "first-letter", "hyphens"]) {
      expect(css).not.toContain(bad);
      const line = card.split("\n").find((l) => l.includes("<p data-moment-text")) ?? "";
      expect(line).not.toContain(bad);
    }
  });
});

describe("splitEmoji", () => {
  it("round-trips exactly", () => {
    const s = "You made it! 🎉🥳💛";
    expect(splitEmoji(s).map((x) => x.text).join("")).toBe(s);
    expect(splitEmoji(s).filter((x) => x.emoji)).toHaveLength(3);
  });
});
