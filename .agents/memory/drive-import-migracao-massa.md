---
name: Importação em massa do Drive (matching + porteiro + custo)
description: Armadilhas duráveis do worker de migração que varre o Drive e extrai exames (matching de pasta, porteiro anti-lixo, teto de IA).
---

# Importação em massa do Drive → exames

Motor que varre pastas de cliente no Drive, coleta PDF **e** imagem, extrai por
texto ou por visão (Gemini multimodal) e joga nas tabelas de exames. Roda dentro
do processo persistente do api-server (bash em background não sobrevive).

## Regra do CEO: homônimo = mesma pessoa (salvo CPF diferente)
O matcher NUNCA retorna "ambíguo". Nome casa 0 → none, 1 → único, N → desempata
por CPF; sem CPF de desempate = mesma pessoa (1º cadastro), sem perguntar.

**Why:** decisão do CEO (10/07/2026): ele afirma não ter homônimos; parar a
migração para perguntar mataria a autonomia.

## Armadilha 1 — CPF no nome da pasta quebra o match por nome
Pastas criadas pelo sistema vêm "NOME CPF: xxx.xxx.xxx-xx". Se o CPF entrar no
nome normalizado, `findByName` (igualdade exata) nunca casa e retorna none ANTES
de qualquer desempate. **Regra:** remover o número + rótulo "CPF" do nome antes de
casar (stripCpfFromFolder); o mesmo CPF vira a DICA de desempate (parseCpfFromFolder).

## Armadilha 2 — porteiro anti-lixo precisa ser fail-OPEN
O porteiro (classifica se o arquivo é exame antes de gastar a extração pesada) só
pode marcar "ignorado" (permanente, com dedup por (clientId,hash) que bloqueia
re-execução) quando o modelo AFIRMA que não é exame. Resposta vazia / JSON inválido
= falha transitória → LANÇAR exceção → o worker conta como erro SEM gravar linha →
a próxima run reprocessa. Colapsar erro em "none" descarta exame verdadeiro para sempre.

**Why:** o objetivo é "lançar tudo"; um falso-negativo do classificador não pode
virar perda definitiva de laudo.

## Armadilha 3 — teto de custo conta arquivos PROCESSADOS
`maxFiles` tem de contar todo arquivo tocado (exame/duplicado/não-exame/erro), não
só os ingeridos com sucesso; senão uma pasta cheia de lixo estoura o teto de IA.
O sniff de CPF do 1º arquivo (desempate de homônimo) também gasta IA → também entra
no mesmo contador, com guarda de orçamento antes de rodar.

## Idempotência e reprocesso
Dedup por (clientId, hash) — hash global misturaria prontuários. Docs "ignorado"
(não-exame confirmado) ficam gravados de propósito para não repagar IA em re-runs.
Retry explícito de docs em status "erro" (falha de extração pós-classificação) é
dívida conhecida, não bloqueante.
