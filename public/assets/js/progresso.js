/**
 * Nível de conta, XP e cartões — do lado do navegador.
 *
 * O que decide nível e cartão é o servidor (`/api/progresso`). O que está aqui
 * é a conversa com ele, a mesma conta repetida só para desenhar barra e rótulo
 * sem precisar de uma ida ao servidor a cada quadro, e o painel que abre
 * quando se clica no nome de alguém.
 *
 * Se mexer na curva, mexa nos dois: este arquivo e `netlify/lib/progresso.mts`.
 */

import { elemento } from "./chrome.js";
import { patenteDoIndice } from "./elo.js";

const VAPI = "https://valorant-api.com/v1";

/* -------------------------------------------------- nada de curva aqui ---- */
/**
 * Nível, XP do nível e custo vêm prontos do servidor, dentro do perfil — e o
 * de quantos em quantos níveis sai um cartão vem junto, porque o painel pode
 * mudar isso. Repetir a conta aqui seria ter duas curvas para manter em dia,
 * e a do navegador seria a que mente quando alguém esquecesse de sincronizar.
 */
const cartoesACada = (perfil) => Math.max(1, Number(perfil?.cartoesACada) || 2);

/** Quantos níveis faltam para o próximo cartão. Zero quer dizer "no próximo". */
function faltamParaOCartao(nivel, aCada) {
  return aCada - (nivel % aCada || aCada);
}

/* ------------------------------------------------------------- o servidor */

async function pegar(url, opcoes = {}) {
  const r = await fetch(url, opcoes);
  let corpo = null;
  try { corpo = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) {
    const e = new Error(corpo?.erro || `${r.status} ${r.statusText}`);
    e.status = r.status;
    e.precisaEntrar = Boolean(corpo?.precisaEntrar);
    throw e;
  }
  return corpo;
}

/**
 * Manda a sessão que acabou e devolve o que ela rendeu.
 *
 * Falha em silêncio de propósito, como o envio ao ranking: o treino é a coisa
 * principal, e ninguém precisa levar um erro na cara porque o servidor de XP
 * não respondeu. O que não foi contado agora não volta — e isso está dito na
 * tela, não escondido.
 */
export async function registrarTreino(modo, sessao) {
  try {
    const r = await pegar("/api/progresso", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modo,
        valor: sessao?.valor,
        duracao: sessao?.duracao ?? null,
        tiros: sessao?.tiros ?? null,
        acertos: sessao?.acertos ?? null,
      }),
    });
    return { ...r, contou: true };
  } catch (e) {
    if (!e.precisaEntrar) console.info("XP não contou:", e.message);
    return { contou: false, motivo: e.message, precisaEntrar: e.precisaEntrar, cedoDemais: e.status === 429 };
  }
}

/** O perfil de quem está logado. Devolve null se não houver ninguém. */
export async function meuProgresso() {
  try {
    const { perfil } = await pegar("/api/progresso");
    return perfil;
  } catch {
    return null;
  }
}

const perfisLidos = new Map();

/**
 * `recarregar` existe por causa do painel: nível, XP e elo podem ser mudados
 * à mão enquanto a página está aberta, e o guardado aqui não fica sabendo.
 * Quem abre o perfil de alguém está pedindo o número de agora, então o
 * diálogo lê de novo; o passar do mouse continua usando o guardado, que é o
 * caso de dez leituras em dois segundos.
 */
export async function carregarPerfil(nome, { recarregar = false } = {}) {
  const chave = String(nome ?? "").toLowerCase();
  if (!chave) return null;
  if (!recarregar && perfisLidos.has(chave)) return perfisLidos.get(chave);

  const promessa = pegar(`/api/progresso?nome=${encodeURIComponent(nome)}`)
    .then((r) => r.perfil)
    .catch(() => null);
  perfisLidos.set(chave, promessa);
  const perfil = await promessa;
  perfisLidos.set(chave, perfil);
  return perfil;
}

