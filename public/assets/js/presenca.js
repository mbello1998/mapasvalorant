/* ==========================================================================
   Presença — a última leitura guardada na máquina de quem visita.

   Os dois números da home ("Agora no site" e "Pessoas hoje") vêm do servidor,
   e esperar a resposta deixa um travessão na tela no primeiro segundo. Quem
   já esteve aqui há pouco não precisa ver esse travessão: a última leitura
   serve de primeiro desenho, e a resposta nova corrige quando chega.

   Guardar não é mentir: cada número só volta enquanto ainda significa o que o
   rótulo promete. "Agora" é a janela de dois minutos que o servidor conta;
   "hoje" acaba na virada do dia.
   ========================================================================== */

export const CHAVE_PRESENCA = "estande.presenca.v1";

/** A janela de "abas ativas" que o servidor conta. */
export const JANELA_AGORA_MS = 2 * 60 * 1000;

const ehNumero = (v) => Number.isFinite(v);

const mesmoDia = (a, b) => {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear()
    && x.getMonth() === y.getMonth()
    && x.getDate() === y.getDate();
};

/** Guarda a leitura com a hora dela. Cofre bloqueado é silêncio, não erro. */
export function guardarPresenca(cofre, { online, hoje } = {}, agora = Date.now()) {
  if (!ehNumero(online) && !ehNumero(hoje)) return;
  try {
    cofre?.setItem(CHAVE_PRESENCA, JSON.stringify({ online, hoje, quando: agora }));
  } catch {
    /* navegação restrita: seguir sem memória é melhor que quebrar */
  }
}

/**
 * A última leitura, com o que ainda vale. Devolve `null` quando não há nada
 * aproveitável — aí a tela mostra o travessão, como antes.
 */
export function lembrarPresenca(cofre, agora = Date.now()) {
  let guardado;
  try {
    guardado = JSON.parse(cofre?.getItem(CHAVE_PRESENCA) ?? "null");
  } catch {
    return null;
  }
  if (!guardado || !ehNumero(guardado.quando)) return null;

  const vale = {};
  if (ehNumero(guardado.online) && agora - guardado.quando < JANELA_AGORA_MS) {
    vale.online = guardado.online;
  }
  if (ehNumero(guardado.hoje) && mesmoDia(guardado.quando, agora)) {
    vale.hoje = guardado.hoje;
  }
  return Object.keys(vale).length ? vale : null;
}
