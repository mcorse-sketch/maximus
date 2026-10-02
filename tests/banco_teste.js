// Banco de TESTE fictício e realista — 40 pacientes para o Dr. Marco testar
// histórico e recepção no servidor da clínica.
//
//   node tests/banco_teste.js            gera data/banco_teste.json
//   node tests/banco_teste.js --conferir confere se o arquivo ainda é o que o
//       app produz hoje (protocolo, kit e escores de cada consulta) — etapa 7f
//   python3 servidor_maximus.py --carregar-teste    carrega no banco (mescla,
//       não apaga nada real; datas trazidas para hoje; backup antes)
//   python3 servidor_maximus.py --apagar-ficticios  remove todos depois
//
// Cada consulta é atendida pelo PRÓPRIO app clínico (executor da regressão,
// tests/regressao.js), com o relógio do app posto na data da consulta: o
// protocolo, o kit, os escores, os alertas e o texto são exatamente o que o
// app grava. Os questionários da recepção seguem o formato que
// apps/recepcao.html grava. Nada é escrito à mão na conduta.
//
// Coorte roteirizada (não sorteada), na proporção do consultório:
// 14 DE, 8 EP, 6 DE+EP, 4 preenchimento, 3 TEFI, 5 casos de segurança.
// Metade com 2–3 consultas e evolução de IIEF/PEDT plausível; 8 na fila da
// recepção de hoje (3 novos, 5 retornos). Códigos MX9101–MX9140, iniciais
// inventadas, telefones (21)90000-91xx e emails @exemplo.invalid. Todo
// registro leva demo:true — o servidor sabe que é fictício.
const fs = require('fs');
const path = require('path');
const { roda } = require('./regressao');

const RAIZ = path.join(__dirname, '..');
const SAIDA = path.join(RAIZ, 'data', 'banco_teste.json');
const CONFERIR = process.argv.includes('--conferir');
const DIA = 86400000;

// ---------- utilidades -------------------------------------------------------
const dia = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const br = d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
const hhmm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
function quando(hoje, diasAtras, hora) {
  const [h, m] = hora.split(':').map(Number);
  const d = new Date(hoje.getTime() - diasAtras * DIA); d.setHours(h, m, 0, 0); return d;
}
// IIEF-5: 5 itens de 1 a 5 (total 5–25); PEDT: 5 itens de 0 a 4 (total 0–20)
function iief(t) { const b = Math.floor(t / 5), r = t % 5; const v = [0, 1, 2, 3, 4].map(k => b + (k < r ? 1 : 0)); return { i0: v[0], i1: v[1], i2: v[2], i3: v[3], i4: v[4] }; }
function pedt(t) { const b = Math.floor(t / 5), r = t % 5; const v = [0, 1, 2, 3, 4].map(k => Math.min(4, b + (k < r ? 1 : 0))); return { p0: v[0], p1: v[1], p2: v[2], p3: v[3], p4: v[4] }; }
const soma = (o, ks) => ks.every(k => o[k] != null) ? ks.reduce((s, k) => s + Number(o[k]), 0) : null;
const KI = ['i0', 'i1', 'i2', 'i3', 'i4'], KP = ['p0', 'p1', 'p2', 'p3', 'p4'];

// relógio do app na data da consulta: hoje, diasDesde, retorno — tudo coerente
function relogio(alvo) {
  return w => {
    const R = w.Date, off = alvo.getTime() - R.now();
    function D(...a) { if (!new.target) return new D().toString(); return a.length ? new R(...a) : new R(R.now() + off); }
    D.prototype = R.prototype; D.now = () => R.now() + off; D.parse = R.parse; D.UTC = R.UTC;
    w.Date = D;
  };
}

