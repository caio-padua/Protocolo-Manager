---
name: Seed idempotente não faz backfill de coluna nova
description: Por que um seed guardado por "existe?" não preenche campo novo em linhas já semeadas; e por que seed de demo precisa ser commitado.
---

# Seed idempotente não faz backfill de coluna nova

Um seed idempotente que pula a linha quando ela já existe (guarda por `SELECT ... limit 1`
ou `onConflictDoNothing`) NÃO preenche uma coluna recém-adicionada em linhas que já foram
semeadas antes (ex.: por SQL ad-hoc em runtime). Ele só INSERE o que falta; nunca ATUALIZA
o que existe.

**Sintoma:** adicionei a coluna `sono` ao pulso e ao seed, mas a demo continuava mostrando
"—" em Sono — porque as 42 linhas já existiam (semeadas antes por SQL, sem `sono`) e o seed
as pulou.

**Como aplicar:**
- Para backfillar um campo novo numa demo/cliente de TESTE: apagar as linhas do teste
  (`DELETE ... WHERE cliente_id = <demo>`) e deixar o seed do boot repopular. Seguro só
  porque é `is_teste` — nunca em paciente real.
- Alternativa sem apagar: um caminho de UPDATE explícito no seed (mais complexo; só se não
  puder limpar).

**Regra de reprodutibilidade (architect):** semear demo por SQL em runtime NÃO conta como
entregue — o architect não vê no diff e some num reset/rollback. O seed de demonstração tem
de ser CÓDIGO commitado (arquivo `lib/seed-*.ts` idempotente, ligado no boot igual aos
outros), determinístico (sem `Math.random`) para a demo ficar estável entre reinícios.

**Cuidado do boot (memória seed-runner-bundle-exit):** o arquivo de seed não pode ter bloco
`import.meta.url === argv[1]` + `process.exit` — o esbuild empacota e derruba o servidor;
exportar só a função e chamá-la no `app.listen`.
