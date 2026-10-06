// Testa o kiosk v2 da recepção: fluxo completo, roleta e regra do contato.
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

const ARQ = process.argv[2] || '/home/claude/v2/kiosk-v2.html';
const N = parseInt(process.argv[3] || '100', 10);
const HTML = fs.readFileSync(ARQ, 'utf8');

let seed = 913377;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];
const intBetween = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const erros = [];
process.on('unhandledRejection', e => erros.push('rejeicao: ' + (e && e.message ? e.message : e)));

function memoria() {
  const mem = {};
  const hoje = new Date();
  const dia = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  for (let i = 1; i <= 60; i++) {
    const cod = 'MX' + String(i).padStart(4, '0');
    const d = new Date(hoje.getTime() - intBetween(40, 120) * 86400000);
    mem['pacientes/' + cod + '/ciclos'] = [{
      codigo: cod, data: d.toISOString(), dataLocal: dia(d), tipo: 'reavaliacao',
      queixaRecepcao: pick(['de', 'ep', 'ambos', 'libido', 'clinica']),
      protocolo: 'DUO-3', kitCodes: ['SP-DUO', 'NOITE-1'],
      iniciais: i % 2 ? 'ABC' : '', telefone: i % 3 === 0 ? '(21)99999-1234' : '',
      email: i % 2 ? 'p' + i + '@exemplo.com' : '',
      medidas: { peso: intBetween(60, 110), altura: intBetween(160, 195) }
    }];
  }
  mem['recepcao'] = [];
  mem['codigos'] = Array.from({ length: 60 }, (_, k) => ({ codigo: 'MX' + String(k + 1).padStart(4, '0') }));
  return mem;
}
function fakeDb(mem) {
  function q(arr) {
    let l = arr.slice();
    const o = {
      orderBy(f, dir) { l.sort((a, b) => (a[f] < b[f] ? 1 : -1) * (dir === 'desc' ? 1 : -1)); return o; },
      limit(n) { l = l.slice(0, n); return o; },
      async get() { return { docs: l.map(d => ({ data: () => d })) }; },
      async add(reg) { arr.push(JSON.parse(JSON.stringify(reg))); return true; }
    };
    return o;
  }
  return { collection(p) { const a = mem[p] || (mem[p] = []); return q(a); } };
}

const espera = ms => new Promise(r => setTimeout(r, ms));
const visivel = el => el && el.style.display !== 'none' && !el.hidden;

