# PAXTER Loop — Receita assinada, acesso por QR e modelo ativo

## 1. Objetivo e decisão

Fazer o PDF efetivamente armazenado e entregue pela emissão de prescrição usar o
modelo visual escolhido em **Designer do Receituário**, exibir a imagem de
assinatura cadastrada para o médico autenticado e incluir um código QR que abra
diretamente o mesmo PDF em um celular.

O QR não pede login. O acesso ao arquivo dura sete dias, segue o padrão já
escolhido para links seguros de documentos clínicos e não revela dados clínicos
por uma consulta separada.

O modelo controla somente a apresentação. Paciente, prescritor, clínica, itens,
posologia, dados regulatórios e estado da assinatura continuam vindo do banco e
da identidade clínica validada no servidor.

## 2. Constatações verificadas antes da construção

1. A tela **Designer do Receituário** salva hoje a configuração completa somente
   no armazenamento local do navegador.
2. O servidor possui a tabela de modelos `receituario_modelos`, mas o gerador de
   receita persistida usado por `/api/prescriptions/emit` chama
   `generateRecipePdf`, que não recebe o modelo do Designer.
3. Esse PDF é assinado depois da renderização; portanto, assinatura visual e QR
   precisam ser desenhados antes da assinatura criptográfica.
4. O cadastro do profissional já guarda `signatureUrl` em armazenamento privado.
5. O sistema já tem links seguros com validade de sete dias, mas eles são criados
   no reenvio, depois da emissão. Eles não podem ser colocados no PDF durante a
   geração sem adaptar o vínculo ao registro da receita.
6. O código QR legado de consulta usa token curto e retorna dados cadastrais;
   ele não abre o PDF emitido e não atende a este pedido.

## 3. Escopo desta construção

1. Sincronizar a configuração visual do Designer com o modelo ativo no servidor,
   preservando a configuração local existente quando ainda não houver versão
   salva no modelo.
2. Fazer a emissão persistida buscar essa configuração no servidor e aplicá-la
   ao PDF que será baixado no histórico e aberto pela rota autenticada.
3. Carregar a imagem de assinatura do cadastro do médico autenticado, sem aceitar
   caminho ou imagem enviados pelo navegador.
4. Mostrar no PDF o estado verdadeiro da assinatura digital, os dados do
   certificado usado e sua validade. Documento sem assinatura permanece
   explicitamente marcado como não assinado; nunca mostrar selo de assinatura
   nesse caso.
5. Gerar um QR diferente por receita, apontando para o próprio PDF, com token
   aleatório de alta entropia, validade de sete dias e armazenamento apenas do
   resumo criptográfico do token.
6. Atualizar a rota pública do QR para servir somente o PDF correspondente,
   conferindo validade, estado do registro e resumo criptográfico do arquivo.
7. Preservar o motor de desmembramento, a numeração regulatória, os controles de
   autorização e a ordem de emissão já existentes.

## 4. Fora do escopo

1. Não enviar receita por e-mail, WhatsApp, Telegram ou Google Drive.
2. Não publicar, implantar, mesclar ou gravar alterações no repositório remoto.
3. Não alterar receitas já emitidas nem os arquivos históricos existentes.
4. Não mudar regras de emissão de receita controlada, liberação clínica ou
   validade do certificado.
5. Não criar acesso público permanente ao conteúdo clínico.
6. Não usar assinatura manuscrita digitada, imagem enviada na requisição ou
   certificado atual para reescrever documentos antigos.

## 5. Fluxo esperado

```text
Designer do Receituário
  └─ salva modelo visual ativo no servidor

Emissão autenticada
  ├─ valida paciente, profissional, clínica e permissão
  ├─ lê o modelo visual ativo
  ├─ lê a rubrica do profissional autenticado no armazenamento privado
  ├─ cria token QR aleatório com validade de sete dias
  ├─ monta o PDF com dados clínicos e visuais
  ├─ inclui rubrica, QR e estado real do certificado
  ├─ assina o PDF por último, quando o certificado está válido
  └─ grava o PDF e o resumo do token no mesmo registro da receita

Leitura do QR no celular
  └─ confere token, validade e integridade, depois abre o PDF exato
```

