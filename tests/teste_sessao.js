// Tela de senha dos três apps contra um servidor falso (no próprio jsdom).
// Confere: o bloco Sessao é idêntico nos três; o app pede a senha ao abrir;
// senha errada avisa; senha certa libera e põe o token nas chamadas; sessão
// expirada no meio do uso pede a senha de novo e repete a chamada.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const APPS = [['triagem', 'medico'], ['recepcao', 'recepcao'], ['financeiro', 'financeiro']];
const DIR = path.join(__dirname, '../apps');
const espera = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok     ' : '  FALHA  ') + msg); if (!cond) falhas++; };

// ---- 1. o bloco é o mesmo nos três apps -------------------------------------
const blocos = APPS.map(([a]) => {
  const s = fs.readFileSync(path.join(DIR, a + '.html'), 'utf8');
  const i = s.indexOf('  // ---- acesso ao servidor da clínica'), j = s.indexOf('  const Store = {');
  return i >= 0 && j > i ? s.slice(i, j) : null;
});
ok(blocos.every(Boolean), 'os três apps têm o bloco Sessao');
ok(blocos.every(b => b === blocos[0]), 'o bloco Sessao é idêntico nos três apps');

// ---- servidor falso -----------------------------------------------------------
function servidorFalso(win, perfil, senha) {
  const tokens = new Set();
  const srv = { chamadas: [], tokens };
  const resp = (status, obj) => ({ ok: status < 300, status, json: async () => obj });
  srv.fetch = async (url, opt) => {
    opt = opt || {};
    const u = String(url).replace(/^https?:\/\/[^/]+/, '');
    const auth = ((opt.headers || {}).Authorization || '').replace('Bearer ', '');
    srv.chamadas.push({ u, auth });
    if (u === '/api/health') return resp(200, { ok: true, versao: 2, senha: true });
    if (u === '/api/login') {
      const c = JSON.parse(opt.body);
      if (c.perfil === perfil && c.senha === senha) { const t = 'tok-' + Math.random(); tokens.add(t); return resp(200, { token: t }); }
      return resp(401, { erro: 'senha incorreta' });
    }
    if (!tokens.has(auth)) return resp(401, { erro: 'senha necessaria' });
    if (u === '/api/sessao') return resp(200, { perfil });
    if (u === '/api/triagens-hoje') return resp(200, { triagens: [] });
    if (u.startsWith('/api/proximo-codigo')) return resp(200, { codigo: 'MX0001' });
    if (u.startsWith('/api/historico/')) return resp(200, { ciclos: [] });
    if (u.startsWith('/api/paciente/')) return resp(404, { ciclo: null });
    return resp(404, {});
  };
  return srv;
}

async function digitaSenha(doc, win, senha) {
  const campo = doc.getElementById('sessaoSenha');
  campo.value = senha;
  doc.getElementById('sessaoForm').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
  await espera(30);
}

async function testaApp(app, perfil) {
  const SENHA = 'certa-123';
  const erros = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => erros.push(e && e.message));
  let srv;
  const dom = new JSDOM(fs.readFileSync(path.join(DIR, app + '.html'), 'utf8'), {
    url: 'http://clinica.local:8080/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      srv = servidorFalso(w, perfil, SENHA);
      w.fetch = srv.fetch;
      w.print = () => {}; w.open = () => null; w.scrollTo = () => {};
    }
  });
  const win = dom.window, doc = win.document;
  await espera(60);

  ok(!!doc.getElementById('sessaoFundo'), app + ': pede a senha ao abrir');
  ok(/Senha do perfil /.test(doc.getElementById('sessaoTitulo').textContent) &&
     doc.getElementById('sessaoTitulo').textContent.indexOf({ medico: 'Médico', recepcao: 'Recepção', financeiro: 'Financeiro' }[perfil]) >= 0,
     app + ': o título diz o perfil');
  ok(srv.chamadas.every(c => c.u === '/api/health' || c.u === '/api/login'), app + ': nenhum dado pedido antes da senha');

  await digitaSenha(doc, win, 'errada');
  ok(!!doc.getElementById('sessaoFundo') && /incorreta/.test(doc.getElementById('sessaoErro').textContent), app + ': senha errada avisa e mantém a tela');

  await digitaSenha(doc, win, SENHA);
  await espera(40);
  ok(!doc.getElementById('sessaoFundo'), app + ': senha certa libera o app');
  ok(!!win.sessionStorage.getItem('maximus_sessao_' + perfil), app + ': token guardado só na sessão da aba');

  const antes = srv.chamadas.length;
  await win.fetch('http://clinica.local:8080/api/triagens-hoje');
  const ch = srv.chamadas[srv.chamadas.length - 1];
  ok(srv.chamadas.length === antes + 1 && srv.tokens.has(ch.auth), app + ': chamadas ao servidor levam o token');

  // sessão expira no meio do uso: o servidor esquece o token
  srv.tokens.clear();
  const pendente = win.fetch('http://clinica.local:8080/api/triagens-hoje');
  await espera(30);
  ok(!!doc.getElementById('sessaoFundo'), app + ': sessão expirada pede a senha de novo');
  await digitaSenha(doc, win, SENHA);
  const r = await pendente;
  ok(r.status === 200, app + ': depois da senha, a chamada interrompida é repetida e dá certo');

  ok(erros.length === 0, app + ': sem erro de JS' + (erros.length ? ' — ' + erros[0] : ''));
  win.close();
}

