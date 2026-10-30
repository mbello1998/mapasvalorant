/**
 * Calibração de sensibilidade a partir do movimento do mouse.
 *
 * A ideia: não dá para medir o DPI de um mouse pelo navegador — a página vê
 * pixels, não polegadas, e dois mouses com DPI diferente mandam o mesmo evento.
 * O que dá para ler é o *comportamento*, e é o comportamento que diz se a
 * sensibilidade está alta ou baixa demais para a pessoa.
 *
 * Como se lê isso, em duas medidas por alvo:
 *
 * 1. **Passou do alvo.** O rastro do ponteiro entra no alvo, sai de novo e
 *    precisa voltar. Quem passa do alvo com frequência está com a mão mais
 *    rápida que a mira pede: sensibilidade alta demais.
 *
 * 2. **Eficiência do caminho.** A razão entre a distância em linha reta até o
 *    alvo e a distância que o ponteiro realmente percorreu. Perto de 1 é um
 *    traço direto. Baixa, mas *sem* passar do alvo, é o contrário: a mão vai
 *    chegando aos poucos, corrigindo — sensibilidade baixa demais.
 *
 * As duas juntas separam os dois problemas, que de fora parecem o mesmo
 * ("erro muito"). Uma sozinha não separa.
 *
 * Dois treinos ficam de fora, e por motivos diferentes:
 *
 * - **Tracking** não tem aquisição de alvo. O alvo já está na tela e o que se
 *   treina é manter a mira colada nele. "Passou do alvo" e "eficiência do
 *   traço" não querem dizer nada ali.
 * - **A Linha de Tiro** tem recuo. O recuo empurra a mira para fora do alvo
 *   sem que a mão tenha feito nada, e isso seria lido como passar do alvo —
 *   o conselho mandaria todo mundo baixar a sensibilidade por causa da arma,
 *   não da mão. Medir ali daria um número pior que nenhum número.
 *
 * O conselho nunca sai de uma sessão só. Um dia ruim mexe nas duas medidas, e
 * mandar alguém mudar a sensibilidade por causa de trinta segundos é a melhor
 * forma de estragar a mira de quem já estava bem. Só com três sessões o
 * sistema abre a boca, e o que ele dá é uma faixa, não um número exato.
 */

const CHAVE = "estande.mira.v1";
const CHAVE_SETUP = "estande.setup.v1";
const SESSOES_GUARDADAS = 8;
const SESSOES_PARA_OPINAR = 3;

/**
 * As faixas. Entre `pouco` e `muito` está o lugar onde a mira acerta sem
 * brigar com a mão — é onde a maioria de quem joga bem fica.
 */
const PASSOU_POUCO = 0.12;
const PASSOU_MUITO = 0.35;
const EFICIENCIA_BAIXA = 0.55;

/* ------------------------------------------------------------ guardados -- */

function ler(chave, reserva) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? { ...reserva, ...JSON.parse(bruto) } : { ...reserva };
  } catch {
    return { ...reserva };
  }
}

function gravar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* modo privado */ }
}

/** O que a pessoa usa hoje, para o conselho sair em número e não em adjetivo. */
export function setupAtual() {
  return ler(CHAVE_SETUP, { dpi: 0, sensibilidade: 0 });
}

export function guardarSetup(setup) {
  gravar(CHAVE_SETUP, { ...setupAtual(), ...setup });
}

/** eDPI é o que o VALORANT realmente usa: DPI vezes a sensibilidade. */
export function eDpi(setup = setupAtual()) {
  const dpi = Number(setup.dpi) || 0;
  const sens = Number(setup.sensibilidade) || 0;
  return dpi > 0 && sens > 0 ? Math.round(dpi * sens) : null;
}

/* --------------------------------------------------------- o medidor ----- */

/**
 * Acompanha uma sessão. Recebe cada posição do ponteiro e cada alvo acertado,
 * e no fim devolve as duas medidas.
 *
 * O rastro é zerado a cada aquisição: o que interessa é o trajeto até *este*
 * alvo, não o histórico da sessão inteira.
 */
