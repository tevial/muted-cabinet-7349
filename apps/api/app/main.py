from __future__ import annotations

import asyncio
import json
from typing import Annotated, Any

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from openai import OpenAI
from pydantic import BaseModel, Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

from .capcut_draft import (
    CaptionPatch,
    CapCutDraftError,
    TimeRange,
    inspect_capcut_draft,
    patch_capcut_draft,
    preview_capcut_patch,
)
from .capcut_local_agent import (
    CapCutLocalAgentError,
    get_default_projects_root,
    get_local_agent_status,
    get_project_cover_path,
    list_capcut_projects,
)
from .capcut_timeline import (
    build_capcut_timeline_map,
    get_import_stem_path,
    render_capcut_track_stems,
    render_capcut_source_preview,
)
from .captioning import CaptionGroup, GroupingSettings, Word, export_srt, group_words
from .transcription import TranscriptionError, transcribe_audio, transcribe_audio_segment


app = FastAPI(title="CapCut Caption API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Settings(BaseSettings):
    openai_api_key: str = ""
    max_segment_transcription_ranges: int = Field(default=120, ge=1, le=500)
    max_parallel_segment_transcriptions: int = Field(default=8, ge=1, le=32)
    capcut_local_agent_enabled: bool = True
    capcut_projects_root: str = Field(default_factory=get_default_projects_root)
    capcut_project_scan_limit: int = Field(default=120, ge=1, le=500)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()


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


class SegmentRangePayload(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)


class TimeRangePayload(BaseModel):
    model_config = {"populate_by_name": True}

    start: float = Field(ge=0)
    end: float = Field(gt=0)


class CaptionPatchPayload(BaseModel):
    model_config = {"populate_by_name": True}

    text: str
    start: float = Field(ge=0)
    end: float = Field(gt=0)


class CapCutInspectRequest(BaseModel):
    model_config = {"populate_by_name": True}

    project_path: str = Field(alias="projectPath")


class CapCutPatchRequest(BaseModel):
    model_config = {"populate_by_name": True}

    project_path: str = Field(alias="projectPath")
    captions: list[CaptionPatchPayload] = Field(default_factory=list)
    duration: float | None = Field(default=None, ge=0)
    kept_ranges: list[TimeRangePayload] | None = Field(default=None, alias="keptRanges")
    skip_zones: list[TimeRangePayload] | None = Field(default=None, alias="skipZones")


class CapCutSourcePreviewRequest(BaseModel):
    model_config = {"populate_by_name": True}

    media_path: str = Field(alias="mediaPath")
    start: float = Field(ge=0)
    end: float = Field(gt=0)


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


def _is_meaningful_word_text(text: str) -> bool:
    return any(char.isalnum() for char in text.strip())


def _to_word_payloads(words: list, id_prefix: str) -> list[WordPayload]:
    meaningful_words = [item for item in words if _is_meaningful_word_text(item.text)]

    return [
        WordPayload(
            id=f"{id_prefix}_{index:05d}",
            text=item.text,
            start=item.start,
            end=item.end,
            confidence=item.confidence,
        )
        for index, item in enumerate(meaningful_words, start=1)
    ]


def _build_transcribe_response(transcript, word_id_prefix: str) -> TranscribeResponse:
    words = _to_word_payloads(transcript.words, word_id_prefix)
    grouped = group_words(_to_words(words), GroupingSettings())

    return TranscribeResponse(
        language=transcript.language,
        duration=transcript.duration,
        text=" ".join(word.text for word in words),
        words=words,
        groups=_to_group_payloads(grouped),
    )


def _parse_segment_ranges(raw_ranges: str) -> list[SegmentRangePayload]:
    try:
        parsed_ranges = json.loads(raw_ranges)
        ranges = [SegmentRangePayload.model_validate(item) for item in parsed_ranges]
    except (TypeError, json.JSONDecodeError, ValidationError) as error:
        raise HTTPException(status_code=400, detail="Segment ranges must be a valid JSON array.") from error

    if not ranges:
        raise HTTPException(status_code=400, detail="At least one segment range is required.")
    if len(ranges) > settings.max_segment_transcription_ranges:
        raise HTTPException(
            status_code=400,
            detail=f"At most {settings.max_segment_transcription_ranges} segment ranges can be transcribed at once.",
        )
    if any(item.end <= item.start for item in ranges):
        raise HTTPException(status_code=400, detail="Every segment end must be after its start.")

    return ranges


def _to_time_ranges(payload: list[TimeRangePayload] | None) -> list[TimeRange] | None:
    if payload is None:
        return None
    return [TimeRange(start=item.start, end=item.end) for item in payload]


def _to_caption_patches(payload: list[CaptionPatchPayload]) -> list[CaptionPatch]:
    return [CaptionPatch(text=item.text, start=item.start, end=item.end) for item in payload]


def _capcut_error(error: CapCutDraftError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(error))


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


@app.post("/api/capcut/inspect")
def inspect_capcut_route(payload: CapCutInspectRequest) -> dict[str, Any]:
    try:
        return inspect_capcut_draft(payload.project_path)
    except CapCutDraftError as error:
        raise _capcut_error(error) from error


@app.post("/api/capcut/timeline-map")
def capcut_timeline_map_route(payload: CapCutInspectRequest) -> dict[str, Any]:
    try:
        return build_capcut_timeline_map(payload.project_path)
    except CapCutDraftError as error:
        raise _capcut_error(error) from error


@app.post("/api/capcut/import")
def capcut_import_route(payload: CapCutInspectRequest) -> dict[str, Any]:
    try:
        return render_capcut_track_stems(payload.project_path)
    except CapCutDraftError as error:
        raise _capcut_error(error) from error


@app.post("/api/capcut/source-preview")
def capcut_source_preview_route(payload: CapCutSourcePreviewRequest) -> dict[str, Any]:
    try:
        return render_capcut_source_preview(
            media_path=payload.media_path,
            start=payload.start,
            end=payload.end,
        )
    except CapCutDraftError as error:
        raise _capcut_error(error) from error


@app.get("/api/capcut/imports/{import_id}/stems/{filename:path}")
def capcut_import_stem_route(import_id: str, filename: str) -> FileResponse:
    try:
        return FileResponse(get_import_stem_path(import_id, filename), media_type="audio/wav")
    except CapCutDraftError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/capcut/local-agent")
def capcut_local_agent_status_route() -> dict[str, Any]:
    return get_local_agent_status(
        enabled=settings.capcut_local_agent_enabled,
        projects_root=settings.capcut_projects_root,
    )


@app.get("/api/capcut/projects")
def list_capcut_projects_route(limit: int = Query(default=120, ge=1, le=500)) -> dict[str, Any]:
    return list_capcut_projects(
        enabled=settings.capcut_local_agent_enabled,
        projects_root=settings.capcut_projects_root,
        limit=min(limit, settings.capcut_project_scan_limit),
    )


@app.get("/api/capcut/projects/cover")
def capcut_project_cover_route(project_path: str = Query(alias="projectPath")) -> FileResponse:
    try:
        cover_path = get_project_cover_path(
            enabled=settings.capcut_local_agent_enabled,
            projects_root=settings.capcut_projects_root,
            project_path=project_path,
        )
    except CapCutLocalAgentError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    return FileResponse(cover_path)


@app.post("/api/capcut/patch-dry-run")
def patch_capcut_dry_run_route(payload: CapCutPatchRequest) -> dict[str, Any]:
    try:
        return preview_capcut_patch(
            payload.project_path,
            captions=_to_caption_patches(payload.captions),
            duration=payload.duration,
            kept_ranges=_to_time_ranges(payload.kept_ranges),
            skip_zones=_to_time_ranges(payload.skip_zones),
        )
    except CapCutDraftError as error:
        raise _capcut_error(error) from error


@app.post("/api/capcut/patch")
def patch_capcut_route(payload: CapCutPatchRequest) -> dict[str, Any]:
    try:
        return patch_capcut_draft(
            payload.project_path,
            captions=_to_caption_patches(payload.captions),
            duration=payload.duration,
            kept_ranges=_to_time_ranges(payload.kept_ranges),
            skip_zones=_to_time_ranges(payload.skip_zones),
        )
    except CapCutDraftError as error:
        raise _capcut_error(error) from error


@app.post("/api/transcribe", response_model=TranscribeResponse)
async def transcribe(
    file: Annotated[UploadFile, File()],
    language: Annotated[str | None, Form()] = None,
) -> TranscribeResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing upload filename.")

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=400,
            detail="OPENAI_API_KEY is missing. Add it to apps/api/.env and restart the API server.",
        )

    client = OpenAI(api_key=settings.openai_api_key)
    audio_bytes = await file.read()

    try:
        transcript = await asyncio.to_thread(transcribe_audio, client, file.filename, audio_bytes, language or None)
    except TranscriptionError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return _build_transcribe_response(transcript, "w")


