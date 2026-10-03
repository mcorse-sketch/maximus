// Interface v2.3 (paridade com o mockup v3): atalhos de teclado, tema manual,
// busca de paciente, selo "nova · motivo", módulos dispensados, conduta em
// 3 níveis e impressão das seções recolhidas.
//
// A parte principal é a equivalência do ⌘↵: para cada paciente da regressão,
// responde tudo, volta ao começo pelo panorama e pede a conduta com ⌘↵ (em vez
// de clicar Próxima até o fim). Protocolo, kit, escores e o texto do prontuário
// têm de sair idênticos ao caminho normal.
//
// Uso: node teste_interface.js [app] [--rapido]   (--rapido: 12 pacientes)
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { preenche } = require('./regressao');
const PACIENTES = require('./regressao/pacientes');

const args = process.argv.slice(2);
const ARQ = args.find(a => !a.startsWith('--')) || path.join(__dirname, '../apps/triagem.html');
const RAPIDO = args.includes('--rapido');
const HTML = fs.readFileSync(ARQ, 'utf8');
const espera = ms => new Promise(r => setTimeout(r, ms));
const visivel = el => !!el && el.style.display !== 'none' && !el.hidden;

let falhas = 0;
const ok = (cond, nome, extra) => {
  console.log((cond ? '  ok     ' : '  FALHA  ') + nome + (!cond && extra ? '\n         ' + extra : ''));
  if (!cond) falhas++;
};

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
  (p && p.ciclos || []).forEach((c, k, todos) => {
    const d = new Date(hoje - (todos.length - k) * 60 * 86400000);
    const reg = Object.assign({ codigo: p.codigo, data: d.toISOString(), dataLocal: d.toISOString().slice(0, 10) }, c);
    (mem['pacientes/' + p.codigo + '/ciclos'] = mem['pacientes/' + p.codigo + '/ciclos'] || []).push(reg);
  });
  if (p && p.memExtra) for (const k in p.memExtra) mem[k] = (mem[k] || []).concat(p.memExtra[k]);
  return mem;
}
async function abre(mem, opc) {
  opc = opc || {};
  const erros = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { const m = String(e && e.message); if (!/Not implemented/.test(m)) erros.push('jsdomError: ' + m); });
  const dom = new JSDOM(HTML, {
    url: 'file:///app/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.claude = { use: async () => fakeDb(mem) };
      w.onerror = (m) => { erros.push('window.onerror: ' + m); };
      w.addEventListener('unhandledrejection', ev => erros.push('rejeicao: ' + ev.reason));
      w.print = () => {}; w.open = () => null; w.scrollTo = () => {};
      w.confirm = () => true;
      // file:// não tem localStorage no jsdom: um substituto em memória
      const guardado = {};
      Object.defineProperty(w, 'localStorage', { configurable: true, value: {
        getItem: k => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = String(v); },
        removeItem: k => { delete guardado[k]; } } });
      if (opc.antes) opc.antes(w);
    }
  });
  await espera(40);
  return { win: dom.window, doc: dom.window.document, erros };
}
const tecla = (win, key, extra) => {
  const alvo = win.document.activeElement || win.document.body;
  alvo.dispatchEvent(new win.KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, extra || {})));
};

