// v2.5 — fila de correções de 03/10/2026 (pedidos do Dr. Marco em t52/t53).
// Interface e fluxo do retorno, painel, intracavernosa e contato. A conduta é
// conferida pela regressão (etapa 6) e pelo banco fictício (etapa 7f).
//
// Uso: node teste_v25.js
const path = require('path');
const { roda } = require('./regressao');

let falhas = 0;
const ok = (cond, nome, extra) => {
  console.log((cond ? '  ok     ' : '  FALHA  ') + nome + (!cond && extra ? '\n         ' + extra : ''));
  if (!cond) falhas++;
};
const DIA = 86400000;
const iso = d => new Date(Date.now() - d * DIA).toISOString();
const br = d => new Date(Date.now() - d * DIA).toLocaleDateString('pt-BR');
const CONTATO = { iniciais: 'VTE', telefone: '(21)90000-2500', email: 'v25@exemplo.invalid' };
const ESTAVEL = { tempo: 'longo', parceria: 'fixa', contraCV: 'nao', fertilidade: 'nao', previaTrat: 'falhou', previaAdequado: 'sim',
  alergias: [], medsRisco: [], comorbidades: [], topicoPref: 'ambos', psiquiatrico: 'nao', frequencia: 'alta', biotens: 22 };
const iief = t => { const b = Math.floor(t / 5), r = t % 5; const v = [0, 1, 2, 3, 4].map(k => b + (k < r ? 1 : 0)); return { i0: v[0], i1: v[1], i2: v[2], i3: v[3], i4: v[4] }; };
const txt = (doc, sel) => [...doc.querySelectorAll(sel)].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' || ');

