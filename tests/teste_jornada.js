// Jornada do médico no app clínico: o que muda o caminho do atendimento e o
// que fica registrado. Cada caso exercita uma regra da interface:
//   - retorno: escolher o paciente numa lista, além de digitar o código;
//   - contato digitado no consultório quando a recepção não coletou;
//   - nota opcional na última tela de todo caminho, salva no registro;
//   - aviso de ISRS só com paroxetina + clomipramina na mesma prescrição;
//   - texto do prontuário sem racional nem explicações;
//   - ficha mostra tudo o que foi registrado no atendimento;
//   - descartar atendimento interrompido sem depender do confirm() nativo;
//   - botão de imprimir relatório chama a impressão.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { roda, espera } = require('./regressao');

const HTML = fs.readFileSync(process.argv[2] || path.join(__dirname, '../apps/triagem.html'), 'utf8');
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok     ' : '  FALHA  ') + msg); if (!cond) falhas++; };
const visivel = el => !!el && el.style.display !== 'none';
const iief14 = { i0: 3, i1: 3, i2: 3, i3: 3, i4: 2 };

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
async function abreApp(mem, antes, url) {
  const erros = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => erros.push(e && e.message));
  const dom = new JSDOM(HTML, {
    url: url || 'file:///app/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.claude = { use: async () => fakeDb(mem) };
      w.print = () => {}; w.open = () => null; w.scrollTo = () => {};
      if (antes) antes(w);
    }
  });
  await espera(60);
  return { win: dom.window, doc: dom.window.document, erros };
}
const clica = (doc, v) => { const b = [...doc.querySelectorAll('#optsWrap .opt')].find(x => x.dataset.v === v); if (b) b.click(); return !!b; };
const avanca = async doc => { doc.getElementById('nextBtn').click(); await espera(40); };
const tela = doc => doc.getElementById('quizCard').getAttribute('data-tela');

