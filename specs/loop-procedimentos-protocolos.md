# Demanda única: procedimentos, protocolos e agendas

## Objetivo

Concluir sequencialmente os pedidos desta conversa, com provas verificáveis e
sem apresentar como concluído o que não foi demonstrado.

## Sequência e critérios

1. **Catálogo e profissionais.** Seleção da apresentação exata, inclusive
   homônimos e produtos compostos; nome e dose separados; dose clínica
   confirmada sem volume ou concentração; vínculo automático por campo com a
   apresentação de origem, sem apagar valores clínicos já emitidos; categorias
   reais combináveis, inclusive três, e alternativas profissionais. Consultas
   não são categorias. Aplicação de substância: enfermagem; implante: médico e
   enfermagem; consulta e procedimento estético: médico. Permitir escolhas
   clínicas explícitas sem inventar profissionais ou agendas.
2. **Protocolos.** Integrar os procedimentos sem duplicar produtos ou quebrar
   protocolos existentes. Consulta sem produto ou dose. Distinguir dose
   prescrita de composição e concentração; preservar o cadastro da substância.
3. **Reservas e datas.** Classificar recursos por ocorrência; consulta exige
   médico, enfermagem exige enfermagem e implante exige ambos. Reservar todos os
   recursos necessários de forma transacional e respeitar as durações e a grade.
   Não presumir a ordem de consulta e aplicação na mesma visita. Confirmar que
   datas civis não mudam de dia em fusos diferentes.
4. **Agenda interna e Google.** Usar vínculos da clínica do cliente e os locais
   autorizados; exibir disponibilidade real, revalidar conflitos e exceções
   autorizadas, preservar compromissos e auditar. Sincronizar com identificação
   estável, sem duplicar, e informar falha ou resultado incerto. Não alterar a
   política pública de 24 horas nem permissões genericamente.
5. **Documentos e comunicação.** Preservar e testar separadamente validação,
   impressão e envio do RASP FAP, protocolo, carta e documentos pertinentes.
   Nome do procedimento e dose prescrita sem volume ou concentração; preservar
   tipografia, dados e documentos emitidos. Telegram e e-mail apenas para
   destinos de teste identificados; não enviar a pessoas reais.
6. **Isolamento entre clínicas.** Identidade, unidade e destino de documentos
   devem pertencer à clínica autorizada; sem valores fixos ou pasta compartilhada
   como alternativa silenciosa. Examinar a proteção das rotas do cockpit e
   RASP com e sem sessão, e com clínicas diferentes.
7. **Menus e funções existentes.** Preservar entradas e funções atuais, sem
   alterar o layout ou o Cockpit. Retificação expressa do médico: o Cockpit e
   toda mudança de layout estão fora desta demanda.

## Método e provas

Uma implementação por vez: desenhar, especificar, prever falhas, construir,
revisar independentemente, testar e registrar evidências. A autorização atual
abrange a sequência, mas não dispensa parar diante de uma decisão clínica ainda
não tomada, operação externa sem destino controlado ou risco de perda de dados.
Usar banco descartável e dados sintéticos para regressão e concorrência. Para
efeitos externos, distinguir simulação de prova real e não declarar entrega ao
Google sem verificar o evento verdadeiro. Registrar comando, resultado, versão,
permissões, persistência, erros e limitações; sem evidência não há homologação.

## Restrições

Não publicar; não enviar mensagens a pessoas reais; não destruir cadastros,
reservas ou eventos; não reiniciar serviço que regrave dados sem comprovar
uma inicialização segura. Preservar o menu. Alterações manuais e documentos já
emitidos não são sobrescritos silenciosamente. Não inventar doses, agenda,
profissionais, permissões nem sequenciamento clínico.

## Estado inicial

- O catálogo de produtos foi disponibilizado na tela e testado em ambiente
  isolado; a conferência visual autenticada real permanece pendente.
- Três categorias simultâneas e médicos alternativos foram testados em banco
  isolado; o cadastro não está integrado a protocolos nem agendas.
- A atualização automática dos campos importados ainda não existe.
- Os demais itens exigem confirmação do estado atual antes de execução; não
  presumir que estão corrigidos ou que estão quebrados.