export function medidorDeMira() {
  let rastro = [];
  const aquisicoes = [];

  return {
    /** Toda posição do ponteiro durante a sessão. */
    mover(x, y) {
      const ultimo = rastro[rastro.length - 1];
      // Movimentos de menos de um pixel são ruído do sistema, não da mão.
      if (ultimo && Math.hypot(ultimo.x - x, ultimo.y - y) < 1) return;
      rastro.push({ x, y });
      if (rastro.length > 600) rastro.shift();
    },

    /** Recomeça o rastro: alvo novo na tela, trajeto novo. */
    alvoNovo() { rastro = []; },

    /**
     * Um alvo foi acertado em (x, y) com o raio informado. Fecha o trajeto e
     * guarda as medidas dele.
     */
    acertou(x, y, raio) {
      if (rastro.length >= 3) {
        let caminho = 0;
        let tocou = -1;
        let maisLongeDepois = 0;

        for (let i = 1; i < rastro.length; i++) {
          caminho += Math.hypot(rastro[i].x - rastro[i - 1].x, rastro[i].y - rastro[i - 1].y);
          const dist = Math.hypot(rastro[i].x - x, rastro[i].y - y);
          if (tocou === -1 && dist <= raio) tocou = i;
          // Depois de encostar no alvo, o que importa é o quanto se afastou.
          if (tocou !== -1 && i > tocou) maisLongeDepois = Math.max(maisLongeDepois, dist);
        }

        const inicio = rastro[0];
        const direto = Math.hypot(inicio.x - x, inicio.y - y);

        // Passar do alvo é ir *além* dele e ter de voltar — não é tremer na
        // borda. Contar cada cruzamento da borda confundia as duas coisas, e
        // tremer na borda é justamente o sintoma do problema oposto: a mão
        // corrigindo de pouquinho em pouquinho porque a mira não acompanha.
        const passou = tocou !== -1 && maisLongeDepois > raio * 1.8;

        // Trajeto curto demais não diz nada: o alvo nasceu embaixo do ponteiro.
        if (direto > raio * 2 && caminho > 0) {
          aquisicoes.push({ eficiencia: Math.min(1, direto / caminho), passou });
        }
      }
      rastro = [];
    },

    /** O resumo da sessão, ou null se não houve material suficiente. */
    fechar() {
      if (aquisicoes.length < 4) return null;
      const passou = aquisicoes.filter((a) => a.passou).length / aquisicoes.length;
      const eficiencia = aquisicoes.reduce((s, a) => s + a.eficiencia, 0) / aquisicoes.length;
      return {
        passou: Math.round(passou * 1000) / 1000,
        eficiencia: Math.round(eficiencia * 1000) / 1000,
        alvos: aquisicoes.length,
        em: Date.now(),
      };
    },
  };
}

/* ------------------------------------------------------- o histórico ----- */

export function guardarSessao(modo, medida) {
  if (!medida) return;
  const tudo = ler(CHAVE, {});
  const lista = Array.isArray(tudo.sessoes) ? tudo.sessoes : [];
  lista.push({ ...medida, modo });
  tudo.sessoes = lista.slice(-SESSOES_GUARDADAS);
  gravar(CHAVE, tudo);
}

export function sessoesGuardadas() {
  const tudo = ler(CHAVE, {});
  return Array.isArray(tudo.sessoes) ? tudo.sessoes : [];
}

export function esquecerSessoes() {
  gravar(CHAVE, { sessoes: [] });
}

/* -------------------------------------------------------- o veredito ----- */

/**
 * Junta as últimas sessões e diz o que fazer.
 *
 * `direcao` é "baixar", "subir" ou "manter". `fator` é quanto mexer — e sai
 * limitado a 15% porque mudar sensibilidade de uma vez é jogar fora a memória
 * muscular que já existe. Quem precisa de mais chega lá em duas etapas, e
 * deve chegar assim mesmo.
 */
