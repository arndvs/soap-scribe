/**
 * Structured logging that cannot carry patient data: only these fields are accepted,
 * and the type system rejects anything else. Never log transcripts, notes or names.
 */
export interface LogFields {
  event: string;
  jobId?: string;
  draftId?: string;
  status?: string;
  attempts?: number;
  count?: number;
  durationMs?: number;
  error?: string;
  route?: string;
  httpStatus?: number;
}

export interface Logger {
  info(f: LogFields): void;
  warn(f: LogFields): void;
  error(f: LogFields): void;
}

const write = (level: string) => (f: LogFields) =>
  process.stdout.write(JSON.stringify({ level, at: new Date().toISOString(), ...f }) + "\n");

export const jsonLogger: Logger = { info: write("info"), warn: write("warn"), error: write("error") };

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

/** Error text for logs and job records: message only, capped, never a stack or payload. */
export function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.slice(0, 300);
}
