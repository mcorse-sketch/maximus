// v2.5-Q — XSS em campos gravados, falha de histórico no retorno, fila local
// (timeout, race no reenvio, códigos reservados).
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'apps', 'triagem.html'), 'utf8');
let falhas = 0;
const ok = (cond, nome, extra) => {
  console.log((cond ? '  ok     ' : '  FALHA  ') + nome + (!cond && extra ? '\n         ' + String(extra).slice(0, 240) : ''));
  if (!cond) falhas++;
};
const espera = ms => new Promise(r => setTimeout(r, ms));

function fakeDb(mem) {
  function q(arr) {
    let l = arr.slice();
    const o = {
      orderBy(f, dir) { l.sort((a, b) => (a[f] < b[f] ? 1 : -1) * (dir === 'desc' ? 1 : -1)); return o; },
      limit(n) { l = l.slice(0, n); return o; },
      async get() { return { docs: l.map(d => ({ data: () => d })) }; },
      async add(reg) { arr.push(JSON.parse(JSON.stringify(reg))); return true; }
    }; return o;
  }
  return { collection(p) { const a = mem[p] || (mem[p] = []); return q(a); } };
}

async function abre({ mem = {}, fetchImpl = null, api = null } = {}) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(HTML, {
    url: 'http://127.0.0.1:8091/?mxteste=1',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      if (!api) w.claude = { use: async () => fakeDb(mem) };
      else {
        try { w.localStorage.setItem('maximus_api', api); } catch (e) {}
        try { w.sessionStorage.setItem('maximus_sessao_medico', 'tok-teste'); } catch (e) {}
      }
      if (fetchImpl) w.fetch = fetchImpl;
      w.open = () => ({ document: { open() {}, write() {}, close() {} }, focus() {}, print() {}, close() {} });
      w.print = () => {};
    }
  });
  const win = dom.window, doc = win.document;
  if (api) { try { win.sessionStorage.setItem('maximus_sessao_medico', 'tok-teste'); } catch (e) {} }
  for (let k = 0; k < 250 && !doc.getElementById('qText'); k++) await espera(15);
  await espera(100);
  // fecha diálogo de senha se apareceu
  const fundo = doc.getElementById('sessaoFundo');
  if (fundo) {
    const campo = doc.getElementById('sessaoSenha');
    if (campo) {
      campo.value = 'x';
      const form = doc.getElementById('sessaoForm');
      if (form) form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
      await espera(120);
    }
  }
  return { win, doc, T: win.__mxTeste };
}

const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';

