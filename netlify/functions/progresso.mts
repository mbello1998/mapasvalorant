import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";
import { lerSessao, COOKIE, normalizarApelido, type Conta } from "../lib/contas.mts";
import {
  ehModoTreino, indiceDeTreino, LIMITES_TREINO, MODOS_TREINO, type ModoTreino,
} from "../lib/elo.mts";
import {
  xpDaSessao, progressoDoXp, cartoesDevidos, escolherCartoes, xpDoNivel,
  normalizarConfig, NIVEIS_PADRAO, type ConfigNiveis, type Perfil,
} from "../lib/progresso.mts";
import { autorizar } from "../lib/auth.mts";
import { conteudoPadrao } from "../lib/defaults.mts";

/**
 * Nível de conta: o XP entra aqui e o perfil público sai daqui.
 *
 * Por que é uma rota separada do ranking: publicar pontuação é opcional e dá
 * para desligar no interruptor; treinar não é. Quem treina ganha XP mesmo com
 * o envio ao ranking desligado, porque o nível é da pessoa e a tabela é do
 * público — são coisas diferentes e não deviam depender uma da outra.
 *
 * O que isto NÃO resolve, e vale estar escrito junto do resto: trapaça. O
 * corpo da requisição é forjável como o do ranking. O que existe são os mesmos
 * tetos de sanidade, uma trava de tempo entre sessões e um limite diário. Isso
 * segura script bobo rodando a noite toda; não segura quem quer mesmo.
 */

const loja = () => getStore({ name: "estande-progresso", consistency: "strong" });

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const idDaConta = (c: Conta) => sha(c.email.toLowerCase());

/** A mesma normalização da reserva de apelido, para o índice bater com ela. */
const chaveNome = (apelido: string) => `nome/${normalizarApelido(apelido)}`;

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * A curva vem do painel. Ler o conteúdo a cada sessão é uma ida a mais ao
 * depósito, e é o preço de o painel valer na hora: guardar em memória faria
 * cada instância da função responder com uma curva diferente até expirar.
 *
 * Se a leitura falhar, vale o padrão — um painel fora do ar não pode zerar o
 * XP de quem está treinando.
 */
async function configDeNiveis(): Promise<ConfigNiveis> {
  try {
    const conteudo = await getStore({ name: "estande", consistency: "strong" })
      .get("conteudo", { type: "json" }) as Record<string, unknown> | null;
    return normalizarConfig(conteudo?.niveis ?? conteudoPadrao.niveis);
  } catch (e) {
    console.error("Configuração de níveis indisponível, usando o padrão:", e);
    return NIVEIS_PADRAO;
  }
}

type Registro = {
  apelido: string;
  xp: number;
  sessoes: number;
  porModo: Record<string, number>;
  cartoes: string[];
  cartaoEquipado?: string | null;
  /** Patente definida pelo painel. Ausente ou null: vale a conta do site. */
  elo?: number | null;
  desde: string;
  atualizadoEm: string;
  dia: string;
  xpNoDia: number;
};

const registroVazio = (apelido: string): Registro => ({
  apelido,
  xp: 0,
  sessoes: 0,
  porModo: Object.fromEntries(MODOS_TREINO.map((m) => [m, 0])),
  cartoes: [],
  cartaoEquipado: null,
  desde: new Date().toISOString(),
  atualizadoEm: new Date().toISOString(),
  dia: hoje(),
  xpNoDia: 0,
});

/** O que pode sair para qualquer pessoa: nada de e-mail, nada de contagem interna. */
function publico(r: Registro, cfg: ConfigNiveis): Perfil {
  const p = progressoDoXp(r.xp, cfg);
  return {
    apelido: r.apelido,
    xp: p.xp,
    nivel: p.nivel,
    xpNoNivel: p.xpNoNivel,
    custo: p.custo,
    cartoes: r.cartoes,
    // Sem escolha feita, vale o primeiro que a conta ganhou; sem nenhum, o
    // que o painel definir. Uma conta nova nunca aparece sem cartão nenhum.
    cartaoEquipado: r.cartaoEquipado
      ?? r.cartoes[0]
      ?? (cfg.cartaoPadraoUuid || null),
    cartoesACada: cfg.cartoesACada,
    podeTrocarCartao: cfg.trocaDeCartaoLiberada,
    elo: typeof r.elo === "number" ? r.elo : null,
    eloAjustado: typeof r.elo === "number",
    sessoes: r.sessoes,
    porModo: r.porModo,
    desde: r.desde ?? null,
    atualizadoEm: r.atualizadoEm,
  };
}

