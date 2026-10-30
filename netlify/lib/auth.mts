// Porteiro das rotas de escrita. Blobs não tem controle de acesso próprio —
// quem decide é esta função.

const naoConfigurado = Symbol("ADMIN_KEY ausente");

/** Comparação de tempo constante, para a resposta não vazar o tamanho da chave. */
function iguais(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let dif = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) dif |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return dif === 0;
}

export type Veredito = { ok: true } | { ok: false; resposta: Response };

function erro(status: number, mensagem: string): Response {
  return Response.json({ erro: mensagem }, { status });
}

/**
 * Confere o cabeçalho `x-admin-key` contra a variável de ambiente ADMIN_KEY.
 * Sem ADMIN_KEY definida, toda escrita é recusada — é melhor um painel que não
 * salva do que um painel que qualquer pessoa salva.
 */
export function autorizar(req: Request): Veredito {
  const esperada = Netlify.env.get("ADMIN_KEY");

  if (!esperada || esperada.length < 8) {
    return {
      ok: false,
      resposta: erro(
        503,
        "ADMIN_KEY não está configurada no site (ou tem menos de 8 caracteres). Defina-a em Site configuration > Environment variables, com escopo incluindo Functions, e publique de novo.",
      ),
    };
  }

  const enviada = req.headers.get("x-admin-key") ?? "";
  if (!enviada) return { ok: false, resposta: erro(401, "Informe a chave do painel.") };
  if (!iguais(enviada, esperada)) return { ok: false, resposta: erro(403, "Chave incorreta.") };

  return { ok: true };
}

export { naoConfigurado };
