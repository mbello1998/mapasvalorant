import { carregarConteudo, carregarMapas, carregarAgentes, carregarTatica } from "./api.js";
import { $, elemento, vestirPagina } from "./chrome.js";
import { carregarConta, montarBotaoDeConta } from "./conta.js";
import { montarVisor } from "./visor.js";
import {
  montarMinimapa, pontosDoMapa, filtrarPontos, filtrarPorLugar, filtrarPorTrajeto,
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
  // O clique no minimapa filtra por lugar, e o modo diz qual ponta ele marca.
  // "ambos" é o modo de descobrir ("o que acontece neste canto"); "origem" e
  // "destino" são o de procurar um lineup pelas pontas, e podem valer juntos.
  modoLugar: "ambos",  // "ambos" | "origem" | "destino"
  lugar: null,         // { x, y } marcado no modo "ambos"
  origem: null,        // { x, y } de onde se joga
  destino: null,       // { x, y } onde a util cai
  selecionado: null,   // id do ponto aberto no painel
  avisos: [],          // o que falhou ao carregar mas não impede a página
};

let minimapa = null;
// Um visor para a página inteira, montado no início. Recriá-lo a cada clique
// perderia o foco e piscaria a sobreposição.
let visor = null;

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

/**
 * O endereço de crédito do ponto, ou null. O texto do link é o domínio e nada
 * mais: um título escrito à mão deixaria disfarçar o destino ("fonte oficial"
 * apontando para outro lugar), e o domínio sempre diz para onde o clique leva.
 * O servidor já confere o https; a página confere de novo antes de linkar.
 */
