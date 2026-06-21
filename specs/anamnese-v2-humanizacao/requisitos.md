# Requisitos detalhados — Anamnese v2 Humanização

Cada requisito traz: o que fazer, casos extremos, e DONE (conferível).

---

## R1 — Desligar o portão de senha (reversível)

- **O que fazer**: criar uma flag única reversível que faz o `CollaboratorGate` liberar o conteúdo sem login, mostrando um banner "MODO TESTE — ACESSO ABERTO".
- **Mecanismo**: variável de ambiente do front (`VITE_OPEN_ACCESS` = "1") OU constante única num módulo. Quando ligada, `CollaboratorGate` renderiza `children` direto, com banner âmbar de aviso.
- **Escopo**: apenas o portão de TELA (`CollaboratorGate`). NÃO mexer no backend (rotas de colaborador continuam existindo). RBAC real fica para a fase de governança.
- **Casos extremos**: com a flag desligada, comportamento ANTERIOR intacto (login normal). A flag não pode vazar para produção sem decisão — default = comportamento atual quando a env não existe.
- **DONE**: com a flag ligada, abrir `/cadastros/*` e `/anamnese/revisao` sem senha; banner de aviso visível; com a flag ausente, volta a pedir senha.

---

## R2 — Rolar para o topo ao virar bloco/pergunta

- **O que fazer**: em `anamnese-v2/index.tsx`, ao mudar `groupIdx` (modo grupo) e `focusIdx` (modo foco), rolar a janela/container para o topo do questionário.
- **Mecanismo**: `useEffect` dependente de `groupIdx`/`focusIdx` → `window.scrollTo({ top: 0, behavior: "smooth" })` (ou scroll no container do cartão). Reusar o que já existe na linha ~307.
- **Casos extremos**: não rolar no primeiro render se atrapalhar a tela de identificação; auto-avanço (linha 209) também deve rolar.
- **DONE**: ao avançar/voltar de bloco, a tela já aparece no início da pergunta, não no rodapé.

---

## R3 — Cada pergunta = painel próprio com ajuda em tópicos (regra de ouro)

- **O que fazer**: cada pergunta vira um painel (`panel-3d`) com, abaixo do enunciado, um bloco de AJUDA em Concavo (`concave-3d`) explicando em linguagem leiga — uma ideia por linha (Padrão 6 `ExplainRow`), nunca parágrafo linear. Altura proporcional ao texto (sem sombra cobrindo a leitura). Base no design do cadastro de clientes + `skill-layout-paxter`, melhorado.
- **Fonte do conteúdo**: coluna `observacao` (ajuda) da tabela `anamnese_questionario`. Renderizar como lista de linhas (split por `\n` ou `;`). Se vazia, não mostrar o bloco (não inventar texto na tela; o texto vem do seed).
- **Dado**: popular `observacao` no seed para as perguntas-chave (no mínimo: queixa/B*, AUDIT, CAGE, tabagismo, cirurgias, sintomas com termo técnico). Texto leigo, curto, uma ideia por linha.
- **Casos extremos**: pergunta sem ajuda → painel mostra só enunciado + controle; ajuda longa não pode estourar o cartão (cartão cresce, sombra respira).
- **DONE**: ao percorrer como paciente, perguntas com termo técnico têm um Concavo de ajuda legível, em tópicos.

---

## R4 — Botão de vídeo explicativo por pergunta

- **O que fazer**: quando a pergunta tiver URL de vídeo, mostrar um botão "Ver vídeo" (ícone Play, `btn-3d-soft`) ao lado do enunciado/ajuda; clicar abre o vídeo (modal ou nova aba).
- **Dado**: adicionar coluna ADITIVA `video_url text` em `anamnese_questionario` (nullable). Sem URL → botão não aparece.
- **Casos extremos**: URL ausente/nula → sem botão; URL inválida → abre nova aba mesmo assim (responsabilidade do cadastro).
- **DONE**: existe o caminho do dado (coluna + render). Botão aparece quando `videoUrl` preenchida (validar com 1 pergunta de exemplo recebendo URL placeholder).

---

## R5 — Exemplo de resposta em cada campo

- **O que fazer**: mostrar o exemplo (coluna `exemplo`) como dica abaixo do controle, em tom leve ("Exemplo: ..."). Em campos de texto, usar também como `placeholder`.
- **Dado**: popular `exemplo` no seed para perguntas abertas/numéricas-chave (início dos sintomas, cirurgias, maços-ano, etc.).
- **Casos extremos**: exemplo vazio → não mostra a linha.
- **DONE**: campos abertos-chave exibem "Exemplo: ..." e/ou placeholder vindo do banco.

