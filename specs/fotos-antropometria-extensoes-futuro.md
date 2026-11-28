# Fotos, Antes/Depois e Antropometria — extensões ativáveis (CATÁLOGO PARA IMPLEMENTAÇÃO FUTURA)

Estado: **SOMENTE PLANEJAMENTO. Nada deste arquivo foi construído.** Registrado em 17/11/2026 a pedido do
Dr. Caio, a partir do parecer técnico da mesma data. Quando uma etapa for construída, criar o spec próprio dela
(método Paxter Loop: especificar, prever falhas, construir, revisar, testar) e marcar aqui o que foi feito.

Prioridade declarada pelo Dr. Caio: **excelência** no módulo de fotos, antes/depois e antropometria.

Arquivos irmãos que já existem: `specs/fotos-evolucao-corporal.md` (o que está construído hoje) e a memória
`.agents/memory/fotos-corpo-privacidade-comparador.md`.

---

## 1. Ponto de partida real (verificado em 17/11/2026, HEAD `37421823`, branch `homologacao/paxmed-modelo-2b`)

| Peça | Onde | Estado |
|---|---|---|
| Fotos de evolução (4 ângulos) | tabela `client_body_photos`, `routes/fotos-corpo.ts`, `lib/fotos-corpo.ts` | Funciona e foi testado (33 checagens de API e 6 testes de tela). Teste automático permanente **foi removido**; só restam capturas de tela |
| Comparador no Cockpit | `cockpit-cliente/fotos/FotosModal.tsx`, `GradeReferencia.tsx` | Funciona: lado a lado, cortina, transição, grade de 10 cm |
| Fotos na Área do Cliente | `components/FotosCorpoCliente.tsx`, aba "MINHAS FOTOS" em `pages/area.tsx` | Funciona |
| Medições corporais (6 tipos) | tabela `client_avaliacoes`, `lib/avaliacoes-corporais`, `routes/avaliacoes-corporais.ts`, `cockpit-cliente/avaliacoes/*` | Implementado, **0 linhas no banco**, sem teste dedicado e sem prova registrada |
| Gráfico de evolução das medições | `EvolucaoMedicoes.tsx` | Implementado, sem dado real |
| Foto de rosto do cadastro | `routes/client-photo.ts`, `client_photo_history` | Funciona (histórico e cópia no Drive) |
| Aplicativo instalável (PWA) | `public/manifest.webmanifest`, `public/sw.js` | Existe; registro do service worker só em produção |
| Liga/desliga por clínica | `empresas.modulos_ativos` + `middleware/moduleGuard.ts` | Existe, mas com 10 módulos fixos; fotos e medições **não** passam por ele |

Lacunas confirmadas:
1. Consentimento é um único carimbo (`consent_at`), sem finalidades separadas nem revogação.
2. Não existe registro de quem viu cada foto.
3. Não existe política de guarda nem rotina de retenção.
4. A tabela `clients` **não tem** altura nem peso. A chave `altura_cm` em `clients.ficha_clinica` existe em muitos
   cadastros, mas só 3 clientes ativos têm valor numérico. A altura do comparador é digitada na hora.
5. O servidor apaga EXIF/GPS da foto ao regravar (decisão de privacidade). O pedido novo quer preservar original e
   metadados: **conflito que precisa de decisão** (seção 9).
6. Não existe medição informada pelo cliente no portal, nem relatório PDF de evolução.
7. 11 fotos do cliente de teste 5298 (removido logicamente) continuam guardadas e inacessíveis; falta regra de retenção.

---

## 2. Princípios (linhas vermelhas)

1. Regra de Ouro: nunca apagar. Desinstalar = suspender; remover foto = `deleted_at`.
2. Foto corporal é dado de saúde sensível (LGPD, art. 11): armazenamento privado, rota autenticada, nunca prefixo público.
3. Nenhuma IA altera, "melhora" ou gera imagem do corpo. Qualquer análise automática é apoio e vem rotulada como tal;
   a imagem não é prova clínica nem diagnóstico.
4. Nenhum download arbitrário de código. Extensão = módulo da casa, versionado, dentro do repositório.
5. Nenhuma promessa de recurso que não exista. Parceiro externo só entra por contrato.
6. Custo mínimo: recursos locais primeiro; custo variável só com aprovação expressa.
7. Origem de cada dado é sempre visível: "medido pela equipe", "informado pelo cliente", "do cadastro", "calculado".
8. Altura/peso usados numa comparação são **gravados junto da série**; corrigir o cadastro depois nunca muda o histórico.
9. Identificação visual: usar dados fictícios em teste, com marca "FICTICIA" nas imagens.

