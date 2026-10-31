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
// Imagem: a linha pode trazer `imagens` com endereços de fora. Eles não entram
// no ponto direto — `imagens` só aceita caminho /api/media/ deste site. Com
// --midia o script baixa cada arquivo, confere tipo e tamanho, re-hospeda pela
// rota de mídia e grava o caminho local. Sem a flag, o ponto entra sem imagem e
// o link da fonte leva ao original, que é o padrão e o mais barato. Linha com
// imagem de fora exige `fonte`, senão o crédito se perde justamente onde mais
// importa. Vídeo não: a rota de mídia só guarda imagem, e o campo `video` do
// ponto só aceita link do YouTube.
//
// Uso:
//   node scripts/importar-lineups.mjs entrada.json                 (ensaio)
//   node scripts/importar-lineups.mjs entrada.json --saida out.json
//   node scripts/importar-lineups.mjs entrada.json --enviar --url https://estandebr.netlify.app
//   node scripts/importar-lineups.mjs entrada.json --enviar --midia --url https://...
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

/**
 * A mesma regra de vídeo do servidor (netlify/lib/tatica.mts): só YouTube, e
 * ancorada no fim para não deixar lixo passar depois do id.
 *
 * Repetida aqui de propósito. O servidor é quem decide de verdade — esta cópia
 * não afrouxa nada —, mas sem ela o ensaio dizia "pronto" para uma linha que
 * seria recusada no envio, e o ensaio existe justamente para isso não
 * acontecer. Se a regra mudar lá, muda aqui.
 */
const VIDEO = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{6,}([?&][\w=&.-]*)?$/;

// Espelha a rota /api/media: ela só guarda imagem, e recusa o resto. Vídeo de
// verdade (mp4, webm) não entra no site por lugar nenhum — é por isso que o
// campo `video` do ponto só aceita link do YouTube.
const TIPOS_IMAGEM = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/svg+xml", "image/x-icon",
]);
const LIMITE_MIDIA = 4 * 1024 * 1024;
const MAX_IMAGENS = 3;

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

  // Vídeo só entra se for YouTube, porque é o que o servidor grava. Clipe
  // hospedado no CDN de outro site não cabe aqui nem em `imagens`, que só
  // aceita arquivo servido por este site (/api/media/): ou se sobe o arquivo
  // pelo painel, ou o lineup fica só com o link da fonte.
  const video = String(linha.video ?? "").trim();
  if (video && !VIDEO.test(video)) {
    return falha(`vídeo tem de ser link do YouTube, veio "${video.slice(0, 60)}"`);
  }

  const texto = comCredito(linha.texto, linha.credito);
  if (texto.length > MAX_TEXTO) {
    return falha(`texto com ${texto.length} caracteres (o servidor aceita até ${MAX_TEXTO})`);
  }

  // Imagem de fora não entra no ponto aqui: `imagens` só aceita caminho
  // /api/media/ deste site. A URL fica guardada à parte e só vira caminho se
  // o import rodar com --midia, que baixa e re-hospeda. Sem a flag, o ponto
  // entra sem imagem e o link da fonte leva ao original.
  const midia = [];
  const brutas = Array.isArray(linha.imagens) ? linha.imagens : [];
  for (const u of brutas) {
    const url = String(u ?? "").trim();
    if (!url) continue;
    if (!url.startsWith("https://")) return falha(`imagem tem de ser https, veio "${url.slice(0, 60)}"`);
    midia.push(url);
  }
  if (midia.length > MAX_IMAGENS) {
    return falha(`${midia.length} imagens (o servidor aceita até ${MAX_IMAGENS} por ponto)`);
  }
  // Re-hospedar arquivo de outra pessoa sem dizer de onde veio apaga o crédito
  // justamente no caso em que ele mais importa.
  if (midia.length && !fonte) {
    return falha("linha com imagem de fora precisa de `fonte`, senão o crédito se perde");
  }

  return {
    ok: true,
    // As URLs de fora andam ao lado do ponto, não dentro dele: o ponto já sai
    // daqui válido para o servidor, e a mídia é uma etapa opcional depois.
    midia,
    ponto: {
      mapa: mapa.uuid, agente, habilidade, lado, tipo,
      de: de.lugar, para, titulo, texto,
      imagens: [], // imagem de terceiro não é re-hospedada; o link da fonte leva ao original
      video: video || null, // vazio é null, não "": o schema do ponto pede null
      fonte: fonte || null,
      conferido: false, // nada entra conferido: quem importou não testou em jogo
    },
  };
}

export function converterTodos(linhas, catalogo) {
  const itens = [];
  const erros = [];
  linhas.forEach((linha, i) => {
    const r = converter(linha, catalogo);
    if (r.ok) itens.push({ ponto: r.ponto, midia: r.midia });
    else erros.push({ linha: i + 1, titulo: linha?.titulo ?? "(sem título)", erro: r.erro });
  });
  // `pontos` é a lista pronta para enviar; `itens` guarda a mídia de fora ao
  // lado de cada um, para a etapa de --midia.
  return { pontos: itens.map((i) => i.ponto), itens, erros };
}

