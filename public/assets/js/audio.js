/**
 * Som do estande, sintetizado na hora com a Web Audio API.
 *
 * Por que sintetizado: os sons do VALORANT são da Riot. Baixar os arquivos e
 * reservi-los daqui seria redistribuir material protegido, então nada disso
 * acontece. O que existe aqui é um motor de síntese que monta cada tiro na
 * hora, e — isto é o ponto — monta a partir das estatísticas reais da arma.
 *
 * A Judge solta doze estalos sobrepostos porque o `shotgunPelletCount` dela é
 * doze. A Operator é grave e longa porque tira 150 no corpo. A Stinger é fina e
 * seca porque dispara 18 vezes por segundo. Nenhuma amostra é igual à do jogo,
 * mas a família de cada arma se reconhece.
 *
 * O contexto só nasce depois de um clique: navegador nenhum deixa tocar som
 * antes disso, e nem deveria.
 */

const CHAVE_SOM = "estande.som.v1";

let ctx = null;
let mestre = null;
let ruidoBuffer = null;

const prefs = (() => {
  try {
    return { ligado: true, volume: 0.7, ...JSON.parse(localStorage.getItem(CHAVE_SOM) ?? "{}") };
  } catch {
    return { ligado: true, volume: 0.7 };
  }
})();

function gravarPrefs() {
  try { localStorage.setItem(CHAVE_SOM, JSON.stringify(prefs)); } catch { /* modo privado */ }
}

/** Precisa ser chamado dentro de um gesto do usuário. */
export function acordarAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;

  ctx = new AC();
  mestre = ctx.createGain();
  mestre.gain.value = prefs.ligado ? prefs.volume : 0;

  // Um limitador bem suave: muitos tiros sobrepostos estouram o barramento.
  const limite = ctx.createDynamicsCompressor();
  limite.threshold.value = -10;
  limite.knee.value = 12;
  limite.ratio.value = 8;
  limite.attack.value = 0.002;
  limite.release.value = 0.12;

  mestre.connect(limite);
  limite.connect(ctx.destination);

  // Dois segundos de ruído branco, reaproveitado em tudo que estala.
  const n = ctx.sampleRate * 2;
  ruidoBuffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const dados = ruidoBuffer.getChannelData(0);
  for (let i = 0; i < n; i++) dados[i] = Math.random() * 2 - 1;

  return ctx;
}

export const somLigado = () => prefs.ligado;
export const volumeSom = () => prefs.volume;

export function alternarSom(ligado) {
  prefs.ligado = ligado;
  gravarPrefs();
  if (mestre && ctx) {
    mestre.gain.cancelScheduledValues(ctx.currentTime);
    mestre.gain.setTargetAtTime(ligado ? prefs.volume : 0, ctx.currentTime, 0.02);
  }
}

export function ajustarVolume(v) {
  prefs.volume = Math.max(0, Math.min(1, v));
  gravarPrefs();
  if (mestre && ctx && prefs.ligado) {
    mestre.gain.setTargetAtTime(prefs.volume, ctx.currentTime, 0.02);
  }
}

/* --------------------------------------------------------------- blocos --- */

function ruido({ inicio, duracao, ganho, corte, q = 0.7, tipo = "lowpass", curva = 2.6 }) {
  const fonte = ctx.createBufferSource();
  fonte.buffer = ruidoBuffer;
  fonte.loop = true;
  fonte.playbackRate.value = 0.8 + Math.random() * 0.4;

  const filtro = ctx.createBiquadFilter();
  filtro.type = tipo;
  filtro.frequency.setValueAtTime(corte, inicio);
  filtro.frequency.exponentialRampToValueAtTime(Math.max(120, corte * 0.22), inicio + duracao);
  filtro.Q.value = q;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, inicio);
  env.gain.exponentialRampToValueAtTime(ganho, inicio + 0.0016);
  env.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao * curva * 0.42);

  fonte.connect(filtro); filtro.connect(env); env.connect(mestre);
  fonte.start(inicio);
  fonte.stop(inicio + duracao * curva);
}

