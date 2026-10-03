// Nenhuma sigla de fórmula ou protocolo aparece sozinha (v2.2, pedido do Dr. Marco).
// Leva cada paciente-limite da regressão até a conduta e confere, na tela de
// conduta, na folha do paciente, no texto do prontuário, no prontuário completo
// (gaveta) e no histórico, que toda sigla vem seguida do ativo com a dose.
// As siglas e as palavras-chave vêm do próprio app (window.__maximusSiglas).
//
// Uso: node teste_siglas.js [app]
const path = require('path');
const PACIENTES = require('./regressao/pacientes');
const SO_FIN = process.argv.includes('--so-financeiro');
const { roda, espera } = require('./regressao');

const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function textoDe(win, raiz) {
  if (!raiz) return '';
  const partes = [];
  const tw = win.document.createTreeWalker(raiz, win.NodeFilter.SHOW_TEXT, null);
  while (tw.nextNode()) {
    const n = tw.currentNode, pai = n.parentNode;
    if (pai && pai.closest && pai.closest('script,style,option,select,textarea')) continue;
    partes.push(n.nodeValue);
  }
  return partes.join(' ');
}

function soltas(win, txt) {
  const api = win.__maximusSiglas;
  const cods = api.codigos();
  const re = new RegExp('(?<![A-Za-z0-9\\-])(' + cods.map(c => c.replace(/[-/ ]/g, '\\$&')).join('|') + ')(?![A-Za-z0-9\\-])', 'g');
  const achou = [];
  const ms = [...txt.matchAll(re)];
  ms.forEach((m, i) => {
    const fim = m.index + m[1].length;
    let janela = txt.slice(fim, Math.min(fim + 240, i + 1 < ms.length ? ms[i + 1].index : txt.length));
    const q = janela.indexOf('\n'); if (q >= 0) janela = janela.slice(0, q);
    const j = semAcento(janela);
    const falta = api.chaves(m[1]).filter(k => j.indexOf(k) < 0);
    if (falta.length) achou.push(m[1] + ' → "' + txt.slice(Math.max(0, m.index - 30), fim + 60).replace(/\s+/g, ' ') + '"');
  });
  return achou;
}

