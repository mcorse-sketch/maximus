# Maximus — sistema de triagem clínica

Ecossistema de três aplicações HTML autocontidas da Clínica Maximus Medicina
Masculina (Dr. Marco Corsetti, urologia, Rio de Janeiro), mais um servidor
Python local opcional.

**Leia este arquivo inteiro antes de mexer em qualquer coisa.** Ele registra
decisões que já custaram caro para descobrir.

---

## Os três apps

| Arquivo | Onde roda | Para quem |
|---|---|---|
| `apps/triagem.html` | Mac do consultório | médico — questionário clínico, panorama, conduta |
| `apps/recepcao.html` | iPad da recepção | respondido pelo **paciente** (a recepcionista só abre e entrega) — letra grande, alvos de toque de 64 px ou mais |
| `apps/financeiro.html` | Mac | painel comercial |

Cada app é um HTML único, autocontido, com uma só dependência conceitual: o
adaptador `Store`, que opera em três modos — `claude` (banco do artifact),
`rede` (servidor local) e `manual` (sem persistência). **O sistema é
independente da Claude**: em produção roda contra o servidor local, offline.

O servidor (`servidor_maximus.py`, na raiz) serve os três apps a partir de
`apps/` e grava `banco_triagem.json` e `backups/` ao lado dele (ambos fora do
git). **Exige senha por perfil** (médico, recepção, financeiro): cada app pede
a sua ao abrir, e o servidor só libera o que o perfil pode (`PERMISSOES`).
O bloco `Sessao` que faz isso nos apps é idêntico nos três — mude nos três.
Senhas só existem no Mac do servidor (`senhas.json`, PBKDF2 com sal, fora do
git) — nunca no repositório nem nos HTML. Além da senha do perfil, pode haver
**usuários nomeados** (cada pessoa com a própria senha dentro de um perfil):
`--adicionar-usuario <nome> <perfil>`, `--listar-usuarios`,
`--remover-usuario <nome>`; `--definir-senha-todos` troca a senha dos três
perfis e de todos os usuários de uma vez. Senha mínima: 4 caracteres (decisão
do Dr. Marco, 28/09/2026); o bloqueio após 5 erros continua.
Rotas, permissões e detalhes em `docs/arquitetura.md`.

---

## Regras clínicas que não podem ser quebradas

**Sigla nunca aparece sozinha (v2.2).** Em TODA ocorrência — conduta, kit,
racional, resumo, painel, prontuário, histórico, impressão, texto copiado,
prévia e financeiro — a sigla de fórmula ou de protocolo vem seguida do ativo
principal com a dose, no formato `BASE-T20 · tadalafila 20 mg`. Com dose para:
tadalafila, clomipramina, paroxetina, ioimbina, dapoxetina, clomifeno,
testosteronas, lidocaína e prilocaína. Fitoterápicos só pelo nome, sem dose.
Composição vem **só** de `F` e `PROTO_COMPO`; nunca inventar.
Implementado em `ativoTxt()` (texto do ativo), `garanteSiglas()` (texto puro:
`explicaSiglas` e texto do prontuário) e `aplicaTooltips()` (tela: insere
`span.sig-ativo` quando o ativo não vem logo depois). O financeiro guarda uma
cópia (`ATIVO`) que `tests/teste_siglas.js` confere contra o app clínico.
**Intracavernosas:** R1, R2 e R4–R12 com todas as substâncias e
concentrações por mL da tabela do Dr. Marco (proposta v3 §6.6, aprovada em
29/09/2026), em `ICI_COMPO` — ex.: `R2 · alprostadil (PGE1) 20 mcg/mL +
fentolamina 10 mg/mL`; R7 e R8 sem PGE1. A sigla R só conta como explicada se
cada substância vier com a concentração. R3 não consta da tabela: fora das
listas de escolha; em registro antigo aparece como "fórmula retirada".
`ICI_COMPO` é só exibição — as regras do TEFI (`SEM_PAPA`/`SEM_PGE1`) não a
leem. Mudou a tabela? Atualize `ICI_COMPO`, a cópia `ATIVO` do financeiro e a
tabela conferida em `tests/teste_siglas.js`.

**Piso terapêutico.** Ninguém sai só com suplemento. DE → mínimo SP-DE;
EP → SP-DUO, dapoxetina ou RET-1.

**Ondas de choque.** Só entram no protocolo com doença arterial e/ou diabetes.
Nos demais casos são oferta complementar, com custo à parte, em nota separada.
Exceção: contraindicação a tadalafila sem alternativa farmacológica.