// ---------- respostas ----------------------------------------------------------
function primeira(queixa, extra) {
  const r = { visita: 'primeira', queixa,
    tempo: 'medio', parceira: 'fixa', comorb: ['nenhuma'], medsRisco: ['nenhuma'], alergia: ['nenhuma'], contra: 'nao',
    caracteriza: { mast: 'sim', matinal: 'nao' }, previa: 'nunca', adequado: 'sim', adam: ['nenhum'], testo: 'normal',
    contraIoim: 'nao', freq: 'alta', biotens: 22, topico: 'ambos', parox: 'nao', depre: 'nao', fert: 'nao' };
  return Object.assign(r, extra || {});
}
function reav(queixa, extra) {
  return Object.assign({ visita: 'reav', confirmHist: 'ok', queixa, adesao: 'total', ea: 'nao', confirmaEstavel: 'nao',
    satisfNps: { satisf: 8, nps: 9 } }, extra || {});
}
const DE = (t, x) => Object.assign(iief(t), x || {});
const EP = (t, x) => Object.assign(pedt(t), x || {});
const DUO = (a, b, x) => Object.assign(iief(a), pedt(b), x || {});

// ---------- coorte ---------------------------------------------------------------
// v: consultas clínicas, da mais antiga à mais recente
//    { d: dias atrás, h: hora, r: respostas, rec: extras do questionário da recepção }
// fila: questionário respondido HOJE na recepção, à espera do médico
const C = [];
const pac = (cod, cat, ini, idade, peso, altura, v, fila, nota) => C.push({ cod, cat, ini, idade, peso, altura, v, fila: fila || null, nota });

// ---- DE (14)
pac('MX9101', 'DE', 'ARF', 66, 88, 172, [
  { d: 248, h: '09:10', r: primeira('de', DE(7, { comorb: ['dm', 'has'], comorbCtrl: 'sim', comorbMed: 'sim', previa: 'falhou', adequado: 'sim', tempo: 'longo', caracteriza: { mast: 'nao', matinal: 'nao' } })) },
  { d: 170, h: '10:30', r: reav('de', DE(14, { satisfNps: { satisf: 7, nps: 8 } })) }
], null, 'DE grave, diabético, falha prévia a PDE5i → intracavernosa; melhora no retorno');
pac('MX9102', 'DE', 'CMS', 52, 91, 178, [
  { d: 310, h: '14:00', r: primeira('de', DE(10, { comorb: ['tabag'], comorbCtrl: 'parcial', comorbMed: 'nao' })) },
  { d: 236, h: '14:30', r: reav('de', DE(15, { satisfNps: { satisf: 7, nps: 8 } })) },
  { d: 150, h: '15:00', r: reav('de', DE(19, { satisfNps: { satisf: 9, nps: 10 } })) }
], null, 'DE moderada, tabagista; 10 → 15 → 19');
pac('MX9103', 'DE', 'JPL', 58, 95, 175, [
  { d: 205, h: '08:40', r: primeira('de', DE(9, { comorb: ['has'], comorbCtrl: 'sim', comorbMed: 'sim', medsRisco: ['beta'] })) },
  { d: 131, h: '09:00', r: reav('de', DE(11, { adesao: 'parcial', motivo: 'esq', satisfNps: { satisf: 5, nps: 7 } })) }
], null, 'DE moderada, betabloqueador; adesão parcial (esquecimento)');
pac('MX9104', 'DE', 'RTB', 47, 82, 180, [
  { d: 180, h: '11:00', r: primeira('de', DE(14)) },
  { d: 112, h: '11:15', r: reav('de', DE(15, { satisfNps: { satisf: 5, nps: 7 } })) }
], null, 'DE leve-moderada; resposta insuficiente com adesão total');
pac('MX9105', 'DE', 'LGV', 44, 79, 176, [
  { d: 140, h: '16:00', r: primeira('de', DE(13)) },
  { d: 78, h: '16:20', r: reav('de', DE(17, { ea: 'atrap', satisfNps: { satisf: 6, nps: 8 } })) }
], null, 'DE leve-moderada; melhora, mas efeito adverso que atrapalhou');
pac('MX9106', 'DE', 'TAN', 29, 74, 181, [
  { d: 96, h: '18:00', r: primeira('de', DE(19, { tempo: 'curto', caracteriza: { mast: 'sim', matinal: 'sim' }, parceira: 'eventual' })) }
], null, 'DE leve em jovem, perfil psicogênico');
pac('MX9107', 'DE', 'EMC', 55, 86, 170, [
  { d: 350, h: '10:00', r: primeira('de', DE(18, { comorb: ['disl'], comorbCtrl: 'sim', comorbMed: 'sim' })) },
  { d: 280, h: '10:00', r: reav('de', DE(22, { satisfNps: { satisf: 9, nps: 10 } })) },
  { d: 196, h: '10:20', r: reav('de', DE(23, { satisfNps: { satisf: 10, nps: 10 } })) }
], null, 'DE leve; 18 → 22 → 23, estável');
pac('MX9108', 'DE', 'OBF', 50, 112, 174, [
  { d: 60, h: '13:30', r: primeira('de', DE(16, { comorb: ['obes'], comorbCtrl: 'parcial', comorbMed: 'nao' })) }
], null, 'DE leve-moderada com obesidade');
pac('MX9109', 'DE', 'HSD', 49, 84, 177, [
  { d: 45, h: '15:40', r: primeira('de', DE(12, { adam: ['a1', 'a2', 'a7'], testo: 'normal' })) }
], null, 'DE com libido baixa e testosterona normal');
pac('MX9110', 'DE', 'GIP', 38, 77, 183, [
  { d: 33, h: '09:30', r: primeira('de', DE(21)) }
], null, 'DE leve');
pac('MX9111', 'DE', 'NCR', 68, 90, 168, [
  { d: 120, h: '08:20', r: primeira('de', DE(6, { comorb: ['dm', 'has'], comorbCtrl: 'nao', comorbMed: 'sim', tempo: 'longo', caracteriza: { mast: 'nao', matinal: 'nao' } })) }
], null, 'DE grave, diabetes descompensado');
pac('MX9112', 'DE', 'VSO', 53, 87, 179, [
  { d: 62, h: '10:40', r: primeira('de', DE(15, { comorb: ['has'], comorbCtrl: 'sim', comorbMed: 'sim' })) }
], { h: '08:10', q: 'de', iief: 19, uso: 'total', efeito: 'nao', satisf: 8 }, 'DE; retorno na fila de hoje');
pac('MX9113', 'DE', 'PAL', 61, 85, 171, [], { h: '09:05', q: 'de', iief: 11, novo: true }, 'DE; paciente NOVO na fila de hoje');
pac('MX9114', 'DE', 'BRM', 42, 80, 182, [
  { d: 25, h: '17:10', r: primeira('de', DE(17, { previa: 'func' })) }
], null, 'DE leve, já usou PDE5i com resposta');

