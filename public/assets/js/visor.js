/**
 * Visor de imagens em sobreposição.
 *
 * Um lineup se ensina em passos — onde ficar, onde mirar, onde cai — e os
 * passos só fazem sentido vistos em sequência. Antes, clicar numa imagem
 * abria o arquivo numa aba nova: a pessoa perdia a página, via um passo
 * solto e voltava. Aqui as imagens ficam na própria página, com o contador
 * dizendo em qual passo você está.
 *
 * O topo deste arquivo não toca em `document`: a conta de índice é pura e
 * tem teste, e o resto só mexe na página quando `montarVisor` é chamada.
 */

import { elemento } from "./chrome.js";

/**
 * O índice depois de andar `passo` posições, dando a volta nas pontas.
 *
 * Dá a volta de propósito: com três imagens, quem está na terceira e aperta
 * "próxima" quer a primeira, não um botão morto. O resto (`%`) de um número
 * negativo é negativo em JavaScript, então soma-se `total` antes.
 */
export function proximoIndice(atual, total, passo) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return (((atual + passo) % total) + total) % total;
}

/**
 * Os ícones dos botões, em SVG.
 *
 * Antes eram bordas giradas num `::before`: uma seta é um canto de caixa, o X
 * são duas hastes. O truque quebra junto com a superfície chanfrada, que usa
 * o mesmo `::before` para o próprio preenchimento — as duas regras disputavam
 * o pseudo-elemento e sobrava um risco solto no canto do botão. Desenhar a
 * forma é mais claro do que torcer bordas, e não disputa nada.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

function traco(tag, atributos) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  return el;
}

function icone(nome) {
  const svg = traco("svg", {
    viewBox: "0 0 24 24", width: "20", height: "20", "aria-hidden": "true",
    fill: "none", stroke: "currentColor", "stroke-width": "2",
    "stroke-linecap": "round", "stroke-linejoin": "round",
  });

  if (nome === "anterior") svg.append(traco("polyline", { points: "15 5 8 12 15 19" }));
  else if (nome === "proxima") svg.append(traco("polyline", { points: "9 5 16 12 9 19" }));
  else if (nome === "fechar") {
    svg.append(
      traco("line", { x1: "6", y1: "6", x2: "18", y2: "18" }),
      traco("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
    );
  } else if (nome === "lupa") {
    svg.append(
      traco("circle", { cx: "10", cy: "10", r: "6" }),
      traco("line", { x1: "14.5", y1: "14.5", x2: "20", y2: "20" }),
    );
  }
  return svg;
}

/**
 * O deslocamento do arraste preso dentro da imagem ampliada.
 *
 * Ampliada em `escala`, a imagem passa a ser `escala` vezes a moldura, e
 * sobra metade do excesso para cada lado: é o quanto se pode arrastar antes
 * de a borda da arte entrar em cena e deixar uma faixa vazia do outro lado.
 * Em 1x não sobra nada, e arrastar não faz sentido.
 */
export function limitarArraste(valor, medida, escala) {
  if (!Number.isFinite(valor)) return 0;
  if (!Number.isFinite(medida) || medida <= 0) return 0;
  if (!Number.isFinite(escala) || escala <= 1) return 0;
  const folga = (medida * (escala - 1)) / 2;
  return Math.max(-folga, Math.min(folga, valor));
}

/**
 * Monta o visor uma vez e devolve `{ abrir(fotos, indice, titulo) }`.
 *
 * `titulo` é um texto, válido para a sequência toda — os passos de um lineup
 * são do mesmo ponto —, ou uma lista com uma legenda por imagem, que é o caso
 * dos cartões: cada um tem nome e nível próprios.
 *
 * Um só para a página inteira: recriar a sobreposição a cada clique perderia
 * o foco e piscaria. Ele nasce fechado e só aparece quando `abrir` é chamada.
 *
 * É um `<dialog>` aberto com `showModal`, e não uma `<div>` posicionada, por
 * causa da camada de cima do navegador: o painel do jogador também é um
 * diálogo modal, e uma div com `z-index` fica atrás dele por mais alto que o
 * número seja. Diálogos modais, não — eles empilham na ordem em que abrem.
 */
