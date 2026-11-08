# Protocolo, agendamento e emissão pelo motor existente

## Estado

BLOQUEADO para homologação integral; a regra única abaixo ainda não está
implementada. Há correções técnicas anteriores em desenvolvimento.

## Direção atual: regra única de aplicações injetáveis

O responsável esclareceu que o objetivo é reduzir visitas desnecessárias,
mas que frequências menores que sete dias podem exigir mais de uma visita na
semana. A limitação absoluta de uma visita semanal, registrada anteriormente
neste documento, está substituída por esse esclarecimento. A referência de
semana é segunda-feira a domingo, como na grade existente de RAS FAP.

O início, a quantidade, a dose e o intervalo de cada substância vêm do protocolo
real. Ocorrências prescritas em dias diferentes de uma mesma substância não
podem ser fundidas em uma aplicação. Aplicações que coincidirem no mesmo dia
podem compartilhar uma visita, desde que clinicamente compatíveis e com
disponibilidade. O responsável deseja autonomia para reunir aplicações, sem
solicitar aprovação a cada ajuste. Direção proposta: permitir ajustes automáticos
dentro de limites clínicos autorizados previamente, registrar a data original,
a data escolhida e o motivo, e não modificar intervalos silenciosamente.
O responsável escolheu uma margem máxima de quatro dias antes ou quatro dias
depois da data prevista para planejamento. Essa margem não define, por si só,
os limites clínicos do intervalo real entre aplicações consecutivas. Na ausência
de limites clínicos autorizados ou diante de conflito, apresentar o caso para
decisão; não confirmar uma mudança por presunção.

Para novas marcações, unificar os caminhos divergentes de geração de visitas
em uma política consolidada, capaz também de preservar frequências menores que
sete dias. A decisão de retirar a opção de datas exatas não autoriza perder sua
capacidade de respeitar inícios e intervalos. Uma visita deve ser vinculada ao recurso correto
e passar pelo motor existente de disponibilidade. O formulário e as
informações da agenda devem refletir as sessões e aplicações efetivamente
registradas, sem recalcular uma segunda agenda divergente.

Preservar a leitura de protocolos e sessões existentes, inclusive qualquer
registro com o modo exato, sem recalcular nem excluir histórico, sem remover
colunas do banco e sem modificar eventos anteriores do Google. A remoção de
regras redundantes exige primeiro identificar e adaptar seus consumidores e
testar a compatibilidade. A existência desta direção não significa que o
código atual já a cumpra.

O evento da clínica deve usar as aplicações da sessão e uma montagem
compartilhada em criação, sincronização e remarcação; mostrar aplicações da
visita e futuras conforme sua situação verdadeira. Reutilizar o formato
existente, conferir duração e destino e atualizar o evento existente quando
possível. Nenhum evento externo deve ser modificado durante esta investigação.

### Direção visual em discussão

O responsável considera fundamentais o desenho da agenda interna e os dados
exibidos no campo de informações do Google Agenda. A referência candidata é
o formato detalhado do evento já existente: identificação, unidade, horário,
procedimentos, situação, lista de substâncias e legenda, endereço e navegação.
Na agenda interna, aproveitar o cartão existente com substâncias da sessão,
aplicações futuras, situação e confirmação individual, mantendo posições fixas.
Isto é direção de desenho, não implementação ou aprovação visual final.

Os caminhos atuais não entregam os mesmos dados: a marcação pelo motor pode
criar o evento sem substâncias; as sincronizações individuais e semanais
remontam dados separadamente; o gerador tem telefone padrão e tempos fixos
por tipo. Não assumir que esses valores correspondem ao local ou à duração
real. Situações, duração, contatos, calendário e endereço devem vir da fonte
correta, sem inventar dados, antes de afirmar equivalência entre telas.

### Análise da margem solicitada pelo responsável

O responsável solicitou avaliar até cinco dias antes ou depois para facilitar
a reunião das aplicações. Isto não estabelece, por si só, um intervalo mínimo
seguro entre doses nem homologa uma margem para qualquer substância.
Após a comparação, escolheu quatro dias para cada lado como teto de planejamento.

Experimento sintético isolado: frequências de 7, 15, 21, 10 e 40 dias; primeira
aplicação preservada; dia semanal fixo e disponível; horizonte do dia zero ao
dia 84, inclusive; demais aplicações movidas à visita semanal mais próxima
dentro da margem ou mantidas no dia previsto. Não foram usados dados reais,
indisponibilidade, duração, interações ou restrições clínicas.

