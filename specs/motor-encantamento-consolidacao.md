# Motor de Encantamento — Consolidação e Roadmap (visão do CEO 25/06/2026)

> Esta spec NÃO reescreve o que já está especificado. Ela CONSOLIDA o pedido grande do CEO,
> aponta o que já existe (spec/código), nomeia as lacunas reais e organiza tudo em ondas com
> decisões pendentes. Donos de detalhe ficam nas specs citadas.

---

## 1. Ajustes visuais já ENTREGUES nesta rodada (mockups no Canvas)

| Ajuste | Onde | Estado |
|---|---|---|
| Menu renomeado para "Permissões e Acessos" (opção B do CEO) | governanca/Governanca.tsx (header, título, rodapé) | Feito |
| Toggle dourado QUADRADO (não pílula arredondada) | governanca/Governanca.tsx (componente Toggle) | Feito |
| Injetáveis em FAIXAS empilhadas (uma embaixo da outra), não lado a lado | validacao/MesaValidacao.tsx | Feito |
| Ordem das colunas: DOSE (mg) → SESSÕES → FREQUÊNCIA | validacao/MesaValidacao.tsx (COLS_INJ + régua) | Feito |
| Coerência Permissões↔Laudo por fonte única (rodada anterior) | governanca/_permissoes.ts + documentos/Laudo.tsx | Feito (architect PASS) |

Frase de chamada: o que estava lado a lado virou faixa; a miligramagem agora abre a linha.

---

## 2. O que o CEO pediu — mapa do que JÁ existe x lacuna real

| Pedido do CEO | Já existe (spec/código) | Lacuna real a construir |
|---|---|---|
| QR code em todo documento → escaneia → PDF | SIM — `api-server/src/lib/pdf-signer.ts` e `ras-fap.ts` usam a lib `qrcode` | Padronizar o MESMO QR em TODOS os documentos (laudos, encaminhamento, atestado, prontuário) e página pública de verificação |
| Assinatura remota do médico (assina de outro lugar, cai no campo dele) | PARCIAL — assinatura digital A1 ICP-Brasil já gera PDF; flag `professional_signature` na tabela `ras` | Falta a INTERFACE de coleta remota (fila de assinatura no aparelho do médico) e a rubrica/JPEG indo ao campo do profissional |
| Foto do paciente por link (a pessoa tira a própria foto, sem upload nosso) | PLANEJADO — citado em `specs/videos-upload-twilio.md` e como tipo "foto" no `client-portal.ts` | Falta a TELA de câmera (link enviado → captura guiada → cai no cadastro/Drive) |
| Vídeo de IA do médico explicando ao paciente (HeyGen + ElevenLabs) | PLANEJADO — `specs/video-personalizado.md`, `specs/videos-upload-twilio.md` | Falta TODO o módulo: helpers heygen/elevenlabs, tabela `personalized_videos`, gatilho pós-validação |
| Encaminhamento junto com o arquivo na validação | PARCIAL — documentos têm Encaminhamento (Laudo/_dockit) | Falta anexar o encaminhamento ao pacote de validação e ao envio |
| Tudo ligado a link de pagamento | PARCIAL — "braços de pagamento" (`specs/bracos-pagamento.md`), coluna `payment_arm`, links em `site_content`, `routes/payments.ts` | Falta gateway real (Stripe/Pagar.me) + cobrança automática por ato |
| Médicos assistentes: subfinanceiro + painel de ganhos por validação | INEXISTENTE | Construir do zero: valor por ato, repasse/split, painel do médico |
| Cliente pede exame avulso → vê valor → link → e-mail/WhatsApp | PARCIAL — `routes/exam-requests.ts` (emite e envia), `area-paciente.ts`, `client-portal.ts` | Falta o AUTO-SERVIÇO avulso na área do cliente com preço + link de pagamento |

---

## 3. Sugestões de melhoria (o CEO pediu explicitamente)

| Sugestão | Por que é moderna / como ajuda na "dor" do CEO |
|---|---|
| Fila de Assinatura do Médico (PWA no celular) | Médico assina de qualquer lugar, 1 toque por documento; viabiliza médico assistente remoto |
| Documento verificável público (`/verificar/:hash`) | QR não só baixa o PDF — confirma autenticidade (assinatura/hash); padrão de confiança |
| Selfie guiada com enquadramento + checagem leve de vivacidade | Foto padronizada sem upload nosso; reduz fraude/retrabalho |
| Split de pagamento automático (ex.: Stripe Connect) | Repasse ao médico assistente sem planilha; o CEO sai da operação |
| Painel do Médico: ganhos por validação, fila, metas | Transparência ao assistente e fonte de receita por ato, não só operação |
| Carteirinha digital do cliente com QR | Acesso rápido ao protocolo; sensação premium |
| Catálogo de "serviços avulsos" precificados (exames, avaliações) | Cada avaliação vira produto com valor e link — nova receita recorrente |
| Notificação WhatsApp via API oficial (não link manual) | Entrega confiável de links/lembretes/pagamento |

