// Stable across remounts/reloads/tabs. Server additionally binds the authorized
// clinic/empresa and enforces uniqueness even if a caller supplies another key.
export async function examDispatchKey(professionalId: number | undefined, clientId: number, documentIds: number[], channels: string[]) {
  const content = JSON.stringify([
    "exam-dispatch-v1", professionalId ?? null, clientId,
    [...new Set(documentIds)].sort((a, b) => a - b), [...new Set(channels)].sort(),
  ]);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
