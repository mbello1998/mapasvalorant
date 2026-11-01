/* ==========================================================================
   O texto dos mapas.

   A base da Riot não tem descrição de mapa: `narrativeDescription` vem vazia
   em todas as entradas e `tacticalDescription` é só "Pontos A/B". Os agentes
   têm um parágrafo de verdade vindo da API, e os mapas apareciam no site com
   duas palavras. Então o texto é daqui — escrito à mão, um por mapa, sobre
   como o mapa se joga, que é o que interessa a quem vai treinar nele.

   Chave é o uuid, não o nome: `displayName` muda de idioma, o uuid não.

   Este arquivo não toca no documento: os testes do Node o exercitam direto.
   ========================================================================== */

/** Os cinco uuids das arenas de duelo. São o mesmo galpão com as caixas
 *  trocadas de lugar e a mesma arte, e cinco cartões iguais na grade só
 *  ocupavam espaço: viram um. */
export const UUIDS_DUELO = [
  "a9009649-421f-d5d5-f80c-0cbe02c125bb", // Duelo A
  "a38a3f9a-4042-844c-8970-a3ac2f7ce93d", // Duelo B
  "a264de0f-4a04-9c78-c97a-a6b192ce6e86", // Duelo C
  "1c7555fc-4bc6-3b98-9674-789d47ef6c50", // Duelo D
  "4490f1d6-4818-bf5f-9b3a-9c9a8dbb52ed", // Duelo E
];

/** O uuid do cartão único que fica no lugar das cinco arenas. */
export const DUELO = "duelo-arenas";