function corpo({ inicio, duracao, ganho, de, para, forma = "triangle" }) {
  const osc = ctx.createOscillator();
  osc.type = forma;
  osc.frequency.setValueAtTime(de, inicio);
  osc.frequency.exponentialRampToValueAtTime(Math.max(28, para), inicio + duracao);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, inicio);
  env.gain.exponentialRampToValueAtTime(ganho, inicio + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);

  osc.connect(env); env.connect(mestre);
  osc.start(inicio);
  osc.stop(inicio + duracao + 0.02);
}

function tom({ inicio, duracao, ganho, hz, hz2, forma = "sine" }) {
  const osc = ctx.createOscillator();
  osc.type = forma;
  osc.frequency.setValueAtTime(hz, inicio);
  if (hz2) osc.frequency.exponentialRampToValueAtTime(hz2, inicio + duracao);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, inicio);
  env.gain.exponentialRampToValueAtTime(ganho, inicio + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);

  osc.connect(env); env.connect(mestre);
  osc.start(inicio);
  osc.stop(inicio + duracao + 0.02);
}

/* ------------------------------------------------------ perfil por arma --- */

/**
 * O caráter base vem da categoria; os números vêm das estatísticas da arma.
 * Nada aqui é escolhido "porque soa bem": cada campo tem uma origem.
 */
const PERFIS = {
  "Armas Leves":       { corte: 3000, grave: 170, cauda: 0.16, ganho: 0.30 },
  "Submetralhadoras":  { corte: 3600, grave: 150, cauda: 0.12, ganho: 0.26 },
  "Escopetas":         { corte: 1900, grave: 110, cauda: 0.34, ganho: 0.40 },
  "Fuzis de Assalto":  { corte: 2700, grave: 140, cauda: 0.19, ganho: 0.34 },
  "Fuzis":             { corte: 2500, grave: 135, cauda: 0.21, ganho: 0.34 },
  "Fuzis de Precisão": { corte: 2100, grave: 95,  cauda: 0.44, ganho: 0.46 },
  "Armas Pesadas":     { corte: 2400, grave: 120, cauda: 0.17, ganho: 0.33 },
  "Corpo a corpo":     { corte: 5200, grave: 300, cauda: 0.09, ganho: 0.22 },
};

function perfilDe(arma) {
  const base = PERFIS[arma?.categoria] ?? PERFIS["Fuzis de Assalto"];
  const s = arma?.stats;
  if (!s) return { ...base, chumbinhos: 1 };

  // Mais dano no corpo = tiro mais grave e mais longo. A Operator (150) fica
  // cavernosa; a Classic (26) fica seca.
  const danoCorpo = s.alcances?.[0]?.corpo ?? 40;
  const peso = Math.min(2.1, Math.max(0.6, danoCorpo / 45));

  // Cadência alta = cauda curta, senão um tiro atropela o outro.
  const rapidez = Math.min(1.5, Math.max(0.55, 9 / (s.cadencia || 9)));

  return {
    corte: base.corte / (peso * 0.55 + 0.5),
    grave: base.grave / (peso * 0.4 + 0.65),
    cauda: base.cauda * rapidez * (peso * 0.3 + 0.75),
    ganho: Math.min(0.5, base.ganho * (peso * 0.22 + 0.84)),
    chumbinhos: Math.min(14, s.chumbinhos ?? 1),
  };
}

/* ----------------------------------------------------------------- sons --- */

