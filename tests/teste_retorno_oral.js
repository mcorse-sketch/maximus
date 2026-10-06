// v2.5-L — retorno oral DE/DUO pela regra do nível ANTERIOR (opção B do Dr. Marco).
//   ganho ≥ 4          → mantém o nível oral anterior (BASE-T e protocolo), nunca reduz
//   ganho de 1 a 3     → sobe um nível a partir do anterior (o kit muda de verdade)
//   ... e já em 22+    → objetivo atingido: mantém, sem subir
//   sem ganho          → troca de mecanismo, sem reduzir o nível
//   teto (BASE-T20)    → não sobe mais; teto de escalonamento + TEFI
//   travado (adesão)   → cápsula fica no nível anterior, nem sobe nem desce
//   intracavernosa     → regra não se aplica (nunca regride)
// Confere kit, protocolo, "Mudança deste ciclo" e a pílula — os três têm de dizer a mesma coisa —
// e o teto de 30 mg/dia de tadalafila nas notas.
//
// Uso: node teste_retorno_oral.js   (usa apps/triagem.html, o mesmo executor da regressão)
const { roda } = require('./regressao');

let falhas = 0;
const ok = (cond, nome, extra) => {
  console.log((cond ? '  ok     ' : '  FALHA  ') + nome + (!cond && extra ? '\n         ' + extra : ''));
  if (!cond) falhas++;
};
function iief(t) { const b = Math.floor(t / 5), r = t % 5; const v = [0, 1, 2, 3, 4].map(k => b + (k < r ? 1 : 0)); return { i0: v[0], i1: v[1], i2: v[2], i3: v[3], i4: v[4] }; }
function pedt(t) { const v = [0, 0, 0, 0, 0]; let r = t; for (let k = 0; k < 5 && r > 0; k++) { const a = Math.min(4, r); v[k] += a; r -= a; } return { p0: v[0], p1: v[1], p2: v[2], p3: v[3], p4: v[4] }; }
const DE = (prot, base, ant) => ({ tipo: 'primeira', linha: 'DE', protocolo: prot, kitCodes: [base, 'NOITE-1', 'SP-DE'], iief: ant });
const DUO = (prot, base, ant, pAnt) => ({ tipo: 'primeira', linha: 'DUO', protocolo: prot, kitCodes: [base, 'NOITE-1', 'SP-DUO'], iief: ant, pedt: pAnt });
const BASE = kit => (kit || []).find(c => /^BASE-T/.test(c)) || null;

async function caso(id, hoje, prev, mais, pedtHoje) {
  const resp = Object.assign({ visita: 'reav', confirmHist: 'ok', adesao: 'total', ea: 'nao', trocarQueixa: 'nao' },
    iief(hoje), pedtHoje != null ? pedt(pedtHoje) : {}, mais || {});
  const r = await roda({ id, codigo: 'RO' + id, respostas: resp, ciclos: [prev] }, true);
  const s = r.salvo || {};
  const linhas = r.texto.split('\n');
  return { falha: r.falha, prot: s.protocolo || '', kit: s.kitCodes || [], base: BASE(s.kitCodes), mud: s.mudanca || '',
    pilula: linhas[2] || '', texto: r.texto };
}

