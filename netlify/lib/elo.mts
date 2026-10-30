/**
 * A mesma conta de elo do navegador, repetida aqui de propósito.
 *
 * O servidor não pode confiar no índice que o navegador mandar — quem envia a
 * pontuação é quem quiser, e qualquer um pode forjar o corpo da requisição. Por
 * isso o índice é recalculado aqui a partir do desempenho bruto, e o que vier
 * pronto do cliente é ignorado.
 *
 * Se mexer nos marcos, mexa nos dois: `public/assets/js/elo.js` e este arquivo.
 */

export type Modo = "gridshot" | "tracking" | "flick" | "linha";

type Marco = { maiorMelhor: boolean; pontos: Array<[number, number]> };

export const MARCOS: Record<Modo, Marco> = {
  gridshot: { maiorMelhor: true, pontos: [[0.6, 0], [1.4, 15], [2.1, 35], [2.7, 55], [3.3, 72], [4.0, 88], [5.2, 100]] },
  tracking: { maiorMelhor: true, pontos: [[12, 0], [28, 15], [42, 35], [55, 55], [66, 72], [76, 88], [88, 100]] },
  flick:    { maiorMelhor: false, pontos: [[620, 0], [480, 15], [400, 35], [340, 55], [295, 72], [255, 88], [200, 100]] },
  linha:    { maiorMelhor: true, pontos: [[4, 0], [10, 15], [16, 35], [22, 55], [28, 72], [35, 88], [46, 100]] },
};

/**
 * Tetos de sanidade. Acima disso não é alguém bom, é alguém mandando número
 * pela mão — nem o melhor jogador do mundo chega perto.
 */
export const LIMITES: Record<Modo, { min: number; max: number }> = {
  gridshot: { min: 0, max: 9 },      // alvos por segundo
  tracking: { min: 0, max: 100 },    // porcentagem
  flick:    { min: 110, max: 3000 }, // ms; abaixo de 110 não é reação humana
  linha:    { min: 0, max: 90 },     // abates por minuto
};

export const MODOS = Object.keys(MARCOS) as Modo[];

export function ehModo(v: unknown): v is Modo {
  return typeof v === "string" && (MODOS as string[]).includes(v);
}

/* ---------------------------------------------- exercícios que só dão XP --
 * `Modo` acima é o que a tabela pública conhece, e `ranking.mts` e
 * `consolidar-ranking.mts` iteram `MODOS` — por isso os exercícios novos
 * ficam numa lista própria em vez de entrarem naquela. Eles contam XP e
 * aparecem no perfil da pessoa; coluna no ranking, não.
 *
 * Mexeu nos marcos daqui, mexa em `public/assets/js/elo.js` também.
 */
export type ModoTreino = Modo | "escolha" | "microajuste" | "correcao" | "cabeca";

export const MARCOS_TREINO: Record<ModoTreino, Marco> = {
  ...MARCOS,
  escolha:     { maiorMelhor: false, pontos: [[760, 0], [600, 15], [500, 35], [430, 55], [380, 72], [330, 88], [270, 100]] },
  microajuste: { maiorMelhor: true,  pontos: [[0.4, 0], [0.9, 15], [1.4, 35], [1.9, 55], [2.4, 72], [3.0, 88], [3.9, 100]] },
  correcao:    { maiorMelhor: true,  pontos: [[8, 0], [20, 15], [32, 35], [44, 55], [55, 72], [66, 88], [80, 100]] },
  cabeca:      { maiorMelhor: true,  pontos: [[0.3, 0], [0.7, 15], [1.1, 35], [1.5, 55], [1.9, 72], [2.4, 88], [3.2, 100]] },
};

export const LIMITES_TREINO: Record<ModoTreino, { min: number; max: number }> = {
  ...LIMITES,
  escolha:     { min: 110, max: 4000 }, // ms, com a penalidade de decisão somada
  microajuste: { min: 0, max: 9 },      // alvos por segundo
  correcao:    { min: 0, max: 100 },    // porcentagem
  cabeca:      { min: 0, max: 9 },      // cabeças por segundo
};

