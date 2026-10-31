/**
 * Acervo inicial da Sala de Mapas: os pontos que a página mostra antes de o dono
 * cadastrar qualquer coisa.
 *
 * Toda coordenada vem de um callout oficial da API da Riot, convertido pelo
 * mesmo `paraMinimapa` da página (`node scripts/callouts-mapas.mjs` imprime a
 * tabela). O nome do callout vem num comentário ao lado do número, e o número é
 * o do callout, sem ajuste.
 *
 * Nenhum ponto daqui foi testado no jogo: todos entram com `conferido: false`,
 * e a página mostra o aviso até o dono conferir. Posição (onde ficar e por onde
 * a smoke cai) envelhece devagar; alinhamento fino de mira não entra aqui, de
 * propósito, porque é o que mais erra a cada patch.
 *
 * O acervo cobre os 13 mapas jogáveis, mas não com a mesma confiança, e vale
 * saber disso antes de confiar num ponto. Ascent, Split, Bind, Haven, Icebox e
 * Breeze vieram da primeira leva e são os mais assentados. Fracture, Lotus,
 * Pearl, Sunset e Abyss têm pontos de estrutura — por onde se entra, de onde
 * se segura, o que a utilidade fecha — que mudam pouco entre patches. Corrode
 * e Summit são os mais novos e entram com o mínimo: só o que a geometria do
 * mapa sustenta, sem truque específico.
 *
 * A regra que vale para todos: posição e o que a utilidade fecha, sim;
 * alinhamento fino de mira, não, porque é o que mais erra a cada patch. Tudo
 * entra com `conferido: false` até o dono testar em jogo.
 */

import type { Ponto } from "./tatica.mts";

export type PontoAcervo = Omit<Ponto, "id" | "criadoEm">;

// UUIDs de /v1/maps e /v1/agents (valorant-api.com).
const MAPA = {
  ascent: "7eaecc1b-4337-bbf6-6ab9-04b8f06b3319",
  split: "d960549e-485c-e861-8d71-aa9d1aed12a2",
  bind: "2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba",
  breeze: "2fb9a4fd-47b8-4e7d-a969-74b4046ebd53",
  icebox: "e2ad5c54-4114-a870-9641-8ea21279579a",
  haven: "2bee0dc9-4ffe-519b-1cbd-7fbe763a6047",
  fracture: "b529448b-4d60-346e-e89e-00a4c527a405",
  lotus: "2fe4ed3a-450a-948b-6d6b-e89a78e680a9",
  pearl: "fd267378-4d1d-484f-ff52-77821ed10dc2",
  sunset: "92584fbe-486a-b1b2-9faa-39b0f486b498",
  abyss: "224b0a95-48b9-f703-1bd8-67aca101a61f",
  corrode: "1c18ab1f-420d-0d8b-71d0-77ad3c439115",
  summit: "756da597-416b-c0f2-f47b-afbdf28670bc",
} as const;

const AGENTE = {
  clove: "1dbf2edd-4729-0984-3115-daa5eed44993",
  brimstone: "9f0d8ba9-4140-b941-57d3-a7ad57c6b417",
  viper: "707eab51-4836-f488-046a-cda6bf494859",
  omen: "8e253930-4c05-31dd-1b6c-968525494517",
  astra: "41fb69c1-4189-7b37-f117-bcaf1e96f1bf",
  sova: "320b2a48-4d9b-a075-30f1-1f93a9b638fa",
  killjoy: "1e58de9c-4950-5125-93e9-a0aee9f98746",
  cypher: "117ed9e3-49f3-6512-3ccf-0cada7e3823b",
  kayo: "601dbbe7-43ce-be57-2a40-4abd24953621",
  harbor: "95b78ed7-4637-86d9-7e41-71ba8c293152",
  breach: "5f8d3a7f-467b-97f3-062c-13acf203c006",
  fade: "dade69b4-4f5a-8528-247b-219e5a1facd6",
} as const;

/**
 * O slot de cada habilidade usada aqui, lido de `abilities` em /v1/agents.
 *
 * É o slot que a página casa com o ponto, não o nome: o nome muda com o idioma
 * e com rebalanceamento, o slot não. O nome fica no comentário só para dar
 * para ler a tabela. Cuidado com os que não seguem a ordem do teclado — o
 * Incendiário do Brimstone é Ability1 e a Fumaça Celeste é Ability2, o
 * Nanoenxame da Killjoy e o Veneno de Cobra da Viper são Grenade, e a Nuvem
 * Venenosa da Viper é Ability1, não Ability2.
 */