// ---- EP (8)
pac('MX9115', 'EP', 'FDS', 34, 76, 178, [
  { d: 290, h: '19:00', r: primeira('ep', EP(15)) },
  { d: 220, h: '19:00', r: reav('ep', EP(10, { satisfNps: { satisf: 7, nps: 9 } })) },
  { d: 150, h: '18:40', r: reav('ep', EP(7, { satisfNps: { satisf: 9, nps: 10 } })) }
], null, 'EP; PEDT 15 → 10 → 7');
pac('MX9116', 'EP', 'ICT', 41, 83, 175, [
  { d: 160, h: '12:00', r: primeira('ep', EP(12, { freq: 'baixa' })) },
  { d: 95, h: '12:10', r: reav('ep', EP(9, { satisfNps: { satisf: 8, nps: 9 } })) }
], null, 'EP com frequência baixa');
pac('MX9117', 'EP', 'MAV', 37, 88, 186, [
  { d: 200, h: '17:30', r: primeira('ep', EP(18, { tempo: 'longo' })) },
  { d: 134, h: '17:30', r: reav('ep', EP(15, { satisfNps: { satisf: 5, nps: 6 } })) }
], null, 'EP grave; resposta parcial no retorno');
pac('MX9118', 'EP', 'SLB', 27, 70, 174, [
  { d: 52, h: '20:00', r: primeira('ep', EP(11, { freq: 'baixa', topico: 'so_preserv', parceira: 'eventual' })) }
], null, 'EP leve, prefere preservativo');
pac('MX9119', 'EP', 'DCG', 45, 92, 180, [
  { d: 75, h: '11:45', r: primeira('ep', EP(13)) }
], null, 'EP moderada');
pac('MX9120', 'EP', 'RPN', 39, 81, 177, [
  { d: 230, h: '16:00', r: primeira('ep', EP(16)) },
  { d: 160, h: '16:15', r: reav('ep', EP(12, { ea: 'leve', satisfNps: { satisf: 7, nps: 8 } })) }
], null, 'EP; efeito adverso leve no retorno');
pac('MX9121', 'EP', 'AJT', 33, 78, 179, [
  { d: 70, h: '18:20', r: primeira('ep', EP(14)) }
], { h: '10:15', q: 'ep', pedt: 9, uso: 'parcial', efeito: 'leve', satisf: 7 }, 'EP; retorno na fila de hoje');
pac('MX9122', 'EP', 'LMO', 30, 73, 172, [], { h: '10:50', q: 'ep', pedt: 13, novo: true }, 'EP; paciente NOVO na fila de hoje');

