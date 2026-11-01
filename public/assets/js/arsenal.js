import { carregarConteudo, carregarArsenal } from "./api.js";
import { $, elemento, vestirPagina, pararMidiaAoFechar } from "./chrome.js";
import { carregarConta, montarBotaoDeConta } from "./conta.js";

// O Arsenal: catálogo completo de skins e um montador de loadout que soma o
// preço. A fonte de verdade do preço é o painel — a API da Riot não expõe
// valor, então o que existe aqui é a tabela por raridade, editável.

const CHAVE_LOADOUT = "estande.loadout.v1";
const POR_PAGINA = 60;

const estadoLimpo = () => ({
  conteudo: null,
  arsenal: null,
  loadout: {},          // uuid da arma -> uuid da skin
  filtroArma: null,
  filtroRaridade: null,
  busca: "",
  ordem: "nome",
  mostrando: POR_PAGINA,
});

const estado = estadoLimpo();

const porUuid = { armas: new Map(), raridades: new Map(), temas: new Map(), skins: new Map() };

/* ---------------------------------------------------------- persistência -- */

function lerLoadout() {
  try {
    const bruto = localStorage.getItem(CHAVE_LOADOUT);
    return bruto ? JSON.parse(bruto) : {};
  } catch { return {}; }
}

function gravarLoadout() {
  try { localStorage.setItem(CHAVE_LOADOUT, JSON.stringify(estado.loadout)); } catch { /* modo privado */ }
}

/* ---------------------------------------------------------------- preço --- */

/**
 * Preço de tabela por raridade, em VP. Skin sem raridade é de passe de
 * batalha, evento ou recompensa: não tem preço avulso e devolve null.
 */
function precoDe(skin) {
  if (!skin.raridade) return null;
  const tier = porUuid.raridades.get(skin.raridade);
  if (!tier) return null;
  const tabela = estado.conteudo?.arsenal?.precos ?? {};
  const vp = Number(tabela[tier.devName]);
  if (!Number.isFinite(vp) || vp <= 0) return null;

  // Faca não segue a tabela da arma: na loja ela sai pelo dobro da mesma
  // raridade. Premium 1775 vira 3550, Ultra 2475 vira 4950.
  if (ehCorpoACorpo(skin)) {
    const mult = Number(estado.conteudo?.arsenal?.multiplicadorCorpoACorpo);
    return Math.round(vp * (Number.isFinite(mult) && mult > 0 ? mult : 2));
  }
  return vp;
}

function ehCorpoACorpo(skin) {
  return porUuid.armas.get(skin.arma)?.categoria === "Corpo a corpo";
}

