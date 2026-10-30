import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { MODOS, type Modo } from "../lib/elo.mts";

/**
 * Junta os envios soltos numa tabela só.
 *
 * Esta é a única rotina que reescreve a chave `tabela`, e ela roda sozinha de
 * dez em dez minutos. Escritor único: não há duas execuções disputando a mesma
 * chave, que é exatamente o problema que o Blobs não resolve por conta própria.
 *
 * Os envios já consolidados são apagados depois de a tabela estar gravada —
 * nessa ordem, para que uma falha no meio só repita trabalho, nunca perca dado.
 *
 * Em produção ela dispara sozinha. Localmente, ou numa prévia:
 * `netlify functions:invoke consolidar-ranking`.
 */

const POR_MODO = 100;
const CHAVE_TABELA = "tabela";

type Entrada = {
  id: string; modo: Modo; nome: string; valor: number; indice: number;
  patente: number; precisao: number | null; detalhe: string | null; em: string;
  ajustado?: boolean;
  exemplo?: boolean;
};
type Tabela = { consolidadoEm: string | null; modos: Record<string, Entrada[]> };

const ordenar = (a: Entrada, b: Entrada) => b.indice - a.indice || a.em.localeCompare(b.em);

function compactar(entradas: Entrada[]): Entrada[] {
  const melhor = new Map<string, Entrada>();
  for (const e of entradas) {
    const chave = e.nome.toLowerCase();
    const atual = melhor.get(chave);
    if (!atual || ordenar(e, atual) < 0) melhor.set(chave, e);
  }
  return [...melhor.values()].sort(ordenar).slice(0, POR_MODO);
}

export default async () => {
  const loja = getStore({ name: "estande-ranking", consistency: "strong" });

  let pendentes: Array<{ chave: string; entrada: Entrada }> = [];
  try {
    const { blobs } = await loja.list({ prefix: "envios/" });
    if (!blobs.length) {
      console.log("Nada para consolidar.");
      return;
    }
    const lidos = await Promise.all(
      blobs.map(async (b) => ({
        chave: b.key,
        entrada: (await loja.get(b.key, { type: "json" }).catch(() => null)) as Entrada | null,
      })),
    );
    pendentes = lidos.filter((x): x is { chave: string; entrada: Entrada } => Boolean(x.entrada));
  } catch (e) {
    console.error("Falha ao listar os envios:", e);
    return;
  }

  let tabela: Tabela;
  try {
    tabela = ((await loja.get(CHAVE_TABELA, { type: "json" })) as Tabela | null)
      ?? { consolidadoEm: null, modos: Object.fromEntries(MODOS.map((m) => [m, []])) };
  } catch (e) {
    console.error("Falha ao ler a tabela; abortando para não perder o que já existe:", e);
    return;
  }

  for (const modo of MODOS) {
    const novas = pendentes.filter((p) => p.entrada.modo === modo).map((p) => p.entrada);
    tabela.modos[modo] = compactar([...(tabela.modos[modo] ?? []), ...novas]);
  }
  tabela.consolidadoEm = new Date().toISOString();

  try {
    await loja.setJSON(CHAVE_TABELA, tabela);
  } catch (e) {
    console.error("Falha ao gravar a tabela; os envios ficam para a próxima:", e);
    return;
  }

  // Só depois da tabela gravada. Falhar aqui só repete trabalho.
  let apagados = 0;
  for (const p of pendentes) {
    try { await loja.delete(p.chave); apagados++; }
    catch (e) { console.error("Falha ao apagar envio consolidado:", p.chave, e); }
  }

  // As travas de reenvio também não precisam viver para sempre.
  try {
    const { blobs } = await loja.list({ prefix: "trava/" });
    for (const b of blobs) {
      const meta = await loja.getMetadata(b.key).catch(() => null);
      const em = meta?.metadata?.em as number | undefined;
      if (!em || Date.now() - em > 86_400_000) await loja.delete(b.key).catch(() => {});
    }
  } catch { /* limpeza é melhor esforço */ }

  console.log(`Ranking consolidado: ${pendentes.length} envios, ${apagados} apagados.`);
};

export const config: Config = {
  schedule: "*/10 * * * *",
};
