/**
 * Matemática do minimapa: coordenada de mundo do VALORANT para posição na imagem.
 *
 * Este arquivo é importado pelo Node nos testes, então o topo dele não pode
 * tocar em `document` nem em `window`. Funções que desenham no DOM ficam mais
 * abaixo, separadas, e só mexem na página quando são chamadas.
 */

import { elemento } from "./chrome.js";

/**
 * Converte uma posição do mundo em fração (0 a 1) da largura e da altura do
 * minimapa. Os eixos trocam de lugar de propósito: a imagem do minimapa é a
 * vista de cima girada em relação ao mundo, então o `y` do jogo corre na
 * horizontal e o `x` na vertical. Guardamos fração, e não pixel, para a
 * posição valer em qualquer tamanho de tela.
 */
export function paraMinimapa(local, mapa) {
  return {
    x: local.y * mapa.xMultiplier + mapa.xScalarToAdd,
    y: local.x * mapa.yMultiplier + mapa.yScalarToAdd,
  };
}

const dentroDoQuadro = (v) => v >= 0 && v <= 1;

/**
 * Os callouts oficiais de um mapa já na posição do minimapa. Mapa sem callouts
 * (os de modo especial, por exemplo) devolve lista vazia em vez de quebrar a
 * página. O que cai fora do quadro é descartado: a API traz pontos de região
 * que não existem na imagem, e desenhá-los jogaria rótulos para fora do mapa.
 */
export function calloutsDoMapa(mapa) {
  return (mapa.callouts ?? [])
    .map((c) => ({
      nome: c.regionName,
      regiao: c.superRegionName,
      ...paraMinimapa(c.location, mapa),
    }))
    .filter((c) => dentroDoQuadro(c.x) && dentroDoQuadro(c.y));
}

/* ----------------------------------------------------- pontos (funções puras) -- */

/**
 * Só os pontos do mapa pedido. Ponto de um mapa que saiu do catálogo da Riot
 * simplesmente não casa com nenhum uuid e some da página, em vez de aparecer
 * solto em cima de outra imagem.
 */
export function pontosDoMapa(pontos, mapaUuid) {
  return (pontos ?? []).filter((p) => p.mapa === mapaUuid);
}

/**
 * Os filtros de agente, habilidade e lado.
 *
 * Sem agente escolhido só entram as posições: util sem saber de quem é não
 * ensina nada, e uma tela cheia de linhas de todos os agentes ao mesmo tempo
 * seria ilegível. Com agente escolhido entram as utils dele e, junto, as
 * posições que não são de agente nenhum: é justamente quando se estuda um
 * agente que se precisa saber onde ficar no mapa. A habilidade recorta só o que
 * é do agente; a posição genérica fica, porque não é util.
 */
export function filtrarPontos(pontos, { agente = null, habilidade = null, lado = null } = {}) {
  return (pontos ?? []).filter((p) => {
    if (lado && p.lado !== lado) return false;
    if (!agente) return p.tipo === "posicao";
    if (p.tipo === "posicao" && !p.agente) return true;
    if (p.agente !== agente) return false;
    return !habilidade || p.habilidade === habilidade;
  });
}

/**
 * Os pontos cujo `de` OU `para` cai perto do clique. Os dois valem porque a
 * pergunta é "o que acontece neste canto": tanto o que sai dele quanto o que
 * cai nele. O raio é uma fração do minimapa, como todo o resto.
 */
export function filtrarPorLugar(pontos, { x, y }, raio = 0.06) {
  const perto = (c) => c != null && Math.hypot(c.x - x, c.y - y) <= raio;
  return (pontos ?? []).filter((p) => perto(p.de) || perto(p.para));
}

/** O agente da lista da API a que o ponto se refere, ou null. */
export function agenteDoPonto(ponto, agentes) {
  if (!ponto.agente) return null;
  return (agentes ?? []).find((a) => a.uuid === ponto.agente) ?? null;
}

/** A habilidade do ponto (objeto da API, com nome e ícone), ou null. */
export function habilidadeDoPonto(ponto, agentes) {
  if (!ponto.habilidade) return null;
  const agente = agenteDoPonto(ponto, agentes);
  return agente?.abilities?.find((h) => h.slot === ponto.habilidade) ?? null;
}

/**
 * Frase curta que identifica o ponto para quem não vê a tela (leitor de tela e
 * lista em texto). Agente ou habilidade que a API não conhece mais não quebram
 * a frase: ela só fica mais curta.
 */
export function rotuloDoPonto(ponto, agentes) {
  const partes = [
    agenteDoPonto(ponto, agentes)?.displayName,
    habilidadeDoPonto(ponto, agentes)?.displayName,
    ponto.lado === "ataque" ? "ataque" : "defesa",
    ponto.tipo === "pixel" ? "pixel" : "posição",
  ].filter(Boolean);
  return `${ponto.titulo} (${partes.join(", ")})`;
}

/* ------------------------------------------------------------------ desenho -- */
// Daqui para baixo mexe no DOM, mas só quando `montarMinimapa` é chamada.

const NS_SVG = "http://www.w3.org/2000/svg";
const emPorcento = (v) => `${(v * 100).toFixed(3)}%`;

/** O `elemento()` da casa só cria nós HTML; linhas de SVG precisam do namespace. */
function elementoSvg(tag, atributos = {}) {
  const el = document.createElementNS(NS_SVG, tag);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  return el;
}

