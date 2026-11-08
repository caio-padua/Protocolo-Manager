# Protocolo, agendamento e emissão pelo motor existente

## Estado

BLOQUEADO para homologação integral; correções técnicas aplicadas em desenvolvimento.

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
7. Preservar a consolidação semanal dos protocolos existentes e oferecer modo
   explícito de datas exatas, necessário para inícios em dias diferentes.
   Não alterar cálculo de orçamento nem motor de desmembramento.
   Cada item salva sua data inicial; o modo exato agrupa somente o mesmo dia.
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
motores comerciais ou o comportamento dos protocolos semanais existentes.

## Datas confirmadas pelo responsável

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
