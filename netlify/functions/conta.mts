import { randomUUID } from "node:crypto";
import type { Config, Context } from "@netlify/functions";
import { limparApelido } from "../lib/elo.mts";
import {
  loja, chaveConta, guardarSenha, conferirSenha, limparEmail, conferirForcaDaSenha,
  abrirSessao, lerSessao, fecharSessao, opcoesCookie, COOKIE,
  estaTravada, registrarFalha, limparFalhas, contaPublica, type Conta,
  reservarApelido, liberarApelido, apelidoLivre, chaveApelido,
} from "../lib/contas.mts";

/**
 * Cadastro, entrada e saída.
 *
 * Uma regra atravessa tudo aqui: a resposta de erro nunca diz se o e-mail
 * existe. "E-mail ou senha incorretos" vale para os dois casos, senão o
 * endpoint vira uma máquina de descobrir quem tem conta no site.
 *
 * Outra: a senha só transita no corpo de um POST sobre HTTPS e nunca vai para
 * log nenhum — nem em erro, nem em depuração.
 */

const erro = (mensagem: string, status: number) => Response.json({ erro: mensagem }, { status });

export default async (req: Request, context: Context) => {
  const token = context.cookies.get(COOKIE);

  // GET — quem está logado neste navegador.
  if (req.method === "GET") {
    const conta = await lerSessao(token);
    return Response.json(
      { conta: conta ? contaPublica(conta) : null },
      { headers: { "cache-control": "no-store" } },
    );
  }

  if (req.method !== "POST") return erro("Método não permitido.", 405);

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return erro("Corpo inválido.", 400);
  }

  const acao = corpo.acao;

  /* ------------------------------------------------------------- sair --- */
  if (acao === "sair") {
    await fecharSessao(token);
    context.cookies.set(opcoesCookie("", true));
    return Response.json({ ok: true });
  }

  /* -------------------------------------------------- trocar o apelido -- */
  if (acao === "apelido") {
    const conta = await lerSessao(token);
    if (!conta) return erro("Entre na sua conta primeiro.", 401);

    const apelido = limparApelido(corpo.apelido);
    if (!apelido.ok) return erro(apelido.erro, 422);

    const antigo = conta.apelido;
    if (!(await reservarApelido(apelido.nome, conta.email))) {
      return erro("Esse apelido já é de outra pessoa. Escolha outro.", 409);
    }

    try {
      await loja().setJSON(chaveConta(conta.email), { ...conta, apelido: apelido.nome });
    } catch (e) {
      console.error("Falha ao trocar o apelido:", e);
      // A conta não mudou, então o nome novo não é de ninguém: devolve.
      await liberarApelido(apelido.nome, conta.email);
      return erro("Não foi possível trocar o apelido.", 502);
    }

    // Só depois de a troca valer é que o nome antigo volta a ficar livre.
    if (chaveApelido(antigo) !== chaveApelido(apelido.nome)) {
      context.waitUntil(liberarApelido(antigo, conta.email));
    }
    return Response.json({ ok: true, conta: contaPublica({ ...conta, apelido: apelido.nome }) });
  }

  /* ------------------------------------- o apelido está livre? --------- */
  // Serve ao formulário, para a pessoa saber antes de enviar. Não vaza nada:
  // os apelidos já estão todos na tabela pública do ranking.
  if (acao === "apelido-livre") {
    const apelido = limparApelido(corpo.apelido);
    if (!apelido.ok) return Response.json({ livre: false, erro: apelido.erro });
    const conta = await lerSessao(token);
    return Response.json({
      livre: await apelidoLivre(apelido.nome, conta?.email),
      apelido: apelido.nome,
    });
  }

  // Daqui para baixo tudo precisa de e-mail. As ações de apelido ficam acima
  // de propósito: elas trabalham sobre a sessão aberta, e exigir e-mail nelas
  // era o que fazia a troca de apelido responder "Informe um e-mail" para um
  // corpo que nunca teve e-mail nenhum.
  const email = limparEmail(corpo.email);
  if (!email.ok) return erro(email.erro, 422);

  const l = loja();
  const chave = chaveConta(email.email);

  let existente: Conta | null = null;
  try {
    existente = (await l.get(chave, { type: "json" })) as Conta | null;
  } catch (e) {
    console.error("Falha ao ler a conta:", e);
    return erro("O serviço de contas não respondeu. Tente de novo.", 502);
  }

  /* -------------------------------------------------------- cadastrar --- */
  if (acao === "cadastrar") {
    const apelido = limparApelido(corpo.apelido);
    if (!apelido.ok) return erro(apelido.erro, 422);

    const senha = conferirForcaDaSenha(corpo.senha);
    if (!senha.ok) return erro(senha.erro, 422);

    // O apelido é reservado antes da conta existir: se duas pessoas pedirem o
    // mesmo nome ao mesmo tempo, quem perde a corrida descobre aqui e não
    // depois, com a conta criada e a tabela com dois nomes iguais.
    if (!(await reservarApelido(apelido.nome, email.email))) {
      return erro("Esse apelido já é de outra pessoa. Escolha outro.", 409);
    }

    if (existente) {
      // Aqui o e-mail já é conhecido de qualquer forma por quem o digitou, e
      // sem este aviso a pessoa não entenderia por que o cadastro falhou.
      return erro("Já existe uma conta com esse e-mail. Entre em vez de cadastrar.", 409);
    }

    // Marca própria desta tentativa, para saber quem ganhou se dois cadastros
    // no mesmo e-mail chegarem juntos.
    const marca = randomUUID();
    const conta: Conta = {
      email: email.email,
      apelido: apelido.nome,
      senha: await guardarSenha(senha.senha),
      criadaEm: new Date().toISOString(),
      marca,
    };

    try {
      const r = await l.setJSON(chave, conta, { onlyIfNew: true });
      // `setJSON` nem sempre devolve `{ modified }` — depende da versão e do
      // ambiente. Quando devolve, já resolve; quando não, a leitura abaixo é
      // quem decide, e não dá para confiar na forma da resposta.
      if (r && r.modified === false) {
        await liberarApelido(apelido.nome, email.email);
        return erro("Já existe uma conta com esse e-mail.", 409);
      }
    } catch (e) {
      console.error("Falha ao gravar a conta:", e);
      return erro("Não foi possível criar a conta. Tente de novo.", 502);
    }

    // Confere quem de fato ficou gravado. Se não for esta tentativa, outra
    // chegou primeiro e esta perde.
    try {
      const gravada = (await l.get(chave, { type: "json" })) as Conta | null;
      if (!gravada || gravada.marca !== marca) {
        return erro("Já existe uma conta com esse e-mail.", 409);
      }
    } catch (e) {
      console.error("Falha ao confirmar a conta:", e);
      return erro("Não foi possível confirmar a conta. Tente entrar.", 502);
    }

    const novo = await abrirSessao(conta.email);
    context.cookies.set(opcoesCookie(novo));
    return Response.json({ ok: true, conta: contaPublica(conta) });
  }

  /* ------------------------------------------------------------ entrar -- */
  if (acao === "entrar") {
    if (typeof corpo.senha !== "string" || !corpo.senha) {
      return erro("Informe a senha.", 422);
    }

    if (existente) {
      const minutos = estaTravada(existente);
      if (minutos) {
        return erro(`Muitas tentativas erradas. Tente de novo em ${minutos} min.`, 429);
      }
    }

    // Mesmo sem conta, o scrypt roda: sem isso o tempo de resposta denunciaria
    // quais e-mails existem.
    const guardada = existente?.senha ?? (await guardarSenha("sem-conta-neste-email"));
    const confere = await conferirSenha(corpo.senha, guardada);

    if (!existente || !confere) {
      if (existente) await registrarFalha(existente);
      return erro("E-mail ou senha incorretos.", 401);
    }

    await limparFalhas(existente);
    const novo = await abrirSessao(existente.email);
    context.cookies.set(opcoesCookie(novo));
    // Contas criadas antes da reserva existir não têm o apelido registrado.
    // Cada entrada registra o seu, sem segurar a resposta.
    context.waitUntil(reservarApelido(existente.apelido, existente.email).catch(() => {}));
    return Response.json({ ok: true, conta: contaPublica(existente) });
  }

  return erro("Ação desconhecida.", 400);
};

export const config: Config = {
  path: "/api/conta",
  method: ["GET", "POST"],
  // Barreira contra tentativa em massa, aplicada pela própria plataforma.
  rateLimit: { action: "rate_limit", aggregateBy: "ip", windowSize: 60, windowLimit: 12 },
};
