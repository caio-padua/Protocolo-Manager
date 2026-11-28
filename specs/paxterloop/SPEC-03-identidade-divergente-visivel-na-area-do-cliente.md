# SPEC 3 — Divergência de identidade visível na Área do Cliente

Estado: IMPLEMENTADO; testes automatizados e verificação visual executados. Revisão independente indisponível neste ambiente.

## Objetivo

Informar à pessoa que enviou um exame, na própria etapa de verificação, quais dados de identidade foram encontrados no documento e quais divergem do cadastro, sem liberar resultados clínicos nem retirar o documento da quarentena.

## Decisão de apresentação

1. Mostrar o primeiro nome e os dois componentes finais do sobrenome por extenso; abreviar os nomes intermediários com a inicial seguida de ponto.
2. Preservar partículas de sobrenome, como “de”, “da”, “do”, “das” e “dos”, junto aos componentes finais.
3. Essa formatação é somente visual; a comparação de identidade continua usando o nome original completo.
4. Mostrar somente os quatro primeiros dígitos do Cadastro de Pessoas Físicas (CPF); mascarar os demais dígitos.
5. Mostrar a data de nascimento completa, no formato brasileiro `DD/MM/AAAA`, quando ela tiver sido extraída e puder ser interpretada.
6. Para cada campo, mostrar o estado registrado pelo controle de identidade: correspondente, variação, parcial, divergente, ausente ou inválido.
7. Identificar os dados como leitura automática ainda não confirmada pela equipe; não apresentar a extração como verdade definitiva.

## Requisitos exatos

1. A Área do Cliente só recebe dados de identidade relativos ao cliente identificado pelo token autenticado do portal.
2. A consulta exige correspondência entre o cliente do token, o documento, o registro de verificação e a clínica do cadastro.
3. A resposta da rota inclui apenas um resumo de identidade previamente formatado e os estados dos campos.
4. A resposta nunca inclui `extracted_json` completo, resultados, analitos, intervalos, laboratório, texto de justificativa, trilha interna, modelos de inteligência artificial ou dados de outro documento.
5. O resumo aparece tanto no retorno imediato do envio quanto no cartão de “Envios recentes”, para documento em quarentena ou rejeitado por identidade, desde que exista verificação não confirmada.
6. O documento permanece em quarentena ou rejeitado, sem resultados na evolução; nenhuma ação do cliente altera essa decisão.
7. A tela oferece a ação “ENVIAR O EXAME CORRETO”, que leva ao formulário de upload existente; também orienta a falar com a clínica se o próprio cadastro estiver errado.
8. A tela não oferece botão para aprovar identidade, mover resultados ou apagar o documento.
9. O painel segue a linguagem visual existente: painel 3D, título Saliente e dados em campos Côncavos; adapta-se a celular e computador e mantém rótulos estáveis.

## Formatação determinística

| Campo | Regra |
|---|---|
| Nome | Primeiro nome + nomes intermediários abreviados + dois componentes finais do sobrenome por extenso; partículas do sobrenome permanecem junto a ele |
| CPF | Exibir no máximo os quatro primeiros dígitos; mascarar todo o restante |
| Nascimento | Data completa `DD/MM/AAAA`; sem data utilizável, mostrar “Não identificado no documento” |
| Estado | Traduzir somente o resultado salvo pelo controle de identidade; não inferir igualdade ou divergência na interface |

## Falhas previstas e barreiras

| Falha | Gravidade | Barreira e recuperação |
|---|---|---|
| Token de outro cliente tenta consultar o resumo | Crítica | Restringir por cliente, documento e clínica; retornar lista sem dados alheios |
| Documento não está em quarentena/rejeitado, ou não há verificação não confirmada | Alta | Não criar resumo; manter o comportamento atual |
| Extração contém JSON com dados clínicos | Crítica | Criar resposta permitida por campos; nunca serializar o objeto extraído inteiro |
| CPF extraído tem formato inesperado | Alta | Mascarar todos os caracteres além dos quatro primeiros dígitos disponíveis |
| Data não pode ser interpretada | Média | Não exibir valor bruto; mostrar “Não identificado no documento” |
| Nome é curto, possui partículas ou espaços irregulares | Média | Formatação pura com casos sintéticos; falha de formatação não altera a decisão de identidade |
| Consulta do resumo falha | Alta | Manter mensagem genérica e segura; não apresentar a quarentena como resolvida |
| Pessoa tenta liberar ou apagar o documento | Crítica | Não oferecer essa mutação; preservar o registro e a decisão humana existente |

## Testes e evidências necessárias

1. Testes puros com nomes sintéticos curtos, compostos, partículas e espaços repetidos.
2. Testes puros de CPF: onze dígitos, entrada com menos de quatro dígitos e entrada sem dígitos.
3. Testes de data: `DD/MM/AAAA`, data ISO, data ausente e data inválida.
4. Teste de integração em PostgreSQL descartável: quarentena e rejeição retornam somente o resumo permitido e mantêm zero resultados no portal.
5. Teste de isolamento: outro cliente e outra clínica não recebem nome, CPF parcial, nascimento, estado de campo ou motivo.
6. Teste de resposta: nenhum campo bruto, `extracted_json`, analito, laboratório, motivo interno ou trilha aparece no corpo da rota.
7. Captura da Área do Cliente em computador e celular, com o painel de conferência e o caminho para enviar o arquivo correto.
8. Conferir os registros e os logs do banco descartável; não consultar documentos reais, produção nem serviços externos.

## Definição de pronto

1. A divergência fica explícita na etapa de identidade, com nome formatado, CPF parcialmente mascarado, data completa quando legível e estado individual de cada campo.
2. A pessoa consegue iniciar o envio de um documento correto pelo formulário existente.
3. Nenhuma identidade é aprovada automaticamente, nenhum resultado clínico entra na evolução e nenhum registro é apagado.
4. Os testes isolados comprovam isolamento por cliente e clínica, ausência de vazamento do objeto extraído e persistência da quarentena.
5. Capturas demonstram legibilidade e funcionamento no computador e no celular.

## Linhas vermelhas

1. Não ler nem copiar documentos reais em testes.
2. Não liberar CPF completo nem outros campos extraídos além dos três campos de identidade definidos.
3. Não transmitir conteúdo clínico nem dados extraídos completos ao navegador.
4. Não afrouxar o controle de identidade, a autenticação do portal ou o isolamento por clínica.
5. Não executar testes de escrita na base real nem publicar a alteração sem autorização.
