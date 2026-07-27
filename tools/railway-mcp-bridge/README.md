# Ponte MCP Railway ↔ Dr. Replit

Responde a `cartas/2026-07-26_DRCODE_railway-mcp-setup.md`, com uma mudança de
transporte: a carta descreve um servidor MCP stdio (processo local, iniciado
pelo Replit via `Command: node .../index.js`). A tela de registro do Replit
("Connect an MCP server") pede uma URL, não um comando — então este é um
servidor HTTP remoto, hospedado como Railway Function, servindo o transporte
"Streamable HTTP" do MCP.

## Ferramentas expostas

- `railway_redeploy` — refaz o deploy do último build de um serviço.
- `railway_deployment_status` — lista os deploys recentes e status.
- `railway_set_variable` — cria/atualiza uma variável de ambiente.

As mesmas três operações da carta original, mesma assinatura de parâmetros.

## Variáveis de ambiente (definidas no serviço Railway, nunca no Replit)

- `RAILWAY_TOKEN` — token de conta Railway (`railway.app/account/tokens`).
  Vive só aqui. Nunca é devolvido em nenhuma resposta, nunca vira secret do Replit.
- `BRIDGE_TOKEN` — segredo aleatório gerado na publicação. A URL registrada
  no Replit é `https://<domínio>/mcp/<BRIDGE_TOKEN>`; qualquer requisição sem
  o token certo no caminho recebe 404. Trate a URL completa como segredo.

## Por que o token não fica no Replit

`RAILWAY_TOKEN` de conta dá acesso a todos os projetos, variáveis e bancos da
conta Railway. Hospedando a ponte aqui, o Replit nunca vê esse valor — só a
URL assinada. Reduz o raio de exposição de "tudo que roda no Replit" para
"só este serviço".
