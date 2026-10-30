/**
 * Elo estimado a partir do desempenho no treino.
 *
 * Isto é uma estimativa deste site, não uma medição da Riot. Ninguém sabe o
 * ranque de ninguém olhando um treino de mira: mira é uma parte do jogo, e nem
 * é a maior. O que dá para dizer com honestidade é "quem joga neste nível de
 * mira costuma estar por aqui" — e é isso que a tela diz.
 *
 * A conta tem duas etapas. Primeiro o desempenho vira um índice de 0 a 100,
 * interpolado entre marcos definidos por exercício. Depois o índice vira uma
 * das 25 patentes reais do VALORANT, de Ferro 1 a Radiante.
 */

/**
 * Marcos por exercício: [valor, índice]. Entre dois marcos a conta é linear.
 * Em `flick` o valor é tempo de reação, então menor é melhor e a lista desce.
 */
export const MARCOS = {
  gridshot: {
    rotulo: "alvos por segundo",
    unidade: (v) => v.toFixed(2),
    maiorMelhor: true,
    pontos: [[0.6, 0], [1.4, 15], [2.1, 35], [2.7, 55], [3.3, 72], [4.0, 88], [5.2, 100]],
  },
  tracking: {
    rotulo: "tempo em alvo",
    unidade: (v) => `${Math.round(v)}%`,
    maiorMelhor: true,
    pontos: [[12, 0], [28, 15], [42, 35], [55, 55], [66, 72], [76, 88], [88, 100]],
  },
  flick: {
    rotulo: "reação média",
    unidade: (v) => `${Math.round(v)} ms`,
    maiorMelhor: false,
    pontos: [[620, 0], [480, 15], [400, 35], [340, 55], [295, 72], [255, 88], [200, 100]],
  },
  linha: {
    rotulo: "abates por minuto",
    unidade: (v) => v.toFixed(1),
    maiorMelhor: true,
    pontos: [[4, 0], [10, 15], [16, 35], [22, 55], [28, 72], [35, 88], [46, 100]],
  },

  /* ------------------------------------------------- exercícios só de XP --
   * Estes quatro não entram na tabela pública (ver MODOS_RANKING). Os marcos
   * existem porque o XP da sessão sai do índice, e porque a patente aparece no
   * cartão do fim do treino. São estimativas de partida, calibradas por comparação
   * com o exercício parecido: quando houver gente treinando, dá para apertar.
   */
  escolha: {
    rotulo: "reação média",
    unidade: (v) => `${Math.round(v)} ms`,
    maiorMelhor: false,
    // Mais lento que o flick de propósito: aqui a mão espera a decisão.
    pontos: [[760, 0], [600, 15], [500, 35], [430, 55], [380, 72], [330, 88], [270, 100]],
  },
  microajuste: {
    rotulo: "alvos por segundo",
    unidade: (v) => v.toFixed(2),
    maiorMelhor: true,
    // Alvo menor e correção curta rendem menos que o gridshot.
    pontos: [[0.4, 0], [0.9, 15], [1.4, 35], [1.9, 55], [2.4, 72], [3.0, 88], [3.9, 100]],
  },
  correcao: {
    rotulo: "tempo em alvo",
    unidade: (v) => `${Math.round(v)}%`,
    maiorMelhor: true,
    // Troca de direção derruba a aderência: a escala desce em relação ao tracking.
    pontos: [[8, 0], [20, 15], [32, 35], [44, 55], [55, 72], [66, 88], [80, 100]],
  },
  cabeca: {
    rotulo: "cabeças por segundo",
    unidade: (v) => v.toFixed(2),
    maiorMelhor: true,
    pontos: [[0.3, 0], [0.7, 15], [1.1, 35], [1.5, 55], [1.9, 72], [2.4, 88], [3.2, 100]],
  },
};

/**
 * Os exercícios que a tabela pública conhece. Os outros contam XP e aparecem
 * no perfil, mas não viram coluna no ranking — a inicial mostra quatro
 * exercícios lado a lado, e oito não caberiam sem espremer.
 */
export const MODOS_RANKING = ["gridshot", "tracking", "flick", "linha"];

export const entraNoRanking = (modo) => MODOS_RANKING.includes(modo);

/**
 * Os mesmos tetos de sanidade que o servidor aplica. Aqui eles servem para que
 * um registro velho ou corrompido no navegador não apareça como Radiante: sem
 * isto, um recorde gravado antes de o campo `duracao` existir vira um número
 * absurdo e a tela mente para quem está olhando.
 */
export const LIMITES = {
  gridshot: { min: 0, max: 9 },
  tracking: { min: 0, max: 100 },
  flick: { min: 110, max: 3000 },
  linha: { min: 0, max: 90 },
  escolha: { min: 110, max: 4000 },
  microajuste: { min: 0, max: 9 },
  correcao: { min: 0, max: 100 },
  cabeca: { min: 0, max: 9 },
};

/** Converte o desempenho bruto num índice de 0 a 100. */
export function indiceDe(modo, valorBruto) {
  const m = MARCOS[modo];
  if (!m || !Number.isFinite(valorBruto)) return 0;

  const lim = LIMITES[modo];
  const valor = lim ? Math.max(lim.min, Math.min(lim.max, valorBruto)) : valorBruto;

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

/**
 * Índice (0–100) para posição na escala de patentes (0–24).
 * 0 é Ferro 1 e 24 é Radiante.
 */
export const TOTAL_PATENTES = 25;

export function patenteDoIndice(indice) {
  const i = Math.max(0, Math.min(100, indice));
  // Radiante só com o índice praticamente cheio: no jogo ele é o topo absoluto,
  // algumas centenas de pessoas por região, e não cairia de um treino mediano.
  if (i >= 99) return TOTAL_PATENTES - 1;
  return Math.min(TOTAL_PATENTES - 2, Math.floor((i / 99) * (TOTAL_PATENTES - 1)));
}

/** A média dos exercícios que a pessoa fez, que vira o elo geral. */
export function indiceGeral(indicesPorModo) {
  const vals = Object.values(indicesPorModo).filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

/**
 * A lista de patentes vem da própria Riot (`/v1/competitivetiers`). Aqui só
 * tiramos o que não é patente de verdade: "Sem ranque" e os dois degraus
 * reservados que a Riot nunca usou.
 */
export function patentesReais(conjuntos) {
  const atual = conjuntos[conjuntos.length - 1];
  return (atual?.tiers ?? [])
    .filter((t) => t.tier >= 3 && t.tierName && !/^Unused/i.test(t.tierName))
    .sort((a, b) => a.tier - b.tier)
    .map((t) => ({
      tier: t.tier,
      nome: t.tierName,
      divisao: t.divisionName,
      cor: `#${String(t.backgroundColor).slice(0, 6)}`,
      icone: t.smallIcon ?? t.largeIcon,
      iconeGrande: t.largeIcon ?? t.smallIcon,
    }));
}
