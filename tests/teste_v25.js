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
      iciUso: { iciAnt: 'R5 (trimix clássico)', iciAntDose: '0,1 mL', iciDoseAtual: '0,15 mL' }, adesao: 'total', ea: 'nao',
      iciQual: { iciQualidade: '4', iciTempo: '15a30', iciFreq: '1a2' }, confirmaEstavel: 'nao', caracteriza: { mast: 'nao', matinal: 'nao' },
      satisfNps: { satisf: 9, nps: 10 } }, iief(16)) }, false, { manter: true });
    ok(!r.falha, 'chega à conduta', r.falha);
    ok(r.caminho.includes('iciUso') && !r.caminho.includes('iciDoseAtual'), 'fórmula, dose prescrita e dose em uso numa tela só (a dose não é pedida duas vezes)', r.caminho.join(' > '));
    ok(['tefiFeito', 'tefiResp', 'tefiConduta'].every(t => !r.caminho.includes(t)), 'não pergunta se fez o teste de ereção', r.caminho.join(' > '));
    const s = r.salvo || {};
    ok(s.iciDosePrescrita === '0,1 mL' && s.iciCasa && s.iciCasa.dose === '0,15 mL', 'grava a dose prescrita e a dose em uso (a que vale)', JSON.stringify({ rx: s.iciDosePrescrita, casa: s.iciCasa }));
    r.win.close();
  }
  {
    const fs = require('fs');
    const HTML = fs.readFileSync(path.join(__dirname, '../apps/triagem.html'), 'utf8');
    ok(/text:'Usou a dose como recomendado\?'/.test(HTML), 'intracavernosa: adesão perguntada como "Usou a dose como recomendado?"');
  }

  console.log('\n=== v2.5 ===');
  console.log('falhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})();
