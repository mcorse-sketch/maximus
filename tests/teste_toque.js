// v2.5-N — toque duplo na recepção (tablet do paciente). Tocar numa opção avança
// sozinho 160 ms depois; antes, cada toque agendava o próprio avanço e um toque duplo
// rápido pulava a pergunta seguinte (inclusive a do contato, que é obrigatória).
// O "novo ou retorno" tinha o mesmo problema por outro caminho (cada toque disparava
// a busca no banco e somava um avanço). Confere: toque duplo avança uma tela só (igual a
// um toque), o segundo toque só troca a resposta, e "Voltar" logo depois cancela o avanço.
// Uso: node teste_toque.js [recepcao.html]
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ARQ = process.argv[2] || path.join(__dirname, '../apps/recepcao.html');
const HTML = fs.readFileSync(ARQ, 'utf8');
const espera = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0;
const ok = (c, msg, extra) => { console.log((c ? '  ok     ' : '  FALHA  ') + msg + (!c && extra ? '\n         ' + extra : '')); if (!c) falhas++; };

async function abre() {
  const mem = { recepcao: [], codigos: [] }, erros = [];
  const db = { collection(p) { const a = mem[p] || (mem[p] = []); const o = { orderBy() { return o; }, limit() { return o; },
    async get() { return { docs: a.map(d => ({ data: () => d })) }; }, async add(r) { a.push(JSON.parse(JSON.stringify(r))); return true; } }; return o; } };
  const vc = new VirtualConsole(); vc.on('jsdomError', e => erros.push(e && e.message));
  const dom = new JSDOM(HTML, { url: 'file:///k/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.claude = { use: async () => db }; w.scrollTo = () => {}; w.Element.prototype.scrollTo = function () {}; } });
  const win = dom.window, doc = win.document;
  for (let k = 0; k < 100 && !doc.getElementById('pergunta'); k++) await espera(10);
  await espera(60);
  const t = {
    win, doc, erros, mem,
    pergunta: () => ((doc.getElementById('pergunta') || {}).textContent || '').trim(),
    opcao: re => [...doc.querySelectorAll('.kopt')].find(b => re.test(b.textContent)),
    // passa do código (já vem o próximo livre) para "novo ou retorno"
    async ateNovoOuRetorno() { doc.getElementById('avancar').click(); await espera(250); },
    // preenche o contato e segue até a primeira pergunta de toque do paciente
    async passaContato() {
      // v2.5-P: na primeira visita a tela também tem nome completo e nascimento (opcionais)
      const campo = c => doc.querySelector('.kcontato input[data-campo="' + c + '"]');
      const disp = el => el.dispatchEvent(new win.Event('input', { bubbles: true }));
      campo('iniciais').value = 'TST'; disp(campo('iniciais')); campo('telefone').value = '21988887766'; disp(campo('telefone'));
      doc.getElementById('avancar').click(); await espera(250);
      // "Tudo certo por aqui" (entrega do tablet) e a abertura vão no Continuar
      for (let k = 0; k < 6 && !doc.querySelector('.kopt, .knum'); k++) { doc.getElementById('avancar').click(); await espera(250); }
    }
  };
  return t;
}

(async () => {
  console.log('toque duplo na recepção');
  // 1. "novo ou retorno": um toque leva ao contato; toque duplo também (antes pulava o contato)
  let a = await abre(); await a.ateNovoOuRetorno();
  const pNovoRet = a.pergunta();
  ok(/novo ou um retorno/i.test(pNovoRet), 'chega à pergunta "novo ou retorno"', pNovoRet);
  a.opcao(/Paciente novo/).click(); await espera(400);
  const depoisUm = a.pergunta();
  ok(/Como falamos com ele/i.test(depoisUm), 'um toque em "Paciente novo" leva ao contato', depoisUm);
  a.win.close();

  let b = await abre(); await b.ateNovoOuRetorno();
  b.opcao(/Paciente novo/).click(); b.opcao(/Paciente novo/).click(); await espera(400);
  ok(b.pergunta() === depoisUm, 'toque duplo (no mesmo instante) avança uma tela só — o contato não é pulado', b.pergunta());
  b.win.close();

  b = await abre(); await b.ateNovoOuRetorno();
  b.opcao(/Paciente novo/).click(); await espera(60); const op2 = b.opcao(/Paciente novo/); if (op2) op2.click(); await espera(400);
  ok(b.pergunta() === depoisUm, 'toque duplo com 60 ms entre os toques também avança uma tela só', b.pergunta());
  b.win.close();

  // 2. numa pergunta comum depois do contato: toque duplo = um toque; o segundo toque vale como resposta
  a = await abre(); await a.ateNovoOuRetorno(); a.opcao(/Paciente novo/).click(); await espera(400); await a.passaContato();
  const pComum = a.pergunta();
  const opsA = [...a.doc.querySelectorAll('.kopt, .knum')];
  ok(opsA.length >= 2, 'depois do contato vem uma pergunta de toque (' + pComum.slice(0, 40) + ')', pComum);
  opsA[0].click(); await espera(400);
  const depoisComum = a.pergunta();
  ok(depoisComum && depoisComum !== pComum, 'um toque avança para a pergunta seguinte', depoisComum);
  a.win.close();

  b = await abre(); await b.ateNovoOuRetorno(); b.opcao(/Paciente novo/).click(); await espera(400); await b.passaContato();
  let ops = [...b.doc.querySelectorAll('.kopt, .knum')];
  ops[0].click(); await espera(30); ops = [...b.doc.querySelectorAll('.kopt, .knum')]; ops[1].click(); await espera(400);
  ok(b.pergunta() === depoisComum, 'toque duplo (duas opções diferentes) avança uma tela só', b.pergunta());
  b.doc.getElementById('voltar').click(); await espera(200);
  const marcada = [...b.doc.querySelectorAll('.kopt.sel, .knum.sel, .kopt.selected, .knum.selected')];
  ok(b.pergunta() === pComum && marcada.length === 1 && marcada[0].textContent === ops[1].textContent,
    'vale a resposta do segundo toque', marcada.map(x => x.textContent).join(','));
  b.win.close();

  // 3. "Voltar" dentro dos 160 ms cancela o avanço agendado
  b = await abre(); await b.ateNovoOuRetorno();
  b.opcao(/Paciente novo/).click(); b.doc.getElementById('voltar').click(); await espera(400);
  ok(/C.digo do paciente/i.test(b.pergunta()), 'tocar e voltar logo em seguida fica na tela anterior (o avanço agendado não acontece)', b.pergunta());
  ok([a, b].every(x => x.erros.length === 0), 'sem erro de JS', [...a.erros, ...b.erros][0]);
  b.win.close();

  console.log('\n=== TOQUE DUPLO ===\nfalhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})();
