export type Suit = "Pikk" | "Karo" | "Kor" | "Treff";

export type Card = {
  rank: number;
  suit: Suit;
  code: string;
};

export type HandScore = {
  category: number;
  tiebreakers: number[];
  bestCards: Card[];
};

export type MentalPokerParams = {
  p: number;
  g: number;
};

export type PlayerSecrets = {
  name: string;
  x: number;
  y: number;
};

export type PreparedGame = {
  params: MentalPokerParams;
  alice: PlayerSecrets;
  bob: PlayerSecrets;
  deck: number[];
  valueToCard: Map<number, Card>;
  rawIds: number[];
};

export type DrawRound = {
  seed: number;
  params: MentalPokerParams;
  alice: PlayerSecrets;
  bob: PlayerSecrets;
  deck: number[];
  valueToCard: Map<number, Card>;
  aliceCards: Card[];
  aliceValues: number[];
  bobCards: Card[];
  bobValues: number[];
  bobInitialCards: Card[];
  log: string[];
  phase: "draw" | "showdown";
  showdown?: {
    aliceScore: HandScore;
    bobScore: HandScore;
    winner: string;
  };
};

export type HoldemRound = {
  seed: number;
  params: MentalPokerParams;
  alice: PlayerSecrets;
  bob: PlayerSecrets;
  deck: number[];
  valueToCard: Map<number, Card>;
  aliceHole: Card[];
  bobHole: Card[];
  board: Card[];
  log: string[];
  phase: "preflop" | "flop" | "turn" | "river" | "betting" | "showdown" | "folded";
  showdown?: {
    aliceScore: HandScore;
    bobScore: HandScore;
    winner: string;
  };
};

export const PARAMS: MentalPokerParams = {
  p: 1_000_003,
  g: 2,
};

export const CATEGORY_NAMES = [
  "Magas lap",
  "Egy par",
  "Ket par",
  "Drill",
  "Sor",
  "Flush",
  "Full house",
  "Poker",
  "Szinsor",
];

const RANK_TEXT: Record<number, string> = {
  14: "A",
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
};

const RANK_ORDER = [14, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const SUIT_ORDER: Suit[] = ["Pikk", "Karo", "Kor", "Treff"];

export function rankText(rank: number) {
  return RANK_TEXT[rank];
}

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next() {
    this.state += 0x6d2b79f5;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  int(minInclusive: number, maxExclusive: number) {
    return Math.floor(this.next() * (maxExclusive - minInclusive)) + minInclusive;
  }

  shuffle<T>(items: T[]) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
}

export function randomSeed() {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}

function gcd(a: number, b: number) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

function invMod(a: number, m: number) {
  let oldR = a;
  let r = m;
  let oldS = 1;
  let s = 0;
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1) {
    throw new Error(`${a} has no inverse modulo ${m}`);
  }
  return ((oldS % m) + m) % m;
}

function powMod(base: number, exponent: number, modulus: number) {
  let result = 1;
  let b = base % modulus;
  let e = exponent;
  while (e > 0) {
    if (e % 2 === 1) {
      result = (result * b) % modulus;
    }
    b = (b * b) % modulus;
    e = Math.floor(e / 2);
  }
  return result;
}

export function choosePrivate(name: string, params: MentalPokerParams, rng: SeededRng): PlayerSecrets {
  const modulus = params.p - 1;
  while (true) {
    const x = rng.int(2, modulus);
    if (gcd(x, modulus) === 1) {
      return { name, x, y: invMod(x, modulus) };
    }
  }
}

export function playerShuffle(deck: number[], player: PlayerSecrets, params: MentalPokerParams, rng: SeededRng) {
  const shuffled = [...deck];
  rng.shuffle(shuffled);
  return shuffled.map((card) => powMod(card, player.x, params.p));
}

export function reveal(card: number, player: PlayerSecrets, params: MentalPokerParams) {
  return powMod(card, player.y, params.p);
}

export function revealMany(cards: number[], player: PlayerSecrets, params: MentalPokerParams) {
  return cards.map((card) => reveal(card, player, params));
}

function sampleUniqueIds(params: MentalPokerParams, rng: SeededRng) {
  const ids = new Set<number>();
  while (ids.size < 52) {
    ids.add(rng.int(Math.floor(params.p / 2) + 1, params.p - 1));
  }
  return [...ids];
}

