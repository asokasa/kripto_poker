import {
  ArrowRight,
  CheckCircle2,
  Eye,
  KeyRound,
  LockKeyhole,
  RotateCcw,
  Shuffle,
  Sparkles,
  Trophy,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Card,
  PARAMS,
  PlayerSecrets,
  SeededRng,
  choosePrivate,
  compareScores,
  createPublicDeck,
  evaluateFive,
  formatCards,
  keyLine,
  playerShuffle,
  randomSeed,
  rankText,
  revealMany,
  scoreText,
  take,
} from "./mentalPoker";

type PlayerId = "alice" | "bob";
type GamePhase = "protocol" | "swap" | "readyShowdown" | "showdown";

type PlayerState = {
  secret: PlayerSecrets;
  encrypted: number[];
  helperOpened?: number[];
  values?: number[];
  cards?: Card[];
  selected: number[];
  swapOld?: Card[];
  swapNew?: Card[];
};

type GameState = {
  seed: number;
  params: typeof PARAMS;
  rawCount: number;
  valueToCard: Map<number, Card>;
  deck: number[];
  phase: GamePhase;
  step: number;
  activePlayer: PlayerId;
  alice: PlayerState;
  bob: PlayerState;
  log: string[];
};

const PLAYER_ORDER: PlayerId[] = ["alice", "bob"];

function otherPlayer(id: PlayerId): PlayerId {
  return id === "alice" ? "bob" : "alice";
}

function getPlayer(game: GameState, id: PlayerId) {
  return game[id];
}

function getCards(game: GameState, id: PlayerId) {
  return getPlayer(game, id).cards ?? [];
}

function visibleDeckCount(game: GameState) {
  if (game.phase === "protocol") {
    if (game.step <= 6) {
      return 52;
    }
    if (game.step === 7) {
      return 47;
    }
    return 42;
  }
  return game.deck.length;
}

function cardsFromValues(values: number[], valueToCard: Map<number, Card>) {
  return values.map((value) => {
    const card = valueToCard.get(value);
    if (!card) {
      throw new Error(`Ismeretlen kartyaertek: ${value}`);
    }
    return card;
  });
}

function createGame(seed = randomSeed(), names = { alice: "Alice", bob: "Bob" }): GameState {
  const rng = new SeededRng(seed);
  const { rawIds, publicDeck, valueToCard } = createPublicDeck(PARAMS, rng);
  const deck = [...publicDeck];
  rng.shuffle(deck);

  const alice = choosePrivate(names.alice || "Alice", PARAMS, rng);
  const bob = choosePrivate(names.bob || "Bob", PARAMS, rng);
  const aliceLayer = playerShuffle(deck, alice, PARAMS, rng);
  const encryptedDeck = playerShuffle(aliceLayer, bob, PARAMS, rng);
  const remainingDeck = [...encryptedDeck];
  const aliceEncrypted = take(remainingDeck, 5);
  const bobEncrypted = take(remainingDeck, 5);

  return {
    seed,
    params: PARAMS,
    rawCount: rawIds.length,
    valueToCard,
    deck: remainingDeck,
    phase: "protocol",
    step: 0,
    activePlayer: "alice",
    alice: {
      secret: alice,
      encrypted: aliceEncrypted,
      selected: [],
    },
    bob: {
      secret: bob,
      encrypted: bobEncrypted,
      selected: [],
    },
    log: ["Mental Poker: 5 lapos poker"],
  };
}

function appendLog(game: GameState, message: string) {
  game.log = [...game.log, message];
}

