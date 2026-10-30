---
name: Governanca, identidade do repo e GitHub (Manager)
description: Identidade do repositorio Manager, fluxo de Push ao GitHub, lei de linhagem dos arquivos de diretrizes e formato de resposta densidade B.
---

# Identidade deste repositorio

- Este repo = produto **Padcon Conect** / **Manager**. O agente Replit aqui assina como **Dr. Replit Paxter**.
- Remote GitHub: o `origin` e o repositorio `Protocolo-Manager` na branch `main`. A URL completa e o owner ficam no `.git/config` (derivavel; nao duplicar aqui). A URL raw segue o padrao `raw.githubusercontent.com/<owner>/Protocolo-Manager/main/<ARQUIVO>`.

# Push ao GitHub

Consultar [transporte gerenciado](git-http-auth-fallback.md).
A antiga afirmacao de impossibilidade de envio deixou de corresponder ao ambiente.
Autorizacao do proprietario e comparacao com a revisao remota continuam obrigatorias.

# Lei de linhagem (arquivos de diretrizes versionados por data)

- Arquivos da Biblia do CEO usam nome `..._aa.mm.dd.md` (ex.: `DIRETRIZES_CENTRAIS_E_PRE_REQUISITOS_CEO_DR_CAIO_26.06.14.md`).
- **Regra:** nunca editar a versao antiga. Criar uma versao NOVA com data maior e deixar a antiga arquivada intacta. Atualizar titulo/cabecalho, a linha "Versao aa.mm.dd" e adicionar entrada no "HISTORICO DE VERSOES (append-only)".
- Formato interno: "codigo penal" (Titulo/Artigo citavel), ASCII sem acento, acrescimo nunca renumera (usa Art. N-A).

# Formato de resposta ao CEO — densidade canonica "B" (travada 15/06/2026)

- Fonte: TITULO XI da Biblia (Arts. 37-50) e secao "Preferencias do Usuario" do replit.md.
- A **TABELA emoldurada** e o carro-chefe; numeracao so AGRUPA assunto; parede linear "uma frase por linha" PROIBIDA como portadora principal; fluxo vira blueprint com setas (A -> B -> C); separador "---" entre secoes; fechar com "RESUMO EM 1 LINHA".
