import {
  carregarConteudo, carregarAoVivo, carregarAgentes, carregarMapas,
  carregarNoticias, gradienteAgente,
} from "./api.js";
import { montarEstande } from "./range.js";
import { guardarPresenca, lembrarPresenca } from "./presenca.js";
import {
  $, elemento, texto, comoData, semMarcacao, vestirPagina,
} from "./chrome.js";
import { carregarConta, montarBotaoDeConta, mostrarBoasVindas, aoMudarConta, pedirConta, contaAtual } from "./conta.js";
import { acordarAudio, somLigado, volumeSom, alternarSom, ajustarVolume, somAcerto } from "./audio.js";
import { publicarTreino, recadoDoEnvio, montarInterruptor } from "./publicar.js";
import {
  registrarTreino, mostrarGanhoDeXp, tornarClicavel, seloParaATabela,
} from "./progresso.js";
import {
  diagnostico, numerosSugeridos, setupAtual, guardarSetup, eDpi,
  sessoesGuardadas, esquecerSessoes,
} from "./mira.js";
import { carregarRanking, carregarPatentes } from "./api.js";
import { patentesReais } from "./elo.js";
import { baterPonto, verPresenca } from "./api.js";

const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const DATA_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function diaMes(iso) {
  const d = comoData(iso);
  return Number.isNaN(d.getTime()) ? { dia: "—", ano: "" } : {
    dia: DATA_CURTA.format(d).replace(".", ""),
    ano: String(d.getFullYear()),
  };
}

/* ------------------------------------------------------- botões do herói -- */

function montarCta(c) {
  const p = c.hero?.ctaPrimario;
  const s = c.hero?.ctaSecundario;
  if (p?.rotulo) { $("ctaPrimario").textContent = p.rotulo; $("ctaPrimario").href = p.href || "#estande"; }
  if (s?.rotulo) { $("ctaSecundario").textContent = s.rotulo; $("ctaSecundario").href = s.href || "#lancamentos"; }

  if (c.hero?.imagemFundo) {
    const arte = $("heroArte");
    arte.style.backgroundImage = `url("${c.hero.imagemFundo}")`;
    arte.hidden = false;
  }
}

/* ------------------------------------------------- calibração do herói --- */

function montarCalibracao(c) {
  const campo = $("calibCampo");
  const convite = $("calibConvite");
  const TOTAL = 5;

  let feitos = 0;
  let tempos = [];
  let nascidoEm = 0;
  let ponto = null;

  function soltar() {
    ponto?.remove();
    const caixa = campo.getBoundingClientRect();
    const margem = 34;
    ponto = document.createElement("button");
    ponto.type = "button";
    ponto.className = "calib__ponto";
    ponto.setAttribute("aria-label", `Alvo ${feitos + 1} de ${TOTAL}`);
    ponto.style.left = `${margem + Math.random() * Math.max(1, caixa.width - margem * 2)}px`;
    ponto.style.top = `${margem + Math.random() * Math.max(1, caixa.height - margem * 2)}px`;
    ponto.addEventListener("click", (ev) => {
      ev.stopPropagation();
      tempos.push(performance.now() - nascidoEm);
      feitos++;
      atualizar();
      if (feitos >= TOTAL) terminar();
      else { nascidoEm = performance.now(); soltar(); ponto.focus(); }
    });
    campo.append(ponto);
    nascidoEm = performance.now();
  }

  function atualizar() {
    $("calibProgresso").textContent = `${feitos}/${TOTAL}`;
    if (!tempos.length) return;
    const media = tempos.reduce((s, v) => s + v, 0) / tempos.length;
    $("calibMedia").textContent = `${Math.round(media)} ms`;
    $("calibMelhor").textContent = `${Math.round(Math.min(...tempos))} ms`;
  }

  function terminar() {
    ponto?.remove();
    ponto = null;
    const media = tempos.reduce((s, v) => s + v, 0) / tempos.length;
    convite.hidden = false;
    convite.textContent = media < 320
      ? `${Math.round(media)} ms de média. Mão quente — vá para um exercício completo.`
      : `${Math.round(media)} ms de média. Vale aquecer no Gridshot antes da fila.`;

    const refazer = document.createElement("button");
    refazer.type = "button";
    refazer.className = "btn btn--latao chf";
    refazer.textContent = c.hero?.rotuloRefazer || "Calibrar de novo";
    refazer.style.marginTop = "0.875rem";
    refazer.addEventListener("click", (ev) => {
      ev.stopPropagation();
      refazer.remove();
      feitos = 0; tempos = [];
      $("calibMedia").textContent = "—";
      $("calibMelhor").textContent = "—";
      atualizar();
      convite.hidden = true;
      soltar();
    });
    convite.after(refazer);
  }

  campo.addEventListener("click", () => {
    if (ponto || feitos >= TOTAL) return;
    convite.hidden = true;
    soltar();
  });
}

/* --------------------------------------------------------------- ao vivo -- */

function ficha({ rotulo, valor, nota, cor, extra }) {
  const d = document.createElement("div");
  d.className = `ficha${cor ? ` ficha--${cor}` : ""}`;
  const r = document.createElement("div"); r.className = "ficha__rot"; r.textContent = rotulo;
  const v = document.createElement("div"); v.className = "ficha__val"; v.textContent = valor;
  d.append(r, v);
  if (nota) { const n = document.createElement("div"); n.className = "ficha__nota"; n.textContent = nota; d.append(n); }
  if (extra) d.append(extra);
  return d;
}

