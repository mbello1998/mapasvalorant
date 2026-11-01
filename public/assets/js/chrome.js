// O que toda página do site tem em comum: tema, identidade, trilho de navegação
// e rodapé — todos saindo do conteúdo que o painel edita.

import { CHAVE_MARCA, precisaDesviar, telaDoHref } from "./roteiro.js";

export const $ = (id) => document.getElementById(id);

/** Lê "hero.ctaPrimario.rotulo" dentro do objeto de conteúdo. */
export function caminho(obj, rota) {
  return rota.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function texto(el, valor) {
  if (el && typeof valor === "string" && valor.trim()) el.textContent = valor;
}

/**
 * "2026-10-23" sozinho é lido como meia-noite UTC, o que no horário de Brasília
 * cai no dia 22. Datas sem hora são do calendário, não de um instante: fixamos
 * meio-dia local para o dia escrito ser o dia mostrado.
 */
export function comoData(valor) {
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return new Date(`${valor}T12:00:00`);
  }
  return new Date(valor);
}

/**
 * Textos vindos do cliente da Riot carregam a marcação interna do jogo
 * (<whitebold>…</>). Ela não quer dizer nada fora dele.
 */
export function semMarcacao(valor) {
  return typeof valor === "string"
    ? valor.replace(/<\/?[^<>]*>/g, "").replace(/\s{2,}/g, " ").trim()
    : "";
}

export function elemento(tag, props = {}, filhos = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k === "texto") el.textContent = v;
    else if (k === "estilo") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...[].concat(filhos).filter(Boolean));
  return el;
}

/* ------------------------------------------------------ tema e identidade -- */

/**
 * Fechar um painel tem de parar o que estava tocando dentro dele.
 *
 * `close()` so tira o dialogo da vista: o `<iframe>` do YouTube e o `<video>`
 * da skin continuam no documento, e player no documento e player tocando — a
 * pessoa fecha o painel e o som segue, sem nada na tela para desligar. Quem
 * para de verdade e a saida do documento.
 *
 * Nao estraga nada tirar: o conteudo do painel e remontado do zero a cada
 * abertura, e enquanto ele esta fechado ninguem ve o que sobrou ali dentro.
 *
 * E registrado a cada abertura com `once`, para o ouvinte nao se empilhar.
 */
export function pararMidiaAoFechar(dialogo) {
  if (!dialogo) return;
  dialogo.addEventListener("close", () => {
    for (const midia of dialogo.querySelectorAll("iframe, video, audio")) midia.remove();
  }, { once: true });
}

export function aplicarTema(tema = {}) {
  const mapa = {
    aco: "--aco", acoAlto: "--aco-alto", linha: "--linha",
    luz: "--luz", sinal: "--sinal", latao: "--latao",
  };
  for (const [chave, token] of Object.entries(mapa)) {
    const valor = tema[chave];
    if (typeof valor === "string" && /^#[0-9a-fA-F]{6}$/.test(valor)) {
      document.documentElement.style.setProperty(token, valor);
    }
  }
  // A linha fina e o vermelho de texto acompanham, para o painel não precisar
  // editar seis tokens só para mudar a cor base.
  if (tema.linha) document.documentElement.style.setProperty("--linha-fina", tema.linha);
  if (tema.sinal) document.documentElement.style.setProperty("--sinal-tinta", tema.sinal);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && tema.aco) meta.content = tema.aco;
}

export function aplicarIdentidade(c, { titulo } = {}) {
  const nome = c.site?.nome ?? "Estande";
  document.title = titulo ? `${titulo} — ${nome}` : `${nome} — ${c.site?.tagline ?? ""}`.replace(/ — $/, "");

  const desc = document.querySelector('meta[name="description"]');
  if (desc && c.site?.descricao) desc.content = c.site.descricao;

  const icone = $("favicon");
  if (icone && c.site?.favicon) icone.href = c.site.favicon;

  const marca = $("marca");
  if (marca && c.site?.logoUrl) {
    marca.replaceChildren(elemento("img", {
      class: "marca__logo", src: c.site.logoUrl, alt: nome,
    }));
  } else if (marca) {
    const sigla = marca.querySelector(".marca__sigla");
    const sufixo = marca.querySelector(".marca__sufixo");
    texto(sigla, nome);
    texto(sufixo, c.site?.sufixo);
  }

  for (const el of document.querySelectorAll("[data-campo]")) {
    texto(el, caminho(c, el.dataset.campo));
  }
}

/* --------------------------------------------------------------- trilho --- */

/**
 * Monta o trilho. `aqui` é o arquivo da página atual, para o link dela ficar
 * marcado mesmo sem rolagem — nas páginas que não são a inicial, os âncoras
 * viram links de volta para ela.
 */
