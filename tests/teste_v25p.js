// v2.5-P — ajustes do Dr. Marco de 06/10/2026 (via do paciente, alertas, pedido de exames,
// custo fora da triagem). Roda o PRÓPRIO app (tests/regressao.js) sobre o banco fictício.
//
// Uso: node teste_v25p.js
const fs = require('fs');
const path = require('path');
const { roda } = require('./regressao');

let falhas = 0;
const ok = (cond, nome, extra) => {
  console.log((cond ? '  ok     ' : '  FALHA  ') + nome + (!cond && extra ? '\n         ' + extra : ''));
  if (!cond) falhas++;
};
const RAIZ = path.join(__dirname, '..');
const FONTE = fs.readFileSync(path.join(RAIZ, 'apps', 'triagem.html'), 'utf8');
const BANCO = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'banco_teste.json'), 'utf8')).pacientes;
const iief = t => { const b = Math.floor(t / 5), r = t % 5; const v = [0, 1, 2, 3, 4].map(k => b + (k < r ? 1 : 0)); return { i0: v[0], i1: v[1], i2: v[2], i3: v[3], i4: v[4] }; };
const pedt = t => { const b = Math.floor(t / 5), r = t % 5; const v = [0, 1, 2, 3, 4].map(k => Math.min(4, b + (k < r ? 1 : 0))); return { p0: v[0], p1: v[1], p2: v[2], p3: v[3], p4: v[4] }; };
const limpo = el => { const c = el.cloneNode(true); c.querySelectorAll('script,style').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' '); };

// frases de regra interna, comercial ou jargão que NÃO podem chegar ao paciente
const INTERNO = [
  /piso terap/i, /não sai da consulta/i, /apenas com suplemento/i, /permissiv/i, /literatura/i, /pacote/i, /\bvenda/i, /comercial/i,
  /Trocamos o mecanismo/i, /sem ganho/i, /efeito limitante/i, /boa adesão/i, /Nunca associar paroxetina/i, /síndrome serotonin/i,
  /custo/i, /R\$/, /\bescore/i, /IIEF/, /PEDT/, /\b(DE|EP|DUO)-\d/, /abaixo do corte/i, /\bregra\b/i, /escalon/i, /teto oral/i,
  /recurso sob demanda/i, /CYP2D6/, /recomendação convencional/i
];
const NUNCA = 'Nunca associar paroxetina diária e dapoxetina';
const ALERTA = 'Paroxetina + clomipramina: o spray não deve passar de 1 jato por dia.';

function confereVia(r, rot, comOndas) {
  const d = r.win.document;
  const pac = d.getElementById('printPaciente');
  const t = limpo(pac);
  const viu = INTERNO.filter(re => re.test(t)).map(String);
  ok(!viu.length, rot + ': via do paciente sem regra interna nem jargão', viu.join(' ') + ' | ' + t.slice(0, 300));
  const meds = [...pac.querySelectorAll('.med')];
  const semPq = meds.filter(m => { const q = m.querySelector('.pq'); return !q || q.textContent.trim().length < 25; })
    .map(m => (m.querySelector('b') || m).textContent.trim());
  ok(meds.length === 0 || !semPq.length, rot + ': cada item tem o porquê em linguagem simples (' + meds.length + ' itens)', 'sem porquê: ' + semPq.join(', '));
  ok(/Por que este plano/.test(t) && !/Trocamos o mecanismo/.test(t), rot + ': "Por que este plano" em linguagem do paciente');
  if (comOndas) {
    ok(/Ondas de choque — por que no seu caso/.test(t) && /Por que indicamos para você:/.test(t), rot + ': ondas de choque explicadas (o que é e por que no caso dele)', t.slice(-600));
    ok(/protocolo de 10 sessões/.test(t) && !/sessão \d+ de \d+/i.test(t), rot + ': "protocolo de 10 sessões", sem inventar a sessão atual');
  } else ok(!/Ondas de choque — por que/.test(t), rot + ': sem ondas indicadas, sem a seção de ondas');
  // rodapé de agendamento em tabela para a secretária
  const tab = pac.querySelector('.ag-tab');
  ok(!!tab && ['Data', 'Horário', 'Unidade', 'Agendado por'].every(x => tab.textContent.includes(x)) && !/Data e horário:/.test(t),
    rot + ': rodapé do retorno em quadro (Data · Horário · Unidade · Agendado por)');
  const tela = limpo(d.body);
  ok(!tela.includes(NUNCA) && !/Custo estimado|custo à parte|Índice de custo/i.test(tela), rot + ': tela sem o alerta antigo e sem custo');
  const cods = (r.salvo && r.salvo.kitCodes) || [];
  const pc = cods.some(c => /^MOD-PAROX/.test(c)) && cods.some(c => /^SP-DUO/.test(c));
  ok(tela.includes(ALERTA) === pc, rot + ': alerta paroxetina + clomipramina ' + (pc ? 'presente' : 'ausente'));
  if (pc) {
    ok(!tela.includes('Sem spray serotoninérgico associado'), rot + ': o racional não diz "sem spray serotoninérgico" com o SP-DUO no kit');
    const sp = meds.find(m => /SP-DUO/.test(m.textContent));
    ok(!!sp && /1 jato/.test(sp.textContent) && !/1 a 2 jatos|2 jatos/.test(sp.textContent), rot + ': spray com paroxetina = 1 jato na posologia do paciente', sp && sp.textContent);
  }
}

