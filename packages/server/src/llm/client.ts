import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export interface LlmRequest {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}

/** One interface for both pipeline stages, so the provider or model can change. */
export interface LlmClient {
  complete(req: LlmRequest): Promise<string>;
}

/**
 * Amazon Bedrock via the Converse API. Credentials come from the server's IAM role,
 * so there is no LLM API key anywhere. Confirm the model is HIPAA-eligible under the
 * AWS BAA before real patients.
 */
export class BedrockLlmClient implements LlmClient {
  private readonly client: BedrockRuntimeClient;

  constructor(region: string) {
    this.client = new BedrockRuntimeClient({ region });
  }

  async complete(req: LlmRequest): Promise<string> {
    const res = await this.client.send(
      new ConverseCommand({
        modelId: req.model,
        system: [{ text: req.system }],
        messages: [{ role: "user", content: [{ text: req.user }] }],
        inferenceConfig: { maxTokens: req.maxTokens, temperature: 0 },
      }),
      { abortSignal: AbortSignal.timeout(90_000) },
    );
    const text = res.output?.message?.content?.map((c) => ("text" in c ? c.text : "")).join("") ?? "";
    if (!text) throw new Error("LLM returned no text");
    return text;
  }
}

/** Test double: returns scripted responses in order and records every request. */
export class FakeLlmClient implements LlmClient {
  readonly requests: LlmRequest[] = [];
  constructor(private readonly responses: Array<string | ((req: LlmRequest) => string) | Error> = []) {}

  push(...r: Array<string | ((req: LlmRequest) => string) | Error>) {
    this.responses.push(...r);
  }

  async complete(req: LlmRequest): Promise<string> {
    this.requests.push(req);
    const next = this.responses.shift();
    if (next === undefined) throw new Error("FakeLlmClient: no scripted response left");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(req) : next;
  }
}
