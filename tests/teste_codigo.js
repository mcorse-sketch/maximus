// Código do paciente novo, no app clínico e na recepção (bug do app ao vivo,
// 30/09/2026: com o banco vazio o campo não vinha preenchido e o botão de
// avançar aceitava o campo vazio). Cada caso confere uma regra:
//   - o próximo código LIVRE vem sempre preenchido no campo, inclusive com o
//     banco vazio, nos três modos (servidor, banco Claude, sem banco);
//   - ele nunca colide com um código existente: banco, lista de pacientes e
//     fila da recepção de hoje; servidor fora do ar não vira "MX0001" às cegas;
//   - chegar à tela por outro caminho (retomar, Novo paciente) também sugere;
//   - campo vazio ou inválido: botão desativado e mensagem clara, nada avança;
//   - o placeholder não se parece com um código (antes era "MX0001").
// Uso: node teste_codigo.js [triagem.html] [recepcao.html]
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const CLIN = fs.readFileSync(process.argv[2] || path.join(__dirname, '../apps/triagem.html'), 'utf8');
const RECEP = fs.readFileSync(process.argv[3] || path.join(__dirname, '../apps/recepcao.html'), 'utf8');
const espera = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok     ' : '  FALHA  ') + msg); if (!cond) falhas++; };
const visivel = el => !!el && el.style.display !== 'none';
const hojeISO = () => new Date().toISOString();

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
// servidor falso no formato do servidor_maximus.py
function servidorFalso(banco, opcoes) {
  opcoes = opcoes || {};
  const resp = (status, obj) => ({ ok: status < 300, status, json: async () => obj });
  const hoje = new Date().toISOString().slice(0, 10);
  return async (url, opt) => {
    const u = String(url).replace(/^https?:\/\/[^/]+/, '');
    const cods = Object.keys(banco);
    if (u === '/api/health') return resp(200, { ok: true, versao: 2, senha: true });
    if (u === '/api/sessao') return resp(200, { perfil: 'medico' });
    if (u === '/api/proximo-codigo') {
      if (opcoes.semProximo) return resp(500, {});
      const n = cods.reduce((m, c) => Math.max(m, +((c.match(/(\d+)\s*$/) || [0, 0])[1])), 0);
      return resp(200, { codigo: 'MX' + String(n + 1).padStart(4, '0') });
    }
    if (u === '/api/pacientes') return resp(200, { pacientes: cods.sort().map(c => ({ codigo: c })) });
    if (u === '/api/triagens-hoje') {
      const t = [];
      cods.forEach(c => banco[c].forEach(r => { if (r.tipo === 'recepcao' && (r.dataLocal || '') === hoje) t.push(r); }));
      return resp(200, { triagens: t });
    }
    if (u === '/api/ciclo' && opt && opt.method === 'POST') {
      const r = JSON.parse(opt.body); (banco[r.codigo] = banco[r.codigo] || []).push(r); return resp(200, { ok: true });
    }
    if (/^\/api\/(paciente|historico)\//.test(u)) return resp(200, { ciclo: null, total: 0, ciclos: [] });
    return resp(404, {});
  };
}
async function abre(html, { mem, banco, opcoes, antes, url, perfil }) {
  const erros = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => erros.push(e && e.message));
  const dom = new JSDOM(html, {
    url: url || (banco ? 'http://clinica.local:8080/' : 'file:///app/index.html'),
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      if (mem) w.claude = { use: async () => fakeDb(mem) };
      if (banco) { w.fetch = servidorFalso(banco, opcoes); w.sessionStorage.setItem('maximus_sessao_' + (perfil || 'medico'), 'tok-teste'); }
      w.print = () => {}; w.open = () => null; w.scrollTo = () => {};
      if (antes) antes(w);
    }
  });
  await espera(120);
  return { win: dom.window, doc: dom.window.document, erros };
}

