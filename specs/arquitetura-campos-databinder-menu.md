# Spec — Arquitetura de Campos, Data Binder e MENU (Motor de Encantamento)

Data: 25/06/2026. Autor: Dr. Replit Paxter (a mando do CEO Dr. Caio). Método: Paxter Loop.
Objetivo: deixar PRONTOS, antes de construir, (1) os campos de cada cadastro, (2) o data binder
(variáveis dinâmicas e de onde cada uma vem) e (3) a ENTRADA NO MENU de cada ferramenta — REGRA DE
OURO do CEO (lição do IHE Pawards: nunca criar ferramenta órfã, sem menu).

Glossário rápido:
- Data binder = "amarrador de dados": troca {{variavel}} no texto pelo dado real do cliente na hora do envio.
- Namespace = "gaveta" da Central de Conteúdo (separa um tipo de conteúdo de outro).
- jsonb = coluna de banco que guarda um objeto estruturado (vários campos juntos) em um só campo.
- Slug/chave = identificador curto e único de um registro (ex.: `pos_marcacao_padrao`).

---

## 1. Fonte única dos campos do CLIENTE (tabela `clients`)

Estes são os campos REAIS hoje (lib/db/src/schema/clients.ts). São a fonte de verdade do data binder.

| Campo no banco | Significado | Sempre preenchido? |
|---|---|---|
| name | Nome COMPLETO (não há "primeiro nome" separado) | Sim |
| cpf | CPF | Não (opcional) |
| email | E-mail | Não |
| phone | Telefone/WhatsApp | Não |
| birthDate | Data de nascimento (texto) | Não |
| address | Endereço (TEXTO ÚNICO, não decomposto em cidade/UF) | Não |
| pais | País (default BRASIL) | Sim |
| instagram | @ do Instagram | Não |
| comoConheceu | Origem do cliente | Não |
| codigoSemantico | Código interno | Não |
| fichaClinica | Ficha clínica (jsonb) | Parcial |

Decisão de arquitetura: NÃO criar coluna nova de "primeiro nome". A variável {{primeiro_nome}} é
CALCULADA de `name` (primeira palavra). Se o nome estiver vazio, fallback neutro (ver tabela 2).

---

## 2. Catálogo do DATA BINDER (variáveis disponíveis e origem)

Toda variável tem ORIGEM declarada. "Pronta agora" = sai direto de `clients`. "Depende de contexto"
= precisa do agendamento/exame/clínica daquele envio (vem por parâmetro, não do cadastro do cliente).

| Variável | Origem | De onde vem | Fallback se vazio |
|---|---|---|---|
| {{primeiro_nome}} | Cliente (calculada) | 1ª palavra de `name` | "você" |
| {{nome_completo}} | Cliente | `name` | "você" |
| {{cpf}} | Cliente | `cpf` | (omitir frase) |
| {{email}} | Cliente | `email` | (omitir) |
| {{telefone}} | Cliente | `phone` | (omitir) |
| {{data_nascimento}} | Cliente | `birthDate` formatado dd/mm/aaaa | (omitir) |
| {{instagram}} | Cliente | `instagram` | (omitir) |
| {{data_consulta}} | Contexto | agendamento do envio | (omitir frase) |
| {{horario}} | Contexto | agendamento do envio | (omitir) |
| {{tipo_procedimento}} | Contexto | IV/IM/Implante do agendamento | "seu procedimento" |
| {{profissional_designado}} | Contexto | profissional do agendamento | "nossa equipe" |
| {{nome_clinica}} | Clínica | tabela locations / config | "a clínica" |
| {{endereco_clinica}} | Clínica | tabela locations | (omitir) |
| {{lista_exames}} | Contexto (M3) | exames solicitados | (omitir) |
| {{preparo_exames}} | Conteúdo (M5) | gaveta preparo_textos | texto genérico |

Regra de ouro do binder (já exigida na spec M5): NUNCA renderizar "{{...}}" cru ao cliente. Variável
sem dado → fallback neutro. Na EDIÇÃO, a tela avisa quais variáveis o roteiro usa e o que cada uma puxa.

Campo NÃO disponível hoje: {{cidade}}/{{uf}} — `address` é texto único, não decomposto. Se um conteúdo
precisar de cidade, isso é dívida técnica a resolver (decompor endereço) — registrar antes de usar.

