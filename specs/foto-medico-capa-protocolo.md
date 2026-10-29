# Foto do médico na capa do protocolo

## Objetivo

Permitir que o CEO troque, pela tela de Médico Responsável, a foto usada na capa dos próximos protocolos.

## Requisitos exatos

1. Exibir na rota `/configuracoes/medico` um painel para selecionar e enviar uma imagem JPEG.
2. Exigir autenticação de colaborador nas rotas de leitura e gravação da foto.
3. Rejeitar arquivo ausente, vazio, maior que 5 MB ou que não seja um JPEG decodificável.
4. Salvar a imagem validada de forma atômica como `artifacts/api-server/assets/dr-caio-photo.jpg`.
5. Mostrar a foto atual e atualizar o preview imediatamente após um envio bem-sucedido, sem recarregar a página.
6. Manter o gerador de protocolo lendo `dr-caio-photo.jpg`, de modo que o próximo documento use a nova foto.
7. Se o arquivo não existir, informar ausência na tela e preservar o fallback atual do gerador sem foto.
8. Mostrar estados claros de seleção, envio, sucesso e erro; funcionar em celular e desktop.

## Casos extremos

- Requisição sem arquivo.
- Arquivo vazio com tipo JPEG.
- Extensão ou MIME incorreto.
- Conteúdo corrompido disfarçado de JPEG.
- Falha de escrita no disco.
- Foto ainda não cadastrada.
- Nova seleção feita após um envio anterior.

## Definição de pronto

- A API devolve a foto atual quando ela existe e `404` quando está ausente.
- Um JPEG válido enviado pela interface substitui atomicamente o arquivo canônico.
- O preview muda imediatamente após o upload.
- A tela é conferida em larguras de celular e desktop.
- Build e validações focadas passam.
- Um revisor separado aprova todos os requisitos desta especificação sem pendências.

## Linhas vermelhas

- Não alterar o layout ou a lógica clínica do protocolo além da fonte da foto já existente.
- Não tornar a foto obrigatória para gerar o protocolo.
- Não criar exclusão da foto nesta tarefa.
- Não expor a foto por uma rota pública.