function montarAoVivo(dados) {
  const grade = $("aovivoGrade");
  grade.replaceChildren();

  // Presença. Em "real" o número vem do servidor e o rótulo diz o que ele
  // mede; em "fixo" sai o que estiver escrito no painel.
  //
  // Esta ficha é montada antes de qualquer outra coisa, e mesmo quando as
  // fontes da Riot não respondem: a presença é nossa, não depende delas.
  // O valor sai do último que o servidor mandou (estado.online), e não de um
  // travessão fixo — senão cada remontagem apagava o número da tela até a
  // próxima leitura chegar.
  const pr = estado.presenca ?? {};
  const fixo = pr.modo === "fixo";
  const vivo = estado.online ?? {};
  const fichaOnline = ficha({
    rotulo: fixo ? (pr.rotulo || "Na comunidade") : "Agora no site",
    valor: fixo ? String(pr.valor ?? "—") : numeroOuTraco(vivo.online),
    nota: fixo ? (pr.nota || "") : "Abas ativas nos últimos dois minutos.",
    cor: "sinal",
  });
  if (!fixo) fichaOnline.dataset.online = "1";
  grade.append(fichaOnline);

  if (!fixo && pr.mostrarHoje !== false) {
    const fichaHoje = ficha({
      rotulo: "Pessoas hoje",
      valor: numeroOuTraco(vivo.hoje),
      nota: "Visitantes distintos nas últimas 24 horas.",
    });
    fichaHoje.dataset.hoje = "1";
    grade.append(fichaHoje);
  }

  if (!dados) {
    grade.append(ficha({
      rotulo: "Servidores da Riot",
      valor: "Sem resposta",
      nota: "As fontes ao vivo não responderam. O resto do site continua funcionando.",
      cor: "sinal",
    }));
    return;
  }

  // Quantas pessoas jogam VALORANT: a Riot não publica isso, nem ao vivo nem
  // por API. O que aparece aqui é o que você escrever no painel, com fonte.
  const j = estado.jogadores ?? {};
  if (j.valor) {
    grade.append(ficha({
      rotulo: j.rotulo || "Jogadores de VALORANT",
      valor: j.valor,
      nota: [j.nota, j.fonte].filter(Boolean).join(" · "),
      cor: "latao",
    }));
  }

  if (dados.patch) {
    const dias = dados.patch.diasNoAr;
    const pulso = document.createElement("div");
    pulso.className = "pulso";
    pulso.textContent = dias === 0 ? "subiu hoje" : `no ar há ${dias} ${dias === 1 ? "dia" : "dias"}`;
    grade.append(ficha({
      rotulo: "Patch no ar",
      valor: dados.patch.versao,
      nota: `Build ${dados.patch.build}`,
      cor: "sinal",
      extra: pulso,
    }));
  }

  /** Barra fina de progresso, com rótulo para quem usa leitor de tela. */
  function medidorDe(janela, oque) {
    const medidor = document.createElement("div");
    medidor.className = "medidor";
    medidor.setAttribute("role", "img");
    medidor.setAttribute("aria-label", `${Math.round(janela.progresso * 100)}% do ${oque} decorrido`);
    const barra = document.createElement("div");
    barra.className = "medidor__barra";
    barra.style.width = `${(janela.progresso * 100).toFixed(1)}%`;
    medidor.append(barra);
    return medidor;
  }

  if (dados.ato) {
    grade.append(ficha({
      rotulo: dados.ato.titulo ?? "Ato em andamento",
      valor: dados.ato.nome,
      nota: `${dados.ato.diasRestantes} dias até o fim, em ${new Date(dados.ato.terminaEm).toLocaleDateString("pt-BR")}`,
      cor: "latao",
      extra: medidorDe(dados.ato, "ato"),
    }));
  }

  if (dados.episodio) {
    grade.append(ficha({
      rotulo: "Episódio",
      valor: dados.episodio.nome,
      nota: `Termina em ${new Date(dados.episodio.terminaEm).toLocaleDateString("pt-BR")}`,
      extra: medidorDe(dados.episodio, "episódio"),
    }));
  }

  if (dados.catalogo) {
    grade.append(ficha({
      rotulo: "Catálogo do jogo",
      valor: `${dados.catalogo.agentes} agentes`,
      nota: `${dados.catalogo.mapas} mapas e ${dados.catalogo.colecoes} coleções no cliente`,
    }));
  }

  if (dados.falhas?.length) {
    grade.append(ficha({
      rotulo: "Fontes fora do ar",
      valor: String(dados.falhas.length),
      nota: `Não respondeu: ${dados.falhas.join(", ")}. O cache tenta de novo em 5 minutos.`,
      cor: "sinal",
    }));
  }

  $("aovivoQuando").textContent = `lido às ${DATA_HORA.format(new Date(dados.geradoEm))}`;
}

/* ----------------------------------------------------------- lançamentos -- */

function cartaoFeed(item) {
  const externo = item.link && /^https?:/.test(item.link);
  const raiz = elemento(item.link ? "a" : "div", {
    class: `feed__item${item.oficial ? " feed__item--oficial" : ""}`,
    ...(item.link ? { href: item.link, rel: "noopener" } : {}),
    ...(externo ? { target: "_blank" } : {}),
  });

  const { dia, ano } = diaMes(item.data);
  const quando = elemento("div", { class: "feed__quando" }, [
    elemento("span", { class: "feed__dia", texto: dia }),
    elemento("span", { class: "feed__ano", texto: ano }),
  ]);

  const corpo = elemento("div");
  if (item.tipo) {
    corpo.append(elemento("span", {
      class: `feed__tipo chf${item.oficial ? " feed__tipo--oficial" : ""}`,
      texto: item.tipo,
    }));
  }
  corpo.append(elemento("h3", { class: "feed__titulo", texto: item.titulo }));
  if (item.resumo) corpo.append(elemento("p", { class: "feed__resumo", texto: item.resumo }));
  if (item.link) {
    corpo.append(elemento("span", {
      class: "feed__abrir",
      texto: externo ? "Abrir no site da Riot" : "Abrir",
    }));
  }

  raiz.append(quando, corpo);
  if (item.imagem) {
    raiz.append(elemento("img", { class: "feed__arte", src: item.imagem, alt: "", loading: "lazy" }));
  }
  return raiz;
}

