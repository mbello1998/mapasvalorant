import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { autorizar } from "../lib/auth.mts";
import { normalizarPonto, lerPontos, novoId, LIMITE_PONTOS } from "../lib/tatica.mts";
import type { Ponto } from "../lib/tatica.mts";
import { ACERVO } from "../lib/acervo-tatica.mts";

const CHAVE = "pontos";
// Marca que o acervo inicial já foi gravado. Sem ela, apagar tudo pelo painel
// faria o acervo voltar na visita seguinte.
const SEMEADO = "semeado";

// Consistência forte: o painel grava e recarrega a lista em seguida, e precisa
// ver o que acabou de salvar.
const loja = () => getStore({ name: "estande-tatica", consistency: "strong" });

/** Um ponto cabe em poucos KB; este teto só impede corpo absurdo. */
const LIMITE_BYTES = 16 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALIDADE_MAPAS_MS = 3600_000;
// Falha do catálogo: espera um pouco antes de tentar de novo, para não pagar o
// tempo de uma requisição lenta a cada cadastro enquanto o CDN está fora.
const NOVA_TENTATIVA_MS = 60_000;

let mapasEmMemoria: { uuids: Set<string>; vence: number } | null = null;

/**
 * UUIDs dos mapas da API da Riot, em memória por uma hora. Se a busca falhar,
 * vale o conjunto anterior; sem nenhum, devolve null e quem chama aceita o uuid
 * enviado — um catálogo fora do ar não pode travar o cadastro.
 */
async function mapasValidos(): Promise<Set<string> | null> {
  if (mapasEmMemoria && Date.now() < mapasEmMemoria.vence) return mapasEmMemoria.uuids;

  try {
    const r = await fetch("https://valorant-api.com/v1/maps", { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const corpo = await r.json() as { data?: Array<{ uuid?: string }> };
    const uuids = new Set(
      (corpo.data ?? []).map((m) => m?.uuid).filter((u): u is string => typeof u === "string"),
    );
    if (!uuids.size) throw new Error("catálogo vazio");
    mapasEmMemoria = { uuids, vence: Date.now() + VALIDADE_MAPAS_MS };
    return uuids;
  } catch (e) {
    console.error("Catálogo de mapas indisponível:", e);
    if (mapasEmMemoria) {
      mapasEmMemoria.vence = Date.now() + NOVA_TENTATIVA_MS;
      return mapasEmMemoria.uuids;
    }
    return null;
  }
}

/** Conjunto para validar o ponto: o catálogo, ou o próprio uuid se tiver forma de uuid. */
async function mapasParaValidar(mapa: unknown): Promise<Set<string>> {
  const catalogo = await mapasValidos();
  if (catalogo) return catalogo;
  const m = typeof mapa === "string" ? mapa.trim() : "";
  return new Set(UUID.test(m) ? [m] : []);
}

const erro = (status: number, mensagem: string) => Response.json({ erro: mensagem }, { status });

type Corpo = { ok: true; corpo: Record<string, unknown> } | { ok: false; resposta: Response };

async function lerCorpo(req: Request): Promise<Corpo> {
  const bruto = await req.text();
  if (bruto.length > LIMITE_BYTES) return { ok: false, resposta: erro(413, "Ponto grande demais.") };
  let json: unknown;
  try {
    json = JSON.parse(bruto);
  } catch {
    return { ok: false, resposta: erro(400, "JSON inválido.") };
  }
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, resposta: erro(400, "O corpo precisa ser um objeto JSON.") };
  }
  return { ok: true, corpo: json as Record<string, unknown> };
}

