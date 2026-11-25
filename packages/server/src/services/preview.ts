import type { ProtocolItem, Template, VisitFacts } from "../domain.js";
import type { LlmClient } from "../llm/client.js";
import { composeDraft, type ComposedDraft } from "../pipeline/compose.js";
import { matchProtocols } from "../pipeline/protocols.js";

/**
 * A fixed, synthetic visit for the Settings Preview button: lets her see how a template
 * or carry-rule change reads before saving, without touching any patient data.
 */
export const PREVIEW_FACTS: VisitFacts = {
  complaints: [{ text: "Low back stiffness, better than last week, worse in the mornings", sourceSegments: [0] }],
  findings: [
    { kind: "segment", text: "L5 left posterior", sourceSegments: [1] },
    { kind: "segment", text: "Right SI", sourceSegments: [1] },
    { kind: "rom", text: "Lumbar flexion improved", sourceSegments: [1] },
  ],
  treatments: [{ text: "Diversified adjustment L5 and right SI", sourceSegments: [1] }],
  painScores: [{ region: "low back", score: 3, sourceSegments: [0] }],
  recommendationMentions: [{ text: "cat-cow twice a day", sourceSegments: [2] }],
  planItems: [{ text: "Continue weekly visits", sourceSegments: [1] }],
  recapFound: true,
};

export const PREVIEW_PREVIOUS_NOTE = {
  date: "2000-01-01",
  sections: {
    subjective: "Low back 5/10, worse after lifting.",
    objective: "L5 left posterior. Lumbar flexion limited.",
    assessment: "Lumbar segmental dysfunction, improving.",
    plan: "Continue weekly.",
  },
};

export async function previewTemplate(
  llm: LlmClient,
  model: string,
  template: Template,
  library: ProtocolItem[],
): Promise<ComposedDraft> {
  return composeDraft(llm, model, {
    facts: PREVIEW_FACTS,
    template,
    previousNotes: [PREVIEW_PREVIOUS_NOTE],
    protocols: matchProtocols(PREVIEW_FACTS.recommendationMentions, library),
    visitDate: "2000-01-08",
  });
}