// ---- app clínico ------------------------------------------------------------
const clica = (doc, v) => { const b = [...doc.querySelectorAll('#optsWrap .opt')].find(x => x.dataset.v === v); if (b) b.click(); return !!b; };
const avanca = async doc => { doc.getElementById('nextBtn').click(); await espera(80); };
const tela = doc => doc.getElementById('quizCard').getAttribute('data-tela');
const campo = doc => doc.querySelector('#optsWrap input.fld');
async function ateCodigo(doc) { clica(doc, 'novo'); await avanca(doc); clica(doc, 'primeira'); await avanca(doc); await espera(60); }
function digita(doc, v) { const i = campo(doc); i.value = v; i.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true })); }

async function clinico() {
  console.log('app clínico — sugestão do código');
  const casos = [
    { nome: 'servidor, banco vazio', banco: {}, espera: 'MX0001' },
    { nome: 'servidor, pacientes MX0001 e MX0003', banco: { MX0001: [{ tipo: 'primeira' }], MX0003: [{ tipo: 'primeira' }] }, espera: 'MX0004' },
    { nome: 'servidor, fila da recepção de hoje com MX0007', banco: { MX0002: [{ tipo: 'primeira' }],
        MX0007: [{ codigo: 'MX0007', tipo: 'recepcao', linha: 'recepcao', dataLocal: new Date().toISOString().slice(0, 10), data: hojeISO() }] }, espera: 'MX0008' },
    { nome: 'servidor sem /api/proximo-codigo, lista com MX0005 (não pode virar MX0001)', banco: { MX0005: [{ tipo: 'primeira' }] },
        opcoes: { semProximo: true }, espera: 'MX0006' },
    { nome: 'banco Claude vazio', mem: { recepcao: [], codigos: [] }, espera: 'MX0001' },
    { nome: 'banco Claude com MX0001..MX0003 e recepção de hoje MX0010', mem: {
        codigos: [{ codigo: 'MX0001' }, { codigo: 'MX0002' }, { codigo: 'MX0003' }],
        recepcao: [{ codigo: 'MX0010', tipo: 'recepcao', linha: 'recepcao', data: hojeISO() }] }, espera: 'MX0011' },
    { nome: 'sem banco (manual), primeiro uso', espera: 'MX0001' },
    { nome: 'sem banco (manual), sequência local em 4', url: 'http://sem-servidor.invalid/',
        antes: w => { w.fetch = async () => { throw new Error('sem rede'); }; w.localStorage.setItem('maximus_seq', '4'); }, espera: 'MX0005' },
  ];
  for (const c of casos) {
    const { doc, win, erros } = await abre(CLIN, c);
    await ateCodigo(doc);
    const i = campo(doc);
    const hint = (doc.querySelector('#optsWrap .fld-hint') || {}).textContent || '';
    ok(tela(doc) === 'codigo' && i && i.value === c.espera && !doc.getElementById('nextBtn').disabled,
      c.nome + ': campo preenchido com ' + c.espera + ' e botão liberado (veio "' + (i && i.value) + '")');
    ok(hint.indexOf('Próximo código livre: ' + c.espera) >= 0, c.nome + ': a dica diz qual é o próximo livre');
    ok(i && !/MX\d/.test(i.placeholder), c.nome + ': placeholder não se parece com código ("' + (i && i.placeholder) + '")');
    ok(!erros.length, c.nome + ': sem erro de JS' + (erros.length ? ' — ' + erros[0] : ''));
    win.close();
  }

  console.log('app clínico — campo vazio ou inválido não avança');
  {
    const { doc, win, erros } = await abre(CLIN, { banco: { MX0001: [{ tipo: 'primeira' }] } });
    await ateCodigo(doc);
    const btn = doc.getElementById('nextBtn'), err = () => doc.getElementById('fldErr');
    digita(doc, '');
    ok(btn.disabled, 'campo apagado: botão desativado');
    ok(visivel(err()) && /Informe o código do paciente/.test(err().textContent) && /MX0002/.test(err().textContent),
      'campo apagado: mensagem clara, com o próximo livre ("' + err().textContent + '")');
    await avanca(doc);
    ok(tela(doc) === 'codigo', 'clicar com o campo vazio não sai da tela');
    campo(doc).dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await espera(60);
    ok(tela(doc) === 'codigo' && visivel(err()), 'Enter no campo vazio não avança e mostra o motivo');
    digita(doc, '   ');
    ok(btn.disabled && visivel(err()), 'só espaços conta como vazio');
    digita(doc, 'MX00#1');
    ok(btn.disabled && /Código inválido/.test(err().textContent), 'código com símbolo: botão desativado e "Código inválido"');
    digita(doc, 'mx0002');
    ok(!btn.disabled && !visivel(err()), 'código válido: mensagem some e o botão volta');
    await avanca(doc);
    ok(tela(doc) !== 'codigo', 'com código válido o atendimento segue (' + tela(doc) + ')');
    ok(!erros.length, 'sem erro de JS' + (erros.length ? ' — ' + erros[0] : ''));
    win.close();
  }

  console.log('app clínico — outros caminhos até a tela do código');
  {
    // atendimento retomado parado na tela do código, sem código: sugere ao abrir
    const sessao = JSON.stringify({ em: Date.now(), si: 2, S: { origem: 'novo', visita: 'primeira' } });
    const { doc, win, erros } = await abre(CLIN, { banco: { MX0004: [{ tipo: 'primeira' }] },
      antes: w => w.sessionStorage.setItem('mx-triagem-sessao-v2', sessao) });
    const seguir = doc.getElementById('rbSeguir');
    ok(!!seguir, 'oferece retomar o atendimento');
    if (seguir) { seguir.click(); await espera(150); }
    ok(tela(doc) === 'codigo' && campo(doc) && campo(doc).value === 'MX0005',
      'retomado na tela do código: o próximo livre é preenchido (' + (campo(doc) && campo(doc).value) + ')');
    ok(!erros.length, 'sem erro de JS' + (erros.length ? ' — ' + erros[0] : ''));
    win.close();
  }
  {
    // "Novo paciente" depois de um atendimento: a fila é consultada de novo e o
    // código gravado no atendimento anterior não é sugerido outra vez
    const banco = {};
    const { doc, win, erros } = await abre(CLIN, { banco });
    await ateCodigo(doc);
    const primeiro = campo(doc).value;
    banco[primeiro] = [{ codigo: primeiro, tipo: 'primeira' }];   // gravado
    doc.getElementById('restartBtn').click(); await espera(120);
    const hint = (doc.getElementById('quizCard').textContent || '');
    ok(tela(doc) === 'origem' && !/Consultando a fila/.test(hint), 'Novo paciente: a fila da recepção é consultada de novo');
    await ateCodigo(doc);
    ok(campo(doc).value === 'MX0002', 'Novo paciente: sugere o seguinte (' + primeiro + ' → ' + campo(doc).value + ')');
    ok(!erros.length, 'sem erro de JS' + (erros.length ? ' — ' + erros[0] : ''));
    win.close();
  }
  {
    // reavaliação continua sem sugestão: o código é de quem já existe
    const { doc, win } = await abre(CLIN, { banco: { MX0003: [{ tipo: 'primeira' }] } });
    clica(doc, 'novo'); await avanca(doc); clica(doc, 'reav'); await avanca(doc); await espera(60);
    ok(tela(doc) === 'codigo' && campo(doc).value === '' && doc.getElementById('nextBtn').disabled,
      'reavaliação: campo vazio para digitar ou escolher na lista, botão desativado');
    win.close();
  }
}