---

## R6 — Cirurgias clicáveis (nome leigo + técnico)

- **O que fazer**: trocar Q015 ("CIRURGIAS PREVIAS") de `TEXTO LONGO` para multisseleção clicável de cirurgias comuns, cada opção com nome leigo + técnico entre parênteses, mantendo um campo livre para "Outra".
- **Dado**: no seed, Q015 vira `MULTISELECAO` com `opcoes` de cirurgias comuns (ex.: "Cesárea (parto cirúrgico)", "Vesícula (colecistectomia)", "Apêndice (apendicectomia)", "Hérnia (herniorrafia)", "Coluna (artrodese)", "Joelho (artroscopia)", "Útero (histerectomia)", "Amígdalas (amigdalectomia)", "Catarata (facectomia)"). Mais opção "Nunca operei" e "Outra".
- **Render**: `MultiControl` já existe. "Outra" precisa abrir um campo de texto livre (extensão pequena do controle multi, OU manter Q015 multi + Q015b texto opcional "Outra cirurgia / observações").
- **Casos extremos**: "Nunca operei" deve ser exclusivo (limpa as demais); marcar uma cirurgia limpa "Nunca operei".
- **DONE**: paciente marca cirurgias clicando, sem digitar nome técnico; consegue registrar "Outra".

---

## R7 — Lógica por sexo

- **O que fazer**: esconder perguntas do `sistema: "Andrologico"` para sexo Feminino e do `sistema: "Ginecologico"` para sexo Masculino, com base na resposta A04 (SEXO BIOLOGICO) já coletada no bloco A.
- **Mecanismo**: marcar as perguntas sexo-específicas com `aplicavelEm: { sexo: "M" }` ou `{ sexo: "F" }` no seed; no front, filtrar `activeQuestions` (e os grupos/contagem) removendo perguntas cujo `aplicavelEm.sexo` não bate com a resposta de A04. Enquanto A04 não respondida, mostrar (não esconder por engano).
- **Casos extremos**: A04 não respondida ainda → não esconder; contagem de progresso/percentual deve refletir só as perguntas visíveis; bloco que fique vazio por filtro não deve quebrar navegação.
- **DONE**: como mulher, a pergunta de ereção (L-AND01) NÃO aparece; como homem, perguntas ginecológicas não aparecem.

---

## R8 — Barras de intensidade padronizadas

- **O que fazer**: garantir UM componente de barras para todas as escalas de intensidade (0–10 e 0–5), com rótulos de ponta ("Ausente" → "Máximo"). Consolidar no `EscalaControl`.
- **Casos extremos**: escala numérica de intensidade (B07 0–10) continua mostrando número; AUDIT (R9) mostra rótulo. Diferenciar: intensidade = número + barra; frequência/categoria = rótulo.
- **DONE**: escalas de intensidade têm visual único e padronizado.

---

## R9 — AUDIT-C com rótulos

- **O que fazer**: nas escalas cujas `opcoes` têm rótulo textual significativo (AUDIT-C), mostrar o RÓTULO de cada opção (ex.: "Nunca", "1x/mês ou menos") em vez de só 0–4. Render como lista de opções clicáveis (estilo `SingleControl`) preservando o `valor` numérico para o motor.
- **Mecanismo**: no `EscalaControl`, se os rótulos não forem apenas o próprio número, renderizar opções rotuladas (botões empilhados com o texto), guardando `{ tipo: "escala", escala: valor, max }`. Se os rótulos forem o número (intensidade 0–10), manter a régua numérica (R8).
- **Casos extremos**: B07 (0–10) tem label = número → mantém régua. AUDIT (labels textuais) → lista rotulada. O valor salvo continua sendo o `valor` numérico (peso intacto).
- **DONE**: AUDIT-C 1/2/3 mostram frases de frequência/dose, não números soltos; o valor numérico salvo não muda.

---

## R10 — CAGE 2: quem incomodou

- **O que fazer**: ao responder SIM em CAGE2 ("pessoas já o incomodaram..."), revelar uma pergunta de quem: parente / amigo; se parente, subcategoria (filho, mãe, pai, cônjuge/esposa, irmão, outro).
- **Dado**: adicionar no seed duas perguntas condicionais: CAGE2-QUEM (`MULTISELECAO`: Parente, Amigo, Colega, Outro) e CAGE2-PARENTE (`MULTISELECAO`: Filho(a), Mãe, Pai, Cônjuge, Irmão(ã), Outro), com `dependeDe` apontando para CAGE2 = SIM (e CAGE2-PARENTE depende de CAGE2-QUEM conter "Parente").
- **Mecanismo de dependência**: ver "Skip-logic por dependência" abaixo (compartilhado com R11).
- **Casos extremos**: CAGE2 = NÃO → as duas somem; marcar "Parente" revela subcategoria; desmarcar esconde.
- **DONE**: SIM em CAGE2 revela "quem"; "Parente" revela a subcategoria; NÃO esconde tudo.

