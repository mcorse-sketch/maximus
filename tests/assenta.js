// v2.5-M — espera por condição em vez de tempo fixo.
// assenta(win): resolve quando o DOM do app passa `quieto` ms sem nenhuma mudança
// (o clique terminou de redesenhar a tela), ou depois de `max` ms. O app reage ao
// clique com microtarefas (await do banco falso) e setTimeout(0) — tudo isso roda
// antes do fim da janela de silêncio, mesmo com a máquina carregada, porque cada
// mudança reinicia a contagem. Substitui os "espera(15..300)" fixos, que eram a maior
// parte do tempo da bateria e, com a máquina carregada, às vezes curtos demais.
function assenta(win, opcoes) {
  const o = opcoes || {};
  const quieto = o.quieto || 4, max = o.max || 3000;
  return new Promise(res => {
    let t = null, fim = null, feito = false;
    const acaba = () => { if (feito) return; feito = true; try { obs.disconnect(); } catch (e) {} clearTimeout(t); clearTimeout(fim); res(); };
    const obs = new win.MutationObserver(() => { clearTimeout(t); t = setTimeout(acaba, quieto); });
    try { obs.observe(win.document, { childList: true, subtree: true, attributes: true, characterData: true }); }
    catch (e) { setTimeout(res, quieto); return; }      // janela já fechada
    t = setTimeout(acaba, quieto);
    fim = setTimeout(acaba, max);
  });
}

// até a condição valer (checa a cada assentada), ou `max` ms
async function ate(win, cond, max) {
  const limite = Date.now() + (max || 3000);
  while (!cond()) { if (Date.now() > limite) return false; await assenta(win, { quieto: 4, max: 50 }); }
  return true;
}

module.exports = { assenta, ate };
