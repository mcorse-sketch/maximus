// Banco de pacientes FICTÍCIOS para testar os apps com o servidor.
//
//   node tests/ficticios.js [quantidade] [--substituir]
//
// Cada paciente é atendido pelo próprio app clínico (via o executor da
// regressão), com respostas sorteadas — protocolo, kit, escores e alertas são
// exatamente o que o app gravaria. ~40% ganham uma reavaliação. Datas
// espalhadas nos últimos 18 meses; contato e medidas ficam no registro da
// recepção, como na vida real. Tudo com demo:true.
//
// Grava ../banco_triagem.json (formato do servidor) e põe 6 na fila de hoje
// (python3 servidor_maximus.py --fila-ficticia 6). Nunca sobrescreve um banco
// existente sem --substituir. Para apagar: python3 servidor_maximus.py --apagar-ficticios
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { roda } = require('./regressao');

const RAIZ = path.join(__dirname, '..');
const BANCO = path.join(RAIZ, 'banco_triagem.json');
const args = process.argv.slice(2);
const N = parseInt(args.find(a => /^\d+$/.test(a)) || '200', 10);
const SUBSTITUIR = args.includes('--substituir');

let semente = 20260923;
const rnd = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff; };
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const um = lista => lista[Math.floor(rnd() * lista.length)];
const pesado = pares => { let x = rnd() * pares.reduce((s, p) => s + p[1], 0); for (const [v, w] of pares) { if ((x -= w) <= 0) return v; } return pares[0][0]; };
const alguns = (lista, p) => lista.filter(() => rnd() < p);

function itensIief(total) {
  const base = Math.floor(total / 5), resto = total % 5;
  const v = [0, 1, 2, 3, 4].map(k => base + (k < resto ? 1 : 0));
  // de vez em quando um paciente sem tentativa num item — o app avisa
  if (total <= 12 && rnd() < 0.15) { v[0] += v[4]; v[4] = 0; if (v[0] > 5) { v[1] += v[0] - 5; v[0] = 5; } }
  return { i0: v[0], i1: v[1], i2: v[2], i3: v[3], i4: v[4] };
}
function itensPedt(total) {
  const base = Math.floor(total / 5), resto = total % 5;
  const v = [0, 1, 2, 3, 4].map(k => Math.min(4, base + (k < resto ? 1 : 0)));
  return { p0: v[0], p1: v[1], p2: v[2], p3: v[3], p4: v[4] };
}
const somaI = r => ['i0', 'i1', 'i2', 'i3', 'i4'].reduce((s, k) => s + (r[k] || 0), 0);

function respostasPrimeira(queixa) {
  const r = { visita: 'primeira', queixa };
  if (queixa === 'de' || queixa === 'ambos') Object.assign(r, itensIief(pesado([[entre(6, 11), 2], [entre(12, 16), 4], [entre(17, 21), 3], [entre(22, 25), 1]])));
  if (queixa === 'ep' || queixa === 'ambos') Object.assign(r, itensPedt(pesado([[entre(4, 8), 1], [entre(9, 10), 2], [entre(11, 15), 4], [entre(16, 20), 2]])));
  Object.assign(r, {
    tempo: um(['curto', 'medio', 'longo', 'longo']),
    parceira: pesado([['fixa', 6], ['eventual', 3], ['sem', 1]]),
    comorb: (c => c.length ? c : ['nenhuma'])(alguns(['has', 'dm', 'disl', 'vasc', 'tabag', 'obes', 'alcool'], 0.12)),
    comorbCtrl: um(['sim', 'sim', 'parcial', 'nao']), comorbMed: um(['sim', 'sim', 'nao']),
    medsRisco: rnd() < 0.2 ? [um(['beta', 'tiaz', 'isrs', 'fina', 'espiro'])] : ['nenhuma'],
    alergia: rnd() < 0.05 ? [um(['clomi', 'parox', 'dapo', 'anest', 'fito'])] : ['nenhuma'],
    contra: rnd() < 0.04 ? 'sim' : 'nao',
    caracteriza: { mast: um(['sim', 'nao']), matinal: um(['sim', 'nao']) },
    previa: pesado([['nunca', 5], ['func', 3], ['falhou', 2]]), adequado: um(['sim', 'nao']),
    adam: rnd() < 0.45 ? ['nenhum'] : alguns(['a1', 'a2', 'a3', 'a5', 'a6', 'a7', 'a9', 'a10'], 0.3).concat(['a2']).filter((v, i, a) => a.indexOf(v) === i),
    testo: pesado([['normal', 4], ['baixa', 2], ['nd', 3]]), contraIoim: um(['nao', 'nao', 'sim']),
    freq: um(['alta', 'baixa']), biotens: entre(4, 35),
    topico: pesado([['ambos', 5], ['so_pomada', 2], ['so_preserv', 2], ['nenhum', 1]]),
    parox: rnd() < 0.08 ? 'sim' : 'nao', depre: rnd() < 0.08 ? 'sim' : 'nao',
    fert: rnd() < 0.07 ? 'sim' : 'nao'
  });
  if (queixa === 'hipo') Object.assign(r, {
    confirma: { duasDosagens: um(['sim', 'sim', 'nao']), sintomas: 'sim', reversiveis: um(['sim', 'parcial']) },
    labs: { tTotal: entre(150, 330), lh: +(rnd() * 14).toFixed(1), ht: entre(40, 53), psa: +(rnd() * 3).toFixed(1) }
  });
  return r;
}

