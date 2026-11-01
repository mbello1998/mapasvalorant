import { carregarConteudo, carregarArsenal, carregarAgentes, carregarMapas } from "./api.js";
import { $, elemento, semMarcacao, vestirPagina } from "./chrome.js";
import { carregarConta, montarBotaoDeConta, contaAtual, aoMudarConta } from "./conta.js";
import { publicarTreino, recadoDoEnvio, montarInterruptor } from "./publicar.js";
import { registrarTreino, mostrarGanhoDeXp } from "./progresso.js";
import {
  corComAlfa, recuo, fundoDaFoto, primeiroPlano, desenharViewmodel,
} from "./cena.js";
import {
  acordarAudio, somLigado, volumeSom, alternarSom, ajustarVolume,
  somTiro, somRecarga, somSemMunicao, somSaque, somAcerto, somAbate, somErro,
  somCarregando, somEntrou, somContagem, somFim,
  prepararMusica, tocarCarregamento, musicaPronta,
  prepararArma, tiroComAmostra, recargaComAmostra, saqueComAmostra, armaTemAmostras,
} from "./audio.js";

/**
 * A Linha de Tiro.
 *
 * A diferença para um aim trainer comum é que aqui a arma importa de verdade:
 * cadência, carregador, tempo de recarga, tempo de saque e a tabela de dano por
 * distância vêm das estatísticas que a Riot publica. Com a Vandal, cabeça a
 * qualquer distância é 160 e mata de um tiro; com a Phantom, passados 15 metros
 * cai para 140 e não mata mais. Isso aparece no placar.
 *
 * O agente dá uma vantagem por função. Isso é regra da casa, não do jogo — o
 * site diz isso na tela.
 */

const CHAVE_LOADOUT = "estande.loadout.v1";
const CHAVE_RECORDE = "estande.linha.v1";

const VIDA_BOT = 100;

// Vantagem por função. Inventada para este minigame, não existe no VALORANT.
const PERKS = {
  Duelista:    { id: "duelista",    texto: "Abate devolve 1,5 s ao relógio." },
  Iniciador:   { id: "iniciador",   texto: "Bonecos nascem com o contorno marcado por 1 s." },
  Controlador: { id: "controlador", texto: "Bonecos nascem mais perto, entre 8 e 28 metros." },
  Sentinela:   { id: "sentinela",   texto: "Recarga 35% mais rápida e um tiro a mais no carregador." },
};

const estado = {
  conteudo: null, arsenal: null, agentes: null,
  agente: null, arma: null, skin: null,
  filtroFuncao: null, filtroCategoria: null, buscaSkin: "",
};

const porUuid = { armas: new Map(), skins: new Map(), raridades: new Map() };

/* ------------------------------------------------------------- imagens --- */
// Arte oficial, servida do CDN da Riot. Nada é baixado nem reservido daqui: o
// navegador busca direto, como já faz com os retratos e os ícones do site.

const arte = { mapa: null, arma: null, mapaUrl: null, fundo: null, alvo: null };

/**
 * Onde o balcão do estande começa, em fração da altura da foto.
 *
 * Na captura do campo de treino, a barricada de sacos de areia tem o topo em
 * torno de 66% da altura. Tudo abaixo disso é
 * primeiro plano: é redesenhado POR CIMA dos bonecos, e é isso que faz eles
 * ficarem atrás do estande em vez de flutuando na frente dele.
 */
const BALCAO = 0.66;

/** O recorte de cobertura da foto, calculado uma vez e reaproveitado. */
let enquadre = null;

function calcularEnquadre() {
  if (!arte.fundo) { enquadre = null; return; }
  const escala = Math.max(larg / arte.fundo.width, alt / arte.fundo.height);
  const w = arte.fundo.width * escala;
  const h = arte.fundo.height * escala;
  enquadre = { x: (larg - w) / 2, y: (alt - h) / 2, w, h, escala };
}

/** Converte uma fração vertical da foto na coordenada de tela correspondente. */
const naFoto = (fracao) => (enquadre ? enquadre.y + enquadre.h * fracao : alt * fracao);
const cacheImg = new Map();

function imagem(url) {
  if (!url) return Promise.resolve(null);
  if (cacheImg.has(url)) return cacheImg.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  cacheImg.set(url, p);
  return p;
}

/** A arte que o jogador vê embaixo da arma: a skin, ou a arma sem skin. */
function urlDaArmaNaTela() {
  if (estado.skin) return estado.skin.cromas?.[0]?.arte || estado.skin.icone;
  return estado.arma?.icone ?? null;
}

async function prepararArteDaArma() {
  arte.arma = await imagem(urlDaArmaNaTela());
}

/* ---------------------------------------------------------- persistência -- */

const ler = (chave, reserva) => {
  try { return JSON.parse(localStorage.getItem(chave) ?? "null") ?? reserva; }
  catch { return reserva; }
};
const gravar = (chave, valor) => {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* modo privado */ }
};

/* ============================================================== o jogo === */

const tela = $("tela");
const ctx = tela.getContext("2d", { alpha: false });
// As luzes acendem só no campo. Invertendo o <main> inteiro, o preparo e o
// cabeçalho iriam junto — e não é isso que um estande faz.
const secao = $("campo");

let larg = 1000, alt = 600;
let paleta = {};
let quadro = 0, ultimoTique = 0;

const jogo = {
  rodando: false,
  bots: [],
  municao: 0,
  recarregandoAte: 0,
  prontoEm: 0,
  ultimoTiro: 0,
  tiros: 0, acertos: 0, cabecas: 0, abates: 0, dano: 0,
  sprayN: 0,
  comecouEm: 0, terminaEm: 0,
  perkAte: 0,
  mouse: { x: 0, y: 0, dentro: false },
  log: [],
};

function lerPaleta() {
  const cs = getComputedStyle(secao);
  const t = (n, r) => cs.getPropertyValue(n).trim() || r;
  paleta = {
    aco: t("--aco", "#16262E"),
    linha: t("--linha-fina", "#24414F"),
    luz: t("--luz", "#E9EDE6"),
    sinal: t("--sinal", "#FF4655"),
    latao: t("--latao", "#D4A24C"),
    tinta2: t("--tinta-2", "#A9BEC6"),
  };
}

/** O elemento que vai para tela cheia: a moldura com canvas, HUD e capa. */
const moldura = () => $("campoTela");

const emTelaCheia = () => document.fullscreenElement === moldura();

async function entrarTelaCheia() {
  const el = moldura();
  if (!el?.requestFullscreen || document.fullscreenElement) return;
  try {
    await el.requestFullscreen({ navigationUI: "hide" });
  } catch (e) {
    // Navegador ou política do sistema pode recusar — e o clique precisa ser
    // de gente de verdade, senão vem "not granted". Nada disso impede a
    // rodada de acontecer.
    console.info("Tela cheia recusada:", e.message);
  }
}

