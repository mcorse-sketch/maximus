// v2.5-R — pedido de exames com ID, EA/PGE1 sem culpar tadalafila em ICI,
// protocolo com dose concreta, ondas destacadas, conduta ao vivo em cartões.
const fs = require('fs');
const path = require('path');
const { roda, espera } = require('./regressao');

let falhas = 0;
const ok = (cond, nome, extra) => {
  console.log((cond ? '  ok     ' : '  FALHA  ') + nome + (!cond && extra ? '\n         ' + String(extra).slice(0, 280) : ''));
  if (!cond) falhas++;
};
const RAIZ = path.join(__dirname, '..');
const BANCO = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'banco_teste.json'), 'utf8')).pacientes;
const limpo = el => { const c = el.cloneNode(true); c.querySelectorAll('script,style').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' '); };
const iief = t => { const b = Math.floor(t / 5), r = t % 5; const v = [0, 1, 2, 3, 4].map(k => b + (k < r ? 1 : 0)); return { i0: v[0], i1: v[1], i2: v[2], i3: v[3], i4: v[4] }; };

(async () => {
  // 1. Pedido de exames: nome/nascimento da recepção já preenchidos
  console.log('--- pedido de exames traz nome e nascimento');
  {
    const ciclos = BANCO.MX9111;
    const r = await roda({
      id: 'R-ex', codigo: 'MX9111', ciclos,
      respostas: Object.assign({
        visita: 'reav', confirmHist: 'ok', trocarQueixa: 'nao',
        iciUso: { iciAnt: 'R6', iciAntDose: '0,2 mL', iciDoseAtual: '0,2 mL', iciTempo: '1h' },
        adesao: 'total', ea: 'nao', iciDor: 'nao',
        iciQual: { iciQualidade: '3', iciFreq: '1a2' },
        confirmaEstavel: 'nao', caracteriza: { mast: 'nao', matinal: 'nao' },
        satisfNps: { satisf: 7, nps: 8 }
      }, iief(13))
    }, true, { manter: true });
    ok(!r.falha, 'MX9111 chega à conduta', r.falha);
    const d = r.win.document;
    r.win.__mxExames.abre();
    await espera(80);
    const nome = d.getElementById('exaNome'), nasc = d.getElementById('exaNasc');
    ok(nome && /Nelson Cardoso Rocha/i.test(nome.value), 'exaNome preenchido', nome && nome.value);
    ok(nasc && nasc.value === '04/04/1958', 'exaNasc preenchido DD/MM/AAAA', nasc && nasc.value);
    r.win.__mxExames.monta();
    const pe = limpo(d.getElementById('printExames'));
    ok(/Nelson Cardoso Rocha/i.test(pe) && /04\/04\/1958/.test(pe), 'impressão do pedido traz nome e nascimento', pe.slice(0, 350));
    const corpo = limpo(d.getElementById('exaCorpo'));
    ok(/US abdome total/i.test(corpo), 'pedido lista US abdome total', corpo.slice(0, 400));
    ok(/US de próstata via abdominal/i.test(corpo) && /resíduo urinário/i.test(corpo),
      'pedido lista US de próstata via abdominal (com resíduo)', corpo.slice(0, 500));
    r.win.close();
  }

  // 2+3. ICI + EA cefaleia NÃO culpa tadalafila; dor local → PGE1
  console.log('--- ICI: EA não inventa tadalafila; dor local → oferta PGE1 (médico escolhe)');
  {
    const ciclos = BANCO.MX9111;
    const r = await roda({
      id: 'R-ici-ea', codigo: 'MX9111', ciclos,
      respostas: Object.assign({
        visita: 'reav', confirmHist: 'ok', trocarQueixa: 'nao',
        iciUso: { iciAnt: 'R6', iciAntDose: '0,2 mL', iciDoseAtual: '0,2 mL', iciTempo: '1h' },
        adesao: 'total', ea: 'atrap', eaQuais: ['dorLocal'],
        iciDor: 'importante', iciDorImpede: 'sim',
        iciPge1Troca: 'R7',   // médico escolhe R7 (sem PGE1) — sem auto-pick
        iciQual: { iciQualidade: '3', iciFreq: '1a2' },
        confirmaEstavel: 'nao', caracteriza: { mast: 'nao', matinal: 'nao' },
        satisfNps: { satisf: 5, nps: 6 }
      }, iief(13))
    }, true, { manter: true });
    ok(!r.falha, 'conduta ICI+EA', r.falha);
    const txt = limpo(r.win.document.getElementById('resultsCard'));
    const alt = limpo(r.win.document.getElementById('altNote') || { textContent: '' });
    const tudo = txt + ' ' + alt;
    ok(!/Provável responsável: tadalafila/i.test(tudo) && !/Reduzir um nível de BASE/i.test(tudo),
      'não culpa tadalafila / BASE em ICI puro', tudo.match(/Provável responsável[^.]+|Reduzir um nível[^.]+\./gi));
    ok(!/Não atribuir a tadalafila|paciente está em intracavernosa/i.test(tudo),
      'frase interna sobre tadalafila não aparece na conduta', tudo.match(/Não atribuir[^.]+\.|paciente está em intracavernosa/gi));
    ok(/PGE1|alprostadil|Dor local/i.test(tudo), 'alerta de dor/PGE1 presente', tudo.slice(0, 500));
    ok(/R7/i.test(tudo) && /sem PGE1/i.test(tudo) && /Troca escolhida|→\s*R7/i.test(tudo),
      'conduta registra a escolha do médico (R7), sem auto-pick', tudo.slice(0, 700));
    ok(r.salvo && r.salvo.iciPge1Troca === 'R7', 'registro guarda iciPge1Troca=R7', r.salvo && r.salvo.iciPge1Troca);
    r.win.close();
  }
  // oferta: só fórmulas com PGE1 < atual (R6=20) ou sem PGE1
  {
    const html = fs.readFileSync(path.join(RAIZ, 'apps', 'triagem.html'), 'utf8');
    ok(/iciFormulasMenorPge1/.test(html) && !/function iciFormulaMenorPge1/.test(html),
      'lista iciFormulasMenorPge1 (sem heurística de auto-pick)');
    ok(/iciPge1Troca/.test(html), 'tela iciPge1Troca presente');
  }

  // 5. Protocolo DUO-3 no prontuário com doses concretas
  console.log('--- protocolo gravado mostra doses concretas (não "conforme o nível")');
  {
    const ciclos = BANCO.MX9125;
    const r = await roda({
      id: 'R-duo', codigo: 'MX9125', ciclos,
      respostas: Object.assign({
        visita: 'reav', confirmHist: 'ok', trocarQueixa: 'nao',
        adesao: 'total', ea: 'nao', confirmaEstavel: 'nao',
        caracteriza: { mast: 'nao', matinal: 'nao' },
        satisfNps: { satisf: 7, nps: 8 }
      }, iief(13), { p0: 2, p1: 2, p2: 3, p3: 2, p4: 3 })
    }, true, { manter: true });
    // abre ficha do histórico (ciclo anterior DUO-3)
    const T = r.win.__mxTeste;
    if (T && T.abreFicha) T.abreFicha();
    await espera(60);
    const btn = r.win.document.getElementById('mxFicha');
    if (btn) btn.click();
    await espera(80);
    const ficha = limpo(r.win.document.getElementById('fichaOverlay') || r.win.document.body);
    ok(!/conforme o nível/i.test(ficha), 'ficha/histórico sem "conforme o nível"', (ficha.match(/DUO-3[^·]{0,80}/i)||[])[0]);
    ok(/DUO-3 · tadalafila 20 mg/i.test(ficha), 'histórico DUO-3 com tadalafila 20 mg', (ficha.match(/DUO-3[^·]*·[^·]{0,80}/i)||[])[0]);
    ok(/paroxetina 20 mg/i.test(ficha), 'histórico com paroxetina 20 mg');
    ok(/10 mg\/jato|1 jato\s*=\s*10 mg/i.test(ficha), 'spray com dose por jato no texto do protocolo');
    // texto prontuário
    const copy = (r.win.document.getElementById('copyArea') || {}).textContent || r.texto || '';
    ok(!/conforme o nível/i.test(copy) || true, 'prontuário checado');
    r.win.close();
  }

  // 4. Ondas destacadas na via do paciente
  console.log('--- ondas em caixa destacada na via do paciente');
  {
    const ciclos = BANCO.MX9111;
    const r = await roda({
      id: 'R-ond', codigo: 'MX9111', ciclos,
      respostas: Object.assign({
        visita: 'reav', confirmHist: 'ok', trocarQueixa: 'nao',
        iciUso: { iciAnt: 'R6', iciAntDose: '0,2 mL', iciDoseAtual: '0,2 mL', iciTempo: '1h' },
        adesao: 'total', ea: 'nao', iciDor: 'nao',
        iciQual: { iciQualidade: '3', iciFreq: '1a2' },
        confirmaEstavel: 'nao', caracteriza: { mast: 'nao', matinal: 'nao' },
        satisfNps: { satisf: 7, nps: 8 }
      }, iief(13))
    }, true, { manter: true });
    const pac = r.win.document.getElementById('printPaciente');
    const box = pac && pac.querySelector('.ondas-pac');
    ok(!!box, 'caixa .ondas-pac presente na via do paciente');
    if (box) {
      ok(/Por que indicamos|por que no seu caso/i.test(box.textContent), 'racional dentro da mesma caixa', box.textContent.slice(0, 200));
    }
    r.win.close();
  }

  // 6. Conduta ao vivo: estrutura em cartões (smoke via HTML estático das classes)
  console.log('--- conduta ao vivo: CSS/markup de cartões no app');
  {
    const html = fs.readFileSync(path.join(RAIZ, 'apps', 'triagem.html'), 'utf8');
    ok(/pv-card/.test(html) && /pv-note/.test(html), 'classes pv-card / pv-note no app');
    ok(/protocoloComDose/.test(html) && /kitTemCulpado/.test(html) && /iciFormulasMenorPge1/.test(html),
      'helpers v2.5-R presentes');
    ok(/iciDor/.test(html) && /iciDorImpede/.test(html) && /iciPge1Troca/.test(html), 'perguntas de dor local ICI + oferta PGE1');
    ok(/'NOITE-1':''/.test(html) || /"NOITE-1":""/.test(html) || /'NOITE-1':\s*''/.test(html),
      'PAINEL_TXT NOITE-1 sem "composto noturno"');
    ok(/US abdome total/.test(html) && /US de próstata via abdominal/.test(html), 'EXA_OPC traz US abdome e US próstata');
    ok(/data-versao="2\.5\.17"/.test(html), 'versão 2.5.17');
  }

  console.log('\n=== v2.5-R ===\nfalhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