async function roda(i, mem, novo) {
  let conflitos = 0;
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => erros.push('jsdomError: ' + (e && e.message)));
  const dom = new JSDOM(HTML, {
    url: 'file:///k/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.claude = { use: async () => fakeDb(mem) };
      w.onerror = m => erros.push('onerror: ' + m);
      w.scrollTo = () => {};
      w.Element.prototype.scrollTo = function (o) { if (o && typeof o.top === 'number') this.scrollTop = o.top; };
    }
  });
  const { window: win } = dom, doc = win.document;
  const rel = { i, passos: 0, falha: null, contatoBloqueou: false, roleta: false };
  await espera(80);

  const av = doc.getElementById('avancar');
  for (let passo = 0; passo < 120; passo++) {
    if (visivel(doc.getElementById('fim'))) break;
    const w = doc.getElementById('opts') || doc.querySelector('.kopts') || doc;
    const cont = doc.getElementById('avancar');

    // tela de contato: confere que o botão está travado antes de preencher
    const pergunta = (doc.getElementById('pergunta') || {}).textContent || '';
    const contatoBox = doc.querySelector('.kcontato');
    if (contatoBox) {
      const inps = [...contatoBox.querySelectorAll('input')];
      const dispara = el => el.dispatchEvent(new win.Event('input', { bubbles: true }));
      const jaVeioDoBanco = !!(inps[1].value || inps[2].value);
      const avisoFalta = /N.o achamos telefone nem email/i.test(contatoBox.textContent);
      if (avisoFalta) rel.avisouFalta = true;
      if (jaVeioDoBanco) {
        rel.prefill = true;
        if (!/Confira os dados/i.test(pergunta)) rel.falha = 'retorno nao pediu confirmacao do contato';
        if (cont.disabled) rel.falha = rel.falha || 'contato do cadastro nao liberou o avanco';
      } else {
        if (!cont.disabled) rel.falha = 'contato liberou sem telefone nem email';
        else rel.contatoBloqueou = true;
      }

      // iniciais: minusculas e pontos entram, maiusculas sem pontos ficam
      inps[0].value = 't.s.t.'; dispara(inps[0]);
      if (inps[0].value !== 'TST') rel.falha = rel.falha || 'iniciais nao normalizadas: ' + inps[0].value;
      rel.iniciaisOk = inps[0].value === 'TST';

      // telefone sujo vira o formato da casa
      inps[1].value = ' 21 9 8888 7766 '; dispara(inps[1]);
      if (inps[1].value !== '(21)98888-7766') rel.falha = rel.falha || 'telefone nao formatado: ' + inps[1].value;
      rel.telFormatado = inps[1].value === '(21)98888-7766';

      // telefone incompleto trava
      inps[1].value = '2199'; dispara(inps[1]);
      if (!cont.disabled) rel.falha = rel.falha || 'telefone incompleto nao travou';
      else rel.telTravou = true;

      // email invalido trava mesmo com telefone bom
      inps[1].value = '21988887766'; dispara(inps[1]);
      inps[2].value = 'nao-e-email'; dispara(inps[2]);
      if (!cont.disabled) rel.falha = rel.falha || 'email invalido nao travou';
      else rel.mailTravou = true;

      // arruma e segue
      const porEmail = rnd() < 0.5;
      inps[2].value = porEmail ? ('p' + i + '@exemplo.com') : ''; dispara(inps[2]);
      if (cont.disabled) rel.falha = rel.falha || 'contato continuou travado com dados validos';
    }

    // roleta (peso e altura)
    const roletas = [...doc.querySelectorAll('.krol')];
    if (roletas.length) {
      roletas.forEach(r => {
        const its = [...r.querySelectorAll('.it')];
        if (its.length) { its[intBetween(0, its.length - 1)].click(); rel.roleta = true; }
      });
    }

    const codInp = doc.querySelector('#opcoes input.kfld');
    if (/C\u00f3digo do paciente/i.test(pergunta) && codInp) {
      // paciente novo: usa o próximo livre, que já vem preenchido no campo
      // (campo vazio não avança mais — teste_codigo.js); retorno: digita um código
      if (novo) {
        if (!/^MX\d{4}$/.test(codInp.value)) { rel.falha = 'código novo não veio preenchido: "' + codInp.value + '"'; break; }
      } else codInp.value = 'MX' + String(intBetween(1, 60)).padStart(4, '0');
      codInp.dispatchEvent(new win.Event('input', { bubbles: true }));
    }

    const opts = [...doc.querySelectorAll('.kopt')];
    // a recepção escolhe novo/retorno de acordo com o que digitou
    if (/novo ou um retorno/i.test(pergunta) && opts.length) {
      const alvo = opts.find(b => (novo ? /novo/i : /retorno/i).test(b.textContent)) || opts[0];
      alvo.click(); await espera(90); rel.passos++; continue;
    }
    // tela de conflito: a recepção volta e corrige
    if (/conferir o c\u00f3digo/i.test(pergunta)) {
      rel.conflito = true;
      const volta = doc.getElementById('voltar');
      if (volta) { volta.click(); await espera(40); }
      novo = !novo; conflitos++;
      if (conflitos > 3) { rel.falha = 'conflito de codigo nao resolvido'; break; }
      continue;
    }
    const escala = [...doc.querySelectorAll('.knum')];
    if (opts.length) { pick(opts).click(); await espera(40); rel.passos++; continue; }
    if (escala.length) { pick(escala).click(); await espera(40); rel.passos++; continue; }

    if (cont.disabled) {
      const outros = [...doc.querySelectorAll('#quiz input.kfld')];
      if (outros.length) { outros[0].value = 'MX' + String(intBetween(1, 60)).padStart(4, '0'); outros[0].dispatchEvent(new win.Event('input', { bubbles: true })); }
    }
    if (cont.disabled) { rel.falha = rel.falha || 'travou em: ' + (pergunta || '?'); break; }
    try { cont.click(); } catch (e) { erros.push('clique: ' + e.message); rel.falha = 'erro ao avancar'; break; }
    await espera(45);
    rel.passos++;
  }
  if (!rel.falha && !visivel(doc.getElementById('fim'))) rel.falha = 'nao chegou ao fim em 120 passos';
  dom.window.close();
  return rel;
}

