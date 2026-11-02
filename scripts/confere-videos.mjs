/**
 * Confere os vídeos dos agentes e dos mapas contra a casa de origem.
 *
 *   node scripts/confere-videos.mjs
 *
 * Cada registro de `public/assets/dados/videos-agentes.json` e de
 * `videos-mapas.json` é perguntado ao
 * oEmbed do YouTube ou do TikTok, que é o jeito público de saber se o vídeo
 * ainda existe e de quem ele é. O que não responde está morto — o autor
 * apagou, deixou privado ou a plataforma derrubou — e precisa sair do
 * arquivo ou ser trocado, porque na página ele vira um quadro vazio.
 *
 * O canal também é conferido. Um id trocado por engano costuma cair num
 * canal qualquer, não num vídeo inexistente, então o autor errado vale tanto
 * aviso quanto o vídeo morto. Para os registros oficiais, "certo" é estar
 * numa das contas da Riot; para os poucos marcados `"oficial": false` — guia
 * de mapa feito por criador, onde a Riot não publicou nada —, "certo" é
 * continuar no canal que o arquivo diz.
 *
 * Sai com código 1 se algo estiver errado, para servir de porta num CI.
 */

import { readFile } from "node:fs/promises";

const ARQUIVOS = ["videos-agentes.json", "videos-mapas.json"].map(
  (nome) => new URL(`../public/assets/dados/${nome}`, import.meta.url),
);

/** Contas oficiais. Qualquer outro autor é suspeito e vira aviso. */
const OFICIAIS = new Set([
  "VALORANT", "VALORANT // Brasil", "VALORANT - LATAM", "valorantbrasil", "@valorantbrasil",
]);

const OEMBED = {
  youtube: (v) =>
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v.id}`)}`,
  tiktok: (v) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(v.url)}`,
};

/** O nome do agente ou do mapa, que é só o rótulo da linha no relatório. */
const quem = (v) => v.agente ?? v.mapa ?? "?";

async function conferir(uuid, v) {
  const monta = OEMBED[v.plataforma];
  if (!monta) return { uuid, v, erro: `plataforma desconhecida: ${v.plataforma}` };

  try {
    const r = await fetch(monta(v), { signal: AbortSignal.timeout(25000) });
    if (!r.ok) return { uuid, v, erro: `oEmbed respondeu ${r.status}` };
    const d = await r.json();
    // O TikTok nem sempre manda título; o nome da conta ele manda.
    return { uuid, v, autor: d.author_name ?? d.author_unique_id ?? "", titulo: d.title ?? "" };
  } catch (e) {
    return { uuid, v, erro: e.message };
  }
}

const entradas = [];
for (const arquivo of ARQUIVOS) {
  const videos = JSON.parse(await readFile(arquivo, "utf8"));
  entradas.push(...Object.entries(videos));
}
const resultados = await Promise.all(entradas.map(([uuid, v]) => conferir(uuid, v)));

let problemas = 0;

for (const r of resultados.sort((a, b) => quem(a.v).localeCompare(quem(b.v)))) {
  const nome = quem(r.v).padEnd(10);
  if (r.erro) {
    problemas += 1;
    console.log(`✖ ${nome} ${r.v.plataforma}/${r.v.id} — ${r.erro}`);
    continue;
  }
  const daRiot = r.v.oficial !== false;
  const estranho = r.autor && (daRiot
    ? !OFICIAIS.has(r.autor)
    : r.autor !== r.v.autor);
  if (estranho) problemas += 1;
  const marca = estranho ? "⚠" : (daRiot ? "✔" : "·");
  console.log(`${marca} ${nome} ${r.autor || "(sem autor)"} — ${r.titulo || r.v.titulo}`);
}

const daComunidade = entradas.filter(([, v]) => v.oficial === false).length;
console.log(`\n${entradas.length} vídeos (${daComunidade} da comunidade, marcados com ·), `
  + `${problemas} com problema.`);
process.exit(problemas ? 1 : 0);
