import { carregarConteudo, carregarMapas, carregarAgentes, carregarTatica } from "./api.js";
import { $, elemento, vestirPagina } from "./chrome.js";
import { carregarConta, montarBotaoDeConta } from "./conta.js";
import {
  montarMinimapa, pontosDoMapa, filtrarPontos, filtrarPorLugar,
  agenteDoPonto, habilidadeDoPonto,
} from "./minimapa.js";

/**
 * A Sala de Mapas.
 *
 * O minimapa e os nomes dos lugares vêm da base oficial da Riot; os pixels e as
 * posições vêm do painel (/api/tatica). A página só junta as duas coisas e deixa
 * recortar por agente, habilidade, lado e lugar. Toda a conta de posição e todo
 * o filtro moram em minimapa.js, onde têm teste; aqui fica só a tela.
 */

const CHAVE_MAPA = "estande.mapa.v1";

const estado = {
  conteudo: null,
  mapas: [],
  agentes: [],
  pontos: [],
  mapa: null,
  agente: null,        // uuid
  habilidade: null,    // slot
  lado: null,          // "ataque" | "defesa"
  lugar: null,         // { x, y } do último clique no minimapa
  selecionado: null,   // id do ponto aberto no painel
  avisos: [],          // o que falhou ao carregar mas não impede a página
};

let minimapa = null;

/* ---------------------------------------------------------- persistência -- */

const lerMapaSalvo = () => {
  try { return localStorage.getItem(CHAVE_MAPA); } catch { return null; }
};
const gravarMapa = (uuid) => {
  try { localStorage.setItem(CHAVE_MAPA, uuid); } catch { /* modo privado */ }
};

/* --------------------------------------------------------------- pedaços -- */

function pilula(rotulo, ativo, foco, aoClicar) {
  return elemento("button", {
    type: "button", class: "pilula chf", texto: rotulo, "data-foco": foco,
    "aria-pressed": String(ativo), onclick: aoClicar,
  });
}

const ROTULO_LADO = { ataque: "Ataque", defesa: "Defesa" };

/** Só vira link o que é mesmo do YouTube; o servidor já confere, a página confere de novo. */
function linkDeVideo(valor) {
  try {
    const u = new URL(valor);
    const host = u.hostname.replace(/^www\./, "");
    if (u.protocol === "https:" && (host === "youtube.com" || host === "youtu.be")) return u.href;
  } catch { /* não é URL */ }
  return null;
}

/** Só imagem servida pelo próprio site entra na página. */
const imagemSegura = (src) => typeof src === "string" && src.startsWith("/api/media/");

/* ------------------------------------------------------------ pontos/tela -- */

/** Os pontos do mapa atual depois de todos os filtros. */
function pontosVisiveis() {
  if (!estado.mapa) return [];
  let lista = filtrarPontos(pontosDoMapa(estado.pontos, estado.mapa.uuid), {
    agente: estado.agente, habilidade: estado.habilidade, lado: estado.lado,
  });
  if (estado.lugar) lista = filtrarPorLugar(lista, estado.lugar);
  return lista;
}

function metaDoPonto(p) {
  return [
    agenteDoPonto(p, estado.agentes)?.displayName,
    habilidadeDoPonto(p, estado.agentes)?.displayName,
    ROTULO_LADO[p.lado] ?? p.lado,
    p.tipo === "pixel" ? "Pixel" : "Posição",
  ].filter(Boolean).join(" · ");
}

