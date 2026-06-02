from __future__ import annotations

import asyncio
import json
import shutil
import tempfile
from pathlib import Path
from typing import Annotated, Any

from starlette.background import BackgroundTask
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
from .alignment import AlignmentError, MfaAlignmentBackend, MfaOptions, align_audio_segment
from .audio_processing import AudioProcessingError, EDITOR_AUDIO_BITRATE, extract_editor_audio
from .transcription import (
    FallbackTranscriptionBackend,
    OpenAiTranscriptionBackend,
    StableTsOptions,
    StableTsTranscriptionBackend,
    TranscriptionBackend,
    TranscriptionError,
    transcribe_audio,
    transcribe_audio_segment,
)


app = FastAPI(title="CapCut Caption API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Editor-Audio-Bitrate"],
)


class Settings(BaseSettings):
    openai_api_key: str = ""
    transcription_provider: str = "auto"
    max_segment_transcription_ranges: int = Field(default=120, ge=1, le=500)
    max_parallel_segment_transcriptions: int = Field(default=8, ge=1, le=32)
    stable_ts_model: str = "base"
    stable_ts_device: str | None = None
    stable_ts_download_root: str | None = None
    stable_ts_dynamic_quantization: bool = False
    stable_ts_vad: bool = True
    stable_ts_vad_threshold: float = Field(default=0.35, ge=0, le=1)
    stable_ts_min_word_duration: float | None = Field(default=0.1, ge=0)
    stable_ts_min_silence_duration: float | None = Field(default=None, ge=0)
    stable_ts_nonspeech_error: float = Field(default=0.1, ge=0)
    stable_ts_nonspeech_skip: float | None = Field(default=5.0, ge=0)
    stable_ts_only_voice_freq: bool = False
    stable_ts_suppress_ts_tokens: bool = False
    stable_ts_condition_on_previous_text: bool = False
    stable_ts_refine: bool = False
    mfa_command: str = "mfa"
    mfa_dictionary: str | None = None
    mfa_acoustic_model: str | None = None
    mfa_g2p_model: str | None = None
    mfa_num_jobs: int = Field(default=1, ge=1, le=16)
    mfa_timeout_seconds: int = Field(default=180, ge=10, le=3600)
    mfa_single_speaker: bool = True
    mfa_clean: bool = True
    mfa_textgrid_cleanup: bool = True
    mfa_fine_tune: bool = False
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


class AlignmentResponse(BaseModel):
    language: str | None = None
    text: str
    words: list[WordPayload]
    unmatched_words: list[str] = Field(alias="unmatchedWords")
    diagnostics: dict[str, Any] = Field(default_factory=dict)


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


def _safe_media_stem(filename: str) -> str:
    stem = Path(filename).stem.strip()
    safe_stem = "".join(char if char.isalnum() or char in "._-" else "-" for char in stem)
    safe_stem = safe_stem.strip(".-_")
    return safe_stem or "source-media"


async def _save_upload_file(upload: UploadFile, destination: Path) -> None:
    with destination.open("wb") as output:
        while chunk := await upload.read(1024 * 1024):
            output.write(chunk)


def _stable_ts_options() -> StableTsOptions:
    return StableTsOptions(
        model=settings.stable_ts_model,
        device=settings.stable_ts_device,
        download_root=settings.stable_ts_download_root,
        dynamic_quantization=settings.stable_ts_dynamic_quantization,
        vad=settings.stable_ts_vad,
        vad_threshold=settings.stable_ts_vad_threshold,
        min_word_duration=settings.stable_ts_min_word_duration,
        min_silence_duration=settings.stable_ts_min_silence_duration,
        nonspeech_error=settings.stable_ts_nonspeech_error,
        nonspeech_skip=settings.stable_ts_nonspeech_skip,
        only_voice_freq=settings.stable_ts_only_voice_freq,
        suppress_ts_tokens=settings.stable_ts_suppress_ts_tokens,
        condition_on_previous_text=settings.stable_ts_condition_on_previous_text,
        refine=settings.stable_ts_refine,
    )


def _openai_transcription_backend(required: bool) -> OpenAiTranscriptionBackend | None:
    if not settings.openai_api_key:
        if required:
            raise HTTPException(
                status_code=400,
                detail="OPENAI_API_KEY is missing. Add it to apps/api/.env and restart the API server.",
            )
        return None
    return OpenAiTranscriptionBackend(OpenAI(api_key=settings.openai_api_key))