---

## 3. Quatro tipos de recurso (não misturar)

| Tipo | O que é | Como entra | Custo e risco |
|---|---|---|---|
| (a) Função local | comparador, relatório PDF, gráficos, medição informada pelo cliente | código no próprio aplicativo, ligado por chave por clínica e carregado só no primeiro clique (lazy-load); aproveita o PWA | quase zero; risco baixo |
| (b) Recurso do aparelho | câmera guiada, voz de orientação, nível/inclinação, temporizador | permissão do navegador pedida **no clique**, com consentimento; voz pela síntese nativa do navegador (sem custo). Qualquer biblioteca (ex.: detecção de pose) deve ser **embutida no projeto e auditada** (licença, peso, origem), nunca carregada de endereço externo | médio; verificar licença e peso antes de propor biblioteca |
| (c) Integração externa | escâner/medição 3D de terceiros | só por contrato, chave de API, aceite separado do cliente, contrato de operador (LGPD) | custo por uso e dependência; análise jurídica de envio de dado de saúde |
| (d) Aplicativo nativo | aplicativo de loja (Apple/Google) | **nunca silencioso**: o cliente baixa na loja oficial. O PWA já cobre "adicionar à tela inicial" | contas de desenvolvedor e revisão das lojas (valores a confirmar: Apple ~US$ 99/ano, Google ~US$ 25 uma vez); só se justifica por sensor que o navegador não dá (ex.: LiDAR) |

---

## 4. Arquitetura de extensões (registro por clínica, não por cliente)

Decisão recomendada: **não** existe "plugin instalado pelo paciente". O cliente toca um ícone, lê um cartão de
consentimento e habilita uma capacidade **já embutida**. A instalação/ativação propriamente dita acontece no nível
da clínica (e da equipe), por um registro versionado.

### 4.1 Manifesto versionado (um arquivo por extensão, validado no código)
Campos: `id`, `versão`, `nome`, `capacidades`, `permissões` (papéis autorizados), `dependências` (outras extensões),
`recursos do aparelho exigidos` (câmera, microfone, sensores), `tabelas próprias`, `finalidades de consentimento`,
`pontos de encaixe na tela`, `classe de custo` (zero, armazenamento, uso externo), `migrações` (identificadores).

Modelo mental já existente no projeto: `lib/avaliacoes-corporais` (uma fonte única que alimenta tela e servidor).

### 4.2 Tabelas novas (rascunho; só aditivas, nunca destrutivas)
| Tabela | Finalidade | Colunas principais |
|---|---|---|
| `tenant_extensions` | estado por clínica | `empresa_id`, `extension_id`, `versao`, `estado` (disponível, habilitada, suspensa, desinstalada), `habilitada_por`, `habilitada_em`, `config` (jsonb) |
| `client_consents` | consentimento granular por cliente | `client_id`, `empresa_id`, `finalidade`, `versao_texto`, `concedido_em`, `revogado_em`, `canal` |
| `body_photo_views` | quem viu cada foto | `foto_id`, `empresa_id`, `profissional_id` ou `client_id`, `visto_em`, `contexto` |
| `body_photo_series_context` | condições de cada série | `client_id`, `data`, `altura_cm_usada`, `origem_altura`, `peso_kg_usado`, `horario`, `orientacao_aparelho`, `checklist` (jsonb) |
| `body_photo_originals` | original preservado | `foto_id`, `storage_path_original`, `metadados_tecnicos` (jsonb), `sha256` |

`empresas.modulos_ativos` continua valendo por compatibilidade; a leitura nova consulta `tenant_extensions` primeiro.

### 4.3 Ciclo de vida
| Passo | Regra |
|---|---|
| Instalar (habilitar na clínica) | confere dependências e permissões, registra estado, semeia dados padrão. **Criação de tabela roda no deploy** (migração do projeto), nunca no clique do cliente |
| Desinstalar | suspende e esconde. Nunca apaga dado. Retenção e anonimização seguem política própria |
| Consentir (cliente) | cartão por finalidade, linguagem simples; sem aceite, o recurso não abre |
| Revogar | recurso fecha; dados antigos ficam guardados sem uso novo; fica registrado |
| Isolamento | todo acesso filtra por `empresa_id` vindo do acesso autenticado, nunca do navegador |
| Auditoria | habilitação, consentimento, revogação e cada visualização de foto |
| Versão | atualização de extensão com migração aditiva e transacional; falha = estado anterior preservado |

