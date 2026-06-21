# Anamnese V2 — 05 · Liberdade: pular, ordem livre, recusar blocos

## 1. Liberdade de COMO, QUANDO e em QUE ORDEM
- Responder em qualquer ordem: o "Mapa da anamnese" (02 secao 3) permite saltar a qualquer grupo.
- Pular categoria agora e voltar depois: "Pular" marca o grupo como pendente, nao bloqueia o resto.
- Ir direto ao final: atalho "Ir para o final" (ex.: preferencias terapeuticas/financeiras).
- Responder so um grupo e sair: autosave garante que volta exatamente onde estava.

## 2. Recusar um bloco (exigencia explicita do CEO)
- Cada grupo tem acao "Prefiro nao responder este bloco".
- Abre confirmacao curta com motivo OPCIONAL (clique em motivos comuns + campo livre).
- Registra em `anamnese_refusals` (escopo, alvo, motivo, data).
- O grupo no mapa fica com selo "RECUSADO" (cor neutra/ambar), nunca some.

## 3. O que a recusa gera (visivel para o medico + RAS + juridico)
| Destino | O que aparece |
|---|---|
| Tela do medico | lista "Blocos recusados" com motivo e horario |
| RAS de relatorio | secao "Recusas registradas" (transparencia clinica) |
| Relatorio juridico | registro de que o paciente foi questionado e optou por nao responder (protecao legal) |

## 4. Estados de um grupo (no mapa)
```
VAZIO -> EM ANDAMENTO -> COMPLETO
   \-> PULADO (volta depois)   \-> RECUSADO (registrado)
```
Cada estado tem cor e selo proprios (Grade Imaginaria: status ao lado do nome, posicao fixa).

## 5. Conclusao com pendencias
- Pode concluir mesmo com grupos pulados/recusados; a tela final mostra o que ficou de fora.
- O motor roda com o que existe (semantica de ausencia inalterada: ausente = nao respondido).

RESUMO EM 1 LINHA: paciente escolhe ordem, pula e volta a vontade, e pode recusar blocos inteiros —
e toda recusa fica registrada e visivel para o medico, para o RAS e para o relatorio juridico.
