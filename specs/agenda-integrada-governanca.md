# Agenda integrada: cadastro, disponibilidade, Google e autorização

## Estado
EM ESPECIFICAÇÃO.
Este documento registra o estudo solicitado e não certifica a implementação.

## Objetivo
Integrar agendas Google e compromissos pessoais ao motor existente de disponibilidade, preservando a tela de marcação e impedindo alterações de regras sem autorização.

## Requisitos do responsável pelo projeto
1. Reutilizar a tela /agendar e o motor existente; não construir um agendador concorrente.
2. Preservar a liberação gradual por percentual de ocupação.
3. Secretaria pode operar marcações em vagas liberadas e registrar compromissos pessoais conforme concessão; não pode alterar expediente, percentual, duração, antecedência, destinos de espelhamento ou desbloquear horários sem aprovação do médico responsável técnico ou administrador autorizado da empresa.
4. Cada profissional tem agenda pessoal própria: pessoal do médico afeta somente seus recursos Local e Remoto; pessoal da enfermagem afeta somente seus respectivos recursos.
5. Títulos pessoais são privados por padrão; espelhos e respostas públicas recebem somente "Ocupado — compromisso pessoal", sem descrição, endereço, convidados ou contato.
6. Dia inteiro bloqueia o expediente cadastrado de cada recurso no dia, não cria expediente e não representa ocupação clínica de 24 horas.
7. Cadastro mantém cor e endereço reais, com confirmação, observação, origem, papel, proprietário e vínculo profissional/local/recurso explícitos.
8. Importação, sincronização e espelhamento nunca criam sessões clínicas por inferência.
9. Alteração de horário no Google não dispara aviso ao cliente automaticamente; registrar mudança pendente de conferência.
10. Cancelamento no Google preserva histórico no sistema e não apaga sessão.
11. Não importar histórico em massa, enviar mensagens, excluir eventos existentes ou alterar permissões externas como consequência automática deste estudo.

## Fontes verificadas
- Tela pública: artifacts/padcom/src/pages/agendar.tsx, rota /agendar.
- Parametrização: artifacts/padcom/src/pages/agenda/motor.tsx, rota /agenda/motor.
- Cálculo: artifacts/api-server/src/lib/agenda-motor.ts.
- Ocupação e gravação: artifacts/api-server/src/lib/agenda-booking.ts.
- Oferta concierge: artifacts/api-server/src/lib/agenda-concierge.ts.
- Regras e exposição: artifacts/api-server/src/routes/agenda.ts e scheduling.ts.
- Importação: artifacts/api-server/src/routes/locations-agenda-google.ts.

## Diagnóstico nesta revisão
- Parâmetros do banco consultado: blocos de 120 minutos, gatilho de 60%, antecedência de 24 horas; configuração atualmente global.
- O motor abre o primeiro bloco; cada seguinte depende do percentual do anterior, inclusive entre janelas separadas por intervalo.
- Execução sintética: 2/4 horários ocupados = 50%, próximo bloco fechado; 3/4 = 75%, próximo aberto; terceiro só abre após o segundo atingir o gatilho.
- Compromissos importados estão persistidos, mas não são consumidos por computeResourceSlots.
- Locais e recursos mantêm cores, modalidade e vínculo Google separadamente; alterar um não garante alinhamento do outro.
- Existem recursos com local antigo, sem local ou sem profissional; não reassociar por nome.
- As rotas de configuração de agenda usam moduleGuard, que habilita o módulo, mas não implementa a autorização administrativa específica solicitada.
- A oferta concierge tem alternativa baseada apenas nas janelas; ela precisa respeitar bloqueios reais mesmo quando a apresentação comercial continuar distinta.
- Reconsultar antes de inserir não garante exclusão mútua entre duas gravações simultâneas.

## Modelo proposto
Empresa -> profissional -> recurso de atendimento -> local/modalidade -> agenda Google.
Disponibilidade configurada + sessões + bloqueios + antecedência -> motor único -> vagas públicas -> gravação com revalidação.
Agenda pessoal -> compromisso original -> projeções de bloqueio nos recursos autorizados do mesmo titular.

### Capacidade e bloqueios
- Calcular sobreposição por intervalo [início,fim), incluindo duração inteira do atendimento; não comparar só hora inicial.
- Compromisso pessoal não aumenta o numerador de atendimentos ocupados.
- Trechos bloqueados saem da capacidade vendável; bloco sem capacidade é indisponível e não impede eternamente o próximo bloco utilizável.
- Dia inteiro é aplicado às janelas efetivas; término de evento de dia inteiro é exclusivo, como no Google.
- Repetições e exceções devem usar biblioteca de recorrência adequada, com horizonte limitado e fuso explícito; guardar RRULE sem expandir não comprova bloqueio.
- Sessões já marcadas que colidem geram pendência, nunca cancelamento automático.

