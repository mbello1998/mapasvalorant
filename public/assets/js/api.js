// Acesso a dados. Três fontes:
//   /api/content  — o que o painel admin edita (Netlify Blobs)
//   /api/live     — patch, ato e status BR, agregados do lado do servidor
//   valorant-api  — catálogo (agentes, mapas) direto do CDN, em pt-BR

const VAPI = "https://valorant-api.com/v1";

/** Conteúdo mínimo para a página não ficar vazia se a função estiver fora do ar
 *  (ou se alguém abrir o index.html direto do disco, sem servidor). */
export const CONTEUDO_RESERVA = {
  site: { nome: "Estande", sufixo: "BR", tagline: "Treino de mira e o que está no ar agora" },
  tema: {},
  hero: {
    titulo: "Cinco alvos antes de entrar na fila",
    texto: "Clique nos cinco alvos ao lado e veja seu tempo de reação agora.",
    ctaPrimario: { rotulo: "Ir para o estande", href: "#estande" },
    ctaSecundario: { rotulo: "Ver o que mudou", href: "#lancamentos" },
    imagemFundo: "",
  },
  nav: [
    { rotulo: "Estande", href: "#estande" },
    { rotulo: "Sala de Mapas", href: "mapas.html" },
    { rotulo: "Ao vivo", href: "#aovivo" },
    { rotulo: "Lançamentos", href: "#lancamentos" },
    { rotulo: "Agentes", href: "#agentes" },
    { rotulo: "Mapas", href: "#mapas" },
  ],
  estande: { titulo: "Sete exercícios, trinta segundos cada", texto: "" },
  modos: [
    { id: "gridshot", nome: "Gridshot", objetivo: "Clique rápido", descricao: "Dois alvos sempre na tela.", duracao: 30, metrica: "Alvos por segundo", destaque: true, icone: "" },
    { id: "tracking", nome: "Tracking", objetivo: "Mira contínua", descricao: "Segure o botão com a mira no alvo em movimento.", duracao: 30, metrica: "Tempo em alvo", destaque: false, icone: "" },
    { id: "flick", nome: "Flick", objetivo: "Reação", descricao: "Um alvo por vez, em intervalo irregular.", duracao: 0, metrica: "Tempo de reação", destaque: false, icone: "" },
    { id: "escolha", nome: "Escolha", objetivo: "Reação com decisão", descricao: "Quatro posições; clicar no aliado custa 100 ms.", duracao: 30, metrica: "Tempo de reação", destaque: false, icone: "" },
    { id: "microajuste", nome: "Microajuste", objetivo: "Correção fina", descricao: "Alvos pequenos nascendo perto da mira.", duracao: 30, metrica: "Alvos por segundo", destaque: false, icone: "" },
    { id: "correcao", nome: "Correção", objetivo: "Tracking reativo", descricao: "O alvo troca de direção sem avisar.", duracao: 30, metrica: "Tempo em alvo", destaque: false, icone: "" },
    { id: "cabeca", nome: "Cabeça", objetivo: "Altura de headshot", descricao: "Só a cabeça da silhueta conta.", duracao: 30, metrica: "Cabeças por segundo", destaque: false, icone: "" },
  ],
  aovivo: { titulo: "O que está no ar", texto: "" },
  lancamentos: { titulo: "Lançamentos e notas", texto: "", itens: [] },
  agentes: { titulo: "Agentes em português", texto: "" },
  mapas: { titulo: "Mapas", texto: "" },
  links: [],
  rodape: {
    texto: "Dados de agentes e mapas vêm da valorant-api.com; patch e ato vêm do cliente da Riot.",
    aviso: "Projeto de fã. Não é afiliado nem endossado pela Riot Games.",
  },
};

async function pegar(url, opcoes = {}) {
  const ac = new AbortController();
  const limite = setTimeout(() => ac.abort(), opcoes.tempoLimite ?? 9000);
  try {
    const r = await fetch(url, { ...opcoes, signal: ac.signal });
    if (!r.ok) {
      let detalhe = "";
      try { detalhe = (await r.json()).erro ?? ""; } catch { /* corpo não-JSON */ }
      throw new Error(detalhe || `${r.status} ${r.statusText}`);
    }
    return await r.json();
  } finally {
    clearTimeout(limite);
  }
}

export async function carregarConteudo() {
  try {
    const { conteudo } = await pegar("/api/content");
    return { conteudo, reserva: false };
  } catch (e) {
    console.warn("Conteúdo do painel indisponível, usando a reserva local:", e.message);
    return { conteudo: CONTEUDO_RESERVA, reserva: true };
  }
}

