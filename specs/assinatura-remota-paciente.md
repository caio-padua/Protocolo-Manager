# Spec — Assinatura Remota do Paciente (clonar arsenal ZapSign do IHE)

Data: 26/06/2026. Autor: Dr. Replit Paxter (a mando do CEO Dr. Caio). Método: Paxter Loop.
Decisão do CEO: caminho A (híbrido) — manter o A1 nativo para o médico e clonar o ZapSign do IHE
para a assinatura REMOTA do paciente, reusando a MESMA conta do CEO. Origem: carta do Dr. Replit
Pawards (IHE) de 26/06/2026 (`cartas/...` / `attached_assets/`), mapa de construção do explorer.

## Objetivo (uma frase)
Trazer o motor de assinatura remota do paciente do IHE para o Paxter, recriado NATIVO (sem etiqueta
de origem), de modo que QUALQUER documento que o paciente precise validar (RAS, TCLE, termos) seja
assinado por ele à distância pelo ZapSign, com trilha de auditoria, webhook e arquivamento no Drive.

## Glossário (siglas explicadas)
- ZapSign = provedor de assinatura eletrônica em nuvem, com validade jurídica no Brasil (conta do CEO).
- ICP-Brasil = Infraestrutura de Chaves Públicas Brasileira (assinatura de máximo valor legal).
- A1 = certificado digital em arquivo .pfx, instalado no servidor (já existe no Paxter).
- PAdES = assinatura embutida dentro do próprio PDF.
- RAS = Registro de Administração de Substâncias. TCLE = Termo de Consentimento Livre e Esclarecido.
- Webhook = chamada que o ZapSign faz DE VOLTA ao sistema avisando "foi assinado".
- Adapter = camada que fala com o provedor sem espalhar detalhe pelo resto do código.
- Cofre / secure_settings = tabela de segredos cifrados em repouso (já existe no Paxter).
- Object storage = armazenamento de arquivo protegido (já existe no Paxter).
- DTO = pacote de dados pronto para a tela. FK = chave estrangeira (liga uma tabela à outra por id).

---

## 1. CONCEITO-RAIZ (regra do CEO, replit.md) — como o dado entra

| Regra | Aplicação nesta onda |
|---|---|
| Primos independentes, sem prefixo/tag de origem | Recrio as tabelas nativas em Drizzle; NADA de migration do IHE nem coluna "id_ihe" |
| Reusar a conta do CEO (regra de ouro) | Mesmo token ZapSign; o CEO cola o valor no cofre; eu nunca vejo o valor |
| Não refazer o motor validado | A LÓGICA do adapter/serviço/fluxo fica idêntica à do IHE; só "ligo os fios" |

---

## 2. REQUISITOS EXATOS

1. Criar nativas em Drizzle (`lib/db/src/schema/assinatura.ts`) as 6 tabelas do arsenal:
   `assinatura_solicitacoes`, `assinatura_signatarios`, `assinatura_webhook_eventos`,
   `assinatura_templates`, `assinatura_notificacoes`, `assinatura_toggles_admin`.
2. Clonar o motor para `artifacts/api-server/src/lib/assinatura/` mantendo a lógica do IHE:
   `adapters.ts` (ZapsignAdapter: criar doc, status, reenviar, validar webhook; modo mock se faltar token),
   `service.ts` (orquestra: hidrata template -> gera PDF -> chama adapter -> grava banco -> pós-assinatura),
   `types.ts`, `htmlParaPdf.ts`, `objectStorage.ts`.
3. Expor as rotas (prefixo `/api`):
   `POST /api/assinaturas/enviar`, `POST /api/webhooks/assinatura/zapsign`,
   `GET /api/assinaturas/timeline`, `GET /api/assinaturas/:id/pdf-assinado`,
   `POST /api/assinaturas/tcle/enviar`. Registrar em `routes/index.ts`.
4. Dois modos de assinatura preservados:
   - Paciente: `assinaturaTela-tokenWhatsApp` (assinatura AVANÇADA, Lei 14.063/2020) — link por WhatsApp.
   - Médico/CEO: `certificadoDigital` (QUALIFICADA, ICP-Brasil) — convive com o A1 nativo já existente.
5. Pós-assinatura: ao receber o webhook `doc_signed`, gravar `pdf_assinado_url`, arquivar o PDF no
   Google Drive do paciente (pasta CONTRATOS/PROTOCOLOS conforme o tipo) e avisar o CEO.
6. Disparo ao paciente: notificação por WhatsApp com o link de assinatura (fila
   `assinatura_notificacoes`, processada por endpoint `POST /api/assinaturas/processar-notificacoes`,
   no mesmo padrão do motor de mensageria da Onda E — worker chama, sem cron externo).
