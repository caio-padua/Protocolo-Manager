# Especificação — Quatro formas no cadastro do profissional

## Objetivo

Exibir as quatro formas de atendimento do profissional e manter o controle de disponibilidade no mesmo bloco do formulário.

## Requisitos

1. O cadastro mostra, nesta ordem, os interruptores **Sede**, **Local externo**, **Online** e **Home Care**.
2. O valor existente `presencial` continua sendo salvo e passa a ser apresentado como **Sede**.
3. O valor `externo` representa **Local externo** e deve ser salvo em `serviceTypes`, sem migração ou alteração de banco.
4. Valores legados equivalentes a sede e local externo devem ser lidos como suas formas atuais.
5. Valores desconhecidos já gravados continuam preservados; a lista nunca pode ficar sem nenhuma forma selecionada.
6. O interruptor atual **Ativo — disponível para agenda** / **Inativo — não aparece na agenda** permanece imediatamente junto das formas, com o mesmo comportamento.
7. A grade deve exibir uma coluna no celular, duas em telas intermediárias e quatro em telas largas, usando os controles 3D já existentes.

## Falhas previstas

| Risco | Proteção | Evidência exigida |
|---|---|---|
| Profissional legado deixar de aparecer como atendendo na sede | Manter `clinic` e `presencial` como valores legados de `presencial` | Teste unitário de leitura e gravação |
| `Local externo` aparecer, mas não ser salvo ou reabrir desligado | Gravar `externo` na lista de formas e testar o envio do formulário | Teste de tela com resposta sintética |
| Valores desconhecidos serem apagados ou a lista ficar vazia | Preservar desconhecidos e impedir desligar a última forma | Testes unitários |
| Controle de disponibilidade se separar das formas | Mantê-lo no mesmo bloco, logo abaixo dos quatro interruptores | Teste visual e acessível da tela |
| Opções cortarem em celular | Usar grade responsiva sem rolagem horizontal | Capturas em celular e desktop |

## Definição de pronto

1. Testes unitários cobrem as quatro formas, compatibilidade legada, preservação de desconhecidos e seleção mínima.
2. Teste de navegador confirma quatro interruptores, gravação de `externo` e permanência do controle de disponibilidade no mesmo bloco.
3. Capturas mostram o formulário em celular e desktop, com quatro opções visíveis e sem corte.
4. Compilação do artefato conclui sem erro atribuível a esta alteração.
5. Revisão independente sequencial não encontra lacuna impeditiva.

## Linhas vermelhas

1. Não alterar dados existentes, contratos de banco, rotas de servidor ou migrações.
2. Não mudar a semântica do campo `active`: ele indica se o profissional está disponível para aparecer na agenda; não ativa ou desativa a empresa.
3. Não modificar as formas cadastradas na Agenda Configuração nem as regras de vínculo entre profissional e agenda.
