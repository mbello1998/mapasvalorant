// O estande. Três exercícios num só canvas, estatísticas no HUD e histórico
// local. Nada daqui vai para o servidor: o progresso do treino é do jogador.

import {
  acordarAudio, prepararArma, tiroComAmostra, somTiro, somAcerto, somErro,
  prepararMusica, tocarCarregamento, musicaPronta,
  somCarregando, somEntrou, somContagem, somFim,
} from "./audio.js";
import { indiceDe, patenteDoIndice } from "./elo.js";
import { medidorDeMira, guardarSessao } from "./mira.js";

const CHAVE_HIST = "estande.hist.v2";
const CHAVE_CFG = "estande.cfg.v2";
const MAX_HIST = 30;
const NO_GRAFICO = 12;

const MIRAS = [
  { id: "cruz", nome: "Cruz" },
  { id: "ponto", nome: "Ponto" },
  { id: "cruzponto", nome: "Cruz com ponto" },
  { id: "circulo", nome: "Círculo" },
];

/** As cores que a maioria usa no jogo, nesta ordem. */
const CORES_MIRA = [
  { id: "#E9EDE6", nome: "Branco" },
  { id: "#00E5FF", nome: "Ciano" },
  { id: "#22E06A", nome: "Verde" },
  { id: "#FFD93D", nome: "Amarelo" },
  { id: "#FF4655", nome: "Vermelho" },
  { id: "#FF6FD8", nome: "Rosa" },
];

/** Limites de cada ajuste, em pixels. */
const AJUSTES_MIRA = {
  espessura: { min: 1, max: 5, passo: 1, rotulo: "Espessura" },
  vao: { min: 0, max: 14, passo: 1, rotulo: "Vão" },
  braco: { min: 2, max: 20, passo: 1, rotulo: "Comprimento" },
};

const MIRA_PADRAO = { miraCor: "#E9EDE6", miraEspessura: 2, miraVao: 4, miraBraco: 9 };

/**
 * A arte de cada exercício: a tela de carregamento que aparece ao entrar e o
 * cenário que fica atrás dos alvos durante a rodada.
 */
const ARTE = {
  gridshot:    { carga: "assets/img/carga-gridshot.webp",    fundo: "assets/img/fundo-gridshot.webp" },
  tracking:    { carga: "assets/img/carga-tracking.webp",    fundo: "assets/img/fundo-tracking.webp" },
  flick:       { carga: "assets/img/carga-flick.webp",       fundo: "assets/img/fundo-flick.webp" },
  escolha:     { carga: "assets/img/carga-escolha.webp",     fundo: "assets/img/fundo-escolha.webp" },
  microajuste: { carga: "assets/img/carga-microajuste.webp", fundo: "assets/img/fundo-microajuste.webp" },
  correcao:    { carga: "assets/img/carga-correcao.webp",    fundo: "assets/img/fundo-correcao.webp" },
  cabeca:      { carga: "assets/img/carga-cabeca.webp",      fundo: "assets/img/fundo-cabeca.webp" },
};

/**
 * O boneco do modo Cabeça é o mesmo da Linha de Tiro: o sprite de
 * `assets/img/alvo.png`, 144x316, com a cabeça a 7,5% da altura e raio de
 * 7,2% dela. Esses números foram medidos na imagem lá, e repetir a medida
 * aqui é o que mantém a caixa de acerto em cima da cabeça que se vê.
 */
const BONECO = {
  url: "assets/img/alvo.png",
  proporcao: 144 / 316,
  /** Altura inteira do boneco a partir do raio da cabeça. */
  altura: (raioDaCabeca) => raioDaCabeca / 0.072,
  /** Onde o topo do sprite cai, dado o centro da cabeça. */
  topo: (cy, altura) => cy - altura * 0.075,
};

let spriteBoneco = null;
function carregarBoneco() {
  if (spriteBoneco !== null) return;
  spriteBoneco = { img: new Image(), pronta: false };
  spriteBoneco.img.decoding = "async";
  spriteBoneco.img.addEventListener("load", () => { spriteBoneco.pronta = true; });
  spriteBoneco.img.addEventListener("error", () => {
    console.warn("Sprite do boneco não carregou; o modo Cabeça usa a silhueta de reserva.");
  });
  spriteBoneco.img.src = BONECO.url;
}

/**
 * O estande atira de Vandal. O pacote de amostras dela já existe em
 * `assets/audio/armas/vandal.*`, montado a partir das gravações da arma — é o
 * mesmo som que a Linha de Tiro usa. A categoria fica aqui porque, se o
 * pacote não carregar, o sintetizador precisa saber de que família é o tiro.
 */
const ARMA = { nome: "Vandal", categoria: "Fuzis de Assalto" };

const MUSICA_CARGA = "assets/audio/carregamento.mp3";

const TEXTOS = {
  gridshot: { principal: "alvos por segundo", unidade: (v) => v.toFixed(2), recorde: "melhor ritmo" },
  tracking: { principal: "tempo em alvo", unidade: (v) => `${Math.round(v)}%`, recorde: "melhor aderência" },
  flick: { principal: "reação média", unidade: (v) => `${Math.round(v)} ms`, recorde: "reação mais rápida" },
  escolha: { principal: "reação média", unidade: (v) => `${Math.round(v)} ms`, recorde: "reação mais rápida" },
  microajuste: { principal: "alvos por segundo", unidade: (v) => v.toFixed(2), recorde: "melhor ritmo" },
  correcao: { principal: "tempo em alvo", unidade: (v) => `${Math.round(v)}%`, recorde: "melhor aderência" },
  cabeca: { principal: "cabeças por segundo", unidade: (v) => v.toFixed(2), recorde: "melhor ritmo" },
};

/**
 * O que cada exercício faz, em dados.
 *
 * Antes isto vivia espalhado em `if (modoAtual === "tracking")` por umas dez
 * funções. Com três exercícios dava para ler; com sete viraria uma teia, e
 * acrescentar o oitavo significaria caçar ramo por ramo. Aqui cada modo é uma
 * linha, e o motor lê a linha.
 *
 *   metrica   "porSegundo" acertos/s · "tempoEmAlvo" % do tempo · "reacao" ms
 *   clica     false quando o exercício é de manter a mira, não de atirar
 *   alvos     quantos ficam na tela ao mesmo tempo
 *   agendado  [min, max] ms de espera até o próximo alvo nascer; sem isto,
 *             o alvo é reposto na hora
 *   movimento "deriva" (duas senóides) ou "strafe" (troca seca de direção)
 *   escala    multiplica o tamanho do alvo escolhido na configuração
 *   perto     raio em px dentro do qual o próximo alvo nasce, medido da mira
 *   posicoes  divide o campo em N pontos fixos em vez de soltar onde calhar
 *   aliado    chance de o alvo ser um aliado, que não pode ser clicado
 *   forma     "silhueta" desenha corpo com cabeça e só a cabeça conta
 */
