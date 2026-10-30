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
Não apagar dados, não alterar motor de desmembramento/cálculo, não enviar mensagens em homologação, não assinar documento real, não prometer confiança ICP-Brasil a partir de certificado de teste autoassinado.
