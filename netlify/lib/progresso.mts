/**
 * Nível de conta, XP e cartões.
 *
 * A ideia é a do VALORANT: jogar dá XP, XP enche uma barra, a barra estoura e
 * o nível sobe. Aqui o que dá XP é terminar um treino — qualquer um dos
 * quatro —, e a quantidade depende de quão bem foi, não só de ter aparecido.
 *
 * A curva tem a forma da do jogo: os primeiros níveis custam pouco e sobem em
 * degraus, depois o custo fica fixo. Os números não são os da Riot porque a
 * escala é outra: lá uma partida dura meia hora e dá uns mil de XP; aqui uma
 * sessão dura trinta segundos. Copiar os números daria um nível a cada vinte
 * minutos de treino, que não é progresso, é castigo.
 *
 * Os valores vêm do painel (`conteudo.niveis`), não daqui — este arquivo só
 * guarda o padrão e a conta. Tudo isto vive no servidor de propósito: nível
 * guardado no navegador é nível que qualquer pessoa edita pelo console, e aí
 * a barra não significa nada para ninguém.
 */

export type ConfigNiveis = {
  /** XP que toda sessão terminada vale, independente do desempenho. */
  xpBase: number;
  /** XP extra por ponto de índice de elo (0 a 100). */
  xpPorIndice: number;
  /** Custo do primeiro nível. */
  custoInicial: number;
  /** Quanto cada degrau acrescenta ao custo. */
  degrau: number;
  /** Quantos níveis sobem em degrau antes do custo ficar fixo. */
  degraus: number;
  /** Custo de cada nível depois dos degraus. */
  custoFixo: number;
  /** De quantos em quantos níveis sai um cartão. */
  cartoesACada: number;
  /** Teto de XP por dia, por conta. */
  xpPorDia: number;
  /** Espera mínima entre duas sessões que contam XP, em segundos. */
  janelaSegundos: number;
  /** Nível e borda ao lado do apelido na tabela pública. */
  mostrarNoRanking: boolean;
  /** O cartão do jogador aparecendo ao passar o mouse sobre o apelido. */
  cartaoNoHover: boolean;
  /** Se a pessoa pode escolher qual dos cartões liberados vai usar. */
  trocaDeCartaoLiberada: boolean;
  /** Cartão de quem ainda não tem nenhum. Vazio usa um fundo liso. */
  cartaoPadraoUuid: string;
};

export const NIVEIS_PADRAO: ConfigNiveis = {
  xpBase: 60,
  xpPorIndice: 1.8,
  custoInicial: 400,
  degrau: 300,
  degraus: 4,
  custoFixo: 1600,
  cartoesACada: 2,
  xpPorDia: 15_000,
  janelaSegundos: 15,
  mostrarNoRanking: true,
  cartaoNoHover: true,
  trocaDeCartaoLiberada: true,
  cartaoPadraoUuid: "",
};

const entre = (v: unknown, min: number, max: number, reserva: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : reserva;
};

/**
 * O painel é a interface, mas quem decide o que é um número aceitável é o
 * servidor. Sem isto, um custo zero daria nível infinito na primeira sessão e
 * uma janela zero abriria a porta para um laço despejar XP.
 */
export function normalizarConfig(bruto: unknown): ConfigNiveis {
  const c = (bruto ?? {}) as Record<string, unknown>;
  const p = NIVEIS_PADRAO;
  return {
    xpBase: Math.round(entre(c.xpBase, 0, 5000, p.xpBase)),
    xpPorIndice: entre(c.xpPorIndice, 0, 100, p.xpPorIndice),
    custoInicial: Math.round(entre(c.custoInicial, 50, 100_000, p.custoInicial)),
    degrau: Math.round(entre(c.degrau, 0, 100_000, p.degrau)),
    degraus: Math.round(entre(c.degraus, 0, 200, p.degraus)),
    custoFixo: Math.round(entre(c.custoFixo, 50, 1_000_000, p.custoFixo)),
    cartoesACada: Math.round(entre(c.cartoesACada, 1, 100, p.cartoesACada)),
    xpPorDia: Math.round(entre(c.xpPorDia, 100, 10_000_000, p.xpPorDia)),
    janelaSegundos: Math.round(entre(c.janelaSegundos, 0, 3600, p.janelaSegundos)),
    mostrarNoRanking: c.mostrarNoRanking !== false,
    cartaoNoHover: c.cartaoNoHover !== false,
    trocaDeCartaoLiberada: c.trocaDeCartaoLiberada !== false,
    cartaoPadraoUuid: typeof c.cartaoPadraoUuid === "string" ? c.cartaoPadraoUuid.trim().slice(0, 64) : "",
  };
}

/* ------------------------------------------------------------- a conta --- */

export function xpDaSessao(indice: number, cfg: ConfigNiveis = NIVEIS_PADRAO): number {
  const i = Math.max(0, Math.min(100, Number(indice) || 0));
  return Math.round(cfg.xpBase + i * cfg.xpPorIndice);
}