## Situação da sincronização

A sincronização automática permanece desabilitada após revisão independente:

1. Detectar persistentemente uma dose que muda e retorna ao valor anterior.
2. Impedir que desvincular a origem contorne a conferência médica.
3. Detectar edições simultâneas e impedir que uma sobrescreva a outra.
4. Serializar duas substituições simultâneas da composição de um produto.

O quarto item foi corrigido na rota e testado em banco isolado. Os três
primeiros permanecem pendentes. Enquanto isso, leituras devolvem os valores
persistidos, a criação e a edição de vínculos são recusadas e a capacidade é
informada como indisponível. A nova versão do servidor não foi ativada no
ambiente real, porque ainda não há prova de uma inicialização sem escritas.
Clientes antigos que enviem uma dose sem confirmação poderão ter a gravação
recusada pelo servidor novo; a compatibilidade precisa de revisão.

## Retomada — revisão monotônica da dose

O identificador da apresentação é a origem; o valor prescrito e documentos
anteriores permanecem independentes. A revisão da dose deve ser um contador
persistido no banco, alterado na mesma transação de qualquer mudança de nome,
dose padrão ou componentes que influenciem a sugestão, inclusive alterações
feitas fora da tela. Componentes adquirem os bloqueios das apresentações na
ordem dos identificadores; alterações concorrentes que falhem não avançam a
revisão. A confirmação guarda a revisão observada, nunca apenas o texto.

| Falha | Consequência | Barreira e prova |
| --- | --- | --- |
| Dose A → B → A | Falsa aparência de revisão | Contador monotônico; teste com as três alterações. |
| Dois escritores simultâneos | Revisão perdida ou mistura | Bloqueio no banco; teste com transações concorrentes. |
| Excluir ou mover componente | Composição muda sem aviso | Contador das duas apresentações; teste de inserção, alteração e exclusão. |
| Origem ausente ou não migrada | Dose inventada ou função insegura | Falhar explicitamente; manter a ligação desativada até completar a integração. |
| Reinicialização no ambiente atual | Regravação de cadastro | Não executar migrações na inicialização; testes em banco descartável. |
| Troca ou retirada de origem | Revisão médica contornada | Impedir salvamento sem confronto transacional da revisão anterior e atual. |

O contador é uma infraestrutura, não comprova a integração nem autoriza retirar
o bloqueio de segurança existente. A migração deve ser aditiva e validada em
banco descartável antes de qualquer aplicação ao ambiente de desenvolvimento.

A conferência transacional bloqueia as apresentações anterior e nova antes de
ler as revisões. Se uma origem antiga mudou, foi removida ou foi substituída,
exige confirmação médica da revisão atual da origem antiga; a nova origem
também exige revisão e confirmação. A função de conferência deve ser chamada
dentro da mesma transação que salva o procedimento. A identidade médica tem de
ser validada pelo servidor, não aceita como declaração do navegador. Esta etapa
isolada não integra a tela nem libera o cadastro.

### Resultado da revisão independente

A primeira versão foi reprovada: a trava dos componentes era adquirida depois
da verificação de chave estrangeira, permitindo espera circular em movimentos
concorrentes; faltavam teste do caso e validação dos limites da revisão.
Corrigir a aquisição antes da alteração, testar movimentos opostos e manter
a função indisponível enquanto não houver integração transacional completa.
Os bloqueios das apresentações usam NO KEY UPDATE, compatível com a verificação
de chaves estrangeiras, e seguem a ordem dos identificadores. Um escritor direto
que bloqueie primeiro um componente ainda pode concorrer com a rota que bloqueia
primeiro a apresentação; se houver impasse, o banco deve abortar integralmente
uma transação. Esse cenário também precisa ser exercitado antes da ativação.
Na rota de componentes, uma transação abortada por impasse deve devolver
conflito com instrução para recarregar, e não erro de preenchimento. Repetir
automaticamente a gravação não é seguro, pois outra pessoa pode ter alterado a
composição. A migração deve recusar gatilho existente com definição inesperada
em vez de presumir que ele foi atualizado.
Por segurança, substituir componentes por uma lista idêntica ainda altera o
contador: isso pode exigir revisão desnecessária, mas não confirma dose alterada
sem conferência. A comparação semântica de listas fica pendente antes da ativação.

