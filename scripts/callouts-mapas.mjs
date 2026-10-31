// Ferramenta de build: busca os mapas da API da Riot (valorant-api.com), converte
// cada callout em fração 0-1 do minimapa e imprime por mapa. Usada para ancorar
// o acervo inicial (netlify/lib/acervo-tatica.mts) em lugares reais.
//
// Uso: node scripts/callouts-mapas.mjs [trecho-do-nome-do-mapa]
import { paraMinimapa } from "../public/assets/js/minimapa.js";

const filtro = (process.argv[2] ?? "").toLowerCase();
const r = await fetch("https://valorant-api.com/v1/maps?language=pt-BR");
const { data } = await r.json();

for (const m of data) {
  if (!m.tacticalDescription) continue;
  if (filtro && !m.displayName.toLowerCase().includes(filtro)) continue;
  console.log(`\n## ${m.displayName}  ${m.uuid}`);
  for (const c of m.callouts ?? []) {
    const p = paraMinimapa(c.location, m);
    const ok = p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    console.log(`${c.superRegionName.padEnd(8)} ${c.regionName.padEnd(22)} x=${p.x.toFixed(3)} y=${p.y.toFixed(3)}${ok ? "" : "  (fora)"}`);
  }
}
