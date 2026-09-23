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
| `apps/recepcao.html` | iPad da recepção | recepcionista entrega ao paciente |
| `apps/financeiro.html` | Mac | painel comercial |

Cada app é um HTML único, autocontido, com uma só dependência conceitual: o
adaptador `Store`, que opera em três modos — `claude` (banco do artifact),
`rede` (servidor local) e `manual` (sem persistência). **O sistema é
independente da Claude**: em produção roda contra o servidor local, offline.

O servidor (`servidor_maximus.py`) não está neste repositório — recupere a
versão que roda no Mac da clínica ou reconstrua a partir da descrição em
`docs/servidor.md`.

---

## Regras clínicas que não podem ser quebradas

**Fórmulas sempre explicadas.** Toda sigla de fórmula ou de protocolo que
apareça em tela, nota, alerta ou relatório vem acompanhada da composição.
Com dose para: tadalafila, clomipramina, paroxetina, ioimbina, dapoxetina,
clomifeno, testosteronas, lidocaína e prilocaína. Sem dose para fitoterápicos.
Sem forma de apresentação nem horário na linha de composição.
Implementado em `explicaSiglas()`, `compoTxt()` e `PROTO_COMPO`.

**Piso terapêutico.** Ninguém sai só com suplemento. DE → mínimo SP-DE;
EP → SP-DUO, dapoxetina ou RET-1.

**Ondas de choque.** Só entram no protocolo com doença arterial e/ou diabetes.
Nos demais casos são oferta complementar, com custo à parte, em nota separada.
Exceção: contraindicação a tadalafila sem alternativa farmacológica.

**Ioimbina exige testosterona normal documentada** (corte 340 ng/dL). Nunca
prescrever por omissão quando a testosterona é desconhecida.

**Nunca associar paroxetina diária e dapoxetina** (ambos ISRS). A única
combinação serotoninérgica prevista é EP-4 / DUO-4, com limite de 1 jato.
Esse aviso só aparece em linha que envolve ejaculação.

**Corte IIEF 17/18** separa leve de normal; IIEF ≤ 7 → intracavernosa.
Esses cortes são testados e críticos — qualquer mudança exige paciente-teste
no limite exato.

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
avisa e volta ao panorama com o próximo módulo destacado.

**Telas de navegação** (`origem`, `daFila`, `filaVazia`) levam `plumb:true`:
não pertencem a módulo nenhum, não aparecem no panorama, e abrir um módulo
nunca cai numa delas. Trocar de paciente é ação explícita do panorama.

**Voltar** anda só dentro do módulo aberto; na primeira tela dele, volta ao
panorama. Voltar para antes da identificação descarta o paciente carregado.

**Painel do paciente** é janela própria, fixa à esquerda, presente também com o
panorama aberto. Só existe quando há paciente; sem paciente o questionário
ocupa a largura inteira (`.stage.largo` / `.linha.com-painel`).

**Ficha completa** (botão "Ficha" ou tecla F): documento em pop-up com tudo o
que se sabe do paciente, incluindo evolução de IIEF e PEDT comparando
prontuário com hoje, e ganho do preenchimento em cm e em porcentagem.

**Identificação:** obrigatórios o código e telefone **ou** email. Telefone é
formatado como `(21)99999-9999` e validado; iniciais em maiúsculas sem pontos.
No retorno, os três campos vêm do banco e a recepção apenas confirma.

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

Cinco etapas: sintaxe dos apps, 100 pacientes sintéticos no clínico, 100 na
recepção, rastreador de módulos nas oito linhas de queixa, e integração
recepção → consultório.

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

---

## Backlog

Ver `docs/backlog.md`. Os dois primeiros itens são a razão de este projeto ter
vindo para o Claude Code: dividir o HTML único em módulos com build, e
reconstruir a regressão clínica com os pacientes-limite nos cortes exatos.