function advanceProtocol(game: GameState): GameState {
  const next: GameState = {
    ...game,
    log: [...game.log],
    alice: { ...game.alice },
    bob: { ...game.bob },
  };

  const alice = next.alice.secret.name;
  const bob = next.bob.secret.name;

  switch (next.step) {
    case 0:
      appendLog(next, `Parameterek kivalasztva: p=${next.params.p}, g=${next.params.g}.`);
      break;
    case 1:
      appendLog(next, `Deck elokeszitve: ${next.rawCount} nyers kartyaazonosito, mindegyikre p/2 < d < p-1.`);
      break;
    case 2:
      appendLog(next, "A publikus Deck lista elso korben meg lett keverve.");
      break;
    case 3:
      appendLog(next, "Mindket jatekos ervenyes veletlen privat x erteket valasztott.");
      break;
    case 4:
      appendLog(next, `${alice} meghivja a sajat shuffle fuggvenyet a kozos Deck-re.`);
      break;
    case 5:
      appendLog(next, `${bob} meghivja a sajat shuffle fuggvenyet a kozos Deck-re.`);
      break;
    case 6:
      appendLog(next, `${alice} valaszt 5 titkositott lapot a Deck-bol.`);
      break;
    case 7:
      appendLog(next, `${bob} valaszt 5 titkositott lapot a Deck-bol.`);
      break;
    case 8:
      appendLog(next, `${alice} atadja a titkositott lapjait ${bob} reszere reveal-re.`);
      break;
    case 9:
      next.alice.helperOpened = revealMany(next.alice.encrypted, next.bob.secret, next.params);
      appendLog(next, `${bob} meghivja a reveal(card) muveletet ezekre a lapokra, majd visszaadja oket.`);
      break;
    case 10: {
      const values = revealMany(next.alice.helperOpened ?? [], next.alice.secret, next.params);
      next.alice.values = values;
      next.alice.cards = cardsFromValues(values, next.valueToCard);
      appendLog(next, `${alice} meghivja a sajat reveal(card) muveletet, es megismeri a lapjait.`);
      break;
    }
    case 11:
      appendLog(next, `${bob} atadja a titkositott lapjait ${alice} reszere reveal-re.`);
      break;
    case 12:
      next.bob.helperOpened = revealMany(next.bob.encrypted, next.alice.secret, next.params);
      appendLog(next, `${alice} meghivja a reveal(card) muveletet ezekre a lapokra, majd visszaadja oket.`);
      break;
    case 13: {
      const values = revealMany(next.bob.helperOpened ?? [], next.bob.secret, next.params);
      next.bob.values = values;
      next.bob.cards = cardsFromValues(values, next.valueToCard);
      next.phase = "swap";
      appendLog(next, `${bob} meghivja a sajat reveal(card) muveletet, es megismeri a lapjait.`);
      appendLog(next, "Cserefazis: valts jatekost, es jelold ki, mely lapokat csereljek.");
      break;
    }
    default:
      break;
  }

  next.step += 1;
  return next;
}

function replaceForPlayer(game: GameState, id: PlayerId) {
  const player = getPlayer(game, id);
  const helper = getPlayer(game, otherPlayer(id));
  const selected = [...player.selected].sort((a, b) => a - b);
  const cards = [...(player.cards ?? [])];
  const values = [...(player.values ?? [])];

  if (selected.length === 0) {
    appendLog(game, `${player.secret.name} nem cserel lapot.`);
    player.selected = [];
    return;
  }

  const encryptedNew = take(game.deck, selected.length);
  const helperOpened = revealMany(encryptedNew, helper.secret, game.params);
  const openedValues = revealMany(helperOpened, player.secret, game.params);
  const newCards = cardsFromValues(openedValues, game.valueToCard);
  const oldCards = selected.map((index) => cards[index]);

  appendLog(game, `${player.secret.name} huz ${selected.length} uj titkositott lapot a Deck-bol.`);
  appendLog(game, `${player.secret.name} atadja az uj lapokat ${helper.secret.name} reszere reveal-re.`);
  appendLog(game, `${helper.secret.name} reveal(card) utan visszaadja az uj lapokat.`);
  appendLog(game, `${player.secret.name} sajat reveal(card) utan megismeri az uj lapokat: ${formatCards(newCards)}.`);
  appendLog(game, `${player.secret.name} csereje: ${formatCards(oldCards)} -> ${formatCards(newCards)}.`);

  selected.forEach((target, index) => {
    cards[target] = newCards[index];
    values[target] = openedValues[index];
  });
  player.cards = cards;
  player.values = values;
  player.selected = [];
  player.swapOld = oldCards;
  player.swapNew = newCards;
}

function applySwaps(game: GameState): GameState {
  const next: GameState = {
    ...game,
    deck: [...game.deck],
    log: [...game.log],
    alice: { ...game.alice, selected: [...game.alice.selected] },
    bob: { ...game.bob, selected: [...game.bob.selected] },
  };

  replaceForPlayer(next, "alice");
  replaceForPlayer(next, "bob");
  next.phase = "readyShowdown";
  appendLog(next, "A cserefazis lezart. Kovetkezik a mutatas.");
  return next;
}