export default async (req: Request, _context: Context) => {
  const l = loja();
  const url = new URL(req.url);

  if (req.method === "GET") {
    let pontos: Ponto[] = [];
    let leu = false;
    try {
      pontos = lerPontos(await l.get(CHAVE, { type: "json" }));
      leu = true;
    } catch (e) {
      console.error("Falha ao ler os pontos:", e);
    }

    // Depósito vazio e nunca semeado: grava o acervo uma vez. Só depois de uma
    // leitura que deu certo, para não semear por cima de pontos que não se leu.
    // Os pontos entram antes da marca: se a marca falhar, o pior caso é o acervo
    // reaparecer uma vez depois de o dono apagar tudo; o inverso deixaria a
    // página vazia para sempre.
    if (leu && pontos.length === 0) {
      try {
        if ((await l.get(SEMEADO)) === null) {
          const agora = new Date().toISOString();
          const semeados = ACERVO.map((p) => ({ ...p, id: novoId(), criadoEm: agora }));
          await l.setJSON(CHAVE, semeados);
          pontos = semeados;
          await l.set(SEMEADO, agora);
        }
      } catch (e) {
        console.error("Falha ao semear o acervo:", e);
      }
    }
    const mapa = url.searchParams.get("mapa");
    if (mapa) pontos = pontos.filter((p) => p.mapa === mapa);
    return Response.json(
      { pontos },
      { headers: { "cache-control": "public, max-age=0, must-revalidate" } },
    );
  }

  if (req.method !== "POST" && req.method !== "PATCH" && req.method !== "DELETE") {
    return erro(405, "Método não permitido.");
  }

  const veredito = autorizar(req);
  if (!veredito.ok) return veredito.resposta;

  // Escrever é ler a lista inteira, mexer e gravar de volta. Se a leitura falhar
  // não dá para seguir como se a lista estivesse vazia: gravaria por cima de
  // todos os pontos.
  let pontos: Ponto[];
  try {
    pontos = lerPontos(await l.get(CHAVE, { type: "json" }));
  } catch (e) {
    console.error("Falha ao ler os pontos antes de gravar:", e);
    return erro(502, "Não foi possível ler os pontos no Netlify Blobs. Veja os logs da função `tatica`.");
  }

  const gravar = async (lista: Ponto[]): Promise<Response | null> => {
    try {
      await l.setJSON(CHAVE, lista);
      // Quem já mexeu na lista pelo painel não precisa do acervo: sem a marca,
      // apagar tudo depois traria o acervo de volta.
      try {
        if ((await l.get(SEMEADO)) === null) await l.set(SEMEADO, new Date().toISOString());
      } catch (e) {
        console.error("Falha ao gravar a marca de semeado:", e);
      }
      return null;
    } catch (e) {
      console.error("Falha ao gravar os pontos:", e);
      return erro(502, "Não foi possível gravar no Netlify Blobs. Veja os logs da função `tatica`.");
    }
  };

  if (req.method === "POST") {
    const lido = await lerCorpo(req);
    if (!lido.ok) return lido.resposta;

    if (pontos.length >= LIMITE_PONTOS) {
      return erro(409, `O limite é de ${LIMITE_PONTOS} pontos. Apague algum antes de cadastrar outro.`);
    }

    const r = normalizarPonto(lido.corpo, await mapasParaValidar(lido.corpo.mapa));
    if (!r.ok) return erro(422, r.erro);

    // `id` e `criadoEm` são do servidor: normalizarPonto ignora o que o cliente
    // mandar nesses campos e aqui eles entram por último.
    const ponto: Ponto = { ...r.ponto, id: novoId(), criadoEm: new Date().toISOString() };
    const falhou = await gravar([...pontos, ponto]);
    return falhou ?? Response.json(ponto);
  }

  if (req.method === "PATCH") {
    const lido = await lerCorpo(req);
    if (!lido.ok) return lido.resposta;

    const id = url.searchParams.get("id") ?? (typeof lido.corpo.id === "string" ? lido.corpo.id : "");
    const i = pontos.findIndex((p) => p.id === id);
    if (i < 0) return erro(404, "Ponto não encontrado.");

    // Mescla e revalida o ponto inteiro: validar só os campos enviados deixaria
    // passar combinações inválidas, como virar pixel sem destino.
    const atual = pontos[i];
    const { id: _id, criadoEm: _criadoEm, ...mudancas } = lido.corpo;
    const mesclado = { ...atual, ...mudancas };
    const r = normalizarPonto(mesclado, await mapasParaValidar(mesclado.mapa));
    if (!r.ok) return erro(422, r.erro);

    const ponto: Ponto = { ...r.ponto, id: atual.id, criadoEm: atual.criadoEm };
    const lista = [...pontos];
    lista[i] = ponto;
    const falhou = await gravar(lista);
    return falhou ?? Response.json(ponto);
  }

  // DELETE
  const id = url.searchParams.get("id");
  if (!id) return erro(400, "Informe o id do ponto.");
  if (!pontos.some((p) => p.id === id)) return erro(404, "Ponto não encontrado.");
  const falhou = await gravar(pontos.filter((p) => p.id !== id));
  return falhou ?? Response.json({ ok: true });
};

export const config: Config = {
  path: "/api/tatica",
  method: ["GET", "POST", "PATCH", "DELETE"],
  // Mesma proteção de /api/content: sem limite, a ADMIN_KEY pode ser adivinhada
  // por tentativa em massa. Vinte por minuto por IP.
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 20 },
};
