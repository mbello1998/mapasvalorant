import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

/**
 * Contas por e-mail e senha.
 *
 * Guardar senha de outras pessoas é responsabilidade séria, então vale deixar
 * escrito o que este arquivo faz e o que ele não faz.
 *
 * O que faz:
 * - a senha nunca é guardada, nem em texto nem em hash simples. Vai por scrypt
 *   (N=16384, r=8, p=1), que é lento de propósito: quem roubar o depósito não
 *   consegue testar bilhões de palpites por segundo;
 * - cada conta tem um sal próprio de 16 bytes, então duas pessoas com a mesma
 *   senha têm hashes diferentes e nenhuma tabela pronta serve;
 * - a comparação é em tempo constante, para a resposta não vazar o quanto o
 *   palpite chegou perto;
 * - a chave do depósito é o SHA-256 do e-mail, não o e-mail: quem listar o
 *   depósito não extrai uma lista de e-mails;
 * - a sessão é um token aleatório de 32 bytes, guardado também em hash. Nem
 *   com o depósito em mãos dá para montar um cookie válido;
 * - o cookie é HttpOnly e SameSite=Lax, então script de página não lê o token.
 *
 * O que NÃO faz, e você precisa saber:
 * - **não verifica e-mail.** Não há serviço de envio ligado ao site, então
 *   qualquer pessoa pode se cadastrar com qualquer endereço. O e-mail aqui é
 *   identificador, não prova de nada;
 * - **não tem recuperação de senha.** Pelo mesmo motivo: sem envio de e-mail,
 *   não há como provar que alguém é dono da caixa. Quem esquecer a senha perde
 *   a conta, e o painel pode apagá-la para liberar o e-mail;
 * - não tem segundo fator.
 *
 * Para um placar de treino entre amigos isso é proporcional. Se um dia o site
 * guardar algo que importe de verdade, troque por um provedor de identidade.
 */

const N = 16384, R = 8, P = 1, TAM = 64;
const DIAS_SESSAO = 30;
const MAX_FALHAS = 8;
const CASTIGO_MS = 15 * 60 * 1000;

export const loja = () => getStore({ name: "estande-contas", consistency: "strong" });

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

export const chaveConta = (email: string) => `u/${sha(email.toLowerCase())}`;
export const chaveSessao = (token: string) => `s/${sha(token)}`;

/* ------------------------------------------------------------ apelidos --- */
/**
 * O apelido é a identidade pública do site: é ele que aparece no ranking e é
 * nele que se clica para abrir o perfil de alguém. Dois iguais fariam duas
 * pessoas dividirem a mesma linha da tabela e o mesmo perfil — e, pior, a
 * segunda pareceria estar colhendo o que a primeira treinou.
 *
 * A reserva é um blob por apelido, guardando a conta dona. Comparar sem
 * acento e sem caixa é de propósito: "Lia" e "lía" são o mesmo nome para quem
 * lê a tabela, e deixar passar seria abrir a porta para se passar por outro.
 */
export const normalizarApelido = (apelido: string) =>
  String(apelido ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .trim().toLowerCase().replace(/\s+/g, " ");

export const chaveApelido = (apelido: string) => `n/${normalizarApelido(apelido)}`;

const donoDe = (email: string) => sha(email.toLowerCase());

/**
 * Tenta ficar com o apelido para esta conta. Devolve false se ele já for de
 * outra pessoa. Quem já é dono reserva de novo sem problema — é o que
 * acontece a cada entrada, para contas antigas irem sendo registradas.
 */
export async function reservarApelido(apelido: string, email: string): Promise<boolean> {
  const chave = chaveApelido(apelido);
  if (chave === "n/") return false;
  const l = loja();
  const dono = donoDe(email);

  try {
    const atual = (await l.get(chave, { type: "json" })) as { dono: string } | null;
    if (atual) return atual.dono === dono;
  } catch {
    // Não deu para ler: melhor recusar do que entregar um apelido que pode
    // ser de outra pessoa.
    return false;
  }

  try {
    await l.setJSON(chave, { dono, em: new Date().toISOString() }, { onlyIfNew: true });
  } catch { /* alguém chegou junto; a conferência abaixo decide */ }

  // `onlyIfNew` nem sempre devolve `{ modified }`, então quem decide é a
  // releitura: se a chave ficou com outra conta, esta perdeu a corrida.
  try {
    const depois = (await l.get(chave, { type: "json" })) as { dono: string } | null;
    return !depois || depois.dono === dono;
  } catch {
    return false;
  }
}

/** Devolve o apelido antigo ao mundo depois de uma troca bem-sucedida. */
export async function liberarApelido(apelido: string, email: string): Promise<void> {
  const chave = chaveApelido(apelido);
  if (chave === "n/") return;
  try {
    const atual = (await loja().get(chave, { type: "json" })) as { dono: string } | null;
    if (atual && atual.dono === donoDe(email)) await loja().delete(chave);
  } catch { /* fica reservado; pior caso é um apelido a menos disponível */ }
}

/** Se o apelido está livre para esta conta (ou para qualquer uma, sem e-mail). */
export async function apelidoLivre(apelido: string, email?: string): Promise<boolean> {
  const chave = chaveApelido(apelido);
  if (chave === "n/") return false;
  try {
    const atual = (await loja().get(chave, { type: "json" })) as { dono: string } | null;
    if (!atual) return true;
    return Boolean(email) && atual.dono === donoDe(email as string);
  } catch {
    return false;
  }
}

export type Conta = {
  email: string;
  apelido: string;
  senha: string;          // scrypt$sal$hash
  criadaEm: string;
  marca?: string;
  falhas?: number;
  travadaAte?: number;
};

export type Sessao = { email: string; criadaEm: string; expiraEm: number };

/* ------------------------------------------------------------- a senha --- */

function derivar(senha: string, sal: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha.normalize("NFKC"), sal, TAM, { N, r: R, p: P }, (erro, chave) => {
      if (erro) reject(erro); else resolve(chave as Buffer);
    });
  });
}

