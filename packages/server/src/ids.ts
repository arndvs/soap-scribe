import { randomUUID } from "node:crypto";
/** All IDs are opaque strings outside the repositories (no ObjectId leaks). */
export const newId = (): string => randomUUID();