function standardCards() {
  return SUIT_ORDER.flatMap((suit) =>
    RANK_ORDER.map((rank) => {
      return {
        rank,
        suit,
        code: `${rankText(rank)} ${suit}`,
      };
    }),
  );
}

export function createPublicDeck(params: MentalPokerParams, rng: SeededRng) {
  const rawIds = sampleUniqueIds(params, rng);
  const cards = standardCards();
  const valueToCard = new Map<number, Card>();
  const publicDeck = rawIds.map((rawId, index) => {
    const groupValue = powMod(params.g, rawId, params.p);
    valueToCard.set(groupValue, cards[index]);
    return groupValue;
  });
  return { rawIds, publicDeck, valueToCard };
}

export function prepareGame(seed = randomSeed(), params = PARAMS): PreparedGame {
  const rng = new SeededRng(seed);
  const { rawIds, publicDeck, valueToCard } = createPublicDeck(params, rng);
  const alice = choosePrivate("Alice", params, rng);
  const bob = choosePrivate("Bob", params, rng);
  const aliceLayer = playerShuffle(publicDeck, alice, params, rng);
  const deck = playerShuffle(aliceLayer, bob, params, rng);
  return { params, alice, bob, deck, valueToCard, rawIds };
}

export function take(deck: number[], count: number) {
  return deck.splice(0, count);
}

export function revealPrivateCards(
  encryptedCards: number[],
  owner: PlayerSecrets,
  helper: PlayerSecrets,
  params: MentalPokerParams,
  valueToCard: Map<number, Card>,
) {
  const helperOpened = revealMany(encryptedCards, helper, params);
  const values = revealMany(helperOpened, owner, params);
  const cards = values.map((value) => {
    const card = valueToCard.get(value);
    if (!card) {
      throw new Error(`unknown card value ${value}`);
    }
    return card;
  });
  return { values, cards };
}

function revealPublicCards(
  encryptedCards: number[],
  players: PlayerSecrets[],
  params: MentalPokerParams,
  valueToCard: Map<number, Card>,
) {
  const values = players.reduce((opened, player) => revealMany(opened, player, params), encryptedCards);
  return values.map((value) => {
    const card = valueToCard.get(value);
    if (!card) {
      throw new Error(`unknown board value ${value}`);
    }
    return card;
  });
}

export function newDrawRound(seed = randomSeed()): DrawRound {
  const prepared = prepareGame(seed);
  const deck = [...prepared.deck];
  const alice = revealPrivateCards(take(deck, 5), prepared.alice, prepared.bob, prepared.params, prepared.valueToCard);
  const bob = revealPrivateCards(take(deck, 5), prepared.bob, prepared.alice, prepared.params, prepared.valueToCard);
  return {
    seed,
    params: prepared.params,
    alice: prepared.alice,
    bob: prepared.bob,
    deck,
    valueToCard: prepared.valueToCard,
    aliceCards: alice.cards,
    aliceValues: alice.values,
    bobCards: bob.cards,
    bobValues: bob.values,
    bobInitialCards: [...bob.cards],
    phase: "draw",
    log: [
      `Deck prepared with ${prepared.rawIds.length} random ids where p/2 < d < p-1.`,
      "Alice shuffled and encrypted the public deck.",
      "Bob shuffled and encrypted Alice's deck.",
      "Private cards were opened through the two-step reveal flow.",
    ],
  };
}

function replaceCards(round: DrawRound, owner: PlayerSecrets, helper: PlayerSecrets, indexes: number[], hand: Card[], values: number[]) {
  if (indexes.length === 0) {
    return { oldCards: [] as Card[], newCards: [] as Card[] };
  }
  const encrypted = take(round.deck, indexes.length);
  const opened = revealPrivateCards(encrypted, owner, helper, round.params, round.valueToCard);
  const oldCards = indexes.map((index) => hand[index]);
  indexes.forEach((target, i) => {
    hand[target] = opened.cards[i];
    values[target] = opened.values[i];
  });
  return { oldCards, newCards: opened.cards };
}

