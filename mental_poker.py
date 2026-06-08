from __future__ import annotations

import argparse
import random
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from itertools import combinations
from math import gcd


DEFAULT_P = 1_000_003
DEFAULT_SEED = 2026

RANK_TO_TEXT = {
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
}

RANK_ORDER = [14, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
SUIT_ORDER = ["Pikk", "Karo", "Kor", "Treff"]

CATEGORY_NAMES = {
    0: "Magas lap",
    1: "Egy par",
    2: "Ket par",
    3: "Drill",
    4: "Sor",
    5: "Flush",
    6: "Full house",
    7: "Poker",
    8: "Szinsor",
}


def inv_mod(a: int, m: int) -> int:
    old_r, r = a, m
    old_s, s = 1, 0
    while r != 0:
        q = old_r // r
        old_r, r = r, old_r - q * r
        old_s, s = s, old_s - q * s
    if old_r != 1:
        raise ValueError(f"{a} has no inverse modulo {m}")
    return old_s % m


def is_prime(n: int) -> bool:
    if n < 2:
        return False
    small_primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]
    for p in small_primes:
        if n == p:
            return True
        if n % p == 0:
            return False

    d = n - 1
    s = 0
    while d % 2 == 0:
        d //= 2
        s += 1

    # Deterministic for numbers far larger than this program uses.
    for a in [2, 3, 5, 7, 11, 13]:
        if a >= n:
            continue
        x = pow(a, d, n)
        if x == 1 or x == n - 1:
            continue
        for _ in range(s - 1):
            x = (x * x) % n
            if x == n - 1:
                break
        else:
            return False
    return True


def factorize(n: int) -> set[int]:
    factors: set[int] = set()
    d = 2
    while d * d <= n:
        while n % d == 0:
            factors.add(d)
            n //= d
        d += 1 if d == 2 else 2
    if n > 1:
        factors.add(n)
    return factors


