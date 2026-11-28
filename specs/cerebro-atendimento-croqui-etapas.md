# Cérebro de Atendimento PAXMED — croqui geral por etapas

Atualizado em 23/11/2026. Regra: cada etapa aproveita a anterior, sem apagar nada e sem reiniciar o que já foi concluído.

## Croqui

| Etapa | Objetivo | Estado | Depende de |
|---|---|---|---|
| 1 | Estabilizar e comprovar o atendimento por WhatsApp e Telegram, com aprendizado operacional local | EM EXECUÇÃO (parcial, ver auditoria) | nada |
| 2 | Mapa de conhecimento em três colunas (domínio > categoria > subcategoria > intenção) e telas de acompanhamento: Central do Cérebro, Aprendidas em uso, Monitor | PENDENTE | etapa 1 (dados e registros por atendimento) |
| 3 | Conhecimento global: privacidade, isolamento, autorização, licenças por clínica, aceite com versão e revogação, testes de reidentificação | BASE DO SERVIDOR PRONTA (tabelas, licença, limpeza, auditoria); telas e aceite versionado PENDENTES | etapas 1 e 2 |
| 4 | Medição de custos, experiência de implantação e evolução do produto | PENDENTE | etapas 1 a 3 |

Requisitos da solicitação anterior que seguem valendo (não perder): Central do Cérebro; Mapa de 3 colunas; seis grupos (Recepção e Institucional, Agenda, Documentos/Receitas/Exames, Financeiro e Planos, Pós-consulta, Triagem e Encaminhamento) com subcategorias e intenções editáveis; resposta com escopo, fonte, versão, estado e política de autonomia; migrações reversíveis; contribuição global separada de acesso; aceite com versão, responsável, finalidade e revogação; módulos e modos de IA por licença; respostas de endereço, horário e preço sempre da clínica de destino; testes de duas clínicas; layout em celular e computador.

## Etapa 1 — auditoria e escopo

| Requisito | Estado |
|---|---|
| Recepção, identificação da clínica e da conversa (WhatsApp e Telegram) | já existia |
| Telegram falho (pacote nativo ausente no worker) | corrigido |
| Agrupar mensagens seguidas, intervalo configurável por clínica, persistente, sem duplicar | feito (intervalo por clínica, 0 desliga, máximo 12 s) |
| Ignorar mensagens próprias e eventos duplicados | já existia |
| Regras e textos da clínica primeiro; IA só escolhe intenção de lista fechada | feito |
| Negação ("não quero remarcar, só quero o endereço") | feito |
| Endereço da fonte vigente da clínica, nunca guardado como texto fixo | feito; sem cadastro encaminha à equipe |
| Entender intenção x executar ação (identidade, autorização, confirmação) | já existia; não alterado |
| Fonte revogada com resposta editada | corrigido e testado |
| Aprendizado imediato de perguntas operacionais com política de autonomia | PENDENTE (decisão de escopo abaixo) |
| Registro por atendimento: origem, intenção, uso de IA, resultado, status de envio | parcial |
| Teste real nos aparelhos de Dayana e Carlúcia | PENDENTE, depende das participantes |

### Pendência de desenho: aprendizado imediato
A regra "aprender e usar na próxima pergunta, sem aprovação" exige definir, por clínica, quais categorias operacionais têm autonomia e quais campos da clínica podem fundamentar a resposta (hoje: endereço). Valores e horários devem ser lidos da fonte local no momento da resposta. Enquanto isso não for configurado, perguntas inéditas ficam registradas como pendentes e nada é respondido por texto inventado.

## Cenários para Dayana e Carlúcia (aparelhos próprios, uma pessoa por vez, sem disparo em massa)

| N | Mensagem enviada pela participante | Esperado |
|---|---|---|
| 1 | "oi" | apresentação ou menu |
| 2 | "qual o endereço da clínica?" | endereço do cadastro da clínica |
| 3 | "não quero remarcar, só quero o endereço" | endereço, sem iniciar agendamento |
| 4 | duas mensagens em menos de 4 s | uma única resposta |
| 5 | "quero falar com a equipe" | encaminhamento e pausa |
| 6 | "estou com dor no peito" | fluxo clínico de urgência, sem orientação automática |

Pré-condições: Dayana em modo automático (feito); Carlúcia em modo humano (aguarda ordem do Dr. Caio); webhook da Evolution aponta para desenvolvimento; nada publicado.
