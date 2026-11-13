export interface ReplitConnectorConnection {
  connector_name: string;
  status?: string;
  settings: {
    access_token?: string;
    expires_at?: string;
    oauth?: {
      credentials?: {
        access_token?: string;
      };
    };
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function findReplitConnection(
  payload: unknown,
  connectorName: string,
): ReplitConnectorConnection | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return undefined;

  const item = payload.items.find(
    (candidate) =>
      isRecord(candidate) && candidate.connector_name === connectorName,
  );
  if (!isRecord(item) || typeof item.connector_name !== "string") {
    return undefined;
  }

  const rawSettings = isRecord(item.settings) ? item.settings : {};
  const rawOAuth = isRecord(rawSettings.oauth) ? rawSettings.oauth : {};
  const rawCredentials = isRecord(rawOAuth.credentials)
    ? rawOAuth.credentials
    : {};
  const settings: ReplitConnectorConnection["settings"] = {};

  if (typeof rawSettings.access_token === "string") {
    settings.access_token = rawSettings.access_token;
  }
  if (typeof rawSettings.expires_at === "string") {
    settings.expires_at = rawSettings.expires_at;
  }
  if (typeof rawCredentials.access_token === "string") {
    settings.oauth = {
      credentials: { access_token: rawCredentials.access_token },
    };
  }

  return {
    connector_name: item.connector_name,
    ...(typeof item.status === "string" ? { status: item.status } : {}),
    settings,
  };
}

export async function loadReplitConnectorAccessToken(
  connectorName: string,
): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const identityToken = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;
  if (!hostname || !identityToken) {
    throw new Error("Replit connector identity is unavailable");
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true`,
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": identityToken,
      },
    },
  );
  if (!response.ok) throw new Error(`${connectorName} not connected`);

  const connection = findReplitConnection(await response.json(), connectorName);
  const accessToken = getReplitConnectionAccessToken(connection);
  if (!accessToken) throw new Error(`${connectorName} not connected`);
  return accessToken;
}

export function getReplitConnectionAccessToken(
  connection: ReplitConnectorConnection | undefined,
): string | undefined {
  return (
    connection?.settings.access_token ??
    connection?.settings.oauth?.credentials?.access_token
  );
}
