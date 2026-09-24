// Regressão clínica: leva cada paciente-limite até a conduta, respondendo
// pergunta por pergunta de forma determinística, e compara a conduta com a
// baseline aprovada pelo médico (tests/regressao/baseline.json).
//
// Uso:
//   node regressao.js [app]            compara com a baseline
//   node regressao.js [app] --aprovar  grava a conduta atual como nova baseline
//   node regressao.js [app] --so LIM-003,LIM-004   roda só esses pacientes
//
// Respostas não declaradas no paciente recebem um padrão neutro ("não",
// "nenhuma", primeira opção), para que só o que o paciente declara influa
// na conduta.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const PACIENTES = require('./regressao/pacientes');

const args = process.argv.slice(2);
const APROVAR = args.includes('--aprovar');
const soIdx = args.indexOf('--so');
const SO = soIdx >= 0 ? new Set(args[soIdx + 1].split(',')) : null;
const ARQ = args.find(a => !a.startsWith('--') && (soIdx < 0 || a !== args[soIdx + 1])) || path.join(__dirname, '../apps/triagem.html');
const HTML = fs.readFileSync(ARQ, 'utf8');
const BASELINE = path.join(__dirname, 'regressao', 'baseline.json');

const PREFERIDOS = ['nao', 'nenhuma', 'nenhum', 'ok', 'fixa', 'medio', 'total', 'ambos', 'sim'];
// telas de marcação múltipla sem opção "nenhum" recebem aqui um padrão neutro
const PADRAO_MULTI = {};
const espera = ms => new Promise(r => setTimeout(r, ms));
const visivel = el => el && el.style.display !== 'none' && !el.hidden;

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

function montaBanco(p) {
  const mem = { recepcao: [], codigos: [] };
  const hoje = Date.now();
  (p.ciclos || []).forEach((c, k, todos) => {
    // ciclos anteriores espaçados de 60 dias, o último 60 dias antes de hoje
    const d = new Date(hoje - (todos.length - k) * 60 * 86400000);
    const reg = Object.assign({ codigo: p.codigo, data: d.toISOString(), dataLocal: d.toISOString().slice(0, 10) }, c);
    (mem['pacientes/' + p.codigo + '/ciclos'] = mem['pacientes/' + p.codigo + '/ciclos'] || []).push(reg);
  });
  return mem;
}

// ---- preenchimento de uma tela ------------------------------------------
function escolhe(botoes, desejado) {
  if (desejado !== undefined) {
    const b = botoes.find(x => x.dataset.v === String(desejado));
    if (!b) throw new Error('opção "' + desejado + '" não existe (há: ' + botoes.map(x => x.dataset.v).join(', ') + ')');
    return b;
  }
  for (const v of PREFERIDOS) { const b = botoes.find(x => x.dataset.v === v); if (b) return b; }
  return botoes[0];
}

function ajustaSlider(win, r, valor) {
  r.value = String(valor);
  r.dispatchEvent(new win.Event('input', { bubbles: true }));
}

function preenche(doc, win, tela, resp) {
  const wrap = doc.getElementById('optsWrap');
  const r = resp === undefined ? {} : resp;
  const q = s => [...wrap.querySelectorAll(s)];

  const sliders = q('input[type=range][data-campo]');
  const grupos = q('.gopts[data-campo]');
  const escalas = q('.scale.esc[data-campo]');
  const campos = q('input.fld[data-campo]');
  const opts = q('.opt');
  const sel = wrap.querySelector('select');
  const escala = wrap.querySelector('.scale:not(.esc)');
  const texto = wrap.querySelector('input.fld:not([data-campo])');

  if (grupos.length) {
    grupos.forEach(g => escolhe([...g.querySelectorAll('.gop')], r[g.dataset.campo]).click());
    return;
  }
  if (escalas.length) {
    escalas.forEach(g => {
      const n = r[g.dataset.campo] !== undefined ? r[g.dataset.campo] : 8;
      [...g.querySelectorAll('button')][n].click();
    });
    return;
  }
  if (sliders.length || campos.length) {
    // tela de um número só: a resposta pode vir direto, sem objeto
    const valores = (typeof resp === 'number' || typeof resp === 'string') ? { [tela]: resp } : r;
    let algum = false;
    sliders.forEach(s => { if (valores[s.dataset.campo] !== undefined) { ajustaSlider(win, s, valores[s.dataset.campo]); algum = true; } });
    campos.forEach(c => { if (valores[c.dataset.campo] !== undefined) { c.value = String(valores[c.dataset.campo]); c.dispatchEvent(new win.Event('input', { bubbles: true })); algum = true; } });
    if (!algum) {
      // nada declarado: confirma o valor sugerido (mediana) do primeiro seletor
      if (sliders.length) { const s = sliders[0]; ajustaSlider(win, s, (+s.min + +s.max) / 2); }
      else { campos[0].value = '1'; campos[0].dispatchEvent(new win.Event('input', { bubbles: true })); }
    }
    return;
  }
  if (sel) {
    const vs = [...sel.options].map(o => o.value).filter(Boolean);
    const v = resp !== undefined ? resp : vs[0];
    if (vs.indexOf(v) < 0) throw new Error('valor "' + v + '" não está na lista');
    sel.value = v; sel.dispatchEvent(new win.Event('change', { bubbles: true }));
    return;
  }
  if (escala) { [...escala.querySelectorAll('button')][resp !== undefined ? resp : 8].click(); return; }
  if (opts.length) {
    const lista = Array.isArray(resp) ? resp : (resp === undefined ? PADRAO_MULTI[tela] : null);
    if (lista) lista.forEach(v => escolhe(q('.opt'), v).click());
    else escolhe(opts, resp).click();
    return;
  }
  if (texto) {
    texto.value = String(resp !== undefined ? resp : 'LIM000');
    texto.dispatchEvent(new win.Event('input', { bubbles: true }));
    return;
  }
  throw new Error('tela sem controle reconhecido');
}