export async function carregarAoVivo() {
  try {
    return await pegar("/api/live", { tempoLimite: 12000 });
  } catch (e) {
    console.warn("Dados ao vivo indisponíveis:", e.message);
    return null;
  }
}

/** Notícias oficiais, coletadas do site da Riot pela função agendada. */
export async function carregarNoticias() {
  try {
    return await pegar("/api/noticias", { tempoLimite: 20000 });
  } catch (e) {
    console.warn("Notícias oficiais indisponíveis:", e.message);
    return { itens: [], categorias: [], coletadoEm: null, erro: e.message };
  }
}

/** Armas, skins, raridades e temas — tudo numa chamada só, já enxugado. */
export async function carregarArsenal() {
  return pegar("/api/arsenal", { tempoLimite: 30000 });
}

/** As 25 patentes do VALORANT, direto do catálogo da Riot. */
export async function carregarPatentes() {
  const r = await pegar("https://valorant-api.com/v1/competitivetiers?language=pt-BR");
  return r.data;
}

/** O ranking público do site. */
export async function carregarRanking() {
  return pegar("/api/ranking", { tempoLimite: 15000 });
}

export async function publicarNoRanking(dados) {
  const r = await fetch("/api/ranking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(dados),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(corpo.erro || `${r.status} ${r.statusText}`);
    e.precisaEntrar = Boolean(corpo.precisaEntrar);
    throw e;
  }
  return corpo;
}

/* ----------------------------------------------------------------- conta -- */
// O cookie da sessão é HttpOnly: o navegador manda sozinho, e nenhum script da
// página consegue ler o token. Por isso tudo aqui usa credentials: "same-origin".

async function conta(corpo) {
  const r = await fetch("/api/conta", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(corpo),
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(dados.erro || `${r.status} ${r.statusText}`);
    e.status = r.status;
    throw e;
  }
  return dados;
}

export async function quemSouEu() {
  try {
    const r = await fetch("/api/conta", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()).conta ?? null;
  } catch { return null; }
}

export const cadastrar = (email, senha, apelido) => conta({ acao: "cadastrar", email, senha, apelido });
export const entrar = (email, senha) => conta({ acao: "entrar", email, senha });
export const sair = () => conta({ acao: "sair" });
export const trocarApelido = (apelido) => conta({ acao: "apelido", apelido });

/** Se o apelido está livre. Falha de rede devolve `null`: "não sei" não é "livre". */
export async function apelidoLivre(apelido) {
  try {
    const r = await conta({ acao: "apelido-livre", apelido });
    return typeof r.livre === "boolean" ? r.livre : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- presença -- */

const CHAVE_SESSAO_ABA = "estande.aba.v1";

/** Um id por aba, só para a mesma aba não ser contada duas vezes. */
function idDaAba() {
  try {
    let id = sessionStorage.getItem(CHAVE_SESSAO_ABA);
    if (!id) {
      id = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6);
      sessionStorage.setItem(CHAVE_SESSAO_ABA, id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 14);
  }
}

/** Marca presença e devolve quantos estão online. */
export async function baterPonto() {
  try {
    const r = await fetch("/api/presenca", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: idDaAba() }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

const cacheCatalogo = new Map();

async function catalogo(caminho) {
  if (cacheCatalogo.has(caminho)) return cacheCatalogo.get(caminho);
  const promessa = pegar(`${VAPI}${caminho}`).then((r) => r.data);
  cacheCatalogo.set(caminho, promessa);
  try {
    return await promessa;
  } catch (e) {
    cacheCatalogo.delete(caminho);
    throw e;
  }
}

export const carregarAgentes = () =>
  catalogo("/agents?language=pt-BR&isPlayableCharacter=true");

export const carregarMapas = () => catalogo("/maps?language=pt-BR");

/** Todos os pixels e posições cadastrados pelo painel; a página filtra por mapa no cliente. */
export async function carregarTatica() {
  const r = await pegar("/api/tatica");
  return Array.isArray(r?.pontos) ? r.pontos : [];
}

/** Os gradientes da API vêm como RRGGBBAA sem o "#". */
export function gradienteAgente(cores) {
  if (!Array.isArray(cores) || cores.length < 2) return "var(--aco-alto)";
  const paradas = cores.map((c) => {
    const hex = String(c).padEnd(8, "f");
    const alfa = (parseInt(hex.slice(6, 8), 16) / 255).toFixed(2);
    return `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${alfa})`;
  });
  return `linear-gradient(165deg, ${paradas.join(", ")})`;
}
