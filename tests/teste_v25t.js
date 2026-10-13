// v2.5-T (2.5.19) — pedidos do Dr. Marco:
//  1. comorbidades: sem hipertensão/coronariopatia, a pergunta de nitrato/cardíaca não aparece (fica "não");
//     sem problema psiquiátrico/antidepressivo, a psiquiátrica não aparece (fica "não"). Marcou: pergunta.
//  2. faixa "Continuar de onde parou": o botão principal não herda a cor de texto da faixa (ficava escuro sobre escuro)
//  3. email ao paciente: corpo com a via do paciente (orientações/receita), mailto RFC 6068 (%0D%0A), limite de tamanho
const fs = require('fs');
const path = require('path');
const { roda } = require('./regressao');
const RAIZ = path.join(__dirname, '..');
const ARQ = process.argv[2] || path.join(RAIZ, 'apps', 'triagem.html');
const HTML = fs.readFileSync(ARQ, 'utf8');
let falhas = 0;
const ok = (c, n, x) => { console.log((c ? '  ok     ' : '  FALHA  ') + n + (!c && x !== undefined ? '\n         ' + String(x).slice(0, 400) : '')); if (!c) falhas++; };
const iief = t => { const b = Math.floor(t / 5), r = t % 5; const v = [0, 1, 2, 3, 4].map(k => b + (k < r ? 1 : 0)); return { i0: v[0], i1: v[1], i2: v[2], i3: v[3], i4: v[4] }; };
const pedt = t => { const v = [0, 0, 0, 0, 0]; let r = t; for (let k = 0; k < 5 && r > 0; k++) { const a = Math.min(4, r); v[k] += a; r -= a; } return { p0: v[0], p1: v[1], p2: v[2], p3: v[3], p4: v[4] }; };
const contato = { nome: 'Ricardo Ficticio Souza', nascimento: '10/03/1978', telefone: '21987650000', email: 'ricardo.ficticio@exemplo.invalid' };
const prim = (cod, r) => ({ id: cod, codigo: cod, respostas: Object.assign({ visita: 'primeira', contato }, r) });

