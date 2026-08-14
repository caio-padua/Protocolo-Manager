---
name: Sanitizador de texto em gerador de PDF — não filtrar por faixa Latin-1
description: Por que um filtro "tudo acima de U+00FF vira ?" estraga documento clínico, e qual é a regra correta quando as fontes são embutidas
---

# Filtro por faixa Latin-1 num gerador de PDF é armadilha

A regra ingênua `texto.replace(/[^\u0000-\u00FF]/g, "?")` parece defensiva e é
destrutiva. Ela pega travessão (U+2014), marcador de lista (U+2022), aspas
curvas e reticências — coisas que aparecem em título de protocolo e em texto
digitado pelo CEO — e imprime interrogação no documento que chega ao paciente.

Trocar o `?` por string vazia é **pior**, não melhor: o caractere some sem deixar
sinal, e um nome clínico pode ser mutilado sem ninguém perceber.

## A regra correta, em três camadas

1. **Transliterar** o que tem equivalente Latin-1 óbvio: travessões variantes,
   aspas curvas, reticências, espaços especiais, setas, sinais de comparação.
2. **Escrever por extenso** letra grega usada em nome de substância
   (alfa, beta, gama, delta, omega) — a fonte de corpo de texto costuma não
   desenhar grego, e nome de medicamento não pode sair truncado.
3. **Preservar todo o resto**, sem apagar.

## Por que preservar é seguro (e quando não é)

**Why:** fonte EMBUTIDA (`pdfDoc.embedFont`) não lança exceção com glifo ausente
— o caractere cai em `.notdef` e no pior caso sai um espaço. Já as 14 fontes
padrão do PDF (Helvetica e companhia, via `StandardFonts`) **lançam** exceção de
codificação WinAnsi. Como todo `drawText` do gerador vive dentro de `try/catch`,
essa exceção não aparece em log nenhum: ela apaga o bloco de texto inteiro em
silêncio.

**How to apply:** antes de afrouxar o sanitizador de qualquer gerador de PDF,
conferir se existe algum `StandardFonts` no arquivo. Se todas as fontes forem
embutidas, preservar é seguro. Se houver fonte padrão no meio, o caractere
precisa ser transliterado antes de chegar nela.

## Como provar que a fonte tem o glifo

Não confiar em suposição. Gerar o PDF e extrair o texto:
`pdftotext arquivo.pdf - | python3 -c "..."` contando o caractere por código
(`chr(0x2014)`). Se o travessão aparece na extração e no PNG da página, a fonte
desenha — e não há motivo para rebaixá-lo a hífen.
