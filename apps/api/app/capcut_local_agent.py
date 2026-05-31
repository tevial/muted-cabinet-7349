from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from .capcut_draft import CapCutDraftError, inspect_capcut_draft


DEFAULT_PROJECTS_ROOT = Path.home() / "Movies" / "CapCut" / "User Data" / "Projects" / "com.lveditor.draft"


class CapCutLocalAgentError(RuntimeError):
    pass


def get_default_projects_root() -> str:
    return str(DEFAULT_PROJECTS_ROOT)


def get_local_agent_status(*, enabled: bool, projects_root: str | Path) -> dict[str, Any]:
    root = _resolve_root(projects_root)

    return {
        "enabled": enabled,
        "projectsRoot": str(root),
        "rootExists": root.exists() and root.is_dir(),
    }


def list_capcut_projects(
    *,
    enabled: bool,
    projects_root: str | Path,
    limit: int,
) -> dict[str, Any]:
    status = get_local_agent_status(enabled=enabled, projects_root=projects_root)
    if not enabled or not status["rootExists"]:
        return {
            "agent": status,
            "projects": [],
        }

    root = _resolve_root(projects_root)
    projects = []
    for folder in _iter_project_folders(root, limit):
        projects.append(_project_summary(folder, root))

    projects.sort(key=lambda item: item.get("updatedAt") or "", reverse=True)
    return {
        "agent": status,
        "projects": projects,
    }


def get_project_cover_path(
    *,
    enabled: bool,
    projects_root: str | Path,
    project_path: str | Path,
) -> Path:
    if not enabled:
        raise CapCutLocalAgentError("CapCut local project agent is disabled.")

    root = _resolve_root(projects_root)
    project = _resolve_project_path(root, project_path)
    cover = project / "draft_cover.jpg"
    if not cover.exists():
        raise CapCutLocalAgentError("CapCut project cover is missing.")

    return cover


def _resolve_root(projects_root: str | Path) -> Path:
    return Path(projects_root).expanduser().resolve(strict=False)


def _resolve_project_path(root: Path, project_path: str | Path) -> Path:
    candidate = Path(project_path).expanduser().resolve(strict=False)
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise CapCutLocalAgentError("Project path is outside the configured CapCut projects root.") from error
    if not candidate.is_dir():
        raise CapCutLocalAgentError("CapCut project folder does not exist.")
    return candidate


def _iter_project_folders(root: Path, limit: int) -> list[Path]:
    folders = [
        item
        for item in root.iterdir()
        if item.is_dir() and (item / "draft_info.json").exists() and (item / "Timelines" / "project.json").exists()
    ]
    folders.sort(key=lambda item: _folder_updated_at(item), reverse=True)
    return folders[:limit]


def _project_summary(folder: Path, root: Path) -> dict[str, Any]:
    try:
        inspection = inspect_capcut_draft(folder)
        duration = inspection.get("duration")
        duration_us = inspection.get("durationUs")
        tracks = inspection.get("tracks", [])
        supported = inspection.get("supported", False)
        errors = inspection.get("errors", [])
        warnings = inspection.get("warnings", [])
    except CapCutDraftError as error:
        duration = None
        duration_us = None
        tracks = []
        supported = False
        errors = [str(error)]
        warnings = []

    cover = folder / "draft_cover.jpg"
    project_path = str(folder)

    return {
        "id": folder.name,
        "name": folder.name,
        "projectPath": project_path,
        "relativePath": str(folder.relative_to(root)),
        "duration": duration,
        "durationUs": duration_us,
        "updatedAt": _format_timestamp(_folder_updated_at(folder)),
        "coverUrl": f"/api/capcut/projects/cover?projectPath={quote(project_path)}" if cover.exists() else None,
        "supported": supported,
        "errors": errors,
        "warnings": warnings,
        "tracks": tracks,
    }


def _folder_updated_at(folder: Path) -> float:
    candidates = [
        folder / "draft_info.json",
        folder / "draft_meta_info.json",
        folder / "Timelines" / "project.json",
    ]
    existing = [path.stat().st_mtime for path in candidates if path.exists()]
    return max(existing) if existing else folder.stat().st_mtime


def _format_timestamp(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()