/**
 * Em tela cheia o navegador só desenha o elemento escolhido e o que está
 * dentro dele. A tela de entrada no mapa mora no <body>, então sumiria. Aqui
 * ela é mudada de lugar enquanto dura a tela cheia, e volta depois.
 */
function acomodarTelaDeCarga() {
  const carga = $("telaCarga");
  const el = moldura();
  if (!carga || !el) return;
  const destino = emTelaCheia() ? el : document.body;
  if (carga.parentElement !== destino) destino.append(carga);
}

async function sairTelaCheia() {
  if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch { /* ja saiu */ }
  }
}

function redimensionar() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  if (emTelaCheia()) {
    // Em tela cheia a moldura vale a janela inteira: o canvas se ajusta ao
    // menor dos dois lados para caber sem cortar nem distorcer.
    const propAlvo = 0.6;
    const dispW = window.innerWidth;
    const dispH = window.innerHeight;
    larg = Math.round(Math.min(dispW, dispH / propAlvo));
    alt = Math.round(larg * propAlvo);
    tela.style.width = `${larg}px`;
  } else {
    tela.style.width = "";
    larg = Math.max(320, Math.round(tela.getBoundingClientRect().width));
    alt = Math.round(larg * 0.6);
  }
  tela.style.height = `${alt}px`;
  tela.width = Math.round(larg * dpr);
  tela.height = Math.round(alt * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  calcularEnquadre();
  lerPaleta();
  if (!jogo.rodando) desenharRepouso();
}

/* ----------------------------------------------------------------- bots -- */

const perkAtivo = () => estado.agente && performance.now() < jogo.perkAte
  ? PERKS[estado.agente.role?.displayName]?.id ?? null
  : null;

const perkDoAgente = () => PERKS[estado.agente?.role?.displayName]?.id ?? null;

/**
 * Onde um alvo a tantos metros encosta no chão.
 *
 * Boneco e marca de distância precisam usar a MESMA conta, senão a marca de
 * "30 m" no piso fica num lugar e o boneco que diz 30 m fica noutro — e aí a
 * marca não quer dizer nada.
 */
const yDaDistancia = (metros) => {
  const t = (metros - 8) / 37;            // 0 a 8 m, 1 a 45 m
  if (enquadre) {
    // Com a foto, os pés pousam na faixa de chão que existe entre a parede do
    // fundo e a barricada. Quem está perto fica com as pernas atrás do balcão,
    // que é exatamente o que se vê no jogo.
    return naFoto(0.70 - t * 0.085);
  }
  return alt * (0.78 - t * 0.28);
};

/** A altura do boneco encolhe com a distância; é ela que torna a cabeça difícil. */
const alturaDaDistancia = (metros) => {
  const escala = 1 - ((metros - 8) / 37) * 0.62;
  return (enquadre ? enquadre.h * 0.30 : alt * 0.46) * escala;
};

/** A distância define o tamanho do boneco — é ela que torna a cabeça difícil. */
function nascerBot() {
  const perto = perkDoAgente() === "controlador";
  const distancia = perto ? 8 + Math.random() * 20 : 8 + Math.random() * 37;
  const alturaBot = alturaDaDistancia(distancia);
  const margem = alturaBot * 0.4 + 12;

  // Alvos empilhados não treinam nada: tenta algumas posições até achar uma
  // que não encoste nos bonecos que já estão de pé.
  let px = margem + Math.random() * Math.max(1, larg - margem * 2);
  const vivos = jogo.bots.filter((b) => !b.morto);
  for (let tentativa = 0; tentativa < 24; tentativa++) {
    const candidato = margem + Math.random() * Math.max(1, larg - margem * 2);
    const perto = vivos.some((b) => Math.abs(b.x - candidato) < (b.h + alturaBot) * 0.3);
    if (!perto) { px = candidato; break; }
  }

  jogo.bots.push({
    x: px,
    y: yDaDistancia(distancia),
    distancia,
    h: alturaBot,
    vida: VIDA_BOT,
    nascidoEm: performance.now(),
    balanco: Math.random() * Math.PI * 2,
    morto: false,
    morreuEm: 0,
  });
}

// Proporção do sprite do boneco (144x316) e onde cada parte cai nele, medido
// linha a linha na imagem: capacete até 15% da altura, tronco e braços até
// 58%, pernas daí para baixo. As caixas de acerto seguem esses números, senão
// o jogador clica na cabeça que vê e o jogo registra corpo.
const PROPORCAO_ALVO = 144 / 316;

/** Partes do boneco em coordenadas de tela, para o acerto e para o desenho. */
function partes(bot) {
  const h = bot.h;
  const w = h * PROPORCAO_ALVO;
  const topo = bot.y - h;
  return {
    largura: w,
    topo,
    cabeca: { cx: bot.x, cy: topo + h * 0.075, r: h * 0.072 },
    tronco: { x: bot.x - w * 0.36, y: topo + h * 0.15, w: w * 0.72, h: h * 0.43 },
    pernas: { x: bot.x - w * 0.26, y: topo + h * 0.58, w: w * 0.52, h: h * 0.42 },
  };
}

function ondeAcertou(bot, x, y) {
  const p = partes(bot);
  if (Math.hypot(x - p.cabeca.cx, y - p.cabeca.cy) <= p.cabeca.r) return "cabeca";
  if (x >= p.tronco.x && x <= p.tronco.x + p.tronco.w && y >= p.tronco.y && y <= p.tronco.y + p.tronco.h) return "corpo";
  if (x >= p.pernas.x && x <= p.pernas.x + p.pernas.w && y >= p.pernas.y && y <= p.pernas.y + p.pernas.h) return "perna";
  return null;
}

/** Dano real: a faixa de distância da arma decide quanto cada parte tira. */
function danoDe(arma, parte, distancia) {
  const faixas = arma.stats?.alcances ?? [];
  const faixa = faixas.find((f) => distancia >= f.de && distancia <= f.ate) ?? faixas[faixas.length - 1];
  if (!faixa) return 40;
  return parte === "cabeca" ? faixa.cabeca : parte === "perna" ? faixa.perna : faixa.corpo;
}

/* -------------------------------------------------------------- desenho -- */