/**
 * O feed junta duas origens: o que a função agendada colhe do site oficial e o
 * que você publica pelo painel. O seu vem primeiro quando a data empata, porque
 * se você escreveu sobre algo é porque quis destacar.
 */
function montarFeed(c, coleta) {
  const feed = $("feed");
  const filtros = $("feedFiltros");
  const nota = $("feedNota");

  const ocultas = new Set(c.noticias?.categoriasOcultas ?? []);
  const idsOcultos = new Set(c.noticias?.idsOcultos ?? []);
  const limite = Number(c.noticias?.quantidade) > 0 ? Number(c.noticias.quantidade) : 18;

  const manuais = (c.lancamentos?.itens ?? [])
    .filter((i) => i?.titulo)
    .map((i) => ({
      titulo: i.titulo, resumo: i.resumo, tipo: i.tipo, link: i.link,
      imagem: i.imagem, data: i.data, oficial: false, categoriaId: "painel",
    }));

  const oficiais = (coleta?.itens ?? [])
    .filter((n) => !ocultas.has(n.categoriaId) && !idsOcultos.has(n.id))
    .slice(0, limite)
    .map((n) => ({
      titulo: n.titulo, resumo: n.resumo, tipo: n.categoria, link: n.url,
      imagem: n.imagem, data: n.publicadoEm, oficial: true, categoriaId: n.categoriaId,
    }));

  const todos = [...manuais, ...oficiais].sort((a, b) => {
    const dif = String(b.data ?? "").localeCompare(String(a.data ?? ""));
    return dif !== 0 ? dif : Number(a.oficial) - Number(b.oficial);
  });

  if (nota) {
    if (coleta?.erro) {
      nota.textContent = `A coleta automática falhou: ${coleta.erro}`;
      nota.hidden = false;
    } else if (coleta?.coletadoEm) {
      const q = oficiais.length;
      nota.textContent = `${q} ${q === 1 ? "notícia oficial lida" : "notícias oficiais lidas"} em ${new Date(coleta.coletadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
      nota.hidden = false;
    }
  }

  // Filtros por categoria, montados a partir do que de fato veio.
  if (filtros) {
    const categorias = new Map();
    for (const i of todos) {
      const nome = i.oficial ? i.tipo : "Publicado por você";
      if (!categorias.has(i.categoriaId)) categorias.set(i.categoriaId, nome);
    }
    let ativo = null;
    filtros.replaceChildren();
    const pintar = () => {
      feed.replaceChildren();
      const lista = ativo ? todos.filter((i) => i.categoriaId === ativo) : todos;
      if (!lista.length) {
        feed.append(elemento("p", { class: "carregando", texto: "Nada aqui por enquanto." }));
        return;
      }
      for (const item of lista) feed.append(cartaoFeed(item));
    };
    const pilula = (rotulo, valor) => elemento("button", {
      type: "button", class: "pilula chf", texto: rotulo,
      "aria-pressed": String(ativo === valor),
      onclick: (ev) => {
        ativo = valor;
        for (const outro of filtros.children) outro.setAttribute("aria-pressed", String(outro === ev.currentTarget));
        pintar();
      },
    });
    filtros.append(pilula("Tudo", null));
    for (const [id, nome] of categorias) filtros.append(pilula(nome, id));
    pintar();
    return;
  }

  feed.replaceChildren();
  for (const item of todos) feed.append(cartaoFeed(item));
}

/* -------------------------------------------------------------- limpeza -- */

/* O que precisa ser desligado quando a tela sai. Dentro da casca o módulo fica
   na memória: um cronômetro esquecido aqui continuaria batendo ponto e
   repintando um ranking que não está mais na tela. */
const limpezas = [];

/** O estande montado nesta visita. Vive no módulo, e não dentro de
 *  `iniciar()`, porque é o `desmontar()` que precisa alcançá-lo. */
let estande = null;

/** `setInterval` que sabe se desligar. */
function cadaTanto(fn, ms) {
  const id = setInterval(fn, ms);
  limpezas.push(() => clearInterval(id));
}

/** Ouvinte que sabe se desligar. */
function ouvir(alvo, evento, fn) {
  alvo.addEventListener(evento, fn);
  limpezas.push(() => alvo.removeEventListener(evento, fn));
}

/* --------------------------------------------------------------- agentes -- */

const SLOTS = { Ability1: "Habilidade 1 (C)", Ability2: "Habilidade 2 (Q)", Grenade: "Habilidade (E)", Ultimate: "Suprema (X)", Passive: "Passiva" };

function montarAgentes(agentes, destaqueUuid) {
  const grade = $("agGrade");
  const filtros = $("agFiltros");
  $("agConta").textContent = `${agentes.length} agentes`;

  const funcoes = [...new Set(agentes.map((a) => a.role?.displayName).filter(Boolean))].sort();
  let filtro = null;

  function pintar() {
    grade.replaceChildren();
    const lista = agentes
      .filter((a) => !filtro || a.role?.displayName === filtro)
      .sort((a, b) => {
        if (destaqueUuid) {
          if (a.uuid === destaqueUuid) return -1;
          if (b.uuid === destaqueUuid) return 1;
        }
        return a.displayName.localeCompare(b.displayName, "pt-BR");
      });

    for (const a of lista) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "agente chf";
      botao.setAttribute("aria-label", `Ver ${a.displayName}, ${a.role?.displayName ?? "agente"}`);

      const retrato = document.createElement("div");
      retrato.className = "agente__retrato";

      const grad = document.createElement("div");
      grad.className = "agente__gradiente";
      grad.style.background = gradienteAgente(a.backgroundGradientColors);
      retrato.append(grad);

      if (a.fullPortrait) {
        const img = document.createElement("img");
        img.src = a.fullPortrait;
        img.alt = "";
        img.loading = "lazy";
        retrato.append(img);
      }

      const faixa = document.createElement("div");
      faixa.className = "agente__faixa";
      const nome = document.createElement("span");
      nome.className = "agente__nome";
      nome.textContent = a.displayName;
      const funcao = document.createElement("span");
      funcao.className = "agente__funcao";
      if (a.role?.displayIcon) {
        const ic = document.createElement("img");
        ic.src = a.role.displayIcon; ic.alt = ""; ic.loading = "lazy";
        funcao.append(ic);
      }
      funcao.append(document.createTextNode(a.role?.displayName ?? ""));
      faixa.append(nome, funcao);
      retrato.append(faixa);

      botao.append(retrato);
      botao.addEventListener("click", () => abrirAgente(a));
      grade.append(botao);
    }
  }

  filtros.replaceChildren();
  const fazerPilula = (rotulo, valor) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pilula chf";
    b.textContent = rotulo;
    b.setAttribute("aria-pressed", String(filtro === valor));
    b.addEventListener("click", () => {
      filtro = valor;
      for (const outro of filtros.children) outro.setAttribute("aria-pressed", String(outro === b));
      pintar();
    });
    return b;
  };
  filtros.append(fazerPilula("Todos", null));
  for (const f of funcoes) filtros.append(fazerPilula(f, f));

  pintar();
}

function abrirAgente(a) {
  const gaveta = $("gaveta");
  const caixa = $("gavetaCaixa");
  caixa.replaceChildren();

  const fechar = document.createElement("button");
  fechar.type = "button";
  fechar.className = "btn btn--vazio chf gaveta__fechar";
  fechar.textContent = "Fechar";
  fechar.addEventListener("click", () => gaveta.close());

  const topo = document.createElement("div");
  topo.className = "gaveta__topo";
  if (a.displayIcon) {
    const img = document.createElement("img");
    img.src = a.displayIcon; img.alt = "";
    topo.append(img);
  }
  const bloco = document.createElement("div");
  const h = document.createElement("h3");
  h.id = "gavetaNome";
  h.textContent = a.displayName;
  const meta = document.createElement("p");
  meta.className = "gaveta__meta";
  meta.textContent = [a.role?.displayName, a.developerName].filter(Boolean).join(" — ");
  bloco.append(h, meta);
  topo.append(bloco);

  const desc = document.createElement("p");
  desc.className = "gaveta__desc";
  desc.textContent = semMarcacao(a.description);

  const habs = document.createElement("div");
  habs.className = "gaveta__habs";
  for (const hab of a.abilities ?? []) {
    if (!hab.displayName) continue;
    const linha = document.createElement("div");
    linha.className = "hab";
    if (hab.displayIcon) {
      const ic = document.createElement("img");
      ic.className = "hab__icone";
      ic.src = hab.displayIcon; ic.alt = ""; ic.loading = "lazy";
      linha.append(ic);
    }
    const corpo = document.createElement("div");
    const n = document.createElement("div"); n.className = "hab__nome"; n.textContent = hab.displayName;
    const s = document.createElement("div"); s.className = "hab__slot"; s.textContent = SLOTS[hab.slot] ?? hab.slot;
    const d = document.createElement("p"); d.className = "hab__desc"; d.textContent = semMarcacao(hab.description);
    corpo.append(n, s, d);
    linha.append(corpo);
    habs.append(linha);
  }

  // O que rola fica dentro do .gaveta__rolo: a caixa chanfrada nao rola, e por
  // isso o botao Fechar continua preso no canto do painel.
  const rolo = document.createElement("div");
  rolo.className = "gaveta__rolo";
  rolo.append(topo, desc, habs);

  caixa.append(fechar, rolo);
  gaveta.showModal();
}

/* ----------------------------------------------------------------- mapas -- */

function montarMapas(mapas, destaqueUuid) {
  const grade = $("mapGrade");
  grade.replaceChildren();

  const lista = mapas
    .filter((m) => m.displayName && m.splash && m.displayName !== "The Range")
    .sort((a, b) => {
      if (destaqueUuid) {
        if (a.uuid === destaqueUuid) return -1;
        if (b.uuid === destaqueUuid) return 1;
      }
      return a.displayName.localeCompare(b.displayName, "pt-BR");
    });

  $("mapConta").textContent = `${lista.length} mapas`;

  for (const m of lista) {
    const cartao = document.createElement("article");
    cartao.className = "mapa chf";

    const arte = document.createElement("div");
    arte.className = "mapa__arte";
    const img = document.createElement("img");
    img.src = m.listViewIcon || m.splash;
    img.alt = `Vista do mapa ${m.displayName}`;
    img.loading = "lazy";
    arte.append(img);

    const corpo = document.createElement("div");
    corpo.className = "mapa__corpo";
    const nome = document.createElement("h3");
    nome.className = "mapa__nome";
    nome.textContent = m.displayName;
    corpo.append(nome);

    const resumo = m.tacticalDescription || m.narrativeDescription;
    if (resumo) {
      const p = document.createElement("p");
      p.className = "mapa__desc";
      p.textContent = semMarcacao(resumo);
      corpo.append(p);
    }

    cartao.append(arte, corpo);
    grade.append(cartao);
  }
}

/* -------------------------------------------- publicar o que acabou de ser
                                                   treinado ---------------- */
/**
 * O convite que aparece no fim de um treino quando não há conta.
 *
 * O resultado está na mão da pessoa nesse instante — mandar ela para outra
 * página para criar conta é perder o resultado e a vontade junto. O diálogo
 * de conta abre por cima da própria tela, faz login e cadastro no mesmo
 * formulário, e quando fecha a pontuação vai para o ranking sem que ninguém
 * precise repetir a rodada.
 *
 * Só aparece quando o envio falhou por falta de conta. Quem desligou o envio
 * no interruptor não é convidado a nada: já disse o que queria.
 */
function oferecerPublicacao(modo, sessao, motivo) {
  const alvo = $("capaConvite");
  if (!alvo) return;

  const semConta = motivo === "sem conta";
  const botao = elemento("button", {
    class: "btn btn--latao chf btn--mini", type: "button",
    texto: semConta ? "Entrar e publicar no ranking" : "Publicar este resultado",
  });
  const nota = elemento("span", {
    class: "capa-convite__nota",
    texto: semConta
      ? "Dá para criar a conta aqui mesmo, sem sair desta tela."
      : "O envio automático continua desligado — isto manda só esta rodada.",
  });

  botao.addEventListener("click", async () => {
    if (semConta) {
      const conta = await pedirConta();
      if (!conta) return;
    }

    botao.disabled = true;
    botao.textContent = "Publicando…";
    // `forcar` porque este clique é explícito: vale mesmo com o interruptor
    // do envio automático desligado.
    const r = await publicarTreino(modo, sessao, { forcar: true });
    const recado = recadoDoEnvio(modo, r);

    if (r?.enviado) {
      alvo.replaceChildren(elemento("span", {
        class: "capa-convite__nota",
        texto: recado || "Publicado no ranking.",
      }));
    } else {
      // Falhou depois de entrar: o botão volta, porque tentar de novo é a
      // única coisa que resolve um ranking fora do ar.
      botao.disabled = false;
      botao.textContent = "Tentar publicar de novo";
      nota.textContent = recado || "Não deu para publicar agora.";
    }
  });

  alvo.replaceChildren(botao, nota);
  alvo.hidden = false;
}

/* --------------------------------------------- calibração de sensibilidade */
/**
 * O painel que lê o movimento do mouse e diz o que fazer com a sensibilidade.
 *
 * Repintado ao fim de cada sessão, porque é aí que há dado novo. Enquanto não
 * houver sessões suficientes ele diz quantas faltam, em vez de dar um palpite
 * com cara de certeza — um conselho de sensibilidade errado custa semanas de
 * memória muscular para desfazer.
 */
function montarPainelDeMira() {
  const alvo = $("sensPainel");
  if (!alvo) return () => {};

  const pintar = () => {
    const diag = diagnostico();
    const setup = setupAtual();
    const blocos = [
      elemento("h4", { class: "sens__tit", texto: "Sua sensibilidade" }),
    ];

    if (!diag.pronto) {
      blocos.push(elemento("p", { class: "sens__texto", texto: diag.texto }));
    } else {
      blocos.push(
        elemento("p", { class: `sens__veredito sens__veredito--${diag.direcao}`, texto:
          diag.direcao === "manter" ? "Está boa assim"
            : diag.direcao === "baixar" ? "Está alta demais" : "Está baixa demais" }),
        elemento("p", { class: "sens__texto", texto: diag.texto }),
        elemento("p", { class: "sens__texto", texto: diag.conselho }),
      );

      const n = numerosSugeridos(diag, setup);
      if (n) {
        blocos.push(elemento("div", { class: "sens__numeros" }, [
          elemento("div", {}, [
            elemento("span", { class: "sens__rot", texto: "mexendo na sensibilidade" }),
            elemento("strong", { texto: `${n.porSensibilidade.sens} no jogo` }),
            elemento("span", { class: "sens__de", texto: `de ${n.atual.sens}` }),
          ]),
          elemento("div", {}, [
            elemento("span", { class: "sens__rot", texto: "ou mexendo no mouse" }),
            elemento("strong", { texto: `${n.porDpi.dpi} DPI` }),
            elemento("span", { class: "sens__de", texto: `de ${n.atual.dpi}` }),
          ]),
          elemento("span", { class: "sens__edpi", texto:
            `eDPI ${n.atual.edpi} → ${n.edpiNovo}. Os dois caminhos dão no mesmo; escolha um.` }),
        ]));
      } else if (diag.direcao !== "manter") {
        blocos.push(elemento("p", { class: "sens__texto sens__texto--fraco", texto:
          "Diga seu DPI e sua sensibilidade abaixo e eu digo o número novo, não só a direção." }));
      }
    }

    // Os campos ficam sempre visíveis: é por eles que o conselho vira número.
    const campoDpi = elemento("input", {
      type: "number", min: 100, max: 32000, step: 50, value: setup.dpi || "",
      placeholder: "800", "aria-label": "DPI do mouse",
    });
    const campoSens = elemento("input", {
      type: "number", min: 0.01, max: 10, step: 0.01, value: setup.sensibilidade || "",
      placeholder: "0,40", "aria-label": "Sensibilidade no VALORANT",
    });
    const guardar = () => {
      guardarSetup({ dpi: Number(campoDpi.value) || 0, sensibilidade: Number(campoSens.value) || 0 });
      pintar();
    };
    campoDpi.addEventListener("change", guardar);
    campoSens.addEventListener("change", guardar);

    const atual = eDpi(setup);
    blocos.push(elemento("div", { class: "sens__setup" }, [
      elemento("label", {}, [elemento("span", { texto: "DPI" }), campoDpi]),
      elemento("label", {}, [elemento("span", { texto: "Sens. no jogo" }), campoSens]),
      atual ? elemento("span", { class: "sens__edpi", texto: `eDPI ${atual}` }) : null,
    ]));

    const quantas = sessoesGuardadas().length;
    if (quantas) {
      blocos.push(elemento("button", {
        class: "sens__zerar", type: "button",
        texto: `Esquecer as ${quantas} ${quantas === 1 ? "leitura" : "leituras"} e recomeçar`,
        onclick: () => { esquecerSessoes(); pintar(); },
      }));
    }

    alvo.replaceChildren(...blocos.filter(Boolean));
  };

  pintar();
  return pintar;
}

/* ------------------------------------------------------------------ som --- */
/**
 * O mesmo par botão/volume da Linha de Tiro. As preferências ficam no
 * navegador e valem para as duas páginas: quem desligou lá chega aqui calado.
 */
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
    // Uma amostra curta ao religar: senão o botão diz "ligado" e nada prova.
    if (somLigado()) somAcerto("corpo");
  });

  nivel.addEventListener("input", () => {
    acordarAudio();
    ajustarVolume(Number(nivel.value) / 100);
  });
}

/* ---------------------------------------------------------------- modos --- */

function montarModos(c, trocar) {
  const caixa = $("modos");
  const modos = (c.modos ?? []).filter((m) => m?.id && m?.nome);
  caixa.replaceChildren();

  const iDestaque = Math.max(0, modos.findIndex((m) => m.destaque));
  caixa.dataset.destaque = String(iDestaque);

  modos.forEach((m, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `modo chf${i === iDestaque ? " modo--forte" : ""}`;
    b.setAttribute("aria-pressed", String(i === iDestaque));

    const topo = document.createElement("div");
    topo.className = "modo__topo";
    const icone = document.createElement(m.icone && /^(https?:|\/)/.test(m.icone) ? "img" : "span");
    icone.className = "modo__icone";
    if (icone.tagName === "IMG") { icone.src = m.icone; icone.alt = ""; }
    else icone.textContent = m.icone || "◎";
    const bloco = document.createElement("div");
    const nome = document.createElement("div"); nome.className = "modo__nome"; nome.textContent = m.nome;
    const obj = document.createElement("div"); obj.className = "modo__obj"; obj.textContent = m.objetivo ?? "";
    bloco.append(nome, obj);
    topo.append(icone, bloco);

    const desc = document.createElement("p");
    desc.className = "modo__desc";
    desc.textContent = m.descricao ?? "";

    const pe = document.createElement("div");
    pe.className = "modo__pe";
    const metrica = document.createElement("span");
    metrica.textContent = m.metrica ?? "";
    const dur = document.createElement("span");
    dur.className = "modo__recorde";
    dur.textContent = Number(m.duracao) > 0 ? `${m.duracao} s` : "livre";
    pe.append(metrica, dur);

    b.append(topo, desc, pe);
    b.addEventListener("click", () => {
      for (const outro of caixa.children) outro.setAttribute("aria-pressed", String(outro === b));
      trocar(m.id);
    });
    caixa.append(b);
  });

  return modos;
}

/* -------------------------------------------------------------- ranking -- */

const NOMES_MODO = {
  gridshot: "Gridshot", tracking: "Tracking", flick: "Flick", linha: "Linha de Tiro",
};

/**
 * O ranking na página inicial: a média do elo de todo mundo e as primeiras
 * posições. Quem quiser a tabela inteira vai para /ranking.html — aqui é só o
 * suficiente para dar vontade.
 */
/**
 * O nome na tabela vira botão: clicar abre o perfil da pessoa — nível, elo e
 * cartões. Entrada de exemplo não abre nada, porque não há ninguém atrás dela.
 */
function nomeDeJogador(e) {
  const el = elemento("span", {
    class: `rank-coluna__nome-jogador${e.exemplo ? " rank-coluna__nome-jogador--exemplo" : ""}`,
    texto: e.nome,
    title: e.exemplo ? "Entrada de demonstração criada pelo painel." : "",
  });
  if (e.exemplo) return el;

  tornarClicavel(el, e.nome, () => ({ tabela: estadoRanking.tabela, patentes }));
  seloParaATabela(e.nome).then((selo) => {
    // Sem `isConnected`: com os perfis em cache a promessa resolve antes de
    // a linha entrar na tabela, e o selo de nível nunca apareceria.
    if (selo) el.prepend(selo);
  });
  return el;
}

/**
 * A patente de uma linha do ranking: o ícone da Riot e o nome, juntos. Só o
 * nome escrito deixava "Radiante" parecendo mais um rótulo; no jogo a patente
 * é antes de tudo a insígnia.
 */
function patenteNaLinha(p) {
  const el = elemento("span", { class: "rank-coluna__patente" });
  if (!p) {
    el.textContent = "—";
    return el;
  }
  const icone = p.icone ?? p.iconeGrande;
  if (icone) {
    el.append(elemento("img", {
      class: "rank-coluna__patente-icone", src: icone, alt: "", loading: "lazy",
    }));
  }
  el.append(elemento("span", { texto: p.nome }));
  el.title = p.nome;
  return el;
}

/** A última tabela lida, para o perfil saber o elo sem buscar de novo. */
const estadoRanking = { tabela: null };

function montarRankingInicio(tabela, patentes) {
  estadoRanking.tabela = tabela;
  const alvo = $("rankInicioCorpo");
  if (!alvo) return;
  alvo.replaceChildren();

  const resumo = tabela?.resumo;
  if (!resumo?.jogadores) {
    alvo.append(elemento("p", { class: "carregando" }, [
      document.createTextNode("Ninguém publicou ainda. "),
      elemento("a", { href: "#estande", texto: "Faça um treino" }),
      document.createTextNode(" e seu resultado abre a tabela."),
    ]));
    return;
  }

  const selo = (i) => {
    const p = patentes[i];
    if (!p) return elemento("span", { class: "selo__nome", texto: "—" });
    const caixa = elemento("div", { class: "selo selo--g" });
    caixa.style.setProperty("--patente", p.cor);
    if (p.iconeGrande) caixa.append(elemento("img", { class: "selo__icone", src: p.iconeGrande, alt: "", loading: "lazy" }));
    caixa.append(elemento("span", { class: "selo__nome", texto: p.nome }));
    return caixa;
  };

  // A média, que é o número que a seção existe para mostrar.
  alvo.append(elemento("div", { class: "media-elo chf" }, [
    selo(resumo.mediaPatente),
    elemento("div", {}, [
      elemento("div", { class: "media-elo__num", texto: `${resumo.mediaIndice} de 100` }),
      elemento("div", { class: "media-elo__nota", texto:
        `Média de ${resumo.jogadores} ${resumo.jogadores === 1 ? "pessoa" : "pessoas"} em ${resumo.envios} ${resumo.envios === 1 ? "resultado" : "resultados"}. ` +
        "Cada pessoa conta uma vez, não uma por exercício." }),
    ]),
  ]));

  // As primeiras posições de cada exercício, lado a lado.
  const colunas = elemento("div", { class: "rank-colunas" });
  for (const modo of ["gridshot", "tracking", "flick", "linha"]) {
    const lista = (tabela.modos?.[modo] ?? []).slice(0, 3);
    const col = elemento("div", { class: "rank-coluna chf" }, [
      elemento("h3", { class: "rank-coluna__nome", texto: NOMES_MODO[modo] }),
    ]);
    if (!lista.length) {
      col.append(elemento("p", { class: "rank-coluna__vazio", texto: "sem ninguém ainda" }));
    }
    lista.forEach((e, i) => {
      const linha = elemento("div", { class: "rank-coluna__linha" }, [
        elemento("span", { class: "rank-coluna__pos", texto: String(i + 1) }),
        nomeDeJogador(e),
        patenteNaLinha(patentes[e.patente]),
      ]);
      const cor = patentes[e.patente]?.cor;
      if (cor) linha.style.setProperty("--patente", cor);
      col.append(linha);
    });
    colunas.append(col);
  }
  alvo.append(colunas);
}

/**
 * As patentes são buscadas uma vez só — elas não mudam — e servem a dois
 * lugares: o ranking da página e o elo que aparece ao fim de cada treino.
 * Quem chegar antes da resposta recebe lista vazia e mostra o que dá.
 */
let patentes = [];
const patentesProntas = carregarPatentes()
  .then((c) => { patentes = patentesReais(c); })
  .catch(() => { patentes = []; });

/**
 * O ranking se refaz sozinho de minuto em minuto, enquanto a aba estiver à
 * vista. Quem publicou um resultado em outra aba vê a tabela mudar aqui sem
 * recarregar nada — e quem deixou a página aberta não fica olhando um número
 * velho.
 */
function acompanharRanking() {
  const atualizar = async () => {
    if (document.hidden) return;
    await patentesProntas;
    try {
      montarRankingInicio(await carregarRanking(), patentes);
    } catch (e) {
      const alvo = $("rankInicioCorpo");
      if (alvo && alvo.textContent.includes("Carregando")) {
        alvo.replaceChildren(elemento("p", { class: "carregando", texto: "O ranking não respondeu." }));
      }
    }
  };

  atualizar();
  cadaTanto(atualizar, 60_000);
  ouvir(document, "visibilitychange", () => { if (!document.hidden) atualizar(); });
}

/* -------------------------------------------------------------- presença -- */

const estado = {};

const numeroOuTraco = (v) => (Number.isFinite(v) ? String(v) : "—");

/** De quanto em quanto tempo o número é relido e o ponto é batido. */
const LEITURA_MS = 8_000;
const PONTO_MS = 45_000;

/**
 * Bate ponto enquanto a aba estiver visível. Em aba escondida o navegador
 * segura o timer de qualquer forma, e quem não está olhando não precisa
 * contar como presente.
 *
 * São dois ritmos, de propósito. O ponto (POST, que escreve) vai de 45 em 45
 * segundos, dentro da janela de dois minutos que o servidor conta. A leitura
 * (GET, que não escreve nada) vai de oito em oito segundos, e é o que faz o
 * número andar quase ao vivo: quem entra ou sai aparece na tela em poucos
 * segundos, sem encher o depósito de marcas.
 *
 * O último valor lido fica em `estado.online` para que qualquer remontagem da
 * grade ao vivo já nasça com o número certo, em vez de piscar um travessão.
 */
function acompanharPresenca(adiantada) {
  const pintar = (r) => {
    if (!r) return;
    // A leitura adiantada sai antes de o ponto desta aba chegar ao servidor,
    // então ela ainda não conta quem está lendo. "Agora no site: 0" com
    // alguém olhando a tela seria falso — há pelo menos esta aba.
    const online = Number.isFinite(r.online) ? Math.max(r.online, 1) : r.online;
    estado.online = { online, hoje: r.hoje ?? online };
    guardarPresenca(globalThis.localStorage, estado.online);
    const agora = document.querySelector('[data-online="1"] .ficha__val');
    if (agora) agora.textContent = numeroOuTraco(estado.online.online);
    const hoje = document.querySelector('[data-hoje="1"] .ficha__val');
    if (hoje) hoje.textContent = numeroOuTraco(estado.online.hoje);
  };

  // A leitura que saiu na frente pinta assim que responder.
  adiantada?.then(pintar);

  const bater = () => { if (!document.hidden) baterPonto().then(pintar); };
  const ler = () => { if (!document.hidden) verPresenca().then(pintar); };

  bater();
  cadaTanto(bater, PONTO_MS);
  cadaTanto(ler, LEITURA_MS);
  // Quem volta para a aba vê o número de agora, não o de quando saiu: bate o
  // ponto na hora, porque a marca dele pode ter saído da janela enquanto a
  // aba estava escondida.
  ouvir(document, "visibilitychange", () => { if (!document.hidden) bater(); });
}

/* ----------------------------------------------------------------- início */

export async function iniciar() {
  // A leitura de presença sai na frente, em paralelo com o conteúdo. Esperar
  // o conteúdo para só então pedir o número somava meio segundo de travessão
  // na tela, e um não depende do outro.
  const presencaPronta = verPresenca();
  // A grade ao vivo é a casa dos dois números: quanto antes ela puder nascer,
  // antes eles aparecem. O pedido não depende do conteúdo, só a pintura.
  const aoVivoPronto = carregarAoVivo();

  // E o que ficou guardado da última visita já vale como primeiro desenho:
  // quem volta vê número, não travessão, enquanto a resposta nova não chega.
  estado.online = lembrarPresenca(globalThis.localStorage) ?? estado.online;

  const { conteudo, reserva } = await carregarConteudo();

  vestirPagina(conteudo, { aqui: "index.html" });
  carregarConta().then(() => {
    montarBotaoDeConta();
    const repintar = montarInterruptor($("autoRanking"));
    limpezas.push(aoMudarConta(() => repintar()));
  });
  mostrarBoasVindas();
  montarCta(conteudo);
  montarFeed(conteudo, null);
  montarCalibracao(conteudo);

  if (reserva) {
    console.info("O site está usando o conteúdo de reserva. Publique na Netlify para o painel admin entrar em ação.");
  }

  montarControleDeSom();
  const repintarMira = montarPainelDeMira();

  // O estande precisa da lista de modos antes de montar.
  const modos = montarModos(conteudo, (id) => estande?.trocarModo(id));
  estande = montarEstande({
    secao: $("estande"),
    tela: $("tela"),
    capa: $("capa"),
    modos: modos.length ? modos : [{ id: "gridshot", nome: "Gridshot", descricao: "", duracao: 30, destaque: true }],
    patentes: () => patentes,
    aoEncerrar: (modo, sessao) => {
      const convite = $("capaConvite");
      if (convite) { convite.hidden = true; convite.replaceChildren(); }
      // A leitura de mira desta sessão já foi guardada pelo estande.
      repintarMira();
      // XP e ranking são independentes: o nível conta mesmo com o envio ao
      // ranking desligado, porque o nível é da pessoa e a tabela é do público.
      registrarTreino(modo, sessao).then((r) => mostrarGanhoDeXp($("capaXp"), r));
      publicarTreino(modo, sessao).then((r) => {
        const recado = recadoDoEnvio(modo, r);
        if (recado) $("capaResultado").textContent += ` ${recado}`;
        // Duas situações em que a pessoa tem o resultado na mão e pode
        // querer mandá-lo mesmo assim: não estar logada, ou ter o envio
        // automático desligado. Nas duas, o botão resolve ali.
        if (!contaAtual() && (r?.motivo === "sem conta" || r?.precisaEntrar)) {
          oferecerPublicacao(modo, sessao, "sem conta");
        } else if (r?.motivo === "desligado") {
          oferecerPublicacao(modo, sessao, "desligado");
        }
      });
    },
    elementos: {
      capaTitulo: $("capaTitulo"), capaTexto: $("capaTexto"),
      contagem: $("contagem"), btnComecar: $("btnComecar"), resultado: $("capaResultado"),
      principal: $("hudPrincipal"), principalRot: $("hudPrincipalRot"),
      precisao: $("hudPrecisao"), acertos: $("hudAcertos"), tempo: $("hudTempo"),
      recorde: $("hudRecorde"), recordeRot: $("hudRecordeRot"),
      hist: $("hist"), histDica: $("histDica"), histResumo: $("histResumo"), histTitulo: $("histTitulo"),
      cfgTamanho: $("cfgTamanho"), valTamanho: $("valTamanho"),
      cfgDuracao: $("cfgDuracao"), valDuracao: $("valDuracao"),
      cfgMira: $("cfgMira"),
      elo: $("capaElo"), convite: $("capaConvite"), xp: $("capaXp"),
      carga: $("cargaEstande"), cargaArte: $("cargaEstandeArte"),
      cargaBarra: $("cargaEstandeBarra"), cargaTexto: $("cargaEstandeTexto"),
    },
  });

  // As fontes remotas são independentes: uma falhar não segura as outras.
  estado.jogadores = conteudo.jogadores;
  estado.presenca = conteudo.presenca;
  aoVivoPronto.then(montarAoVivo);
  acompanharPresenca(presencaPronta);

  carregarNoticias().then((coleta) => montarFeed(conteudo, coleta));

  acompanharRanking();

  carregarAgentes()
    .then((a) => montarAgentes(a, conteudo.destaques?.agenteUuid))
    .catch((e) => {
      $("agGrade").innerHTML = "";
      $("agGrade").append(Object.assign(document.createElement("p"), {
        className: "carregando",
        textContent: `Não foi possível carregar os agentes (${e.message}).`,
      }));
    });

  carregarMapas()
    .then((m) => montarMapas(m, conteudo.destaques?.mapaUuid))
    .catch((e) => {
      $("mapGrade").innerHTML = "";
      $("mapGrade").append(Object.assign(document.createElement("p"), {
        className: "carregando",
        textContent: `Não foi possível carregar os mapas (${e.message}).`,
      }));
    });
}

/** Sair da tela: desliga os três cronômetros, os ouvintes de visibilidade e a
 *  assinatura de conta. Sem isto, a segunda visita roda tudo em dobro. */
export function desmontar() {
  // O estande é desta tela: o canvas sai do DOM com ela, mas o laço e os
  // ouvintes de janela que ele prendeu continuariam vivos.
  estande?.parar();
  estande = null;
  for (const limpar of limpezas.splice(0)) limpar();
}

// A casca marca o body antes de importar: dentro dela quem chama `iniciar()`
// é o roteiro, na hora da troca. Aberta solta, a página se vira sozinha.
if (!document.body.dataset.casca) iniciar();