function respostasReav(prim, cicloAnt) {
  const r = { visita: 'reav', confirmHist: 'ok', queixa: prim.queixa,
    adesao: pesado([['total', 6], ['parcial', 3], ['baixa', 1], ['parou', 1]]), motivo: um(['esq', 'ea', 'naoprec']),
    ea: pesado([['nao', 7], ['leve', 2], ['atrap', 1]]), confirmaEstavel: 'nao' };
  if (cicloAnt.iief != null) Object.assign(r, itensIief(Math.max(5, Math.min(25, cicloAnt.iief + entre(-1, 6)))));
  if (cicloAnt.pedt != null) Object.assign(r, itensPedt(Math.max(0, Math.min(20, cicloAnt.pedt - entre(-1, 6)))));
  return r;
}

const LETRAS = 'ABCDEFGHIJLMNOPRSTV';
const iniciais = () => [0, 0, 0].slice(0, entre(2, 3)).map(() => um([...LETRAS])).join('');
const dia = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function dataEm(d, hora, minuto) { const x = new Date(d); x.setHours(hora, minuto, 0, 0); return x; }
function carimba(reg, d) { reg.data = d.toISOString(); reg.dataLocal = dia(d); reg.dataBR = d.toLocaleDateString('pt-BR'); reg.demo = true; return reg; }

function registroRecepcao(cod, i, d, queixa, contato, medidas, retorno) {
  return carimba({ codigo: cod, tipo: 'recepcao', linha: 'recepcao', hora: d.toTimeString().slice(0, 5),
    iniciais: contato.iniciais, telefone: contato.telefone, email: contato.email,
    queixaRecepcao: queixa === 'hipo' ? 'libido' : queixa, iief: null, pedt: null, adam: [],
    dificuldade: null, revisar: false, medidas, leuTermo: false, retornoPreench: null,
    retorno, diasDesdeUltima: null, usoRelatado: null, efeitoRelatado: null, satisfRelatada: null }, d);
}

(async () => {
  if (fs.existsSync(BANCO) && !SUBSTITUIR) {
    console.error('Já existe ' + BANCO + '. Para trocá-lo pelos fictícios, rode com --substituir (o atual vai para ' + path.basename(BANCO) + '.antes-ficticios).');
    process.exit(1);
  }
  const pacientes = {};
  const hoje = new Date();
  let falhas = 0, reavs = 0;
  for (let k = 1; k <= N; k++) {
    const cod = 'MX' + String(k).padStart(4, '0');
    const queixa = pesado([['de', 45], ['ep', 20], ['ambos', 20], ['hipo', 6], ['preench', 5], ['uro', 2], ['emag', 2]]);
    const contato = { iniciais: iniciais(), telefone: '(21)99999-' + String(k).padStart(4, '0'), email: rnd() < 0.7 ? 'paciente' + k + '@exemplo.com' : null };
    const altura = entre(162, 192), peso = entre(64, 118);
    const medidas = { idade: entre(24, 74), peso, altura, cintura: null, imc: +(peso / Math.pow(altura / 100, 2)).toFixed(1) };

    const d1 = dataEm(new Date(hoje.getTime() - entre(75, 540) * 86400000), entre(8, 17), um([0, 15, 30, 45]));
    const prim = respostasPrimeira(queixa);
    const r1 = await roda({ id: cod, codigo: cod, respostas: prim, ciclos: [] }, true);
    if (r1.falha || !r1.salvo) { falhas++; console.log('  falhou ' + cod + ': ' + (r1.falha || 'sem registro')); continue; }
    const recepcao1 = registroRecepcao(cod, k, new Date(d1.getTime() - 20 * 60000), queixa, contato, medidas, false);
    const c1 = carimba(Object.assign({}, r1.salvo), d1);
    const ciclos = [recepcao1, c1];

    if (!['uro', 'emag', 'preench'].includes(queixa) && rnd() < 0.4) {
      const d2 = dataEm(new Date(d1.getTime() + entre(50, 95) * 86400000), entre(8, 17), um([0, 15, 30, 45]));
      if (d2 < new Date(hoje.getTime() - 3 * 86400000)) {
        const r2 = await roda({ id: cod, codigo: cod, respostas: respostasReav(prim, c1), ciclos: [c1] }, true);
        if (!r2.falha && r2.salvo) {
          const c2 = carimba(Object.assign({}, r2.salvo), d2);
          c2.diasDesdeUltima = Math.round((d2 - d1) / 86400000);
          ciclos.push(registroRecepcao(cod, k, new Date(d2.getTime() - 20 * 60000), queixa, contato, medidas, true), c2);
          reavs++;
        } else { falhas++; console.log('  reavaliação de ' + cod + ' falhou: ' + (r2.falha || 'sem registro') + (r2.erros.length ? ' | ' + r2.erros[0] : '') + '\n    caminho: ' + r2.caminho.slice(-6).join(' > ')); }
      }
    }
    pacientes[cod] = ciclos;
    if (k % 25 === 0) console.log('  ' + k + ' pacientes');
  }

  if (fs.existsSync(BANCO)) fs.copyFileSync(BANCO, BANCO + '.antes-ficticios');
  const tmp = BANCO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ pacientes }, null, 1));
  fs.renameSync(tmp, BANCO);
  console.log('\n' + Object.keys(pacientes).length + ' pacientes fictícios (' + reavs + ' com reavaliação) em ' + BANCO + (falhas ? ' — ' + falhas + ' atendimento(s) falharam e ficaram de fora' : ''));
  execFileSync('python3', [path.join(RAIZ, 'servidor_maximus.py'), '--fila-ficticia', '6'], { stdio: 'inherit' });
})();