(async () => {
  // ---- contato digitado + nota final + texto do prontuário -----------------
  console.log('contato, nota final e texto do prontuário');
  const r1 = await roda({ id: 'J1', codigo: 'JR0001', respostas: Object.assign({ visita: 'primeira', queixa: 'de',
    contato: { iniciais: 'rsm', telefone: '21987654321' }, notaFinal: 'Retorno antecipado combinado com o paciente.' }, iief14) }, true, { manter: true });
  ok(!r1.falha, 'o atendimento chega à conduta' + (r1.falha ? ' — ' + r1.falha : ''));
  ok(r1.caminho.includes('contato'), 'sem contato da recepção nem do cadastro, a tela de contato aparece');
  ok(r1.caminho[r1.caminho.length - 1] === 'notaFinal', 'a última tela do caminho é a nota do atendimento');
  ok(r1.salvo && r1.salvo.telefone === '(21)98765-4321' && r1.salvo.iniciais === 'RSM', 'contato vai formatado para o registro');
  ok(r1.salvo && r1.salvo.notaAtendimento === 'Retorno antecipado combinado com o paciente.', 'a nota fica salva no registro');
  ok(/NOTA DO MÉDICO\nRetorno antecipado combinado/.test(r1.texto), 'a nota entra no texto do prontuário');
  ok(!/RACIONAL|Por que este protocolo|O que cada item faz|CRM|Relatório da consulta/.test(r1.texto), 'o texto do prontuário não traz racional, assinatura nem cabeçalhos do relatório');
  ok(/^IIEF-5 total: 14\/25/m.test(r1.texto) && /^- BASE-T10 — Tadalafila 10 mg/m.test(r1.texto), 'o texto traz "Rótulo: valor" e a prescrição com composição');
  ok(!visivel(r1.win.document.getElementById('avisoISRS')), 'DE sem paroxetina: aviso de ISRS escondido');

  // ficha: tudo o que foi registrado
  r1.win.document.getElementById('fichaBtn') && r1.win.document.getElementById('fichaBtn').click();
  await espera(60);
  const ficha = r1.win.document.getElementById('fichaCorpo').textContent;
  ok(/Registrado neste atendimento/.test(ficha) && /Retorno antecipado combinado/.test(ficha) && /\(21\)98765-4321/.test(ficha),
    'a ficha mostra o registrado no atendimento, com contato e nota');

  // imprimir: o documento abre numa aba própria, que chama a impressão
  const abas = [];
  r1.win.open = () => { const aba = { html: '', impresso: false, document: { open() {}, write(h) { aba.html += h; }, close() {} },
    focus() {}, print() { aba.impresso = true; } }; abas.push(aba); return aba; };
  r1.win.document.getElementById('printBtn').click();
  await espera(400);
  ok(abas.length === 1 && abas[0].impresso && /Relatório da consulta/.test(abas[0].html) && /BASE-T10/.test(abas[0].html),
    'imprimir relatório abre o relatório numa aba própria e chama a impressão');
  ok(/button\{display:none!important/.test(abas[0].html), 'a aba impressa esconde os botões da tela');
  r1.win.document.getElementById('fichaImprimir').click();
  await espera(400);
  ok(abas.length === 2 && abas[1].impresso && /Registrado neste atendimento/.test(abas[1].html), 'imprimir a ficha leva a ficha inteira para a aba');
  // se o navegador bloquear a aba, cai na impressão da própria página
  let impressaoDireta = null;
  r1.win.open = () => null;
  r1.win.print = () => { impressaoDireta = r1.win.document.body.classList.contains('pc'); };
  r1.win.document.getElementById('printBtn').click();
  ok(impressaoDireta === true, 'aba bloqueada: imprime pela própria página');
  r1.win.close();

  const rInv = await roda({ id: 'J2', codigo: 'JR0002', respostas: Object.assign({ visita: 'primeira', queixa: 'de',
    contato: { telefone: '2198' } }, iief14) }, true);
  ok(/tela contato/.test(rInv.falha || ''), 'telefone incompleto e sem email não deixa avançar');

  // ---- retorno com contato no cadastro: não pergunta de novo ----------------
  const r2 = await roda({ id: 'J3', codigo: 'JR0003', respostas: Object.assign({ visita: 'reav', confirmHist: 'ok', queixa: 'de' }, iief14),
    ciclos: [{ tipo: 'recepcao', linha: 'recepcao', telefone: '(21)91234-5678', iniciais: 'AB' },
             { tipo: 'primeira', protocolo: 'DE-2', kitCodes: ['BASE-T10', 'NOITE-1', 'SP-DE'], iief: 12 }] }, true);
  ok(!r2.falha && !r2.caminho.includes('contato'), 'retorno com contato no cadastro não mostra a tela de contato');

  // ---- aviso de ISRS ---------------------------------------------------------
  console.log('aviso de ISRS');
  for (const q of ['emag', 'uro']) {
    const r = await roda({ id: 'J-' + q, codigo: 'JR' + q.toUpperCase(), respostas: { visita: 'primeira', queixa: q } }, true, { manter: true });
    ok(!r.falha && !visivel(r.win.document.getElementById('avisoISRS')), q + ': aviso de ISRS escondido');
    ok(r.caminho[r.caminho.length - 1] === 'notaFinal', q + ': também termina na nota do atendimento');
    r.win.close();
  }
  const rEp4 = await roda({ id: 'J-ep4', codigo: 'JREP4', respostas: { visita: 'primeira', queixa: 'ep', p0: 3, p1: 3, p2: 3, p3: 2, p4: 2, parox: 'sim' } }, true, { manter: true });
  ok(!rEp4.falha && rEp4.conduta.protocolo === 'EP-4' && visivel(rEp4.win.document.getElementById('avisoISRS')),
    'EP-4 (paroxetina + clomipramina): aviso de ISRS aparece');
  rEp4.win.close();

  // ---- retorno: escolher o paciente numa lista -----------------------------
  console.log('lista de pacientes no retorno');
  {
    const mem = { recepcao: [], codigos: [{ codigo: 'MX0001' }, { codigo: 'MX0002' }],
      'pacientes/MX0002/ciclos': [{ codigo: 'MX0002', tipo: 'primeira', protocolo: 'DE-2', kitCodes: ['BASE-T10'], iief: 12,
        data: new Date(Date.now() - 60 * 86400000).toISOString() }] };
    const { doc, erros } = await abreApp(mem);
    clica(doc, 'novo'); await avanca(doc);
    clica(doc, 'reav'); await avanca(doc);
    ok(tela(doc) === 'codigo', 'retorno chega à tela do código');
    const inp = doc.querySelector('#optsWrap input.fld');
    inp.dispatchEvent(new doc.defaultView.Event('focus')); await espera(40);
    const caixa = doc.querySelector('#optsWrap .lista-pac');
    const itens = caixa ? [...caixa.querySelectorAll('button')] : [];
    ok(visivel(caixa) && itens.length === 2, 'tocar no campo abre a lista com os pacientes do banco');
    inp.value = '2'; inp.dispatchEvent(new doc.defaultView.Event('input')); await espera(10);
    ok(caixa.querySelectorAll('button').length === 1, 'digitar filtra a lista');
    caixa.querySelector('button').click(); await espera(10);
    ok(inp.value === 'MX0002' && !visivel(caixa), 'escolher na lista preenche o código e fecha a lista');
    await avanca(doc);
    ok(tela(doc) === 'confirmHist', 'com o paciente escolhido, o app encontra o histórico');
    ok(!erros.length, 'sem erro de JS');
  }

  // ---- descartar atendimento interrompido ------------------------------------
  console.log('descartar atendimento interrompido');
  {
    const mem = { recepcao: [], codigos: [] };
    const { win, doc } = await abreApp(mem, w => {
      w.sessionStorage.setItem('mx-triagem-sessao-v2', JSON.stringify({ em: Date.now() - 5 * 60000, si: 3,
        S: { origem: 'novo', visita: 'primeira', codigo: 'MX0777' } }));
      w.confirm = () => false;   // diálogo nativo bloqueado: o botão não pode depender dele
    }, 'http://clinica.local/');   // sessionStorage só existe com origem http
    const barra = doc.getElementById('retomarBar');
    ok(visivel(barra) && /MX0777/.test(barra.textContent), 'o app oferece retomar o atendimento interrompido');
    doc.getElementById('rbDescartar').click(); await espera(10);
    ok(!!doc.getElementById('rbConfirma'), 'descartar pede confirmação na própria faixa');
    doc.getElementById('rbConfirma').click(); await espera(20);
    ok(!visivel(barra) && !win.sessionStorage.getItem('mx-triagem-sessao-v2') && tela(doc) === 'origem',
      'confirmado, o atendimento é descartado e o app volta ao início');
  }

  console.log('\n=== JORNADA ===\nfalhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})();
