import { quemSouEu, cadastrar, entrar, sair, apelidoLivre } from "./api.js";
import { $, elemento } from "./chrome.js";
import { meuProgresso, abrirPerfil } from "./progresso.js";

/**
 * A conta, do lado do navegador.
 *
 * O site inteiro continua aberto: treinar, ver skins, notícias e o ranking não
 * pedem nada. A conta só entra em cena na hora de publicar uma pontuação, que é
 * onde faz diferença saber de quem é o número.
 *
 * O token da sessão vive num cookie HttpOnly — nada aqui lê nem guarda senha.
 */

const CHAVE_BOASVINDAS = "estande.boasvindas.v1";

let atual = null;
const ouvintes = new Set();

export const contaAtual = () => atual;
export function aoMudarConta(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
function avisar() { for (const fn of ouvintes) fn(atual); }

export async function carregarConta() {
  atual = await quemSouEu();
  avisar();
  return atual;
}

/* ------------------------------------------------------------- diálogo --- */

let dialogo = null;
let resolverPendente = null;

function montarDialogo() {
  if (dialogo) {
    // A troca de tela varre o corpo do documento, e leva junto o que foi
    // pendurado nele. O nó guardado continua bom: basta pendurar de novo.
    if (!dialogo.isConnected) document.body.append(dialogo);
    return dialogo;
  }

  const form = elemento("form", { class: "gaveta__caixa chf", method: "dialog", id: "formConta" });
  dialogo = elemento("dialog", { class: "gaveta gaveta--conta", "aria-labelledby": "contaTit" }, [form]);
  document.body.append(dialogo);

  let modo = "entrar";

  const titulo = elemento("h3", { id: "contaTit" });
  const explica = elemento("p", { class: "conta__explica" });

  const campoApelido = campo("Apelido no ranking", "text", "apelido", "nickname",
    "De 2 a 18 caracteres. É o nome que aparece na tabela pública, e não pode repetir o de outra pessoa.");
  vigiarApelido(campoApelido);
  const campoEmail = campo("E-mail", "email", "email", "email",
    "Serve só para você entrar de novo. Não é verificado e não vai para lugar nenhum.");
  const campoSenha = campo("Senha", "password", "senha", "current-password",
    "Mínimo 8 caracteres.");

  const recado = elemento("p", { class: "recado recado--erro chf", hidden: true });
  const enviar = elemento("button", { class: "btn btn--forte chf", type: "submit" });
  const alternar = elemento("button", { class: "conta__alternar", type: "button" });
  const fechar = elemento("button", { class: "btn btn--vazio chf", type: "button", texto: "Agora não" });

  function pintar() {
    const cadastro = modo === "cadastrar";
    titulo.textContent = cadastro ? "Criar conta" : "Entrar";
    explica.textContent = cadastro
      ? "A conta serve para a pontuação que você publicar ter dono. Sem ela, o treino funciona igual — só não entra na tabela pública."
      : "Entre para publicar sua pontuação no ranking.";
    campoApelido.hidden = !cadastro;
    campoApelido.__limpar?.();
    campoApelido.querySelector("input").required = cadastro;
    campoSenha.querySelector("input").autocomplete = cadastro ? "new-password" : "current-password";
    campoSenha.querySelector("small").textContent = cadastro
      ? "Mínimo 8 caracteres. Não há recuperação de senha — não há envio de e-mail no site —, então guarde a sua."
      : "Mínimo 8 caracteres.";
    enviar.textContent = cadastro ? "Criar conta e entrar" : "Entrar";
    alternar.textContent = cadastro ? "Já tenho conta" : "Não tenho conta ainda";
    recado.hidden = true;
  }

  alternar.addEventListener("click", () => { modo = modo === "entrar" ? "cadastrar" : "entrar"; pintar(); });
  fechar.addEventListener("click", () => { dialogo.close(); resolverPendente?.(null); resolverPendente = null; });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    recado.hidden = true;
    enviar.disabled = true;
    const dados = new FormData(form);
    try {
      const r = modo === "cadastrar"
        ? await cadastrar(dados.get("email"), dados.get("senha"), dados.get("apelido"))
        : await entrar(dados.get("email"), dados.get("senha"));
      atual = r.conta;
      avisar();
      form.reset();
      dialogo.close();
      resolverPendente?.(atual);
      resolverPendente = null;
    } catch (e) {
      recado.hidden = false;
      recado.replaceChildren(elemento("strong", { texto: "Não deu: " }), document.createTextNode(e.message));
      // Quem tentou cadastrar um e-mail que já existe quase sempre queria
      // entrar. Já apelido repetido é outra coisa: a conta ainda não existe e
      // mandar a pessoa para a tela de entrar seria mandá-la para o lugar
      // errado. Fica onde está, com o aviso, e troca só o nome.
      const ehApelido = /apelido/i.test(e.message);
      if (e.status === 409 && !ehApelido) { modo = "entrar"; pintar(); recado.hidden = false; }
      if (ehApelido) campoApelido.querySelector("input").focus();
    } finally {
      enviar.disabled = false;
    }
  });

  form.append(
    titulo, explica,
    campoApelido, campoEmail, campoSenha,
    recado,
    elemento("div", { class: "conta__acoes" }, [fechar, enviar]),
    alternar,
    elemento("p", { class: "conta__aviso", texto:
      "A senha é guardada em hash scrypt com sal próprio — nem nós conseguimos lê-la. Ainda assim, não reutilize uma senha que você usa em outro lugar." }),
  );

  pintar();
  dialogo.__pintar = pintar;
  dialogo.__setModo = (m) => { modo = m; pintar(); };
  return dialogo;
}

