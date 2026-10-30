import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { coletarNoticias, type Coleta } from "../lib/noticias.mts";

// Entrega as notícias já coletadas. A coleta periódica fica em
// `coletar-noticias.mts`; aqui só há uma rede de segurança: se o depósito
// estiver vazio ou muito velho, coleta na hora para a página nunca abrir sem
// notícia nenhuma.

const VALIDADE_MS = 3 * 60 * 60 * 1000;
export const CHAVE = "noticias";
const loja = () => getStore({ name: "estande-noticias", consistency: "strong" });

export default async (_req: Request, context: Context) => {
  const loja_ = loja();

  let guardada: Coleta | null = null;
  try {
    guardada = await loja_.get(CHAVE, { type: "json" });
  } catch (e) {
    console.error("Não foi possível ler as notícias guardadas:", e);
  }

  const idade = guardada?.coletadoEm
    ? Date.now() - Date.parse(guardada.coletadoEm)
    : Number.POSITIVE_INFINITY;

  if (guardada?.itens?.length && idade < VALIDADE_MS) {
    return Response.json(guardada, {
      headers: { "cache-control": "public, max-age=900", "x-estande-cache": "hit" },
    });
  }

  const fresca = await coletarNoticias();

  // Coleta falhou mas existe uma versão boa: devolve a antiga em vez de nada.
  if (fresca.erro && guardada?.itens?.length) {
    return Response.json(
      { ...guardada, erro: fresca.erro },
      { headers: { "cache-control": "public, max-age=300", "x-estande-cache": "stale" } },
    );
  }

  if (!fresca.erro) {
    context.waitUntil(
      loja_.setJSON(CHAVE, fresca).catch((e) => console.error("Falha ao guardar as notícias:", e)),
    );
  }

  return Response.json(fresca, {
    status: fresca.erro ? 502 : 200,
    headers: { "cache-control": "public, max-age=300", "x-estande-cache": "miss" },
  });
};

export const config: Config = {
  path: "/api/noticias",
  method: ["GET"],
};
