/* ==========================================================================
   Roteiro — a navegação de tela única.

   Este arquivo não toca no `document` fora das funções: as decisões de rota
   são puras de propósito, para os testes do Node as exercitarem sem navegador.
   ========================================================================== */

/** As cinco telas públicas. O Painel não entra: não se navega entre ele e o
 *  resto, e ele é grande demais para ganhar carona nisto. */
export const TELAS = {
  estande: { arquivo: "index.html",   modulo: "./app.js",     rotulo: "Estande" },
  arsenal: { arquivo: "arsenal.html", modulo: "./arsenal.js", rotulo: "Arsenal" },
  linha:   { arquivo: "linha.html",   modulo: "./linha.js",   rotulo: "Linha de Tiro" },
  mapas:   { arquivo: "mapas.html",   modulo: "./mapas.js",   rotulo: "Sala de Mapas" },
  ranking: { arquivo: "ranking.html", modulo: "./ranking.js", rotulo: "Ranking" },
};

const POR_ARQUIVO = new Map(Object.entries(TELAS).map(([id, t]) => [t.arquivo, id]));

/** A raiz serve o index, então caminho vazio é a tela inicial. */
function telaDoCaminho(caminho) {
  const arquivo = String(caminho ?? "").replace(/^\/+/, "") || "index.html";
  return POR_ARQUIVO.get(arquivo) ?? null;
}

/** Qual tela um link representa, ou null se não for uma delas. */
export function telaDoHref(href, origem) {
  let url;
  try {
    url = new URL(href, origem);
  } catch {
    return null;
  }
  // `mailto:` e companhia resolvem sem lançar, mas têm origem "null".
  if (url.origin !== new URL(origem).origin) return null;
  return telaDoCaminho(url.pathname);
}

/**
 * Se o roteador deve assumir o clique. Recebe dados simples, sem DOM: quem
 * chama monta este objeto a partir do evento e do `<a>`.
 *
 * Diz não ao que o navegador faz melhor — abrir em aba nova, baixar, sair do
 * site — e ao link da tela em que já se está, que é âncora para rolar.
 */
export function podeTrocar({
  botao = 0, meta = false, ctrl = false, shift = false, alt = false,
  jaTratado = false, alvo = "", baixar = false,
  href = "", origem = "", telaAtual = null,
} = {}) {
  if (botao !== 0 || meta || ctrl || shift || alt || jaTratado || baixar) return false;
  if (alvo && alvo !== "_self") return false;

  const tela = telaDoHref(href, origem);
  return tela !== null && tela !== telaAtual;
}

/** A tela de abertura: a marca deixada por um link antigo manda; sem ela,
 *  vale o caminho; sem os dois, o Estande. */
export function telaInicial(caminho, marca) {
  if (marca && Object.hasOwn(TELAS, marca)) return marca;
  return telaDoCaminho(caminho) ?? "estande";
}

/** Quem abriu uma tela por fora da raiz precisa ser trazido para ela. O que
 *  não é tela — o Painel, por exemplo — fica onde está. */
export function precisaDesviar(caminho) {
  if (caminho === "/" || caminho === "/index.html") return false;
  return telaDoCaminho(caminho) !== null;
}

/** Lê o estado do histórico. Uma entrada anterior à casca não tem tela. */
export function telaDoEstado(estado) {
  const tela = estado && typeof estado === "object" ? estado.tela : null;
  return typeof tela === "string" && Object.hasOwn(TELAS, tela) ? tela : null;
}