def _transcription_backend() -> TranscriptionBackend:
    provider = settings.transcription_provider.strip().lower().replace("_", "-")
    if provider == "openai":
        openai_backend = _openai_transcription_backend(required=True)
        if openai_backend is None:
            raise HTTPException(status_code=400, detail="OPENAI_API_KEY is missing.")
        return openai_backend
    if provider in {"stable", "stable-ts"}:
        return StableTsTranscriptionBackend(_stable_ts_options())
    if provider == "auto":
        return FallbackTranscriptionBackend(
            StableTsTranscriptionBackend(_stable_ts_options()),
            _openai_transcription_backend(required=False),
        )
    raise HTTPException(
        status_code=400,
        detail="TRANSCRIPTION_PROVIDER must be one of: auto, stable-ts, openai.",
    )


def _mfa_alignment_backend() -> MfaAlignmentBackend:
    return MfaAlignmentBackend(
        MfaOptions(
            command=settings.mfa_command,
            dictionary=settings.mfa_dictionary,
            acoustic_model=settings.mfa_acoustic_model,
            g2p_model=settings.mfa_g2p_model,
            num_jobs=settings.mfa_num_jobs,
            timeout_seconds=settings.mfa_timeout_seconds,
            single_speaker=settings.mfa_single_speaker,
            clean=settings.mfa_clean,
            textgrid_cleanup=settings.mfa_textgrid_cleanup,
            fine_tune=settings.mfa_fine_tune,
        )
    )


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


@app.post("/api/media/extract-audio")
async def extract_media_audio(file: Annotated[UploadFile, File()]) -> FileResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing upload filename.")

    work_dir = Path(tempfile.mkdtemp(prefix="capcut-caption-media-"))
    safe_stem = _safe_media_stem(file.filename)
    source_path = work_dir / f"{safe_stem}{Path(file.filename).suffix}"
    output_name = f"{safe_stem}-audio.mp3"
    output_path = work_dir / output_name

    try:
        await _save_upload_file(file, source_path)
        await asyncio.to_thread(extract_editor_audio, source_path, output_path)
    except AudioProcessingError as error:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=502, detail=str(error)) from error
    except OSError as error:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Could not stage selected media: {error}") from error

    return FileResponse(
        output_path,
        media_type="audio/mpeg",
        filename=output_name,
        background=BackgroundTask(lambda: shutil.rmtree(work_dir, ignore_errors=True)),
        headers={"X-Editor-Audio-Bitrate": EDITOR_AUDIO_BITRATE},
    )


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

    backend = _transcription_backend()
    audio_bytes = await file.read()

    try:
        transcript = await asyncio.to_thread(transcribe_audio, backend, file.filename, audio_bytes, language or None)
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

    backend = _transcription_backend()
    audio_bytes = await file.read()

    try:
        transcript = await asyncio.to_thread(
            transcribe_audio_segment,
            backend,
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

    segment_ranges = _parse_segment_ranges(ranges)
    backend = _transcription_backend()
    audio_bytes = await file.read()
    semaphore = asyncio.Semaphore(settings.max_parallel_segment_transcriptions)

    async def transcribe_range(index: int, segment_range: SegmentRangePayload):
        async with semaphore:
            transcript = await asyncio.to_thread(
                transcribe_audio_segment,
                backend,
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


@app.post("/api/align/segment", response_model=AlignmentResponse)
async def align_segment(
    file: Annotated[UploadFile, File()],
    start: Annotated[float, Form(ge=0)],
    end: Annotated[float, Form(gt=0)],
    text: Annotated[str, Form(min_length=1)],
    language: Annotated[str | None, Form()] = None,
) -> AlignmentResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing upload filename.")
    if end <= start:
        raise HTTPException(status_code=400, detail="Segment end must be after start.")

    audio_bytes = await file.read()
    try:
        result = await asyncio.to_thread(
            align_audio_segment,
            _mfa_alignment_backend(),
            file.filename,
            audio_bytes,
            text,
            language or None,
            start,
            end,
        )
    except AlignmentError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return AlignmentResponse(
        language=result.language,
        text=result.text,
        words=_to_word_payloads(result.words, "w_align"),
        unmatchedWords=result.unmatched_words,
        diagnostics=result.diagnostics,
    )