function emReais(vp) {
  const taxa = Number(estado.conteudo?.arsenal?.vpPorReal);
  if (!Number.isFinite(taxa) || taxa <= 0) return null;
  const moeda = estado.conteudo?.arsenal?.moeda ?? "R$";
  return `${moeda} ${(vp / taxa).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const formatarVp = (n) => n.toLocaleString("pt-BR");

/* ------------------------------------------------------------- catálogo --- */

/** A arma padrão de cada slot: a "skin" sem arte própria que todo mundo tem. */
function ehPadrao(skin) {
  const arma = porUuid.armas.get(skin.arma);
  return arma?.padraoUuid === skin.uuid;
}

function skinsFiltradas() {
  const busca = estado.busca.trim().toLowerCase();
  let lista = estado.arsenal.skins.filter((s) => !ehPadrao(s));

  if (estado.filtroArma) lista = lista.filter((s) => s.arma === estado.filtroArma);
  if (estado.filtroRaridade) {
    lista = estado.filtroRaridade === "sem"
      ? lista.filter((s) => !s.raridade)
      : lista.filter((s) => s.raridade === estado.filtroRaridade);
  }
  if (busca) {
    lista = lista.filter((s) => {
      const tema = s.tema ? porUuid.temas.get(s.tema)?.nome ?? "" : "";
      return s.nome.toLowerCase().includes(busca) || tema.toLowerCase().includes(busca);
    });
  }

  const ordenar = {
    nome: (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
    caro: (a, b) => (precoDe(b) ?? -1) - (precoDe(a) ?? -1) || a.nome.localeCompare(b.nome, "pt-BR"),
    barato: (a, b) => (precoDe(a) ?? 1e9) - (precoDe(b) ?? 1e9) || a.nome.localeCompare(b.nome, "pt-BR"),
    niveis: (a, b) => b.niveis.length - a.niveis.length || a.nome.localeCompare(b.nome, "pt-BR"),
  };
  return [...lista].sort(ordenar[estado.ordem] ?? ordenar.nome);
}

function cartaoSkin(skin) {
  const tier = skin.raridade ? porUuid.raridades.get(skin.raridade) : null;
  const vp = precoDe(skin);
  const arma = porUuid.armas.get(skin.arma);
  const equipada = estado.loadout[skin.arma] === skin.uuid;

  const botao = elemento("button", {
    type: "button",
    class: `skin chf${equipada ? " skin--equipada" : ""}`,
    "aria-label": `${skin.nome}. ${tier?.nome ?? "Sem raridade"}. Ver detalhes.`,
    onclick: () => abrirSkin(skin),
  });
  // A faixa de raridade usa a cor oficial do tier, sempre acompanhada do nome
  // escrito: cor sozinha não identifica nada para quem não enxerga a diferença.
  if (tier) botao.style.setProperty("--tier", tier.cor);

  botao.append(
    elemento("div", { class: "skin__faixa" }),
    elemento("div", { class: "skin__arte" }, [
      skin.icone
        ? elemento("img", { src: skin.icone, alt: "", loading: "lazy" })
        : elemento("span", { class: "skin__sem-arte", texto: "sem arte" }),
    ]),
    elemento("div", { class: "skin__corpo" }, [
      elemento("div", { class: "skin__nome", texto: skin.nome }),
      elemento("div", { class: "skin__meta" }, [
        elemento("span", { texto: arma?.nome ?? "—" }),
        elemento("span", { class: "skin__tier", texto: tier?.nome ?? "Passe ou evento" }),
      ]),
      elemento("div", { class: "skin__preco" }, [
        vp === null
          ? elemento("span", { class: "skin__sem-preco", texto: "Não vendida por VP" })
          : elemento("span", { class: "skin__vp", texto: `${formatarVp(vp)} VP` }),
        skin.niveis.length > 1
          ? elemento("span", { class: "skin__niveis", texto: `${skin.niveis.length} níveis` })
          : null,
        skin.cromas.length > 1
          ? elemento("span", { class: "skin__niveis", texto: `${skin.cromas.length} cromas` })
          : null,
      ]),
    ]),
  );
  return botao;
}

function pintarCatalogo() {
  const grade = $("skins");
  const lista = skinsFiltradas();
  const visiveis = lista.slice(0, estado.mostrando);

  grade.replaceChildren();
  if (!lista.length) {
    grade.append(elemento("p", { class: "carregando", texto: "Nenhuma skin bate com esses filtros." }));
  }
  for (const s of visiveis) grade.append(cartaoSkin(s));

  $("catConta").textContent = `${formatarVp(lista.length)} ${lista.length === 1 ? "skin" : "skins"}`;
  const botao = $("btnMais");
  botao.hidden = visiveis.length >= lista.length;
  botao.textContent = `Mostrar mais ${Math.min(POR_PAGINA, lista.length - visiveis.length)}`;
}

/* --------------------------------------------------------------- gaveta --- */

function abrirSkin(skin) {
  const gaveta = $("gaveta");
  const caixa = $("gavetaCaixa");
  const tier = skin.raridade ? porUuid.raridades.get(skin.raridade) : null;
  const arma = porUuid.armas.get(skin.arma);
  const tema = skin.tema ? porUuid.temas.get(skin.tema) : null;
  const vp = precoDe(skin);

  caixa.replaceChildren();
  if (tier) caixa.style.setProperty("--tier", tier.cor);

  // Arte grande: o croma escolhido manda, senão o ícone da skin.
  const arte = elemento("img", {
    class: "detalhe__arte",
    src: skin.cromas[0]?.arte || skin.icone || "",
    alt: skin.nome,
  });

  const videoCaixa = elemento("div", { class: "detalhe__video", hidden: true });

  const cromas = elemento("div", { class: "detalhe__cromas" });
  if (skin.cromas.length > 1) {
    skin.cromas.forEach((c, i) => {
      if (!c.amostra && !c.arte) return;
      const b = elemento("button", {
        type: "button", class: "croma", title: c.nome, "aria-label": c.nome,
        "aria-pressed": String(i === 0),
        onclick: () => {
          if (c.arte) arte.src = c.arte;
          for (const outro of cromas.children) outro.setAttribute("aria-pressed", String(outro === b));
        },
      }, [c.amostra ? elemento("img", { src: c.amostra, alt: "", loading: "lazy" }) : elemento("span", { texto: String(i + 1) })]);
      cromas.append(b);
    });
  }

  const niveis = elemento("div", { class: "detalhe__niveis" });
  skin.niveis.forEach((n, i) => {
    const rotulos = {
      SoundEffects: "Som próprio", Animation: "Animação", Finisher: "Finalização",
      VFX: "Efeitos visuais", Voiceover: "Narração",
    };
    niveis.append(elemento("div", { class: "nivel" }, [
      elemento("span", { class: "nivel__num", texto: String(i + 1) }),
      elemento("div", {}, [
        elemento("div", { class: "nivel__nome", texto: n.nome }),
        elemento("div", { class: "nivel__tipo", texto: n.tipo ? (rotulos[n.tipo] ?? n.tipo) : "Arte da skin" }),
      ]),
      n.video
        ? elemento("button", {
            type: "button", class: "btn btn--mini chf", texto: "Ver vídeo",
            onclick: () => {
              videoCaixa.hidden = false;
              videoCaixa.replaceChildren(elemento("video", {
                src: n.video, controls: true, preload: "none", playsinline: true,
              }));
              videoCaixa.scrollIntoView({ block: "nearest" });
            },
          })
        : null,
    ]));
  });

  const equipada = estado.loadout[skin.arma] === skin.uuid;
  const acao = elemento("button", {
    type: "button",
    class: `btn ${equipada ? "btn--vazio" : "btn--forte"} chf`,
    texto: equipada ? "Tirar do loadout" : `Equipar na ${arma?.nome ?? "arma"}`,
    onclick: () => {
      if (estado.loadout[skin.arma] === skin.uuid) delete estado.loadout[skin.arma];
      else estado.loadout[skin.arma] = skin.uuid;
      gravarLoadout();
      pintarRack();
      pintarCatalogo();
      gaveta.close();
    },
  });

  // O que rola fica dentro do .gaveta__rolo: a caixa chanfrada nao rola, e por
  // isso o botao Fechar continua preso no canto do painel.
  caixa.append(
    elemento("button", {
      type: "button", class: "btn btn--vazio chf gaveta__fechar", texto: "Fechar",
      onclick: () => gaveta.close(),
    }),
    elemento("div", { class: "gaveta__rolo" }, [
      elemento("div", { class: "detalhe__topo" }, [
        elemento("div", { class: "detalhe__moldura" }, [arte]),
        elemento("div", { class: "detalhe__info" }, [
          elemento("h3", { id: "gavetaNome", texto: skin.nome }),
          elemento("p", { class: "detalhe__meta", texto: [arma?.nome, tema?.nome].filter(Boolean).join(" · ") }),
          elemento("p", { class: "detalhe__tier", texto: tier?.nome ?? "Passe de batalha, evento ou recompensa" }),
          vp === null
            ? elemento("p", { class: "detalhe__preco detalhe__preco--sem", texto: "Não é vendida avulsa por VP" })
            : elemento("p", { class: "detalhe__preco" }, [
                elemento("strong", { texto: `${formatarVp(vp)} VP` }),
                elemento("span", { texto: emReais(vp) ? ` · ${emReais(vp)} aproximados` : "" }),
                ehCorpoACorpo(skin)
                  ? elemento("span", { class: "detalhe__preco--sem", texto: " — faca sai pelo dobro da arma da mesma raridade" })
                  : null,
              ]),
          acao,
        ]),
      ]),
      cromas.children.length ? elemento("h4", { class: "detalhe__sub", texto: "Cromas" }) : null,
      cromas.children.length ? cromas : null,
      elemento("h4", { class: "detalhe__sub", texto: "Níveis" }),
      niveis,
      videoCaixa,
    ]),
  );
  gaveta.showModal();
  // Fechar o painel para o video da skin: ver em chrome.js por que.
  pararMidiaAoFechar(gaveta);
}

/* -------------------------------------------------------------- loadout --- */

// A ordem da loja do jogo, para o rack não sair alfabético nem aleatório.
const ORDEM_CATEGORIAS = [
  "Armas Leves", "Submetralhadoras", "Escopetas", "Fuzis de Assalto",
  "Fuzis", "Fuzis de Precisão", "Armas Pesadas", "Corpo a corpo",
];

function pintarRack() {
  const rack = $("rack");
  rack.replaceChildren();

  const grupos = new Map();
  for (const arma of estado.arsenal.armas) {
    const cat = arma.categoria || "Outras";
    if (!grupos.has(cat)) grupos.set(cat, []);
    grupos.get(cat).push(arma);
  }

  const ordenadas = [...grupos.entries()].sort(
    (a, b) => {
      const ia = ORDEM_CATEGORIAS.indexOf(a[0]);
      const ib = ORDEM_CATEGORIAS.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    },
  );

  for (const [categoria, armas] of ordenadas) {
    const faixa = elemento("div", { class: "rack__grupo" }, [
      elemento("h3", { class: "rack__cat", texto: categoria }),
    ]);
    const linha = elemento("div", { class: "rack__linha" });

    for (const arma of armas) {
      const escolhida = estado.loadout[arma.uuid]
        ? porUuid.skins.get(estado.loadout[arma.uuid])
        : null;
      const tier = escolhida?.raridade ? porUuid.raridades.get(escolhida.raridade) : null;
      const vp = escolhida ? precoDe(escolhida) : null;

      const slot = elemento("button", {
        type: "button",
        class: `slot chf${escolhida ? " slot--cheio" : ""}`,
        onclick: () => {
          estado.filtroArma = arma.uuid;
          estado.mostrando = POR_PAGINA;
          pintarFiltroArma();
          pintarCatalogo();
          $("catalogo").scrollIntoView({ behavior: "smooth", block: "start" });
        },
      });
      if (tier) slot.style.setProperty("--tier", tier.cor);

      slot.append(
        elemento("div", { class: "slot__arma", texto: arma.nome }),
        elemento("div", { class: "slot__arte" }, [
          (escolhida?.icone || arma.icone)
            ? elemento("img", { src: escolhida?.icone || arma.icone, alt: "", loading: "lazy" })
            : null,
        ]),
        elemento("div", { class: "slot__skin", texto: escolhida ? escolhida.nome : "Padrão" }),
        elemento("div", { class: "slot__vp", texto: vp === null ? (escolhida ? "sem preço" : "grátis") : `${formatarVp(vp)} VP` }),
      );
      linha.append(slot);
    }
    faixa.append(linha);
    rack.append(faixa);
  }

  pintarConta();
}

function pintarConta() {
  const escolhidas = Object.values(estado.loadout)
    .map((u) => porUuid.skins.get(u))
    .filter(Boolean);

  const comPreco = escolhidas.filter((s) => precoDe(s) !== null);
  const total = comPreco.reduce((soma, s) => soma + precoDe(s), 0);
  const semPreco = escolhidas.length - comPreco.length;

  $("contaVp").textContent = formatarVp(total);
  $("contaReal").textContent = total ? `≈ ${emReais(total) ?? "—"}` : "nada escolhido ainda";

  const linhas = $("contaLinhas");
  linhas.replaceChildren();

  // Quebra por raridade: mostra para onde foi o dinheiro.
  const porTier = new Map();
  for (const s of comPreco) {
    const tier = porUuid.raridades.get(s.raridade);
    const atual = porTier.get(tier.uuid) ?? { tier, n: 0, vp: 0 };
    atual.n++; atual.vp += precoDe(s);
    porTier.set(tier.uuid, atual);
  }
  for (const { tier, n, vp } of [...porTier.values()].sort((a, b) => b.vp - a.vp)) {
    const linha = elemento("div", { class: "conta__linha" }, [
      elemento("span", { class: "conta__marca" }),
      elemento("span", { class: "conta__nome", texto: `${tier.nome} · ${n}` }),
      elemento("span", { class: "conta__valor", texto: `${formatarVp(vp)} VP` }),
    ]);
    linha.style.setProperty("--tier", tier.cor);
    linhas.append(linha);
  }
  if (semPreco) {
    linhas.append(elemento("div", { class: "conta__linha conta__linha--nota" }, [
      elemento("span", { class: "conta__nome", texto: `${semPreco} de passe ou evento, fora da conta` }),
    ]));
  }
}

/* -------------------------------------------------------------- filtros --- */

function pilula(rotulo, ativo, aoClicar, cor) {
  const b = elemento("button", {
    type: "button", class: "pilula chf", texto: rotulo,
    "aria-pressed": String(ativo), onclick: aoClicar,
  });
  if (cor) b.style.setProperty("--tier", cor);
  return b;
}

function pintarFiltroArma() {
  const caixa = $("filtroArma");
  caixa.replaceChildren();
  caixa.append(pilula("Todas as armas", estado.filtroArma === null, () => {
    estado.filtroArma = null; estado.mostrando = POR_PAGINA; pintarFiltroArma(); pintarCatalogo();
  }));
  for (const arma of estado.arsenal.armas) {
    caixa.append(pilula(arma.nome, estado.filtroArma === arma.uuid, () => {
      estado.filtroArma = arma.uuid; estado.mostrando = POR_PAGINA; pintarFiltroArma(); pintarCatalogo();
    }));
  }
}

function pintarFiltroRaridade() {
  const caixa = $("filtroRaridade");
  caixa.replaceChildren();
  caixa.append(pilula("Toda raridade", estado.filtroRaridade === null, () => {
    estado.filtroRaridade = null; estado.mostrando = POR_PAGINA; pintarFiltroRaridade(); pintarCatalogo();
  }));
  for (const t of estado.arsenal.raridades) {
    caixa.append(pilula(t.nome, estado.filtroRaridade === t.uuid, () => {
      estado.filtroRaridade = t.uuid; estado.mostrando = POR_PAGINA; pintarFiltroRaridade(); pintarCatalogo();
    }, t.cor));
  }
  caixa.append(pilula("Passe e evento", estado.filtroRaridade === "sem", () => {
    estado.filtroRaridade = "sem"; estado.mostrando = POR_PAGINA; pintarFiltroRaridade(); pintarCatalogo();
  }));
}

/* ---------------------------------------------------------------- início -- */

export async function iniciar() {
  const { conteudo } = await carregarConteudo();
  estado.conteudo = conteudo;
  estado.loadout = lerLoadout();
  vestirPagina(conteudo, { aqui: "arsenal.html", titulo: conteudo.arsenal?.titulo ?? "Arsenal" });
  carregarConta().then(montarBotaoDeConta);

  try {
    estado.arsenal = await carregarArsenal();
  } catch (e) {
    $("skins").replaceChildren(elemento("p", {
      class: "carregando",
      texto: `Não foi possível carregar o arsenal (${e.message}).`,
    }));
    return;
  }

  for (const a of estado.arsenal.armas) porUuid.armas.set(a.uuid, a);
  for (const t of estado.arsenal.raridades) porUuid.raridades.set(t.uuid, t);
  for (const t of estado.arsenal.temas) porUuid.temas.set(t.uuid, t);
  for (const s of estado.arsenal.skins) porUuid.skins.set(s.uuid, s);

  const tabela = conteudo.arsenal?.precos ?? {};
  const mult = Number(conteudo.arsenal?.multiplicadorCorpoACorpo) || 2;
  $("avisoPreco").textContent =
    `Preço de tabela por raridade: ${estado.arsenal.raridades
      .map((t) => `${t.nome} ${formatarVp(Number(tabela[t.devName]) || 0)} VP`)
      .join(", ")}. Faca custa ${mult}× isso. A Riot não publica preço por API — estes valores são editáveis no painel.`;

  pintarFiltroArma();
  pintarFiltroRaridade();
  pintarRack();
  pintarCatalogo();

  let atraso;
  $("busca").addEventListener("input", (ev) => {
    clearTimeout(atraso);
    atraso = setTimeout(() => {
      estado.busca = ev.target.value;
      estado.mostrando = POR_PAGINA;
      pintarCatalogo();
    }, 180);
  });

  $("ordem").addEventListener("change", (ev) => {
    estado.ordem = ev.target.value;
    estado.mostrando = POR_PAGINA;
    pintarCatalogo();
  });

  $("btnMais").addEventListener("click", () => {
    estado.mostrando += POR_PAGINA;
    pintarCatalogo();
  });

  $("btnLimpar").addEventListener("click", () => {
    if (!Object.keys(estado.loadout).length) return;
    if (!confirm("Tirar todas as skins do loadout?")) return;
    estado.loadout = {};
    gravarLoadout();
    pintarRack();
    pintarCatalogo();
  });
}

/** Sair da tela. O módulo fica na memória entre visitas: sem zerar, o filtro
 *  e a página de skins da visita anterior reapareceriam na volta. */
export function desmontar() {
  Object.assign(estado, estadoLimpo());
  for (const mapa of Object.values(porUuid)) mapa.clear();
}

// A casca marca o body antes de importar: dentro dela quem chama `iniciar()`
// é o roteiro, na hora da troca. Aberta solta, a página se vira sozinha.
if (!document.body.dataset.casca) iniciar();