| Margem em dias | Visitas com início comum | Média em 2.401 variações de início |
|---|---:|---:|
| 0 | 23 | 29,437 |
| 1 | 20 | 24,921 |
| 2 | 17 | 20,405 |
| 3 | 13 | 15,761 |
| 4 | 13 | 15,761 |
| 5 | 13 | 15,761 |

Nesta estratégia de dia semanal fixo, cinco não supera três porque cada data
tem uma visita a no máximo três dias; primeiras aplicações permanecem fixas.
Se uma visita não estiver disponível, quatro ou cinco podem alcançar outra
visita que três não alcançariam. Isso não demonstra viabilidade clínica.
No exemplo de doses previstas nos dias 15 e 30, deslocá-las para 20 e 25
respeita cinco dias de margem, mas deixa apenas cinco dias entre aplicações:
o intervalo entre doses consecutivas exige uma regra clínica independente.
Com a margem escolhida de quatro dias, deslocar as mesmas datas para os dias
19 e 26 também respeita a margem, mas deixa apenas sete dias entre aplicações.
Desvios acumulados, início individual, compatibilidade, histórico real de
aplicação e duração também precisam de verificação; não inferi-los da margem.

A grade semanal existente reúne quatro aplicações a cada dois dias em uma
única linha; o caminho de datas exatas gera quatro datas. Isto demonstra uma
divergência que deve ser corrigida antes de homologar a regra. Os testes
documentam essa diferença; não comprovam que o agendamento atual a corrige.
Ver `artifacts/api-server/src/tests/protocol-tolerance-analysis.test.ts`.

### Verificação necessária para esta direção

1. Inícios individuais, contagem e intervalos diferentes, inclusive dois em
   dois dias; virada de semana e visitas já existentes do mesmo cliente.
2. Dias e horários sem expediente, ocupados, fora da antecedência ou não
   liberados, inclusive indisponibilidade do Google.
3. Sessões, formulário e evento com as mesmas datas e substâncias; próximas
   aplicações não confirmáveis e aplicações realizadas ou não realizadas fiéis.
4. Criação, remarcação, repetição e concorrência sem duplicar ou apagar histórico;
   preservar o mesmo evento externo quando o calendário não mudar.
5. Permissões de médico, responsável técnico, administrador e secretaria;
   falhas de banco, de integração, de rede e de sessão expirada.
6. Testes sintéticos isolados e revisão independente antes de homologar;
   nenhuma operação clínica real ou entrega externa é prova por presunção.

## Objetivo

Executar a jornada autorizada de protocolo, sessões e RAS FAP pelos motores
existentes, preservando catálogo, identidade clínica e comprovantes externos.

## Requisitos

1. Doses, vias e preços vêm exclusivamente do catálogo e do motor comercial.
2. A tela de lançamento deve transmitir o horário escolhido à validação.
   O horário deve ser salvo no protocolo sugerido e recuperado na validação
   posterior pelo detalhe; a coluna nova é aditiva e preserva registros antigos.
3. A geração de sessões deve ser atômica e serializada por protocolo.
4. Repetir a validação não apaga sessões, aplicações nem referências externas.
5. Protocolo já validado com sessões retorna seu estado sem novo onboarding.
6. Estado incompatível ou sessões preexistentes em protocolo sugerido bloqueiam
   geração; não reconstruir dados automaticamente.
7. Para novas marcações, seguir a direção atual de regra única acima e
   preservar a leitura dos protocolos anteriores. Não alterar cálculo de
   orçamento nem motor de desmembramento. Cada item conserva sua data inicial.
8. Conferir a identidade na jornada autenticada antes de qualquer operação real.
9. RAS FAP significa Formulário de Auditoria de Procedimentos; usar o gerador
   existente, sem fabricar arquivo ou comprovação de assinatura.
10. Confirmar a pasta solicitada no Drive; não confundir com pasta compartilhada
    fixa nem enviar e-mail ou iniciar cadernos jurídicos como efeito oculto.
11. Não registrar aplicação retroativa por inferência: data inicial precisa ser
    confirmada porque o horário originalmente solicitado já passou.
12. Operação clínica real e testes de regressão são separados; regressão usa
    dados sintéticos e integrações simuladas, sem acessar prontuários reais.

## Unidades sequenciais do mesmo fluxo