/** Depois de treinar, o perfil guardado está velho. */
export function esquecerPerfil(nome) {
  perfisLidos.delete(String(nome ?? "").toLowerCase());
  listaDePerfis = null;
}

/**
 * Todos os perfis de uma vez, enxutos — o que a tabela do ranking precisa
 * para pôr nível ao lado de cada apelido e o cartão no passar do mouse.
 *
 * Uma requisição para a tabela inteira, não uma por linha. O perfil completo
 * de alguém só é buscado quando se clica nela.
 */
let listaDePerfis = null;
let listaLidaEm = 0;

/**
 * Guardada por um minuto, não para sempre: o painel muda nível e elo com a
 * página aberta, e sem validade o selo ao lado do apelido só acertava depois
 * de um recarregamento. Um minuto ainda deixa a tabela inteira sair de uma
 * leitura só, que é o motivo desta lista existir.
 */
const VALIDADE_LISTA_MS = 60_000;

export async function perfisDoRanking() {
  if (listaDePerfis && Date.now() - listaLidaEm < VALIDADE_LISTA_MS) return listaDePerfis;
  listaLidaEm = Date.now();
  listaDePerfis = (async () => {
    try {
      const r = await pegar("/api/progresso?todos=1");
      const porNome = new Map();
      for (const p of r.perfis ?? []) porNome.set(String(p.apelido).toLowerCase(), p);
      return { porNome, mostrarNoRanking: r.mostrarNoRanking !== false, cartaoNoHover: r.cartaoNoHover !== false };
    } catch {
      // Sem a lista, a tabela segue sem nível: é enfeite, não conteúdo.
      return { porNome: new Map(), mostrarNoRanking: false, cartaoNoHover: false };
    }
  })();
  return listaDePerfis;
}

/** Escolhe qual cartão a conta usa. Devolve o perfil atualizado, ou lança. */
export async function equiparCartao(uuid) {
  const r = await pegar("/api/progresso", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ acao: "equipar", uuid }),
  });
  listaDePerfis = null;
  if (r?.perfil) esquecerPerfil(r.perfil.apelido);
  return r.perfil;
}

/* --------------------------------------------------- bordas de nível ---- */
/**
 * No VALORANT o número do nível vem dentro de uma moldura que muda a cada
 * vinte níveis. São as mesmas da Riot, do catálogo dela: nível 1 a 19 usa a
 * primeira, 20 a 39 a segunda, e assim por diante até a de 480.
 *
 * A moldura entra depois que o selo já está na tela. Ela é enfeite: fazer a
 * barra de XP esperar uma imagem do CDN seria trocar o que importa pelo que
 * decora.
 */
let bordas = null;

export async function bordasDeNivel() {
  if (bordas) return bordas;
  try {
    const r = await fetch(`${VAPI}/levelborders`);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const { data } = await r.json();
    bordas = (data ?? [])
      .filter((b) => b?.levelNumberAppearance)
      .map((b) => ({
        apartirDe: Number(b.startingLevel) || 1,
        numero: b.levelNumberAppearance,
        cartao: b.smallPlayerCardAppearance ?? "",
        nome: b.displayName ?? "",
      }))
      // Maior primeiro: a primeira que couber é a certa.
      .sort((a, b) => b.apartirDe - a.apartirDe);
  } catch (e) {
    console.warn("Bordas de nível indisponíveis:", e.message);
    bordas = [];
  }
  return bordas;
}

export const bordaDoNivel = (nivel, lista) =>
  (lista ?? []).find((b) => nivel >= b.apartirDe) ?? null;

/* ------------------------------------------------- o catálogo de cartões */

let catalogo = null;

/** uuid -> { nome, icone, arteLarga }. Uma busca por sessão de navegação. */
export async function cartoesDoCatalogo() {
  if (catalogo) return catalogo;
  try {
    const r = await fetch(`${VAPI}/playercards?language=pt-BR`);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const { data } = await r.json();
    catalogo = new Map(
      (data ?? []).map((c) => [c.uuid, {
        nome: c.displayName ?? "",
        icone: c.displayIcon ?? c.smallArt ?? "",
        arteLarga: c.wideArt ?? c.displayIcon ?? "",
        arteGrande: c.largeArt ?? c.displayIcon ?? "",
      }]),
    );
  } catch (e) {
    console.warn("Catálogo de cartões indisponível:", e.message);
    catalogo = new Map();
  }
  return catalogo;
}