### Composição idêntica enviada novamente

A rota de edição compara, dentro da transação e após bloquear a apresentação,
todos os campos preservados e a ordem dos componentes. Se forem idênticos, não
apaga nem recria componentes; mantém seus identificadores e a revisão da dose.
Alteração do indicador de composto continua registrada, mesmo com lista igual.
Qualquer diferença, inclusive ordem, nome, unidade, observação ou vínculo,
conserva a substituição transacional existente. O bloqueio de revisão automática
permanece ativo: esta correção não libera a sincronização sozinha.

Provas em banco isolado: repetição sem alteração preserva identificadores e
revisão; alteração de um componente, da ordem e do indicador de composto é
registrada; sessões concorrentes não misturam componentes; falhas revertem
integralmente; autorização existente é preservada. Não alterar o banco de
desenvolvimento nem reiniciar o serviço com rotinas de escrita.

## Complemento de conferência do cadastro

O catálogo de substâncias apresentado na tela não representa procedimentos já
cadastrados. Não criar procedimentos em massa. Chamar o campo do cadastro de
“dose padrão”, distinguindo-o da prescrição individual que será feita no
protocolo. Quando um produto composto estiver selecionado, mostrar cada nome
de componente e sua dose e unidade de origem; valor ausente ou unidade não
interpretável aparece como não identificado. Não alterar o valor salvo nem
documentos já emitidos. Confirmar a exibição com dados sintéticos em navegador.

Cada necessidade profissional terá identidade própria: duas necessidades podem
ter a mesma categoria e local, exigindo duas pessoas diferentes. Alternativas
dentro de uma necessidade representam uma única pessoa. A escolha padrão não
será inventada. Esta mudança precisa persistência e teste no servidor e ainda
não está integrada. A revisão do fluxo de protocolo também deve tratar
consulta sem produto ou dose, captura de catálogo dentro da transação e
identificação da ocorrência pelo item, não pela substância.

Na edição do catálogo, permitir até três necessidades simultâneas, incluindo
duas da mesma categoria e local, com quantas alternativas autorizadas o
contrato já permite. Exigir que exista ao menos uma combinação de pessoas
distintas para todas as necessidades. Necessidades gravadas ainda não têm
identidade estável exposta ao protocolo; não considerá-las integradas à reserva.

### Identificação direta de apresentações

As duas listas exibem, sem abrir detalhes, o nome, dose total identificável,
apresentação, concentração e via informadas no cadastro, além do identificador.
Ausência ou conflito não vira valor presumido. A seleção preserva o identificador
e preenche somente a dose no campo, não concentração ou volume.

Dados legados no formato “quantidade / volume” só podem gerar uma sugestão
quando a apresentação for uma ampola única, o volume final estruturado coincidir
com o denominador e não houver informação conflitante de volume ou concentração.
Sem esses dados não se deduz o total. Valores dos componentes compostos permanecem
um único ato, identificados por nome e unidade. Revisão clínica permanece
obrigatória. A revisão monotônica precisa incluir os campos de apresentação
usados nesse cálculo, além da dose, nome e componentes.

A revisão independente encontrou risco de sugestão diante de informações
contraditórias. Para um composto com dose textual, os nomes, quantidades e
unidades devem corresponder a todos os componentes; caso contrário, não sugerir.
Se houver volume textual no composto, também deve coincidir com a apresentação
estruturada. Uma concentração legada cujo significado não possa ser validado
não pode servir de prova da dose. Alertas devem preservar os valores de origem.

O lançador antigo usa o cadastro de substâncias diretamente e a criação exige
identificador de substância e dose; não renomear o seletor para procedimentos
sem alterar o contrato, a persistência e os consumidores do protocolo.
Sua sugestão de dose não pode extrair o numerador de "dose / volume" quando
o volume total da apresentação não está comprovado. O preenchimento deve usar
as mesmas salvaguardas aplicadas ao cadastro de procedimentos. Filtragem por
procedimentos, categoria, preferidos e subtipos de implante permanece pendente
da integração real, com dados de classificação explicitamente cadastrados.
