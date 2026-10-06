// v2.4 — retorno e questionários da recepção (itens 4 e 5 da fila de correções).
// Só interface e fluxo: a conduta é conferida pela regressão (etapa 6) e pelo
// banco fictício (etapa 7f). Aqui se confere o que o médico vê e por onde passa.
//
// Uso: node teste_retorno.js [app]
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { preenche } = require('./regressao');

const ARQ = process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '../apps/triagem.html');
const HTML = fs.readFileSync(ARQ, 'utf8');
const espera = ms => new Promise(r => setTimeout(r, ms));
const A = require('./assenta');   // v2.5-M: espera por condição, não por tempo
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
async function abre(mem, ctl) {
  const erros = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => { const m = String(e && e.message); if (!/Not implemented/.test(m)) erros.push('jsdomError: ' + m); });
  const dom = new JSDOM(HTML, {
    url: 'file:///app/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.claude = { use: async () => fakeDb(mem) };
      w.onerror = m => { erros.push('window.onerror: ' + m); };
      w.print = () => {}; w.open = () => null; w.scrollTo = () => {};
      w.confirm = msg => { ctl.confirmou.push(msg); return ctl.resposta; };
      const g = {};
      Object.defineProperty(w, 'localStorage', { configurable: true, value: {
        getItem: k => (k in g ? g[k] : null), setItem: (k, v) => { g[k] = String(v); }, removeItem: k => { delete g[k]; } } });
    }
  });
  // v2.5-K: o app usa o próprio diálogo (não mais o confirm nativo) — o teste responde nele como o médico
  const obs = new dom.window.MutationObserver(() => {
    const ov = dom.window.document.querySelector('.mx-dlg-ov:not([data-visto])'); if (!ov) return;
    ov.dataset.visto = '1'; ctl.confirmou.push(ov.textContent);
    setTimeout(() => { const b = ov.querySelector(ctl.resposta ? '[data-v="1"]' : '[data-v="0"]'); if (b) b.click(); }, 0);
  });
  obs.observe(dom.window.document.documentElement, { childList: true, subtree: true });
  const d0 = dom.window.document;
  await A.ate(dom.window, () => !!d0.getElementById('quizCard') && !!d0.getElementById('quizCard').getAttribute('data-tela'), 3000);
  await A.assenta(dom.window, { quieto: 10 });
  return { win: dom.window, doc: dom.window.document, erros };
}
const hojeISO = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// paciente DUO em retorno: primeira avaliação gravada pelo app atual (ficha estável,
// caracterização e ADAM) + questionário da recepção de hoje, item a item
function banco() {
  const d0 = new Date(Date.now() - 66 * 86400000), agora = new Date(Math.max(Date.now() - 20 * 60000, new Date().setHours(0, 0, 0, 0) + 60000));   // v2.5-K: nunca no dia anterior
  const primeira = { codigo: 'MXR001', tipo: 'primeira', data: d0.toISOString(), dataLocal: hojeISO(d0), protocolo: 'DUO-3', kitCodes: ['BASE-T5', 'MOD-PAROX-10', 'SP-DE'],
    iief: 14, pedt: 15, tempo: 'medio', parceria: 'fixa', contraCV: 'nao', fertilidade: 'nao', previaTrat: 'nunca', previaAdequado: null, alergias: [],
    medsRisco: [], comorbidades: [], topicoPref: 'ambos', psiquiatrico: 'nao', frequencia: 'alta', biotens: 22, mast: 'sim', matinal: 'nao', adam: ['a1', 'a7'],
    iniciais: 'RTA', telefone: '(21)90000-0001' };
  const rec = { codigo: 'MXR001', tipo: 'recepcao', linha: 'recepcao', iniciais: 'RTA', telefone: '(21)90000-0001', hora: agora.toTimeString().slice(0, 5),
    data: agora.toISOString(), dataLocal: hojeISO(agora), queixaRecepcao: 'ambos', retorno: true, iief: 17, pedt: 11, adam: [],
    usoRelatado: 'total', efeitoRelatado: 'nao', satisfRelatada: 8,
    respostas: { i0: 4, i1: 4, i2: 3, i3: 3, i4: 3, p0: 2, p1: 2, p2: 2, p3: 3, p4: 2 } };
  return { recepcao: [rec], codigos: [{ codigo: 'MXR001' }], 'pacientes/MXR001/ciclos': [primeira] };
}

