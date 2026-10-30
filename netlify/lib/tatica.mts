/**
 * Pontos da Sala de Mapas: pixels (de onde jogar, onde a util cai) e posições
 * (onde ficar) cadastrados pelo painel.
 *
 * Toda coordenada é fração de 0 a 1 da largura e da altura do minimapa, nunca
 * pixel de tela. Pixel de tela só vale para o tamanho de janela em que foi
 * marcado; fração vale em qualquer tela.
 */

export type Lado = "ataque" | "defesa";
export type TipoPonto = "pixel" | "posicao";
export type Coord = { x: number; y: number };

export type Ponto = {
  id: string;
  /** UUID do mapa na API da Riot. */
  mapa: string;
  /** UUID do agente na API da Riot. Null numa posição que não é de agente. */
  agente: string | null;
  /** Slot da habilidade. Null quando não é util. */
  habilidade: string | null;
  lado: Lado;
  tipo: TipoPonto;
  /** Onde a pessoa fica. */
  de: Coord;
  /** Onde a util cai. Null em posição, que não lança nada. */
  para: Coord | null;
  titulo: string;
  texto: string;
  imagens: string[];
  video: string | null;
  /** Só vira true quando o dono testou o ponto no jogo. */
  conferido: boolean;
  criadoEm: string;
};

export type PontoEntrada = Omit<Ponto, "id" | "criadoEm">;

export type ResultadoPonto = { ok: true; ponto: PontoEntrada } | { ok: false; erro: string };

/** Teto de pontos guardados, para o depósito não crescer sem limite. */
export const LIMITE_PONTOS = 2000;

const MAX_TITULO = 80;
const MAX_TEXTO = 600;
const MAX_IMAGENS = 3;
const VIDEO = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{6,}/;
const IMAGEM = /^\/api\/media\/[\w.-]+$/;

export const novoId = () => `p_${crypto.randomUUID().slice(0, 8)}`;

const falha = (erro: string): ResultadoPonto => ({ ok: false, erro });

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Devolve a coordenada se for fração válida; undefined se não for. */
function coord(v: unknown): Coord | undefined {
  const c = (v ?? {}) as Record<string, unknown>;
  if (typeof c.x !== "number" || typeof c.y !== "number") return undefined;
  const ok = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
  return ok(c.x) && ok(c.y) ? { x: c.x, y: c.y } : undefined;
}

/**
 * O painel é a interface, mas quem decide o que é um ponto aceitável é o
 * servidor. Sem isto, qualquer requisição com a chave podia gravar HTML no
 * título (que a página pública mostra), um vídeo de outro site ou uma coordenada
 * que joga o marcador para fora do minimapa.
 */
export function normalizarPonto(bruto: unknown, mapasValidos: Set<string>): ResultadoPonto {
  const b = (bruto ?? {}) as Record<string, unknown>;

  const mapa = texto(b.mapa);
  if (!mapasValidos.has(mapa)) return falha("Mapa desconhecido.");

  // Sem agente a tela mostra as posições do mapa e nenhuma util; essas posições
  // são pontos sem agente, então ausente, null e vazio viram null, não erro.
  const agente = texto(b.agente).slice(0, 64) || null;
  if (agente && /[<>]/.test(agente)) return falha("Nada de marcação no texto.");

  if (b.lado !== "ataque" && b.lado !== "defesa") return falha("Escolha ataque ou defesa.");
  if (b.tipo !== "pixel" && b.tipo !== "posicao") return falha("Escolha pixel ou posição.");

  const de = coord(b.de);
  if (!de) return falha("Coordenada fora do mapa.");

  // Posição não lança nada, então não tem destino; guardar um `para` ali só
  // desenharia uma linha que não significa nada.
  let para: Coord | null = null;
  if (b.tipo === "pixel") {
    if (b.para == null) return falha("Um pixel precisa de onde a util cai.");
    const alvo = coord(b.para);
    if (!alvo) return falha("Coordenada fora do mapa.");
    para = alvo;
  }

  const titulo = texto(b.titulo);
  const corpo = texto(b.texto);
  if (!titulo) return falha("Dê um título ao ponto.");
  if (titulo.length > MAX_TITULO) return falha(`O título aceita até ${MAX_TITULO} caracteres.`);
  if (corpo.length > MAX_TEXTO) return falha(`O texto aceita até ${MAX_TEXTO} caracteres.`);
  // A página monta o texto como texto puro, mas recusar na entrada evita que um
  // dia alguém troque por innerHTML e herde dado sujo já gravado.
  if (/[<>]/.test(titulo) || /[<>]/.test(corpo)) return falha("Nada de marcação no texto.");

  const habilidade = texto(b.habilidade).slice(0, 60) || null;
  if (habilidade && /[<>]/.test(habilidade)) return falha("Nada de marcação no texto.");

  const video = texto(b.video);
  if (video && !VIDEO.test(video)) return falha("O vídeo precisa ser um link do YouTube.");

  const lista = b.imagens == null ? [] : b.imagens;
  if (!Array.isArray(lista)) return falha("Imagens inválidas.");
  if (lista.length > MAX_IMAGENS) return falha("No máximo três imagens por ponto.");
  // Só imagens que passaram pelo upload do próprio painel: link externo some do
  // ar ou troca de conteúdo sem o dono saber.
  if (!lista.every((i) => typeof i === "string" && IMAGEM.test(i))) {
    return falha("Use só imagens enviadas pelo painel.");
  }

  return {
    ok: true,
    ponto: {
      mapa, agente, habilidade,
      lado: b.lado, tipo: b.tipo,
      de, para,
      titulo, texto: corpo,
      imagens: lista as string[],
      video: video || null,
      conferido: b.conferido === true,
    },
  };
}
