import { describe, it, expect, beforeEach, vi } from "vitest";
import { normalizeAnswer } from "@/lib/gate/normalize";
import { isCorrectAnswer, acceptedHashes } from "@/lib/gate/answers";
import { sha256Hex } from "@/lib/gate/crypto";
import { signToken, verifyToken } from "@/lib/gate/token";

describe("normalizeAnswer", () => {
  it("lowercases, trims, collapses spaces, strips emoji and punctuation", () => {
    expect(normalizeAnswer("  Hello,   WORLD!! 🤍 ")).toBe("hello world");
  });
  it("applies NFKC (full-width letters)", () => {
    expect(normalizeAnswer("ＡＢＣ")).toBe("abc");
  });
  it("keeps non-Latin letters and combining marks", () => {
    expect(normalizeAnswer("செல்லம்!")).toBe("செல்லம்");
  });
});

describe("isCorrectAnswer", () => {
  const env = "Sweet Pea, sweetpea ,  " + "x".repeat(0);
  it("accepts odd caps/spaces/emoji", async () => {
    expect(await isCorrectAnswer("  SWEET   pea 💕", env)).toBe(true);
    expect(await isCorrectAnswer("sweetpea!", env)).toBe(true);
  });
  it("rejects wrong, empty and unconfigured", async () => {
    expect(await isCorrectAnswer("nope", env)).toBe(false);
    expect(await isCorrectAnswer("   ", env)).toBe(false);
    expect(await isCorrectAnswer("sweetpea", undefined)).toBe(false);
    expect(await isCorrectAnswer("sweetpea", "")).toBe(false);
  });
  it("supports pre-hashed entries (SHA-256 of normalised answer)", async () => {
    const h = await sha256Hex("sweet pea");
    expect(await acceptedHashes(h)).toEqual([h]);
    expect(await isCorrectAnswer("Sweet Pea", h)).toBe(true);
    expect(await isCorrectAnswer("sweet peas", h)).toBe(false);
  });
});

describe("token", () => {
  const secret = "test-secret";
  it("round-trips and rejects tampering, wrong secret and expiry", async () => {
    const t = await signToken(secret, "gate", 60, 1_000_000);
    expect(await verifyToken(secret, t, 1_000_000 + 1000)).toBe("gate");
    expect(await verifyToken("other", t, 1_000_000 + 1000)).toBeNull();
    expect(await verifyToken(secret, t, 1_000_000 + 61_000)).toBeNull();
    const [body, sig] = t.split(".");
    expect(await verifyToken(secret, `${body}x.${sig}`, 1_000_000)).toBeNull();
    expect(await verifyToken(secret, undefined)).toBeNull();
    expect(await verifyToken(undefined, t)).toBeNull();
    expect(await verifyToken(secret, "garbage")).toBeNull();
  });
});

describe("POST /api/gate", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GATE_SECRET = "route-secret";
    process.env.GATE_ANSWERS = "Sweet Pea";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
  const call = async (answer: string, misses = 0, ip = "1.2.3.4") => {
    const { POST } = await import("@/app/api/gate/route");
    return POST(new Request("http://x/api/gate", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: JSON.stringify({ answer, misses }) }));
  };
  const texts = (b: { lines: { kind: string; text: string }[] }) => b.lines.map((l) => l.text);

  it("sets an httpOnly signed cookie on success, returns the success line, never echoes answers", async () => {
    const res = await call("sweet PEA 🤍");
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/wb_gate=/);
    expect(cookie.toLowerCase()).toMatch(/httponly/);
    expect(cookie.toLowerCase()).toMatch(/samesite=lax/);
    const body = await res.json();
    expect(body).toEqual({ ok: true, message: "There she is 😍 Hop on, the ride starts now." });
    expect(JSON.stringify(body)).not.toMatch(/sweet/i);
  });

  it("wrong x1: clue 1 (ends with a) only, no cookie", async () => {
    const res = await call("nope", 0, "9.9.9.1");
    const body = await res.json();
    expect(body.attempt).toBe(1);
    expect(texts(body)).toEqual(["Wrong turn, baby 😏 Here's a little hint… it ends with **a** 😘"]);
    expect(body.lines[0].kind).toBe("clue");
    expect(JSON.stringify(body)).not.toContain("starts with");
    expect(JSON.stringify(body)).not.toContain("You know this one");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("wrong x2: clue 1 stays and clue 2 (starts with m) is added", async () => {
    const body = await (await call("nope", 1, "9.9.9.1")).json();
    expect(body.attempt).toBe(2);
    expect(texts(body)).toEqual([
      "Wrong turn, baby 😏 Here's a little hint… it ends with **a** 😘",
      "Okay, now you're just teasing me 😉 It starts with **m**. Now say it like you mean it.",
    ]);
  });

  it("wrong x3+: both clues stay, plus the 'my love' line", async () => {
    const body = await (await call("nope", 2, "9.9.9.1")).json();
    expect(body.attempt).toBe(3);
    expect(body.lines).toHaveLength(3);
    expect(body.lines[2]).toEqual({ kind: "msg", text: "Come on, my love, I'm right here waiting 🏍️💛" });
    // client-supplied counter is clamped: absurd values can't skip ahead past the last tier
    expect((await (await call("nope", 999, "9.9.9.1")).json()).attempt).toBe(4);
  });

  it("rate limits after 5 attempts per minute with the flirty message", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) last = await call("nope", 0, "9.9.9.2");
    expect(last!.status).toBe(429);
    const body = await last!.json();
    expect(body.limited).toBe(true);
    expect(texts(body)).toEqual(["Slow down, speedy 🏍️ Catch your breath and try again in a minute."]);
  });

  it("fails closed when not configured", async () => {
    delete process.env.GATE_ANSWERS;
    expect((await call("anything")).status).toBe(500);
  });
});

describe("labels", () => {
  it("falls back to themed defaults and ignores malformed stored data", async () => {
    const { resolveLabels, DEFAULT_LABELS } = await import("@/lib/site/labels");
    expect(resolveLabels(null)).toEqual(DEFAULT_LABELS);
    expect(resolveLabels({ letter: { title: "The Peak", subtitle: "for you" }, notes: 5 }).letter).toEqual({ title: "The Peak", subtitle: "for you" });
    expect(resolveLabels({ letter: { title: "  " } }).letter.title).toBe("The Summit");
  });
});