function fundo() {
  ctx.fillStyle = paleta.aco;
  ctx.fillRect(0, 0, larg, alt);

  // Com a foto do campo de treino, ela manda. Sem ela, vale o estande
  // desenhado logo abaixo.
  if (enquadre) {
    fundoDaFoto(ctx, {
      arte, enquadre, naFoto, larg, alt, paleta,
      aceso: secao.dataset.luz === "acesa", yDaDistancia,
    });
    return;
  }

  // O campo de tiro, desenhado.
  //
  // Antes isto era o splash oficial do mapa esticado para cobrir o quadro — e
  // ficava errado, porque aquela arte é uma vista aérea promocional, não a vista
  // de quem está na baia atirando. Esticada virava borrão. O splash continua
  // onde faz sentido: na tela de entrada no mapa.
  //
  // O que está aqui é a baia em si: parede ao fundo, baias laterais, calha de
  // luz no teto e marcas de distância no chão, tudo na perspectiva que o
  // tamanho dos bonecos já usava.

  const horizonte = alt * 0.38;
  const aceso = secao.dataset.luz === "acesa";
  const fuga = larg / 2;

  // ---- parede do fundo ----
  const parede = ctx.createLinearGradient(0, 0, 0, horizonte);
  parede.addColorStop(0, corComAlfa(paleta.linha, aceso ? 0.22 : 0.5));
  parede.addColorStop(1, corComAlfa(paleta.linha, aceso ? 0.1 : 0.26));
  ctx.fillStyle = parede;
  ctx.fillRect(0, 0, larg, horizonte);

  // Faixa de advertência no alto da parede, como num estande de verdade.
  ctx.save();
  ctx.globalAlpha = aceso ? 0.3 : 0.4;
  ctx.fillStyle = paleta.latao;
  const faixaY = horizonte * 0.26;
  const faixaH = Math.max(6, alt * 0.016);
  for (let x = -faixaH; x < larg + faixaH; x += faixaH * 2.4) {
    ctx.beginPath();
    ctx.moveTo(x, faixaY + faixaH);
    ctx.lineTo(x + faixaH, faixaY);
    ctx.lineTo(x + faixaH * 2, faixaY);
    ctx.lineTo(x + faixaH, faixaY + faixaH);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // ---- calha de luz no teto ----
  ctx.save();
  ctx.globalAlpha = aceso ? 0.5 : 0.22;
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    const lx = fuga + (t - 0.5) * larg * 1.6;
    const ly = horizonte * 0.08;
    const lw = larg * 0.1;
    ctx.fillStyle = paleta.luz;
    ctx.fillRect(lx - lw / 2, ly, lw, Math.max(3, alt * 0.009));
    const halo = ctx.createRadialGradient(lx, ly, 0, lx, ly, larg * 0.14);
    halo.addColorStop(0, corComAlfa(paleta.luz, 0.22));
    halo.addColorStop(1, corComAlfa(paleta.luz, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(lx, ly, larg * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ---- piso ----
  const piso = ctx.createLinearGradient(0, horizonte, 0, alt);
  piso.addColorStop(0, corComAlfa(paleta.aco, 0));
  piso.addColorStop(1, corComAlfa(paleta.linha, aceso ? 0.16 : 0.3));
  ctx.fillStyle = piso;
  ctx.fillRect(0, horizonte, larg, alt - horizonte);

  // Linha do horizonte: onde a parede encontra o chão.
  ctx.strokeStyle = corComAlfa(paleta.linha, 0.9);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizonte);
  ctx.lineTo(larg, horizonte);
  ctx.stroke();

  // Traves das baias, convergindo para o ponto de fuga.
  ctx.strokeStyle = corComAlfa(paleta.linha, aceso ? 0.55 : 0.75);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const xBase = t * larg;
    ctx.moveTo(fuga + (xBase - fuga) * 0.17, horizonte);
    ctx.lineTo(xBase, alt);
  }
  ctx.stroke();

  // Marcas de distância no chão, em metros, como as do campo de treino.
  ctx.save();
  ctx.font = `600 ${Math.max(9, alt * 0.019)}px Barlow, sans-serif`;
  ctx.textAlign = "left";
  for (const metros of [10, 20, 30, 40]) {
    const y = yDaDistancia(metros);
    ctx.strokeStyle = corComAlfa(paleta.linha, 0.8);
    ctx.lineWidth = metros % 20 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(larg, y);
    ctx.stroke();

    ctx.fillStyle = corComAlfa(paleta.tinta2, 0.65);
    ctx.fillText(`${metros} m`, 10, y - 4);
  }
  ctx.restore();

  // Postes divisórios das baias, nas laterais — o que dá o cheiro de estande.
  ctx.save();
  ctx.globalAlpha = aceso ? 0.35 : 0.5;
  ctx.fillStyle = paleta.linha;
  for (const lado of [-1, 1]) {
    for (const metros of [12, 22, 32, 42]) {
      const prof = 1 - (metros - 8) / 45;
      const px = fuga + lado * (larg * 0.44) * (0.28 + prof * 0.95);
      const py = yDaDistancia(metros);
      const ph = alt * 0.11 * (0.32 + prof * 0.85);
      const pw = Math.max(3, larg * 0.012 * (0.35 + prof));
      ctx.fillRect(px - pw / 2, py - ph, pw, ph);
    }
  }
  ctx.restore();
}

function desenharBot(bot, agora) {
  const p = partes(bot);
  const vivo = !bot.morto;
  const surgindo = Math.min(1, (agora - bot.nascidoEm) / 160);
  const marcado = perkDoAgente() === "iniciador" && agora - bot.nascidoEm < 1000;

  ctx.save();
  if (!vivo) {
    // Cai para trás e some, como o boneco do campo de treino.
    const t = (agora - bot.morreuEm) / 420;
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.translate(bot.x, bot.y);
    ctx.rotate(t * 0.55);
    ctx.translate(-bot.x, -bot.y);
  } else {
    ctx.globalAlpha = surgindo;
  }

  if (arte.alvo) {
    // O contorno vermelho é o que faz o boneco saltar da foto do estande, que
    // é quente e cheia de detalhe. Sem ele o alvo some no fundo.
    const brilho = Math.max(2, p.largura * 0.045);
    ctx.filter = `drop-shadow(0 0 ${brilho}px ${corComAlfa(paleta.sinal, 0.95)})`;
    ctx.drawImage(arte.alvo, bot.x - p.largura / 2, p.topo, p.largura, bot.h);
    ctx.filter = "none";
  } else {
    // Reserva, se o sprite não carregar.
    ctx.fillStyle = paleta.sinal;
    ctx.fillRect(p.tronco.x, p.tronco.y, p.tronco.w, p.tronco.h);
    ctx.fillRect(p.pernas.x, p.pernas.y, p.pernas.w, p.pernas.h);
    ctx.beginPath();
    ctx.arc(p.cabeca.cx, p.cabeca.cy, p.cabeca.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Anel na cabeça: a área que mata, visível sem depender só da cor.
  ctx.beginPath();
  ctx.arc(p.cabeca.cx, p.cabeca.cy, p.cabeca.r * 1.55, 0, Math.PI * 2);
  ctx.strokeStyle = paleta.luz;
  ctx.lineWidth = Math.max(1, p.largura * 0.018);
  ctx.globalAlpha *= 0.5;
  ctx.stroke();
  ctx.globalAlpha = vivo ? surgindo : ctx.globalAlpha;

  if (marcado && vivo) {
    ctx.strokeStyle = paleta.latao;
    ctx.lineWidth = 2;
    ctx.strokeRect(bot.x - p.largura * 0.6, p.topo - 6, p.largura * 1.2, bot.h + 12);
  }

  if (vivo && bot.vida < VIDA_BOT) {
    const w = p.largura * 0.8;
    const x = bot.x - w / 2;
    const y = p.topo - p.cabeca.r * 1.1;
    ctx.globalAlpha = 1;
    ctx.fillStyle = paleta.linha;
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = paleta.latao;
    ctx.fillRect(x, y, w * (bot.vida / VIDA_BOT), 4);
  }

  ctx.restore();

  if (vivo) {
    ctx.fillStyle = paleta.tinta2;
    ctx.font = `600 ${Math.max(9, bot.h * 0.075)}px Barlow, sans-serif`;
    ctx.textAlign = "center";
    ctx.globalAlpha = 0.75;
    ctx.fillText(`${Math.round(bot.distancia)} m`, bot.x, bot.y + 14);
    ctx.globalAlpha = 1;
  }
}

/**
 * Placar dentro do canvas, só em tela cheia.
 *
 * Fora dela o painel ao lado já mostra tudo; em tela cheia ele fica fora do
 * elemento desenhado, e sem isto o jogador perderia de vista o tempo e os
 * abates no meio da rodada.
 */
function desenharPlacarNaTela() {
  const restante = Math.max(0, (jogo.terminaEm - performance.now()) / 1000);
  const hs = jogo.acertos ? Math.round((jogo.cabecas / jogo.acertos) * 100) : 0;

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = corComAlfa(paleta.aco, 0.72);
  const w = larg * 0.3;
  const h = alt * 0.1;
  ctx.fillRect(larg / 2 - w / 2, 0, w, h);

  ctx.fillStyle = paleta.sinal;
  ctx.font = `700 ${Math.round(h * 0.46)}px "Chakra Petch", sans-serif`;
  ctx.fillText(String(jogo.abates), larg / 2 - w * 0.26, h * 0.52);

  ctx.fillStyle = paleta.luz;
  ctx.fillText(restante.toFixed(restante < 10 ? 1 : 0), larg / 2 + w * 0.26, h * 0.52);

  ctx.fillStyle = paleta.tinta2;
  ctx.font = `600 ${Math.round(h * 0.2)}px Barlow, sans-serif`;
  ctx.fillText("abates", larg / 2 - w * 0.26, h * 0.82);
  ctx.fillText("segundos", larg / 2 + w * 0.26, h * 0.82);
  if (jogo.acertos) {
    ctx.fillText(`${hs}% na cabeça`, larg / 2, h * 0.82);
  }
  ctx.restore();
}

const flutuantes = [];

function desenharMira(agora) {
  if (!jogo.mouse.dentro) return;
  const { x, y } = jogo.mouse;
  const recarregando = agora < jogo.recarregandoAte;

  // A mira abre com o spray: é o retrato do erro que a arma vai cometer.
  const abertura = 5 + jogo.sprayN * 2.1;
  ctx.strokeStyle = recarregando ? paleta.tinta2 : paleta.luz;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - abertura - 8, y); ctx.lineTo(x - abertura, y);
  ctx.moveTo(x + abertura, y); ctx.lineTo(x + abertura + 8, y);
  ctx.moveTo(x, y - abertura - 8); ctx.lineTo(x, y - abertura);
  ctx.moveTo(x, y + abertura); ctx.lineTo(x, y + abertura + 8);
  ctx.stroke();
  ctx.fillStyle = recarregando ? paleta.tinta2 : paleta.luz;
  ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
}

function desenharFlutuantes(agora) {
  for (let i = flutuantes.length - 1; i >= 0; i--) {
    const f = flutuantes[i];
    const t = (agora - f.em) / 750;
    if (t >= 1) { flutuantes.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = f.cor;
    ctx.font = `700 ${f.tam}px "Chakra Petch", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(f.texto, f.x, f.y - t * 34);
    ctx.globalAlpha = 1;
  }
}

function desenharRepouso() {
  fundo();
  primeiroPlano(ctx, {
    arte, enquadre, naFoto, balcao: BALCAO, larg, alt,
    aceso: secao.dataset.luz === "acesa",
  });
  ctx.fillStyle = paleta.tinta2;
  ctx.font = '600 15px Barlow, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("o campo está apagado", larg / 2, alt / 2);
}

/* ----------------------------------------------------------------- laço -- */

function laco(agora) {
  if (!jogo.rodando) return;
  quadro = requestAnimationFrame(laco);
  ultimoTique = agora;

  if (agora >= jogo.terminaEm) { encerrar(); return; }

  // O spray fecha sozinho quando você para de atirar.
  if (jogo.sprayN > 0 && agora - jogo.ultimoTiro > 420) {
    jogo.sprayN = Math.max(0, jogo.sprayN - 0.22);
  }

  // Recarga automática quando o carregador acaba.
  if (jogo.municao === 0 && agora >= jogo.recarregandoAte) {
    jogo.municao = capacidade();
    atualizarMunicao();
  }

  for (let i = jogo.bots.length - 1; i >= 0; i--) {
    const b = jogo.bots[i];
    if (b.morto && agora - b.morreuEm > 440) jogo.bots.splice(i, 1);
  }
  while (jogo.bots.filter((b) => !b.morto).length < 3) nascerBot();

  fundo();
  for (const b of jogo.bots) desenharBot(b, agora);
  primeiroPlano(ctx, {
    arte, enquadre, naFoto, balcao: BALCAO, larg, alt,
    aceso: secao.dataset.luz === "acesa",
  });
  desenharFlutuantes(agora);
  desenharMira(agora);
  if (emTelaCheia()) desenharPlacarNaTela();
  desenharViewmodel(ctx, {
    arte, agora, agente: estado.agente, larg, alt, paleta,
    recarregando: agora < jogo.recarregandoAte,
  });

  atualizarPlacar();
}

/* ----------------------------------------------------------------- tiro -- */

const capacidade = () => {
  const base = estado.arma?.stats?.carregador ?? 12;
  return perkDoAgente() === "sentinela" ? base + 1 : base;
};

const tempoRecarga = () => {
  const base = (estado.arma?.stats?.recarga ?? 2) * 1000;
  return perkDoAgente() === "sentinela" ? base * 0.65 : base;
};

function atualizarMunicao() {
  const cap = capacidade();
  $("muniAtual").textContent = `${jogo.municao} / ${cap}`;
  $("muniBarra").style.width = `${(jogo.municao / cap) * 100}%`;
  $("muniAviso").hidden = jogo.municao > 0;
}

function registrar(texto, tom) {
  jogo.log.unshift({ texto, tom });
  jogo.log = jogo.log.slice(0, 6);
  const lista = $("log");
  lista.replaceChildren();
  if (!jogo.log.length) {
    lista.append(elemento("li", { class: "ultima__vazio", texto: "Nada ainda." }));
    return;
  }
  for (const l of jogo.log) {
    lista.append(elemento("li", { class: `ultima__item ultima__item--${l.tom}`, texto: l.texto }));
  }
}

function atirar(ev) {
  const agora = performance.now();
  if (!jogo.rodando) return;
  if (agora < jogo.prontoEm) return;               // ainda sacando a arma
  if (agora < jogo.recarregandoAte) return;        // recarregando

  // Cadência real: tiro mais rápido que a arma permite simplesmente não sai.
  const intervalo = 1000 / (estado.arma?.stats?.cadencia ?? 6);
  if (agora - jogo.ultimoTiro < intervalo) return;

  if (jogo.municao <= 0) { somSemMunicao(); return; }

  const caixa = tela.getBoundingClientRect();
  const alvoX = ev.clientX - caixa.left;
  const alvoY = ev.clientY - caixa.top;

  jogo.ultimoTiro = agora;
  jogo.municao--;
  jogo.tiros++;
  // Arma com gravação usa a gravação; as outras continuam no sintetizador.
  if (!tiroComAmostra(estado.arma)) somTiro(estado.arma);
  recuo.forca = 1;
  recuo.em = agora;
  if (jogo.municao === 0) {
    jogo.recarregandoAte = agora + tempoRecarga();
    if (!recargaComAmostra(estado.arma)) somRecarga(tempoRecarga() / 1000);
  }
  atualizarMunicao();

  // Desvio por spray: o primeiro tiro é quase exato, os seguintes espalham.
  const desvio = jogo.sprayN * 2.4 * (estado.arma?.stats?.precisaoPrimeiroTiro ?? 0.3);
  const anguloDesvio = Math.random() * Math.PI * 2;
  const x = alvoX + Math.cos(anguloDesvio) * desvio * Math.random();
  const y = alvoY + Math.sin(anguloDesvio) * desvio * Math.random();
  jogo.sprayN = Math.min(9, jogo.sprayN + 1);

  const alvo = jogo.bots.find((b) => !b.morto && ondeAcertou(b, x, y));
  if (!alvo) {
    flutuantes.push({ texto: "errou", x, y, cor: paleta.tinta2, tam: 13, em: agora });
    somErro();
    return;
  }

  const parte = ondeAcertou(alvo, x, y);
  const dano = danoDe(estado.arma, parte, alvo.distancia);
  alvo.vida -= dano;
  jogo.acertos++;
  jogo.dano += Math.min(dano, dano);
  if (parte === "cabeca") jogo.cabecas++;

  somAcerto(parte);
  const nomes = { cabeca: "cabeça", corpo: "corpo", perna: "perna" };
  flutuantes.push({
    texto: String(dano),
    x: alvo.x, y: partes(alvo).cabeca.cy,
    cor: parte === "cabeca" ? paleta.latao : paleta.luz,
    tam: parte === "cabeca" ? 22 : 16,
    em: agora,
  });

  if (alvo.vida <= 0) {
    alvo.morto = true;
    alvo.morreuEm = agora;
    jogo.abates++;
    somAbate();
    if (perkDoAgente() === "duelista") jogo.terminaEm += 1500;
    registrar(`Abate em ${nomes[parte]} a ${Math.round(alvo.distancia)} m — ${dano} de dano`, parte === "cabeca" ? "otimo" : "bom");
  } else {
    registrar(`${dano} de dano na ${nomes[parte]} a ${Math.round(alvo.distancia)} m`, "neutro");
  }
}

/* ------------------------------------------------------- começo e fim ---- */

const prontoParaJogar = () => Boolean(estado.arma?.stats);

const DICAS = [
  "Alvo mais longe fica menor: a cabeça encolhe junto, e é por isso que ela vale.",
  "Pare de atirar por um instante e a mira fecha. Rajada longa espalha.",
  "A Vandal mata com um tiro na cabeça a qualquer distância. A Phantom, só até 20 metros.",
  "Escopeta a dez metros derruba de um tiro. A trinta, não derruba mais.",
  "Carregador vazio recarrega sozinho — e durante a recarga nenhum tiro sai.",
];

/** A entrada no mapa, com a arte oficial do campo de treino e o retrato do agente. */
async function entrarNoMapa() {
  const tela = $("telaCarga");
  const rapido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Com faixa a tela fica um pouco mais tempo no ar: em dois segundos a
  // música mal começava. Três não cansa em rodadas seguidas e deixa a entrada
  // acontecer. Sem faixa, não há motivo para segurar ninguém.
  const temMusica = Boolean(musicaPronta());
  const duracao = rapido ? 500 : (temMusica ? 3000 : 2000);

  acomodarTelaDeCarga();
  if (arte.mapaUrl) tela.querySelector(".carga__arte").style.backgroundImage = `url("${arte.mapaUrl}")`;
  $("cargaMapa").textContent = arte.mapaNome ?? "The Range";

  const retrato = $("cargaRetrato");
  const urlRetrato = estado.agente?.fullPortrait ?? estado.agente?.bustPortrait;
  if (urlRetrato) { retrato.src = urlRetrato; retrato.hidden = false; } else retrato.hidden = true;

  $("cargaNome").textContent = estado.agente?.displayName ?? "";
  $("cargaFuncao").textContent = estado.agente?.role?.displayName ?? "";
  $("cargaArma").textContent = estado.skin
    ? `${estado.arma.nome} · ${estado.skin.nome}`
    : `${estado.arma.nome} · sem skin`;
  $("cargaDica").textContent = DICAS[Math.floor(Math.random() * DICAS.length)];

  const barra = $("cargaBarra");
  barra.style.width = "0%";
  tela.hidden = false;
  tela.removeAttribute("data-saindo");
  tela.setAttribute("aria-hidden", "false");

  // A faixa, se houver. Sem ela, o arrasto sintetizado assume — a tela nunca
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
  tela.dataset.saindo = "sim";
  await new Promise((r) => setTimeout(r, rapido ? 60 : 420));
  tela.hidden = true;
  tela.setAttribute("aria-hidden", "true");
}

async function comecar() {
  if (jogo.rodando) return;
  if (!prontoParaJogar()) {
    $("resultado").textContent = "Escolha uma arma com estatísticas antes de começar.";
    return;
  }

  // O áudio e a tela cheia só podem nascer dentro de um gesto do usuário.
  // Este clique é ele — por isso os dois pedidos vêm antes de qualquer await.
  acordarAudio();
  entrarTelaCheia();
  await prepararArma(estado.arma?.nome);
  await prepararMusica(estado.conteudo?.linha?.musicaUrl || "assets/audio/carregamento.mp3");

  $("resultado").textContent = "";
  const painelXp = $("linhaXp");
  if (painelXp) { painelXp.hidden = true; painelXp.replaceChildren(); }
  $("btnComecar").disabled = true;

  await prepararArteDaArma();
  await entrarNoMapa();

  secao.dataset.luz = "acesa";
  lerPaleta();

  const rapido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("contagem").hidden = false;
  for (let n = 3; n > 0; n--) {
    $("contagem").textContent = String(n);
    somContagem(n === 1);
    await new Promise((r) => setTimeout(r, rapido ? 220 : 520));
  }
  $("contagem").hidden = true;

  const duracao = Number(estado.conteudo?.linha?.duracao) > 0
    ? Number(estado.conteudo.linha.duracao) : 60;

  Object.assign(jogo, {
    rodando: true, bots: [], municao: capacidade(),
    recarregandoAte: 0,
    // Tempo de saque: a arma demora para ficar pronta, igual ao jogo.
    prontoEm: performance.now() + (estado.arma.stats.saque ?? 1) * 1000,
    ultimoTiro: 0, tiros: 0, acertos: 0, cabecas: 0, abates: 0, dano: 0,
    sprayN: 0, comecouEm: performance.now(),
    terminaEm: performance.now() + duracao * 1000,
    perkAte: 0, log: [],
  });
  flutuantes.length = 0;

  $("capa").hidden = true;
  $("hudJogo").hidden = false;
  $("btnComecar").disabled = false;
  atualizarMunicao();
  if (!saqueComAmostra(estado.arma)) somSaque();
  registrar(`${estado.arma.nome} sacada — ${estado.arma.stats.saque}s`, "neutro");

  ultimoTique = performance.now();
  quadro = requestAnimationFrame(laco);
}

function encerrar() {
  if (!jogo.rodando) return;
  jogo.rodando = false;
  cancelAnimationFrame(quadro);
  secao.dataset.luz = "apagada";
  lerPaleta();
  somFim();

  $("hudJogo").hidden = true;
  $("capa").hidden = false;
  $("btnComecar").textContent = "Repetir";
  sairTelaCheia();

  if (jogo.tiros === 0) {
    $("resultado").textContent = "Nenhum tiro nessa rodada — não registrei nada.";
    desenharRepouso();
    return;
  }

  const recordes = ler(CHAVE_RECORDE, {});
  const chave = estado.arma.uuid;
  const anterior = recordes[chave]?.abates ?? null;

  if (anterior === null || jogo.abates > anterior) {
    recordes[chave] = {
      abates: jogo.abates,
      precisao: (jogo.acertos / jogo.tiros) * 100,
      cabecas: jogo.cabecas,
      tiros: jogo.tiros,
      // A duração é configurável, então o ranking precisa dela para comparar
      // todo mundo em abates por minuto.
      duracao: Math.round((jogo.terminaEm - jogo.comecouEm) / 1000),
      em: Date.now(),
      arma: estado.arma.nome,
    };
    gravar(CHAVE_RECORDE, recordes);
    $("resultado").textContent = `Recorde novo com a ${estado.arma.nome}: ${jogo.abates} ${plural(jogo.abates)}.`;
  } else {
    $("resultado").textContent = `${jogo.abates} ${plural(jogo.abates)}. Seu recorde com a ${estado.arma.nome} é ${anterior}.`;
  }

  // Ranking: abates por minuto, para comparar rodadas de duração diferente.
  const segundos = Math.max(1, Math.round((jogo.terminaEm - jogo.comecouEm) / 1000));
  const sessao = {
    valor: (jogo.abates / segundos) * 60,
    precisao: (jogo.acertos / jogo.tiros) * 100,
    detalhe: estado.arma.nome,
    duracao: segundos,
    tiros: jogo.tiros,
    acertos: jogo.abates,
  };

  // O XP é independente do ranking: vale mesmo com o envio desligado.
  registrarTreino("linha", sessao).then((r) => mostrarGanhoDeXp($("linhaXp"), r));

  publicarTreino("linha", sessao).then((r) => {
    const recado = recadoDoEnvio("linha", r);
    if (recado) $("resultado").textContent += ` ${recado}`;
  });

  atualizarPlacar();
  desenharRepouso();
}

const plural = (n) => (n === 1 ? "abate" : "abates");

let repintarInterruptor = null;

function atualizarPlacar() {
  const restante = jogo.rodando
    ? Math.max(0, (jogo.terminaEm - performance.now()) / 1000)
    : Number(estado.conteudo?.linha?.duracao) || 60;

  $("pAbates").textContent = String(jogo.abates);
  $("pHs").textContent = jogo.acertos ? `${Math.round((jogo.cabecas / jogo.acertos) * 100)}%` : "—";
  $("pPrecisao").textContent = jogo.tiros ? `${Math.round((jogo.acertos / jogo.tiros) * 100)}%` : "—";
  $("pDano").textContent = String(jogo.dano);
  $("pTempo").textContent = restante.toFixed(restante < 10 && jogo.rodando ? 1 : 0);

  const rec = ler(CHAVE_RECORDE, {})[estado.arma?.uuid];
  $("pRecorde").textContent = rec ? `${rec.abates}` : "—";
  $("pRecordeRot").textContent = estado.arma
    ? `seu recorde com a ${estado.arma.nome}`
    : "seu recorde com esta arma";
}

/* ========================================================== a escolha === */

function escolherAgente(a) {
  estado.agente = a;
  $("agenteEscolhido").textContent = `${a.displayName} — ${a.role?.displayName ?? ""}`;
  const icone = $("hudAgente");
  if (icone) {
    if (a.displayIcon) { icone.src = a.displayIcon; icone.alt = a.displayName; icone.hidden = false; }
    else icone.hidden = true;
  }

  const perk = PERKS[a.role?.displayName];
  $("perkNota").textContent = perk
    ? `Vantagem de ${a.role.displayName}: ${perk.texto} Regra deste minigame, não do VALORANT.`
    : "Esta função não tem vantagem nesta linha de tiro.";
  for (const b of $("agentes").children) {
    b.setAttribute?.("aria-pressed", String(b.dataset?.uuid === a.uuid));
  }
}

function escolherArma(arma) {
  estado.arma = arma;
  estado.skin = null;
  $("armaEscolhida").textContent = `${arma.nome} — ${arma.categoria}`;
  $("skinEscolhida").textContent = "padrão";
  $("hudArma").textContent = arma.nome;
  $("hudSkin").textContent = "";
  $("hudArte").hidden = true;

  for (const b of $("armas").children) {
    b.setAttribute?.("aria-pressed", String(b.dataset?.uuid === arma.uuid));
  }

  // Se o loadout do Arsenal tem skin para esta arma, ela já vem equipada.
  const doLoadout = ler(CHAVE_LOADOUT, {})[arma.uuid];
  if (doLoadout && porUuid.skins.has(doLoadout)) escolherSkin(porUuid.skins.get(doLoadout));

  pintarStats(arma);
  pintarSkins();
  atualizarPlacar();
  prepararArteDaArma();
  // Baixa o pacote de som desta arma, se existir. Arma sem pacote não gera
  // requisição repetida: o resultado nulo fica guardado.
  prepararArma(arma.nome).then(() => pintarStats(arma));
}

function escolherSkin(skin) {
  estado.skin = skin;
  $("skinEscolhida").textContent = skin.nome;
  $("hudSkin").textContent = skin.nome;
  const arte = $("hudArte");
  if (skin.icone) { arte.src = skin.icone; arte.hidden = false; } else arte.hidden = true;
  for (const b of $("skins").children) {
    const dela = b.dataset?.uuid === skin.uuid;
    b.setAttribute?.("aria-pressed", String(dela));
    // A fileira rola na horizontal: sem isto, a skin equipada pelo loadout
    // fica selecionada fora da vista.
    if (dela) b.scrollIntoView({ block: "nearest", inline: "center" });
  }
  prepararArteDaArma();
}

function pintarStats(arma) {
  const caixa = $("fichaArma");
  const lista = $("statsArma");
  const dano = $("danoArma");
  if (!arma.stats) { caixa.hidden = true; return; }
  caixa.hidden = false;

  const s = arma.stats;
  const itens = [
    ["Cadência", `${s.cadencia} tiros/s`],
    ["Carregador", `${capacidade()} balas`],
    ["Recarga", `${(tempoRecarga() / 1000).toFixed(2)} s`],
    ["Saque", `${s.saque} s`],
    ["Custo no jogo", arma.custo ? `${arma.custo} créditos` : "grátis"],
  ];
  if (s.chumbinhos > 1) itens.splice(1, 0, ["Chumbinhos por tiro", String(s.chumbinhos)]);
  itens.push(["Som", armaTemAmostras(arma.nome) ? "gravação original" : "sintetizado"]);
  lista.replaceChildren();
  for (const [rot, val] of itens) {
    lista.append(
      elemento("dt", { texto: rot }),
      elemento("dd", { texto: val }),
    );
  }

  dano.replaceChildren();
  for (const f of s.alcances) {
    dano.append(elemento("div", { class: "dano__faixa" }, [
      elemento("div", { class: "dano__rot", texto: `${f.de}–${f.ate} m${s.chumbinhos > 1 ? " · tiro inteiro" : ""}` }),
      elemento("div", { class: "dano__valores" }, [
        elemento("span", { class: "dano__v dano__v--cabeca", texto: `${f.cabeca} cabeça` }),
        elemento("span", { class: "dano__v", texto: `${f.corpo} corpo` }),
        elemento("span", { class: "dano__v dano__v--fraco", texto: `${f.perna} perna` }),
      ]),
      // 100 de vida é a referência: quantos tiros no corpo para derrubar.
      elemento("div", { class: "dano__ttk", texto: `${Math.ceil(VIDA_BOT / f.corpo)} no corpo · ${Math.ceil(VIDA_BOT / f.cabeca)} na cabeça` }),
    ]));
  }
}

/* ---------------------------------------------------------- as fileiras -- */

function pintarAgentes() {
  const caixa = $("agentes");
  caixa.replaceChildren();
  const lista = estado.agentes
    .filter((a) => !estado.filtroFuncao || a.role?.displayName === estado.filtroFuncao)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR"));

  for (const a of lista) {
    const b = elemento("button", {
      type: "button", class: "carta chf", "data-uuid": a.uuid,
      "aria-pressed": String(estado.agente?.uuid === a.uuid),
      title: `${a.displayName} — ${a.role?.displayName ?? ""}`,
      onclick: () => escolherAgente(a),
    }, [
      a.displayIcon ? elemento("img", { class: "carta__arte", src: a.displayIcon, alt: "", loading: "lazy" }) : null,
      elemento("span", { class: "carta__nome", texto: a.displayName }),
    ]);
    caixa.append(b);
  }
}

function pintarArmas() {
  const caixa = $("armas");
  caixa.replaceChildren();
  const lista = estado.arsenal.armas
    .filter((a) => a.stats)
    .filter((a) => !estado.filtroCategoria || a.categoria === estado.filtroCategoria);

  for (const a of lista) {
    caixa.append(elemento("button", {
      type: "button", class: "carta carta--arma chf", "data-uuid": a.uuid,
      "aria-pressed": String(estado.arma?.uuid === a.uuid),
      title: `${a.nome} — ${a.categoria}`,
      onclick: () => escolherArma(a),
    }, [
      a.icone ? elemento("img", { class: "carta__arte", src: a.icone, alt: "", loading: "lazy" }) : null,
      elemento("span", { class: "carta__nome", texto: a.nome }),
    ]));
  }
}

function pintarSkins() {
  const caixa = $("skins");
  caixa.replaceChildren();
  if (!estado.arma) {
    caixa.append(elemento("p", { class: "carregando", texto: "Escolha uma arma primeiro." }));
    return;
  }

  const busca = estado.buscaSkin.trim().toLowerCase();
  const lista = estado.arsenal.skins
    .filter((s) => s.arma === estado.arma.uuid)
    .filter((s) => !busca || s.nome.toLowerCase().includes(busca))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, 80);

  if (!lista.length) {
    caixa.append(elemento("p", { class: "carregando", texto: "Nenhuma skin com esse nome." }));
    return;
  }

  for (const s of lista) {
    const tier = s.raridade ? porUuid.raridades.get(s.raridade) : null;
    const b = elemento("button", {
      type: "button", class: "carta carta--skin chf", "data-uuid": s.uuid,
      "aria-pressed": String(estado.skin?.uuid === s.uuid),
      title: `${s.nome}${tier ? ` — ${tier.nome}` : ""}`,
      onclick: () => escolherSkin(s),
    }, [
      s.icone ? elemento("img", { class: "carta__arte", src: s.icone, alt: "", loading: "lazy" }) : null,
      elemento("span", { class: "carta__nome", texto: s.nome }),
    ]);
    if (tier) b.style.setProperty("--tier", tier.cor);
    caixa.append(b);
  }
}

/* ------------------------------------------------------------- som (UI) -- */

function montarControleDeSom() {
  const botao = $("btnSom");
  const nivel = $("somVolume");
  if (!botao || !nivel) return;

  const pintar = () => {
    const ligado = somLigado();
    botao.setAttribute("aria-pressed", String(ligado));
    $("somIcone").textContent = ligado ? "●" : "○";
    $("somRotulo").textContent = ligado ? "Som ligado" : "Som desligado";
    nivel.disabled = !ligado;
  };

  nivel.value = String(Math.round(volumeSom() * 100));
  pintar();

  botao.addEventListener("click", () => {
    acordarAudio();
    alternarSom(!somLigado());
    pintar();
    if (somLigado()) somAcerto("corpo");
  });

  nivel.addEventListener("input", () => {
    acordarAudio();
    ajustarVolume(Number(nivel.value) / 100);
  });

  // Uma amostra ao soltar o controle, para o ajuste ter resposta.
  nivel.addEventListener("change", () => { if (somLigado()) somTiro(estado.arma); });
}

function pilula(rotulo, ativo, aoClicar) {
  return elemento("button", {
    type: "button", class: "pilula chf", texto: rotulo,
    "aria-pressed": String(ativo), onclick: aoClicar,
  });
}

/* ---------------------------------------------------------------- início -- */

export async function iniciar() {
  const { conteudo } = await carregarConteudo();
  estado.conteudo = conteudo;
  vestirPagina(conteudo, { aqui: "linha.html", titulo: conteudo.linha?.titulo ?? "A Linha de Tiro" });
  carregarConta().then(montarBotaoDeConta);

  redimensionar();
  window.addEventListener("resize", redimensionar);
  // Sair com Esc não passa pelo nosso botão: o canvas tem que remedir sozinho.
  document.addEventListener("fullscreenchange", () => {
    moldura()?.classList.toggle("campo__tela--cheia", emTelaCheia());
    acomodarTelaDeCarga();
    redimensionar();
  });
  montarControleDeSom();
  repintarInterruptor = montarInterruptor($("autoRanking"));
  aoMudarConta(() => repintarInterruptor?.());

  // Decodificar a faixa leva um instante. Fazer isso agora, sem esperar,
  // tira esse atraso do primeiro clique em "Acender as luzes". O contexto de
  // áudio nasce suspenso até haver um gesto — decodificar nele é permitido.
  prepararMusica(conteudo.linha?.musicaUrl || "assets/audio/carregamento.mp3");

  const [arsenal, agentes, mapas] = await Promise.allSettled([
    carregarArsenal(), carregarAgentes(), carregarMapas(),
  ]);

  // O campo de treino é um mapa como qualquer outro no catálogo da Riot, e tem
  // arte oficial. É ela que vai para o fundo do canvas e para a tela de entrada.
  // A foto do campo de treino. Pode ser trocada pelo painel; sem nada definido,
  // vale a que está em assets/img.
  imagem("assets/img/alvo.png").then((img) => {
    if (img) arte.alvo = img;
    else console.warn("Sprite do alvo não carregou; usando a silhueta de reserva.");
  });

  const urlFundo = conteudo.linha?.fundoUrl || "assets/img/the-range.webp";
  imagem(urlFundo).then((img) => {
    if (!img) { console.warn("Fundo do estande não carregou:", urlFundo); return; }
    arte.fundo = img;
    calcularEnquadre();
    if (!jogo.rodando) desenharRepouso();
  });

  if (mapas.status === "fulfilled") {
    const campo = mapas.value.find(
      (m) => /^the range$/i.test(m.displayName) || /Range/i.test(m.assetPath ?? ""),
    );
    if (campo?.splash) {
      arte.mapaUrl = campo.splash;
      arte.mapaNome = campo.displayName;
      imagem(campo.splash).then((img) => {
        arte.mapa = img;
        if (!jogo.rodando) desenharRepouso();
      });
    }
  }

  if (arsenal.status === "fulfilled") {
    estado.arsenal = arsenal.value;
    for (const a of estado.arsenal.armas) porUuid.armas.set(a.uuid, a);
    for (const s of estado.arsenal.skins) porUuid.skins.set(s.uuid, s);
    for (const t of estado.arsenal.raridades) porUuid.raridades.set(t.uuid, t);

    const categorias = [...new Set(estado.arsenal.armas.filter((a) => a.stats).map((a) => a.categoria))];
    const caixaCat = $("categorias");
    caixaCat.replaceChildren(pilula("Todas", true, () => {
      estado.filtroCategoria = null;
      for (const b of caixaCat.children) b.setAttribute("aria-pressed", String(b.textContent === "Todas"));
      pintarArmas();
    }));
    for (const c of categorias) {
      caixaCat.append(pilula(c, false, (ev) => {
        estado.filtroCategoria = c;
        for (const b of caixaCat.children) b.setAttribute("aria-pressed", String(b === ev.currentTarget));
        pintarArmas();
      }));
    }
    pintarArmas();

    const padrao = conteudo.linha?.armaPadraoUuid;
    const inicial = (padrao && porUuid.armas.get(padrao))
      || estado.arsenal.armas.find((a) => a.nome === "Vandal")
      || estado.arsenal.armas.find((a) => a.stats);
    if (inicial) escolherArma(inicial);
  } else {
    $("armas").replaceChildren(elemento("p", { class: "carregando", texto: "Não foi possível carregar as armas." }));
  }

  if (agentes.status === "fulfilled") {
    estado.agentes = agentes.value;
    const funcoes = [...new Set(estado.agentes.map((a) => a.role?.displayName).filter(Boolean))].sort();
    const caixaFn = $("funcoes");
    caixaFn.replaceChildren(pilula("Todas as funções", true, (ev) => {
      estado.filtroFuncao = null;
      for (const b of caixaFn.children) b.setAttribute("aria-pressed", String(b === ev.currentTarget));
      pintarAgentes();
    }));
    for (const f of funcoes) {
      caixaFn.append(pilula(f, false, (ev) => {
        estado.filtroFuncao = f;
        for (const b of caixaFn.children) b.setAttribute("aria-pressed", String(b === ev.currentTarget));
        pintarAgentes();
      }));
    }
    pintarAgentes();

    const padrao = conteudo.linha?.agentePadraoUuid;
    escolherAgente((padrao && estado.agentes.find((a) => a.uuid === padrao)) || estado.agentes[0]);
  } else {
    $("agentes").replaceChildren(elemento("p", { class: "carregando", texto: "Não foi possível carregar os agentes." }));
  }

  let atraso;
  $("buscaSkin").addEventListener("input", (ev) => {
    clearTimeout(atraso);
    atraso = setTimeout(() => { estado.buscaSkin = ev.target.value; pintarSkins(); }, 180);
  });

  $("btnComecar").addEventListener("click", comecar);

  tela.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 && ev.pointerType === "mouse") return;
    const caixa = tela.getBoundingClientRect();
    jogo.mouse.x = ev.clientX - caixa.left;
    jogo.mouse.y = ev.clientY - caixa.top;
    jogo.mouse.dentro = true;
    atirar(ev);
  });
  tela.addEventListener("pointermove", (ev) => {
    const caixa = tela.getBoundingClientRect();
    jogo.mouse.x = ev.clientX - caixa.left;
    jogo.mouse.y = ev.clientY - caixa.top;
    jogo.mouse.dentro = true;
  });
  tela.addEventListener("pointerleave", () => { jogo.mouse.dentro = false; });
  tela.addEventListener("contextmenu", (ev) => { if (jogo.rodando) ev.preventDefault(); });

  // Sair da aba no meio da rodada encerra: resultado com pausa não vale.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && jogo.rodando) encerrar();
  });

  atualizarPlacar();
  desenharRepouso();
}

// A casca marca o body antes de importar: dentro dela quem chama `iniciar()`
// é o roteiro, na hora da troca. Aberta solta, a página se vira sozinha.
if (!document.body.dataset.casca) iniciar();
