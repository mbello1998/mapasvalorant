// Importador de lineups de fora para a Sala de Mapas.
//
// Recebe uma lista de lineups escrita em nomes ("Ascent", "Brimstone",
// "Fumaça Celeste", "A Árvore") e devolve pontos prontos para a rota
// /api/tatica, com as coordenadas resolvidas a partir dos callouts oficiais da
// Riot e com o crédito da origem preenchido.
//
// Por que em nomes e não em coordenada: ninguém transcreve fração de minimapa
// na mão sem errar, e o callout é como a informação já existe na cabeça de
// quem joga e nos sites de lineup. A conversão para número é justamente o que
// este arquivo faz.
//
// NÃO raspa site nenhum. A entrada é um arquivo que você monta — copiando à
// mão, ou a partir de um export que o dono do acervo de origem te passar. Foi
// decisão de projeto: o site que motivou isto não publica API, o conteúdo dele
// chega por JavaScript, e um raspador montado em cima do cliente interno
// quebraria na primeira mudança lá. A tradução e a validação, que é a parte
// difícil e durável, ficam aqui.
//
// Crédito: `fonte` é o endereço do lineup original e a página o mostra como
// link. `credito` é o nome de quem publicou e entra no fim do texto, porque o
// schema do ponto não tem campo de autor. Os dois são opcionais para o script
// rodar, mas se o lineup veio de outro lugar, preencha os dois.
//
// Uso:
//   node scripts/importar-lineups.mjs entrada.json                 (ensaio)
//   node scripts/importar-lineups.mjs entrada.json --saida out.json
//   node scripts/importar-lineups.mjs entrada.json --enviar --url https://estandebr.netlify.app
//
// Com --enviar, a chave vem de ADMIN_KEY no ambiente; ela nunca é impressa.

import { readFile, writeFile } from "node:fs/promises";
import { paraMinimapa } from "../public/assets/js/minimapa.js";

const VAPI = "https://valorant-api.com/v1";

/* ------------------------------------------------------------------ catálogo -- */

