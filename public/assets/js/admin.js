// Painel do Estande. Lê e grava /api/content, e gerencia a biblioteca de
// imagens em /api/media. Nada aqui tem lógica de apresentação do site: o painel
// só edita o JSON que o site consome.

import { carregarMapas, carregarAgentes, carregarTatica } from "./api.js";
import { montarMinimapa, pontosDoMapa, rotuloDoPonto } from "./minimapa.js";

const $ = (id) => document.getElementById(id);
const CHAVE_SESSAO = "estande.chave";

const estado = {
  chave: "",
  conteudo: null,
  midia: [],
  sujo: false,
};

/* ========================================================== requisições == */

async function api(caminho, opcoes = {}) {
  const r = await fetch(caminho, {
    ...opcoes,
    headers: { ...(opcoes.headers ?? {}), "x-admin-key": estado.chave },
  });
  const tipo = r.headers.get("content-type") ?? "";
  const corpo = tipo.includes("json") ? await r.json() : await r.text();
  if (!r.ok) throw new Error((corpo && corpo.erro) || `${r.status} ${r.statusText}`);
  return corpo;
}

function avisar(mensagem, tipo = "") {
  const el = $("estado");
  el.textContent = mensagem;
  el.dataset.tipo = tipo;
  if (tipo === "ok") setTimeout(() => { if (el.textContent === mensagem) el.textContent = ""; }, 5000);
}

function marcarSujo() {
  estado.sujo = true;
  avisar("Alterações não publicadas.");
}

window.addEventListener("beforeunload", (ev) => {
  if (estado.sujo) { ev.preventDefault(); ev.returnValue = ""; }
});

/* =============================================== caminhos dentro do JSON = */

function obter(rota) {
  return rota.split(".").reduce((o, k) => (o == null ? undefined : o[k]), estado.conteudo);
}

function definir(rota, valor) {
  const partes = rota.split(".");
  const chave = partes.pop();
  let alvo = estado.conteudo;
  for (const p of partes) {
    if (typeof alvo[p] !== "object" || alvo[p] === null) alvo[p] = {};
    alvo = alvo[p];
  }
  alvo[chave] = valor;
  marcarSujo();
}

/* ========================================================== construtores = */

function elemento(tag, props = {}, filhos = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k === "texto") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...[].concat(filhos).filter(Boolean));
  return el;
}

function rotulado(rotulo, controle, dica) {
  return elemento("label", { class: "campo" }, [
    elemento("span", { texto: rotulo }),
    controle,
    dica ? elemento("small", { texto: dica }) : null,
  ]);
}

/* -------------------------------------------------------------- entradas -- */

function entradaTexto({ rotulo, rota, dica, tipo = "text", obj, chave }) {
  const valor = obj ? obj[chave] : obter(rota);
  const input = elemento("input", { type: tipo, value: valor ?? "" });
  input.addEventListener("input", () => {
    if (obj) { obj[chave] = input.value; marcarSujo(); }
    else definir(rota, input.value);
  });
  return rotulado(rotulo, input, dica);
}

function entradaArea({ rotulo, rota, dica, obj, chave, linhas = 4 }) {
  const valor = obj ? obj[chave] : obter(rota);
  const ta = elemento("textarea", { rows: linhas });
  ta.value = valor ?? "";
  ta.addEventListener("input", () => {
    if (obj) { obj[chave] = ta.value; marcarSujo(); }
    else definir(rota, ta.value);
  });
  return rotulado(rotulo, ta, dica);
}

function entradaNumero({ rotulo, rota, dica, obj, chave, min, max, passo = 1 }) {
  const valor = obj ? obj[chave] : obter(rota);
  const input = elemento("input", { type: "number", value: valor ?? 0, min, max, step: passo });
  input.addEventListener("input", () => {
    const n = input.value === "" ? 0 : Number(input.value);
    if (obj) { obj[chave] = n; marcarSujo(); }
    else definir(rota, n);
  });
  return rotulado(rotulo, input, dica);
}

function entradaData({ rotulo, obj, chave, dica }) {
  const input = elemento("input", { type: "date", value: obj[chave] ?? "" });
  input.addEventListener("input", () => { obj[chave] = input.value; marcarSujo(); });
  return rotulado(rotulo, input, dica);
}

function entradaBooleano({ rotulo, obj, chave }) {
  const input = elemento("input", { type: "checkbox" });
  input.checked = Boolean(obj[chave]);
  input.addEventListener("change", () => { obj[chave] = input.checked; marcarSujo(); });
  return elemento("label", { class: "caixa-sim" }, [input, elemento("span", { texto: rotulo })]);
}

function entradaCor({ rotulo, rota, dica }) {
  const atual = obter(rota) ?? "#000000";
  const seletor = elemento("input", { type: "color", value: atual });
  const texto = elemento("input", { type: "text", value: atual, maxlength: 7, size: 9 });

  const sincronizar = (valor, origem) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(valor)) return;
    definir(rota, valor.toUpperCase());
    if (origem !== seletor) seletor.value = valor;
    if (origem !== texto) texto.value = valor.toUpperCase();
  };
  seletor.addEventListener("input", () => sincronizar(seletor.value, seletor));
  texto.addEventListener("input", () => sincronizar(texto.value.trim(), texto));

  return rotulado(rotulo, elemento("div", { class: "cor" }, [seletor, texto]), dica);
}

/**
 * Campo de imagem: URL colada, envio direto ou escolha da biblioteca.
 *
 * `local` é para quem guarda o valor fora do conteúdo do site (o editor de
 * pontos de mapa grava na própria rota). Sem ele, mexer no campo acenderia o
 * "Alterações não publicadas" e o aviso de sair da página, sem nada a publicar.
 */
function entradaImagem({ rotulo, rota, obj, chave, dica, local = false }) {
  const ler = () => (obj ? obj[chave] : obter(rota)) ?? "";
  const gravar = (v) => {
    if (obj) { obj[chave] = v; if (!local) marcarSujo(); } else definir(rota, v);
  };

  const previa = elemento("div", { class: "img-campo__previa" });
  const input = elemento("input", { type: "text", value: ler(), placeholder: "/api/media/… ou https://…" });

  function pintarPrevia() {
    previa.replaceChildren();
    const v = input.value.trim();
    if (!v) { previa.append(elemento("span", { texto: "sem\nimagem" })); return; }
    if (/^(https?:|\/)/.test(v)) {
      const img = elemento("img", { src: v, alt: "" });
      img.addEventListener("error", () => {
        previa.replaceChildren(elemento("span", { texto: "não\ncarregou" }));
      });
      previa.append(img);
    } else {
      // Serve para ícones em texto, tipo um símbolo.
      previa.append(elemento("span", { texto: v.slice(0, 3) }));
    }
  }

  input.addEventListener("input", () => { gravar(input.value.trim()); pintarPrevia(); });

  const enviar = elemento("input", { type: "file", accept: "image/*" });
  enviar.style.display = "none";
  enviar.addEventListener("change", async () => {
    const arquivo = enviar.files?.[0];
    if (!arquivo) return;
    try {
      avisar(`Enviando ${arquivo.name}…`);
      const r = await enviarArquivo(arquivo);
      input.value = r.url;
      gravar(r.url);
      pintarPrevia();
      avisar("Imagem enviada.", "ok");
    } catch (e) {
      avisar(e.message, "erro");
    } finally {
      enviar.value = "";
    }
  });

  const linha = elemento("div", { class: "img-campo__linha" }, [
    previa,
    elemento("div", { style: "flex:1;display:grid;gap:.35rem" }, [
      input,
      elemento("div", { style: "display:flex;gap:.35rem;flex-wrap:wrap" }, [
        elemento("button", {
          class: "btn btn--mini chf", type: "button", texto: "Enviar arquivo",
          onclick: () => enviar.click(),
        }),
        elemento("button", {
          class: "btn btn--mini chf", type: "button", texto: "Da biblioteca",
          onclick: () => abrirEscolher((url) => { input.value = url; gravar(url); pintarPrevia(); }),
        }),
        elemento("button", {
          class: "btn btn--mini chf", type: "button", texto: "Limpar",
          onclick: () => { input.value = ""; gravar(""); pintarPrevia(); },
        }),
      ]),
      enviar,
    ]),
  ]);

  pintarPrevia();
  return rotulado(rotulo, linha, dica);
}

/* ---------------------------------------------------- editor de listas --- */

/**
 * Lista editável genérica. `campos` descreve cada item; `titulo` monta o rótulo
 * da linha recolhida.
 */
