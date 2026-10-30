import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

/**
 * Varre as marcas de presença velhas.
 *
 * Cada visitante grava uma chave por minuto; sem limpeza o depósito só cresce.
 * As últimas 24 horas interessam, porque é a janela do contador de "hoje".
 *
 * Escritor único, de quinze em quinze minutos. Em produção dispara sozinha;
 * localmente, `netlify functions:invoke limpar-presenca`.
 */

// A contagem de "hoje" olha 24 horas para trás, então as marcas precisam
// sobreviver esse tempo. Antes eram cinco minutos, que bastavam só para o
// "agora".
const GUARDAR_MINUTOS = 24 * 60 + 10;

export default async () => {
  const loja = getStore({ name: "estande-presenca", consistency: "strong" });
  const corte = Math.floor(Date.now() / 60_000) - GUARDAR_MINUTOS;

  let apagadas = 0;
  try {
    const { blobs } = await loja.list({ prefix: "p/" });
    for (const b of blobs) {
      const minuto = Number(b.key.split("/")[1]);
      if (Number.isFinite(minuto) && minuto < corte) {
        await loja.delete(b.key).catch(() => {});
        apagadas++;
      }
    }
  } catch (e) {
    console.error("Falha ao limpar a presença:", e);
    return;
  }

  console.log(`Presença limpa: ${apagadas} marcas antigas.`);
};

export const config: Config = {
  schedule: "*/15 * * * *",
};
