from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .audio_processing import AudioProcessingError, create_mono_wav_segment, has_ffmpeg, probe_duration


class AlignmentError(RuntimeError):
    pass


@dataclass(frozen=True)
class AlignedWord:
    text: str
    start: float
    end: float
    confidence: float | None = None


@dataclass(frozen=True)
class AlignmentResult:
    language: str | None
    text: str
    words: list[AlignedWord]
    unmatched_words: list[str]
    diagnostics: dict[str, Any]


@dataclass(frozen=True)
class MfaModelPair:
    dictionary: str
    acoustic_model: str


@dataclass(frozen=True)
class MfaOptions:
    command: str = "mfa"
    dictionary: str | None = None
    acoustic_model: str | None = None
    g2p_model: str | None = None
    num_jobs: int = 1
    timeout_seconds: int = 180
    single_speaker: bool = True
    clean: bool = True
    textgrid_cleanup: bool = True
    fine_tune: bool = False


class AlignmentBackend(Protocol):
    name: str

    def align_segment(
        self,
        filename: str,
        audio_bytes: bytes,
        text: str,
        language: str | None,
        start: float,
        end: float,
    ) -> AlignmentResult:
        pass


MFA_MODEL_BY_LANGUAGE: dict[str, MfaModelPair] = {
    "en": MfaModelPair(dictionary="english_mfa", acoustic_model="english_mfa"),
    "eng": MfaModelPair(dictionary="english_mfa", acoustic_model="english_mfa"),
    "english": MfaModelPair(dictionary="english_mfa", acoustic_model="english_mfa"),
    "ru": MfaModelPair(dictionary="russian_mfa", acoustic_model="russian_mfa"),
    "rus": MfaModelPair(dictionary="russian_mfa", acoustic_model="russian_mfa"),
    "russian": MfaModelPair(dictionary="russian_mfa", acoustic_model="russian_mfa"),
    "uk": MfaModelPair(dictionary="ukrainian_mfa", acoustic_model="ukrainian_mfa"),
    "ukr": MfaModelPair(dictionary="ukrainian_mfa", acoustic_model="ukrainian_mfa"),
    "ukrainian": MfaModelPair(dictionary="ukrainian_mfa", acoustic_model="ukrainian_mfa"),
}

word_token_pattern = re.compile(r"[\w'-]+", re.UNICODE)
ignored_alignment_labels = {"", "<eps>", "<unk>", "sil", "sp", "spn"}


