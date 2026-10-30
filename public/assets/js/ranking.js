import {
  carregarConteudo, carregarPatentes, carregarRanking, publicarNoRanking,
} from "./api.js";
import { $, elemento, vestirPagina } from "./chrome.js";
import { MARCOS, indiceDe, patenteDoIndice, indiceGeral, patentesReais } from "./elo.js";
import { tornarClicavel, seloParaATabela, montarEscolhaDeCartoes } from "./progresso.js";
import { carregarConta, contaAtual, pedirConta, montarBotaoDeConta, aoMudarConta } from "./conta.js";

// A página do ranking: o elo estimado de quem está olhando, a tabela pública e
// a escala inteira. Os recordes locais ficam no navegador; só vai para o
// servidor o que a pessoa mandar, com o apelido que ela escolher.

const CHAVE_HIST = "estande.hist.v2";
const CHAVE_LINHA = "estande.linha.v1";
const CHAVE_APELIDO = "estande.apelido.v1";

const NOMES_MODO = {
  gridshot: "Gridshot",
  tracking: "Tracking",
  flick: "Flick",
  linha: "Linha de Tiro",
};

const estado = { patentes: [], tabela: null, modoAberto: "gridshot", meus: {} };

const ler = (chave, reserva) => {
  try { return JSON.parse(localStorage.getItem(chave) ?? "null") ?? reserva; }
  catch { return reserva; }
};

/* --------------------------------------------------- recordes do aparelho - */

/**
 * Junta o que os três exercícios de mira e a Linha de Tiro guardaram, e devolve
 * o melhor de cada um já com índice.
 */
function meusRecordes() {
  const saida = {};

  const hist = ler(CHAVE_HIST, {});
  for (const modo of ["gridshot", "tracking", "flick"]) {
    const lista = Array.isArray(hist[modo]) ? hist[modo] : [];
    if (!lista.length) continue;
    const melhorQue = (a, b) => (modo === "flick" ? a < b : a > b);
    const melhor = lista.reduce((m, s) => (melhorQue(s.principal, m.principal) ? s : m), lista[0]);
    saida[modo] = {
      valor: melhor.principal,
      precisao: melhor.precisao,
      sessoes: lista.length,
      indice: indiceDe(modo, melhor.principal),
      // A sessão crua vai junto: o servidor confere tiros, acertos e duração
      // antes de aceitar, e sem ela o envio chega sem esses números.
      bruto: melhor,
    };
  }

  // A Linha de Tiro guarda por arma; o ranking usa abates por minuto. Registros
  // gravados antes de o campo `duracao` existir ficam de fora: sem saber quanto
  // durou a rodada, qualquer conversão para abates por minuto é chute — e chute
  // para cima vira um elo que a pessoa não tem.
  const linha = ler(CHAVE_LINHA, {});
  const registros = Object.values(linha).filter(
    (r) => r && Number.isFinite(r.abates) && Number.isFinite(r.duracao) && r.duracao >= 10,
  );
  if (registros.length) {
    const porMin = (r) => (r.abates / r.duracao) * 60;
    const melhor = registros.reduce((m, r) => (porMin(r) > porMin(m) ? r : m), registros[0]);
    const porMinuto = porMin(melhor);
    saida.linha = {
      valor: porMinuto,
      precisao: melhor.precisao,
      sessoes: registros.length,
      indice: indiceDe("linha", porMinuto),
      detalhe: melhor.arma ?? null,
      bruto: melhor,
    };
  }

  return saida;
}

/* -------------------------------------------------------------- patentes -- */

function patenteDe(indice) {
  return estado.patentes[patenteDoIndice(indice)] ?? null;
}

function selo(patente, { grande = false } = {}) {
  if (!patente) return elemento("span", { class: "selo__nome", texto: "—" });
  const caixa = elemento("div", { class: `selo${grande ? " selo--g" : ""}` });
  caixa.style.setProperty("--patente", patente.cor);
  if (patente.icone) {
    caixa.append(elemento("img", { class: "selo__icone", src: grande ? patente.iconeGrande : patente.icone, alt: "", loading: "lazy" }));
  }
  caixa.append(elemento("span", { class: "selo__nome", texto: patente.nome }));
  return caixa;
}

