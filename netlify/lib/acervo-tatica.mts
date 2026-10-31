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
 * Mapas em que o autor tem menos segurança (Fracture, Pearl, Lotus, Sunset,
 * Abyss, Corrode e Summit) têm só posições genéricas de ataque e defesa.
 */

import type { Ponto } from "./tatica.mts";

export type PontoAcervo = Omit<Ponto, "id" | "criadoEm">;

// UUIDs de /v1/maps e /v1/agents (valorant-api.com).
const MAPA = {
  ascent: "7eaecc1b-4337-bbf6-6ab9-04b8f06b3319",
  split: "d960549e-485c-e861-8d71-aa9d1aed12a2",
  fracture: "b529448b-4d60-346e-e89e-00a4c527a405",
  bind: "2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba",
  breeze: "2fb9a4fd-47b8-4e7d-a969-74b4046ebd53",
  abyss: "224b0a95-48b9-f703-1bd8-67aca101a61f",
  lotus: "2fe4ed3a-450a-948b-6d6b-e89a78e680a9",
  sunset: "92584fbe-486a-b1b2-9faa-39b0f486b498",
  pearl: "fd267378-4d1d-484f-ff52-77821ed10dc2",
  summit: "756da597-416b-c0f2-f47b-afbdf28670bc",
  icebox: "e2ad5c54-4114-a870-9641-8ea21279579a",
  corrode: "1c18ab1f-420d-0d8b-71d0-77ad3c439115",
  haven: "2bee0dc9-4ffe-519b-1cbd-7fbe763a6047",
} as const;

const AGENTE = {
  clove: "1dbf2edd-4729-0984-3115-daa5eed44993",
  brimstone: "9f0d8ba9-4140-b941-57d3-a7ad57c6b417",
  viper: "707eab51-4836-f488-046a-cda6bf494859",
  omen: "8e253930-4c05-31dd-1b6c-968525494517",
  astra: "41fb69c1-4189-7b37-f117-bcaf1e96f1bf",
} as const;

// Slot da smoke de cada agente, lido de `abilities` na API.
const SMOKE = {
  clove: "Ability2", // Artimanha
  brimstone: "Ability2", // Fumaça Celeste
  omen: "Ability2", // Manto Sombrio
  astra: "Ability2", // Nebulosa
} as const;

type Par = readonly [number, number];
const c = ([x, y]: Par) => ({ x, y });

/** Onde ficar, sem lançar nada. Sem agente, vale como posição genérica do mapa. */
function posicao(
  mapa: string, lado: Ponto["lado"], de: Par, titulo: string, texto: string, agente: string | null = null,
): PontoAcervo {
  return {
    mapa, agente, habilidade: null, lado, tipo: "posicao",
    de: c(de), para: null, titulo, texto, imagens: [], video: null, conferido: false,
  };
}

