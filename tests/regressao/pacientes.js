// Pacientes da regressão clínica.
//
//   LIM-xxx  exatamente nos limites de cada faixa de corte
//   TEST-xxx caminhos clínicos (contraindicações, preferências, linhas)
//   R-xx     reavaliações
//
// `respostas` usa o id de cada tela (o mesmo `id` do build() do app).
// Na reavaliação, protocolo e escores anteriores vêm do banco (`ciclos`), não
// de resposta: o app não os pergunta.
// Tela não declarada recebe resposta neutra — ver tests/regressao.js.
// `espera` é regra clínica escrita à mão, a partir do CLAUDE.md: vale mesmo
// quando a baseline é regravada com --aprovar.

// IIEF-5: i0 vai de 1 a 5, i1..i4 de 0 a 5
function iief(total) {
  if (total < 1 || total > 25) throw new Error('IIEF fora de 1..25: ' + total);
  const v = [1, 0, 0, 0, 0]; let resto = total - 1;
  for (let k = 0; k < 5 && resto > 0; k++) { const add = Math.min(5 - v[k], resto); v[k] += add; resto -= add; }
  return { i0: v[0], i1: v[1], i2: v[2], i3: v[3], i4: v[4] };
}
// PEDT: p0..p4 de 0 a 4
function pedt(total) {
  if (total < 0 || total > 20) throw new Error('PEDT fora de 0..20: ' + total);
  const v = [0, 0, 0, 0, 0]; let resto = total;
  for (let k = 0; k < 5 && resto > 0; k++) { const add = Math.min(4, resto); v[k] += add; resto -= add; }
  return { p0: v[0], p1: v[1], p2: v[2], p3: v[3], p4: v[4] };
}

let n = 0;
const cod = () => 'RG' + String(++n).padStart(4, '0');
const P = (id, descricao, respostas, extra) =>
  Object.assign({ id, descricao, codigo: cod(), respostas: Object.assign({ visita: 'primeira' }, respostas) }, extra || {});

const de = (total, mais) => Object.assign({ queixa: 'de' }, iief(total), mais || {});
const ep = (total, mais) => Object.assign({ queixa: 'ep' }, pedt(total), mais || {});
const duo = (ti, tp, mais) => Object.assign({ queixa: 'ambos' }, iief(ti), pedt(tp), mais || {});