export const MODOS_TREINO = Object.keys(MARCOS_TREINO) as ModoTreino[];

export function ehModoTreino(v: unknown): v is ModoTreino {
  return typeof v === "string" && (MODOS_TREINO as string[]).includes(v);
}

/** A mesma conta de `indiceDe`, sobre a tabela que inclui os exercícios de XP. */
export function indiceDeTreino(modo: ModoTreino, valor: number): number {
  return indiceComMarcos(MARCOS_TREINO[modo], valor);
}

export function indiceDe(modo: Modo, valor: number): number {
  return indiceComMarcos(MARCOS[modo], valor);
}

function indiceComMarcos(m: Marco | undefined, valor: number): number {
  if (!m || !Number.isFinite(valor)) return 0;

  const p = m.pontos;
  const primeiro = p[0];
  const ultimo = p[p.length - 1];

  if (m.maiorMelhor) {
    if (valor <= primeiro[0]) return 0;
    if (valor >= ultimo[0]) return 100;
  } else {
    if (valor >= primeiro[0]) return 0;
    if (valor <= ultimo[0]) return 100;
  }

  for (let i = 0; i < p.length - 1; i++) {
    const [v1, i1] = p[i];
    const [v2, i2] = p[i + 1];
    const dentro = m.maiorMelhor ? (valor >= v1 && valor <= v2) : (valor <= v1 && valor >= v2);
    if (dentro) {
      const t = (valor - v1) / (v2 - v1);
      return Math.round(i1 + t * (i2 - i1));
    }
  }
  return 0;
}

export const TOTAL_PATENTES = 25;

export function patenteDoIndice(indice: number): number {
  const i = Math.max(0, Math.min(100, indice));
  if (i >= 99) return TOTAL_PATENTES - 1;
  return Math.min(TOTAL_PATENTES - 2, Math.floor((i / 99) * (TOTAL_PATENTES - 1)));
}

/* ------------------------------------------------------------- apelidos --- */

const PROIBIDOS = [
  // Nada de se passar pelo dono do site nem pela Riot.
  "admin", "administrador", "moderador", "riot", "riotgames", "valorant", "estande",
];

/**
 * Limpa o apelido. Não é filtro de palavrão — filtro de palavrão em português
 * dá falso positivo demais e falso negativo igual. O que existe aqui é limite
 * de tamanho, faixa de caracteres e bloqueio de quem tenta se passar por outro;
 * o resto fica com o botão de apagar do painel.
 */
export function limparApelido(bruto: unknown): { ok: true; nome: string } | { ok: false; erro: string } {
  if (typeof bruto !== "string") return { ok: false, erro: "Informe um apelido." };

  const nome = bruto
    .normalize("NFC")
    // Fora caracteres de controle e os invisíveis que servem para disfarçar texto.
    .replace(/[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (nome.length < 2) return { ok: false, erro: "O apelido precisa de pelo menos 2 caracteres." };
  if (nome.length > 18) return { ok: false, erro: "O apelido vai até 18 caracteres." };

  // Letras (com acento), números, espaço e um punhado de sinais comuns em tag.
  if (!/^[\p{L}\p{N} ._#\-]+$/u.test(nome)) {
    return { ok: false, erro: "Use só letras, números, espaço e os sinais . _ # -" };
  }
  if (/https?:|www\.|\.com|\.br/i.test(nome)) {
    return { ok: false, erro: "Nada de link no apelido." };
  }

  const achatado = nome.toLowerCase().replace(/[^a-z]/g, "");
  if (PROIBIDOS.some((p) => achatado === p)) {
    return { ok: false, erro: "Esse apelido é reservado. Escolha outro." };
  }

  return { ok: true, nome };
}