## 6. Regras de segurança e integridade

1. O token QR terá pelo menos 256 bits aleatórios; somente seu resumo
   criptográfico será armazenado.
2. A resposta pública será igual para token inexistente, expirado ou revogado,
   evitando confirmar a existência de uma receita.
3. A resposta pública não terá cache e não permitirá listagem ou pesquisa de
   receitas.
4. O servidor verificará que os bytes servidos ainda correspondem ao resumo
   criptográfico gravado na emissão.
5. Nenhum dado de paciente será usado como token, parte da URL ou identificador
   público.
6. O PDF não será modificado depois da assinatura criptográfica.
7. Se a imagem de assinatura estiver cadastrada, mas não puder ser lida, a
   emissão falhará com mensagem clara, em vez de produzir silenciosamente um
   PDF sem a imagem solicitada.
8. Se não houver imagem cadastrada, não se inventará uma rubrica. A assinatura
   digital e o estado visual continuarão sendo informados com precisão.
9. Uma receita sem assinatura digital pode ter QR de abertura, mas o PDF deve
   informar claramente que o QR abre o documento e não valida uma assinatura
   digital inexistente.
10. Dados clínicos do modelo salvo não serão usados como fonte de verdade.
    Somente campos de apresentação serão aplicados ao PDF.

## 7. Falhas previstas e resposta obrigatória

| Condição | Resposta esperada |
|---|---|
| Modelo ativo ausente ou inválido | Interromper a emissão antes de gravar e informar erro claro |
| Configuração local antiga sem modelo no servidor | Migrar uma vez para o modelo ativo, sem substituir configuração já salva |
| Imagem de assinatura cadastrada indisponível | Interromper a emissão; não esconder a falha |
| Profissional autenticado sem rubrica cadastrada | Não inventar assinatura; exibir estado verdadeiro |
| Certificado vencido ou inválido | Preservar a regra vigente de emissão sem assinatura, com aviso explícito |
| Token expirado, inexistente ou revogado | Não servir o PDF nem revelar se a receita existe |
| PDF diferente do resumo criptográfico da emissão | Bloquear acesso pelo QR e registrar falha técnica |
| Erro ao salvar PDF, token ou modelo | Não declarar emissão concluída; preservar o rascunho conforme fluxo existente |
| QR sem base pública configurada | Não emitir um documento que alegue ter QR funcional |
| Mais conteúdo clínico que o modelo comporta | Impedir corte silencioso; testar quebra de página ou erro explícito |

## 8. Evidências para homologação

1. Testes automatizados com médico, paciente, clínica, certificado e rubrica
   sintéticos.
2. PDF assinado de teste comprova que assinatura visual, QR e modelo aparecem
   antes da assinatura criptográfica.
3. Validador de PDF confirma que a assinatura digital cobre o documento final.
4. QR válido abre o PDF correto sem autenticação; token expirado, alterado ou
   revogado não entrega arquivo.
5. Alterar dados do modelo muda a apresentação do PDF; alterar dados clínicos no
   modelo não substitui dados reais do atendimento.
6. Comparação visual entre preview do Designer e PDF de teste, em tamanho A4,
   sem corte de assinatura, certificado, QR, rodapé ou itens.
7. Reinício do servidor preserva o modelo visual e o acesso do QR dentro do
   prazo.
8. Nenhum envio externo, publicação, implantação ou alteração em produção.

## 9. Critério de conclusão

A construção só será considerada homologada depois de implementação, teste
integrado, evidência reproduzível, revisão independente sequencial e conferência
visual do PDF. Se a revisão independente não estiver disponível, o estado será
**BLOQUEADO PARA HOMOLOGAÇÃO**, não “concluído”.