// responde até a última tela; com viaAtalho, volta ao início pelo panorama e usa ⌘↵
async function atendimento(p, viaAtalho) {
  const mem = montaBanco(p);
  const { win, doc, erros } = await abre(mem);
  const respostas = Object.assign({ origem: 'novo', codigo: p.codigo }, p.respostas);
  const quiz = doc.getElementById('quizCard'), results = doc.getElementById('resultsCard'), next = doc.getElementById('nextBtn');
  let falha = null, ultima = null, rep = 0, usouAtalho = false;
  for (let passo = 0; passo < 140 && !falha; passo++) {
    if (visivel(results)) break;
    const pan = doc.getElementById('panoramaCard');
    if (visivel(pan)) { doc.getElementById('panSeguir').click(); await espera(5); continue; }
    const tela = quiz.getAttribute('data-tela');
    if (tela === ultima) { if (++rep > 3) { falha = 'travou em ' + tela; break; } } else rep = 0;
    ultima = tela;
    try { preenche(doc, win, tela, respostas[tela]); } catch (e) { falha = tela + ': ' + e.message; break; }
    if (viaAtalho && !usouAtalho && /conduta/i.test(next.textContent)) {
      // tudo respondido: volta ao primeiro módulo clínico e pede a conduta com ⌘↵
      usouAtalho = true;
      tecla(win, 'p'); await espera(20);
      const mods = [...doc.querySelectorAll('#panoramaCard .pan-mod')];
      if (!visivel(doc.getElementById('panoramaCard')) || !mods.length) { falha = 'P não abriu o panorama'; break; }
      (mods[1] || mods[0]).click(); await espera(10);
      const telaVolta = quiz.getAttribute('data-tela');
      if (telaVolta === tela) { falha = 'não voltou para o início pelo panorama'; break; }
      tecla(win, 'Enter', { ctrlKey: true });
      for (let k = 0; k < 200 && !visivel(results); k++) await espera(10);
      break;
    }
    if (next.disabled) { falha = tela + ': avançar desabilitado'; break; }
    // caminho normal: metade das vezes pela seta ↓, que tem de fazer o mesmo que o botão
    if (passo % 2) tecla(win, 'ArrowDown'); else next.click();
    await espera(15);
  }
  await espera(60);
  if (!falha && !visivel(results)) falha = 'não chegou à conduta';
  if (viaAtalho && !usouAtalho && !falha) falha = 'não passou pela última tela antes da conduta';
  const ciclos = mem['pacientes/' + p.codigo + '/ciclos'] || [];
  const salvo = ciclos.length > (p.ciclos || []).length ? ciclos[ciclos.length - 1] : null;
  const texto = (win.__textoCopia || '').replace(/\d{2}\/\d{2}\/\d{4}/g, '<data>').replace(/há \d+ dias/g, 'há <n> dias');
  const cab = doc.getElementById('mxCdHead');
  const r = {
    falha, erros, texto,
    conduta: salvo ? { protocolo: salvo.protocolo || null, kit: salvo.kitCodes || [], iief: salvo.iief ?? null, pedt: salvo.pedt ?? null } : null,
    cabecalho: cab && visivel(cab) ? cab.textContent : null,
    pilulas: (() => {
      const temDE = salvo && salvo.iief != null, temEP = salvo && salvo.pedt != null;
      if (!temDE && !temEP) return true;
      const cd = doc.getElementById('classDesc'), rep = doc.getElementById('report');
      const par = n => n && n.querySelector('.mx-qn') && n.querySelector('.mx-qv');
      return !!(par(cd) && par(rep) && (!cab || !visivel(cab) || par(cab)));
    })(),
    cabDentroDaImpressao: !!(cab && doc.getElementById('printArea').contains(cab))
  };
  win.close();
  return r;
}