| Unidade | Dependência | Evidência necessária |
|---|---|---|
| Horário e integridade da validação | Contrato, tela, transação | Contrato, repetição, concorrência, rollback |
| Conferência da operação real | Data, cliente, médico, local autenticados | Protocolo e sessões persistidos |
| Emissão e entrega | Protocolo validado, certificado, destino | Documento e assinatura verificados, arquivo no Drive |

## Impacto

Produtor: tela de novo protocolo.
Consumidores: validação, detalhe, onboarding, RAS, agenda e exportação.
Persistência: protocolos, sessões, aplicações.
Integrações: onboarding permanece fora da transação e somente após primeira
geração; emissão não é usada como teste.

## Falhas previstas

| Falha | Gravidade | Barreira / recuperação | Verificação |
|---|---|---|---|
| Horário ignorado | Alta | Parâmetro validado no contrato | Escolha dez horas persiste dez horas |
| Revalidação destrutiva | Crítica | Sem exclusões; retorno sem efeitos | Sessões existentes intactas |
| Duas validações concorrentes | Alta | Bloqueio de linha na transação | Uma geração e um onboarding |
| Falha durante inserção | Crítica | Reversão integral da transação | Sem protocolo parcialmente validado |
| Estado cancelado/completo | Alta | Recusa antes de inserir | Nenhuma alteração |
| Sessão expirada / clínica errada | Crítica | Autenticação e autorização existentes | Recusa sem efeitos |
| Resposta perdida após envio | Alta | Não revalidar para reenviar | Conferência humana do envio |
| Consolidação altera dia individual | Alta | Política atual preservada e explicitada | Não prometer intervalos exatos por substância |
| Documento sem certificado | Crítica | Não declarar assinatura sem prova | Verificação criptográfica do arquivo final |
| Destino errado | Crítica | Conferir pasta antes da emissão | Identificador e arquivo remoto confirmados |

## Definição de pronto

Revisão independente sequencial, testes pertinentes aprovados, operação real
autenticada concluída, datas e horário conferidos após persistência, documento
e assinatura verificados e arquivo existente na pasta solicitada.
Compilação, simulação e testes isolados não substituem essas provas.

## Descobertas verificadas

- A tela mantém horário escolhido, mas não o envia à validação.
- A validação usava nove horas fixas e apagava as sessões anteriores.
- O motor existente consolida por semana; intervalos individuais não equivalem
  necessariamente a visitas em cada data individual.
- Requisição sem sessão de colaborador recebeu 401; não contornar a autenticação.
- Revisão independente detectou perda do horário no lançamento normal; a
  correção inclui persistência no protocolo, migração aditiva e leitura no lock.
- O mapa do PADUA BRAIN mantém agendamento como capacidade ainda a extrair;
  não existe ali contrato destilado substituindo o motor deste repositório.

## Linhas vermelhas

Não excluir dados, não forjar sessão ou certificado, não copiar dados pessoais
para testes, não cobrar, não convidar clientes no Google e não alterar os
motores comerciais. Preservar os registros dos protocolos existentes ao
substituir a lógica de novas marcações pela regra única.

## Registro histórico: proposta de datas separadas substituída

Esta seção registra interpretações anteriores, não regras vigentes nem
autorização para criar sessões. O responsável esclareceu que frequências
menores que sete dias podem exigir mais de uma visita na mesma semana.

Em 08/11/2026 o responsável confirmou início da substância semanal na
segunda-feira, 09/11/2026, às dez horas, e três aplicações da segunda substância
em sábados alternados. A proposta anterior usava 14/11/2026 como início.
Isto substitui a indicação anterior de quinze dias por quatorze dias.
São oito visitas distintas; a consolidação semanal não pode antecipar o sábado.

O responsável informou depois que o expediente de enfermagem nos sábados
alternados começa em 21/11/2026. A série anteriormente proposta de 14/11,
28/11 e 12/12 fica fora desse expediente. A escolha das datas para a segunda
substância está bloqueada aguardando decisão; não criar a operação real.

O modo exato deve aparecer no formulário e no resumo, persistir no protocolo
e alcançar agenda, exportação e RAS FAP.
O RAS deve projetar as sessões persistidas, não recalcular uma agenda semanal.
O modo semanal legado conserva a grade existente.

## Evidências em 08/11/2026

Data inicial informada pelo responsável: 09/11/2026, às dez horas.
Nenhum protocolo, sessão clínica ou documento real foi criado nesta etapa.