// ---- v2.5-M: avisos do servidor (banco ilegível, backup) e fila do navegador ----------
async function abreLogado(app, perfil, health, extra) {
  extra = extra || {};
  const vc = new VirtualConsole(); const erros = [];
  vc.on('jsdomError', e => erros.push(e && e.message));
  let srv;
  const dom = new JSDOM(fs.readFileSync(path.join(DIR, app + '.html'), 'utf8'), {
    url: 'http://clinica.local:8080/?mxteste=1', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      srv = servidorFalso(w, perfil, 'certa-123');
      srv.extra = extra;
      const base = srv.fetch;
      srv.fetch = async (url, opt) => {
        const u = String(url).replace(/^https?:\/\/[^/]+/, '');
        if (u === '/api/health') return { ok: true, status: 200, json: async () => Object.assign({ ok: true, versao: 2, senha: true }, srv.health) };
        if (srv.extra[u]) return srv.extra[u]();
        return base(url, opt);
      };
      srv.health = health;
      w.fetch = srv.fetch; w.print = () => {}; w.open = () => null; w.scrollTo = () => {};
      w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
      if (extra.fila) w.localStorage.setItem('mx-fila-envio-v2', JSON.stringify(extra.fila));
    }
  });
  const win = dom.window, doc = win.document;
  await espera(60);
  await digitaSenha(doc, win, 'certa-123'); await espera(40);
  return { win, doc, srv, erros };
}

