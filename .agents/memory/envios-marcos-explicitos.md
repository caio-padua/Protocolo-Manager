---
name: Envios recentes — marcos explícitos
description: Regra do painel de progresso de exames na Área do Cliente
---
Etapas do envio vêm de evidência (exam_document_marcos, exam_identity_checks, conf1_at, status conferido), nunca de um status global.
**Why:** o proprietário rejeitou etapas "concluídas por inferência"; "recebido" não prova identidade.
**How to apply:** percentual = concluídas/6; 100% só com C2 real; "sinapses/fisiologia" sem backend = rótulo neutro. Nome comercial do PDF = DEEx (TEX alias).

## Classificação real x barra (16/11/2026)
- Barra = seis verificações; classificação = contagem separada (lib exam-progresso-resultados). Nunca escrever "100% classificados".
- **Why:** exames com analito sem catálogo/unidade/faixa nunca estarão 100% classificados; barra e classificador são coisas distintas.
- Gravação e leitura de faixa usam a mesma função (escolherFaixasInstitucionais); antes `ranges.find` gravava faixa do sexo errado. Sinapses de exame não existem (só anamnese).