function pintarPainel(ponto) {
  const caixa = $("painelPonto");
  caixa.replaceChildren();
  if (!ponto) {
    caixa.append(elemento("p", {
      class: "ponto__vazio",
      texto: "Clique num marcador do mapa, ou num item da lista abaixo, para ver o ponto.",
    }));
    return;
  }

  // titulo e texto são texto de quem cadastrou: sempre por textContent.
  caixa.append(
    elemento("h3", { class: "ponto__titulo", texto: ponto.titulo }),
    elemento("p", { class: "ponto__meta", texto: metaDoPonto(ponto) }),
  );

  if (!ponto.conferido) {
    caixa.append(elemento("div", { class: "aviso chf" }, [
      elemento("strong", { texto: "Não testado." }),
      elemento("span", { texto: "Esta entrada ainda não foi testada em jogo. Confira antes de contar com ela." }),
    ]));
  }

  if (ponto.texto) caixa.append(elemento("p", { class: "ponto__texto", texto: ponto.texto }));

  const fotos = (ponto.imagens ?? []).filter(imagemSegura);
  if (fotos.length) {
    // Um .svg aberto como documento próprio roda script na origem do site, e o
    // servidor de mídia aceita image/svg+xml. Dentro de <img> o script não roda,
    // então SVG aparece sem o link para a imagem em nova aba; os demais formatos
    // continuam ampliáveis.
    const ehSvg = (src) => /\.svg$/i.test(src);
    caixa.append(elemento("div", { class: "ponto__fotos" }, fotos.map((src, i) => {
      const img = elemento("img", { src, alt: `Imagem ${i + 1} de ${ponto.titulo}`, loading: "lazy" });
      return ehSvg(src)
        ? img
        : elemento("a", { href: src, target: "_blank", rel: "noopener" }, [img]);
    })));
  }

  const video = ponto.video ? linkDeVideo(ponto.video) : null;
  if (video) {
    caixa.append(elemento("a", {
      class: "ponto__video", href: video, target: "_blank", rel: "noopener noreferrer",
      texto: "Ver o vídeo no YouTube",
    }));
  }
}

function pintarLista(visiveis) {
  const lista = $("listaPontos");
  lista.replaceChildren();
  $("listaConta").textContent = visiveis.length === 1 ? "1 ponto" : `${visiveis.length} pontos`;

  if (!visiveis.length) {
    lista.append(elemento("li", { class: "carregando", texto: mensagemVazia() }));
    return;
  }

  for (const p of visiveis) {
    lista.append(elemento("li", {}, [
      elemento("button", {
        type: "button", class: "lista-pontos__item chf", "data-foco": `lista:${p.id}`,
        "aria-pressed": String(p.id === estado.selecionado),
        onclick: () => {
          escolherPonto(p);
          $("painelPonto").scrollIntoView({ block: "nearest" });
        },
      }, [
        elemento("span", { class: "lista-pontos__titulo", texto: p.titulo }),
        elemento("span", { class: "lista-pontos__meta", texto: metaDoPonto(p) }),
      ]),
    ]));
  }
}

function mensagemVazia() {
  if (!estado.mapa) return "";
  if (!pontosDoMapa(estado.pontos, estado.mapa.uuid).length) return "Nenhum ponto cadastrado neste mapa ainda.";
  if (estado.lugar) return "Nada sai nem cai perto desse lugar com os filtros de agora.";
  if (!estado.agente) return "Nenhuma posição com esses filtros. Escolha um agente para ver pixels.";
  return "Nenhum ponto com esses filtros.";
}

/** As pílulas de habilidade do agente escolhido, só as que têm ponto neste mapa. */
function pintarFiltroHabilidade() {
  const bloco = $("blocoHabilidade");
  const caixa = $("filtroHabilidade");
  const agente = estado.agentes.find((a) => a.uuid === estado.agente);
  if (!agente) { bloco.hidden = true; caixa.replaceChildren(); return; }

  const comPonto = new Set(
    pontosDoMapa(estado.pontos, estado.mapa.uuid)
      .filter((p) => p.agente === agente.uuid && p.habilidade)
      .map((p) => p.habilidade),
  );
  const habilidades = (agente.abilities ?? []).filter((h) => comPonto.has(h.slot));

  bloco.hidden = habilidades.length === 0;
  caixa.replaceChildren(
    pilula("Todas", !estado.habilidade, "habilidade:todas", () => { estado.habilidade = null; renderizar(); }),
    ...habilidades.map((h) =>
      pilula(h.displayName, estado.habilidade === h.slot, `habilidade:${h.slot}`, () => { estado.habilidade = h.slot; renderizar(); })),
  );
}

