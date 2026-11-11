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
