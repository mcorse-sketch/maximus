// v2.3.1 — "Enviar ao paciente" e orientações pós-preenchimento.
//   - a receita só é oferecida quando o kit tem ao menos uma fórmula
//     manipulada ou medicação; preenchimento, consulta urológica,
//     emagrecimento, TEFI em consultório e hipogonadismo sem via prescrita
//     não oferecem receita, e o bloqueio por nitrato (kit só com ondas) também não;
//   - o guia e o apêndice do Protocolo de Performance só aparecem na linha DE/EP;
//   - as orientações pós-preenchimento são exatamente o texto do Dr. Marco,
//     com os subitens, na folha do paciente e na folha pós-procedimento.
// Usa o motor real (tests/regressao.js) para levar cada paciente até a conduta.
// Uso: node teste_envio.js
const { roda } = require('./regressao');
const PAC = require('./regressao/pacientes');

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok     ' : '  FALHA  ') + msg); if (!cond) falhas++; };
const visivel = cb => !!cb && (cb.closest('label') || cb.parentNode).style.display !== 'none';
const pac = id => PAC.find(p => p.id === id);

const PREENCH_FEITO = { id: 'ENV-PRE', descricao: 'preenchimento realizado hoje', codigo: 'RGENV001', respostas: {
  visita: 'primeira', queixa: 'preench', tipoPenis: 'grower', medPre: { compFlac: '9', diamFlac: '9' },
  prepucio: 'medio', retracao: 'leve', plano: { previsaoML: '6a8', planoBotox: 'nao' }, concordou: 'sim', termo: 'sim',
  medPos: { compPos: '10', diamPos: '11' }, mlUsado: '6 mL', botox: 'nao', marcaAH: 'Rennova Shape Lido (seringa 2 mL)', notaMedico: 8 } };
const TEFI = { id: 'ENV-TEFI', descricao: 'TEFI em consultório', codigo: 'RGENV002', respostas: {
  visita: 'primeira', queixa: 'tefi', tefiMed: 'R5 (trimix clássico) — padrão da clínica', tefiDose: '0,1 mL — padrão da clínica',
  t10grau: 3, t20grau: 4, t30grau: 4, tefiFinal: { dorGrau: 0, dorQuando: 'na', curvGrau: 'nao' }, dopplerFeito: 'nao' } };

// [paciente, linha esperada, receita?, rótulo, guia?]
const CASOS = [
  [pac('LIM-004'), 'principal', true, 'Receita das fórmulas', true],     // DE-2
  [pac('TEST-009'), 'principal', true, 'Receita das fórmulas', true],    // EP-2 (paroxetina)
  [pac('TEST-019'), 'principal', true, 'Receita das fórmulas', true],    // DUO-3
  [pac('LIM-001'), 'principal', true, 'Receita das fórmulas', true],     // intracavernosa
  [pac('TEST-015'), 'principal', true, 'Receita das fórmulas', true],    // comportamental: preservativo + composto noturno
  [pac('TEST-005'), 'principal', false, '', true],                        // nitrato: BLOQUEIO, kit só com ondas
  [pac('R-01'), 'principal', true, 'Receita das fórmulas', true],        // reavaliação, mantido
  [pac('TEST-022'), 'hipogonadismo', true, 'Receita da medicação', false],
  [pac('TEST-025'), 'hipogonadismo', false, '', false],                  // reposição contraindicada
  [pac('TEST-027'), 'preenchimento', false, '', false],                  // só avaliação
  [PREENCH_FEITO, 'preenchimento', false, '', false],                    // procedimento feito
  [pac('TEST-029'), 'urologia', false, '', false],
  [pac('TEST-028'), 'emagrecimento', false, '', false],
  [TEFI, 'tefi', false, '', false]
];