function pintarFiltroLado() {
  const caixa = $("filtroLado");
  caixa.replaceChildren(
    pilula("Os dois", !estado.lado, "lado:todos", () => { estado.lado = null; renderizar(); }),
    ...Object.entries(ROTULO_LADO).map(([valor, rotulo]) =>
      pilula(rotulo, estado.lado === valor, `lado:${valor}`, () => { estado.lado = valor; renderizar(); })),
  );
}

/** O seletor lista só agentes que têm ponto no mapa: os outros levariam a uma tela vazia. */
function pintarSeletorDeAgente() {
  const sel = $("selAgente");
  const doMapa = pontosDoMapa(estado.pontos, estado.mapa.uuid);
  const uuids = new Set(doMapa.map((p) => p.agente).filter(Boolean));
  const agentes = estado.agentes
    .filter((a) => uuids.has(a.uuid))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));

  if (!agentes.some((a) => a.uuid === estado.agente)) {
    estado.agente = null;
    estado.habilidade = null;
  }

  sel.replaceChildren(
    elemento("option", { value: "", texto: "Nenhum — só posições" }),
    ...agentes.map((a) => elemento("option", { value: a.uuid, texto: a.displayName })),
  );
  sel.value = estado.agente ?? "";
}

/**
 * Redesenha as camadas que dependem dos filtros.
 *
 * Marcadores, lista e pílulas são recriados, e recriar um botão joga o foco
 * para o <body>: quem navega por teclado teria de tabular desde o topo a cada
 * Enter. Por isso guardamos o data-foco de quem tinha o foco e devolvemos ao
 * botão equivalente no fim. Mapa trocado reconstrói o minimapa pelo mesmo
 * caminho (ver escolherMapa).
 */
function comFocoPreservado(desenhar) {
  const chave = document.activeElement?.dataset?.foco;
  desenhar();
  if (!chave) return;
  document.querySelector(`[data-foco="${CSS.escape(chave)}"]`)?.focus();
}

function renderizar() {
  comFocoPreservado(desenhar);
}

function desenhar() {
  const visiveis = pontosVisiveis();

  if (estado.selecionado && !visiveis.some((p) => p.id === estado.selecionado)) {
    estado.selecionado = null;
  }

  pintarFiltroHabilidade();
  pintarFiltroLado();
  $("blocoLugar").hidden = !estado.lugar;

  minimapa?.atualizar(visiveis, { selecionado: estado.selecionado, lugar: estado.lugar });
  pintarLista(visiveis);
  pintarPainel(visiveis.find((p) => p.id === estado.selecionado) ?? null);

  const total = estado.mapa ? pontosDoMapa(estado.pontos, estado.mapa.uuid).length : 0;
  const partes = [...estado.avisos];
  if (total) partes.push(`${visiveis.length} de ${total} ${total === 1 ? "ponto" : "pontos"} neste mapa.`);
  $("dicaMapa").textContent = partes.join(" ");
}

function escolherPonto(ponto) {
  estado.selecionado = ponto.id;
  renderizar();
}

/* -------------------------------------------------------------------- mapa -- */

function pintarBarraDeMapas() {
  const barra = $("barraMapas");
  barra.replaceChildren(...estado.mapas.map((m) =>
    elemento("button", {
      type: "button", class: "sala__mapa-botao chf", "data-foco": `mapa:${m.uuid}`,
      "aria-pressed": String(m.uuid === estado.mapa?.uuid),
      title: m.displayName,
      onclick: () => escolherMapa(m.uuid),
    }, [
      m.listViewIcon ? elemento("img", { class: "sala__miniatura", src: m.listViewIcon, alt: "", loading: "lazy" }) : null,
      elemento("span", { class: "sala__mapa-nome", texto: m.displayName }),
    ])));
}