**Ioimbina exige testosterona normal documentada** (corte 340 ng/dL). Nunca
prescrever por omissão quando a testosterona é desconhecida.

**Nunca associar paroxetina diária e dapoxetina** (ambos ISRS). A única
combinação serotoninérgica prevista é EP-4 / DUO-4, com limite de 1 jato.
O aviso de ISRS na conduta **só aparece quando a prescrição associa
paroxetina e clomipramina** no mesmo paciente (kit com item `PAROX` e item
`SP-DUO`). Em nenhuma outra linha — o médico já reclamou duas vezes.

**IIEF-5 (Rosen, 1999):** 22–25 sem DE, 17–21 leve, 12–16 leve a moderada,
8–11 moderada, 5–7 grave. Corte diagnóstico **≤ 21**; IIEF ≤ 7 → intracavernosa.
Nos itens 2 a 5, "0" é "sem atividade sexual / não tentou relação": havendo
algum, a conduta traz alerta de que o total pode refletir ausência de
tentativa, e não gravidade.
Esses cortes são testados e críticos — qualquer mudança exige paciente-teste
no limite exato.

**ADAM (Morley, 2000):** positivo com "sim" na 1 (libido) ou na 7 (ereções),
ou em 3 ou mais das outras. "Nenhum destes sintomas" é resposta válida e
exclui as demais.

**Preenchimento usa circunferência, não diâmetro.**

**Escores e índices são faixas fechadas** (IIEF-5, PEDT, biotensiômetro 0–100,
índice de resistividade 0–1): não existe "valor fora da faixa" neles.
Laboratório e medidas anatômicas têm saída para valor atípico.

**Biotensiômetro:** abaixo de 10 vermelho, 10 a 20 verde, acima de 20 âmbar.

---

## Regras de interface

**Seletores numéricos.** Recepção usa roleta (iPad, toque). Consultório usa
slider com −/+. Nenhum campo numérico é digitado — exceto a saída explícita
para valor fora da faixa, onde ela existe. O seletor abre mostrando o valor
mediano em cinza; nada é registrado sem gesto do usuário.

**Panorama e módulos.** O atendimento é uma grade de módulos numerados, não uma
fila de telas. Contorno verde = módulo completo. Ao terminar um módulo, o app
avisa e volta ao panorama com o próximo módulo destacado; se não falta nada
obrigatório, vai direto para a nota final. O panorama tem um só botão
"Continuar o atendimento" (no topo). Sem paciente carregado, o botão Panorama
fica escondido e Esc não o abre.

**Telas de navegação** (`origem`, `daFila`, `filaVazia`) levam `plumb:true`:
não pertencem a módulo nenhum, não aparecem no panorama, e abrir um módulo
nunca cai numa delas. Trocar de paciente é ação explícita do panorama.

**Voltar** anda só dentro do módulo aberto; na primeira tela dele, volta ao
panorama. Voltar para antes da identificação descarta o paciente carregado.

**Painel do paciente** é janela própria, fixa à esquerda, presente também com o
panorama aberto. Só existe quando há paciente; sem paciente o questionário
ocupa a largura inteira (`.stage.largo` / `.linha.com-painel`).

**Ficha completa** (botão "Ficha" ou tecla F): documento em pop-up com tudo o
que se sabe do paciente — inclusive tudo o que já foi respondido no atendimento
em curso ("Registrado neste atendimento") —, incluindo evolução de IIEF e PEDT comparando
prontuário com hoje, e ganho do preenchimento em cm e em porcentagem.

**Histórico do paciente** (botão fixo no canto inferior direito, ou tecla H):
só aparece no retorno com histórico encontrado para o código em tela. Abre em
janela própria, sobre o atendimento, sem mexer nele — com a janela aberta
nenhuma tecla chega ao questionário. Resume todos os ciclos clínicos (sem os
registros da recepção) em ordem cronológica: síntese (datas, sequência de
protocolos, evolução de IIEF/PEDT) e, por visita, só dados — escores, conduta
com composição, exames, nota do médico. Antecedentes aparecem na primeira
visita e depois só quando mudam. Implementado em `abreHistorico()`.

**Identificação:** obrigatórios o código e telefone **ou** email. Telefone é
formatado como `(21)99999-9999` e validado; iniciais em maiúsculas sem pontos.
No retorno, os três campos vêm do banco e a recepção apenas confirma. Se nem
a recepção nem o cadastro têm telefone ou email, o consultório pergunta na tela
`contato` (módulo Identificação). No retorno, o campo do código abre a lista
de todos os pacientes do banco (`/api/pacientes`), filtrável por código ou
iniciais.