function dadosDaFonte(valor) {
  try {
    const u = new URL(valor);
    if (u.protocol === "https:") return { href: u.href, dominio: u.hostname };
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
  if (estado.origem || estado.destino) {
    lista = filtrarPorTrajeto(lista, { origem: estado.origem, destino: estado.destino });
  }
  return lista;
}

/** Algum filtro de lugar está marcado? */
const temLugar = () => Boolean(estado.lugar || estado.origem || estado.destino);

function limparLugares() {
  estado.lugar = null;
  estado.origem = null;
  estado.destino = null;
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
    // Todas abrem no visor, inclusive .svg. Antes o SVG era o caso especial:
    // o servidor de mídia aceita image/svg+xml, e um .svg aberto como
    // documento próprio roda script na origem do site, então ele ficava sem o
    // link que as outras tinham. O visor acaba com a exceção, porque a imagem
    // nunca deixa de estar dentro de um <img>, onde script não roda.
    caixa.append(elemento("div", { class: "ponto__fotos" }, fotos.map((src, i) =>
      elemento("button", {
        type: "button", class: "ponto__foto chf",
        "aria-label": `Ampliar imagem ${i + 1} de ${fotos.length}`,
        onclick: () => visor.abrir(fotos, i, ponto.titulo),
      }, [
        elemento("img", { src, alt: `Imagem ${i + 1} de ${ponto.titulo}`, loading: "lazy" }),
      ]))));
  }

  const video = ponto.video ? linkDeVideo(ponto.video) : null;
  if (video) {
    caixa.append(elemento("a", {
      class: "ponto__video", href: video, target: "_blank", rel: "noopener noreferrer",
      texto: "Ver o vídeo no YouTube",
    }));
  }

  const fonte = ponto.fonte ? dadosDaFonte(ponto.fonte) : null;
  if (fonte) {
    // nofollow: quem cadastrou escolheu o destino, o site não o endossa.
    caixa.append(elemento("p", { class: "ponto__fonte" }, [
      "referência: ",
      elemento("a", {
        href: fonte.href, target: "_blank", rel: "noopener noreferrer nofollow",
        texto: fonte.dominio,
      }),
    ]));
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
    ...habilidades.map((h) => {
      const escolhida = estado.habilidade === h.slot;
      const clicar = () => { estado.habilidade = h.slot; renderizar(); };
      // Sem ícone na API, volta para a pílula de texto: um botão vazio não diz nada.
      if (!h.displayIcon) return pilula(h.displayName, escolhida, `habilidade:${h.slot}`, clicar);
      return elemento("button", {
        type: "button", class: "habilidade-icone chf", "data-foco": `habilidade:${h.slot}`,
        "aria-pressed": String(escolhida), "aria-label": h.displayName, title: h.displayName,
        onclick: clicar,
      }, [elemento("img", { src: h.displayIcon, alt: "", loading: "lazy" })]);
    }),
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

const MODO_LUGAR = {
  ambos: "Em qualquer ponta",
  origem: "De onde sai",
  destino: "Onde cai",
};

/**
 * O clique no minimapa como filtro, nos moldes do Start/End dos sites de
 * lineup: escolhe-se a ponta e clica-se no mapa.
 *
 * Trocar de modo não apaga o que já foi marcado nos outros, de propósito:
 * marcar a saída e depois a chegada é a sequência natural de quem procura um
 * lineup, e limpar a cada troca obrigaria a remarcar.
 */
function pintarFiltroLugar() {
  $("filtroModoLugar").replaceChildren(
    ...Object.entries(MODO_LUGAR).map(([valor, rotulo]) =>
      pilula(rotulo, estado.modoLugar === valor, `modoLugar:${valor}`, () => {
        estado.modoLugar = valor;
        renderizar();
      })),
  );

  const marcados = [
    estado.lugar && "uma ponta qualquer",
    estado.origem && "a saída",
    estado.destino && "a chegada",
  ].filter(Boolean);

  $("dicaLugar").textContent = marcados.length
    ? `Marcado: ${marcados.join(" e ")}. Clique de novo no mapa para mudar.`
    : `Clique no minimapa para filtrar por ${MODO_LUGAR[estado.modoLugar].toLowerCase()}.`;

  $("limparLugar").hidden = !temLugar();
}

/** Só agentes que têm ponto no mapa: os outros levariam a uma tela vazia. */
function agentesDoMapa() {
  const doMapa = pontosDoMapa(estado.pontos, estado.mapa.uuid);
  const uuids = new Set(doMapa.map((p) => p.agente).filter(Boolean));
  return estado.agentes
    .filter((a) => uuids.has(a.uuid))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
}

/** Agente escolhido que não tem ponto no mapa recém-aberto volta para "só posições". */
function ajustarAgenteAoMapa() {
  if (agentesDoMapa().some((a) => a.uuid === estado.agente)) return;
  estado.agente = null;
  estado.habilidade = null;
}

/**
 * A fileira de retratos, como a escolha de agente do jogo. O nome vem escrito
 * embaixo do retrato de propósito: reconhecer o agente pela cara exclui quem
 * não os decora, e esta fileira é a porta de entrada da página. O primeiro
 * botão é o estado inicial (só posições, sem agente).
 */
function pintarFiltroAgente() {
  const escolher = (uuid) => () => {
    estado.agente = uuid;
    estado.habilidade = null;
    renderizar();
  };

  $("filtroAgente").replaceChildren(
    elemento("button", {
      type: "button", class: "retrato chf", "data-foco": "agente:nenhum",
      "aria-pressed": String(!estado.agente), "aria-label": "Só posições, sem agente",
      onclick: escolher(null),
    }, [
      elemento("span", { class: "retrato__arte retrato__arte--vazia", "aria-hidden": "true" }),
      elemento("span", { class: "retrato__nome", texto: "Só posições" }),
    ]),
    ...agentesDoMapa().map((a) =>
      elemento("button", {
        type: "button", class: "retrato chf", "data-foco": `agente:${a.uuid}`,
        "aria-pressed": String(a.uuid === estado.agente), "aria-label": a.displayName,
        onclick: escolher(a.uuid),
      }, [
        a.displayIcon
          ? elemento("img", { class: "retrato__arte", src: a.displayIcon, alt: "", loading: "lazy" })
          : elemento("span", { class: "retrato__arte retrato__arte--vazia", "aria-hidden": "true" }),
        elemento("span", { class: "retrato__nome", texto: a.displayName }),
      ])),
  );
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

  pintarFiltroAgente();
  pintarFiltroHabilidade();
  pintarFiltroLado();
  pintarFiltroLugar();

  minimapa?.atualizar(visiveis, {
    selecionado: estado.selecionado,
    lugar: estado.lugar,
    origem: estado.origem,
    destino: estado.destino,
  });
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
    limparLugares();
    estado.selecionado = null;
  }
  estado.mapa = mapa;
  gravarMapa(mapa.uuid);

  comFocoPreservado(() => {
    pintarBarraDeMapas();
    ajustarAgenteAoMapa();
    minimapa = montarMinimapa($("minimapa"), {
      mapa,
      pontos: [],
      agentes: estado.agentes,
      aoEscolher: escolherPonto,
      // O modo decide em qual ponta o clique cai. Cada modo guarda a sua marca,
      // então dá para marcar a saída e depois a chegada sem perder a primeira.
      aoClicarNoMapa: (lugar) => {
        if (estado.modoLugar === "origem") estado.origem = lugar;
        else if (estado.modoLugar === "destino") estado.destino = lugar;
        else estado.lugar = lugar;
        renderizar();
      },
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
  visor = montarVisor();

  $("limparLugar").addEventListener("click", () => {
    limparLugares();
    renderizar();
    // O botão se esconde junto com o filtro que ele limpou; o foco vai para o
    // modo escolhido, ao lado, em vez de cair no <body>.
    $("filtroModoLugar").querySelector('[aria-pressed="true"]')?.focus();
  });

  await carregarDados();
}

iniciar();
