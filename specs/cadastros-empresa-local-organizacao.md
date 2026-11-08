# Organização estável de empresas, locais e agendas

## Pedido e limites
- Preservar os menus Empresas e Locais de atendimento, todos os registros e o acesso à identidade documental.
- Identidade/logotipo pertencem à empresa; a agenda do local não hospeda outro editor de marca.
- Não transferir locais entre empresas, reclassificar agendas, alterar documentos emitidos, escrever no Google ou modificar motores clínicos.

## Diagnóstico confirmado
- Empresas usa a cidade sem normalização como chave, criando grupos diferentes para São Paulo e Sao Paulo, e ordena grupos pela quantidade.
- Locais filtra modalidade globalmente, sem um seletor explícito de empresa; uma sede é sempre a sede da empresa vinculada ao próprio local.
- Resumos removem modalidades com contagem zero e usam quebra de linha livre; as etiquetas mudam de posição.
- A seleção combina superfície bevel clara com texto branco herdado do botão principal.
- Diálogos usam apenas altura máxima; o tamanho efetivo varia com cada seção.
- O editor da identidade empresarial também está embutido na janela do local.

## Entrega
1. Agrupamento geográfico normalizado e ordenação determinística; Instituto Padua destacado no começo, sem ocultar os demais.
2. Empresa explicitamente selecionável na lista e no cadastro de novo local; edição sempre identifica a empresa proprietária, sem transferência implícita.
3. Rótulos visuais: Sede, Local externo, Online, Indefinido; valores internos e contratos preservados.
4. Seletores de modalidade verticais e uniformes, legenda na mesma linha à direita, um significado por linha.
5. Resumo de empresa recolhida com quatro posições fixas, inclusive contagem zero.
6. Seleção contrastante em tema claro e escuro, sem sede preta nem texto branco em botão claro; estados acessíveis por teclado.
7. Diálogos com altura estável, conteúdo rolável e ações fixas; trocar seção não redimensiona a janela.
8. Editor único de identidade no cadastro da empresa, preservado; local oferece navegação explícita à empresa correta, sem salvar por engano outro cadastro.
9. Proteger contra respostas atrasadas de endereço/Google ou troca de registro: dados nunca preenchem o local seguinte.

## Falhas previstas e evidência
- Descoberta impeditiva: atualização e exclusão de locais não exigiam autenticação na própria rota; ambas passam a validar sessão e empresa persistida, com concessão administrativa ou responsável técnico atual.
- Preservar identificação no clique/seleção e no envio; impedir gravação com outro registro em andamento.
- Navegação direta para identidade abre a empresa exata; mudanças pendentes não são descartadas silenciosamente.
- Testes sintéticos de alternância de empresa, sede/endereço, filtros, etiquetas fixas, altura entre seções, contraste, identidade preservada e navegação.
- Testar computador e celular; nenhuma gravação em registros reais durante a verificação.
- Captura real pública não comprova sessão autenticada; registrar separadamente a prova de interface com respostas sintéticas.

## Evidências da implementação
- Vinte e dois testes de interface passaram: computador de 1.365 pixels e celular de 390 pixels; filtros, posições, altura, vínculo, navegação de identidade, respostas atrasadas, alterações pendentes e empresa nos envios.
- Nove testes de autorização passaram: sessão ausente, empresa divergente, titular global no contexto errado, tentativa de troca pelo corpo, secretaria, concessão administrativa, responsável técnico e registro sem empresa.
- Requisição sem sessão a atualização de identificador sintético zero foi recusada com estado 401, sem gravação.
- As capturas de interface foram examinadas com dados sintéticos; a captura do endereço real mostrou corretamente o acesso ao sistema, sem sessão autenticada.
- Nenhum cadastro real foi salvo, excluído ou transferido durante a verificação; Google e identidade clínica emitida não foram alterados.
- Não há erros de tipos nos arquivos de cadastro e autorização alterados; a conferência global do repositório continua com falhas anteriores fora deste escopo.
- Implementado e testado; homologação na sessão autenticada real não executada.
