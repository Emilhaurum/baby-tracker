"""Built-in milestones shown on the milestone board.

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


MILESTONES: Final[tuple[Milestone, ...]] = (
    # Movement
    Milestone("head_up_tummy", "Holds head up on tummy", CATEGORY_MOVEMENT, 2, cdc=True),
    Milestone("head_steady", "Holds head steady when held", CATEGORY_MOVEMENT, 4, cdc=True),
    Milestone("pushes_up", "Pushes up on forearms on tummy", CATEGORY_MOVEMENT, 4, cdc=True),
    Milestone("rolls_tummy_to_back", "Rolls from tummy to back", CATEGORY_MOVEMENT, 6, cdc=True),
    Milestone("rolls_back_to_tummy", "Rolls from back to tummy", CATEGORY_MOVEMENT, 7),
    Milestone("sits_without_support", "Sits without support", CATEGORY_MOVEMENT, 9, cdc=True),
    Milestone("crawls", "Crawls", CATEGORY_MOVEMENT, 9),
    Milestone("pulls_to_stand", "Pulls up to stand", CATEGORY_MOVEMENT, 12, cdc=True),
    Milestone("cruises", "Walks holding on to furniture", CATEGORY_MOVEMENT, 12, cdc=True),
    Milestone("pincer_grasp", "Picks things up between thumb and finger", CATEGORY_MOVEMENT, 12, cdc=True),
    Milestone("first_steps", "First steps on their own", CATEGORY_MOVEMENT, 12),
    Milestone("walks", "Walks without holding on", CATEGORY_MOVEMENT, 18, cdc=True),
    # Communication
    Milestone("coos", "Coos (“ooo”, “aah”)", CATEGORY_COMMUNICATION, 4, cdc=True),
    Milestone("laughs", "Laughs", CATEGORY_COMMUNICATION, 6, cdc=True),
    Milestone("babbles", "Babbles (“mamama”, “bababa”)", CATEGORY_COMMUNICATION, 9, cdc=True),
    Milestone("responds_to_name", "Looks when you say their name", CATEGORY_COMMUNICATION, 9, cdc=True),
    Milestone("waves", "Waves bye-bye", CATEGORY_COMMUNICATION, 12, cdc=True),
    Milestone("first_word", "First word (“mama”, “dada” …)", CATEGORY_COMMUNICATION, 12, cdc=True),
    Milestone("points", "Points to show you something", CATEGORY_COMMUNICATION, 18, cdc=True),
    Milestone("three_words", "Says three or more words", CATEGORY_COMMUNICATION, 18, cdc=True),
    Milestone("two_word_phrases", "Puts two words together", CATEGORY_COMMUNICATION, 24, cdc=True),
    # Social
    Milestone("first_smile", "First social smile", CATEGORY_SOCIAL, 2, cdc=True),
    Milestone("knows_familiar_people", "Knows familiar people", CATEGORY_SOCIAL, 6, cdc=True),
    Milestone("plays_peekaboo", "Plays peek-a-boo", CATEGORY_SOCIAL, 9, cdc=True),
    Milestone("pat_a_cake", "Plays pat-a-cake", CATEGORY_SOCIAL, 12, cdc=True),
    # Firsts
    Milestone("first_solid_food", "First solid food", CATEGORY_FIRSTS, 6),
    Milestone("first_tooth", "First tooth", CATEGORY_FIRSTS, 6),
    Milestone("drinks_from_cup", "Drinks from an open cup (with help)", CATEGORY_FIRSTS, 12, cdc=True),
    Milestone("feeds_self", "Feeds themself with fingers", CATEGORY_FIRSTS, 18, cdc=True),
    Milestone("sleeps_through_night", "Sleeps through the night", CATEGORY_FIRSTS, None),
    Milestone("first_haircut", "First haircut", CATEGORY_FIRSTS, None),
)

MILESTONES_BY_KEY: Final[dict[str, Milestone]] = {m.key: m for m in MILESTONES}