// ---- DE + EP (6)
pac('MX9123', 'DUO', 'CEF', 48, 89, 176, [
  { d: 330, h: '09:00', r: primeira('ambos', DUO(12, 14)) },
  { d: 262, h: '09:20', r: reav('ambos', DUO(16, 10, { satisfNps: { satisf: 7, nps: 8 } })) },
  { d: 190, h: '09:00', r: reav('ambos', DUO(20, 7, { satisfNps: { satisf: 9, nps: 10 } })) }
], null, 'DUO; IIEF 12→16→20, PEDT 14→10→7');
pac('MX9124', 'DUO', 'GTR', 43, 84, 181, [
  { d: 150, h: '14:40', r: primeira('ambos', DUO(16, 11)) },
  { d: 85, h: '15:00', r: reav('ambos', DUO(18, 10, { adesao: 'baixa', motivo: 'naoprec', satisfNps: { satisf: 6, nps: 7 } })) }
], null, 'DUO; adesão baixa ("não achou necessário")');
pac('MX9125', 'DUO', 'PHS', 57, 93, 173, [
  { d: 215, h: '10:10', r: primeira('ambos', DUO(9, 17, { comorb: ['has', 'disl'], comorbCtrl: 'sim', comorbMed: 'sim' })) },
  { d: 145, h: '10:10', r: reav('ambos', DUO(13, 12, { satisfNps: { satisf: 7, nps: 8 } })) }
], null, 'DUO moderado, hipertenso');
pac('MX9126', 'DUO', 'NBA', 36, 79, 184, [
  { d: 40, h: '19:30', r: primeira('ambos', DUO(18, 12)) }
], null, 'DUO leve');
pac('MX9127', 'DUO', 'OVC', 46, 86, 177, [
  { d: 66, h: '11:20', r: primeira('ambos', DUO(14, 15)) }
], { h: '11:25', q: 'ambos', iief: 17, pedt: 11, uso: 'total', efeito: 'nao', satisf: 7 }, 'DUO; retorno na fila de hoje');
pac('MX9128', 'DUO', 'TSM', 51, 90, 175, [], { h: '11:40', q: 'ambos', iief: 13, pedt: 14, novo: true }, 'DUO; paciente NOVO na fila de hoje');

// ---- preenchimento (4)
const PRE1 = (ml, x) => Object.assign({ visita: 'primeira', queixa: 'preench', tipoPenis: 'grower', medPre: { compFlac: '9', diamFlac: '9' },
  prepucio: 'medio', retracao: 'leve', plano: { previsaoML: '6a8', planoBotox: 'nao' }, concordou: 'sim', termo: 'sim',
  medPos: { compPos: '10', diamPos: '11' }, mlUsado: ml, botox: 'nao', marcaAH: 'Rennova Shape Lido (seringa 2 mL)', notaMedico: 8 }, x || {});
