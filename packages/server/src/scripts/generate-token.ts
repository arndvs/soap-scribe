import { randomBytes, createHash } from "node:crypto";

// Prints a new extension token and its hash. The token goes into the extension's options
// page once; only the hash goes into the server's EXTENSION_TOKEN_HASH secret.
const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token, "utf8").digest("hex");
console.log(`Extension token (paste into the extension options page, then discard):\n  ${token}\n`);
console.log(`EXTENSION_TOKEN_HASH (store in AWS Secrets Manager):\n  ${hash}`);