/* ----------------------------------------------------------------------- CLI -- */

/**
 * Baixa uma imagem de fora, conferindo antes o que a rota de mídia confere.
 *
 * Checar aqui e não só lá evita subir 4 MB para receber 413 de volta, e evita
 * mandar para o site um arquivo que não é imagem. O tipo vem do cabeçalho da
 * resposta, não da extensão da URL: extensão é palpite, Content-Type é o que
 * o servidor de origem afirma — e é o que a rota vai olhar.
 */
async function baixarImagem(url) {
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    return { ok: false, erro: `não baixou (${e.name === "TimeoutError" ? "tempo esgotado" : e.message})` };
  }
  if (!r.ok) return { ok: false, erro: `origem respondeu ${r.status}` };

  const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!TIPOS_IMAGEM.has(tipo)) {
    return { ok: false, erro: `não é imagem aceita (${tipo || "sem content-type"})` };
  }

  const dados = new Uint8Array(await r.arrayBuffer());
  if (dados.byteLength > LIMITE_MIDIA) {
    return { ok: false, erro: `${(dados.byteLength / 1024 / 1024).toFixed(1)} MB (o limite é 4 MB)` };
  }

  // O nome só serve para o arquivo ficar reconhecível no painel; a rota gera a
  // chave real. Sem nome na URL, um genérico resolve.
  const nome = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "imagem");
  return { ok: true, dados, tipo, nome };
}

async function subirImagem({ dados, tipo, nome }, base, chave) {
  const form = new FormData();
  form.set("file", new File([dados], nome, { type: tipo }));
  const r = await fetch(new URL("/api/media", base), {
    method: "POST",
    headers: { "x-admin-key": chave },
    body: form,
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    return { ok: false, erro: `${r.status} ${corpo.slice(0, 160)}` };
  }
  const { url } = await r.json();
  return { ok: true, url };
}

/**
 * Re-hospeda a mídia de fora e grava o caminho local em cada ponto.
 *
 * Uma imagem que falha não derruba o ponto: ele entra sem ela, e o link da
 * fonte continua levando ao original. Perder um lineup inteiro porque uma
 * das três imagens deu 404 seria pior do que mostrá-lo com duas.
 */
async function resolverMidia(itens, base, chave) {
  let subidas = 0;
  let falhas = 0;
  for (const { ponto, midia } of itens) {
    if (!midia?.length) continue;
    const caminhos = [];
    for (const url of midia) {
      const baixada = await baixarImagem(url);
      if (!baixada.ok) {
        console.error(`  imagem de "${ponto.titulo}": ${baixada.erro} — ${url.slice(0, 70)}`);
        falhas++;
        continue;
      }
      const subida = await subirImagem(baixada, base, chave);
      if (!subida.ok) {
        console.error(`  imagem de "${ponto.titulo}": upload falhou ${subida.erro}`);
        falhas++;
        continue;
      }
      caminhos.push(subida.url);
      subidas++;
      // Pausa entre arquivos: o import puxa de um servidor que não é nosso, e
      // a rota de mídia também tem limite por minuto.
      await new Promise((r) => setTimeout(r, 800));
    }
    ponto.imagens = caminhos.slice(0, MAX_IMAGENS);
  }
  return { subidas, falhas };
}

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
  const { pontos, itens, erros } = converterTodos(linhas, catalogo);

  console.log(`${pontos.length} de ${linhas.length} prontos.`);
  if (erros.length) {
    console.log(`\n${erros.length} recusados:`);
    for (const e of erros) console.log(`  linha ${e.linha} (${e.titulo}): ${e.erro}`);
  }
  const semFonte = pontos.filter((p) => !p.fonte).length;
  if (semFonte) console.log(`\naviso: ${semFonte} sem fonte. Se vieram de outro site, preencha para dar o crédito.`);

  const comMidia = itens.filter((i) => i.midia.length);
  const arquivos = comMidia.reduce((n, i) => n + i.midia.length, 0);
  if (arquivos) {
    console.log(`\n${arquivos} imagens de fora em ${comMidia.length} pontos.`);
    if (!args.includes("--midia")) {
      console.log("Sem --midia elas são ignoradas e o ponto entra sem imagem; o link da fonte leva ao original.");
    }
  }

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

  // A mídia sobe antes dos pontos: ponto gravado sem a imagem teria de ser
  // editado depois, e arquivo subido sem ponto vira lixo no depósito. Nesta
  // ordem, uma falha no meio deixa no pior caso arquivo órfão, que o painel
  // de mídia mostra e dá para apagar.
  if (arquivos && args.includes("--midia")) {
    console.log(`\nre-hospedando ${arquivos} imagens em ${base}…`);
    const { subidas, falhas } = await resolverMidia(itens, base, chave);
    console.log(`${subidas} imagens gravadas${falhas ? `, ${falhas} falharam` : ""}.`);
  }

  console.log(`\nenviando ${pontos.length} para ${base}…`);
  const feitos = await enviar(pontos, base, chave);
  console.log(`${feitos} gravados.`);
}

// Só roda como programa; importado por teste, não executa nada.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href) {
  await principal();
}
