import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

/**
 * Catálogo completo de armas e skins, enxugado e guardado.
 *
 * O endpoint de skins da valorant-api devolve 3,5 MB. Quase metade é caminho de
 * asset e campo que o site não usa. Aqui ele sai com 1,2 MB, numa chamada só
 * junto de armas, raridades e temas — e com cache de 6 horas, porque catálogo
 * de skin muda quando sai coleção nova, não a cada minuto.
 */

const VALIDADE_MS = 6 * 60 * 60 * 1000;
const cache = () => getStore({ name: "estande-cache", consistency: "strong" });
const V = "https://valorant-api.com/v1";

type Resposta = {
  geradoEm: string;
  armas: Array<{
    uuid: string; nome: string; categoria: string; custo: number | null;
    icone: string | null; padraoUuid: string | null;
    stats: null | {
      cadencia: number; carregador: number; recarga: number; saque: number;
      precisaoPrimeiroTiro: number; velocidadeCorrendo: number; chumbinhos: number;
      alcances: Array<{ de: number; ate: number; cabeca: number; corpo: number; perna: number }>;
    };
  }>;
  raridades: Array<{ uuid: string; nome: string; devName: string; rank: number; cor: string; icone: string | null }>;
  temas: Array<{ uuid: string; nome: string }>;
  skins: Array<{
    uuid: string; nome: string; arma: string | null; tema: string | null; raridade: string | null;
    icone: string | null; papelDeParede: string | null;
    niveis: Array<{ nome: string; tipo: string | null; video: string | null }>;
    cromas: Array<{ nome: string; amostra: string | null; arte: string | null; video: string | null }>;
  }>;
};

type ApiArma = {
  uuid: string; displayName: string; displayIcon: string | null;
  defaultSkinUuid: string | null;
  shopData: { cost: number | null; categoryText: string | null } | null;
  weaponStats: null | {
    fireRate: number; magazineSize: number; reloadTimeSeconds: number;
    equipTimeSeconds: number; firstBulletAccuracy: number; runSpeedMultiplier: number;
    shotgunPelletCount: number;
    damageRanges: Array<{ rangeStartMeters: number; rangeEndMeters: number; headDamage: number; bodyDamage: number; legDamage: number }>;
  };
  skins: Array<{ uuid: string }>;
};

