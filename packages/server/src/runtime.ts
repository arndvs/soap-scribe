import type { Config } from "./config.js";
import { HttpPocketClient } from "./pocket/client.js";
import { BedrockLlmClient, FakeLlmClient, type LlmClient } from "./llm/client.js";
import { SesNotifier, noopNotifier, type Notifier } from "./notify/notifier.js";

export function createPocket(config: Config) {
  return new HttpPocketClient(config.POCKET_API_KEY, config.POCKET_API_BASE);
}

export function createLlm(config: Config): LlmClient {
  if (config.LLM_PROVIDER === "fake") {
    // Local development only: no model calls, every request fails loudly.
    return new FakeLlmClient();
  }
  return new BedrockLlmClient(config.AWS_REGION);
}

/** Email alerts need both addresses; without them, failures still show in the side panel. */
export function createNotifier(config: Config): Notifier {
  if (config.ALERT_EMAIL && config.ALERT_FROM_EMAIL) {
    return new SesNotifier(config.AWS_REGION, config.ALERT_FROM_EMAIL, config.ALERT_EMAIL);
  }
  return noopNotifier;
}
