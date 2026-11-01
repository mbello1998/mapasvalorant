/* ==========================================================================
   Arte remota pelo CDN de imagem da Netlify.

   A base da Riot serve a arte dos mapas em 1920×1080 e 2,3 MB por imagem.
   Num cartão de 260px isso é banda jogada fora, e a alternativa que o site
   usava — `listViewIcon`, de 456×100 — é pequena demais: esticada para 16/9
   ela borra. O CDN da Netlify redimensiona na borda e entrega WebP, então dá
   para pedir a arte grande e receber do tamanho certo.

   `netlify.toml` declara quais endereços de fora o CDN pode tocar; sem isso
   ele recusa. Este arquivo não toca no documento: tem teste no Node.
   ========================================================================== */

/** Os domínios que `netlify.toml` libera em `[images] remote_images`. Fora
 *  deles o CDN recusa, então nem vale reescrever o endereço. */
const LIBERADOS = new Set(["media.valorant-api.com"]);

/**
 * O endereço da imagem redimensionada, ou o original quando não dá para
 * redimensionar. Nunca lança: imagem é enfeite, e um endereço estranho não
 * pode derrubar a montagem da página.
 *
 * @param {string} url      endereço da arte original
 * @param {object} opcoes
 * @param {number} opcoes.largura  largura pedida, em pixels de CSS
 * @param {number} [opcoes.qualidade=72]
 */
export function arte(url, { largura, qualidade = 72 } = {}) {
  if (typeof url !== "string" || !url) return "";
  if (!Number.isFinite(largura) || largura <= 0) return url;

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return url;
  }
  if (!LIBERADOS.has(host)) return url;

  // Dobrado para a tela densa: um cartão de 260px num celular retina pinta
  // 520 pixels de verdade, e a imagem do tamanho exato aparece mole.
  const busca = new URLSearchParams({
    url,
    w: String(Math.round(largura * 2)),
    fm: "webp",
    q: String(qualidade),
  });
  return `/.netlify/images?${busca}`;
}

/**
 * Põe a arte na imagem com um endereço de reserva. Se o CDN falhar — regra
 * não publicada ainda, borda fora do ar —, a imagem troca para o original da
 * Riot em vez de ficar quebrada. A troca acontece uma vez só.
 */
export function pintarArte(img, url, opcoes) {
  if (!img) return img;
  const pedido = arte(url, opcoes);
  if (pedido !== url) {
    img.addEventListener("error", () => { img.src = url; }, { once: true });
  }
  img.src = pedido;
  return img;
}