function revealShowdown(game: GameState): GameState {
  const next: GameState = {
    ...game,
    log: [...game.log],
    alice: { ...game.alice },
    bob: { ...game.bob },
    phase: "showdown",
  };
  const aliceCards = getCards(next, "alice");
  const bobCards = getCards(next, "bob");
  const aliceScore = evaluateFive(aliceCards);
  const bobScore = evaluateFive(bobCards);
  appendLog(next, "Mutatas: a jatekosok felfedik a privat ertekeiket.");
  appendLog(next, keyLine(next.alice.secret, next.params));
  appendLog(next, keyLine(next.bob.secret, next.params));
  appendLog(next, `${next.alice.secret.name} vegso keze: ${formatCards(aliceCards)} -> ${scoreText(aliceScore)}.`);
  appendLog(next, `${next.bob.secret.name} vegso keze: ${formatCards(bobCards)} -> ${scoreText(bobScore)}.`);
  return next;
}

function CardView({
  card,
  hidden = false,
  selected = false,
  selectable = false,
  onClick,
}: {
  card?: Card;
  hidden?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onClick?: () => void;
}) {
  const red = card?.suit === "Karo" || card?.suit === "Kor";
  return (
    <button
      type="button"
      className={`playing-card ${hidden ? "is-hidden" : ""} ${selected ? "is-selected" : ""} ${red ? "is-red" : ""}`}
      onClick={onClick}
      disabled={!selectable}
      aria-pressed={selected}
    >
      {hidden || !card ? (
        <span className="card-back">
          <LockKeyhole size={24} />
          <span>g^xd</span>
        </span>
      ) : (
        <>
          <span className="corner">{card.suit}</span>
          <span className="rank-center">{rankText(card.rank)}</span>
          <span className="suit-center">{card.suit}</span>
          <span className="corner corner-bottom">{card.suit}</span>
        </>
      )}
    </button>
  );
}

function HandSection({
  playerId,
  game,
  active,
  onActivate,
  onToggle,
}: {
  playerId: PlayerId;
  game: GameState;
  active: boolean;
  onActivate: () => void;
  onToggle: (index: number) => void;
}) {
  const player = getPlayer(game, playerId);
  const cards = player.cards ?? [];
  const visible = game.phase === "showdown" || active || game.phase === "protocol";
  const canSelect = game.phase === "swap" && active;
  const placeholders = cards.length > 0 ? cards : Array.from({ length: 5 }, () => undefined);

  return (
    <section className={`player-lane ${active ? "is-active" : ""}`}>
      <button type="button" className="player-chip" onClick={onActivate}>
        <UserRound size={18} />
        <span>{player.secret.name}</span>
        <strong>{player.selected.length}/3</strong>
      </button>
      <div className="cards-row">
        {placeholders.map((card, index) => (
          <CardView
            key={`${playerId}-${card?.code ?? "hidden"}-${index}`}
            card={card}
            hidden={!card || !visible}
            selected={player.selected.includes(index)}
            selectable={canSelect}
            onClick={() => onToggle(index)}
          />
        ))}
      </div>
    </section>
  );
}