export async function guardarSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(senha, sal);
  return `scrypt$${sal.toString("base64")}$${hash.toString("base64")}`;
}

export async function conferirSenha(senha: string, guardada: string): Promise<boolean> {
  const partes = guardada.split("$");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;
  const sal = Buffer.from(partes[1], "base64");
  const esperado = Buffer.from(partes[2], "base64");
  const obtido = await derivar(senha, sal);
  if (obtido.length !== esperado.length) return false;
  return timingSafeEqual(obtido, esperado);
}

/* ------------------------------------------------------------ validação -- */

// Não é uma gramática de e-mail completa — isso não existe de forma útil. É o
// suficiente para pegar erro de digitação e recusar lixo.
const FORMATO_EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export function limparEmail(bruto: unknown): { ok: true; email: string } | { ok: false; erro: string } {
  if (typeof bruto !== "string") return { ok: false, erro: "Informe um e-mail." };
  const email = bruto.trim().toLowerCase();
  if (email.length > 160) return { ok: false, erro: "E-mail longo demais." };
  if (!FORMATO_EMAIL.test(email)) return { ok: false, erro: "Esse e-mail não parece válido." };
  return { ok: true, email };
}

// As que aparecem em toda lista de senha vazada. Não é uma proteção de peso,
// mas evita a conta que cai no primeiro palpite.
const SENHAS_OBVIAS = new Set([
  "12345678", "123456789", "1234567890", "password", "senha123", "qwerty123",
  "valorant", "valorant123", "11111111", "abc12345", "senhasenha", "password1",
]);

export function conferirForcaDaSenha(bruto: unknown): { ok: true; senha: string } | { ok: false; erro: string } {
  if (typeof bruto !== "string") return { ok: false, erro: "Informe uma senha." };
  const senha = bruto;
  if (senha.length < 8) return { ok: false, erro: "A senha precisa de pelo menos 8 caracteres." };
  if (senha.length > 200) return { ok: false, erro: "A senha vai até 200 caracteres." };
  if (SENHAS_OBVIAS.has(senha.toLowerCase())) {
    return { ok: false, erro: "Essa senha está em todas as listas de senha vazada. Escolha outra." };
  }
  return { ok: true, senha };
}

/* ------------------------------------------------------------- sessões --- */

export async function abrirSessao(email: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const sessao: Sessao = {
    email,
    criadaEm: new Date().toISOString(),
    expiraEm: Date.now() + DIAS_SESSAO * 86_400_000,
  };
  await loja().setJSON(chaveSessao(token), sessao);
  return token;
}

export async function lerSessao(token: string | undefined): Promise<Conta | null> {
  if (!token) return null;
  const l = loja();
  let sessao: Sessao | null = null;
  try {
    sessao = (await l.get(chaveSessao(token), { type: "json" })) as Sessao | null;
  } catch { return null; }

  if (!sessao || sessao.expiraEm < Date.now()) {
    if (sessao) await l.delete(chaveSessao(token)).catch(() => {});
    return null;
  }

  try {
    return (await l.get(chaveConta(sessao.email), { type: "json" })) as Conta | null;
  } catch { return null; }
}

export async function fecharSessao(token: string | undefined): Promise<void> {
  if (!token) return;
  await loja().delete(chaveSessao(token)).catch(() => {});
}

/** O cookie da sessão, montado uma vez para não divergir entre as rotas. */
export const COOKIE = "estande_sessao";

export function opcoesCookie(token: string, apagar = false) {
  return {
    name: COOKIE,
    value: apagar ? "" : token,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax" as const,
    maxAge: apagar ? 0 : DIAS_SESSAO * 86_400,
  };
}

/* ------------------------------------------------------------- castigo --- */

/**
 * Trava a conta depois de erros seguidos. O contador pode perder uma unidade se
 * dois palpites chegarem no mesmo instante — e tudo bem: aqui aproximado
 * resolve, e contador exato em blob é justamente o que não se deve fazer.
 */
export function estaTravada(conta: Conta): number {
  if (conta.travadaAte && conta.travadaAte > Date.now()) {
    return Math.ceil((conta.travadaAte - Date.now()) / 60000);
  }
  return 0;
}

export async function registrarFalha(conta: Conta): Promise<void> {
  const falhas = (conta.falhas ?? 0) + 1;
  const atualizada: Conta = {
    ...conta,
    falhas,
    travadaAte: falhas >= MAX_FALHAS ? Date.now() + CASTIGO_MS : conta.travadaAte,
  };
  if (falhas >= MAX_FALHAS) atualizada.falhas = 0;
  await loja().setJSON(chaveConta(conta.email), atualizada).catch(() => {});
}

export async function limparFalhas(conta: Conta): Promise<void> {
  if (!conta.falhas && !conta.travadaAte) return;
  await loja()
    .setJSON(chaveConta(conta.email), { ...conta, falhas: 0, travadaAte: undefined })
    .catch(() => {});
}

/** O que pode sair para o navegador. A senha nunca sai daqui. */
export const contaPublica = (c: Conta) => ({ apelido: c.apelido, email: c.email, criadaEm: c.criadaEm });
