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
 * Monta o visor uma vez e devolve `{ abrir(fotos, indice, titulo) }`.
 *
 * Um só para a página inteira: recriar a sobreposição a cada clique perderia
 * o foco e piscaria. Ele nasce escondido e só aparece quando `abrir` é
 * chamada.
 */
export function montarVisor() {
  let fotos = [];
  let atual = 0;
  let quemAbriu = null;

  const imagem = elemento("img", { class: "visor__imagem", alt: "" });
  const contador = elemento("p", { class: "visor__contador" });
  const legenda = elemento("p", { class: "visor__legenda" });

  const botao = (classe, rotulo, aoClicar) => elemento("button", {
    type: "button", class: `visor__botao visor__botao--${classe} chf`,
    "aria-label": rotulo, title: rotulo, onclick: aoClicar,
  });

  const anterior = botao("anterior", "Imagem anterior", () => andar(-1));
  const proxima = botao("proxima", "Próxima imagem", () => andar(1));
  const fechar = botao("fechar", "Fechar", () => fecharVisor());

  const palco = elemento("div", {
    class: "visor__palco", role: "dialog", "aria-modal": "true", "aria-label": "Imagens do ponto",
  }, [fechar, anterior, imagem, proxima, contador, legenda]);

  const fundo = elemento("div", { class: "visor", hidden: true }, [palco]);

  // Clique fora fecha; clique no palco não. Sem isto, arrastar para selecionar
  // o texto da legenda fecharia o visor ao soltar o botão.
  fundo.addEventListener("click", (ev) => {
    if (!palco.contains(ev.target)) fecharVisor();
  });

  // As setas navegam e Esc fecha enquanto o visor está aberto. O ouvinte fica
  // no documento porque o foco pode estar em qualquer um dos botões, e é
  // soltado no `desmontar()` lá embaixo.

  function pintar() {
    const total = fotos.length;
    imagem.src = fotos[atual] ?? "";
    imagem.alt = `Imagem ${atual + 1} de ${total}${legenda.textContent ? `: ${legenda.textContent}` : ""}`;
    contador.textContent = total > 1 ? `${atual + 1} / ${total}` : "";
    // Uma imagem só não tem para onde ir: os botões sumiriam sem dizer nada,
    // então é melhor não existirem.
    anterior.hidden = total < 2;
    proxima.hidden = total < 2;
  }

  function andar(passo) {
    atual = proximoIndice(atual, fotos.length, passo);
    pintar();
  }

  function fecharVisor() {
    fundo.hidden = true;
    document.body.classList.remove("sem-rolagem");
    // Devolve o foco a quem abriu: sem isto ele cai no <body> e quem navega
    // por teclado recomeça do topo da página.
    quemAbriu?.focus();
    quemAbriu = null;
  }

  function abrir(lista, indice = 0, titulo = "") {
    fotos = Array.isArray(lista) ? lista.filter(Boolean) : [];
    if (!fotos.length) return;
    atual = proximoIndice(0, fotos.length, indice);
    quemAbriu = document.activeElement;
    legenda.textContent = titulo ?? "";
    pintar();
    fundo.hidden = false;
    document.body.classList.add("sem-rolagem");
    fechar.focus();
  }

  const naTecla = (ev) => {
    if (fundo.hidden) return;
    if (ev.key === "Escape") { ev.preventDefault(); fecharVisor(); }
    else if (ev.key === "ArrowLeft") { ev.preventDefault(); andar(-1); }
    else if (ev.key === "ArrowRight") { ev.preventDefault(); andar(1); }
  };
  document.addEventListener("keydown", naTecla);

  /**
   * Tirar o visor de cena. Fechar antes de sair é o que importa: o aberto
   * trava a rolagem do site inteiro com a classe `sem-rolagem`, e ela ficaria
   * presa na tela seguinte.
   */
  function desmontar() {
    fecharVisor();
    document.removeEventListener("keydown", naTecla);
    fundo.remove();
  }

  document.body.append(fundo);
  return { abrir, desmontar };
}
