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

Não está neste repositório. Características conhecidas: Python stdlib apenas,
porta 8080, `threading.Lock()`, gravação atômica (tmp + fsync + os.replace),
backup diário por 60 dias.

Rotas: `/`, `/recepcao`, `/financeiro`, `/api/health`,
`/api/paciente/<cod>`, `/api/historico/<cod>`, `/api/triagens-hoje`,
`/api/proximo-codigo`, `/api/export`, `POST /api/ciclo`,
`PUT /api/triagem/<cod>/nota`.

Banco: `pacientes/<COD>/ciclos`, `recepcao`, `codigos`.

**Atenção ao portar:** `/api/paciente/<cod>` deve devolver o último ciclo
**clínico**, ignorando registros de recepção — o app já protege contra isso,
mas o servidor deveria fazer o mesmo.