const PRE_RET = x => Object.assign({ visita: 'reav', confirmHist: 'ok', queixa: 'preench', medRet: { compRet: '10', diamRet: '11' },
  retracaoRet: 'ausente', nodulos: 'nao', notaMedicoRet: 8, satisfPac: 8, conduta: 'nada' }, x || {});
pac('MX9129', 'preenchimento', 'KWE', 35, 80, 178, [
  { d: 128, h: '13:00', r: PRE1('8 mL') },
  { d: 106, h: '13:30', r: PRE_RET({ conduta: 'retoque', aplicacao: { mlRetoque: '2 mL', marcaRetoque: 'Rennova Shape Lido' }, satisfPac: 7 }) }
], null, 'preenchimento 8 mL + retorno de 3 semanas com retoque');
pac('MX9130', 'preenchimento', 'DRZ', 40, 83, 180, [
  { d: 23, h: '14:00', r: PRE1('6 mL', { medPre: { compFlac: '8', diamFlac: '9' }, retracao: 'ausente' }) }
], { h: '09:40', q: 'preench', procedimento: true, reacoes: ['inchaco'], desconforto: 'leve', satisfPre: 8, diasProc: 23 }, 'preenchimento há 23 dias; retorno do procedimento na fila de hoje');
pac('MX9131', 'preenchimento', 'ELU', 44, 87, 176, [
  { d: 210, h: '15:00', r: PRE1('10 mL', { plano: { previsaoML: '8a10', planoBotox: 'nao' } }) },
  { d: 188, h: '15:20', r: PRE_RET({ nodulos: 'sim', conduta: 'hialuro', mlHialuro: '0,5 mL', satisfPac: 6, notaMedicoRet: 6 }) }
], null, 'preenchimento 10 mL; nódulo no retorno → hialuronidase');
pac('MX9132', 'preenchimento', 'FAG', 31, 72, 173, [
  { d: 18, h: '16:30', r: { visita: 'primeira', queixa: 'preench', tipoPenis: 'shower', medPre: { compFlac: '10', diamFlac: '10' }, prepucio: 'ausente', retracao: 'ausente', plano: { previsaoML: 'ate6', planoBotox: 'nao' }, concordou: 'nao' } }
], null, 'avaliação para preenchimento, sem procedimento');

// ---- TEFI (3) — "TAF" não existe no app; TEFI é o teste em consultório mais próximo
const TEFI = x => Object.assign({ visita: 'reav', confirmHist: 'ok', queixa: 'tefi', tefiMed: 'R5 (trimix clássico) — padrão da clínica',
  tefiDose: '0,1 mL — padrão da clínica', tefiFinal: { dorGrau: 0, dorQuando: 'na', curvGrau: 'nao' } }, x || {});
pac('MX9133', 'TEFI', 'UMB', 63, 89, 174, [
  { d: 270, h: '08:30', r: primeira('de', DE(8, { comorb: ['dm', 'has'], comorbCtrl: 'sim', comorbMed: 'sim', previa: 'falhou', adequado: 'sim', caracteriza: { mast: 'nao', matinal: 'nao' }, tempo: 'longo' })) },
  { d: 248, h: '08:00', r: TEFI({ t10grau: 4, t20grau: 4, t30grau: 3, dopplerFeito: 'sim', doppler: { psv: '23', edv: '2', ir: '0,93' } }) },
  { d: 180, h: '08:30', r: reav('de', DE(12, { tefiFeito: 'sim', tefiResp: 'completa', tefiDoppler: 'arterial', tefiConduta: 'ondas', satisfNps: { satisf: 7, nps: 8 } })) }
], null, 'DE grave → TEFI positivo com insuficiência arterial (PSV 23) → ondas de choque');
pac('MX9134', 'TEFI', 'WCA', 59, 94, 177, [
  { d: 120, h: '09:30', r: primeira('de', DE(7, { previa: 'falhou', adequado: 'sim', comorb: ['tabag', 'has'], comorbCtrl: 'parcial', comorbMed: 'sim', caracteriza: { mast: 'nao', matinal: 'nao' } })) },
  { d: 99, h: '08:00', r: TEFI({ t10grau: 1, t20grau: 2, doseComp: 'sim', doseCompML: '0,1 mL', t30grau: 2, dopplerFeito: 'sim', doppler: { psv: '34', edv: '7', ir: '0,71' } }) }
], null, 'DE grave → TEFI negativo, escape venoso');
pac('MX9135', 'TEFI', 'YRP', 54, 85, 179, [
  { d: 88, h: '10:45', r: primeira('de', DE(10, { previa: 'falhou', adequado: 'sim', caracteriza: { mast: 'nao', matinal: 'sim' } })) },
  { d: 70, h: '08:15', r: TEFI({ t10grau: 4, t20grau: 4, t30grau: 4, dopplerFeito: 'nao' }) }
], null, 'DE moderada, falha a PDE5i → TEFI positivo sem Doppler');

