---
name: Receituário V2 pagina em vez de recusar
description: gerador do receituário nunca pode ter limite de uma página; excesso de fórmulas virava HTTP 500 genérico
---

# Receituário V2: cursor de página único, nunca "conteúdo ultrapassa o modelo"

O gerador antigo desenhava tudo numa página só e lançava erro quando o corpo passava do rodapé
(receita com ~5+ fórmulas longas). A rota devolvia 500 e a tela mostrava só "Falha interna ao salvar".

**Why:** o médico emite receitas com 9-10 fórmulas; limite de página é regra de negócio errada.
O erro real só aparecia no log porque a rota esconde mensagens não-Postgres do cliente.

**How to apply:** `page` é `let`; use `ensureSpace(n)`/`newPage()` (rodapé por página + cabeçalho de
continuação + "Página i de n"); bloco assinatura+certificado+detalhes fica junto (ensureSpace 150).
Qualquer nova seção do corpo deve chamar ensureSpace. Não reintroduzir `throw` por excesso de itens.
Ao diagnosticar 500 genérico de emissão: ler `errorMessage` no log "Falha transacional ao emitir prescrição".

## Layout premium e fontes
Rodapé de cada página repete QR + nº da receita + paciente + "Página i de n"; certificado fica à esquerda e assinatura à direita.
Fonte serif (EB Garamond) embutida pelo pdf-lib junta "fi" com espaço torto ("Identifi cação"); embedFont com `features:{liga:false,clig:false}` resolve.
Ativos e posologia usam a mesma fonte e tamanho (a posologia só muda de cor).
