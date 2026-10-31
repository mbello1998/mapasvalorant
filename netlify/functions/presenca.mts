import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

/**
 * Quantas pessoas estão no site agora.
 *
 * Forma do armazenamento: cada visitante grava uma chave própria,
 * `p/<minuto>/<id>`, e nunca reescreve a de ninguém. Contar é listar os dois
 * últimos minutos e juntar os ids — uma chamada de `list`, sem ler valor
 * nenhum, porque o id já está na chave. Nenhum contador é incrementado, que é
 * justamente o que não se deve fazer no Blobs.
 *
 * O id é um número aleatório gerado no navegador e guardado na aba. Não é
 * ligado a conta, a IP nem a nada: serve só para a mesma aba não ser contada
 * duas vezes. Nada aqui identifica ninguém.
 *
 * A janela é de dois minutos. Quem fechou a aba some sozinho do contador
 * quando o minuto dele sai da janela; `limpar-presenca` apaga as chaves velhas.
 */

const loja = () => getStore({ name: "estande-presenca", consistency: "strong" });

const minutoAgora = () => Math.floor(Date.now() / 60_000);

/** Só dígitos e letras, até 24 — o id vem do navegador e não é confiável. */
const idValido = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9]{6,24}$/.test(v);

/**
 * Dois números, e eles medem coisas diferentes.
 *
 * `online` é quem está com a aba aberta agora (janela de dois minutos).
 * `hoje` é quantas pessoas distintas passaram por aqui nas últimas 24 horas —
 * um número naturalmente maior, e tão real quanto o outro.
 *
 * As duas contagens saem de uma listagem só: a chave já carrega o minuto e o
 * id, então não há valor nenhum a ser lido.
 */
async function contar(l: ReturnType<typeof loja>) {
  const agora = minutoAgora();
  const corte24h = agora - 24 * 60;
  const dePerto = new Set<string>();
  const doDia = new Set<string>();

  try {
    const { blobs } = await l.list({ prefix: "p/" });
    for (const b of blobs) {
      const partes = b.key.split("/");
      const minuto = Number(partes[1]);
      const id = partes[2];
      if (!id || !Number.isFinite(minuto)) continue;
      if (minuto >= corte24h) doDia.add(id);
      if (minuto >= agora - 1) dePerto.add(id);
    }
  } catch (e) {
    console.error("Falha ao listar a presença:", e);
  }

  return { online: dePerto.size, hoje: doDia.size };
}

/**
 * A página relê a contagem de poucos em poucos segundos para o número andar
 * ao vivo, e cada leitura custa uma listagem do depósito. Guardar o resultado
 * por alguns segundos na memória da instância corta quase todas essas
 * listagens sem o número ficar velho de verdade: o atraso máximo é menor do
 * que o intervalo entre duas leituras da página.
 *
 * É memória de instância, não compartilhada — na pior das hipóteses cada
 * instância lista uma vez por janela, que é o que acontecia o tempo todo.
 */
const VALIDADE_MS = 4_000;
let cache: { em: number; valor: Awaited<ReturnType<typeof contar>> } | null = null;

async function contagemDePerto(l: ReturnType<typeof loja>, fresca: boolean) {
  if (!fresca && cache && Date.now() - cache.em < VALIDADE_MS) return cache.valor;
  const valor = await contar(l);
  cache = { em: Date.now(), valor };
  return valor;
}

export default async (req: Request, _context: Context) => {
  const l = loja();
  // Quem acabou de bater o ponto precisa se ver na conta, então a resposta
  // do POST é sempre contada na hora.
  const escreveu = req.method === "POST";

  if (req.method === "POST") {
    let corpo: Record<string, unknown>;
    try {
      corpo = await req.json();
    } catch {
      return Response.json({ erro: "Corpo inválido." }, { status: 400 });
    }

    if (!idValido(corpo.id)) {
      return Response.json({ erro: "Identificador de sessão inválido." }, { status: 422 });
    }

    try {
      // Valor vazio de propósito: tudo que importa está na chave.
      await l.set(`p/${minutoAgora()}/${corpo.id}`, "");
    } catch (e) {
      console.error("Falha ao marcar presença:", e);
      // Falhar aqui não é motivo para quebrar a página de quem está lendo.
    }
  }

  const contagem = await contagemDePerto(l, escreveu);
  return Response.json(
    { ...contagem, janelaMinutos: 2, em: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
};

export const config: Config = {
  path: "/api/presenca",
  method: ["GET", "POST"],
  // A página lê de oito em oito segundos (≈8 pedidos por minuto por aba);
  // o teto cobre várias abas atrás do mesmo IP sem liberar abuso.
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 90 },
};
