// Conteúdo inicial do site. O painel admin grava uma cópia editada no Netlify
// Blobs; este arquivo é o que aparece antes da primeira gravação e o que volta
// quando alguém usa "Restaurar padrão" no painel.
//
// Importado como módulo de propósito: arquivos lidos do disco em tempo de
// execução não entram no bundle da função.

export type Conteudo = typeof conteudoPadrao;

export const conteudoPadrao = {
  versaoSchema: 1,

  site: {
    nome: "Estande",
    sufixo: "BR",
    tagline: "Treino de mira e o que está no ar agora",
    descricao:
      "Aqueça a mira em três exercícios e veja o estado real do VALORANT no Brasil: patch no ar, ato em andamento e os lançamentos do dia.",
    urlCanonica: "",
  },

  tema: {
    aco: "#16262E",
    acoAlto: "#1F3845",
    linha: "#2E5361",
    luz: "#E9EDE6",
    sinal: "#FF4655",
    latao: "#D4A24C",
  },

  hero: {
    titulo: "Cinco alvos antes de entrar na fila",
    texto:
      "Ninguém entra em partida com a mão fria. Clique nos cinco alvos abaixo e veja seu tempo de reação agora — depois escolha um exercício completo.",
    rotuloCalibrar: "Começar calibração",
    rotuloRefazer: "Calibrar de novo",
    ctaPrimario: { rotulo: "Ir para o estande", href: "#estande" },
    ctaSecundario: { rotulo: "Ver o que mudou", href: "#lancamentos" },
    imagemFundo: "",
  },

  nav: [
    { rotulo: "Estande", href: "#estande" },
    { rotulo: "Linha de Tiro", href: "linha.html" },
    { rotulo: "Arsenal", href: "arsenal.html" },
    { rotulo: "Ranking", href: "ranking.html" },
    { rotulo: "Ao vivo", href: "#aovivo" },
    { rotulo: "Notícias", href: "#lancamentos" },
    { rotulo: "Agentes", href: "#agentes" },
    { rotulo: "Mapas", href: "#mapas" },
  ],

  estande: {
    titulo: "Sete exercícios, trinta segundos cada",
    texto:
      "Cada um treina um gesto diferente. Passe por todos uma vez e repita o que estiver pior.",
  },

  modos: [
    {
      id: "gridshot",
      nome: "Gridshot",
      objetivo: "Clique rápido",
      descricao:
        "Dois alvos sempre na tela. Estoure um e o próximo nasce em outro lugar. Treina a troca de alvo e a velocidade do clique.",
      icone: "",
      duracao: 30,
      metrica: "Alvos por segundo",
      destaque: true,
    },
    {
      id: "tracking",
      nome: "Tracking",
      objetivo: "Mira contínua",
      descricao:
        "Um alvo se move sem parar. Mantenha a mira em cima dele — não precisa clicar, o tempo conta sozinho. Treina o Vandal no corpo de quem está correndo.",
      icone: "",
      duracao: 30,
      metrica: "Tempo em alvo",
      destaque: false,
    },
    {
      id: "flick",
      nome: "Flick",
      objetivo: "Reação",
      descricao:
        "Um alvo por vez, em intervalo irregular. Treina o giro seco para quem apareceu do seu lado cego.",
      icone: "",
      duracao: 0,
      metrica: "Tempo de reação",
      destaque: false,
    },
    {
      id: "escolha",
      nome: "Escolha",
      objetivo: "Reação com decisão",
      descricao:
        "Quatro posições, uma acende por vez. De vez em quando quem acende é um aliado, em azul, e clicar nele custa 100 ms na sua média. Treina checar o ângulo e decidir antes de atirar.",
      icone: "",
      duracao: 30,
      metrica: "Tempo de reação",
      destaque: false,
    },
    {
      id: "microajuste",
      nome: "Microajuste",
      objetivo: "Correção fina",
      descricao:
        "Alvos pequenos nascendo perto de onde sua mira parou. Giro grande passa do ponto: o que resolve aqui é o ajuste curto, o de quando o inimigo já está quase na mira.",
      icone: "",
      duracao: 30,
      metrica: "Alvos por segundo",
      destaque: false,
    },
    {
      id: "correcao",
      nome: "Correção",
      objetivo: "Tracking reativo",
      descricao:
        "Um alvo que troca de direção sem avisar. Não precisa clicar, só manter a mira em cima. Treina reajustar contra quem fica trocando de lado em vez de correr reto.",
      icone: "",
      duracao: 30,
      metrica: "Tempo em alvo",
      destaque: false,
    },
    {
      id: "cabeca",
      nome: "Cabeça",
      objetivo: "Altura de headshot",
      descricao:
        "Silhuetas em tamanho de jogador. Só a cabeça conta — acertar o corpo é erro. Treina pôr a mira na linha da cabeça antes de o inimigo aparecer.",
      icone: "",
      duracao: 30,
      metrica: "Cabeças por segundo",
      destaque: false,
    },
  ],

  // Como o contador de presença aparece na página.
  //
  // "real" mostra a contagem de verdade: quem está com a aba aberta agora e
  // quantas pessoas passaram nas últimas 24 horas. "fixo" mostra o número que
  // você escrever aqui, com o rótulo que você escrever — a mesma lógica do
  // bloco de jogadores do VALORANT logo abaixo: o site publica o que o painel
  // diz, e a escolha do que dizer é sua.
  presenca: {
    modo: "real" as "real" | "fixo",
    valor: 9,
    rotulo: "Na comunidade",
    nota: "",
    mostrarHoje: true,
  },

  // A Riot nao publica quantas pessoas estao jogando agora — nao existe API
  // para isso, nem oficial nem de terceiros confiavel. O que da para dizer com
  // honestidade e o tamanho da base, e so se vier com fonte e data.
  jogadores: {
    rotulo: "Jogadores de VALORANT",
    valor: "",
    nota: "",
    fonte: "",
  },

  aovivo: {
    titulo: "O que está no ar",
    texto:
      "Lido direto dos servidores da Riot a cada carregamento desta página.",
  },

  lancamentos: {
    titulo: "Lançamentos e notas",
    texto: "O que você publica pelo painel aparece acima das notícias oficiais.",
    itens: [
      {
        data: "2026-10-23",
        tipo: "Patch",
        titulo: "Patch 13.09 no ar",
        resumo:
          "Build 13.09.00.5777412 subiu nos servidores brasileiros. Confira as notas oficiais antes de voltar à competitiva.",
        link: "https://playvalorant.com/pt-br/news/game-updates/",
        imagem: "",
      },
      {
        data: "2026-10-14",
        tipo: "Ato",
        titulo: "ATO VI começou",
        resumo:
          "Novo passe de batalha e reinício do ranque. O ato vai até 6 de janeiro de 2027.",
        link: "https://playvalorant.com/pt-br/",
        imagem: "",
      },
      {
        data: "2026-10-01",
        tipo: "Mapa",
        titulo: "Contenda entra na rotação",
        resumo:
          "O mapa já aparece na lista de partida rápida. Vale decorar os callouts antes de pegar na competitiva.",
        link: "",
        imagem: "",
      },
    ],
  },

  destaques: {
    titulo: "Em destaque",
    agenteUuid: "",
    mapaUuid: "",
    bundleUuid: "",
  },

  noticias: {
    titulo: "Direto do site oficial",
    texto:
      "Coletado de playvalorant.com a cada duas horas. O que você publica à mão aparece junto, no mesmo feed.",
    quantidade: 18,
    categoriasOcultas: [] as string[],
    idsOcultos: [] as string[],
  },

  arsenal: {
    titulo: "Arsenal",
    texto:
      "Mil quatrocentas e trinta e três skins com níveis, cromas e vídeo. Monte o loadout e veja quanto sai.",
    // Preço de referência por raridade, em VP. A API da Riot não expõe preço:
    // estes são os valores de tabela de skin avulsa, na mesma ordem de rank que
    // a própria Riot usa. Skin de passe, evento ou pacote exclusivo foge disso,
    // e o site diz quando é o caso.
    precos: {
      Select: 875,
      Deluxe: 1275,
      Premium: 1775,
      Exclusive: 2175,
      Ultra: 2475,
    } as Record<string, number>,
    // Faca custa o dobro da arma da mesma raridade: Premium 1775 vira 3550,
    // Exclusiva 2175 vira 4350, Ultra 2475 vira 4950. É a regra da loja.
    multiplicadorCorpoACorpo: 2,
    // O pacote de 1000 VP custa R$ 40 no Brasil. É daqui que sai a conversão
    // mostrada ao lado do preço em VP, e ela é só uma estimativa.
    vpPorReal: 25,
    moeda: "R$",
  },

  ranking: {
    titulo: "Ranking",
    texto:
      "O desempenho de quem treina aqui, com a patente que esse nível de mira costuma acompanhar no VALORANT.",
  },

  /**
   * Nível de conta: o que o painel pode afinar sem mexer em código.
   *
   * A curva tem a forma da do VALORANT — os primeiros níveis custam pouco e
   * sobem em degraus, depois o custo fica fixo. Os números são menores que os
   * do jogo porque a escala é outra: lá uma partida dura meia hora, aqui uma
   * sessão dura trinta segundos.
   */
  niveis: {
    xpBase: 60,
    xpPorIndice: 1.8,
    custoInicial: 400,
    degrau: 300,
    degraus: 4,
    custoFixo: 1600,
    cartoesACada: 2,
    xpPorDia: 15000,
    janelaSegundos: 15,
    /** Nível e borda ao lado do apelido na tabela pública. */
    mostrarNoRanking: true,
    /** O cartão do jogador aparecendo ao passar o mouse sobre o apelido. */
    cartaoNoHover: true,
    /** Se a pessoa pode escolher qual dos cartões liberados vai usar. */
    trocaDeCartaoLiberada: true,
    /** Cartão de quem ainda não tem nenhum. Vazio usa um fundo liso. */
    cartaoPadraoUuid: "",
  },

  linha: {
    titulo: "A Linha de Tiro",
    texto:
      "Escolha o agente, escolha a arma e a skin, e atire. Cadência, carregador, recarga e dano por distância vêm das estatísticas reais de cada arma.",
    duracao: 60,
    agentePadraoUuid: "",
    armaPadraoUuid: "",
    // A foto do campo de treino. Vazio usa a que vem no projeto.
    fundoUrl: "",
    // A faixa da tela de entrada. Vazio usa a que vem no projeto; se o arquivo
    // nao existir, o som sintetizado assume.
    musicaUrl: "",
  },

  agentes: {
    titulo: "Agentes em português",
    texto:
      "Trinta agentes com funções, habilidades e nomes como aparecem no cliente brasileiro.",
  },

  mapas: {
    titulo: "Mapas",
    texto: "Toda a rotação e os mapas fora dela, com a arte oficial.",
  },

  links: [
    { rotulo: "Notas de atualização", url: "https://playvalorant.com/pt-br/news/game-updates/" },
    { rotulo: "VCT Americas", url: "https://valorantesports.com/pt-BR" },
    { rotulo: "Status dos servidores", url: "https://status.riotgames.com/valorant?region=br" },
  ],

  rodape: {
    texto:
      "Estande é um projeto de fã. Dados de agentes, mapas e coleções vêm da valorant-api.com; patch e ato vêm do cliente da Riot.",
    aviso:
      "Não é afiliado nem endossado pela Riot Games. VALORANT e seus ativos são propriedade da Riot Games, Inc.",
  },

  midia: {} as Record<string, { nome: string; tipo: string; tamanho: number; criadoEm: string }>,
};