(async () => {
  // ---------- tema ----------
  console.log('\n--- tema claro/escuro');
  {
    const a = await abre({ recepcao: [], codigos: [] });
    ok(a.doc.documentElement.getAttribute('data-tema') === 'claro', 'sem preferência do aparelho: tema claro');
    tecla(a.win, 't'); await espera(5);
    ok(a.doc.documentElement.getAttribute('data-tema') === 'escuro', 'T alterna para escuro');
    ok(a.win.localStorage.getItem('mx-tema') === 'escuro', 'a escolha fica guardada (localStorage mx-tema)');
    a.doc.getElementById('mxTemaBtn').click(); await espera(5);
    ok(a.doc.documentElement.getAttribute('data-tema') === 'claro', 'o botão ◐ também alterna');
    a.win.close();
    const escuro = w => { w.matchMedia = q => ({ matches: /dark/.test(q), media: q, addEventListener() {}, removeEventListener() {} }); };
    const b = await abre({ recepcao: [], codigos: [] }, { antes: escuro });
    ok(b.doc.documentElement.getAttribute('data-tema') === 'escuro', 'aparelho em modo escuro: abre escuro');
    b.win.close();
    const c = await abre({ recepcao: [], codigos: [] }, { antes: w => { escuro(w); w.localStorage.setItem('mx-tema', 'claro'); } });
    ok(c.doc.documentElement.getAttribute('data-tema') === 'claro', 'escolha manual vale mais que o aparelho');
    c.win.close();
    ok(/@media screen\{\s*html\[data-tema="escuro"\]/.test(HTML), 'cores escuras só na tela (impressão continua clara)');
    // v2.5: caixas iguais (flex 1 1 0), mesma altura, rótulo sem quebra e tecla embaixo; o
    // display do Histórico não leva !important (senão o "esconder" não funciona)
    ok(/\.mx-acts \.btn,\.mx-acts \.hist-btn\{[^}]*flex:1 1 0[^}]*height:46px[^}]*white-space:nowrap/.test(HTML)
       && !/\.mx-acts \.btn,\.mx-acts \.hist-btn\{[^}]*display:inline-flex!important/.test(HTML), 'Prontuário / Histórico / Panorama: caixas iguais, mesma altura, rótulo sem quebra');
  }

  // ---------- atalhos, busca, pendência ----------
  console.log('\n--- atalhos e busca');
  {
    const hoje = new Date();
    const fila = [{ codigo: 'MXF001', iniciais: 'A.B.', hora: '14:20', data: hoje.toISOString(), dataLocal: hoje.toISOString().slice(0, 10),
      queixaRecepcao: 'de', idade: 50, respostas: { i0: 3, i1: 3, i2: 3, i3: 3, i4: 3 } }];
    const mem = { recepcao: fila, codigos: [{ codigo: 'MXH001' }], pacientes: [],
      'pacientes/MXH001/ciclos': [{ codigo: 'MXH001', tipo: 'primeira', linha: 'DE', protocolo: 'DE-2', iief: 14,
        data: new Date(Date.now() - 60 * 86400000).toISOString(), kitCodes: ['BASE-T5'] }] };
    const a = await abre(mem);
    const { win, doc } = a;
    await espera(60);
    tecla(win, '?'); await espera(5);
    ok(doc.getElementById('mxAjuda').classList.contains('on'), '? abre a lista de atalhos');
    ok(/Ir para a conduta/.test(doc.getElementById('mxAjuda').textContent) && !/Revisar conduta/.test(doc.getElementById('mxAjuda').textContent) && /Tema claro/.test(doc.getElementById('mxAjuda').textContent), 'a lista mostra ⌘↵, T e os demais');
    tecla(win, 'Escape'); await espera(5);
    ok(!doc.getElementById('mxAjuda').classList.contains('on'), 'Esc fecha a lista de atalhos');
    tecla(win, 'k', { ctrlKey: true }); await espera(30);
    ok(doc.getElementById('mxBusca').classList.contains('on'), '⌘K / Ctrl+K abre a busca');
    ok(/MXF001/.test(doc.getElementById('mxBuscaLista').textContent), 'a busca lista a fila de hoje');
    const tela = () => doc.getElementById('quizCard').getAttribute('data-tela');
    const telaAntes = tela();
    tecla(win, 'Enter'); await espera(80);
    ok(doc.getElementById('mxBusca').classList.contains('on') && visivel(doc.getElementById('mxBIniciar')) && visivel(doc.getElementById('mxBConsultar')),
      'Enter na busca NÃO inicia: oferece "Iniciar atendimento" e "Só consultar prontuário"');
    ok(tela() === telaAntes, 'escolher na busca não mexe no fluxo', 'tela: ' + tela());
    ok(/Iniciar atendimento/.test(doc.getElementById('mxBIniciar').textContent) && /Só consultar prontuário/.test(doc.getElementById('mxBConsultar').textContent), 'textos dos dois botões');
    tecla(win, 'Escape'); await espera(10);
    ok(doc.getElementById('mxBusca').classList.contains('on') && !doc.getElementById('mxBIniciar'), 'Esc na escolha volta à lista');
    tecla(win, 'Enter'); await espera(30);
    doc.getElementById('mxBIniciar').click(); await espera(120);
    ok(!doc.getElementById('mxBusca').classList.contains('on'), '"Iniciar atendimento" fecha a busca');
    ok(!['origem', 'daFila'].includes(tela()), '"Iniciar atendimento" abre o paciente da fila pelo caminho normal', 'tela: ' + tela());
    // anda até uma tela obrigatória sem resposta e tenta ⌘↵
    let t0 = null;
    for (let k = 0; k < 20; k++) {
      await espera(10);
      const pan = doc.getElementById('panoramaCard');
      if (visivel(pan)) { doc.getElementById('panSeguir').click(); continue; }
      if (doc.getElementById('nextBtn').disabled) { t0 = tela(); break; }
      tecla(win, 'ArrowDown');
    }
    ok(!!t0, '↓ avança pelas telas já respondidas', 'parou sem tela pendente');
    tecla(win, 'Enter', { ctrlKey: true }); await espera(60);
    ok(tela() === t0 && !visivel(doc.getElementById('resultsCard')), '⌘↵ com pergunta obrigatória em aberto não gera conduta e fica nela');
    ok(/Falta responder/.test(doc.getElementById('mxToast').textContent), '… e avisa o que falta');
    ok(/^Ir para a conduta/.test(doc.getElementById('mxRevisar').textContent.trim()), 'o botão diz "Ir para a conduta ⌘↵"');
    {
      const box = doc.getElementById('mxFaltam');
      const itens = box ? [...box.querySelectorAll('li button[data-i]')] : [];
      const m = box ? box.textContent.match(/Falta responder (\d+) perguntas?:/) : null;
      ok(visivel(box) && m && +m[1] === itens.length && itens.length >= 1, 'mostra "Falta responder N perguntas:" com a lista', box ? box.textContent.slice(0, 120) : 'sem caixa');
      ok(itens.some(b => b.classList.contains('atual')), 'a pergunta onde parou aparece marcada na lista');
      if (itens.length > 1) {
        const alvo = itens[itens.length - 1], idx = +alvo.dataset.i;
        alvo.click(); await espera(20);
        ok(doc.getElementById('quizCard').getAttribute('data-tela') !== t0, 'clicar num item pula para aquela pergunta');
        ok(visivel(doc.getElementById('mxFaltam')), 'a lista continua visível enquanto houver pendência');
        const volta = [...doc.querySelectorAll('#mxFaltam li button[data-i]')].find(b => !b.classList.contains('atual'));
        if (volta) { volta.click(); await espera(20); }
      } else {
        ok(true, 'clicar num item pula para aquela pergunta (só uma pendente)');
        ok(true, 'a lista continua visível enquanto houver pendência');
      }
      ok(!/\[object Object\]/.test(doc.body.textContent), 'nenhum texto "[object Object]" na tela (prévia e lista)');
      doc.querySelector('#mxFaltam .mx-faltam-x').click(); await espera(5);
      ok(!visivel(doc.getElementById('mxFaltam')), '× fecha a lista');
    }
    const antes = tela();
    tecla(win, 'ArrowUp'); await espera(20);
    ok(tela() !== antes || visivel(doc.getElementById('panoramaCard')), '↑ volta uma pergunta');
    ok(/Fila de hoje/.test(doc.getElementById('mxFilaTopo').textContent), 'barra superior mostra a fila de hoje');
    // ⌘K no meio do atendimento: "só consultar" abre o prontuário sem perder nada
    {
      const tAntes = tela(), progAntes = doc.getElementById('mxProgTxt').textContent;
      tecla(win, 'k', { ctrlKey: true }); await espera(30);
      const campo = doc.getElementById('mxBuscaCampo'); campo.value = 'MXH'; campo.dispatchEvent(new win.Event('input')); await espera(10);
      ok(/MXH001/.test(doc.getElementById('mxBuscaLista').textContent), 'a busca acha paciente do banco');
      tecla(win, 'Enter'); await espera(30);
      ok(/em curso/i.test(doc.getElementById('mxBuscaLista').textContent), 'com atendimento em curso, a escolha avisa que consultar não muda nada');
      doc.getElementById('mxBConsultar').click(); await espera(80);
      const ov = doc.getElementById('histOverlay');
      ok(ov.style.display === 'flex' && /MXH001/.test(doc.getElementById('histTitulo').textContent) && /só consulta/.test(doc.getElementById('histTitulo').textContent),
        '"Só consultar prontuário" abre a gaveta de MXH001 em modo leitura', doc.getElementById('histTitulo').textContent);
      ok(/Somente leitura/.test(doc.getElementById('histCorpo').textContent) && /DE-2/.test(doc.getElementById('histCorpo').textContent), 'a gaveta mostra o histórico e diz que é só leitura');
      ok(tela() === tAntes && doc.getElementById('mxProgTxt').textContent === progAntes, 'o atendimento em curso continua igual por trás da gaveta');
      doc.getElementById('histFechar').click(); await espera(20);
      ok(ov.style.display !== 'flex' && tela() === tAntes, 'fechar a gaveta volta exatamente para a pergunta onde estava');
    }
    // "Fila de hoje" vira botão: popup a qualquer momento
    {
      const tAntes = tela();
      doc.getElementById('mxFilaTopo').click(); await espera(60);
      const sh = doc.getElementById('mxFilaSheet');
      ok(sh.classList.contains('on'), '"Fila de hoje" abre o popup no meio do atendimento');
      const txt = doc.getElementById('mxFilaCorpo').textContent;
      ok(/Aguardando\s*1/.test(txt) && /MXF001/.test(txt) && /(Novo|Retorno)/.test(txt) && /(esperando há|previsto)/.test(txt),
        'popup lista quem espera, tempo de espera e novo × retorno', txt.slice(0, 160));
      ok(/em atendimento/.test(txt), 'o paciente atual aparece como "em atendimento"');
      ok(/Atendidos hoje\s*0/.test(txt), 'popup separa os já atendidos');
      tecla(win, 'Escape'); await espera(10);
      ok(!sh.classList.contains('on') && tela() === tAntes, 'Esc fecha o popup e volta ao atendimento atual');
    }
    ok(a.erros.length === 0, 'sem erro de JS', a.erros.slice(0, 3).join(' | '));
    win.close();
  }

  // ---------- abertura: "Consultar prontuário" ----------
  console.log('\n--- abertura: consultar prontuário (só leitura)');
  {
    const mem = { recepcao: [], codigos: [{ codigo: 'MXH002' }],
      'pacientes/MXH002/ciclos': [{ codigo: 'MXH002', tipo: 'primeira', linha: 'EP', protocolo: 'EP-1', pedt: 12,
        data: new Date(Date.now() - 30 * 86400000).toISOString() }] };
    const a = await abre(mem); const { win, doc } = a;
    await espera(60);
    const b = doc.getElementById('mxConsultaInicio');
    ok(!!b && doc.getElementById('quizCard').getAttribute('data-tela') === 'origem' && /Consultar prontuário/.test(b.textContent), 'a tela inicial tem "Consultar prontuário"');
    b.click(); await espera(40);
    ok(doc.getElementById('mxBusca').classList.contains('on') && /Só consulta/.test(doc.getElementById('mxBuscaRodape').textContent), 'abre a busca em modo consulta');
    tecla(win, 'Enter'); await espera(80);
    ok(doc.getElementById('histOverlay').style.display === 'flex' && /MXH002/.test(doc.getElementById('histTitulo').textContent), 'no modo consulta, escolher abre direto o prontuário');
    ok(doc.getElementById('quizCard').getAttribute('data-tela') === 'origem' && !(mem['pacientes/MXH002/ciclos'].length > 1), 'nenhum atendimento iniciado, nada gravado');
    ok(a.erros.length === 0, 'sem erro de JS', a.erros.slice(0, 3).join(' | '));
    win.close();
  }

  // ---------- concluir atendimento ----------
  console.log('\n--- concluir atendimento: marca atendido, tira da fila, chama o próximo');
  {
    const hoje = new Date();
    const mk = (cod, ini, min) => { const d = new Date(hoje.getTime() - min * 60000);
      return { codigo: cod, iniciais: ini, tipo: 'recepcao', linha: 'recepcao', hora: d.toTimeString().slice(0, 5), data: d.toISOString(),
        dataLocal: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
        queixaRecepcao: 'de', idade: 50, respostas: { i0: 3, i1: 3, i2: 3, i3: 3, i4: 3 } }; };
    const mem = { recepcao: [mk('MXF101', 'A.A.', 40), mk('MXF102', 'B.B.', 20)], codigos: [] };
    const a = await abre(mem); const { win, doc } = a;
    const resp = { origem: 'fila', daFila: 'MXF101' };
    let chegou = false;
    for (let k = 0; k < 120; k++) {
      await espera(12);
      if (visivel(doc.getElementById('resultsCard'))) { chegou = true; break; }
      const pan = doc.getElementById('panoramaCard');
      if (visivel(pan)) { doc.getElementById('panSeguir').click(); continue; }
      const t = doc.getElementById('quizCard').getAttribute('data-tela');
      try { preenche(doc, win, t, resp[t]); } catch (e) { break; }
      doc.getElementById('nextBtn').click();
    }
    await espera(80);
    ok(chegou, 'paciente da fila chega à conduta');
    const cb = doc.getElementById('concluirBtn');
    ok(visivel(cb) && /Concluir atendimento/.test(cb.textContent) && visivel(doc.getElementById('restartBtn')), 'tela final tem "Concluir atendimento" além de "Novo paciente"');
    const ciclosAntes = (mem['pacientes/MXF101/ciclos'] || []).length;
    cb.click(); await espera(250);
    const at = mem.atendidos || [];
    ok(at.length === 1 && at[0].codigo === 'MXF101' && at[0].atendido === true && at[0].recepcao === mem.recepcao[0].data, 'marca MXF101 como atendido (registro da recepção de hoje)', JSON.stringify(at));
    ok(mem.recepcao.length === 2 && mem.recepcao[0].codigo === 'MXF101', 'o registro da recepção não é apagado');
    ok((mem['pacientes/MXF101/ciclos'] || []).length === ciclosAntes && ciclosAntes >= 1, 'o ciclo clínico continua no histórico');
    const tela = doc.getElementById('quizCard').getAttribute('data-tela');
    const opts = [...doc.querySelectorAll('#optsWrap .opt')].map(o => o.dataset.v);
    ok(tela === 'daFila' && opts.indexOf('MXF101') < 0 && opts.indexOf('MXF102') >= 0, 'volta à fila sem o atendido', tela + ' ' + JSON.stringify(opts));
    ok(!!doc.querySelector('#optsWrap .opt.selected[data-v="MXF102"], #optsWrap .opt.on[data-v="MXF102"], #optsWrap .opt[aria-pressed="true"][data-v="MXF102"]') || /MXF102/.test(doc.getElementById('mxToast').textContent),
      'o próximo (MXF102) já vem indicado', doc.getElementById('mxToast').textContent);
    ok(/Fila de hoje\s*1/.test(doc.getElementById('mxFilaTopo').textContent), 'contador da fila cai para 1');
    doc.getElementById('mxFilaTopo').click(); await espera(60);
    ok(/Atendidos hoje\s*1/.test(doc.getElementById('mxFilaCorpo').textContent), 'o popup mostra 1 atendido hoje');
    tecla(win, 'Escape'); await espera(10);
    ok(a.erros.length === 0, 'sem erro de JS', a.erros.slice(0, 3).join(' | '));
    win.close();
  }

  // ---------- nova · motivo e dispensados ----------
  console.log('\n--- nova · motivo e módulos dispensados');
  {
    const a = await abre({ recepcao: [], codigos: [] });
    const { win, doc } = a;
    const resp = { origem: 'novo', visita: 'primeira', codigo: 'MXT001', queixa: 'de', comorb: ['has', 'dm'] };
    let viuNova = null, viuDisp = false;
    for (let k = 0; k < 40; k++) {
      await espera(15);
      const pan = doc.getElementById('panoramaCard');
      if (visivel(pan)) { doc.getElementById('panSeguir').click(); continue; }
      const t = doc.getElementById('quizCard').getAttribute('data-tela');
      if (/dispensado/.test(doc.getElementById('mxDisp').textContent)) viuDisp = true;
      if (t === 'comorbCtrl'){ const n = doc.getElementById('mxNova'); viuNova = visivel(n) ? n.textContent : ''; break; }
      try { preenche(doc, win, t, resp[t]); } catch (e) { break; }
      doc.getElementById('nextBtn').click();
    }
    ok(viuNova !== null && /nova/.test(viuNova) && /Comorbidades/.test(viuNova), 'pergunta que surge por uma resposta leva "nova · por causa de …"', 'selo: ' + viuNova);
    ok(viuDisp, 'o trilho lista os módulos dispensados com o motivo');
    win.close();
  }

  // ---------- impressão: racional e custo saem abertos ----------
  console.log('\n--- impressão');
  {
    let escrito = '';
    const falsa = { document: { open() {}, write(h) { escrito += h; }, close() {} }, focus() {}, print() {} };
    const a = await abre({ recepcao: [], codigos: [] }, { antes: w => { w.open = () => falsa; } });
    const { doc } = a;
    ok(doc.getElementById('mxDetRac') && doc.getElementById('mxDetRac').tagName === 'DETAILS' && !doc.getElementById('mxDetRac').open, 'na tela o racional começa recolhido');
    doc.getElementById('racBox').innerHTML = '<p>teste</p>'; doc.getElementById('custoBox').innerHTML = '<div>5 de 10</div>';
    doc.getElementById('printBtn').click(); await espera(5);
    ok(/<details open class="mx-det" id="mxDetRac"/.test(escrito) && /<details open class="mx-det" id="mxDetCusto"/.test(escrito), 'no relatório impresso racional e custo saem abertos');
    ok(!/mxCdHead/.test(escrito), 'o cabeçalho de tela da conduta não vai para a impressão');
    a.win.close();
  }

  // ---------- ⌘↵ = caminho normal ----------
  console.log('\n--- ⌘↵ leva à mesma conduta do caminho normal');
  const lista = RAPIDO ? PACIENTES.filter((_, k) => k % 6 === 0) : PACIENTES;
  let iguais = 0, difs = 0, cabecalhos = 0, pilulas = 0;
  for (const p of lista) {
    const normal = await atendimento(p, false);
    const atalho = await atendimento(p, true);
    const mesmo = !normal.falha && !atalho.falha
      && JSON.stringify(normal.conduta) === JSON.stringify(atalho.conduta) && normal.texto === atalho.texto;
    if (mesmo) iguais++;
    else {
      difs++;
      console.log('  FALHA  ' + p.id + ' ' + (p.descricao || ''));
      if (normal.falha) console.log('         normal: ' + normal.falha);
      if (atalho.falha) console.log('         ⌘↵: ' + atalho.falha);
      if (JSON.stringify(normal.conduta) !== JSON.stringify(atalho.conduta)) console.log('         conduta: ' + JSON.stringify(normal.conduta) + ' ≠ ' + JSON.stringify(atalho.conduta));
      else if (normal.texto !== atalho.texto) console.log('         texto do prontuário diferente');
    }
    if ([...normal.erros, ...atalho.erros].length) { difs++; console.log('  FALHA  ' + p.id + ' erro de JS: ' + [...normal.erros, ...atalho.erros][0]); }
    // protocolo em código (DE-3, DUO-4…) aparece grande; nome longo (ex.: consulta) cede o lugar à classificação
    const pr = normal.conduta ? String(normal.conduta.protocolo || '') : '';
    const curto = /^[A-Z0-9][A-Z0-9+\-]{0,13}$/.test(pr);
    if (normal.pilulas) pilulas++; else console.log('         escores sem pílula em ' + p.id);
    if (normal.cabecalho && !normal.cabDentroDaImpressao && (!curto || normal.cabecalho.indexOf(pr) >= 0)) cabecalhos++;
    else console.log('         cabeçalho de ' + p.id + ': ' + JSON.stringify((normal.cabecalho || '').slice(0, 120)) + ' / protocolo ' + pr);
  }
  falhas += difs;
  ok(pilulas === lista.length, 'escores: nome do questionário e valor em pílulas separadas (classificação, relatório, cabeçalho)', pilulas + ' de ' + lista.length);
  ok(cabecalhos === lista.length, 'cabeçalho da conduta (nível 1) mostra o protocolo e fica fora da impressão', cabecalhos + ' de ' + lista.length);
  console.log('\n=== INTERFACE v2.3 ===');
  console.log('pacientes: ' + lista.length + ' | ⌘↵ igual ao caminho normal: ' + iguais + ' | diferentes: ' + (lista.length - iguais));
  console.log('falhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})();
