# Revisão da baseline clínica

Gerada por `node regressao.js --aprovar`. Confira cada conduta; se alguma estiver
errada, o erro é do app — corrija o app, não esta folha.

| Paciente | Situação | Protocolo | Kit | IIEF | PEDT |
|---|---|---|---|---|---|
| LIM-001 | IIEF 7 — faixa severa | INTRACAVERNOSA | ICI, NOITE-1, TEFI | 7 | — |
| LIM-002 | IIEF 8 — faixa moderada | DE-3 | BASE-T20, NOITE-1, SP-DE | 8 | — |
| LIM-030 | IIEF 7 sem nenhum item em 0 — grave de fato, sem alerta de ausência de tentativa | INTRACAVERNOSA | ICI, NOITE-1, TEFI | 7 | — |
| LIM-031 | IIEF 7 com três itens em 0 (sem tentativa) — alerta de ausência de tentativa | INTRACAVERNOSA | ICI, NOITE-1, TEFI | 7 | — |
| LIM-003 | IIEF 11 — topo da moderada | DE-3 | BASE-T20, NOITE-1, SP-DE | 11 | — |
| LIM-004 | IIEF 12 — base da leve a moderada | DE-2 | BASE-T10, NOITE-1, SP-DE | 12 | — |
| LIM-005 | IIEF 16 — topo da leve a moderada | DE-2 | BASE-T10, NOITE-1, SP-DE | 16 | — |
| LIM-006 | IIEF 17 — base da leve | DE-1 | BASE-T5, NOITE-1, SP-DE | 17 | — |
| LIM-007 | IIEF 18 — meio da leve | DE-1 | BASE-T5, NOITE-1, SP-DE | 18 | — |
| LIM-008 | IIEF 21 — topo da leve, ainda no corte diagnóstico | DE-1 | BASE-T5, NOITE-1, SP-DE | 21 | — |
| LIM-009 | IIEF 22 — sem disfunção, fora do corte | SEM DIAGNÓSTICO FORMAL | NOITE-1, SP-DE | 22 | — |
| LIM-010 | PEDT 8 — EP improvável | SEM DIAGNÓSTICO FORMAL | NOITE-1, SP-DUO | — | 8 |
| LIM-011 | PEDT 9 — EP provável | EP-1 | SP-DUO, NOITE-1 | — | 9 |
| LIM-012 | PEDT 10 — topo da provável | EP-1 | SP-DUO, NOITE-1 | — | 10 |
| LIM-013 | PEDT 11 — EP confirmada | EP-1 | SP-DUO, NOITE-1 | — | 11 |
| LIM-014 | PEDT 15 — topo da confirmada | EP-1 | SP-DUO, NOITE-1 | — | 15 |
| LIM-015 | PEDT 16 — EP intensa | EP-1 | SP-DUO, NOITE-1 | — | 16 |
| LIM-016 | Biotensiômetro 9 — hipersensibilidade | EP-1 | SP-DUO, NOITE-1 | — | 12 |
| LIM-017 | Biotensiômetro 10 — base da faixa verde | EP-1 | SP-DUO, NOITE-1 | — | 12 |
| LIM-018 | Biotensiômetro 20 — topo da faixa verde | EP-1 | SP-DUO, NOITE-1 | — | 12 |
| LIM-019 | Biotensiômetro 21 — faixa âmbar | EP-1 | SP-DUO, NOITE-1 | — | 12 |
| LIM-020 | Libido baixa, testosterona informada normal, sem contraindicação — ramo ioimbina | DE-2L | BASE-T10-I, NOITE-2, SP-DE, LABS | 14 | — |
| LIM-021 | Libido baixa, testosterona baixa — sem ioimbina | DE-2 | BASE-T10, NOITE-1, SP-DE, LABS | 14 | — |
| LIM-022 | Libido baixa, testosterona não dosada — sem ioimbina por omissão | DE-2 | BASE-T10, NOITE-1, SP-DE, LABS | 14 | — |
| LIM-023 | Libido baixa, testosterona normal, mas ansiedade/ISRS — sem ioimbina | DE-2 | BASE-T10, NOITE-1, SP-DE, LABS | 14 | — |
| LIM-024 | Reavaliação, libido baixa, testosterona 335 no banco — abaixo do corte | DE-2 | BASE-T10, NOITE-1, SP-DE, ONDAS, LABS | 14 | — |
| LIM-025 | Reavaliação, libido baixa, testosterona 340 no banco — no corte, conta como normal | DE-2L | BASE-T10-I, NOITE-2, SP-DE, ONDAS | 14 | — |
| LIM-026 | ADAM sem nenhum sintoma | DE-2 | BASE-T10, NOITE-1, SP-DE | 14 | — |
| LIM-027 | ADAM com 2 sintomas não-chave — negativo | DE-2 | BASE-T10, NOITE-1, SP-DE | 14 | — |
| LIM-028 | ADAM com 3 sintomas não-chave — positivo | DE-2 | BASE-T10, NOITE-1, SP-DE | 14 | — |
| LIM-029 | ADAM: marca libido e depois "nenhum" — fica só o nenhum, sem ramo libido | DE-2 | BASE-T10, NOITE-1, SP-DE | 14 | — |
| TEST-001 | DE com diabetes — ondas no protocolo | DE-2 | BASE-T10, NOITE-1, SP-DE, TEFI, ONDAS | 14 | — |
| TEST-002 | DE com doença arterial — ondas no protocolo | DE-2 | BASE-T10, NOITE-1, SP-DE, TEFI, ONDAS | 14 | — |
| TEST-003 | DE com hipertensão isolada — ondas só como complemento | DE-2 | BASE-T10, NOITE-1, SP-DE, ONDAS | 14 | — |
| TEST-004 | DE sem comorbidade — sem ondas | DE-2 | BASE-T10, NOITE-1, SP-DE | 14 | — |
| TEST-005 | DE com nitrato — bloqueio da tadalafila | BLOQUEIO | ONDAS | 14 | — |
| TEST-006 | DE com alergia a PDE5 — bloqueio da tadalafila | BLOQUEIO | ONDAS | 14 | — |
| TEST-007 | DE com falha prévia em dose plena — TEFI | DE-3 | BASE-T20, NOITE-1, SP-DE, TEFI, ONDAS | 14 | — |
| TEST-008 | DE com desejo de engravidar — linha FERT | FERT | MOD-CLOMI-25, FERT-SUP, SP-DE | 14 | — |
| TEST-009 | EP com frequência alta — paroxetina diária | EP-2 | MOD-PAROX-10, NOITE-1, SP-DUO | — | 13 |
| TEST-010 | EP intensa com frequência alta — paroxetina 20 | EP-3 | MOD-PAROX-20, NOITE-1, SP-DUO | — | 17 |
| TEST-011 | EP refratária à paroxetina 20 — EP-4, limite de 1 jato | EP-4 | MOD-PAROX-20, SP-DUO-1J, NOITE-1 | — | 13 |
| TEST-012 | EP em uso de ISRS — só via tópica | EP-TOPICO | NOITE-1 | — | 13 |
| TEST-013 | EP com história psiquiátrica — sem SP-DUO | EP-1D | MOD-DAPO-30, NOITE-1 | — | 13 |
| TEST-014 | EP com restrição a tópicos | EP-1 | SP-DUO, NOITE-1 | — | 13 |
| TEST-015 | EP leve, frequência baixa, aceita preservativo — comportamental | COMPORTAMENTAL | PRESERV, NOITE-1 | — | 9 |
| TEST-016 | EP abaixo do corte — piso terapêutico | SEM DIAGNÓSTICO FORMAL | NOITE-1, SP-DUO | — | 5 |
| TEST-017 | DE abaixo do corte — piso terapêutico | SEM DIAGNÓSTICO FORMAL | NOITE-1, SP-DE | 23 | — |
| TEST-018 | DUO leve a moderada, frequência baixa | DUO-2 | BASE-T10, NOITE-1, SP-DUO | 14 | 12 |
| TEST-019 | DUO com frequência alta — ISRS contínuo | DUO-3 | BASE-T10, MOD-PAROX-10, NOITE-1, SP-DE, SP-DUO | 14 | 12 |
| TEST-020 | DUO refratária à paroxetina — DUO-4 | DUO-4 | BASE-T10, MOD-PAROX-20, SP-DUO-1J, NOITE-1 | 14 | 12 |
| TEST-021 | DUO com ISRS em uso — EP por via tópica | DUO-TOPICO | BASE-T10, NOITE-1, SP-DE | 14 | 12 |
| TEST-022 | Hipogonadismo primário (LH 12) | HIPOGONADISMO PRIMÁRIO | — | — | — |
| TEST-023 | Hipogonadismo secundário (LH 4) | HIPOGONADISMO SECUNDÁRIO | — | — | — |
| TEST-024 | Hipogonadismo com testosterona em uso — eixo suprimido | EIXO SUPRIMIDO — REPETIR APÓS WASHOUT | — | — | — |
| TEST-025 | Hipogonadismo com hematócrito 54,5 — bloqueio | REPOSIÇÃO CONTRAINDICADA | — | — | — |
| TEST-026 | Hipogonadismo sem diagnóstico fechado | DIAGNÓSTICO A CONFIRMAR | — | — | — |
| TEST-027 | Preenchimento — avaliação inicial | AVALIAÇÃO — procedimento não realizado | — | — | — |
| TEST-028 | Emagrecimento — encaminhamento | Encaminhado ao especialista em emagrecimento | — | — | — |
| TEST-029 | Consulta urológica — só registro | Consulta urológica — prontuário da clínica | — | — | — |
| R-01 | Reavaliação DE: IIEF subiu 4 — manter | DE-2 (mantido) | BASE-T10, NOITE-1, SP-DE | 16 | — |
| R-02 | Reavaliação DE: IIEF subiu 1 — subir BASE | DE-2 | BASE-T10, NOITE-1, SP-DE, ONDAS | 13 | — |
| R-03 | Reavaliação DE: IIEF sem ganho — trocar mecanismo | DE-2 | BASE-T10, NOITE-1, SP-DE, ONDAS | 12 | — |
| R-04 | Reavaliação DE com baixa adesão — não escalonar | DE-2 (mantido) | BASE-T10, NOITE-1, SP-DE | 12 | — |
| R-05 | Reavaliação EP: PEDT caiu 4 — manter | EP-1 (mantido) | SP-DUO, NOITE-1 | — | 10 |