const RET = (x) => Object.assign({ visita: 'reav', confirmHist: 'ok', trocarQueixa: 'nao', adesao: 'total', ea: 'nao', confirmaEstavel: 'nao',
  satisfNps: { satisf: 8, nps: 9 } }, x);

(async () => {
  console.log('--- fonte');
  ok(!FONTE.includes(NUNCA) && !/avisoISRS/.test(FONTE), 'o texto "Nunca associar paroxetina diária e dapoxetina…" não existe mais no app');
  ok(!/id="mxDetCusto"|id="custoBox"/.test(FONTE), 'triagem sem bloco de custo (custo só no financeiro)');
  ok(/custoIndice:CUS\.idx,custoPontos:CUS\.total/.test(FONTE), 'o registro continua levando custoIndice/custoPontos para o financeiro');
  ok(!/notas\.push\([^)]*Piso terapêutico aplicado/.test(FONTE), 'a regra do piso terapêutico não vira texto visível');

  console.log('--- MX9137: paroxetina + SP-DUO, retorno de hoje');
  const r37 = await roda({ id: 'MX9137', codigo: 'MX9137', ciclos: BANCO.MX9137, respostas: RET(pedt(9)) }, true, { manter: true });
  ok(!r37.falha && !r37.erros.length, 'chega à conduta sem erro', r37.falha || r37.erros[0]);
  confereVia(r37, 'MX9137', false);
  // pedido de exames: nome, nascimento, código e indicação
  const w = r37.win, d = w.document;
  w.__mxExames.abre(); w.__mxExames.monta();
  let pe = limpo(d.getElementById('printExames'));
  ok(/Bernardo Prates Esteves/.test(pe) && /Nascimento/.test(pe) && /\d{2}\/\d{2}\/\d{4} · \d+ anos/.test(pe) && /MX9137/.test(pe),
    'pedido de exames com nome completo, nascimento (idade) e código', pe.slice(0, 400));
  ok(/Indicação clínica\s*Acompanhamento clínico de tratamento/.test(pe), 'pedido de exames com indicação clínica padrão', pe.slice(0, 400));
  const ind = d.getElementById('exaIndic'); ind.value = 'Investigação de hipogonadismo'; ind.oninput();
  w.__mxExames.monta(); pe = limpo(d.getElementById('printExames'));
  ok(/Indicação clínica\s*Investigação de hipogonadismo/.test(pe), 'indicação editável pelo médico');
  r37.win.close();

  console.log('--- sem nome/nascimento: linhas em branco, e o médico preenche');
  const semId = BANCO.MX9110.map(c => { const x = Object.assign({}, c); delete x.nome; delete x.nascimento; return x; });
  const r10 = await roda({ id: 'MX9110', codigo: 'MX9110', ciclos: semId, respostas: RET(iief(22)) }, true, { manter: true });
  {
    const w = r10.win, d = w.document;
    w.__mxExames.abre(); w.__mxExames.monta();
    let pe = d.getElementById('printExames');
    ok(pe.querySelectorAll('.exa-ident .linha').length >= 4 && /Paciente/.test(pe.textContent), 'sem os dados, o pedido sai com linhas para escrever à mão');
    ok(/linha em branco/.test(d.getElementById('exaIdAviso').textContent), 'o modal avisa que falta nome e nascimento');
    const n = d.getElementById('exaNome'); n.value = 'Gustavo Ivo Pires'; n.oninput();
    const nb = d.getElementById('exaNasc'); nb.value = '01021988'; nb.oninput();
    ok(nb.value === '01/02/1988', 'nascimento com máscara DD/MM/AAAA', nb.value);
    w.__mxExames.monta(); pe = limpo(d.getElementById('printExames'));
    ok(/Gustavo Ivo Pires/.test(pe) && /01\/02\/1988/.test(pe), 'o que o médico digita sai no pedido', pe.slice(0, 300));
    w.close();
  }

  console.log('--- ondas de choque: indicadas na primeira consulta (DE grave, diabetes + doença arterial)');
  const r39 = await roda({ id: 'MX9139', codigo: 'MX9139', ciclos: BANCO.MX9139.filter(c => c.tipo === 'recepcao').slice(0, 1),
    respostas: Object.assign({ visita: 'primeira', queixa: 'de', tempo: 'longo', parceira: 'fixa', comorb: ['has', 'dm', 'disl', 'vasc', 'tabag'], comorbCtrl: 'nao', comorbMed: 'sim',
      medsRisco: ['nenhuma'], alergia: ['nenhuma'], contra: 'nao', caracteriza: { mast: 'nao', matinal: 'nao' }, previa: 'nunca', adequado: 'sim', adam: ['nenhum'], testo: 'normal',
      contraIoim: 'nao', freq: 'alta', biotens: 22, topico: 'ambos', parox: 'nao', depre: 'nao', fert: 'nao' }, iief(9)) }, true, { manter: true });
  ok(!r39.falha && (r39.salvo.kitCodes || []).includes('ONDAS'), 'ondas no kit', r39.falha || JSON.stringify(r39.salvo && r39.salvo.kitCodes));
  confereVia(r39, 'MX9139 primeira', true);
  ok(/diabetes e a doença das artérias/.test(limpo(r39.win.document.getElementById('printPaciente'))), 'o motivo das ondas fala do caso dele (diabetes + artérias)');
  ok(r39.salvo.ondasSessoes === 10, 'o registro guarda o protocolo de 10 sessões', String(r39.salvo.ondasSessoes));
  r39.win.close();

  console.log('--- varredura: retorno de cada paciente do banco fictício');
  let n = 0;
  for (const cod of Object.keys(BANCO).sort()) {
    const ciclos = BANCO[cod];
    const clin = ciclos.filter(c => c.tipo === 'primeira' || c.tipo === 'reavaliacao');
    if (!clin.length) continue;
    const ult = clin[clin.length - 1];
    if (!/^(DE|EP|DUO)/.test(String(ult.protocolo || ''))) continue;
    const sc = Object.assign({}, ult.iief != null ? iief(Math.min(25, ult.iief + 2)) : {}, ult.pedt != null ? pedt(Math.max(0, ult.pedt - 2)) : {});
    const r = await roda({ id: cod, codigo: cod, ciclos, respostas: RET(sc) }, true, { manter: true });
    if (r.falha || !r.salvo) { ok(false, cod + ': conduta', r.falha); continue; }
    const comOndas = (r.salvo.kitCodes || []).includes('ONDAS') || ult.ondasIndicado || ult.tefiConduta === 'ondas';
    const antes = falhas;
    const log = console.log; console.log = (s) => { if (/FALHA/.test(s)) log(s); };
    confereVia(r, cod, comOndas);
    console.log = log;
    if (falhas === antes) n++;
    r.win.close();
  }
  ok(n > 20, 'varredura: ' + n + ' retornos com a via do paciente limpa');

  console.log('\n=== v2.5-P ===\nfalhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})();