// ---- recepção -----------------------------------------------------------------
const rcampo = doc => doc.querySelector('#opcoes input.kfld');
const rdigita = (doc, v) => { const i = rcampo(doc); i.value = v; i.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true })); };
async function recepcao() {
  console.log('recepção — sugestão do código');
  const casos = [
    { nome: 'servidor, banco vazio', banco: {}, espera: 'MX0001' },
    { nome: 'servidor, fila de hoje com MX0009', banco: { MX0002: [{ tipo: 'primeira' }],
        MX0009: [{ codigo: 'MX0009', tipo: 'recepcao', linha: 'recepcao', dataLocal: new Date().toISOString().slice(0, 10) }] }, espera: 'MX0010' },
    { nome: 'servidor sem /api/proximo-codigo, lista com MX0005', banco: { MX0005: [{ tipo: 'primeira' }] }, opcoes: { semProximo: true }, espera: 'MX0006' },
    { nome: 'banco Claude: codigos até MX0060 e recepção MX0061 já usada', mem: {
        codigos: Array.from({ length: 60 }, (_, k) => ({ codigo: 'MX' + String(k + 1).padStart(4, '0') })),
        recepcao: [{ codigo: 'MX0061', tipo: 'recepcao', data: hojeISO() }] }, espera: 'MX0062' },
  ];
  for (const c of casos) {
    const { doc, win, erros } = await abre(RECEP, Object.assign({ perfil: 'recepcao', url: c.banco ? 'http://clinica.local:8080/recepcao' : undefined }, c));
    const i = rcampo(doc);
    ok(i && i.value === c.espera && !doc.getElementById('avancar').disabled,
      c.nome + ': campo preenchido com ' + c.espera + ' e botão liberado (veio "' + (i && i.value) + '")');
    ok(i && !/MX\d/.test(i.placeholder), c.nome + ': placeholder não se parece com código ("' + (i && i.placeholder) + '")');
    ok(!erros.length, c.nome + ': sem erro de JS' + (erros.length ? ' — ' + erros[0] : ''));
    win.close();
  }

  console.log('recepção — campo vazio ou inválido não avança; Novo paciente sugere de novo');
  {
    const banco = {};
    const { doc, win, erros } = await abre(RECEP, { banco, perfil: 'recepcao', url: 'http://clinica.local:8080/recepcao' });
    const btn = doc.getElementById('avancar'), err = () => doc.getElementById('kerro');
    rdigita(doc, '');
    ok(btn.disabled, 'campo apagado: botão desativado');
    ok(visivel(err()) && /Informe o código do paciente/.test(err().textContent) && /MX0001/.test(err().textContent),
      'campo apagado: mensagem clara, com o próximo livre ("' + err().textContent + '")');
    btn.click(); await espera(40);
    ok(/Código do paciente/.test(doc.getElementById('pergunta').textContent), 'clicar com o campo vazio não sai da tela');
    rdigita(doc, 'MX12');
    ok(btn.disabled && /MX seguido de 4 números/.test(err().textContent), 'formato errado: botão desativado e mensagem do formato');
    rdigita(doc, 'MX0001');
    ok(!btn.disabled && !visivel(err()), 'código válido: mensagem some e o botão volta');
    // paciente gravado; "Novo paciente" no fim pede o próximo livre de novo
    banco.MX0001 = [{ codigo: 'MX0001', tipo: 'recepcao', linha: 'recepcao' }];
    doc.getElementById('novo').click(); await espera(150);
    ok(rcampo(doc) && rcampo(doc).value === 'MX0002' && !btn.disabled,
      'Novo paciente: campo vem com o próximo livre (' + (rcampo(doc) && rcampo(doc).value) + '), não vazio');
    ok(!erros.length, 'sem erro de JS' + (erros.length ? ' — ' + erros[0] : ''));
    win.close();
  }
}

(async () => {
  await clinico();
  await recepcao();
  console.log(falhas ? '\n' + falhas + ' falha(s) no código do paciente' : '\ncódigo do paciente: tudo certo');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
