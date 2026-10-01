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

- **Pergunta de testosterona nunca era feita** — com libido baixa no ADAM na
  primeira consulta, sem exame no banco, a pergunta entrava no fluxo tarde
  demais (o `build()` lia `S.libido` antes de recalculá-la) e num módulo que o
  "Continuar" do panorama não visitava. A conduta saía sem ela, e o ramo com
  ioimbina ficava inalcançável. Hoje a libido é calculada logo após o ADAM e
  a conduta só é gerada com todas as obrigatórias respondidas. Achado pela
  regressão clínica (LIM-020 a LIM-023).

- **Servidor derrubava a conexão em qualquer 404** — o log quebrava ao
  registrar o erro (o navegador pede `/favicon.ico` sempre), e a resposta não
  saía. Achado ao rodar o servidor de verdade no navegador.
- **Banco de demonstração incompatível com o servidor** — estava no formato do
  modo Claude; seguindo o README, a fila dava erro 500 e os pacientes de
  demonstração apareciam como desconhecidos. Hoje entra por `--carregar-demo`.

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

- **Aviso de ISRS em emagrecimento** — voltou a vazar. Hoje depende só do
  kit: aparece apenas com paroxetina e clomipramina na mesma prescrição.
- **"Imprimir relatório" sem ação** — `window.print()` na própria página nem
  sempre abria o diálogo, e a ficha saía em branco (a regra de impressão
  escondia tudo fora da área impressa). Hoje imprime numa aba própria.
- **"Descartar" da faixa de retomada sem ação** — dependia de `confirm()`.
- **Ids duplicados** (`termoBtn`, `printTermo`) no HTML — removidos.
- **Dois botões de continuar no panorama** — ficou um só.
- **Ficha sem os dados do atendimento em curso** — hoje mostra tudo o que foi
  respondido.

## Sobre os testes

A suíte nasceu depois de o médico encontrar erros que os testes não pegavam.
Cada ampliação veio de um caso real:

- 100 pacientes sintéticos: cobre o fluxo do início à conduta.
- Rastreador de módulos: nasceu do bug do módulo 1; abre todos os módulos em
  várias profundidades, nas oito linhas.
- Integração: nasceu da perda do esquema anterior e da ficha do paciente.
- Regressão clínica: 59 pacientes nos cortes exatos, contra baseline. No
  primeiro dia achou a pergunta de testosterona que nunca era feita; num teste
  de mutação, acusou a mudança do corte IIEF 17 → 18 no paciente exato.
- Vigia e contrato de telas: pegaram sozinhos duas telas fora de módulo antes
  de qualquer publicação.

Um falso positivo vale registro: o rastreador acusou "tela sem saída" numa
tela de escala porque o teste não reconhecia aquele tipo de botão. Foi o teste
que mudou, não o app.

## v2.2.0 · 29/09/2026 — identidade visual 2026 (PR-0)

Antes das regras v3, por decisão do Dr. Marco: casca nova com a marca 2026
(Inter Tight + Inter, tema claro/escuro conforme o aparelho), trilho fixo do
paciente, prontuário e histórico em gavetas, card agrupado com as respostas do
módulo e prévia da conduta ao vivo. Recepção redesenhada para o paciente
responder no iPad. Toda sigla passa a vir com o ativo e a dose ao lado
("BASE-T20 · tadalafila 20 mg"), inclusive no financeiro; R3 saiu das listas de
escolha. As intracavernosas R1, R2 e R4–R12 passaram a mostrar todas as
substâncias com a concentração (tabela §6.6 da proposta v3, aprovada pelo Dr.
Marco em 29/09/2026; R2 com fentolamina 10 mg/mL confirmada). Servidor ganhou usuários nomeados e `--definir-senha-todos`; senha
mínima passou a 4 caracteres. Conduta clínica idêntica à v2.1.0: na regressão,
0 pacientes com protocolo/kit/escores diferentes; só o texto mudou (siglas com
ativo).

## v2.2.1 · 30/09/2026 — código do paciente novo

Relato do Dr. Marco no app ao vivo (banco vazio, servidor local): ao escolher
paciente novo o campo do código não parecia sugerido e o botão de avançar
aceitava o campo vazio. O que estava errado:
- Recepção: a sugestão ia só para o placeholder; campo vazio contava como
  "aceitar o sugerido" e o botão ficava liberado. Depois de "Novo paciente"
  nada era buscado: campo vazio, placeholder "MX0001" (já em uso) e botão ativo.
- App clínico: a sugestão só rodava ao sair da tela "Tipo de visita"; chegar à
  tela do código por outro caminho (atendimento retomado) deixava o campo
  vazio. O placeholder era "MX0001", igual à sugestão com o banco vazio: campo
  preenchido e campo vazio ficavam indistinguíveis. "Novo paciente" apagava a
  fila e não a consultava de novo.
- Os dois apps: servidor sem resposta virava "MX0001" às cegas (colide com
  paciente gravado); no banco Claude a recepção ignorava os próprios códigos.
- Servidor: banco "{}" derrubava /api/proximo-codigo, /api/pacientes e a
  gravação (KeyError); arquivo de 0 bytes gerava uma cópia ".corrompido" a cada
  consulta.

