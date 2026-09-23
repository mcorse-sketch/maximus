# Arquitetura

## Linhas de queixa (app clínico)

1. **Ereção (DE)** — IIEF-5
2. **Ejaculação (EP)** — PEDT
3. **Ambas (DUO)**
4. **Preenchimento peniano** — ácido hialurônico, medidas por circunferência
5. **TEFI** com Doppler (opcional)
6. **Hipogonadismo** — módulo completo
7. **Emagrecimento** — registra e encaminha ao especialista (protocolo pendente)
8. **Consulta urológica** — só registro, segue no prontuário externo

## Módulos do panorama

Identificação · Queixa e protocolo · Antecedentes · Medicações e alergias ·
Escores e resposta · Exames · Procedimento · Escolha da conduta.

Cada tela declara o próprio módulo em `sc.mod`; a tabela `MODS` é apenas o
padrão. Telas de navegação levam `plumb: true` e ficam fora de todos.

## Módulo de hipogonadismo

Formulações: Androgel 50 mg/dia (gel, com figura de aplicação), Cipionato
200 mg a cada 2 semanas, Durateston 250 mg/semana (contém óleo de amendoim),
Undecilato (1ª dose, saturação em 6 semanas, 3ª aplicação em 12 semanas define
o intervalo individual de 10 a 14 semanas). hCG foi removido — não disponível
na clínica.

Fluxo: confirmação diagnóstica (duas dosagens + sintomas) → laboratório →
pergunta única de fertilidade (manter nos próximos 12 meses: sim/não, sem
"indeciso") → contraindicações → preferência de via (sem perguntar sobre
adesão esperada: o médico não deve supor) → TRT prévio (nunca, atual,
parou < 6 m, parou > 6 m) → tela de escolha da conduta.

Testosterona em uso atual significa eixo suprimido: bloqueia o diagnóstico e
indica washout (6 semanas para ésteres curtos, 3 a 6 meses para undecilato).

Metas: testosterona 400–700 no vale, hematócrito < 52%, régua de PSA de
1,4 ng/mL em 12 meses. Recoleta orientada pela via.

## Preenchimento peniano

ICI genérico na lista de fórmulas anteriores, com opção combinada ONDAS+ICI.
Fórmula e dose da intracavernosa numa única tela. No retorno, o sistema
preenche sozinho se houve toxina botulínica no registro anterior. Cinco
opções de conduta no retorno, incluindo ácido e toxina combinados.
Hialuronidase: pergunta só os mL, o sistema calcula as UI (diluição fixa
3000 UI / 3 mL). O ganho é calculado em cm e em porcentagem e comparado no
retorno com a medida anterior ao procedimento.

## Recepção — fluxo

1. Código → conferência (cadastro existente? novo/retorno decidido pela
   recepção, nunca pelo paciente)
2. Contato: iniciais, telefone e email; libera com telefone **ou** email
3. Entrega ao paciente → saudação e explicação
4. Queixa (no retorno, pergunta se é sobre a queixa anterior)
5. Preenchimento com procedimento já feito pula a jornada e vai à revisão
6. Consulta de rotina coleta autorrelato e medidas (idade, peso, altura)
7. Toda pergunta tem "não sei responder" ao fim de cada bloco
8. Persistência por `sessionStorage`, expira em 3 horas

## Servidor local (`servidor_maximus.py`)

Na raiz do repositório; serve as páginas a partir de `apps/`. Python stdlib apenas,
porta 8080, `threading.Lock()`, gravação atômica (tmp + fsync + os.replace),
backup diário por 60 dias.

Rotas livres: `/`, `/recepcao`, `/financeiro` (as páginas não trazem dado de
paciente), `/api/health`, `POST /api/login`, `POST /api/logout`,
`/api/sessao`.

Rotas com senha, por perfil (`PERMISSOES` no servidor):

| Rota | Médico | Recepção | Financeiro |
|---|---|---|---|
| `/api/paciente/<cod>`, `/api/historico/<cod>`, `/api/triagens-hoje` | ✓ | ✓ | ✓ |
| `/api/proximo-codigo` | ✓ | ✓ | — |
| `POST /api/ciclo` | ✓ | só `tipo` e `linha` = `recepcao` | — |
| `PUT /api/triagem/<cod>/nota`, `/api/export` | ✓ | — | — |

Sessão: token aleatório no cabeçalho `Authorization: Bearer`, guardado em
`sessionStorage` (some ao fechar a aba), válido por 12 horas, só na memória do
servidor — reiniciar o servidor desconecta todos. Senhas em `senhas.json`
como PBKDF2-SHA256 com sal, permissão 600. Cinco erros seguidos bloqueiam o
endereço por 5 minutos. CORS continua aberto: sem o token, que outro site não
consegue ler, a chamada não passa.

Nos apps, o bloco `Sessao` (idêntico nos três — `tests/teste_sessao.js`
confere) só age no modo `rede`: põe o token nas chamadas `/api/` e, se a
sessão expira, pede a senha e repete a chamada.

Banco do servidor: `{"pacientes": {"<COD>": [ciclos...]}}`, com os registros
da recepção dentro da lista do paciente. O modo Claude usa outra forma
(coleções `pacientes/<COD>/ciclos`, `recepcao`, `codigos`) — por isso o banco
de demonstração passa por `--carregar-demo`.

**`/api/paciente/<cod>` devolve o último registro, inclusive o da recepção.**
De propósito: o app de recepção usa essa rota para saber se o paciente existe e
para trazer peso e altura, que ficam no registro da recepção. O app clínico
filtra do lado dele (`Store.ehClinico`) e busca o último ciclo clínico no
histórico.