async function json<T>(caminho: string, sinal: AbortSignal): Promise<T> {
  const r = await fetch(`${V}${caminho}`, { signal: sinal, headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} em ${caminho}`);
  return (await r.json()) as T;
}

async function montar(): Promise<Resposta> {
  const ac = new AbortController();
  const corta = setTimeout(() => ac.abort(), 20_000);
  try {
    const [armas, tiers, temas, skins] = await Promise.all([
      json<{ data: ApiArma[] }>("/weapons?language=pt-BR", ac.signal),
      json<{ data: Array<{ uuid: string; displayName: string; devName: string; rank: number; highlightColor: string; displayIcon: string | null }> }>(
        "/contenttiers?language=pt-BR", ac.signal),
      json<{ data: Array<{ uuid: string; displayName: string | null }> }>("/themes?language=pt-BR", ac.signal),
      json<{ data: Array<{
        uuid: string; displayName: string; themeUuid: string | null; contentTierUuid: string | null;
        displayIcon: string | null; wallpaper: string | null;
        levels: Array<{ displayName: string; levelItem: string | null; streamedVideo: string | null }>;
        chromas: Array<{ displayName: string; swatch: string | null; fullRender: string | null; streamedVideo: string | null }>;
      }> }>("/weapons/skins?language=pt-BR", ac.signal),
    ]);

    // "Skin favorita aleatória" existe uma por arma e não é uma skin: é o
    // marcador de sorteio do cliente. Some aqui para não poluir nem o catálogo
    // nem o montador.
    const TEMA_ALEATORIO = "0d7a5bfb-4850-098e-1821-d989bbfd58a8";

    // De qual arma é cada skin: só as armas sabem, então invertemos a relação.
    const donoDaSkin = new Map<string, string>();
    for (const a of armas.data) {
      for (const s of a.skins ?? []) donoDaSkin.set(s.uuid, a.uuid);
    }

    return {
      geradoEm: new Date().toISOString(),
      armas: armas.data.map((a) => ({
        uuid: a.uuid,
        nome: a.displayName,
        // O rótulo vem pronto da Riot ("Armas Leves", "Fuzis de Assalto"). Mexer
        // nele só estraga: "Armas Leves" sem o "Armas" vira "Leves".
        categoria: a.shopData?.categoryText ?? "Corpo a corpo",
        custo: a.shopData?.cost ?? null,
        icone: a.displayIcon,
        padraoUuid: a.defaultSkinUuid ?? null,
        stats: a.weaponStats
          ? {
              cadencia: a.weaponStats.fireRate,
              carregador: a.weaponStats.magazineSize,
              recarga: a.weaponStats.reloadTimeSeconds,
              saque: a.weaponStats.equipTimeSeconds,
              precisaoPrimeiroTiro: a.weaponStats.firstBulletAccuracy,
              velocidadeCorrendo: a.weaponStats.runSpeedMultiplier,
              chumbinhos: Math.max(1, a.weaponStats.shotgunPelletCount || 1),
              // A Riot publica o dano POR CHUMBINHO. Para escopeta isso dá 17 no
              // corpo, o que faria a Judge parecer inofensiva: o tiro inteiro
              // são 12 chumbinhos. Multiplicamos aqui e arredondamos, porque a
              // tabela crua vem com coisas como 14,450001.
              alcances: (a.weaponStats.damageRanges ?? []).map((d) => {
                const n = Math.max(1, a.weaponStats!.shotgunPelletCount || 1);
                return {
                  de: d.rangeStartMeters, ate: d.rangeEndMeters,
                  cabeca: Math.round(d.headDamage * n),
                  corpo: Math.round(d.bodyDamage * n),
                  perna: Math.round(d.legDamage * n),
                };
              }),
            }
          : null,
      })),
      raridades: tiers.data
        .sort((a, b) => a.rank - b.rank)
        .map((t) => ({
          uuid: t.uuid, nome: t.displayName, devName: t.devName, rank: t.rank,
          cor: `#${t.highlightColor.slice(0, 6)}`, icone: t.displayIcon,
        })),
      temas: temas.data
        .filter((t) => t.displayName)
        .map((t) => ({ uuid: t.uuid, nome: t.displayName as string })),
      skins: skins.data.filter((s) => s.themeUuid !== TEMA_ALEATORIO).map((s) => ({
        uuid: s.uuid,
        nome: s.displayName,
        arma: donoDaSkin.get(s.uuid) ?? null,
        tema: s.themeUuid,
        raridade: s.contentTierUuid,
        icone: s.displayIcon,
        papelDeParede: s.wallpaper,
        niveis: (s.levels ?? []).map((n) => ({
          nome: n.displayName,
          tipo: n.levelItem ? n.levelItem.replace("EEquippableSkinLevelItem::", "") : null,
          video: n.streamedVideo,
        })),
        cromas: (s.chromas ?? []).map((c) => ({
          nome: c.displayName, amostra: c.swatch, arte: c.fullRender, video: c.streamedVideo,
        })),
      })),
    };
  } finally {
    clearTimeout(corta);
  }
}

export default async (_req: Request, context: Context) => {
  const loja = cache();

  try {
    const guardado = await loja.getWithMetadata("arsenal", { type: "json" });
    const quando = guardado?.metadata?.geradoEm as number | undefined;
    if (guardado?.data && quando && Date.now() - quando < VALIDADE_MS) {
      return Response.json(guardado.data, {
        headers: { "cache-control": "public, max-age=1800", "x-estande-cache": "hit" },
      });
    }
  } catch (e) {
    console.error("Cache do arsenal indisponível:", e);
  }

  let dados: Resposta;
  try {
    dados = await montar();
  } catch (e) {
    console.error("Falha ao montar o arsenal:", e);
    return Response.json(
      { erro: "Não foi possível carregar o catálogo de armas e skins." },
      { status: 502 },
    );
  }

  context.waitUntil(
    loja.setJSON("arsenal", dados, { metadata: { geradoEm: Date.now() } })
      .catch((e) => console.error("Falha ao guardar o arsenal:", e)),
  );

  return Response.json(dados, {
    headers: { "cache-control": "public, max-age=1800", "x-estande-cache": "miss" },
  });
};

export const config: Config = {
  path: "/api/arsenal",
  method: ["GET"],
};
