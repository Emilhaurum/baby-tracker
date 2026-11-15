"""Built-in milestones shown in the card's milestone timeline.

Ages marked ``cdc`` come from the CDC "Learn the Signs. Act Early." checklists
(2022 update): the age by which most children (75% or more) reach the milestone.
The others are common "firsts" with a typical age from paediatric guidance, or no
age where it varies too much to be useful. Every child develops at their own pace.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

CATEGORY_MOVEMENT: Final = "movement"
CATEGORY_COMMUNICATION: Final = "communication"
CATEGORY_SOCIAL: Final = "social"
CATEGORY_FIRSTS: Final = "firsts"
CATEGORIES: Final = (CATEGORY_MOVEMENT, CATEGORY_COMMUNICATION, CATEGORY_SOCIAL, CATEGORY_FIRSTS)


@dataclass(frozen=True, slots=True)
class Milestone:
    """A built-in milestone."""

    key: str
    name: str
    category: str
    months: int | None  # typical age in months
    cdc: bool = False  # months is the CDC checklist age
    tags: tuple[str, ...] = ()  # other words for it, used by the card's search


MILESTONES: Final[tuple[Milestone, ...]] = (
    # Movement
    Milestone(
        "head_up_tummy",
        "Holds head up on tummy",
        CATEGORY_MOVEMENT,
        2,
        cdc=True,
        tags=("head", "lift head", "tummy time", "neck"),
    ),
    Milestone(
        "head_steady",
        "Holds head steady when held",
        CATEGORY_MOVEMENT,
        4,
        cdc=True,
        tags=("head control", "neck", "holds head"),
    ),
    Milestone(
        "pushes_up",
        "Pushes up on forearms on tummy",
        CATEGORY_MOVEMENT,
        4,
        cdc=True,
        tags=("push up", "forearms", "tummy time", "mini push-up"),
    ),
    Milestone(
        "rolls_tummy_to_back",
        "Rolls from tummy to back",
        CATEGORY_MOVEMENT,
        6,
        cdc=True,
        tags=("roll", "rolling", "rolls over", "turns over", "flip"),
    ),
    Milestone(
        "rolls_back_to_tummy",
        "Rolls from back to tummy",
        CATEGORY_MOVEMENT,
        7,
        tags=("roll", "rolling", "rolls over", "turns over", "flip"),
    ),
    Milestone(
        "sits_without_support",
        "Sits without support",
        CATEGORY_MOVEMENT,
        9,
        cdc=True,
        tags=("sit", "sitting", "sits up", "sat up", "sits alone"),
    ),
    Milestone(
        "crawls",
        "Crawls",
        CATEGORY_MOVEMENT,
        9,
        tags=("crawl", "crawling", "creeping", "scoot", "army crawl", "commando crawl"),
    ),
    Milestone(
        "pulls_to_stand",
        "Pulls up to stand",
        CATEGORY_MOVEMENT,
        12,
        cdc=True,
        tags=("stand", "standing", "stands up", "pull up"),
    ),
    Milestone(
        "cruises",
        "Walks holding on to furniture",
        CATEGORY_MOVEMENT,
        12,
        cdc=True,
        tags=("cruise", "cruising", "furniture walking", "walk holding"),
    ),
    Milestone(
        "pincer_grasp",
        "Picks things up between thumb and finger",
        CATEGORY_MOVEMENT,
        12,
        cdc=True,
        tags=("pincer", "grasp", "pick up", "fingers", "grab"),
    ),
    Milestone(
        "first_steps",
        "First steps on their own",
        CATEGORY_MOVEMENT,
        12,
        tags=("walk", "walking", "steps", "step", "toddle"),
    ),
    Milestone(
        "walks",
        "Walks without holding on",
        CATEGORY_MOVEMENT,
        18,
        cdc=True,
        tags=("walk", "walking", "toddle", "walks alone"),
    ),
    # Communication
    Milestone(
        "coos",
        "Coos (“ooo”, “aah”)",
        CATEGORY_COMMUNICATION,
        4,
        cdc=True,
        tags=("coo", "cooing", "sounds", "vowels"),
    ),
    Milestone(
        "laughs",
        "Laughs",
        CATEGORY_COMMUNICATION,
        6,
        cdc=True,
        tags=("laugh", "laughing", "giggle", "chuckle"),
    ),
    Milestone(
        "babbles",
        "Babbles (“mamama”, “bababa”)",
        CATEGORY_COMMUNICATION,
        9,
        cdc=True,
        tags=("babble", "babbling", "mama", "dada", "syllables"),
    ),
    Milestone(
        "responds_to_name",
        "Looks when you say their name",
        CATEGORY_COMMUNICATION,
        9,
        cdc=True,
        tags=("name", "turns to name", "responds"),
    ),
    Milestone(
        "waves",
        "Waves bye-bye",
        CATEGORY_COMMUNICATION,
        12,
        cdc=True,
        tags=("wave", "waving", "bye bye", "goodbye"),
    ),
    Milestone(
        "first_word",
        "First word (“mama”, “dada” …)",
        CATEGORY_COMMUNICATION,
        12,
        cdc=True,
        tags=("word", "talk", "talking", "speak", "mama", "dada"),
    ),
    Milestone(
        "points",
        "Points to show you something",
        CATEGORY_COMMUNICATION,
        18,
        cdc=True,
        tags=("point", "pointing", "shows"),
    ),
    Milestone(
        "three_words",
        "Says three or more words",
        CATEGORY_COMMUNICATION,
        18,
        cdc=True,
        tags=("words", "vocabulary", "talk", "talking"),
    ),
    Milestone(
        "two_word_phrases",
        "Puts two words together",
        CATEGORY_COMMUNICATION,
        24,
        cdc=True,
        tags=("phrase", "sentence", "two words", "talk", "talking"),
    ),
    # Social
    Milestone(
        "first_smile",
        "First social smile",
        CATEGORY_SOCIAL,
        2,
        cdc=True,
        tags=("smile", "smiling", "social smile"),
    ),
    Milestone(
        "knows_familiar_people",
        "Knows familiar people",
        CATEGORY_SOCIAL,
        6,
        cdc=True,
        tags=("recognises", "recognizes", "familiar faces", "stranger"),
    ),
    Milestone(
        "plays_peekaboo",
        "Plays peek-a-boo",
        CATEGORY_SOCIAL,
        9,
        cdc=True,
        tags=("peekaboo", "peek a boo", "hide and seek"),
    ),
    Milestone(
        "pat_a_cake",
        "Plays pat-a-cake",
        CATEGORY_SOCIAL,
        12,
        cdc=True,
        tags=("clap", "clapping", "patty cake", "pat a cake"),
    ),
    # Firsts
    Milestone(
        "first_solid_food",
        "First solid food",
        CATEGORY_FIRSTS,
        6,
        tags=("solids", "food", "puree", "weaning", "eating", "first meal"),
    ),
    Milestone("first_tooth", "First tooth", CATEGORY_FIRSTS, 6, tags=("tooth", "teeth", "teething")),
    Milestone(
        "drinks_from_cup",
        "Drinks from an open cup (with help)",
        CATEGORY_FIRSTS,
        12,
        cdc=True,
        tags=("cup", "drink", "drinking", "open cup"),
    ),
    Milestone(
        "feeds_self",
        "Feeds themself with fingers",
        CATEGORY_FIRSTS,
        18,
        cdc=True,
        tags=("self feeding", "finger food", "eats", "feeds"),
    ),
    Milestone(
        "sleeps_through_night",
        "Sleeps through the night",
        CATEGORY_FIRSTS,
        None,
        tags=("sleep", "sleeping", "night", "slept through"),
    ),
    Milestone(
        "first_haircut", "First haircut", CATEGORY_FIRSTS, None, tags=("haircut", "hair", "barber", "trim")
    ),
)

MILESTONES_BY_KEY: Final[dict[str, Milestone]] = {m.key: m for m in MILESTONES}

# Danish names and search words, by milestone key.
MILESTONES_DA: Final[dict[str, tuple[str, tuple[str, ...]]]] = {
    "head_up_tummy": ("Løfter hovedet på maven", ("hoved", "løfter hovedet", "mavetid", "nakke")),
    "head_steady": ("Holder hovedet stille, når den bæres", ("hovedkontrol", "nakke", "holder hovedet")),
    "pushes_up": (
        "Skubber sig op på underarmene på maven",
        ("skubber op", "underarme", "mavetid", "armstrækning"),
    ),
    "rolls_tummy_to_back": (
        "Ruller fra mave til ryg",
        ("ruller", "rulle", "ruller rundt", "vender sig", "vende"),
    ),
    "rolls_back_to_tummy": (
        "Ruller fra ryg til mave",
        ("ruller", "rulle", "ruller rundt", "vender sig", "vende"),
    ),
    "sits_without_support": ("Sidder uden støtte", ("sidder", "sidde", "sidder selv", "sad")),
    "crawls": ("Kravler", ("kravle", "kravler", "kravlede", "mavekravler", "rumpe")),
    "pulls_to_stand": ("Trækker sig op at stå", ("står", "stå", "rejser sig", "trækker sig op")),
    "cruises": ("Går langs møblerne", ("går langs", "møbler", "går med støtte")),
    "pincer_grasp": (
        "Samler ting op mellem tommel- og pegefinger",
        ("pincetgreb", "greb", "samler op", "fingre", "griber"),
    ),
    "first_steps": ("Første skridt på egen hånd", ("går", "gå", "skridt", "gik", "første skridt")),
    "walks": ("Går uden at holde fast", ("går", "gå", "går selv", "gik")),
    "coos": ("Pludrer (“ooo”, “aah”)", ("pludre", "pludrer", "lyde", "vokaler")),
    "laughs": ("Griner", ("grine", "griner", "grinede", "fniser", "klukker")),
    "babbles": ("Babler (“mamama”, “bababa”)", ("bable", "babler", "mama", "dada", "stavelser")),
    "responds_to_name": ("Kigger, når du siger navnet", ("navn", "reagerer på navn", "kigger")),
    "waves": ("Vinker farvel", ("vinke", "vinker", "farvel", "hej hej")),
    "first_word": (
        "Første ord (“mor”, “far” …)",
        ("ord", "tale", "taler", "siger", "mor", "far", "mama", "dada"),
    ),
    "points": ("Peger for at vise dig noget", ("pege", "peger", "viser")),
    "three_words": ("Siger tre eller flere ord", ("ord", "ordforråd", "tale", "taler")),
    "two_word_phrases": ("Sætter to ord sammen", ("sætning", "to ord", "tale", "taler")),
    "first_smile": ("Første sociale smil", ("smil", "smiler", "smilede", "socialt smil")),
    "knows_familiar_people": ("Kender velkendte personer", ("genkender", "kendte ansigter", "fremmede")),
    "plays_peekaboo": ("Leger borte-tit-tit", ("borte tit tit", "tit tit", "gemmeleg", "titte")),
    "pat_a_cake": ("Klapper i hænderne", ("klappe", "klapper", "klap", "klappe kage")),
    "first_solid_food": (
        "Første faste føde",
        ("mad", "grød", "mos", "smagsportioner", "spiser", "første måltid"),
    ),
    "first_tooth": ("Første tand", ("tand", "tænder", "tandfrembrud", "får tænder")),
    "drinks_from_cup": ("Drikker af en åben kop (med hjælp)", ("kop", "drikke", "drikker", "åben kop")),
    "feeds_self": ("Spiser selv med fingrene", ("spiser selv", "fingermad", "spiser")),
    "sleeps_through_night": ("Sover hele natten", ("søvn", "sover", "nat", "sov igennem")),
    "first_haircut": ("Første klipning", ("klipning", "hår", "frisør", "klippe")),
}


def milestone_translations(key: str) -> dict[str, dict[str, object]]:
    """Return a built-in milestone's names and search words in other languages."""
    name, tags = MILESTONES_DA[key]
    return {"da": {"name": name, "tags": list(tags)}}


def localized_milestone_name(key: str, fallback: str, language: str | None) -> str:
    """Return a built-in milestone's name in a language, or ``fallback``."""
    if language and language.lower().startswith("da") and key in MILESTONES_DA:
        return MILESTONES_DA[key][0]
    return fallback