(async () => {
  console.log('\n— ganho ≥ 4: mantém o nível anterior, nunca reduz');
  let c = await caso('G1', 19, DE('DE-2', 'BASE-T10', 15));
  ok(!c.falha, 'G1 chega à conduta', c.falha);
  ok(c.base === 'BASE-T10' && c.prot === 'DE-2 (mantido)', 'G1 IIEF 15 → 19 (+4, faixa leve): BASE-T10 e DE-2 mantidos (a faixa sozinha daria BASE-T5)', c.prot + ' ' + c.base);
  ok(/^Nenhuma — protocolo mantido$/.test(c.mud) && /protocolo mantido/.test(c.pilula), 'G1 mudança e pílula dizem "protocolo mantido"', c.mud + ' | ' + c.pilula);
  ok(!/reduzida|recalculad/.test(c.texto), 'G1 sem rótulo de dose reduzida/recalculada');
  c = await caso('G2', 22, DE('DE-1', 'BASE-T5', 18));
  ok(c.base === 'BASE-T5' && c.prot === 'DE-1 (mantido)', 'G2 IIEF 18 → 22 (sem disfunção hoje): continua DE-1 com BASE-T5, não suspende a cápsula', c.prot + ' ' + c.base);
  c = await caso('G3', 13, DE('DE-3', 'BASE-T20', 9));
  ok(c.base === 'BASE-T20' && /^DE-3/.test(c.prot), 'G3 IIEF 9 → 13 (+4): BASE-T20 mantido (a faixa daria BASE-T10)', c.prot + ' ' + c.base);

  console.log('\n— ganho de 1 a 3: sobe um nível a partir do anterior');
  c = await caso('P1', 17, DE('DE-1', 'BASE-T5', 15));
  ok(c.base === 'BASE-T10' && c.prot === 'DE-2', 'P1 IIEF 15 → 17 (+2) em BASE-T5: sobe para BASE-T10 / DE-2', c.prot + ' ' + c.base);
  ok(c.mud === 'Subir um nível de BASE' && /dose aumentada/.test(c.pilula), 'P1 mudança "Subir um nível de BASE" e pílula "dose aumentada"', c.mud + ' | ' + c.pilula);
  c = await caso('P2', 17, DE('DE-2', 'BASE-T10', 15));
  ok(c.base === 'BASE-T20' && c.prot === 'DE-3', 'P2 IIEF 15 → 17 (+2) em BASE-T10: sobe para BASE-T20 / DE-3 (antes descia para BASE-T5)', c.prot + ' ' + c.base);
  ok(/máximo 1 jato do SP-DE/.test(c.texto), 'P2 no nível 3: máximo 1 jato do SP-DE (teto de 30 mg/dia)');
  c = await caso('P3', 22, DE('DE-1', 'BASE-T5', 20));
  ok(c.base === 'BASE-T5' && c.prot === 'DE-1 (mantido)' && !/Subir/.test(c.mud), 'P3 IIEF 20 → 22 (+2, já sem disfunção): objetivo atingido — mantém BASE-T5, não sobe', c.prot + ' ' + c.base + ' | ' + c.mud);

  console.log('\n— sem ganho: troca de mecanismo, sem reduzir');
  c = await caso('S1', 15, DE('DE-2', 'BASE-T10', 15));
  ok(c.base === 'BASE-T10' && c.mud === 'Trocar mecanismo' && /mecanismo trocado/.test(c.pilula), 'S1 IIEF 15 → 15: BASE-T10, "Trocar mecanismo"', c.base + ' | ' + c.mud);

  console.log('\n— teto oral (BASE-T20): não sobe, indica o próximo passo');
  c = await caso('T1', 17, DE('DE-3', 'BASE-T20', 15));
  ok(c.base === 'BASE-T20' && c.kit.indexOf('TEFI') >= 0, 'T1 IIEF 15 → 17 em BASE-T20: fica em BASE-T20 e entra o TEFI', c.kit.join(','));
  ok(/Escalonar de mecanismo/.test(c.mud) && /saída da via oral/.test(c.pilula) && /Teto de escalonamento/.test(c.texto), 'T1 mudança/pílula/alerta de teto de escalonamento', c.mud + ' | ' + c.pilula);
  c = await caso('T2', 14, { tipo: 'primeira', linha: 'DUO', protocolo: 'DUO-1D', kitCodes: ['BASE-T20', 'NOITE-1', 'SP-DE'], iief: 12, pedt: 14 }, { freq: 'baixa' }, 8);
  ok(c.base === 'BASE-T20' && /Escalonar de mecanismo/.test(c.mud) && /Teto de escalonamento/.test(c.texto), 'T2 teto pela cápsula anterior (DUO-1D com BASE-T20, nome sem "3"): teto e TEFI', c.base + ' | ' + c.mud);
  ok(/no máximo 1 jato por dia somando SP-DE/.test(c.texto), 'T2 SP-DE + SP-DUO com BASE-T20: no máximo 1 jato por dia somando os dois');

  console.log('\n— linha DUO');
  c = await caso('D1', 16, DUO('DUO-2', 'BASE-T10', 14, 14), { freq: 'baixa' }, 12);
  ok(c.base === 'BASE-T20' && /^DUO-3/.test(c.prot) && c.mud === 'Subir um nível de BASE', 'D1 DUO-2 IIEF 14 → 16 (+2): sobe para BASE-T20 / DUO-3', c.prot + ' ' + c.base + ' | ' + c.mud);
  ok(/máximo 1 jato do SP-DUO/.test(c.texto), 'D1 DUO nível 3: máximo 1 jato do SP-DUO (teto de 30 mg/dia)');
  c = await caso('D2', 19, DUO('DUO-2', 'BASE-T10', 15, 14), { freq: 'baixa' }, 9);
  ok(c.base === 'BASE-T10' && c.prot === 'DUO-2 (mantido)', 'D2 DUO-2 IIEF 15 → 19 (+4): BASE-T10 mantido (a faixa daria BASE-T5)', c.prot + ' ' + c.base);

  console.log('\n— travas de segurança e intracavernosa');
  c = await caso('A1', 19, DE('DE-2', 'BASE-T10', 15), { adesao: 'baixa', motivo: 'esq' });
  ok(c.base === 'BASE-T10' && c.prot === 'DE-2 (mantido)', 'A1 adesão baixa, IIEF 15 → 19: cápsula fica em BASE-T10 (antes descia para BASE-T5 com rótulo "mantido")', c.prot + ' ' + c.base);
  c = await caso('A2', 9, DE('DE-2', 'BASE-T10', 12), { adesao: 'baixa', motivo: 'esq' });
  ok(c.base === 'BASE-T10' && c.prot === 'DE-2 (mantido)', 'A2 adesão baixa, IIEF 12 → 9: não escalona (antes subia para BASE-T20)', c.prot + ' ' + c.base);
  c = await caso('I1', 16, { tipo: 'primeira', linha: 'DE', protocolo: 'INTRACAVERNOSA', kitCodes: ['ICI', 'NOITE-1', 'TEFI'], iief: 7, iciAnterior: 'R5 (trimix clássico)', iciDosePrescrita: '0,1 mL' },
    { iciUso: { iciTempo: '1h' }, iciQual: { iciQualidade: '4', iciFreq: '1a2' } });
  ok(/^INTRACAVERNOSA/.test(c.prot) && c.kit.indexOf('ICI') >= 0 && !c.base, 'I1 intracavernosa, IIEF 7 → 16: continua intracavernosa, sem cápsula oral', c.prot + ' ' + c.kit.join(','));
  c = await caso('I2', 6, DE('DE-2', 'BASE-T10', 9));
  ok(c.kit.indexOf('ICI') >= 0, 'I2 oral que piora para a faixa grave (IIEF 9 → 6): a regra não segura no oral, vai à intracavernosa', c.prot + ' ' + c.kit.join(','));

  console.log('\n' + (falhas ? falhas + ' falha(s)' : 'retorno oral: tudo ok'));
  process.exit(falhas ? 1 : 0);
})();