---

## 3. Campos de cada GAVETA da Central de Conteúdo (Módulo 5)

Persistência (alinhada à spec M5 aprovada): tabela ÚNICA NOVA `content_entries`, sem tocar tabelas
existentes. A tela "Central de Conteúdo" (que já existe) ganha 4 gavetas novas, além das seções de
texto/vídeo que já tem hoje (essas continuam em `site_content`).

Colunas comuns de `content_entries`:

| Coluna | Tipo | Papel |
|---|---|---|
| id | serial | chave primária |
| namespace | text | gaveta (video_templates / preparo_textos / questionarios / cardapios) |
| chave | text | slug único POR namespace |
| title | text | nome legível do registro |
| payload | jsonb | os campos específicos da gaveta (abaixo) |
| ativo | boolean | false = some do uso, mantém histórico |
| sortOrder | integer | ordem de exibição |
| atualizadoEm | timestamp | último a salvar vence |

Payload por gaveta:

| Gaveta | Campos do payload (jsonb) |
|---|---|
| video_templates | tipo (pos_marcacao/pre_consulta/pos_consulta), heygenTemplateId, elevenlabsVoiceId, idiomaVoz, roteiro (texto c/ {{}}), variaveisUsadas[], variavelParaCampo (objeto {variavel: origem}, ex.: {"primeiro_nome":"clients.name[0]"}) |
| preparo_textos | tipoExame, corpo (texto c/ {{}}), canalSugerido (email/whatsapp/ambos) |
| questionarios | contexto, perguntas[] {enunciado, tipoResposta (texto/sim_nao/escala/multipla), opcoes[]?, obrigatoria} |
| cardapios | descricao, itens[] {nome, categoria, restricoes[]?}, vigencia? |

As chaves HEYGEN_API_KEY / ELEVENLABS_API_KEY NÃO entram aqui — moram no cofre de segredos. A gaveta
video_templates só guarda o template_id/voice_id (referência), nunca a chave.

Mapa variável→campo (persistido): cada template guarda no payload o objeto `variavelParaCampo`, que liga
cada {{variavel}} do roteiro à sua ORIGEM do catálogo (tabela 2). Assim o cadastro carrega o mapeamento
(não só a lista de variáveis), atendendo às specs M5 e M2 — e a tela mostra ao CEO o que cada variável puxa.

---

## 4. Mapa de MENU por módulo (REGRA DE OURO — toda ferramenta tem entrada)

Menu atual (sidebar, Layout.tsx), nível 1: Dashboard, Clientes, Protocolos, Orçamentos, Agenda,
Motor de Agenda, RAS, Estoque, Financeiro, Substâncias, Catálogos, Cadastros (grupo), Prescritor de
Exames, Mega Anamnese, Revisão de Anamneses, Prescrição, Farmácias, SNCR. Grupo "Cadastros" tem:
Equipe, Clínicas, Agendas Google, Exames & Blocos, Listas, Textos & Vídeos.

| Módulo / ferramenta | Entrada no MENU | Status |
|---|---|---|
| M5 — Central de Conteúdo (4 gavetas) | Cadastros → "Textos & Vídeos" (renomear p/ "Central de Conteúdo") | EXISTE; só expandir |
| M2 — roteiros de vídeo | Central de Conteúdo (gaveta video_templates) | via M5 |
| M2 — enviar vídeo ao cliente | Clientes → detalhe do cliente, ação/aba "Vídeos do Encantamento" | tela existente, aba nova |
| M3 — fila de validação de exames | NOVO item nível 1 "Validação de Exames" | CRIAR no menu |
| M3 — toggle liga/desliga + regra do alerta vermelho | Cadastros → nova subaba "Parâmetros do Motor" | CRIAR subaba |
| M4 — cardápio e questionário (cadastro) | Central de Conteúdo (gavetas cardapios/questionarios) | via M5 |
| M4 — experiência da consulta (execução) | dentro do fluxo /agendar + detalhe do cliente | tela existente |

Achado importante (mesmo erro do IHE): a rota `/cadastros/auditoria` EXISTE mas NÃO está no submenu
"Cadastros". É uma ferramenta órfã. Recomendação: adicionar "Auditoria" aos filhos de Cadastros.

---

## 4-A. Documentos médicos: Laudo com TIPOS + módulo de Governança (CEO 25/06/2026)