export function montarVisor() {
  let fotos = [];
  let legendas = null;
  let atual = 0;
  let quemAbriu = null;

  const imagem = elemento("img", { class: "visor__imagem", alt: "" });
  const contador = elemento("p", { class: "visor__contador" });
  const legenda = elemento("p", { class: "visor__legenda" });

  const botao = (classe, rotulo, aoClicar) => elemento("button", {
    type: "button", class: `visor__botao visor__botao--${classe}`,
    "aria-label": rotulo, title: rotulo, onclick: aoClicar,
  }, [icone(classe)]);

  const anterior = botao("anterior", "Imagem anterior", () => andar(-1));
  const proxima = botao("proxima", "Próxima imagem", () => andar(1));
  const fechar = botao("fechar", "Fechar", () => fecharVisor());
  const lupa = botao("lupa", "Ampliar", () => alternarZoom());

  const palco = elemento("div", { class: "visor__palco" },
    [fechar, lupa, anterior, imagem, proxima, contador, legenda]);

  const fundo = elemento("dialog", { class: "visor", "aria-label": "Imagem ampliada" }, [palco]);

  // Clique fora fecha; clique no palco não. Sem isto, arrastar para selecionar
  // o texto da legenda fecharia o visor ao soltar o botão.
  fundo.addEventListener("click", (ev) => {
    if (!palco.contains(ev.target)) fecharVisor();
  });

  // Esc é fechado pelo próprio diálogo, sem passar por este arquivo: então a
  // limpeza fica no evento `close`, que vale para os dois caminhos.
  fundo.addEventListener("close", () => {
    redefinirZoom();
    // Devolve o foco a quem abriu: sem isto ele cai no <body> e quem navega
    // por teclado recomeça do topo da página.
    quemAbriu?.focus();
    quemAbriu = null;
  });

  // As setas navegam e Esc fecha enquanto o visor está aberto. O ouvinte fica
  // no documento porque o foco pode estar em qualquer um dos botões, e é
  // soltado no `desmontar()` lá embaixo.

  /* --------------------------------------------------------------- zoom --- */
  /* Dois níveis só: a arte de um cartão tem pouco mais de mil pixels de
     largura, e 2,5x já mostra tudo o que o arquivo tem. Uma escala contínua
     pediria roda do mouse, pinça e um jeito de voltar ao tamanho normal para
     pouca coisa a mais. */
  const ESCALA = 2.5;
  let escala = 1;
  let x = 0;
  let y = 0;

  function aplicarZoom() {
    imagem.style.transform = escala > 1 ? `translate(${x}px, ${y}px) scale(${escala})` : "";
    imagem.classList.toggle("visor__imagem--zoom", escala > 1);
    const rotulo = escala > 1 ? "Reduzir" : "Ampliar";
    lupa.setAttribute("aria-pressed", String(escala > 1));
    lupa.setAttribute("aria-label", rotulo);
    lupa.title = rotulo;
  }

  function redefinirZoom() {
    escala = 1; x = 0; y = 0;
    aplicarZoom();
  }

  /**
   * Alterna entre tamanho normal e ampliado. Recebendo um ponto, amplia em
   * volta dele: quem clica num canto da arte quer ver aquele canto, não o
   * meio dela.
   */
  function alternarZoom(ponto = null) {
    if (escala > 1) { redefinirZoom(); return; }
    escala = ESCALA;
    const quadro = imagem.getBoundingClientRect();
    const dx = ponto ? ponto.clientX - (quadro.left + imagem.clientWidth / 2) : 0;
    const dy = ponto ? ponto.clientY - (quadro.top + imagem.clientHeight / 2) : 0;
    x = limitarArraste(-dx * (escala - 1), imagem.clientWidth, escala);
    y = limitarArraste(-dy * (escala - 1), imagem.clientHeight, escala);
    aplicarZoom();
  }

  /* Arrastar move a imagem ampliada. Um apontador que andou uns poucos pixels
     ainda é um clique, e clique alterna o zoom. */
  let partida = null;

  imagem.addEventListener("pointerdown", (ev) => {
    partida = { clientX: ev.clientX, clientY: ev.clientY, x, y, andou: false };
    if (escala > 1) imagem.setPointerCapture(ev.pointerId);
  });

  imagem.addEventListener("pointermove", (ev) => {
    if (!partida || escala === 1) return;
    const dx = ev.clientX - partida.clientX;
    const dy = ev.clientY - partida.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 4) partida.andou = true;
    x = limitarArraste(partida.x + dx, imagem.clientWidth, escala);
    y = limitarArraste(partida.y + dy, imagem.clientHeight, escala);
    aplicarZoom();
  });

  imagem.addEventListener("pointerup", (ev) => {
    const arrastou = partida?.andou;
    partida = null;
    if (imagem.hasPointerCapture?.(ev.pointerId)) imagem.releasePointerCapture(ev.pointerId);
    if (!arrastou) alternarZoom(ev);
  });

  imagem.addEventListener("pointercancel", () => { partida = null; });
  // A imagem é arrastável por padrão, e o arraste nativo do navegador
  // atropelaria o nosso no meio do caminho.
  imagem.draggable = false;

  function pintar() {
    const total = fotos.length;
    imagem.src = fotos[atual] ?? "";
    if (legendas) legenda.textContent = legendas[atual] ?? "";
    imagem.alt = `Imagem ${atual + 1} de ${total}${legenda.textContent ? `: ${legenda.textContent}` : ""}`;
    contador.textContent = total > 1 ? `${atual + 1} / ${total}` : "";
    // Uma imagem só não tem para onde ir: os botões sumiriam sem dizer nada,
    // então é melhor não existirem.
    anterior.hidden = total < 2;
    proxima.hidden = total < 2;
  }

  function andar(passo) {
    atual = proximoIndice(atual, fotos.length, passo);
    // A imagem seguinte começa inteira: seguir ampliado no mesmo canto
    // mostraria um pedaço do nada de uma arte que a pessoa ainda não viu.
    redefinirZoom();
    pintar();
  }

  function fecharVisor() {
    if (fundo.open) fundo.close();
  }

  function abrir(lista, indice = 0, titulo = "") {
    fotos = Array.isArray(lista) ? lista.filter(Boolean) : [];
    if (!fotos.length) return;
    // A troca de tela varre o corpo do documento e leva o diálogo junto. O nó
    // guardado continua bom: basta pendurar de novo.
    if (!fundo.isConnected) document.body.append(fundo);
    atual = proximoIndice(0, fotos.length, indice);
    quemAbriu = document.activeElement;
    legendas = Array.isArray(titulo) ? titulo : null;
    legenda.textContent = legendas ? "" : (titulo ?? "");
    redefinirZoom();
    pintar();
    if (!fundo.open) fundo.showModal();
    fechar.focus();
  }

  const naTecla = (ev) => {
    if (!fundo.open) return;
    // Esc é do diálogo. Aqui ficam só as setas, que o navegador não conhece.
    if (ev.key === "ArrowLeft") { ev.preventDefault(); andar(-1); }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); andar(1); }
  };
  document.addEventListener("keydown", naTecla);

  /**
   * Tirar o visor de cena. Fechar antes de sair é o que importa: um diálogo
   * modal deixa o resto da página inerte, e ela ficaria assim na tela
   * seguinte.
   */
  function desmontar() {
    fecharVisor();
    document.removeEventListener("keydown", naTecla);
    fundo.remove();
  }

  document.body.append(fundo);
  return { abrir, desmontar };
}