export const MAPAS_TEXTO = {
  "7eaecc1b-4337-bbf6-6ab9-04b8f06b3319": {
    nome: "Ascent",
    lugar: "Veneza, Itália",
    texto:
      "Dois sites abertos com um meio enorme no caminho dos dois: quem ganha o " +
      "meio escolhe para onde a rodada vai. Cada site tem um portão de metal " +
      "que a defesa pode fechar, e abrir à força é barulho que avisa a rodada " +
      "inteira.",
  },
  "d960549e-485c-e861-8d71-aa9d1aed12a2": {
    nome: "Split",
    lugar: "Tóquio, Japão",
    texto:
      "Corredores apertados e altura em todo lugar: duas torres de corda olham " +
      "de cima para os dois sites, e quase todo ataque precisa passar pelo " +
      "meio. Aqui ganhar altura vale mais do que ganhar espaço.",
  },
  "b529448b-4d60-346e-e89e-00a4c527a405": {
    nome: "Fracture",
    lugar: "Novo México, Estados Unidos",
    texto:
      "O mapa partido: o ataque entra pelos dois lados ao mesmo tempo e a " +
      "defesa nasce cercada no meio. Tirolesas passam por baixo e ligam um " +
      "lado ao outro, então o tiro pelas costas é parte do jogo, não um " +
      "descuido.",
  },
  "2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba": {
    nome: "Bind",
    lugar: "Rabat, Marrocos",
    texto:
      "Não tem meio: dois teleportes de mão única ligam os lados e são o " +
      "atalho dos dois times. O teleporte faz barulho ao ser usado, então " +
      "cada atalho é também uma informação entregue de graça.",
  },
  "2fb9a4fd-47b8-4e7d-a969-74b4046ebd53": {
    nome: "Breeze",
    lugar: "Mar do Caribe",
    texto:
      "Os espaços mais largos e as linhas de visão mais longas do jogo: rifle " +
      "e Operator decidem a rodada de longe. Sem fumaça para cortar a visão, " +
      "atravessar qualquer lugar aberto sai caro.",
  },
  "224b0a95-48b9-f703-1bd8-67aca101a61f": {
    nome: "Abyss",
    lugar: "Mar da Noruega",
    texto:
      "O mapa sem bordas: fora das plataformas e das pontes é o vazio, e cair " +
      "mata na hora. Empurrar alguém para fora conta como abate, e isso muda " +
      "a conta de toda briga perto da beirada.",
  },
  "2fe4ed3a-450a-948b-6d6b-e89a78e680a9": {
    nome: "Lotus",
    lugar: "Gates Ocidentais, Índia",
    texto:
      "Três sites para a defesa cobrir, com portas giratórias que fazem " +
      "barulho ao girar e uma parede que se quebra para abrir caminho. " +
      "Defesa espalhada, e a rodada se decide na rotação.",
  },
  "92584fbe-486a-b1b2-9faa-39b0f486b498": {
    nome: "Sunset",
    lugar: "Los Angeles, Estados Unidos",
    texto:
      "Mapa curto e direto, com um meio em T que decide qual site cai. Pouca " +
      "altura e distâncias pequenas: é briga de rifle em ângulos que todo " +
      "mundo já conhece, e a rotação de um site ao outro é rápida.",
  },
  "fd267378-4d1d-484f-ff52-77821ed10dc2": {
    nome: "Pearl",
    lugar: "Lisboa, Portugal",
    texto:
      "O mapa plano: nenhuma altura para ganhar, tudo se resolve no chão. Em " +
      "troca, o meio é grande e tem vários caminhos — a defesa precisa " +
      "dividir gente ali, e o ataque joga em cima de quem dividiu errado.",
  },
  "756da597-416b-c0f2-f47b-afbdf28670bc": {
    nome: "Summit",
    lugar: "Montanhas de Sonora, China",
    texto:
      "Dois sites, três faixas e um meio que manda na rodada, num mapa maior " +
      "que Ascent. A marca dele são as paredes que a defesa derruba no meio " +
      "da rodada: o desenho do mapa muda no meio do jogo e vale até o fim " +
      "daquela rodada.",
  },
  "e2ad5c54-4114-a870-9641-8ea21279579a": {
    nome: "Icebox",
    lugar: "Mar Ártico, Rússia",
    texto:
      "Caixote, canto e altura em toda parte, com tirolesa e passagens para " +
      "subir. As linhas de visão são curtas e cheias de obstáculo: é mapa de " +
      "mira e de duelo de perto, onde o primeiro tiro resolve.",
  },
  "1c18ab1f-420d-0d8b-71d0-77ad3c439115": {
    nome: "Corrode",
    lugar: "Mont-Saint-Michel, França",
    texto:
      "Dois sites e três faixas num desenho clássico, de defesa em camadas e " +
      "com lugar para recuar. O meio é simples de propósito: a Riot fez este " +
      "mapa para a rodada se decidir em posição e rotação, e não em despejo " +
      "de habilidade.",
  },
  "2bee0dc9-4ffe-519b-1cbd-7fbe763a6047": {
    nome: "Haven",
    lugar: "Butão",
    texto:
      "O mapa de três sites: a defesa tem menos gente em cada lugar e o " +
      "ataque escolhe onde sobrou espaço. Garagem e C ligam os lados, então " +
      "quem rotaciona na hora certa ganha o site antes de a briga começar.",
  },

  /* ----------------------------------------------------------------------
     Fora da fila competitiva. Estes mapas não têm `tacticalDescription` na
     base da Riot — não têm site de spike —, então nem o "Pontos A/B" eles
     mostravam: apareciam no site como um nome e uma foto.
     ---------------------------------------------------------------------- */

  "690b3ed2-4dff-945b-8223-6da834e30d24": {
    nome: "District",
    lugar: "Tóquio, Japão",
    modo: "Mata-mata por Equipes",
    texto:
      "Mata-mata montado a partir de Split: de um lado um corredor comprido, " +
      "que é corredor de sniper; do outro um prédio em ferradura que dá a " +
      "volta e domina o meio. Sem spike e sem rodada — vence quem chegar " +
      "primeiro à contagem de abates.",
  },
  "12452a9d-48c3-0b02-e7eb-0381c3520404": {
    nome: "Kasbah",
    lugar: "Marrocos",
    modo: "Mata-mata por Equipes",
    texto:
      "Mata-mata montado a partir de Bind: corredores fechados de " +
      "arquitetura norte-africana, com tudo desembocando no meio. É lá que " +
      "ficam as armas e os escudos, então é lá que a briga acontece o tempo " +
      "todo.",
  },
  "de28aa9b-4cbe-1003-320e-6cb3ec309557": {
    nome: "Piazza",
    lugar: "Itália",
    modo: "Mata-mata por Equipes",
    texto:
      "Mata-mata montado a partir de Ascent: uma praça italiana aberta no " +
      "meio, vigiada por ninhos de sniper dos dois lados. As cabanas em " +
      "volta existem para flanquear quem subiu nos ninhos.",
  },
  "2c09d728-42d5-30d8-43dc-96a05cc7ee9d": {
    nome: "Drift",
    lugar: "Mediterrâneo",
    modo: "Mata-mata por Equipes",
    texto:
      "O único mapa de mata-mata que não nasceu de outro: três faixas e " +
      "tirolesas que saem do meio e atravessam o mapa. Dá para trocar de " +
      "lado no meio da briga, então ninguém fica preso num canto.",
  },
  "d6336a5a-428f-c591-98db-c8a291159134": {
    nome: "Glitch",
    lugar: "Costa asiática",
    modo: "Mata-mata por Equipes",
    texto:
      "Mata-mata onde a altura manda no meio: quem sobe primeiro vê mais e " +
      "atira melhor. Premia quem se reposiciona depressa em vez de segurar " +
      "um canto, e as bordas do cenário piscam como imagem corrompida — daí " +
      "o nome.",
  },
  "dd3a1cd9-41b1-50ea-3bd6-a7bb3c5978bd": {
    nome: "Contenda",
    lugar: "Arena flutuante",
    modo: "Habilidades sorteadas",
    texto:
      "A arena do modo de habilidades sorteadas: ninguém escolhe agente, " +
      "cada um monta o seu com o que vem no sorteio. O cenário é feito de " +
      "pedaços de mapas conhecidos remontados fora de lugar, e não tem " +
      "spike nem site — é só a briga.",
  },
  "1f10dab3-4294-3827-fa35-c2aa00213cf3": {
    nome: "Treinamento Básico",
    lugar: "Tutorial",
    modo: "Tutorial",
    texto:
      "O mapa do tutorial: a sequência guiada que ensina a andar, atirar, " +
      "usar habilidade e plantar a spike. Não entra em fila nenhuma — " +
      "serve para a primeira partida de quem está começando.",
  },
  [DUELO]: {
    nome: "Duelo A/B/C/D/E",
    lugar: "Arena de duelo",
    modo: "Duelo 1 contra 1",
    texto:
      "As arenas do um contra um: um galpão fechado, meia dúzia de caixas e " +
      "nenhum lugar para onde correr. Sem utilidade, sem rotação e sem " +
      "ajuda — é mira, troca de tiro e quem reage primeiro. As cinco " +
      "variações, de A a E, dividem o mesmo galpão e mudam só o arranjo " +
      "das caixas; por isso aparecem aqui como um mapa só.",
  },
};

