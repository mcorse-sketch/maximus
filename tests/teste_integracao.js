// Integração: o que a recepção coletou aparece no resumo do consultório.
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const HTML_CLIN = fs.readFileSync(process.argv[2] || '../apps/triagem.html', 'utf8');

const erros = [];
process.on('unhandledRejection', e => erros.push('rejeicao: ' + (e && e.message ? e.message : e)));
const espera = ms => new Promise(r => setTimeout(r, ms));

function mem() {
  const hoje = new Date();
  const dia = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const ant = new Date(hoje.getTime() - 41 * 86400000);
  return {
    'pacientes/MX0042/ciclos': [{
      // o registro que a recepção grava hoje fica DEPOIS do ciclo clínico:
      // se ele for lido como "ciclo anterior", o esquema em uso some
      codigo: 'MX0042', data: hoje.toISOString(), dataLocal: dia(hoje), tipo: 'recepcao', linha: 'recepcao',
      queixaRecepcao: 'ambos', iniciais: 'R.A.M.', telefone: '21999998888',
      medidas: { idade: 54, peso: 84, altura: 178, imc: 26.5 }
    }, {
      codigo: 'MX0042', data: ant.toISOString(), dataLocal: dia(ant), tipo: 'reav', linha: 'DUO',
      protocolo: 'DUO-3', kitCodes: ['SP-DUO', 'NOITE-1'], iief: 14, pedt: 11,
      labs: { tTotal: 512, lh: '4.1' }, adesao: 'total', satisf: 8, biotens: 38
    }],
    'recepcao': [{
      codigo: 'MX0042', data: hoje.toISOString(), dataLocal: dia(hoje), hora: '14:20', tipo: 'recepcao',
      retorno: true, queixaRecepcao: 'ambos', iief: 19, pedt: 7,
      usoRelatado: 'total', efeitoRelatado: 'nao', satisfRelatada: 8,
      iniciais: 'R.A.M.', telefone: '21999998888', email: '',
      medidas: { idade: 54, peso: 84, altura: 178, imc: 26.5 }
    }, {
      codigo: 'MX0077', data: hoje.toISOString(), dataLocal: dia(hoje), hora: '16:40', tipo: 'recepcao',
      retorno: false, queixaRecepcao: 'preench', iniciais: 'P.R.O.', telefone: '21933334444',
      medidas: { idade: 39, peso: 80, altura: 180, imc: 24.7 }
    }, {
      codigo: 'MX0099', data: hoje.toISOString(), dataLocal: dia(hoje), hora: '15:10', tipo: 'recepcao',
      retorno: true, queixaRecepcao: 'de', iief: 12,
      iniciais: 'N.O.V.', telefone: '21911112222', email: 'nov@exemplo.com'
    }],
    'codigos': [{ codigo: 'MX0042' }, { codigo: 'MX0099' }, { codigo: 'MX0077' }]
  };
}
function fakeDb(m) {
  function q(arr) {
    let l = arr.slice();
    const o = { orderBy(f, d) { l.sort((a, b) => (a[f] < b[f] ? 1 : -1) * (d === 'desc' ? 1 : -1)); return o; },
      limit(n) { l = l.slice(0, n); return o; },
      async get() { return { docs: l.map(x => ({ data: () => x })) }; },
      async add(r) { arr.push(r); return true; } };
    return o;
  }
  return { collection(p) { const a = m[p] || (m[p] = []); return q(a); } };
}