function editorLista({ rota, campos, titulo, novo, rotuloNovo }) {
  const caixa = elemento("div", { class: "lista" });

  function pintar() {
    const lista = obter(rota);
    if (!Array.isArray(lista)) { definir(rota, []); return pintar(); }
    caixa.replaceChildren();

    if (!lista.length) {
      caixa.append(elemento("p", { class: "lista__vazia", texto: "Nada aqui ainda." }));
    }

    lista.forEach((item, i) => {
      const corpo = elemento("div", { class: "item__corpo" });
      for (const campo of campos) {
        const comum = { rotulo: campo.rotulo, obj: item, chave: campo.chave, dica: campo.dica };
        if (campo.tipo === "area") corpo.append(entradaArea({ ...comum, linhas: campo.linhas }));
        else if (campo.tipo === "numero") corpo.append(entradaNumero({ ...comum, min: campo.min, max: campo.max }));
        else if (campo.tipo === "data") corpo.append(entradaData(comum));
        else if (campo.tipo === "booleano") corpo.append(entradaBooleano(comum));
        else if (campo.tipo === "imagem") corpo.append(entradaImagem(comum));
        else if (campo.tipo === "dupla") {
          corpo.append(elemento("div", { class: "dupla" }, campo.campos.map((sub) =>
            entradaTexto({ rotulo: sub.rotulo, obj: item, chave: sub.chave, tipo: sub.tipo ?? "text", dica: sub.dica }))));
        } else corpo.append(entradaTexto({ ...comum, tipo: campo.tipo ?? "text" }));
      }

      const mover = (delta) => {
        const j = i + delta;
        if (j < 0 || j >= lista.length) return;
        [lista[i], lista[j]] = [lista[j], lista[i]];
        marcarSujo();
        pintar();
      };

      caixa.append(elemento("div", { class: "item chf" }, [
        elemento("div", { class: "item__topo" }, [
          elemento("span", { class: "item__ordem", texto: String(i + 1).padStart(2, "0") }),
          elemento("span", { class: "item__titulo", texto: titulo(item) || "(sem título)" }),
          elemento("button", { class: "btn btn--mini chf", type: "button", texto: "↑", "aria-label": "Mover para cima", onclick: () => mover(-1) }),
          elemento("button", { class: "btn btn--mini chf", type: "button", texto: "↓", "aria-label": "Mover para baixo", onclick: () => mover(1) }),
          elemento("button", {
            class: "btn btn--mini btn--perigo chf", type: "button", texto: "Remover",
            onclick: () => {
              if (!confirm(`Remover "${titulo(item) || "este item"}"?`)) return;
              lista.splice(i, 1);
              marcarSujo();
              pintar();
            },
          }),
        ]),
        corpo,
      ]));
    });

    caixa.append(elemento("button", {
      class: "btn btn--latao chf", type: "button", texto: rotuloNovo,
      onclick: () => { obter(rota).push(structuredClone(novo)); marcarSujo(); pintar(); },
    }));
  }

  pintar();
  return caixa;
}

/* ================================================= biblioteca de imagens = */

async function enviarArquivo(arquivo) {
  const forma = new FormData();
  forma.append("file", arquivo);
  const r = await api("/api/media", { method: "POST", body: forma });
  await recarregarMidia();
  return r;
}

async function recarregarMidia() {
  try {
    const { itens } = await api("/api/media");
    estado.midia = itens;
  } catch (e) {
    console.warn("Biblioteca indisponível:", e.message);
    estado.midia = [];
  }
}

function tamanhoLegivel(bytes) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function cartaoArquivo(item, aoEscolher) {
  const previa = elemento("div", { class: "arquivo__previa" }, [elemento("img", { src: item.url, alt: "", loading: "lazy" })]);
  const acoes = elemento("div", { class: "arquivo__acoes" });

  if (aoEscolher) {
    acoes.append(elemento("button", {
      class: "btn btn--mini btn--forte chf", type: "button", texto: "Usar",
      onclick: () => aoEscolher(item.url),
    }));
  } else {
    acoes.append(
      elemento("button", {
        class: "btn btn--mini chf", type: "button", texto: "Copiar URL",
        onclick: async () => {
          try { await navigator.clipboard.writeText(item.url); avisar("URL copiada.", "ok"); }
          catch { avisar("Não foi possível copiar. A URL é " + item.url, "erro"); }
        },
      }),
      elemento("button", {
        class: "btn btn--mini btn--perigo chf", type: "button", texto: "Apagar",
        onclick: async () => {
          if (!confirm(`Apagar "${item.nome}"? Onde ela estiver usada, a imagem deixa de aparecer.`)) return;
          try {
            await api(`/api/media/${encodeURIComponent(item.chave)}`, { method: "DELETE" });
            await recarregarMidia();
            pintarAbaAtual();
            avisar("Arquivo apagado.", "ok");
          } catch (e) { avisar(e.message, "erro"); }
        },
      }),
    );
  }

  return elemento("div", { class: "arquivo chf" }, [
    previa,
    elemento("div", { class: "arquivo__nome", texto: item.nome, title: item.nome }),
    elemento("div", { class: "arquivo__meta", texto: [tamanhoLegivel(item.tamanho), item.tipo?.replace("image/", "")].filter(Boolean).join(" · ") }),
    acoes,
  ]);
}

function abrirEscolher(aoEscolher) {
  const dialogo = $("escolher");
  const grade = $("escolherGrade");
  grade.replaceChildren();

  if (!estado.midia.length) {
    grade.append(elemento("p", { class: "lista__vazia", texto: "A biblioteca está vazia. Envie imagens na aba Mídia." }));
  }
  for (const item of estado.midia) {
    grade.append(cartaoArquivo(item, (url) => { aoEscolher(url); dialogo.close(); }));
  }
  dialogo.showModal();
}

$("escolherFechar").addEventListener("click", () => $("escolher").close());

