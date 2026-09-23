// Rastreador: em vários pontos do atendimento, abre TODOS os módulos do
// panorama, um a um, e confere que nenhum deles quebra a jornada.
// Foi escrito depois de um caso real: abrir o módulo 1 devolvia o médico
// para a lista da fila e o paciente carregado se perdia.
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const ARQ = process.argv[2] || '/home/claude/v2/triagem-v2.html';
const N = parseInt(process.argv[3] || '20', 10);
const HTML = fs.readFileSync(ARQ, 'utf8');

let seed = 5150;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const intBetween = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const espera = ms => new Promise(r => setTimeout(r, ms));
const visivel = el => el && el.style.display !== 'none';

const erros = [];
process.on('unhandledRejection', e => erros.push('rejeicao: ' + (e && e.message ? e.message : e)));

function memoria() {
  const hoje = new Date();
  const dia = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const mem = { recepcao: [], codigos: [] };
  for (let i = 1; i <= 12; i++) {
    const cod = 'MX' + String(i).padStart(4, '0');
    const ant = new Date(hoje.getTime() - intBetween(40, 90) * 86400000);
    mem['pacientes/' + cod + '/ciclos'] = [
      { codigo: cod, data: ant.toISOString(), dataBR: ant.toLocaleDateString('pt-BR'), dataLocal: dia(ant),
        tipo: 'reav', linha: pick(['DE', 'EP', 'DUO']), protocolo: pick(['DE-2', 'EP-3', 'DUO-3']),
        kitCodes: ['SP-DUO', 'NOITE-1'], iief: intBetween(8, 22), pedt: intBetween(2, 16),
        labs: { tTotal: intBetween(250, 700), lh: '4,0' }, adesao: 'total', satisf: 7 },
      { codigo: cod, data: hoje.toISOString(), dataLocal: dia(hoje), tipo: 'recepcao', linha: 'recepcao',
        queixaRecepcao: 'ambos', iniciais: 'A.B.C.', telefone: '21999990000',
        medidas: { idade: intBetween(35, 70), peso: 85, altura: 176, imc: 27.4 } }
    ];
    mem.codigos.push({ codigo: cod });
    mem.recepcao.push({
      codigo: cod, data: hoje.toISOString(), dataLocal: dia(hoje), hora: '09:' + String(10 + i).padStart(2, '0'),
      tipo: 'recepcao', retorno: true, queixaRecepcao: pick(['de', 'ep', 'ambos']),
      iief: intBetween(8, 24), pedt: intBetween(2, 18), usoRelatado: pick(['total', 'parcial', 'baixa']),
      iniciais: 'A.B.C.', telefone: '21999990000', email: i % 2 ? 'p' + i + '@exemplo.com' : '',
      medidas: { idade: intBetween(35, 70), peso: 85, altura: 176, imc: 27.4 }
    });
  }
  return mem;
}
function fakeDb(m) {
  function q(a) {
    let l = a.slice();
    const o = { orderBy(f, d) { l.sort((x, y) => (x[f] < y[f] ? 1 : -1) * (d === 'desc' ? 1 : -1)); return o; },
      limit(n) { l = l.slice(0, n); return o; },
      async get() { return { docs: l.map(x => ({ data: () => x })) }; },
      async add(r) { a.push(r); return true; } };
    return o;
  }
  return { collection(p) { const a = m[p] || (m[p] = []); return q(a); } };
}