7. Servir como camada de assinatura remota para QUALQUER documento do paciente (RAS, TCLE, termos),
   recebendo o HTML/*template* do documento e o id do paciente.

---

## 3. ADAPTAÇÕES OBRIGATÓRIAS (ligar os fios — o que muda do IHE para o Paxter)

| Item no IHE | No Paxter | Por quê |
|---|---|---|
| Lê `process.env.ZAPSIGN_API_TOKEN` direto | Resolver via `getSecret("zapsign.token")` com fallback p/ env | Alinhar ao cofre já existente (spec financeiro); a tela de Config já grava esse segredo |
| Armazena PDF no Google Cloud Storage (`@google-cloud/storage`, bucket GCS) | Usar o Object Storage do Replit já configurado no Paxter | Paxter não usa GCS; reusar o que existe |
| Banco por SQL direto (`db.execute(sql\`...\`)`) | Manter SQL direto OU Drizzle nativo; tabelas DEFINIDAS em schema Drizzle | Conceito-raiz: schema nativo, sem migration de origem |
| Auth `requireRole`/`requireMasterEstrito` | `requireCollaborator` (padrão do Paxter) | Paxter é single-tenant com guard de colaborador |
| Header de webhook `x-pawards-secret` | Header/segredo próprio do Paxter (validar HMAC do ZapSign) | Não carregar identidade "pawards" para dentro do Paxter |
| `lib/juridico/sanitizer.ts`, worker de recorrência do IHE | Reaproveitar utilitários do Paxter; fila simples processada por endpoint | Evitar dependência interna do IHE inexistente aqui |

Pacotes npm: `pdfkit` (já existe no Paxter — RAS FAP), `fetch` nativo e `crypto` nativo (Node 24).
`exceljs` só se a exportação da timeline em planilha for mantida (opcional — ver caso extremo 4.6).

---

## 4. CASOS EXTREMOS A TRATAR

1. Sem token ZapSign no cofre/env: o adapter entra em MODO MOCK automático (não quebra o boot nem o
   envio; retorna link de teste), igual ao IHE. Boot nunca cai por falta de segredo.
2. Webhook com assinatura HMAC inválida: responder 401 genérico, NÃO processar, gravar evento como
   não processado para auditoria.
3. Webhook duplicado (ZapSign reenvia): idempotência por `provedor_evento_id` único — não reprocessar.
4. Paciente sem telefone/email: bloquear o envio com erro claro (não criar solicitação órfã).
5. Falha ao arquivar no Drive após assinatura: a assinatura continua válida (status CONCLUIDO); o
   arquivamento é best-effort com re-tentativa, nunca reverte o status jurídico.
6. PDF assinado servido por `GET /:id/pdf-assinado`: exigir `requireCollaborator` (PII clínica) e
   limitar ao registro do id (anti-IDOR), como já corrigido em outras rotas do Paxter.
7. Não quebrar o stub atual de `/settings/esignature` (toggle + token no cofre) — estender, não apagar.

---

## 5. LINHAS VERMELHAS

1. NÃO tocar o assinador A1 nativo (`pdf-signer.ts`, `cert-source.ts`) — ele continua para o médico/RAS.
2. NÃO mudar o motor clínico (computeMotor) nem nada da Onda A-E por causa desta onda.
3. NUNCA logar nem exibir o valor do token/segredo (só `{ isSet, masked }`).
4. NÃO importar arquivo do IHE com tag/prefixo de origem; o dado nasce nativo do Paxter.
5. Toda tela nova (se houver painel de assinaturas) no padrão 3D Paxter (navy + ouro).

---

## 6. DEFINIÇÃO DE PRONTO (qualquer um confere)

| Critério | Como conferir |
|---|---|
| 6 tabelas criadas | `pnpm --filter @workspace/db run push` aplica sem erro |
| `POST /assinaturas/enviar` cria solicitação | curl retorna 200 + grava em `assinatura_solicitacoes` (mock se sem token) |
| Webhook atualiza status + valida HMAC | curl com header válido -> CONCLUIDO; inválido -> 401 |
| Idempotência de webhook | reenviar o mesmo `provedor_evento_id` não duplica efeito |
| Dois modos presentes | payload aceita modo paciente (whatsapp) e médico (ICP-Brasil) |
| Pós-assinatura arquiva no Drive + avisa CEO | log/registro do arquivamento |
| Serve para RAS, TCLE e termos | uma rota genérica recebe template + paciente |
| architect PASS, zero pendência | revisão requisito por requisito |
| Validado por execução real (curl) | não basta "compilou" |
| Token do CEO: só ele cola | requestEnvVar/cofre; o agente nunca vê o valor |

---

## 7. O QUE SÓ O CEO FAZ
Colar o token da MESMA conta ZapSign no cofre do Paxter (ou no segredo `ZAPSIGN_API_TOKEN`) e, no
painel do ZapSign, apontar o webhook para a rota `POST /api/webhooks/assinatura/zapsign` do Paxter.
Sem isso, tudo roda em MODO MOCK (teste), sem assinatura real.

---

RESUMO EM 1 LINHA: clonar o motor de assinatura remota do paciente do IHE para o Paxter mantendo a
lógica idêntica, recriando as 6 tabelas nativas e trocando só a fiação (cofre, object storage,
auth, webhook), para que qualquer documento do paciente seja assinado pelo ZapSign reusando a conta
do CEO — sem tocar no A1 nativo do médico.
