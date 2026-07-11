---
name: recharts connectNulls não compacta o eixo
description: por que um gráfico de evolução com datas vazias estica; como compactar
---

# recharts: connectNulls liga a linha mas NÃO compacta o eixo X

Num gráfico de evolução alimentado por uma matriz de datas x exames, muitas células
são nulas (aquele exame não foi medido naquela coleta). Passar a série inteira ao
recharts com `connectNulls` desenha a linha pulando os nulos, MAS o eixo X continua
alocando um tique para cada data — inclusive as vazias — então os poucos pontos reais
ficam espremidos/esticados.

**Regra:** para um gráfico "só com pontos que têm valor", FILTRE a série antes de
entregar ao recharts (`.filter(cell.valueNum != null)`), não confie em `connectNulls`.
Assim o eixo X só recebe as datas realmente medidas e o gráfico fica compacto.

**Why:** queixa do CEO na aba Evolução do cockpit-cliente — eixo esticado com datas
sem medição. connectNulls não resolveu porque o problema é o domínio do eixo, não a
continuidade da linha.

**How to apply:** vale para qualquer gráfico derivado de matriz esparsa (evolução de
exames, séries por período). Filtrar a série por analito/curva antes do <LineChart>.