function painelMidia() {
  const entrada = elemento("input", { type: "file", accept: "image/*", multiple: true });
  entrada.style.display = "none";

  async function receber(arquivos) {
    for (const arquivo of arquivos) {
      try {
        avisar(`Enviando ${arquivo.name}…`);
        await enviarArquivo(arquivo);
      } catch (e) {
        avisar(`${arquivo.name}: ${e.message}`, "erro");
        return;
      }
    }
    avisar(`${arquivos.length} ${arquivos.length === 1 ? "arquivo enviado" : "arquivos enviados"}.`, "ok");
    pintarAbaAtual();
  }

  entrada.addEventListener("change", () => { receber([...entrada.files]); entrada.value = ""; });

  const zona = elemento("div", { class: "zona chf" }, [
    elemento("p", { texto: "Arraste imagens aqui, ou escolha os arquivos. Até 4 MB cada — PNG, JPG, WEBP, GIF, AVIF, SVG e ICO." }),
    elemento("div", { style: "margin-top:.875rem" }, [
      elemento("button", { class: "btn btn--forte chf", type: "button", texto: "Escolher arquivos", onclick: () => entrada.click() }),
    ]),
    entrada,
  ]);

  for (const evento of ["dragenter", "dragover"]) {
    zona.addEventListener(evento, (ev) => { ev.preventDefault(); zona.dataset.sobre = "sim"; });
  }
  for (const evento of ["dragleave", "drop"]) {
    zona.addEventListener(evento, () => { delete zona.dataset.sobre; });
  }
  zona.addEventListener("drop", (ev) => {
    ev.preventDefault();
    const arquivos = [...(ev.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
    if (arquivos.length) receber(arquivos);
  });

  const grade = elemento("div", { class: "biblioteca" });
  if (!estado.midia.length) {
    grade.append(elemento("p", { class: "lista__vazia", texto: "Nenhuma imagem enviada ainda." }));
  }
  for (const item of estado.midia) grade.append(cartaoArquivo(item, null));

  return [
    bloco("Enviar imagens", "Tudo que você enviar fica guardado no Netlify Blobs e pode ser usado em qualquer campo de imagem ou ícone do site.", [zona]),
    bloco(`Biblioteca (${estado.midia.length})`, "As URLs são permanentes: a imagem nunca muda de endereço depois de enviada.", [grade]),
  ];
}

/* ====================================================== abas e esquema === */

/**
 * Mostra o que a curva significa em sessões de treino, não em XP cru.
 *
 * "Custo fixo 1600" não diz nada para quem vai decidir; "o nível 10 pede umas
 * oito sessões" diz. A conta usa uma sessão média — o XP base mais metade do
 * bônus — porque é o que uma pessoa comum tira.
 */
function previaDaCurva() {
  const caixa = elemento("div", { class: "bloco__nota" });

  const pintar = () => {
    const n = obter("niveis") ?? {};
    const base = Number(n.xpBase) || 0;
    const porIndice = Number(n.xpPorIndice) || 0;
    const custoInicial = Number(n.custoInicial) || 0;
    const degrau = Number(n.degrau) || 0;
    const degraus = Number(n.degraus) || 0;
    const custoFixo = Number(n.custoFixo) || 0;

    const porSessao = base + porIndice * 50;
    if (porSessao <= 0 || custoInicial <= 0) {
      caixa.textContent = "Com estes números ninguém sobe de nível.";
      return;
    }

    const custo = (nivel) => (nivel <= degraus ? custoInicial + (nivel - 1) * degrau : custoFixo);
    const linhas = [];
    let acumulado = 0;
    for (let nivel = 1; nivel <= 20; nivel++) {
      acumulado += custo(nivel);
      if ([1, 4, 9, 19].includes(nivel)) {
        linhas.push(`nível ${nivel + 1} em ~${Math.ceil(acumulado / porSessao)} sessões`);
      }
    }
    caixa.textContent =
      `Com uma sessão média valendo ${Math.round(porSessao)} XP: ${linhas.join(", ")}.`;
  };

  pintar();
  // Repinta quando qualquer número da aba muda. O ouvinte fica no painel, que
  // é trocado inteiro a cada mudança de aba — então não sobra ouvinte solto.
  setTimeout(() => (caixa.closest(".painel") ?? caixa).addEventListener("input", pintar), 0);
  return caixa;
}

/**
 * Espelho de `NIVEIS_PADRAO` em `netlify/lib/progresso.mts`. Mexeu lá, mexa
 * aqui: o painel precisa mostrar o que o servidor vai usar de verdade, e não
 * dá para importar um .mts do navegador.
 */
const NIVEIS_PADRAO = {
  xpBase: 60,
  xpPorIndice: 1.8,
  custoInicial: 400,
  degrau: 300,
  degraus: 4,
  custoFixo: 1600,
  cartoesACada: 2,
  xpPorDia: 15000,
  janelaSegundos: 15,
  mostrarNoRanking: true,
  cartaoNoHover: true,
  trocaDeCartaoLiberada: true,
  cartaoPadraoUuid: "",
};

function bloco(titulo, nota, filhos) {
  return elemento("section", { class: "bloco chf" }, [
    elemento("h2", { texto: titulo }),
    nota ? elemento("p", { class: "bloco__nota", texto: nota }) : null,
    elemento("div", { class: "bloco__corpo" }, filhos),
  ]);
}

const ABAS = [
  {
    id: "identidade",
    rotulo: "Identidade",
    montar: () => [
      bloco("Nome e descrição", "O nome aparece no trilho lateral; a descrição vai na aba do navegador e nas prévias de link.", [
        elemento("div", { class: "dupla" }, [
          entradaTexto({ rotulo: "Nome do site", rota: "site.nome" }),
          entradaTexto({ rotulo: "Sufixo (ao lado do nome)", rota: "site.sufixo", dica: "Curto, tipo BR." }),
        ]),
        entradaTexto({ rotulo: "Tagline", rota: "site.tagline" }),
        entradaArea({ rotulo: "Descrição para busca e compartilhamento", rota: "site.descricao" }),
      ]),
      bloco("Logo e favicon", "Com um logo definido, ele substitui o nome em texto no trilho.", [
        entradaImagem({ rotulo: "Logo", rota: "site.logoUrl" }),
        entradaImagem({ rotulo: "Favicon", rota: "site.favicon", dica: "Um PNG ou ICO quadrado, de preferência 32×32." }),
      ]),
    ],
  },
  {
    id: "tema",
    rotulo: "Tema",
    montar: () => [
      bloco("Cores", "Seis cores sustentam todo o site. Aço é o fundo, sinal é o alvo e o que está ao vivo, latão é recorde e ato. Mudanças aqui valem para o site inteiro.", [
        elemento("div", { class: "dupla" }, [
          entradaCor({ rotulo: "Aço (fundo das seções)", rota: "tema.aco" }),
          entradaCor({ rotulo: "Aço alto (painéis)", rota: "tema.acoAlto" }),
          entradaCor({ rotulo: "Linha (bordas)", rota: "tema.linha" }),
          entradaCor({ rotulo: "Luz (texto)", rota: "tema.luz" }),
          entradaCor({ rotulo: "Sinal (alvos, ao vivo)", rota: "tema.sinal" }),
          entradaCor({ rotulo: "Latão (recorde, ato)", rota: "tema.latao" }),
        ]),
        elemento("p", { class: "recado chf" }, [
          elemento("strong", { texto: "Antes de trocar: " }),
          document.createTextNode("o site foi desenhado com texto claro sobre fundo escuro. Se você clarear o aço sem escurecer a luz, o texto fica ilegível."),
        ]),
      ]),
    ],
  },
  {
    id: "hero",
    rotulo: "Abertura",
    montar: () => [
      bloco("Abertura", "A primeira tela. Os cinco alvos de calibração ficam ao lado deste texto.", [
        entradaTexto({ rotulo: "Título", rota: "hero.titulo" }),
        entradaArea({ rotulo: "Texto de apoio", rota: "hero.texto" }),
        entradaImagem({ rotulo: "Imagem de fundo", rota: "hero.imagemFundo", dica: "Aparece esmaecida atrás do título. Horizontal e grande funciona melhor." }),
      ]),
      bloco("Botões da abertura", null, [
        elemento("div", { class: "dupla" }, [
          entradaTexto({ rotulo: "Botão principal — texto", rota: "hero.ctaPrimario.rotulo" }),
          entradaTexto({ rotulo: "Botão principal — destino", rota: "hero.ctaPrimario.href" }),
          entradaTexto({ rotulo: "Botão secundário — texto", rota: "hero.ctaSecundario.rotulo" }),
          entradaTexto({ rotulo: "Botão secundário — destino", rota: "hero.ctaSecundario.href" }),
        ]),
        entradaTexto({ rotulo: "Texto do botão de recalibrar", rota: "hero.rotuloRefazer" }),
      ]),
    ],
  },
  {
    id: "nav",
    rotulo: "Navegação",
    montar: () => [
      bloco("Trilho lateral", "A ordem aqui é a ordem no trilho. O destino começa com # para ir a uma seção desta página.", [
        editorLista({
          rota: "nav",
          campos: [{ tipo: "dupla", campos: [{ rotulo: "Rótulo", chave: "rotulo" }, { rotulo: "Destino", chave: "href" }] }],
          titulo: (i) => i.rotulo,
          novo: { rotulo: "Nova seção", href: "#estande" },
          rotuloNovo: "Adicionar item de navegação",
        }),
      ]),
    ],
  },
  {
    id: "estande",
    rotulo: "Estande",
    montar: () => [
      bloco("Cabeçalho da seção", null, [
        entradaTexto({ rotulo: "Título", rota: "estande.titulo" }),
        entradaArea({ rotulo: "Texto", rota: "estande.texto", linhas: 2 }),
      ]),
      bloco("Exercícios", "O identificador define qual exercício roda: gridshot, tracking ou flick. Os outros campos são livres. O marcado como destaque abre primeiro e ocupa o cartão maior.", [
        editorLista({
          rota: "modos",
          campos: [
            { tipo: "dupla", campos: [
              { rotulo: "Identificador", chave: "id", dica: "gridshot, tracking ou flick" },
              { rotulo: "Nome", chave: "nome" },
            ] },
            { tipo: "dupla", campos: [
              { rotulo: "Objetivo (linha curta)", chave: "objetivo" },
              { rotulo: "Nome da métrica", chave: "metrica" },
            ] },
            { tipo: "area", rotulo: "Descrição", chave: "descricao", linhas: 3 },
            { tipo: "imagem", rotulo: "Ícone", chave: "icone", dica: "Uma imagem, ou um símbolo em texto como ◎." },
            { tipo: "numero", rotulo: "Duração em segundos", chave: "duracao", min: 0, max: 300 },
            { tipo: "booleano", rotulo: "Destacar este exercício", chave: "destaque" },
          ],
          titulo: (i) => i.nome,
          novo: { id: "gridshot", nome: "Novo exercício", objetivo: "", descricao: "", icone: "", duracao: 30, metrica: "", destaque: false },
          rotuloNovo: "Adicionar exercício",
        }),
      ]),
    ],
  },
  {
    id: "lancamentos",
    rotulo: "Lançamentos",
    montar: () => [
      bloco("Cabeçalho da seção", null, [
        entradaTexto({ rotulo: "Título", rota: "lancamentos.titulo" }),
        entradaArea({ rotulo: "Texto", rota: "lancamentos.texto", linhas: 2 }),
      ]),
      bloco("Publicações", "O site ordena pela data, do mais recente para o mais antigo — a ordem desta lista não importa para a exibição.", [
        editorLista({
          rota: "lancamentos.itens",
          campos: [
            { tipo: "dupla", campos: [{ rotulo: "Tipo", chave: "tipo", dica: "Patch, Ato, Mapa, Agente, Coleção…" }] },
            { tipo: "data", rotulo: "Data", chave: "data" },
            { tipo: "texto", rotulo: "Título", chave: "titulo" },
            { tipo: "area", rotulo: "Resumo", chave: "resumo", linhas: 3 },
            { tipo: "texto", rotulo: "Link", chave: "link", dica: "Opcional. Com link, o item inteiro fica clicável." },
            { tipo: "imagem", rotulo: "Imagem", chave: "imagem" },
          ],
          titulo: (i) => `${i.data ? i.data + " — " : ""}${i.titulo ?? ""}`,
          novo: { data: new Date().toISOString().slice(0, 10), tipo: "Patch", titulo: "", resumo: "", link: "", imagem: "" },
          rotuloNovo: "Adicionar publicação",
        }),
      ]),
    ],
  },
  {
    id: "catalogo",
    rotulo: "Catálogo",
    montar: () => [
      bloco("Agentes e mapas", "Esses blocos vêm da valorant-api.com em português e se atualizam sozinhos. Aqui você só mexe nos títulos e em quem aparece primeiro.", [
        entradaTexto({ rotulo: "Título da seção de agentes", rota: "agentes.titulo" }),
        entradaArea({ rotulo: "Texto da seção de agentes", rota: "agentes.texto", linhas: 2 }),
        entradaTexto({ rotulo: "Título da seção de mapas", rota: "mapas.titulo" }),
        entradaArea({ rotulo: "Texto da seção de mapas", rota: "mapas.texto", linhas: 2 }),
      ]),
      bloco("Em destaque", "Cole o UUID para fixar um agente ou mapa no começo da grade. Deixe vazio para ordem alfabética.", [
        elemento("div", { class: "dupla" }, [
          entradaTexto({ rotulo: "UUID do agente", rota: "destaques.agenteUuid" }),
          entradaTexto({ rotulo: "UUID do mapa", rota: "destaques.mapaUuid" }),
        ]),
        elemento("p", { class: "bloco__nota" }, [
          document.createTextNode("Os UUIDs estão em "),
          elemento("a", { href: "https://valorant-api.com/v1/agents?language=pt-BR", target: "_blank", rel: "noopener", texto: "valorant-api.com/v1/agents" }),
          document.createTextNode(" e /v1/maps."),
        ]),
      ]),
      bloco("Contador de presença", "Em “real” o site mostra a contagem de verdade: quem está com a aba aberta agora e quantas pessoas passaram nas últimas 24 horas. Em “fixo” ele mostra o número e o rótulo que você escrever aqui — como em qualquer campo deste painel, o que vai para a tela é o que você decidir.", [
        elemento("div", { class: "dupla" }, [
          (() => {
            const sel = elemento("select");
            for (const [v, r] of [["real", "Contagem real"], ["fixo", "Número fixo"]]) {
              const op = elemento("option", { value: v, texto: r });
              if ((obter("presenca.modo") ?? "real") === v) op.selected = true;
              sel.append(op);
            }
            sel.addEventListener("change", () => definir("presenca.modo", sel.value));
            return rotulado("Modo", sel);
          })(),
          entradaNumero({ rotulo: "Número fixo", rota: "presenca.valor", min: 0, max: 100000 }),
        ]),
        elemento("div", { class: "dupla" }, [
          entradaTexto({ rotulo: "Rótulo no modo fixo", rota: "presenca.rotulo", dica: "Ex.: Na comunidade." }),
          entradaTexto({ rotulo: "Nota no modo fixo", rota: "presenca.nota", dica: "Opcional, abaixo do número." }),
        ]),
        entradaBooleano({ rotulo: "No modo real, mostrar também “pessoas hoje”", obj: estado.conteudo.presenca ?? (estado.conteudo.presenca = {}), chave: "mostrarHoje" }),
      ]),
      bloco("Quantas pessoas jogam VALORANT", "A Riot não publica esse número — não existe API de jogadores online, nem oficial nem de terceiros confiável. O contador de quem está no site é real e automático; este aqui é o que você escrever. Deixe vazio para não mostrar nada, e sempre informe a fonte e a data.", [
        elemento("div", { class: "dupla" }, [
          entradaTexto({ rotulo: "Rótulo", rota: "jogadores.rotulo" }),
          entradaTexto({ rotulo: "Número", rota: "jogadores.valor", dica: "Ex.: 28 milhões. Vazio esconde o bloco." }),
        ]),
        entradaTexto({ rotulo: "O que o número mede", rota: "jogadores.nota", dica: "Ex.: jogadores por mês no mundo." }),
        entradaTexto({ rotulo: "Fonte e data", rota: "jogadores.fonte", dica: "Ex.: Riot Games, jan/2026." }),
      ]),
      bloco("Seção ao vivo", "O conteúdo é lido dos servidores da Riot; só os textos de cabeçalho são seus.", [
        entradaTexto({ rotulo: "Título", rota: "aovivo.titulo" }),
        entradaArea({ rotulo: "Texto", rota: "aovivo.texto", linhas: 2 }),
      ]),
    ],
  },
  {
    id: "rodape",
    rotulo: "Rodapé",
    montar: () => [
      bloco("Textos do rodapé", null, [
        entradaArea({ rotulo: "Texto", rota: "rodape.texto", linhas: 3 }),
        entradaArea({ rotulo: "Aviso legal", rota: "rodape.aviso", linhas: 3 }),
      ]),
      bloco("Links", null, [
        editorLista({
          rota: "links",
          campos: [{ tipo: "dupla", campos: [{ rotulo: "Rótulo", chave: "rotulo" }, { rotulo: "URL", chave: "url", tipo: "url" }] }],
          titulo: (i) => i.rotulo,
          novo: { rotulo: "Novo link", url: "https://" },
          rotuloNovo: "Adicionar link",
        }),
      ]),
    ],
  },
  {
    id: "noticias",
    rotulo: "Notícias",
    montar: () => [
      bloco("Coleta automática", "Uma função agendada lê playvalorant.com/pt-br/news de duas em duas horas e guarda o resultado. Você não precisa fazer nada — estes campos só mudam como ele aparece.", [
        entradaTexto({ rotulo: "Título da seção", rota: "noticias.titulo" }),
        entradaArea({ rotulo: "Texto da seção", rota: "noticias.texto", linhas: 2 }),
        entradaNumero({ rotulo: "Quantas notícias oficiais mostrar", rota: "noticias.quantidade", min: 1, max: 60 }),
      ]),
      bloco("Esconder categorias", "Marque o que não quer no feed. O que você publica à mão nunca é escondido.", [
        caixasCategorias(),
      ]),
      bloco("Como está agora", null, [elemento("div", { id: "estadoNoticias" }, [
        elemento("p", { class: "lista__vazia", texto: "Consultando…" }),
      ])]),
    ],
  },
  {
    id: "arsenal",
    rotulo: "Arsenal",
    montar: () => [
      bloco("Textos da página", null, [
        entradaTexto({ rotulo: "Título", rota: "arsenal.titulo" }),
        entradaArea({ rotulo: "Texto", rota: "arsenal.texto", linhas: 2 }),
      ]),
      bloco("Preço por raridade, em VP", "A Riot não publica preço por API. Estes são os valores de tabela de skin avulsa — se a Riot reajustar, é aqui que você corrige.", [
        elemento("div", { class: "dupla" }, [
          entradaNumero({ rotulo: "Edição Selecionada (Select)", rota: "arsenal.precos.Select", min: 0, max: 20000 }),
          entradaNumero({ rotulo: "Edição Deluxe", rota: "arsenal.precos.Deluxe", min: 0, max: 20000 }),
          entradaNumero({ rotulo: "Edição Premium", rota: "arsenal.precos.Premium", min: 0, max: 20000 }),
          entradaNumero({ rotulo: "Edição Exclusiva (Exclusive)", rota: "arsenal.precos.Exclusive", min: 0, max: 20000 }),
          entradaNumero({ rotulo: "Edição Ultra", rota: "arsenal.precos.Ultra", min: 0, max: 20000 }),
        ]),
      ]),
      bloco("Corpo a corpo", "Faca não segue a tabela da arma: na loja ela sai pelo dobro da mesma raridade.", [
        entradaNumero({ rotulo: "Multiplicador para facas", rota: "arsenal.multiplicadorCorpoACorpo", min: 1, max: 10, passo: 0.5 }),
      ]),
      bloco("Conversão para reais", "Quantos VP o jogador recebe por real. O pacote de 1000 VP sai por R$ 40, o que dá 25. O site mostra o valor como aproximado.", [
        elemento("div", { class: "dupla" }, [
          entradaNumero({ rotulo: "VP por real", rota: "arsenal.vpPorReal", min: 1, max: 200 }),
          entradaTexto({ rotulo: "Símbolo da moeda", rota: "arsenal.moeda" }),
        ]),
      ]),
    ],
  },
  {
    id: "linha",
    rotulo: "Linha de Tiro",
    montar: () => [
      bloco("Textos da página", null, [
        entradaTexto({ rotulo: "Título", rota: "linha.titulo" }),
        entradaArea({ rotulo: "Texto", rota: "linha.texto", linhas: 3 }),
      ]),
      bloco("Rodada", "A arma e o agente iniciais são o que aparece selecionado quando alguém abre a página.", [
        entradaNumero({ rotulo: "Duração em segundos", rota: "linha.duracao", min: 15, max: 300 }),
        entradaTexto({
          rotulo: "Música da tela de entrada",
          rota: "linha.musicaUrl",
          dica: "Caminho ou URL de um MP3. Vazio usa assets/audio/carregamento.mp3. Falhando o arquivo, o som sintetizado assume.",
        }),
        entradaImagem({
          rotulo: "Fundo do campo",
          rota: "linha.fundoUrl",
          dica: "Vazio usa a foto que vem no projeto. O balcão do estande é recortado dos 64% de baixo da imagem e redesenhado na frente dos bonecos.",
        }),
        elemento("div", { class: "dupla" }, [
          entradaTexto({ rotulo: "UUID do agente inicial", rota: "linha.agentePadraoUuid", dica: "Vazio: o primeiro da lista." }),
          entradaTexto({ rotulo: "UUID da arma inicial", rota: "linha.armaPadraoUuid", dica: "Vazio: a Vandal." }),
        ]),
      ]),
    ],
  },
  {
    id: "niveis",
    rotulo: "Níveis",
    montar: () => {
      // Conteúdo salvo antes desta aba existir não traz o bloco `niveis`, ou
      // traz só parte dele. Sem preencher o que falta, o painel mentiria: os
      // números apareceriam como zero e as caixas como desmarcadas, enquanto
      // o servidor segue usando o padrão. Pior, salvar assim gravaria esse
      // zero e esse "não" — desligando no ranking o que estava ligado.
      if (!obter("niveis") || typeof obter("niveis") !== "object") definir("niveis", {});
      const niveis = obter("niveis");
      for (const [chave, valor] of Object.entries(NIVEIS_PADRAO)) {
        if (niveis[chave] === undefined) niveis[chave] = valor;
      }

      return [
      bloco(
        "Quanto vale uma sessão",
        "Todo treino terminado dá XP, em qualquer um dos quatro exercícios e mesmo com o envio ao ranking desligado — o nível é da pessoa, a tabela é do público.",
        [
          elemento("div", { class: "dupla" }, [
            entradaNumero({
              rotulo: "XP base por sessão", rota: "niveis.xpBase", min: 0, max: 5000,
              dica: "Vale por ter terminado, independente de ter ido bem.",
            }),
            entradaNumero({
              rotulo: "XP por ponto de elo", rota: "niveis.xpPorIndice", min: 0, max: 100, passo: 0.1,
              dica: "Multiplicado pelo índice de 0 a 100 da sessão. Com 1,8 uma sessão boa rende perto de 240.",
            }),
          ]),
        ],
      ),
      bloco(
        "A curva",
        "Tem a forma da do VALORANT: os primeiros níveis sobem em degraus e depois o custo fica fixo. Os números são menores que os do jogo porque lá uma partida dura meia hora e aqui uma sessão dura trinta segundos.",
        [
          elemento("div", { class: "dupla" }, [
            entradaNumero({ rotulo: "Custo do nível 1", rota: "niveis.custoInicial", min: 50, max: 100000 }),
            entradaNumero({ rotulo: "Acréscimo por degrau", rota: "niveis.degrau", min: 0, max: 100000 }),
            entradaNumero({ rotulo: "Quantos níveis em degrau", rota: "niveis.degraus", min: 0, max: 200 }),
            entradaNumero({ rotulo: "Custo fixo depois", rota: "niveis.custoFixo", min: 50, max: 1000000 }),
          ]),
          previaDaCurva(),
        ],
      ),
      bloco(
        "O que aparece no ranking",
        "O nível e o cartão da pessoa na tabela pública. Desligar aqui não apaga nada: o XP continua contando e o perfil continua abrindo no clique — só some da tabela.",
        [
          entradaBooleano({ rotulo: "Nível e borda ao lado do apelido", obj: niveis, chave: "mostrarNoRanking" }),
          entradaBooleano({ rotulo: "Cartão do jogador ao passar o mouse", obj: niveis, chave: "cartaoNoHover" }),
          entradaBooleano({ rotulo: "A pessoa pode escolher qual cartão usa", obj: niveis, chave: "trocaDeCartaoLiberada" }),
        ],
      ),
      bloco(
        "Jogadores",
        "O nível e o elo de cada conta que já treinou. Mexer aqui corrige uma conta específica — a curva acima vale para todo mundo. O elo daqui é o da pessoa, que aparece no perfil e no cartão; o da aba Ranking é o de uma pontuação, linha por linha.",
        [elemento("div", { class: "lista", id: "modNiveis" }, [
          elemento("p", { class: "lista__vazia", texto: "Lendo os perfis…" }),
        ])],
      ),
      bloco(
        "Cartões e limites",
        "Os cartões são os de jogador do VALORANT, da Riot. Cada conta recebe uma sequência própria e estável: o que já foi dado nunca é trocado, mesmo que estes números mudem depois.",
        [
          elemento("div", { class: "dupla" }, [
            entradaNumero({
              rotulo: "Um cartão a cada N níveis", rota: "niveis.cartoesACada", min: 1, max: 100,
              dica: "Mudar isto não tira cartão de ninguém — só muda quando sai o próximo.",
            }),
            entradaNumero({
              rotulo: "Teto de XP por dia", rota: "niveis.xpPorDia", min: 100, max: 10000000,
              dica: "Segura um script rodando a noite toda. O treino continua valendo depois do teto; só o XP para.",
            }),
            entradaNumero({
              rotulo: "Espera entre sessões (s)", rota: "niveis.janelaSegundos", min: 0, max: 3600,
              dica: "A sessão mais curta que o site aceita dura dez segundos.",
            }),
          ]),
          entradaTexto({
            rotulo: "UUID do cartão padrão",
            rota: "niveis.cartaoPadraoUuid",
            dica: "O cartão de quem ainda não liberou nenhum. Vazio deixa o banner com fundo liso. Os UUIDs estão em valorant-api.com/v1/playercards.",
          }),
          elemento("p", { class: "recado chf" }, [
            elemento("strong", { texto: "O servidor confere: " }),
            document.createTextNode(
              "custo zero, janela zero e números fora de faixa são corrigidos para o padrão antes de valerem. " +
              "Nível e XP de quem já treinou não são recalculados: a curva nova vale do próximo ponto em diante, " +
              "então baixar o custo pode fazer gente subir vários níveis de uma vez."),
          ]),
        ],
      ),
      ];
    },
  },
  {
    id: "rankingAba",
    rotulo: "Ranking",
    montar: () => [
      bloco("Textos da página", null, [
        entradaTexto({ rotulo: "Título", rota: "ranking.titulo" }),
        entradaArea({ rotulo: "Texto", rota: "ranking.texto", linhas: 2 }),
      ]),
      bloco("Entradas de exemplo", "Para a tabela não abrir vazia enquanto ninguém publicou. Elas aparecem com a etiqueta “exemplo” na tabela pública, para não passarem por pontuação de gente — e saem todas de uma vez quando você quiser.", [
        elemento("div", { style: "display:flex;gap:.5rem;flex-wrap:wrap" }, [
          elemento("button", {
            class: "btn btn--latao chf", type: "button", texto: "Preencher com exemplos",
            onclick: async (ev) => {
              ev.currentTarget.disabled = true;
              try {
                const r = await api("/api/ranking", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ exemplos: true }),
                });
                avisar(`${r.gravados} entradas de exemplo criadas.`, "ok");
                mostrarRanking();
              } catch (e) { avisar(e.message, "erro"); }
              finally { ev.currentTarget && (ev.currentTarget.disabled = false); }
            },
          }),
          elemento("button", {
            class: "btn btn--perigo chf", type: "button", texto: "Apagar os exemplos",
            onclick: async (ev) => {
              if (!confirm("Apagar todas as entradas de exemplo?")) return;
              try {
                const r = await api("/api/ranking", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ limparExemplos: true }),
                });
                avisar(`${r.apagados} exemplos apagados.`, "ok");
                mostrarRanking();
              } catch (e) { avisar(e.message, "erro"); }
            },
          }),
        ]),
      ]),
      bloco("Moderação", "Publicar exige conta, então o apelido tem dono. Aqui você apaga entradas e muda o elo de alguém. Mudar o elo a mão deixa a entrada marcada como “ajustado” na tabela pública — sem isso o rótulo “elo estimado” passaria a mentir para quem lê.", [
        elemento("div", { id: "modRanking" }, [
          elemento("p", { class: "lista__vazia", texto: "Carregando o ranking…" }),
        ]),
      ]),
    ],
  },
  {
    id: "tatica",
    rotulo: "Tática",
    montar: () => [
      bloco("Marcar no minimapa", "Escolha o mapa e clique no minimapa. Um pixel leva dois cliques: onde a pessoa fica e onde a util cai. Uma posição leva um. Clicar num ponto já cadastrado abre ele para editar.", [
        elemento("div", { id: "tatMapa" }, [
          elemento("p", { class: "lista__vazia", texto: "Carregando os mapas…" }),
        ]),
      ]),
      bloco("Dados do ponto", "O ponto só aparece na Sala de Mapas depois de salvo. Enquanto não estiver marcado como conferido, a página pública avisa que ele não foi testado.", [
        elemento("div", { id: "tatForm" }),
      ]),
      bloco("Pontos deste mapa", null, [
        elemento("div", { class: "lista", id: "tatLista" }),
      ]),
    ],
  },
  { id: "midia", rotulo: "Mídia", montar: painelMidia },
];

