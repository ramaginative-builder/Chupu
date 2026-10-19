import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import PushFlow from "@/components/PushFlow";
import RingFlow from "@/components/RingFlow";
import GateForm from "@/components/GateForm";
import StormFlow from "@/components/StormFlow";
import { mapArc, customArcKeys } from "@/lib/content/arc";
import { DEFAULT_ARC } from "@/lib/content/defaults";
import { PUSHES_NEEDED, BREAKDOWN_AT, STORM_AT, breakdownStepAt, typeDelays, pushScale, stormPhaseAt } from "@/lib/story/flow";
import { mergeArc } from "@/lib/admin/rules";
import RoadProgress from "@/components/RoadProgress";
import { countPlaceholders, isPlaceholder, parseStory, storyToRow } from "@/lib/content/story";
import { PEAK_PCT, RIDE_END_PCT, RIDE_START_PCT, rideLabel, rideProgress } from "@/lib/story/progress";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const TRICKY = ["  leading  and  double  spaces....", "line one\nline two", "chupuuu 😏 \"quoted\" it's <b>&</b>", "என் அன்பே", "restarunt, no capital or period"];

describe("story.json is imported verbatim", () => {
  it("keeps every string exactly and ignores unknown keys", () => {
    const f = parseStory({
      _rules: "ignore me",
      breakdown: { title: TRICKY[0], screens: [TRICKY[1], TRICKY[2], "", 5] },
      repair: { button: TRICKY[3], line: TRICKY[4], continue: TRICKY[0], continueButton: TRICKY[1] },
      closingLine: TRICKY[2],
    });
    expect(f.breakdownTitle).toBe(TRICKY[0]);
    expect(f.breakdownScreens).toEqual([TRICKY[1], TRICKY[2]]);
    expect(f.repairLine).toBe(TRICKY[4]);
    expect(f.closingLine).toBe(TRICKY[2]);
    expect(storyToRow(f).closing_message).toBe(TRICKY[2]);
    expect(Object.keys(f)).not.toContain("_rules");
  });
  it("detects placeholders", () => {
    expect(isPlaceholder("[[Ram to provide]]")).toBe(true);
    expect(isPlaceholder("[DEV] x")).toBe(true);
    expect(isPlaceholder("a real line")).toBe(false);
    expect(countPlaceholders(parseStory({ breakdown: { screens: ["[[a]]", "ok"] }, closingLine: "[[c]]" }))).toBe(2);
  });
  it("matches the real story.json when present (no text printed)", () => {
    const file = path.resolve(__dirname, "../private-media/story.json");
    if (!fs.existsSync(file)) return;
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const f = parseStory(raw);
    expect(f.breakdownScreens).toEqual(raw.breakdown.screens);
    expect(f.closingLine).toBe(raw.closingLine);
    expect(f.repairLine).toBe(raw.repair.line);
  });
});

describe("ride progress", () => {
  it("climbs from the start to the slope across the 26 moments, then the repair reaches the peak", () => {
    expect(rideProgress(1, 26)).toBe(RIDE_START_PCT);
    expect(rideProgress(26, 26)).toBe(RIDE_END_PCT);
    for (let n = 2; n <= 26; n++) expect(rideProgress(n, 26)).toBeGreaterThan(rideProgress(n - 1, 26));
    expect(PEAK_PCT).toBe(100);
  });
  it("labels each state in words", () => {
    expect(rideLabel("ride", 12, 26)).toBe("Moment 12 of 26");
    expect(rideLabel("stalled")).toBe("The bike stopped");
    expect(rideLabel("restart")).toBe("Back on the road");
    expect(rideLabel("summit")).toBe("The top");
  });
  it("exposes the state to assistive tech and greys the road ahead only while stopped", () => {
    const stalled = renderToStaticMarkup(createElement(RoadProgress, { pct: 85, mode: "stalled", label: "The bike stopped" }));
    expect(stalled).toContain('aria-valuetext="The bike stopped"');
    expect(stalled).toContain("opacity:0.85");
    const ride = renderToStaticMarkup(createElement(RoadProgress, { pct: 40, mode: "ride", label: "Moment 12 of 26" }));
    expect(ride).toContain("opacity:0");
    expect(ride).not.toContain("puff");
  });
});

describe("gate page", () => {
  it("shows the tip on first load, and no clue text", () => {
    const html = renderToStaticMarkup(createElement(GateForm, { question: "Q?", tip: "Tip: the word you used to call me 😉" }));
    expect(html).toContain("Tip: the word you used to call me 😉");
    expect(html).not.toMatch(/ends with|starts with/);
  });
});

describe("ring typewriter timing", () => {
  it("pauses after commas, full stops and runs of dots; the tail types slower", () => {
    const t = "a, b. c..... d";
    const d = typeDelays(t, 0);
    expect(d[1]).toBe(190);                    // comma
    expect(d[4]).toBe(450);                    // single full stop
    expect(d[9]).toBe(40);                     // inside the run
    expect(d[11]).toBe(900);                   // end of the run
    expect(d[0]).toBe(40);
    expect(typeDelays("abcd", 2)).toEqual([40, 40, 70, 70]);
  });
});

