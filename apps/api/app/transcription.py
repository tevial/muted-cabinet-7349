from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass, replace
from io import BytesIO
from pathlib import Path
from typing import Any

from openai import OpenAI


TRANSCRIPTION_MODEL = "whisper-1"
TRANSCRIPTION_RESPONSE_FORMAT = "verbose_json"
TRANSCRIPTION_TIMESTAMP_GRANULARITIES = ["word"]
CHUNK_SECONDS = 30.0
CHUNK_OVERLAP_SECONDS = 1.0
CHUNKING_THRESHOLD_SECONDS = CHUNK_SECONDS + CHUNK_OVERLAP_SECONDS
BOUNDARY_EPSILON_SECONDS = 0.05


class TranscriptionError(RuntimeError):
    pass


@dataclass(frozen=True)
class TranscribedWord:
    text: str
    start: float
    end: float
    confidence: float | None = None


@dataclass(frozen=True)
class TranscriptionResult:
    language: str | None
    duration: float | None
    text: str
    words: list[TranscribedWord]


@dataclass(frozen=True)
class AudioChunk:
    path: Path
    name: str
    offset: float
    accept_start: float
    accept_end: float


def transcribe_audio(
    client: OpenAI,
    filename: str,
    audio_bytes: bytes,
    language: str | None,
) -> TranscriptionResult:
    safe_filename = Path(filename).name or "upload"

    with tempfile.TemporaryDirectory(prefix="capcut-caption-transcribe-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        source_path = temp_dir / safe_filename
        source_path.write_bytes(audio_bytes)

        duration = _probe_duration(source_path)
        if duration is None or duration <= CHUNKING_THRESHOLD_SECONDS or not _has_ffmpeg():
            return _transcribe_bytes(client, safe_filename, audio_bytes, language, duration=duration)

        chunks = _create_chunks(source_path, safe_filename, duration, temp_dir)
        return _transcribe_chunks(client, chunks, language, duration)


def transcribe_audio_segment(
    client: OpenAI,
    filename: str,
    audio_bytes: bytes,
    language: str | None,
    start: float,
    end: float,
) -> TranscriptionResult:
    safe_start = max(0.0, start)
    safe_end = max(safe_start, end)
    if safe_end - safe_start <= 0:
        raise TranscriptionError("Selected segment is empty.")

    if not _has_ffmpeg():
        raise TranscriptionError("ffmpeg is required to transcribe a selected segment.")

    safe_filename = Path(filename).name or "upload"
    with tempfile.TemporaryDirectory(prefix="capcut-caption-segment-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        source_path = temp_dir / safe_filename
        source_path.write_bytes(audio_bytes)

        duration = _probe_duration(source_path)
        if duration is not None:
            safe_start = min(safe_start, duration)
            safe_end = min(safe_end, duration)
        if safe_end - safe_start <= 0:
            raise TranscriptionError("Selected segment is outside the audio duration.")

        segment_path = temp_dir / f"{Path(safe_filename).stem or 'upload'}-selection.wav"
        _create_segment(source_path, segment_path, safe_start, safe_end - safe_start)
        segment_result = _transcribe_bytes(
            client,
            segment_path.name,
            segment_path.read_bytes(),
            language,
            duration=safe_end - safe_start,
        )

        return TranscriptionResult(
            language=segment_result.language,
            duration=duration,
            text=segment_result.text,
            words=[
                replace(
                    word,
                    start=word.start + safe_start,
                    end=word.end + safe_start,
                )
                for word in segment_result.words
            ],
        )


def _has_ffmpeg() -> bool:
    return bool(shutil.which("ffmpeg"))


def _probe_duration(path: Path) -> float | None:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None

    try:
        completed = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None

    try:
        duration = float(completed.stdout.strip())
    except ValueError:
        return None

    return duration if duration > 0 else None


def _create_chunks(source_path: Path, filename: str, duration: float, temp_dir: Path) -> list[AudioChunk]:
    chunks: list[AudioChunk] = []
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return chunks

    logical_start = 0.0
    index = 1
    while logical_start < duration:
        accept_start = logical_start
        accept_end = min(logical_start + CHUNK_SECONDS, duration)
        window_start = max(0.0, accept_start - CHUNK_OVERLAP_SECONDS)
        window_end = min(duration, accept_end + CHUNK_OVERLAP_SECONDS)
        window_duration = window_end - window_start
        output_path = temp_dir / f"{Path(filename).stem or 'upload'}-chunk-{index:04d}.wav"

        try:
            subprocess.run(
                [
                    ffmpeg,
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-ss",
                    f"{window_start:.3f}",
                    "-t",
                    f"{window_duration:.3f}",
                    "-i",
                    str(source_path),
                    "-vn",
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-c:a",
                    "pcm_s16le",
                    str(output_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError) as error:
            raise TranscriptionError(f"Could not prepare audio chunk {index}: {error}") from error

        chunks.append(
            AudioChunk(
                path=output_path,
                name=output_path.name,
                offset=window_start,
                accept_start=accept_start,
                accept_end=accept_end,
            ),
        )
        logical_start += CHUNK_SECONDS
        index += 1

    return chunks


def _create_segment(source_path: Path, output_path: Path, start: float, duration: float) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise TranscriptionError("ffmpeg is required to prepare the selected segment.")

    try:
        subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-ss",
                f"{start:.3f}",
                "-t",
                f"{duration:.3f}",
                "-i",
                str(source_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                str(output_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise TranscriptionError(f"Could not prepare selected audio segment: {error}") from error


def _transcribe_chunks(
    client: OpenAI,
    chunks: list[AudioChunk],
    language: str | None,
    duration: float,
) -> TranscriptionResult:
    if not chunks:
        raise TranscriptionError("Could not prepare audio chunks.")

    language_result: str | None = None
    words: list[TranscribedWord] = []

    for chunk in chunks:
        transcript = _request_transcription(client, chunk.name, chunk.path.read_bytes(), language)
        language_result = language_result or _get_string_attr(transcript, "language") or language

        for word in _extract_words(transcript):
            adjusted = TranscribedWord(
                text=word.text,
                start=word.start + chunk.offset,
                end=word.end + chunk.offset,
                confidence=word.confidence,
            )
            if _is_inside_chunk_acceptance(adjusted, chunk):
                words.append(adjusted)

    words = _sort_and_deduplicate_words(words)
    return TranscriptionResult(
        language=language_result or language,
        duration=duration,
        text=" ".join(word.text for word in words),
        words=words,
    )


def _transcribe_bytes(
    client: OpenAI,
    filename: str,
    audio_bytes: bytes,
    language: str | None,
    duration: float | None,
) -> TranscriptionResult:
    transcript = _request_transcription(client, filename, audio_bytes, language)
    words = _sort_and_deduplicate_words(_extract_words(transcript))

    return TranscriptionResult(
        language=_get_string_attr(transcript, "language") or language,
        duration=_get_float_attr(transcript, "duration") or duration,
        text=_get_string_attr(transcript, "text") or " ".join(word.text for word in words),
        words=words,
    )


def _request_transcription(client: OpenAI, filename: str, audio_bytes: bytes, language: str | None) -> Any:
    audio = BytesIO(audio_bytes)
    audio.name = filename

    try:
        return client.audio.transcriptions.create(
            model=TRANSCRIPTION_MODEL,
            file=audio,
            language=language or None,
            response_format=TRANSCRIPTION_RESPONSE_FORMAT,
            timestamp_granularities=TRANSCRIPTION_TIMESTAMP_GRANULARITIES,
        )
    except Exception as error:
        raise TranscriptionError(str(error)) from error
    finally:
        audio.close()


def _extract_words(transcript: Any) -> list[TranscribedWord]:
    words: list[TranscribedWord] = []

    for item in getattr(transcript, "words", None) or []:
        text = str(getattr(item, "word", "")).strip()
        if not text:
            continue

        start = _get_float_attr(item, "start")
        end = _get_float_attr(item, "end")
        if start is None or end is None or end <= start:
            continue

        confidence = _get_float_attr(item, "confidence")
        words.append(TranscribedWord(text=text, start=start, end=end, confidence=confidence))

    return words


def _is_inside_chunk_acceptance(word: TranscribedWord, chunk: AudioChunk) -> bool:
    starts_after_chunk_start = word.start >= chunk.accept_start - BOUNDARY_EPSILON_SECONDS
    starts_before_chunk_end = word.start < chunk.accept_end - BOUNDARY_EPSILON_SECONDS
    return starts_after_chunk_start and starts_before_chunk_end


def _sort_and_deduplicate_words(words: list[TranscribedWord]) -> list[TranscribedWord]:
    sorted_words = sorted(words, key=lambda word: (word.start, word.end, word.text))
    deduplicated: list[TranscribedWord] = []

    for word in sorted_words:
        if not deduplicated:
            deduplicated.append(word)
            continue

        previous = deduplicated[-1]
        same_text = _normalize_word(previous.text) == _normalize_word(word.text)
        overlaps_previous = word.start < previous.end + BOUNDARY_EPSILON_SECONDS
        if same_text and overlaps_previous:
            if word.end - word.start > previous.end - previous.start:
                deduplicated[-1] = word
            continue

        if word.start < previous.end:
            if word.end <= previous.end + BOUNDARY_EPSILON_SECONDS:
                continue
            word = replace(word, start=previous.end)

        if word.end > word.start:
            deduplicated.append(word)

    return deduplicated


def _normalize_word(text: str) -> str:
    return text.strip().lower().strip(".,!?;:\"'()[]{}—–-")


def _get_string_attr(value: Any, name: str) -> str | None:
    candidate = getattr(value, name, None)
    if candidate is None:
        return None
    return str(candidate).strip() or None


def _get_float_attr(value: Any, name: str) -> float | None:
    try:
        return float(getattr(value, name))
    except (AttributeError, TypeError, ValueError):
        return None
