# -*- coding: utf-8 -*-
"""Espelho em Markdown da planilha da linha de producao.

Le o .xlsx gerado por gerar.py e escreve o .md que vai para o repositorio.
Motivo de existir: a planilha e para o CEO (Drive); o .md e para os agentes
(Dr. Replit e Dr. Lovable leem texto no repositorio, sem depender de copiar
e colar). Uma fonte, dois formatos — nunca divergem porque este script le
a planilha, nao uma segunda copia dos dados.
"""

import openpyxl

ORIGEM = "PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx"
DESTINO = "LINHA_DE_PRODUCAO_PADAXOR_VERSAO_26.07.29.md"

wb = openpyxl.load_workbook(ORIGEM, data_only=True)


def celula(ws, r, c):
    v = ws.cell(r, c).value
    return "" if v is None else str(v).replace("|", "\\|")


linhas = []
A = linhas.append

A("# LINHA DE PRODUCAO PADAXOR — VERSAO 26.07.29")
A("")
A("> Fila unica de trabalho do PADAXOR. Escrita pelo Dr. Code em 29/07/2026.")
A("> Existe porque tres agentes trabalham no mesmo sistema e ja consertaram")
A("> o mesmo arquivo tres vezes sem saber um do outro.")
A(">")
A("> Este arquivo e o ESPELHO da planilha que esta no Google Drive do CEO")
A("> (`PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx`). A planilha e para o CEO")
A("> marcar estado; este .md e para os agentes lerem sem depender de")
A("> copiar e colar. Quem muda o conteudo muda os dois.")
A("")
A("---")
A("")

# ---------------------------------------------------------------- linha 1
ws = wb["LINHA DE PRODUCAO"]
A("## 1. A FILA (36 itens, ordenada por prioridade)")
A("")
A("Ordem por PRIORIDADE, nao por ordem em que foi pedido. P0 vem antes de")
A("tudo: sao os itens de isolamento entre clinicas — enquanto abertos, uma")
A("segunda clinica no sistema pode ver dado da primeira.")
A("")
cab = [celula(ws, 4, c) for c in range(1, 10)]
A("| " + " | ".join(cab) + " |")
A("|" + "|".join([" --- "] * len(cab)) + "|")
for r in range(5, 41):
    A("| " + " | ".join(celula(ws, r, c) for c in range(1, 10)) + " |")
A("")
A("Contagem em 29/07/2026: 7 concluidos, 17 a fazer, 12 aguardando dependencia.")
A("")
A("---")
A("")

# ---------------------------------------------------------------- linha 2
ws = wb["MATRIZ DA EQUIPE"]
A("## 2. MATRIZ DA EQUIPE — territorio e fronteira")
A("")
A(celula(ws, 2, 1))
A("")
cab = [celula(ws, 3, c) for c in range(1, 6)]
A("| " + " | ".join(cab) + " |")
A("|" + "|".join([" --- "] * len(cab)) + "|")
for r in range(4, 9):
    A("| " + " | ".join(celula(ws, r, c) for c in range(1, 6)) + " |")
A("")
A("### Regras de convivencia")
A("")
for r in range(10, 16):
    t = celula(ws, r, 1)
    if t and not t.startswith("REGRA"):
        A(f"{t}")
        A("")
A("---")
A("")

# ---------------------------------------------------------------- linha 3
ws = wb["DECISOES DO CEO"]
A("## 3. DECISOES QUE SO O CEO TOMA (10 em aberto)")
A("")
A("Cada linha aqui esta travando trabalho. Nenhum agente decide por ele.")
A("")
cab = [celula(ws, 3, c) for c in range(1, 6)]
A("| " + " | ".join(cab) + " |")
A("|" + "|".join([" --- "] * len(cab)) + "|")
for r in range(4, 14):
    A("| " + " | ".join(celula(ws, r, c) for c in range(1, 6)) + " |")
A("")
A("---")
A("")

# ---------------------------------------------------------------- rodape
A("## 4. COMO USAR")
A("")
A("| Quem | O que faz com este arquivo |")
A("| --- | --- |")
A("| Dr. Caio | Marca `Estado` na planilha do Drive e responde a coluna `Sua resposta` das decisoes |")
A("| Dr. Code | Mantem este arquivo e a planilha em sincronia; executa os itens marcados como seus |")
A("| Dr. Replit Manager | Le a fila, pega os itens marcados como seus, NAO mexe em item de outro sem avisar |")
A("| Dr. Lovable | Idem, para os itens do site |")
A("| Dr. Manus | Sem frente nesta fase; candidato aos itens 32 e 33 |")
A("")
A("Trabalho novo entra como linha nova numerada a partir de 37 — nunca")
A("renumera o que ja existe (mesma regra do Art. 28-B da Biblia).")
A("")
A("## RESUMO EM 1 LINHA")
A("")
A("Fila unica de 36 itens numerados, com dono definido por item, matriz de")
A("territorio para os quatro agentes pararem de se atropelar, e as 10")
A("decisoes que estao travando trabalho e so o CEO pode desbloquear.")
A("")

with open(DESTINO, "w", encoding="utf-8") as fh:
    fh.write("\n".join(linhas))

print(f"gerado: {DESTINO} ({len(linhas)} linhas)")