// ---- segurança (5)
pac('MX9136', 'segurança · nitrato', 'IGH', 71, 81, 169, [
  { d: 55, h: '09:50', r: primeira('de', DE(11, { contra: 'sim', comorb: ['vasc', 'has'], comorbCtrl: 'sim', comorbMed: 'sim', tempo: 'longo' })) }
], null, 'DE em uso de nitrato → bloqueio da tadalafila');
pac('MX9137', 'segurança · alergia a lidocaína', 'BPE', 38, 78, 180, [
  { d: 140, h: '18:00', r: primeira('ep', EP(14, { alergia: ['anest'] })) },
  { d: 72, h: '18:10', r: reav('ep', EP(11, { satisfNps: { satisf: 7, nps: 8 } })) }
], { h: '08:35', q: 'ep', pedt: 9, uso: 'total', efeito: 'nao', satisf: 8 }, 'EP com alergia a lidocaína/prilocaína/benzocaína; retorno na fila de hoje');
pac('MX9138', 'segurança · bipolar', 'JTF', 35, 84, 176, [
  { d: 30, h: '17:00', r: primeira('ep', EP(16, { depre: 'sim', medsRisco: ['antipsic'] })) }
], null, 'EP em paciente com transtorno bipolar (quetiapina, acompanhamento psiquiátrico)');
pac('MX9139', 'segurança · risco CV alto', 'LKN', 64, 101, 172, [
  { d: 190, h: '08:50', r: primeira('de', DE(9, { comorb: ['has', 'dm', 'disl', 'vasc', 'tabag'], comorbCtrl: 'nao', comorbMed: 'sim', tempo: 'longo', caracteriza: { mast: 'nao', matinal: 'nao' } })) },
  { d: 118, h: '09:00', r: reav('de', DE(12, { adesao: 'parcial', motivo: 'ea', ea: 'leve', satisfNps: { satisf: 6, nps: 7 } })) }
], null, 'DE com risco cardiovascular alto (coronariopata, DM, HAS e tabagismo não controlados)');
pac('MX9140', 'segurança · testosterona limítrofe', 'MCD', 56, 98, 175, [
  { d: 112, h: '11:30', r: primeira('de', DE(13, { adam: ['a1', 'a2', 'a3', 'a7'], testo: 'baixa' })) },
  // v2.4: o ADAM do retorno é a evolução dos sintomas da primeira avaliação (antes,
  // reaplicado e respondido "nenhum"): os quatro melhoraram — mesmo ADAM de hoje
  { d: 48, h: '11:40', r: reav('de', DE(15, { examesFeitos: 'sim', labs: { tTotal: 290, tLivre: 55, lh: 4.5 }, satisfNps: { satisf: 6, nps: 8 },
    adamEvol: { adamEv_a1: 'sim', adamEv_a2: 'sim', adamEv_a3: 'sim', adamEv_a7: 'sim', adamNovo: 'nao' } })) }
], null, 'DE com libido baixa e testosterona na zona cinzenta (290 ng/dL, livre 55 pg/mL)');

// ---------- registros --------------------------------------------------------------
const contato = p => ({ iniciais: p.ini, telefone: '(21)90000-' + p.cod.slice(2), email: 'teste' + p.cod.slice(2) + '@exemplo.invalid' });
const medidas = p => ({ idade: p.idade, peso: p.peso, altura: p.altura, cintura: null, imc: +(p.peso / Math.pow(p.altura / 100, 2)).toFixed(1) });
const QREC = { de: 'de', ep: 'ep', ambos: 'ambos', preench: 'preench', tefi: 'de', hipo: 'libido' };