/**
 * A descrição de um mapa. Primeiro a nossa; se for um mapa que ainda não
 * escrevemos, o que a Riot tiver; e nada, se nem isso.
 */
export function descricaoDoMapa(mapa) {
  if (!mapa) return "";
  const nosso = MAPAS_TEXTO[mapa.uuid]?.texto;
  if (nosso) return nosso;
  return mapa.narrativeDescription || mapa.tacticalDescription || "";
}

/** Onde o mapa fica no mundo, quando sabemos. */
export function lugarDoMapa(mapa) {
  return (mapa && MAPAS_TEXTO[mapa.uuid]?.lugar) || "";
}

/**
 * A linha fina do cartão: o lugar e, depois, quantos sites o mapa tem. Mapa
 * fora da fila competitiva não tem site nenhum — a Riot deixa
 * `tacticalDescription` vazia —, e aí o que vale dizer é o modo em que ele é
 * jogado, senão o cartão fica com o nome e mais nada.
 */
export function metaDoMapa(mapa) {
  if (!mapa) return "";
  const modo = MAPAS_TEXTO[mapa.uuid]?.modo;
  return [lugarDoMapa(mapa), mapa.tacticalDescription || modo].filter(Boolean).join(" · ");
}

/**
 * Junta as cinco arenas de duelo num cartão só, no lugar da primeira delas.
 * O mapa devolvido é montado aqui e não existe na base da Riot: leva a arte
 * da primeira arena e o uuid do texto acima.
 */
export function juntarDuelos(mapas = []) {
  const arenas = mapas.filter((m) => UUIDS_DUELO.includes(m?.uuid));
  if (arenas.length < 2) return [...mapas];

  const [primeira] = arenas;
  const junto = {
    ...primeira,
    uuid: DUELO,
    displayName: MAPAS_TEXTO[DUELO].nome,
    // Nenhuma das cinco é "o" mapa, então nada de coordenada de uma só.
    coordinates: "",
  };

  const saida = [];
  for (const m of mapas) {
    if (m?.uuid === primeira.uuid) saida.push(junto);
    else if (!UUIDS_DUELO.includes(m?.uuid)) saida.push(m);
  }
  return saida;
}
