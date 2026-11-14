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

### Bloqueio encontrado na retomada de 14/11/2026

O código distinguia o ambiente da recarga, mas não o ambiente da carteira que recebia o crédito.
Consequentemente, confirmar uma recarga de teste podia financiar consumo real da mesma empresa.
Esta conclusão vem da leitura do código; não é uma afirmação de que ocorreu em uma conta externa.

A correção exige:

1. Separar por empresa **e ambiente** carteira, extrato, tarifas, franquia, avisos, custos e eventos pendentes.
2. Derivar o ambiente da aplicação no servidor; o navegador não escolhe ambiente nem empresa.
3. Impedir que a retomada de um ambiente reprocesse a fila de outro.
4. Preservar registros antigos; se houver recargas de teste já confirmadas sem separação, bloquear a migração
   para conferência, em vez de reclassificar ou apagar dinheiro silenciosamente.
5. Provar isolamento com a mesma empresa e a mesma chave de evento nos dois ambientes, incluindo
   confirmação concorrente, estorno e leitura da carteira.

Até essas provas, o ciclo de cobrança permanece não homologado.

A revisão encontrou também exposição de custos internos na resposta de carteira e ausência de validação
do papel de proprietário nas rotas administrativas (a flag da instância não representa uma pessoa
autenticada). A correção deve exigir sessão e proprietário antes da guarda de instância, devolver apenas
os campos públicos da carteira e provar recusa a visitante e profissional comum.
Como as credenciais Asaas e os metadados do cofre são globais nesta versão, suas rotas
também exigem o proprietário da plataforma; ser colaborador de uma clínica não concede essa autoridade.

## Evidências da rodada de 14/11/2026

Esta rodada não homologa a demanda completa e não realizou cobrança ou envio real.

| Verificação | Resultado e limite |
|---|---|
| Carteiras, catálogo, migração e separação do cliente Asaas | Cinco arquivos passaram com 59 testes; a suíte de carteira foi ampliada depois e terminou com 28 testes aprovados. |
| Migração parcial | Coluna adicionada manualmente não comprova conciliação; legado com teste confirmado sem marcador transacional bloqueia e preserva o saldo. |
| Recuperação | Falha sintética depois de creditar foi recuperada pela mesma confirmação; nova reentrega não repetiu crédito nem débito. |
| Permissões | Visitante recebe 401; colaborador comum recebe 403 na administração e nas seis operações globais de credenciais; proprietário permanece autorizado. |
| Telegram | 219 testes em treze arquivos foram verificados; dois testes inicialmente falharam por fixtures sem a nova origem e passaram após correção das fixtures, sem afrouxar a guarda. |
| Bibliotecas e servidor | Verificação de tipos e compilação aprovadas. |
| Aplicação visual | Compilação aprovada; verificação global de tipos ainda acusa 35 erros fora dos arquivos alterados. |
| Revisão independente | Aprovou a unidade de separação, recuperação e autorização após correções; não certificou a demanda completa. |
| Aplicação em execução | Servidor e worker reiniciados; worker permaneceu no perfil restrito de repasse, sem ativação do motor completo de lembretes. |
| Tela autenticada | Dúvidas e Orientações abriu com sessão operacional real, apenas leitura; zero mutações e zero envios. Captura em `generated-artifacts/comunicacao-autenticada.png`. |
| Conteúdo clínico observado | A tela mostrou 72 rascunhos e zero orientações aprovadas; nenhuma aprovação foi feita. |
| Administração comercial | Captura sem sessão confirma recusa de acesso e marca PaxMed; não houve navegação autenticada que executasse o cadastro inicial de propostas comerciais ainda sem fonte confirmada. |
| Asaas configurado | Rotas reais de metadados, com sessão proprietária, responderam 200: chave e segredo de confirmação de produção configurados, mas não verificados; chave e segredo próprios do sandbox ausentes. |
| Rotação Telegram | Metadado autenticado informa token configurado, validade não verificada e rotação pendente; não foi feita troca no provedor. |
| Banco da aplicação | Consulta somente de leitura confirmou que `cat_contratos` e `msg_carteira` ainda não existem; nenhuma instalação ou dado do piloto comercial foi presumido. |

As consultas autenticadas ao cofre descartaram os valores e máscaras; esta evidência registra somente presença, ambiente e estados.
Uma tentativa com o identificador operacional inicial foi recusada; a alternativa operacional já disponibilizada autenticou normalmente, sem redefinição de acesso.

### Bloqueios e pendências sem disfarçar testes isolados

- Os arquivos `PAXMED_ARQUITETURA_COBRANCA_CLINICAS_98` e `PAXMED_COBRANCA_CODIGO_E_ESPECIFICACAO_98` não foram localizados entre os documentos do projeto.
- Há propostas históricas divergentes; esta rodada não as transformou em preços aprovados nem substituiu edições existentes.
- Não existe credencial própria do sandbox configurada; não foi comprovada a existência de uma conta sandbox externa.
- A ligação comercial Asaas → confirmação de pagamento → carteira ainda não está integrada ao fluxo de recargas; recarga pendente não representa cobrança emitida.
- O recebimento de pagamento Asaas, sua notificação externa, a atualização do saldo e o consumo ainda não foram observados de ponta a ponta.
- Instituto Lemos foi identificado anteriormente como empresa 2; isso não certifica isolamento integral nem autoriza misturar clientes sintéticos com cadastros reais.
- Os dois clientes fictícios do piloto ainda não foram criados na aplicação; não houve alteração na clínica do piloto.
- A isenção histórica do Instituto continua com inicialização herdada baseada em identificador fixo; a exigência de política comercial inteiramente configurável ainda não está concluída.
- Lembrete individual foi testado com transporte simulado; não se declara entrega externa ao Telegram.
- Rotação no provedor, aprovação clínica dos rascunhos e documentos comerciais continuam necessários para as próximas provas.