export function somTiro(arma) {
  if (!ctx || !prefs.ligado) return;
  const t = ctx.currentTime;
  const p = perfilDe(arma);

  if (p.chumbinhos > 1) {
    // Escopeta: os chumbinhos saem juntos mas não no mesmo instante. É a
    // sobreposição que dá o estouro, e o número dela é o do jogo.
    for (let i = 0; i < p.chumbinhos; i++) {
      const atraso = Math.random() * 0.012;
      ruido({
        inicio: t + atraso,
        duracao: p.cauda * (0.55 + Math.random() * 0.5),
        ganho: (p.ganho / Math.sqrt(p.chumbinhos)) * (0.7 + Math.random() * 0.6),
        corte: p.corte * (0.7 + Math.random() * 0.7),
      });
    }
    corpo({ inicio: t, duracao: p.cauda * 1.5, ganho: p.ganho * 0.85, de: p.grave * 1.5, para: p.grave * 0.4 });
  } else {
    ruido({ inicio: t, duracao: p.cauda, ganho: p.ganho, corte: p.corte });
    ruido({ inicio: t + 0.004, duracao: p.cauda * 1.8, ganho: p.ganho * 0.3, corte: p.corte * 0.35 });
    corpo({ inicio: t, duracao: p.cauda * 1.25, ganho: p.ganho * 0.9, de: p.grave * 2.2, para: p.grave * 0.5 });
  }

  // Estalo metálico do ferrolho, sempre o mesmo, bem fininho por cima.
  ruido({ inicio: t + 0.008, duracao: 0.03, ganho: 0.05, corte: 6500, tipo: "highpass" });
}

export function somRecarga(segundos) {
  if (!ctx || !prefs.ligado) return;
  const t = ctx.currentTime;
  const d = Math.max(0.6, segundos || 2);

  // Três tempos: carregador sai, carregador entra, ferrolho fecha.
  ruido({ inicio: t + d * 0.06, duracao: 0.07, ganho: 0.1, corte: 2200, tipo: "bandpass", q: 2 });
  ruido({ inicio: t + d * 0.52, duracao: 0.09, ganho: 0.14, corte: 1500, tipo: "bandpass", q: 1.6 });
  ruido({ inicio: t + d * 0.86, duracao: 0.06, ganho: 0.16, corte: 3400, tipo: "bandpass", q: 2.4 });
  corpo({ inicio: t + d * 0.86, duracao: 0.09, ganho: 0.09, de: 220, para: 90 });
}

export function somSemMunicao() {
  if (!ctx || !prefs.ligado) return;
  const t = ctx.currentTime;
  ruido({ inicio: t, duracao: 0.035, ganho: 0.1, corte: 4200, tipo: "bandpass", q: 3 });
}

export function somSaque() {
  if (!ctx || !prefs.ligado) return;
  const t = ctx.currentTime;
  ruido({ inicio: t, duracao: 0.08, ganho: 0.1, corte: 2600, tipo: "bandpass", q: 1.4 });
  ruido({ inicio: t + 0.11, duracao: 0.05, ganho: 0.12, corte: 3800, tipo: "bandpass", q: 2.2 });
}

/** O "tec" de acerto. No campo de treino do jogo ele também existe. */
export function somAcerto(parte) {
  if (!ctx || !prefs.ligado) return;
  const t = ctx.currentTime;
  if (parte === "cabeca") {
    tom({ inicio: t, duracao: 0.09, ganho: 0.16, hz: 1480, hz2: 1760 });
    tom({ inicio: t + 0.045, duracao: 0.1, ganho: 0.12, hz: 2220 });
  } else {
    tom({ inicio: t, duracao: 0.06, ganho: 0.1, hz: parte === "perna" ? 760 : 980 });
  }
}

export function somAbate() {
  if (!ctx || !prefs.ligado) return;
  const t = ctx.currentTime;
  tom({ inicio: t, duracao: 0.1, ganho: 0.14, hz: 620, hz2: 880, forma: "triangle" });
  tom({ inicio: t + 0.07, duracao: 0.16, ganho: 0.11, hz: 1240, forma: "triangle" });
  ruido({ inicio: t, duracao: 0.12, ganho: 0.07, corte: 900 });
}

export function somErro() {
  if (!ctx || !prefs.ligado) return;
  // O chumbo batendo na parede atrás do boneco.
  ruido({ inicio: ctx.currentTime, duracao: 0.07, ganho: 0.055, corte: 1300, tipo: "bandpass", q: 1.2 });
}

