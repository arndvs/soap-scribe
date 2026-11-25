import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

/**
 * Tells a person when something needs attention. Messages carry job IDs and our own
 * error text only: never a patient name, transcript or note.
 */
export interface Notifier {
  jobFailed(jobId: string, attempts: number, error: string): Promise<void>;
}

export const noopNotifier: Notifier = { async jobFailed() {} };

export class SesNotifier implements Notifier {
  private readonly client: SESv2Client;

  constructor(
    region: string,
    private readonly from: string,
    private readonly to: string,
  ) {
    this.client = new SESv2Client({ region });
  }

  async jobFailed(jobId: string, attempts: number, error: string): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [this.to] },
        Content: {
          Simple: {
            Subject: { Data: "SOAP Scribe: a recording needs attention" },
            Body: { Text: { Data: failedJobText(jobId, attempts, error) } },
          },
        },
      }),
    );
  }
}

export function failedJobText(jobId: string, attempts: number, error: string): string {
  return [
    `A recording failed after ${attempts} attempts and won't be retried automatically.`,
    "",
    `Job: ${jobId}`,
    `Last error: ${error}`,
    "",
    "Open SOAP Scribe's Today view and press Retry, or check the worker logs for this job ID.",
  ].join("\n");
}

/** Records calls; for tests. */
export class FakeNotifier implements Notifier {
  readonly failed: Array<{ jobId: string; attempts: number; error: string }> = [];
  async jobFailed(jobId: string, attempts: number, error: string) {
    this.failed.push({ jobId, attempts, error });
  }
}