(async () => {
  console.log('--- retorno vindo da fila: identificação, queixa, ficha estável, evolução, ADAM, recepção');
  const mem = banco();
  const recAntes = JSON.stringify(mem.recepcao);
  const ctl = { confirmou: [], resposta: false };
  const { win, doc, erros } = await abre(mem, ctl);
  const quiz = doc.getElementById('quizCard'), next = doc.getElementById('nextBtn');
  const tela = () => quiz.getAttribute('data-tela');
  const opcoes = () => [...doc.querySelectorAll('#optsWrap .opt')];
  const qtexto = () => doc.getElementById('qText').textContent.replace(/\s+/g, ' ').trim();
  const optsTexto = () => doc.getElementById('optsWrap').textContent.replace(/\s+/g, ' ');
  const clica = v => { const b = opcoes().find(o => o.dataset.v === v); if (b && !b.classList.contains('selected')) b.click(); return !!b; };
  const R = { origem: 'fila', daFila: 'MXR001', adesao: 'total', ea: 'nao', caracteriza: { mast: 'sim', matinal: 'sim' } };
  const caminho = [];
  const vistos = {};
  // anda até a tela pedida, respondendo o resto como o paciente/médico padrão
  async function ate(alvo, max) {
    for (let k = 0; k < (max || 60); k++) {
      await A.assenta(win);
      if (visivel(doc.getElementById('resultsCard'))) return false;
      const pan = doc.getElementById('panoramaCard');
      if (visivel(pan)) { doc.getElementById('panSeguir').click(); continue; }
      const t = tela();
      if (caminho[caminho.length - 1] !== t) caminho.push(t);
      if (!vistos[t]) vistos[t] = { texto: qtexto(), opts: opcoes().map(o => o.dataset.v), conteudo: optsTexto(), sel: opcoes().filter(o => o.classList.contains('selected')).map(o => o.dataset.v) };
      if (t === alvo) return true;
      try { preenche(doc, win, t, R[t]); } catch (e) { console.log('  (preenche ' + t + ': ' + e.message + ')'); return false; }
      next.click();
    }
    return false;
  }
  const seg = async () => { next.click(); await A.assenta(win); };

  ok(await ate('confirmHist'), 'chega à identificação do retorno');
  ok(JSON.stringify(opcoes().map(o => o.dataset.v)) === '["ok"]' && /Confirmar e continuar/.test(optsTexto()) && !/Corrigir protocolo/.test(optsTexto()),
    'identificação do retorno: só "Confirmar e continuar" (sem "Corrigir protocolo ou escores anteriores")', optsTexto());

  ok(await ate('trocarQueixa'), 'chega à tela da queixa');
  // v2.5 (item 6): "Queixa mantida?" com a queixa em tratamento; opções de queixa só em "Nova queixa"
  ok(/^Queixa mantida\?/.test(qtexto()) && /Em tratamento: disfunção erétil e ejaculação precoce/.test(qtexto() + optsTexto()),
    'queixa do retorno: "Queixa mantida?" mostrando a queixa em tratamento', qtexto());
  ok(!/Mudar a queixa|Confirmado, seguir/.test(optsTexto()) && JSON.stringify(opcoes().map(o => o.dataset.v)) === '["nao","sim"]'
     && /Mantida — disfunção erétil e ejaculação precoce/.test(optsTexto()) && /Nova queixa/.test(optsTexto()), 'opções "Mantida — …" / "Nova queixa"', optsTexto());
  clica('sim'); await seg();
  ok(tela() === 'novaQueixa' && opcoes().every(o => o.dataset.v !== 'de' && o.dataset.v !== 'ep'), '"Sim" pergunta a nova queixa, sem repetir as que já estão em tratamento', tela() + ' ' + opcoes().map(o => o.dataset.v));
  doc.getElementById('backBtn').click(); await A.assenta(win);
  ok(tela() === 'trocarQueixa', 'voltar da nova queixa devolve à pergunta');
  clica('nao'); await seg();

  ok(await ate('confirmaEstavel'), 'chega à ficha estável');
  const est = vistos.confirmaEstavel;
  ok(qtexto() === 'Algum destes mudou?' && !/Algo mudou desde a última consulta|confirmo tudo acima/.test(optsTexto()), 'ficha estável: "Algum destes mudou?" (sem o antigo "Algo mudou… / Nada mudou, confirmo tudo acima")', qtexto());
  ok(['nao', 'contra', 'alergia', 'comorb', 'meds', 'parceira', 'freq', 'biotens', 'depre', 'fert'].every(v => est.opts.indexOf(v) >= 0),
    'cada item estável é uma linha (alergia, antecedentes, medicação, parceria, EP, fertilidade)', JSON.stringify(est.opts));
  // v2.5 (itens 1 e 7): o que é do passado não entra em "Algum destes mudou?"
  ok(['tempo', 'previa', 'topico', 'adam'].every(v => est.opts.indexOf(v) < 0),
    'sem início dos sintomas, medicação antes da clínica, restrição a tópico nem ADAM em "Algum destes mudou?"', JSON.stringify(est.opts));
  ok(/Alergias\?\s*antes: nenhuma conhecida/.test(est.conteudo) && /Parceria fixa\?\s*antes: sim, parceria fixa/.test(est.conteudo) && /Além do que a clínica prescreveu, alguma medicação mudou ou iniciou outra\?\s*antes:/.test(est.conteudo),
    'pergunta curta com a resposta anterior ao lado; medicação: "Além do que a clínica prescreveu…"', est.conteudo.slice(0, 300));
  ok(est.opts.indexOf('adam') < 0, 'ADAM com sintomas na primeira avaliação não vira linha (tem tela de evolução própria)');
  clica('meds'); await A.assenta(win);
  clica('alergia'); await A.assenta(win);
  ok(!opcoes().find(o => o.dataset.v === 'nao').classList.contains('selected'), 'marcar um item tira o "Nada mudou"');
  opcoes().find(o => o.dataset.v === 'alergia').click(); await A.assenta(win);
  await seg();
  ok(tela() === 'medsRisco' && opcoes().filter(o => o.classList.contains('selected')).map(o => o.dataset.v).join() === 'nenhuma',
    'só o item marcado volta, com a resposta anterior já marcada para editar', tela() + ' ' + opcoes().filter(o => o.classList.contains('selected')).map(o => o.dataset.v));
  ok(/além do que a clínica prescreveu/.test(qtexto()), 'a tela de medicação do retorno diz "além do que a clínica prescreveu"', qtexto());
  clica('beta'); await A.assenta(win);
  ok(opcoes().filter(o => o.classList.contains('selected')).map(o => o.dataset.v).join() === 'beta', 'marcar betabloqueador tira o "nenhuma"');
  await seg();

  ok(await ate('caracteriza'), 'chega à ereção fora da relação');
  // v2.5 (item 3): só pergunta o que falhava (matinal); masturbação satisfatória segue como está
  ok(!/masturbação/.test(optsTexto()) && /Agora acorda com ereção matinal\? \(\d{2}\/\d{2}\/\d{4}: não \/ raramente\)/.test(optsTexto())
     && JSON.stringify([...doc.querySelectorAll('.gopts[data-campo]')].map(g => g.dataset.campo)) === '["matinal"]',
    'evolução da ereção: só o que falhava na última consulta (matinal), sem a masturbação já satisfatória', optsTexto().slice(0, 300));

  ok(await ate('adamEvol'), 'ADAM: tela de evolução (não reaplica o questionário)');
  const camposAdam = [...doc.querySelectorAll('.gopts[data-campo]')].map(g => g.dataset.campo);
  ok(JSON.stringify(camposAdam) === '["adamEv_a1","adamEv_a7","adamNovo"]' && /Diminuição do desejo sexual/.test(optsTexto()) && /Ereções menos fortes/.test(optsTexto()),
    'mostra só o que ele marcou antes e pergunta se melhorou', JSON.stringify(camposAdam));
  R.adamEvol = { adamEv_a1: 'nao', adamEv_a7: 'sim', adamNovo: 'nao' };

  ok(await ate('refazer'), 'chega à confirmação dos questionários da recepção');
  ok(/^O paciente respondeu na recepção: IIEF-5\s*17 \(disfunção erétil leve\) e PEDT\s*11 \(ejaculação precoce confirmada\)\. Confirma\?$/.test(qtexto()),
    'confirmação explícita: "O paciente respondeu na recepção: IIEF-5 17 (…) e PEDT 11 (…). Confirma?"', qtexto());
  ok(doc.querySelector('#qText .mx-qn') && doc.querySelector('#qText .mx-qv'), 'nome do questionário e escore em pílulas separadas');
  ok(JSON.stringify(opcoes().map(o => o.dataset.v)) === '["nao","rev_iief","rev_pedt"]' && /Confirmo/.test(optsTexto()) && /Revisar o IIEF-5 com o paciente/.test(optsTexto()),
    'opções "Confirmo" / "Revisar … com o paciente"', optsTexto());
  ok(vistos.adam === undefined && caminho.indexOf('adam') < 0, 'o ADAM completo não foi reaplicado');
  ok(['alergia', 'contra', 'tempo', 'parceira', 'previa', 'fert', 'freq', 'biotens', 'topico', 'depre', 'comorb'].every(t => caminho.indexOf(t) < 0),
    'alergias, antecedentes e demais itens estáveis não foram perguntados de novo', caminho.join(' > '));
  clica('rev_iief'); await seg();
  ok(tela() === 'i0' && opcoes().some(o => o.classList.contains('selected') && o.dataset.v === '4'), 'Revisar abre só o IIEF-5, com a resposta da recepção já marcada', tela());
  clica('2'); await seg();
  for (let k = 0; k < 3; k++) await seg();
  ok(tela() === 'i4', 'percorre só as cinco perguntas do IIEF-5', tela());
  // volta à confirmação pela lista da seção: mostra o revisado e oferece desfazer
  const irConf = () => { const b = [...doc.querySelectorAll('button[data-ir]')].find(x => /respondeu na recep/.test(x.textContent)); if (b) b.click(); return !!b; };
  ok(irConf(), 'a confirmação continua na lista da seção (não sumiu)'); await A.assenta(win);
  ok(tela() === 'refazer' && /Revisado com o paciente: IIEF-5\s*17 → 15/.test(optsTexto()), 'a confirmação mostra "Revisado com o paciente: IIEF-5 17 → 15"', tela() + ' ' + optsTexto().slice(0, 200));
  ok(opcoes().some(o => o.dataset.v === 'restaurar'), 'oferece "Voltar às respostas da recepção"');
  ctl.resposta = false; clica('restaurar'); await seg();
  ok(ctl.confirmou.length === 1 && /Desfazer a revisão/.test(ctl.confirmou[0]), 'desfazer a revisão pede confirmação', JSON.stringify(ctl.confirmou));
  ok(tela() === 'i0' && opcoes().some(o => o.classList.contains('selected') && o.dataset.v === '2'), 'recusada a confirmação, nada muda (resposta revisada mantida)', tela());
  irConf(); await A.assenta(win);
  ctl.resposta = true; clica('restaurar'); await seg();
  // restaurado, o módulo "Escores e resposta" fica completo e o app volta ao panorama
  // (fluxo normal de fim de módulo); reabre o módulo e vai à confirmação pela lista
  const pan = doc.getElementById('panoramaCard');
  ok(visivel(pan) && /Módulo concluído: Escores e resposta/.test(pan.textContent), 'confirmado o desfazer, segue o fluxo normal (panorama: módulo concluído)');
  const modEsc = [...doc.querySelectorAll('#panoramaCard .pan-mod')].find(b => /Escores e resposta/.test(b.textContent));
  if (modEsc) modEsc.click(); await A.assenta(win);
  irConf(); await A.assenta(win);
  ok(tela() === 'refazer' && !/→/.test(optsTexto()) && !opcoes().some(o => o.dataset.v === 'restaurar'), 'confirmado, volta às respostas da recepção', tela() + ' ' + optsTexto().slice(0, 200));
  clica('nao'); await seg();
  const chegou = !(await ate('__nenhuma__', 80)) && visivel(doc.getElementById('resultsCard'));
  ok(chegou, 'chega à conduta');
  const ciclos = mem['pacientes/MXR001/ciclos'];
  const salvo = ciclos[ciclos.length - 1];
  ok(ciclos.length === 2 && salvo.iief === 17 && salvo.pedt === 11, 'grava o retorno com os escores da recepção', JSON.stringify({ n: ciclos.length, iief: salvo.iief, pedt: salvo.pedt }));
  ok(JSON.stringify(salvo.medsRisco) === '["beta"]' && JSON.stringify(salvo.alergias || []) === '[]' && salvo.contraCV === 'nao' && salvo.fertilidade === 'nao',
    'item mudado (medicação) grava o novo; o resto vem da ficha', JSON.stringify({ m: salvo.medsRisco, a: salvo.alergias, c: salvo.contraCV, f: salvo.fertilidade }));
  ok(JSON.stringify(salvo.adam) === '["a1"]', 'ADAM de hoje = o que não melhorou (a1)', JSON.stringify(salvo.adam));
  ok(salvo.mast === 'sim' && salvo.matinal === 'sim', 'caracterização gravada com os mesmos valores de sempre (sim/nao)');
  ok(JSON.stringify(mem.recepcao) === recAntes, 'o registro da recepção não foi alterado nem apagado');
  ok(erros.length === 0, 'sem erro de JS', erros.slice(0, 3).join(' | '));
  win.close();

  // ---- recepção mandou só os totais: mesma pergunta explícita, Revisar não some a tela
  console.log('\n--- recepção só com os totais');
  {
    const m2 = banco();
    delete m2.recepcao[0].respostas; m2.recepcao[0].queixaRecepcao = 'de'; m2.recepcao[0].pedt = null;
    m2['pacientes/MXR001/ciclos'][0].protocolo = 'DE-2'; m2['pacientes/MXR001/ciclos'][0].pedt = null;
    const c2 = { confirmou: [], resposta: true };
    const a = await abre(m2, c2);
    const q2 = a.doc.getElementById('quizCard');
    const R2 = { origem: 'fila', daFila: 'MXR001', usarTotaisRec: 'nao' };
    let viu = null, seguinte = null;
    for (let k = 0; k < 60; k++) {
      await A.assenta(a.win);
      if (visivel(a.doc.getElementById('resultsCard'))) break;
      const pan = a.doc.getElementById('panoramaCard');
      if (visivel(pan)) { a.doc.getElementById('panSeguir').click(); continue; }
      const t = q2.getAttribute('data-tela');
      if (viu && !seguinte && t !== 'usarTotaisRec') { seguinte = t; break; }
      if (t === 'usarTotaisRec') viu = a.doc.getElementById('qText').textContent.replace(/\s+/g, ' ');
      try { preenche(a.doc, a.win, t, R2[t]); } catch (e) { break; }
      a.doc.getElementById('nextBtn').click();
    }
    ok(viu && /O paciente respondeu na recepção: IIEF-5\s*17 \(disfunção erétil leve\)\. Confirma\?/.test(viu), 'só totais: "O paciente respondeu na recepção: IIEF-5 17 (…). Confirma?"', viu);
    ok(seguinte === 'i0', '"Revisar com o paciente" aplica o IIEF-5 logo em seguida', seguinte);
    ok(a.erros.length === 0, 'sem erro de JS', a.erros.slice(0, 3).join(' | '));
    a.win.close();
  }

  console.log('\n=== RETORNO E RECEPÇÃO (v2.4) ===');
  console.log('falhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})();
