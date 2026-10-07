// v2.5-S (2.5.18) — pedidos do Dr. Marco:
//  1. abertura: clicar no paciente da fila / "Atender" / "Iniciar atendimento" entra direto (sem Próxima)
//  2. paciente novo sem recepção: a tela de dados pede e exige nome completo e nascimento (todas as entradas)
//  3. Enter = Próxima (textarea faz nova linha, botão focado é dele, nunca avança duas vezes)
//  4/5. US de abdome total sai no pedido; ultrassom em folha separada com o mesmo cabeçalho, indicação e rodapé
//  6. novas opções do pedido de exames
//  7/9. biotensiômetro abre em 20; circunferência abre em 10 cm
//  8. preenchimento sem comprimento (tela, registro, papel)
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { roda, preenche } = require('./regressao');
const { assenta, ate } = require('./assenta');

const RAIZ = path.join(__dirname, '..');
const ARQ = process.argv[2] || path.join(RAIZ, 'apps', 'triagem.html');
const HTML = fs.readFileSync(ARQ, 'utf8');
const espera = ms => new Promise(r => setTimeout(r, ms));
const visivel = el => !!el && el.style.display !== 'none' && !el.hidden;
const limpo = el => el ? el.textContent.replace(/\s+/g, ' ') : '';
let falhas = 0;
const ok = (cond, nome, extra) => {
  console.log((cond ? '  ok     ' : '  FALHA  ') + nome + (!cond && extra !== undefined ? '\n         ' + String(extra).slice(0, 300) : ''));
  if (!cond) falhas++;
};
const iief = t => { const b = Math.floor(t / 5), r = t % 5; const v = [0, 1, 2, 3, 4].map(k => b + (k < r ? 1 : 0)); return { i0: v[0], i1: v[1], i2: v[2], i3: v[3], i4: v[4] }; };

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
async function abre(mem) {
  const erros = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { const m = String(e && e.message); if (!/Not implemented/.test(m)) erros.push('jsdomError: ' + m); });
  const dom = new JSDOM(HTML, {
    url: 'file:///app/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.claude = { use: async () => fakeDb(mem) };
      w.onerror = m => { erros.push('window.onerror: ' + m); };
      w.addEventListener('unhandledrejection', ev => erros.push('rejeicao: ' + ev.reason));
      w.print = () => {}; w.open = () => null; w.scrollTo = () => {};
      const g = {};
      Object.defineProperty(w, 'localStorage', { configurable: true, value: {
        getItem: k => (k in g ? g[k] : null), setItem: (k, v) => { g[k] = String(v); }, removeItem: k => { delete g[k]; } } });
    }
  });
  const win = dom.window, doc = win.document;
  await ate(win, () => !!doc.getElementById('quizCard') && !!doc.getElementById('quizCard').getAttribute('data-tela'), 3000);
  await assenta(win, { quieto: 10 });
  await ate(win, () => !/Consultando a fila/.test(limpo(doc.getElementById('quizCard'))), 1500);
  return { win, doc, erros, tela: () => doc.getElementById('quizCard').getAttribute('data-tela'),
    next: doc.getElementById('nextBtn'), mem };
}
// anda pelo caminho normal (preenche + Próxima) até a tela `alvo` (ou a conduta)
async function vaiAte(a, resp, alvo, max) {
  for (let k = 0; k < (max || 80); k++) {
    if (visivel(a.doc.getElementById('resultsCard'))) return 'conduta';
    const pan = a.doc.getElementById('panoramaCard');
    if (visivel(pan)) { a.doc.getElementById('panSeguir').click(); await assenta(a.win); continue; }
    const t = a.tela();
    if (t === alvo) return t;
    preenche(a.doc, a.win, t, resp[t]);
    a.next.click();
    await assenta(a.win);
  }
  return a.tela();
}
const hojeLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const recep = (cod, extra, min) => {
  const h = new Date(); const d = new Date(Math.max(h.getTime() - (min || 20) * 60000, new Date(h).setHours(0, 0, 0, 0) + 1000));
  return Object.assign({ codigo: cod, iniciais: 'TST', tipo: 'recepcao', linha: 'recepcao', hora: d.toTimeString().slice(0, 5), data: d.toISOString(),
    dataLocal: hojeLocal(d), queixaRecepcao: 'de', idade: 50, telefone: '(21)90000-1234', email: 'fila@exemplo.invalid',
    respostas: { i0: 3, i1: 3, i2: 3, i3: 3, i4: 3 }, retorno: false }, extra || {});
};
const tecla = (win, alvo, extra) => {
  const ev = new win.KeyboardEvent('keydown', Object.assign({ key: 'Enter', bubbles: true, cancelable: true }, extra || {}));
  (alvo || win.document.body).dispatchEvent(ev);
  return ev;
};
const campo = (a, id) => a.doc.querySelector('#optsWrap input[data-campo="' + id + '"]');
const digita = (a, id, v) => { const i = campo(a, id); if (!i) return false; i.value = v; i.dispatchEvent(new a.win.Event('input', { bubbles: true })); return true; };