/* ------------------------------------------------------------- desenhos -- */

/** A barra de XP com o nível ao lado. Serve na capa do treino e no perfil. */
export function montarNivel(perfil, { grande = false } = {}) {
  if (!perfil) return null;
  const pct = perfil.custo ? Math.min(100, (perfil.xpNoNivel / perfil.custo) * 100) : 0;

  const barra = elemento("div", { class: "nivel-conta__barra" }, [
    elemento("b", { estilo: `width:${pct.toFixed(1)}%` }),
  ]);

  const selo = elemento("div", { class: "nivel-conta__selo" }, [
    elemento("strong", { class: "nivel-conta__num", texto: String(perfil.nivel) }),
  ]);

  // A moldura da Riot entra quando chegar; até lá o selo tem a borda do site.
  // Sem checar `isConnected`: na primeira vez a lista vem da rede e o selo já
  // está na página quando ela chega, mas nas próximas ela vem do cache e a
  // promessa resolve antes de o selo ser inserido. Era isso que fazia a
  // moldura aparecer no começo e sumir depois, a cada redesenho.
  bordasDeNivel().then((lista) => {
    const borda = bordaDoNivel(perfil.nivel, lista);
    if (!borda) return;
    selo.style.setProperty("--borda", `url("${borda.numero}")`);
    selo.dataset.borda = "sim";
    selo.title = borda.nome;
  });

  return elemento("div", { class: `nivel-conta${grande ? " nivel-conta--g" : ""}` }, [
    selo,
    elemento("div", { class: "nivel-conta__corpo" }, [
      barra,
      elemento("span", {
        class: "nivel-conta__xp",
        texto: `${perfil.xpNoNivel} / ${perfil.custo} XP para o nível ${perfil.nivel + 1}`,
      }),
    ]),
  ]);
}

/** A grade de cartões já liberados. */
function montarCartoes(perfil, mapa) {
  const grade = elemento("div", { class: "cartoes" });

  const aCada = cartoesACada(perfil);

  if (!perfil.cartoes?.length) {
    const faltam = faltamParaOCartao(perfil.nivel, aCada);
    return elemento("p", {
      class: "carregando",
      texto: `Nenhum cartão ainda — o primeiro sai no nível ${aCada}${
        faltam ? ` (faltam ${faltam} ${faltam === 1 ? "nível" : "níveis"})` : ""}.`,
    });
  }

  perfil.cartoes.forEach((uuid, i) => {
    grade.append(figuraDeCartao(uuid, mapa, {
      nivel: (i + 1) * aCada,
      equipado: uuid === perfil.cartaoEquipado,
    }));
  });

  return grade;
}

/** Um cartão desenhado: arte, nome e o nível em que saiu. */
function figuraDeCartao(uuid, mapa, { nivel, equipado = false } = {}) {
  const c = mapa.get(uuid);
  return elemento("figure", { class: `cartao chf${equipado ? " cartao--equipado" : ""}` }, [
    c?.arteLarga
      ? elemento("img", { class: "cartao__arte", src: c.arteLarga, alt: "", loading: "lazy" })
      : elemento("div", { class: "cartao__arte cartao__arte--vazia" }),
    equipado ? elemento("span", { class: "cartao__marca", texto: "em uso" }) : null,
    elemento("figcaption", { class: "cartao__pe" }, [
      elemento("span", { class: "cartao__nome", texto: c?.nome || "Cartão" }),
      elemento("span", { class: "cartao__nivel", texto: nivel ? `nível ${nivel}` : "" }),
    ]),
  ]);
}

