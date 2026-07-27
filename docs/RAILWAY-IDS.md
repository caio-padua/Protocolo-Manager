# Railway — IDs do projeto (accomplished-reverence)

IDs coletados pelo Dr. Code em 26/07/2026. Sao identificadores, nao segredos.
Uso: ferramentas MCP railway (railwayDeploymentStatus, railwayRedeploy, railwaySetVariable).

| Item | ID |
|---|---|
| Project `accomplished-reverence` | `508dca1a-6c38-4c13-86f5-352fa0574a6b` |
| Environment `production` | `56e5f494-c9b9-475c-a83d-f69e9fdd5e13` |
| Service `@workspace/api-server` | `6dfd6711-74da-4809-bde3-50774f1b9326` |
| Service `@workspace/padcom` | `a6b9666a-39bf-47c0-b7d8-2956799a74dd` |
| Service `@workspace/parxis-site` | `923925ba-f305-4d44-afe0-15ac6b82b129` |
| Service `Postgres` | `af200865-61c0-4f5d-951a-6095c70a04b3` |
| Service `railway-mcp-bridge` | `64d6ed2e-8543-44c5-8d6a-88396ce82b03` |

Nota (Dr. Code, 26/07/2026): a ponte `railway-mcp-bridge` precisa da variavel
`RAILWAY_TOKEN` (token de conta gerado em railway.app/account/tokens) na aba
Variables do proprio servico. Sem ela, toda chamada retorna "Not Authorized".