export function diagnostico() {
  const sessoes = sessoesGuardadas();
  if (sessoes.length < SESSOES_PARA_OPINAR) {
    return {
      pronto: false,
      faltam: SESSOES_PARA_OPINAR - sessoes.length,
      sessoes: sessoes.length,
      texto: `Faltam ${SESSOES_PARA_OPINAR - sessoes.length} ${
        SESSOES_PARA_OPINAR - sessoes.length === 1 ? "sessão" : "sessões"
      } para eu ter o que dizer sobre sua sensibilidade.`,
    };
  }

  // As mais recentes pesam mais: a mão de hoje importa mais que a de ontem.
  const recentes = sessoes.slice(-5);
  const peso = (i) => i + 1;
  const total = recentes.reduce((s, _, i) => s + peso(i), 0);
  const passou = recentes.reduce((s, a, i) => s + a.passou * peso(i), 0) / total;
  const eficiencia = recentes.reduce((s, a, i) => s + a.eficiencia * peso(i), 0) / total;

  if (passou > PASSOU_MUITO) {
    // Quanto mais passa do alvo, mais a mão está rápida para a mira.
    const fator = Math.min(0.15, (passou - PASSOU_MUITO) * 0.6 + 0.05);
    return {
      pronto: true, direcao: "baixar", fator, passou, eficiencia, sessoes: recentes.length,
      texto: `Sua mira passa do alvo em ${Math.round(passou * 100)}% das vezes e volta para corrigir. ` +
        "Isso é mão mais rápida do que a mira pede.",
      conselho: `Baixe a sensibilidade em cerca de ${Math.round(fator * 100)}% e treine assim por alguns dias antes de mexer de novo.`,
    };
  }

  if (passou < PASSOU_POUCO && eficiencia < EFICIENCIA_BAIXA) {
    const fator = Math.min(0.15, (EFICIENCIA_BAIXA - eficiencia) * 0.5 + 0.05);
    return {
      pronto: true, direcao: "subir", fator, passou, eficiencia, sessoes: recentes.length,
      texto: `Você quase nunca passa do alvo (${Math.round(passou * 100)}%), mas chega nele dando voltas — ` +
        `o ponteiro anda ${Math.round(1 / Math.max(0.2, eficiencia) * 100 - 100)}% a mais do que precisaria.`,
      conselho: `Suba a sensibilidade em cerca de ${Math.round(fator * 100)}% e veja se o traço fica mais direto.`,
    };
  }

  return {
    pronto: true, direcao: "manter", fator: 0, passou, eficiencia, sessoes: recentes.length,
    texto: `Você passa do alvo em ${Math.round(passou * 100)}% das vezes e seu traço aproveita ` +
      `${Math.round(eficiencia * 100)}% do caminho. As duas medidas estão onde deviam estar.`,
    conselho: "Não mexa na sensibilidade. O que falta daqui para a frente é repetição, não configuração.",
  };
}

/** O conselho em números, quando a pessoa disse qual DPI e sensibilidade usa. */
export function numerosSugeridos(diag, setup = setupAtual()) {
  if (!diag?.pronto || diag.direcao === "manter") return null;
  const dpi = Number(setup.dpi) || 0;
  const sens = Number(setup.sensibilidade) || 0;
  if (dpi <= 0 || sens <= 0) return null;

  const mult = diag.direcao === "baixar" ? 1 - diag.fator : 1 + diag.fator;
  return {
    atual: { dpi, sens, edpi: Math.round(dpi * sens) },
    // Mudar a sensibilidade do jogo é o caminho de menos atrito: não mexe no
    // mouse nem no que ele faz fora do VALORANT.
    porSensibilidade: { dpi, sens: Math.round(sens * mult * 1000) / 1000 },
    // Mas quem prefere mexer no mouse tem o número também. DPI redondo de 50
    // em 50 porque é assim que a maioria dos softwares deixa escolher.
    porDpi: { dpi: Math.max(100, Math.round((dpi * mult) / 50) * 50), sens },
    edpiNovo: Math.round(dpi * sens * mult),
  };
}
