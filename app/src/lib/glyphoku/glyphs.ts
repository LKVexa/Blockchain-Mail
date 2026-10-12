/** Cipher alphabets from the Glyphoku board. Values in the solver are 1-based indexes into these. */

const SYMBOLS = ["★", "◆", "♠", "♣", "♥", "●", "▲", "■", "☾", "⚑", "✦", "✚"];

export function glyphsFor(order: number): readonly string[] {
  if (order === 4) return ["1", "A", "★", "◆"];
  if (order === 9) return ["1", "2", "3", "A", "B", "C", "★", "◆", "♠"];
  if (order === 16) return ["1", "2", "3", "4", "5", "6", "A", "B", "C", "D", "E", "★", "◆", "♠", "♣", "♥"];
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const digitCount = Math.max(1, Math.round(order * 0.4));
  const letterCount = Math.max(1, Math.round(order * 0.35));
  const out: string[] = [];
  for (let i = 0; i < digitCount && out.length < order; i++) out.push(digits[i]!);
  for (let i = 0; i < letterCount && out.length < order; i++) out.push(letters[i]!);
  for (let i = 0; i < SYMBOLS.length && out.length < order; i++) out.push(SYMBOLS[i]!);
  let extra = 0;
  while (out.length < order) out.push(letters[letterCount + extra++] ?? `G${out.length}`);
  return out;
}

export function glyphText(order: number, value: number): string {
  if (value <= 0) return "";
  return glyphsFor(order)[value - 1] ?? "";
}

export function glyphKind(glyph: string): "digit" | "letter" | "symbol" | "empty" {
  if (!glyph) return "empty";
  if (/[0-9]/.test(glyph)) return "digit";
  if (/[A-Za-z]/.test(glyph)) return "letter";
  return "symbol";
}
