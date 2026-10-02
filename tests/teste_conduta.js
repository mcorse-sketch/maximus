// v2.4 — tela da conduta (itens 9 e 10 da fila de correções). Só exibição:
// protocolo, kit, escores e texto do prontuário são conferidos pela regressão.
//   item 9: situação das ondas de choque e do TEFI numa linha própria, coerente
//           com o que foi gravado (no protocolo / oferta complementar / não
//           indicadas; TEFI a agendar / realizado) e sem "ficou de fora" quando
//           as ondas estão no kit como complemento;
//   item 10: racional curto (sem ensaio clínico nem mecanismo), uma vez só — o
//           relatório da consulta não repete o racional nem, na tela, o kit.
// Uso: node teste_conduta.js   (roda os pacientes da regressão)
const { roda } = require('./regressao');
const PACIENTES = require('./regressao/pacientes');

let falhas = 0;
const ok = (cond, nome, extra) => {
  if (!cond) { falhas++; console.log('  FALHA  ' + nome + (extra ? '\n         ' + extra : '')); }
  return cond;
};
const PROIBIDO = /ensaio|ECR|meta-an[áa]lise|OR \d|licenciad|óxido nítrico|CYP2D6|primeiro passo|900 mg|neovasculariza|aferência/i;

(async () => {
  const cont = { pac: 0, de: 0, protocolo: 0, complementar: 0, naoInd: 0, tefiAgendar: 0, tefiFeito: 0 };
  for (const p of PACIENTES) {
    const r = await roda(p, true, { manter: true });
    if (r.falha || !r.salvo) { if (r.win) r.win.close(); continue; }
    cont.pac++;
    const doc = r.win.document, s = r.salvo, id = p.id;
    const rep = doc.getElementById('report'), rac = doc.getElementById('racBox');
    const h4 = [...rep.querySelectorAll('h4')];
    ok(!h4.some(h => /Racional/.test(h.textContent)), id + ': o relatório da consulta não repete o racional');
    const pp = h4.find(h => /Protocolo prescrito/.test(h.textContent));
    ok(!pp || (pp.classList.contains('so-papel') && pp.nextElementSibling.classList.contains('so-papel')), id + ': "Protocolo prescrito" só no papel (na tela, os quadrinhos já mostram o kit)');
    const rt = rac.textContent;
    ok(!PROIBIDO.test(rt), id + ': racional sem ensaio clínico, mecanismo ou comparação', (rt.match(PROIBIDO) || [''])[0]);
    const nPorque = doc.querySelectorAll('#racBox li').length;
    ok(rt.length < 1600, id + ': racional curto (' + rt.length + ' caracteres, ' + nPorque + ' linhas)');

    const de = (s.tipo === 'primeira' || s.tipo === 'reavaliacao') && s.iief != null;
    const st = doc.getElementById('mxCdStatus');
    if (de) {
      cont.de++;
      const t = st ? st.textContent : '';
      const temOndas = (s.kitCodes || []).indexOf('ONDAS') >= 0;
      const esperado = s.ondasIndicado ? 'no protocolo' : (temOndas || s.ondasOpcional ? 'oferta complementar' : 'não indicadas');
      if (esperado === 'no protocolo') cont.protocolo++; else if (esperado === 'oferta complementar') cont.complementar++; else cont.naoInd++;
      ok(st && new RegExp('Ondas de choque' + esperado).test(t), id + ': ondas de choque "' + esperado + '"', t);
      const tefiEsp = s.tefi ? 'realizado' : (s.tefiIndicado ? 'indicado · a agendar' : null);
      if (s.tefiIndicado) cont.tefiAgendar++; if (s.tefi) cont.tefiFeito++;
      if (tefiEsp) ok(new RegExp('TEFI com Doppler' + tefiEsp).test(t), id + ': TEFI "' + tefiEsp + '"', t);
      const fora = [...doc.querySelectorAll('#racBox ul.fora li')].map(li => li.textContent);
      ok(!(temOndas && fora.some(f => /^Ondas de choque/.test(f))), id + ': com ondas no kit, o racional não diz que ficaram de fora');
      const chips = [...doc.querySelectorAll('#mxCdHead .mx-chip')].map(c => c.textContent);
      ok(!chips.some(c => /^(ondas de choque|TEFI)/i.test(c)), id + ': ondas/TEFI não se repetem nos chips', chips.join(' | '));
    } else ok(!st, id + ': fora da linha DE não mostra a linha de ondas/TEFI');
    r.win.close();
  }
  console.log('pacientes na conduta: ' + cont.pac + ' | linha DE: ' + cont.de + ' (ondas no protocolo ' + cont.protocolo +
    ', complementar ' + cont.complementar + ', não indicadas ' + cont.naoInd + ' | TEFI a agendar ' + cont.tefiAgendar + ', realizado ' + cont.tefiFeito + ')');
  ok(cont.protocolo > 0 && cont.complementar > 0 && cont.naoInd > 0 && cont.tefiAgendar > 0, 'a amostra cobre os três estados das ondas e o TEFI a agendar');
  console.log('\n=== CONDUTA (v2.4) ===');
  console.log('falhas: ' + falhas);
  process.exit(falhas ? 1 : 0);
})();