Decisão do CEO: o Laudo deixa de ser único e passa a ter TIPOS; cada tipo é liberado (ou não) pelo
próprio CEO por meio de um toggle. Para isso nasce um módulo novo de Governança no menu.

### 4-A.1 Tipos de laudo

| Tipo de laudo | Para que serve | Campos próprios além de HD+CID |
|---|---|---|
| Estado de Saúde | Apresentação geral do quadro clínico | Achados / exame · Conclusão |
| Afastamento — INSS | Fins previdenciários (Instituto Nacional do Seguro Social) | Dias de afastamento · Natureza (temporária/permanente) · Finalidade · Justificativa |
| Requisição de Insumo | Pedido de insumo de uso contínuo (ex.: insulina p/ diabetes) | Insumo solicitado · Quantidade/período · Justificativa clínica |

Regras da tela do Laudo:
- A prévia do PDF muda conforme o tipo (texto e campos), sempre derivada do estado (data-bound).
- Um tipo bloqueado pelo CEO aparece com cadeado e faixa âmbar; o botão "Assinar e gerar PDF" fica desabilitado.
- A disponibilidade de cada tipo vem da Governança (não é decidida dentro do Laudo).

### 4-A.2 Módulo de Governança ("Quem pode o quê")

| Item | Definição |
|---|---|
| O que é | Matriz Papel × Ferramenta com um toggle por célula; só o CEO altera |
| Papéis (colunas) | Médico 01 · Médico Validador (foco) · Enfermeira 01 · Enfermeira 02 · ADM/Financeiro |
| Ferramentas (linhas) | Documentos (Atestado, Encaminhamento, Laudo·3 tipos) · Clínico (Mesa, Protocolo, RAS, Anamnese) · Gestão (Financeiro, Estoque, Governança só-CEO) |
| Efeito | O que estiver desligado some para aquele papel na hora |
| Coerência com o Laudo | Laudo·Requisição de Insumo fica OFF para o Médico Validador (casa com o cadeado mostrado no Laudo) |

### 4-A.3 Entrada no MENU (regra de ouro) — nome a confirmar pelo CEO

| Opção de nome do menu | Observação |
|---|---|
| A (default) — "Governança" | Termo que o próprio CEO usou; nível 1 do menu, ícone de escudo |
| B — "Permissões e Acessos" | Mais literal para quem é leigo |
| C — "Painel do CEO" | Enfatiza que só o CEO mexe |

Mockups no Canvas: Laudo (3 tipos) atualizado na Entrega 36; Governança publicada como Entrega 37.

---

## 5. Princípio "SEM TRAVAS" (navegar todas as telas para validar layout)

Decisão do CEO (25/06/2026): nada de tela que bloqueia a navegação enquanto valido layout e intuitividade.

| Regra | Como aplicar |
|---|---|
| Conector dormente (sem chave HeyGen/ElevenLabs) | Tela ABRE em modo preview (ready:false), mostra exemplo, custo zero; nunca bloqueia |
| Dado dependente ausente (sem agendamento/exame) | Tela mostra estado de exemplo/placeholder, com aviso discreto; navegação segue |
| Validação obrigatória | Só no momento do ENVIO real, nunca para abrir/ver a tela |
| Menu | Todo módulo aparece no menu desde o mockup, mesmo "em construção" (rótulo claro) |

---

## 6. Definição de PRONTO desta spec

| Critério | Como conferir |
|---|---|
| Campos do cliente mapeados | Bate com clients.ts (tabela 1) |
| Data binder com origem e fallback | Tabela 2 sem variável "órfã" de origem |
| Gavetas com payload definido | Tabela 3 cobre M2 e M4 |
| Mapa variável→campo por template | Cada video_template tem `variavelParaCampo` preenchido (não só `variaveisUsadas[]`) |
| Todo módulo com entrada de menu | Tabela 4 sem ferramenta sem menu |
| Sem travas registrado | Seção 5 |
| Revisão architect | Zero pendência |

## RESUMO EM 1 LINHA
Campos do cliente, catálogo de variáveis (com origem/fallback), payload das 4 gavetas e o lugar de cada
ferramenta no menu estão definidos por escrito — pronto para construir, com a regra de ouro (tudo tem menu)
e o princípio "sem travas" gravados.