// ---- um paciente do início à conduta -------------------------------------
async function roda(p) {
  const mem = montaBanco(p);
  const erros = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => erros.push('jsdomError: ' + (e && e.message)));
  const dom = new JSDOM(HTML, {
    url: 'file:///app/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.claude = { use: async () => fakeDb(mem) };
      w.onerror = (m) => { erros.push('window.onerror: ' + m); };
      w.addEventListener('unhandledrejection', ev => erros.push('rejeicao: ' + ev.reason));
      w.print = () => {}; w.open = () => null; w.scrollTo = () => {};
    }
  });
  const win = dom.window, doc = win.document;
  await espera(40);

  const respostas = Object.assign({ origem: 'novo', codigo: p.codigo }, p.respostas);
  const quiz = doc.getElementById('quizCard');
  const results = doc.getElementById('resultsCard');
  const next = doc.getElementById('nextBtn');
  const caminho = [];
  let falha = null, repetidas = 0, ultima = null;

  for (let passo = 0; passo < 120 && !falha; passo++) {
    if (visivel(results)) break;
    const pan = doc.getElementById('panoramaCard');
    if (visivel(pan)) { doc.getElementById('panSeguir').click(); await espera(5); continue; }
    const tela = quiz.getAttribute('data-tela');
    if (!tela) { falha = 'tela sem data-tela'; break; }
    if (tela === ultima) { if (++repetidas > 3) { falha = 'travou na tela ' + tela; break; } } else repetidas = 0;
    ultima = tela;
    caminho.push(tela);
    try { preenche(doc, win, tela, respostas[tela]); }
    catch (e) { falha = 'tela ' + tela + ': ' + e.message; break; }
    if (next.disabled) { falha = 'tela ' + tela + ': botão avançar desabilitado depois de responder'; break; }
    next.click();
    await espera(15);
  }
  await espera(40);
  if (!falha && !visivel(results)) falha = 'não chegou à conduta';

  const ciclos = (mem['pacientes/' + p.codigo + '/ciclos'] || []);
  const salvo = ciclos.length > (p.ciclos || []).length ? ciclos[ciclos.length - 1] : null;
  const texto = (win.__textoCopia || '')
    .replace(/\d{2}\/\d{2}\/\d{4}/g, '<data>')
    .replace(/há \d+ dias/g, 'há <n> dias');
  const vigia = (win.__mxVigia || []).slice();
  // resposta declarada que nenhuma tela usou: o paciente não testa o que diz testar
  const usadas = new Set(caminho);
  const campoDe = { i0: 1, i1: 1, i2: 1, i3: 1, i4: 1, p0: 1, p1: 1, p2: 1, p3: 1, p4: 1 };
  const naoUsadas = Object.keys(p.respostas || {}).filter(k => !usadas.has(k) && !(k in campoDe && usadas.has(k)));
  if (!falha && naoUsadas.length) falha = 'respostas declaradas que nenhuma tela pediu: ' + naoUsadas.join(', ');
  win.close();
  return {
    falha, erros, vigia, caminho,
    conduta: salvo ? {
      protocolo: salvo.protocolo || null,
      kit: salvo.kitCodes || [],
      iief: salvo.iief === undefined ? null : salvo.iief,
      pedt: salvo.pedt === undefined ? null : salvo.pedt
    } : null,
    texto
  };
}