/**
 * Avisa enquanto a pessoa digita se o apelido já é de outra.
 *
 * É só conforto: quem decide é o servidor, no envio. Mas descobrir que o nome
 * está tomado depois de preencher e-mail e senha é a pior hora de descobrir.
 *
 * Só pergunta quando a digitação para, e ignora resposta de pergunta velha —
 * senão a resposta de "Li" chegaria depois da de "Lia" e sobrescreveria.
 */
function vigiarApelido(campoApelido) {
  const input = campoApelido.querySelector("input");
  const dica = campoApelido.querySelector("small");
  const original = dica.textContent;
  let relogio = null;
  let pedido = 0;

  const repintar = (texto, estado) => {
    dica.textContent = texto;
    campoApelido.dataset.estado = estado ?? "";
  };

  input.addEventListener("input", () => {
    clearTimeout(relogio);
    const valor = input.value.trim();
    if (valor.length < 2) { repintar(original, ""); return; }

    relogio = setTimeout(async () => {
      const meu = ++pedido;
      repintar("Conferindo se está livre…", "");
      const livre = await apelidoLivre(valor);
      if (meu !== pedido || campoApelido.hidden) return;
      if (livre === null) repintar(original, "");
      else if (livre) repintar(`"${valor}" está livre.`, "livre");
      else repintar(`"${valor}" já é de outra pessoa. Escolha outro.`, "tomado");
    }, 450);
  });

  // Trocar de modo (entrar ⇄ cadastrar) limpa o aviso: ele não vale mais.
  campoApelido.__limpar = () => { clearTimeout(relogio); pedido++; repintar(original, ""); };
}

function campo(rotulo, tipo, nome, autocomplete, dica) {
  const input = elemento("input", { type: tipo, name: nome, autocomplete, required: true });
  if (nome === "apelido") input.maxLength = 18;
  return elemento("label", { class: "campo-envio" }, [
    elemento("span", { texto: rotulo }),
    input,
    elemento("small", { texto: dica }),
  ]);
}

/**
 * Abre o diálogo e devolve a conta quando a pessoa entrar, ou null se desistir.
 * Se já estiver logada, devolve na hora sem abrir nada.
 */