def primitive_root(p: int) -> int:
    if not is_prime(p):
        raise ValueError("p-nek primszamnak kell lennie")
    phi = p - 1
    factors = factorize(phi)
    for g in range(2, p):
        if all(pow(g, phi // q, p) != 1 for q in factors):
            return g
    raise ValueError(f"nem talalhato generator ehhez: p={p}")


@dataclass(frozen=True)
class MentalPokerParameters:
    p: int
    g: int


@lru_cache(maxsize=8)
def default_parameters(p: int = DEFAULT_P) -> MentalPokerParameters:
    return MentalPokerParameters(p=p, g=primitive_root(p))


@dataclass(frozen=True)
class Card:
    rank: int
    suit: str

    def __str__(self) -> str:
        return f"{RANK_TO_TEXT[self.rank]} {self.suit}"


@dataclass(frozen=True)
class HandScore:
    category: int
    tiebreakers: tuple[int, ...]
    best_cards: tuple[Card, ...]

    def key(self) -> tuple[int, tuple[int, ...]]:
        return self.category, self.tiebreakers


@dataclass
class DeckSetup:
    raw_ids: list[int]
    public_deck: list[int]
    value_to_card: dict[int, Card]


@dataclass
class BettingResult:
    called: bool
    folded_by: str | None
    transcript: list[str]


class HungarianArgumentParser(argparse.ArgumentParser):
    def format_usage(self) -> str:
        return super().format_usage().replace("usage:", "hasznalat:")

    def format_help(self) -> str:
        return super().format_help().replace("usage:", "hasznalat:").replace("options:", "kapcsolok:")


class MentalPokerPlayer:
    def __init__(self, name: str, params: MentalPokerParameters, rng: random.Random) -> None:
        self.name = name
        self.params = params
        self.rng = rng
        self.private_x: int | None = None
        self.inverse_y: int | None = None

    def set_private_value(self, x: int) -> None:
        modulus = self.params.p - 1
        if x < 2 or x >= modulus:
            raise ValueError(f"x erteke 2 es {modulus - 1} kozott kell legyen")
        if gcd(x, modulus) != 1:
            raise ValueError(f"x-re teljesulnie kell: gcd(x, {modulus}) = 1, kulonben nincs inverze mod p-1")
        self.private_x = x
        self.inverse_y = inv_mod(x, modulus)

    def choose_private_value(self) -> None:
        modulus = self.params.p - 1
        while True:
            x = self.rng.randrange(2, modulus)
            if gcd(x, modulus) == 1:
                self.set_private_value(x)
                return

    def shuffle(self, deck: list[int]) -> list[int]:
        if self.private_x is None:
            self.choose_private_value()
        assert self.private_x is not None

        shuffled = deck[:]
        self.rng.shuffle(shuffled)
        return [pow(card, self.private_x, self.params.p) for card in shuffled]

    def reveal(self, card: int) -> int:
        if self.inverse_y is None:
            raise RuntimeError(f"{self.name} meg nem keverte meg a paklit")
        return pow(card, self.inverse_y, self.params.p)

    def reveal_many(self, cards: list[int]) -> list[int]:
        return [self.reveal(card) for card in cards]

    def key_line(self) -> str:
        assert self.private_x is not None
        assert self.inverse_y is not None
        check = (self.private_x * self.inverse_y) % (self.params.p - 1)
        return f"{self.name}: x={self.private_x}, y={self.inverse_y}, x*y mod (p-1)={check}"


def standard_cards() -> list[Card]:
    return [Card(rank, suit) for suit in SUIT_ORDER for rank in RANK_ORDER]


def create_deck_setup(params: MentalPokerParameters, rng: random.Random) -> DeckSetup:
    if params.p < 109:
        raise ValueError("p tul kicsi 52 kulonbozo kartyaazonositohoz")

    raw_ids = rng.sample(range(params.p // 2 + 1, params.p - 1), 52)
    cards = standard_cards()
    value_to_card: dict[int, Card] = {}
    public_deck: list[int] = []

    for raw_id, card in zip(raw_ids, cards):
        group_value = pow(params.g, raw_id, params.p)
        value_to_card[group_value] = card
        public_deck.append(group_value)

    return DeckSetup(raw_ids=raw_ids, public_deck=public_deck, value_to_card=value_to_card)


def prepare_unencrypted_game(
    params: MentalPokerParameters,
    rng: random.Random,
    first_player_name: str,
    second_player_name: str,
) -> tuple[DeckSetup, MentalPokerPlayer, MentalPokerPlayer, list[int]]:
    deck_setup = create_deck_setup(params, rng)
    first_player = MentalPokerPlayer(first_player_name, params, rng)
    second_player = MentalPokerPlayer(second_player_name, params, rng)
    deck = deck_setup.public_deck[:]
    return deck_setup, first_player, second_player, deck


def setup_game(
    params: MentalPokerParameters,
    rng: random.Random,
    first_player_name: str = "Alice",
    second_player_name: str = "Bob",
) -> tuple[DeckSetup, MentalPokerPlayer, MentalPokerPlayer, list[int]]:
    deck_setup, first_player, second_player, deck = prepare_unencrypted_game(
        params, rng, first_player_name, second_player_name
    )
    deck = first_player.shuffle(deck_setup.public_deck)
    deck = second_player.shuffle(deck)
    return deck_setup, first_player, second_player, deck


def take_cards(deck: list[int], count: int) -> list[int]:
    if len(deck) < count:
        raise RuntimeError("nincs eleg kartya a pakliban")
    selected = deck[:count]
    del deck[:count]
    return selected


def reveal_private_cards(
    encrypted_cards: list[int],
    owner: MentalPokerPlayer,
    helper: MentalPokerPlayer,
    value_to_card: dict[int, Card],
) -> tuple[list[int], list[Card]]:
    helper_opened = helper.reveal_many(encrypted_cards)
    final_values = owner.reveal_many(helper_opened)
    return final_values, [value_to_card[value] for value in final_values]


def reveal_public_cards(
    encrypted_cards: list[int],
    players: list[MentalPokerPlayer],
    value_to_card: dict[int, Card],
) -> tuple[list[int], list[Card]]:
    opened = encrypted_cards[:]
    for player in players:
        opened = player.reveal_many(opened)
    return opened, [value_to_card[value] for value in opened]


def format_cards(cards: list[Card] | tuple[Card, ...]) -> str:
    return ", ".join(str(card) for card in cards)


def straight_high(ranks: list[int]) -> int | None:
    unique = sorted(set(ranks), reverse=True)
    if set([14, 5, 4, 3, 2]).issubset(unique):
        return 5
    for window in combinations(unique, 5):
        ordered = sorted(window, reverse=True)
        if ordered[0] - ordered[4] == 4 and len(set(ordered)) == 5:
            return ordered[0]
    return None


def evaluate_five(cards: list[Card] | tuple[Card, ...]) -> HandScore:
    cards_tuple = tuple(cards)
    ranks = sorted((card.rank for card in cards_tuple), reverse=True)
    suits = [card.suit for card in cards_tuple]
    counts = Counter(ranks)
    flush = len(set(suits)) == 1
    straight = straight_high(ranks)

    if flush and straight is not None:
        return HandScore(8, (straight,), cards_tuple)

    four = [rank for rank, count in counts.items() if count == 4]
    if four:
        rank = max(four)
        kicker = max(r for r in ranks if r != rank)
        return HandScore(7, (rank, kicker), cards_tuple)

    triples = sorted((rank for rank, count in counts.items() if count == 3), reverse=True)
    pairs = sorted((rank for rank, count in counts.items() if count == 2), reverse=True)
    if triples and pairs:
        return HandScore(6, (triples[0], pairs[0]), cards_tuple)

    if flush:
        return HandScore(5, tuple(ranks), cards_tuple)

    if straight is not None:
        return HandScore(4, (straight,), cards_tuple)

    if triples:
        trip = triples[0]
        kickers = sorted((r for r in ranks if r != trip), reverse=True)
        return HandScore(3, (trip, *kickers), cards_tuple)

    if len(pairs) >= 2:
        high_pair, low_pair = pairs[:2]
        kicker = max(r for r in ranks if r not in [high_pair, low_pair])
        return HandScore(2, (high_pair, low_pair, kicker), cards_tuple)

    if pairs:
        pair = pairs[0]
        kickers = sorted((r for r in ranks if r != pair), reverse=True)
        return HandScore(1, (pair, *kickers), cards_tuple)

    return HandScore(0, tuple(ranks), cards_tuple)


def evaluate_best(cards: list[Card]) -> HandScore:
    if len(cards) < 5:
        raise ValueError("at least 5 cards are needed")
    scores = [evaluate_five(combo) for combo in combinations(cards, 5)]
    return max(scores, key=lambda score: score.key())


def score_text(score: HandScore) -> str:
    kickers = " ".join(RANK_TO_TEXT[rank] for rank in score.tiebreakers)
    return f"{CATEGORY_NAMES[score.category]} ({kickers})"


def compare_scores(a: HandScore, b: HandScore) -> int:
    if a.key() > b.key():
        return 1
    if a.key() < b.key():
        return -1
    return 0


def choose_draw_discards(cards: list[Card]) -> list[int]:
    score = evaluate_five(cards)
    if score.category >= 4:
        return []

    ranks = [card.rank for card in cards]
    counts = Counter(ranks)
    if score.category == 3:
        kept = {rank for rank, count in counts.items() if count == 3}
        return [i for i, card in enumerate(cards) if card.rank not in kept]

    if score.category == 2:
        kept = {rank for rank, count in counts.items() if count == 2}
        kickers = [i for i, card in enumerate(cards) if card.rank not in kept]
        return kickers[:1]

    if score.category == 1:
        kept = {rank for rank, count in counts.items() if count == 2}
        return [i for i, card in enumerate(cards) if card.rank not in kept][:3]

    suit_counts = Counter(card.suit for card in cards)
    best_suit, best_suit_count = suit_counts.most_common(1)[0]
    if best_suit_count == 4:
        return [i for i, card in enumerate(cards) if card.suit != best_suit]

    indexed = sorted(enumerate(cards), key=lambda item: item[1].rank)
    return [index for index, _ in indexed[:3]]


def replace_draw_cards(
    deck: list[int],
    values: list[int],
    cards: list[Card],
    discard_indexes: list[int],
    owner: MentalPokerPlayer,
    helper: MentalPokerPlayer,
    value_to_card: dict[int, Card],
) -> tuple[list[Card], list[Card]]:
    if not discard_indexes:
        return [], []

    encrypted_new = take_cards(deck, len(discard_indexes))
    new_values, new_cards = reveal_private_cards(encrypted_new, owner, helper, value_to_card)
    old_cards = [cards[i] for i in discard_indexes]
    for target, value, card in zip(discard_indexes, new_values, new_cards):
        values[target] = value
        cards[target] = card
    return old_cards, new_cards


def winner_line(first_player: MentalPokerPlayer, first_score: HandScore, second_player: MentalPokerPlayer, second_score: HandScore) -> str:
    cmp = compare_scores(first_score, second_score)
    if cmp > 0:
        return f"Nyertes: {first_player.name}, eredmeny: {score_text(first_score)}"
    if cmp < 0:
        return f"Nyertes: {second_player.name}, eredmeny: {score_text(second_score)}"
    return f"Eredmeny: dontetlen, {score_text(first_score)}"


def add_protocol_event(out: list[str], message: str, interactive: bool) -> None:
    out.append(message)
    if interactive:
        print(message)
        wait_for_enter("Tovabblepeshez nyomj Entert...")


def add_draw_event(out: list[str], message: str, interactive: bool) -> None:
    add_protocol_event(out, message, interactive)


def reveal_private_cards_for_draw(
    encrypted_cards: list[int],
    owner: MentalPokerPlayer,
    helper: MentalPokerPlayer,
    value_to_card: dict[int, Card],
    out: list[str],
    interactive: bool,
) -> tuple[list[int], list[Card]]:
    add_draw_event(out, f"{owner.name} atadja a titkositott lapjait {helper.name} reszere reveal-re.", interactive)
    helper_opened = helper.reveal_many(encrypted_cards)
    add_draw_event(out, f"{helper.name} meghivja a reveal(card) muveletet ezekre a lapokra, majd visszaadja oket.", interactive)
    final_values = owner.reveal_many(helper_opened)
    final_cards = [value_to_card[value] for value in final_values]
    add_draw_event(out, f"{owner.name} meghivja a sajat reveal(card) muveletet, es megismeri a lapjait: {format_cards(final_cards)}", interactive)
    return final_values, final_cards


def reveal_hole_cards_for_holdem(
    encrypted_cards: list[int],
    owner: MentalPokerPlayer,
    helper: MentalPokerPlayer,
    value_to_card: dict[int, Card],
    out: list[str],
    interactive: bool,
) -> list[Card]:
    add_protocol_event(out, f"{owner.name} atadja a 2 titkositott sajat lapjat {helper.name} reszere reveal-re.", interactive)
    helper_opened = helper.reveal_many(encrypted_cards)
    add_protocol_event(out, f"{helper.name} meghivja a reveal(card) muveletet ezekre a lapokra, majd visszaadja oket.", interactive)
    final_values = owner.reveal_many(helper_opened)
    add_protocol_event(out, f"{owner.name} meghivja a sajat reveal(card) muveletet, es privatban megismeri a 2 sajat lapjat.", interactive)
    return [value_to_card[value] for value in final_values]


def reveal_public_cards_for_holdem(
    encrypted_cards: list[int],
    label: str,
    players: list[MentalPokerPlayer],
    value_to_card: dict[int, Card],
    out: list[str],
    interactive: bool,
) -> list[Card]:
    add_protocol_event(out, f"{label}: {len(encrypted_cards)} titkositott kozos lap kikerul a Deck-bol.", interactive)
    opened = encrypted_cards[:]
    for player in players:
        opened = player.reveal_many(opened)
        add_protocol_event(out, f"{player.name} meghivja a reveal(card) muveletet a {label.lower()} lapjaira.", interactive)
    cards = [value_to_card[value] for value in opened]
    add_protocol_event(out, f"{label}: {format_cards(cards)}", interactive)
    return cards


def replace_draw_cards_for_draw(
    deck: list[int],
    values: list[int],
    cards: list[Card],
    discard_indexes: list[int],
    owner: MentalPokerPlayer,
    helper: MentalPokerPlayer,
    value_to_card: dict[int, Card],
    out: list[str],
    interactive: bool,
) -> tuple[list[Card], list[Card]]:
    if not discard_indexes:
        add_draw_event(out, f"{owner.name} ugy dont, hogy nem cserel lapot.", interactive)
        return [], []

    old_cards = [cards[i] for i in discard_indexes]
    add_draw_event(out, f"{owner.name} ugy dont, hogy ezeket a lapokat csereli: {format_cards(old_cards)}", interactive)
    encrypted_new = take_cards(deck, len(discard_indexes))
    add_draw_event(out, f"{owner.name} huz {len(discard_indexes)} uj titkositott lapot a Deck-bol.", interactive)
    new_values, new_cards = reveal_private_cards_for_draw(encrypted_new, owner, helper, value_to_card, out, interactive)
    for target, value, card in zip(discard_indexes, new_values, new_cards):
        values[target] = value
        cards[target] = card
    add_draw_event(out, f"{owner.name} csere utan aktualis keze: {format_cards(cards)}", interactive)
    return old_cards, new_cards


def simulate_draw_poker(
    rng: random.Random,
    params: MentalPokerParameters,
    first_player_name: str = "Alice",
    second_player_name: str = "Bob",
    interactive_private_values: bool = False,
) -> str:
    out: list[str] = []
    deck_setup, first_player, second_player, deck = prepare_unencrypted_game(
        params, rng, first_player_name, second_player_name
    )
    add_draw_event(out, "=== Mental Poker: 5 lapos poker ===", interactive_private_values)
    add_draw_event(out, f"Parameterek kivalasztva: p={params.p}, g={params.g}.", interactive_private_values)
    add_draw_event(
        out,
        f"Deck elokeszitve: {len(deck_setup.raw_ids)} nyers kartyaazonosito, mindegyikre p/2 < d < p-1.",
        interactive_private_values,
    )

    rng.shuffle(deck)
    add_draw_event(out, "A publikus Deck lista elso korben meg lett keverve.", interactive_private_values)

    first_player.choose_private_value()
    second_player.choose_private_value()
    add_draw_event(out, "Mindket jatekos ervenyes veletlen privat x erteket valasztott.", interactive_private_values)

    deck = first_player.shuffle(deck)
    add_draw_event(out, f"{first_player.name} meghivja a sajat shuffle fuggvenyet a kozos Deck-re.", interactive_private_values)
    deck = second_player.shuffle(deck)
    add_draw_event(out, f"{second_player.name} meghivja a sajat shuffle fuggvenyet a kozos Deck-re.", interactive_private_values)

    first_encrypted = take_cards(deck, 5)
    add_draw_event(out, f"{first_player.name} valaszt 5 titkositott lapot a Deck-bol.", interactive_private_values)
    second_encrypted = take_cards(deck, 5)
    add_draw_event(out, f"{second_player.name} valaszt 5 titkositott lapot a Deck-bol.", interactive_private_values)

    first_values, first_cards = reveal_private_cards_for_draw(
        first_encrypted, first_player, second_player, deck_setup.value_to_card, out, interactive_private_values
    )
    second_values, second_cards = reveal_private_cards_for_draw(
        second_encrypted, second_player, first_player, deck_setup.value_to_card, out, interactive_private_values
    )

    first_discards = choose_draw_discards(first_cards)
    old_cards, new_cards = replace_draw_cards_for_draw(
        deck,
        first_values,
        first_cards,
        first_discards,
        first_player,
        second_player,
        deck_setup.value_to_card,
        out,
        interactive_private_values,
    )
    if old_cards:
        add_draw_event(out, f"{first_player.name} csereje: {format_cards(old_cards)} -> {format_cards(new_cards)}", interactive_private_values)

    second_discards = choose_draw_discards(second_cards)
    old_cards, new_cards = replace_draw_cards_for_draw(
        deck,
        second_values,
        second_cards,
        second_discards,
        second_player,
        first_player,
        deck_setup.value_to_card,
        out,
        interactive_private_values,
    )
    if old_cards:
        add_draw_event(out, f"{second_player.name} csereje: {format_cards(old_cards)} -> {format_cards(new_cards)}", interactive_private_values)

    first_score = evaluate_five(first_cards)
    second_score = evaluate_five(second_cards)

    out.append("")
    if interactive_private_values:
        print()
    add_draw_event(out, "Mutatas: a jatekosok felfedik a privat ertekeiket.", interactive_private_values)
    add_draw_event(out, first_player.key_line(), interactive_private_values)
    add_draw_event(out, second_player.key_line(), interactive_private_values)
    add_draw_event(out, f"{first_player.name} vegso keze: {format_cards(first_cards)} -> {score_text(first_score)}", interactive_private_values)
    add_draw_event(out, f"{second_player.name} vegso keze: {format_cards(second_cards)} -> {score_text(second_score)}", interactive_private_values)
    add_draw_event(out, winner_line(first_player, first_score, second_player, second_score), interactive_private_values)
    if interactive_private_values:
        return ""
    return "\n".join(out)


def final_betting(
    first_score: HandScore,
    second_score: HandScore,
    first_player: MentalPokerPlayer,
    second_player: MentalPokerPlayer,
    rng: random.Random,
    force_showdown: bool,
) -> BettingResult:
    if force_showdown:
        return BettingResult(
            called=True,
            folded_by=None,
            transcript=[
                f"Vegso licitkor: {first_player.name} 10 zsetont tesz.",
                f"{second_player.name} megadja a tetet.",
            ],
        )

    if compare_scores(first_score, second_score) >= 0:
        leader = first_player.name
        caller = second_player.name
        caller_score = second_score
    else:
        leader = second_player.name
        caller = first_player.name
        caller_score = first_score

    call_probability = 0.85 if caller_score.category >= 1 else 0.45
    called = rng.random() < call_probability
    transcript = [f"Vegso licitkor: {leader} 10 zsetont tesz."]
    if called:
        transcript.append(f"{caller} megadja a tetet.")
        return BettingResult(called=True, folded_by=None, transcript=transcript)
    transcript.append(f"{caller} dob.")
    return BettingResult(called=False, folded_by=caller, transcript=transcript)


def simulate_texas_holdem(
    rng: random.Random,
    params: MentalPokerParameters,
    first_player_name: str = "Alice",
    second_player_name: str = "Bob",
    force_showdown: bool = True,
    interactive_events: bool = False,
) -> str:
    out: list[str] = []
    deck_setup, first_player, second_player, deck = prepare_unencrypted_game(
        params, rng, first_player_name, second_player_name
    )

    add_protocol_event(out, "=== Mental Poker: Texas Holdem ===", interactive_events)
    add_protocol_event(out, f"Parameterek kivalasztva: p={params.p}, g={params.g}.", interactive_events)
    add_protocol_event(
        out,
        f"Deck elokeszitve: {len(deck_setup.raw_ids)} nyers kartyaazonosito, mindegyikre p/2 < d < p-1.",
        interactive_events,
    )

    rng.shuffle(deck)
    add_protocol_event(out, "A publikus Deck lista elso korben meg lett keverve.", interactive_events)

    first_player.choose_private_value()
    second_player.choose_private_value()
    add_protocol_event(out, "Mindket jatekos ervenyes veletlen privat x erteket valasztott.", interactive_events)

    deck = first_player.shuffle(deck)
    add_protocol_event(out, f"{first_player.name} meghivja a sajat shuffle fuggvenyet a kozos Deck-re.", interactive_events)
    deck = second_player.shuffle(deck)
    add_protocol_event(out, f"{second_player.name} meghivja a sajat shuffle fuggvenyet a kozos Deck-re.", interactive_events)

    first_encrypted_hole = take_cards(deck, 2)
    add_protocol_event(out, f"{first_player.name} valaszt 2 titkositott sajat lapot a Deck-bol.", interactive_events)
    second_encrypted_hole = take_cards(deck, 2)
    add_protocol_event(out, f"{second_player.name} valaszt 2 titkositott sajat lapot a Deck-bol.", interactive_events)

    first_hole = reveal_hole_cards_for_holdem(
        first_encrypted_hole, first_player, second_player, deck_setup.value_to_card, out, interactive_events
    )
    second_hole = reveal_hole_cards_for_holdem(
        second_encrypted_hole, second_player, first_player, deck_setup.value_to_card, out, interactive_events
    )

    flop = reveal_public_cards_for_holdem(
        take_cards(deck, 3), "Flop", [first_player, second_player], deck_setup.value_to_card, out, interactive_events
    )
    turn = reveal_public_cards_for_holdem(
        take_cards(deck, 1), "Turn", [first_player, second_player], deck_setup.value_to_card, out, interactive_events
    )
    river = reveal_public_cards_for_holdem(
        take_cards(deck, 1), "River", [first_player, second_player], deck_setup.value_to_card, out, interactive_events
    )
    board = flop + turn + river

    first_score = evaluate_best(first_hole + board)
    second_score = evaluate_best(second_hole + board)
    betting = final_betting(first_score, second_score, first_player, second_player, rng, force_showdown)
    for line in betting.transcript:
        add_protocol_event(out, line, interactive_events)

    if not betting.called:
        add_protocol_event(
            out,
            "Nincs mutatas: a privat ertekek nem kerulnek megosztasra, mert a tetet nem adtak meg.",
            interactive_events,
        )
        winner = second_player.name if betting.folded_by == first_player.name else first_player.name
        add_protocol_event(out, f"Nyertes dobas miatt: {winner}", interactive_events)
        if interactive_events:
            return ""
        return "\n".join(out)

    out.append("")
    if interactive_events:
        print()
    add_protocol_event(out, "Mutatas: mindket jatekos megadta a tetet, ezert a privat ertekek megnyilnak.", interactive_events)
    add_protocol_event(out, first_player.key_line(), interactive_events)
    add_protocol_event(out, second_player.key_line(), interactive_events)
    add_protocol_event(out, f"Kozos lapok: {format_cards(board)}", interactive_events)
    add_protocol_event(out, f"{first_player.name} sajat lapjai: {format_cards(first_hole)}", interactive_events)
    add_protocol_event(out, f"{second_player.name} sajat lapjai: {format_cards(second_hole)}", interactive_events)
    add_protocol_event(out, f"{first_player.name} legjobb keze: {format_cards(first_score.best_cards)} -> {score_text(first_score)}", interactive_events)
    add_protocol_event(out, f"{second_player.name} legjobb keze: {format_cards(second_score.best_cards)} -> {score_text(second_score)}", interactive_events)
    add_protocol_event(out, winner_line(first_player, first_score, second_player, second_score), interactive_events)
    if interactive_events:
        return ""
    return "\n".join(out)


def self_test() -> str:
    rng = random.Random(12345)
    params = default_parameters()
    assert is_prime(params.p)
    assert pow(params.g, params.p - 1, params.p) == 1
    assert all(pow(params.g, (params.p - 1) // q, params.p) != 1 for q in factorize(params.p - 1))

    deck_setup, alice, bob, deck = setup_game(params, rng)
    one_card = take_cards(deck, 1)
    opened_by_bob = bob.reveal(one_card[0])
    final_value = alice.reveal(opened_by_bob)
    assert final_value in deck_setup.value_to_card
    assert alice.private_x is not None and alice.inverse_y is not None
    assert bob.private_x is not None and bob.inverse_y is not None
    assert (alice.private_x * alice.inverse_y) % (params.p - 1) == 1
    assert (bob.private_x * bob.inverse_y) % (params.p - 1) == 1

    straight_flush = [Card(10, "Pikk"), Card(11, "Pikk"), Card(12, "Pikk"), Card(13, "Pikk"), Card(14, "Pikk")]
    four_kind = [Card(9, "Treff"), Card(9, "Karo"), Card(9, "Kor"), Card(9, "Pikk"), Card(2, "Treff")]
    assert evaluate_five(straight_flush).key() > evaluate_five(four_kind).key()
    return "OK: az onellenorzes sikeres"


def build_arg_parser() -> argparse.ArgumentParser:
    parser = HungarianArgumentParser(description="Mental Poker beadando szimulacio", add_help=False)
    parser.add_argument("-h", "--help", action="help", help="sugo megjelenitese, majd kilepes")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="veletlen mag az ismetelheto futasokhoz")
    parser.add_argument("--test", action="store_true", help="onellenorzes futtatasa, majd kilepes")
    parser.add_argument(
        "--allow-folds",
        action="store_true",
        help="Texas Holdem eseten engedi, hogy a vegso licitkor mutatas nelkul zaruljon",
    )
    return parser


def ask_for_prime(default: int = DEFAULT_P) -> int:
    while True:
        try:
            raw = input(f"Valassz egy p primet (Enter = {default}): ").strip()
        except EOFError:
            print()
            return default

        if raw == "":
            p = default
        else:
            try:
                p = int(raw)
            except ValueError:
                print("Kerlek egesz szamot adj meg.")
                continue

        if p < 109:
            print("p legalabb 109 legyen, hogy a pakliban 52 kulonbozo kartyaazonosito lehessen.")
            continue
        if not is_prime(p):
            print("p-nek primszamnak kell lennie.")
            continue
        return p


def ask_for_player_name(label: str, default: str) -> str:
    try:
        raw = input(f"{label} neve (Enter = {default}): ").strip()
    except EOFError:
        print()
        return default
    return raw if raw else default


def ask_for_player_names() -> tuple[str, str]:
    while True:
        first_name = ask_for_player_name("Elso jatekos", "Alice")
        second_name = ask_for_player_name("Masodik jatekos", "Bob")
        if first_name != second_name:
            return first_name, second_name
        print("A ket jatekos neve nem lehet ugyanaz.")


def ask_for_game_type() -> str:
    while True:
        try:
            raw = input("Valassz jatektipust [1=5 lapos poker, 2=Texas Holdem] (Enter = 1): ").strip().lower()
        except EOFError:
            print()
            return "draw"

        if raw in ["", "1", "draw", "5-card draw", "5 card draw", "5 lapos poker", "poker"]:
            return "draw"
        if raw in ["2", "holdem", "texas holdem", "texas"]:
            return "holdem"
        print("Kerlek valassz: 1 = 5 lapos poker, 2 = Texas Holdem.")


def wait_for_enter(prompt: str) -> None:
    try:
        input(prompt)
    except EOFError:
        pass
    print()


def main() -> None:
    args = build_arg_parser().parse_args()

    if args.test:
        print(self_test())
        return

    p = ask_for_prime()
    first_player_name, second_player_name = ask_for_player_names()
    game_type = ask_for_game_type()
    rng = random.Random(args.seed)
    params = default_parameters(p)

    if game_type == "draw":
        result = simulate_draw_poker(rng, params, first_player_name, second_player_name, interactive_private_values=True)
        if result:
            print(result)
    else:
        result = simulate_texas_holdem(
            rng,
            params,
            first_player_name,
            second_player_name,
            force_showdown=not args.allow_folds,
            interactive_events=True,
        )
        if result:
            print(result)


if __name__ == "__main__":
    main()