function diffTexto(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  const sa = new Set(la), sb = new Set(lb);
  return la.filter(l => !sb.has(l)).map(l => '      - ' + l)
    .concat(lb.filter(l => !sa.has(l)).map(l => '      + ' + l));
}

(async () => {
  const lista = PACIENTES.filter(p => !SO || SO.has(p.id));
  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  const nova = APROVAR ? Object.assign({}, base) : null;
  let problemas = 0, mudaram = 0, novos = 0;

  for (const p of lista) {
    const r = await roda(p);
    const cab = p.id.padEnd(8) + ' ' + p.descricao;
    if (r.falha || r.erros.length || r.vigia.length) {
      problemas++;
      console.log('  FALHA  ' + cab);
      if (r.falha) console.log('         ' + r.falha);
      r.erros.slice(0, 3).forEach(e => console.log('         erro de JS: ' + e));
      r.vigia.forEach(v => console.log('         vigia: ' + v));
      console.log('         caminho: ' + r.caminho.join(' > '));
      continue;
    }
    const atual = { descricao: p.descricao, conduta: r.conduta, texto: r.texto };
    if (p.espera) {
      // expectativa clínica escrita à mão: vale mesmo com --aprovar
      const c = r.conduta || {};
      const errado = Object.keys(p.espera).filter(k => JSON.stringify(c[k]) !== JSON.stringify(p.espera[k]));
      if (errado.length) {
        problemas++;
        console.log('  REGRA  ' + cab);
        errado.forEach(k => console.log('         ' + k + ': esperado ' + JSON.stringify(p.espera[k]) + ', saiu ' + JSON.stringify(c[k])));
        continue;
      }
    }
    if (APROVAR) { nova[p.id] = atual; console.log('  grav   ' + cab + '  →  ' + (r.conduta ? r.conduta.protocolo : '—')); continue; }
    const b = base[p.id];
    if (!b) { novos++; console.log('  NOVO   ' + cab + '  →  ' + (r.conduta ? r.conduta.protocolo : '—') + '  (sem baseline — rode com --aprovar)'); continue; }
    const mudouConduta = JSON.stringify(b.conduta) !== JSON.stringify(atual.conduta);
    const mudouTexto = b.texto !== atual.texto;
    if (!mudouConduta && !mudouTexto) { console.log('  ok     ' + cab); continue; }
    mudaram++;
    console.log('  MUDOU  ' + cab);
    if (mudouConduta) {
      ['protocolo', 'kit', 'iief', 'pedt'].forEach(k => {
        const x = JSON.stringify((b.conduta || {})[k]), y = JSON.stringify((atual.conduta || {})[k]);
        if (x !== y) console.log('         ' + k + ': ' + x + ' → ' + y);
      });
    }
    if (mudouTexto) { console.log('         texto da conduta:'); diffTexto(b.texto, atual.texto).slice(0, 12).forEach(l => console.log(l)); }
  }

  if (APROVAR) {
    fs.writeFileSync(BASELINE, JSON.stringify(nova, null, 1) + '\n');
    // folha para o médico conferir: uma linha por paciente, na ordem da lista
    const linhas = ['# Revisão da baseline clínica', '',
      'Gerada por `node regressao.js --aprovar`. Confira cada conduta; se alguma estiver',
      'errada, o erro é do app — corrija o app, não esta folha.', '',
      '| Paciente | Situação | Protocolo | Kit | IIEF | PEDT |', '|---|---|---|---|---|---|'];
    PACIENTES.filter(p => nova[p.id]).forEach(p => {
      const c = nova[p.id].conduta || {};
      linhas.push('| ' + [p.id, p.descricao, c.protocolo || '—', (c.kit || []).join(', ') || '—',
        c.iief == null ? '—' : c.iief, c.pedt == null ? '—' : c.pedt].join(' | ') + ' |');
    });
    fs.writeFileSync(path.join(__dirname, 'regressao', 'REVISAO.md'), linhas.join('\n') + '\n');
    console.log('\nbaseline gravada: ' + Object.keys(nova).length + ' pacientes em ' + path.relative(process.cwd(), BASELINE));
  }
  console.log('\n=== REGRESSAO CLINICA ===');
  console.log('pacientes: ' + lista.length + ' | com falha ou regra violada: ' + problemas + ' | conduta mudou: ' + mudaram + ' | sem baseline: ' + novos);
  if (mudaram && !APROVAR) console.log('Se a mudança foi intencional e o médico aprovou: node regressao.js --aprovar');
  process.exit(problemas || mudaram || novos ? 1 : 0);
})();