const POS = [
  'Posicionar para baixo entre os testículos por 15 dias',
  'Evitar dobrar para o lado para não deixar marcado',
  'Jejum sexual por 15 dias, tanto de relação sexual quanto masturbação',
  'Massagear todos os dias no sentido corpo-cabeça para espalhar melhor o ácido',
  'Melhor realizar com estado ereto, para espalhar ainda melhor o ácido',
  'Limpar bem o local de acesso da cânula',
  'Aguardar 21 dias para nova aplicação do ácido caso tenha interesse',
  'Em caso de nódulos, tentar espalhar com massagens localizadas, apertando contra o corpo do pênis e também entre os dedos a área.',
  'Caso não fique com o aspecto desejado, não se preocupe, entrar em contato para aplicação de hialuronidase',
  'Não utilizar bomba peniana por 6 meses.',
  'Evitar uso de anti-inflamatórios não esteroidais.'
];
const limpa = t => String(t || '').replace(/\s+/g, ' ').trim();

function confereOrientacoes(doc, onde) {
  const raiz = doc.getElementById(onde);
  const ol = raiz && raiz.querySelector('ol.pos-proc');
  if (!ol) { ok(false, onde + ': lista de orientações pós-procedimento presente'); return; }
  const itens = [...ol.children].filter(n => n.tagName === 'LI');
  ok(itens.length === 8, onde + ': 8 itens numerados (achou ' + itens.length + ')');
  const subs = [...ol.querySelectorAll('ol[type="a"] > li')].map(li => limpa(li.textContent));
  ok(subs.length === 3, onde + ': 3 subitens a. (achou ' + subs.length + ')');
  const linhas = [];
  itens.forEach(li => {
    const proprio = limpa([...li.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' '));
    linhas.push(proprio);
    li.querySelectorAll('ol[type="a"] > li').forEach(s => linhas.push(limpa(s.textContent)));
  });
  ok(JSON.stringify(linhas) === JSON.stringify(POS), onde + ': texto idêntico ao definido, na ordem, com subitens no lugar');
  if (JSON.stringify(linhas) !== JSON.stringify(POS)) linhas.forEach((l, i) => { if (l !== POS[i]) console.log('         ' + i + ': "' + l + '" ≠ "' + POS[i] + '"'); });
  ok(!/cabeça para o corpo/.test(raiz.textContent), onde + ': o texto antigo (massagem da cabeça para o corpo) não aparece');
  const tit = [...raiz.querySelectorAll('h3,h4')].map(h => limpa(h.textContent));
  ok(tit.includes('Orientações pós-procedimento'), onde + ': título "Orientações pós-procedimento"');
}

(async () => {
  console.log('\n=== ENVIAR AO PACIENTE — receita só com fórmula/medicação ===');
  for (const [p, linha, receita, rotulo, guia] of CASOS) {
    const r = await roda(p, true, { manter: true });
    const cab = (p.id + ' ' + p.descricao).slice(0, 58);
    if (r.falha || !r.win) { ok(false, cab + ': chegou à conduta (' + r.falha + ')'); continue; }
    const doc = r.win.document;
    const box = doc.getElementById('envioBox');
    const rec = doc.getElementById('envRec');
    const okLinha = box.dataset.linha === linha;
    const okRec = visivel(rec) === receita && (!receita || rec.checked) && (receita || !rec.checked);
    const okRot = !receita || limpa(rec.closest('label').textContent) === rotulo;
    const okGuia = visivel(doc.getElementById('envGuia')) === guia && visivel(doc.getElementById('envApend')) === guia;
    const okOri = visivel(doc.getElementById('envOri'));
    const kit = (r.salvo && r.salvo.kitCodes || []).map(c => Array.isArray(c) ? c[0] : c).join(',');
    ok(okLinha && okRec && okRot && okGuia && okOri && !r.erros.length,
      cab + ' → ' + (receita ? rotulo : 'sem receita') + (guia ? ' + guia' : '') + (kit ? '  [' + kit + ']' : ''));
    if (!okLinha) console.log('         linha: ' + box.dataset.linha);
    if (!okRec || !okRot) console.log('         receita visível=' + visivel(rec) + ' marcada=' + rec.checked + ' rótulo="' + limpa(rec.closest('label').textContent) + '"');
    if (r.erros.length) console.log('         erros: ' + r.erros.slice(0, 3).join(' | '));
    if (p === PREENCH_FEITO) { confereOrientacoes(doc, 'printPos'); confereOrientacoes(doc, 'printPaciente'); }
    r.win.close();
  }
  console.log('\n' + (falhas ? falhas + ' falha(s)' : 'tudo certo'));
  process.exit(falhas ? 1 : 0);
})();