const REGRAS = {
  gridshot:    { metrica: "porSegundo", clica: true, alvos: 2 },
  tracking:    { metrica: "tempoEmAlvo", clica: false, alvos: 1, movimento: "deriva" },
  flick:       { metrica: "reacao", clica: true, alvos: 1, agendado: [320, 1050] },
  escolha:     { metrica: "reacao", clica: true, alvos: 1, agendado: [400, 1400], posicoes: 4, aliado: 0.22, penalidade: 100 },
  microajuste: { metrica: "porSegundo", clica: true, alvos: 1, escala: 0.55, perto: 130 },
  correcao:    { metrica: "tempoEmAlvo", clica: false, alvos: 1, movimento: "strafe" },
  // A cabeça é pequena de propósito: o boneco inteiro mede quase quatorze
  // raios de altura, e com o tamanho cheio um único deles tomaria o campo.
  cabeca:      { metrica: "porSegundo", clica: true, alvos: 1, forma: "silhueta", escala: 0.6 },
};

/** Quanto tempo o aliado fica na tela antes de se recolher sozinho, em ms. */
const VIDA_DO_ALIADO = 900;

const REGRA_PADRAO = REGRAS.gridshot;
const regraDe = (modo) => REGRAS[modo] ?? REGRA_PADRAO;

/* ------------------------------------------------------- armazenamento ---- */

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

/** Onde a métrica é tempo de reação, menor é melhor; nos outros, maior. */
const melhorQue = (modo, a, b) =>
  (regraDe(modo).metrica === "reacao" ? a < b : a > b);

/* -------------------------------------------------------------- utilidades */

const aleatorio = (min, max) => min + Math.random() * (max - min);

function corDeToken(el, token) {
  return getComputedStyle(el).getPropertyValue(token).trim() || "#FF4655";
}

/* =========================================================== o estande === */