function carimba(reg, d) {
  reg.data = d.toISOString(); reg.dataLocal = dia(d); reg.dataBR = br(d); reg.demo = true; return reg;
}
// registro no formato de apps/recepcao.html (enviar())
function recepcao(p, d, o) {
  const c = contato(p);
  const resp = {};
  if (o.iief != null) Object.assign(resp, iief(o.iief));
  if (o.pedt != null) Object.assign(resp, pedt(o.pedt));
  const reg = { hora: hhmm(d), codigo: p.cod, tipo: 'recepcao', linha: 'recepcao',
    iniciais: c.iniciais, telefone: c.telefone, email: c.email,
    queixaRecepcao: o.q, iief: soma(resp, KI), pedt: soma(resp, KP), adam: o.adam || [],
    dificuldade: o.revisar ? 'sim' : 'nao', revisar: !!o.revisar, medidas: medidas(p),
    leuTermo: !!o.leuTermo,
    retornoPreench: o.procedimento ? { reacoes: o.reacoes || [], desconforto: o.desconforto || null,
      satisfacao: o.satisfPre == null ? null : o.satisfPre, diasDesdeProcedimento: o.diasProc == null ? null : o.diasProc } : null,
    retorno: !!o.retorno, diasDesdeUltima: o.retorno ? o.diasUlt : null,
    usoRelatado: o.uso || null, efeitoRelatado: o.efeito || null, satisfRelatada: o.satisf == null ? null : o.satisf,
    autorrelato: null,
    respostas: Object.assign({ i0: undefined, i1: undefined, i2: undefined, i3: undefined, i4: undefined, p0: undefined, p1: undefined, p2: undefined, p3: undefined, p4: undefined }, resp) };
  reg.respostas = JSON.parse(JSON.stringify(reg.respostas));
  return carimba(reg, d);
}