@app.post("/api/transcribe/segment", response_model=TranscribeResponse)
async def transcribe_segment(
    file: Annotated[UploadFile, File()],
    start: Annotated[float, Form(ge=0)],
    end: Annotated[float, Form(gt=0)],
    language: Annotated[str | None, Form()] = None,
) -> TranscribeResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing upload filename.")

    if end <= start:
        raise HTTPException(status_code=400, detail="Segment end must be after start.")

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=400,
            detail="OPENAI_API_KEY is missing. Add it to apps/api/.env and restart the API server.",
        )

    client = OpenAI(api_key=settings.openai_api_key)
    audio_bytes = await file.read()

    try:
        transcript = await asyncio.to_thread(
            transcribe_audio_segment,
            client,
            file.filename,
            audio_bytes,
            language or None,
            start,
            end,
        )
    except TranscriptionError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return _build_transcribe_response(transcript, "w_segment")


@app.post("/api/transcribe/segments", response_model=TranscribeResponse)
async def transcribe_segments(
    file: Annotated[UploadFile, File()],
    ranges: Annotated[str, Form()],
    language: Annotated[str | None, Form()] = None,
) -> TranscribeResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing upload filename.")

    if not settings.openai_api_key:
        raise HTTPException(
            status_code=400,
            detail="OPENAI_API_KEY is missing. Add it to apps/api/.env and restart the API server.",
        )

    segment_ranges = _parse_segment_ranges(ranges)
    client = OpenAI(api_key=settings.openai_api_key)
    audio_bytes = await file.read()
    semaphore = asyncio.Semaphore(settings.max_parallel_segment_transcriptions)

    async def transcribe_range(index: int, segment_range: SegmentRangePayload):
        async with semaphore:
            transcript = await asyncio.to_thread(
                transcribe_audio_segment,
                client,
                file.filename,
                audio_bytes,
                language or None,
                segment_range.start,
                segment_range.end,
            )
            return index, transcript

    try:
        indexed_transcripts = await asyncio.gather(
            *[
                transcribe_range(index, segment_range)
                for index, segment_range in enumerate(segment_ranges, start=1)
            ],
        )
    except TranscriptionError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    language_value = next((transcript.language for _, transcript in indexed_transcripts if transcript.language), None)
    duration = max((transcript.duration or 0 for _, transcript in indexed_transcripts), default=None)
    words: list[WordPayload] = []

    for segment_index, transcript in sorted(indexed_transcripts, key=lambda item: item[0]):
        words.extend(_to_word_payloads(transcript.words, f"w_segments_{segment_index:04d}"))

    words.sort(key=lambda item: (item.start, item.end))
    grouped = group_words(_to_words(words), GroupingSettings())

    return TranscribeResponse(
        language=language_value,
        duration=duration,
        text=" ".join(word.text for word in words),
        words=words,
        groups=_to_group_payloads(grouped),
    )