/* ----------------------------------------------- a área de escolha ------ */
/**
 * Onde a pessoa escolhe qual dos cartões liberados vai usar.
 *
 * Mostra o que ela já tem e o próximo a sair, porque metade da graça de um
 * sistema de níveis é saber o que vem. Só quem está logado vê: cartão é da
 * conta, e sem conta não há o que escolher.
 *
 * Se o painel desligar a troca, a área continua mostrando a coleção — o que
 * se perde é o clique, não o que a pessoa conquistou.
 */
export async function montarEscolhaDeCartoes(alvo, { aoTrocar } = {}) {
  if (!alvo) return;

  const pintar = async () => {
    const perfil = await meuProgresso();
    if (!perfil) {
      alvo.replaceChildren(elemento("p", { class: "carregando", texto:
        "Entre na sua conta para ver e escolher seus cartões." }));
      return;
    }

    const mapa = await cartoesDoCatalogo();
    const aCada = cartoesACada(perfil);
    const blocos = [montarNivel(perfil, { grande: true })];

    if (!perfil.cartoes.length) {
      const faltam = faltamParaOCartao(perfil.nivel, aCada);
      blocos.push(elemento("p", { class: "carregando", texto:
        `Seu primeiro cartão sai no nível ${aCada}${faltam ? ` — faltam ${faltam} ${faltam === 1 ? "nível" : "níveis"}` : ""}.` }));
      alvo.replaceChildren(...blocos);
      return;
    }

    const aviso = elemento("p", { class: "perfil__nota", texto: perfil.podeTrocarCartao
      ? "Clique num cartão para usá-lo. Ele é o que aparece quando alguém passa o mouse no seu apelido no ranking."
      : "A troca de cartão está desligada no painel no momento." });

    const grade = elemento("div", { class: "cartoes" });
    perfil.cartoes.forEach((uuid, i) => {
      const fig = figuraDeCartao(uuid, mapa, {
        nivel: (i + 1) * aCada,
        equipado: uuid === perfil.cartaoEquipado,
      });
      if (perfil.podeTrocarCartao) {
        fig.classList.add("cartao--clicavel");
        fig.setAttribute("role", "button");
        fig.setAttribute("tabindex", "0");
        const trocar = async () => {
          if (uuid === perfil.cartaoEquipado) return;
          grade.setAttribute("aria-busy", "true");
          try {
            await equiparCartao(uuid);
            await pintar();
            aoTrocar?.();
          } catch (e) {
            aviso.textContent = `Não deu para trocar: ${e.message}`;
            grade.removeAttribute("aria-busy");
          }
        };
        fig.addEventListener("click", trocar);
        fig.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); trocar(); }
        });
      }
      grade.append(fig);
    });

    const proximo = (perfil.cartoes.length + 1) * aCada;
    blocos.push(aviso, grade, elemento("p", { class: "perfil__nota", texto:
      `Próximo cartão no nível ${proximo}. São os cartões de jogador do VALORANT, da Riot.` }));

    alvo.replaceChildren(...blocos);
  };

  alvo.replaceChildren(elemento("p", { class: "carregando", texto: "Lendo seus cartões…" }));
  await pintar();
}

/* ------------------------------------------------------- XP do treino ---- */
/**
 * O que a sessão rendeu em XP, logo abaixo da patente.
 *
 * Só aparece para quem está logado: nível é da conta, e sem conta não há onde
 * guardar. Quem não entrou vê o convite a publicar, que resolve as duas coisas
 * de uma vez — é a mesma porta.
 *
 * Recebe onde desenhar porque o estande e a Linha de Tiro têm capas
 * diferentes e o mesmo fim de rodada.
 *
 * Subir de nível e ganhar cartão são os dois momentos que merecem destaque;
 * o resto é uma linha discreta com a barra andando.
 */
