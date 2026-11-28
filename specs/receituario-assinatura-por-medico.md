# Complemento — indicador e identidade na emissão de protocolo

## Objetivo

O indicador das telas do protocolo deve consultar o certificado pessoal do
médico autenticado, que é a mesma origem utilizada na emissão assinada, sem
confundi-lo com o certificado global histórico.

## Escopo e segurança

1. A tela de lançamento e a tela de detalhe identificam expressamente o
   certificado do médico autenticado; nenhuma delas altera o certificado
   guardado, o global ou os documentos históricos.
2. As três emissões assinadas do protocolo e da carta devem rejeitar ausência
   ou divergência entre o médico responsável pelo protocolo e o médico
   autenticado, antes de assinar ou entregar o documento.
3. As telas não devem prometer disponibilidade de assinatura se o médico
   selecionado for diferente ou ainda não estiver definido.
4. O estado do certificado deve ser reconsultado quando a sessão muda;
   falha de consulta não pode parecer certificado válido.
5. Permanecem em uso as verificações existentes de identidade, clínica,
   validade e titularidade do certificado. Não enviar nem alterar dados
   externos para testar.

## Falhas previstas e evidências necessárias

| Falha | Impacto | Barreira e teste |
|---|---|---|
| Certificado global antigo exibido como do médico | Aviso incorreto | Conferir origem e validade na tela autenticada. |
| Médico do protocolo diferente do médico que assina | Autoria incorreta | Recusar antes da geração, com teste de identidade divergente e ausente. |
| Troca de sessão deixa certificado anterior visível | Informação enganosa | Reconsultar após troca; testar atraso e erro da consulta. |
| Certificado vencido ou consulta indisponível | Sinal verde falso | Preservar estados reais e testar recusas. |

Pronto exige testes aplicáveis, revisão independente e conferência visual.
O certificado do sistema e as fichas de administração fora dessas telas não
são migrados neste ajuste. Não implica conclusão dos agendamentos.

## Evidências em 08/11/2026

1. Revisão independente inicial identificou três falhas; as correções foram
   revisadas novamente, sem riscos bloqueantes de autoria identificados.
2. Os testes de interface com respostas sintéticas cobriram certificado
   pessoal, médico diferente, troca de sessão, falha de identificação e
   autenticação nas três ações do protocolo.
3. Testes de integração verificaram as quatro rotas com médico responsável
   ausente ou divergente, sem geração de documentos nem entregas externas.
4. Nas telas autenticadas de detalhe e lançamento, o certificado pessoal foi
   exibido como válido até 15/01/2027 para o médico responsável.
5. Prévia real autorizada do documento do protocolo retornou arquivo assinado.
   O verificador local considerou a assinatura criptograficamente válida, mas
   não reconheceu a cadeia da autoridade certificadora como confiável.
   Isso não comprova validação da cadeia de confiança por um serviço oficial.
6. O documento de protocolo verificado possui onze páginas; ele não é a receita
   de duas páginas nem comprova envio ao Drive ou agendamento.
7. A conferência global de tipos da interface ainda possui erros preexistentes
   fora dos componentes alterados. As fichas de administração e o motor de
   agendamento não foram homologados por esta correção.

# Homologação de assinatura de receitas

## Objetivo
Assinar somente receitas de paciente/clínica autorizados, com certificado pertencente ao médico autenticado.

## Requisitos
1. Resolver médico ativo, CRM/UF, paciente ativo e vínculo explícito com clínica antes de acessar certificado ou produzir assinatura.
2. Certificado A1 por profissional no armazenamento privado/cofre. Compatibilidade com certificado global somente se CPF do titular coincidir com o cadastro autenticado; nunca aceitar CPF declarado no pedido como prova.
3. Validar PFX, senha, chave privada correspondente, CPF e vigência. Ausência ou invalidez falha explicitamente, sem PDF não assinado.
4. Todos os geradores de receita exigem contexto de assinatura validado; nenhum caminho legado pode usar certificado global implicitamente.
5. Reabrir `/assinar-imagem-pdf` como emissão server-side: aceitar clientId e fórmulas, ignorar/rejeitar imagem livre, identidade, destinatário ou nome de arquivo fornecidos. Gerar layout no servidor e retornar bytes assinados sem envio implícito.
6. Vincular metadados assinados ao médico, paciente e clínica; consulta não deve atribuir o certificado global atual a documentos antigos.
7. Atualizar chamador visual com autenticação e contrato real. Rotas demo/teste e worker sem proveniência autenticada falham fechadas.
8. Testar autorização e assinatura CMS/ByteRange com certificado e pessoas sintéticas, incluindo adulteração; nenhuma mensagem, certificado ou documento real nos testes.

## Casos extremos
Certificado ausente, senha errada, CPF ausente/divergente, validade expirada/futura, chave incompatível, paciente de outra clínica, solicitante não médico, imagem adulterada e chamada sem contexto.

## Pronto
Testes sintéticos aprovados, build/boot sem regressão e rota reaberta somente após validação criptográfica.

## Linhas vermelhas
Não apagar dados, não alterar motor de desmembramento/cálculo e não enviar
mensagens em homologação. Documento real só pode ser assinado para conferência
quando autorizado pelo responsável. Não prometer confiança da Infraestrutura de
Chaves Públicas Brasileira a partir de certificado de teste autoassinado.