const HAB = {
  brimstone: { incendiario: "Ability1", fumaca: "Ability2", orbital: "Ultimate" },
  viper: { nuvem: "Ability1", cortina: "Ability2", veneno: "Grenade" },
  omen: { paranoia: "Ability1", manto: "Ability2" },
  astra: { nebulosa: "Ability2", poco: "Grenade" },
  clove: { artimanha: "Ability2" },
  sova: { choque: "Ability1", rastreadora: "Ability2", drone: "Grenade" },
  killjoy: { robo: "Ability1", torreta: "Ability2", nanoenxame: "Grenade" },
  cypher: { jaula: "Ability1", camera: "Ability2", fio: "Grenade" },
  kayo: { clarao: "Ability1", pontoZero: "Ability2", fragmento: "Grenade" },
  harbor: { mareAlta: "Ability1", enseada: "Ability2" },
  breach: { estopim: "Ability1", falha: "Ability2", posChoque: "Grenade" },
  fade: { clausura: "Ability1", assombrar: "Ability2" },
} as const;

type Par = readonly [number, number];
const c = ([x, y]: Par) => ({ x, y });

/** Onde ficar, sem lançar nada. Sem agente, vale como posição genérica do mapa. */
function posicao(
  mapa: string, lado: Ponto["lado"], de: Par, titulo: string, texto: string, agente: string | null = null,
): PontoAcervo {
  return {
    mapa, agente, habilidade: null, lado, tipo: "posicao",
    de: c(de), para: null, titulo, texto, imagens: [], video: null, fonte: null, conferido: false,
  };
}

/** De onde a pessoa age e onde a util cai. */
function pixel(
  mapa: string, agente: string, habilidade: string, lado: Ponto["lado"],
  de: Par, para: Par, titulo: string, texto: string,
): PontoAcervo {
  return {
    mapa, agente, habilidade, lado, tipo: "pixel",
    de: c(de), para: c(para), titulo, texto, imagens: [], video: null, fonte: null, conferido: false,
  };
}

