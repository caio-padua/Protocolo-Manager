# CONCEITO RAIZ — Sistemas Primos Independentes (IHE x Manager)

> Texto integral movido do `replit.md` em 25/07/2026 (autorização do CEO). Decisões-raiz do CEO sobre a transmutação IHE -> Manager.


Decisao do CEO (Dr. Caio), registrada em 14/06/2026. Vale como regra para todas as ondas de integracao/transmutacao.

1. IHE (Integrative Health Engine) e Padcon Conect (Manager) sao sistemas PRIMOS: independentes, cada um dono dos seus proprios dados, que colaboram por interface — nunca fundidos.

2. Na transmutacao/integracao, NADA entra com prefixo de origem nem coluna/tag de origem. O dado, ao entrar num sistema, passa a ser nativo dele.

3. "Separar os gemeos siameses": mesmo com dor no coracao, desacoplar tudo que hoje esta conjugado entre os dois sistemas.

4. Colaboracao maxima: cada Dr (agente) pensa 10 passos a frente em possiveis conflitos e erros antes de agir.

5. Esta decisao SUBSTITUI a premissa anterior da CARTA_02 (que pedia TAG de origem e import unificado). A nova diretriz e: primos independentes, sem tag de origem.

6. EXCECAO ao item 2 (decisao do CEO em 15/06/2026): as tabelas-deposito do catalogo `catalogo_formulas`, `catalogo_injetaveis` e `catalogo_implantes` usam a coluna `id_ihe` (id de origem do IHE) como chave unica de deduplicacao. Motivo: nessas tres colecoes nenhum campo de negocio e unico (codigo_semantico se repete), entao so o id de origem garante 0 perda de dado (54 formulas / 305 injetaveis / 32 implantes). As demais colecoes mantem chave de negocio nativa (catalogo_itens=codigo_padcom, catalogo_blends=codigo_blend, periodos_dia=sigla) e os pacientes deduplicam por chave natural, sem id de origem.

6-A. EXTENSAO da excecao (Onda 1 motor/exames — aprovada pelo CEO em 15/06/2026, apos auditoria do commit 5ca1888d): mais 5 colecoes usam `id_ihe` como chave de deduplicacao porque nenhum campo de negocio e unico nelas (verificado por teste de unicidade): `catalogo_doencas`, `motor_regras` (regra_id repete 3x), `anamnese_questionario` (pergunta_id Q030 duplica), `mapa_anamnese_motor`, `catalogo_endovenosos` (soros repetem codigo). As demais 8 colecoes da Onda 1 mantem chave de negocio nativa: catalogo_exames=codigo_exame, catalogo_analitos=codigo, catalogo_blocos=codigo_bloco, catalogo_bloco_exames=(bloco_id+nome_exame+grau), direcao_favoravel_exame=nome_exame, catalogo_sintomas=codigo_semantico, catalogo_cid10=codigo, motor_decisao_clinica=caso_id. `catalogo_exames` guarda a linha crua inteira em coluna jsonb `dados` (zero perda das 68 colunas de origem).

6-B. DIVIDAS TECNICAS da Onda 1 (registradas pelo CEO em 15/06/2026 para a proxima onda; NAO bloqueiam a Onda 1): (1) vinculo bloco<->exame hoje e por TEXTO (nome_exame) — migrar para chave estrangeira (FK) por id antes de o motor consumir em producao; (2) campos sim/nao vieram como TEXTO — converter para booleano ao montar a tela; (3) a consulta do motor por doenca pede o numero `id_ihe` — adicionar busca por nome/codigo.