| Verificação | Obtido | Limite |
|---|---|---|
| Cinco arquivos de testes de protocolo | 63 testes aprovados | Não equivalem à operação real |
| PostgreSQL descartável separado, porta local 55439 | Três testes aprovados | Integrações externas e identidade simuladas |
| Concorrência com bloqueio de linha e atraso por gatilho | Uma geração e um onboarding | Dados exclusivamente sintéticos |
| Falha por gatilho ao inserir aplicações | Sessões revertidas e status preservado | Sem uso de prontuário real |
| Horário salvo e recuperado na validação posterior | Dez horas persistidas nas sessões | Teste isolado |
| Conferência de tipos das bibliotecas | Aprovada | Aplicações têm erros preexistentes |
| Compilação e inicialização da interface de programação | Aprovadas | Avisos preexistentes de configuração |
| Saúde via proxy | 200 | Não comprova jornada autenticada |
| Validação real sem sessão | 401 | Não há sessão utilizável pelo agente |
| Captura da tela de lançamento | Renderiza; informa login para certificado | Estado autenticado não verificado |
| Drive | Pasta exata localizada em leitura | Nenhum arquivo entregue |

Comando dos testes:
`PAXTER_ISOLATED_PG=1 pnpm --filter @workspace/api-server exec vitest run src/tests/protocol-validation-postgres.test.ts src/tests/protocol-validation-integrity.test.ts src/tests/protocol-drive-email-isolation.test.ts src/tests/protocol-no-email-slack-alert.test.ts src/tests/protocol-email-slack-alert.test.ts`

O comando foi executado com um cluster PostgreSQL exclusivo criado em diretório
temporário, banco `paxter_isolated_protocols`, sem sobrescrever DATABASE_URL,
e desligado após a execução.

Revisão independente apontou perda de horário no lançamento normal e insuficiência
da fila simulada para provar concorrência; foram acrescentados persistência no
protocolo, nova conferência de autorização após o bloqueio e testes com PostgreSQL
isolado real.
As correções posteriores não receberam um novo aceite independente.

Hashes SHA-256 dos arquivos da execução final:

| Arquivo | Hash |
|---|---|
| routes/protocols.ts | 54697d1eb964ba1bdc3b378721e32ca4b2cac53f4bb53fb551bcb3be0fd34134 |
| tests/protocol-validation-integrity.test.ts | 47d63249ab23f06441f50dd174d03297029effbf88df6c9a33a8275584ac39c2 |
| tests/protocol-validation-postgres.test.ts | 4206aa2ad95c5ef487177ccfd1e0b9ab6ac48592812a209d44934c2d8777d586 |
| pages/protocols/new.tsx | aaa8f524512a931d8969a41d86c5ff5646294de6c3b7c72baab32966378f4cc4 |

## Impeditivos restantes

1. A política de consolidação semanal existente pode deslocar a aplicação
   prescrita a cada quinze dias; não declarar fidelidade de intervalos exatos.
2. Operação real exige sessão autenticada do profissional; não forjar credencial.
3. Emissão, assinatura e entrega na pasta escolhida ainda não foram executadas
   nem verificadas.
4. Homologação da jornada exige revisão e evidências finais, não apenas os testes acima.

## Complemento: reserva efetiva de aplicações planejadas

Estado: BLOQUEADO. A autenticação profissional foi comprovada no ambiente de
desenvolvimento, mas isso não corrige a falta de reserva. Um protocolo sugerido
não equivale a compromisso agendado. O fluxo atual de validação não deve ser
considerado prova de uma vaga.

### Etapa preparatória: planejamento com datas e vagas fornecidas

Estender o planejamento de datas existente para aceitar, explicitamente, as
datas consultadas no motor de disponibilidade e a quantidade de aplicações
que cada vaga comporta. Esta etapa calcula um plano; não reserva, valida,
envia, nem altera protocolo ou agenda. Não usar o resultado para afirmar que
houve agendamento.

Cada ocorrência mantém substância, dose, número, data nominal e data proposta.
A primeira data nunca é antecipada ao início cadastrado. Cada data fica no
máximo quatro dias antes ou depois da nominal. Entre ocorrências consecutivas
da mesma substância, o mínimo é o intervalo cadastrado menos quatro dias;
para intervalos de um a quatro dias o mínimo é o próprio intervalo.
A capacidade de cada vaga é explícita; uma vaga ausente não é livre presumida.
Quando há alternativas, preferir agrupar as aplicações no mesmo dia, em
seguida diminuir visitas e deslocamentos das datas nominais, com ordenação
estável. Uma busca limitada que não encontra plano deve informar falha, nunca
afirmar que nenhum plano possível existe. Não rotular a busca limitada como
otimização global.