export const ACERVO: PontoAcervo[] = [
  /* ------------------------------------------------------------------ Ascent -- */
  posicao(MAPA.ascent, "ataque", [0.484, 0.201] /* A Principal */,
    "Entrada do A pelo Principal",
    "O A se ataca saindo do Acesso e subindo pelo Principal. Junte o time no Acesso e solte as utilidades antes de pisar no corredor; quem entra sozinho fica sem troca."),
  posicao(MAPA.ascent, "defesa", [0.270, 0.887] /* B Casa de Barcos */,
    "Defender o B pela Casa de Barcos",
    "Um dos lugares onde o defensor do B costuma ficar: junto à Casa de Barcos, no fundo do ponto, com o time à frente. Depois do primeiro tiro troque de lugar, porque o atacante já sabe onde você está."),
  posicao(MAPA.ascent, "defesa", [0.298, 0.497] /* Meio Mercado */,
    "Meio defensivo pelo Mercado",
    "Do Mercado o defensor reage ao meio e pode rodar para o A ou para o B. Serve para dar informação cedo; segurar o meio sozinho contra uma entrada em massa não funciona."),
  pixel(MAPA.ascent, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.603, 0.259] /* A Acesso */, [0.398, 0.295] /* A Árvore */,
    "Fumaça na Árvore para entrar no A",
    "Feche a Árvore com a Fumaça Celeste, que tira a visão dos defensores que seguram o A pelo lado do meio. O time entra pelo Principal enquanto a fumaça dura."),
  pixel(MAPA.ascent, AGENTE.astra, HAB.astra.nebulosa, "ataque",
    [0.665, 0.380] /* Meio Topo */, [0.525, 0.411] /* Meio Passarela */,
    "Nebulosa na Passarela para tomar o meio",
    "Posicione a estrela na Passarela antes da rodada começar e ative quando o time for atravessar o meio. A Nebulosa corta a linha de quem segura o outro lado da Passarela."),
  pixel(MAPA.ascent, AGENTE.omen, HAB.omen.manto, "defesa",
    [0.350, 0.142] /* A Ponto */, [0.484, 0.201] /* A Principal */,
    "Manto Sombrio no Principal para atrasar o A",
    "Com o ataque vindo pelo Principal, o Omen solta o manto na boca do corredor para ganhar tempo e deixar o time chegar ao ponto. Dá para fazer de dentro do ponto, sem se expor no corredor."),

  /* -------------------------------------------------------------------- Split -- */
  posicao(MAPA.split, "ataque", [0.484, 0.540] /* Meio Topo */,
    "Brigar pelo meio no Topo",
    "O meio é o que abre os dois pontos para o ataque. Quem controla o Topo força o defensor a dividir o time. Vá com utilidade, não aposte só em tiro."),
  posicao(MAPA.split, "defesa", [0.430, 0.684] /* B Torre */,
    "Segurar o B pela Torre",
    "Da Torre o defensor do B cobre o ponto do alto. Fique perto do time e saia depois do primeiro tiro, porque a posição fica conhecida."),
  posicao(MAPA.split, "defesa", [0.150, 0.257] /* A Telas */,
    "Defender o A por trás, nas Telas",
    "As Telas ficam no fundo do A, de onde o defensor pega quem sobe e quem planta. Segure ali só com um colega por perto, para não ficar isolado."),
  pixel(MAPA.split, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.650, 0.166] /* A Acesso */, [0.472, 0.360] /* A Rampas */,
    "Fumaça nas Rampas para entrar no A",
    "As Rampas dão ao defensor uma linha de cima sobre quem entra no A. Fechar essa linha com a Fumaça Celeste deixa o time chegar ao ponto com menos gente olhando."),

  /* --------------------------------------------------------------------- Bind -- */
  posicao(MAPA.bind, "ataque", [0.624, 0.497] /* A Curto */,
    "Entrada do A pelo Curto",
    "O Curto é o caminho mais direto ao A. Entre com utilidade nos dois cantos de onde o defensor segura, o Banheiro e as Luzes, e só depois com o time."),
  pixel(MAPA.bind, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.624, 0.497] /* A Curto */, [0.582, 0.339] /* A Luzes */,
    "Fumaça nas Luzes para entrar no A",
    "As Luzes ficam logo acima do Curto e dão ao defensor uma linha para quem sobe. Feche com a Fumaça Celeste antes da entrada."),
  pixel(MAPA.bind, AGENTE.astra, HAB.astra.nebulosa, "ataque",
    [0.763, 0.607] /* A Acesso */, [0.839, 0.430] /* A Banheiro */,
    "Nebulosa no Banheiro para fechar o outro canto do A",
    "Junto com a fumaça nas Luzes, a Nebulosa no Banheiro tira os dois lugares de onde o defensor costuma segurar o A. A estrela já fica posta desde o começo da rodada."),
  posicao(MAPA.bind, "defesa", [0.151, 0.435] /* B Teleportador */,
    "Teleportador do B: rotação rápida, mas barulhenta",
    "O teleportador liga o B ao A em segundos, mas faz barulho que o outro time ouve. Use para rodar quando o ataque já se comprometeu com o outro ponto, não por hábito."),
  posicao(MAPA.bind, "defesa", [0.247, 0.428] /* B Jardim */,
    "Defender o B pelo Jardim",
    "Um lugar comum para quem segura o B. Fique perto do ponto e do time; sozinho no Jardim, uma única fumaça do ataque te isola."),

  /* -------------------------------------------------------------------- Haven -- */
  posicao(MAPA.haven, "ataque", [0.590, 0.506] /* Meio Pátio */,
    "Pátio no meio: ameaçar mais de um ponto",
    "Haven tem três pontos e o Pátio fica entre eles. Quem toma o Pátio deixa o defensor sem saber para onde rodar e vê a rotação dele."),
  posicao(MAPA.haven, "defesa", [0.294, 0.495] /* B Traseira */,
    "Defender o B por trás",
    "Atrás do ponto, o defensor fica mais longe da entrada e ganha tempo de reagir. Com três pontos, avise cedo quando o ataque aparecer para o time poder rodar."),
  pixel(MAPA.haven, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.664, 0.766] /* C Acesso */, [0.493, 0.629] /* C Garagem */,
    "Fumaça na Garagem para entrar no C",
    "A Garagem é de onde o defensor segura o C de cima. Fechar a Garagem com a Fumaça Celeste deixa o time entrar no ponto sem esse ângulo."),
  pixel(MAPA.haven, AGENTE.clove, HAB.clove.artimanha, "ataque",
    [0.664, 0.766] /* C Acesso */, [0.419, 0.643] /* C Janela */,
    "Artimanha na Janela do C",
    "Complementa a fumaça na Garagem: a Janela é o outro ângulo de cima sobre o C."),

  /* ------------------------------------------------------------------- Icebox -- */
  posicao(MAPA.icebox, "ataque", [0.552, 0.470] /* B Tubo */,
    "Entrada do B pelo Tubo",
    "O Tubo liga o meio ao B. Quem toma o Tubo abre uma segunda frente para o B e obriga o defensor a olhar para dois lados."),
  posicao(MAPA.icebox, "ataque", [0.399, 0.823] /* A Esteira */,
    "Entrada do A pela Esteira",
    "A Esteira é o caminho do ataque até o A. Mantenha o time junto antes de subir, porque o defensor vê a entrada de vários ângulos de cima."),
  pixel(MAPA.icebox, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.399, 0.823] /* A Esteira */, [0.700, 0.672] /* A Tela */,
    "Fumaça na Tela para entrar no A",
    "A Tela fica acima do ponto e é um dos ângulos de cima mais usados pela defesa. Fechar a Tela com a Fumaça Celeste tira essa linha de quem entra."),
  posicao(MAPA.icebox, "ataque", [0.646, 0.180] /* B Ponto */,
    "Viper no pós-plant do B",
    "Depois de plantar no B, a Viper usa a Cortina Tóxica, habilidade normal, para cortar a visão de quem tenta desarmar. Planta e sai da linha de visão do defensor antes de usar. O Poço Peçonhento é a ultimate dela e só aparece em algumas rodadas da partida: quando estiver carregada, vale para o pós-plant, mas não conte com ela.",
    AGENTE.viper),

  /* ------------------------------------------------------------------- Breeze -- */
  posicao(MAPA.breeze, "ataque", [0.498, 0.541] /* Meio Pilar */,
    "Meio aberto: briga de longa distância",
    "O meio do Breeze tem longas linhas de visão. Com o Pilar como cobertura, o atacante pode disputar à distância sem se expor, e a utilidade deve cobrir o corredor depois dele."),
  posicao(MAPA.breeze, "defesa", [0.364, 0.382] /* B Túnel */,
    "Segurar o B pelo Túnel",
    "O Túnel é de onde o defensor fecha a rota do meio ao B. Segure com um colega por perto, porque é uma saída fácil de isolar."),
  pixel(MAPA.breeze, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.763, 0.683] /* A Loja */, [0.847, 0.469] /* A Pirâmides */,
    "Fumaça nas Pirâmides para entrar no A",
    "As Pirâmides dão cobertura ao defensor do A. Feche-as com a Fumaça Celeste antes de o time entrar no ponto."),

  /* ----------------------------------------------------------------- Fracture -- */
  posicao(MAPA.fracture, "ataque", [0.679, 0.145] /* A Portão */,
    "Fracture ataca dos dois lados ao mesmo tempo",
    "O ataque nasce nos dois extremos do mapa, então o A pode ser pressionado pelo Portão e pelo Principal na mesma rodada. Combine quem vai por onde antes de sair: dois grupos chegando em tempos diferentes viram duas mortes separadas."),
  posicao(MAPA.fracture, "ataque", [0.236, 0.769] /* B Árvore */,
    "Entrada do B pela Árvore",
    "A Árvore é a chegada do lado de baixo ao B. Quem vem por aqui pega o defensor de costas se o time do outro lado estiver fazendo barulho no Fliperama."),
  posicao(MAPA.fracture, "defesa", [0.820, 0.522] /* A Ponto */,
    "Defender o A de dentro do ponto",
    "Com entrada pelos dois lados, ficar longe do ponto no Fracture custa caro: você perde o plant tentando segurar um corredor. Fique no ponto, com o colega cobrindo o outro acesso."),
  posicao(MAPA.fracture, "defesa", [0.504, 0.442] /* Surgimento defensor */,
    "O Surgimento defensor é o atalho entre os dois pontos",
    "A base da defesa fica no meio do mapa e liga A e B em poucos segundos. É o que torna a rotação viável aqui; avise cedo para o colega poder usá-la."),
  posicao(MAPA.fracture, "defesa", [0.120, 0.442] /* B Torre */,
    "Segurar o B pela Torre",
    "Da Torre o defensor cobre o ponto e o Fliperama de uma vez. Saia depois do primeiro tiro: é posição conhecida e fácil de cercar pelos dois lados."),
  pixel(MAPA.fracture, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.679, 0.145] /* A Portão */, [0.777, 0.430] /* A Descida */,
    "Fumaça na Descida para entrar no A pelo Portão",
    "A Descida é de onde o defensor olha quem vem do Portão. Fechar com a Fumaça Celeste deixa o time ocupar a Antena antes da briga pelo ponto."),
  pixel(MAPA.fracture, AGENTE.viper, HAB.viper.cortina, "ataque",
    [0.659, 0.487] /* A Link */, [0.820, 0.522] /* A Ponto */,
    "Cortina Tóxica cortando o A ao meio",
    "A Cortina é parede, não bola de fumaça: dá para dividir o ponto em dois e atacar só metade. Suba antes de entrar e deixe de fora o lado que o defensor cobre."),
  pixel(MAPA.fracture, AGENTE.sova, HAB.sova.rastreadora, "ataque",
    [0.343, 0.438] /* B Link */, [0.093, 0.518] /* B Ponto */,
    "Flecha Rastreadora varrendo o B antes da entrada",
    "Do Link a flecha alcança o fundo do ponto. Saber quantos estão no B decide se vale entrar ou trocar para o A, e no Fracture essa troca é rápida."),
  pixel(MAPA.fracture, AGENTE.kayo, HAB.kayo.pontoZero, "ataque",
    [0.639, 0.638] /* A Corda */, [0.717, 0.761] /* A Salão */,
    "PONTO/zero no Salão para abrir o A",
    "A faca bloqueia as habilidades de quem está no Salão por alguns segundos. Jogue junto com a entrada, não antes: o efeito acaba rápido e não espera o time se organizar."),
  pixel(MAPA.fracture, AGENTE.killjoy, HAB.killjoy.nanoenxame, "defesa",
    [0.120, 0.442] /* B Torre */, [0.093, 0.518] /* B Ponto */,
    "Nanoenxame no B para o pós-plant",
    "Deixe o enxame no ponto e ative quando começarem a desarmar. É Grenade, não Ability2: a Torreta é outra coisa e fica em outro lugar."),

  /* -------------------------------------------------------------------- Lotus -- */
  posicao(MAPA.lotus, "ataque", [0.605, 0.485] /* A Link */,
    "Três pontos: o Link decide para onde ir",
    "Lotus tem A, B e C, e a defesa não cobre os três com força. Ocupe o Link, veja onde ela está pesada e vá no que sobrou."),
  posicao(MAPA.lotus, "ataque", [0.451, 0.567] /* B Principal */,
    "Entrada do B pelo Principal",
    "O B é o ponto do meio e o mais fácil de reforçar dos dois lados. Entrar aqui só vale rápido, antes de as rotações chegarem."),
  posicao(MAPA.lotus, "defesa", [0.148, 0.437] /* C Ponto */,
    "Defender o C de dentro",
    "O C é longe das rotações: quem segura ali precisa aguentar sozinho até o time chegar. Fique no ponto e jogue pelo tempo, não pela troca."),
  posicao(MAPA.lotus, "defesa", [0.503, 0.661] /* B Pilares */,
    "Os Pilares cobrem o B sem ficar no ponto",
    "Dos Pilares o defensor pega quem entra no B com cobertura por perto. É uma das poucas posições do mapa de onde dá para recuar sem atravessar o ponto aberto."),
  posicao(MAPA.lotus, "defesa", [0.341, 0.640] /* C Monte */,
    "Monte: a ponte entre B e C",
    "Quem fica no Monte reage aos dois pontos do lado esquerdo. Vale mais como posição de informação e rotação do que para segurar sozinho."),
  pixel(MAPA.lotus, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.754, 0.537] /* A Principal */, [0.829, 0.514] /* A Porta */,
    "Fumaça na Porta do A",
    "A Porta é o ângulo curto de onde o defensor pega quem entra pelo Principal. Feche antes de o time passar."),
  pixel(MAPA.lotus, AGENTE.omen, HAB.omen.manto, "ataque",
    [0.451, 0.567] /* B Principal */, [0.564, 0.365] /* B Superior */,
    "Manto Sombrio no Superior do B",
    "O Superior olha o B de cima. Com ele fechado, a entrada pelo Principal deixa de ser atravessar um corredor sob mira."),
  pixel(MAPA.lotus, AGENTE.sova, HAB.sova.rastreadora, "ataque",
    [0.228, 0.535] /* C Principal */, [0.148, 0.437] /* C Ponto */,
    "Flecha Rastreadora no C antes de comprometer",
    "No Lotus a pior decisão é entrar no ponto errado com o time inteiro. A flecha no C responde se dá para ir ali antes de gastar utilidade."),
  pixel(MAPA.lotus, AGENTE.viper, HAB.viper.veneno, "defesa",
    [0.148, 0.437] /* C Ponto */, [0.228, 0.535] /* C Principal */,
    "Veneno de Cobra atrasando a entrada do C",
    "O Veneno de Cobra é Grenade e faz dano contínuo: na boca do Principal obriga o atacante a esperar ou entrar machucado. Serve ao C justamente porque ali o defensor precisa comprar tempo."),
  pixel(MAPA.lotus, AGENTE.killjoy, HAB.killjoy.torreta, "defesa",
    [0.503, 0.459] /* B Ponto */, [0.451, 0.567] /* B Principal */,
    "Torreta olhando a entrada do B",
    "A Torreta é Ability2 e vigia sozinha enquanto você joga em outro ponto. Num mapa de três pontos isso vale mais do que o dano que ela dá."),

  /* -------------------------------------------------------------------- Pearl -- */
  posicao(MAPA.pearl, "ataque", [0.527, 0.549] /* Meio Portas */,
    "As Portas abrem o mapa inteiro",
    "O Pearl não tem teleporte nem corda, então o meio é a única conexão rápida entre A e B. Tomar as Portas obriga a defesa a reagir em vez de esperar."),
  posicao(MAPA.pearl, "ataque", [0.779, 0.419] /* A Principal */,
    "Entrada do A pelo Principal",
    "O corredor do Principal é longo e o defensor olha do Bunker e do Link. Não atravesse sem fechar pelo menos um dos dois."),
  posicao(MAPA.pearl, "defesa", [0.937, 0.318] /* A Bunker */,
    "Bunker: o ângulo caro do A",
    "Do Bunker o defensor pega o Principal inteiro. É forte e é esperado, então o ataque traz utilidade para ele; troque de lugar depois do primeiro contato."),
  posicao(MAPA.pearl, "defesa", [0.258, 0.464] /* B Ponto */,
    "Defender o B de dentro do ponto",
    "O B tem entradas pelo Principal, pela Rampa e pelo Link. Segurar de dentro é o que cobre as três ao mesmo tempo, em vez de apostar numa."),
  posicao(MAPA.pearl, "defesa", [0.621, 0.444] /* Meio Passagem */,
    "Negar o meio pela Passagem",
    "Se o ataque toma o meio sem resistência, as rotações ficam curtas para ele e longas para você. Um defensor na Passagem já o força a gastar utilidade."),
  pixel(MAPA.pearl, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.779, 0.419] /* A Principal */, [0.937, 0.318] /* A Bunker */,
    "Fumaça no Bunker para atravessar o Principal",
    "É a fumaça que torna o corredor do A jogável. Sem ela, a entrada pelo Principal depende de o defensor errar o tiro."),
  pixel(MAPA.pearl, AGENTE.astra, HAB.astra.nebulosa, "ataque",
    [0.455, 0.702] /* Meio Praça */, [0.527, 0.549] /* Meio Portas */,
    "Nebulosa nas Portas para tomar o meio",
    "A estrela fica posta na Praça desde o começo da rodada; ative quando o time for atravessar. O meio do Pearl é briga de tiro limpa, e a fumaça é o que a desfaz."),
  pixel(MAPA.pearl, AGENTE.harbor, HAB.harbor.enseada, "ataque",
    [0.139, 0.600] /* B Principal */, [0.258, 0.464] /* B Ponto */,
    "Enseada cobrindo a entrada do B",
    "A Enseada é a bolha de água do Harbor: cobre o ponto e segura tiro e flecha enquanto o time entra. Vale quando a entrada é larga como a do B."),
  pixel(MAPA.pearl, AGENTE.cypher, HAB.cypher.camera, "defesa",
    [0.258, 0.464] /* B Ponto */, [0.139, 0.600] /* B Principal */,
    "Câmera de Vigilância olhando o Principal do B",
    "A Câmera é Ability2 e deixa ver o B enquanto você joga o meio. Num mapa de rotação longa como o Pearl, a informação vale mais do que o corpo parado no ponto."),
  pixel(MAPA.pearl, AGENTE.viper, HAB.viper.cortina, "ataque",
    [0.455, 0.702] /* Meio Praça */, [0.527, 0.549] /* Meio Portas */,
    "Cortina Tóxica dividindo o meio",
    "A Cortina atravessa o meio inteiro e separa o lado que você ataca do lado de onde viria a ajuda. Suba antes de a rodada esquentar, porque leva tempo."),

  /* ------------------------------------------------------------------- Sunset -- */
  posicao(MAPA.sunset, "ataque", [0.406, 0.562] /* Meio Pátio */,
    "O Pátio é o meio que liga os dois pontos",
    "Do Pátio o ataque ameaça A e B e vê a rotação da defesa. É o lugar que decide a rodada no Sunset, e é por isso que a defesa o disputa cedo."),
  posicao(MAPA.sunset, "ataque", [0.672, 0.547] /* A Principal */,
    "Entrada do A pelo Principal",
    "O Principal chega ao A por baixo do Link. Entre com o time junto: separado, cada um aparece sozinho no mesmo ângulo."),
  posicao(MAPA.sunset, "defesa", [0.734, 0.344] /* A Link */,
    "Link: o ângulo de cima sobre o A",
    "Do Link o defensor pega quem entra no A pelo Principal e pelo Acesso. É a posição que o ataque precisa fumaçar, então espere utilidade nela."),
  posicao(MAPA.sunset, "defesa", [0.235, 0.531] /* B Mercado */,
    "Segurar o B pelo Mercado",
    "O Mercado cobre a aproximação ao B sem ficar dentro do ponto. Tenha um colega atrás: sozinho ali você é cercado pelo Acesso."),
  posicao(MAPA.sunset, "defesa", [0.044, 0.562] /* B Ponto */,
    "Defender o B de dentro",
    "O B é o lado mais longe do Pátio, então a ajuda demora. Quem segura ali joga para atrasar e sobreviver, não para ganhar a briga sozinho."),
  pixel(MAPA.sunset, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.672, 0.547] /* A Principal */, [0.734, 0.344] /* A Link */,
    "Fumaça no Link para entrar no A",
    "O Link é o ângulo de cima que mata quem entra no A. Fechar com a Fumaça Celeste é o que torna a entrada pelo Principal possível."),
  pixel(MAPA.sunset, AGENTE.omen, HAB.omen.paranoia, "ataque",
    [0.406, 0.562] /* Meio Pátio */, [0.531, 0.656] /* Meio Ladrilhos */,
    "Paranoia atravessando os Ladrilhos",
    "A Paranoia é Ability1 e cega quem ela toca, atravessando parede. Jogada do Pátio para os Ladrilhos, abre a passagem do meio sem precisar ganhar o tiro."),
  pixel(MAPA.sunset, AGENTE.breach, HAB.breach.falha, "ataque",
    [0.297, 0.781] /* B Acesso */, [0.044, 0.562] /* B Ponto */,
    "Falha Tectônica varrendo o B",
    "A Falha Tectônica é Ability2 e atravessa o chão, atordoando quem estiver no caminho. Dispare do Acesso em direção ao ponto logo antes de o time entrar."),
  pixel(MAPA.sunset, AGENTE.killjoy, HAB.killjoy.nanoenxame, "defesa",
    [0.672, 0.547] /* A Principal */, [0.750, 0.438] /* A Ponto */,
    "Nanoenxame guardando o A plantado",
    "Deixe o enxame onde a spike costuma ficar e ative na hora de desarmarem. Guarde um segundo enxame: o primeiro costuma ser gasto cedo demais."),
  pixel(MAPA.sunset, AGENTE.cypher, HAB.cypher.fio, "defesa",
    [0.235, 0.531] /* B Mercado */, [0.297, 0.781] /* B Acesso */,
    "Fio-armadilha no Acesso do B",
    "O Fio-armadilha é Grenade e avisa antes de o ataque chegar ao ponto. No B, onde a ajuda demora, esse aviso é o que dá tempo de rodar."),

  /* -------------------------------------------------------------------- Abyss -- */
  posicao(MAPA.abyss, "ataque", [0.543, 0.451] /* Meio Passarela */,
    "No Abyss não há parede: dá para cair",
    "O mapa não tem borda em boa parte das passagens, e empurrão e recuo mal calculado matam sem tiro. Atravesse a Passarela com o time olhando, não correndo."),
  posicao(MAPA.abyss, "ataque", [0.634, 0.192] /* A Principal */,
    "Entrada do A pelo Principal",
    "O Principal é a aproximação larga ao A. Traga utilidade para a Torre e o Duto, que são de onde a defesa olha a entrada."),
  posicao(MAPA.abyss, "defesa", [0.484, 0.152] /* A Ponto */,
    "Defender o A de dentro do ponto",
    "Com queda dos dois lados, posições avançadas no Abyss são arriscadas: recuar sob pressão derruba. Fique no ponto, onde o chão é inteiro."),
  posicao(MAPA.abyss, "defesa", [0.451, 0.526] /* Meio Biblioteca */,
    "A Biblioteca é o meio do Abyss",
    "Quem a segura vê o ataque escolher o lado e consegue avisar cedo. Jogue para a informação e recue para o ponto; brigar sozinho ali é cair ou morrer."),
  posicao(MAPA.abyss, "defesa", [0.405, 0.858] /* B Ponto */,
    "Defender o B de dentro",
    "O B tem entrada pelo Principal, pelo Acesso e pelo Link. De dentro você cobre as três e não corre risco de ser empurrado para fora."),
  pixel(MAPA.abyss, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.634, 0.192] /* A Principal */, [0.490, 0.255] /* A Torre */,
    "Fumaça na Torre para entrar no A",
    "A Torre olha o A de cima. Fechada, a entrada pelo Principal deixa de ser atravessada por um ângulo que você não vê."),
  pixel(MAPA.abyss, AGENTE.kayo, HAB.kayo.fragmento, "ataque",
    [0.624, 0.860] /* B Principal */, [0.405, 0.858] /* B Ponto */,
    "FRAG/mento limpando o B plantado",
    "O FRAG/mento é Grenade e faz dano em área por alguns segundos. Jogado no ponto, tira quem está colado na spike sem você precisar entrar."),
  pixel(MAPA.abyss, AGENTE.sova, HAB.sova.choque, "ataque",
    [0.543, 0.451] /* Meio Passarela */, [0.451, 0.526] /* Meio Biblioteca */,
    "Flecha de Choque na Biblioteca",
    "A Flecha de Choque é Ability1 e faz dano, não revela. Serve para tirar quem segura a Biblioteca de um canto fechado antes de o time atravessar."),

  /* ------------------------------------------------------------------ Corrode -- */
  posicao(MAPA.corrode, "ataque", [0.538, 0.491] /* Meio Flor */,
    "O meio do Corrode liga os dois pontos",
    "Da Flor saem as Escadas e o Patamar, que descem para os dois lados. Tomar o meio aqui encurta a sua rotação e alonga a da defesa."),
  posicao(MAPA.corrode, "ataque", [0.612, 0.085] /* A Principal */,
    "Entrada do A pelo Principal",
    "O Principal é a entrada larga do A, com o Pátio logo à frente. Entre com o time junto e com o Link coberto."),
  posicao(MAPA.corrode, "ataque", [0.579, 0.690] /* B Principal */,
    "Entrada do B pelo Principal",
    "O B se ataca pelo Principal com apoio do Acesso. A Torre e o Arco são de onde a defesa costuma olhar; conte com eles ocupados."),
  posicao(MAPA.corrode, "defesa", [0.398, 0.258] /* A Ponto */,
    "Defender o A de dentro do ponto",
    "O A recebe o Principal, o Acesso e a Portinha. Segurar de dentro é o que cobre as três entradas sem apostar em uma."),
  posicao(MAPA.corrode, "defesa", [0.444, 0.690] /* B Ponto */,
    "Defender o B de dentro do ponto",
    "Mesma lógica do A: com três acessos, a posição que cobre todas é o próprio ponto. Avançar só com o time avisado."),
  pixel(MAPA.corrode, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.612, 0.085] /* A Principal */, [0.453, 0.375] /* A Link */,
    "Fumaça no Link para entrar no A",
    "O Link liga o A ao meio e é por onde chega a ajuda. Fechá-lo na entrada isola quem está no ponto pelo tempo da fumaça."),
  pixel(MAPA.corrode, AGENTE.viper, HAB.viper.nuvem, "ataque",
    [0.579, 0.690] /* B Principal */, [0.398, 0.590] /* B Link */,
    "Nuvem Venenosa no Link do B",
    "A Nuvem Venenosa é Ability1, não Ability2: é a bola que você relança na rodada, diferente da Cortina. No Link do B ela segura a rotação enquanto o time entra."),

  /* ------------------------------------------------------------------- Summit -- */
  posicao(MAPA.summit, "ataque", [0.511, 0.553] /* Meio Fonte */,
    "A Fonte é o meio do Summit",
    "Dela saem o Desvio para o A e os Ladrilhos para o B. Controlar a Fonte é o que deixa o ataque decidir tarde para onde vai."),
  posicao(MAPA.summit, "ataque", [0.694, 0.566] /* A Principal */,
    "Entrada do A pelo Principal",
    "O Principal sobe para o A com o Saguão ao lado. Não suba sem cobrir o Jardim e o Link, que olham a subida."),
  posicao(MAPA.summit, "ataque", [0.186, 0.491] /* B Principal */,
    "Entrada do B pelo Principal",
    "O B se ataca pelo Principal com o Saguão como apoio. A Torre e o Troféu são as posições que a defesa costuma ocupar."),
  posicao(MAPA.summit, "defesa", [0.917, 0.403] /* A Ponto */,
    "Defender o A de dentro do ponto",
    "O A tem o Principal, o Salão e a Caverna chegando nele. De dentro você cobre as três; avançado, cobre uma e perde o plant."),
  posicao(MAPA.summit, "defesa", [0.151, 0.338] /* B Ponto */,
    "Defender o B de dentro do ponto",
    "O B é o lado mais longe da Fonte, então a ajuda demora mais. Jogue pelo tempo: atrase, avise e espere o time."),
  pixel(MAPA.summit, AGENTE.brimstone, HAB.brimstone.fumaca, "ataque",
    [0.694, 0.566] /* A Principal */, [0.792, 0.403] /* A Jardim */,
    "Fumaça no Jardim para subir no A",
    "O Jardim é de onde o defensor pega quem sobe pelo Principal. Feche antes de o time começar a subida, não no meio dela."),
  pixel(MAPA.summit, AGENTE.sova, HAB.sova.rastreadora, "ataque",
    [0.331, 0.416] /* B Link */, [0.151, 0.338] /* B Ponto */,
    "Flecha Rastreadora no B antes de entrar",
    "Do Link a flecha cobre o ponto. No Summit, onde a rotação pela Fonte é rápida, saber que o B está vazio vale a rodada inteira."),
];
