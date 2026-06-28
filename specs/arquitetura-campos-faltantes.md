# SPEC 2 — Arquitetura para os Campos Faltantes

Data: 28/06/2026 — autor: Dr. Replit Paxter — método: Paxter Loop (Especificar).
Pré-requisito: SPEC 1 (`specs/auditoria-campos-configuracao.md`).

## Princípio

Não inventar mecanismo novo. Reusar o que o sistema já faz bem:
- Segredo sensível → cofre cifrado (`setSecret`/`getSecret`/`getSecretStatus`).
- Valor não sensível (URL, toggle) → `app_settings` (`setSetting`/`getSetting`).
- Arquivo → Object Storage privado (padrão do upload de certificado).
- Escrita sempre atrás de `requireCollaborator` (backend) + `Authorization: Bearer getCollabToken()` (frontend).
- Status sempre HONESTO: `isSet` + máscara (`••••1234`) + origem (`vault`|`env`), nunca expõe o segredo.

## Padrão A — Credencial no cofre + campo na tela (lacunas 1 a 4)

Blueprint do fluxo (igual para Telegram, Twilio, Gupshup, Stripe):

Operador cola valor na tela -> POST/PUT com Bearer do colaborador -> setSecret(chave) no cofre
-> GET de status devolve {isSet, masked, source} -> lib de envio lê via getSecret (env continua como fallback).

| Lacuna | Chaves no cofre | Rota de escrita | lib que passa a ler do cofre | Tela que ganha o campo |
|---|---|---|---|---|
| Telegram | `telegram.botToken`, `telegram.webhookSecret` | Já existe `PUT /settings/telegram` | já lê do cofre | `comunicacao/digital.tsx` (adicionar campo) |
| Twilio | `twilio.accountSid`, `twilio.authToken`, `twilio.whatsappFrom` | NOVA `PUT /comunicacao/gateways/twilio/credentials` | `lib/whatsapp.ts` (trocar env por getSecret) | `comunicacao/gateways.tsx` |
| Gupshup | `gupshup.apiKey`, `gupshup.appName` | NOVA `PUT /comunicacao/gateways/gupshup/credentials` | `lib/gupshup.ts` (trocar env por getSecret) | `comunicacao/gateways.tsx` |
| Stripe | `stripe.secretKey` | NOVA `PUT /settings/stripe` | onde Stripe for usado | `configuracoes/pagamentos.tsx` |

Detalhes de contrato:
- ENV_FALLBACK do cofre já mapeia `twilio.*`? Verificar; se faltar, ADICIONAR (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`). `stripe.secretKey` já existe.
- O status de cada gateway (`/comunicacao/gateways`) passa a derivar de `getSecretStatus` por chave (e não só de `process.env`), devolvendo a máscara por chave.
- Frontend usa `fetch` cru com `getCollabToken()` (padrão já usado em `gateways.tsx`), evitando mexer no codegen frágil.
- Campos sensíveis: `type="password"`, `autoComplete="new-password"`, placeholder mostra a máscara quando já há valor; enviar vazio = não altera.

## Padrão B — Upload de imagem da assinatura do médico (lacuna 5)

Blueprint:

Admin escolhe arquivo PNG/JPEG no cadastro do profissional -> POST multipart com Bearer
-> valida tipo/tamanho -> grava no Object Storage privado -> salva caminho em professionals.signature_url
-> tela mostra a prévia da assinatura.

| Peça | Decisão |
|---|---|
| Schema | ADD COLUMN `signature_url text` em `professionals` (nullable; regra de ouro: nunca reconstruir tabela). |
| Armazenamento | Object Storage privado (mesmo cofre de arquivos do certificado/foto), prefixo próprio (ex.: `signatures/`). |
| Rota | NOVA `POST /api/professionals/:id/signature` (multipart, `requireCollaborator`); limite 2 MB; aceita `image/png`, `image/jpeg`. |
| Leitura | rota servindo o arquivo com guarda de prefixo (não vazar o diretório privado inteiro). |
| Tela | Campo de upload no formulário de edição do profissional + prévia da imagem atual. |
| Conciliação com Art. 63 | A coluna serve aos DOIS caminhos: upload direto agora (pedido do CEO) e, no futuro, captura remota por link enviada ao médico — mesmo destino, sem contradição. |

## Não-objetivos (evitar scope creep)

- Não renderizar a assinatura-imagem dentro do PDF do RAS nesta onda (a assinatura legal continua sendo o selo ICP-Brasil); só capturar/guardar/exibir.
- Não criar segundo provedor de e-mail (SMTP) — não há ferramenta.
- Não tocar nos conectores Google.

## Verificação (definição de pronto)

| Como provar que cada lacuna fechou |
|---|
| curl no GET de status devolve `isSet:false` antes e `isSet:true` (com máscara) depois do PUT. |
| Screenshot de cada tela mostrando o campo de credencial/upload visível e operável. |
| Enviar credencial pela tela → luz de status fica verde sem reiniciar o servidor. |
| Upload da assinatura → prévia aparece e o caminho persiste no banco. |
| architect review sem pendência severa. |

## RESUMO EM 1 LINHA
Dois padrões fecham as cinco lacunas reusando cofre/Object Storage: Padrão A (credencial+campo) para Telegram, Twilio, Gupshup e Stripe; Padrão B (coluna+upload) para a assinatura do médico.