/* ------------------------------------------------------------- meu painel - */

function pintarMeuElo() {
  const alvo = $("eloPainel");
  alvo.replaceChildren();
  estado.meus = meusRecordes();

  const feitos = Object.keys(estado.meus);
  if (!feitos.length) {
    alvo.append(elemento("p", { class: "carregando" }, [
      document.createTextNode("Você ainda não treinou neste navegador. "),
      elemento("a", { href: "index.html#estande", texto: "Faça uma sessão" }),
      document.createTextNode(" e seu elo aparece aqui."),
    ]));
    return;
  }

  const geral = indiceGeral(Object.fromEntries(feitos.map((m) => [m, estado.meus[m].indice])));
  const patGeral = patenteDe(geral);

  const resumo = elemento("div", { class: "elo-geral chf" }, [
    selo(patGeral, { grande: true }),
    elemento("div", { class: "elo-geral__texto" }, [
      elemento("div", { class: "elo-geral__indice", texto: `${geral} de 100` }),
      elemento("div", { class: "elo-geral__nota", texto:
        feitos.length >= 4
          ? "Média dos quatro exercícios. É a estimativa mais firme que o site consegue dar."
          : `Média de ${feitos.length} ${feitos.length === 1 ? "exercício" : "exercícios"}. Faltam ${4 - feitos.length} para a estimativa ficar de pé.` }),
    ]),
  ]);

  const grade = elemento("div", { class: "elo-modos" });
  for (const modo of ["gridshot", "tracking", "flick", "linha"]) {
    const r = estado.meus[modo];
    const m = MARCOS[modo];
    const cartao = elemento("div", { class: `elo-modo chf${r ? "" : " elo-modo--vazio"}` }, [
      elemento("div", { class: "elo-modo__topo" }, [
        elemento("span", { class: "elo-modo__nome", texto: NOMES_MODO[modo] }),
        r ? selo(patenteDe(r.indice)) : elemento("span", { class: "elo-modo__sem", texto: "não treinado" }),
      ]),
      r
        ? elemento("div", { class: "elo-modo__corpo" }, [
            elemento("div", { class: "elo-modo__valor", texto: m.unidade(r.valor) }),
            elemento("div", { class: "elo-modo__rot", texto: `${m.rotulo} · índice ${r.indice}` }),
            elemento("div", { class: "medidor" }, [
              Object.assign(elemento("div", { class: "medidor__barra" }), { style: `width:${r.indice}%` }),
            ]),
            elemento("button", {
              class: "btn btn--latao chf btn--mini", type: "button",
              texto: "Publicar no ranking",
              onclick: () => abrirEnvio(modo, r),
            }),
          ])
        : elemento("a", { class: "elo-modo__ir", href: modo === "linha" ? "linha.html" : "index.html#estande", texto: "Treinar" }),
    ]);
    grade.append(cartao);
  }

  alvo.append(resumo, grade);
}

/* ---------------------------------------------------------------- envio --- */

let envioPendente = null;

async function abrirEnvio(modo, registro) {
  // Publicar exige conta. Se não houver, o diálogo de login abre primeiro e o
  // envio continua de onde parou quando a pessoa entrar.
  const conta = contaAtual() ?? await pedirConta();
  if (!conta) return;

  envioPendente = { modo, registro };
  const m = MARCOS[modo];
  $("envioResumo").textContent =
    `${NOMES_MODO[modo]} — ${m.unidade(registro.valor)} (${m.rotulo}), índice ${registro.indice}.`;
  $("envioComo").textContent = conta.apelido;
  $("envioErro").hidden = true;
  $("gaveta").showModal();
}

$("envioCancelar").addEventListener("click", () => $("gaveta").close());