async function testaAvisos() {
  const GRAVE = { banco: 'ilegivel', alertas: [{ nivel: 'grave', texto: 'Banco ilegível — leitura e gravação suspensas.' }] };
  const AVISO = { banco: 'ok', alertas: [{ nivel: 'aviso', texto: 'Backup do iCloud atrasado: o último é de 2026-10-01.' }] };
  for (const [app, perfil] of APPS) {
    let t = await abreLogado(app, perfil, GRAVE);
    let el = t.doc.getElementById('mxAvisoSrv');
    ok(!!el && el.classList.contains('grave') && /Banco ilegível/.test(el.textContent) && !el.querySelector('button'),
      app + ': banco ilegível vira faixa vermelha fixa (sem botão de fechar)');
    t.win.close();
    t = await abreLogado(app, perfil, AVISO);
    el = t.doc.getElementById('mxAvisoSrv');
    if (app === 'recepcao') ok(!el, 'recepcao: aviso de backup não aparece na recepção (só o grave)');
    else {
      ok(!!el && el.classList.contains('aviso') && /iCloud atrasado/.test(el.textContent), app + ': falha/atraso de backup vira faixa âmbar');
      el.querySelector('button').click();
      ok(!t.doc.getElementById('mxAvisoSrv'), app + ': "Entendi" fecha o aviso âmbar');
    }
    // o banco estraga com o app aberto: a primeira resposta 503 já traz a faixa (sem esperar os 2 min)
    t.srv.health = GRAVE;
    t.srv.extra['/api/triagens-hoje'] = () => ({ ok: false, status: 503, json: async () => ({ banco: 'ilegivel' }) });
    await t.win.fetch('http://clinica.local:8080/api/triagens-hoje'); await espera(20);
    el = t.doc.getElementById('mxAvisoSrv');
    ok(!!el && el.classList.contains('grave'), app + ': resposta 503 com o app aberto traz a faixa vermelha na hora');
    ok(t.erros.length === 0, app + ': avisos sem erro de JS' + (t.erros.length ? ' — ' + t.erros[0] : ''));
    t.win.close();
  }

  // triagem: histórico ilegível (503) não vira "paciente sem histórico"
  const r503 = () => ({ ok: false, status: 503, json: async () => ({ erro: 'banco ilegivel', banco: 'ilegivel' }) });
  let t = await abreLogado('triagem', 'medico', { banco: 'ok', alertas: [] }, { '/api/paciente/MX0007': r503 });
  let erro = null;
  try { await t.win.__mxTeste.Store.ultimo('MX0007'); } catch (e) { erro = e && e.message; }
  ok(erro === 'BANCO_ILEGIVEL', 'triagem: paciente com banco ilegível lança BANCO_ILEGIVEL (não devolve "sem histórico")', String(erro));
  ok(await t.win.__mxTeste.Store.ultimo('MX0008') === null, 'triagem: 404 continua sendo "sem histórico"');
  t.win.close();

  // triagem: fila do navegador — vencida exige baixar antes de descartar; exportada e velha sai sozinha
  const dia = 86400000, agora = Date.now();
  const fila = [
    { codigo: 'MX0101', tipo: 'primeira', opId: 'a', _enfileiradoEm: agora - 9 * dia },
    { codigo: 'MX0102', tipo: 'primeira', opId: 'b', _enfileiradoEm: agora - 1 * dia },
    { codigo: 'MX0103', tipo: 'primeira', opId: 'c', _enfileiradoEm: agora - 40 * dia, _exportadoEm: agora - 35 * dia }];
  const recusa = () => ({ ok: false, status: 500, json: async () => ({}) });
  t = await abreLogado('triagem', 'medico', { banco: 'ok', alertas: [] }, { fila, '/api/ciclo': recusa });
  const le = () => JSON.parse(t.win.localStorage.getItem('mx-fila-envio-v2') || '[]');
  await t.win.__mxTeste.processaFila();
  ok(le().map(x => x.codigo).join() === 'MX0101,MX0102', 'fila: exportado há mais de 30 dias sai; os não gravados ficam (nunca some em silêncio)', le().map(x => x.codigo).join());
  const tag = t.doc.getElementById('salvoTag');
  ok(/há mais de 7 dias/.test(tag.textContent) && !!t.doc.getElementById('filaBaixar') && !!t.doc.getElementById('filaDescartar'), 'fila: vencido mostra "Baixar cópia" e "Descartar daqui"', tag.textContent);
  t.doc.getElementById('filaDescartar').click(); await espera(20);
  let dlg = t.doc.querySelector('.mx-dlg');
  ok(!!dlg && /Baixe a cópia/.test(dlg.textContent) && le().length === 2, 'fila: descartar sem baixar antes é recusado');
  dlg.querySelector('[data-v="1"]').click(); await espera(20);
  t.doc.getElementById('filaBaixar').click(); await espera(20);
  ok(le().every(x => x._exportadoEm), 'fila: baixar a cópia marca os itens como exportados');
  t.doc.getElementById('filaDescartar').click(); await espera(20);
  dlg = t.doc.querySelector('.mx-dlg');
  ok(!!dlg && /Descartar deste computador/.test(dlg.textContent), 'fila: depois de baixar, pede confirmação para descartar');
  dlg.querySelector('[data-v="1"]').click(); await espera(20);
  ok(le().map(x => x.codigo).join() === 'MX0102', 'fila: descarta só o vencido; o recente continua tentando', le().map(x => x.codigo).join());
  const errosFila = t.erros.filter(e => !/Not implemented: navigation/.test(e));   // o jsdom não baixa arquivo (o clique no link de download)
  ok(errosFila.length === 0, 'fila: sem erro de JS' + (errosFila.length ? ' — ' + errosFila[0] : ''));
  t.win.close();
}

(async () => {
  for (const [app, perfil] of APPS) await testaApp(app, perfil);
  await testaAvisos();
  console.log('\n=== SESSAO ===');
  console.log('falhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})();
