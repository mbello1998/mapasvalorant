import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

/**
 * Agrega o estado real do jogo numa só resposta, do lado do servidor.
 *
 * Existe por três motivos: uma chamada em vez de quatro no carregamento da
 * página, cache de 5 minutos para não martelar a origem, e uma fonte fora do ar
 * não derruba as outras.
 *
 * Status dos servidores brasileiros ficou de fora de propósito: a Riot não
 * publica mais um feed aberto (o antigo
 * valorant.secure.dynamic.riotcdn.net/.../status/br.json nem resolve em DNS, e
 * status.riotgames.com não expõe JSON). O rodapé do site manda para a página
 * oficial, que é a resposta honesta.
 */

const VALIDADE_MS = 5 * 60 * 1000;
const cache = () => getStore({ name: "estande-cache", consistency: "strong" });

type Resultado = {
  geradoEm: string;
  patch: null | {
    versao: string;
    branch: string;
    build: string;
    publicadoEm: string;
    diasNoAr: number;
  };
  ato: null | Janela;
  episodio: null | Janela;
  catalogo: null | { agentes: number; mapas: number; colecoes: number };
  falhas: string[];
};

type Janela = {
  nome: string;
  titulo: string | null;
  comecaEm: string;
  terminaEm: string;
  diasRestantes: number;
  progresso: number;
};

async function json<T>(url: string, sinal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal: sinal, headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} em ${url}`);
  return (await r.json()) as T;
}

type Temporada = {
  displayName: string;
  title: string | null;
  type: string | null;
  startTime: string;
  endTime: string;
};

const DIA = 86_400_000;

function janela(t: Temporada, agora: number): Janela {
  const ini = Date.parse(t.startTime);
  const fim = Date.parse(t.endTime);
  return {
    nome: t.displayName,
    titulo: t.title,
    comecaEm: t.startTime,
    terminaEm: t.endTime,
    diasRestantes: Math.max(0, Math.ceil((fim - agora) / DIA)),
    progresso: Math.min(1, Math.max(0, (agora - ini) / (fim - ini))),
  };
}

async function montar(): Promise<Resultado> {
  const ac = new AbortController();
  const limite = setTimeout(() => ac.abort(), 8000);
  const falhas: string[] = [];

  const [versao, temporadas, agentes, mapas, colecoes] = await Promise.allSettled([
    json<{ data: { version: string; branch: string; buildVersion: string; buildDate: string } }>(
      "https://valorant-api.com/v1/version", ac.signal),
    json<{ data: Temporada[] }>(
      "https://valorant-api.com/v1/seasons?language=pt-BR", ac.signal),
    json<{ data: unknown[] }>("https://valorant-api.com/v1/agents?isPlayableCharacter=true", ac.signal),
    json<{ data: unknown[] }>("https://valorant-api.com/v1/maps", ac.signal),
    json<{ data: unknown[] }>("https://valorant-api.com/v1/bundles", ac.signal),
  ]);
  clearTimeout(limite);

  const agora = Date.now();
  const out: Resultado = {
    geradoEm: new Date().toISOString(),
    patch: null, ato: null, episodio: null, catalogo: null, falhas,
  };

  if (versao.status === "fulfilled") {
    const d = versao.value.data;
    out.patch = {
      versao: d.branch.replace(/^release-/, ""),
      branch: d.branch,
      build: d.version,
      publicadoEm: d.buildDate,
      diasNoAr: Math.max(0, Math.floor((agora - Date.parse(d.buildDate)) / DIA)),
    };
  } else falhas.push("patch");

  if (temporadas.status === "fulfilled") {
    const noAr = temporadas.value.data.filter(
      (t) => Date.parse(t.startTime) <= agora && Date.parse(t.endTime) >= agora,
    );
    const ato = noAr.find((t) => t.type === "EAresSeasonType::Act");
    // O episódio é a temporada sem tipo que engloba os atos.
    const episodio = noAr.find((t) => t.type === null || t.type === "EAresSeasonType::Episode");
    if (ato) out.ato = janela(ato, agora);
    if (episodio) out.episodio = janela(episodio, agora);
    if (!ato && !episodio) falhas.push("ato");
  } else falhas.push("ato");

  if (agentes.status === "fulfilled" && mapas.status === "fulfilled" && colecoes.status === "fulfilled") {
    out.catalogo = {
      agentes: agentes.value.data.length,
      mapas: mapas.value.data.length,
      colecoes: colecoes.value.data.length,
    };
  } else falhas.push("catalogo");

  return out;
}

export default async (_req: Request, context: Context) => {
  const loja = cache();

  try {
    const guardado = await loja.getWithMetadata("live", { type: "json" });
    const geradoEm = guardado?.metadata?.geradoEm as number | undefined;
    if (guardado?.data && geradoEm && Date.now() - geradoEm < VALIDADE_MS) {
      return Response.json(guardado.data, {
        headers: { "cache-control": "public, max-age=60", "x-estande-cache": "hit" },
      });
    }
  } catch (e) {
    console.error("Cache indisponível, seguindo direto para as fontes:", e);
  }

  let dados: Resultado;
  try {
    dados = await montar();
  } catch (e) {
    console.error("Falha ao montar os dados ao vivo:", e);
    return Response.json({ erro: "Nenhuma das fontes respondeu." }, { status: 502 });
  }

  // Gravar o cache não pode atrasar a resposta de quem está esperando.
  context.waitUntil(
    loja.setJSON("live", dados, { metadata: { geradoEm: Date.now() } })
      .catch((e) => console.error("Falha ao gravar o cache:", e)),
  );

  return Response.json(dados, {
    headers: { "cache-control": "public, max-age=60", "x-estande-cache": "miss" },
  });
};

export const config: Config = {
  path: "/api/live",
  method: ["GET"],
};