(async () => {
  let problemas = 0, conferidos = 0;
  for (const p of (SO_FIN ? [] : PACIENTES)) {
    const r = await roda(p, true, { manter: true });
    if (!r.win) { console.log('  ?      ' + p.id + ' sem janela'); continue; }
    const win = r.win, doc = win.document;
    if (!win.__maximusSiglas) { console.log('  FALHA  app sem window.__maximusSiglas'); process.exit(1); }
    // o próprio conferidor precisa acusar uma sigla solta e aceitar a sigla com ativo
    if (p === PACIENTES[0]) {
      // v2.5: BASE-T20 (e BASE-T5/T10, MOD-PAROX-10/20, MOD-DAPO, MOD-CLOMI) já diz
      // substância e dose — não é sigla solta; SP-DE e EP-2 continuam sendo
      const a = soltas(win, 'Kit: BASE-T20 e SP-DE, depois EP-2.').length;
      const a2 = soltas(win, 'Kit: BASE-T5 e MOD-PAROX-10.').length;
      const b = soltas(win, 'Kit: BASE-T20 · tadalafila 20 mg e R7 · ' + win.__maximusSiglas.ativo('R7')).length;
      // intracavernosa: nome da substância sem a concentração não vale
      const c = soltas(win, 'Trocar para R8 (papaverina com fentolamina)').length;
      if (a !== 2 || a2 !== 0 || b !== 0 || c !== 1) { console.log('  FALHA  conferidor de siglas quebrado (' + a + ', ' + a2 + ', ' + b + ', ' + c + ')'); process.exit(1); }
      console.log('  ok     conferidor acusa sigla solta e aceita sigla com ativo');
    }
    const alvos = [];
    const res = doc.getElementById('resultsCard');
    if (res && res.style.display === 'block') {
      alvos.push(['conduta na tela e impressão', textoDe(win, doc.getElementById('printArea'))]);
      alvos.push(['folha do paciente', textoDe(win, doc.getElementById('printPaciente'))]);
      alvos.push(['texto do prontuário', win.__textoCopia || '']);
    }
    const fb = doc.getElementById('mxFicha');
    if (fb) { fb.click(); await espera(40); alvos.push(['prontuário (gaveta)', textoDe(win, doc.getElementById('fichaCorpo'))]); }
    const hb = doc.getElementById('histBtn');
    if (hb && hb.style.display !== 'none') { hb.click(); await espera(40); alvos.push(['histórico (gaveta)', textoDe(win, doc.getElementById('histCorpo'))]); }
    alvos.forEach(([onde, txt]) => {
      conferidos++;
      const s = soltas(win, txt);
      if (s.length) { problemas++; console.log('  FALHA  ' + p.id + ' · ' + onde); s.slice(0, 4).forEach(x => console.log('         ' + x)); }
    });
    win.close();
  }
  // o financeiro guarda uma cópia do mapa de ativos: tem de bater com o app clínico
  {
    const fs = require('fs');
    const { JSDOM, VirtualConsole } = require('jsdom');
    const abre = arq => new JSDOM(fs.readFileSync(path.join(__dirname, '../apps', arq), 'utf8'),
      { runScripts: 'dangerously', url: 'http://localhost/' + arq, virtualConsole: new VirtualConsole() });
    const t = abre('triagem.html'), f = abre('financeiro.html');
    await espera(600);
    const api = t.window.__maximusSiglas, fin = f.window.__maximusAtivoFin || {};
    const dif = api.codigos().filter(c => fin[c] !== api.ativo(c)).concat(Object.keys(fin).filter(c => !api.codigos().includes(c)));
    conferidos++;
    if (dif.length) { problemas++; console.log('  FALHA  financeiro.html: mapa ATIVO diferente do app clínico em ' + dif.join(', ')); }
    else console.log('  ok     financeiro.html usa os mesmos ativos do app clínico (' + Object.keys(fin).length + ' siglas)');
    t.window.close(); f.window.close();
  }
  // intracavernosas: o que o app mostra tem de ser exatamente a tabela do Dr. Marco
  // (proposta v3, §6.6, aprovada em 29/09/2026). Cópia independente, de propósito.
  {
    const fs = require('fs');
    const { JSDOM, VirtualConsole } = require('jsdom');
    const html = fs.readFileSync(path.join(__dirname, '../apps/triagem.html'), 'utf8');
    const t = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/triagem.html', virtualConsole: new VirtualConsole() });
    await espera(600);
    const api = t.window.__maximusSiglas;
    const TAB = {
      R1: 'alprostadil (PGE1) 10 mcg/mL + fentolamina 0,2 mg/mL',
      R2: 'alprostadil (PGE1) 20 mcg/mL + fentolamina 10 mg/mL',
      R4: 'alprostadil (PGE1) 20 mcg/mL + fentolamina 3,3 mg/mL + papaverina 12 mg/mL',
      R5: 'alprostadil (PGE1) 10 mcg/mL + fentolamina 1 mg/mL + papaverina 30 mg/mL',
      R6: 'alprostadil (PGE1) 20 mcg/mL + fentolamina 4 mg/mL + papaverina 25 mg/mL',
      R7: 'fentolamina 1 mg/mL + papaverina 30 mg/mL, sem PGE1',
      R8: 'fentolamina 2 mg/mL + papaverina 18 mg/mL + atropina 0,2 mg/mL, sem PGE1',
      R9: 'alprostadil (PGE1) 12 mcg/mL + fentolamina 1,1 mg/mL + papaverina 9 mg/mL + atropina 0,11 mg/mL',
      R10: 'alprostadil (PGE1) 22 mcg/mL + fentolamina 0,22 mg/mL + papaverina 1,8 mg/mL + atropina 0,022 mg/mL',
      R11: 'alprostadil (PGE1) 44 mcg/mL + fentolamina 3,3 mg/mL + papaverina 20 mg/mL + atropina 0,11 mg/mL',
      R12: 'alprostadil (PGE1) 66 mcg/mL + fentolamina 3 mg/mL + papaverina 24 mg/mL + atropina 0,1 mg/mL'
    };
    const erradas = Object.keys(TAB).filter(k => api.ativo(k) !== TAB[k]);
    conferidos++;
    if (erradas.length) { problemas++; erradas.forEach(k => console.log('  FALHA  ' + k + ': app mostra "' + api.ativo(k) + '"')); }
    else console.log('  ok     R1, R2, R4–R12 com todas as substâncias e concentrações da tabela §6.6');
    const semAviso = !/n.o cadastrad/i.test(html);
    const semR3 = !/'R3'/.test(html);
    conferidos += 2;
    if (!semAviso) { problemas++; console.log('  FALHA  ainda há aviso de concentração não cadastrada'); }
    if (!semR3) { problemas++; console.log('  FALHA  R3 ainda aparece numa lista de escolha'); }
    if (semAviso && semR3) console.log('  ok     sem aviso de concentração não cadastrada e R3 fora das listas');
    t.window.close();
  }
  console.log('\n=== SIGLAS COM ATIVO ===');
  console.log('trechos conferidos: ' + conferidos + ' | com sigla sem ativo: ' + problemas);
  process.exit(problemas ? 1 : 0);
})();