$("formEnvio").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (!envioPendente) return;

  const erro = $("envioErro");
  const botao = $("envioConfirmar");
  erro.hidden = true;
  botao.disabled = true;

  const { modo, registro } = envioPendente;

  // A duração e os tiros vão junto porque o servidor confere a coerência
  // antes de aceitar: sessão curta ou sem acerto não entra.
  const corpo = {
    modo,
    valor: registro.valor,
    precisao: registro.precisao,
    detalhe: registro.detalhe ?? null,
    duracao: registro.bruto?.duracao ?? (modo === "linha" ? 60 : 30),
    tiros: registro.bruto?.tiros ?? null,
    // Na Linha de Tiro o que conta como "acerto" para a conferência é o abate.
    acertos: (modo === "linha" ? registro.bruto?.abates : registro.bruto?.acertos) ?? null,
  };

  try {
    const r = await publicarNoRanking(corpo);
    $("gaveta").close();
    estado.tabela = await carregarRanking();
    estado.modoAberto = modo;
    pintarModos();
    pintarTabela();
    $("rank").scrollIntoView({ behavior: "smooth", block: "start" });
    avisarPosicao(r);
  } catch (e) {
    if (e.precisaEntrar) {
      // A sessão expirou entre abrir o diálogo e enviar.
      $("gaveta").close();
      const conta = await pedirConta();
      if (conta) { envioPendente = { modo, registro }; abrirEnvio(modo, registro); }
      return;
    }
    erro.hidden = false;
    erro.replaceChildren(elemento("strong", { texto: "Não deu: " }), document.createTextNode(e.message));
  } finally {
    botao.disabled = false;
  }
});

function avisarPosicao(r) {
  const alvo = $("rankQuando");
  alvo.textContent = r.posicao
    ? `publicado — ${r.posicao}º de ${r.total}`
    : "publicado";
}

/* --------------------------------------------------------------- tabela --- */

function pintarModos() {
  const caixa = $("rankModos");
  caixa.replaceChildren();
  for (const modo of ["gridshot", "tracking", "flick", "linha"]) {
    const n = estado.tabela?.modos?.[modo]?.length ?? 0;
    caixa.append(elemento("button", {
      type: "button", class: "pilula chf",
      texto: `${NOMES_MODO[modo]} (${n})`,
      "aria-pressed": String(estado.modoAberto === modo),
      onclick: () => { estado.modoAberto = modo; pintarModos(); pintarTabela(); },
    }));
  }
}

/**
 * O apelido na tabela vira botão: clicar abre o perfil da pessoa, com nível,
 * elo e cartões. Entrada de exemplo não abre nada — não há ninguém atrás dela.
 */
function nomeDeJogador(e) {
  const el = elemento("span", { class: "rank__nome", texto: e.nome, title: e.detalhe ?? "" });
  if (e.exemplo) return el;

  tornarClicavel(el, e.nome, () => ({ tabela: estado.tabela, patentes: estado.patentes }));

  // O nível entra quando a lista de perfis chegar. A tabela não espera por
  // ela: quem publicou pontuação tem direito à sua linha mesmo que o serviço
  // de níveis esteja fora.
  seloParaATabela(e.nome).then((selo) => {
    // Sem `isConnected`: com os perfis em cache a promessa resolve antes de
    // a linha entrar na tabela, e o selo de nível nunca apareceria.
    if (selo) el.prepend(selo);
  });
  return el;
}

