import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { autorizar } from "../lib/auth.mts";
import {
  MODOS, ehModo, indiceDe, patenteDoIndice, LIMITES, type Modo,
} from "../lib/elo.mts";
import { lerSessao, COOKIE } from "../lib/contas.mts";

/**
 * O ranking público.
 *
 * Forma do armazenamento: cada envio vira um blob próprio, com chave única.
 * Ninguém nunca lê-e-reescreve a mesma chave, então dois envios ao mesmo tempo
 * não se atropelam — o que aconteceria com uma lista única sendo reescrita, e
 * é justamente o que o Blobs não garante. A consolidação periódica
 * (`consolidar-ranking`) é quem junta tudo numa tabela só, e ela é escritor
 * único.
 *
 * Publicar exige conta: o apelido vem de lá, não do corpo da requisição. Isso
 * impede que alguém publique com o nome de outra pessoa.
 *
 * O que continua NÃO impedido, e é melhor estar escrito: trapaça. Ter conta não
 * prova que a pontuação veio de uma sessão real — dá para forjar o corpo do
 * envio do mesmo jeito. O que existe é teto de sanidade por exercício,
 * coerência entre os campos, limite por IP e o botão de apagar no painel. A
 * conta resolve identidade, não honestidade.
 */

const loja = () => getStore({ name: "estande-ranking", consistency: "strong" });

const CHAVE_TABELA = "tabela";
const POR_MODO = 100;
const JANELA_REENVIO_MS = 20_000;

export type Entrada = {
  id: string;
  modo: Modo;
  nome: string;
  valor: number;
  indice: number;
  patente: number;
  precisao: number | null;
  detalhe: string | null;
  em: string;
  /** Quando o painel muda a patente a mão, a entrada fica marcada. */
  ajustado?: boolean;
  /** Entrada de demonstração, criada pelo painel. Nunca é pontuação de alguém. */
  exemplo?: boolean;
};

export type Tabela = {
  consolidadoEm: string | null;
  modos: Record<string, Entrada[]>;
  /** Resumo de todo mundo, para a página inicial não precisar somar. */
  resumo?: {
    jogadores: number;
    envios: number;
    mediaIndice: number | null;
    mediaPatente: number | null;
  };
};

const tabelaVazia = (): Tabela => ({
  consolidadoEm: null,
  modos: Object.fromEntries(MODOS.map((m) => [m, []])),
});

/** Melhor primeiro; em todo exercício o índice já embute o "maior é melhor". */
export function ordenar(a: Entrada, b: Entrada): number {
  return b.indice - a.indice || a.em.localeCompare(b.em);
}

/** Uma entrada por apelido por exercício: a melhor dele. */
export function compactar(entradas: Entrada[]): Entrada[] {
  const melhorPorNome = new Map<string, Entrada>();
  for (const e of entradas) {
    const chave = e.nome.toLowerCase();
    const atual = melhorPorNome.get(chave);
    if (!atual || ordenar(e, atual) < 0) melhorPorNome.set(chave, e);
  }
  return [...melhorPorNome.values()].sort(ordenar).slice(0, POR_MODO);
}

/** Lê os envios ainda não consolidados. Normalmente são poucos. */
async function lerPendentes(loja_: ReturnType<typeof loja>): Promise<Entrada[]> {
  const { blobs } = await loja_.list({ prefix: "envios/" });
  if (!blobs.length) return [];
  const lidos = await Promise.all(
    blobs.slice(0, 400).map((b) => loja_.get(b.key, { type: "json" }).catch(() => null)),
  );
  return lidos.filter((e): e is Entrada => Boolean(e && typeof e === "object"));
}

/**
 * A média do elo de quem está na tabela.
 *
 * Média por pessoa, não por envio: quem treinou os quatro exercícios não pesa
 * quatro vezes mais que quem treinou um. Primeiro tira-se a média de cada
 * apelido, depois a média dessas médias.
 */
