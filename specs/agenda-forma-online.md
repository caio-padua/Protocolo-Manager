# Agenda x Local: vocabulario unico (Sede / Online / Outro local)

Decisao do CEO (11/11/2026): agenda e local de atendimento sao coisas distintas. A "forma" de uma agenda
tem tres valores de tela: Sede, Online, Outro local. A palavra "remoto" some do sistema inteiro.

## Mapa de valores

| Camada | Antes | Depois |
|---|---|---|
| agenda_resources.modality (gravado) | local / online / externo | igual (ja era online) |
| locations.agenda_papel (gravado) | local / remoto / externo / pessoal / geral | local / online / externo / pessoal / geral |
| Rotulo de tela da forma | Sede / Remoto / Externo | Sede / Online / Outro local |
| Nome gravado | "... - REMOTO" | "... - ONLINE" (so o sufixo, nenhum registro apagado ou fundido) |

## Cartao unico de agenda (Agenda Configuracao e cadastro interno da empresa)

1. Titulo: AGENDA PROFISSIONAL + nome da categoria (sem categoria provada = "categoria pendente", nunca inferida).
2. Forma de atendimento: Sede, Online ou Outro local.
3. Titulo da agenda: o nome livre.
4. Vidro de cor a esquerda. A cor e UMA so: alterar na agenda atualiza o local ligado e vice-versa.

## Falhas previstas

- Migracao: constraint de agenda_papel precisa trocar dentro da MESMA transacao do UPDATE (senao viola).
- Reexecucao: migracao idempotente (DROP IF EXISTS + UPDATE so de 'remoto' + ADD).
- Calendarios do Google ainda se chamam "- REMOTO": o sugeridor de papel reconhece "- REMOTO" e "- ONLINE" e devolve `online`.
- Nome gravado em outras tabelas (historico) nao e reescrito.
- Producao: migracao 20261120 precisa ser aplicada junto das pendentes antes de qualquer publicacao.
