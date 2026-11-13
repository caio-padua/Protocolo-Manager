import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findReplitConnection,
  getReplitConnectionAccessToken,
  loadReplitConnectorAccessToken,
} from "../lib/replit-connection";

describe("Replit connector response validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("finds only the requested connector and reads its direct token", () => {
    const connection = findReplitConnection(
      {
        items: [
          { connector_name: "google-drive", settings: { access_token: "synthetic-drive-token" } },
          { connector_name: "slack", settings: { access_token: "synthetic-slack-token" } },
        ],
      },
      "slack",
    );

    expect(connection?.connector_name).toBe("slack");
    expect(getReplitConnectionAccessToken(connection)).toBe("synthetic-slack-token");
  });

  it("reads the OAuth token shape and rejects malformed payloads", () => {
    const connection = findReplitConnection(
      {
        items: [
          {
            connector_name: "google-drive",
            settings: { oauth: { credentials: { access_token: "synthetic-oauth-token" } } },
          },
        ],
      },
      "google-drive",
    );

    expect(getReplitConnectionAccessToken(connection)).toBe("synthetic-oauth-token");
    expect(findReplitConnection({ items: "not-an-array" }, "google-drive")).toBeUndefined();
    expect(findReplitConnection({ items: [{}] }, "google-drive")).toBeUndefined();
  });

  it("loads a token only from a successful connector response", async () => {
    vi.stubEnv("REPLIT_CONNECTORS_HOSTNAME", "synthetic-connectors.test");
    vi.stubEnv("REPL_IDENTITY", "synthetic-identity");
    vi.stubEnv("WEB_REPL_RENEWAL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [
              { connector_name: "slack", settings: { access_token: "synthetic-token" } },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(loadReplitConnectorAccessToken("slack")).resolves.toBe("synthetic-token");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    await expect(loadReplitConnectorAccessToken("slack")).rejects.toThrow("slack not connected");
  });
});