### Governança
- Validar identidade ativa, empresa, vínculo administrativo ou responsabilidade técnica e escopo do recurso no servidor.
- Solicitações de exceção guardam antes/depois, justificativa, solicitante, aprovador, escopo e validade.
- Aprovação é vinculada à mudança exata; alteração posterior invalida a aprovação.
- Aprovar ou recusar não pode depender de um campo booleano enviado pelo navegador.
- Secretaria vê a regra e solicita mudança; autorização efetiva é verificada novamente na gravação.
- Se a secretaria tem acesso amplo à conta Google, a aplicação não consegue impedir edição direta lá; mudanças externas em disponibilidade devem entrar em conferência e permissões Google precisam ser avaliadas separadamente.

### Sincronização
- Vínculo determinístico por agenda e identificador do evento; não inferir cliente ou profissional pelo título.
- Leitura incremental paginada, marcador persistido, recuperação de marcador expirado e auditoria de execução.
- Espelho tem origem/titular/destino estáveis; nunca se transforma em novo original.
- Usar chave determinística e operação persistida para recuperar falha entre Google e banco, sem duplicar.
- Editar/cancelar original atualiza projeções; exclusão externa preserva registro histórico.
- Configuração de integração é separada da disponibilidade comercial; cor não altera autorização ou oferta.

## Execução em sequência
1. Conferir vínculos reais e autoridade de configuração; corrigir isolamento e concorrência impeditivos.
2. Integrar bloqueios ao motor, oferta concierge, marcação e remarcação.
3. Implementar leitura incremental Google e conferência de mudanças.
4. Implementar espelhos privados por titular e registro de execução recuperável.
5. Consolidar cadastro e controles: switches de privacidade, dia inteiro, espelhamento, leitura e aprovação; estados pendente/erro/ativo separados.
6. Revisar independentemente e executar testes antes de homologar.

## Falhas previstas
| Falha | Gravidade | Barreira | Recuperação e teste |
|---|---|---|---|
| Compromisso visível, vaga ainda oferecida | Crítica | Motor único usado por todos os consumidores | Testar oferta e gravação no mesmo intervalo |
| Secretaria altera porcentagem por chamada direta | Crítica | Autorização no servidor | Secretaria, empresa errada e aprovação vencida devem falhar |
| Título sensível exposto | Alta | Projeção neutra e contrato público sem detalhes | Verificar respostas, espelhos, notificações e registros |
| Bloqueio libera bloco como se fosse consulta | Alta | Capacidade vendável separada da ocupação clínica | Bloqueio parcial, total e intervalo de almoço |
| Gravações simultâneas | Crítica | Reserva transacional e revalidação | Uma vaga, dois pedidos concorrentes, um sucesso |
| Google indisponível ou resposta perdida | Alta | Operação persistida e estado incerto explícito | Reiniciar entre efeito externo e confirmação |
| Espelhamento recursivo | Alta | Identidade de origem e destino | Reprocessar o mesmo evento repetidamente |
| Série recorrente com exceção | Alta | Expansão delimitada e identidade da ocorrência | Mover/cancelar só uma ocorrência |
| Alteração externa burla autorização | Alta | Conferência e permissões externas explícitas | Secretária muda evento no Google sem aprovar expediente |

## Critérios para homologação
- Explicitar quais parâmetros são globais e quais pertencem à empresa/recurso; nenhuma troca silenciosa de política.
- Requisitos completos na interface e no servidor.
- Cor, endereço e vínculos sobrevivem a recarregamento sem divergência entre local e recurso.
- Jornada completa de liberação, bloqueio pessoal, aprovação, reserva e remarcação com dados sintéticos.
- Negativas por pessoa, empresa, recurso e aprovação; repetição, concorrência, falhas e recuperação.
- Capturas de desktop e celular da interface autenticada com acesso de teste autorizado, sem fabricar sessão do titular.
- Evidência de resposta, persistência e registros de execução; revisão independente sequencial.
- Nenhum envio clínico, cobrança, exclusão ou importação maciça em testes.

## Linhas vermelhas
Preservar tela /agendar, regras comerciais já autorizadas, clientes, histórico, motor de orçamento e desmembramento.
Somente migrações aditivas; nenhuma exclusão de dados ou eventos por este documento.