export function montarNav(itens = [], aqui = "index.html") {
  const nav = $("nav");
  if (!nav) return;
  nav.replaceChildren();

  const naInicial = aqui === "index.html";

  for (const item of itens) {
    if (!item?.rotulo || !item?.href) continue;
    const ancora = item.href.startsWith("#");
    const a = elemento("a", {
      class: "trilho__link",
      href: ancora && !naInicial ? `index.html${item.href}` : item.href,
      texto: item.rotulo,
    });
    if (!ancora && item.href === aqui) a.setAttribute("aria-current", "true");
    nav.append(a);
  }

  if (naInicial) observarSecoes(nav);
}

/** Marca o link da seção visível. Um observer, não um listener de rolagem. */
function observarSecoes(nav) {
  const alvos = [...nav.querySelectorAll(".trilho__link")]
    .filter((a) => a.getAttribute("href")?.startsWith("#"))
    .map((a) => ({ a, secao: document.querySelector(a.getAttribute("href")) }))
    .filter((p) => p.secao);
  if (!alvos.length) return;

  const obs = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      for (const { a, secao } of alvos) {
        if (secao === e.target) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      }
    }
  }, { rootMargin: "-45% 0px -45% 0px" });

  for (const { secao } of alvos) obs.observe(secao);
}

/* --------------------------------------------------------------- rodapé --- */

export function montarRodape(c) {
  const caixa = $("rodapeLinks");
  if (!caixa) return;
  caixa.replaceChildren();
  for (const l of c.links ?? []) {
    if (!l?.rotulo || !l?.url) continue;
    const externo = /^https?:/.test(l.url);
    caixa.append(elemento("a", {
      href: l.url, texto: l.rotulo, rel: "noopener",
      ...(externo ? { target: "_blank" } : {}),
    }));
  }
}

/* ----------------------------------------------------------- assinatura --- */

/* O monograma e desenhado aqui, nao e imagem: fica nitido em qualquer tela e
   herda a cor do tema pelo currentColor. As duas letras tem a mesma altura e o
   mesmo peso; o canto cortado do M embaixo a esquerda e o do B em cima a
   direita repetem o chanfro do proprio selo, e o risco vermelho fecha na
   diagonal. */
const SELO_MB = `
<svg viewBox="0 0 70 50" aria-hidden="true" focusable="false">
  <path fill="currentColor"
        d="M6 10 H13 L21 20 L29 10 H36 V38 H29 V22.5 L21 33 L13 22.5 V38 H9.5 L6 34.5 Z"/>
  <path fill="currentColor" fill-rule="evenodd"
        d="M42 10 H57 L64 17 V20 L60 24 L64 28 V31 L57 38 H42 Z
           M49 16.5 H55 L57 18.5 V20.5 L55 22 H49 Z
           M49 26 H55 L57 28 V30 L55 31.5 H49 Z"/>
  <path fill="var(--sinal)" d="M11 43 H64 L58 48 H5 Z"/>
</svg>`;

/** Credito de autoria do site. Fixo no codigo: nao e link administravel. */
export function montarAssinatura() {
  const grade = document.querySelector(".rodape__grade");
  if (!grade || grade.querySelector(".assinatura")) return;

  grade.insertAdjacentHTML("beforeend", `
    <a class="assinatura" href="https://www.instagram.com/matheus.b.p"
       target="_blank" rel="noopener"
       aria-label="MB Mbello no Instagram, criação e desenvolvimento do site">
      <span class="assinatura__selo chf">${SELO_MB}</span>
      <span class="assinatura__ficha">
        <span class="assinatura__nome">MB Mbello</span>
        <span class="assinatura__papel">Criação e desenvolvimento</span>
        <span class="assinatura__arroba">@matheus.b.p</span>
      </span>
    </a>`);
}

/* ------------------------------------------------------------- desvio ---- */

/**
 * Quem chegou por um link antigo — `/arsenal.html` — guarda a tela pedida e é
 * mandado para a raiz, que é o único endereço que o site mostra. A página
 * solta continua existindo e funcionando: ela é a rede de quem está sem
 * JavaScript e o que os buscadores leem.
 */
export function desviarParaRaiz() {
  if (!precisaDesviar(location.pathname)) return false;
  try {
    sessionStorage.setItem(CHAVE_MARCA, telaDoHref(location.href, location.origin) ?? "");
  } catch {
    // Navegação restrita bloqueia o cofre: o desvio continua valendo, a casca
    // só vai abrir no Estande em vez da tela pedida.
  }
  location.replace("/");
  return true;
}

// Na importação, e não dentro de `vestirPagina`, que só roda depois de o
// conteúdo chegar do servidor: aqui o desvio acontece antes de a página
// antiga aparecer na tela. Na casca e no Painel não há o que desviar.
if (typeof document !== "undefined") desviarParaRaiz();

/** Tudo que toda página faz igual, numa chamada. */
export function vestirPagina(conteudo, { aqui, titulo } = {}) {
  aplicarTema(conteudo.tema);
  aplicarIdentidade(conteudo, { titulo });
  montarNav(conteudo.nav, aqui);
  montarRodape(conteudo);
  montarAssinatura();
}