export async function mostrarGanhoDeXp(alvo, resultado) {
  if (!alvo || !resultado?.contou || !resultado.perfil) return;

  const { perfil, ganho, subiu, cartoesNovos = [], limitadoNoDia } = resultado;
  esquecerPerfil(perfil.apelido);

  const blocos = [];

  if (subiu) {
    blocos.push(elemento("div", { class: "xp-ganho__subiu" }, [
      elemento("strong", { texto: `Nível ${perfil.nivel}` }),
      document.createTextNode(" alcançado."),
    ]));
  }

  blocos.push(elemento("div", { class: "xp-ganho__linha" }, [
    elemento("span", { class: "xp-ganho__num", texto: `+${ganho} XP` }),
    montarNivel(perfil),
  ]));

  if (limitadoNoDia) {
    blocos.push(elemento("p", { class: "xp-ganho__nota", texto:
      "Você chegou ao teto de XP do dia. O treino continua valendo; o XP volta a contar amanhã." }));
  }

  alvo.replaceChildren(...blocos);
  alvo.hidden = false;

  // O cartão novo entra depois, quando a arte chegar: a barra de XP não
  // precisa esperar uma imagem do CDN para aparecer.
  if (cartoesNovos.length) {
    const mapa = await cartoesDoCatalogo();
    if (alvo.hidden) return;
    const grade = elemento("div", { class: "xp-ganho__cartoes" }, cartoesNovos.map((uuid) => {
      const c = mapa.get(uuid);
      return elemento("figure", { class: "cartao chf" }, [
        c?.arteLarga
          ? elemento("img", { class: "cartao__arte", src: c.arteLarga, alt: "", loading: "lazy" })
          : elemento("div", { class: "cartao__arte cartao__arte--vazia" }),
        elemento("figcaption", { class: "cartao__pe" }, [
          elemento("span", { class: "cartao__nome", texto: c?.nome || "Cartão novo" }),
          elemento("span", { class: "cartao__nivel", texto: `nível ${perfil.nivel}` }),
        ]),
      ]);
    }));
    alvo.append(
      elemento("p", { class: "xp-ganho__nota", texto:
        cartoesNovos.length === 1
          ? `Cartão liberado — um a cada ${cartoesACada(perfil)} níveis.`
          : `${cartoesNovos.length} cartões liberados.` }),
      grade,
    );
  }
}

/* ---------------------------------------------------- o painel do jogador */

const NOMES_MODO = {
  gridshot: "Gridshot", tracking: "Tracking", flick: "Flick", linha: "Linha de Tiro",
};

/**
 * O elo de alguém a partir da tabela que a página já tem na mão: a melhor
 * entrada da pessoa em cada exercício, e a média delas como elo geral.
 * Nenhuma ida ao servidor — é a mesma linha em que se clicou.
 */
function eloDoJogador(nome, tabela, patentes = []) {
  const alvo = String(nome ?? "").toLowerCase();
  const porModo = [];
  for (const modo of ["gridshot", "tracking", "flick", "linha"]) {
    const dele = (tabela?.modos?.[modo] ?? []).find((e) => e.nome.toLowerCase() === alvo);
    if (dele) porModo.push({ modo, entrada: dele });
  }
  const indices = porModo.map((p) => p.entrada.indice).filter((v) => Number.isFinite(v));
  const geral = indices.length ? Math.round(indices.reduce((a, b) => a + b, 0) / indices.length) : null;
  return { porModo, geral, patenteGeral: geral === null ? null : (patentes[patenteDoIndice(geral)] ?? null) };
}

function selo(patente, grande = false) {
  if (!patente) return elemento("span", { class: "selo__nome", texto: "—" });
  const el = elemento("div", { class: `selo${grande ? " selo--g" : ""}` });
  el.style.setProperty("--patente", patente.cor);
  if (patente.iconeGrande || patente.icone) {
    el.append(elemento("img", {
      class: "selo__icone", alt: "", loading: "lazy",
      src: grande ? (patente.iconeGrande ?? patente.icone) : (patente.icone ?? patente.iconeGrande),
    }));
  }
  el.append(elemento("span", { class: "selo__nome", texto: patente.nome }));
  return el;
}

let dialogo = null;