function pintarTabela() {
  const alvo = $("rank");
  alvo.replaceChildren();

  const lista = estado.tabela?.modos?.[estado.modoAberto] ?? [];
  const m = MARCOS[estado.modoAberto];
  const meuNome = (contaAtual()?.apelido ?? "").toLowerCase();

  if (!lista.length) {
    alvo.append(elemento("p", { class: "carregando", texto: "Ninguém publicou neste exercício ainda. Seja o primeiro." }));
    return;
  }

  const cabecalho = elemento("div", { class: "rank__linha rank__linha--cab" }, [
    elemento("span", { class: "rank__pos", texto: "#" }),
    elemento("span", { class: "rank__nome", texto: "apelido" }),
    elemento("span", { class: "rank__patente", texto: "elo estimado" }),
    elemento("span", { class: "rank__valor", texto: m.rotulo }),
    elemento("span", { class: "rank__quando", texto: "quando" }),
  ]);
  alvo.append(cabecalho);

  lista.forEach((e, i) => {
    const meu = e.nome.toLowerCase() === meuNome;
    const linha = elemento("div", { class: `rank__linha${meu ? " rank__linha--meu" : ""}` }, [
      elemento("span", { class: "rank__pos", texto: String(i + 1) }),
      nomeDeJogador(e),
      elemento("span", { class: "rank__patente" }, [
        selo(estado.patentes[e.patente]),
        e.ajustado ? elemento("span", { class: "rank__ajustado", texto: "ajustado", title: "Patente definida pelo painel, não calculada pelo desempenho." }) : null,
        e.exemplo ? elemento("span", { class: "rank__exemplo", texto: "exemplo", title: "Entrada de demonstração criada pelo painel. Não é pontuação de ninguém." }) : null,
      ]),
      elemento("span", { class: "rank__valor", texto: m.unidade(e.valor) }),
      elemento("span", { class: "rank__quando", texto: new Date(e.em).toLocaleDateString("pt-BR") }),
    ]);
    alvo.append(linha);
  });

  if (estado.tabela?.consolidadoEm) {
    $("rankQuando").textContent =
      `consolidado em ${new Date(estado.tabela.consolidadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
  }
}

/* --------------------------------------------------------------- escala --- */

function pintarEscala() {
  const alvo = $("escalaGrade");
  alvo.replaceChildren();

  estado.patentes.forEach((p, i) => {
    // O intervalo de índice que cai nesta patente.
    const de = Math.ceil((i / (estado.patentes.length - 1)) * 99);
    const ate = i === estado.patentes.length - 1 ? 100 : Math.ceil(((i + 1) / (estado.patentes.length - 1)) * 99) - 1;

    const exigencias = ["gridshot", "tracking", "flick", "linha"].map((modo) => {
      const m = MARCOS[modo];
      const alvoValor = valorParaIndice(modo, de);
      return `${NOMES_MODO[modo]} ${m.unidade(alvoValor)}`;
    });

    const cartao = elemento("div", { class: "escala__item chf" }, [
      selo(p, { grande: true }),
      elemento("div", { class: "escala__faixa", texto: `índice ${de}–${ate}` }),
      elemento("div", { class: "escala__exig", texto: exigencias.join(" · ") }),
    ]);
    alvo.append(cartao);
  });
}

/** Inverte os marcos: dado um índice, qual desempenho chega nele. */
function valorParaIndice(modo, indiceAlvo) {
  const m = MARCOS[modo];
  const p = m.pontos;
  const i = Math.max(0, Math.min(100, indiceAlvo));
  for (let k = 0; k < p.length - 1; k++) {
    const [v1, i1] = p[k];
    const [v2, i2] = p[k + 1];
    if (i >= i1 && i <= i2) {
      const t = i2 === i1 ? 0 : (i - i1) / (i2 - i1);
      return v1 + t * (v2 - v1);
    }
  }
  return p[p.length - 1][0];
}

/* ---------------------------------------------------------------- início -- */

async function iniciar() {
  const { conteudo } = await carregarConteudo();
  vestirPagina(conteudo, { aqui: "ranking.html", titulo: conteudo.ranking?.titulo ?? "Ranking" });
  await carregarConta();
  montarBotaoDeConta();

  const pintarCartoes = () => montarEscolhaDeCartoes($("cartoesArea"), {
    // Trocar de cartão muda o que a tabela mostra no passar do mouse.
    aoTrocar: () => { if (estado.tabela) pintarTabela(); },
  });
  pintarCartoes();

  aoMudarConta(() => {
    if (estado.tabela) pintarTabela();
    pintarCartoes();
  });

  const [patentes, tabela] = await Promise.allSettled([carregarPatentes(), carregarRanking()]);

  if (patentes.status === "fulfilled") {
    estado.patentes = patentesReais(patentes.value);
  } else {
    $("eloPainel").replaceChildren(elemento("p", { class: "carregando", texto: "Não foi possível carregar as patentes." }));
  }

  estado.tabela = tabela.status === "fulfilled" ? tabela.value : null;

  // A tabela acompanha quem publicar enquanto a página está aberta.
  setInterval(async () => {
    if (document.hidden) return;
    try {
      estado.tabela = await carregarRanking();
      pintarModos();
      pintarTabela();
    } catch { /* uma falha de rede não precisa apagar o que já está na tela */ }
  }, 60_000);

  pintarMeuElo();
  pintarModos();
  if (estado.tabela) pintarTabela();
  else $("rank").replaceChildren(elemento("p", { class: "carregando", texto: "O ranking não respondeu. Tente recarregar." }));
  if (estado.patentes.length) pintarEscala();
}

iniciar();