(async () => {
  // =====================================================================
  console.log('--- item 2: paciente novo SEM recepção — nome completo e nascimento obrigatórios');
  {
    const a = await abre({ recepcao: [], codigos: [] });
    const t = await vaiAte(a, { origem: 'novo', visita: 'primeira', codigo: 'MXS101' }, 'contato');
    ok(t === 'contato', '"Atender sem questionário" + primeira avaliação chega à tela de dados', 'parou em ' + t);
    ok(/Dados do paciente/.test(limpo(a.doc.getElementById('qText'))), 'título "Dados do paciente"', limpo(a.doc.getElementById('qText')));
    const n = campo(a, 'nome'), nb = campo(a, 'nascimento');
    ok(!!n && !!nb, 'campos Nome completo e Data de nascimento na tela');
    ok(n && n.required && nb && nb.required && a.doc.querySelectorAll('#optsWrap .fld-obrig').length === 2, 'os dois marcados como obrigatórios');
    digita(a, 'telefone', '21987654321'); digita(a, 'email', 'novo@exemplo.invalid');
    ok(a.next.disabled, 'só telefone e email: Próxima continua desativada');
    ok(/nome completo/i.test(a.doc.getElementById('mxFalta').textContent), '"Falta: nome completo" ao lado do botão', a.doc.getElementById('mxFalta').textContent);
    digita(a, 'nome', 'Carlos');
    ok(a.next.disabled, 'só o primeiro nome não basta');
    digita(a, 'nome', 'Carlos Alberto Teste');
    ok(campo(a, 'iniciais').value === 'CAT', 'iniciais saem do nome', campo(a, 'iniciais').value);
    ok(a.next.disabled && /nascimento/i.test(a.doc.getElementById('mxFalta').textContent), 'sem nascimento: ainda desativada e diz o que falta', a.doc.getElementById('mxFalta').textContent);
    digita(a, 'nascimento', '31022000');
    ok(campo(a, 'nascimento').value === '31/02/2000' && a.next.disabled, 'data impossível (31/02) não libera', campo(a, 'nascimento').value);
    digita(a, 'nascimento', '15041972');
    ok(campo(a, 'nascimento').value === '15/04/1972' && !a.next.disabled, 'nascimento válido com máscara libera a Próxima', campo(a, 'nascimento').value);
    // Enter num campo avança (item 3)
    tecla(a.win, campo(a, 'email')); await assenta(a.win); await espera(20);
    ok(a.tela() !== 'contato', 'Enter no campo de email avança como Próxima', a.tela());
    // segue até a conduta pelo caminho normal
    const fim = await vaiAte(a, { queixa: 'de' }, '__nunca__', 120);
    ok(fim === 'conduta', 'chega à conduta', fim);
    const reg = a.mem['pacientes/MXS101/ciclos'] || [];
    const s = reg[reg.length - 1] || {};
    ok(s.nome === 'Carlos Alberto Teste' && s.nascimento === '1972-04-15', 'registro grava nome e nascimento (AAAA-MM-DD)', JSON.stringify({ n: s.nome, d: s.nascimento }));
    a.win.__mxExames.abre(); await espera(60);
    ok(a.doc.getElementById('exaNome').value === 'Carlos Alberto Teste' && a.doc.getElementById('exaNasc').value === '15/04/1972', 'pedido de exames já vem com nome e nascimento');
    ok(!a.erros.length && !(a.win.__mxVigia || []).length, 'sem erro de JS nem vigia', a.erros.concat(a.win.__mxVigia || []).join(' | '));
    a.win.close();
  }
  {
    // pelo executor da regressão: não declarar nome/nascimento = travado na tela de dados
    const r = await roda({ id: 'S-semid', codigo: 'MXS102', respostas: Object.assign({ visita: 'primeira', queixa: 'de',
      contato: { telefone: '21987654321', email: 'x@exemplo.invalid', nome: '', nascimento: '' } }, iief(14)) }, true);
    ok(/tela contato/.test(r.falha || '') && !r.salvo, 'sem nome e nascimento a primeira avaliação não chega à conduta', r.falha);
  }
  console.log('--- item 2: retorno sem histórico (código digitado) vira primeira avaliação — também exige');
  {
    const a = await abre({ recepcao: [], codigos: [] });
    const t = await vaiAte(a, { origem: 'novo', visita: 'reav', codigo: 'MXS103', confirmHist: 'ok' }, 'contato');
    ok(t === 'contato' && !!campo(a, 'nome') && !!campo(a, 'nascimento'), 'sem ciclo anterior: a tela de dados pede nome e nascimento', 'tela ' + t);
    a.win.close();
  }
  console.log('--- item 2: paciente novo DA RECEPÇÃO — nome e nascimento da fila são mantidos');
  {
    const f = recep('MXS201', { nome: 'Roberto Fila Teste', nascimento: '1975-03-04' });
    const a = await abre({ recepcao: [f], codigos: [] });
    const t = await vaiAte(a, { origem: 'fila', daFila: 'MXS201' }, 'queixa');
    ok(t !== 'contato', 'com nome, nascimento, telefone e email da recepção, a tela de dados não aparece', t);
    a.win.__mxExames.abre(); await espera(60);
    ok(a.doc.getElementById('exaNome').value === 'Roberto Fila Teste' && a.doc.getElementById('exaNasc').value === '04/03/1975', 'pedido de exames com os dados da recepção');
    a.win.close();
  }
  {
    const f = recep('MXS202', { nome: null, nascimento: null });
    const a = await abre({ recepcao: [f], codigos: [] });
    const t = await vaiAte(a, { origem: 'fila', daFila: 'MXS202' }, 'contato', 20);
    ok(t === 'contato' && !!campo(a, 'nome'), 'paciente novo da recepção SEM nome/nascimento: a tela de dados aparece', t);
    ok(campo(a, 'telefone') && campo(a, 'telefone').value === '(21)90000-1234', '… com o telefone da recepção já preenchido');
    ok(a.next.disabled, '… e não avança sem nome e nascimento');
    a.win.close();
  }
  {
    // aberto por "Atender sem questionário" com o código de quem respondeu hoje na recepção
    const f = recep('MXS203', { nome: 'Paulo Hoje Teste', nascimento: '1980-06-07' });
    const a = await abre({ recepcao: [f], codigos: [] });
    const t = await vaiAte(a, { origem: 'novo', visita: 'primeira', codigo: 'MXS203' }, 'queixa', 20);
    ok(t === 'queixa' || t === 'trocarQueixa', 'sem a fila, mas com recepção de hoje: usa nome/nascimento/contato de lá', t);
    a.win.close();
  }
  console.log('--- item 2: reavaliação com histórico não exige (atalho continua no painel)');
  {
    const ciclos = [{ codigo: 'MXS301', tipo: 'primeira', linha: 'DE', protocolo: 'DE-2', iief: 14, kitCodes: ['BASE-T10'], queixa: 'de',
      telefone: '(21)90000-3010', email: 's301@exemplo.invalid', iniciais: 'SRT', data: new Date(Date.now() - 60 * 86400000).toISOString() }];
    const r = await roda({ id: 'S-reav', codigo: 'MXS301', ciclos, respostas: Object.assign({ visita: 'reav', confirmHist: 'ok', trocarQueixa: 'nao',
      adesao: 'total', ea: 'nao', confirmaEstavel: 'nao', caracteriza: { mast: 'nao', matinal: 'nao' }, satisfNps: { satisf: 8, nps: 9 } }, iief(16)) }, true);
    ok(!r.falha && r.caminho.indexOf('contato') < 0, 'retorno com contato no cadastro segue sem a tela de dados', r.falha || r.caminho.join('>'));
  }

  // =====================================================================
  console.log('--- item 1: abertura — o clique já avança (sem Próxima)');
  {
    const ciclos = [{ codigo: 'MXS401', tipo: 'primeira', linha: 'DE', protocolo: 'DE-2', iief: 14, kitCodes: ['BASE-T10'], queixa: 'de',
      nome: 'Jorge Retorno Teste', nascimento: '1966-01-02', telefone: '(21)90000-4010', email: 's401@exemplo.invalid', iniciais: 'JRT',
      data: new Date(Date.now() - 60 * 86400000).toISOString(), dataLocal: '2026-08-01' }];
    const mem = { recepcao: [recep('MXS401', { retorno: true, nome: 'Jorge Retorno Teste', nascimento: '1966-01-02' }, 30), recep('MXS402', { nome: 'Novo Fila Teste', nascimento: '1990-02-03' }, 10)],
      codigos: [], 'pacientes/MXS401/ciclos': ciclos };
    const a = await abre(mem);
    ok(a.tela() === 'origem', 'tela inicial');
    a.doc.querySelector('#optsWrap .opt[data-v="fila"]').click();
    await ate(a.win, () => a.tela() !== 'origem', 1500);
    ok(a.tela() === 'daFila', 'clicar em "Chamar paciente da fila" vai direto para a fila', a.tela());
    a.doc.querySelector('#optsWrap .opt[data-v="MXS401"]').click();
    await ate(a.win, () => !['daFila', 'confirmHist'].includes(a.tela()), 2000); await assenta(a.win, { quieto: 20 });
    ok(!['daFila', 'confirmHist', 'origem'].includes(a.tela()) && !visivel(a.doc.getElementById('panoramaCard')),
      'clicar no paciente da fila entra direto na primeira pergunta (sem Próxima, sem "Confirmar e continuar")', a.tela());
    ok((a.win.__mxVigia || []).length === 0 && !a.erros.length, 'sem vigia nem erro', a.erros.join(' | '));
    a.win.close();
  }
  {
    const mem = { recepcao: [recep('MXS403', { nome: 'Fila Sheet Teste', nascimento: '1985-05-05' })], codigos: [] };
    const a = await abre(mem);
    a.doc.getElementById('mxFilaTopo').click(); await espera(80);
    const b = a.doc.querySelector('#mxFilaCorpo [data-ini]');
    ok(!!b && /Atender/.test(b.textContent), 'popup "Fila de hoje" tem o botão Atender');
    b.click();
    await ate(a.win, () => !['origem', 'daFila'].includes(a.tela()), 2000); await assenta(a.win, { quieto: 20 });
    ok(!['origem', 'daFila', 'confirmHist'].includes(a.tela()), '"Atender" no popup da fila abre o atendimento direto', a.tela());
    a.win.close();
  }
  {
    // "Iniciar atendimento" pela busca, paciente do banco com histórico: pula a conferência do histórico
    const ciclos = [{ codigo: 'MXS404', tipo: 'primeira', linha: 'DE', protocolo: 'DE-2', iief: 14, kitCodes: ['BASE-T10'], queixa: 'de',
      telefone: '(21)90000-4040', email: 's404@exemplo.invalid', iniciais: 'BSC', data: new Date(Date.now() - 60 * 86400000).toISOString() }];
    const a = await abre({ recepcao: [], codigos: [{ codigo: 'MXS404' }], 'pacientes/MXS404/ciclos': ciclos });
    a.win.dispatchEvent(new a.win.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); await espera(60);
    const item = [...a.doc.querySelectorAll('#mxBuscaLista .mx-bi')].find(x => /MXS404/.test(x.textContent));
    ok(!!item, 'busca lista o paciente do banco');
    if (item) { item.click(); await espera(30); a.doc.getElementById('mxBIniciar').click(); }
    await ate(a.win, () => !['origem', 'visita', 'codigo', 'confirmHist'].includes(a.tela()), 2500); await assenta(a.win, { quieto: 20 });
    ok(!['origem', 'visita', 'codigo', 'confirmHist'].includes(a.tela()), '"Iniciar atendimento" entra direto na primeira pergunta', a.tela());
    a.win.close();
  }
  {
    // clique + Próxima logo em seguida: avança UMA tela só
    const a = await abre({ recepcao: [], codigos: [] });
    a.doc.querySelector('#optsWrap .opt[data-v="novo"]').click();
    a.next.click();
    await espera(400); await assenta(a.win);
    ok(a.tela() === 'visita', 'clique na abertura + Próxima imediata = uma tela só (visita)', a.tela());
    // fora da abertura o clique NÃO avança sozinho
    a.doc.querySelector('#optsWrap .opt[data-v="primeira"]').click();
    await espera(400);
    ok(a.tela() === 'visita', 'fora da abertura (tipo de visita) o clique só marca — avança com Próxima/Enter', a.tela());
    a.win.close();
  }

  // =====================================================================
  console.log('--- item 3: Enter = Próxima');
  {
    const a = await abre({ recepcao: [], codigos: [] });
    a.doc.querySelector('#optsWrap .opt[data-v="novo"]').click(); a.next.click(); await assenta(a.win);
    a.doc.querySelector('#optsWrap .opt[data-v="primeira"]').click();
    tecla(a.win, a.doc.body); await ate(a.win, () => a.tela() !== 'visita', 1500); await assenta(a.win);
    ok(a.tela() === 'codigo', 'Enter com a opção marcada avança (visita → código)', a.tela());
    // código: o campo tem o próprio Enter — não pode avançar duas vezes
    await ate(a.win, () => !!campo(a, 'codigo') || !!a.doc.querySelector('#optsWrap input.fld'), 1000);
    const ic = a.doc.querySelector('#optsWrap input.fld'); ic.value = 'MXS501'; ic.dispatchEvent(new a.win.Event('input', { bubbles: true }));
    tecla(a.win, ic); await ate(a.win, () => a.tela() !== 'codigo', 1500); await assenta(a.win, { quieto: 20 });
    ok(a.tela() === 'contato', 'Enter no campo do código avança uma tela só (código → dados)', a.tela());
    // campo obrigatório vazio: Enter não avança e mostra o motivo
    tecla(a.win, campo(a, 'nome')); await assenta(a.win);
    ok(a.tela() === 'contato' && a.doc.getElementById('fldErr').style.display === 'block', 'Enter com obrigatório em aberto não avança e mostra o que falta');
    // botão focado: o Enter é dele (Voltar não vira Próxima)
    digita(a, 'nome', 'Ana Enter Teste'); digita(a, 'nascimento', '01011990'); digita(a, 'telefone', '21999998888'); digita(a, 'email', 'enter@exemplo.invalid');
    const evB = tecla(a.win, a.doc.getElementById('backBtn')); await assenta(a.win);
    ok(a.tela() === 'contato' && !evB.defaultPrevented, 'Enter com foco num botão (Voltar) não avança por cima dele');
    // tecla segurada (repeat) não avança
    tecla(a.win, a.doc.body, { repeat: true }); await assenta(a.win);
    ok(a.tela() === 'contato', 'Enter segurado (auto-repeat) não avança');
    // dois Enter seguidos: uma tela só
    tecla(a.win, a.doc.body); tecla(a.win, a.doc.body); await assenta(a.win, { quieto: 20 });
    ok(a.tela() === 'queixa', 'dois Enter seguidos = uma tela (dados → queixa)', a.tela());
    // segue até a nota final (textarea): Enter não avança
    const t = await vaiAte(a, Object.assign({ queixa: 'de' }, iief(14)), 'notaFinal', 120);
    if (t === 'notaFinal') {
      const ta = a.doc.querySelector('#optsWrap textarea');
      const ev = tecla(a.win, ta); await assenta(a.win);
      ok(a.tela() === 'notaFinal' && !ev.defaultPrevented, 'Enter na nota (textarea) é nova linha — não avança');
    } else ok(false, 'chegou à nota final', t);
    a.win.close();
  }
  {
    // slider focado: Enter avança
    const a = await abre({ recepcao: [], codigos: [] });
    const resp = Object.assign({ origem: 'novo', visita: 'primeira', codigo: 'MXS502', queixa: 'ep', freq: 'baixa' }, { p0: 3, p1: 3, p2: 2, p3: 2, p4: 2 });
    const t = await vaiAte(a, resp, 'biotens', 120);
    ok(t === 'biotens', 'chega ao biotensiômetro', t);
    if (t === 'biotens') {
      // item 7: abre em 20 (sugerido, cinza) e nada é gravado sem gesto
      const v = a.doc.querySelector('#optsWrap .selnum .v');
      const r = a.doc.querySelector('#optsWrap input[type=range]');
      ok(v && /^20\b/.test(v.textContent.trim()) && v.classList.contains('sugerido') && r.value === '20', 'biotensiômetro abre em 20 (sugerido)', v && v.textContent);
      ok(a.next.disabled, 'nada registrado sem gesto (Próxima apagada até mexer)');
      r.value = '20'; r.dispatchEvent(new a.win.Event('input', { bubbles: true }));
      tecla(a.win, r); await assenta(a.win, { quieto: 20 });
      ok(a.tela() !== 'biotens', 'Enter com o slider focado avança', a.tela());
    }
    a.win.close();
  }

  // =====================================================================
  console.log('--- itens 4, 5 e 6: pedido de exames');
  {
    const r = await roda({ id: 'S-exa', codigo: 'MXS601', respostas: Object.assign({ visita: 'primeira', queixa: 'de',
      contato: { nome: 'Exame Folha Teste', nascimento: '12/12/1970', telefone: '21987654321', email: 'exa@exemplo.invalid' } }, iief(14)) }, true, { manter: true });
    ok(!r.falha, 'chega à conduta', r.falha);
    const w = r.win, d = w.document, api = w.__mxExames;
    api.abre(); await espera(60);
    const corpo = limpo(d.getElementById('exaCorpo'));
    const esperados = ['Coagulograma', 'Função renal (creatinina e ureia)', 'PSA total e PSA livre', 'Glicemia de jejum e hemoglobina glicada (HbA1c)',
      'Ácido úrico', 'TSH e T4 livre', 'Vitamina D', 'Vitamina B12', 'Sorologias', 'Painel molecular de IST (urina de 1º jato)',
      'US de abdome total', 'US de próstata via abdominal (com resíduo pós-miccional)'];
    const faltam = esperados.filter(x => corpo.indexOf(x) < 0);
    ok(!faltam.length, 'editor lista as novas opções (coagulograma, função renal, PSA total+livre, glicemia+HbA1c, ácido úrico, TSH+T4L, vit. D, B12, sorologias, painel IST, US)', 'faltam: ' + faltam.join(', '));
    ok(!/PSA total(?! e PSA livre)/.test(corpo), 'PSA nunca sozinho: sempre total + livre');
    ok(['Anti-HIV', 'Anti-HCV', 'Anti-HBs', 'HBsAg', 'Anti-HBc', 'VDRL', 'FTA-ABS IgM e IgG', 'Herpes simples tipo I e II'].every(x => corpo.indexOf(x) >= 0), 'bloco Sorologias mostra os 8 exames');
    const lista0 = api.lista();
    ok(lista0.indexOf('US de abdome total') >= 0 && lista0.indexOf('US de próstata via abdominal (com resíduo pós-miccional)') >= 0, 'US de abdome total e US de próstata entram marcados', JSON.stringify(lista0));
    // marca coagulograma, sorologias e painel IST
    const marca = re => { const cb = [...d.querySelectorAll('#exaCorpo input[data-exa]')].find(c => re.test(c.closest('label').textContent)); if (cb && !cb.checked) cb.click(); return !!cb; };
    marca(/^\s*Coagulograma/); marca(/Sorologias/); marca(/Painel molecular/); marca(/PSA total e PSA livre/);
    api.monta();
    const folhas = [...d.querySelectorAll('#printExames .exa-folha')];
    ok(folhas.length === 2, 'laboratório e ultrassom em DUAS folhas', folhas.length);
    if (folhas.length === 2) {
      const [lab, us] = folhas.map(limpo);
      ok(/Coagulograma/.test(lab) && /Testosterona total/.test(lab) && !/US de abdome/.test(lab) && !/US de próstata/.test(lab), 'folha do laboratório sem ultrassom', lab.slice(0, 300));
      ok(/US de abdome total/.test(us) && /US de próstata via abdominal \(com resíduo pós-miccional\)/.test(us) && !/Testosterona|Coagulograma|Sorologias/.test(us), 'folha do ultrassom só com US de abdome total e US de próstata', us.slice(0, 300));
      const cab = s => [/Exame Folha Teste/.test(s), /12\/12\/1970/.test(s), /MXS601/.test(s), /Indicação clínica\s*Acompanhamento clínico de tratamento/.test(s),
        /Clínica Maximus Medicina Masculina · Dr\. Marco Corsetti · CRM 52\.94351-7/.test(s), /MAXIMUS/.test(s)].every(Boolean);
      ok(cab(lab) && cab(us), 'as duas folhas repetem cabeçalho (nome completo, nascimento, código), indicação e rodapé');
      ok(['Anti-HIV', 'Anti-HCV', 'Anti-HBs', 'HBsAg', 'Anti-HBc', 'VDRL', 'FTA-ABS IgM e IgG', 'Herpes simples tipo I e II — IgM e IgG'].every(x => lab.indexOf(x) >= 0), 'sorologias impressas uma a uma');
      ok(/PSA total e PSA livre/.test(lab) && /Painel molecular de IST \(urina de 1º jato\)/.test(lab), 'PSA total + livre e painel IST no papel');
      ok(/Coleta matinal, em jejum/.test(lab) && !/Coleta matinal/.test(us), 'orientação de coleta só na folha do laboratório');
    }
    // indicação editada vale para as duas folhas
    const ind = d.getElementById('exaIndic'); ind.value = 'Investigação de hipogonadismo'; ind.oninput();
    api.monta();
    ok([...d.querySelectorAll('#printExames .exa-folha')].every(f => /Indicação clínica\s*Investigação de hipogonadismo/.test(limpo(f))), 'a mesma indicação (editada) nas duas folhas');
    // só ultrassom → uma folha; só laboratório → uma folha
    [...d.querySelectorAll('#exaCorpo input[data-exa]')].forEach(c => { if (c.checked && !/^\s*US /.test(c.closest('label').textContent)) c.click(); });
    api.monta();
    ok(d.querySelectorAll('#printExames .exa-folha').length === 1 && /ultrassonografia/i.test(limpo(d.getElementById('printExames'))), 'só ultrassom: uma folha (a do ultrassom)');
    [...d.querySelectorAll('#exaCorpo input[data-exa]')].forEach(c => { if (/^\s*US /.test(c.closest('label').textContent)) { if (c.checked) c.click(); } else if (/Hemograma/.test(c.closest('label').textContent)) { if (!c.checked) c.click(); } });
    api.monta();
    ok(d.querySelectorAll('#printExames .exa-folha').length === 1 && !/US de/.test(limpo(d.getElementById('printExames'))), 'só laboratório: uma folha, sem ultrassom');
    // exame livre de ultrassom vai para a folha do ultrassom
    d.getElementById('exaNovo').value = 'US de bolsa escrotal com Doppler'; d.getElementById('exaIncluir').click();
    api.monta();
    const fs2 = [...d.querySelectorAll('#printExames .exa-folha')].map(limpo);
    ok(fs2.length === 2 && /US de bolsa escrotal/.test(fs2[1]) && !/US de bolsa escrotal/.test(fs2[0]), 'ultrassom digitado à mão também sai na folha do ultrassom');
    ok(/\.pac\.exa-folha \+ \.pac\.exa-folha\{break-before:page;page-break-before:always/.test(HTML), 'CSS: a folha do ultrassom começa em página nova');
    w.close();
  }

  // =====================================================================
  console.log('--- itens 8 e 9: preenchimento sem comprimento; circunferência abre em 10 cm');
  {
    const a = await abre({ recepcao: [], codigos: [] });
    const t = await vaiAte(a, { origem: 'novo', visita: 'primeira', codigo: 'MXS701', queixa: 'preench', tipoPenis: 'grower' }, 'medPre', 40);
    ok(t === 'medPre', 'chega às medidas iniciais do preenchimento', t);
    const tx = limpo(a.doc.getElementById('quizCard'));
    ok(!/omprimento/.test(tx), 'tela de medidas sem comprimento', tx.slice(0, 200));
    ok(!a.doc.querySelector('#optsWrap [data-campo^="comp"]'), 'nenhum campo de comprimento');
    const v = a.doc.querySelector('#optsWrap .selnum .v');
    ok(v && /^10,0\s*cm/.test(v.textContent.trim()), 'circunferência abre em 10 cm', v && v.textContent);
    a.win.close();
  }
  {
    const r = await roda({ id: 'S-pre', codigo: 'MXS702', respostas: { visita: 'primeira', queixa: 'preench', tipoPenis: 'grower',
      contato: { nome: 'Preench Teste Silva', nascimento: '02/02/1988', telefone: '21987654321', email: 'pre@exemplo.invalid' },
      medPre: { diamFlac: '9' }, prepucio: 'medio', retracao: 'leve', plano: { previsaoML: 'ate6', planoBotox: 'nao' }, concordou: 'sim', termo: 'sim',
      medPos: { diamPos: '11' }, mlUsado: '6 mL', botox: 'nao', marcaAH: 'Rennova Shape Lido (seringa 2 mL)', notaMedico: 8 } }, true, { manter: true });
    ok(!r.falha, 'preenchimento realizado chega ao fim', r.falha);
    const p = (r.salvo || {}).preench || {};
    ok(p.diamFlac === '9' && p.diamPos === '11' && !('compFlac' in p) && !('compPos' in p) && !('compRet' in p) && !('compEret' in p), 'registro sem campos de comprimento', JSON.stringify(p).slice(0, 200));
    const d = r.win.document;
    const papel = limpo(d.getElementById('printArea')) + ' ' + limpo(d.getElementById('resultsCard')) + ' ' + (r.win.__textoCopia || '');
    ok(!/omprimento/.test(papel) && /Circunferência/.test(papel), 'tela, relatório e prontuário sem comprimento (circunferência fica)');
    r.win.close();
  }
  {
    ok(!/compFlac|compPos|compRet|compEret|[Cc]omprimento/.test(HTML.replace(/\/\/[^\n]*/g, '')), 'o app não tem mais comprimento no preenchimento (fora de comentários)');
    ok(/data-versao="2\.5\.18"/.test(HTML), 'versão 2.5.18');
  }

  console.log('\n=== v2.5-S ===\nfalhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
