# Catálogo comercial, crédito e piloto em homologação

## Objetivo

Transformar a entrada existente de licenciado em administração persistida de propostas, planos, módulos,
serviços, tarifas, custos e contratos, preservando os fluxos atuais e isolando qualquer teste de cobrança,
mensageria ou clínica em homologação.

## Requisitos

1. O catálogo é persistido e editável; a proposta inicial é semeada uma única vez e nunca restaura nem
   sobrescreve alterações posteriores.
2. Alterações comerciais criam versões; contratos e eventos preservam o preço e a versão efetivamente usados.
3. A administração do CEO mostra catálogo, custos, cenários identificados como hipóteses, contratos e evidências.
4. A clínica autenticada só acessa seu contrato, saldo, tarifas aplicáveis, recargas e extrato; nunca custos
   internos, margem ou dados de outras empresas.
5. O saldo incluído é consumido antes do crédito comprado; recargas são explícitas, sem bônus e sem cobrança
   recorrente automática; o prontuário não é suspenso quando o saldo acaba.
6. A tarifa é cobrada apenas após evento válido; o filtro de abuso antecede cobrança; a chave idempotente
   impede débito repetido.
   Tarifas propostas ficam inativas até ativação explícita do CEO; abrir a administração não inicia cobrança.
7. O Asaas de sandbox usa somente chave e token próprios e não pode usar URL ou credencial de produção.
   Webhooks e recargas de homologação não alteram cobranças antigas ou carteiras de produção.
8. Instituto Lemos (empresa existente, identificador 2) não é duplicado nem alterado como clínica real.
   Qualquer piloto permanece rotulado como homologação e usa clientes sintéticos sem documento ou contato real.
9. A tela reutiliza `/licenciado`, preserva a navegação existente e segue o padrão visual Paxter 3D.
10. Testes de escrita, concorrência e isolamento usam PostgreSQL descartável e integrações externas simuladas.

## Impacto e dependências

- Produtores: entrada `/licenciado`, catálogo comercial, motor de crédito de mensageria e fluxo Asaas.
- Consumidores: CEO, clínica autenticada, extrato, recargas, eventos de uso, relatórios e auditoria.
- Fontes de verdade: empresa da sessão, cofre cifrado, preço versionado do catálogo e evento confirmado do
  provedor no ambiente correspondente.
- Persistência: tabelas comerciais e trilha de versões; carteira, extrato, crédito incluído e recargas.
- Efeitos externos: chamadas ao Asaas sandbox somente após credencial sandbox configurada; nenhum envio real
  de mensagem ou pagamento de produção.
- Limites: não apagar dados, não sobrescrever contratos, não reprocessar cobranças históricas, não criar
  paciente/cliente sintético em base compartilhada, não publicar.

## Falhas previstas e barreiras

| Gravidade | Falha | Barreira e recuperação | Evidência exigida |
|---|---|---|---|
| Crítica | Credencial de produção usada em sandbox ou vice-versa | Credenciais separadas, host validado, erro fechado antes da chamada | Testes unitários de combinação permitida e proibida |
| Crítica | Repetição de webhook ou concorrência credita duas vezes | Identificador de evento único, transação e trava de carteira | Teste concorrente em banco descartável |
| Crítica | Uma clínica lê dados de outra | Empresa derivada da sessão; rota de administração separada | Teste com duas clínicas e chamadas cruzadas |
| Alta | Semente substitui preço editado | Marcador atômico de aplicação única; inserções sem atualização | Editar, reiniciar, recarregar e comparar |
| Alta | Franquia e crédito comprado são ambos consumidos | Separar abatimento incluído do débito comprado | Teste com franquia parcial e saldo |
| Alta | Notificação de teste vai para cliente real | Notificações do sandbox desativadas; contatos sintéticos | Inspeção do payload e evidência de ambiente |
| Alta | Custo desconhecido aparece como margem real | Valores nulos explícitos; cenário separado | Resposta do relatório com itens não informados |
| Média | Releitura de credencial mostra valor | Nenhuma resposta ou log devolve credencial | Testes de rota e redator |
| Média | Valores sugeridos parecem preço aprovado ou integração ativa | Rótulos de proposta e disponibilidade por item | Captura visual e dados persistidos |

## Critérios de homologação

1. O servidor persiste e lê o catálogo de homologação sem sobrescrever edição após reinício.
2. A tela `/licenciado` carrega as cinco áreas pedidas e salva alterações com retorno visível após recarga.
3. Preço antigo permanece nos registros/eventos anteriores; preço novo entra somente em evento posterior.
4. Rotas protegidas rejeitam falta de autenticação; rotas da clínica não aceitam empresa escolhida no corpo.
5. Testes cobrem autenticação, isolamento, evento repetido, concorrência, saldo insuficiente e recuperação.
6. O sandbox Asaas fica explicitamente pendente até existir conta e credencial sandbox válidas.
7. Revisão independente e testes com evidência atual são concluídos antes de declarar HOMOLOGADO.
8. Capturas em computador e celular confirmam a tela de licenciado autenticada; nenhuma publicação é feita.

## Estado atual

Em construção. Evidências de ambientes externos, rotação do Telegram e conta Asaas sandbox são dependências
do titular e não podem ser simuladas.