/**
 * Desenha o minimapa de um mapa com os callouts oficiais e os pontos por cima.
 *
 * `alvo` é o contêiner onde tudo entra. `aoEscolher(ponto)` roda quando alguém
 * clica num marcador; `aoClicarNoMapa({x, y})`, quando clica em qualquer outro
 * lugar do minimapa (a página usa isso para filtrar por lugar).
 *
 * Devolve `{ atualizar(pontos, { selecionado, lugar }) }`. Trocar de filtro só
 * redesenha a camada de pontos: a imagem e os callouts ficam, senão o minimapa
 * piscaria a cada clique e o botão de callouts perderia o estado.
 */
export function montarMinimapa(alvo, { mapa, pontos = [], agentes = [], aoEscolher, aoClicarNoMapa }) {
  alvo.replaceChildren();

  if (!mapa.displayIcon) {
    alvo.append(elemento("p", { class: "carregando", texto: "Este mapa não tem minimapa na base da Riot." }));
    return { atualizar() {} };
  }

  const camadaCallouts = elemento("div", { class: "minimapa__callouts", "aria-hidden": "true" });
  for (const c of calloutsDoMapa(mapa)) {
    camadaCallouts.append(elemento("span", {
      class: "minimapa__callout", texto: c.nome,
      estilo: `left:${emPorcento(c.x)};top:${emPorcento(c.y)}`,
    }));
  }

  // viewBox 0..1 com preserveAspectRatio="none": as coordenadas guardadas já são
  // fração, então a linha acompanha qualquer tamanho sem conta nenhuma. O traço
  // fica com espessura fixa em pixel (non-scaling-stroke no CSS).
  const linhas = elementoSvg("svg", { class: "minimapa__linhas", viewBox: "0 0 1 1", preserveAspectRatio: "none", "aria-hidden": "true" });
  const camadaPontos = elemento("div", { class: "minimapa__pontos" });

  const quadro = elemento("div", { class: "minimapa__quadro" }, [
    elemento("img", { class: "minimapa__imagem", src: mapa.displayIcon, alt: `Minimapa de ${mapa.displayName}`, draggable: "false" }),
    camadaCallouts,
    linhas,
    camadaPontos,
  ]);

  const temCallouts = camadaCallouts.childElementCount > 0;
  const botaoCallouts = elemento("button", {
    type: "button", class: "pilula chf", texto: "Nomes dos lugares",
    "aria-pressed": "true",
    onclick: () => {
      const ligado = camadaCallouts.hidden;
      camadaCallouts.hidden = !ligado;
      botaoCallouts.setAttribute("aria-pressed", String(ligado));
    },
  });
  // Mapa sem callouts (campo nulo na API): o botão não teria o que ligar.
  if (!temCallouts) botaoCallouts.hidden = true;

  alvo.append(quadro, elemento("div", { class: "minimapa__barra" }, [botaoCallouts]));

  quadro.addEventListener("click", (ev) => {
    // Clique num marcador já tem o seu próprio tratamento.
    if (ev.target.closest(".minimapa__ponto")) return;
    const caixa = quadro.getBoundingClientRect();
    if (!caixa.width || !caixa.height) return;
    aoClicarNoMapa?.({
      x: (ev.clientX - caixa.left) / caixa.width,
      y: (ev.clientY - caixa.top) / caixa.height,
    });
  });

  function atualizar(lista, { selecionado = null, lugar = null } = {}) {
    linhas.replaceChildren();
    camadaPontos.replaceChildren();

    for (const p of lista) {
      const pixel = p.tipo === "pixel" && p.para;

      if (pixel) {
        // A linha vai de onde a pessoa fica até onde a util cai. Defesa é
        // tracejada: a cor sozinha não distingue o lado para quem não vê cor.
        linhas.append(elementoSvg("line", {
          class: `minimapa__linha minimapa__linha--${p.lado}`,
          x1: p.de.x, y1: p.de.y, x2: p.para.x, y2: p.para.y,
        }));
        // O ponto de partida é só um alvo visual, sem clique: o marcador
        // clicável de um pixel fica onde a util cai, que é o que se procura.
        camadaPontos.append(elemento("span", {
          class: `minimapa__origem minimapa__origem--${p.lado}`,
          estilo: `left:${emPorcento(p.de.x)};top:${emPorcento(p.de.y)}`,
        }));
      }

      const onde = pixel ? p.para : p.de;
      const habilidade = habilidadeDoPonto(p, agentes);
      const botao = elemento("button", {
        type: "button",
        class: `minimapa__ponto minimapa__ponto--${p.lado} minimapa__ponto--${p.tipo}`,
        "data-foco": `ponto:${p.id}`,
        "aria-label": rotuloDoPonto(p, agentes),
        "aria-pressed": String(p.id === selecionado),
        title: p.titulo,
        estilo: `left:${emPorcento(onde.x)};top:${emPorcento(onde.y)}`,
        onclick: () => aoEscolher?.(p),
      }, [
        habilidade?.displayIcon
          ? elemento("img", { class: "minimapa__icone", src: habilidade.displayIcon, alt: "", loading: "lazy" })
          : null,
      ]);
      camadaPontos.append(botao);
    }

    if (lugar) {
      camadaPontos.append(elemento("span", {
        class: "minimapa__lugar", "aria-hidden": "true",
        estilo: `left:${emPorcento(lugar.x)};top:${emPorcento(lugar.y)}`,
      }));
    }
  }

  atualizar(pontos);
  return { atualizar };
}