/** De onde a pessoa age e onde a util cai. */
function pixel(
  mapa: string, agente: string, habilidade: string, lado: Ponto["lado"],
  de: Par, para: Par, titulo: string, texto: string,
): PontoAcervo {
  return {
    mapa, agente, habilidade, lado, tipo: "pixel",
    de: c(de), para: c(para), titulo, texto, imagens: [], video: null, conferido: false,
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
  pixel(MAPA.ascent, AGENTE.brimstone, SMOKE.brimstone, "ataque",
    [0.603, 0.259] /* A Acesso */, [0.398, 0.295] /* A Árvore */,
    "Fumaça na Árvore para entrar no A",
    "A Fumaça Celeste é posta pelo mapa, então o Brimstone nem precisa estar perto: fique no Acesso e feche a Árvore, que tira a visão dos defensores que seguram o A pelo lado do meio. O time entra pelo Principal enquanto a fumaça dura."),
  pixel(MAPA.ascent, AGENTE.astra, SMOKE.astra, "ataque",
    [0.665, 0.380] /* Meio Topo */, [0.525, 0.411] /* Meio Passarela */,
    "Nebulosa na Passarela para tomar o meio",
    "Posicione a estrela na Passarela antes da rodada começar e ative quando o time for atravessar o meio. A Nebulosa corta a linha de quem segura o outro lado da Passarela."),
  pixel(MAPA.ascent, AGENTE.omen, SMOKE.omen, "defesa",
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
  pixel(MAPA.split, AGENTE.brimstone, SMOKE.brimstone, "ataque",
    [0.650, 0.166] /* A Acesso */, [0.472, 0.360] /* A Rampas */,
    "Fumaça nas Rampas para entrar no A",
    "As Rampas dão ao defensor uma linha de cima sobre quem entra no A. Fechar essa linha com a Fumaça Celeste, ainda do Acesso, deixa o time chegar ao ponto com menos gente olhando."),

  /* --------------------------------------------------------------------- Bind -- */
  posicao(MAPA.bind, "ataque", [0.624, 0.497] /* A Curto */,
    "Entrada do A pelo Curto",
    "O Curto é o caminho mais direto ao A. Entre com utilidade nos dois cantos de onde o defensor segura, o Banheiro e as Luzes, e só depois com o time."),
  pixel(MAPA.bind, AGENTE.brimstone, SMOKE.brimstone, "ataque",
    [0.624, 0.497] /* A Curto */, [0.582, 0.339] /* A Luzes */,
    "Fumaça nas Luzes para entrar no A",
    "As Luzes ficam logo acima do Curto e dão ao defensor uma linha para quem sobe. Feche com a Fumaça Celeste antes da entrada."),
  pixel(MAPA.bind, AGENTE.astra, SMOKE.astra, "ataque",
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
  pixel(MAPA.haven, AGENTE.brimstone, SMOKE.brimstone, "ataque",
    [0.664, 0.766] /* C Acesso */, [0.493, 0.629] /* C Garagem */,
    "Fumaça na Garagem para entrar no C",
    "A Garagem é de onde o defensor segura o C de cima. Fechar a Garagem com a Fumaça Celeste, a partir do Acesso do C, deixa o time entrar no ponto sem esse ângulo."),
  pixel(MAPA.haven, AGENTE.clove, SMOKE.clove, "ataque",
    [0.664, 0.766] /* C Acesso */, [0.419, 0.643] /* C Janela */,
    "Artimanha na Janela do C",
    "Complementa a fumaça na Garagem: a Janela é o outro ângulo de cima sobre o C. A Artimanha também é posta pelo mapa, a partir do Acesso."),

  /* ------------------------------------------------------------------- Icebox -- */
  posicao(MAPA.icebox, "ataque", [0.552, 0.470] /* B Tubo */,
    "Entrada do B pelo Tubo",
    "O Tubo liga o meio ao B. Quem toma o Tubo abre uma segunda frente para o B e obriga o defensor a olhar para dois lados."),
  posicao(MAPA.icebox, "ataque", [0.399, 0.823] /* A Esteira */,
    "Entrada do A pela Esteira",
    "A Esteira é o caminho do ataque até o A. Mantenha o time junto antes de subir, porque o defensor vê a entrada de vários ângulos de cima."),
  pixel(MAPA.icebox, AGENTE.brimstone, SMOKE.brimstone, "ataque",
    [0.399, 0.823] /* A Esteira */, [0.700, 0.672] /* A Tela */,
    "Fumaça na Tela para entrar no A",
    "A Tela fica acima do ponto e é um dos ângulos de cima mais usados pela defesa. Fechar a Tela com a Fumaça Celeste tira essa linha de quem entra."),
  posicao(MAPA.icebox, "defesa", [0.745, 0.143] /* B Boneco de Neve */,
    "Defender o B pelo Boneco de Neve",
    "O Boneco de Neve fica no canto do B. Segure ali perto do time e mude de ângulo depois de abrir fogo."),
  posicao(MAPA.icebox, "ataque", [0.646, 0.180] /* B Ponto */,
    "Viper no pós-plant do B",
    "Depois de plantar no B, a Viper usa a Cortina Tóxica para cortar a visão de quem tenta desarmar e o Poço Peçonhento para punir quem entra na área da bomba. Planta e sai da linha de visão do defensor antes de usar.",
    AGENTE.viper),

  /* ------------------------------------------------------------------- Breeze -- */
  posicao(MAPA.breeze, "ataque", [0.498, 0.541] /* Meio Pilar */,
    "Meio aberto: briga de longa distância",
    "O meio do Breeze tem longas linhas de visão. Com o Pilar como cobertura, o atacante pode disputar à distância sem se expor, e a utilidade deve cobrir o corredor depois dele."),
  posicao(MAPA.breeze, "defesa", [0.364, 0.382] /* B Túnel */,
    "Segurar o B pelo Túnel",
    "O Túnel é de onde o defensor fecha a rota do meio ao B. Segure com um colega por perto, porque é uma saída fácil de isolar."),
  pixel(MAPA.breeze, AGENTE.brimstone, SMOKE.brimstone, "ataque",
    [0.763, 0.683] /* A Loja */, [0.847, 0.469] /* A Pirâmides */,
    "Fumaça nas Pirâmides para entrar no A",
    "As Pirâmides dão cobertura ao defensor do A. Feche-as com a Fumaça Celeste a partir da Loja, antes de o time entrar no ponto."),

  /* ----------------------------------------------- Mapas só com posições gerais -- */
  posicao(MAPA.fracture, "ataque", [0.826, 0.697] /* A Principal */,
    "Entrar no A pelo Principal",
    "Posição genérica. No Fracture o ataque pode vir de dois lados e a defesa fica no meio; o A Principal é a entrada do ataque ao ponto A. Confira a rota no jogo antes de repetir."),
  posicao(MAPA.fracture, "defesa", [0.293, 0.504] /* B Gerador */,
    "Defender o B pelo Gerador",
    "Posição genérica. O Gerador fica na frente do B e dá ao defensor uma linha para quem chega. Defenda perto do time."),

  posicao(MAPA.pearl, "ataque", [0.455, 0.702] /* Meio Praça */,
    "Meio: a Praça",
    "Posição genérica. A Praça é a boca do meio do Pearl; quem a controla ameaça o A e o B sem se comprometer."),
  posicao(MAPA.pearl, "defesa", [0.527, 0.549] /* Meio Portas */,
    "Meio: as Portas",
    "Posição genérica. As Portas do meio dão ao defensor uma leitura do ataque antes de ele escolher o ponto. Não segure sozinho."),

  posicao(MAPA.lotus, "ataque", [0.503, 0.661] /* B Pilares */,
    "B pelos Pilares",
    "Posição genérica. Os Pilares são a entrada do ataque ao B, no meio do Lotus. Com três pontos, escolha o B depois de ver onde a defesa está."),
  posicao(MAPA.lotus, "defesa", [0.564, 0.365] /* B Superior */,
    "Defender o B por cima",
    "Posição genérica. O B Superior fica dentro da área do B, longe da entrada do ataque. Segure com o time por perto."),

  posicao(MAPA.sunset, "ataque", [0.406, 0.562] /* Meio Pátio */,
    "Meio: o Pátio",
    "Posição genérica. O Pátio é o centro do Sunset; controlar o meio abre os dois pontos."),
  posicao(MAPA.sunset, "defesa", [0.235, 0.531] /* B Mercado */,
    "Defender o B pelo Mercado",
    "Posição genérica. O Mercado dá ao defensor do B uma leitura da entrada. Segure com um colega."),

  posicao(MAPA.abyss, "ataque", [0.543, 0.451] /* Meio Passarela */,
    "Meio pela Passarela",
    "Posição genérica. A Passarela cruza o meio. O Abyss não tem muro nas bordas, então cuidado com as quedas ao disputar ângulo."),
  posicao(MAPA.abyss, "defesa", [0.451, 0.526] /* Meio Biblioteca */,
    "Meio defensivo pela Biblioteca",
    "Posição genérica. A Biblioteca fica no meio e dá ao defensor um ponto de leitura. Cuidado com as quedas nas bordas."),

  posicao(MAPA.corrode, "ataque", [0.708, 0.197] /* A Acesso */,
    "Acesso do A",
    "Posição genérica. O Acesso do A é onde o ataque se junta antes de entrar. Entre com o time e com utilidade."),
  posicao(MAPA.corrode, "defesa", [0.398, 0.258] /* A Ponto */,
    "Defender o A perto do ponto",
    "Posição genérica. Na defesa, fique perto do ponto e do time. Ainda não há um canto de referência testado para este mapa."),

  posicao(MAPA.summit, "ataque", [0.694, 0.741] /* A Saguão */,
    "Saguão do A",
    "Posição genérica. O Saguão do A é onde o ataque se junta antes de entrar. Entre com o time e com utilidade."),
  posicao(MAPA.summit, "defesa", [0.151, 0.338] /* B Ponto */,
    "Defender o B perto do ponto",
    "Posição genérica. Na defesa, fique perto do ponto e do time. Ainda não há um canto de referência testado para este mapa."),
];