/** As 25 patentes, para o seletor de elo. Buscadas uma vez. */
let patentesCache = null;
async function lerPatentes() {
  if (patentesCache) return patentesCache;
  try {
    const r = await fetch("https://valorant-api.com/v1/competitivetiers?language=pt-BR");
    const conjuntos = (await r.json()).data;
    const atual = conjuntos[conjuntos.length - 1];
    patentesCache = (atual?.tiers ?? [])
      .filter((x) => x.tier >= 3 && x.tierName && !/^Unused/i.test(x.tierName))
      .sort((x, y) => x.tier - y.tier)
      .map((x) => ({ nome: x.tierName, cor: `#${String(x.backgroundColor).slice(0, 6)}` }));
  } catch {
    patentesCache = [];
  }
  return patentesCache;
}

/** A tabela pública, com um seletor de elo e um botão de apagar por linha. */
function mostrarRanking() {
  const alvo = $("modRanking");
  if (!alvo) return;

  const NOMES = { gridshot: "Gridshot", tracking: "Tracking", flick: "Flick", linha: "Linha de Tiro" };

  Promise.all([fetch("/api/ranking").then((r) => r.json()), lerPatentes()]).then(([t, patentes]) => {
    alvo.replaceChildren();
    const total = Object.values(t.modos ?? {}).reduce((n, l) => n + l.length, 0);

    if (!total) {
      alvo.append(elemento("p", { class: "lista__vazia", texto:
        "Ninguém publicou nada ainda, em nenhum exercício. O botão de exemplos acima preenche os quatro." }));
      return;
    }

    alvo.append(elemento("p", { class: "bloco__nota", texto:
      `${total} ${total === 1 ? "entrada" : "entradas"} no ar.` +
      (t.resumo?.jogadores ? ` ${t.resumo.jogadores} ${t.resumo.jogadores === 1 ? "pessoa" : "pessoas"}, elo médio ${t.resumo.mediaIndice} de 100.` : "") +
      (t.consolidadoEm ? ` Última consolidação em ${new Date(t.consolidadoEm).toLocaleString("pt-BR")}.` : " Ainda não consolidado.") }));

    // Os quatro exercícios sempre, na mesma ordem, mesmo os vazios. Pular o
    // que está vazio economizava três linhas e custava a pergunta "cadê o
    // Flick?" — de fora, exercício que some parece exercício sem suporte.
    for (const modo of ["gridshot", "tracking", "flick", "linha"]) {
      const lista = t.modos?.[modo] ?? [];
      alvo.append(elemento("h3", { class: "bloco__nota", texto: `${NOMES[modo] ?? modo} (${lista.length})` }));

      if (!lista.length) {
        alvo.append(elemento("p", { class: "lista__vazia", texto:
          "Ninguém publicou neste exercício ainda — não há elo para ajustar aqui." }));
        continue;
      }

      const caixa = elemento("div", { class: "lista" });
      lista.forEach((e, i) => {
        // Seletor de elo: muda a patente mostrada na tabela pública.
        const seletor = elemento("select", { class: "mod-elo", "aria-label": `Elo de ${e.nome}` });
        patentes.forEach((p, idx) => {
          const op = elemento("option", { value: String(idx), texto: p.nome });
          if (idx === e.patente) op.selected = true;
          seletor.append(op);
        });
        seletor.addEventListener("change", async () => {
          const antes = e.patente;
          try {
            await api("/api/ranking", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: e.id, patente: Number(seletor.value) }),
            });
            e.patente = Number(seletor.value);
            avisar(`Elo de ${e.nome} agora é ${patentes[e.patente]?.nome}.`, "ok");
          } catch (err) {
            seletor.value = String(antes);
            avisar(err.message, "erro");
          }
        });

        caixa.append(elemento("div", { class: "item chf" }, [
          elemento("div", { class: "item__topo" }, [
            elemento("span", { class: "item__ordem", texto: String(i + 1).padStart(2, "0") }),
            elemento("span", { class: "item__titulo", texto: `${e.nome} — ${e.valor} (índice ${e.indice})${e.ajustado ? " · ajustado" : ""}` }),
            seletor,
            elemento("button", {
              class: "btn btn--mini btn--perigo chf", type: "button", texto: "Apagar",
              onclick: async (ev) => {
                // A linha tem que ser guardada AGORA: depois do await o
                // `currentTarget` do evento já voltou a ser null.
                const linha = ev.currentTarget.closest(".item");
                if (!confirm(`Apagar a entrada de "${e.nome}" em ${NOMES[modo] ?? modo}?`)) return;
                try {
                  await api(`/api/ranking?id=${encodeURIComponent(e.id)}`, { method: "DELETE" });
                  linha?.remove();
                  avisar("Entrada apagada.", "ok");
                } catch (err) { avisar(err.message, "erro"); }
              },
            }),
          ]),
        ]));
      });
      alvo.append(caixa);
    }
  }).catch((e) => {
    alvo.replaceChildren(elemento("p", { class: "lista__vazia", texto: `Sem resposta do ranking: ${e.message}` }));
  });
}

