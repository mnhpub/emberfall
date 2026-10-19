// Workers AI classifier for lobby moderation. The model id comes from configuration (MODERATION_MODEL), so it can change
// without a code change. Any output that is not a valid label and score throws, which the pipeline treats as unavailable.
import type { Classification, Classifier, Label } from "./moderation.ts";

export const MODERATION_PROMPT =
  'You moderate a multiplayer game lobby. Reply with only JSON: {"label":"ok"|"abuse"|"spam","score":number between 0 and 1}. ' +
  '"abuse" means harassment, hate, threats or sexual content. "spam" means advertising or repeated junk. Otherwise "ok".';

// Minimal shape of the Workers AI binding this module relies on (env.AI.run).
export type AiBinding = { run(model: string, input: unknown): Promise<unknown> };

const LABELS: Label[] = ["ok", "abuse", "spam"];

export function parseClassification(raw: unknown): Classification {
  const text = typeof raw === "string" ? raw : (raw as { response?: unknown })?.response;
  if (typeof text !== "string") throw new Error("classifier returned no text");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("classifier returned no JSON");
  const parsed = JSON.parse(text.slice(start, end + 1)) as { label?: unknown; score?: unknown };
  if (!LABELS.includes(parsed.label as Label)) throw new Error("classifier returned an unknown label");
  if (typeof parsed.score !== "number" || !(parsed.score >= 0 && parsed.score <= 1))
    throw new Error("classifier returned an invalid score");
  return { label: parsed.label as Label, score: parsed.score };
}

export function workersAiClassifier(ai: AiBinding, model: string): Classifier {
  return async (text) => {
    const raw = await ai.run(model, {
      messages: [
        { role: "system", content: MODERATION_PROMPT },
        { role: "user", content: text },
      ],
      max_tokens: 60,
    });
    return parseClassification(raw);
  };
}
