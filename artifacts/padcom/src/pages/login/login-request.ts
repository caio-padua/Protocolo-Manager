const API_READINESS_DELAYS_MS = [500, 1_000] as const;

type LoginRequestBody = {
  identifier: string;
  password: string;
};

type Fetcher = typeof fetch;
type Waiter = (milliseconds: number) => Promise<void>;

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function waitForApi(fetcher: Fetcher, waiter: Waiter): Promise<void> {
  for (let check = 0; check <= API_READINESS_DELAYS_MS.length; check += 1) {
    try {
      const response = await fetcher("/api/healthz", {
        method: "GET",
        cache: "no-store",
      });
      if (response.ok) return;
    } catch {
      // A cold or restarting API is expected to fail this readiness check.
    }

    if (check < API_READINESS_DELAYS_MS.length) {
      await waiter(API_READINESS_DELAYS_MS[check]);
    }
  }
  throw new Error("O servidor ainda não está pronto.");
}

/**
 * Waits for the API to become reachable before sending credentials exactly once.
 * This avoids duplicate login requests when the frontend starts before the API.
 */
export async function postCollaboratorLogin(
  body: LoginRequestBody,
  fetcher: Fetcher = fetch,
  waiter: Waiter = wait,
): Promise<Response> {
  await waitForApi(fetcher, waiter);
  return fetcher("/api/collaborator/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