/** Caixas de categoria montadas a partir do que a coleta realmente trouxe. */
function caixasCategorias() {
  const caixa = elemento("div", { class: "lista" }, [
    elemento("p", { class: "lista__vazia", texto: "Lendo as categorias disponíveis…" }),
  ]);

  fetch("/api/noticias").then((r) => r.json()).then((coleta) => {
    const ocultas = new Set(estado.conteudo.noticias?.categoriasOcultas ?? []);
    caixa.replaceChildren();

    if (!coleta.categorias?.length) {
      caixa.append(elemento("p", { class: "lista__vazia", texto: "Nenhuma categoria — a coleta ainda não rodou." }));
      return;
    }

    for (const c of coleta.categorias) {
      const input = elemento("input", { type: "checkbox" });
      input.checked = ocultas.has(c.id);
      input.addEventListener("change", () => {
        const atual = new Set(estado.conteudo.noticias?.categoriasOcultas ?? []);
        if (input.checked) atual.add(c.id); else atual.delete(c.id);
        definir("noticias.categoriasOcultas", [...atual]);
      });
      caixa.append(elemento("label", { class: "caixa-sim" }, [
        input,
        elemento("span", { texto: `Esconder ${c.nome} (${c.quantidade})` }),
      ]));
    }
  }).catch((e) => {
    caixa.replaceChildren(elemento("p", { class: "lista__vazia", texto: `Não deu para ler as categorias: ${e.message}` }));
  });

  return caixa;
}

