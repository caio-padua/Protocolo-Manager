# Fotos de evolucao corporal (cliente envia, equipe compara)

Estado: EM CONSTRUCAO. Pedido do Dr. Caio em 17/11/2026.

## Finalidade
Medicina estetica, integrativa, emagrecimento e performance esportiva: o cliente envia pelo aplicativo
(Area do Cliente) quatro fotos padronizadas (frente, costas, perfil esquerdo, perfil direito), em datas
diferentes. A equipe ve a evolucao no Cockpit (botao IMAGENS) e compara datas.

## Modelo de dados
Tabela `client_body_photos` (nunca apaga; remover/substituir = preencher `deleted_at`; o arquivo fica guardado).

| Coluna | Significado |
|---|---|
| client_id, empresa_id | dono e clinica (empresa vem do cadastro do cliente, nunca do navegador) |
| taken_on | data da serie (AAAA-MM-DD, BRT), escolhida pelo cliente, nunca futura |
| angle | frente, costas, perfil_esquerdo, perfil_direito |
| storage_path | objeto PRIVADO (`fotos-corpo/<empresa>/<cliente>/<uuid>.jpg`), nunca servido por rota publica |
| source | cliente ou equipe (hoje so cliente) |
| consent_at | momento do aceite do cliente para guardar as fotos |
| deleted_at | substituida por outra do mesmo angulo e data |

Indice unico parcial (client_id, taken_on, angle) onde deleted_at e nulo.

## Rotas
| Quem | Rota | Efeito |
|---|---|---|
| Cliente (token do portal) | GET /area-paciente/fotos-corpo | series + orientacoes |
| Cliente | POST /area-paciente/fotos-corpo (multipart) | envia 1 foto (angulo + data + consentimento) |
| Cliente | GET /area-paciente/fotos-corpo/:id/arquivo | so a propria foto |
| Equipe (requireCollaborator) | GET /clients/:id/fotos-corpo | series da clinica do acesso |
| Equipe | GET /clients/:id/fotos-corpo/:fotoId/arquivo | imagem, so da clinica do acesso |

## Falhas previstas
| Falha | Tratamento |
|---|---|
| Cliente de outro cadastro (IDOR) | clientId vem so do token; arquivo so abre se client_id = token |
| Equipe de outra clinica | empresa_id do acesso precisa bater com o do cliente |
| Arquivo nao e imagem / truncado / enorme | servidor decodifica por inteiro (jpeg-js), recusa, regrava sem EXIF/GPS |
| Data futura, invalida ou sem consentimento | 400 |
| Duas fotos ao mesmo tempo no mesmo lugar | indice unico: a segunda recebe 409 |
| Falha ao gravar no banco apos gravar o arquivo | objeto orfao e removido (melhor esforco) |
| Substituir foto | a anterior fica com deleted_at (preservada) |

## Instrucoes (fonte unica: lib/fotos-corpo.ts)
Pesquisa em 17/11/2026: Legion Athletics, MacroFactor, BryksBuilt, FormSnap, GainFrame (guias de fotos de
progresso) e Aesthetic Surgery Journal Open Forum 2024 (PMC10954060, padrao de fotografia clinica).
Pontos em comum: mesmo local, fundo liso, luz de frente e nao de cima, mesma distancia e altura da
camera, mesmo horario (manha, em jejum), mesma roupa, pose relaxada sem encolher a barriga, corpo
inteiro (cabeca aos pes), girar o corpo todo nos perfis, cabelo preso, sem joias, sem maquiagem pesada.

## Ferramenta de comparacao (Cockpit, modal "Fotos de evolucao")
Linha do tempo por data (4 vagas por data, vaga vazia mostra "—"), escolha do angulo, escolha de 2 a 4
datas, modos: Lado a lado, Cortina (2 datas), Transicao (2 a 4 datas, barra + Reproduzir), grade de
referencia opcional (calibrada por altura do cliente e linhas de cabeca e pes).
A grade so e valida quando as fotos tem o mesmo enquadramento; a tela avisa.

## Fora do escopo desta entrega
Envio de foto pela equipe, desfoque do rosto, registro de quem visualizou, modelo de consentimento
juridico completo, grade e silhueta ao vivo na camera do celular.