module.exports = [
  // ---- IIEF-5: todas as fronteiras de faixa ---------------------------------
  P('LIM-001', 'IIEF 7 — faixa severa', de(7), { espera: { protocolo: 'INTRACAVERNOSA', iief: 7 } }),
  P('LIM-002', 'IIEF 8 — faixa moderada', de(8), { espera: { iief: 8 } }),
  P('LIM-003', 'IIEF 11 — topo da moderada', de(11)),
  P('LIM-004', 'IIEF 12 — base da leve a moderada', de(12)),
  P('LIM-005', 'IIEF 16 — topo da leve a moderada', de(16)),
  P('LIM-006', 'IIEF 17 — base da leve', de(17)),
  P('LIM-007', 'IIEF 18 — acima do corte 17/18 do CLAUDE.md', de(18)),
  P('LIM-008', 'IIEF 21 — topo da leve', de(21)),
  P('LIM-009', 'IIEF 22 — sem disfunção', de(22)),

  // ---- PEDT: todas as fronteiras de faixa -----------------------------------
  P('LIM-010', 'PEDT 8 — EP improvável', ep(8, { freq: 'baixa' })),
  P('LIM-011', 'PEDT 9 — EP provável', ep(9, { freq: 'baixa' })),
  P('LIM-012', 'PEDT 10 — topo da provável', ep(10, { freq: 'baixa' })),
  P('LIM-013', 'PEDT 11 — EP confirmada', ep(11, { freq: 'baixa' })),
  P('LIM-014', 'PEDT 15 — topo da confirmada', ep(15, { freq: 'baixa' })),
  P('LIM-015', 'PEDT 16 — EP intensa', ep(16, { freq: 'baixa' })),

  // ---- biotensiômetro: vermelho < 10, verde 10–20, âmbar > 20 ---------------
  P('LIM-016', 'Biotensiômetro 9 — hipersensibilidade', ep(12, { freq: 'baixa', biotens: 9 })),
  P('LIM-017', 'Biotensiômetro 10 — base da faixa verde', ep(12, { freq: 'baixa', biotens: 10 })),
  P('LIM-018', 'Biotensiômetro 20 — topo da faixa verde', ep(12, { freq: 'baixa', biotens: 20 })),
  P('LIM-019', 'Biotensiômetro 21 — faixa âmbar', ep(12, { freq: 'baixa', biotens: 21 })),

  // ---- testosterona e ioimbina (corte 340) ----------------------------------
  P('LIM-020', 'Libido baixa, testosterona informada normal, sem contraindicação — ramo ioimbina',
    de(14, { adam: ['a1'], testo: 'normal', contraIoim: 'nao' }), { espera: { protocolo: 'DE-2L' } }),
  P('LIM-021', 'Libido baixa, testosterona baixa — sem ioimbina',
    de(14, { adam: ['a1'], testo: 'baixa' }), { espera: { protocolo: 'DE-2' } }),
  P('LIM-022', 'Libido baixa, testosterona não dosada — sem ioimbina por omissão',
    de(14, { adam: ['a1'], testo: 'nd' }), { espera: { protocolo: 'DE-2' } }),
  P('LIM-023', 'Libido baixa, testosterona normal, mas ansiedade/ISRS — sem ioimbina',
    de(14, { adam: ['a1'], testo: 'normal', contraIoim: 'sim' }), { espera: { protocolo: 'DE-2' } }),
  P('LIM-024', 'Reavaliação, libido baixa, testosterona 335 no banco — abaixo do corte',
    Object.assign({ visita: 'reav', confirmHist: 'ok' }, de(14, { adam: ['a1'] })),
    { ciclos: [{ tipo: 'primeira', linha: 'DE', protocolo: 'DE-2', kitCodes: ['BASE-T10', 'NOITE-1', 'SP-DE'], iief: 12, labs: { tTotal: '335' } }],
      espera: { protocolo: 'DE-2' } }),
  P('LIM-025', 'Reavaliação, libido baixa, testosterona 340 no banco — no corte, conta como normal',
    Object.assign({ visita: 'reav', confirmHist: 'ok' }, de(14, { adam: ['a1'], contraIoim: 'nao' })),
    { ciclos: [{ tipo: 'primeira', linha: 'DE', protocolo: 'DE-2', kitCodes: ['BASE-T10', 'NOITE-1', 'SP-DE'], iief: 12, labs: { tTotal: '340' } }],
      espera: { protocolo: 'DE-2L' } }),

  // ---- ondas de choque: só com doença arterial e/ou diabetes ----------------
  P('TEST-001', 'DE com diabetes — ondas no protocolo', de(14, { comorb: ['dm'] })),
  P('TEST-002', 'DE com doença arterial — ondas no protocolo', de(14, { comorb: ['vasc'] })),
  P('TEST-003', 'DE com hipertensão isolada — ondas só como complemento', de(14, { comorb: ['has'] })),
  P('TEST-004', 'DE sem comorbidade — sem ondas', de(14)),
  P('TEST-005', 'DE com nitrato — bloqueio da tadalafila', de(14, { contra: 'sim' }), { espera: { protocolo: 'BLOQUEIO' } }),
  P('TEST-006', 'DE com alergia a PDE5 — bloqueio da tadalafila', de(14, { alergia: ['tada'] }), { espera: { protocolo: 'BLOQUEIO' } }),
  P('TEST-007', 'DE com falha prévia em dose plena — TEFI', de(14, { previa: 'falhou', adequado: 'sim' })),

  // ---- fertilidade, EP e segurança serotoninérgica ---------------------------
  P('TEST-008', 'DE com desejo de engravidar — linha FERT', de(14, { fert: 'sim' }), { espera: { protocolo: 'FERT' } }),
  P('TEST-009', 'EP com frequência alta — paroxetina diária', ep(13, { freq: 'alta' })),
  P('TEST-010', 'EP intensa com frequência alta — paroxetina 20', ep(17, { freq: 'alta' })),
  P('TEST-011', 'EP refratária à paroxetina 20 — EP-4, limite de 1 jato', ep(13, { parox: 'sim' }), { espera: { protocolo: 'EP-4' } }),
  P('TEST-012', 'EP em uso de ISRS — só via tópica', ep(13, { freq: 'baixa', medsRisco: ['isrs'] })),
  P('TEST-013', 'EP com história psiquiátrica — sem SP-DUO', ep(13, { freq: 'baixa', depre: 'sim' })),
  P('TEST-014', 'EP com restrição a tópicos', ep(13, { freq: 'baixa', topico: 'nenhum' })),
  P('TEST-015', 'EP leve, frequência baixa, aceita preservativo — comportamental', ep(9, { freq: 'baixa', topico: 'ambos', biotens: 15 })),
  P('TEST-016', 'EP abaixo do corte — piso terapêutico', ep(5, { freq: 'baixa' })),
  P('TEST-017', 'DE abaixo do corte — piso terapêutico', de(23)),

  // ---- DUO ------------------------------------------------------------------
  P('TEST-018', 'DUO leve a moderada, frequência baixa', duo(14, 12, { freq: 'baixa' })),
  P('TEST-019', 'DUO com frequência alta — ISRS contínuo', duo(14, 12, { freq: 'alta' })),
  P('TEST-020', 'DUO refratária à paroxetina — DUO-4', duo(14, 12, { parox: 'sim' }), { espera: { protocolo: 'DUO-4' } }),
  P('TEST-021', 'DUO com ISRS em uso — EP por via tópica', duo(14, 12, { freq: 'baixa', medsRisco: ['isrs'] })),

  // ---- outras linhas ----------------------------------------------------------
  P('TEST-022', 'Hipogonadismo primário (LH 12)', {
    queixa: 'hipo', confirma: { duasDosagens: 'sim', sintomas: 'sim', reversiveis: 'sim' },
    labs: { tTotal: 250, lh: 12, ht: 45, psa: 1 } }),
  P('TEST-023', 'Hipogonadismo secundário (LH 4)', {
    queixa: 'hipo', confirma: { duasDosagens: 'sim', sintomas: 'sim', reversiveis: 'sim' },
    labs: { tTotal: 250, lh: 4, ht: 45, psa: 1 } }),
  P('TEST-024', 'Hipogonadismo com testosterona em uso — eixo suprimido', {
    queixa: 'hipo', confirma: { duasDosagens: 'sim', sintomas: 'sim', reversiveis: 'sim' },
    labs: { tTotal: 250, lh: 4, ht: 45, psa: 1 }, trtPrevio: 'atual' }),
  P('TEST-025', 'Hipogonadismo com hematócrito 54,5 — bloqueio', {
    queixa: 'hipo', confirma: { duasDosagens: 'sim', sintomas: 'sim', reversiveis: 'sim' },
    labs: { tTotal: 250, lh: 4, ht: 54.5, psa: 1 } }),
  P('TEST-026', 'Hipogonadismo sem diagnóstico fechado', {
    queixa: 'hipo', confirma: { duasDosagens: 'nao', sintomas: 'sim', reversiveis: 'sim' },
    labs: { tTotal: 300, lh: 4, ht: 45, psa: 1 } }),
  P('TEST-027', 'Preenchimento — avaliação inicial', { queixa: 'preench' }),
  P('TEST-028', 'Emagrecimento — encaminhamento', { queixa: 'emag' }),
  P('TEST-029', 'Consulta urológica — só registro', { queixa: 'uro' }),

  // ---- reavaliações ------------------------------------------------------------
  ...[['R-01', 'IIEF subiu 4 — manter', 16], ['R-02', 'IIEF subiu 1 — subir BASE', 13], ['R-03', 'IIEF sem ganho — trocar mecanismo', 12]]
    .map(([id, d, hoje]) => P(id, 'Reavaliação DE: ' + d,
      Object.assign({ visita: 'reav', confirmHist: 'ok', adesao: 'total', ea: 'nao' }, de(hoje)),
      { ciclos: [{ tipo: 'primeira', linha: 'DE', protocolo: 'DE-2', kitCodes: ['BASE-T10', 'NOITE-1', 'SP-DE'], iief: 12 }] })),
  P('R-04', 'Reavaliação DE com baixa adesão — não escalonar',
    Object.assign({ visita: 'reav', confirmHist: 'ok', adesao: 'baixa', motivo: 'esq', ea: 'nao' }, de(12)),
    { ciclos: [{ tipo: 'primeira', linha: 'DE', protocolo: 'DE-2', kitCodes: ['BASE-T10', 'NOITE-1', 'SP-DE'], iief: 12 }] }),
  P('R-05', 'Reavaliação EP: PEDT caiu 4 — manter',
    Object.assign({ visita: 'reav', confirmHist: 'ok', adesao: 'total', ea: 'nao' }, ep(10, { freq: 'baixa' })),
    { ciclos: [{ tipo: 'primeira', linha: 'EP', protocolo: 'EP-1', kitCodes: ['SP-DUO', 'NOITE-1'], pedt: 14 }] }),
];