**Nota final.** Todo caminho termina na tela opcional `notaFinal` (módulo
"Escolha da conduta"), gravada no registro como `notaAtendimento` e levada ao
texto do prontuário.

**Texto do prontuário** (`montarTextoCopia`): só dados — cabeçalho com código
e data, "Rótulo: valor", conduta, protocolo com composição, cronograma
laboratorial, pendências e nota do médico. Nada de racional, explicação,
assinatura ou código repetido.

**Impressão** abre o documento numa aba própria (`imprimeEmAba`), que chama a
impressão; se o navegador bloquear a aba, imprime pela própria página.

**Descartar** o atendimento interrompido confirma na própria faixa, nunca com
`confirm()` nativo (pode estar bloqueado).

**O esquema medicamentoso anterior vem sempre do banco**, nunca do formulário
da recepção.

**Atalhos:** número escolhe opção, Enter avança, Esc abre o panorama ou fecha a
ficha, F abre a ficha.

---

## Armadilhas já pagas (não repetir)

**O registro da recepção não é ciclo clínico.** Ele é gravado dentro de
`pacientes/<COD>/ciclos`. Se `Store.ultimo()` devolver esse registro, o app
perde o protocolo anterior e repergunta tudo. Filtre por
`tipo !== 'recepcao' && linha !== 'recepcao'`.

**Filtro de "hoje" por data local, nunca UTC.** No Rio o dia virava às 21h e a
fila sumia com a clínica aberta. Grave e filtre por `dataLocal` (YYYY-MM-DD).

**Gauge sem escore.** Linhas sem IIEF/PEDT deixam `band` nulo; sempre use
fallback antes de ler `band.key`.

**Limpeza de CSS órfão quebrou o layout inteiro** do kiosk e do financeiro:
o detector não reconhecia seletores de elemento e estrutura. Se for fazer,
faça com revisão visual, não só com teste automatizado.

**Teste verde não é sistema íntegro.** Contraste automatizado não enxerga
layout quebrado; jsdom não enxerga nada visual. Revise no navegador.

**Toda regra nova traz o paciente-teste que a exercita no limite.** Sem isso a
suíte dá falsa segurança — a mudança do corte IIEF 17→18 só foi pega depois de
criar pacientes exatamente nos cortes.

---

## Rede de segurança

```bash
cd tests && npm install          # jsdom
cd .. && ./scripts/testar.sh 100 # roda tudo
```

Onze etapas: sintaxe dos três apps, 100 pacientes sintéticos no clínico, 100 na
recepção, rastreador de módulos nas oito linhas de queixa, integração
recepção → consultório, **regressão clínica**, jornada do médico
(`teste_jornada.js`: contato, nota final, aviso de ISRS, texto, ficha,
impressão, lista de pacientes, descartar), **siglas com ativo**
(`teste_siglas.js`), **interface v2.3** (`teste_interface.js`: tema, atalhos,
busca e a equivalência do ⌘↵ com o caminho normal nos pacientes da regressão),
tela de senha e servidor. A regressão separa
"protocolo/kit/escores mudaram" de "só o texto mudou".

A regressão (`tests/regressao.js`) leva os pacientes de
`tests/regressao/pacientes.js` até a conduta e compara protocolo, kit, escores
e texto com `tests/regressao/baseline.json`. Conduta que muda derruba a
bateria. Se a mudança foi intencional e o médico conferiu
`tests/regressao/REVISAO.md`, regrave com `node regressao.js --aprovar`.
Regra nova entra como paciente novo, no limite exato, e — se for regra do
CLAUDE.md — com `espera`, que vale mesmo com `--aprovar`.

O teste acha cada pergunta pelo atributo `data-tela` do `#quizCard` e cada
opção por `data-v` / `data-campo`. Não remova essas marcações.

---

## Interface (v2.2 · identidade 2026)

- Marca hias.group (mai/2026): Gelo #F2F9F9, Cinza Claro #D1DBDB, Cinza Médio
  #424D54, Azul Principal #0E1E28, Azul Profundo #010B0F. Sem dourado. Fontes
  Inter Tight (títulos) + Inter (texto). Tokens em `<style id="tema-2026">` no
  fim de cada app, com o prefixo `--mx-`.
