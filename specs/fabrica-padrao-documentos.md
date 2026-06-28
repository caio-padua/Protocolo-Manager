# Spec — Fábrica de Padrão de Documentos (Hermes)

> Status: RASCUNHO para aprovação do CEO (Fase 1 do Paxter Loop — ESPECIFICAR).
> Data: 28/06/2026. Autor: Dr. Replit Paxter.

---

## 1. Objetivo (uma frase)

Criar uma camada única de layout ("Fábrica") que padroniza cabeçalho, rodapé, tipografia, margens,
marca e blocos jurídicos de TODOS os documentos escritos do sistema, de modo que cada gerador
(protocolo, RAS, receituário, solicitação de exame, termos) passe a consumir o mesmo padrão visual
em vez de cada um desenhar o seu.

---

## 2. Contexto — documentos e motores atuais (fonte verificada)

| Documento | Arquivo gerador | Motor | Observação |
|---|---|---|---|
| Protocolo Completo (8-10 pág) | `lib/pdf-signer.ts` (`generateProtocolDocumentPdf`) | pdf-lib | capa, matriz de benefícios, fichas, TCLE, financeiro, assinatura |
| RAS assinado | `lib/pdf-signer.ts` + `lib/assinatura/` | pdf-lib + @signpdf (PAdES) | selo ICP-Brasil A1 |
| RAS FAP (papel) | `lib/ras-fap.ts` | pdfkit | grade IDÊNTICA ao `rasFap.ts` do IHE |
| Receituário | `lib/prescription-pdf.ts` | pdf-lib | único doc com "Instituto Pádua" |
| Solicitação de exame | `lib/exam-request-pdf.ts` | pdf-lib | enviado por e-mail/WhatsApp |
| Termo de consentimento (TCLE) | `lib/assinatura/consentimento.ts`, `htmlParaPdf.ts` | pdf-lib/HTML | texto jurídico |

Backup dos seis (estado de 28/06/2026) salvo em `backups/documentos-layouts-2026-06-28/`.

---

## 3. Requisitos exatos (o que a Fábrica deve entregar)

1. Criar um módulo compartilhado `lib/documentos/padrao.ts` (a "Fábrica") com TOKENS e CONTRATO por adapter:
   1.1. Tokens centralizados (puros, sem motor): cores (navy/ouro), fontes, tamanhos, margens, espaçamentos, textos da marca.
   1.2. Contrato `RenderDoc` (interface) com `desenharCabecalho(ctx, opts)`, `desenharRodape(ctx, opts)`, `desenharBlocoJuridico(ctx, texto)`.
   1.3. Adapter `pdf-lib` (`ctx` = `{ doc, page, fonts }`) — usado por protocolo, RAS, receituário, solicitação de exame.
   1.4. Adapter `pdfkit` (`ctx` = `PDFDocument`) — usado SOMENTE para o rodapé de marca, se a Decisão 3 permitir.
   1.5. Os adapters consomem os MESMOS tokens (1.1); nunca duplicar cor/fonte/margem em cada gerador.
2. Dois perfis de documento, com o MESMO esqueleto visual (mesmos tokens):
   2.1. DESCRITIVO (protocolo, RAS, solicitação de exame) — informativo.
   2.2. JURÍDICO (TCLE, termos, LGPD) — formal, com numeração de cláusulas.
3. Cada gerador pdf-lib passa a chamar a Fábrica para cabeçalho/rodapé/bloco jurídico,
   sem reescrever seu CONTEÚDO (apenas o "chrome" padroniza). O RAS FAP (pdfkit) segue a Decisão 3.
4. Marca: PAXTER no topo de todo documento; "Instituto Pádua" permanece SOMENTE no receituário.
5. Validação real: gerar os documentos depois da mudança e conferir visualmente (não só "compilou");
   o RAS assinado passa por verificação criptográfica PAdES pós-geração (selo válido).