Frequências inferiores a sete dias exigem identificação da necessidade de
confirmar a rotina de múltiplas visitas. Dados e horários preferidos só entram
quando fornecidos pelo cadastro; nunca pressupor confirmação do cliente.
Reservar efetivamente e sincronizar só depois da integração transacional,
da conferência de recursos e participação médica e da revisão independente.

Riscos: antecipar a primeira dose; aproximar doses consecutivas ao deslocar
duas datas em sentidos opostos; perder ocorrência na consolidação; escolher
data indisponível; exceder capacidade; usar hora fictícia; truncar busca e
anunciar inexistência de plano. Testar também frequência de dois dias, mês e
ano novos, ausência de vagas, empates, mudança da ordem dos itens e duas
opções na mesma data. Nenhum dado clínico real é usado nesses testes.

A revisão independente identificou risco de poda de uma alternativa viável e
de consumo excessivo de recursos. Resolução: reduzir opções equivalentes sem
perder a melhor preferência, limitar as expansões e os sucessores, e sinalizar
explicitamente quando o limite da busca impedir uma conclusão. O resultado
permanece uma proposta não reservada que exige avaliação clínica,
compatibilidade, restrições prescritas e recursos verificados antes de uso.
Qualquer semana com duas ou mais visitas exige confirmação da rotina, não só
as semanas que tenham uma substância de frequência inferior a sete dias.
Uma consulta autorizada e somente de leitura das vagas disponíveis para o
protocolo solicitado atingiu o limite de busca. Ajustar o tamanho do feixe
conforme o número de opções e manter os melhores estados em memória limitada;
o cálculo continua sem garantia de ótimo global e falha de forma explícita
quando a limitação impedir uma conclusão.

Restrições por substância: o chamador pode informar dias da semana e uma lista
explícita de datas autorizadas; quando ambos são fornecidos, respeitar os dois.
Lista vazia significa nenhuma data autorizada, não ausência de restrição.
Quando houver data comprovada de aplicação anterior, usar o intervalo mínimo
também entre essa aplicação e a primeira ocorrência planejada. A ausência da
data não comprova ausência de histórico. Não supor a autorização clínica ou
o histórico pela mera presença de um parâmetro.

Verificar uma poda progressiva com solução existente, limites de busca e um
conjunto autorizado de sábados alternados, inclusive virada de ano. A origem
das restrições, a compatibilidade, a confirmação da rotina, o fuso do horário e
o vínculo dos recursos permanecem bloqueadores da integração com reservas.
Limitar o número total de datas informadas nas restrições e preparar os
conjuntos uma vez por substância, para não multiplicar o trabalho por
ocorrência. Os limites de expansão não são garantia de tempo de resposta.

### Requisitos e dependências

1. O mesmo fluxo de validação deve reservar o recurso de enfermagem correto
   pelo motor de disponibilidade existente e registrar as aplicações na mesma
   transação, com empresa, cliente, médico e protocolo verificados.
2. O plano deve reunir substâncias, preservar cada ocorrência e as restrições
   de data, intervalo e dia da semana expressamente definidas; se não houver
   solução, retornar o motivo sem criar sessões parciais.
3. Para frequências de pelo menos sete dias, buscar uma visita por semana;
   frequências menores podem exigir mais visitas e confirmação da rotina.
4. Os limites de tolerância autorizados devem ser uma entrada identificável do
   planejamento; nunca aumentar a margem ou supor via, dose ou necessidade de
   médico a partir de um campo de catálogo não definido.
5. O período reservado deve corresponder ao procedimento e aos recursos
   necessários. Não associar ao Google evento vazio, via diferente ou horário
   que não corresponda à sessão persistida.
6. Sincronizar apenas depois da reserva confirmada, usando o mecanismo
   existente que protege contra resultado externo incerto; informar cada
   falha sem repetir criação automaticamente.
7. A interface, o formulário e a agenda devem usar o mesmo plano persistido.
   Preservar leitura de registros antigos e não excluir histórico.

### Falhas adicionais a prevenir