/** Entrada do mapa: um arrasto grave que termina num baque. */
export function somCarregando() {
  if (!ctx || !prefs.ligado) return;
  const t = ctx.currentTime;
  corpo({ inicio: t, duracao: 1.2, ganho: 0.1, de: 48, para: 150, forma: "sine" });
  ruido({ inicio: t, duracao: 1.1, ganho: 0.05, corte: 420, curva: 1 });
  tom({ inicio: t + 0.25, duracao: 1.0, ganho: 0.05, hz: 180, hz2: 420, forma: "sawtooth" });
}

export function somEntrou() {
  if (!ctx || !prefs.ligado) return;
  const t = ctx.currentTime;
  corpo({ inicio: t, duracao: 0.45, ganho: 0.22, de: 140, para: 38, forma: "sine" });
  ruido({ inicio: t, duracao: 0.2, ganho: 0.1, corte: 800 });
}

export function somContagem(ultimo) {
  if (!ctx || !prefs.ligado) return;
  const t = ctx.currentTime;
  tom({ inicio: t, duracao: 0.12, ganho: 0.1, hz: ultimo ? 880 : 520, forma: "square" });
}

export function somFim() {
  if (!ctx || !prefs.ligado) return;
  const t = ctx.currentTime;
  tom({ inicio: t, duracao: 0.2, ganho: 0.12, hz: 520, hz2: 300, forma: "triangle" });
  tom({ inicio: t + 0.14, duracao: 0.4, ganho: 0.1, hz: 196, forma: "triangle" });
}

/* ------------------------------------------------ música de carregamento -- */
/**
 * A entrada no mapa pode ter uma faixa de verdade em vez do arrasto
 * sintetizado. O arquivo é decodificado uma vez e tocado pelo mesmo barramento
 * do resto, então o botão de som e o volume valem para ele também.
 *
 * Se o arquivo não existir ou não decodificar, `tocarCarregamento` devolve
 * `null` e quem chamou cai no som sintetizado — a tela nunca fica muda por
 * causa de um arquivo faltando.
 */

let bufferCarregamento = null;
let tentouCarregar = false;

export async function prepararMusica(url) {
  if (tentouCarregar || !url) return bufferCarregamento;
  tentouCarregar = true;
  const ctxAtual = ctx ?? acordarAudio();
  if (!ctxAtual) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    bufferCarregamento = await ctxAtual.decodeAudioData(await r.arrayBuffer());
  } catch (e) {
    console.warn("Música de carregamento indisponível, usando o som sintetizado:", e.message);
    bufferCarregamento = null;
  }
  return bufferCarregamento;
}

/** Se já há faixa decodificada e pronta para tocar. */
export const musicaPronta = () => Boolean(bufferCarregamento);

/**
 * Toca a faixa e devolve um controle para encerrá-la com desvanecimento.
 * Devolve `null` quando não há faixa — aí o som sintetizado assume.
 */
export function tocarCarregamento() {
  if (!ctx || !prefs.ligado || !bufferCarregamento) return null;

  const fonte = ctx.createBufferSource();
  fonte.buffer = bufferCarregamento;

  const volume = ctx.createGain();
  volume.gain.setValueAtTime(0.0001, ctx.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.75, ctx.currentTime + 0.25);

  fonte.connect(volume);
  volume.connect(mestre);
  fonte.start();

  let encerrado = false;
  return {
    parar(segundos = 0.5) {
      if (encerrado) return;
      encerrado = true;
      const fim = ctx.currentTime + segundos;
      volume.gain.cancelScheduledValues(ctx.currentTime);
      volume.gain.setValueAtTime(Math.max(0.0001, volume.gain.value), ctx.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.0001, fim);
      try { fonte.stop(fim + 0.05); } catch { /* já parou sozinha */ }
    },
  };
}

