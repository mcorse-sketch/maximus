#!/usr/bin/env node
// Tabela de cores das fórmulas para a gráfica (v2.5-E). A fonte única é COR_FORMULA em
// apps/triagem.html — este script só lê de lá e gera CSV + HTML (+ PNG se houver Chrome).
// Uso: node scripts/cores_formulas.js [pasta_de_saida]
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(RAIZ, 'docs'));
const html = fs.readFileSync(path.join(RAIZ, 'apps', 'triagem.html'), 'utf8');

const bloco = (ini) => { const i = html.indexOf(ini); if (i < 0) throw new Error('não achei ' + ini);
  let d = 0, j = html.indexOf('{', i); const a = j; for (; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}' && --d === 0) break; }
  return html.slice(a, j + 1); };
const COR = Function('return ' + bloco('const COR_FORMULA'))();
const ICI = Function('return ' + bloco('const ICI_COMPO'))();
// comentários de família ao lado de cada linha do mapa
const familia = {};
bloco('const COR_FORMULA').split('\n').forEach(l => { const m = l.match(/\/\/\s*(.+)$/); if (!m) return;
  [...l.matchAll(/'([A-Z0-9\-]+)'\s*:/g)].forEach(x => { familia[x[1]] = m[1].trim(); }); });
const nomeF = cod => { const m = html.match(new RegExp("'" + cod.replace(/-/g, '\\-') + "'\\s*:\\s*\\{role:'([^']*)',\\s*txt:'([^']*)'")); return m ? m[1] + ' — ' + m[2] : ''; };
const br = v => String(v).replace('.', ',');
const nomeR = n => { const c = ICI['R' + n]; if (!c) return ''; const p = [];
  if (c.pge1 != null) p.push('alprostadil (PGE1) ' + br(c.pge1) + ' mcg/mL'); if (c.fento != null) p.push('fentolamina ' + br(c.fento) + ' mg/mL');
  if (c.papa != null) p.push('papaverina ' + br(c.papa) + ' mg/mL'); if (c.atro != null) p.push('atropina ' + br(c.atro) + ' mg/mL');
  return 'Intracavernosa — ' + p.join(' + '); };
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const cmyk = h => { const [r, g, b] = rgb(h).map(v => v / 255); const k = 1 - Math.max(r, g, b); if (k >= 1) return [0, 0, 0, 100];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map(v => Math.round(v * 100)); };

const linhas = Object.keys(COR).map(cod => ({ cod, fam: familia[cod] || '', nome: /^R\d+$/.test(cod) ? nomeR(+cod.slice(1)) : nomeF(cod), hex: COR[cod].toUpperCase(),
  rgb: rgb(COR[cod]).join(', '), cmyk: cmyk(COR[cod]).join(', ') }));
fs.mkdirSync(OUT, { recursive: true });
const csvq = v => '"' + String(v).replace(/"/g, '""') + '"';
fs.writeFileSync(path.join(OUT, 'cores_formulas.csv'), '\ufeff' + ['codigo;familia;nome;hex;rgb;cmyk_aprox'].concat(
  linhas.map(l => [l.cod, l.fam, l.nome, l.hex, l.rgb, l.cmyk].map(csvq).join(';'))).join('\n') + '\n');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
let fam = null;
const corpo = linhas.map(l => { const sep = l.fam !== fam ? '<tr class="fam"><td colspan="5">' + esc(l.fam) + '</td></tr>' : ''; fam = l.fam;
  return sep + '<tr><td><span class="sw" style="background:' + l.hex + '"></span></td><td class="c">' + esc(l.cod) + '</td><td class="n">' + esc(l.nome) +
    '</td><td class="m">' + l.hex + '</td><td class="m">' + l.cmyk + '</td></tr>'; }).join('');
const pagina = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Cores das fórmulas — Maximus</title><style>
body{font:13px/1.35 Inter,-apple-system,"Helvetica Neue",Arial,sans-serif;color:#0E1E28;background:#F2F9F9;margin:0;padding:28px 34px}
h1{font:600 22px/1.2 "Inter Tight",Inter,sans-serif;letter-spacing:-.02em;margin:0 0 4px} p{margin:0 0 16px;color:#424D54}
table{border-collapse:collapse;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(1,11,15,.05)}
th{text-align:left;font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5F6B71;padding:10px 12px;border-bottom:1px solid #D1DBDB}
td{padding:6px 12px;border-bottom:1px solid #E9F1F1;vertical-align:middle} tr.fam td{background:#E9F1F1;color:#424D54;font-size:11.5px;font-weight:600;padding:5px 12px}
.sw{display:inline-block;width:28px;height:28px;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(1,8,12,.15)} .c{font-weight:600;white-space:nowrap}
.n{color:#424D54;font-size:12px} .m{font-family:"SF Mono",Menlo,monospace;font-size:12px;white-space:nowrap}
.rod{margin-top:12px;font-size:11.5px;color:#5F6B71}</style>
<h1>Cores das fórmulas · Maximus</h1><p>Proposta para aprovação — a mesma cor no app (quadradinho no canto do cartão) e na embalagem. Concentrações da mesma fórmula são tons da mesma família.</p>
<table><tr><th></th><th>Código</th><th>Fórmula</th><th>HEX</th><th>CMYK aprox.</th></tr>${corpo}</table>
<div class="rod">CMYK é conversão aproximada a partir do RGB — conferir prova de cor e Pantone com a gráfica. Serviços e itens sem embalagem própria (ondas de choque, TEFI, exames, preservativo de farmácia) não têm cor. Fonte única: COR_FORMULA em apps/triagem.html.</div></html>`;
const fh = path.join(OUT, 'cores_formulas.html'); fs.writeFileSync(fh, pagina);
console.log(linhas.length + ' cores → ' + path.join(OUT, 'cores_formulas.csv'));
try {
  execFileSync('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=1100,' + (260 + linhas.length * 46 + 14 * 30),
    '--screenshot=' + path.join(OUT, 'cores_formulas.png'), 'file://' + fh], { stdio: 'ignore', timeout: 60000 });
  console.log('PNG → ' + path.join(OUT, 'cores_formulas.png'));
} catch (e) { console.log('sem Chrome: abra ' + fh + ' e exporte o PNG'); }