---

## R11 — Tabagismo condicional

- **O que fazer**: I-TAB02 (maços-ano) e demais perguntas de cigarro só aparecem se I-TAB01 ≠ "Nunca fumou".
- **Mecanismo**: `dependeDe` em I-TAB02 apontando I-TAB01 ∈ {"ex","atual"}.
- **Casos extremos**: trocar a resposta de I-TAB01 para "Nunca fumou" depois de responder maços-ano → I-TAB02 some e sua resposta é ignorada na contagem.
- **DONE**: "Nunca fumou" some com maços-ano; "Fumante atual"/"Ex-fumante" mostra.

---

## R12 — Maços-ano calculado pelo sistema

- **O que fazer**: substituir o pedido de cálculo. Paciente informa cigarros/dia e anos de fumo; o sistema calcula maços-ano = (cigarros/dia ÷ 20) × anos e mostra o resultado.
- **Mecanismo**: controle composto novo `MacosAnoControl` (dois `field-engraved` numéricos + leitura do resultado em Concavo). Salvar como número (o maços-ano calculado) em I-TAB02, preservando o tipo `number` no contrato. Opcional: guardar também cigarros/dia e anos no valor texto/observação para auditoria — sem quebrar o contrato existente.
- **Dado**: I-TAB02 ganha marcador para usar o controle composto (ex.: `escalaValidada: "MACOS_ANO"` ou tipo dedicado). Atualizar o enunciado para não pedir conta ao paciente.
- **Casos extremos**: anos 0 ou cigarros 0 → resultado 0; valores não numéricos → tratados como 0; resultado com 1 casa decimal.
- **DONE**: paciente digita só dois números; o sistema mostra o maços-ano calculado; valor salvo coerente.

---

## R13 — Link do paciente abre o mini-dashboard

- **O que fazer**: o link distribuído ao paciente (WhatsApp) abre `/area` (mini-dashboard: Início, Protocolos, Agenda, Documentos, Enviar), com um caminho claro para a anamnese a partir de lá — não cair direto na anamnese.
- **Mecanismo**: (a) em `revisao.tsx` (gerador do link WhatsApp) trocar a URL de `/anamnese/v2` para `/area`; (b) em `area.tsx` corrigir o link de anamnese para `/anamnese/v2` (hoje aponta `/anamnese` legado) e dar destaque ("Responder anamnese").
- **Casos extremos**: paciente sem protocolo ainda → mini-dashboard mostra estado vazio mas com botão de anamnese; manter a anamnese acessível direto por URL para quem já tem o link antigo.
- **DONE**: clicar no link do paciente mostra o mini-dashboard com as opções; a anamnese é Uma das opções e abre a v2.

---

## R14 — Operacionalizar como paciente e como médico

- **O que fazer**: testar de verdade. Como PACIENTE: identificar, abrir `/area`, entrar na anamnese, percorrer blocos representativos (queixa, álcool, tabagismo, cirurgias, e — em conta feminina — confirmar ausência da pergunta de ereção). Como MÉDICO/colaborador: abrir a revisão/cadastros (com a flag de teste).
- **DONE**: screenshots dos pontos-chave provando cada comportamento; nenhum erro de runtime no console.

---

## Skip-logic por dependência (infra compartilhada R10/R11)

- **O que fazer**: introduzir um campo `dependeDe` (jsonb) em `anamnese_questionario` (aditivo, nullable) no formato `{ perguntaId: "CAGE2", inclui: ["S"] }` ou `{ perguntaId: "I-TAB01", inclui: ["ex","atual"] }`. No front, a pergunta dependente só entra em `activeQuestions` se a resposta da pergunta-âncora satisfizer a condição.
- **Compatibilidade**: o gateway por `sistema` (modo dinâmico atual) continua valendo; `dependeDe` é uma camada por-pergunta adicional, não substitui o gateway.
- **Casos extremos**: âncora ainda não respondida → dependente fica escondida; resposta da dependente escondida é ignorada na contagem e no envio.
- **DONE**: R10 e R11 funcionam por dado (`dependeDe`), sem if hardcoded por perguntaId.