/** O que custa sair do nível informado para o seguinte. */
export function custoDoNivel(nivel: number, cfg: ConfigNiveis = NIVEIS_PADRAO): number {
  if (nivel < 1) return cfg.custoInicial;
  return nivel <= cfg.degraus
    ? cfg.custoInicial + (nivel - 1) * cfg.degrau
    : cfg.custoFixo;
}

export type Progresso = {
  xp: number;
  nivel: number;
  /** Quanto já andou dentro do nível atual. */
  xpNoNivel: number;
  /** Quanto o nível atual pede por inteiro. */
  custo: number;
};

/** Teto só para o laço não ser infinito com um número absurdo no depósito. */
const NIVEL_MAX = 5000;

export function progressoDoXp(xpTotal: number, cfg: ConfigNiveis = NIVEIS_PADRAO): Progresso {
  const xp = Math.max(0, Math.floor(Number(xpTotal) || 0));
  let nivel = 1;
  let resto = xp;
  while (nivel < NIVEL_MAX) {
    const custo = custoDoNivel(nivel, cfg);
    if (custo <= 0 || resto < custo) break;
    resto -= custo;
    nivel++;
  }
  return { xp, nivel, xpNoNivel: resto, custo: custoDoNivel(nivel, cfg) };
}

/** O XP exato em que um nível começa. É o que o painel grava ao definir nível. */
export function xpDoNivel(nivel: number, cfg: ConfigNiveis = NIVEIS_PADRAO): number {
  const alvo = Math.max(1, Math.min(NIVEL_MAX, Math.floor(nivel) || 1));
  let xp = 0;
  for (let n = 1; n < alvo; n++) xp += custoDoNivel(n, cfg);
  return xp;
}

/* ---------------------------------------------------------------- cartões */

export const cartoesDevidos = (nivel: number, cfg: ConfigNiveis = NIVEIS_PADRAO) =>
  Math.floor(nivel / Math.max(1, cfg.cartoesACada));

/**
 * Qual cartão cabe a quem, de forma estável.
 *
 * O catálogo da Riot é embaralhado com uma semente tirada da própria conta:
 * a mesma conta recebe sempre a mesma sequência, e duas contas recebem
 * sequências diferentes. Não é sorteio na hora — sorteio na hora daria um
 * cartão diferente a cada vez que a função rodasse.
 *
 * Mesmo assim o que a conta ganhou fica gravado nela. Se a Riot acrescentar
 * cartões amanhã, ninguém perde o que já tinha.
 */
function semente(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function embaralhar<T>(lista: T[], sementeInicial: number): T[] {
  const saida = [...lista];
  let estado = sementeInicial || 1;
  // xorshift32: previsível de propósito — é o que torna a sequência estável.
  const proximo = () => {
    estado ^= estado << 13; estado >>>= 0;
    estado ^= estado >>> 17;
    estado ^= estado << 5;  estado >>>= 0;
    return estado;
  };
  for (let i = saida.length - 1; i > 0; i--) {
    const j = proximo() % (i + 1);
    [saida[i], saida[j]] = [saida[j], saida[i]];
  }
  return saida;
}

/**
 * Escolhe os cartões que faltam para a conta chegar ao total devido.
 * `jaTem` entra e sai preservado: o que já foi dado nunca é trocado.
 */
export function escolherCartoes(idDaConta: string, catalogo: string[], jaTem: string[], quantos: number): string[] {
  if (quantos <= jaTem.length || !catalogo.length) return jaTem;

  const ordem = embaralhar(catalogo, semente(idDaConta));
  const saida = [...jaTem];
  const vistos = new Set(jaTem);

  for (const uuid of ordem) {
    if (saida.length >= quantos) break;
    if (vistos.has(uuid)) continue;
    saida.push(uuid);
    vistos.add(uuid);
  }
  return saida;
}

/* ------------------------------------------------------------ o que sai --- */

export type Perfil = {
  apelido: string;
  xp: number;
  nivel: number;
  xpNoNivel: number;
  custo: number;
  cartoes: string[];
  /** O que a pessoa escolheu usar. Null usa o primeiro, ou o padrão do painel. */
  cartaoEquipado: string | null;
  /** Vai junto para a tela saber dizer "um cartão a cada N níveis". */
  cartoesACada: number;
  /** Se a tela deve oferecer a troca de cartão. */
  podeTrocarCartao: boolean;
  /**
   * Patente posta à mão pelo painel (0 = Ferro 1, 24 = Radiante), ou null
   * quando vale a conta do site. Vai junto com `eloAjustado` porque a tela
   * precisa dizer de onde o número veio: "elo estimado" que alguém digitou
   * sem avisar seria o site mentindo sobre a própria medição.
   */
  elo: number | null;
  eloAjustado: boolean;
  sessoes: number;
  /** Quantas sessões por exercício, para o painel do jogador ter o que dizer. */
  porModo: Record<string, number>;
  desde: string | null;
  atualizadoEm: string;
};