| Falha | Gravidade | Barreira e evidência |
|---|---|---|
| Cadastro sem informação de participação médica | Alta | Não converter ausência em “não”; confirmar o procedimento e testar a recusa. |
| Duas reservas disputam o mesmo período | Alta | Trava por empresa e nova consulta da vaga dentro da transação; testar concorrência real em banco isolado. |
| Intervalo respeita datas previstas, mas não aplicações anteriores | Alta | Conferir cada intervalo consecutivo e cada ocorrência individual; testar casos de deslocamento oposto. |
| Calendário externo recebe evento sem substâncias ou via incorreta | Alta | Usar as aplicações persistidas e a sincronização existente; testar criação e falha de resposta. |
| Solicitação repetida cria reservas duplicadas | Alta | Serializar por protocolo e retornar as sessões existentes; testar repetição e resposta perdida. |
| Agenda pertencente a outra empresa ou profissional | Crítica | Conferir acesso clínico e recurso antes e após aguardar bloqueios; testar recusa. |

## Complemento: informação existente dos compromissos Google na agenda interna

Estado: descrição consultável e verificada; a jornada integral continua
BLOQUEADA. Esta etapa não homologa a criação de sessões nem a atualização
automática do estado clínico no Google.

1. Reutilizar a descrição já importada do Google, sem reconstruir dados do
   protocolo e sem modificar eventos no Google.
2. Abrir a descrição apenas ao selecionar o compromisso; informar que é uma
   cópia importada, sem interpretar seu texto como prova clínica.
3. Como eventos importados não possuem vínculo clínico validado, permitir a
   leitura integral somente ao proprietário da plataforma dentro da empresa
   selecionada. Não ampliar o acesso dos demais colaboradores nesta etapa.
4. Não enviar todas as descrições na lista; autorizar e buscar o compromisso
   selecionado na empresa autenticada. Não apresentar conteúdo anterior ao
   corte pela simples manipulação do identificador ou da data.
5. Não executar código ou carregar recursos externos contidos na descrição.
   Preservar quebras de linha e formatação textual segura da origem, incluindo
   negrito, e limitar a altura de visualização.
6. No caso de falha da consulta, informar erro; descrição inexistente é um
   estado distinto. Troca de acesso ou de compromisso não deve exibir o
   conteúdo anterior.
7. Testar separadamente autorização, isolamento de empresa, corte, recorrência,
   falhas e interação visual, sem eventos ou dados reais de terceiros.

Risco ainda aberto: criação direta e remarcação podem produzir descrição
incompleta ou incorreta; confirmação de aplicação não dispara atualização
automática protegida no Google. A ligação dessas operações exige a reserva e a
sincronização com proteção contra resposta incerta já descritas acima.

### Evidências desta etapa

1. Vinte e um testes de consulta, projeção e banco descartável passaram,
   inclusive isolamento entre empresas, local inativo e repetição excluída.
2. Três testes de interface com serviços e dados sintéticos passaram,
   incluindo recusa, falhas e tentativa de conteúdo ativo.
3. A abertura de compromisso real autorizado foi conferida na tela autenticada
   em computador e celular; a descrição existente e o negrito apareceram.
4. Revisão independente aprovou a consulta e a renderização restrita após
   duas correções; a checagem global de tipos ainda falha em outros arquivos.
5. Na captura do ambiente de testes, alguns símbolos gráficos da descrição
   antiga apareceram como quadrados. Isso não comprova o resultado em todos os
   computadores e impede declarar paridade visual perfeita com o Google.
6. O acesso integral à descrição importada está restrito ao proprietário;
   ampliação a outros perfis depende de vínculo e autorização clínica válidos.

## Complemento: ocorrência modificada de série importada

Uma ocorrência modificada de uma série é preservada como evento individual
para não duplicar a projeção, mas continua pertencendo à série no Google.
A tela não deve chamá-la de única. A leitura deve usar o identificador da
série conservado na fonte importada, sem criar nova ocorrência, modificar o
Google ou alterar a regra de geração e ocupação.
Testar evento individual, série, ocorrência modificada e ausência de fonte,
incluindo consulta real somente de leitura e isolamento por local.

Arquivos iCalendar importados também guardam a identificação de ocorrência:
classificar as linhas existentes como parte de série quando esse identificador
ou uma regra de repetição estiver presente. Isso não equivale a expandir
ocorrências futuras de séries importadas por arquivo: essa limitação
preexistente permanece aberta e não deve ser apresentada como resolvida.

Evidências: quarenta e dois testes de consulta, projeção, integração, leitura
de arquivos e banco descartável passaram; um teste de interface confirmou a
classificação recorrente. A comparação de quatro eventos reais autorizados
confirmou datas e horários no Google e no sistema; a tela autenticada confirmou
a classificação de uma ocorrência modificada. Revisão independente aprovou a
correção apenas nesse escopo, sem certificar todos os compromissos ou futuras
sincronizações.
