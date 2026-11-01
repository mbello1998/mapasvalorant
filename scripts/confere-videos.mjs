/**
 * Confere os vídeos dos agentes contra a casa de origem.
 *
 *   node scripts/confere-videos.mjs
 *
 * Cada registro de `public/assets/dados/videos-agentes.json` é perguntado ao
 * oEmbed do YouTube ou do TikTok, que é o jeito público de saber se o vídeo
 * ainda existe e de quem ele é. O que não responde está morto — o autor
 * apagou, deixou privado ou a plataforma derrubou — e precisa sair do
 * arquivo ou ser trocado, porque na página ele vira um quadro vazio.
 *
 * O canal também é conferido: o arquivo só deve apontar para conta oficial,
 * e um id trocado por engano costuma cair num canal de terceiro, não num
 * vídeo inexistente. Por isso o aviso de autor diferente vale tanto quanto o
 * de vídeo morto.
 *
 * Sai com código 1 se algo estiver errado, para servir de porta num CI.
 */

import { readFile } from "node:fs/promises";

const ARQUIVO = new URL("../public/assets/dados/videos-agentes.json", import.meta.url);

/** Contas oficiais. Qualquer outro autor é suspeito e vira aviso. */
const OFICIAIS = new Set([
  "VALORANT", "VALORANT // Brasil", "VALORANT - LATAM", "valorantbrasil", "@valorantbrasil",
]);

const OEMBED = {
  youtube: (v) =>
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v.id}`)}`,
  tiktok: (v) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(v.url)}`,
};

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

const videos = JSON.parse(await readFile(ARQUIVO, "utf8"));
const entradas = Object.entries(videos);
const resultados = await Promise.all(entradas.map(([uuid, v]) => conferir(uuid, v)));

let problemas = 0;

for (const r of resultados.sort((a, b) => a.v.agente.localeCompare(b.v.agente))) {
  const nome = r.v.agente.padEnd(10);
  if (r.erro) {
    problemas += 1;
    console.log(`✖ ${nome} ${r.v.plataforma}/${r.v.id} — ${r.erro}`);
    continue;
  }
  const estranho = r.autor && !OFICIAIS.has(r.autor);
  if (estranho) problemas += 1;
  console.log(`${estranho ? "⚠" : "✔"} ${nome} ${r.autor || "(sem autor)"} — ${r.titulo || r.v.titulo}`);
}

console.log(`\n${entradas.length} vídeos, ${problemas} com problema.`);
process.exit(problemas ? 1 : 0);
