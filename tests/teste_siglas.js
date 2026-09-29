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
      const a = soltas(win, 'Kit: BASE-T20 e SP-DE, depois EP-2.').length;
      const b = soltas(win, 'Kit: BASE-T20 · tadalafila 20 mg e R7 · papaverina + fentolamina').length;
      if (a !== 3 || b !== 0) { console.log('  FALHA  conferidor de siglas quebrado (' + a + ', ' + b + ')'); process.exit(1); }
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
  console.log('\n=== SIGLAS COM ATIVO ===');
  console.log('trechos conferidos: ' + conferidos + ' | com sigla sem ativo: ' + problemas);
  process.exit(problemas ? 1 : 0);
})();