function preenche(doc, win) {
  const range = doc.querySelector('#optsWrap .selnum input[type=range]');
  if (range) {
    [...doc.querySelectorAll('#optsWrap .selnum input[type=range]')].forEach(r => {
      r.value = String(intBetween(+r.min, +r.max));
      r.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
    return;
  }
  const grupos = [...doc.querySelectorAll('#optsWrap .gopts')];
  if (grupos.length) { grupos.forEach(g => { const b = [...g.querySelectorAll('.gop')]; if (b.length) pick(b).click(); }); return; }
  const escalas = [...doc.querySelectorAll('#optsWrap .scale')];
  if (escalas.length) { escalas.forEach(g => { const b = [...g.querySelectorAll('button')]; if (b.length) pick(b).click(); }); return; }
  const sel = doc.querySelector('#optsWrap select');
  if (sel) { const vs = [...sel.options].map(o => o.value).filter(Boolean); if (vs.length) { sel.value = pick(vs); sel.dispatchEvent(new win.Event('change', { bubbles: true })); } return; }
  const inputs = [...doc.querySelectorAll('#optsWrap input.fld')];
  if (inputs.length) { inputs.forEach(i => { i.value = i.inputMode === 'decimal' ? String(intBetween(1, 30)) : 'teste'; i.dispatchEvent(new win.Event('input', { bubbles: true })); }); return; }
  const opts = [...doc.querySelectorAll('#optsWrap .opt')];
  if (opts.length) pick(opts).click();
}

const LINHAS = [
  { nome: 'ereção', re: /dificuldade (de|na) ere|ere..o/i },
  { nome: 'ejaculação', re: /ejacula/i },
  { nome: 'ereção e ejaculação', re: /ambas|as duas|ere..o e ejacula/i },
  { nome: 'preenchimento', re: /preenchimento|aumento peniano/i },
  { nome: 'TEFI', re: /TEFI|teste de ere..o/i },
  { nome: 'hipogonadismo', re: /hipogonadismo|testosterona/i },
  { nome: 'emagrecimento', re: /emagrec/i },
  { nome: 'urológica', re: /urol.gica/i }
];

async function roda(i, mem, linha) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => erros.push('jsdomError: ' + e.message));
  const dom = new JSDOM(HTML, {
    url: 'https://clinica.local/app.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.claude = { use: async () => fakeDb(mem) }; w.onerror = m => erros.push('onerror: ' + m); w.open = () => null; w.print = () => {}; }
  });
  const doc = dom.window.document;
  const rel = { i, modulosAbertos: 0, problemas: [] };
  await espera(150);

  const opts = () => [...doc.querySelectorAll('#optsWrap .opt')];
  let codPaciente = '';

  if (!linha) {
    // caminho da fila da recepção
    const fila = opts().find(b => /fila/i.test(b.textContent));
    if (!fila) { rel.problemas.push('sem opcao de fila'); dom.window.close(); return rel; }
    fila.click(); await espera(50); doc.getElementById('nextBtn').click(); await espera(200);
    const pac = opts().find(b => /MX\d{4}/.test(b.textContent));
    if (!pac) { rel.problemas.push('fila vazia'); dom.window.close(); return rel; }
    codPaciente = (pac.textContent.match(/MX\d{4}/) || [''])[0];
    pac.click(); await espera(50); doc.getElementById('nextBtn').click(); await espera(300);
  } else {
    // atendimento sem questionário, escolhendo a linha na mão
    const semQuest = opts().find(b => /sem question/i.test(b.textContent));
    if (!semQuest) { rel.problemas.push('sem opcao de atender sem questionario'); dom.window.close(); return rel; }
    semQuest.click(); await espera(50); doc.getElementById('nextBtn').click(); await espera(200);
    // tipo de visita
    const prim = opts().find(b => /primeira/i.test(b.textContent));
    if (prim) { prim.click(); await espera(40); doc.getElementById('nextBtn').click(); await espera(150); }
    // código
    const campo = doc.querySelector('#optsWrap input.fld');
    codPaciente = 'MX' + String(intBetween(1, 12)).padStart(4, '0');
    if (campo) { campo.value = codPaciente; campo.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      await espera(40); doc.getElementById('nextBtn').click(); await espera(300); }
    // queixa
    let achouLinha = false;
    for (let t = 0; t < 4 && !achouLinha; t++) {
      const alvo = opts().find(b => linha.re.test(b.textContent));
      if (alvo) { alvo.click(); await espera(40); doc.getElementById('nextBtn').click(); await espera(250); achouLinha = true; }
      else {
        const nb = doc.getElementById('nextBtn');
        if (nb.disabled) { preenche(doc, dom.window); await espera(40); }
        if (doc.getElementById('nextBtn').disabled) break;
        doc.getElementById('nextBtn').click(); await espera(200);
      }
    }
    if (!achouLinha) { rel.problemas.push('nao achei a linha ' + linha.nome); dom.window.close(); return rel; }
    rel.linha = linha.nome;
  }

  const perguntaFila = /Qual paciente est|Quem voc. vai atender/i;

  // a cada profundidade, abre todos os módulos do panorama
  for (let profundidade = 0; profundidade < 4; profundidade++) {
    const panBtn = doc.getElementById('panBtn');
    if (!panBtn) { rel.problemas.push('sem botao panorama'); break; }
    panBtn.click(); await espera(120);
    const card = doc.getElementById('panoramaCard');
    const total = card ? card.querySelectorAll('.pan-mod').length : 0;
    if (!total) { rel.problemas.push('panorama sem modulos na profundidade ' + profundidade); break; }

    for (let k = 0; k < total; k++) {
      panBtn.click(); await espera(90);
      const mods = [...doc.getElementById('panoramaCard').querySelectorAll('.pan-mod')];
      if (!mods[k]) break;
      const nome = (mods[k].textContent || '').slice(0, 26).replace(/\s+/g, ' ');
      mods[k].click(); await espera(140);
      rel.modulosAbertos++;

      const perg = (doc.getElementById('qText') || {}).textContent || '';
      const cop = (doc.getElementById('copiloto') || {});
      const textoCop = cop.textContent || '';

      if (perguntaFila.test(perg)) rel.problemas.push('modulo "' + nome + '" devolveu para a fila');
      if (!visivel(doc.getElementById('quizCard'))) rel.problemas.push('modulo "' + nome + '" nao abriu tela nenhuma');
      if (!linha && codPaciente && !textoCop.includes(codPaciente)) rel.problemas.push('modulo "' + nome + '" perdeu o paciente do painel');
      const podeSeguir = !doc.getElementById('nextBtn').disabled
        || doc.querySelectorAll('#optsWrap .opt, #optsWrap .gop, #optsWrap .scale button, #optsWrap input, #optsWrap select, #optsWrap .selnum').length > 0;
      if (!podeSeguir) rel.problemas.push('modulo "' + nome + '" abriu tela sem saida — pergunta: "' + perg.slice(0,40) + '"');
    }

    // avança algumas telas antes da próxima rodada
    for (let p = 0; p < 3; p++) {
      if (visivel(doc.getElementById('resultsCard'))) break;
      const pan = doc.getElementById('panoramaCard');
      if (visivel(pan)) { const c = doc.getElementById('panSeguir'); if (c) { c.click(); await espera(60); } }
      preenche(doc, dom.window); await espera(40);
      const nb = doc.getElementById('nextBtn');
      if (nb.disabled) break;
      nb.click(); await espera(120);
    }
    if (visivel(doc.getElementById('resultsCard'))) break;
  }

  const v = dom.window.__mxVigia || [];
  if (v.length) rel.problemas.push('vigia: ' + v.slice(0, 2).join(' | '));
  dom.window.close();
  return rel;
}