export function completeDrawRound(round: DrawRound, aliceDiscards: number[]) {
  const next: DrawRound = {
    ...round,
    deck: [...round.deck],
    aliceCards: [...round.aliceCards],
    aliceValues: [...round.aliceValues],
    bobCards: [...round.bobCards],
    bobValues: [...round.bobValues],
    log: [...round.log],
  };

  const alice = replaceCards(next, next.alice, next.bob, aliceDiscards, next.aliceCards, next.aliceValues);
  const bobDiscards = chooseDrawDiscards(next.bobCards);
  const bob = replaceCards(next, next.bob, next.alice, bobDiscards, next.bobCards, next.bobValues);

  next.log.push(
    alice.oldCards.length > 0
      ? `Alice exchanged ${formatCards(alice.oldCards)} for ${formatCards(alice.newCards)}.`
      : "Alice stood pat.",
  );
  next.log.push(
    bob.oldCards.length > 0
      ? `Bob exchanged ${bob.oldCards.length} card${bob.oldCards.length === 1 ? "" : "s"}.`
      : "Bob stood pat.",
  );

  const aliceScore = evaluateFive(next.aliceCards);
  const bobScore = evaluateFive(next.bobCards);
  next.phase = "showdown";
  next.showdown = {
    aliceScore,
    bobScore,
    winner: winnerName(aliceScore, bobScore),
  };
  next.log.push("Showdown: both private exponents are opened.");
  return next;
}

export function newHoldemRound(seed = randomSeed()): HoldemRound {
  const prepared = prepareGame(seed);
  const deck = [...prepared.deck];
  const aliceHole = revealPrivateCards(take(deck, 2), prepared.alice, prepared.bob, prepared.params, prepared.valueToCard).cards;
  const bobHole = revealPrivateCards(take(deck, 2), prepared.bob, prepared.alice, prepared.params, prepared.valueToCard).cards;
  return {
    seed,
    params: prepared.params,
    alice: prepared.alice,
    bob: prepared.bob,
    deck,
    valueToCard: prepared.valueToCard,
    aliceHole,
    bobHole,
    board: [],
    phase: "preflop",
    log: [
      `Deck prepared with ${prepared.rawIds.length} random ids where p/2 < d < p-1.`,
      "Alice and Bob both shuffled and encrypted the shared deck.",
      "Hole cards were privately opened through the two-step reveal flow.",
    ],
  };
}

export function advanceHoldem(round: HoldemRound): HoldemRound {
  const next: HoldemRound = {
    ...round,
    deck: [...round.deck],
    board: [...round.board],
    log: [...round.log],
  };

  if (next.phase === "preflop") {
    next.board.push(...revealPublicCards(take(next.deck, 3), [next.alice, next.bob], next.params, next.valueToCard));
    next.phase = "flop";
    next.log.push("Flop was revealed by both players.");
    return next;
  }
  if (next.phase === "flop") {
    next.board.push(...revealPublicCards(take(next.deck, 1), [next.alice, next.bob], next.params, next.valueToCard));
    next.phase = "turn";
    next.log.push("Turn was revealed by both players.");
    return next;
  }
  if (next.phase === "turn") {
    next.board.push(...revealPublicCards(take(next.deck, 1), [next.alice, next.bob], next.params, next.valueToCard));
    next.phase = "river";
    next.log.push("River was revealed by both players.");
    return next;
  }
  if (next.phase === "river") {
    next.phase = "betting";
    next.log.push("Final bet is on the table.");
    return next;
  }
  return next;
}

export function finishHoldem(round: HoldemRound, called: boolean): HoldemRound {
  const next: HoldemRound = { ...round, log: [...round.log] };
  if (!called) {
    next.phase = "folded";
    next.log.push("Alice folded. Private exponents remain sealed.");
    return next;
  }

  const aliceScore = evaluateBest([...next.aliceHole, ...next.board]);
  const bobScore = evaluateBest([...next.bobHole, ...next.board]);
  next.phase = "showdown";
  next.showdown = {
    aliceScore,
    bobScore,
    winner: winnerName(aliceScore, bobScore),
  };
  next.log.push("Alice called. Both private exponents are opened.");
  return next;
}

function straightHigh(ranks: number[]) {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if ([14, 5, 4, 3, 2].every((rank) => unique.includes(rank))) {
    return 5;
  }
  for (let i = 0; i <= unique.length - 5; i += 1) {
    const window = unique.slice(i, i + 5);
    if (window[0] - window[4] === 4) {
      return window[0];
    }
  }
  return null;
}

function scoreKey(score: HandScore) {
  return [score.category, ...score.tiebreakers];
}

export function compareScores(a: HandScore, b: HandScore) {
  const left = scoreKey(a);
  const right = scoreKey(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return Math.sign(diff);
    }
  }
  return 0;
}