function ProtocolPanel({ game }: { game: GameState }) {
  return (
    <aside className="protocol">
      <div className="protocol-head">
        <Sparkles size={18} />
        <span>Protokoll</span>
      </div>
      <div className="params">
        <span>p={game.params.p}</span>
        <span>g={game.params.g}</span>
        <span>seed={game.seed}</span>
        <span>Deck={visibleDeckCount(game)}</span>
      </div>
      <ol>
        {game.log.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ol>
    </aside>
  );
}

function ActionBar({
  game,
  onNext,
  onApplySwaps,
  onShowdown,
  onNew,
}: {
  game: GameState;
  onNext: () => void;
  onApplySwaps: () => void;
  onShowdown: () => void;
  onNew: () => void;
}) {
  return (
    <div className="actions">
      <button type="button" className="icon-button primary" onClick={onNew}>
        <Shuffle size={18} />
        Uj leosztas
      </button>
      {game.phase === "protocol" && (
        <button type="button" className="icon-button call" onClick={onNext}>
          <ArrowRight size={18} />
          Kovetkezo esemeny
        </button>
      )}
      {game.phase === "swap" && (
        <button type="button" className="icon-button call" onClick={onApplySwaps}>
          <RotateCcw size={18} />
          Cserek vegrehajtasa
        </button>
      )}
      {game.phase === "readyShowdown" && (
        <button type="button" className="icon-button call" onClick={onShowdown}>
          <Eye size={18} />
          Mutatas
        </button>
      )}
    </div>
  );
}

function ResultStrip({ game }: { game: GameState }) {
  const aliceCards = getCards(game, "alice");
  const bobCards = getCards(game, "bob");
  if (game.phase !== "showdown" || aliceCards.length !== 5 || bobCards.length !== 5) {
    return null;
  }
  const aliceScore = evaluateFive(aliceCards);
  const bobScore = evaluateFive(bobCards);
  const result = compareScores(aliceScore, bobScore);
  const winner =
    result > 0 ? game.alice.secret.name : result < 0 ? game.bob.secret.name : "Dontetlen";

  return (
    <section className="result-strip">
      <div>
        <span className="result-label">{game.alice.secret.name}</span>
        <strong>{scoreText(aliceScore)}</strong>
      </div>
      <div className="winner-pill">
        <Trophy size={18} />
        {winner}
      </div>
      <div>
        <span className="result-label">{game.bob.secret.name}</span>
        <strong>{scoreText(bobScore)}</strong>
      </div>
    </section>
  );
}

export default function App() {
  const [names, setNames] = useState({ alice: "Alice", bob: "Bob" });
  const [game, setGame] = useState<GameState>(() => createGame(randomSeed(), names));

  const activeName = getPlayer(game, game.activePlayer).secret.name;
  const phaseLabel = useMemo(() => {
    if (game.phase === "protocol") {
      return "Protokoll";
    }
    if (game.phase === "swap") {
      return "Csere";
    }
    if (game.phase === "readyShowdown") {
      return "Mutatas elott";
    }
    return "Mutatas";
  }, [game.phase]);

  function newHand() {
    setGame(createGame(randomSeed(), names));
  }

  function changeName(id: PlayerId, value: string) {
    const updated = { ...names, [id]: value };
    setNames(updated);
    setGame((currentGame) =>
      currentGame.phase === "protocol" && currentGame.step === 0 ? createGame(currentGame.seed, updated) : currentGame,
    );
  }

  function toggleSelection(playerId: PlayerId, index: number) {
    setGame((current) => {
      if (current.phase !== "swap" || current.activePlayer !== playerId) {
        return current;
      }
      const player = getPlayer(current, playerId);
      const selected = player.selected.includes(index)
        ? player.selected.filter((item) => item !== index)
        : player.selected.length >= 3
          ? player.selected
          : [...player.selected, index].sort((a, b) => a - b);

      return {
        ...current,
        [playerId]: {
          ...player,
          selected,
        },
      };
    });
  }

  return (
    <div className="app-shell">
      <main className="table">
        <header className="table-topline">
          <div>
            <span className="eyebrow">Mental Poker</span>
            <h1>5 lapos poker</h1>
          </div>
          <div className="status-stack">
            <span>{phaseLabel}</span>
            <strong>{activeName}</strong>
          </div>
        </header>

        <section className="name-strip">
          {PLAYER_ORDER.map((id) => (
            <label key={id}>
              <span>{id === "alice" ? "Elso jatekos" : "Masodik jatekos"}</span>
              <input
                value={names[id]}
                onChange={(event) => changeName(id, event.target.value)}
                disabled={game.phase !== "protocol" || game.step > 0}
              />
            </label>
          ))}
        </section>

        <div className="deck-stage">
          <div className="deck-stack">
            <LockKeyhole size={24} />
            <span>Deck</span>
            <strong>{visibleDeckCount(game)}</strong>
          </div>
          <div className="crypto-flow">
            <KeyRound size={18} />
            <span>{"g^d -> g^(d*x1) -> g^(d*x1*x2)"}</span>
          </div>
        </div>

        <div className="players-grid">
          <HandSection
            playerId="alice"
            game={game}
            active={game.activePlayer === "alice"}
            onActivate={() => setGame((current) => ({ ...current, activePlayer: "alice" }))}
            onToggle={(index) => toggleSelection("alice", index)}
          />
          <HandSection
            playerId="bob"
            game={game}
            active={game.activePlayer === "bob"}
            onActivate={() => setGame((current) => ({ ...current, activePlayer: "bob" }))}
            onToggle={(index) => toggleSelection("bob", index)}
          />
        </div>

        {game.phase === "swap" && (
          <section className="swap-console">
            <CheckCircle2 size={20} />
            <div>
              <strong>{activeName}</strong>
              <span>cserere jelolve: {getPlayer(game, game.activePlayer).selected.length} lap</span>
            </div>
          </section>
        )}

        <ActionBar
          game={game}
          onNext={() => setGame((current) => advanceProtocol(current))}
          onApplySwaps={() => setGame((current) => applySwaps(current))}
          onShowdown={() => setGame((current) => revealShowdown(current))}
          onNew={newHand}
        />

        <ResultStrip game={game} />
      </main>

      <ProtocolPanel game={game} />
    </div>
  );
}