export function pedirConta({ modo = "entrar" } = {}) {
  if (atual) return Promise.resolve(atual);
  const d = montarDialogo();
  d.__setModo(modo);
  d.showModal();
  d.querySelector("input[name=email]")?.focus();
  return new Promise((resolve) => { resolverPendente = resolve; });
}

export async function sairDaConta() {
  await sair().catch(() => {});
  atual = null;
  avisar();
}

/* --------------------------------------------------------- boas-vindas --- */

/**
 * O recado sobre o ranking, uma vez por navegador. Não bloqueia nada: é uma
 * faixa no topo que a pessoa dispensa e não vê mais.
 */
export function mostrarBoasVindas() {
  try { if (localStorage.getItem(CHAVE_BOASVINDAS)) return; } catch { return; }

  const faixa = elemento("div", { class: "boasvindas chf", role: "region", "aria-label": "Sobre o ranking" }, [
    elemento("div", { class: "boasvindas__texto" }, [
      elemento("strong", { texto: "Seu treino vira elo. " }),
      document.createTextNode(
        "Cada exercício daqui calcula uma patente do VALORANT a partir do seu desempenho. " +
        "Treinar não pede conta nenhuma; a conta só entra se você quiser publicar a pontuação na tabela pública.",
      ),
    ]),
    elemento("div", { class: "boasvindas__acoes" }, [
      elemento("a", { class: "btn btn--latao chf btn--mini", href: "ranking.html", texto: "Ver o ranking" }),
      elemento("button", {
        class: "btn btn--vazio chf btn--mini", type: "button", texto: "Entendi",
        onclick: () => {
          try { localStorage.setItem(CHAVE_BOASVINDAS, "1"); } catch { /* modo privado */ }
          faixa.remove();
        },
      }),
    ]),
  ]);

  document.body.prepend(faixa);
}

/* ------------------------------------------------------- botão no topo --- */

/** O estado da conta no trilho: entrar, ou o apelido com a opção de sair. */
let botaoMontado = false;

export function montarBotaoDeConta() {
  const alvo = $("contaTrilho");
  // Idempotente: o trilho fica na casca e não é trocado, e esta função assina
  // `aoMudarConta` por dentro sem guardar o cancelamento — chamar a cada troca
  // de tela empilharia um assinante por visita.
  if (!alvo || botaoMontado) return;
  botaoMontado = true;

  const pintar = () => {
    alvo.replaceChildren();
    if (atual) {
      // O nível fica junto do apelido porque é o único lugar que todo mundo
      // logado vê sempre. Quem nunca publicou no ranking não tem linha na
      // tabela para clicar, e sem isto não veria o próprio nível em lugar
      // nenhum. Entra depois, quando o servidor responder: a barra de nível
      // não vale segurar o botão de sair.
      const nome = elemento("span", {
        class: "trilho__conta", texto: atual.apelido, title: `Entrou como ${atual.apelido}`,
      });
      const nivel = elemento("button", {
        class: "trilho__nivel chf", type: "button", hidden: true,
        onclick: () => abrirPerfil(atual.apelido),
      });
      alvo.append(
        nome,
        nivel,
        elemento("button", {
          class: "trilho__eng trilho__eng--botao", type: "button", texto: "Sair",
          onclick: async () => { await sairDaConta(); },
        }),
      );
      // Mesmo motivo do selo de nível: com o perfil em cache a promessa
      // resolve antes de o botão entrar no trilho, e exigir `isConnected`
      // faria o nível sumir no primeiro redesenho da conta.
      meuProgresso().then((perfil) => {
        if (!perfil) return;
        nivel.textContent = `nv ${perfil.nivel}`;
        nivel.title = `Nível ${perfil.nivel} — ${perfil.xpNoNivel} de ${perfil.custo} XP. Clique para ver o perfil.`;
        nivel.hidden = false;
      });
    } else {
      alvo.append(elemento("button", {
        class: "trilho__eng trilho__eng--botao", type: "button", texto: "Entrar",
        onclick: () => pedirConta(),
      }));
    }
  };

  aoMudarConta(pintar);
  pintar();
}