function montarDialogo() {
  if (dialogo) {
    // A troca de tela varre o corpo do documento, e leva junto o que foi
    // pendurado nele. O nó guardado continua bom: basta pendurar de novo.
    if (!dialogo.isConnected) document.body.append(dialogo);
    return dialogo;
  }
  const caixa = elemento("div", { class: "gaveta__caixa chf perfil", id: "perfilCaixa" });
  dialogo = elemento("dialog", { class: "gaveta gaveta--perfil", "aria-labelledby": "perfilNome" }, [caixa]);
  dialogo.addEventListener("click", (ev) => { if (ev.target === dialogo) dialogo.close(); });
  document.body.append(dialogo);
  return dialogo;
}

/**
 * Abre o painel de um jogador: nível, elo e cartões.
 *
 * O elo sai da tabela que a página já tem na mão — é a melhor entrada da
 * pessoa em cada exercício, a mesma que está na linha clicada. Nível e cartões
 * vêm do servidor. Se a pessoa nunca treinou logada, não há perfil: a tela diz
 * isso em vez de inventar um nível zero.
 */
export async function abrirPerfil(nome, { tabela, patentes = [] } = {}) {
  const d = montarDialogo();
  const caixa = d.querySelector(".perfil");

  caixa.replaceChildren(
    elemento("h3", { id: "perfilNome", class: "perfil__nome", texto: nome }),
    elemento("p", { class: "carregando", texto: "Lendo o perfil…" }),
  );
  if (!d.open) d.showModal();

  const [perfil, mapa] = await Promise.all([
    carregarPerfil(nome, { recarregar: true }),
    cartoesDoCatalogo(),
  ]);

  // A pessoa pode ter fechado e clicado em outro nome enquanto isso carregava.
  if (!d.open || caixa.querySelector("#perfilNome")?.textContent !== nome) return;

  // O Fechar fica preso no canto da caixa, nao no topo do conteudo: o que
  // rola e o .perfil__rolo, e o botao continua a vista até o fim da lista
  // de cartões.
  const fechar = elemento("button", {
    class: "btn btn--vazio chf gaveta__fechar", type: "button", texto: "Fechar",
    onclick: () => d.close(),
  });

  /* ------------------------------------------------------------- elo --- */
  const calculado = eloDoJogador(nome, tabela, patentes);
  const { porModo } = calculado;
  // Elo posto à mão no painel vence o calculado — e a tela diz isso. Mostrar
  // um número digitado sob o rótulo "elo estimado" sem avisar seria o site
  // mentindo sobre a própria medição.
  const porPainel = perfil?.eloAjustado ? (patentes[perfil.elo] ?? null) : null;
  const patenteGeral = porPainel ?? calculado.patenteGeral;
  const geral = porPainel ? null : calculado.geral;

  const blocos = [
    elemento("div", { class: "perfil__topo" }, [
      elemento("h3", { id: "perfilNome", class: "perfil__nome", texto: nome }),
    ]),
  ];

  if (perfil) {
    blocos.push(montarNivel(perfil, { grande: true }));
    blocos.push(elemento("p", { class: "perfil__conta", texto:
      `${perfil.xp} XP no total · ${perfil.sessoes} ${perfil.sessoes === 1 ? "sessão" : "sessões"} de treino` }));
  } else {
    blocos.push(elemento("p", { class: "carregando", texto:
      "Sem nível ainda: esta pessoa publicou no ranking mas não treinou com a conta aberta depois que o nível passou a contar." }));
  }

  blocos.push(elemento("div", { class: "perfil__secao" }, [
    elemento("h4", { texto: "Elo estimado" }),
    patenteGeral
      ? elemento("div", { class: "perfil__geral" }, [
          selo(patenteGeral, true),
          // Sem índice calculado o espaço fica vazio mesmo: a patente posta
          // pelo painel é a patente da pessoa, e anunciar de onde ela veio no
          // cartão dela não acrescenta nada a quem está olhando.
          geral !== null
            ? elemento("span", { class: "perfil__indice", texto: `${geral} de 100` })
            : null,
        ])
      : elemento("p", { class: "carregando", texto: "Ainda sem pontuação publicada." }),
    porModo.length
      ? elemento("ul", { class: "perfil__modos" }, porModo.map(({ modo, entrada }) =>
          elemento("li", {}, [
            elemento("span", { class: "perfil__modo", texto: NOMES_MODO[modo] ?? modo }),
            selo(patentes[entrada.patente]),
          ])))
      : null,
  ]));

  if (perfil) {
    blocos.push(elemento("div", { class: "perfil__secao" }, [
      elemento("h4", { texto: `Cartões · ${perfil.cartoes.length}` }),
      elemento("p", { class: "perfil__nota", texto:
        `Um cartão a cada ${cartoesACada(perfil)} níveis. São os cartões de jogador do VALORANT, da Riot.` }),
      montarCartoes(perfil, mapa),
    ]));
  }

  caixa.replaceChildren(
    fechar,
    elemento("div", { class: "gaveta__rolo perfil__rolo" }, blocos.filter(Boolean)),
  );
}

