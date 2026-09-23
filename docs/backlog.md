# Backlog

Ordem sugerida. Os dois primeiros são a razão de o projeto ter vindo para cá.

## 1. Dividir o HTML único em módulos com build

`apps/triagem.html` tem ~335 KB num arquivo só, com `build()`, `paint()` e
`showResults()` concentrando quase toda a lógica. Cada alteração vira cirurgia
de texto — foi assim que nasceu o incidente que quebrou o layout inteiro.

Alvo: `src/logic.js` (motor de decisão, sem DOM), `src/ui.js`, `src/store.js`
compartilhado pelos três apps, e um `build.js` que gera os HTML autocontidos.
O motor sem DOM é o que destrava o item 2.

## 2. Regressão clínica com pacientes-limite — feita, falta aprovação

Em `tests/regressao/` (etapa 6 do `testar.sh`): 25 pacientes-limite (IIEF
7/8, 11/12, 16/17, 17/18, 21/22; PEDT 8/9, 10/11, 15/16; biotensiômetro
9/10, 20/21; testosterona 335/340 e ramo da ioimbina), 29 caminhos clínicos e
5 reavaliações.

**Pendente:** o médico conferir `tests/regressao/REVISAO.md`. A baseline foi
gravada a partir do comportamento atual do app — ela garante que nada muda
sem aviso, mas só vira referência clínica depois de conferida. Faltam também
hematócrito 52 e PSA, que dependem do fluxo de hipogonadismo em reavaliação.

## 3. Perfis de acesso por rota

Recepção, médico e financeiro com senha própria; sessão do tablet expurgada ao
entregar; política de retenção escrita. São dados de saúde — é a primeira
coisa que uma auditoria externa vai cobrar.

## 4. Demonstração separada de produção

Hoje os pacientes `MX9xxx` convivem com os reais atrás de uma flag `demo`.
Bancos separados e tarja visível no app quando estiver em demonstração.

## 5. Protocolo de emagrecimento

A linha existe e registra a passagem, encaminhando ao especialista. Falta a
conduta própria — depende de definição clínica do médico.

## 6. Telemetria local

Log de eventos (tela, tempo, voltas, abandono) exportável em planilha. Sem
isso, toda decisão de usabilidade daqui para frente é palpite.

## 7. PWA e service worker

Instalar no iPad da recepção e funcionar sem rede de forma explícita.

## 8. Cirurgias urológicas prévias

Campo reconhecido como lacuna e ainda não coletado em nenhum dos apps.

## 9. Higiene de release

Versão no rodapé, changelog e reversão com um comando. Hoje voltar atrás é
copiar HTML na mão.