class MfaAlignmentBackend:
    name = "mfa"

    def __init__(self, options: MfaOptions):
        self._options = options

    def align_segment(
        self,
        filename: str,
        audio_bytes: bytes,
        text: str,
        language: str | None,
        start: float,
        end: float,
    ) -> AlignmentResult:
        safe_text = _normalize_transcript_text(text)
        if not safe_text:
            raise AlignmentError("MFA alignment needs non-empty caption text.")

        safe_start = max(0.0, start)
        safe_end = max(safe_start, end)
        if safe_end - safe_start <= 0:
            raise AlignmentError("Selected alignment segment is empty.")

        if not has_ffmpeg():
            raise AlignmentError("ffmpeg is required before MFA can align a selected segment.")
        if not shutil.which(self._options.command):
            raise AlignmentError(
                f"MFA command '{self._options.command}' was not found. Install Montreal Forced Aligner "
                "and make sure it is available on PATH."
            )

        model_pair = self._get_model_pair(language)
        safe_filename = Path(filename).name or "upload"
        with tempfile.TemporaryDirectory(prefix="capcut-caption-mfa-") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            source_path = temp_dir / safe_filename
            source_path.write_bytes(audio_bytes)

            duration = probe_duration(source_path)
            if duration is not None:
                safe_start = min(safe_start, duration)
                safe_end = min(safe_end, duration)
            if safe_end - safe_start <= 0:
                raise AlignmentError("Selected alignment segment is outside the audio duration.")

            segment_path = temp_dir / f"{Path(safe_filename).stem or 'upload'}-alignment.wav"
            transcript_path = temp_dir / f"{Path(safe_filename).stem or 'upload'}-alignment.txt"
            output_path = temp_dir / "aligned.json"
            mfa_temp_dir = temp_dir / "mfa"
            mfa_temp_dir.mkdir()
            dictionary_arg = _prepare_mfa_model_argument(model_pair.dictionary, "dictionary", mfa_temp_dir)
            acoustic_model_arg = _prepare_mfa_model_argument(model_pair.acoustic_model, "acoustic", mfa_temp_dir)
            transcript_path.write_text(safe_text, encoding="utf-8")

            try:
                create_mono_wav_segment(source_path, segment_path, safe_start, safe_end - safe_start)
            except AudioProcessingError as error:
                raise AlignmentError(str(error)) from error

            completed = self._run_align_one(
                segment_path=segment_path,
                transcript_path=transcript_path,
                dictionary=dictionary_arg,
                acoustic_model=acoustic_model_arg,
                output_path=output_path,
                temporary_directory=mfa_temp_dir,
            )
            alignment_path = _find_alignment_output(output_path, temp_dir)
            if alignment_path is None:
                raise AlignmentError(
                    "MFA finished but did not create a JSON alignment output. "
                    f"stderr: {_summarize_process_output(completed.stderr)}"
                )

            words = [
                AlignedWord(
                    text=word.text,
                    start=round(word.start + safe_start, 3),
                    end=round(word.end + safe_start, 3),
                    confidence=word.confidence,
                )
                for word in _parse_mfa_json(alignment_path)
            ]
            unmatched_words = _get_unmatched_words(safe_text, words)

            return AlignmentResult(
                language=language,
                text=safe_text,
                words=words,
                unmatched_words=unmatched_words,
                diagnostics={
                    "backend": self.name,
                    "dictionary": model_pair.dictionary,
                    "acousticModel": model_pair.acoustic_model,
                    "duration": duration,
                    "segmentStart": safe_start,
                    "segmentEnd": safe_end,
                    "wordCount": len(words),
                    "unmatchedWordCount": len(unmatched_words),
                },
            )

    def _get_model_pair(self, language: str | None) -> MfaModelPair:
        if self._options.dictionary and self._options.acoustic_model:
            return MfaModelPair(
                dictionary=self._options.dictionary,
                acoustic_model=self._options.acoustic_model,
            )

        language_key = (language or "uk").strip().lower().split("-")[0]
        model_pair = MFA_MODEL_BY_LANGUAGE.get(language_key)
        if model_pair:
            return MfaModelPair(
                dictionary=self._options.dictionary or model_pair.dictionary,
                acoustic_model=self._options.acoustic_model or model_pair.acoustic_model,
            )

        if self._options.dictionary and self._options.acoustic_model:
            return MfaModelPair(
                dictionary=self._options.dictionary,
                acoustic_model=self._options.acoustic_model,
            )

        raise AlignmentError(
            f"No MFA dictionary/acoustic model is configured for language '{language or 'auto'}'. "
            "Set MFA_DICTIONARY and MFA_ACOUSTIC_MODEL in apps/api/.env."
        )

    def _run_align_one(
        self,
        segment_path: Path,
        transcript_path: Path,
        dictionary: str,
        acoustic_model: str,
        output_path: Path,
        temporary_directory: Path,
    ) -> subprocess.CompletedProcess[str]:
        command = [
            self._options.command,
            "align_one",
            "--output_format",
            "json",
            "-j",
            str(self._options.num_jobs),
            "--overwrite",
            "--quiet",
            "--temporary_directory",
            str(temporary_directory),
        ]
        command.append("--no_use_mp" if self._options.num_jobs <= 1 else "--use_mp")
        command.append("--clean" if self._options.clean else "--no_clean")
        command.append("--textgrid_cleanup" if self._options.textgrid_cleanup else "--no_textgrid_cleanup")
        if self._options.single_speaker:
            command.append("--single_speaker")
        if self._options.fine_tune:
            command.append("--fine_tune")
        if self._options.g2p_model:
            command.extend(["--g2p_model_path", self._options.g2p_model])
        command.extend([
            str(segment_path),
            str(transcript_path),
            dictionary,
            acoustic_model,
            str(output_path),
        ])

        try:
            return subprocess.run(
                command,
                check=True,
                capture_output=True,
                env=_get_mfa_command_env(self._options.command),
                text=True,
                timeout=self._options.timeout_seconds,
            )
        except subprocess.TimeoutExpired as error:
            raise AlignmentError(
                f"MFA alignment timed out after {self._options.timeout_seconds} seconds."
            ) from error
        except (OSError, subprocess.CalledProcessError) as error:
            output = _get_process_output(error) if isinstance(error, subprocess.CalledProcessError) else str(error)
            raise AlignmentError(f"MFA alignment failed: {_summarize_process_output(output)}") from error


def align_audio_segment(
    backend: AlignmentBackend,
    filename: str,
    audio_bytes: bytes,
    text: str,
    language: str | None,
    start: float,
    end: float,
) -> AlignmentResult:
    return backend.align_segment(filename, audio_bytes, text, language, start, end)


def _normalize_transcript_text(text: str) -> str:
    return " ".join(text.split())


