import { describe, expect, it } from "vitest";
import { checkUpload, fitWithin, isAdminEmail, isExpectedMediaPath, isSameOrigin, isUuid, joinParagraphs, mediaPath, missingAlt, safeUrl, settingsPatch, splitParagraphs } from "@/lib/admin/rules";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("admin rules", () => {
  it("allows only the configured admin email", () => {
    expect(isAdminEmail("Me@x.com", "me@x.com")).toBe(true);
    expect(isAdminEmail("other@x.com", "me@x.com")).toBe(false);
    expect(isAdminEmail("me@x.com", undefined)).toBe(false);
    expect(isAdminEmail(null, "me@x.com")).toBe(false);
  });
  it("same-origin check", () => {
    expect(isSameOrigin("https://a.com", "a.com")).toBe(true);
    expect(isSameOrigin("https://evil.com", "a.com")).toBe(false);
  });
  it("uuid + media paths", () => {
    expect(isUuid(A)).toBe(true);
    expect(isUuid("../x")).toBe(false);
    expect(isExpectedMediaPath(mediaPath(A, B, "webp"), A, B, "image")).toBe(true);
    expect(isExpectedMediaPath(`memories/${B}/${B}.webp`, A, B, "image")).toBe(false);
    expect(isExpectedMediaPath(mediaPath(A, B, "exe"), A, B, "image")).toBe(false);
  });
  it("upload limits", () => {
    expect(checkUpload("video", 60 * 1048576)).toMatch(/50MB/);
    expect(checkUpload("video", 10 * 1048576)).toBeNull();
    expect(checkUpload("image", 0)).not.toBeNull();
  });
  it("fitWithin keeps aspect and never upsizes", () => {
    expect(fitWithin(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 });
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
  it("paragraph round trip is verbatim", () => {
    const t = "  one \n\ntwo  ";
    expect(joinParagraphs(splitParagraphs(t))).toBe(t);
    expect(splitParagraphs("")).toEqual([]);
  });
  it("alt-text gate", () => {
    expect(missingAlt([{ alt_text: "ok" }, { alt_text: " " }, { alt_text: null }])).toBe(2);
  });
  it("settingsPatch stores text exactly, empty -> null, ignores unknown keys", () => {
    const p = settingsPatch({ closing_message: "  Hi  ", gate_clue_1: "", evil: "x", breakdown_screens: ["a", 3, "b"], note_enabled: false });
    expect(p).toEqual({ closing_message: "  Hi  ", gate_clue_1: null, breakdown_screens: ["a", "b"], note_enabled: false });
  });
  it("safeUrl only allows http(s)", () => {
    expect(safeUrl("https://a.com/x")).toBeTruthy();
    expect(safeUrl("javascript:alert(1)")).toBeNull();
  });
});
