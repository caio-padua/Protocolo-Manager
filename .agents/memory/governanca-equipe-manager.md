---
name: Governanca, identidade do repo e GitHub (Manager)
description: Identidade do repositorio Manager, fluxo de Push ao GitHub, lei de linhagem dos arquivos de diretrizes e formato de resposta densidade B.
---

# Identidade deste repositorio

- Este repo = produto **Padcon Conect** / **Manager**. O agente Replit aqui assina como **Dr. Replit Manager**.
- Remote GitHub: `origin` -> `https://github.com/caio-padua/Protocolo-Manager` (branch `main`).
- URL raw padrao de um arquivo na raiz: `https://raw.githubusercontent.com/caio-padua/Protocolo-Manager/main/<ARQUIVO>`.

# Push ao GitHub (limite do ambiente)

- O agente NAO consegue dar `git push`/`git commit` direto: comandos git destrutivos sao bloqueados no sandbox e a credencial do GitHub fica na conta Replit do usuario, nao no ambiente do agente.
- Os checkpoints automaticos do Replit fazem commit LOCAL, mas NAO empurram para o `origin` (GitHub).
- **Como aplica:** quando uma carta pedir "Commit & Push + SHA + URL raw", o agente prepara os arquivos e a mensagem de commit; o PUSH em si o usuario dispara pela aba "Git" / controle de versao do Replit. SHA e URL raw so existem depois do push.

# Lei de linhagem (arquivos de diretrizes versionados por data)

- Arquivos da Biblia do CEO usam nome `..._aa.mm.dd.md` (ex.: `DIRETRIZES_CENTRAIS_E_PRE_REQUISITOS_CEO_DR_CAIO_26.06.14.md`).
- **Regra:** nunca editar a versao antiga. Criar uma versao NOVA com data maior e deixar a antiga arquivada intacta. Atualizar titulo/cabecalho, a linha "Versao aa.mm.dd" e adicionar entrada no "HISTORICO DE VERSOES (append-only)".
- Formato interno: "codigo penal" (Titulo/Artigo citavel), ASCII sem acento, acrescimo nunca renumera (usa Art. N-A).

# Formato de resposta ao CEO — densidade canonica "B" (travada 15/06/2026)

- Fonte: TITULO XI da Biblia (Arts. 37-50) e secao "Preferencias do Usuario" do replit.md.
- A **TABELA emoldurada** e o carro-chefe; numeracao so AGRUPA assunto; parede linear "uma frase por linha" PROIBIDA como portadora principal; fluxo vira blueprint com setas (A -> B -> C); separador "---" entre secoes; fechar com "RESUMO EM 1 LINHA".