/* ------------------------------------------- o cartão que segue o mouse -- */
/**
 * O banner de jogador do VALORANT, aparecendo ao passar o mouse sobre um
 * apelido: a arte do cartão escolhido ao fundo, o nível dentro da moldura da
 * Riot, o apelido e o elo.
 *
 * É um elemento só, reaproveitado — cem linhas na tabela não viram cem
 * cartões escondidos no documento. Some ao sair, ao rolar e ao apertar Esc.
 */
let flutuante = null;
let relogioHover = null;

function caixaFlutuante() {
  if (flutuante) {
    // A troca de tela varre o corpo do documento, e leva junto o que foi
    // pendurado nele. O nó guardado continua bom: basta pendurar de novo.
    if (!flutuante.isConnected) document.body.append(flutuante);
    return flutuante;
  }
  flutuante = elemento("div", { class: "cartao-jogador", role: "tooltip", hidden: true });
  document.body.append(flutuante);
  addEventListener("scroll", esconderCartao, { passive: true, capture: true });
  addEventListener("keydown", (ev) => { if (ev.key === "Escape") esconderCartao(); });
  return flutuante;
}

function esconderCartao() {
  clearTimeout(relogioHover);
  if (flutuante) { flutuante.hidden = true; flutuante.replaceChildren(); }
}

/** Encosta o cartão no elemento, sem deixá-lo sair da tela. */
function posicionar(caixa, ancora) {
  const a = ancora.getBoundingClientRect();
  const c = caixa.getBoundingClientRect();
  const margem = 10;

  let esquerda = a.left;
  esquerda = Math.min(esquerda, innerWidth - c.width - margem);
  esquerda = Math.max(margem, esquerda);

  // Prefere abrir para baixo; sobe se não couber.
  const cabeAbaixo = a.bottom + c.height + margem < innerHeight;
  const topo = cabeAbaixo ? a.bottom + 8 : Math.max(margem, a.top - c.height - 8);

  caixa.style.left = `${Math.round(esquerda)}px`;
  caixa.style.top = `${Math.round(topo)}px`;
}