/**
 * A lista de jogadores com nível editável.
 *
 * Carrega `/api/progresso?todos=1`, que é a mesma lista enxuta que o ranking
 * usa — não há uma rota só para o painel porque não há nada a mais para
 * mostrar aqui. O que o painel tem de diferente é poder escrever.
 */
function mostrarNiveis() {
  const alvo = $("modNiveis");
  if (!alvo) return;

  Promise.all([
    fetch("/api/progresso?todos=1").then((r) => r.json()),
    lerPatentes(),
  ]).then(([d, patentes]) => {
    const perfis = (d.perfis ?? []).sort((a, b) => b.nivel - a.nivel || a.apelido.localeCompare(b.apelido));
    alvo.replaceChildren();

    if (!perfis.length) {
      alvo.append(elemento("p", { class: "lista__vazia", texto:
        "Ninguém treinou com conta aberta ainda, então não há nível para corrigir." }));
      return;
    }

    for (const p of perfis) {
      const campo = elemento("input", {
        type: "number", min: 1, max: 5000, step: 1, value: String(p.nivel),
        class: "mod-nivel", "aria-label": `Nível de ${p.apelido}`,
      });

      // Elo estimado da pessoa. "Calculado" devolve ao que o site mede —
      // é o desfazer, e sem ele um ajuste feito por engano ficaria para
      // sempre, sem ninguém saber qual era o número de verdade.
      const seletorElo = elemento("select", { class: "mod-elo", "aria-label": `Elo estimado de ${p.apelido}` });
      seletorElo.append(elemento("option", { value: "", texto: "Calculado pelo site" }));
      patentes.forEach((pat, idx) => {
        const op = elemento("option", { value: String(idx), texto: pat.nome });
        if (p.elo === idx) op.selected = true;
        seletorElo.append(op);
      });
      seletorElo.addEventListener("change", async () => {
        const antes = p.elo;
        const valor = seletorElo.value === "" ? null : Number(seletorElo.value);
        try {
          await api("/api/progresso", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ nome: p.apelido, elo: valor }),
          });
          p.elo = valor;
          avisar(valor === null
            ? `Elo de ${p.apelido} voltou a ser o calculado pelo site.`
            : `Elo de ${p.apelido} agora é ${patentes[valor]?.nome}.`, "ok");
        } catch (e) {
          seletorElo.value = antes === null || antes === undefined ? "" : String(antes);
          avisar(e.message, "erro");
        }
      });

      const resumo = elemento("span", { class: "item__meta", texto:
        `${p.xp} XP · ${p.sessoes} ${p.sessoes === 1 ? "sessão" : "sessões"} · ${p.cartoes} ${p.cartoes === 1 ? "cartão" : "cartões"}` });

      const aplicar = elemento("button", {
        class: "btn btn--vazio chf btn--mini", type: "button", texto: "Aplicar",
        onclick: async (ev) => {
          const botao = ev.currentTarget;
          const novo = Number(campo.value);
          if (!Number.isFinite(novo) || novo < 1) { avisar("Nível inválido.", "erro"); return; }
          botao.disabled = true;
          try {
            const r = await api("/api/progresso", {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ nome: p.apelido, nivel: novo }),
            });
            p.nivel = r.nivel; p.xp = r.perfil.xp; p.cartoes = r.perfil.cartoes.length;
            campo.value = String(p.nivel);
            resumo.textContent = `${p.xp} XP · ${p.sessoes} ${p.sessoes === 1 ? "sessão" : "sessões"} · ${p.cartoes} ${p.cartoes === 1 ? "cartão" : "cartões"}`;
            avisar(`${p.apelido}: nível ${r.nivelAntes} → ${r.nivel}.`, "ok");
          } catch (e) {
            campo.value = String(p.nivel);
            avisar(e.message, "erro");
          } finally {
            botao.disabled = false;
          }
        },
      });

      const apagar = elemento("button", {
        class: "btn btn--vazio chf btn--mini", type: "button", texto: "Apagar progresso",
        onclick: async (ev) => {
          // Apagar não tem volta: o XP, os cartões e a contagem de sessões
          // somem junto, e a pessoa recomeça do nível 1.
          if (!confirm(`Apagar todo o progresso de ${p.apelido}? XP, cartões e sessões somem, e não dá para desfazer.`)) return;
          ev.currentTarget.disabled = true;
          try {
            await api(`/api/progresso?nome=${encodeURIComponent(p.apelido)}`, { method: "DELETE" });
            avisar(`Progresso de ${p.apelido} apagado.`, "ok");
            mostrarNiveis();
          } catch (e) {
            ev.currentTarget.disabled = false;
            avisar(e.message, "erro");
          }
        },
      });

      alvo.append(elemento("div", { class: "item chf" }, [
        elemento("div", { class: "item__topo" }, [
          elemento("strong", { texto: p.apelido }),
          resumo,
        ]),
        elemento("div", { class: "item__acoes" }, [
          elemento("label", { class: "mod-nivel__rot" }, [
            elemento("span", { texto: "nível" }),
            campo,
          ]),
          aplicar,
          elemento("label", { class: "mod-nivel__rot" }, [
            elemento("span", { texto: "elo estimado" }),
            seletorElo,
          ]),
          apagar,
        ]),
      ]));
    }
  }).catch((e) => {
    alvo.replaceChildren(elemento("p", { class: "lista__vazia", texto: `Não deu para ler os perfis: ${e.message}` }));
  });
}

/* ================================================= tática (sala de mapas) === */

/**
 * O editor de pontos da Sala de Mapas.
 *
 * Ao contrário das outras abas, esta não edita o JSON de `/api/content`: cada
 * ponto é gravado na hora por `/api/tatica`, um de cada vez. Por isso nada aqui
 * chama `marcarSujo()` — não há nada para "Publicar alterações" — e o estado
 * vive num objeto à parte em vez de em `estado.conteudo`.
 */
const tat = {
  mapas: [],
  agentes: [],
  pontos: [],
  mapa: null,       // uuid do mapa aberto
  editando: null,   // id do ponto em edição; null quando é um ponto novo
  tipo: "pixel",    // "pixel" | "posicao"
  de: null,         // { x, y }, fração do minimapa
  para: null,       // { x, y } ou null
  form: null,
  mini: null,       // { atualizar } devolvido por montarMinimapa
  refs: {},
};

const formVazio = () => ({
  agente: "", habilidade: "", lado: "ataque",
  titulo: "", texto: "", imagens: ["", "", ""], video: "", conferido: false,
});

function limparRascunho() {
  tat.editando = null;
  tat.tipo = "pixel";
  tat.de = null;
  tat.para = null;
  tat.form = formVazio();
}

const ROTULO_IMAGEM = ["Imagem 1: onde ficar", "Imagem 2: onde mirar", "Imagem 3: resultado"];

/** Fração com quatro casas: sobra precisão de sobra num minimapa e o JSON fica enxuto. */
const fracao = (v) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;

function dicaDeMarcacao() {
  if (tat.tipo === "posicao") {
    return tat.de
      ? "Posição marcada. Um novo clique move o ponto."
      : "Clique no minimapa onde a pessoa fica.";
  }
  if (!tat.de) return "Clique no minimapa onde a pessoa fica (1 de 2).";
  if (!tat.para) return "Agora clique onde a util cai (2 de 2).";
  return "Pixel marcado. Um novo clique recomeça a marcação.";
}

/** O que o minimapa mostra: os pontos do mapa, menos o editado, mais o rascunho. */
function atualizarMapaDeTatica() {
  if (!tat.mini) return;
  const lista = pontosDoMapa(tat.pontos, tat.mapa).filter((p) => p.id !== tat.editando);
  if (tat.de) {
    const f = tat.form;
    lista.push({
      id: "rascunho", mapa: tat.mapa,
      agente: f.agente || null, habilidade: f.habilidade || null,
      lado: f.lado, tipo: tat.tipo,
      de: tat.de, para: tat.tipo === "pixel" ? tat.para : null,
      titulo: f.titulo || "Ponto em edição",
    });
  }
  tat.mini.atualizar(lista, { selecionado: "rascunho" });
}

