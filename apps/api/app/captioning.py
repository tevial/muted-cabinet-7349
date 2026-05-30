from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


CONNECTOR_WORDS = {
    "а",
    "але",
    "без",
    "бо",
    "в",
    "від",
    "до",
    "з",
    "за",
    "і",
    "й",
    "коли",
    "на",
    "не",
    "ну",
    "та",
    "то",
    "у",
    "це",
    "що",
    "як",
    "якщо",
}


@dataclass(frozen=True)
class Word:
    id: str
    text: str
    start: float
    end: float
    confidence: float | None = None


@dataclass(frozen=True)
class CaptionGroup:
    id: str
    word_ids: list[str]
    text: str
    start: float
    end: float


@dataclass(frozen=True)
class GroupingSettings:
    max_words: int = 3
    min_duration: float = 0.26
    max_chars: int = 26
    pause_threshold: float = 0.42


def normalize_word(text: str) -> str:
    return text.strip().lower().strip(".,!?;:\"'()[]{}")


def is_connector(text: str) -> bool:
    return normalize_word(text) in CONNECTOR_WORDS


def group_words(words: Iterable[Word], settings: GroupingSettings) -> list[CaptionGroup]:
    groups: list[CaptionGroup] = []
    current: list[Word] = []

    def commit() -> None:
        nonlocal current
        if not current:
            return
        first = current[0]
        last = current[-1]
        groups.append(
            CaptionGroup(
                id=f"g_{len(groups) + 1:04d}",
                word_ids=[word.id for word in current],
                text=" ".join(word.text for word in current),
                start=first.start,
                end=last.end,
            )
        )
        current = []

    for word in words:
        if not current:
            current.append(word)
            continue

        previous = current[-1]
        candidate = current + [word]
        candidate_text = " ".join(item.text for item in candidate)
        duration = word.end - current[0].start
        gap = word.start - previous.end
        previous_is_connector = is_connector(previous.text)
        word_is_connector = is_connector(word.text)

        should_join = (
            previous_is_connector
            or word_is_connector
            or duration < settings.min_duration
        )
        exceeds_limits = (
            len(candidate) > settings.max_words
            or len(candidate_text) > settings.max_chars
            or gap > settings.pause_threshold
        )

        if should_join and not exceeds_limits:
            current.append(word)
            continue

        if len(current) == 1 and is_connector(current[0].text) and not exceeds_limits:
            current.append(word)
            continue

        commit()
        current.append(word)

    commit()
    return groups


def seconds_to_srt_time(seconds: float) -> str:
    milliseconds_total = round(seconds * 1000)
    hours, rest = divmod(milliseconds_total, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    secs, millis = divmod(rest, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def export_srt(groups: Iterable[CaptionGroup]) -> str:
    blocks = []
    for index, group in enumerate(groups, start=1):
        start = seconds_to_srt_time(group.start)
        end = seconds_to_srt_time(group.end)
        blocks.append(f"{index}\n{start} --> {end}\n{group.text}")
    return "\n\n".join(blocks) + "\n"