export function evaluateFive(cards: Card[]): HandScore {
  const ranks = cards.map((card) => card.rank).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  ranks.forEach((rank) => counts.set(rank, (counts.get(rank) ?? 0) + 1));
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const straight = straightHigh(ranks);

  if (flush && straight !== null) {
    return { category: 8, tiebreakers: [straight], bestCards: cards };
  }

  const fours = [...counts.entries()].filter(([, count]) => count === 4).map(([rank]) => rank);
  if (fours.length > 0) {
    const four = Math.max(...fours);
    return { category: 7, tiebreakers: [four, Math.max(...ranks.filter((rank) => rank !== four))], bestCards: cards };
  }

  const triples = [...counts.entries()]
    .filter(([, count]) => count === 3)
    .map(([rank]) => rank)
    .sort((a, b) => b - a);
  const pairs = [...counts.entries()]
    .filter(([, count]) => count === 2)
    .map(([rank]) => rank)
    .sort((a, b) => b - a);

  if (triples.length > 0 && pairs.length > 0) {
    return { category: 6, tiebreakers: [triples[0], pairs[0]], bestCards: cards };
  }
  if (flush) {
    return { category: 5, tiebreakers: ranks, bestCards: cards };
  }
  if (straight !== null) {
    return { category: 4, tiebreakers: [straight], bestCards: cards };
  }
  if (triples.length > 0) {
    const trip = triples[0];
    return { category: 3, tiebreakers: [trip, ...ranks.filter((rank) => rank !== trip)], bestCards: cards };
  }
  if (pairs.length >= 2) {
    const [highPair, lowPair] = pairs;
    return {
      category: 2,
      tiebreakers: [highPair, lowPair, Math.max(...ranks.filter((rank) => rank !== highPair && rank !== lowPair))],
      bestCards: cards,
    };
  }
  if (pairs.length === 1) {
    const pair = pairs[0];
    return { category: 1, tiebreakers: [pair, ...ranks.filter((rank) => rank !== pair)], bestCards: cards };
  }
  return { category: 0, tiebreakers: ranks, bestCards: cards };
}

export function evaluateBest(cards: Card[]) {
  let best: HandScore | null = null;
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const score = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(score, best) > 0) {
              best = score;
            }
          }
        }
      }
    }
  }
  if (!best) {
    throw new Error("at least five cards are required");
  }
  return best;
}

export function chooseDrawDiscards(cards: Card[]) {
  const score = evaluateFive(cards);
  if (score.category >= 4) {
    return [];
  }
  const counts = new Map<number, number>();
  cards.forEach((card) => counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1));

  if (score.category === 3) {
    const trip = [...counts.entries()].find(([, count]) => count === 3)![0];
    return cards.map((card, index) => (card.rank === trip ? -1 : index)).filter((index) => index >= 0);
  }
  if (score.category === 2) {
    const pairRanks = new Set([...counts.entries()].filter(([, count]) => count === 2).map(([rank]) => rank));
    return cards.map((card, index) => (pairRanks.has(card.rank) ? -1 : index)).filter((index) => index >= 0).slice(0, 1);
  }
  if (score.category === 1) {
    const pair = [...counts.entries()].find(([, count]) => count === 2)![0];
    return cards.map((card, index) => (card.rank === pair ? -1 : index)).filter((index) => index >= 0).slice(0, 3);
  }
  const suits = new Map<Suit, number>();
  cards.forEach((card) => suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1));
  const flushDraw = [...suits.entries()].find(([, count]) => count === 4);
  if (flushDraw) {
    return cards.map((card, index) => (card.suit === flushDraw[0] ? -1 : index)).filter((index) => index >= 0);
  }
  return [...cards]
    .map((card, index) => ({ card, index }))
    .sort((a, b) => a.card.rank - b.card.rank)
    .slice(0, 3)
    .map(({ index }) => index);
}

function winnerName(aliceScore: HandScore, bobScore: HandScore) {
  const result = compareScores(aliceScore, bobScore);
  if (result > 0) {
    return "Alice";
  }
  if (result < 0) {
    return "Bob";
  }
  return "Tie";
}

export function formatCards(cards: Card[]) {
  return cards.map((card) => card.code).join(", ");
}

export function scoreText(score: HandScore) {
  return `${CATEGORY_NAMES[score.category]} (${score.tiebreakers.map(rankText).join(" ")})`;
}

export function keyLine(player: PlayerSecrets, params: MentalPokerParams) {
  return `${player.name}: x=${player.x}, y=${player.y}, x*y mod (p-1)=${(player.x * player.y) % (params.p - 1)}`;
}