(async () => {
  console.log('--- XSS: protocolo do ciclo anterior não vira nó vivo na ficha/histórico/painel');
  {
    const prev = {
      codigo: 'MX0992', tipo: 'primeira', linha: 'DE',
      data: new Date(Date.now() - 40 * 864e5).toISOString(), dataBR: '27/08/2026',
      iniciais: 'XS', telefone: '(21)99999-0000', email: 'xs@exemplo.com', iief: 12,
      nome: 'Nome ' + XSS, notaAtendimento: 'Nota ' + XSS,
      protocolo: 'DE-2 ' + XSS, kitCodes: ['BASE-T5'],
      notasMedicas: [{ texto: 'Nota médica ' + XSS }]
    };
    const mem = {}; mem['pacientes/MX0992/ciclos'] = [prev];
    const { win, doc, T } = await abre({ mem });
    ok(!!T && typeof T.abreFicha === 'function', '__mxTeste.abreFicha disponível');
    T.setRetorno(prev);
    T.build(); T.paint();
    if (T.pintaCopiloto) T.pintaCopiloto();
    await T.abreFicha();
    await espera(40);
    const ficha = doc.getElementById('fichaCorpo');
    ok(ficha && ficha.querySelectorAll('img, script').length === 0, 'ficha: sem <img>/<script> vivos');
    ok(!(win.__xss), 'ficha: onerror do payload não executou');
    ok(ficha && ficha.innerHTML.includes('DE-2') && !ficha.innerHTML.includes('<img src'),
      'ficha: protocolo escapado (texto DE-2, sem tag img)', ficha && ficha.innerHTML.match(/protocolo[\s\S]{0,120}/i));
    ok(ficha && (/&lt;img|&#60;img/.test(ficha.innerHTML) || ficha.textContent.includes('<img')),
      'ficha: o markup perigoso aparece como texto');
    await T.abreHistorico();
    await espera(60);
    const hist = doc.getElementById('histCorpo');
    ok(hist && hist.querySelectorAll('img, script').length === 0, 'histórico: sem nós vivos');
    ok(!(win.__xss), 'histórico: onerror não executou');
    const painel = doc.getElementById('painelCard') || doc.querySelector('.cop2');
    ok(!painel || painel.querySelectorAll('img[src="x"]').length === 0, 'painel: sem img do payload');
    win.close();
  }

  console.log('--- retorno da fila: falha ao ler histórico NÃO vira 1ª avaliação');
  {
    const clin = {
      codigo: 'MX0102', tipo: 'primeira', linha: 'DE',
      data: new Date(Date.now() - 45 * 864e5).toISOString(),
      iniciais: 'RT', iief: 10, protocolo: 'DE-2', kitCodes: ['BASE-T10']
    };
    const rec = {
      codigo: 'MX0102', tipo: 'recepcao', linha: 'recepcao', retorno: true,
      data: new Date().toISOString(), dataLocal: new Date().toISOString().slice(0, 10),
      hora: '09:00', queixaRecepcao: 'de', iniciais: 'RT', iief: 14, respostas: {}
    };
    let histCalls = 0;
    const fetchImpl = async (url, opt) => {
      const u = String((url && url.url) || url);
      const json = (o, st = 200) => ({ ok: st >= 200 && st < 300, status: st, json: async () => o, text: async () => JSON.stringify(o) });
      if (u.includes('/api/health')) return json({ ok: true, alertas: [] });
      if (u.includes('/api/login')) return json({ token: 't' });
      if (u.includes('/api/sessao')) return json({ ok: true, perfil: 'medico' });
      if (u.includes('/api/paciente/')) return json({ ciclo: rec, total: 2, ultimaData: rec.data });
      if (u.includes('/api/historico/')) { histCalls++; throw new TypeError('Failed to fetch'); }
      if (u.includes('/api/triagens-hoje')) return json({ triagens: [rec] });
      if (u.includes('/api/pacientes')) return json({ pacientes: [] });
      if (u.includes('/api/proximo-codigo')) return json({ codigo: 'MX0999' });
      return json({ erro: 'nao' }, 404);
    };
    const { win, doc, T } = await abre({ fetchImpl, api: 'http://127.0.0.1:8091' });
    ok(!!T, '__mxTeste no modo rede');
    // Store deve estar em rede
    const S = T.getS();
    S.origem = 'fila'; S.daFila = 'MX0102'; S.fila = [rec]; S.filaAtendidos = [];
    S.filaAplicada = false; S.visita = 'reav'; S.codigo = 'MX0102';
    await T.carregarHistorico('fila');
    T.build(); T.paint();
    if (T.pintaCopiloto) T.pintaCopiloto();
    await espera(40);
    const main = (doc.querySelector('main') || doc.body).textContent;
    ok(histCalls >= 1, 'fez a 2ª leitura (/api/historico)', 'calls=' + histCalls);
    ok(!/SEM HISTÓRICO NA CLÍNICA/i.test(main), 'não mostra "Sem histórico na clínica"');
    ok(!/1ª avaliação/i.test(main), 'não mostra "1ª avaliação"', (main.match(/1ª avaliação|primeira avaliação/gi) || []).slice(0, 3));
    ok(!!S.histErro && /Não consegui carregar o histórico/i.test(S.histErro),
      'histErro = "Não consegui carregar o histórico"', S.histErro);
    ok(S.resumoHist && /Não consegui carregar o histórico/i.test(S.resumoHist) && !/primeira passagem|avaliação inicial/i.test(S.resumoHist),
      'resumoHist traz o erro e não fala em avaliação inicial', S.resumoHist);
    ok(T.mostraConfirmHist(), 'tela confirmHist existe após a falha');
    await espera(30);
    const main2 = (doc.querySelector('main') || doc.body).textContent;
    ok(/Não consegui carregar o histórico|Histórico indisponível/i.test(main2),
      'tela mostra o erro de histórico', main2.replace(/\s+/g, ' ').slice(0, 350));
    ok(S.visita === 'reav' && !S.semHistorico && !!S.histErro, 'visita=reav, semHistorico=false, histErro set',
      JSON.stringify({ visita: S.visita, semHistorico: S.semHistorico, histErro: S.histErro }));
    win.close();
  }

  console.log('--- fila local: timeout, race no reenvio, código reservado');
  {
    const { win, T } = await abre({ mem: {} });
    ok(!!T && typeof T.processaFila === 'function', 'processaFila exposto');
    ok(typeof T.fetchPrazo === 'function' && T.FETCH_PRAZO_MS >= 10000, 'fetchPrazo com prazo ≥ 10 s');

    // hang fetch that respects AbortSignal
    win.fetch = async (url, opt) => new Promise((resolve, reject) => {
      if (opt && opt.signal) {
        if (opt.signal.aborted) return reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        opt.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
      }
    });
    T.Store.modo = 'rede'; T.Store.api = 'http://127.0.0.1:9';
    const reg1 = { codigo: 'MX0004', tipo: 'primeira', linha: 'DE', data: new Date().toISOString(),
      protocolo: 'DE-1', kitCodes: ['BASE-T5'], opId: 'MX0004-primeira-t1' };
    const t0 = Date.now();
    let aborted = false;
    try {
      await T.fetchPrazo(T.Store.api + '/api/ciclo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reg1)
      }, 200);
    } catch (e) { aborted = true; }
    ok(aborted && Date.now() - t0 < 3000, 'fetchPrazo aborta em ~200 ms no teste');
    T.filaEnfileira(reg1);
    ok(T.filaLe().some(x => x.codigo === 'MX0004'), 'atendimento na fila local após falha');

    // race: processaFila lento no 1º + enfileira 2º
    let liberar;
    const barreira = new Promise(r => { liberar = r; });
    win.fetch = async (url, opt) => {
      const corpo = JSON.parse((opt && opt.body) || '{}');
      if (corpo.codigo === 'MX0004') { await barreira; throw new Error('timedout'); }
      throw new Error('connectionrefused');
    };
    const reenvio = T.processaFila();
    await espera(40);
    T.filaEnfileira({ codigo: 'MX0777', tipo: 'primeira', linha: 'DE', data: new Date().toISOString(),
      opId: 'MX0777-primeira-t2', protocolo: 'DE-1', kitCodes: ['BASE-T5'] });
    liberar();
    await reenvio;
    const cods = T.filaLe().map(x => x.codigo).sort();
    ok(cods.includes('MX0004') && cods.includes('MX0777'),
      'reenvio falho não apaga item enfileirado no meio', JSON.stringify(cods));

    // código reservado
    const sug2 = T.proximoLivreDeFila();
    ok(sug2 !== 'MX0004' && sug2 !== 'MX0777', 'próximo código ≠ pendentes na fila', sug2);
    win.close();
  }

  console.log('\n=== v2.5-Q ===\nfalhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