/* ------------------------------------------------- amostras reais por arma */
/**
 * Algumas armas têm gravação de verdade em vez do som sintetizado.
 *
 * Cada arma com pacote tem dois arquivos em `assets/audio/armas/`: um MP3 com
 * todos os pedaços emendados e um JSON dizendo onde cada pedaço começa. O
 * navegador baixa um arquivo, decodifica uma vez, e toca por offset — nada de
 * vinte requisições para vinte variações.
 *
 * Arma sem pacote continua no sintetizador, que é o caso das outras vinte.
 */

const pacotes = new Map();   // slug -> { buffer, mapa } | null

/** "Vandal" -> "vandal"; "Fuzil de Precisão" -> "fuzil-de-precisao". */
export function slugDaArma(nome) {
  return String(nome ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Procura o pacote da arma. Devolve null quando não existe — e isso é esperado
 * para a maioria das armas, não é erro.
 */
export async function prepararArma(nome) {
  const slug = slugDaArma(nome);
  if (!slug) return null;
  if (pacotes.has(slug)) return pacotes.get(slug);

  const ctxAtual = ctx ?? acordarAudio();
  if (!ctxAtual) return null;

  // Grava a promessa antes de resolver: duas chamadas seguidas não baixam
  // o mesmo arquivo duas vezes.
  const promessa = (async () => {
    try {
      const rMapa = await fetch(`assets/audio/armas/${slug}.json`);
      if (!rMapa.ok) return null;
      const mapa = await rMapa.json();

      const rSom = await fetch(`assets/audio/armas/${slug}.mp3`);
      if (!rSom.ok) return null;
      const buffer = await ctxAtual.decodeAudioData(await rSom.arrayBuffer());

      return { buffer, mapa: mapa.mapa ?? {} };
    } catch (e) {
      console.warn(`Pacote de som da ${nome} não carregou:`, e.message);
      return null;
    }
  })();

  pacotes.set(slug, promessa);
  const pronto = await promessa;
  pacotes.set(slug, pronto);
  return pronto;
}

const pacoteDe = (nome) => {
  const p = pacotes.get(slugDaArma(nome));
  return p && !(p instanceof Promise) ? p : null;
};

/** Toca um pedaço do pacote. Devolve false quando não há o que tocar. */
function tocarPedaco(pacote, grupo, ganho = 1) {
  const lista = pacote?.mapa?.[grupo];
  if (!ctx || !prefs.ligado || !lista?.length) return false;

  const p = lista[Math.floor(Math.random() * lista.length)];
  const fonte = ctx.createBufferSource();
  fonte.buffer = pacote.buffer;

  const vol = ctx.createGain();
  vol.gain.value = ganho;
  fonte.connect(vol);
  vol.connect(mestre);

  // O terceiro argumento é a duração: sem ele o pedaço seguinte entraria junto.
  fonte.start(ctx.currentTime, p.de, p.dur);
  return true;
}

// Tiro solto soa diferente de rajada, e o pacote tem os dois. A régua é o
// intervalo: disparos colados usam a gravação de rajada, disparo isolado usa
// a de tiro avulso.
const JANELA_RAJADA_MS = 260;
let ultimoDisparoEm = -1e9;

/** Substitui o tiro sintetizado quando a arma tem pacote. */
export function tiroComAmostra(arma) {
  const pacote = pacoteDe(arma?.nome);
  if (!pacote) return false;

  const agora = performance.now();
  const emRajada = agora - ultimoDisparoEm < JANELA_RAJADA_MS;
  ultimoDisparoEm = agora;

  // Em rajada o volume cai um pouco: vinte e cinco tiros no talo cansam.
  return tocarPedaco(pacote, emRajada ? "spray" : "tiro", emRajada ? 0.72 : 0.85)
      || tocarPedaco(pacote, "tiro", 0.85);
}

export function recargaComAmostra(arma) {
  const pacote = pacoteDe(arma?.nome);
  return pacote ? tocarPedaco(pacote, "recarregar", 0.8) : false;
}

export function saqueComAmostra(arma) {
  const pacote = pacoteDe(arma?.nome);
  return pacote ? tocarPedaco(pacote, "equipar", 0.8) : false;
}

export const armaTemAmostras = (nome) => Boolean(pacoteDe(nome));