---

## 4. Padrão visual proposto (defaults recomendados)

| Elemento | Proposta default |
|---|---|
| Margem | 2,0 cm em todos os lados |
| Cabeçalho | Faixa superior: wordmark PAXTER (esquerda) + título do documento (direita), régua fina ouro abaixo |
| Identificação | Linha sob o cabeçalho: nome do cliente, CPF, data do serviço |
| Tipografia título | Serifada (linha da marca), ouro sólido sobre navy |
| Tipografia corpo | Sem serifa, cinza-escuro, 10-11 pt |
| Rodapé | "página X de Y" (centro), legenda da marca encerrando nas verticais do conteúdo |
| Cores | Navy `#1f2a44` (texto/título), Ouro `#c9a227` (detalhe), cinza corpo |
| Bloco jurídico | Cláusulas numeradas, recuo, fonte 9 pt, título "TERMO" em maiúsculo |

---

## 5. Decisões em aberto (martelos do CEO — uma por vez na conversa)

DECISÃO 1 — Abrangência da primeira onda:
- (A) Só padronizar cabeçalho + rodapé dos seis documentos (mínimo, baixo risco). [DEFAULT recomendado]
- (B) Cabeçalho + rodapé + bloco jurídico unificado.
- (C) Reescrever todos os layouts do zero num motor único.

DECISÃO 2 — Motor de PDF da Fábrica:
- (A) Manter cada gerador no seu motor atual (pdf-lib e pdfkit) e só compartilhar primitivas compatíveis. [DEFAULT]
- (B) Unificar tudo em pdf-lib (exige reescrever o RAS FAP, que hoje é pdfkit e cópia idêntica do IHE).

DECISÃO 3 — RAS FAP entra na padronização visual?
- (A) NÃO mexer no RAS FAP (linha vermelha: grade idêntica ao IHE). [DEFAULT]
- (B) Aplicar só o rodapé de marca, sem tocar na grade.

---

## 6. Casos extremos a tratar

1. Documento de 1 página vs 10 páginas — rodapé "X de Y" correto em ambos.
2. Cliente sem CPF válido (placeholder) — cabeçalho não pode quebrar.
3. RAS assinado (PAdES): a padronização NÃO pode invalidar a assinatura digital (desenhar antes de assinar).
4. Receituário: manter "Instituto Pádua"; demais documentos nunca exibem.
5. Faixa MODO TESTE/DEMO visível quando o documento for de demonstração.

---

## 7. Definição de PRONTO

| Critério | Conferido por |
|---|---|
| Os documentos pdf-lib (protocolo, RAS, receituário, solicitação de exame, TCLE) usam a mesma Fábrica de cabeçalho/rodapé | leitura do diff + geração real |
| RAS FAP segue a Decisão 3 (3A = grade intacta, fora do chrome; 3B = só o rodapé de marca) | comparação visual com backup |
| Assinatura PAdES do RAS continua válida (verificação criptográfica do selo) | geração real + verificação `pdfsig`/@signpdf |
| Tokens centralizados; nenhum gerador duplica cor/fonte/margem | leitura do diff |
| Marca PAXTER no topo; "Instituto Pádua" só no receituário | inspeção visual de todos os PDFs |
| Aprovado pelo architect sem pendência | Fase 3 do loop |

---

## 8. Linhas vermelhas

1. NUNCA alterar o motor da grade do RAS FAP (`lib/ras-fap.ts`) — é cópia idêntica do `rasFap.ts` do IHE.
2. NUNCA quebrar a assinatura digital PAdES (desenhar conteúdo ANTES de assinar).
3. NUNCA mudar UID/conteúdo de `.ics`, colunas do banco, nomes de pacote ou tokens por estética.
4. NÃO tocar em motor de cálculo/orçamento.
5. "Instituto Pádua" permanece exclusivo do receituário; marca visível ao cliente = PAXTER.
