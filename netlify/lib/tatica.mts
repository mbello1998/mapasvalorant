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
  /** Endereço https de onde o dono viu o lineup, para dar crédito. Null quando não há. */
  fonte: string | null;
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
// Ancorada no fim de propósito: o vídeo vira src/href na página pública, e sem
// o `$` qualquer lixo (aspas, `>`) depois do id ficaria gravado. Só parâmetros
// comuns (&t=30s) passam depois do id.
const VIDEO = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{6,}([?&][\w=&.-]*)?$/;
// Identificadores, não texto livre: cortar um uuid o transformaria em outro.
const MAX_AGENTE = 64;
const MAX_HABILIDADE = 60;
const MAX_FONTE = 200;
// `..` fica de fora: a classe de caracteres aceita pontos e deixaria passar um
// caminho que sobe de pasta.
const IMAGEM = /^\/api\/media\/(?!.*\.\.)[\w.-]+$/;

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
  const agente = texto(b.agente) || null;
  if (agente && agente.length > MAX_AGENTE) return falha("Agente inválido.");
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

  const habilidade = texto(b.habilidade) || null;
  if (habilidade && habilidade.length > MAX_HABILIDADE) {
    return falha(`A habilidade aceita até ${MAX_HABILIDADE} caracteres.`);
  }
  if (habilidade && /[<>]/.test(habilidade)) return falha("Nada de marcação no texto.");

  const video = texto(b.video);
  if (video && !VIDEO.test(video)) return falha("O vídeo precisa ser um link do YouTube.");

  // A fonte é só um link de crédito: aceita qualquer site https, ao contrário do
  // vídeo, porque ela nunca vira <img> nem player — a página mostra apenas o
  // domínio como texto do link. Ausente, null e vazio são "sem fonte", não erro.
  let fonte: string | null = null;
  if (b.fonte != null && b.fonte !== "") {
    if (typeof b.fonte !== "string") return falha("A fonte precisa ser um endereço https.");
    const valor = b.fonte.trim();
    if (valor) {
      if (!valor.startsWith("https://") || valor.length > MAX_FONTE || /[<>]/.test(valor)) {
        return falha("A fonte precisa ser um endereço https.");
      }
      try { new URL(valor); } catch { return falha("A fonte precisa ser um endereço https."); }
      fonte = valor;
    }
  }

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
      imagens: [...(lista as string[])],
      video: video || null,
      fonte,
      conferido: b.conferido === true,
    },
  };
}

/** Coordenada com x e y numéricos; a faixa 0–1 é problema da entrada, não da leitura. */
function coordLegivel(v: unknown): boolean {
  if (v === null || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return Number.isFinite(c.x) && Number.isFinite(c.y);
}

/**
 * Lê o que veio do depósito sem confiar nele. Depósito vazio, corrompido ou
 * gravado num formato antigo vira lista vazia (ou só os itens aproveitáveis),
 * porque a página pública não pode cair em 500 por causa de um dado ruim.
 * Sem `id` o ponto não serve: não dá para editar nem apagar, então sai.
 *
 * Um registro com `id` mas sem `de` (ou, num pixel, sem `para`) numéricos também
 * sai: a página lê `de.x` dentro do laço dos marcadores, e um único registro
 * quebrado derrubaria o mapa inteiro em vez de só um marcador. Nada grava isso
 * hoje; é defesa para o dia em que o depósito for mexido por fora.
 */
export function lerPontos(bruto: unknown): Ponto[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.filter((p): p is Ponto => {
    if (p === null || typeof p !== "object" || Array.isArray(p)) return false;
    const r = p as Record<string, unknown>;
    if (typeof r.id !== "string") return false;
    if (!coordLegivel(r.de)) return false;
    return r.tipo !== "pixel" || coordLegivel(r.para);
  });
}