function marcarNoMapa({ x, y }) {
  const c = { x: fracao(x), y: fracao(y) };
  if (tat.tipo === "posicao") tat.de = c;
  // Pixel: o primeiro clique é o `de`, o segundo é o `para`. Com os dois já
  // marcados, um clique novo recomeça em vez de mexer só num deles — senão não
  // haveria como saber qual das duas pontas a pessoa quis mover.
  else if (!tat.de || tat.para) { tat.de = c; tat.para = null; }
  else tat.para = c;
  pintarMarcacao();
}

function pintarMarcacao() {
  const { botoesTipo, dica } = tat.refs;
  for (const [tipo, botao] of Object.entries(botoesTipo)) {
    botao.setAttribute("aria-pressed", String(tipo === tat.tipo));
  }
  dica.textContent = dicaDeMarcacao();
  atualizarMapaDeTatica();
}

function abrirPontoParaEditar(p) {
  if (p.id === "rascunho" || p.id === tat.editando) return;
  const emAndamento = tat.de || tat.form.titulo.trim();
  if (emAndamento && !confirm("Descartar o que está sendo marcado e abrir este ponto?")) return;

  tat.editando = p.id;
  tat.tipo = p.tipo;
  tat.de = { ...p.de };
  tat.para = p.para ? { ...p.para } : null;
  tat.form = {
    agente: p.agente ?? "", habilidade: p.habilidade ?? "", lado: p.lado,
    titulo: p.titulo ?? "", texto: p.texto ?? "",
    imagens: [0, 1, 2].map((i) => p.imagens?.[i] ?? ""),
    video: p.video ?? "", conferido: p.conferido === true,
  };
  pintarEditorDeTatica();
  tat.refs.form?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function desenharMinimapaDeTatica() {
  const mapa = tat.mapas.find((m) => m.uuid === tat.mapa);
  tat.mini = montarMinimapa(tat.refs.minimapa, {
    mapa, pontos: [], agentes: tat.agentes,
    aoEscolher: abrirPontoParaEditar,
    aoClicarNoMapa: marcarNoMapa,
  });
}

/** Opções de habilidade do agente escolhido. Sem agente, não há o que escolher. */
function preencherHabilidades(select) {
  const f = tat.form;
  select.replaceChildren(elemento("option", { value: "", texto: f.agente ? "Nenhuma" : "Escolha um agente antes" }));
  const agente = tat.agentes.find((a) => a.uuid === f.agente);
  for (const h of agente?.abilities ?? []) {
    if (!h.displayName) continue;
    select.append(elemento("option", { value: h.slot, texto: h.displayName }));
  }
  // Um ponto antigo pode apontar para uma habilidade que a Riot tirou do
  // catálogo. Sem esta opção o select cairia em "Nenhuma" e salvar apagaria o
  // dado sem a pessoa ter pedido.
  if (f.habilidade && ![...select.options].some((o) => o.value === f.habilidade)) {
    select.append(elemento("option", { value: f.habilidade, texto: `${f.habilidade} (fora do catálogo)` }));
  }
  select.value = f.habilidade;
  select.disabled = !f.agente;
}

function pintarFormDeTatica() {
  const alvo = tat.refs.form;
  const f = tat.form;
  alvo.replaceChildren();

  const agentes = elemento("select");
  agentes.append(elemento("option", { value: "", texto: "Nenhum (posição que vale para todos)" }));
  [...tat.agentes]
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"))
    .forEach((a) => agentes.append(elemento("option", { value: a.uuid, texto: a.displayName })));
  if (f.agente && !tat.agentes.some((a) => a.uuid === f.agente)) {
    agentes.append(elemento("option", { value: f.agente, texto: "Agente fora do catálogo" }));
  }
  agentes.value = f.agente;

  const habilidades = elemento("select");
  preencherHabilidades(habilidades);

  agentes.addEventListener("change", () => {
    f.agente = agentes.value;
    f.habilidade = "";
    preencherHabilidades(habilidades);
    atualizarMapaDeTatica();
  });
  habilidades.addEventListener("change", () => {
    f.habilidade = habilidades.value;
    atualizarMapaDeTatica();
  });

  const lado = elemento("select");
  lado.append(
    elemento("option", { value: "ataque", texto: "Ataque" }),
    elemento("option", { value: "defesa", texto: "Defesa" }),
  );
  lado.value = f.lado;
  lado.addEventListener("change", () => { f.lado = lado.value; atualizarMapaDeTatica(); });

  const titulo = elemento("input", { type: "text", value: f.titulo, maxlength: 80 });
  titulo.addEventListener("input", () => { f.titulo = titulo.value; });

  const texto = elemento("textarea", { rows: 4, maxlength: 600 });
  texto.value = f.texto;
  texto.addEventListener("input", () => { f.texto = texto.value; });

  const video = elemento("input", { type: "url", value: f.video, placeholder: "https://www.youtube.com/watch?v=…" });
  video.addEventListener("input", () => { f.video = video.value; });

  const conferido = elemento("input", { type: "checkbox" });
  conferido.checked = f.conferido;
  conferido.addEventListener("change", () => { f.conferido = conferido.checked; });

  const salvar = elemento("button", {
    class: "btn btn--forte chf", type: "button",
    texto: tat.editando ? "Salvar alterações" : "Salvar ponto",
    onclick: (ev) => salvarPontoDeTatica(ev.currentTarget),
  });

  alvo.append(
    elemento("p", { class: "bloco__nota", texto: tat.editando ? `Editando: ${f.titulo || "(sem título)"}` : "Ponto novo." }),
    elemento("div", { class: "dupla" }, [rotulado("Agente", agentes), rotulado("Habilidade", habilidades)]),
    elemento("div", { class: "dupla" }, [rotulado("Lado", lado), rotulado("Vídeo (opcional)", video, "Só link do YouTube.")]),
    rotulado("Título", titulo, "Até 80 caracteres."),
    rotulado("Texto", texto, "Até 600 caracteres. Sem marcação."),
    // As imagens guardam a ordem: a página pública mostra nesta sequência.
    ...ROTULO_IMAGEM.map((rotulo, i) =>
      entradaImagem({ rotulo, obj: f.imagens, chave: i, local: true })),
    elemento("label", { class: "caixa-sim" }, [
      conferido,
      elemento("span", { texto: "Conferido: testei este ponto no jogo" }),
    ]),
    elemento("div", { class: "item__acoes" }, [
      salvar,
      elemento("button", {
        class: "btn chf", type: "button",
        texto: tat.editando ? "Cancelar edição" : "Limpar tudo",
        onclick: () => { limparRascunho(); pintarEditorDeTatica(); },
      }),
    ]),
  );
}

async function salvarPontoDeTatica(botao) {
  const f = tat.form;
  if (!tat.de) {
    avisar("Clique no minimapa para marcar onde a pessoa fica.", "erro");
    return;
  }

  const editando = tat.editando;
  const corpo = {
    mapa: tat.mapa,
    agente: f.agente || null,
    habilidade: f.habilidade || null,
    lado: f.lado,
    tipo: tat.tipo,
    de: tat.de,
    para: tat.tipo === "pixel" ? tat.para : null,
    titulo: f.titulo,
    texto: f.texto,
    imagens: f.imagens.map((i) => i.trim()).filter(Boolean),
    video: f.video.trim() || null,
    conferido: f.conferido,
  };

  botao.disabled = true;
  try {
    // O servidor valida tudo e devolve a mensagem em português; ela vai direto
    // para a barra, sem tradução nem texto nosso por cima.
    const salvo = await api(editando ? `/api/tatica?id=${encodeURIComponent(editando)}` : "/api/tatica", {
      method: editando ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const i = tat.pontos.findIndex((p) => p.id === salvo.id);
    if (i >= 0) tat.pontos[i] = salvo; else tat.pontos.push(salvo);
    avisar(editando ? "Ponto atualizado." : "Ponto salvo.", "ok");
    limparRascunho();
    pintarEditorDeTatica();
  } catch (e) {
    avisar(e.message, "erro");
  } finally {
    botao.disabled = false;
  }
}

function pintarListaDeTatica() {
  const alvo = tat.refs.lista;
  alvo.replaceChildren();
  const pontos = pontosDoMapa(tat.pontos, tat.mapa);

  if (!pontos.length) {
    alvo.append(elemento("p", { class: "lista__vazia", texto: "Nenhum ponto neste mapa ainda. Clique no minimapa para começar." }));
    return;
  }

  pontos.forEach((p, i) => {
    const alternar = elemento("button", {
      class: "btn btn--mini chf", type: "button",
      texto: p.conferido ? "Desmarcar conferido" : "Marcar como conferido",
      onclick: async (ev) => {
        const botao = ev.currentTarget;
        botao.disabled = true;
        try {
          const salvo = await api(`/api/tatica?id=${encodeURIComponent(p.id)}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ conferido: !p.conferido }),
          });
          const j = tat.pontos.findIndex((x) => x.id === salvo.id);
          if (j >= 0) tat.pontos[j] = salvo;
          // Se o ponto está aberto no formulário, a caixa precisa acompanhar,
          // senão o próximo "Salvar" desfaria o que acabou de ser feito.
          if (tat.editando === salvo.id) tat.form.conferido = salvo.conferido === true;
          avisar(salvo.conferido ? "Marcado como conferido." : "Voltou a não conferido.", "ok");
          pintarEditorDeTatica();
        } catch (e) {
          botao.disabled = false;
          avisar(e.message, "erro");
        }
      },
    });

    alvo.append(elemento("div", { class: "item chf" }, [
      elemento("div", { class: "item__topo" }, [
        elemento("span", { class: "item__ordem", texto: String(i + 1).padStart(2, "0") }),
        elemento("span", { class: "item__titulo", texto: rotuloDoPonto(p, tat.agentes), title: rotuloDoPonto(p, tat.agentes) }),
        elemento("span", {
          class: `item__meta tat-selo${p.conferido ? " tat-selo--ok" : ""}`,
          texto: p.conferido ? "conferido" : "não conferido",
        }),
      ]),
      elemento("div", { class: "item__acoes" }, [
        elemento("button", {
          class: "btn btn--mini chf", type: "button", texto: "Editar",
          onclick: () => abrirPontoParaEditar(p),
        }),
        alternar,
        elemento("button", {
          class: "btn btn--mini btn--perigo chf", type: "button", texto: "Apagar",
          onclick: async (ev) => {
            if (!confirm(`Apagar "${p.titulo}"? Ele some da Sala de Mapas e não dá para desfazer.`)) return;
            const botao = ev.currentTarget;
            botao.disabled = true;
            try {
              await api(`/api/tatica?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
              tat.pontos = tat.pontos.filter((x) => x.id !== p.id);
              if (tat.editando === p.id) limparRascunho();
              avisar("Ponto apagado.", "ok");
              pintarEditorDeTatica();
            } catch (e) {
              botao.disabled = false;
              avisar(e.message, "erro");
            }
          },
        }),
      ]),
    ]));
  });
}