/* ------------------------------------------------- catálogo de cartões --- */

/**
 * Os cartões de jogador da Riot. Guardados por um dia: a lista muda umas
 * poucas vezes por ato, e não vale uma ida ao CDN em cada sessão de treino.
 */
const CATALOGO = "catalogo/cartoes";
const VALIDADE_CATALOGO_MS = 24 * 3600_000;

async function catalogoDeCartoes(l: ReturnType<typeof loja>): Promise<string[]> {
  try {
    const guardado = (await l.get(CATALOGO, { type: "json" })) as { uuids: string[]; em: number } | null;
    if (guardado?.uuids?.length && Date.now() - guardado.em < VALIDADE_CATALOGO_MS) {
      return guardado.uuids;
    }
  } catch { /* sem catálogo guardado, busca */ }

  try {
    const r = await fetch("https://valorant-api.com/v1/playercards");
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const corpo = await r.json() as { data?: Array<{ uuid?: string; displayIcon?: string }> };
    // Sem arte não serve: o cartão existe para ser visto.
    const uuids = (corpo.data ?? [])
      .filter((c) => c?.uuid && c?.displayIcon)
      .map((c) => c.uuid as string)
      .sort();
    if (!uuids.length) throw new Error("catálogo vazio");
    await l.setJSON(CATALOGO, { uuids, em: Date.now() }).catch(() => {});
    return uuids;
  } catch (e) {
    console.error("Catálogo de cartões indisponível:", e);
    // Devolve o que estiver guardado, mesmo vencido: cartão velho é melhor
    // que nenhum, e a pessoa não tem culpa de o CDN estar fora.
    try {
      const velho = (await l.get(CATALOGO, { type: "json" })) as { uuids: string[] } | null;
      return velho?.uuids ?? [];
    } catch { return []; }
  }
}

/* ------------------------------------------------------------ validação -- */

function conferir(corpo: Record<string, unknown>): { ok: true; modo: ModoTreino; indice: number } | { ok: false; erro: string } {
  const modo = corpo.modo;
  if (!ehModoTreino(modo)) return { ok: false, erro: "Exercício desconhecido." };

  const valor = Number(corpo.valor);
  if (!Number.isFinite(valor)) return { ok: false, erro: "Desempenho inválido." };

  const lim = LIMITES_TREINO[modo];
  if (valor < lim.min || valor > lim.max) {
    return { ok: false, erro: "Desempenho fora do que é humanamente possível." };
  }

  const duracao = Number(corpo.duracao);
  if (!Number.isFinite(duracao) || duracao < 10) {
    return { ok: false, erro: "Sessão curta demais para valer XP: faça pelo menos 10 segundos." };
  }

  // Mesma coerência do ranking: sessão sem acerto nenhum não é treino, é a
  // aba aberta. Em tracking o acerto é o tempo em alvo, que já está no valor.
  // `correcao` é tracking com troca de direção: também não se clica nele, e
  // cobrar tiros de um exercício sem tiro recusaria toda sessão válida.
  if (modo !== "tracking" && modo !== "correcao") {
    const tiros = Number(corpo.tiros);
    const acertos = Number(corpo.acertos);
    if (!Number.isFinite(tiros) || !Number.isFinite(acertos)) {
      return { ok: false, erro: "Faltam os números da sessão." };
    }
    if (acertos > tiros) return { ok: false, erro: "Mais acertos que tiros não existe." };
    if (acertos < 1) return { ok: false, erro: "Sessão sem nenhum acerto não vale XP." };
    if (tiros / duracao > 25) return { ok: false, erro: "Cadência de cliques acima do possível." };
  }

  return { ok: true, modo, indice: indiceDeTreino(modo, valor) };
}

/* ---------------------------------------------------------------- rotas -- */

