/**
 * Ponte MCP entre o Dr. Replit e o Railway.
 *
 * Contexto: cartas/2026-07-26_DRCODE_railway-mcp-setup.md pediu um servidor
 * MCP com transporte stdio (child process, iniciado pelo Replit via
 * "Command: node .../index.js"). Mas a tela de registro do Replit
 * ("Connect an MCP server") pede uma URL — ou seja, o cliente espera um
 * servidor remoto por HTTP, não um processo local. Esta é a versão HTTP,
 * hospedada como Railway Function, servindo o transporte "Streamable HTTP"
 * do MCP (um único endpoint POST, resposta JSON simples — sem streaming,
 * porque nenhuma das três ferramentas precisa mandar mensagens do servidor
 * para o cliente antes da resposta final).
 *
 * Design de segurança: RAILWAY_TOKEN (a credencial real, com o poder de
 * mexer na conta Railway) fica só nas variáveis de ambiente deste serviço —
 * nunca é devolvido em nenhuma resposta e nunca precisa virar secret do
 * Replit. Quem chama este servidor só precisa da URL, que já inclui o
 * BRIDGE_TOKEN como segredo de caminho (mesmo princípio de uma URL de
 * webhook não-listada). Sem o BRIDGE_TOKEN correto no caminho, toda
 * requisição cai em 404.
 */

const RAILWAY_API = "https://backboard.railway.com/graphql/v2";
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN;
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;

const TOOLS = [
  {
    name: "railway_redeploy",
    description:
      "Refaz o deploy do último build de um serviço Railway (sem buscar novo commit do GitHub).",
    inputSchema: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "ID do serviço Railway" },
        environmentId: { type: "string", description: "ID do ambiente Railway" },
      },
      required: ["serviceId", "environmentId"],
    },
  },
  {
    name: "railway_deployment_status",
    description: "Lista os deploys mais recentes de um serviço Railway, com status.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID do projeto Railway" },
        serviceId: { type: "string", description: "ID do serviço Railway" },
        environmentId: { type: "string", description: "ID do ambiente Railway" },
        limit: { type: "number", description: "Quantos deploys retornar (padrão 5)" },
      },
      required: ["projectId", "serviceId", "environmentId"],
    },
  },
  {
    name: "railway_set_variable",
    description:
      "Cria ou atualiza uma variável de ambiente em um serviço Railway. Dispara redeploy, a menos que skipDeploy seja true.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "ID do projeto Railway" },
        serviceId: { type: "string", description: "ID do serviço Railway" },
        environmentId: { type: "string", description: "ID do ambiente Railway" },
        name: { type: "string", description: "Nome da variável" },
        value: { type: "string", description: "Valor da variável" },
        skipDeploy: { type: "boolean", description: "Se true, não dispara redeploy (padrão false)" },
      },
      required: ["projectId", "serviceId", "environmentId", "name", "value"],
    },
  },
] as const;

async function railwayGraphQL(query: string, variables: Record<string, unknown>) {
  const res = await fetch(RAILWAY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RAILWAY_TOKEN}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e: { message: string }) => e.message).join("; "));
  return json.data;
}

async function callTool(name: string, args: Record<string, any>) {
  if (name === "railway_redeploy") {
    return railwayGraphQL(
      `mutation($serviceId: String!, $environmentId: String!) {
         serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
       }`,
      { serviceId: args.serviceId, environmentId: args.environmentId },
    );
  }
  if (name === "railway_deployment_status") {
    return railwayGraphQL(
      `query($input: DeploymentListInput!, $first: Int) {
         deployments(input: $input, first: $first) {
           edges { node { id status createdAt url } }
         }
       }`,
      {
        input: { projectId: args.projectId, serviceId: args.serviceId, environmentId: args.environmentId },
        first: args.limit ?? 5,
      },
    );
  }
  if (name === "railway_set_variable") {
    return railwayGraphQL(`mutation($input: VariableUpsertInput!) { variableUpsert(input: $input) }`, {
      input: {
        projectId: args.projectId,
        environmentId: args.environmentId,
        serviceId: args.serviceId,
        name: args.name,
        value: args.value,
        skipDeploys: args.skipDeploy ?? false,
      },
    });
  }
  throw new Error(`Tool desconhecida: ${name}`);
}

const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

Bun.serve({
  port: Number(process.env.PORT) || 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const [root, token] = url.pathname.split("/").filter(Boolean);

    if (root !== "mcp" || !BRIDGE_TOKEN || token !== BRIDGE_TOKEN) {
      return new Response("Not found", { status: 404 });
    }
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
    const { id, method, params } = body;

    if (method === "initialize") {
      return Response.json(
        rpcResult(id, {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "railway-bridge", version: "1.0.0" },
        }),
      );
    }
    if (method === "notifications/initialized") return new Response(null, { status: 202 });
    if (method === "tools/list") return Response.json(rpcResult(id, { tools: TOOLS }));

    if (method === "tools/call") {
      const { name, arguments: args } = params ?? {};
      try {
        const result = await callTool(name, args ?? {});
        return Response.json(rpcResult(id, { content: [{ type: "text", text: JSON.stringify(result) }], isError: false }));
      } catch (err: any) {
        return Response.json(rpcResult(id, { content: [{ type: "text", text: `Erro: ${err.message}` }], isError: true }));
      }
    }

    if (id === undefined) return new Response(null, { status: 202 }); // notificação desconhecida
    return Response.json(rpcError(id, -32601, `Method not found: ${method}`));
  },
});
