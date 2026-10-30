import { publicarNoRanking } from "./api.js";
import { contaAtual } from "./conta.js";
import { indiceDe, entraNoRanking } from "./elo.js";
import { elemento } from "./chrome.js";

/**
 * Envio automático para o ranking, ao fim de cada treino.
 *
 * Duas condições, e as duas precisam valer: estar logado e ter o envio
 * automático ligado. Sem conta nada sai — não há de quem seria a pontuação.
 * Com conta, o padrão é ligado, e há um interruptor visível em cada treino
 * para desligar; a escolha fica guardada no navegador.
 *
 * Isso importa porque a tabela é pública: o resultado de uma pessoa fica
 * visível para qualquer um que abra a página. Publicar sem ela poder recusar
 * seria decidir por ela.
 *
 * Falha de envio é silenciosa de propósito. O treino é a coisa principal; se
 * o ranking estiver fora do ar, ninguém precisa levar um erro na cara no fim
 * da rodada. O botão manual na página do ranking continua lá para quem quiser
 * tentar de novo.
 */

const CHAVE = "estande.auto.v1";

export function envioAutomaticoLigado() {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function definirEnvioAutomatico(ligado) {
  try { localStorage.setItem(CHAVE, ligado ? "1" : "0"); } catch { /* modo privado */ }
}

/**
 * Monta o corpo e envia. `registro` é a sessão crua que o treino acabou de
 * gravar — o servidor confere tiros, acertos e duração antes de aceitar.
 */
export async function publicarTreino(modo, registro, { forcar = false } = {}) {
  // Quatro exercícios contam XP mas não têm coluna na tabela pública. Barrar
  // aqui, e não no servidor, poupa a requisição e deixa a tela dizer o
  // motivo certo em vez de "exercício desconhecido".
  if (!entraNoRanking(modo)) return { enviado: false, motivo: "fora do ranking" };

  // `forcar` é o clique explícito em "publicar este resultado". O interruptor
  // governa o envio automático; mandar à mão nunca foi automático, e exigir
  // que a pessoa ligue o interruptor só para publicar uma vez seria trocar a
  // escolha dela por um atalho nosso.
  if (!forcar && !envioAutomaticoLigado()) return { enviado: false, motivo: "desligado" };
  if (!contaAtual()) return { enviado: false, motivo: "sem conta" };

  const valor = Number(registro?.valor);
  if (!Number.isFinite(valor)) return { enviado: false, motivo: "sem valor" };

  try {
    const r = await publicarNoRanking({
      modo,
      valor,
      precisao: registro.precisao ?? null,
      detalhe: registro.detalhe ?? null,
      duracao: registro.duracao ?? null,
      tiros: registro.tiros ?? null,
      acertos: registro.acertos ?? null,
    });
    return { enviado: true, posicao: r.posicao, total: r.total };
  } catch (e) {
    console.info("Envio automático não foi aceito:", e.message);
    return { enviado: false, motivo: e.message, precisaEntrar: e.precisaEntrar, status: e.status };
  }
}

/**
 * A frase que o treino mostra depois de tentar enviar.
 *
 * Nenhum caminho sai calado. Antes, "desligado" e qualquer recusa do servidor
 * devolviam string vazia: a pessoa terminava a rodada, não via a pontuação na
 * tabela e não tinha como saber por quê — nem que o interruptor estava
 * desligado, nem que o número tinha sido recusado. Silêncio aqui vira "o site
 * está quebrado" na cabeça de quem joga.
 */
export function recadoDoEnvio(modo, resultado) {
  if (!resultado) return "";

  if (resultado.enviado) {
    return resultado.posicao
      ? `Publicado no ranking — ${resultado.posicao}º de ${resultado.total}.`
      : "Publicado no ranking.";
  }

  if (resultado.motivo === "fora do ranking") {
    return "Este exercício não entra na tabela pública — valeu XP para o seu nível.";
  }
  if (resultado.motivo === "sem conta") return "Entre na sua conta para o resultado ir ao ranking.";
  if (resultado.motivo === "desligado") return "Envio automático desligado — este resultado ficou só neste navegador.";
  if (resultado.status === 429) return "Você publicou há poucos segundos. Espere um instante e mande de novo.";
  if (resultado.status === 422) return `Não entrou no ranking: ${resultado.motivo}`;
  return `Não deu para publicar agora: ${resultado.motivo}`;
}

/** Índice de elo deste resultado, para a tela poder mostrar a patente. */
export const indiceDoTreino = (modo, valor) => indiceDe(modo, valor);

/* ------------------------------------------------------------ o botão ---- */

/**
 * Interruptor do envio automático. Recebe o elemento onde se encaixa e se
 * repinta sozinho quando a conta muda.
 */
export function montarInterruptor(alvo, { aoMudar } = {}) {
  if (!alvo) return () => {};

  const pintar = () => {
    const ligado = envioAutomaticoLigado();
    const logado = Boolean(contaAtual());
    alvo.replaceChildren();

    const botao = elemento("button", {
      type: "button",
      class: "auto__btn chf",
      "aria-pressed": String(ligado && logado),
      texto: ligado ? "Publicando no ranking" : "Não publicar",
      title: logado
        ? "Liga e desliga o envio automático do resultado para a tabela pública."
        : "Entre na sua conta para o resultado ir ao ranking.",
      onclick: () => { definirEnvioAutomatico(!envioAutomaticoLigado()); pintar(); aoMudar?.(); },
    });

    alvo.append(botao);
    if (!logado && ligado) {
      alvo.append(elemento("span", { class: "auto__nota", texto: "entre para valer" }));
    }
  };

  pintar();
  return pintar;
}
