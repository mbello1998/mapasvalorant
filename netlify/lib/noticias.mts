// Coleta das notícias oficiais do VALORANT em português.
//
// A Riot não publica feed RSS nem API aberta de notícias. A página
// playvalorant.com/pt-br/news é um app Next.js que embute todo o conteúdo num
// <script id="__NEXT_DATA__"> — 200 artigos com título, resumo, categoria, data
// e imagem. É daí que sai tudo aqui.
//
// Isso é raspagem de uma estrutura que não nos pertence: ela pode mudar sem
// aviso. Por isso o coletor nunca sobrescreve o que já deu certo com uma coleta
// vazia, e registra o motivo da falha para aparecer no painel.

export type Noticia = {
  id: string;
  titulo: string;
  resumo: string;
  categoria: string;
  categoriaId: string;
  publicadoEm: string;
  url: string;
  imagem: string | null;
  externo: boolean;
};

export type Coleta = {
  itens: Noticia[];
  coletadoEm: string;
  total: number;
  categorias: Array<{ id: string; nome: string; quantidade: number }>;
  erro: string | null;
};

const ORIGEM = "https://playvalorant.com/pt-br/news/";
const BASE = "https://playvalorant.com";

/** Tira a marcação do resumo e normaliza o espaçamento. */
function texto(valor: unknown): string {
  if (typeof valor === "string") return limpar(valor);
  if (valor && typeof valor === "object") {
    const corpo = (valor as { body?: unknown }).body;
    if (typeof corpo === "string") return limpar(corpo);
  }
  return "";
}

function limpar(bruto: string): string {
  return bruto
    .replace(/<[^<>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

type Item = {
  title?: string;
  description?: unknown;
  publishedAt?: string;
  category?: { machineName?: string; title?: string };
  action?: { payload?: { url?: string } };
  media?: { url?: string };
  imageMedia?: { url?: string };
  analytics?: { contentId?: string };
};

/** Varre as "blades" da página atrás da grade de artigos. */
function acharItens(no: unknown, profundidade = 0): Item[] | null {
  if (profundidade > 8 || !no || typeof no !== "object") return null;

  if (Array.isArray(no)) {
    for (const filho of no) {
      const achado = acharItens(filho, profundidade + 1);
      if (achado) return achado;
    }
    return null;
  }

  const obj = no as Record<string, unknown>;
  if (obj.type === "articleCardGrid" && Array.isArray(obj.items) && obj.items.length) {
    return obj.items as Item[];
  }
  for (const valor of Object.values(obj)) {
    const achado = acharItens(valor, profundidade + 1);
    if (achado) return achado;
  }
  return null;
}

function converter(bruto: Item, indice: number): Noticia | null {
  const titulo = typeof bruto.title === "string" ? limpar(bruto.title) : "";
  if (!titulo) return null;

  const alvo = bruto.action?.payload?.url ?? "";
  if (!alvo) return null;

  const externo = /^https?:\/\//i.test(alvo);
  const url = externo ? alvo : `${BASE}${alvo.startsWith("/") ? "" : "/"}${alvo}`;

  return {
    id: bruto.analytics?.contentId ?? `${indice}-${titulo.slice(0, 40)}`,
    titulo,
    resumo: texto(bruto.description),
    categoria: limpar(bruto.category?.title ?? "") || "VALORANT",
    categoriaId: bruto.category?.machineName ?? "geral",
    publicadoEm: bruto.publishedAt ?? "",
    url,
    imagem: bruto.imageMedia?.url ?? bruto.media?.url ?? null,
    externo,
  };
}

export async function coletarNoticias(limite = 60): Promise<Coleta> {
  const agora = new Date().toISOString();
  const vazia = (erro: string): Coleta =>
    ({ itens: [], coletadoEm: agora, total: 0, categorias: [], erro });

  const ac = new AbortController();
  const corta = setTimeout(() => ac.abort(), 15_000);

  let html: string;
  try {
    const r = await fetch(ORIGEM, {
      signal: ac.signal,
      headers: {
        // Sem um user-agent de navegador a página devolve um esqueleto vazio.
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        "accept-language": "pt-BR,pt;q=0.9",
        accept: "text/html",
      },
    });
    if (!r.ok) return vazia(`A página de notícias respondeu ${r.status}.`);
    html = await r.text();
  } catch (e) {
    return vazia(`Não foi possível abrir a página de notícias: ${(e as Error).message}`);
  } finally {
    clearTimeout(corta);
  }

  const bloco = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!bloco) {
    return vazia("A página não traz mais o bloco __NEXT_DATA__ — a estrutura do site da Riot mudou.");
  }

  let dados: unknown;
  try {
    dados = JSON.parse(bloco[1]);
  } catch {
    return vazia("O bloco de dados da página não é JSON válido.");
  }

  const brutos = acharItens(dados);
  if (!brutos?.length) {
    return vazia("A grade de artigos não foi encontrada na página — a estrutura do site da Riot mudou.");
  }

  const itens = brutos
    .map(converter)
    .filter((n): n is Noticia => n !== null)
    .sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm))
    .slice(0, limite);

  const contagem = new Map<string, { id: string; nome: string; quantidade: number }>();
  for (const n of itens) {
    const atual = contagem.get(n.categoriaId);
    if (atual) atual.quantidade++;
    else contagem.set(n.categoriaId, { id: n.categoriaId, nome: n.categoria, quantidade: 1 });
  }

  return {
    itens,
    coletadoEm: agora,
    total: brutos.length,
    categorias: [...contagem.values()].sort((a, b) => b.quantidade - a.quantidade),
    erro: null,
  };
}