(async () => {
  const mem = memoria();
  const rels = [];
  for (let i = 1; i <= N; i++) { rels.push(await roda(i, mem, null)); if (i % 5 === 0) console.log('  ' + i + ' pacientes pela fila'); }
  for (const linha of LINHAS) {
    for (let r = 0; r < 2; r++) {
      const rel = await roda(1000 + rels.length, mem, linha);
      rel.linhaNome = linha.nome;
      rels.push(rel);
    }
    console.log('  linha ' + linha.nome + ' verificada');
  }
  const comProblema = rels.filter(r => r.problemas.length);
  const abertos = rels.reduce((a, r) => a + r.modulosAbertos, 0);
  console.log('\n=== RASTREADOR DE MODULOS ===');
  console.log('atendimentos:', rels.length, '(' + N + ' pela fila + 2 por linha) | aberturas de modulo testadas:', abertos);
  const porLinha = {};
  rels.filter(r => r.linhaNome).forEach(r => { porLinha[r.linhaNome] = (porLinha[r.linhaNome] || 0) + r.modulosAbertos; });
  console.log('aberturas por linha:', Object.entries(porLinha).map(([k, v]) => k + ' ' + v).join(' · '));
  console.log('erros de JS:', erros.length);
  erros.slice(0, 5).forEach(e => console.log('   -', e));
  console.log('pacientes com problema:', comProblema.length);
  const todos = {};
  comProblema.forEach(r => r.problemas.forEach(p => { const k = (r.linhaNome ? '[' + r.linhaNome + '] ' : '[fila] ') + p; todos[k] = (todos[k] || 0) + 1; }));
  Object.entries(todos).slice(0, 12).forEach(([p, n]) => console.log('   -', p, '(' + n + 'x)'));
  process.exit(comProblema.length || erros.length ? 1 : 0);
})();