Agora o próximo código livre vem sempre preenchido no campo, calculado contra
o banco, a lista de pacientes e a fila da recepção de hoje; campo vazio ou
inválido desativa o botão e mostra o motivo ("Informe o código do paciente
para continuar — o próximo livre é MX0002."). Testes: tests/teste_codigo.js
(etapa 7c) e três casos novos em teste_servidor.py. Conduta clínica idêntica.

## v2.3.1 · 01/10/2026 — receita só quando há fórmula; novas orientações pós-preenchimento; banco de teste

Pedidos do Dr. Marco:
- **"Receita das fórmulas" oferecida sem fórmula.** A caixa "Enviar ao
  paciente" era fixa: preenchimento peniano, consulta urológica, emagrecimento,
  TEFI e o bloqueio por nitrato (kit só com ondas de choque) ofereciam a
  receita e o guia do Protocolo de Performance. Agora `ajustaEnvio()` monta a
  caixa a partir do kit gravado: a receita só aparece com pelo menos uma
  fórmula manipulada ou medicação (exames, ondas de choque, TEFI em consultório
  e preservativo de farmácia não contam); no hipogonadismo vira "Receita da
  medicação" e só aparece com via prescrita; guia e apêndice só na linha DE/EP.
  O lembrete "entregar o guia junto da receita" perdeu o "junto da receita"
  quando não há receita (TEST-005 e TEST-006 da regressão: só esse texto
  mudou; protocolo, kit e escores idênticos — baseline regravada).
- **Orientações pós-preenchimento** trocadas pelo texto do Dr. Marco, exato,
  com subitens (lista numerada 1–8 com a., na folha do paciente e na folha
  "Orientações pós-procedimento"). Muda o sentido da massagem (antes "da
  cabeça para o corpo", agora "corpo-cabeça") e entra o item 8 (evitar AINE).
- **Banco de teste fictício** (`data/banco_teste.json`, 40 pacientes
  MX9101–MX9140, gerado pelo próprio app com `tests/banco_teste.js`) e
  `python3 servidor_maximus.py --carregar-teste`: mescla sem tocar em registro
  real, faz cópia do banco antes, recusa se algum código do teste já for de
  paciente real, traz as datas para hoje (fila da recepção de hoje com 8).
  Sai inteiro com `--apagar-ficticios`.
- **Fictício não empurra a numeração.** Com MX9101–MX9140 no banco, o próximo
  paciente real viraria MX9141. Servidor (`/api/proximo-codigo`) e os dois apps
  ignoram, na numeração, pacientes só com registros `demo`, mas o código deles
  continua ocupado (nunca colide). `/api/pacientes` informa `ficticio`.
  Atender um paciente fictício grava registro fictício (o servidor marca
  `demo:true`), para que `--apagar-ficticios` o leve junto.

Testes: `teste_envio.js` (etapa 7e: 14 condutas em 6 linhas + texto exato das
orientações), `banco_teste.js --conferir` (etapa 7f: o banco de teste ainda é
o que o app produz), casos novos em `teste_codigo.js` e `teste_servidor.py`.

## v2.3.0 · 30/09/2026 — paridade com o mockup v3, sem mudar a conduta

O app ao vivo ganhou o que o mockup v3 tinha e não depende das regras v3:
atalhos de teclado (1–9, ↓/Enter, ↑, ⌘↵, R/H/P, ⌘K, T, ? e Esc, com lista de
ajuda), tema claro/escuro manual (padrão continua seguindo o aparelho; a
escolha fica salva no navegador), busca de paciente por código ou iniciais,
barra superior com a fila de hoje, chips e contagem n/total no trilho, módulos
dispensados com o motivo, seção agrupada no estilo do mockup (respondidas
acima, seguintes abaixo), selo "nova · por causa de …" para pergunta que surge
depois de uma resposta, opções curtas em pílula, barra fixa de progresso com
"Revisar conduta ⌘↵" e conduta em 3 níveis (protocolo e escores; alertas e kit;
racional e custo recolhíveis, abertos na impressão). O ⌘↵ só encadeia o botão
Próxima: para na primeira pergunta obrigatória em aberto. Inclui a correção
do código do paciente da v2.2.1. Conduta idêntica à v2.2: regressão com 0 pacientes com protocolo/kit/escores ou texto diferentes;
teste novo (`teste_interface.js`) confere, nos 65 pacientes da regressão, que
pedir a conduta com ⌘↵ dá o mesmo protocolo, kit, escores e texto do caminho
normal.

Ficou para as regras v3 (o mockup mostra, o app ainda não tem a regra por
trás): todas as perguntas numa página com o "porquê" de cada uma (BD-x, P0,
§6.1), perguntas dispensadas com motivo por pergunta, bloqueios duros × alertas
com códigos BD, tags [PERMISSIVO] PE-x no kit, protocolo "BLOQUEIO",
reavaliação com linha de diferença e critério de sucesso (Δ IIEF ≥ +5), escada
de intracavernosa no kit e as perguntas novas da v3.
