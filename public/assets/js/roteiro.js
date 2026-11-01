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
  href = "", hrefCru = "", origem = "", telaAtual = null,
} = {}) {
  if (botao !== 0 || meta || ctrl || shift || alt || jaTratado || baixar) return false;
  if (alvo && alvo !== "_self") return false;

  // Um href escrito como "#lugar" é âncora da tela em que se está, sempre.
  // Resolvido vira a raiz — que é o arquivo do Estande —, e sem olhar o que
  // está escrito o link de pular levaria para fora de qualquer outra tela.
  if (String(hrefCru).startsWith("#")) return false;

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

/**
 * O endereço que a barra deve mostrar, ou null se já está certo. A barra fica
 * só com a raiz: sem `index.html`, que é detalhe de servidor, e sem âncora,
 * que é lugar dentro da página e não endereço.
 */
export function enderecoLimpo(caminho, hash) {
  return caminho === "/" && !hash ? null : "/";
}

/**
 * `globalThis.sessionStorage` pode lançar na própria leitura da propriedade
 * quando o navegador está restrito — antes de qualquer `getItem`. Sem isto a
 * casca nem começava.
 */
export function cofre(nome) {
  try {
    return globalThis[nome] ?? null;
  } catch {
    return null;
  }
}

/** Onde a tela pedida por um link antigo espera, entre o desvio e a casca. */
export const CHAVE_MARCA = "rota.tela";

/**
 * Lê e apaga a marca deixada pelo desvio. É de uma viagem só: recarregar a
 * raiz depois não deve voltar para a tela de ontem.
 *
 * Navegação restrita bloqueia o `sessionStorage`, e isso não pode derrubar a
 * abertura do site: qualquer erro do cofre vira "não havia marca".
 */
export function lerMarca(cofre) {
  try {
    const tela = cofre?.getItem(CHAVE_MARCA) ?? null;
    cofre?.removeItem(CHAVE_MARCA);
    return tela && Object.hasOwn(TELAS, tela) ? tela : null;
  } catch {
    return null;
  }
}

/** Lê o estado do histórico. Uma entrada anterior à casca não tem tela. */
export function telaDoEstado(estado) {
  const tela = estado && typeof estado === "object" ? estado.tela : null;
  return typeof tela === "string" && Object.hasOwn(TELAS, tela) ? tela : null;
}

/* ==========================================================================
   Daqui para baixo mexe no documento. Nada roda na importação: quem começa é
   `comecar()`, no fim do arquivo, e só quando existe um documento.
   ========================================================================== */

/** O que é da casca e nunca é trocado. */
const DA_CASCA = "nav.trilho, footer.rodape, script, .rota-barra, #rotaAviso";

/** A tela na tela. */
let atual = null;

/** Cada troca ganha um número: uma que voltou do fetch com o número vencido
 *  perdeu para um clique mais novo e é descartada sem pintar nada. */
let contador = 0;

/** Os módulos já importados, para a segunda visita não baixar de novo. */
const modulos = new Map();

async function moduloDa(tela) {
  if (!modulos.has(tela)) modulos.set(tela, await import(TELAS[tela].modulo));
  return modulos.get(tela);
}

/* ----------------------------------------------------------------- barra -- */

function barra() {
  return document.getElementById("rotaBarra");
}

function acenderBarra() {
  const b = barra();
  if (!b) return;
  clearTimeout(relogioBarra);
  b.hidden = false;
  b.classList.remove("rota-barra--pronta");
  // Um quadro de respiro: sem ele o navegador junta as duas classes e a
  // transição não acontece.
  requestAnimationFrame(() => b.classList.add("rota-barra--correndo"));
}

let relogioBarra = 0;

function apagarBarra() {
  const b = barra();
  if (!b) return;
  b.classList.add("rota-barra--pronta");
  clearTimeout(relogioBarra);
  relogioBarra = setTimeout(() => {
    b.hidden = true;
    b.classList.remove("rota-barra--correndo", "rota-barra--pronta");
  }, 260);
}

/* ----------------------------------------------------------------- troca -- */

/**
 * Põe no lugar os elementos da tela nova, respeitando onde cada um morava em
 * relação ao trilho e ao rodapé: o link de pular antes do trilho, o `main`
 * entre os dois, e as gavetas e telas de carga depois do rodapé.
 */
function trocarCorpo(doc) {
  for (const el of [...document.body.children]) {
    if (!el.matches(DA_CASCA)) el.remove();
  }

  const trilho = document.querySelector("nav.trilho");
  const rodape = document.querySelector("footer.rodape");
  const fim = document.getElementById("rotaBarra");

  let destino = trilho;
  for (const el of [...doc.body.children]) {
    if (el.matches("nav.trilho")) { destino = rodape; continue; }
    if (el.matches("footer.rodape")) { destino = fim; continue; }
    if (el.matches(DA_CASCA)) continue;
    const novo = document.adoptNode(el);
    if (destino) destino.before(novo);
    else document.body.append(novo);
  }
}

/** Foco e rolagem depois da troca: quem navega por teclado não pode continuar
 *  no fim do documento que acabou de sair. */
function assentar(tela, ancora) {
  const alvo = ancora && document.querySelector(ancora);
  if (alvo) {
    alvo.scrollIntoView();
  } else {
    window.scrollTo(0, 0);
  }

  const titulo = document.querySelector("main h1");
  if (titulo) {
    titulo.setAttribute("tabindex", "-1");
    titulo.focus({ preventScroll: true });
  }

  const aviso = document.getElementById("rotaAviso");
  if (aviso) aviso.textContent = `${TELAS[tela].rotulo}, carregado.`;
}

/**
 * Abrir uma tela. `doHistorico` marca a volta pelo botão Voltar: a entrada já
 * está no histórico e não deve ser empilhada de novo.
 */
export async function abrir(tela, { doHistorico = false, ancora = "" } = {}) {
  const alvo = TELAS[tela];
  if (!alvo) return;

  const meu = ++contador;
  const principal = document.querySelector("main");
  acenderBarra();
  principal?.classList.add("palco--saindo");

  let doc;
  try {
    const [resposta] = await Promise.all([
      fetch(alvo.arquivo, { headers: { Accept: "text/html" } }),
      // Piso de tempo: sem ele a barra pisca quando a resposta vem do cache.
      new Promise((ok) => setTimeout(ok, 180)),
    ]);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    doc = new DOMParser().parseFromString(await resposta.text(), "text/html");
  } catch {
    // Nenhuma falha do roteador pode deixar o site numa tela apagada: o
    // navegador leva a pessoa até lá do jeito antigo.
    location.href = alvo.arquivo;
    return;
  }

  if (meu !== contador) return;

  if (atual) {
    const saindo = await moduloDa(atual);
    saindo.desmontar?.();
  }

  trocarCorpo(doc);
  atual = tela;

  // Mais um clique chegou enquanto trocávamos o corpo: quem perdeu não monta
  // a tela, para não escrever título e trilho por cima da que vai ficar.
  if (meu !== contador) return;

  try {
    const entrando = await moduloDa(tela);
    await entrando.iniciar();
  } catch {
    // Só quem ainda vale é que leva a pessoa embora. A tela do perdedor foi
    // trocada por baixo dele, e o erro é consequência disso, não uma falha.
    if (meu === contador) location.href = alvo.arquivo;
    return;
  }

  if (meu !== contador) return;

  document.querySelector("main")?.classList.add("palco--entrando");
  assentar(tela, ancora);
  apagarBarra();

  if (!doHistorico) history.pushState({ tela }, "", location.href);
}

/* ---------------------------------------------------------------- cliques -- */

function aoClicar(ev) {
  const a = ev.target.closest?.("a[href]");
  if (!a) return;

  const dados = {
    botao: ev.button, meta: ev.metaKey, ctrl: ev.ctrlKey,
    shift: ev.shiftKey, alt: ev.altKey, jaTratado: ev.defaultPrevented,
    alvo: a.target, baixar: a.hasAttribute("download"),
    href: a.href, hrefCru: a.getAttribute("href") ?? "",
    origem: location.origin, telaAtual: atual,
  };

  if (podeTrocar(dados)) {
    ev.preventDefault();
    const ancora = new URL(a.href, location.origin).hash;
    abrir(telaDoHref(a.href, location.origin), { ancora });
    return;
  }

  // O link da tela em que já se está. Sem âncora recarregaria a página; com
  // âncora escreveria o `#lugar` na barra. Nos dois casos quem decide somos
  // nós, porque na barra fica só a raiz.
  const cru = a.getAttribute("href") ?? "";
  const tela = cru.startsWith("#") ? atual : telaDoHref(a.href, location.origin);
  const simples = !ev.defaultPrevented && ev.button === 0
    && !(ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)
    && (!a.target || a.target === "_self") && !a.hasAttribute("download");

  if (tela && tela === atual && simples) {
    ev.preventDefault();
    const ancora = new URL(a.href, location.origin).hash;
    const alvo = ancora && document.querySelector(ancora);
    if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

/* ---------------------------------------------------------------- começo -- */

export async function comecar() {
  // Antes de qualquer `import()`: é esta marca que diz aos módulos de tela
  // para não se autoiniciarem.
  document.body.dataset.casca = "sim";
  document.addEventListener("click", aoClicar);
  window.addEventListener("popstate", (ev) => {
    // Estado nulo é entrada de antes da casca: vale a tela de abertura.
    const tela = telaDoEstado(ev.state) ?? telaInicial(location.pathname, null);
    abrir(tela, { doHistorico: true });
  });

  const inicial = telaInicial(location.pathname, lerMarca(cofre("sessionStorage")));

  // Depois de descobrir a tela, e nunca antes: é o caminho que a revela.
  const limpo = enderecoLimpo(location.pathname, location.hash);
  if (limpo) history.replaceState(history.state, "", limpo);

  if (inicial === "estande") {
    // A tela inicial já veio pronta no HTML da casca.
    atual = inicial;
    const modulo = await moduloDa(inicial);
    await modulo.iniciar();
  } else {
    await abrir(inicial, { doHistorico: true });
  }

  // A primeira entrada também precisa de estado, inclusive quando veio de um
  // link antigo: sem isto o primeiro Voltar traz `null` e abre o Estande em
  // vez da tela em que a pessoa entrou.
  history.replaceState({ tela: atual ?? inicial }, "", location.href);
}

// O roteiro também é importado pelo `chrome.js`, que roda em toda página —
// inclusive nas abertas soltas. A barra só existe na casca, e é ela que diz
// que aqui é lugar de começar.
if (typeof document !== "undefined" && document.getElementById("rotaBarra")) comecar();
