# Formatação de CPF na tela de acesso

## Estado

Bloqueado para homologação até revisão independente.

## Problema observado

Na tela de acesso, a pessoa pode digitar o Cadastro de Pessoas Físicas sem que os
separadores apareçam automaticamente. O campo também aceita e-mail e o nome de
usuário legado, portanto não pode aplicar máscara indiscriminadamente.

## Objetivo e limite

- Aplicar a apresentação `000.000.000-00` enquanto uma entrada exclusivamente
  numérica tiver até onze dígitos.
- Preservar e-mail, identificador alfanumérico e nome de usuário numérico com mais
  de onze dígitos sem alteração.
- Enviar ao servidor os onze dígitos do CPF, sem pontuação.
- Preservar o login antigo numérico: a pontuação é apenas visual e não altera o
  identificador enviado.
- Não alterar autenticação, senha, cadastro de contas ou acesso de colaboradores.

## Falhas previstas e resposta

| Risco | Tratamento |
|---|---|
| A máscara altera um nome de usuário numérico | Remover pontuação somente quando o campo estiver no formato completo de CPF; manter identificadores longos intactos. |
| A pessoa informa e-mail | Não aplicar máscara quando houver letras ou `@`. |
| CPF incompleto | Formatar progressivamente e deixar a validação de credenciais no servidor. |
| Cadastro não possui acesso | Não criar acesso público nesta alteração; fluxo de solicitação de acesso exige decisão de produto e autorização administrativa. |

## Critérios de aceite

1. Digitar ou colar onze dígitos mostra automaticamente `000.000.000-00`.
2. E-mail e identificador alfanumérico permanecem intactos.
3. A requisição de autenticação recebe os dígitos sem pontuação para CPF.
4. O layout atual navy e ouro, no celular e no computador, permanece preservado.
5. Nenhuma conta é criada ou autorizada por este ajuste.

## Evidência necessária

- Teste de ponta a ponta com rota de autenticação simulada, sem dados reais.
- Compilação do artefato PADCOM.
- Captura da tela de acesso no celular e no computador.
- Revisão independente antes de marcar como homologado.

## Evidência obtida nesta execução

- O teste de ponta a ponta passou para formatação, preservação de e-mail e envio dos
  onze dígitos ao servidor.
- A captura da tela móvel mostrou a máscara `000.000.000-00` com o tema navy e ouro.
- A compilação do PADCOM terminou com sucesso; avisos já existentes em outra tela
  não foram alterados.
- A revisão independente ainda não foi realizada; portanto, a entrega não está
  homologada pelo PAXTER Loop.