export function montarEstande({ secao, tela, capa, elementos, modos, patentes, aoTrocarModo, aoEncerrar }) {
  const ctx = tela.getContext("2d", { alpha: false });

  const cfg = ler(CHAVE_CFG, { tamanho: 26, duracao: 30, mira: "cruzponto", ...MIRA_PADRAO });
  const historico = ler(CHAVE_HIST, {});

  let modoAtual = modos.find((m) => m.destaque)?.id ?? modos[0]?.id ?? "gridshot";
  let paleta = { sinal: "#FF4655", aco: "#16262E", linha: "#2E5361", luz: "#E9EDE6", latao: "#D4A24C" };

  const estado = {
    rodando: false,
    alvos: [],
    acertos: 0,
    tiros: 0,
    reacoes: [],
    tempoEmAlvo: 0,
    comecouEm: 0,
    terminaEm: 0,
    proximoAlvo: 0,
    /** Aliados clicados no modo Escolha, que viram penalidade na média. */
    aliadosClicados: 0,
    mouse: { x: 0, y: 0, dentro: false, pressionado: false },
  };

  let quadro = 0;

  /* O que fica preso em `window` e `document` sobrevive à troca de tela, ao
     contrário do que está preso no canvas. Guardar o cancelamento é o que
     permite ao estande sair de cena inteiro. */
  const limpezas = [];
  const ouvir = (alvo, evento, fn) => {
    alvo.addEventListener(evento, fn);
    limpezas.push(() => alvo.removeEventListener(evento, fn));
  };
  let ultimoTique = 0;
  let mira = null;

  /* --------------------------------------------------------- dimensões --- */

  let larg = 960;
  let alt = 600;

  function redimensionar() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const caixa = tela.getBoundingClientRect();
    larg = Math.max(320, Math.round(caixa.width));
    alt = Math.round(larg * 0.625);
    tela.style.height = `${alt}px`;
    tela.width = Math.round(larg * dpr);
    tela.height = Math.round(alt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lerPaleta();
    if (!estado.rodando) desenharRepouso();
  }

  function lerPaleta() {
    paleta = {
      sinal: corDeToken(secao, "--sinal"),
      aco: corDeToken(secao, "--aco"),
      linha: corDeToken(secao, "--linha-fina"),
      luz: corDeToken(secao, "--luz"),
      latao: corDeToken(secao, "--latao"),
    };
  }

  /* ------------------------------------------------------------- alvos --- */

  const regra = () => regraDe(modoAtual);

  const raio = () => Math.max(7, cfg.tamanho * (regra().escala ?? 1));

  /**
   * A silhueta é alta: o raio vale a cabeça e o corpo desce a partir dela, em
   * proporção de gente — ombro mais largo que cabeça, tronco de uns cinco
   * raios. Um retângulo estreito e comprido não lia como corpo, lia como barra.
   */
  const alturaDoCorpo = () => raio() * 5.6;
  const larguraDoCorpo = () => raio() * 4.6;

  /**
   * Os pontos fixos do modo Escolha. São ângulos para checar, sempre os
   * mesmos: o exercício é decidir, não procurar onde o alvo foi parar.
   */
  function pontoFixo(quantos) {
    const i = Math.floor(Math.random() * quantos);
    const margem = raio() + 40;
    const faixa = (larg - margem * 2) / quantos;
    return {
      x: margem + faixa * (i + 0.5),
      y: alt * (0.34 + (i % 2) * 0.3),
    };
  }

  function posicaoLivre() {
    const r = regra();
    if (r.posicoes) return pontoFixo(r.posicoes);

    const margem = raio() + 14;
    // Com silhueta o corpo desce abaixo da cabeça: se a cabeça nascesse no pé
    // do campo, o tronco sairia pela borda cortado ao meio.
    const alturaCheia = spriteBoneco?.pronta
      ? BONECO.altura(raio()) * 0.93
      : alturaDoCorpo() + raio() * 1.5;
    const margemBaixo = r.forma === "silhueta" ? margem + alturaCheia : margem;
    const prender = (v, min, max) => Math.max(min, Math.min(max, v));

    for (let tentativa = 0; tentativa < 40; tentativa++) {
      let x;
      let y;
      if (r.perto && estado.mouse.dentro) {
        // Nasce num anel em volta da mira: perto o bastante para ser ajuste,
        // longe o bastante para não nascer debaixo do ponteiro.
        const ang = Math.random() * Math.PI * 2;
        const dist = aleatorio(r.perto * 0.35, r.perto);
        x = prender(estado.mouse.x + Math.cos(ang) * dist, margem, larg - margem);
        y = prender(estado.mouse.y + Math.sin(ang) * dist, margem, alt - margemBaixo);
      } else {
        x = aleatorio(margem, larg - margem);
        y = aleatorio(margem, Math.max(margem + 1, alt - margemBaixo));
      }
      const colide = estado.alvos.some(
        (a) => Math.hypot(a.x - x, a.y - y) < raio() * 2.6,
      );
      if (!colide) return { x, y };
    }
    return { x: larg / 2, y: alt / 2 };
  }

  function nascerAlvo() {
    const r = regra();
    const { x, y } = posicaoLivre();
    const alvo = {
      x, y,
      nascidoEm: performance.now(),
      fase: Math.random() * Math.PI * 2,
      // Aliado é alvo que não se clica. Entra como propriedade do alvo, e não
      // como estado à parte, para o desenho e o clique lerem a mesma coisa.
      aliado: Boolean(r.aliado) && Math.random() < r.aliado,
    };
    mira?.alvoNovo();
    if (r.movimento === "deriva") {
      alvo.vx = aleatorio(90, 190) * (Math.random() < 0.5 ? -1 : 1);
      alvo.vy = aleatorio(60, 140) * (Math.random() < 0.5 ? -1 : 1);
    }
    if (r.movimento === "strafe") {
      alvo.vx = aleatorio(150, 300) * (Math.random() < 0.5 ? -1 : 1);
      alvo.vy = aleatorio(40, 110) * (Math.random() < 0.5 ? -1 : 1);
      alvo.trocaEm = performance.now() + aleatorio(250, 700);
    }
    estado.alvos.push(alvo);
  }

  function reporAlvos() {
    const r = regra();
    // Com espera agendada quem solta o alvo é o laço, no tempo dele.
    if (r.agendado) return;
    while (estado.alvos.length < (r.alvos ?? 1)) nascerAlvo();
  }

  /** Marca a hora do próximo alvo nos modos de espera irregular. */
  function agendarProximo() {
    const [min, max] = regra().agendado ?? [320, 1050];
    estado.proximoAlvo = performance.now() + aleatorio(min, max);
  }

  /* ------------------------------------------------------------ desenho -- */

  // O cenário de cada modo, baixado uma vez. Enquanto não chega — ou se não
  // chegar — a grade de aço desenhada continua valendo: o treino não espera
  // uma imagem para começar.
  const cenarios = new Map();

  function cenarioDoModo(modo) {
    if (cenarios.has(modo)) return cenarios.get(modo);
    const url = ARTE[modo]?.fundo;
    if (!url) { cenarios.set(modo, null); return null; }

    const registro = { img: new Image(), pronta: false };
    registro.img.decoding = "async";
    registro.img.addEventListener("load", () => {
      registro.pronta = true;
      if (!estado.rodando) desenharRepouso();
    });
    registro.img.src = url;
    cenarios.set(modo, registro);
    return registro;
  }

  /** Desenha a imagem cobrindo o canvas inteiro, sem distorcer. */
  function cobrir(img) {
    const escala = Math.max(larg / img.naturalWidth, alt / img.naturalHeight);
    const w = img.naturalWidth * escala;
    const h = img.naturalHeight * escala;
    ctx.drawImage(img, (larg - w) / 2, (alt - h) / 2, w, h);
  }

  function fundo() {
    const cenario = cenarioDoModo(modoAtual);
    if (cenario?.pronta) {
      cobrir(cenario.img);
      // O véu existe por causa do alvo: o cenário tem partes claras, e um
      // círculo vermelho em cima de concreto iluminado some. Escurecer o
      // fundo é mais honesto que clarear o alvo, que mudaria o contraste do
      // exercício de um modo para o outro.
      ctx.fillStyle = "rgba(10, 20, 26, 0.52)";
      ctx.fillRect(0, 0, larg, alt);
      return;
    }

    ctx.fillStyle = paleta.aco;
    ctx.fillRect(0, 0, larg, alt);

    ctx.strokeStyle = paleta.linha;
    ctx.lineWidth = 1;
    const passo = 52;
    ctx.beginPath();
    for (let x = (larg % passo) / 2; x < larg; x += passo) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, alt);
    }
    for (let y = (alt % passo) / 2; y < alt; y += passo) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(larg, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  /**
   * A silhueta do modo Cabeça: corpo em tamanho de jogador com a cabeça em
   * cima. Só a cabeça conta como acerto, então o corpo é desenhado apagado e
   * a cabeça na cor do alvo — a leitura tem que ser imediata.
   */
  function desenharSilhueta(a, agora) {
    const r = raio();
    const nascido = Math.min(1, (agora - a.nascidoEm) / 110);
    const rr = r * (0.55 + 0.45 * nascido);

    if (spriteBoneco?.pronta) {
      const h = BONECO.altura(rr);
      const w = h * BONECO.proporcao;
      const topo = BONECO.topo(a.y, h);
      // O contorno vermelho é o mesmo recurso da Linha de Tiro: sem ele o
      // boneco some no cenário, que é quente e cheio de detalhe.
      ctx.filter = `drop-shadow(0 0 ${Math.max(2, w * 0.045)}px ${paleta.sinal})`;
      ctx.drawImage(spriteBoneco.img, a.x - w / 2, topo, w, h);
      ctx.filter = "none";

      // Anel na cabeça: a área que conta, visível sem depender só da cor.
      ctx.beginPath();
      ctx.arc(a.x, a.y, rr * 1.55, 0, Math.PI * 2);
      ctx.strokeStyle = paleta.luz;
      ctx.lineWidth = Math.max(1, w * 0.018);
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    // Reserva, se o sprite não carregar: corpo chapado e cabeça na cor do alvo.
    const corpoA = alturaDoCorpo() * nascido;
    const corpoL = larguraDoCorpo();
    ctx.fillStyle = paleta.linha;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(a.x - corpoL / 2, a.y + rr * 1.5, corpoL, corpoA);
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(a.x, a.y, rr, 0, Math.PI * 2);
    ctx.fillStyle = paleta.sinal;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(a.x, a.y, Math.max(2, rr * 0.22), 0, Math.PI * 2);
    ctx.fillStyle = paleta.luz;
    ctx.fill();
  }

  function desenharAlvo(a, agora) {
    if (regra().forma === "silhueta") { desenharSilhueta(a, agora); return; }

    const r = raio();
    const nascido = Math.min(1, (agora - a.nascidoEm) / 110);
    const rr = r * (0.55 + 0.45 * nascido);
    // O aliado tem cor própria e um corte em cruz: quem não distingue
    // vermelho de azul precisa de outra pista além da cor.
    const cor = a.aliado ? paleta.latao : paleta.sinal;

    ctx.beginPath();
    ctx.arc(a.x, a.y, rr, 0, Math.PI * 2);
    ctx.fillStyle = cor;
    ctx.fill();

    if (a.aliado) {
      ctx.strokeStyle = paleta.aco;
      ctx.lineWidth = Math.max(3, rr * 0.28);
      ctx.beginPath();
      ctx.moveTo(a.x - rr * 0.6, a.y);
      ctx.lineTo(a.x + rr * 0.6, a.y);
      ctx.moveTo(a.x, a.y - rr * 0.6);
      ctx.lineTo(a.x, a.y + rr * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(a.x, a.y, rr * 1.42, 0, Math.PI * 2);
      ctx.strokeStyle = cor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    // Anel externo: dá a borda do alvo sem depender só da cor do preenchimento.
    ctx.beginPath();
    ctx.arc(a.x, a.y, rr * 1.42, 0, Math.PI * 2);
    ctx.strokeStyle = paleta.sinal;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Miolo claro, para o olho achar o centro.
    ctx.beginPath();
    ctx.arc(a.x, a.y, Math.max(2, rr * 0.2), 0, Math.PI * 2);
    ctx.fillStyle = paleta.luz;
    ctx.fill();
  }

  /**
   * A mira.
   *
   * Duas coisas fazem ela parecer certa, e as duas estavam faltando. A
   * primeira é o contorno escuro por trás dos traços: quando as luzes do
   * estande acendem o fundo fica claro, e uma mira branca sem contorno some
   * em cima dele. A segunda é o meio pixel: traço de espessura ímpar centrado
   * num número inteiro cai metade em cada pixel e sai cinza e borrado nos
   * dois, em vez de nítido num.
   */
  function desenharMira() {
    if (!estado.mouse.dentro) return;

    const esp = Number(cfg.miraEspessura) || MIRA_PADRAO.miraEspessura;
    const vao = Number(cfg.miraVao) ?? MIRA_PADRAO.miraVao;
    const braco = Number(cfg.miraBraco) || MIRA_PADRAO.miraBraco;
    const cor = cfg.miraCor || MIRA_PADRAO.miraCor;

    // Espessura ímpar pede meio pixel; par pede o inteiro.
    const ajuste = esp % 2 === 1 ? 0.5 : 0;
    const x = Math.round(estado.mouse.x) + ajuste;
    const y = Math.round(estado.mouse.y) + ajuste;

    const bracos = () => {
      ctx.beginPath();
      ctx.moveTo(x - braco - vao, y); ctx.lineTo(x - vao, y);
      ctx.moveTo(x + vao, y); ctx.lineTo(x + braco + vao, y);
      ctx.moveTo(x, y - braco - vao); ctx.lineTo(x, y - vao);
      ctx.moveTo(x, y + vao); ctx.lineTo(x, y + braco + vao);
    };
    const anel = () => {
      ctx.beginPath();
      ctx.arc(x, y, vao + braco * 0.6, 0, Math.PI * 2);
    };
    const miolo = (r) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
    };

    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";

    /** Desenha o caminho duas vezes: contorno escuro por baixo, cor por cima. */
    const tracar = (caminho) => {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
      ctx.lineWidth = esp + 2;
      caminho();
      ctx.stroke();
      ctx.strokeStyle = cor;
      ctx.lineWidth = esp;
      caminho();
      ctx.stroke();
    };

    const pintar = (caminho) => {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
      ctx.lineWidth = 2;
      caminho();
      ctx.stroke();
      ctx.fillStyle = cor;
      caminho();
      ctx.fill();
    };

    const temCruz = cfg.mira === "cruz" || cfg.mira === "cruzponto";
    const temPonto = cfg.mira === "ponto" || cfg.mira === "cruzponto";

    if (temCruz) tracar(bracos);
    if (cfg.mira === "circulo") tracar(anel);
    // O ponto cresce com a espessura: fixo em 2 px ele sumia debaixo de um
    // traço de 5, e num traço de 1 ficava desproporcional.
    if (temPonto || cfg.mira === "circulo") {
      pintar(() => miolo(Math.max(1, esp * (cfg.mira === "circulo" ? 0.55 : 0.8))));
    }
  }

  function desenharRepouso() {
    fundo();
    ctx.fillStyle = paleta.sinal;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(larg * 0.5, alt * 0.5, raio(), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* --------------------------------------------------------------- laço -- */

  function laco(agora) {
    if (!estado.rodando) return;
    quadro = requestAnimationFrame(laco);

    const dt = Math.min(0.05, (agora - ultimoTique) / 1000 || 0);
    ultimoTique = agora;

    if (agora >= estado.terminaEm) { encerrar(); return; }

    const r = regra();

    if (r.movimento) {
      for (const a of estado.alvos) {
        if (r.movimento === "deriva") {
          // Deriva suave: duas senóides defasadas em vez de movimento
          // retilíneo, porque alvo que anda em linha reta é fácil demais.
          a.vx += Math.sin(agora / 620 + a.fase) * 26 * dt * 10;
          a.vy += Math.cos(agora / 540 + a.fase) * 22 * dt * 10;
        } else if (agora >= (a.trocaEm ?? 0)) {
          // Strafe: a direção vira de uma vez, como quem troca de lado atrás
          // da quina. É a troca que se treina aqui, não o acompanhamento.
          a.vx = aleatorio(150, 320) * (Math.random() < 0.5 ? -1 : 1);
          a.vy = aleatorio(40, 130) * (Math.random() < 0.5 ? -1 : 1);
          a.trocaEm = agora + aleatorio(250, 700);
        }
        const v = Math.hypot(a.vx, a.vy);
        const vmax = r.movimento === "strafe" ? 340 : 230;
        if (v > vmax) { a.vx = (a.vx / v) * vmax; a.vy = (a.vy / v) * vmax; }
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        const m = raio() + 6;
        if (a.x < m) { a.x = m; a.vx = Math.abs(a.vx); }
        if (a.x > larg - m) { a.x = larg - m; a.vx = -Math.abs(a.vx); }
        if (a.y < m) { a.y = m; a.vy = Math.abs(a.vy); }
        if (a.y > alt - m) { a.y = alt - m; a.vy = -Math.abs(a.vy); }
      }
    }

    if (r.metrica === "tempoEmAlvo") {
      // Basta a mira estar em cima do alvo. Não precisa segurar botão nenhum:
      // o que se treina aqui é manter a mira colada, não apertar o mouse.
      const a = estado.alvos[0];
      if (a && estado.mouse.dentro &&
          Math.hypot(estado.mouse.x - a.x, estado.mouse.y - a.y) <= raio()) {
        estado.tempoEmAlvo += dt;
      }
    }

    // O aliado tem vida curta: quem acertou em não clicar nele não pode ficar
    // preso olhando um alvo que nunca sai. Ele se recolhe e o próximo é
    // agendado, igual a um ângulo que você checou e liberou.
    if (r.aliado) {
      for (let i = estado.alvos.length - 1; i >= 0; i--) {
        if (estado.alvos[i].aliado && agora - estado.alvos[i].nascidoEm > VIDA_DO_ALIADO) {
          estado.alvos.splice(i, 1);
          agendarProximo();
        }
      }
    }

    if (r.agendado && estado.alvos.length === 0 && agora >= estado.proximoAlvo) {
      nascerAlvo();
    }

    fundo();
    for (const a of estado.alvos) desenharAlvo(a, agora);

    if (r.metrica === "tempoEmAlvo" && estado.alvos[0]) {
      // Aro de confirmação quando a mira está colada no alvo.
      const a = estado.alvos[0];
      const colado = estado.mouse.dentro && Math.hypot(estado.mouse.x - a.x, estado.mouse.y - a.y) <= raio();
      if (colado) {
        // Aro de latão enquanto o tempo está sendo contado.
        ctx.beginPath();
        ctx.arc(a.x, a.y, raio() * 1.9, 0, Math.PI * 2);
        ctx.strokeStyle = paleta.latao;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    desenharMira();
    atualizarHud();
  }

  /* ------------------------------------------------------------- cliques - */

  function coordenadas(ev) {
    const caixa = tela.getBoundingClientRect();
    return { x: ev.clientX - caixa.left, y: ev.clientY - caixa.top };
  }

  function atirar(ev) {
    const r = regra();
    if (!estado.rodando || !r.clica) return;
    const { x, y } = coordenadas(ev);
    estado.tiros++;

    // O tiro soa sempre, acerte ou não: é a arma disparando, não o acerto.
    if (!tiroComAmostra(ARMA)) somTiro(ARMA);

    // Na silhueta o corpo existe na tela mas não na conta: só a cabeça é
    // alvo, e acertar o tronco é o erro que o exercício existe para corrigir.
    const i = estado.alvos.findIndex((a) => Math.hypot(a.x - x, a.y - y) <= raio() * 1.15);
    if (i === -1) { somErro(); return; }

    const alvo = estado.alvos[i];

    // Aliado: tirar da tela sem contar acerto, somar a penalidade e seguir.
    // Quem clicou já gastou o tempo de reação; a penalidade é o preço da
    // decisão errada, e ela entra na média que a tela mostra.
    if (alvo.aliado) {
      estado.alvos.splice(i, 1);
      estado.aliadosClicados++;
      somErro();
      agendarProximo();
      return;
    }

    estado.alvos.splice(i, 1);
    estado.acertos++;
    somAcerto();
    mira?.acertou(alvo.x, alvo.y, raio());
    if (r.metrica === "reacao") estado.reacoes.push(performance.now() - alvo.nascidoEm);
    if (r.agendado) agendarProximo();
    else reporAlvos();
  }

  /* ------------------------------------------------------- começo e fim -- */

  const decorridoAgora = () =>
    Math.max(0.001, (Math.min(performance.now(), estado.terminaEm) - estado.comecouEm) / 1000);

  function valorPrincipal() {
    const r = regra();
    if (r.metrica === "porSegundo") return estado.acertos / decorridoAgora();
    if (r.metrica === "tempoEmAlvo") return (estado.tempoEmAlvo / decorridoAgora()) * 100;

    if (!estado.reacoes.length) return 0;
    const media = estado.reacoes.reduce((s, v) => s + v, 0) / estado.reacoes.length;
    // A penalidade por aliado clicado entra na média, não num contador à
    // parte: é o número que a pessoa olha, e errar a decisão tem que pesar
    // nele. A tela diz quantos foram, para o número não parecer mágica.
    const peso = (r.penalidade ?? 0) * estado.aliadosClicados;
    return media + peso / estado.reacoes.length;
  }

  function precisao() {
    if (regra().metrica === "tempoEmAlvo") {
      return (estado.tempoEmAlvo / decorridoAgora()) * 100;
    }
    return estado.tiros ? (estado.acertos / estado.tiros) * 100 : 0;
  }

  /**
   * A entrada no exercício, com a arte do modo e a faixa de carregamento — a
   * mesma da Linha de Tiro, pelo mesmo barramento de áudio, então o botão de
   * som e o volume valem aqui também.
   *
   * Sem a arte na página (ou com a imagem faltando) a função não segura
   * ninguém: volta na hora e a contagem começa.
   */
  async function entrarNoExercicio() {
    const painel = elementos.carga;
    if (!painel) return;

    const url = ARTE[modoAtual]?.carga;
    if (!url) return;

    const rapido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Com faixa a tela fica um pouco mais no ar: em um segundo e meio a música
    // mal começa. Sem faixa não há motivo para segurar ninguém.
    const duracao = rapido ? 450 : (musicaPronta() ? 2800 : 1600);

    elementos.cargaArte.style.backgroundImage = `url("${url}")`;
    if (elementos.cargaTexto) {
      const modo = modos.find((m) => m.id === modoAtual);
      elementos.cargaTexto.textContent = `Carregando ${modo?.nome ?? modoAtual}…`;
    }

    const barra = elementos.cargaBarra;
    barra.style.width = "0%";
    painel.hidden = false;
    painel.removeAttribute("data-saindo");
    painel.setAttribute("aria-hidden", "false");

    // A faixa, se houver. Sem ela o arrasto sintetizado assume — a tela nunca
    // entra em silêncio por causa de um arquivo faltando.
    const musica = tocarCarregamento();
    if (!musica) somCarregando();

    const inicio = performance.now();
    await new Promise((resolve) => {
      const passo = () => {
        const t = Math.min(1, (performance.now() - inicio) / duracao);
        barra.style.width = `${(t * 100).toFixed(1)}%`;
        if (t < 1) requestAnimationFrame(passo);
        else resolve();
      };
      requestAnimationFrame(passo);
    });

    // A faixa some junto com a tela, não invade a rodada.
    musica?.parar(0.45);
    somEntrou();
    painel.dataset.saindo = "sim";
    await new Promise((r) => setTimeout(r, rapido ? 60 : 420));
    painel.hidden = true;
    painel.setAttribute("aria-hidden", "true");
  }

  async function comecar() {
    if (estado.rodando) return;

    elementos.resultado.textContent = "";
    limparFimDeTreino();
    elementos.btnComecar.disabled = true;

    // Som nenhum nasce fora de um gesto do usuário, e este clique é ele: por
    // isso o contexto e os dois arquivos vêm antes de qualquer espera.
    acordarAudio();
    await Promise.all([prepararArma(ARMA.nome), prepararMusica(MUSICA_CARGA)]);

    await entrarNoExercicio();

    secao.dataset.luz = "acesa";
    lerPaleta();

    // Contagem curta: tempo de levar a mão ao mouse.
    const rapido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    elementos.contagem.hidden = false;
    for (let n = 3; n > 0; n--) {
      elementos.contagem.textContent = String(n);
      somContagem(n === 1);
      await new Promise((r) => setTimeout(r, rapido ? 220 : 620));
    }
    elementos.contagem.hidden = true;

    Object.assign(estado, {
      rodando: true, alvos: [], acertos: 0, tiros: 0, reacoes: [],
      tempoEmAlvo: 0, aliadosClicados: 0, comecouEm: performance.now(),
      terminaEm: performance.now() + cfg.duracao * 1000,
      proximoAlvo: performance.now() + 450,
    });

    capa.hidden = true;
    elementos.btnComecar.disabled = false;

    // Os exercícios de manter a mira não são alvo a adquirir: é mira colada num
    // alvo que já está na tela. As medidas de "passou do alvo" e "eficiência do
    // traço" não significam nada ali, e misturá-las sujaria o conselho.
    mira = regra().clica ? medidorDeMira() : null;

    centralizarCampo();
    reporAlvos();
    ultimoTique = performance.now();
    quadro = requestAnimationFrame(laco);
  }

  /**
   * Põe o campo no meio da tela quando a rodada começa.
   *
   * Importa mais do que parece: mira se treina a partir do centro da visão, e
   * um canvas na beira da tela ensina a mão a puxar sempre para o mesmo lado.
   * Fica centralizado também em quem redimensiona ou gira o aparelho no meio
   * da sessão — por isso o ouvinte sai junto com ela.
   */
  function centralizarCampo() {
    const campo = tela.closest(".arena__campo") ?? tela;
    const rapido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    campo.scrollIntoView({ block: "center", inline: "center", behavior: rapido ? "auto" : "smooth" });
  }

  const recentralizar = () => { if (estado.rodando) centralizarCampo(); };

  function encerrar() {
    if (!estado.rodando) return;
    estado.rodando = false;
    cancelAnimationFrame(quadro);
    secao.dataset.luz = "apagada";
    lerPaleta();
    somFim();

    const principal = valorPrincipal();
    const prec = precisao();
    const fmt = TEXTOS[modoAtual];

    // Sessão em que ninguém encostou no mouse não vira estatística: zerar o
    // histórico e o recorde por ter aberto a aba e saído seria pior que nada.
    //
    // Em flick a régua é o acerto, não o tiro. Quem atirou e errou tudo não
    // tem nenhuma reação medida, e `valorPrincipal` devolve 0 — que, num
    // exercício onde menos é melhor, seria lido como reação instantânea e
    // viraria um recorde e um Radiante. Zero tiro e zero acerto dão no mesmo
    // aqui: não houve o que medir.
    const metrica = regra().metrica;
    const participou = metrica === "tempoEmAlvo" ? estado.tempoEmAlvo > 0
      : metrica === "reacao" ? estado.reacoes.length > 0
      : estado.tiros > 0;
    if (!participou) {
      capa.hidden = false;
      elementos.btnComecar.textContent = "Acender as luzes";
      elementos.resultado.textContent = metrica === "reacao" && estado.tiros > 0
        ? "Nenhum alvo acertado nessa sessão — não registrei nada."
        : "Nenhum tiro nessa sessão — não registrei nada.";
      atualizarHud();
      desenharRepouso();
      return;
    }

    // As medidas de mira são guardadas à parte do histórico de desempenho:
    // elas falam da configuração do mouse, não de quem está jogando bem.
    guardarSessao(modoAtual, mira?.fechar());
    mira = null;

    const lista = Array.isArray(historico[modoAtual]) ? historico[modoAtual] : [];
    const recordeAnterior = lista.length
      ? lista.reduce((m, s) => (melhorQue(modoAtual, s.principal, m) ? s.principal : m), lista[0].principal)
      : null;

    // tiros e duração vão junto porque o ranking público confere a coerência
    // da sessão antes de aceitar o envio.
    lista.push({
      ts: Date.now(), principal, precisao: prec,
      acertos: estado.acertos, tiros: estado.tiros, duracao: cfg.duracao,
    });
    historico[modoAtual] = lista.slice(-MAX_HIST);
    gravar(CHAVE_HIST, historico);

    const bateu = recordeAnterior === null || melhorQue(modoAtual, principal, recordeAnterior);
    capa.hidden = false;
    elementos.btnComecar.textContent = "Repetir";
    elementos.resultado.textContent = bateu
      ? `Recorde novo: ${fmt.unidade(principal)}.`
      : `${fmt.unidade(principal)}. Seu recorde é ${fmt.unidade(recordeAnterior)}.`;

    // A penalidade está dentro do número acima. Dizer quantos aliados foram
    // é o que impede o resultado de parecer pior sem explicação.
    if (estado.aliadosClicados > 0) {
      const n = estado.aliadosClicados;
      elementos.resultado.textContent +=
        ` ${n} ${n === 1 ? "aliado clicado" : "aliados clicados"}, ${n * (regra().penalidade ?? 0)} ms de penalidade.`;
    }

    atualizarHud();
    desenharHistorico();
    desenharRepouso();
    mostrarElo(principal);

    // Quem decide o que fazer com a sessão é quem montou o estande — aqui só
    // se avisa que ela terminou, com os números crus.
    aoEncerrar?.(modoAtual, {
      valor: principal,
      precisao: prec,
      duracao: cfg.duracao,
      tiros: estado.tiros,
      acertos: estado.acertos,
      recorde: bateu,
    });
  }

  /* ------------------------------------------------------- elo do treino -- */

  /** Apaga o que sobrou da rodada anterior: patente, XP e convite a publicar. */
  function limparFimDeTreino() {
    for (const el of [elementos.elo, elementos.convite, elementos.xp]) {
      if (!el) continue;
      el.hidden = true;
      el.replaceChildren();
    }
  }

  /**
   * O que a sessão que acabou significa na escala do jogo.
   *
   * É a mesma conta do ranking (`elo.js`): o desempenho vira um índice de 0 a
   * 100 e o índice vira uma das 25 patentes. A diferença é que aqui ela olha
   * só esta rodada, não o melhor histórico — quem acabou de treinar quer
   * saber como foi agora.
   *
   * A lista de patentes vem da Riot e pode não ter chegado. Nesse caso sobra o
   * índice, que já diz alguma coisa, em vez de um espaço vazio.
   */
  function mostrarElo(valor) {
    const alvo = elementos.elo;
    if (!alvo) return;

    alvo.replaceChildren();
    if (!Number.isFinite(valor)) { alvo.hidden = true; return; }

    const indice = indiceDe(modoAtual, valor);
    const lista = patentes?.() ?? [];
    const patente = lista[patenteDoIndice(indice)] ?? null;

    // O nome da patente fica no corpo, não dentro do selo: num cartão estreito
    // o flex espremia o texto até sumir e sobrava só o ícone.
    if (patente) {
      alvo.style.setProperty("--patente", patente.cor);
      if (patente.iconeGrande) {
        const icone = document.createElement("img");
        icone.className = "elo-treino__icone";
        icone.src = patente.iconeGrande;
        icone.alt = "";
        icone.loading = "lazy";
        alvo.append(icone);
      }
    }

    const corpo = document.createElement("div");
    corpo.className = "elo-treino__corpo";

    if (patente) {
      const nome = document.createElement("div");
      nome.className = "elo-treino__nome";
      nome.textContent = patente.nome;
      corpo.append(nome);
    }

    const num = document.createElement("div");
    num.className = "elo-treino__num";
    num.textContent = patente ? `${indice} de 100` : `Índice ${indice} de 100`;

    const nota = document.createElement("div");
    nota.className = "elo-treino__nota";
    const modo = modos.find((m) => m.id === modoAtual);
    nota.textContent = patente
      ? `Elo estimado por este treino de ${modo?.nome ?? modoAtual}. É a conta deste site, não o seu ranque na Riot.`
      : "Elo estimado por este treino. As patentes não carregaram agora.";

    corpo.append(num, nota);
    alvo.append(corpo);
    alvo.hidden = false;
  }

  /* ---------------------------------------------------------------- HUD -- */

  function atualizarHud() {
    const fmt = TEXTOS[modoAtual];
    const restante = estado.rodando
      ? Math.max(0, (estado.terminaEm - performance.now()) / 1000)
      : cfg.duracao;

    elementos.principal.textContent = estado.rodando || estado.tiros || estado.tempoEmAlvo
      ? fmt.unidade(valorPrincipal())
      : "—";
    elementos.principalRot.textContent = fmt.principal;
    elementos.precisao.textContent = regra().metrica === "tempoEmAlvo"
      ? "—"
      : (estado.tiros ? `${Math.round(precisao())}%` : "—");
    elementos.acertos.textContent = String(estado.acertos);
    elementos.tempo.textContent = restante.toFixed(restante < 10 && estado.rodando ? 1 : 0);

    const lista = historico[modoAtual] ?? [];
    const recorde = lista.length
      ? lista.reduce((m, s) => (melhorQue(modoAtual, s.principal, m) ? s.principal : m), lista[0].principal)
      : null;
    elementos.recorde.textContent = recorde === null ? "—" : fmt.unidade(recorde);
    elementos.recordeRot.textContent = `${fmt.recorde} — ${lista.length} ${lista.length === 1 ? "sessão" : "sessões"}`;
  }

  /* -------------------------------------------------------- histórico ---- */
  // Série única (precisão por sessão), então sem legenda: o título nomeia o que
  // está no gráfico. Um eixo só, linha de 2px, marcadores de 8px, e rótulo
  // direto apenas no último ponto.

  function desenharHistorico() {
    const svg = elementos.hist;
    const lista = (historico[modoAtual] ?? []).slice(-NO_GRAFICO);
    svg.replaceChildren();

    if (lista.length < 2) {
      elementos.histResumo.textContent = lista.length === 1
        ? "Uma sessão registrada. Faça outra para ver a linha."
        : "Faça uma sessão para começar o histórico.";
      return;
    }

    const L = 260, A = 72, pad = { t: 9, b: 14, e: 4, d: 36 };

    // O teto é sempre 100%, que é o limite real da métrica. O piso acompanha os
    // dados em degraus de 10, senão uma série entre 61 e 88 vira uma linha reta
    // colada no topo. O piso fica escrito no eixo, para ninguém ler a variação
    // como maior do que é.
    const valores = lista.map((s) => s.precisao);
    const piso = Math.max(0, Math.floor((Math.min(...valores) - 6) / 10) * 10);
    const px = (i) => pad.e + (i / (lista.length - 1)) * (L - pad.e - pad.d);
    const py = (v) => {
      const t = (Math.max(piso, Math.min(100, v)) - piso) / (100 - piso);
      return pad.t + (1 - t) * (A - pad.t - pad.b);
    };

    const ns = "http://www.w3.org/2000/svg";
    const cria = (tag, atrs) => {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(atrs)) el.setAttribute(k, v);
      return el;
    };

    // Base recessiva, com o piso escrito ao lado para o eixo não mentir.
    svg.append(cria("line", {
      x1: pad.e, y1: py(piso), x2: L - pad.d, y2: py(piso),
      stroke: "var(--linha-fina)", "stroke-width": 1,
    }));
    const marcaPiso = cria("text", {
      x: L - pad.d + 6, y: py(piso) + 4,
      fill: "var(--tinta-3)", "font-size": "10",
    });
    marcaPiso.textContent = `${piso}%`;
    svg.append(marcaPiso);

    const melhor = Math.max(...valores);
    svg.append(cria("line", {
      x1: pad.e, y1: py(melhor), x2: L - pad.d, y2: py(melhor),
      stroke: "var(--latao)", "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0.6,
    }));

    svg.append(cria("polyline", {
      points: lista.map((s, i) => `${px(i)},${py(s.precisao)}`).join(" "),
      fill: "none", stroke: "var(--sinal)", "stroke-width": 2,
      "stroke-linejoin": "round", "stroke-linecap": "round",
    }));

    lista.forEach((s, i) => {
      const ultimo = i === lista.length - 1;
      svg.append(cria("circle", {
        cx: px(i), cy: py(s.precisao), r: ultimo ? 4 : 3,
        fill: "var(--sinal)", stroke: "var(--aco)", "stroke-width": 2,
      }));
      // Alvo de interação maior que a marca.
      const alvo = cria("circle", { cx: px(i), cy: py(s.precisao), r: 9, fill: "transparent" });
      alvo.style.cursor = "pointer";
      const mostrar = () => {
        const d = new Date(s.ts);
        elementos.histDica.hidden = false;
        elementos.histDica.textContent =
          `${Math.round(s.precisao)}% · ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
        const caixa = svg.getBoundingClientRect();
        elementos.histDica.style.left = `${(px(i) / L) * caixa.width}px`;
        elementos.histDica.style.top = `${(py(s.precisao) / A) * caixa.height}px`;
      };
      alvo.addEventListener("pointerenter", mostrar);
      alvo.addEventListener("pointerleave", () => { elementos.histDica.hidden = true; });
      svg.append(alvo);
    });

    const atual = lista[lista.length - 1];
    const rotulo = cria("text", {
      x: L - pad.d + 6, y: py(atual.precisao) + 4,
      fill: "var(--tinta-2)", "font-size": "11", "font-weight": "600",
    });
    rotulo.textContent = `${Math.round(atual.precisao)}%`;
    svg.append(rotulo);

    const media = lista.reduce((s, v) => s + v.precisao, 0) / lista.length;
    elementos.histResumo.textContent =
      `Última ${Math.round(atual.precisao)}%, média ${Math.round(media)}%, melhor ${Math.round(melhor)}% em ${lista.length} sessões.`;
  }

  /* ---------------------------------------------------------- interface -- */

  function trocarModo(id) {
    if (estado.rodando) encerrar();
    modoAtual = id;
    const modo = modos.find((m) => m.id === id);
    if (modo) {
      elementos.capaTitulo.textContent = modo.nome;
      elementos.capaTexto.textContent = modo.descricao;
      if (Number(modo.duracao) > 0) {
        cfg.duracao = Number(modo.duracao);
        elementos.cfgDuracao.value = String(cfg.duracao);
        elementos.valDuracao.textContent = `${cfg.duracao} s`;
      }
    }
    elementos.btnComecar.textContent = "Acender as luzes";
    elementos.resultado.textContent = "";
    limparFimDeTreino();
    // A arte de carregamento é pedida agora, não no clique: assim a tela de
    // entrada já nasce com a imagem no lugar.
    if (ARTE[id]?.carga) new Image().src = ARTE[id].carga;
    if (regraDe(id).forma === "silhueta") carregarBoneco();
    elementos.histTitulo.textContent = `Precisão das últimas ${NO_GRAFICO} sessões de ${modo?.nome ?? id}`;
    capa.hidden = false;
    Object.assign(estado, { alvos: [], acertos: 0, tiros: 0, reacoes: [], tempoEmAlvo: 0, aliadosClicados: 0 });
    atualizarHud();
    desenharHistorico();
    desenharRepouso();
    aoTrocarModo?.(id);
  }

  // Botões de mira. Os ícones são redesenhados a cada ajuste: assim o botão
  // mostra a mira que vai aparecer no campo, e não um desenho genérico.
  const botoesDeMira = [];

  function repintarIconesDeMira() {
    for (const { botao, id } of botoesDeMira) botao.innerHTML = miraSvg(id, cfg);
  }

  elementos.cfgMira.replaceChildren();
  for (const m of MIRAS) {
    const b = document.createElement("button");
    b.type = "button";
    b.title = m.nome;
    b.setAttribute("aria-label", m.nome);
    b.setAttribute("aria-pressed", String(cfg.mira === m.id));
    b.innerHTML = miraSvg(m.id, cfg);
    b.addEventListener("click", () => {
      cfg.mira = m.id;
      gravar(CHAVE_CFG, cfg);
      for (const outro of elementos.cfgMira.children) {
        outro.setAttribute("aria-pressed", String(outro === b));
      }
    });
    botoesDeMira.push({ botao: b, id: m.id });
    elementos.cfgMira.append(b);
  }

  /* --------------------------------------------- ajustes da mira -------- */
  /**
   * Cor, espessura, vão e comprimento ficam logo abaixo dos quatro estilos,
   * no mesmo campo. São montados aqui, e não no HTML, porque quem desenha a
   * mira é este arquivo: um controle novo nasce junto do código que o usa, em
   * vez de virar mais um id espalhado entre três arquivos.
   */
  (function montarAjustesDeMira() {
    const campo = elementos.cfgMira.closest(".config__campo") ?? elementos.cfgMira.parentElement;
    if (!campo) return;

    const cores = document.createElement("div");
    cores.className = "config__cores";
    cores.setAttribute("role", "group");
    cores.setAttribute("aria-label", "Cor da mira");

    for (const c of CORES_MIRA) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "config__cor";
      b.style.setProperty("--cor", c.id);
      b.title = c.nome;
      b.setAttribute("aria-label", c.nome);
      b.setAttribute("aria-pressed", String(cfg.miraCor === c.id));
      b.addEventListener("click", () => {
        cfg.miraCor = c.id;
        gravar(CHAVE_CFG, cfg);
        for (const outro of cores.children) outro.setAttribute("aria-pressed", String(outro === b));
        repintarIconesDeMira();
        if (!estado.rodando) desenharRepouso();
      });
      cores.append(b);
    }
    campo.append(cores);

    for (const [chave, faixa] of Object.entries(AJUSTES_MIRA)) {
      const prop = `mira${chave[0].toUpperCase()}${chave.slice(1)}`;
      const rotulo = document.createElement("label");
      rotulo.className = "config__campo config__campo--fino";

      const texto = document.createElement("span");
      const valor = document.createElement("b");
      valor.className = "config__valor";
      valor.textContent = `${cfg[prop]} px`;
      texto.append(document.createTextNode(`${faixa.rotulo} `), valor);

      const faixaEl = document.createElement("input");
      faixaEl.type = "range";
      faixaEl.min = String(faixa.min);
      faixaEl.max = String(faixa.max);
      faixaEl.step = String(faixa.passo);
      faixaEl.value = String(cfg[prop]);
      faixaEl.addEventListener("input", () => {
        cfg[prop] = Number(faixaEl.value);
        valor.textContent = `${cfg[prop]} px`;
        gravar(CHAVE_CFG, cfg);
        repintarIconesDeMira();
        if (!estado.rodando) desenharRepouso();
      });

      rotulo.append(texto, faixaEl);
      campo.append(rotulo);
    }
  })();

  elementos.cfgTamanho.value = String(cfg.tamanho);
  elementos.valTamanho.textContent = `${cfg.tamanho} px`;
  elementos.cfgTamanho.addEventListener("input", () => {
    cfg.tamanho = Number(elementos.cfgTamanho.value);
    elementos.valTamanho.textContent = `${cfg.tamanho} px`;
    gravar(CHAVE_CFG, cfg);
    if (!estado.rodando) desenharRepouso();
  });

  elementos.cfgDuracao.addEventListener("input", () => {
    cfg.duracao = Number(elementos.cfgDuracao.value);
    elementos.valDuracao.textContent = `${cfg.duracao} s`;
    gravar(CHAVE_CFG, cfg);
    atualizarHud();
  });

  elementos.btnComecar.addEventListener("click", comecar);

  tela.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 && ev.pointerType === "mouse") return;
    estado.mouse.pressionado = true;
    const { x, y } = coordenadas(ev);
    estado.mouse.x = x; estado.mouse.y = y; estado.mouse.dentro = true;
    atirar(ev);
  });
  ouvir(window, "pointerup", () => { estado.mouse.pressionado = false; });
  tela.addEventListener("pointermove", (ev) => {
    const { x, y } = coordenadas(ev);
    estado.mouse.x = x; estado.mouse.y = y; estado.mouse.dentro = true;
    if (!estado.rodando) return;
    mira?.mover(x, y);
    ev.preventDefault();
  });
  tela.addEventListener("pointerleave", () => { estado.mouse.dentro = false; });
  tela.addEventListener("contextmenu", (ev) => { if (estado.rodando) ev.preventDefault(); });

  // Sair da aba no meio da sessão encerra: um resultado com pausa não vale.
  ouvir(document, "visibilitychange", () => {
    if (document.hidden && estado.rodando) encerrar();
  });

  ouvir(window, "resize", redimensionar);
  ouvir(window, "resize", recentralizar);
  redimensionar();
  trocarModo(modoAtual);

  /**
   * Tirar o estande de cena. Não é `encerrar()`: quem sai da tela no meio de
   * uma sessão não quer o resultado dela registrado, só quer o laço e os
   * ouvintes parados.
   */
  function parar() {
    estado.rodando = false;
    cancelAnimationFrame(quadro);
    for (const limpar of limpezas.splice(0)) limpar();
  }

  return { trocarModo, encerrar, parar, get modoAtual() { return modoAtual; } };
}

/**
 * O ícone de cada estilo, desenhado com a cor e a espessura escolhidas. O
 * vão e o comprimento entram em escala: o botão tem 20 px de lado e a mira
 * de verdade pode ter 40, então copiar os números crus estouraria o quadro.
 */
function miraSvg(id, cfg = MIRA_PADRAO) {
  const n = (v, p) => Math.round(v * 100) / 100;
  const cor = cfg.miraCor || MIRA_PADRAO.miraCor;
  const esp = n(Math.max(1, Math.min(4, (Number(cfg.miraEspessura) || 2) * 0.8)));
  const vao = n(Math.min(4.5, (Number(cfg.miraVao) ?? 4) * 0.45));
  // O braço para a 1,5 px da borda do quadro de 20: encostando, o ícone parece
  // cortado e os quatro botões viram a mesma mancha.
  const braco = n(Math.max(1.5, Math.min(8.5 - vao, (Number(cfg.miraBraco) || 9) * 0.45)));
  const t = `stroke="${cor}" stroke-width="${esp}" fill="none"`;
  const d = Math.max(1, esp * 0.8);

  const cruz = `<path d="M10 ${10 - vao}V${10 - vao - braco}M10 ${10 + vao}V${10 + vao + braco}M${10 - vao} 10H${10 - vao - braco}M${10 + vao} 10H${10 + vao + braco}" ${t}/>`;
  const ponto = `<circle cx="10" cy="10" r="${d}" fill="${cor}"/>`;

  if (id === "cruz") return `<svg width="20" height="20" viewBox="0 0 20 20">${cruz}</svg>`;
  if (id === "ponto") return `<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="${Math.max(1.6, d * 1.5)}" fill="${cor}"/></svg>`;
  if (id === "circulo") {
    const r = Math.min(8, vao + braco * 0.6 + 2);
    return `<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="${r}" ${t}/>${ponto}</svg>`;
  }
  return `<svg width="20" height="20" viewBox="0 0 20 20">${cruz}${ponto}</svg>`;
}
