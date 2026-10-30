import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { conteudoPadrao } from "../lib/defaults.mts";
import { autorizar } from "../lib/auth.mts";

const CHAVE = "conteudo";

// Consistência forte: logo depois de salvar, o painel recarrega e precisa ver o
// que acabou de gravar — com o padrão eventual isso levaria até 60 s.
const loja = () => getStore({ name: "estande", consistency: "strong" });

/** Limites de sanidade. O painel é a interface, mas a função é quem valida. */
const LIMITE_BYTES = 512 * 1024;

function validar(valor: unknown): string | null {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) {
    return "O corpo precisa ser um objeto JSON.";
  }
  const c = valor as Record<string, unknown>;

  if (!c.site || typeof c.site !== "object") return "Falta o bloco `site`.";
  const nome = (c.site as Record<string, unknown>).nome;
  if (typeof nome !== "string" || !nome.trim()) return "`site.nome` não pode ficar vazio.";

  for (const campo of ["nav", "modos", "links"] as const) {
    if (campo in c && !Array.isArray(c[campo])) return `\`${campo}\` precisa ser uma lista.`;
  }
  if (c.lancamentos && !Array.isArray((c.lancamentos as Record<string, unknown>).itens)) {
    return "`lancamentos.itens` precisa ser uma lista.";
  }
  if (c.tema) {
    const tema = c.tema as Record<string, unknown>;
    for (const [k, v] of Object.entries(tema)) {
      if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) {
        return `tema.${k} precisa ser uma cor hex de 6 dígitos (ex.: #16262E).`;
      }
    }
  }
  return null;
}

export default async (req: Request, _context: Context) => {
  const loja_ = loja();

  if (req.method === "GET") {
    let salvo: unknown = null;
    try {
      salvo = await loja_.get(CHAVE, { type: "json" });
    } catch (e) {
      console.error("Falha ao ler o conteúdo salvo:", e);
    }
    const corpo = salvo ?? conteudoPadrao;
    return Response.json(
      { conteudo: corpo, origem: salvo ? "blobs" : "padrao" },
      { headers: { "cache-control": "public, max-age=0, must-revalidate" } },
    );
  }

  if (req.method === "PUT") {
    const veredito = autorizar(req);
    if (!veredito.ok) return veredito.resposta;

    const bruto = await req.text();
    if (bruto.length > LIMITE_BYTES) {
      return Response.json(
        { erro: `Conteúdo grande demais (${Math.round(bruto.length / 1024)} KB; o limite é 512 KB). Use o gerenciador de mídia para imagens em vez de colar data: URLs.` },
        { status: 413 },
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(bruto);
    } catch {
      return Response.json({ erro: "JSON inválido." }, { status: 400 });
    }

    const problema = validar(json);
    if (problema) return Response.json({ erro: problema }, { status: 422 });

    try {
      await loja_.setJSON(CHAVE, json);
    } catch (e) {
      console.error("Falha ao gravar o conteúdo:", e);
      return Response.json(
        { erro: "Não foi possível gravar no Netlify Blobs. Veja os logs da função `content`." },
        { status: 502 },
      );
    }
    return Response.json({ ok: true, salvoEm: new Date().toISOString() });
  }

  if (req.method === "DELETE") {
    const veredito = autorizar(req);
    if (!veredito.ok) return veredito.resposta;
    try {
      await loja_.delete(CHAVE);
    } catch (e) {
      console.error("Falha ao apagar o conteúdo:", e);
      return Response.json({ erro: "Não foi possível restaurar o padrão." }, { status: 502 });
    }
    return Response.json({ ok: true, conteudo: conteudoPadrao });
  }

  return Response.json({ erro: "Método não permitido." }, { status: 405 });
};

export const config: Config = {
  path: "/api/content",
  method: ["GET", "PUT", "DELETE"],
  // Sem isto, a ADMIN_KEY pode ser adivinhada por tentativa em massa: a rota
  // aceita quantos palpites o atacante quiser mandar. Vinte por minuto por IP
  // transforma um ataque de minutos num de meses.
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 20 },
};
