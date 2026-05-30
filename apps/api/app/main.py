from __future__ import annotations

from io import BytesIO
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from openai import OpenAI
from pydantic import BaseModel, Field

from .captioning import CaptionGroup, GroupingSettings, Word, export_srt, group_words


app = FastAPI(title="CapCut Caption API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WordPayload(BaseModel):
    id: str
    text: str
    start: float
    end: float
    confidence: float | None = None


class GroupPayload(BaseModel):
    id: str
    word_ids: list[str] = Field(alias="wordIds")
    text: str
    start: float
    end: float


class GroupingSettingsPayload(BaseModel):
    max_words: int = Field(default=3, alias="maxWords", ge=1, le=6)
    min_duration: float = Field(default=0.26, alias="minDuration", ge=0)
    max_chars: int = Field(default=26, alias="maxChars", ge=8)
    pause_threshold: float = Field(default=0.42, alias="pauseThreshold", ge=0)


class RegroupRequest(BaseModel):
    words: list[WordPayload]
    settings: GroupingSettingsPayload = Field(default_factory=GroupingSettingsPayload)


class RegroupResponse(BaseModel):
    groups: list[GroupPayload]


class SrtRequest(BaseModel):
    groups: list[GroupPayload]


class TranscribeResponse(BaseModel):
    language: str | None = None
    duration: float | None = None
    text: str
    words: list[WordPayload]
    groups: list[GroupPayload]


def _to_settings(payload: GroupingSettingsPayload) -> GroupingSettings:
    return GroupingSettings(
        max_words=payload.max_words,
        min_duration=payload.min_duration,
        max_chars=payload.max_chars,
        pause_threshold=payload.pause_threshold,
    )


def _to_words(payload: list[WordPayload]) -> list[Word]:
    return [
        Word(
            id=item.id,
            text=item.text,
            start=item.start,
            end=item.end,
            confidence=item.confidence,
        )
        for item in payload
    ]


def _to_group_payloads(groups: list[CaptionGroup]) -> list[GroupPayload]:
    return [
        GroupPayload(
            id=group.id,
            wordIds=group.word_ids,
            text=group.text,
            start=group.start,
            end=group.end,
        )
        for group in groups
    ]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/regroup", response_model=RegroupResponse)
def regroup(payload: RegroupRequest) -> RegroupResponse:
    grouped = group_words(_to_words(payload.words), _to_settings(payload.settings))
    return RegroupResponse(groups=_to_group_payloads(grouped))


@app.post("/api/export/srt", response_class=PlainTextResponse)
def export_srt_route(payload: SrtRequest) -> str:
    groups = [
        CaptionGroup(
            id=item.id,
            word_ids=item.word_ids,
            text=item.text,
            start=item.start,
            end=item.end,
        )
        for item in payload.groups
    ]
    return export_srt(groups)


@app.post("/api/transcribe", response_model=TranscribeResponse)
async def transcribe(
    file: Annotated[UploadFile, File()],
    language: Annotated[str | None, Form()] = None,
) -> TranscribeResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing upload filename.")

    client = OpenAI()
    audio = BytesIO(await file.read())
    audio.name = file.filename

    try:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio,
            language=language or None,
            response_format="verbose_json",
            timestamp_granularities=["word"],
        )
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    finally:
        audio.close()

    raw_words = getattr(transcript, "words", None) or []
    words = [
        WordPayload(
            id=f"w_{index:05d}",
            text=getattr(item, "word", "").strip(),
            start=float(getattr(item, "start", 0)),
            end=float(getattr(item, "end", 0)),
        )
        for index, item in enumerate(raw_words, start=1)
        if getattr(item, "word", "").strip()
    ]

    grouped = group_words(_to_words(words), GroupingSettings())
    return TranscribeResponse(
        language=getattr(transcript, "language", language),
        duration=getattr(transcript, "duration", None),
        text=getattr(transcript, "text", ""),
        words=words,
        groups=_to_group_payloads(grouped),
    )