### 4.4 Pontos de encaixe reais (sem duplicar cadastro nem tela)
| Ponto | Arquivo | Para quê |
|---|---|---|
| Botão IMAGENS | `cockpit-cliente/ClientIdentity.tsx` | entrada única de fotos e medições |
| Modais | `FotosModal.tsx`, `AvaliacaoModal.tsx` | captura guiada, relatório, comparador novo |
| Abas da Área do Cliente | `pages/area.tsx` | medição informada pelo cliente |
| Catálogo de campos | `lib/avaliacoes-corporais` | novos campos e novas medições |
| Liga/desliga | `middleware/moduleGuard.ts` | base da chave por clínica |
| PWA | `manifest.webmanifest`, `sw.js` | instalação e abertura rápida |

---

## 5. Funcionalidades futuras (detalhamento)

### 5.1 Altura e peso
- Fonte da altura, nesta ordem: última antropometria da equipe, depois `ficha_clinica.altura_cm`, depois digitação.
- Toggle "usar altura do cadastro" mostra a origem. Série grava `altura_cm_usada` e `origem_altura`.
- Nunca reescrever histórico ao corrigir o cadastro.
- Peso usado na comparação idem (snapshot por série).

### 5.2 Medições periódicas
- Reaproveitar `EvolucaoMedicoes` (gráfico) e o catálogo.
- Cliente informa pelo portal com selo "informado pelo cliente"; separado do medido pela equipe; equipe pode "confirmar".
- Lembrete de nova série a cada 2 a 4 semanas pelo canal que o cliente já usa (Telegram/WhatsApp), com consentimento.

### 5.3 Captura guiada (câmera)
- Pose: manter 4 ângulos como padrão clínico; permitir perfil reduzido de 3 poses (decisão do Dr. Caio, seção 9).
- Silhueta sobreposta, instruções por voz (síntese nativa) e por texto (fonte única `lib/fotos-corpo.ts`).
- Temporizador de 10 segundos, aviso de inclinação do aparelho, lista de conferência (luz, fundo, roupa, distância).
- Permissão de câmera só no clique; permissão negada ou revogada nunca quebra a tela (cai no envio de arquivo).
- Qualquer verificação automática de enquadramento é aviso, nunca bloqueio nem conclusão clínica.

### 5.4 Comparação e relatório
- Já existe: lado a lado, cortina, transição, grade calibrada.
- Falta: comparação temporal contínua, marcação de pontos de medida e **relatório PDF clínico** (reutilizar o gerador de PDF
  existente), com aviso de que a imagem não é diagnóstico, fotos originais e condições de cada série.

### 5.5 Original e metadados
Ver decisão 1 (seção 9). Se aprovada a opção recomendada: original completo em armazenamento privado e
criptografado, cópia sem localização para exibição, metadados técnicos úteis em tabela própria.

### 5.6 Portal do cliente
- Cliente vê só as próprias fotos e medições; equipe vê por clínica e papel.
- Compartilhar com outro profissional: finalidade própria de consentimento e registro.

---

## 6. Provedores externos de medição/escaneamento 3D (opt-in, sob contrato)

**Aviso de honestidade:** o que está abaixo é conhecimento geral e **não foi verificado**. Nenhuma integração existe.
Nada deve ser prometido ao cliente antes de contrato, teste real e aprovação jurídica.

| Candidato | O que o mercado diz que é (confirmar) | Ponto crítico a verificar |
|---|---|---|
| 3DLOOK | medição corporal por fotos de celular (frente e lado), uso em moda e saúde; oferece SDK/API | preço por medição, precisão publicada, onde a imagem fica guardada, contrato de operador, uso em saúde |
| Styku | escâner corporal 3D com plataforma giratória, usado em academias e clínicas | exige hardware no local; custo do equipamento, integração por API ou exportação, suporte no Brasil |
| Outros (pesquisar: Fit3D, Prism Labs, Bodygee, Nettelo, Quantificare etc.) | soluções de escaneamento 3D ou medição por celular | existência atual do produto, API, país de operação, preço |

