// Testa o app clínico v2 com pacientes sintéticos dentro do jsdom.
// Cada paciente é levado do início até a tela de conduta, clicando como um
// usuário clicaria. Registra erros de JS, fluxos travados e inconsistências
// entre o panorama e as telas reais.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ARQ = process.argv[2] || '/home/claude/v2/triagem-v2.html';
const N = parseInt(process.argv[3] || '100', 10);
const HTML = fs.readFileSync(ARQ, 'utf8');

let seed = 20260923;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
const pick = a => a[Math.floor(rnd() * a.length)];
const intBetween = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const LINHAS = ['DE', 'EP', 'DUO'];
const PROTOS = ['DE-2', 'DE-3', 'EP-2', 'DUO-3', 'DUO-4'];
const KITS = [['BASE-T5', 'NOITE-1'], ['BASE-T10', 'NOITE-1'], ['SP-DUO', 'NOITE-1'],
              ['BASE-T5', 'MOD-DAPO-30', 'NOITE-1'], ['SP-DE', 'NOITE-2']];

function semente() {
  const mem = {};
  const hoje = new Date();
  const diaLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fila = [];
  for (let i = 1; i <= N; i++) {
    const cod = 'MX' + String(i).padStart(4, '0');
    const ciclos = [];
    const nCiclos = intBetween(1, 3);
    for (let c = 0; c < nCiclos; c++) {
      const d = new Date(hoje.getTime() - (nCiclos - c) * intBetween(35, 90) * 86400000);
      ciclos.push({
        codigo: cod, data: d.toISOString(), dataLocal: diaLocal(d),
        tipo: c === 0 ? 'primeira' : 'reav', linha: pick(LINHAS),
        protocolo: pick(PROTOS), kitCodes: pick(KITS).slice(),
        iief: intBetween(5, 24), pedt: intBetween(0, 19),
        labs: rnd() < 0.7 ? { tTotal: intBetween(180, 820), lh: (rnd() * 8).toFixed(1) } : null,
        adesao: pick(['total', 'parcial', 'baixa', 'parou']),
        satisf: intBetween(0, 10), biotens: rnd() < 0.5 ? intBetween(2, 45) : undefined
      });
    }
    mem['pacientes/' + cod + '/ciclos'] = ciclos;
    if (i <= 30) {
      fila.push({
        codigo: cod, data: hoje.toISOString(), dataLocal: diaLocal(hoje),
        hora: String(intBetween(8, 18)).padStart(2, '0') + ':' + pick(['00', '15', '30', '45']),
        tipo: 'recepcao', retorno: true, queixaRecepcao: pick(LINHAS),
        iief: intBetween(5, 25), pedt: intBetween(0, 20),
        usoRelatado: pick(['total', 'parcial', 'baixa', 'parou']),
        efeitoRelatado: pick(['nao', 'leve', 'atrap']),
        satisfRelatada: intBetween(0, 10),
        revisar: rnd() < 0.15,
        iniciais: 'P.' + String.fromCharCode(65 + intBetween(0, 25)) + '.',
        telefone: '2199' + String(intBetween(1000000, 9999999)),
        email: rnd() < 0.6 ? 'paciente' + i + '@exemplo.com' : ''
      });
    }
  }
  mem['recepcao'] = fila;
  mem['codigos'] = Array.from({ length: N }, (_, k) => ({ codigo: 'MX' + String(k + 1).padStart(4, '0') }));
  return mem;
}

function fakeDb(mem) {
  function q(arr) {
    let lista = arr.slice();
    const o = {
      orderBy(f, dir) { lista.sort((a, b) => (a[f] < b[f] ? 1 : -1) * (dir === 'desc' ? 1 : -1)); return o; },
      limit(n) { lista = lista.slice(0, n); return o; },
      async get() { return { docs: lista.map(d => ({ data: () => d })) }; },
      async add(reg) { arr.push(JSON.parse(JSON.stringify(reg))); return true; }
    };
    return o;
  }
  return { collection(p) { const arr = mem[p] || (mem[p] = []); return q(arr); } };
}

const erros = [];
process.on('unhandledRejection', e => erros.push('rejeicao node: ' + (e && e.message ? e.message : e)));
process.on('uncaughtException', e => erros.push('excecao node: ' + (e && e.message ? e.message : e)));
function bootstrap(mem) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => erros.push('jsdomError: ' + (e && e.message)));
  const dom = new JSDOM(HTML, {
    url: 'file:///app/index.html', runScripts: 'dangerously',
    pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.claude = { use: async () => fakeDb(mem) };
      w.onerror = (m, s, l, c, e) => { erros.push('window.onerror: ' + m + (e && e.stack ? '\n' + e.stack.split('\n')[1] : '')); };
      w.addEventListener('unhandledrejection', ev => erros.push('rejeicao: ' + ev.reason));
      w.print = () => {};
      w.open = () => null;
      w.scrollTo = () => {};
    }
  });
  return dom;
}

const espera = ms => new Promise(r => setTimeout(r, ms));

function visivel(el) { return el && el.style.display !== 'none' && !el.hidden; }