async function mostrarCartao(ancora, nome, contexto, aindaVale) {
  const caixa = caixaFlutuante();
  const ctx = typeof contexto === "function" ? contexto() : (contexto ?? {});

  const [lista, mapa] = await Promise.all([perfisDoRanking(), cartoesDoCatalogo()]);
  if (!lista.cartaoNoHover) return;
  // Buscar perfil e catálogo leva tempo, e nesse tempo o mouse pode já ter
  // ido embora. Quem responde isso é o próprio ouvinte, por um sinal que ele
  // controla — e não o `:hover` do CSS, que não existe em foco por teclado
  // nem em ponteiro que não seja mouse.
  if (!aindaVale()) return;

  const perfil = lista.porNome.get(nome.toLowerCase()) ?? null;
  const arte = perfil?.cartaoEquipado ? mapa.get(perfil.cartaoEquipado)?.arteLarga : "";
  const calc = eloDoJogador(nome, ctx.tabela, ctx.patentes);
  const doPainel = typeof perfil?.elo === "number" ? ((ctx.patentes ?? [])[perfil.elo] ?? null) : null;
  const patenteGeral = doPainel ?? calc.patenteGeral;
  const geral = doPainel ? null : calc.geral;

  const corpo = elemento("div", { class: "cartao-jogador__corpo" }, [
    elemento("div", { class: "cartao-jogador__topo" }, [
      elemento("span", { class: "cartao-jogador__nome", texto: nome }),
      perfil ? seloDeNivel(perfil.nivel) : null,
    ]),
    perfil
      ? elemento("div", { class: "cartao-jogador__barra" }, [
          elemento("b", { estilo: `width:${perfil.custo ? Math.min(100, (perfil.xpNoNivel / perfil.custo) * 100) : 0}%` }),
        ])
      : null,
    elemento("div", { class: "cartao-jogador__pe" }, [
      patenteGeral ? selo(patenteGeral) : elemento("span", { class: "selo__nome", texto: "sem elo publicado" }),
      geral !== null ? elemento("span", { class: "cartao-jogador__indice", texto: `${geral}/100` }) : null,
    ]),
    perfil
      ? elemento("span", { class: "cartao-jogador__conta", texto:
          `${perfil.sessoes} ${perfil.sessoes === 1 ? "sessão" : "sessões"} · ${perfil.cartoes} ${perfil.cartoes === 1 ? "cartão" : "cartões"}` })
      : elemento("span", { class: "cartao-jogador__conta", texto: "ainda sem nível de conta" }),
  ]);

  caixa.replaceChildren(corpo);
  caixa.style.backgroundImage = arte ? `url("${arte}")` : "";
  caixa.dataset.arte = arte ? "sim" : "nao";
  caixa.hidden = false;
  posicionar(caixa, ancora);
}

/** O selo do nível com a moldura da Riot, do tamanho do cartão flutuante. */
function seloDeNivel(nivel) {
  const el = elemento("div", { class: "nivel-conta__selo" }, [
    elemento("strong", { class: "nivel-conta__num", texto: String(nivel) }),
  ]);
  bordasDeNivel().then((lista) => {
    const borda = bordaDoNivel(nivel, lista);
    if (!borda) return;
    el.style.setProperty("--borda", `url("${borda.numero}")`);
    el.dataset.borda = "sim";
    el.title = borda.nome;
  });
  return el;
}

/** O nível ao lado do apelido na tabela. Null quando a pessoa não tem perfil. */
export async function seloParaATabela(nome) {
  const lista = await perfisDoRanking();
  if (!lista.mostrarNoRanking) return null;
  const perfil = lista.porNome.get(String(nome ?? "").toLowerCase());
  return perfil ? seloDeNivel(perfil.nivel) : null;
}

/**
 * Faz um nome virar alvo: passar o mouse mostra o cartão do jogador, clicar
 * abre o painel inteiro. Recebe de onde tirar tabela e patentes na hora —
 * assim a página pode atualizar a tabela sem religar nada.
 */
export function tornarClicavel(el, nome, contexto) {
  if (!el || !nome) return;
  el.classList.add("nome-clicavel");
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.title = `Ver o perfil de ${nome}`;

  const abrir = (ev) => {
    ev.stopPropagation();
    esconderCartao();
    abrirPerfil(nome, typeof contexto === "function" ? contexto() : contexto);
  };
  el.addEventListener("click", abrir);
  el.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrir(ev); }
  });

  // A espera curta existe para passar o mouse por cima de dez linhas não
  // disparar dez cartões no caminho. O contador é o que diz, lá na frente,
  // se o pedido ainda é o mais recente.
  let vez = 0;
  const agendar = () => {
    const minha = ++vez;
    clearTimeout(relogioHover);
    relogioHover = setTimeout(() => mostrarCartao(el, nome, contexto, () => minha === vez), 160);
  };
  const soltar = () => { vez++; esconderCartao(); };

  el.addEventListener("pointerenter", agendar);
  el.addEventListener("focus", agendar);
  el.addEventListener("pointerleave", soltar);
  el.addEventListener("blur", soltar);
}