- **Tema:** padrão segue o aparelho (`prefers-color-scheme`); desde a v2.3 o
  médico troca à mão (botão ◐ ou tecla T) e a escolha fica em
  `localStorage['mx-tema']` ('claro'/'escuro'). O script logo após `<body>` põe
  `data-tema` no `<html>` antes de pintar; as cores escuras valem só com
  `html[data-tema="escuro"]` dentro de `@media screen`. Impressão sempre clara.
- `triagem.html` (Mac): casca `#mxShell` em três colunas — trilho fixo do
  paciente `#mxRail` (Prontuário, Histórico, Panorama, módulos com estado e o
  `#painelCard`), atendimento no centro e `#previaCard` (conduta ao vivo) à
  direita. Prontuário e histórico abrem como **gavetas** à direita. As
  respostas já dadas no módulo aparecem em `#grupoCard`, colado acima da
  pergunta atual (card agrupado). Abaixo de 1180 px a prévia desce; abaixo de
  900 px o trilho vira faixa.
- **v2.3 · paridade com o mockup v3** (bloco "v2.3" no fim do script, só
  apresentação): atalhos 1–9, ↓/Enter, ↑, ⌘↵ (Ctrl+Enter), R/F, H, P, ⌘K, T,
  ? e Esc com a lista em `#mxAjuda`; busca de paciente `#mxBusca` (fila de hoje
  + banco; abre pelo mesmo clique das telas iniciais); chips e contagem n/total
  no trilho, `#mxDisp` com os módulos que as regras atuais tiraram do fluxo;
  seção agrupada (`#mxSecH`, `#grupoCard`, `#mxSeguintes`); selo
  "nova · por causa de …" (`#mxNova`) em tela que surgiu depois de uma resposta
  clínica; opções curtas em pílula; barra `#mxCta` com progresso; conduta em 3
  níveis (`#mxCdHead` fora da impressão, alertas antes do kit só na tela,
  racional e custo em `<details class="mx-det">`, que saem abertos na
  impressão). **⌘↵ não calcula nada:** chama `avancar()` em sequência — o mesmo
  caminho do botão Próxima — e para na primeira obrigatória em aberto.
- **Prévia ao vivo:** o mesmo app num iframe oculto com `?previa=1`
  (`PREVIA`), que roda `showResults()` com uma cópia das respostas e **nunca
  grava** (salvarCiclo, sessão, fila e localStorage viram no-op; Store fica em
  modo manual). Só aparece com os escores completos (IIEF-5/PEDT de hoje ou da
  recepção) e avisa que perguntas pendentes podem mudar a conduta. Não roda em
  jsdom.
- `recepcao.html` é respondido pelo paciente no iPad: fonte ≥ 18 px, opções e
  botões com 64–68 px de altura, barra de navegação fixa no rodapé.

Dentro do app há duas camadas que os testes leem:

- **contrato de telas** (`verificaContrato`): id único, módulo declarado,
  tela de opções com opção, tela de campos com campo.
- **vigia de invariantes** (`verificaTelaAtual`): toda tela tem ação possível;
  o painel mostra o paciente carregado. Violação vira faixa visível e entra em
  `window.__mxVigia`, que os testes conferem.

Nunca publique com o vigia acusando algo.

---

## Convenções para quem edita

- Português do Brasil em tudo o que o usuário lê. Linguagem clínica, não
  coloquial: "uso regular", não "usou certinho".
- Nunca inventar composição de fórmula, dose ou valor de exame. Se o dado não
  existe, perguntar.
- Mudou comportamento? O teste que o cobre entra no mesmo commit.
- Antes de publicar: `./scripts/testar.sh` verde **e** revisão visual no
  navegador, incluindo iPad em retrato.
- **Versão.** O cabeçalho do `triagem.html` mostra "Painel de atendimento
  Maximus" e, abaixo, a versão (`#versaoApp`, atributo `data-versao` e texto
  "Versão X.Y.Z · DD/MM/AAAA"). Toda alteração publicada sobe a versão e a
  data — correção no último número, recurso novo no do meio.
- **Toda alteração é publicada em todas as instâncias**, sem esperar pedido:
  commit, push e PR mesclado no GitHub, **e** o artifact correspondente
  republicado (links em `README.md`, seção Publicação). Artifact de app que
  não mudou não precisa ser republicado.

---

## Backlog

Ver `docs/backlog.md`. Os dois primeiros itens são a razão de este projeto ter
vindo para o Claude Code: dividir o HTML único em módulos com build, e
reconstruir a regressão clínica com os pacientes-limite nos cortes exatos.