function pintarEditorDeTatica() {
  pintarMarcacao();
  pintarFormDeTatica();
  pintarListaDeTatica();
}

/** Monta o bloco do minimapa depois que o catálogo chegou. */
function montarEditorDeTatica() {
  const alvo = $("tatMapa");

  const seletor = elemento("select", { "aria-label": "Mapa" });
  for (const m of tat.mapas) seletor.append(elemento("option", { value: m.uuid, texto: m.displayName }));
  seletor.value = tat.mapa;
  seletor.addEventListener("change", () => {
    // Coordenada de um mapa não vale em outro, então o rascunho não atravessa.
    if ((tat.de || tat.form.titulo.trim()) && !confirm("Trocar de mapa descarta o que está sendo marcado. Continuar?")) {
      seletor.value = tat.mapa;
      return;
    }
    tat.mapa = seletor.value;
    limparRascunho();
    desenharMinimapaDeTatica();
    pintarEditorDeTatica();
  });

  const botoesTipo = {};
  for (const [tipo, rotulo] of [["pixel", "Pixel"], ["posicao", "Posição"]]) {
    botoesTipo[tipo] = elemento("button", {
      class: "btn chf", type: "button", texto: rotulo, "aria-pressed": "false",
      onclick: () => {
        tat.tipo = tipo;
        // Posição não lança nada; o `para` ficaria escondido e iria no envio.
        if (tipo === "posicao") tat.para = null;
        pintarMarcacao();
      },
    });
  }

  const dica = elemento("p", { class: "bloco__nota", "aria-live": "polite" });
  const minimapa = elemento("div", { class: "tat-minimapa" });

  alvo.replaceChildren(
    elemento("div", { class: "dupla" }, [rotulado("Mapa", seletor)]),
    elemento("div", { class: "tat-barra" }, [
      elemento("span", { class: "tat-barra__rotulo", texto: "O que marcar" }),
      botoesTipo.pixel,
      botoesTipo.posicao,
      elemento("button", {
        class: "btn btn--mini chf", type: "button", texto: "Refazer marcação",
        onclick: () => { tat.de = null; tat.para = null; pintarMarcacao(); },
      }),
    ]),
    dica,
    minimapa,
  );

  Object.assign(tat.refs, {
    botoesTipo, dica, minimapa,
    form: $("tatForm"), lista: $("tatLista"),
  });
  desenharMinimapaDeTatica();
  pintarEditorDeTatica();
}

/**
 * Entrada da aba. Busca o catálogo e os pontos de novo a cada visita: a lista
 * pode ter mudado por outro lado (outra aba do navegador, outra pessoa).
 */
function mostrarTatica() {
  const alvo = $("tatMapa");
  if (!alvo) return;

  Promise.all([carregarMapas(), carregarAgentes(), carregarTatica()]).then(([mapas, agentes, pontos]) => {
    tat.mapas = mapas
      // Sem `tacticalDescription` são campo de treino e modos especiais, que
      // não têm partida; a página pública esconde os mesmos.
      .filter((m) => m.tacticalDescription)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));
    tat.agentes = agentes;
    tat.pontos = pontos;

    if (!tat.mapas.length) {
      alvo.replaceChildren(elemento("p", { class: "lista__vazia", texto: "A API da Riot não devolveu nenhum mapa jogável." }));
      return;
    }
    if (!tat.mapas.some((m) => m.uuid === tat.mapa)) tat.mapa = tat.mapas[0].uuid;
    limparRascunho();
    montarEditorDeTatica();
  }).catch((e) => {
    alvo.replaceChildren(elemento("p", { class: "lista__vazia", texto: `Não deu para carregar mapas e pontos: ${e.message}` }));
  });
}

/** Diagnóstico da coleta: quando rodou, quantas vieram, e se quebrou. */
function mostrarEstadoNoticias() {
  const alvo = $("estadoNoticias");
  if (!alvo) return;
  fetch("/api/noticias").then((r) => r.json()).then((c) => {
    alvo.replaceChildren();
    if (c.erro) {
      alvo.append(elemento("p", { class: "recado recado--erro chf" }, [
        elemento("strong", { texto: "A coleta falhou: " }),
        document.createTextNode(c.erro),
      ]));
    }
    if (c.coletadoEm) {
      alvo.append(elemento("p", { class: "bloco__nota", texto:
        `${c.itens.length} notícias guardadas de ${c.total} disponíveis no site oficial. Última leitura em ${new Date(c.coletadoEm).toLocaleString("pt-BR")}.` }));
    }
    if (c.itens?.length) {
      alvo.append(elemento("div", { class: "lista" }, c.itens.slice(0, 5).map((n) =>
        elemento("div", { class: "item chf" }, [
          elemento("div", { class: "item__topo" }, [
            elemento("span", { class: "item__ordem", texto: (n.publicadoEm || "").slice(0, 10) }),
            elemento("span", { class: "item__titulo", texto: n.titulo }),
            elemento("button", {
              class: "btn btn--mini chf", type: "button", texto: "Esconder esta",
              onclick: () => {
                const atual = new Set(estado.conteudo.noticias?.idsOcultos ?? []);
                atual.add(n.id);
                definir("noticias.idsOcultos", [...atual]);
                avisar("Escondida. Publique para valer no site.", "ok");
              },
            }),
          ]),
        ]))));
    }
  }).catch((e) => {
    alvo.replaceChildren(elemento("p", { class: "lista__vazia", texto: `Sem resposta da coleta: ${e.message}` }));
  });
}

let abaAtual = ABAS[0].id;

function pintarAbaAtual() {
  const aba = ABAS.find((a) => a.id === abaAtual) ?? ABAS[0];
  const painel = $("paineis");
  painel.replaceChildren();
  painel.append(elemento("div", { class: "painel", id: `painel-${aba.id}`, role: "tabpanel" }, aba.montar()));

  for (const b of $("abas").children) {
    b.setAttribute("aria-selected", String(b.dataset.aba === abaAtual));
  }

  if (aba.id === "noticias") mostrarEstadoNoticias();
  if (aba.id === "rankingAba") mostrarRanking();
  if (aba.id === "niveis") mostrarNiveis();
  if (aba.id === "tatica") mostrarTatica();
}

function montarAbas() {
  const caixa = $("abas");
  caixa.replaceChildren();
  for (const aba of ABAS) {
    caixa.append(elemento("button", {
      type: "button", role: "tab", "data-aba": aba.id, texto: aba.rotulo,
      "aria-selected": String(aba.id === abaAtual),
      onclick: () => { abaAtual = aba.id; pintarAbaAtual(); },
    }));
  }
}

/* ============================================================== ações ==== */

$("btnSalvar").addEventListener("click", async () => {
  const botao = $("btnSalvar");
  botao.disabled = true;
  try {
    avisar("Publicando…");
    await api("/api/content", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(estado.conteudo),
    });
    estado.sujo = false;
    avisar("Publicado. O site já está mostrando as alterações.", "ok");
  } catch (e) {
    avisar(e.message, "erro");
  } finally {
    botao.disabled = false;
  }
});

$("btnPadrao").addEventListener("click", async () => {
  if (!confirm("Isso descarta tudo que você editou e volta ao conteúdo original. As imagens enviadas continuam na biblioteca. Continuar?")) return;
  try {
    const r = await api("/api/content", { method: "DELETE" });
    estado.conteudo = r.conteudo;
    estado.sujo = false;
    pintarAbaAtual();
    avisar("Conteúdo original restaurado.", "ok");
  } catch (e) {
    avisar(e.message, "erro");
  }
});

$("btnBaixar").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(estado.conteudo, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = elemento("a", { href: url, download: `estande-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  URL.revokeObjectURL(url);
});

/* ============================================================== entrada == */

async function entrar(chave) {
  estado.chave = chave;

  // A listagem da biblioteca exige a chave e não escreve nada: é o teste de
  // acesso mais honesto que existe aqui. Se a chave estiver errada, isto lança
  // antes de qualquer gravação.
  const { itens } = await api("/api/media");
  estado.midia = itens;

  const { conteudo } = await (await fetch("/api/content")).json();
  estado.conteudo = conteudo;

  sessionStorage.setItem(CHAVE_SESSAO, chave);

  $("acesso").hidden = true;
  $("painelRaiz").hidden = false;
  estado.sujo = false;
  montarAbas();
  pintarAbaAtual();
  avisar("Conectado.", "ok");
}

$("formAcesso").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const erro = $("acessoErro");
  erro.hidden = true;
  try {
    await entrar($("chave").value);
  } catch (e) {
    erro.hidden = false;
    erro.replaceChildren(elemento("strong", { texto: "Não deu: " }), document.createTextNode(e.message));
  }
});

const guardada = sessionStorage.getItem(CHAVE_SESSAO);
if (guardada) {
  entrar(guardada).catch(() => sessionStorage.removeItem(CHAVE_SESSAO));
}
