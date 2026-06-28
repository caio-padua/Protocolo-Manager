# SPEC 1 — Auditoria de Campos de Configuração (cofre na tela)

Data: 28/06/2026 — autor: Dr. Replit Paxter — método: Paxter Loop (Especificar).

## Objetivo

Mapear, de forma honesta e verificada na fonte, TODA ferramenta do sistema que depende de
uma chave, token, valor ou arquivo (upload) para funcionar, e responder uma única pergunta
por ferramenta: **existe um campo na própria tela para o operador colar/enviar esse valor,
como já acontece no ZapSign?** Onde não existe, é uma LACUNA.

Regra-raiz do CEO (motivo desta auditoria): um menu que só mostra luz de status (verde/âmbar)
mas não deixa configurar nada é um menu só-de-olhar. A ferramenta tem que ser operável pela
própria tela.

## Como o sistema guarda segredos hoje (verificado)

| Mecanismo de guarda dos valores sensíveis e onde cada um vive |
|---|
| Cofre cifrado (AES-256-GCM) — `artifacts/api-server/src/lib/secure-settings.ts`. Funções `setSecret/getSecret/getSecretStatus/deleteSecret`. `getSecret` cai para `process.env` quando a chave não está no cofre (mapa `ENV_FALLBACK`). |
| Configurações não sensíveis — tabela `app_settings` (`setSetting/getSetting`), ex.: URL base, toggles `active`. |
| Arquivos (upload) — Object Storage privado do Replit (`objectStorage.ts`), ex.: certificado `.pfx`, foto do cliente. |
| Toda rota de escrita de configuração exige `requireCollaborator` (Portão do Colaborador). |

## Estado verificado — telas que JÁ têm campo (o padrão a copiar)

| Ferramenta | Tela (arquivo) | O que o operador consegue fazer pela tela | Destino |
|---|---|---|---|
| ZapSign (assinatura eletrônica) | `configuracoes/assinatura.tsx` | Colar o token, ligar/desligar | Cofre `zapsign.token` |
| Certificado Digital A1 | `configuracoes/certificados.tsx` | Enviar arquivo `.pfx/.p12` + senha | Object Storage + cofre `certificate.password` |
| Pagamentos (Asaas) | `configuracoes/pagamentos.tsx` | Colar API Key, Webhook Token, URL base | Cofre `asaas.apiKey`, `asaas.webhookToken` |
| Empresa / Clínicas | `configuracoes/empresa.tsx` | Editar dados, logo, unidades | `app_settings` |
| Agendas Google | `cadastros/agendas-google.tsx` | Colar os IDs de calendário | Banco `agenda_resources` |

## LACUNAS verificadas — depende de valor, mas NÃO há campo na tela

| # | Ferramenta | Chave/valor que falta poder colar | O que existe hoje | O que falta |
|---|---|---|---|---|
| 1 | Telegram (bot) | Bot Token, Webhook Secret | Backend PRONTO (rota `PUT /settings/telegram` grava no cofre). Tela `comunicacao/digital.tsx` só mostra a LUZ. | Só o campo na tela (frontend). Barato. |
| 2 | WhatsApp via Twilio | Account SID, Auth Token, Número remetente | Tela `comunicacao/gateways.tsx` só mostra luz + toggle + aviso das chaves que faltam. Lê de `process.env` (`lib/whatsapp.ts`). | Campo na tela + rota de gravação + lib lendo do cofre. |
| 3 | WhatsApp via Gupshup | API Key, App Name | Igual ao Twilio (só luz/toggle). Lê de `process.env` (`lib/gupshup.ts`). | Campo na tela + rota + lib lendo do cofre. |
| 4 | Stripe (pagamento internacional) | Secret Key | Cofre já reconhece `stripe.secretKey` (via `ENV_FALLBACK`), mas a tela `pagamentos.tsx` só cobre Asaas. | Campo na tela + rota de gravação. |
| 5 | Assinatura do médico (imagem) | Arquivo de imagem PNG/JPEG da rubrica/assinatura | NÃO existe coluna no schema `professionals` nem campo de upload. (Exemplo dado pelo CEO.) | Coluna nova + upload (Object Storage) + campo no cadastro. |

## Fora de escopo (com justificativa honesta)

| Item | Por que não vira campo agora |
|---|---|
| Google Gmail / Drive / Calendar | OAuth via integração Replit (conectores), não chave colável; já conectam por outro caminho. |
| SMTP | Não é usado no código (sem `nodemailer`/`createTransport`); e-mail sai pelo Gmail. Sem ferramenta = sem lacuna. |
| `APP_ENCRYPTION_KEY`, `SESSION_SECRET`, `DATABASE_URL`, `PRIVATE_OBJECT_DIR` | Segredos de infraestrutura do ambiente; não são configuração de operador clínico. |
| Gemini (`GEMINI_API_KEY`) | Usado via proxy de integração; fora do escopo de "ferramenta operável pelo menu" nesta onda. |

## RESUMO EM 1 LINHA
São 5 lacunas reais (Telegram só-UI; Twilio, Gupshup e Stripe sem campo; assinatura do médico sem coluna nem upload); todo o resto que depende de valor já tem campo na tela ou está justificado fora de escopo.