### 6.1 Perguntas obrigatórias a cada fornecedor
1. Existe API ou SDK documentado? Qual modelo de cobrança (por escaneamento, mensalidade, hardware)?
2. Onde ficam as imagens e os dados? Há cópia no exterior? Existe cláusula de operador sob a LGPD?
3. Quais dados saem do sistema (foto, altura, peso, nome)? Dá para enviar sem nome e com identificador próprio?
4. Qual a precisão publicada e existe estudo de validação (idealmente independente)?
5. Posso exportar e apagar os dados do cliente sob pedido? Em quanto tempo?
6. O fornecedor trata o resultado como produto de saúde regulado? Isso muda a nossa responsabilidade?
7. O que acontece se o fornecedor mudar preço, API ou encerrar? Plano de saída.
8. Há ambiente de teste sem cobrança? Condições do contrato (prazo, multa, reajuste)?

### 6.2 Mínimo nativo contra parceiro
| Critério | Mínimo nativo (foto 2D guiada + medidas) | Parceiro 3D |
|---|---|---|
| Esforço | médio, na base atual | baixo na tela; alto em contrato e integração |
| Custo | tempo de desenvolvimento e armazenamento | provável custo por uso/mensalidade (verificar) |
| Precisão | comparativa, sem pretensão de medida exata | depende do fornecedor; exigir validação |
| Dependência | nenhuma | alta |
| Risco regulatório | baixo se não prometer diagnóstico | maior; verificar enquadramento de software como produto de saúde |

Recomendação registrada: construir o mínimo nativo primeiro; parceiro só como piloto opcional depois de contrato,
estudo de precisão e aprovação jurídica.

---

## 7. LGPD — lista técnica (o texto jurídico precisa de advogado)
| Exigência | Como atender |
|---|---|
| Dado sensível de saúde | consentimento específico e destacado, por finalidade |
| Finalidades separadas | guardar fotos; equipe comparar; gerar relatório; compartilhar com outro profissional; enviar a parceiro externo |
| Armazenamento privado | já existe (`fotos-corpo/`, rota autenticada) |
| Acesso por clínica e papel | existe para fotos; aplicar permissões do manifesto |
| Registro de acesso | construir `body_photo_views` |
| Revogação e prazo de guarda | política e rotina próprias; nunca apagar sem ordem escrita |
| Transferência a terceiro/exterior | contrato de operador e aceite separado |
| Relatório de impacto (RIPD) | avaliar com assessoria jurídica antes de qualquer parceiro externo |

---

## 8. Sequência de checkpoints (cada um fecha em 98% antes do próximo)

| Etapa | Entrega | Prova (SMOKE, DADO, VISUAL, LOG) |
|---|---|---|
| 0 | decisões da seção 9 respondidas; spec próprio da etapa 1 | revisão do Dr. Caio |
| 1 | `client_consents` + `body_photo_views` + política de guarda | banco isolado + Playwright com dado fictício |
| 2 | fonte da altura + snapshot por série | altura vazia, do cadastro e digitada |
| 3 | manifesto + `tenant_extensions` (começando só com fotos e medições) | clínica A habilitada, clínica B bloqueada |
| 4 | captura guiada, voz e texto | celular simulado; permissão negada e revogada |
| 5 | medição informada pelo cliente + gráfico | selo de origem; separação equipe x cliente |
| 6 | relatório PDF clínico | PDF conferido página a página |
| 7 | piloto opcional de parceiro externo | somente com contrato e custo aprovados |

Todos os testes: dado fictício, sem cobrança, sem publicação, `vitest --maxWorkers=1`, Playwright com `--workers=1`.

## 9. Decisões pendentes do Dr. Caio (uma por vez)
1. **Metadados da foto original** — A (recomendada): original completo privado e criptografado + cópia sem localização + metadados técnicos úteis; B: manter como hoje (só cópia sem metadados); C: guardar tudo sem limpeza, inclusive localização.
2. **Poses** — 4 como padrão clínico com perfil reduzido de 3, ou só 3.
3. **Medições do cliente** — o cliente pode informar as próprias medidas (com selo de origem)?
4. **Parceiro externo** — pesquisar fornecedores agora (sem contratar) ou só depois da etapa 6?

## 10. Kaizen registrado
1. Recriar o teste automático permanente de fotos (hoje só há capturas de tela).
2. Guardar as condições de cada série (horário, altura, distância, orientação) para justificar a comparação.
3. Criar regra de retenção para fotos de clientes de teste removidos (hoje: 11 fotos do cliente 5298).

## 11. Fora de escopo até nova ordem
Publicar; cobrar; contratar parceiro; baixar bibliotecas; IA que altere imagem do corpo; aplicativo nativo; qualquer
envio real de dado de saúde a terceiro.