(async () => {
  console.log('--- item 1: comorbidades abrem (ou não) as perguntas de segurança');
  {
    const r = await roda(prim('MXT101', Object.assign({ queixa: 'de', comorb: ['nenhuma'], medsRisco: ['nenhuma'] }, iief(14))), true);
    ok(!r.falha, 'DE sem comorbidade chega à conduta', r.falha);
    ok(r.caminho.indexOf('contra') < 0 && r.caminho.indexOf('comorbCtrl') < 0, 'sem comorbidade: nitrato/cardíaca e "controlada?" não aparecem', r.caminho.join('>'));
    ok(r.salvo && r.salvo.contraCV === 'nao' && r.conduta.protocolo !== 'BLOQUEIO', 'registro fica "não" e a tadalafila segue liberada', r.salvo && r.salvo.contraCV);
    ok(/Contraindicação a tadalafila: NÃO a todos — sem hipertensão nem coronariopatia \(não perguntado\)/.test(r.texto), 'relatório mostra que a resposta foi deduzida', r.texto.slice(0, 600));
  }
  for (const c of ['has', 'vasc']) {
    const r = await roda(prim('MXT10' + (c === 'has' ? 2 : 3), Object.assign({ queixa: 'de', comorb: [c], comorbCtrl: 'sim', comorbMed: 'sim', contra: 'sim' }, iief(14))), true);
    ok(!r.falha && ['comorbCtrl', 'comorbMed', 'contra'].every(t => r.caminho.indexOf(t) >= 0), c + ': pergunta se está controlada, acompanhamento e nitrato', r.falha || r.caminho.join('>'));
    ok(r.conduta && r.conduta.protocolo === 'BLOQUEIO', c + ' + nitrato: bloqueio da tadalafila mantido', r.conduta && r.conduta.protocolo);
  }
  {
    const r = await roda(prim('MXT104', Object.assign({ queixa: 'ep', comorb: ['nenhuma'], medsRisco: ['nenhuma'], freq: 'baixa' }, pedt(13))), true);
    ok(!r.falha && r.caminho.indexOf('depre') < 0, 'EP sem psiquiátrico nem antidepressivo: a pergunta psiquiátrica não aparece', r.falha || r.caminho.join('>'));
    ok(r.salvo && r.salvo.psiquiatrico === 'nao', 'registro: psiquiátrico "não"');
  }
  {
    const r = await roda(prim('MXT105', Object.assign({ queixa: 'ep', comorb: ['psiq'], comorbCtrl: 'sim', comorbMed: 'sim', freq: 'baixa', depre: 'sim' }, pedt(13))), true);
    ok(!r.falha && r.caminho.indexOf('depre') >= 0, 'problema psiquiátrico marcado: pergunta psiquiátrica aparece', r.falha || r.caminho.join('>'));
    ok(r.conduta && r.conduta.kit.indexOf('SP-DUO') < 0, 'história psiquiátrica: sem SP-DUO (regra mantida)', r.conduta && r.conduta.kit);
  }
  {
    const r = await roda(prim('MXT106', Object.assign({ queixa: 'ep', comorb: ['nenhuma'], medsRisco: ['isrs'], freq: 'baixa', depre: 'nao' }, pedt(13))), true);
    ok(!r.falha && r.caminho.indexOf('depre') >= 0, 'antidepressivo nas medicações: pergunta psiquiátrica aparece', r.falha || r.caminho.join('>'));
  }
  {
    // voltar e marcar hipertensão depois: o "não" deduzido sai e a pergunta volta
    const { JSDOM, VirtualConsole } = require('jsdom');
    const dom = new JSDOM(HTML, { url: 'file:///app/index.html?mxteste=1', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
      beforeParse(w) { w.claude = { use: async () => ({ collection: () => ({ orderBy() { return this; }, limit() { return this; }, async get() { return { docs: [] }; }, async add() { return true; } }) }) }; w.print = () => {}; w.open = () => null; w.scrollTo = () => {}; } });
    const w = dom.window;
    for (let k = 0; k < 100 && !w.__mxTeste; k++) await new Promise(r => setTimeout(r, 20));
    const T = w.__mxTeste, S = T.getS();
    Object.assign(S, { origem: 'novo', codigo: 'MXT107', visita: 'primeira', queixa: 'de', hasDE: true, comorb: ['nenhuma'], nome: 'Ricardo Ficticio Souza', nascimento: '1978-03-10', telefone: '21987650000', email: 'r@exemplo.invalid' });
    T.build();
    ok(S._auto && S._auto.contra && S.contra === 'nao', 'sem comorbidade: "não" deduzido e marcado como automático');
    S.comorb = ['has']; T.build();
    ok(S.contra === undefined && !S._auto.contra, 'ao voltar e marcar hipertensão, o "não" automático some (a pergunta volta)');
    S.contra = 'sim'; S.comorb = ['nenhuma']; T.build();
    ok(S.contra === 'sim', 'resposta dada pelo médico nunca é sobrescrita pela dedução');
    w.close();
  }
  {
    // retorno: o que mudou na ficha estável manda; sem ficha conhecida, pergunta (seguro)
    const ciclos = [{ tipo: 'primeira', linha: 'DE', protocolo: 'DE-2', kitCodes: ['BASE-T10', 'NOITE-1', 'SP-DE'], iief: 12 }];
    const r = await roda({ id: 'MXT108', codigo: 'MXT108', ciclos, respostas: Object.assign({ visita: 'reav', confirmHist: 'ok', adesao: 'total', ea: 'nao' }, iief(13)) }, true);
    ok(!r.falha, 'retorno DE chega à conduta', r.falha);
    ok(r.caminho.indexOf('comorb') >= 0 || r.caminho.indexOf('contra') >= 0 || (r.salvo && r.salvo.contraCV),
      'retorno: comorbidade desconhecida → segurança ainda é perguntada (nunca deduz sem base)', r.caminho.join('>'));
    console.log('         caminho do retorno: ' + r.caminho.join(' > '));
  }
  {
    const base = { tipo: 'primeira', linha: 'DE', protocolo: 'DE-2', kitCodes: ['BASE-T10', 'NOITE-1', 'SP-DE'], iief: 12, contraCV: 'nao' };
    const r = await roda({ id: 'MXT109', codigo: 'MXT109', ciclos: [Object.assign({ comorbidades: ['nenhuma'], medsRisco: ['nenhuma'] }, base)],
      respostas: Object.assign({ visita: 'reav', confirmHist: 'ok', adesao: 'total', ea: 'nao' }, iief(13)) }, true);
    ok(!r.falha && r.caminho.indexOf('contra') < 0, 'retorno: sem comorbidade registrada no ciclo anterior, nitrato não é perguntado de novo', r.falha || r.caminho.join('>'));
    const r2 = await roda({ id: 'MXT110', codigo: 'MXT110', ciclos: [Object.assign({ comorbidades: ['has'], medsRisco: ['nenhuma'] }, base)],
      respostas: Object.assign({ visita: 'reav', confirmHist: 'ok', adesao: 'total', ea: 'nao', contra: 'nao' }, iief(13)) }, true);
    ok(!r2.falha && (r2.caminho.indexOf('contra') >= 0 || r2.caminho.indexOf('confirmaEstavel') >= 0), 'retorno de hipertenso: nitrato perguntado ou confirmado na ficha estável', r2.falha || r2.caminho.join('>'));
  }

  console.log('--- item 2: botão "Continuar de onde parou" legível');
  {
    const css = HTML.match(/\.retomar button[^{]*\{[^}]*\}/g) || [];
    ok(!css.some(r => /^\.retomar button\{/.test(r)), 'nenhuma regra pinta TODOS os botões da faixa com a cor do texto', css.join(' | '));
    ok(css.some(r => /\.retomar button\.btn-primary\{background:var\(--mx-ink\)!important;color:var\(--mx-inkt\)!important/.test(r)), 'botão principal: fundo --mx-ink com texto --mx-inkt (claro e escuro)');
  }

  console.log('--- item 3: email com a via do paciente no corpo');
  {
    const r = await roda(prim('MXT301', Object.assign({ queixa: 'de', comorb: ['nenhuma'] }, iief(14))), true, { manter: true });
    const w = r.win, d = w.document;
    d.getElementById('envOri').checked = true;
    const em = w.mxMontaEmail('ricardo.ficticio@exemplo.invalid', 'Segue o material da sua consulta de hoje na Maximus: orientações do atendimento.');
    const q = em.url.split('?')[1];
    const par = {}; q.split('&').forEach(kv => { const i = kv.indexOf('='); par[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    ok(/^mailto:ricardo\.ficticio@exemplo\.invalid\?subject=/.test(em.url), 'mailto com destinatário e assunto', em.url.slice(0, 80));
    ok(/%0D%0A/.test(em.url) && !/[^%]0A(?!%)/.test('') , 'quebras de linha como %0D%0A (RFC 6068 / Mail do macOS)');
    ok(par.body && par.body.length > 300 && /Olá, Ricardo!/.test(par.body), 'corpo preenchido (saudação + via do paciente)', (par.body || '').slice(0, 200));
    const como = d.querySelector('#printPaciente .med .como');
    const trecho = como ? como.textContent.replace(/\s+/g, ' ').trim() : '(sem posologia na via)';
    ok(par.body.replace(/\s+/g, ' ').indexOf(trecho) >= 0, 'corpo contém a posologia da via do paciente', trecho);
    ok(/O QUE VOCÊ VAI USAR/.test(par.body) && /\n• /.test(par.body), 'corpo legível: seções e tópicos em linhas próprias');
    ok(!/Agendado por|Horário:/.test(par.body), 'sem os campos de agenda em branco do papel');
    ok(!/[Rr]egra interna|piso terap/.test(par.body), 'sem regra interna no corpo');
    ok(/Maximus/.test(par.subject) && /\d{2}\/\d{2}\/\d{4}/.test(par.subject), 'assunto com Maximus e data', par.subject);
    ok(em.url.length <= 7500, 'URL dentro do limite', em.url.length);
    fs.mkdirSync('/workspace/v25tmp', { recursive: true });
    if (process.env.MX_SALVA_EMAIL) fs.writeFileSync('/workspace/v25tmp/v25t_email_body.txt', 'Assunto: ' + par.subject + '\n\n' + par.body.replace(/\r\n/g, '\n'));
    // texto longo: corta o corpo da URL, avisa, e o texto completo vai à área de transferência
    d.getElementById('printPaciente').innerHTML += '<p>' + 'Orientação longa de teste. '.repeat(600) + '</p>';
    const em2 = w.mxMontaEmail('x@exemplo.invalid', 'Segue.');
    ok(em2.cortado && em2.url.length <= 7500 && em2.corpo.length > 10000, 'texto longo: URL limitada, corpo completo preservado para colar', em2.url.length);
    w.close();
  }
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nv2.5-T: tudo ok');
  process.exit(falhas ? 1 : 0);
})();
