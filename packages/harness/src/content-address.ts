import { createHash } from "node:crypto";

/**
 * A step's cache key is a hash of its inputs, so changing a prompt or input invalidates exactly
 * the steps that depend on it. The full step DAG executor is implemented in the v0 slice; this
 * proves the content-addressing primitive it will be built on.
 */
export function contentAddress(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