describe("story arc v2 copy", () => {
  it("parses push / tagTeam / storm / ring verbatim and keeps the photo filename", () => {
    const f = parseStory({ push: { hint: TRICKY[0] }, tagTeam: { text: TRICKY[1], photo: "x.jpg" }, storm: { note: TRICKY[2] }, ring: { button: TRICKY[3], story: TRICKY[1], message: TRICKY[4], continueButton: "" } });
    expect(f.arc).toEqual({ pushHint: TRICKY[0], tagTeamText: TRICKY[1], stormNote: TRICKY[2], ringButton: TRICKY[3], ringStory: TRICKY[1], ringMessage: TRICKY[4] });
    expect(f.tagTeamPhotoFile).toBe("x.jpg");
    const g = parseStory({ ring: { afterMend: TRICKY[2], afterMendButton: TRICKY[3] }, family: { image: "family.png", caption: TRICKY[4] } });
    expect(g.arc).toEqual({ ringAfterMend: TRICKY[2], ringAfterMendButton: TRICKY[3], familyCaption: TRICKY[4] });
    expect(g.familyImageFile).toBe("family.png");
    expect(storyToRow(g, null, { path: "story/family.webp", width: 3, height: 4 }).story_arc).toMatchObject({ familyPhoto: { path: "story/family.webp" }, familyCaption: TRICKY[4] });
    expect(mapArc({ familyPhoto: { path: "story/family.webp", width: 3, height: 4 } }).familyPhoto).toEqual({ path: "story/family.webp", width: 3, height: 4 });
    expect(DEFAULT_ARC.ringAfterMendButton).toBe("click and see....");
    expect(storyToRow(f, { path: "story/tag-team.webp", width: 1, height: 2 }).story_arc).toMatchObject({ tagTeamText: TRICKY[1], tagTeamPhoto: { path: "story/tag-team.webp" } });
    expect(countPlaceholders(parseStory({ ring: { message: "[[Ram to provide]]" } }))).toBe(1);
  });
  it("falls back to the drafts for anything missing and never trims what is set", () => {
    expect(mapArc({})).toEqual(DEFAULT_ARC);
    expect(mapArc({ ringMessage: TRICKY[0], stormNote: "   " }).ringMessage).toBe(TRICKY[0]);
    expect(mapArc({ stormNote: "   " }).stormNote).toBe(DEFAULT_ARC.stormNote);
    expect(customArcKeys({ ringMessage: "x", pushing: "" })).toEqual(["ringMessage"]);
  });
  it("admin merge stores text exactly and removes a key when emptied", () => {
    expect(mergeArc({ ringMessage: "a", tagTeamPhoto: { path: "p" } }, { ringMessage: TRICKY[0], stormNote: "" })).toEqual({ ringMessage: TRICKY[0], tagTeamPhoto: { path: "p" } });
    expect(mergeArc({ ringMessage: "a" }, { ringMessage: "", evil: "x" })).toEqual({});
  });
});

describe("push, storm and ring flow", () => {
  it("push button appears after 5 seconds and grows with every tap", () => {
    expect(breakdownStepAt(0)).toBe("title");
    expect(breakdownStepAt(BREAKDOWN_AT.titleOut)).toBe("out");
    expect(breakdownStepAt(BREAKDOWN_AT.reassure)).toBe("reassure");
    expect(breakdownStepAt(BREAKDOWN_AT.push)).toBe("push");
    expect(pushScale(0)).toBe(1);
    for (let n = 1; n <= PUSHES_NEEDED; n++) expect(pushScale(n)).toBeGreaterThan(pushScale(n - 1));
    expect(pushScale(99)).toBe(pushScale(PUSHES_NEEDED));
  });
  it("the storm plays rain, thunder, storm wind, a pleasant sun and then the note within 15 seconds", () => {
    expect(STORM_AT.note).toBe(15000);
    expect(stormPhaseAt(0)).toBe("rain");
    expect(stormPhaseAt(4000)).toBe("thunder");
    expect(stormPhaseAt(8000)).toBe("wind");
    expect(stormPhaseAt(11500)).toBe("sun");
    expect(stormPhaseAt(15000)).toBe("note");
  });
  it("first render: no push button yet, no note yet, ring still cracked, nothing asks for a reply", () => {
    const push = renderToStaticMarkup(createElement(PushFlow, { title: "Uh oh", reassure: "Calm down\nPress it", hint: "tap", pushing: "keep going", done: "we did it", next: "/x" }));
    expect(push).not.toContain("PUSH");
    expect(push).toContain("Uh oh");
    expect(push).not.toContain("Calm down");
    for (const html of [push, renderToStaticMarkup(createElement(StormFlow, { note: "n", message: "m" })), renderToStaticMarkup(createElement(RingFlow, { button: "b", message: "m", afterMendButton: "c" }))]) {
      expect(html).not.toContain("Saddlebag");
      expect(html).not.toContain("Moment ");
    }
    expect(push).not.toContain("Back");
    expect(DEFAULT_ARC.stormMessage).toBe("We've faced so many struggles together…\nlet's handle this one too 💪");
    expect(DEFAULT_ARC.breakdownReassure).toBe("Don't worry chupu, we can handle this together 🤝\nPress the button…");
    const storm = renderToStaticMarkup(createElement(StormFlow, { note: TRICKY[0], message: "msg one\nmsg two" }));
    expect(storm).not.toContain(esc(TRICKY[0]));
    const ring = renderToStaticMarkup(createElement(RingFlow, { button: "Mend it", story: "typed words", message: TRICKY[1], afterMendButton: "Go" }));
    expect(ring).not.toContain("Mend it"); // PRD-07: the button only appears after the typing finishes
    expect(renderToStaticMarkup(createElement(RingFlow, { button: "Mend it", message: "m", afterMendButton: "Go" }))).toContain("Mend it"); // no story: nothing to wait for
    expect(ring).not.toContain(esc(TRICKY[1]));
    for (const html of [push, storm, ring]) expect(html.toLowerCase()).not.toMatch(/forgive|\byes\b|\bno\b/);
  });
});