// v2.4: na tela da recepção (antes de entregar o tablet), aguardando × atendidos
async function filaDeHoje() {
  const hoje = new Date();
  const dia = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  // v2.5-K: "min minutos atrás", mas nunca antes da meia-noite de hoje (entre 0h e 1h o registro caía no dia anterior)
  const reg = (cod, min, ret) => { const d = new Date(Math.max(hoje.getTime() - min * 60000, new Date(hoje).setHours(0, 0, 0, 0) + (100 - min) * 1000));
    return { codigo: cod, tipo: 'recepcao', linha: 'recepcao', data: d.toISOString(), dataLocal: dia(d), hora: d.toTimeString().slice(0, 5), iniciais: 'XYZ', retorno: ret }; };
  const mem = { recepcao: [reg('MX7001', 50, true), reg('MX7002', 30, false), reg('MX7003', 10, false)], codigos: [] };
  mem.atendidos = [{ codigo: 'MX7001', recepcao: mem.recepcao[0].data, atendido: true, em: new Date().toISOString() }];
  const vc = new VirtualConsole(); const errs = [];
  vc.on('jsdomError', e => errs.push('jsdomError: ' + (e && e.message)));
  const dom = new JSDOM(HTML, { url: 'file:///k/index.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.claude = { use: async () => fakeDb(mem) }; w.onerror = m => errs.push('onerror: ' + m); w.scrollTo = () => {}; w.confirm = () => true; w.alert = () => {}; } });
  const doc = dom.window.document;
  await espera(150);
  const box = doc.getElementById('filaHoje');
  const r = [];
  const t0 = box ? box.textContent : '';
  r.push(['na tela da recepção mostra "2 aguardando · 1 atendido"', visivel(box) && /2\s*aguardando/.test(t0) && /1\s*atendido\b/.test(t0), t0]);
  doc.getElementById('filaVer').click(); await espera(20);
  const t1 = box.textContent;
  r.push(['a lista separa aguardando (MX7002, MX7003) de atendidos (MX7001)', /Aguardando.*MX7002.*MX7003.*Atendidos hoje.*MX7001/.test(t1), t1.slice(0, 200)]);
  const dev = box.querySelector('[data-dev="MX7001"]');
  r.push(['atendido tem "Devolver à fila"', !!dev]);
  if (dev) { dev.click(); await espera(30); }
  // v2.5-K: a confirmação é o diálogo do próprio app (não mais window.confirm)
  const dlg = doc.querySelector('.mx-dlg-ov');
  r.push(['"Devolver à fila" pede confirmação no diálogo do app', !!dlg && /Devolver MX7001/.test(dlg.textContent), dlg ? dlg.textContent.slice(0, 120) : 'sem diálogo']);
  if (dlg) { dlg.querySelector('[data-v="1"]').click(); await espera(80); }
  const ult = mem.atendidos[mem.atendidos.length - 1];
  r.push(['devolver (com confirmação) acrescenta atendido=false, sem apagar nada', mem.atendidos.length === 2 && ult.atendido === false && mem.recepcao.length === 3, JSON.stringify(ult)]);
  r.push(['depois de devolver: 3 aguardando', /3\s*aguardando/.test(box.textContent), box.textContent.slice(0, 80)]);
  // entregou o tablet: a lista some
  const fld = doc.querySelector('#opcoes input'); if (fld) { fld.value = 'MX7004'; fld.dispatchEvent(new dom.window.Event('input')); }
  doc.getElementById('avancar').click(); await espera(60);
  r.push(['fora da tela da recepção a lista não aparece (paciente com o tablet)', !visivel(box)]);
  r.push(['sem erro de JS na fila de hoje', errs.length === 0, errs.slice(0, 2).join(' | ')]);
  dom.window.close();
  return r;
}

(async () => {
  const fh = await filaDeHoje();
  console.log('fila de hoje na recepção (v2.4)');
  fh.forEach(([n, okk, extra]) => console.log((okk ? '  ok     ' : '  FALHA  ') + n + (!okk && extra ? '\n         ' + extra : '')));
  const falhasFila = fh.filter(x => !x[1]).length;
  const mem = memoria();
  const rels = [];
  for (let i = 1; i <= N; i++) { rels.push(await roda(i, mem, i % 3 === 0)); if (i % 20 === 0) console.log('  ' + i + ' pacientes'); }
  const falhas = rels.filter(r => r.falha);
  const salvos = mem['recepcao'];
  const comContato = salvos.filter(r => r.telefone || r.email).length;
  const comMedidas = salvos.filter(r => r.medidas && r.medidas.peso && r.medidas.altura).length;
  const passos = rels.map(r => r.passos);
  console.log('\n=== KIOSK ===');
  console.log('pacientes:', N, '| concluiram:', rels.filter(r => !r.falha).length);
  console.log('telas por questionario: media', (passos.reduce((a, b) => a + b, 0) / passos.length).toFixed(1), '| max', Math.max(...passos));
  console.log('registros salvos:', salvos.length, '| com telefone ou email:', comContato, '| com peso e altura pela roleta:', comMedidas);
  console.log('tela de contato travou sem contato:', rels.filter(r => r.contatoBloqueou).length);
  console.log('retornos que vieram preenchidos do cadastro:', rels.filter(r => r.prefill).length,
    '| retornos sem contato no cadastro, com aviso:', rels.filter(r => r.avisouFalta).length);
  console.log('iniciais normalizadas:', rels.filter(r => r.iniciaisOk).length, '| telefone formatado:', rels.filter(r => r.telFormatado).length);
  console.log('travou com telefone incompleto:', rels.filter(r => r.telTravou).length, '| com email invalido:', rels.filter(r => r.mailTravou).length);
  const tels = salvos.map(r => r.telefone).filter(Boolean);
  const foraDoPadrao = tels.filter(t => !/^\(\d{2}\)\d{4,5}-\d{4}$/.test(t));
  console.log('telefones salvos:', tels.length, '| fora do padrao:', foraDoPadrao.length, foraDoPadrao.slice(0,3).join(' '));
  console.log('usaram a roleta:', rels.filter(r => r.roleta).length);
  console.log('erros de JS:', erros.length);
  erros.slice(0, 6).forEach(e => console.log('   -', e));
  console.log('falhas de fluxo:', falhas.length);
  falhas.slice(0, 8).forEach(f => console.log('   - paciente', f.i, ':', f.falha));
  console.log('fila de hoje (v2.4) com falha:', falhasFila);
  process.exit(falhas.length || erros.length || falhasFila ? 1 : 0);
})();
