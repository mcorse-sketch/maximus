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

(async () => {
  for (const [app, perfil] of APPS) await testaApp(app, perfil);
  console.log('\n=== SESSAO ===');
  console.log('falhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})();
