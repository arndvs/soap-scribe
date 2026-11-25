import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BedrockLlmClient, type LlmClient } from "../llm/client.js";
import { extractVisitFacts } from "../pipeline/extract.js";
import { composeDraft } from "../pipeline/compose.js";
import { matchProtocols } from "../pipeline/protocols.js";
import { protocolLibrary, settings, template } from "../testing/fixtures.js";
import { EvalCase } from "./types.js";
import { PracticeSettings, ProtocolItem, Template } from "../domain.js";
import { z } from "zod";
import { scoreCase, summarize, type CaseScore } from "./score.js";

/**
 * Runs the draft test set against the real models.
 *   pnpm --filter @soap-scribe/server eval                 # synthetic public cases
 *   EVAL_CASES_DIR=~/soap-private/cases pnpm ... eval      # her private cases, outside the repo
 * Needs AWS credentials with Bedrock access, LLM_MODEL_EXTRACT and LLM_MODEL_COMPOSE.
 * Writes results to EVAL_OUT (default eval-results.json, which is git-ignored).
 */
export function loadCases(dir: string): EvalCase[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "practice.json")
    .sort()
    .map((f) => EvalCase.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));
}

/** Her real template, settings and library for private runs: practice.json beside her cases. */
const Practice = z.object({ template: Template, settings: PracticeSettings, protocols: z.array(ProtocolItem) });
export type Practice = z.infer<typeof Practice>;

export function loadPractice(dir: string): Practice {
  const file = join(dir, "practice.json");
  if (existsSync(file)) return Practice.parse(JSON.parse(readFileSync(file, "utf8")));
  return { template: template(), settings: settings(), protocols: protocolLibrary };
}

export async function runEval(
  llm: LlmClient,
  cases: EvalCase[],
  models: { extract: string; compose: string },
  practice: Practice = { template: template(), settings: settings(), protocols: protocolLibrary },
): Promise<CaseScore[]> {
  const scores: CaseScore[] = [];
  for (const c of cases) {
    const facts = await extractVisitFacts(llm, models.extract, c.transcript, practice.settings.glossary);
    const draft = await composeDraft(llm, models.compose, {
      facts,
      template: practice.template,
      previousNotes: c.previousNotes,
      protocols: matchProtocols(facts.recommendationMentions, practice.protocols),
      visitDate: "2026-12-01",
    });
    scores.push(scoreCase(c, draft.sections));
  }
  return scores;
}

async function main() {
  const dir = resolve(process.env.EVAL_CASES_DIR ?? resolve(import.meta.dirname, "../../eval-cases"));
  const extract = process.env.LLM_MODEL_EXTRACT;
  const compose = process.env.LLM_MODEL_COMPOSE;
  if (!extract || !compose) throw new Error("Set LLM_MODEL_EXTRACT and LLM_MODEL_COMPOSE");
  const cases = loadCases(dir);
  const scores = await runEval(new BedrockLlmClient(process.env.AWS_REGION ?? "us-west-2"), cases, { extract, compose }, loadPractice(dir));
  for (const s of scores) {
    console.log(`${s.passed ? "PASS" : "FAIL"}  ${s.id}  invented: ${s.invented.join(", ") || "none"}  missing: ${s.missing.join(", ") || "none"}`);
  }
  const summary = summarize(scores);
  console.log(`\n${summary.cases} cases · invented ${summary.invented} · missing ${summary.missing} · protocol mismatches ${summary.protocolMismatches} · ${summary.passed ? "PASSED" : "FAILED"}`);
  writeFileSync(process.env.EVAL_OUT ?? "eval-results.json", JSON.stringify({ at: new Date().toISOString(), summary, scores }, null, 2));
  process.exit(summary.passed ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main();
