/**
 * Vídeo de terceiro dentro da página: só endereço, nunca arquivo.
 *
 * O vídeo de um agente é de quem publicou — a Riot no YouTube, um perfil no
 * TikTok. O site não guarda cópia nenhuma: ele aponta para o player da casa
 * de origem, que conta a exibição para o autor e some junto se o autor
 * apagar. É o mesmo princípio do link de vídeo dos lineups.
 *
 * Este arquivo não toca em `document`: são duas funções de texto, com teste.
 */

/**
 * Cada plataforma com o formato exato do seu id e o endereço do player.
 *
 * O formato é estreito de propósito. O id vem de um arquivo de dados e entra
 * num endereço que vira `src` de um `<iframe>`: um id com barra, aspas ou
 * dois-pontos sairia do caminho previsto e apontaria o quadro para outro
 * lugar. O que não casa com o formato não vira endereço nenhum.
 */
const PLATAFORMAS = {
  youtube: {
    formato: /^[\w-]{11}$/,
    // O domínio sem cookie é o mesmo player: ele só não planta rastreio de
    // quem abriu o painel do agente e nem assistiu.
    endereco: (id) => `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
    casa: "YouTube",
  },
  tiktok: {
    formato: /^\d{5,25}$/,
    endereco: (id) => `https://www.tiktok.com/player/v1/${id}`,
    casa: "TikTok",
  },
};

/** O endereço do player, ou `null` se o registro não for de confiança. */
export function enderecoDoPlayer(video) {
  const p = PLATAFORMAS[video?.plataforma];
  if (!p) return null;
  const id = video?.id;
  if (typeof id !== "string" || !p.formato.test(id)) return null;
  return p.endereco(id);
}

/** "VALORANT // Brasil no YouTube" — quem fez e onde está. */
export function creditoDoVideo(video) {
  const casa = PLATAFORMAS[video?.plataforma]?.casa;
  const autor = (video?.autor ?? "").trim();
  if (!casa) return autor;
  return autor ? `${autor} no ${casa}` : `No ${casa}`;
}
