import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { autorizar } from "../lib/auth.mts";

// Imagens e ícones enviados pelo painel. Leitura é pública (o site mostra as
// imagens); envio, listagem e remoção passam pelo porteiro.
const loja = () => getStore({ name: "estande-midia", consistency: "strong" });

const TIPOS = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
  ["image/svg+xml", "svg"],
  ["image/x-icon", "ico"],
]);

// O payload de uma função é limitado a 6 MB e binário vai em base64 (~30% de
// folga), então 4 MB é o teto real de um arquivo.
const LIMITE = 4 * 1024 * 1024;

function slug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "arquivo";
}

export default async (req: Request, context: Context) => {
  const loja_ = loja();
  const chave = context.params.chave;

  // GET /api/media/:chave — serve o arquivo. Público.
  if (req.method === "GET" && chave) {
    let item: Awaited<ReturnType<typeof loja_.getWithMetadata>>;
    try {
      item = await loja_.getWithMetadata(chave, { type: "arrayBuffer" });
    } catch (e) {
      console.error("Falha ao ler mídia:", chave, e);
      return new Response("Erro ao ler o arquivo.", { status: 502 });
    }
    if (!item) return new Response("Arquivo não encontrado.", { status: 404 });

    const tipo = (item.metadata?.tipo as string) || "application/octet-stream";
    return new Response(item.data as ArrayBuffer, {
      headers: {
        "content-type": tipo,
        // Chaves carregam timestamp, então um arquivo nunca muda de conteúdo.
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  }

  // GET /api/media — lista a biblioteca. Só o painel precisa disso.
  if (req.method === "GET") {
    const veredito = autorizar(req);
    if (!veredito.ok) return veredito.resposta;

    try {
      const { blobs } = await loja_.list();
      const itens = await Promise.all(
        blobs.map(async (b) => {
          const meta = await loja_.getMetadata(b.key);
          return {
            chave: b.key,
            url: `/api/media/${encodeURIComponent(b.key)}`,
            nome: (meta?.metadata?.nome as string) ?? b.key,
            tipo: (meta?.metadata?.tipo as string) ?? "",
            tamanho: (meta?.metadata?.tamanho as number) ?? 0,
            criadoEm: (meta?.metadata?.criadoEm as string) ?? "",
          };
        }),
      );
      itens.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
      return Response.json({ itens });
    } catch (e) {
      console.error("Falha ao listar mídia:", e);
      return Response.json({ erro: "Não foi possível listar a biblioteca." }, { status: 502 });
    }
  }

  // POST /api/media — envia um arquivo.
  if (req.method === "POST") {
    const veredito = autorizar(req);
    if (!veredito.ok) return veredito.resposta;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return Response.json({ erro: "Envie o arquivo como multipart/form-data no campo `file`." }, { status: 400 });
    }

    const arquivo = form.get("file");
    if (!(arquivo instanceof File)) {
      return Response.json({ erro: "Nenhum arquivo no campo `file`." }, { status: 400 });
    }
    if (!TIPOS.has(arquivo.type)) {
      return Response.json(
        { erro: `Formato não aceito (${arquivo.type || "desconhecido"}). Aceitos: PNG, JPG, WEBP, GIF, AVIF, SVG e ICO.` },
        { status: 415 },
      );
    }
    if (arquivo.size > LIMITE) {
      return Response.json(
        { erro: `Arquivo de ${(arquivo.size / 1024 / 1024).toFixed(1)} MB. O limite por envio é 4 MB.` },
        { status: 413 },
      );
    }

    const nova = `${Date.now().toString(36)}-${slug(arquivo.name)}`;
    try {
      await loja_.set(nova, arquivo, {
        metadata: {
          nome: arquivo.name,
          tipo: arquivo.type,
          tamanho: arquivo.size,
          criadoEm: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error("Falha ao gravar mídia:", e);
      return Response.json({ erro: "Não foi possível guardar o arquivo. Veja os logs da função `media`." }, { status: 502 });
    }

    return Response.json({
      ok: true,
      chave: nova,
      url: `/api/media/${encodeURIComponent(nova)}`,
      nome: arquivo.name,
      tipo: arquivo.type,
      tamanho: arquivo.size,
    });
  }

  // DELETE /api/media/:chave
  if (req.method === "DELETE") {
    const veredito = autorizar(req);
    if (!veredito.ok) return veredito.resposta;
    if (!chave) return Response.json({ erro: "Informe a chave do arquivo." }, { status: 400 });
    try {
      await loja_.delete(chave);
    } catch (e) {
      console.error("Falha ao apagar mídia:", chave, e);
      return Response.json({ erro: "Não foi possível apagar o arquivo." }, { status: 502 });
    }
    return Response.json({ ok: true });
  }

  return Response.json({ erro: "Método não permitido." }, { status: 405 });
};

export const config: Config = {
  path: ["/api/media", "/api/media/:chave"],
  method: ["GET", "POST", "DELETE"],
  // Mesma razão da rota de conteúdo: a listagem e o envio pedem a ADMIN_KEY, e
  // sem limite viram superfície para tentativa em massa.
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 30 },
};
