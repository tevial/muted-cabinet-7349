from __future__ import annotations

import os
import tempfile
import threading
from dataclasses import dataclass, replace
from io import BytesIO
from pathlib import Path
from typing import Any, Protocol

from openai import OpenAI

from .audio_processing import AudioProcessingError, create_mono_wav_segment, has_ffmpeg, probe_duration


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


class TranscriptionBackend(Protocol):
    name: str
    uses_provider_chunking: bool

    def transcribe_bytes(
        self,
        filename: str,
        audio_bytes: bytes,
        language: str | None,
        duration: float | None,
    ) -> TranscriptionResult:
        pass


@dataclass(frozen=True)
class StableTsOptions:
    model: str = "base"
    device: str | None = None
    download_root: str | None = None
    dynamic_quantization: bool = False
    vad: bool = True
    vad_threshold: float = 0.35
    min_word_duration: float | None = 0.1
    min_silence_duration: float | None = None
    nonspeech_error: float = 0.1
    nonspeech_skip: float | None = 5.0
    only_voice_freq: bool = False
    suppress_ts_tokens: bool = False
    condition_on_previous_text: bool = False
    refine: bool = False


class OpenAiTranscriptionBackend:
    name = "openai"
    uses_provider_chunking = False

    def __init__(self, client: OpenAI):
        self._client = client

    def transcribe_bytes(
        self,
        filename: str,
        audio_bytes: bytes,
        language: str | None,
        duration: float | None,
    ) -> TranscriptionResult:
        return _transcribe_bytes_with_openai(self._client, filename, audio_bytes, language, duration)


class StableTsTranscriptionBackend:
    name = "stable-ts"
    uses_provider_chunking = True

    _model_cache: dict[tuple[Any, ...], Any] = {}
    _model_lock = threading.Lock()
    _model_run_lock = threading.Lock()

    def __init__(self, options: StableTsOptions):
        self._options = options

    def transcribe_bytes(
        self,
        filename: str,
        audio_bytes: bytes,
        language: str | None,
        duration: float | None,
    ) -> TranscriptionResult:
        safe_filename = Path(filename).name or "upload.wav"
        with tempfile.TemporaryDirectory(prefix="capcut-caption-stable-ts-") as temp_dir_name:
            source_path = Path(temp_dir_name) / safe_filename
            source_path.write_bytes(audio_bytes)

            model = self._model()
            try:
                with self._model_run_lock:
                    result = model.transcribe(
                        str(source_path),
                        language=language or None,
                        verbose=None,
                        word_timestamps=True,
                        regroup=False,
                        suppress_silence=True,
                        suppress_word_ts=True,
                        vad=self._options.vad,
                        vad_threshold=self._options.vad_threshold,
                        min_word_dur=self._options.min_word_duration,
                        min_silence_dur=self._options.min_silence_duration,
                        nonspeech_error=self._options.nonspeech_error,
                        nonspeech_skip=self._options.nonspeech_skip,
                        only_voice_freq=self._options.only_voice_freq,
                        suppress_ts_tokens=self._options.suppress_ts_tokens,
                        condition_on_previous_text=self._options.condition_on_previous_text,
                    )
                    if self._options.refine:
                        result = model.refine(str(source_path), result, verbose=None)
            except Exception as error:
                raise TranscriptionError(f"stable-ts transcription failed: {error}") from error

            words = _sort_and_deduplicate_words(_extract_stable_ts_words(result))
            return TranscriptionResult(
                language=_get_string_attr(result, "language") or language,
                duration=duration,
                text=_get_string_attr(result, "text") or " ".join(word.text for word in words),
                words=words,
            )

    def _model(self) -> Any:
        cache_key = (
            self._options.model,
            self._options.device,
            self._options.download_root,
            self._options.dynamic_quantization,
        )
        with self._model_lock:
            cached = self._model_cache.get(cache_key)
            if cached is not None:
                return cached

            try:
                import stable_whisper
            except ImportError as error:
                raise TranscriptionError(
                    "stable-ts is not installed. Install apps/api/requirements.txt or set TRANSCRIPTION_PROVIDER=openai."
                ) from error

            try:
                _ensure_ssl_cert_file()
                model = stable_whisper.load_model(
                    self._options.model,
                    device=self._options.device or None,
                    download_root=self._options.download_root or None,
                    dq=self._options.dynamic_quantization,
                )
            except Exception as error:
                raise TranscriptionError(f"Could not load stable-ts model: {error}") from error
            self._model_cache[cache_key] = model
            return model


