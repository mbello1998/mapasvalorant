import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { coletarNoticias } from "../lib/noticias.mts";

// Coleta periódica das notícias oficiais. É isto que faz os lançamentos
// aparecerem sozinhos no site, sem ninguém publicar nada pelo painel.
//
// De duas em duas horas, no minuto 7 — fora do minuto cheio, onde mora metade
// das tarefas agendadas do mundo.
//
// Lembrete: funções agendadas só disparam em publicações de produção. Em
// prévia, ou aqui no `netlify dev`, use `netlify functions:invoke coletar-noticias`.

export default async () => {
  const coleta = await coletarNoticias();

  if (coleta.erro) {
    // Não sobrescreve uma coleta boa com uma falha: a página continua
    // mostrando a última lista que deu certo.
    console.error("Coleta de notícias falhou:", coleta.erro);
    return;
  }

  try {
    await getStore({ name: "estande-noticias", consistency: "strong" })
      .setJSON("noticias", coleta);
    console.log(`Notícias atualizadas: ${coleta.itens.length} itens de ${coleta.total} disponíveis.`);
  } catch (e) {
    console.error("Falha ao guardar as notícias:", e);
  }
};

export const config: Config = {
  schedule: "7 */2 * * *",
};