def _find_alignment_output(output_path: Path, temp_dir: Path) -> Path | None:
    if output_path.exists():
        return output_path

    outputs = sorted(temp_dir.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    return outputs[0] if outputs else None


def _parse_mfa_json(path: Path) -> list[AlignedWord]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise AlignmentError(f"Could not parse MFA JSON output: {error}") from error

    tiers = data.get("tiers")
    if not isinstance(tiers, dict):
        raise AlignmentError("MFA JSON output does not contain interval tiers.")

    words: list[AlignedWord] = []
    for tier_name, tier in tiers.items():
        if "word" not in str(tier_name).lower():
            continue
        entries = tier.get("entries") if isinstance(tier, dict) else None
        if not isinstance(entries, list):
            continue

        for entry in entries:
            aligned_word = _parse_word_entry(entry)
            if aligned_word:
                words.append(aligned_word)

    return _deduplicate_aligned_words(words)


def _parse_word_entry(entry: Any) -> AlignedWord | None:
    if not isinstance(entry, (list, tuple)) or len(entry) < 3:
        return None

    try:
        start = float(entry[0])
        end = float(entry[1])
    except (TypeError, ValueError):
        return None

    text = str(entry[2]).strip()
    if end <= start or text.lower() in ignored_alignment_labels:
        return None

    return AlignedWord(text=text, start=start, end=end)


def _deduplicate_aligned_words(words: list[AlignedWord]) -> list[AlignedWord]:
    sorted_words = sorted(words, key=lambda word: (word.start, word.end, word.text))
    deduplicated: list[AlignedWord] = []

    for word in sorted_words:
        previous = deduplicated[-1] if deduplicated else None
        if previous and _normalize_word(previous.text) == _normalize_word(word.text) and word.start < previous.end:
            if word.end - word.start > previous.end - previous.start:
                deduplicated[-1] = word
            continue
        deduplicated.append(word)

    return deduplicated


def _get_unmatched_words(text: str, words: list[AlignedWord]) -> list[str]:
    expected = [_normalize_word(token) for token in word_token_pattern.findall(text)]
    actual = [_normalize_word(word.text) for word in words]
    if expected == actual:
        return []

    remaining = actual.copy()
    unmatched: list[str] = []
    for token in expected:
        try:
            remaining.remove(token)
        except ValueError:
            unmatched.append(token)
    return unmatched


def _normalize_word(text: str) -> str:
    return text.strip().lower().strip(".,!?;:\"'()[]{}—–-")


def _get_mfa_command_env(command: str) -> dict[str, str]:
    env = os.environ.copy()
    command_path = Path(command)
    if command_path.parent != Path("."):
        env["PATH"] = f"{command_path.parent}{os.pathsep}{env.get('PATH', '')}"
    return env


def _prepare_mfa_model_argument(model: str, model_type: str, temporary_directory: Path) -> str:
    model_path = Path(model).expanduser()
    if model_path.exists():
        if model_type == "acoustic" and model_path.suffix == ".zip":
            return str(_extract_mfa_acoustic_model(model_path, temporary_directory))
        return str(model_path)

    if model_type == "dictionary":
        saved_dictionary = Path.home() / "Documents" / "MFA" / "pretrained_models" / "dictionary" / f"{model}.dict"
        if saved_dictionary.exists():
            return str(saved_dictionary)
        return model

    if model_type == "acoustic":
        saved_acoustic = Path.home() / "Documents" / "MFA" / "pretrained_models" / "acoustic" / f"{model}.zip"
        if saved_acoustic.exists():
            return str(_extract_mfa_acoustic_model(saved_acoustic, temporary_directory))

    return model


def _extract_mfa_acoustic_model(model_zip: Path, temporary_directory: Path) -> Path:
    model_root = temporary_directory / "models" / "acoustic" / model_zip.stem
    model_root.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(model_zip) as archive:
        archive.extractall(model_root)

    candidates = [model_root, *[path for path in model_root.iterdir() if path.is_dir()]]
    for candidate in candidates:
        if (candidate / "tree").exists() and (candidate / "final.mdl").exists():
            return candidate

    raise AlignmentError(f"Could not extract MFA acoustic model from {model_zip}.")


def _get_process_output(error: subprocess.CalledProcessError) -> str:
    return "\n".join(part for part in [error.stderr, error.stdout] if part)


def _summarize_process_output(text: str | None, limit: int = 1200) -> str:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    if not lines:
        return "MFA exited without an error message."

    important_lines = [
        line
        for line in lines
        if (
            "error" in line.lower()
            or "could not" in line.lower()
            or "please ensure" in line.lower()
            or "traceback" in line.lower()
        )
    ]
    summary = " ".join((important_lines or lines[-6:])[-8:])
    return summary[-limit:] if len(summary) > limit else summary
