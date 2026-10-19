// Automatic lobby moderation. Rooms are not moderated automatically; their hosts remove people themselves (see access.ts).
// Pipeline: deterministic rules first, then an AI classifier behind an interface, then a threshold policy.
// If the classifier fails, the message is held, never posted: the lobby fails closed.

export type Label = "ok" | "abuse" | "spam";
export type Classification = { label: Label; score: number };
export type Classifier = (text: string) => Promise<Classification>;

export type Decision =
  | { action: "allow" }
  | { action: "hold"; reason: string; source: "classifier" | "unavailable" }
  | { action: "block"; reason: string; source: "rule" | "classifier" };

// Rules catch patterns no model is needed for. They are generic on purpose; word lists belong in configuration.
const RULES: { test: (t: string) => boolean; reason: string }[] = [
  { test: (t) => /(.)\1{11,}/.test(t), reason: "Repeated characters look like spam." },
  { test: (t) => (t.match(/https?:\/\/\S+/gi) ?? []).length > 2, reason: "Too many links in one message." },
  {
    test: (t) => t.length > 30 && t.replace(/[^A-Za-z]/g, "").length > 20 && t === t.toUpperCase(),
    reason: "Shouting in capitals is limited in the lobby.",
  },
];

export const BLOCK_SCORE = 0.8; // at or above: removed
export const HOLD_SCORE = 0.5; // between HOLD_SCORE and BLOCK_SCORE: held for a person to review

export async function moderateLobby(text: string, classify: Classifier): Promise<Decision> {
  const rule = RULES.find((r) => r.test(text));
  if (rule) return { action: "block", reason: rule.reason, source: "rule" };
  let result: Classification;
  try {
    result = await classify(text);
  } catch {
    // Fail closed: an unreachable classifier holds the message rather than letting it through unchecked.
    return { action: "hold", reason: "Moderation is unavailable. Try again shortly.", source: "unavailable" };
  }
  if (result.label === "ok" || result.score < HOLD_SCORE) return { action: "allow" };
  if (result.score >= BLOCK_SCORE)
    return { action: "block", reason: "Removed by automatic moderation.", source: "classifier" };
  return { action: "hold", reason: "Held for review.", source: "classifier" };
}