(async () => {
  const hoje = new Date();
  const pacientes = {};
  const resumo = [];
  let falhas = 0;
  for (const p of C) {
    const regs = [];
    let ultimaClin = null;
    for (let k = 0; k < p.v.length; k++) {
      const v = p.v[k];
      const d = quando(hoje, v.d, v.h);
      const r = v.r;
      // questionário da recepção, 15 min antes da consulta (o TEFI é agendado: sem questionário)
      if (r.queixa !== 'tefi') {
        const dr = new Date(d.getTime() - 15 * 60000);
        const o = { q: QREC[r.queixa] || r.queixa, retorno: k > 0, diasUlt: ultimaClin ? Math.round((d - ultimaClin) / DIA) : null,
          iief: soma(r, KI), pedt: soma(r, KP), adam: (r.adam || []).filter(a => a !== 'nenhum'), leuTermo: r.queixa === 'preench' && k === 0 };
        if (k > 0 && r.visita === 'reav' && r.queixa !== 'preench') Object.assign(o, { uso: r.adesao || 'total', efeito: r.ea || 'nao', satisf: (r.satisfNps || {}).satisf });
        if (r.queixa === 'preench' && k > 0) Object.assign(o, { procedimento: true, reacoes: r.nodulos === 'sim' ? ['nodulo'] : [], desconforto: 'leve', satisfPre: r.satisfPac, diasProc: Math.round((d - ultimaClin) / DIA) });
        regs.push(recepcao(p, dr, o));
      }
      const c = contato(p);
      const resp = Object.assign({ contato: { iniciais: c.iniciais, telefone: c.telefone, email: c.email } }, r);
      const res = await roda({ id: p.cod, codigo: p.cod, respostas: resp, ciclos: regs.slice() }, true, { antes: relogio(d) });
      if (res.falha || !res.salvo) {
        falhas++;
        console.log('  FALHOU ' + p.cod + ' consulta ' + (k + 1) + ': ' + (res.falha || 'sem registro') + (res.erros.length ? ' | ' + res.erros[0] : '') + '\n    caminho: ' + res.caminho.slice(-8).join(' > '));
        break;
      }
      if (res.erros.length) { falhas++; console.log('  ERRO JS ' + p.cod + ' consulta ' + (k + 1) + ': ' + res.erros.slice(0, 2).join(' | ')); }
      const reg = carimba(Object.assign({}, res.salvo), d);
      regs.push(reg);
      ultimaClin = d;
    }
    if (p.fila) {
      const f = p.fila;
      const d = quando(hoje, 0, f.h);
      const o = { q: f.q, retorno: !f.novo, diasUlt: ultimaClin ? Math.round((d - ultimaClin) / DIA) : null,
        iief: f.iief, pedt: f.pedt, uso: f.novo || f.procedimento ? null : f.uso, efeito: f.novo || f.procedimento ? null : f.efeito,
        satisf: f.novo || f.procedimento ? null : f.satisf, adam: f.adam, leuTermo: false, revisar: f.revisar,
        procedimento: f.procedimento, reacoes: f.reacoes, desconforto: f.desconforto, satisfPre: f.satisfPre, diasProc: f.diasProc };
      regs.push(recepcao(p, d, o));
    }
    regs.sort((a, b) => String(a.data).localeCompare(String(b.data)));
    pacientes[p.cod] = regs;
    const clin = regs.filter(x => x.tipo !== 'recepcao');
    resumo.push({ cod: p.cod, cat: p.cat, ini: p.ini, consultas: clin.length, fila: p.fila ? (p.fila.novo ? 'novo' : 'retorno') : '',
      evolucao: clin.map(x => x.protocolo + (x.iief != null ? ' IIEF ' + x.iief : '') + (x.pedt != null ? ' PEDT ' + x.pedt : '')).join(' → '), nota: p.nota });
    console.log('  ' + p.cod + ' ' + p.cat.padEnd(32) + ' ' + clin.length + ' consulta(s)' + (p.fila ? ' + fila (' + (p.fila.novo ? 'novo' : 'retorno') + ')' : '') + '  ' + resumo[resumo.length - 1].evolucao);
  }
  if (falhas) { console.error('\n' + falhas + ' consulta(s) falharam — banco NÃO gravado.'); process.exit(1); }
  if (CONFERIR) {
    const assin = rs => rs.filter(r => r.tipo !== 'recepcao').map(r => [r.tipo, r.protocolo, (r.kitCodes || []).join(','), r.iief, r.pedt].join(' | '));
    const arq = JSON.parse(fs.readFileSync(SAIDA, 'utf8'));
    let dif = 0;
    for (const cod of new Set(Object.keys(arq.pacientes).concat(Object.keys(pacientes)))) {
      const a = assin(arq.pacientes[cod] || []), b = assin(pacientes[cod] || []);
      if (JSON.stringify(a) !== JSON.stringify(b)) { dif++; console.log('  MUDOU ' + cod + '\n    arquivo: ' + a.join(' → ') + '\n    app:     ' + b.join(' → ')); }
    }
    console.log(dif ? '\n' + dif + ' paciente(s) do banco de teste não batem com o app — rode: node tests/banco_teste.js' : '\nbanco de teste confere com o app (40 pacientes)');
    process.exit(dif ? 1 : 0);
  }
  const saida = { versao: 1, descricao: 'Banco de teste fictício (40 pacientes, MX9101–MX9140). Carregar com: python3 servidor_maximus.py --carregar-teste',
    referencia: dia(hoje), geradoEm: hoje.toISOString(), pacientes, resumo };
  fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1) + '\n');
  const nfila = Object.values(pacientes).filter(rs => rs.some(r => r.tipo === 'recepcao' && r.dataLocal === dia(hoje))).length;
  console.log('\n' + Object.keys(pacientes).length + ' pacientes, ' + Object.values(pacientes).reduce((s, rs) => s + rs.length, 0) + ' registros, ' + nfila + ' na fila de hoje → ' + path.relative(RAIZ, SAIDA));
})();