---

## 4. Ondas propostas (sequência de construção)

| Onda | Conteúdo | Depende de decisão? |
|---|---|---|
| A — Campos & padrão verificável | Deixar PRONTOS os campos: foto do cliente, rubrica/assinatura do profissional, QR padronizado em todos os documentos, encaminhamento no pacote de validação | Não — base técnica |
| B — Captura remota | Link de selfie guiada (cliente) + fila de assinatura remota (médico) | Pouca (privacidade/consentimento) |
| C — Monetização por ato | Catálogo de serviços avulsos com preço + link de pagamento + área do cliente self-service | SIM — provedor de pagamento |
| D — Repasse e painel do médico | Valor por ato, split/repasse, painel de ganhos do assistente | SIM — regra de repasse + provedor |
| E — Vídeo de IA pós-validação | HeyGen (avatar) + ElevenLabs (voz), tabela `personalized_videos`, gatilho automático | SIM — contas/custo/consentimento |

---

## 4-A. Entrada no menu por ferramenta nova (REGRA DE OURO — toda ferramenta tem menu)

| Ferramenta nova (onda) | Onde entra no menu |
|---|---|
| Verificação pública de documento (Onda A) | Página pública `/verificar/:hash` (fora do menu admin) + link no rodapé do documento |
| Captura de foto do cliente (Onda B) | Botão dentro do Cadastro do Cliente ("Pedir foto por link") |
| Fila de Assinatura do médico (Onda B) | Nova entrada no menu, grupo CLÍNICO: "Assinaturas" |
| Serviços avulsos precificados (Onda C) | Subaba em Financeiro: "Serviços e Preços"; e card na Área do Cliente |
| Painel de ganhos do médico assistente (Onda D) | Nova entrada no menu, grupo GESTÃO: "Repasses / Médicos" |
| Vídeo de IA pós-validação (Onda E) | Sem entrada própria; aparece no detalhe da validação e na Área do Cliente |

---

## 4-B. Critérios de aceite de SEGURANÇA (Ondas B, C, D) — obrigatórios

| Critério | Aplica-se a |
|---|---|
| Token assinado com expiração curta (ex.: 30 min) | Link de selfie, link de assinatura, link de pagamento |
| Uso único quando aplicável (queima após usar) | Link de selfie, link de assinatura |
| Mensagem de erro genérica (anti-enumeração de CPF) | Verificação pública, área do cliente |
| Trilha de auditoria (quem/quando/de onde) | Assinatura remota, pagamento, verificação |
| Consentimento/LGPD explícito antes de capturar | Foto do cliente, vídeo de IA |
| Verificação não expõe dado clínico, só autenticidade | `/verificar/:hash` |

Frase de chamada: link remoto sem token curto + auditoria = porta aberta para fraude; é condição de aceite, não item opcional.

---

## 5. Decisões pendentes para o CEO (não construir antes de decidir)

1. Sequência: começar pela Onda A (campos + QR + verificável) — DEFAULT recomendado.
2. Provedor de pagamento (Onda C/D): Stripe (mais flexível, split nativo) é o caminho técnico recomendado; confirmar.
3. Preço por ato (avaliação/validação/exame avulso) e % de repasse ao médico assistente — números do CEO.
4. Vídeo de IA (Onda E): confirmar contas HeyGen/ElevenLabs e consentimento do paciente antes de qualquer geração.

---

## 6. Regra que vira FUNDAMENTO

Promulgado como Art. 63 do Código Paxter (`.agents/skills/paxter-loop/CODIGO-PAXTER.md`):
documento verificável (QR padrão) + captura remota (foto pelo cliente, rubrica/assinatura pelo médico,
sempre por link, nunca upload manual nosso) + ato clínico com valor e link de pagamento.

## 7. GitHub / Dr. Manus

O agente NÃO dá push (Art. 61). Tudo fica commitado nos checkpoints; o CEO sincroniza pela aba Git.
Para ouvir o Dr. Manus, o agente prepara uma carta ASCII em `cartas/` (Art. 48) com este roadmap.