/** Tira acento, caixa e pontuação: "Fumaça Celeste" e "fumaca celeste" batem. */
export function chaveDeNome(s) {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Índice de busca de um mapa: uuid, nome e os callouts já em fração.
 *
 * Um mapa repete nome de callout ("Ponto" existe no A e no B), então a chave
 * principal é "região + nome" ("a ponto"). O nome sozinho também entra, mas só
 * quando é único no mapa: ambíguo, ele é removido, e o script exige a forma
 * com região em vez de escolher um dos dois no escuro.
 */
export function indexarMapa(m) {
  const callouts = new Map();
  const ambiguos = new Set();

  for (const c of m.callouts ?? []) {
    const p = paraMinimapa(c.location, m);
    if (!(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) continue;

    const comRegiao = chaveDeNome(`${c.superRegionName} ${c.regionName}`);
    callouts.set(comRegiao, p);

    const soNome = chaveDeNome(c.regionName);
    if (callouts.has(soNome) || ambiguos.has(soNome)) {
      callouts.delete(soNome);
      ambiguos.add(soNome);
    } else {
      callouts.set(soNome, p);
    }
  }
  return { uuid: m.uuid, nome: m.displayName, callouts, ambiguos };
}

export function indexarAgente(a) {
  const habilidades = new Map();
  for (const h of a.abilities ?? []) {
    if (h.displayName) habilidades.set(chaveDeNome(h.displayName), h.slot);
    // O slot cru também vale, para quem já sabe o que quer.
    habilidades.set(chaveDeNome(h.slot), h.slot);
  }
  return { uuid: a.uuid, nome: a.displayName, habilidades };
}

async function pegarJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  return (await r.json()).data;
}

export async function carregarCatalogo() {
  const [mapas, agentes] = await Promise.all([
    pegarJson(`${VAPI}/maps?language=pt-BR`),
    pegarJson(`${VAPI}/agents?language=pt-BR&isPlayableCharacter=true`),
  ]);
  const porMapa = new Map();
  for (const m of mapas) {
    if (!m.tacticalDescription) continue; // campo de treino e modos especiais
    porMapa.set(chaveDeNome(m.displayName), indexarMapa(m));
  }
  const porAgente = new Map();
  for (const a of agentes) porAgente.set(chaveDeNome(a.displayName), indexarAgente(a));
  return { mapas: porMapa, agentes: porAgente };
}

/* ----------------------------------------------------------------- conversão -- */

const LADOS = new Set(["ataque", "defesa"]);
const MAX_TEXTO = 600; // igual ao servidor (netlify/lib/tatica.mts)

/** Aceita "A Árvore" (callout) ou "0.42, 0.31" (fração crua). */
export function resolverLugar(valor, mapa) {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return { ok: false, erro: "lugar vazio" };

  const n = bruto.match(/^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/);
  if (n) {
    const x = Number(n[1]);
    const y = Number(n[2]);
    const valida = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
    if (!valida(x) || !valida(y)) return { ok: false, erro: `coordenada fora de 0-1: ${bruto}` };
    return { ok: true, lugar: { x, y } };
  }

  const chave = chaveDeNome(bruto);
  const achado = mapa.callouts.get(chave);
  if (achado) return { ok: true, lugar: { x: achado.x, y: achado.y } };

  if (mapa.ambiguos.has(chave)) {
    return { ok: false, erro: `"${bruto}" existe em mais de uma região do ${mapa.nome}; use "A ${bruto}" ou "B ${bruto}"` };
  }
  return { ok: false, erro: `callout "${bruto}" não existe no ${mapa.nome}` };
}

/**
 * O crédito entra no fim do texto porque o ponto não tem campo de autor. Vai
 * em frase, não em sigla, para quem lê a página entender que o lineup é de
 * outra pessoa mesmo sem clicar no link da fonte.
 */
export function comCredito(texto, credito) {
  const base = String(texto ?? "").trim();
  if (!credito) return base;
  const linha = `Lineup de ${String(credito).trim()}, reproduzido com autorização.`;
  return base ? `${base} ${linha}` : linha;
}

/**
 * Uma linha da entrada vira um ponto, ou um erro que diz o que corrigir.
 *
 * Devolve erro em vez de lançar: um arquivo de cinquenta lineups com três
 * linhas erradas deve importar as quarenta e sete e listar as três, não parar
 * na primeira.
 */
export function converter(linha, catalogo) {
  const falha = (erro) => ({ ok: false, erro });

  const mapa = catalogo.mapas.get(chaveDeNome(linha.mapa));
  if (!mapa) return falha(`mapa "${linha.mapa}" não existe`);

  const lado = chaveDeNome(linha.lado);
  if (!LADOS.has(lado)) return falha(`lado tem de ser "ataque" ou "defesa", veio "${linha.lado}"`);

  const tipo = chaveDeNome(linha.tipo) === "posicao" ? "posicao" : "pixel";

  const titulo = String(linha.titulo ?? "").trim();
  if (!titulo) return falha("sem título");

  const de = resolverLugar(linha.de, mapa);
  if (!de.ok) return falha(de.erro);

  let agente = null;
  let habilidade = null;
  let para = null;

  if (tipo === "pixel") {
    const a = catalogo.agentes.get(chaveDeNome(linha.agente));
    if (!a) return falha(`pixel precisa de agente, e "${linha.agente}" não existe`);
    agente = a.uuid;

    const slot = a.habilidades.get(chaveDeNome(linha.habilidade));
    if (!slot) return falha(`"${linha.habilidade}" não é habilidade de ${a.nome}`);
    habilidade = slot;

    const d = resolverLugar(linha.para, mapa);
    if (!d.ok) return falha(`destino: ${d.erro}`);
    para = d.lugar;

    if (para.x === de.lugar.x && para.y === de.lugar.y) {
      return falha("de e para são o mesmo lugar; a linha no mapa teria comprimento zero");
    }
  } else if (linha.agente) {
    // Posição pode ter agente (é "onde o Cypher fica"), mas nunca habilidade.
    const a = catalogo.agentes.get(chaveDeNome(linha.agente));
    if (!a) return falha(`agente "${linha.agente}" não existe`);
    agente = a.uuid;
  }

  const fonte = String(linha.fonte ?? "").trim();
  if (fonte && !fonte.startsWith("https://")) return falha(`fonte tem de ser https, veio "${fonte}"`);

  const texto = comCredito(linha.texto, linha.credito);
  if (texto.length > MAX_TEXTO) {
    return falha(`texto com ${texto.length} caracteres (o servidor aceita até ${MAX_TEXTO})`);
  }

  return {
    ok: true,
    ponto: {
      mapa: mapa.uuid, agente, habilidade, lado, tipo,
      de: de.lugar, para, titulo, texto,
      imagens: [], // imagem de terceiro não é re-hospedada; o link da fonte leva ao original
      video: typeof linha.video === "string" && linha.video ? linha.video : null,
      fonte: fonte || null,
      conferido: false, // nada entra conferido: quem importou não testou em jogo
    },
  };
}

export function converterTodos(linhas, catalogo) {
  const pontos = [];
  const erros = [];
  linhas.forEach((linha, i) => {
    const r = converter(linha, catalogo);
    if (r.ok) pontos.push(r.ponto);
    else erros.push({ linha: i + 1, titulo: linha?.titulo ?? "(sem título)", erro: r.erro });
  });
  return { pontos, erros };
}

/* ----------------------------------------------------------------------- CLI -- */

async function enviar(pontos, base, chave) {
  let feitos = 0;
  for (const p of pontos) {
    const r = await fetch(new URL("/api/tatica", base), {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": chave },
      body: JSON.stringify(p),
    });
    if (!r.ok) {
      const corpo = await r.text().catch(() => "");
      console.error(`  falhou "${p.titulo}": ${r.status} ${corpo.slice(0, 200)}`);
      continue;
    }
    feitos++;
    // Um de cada vez e com pausa: a rota tem limite por minuto, e importar
    // depressa demais derruba o resto do import com 429.
    await new Promise((r) => setTimeout(r, 1200));
  }
  return feitos;
}

async function principal() {
  const args = process.argv.slice(2);
  const entrada = args.find((a) => !a.startsWith("--"));
  if (!entrada) {
    console.error("uso: node scripts/importar-lineups.mjs entrada.json [--saida out.json] [--enviar --url https://...]");
    process.exit(2);
  }
  const opcao = (nome, padrao) => {
    const i = args.indexOf(nome);
    return i === -1 ? padrao : args[i + 1];
  };

  // Arquivo que não existe e JSON torto são os dois erros de quem roda isto
  // pela primeira vez. Um stack trace do Node não ajuda ninguém a consertar.
  let bruto;
  try {
    bruto = await readFile(entrada, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error(`não achei o arquivo "${entrada}".`);
      console.error("Há um modelo pronto em scripts/lineups-exemplo.json — copie e edite:");
      console.error("  node scripts/importar-lineups.mjs scripts/lineups-exemplo.json");
    } else {
      console.error(`não consegui ler "${entrada}": ${e.message}`);
    }
    process.exit(2);
  }

  let linhas;
  try {
    linhas = JSON.parse(bruto);
  } catch (e) {
    console.error(`"${entrada}" não é JSON válido: ${e.message}`);
    process.exit(2);
  }
  if (!Array.isArray(linhas)) {
    console.error(`"${entrada}" tem de ser um array de lineups, entre [ e ].`);
    process.exit(2);
  }

  const catalogo = await carregarCatalogo();
  const { pontos, erros } = converterTodos(linhas, catalogo);

  console.log(`${pontos.length} de ${linhas.length} prontos.`);
  if (erros.length) {
    console.log(`\n${erros.length} recusados:`);
    for (const e of erros) console.log(`  linha ${e.linha} (${e.titulo}): ${e.erro}`);
  }
  const semFonte = pontos.filter((p) => !p.fonte).length;
  if (semFonte) console.log(`\naviso: ${semFonte} sem fonte. Se vieram de outro site, preencha para dar o crédito.`);

  const saida = opcao("--saida", null);
  if (saida) {
    await writeFile(saida, JSON.stringify(pontos, null, 2), "utf8");
    console.log(`\ngravado em ${saida}`);
  }

  if (!args.includes("--enviar")) {
    console.log("\nensaio: nada foi enviado. Use --enviar --url https://seusite para gravar de verdade.");
    return;
  }

  const base = opcao("--url", null);
  const chave = process.env.ADMIN_KEY;
  if (!base) { console.error("--enviar precisa de --url"); process.exit(2); }
  if (!chave) { console.error("--enviar precisa de ADMIN_KEY no ambiente"); process.exit(2); }

  console.log(`\nenviando ${pontos.length} para ${base}…`);
  const feitos = await enviar(pontos, base, chave);
  console.log(`${feitos} gravados.`);
}

// Só roda como programa; importado por teste, não executa nada.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href) {
  await principal();
}
