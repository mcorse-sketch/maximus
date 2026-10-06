// Jornada do médico no app clínico: o que muda o caminho do atendimento e o
// que fica registrado. Cada caso exercita uma regra da interface:
//   - retorno: escolher o paciente numa lista, além de digitar o código;
//   - contato digitado no consultório quando a recepção não coletou;
//   - nota opcional na última tela de todo caminho, salva no registro;
//   - aviso de ISRS só com paroxetina + clomipramina na mesma prescrição;
//   - texto do prontuário sem racional nem explicações;
//   - ficha mostra tudo o que foi registrado no atendimento;
//   - descartar atendimento interrompido sem depender do confirm() nativo;
//   - botão de imprimir relatório chama a impressão;
//   - retorno: botão fixo abre o histórico de todos os atendimentos anteriores.
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
    contato: { iniciais: 'rsm', telefone: '21987654321', email: 'rsm@exemplo.invalid' }, notaFinal: 'Retorno antecipado combinado com o paciente.' }, iief14) }, true, { manter: true });
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
  // v2.5: telefone E email obrigatórios — só o telefone não chega à conduta
  const rSoTel = await roda({ id: 'J2b', codigo: 'JR0012', respostas: Object.assign({ visita: 'primeira', queixa: 'de',
    contato: { telefone: '21987654321' } }, iief14) }, true);
  ok(/tela contato/.test(rSoTel.falha || '') && !rSoTel.salvo, 'só o telefone, sem email: não chega à conduta');

  // ---- retorno com contato no cadastro: não pergunta de novo ----------------
  const r2 = await roda({ id: 'J3', codigo: 'JR0003', respostas: Object.assign({ visita: 'reav', confirmHist: 'ok', queixa: 'de' }, iief14),
    ciclos: [{ tipo: 'recepcao', linha: 'recepcao', telefone: '(21)91234-5678', email: 'ab@exemplo.invalid', iniciais: 'AB' },
             { tipo: 'primeira', protocolo: 'DE-2', kitCodes: ['BASE-T10', 'NOITE-1', 'SP-DE'], iief: 12 }] }, true);
  ok(!r2.falha && !r2.caminho.includes('contato'), 'retorno com contato no cadastro não mostra a tela de contato');

  // ---- aviso de ISRS ---------------------------------------------------------
  console.log('aviso de ISRS');
  for (const q of ['emag', 'uro']) {
    const r = await roda({ id: 'J-' + q, codigo: 'JR' + q.toUpperCase(), respostas: { visita: 'primeira', queixa: q } }, true, { manter: true });
    ok(!r.falha && !r.win.document.getElementById('resultsCard').textContent.includes('Paroxetina + clomipramina'), q + ': sem alerta de paroxetina + clomipramina');
    ok(r.caminho[r.caminho.length - 1] === 'notaFinal', q + ': também termina na nota do atendimento');
    r.win.close();
  }
  const rEp4 = await roda({ id: 'J-ep4', codigo: 'JREP4', respostas: { visita: 'primeira', queixa: 'ep', p0: 3, p1: 3, p2: 3, p3: 2, p4: 2, parox: 'sim' } }, true, { manter: true });
  // v2.5-P: um alerta só, curto, nas observações — e nunca o texto longo antigo
  ok(!rEp4.falha && rEp4.conduta.protocolo === 'EP-4' && rEp4.win.document.getElementById('resultsCard').textContent.includes('Paroxetina + clomipramina: o spray não deve passar de 1 jato por dia.')
    && !/Nunca associar paroxetina/.test(rEp4.win.document.body.textContent),
    'EP-4 (paroxetina + clomipramina): alerta único de 1 jato aparece');
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

  // ---- número da reavaliação: só primeira e reavaliações contam ---------------
  // recepção, TEFI, preenchimento etc. ficam em pacientes/<COD>/ciclos, mas não
  // são reavaliação; antes o app usava o total de registros e inflava o número
  console.log('número da reavaliação');
  const DE2 = { protocolo: 'DE-2', kitCodes: ['BASE-T10', 'NOITE-1', 'SP-DE'], iief: 12 };
  const reav = (id, ciclos) => roda({ id, codigo: id, respostas: Object.assign({ visita: 'reav', confirmHist: 'ok', queixa: 'de' }, iief14),
    ciclos }, true);
  {
    // limite: primeira + TEFI — o TEFI não pode virar a 1ª reavaliação
    const r = await reav('JRN001', [Object.assign({ tipo: 'primeira', linha: 'DE' }, DE2), { tipo: 'tefi', linha: 'tefi', protocolo: 'TEFI' }]);
    ok(!r.falha && r.salvo && r.salvo.numeroReavaliacao === 1, 'primeira + TEFI: esta é a 1ª reavaliação (gravado ' + (r.salvo && r.salvo.numeroReavaliacao) + ')');
    const r2 = await reav('JRN002', [
      { tipo: 'recepcao', linha: 'recepcao' },
      Object.assign({ tipo: 'primeira', linha: 'DE' }, DE2),
      { tipo: 'recepcao', linha: 'recepcao' },
      { tipo: 'tefi', linha: 'tefi', protocolo: 'TEFI' },
      { tipo: 'preench-inicial', linha: 'preenchimento', protocolo: 'PREENCH' },
      Object.assign({ tipo: 'reavaliacao', linha: 'DE' }, DE2),
      Object.assign({ tipo: 'reavaliacao', linha: 'DE' }, DE2)]);
    ok(!r2.falha && r2.salvo && r2.salvo.numeroReavaliacao === 3,
      'primeira + TEFI + preenchimento + 2 reavaliações + recepções: esta é a 3ª (gravado ' + (r2.salvo && r2.salvo.numeroReavaliacao) + ')');
    ok(/^Tipo de visita: 3ª reavaliação$/m.test(r2.texto || ''), 'o texto do prontuário traz "3ª reavaliação"');
  }
  {
    // modo rede: /api/paciente devolve total = len(ciclos), com a recepção dentro
    const agora = Date.now(), dia = 86400000;
    const ciclos = [
      Object.assign({ codigo: 'MX0900', tipo: 'primeira', linha: 'DE', data: new Date(agora - 240 * dia).toISOString() }, DE2),
      { codigo: 'MX0900', tipo: 'recepcao', linha: 'recepcao', data: new Date(agora - 180 * dia).toISOString() },
      Object.assign({ codigo: 'MX0900', tipo: 'reavaliacao', linha: 'DE', data: new Date(agora - 180 * dia).toISOString() }, DE2),
      { codigo: 'MX0900', tipo: 'recepcao', linha: 'recepcao', data: new Date(agora - 120 * dia).toISOString() },
      { codigo: 'MX0900', tipo: 'tefi', linha: 'tefi', protocolo: 'TEFI', data: new Date(agora - 120 * dia).toISOString() },
      Object.assign({ codigo: 'MX0900', tipo: 'reavaliacao', linha: 'DE', data: new Date(agora - 60 * dia).toISOString() }, DE2)];
    const resp = (status, obj) => ({ ok: status < 300, status, json: async () => obj });
    const fetchFalso = async url => {
      const u = String(url).replace(/^https?:\/\/[^/]+/, '');
      if (u === '/api/health') return resp(200, { ok: true, versao: 2, senha: true });
      if (u === '/api/sessao') return resp(200, { perfil: 'medico' });
      if (u === '/api/triagens-hoje') return resp(200, { triagens: [] });
      if (u === '/api/pacientes') return resp(200, { pacientes: [{ codigo: 'MX0900' }] });
      if (u === '/api/historico/MX0900') return resp(200, { ciclos });
      // como servidor_maximus.py: último ciclo e total de TODOS os registros
      if (u === '/api/paciente/MX0900') return resp(200, { ciclo: ciclos[ciclos.length - 1], total: ciclos.length, ultimaData: ciclos[ciclos.length - 1].data });
      return resp(404, {});
    };
    const { doc, erros } = await abreApp({}, w => {
      delete w.claude; w.fetch = fetchFalso;
      w.sessionStorage.setItem('maximus_sessao_medico', 'tok-teste');
    }, 'http://clinica.local:8080/');
    clica(doc, 'novo'); await avanca(doc);
    clica(doc, 'reav'); await avanca(doc);
    const inp = doc.querySelector('#optsWrap input.fld');
    inp.value = 'MX0900'; inp.dispatchEvent(new doc.defaultView.Event('input')); await avanca(doc);
    const card = doc.getElementById('quizCard');
    ok(tela(doc) === 'confirmHist' && /3ª reavaliação — a última foi há 60 dias/.test(card.textContent),
      'modo rede: 1 primeira + 2 reavaliações + TEFI + 2 recepções → "3ª reavaliação" (servidor diz total ' + ciclos.length + ')');
    ok(/3ª reavaliação/.test(doc.getElementById('painelCard').textContent), 'o painel do paciente mostra a 3ª reavaliação');
    ok(!erros.length, 'sem erro de JS' + (erros.length ? ' — ' + erros[0] : ''));
  }

  // ---- histórico do paciente: botão fixo e janela própria -------------------
  console.log('histórico do paciente');
  {
    const dia = n => new Date(Date.now() - n * 86400000).toISOString();
    const mem = { recepcao: [], codigos: [{ codigo: 'MX0005' }],
      'pacientes/MX0005/ciclos': [
        { codigo: 'MX0005', tipo: 'recepcao', linha: 'recepcao', iniciais: 'JS', telefone: '(21)91111-2222', data: dia(200) },
        { codigo: 'MX0005', tipo: 'primeira', dataBR: '01/01/2026', data: dia(200), protocolo: 'DE-2', kitCodes: ['BASE-T10', 'NOITE-1', 'SP-DE'],
          iief: 12, adam: ['nenhum'], adamPositivo: false, comorbidades: ['has'], comorbControle: 'sim', alergias: ['anest'], medsRisco: [],
          notaAtendimento: 'Paciente ansioso com o desempenho.' },
        { codigo: 'MX0005', tipo: 'tefi', linha: 'tefi', dataBR: '15/02/2026', data: dia(150), protocolo: 'Via oral mantida',
          tefiExame: { farmaco: 'R5 (trimix clássico) — padrão da clínica', dose: '0,1 mL', g10: 4, g20: 4, g30: 3, eau: true, psv: 38, edv: 2, ir: 0.95 } },
        { codigo: 'MX0005', tipo: 'reavaliacao', numeroReavaliacao: 1, dataBR: '01/03/2026', data: dia(120), protocolo: 'DE-3',
          kitCodes: ['BASE-T20', 'NOITE-1', 'SP-DE'], iief: 17, adesao: 'parcial', ea: 'leve', eaQuais: ['cefaleia'], satisf: 7,
          mudanca: 'Subiu para DE-3', protocoloAnterior: 'DE-2', adam: ['nenhum'], comorbidades: ['has'], comorbControle: 'sim', alergias: ['anest'], medsRisco: [] }
      ] };
    const { win, doc, erros } = await abreApp(mem);
    const btn = doc.getElementById('histBtn');
    ok(!visivel(btn), 'sem paciente carregado, o botão do histórico fica escondido');
    clica(doc, 'novo'); await avanca(doc);
    clica(doc, 'reav'); await avanca(doc);
    const inp = doc.querySelector('#optsWrap input.fld');
    inp.value = 'MX0005'; inp.dispatchEvent(new win.Event('input')); await espera(10);
    await avanca(doc);
    ok(tela(doc) === 'confirmHist', 'retorno com histórico chega à confirmação');
    ok(visivel(btn), 'paciente com histórico: o botão fixo do histórico aparece');
    btn.click(); await espera(40);
    const ov = doc.getElementById('histOverlay');
    const txt = doc.getElementById('histCorpo').textContent;
    ok(ov.style.display === 'flex', 'o histórico abre em janela própria');
    ok(/Atendimentos registrados\s*3/.test(txt), 'conta só os atendimentos clínicos, sem a passagem pela recepção');
    const i1 = txt.indexOf('01/01/2026 · Primeira avaliação'), i2 = txt.indexOf('15/02/2026 · TEFI'), i3 = txt.indexOf('01/03/2026 · 1ª reavaliação');
    ok(i1 >= 0 && i1 < i2 && i2 < i3, 'atendimentos em ordem cronológica, com data e tipo');
    // v2.2: sigla sempre seguida do ativo, no formato "DE-2 · ativo"
    // v2.5: BASE-T20 já diz substância e dose — não é expandida
    ok(/DE-2 · cápsula matinal com tadalafila 10 mg/.test(txt) && /BASE-T20/.test(txt) && !/BASE-T20 \(/.test(txt), 'protocolos com composição e dose; sigla autoexplicativa sem repetir a dose');
    ok(/12 → 17/.test(txt.replace(/\s*\(\d{2}\/\d{2}\/\d{4}\)/g, '')), 'síntese traz a evolução do IIEF-5');
    ok(/Paciente ansioso com o desempenho/.test(txt), 'a nota do médico entra no histórico');
    ok(/Critério EAU\s*atendido/.test(txt) && /PSV 38 cm\/s/.test(txt), 'TEFI resumido com os achados');
    ok((txt.match(/Hipertensão arterial/g) || []).length === 1, 'antecedente que não mudou não se repete na visita seguinte');
    ok(/Efeitos adversos\s*leves, toleráveis: Cefaleia/.test(txt), 'reavaliação traz adesão e efeitos adversos');
    const antes = tela(doc);
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: '1', bubbles: true })); await espera(20);
    ok(tela(doc) === antes && ov.style.display === 'flex', 'com o histórico aberto, teclas não mexem no atendimento por trás');
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await espera(10);
    ok(ov.style.display === 'none' && tela(doc) === antes && !visivel(doc.getElementById('panoramaCard')),
      'Esc fecha o histórico e volta exatamente onde estava');
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'h', bubbles: true })); await espera(40);
    ok(ov.style.display === 'flex', 'a tecla H abre o histórico');
    doc.getElementById('histFechar').click();
    ok(!erros.length, 'sem erro de JS' + (erros.length ? ' — ' + erros[0] : ''));
    ok(!(win.__mxVigia || []).length, 'vigia sem acusação');
  }
  {
    const mem = { recepcao: [], codigos: [] };
    const { doc } = await abreApp(mem);
    clica(doc, 'novo'); await avanca(doc);
    clica(doc, 'primeira'); await avanca(doc);
    ok(!visivel(doc.getElementById('histBtn')), 'primeira avaliação: sem botão de histórico');
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

  // ---- cabeçalho: nome do app e versão ------------------------------------------
  console.log('cabeçalho');
  {
    const doc = new JSDOM(HTML).window.document;
    const v = doc.getElementById('versaoApp');
    ok(doc.querySelector('.tool-title .t1').textContent === 'Painel de atendimento Maximus', 'o cabeçalho traz o nome do app');
    ok(!!v && /^\d+\.\d+\.\d+$/.test(v.dataset.versao) && v.textContent.includes('Versão ' + v.dataset.versao),
      'abaixo do nome aparece a versão atual');
  }

  console.log('\n=== JORNADA ===\nfalhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})();
