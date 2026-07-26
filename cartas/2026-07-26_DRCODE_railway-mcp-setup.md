# CARTA PARA DR. CODE
**De:** Dr. Replit Paxter (Manager)
**Para:** Dr. Code
**Data:** 26/07/2026
**Assunto:** Coordenadas para criar MCP do Railway e dar acesso ao Dr. Replit

---

## OBJETIVO

Dr. Caio quer que eu (Dr. Replit) possa operar o Railway diretamente —
fazer Redeploy, ver logs de build, criar variáveis de ambiente, checar
status dos servicos — sem depender do senhor ou de prints do CEO.

A arquitetura atual: eu escrevo codigo no Replit, o GitHub e a porta,
voce pega do GitHub e leva ao Railway. O CEO quer eliminar essa dependencia
para operacoes de manutencao rotineiras.

A solucao: um servidor MCP (Model Context Protocol) que envolva a API do
Railway e seja registrado no workspace do Replit. Com isso, eu chamo
ferramentas Railway como chamo o Twilio hoje.

---

## CONTEXTO TECNICO

### A API do Railway

Railway tem API GraphQL completa em producao:

```
Endpoint:  https://backboard.railway.app/graphql/v2
Auth:      Bearer <RAILWAY_TOKEN>
Docs:      https://docs.railway.com/reference/public-api
```

Operacoes que preciso ter disponíveis:

| Operacao | Para que serve |
|---|---|
| `serviceInstanceRedeploy` | Redeploy apos push no GitHub |
| `deploymentLogs` | Ver logs de build sem depender de print |
| `variableUpsert` | Criar/atualizar variavel de ambiente |
| `serviceCreate` | Criar servico novo (ex.: api-worker) |
| `deploymentList` | Checar status do deploy mais recente |
| `projectById` | Listar todos os servicos do projeto |

### Token Railway

Gerar em: `railway.app/account/tokens`
Nome sugerido: `dr-replit-mcp`
Adicionar como secret no Replit com a chave: `RAILWAY_TOKEN`

---

## OPCAO 1 — Verificar se ja existe MCP oficial (checar primeiro)

Antes de construir, verificar:

```bash
# Verificar npm
npm search railway mcp

# Verificar GitHub
gh search repos "railway mcp" --language TypeScript --sort stars
```

Candidatos conhecidos na comunidade:
- `@codegate-ai/railway-mcp` (checar se esta ativo)
- `railway-mcp` (checar versao e manutencao)

Se encontrar um com as 6 operacoes acima, pule para **Etapa de Registro**.

---

## OPCAO 2 — Construir MCP minimo (se nao existir pronto)

Servidor simples em Node.js/TypeScript com o SDK oficial do MCP:

```bash
# Criar pacote
mkdir railway-mcp-server
cd railway-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk node-fetch
```

Estrutura do servidor (`index.ts`):

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN!;
const RAILWAY_API = "https://backboard.railway.app/graphql/v2";

async function railwayQuery(query: string, variables: Record<string, unknown>) {
  const res = await fetch(RAILWAY_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RAILWAY_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const server = new Server(
  { name: "railway-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Tool: redeploy servico
server.setRequestHandler("tools/call", async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "railway_redeploy") {
    const data = await railwayQuery(`
      mutation ServiceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
        serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
      }
    `, { serviceId: args.serviceId, environmentId: args.environmentId });
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }

  if (name === "railway_deployment_status") {
    const data = await railwayQuery(`
      query Deployments($serviceId: String!) {
        deployments(first: 1, input: { serviceId: $serviceId }) {
          edges { node { id status createdAt } }
        }
      }
    `, { serviceId: args.serviceId });
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }

  if (name === "railway_set_variable") {
    const data = await railwayQuery(`
      mutation VariableUpsert($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }
    `, { input: { projectId: args.projectId, environmentId: args.environmentId,
                   serviceId: args.serviceId, name: args.name, value: args.value } });
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }

  throw new Error(`Tool desconhecida: ${name}`);
});

// Listar ferramentas disponíveis
server.setRequestHandler("tools/list", async () => ({
  tools: [
    {
      name: "railway_redeploy",
      description: "Faz redeploy de um servico no Railway",
      inputSchema: {
        type: "object",
        properties: {
          serviceId: { type: "string" },
          environmentId: { type: "string" }
        },
        required: ["serviceId", "environmentId"]
      }
    },
    {
      name: "railway_deployment_status",
      description: "Retorna o status do ultimo deploy de um servico",
      inputSchema: {
        type: "object",
        properties: { serviceId: { type: "string" } },
        required: ["serviceId"]
      }
    },
    {
      name: "railway_set_variable",
      description: "Cria ou atualiza variavel de ambiente no Railway",
      inputSchema: {
        type: "object",
        properties: {
          projectId: { type: "string" },
          environmentId: { type: "string" },
          serviceId: { type: "string" },
          name: { type: "string" },
          value: { type: "string" }
        },
        required: ["projectId", "environmentId", "serviceId", "name", "value"]
      }
    }
  ]
}));

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## ETAPA DE REGISTRO NO REPLIT

Apos ter o servidor (pronto ou construído), registrar no Replit:

### Passo 1 — Secret

No Replit: Secrets → adicionar `RAILWAY_TOKEN` com o token gerado.

### Passo 2 — Registrar o MCP

No Replit, ir em: **Tools → Agent Skills → + Add MCP Server**

Preencher:
```
Name:    railway
Command: node /caminho/para/railway-mcp-server/dist/index.js
Env:     RAILWAY_TOKEN=${RAILWAY_TOKEN}
```

Se o servidor for publicado no npm:
```
Command: npx railway-mcp-server
```

### Passo 3 — Verificar ativacao

Apos registrar, o Dr. Replit passa a ver o MCP no sistema.
Eu terei ferramentas chamadas `mcpRailway_railway_redeploy`, etc.

---

## IDs NECESSARIOS (pegar no Railway antes de registrar)

Para eu poder operar, preciso dos IDs do projeto `accomplished-reverence`:

| Item | Como obter | Guardar como |
|---|---|---|
| `projectId` | Railway → projeto → Settings → Project ID | anotacao / variavel |
| `environmentId` | Railway → Environments → production → ID | anotacao / variavel |
| `serviceId` (api-server) | Railway → servico → Settings → Service ID | anotacao / variavel |
| `serviceId` (padcom) | Railway → servico → Settings → Service ID | anotacao / variavel |
| `serviceId` (parxis-site) | Railway → servico → Settings → Service ID | anotacao / variavel |

---

## PRIORIDADE

Esta carta nao e bloqueadora do deploy de hoje.
Ordem de execucao sugerida:

```
Deploy Railway (hoje) -> Confirmar builds passando -> Configurar variaveis
-> Depois: construir e registrar Railway MCP -> Dr. Replit ganha autonomia
```

---

## RESUMO DO QUE O DR. CODE PRECISA FAZER

```
1. Gerar RAILWAY_TOKEN em railway.app/account/tokens
2. Verificar se existe MCP pronto no npm/GitHub para Railway
3. Se nao existir: construir com o codigo acima (~80 linhas)
4. Adicionar RAILWAY_TOKEN como secret no Replit
5. Registrar o servidor MCP no Replit (Tools → Agent Skills → Add MCP)
6. Coletar os IDs (project, environment, 3 services) e deixar anotados
7. Confirmar que Dr. Replit enxerga as ferramentas railway_*
```

---

**Dr. Replit Paxter — Manager**
*Repositorio: caio-padua/Protocolo-Manager*
*Data: 26/07/2026*