function escolherMapa(uuid) {
  const mapa = estado.mapas.find((m) => m.uuid === uuid) ?? estado.mapas[0];
  if (!mapa) return;

  // Filtro de um mapa não vale no outro: o lugar clicado é outra coisa, e o
  // agente pode nem ter ponto lá.
  if (estado.mapa && estado.mapa.uuid !== mapa.uuid) {
    estado.lugar = null;
    estado.selecionado = null;
  }
  estado.mapa = mapa;
  gravarMapa(mapa.uuid);

  comFocoPreservado(() => {
    pintarBarraDeMapas();
    pintarSeletorDeAgente();
    minimapa = montarMinimapa($("minimapa"), {
      mapa,
      pontos: [],
      agentes: estado.agentes,
      aoEscolher: escolherPonto,
      aoClicarNoMapa: (lugar) => { estado.lugar = lugar; renderizar(); },
    });
    desenhar();
  });
}

/* ------------------------------------------------------------------ início -- */

function mostrarFalha() {
  $("barraMapas").replaceChildren(elemento("p", {
    class: "carregando", texto: "Não foi possível carregar os mapas.",
  }));
  $("minimapa").replaceChildren(
    elemento("p", { class: "carregando", texto: "Não foi possível carregar os mapas. Confira a conexão e tente de novo." }),
    elemento("button", { type: "button", class: "btn btn--vazio chf", texto: "Tentar de novo", onclick: carregarDados }),
  );
  $("listaPontos").replaceChildren();
  $("listaConta").textContent = "";
  $("dicaMapa").textContent = "";
}

async function carregarDados() {
  $("barraMapas").replaceChildren(elemento("p", { class: "carregando", texto: "Carregando mapas…" }));
  $("minimapa").replaceChildren();

  const [mapas, agentes, pontos] = await Promise.allSettled([
    carregarMapas(), carregarAgentes(), carregarTatica(),
  ]);

  // Mapa que não vem não tem o que mostrar. Já agente e ponto que falham deixam
  // o minimapa de pé, com um recado.
  if (mapas.status !== "fulfilled") {
    console.warn("Mapas indisponíveis:", mapas.reason?.message);
    mostrarFalha();
    return;
  }

  // Os que não têm descrição tática (campo de treino, modos especiais) não são
  // jogáveis em partida.
  estado.mapas = mapas.value
    .filter((m) => m.tacticalDescription)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
  estado.avisos = [];

  if (agentes.status === "fulfilled") estado.agentes = agentes.value;
  else {
    console.warn("Agentes indisponíveis:", agentes.reason?.message);
    estado.agentes = [];
    estado.avisos.push("Não foi possível carregar os agentes; só as posições aparecem.");
  }

  if (pontos.status === "fulfilled") estado.pontos = pontos.value;
  else {
    console.warn("Pontos indisponíveis:", pontos.reason?.message);
    estado.pontos = [];
    estado.avisos.push("Não foi possível carregar os pontos cadastrados.");
  }

  if (!estado.mapas.length) {
    mostrarFalha();
    return;
  }
  escolherMapa(lerMapaSalvo());
}

async function iniciar() {
  const { conteudo } = await carregarConteudo();
  estado.conteudo = conteudo;
  vestirPagina(conteudo, { aqui: "mapas.html", titulo: "Sala de Mapas" });
  carregarConta().then(montarBotaoDeConta);

  $("selAgente").addEventListener("change", (ev) => {
    estado.agente = ev.target.value || null;
    estado.habilidade = null;
    renderizar();
  });
  $("limparLugar").addEventListener("click", () => {
    estado.lugar = null;
    renderizar();
    // O botão some junto com o filtro; o foco vai para o seletor em vez de cair no <body>.
    $("selAgente").focus();
  });

  await carregarDados();
}

iniciar();