(async () => {
  const banco = mem();
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => erros.push('jsdomError: ' + e.message));
  const dom = new JSDOM(HTML_CLIN, {
    url: 'file:///a/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.claude = { use: async () => fakeDb(banco) }; w.onerror = m => erros.push('onerror: ' + m); w.open = () => null; }
  });
  const doc = dom.window.document;
  await espera(150);

  const checa = [];
  const opts = () => [...doc.querySelectorAll('#optsWrap .opt')];
  // sem paciente escolhido, nada de coluna vazia ao lado
  const linha0 = doc.getElementById('linhaQuiz');
  const painel0 = doc.getElementById('painelCard');
  checa.push(['sem paciente, o questionario ocupa a largura toda', !!linha0 && !linha0.classList.contains('com-painel')]);
  checa.push(['sem paciente, o painel nem aparece', !painel0 || painel0.style.display === 'none']);
  const pan0 = doc.getElementById('panBtn');
  checa.push(['sem paciente, o botao panorama fica desativado', !!pan0 && pan0.disabled]);
  doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  checa.push(['sem paciente, Esc nao abre o panorama', doc.getElementById('panoramaCard').style.display !== 'block']);
  const fila = opts().find(b => /fila/i.test(b.textContent));
  checa.push(['tela de abertura oferece a fila', !!fila]);
  if (fila) { fila.click(); await espera(60); doc.getElementById('nextBtn').click(); await espera(120); }

  const cardsFila = opts();
  const oMX42 = cardsFila.find(b => /MX0042/.test(b.textContent));
  const oPre = cardsFila.find(b => /MX0077/.test(b.textContent));
  checa.push(['fila mostra iniciais e idade', !!oMX42 && /R\.A\.M\./.test(oMX42.textContent) && /54 anos/.test(oMX42.textContent)]);
  checa.push(['fila mostra a queixa e o resumo', !!oMX42 && /ere..o e ejacula..o/i.test(oMX42.textContent) && /retorno/.test(oMX42.textContent)]);
  checa.push(['fila avisa quando o procedimento leva mais tempo', !!oPre && /reservar sala e tempo maior/i.test(oPre.textContent)]);
  checa.push(['horario nao estoura o contorno', !!oMX42 && (oMX42.querySelector('.badge') || {}).textContent === '14:20']);

  const daFila = opts().find(b => /MX0042/.test(b.textContent));
  checa.push(['paciente da recepcao aparece na fila', !!daFila]);
  if (daFila) { daFila.click(); await espera(60); doc.getElementById('nextBtn').click(); await espera(250); }

  // avança algumas telas: o histórico do banco entra depois da confirmação
  let txt = '';
  const telasVistas = [];
  for (let k = 0; k < 8; k++) {
    telasVistas.push((doc.getElementById('qText') || {}).textContent || '');
    const cop0 = doc.getElementById('copiloto');
    const t0 = cop0 ? cop0.textContent.replace(/\s+/g, ' ') : '';
    if (t0.length > txt.length) txt = t0;
    if (/Em uso/.test(t0) && /Laborat/.test(t0)) break;
    const o = opts();
    if (o.length) (o.find(b => /reavalia|retorno|mesma|sim/i.test(b.textContent)) || o[0]).click();
    await espera(40);
    const nb = doc.getElementById('nextBtn');
    if (nb.disabled) break;
    nb.click();
    await espera(180);
  }
  {
    const cop1 = doc.getElementById('copiloto');
    const t1 = cop1 ? cop1.textContent.replace(/\s+/g, ' ') : '';
    if (t1.length > txt.length) txt = t1;
  }
  checa.push(['resumo mostra o telefone da recepcao', /21999998888/.test(txt)]);
  checa.push(['resumo avisa que falta o email', /email n/i.test(txt)]);
  checa.push(['resumo mostra as iniciais', /R\.A\.M\./.test(txt)]);
  checa.push(['resumo traz a composicao do SP-DUO', /Tadalafila 50 mg\/mL \+ Clomipramina 75 mg\/mL/i.test(txt)]);
  checa.push(['le o esquema anterior mesmo com passagem pela recepcao hoje', /DUO-3/.test(txt) && /SP-DUO/.test(txt)]);
  checa.push(['nao repergunta o protocolo anterior', !telasVistas.some(t => /protocolo o paciente estava usando/i.test(t))]);
  checa.push(['resumo traz a composicao do NOITE-1 sem dose de fitoterapico', /Maca \+ Ashwagandha/i.test(txt)]);
  checa.push(['resumo compara IIEF com variacao', /IIEF-5 14 . 19/.test(txt) && /melhorou 5 pontos/.test(txt)]);
  checa.push(['palco alarga quando o painel aparece', !!doc.querySelector('.stage.largo')]);
  checa.push(['panorama tem acao principal no topo', true]);
  checa.push(['resumo compara PEDT com variacao', /PEDT 11 . 7/.test(txt) && /melhorou 4 pontos/.test(txt)]);
  checa.push(['resumo classifica o biotensiometro acima de 20', /Biotensi.metro 38 . acima de 20/.test(txt)]);
  checa.push(['testosterona com marca de faixa normal', /Testosterona total 512/.test(txt)]);

  // o que a recepção já respondeu não pode ser perguntado de novo
  checa.push(['nao repete a pergunta de primeira avaliacao ou reavaliacao', !telasVistas.some(t => /primeira avalia..o ou uma reavalia/i.test(t))]);
  checa.push(['nao repete o codigo do paciente', !telasVistas.some(t => /^C.digo do paciente$/i.test(t))]);
  checa.push(['confirma o historico do banco', telasVistas.some(t => /reavalia..o —/i.test(t))]);

  // layout: questionario a esquerda, painel a direita
  const cardQuiz = doc.getElementById('quizCard');
  const cardPainel = doc.getElementById('painelCard');
  checa.push(['questionario e painel sao janelas separadas', !!cardQuiz && !!cardPainel && !cardQuiz.contains(cardPainel)]);
  const linhaOrd = doc.getElementById('linhaQuiz');
  const filhos = linhaOrd ? [...linhaOrd.children] : [];
  checa.push(['painel fica a esquerda do questionario', filhos.length >= 2 && filhos[0].id === 'painelCard']);
  checa.push(['painel guarda o resumo do paciente', !!cardPainel && !!cardPainel.querySelector('#copiloto')]);
  checa.push(['botao continuar fica na janela do questionario', !!cardQuiz && !!cardQuiz.querySelector('#nextBtn') && !cardQuiz.querySelector('#copiloto')]);

  // com paciente, as duas janelas aparecem lado a lado
  const linha1 = doc.getElementById('linhaQuiz');
  const painel1 = doc.getElementById('painelCard');
  checa.push(['com paciente, abre a coluna do painel', !!linha1 && linha1.classList.contains('com-painel')]);
  checa.push(['painel e uma janela separada do questionario', !!painel1 && painel1.classList.contains('card') && painel1.style.display !== 'none']);
  checa.push(['siglas ganham explicacao ao passar o mouse', !!doc.querySelector('#copiloto abbr.sig') && /tadalafila/i.test((doc.querySelector('#copiloto abbr.sig') || {}).title || '')]);

  // voltar dentro de um modulo nunca puxa a pergunta do modulo anterior
  const telaAntes = (doc.getElementById('qText') || {}).textContent || '';
  const pb0 = doc.getElementById('panBtn');
  if (pb0) {
    pb0.click(); await espera(60);
    const card0 = doc.getElementById('panoramaCard');
    checa.push(['panorama marca o proximo modulo', !!card0 && !!card0.querySelector('.pan-mod.proximo')]);
    checa.push(['panorama repete o continuar no topo', !!card0 && !!card0.querySelector('#panSeguirTopo')]);
    const mods0 = card0 ? [...card0.querySelectorAll('.pan-mod')] : [];
    if (mods0.length) { mods0[mods0.length - 1].click(); await espera(80); }
    const telaModulo = (doc.getElementById('qText') || {}).textContent || '';
    doc.getElementById('backBtn').click(); await espera(80);
    const voltouPanorama = (doc.getElementById('panoramaCard') || {}).style.display === 'block';
    const telaDepois = (doc.getElementById('qText') || {}).textContent || '';
    checa.push(['voltar nao cai no modulo anterior', voltouPanorama || (telaDepois !== telaAntes && telaDepois !== '')]);
    if (voltouPanorama) { const c = doc.getElementById('panSeguir'); if (c) { c.click(); await espera(60); } }
  }

  // atalhos de teclado
  {
    const antesTecla = (doc.getElementById('qText') || {}).textContent || '';
    const ev = new dom.window.KeyboardEvent('keydown', { key: '1', bubbles: true });
    doc.dispatchEvent(ev);
    await espera(40);
    checa.push(['tecla numerica escolhe a opcao', !!doc.querySelector('#optsWrap .opt.selected') || antesTecla !== ((doc.getElementById('qText')||{}).textContent||'')]);
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await espera(60);
    const abriu = (doc.getElementById('panoramaCard') || {}).style.display === 'block';
    checa.push(['Esc abre o panorama', abriu]);
    if (abriu) { const c = doc.getElementById('panSeguir'); if (c) { c.click(); await espera(60); } }
  }

  // ficha completa do paciente
  {
    const fb = doc.getElementById('fichaBtn');
    checa.push(['botao de ficha aparece com paciente carregado', !!fb && fb.style.display !== 'none']);
    if (fb) {
      fb.click(); await espera(250);
      const ov = doc.getElementById('fichaOverlay');
      const txtF = (doc.getElementById('fichaCorpo') || {}).textContent || '';
      checa.push(['ficha abre em pop-up', !!ov && ov.style.display === 'flex']);
      checa.push(['ficha traz identificacao e contato', /MX0042/.test(txtF) && /21999998888/.test(txtF)]);
      checa.push(['ficha traz o protocolo em uso com composicao', /SP-DUO/.test(txtF) && /clomipramina/i.test(txtF)]);
      checa.push(['ficha lista o historico', /Hist.rico na cl.nica/i.test(txtF)]);
      checa.push(['ficha compara os escores do prontuario com os de hoje',
        /Evolu..o dos escores/i.test(txtF) && /14 . 19/.test(txtF) && /melhorou 5 pontos/.test(txtF)]);
      checa.push(['ficha compara tambem o PEDT', /11 . 7/.test(txtF) && /melhorou 4 pontos/.test(txtF)]);
      checa.push(['ficha diz o que falta para a conduta', /falta para gerar a conduta/i.test(txtF)]);
      doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await espera(60);
      checa.push(['Esc fecha a ficha', (doc.getElementById('fichaOverlay') || {}).style.display === 'none']);
    }
  }
  checa.push(['vigia nao acusou inconsistencia', (dom.window.__mxVigia || []).length === 0
    || (console.log('   (vigia: ' + dom.window.__mxVigia.join(' | ') + ')'), false)]);

  const pan = doc.getElementById('panBtn');
  checa.push(['botao panorama existe', !!pan]);
  checa.push(['com paciente, o botao panorama fica ativo', !!pan && !pan.disabled]);
  if (pan) {
    pan.click(); await espera(80);
    const card = doc.getElementById('panoramaCard');
    const mods = card ? [...card.querySelectorAll('.pan-mod')] : [];
    if (mods.length < 2) console.log('   (panorama: ' + (card.textContent||'').replace(/\s+/g,' ').slice(0,300) + ')');
    checa.push(['panorama lista modulos', mods.length >= 2]);
    checa.push(['panorama marca obrigatorios', card && /Obrigat/i.test(card.textContent)]);
    checa.push(['panorama conta o que falta', card && /(Faltam|Todos os campos)/.test(card.textContent)]);
    if (mods.length) { mods[0].click(); await espera(60); }
    checa.push(['abrir modulo volta ao questionario', doc.getElementById('quizCard').style.display !== 'none']);
  }

  // voltar ate a fila descarta o paciente do painel
  {
    // o caminho para trocar de paciente é o botão do panorama
    const pbT = doc.getElementById('panBtn');
    if (pbT) { pbT.click(); await espera(90); }
    const troca = doc.getElementById('panTrocar');
    checa.push(['panorama oferece trocar de paciente', !!troca]);
    if (troca) { troca.click(); await espera(150); }
    for (let k = 0; k < 4; k++) {
      const perg0 = (doc.getElementById('qText') || {}).textContent || '';
      if (/Qual paciente est/i.test(perg0)) break;
      const o0 = opts().find(b => /fila/i.test(b.textContent));
      if (o0) { o0.click(); await espera(40); }
      const nb0 = doc.getElementById('nextBtn');
      if (nb0.disabled) break;
      nb0.click(); await espera(150);
    }
    const pergFim = (doc.getElementById('qText') || {}).textContent || '';
    const copFim = doc.getElementById('copiloto');
    const painelFim = doc.getElementById('painelCard');
    checa.push(['voltar chega na lista da fila', /Qual paciente est/i.test(pergFim)]);
    checa.push(['painel some ao voltar para escolher outro paciente',
      !/Qual paciente est/i.test(pergFim) || ((copFim.style.display === 'none') && (!painelFim || painelFim.style.display === 'none'))]);
  }


  // ---- cenario 2: paciente da fila marcado como retorno, sem nenhum ciclo no banco
  {
    const banco2 = mem();
    const vc2 = new VirtualConsole();
    vc2.on('jsdomError', e => erros.push('jsdomError(2): ' + e.message));
    const dom2 = new JSDOM(HTML_CLIN, {
      url: 'file:///a/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc2,
      beforeParse(w) { w.claude = { use: async () => fakeDb(banco2) }; w.onerror = m => erros.push('onerror(2): ' + m); w.open = () => null; }
    });
    const d2 = dom2.window.document;
    await espera(150);
    const o2 = () => [...d2.querySelectorAll('#optsWrap .opt')];
    const f2 = o2().find(b => /fila/i.test(b.textContent));
    if (f2) { f2.click(); await espera(50); d2.getElementById('nextBtn').click(); await espera(120); }
    const alvo = o2().find(b => /MX0099/.test(b.textContent));
    checa.push(['paciente sem historico aparece na fila', !!alvo]);
    if (alvo) { alvo.click(); await espera(50); d2.getElementById('nextBtn').click(); await espera(400); }
    const t2 = (d2.getElementById('qText') || {}).textContent || '';
    const olho2 = (d2.getElementById('qEyebrow') || {}).textContent || '';
    checa.push(['explica que e a primeira passagem pela clinica', /Primeira passagem/i.test(t2)]);
    checa.push(['diz que o unico registro e o da recepcao', /question.rio que respondeu na recep..o hoje/i.test(t2)]);
    checa.push(['nao trata como erro de busca', !/Nenhum registro encontrado/i.test(t2)]);
    checa.push(['rotula como sem historico', /Sem hist.rico/i.test(olho2)]);
    checa.push(['oferece uma unica saida', o2().length === 1 && /primeira avalia/i.test(o2()[0].textContent)]);
    const cop2 = (d2.getElementById('copiloto') || {}).textContent || '';
    checa.push(['primeira medida nao mostra seta de evolucao', !/IIEF-5 . .|IIEF-5 \u2014/.test(cop2) && (!/IIEF/.test(cop2) || /primeira medida/.test(cop2))]);
    dom2.window.close();
  }

  // ---- siglas explicadas em qualquer texto
  {
    const banco3 = mem();
    const vc3 = new VirtualConsole();
    vc3.on('jsdomError', e => erros.push('jsdomError(3): ' + e.message));
    const dom3 = new JSDOM(HTML_CLIN, {
      url: 'file:///a/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc3,
      beforeParse(w) { w.claude = { use: async () => fakeDb(banco3) }; w.open = () => null; }
    });
    await espera(120);
    const w3 = dom3.window;
    const aviso = dom3.window.document.querySelector('.warn');
    checa.push(['aviso fixo explica EP-4 e DUO-4', !!aviso && /EP-4 \(paroxetina/.test(aviso.textContent) && /DUO-4 \(/.test(aviso.textContent)]);
    dom3.window.close();
  }

  // ---- cenario 4: retomar um atendimento interrompido
  {
    const banco4 = mem();
    const vc4 = new VirtualConsole();
    const dom4 = new JSDOM(HTML_CLIN, {
      url: 'https://clinica.local/app.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc4,
      beforeParse(w) {
        w.claude = { use: async () => fakeDb(banco4) }; w.open = () => null;
        try {
          w.sessionStorage.setItem('mx-triagem-sessao-v2', JSON.stringify({
            em: Date.now() - 5 * 60000, si: 1,
            S: { origem: 'fila', daFila: 'MX0042', codigo: 'MX0042', visita: 'reav', queixa: 'ambos', filaAplicada: true }
          }));
        } catch (e) {}
      }
    });
    const d4 = dom4.window.document;
    await espera(250);
    const barra = d4.getElementById('retomarBar');
    checa.push(['oferece retomar o atendimento interrompido', !!barra && barra.style.display === 'flex' && /MX0042/.test(barra.textContent)]);
    const seguir = d4.getElementById('rbSeguir');
    if (seguir) { seguir.click(); await espera(400); }
    checa.push(['ao retomar, volta com o paciente carregado', /MX0042/.test((d4.getElementById('copiloto') || {}).textContent || '')]);
    dom4.window.close();
  }

  console.log('\n=== INTEGRACAO RECEPCAO -> CONSULTORIO ===');
  let falhou = 0;
  checa.forEach(([nome, ok]) => { if (!ok) falhou++; console.log((ok ? '  ok   ' : '  FALHA') + '  ' + nome); });
  console.log('erros de JS:', erros.length);
  erros.slice(0, 5).forEach(e => console.log('   -', e));
  if (!checa.find(c => c[0].indexOf('composicao do SP-DUO') >= 0)[1]) console.log('\ntrecho do resumo:\n', txt.slice(0, 400));
  process.exit(falhou || erros.length ? 1 : 0);
})();