// preenche a tela atual e devolve uma descrição do que fez
function preencheTela(doc, win) {
  const wrap = doc.getElementById('optsWrap');
  if (!wrap) return 'sem optsWrap';
  const sel = doc.querySelector('#optsWrap select');
  const range = doc.querySelector('#optsWrap .selnum input[type=range]');
  const grupos = [...doc.querySelectorAll('#optsWrap .gopts')];
  const escalas = [...doc.querySelectorAll('#optsWrap .scale')];
  const opts = [...doc.querySelectorAll('#optsWrap .opt')];
  const inputs = [...doc.querySelectorAll('#optsWrap input.fld')];

  if (range) {
    const todos = [...doc.querySelectorAll('#optsWrap .selnum input[type=range]')];
    if (todos.length > 1) { todos.forEach(rg => { rg.value = String(intBetween(+rg.min, +rg.max)); rg.dispatchEvent(new win.Event('input', { bubbles: true })); }); }
    const min = +range.min, max = +range.max;
    range.value = String(intBetween(min, max));
    range.dispatchEvent(new win.Event('input', { bubbles: true }));
    return 'seletor numerico';
  }
  if (grupos.length) {
    grupos.forEach(g => { const bs = [...g.querySelectorAll('.gop')]; if (bs.length) pick(bs).click(); });
    return 'grupo';
  }
  if (escalas.length) {
    escalas.forEach(g => { const bs = [...g.querySelectorAll('button')]; if (bs.length) pick(bs).click(); });
    return 'escala';
  }
  if (sel) {
    const vs = [...sel.options].map(o => o.value).filter(Boolean);
    if (vs.length) { sel.value = pick(vs); sel.dispatchEvent(new win.Event('change', { bubbles: true })); }
    return 'select';
  }
  if (inputs.length) {
    inputs.forEach(i => {
      const numerico = i.inputMode === 'decimal';
      i.value = numerico ? String(intBetween(1, 30)) : 'teste';
      i.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
    return 'campos';
  }
  if (opts.length) { pick(opts).click(); return 'opcoes'; }
  return 'nada a preencher';
}

// confere o panorama contra as telas reais
function conferePanorama(doc, win) {
  const pb = doc.getElementById('panBtn');
  if (!pb) return 'sem botao panorama';
  pb.click();
  const card = doc.getElementById('panoramaCard');
  if (!visivel(card)) return 'panorama nao abriu';
  const mods = [...card.querySelectorAll('.pan-mod')];
  if (!mods.length) return 'panorama vazio';
  const alvos = mods.map(m => +m.dataset.ir);
  if (alvos.some(a => isNaN(a) || a < 0)) return 'modulo sem destino';
  const seguir = doc.getElementById('panSeguir');
  if (!seguir) return 'sem botao continuar';
  seguir.click();
  if (!visivel(doc.getElementById('quizCard'))) return 'nao voltou ao questionario';
  return null;
}

// abre um módulo pelo panorama e confere que a tela mudou de fato
function abreModulo(doc, win) {
  const pb = doc.getElementById('panBtn'); if (!pb) return null;
  pb.click();
  const card = doc.getElementById('panoramaCard');
  const mods = [...card.querySelectorAll('.pan-mod')];
  if (!mods.length) return 'panorama vazio';
  const m = pick(mods);
  m.click();
  if (!visivel(doc.getElementById('quizCard'))) return 'modulo nao abriu o questionario';
  return null;
}

async function rodaPaciente(i, mem) {
  const dom = bootstrap(mem);
  const { window: win } = dom;
  const doc = win.document;
  const rel = { i, passos: 0, telas: [], falha: null, panorama: null };
  await espera(60);

  const next = doc.getElementById('nextBtn');
  const results = doc.getElementById('resultsCard');
  let travas = 0;

  for (let passo = 0; passo < 90; passo++) {
    if (visivel(results)) break;
    // modulo concluido: o app volta ao panorama e o medico segue para o proximo
    const panCard = doc.getElementById('panoramaCard');
    if (visivel(panCard)) {
      rel.voltasAoPanorama = (rel.voltasAoPanorama || 0) + 1;
      if (/M.dulo conclu.do/i.test(panCard.textContent)) rel.avisouConclusao = true;
      if (!panCard.querySelector('.pan-mod.proximo') && panCard.querySelectorAll('.pan-mod').length) rel.semProximo = true;
      const seg = doc.getElementById('panSeguir');
      if (!seg) { rel.falha = 'panorama sem botao continuar'; break; }
      seg.click(); await espera(45);
      continue;
    }
    const quiz = doc.getElementById('quizCard');
    if (!visivel(quiz)) { rel.falha = 'nenhum card visivel'; break; }
    const rotulo = (doc.getElementById('qText') || {}).textContent || '';
    rel.telas.push(rotulo.slice(0, 40));
    if (doc.querySelector('#optsWrap .fora-faixa')) rel.escapeFaixa = true;
    const nsel = doc.querySelectorAll('#optsWrap .selnum').length;
    if (nsel) { rel.selnum = (rel.selnum || 0) + nsel; if (doc.querySelectorAll('#optsWrap input.fld').length) rel.digitando = (rel.digitando||0)+1; }
    else if (doc.querySelectorAll('#optsWrap input.fld[inputmode=decimal]').length) rel.numDigitado = (rel.numDigitado||0)+1;

    try { preencheTela(doc, win); } catch(e){ erros.push('preencher: '+(e&&e.message)); }
    await espera(4);

    if (next.disabled) {
      // tenta de novo: algumas telas exigem mais de um campo
      try { preencheTela(doc, win); } catch(e){ erros.push('preencher2: '+(e&&e.message)); }
      await espera(4);
    }
    if (next.disabled) {
      travas++;
      if (travas > 2) { rel.falha = 'travou em: ' + rotulo.slice(0, 60); break; }
      // tela opcional pode seguir mesmo assim
    }
    const antes = rotulo;
    try { next.click(); } catch(e){ erros.push('clique next: '+(e&&e.message)); rel.falha='erro ao avancar: '+(e&&e.message); break; }
    await espera(35);
    rel.passos++;
    const depois = (doc.getElementById('qText') || {}).textContent || '';
    if (depois === antes && !visivel(results)) {
      travas++;
      if (travas > 3) { rel.falha = 'sem avanco em: ' + antes.slice(0, 60); break; }
    } else travas = 0;

    if (passo === 3 && !visivel(results)) { try { rel.panorama = conferePanorama(doc, win) || abreModulo(doc, win); } catch(e){ rel.panorama='erro: '+(e&&e.message); } }
  }

  if (!rel.falha && !visivel(results)) rel.falha = 'nao chegou na conduta em 90 passos';
  if (visivel(results)) {
    const kit = doc.getElementById('kitGrid');
    rel.kit = kit ? kit.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    if (!rel.kit) rel.semKit = true;
    const tagSalvo = doc.getElementById('salvoTag');
    if (tagSalvo && tagSalvo.style.display !== 'none') rel.confirmouSalvo = true;
    const envio = doc.getElementById('envioBox');
    if (!envio) rel.semEnvio = true;
    else {
      const wpp = doc.getElementById('envWpp');
      if (wpp) { try { wpp.click(); } catch(e){} }
      const av = doc.getElementById('envAviso');
      rel.envio = av ? av.textContent : '';
    }
  }
  const v = dom.window.__mxVigia || [];
  if (v.length) rel.vigia = v.slice(0, 3);
  dom.window.close();
  return rel;
}

(async () => {
  const mem = semente();
  const rels = [];
  for (let i = 1; i <= N; i++) {
    const r = await rodaPaciente(i, mem);
    rels.push(r);
    if (i % 20 === 0) process.stdout.write('  ' + i + ' pacientes\n');
  }
  const semKit = rels.filter(r => r.semKit).length;
  const semEnvio = rels.filter(r => r.semEnvio).length;
  const falhas = rels.filter(r => r.falha);
  const panFalhas = rels.filter(r => r.panorama);
  const passos = rels.map(r => r.passos);
  const media = (passos.reduce((a, b) => a + b, 0) / passos.length).toFixed(1);

  console.log('\n=== RESULTADO ===');
  console.log('pacientes:', N);
  console.log('chegaram na conduta:', rels.filter(r => !r.falha).length);
  console.log('telas por atendimento: media', media, '| min', Math.min(...passos), '| max', Math.max(...passos));
  console.log('erros de JS capturados:', erros.length);
  erros.slice(0, 8).forEach(e => console.log('   -', e));
  console.log('conduta sem kit de formulas (linhas de procedimento):', semKit);
  console.log('conduta sem bloco de envio:', semEnvio);
  console.log('falhas de fluxo:', falhas.length);
  falhas.slice(0, 10).forEach(f => console.log('   - paciente', f.i, ':', f.falha));
  console.log('telas com seletor de slider:', rels.reduce((a,r)=>a+(r.selnum||0),0), '| telas numericas ainda digitadas:', rels.reduce((a,r)=>a+(r.numDigitado||0),0));
  console.log('voltas automaticas ao panorama:', rels.reduce((a,r)=>a+(r.voltasAoPanorama||0),0),
    '| avisaram modulo concluido:', rels.filter(r=>r.avisouConclusao).length,
    '| panorama sem proximo sugerido:', rels.filter(r=>r.semProximo).length);
  console.log('telas numericas com saida para valor fora da faixa:', rels.filter(r=>r.escapeFaixa).length,
    '| condutas com confirmacao de gravacao:', rels.filter(r=>r.confirmouSalvo).length);
  const comVigia = rels.filter(r=>r.vigia);
  console.log('pacientes com alerta do vigia:', comVigia.length);
  comVigia.slice(0,5).forEach(r=>console.log('   - paciente', r.i, ':', r.vigia.join(' | ')));
  console.log('falhas de panorama:', panFalhas.length);
  panFalhas.slice(0, 6).forEach(f => console.log('   - paciente', f.i, ':', f.panorama));
  fs.writeFileSync('/home/claude/v2/relatorio.json', JSON.stringify({ erros, rels }, null, 1));
  process.exit(falhas.length || erros.length ? 1 : 0);
})();
