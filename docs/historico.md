# Histórico de correções

Registro do que já quebrou e por quê. Serve para não refazer o caminho.

## Motor clínico

- **Ioimbina por omissão** — era prescrita quando a testosterona era
  desconhecida. Passou a exigir valor normal documentado (corte 340 ng/dL).
- **Ondas de choque largas demais** — 54 de 100 pacientes entravam no
  protocolo. Critério apertado para doença arterial e/ou diabetes: 5 no
  protocolo e 35 como oferta complementar. TEFI junto caiu de 41 para 17.
- **Protocolo mantido de linha diferente da queixa do dia** — 22 casos numa
  simulação de 299 visitas. Passou a rotular "(novo eixo)" quando muda a linha.
- **Retorno de preenchimento fantasma** — marcar retorno sem procedimento
  anterior no banco pedia medida "pós" inexistente. Trata como avaliação
  inicial.
- **Gauge sem escore** — linhas sem IIEF/PEDT deixavam `band` nulo e a tela de
  conduta quebrava ao ler `band.key`. Corrigido com fallback; era um erro real
  na versão anterior, detectado por 32 dos 100 pacientes sintéticos.

## Dados e persistência

- **Fila sumindo às 21h** — o filtro de "hoje" usava UTC. Passou a gravar e
  filtrar por `dataLocal`.
- **Registro da recepção lido como ciclo clínico** — fazia o app perder o
  esquema anterior e reperguntar tudo, justamente para quem passou pela
  recepção. `Store.ultimo()` agora ignora registros de recepção.
- **Protocolo anterior exigia escore junto** — ciclos de hipogonadismo e
  preenchimento não têm IIEF/PEDT e derrubavam o esquema. O protocolo basta.
- **Ciclo duplicado no encaminhamento de emagrecimento** — gravava a cada
  montagem da tela de resultado. Passou a gravar uma vez, com `opId` único.
- **Gravação falhando em silêncio** — `catch` vazio. Hoje existe confirmação
  visível, fila de reenvio e identificador de operação contra duplicata.

## Navegação e interface

- **Botão Próxima desaparecendo** — o palco tinha largura máxima de 620 px e,
  com o painel de 320 px ao lado, a barra de navegação não cabia. O palco
  passa a 1180 px quando há painel.
- **Módulo 1 devolvendo o médico para a fila** — telas de navegação estavam
  dentro do módulo Identificação. Passaram a `plumb: true`.
- **Voltar puxando pergunta do módulo anterior** — passou a andar só dentro do
  módulo; na primeira tela dele, volta ao panorama.
- **Painel mostrando o paciente anterior** — o novo Voltar não chamava a
  limpeza ao retornar à fila.
- **Faixa de retomada presa na tela** depois de trocar de paciente.
- **Seta de evolução em primeira medida** — mostrava "— → 19". Hoje mostra
  "19 · primeira medida".
- **Escores repetidos para quem já respondeu na recepção** — só pulava quando
  vinham as respostas item a item. Hoje existe caminho para aceitar os totais.
- **Aviso de ISRS em paciente de preenchimento** — passou a aparecer só em
  linha que envolve ejaculação.
- **Contraste baixo no painel escuro** e linguagem coloquial na fila
  ("usou certinho") — ambos corrigidos.
- **Limpeza de CSS órfão quebrou o layout** do kiosk e do financeiro; revertido
  a partir de backup, com as melhorias da mesma rodada preservadas à mão.

## Sobre os testes

A suíte nasceu depois de o médico encontrar erros que os testes não pegavam.
Cada ampliação veio de um caso real:

- 100 pacientes sintéticos: cobre o fluxo do início à conduta.
- Rastreador de módulos: nasceu do bug do módulo 1; abre todos os módulos em
  várias profundidades, nas oito linhas.
- Integração: nasceu da perda do esquema anterior e da ficha do paciente.
- Vigia e contrato de telas: pegaram sozinhos duas telas fora de módulo antes
  de qualquer publicação.

Um falso positivo vale registro: o rastreador acusou "tela sem saída" numa
tela de escala porque o teste não reconhecia aquele tipo de botão. Foi o teste
que mudou, não o app.