export default async (req: Request, context: Context) => {
  const l = loja();

  /* ------------------------------------------------- perfil de alguém --- */
  if (req.method === "GET") {
    const url = new URL(req.url);
    const nome = url.searchParams.get("nome");

    /**
     * Todos os perfis de uma vez, enxutos.
     *
     * A tabela do ranking mostra o nível ao lado de cada apelido e o cartão
     * ao passar o mouse. Pedir um perfil por linha seriam cem requisições
     * para desenhar uma tela — então vem tudo numa, com o mínimo que a
     * tabela precisa, e o perfil inteiro só quando alguém clica.
     */
    if (url.searchParams.get("todos")) {
      try {
        const cfg = await configDeNiveis();
        const { blobs } = await l.list({ prefix: "conta/" });
        const lidos = await Promise.all(
          blobs.slice(0, 300).map((b) => l.get(b.key, { type: "json" }).catch(() => null)),
        );
        const perfis = lidos
          .filter((r): r is Registro => Boolean(r && (r as Registro).apelido))
          .map((r) => {
            const p = progressoDoXp(r.xp, cfg);
            return {
              apelido: r.apelido,
              nivel: p.nivel,
              xp: p.xp,
              xpNoNivel: p.xpNoNivel,
              custo: p.custo,
              cartaoEquipado: r.cartaoEquipado ?? r.cartoes[0] ?? (cfg.cartaoPadraoUuid || null),
              cartoes: r.cartoes.length,
              sessoes: r.sessoes,
              elo: typeof r.elo === "number" ? r.elo : null,
            };
          });
        return Response.json(
          { perfis, mostrarNoRanking: cfg.mostrarNoRanking, cartaoNoHover: cfg.cartaoNoHover },
          { headers: { "cache-control": "public, max-age=30" } },
        );
      } catch (e) {
        console.error("Falha ao listar perfis:", e);
        return Response.json({ erro: "Não foi possível listar os perfis." }, { status: 502 });
      }
    }

    // Sem nome, é "o meu": serve para a página saber o nível de quem entrou.
    if (!nome) {
      const conta = await lerSessao(context.cookies.get(COOKIE));
      if (!conta) return Response.json({ erro: "Sem sessão.", precisaEntrar: true }, { status: 401 });
      const r = (await l.get(`conta/${idDaConta(conta)}`, { type: "json" }).catch(() => null)) as Registro | null;
      return Response.json(
        { perfil: publico(r ?? registroVazio(conta.apelido), await configDeNiveis()) },
        { headers: { "cache-control": "private, max-age=0" } },
      );
    }

    try {
      const indice = (await l.get(chaveNome(nome), { type: "json" })) as { id: string } | null;
      if (!indice?.id) return Response.json({ erro: "Esse apelido ainda não treinou com conta." }, { status: 404 });

      const r = (await l.get(`conta/${indice.id}`, { type: "json" })) as Registro | null;
      if (!r) return Response.json({ erro: "Perfil não encontrado." }, { status: 404 });

      return Response.json(
        { perfil: publico(r, await configDeNiveis()) },
        { headers: { "cache-control": "public, max-age=30" } },
      );
    } catch (e) {
      console.error("Falha ao ler o perfil:", e);
      return Response.json({ erro: "Não foi possível ler o perfil." }, { status: 502 });
    }
  }

  /* ----------------------------------------------- registrar um treino -- */
  if (req.method === "POST") {
    const conta = await lerSessao(context.cookies.get(COOKIE));
    if (!conta) {
      return Response.json(
        { erro: "Entre na sua conta para o treino virar XP.", precisaEntrar: true },
        { status: 401 },
      );
    }

    let corpo: Record<string, unknown>;
    try {
      corpo = await req.json();
    } catch {
      return Response.json({ erro: "Corpo inválido." }, { status: 400 });
    }

    /* --------------------------------------- escolher o cartão em uso --- */
    /**
     * Só vale cartão que a conta já tem. Sem esta conferência, o corpo da
     * requisição escolheria qualquer um dos quatrocentos do jogo e o nível
     * deixaria de significar o que significa.
     */
    if (corpo.acao === "equipar") {
      const cfg = await configDeNiveis();
      if (!cfg.trocaDeCartaoLiberada) {
        return Response.json({ erro: "A troca de cartão está desligada no painel." }, { status: 403 });
      }

      const id = idDaConta(conta);
      let registro: Registro | null = null;
      try {
        registro = (await l.get(`conta/${id}`, { type: "json" })) as Registro | null;
      } catch { /* trata como sem registro */ }
      if (!registro) {
        return Response.json({ erro: "Treine uma vez antes de escolher um cartão." }, { status: 409 });
      }

      const uuid = typeof corpo.uuid === "string" ? corpo.uuid : "";
      if (!registro.cartoes.includes(uuid)) {
        return Response.json({ erro: "Esse cartão não é seu." }, { status: 403 });
      }

      registro.cartaoEquipado = uuid;
      registro.atualizadoEm = new Date().toISOString();
      try {
        await l.setJSON(`conta/${id}`, registro);
      } catch (e) {
        console.error("Falha ao equipar o cartão:", e);
        return Response.json({ erro: "Não foi possível trocar o cartão." }, { status: 502 });
      }
      return Response.json({ ok: true, perfil: publico(registro, cfg) });
    }

    const veredito = conferir(corpo);
    if (!veredito.ok) return Response.json({ erro: veredito.erro }, { status: 422 });

    const cfg = await configDeNiveis();
    const id = idDaConta(conta);
    const chave = `conta/${id}`;

    // Trava de tempo. Fica na metadata de um blob próprio para não disputar
    // escrita com o registro em si.
    try {
      const ultimo = await l.getMetadata(`trava/${id}`);
      const quando = ultimo?.metadata?.em as number | undefined;
      if (quando && Date.now() - quando < cfg.janelaSegundos * 1000) {
        return Response.json(
          { erro: "Espere alguns segundos entre uma sessão e outra.", cedoDemais: true },
          { status: 429 },
        );
      }
    } catch { /* sem trava anterior, segue */ }

    let registro: Registro;
    try {
      registro = ((await l.get(chave, { type: "json" })) as Registro | null) ?? registroVazio(conta.apelido);
    } catch {
      registro = registroVazio(conta.apelido);
    }

    // O apelido pode ter mudado desde a última sessão; o perfil acompanha.
    registro.apelido = conta.apelido;
    registro.porModo = { ...Object.fromEntries(MODOS_TREINO.map((m) => [m, 0])), ...(registro.porModo ?? {}) };
    if (registro.dia !== hoje()) { registro.dia = hoje(); registro.xpNoDia = 0; }

    const nivelAntes = progressoDoXp(registro.xp, cfg).nivel;

    const bruto = xpDaSessao(veredito.indice, cfg);
    const cabeNoDia = Math.max(0, cfg.xpPorDia - (registro.xpNoDia ?? 0));
    const ganho = Math.min(bruto, cabeNoDia);

    registro.xp += ganho;
    registro.xpNoDia = (registro.xpNoDia ?? 0) + ganho;
    registro.sessoes += 1;
    registro.porModo[veredito.modo] = (registro.porModo[veredito.modo] ?? 0) + 1;
    registro.atualizadoEm = new Date().toISOString();

    const depois = progressoDoXp(registro.xp, cfg);
    const cartoesAntes = registro.cartoes.length;
    registro.cartoes = escolherCartoes(
      id,
      await catalogoDeCartoes(l),
      registro.cartoes,
      cartoesDevidos(depois.nivel, cfg),
    );
    const cartoesNovos = registro.cartoes.slice(cartoesAntes);

    try {
      await l.setJSON(chave, registro);
    } catch (e) {
      console.error("Falha ao gravar o progresso:", e);
      return Response.json({ erro: "Não foi possível gravar o XP." }, { status: 502 });
    }

    context.waitUntil((async () => {
      await l.set(`trava/${id}`, "1", { metadata: { em: Date.now() } }).catch(() => {});
      // O índice por apelido é o que faz o clique num nome da tabela achar o
      // perfil. Só é reescrito se estiver livre ou já for desta conta: dois
      // apelidos iguais não se roubam o perfil.
      const atalho = chaveNome(conta.apelido);
      try {
        const dono = (await l.get(atalho, { type: "json" })) as { id: string } | null;
        if (!dono || dono.id === id) await l.setJSON(atalho, { id });
      } catch {
        await l.setJSON(atalho, { id }).catch(() => {});
      }
    })());

    return Response.json({
      ok: true,
      ganho,
      limitadoNoDia: ganho < bruto,
      subiu: depois.nivel > nivelAntes,
      nivelAntes,
      cartoesNovos,
      perfil: publico(registro, cfg),
    });
  }

  /* --------------------------------- o painel corrige um jogador ------- */
  /**
   * Definir o nível de alguém à mão.
   *
   * Existe porque conta de teste, bug e troca de regra acontecem, e sem isto
   * a única saída seria editar o depósito por fora. O nível vira o XP exato
   * em que ele começa — não o XP do meio do nível anterior —, senão a barra
   * apareceria cheia pela metade logo depois da correção.
   *
   * Abaixar o nível apara os cartões para o que o novo nível daria. Fora
   * daqui o sistema nunca tira um cartão de ninguém; aqui tira, porque o
   * sentido de uma correção é justamente desfazer o que não devia ter sido
   * dado. Subir o nível entrega os que faltavam, na mesma sequência de
   * sempre — a conta não ganha cartão diferente por ter passado pelo painel.
   */
  if (req.method === "PATCH") {
    const aut = autorizar(req);
    if (!aut.ok) return aut.resposta;

    let corpo: Record<string, unknown>;
    try {
      corpo = await req.json();
    } catch {
      return Response.json({ erro: "Corpo inválido." }, { status: 400 });
    }

    const nome = typeof corpo.nome === "string" ? corpo.nome : "";
    if (!nome.trim()) return Response.json({ erro: "Informe o apelido." }, { status: 400 });

    const temNivel = corpo.nivel !== undefined && corpo.nivel !== null && corpo.nivel !== "";
    const temXp = corpo.xp !== undefined && corpo.xp !== null && corpo.xp !== "";
    const temElo = "elo" in corpo;
    if (!temNivel && !temXp && !temElo) {
      return Response.json({ erro: "Informe o nível, o XP ou o elo." }, { status: 400 });
    }

    const cfg = await configDeNiveis();
    let registro: Registro | null = null;
    let id = "";
    try {
      const indice = (await l.get(chaveNome(nome), { type: "json" })) as { id: string } | null;
      if (!indice?.id) return Response.json({ erro: "Esse apelido não tem progresso guardado." }, { status: 404 });
      id = indice.id;
      registro = (await l.get(`conta/${id}`, { type: "json" })) as Registro | null;
    } catch (e) {
      console.error("Falha ao ler o progresso para corrigir:", e);
      return Response.json({ erro: "Não foi possível ler o progresso." }, { status: 502 });
    }
    if (!registro) return Response.json({ erro: "Perfil não encontrado." }, { status: 404 });

    const nivelAntes = progressoDoXp(registro.xp, cfg).nivel;

    // `elo: null` devolve o jogador à conta do site. É o desfazer desta
    // edição, e precisa existir: sem ele, um ajuste feito por engano ficaria
    // para sempre e ninguém saberia qual era o número calculado.
    if (temElo) {
      if (corpo.elo === null) {
        registro.elo = null;
      } else {
        const elo = Number(corpo.elo);
        if (!Number.isInteger(elo) || elo < 0 || elo > 24) {
          return Response.json({ erro: "O elo vai de 0 (Ferro 1) a 24 (Radiante)." }, { status: 422 });
        }
        registro.elo = elo;
      }
    }

    if (temNivel) {
      const nivel = Number(corpo.nivel);
      if (!Number.isFinite(nivel) || nivel < 1 || nivel > 5000) {
        return Response.json({ erro: "O nível vai de 1 a 5000." }, { status: 422 });
      }
      registro.xp = xpDoNivel(Math.floor(nivel), cfg);
    } else if (temXp) {
      const xp = Number(corpo.xp);
      if (!Number.isFinite(xp) || xp < 0 || xp > 50_000_000) {
        return Response.json({ erro: "XP fora da faixa." }, { status: 422 });
      }
      registro.xp = Math.floor(xp);
    }

    const depois = progressoDoXp(registro.xp, cfg);
    const devidos = cartoesDevidos(depois.nivel, cfg);
    registro.cartoes = registro.cartoes.length > devidos
      ? registro.cartoes.slice(0, devidos)
      : escolherCartoes(id, await catalogoDeCartoes(l), registro.cartoes, devidos);

    // O cartão em uso pode ter sido aparado junto.
    if (registro.cartaoEquipado && !registro.cartoes.includes(registro.cartaoEquipado)) {
      registro.cartaoEquipado = registro.cartoes[0] ?? null;
    }
    registro.atualizadoEm = new Date().toISOString();

    try {
      await l.setJSON(`conta/${id}`, registro);
    } catch (e) {
      console.error("Falha ao gravar a correção:", e);
      return Response.json({ erro: "Não foi possível gravar." }, { status: 502 });
    }

    return Response.json({
      ok: true, nivelAntes, nivel: depois.nivel, perfil: publico(registro, cfg),
    });
  }

  /* ------------------------------- o painel apaga o progresso de alguém - */
  if (req.method === "DELETE") {
    const aut = autorizar(req);
    if (!aut.ok) return aut.resposta;

    const nome = new URL(req.url).searchParams.get("nome");
    if (!nome) return Response.json({ erro: "Informe o apelido." }, { status: 400 });

    try {
      const indice = (await l.get(chaveNome(nome), { type: "json" })) as { id: string } | null;
      if (!indice?.id) return Response.json({ erro: "Esse apelido não tem progresso guardado." }, { status: 404 });
      await l.delete(`conta/${indice.id}`).catch(() => {});
      await l.delete(chaveNome(nome)).catch(() => {});
    } catch (e) {
      console.error("Falha ao apagar o progresso:", e);
      return Response.json({ erro: "Não foi possível apagar." }, { status: 502 });
    }
    return Response.json({ ok: true });
  }

  return Response.json({ erro: "Método não permitido." }, { status: 405 });
};

export const config: Config = {
  path: "/api/progresso",
  method: ["GET", "POST", "PATCH", "DELETE"],
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 30 },
};