(async () => {
  // ---- 1. retorno: ADAM zerado e ereção normalizada na última consulta ----
  console.log('--- retorno: o que já melhorou não volta a ser perguntado');
  {
    const ciclos = [
      Object.assign({ codigo: 'MXV001', tipo: 'primeira', linha: 'DE', data: iso(130), dataBR: br(130), protocolo: 'DE-2', kitCodes: ['BASE-T10', 'NOITE-1', 'SP-DE'],
        iief: 12, mast: 'nao', matinal: 'nao', adam: ['a1', 'a7'] }, ESTAVEL, CONTATO),
      Object.assign({ codigo: 'MXV001', tipo: 'reavaliacao', linha: 'DE', data: iso(65), dataBR: br(65), protocolo: 'DE-2 (mantido)',
        kitCodes: ['BASE-T10', 'NOITE-1', 'SP-DE', 'ONDAS', 'ONDAS'], ondasOpcional: true, iief: 16, mast: 'sim', matinal: 'sim', adam: ['nenhum'] }, ESTAVEL, CONTATO)
    ];
    const r = await roda({ id: 'V1', codigo: 'MXV001', ciclos, respostas: Object.assign({ visita: 'reav', confirmHist: 'ok', trocarQueixa: 'nao',
      adesao: 'total', ea: 'nao', confirmaEstavel: 'nao', satisfNps: { satisf: 8, nps: 9 } }, iief(19)) }, false, { manter: true });
    ok(!r.falha, 'chega à conduta sem resposta sobrando ou faltando', r.falha);
    ok(r.caminho.includes('trocarQueixa') && !r.caminho.includes('queixa'), 'retorno pela busca: "Queixa mantida?" no lugar da lista de queixas', r.caminho.join(' > '));
    ok(['caracteriza', 'adam', 'adamEvol', 'tempo', 'previa', 'adequado', 'topico'].every(t => !r.caminho.includes(t)),
      'não pergunta ereção fora da relação (já normal), ADAM (zerado), início, medicação prévia nem tópico', r.caminho.join(' > '));
    const s = r.salvo || {};
    ok(s.mast === 'sim' && s.matinal === 'sim' && JSON.stringify(s.adam) === '["nenhum"]' && s.tempo === 'longo' && s.previaTrat === 'falhou' && s.topicoPref === 'ambos',
      'grava o que veio da última consulta (ereção normal, ADAM zerado, dados do passado)', JSON.stringify({ m: s.mast, t: s.matinal, a: s.adam, tp: s.tempo, p: s.previaTrat, to: s.topicoPref }));
    const doc = r.win.document;
    const emUso = [...doc.querySelectorAll('#copiloto .bloco')].find(b => /^Em uso/.test(b.textContent.trim()));
    const tEmUso = emUso ? emUso.textContent.replace(/\s+/g, ' ') : '';
    ok(/Protocolo DE-2 mantido · prontuário \d{2}\/\d{2}\/\d{4}/.test(tEmUso), 'painel: "Protocolo DE-2 mantido · prontuário dd/mm/aaaa"', tEmUso);
    ok((tEmUso.match(/ONDAS/g) || []).length === 1 && (tEmUso.match(/NOITE-1/g) || []).length === 1, 'painel: ONDAS e NOITE-1 uma vez só (registro antigo com ONDAS repetida)', tEmUso);
    ok(!/cápsula|matinal|conforme o nível| ou 20/.test(tEmUso) && /BASE-T10(?! ·)/.test(tEmUso), 'painel: sem apresentação/horário/dose contraditória; BASE-T10 sem explicação', tEmUso);
    ok(/oferecidas, confirmar se aceitou/.test(tEmUso) && !/em curso/.test(tEmUso), 'ondas só oferecidas no ciclo anterior não viram "em curso"', tEmUso);
    ok(!doc.querySelector('#copiloto .sig-ativo'), 'painel sem composição automática ao lado das siglas');
    r.win.close();
  }

  // ---- 2. retorno em intracavernosa ----
  console.log('\n--- retorno em intracavernosa: fórmula e dose numa tela, adesão sob demanda, sem TEFI');
  {
    const ciclos = [Object.assign({ codigo: 'MXV002', tipo: 'primeira', linha: 'DE', data: iso(70), dataBR: br(70), protocolo: 'INTRACAVERNOSA',
      kitCodes: ['ICI', 'NOITE-1', 'TEFI', 'ONDAS'], tefiIndicado: true, iief: 7, mast: 'nao', matinal: 'nao', adam: ['nenhum'] }, ESTAVEL, CONTATO)];
    const r = await roda({ id: 'V2', codigo: 'MXV002', ciclos, respostas: Object.assign({ visita: 'reav', confirmHist: 'ok', trocarQueixa: 'nao',
      iciUso: { iciAnt: 'R5 (trimix clássico)', iciAntDose: '0,1 mL', iciDoseAtual: '0,15 mL', iciTempo: '1h' }, adesao: 'total', ea: 'nao',
      iciQual: { iciQualidade: '4', iciFreq: '1a2' }, confirmaEstavel: 'nao', caracteriza: { mast: 'nao', matinal: 'nao' },
      satisfNps: { satisf: 9, nps: 10 } }, iief(16)) }, false, { manter: true });
    ok(!r.falha, 'chega à conduta', r.falha);
    ok(r.caminho.includes('iciUso') && !r.caminho.includes('iciDoseAtual'), 'fórmula, dose prescrita e dose em uso numa tela só (a dose não é pedida duas vezes)', r.caminho.join(' > '));
    ok(['tefiFeito', 'tefiResp', 'tefiConduta'].every(t => !r.caminho.includes(t)), 'não pergunta se fez o teste de ereção', r.caminho.join(' > '));
    const s = r.salvo || {};
    ok(s.iciDosePrescrita === '0,1 mL' && s.iciCasa && s.iciCasa.dose === '0,15 mL', 'grava a dose prescrita e a dose em uso (a que vale)', JSON.stringify({ rx: s.iciDosePrescrita, casa: s.iciCasa }));
    // item 19: melhorou em intracavernosa → mantém a intracavernosa, mesma fórmula e dose em uso
    const kc = (s.kitCodes || []);
    ok(s.protocolo === 'INTRACAVERNOSA (mantido)' && kc.includes('ICI') && !kc.some(c => /^BASE|^SP-DE|^TEFI$/.test(c)),
      'item 19: IIEF 7 → 16 em intracavernosa continua intracavernosa (não volta para o oral, sem novo TEFI)', s.protocolo + ' ' + JSON.stringify(kc));
    ok(s.iciDoseIndicada === '0,15 mL', 'item 19: dose indicada é a dose em uso', s.iciDoseIndicada);
    const notas = r.win.document.getElementById('rc-notas') ? r.win.document.getElementById('rc-notas').textContent : r.win.document.body.textContent;
    ok(/não volta para a via oral/.test(notas) && /conta só para a satisfação/.test(notas), 'item 19: nota explica que a melhora do escore reflete a medicação');
    ok(r.caminho.includes('iciUso') && s.iciCasa && s.iciCasa.tempo === '1h', 'v2.5-E: duração da ereção perguntada na tela "Fórmula e dose"', JSON.stringify(s.iciCasa));
    const chIci = [...r.win.document.querySelectorAll('#kitGrid .kit-card')].find(k => /^ICI/.test(k.querySelector('.kc-code').textContent.trim()));
    ok(chIci && chIci.querySelector('.mx-cor') && /R5/.test(chIci.querySelector('.mx-cor').title), 'cartão da intracavernosa leva a cor da fórmula em uso (R5)');
    r.win.close();
  }
  // v2.5-E: a dose segue qualidade e duração (alvo ~1 h); o IIEF não decide; acima de 2 h nunca sobe
  for (const [rot, tot, q, tempo, protE, mudE, doseE] of [
    ['ereção parcial', 12, '2', '1h', 'INTRACAVERNOSA', /Subir dose ou esquema da intracavernosa/, '0,2 mL'],
    ['ereção curta (<30 min) mesmo com IIEF 7 → 16', 16, '4', '<30', 'INTRACAVERNOSA', /Subir dose ou esquema da intracavernosa/, '0,2 mL'],
    ['ereção suficiente de 1 a 2 h', 14, '4', '1a2h', 'INTRACAVERNOSA', /Reduzir a dose da intracavernosa/, '0,1 mL'],
    ['ereção acima de 2 h', 9, '4', '>2h', 'INTRACAVERNOSA', /Reduzir a dose da intracavernosa/, '0,1 mL'],
    ['IIEF sem ganho, ereção suficiente de ~1 h', 7, '3', '1h', 'INTRACAVERNOSA (mantido)', /Nenhuma — protocolo mantido/, '0,15 mL']]) {
    const ciclos = [Object.assign({ codigo: 'MXV004', tipo: 'primeira', linha: 'DE', data: iso(70), dataBR: br(70), protocolo: 'INTRACAVERNOSA',
      kitCodes: ['ICI', 'NOITE-1', 'TEFI'], iief: 7, mast: 'nao', matinal: 'nao', adam: ['nenhum'], iciAnterior: 'R5 (trimix clássico)', iciDosePrescrita: '0,15 mL' }, ESTAVEL, CONTATO)];
    const r = await roda({ id: 'V4', codigo: 'MXV004', ciclos, respostas: Object.assign({ visita: 'reav', confirmHist: 'ok', trocarQueixa: 'nao',
      iciUso: { iciTempo: tempo }, adesao: 'total', ea: 'nao',   // fórmula e dose vêm do registro
      iciQual: { iciQualidade: q, iciFreq: '1a2' }, confirmaEstavel: 'nao', caracteriza: { mast: 'nao', matinal: 'nao' },
      satisfNps: { satisf: 5, nps: 7 } }, iief(tot)) }, false, {});
    const s = r.salvo || {};
    ok(!r.falha && s.protocolo === protE && mudE.test(s.mudanca || '') && (s.kitCodes || []).includes('ICI') && !(s.kitCodes || []).some(c => /^BASE|^SP-DE/.test(c)) && s.iciDoseIndicada === doseE,
      'ICI — ' + rot + ': ' + protE + ', "' + mudE.source + '", dose ' + doseE, r.falha || JSON.stringify({ p: s.protocolo, m: s.mudanca, k: s.kitCodes, d: s.iciDoseIndicada }));
  }
  {
    const fs = require('fs');
    const HTML = fs.readFileSync(path.join(__dirname, '../apps/triagem.html'), 'utf8');
    ok(/text:'Usou a dose como recomendado\?'/.test(HTML), 'intracavernosa: adesão perguntada como "Usou a dose como recomendado?"');
  }

  // ---- 2b. v2.5-E: TEFI indica intracavernosa num paciente só com via oral ----
  console.log('\n--- TEFI indica intracavernosa: avisa que está só no oral e pergunta se acrescenta');
  for (const aceita of ['sim', 'nao']) {
    const ciclos = [Object.assign({ codigo: 'MXV005', tipo: 'primeira', linha: 'DE', data: iso(70), dataBR: br(70), protocolo: 'DE-3',
      kitCodes: ['BASE-T20', 'NOITE-1', 'SP-DE', 'TEFI'], tefiIndicado: true, iief: 9, mast: 'nao', matinal: 'nao', adam: ['nenhum'] }, ESTAVEL, CONTATO)];
    const resp = Object.assign({ visita: 'reav', confirmHist: 'ok', trocarQueixa: 'nao', adesao: 'total', ea: 'nao', confirmaEstavel: 'nao',
      caracteriza: { mast: 'nao', matinal: 'nao' }, tefiFeito: 'sim', tefiResp: 'parcial', tefiDoppler: 'venoso', tefiConduta: 'ici', tefiAddIci: aceita,
      satisfNps: { satisf: 5, nps: 7 } }, iief(10), aceita === 'sim' ? { iciFormula: 'R5 (trimix clássico)', iciDose: '0,1 mL' } : {});
    let hint = '';
    const r = await roda({ id: 'V5', codigo: 'MXV005', ciclos, respostas: resp }, false, { manter: true });
    const s = r.salvo || {}, kc = s.kitCodes || [];
    const doc = r.win.document;
    // v2.5-F: TEFI feito nesta consulta — nada de "Agendar TEFI" / "indicar teste de ereção"; painel com o resultado
    {
      const corpo = doc.getElementById('resultsCard').textContent.replace(/\s+/g, ' ');
      const painel = (doc.getElementById('painelCard') || doc.body).textContent.replace(/\s+/g, ' ');
      const st = (doc.getElementById('mxCdStatus') || { textContent: '' }).textContent.replace(/\s+/g, ' ');
      ok(!/Agendar TEFI|indicar teste de ereção|Considerar teste de ereção/i.test(corpo) && !kc.includes('TEFI') && s.tefiIndicado === false,
        'TEFI feito hoje (' + aceita + '): a conduta não pede o teste de novo', JSON.stringify({ k: kc, ind: s.tefiIndicado, m: (corpo.match(/.{40}(Agendar TEFI|indicar teste de ereção).{20}/i) || [''])[0] }));
      ok(/TEFI realizado hoje · resposta parcial · escape venoso/.test(painel) && !/TEFI indicado, não realizado/.test(painel) && /realizado hoje · resposta parcial · escape venoso/.test(st),
        'TEFI feito hoje (' + aceita + '): painel e cabeçalho mostram "realizado hoje" com o resultado', (painel.match(/TEFI[^·]{0,30}(·[^·]{0,30}){0,2}/) || [''])[0] + ' | ' + st);
    }
    if (aceita === 'sim') {
      ok(!r.falha && r.caminho.includes('tefiAddIci') && r.caminho.includes('iciFormula') && r.caminho.includes('iciDose'), 'TEFI → pergunta se acrescenta a intracavernosa, depois fórmula e dose', r.falha || r.caminho.join(' > '));
      ok(kc.includes('ICI') && kc.some(c => /^BASE-T/.test(c)) && /\+ INTRACAVERNOSA$/.test(s.protocolo || '') && /indicação do TEFI/.test(s.mudanca || ''),
        'aceitou: intracavernosa entra no kit junto do protocolo oral', JSON.stringify({ p: s.protocolo, k: kc, m: s.mudanca }));
      ok(s.iciPorTefi && s.iciPorTefi.acrescentada === true && s.iciPorTefi.formula === 'R5 (trimix clássico)' && s.iciPorTefi.dose === '0,1 mL' && s.iciDoseIndicada === '0,1 mL',
        'registro guarda que a conduta seguiu o TEFI (fórmula e dose)', JSON.stringify(s.iciPorTefi));
      ok(/Conduta seguiu indicação do TEFI: Intracavernosa acrescentada/.test(r.texto) && /Conduta seguiu indicação do TEFI/.test(doc.getElementById('report').textContent),
        'relatório e texto do prontuário dizem que a conduta seguiu a indicação do TEFI', r.texto.split('\n').filter(l => /TEFI/.test(l)).join(' | '));
      r.win.close();
      // retorno seguinte: já está em intracavernosa — não regride ao oral
      const ciclos2 = ciclos.concat([Object.assign({}, s, { data: iso(10), dataBR: br(10) })]);
      const r2 = await roda({ id: 'V5b', codigo: 'MXV005', ciclos: ciclos2, respostas: Object.assign({ visita: 'reav', confirmHist: 'ok', trocarQueixa: 'nao',
        iciUso: { iciTempo: '1h' }, adesao: 'total', ea: 'nao', iciQual: { iciQualidade: '4', iciFreq: '1a2' }, confirmaEstavel: 'nao',
        caracteriza: { mast: 'nao', matinal: 'nao' }, satisfNps: { satisf: 8, nps: 9 } }, iief(15)) }, true, {});
      const s2 = r2.salvo || {};
      ok(!r2.falha && s2.protocolo === 'INTRACAVERNOSA (mantido)' && (s2.kitCodes || []).includes('ICI') && s2.iciCasa && s2.iciCasa.dose === '0,1 mL',
        'retorno seguinte: já em intracavernosa (dose 0,1 mL vem preenchida), não volta ao oral', r2.falha || JSON.stringify({ p: s2.protocolo, k: s2.kitCodes, c: s2.iciCasa }));
    } else {
      ok(!r.falha && !kc.includes('ICI') && !r.caminho.includes('iciFormula') && s.iciPorTefi && s.iciPorTefi.acrescentada === false
        && /mantém só a via oral/.test(doc.body.textContent), 'recusou: kit só oral, registro e nota dizem que o TEFI indicou e o médico manteve o oral', r.falha || JSON.stringify({ k: kc, t: s.iciPorTefi }));
      r.win.close();
    }
  }

  // ---- 3. via do paciente sem dose dos componentes; pedido de exames; sem apêndice ----
  console.log('\n--- envio: via do paciente sem doses, pedido de exames editável, sem apêndice');
  {
    const r = await roda({ id: 'V3', codigo: 'MXV003', respostas: Object.assign({ visita: 'primeira', queixa: 'ambos',
      contato: CONTATO, freq: 'alta' }, iief(14), { p0: 3, p1: 2, p2: 2, p3: 3, p4: 2 }) }, true, { manter: true });
    ok(!r.falha && r.salvo, 'chega à conduta', r.falha);
    const doc = r.win.document;
    const meds = [...doc.querySelectorAll('#printPaciente .med')].map(m => m.textContent.replace(/\s+/g, ' '));
    ok(meds.length > 0 && meds.every(t => !/\d\s*(mg|mcg)\b/i.test(t)), 'via do paciente: fórmulas sem a dose dos componentes', meds.join(' || '));
    ok(meds.some(t => /tadalafila/i.test(t)) && meds.every(t => t.length > 20), 'via do paciente: substâncias e posologia continuam', meds.join(' || '));
    ok(!doc.querySelector('#printPaciente .sig-ativo'), 'via do paciente: sem composição automática com dose');
    const rel = doc.getElementById('printArea').textContent;
    ok(/tadalafila \d+ mg/.test(rel), 'relatório da clínica continua com as doses');
    ok(!doc.getElementById('envApend') && !/reset do est/i.test(doc.getElementById('envioBox').textContent), 'sem "Apêndice: reset do estímulo" no envio');
    const bt = doc.getElementById('examesBtn');
    ok(bt && /Imprimir pedido de exames/.test(bt.textContent), 'botão "Imprimir pedido de exames"');
    bt.click();
    const api = r.win.__mxExames;
    const l0 = api.lista();
    ok(doc.getElementById('exaOverlay').style.display === 'flex' && JSON.stringify(l0) === JSON.stringify(['Testosterona total', 'Testosterona livre', 'SHBG', 'LH', 'FSH', 'Estradiol', 'Prolactina']),
      'editor abre com o perfil hormonal da clínica marcado', JSON.stringify(l0));
    const cbs = [...doc.querySelectorAll('#exaCorpo input[data-exa]')];
    cbs.find(c => /Prolactina/.test(c.parentNode.textContent)).click();
    cbs.find(c => /PSA total/.test(c.parentNode.textContent)).click();
    doc.getElementById('exaNovo').value = 'TSH'; doc.getElementById('exaIncluir').click();
    const l1 = api.lista();
    ok(l1.indexOf('Prolactina') < 0 && l1.indexOf('PSA total') >= 0 && l1.indexOf('TSH') >= 0, 'médico tira, inclui da lista e acrescenta exame livre', JSON.stringify(l1));
    api.monta();
    const ped = doc.getElementById('printExames').textContent;
    ok(/Pedido de exames/.test(ped) && /TSH/.test(ped) && !/Prolactina/.test(ped) && /jejum/.test(ped), 'pedido impresso traz só o que ficou marcado');
    r.win.close();
  }

  // ---- 4. v2.5-E: cor de cada fórmula (fonte única COR_FORMULA) ----
  console.log('\n--- cor das fórmulas: quadradinho no canto do cartão, uma cor por fórmula');
  {
    const fs = require('fs');
    const HTML = fs.readFileSync(path.join(__dirname, '../apps/triagem.html'), 'utf8');
    const bloco = ini => { const i = HTML.indexOf(ini); let d = 0, j = HTML.indexOf('{', i); const a = j;
      for (; j < HTML.length; j++) { if (HTML[j] === '{') d++; else if (HTML[j] === '}' && --d === 0) break; } return HTML.slice(a, j + 1); };
    const COR = Function('return ' + bloco('const COR_FORMULA'))();
    const F = [...bloco('const F = {').matchAll(/^\s*'([A-Z0-9\-]+)'\s*:\s*\{role:/gm)].map(m => m[1]);
    const semCor = ['ONDAS', 'TEFI', 'LABS', 'PRESERV', 'ICI', 'SP-DUO-1J'];
    const faltam = F.filter(c => !semCor.includes(c) && !COR[c]).concat(['R1', 'R2', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12'].filter(c => !COR[c]));
    ok(!faltam.length, 'toda fórmula do catálogo e R1, R2, R4–R12 têm cor', faltam.join(', '));
    const hex = Object.values(COR).map(h => h.toUpperCase());
    ok(new Set(hex).size === hex.length && hex.every(h => /^#[0-9A-F]{6}$/.test(h)), 'cores distintas, em HEX');
    const rgbHex = c => '#' + c.match(/\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
    const r = await roda({ id: 'V6', codigo: 'MXV006', respostas: Object.assign({ visita: 'primeira', queixa: 'ambos',
      contato: CONTATO, freq: 'alta' }, iief(14), { p0: 3, p1: 2, p2: 2, p3: 3, p4: 2 }) }, true, { manter: true });
    const doc = r.win.document;
    const cards = [...doc.querySelectorAll('#kitGrid .kit-card')].map(k => ({ c: k.querySelector('.kc-code').textContent.trim().split(/\s/)[0], cor: k.querySelector('.mx-cor') }));
    ok(cards.length && cards.every(k => k.cor && rgbHex(k.cor.style.background) === (COR[k.c] || '').toUpperCase()), 'cartões do kit: quadradinho com a cor da fórmula',
      cards.map(k => k.c + ':' + (k.cor ? rgbHex(k.cor.style.background) : '—')).join(' '));
    const linhas = [...doc.querySelectorAll('#mxCdKit > span')];
    ok(linhas.length && linhas.every(l => !COR[l.querySelector('b').textContent.trim()] || l.querySelector('.mx-cor')), 'cabeçalho da conduta: cada fórmula com a sua cor');
    ok([...doc.querySelectorAll('#printPaciente .med')].some(m => m.querySelector('.mx-cor')), 'via do paciente: a cor da embalagem ao lado da fórmula');
    r.win.close();
  }

  console.log('\n=== v2.5 ===');
  console.log('falhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})();