function resumir(modos: Record<string, Entrada[]>) {
  const porPessoa = new Map<string, number[]>();
  let envios = 0;
  for (const lista of Object.values(modos)) {
    for (const e of lista) {
      envios++;
      const chave = e.nome.toLowerCase();
      if (!porPessoa.has(chave)) porPessoa.set(chave, []);
      porPessoa.get(chave)!.push(e.indice);
    }
  }
  if (!porPessoa.size) {
    return { jogadores: 0, envios: 0, mediaIndice: null, mediaPatente: null };
  }
  const medias = [...porPessoa.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
  const media = medias.reduce((a, b) => a + b, 0) / medias.length;
  return {
    jogadores: porPessoa.size,
    envios,
    mediaIndice: Math.round(media),
    mediaPatente: patenteDoIndice(media),
  };
}

export async function montarTabela(loja_: ReturnType<typeof loja>): Promise<Tabela> {
  const guardada = (await loja_.get(CHAVE_TABELA, { type: "json" }).catch(() => null)) as Tabela | null;
  const base = guardada ?? tabelaVazia();
  const pendentes = await lerPendentes(loja_);

  if (!pendentes.length) {
    base.resumo = resumir(base.modos);
    return base;
  }

  const saida = tabelaVazia();
  saida.consolidadoEm = base.consolidadoEm;
  for (const modo of MODOS) {
    saida.modos[modo] = compactar([...(base.modos[modo] ?? []), ...pendentes.filter((e) => e.modo === modo)]);
  }
  saida.resumo = resumir(saida.modos);
  return saida;
}

/* ------------------------------------------------------------- validação -- */

function validar(corpo: Record<string, unknown>, apelido: string): { ok: true; entrada: Entrada } | { ok: false; erro: string } {
  const modo = corpo.modo;
  if (!ehModo(modo)) return { ok: false, erro: "Exercício desconhecido." };

  const valor = Number(corpo.valor);
  if (!Number.isFinite(valor)) return { ok: false, erro: "Desempenho inválido." };

  const lim = LIMITES[modo];
  if (valor < lim.min || valor > lim.max) {
    return { ok: false, erro: `Esse número está fora do que é humanamente possível neste exercício (${lim.min}–${lim.max}).` };
  }

  // Coerência: a sessão precisa ter durado e ter tido tiros de verdade.
  const duracao = Number(corpo.duracao);
  if (!Number.isFinite(duracao) || duracao < 10) {
    return { ok: false, erro: "Sessão curta demais para entrar no ranking: faça pelo menos 10 segundos." };
  }

  const tiros = Number(corpo.tiros);
  const acertos = Number(corpo.acertos);
  if (modo !== "tracking") {
    if (!Number.isFinite(tiros) || !Number.isFinite(acertos)) {
      return { ok: false, erro: "Faltam os números da sessão." };
    }
    if (acertos > tiros) return { ok: false, erro: "Mais acertos que tiros não existe." };
    if (acertos < 1) return { ok: false, erro: "Sessão sem nenhum acerto não entra no ranking." };
    // A cadência de cliques também tem teto: ninguém clica 25 vezes por segundo.
    if (tiros / duracao > 25) return { ok: false, erro: "Cadência de cliques acima do possível." };
  }

  const precisao = Number(corpo.precisao);
  const indice = indiceDe(modo, valor);

  return {
    ok: true,
    entrada: {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      modo,
      nome: apelido,
      valor: Math.round(valor * 100) / 100,
      indice,
      patente: patenteDoIndice(indice),
      precisao: Number.isFinite(precisao) ? Math.round(precisao) : null,
      detalhe: typeof corpo.detalhe === "string" ? corpo.detalhe.slice(0, 40) : null,
      em: new Date().toISOString(),
    },
  };
}

/* -------------------------------------------------------------- exemplos -- */

/**
 * Entradas de demonstração, para a tabela não abrir vazia.
 *
 * Saem marcadas com `exemplo: true` e aparecem com a etiqueta "exemplo" na
 * tabela pública. A marca não é enfeite: sem ela seriam pontuações inventadas
 * passando por pontuações de gente, e a tabela estaria mentindo para quem a
 * lê. Um clique no painel apaga todas.
 */
const SEMENTES: Array<{ nome: string; modo: Modo; valor: number; precisao: number; detalhe?: string }> = [
  { nome: "Exemplo · Lia",  modo: "gridshot", valor: 3.9, precisao: 92 },
  { nome: "Exemplo · Rafa", modo: "gridshot", valor: 3.1, precisao: 86 },
  { nome: "Exemplo · Bia",  modo: "gridshot", valor: 2.4, precisao: 79 },
  { nome: "Exemplo · Caio", modo: "gridshot", valor: 1.8, precisao: 71 },
  { nome: "Exemplo · Lia",  modo: "tracking", valor: 74,  precisao: 74 },
  { nome: "Exemplo · Rafa", modo: "tracking", valor: 61,  precisao: 61 },
  { nome: "Exemplo · Nina", modo: "tracking", valor: 47,  precisao: 47 },
  { nome: "Exemplo · Lia",  modo: "flick",    valor: 268, precisao: 88 },
  { nome: "Exemplo · Caio", modo: "flick",    valor: 331, precisao: 80 },
  { nome: "Exemplo · Nina", modo: "flick",    valor: 402, precisao: 72 },
  { nome: "Exemplo · Rafa", modo: "linha",    valor: 31,  precisao: 58, detalhe: "Vandal" },
  { nome: "Exemplo · Bia",  modo: "linha",    valor: 24,  precisao: 49, detalhe: "Phantom" },
  { nome: "Exemplo · Nina", modo: "linha",    valor: 17,  precisao: 44, detalhe: "Sheriff" },
];

async function semearExemplos(loja_: ReturnType<typeof loja>): Promise<Response> {
  const agora = Date.now();
  let gravados = 0;
  for (const [i, sem] of SEMENTES.entries()) {
    const indice = indiceDe(sem.modo, sem.valor);
    const entrada: Entrada = {
      id: `exemplo-${sem.modo}-${i}`,
      modo: sem.modo,
      nome: sem.nome,
      valor: sem.valor,
      indice,
      patente: patenteDoIndice(indice),
      precisao: sem.precisao,
      detalhe: sem.detalhe ?? null,
      // Datas espalhadas, para a tabela não parecer despejada num instante só.
      em: new Date(agora - (i + 1) * 7 * 3600_000).toISOString(),
      exemplo: true,
    };
    try {
      await loja_.setJSON(`envios/${entrada.id}`, entrada);
      gravados++;
    } catch (e) {
      console.error("Falha ao gravar exemplo:", entrada.id, e);
    }
  }
  return Response.json({ ok: true, gravados });
}

async function limparExemplos(loja_: ReturnType<typeof loja>): Promise<Response> {
  let apagados = 0;
  try {
    const { blobs } = await loja_.list({ prefix: "envios/exemplo-" });
    for (const b of blobs) {
      await loja_.delete(b.key).catch(() => {});
      apagados++;
    }
    const tabela = (await loja_.get(CHAVE_TABELA, { type: "json" })) as Tabela | null;
    if (tabela) {
      for (const modo of MODOS) {
        const antes = (tabela.modos[modo] ?? []).length;
        tabela.modos[modo] = (tabela.modos[modo] ?? []).filter((e) => !e.exemplo);
        apagados += antes - tabela.modos[modo].length;
      }
      await loja_.setJSON(CHAVE_TABELA, tabela);
    }
  } catch (e) {
    console.error("Falha ao limpar exemplos:", e);
    return Response.json({ erro: "Não foi possível limpar os exemplos." }, { status: 502 });
  }
  return Response.json({ ok: true, apagados });
}

/* ------------------------------------------------------------------ rotas -- */

export default async (req: Request, context: Context) => {
  const loja_ = loja();

  if (req.method === "GET") {
    try {
      const tabela = await montarTabela(loja_);
      return Response.json(tabela, {
        headers: { "cache-control": "public, max-age=20" },
      });
    } catch (e) {
      console.error("Falha ao montar o ranking:", e);
      return Response.json({ erro: "Não foi possível ler o ranking." }, { status: 502 });
    }
  }

  if (req.method === "POST") {
    let corpo: Record<string, unknown>;
    try {
      corpo = await req.json();
    } catch {
      return Response.json({ erro: "Corpo inválido." }, { status: 400 });
    }

    // Semear ou limpar as entradas de exemplo: só o painel faz isso.
    if (corpo.exemplos === true || corpo.limparExemplos === true) {
      const aut = autorizar(req);
      if (!aut.ok) return aut.resposta;
      return corpo.exemplos === true ? semearExemplos(loja_) : limparExemplos(loja_);
    }

    // Publicar exige estar logado. O apelido sai da conta.
    const conta = await lerSessao(context.cookies.get(COOKIE));
    if (!conta) {
      return Response.json(
        { erro: "Entre na sua conta para publicar no ranking.", precisaEntrar: true },
        { status: 401 },
      );
    }

    const veredito = validar(corpo, conta.apelido);
    if (!veredito.ok) return Response.json({ erro: veredito.erro }, { status: 422 });

    // Trava simples de reenvio: o mesmo apelido no mesmo exercício não pode
    // despejar vinte envios seguidos. Não impede trapaça, reduz inundação.
    const trava = `trava/${veredito.entrada.modo}/${veredito.entrada.nome.toLowerCase()}`;
    try {
      const ultimo = await loja_.getMetadata(trava);
      const quando = ultimo?.metadata?.em as number | undefined;
      if (quando && Date.now() - quando < JANELA_REENVIO_MS) {
        return Response.json(
          { erro: "Espere alguns segundos antes de enviar de novo com esse apelido." },
          { status: 429 },
        );
      }
    } catch { /* sem trava anterior, segue */ }

    try {
      await loja_.setJSON(`envios/${veredito.entrada.id}`, veredito.entrada);
      context.waitUntil(
        loja_.set(trava, "1", { metadata: { em: Date.now() } })
          .catch((e) => console.error("Falha ao gravar a trava:", e)),
      );
    } catch (e) {
      console.error("Falha ao gravar o envio:", e);
      return Response.json({ erro: "Não foi possível gravar no ranking." }, { status: 502 });
    }

    const tabela = await montarTabela(loja_).catch(() => null);
    const lista = tabela?.modos[veredito.entrada.modo] ?? [];
    const posicao = lista.findIndex((e) => e.id === veredito.entrada.id);

    return Response.json({
      ok: true,
      entrada: veredito.entrada,
      posicao: posicao >= 0 ? posicao + 1 : null,
      total: lista.length,
    });
  }

  // Mudar a patente de alguém: só o painel.
  if (req.method === "PATCH") {
    const aut = autorizar(req);
    if (!aut.ok) return aut.resposta;

    let corpo: Record<string, unknown>;
    try {
      corpo = await req.json();
    } catch {
      return Response.json({ erro: "Corpo inválido." }, { status: 400 });
    }

    const id = typeof corpo.id === "string" ? corpo.id : "";
    const patente = Number(corpo.patente);
    if (!id) return Response.json({ erro: "Informe o id da entrada." }, { status: 400 });
    if (!Number.isInteger(patente) || patente < 0 || patente > 24) {
      return Response.json({ erro: "A patente vai de 0 (Ferro 1) a 24 (Radiante)." }, { status: 422 });
    }

    let achou = false;
    try {
      // A entrada pode estar na tabela consolidada ou ainda entre os envios.
      const tabela = (await loja_.get(CHAVE_TABELA, { type: "json" })) as Tabela | null;
      if (tabela) {
        for (const modo of MODOS) {
          for (const e of tabela.modos[modo] ?? []) {
            if (e.id === id) { e.patente = patente; e.ajustado = true; achou = true; }
          }
        }
        if (achou) await loja_.setJSON(CHAVE_TABELA, tabela);
      }

      if (!achou) {
        const pendente = (await loja_.get(`envios/${id}`, { type: "json" })) as Entrada | null;
        if (pendente) {
          pendente.patente = patente;
          pendente.ajustado = true;
          await loja_.setJSON(`envios/${id}`, pendente);
          achou = true;
        }
      }
    } catch (e) {
      console.error("Falha ao ajustar a patente:", e);
      return Response.json({ erro: "Não foi possível ajustar." }, { status: 502 });
    }

    if (!achou) return Response.json({ erro: "Entrada não encontrada." }, { status: 404 });
    return Response.json({ ok: true, patente });
  }

  // Apagar uma entrada: só o painel.
  if (req.method === "DELETE") {
    const aut = autorizar(req);
    if (!aut.ok) return aut.resposta;

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ erro: "Informe o id da entrada." }, { status: 400 });

    try {
      // Pode estar pendente ou já consolidada: tira dos dois lugares.
      await loja_.delete(`envios/${id}`).catch(() => {});

      const tabela = (await loja_.get(CHAVE_TABELA, { type: "json" })) as Tabela | null;
      if (tabela) {
        for (const modo of MODOS) {
          tabela.modos[modo] = (tabela.modos[modo] ?? []).filter((e) => e.id !== id);
        }
        await loja_.setJSON(CHAVE_TABELA, tabela);
      }
    } catch (e) {
      console.error("Falha ao apagar a entrada:", e);
      return Response.json({ erro: "Não foi possível apagar." }, { status: 502 });
    }
    return Response.json({ ok: true });
  }

  return Response.json({ erro: "Método não permitido." }, { status: 405 });
};

export const config: Config = {
  path: "/api/ranking",
  method: ["GET", "POST", "PATCH", "DELETE"],
  // Trava de inundação por IP, aplicada pela própria plataforma.
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 20 },
};