class FallbackTranscriptionBackend:
    name = "auto"
    uses_provider_chunking = False

    def __init__(self, primary: TranscriptionBackend, fallback: TranscriptionBackend | None):
        self._primary = primary
        self._fallback = fallback

    def transcribe_bytes(
        self,
        filename: str,
        audio_bytes: bytes,
        language: str | None,
        duration: float | None,
    ) -> TranscriptionResult:
        try:
            return self._primary.transcribe_bytes(filename, audio_bytes, language, duration)
        except TranscriptionError:
            if self._fallback is None:
                raise
            return self._fallback.transcribe_bytes(filename, audio_bytes, language, duration)


def transcribe_audio(
    backend: TranscriptionBackend,
    filename: str,
    audio_bytes: bytes,
    language: str | None,
) -> TranscriptionResult:
    safe_filename = Path(filename).name or "upload"

    with tempfile.TemporaryDirectory(prefix="capcut-caption-transcribe-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        source_path = temp_dir / safe_filename
        source_path.write_bytes(audio_bytes)

        duration = probe_duration(source_path)
        if (
            backend.uses_provider_chunking
            or duration is None
            or duration <= CHUNKING_THRESHOLD_SECONDS
            or not has_ffmpeg()
        ):
            return backend.transcribe_bytes(safe_filename, audio_bytes, language, duration=duration)

        chunks = _create_chunks(source_path, safe_filename, duration, temp_dir)
        return _transcribe_chunks(backend, chunks, language, duration)


def transcribe_audio_segment(
    backend: TranscriptionBackend,
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

    if not has_ffmpeg():
        raise TranscriptionError("ffmpeg is required to transcribe a selected segment.")

    safe_filename = Path(filename).name or "upload"
    with tempfile.TemporaryDirectory(prefix="capcut-caption-segment-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        source_path = temp_dir / safe_filename
        source_path.write_bytes(audio_bytes)

        duration = probe_duration(source_path)
        if duration is not None:
            safe_start = min(safe_start, duration)
            safe_end = min(safe_end, duration)
        if safe_end - safe_start <= 0:
            raise TranscriptionError("Selected segment is outside the audio duration.")

        segment_path = temp_dir / f"{Path(safe_filename).stem or 'upload'}-selection.wav"
        _create_segment(source_path, segment_path, safe_start, safe_end - safe_start)
        segment_result = backend.transcribe_bytes(
            segment_path.name,
            segment_path.read_bytes(),
            language,
            safe_end - safe_start,
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


def _ensure_ssl_cert_file() -> None:
    if os.environ.get("SSL_CERT_FILE"):
        return

    try:
        import certifi
    except ImportError:
        return

    os.environ["SSL_CERT_FILE"] = certifi.where()

def _create_chunks(source_path: Path, filename: str, duration: float, temp_dir: Path) -> list[AudioChunk]:
    chunks: list[AudioChunk] = []
    if not has_ffmpeg():
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
            create_mono_wav_segment(source_path, output_path, window_start, window_duration)
        except AudioProcessingError as error:
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
    try:
        create_mono_wav_segment(source_path, output_path, start, duration)
    except AudioProcessingError as error:
        raise TranscriptionError(f"Could not prepare selected audio segment: {error}") from error


def _transcribe_chunks(
    backend: TranscriptionBackend,
    chunks: list[AudioChunk],
    language: str | None,
    duration: float,
) -> TranscriptionResult:
    if not chunks:
        raise TranscriptionError("Could not prepare audio chunks.")

    language_result: str | None = None
    words: list[TranscribedWord] = []

    for chunk in chunks:
        transcript = backend.transcribe_bytes(chunk.name, chunk.path.read_bytes(), language, duration=None)
        language_result = language_result or transcript.language or language

        for word in transcript.words:
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


def _transcribe_bytes_with_openai(
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


def _extract_stable_ts_words(result: Any) -> list[TranscribedWord]:
    try:
        result_words = result.all_words()
    except AttributeError:
        result_words = []

    words: list[TranscribedWord] = []
    for item in result_words:
        text = str(getattr(item, "word", "") or getattr(item, "text", "")).strip()
        if not text:
            continue

        start = _get_float_attr(item, "start")
        end = _get_float_attr(item, "end")
        if start is None or end is None or end <= start:
            continue

        confidence = _get_float_attr(item, "probability") or _get_float_attr(item, "prob")
        words.append(TranscribedWord(text=text, start=start, end=end, confidence=confidence))

    return words


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
