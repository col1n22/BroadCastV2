#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import base64
import hashlib
import html
import json
import os
import random
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.request
import urllib.parse
from pathlib import Path


def configure_ssl_certificates():
    if os.environ.get("SSL_CERT_FILE"):
        return
    candidates = []
    try:
        import certifi
        candidates.append(certifi.where())
    except Exception:
        pass
    script_root = Path(__file__).resolve().parents[1]
    candidates.extend([
        script_root / "vendor" / "python" / "Lib" / "site-packages" / "certifi" / "cacert.pem",
        script_root / "vendor" / "python" / "Lib" / "site-packages" / "pip" / "_vendor" / "certifi" / "cacert.pem",
    ])
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            ca_file = str(candidate)
            os.environ.setdefault("SSL_CERT_FILE", ca_file)
            os.environ.setdefault("REQUESTS_CA_BUNDLE", ca_file)
            os.environ.setdefault("CURL_CA_BUNDLE", ca_file)
            break


configure_ssl_certificates()


batch = None

BAD_VOICE_PERSON_IDS = {
    "C-29530f42cc1e483a9cb4c3327af3e41e": "胡老师_API_21",
}
FIXED_VOICE_AUDIO_MAN_ID = "C-74273aa7d0674244a2c6842dc7abc1a1"
FIXED_VOICE_SOURCE_NAME = "胡老师_API_1-1"
FIXED_VOICE_SOURCE_FILE = "1-1.mp4"
FIXED_VOICE_SOURCE_PERSON_ID = "C-ace7291263664109b520ca5dcadf5098"

VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}
PIP_MEDIA_EXTS = VIDEO_EXTS | IMAGE_EXTS
DEFAULT_EFFECT_PRIORITY = 5
TEXT_EFFECT_IDS = ("kinetic", "slide-reveal", "word-bounce", "spring-up", "bubble")
MAX_TEXT_EFFECT_EVENTS = 3
TEXT_EFFECT_ANIMATION_RATIO = 2 / 3
SELF_INTRO_MIN_SECONDS = 3.5


def log(message):
    print(message, flush=True)


def log_json(event, **payload):
    print(json.dumps({"event": event, **payload}, ensure_ascii=False), flush=True)


def require(value, label):
    if value is None or str(value).strip() == "":
        raise SystemExit(f"缺少设置：{label}")
    return str(value).strip()


def safe_slug(item, index):
    raw = str(item.get("code") or item.get("id") or f"{index:03d}")
    raw = re.sub(r"[^A-Za-z0-9_.-]+", "_", raw).strip("_")
    return raw or f"{index:03d}"


def stable_text_hash(text):
    return hashlib.sha1(str(text).encode("utf-8")).hexdigest()


def normalize_title_lines(value):
    if isinstance(value, list):
        lines = value
    elif isinstance(value, str):
        lines = re.split(r"[\r\n]+", value)
    else:
        return []
    return [str(line).strip() for line in lines if str(line).strip()][:3]


def stable_job_name(input_path):
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", input_path.stem).strip("_") or "job"
    path_hash = hashlib.sha1(str(input_path.resolve()).encode("utf-8")).hexdigest()[:10]
    return f"desktop_{stem}_{path_hash}"


def normalize_items(data):
    raw_items = data.get("items") if isinstance(data, dict) else data
    if not isinstance(raw_items, list) or not raw_items:
        raise SystemExit("JSON 里没有 items")
    items = []
    seen = set()
    for index, raw in enumerate(raw_items, start=1):
        content = raw.get("content") or raw.get("text")
        if not content:
            raise SystemExit(f"第 {index} 条缺少 content/text")
        slug = safe_slug(raw, index)
        if slug in seen:
            slug = f"{slug}_{index:03d}"
        seen.add(slug)
        title = normalize_title_lines(raw.get("edited_title") or raw.get("title_override") or raw.get("title"))
        if not title and raw.get("title_text"):
            title = normalize_title_lines(raw.get("title_text"))
        item = {
            "index": index,
            "slug": slug,
            "text": content,
            "text_hash": stable_text_hash(content),
            "title": list(title or [])[:3],
            "source_id": raw.get("id"),
            "code": raw.get("code"),
            "topic": raw.get("topic", ""),
        }
        items.append(item)
    return items


def apply_title_overrides(items, overrides):
    if not isinstance(overrides, dict):
        return items
    for item in items:
        apply_item_title_override(item, item.get("index", 0), overrides)
    return items


def title_override_keys(item, index):
    return [
        item["slug"],
        str(item.get("code") or ""),
        str(item.get("source_id") or ""),
        str(index),
    ]


def apply_item_title_override(item, index, overrides):
    if not isinstance(overrides, dict):
        return False
    for key in title_override_keys(item, index):
        lines = normalize_title_lines(overrides.get(key))
        if lines:
            item["title"] = lines
            item["title_source"] = "override"
            return True
    return False


def apply_content_overrides(items, overrides):
    if not isinstance(overrides, dict):
        return items
    for item in items:
        apply_item_content_override(item, item.get("index", 0), overrides)
    return items


def content_override_keys(item, index):
    return title_override_keys(item, index)


def apply_item_content_override(item, index, overrides):
    if not isinstance(overrides, dict):
        return False
    for key in content_override_keys(item, index):
        if key not in overrides:
            continue
        text = str(overrides.get(key) or "").strip()
        if not text:
            continue
        if text == item.get("text"):
            return False
        item["text"] = text
        item["text_hash"] = stable_text_hash(text)
        item["content_source"] = "override"
        return True
    return False


def load_title_overrides(job):
    path = job.get("titleOverridesPath")
    if path:
        override_path = Path(path)
        if override_path.exists():
            try:
                data = json.loads(override_path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    return data
            except Exception as exc:
                log_json("title_overrides_read_failed", path=str(override_path), error=str(exc))
    return job.get("titleOverrides") if isinstance(job.get("titleOverrides"), dict) else {}


def load_content_overrides(job):
    path = job.get("contentOverridesPath")
    if path:
        override_path = Path(path)
        if override_path.exists():
            try:
                data = json.loads(override_path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    return data
            except Exception as exc:
                log_json("content_overrides_read_failed", path=str(override_path), error=str(exc))
    return job.get("contentOverrides") if isinstance(job.get("contentOverrides"), dict) else {}


def selected_indexes(job):
    raw = job.get("selectedIndexes")
    if not raw:
        return None
    indexes = set()
    for value in raw:
        try:
            index = int(value)
        except Exception:
            continue
        if index > 0:
            indexes.add(index)
    return indexes or None


def import_batch(bundle_path):
    global batch
    bundle = Path(bundle_path).resolve()
    if not bundle.exists():
        raise SystemExit(f"素材包目录不存在：{bundle}")
    sys.path.insert(0, str(bundle))
    from pipeline import batch_hu_teacher_videos as imported

    batch = imported
    return bundle


def ass_family_for_path(font_path, fallback):
    path = Path(font_path) if font_path else None
    if path and path.name == "优设书华体.ttf":
        return "YouSheShuHaTi"
    if path and "尔雅新大黑" in path.stem and "试用版" in path.stem:
        return "EYXDH_3500ZSYB Regular"
    if path:
        return path.stem
    return fallback


def configured_font_path(settings, key, fallback_key=None, label="字体文件"):
    value = settings.get(key) or (settings.get(fallback_key) if fallback_key else None)
    return Path(require(value, label))


def copy_extra_font_assets(font_paths):
    for extra_font in font_paths:
        if not extra_font:
            continue
        for target_dir in (batch.FONT_DIR, batch.REMOTION_PUBLIC_DIR):
            target_dir.mkdir(parents=True, exist_ok=True)
            target_path = target_dir / extra_font.name
            if target_path.resolve() != extra_font.resolve():
                shutil.copy2(extra_font, target_path)


def normalized_hex_color(value, default):
    text = str(value or default).strip()
    if text.startswith("#"):
        text = text[1:]
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    if not re.fullmatch(r"[0-9A-Fa-f]{6}", text):
        text = str(default).lstrip("#")
    return text.lower()


def bounded_number(value, default, low, high):
    try:
        number = float(value)
    except Exception:
        number = float(default)
    return max(low, min(high, number))


def effect_priority_value(value, default=DEFAULT_EFFECT_PRIORITY):
    return int(round(bounded_number(value, default, 0, 10)))


def setting_priority(settings, key, default=DEFAULT_EFFECT_PRIORITY):
    return effect_priority_value(settings.get(key), default)


def ass_color(value, default="#ffffff", opacity_percent=100):
    color = normalized_hex_color(value, default)
    opacity = bounded_number(opacity_percent, 100, 0, 100)
    alpha = round(255 * (1 - opacity / 100))
    red, green, blue = color[0:2], color[2:4], color[4:6]
    return f"&H{alpha:02X}{blue.upper()}{green.upper()}{red.upper()}"


def style_outline(settings, key, default):
    value = bounded_number(settings.get(key), default, 0, 80)
    return int(value) if value.is_integer() else round(value, 2)


def style_spacing(settings, key, default=0):
    value = bounded_number(settings.get(key), default, -20, 80)
    return int(value) if value.is_integer() else round(value, 2)


_FONT_SIZE_CACHE = {}


def text_width_with_spacing(font, line, spacing=0):
    text = str(line or "")
    if not text:
        return 0
    return (font.getbbox(text)[2] - font.getbbox(text)[0]) + max(0, len(text) - 1) * float(spacing or 0)


def font_for_path_size(font_path, size):
    from PIL import ImageFont

    key = (str(font_path), int(size))
    font = _FONT_SIZE_CACHE.get(key)
    if font is None:
        font = ImageFont.truetype(str(font_path), int(size))
        _FONT_SIZE_CACHE[key] = font
    return font


def fit_font_size_for_path(lines, font_path, max_size, min_size, max_width=None, spacing=0):
    visible = [str(line or "") for line in lines if str(line or "")]
    if not visible:
        return max_size
    width = max_width or getattr(batch, "SAFE_TEXT_WIDTH", 980)
    try:
        from PIL import ImageFont

        path_text = str(font_path)
        for size in range(int(max_size), int(min_size) - 1, -2):
            font = font_for_path_size(path_text, size)
            if all(text_width_with_spacing(font, line, spacing) <= width for line in visible):
                return int(size)
    except Exception:
        return batch.fit_font_size(visible, int(max_size), int(min_size), max_width=width, role="title")
    return int(min_size)


def ass_rounded_rect_path(width, height, radius):
    w = max(1, int(round(width)))
    h = max(1, int(round(height)))
    r = int(round(max(0, min(radius, w / 2, h / 2))))
    if r <= 0:
        return f"m 0 0 l {w} 0 l {w} {h} l 0 {h}"
    k = 0.55228475

    def n(value):
        return int(round(value))

    return (
        f"m {r} 0 "
        f"l {w - r} 0 "
        f"b {n(w - r + k * r)} 0 {w} {n(r - k * r)} {w} {r} "
        f"l {w} {h - r} "
        f"b {w} {n(h - r + k * r)} {n(w - r + k * r)} {h} {w - r} {h} "
        f"l {r} {h} "
        f"b {n(r - k * r)} {h} 0 {n(h - r + k * r)} 0 {h - r} "
        f"l 0 {r} "
        f"b 0 {n(r - k * r)} {n(r - k * r)} 0 {r} 0"
    )


def title_background_enabled(settings, key):
    if key in settings:
        return bool_setting(settings.get(key))
    return bool_setting(settings.get("titleBackgroundEnabled"))


def title_background_dialogue(style, text, font_path, font_size, spacing, center_x, center_y, settings, title_end, enabled_key):
    if not title_background_enabled(settings, enabled_key) or not text:
        return None
    padding_x = bounded_number(settings.get("titleBgPaddingX"), 36, 0, 180)
    padding_y = bounded_number(settings.get("titleBgPaddingY"), 18, 0, 120)
    radius = bounded_number(settings.get("titleBgRadius"), 12, 0, 120)
    try:
        font = font_for_path_size(font_path, font_size)
        text_width = text_width_with_spacing(font, text, spacing)
    except Exception:
        text_width = len(str(text)) * font_size
    width = text_width + padding_x * 2
    height = font_size * 1.18 + padding_y * 2
    left = int(round(center_x - width / 2))
    top = int(round(center_y - height / 2))
    path = ass_rounded_rect_path(width, height, radius)
    return batch.ass_dialogue(
        3,
        0,
        title_end,
        style,
        f"{{\\an7\\pos({left},{top})\\p1}}{path}",
    )


def volume_percent_to_gain(settings, key, default_percent):
    return bounded_number(settings.get(key), default_percent, 0, 200) / 100.0


def preview_layout_box(settings, prefix, defaults):
    width = bounded_number(settings.get(f"{prefix}W"), defaults["w"], defaults["min_w"], 1080)
    height = bounded_number(settings.get(f"{prefix}H"), defaults["h"], defaults["min_h"], 1920)
    x = bounded_number(settings.get(f"{prefix}X"), defaults["x"], 0, 1080 - width)
    y = bounded_number(settings.get(f"{prefix}Y"), defaults["y"], 0, 1920 - height)
    return {
        "x": int(round(x)),
        "y": int(round(y)),
        "w": int(round(width)),
        "h": int(round(height)),
    }


def box_center(box):
    return int(round(box["x"] + box["w"] / 2)), int(round(box["y"] + box["h"] / 2))


def title_line_y(box, ratio):
    return int(round(box["y"] + box["h"] * ratio))


def bool_setting(value):
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "on", "checked", "fixed"}


def clip_enabled(settings, key, default=False):
    if key not in settings:
        return default
    return bool_setting(settings.get(key))


def title_motion_enabled(settings):
    return clip_enabled(settings, "clipTitleMotion", False) or str(settings.get("clipPreset") or "").strip() == "title_motion_bgm_effects"


def effect_enabled(settings, key):
    return clip_enabled(settings, key, False)


def hide_cta_captions(settings):
    return clip_enabled(settings or {}, "hideCtaCaptions", False)


def safe_output_subdir(value):
    text = str(value or "").strip()
    if not text:
        return ""
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", text)
    text = re.sub(r"\s+", "_", text).strip(" ._")
    return text[:80] or ""


def subtitle_units(units, settings):
    hide_cta = hide_cta_captions(settings)
    return [
        unit
        for unit in units
        if unit.get("source") != "title"
        and unit.get("visible")
        and not (hide_cta and unit.get("source") == "cta")
    ]


def selected_text_effect_ids(settings):
    raw = settings.get("textEffectIds")
    if raw is None:
        return list(TEXT_EFFECT_IDS)
    if isinstance(raw, str):
        raw = [part.strip() for part in re.split(r"[,，\s]+", raw) if part.strip()]
    if not isinstance(raw, list):
        return list(TEXT_EFFECT_IDS)
    selected = []
    for value in raw:
        effect_id = str(value or "").strip()
        if effect_id in TEXT_EFFECT_IDS and effect_id not in selected:
            selected.append(effect_id)
    return selected


def keyword_sfx_terms(settings):
    if not clip_enabled(settings, "keywordSfxEnabled", True):
        return []
    return split_keyword_terms(settings.get("keywordSfxKeywords"))


def split_keyword_terms(value):
    raw = str(value or "")
    parts = re.split(r"[\r\n,，、;；]+", raw)
    terms = []
    for part in parts:
        term = part.strip()
        if term and term not in terms:
            terms.append(term)
    return terms


def pip_terms(settings):
    return split_keyword_terms(settings.get("pipKeywords"))


def normalized_keyword_text(text):
    cleaner = getattr(batch, "clean_for_len", None)
    if cleaner:
        return cleaner(str(text or ""))
    return re.sub(r"[\s，,。！？!?；;：:“”\"'、]+", "", str(text or ""))


def intro_end_for_units(timed_units, title_end):
    body_units = [
        unit
        for unit in timed_units
        if unit.get("source") != "title" and float(unit.get("start", 0.0)) >= float(title_end) - 0.05
    ]
    if not body_units:
        return float(title_end)
    intro_sentence = body_units[0].get("sentence_index")
    intro_units = [unit for unit in body_units if unit.get("sentence_index") == intro_sentence]
    return max((float(unit.get("end", title_end)) for unit in intro_units), default=float(title_end))


def keyword_sfx_starts_after_intro(settings, timed_units, title_end, max_count=8):
    terms = keyword_sfx_terms(settings)
    if not terms:
        return [], 0.0
    intro_end = intro_end_for_units(timed_units, title_end)
    starts = []
    normalized_terms = [(term, normalized_keyword_text(term)) for term in terms]
    normalized_terms = [(term, clean) for term, clean in normalized_terms if clean]
    for unit in timed_units:
        if unit.get("source") == "title" or not unit.get("visible"):
            continue
        unit_start = float(unit.get("start", 0.0))
        unit_end = float(unit.get("end", unit_start))
        if unit_end <= intro_end + 0.02:
            continue
        clean_text = normalized_keyword_text(unit.get("text", ""))
        if not clean_text:
            continue
        for _term, clean_term in normalized_terms:
            pos = clean_text.find(clean_term)
            if pos < 0:
                continue
            ratio = pos / max(1, len(clean_text))
            start = unit_start + (unit_end - unit_start) * ratio
            if start <= intro_end + 0.02:
                start = max(unit_start, intro_end + 0.02)
            if any(abs(start - existing) < 0.35 for existing in starts):
                continue
            starts.append(round(start, 3))
            break
        if len(starts) >= max_count:
            break
    return starts, intro_end


def media_files(folder, extensions):
    root = Path(folder)
    if not root.exists():
        return []
    return sorted(
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in extensions
    )


def media_library_paths(settings, key, extensions):
    raw = settings.get(key)
    if isinstance(raw, str):
        if not raw.strip():
            raw = []
        else:
            try:
                raw = json.loads(raw)
            except Exception:
                raw = [raw]
    if not isinstance(raw, list):
        return []
    paths = []
    seen = set()
    for item in raw:
        value = item.get("path") if isinstance(item, dict) else item
        text = str(value or "").strip()
        if not text:
            continue
        path = Path(text)
        key_text = str(path).lower()
        if key_text in seen or not path.exists() or path.suffix.lower() not in extensions:
            continue
        seen.add(key_text)
        paths.append(path)
    return paths


def validate_media_file(path, label, extensions):
    if not path.exists():
        raise SystemExit(f"{label}不存在：{path}")
    if path.suffix.lower() not in extensions:
        raise SystemExit(f"{label}不是支持的格式：{path}")
    return path


def choose_bgm_file(settings):
    selected = str(settings.get("bgmFile") or "").strip()
    if selected:
        return validate_media_file(Path(selected), "BGM 文件", AUDIO_EXTS), "fixed"
    library = media_library_paths(settings, "bgmLibrary", AUDIO_EXTS)
    if library:
        return random.choice(library), "library"
    raise SystemExit("缺少 BGM 文件，请先在 BGM 库里导入或选择 BGM")


def choose_opening_video(settings):
    if bool_setting(settings.get("useOpeningVideoFile")):
        path = Path(require(settings.get("openingVideoFile"), "指定开头视频文件"))
        return validate_media_file(path, "指定开头视频文件", VIDEO_EXTS), "fixed"

    library = media_library_paths(settings, "openingVideoLibrary", VIDEO_EXTS)
    if library:
        return random.choice(library), "library"

    folder = Path(require(settings.get("openingVideoFolder"), "开头视频文件夹"))
    if not folder.exists():
        raise SystemExit(f"开头视频文件夹不存在：{folder}")
    candidates = media_files(folder, VIDEO_EXTS)
    if not candidates:
        raise SystemExit(f"开头视频文件夹里没有可用视频：{folder}")
    return random.choice(candidates), "random"


def choose_pip_sources(settings):
    if bool_setting(settings.get("usePipMaterialFile")):
        path = Path(require(settings.get("pipMaterialFile"), "指定画中画素材文件"))
        return [validate_media_file(path, "指定画中画素材文件", PIP_MEDIA_EXTS)]

    library = media_library_paths(settings, "pipMaterialLibrary", PIP_MEDIA_EXTS)
    if library:
        return library

    folder = Path(require(settings.get("pipFolder"), "画中画文件夹"))
    if not folder.exists():
        raise SystemExit(f"画中画文件夹不存在：{folder}")
    candidates = media_files(folder, PIP_MEDIA_EXTS)
    if not candidates:
        raise SystemExit(f"画中画文件夹里没有可用素材：{folder}")
    return candidates


def pip_rule_items(settings):
    raw = settings.get("pipRules")
    if isinstance(raw, str):
        if not raw.strip():
            return []
        try:
            raw = json.loads(raw)
        except Exception as exc:
            raise SystemExit(f"自定义画中画列表格式错误：{exc}") from exc
    if not isinstance(raw, list):
        return []

    rules = []
    for index, rule in enumerate(raw, start=1):
        if not isinstance(rule, dict):
            continue
        keywords = split_keyword_terms(rule.get("keywords"))
        use_video_file = bool_setting(rule.get("useVideoFile", True))
        video_value = str(rule.get("videoFile") or "").strip()
        folder_value = str(rule.get("videoFolder") or rule.get("folder") or "").strip()
        if not keywords and not video_value and not folder_value:
            continue
        if not keywords:
            raise SystemExit(f"自定义画中画第 {index} 行需要填写关键词")
        if use_video_file:
            source = Path(require(video_value, f"自定义画中画第 {index} 行指定素材文件"))
            if not source.exists():
                raise SystemExit(f"自定义画中画第 {index} 行素材不存在：{source}")
            if source.suffix.lower() not in PIP_MEDIA_EXTS:
                raise SystemExit(f"自定义画中画第 {index} 行不是支持的素材格式：{source}")
            sources = [source]
            mode = "fixed"
        else:
            folder = Path(require(folder_value, f"自定义画中画第 {index} 行随机素材文件夹"))
            if not folder.exists():
                raise SystemExit(f"自定义画中画第 {index} 行素材文件夹不存在：{folder}")
            sources = media_files(folder, PIP_MEDIA_EXTS)
            if not sources:
                raise SystemExit(f"自定义画中画第 {index} 行素材文件夹里没有可用素材：{folder}")
            mode = "random"
        rules.append({
            "index": index,
            "keywords": keywords,
            "sources": sources,
            "source_mode": mode,
            "priority": rule.get("priority", None),
        })
    return rules


def choose_self_intro_sources(settings):
    library = media_library_paths(settings, "pipMaterialLibrary", PIP_MEDIA_EXTS)
    if library:
        return library

    folder_value = str(settings.get("pipFolder") or "").strip()
    if folder_value:
        folder = Path(folder_value)
        if folder.exists():
            candidates = media_files(folder, PIP_MEDIA_EXTS)
            if candidates:
                return candidates

    pip_sources = getattr(batch, "pip_sources", None)
    material_dir = getattr(batch, "PIP_MATERIAL_DIR", None)
    if callable(pip_sources) and material_dir:
        return list(pip_sources(material_dir))
    return []


def optional_image_asset(settings, key, label):
    value = str(settings.get(key) or "").strip()
    if not value:
        return None
    path = Path(value)
    if not path.exists():
        log_json("image_asset_missing", key=key, label=label, path=str(path))
        return None
    if path.suffix.lower() not in IMAGE_EXTS:
        raise SystemExit(f"{label}不是支持的图片格式：{path}")
    return path


def backing_kind_matches(text, kind):
    backing_kinds = getattr(batch, "backing_kinds", None)
    if callable(backing_kinds):
        return kind in backing_kinds(text)
    return False


def self_intro_text_matches(text):
    matcher = getattr(batch, "is_self_intro_text", None)
    if callable(matcher):
        return matcher(text)
    clean = normalized_keyword_text(text)
    if clean.startswith(("你", "别", "不要", "很多", "有些", "不管")):
        return False
    return any(term in clean for term in ("大家好", "我是", "胡天宝", "北京", "中医", "名老", "特聘", "医生", "专攻", "糖尿病"))


GENERIC_IDENTITY_PIP_TERMS = {
    "大家好",
    "我是",
    "胡天宝",
    "北京",
    "中医",
    "名老",
    "特聘",
    "医生",
    "专攻",
    "糖尿病",
}


def is_generic_identity_pip_term(term):
    clean = normalized_keyword_text(term)
    return any(clean == normalized_keyword_text(item) for item in GENERIC_IDENTITY_PIP_TERMS)


def sentence_has_backing_keyword(text):
    return any(backing_kind_matches(text, kind) for kind in ("xinhuo", "patent"))


def sentence_ends_with_period(text):
    return str(text or "").strip().endswith(("。", "."))


def is_backing_exclusive_sentence(text):
    return sentence_has_backing_keyword(text) and sentence_ends_with_period(text)


def backing_exclusive_sentence_indices_for_text(text):
    split_sentences = getattr(batch, "split_sentences", None)
    sentences = split_sentences(text) if callable(split_sentences) else re.findall(r"[^。！？!?]+[。！？!?]?", str(text or ""))
    return {
        index
        for index, sentence in enumerate(sentences or [])
        if is_backing_exclusive_sentence(sentence)
    }


def choose_text_effect_sfx(settings):
    if bool_setting(settings.get("useSfxFile")):
        path = Path(require(settings.get("sfxFile"), "指定音效文件"))
        return validate_media_file(path, "指定音效文件", AUDIO_EXTS), "fixed"

    library = media_library_paths(settings, "sfxLibrary", AUDIO_EXTS)
    if library:
        return random.choice(library), "library"

    folder_value = str(settings.get("sfxFolder") or "").strip()
    if not folder_value:
        return None, "none"
    folder = Path(folder_value)
    if not folder.exists():
        log_json("text_effect_sfx_folder_missing", folder=str(folder))
        return None, "missing"
    candidates = media_files(folder, AUDIO_EXTS)
    if not candidates:
        log_json("text_effect_sfx_empty", folder=str(folder))
        return None, "empty"
    return random.choice(candidates), "random"


def choose_logo_file(settings):
    if bool_setting(settings.get("useLogoFile", True)):
        path = Path(require(settings.get("logoFile"), "指定 Logo 图片"))
        if not path.exists():
            raise SystemExit(f"指定 Logo 图片不存在：{path}")
        if path.suffix.lower() not in IMAGE_EXTS:
            raise SystemExit(f"指定 Logo 图片不是支持的图片格式：{path}")
        return path, "fixed"

    folder = Path(require(settings.get("logoFolder"), "Logo 文件夹"))
    if not folder.exists():
        raise SystemExit(f"Logo 文件夹不存在：{folder}")
    candidates = media_files(folder, IMAGE_EXTS)
    if not candidates:
        raise SystemExit(f"Logo 文件夹里没有可用图片：{folder}")
    return random.choice(candidates), "random"


def effect_event(kind, start, end, **extra):
    start = float(start or 0.0)
    end = float(end or 0.0)
    if end <= start:
        return None
    priority = effect_priority_value(extra.pop("priority", DEFAULT_EFFECT_PRIORITY))
    event = {
        "effect_type": kind,
        "start": round(start, 3),
        "end": round(end, 3),
        "priority": priority,
    }
    event.update(extra)
    return event


def effect_overlaps(left, right):
    return float(left["start"]) < float(right["end"]) and float(right["start"]) < float(left["end"])


def select_effect_events(candidates):
    selected = []
    skipped = []
    ordered = sorted(
        [event for event in candidates if event],
        key=lambda event: (int(event.get("priority", DEFAULT_EFFECT_PRIORITY)), float(event.get("start", 0.0)), float(event.get("end", 0.0))),
    )
    for event in ordered:
        blocker = next((chosen for chosen in selected if effect_overlaps(event, chosen)), None)
        if blocker:
            skipped_event = dict(event)
            skipped_event["skipped_by"] = blocker.get("effect_type", "")
            skipped.append(skipped_event)
            continue
        selected.append(event)
    return sorted(selected, key=lambda event: float(event.get("start", 0.0))), skipped


def enforce_single_pip_event(selected, skipped):
    kept = []
    pip_keeper = None
    for event in sorted(
        selected,
        key=lambda item: (int(item.get("priority", DEFAULT_EFFECT_PRIORITY)), float(item.get("start", 0.0)), float(item.get("end", 0.0))),
    ):
        if event.get("pip"):
            if pip_keeper is not None:
                skipped_event = dict(event)
                skipped_event["skipped_by"] = pip_keeper.get("effect_type", "pip")
                skipped_event["skip_reason"] = "single_pip_per_video"
                skipped.append(skipped_event)
                continue
            pip_keeper = event
        kept.append(event)
    return sorted(kept, key=lambda event: float(event.get("start", 0.0))), skipped


def format_effect_ranges(events):
    parts = []
    for event in events:
        parts.append(
            f"{event.get('effect_type')}(p{int(event.get('priority', DEFAULT_EFFECT_PRIORITY))}):"
            f"{float(event.get('start', 0.0)):.3f}-{float(event.get('end', 0.0)):.3f}"
        )
    return ",".join(parts)


def normalize_text_effect_specs(raw_specs, pages, effect_ids=None):
    effect_ids = list(effect_ids or TEXT_EFFECT_IDS)
    if isinstance(raw_specs, dict):
        raw_specs = raw_specs.get("effects") or raw_specs.get("text_effects") or []
    if not isinstance(raw_specs, list):
        return []
    specs = []
    seen_pages = set()
    for raw in raw_specs:
        if not isinstance(raw, dict):
            continue
        try:
            page_index = int(raw.get("page"))
            line_index = int(raw.get("line"))
        except Exception:
            continue
        if page_index in seen_pages or page_index < 0 or page_index >= len(pages):
            continue
        lines = pages[page_index].get("lines") or []
        if line_index < 0 or line_index >= len(lines):
            continue
        specs.append({
            "page": page_index,
            "line": line_index,
            "effect_id": random.choice(effect_ids),
        })
        seen_pages.add(page_index)
        if len(specs) >= MAX_TEXT_EFFECT_EVENTS:
            break
    return specs


def review_text_effect_specs(settings, item, pages):
    if not effect_enabled(settings, "clipTextEffects"):
        return []
    effect_ids = selected_text_effect_ids(settings)
    if not effect_ids:
        log_json("text_effect_disabled_no_style", slug=item.get("slug", ""))
        return []
    payload_pages = [
        {
            "page": index,
            "lines": page.get("lines") or [],
        }
        for index, page in enumerate(pages or [])
    ]
    prompt = {
        "task": "从已经审查并分行后的口播字幕里，选择适合做花字特效的重点单行文本",
        "rules": [
            "必须返回 JSON，不要解释。",
            "返回格式：{\"effects\":[{\"page\":数字,\"line\":数字}]}。",
            f"最多选择 {MAX_TEXT_EFFECT_EVENTS} 行；同一页最多选择一行。",
            "花字对象必须是 pages[page].lines[line] 里的完整一行，不允许自己改写、截取、合并多行或按原文整句重选。",
            "优先选择真正重要、能单独成立的重点行，例如原因、关键、胰岛修复、胰岛素抵抗、皿糖反复、不能乱停药等。",
            "优先选择 6-10 个中文字符的短行，最长不要超过 12 个中文字符；如果一整句被分成两行，只能选择其中一行。",
            "不要选择评论区、留下需要、后台来找我等 CTA 行。",
            "如果某一页是两行，只选其中更重要的一行；系统会把被选中的这一行拆成单独字幕页，另一行会放到前后相邻的普通字幕页，不会同时显示。",
            "不要选择花字样式，系统会从用户勾选的花字样式里随机分配。",
        ],
        "available_effect_ids": effect_ids,
        "pages": payload_pages,
        "content": item.get("text", ""),
    }
    messages = [
        {"role": "system", "content": "你是短视频花字重点行策划。花字只能使用字幕分行后的单行文本；你只输出合法 JSON。"},
        {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
    ]
    try:
        content = chat_completion(settings, messages)
        specs = normalize_text_effect_specs(extract_json(content), pages, effect_ids)
        if specs:
            log_json("text_effect_review_ok", slug=item["slug"], effects=len(specs))
            return specs
    except Exception as exc:
        log_json("text_effect_review_failed", slug=item.get("slug", ""), error=str(exc))
    return []


def caption_event_by_page(caption_events):
    return {int(event.get("page_index")): event for event in caption_events if "page_index" in event}


def text_effect_font_path(settings):
    return Path(settings.get("textEffectFontPath") or settings.get("captionFontPath") or batch.CAPTION_FONT_PATH)


def caption_effect_layout(settings, text):
    box = preview_layout_box(settings, "previewTextEffect", {"x": 100, "y": 1385, "w": 880, "h": 220, "min_w": 280, "min_h": 90})
    center_x, center_y = box_center(box)
    font_path = text_effect_font_path(settings)
    outline_size = style_outline(settings, "captionOutlineSize", 8)
    usable_width = max(80, int(box["w"] - outline_size * 2 - 24))
    usable_height = max(60, int(box["h"] - outline_size * 2 - 18))
    max_font_size = int(round(bounded_number(min(box["h"] * 0.44, usable_height / 1.05), batch.CAPTION_FONT_SIZE, 48, 128)))
    font_size = batch.fit_font_size(
        [text],
        max_font_size,
        24,
        max_width=usable_width,
        role="caption",
    )
    return {
        "coordinate_system": {"width": 1080, "height": 1920},
        "box": box,
        "anchor": "center",
        "x": center_x,
        "y": center_y,
        "max_width": box["w"],
        "max_height": box["h"],
        "usable_width": usable_width,
        "usable_height": usable_height,
        "fit": "contain",
        "scale_policy": "maximize_inside_caption_box",
        "overflow_policy": "forbidden",
        "font_size": font_size,
        "max_font_size": max_font_size,
        "font_family": ass_family_for_path(font_path, batch.CAPTION_ASS_FONT_FAMILY),
        "font_path": str(font_path),
        "color": normalized_hex_color(settings.get("captionColor"), "#ffffff"),
        "outline_color": normalized_hex_color(settings.get("captionOutlineColor"), "#000000"),
        "outline_size": outline_size,
    }


def build_text_effect_events(settings, pages, caption_events, specs, blocked_sentence_indices=None):
    if not effect_enabled(settings, "clipTextEffects"):
        return []
    events_by_page = caption_event_by_page(caption_events)
    blocked_sentence_indices = set(blocked_sentence_indices or [])
    events = []
    for spec in specs or []:
        page_index = spec.get("page")
        line_index = spec.get("line")
        caption_event = events_by_page.get(page_index)
        if not caption_event:
            continue
        if set(caption_event.get("sentence_indices") or []) & blocked_sentence_indices:
            continue
        lines = list(caption_event.get("lines") or [])
        if line_index is None or line_index < 0 or line_index >= len(lines):
            continue
        start = float(caption_event["start"])
        end = float(caption_event["end"])
        if end - start < 0.75:
            continue
        effect_start = start
        effect_end = end
        if effect_end <= effect_start:
            continue
        effect_duration = effect_end - effect_start
        animation_seconds = effect_duration * TEXT_EFFECT_ANIMATION_RATIO
        hold_seconds = effect_duration - animation_seconds
        event = effect_event(
            "text_effect",
            effect_start,
            effect_end,
            priority=setting_priority(settings, "textEffectPriority"),
            text=lines[int(line_index)],
            effect_id=spec.get("effect_id") or TEXT_EFFECT_IDS[len(events) % len(TEXT_EFFECT_IDS)],
            page_index=page_index,
            line_index=line_index,
            layout=caption_effect_layout(settings, lines[int(line_index)]),
            animation_seconds=round(animation_seconds, 3),
            hold_seconds=round(hold_seconds, 3),
            render="hyperframe_alpha_layer",
            alpha_format_preference=["webm_vp9_alpha", "prores_4444_mov", "png_sequence"],
        )
        if event:
            events.append(event)
    return events[:MAX_TEXT_EFFECT_EVENTS]


def write_text_effect_plan(path, selected_effects, skipped_effects):
    text_effects = [event for event in selected_effects if event.get("effect_type") == "text_effect"]
    skipped_text_effects = [event for event in skipped_effects if event.get("effect_type") == "text_effect"]
    payload = {
        "renderer": "hyperframe",
        "render_note": "不要使用普通 H.264 mp4 做透明叠加；优先输出带 alpha 的 WebM/MOV 或 PNG 序列。",
        "timeline_rule": "每个花字严格使用 start/end；前 2/3 做动效，后 1/3 保持可读。",
        "layout_rule": "花字必须严格限制在 layout.box 花字限制区域内，按 contain 拉到最大；不得超出花字限制框。",
        "size_rule": "字体大小不得超过 layout.max_font_size；实际渲染使用 layout.font_size 或在同一字幕框内重新拟合到最大。",
        "events": text_effects,
        "skipped": skipped_text_effects,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def find_chrome_executable():
    env_path = os.environ.get("CHROME_PATH")
    candidates = [
        env_path,
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(candidate)
    for name in ("chrome", "msedge", "chromium"):
        found = shutil.which(name)
        if found:
            return found
    return None


def free_tcp_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_chrome(port, timeout=12):
    url = f"http://127.0.0.1:{port}/json/version"
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
            time.sleep(0.2)
    raise RuntimeError(f"Chrome DevTools 未启动：{last_error}")


def create_chrome_target(port):
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/json/new?about:blank",
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


def read_http_header(sock):
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = sock.recv(4096)
        if not chunk:
            break
        data += chunk
    return data


class DevToolsSocket:
    def __init__(self, ws_url):
        parsed = urllib.parse.urlparse(ws_url)
        self.host = parsed.hostname or "127.0.0.1"
        self.port = parsed.port or 80
        self.path = parsed.path
        if parsed.query:
            self.path += "?" + parsed.query
        self.sock = socket.create_connection((self.host, self.port), timeout=10)
        self.next_id = 1
        self.connect()

    def connect(self):
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(request.encode("ascii"))
        header = read_http_header(self.sock).decode("latin1", errors="ignore")
        if " 101 " not in header.split("\r\n", 1)[0]:
            raise RuntimeError(f"WebSocket 握手失败：{header[:160]}")

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass

    def send_frame(self, text):
        payload = text.encode("utf-8")
        header = bytearray([0x81])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.extend([0x80 | 126, (length >> 8) & 0xFF, length & 0xFF])
        else:
            header.append(0x80 | 127)
            header.extend(length.to_bytes(8, "big"))
        mask = os.urandom(4)
        header.extend(mask)
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def recv_exact(self, count):
        chunks = []
        remaining = count
        while remaining > 0:
            chunk = self.sock.recv(remaining)
            if not chunk:
                raise RuntimeError("WebSocket 连接已关闭")
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def recv_message(self):
        while True:
            head = self.recv_exact(2)
            opcode = head[0] & 0x0F
            length = head[1] & 0x7F
            masked = bool(head[1] & 0x80)
            if length == 126:
                length = int.from_bytes(self.recv_exact(2), "big")
            elif length == 127:
                length = int.from_bytes(self.recv_exact(8), "big")
            mask = self.recv_exact(4) if masked else b""
            payload = self.recv_exact(length) if length else b""
            if masked:
                payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
            if opcode == 1:
                return payload.decode("utf-8")
            if opcode == 8:
                raise RuntimeError("WebSocket 被远端关闭")
            if opcode == 9:
                self.send_pong(payload)

    def send_pong(self, payload):
        header = bytearray([0x8A])
        length = len(payload)
        header.append(0x80 | length)
        mask = os.urandom(4)
        header.extend(mask)
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def call(self, method, params=None):
        message_id = self.next_id
        self.next_id += 1
        self.send_frame(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        while True:
            payload = json.loads(self.recv_message())
            if payload.get("id") != message_id:
                continue
            if "error" in payload:
                raise RuntimeError(f"CDP {method} 失败：{payload['error']}")
            return payload.get("result", {})


def devtools_recv_message(self):
    chunks = []
    while True:
        head = self.recv_exact(2)
        fin = bool(head[0] & 0x80)
        opcode = head[0] & 0x0F
        length = head[1] & 0x7F
        masked = bool(head[1] & 0x80)
        if length == 126:
            length = int.from_bytes(self.recv_exact(2), "big")
        elif length == 127:
            length = int.from_bytes(self.recv_exact(8), "big")
        mask = self.recv_exact(4) if masked else b""
        payload = self.recv_exact(length) if length else b""
        if masked:
            payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        if opcode == 1:
            chunks = [payload]
            if fin:
                return b"".join(chunks).decode("utf-8")
        elif opcode == 0:
            chunks.append(payload)
            if fin:
                return b"".join(chunks).decode("utf-8")
        elif opcode == 8:
            raise RuntimeError("WebSocket closed by remote")
        elif opcode == 9:
            self.send_pong(payload)


DevToolsSocket.recv_message = devtools_recv_message


def text_effect_font_face(layout):
    font_path = str(layout.get("font_path") or "")
    if not font_path:
        return ""
    try:
        font_url = Path(font_path).resolve().as_uri()
    except Exception:
        font_url = "file:///" + urllib.parse.quote(font_path.replace("\\", "/"))
    safe_font_url = font_url.replace("'", "%27")
    return f"@font-face{{font-family:EffectCaptionFont;src:url('{safe_font_url}');}}"


def text_effect_chars(text):
    return "".join(
        f"<span class=\"char\" style=\"--i:{index}\">{html.escape(char)}</span>"
        for index, char in enumerate(str(text or ""))
    )


def text_effect_inner_html(effect_id, text):
    safe_text = html.escape(str(text or ""))
    if effect_id in {"kinetic", "word-bounce"}:
        return f"<div class=\"caption\">{text_effect_chars(text)}</div>"
    if effect_id == "slide-reveal":
        return f"<div class=\"reveal-box\"><div class=\"caption\">{safe_text}</div></div>"
    if effect_id == "bubble":
        return f"<div class=\"caption\">{safe_text}</div>"
    return f"<div class=\"caption\">{safe_text}</div>"


def text_effect_html(clip):
    layout = clip.get("layout") or {}
    box = layout.get("box") or {"x": 100, "y": 1385, "w": 880, "h": 220}
    effect_id = clip.get("effect_id") or "spring-up"
    if effect_id == "static":
        effect_id = "static-line"
    text = clip.get("text", "")
    font_size = int(layout.get("font_size") or 96)
    outline = int(layout.get("outline_size") or 8)
    color = normalized_hex_color(layout.get("color"), "#ffffff")
    outline_color = normalized_hex_color(layout.get("outline_color"), "#000000")
    animation_seconds = max(0.05, float(clip.get("animation_seconds") or 0.35))
    return f"""<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
{text_effect_font_face(layout)}
html, body {{
  margin: 0;
  width: 1080px;
  height: 1920px;
  overflow: hidden;
  background: transparent;
}}
body {{ font-family: EffectCaptionFont, "Microsoft YaHei UI", sans-serif; }}
.safe-area {{
  position: absolute;
  left: {int(box.get("x", 100))}px;
  top: {int(box.get("y", 1385))}px;
  width: {int(box.get("w", 880))}px;
  height: {int(box.get("h", 220))}px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}}
.effect {{
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  overflow: hidden;
}}
.caption {{
  position: relative;
  z-index: 2;
  max-width: 100%;
  max-height: 100%;
  color: #{color};
  font-size: {font_size}px;
  line-height: 1.05;
  font-weight: 950;
  letter-spacing: 0;
  white-space: nowrap;
  text-align: center;
  -webkit-text-stroke: {outline}px #{outline_color};
  paint-order: stroke fill;
  text-shadow: 0 6px 0 rgba(0,0,0,.36), 0 14px 34px rgba(0,0,0,.42);
}}
.char {{
  display: inline-block;
  transform-origin: 50% 82%;
}}
.kinetic .char {{
  opacity: 0;
  animation: kineticIn {animation_seconds:.3f}s cubic-bezier(.16,1.22,.26,1) both;
  animation-delay: calc(var(--i) * 45ms);
}}
@keyframes kineticIn {{
  0% {{ opacity: 0; transform: perspective(500px) translate3d(0,70px,-160px) rotateX(55deg) scale(.65); filter: blur(5px); }}
  62% {{ opacity: 1; transform: perspective(500px) translate3d(0,-10px,0) rotateX(-7deg) scale(1.12); filter: blur(0); }}
  100% {{ opacity: 1; transform: perspective(500px) translate3d(0,0,0) rotateX(0) scale(1); filter: blur(0); }}
}}
.word-bounce .char {{
  opacity: 0;
  animation: bounceIn {animation_seconds:.3f}s cubic-bezier(.2,1.28,.34,1) both;
  animation-delay: calc(var(--i) * 55ms);
}}
@keyframes bounceIn {{
  0% {{ opacity: 0; transform: translateY(68px) scale(.15) rotate(-8deg); }}
  62% {{ opacity: 1; transform: translateY(-16px) scale(1.18) rotate(3deg); }}
  100% {{ opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }}
}}
.spring-up .caption {{
  animation: springUp {animation_seconds:.3f}s cubic-bezier(.15,1.65,.36,1) both;
}}
@keyframes springUp {{
  0% {{ opacity: 0; transform: translateY(170px) scaleY(.58); }}
  60% {{ opacity: 1; transform: translateY(-22px) scaleY(1.1); }}
  100% {{ opacity: 1; transform: translateY(0) scaleY(1); }}
}}
.slide-reveal .reveal-box {{
  position: relative;
  overflow: hidden;
  padding: 8px 14px;
}}
.slide-reveal .reveal-box::after {{
  content: "";
  position: absolute;
  inset: 0;
  background: #ffde00;
  animation: revealMask {animation_seconds:.3f}s cubic-bezier(.76,0,.24,1) both;
}}
.slide-reveal .caption {{
  animation: revealText {animation_seconds:.3f}s ease both;
}}
@keyframes revealMask {{
  0% {{ transform: translateX(-110%); }}
  45% {{ transform: translateX(0); }}
  100% {{ transform: translateX(112%); }}
}}
@keyframes revealText {{
  0%, 42% {{ opacity: 0; }}
  58%, 100% {{ opacity: 1; }}
}}
.bubble .caption {{
  padding: 16px 24px 20px;
  color: #10131a;
  background: #fff;
  border: 5px solid #10131a;
  border-radius: 8px;
  box-shadow: 10px 10px 0 #28e0d0;
  text-shadow: none;
  -webkit-text-stroke: 0 transparent;
  animation: bubblePop {animation_seconds:.3f}s cubic-bezier(.12,1.75,.34,1) both;
}}
.bubble .caption::after {{
  content: "";
  position: absolute;
  left: 42px;
  bottom: -28px;
  border-width: 28px 24px 0 0;
  border-style: solid;
  border-color: #10131a transparent transparent transparent;
}}
@keyframes bubblePop {{
  0% {{ opacity: 0; transform: scale(0) rotate(-6deg); }}
  70% {{ opacity: 1; transform: scale(1.08) rotate(1.5deg); }}
  100% {{ opacity: 1; transform: scale(1) rotate(0); }}
}}
.static-line .caption {{
  opacity: 1;
}}
</style>
</head>
<body>
  <div class="safe-area">
    <div id="effect" class="effect {html.escape(effect_id)}">
      {text_effect_inner_html(effect_id, text)}
    </div>
  </div>
<script>
window.__seek = function(seconds) {{
  const ms = Math.max(0, seconds * 1000);
  for (const animation of document.getAnimations()) {{
    const timing = animation.effect.getTiming();
    const end = (Number(timing.delay) || 0) + (Number(timing.duration) || 0);
    animation.pause();
    animation.currentTime = Math.min(ms, Math.max(ms, end));
  }}
}};
window.__seek(0);
</script>
</body>
</html>"""


def text_effect_clips_from_plan(plan):
    clips = []
    for index, event in enumerate(plan.get("events") or []):
        duration = float(event.get("end", 0)) - float(event.get("start", 0))
        if duration > 0.05:
            clip = {
                "kind": "text_effect",
                "start": float(event["start"]),
                "end": float(event["end"]),
                "text": event.get("text", ""),
                "effect_id": event.get("effect_id", TEXT_EFFECT_IDS[index % len(TEXT_EFFECT_IDS)]),
                "layout": event.get("layout") or {},
                "animation_seconds": event.get("animation_seconds") or duration * TEXT_EFFECT_ANIMATION_RATIO,
            }
            clips.append(clip)
    return clips


def render_text_effect_clips(plan_path, output_dir, fps=25):
    plan = json.loads(Path(plan_path).read_text(encoding="utf-8"))
    clips = text_effect_clips_from_plan(plan)
    if not clips:
        return []
    chrome = find_chrome_executable()
    if not chrome:
        raise SystemExit("已勾选花字，但没有找到 Chrome/Edge，无法渲染透明花字层")
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    port = free_tcp_port()
    user_data = Path(tempfile.mkdtemp(prefix="hu_text_fx_chrome_"))
    proc = subprocess.Popen([
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--disable-extensions",
        "--hide-scrollbars",
        "--mute-audio",
        f"--remote-debugging-port={port}",
        f"--user-data-dir={user_data}",
        "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws = None
    rendered = []
    try:
        wait_for_chrome(port)
        target = create_chrome_target(port)
        ws = DevToolsSocket(target["webSocketDebuggerUrl"])
        ws.call("Page.enable")
        ws.call("Runtime.enable")
        ws.call("Emulation.setDeviceMetricsOverride", {
            "width": 1080,
            "height": 1920,
            "deviceScaleFactor": 1,
            "mobile": False,
            "screenWidth": 1080,
            "screenHeight": 1920,
        })
        ws.call("Emulation.setDefaultBackgroundColorOverride", {
            "color": {"r": 0, "g": 0, "b": 0, "a": 0}
        })
        for clip_index, clip in enumerate(clips, start=1):
            duration = max(0.08, float(clip["end"]) - float(clip["start"]))
            clip_dir = output_dir / f"clip_{clip_index:02d}"
            frames_dir = clip_dir / "frames"
            frames_dir.mkdir(parents=True, exist_ok=True)
            html_path = clip_dir / "effect.html"
            html_path.write_text(text_effect_html(clip), encoding="utf-8")
            file_url = html_path.resolve().as_uri()
            ws.call("Page.navigate", {"url": file_url})
            time.sleep(0.25)
            frame_count = max(2, int(duration * fps + 0.999))
            for frame in range(frame_count):
                seconds = min(duration, frame / fps)
                ws.call("Runtime.evaluate", {
                    "expression": f"window.__seek({seconds:.6f})",
                    "awaitPromise": False,
                })
                result = ws.call("Page.captureScreenshot", {
                    "format": "png",
                    "fromSurface": True,
                    "captureBeyondViewport": False,
                    "omitBackground": True,
                })
                (frames_dir / f"frame_{frame:05d}.png").write_bytes(base64.b64decode(result["data"]))
            mov_path = clip_dir / "effect.mov"
            subprocess.run([
                "ffmpeg", "-y",
                "-framerate", str(fps),
                "-i", str(frames_dir / "frame_%05d.png"),
                "-t", f"{duration:.3f}",
                "-vf", "format=rgba",
                "-c:v", "prores_ks",
                "-profile:v", "4",
                "-pix_fmt", "yuva444p10le",
                str(mov_path),
            ], check=True)
            rendered.append({
                "path": mov_path,
                "start": float(clip["start"]),
                "end": float(clip["end"]),
                "kind": clip.get("kind", "text_effect"),
            })
    finally:
        if ws:
            ws.close()
        proc.terminate()
        try:
            proc.wait(timeout=4)
        except Exception:
            proc.kill()
        shutil.rmtree(user_data, ignore_errors=True)
    return rendered


def overlay_text_effect_clips(base_path, clips, output_path):
    clips = [clip for clip in clips if clip.get("path") and Path(clip["path"]).exists()]
    if not clips:
        shutil.copy2(base_path, output_path)
        return
    cmd = ["ffmpeg", "-y", "-i", str(base_path)]
    for clip in clips:
        cmd.extend(["-i", str(clip["path"])])
    filter_parts = []
    base_label = "0:v"
    for index, clip in enumerate(clips, start=1):
        shifted = f"fx{index}"
        out_label = f"vfx{index}"
        start = float(clip.get("start", 0.0))
        end = float(clip.get("end", start))
        filter_parts.append(f"[{index}:v]setpts=PTS-STARTPTS+{start:.3f}/TB[{shifted}]")
        filter_parts.append(
            f"[{base_label}][{shifted}]overlay=0:0:format=auto:eof_action=pass:"
            f"enable='between(t,{start:.3f},{end:.3f})'[{out_label}]"
        )
        base_label = out_label
    cmd.extend([
        "-filter_complex", ";".join(filter_parts),
        "-map", f"[{base_label}]",
        "-map", "0:a?",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(output_path),
    ])
    subprocess.run(cmd, check=True)


def render_packaged_without_builtin_logo(raw_video, ass_path, packaged_path, pip_events=None):
    pip_events = pip_events or []
    cmd = [
        "ffmpeg", "-y",
        "-i", str(raw_video),
    ]

    valid_pips = [event for event in pip_events if event and event.get("source")]
    for event in valid_pips:
        pip_source = Path(event["source"])
        suffix = pip_source.suffix.lower()
        if suffix in getattr(batch, "PIP_IMAGE_EXTS", IMAGE_EXTS):
            cmd.extend(["-loop", "1", "-i", str(pip_source)])
        else:
            cmd.extend(["-an", "-i", str(pip_source)])

    filter_parts = []
    base_label = "0:v"
    for input_index, event in enumerate(valid_pips, start=1):
        event_i = input_index - 1
        start = float(event["start"])
        end = float(event["end"])
        width = int(event.get("width", getattr(batch, "PIP_WIDTH", 768)))
        height = int(event.get("height", getattr(batch, "PIP_HEIGHT", 432)))
        x = int(event.get("x", getattr(batch, "PIP_X", 156)))
        y = int(event.get("y", getattr(batch, "PIP_Y", 910)))
        pip_label = f"pip{event_i}"
        out_label = f"vbase{event_i + 1}"
        filter_parts.append(
            f"[{input_index}:v]setpts=PTS-STARTPTS+{start:.3f}/TB,"
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},setsar=1[{pip_label}]"
        )
        filter_parts.append(
            f"[{base_label}][{pip_label}]overlay={x}:{y}:eof_action=pass:enable='between(t,{start:.3f},{end:.3f})'[{out_label}]"
        )
        base_label = out_label

    ass_filter_path = batch.ffmpeg_filter_path(ass_path)
    font_filter_path = batch.ffmpeg_filter_path(batch.FONT_DIR)
    filter_parts.append(f"[{base_label}]ass=filename='{ass_filter_path}':fontsdir='{font_filter_path}'[v]")

    cmd.extend([
        "-filter_complex", ";".join(filter_parts),
        "-map", "[v]",
        "-map", "0:a?",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "160k",
        "-movflags", "+faststart",
        str(packaged_path),
    ])
    subprocess.run(cmd, check=True)


def overlay_logo_full_video(input_path, logo_file, settings, output_path):
    logo_path = Path(logo_file)
    if not logo_path.exists():
        raise SystemExit(f"Logo 图片不存在：{logo_path}")
    box = preview_layout_box(settings, "previewLogo", {"x": 90, "y": 88, "w": 180, "h": 180, "min_w": 48, "min_h": 48})
    opacity = bounded_number(settings.get("logoOpacityPercent"), 100, 0, 100) / 100.0
    x = box["x"]
    y = box["y"]
    w = box["w"]
    h = box["h"]
    filter_complex = (
        f"[1:v]scale={w}:{h}:force_original_aspect_ratio=decrease,"
        f"format=rgba,colorchannelmixer=aa={opacity:.3f}[logo];"
        f"[0:v][logo]overlay=x='{x}+({w}-overlay_w)/2':y='{y}+({h}-overlay_h)/2':format=auto:eof_action=pass,"
        "format=yuv420p[v]"
    )
    subprocess.run([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-loop", "1",
        "-i", str(logo_path),
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-map", "0:a?",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "medium",
        "-crf", "18",
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(output_path),
    ], check=True)


def build_fallback_pip_event(timed_units, duration, title_end, source):
    for group in batch.sentence_groups(timed_units):
        start = max(float(group["start"]), float(title_end or 0.0) + 0.2)
        end = min(float(group["end"]), start + 4.0, duration)
        if end - start >= 1.0:
            return batch.make_pip_event(source, start, end, duration, "desktop_pip", group["sentence_index"], title_end)
    return None


def pip_layout(settings):
    height = int(round(bounded_number(settings.get("pipHeight"), 432, 80, 1920)))
    width = int(round(height * 16 / 9))
    if width > 1080:
        width = 1080
        height = int(round(width * 9 / 16))
    x = int(round(bounded_number(settings.get("pipX"), 156, 0, 1080 - width)))
    y = int(round(bounded_number(settings.get("pipY"), 910, 0, 1920 - height)))
    return {"x": x, "y": y, "width": width, "height": height}


def pip_duration_seconds(settings):
    return bounded_number(settings.get("pipDurationSeconds"), 4.0, 0.5, 30.0)


def pip_close_at_sentence_end(settings):
    return bool_setting(settings.get("pipCloseAtSentenceEnd"))


def sentence_end_by_index(timed_units):
    ends = {}
    for group in batch.sentence_groups(timed_units):
        ends[group["sentence_index"]] = float(group.get("end", 0.0))
    return ends


def sentence_text_by_index(timed_units):
    return {
        group["sentence_index"]: group.get("text", "")
        for group in batch.sentence_groups(timed_units)
    }


def pip_event_end(settings, start, sentence_end, video_duration):
    start = float(start)
    sentence_end = float(sentence_end or start)
    if pip_close_at_sentence_end(settings):
        return min(float(video_duration), sentence_end)
    return min(float(video_duration), start + pip_duration_seconds(settings))


def keyword_start_in_unit(unit, clean_term):
    unit_start = float(unit.get("start", 0.0))
    unit_end = float(unit.get("end", unit_start))
    clean_text = normalized_keyword_text(unit.get("text", ""))
    if not clean_text:
        return None
    pos = clean_text.find(clean_term)
    if pos < 0:
        return None
    return round(unit_start + (unit_end - unit_start) * (pos / max(1, len(clean_text))), 3)


def normalized_pip_term_items(terms):
    terms = [(term, normalized_keyword_text(term)) for term in terms]
    terms = [(term, clean) for term, clean in terms if clean]
    if not terms:
        return []
    return [{"term": term, "clean": clean} for term, clean in terms]


def build_pip_event_from_terms(settings, timed_units, duration, title_end, term_items, source_picker, kind, blocked_sentence_indices=None):
    if not term_items:
        return []
    layout = pip_layout(settings)
    sentence_ends = sentence_end_by_index(timed_units)
    sentence_texts = sentence_text_by_index(timed_units)
    blocked_sentence_indices = set(blocked_sentence_indices or [])
    for unit in timed_units:
        if unit.get("source") == "title" or not unit.get("visible"):
            continue
        sentence_index = unit.get("sentence_index")
        if sentence_index in blocked_sentence_indices:
            continue
        sentence_text = sentence_texts.get(sentence_index, unit.get("text", ""))
        unit_start = float(unit.get("start", 0.0))
        unit_end = float(unit.get("end", unit_start))
        if unit_end <= float(title_end or 0.0) + 0.02:
            continue
        for item in term_items:
            if sentence_has_backing_keyword(sentence_text) and is_generic_identity_pip_term(item["term"]):
                continue
            start = keyword_start_in_unit(unit, item["clean"])
            if start is None:
                continue
            source = source_picker(item, unit)
            if not source:
                continue
            start = max(float(title_end or 0.0) + 0.05, start)
            sentence_end = sentence_ends.get(sentence_index, unit_end)
            end = pip_event_end(settings, start, sentence_end, duration)
            pip = batch.make_pip_event(source, start, end, duration, kind, sentence_index, title_end)
            if not pip:
                return []
            pip.update(layout)
            pip["source"] = str(source)
            pip["muted"] = True
            pip["keyword"] = item["term"]
            pip["priority"] = effect_priority_value(item.get("priority"), setting_priority(settings, "pipPriority"))
            if item.get("rule_index"):
                pip["pipRuleIndex"] = item["rule_index"]
            return [pip]
    return []


def build_keyword_pip_events(settings, timed_units, duration, title_end, sources, blocked_sentence_indices=None):
    if not sources:
        return []
    term_items = normalized_pip_term_items(pip_terms(settings))
    return build_pip_event_from_terms(
        settings,
        timed_units,
        duration,
        title_end,
        term_items,
        lambda _item, _unit: random.choice(sources),
        "keyword_pip",
        blocked_sentence_indices=blocked_sentence_indices,
    )


def build_rule_pip_events(settings, timed_units, duration, title_end, rules=None, blocked_sentence_indices=None):
    term_items = []
    for rule in (rules if rules is not None else pip_rule_items(settings)):
        for item in normalized_pip_term_items(rule["keywords"]):
            item["sources"] = rule["sources"]
            item["source_mode"] = rule.get("source_mode", "fixed")
            item["rule_index"] = rule["index"]
            item["priority"] = rule.get("priority")
            term_items.append(item)
    return build_pip_event_from_terms(
        settings,
        timed_units,
        duration,
        title_end,
        term_items,
        lambda item, _unit: random.choice(item.get("sources") or []),
        "keyword_pip_rule",
        blocked_sentence_indices=blocked_sentence_indices,
    )


def build_self_intro_pip_effect_events(settings, timed_units, duration, title_end, blocked_sentence_indices=None):
    if not effect_enabled(settings, "clipIntro"):
        return []
    blocked_sentence_indices = set(blocked_sentence_indices or [])
    sources = choose_self_intro_sources(settings)
    if not sources:
        log_json("self_intro_pip_missing_sources")
        return []
    layout = pip_layout(settings)
    for group in batch.sentence_groups(timed_units):
        if group.get("sentence_index") in blocked_sentence_indices:
            continue
        if float(group.get("end", 0.0)) <= float(title_end or 0.0) + 0.02:
            continue
        if not self_intro_text_matches(group.get("text", "")):
            continue
        source = random.choice(sources)
        start = max(float(group["start"]), float(title_end or 0.0))
        end = pip_event_end(settings, start, float(group["end"]), duration)
        pip = batch.make_pip_event(
            source,
            start,
            end,
            duration,
            "self_intro",
            group.get("sentence_index"),
            title_end,
        )
        if not pip:
            return []
        pip.update(layout)
        pip["source"] = str(source)
        pip["muted"] = True
        event = effect_event("intro", pip["start"], pip["end"], pip=pip, source=str(source), visual_kind="self_intro")
        return [event] if event else []
    return []


def build_pip_effect_events(settings, timed_units, duration, title_end, blocked_sentence_indices=None):
    if not effect_enabled(settings, "clipPip"):
        return []
    rules = pip_rule_items(settings)
    if rules:
        raw_pips = build_rule_pip_events(settings, timed_units, duration, title_end, rules, blocked_sentence_indices=blocked_sentence_indices)
    else:
        sources = choose_pip_sources(settings)
        raw_pips = build_keyword_pip_events(settings, timed_units, duration, title_end, sources, blocked_sentence_indices=blocked_sentence_indices)

    events = []
    for raw_event in raw_pips:
        if not raw_event:
            continue
        pip = dict(raw_event)
        pip["source"] = str(pip.get("source") or "")
        pip["muted"] = True
        for key in ("keyword", "pipRuleIndex", "priority", "x", "y", "width", "height"):
            if key in raw_event:
                pip[key] = raw_event[key]
        event = effect_event("pip", pip["start"], pip["end"], priority=pip.get("priority"), pip=pip, source=pip["source"])
        if event:
            events.append(event)
    return events


def build_backing_image_effect_events(settings, timed_units, duration, title_end):
    configs = []
    if effect_enabled(settings, "clipIntro"):
        configs.append(("xinhuo", "intro", "inheritanceFile", "薪火传承文件", "inheritancePriority"))
    if effect_enabled(settings, "clipPatent"):
        configs.append(("patent", "patent", "patentFile", "专利文件", "patentPriority"))
    if not configs:
        return []

    sources = {
        kind: optional_image_asset(settings, key, label)
        for kind, _effect_type, key, label, _priority_key in configs
    }
    events = []
    for group in batch.sentence_groups(timed_units):
        if float(group.get("end", 0.0)) <= float(title_end or 0.0) + 0.02:
            continue
        for kind, effect_type, _key, _label, priority_key in configs:
            source = sources.get(kind)
            if not source or not backing_kind_matches(group.get("text", ""), kind):
                continue
            start, end = batch.backing_keyword_window(group, kind)
            start = max(float(start), float(title_end or 0.0))
            end = min(float(duration), float(end))
            if end <= start:
                continue
            image_event = batch.make_backing_image_event(
                kind,
                source,
                start,
                end,
                duration,
                group.get("sentence_index"),
            )
            if not image_event:
                continue
            event = effect_event(
                effect_type,
                image_event["start"],
                image_event["end"],
                priority=setting_priority(settings, priority_key),
                image_event=image_event,
                visual_kind=kind,
                source=str(source),
            )
            if event:
                events.append(event)
                return events
    return events


def remotion_image_event_window(image_events, duration, padding=0.12):
    if not image_events:
        return 0.0, 0.0
    start = max(0.0, min(float(event.get("start", 0.0)) for event in image_events) - float(padding))
    end = min(float(duration), max(float(event.get("end", 0.0)) for event in image_events) + float(padding))
    if end <= start:
        end = min(float(duration), start + 0.5)
    return start, end


def shift_remotion_image_events(image_events, offset_seconds):
    shifted = []
    for event in image_events or []:
        item = dict(event)
        item["originalStart"] = item.get("start")
        item["originalEnd"] = item.get("end")
        item["originalStartFrame"] = item.get("startFrame")
        item["originalEndFrame"] = item.get("endFrame")
        local_start = max(0.0, float(item.get("start", 0.0)) - float(offset_seconds))
        local_end = max(local_start + 0.04, float(item.get("end", item.get("start", 0.0))) - float(offset_seconds))
        item["start"] = round(local_start, 3)
        item["end"] = round(local_end, 3)
        item["startFrame"] = max(0, int(round(local_start * 25)))
        item["endFrame"] = max(item["startFrame"] + 1, int(round(local_end * 25)))
        shifted.append(item)
    return shifted


def write_remotion_image_plan(path, image_events, duration, offset_seconds=0.0, source_duration=None):
    plan_duration = float(source_duration) if source_duration is not None else float(duration)
    payload = {
        "composition": "CaptionEffects",
        "width": 1080,
        "height": 1920,
        "fps": 25,
        "durationInFrames": max(1, int(round(plan_duration * 25))),
        "events": [],
        "imageEvents": image_events or [],
        "timelineOffsetSeconds": round(float(offset_seconds or 0.0), 3),
        "sourceDuration": round(float(duration), 3),
        "remotionDir": str(batch.REMOTION_EFFECTS_DIR),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def overlay_remotion_effects_at_offset(base_path, effect_layer_path, output_path, offset_seconds, overlay_duration):
    offset_seconds = max(0.0, float(offset_seconds or 0.0))
    overlay_end = offset_seconds + max(0.0, float(overlay_duration or 0.0))
    filter_complex = (
        f"[1:v]setpts=PTS+{offset_seconds:.3f}/TB[layer];"
        f"[0:v][layer]overlay=0:0:format=auto:eof_action=pass:"
        f"enable='between(t,{offset_seconds:.3f},{overlay_end:.3f})'[v]"
    )
    subprocess.run([
        "ffmpeg", "-y",
        "-i", str(base_path),
        "-an",
        "-i", str(effect_layer_path),
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-map", "0:a?",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(output_path),
    ], check=True)


def replace_opening_visual(input_path, opening_video, output_path, replace_seconds):
    total = batch.duration(input_path)
    replace_seconds = max(0.0, min(float(replace_seconds or 0.0), total))
    if replace_seconds <= 0.05:
        shutil.copy2(input_path, output_path)
        return 0.0

    fit_open = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=25"
    fit_body = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=25"
    if replace_seconds >= total - 0.05:
        filter_complex = (
            f"[1:v]trim=start=0:duration={total:.3f},setpts=PTS-STARTPTS,"
            f"{fit_open}[v]"
        )
    else:
        filter_complex = (
            f"[1:v]trim=start=0:duration={replace_seconds:.3f},setpts=PTS-STARTPTS,"
            f"{fit_open}[openv];"
            f"[0:v]trim=start={replace_seconds:.3f}:end={total:.3f},setpts=PTS-STARTPTS,"
            f"{fit_body}[bodyv];"
            "[openv][bodyv]concat=n=2:v=1:a=0[v]"
        )

    subprocess.run([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-stream_loop", "-1",
        "-an",
        "-i", str(opening_video),
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-map", "0:a?",
        "-t", f"{total:.3f}",
        "-r", "25",
        "-fps_mode", "cfr",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "160k",
        "-movflags", "+faststart",
        str(output_path),
    ], check=True)
    return replace_seconds


def apply_settings(settings, bundle):
    title_font = configured_font_path(settings, "titleFontPath", "titleTopFontPath", "标题字体文件")
    title_top_font = configured_font_path(settings, "titleTopFontPath", "titleFontPath", "标题上行字体文件")
    title_middle_font = configured_font_path(settings, "titleMiddleFontPath", "titleFontPath", "标题中行字体文件")
    title_bottom_font = configured_font_path(settings, "titleBottomFontPath", "titleFontPath", "标题下行字体文件")
    caption_font = Path(require(settings.get("captionFontPath"), "字幕字体文件"))
    text_effect_font = Path(settings.get("textEffectFontPath") or caption_font)
    disclaimer_font = Path(settings.get("disclaimerFontPath") or caption_font)
    bgm_file = None
    bgm_mode = "disabled"
    if clip_enabled(settings, "clipBgm", True):
        bgm_file, bgm_mode = choose_bgm_file(settings)
    output_dir = Path(require(settings.get("outputDir"), "输出目录"))
    output_subdir = safe_output_subdir(settings.get("outputSubdir"))
    if output_subdir:
        output_dir = output_dir / output_subdir
    if not title_font.exists():
        raise SystemExit(f"标题字体不存在：{title_font}")
    if not title_top_font.exists():
        raise SystemExit(f"标题上行字体不存在：{title_top_font}")
    if not title_middle_font.exists():
        raise SystemExit(f"标题中行字体不存在：{title_middle_font}")
    if not title_bottom_font.exists():
        raise SystemExit(f"标题下行字体不存在：{title_bottom_font}")
    if not caption_font.exists():
        raise SystemExit(f"字幕字体不存在：{caption_font}")
    if not text_effect_font.exists():
        raise SystemExit(f"花字字体不存在：{text_effect_font}")
    if not disclaimer_font.exists():
        raise SystemExit(f"底部声明字体不存在：{disclaimer_font}")
    if clip_enabled(settings, "clipLogo", False):
        if not settings.get("logoFile"):
            settings["logoFile"] = str(bundle / "assets" / "template_assets" / "medical_logo_ref_1080.png")
        if not settings.get("logoFolder"):
            settings["logoFolder"] = str(bundle / "assets" / "template_assets")
        choose_logo_file(settings)
    if effect_enabled(settings, "clipPip"):
        if not pip_rule_items(settings):
            choose_pip_sources(settings)

    batch.BASE_URL = settings.get("chanjingBaseUrl") or batch.BASE_URL
    os.environ["CHANJING_APP_ID"] = require(settings.get("chanjingAppId"), "蝉镜 AK / App ID")
    os.environ["CHANJING_SECRET_KEY"] = require(settings.get("chanjingSecretKey"), "蝉镜 SK / Secret Key")

    batch.TITLE_FONT_PATH = title_top_font
    batch.CAPTION_FONT_PATH = caption_font
    batch.DISCLAIMER_FONT_PATH = disclaimer_font
    batch.FONT_PATH = caption_font
    batch.TITLE_ASS_FONT_FAMILY = ass_family_for_path(title_top_font, batch.TITLE_FONT_FAMILY)
    batch.TITLE_TOP_ASS_FONT_FAMILY = ass_family_for_path(title_top_font, batch.TITLE_FONT_FAMILY)
    batch.TITLE_MIDDLE_ASS_FONT_FAMILY = ass_family_for_path(title_middle_font, batch.TITLE_FONT_FAMILY)
    batch.TITLE_BOTTOM_ASS_FONT_FAMILY = ass_family_for_path(title_bottom_font, batch.TITLE_FONT_FAMILY)
    batch.CAPTION_ASS_FONT_FAMILY = ass_family_for_path(caption_font, batch.CAPTION_FONT_FAMILY)
    batch.DISCLAIMER_ASS_FONT_FAMILY = ass_family_for_path(disclaimer_font, batch.DISCLAIMER_FONT_FAMILY)
    if disclaimer_font != caption_font:
        batch.CAPTION_FONT_PATH = caption_font
    batch.create_font_asset(required_roles=("caption", "title"))
    copy_extra_font_assets((title_middle_font, title_bottom_font, text_effect_font, disclaimer_font))

    output_dir.mkdir(parents=True, exist_ok=True)
    batch.GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    return {
        "title_font": title_font,
        "title_top_font": title_top_font,
        "title_middle_font": title_middle_font,
        "title_bottom_font": title_bottom_font,
        "caption_font": caption_font,
        "text_effect_font": text_effect_font,
        "disclaimer_font": disclaimer_font,
        "bgm_file": bgm_file,
        "bgm_mode": bgm_mode,
        "output_dir": output_dir,
        "bundle": bundle,
    }


def chat_completion(settings, messages):
    base_url = require(settings.get("modelBaseUrl"), "模型接口 URL").rstrip("/")
    api_key = require(settings.get("modelApiKey"), "模型 API Key")
    model = require(settings.get("modelName"), "模型名")
    url = base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"
    body = {
        "model": model,
        "messages": messages,
        "temperature": 0,
    }
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Bearer {api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    try:
        return payload["choices"][0]["message"]["content"]
    except Exception as exc:
        raise RuntimeError(f"模型接口返回格式异常：{payload}") from exc


def extract_json(text):
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.S)
    if fenced:
        text = fenced.group(1).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = min([pos for pos in [text.find("["), text.find("{")] if pos >= 0], default=-1)
        if start < 0:
            raise
        parsed = json.loads(text[start:])
    if isinstance(parsed, dict) and "pages" in parsed:
        return parsed["pages"]
    return parsed


def caption_single_line(settings):
    return bool_setting((settings or {}).get("captionSingleLine"))


def caption_letter_spacing(settings):
    return style_spacing(settings or {}, "captionLetterSpacing", 0)


def caption_fits_for_settings(text, settings):
    line = batch.display_line(text)
    if not line:
        return True
    spacing = caption_letter_spacing(settings)
    if spacing == 0:
        return batch.caption_fits(line)
    try:
        font = batch.font_for_size(batch.CAPTION_FONT_SIZE, "caption")
        return text_width_with_spacing(font, line, spacing) <= batch.SAFE_TEXT_WIDTH
    except Exception:
        return batch.caption_fits(line)


def auto_caption_pages(caption_units, settings=None):
    if caption_single_line(settings):
        pages = []
        cursor = 0
        while cursor < len(caption_units):
            best = None
            max_end = min(len(caption_units) - 1, cursor + 5)
            for end in range(max_end, cursor - 1, -1):
                line = batch.display_line("".join(caption_units[i]["text"] for i in range(cursor, end + 1)))
                if line and caption_fits_for_settings(line, settings):
                    best = (end, line)
                    break
            if not best:
                line = batch.display_line(caption_units[cursor]["text"])
                best = (cursor, line)
            end, line = best
            pages.append({"start": cursor, "end": end, "lines": [line] if line else []})
            cursor = end + 1
        return pages

    pages = []
    cursor = 0
    for group in batch.build_caption_pages(caption_units):
        start = cursor
        end = cursor + len(group) - 1
        lines = [batch.display_line(line) for line in batch.caption_group_lines(group)]
        pages.append({"start": start, "end": end, "lines": [line for line in lines if line]})
        cursor = end + 1
    return pages


def validate_pages(pages, caption_units, settings=None):
    issues = []
    max_lines = 1 if caption_single_line(settings) else 2
    if not isinstance(pages, list):
        return ["模型返回不是数组"], []
    covered = []
    normalized = []
    previous_last_line = None
    for page_index, page in enumerate(pages, start=1):
        if not isinstance(page, dict):
            issues.append(f"第 {page_index} 页不是对象")
            continue
        try:
            start = int(page["start"])
            end = int(page["end"])
        except Exception:
            issues.append(f"第 {page_index} 页缺少 start/end")
            continue
        if start < 0 or end >= len(caption_units) or start > end:
            issues.append(f"第 {page_index} 页范围越界：{start}-{end}")
            continue
        raw_lines = page.get("lines")
        if not isinstance(raw_lines, list):
            issues.append(f"第 {page_index} 页 lines 不是数组")
            continue
        lines = [batch.display_line(str(line)) for line in raw_lines if batch.display_line(str(line))]
        if not lines or len(lines) > max_lines:
            issues.append(f"第 {page_index} 页必须是 1 行" if max_lines == 1 else f"第 {page_index} 页必须是 1-2 行")
            continue
        expected = batch.display_line("".join(caption_units[i]["text"] for i in range(start, end + 1)))
        actual = batch.display_line("".join(lines))
        if actual != expected:
            issues.append(f"第 {page_index} 页改字或漏字：期望 {expected}，实际 {actual}")
        for line in lines:
            if not caption_fits_for_settings(line, settings):
                issues.append(f"第 {page_index} 页单行超宽：{line}")
        for issue in batch.caption_line_issues(lines):
            if "超宽" not in issue:
                issues.append(f"第 {page_index} 页换行不顺：{issue}")
        if previous_last_line and lines:
            for issue in batch.caption_page_boundary_issues(previous_last_line, lines[0]):
                issues.append(f"第 {page_index} 页跨页不顺：{issue}")
        if lines:
            previous_last_line = lines[-1]
        covered.extend(range(start, end + 1))
        normalized.append({"start": start, "end": end, "lines": lines})
    expected_coverage = list(range(len(caption_units)))
    if covered != expected_coverage:
        issues.append("分页没有按顺序完整覆盖所有字幕单元")
    return issues, normalized


def valid_lines_for_text(text, settings=None):
    expected = batch.display_line(text)
    if not expected:
        return []

    candidates = []
    if caption_fits_for_settings(expected, settings):
        candidates.append([expected])

    if not caption_single_line(settings):
        readable = batch.split_by_readability(expected)
        if readable:
            candidates.append(readable)

        width_chunks = batch.chunk_by_caption_width(expected)
        if 1 <= len(width_chunks) <= 2:
            candidates.append(width_chunks)

        tokens = batch.protected_tokens(expected)
        for split in range(1, len(tokens)):
            left = "".join(tokens[:split]).strip("，,；;：: ")
            right = "".join(tokens[split:]).strip("，,；;：: ")
            if left and right:
                candidates.append([left, right])

    ranked = []
    seen = set()
    for lines in candidates:
        normalized = [batch.display_line(line) for line in lines if batch.display_line(line)]
        key = tuple(normalized)
        max_lines = 1 if caption_single_line(settings) else 2
        if key in seen or not (1 <= len(normalized) <= max_lines):
            continue
        seen.add(key)
        if "".join(normalized) != expected:
            continue
        if not all(caption_fits_for_settings(line, settings) for line in normalized):
            continue
        readability_issues = [issue for issue in batch.caption_line_issues(normalized) if "超宽" not in issue]
        if readability_issues:
            continue
        if len(normalized) == 2:
            penalty = batch.caption_break_penalty(normalized[0], normalized[1])
        else:
            penalty = 0
        ranked.append((penalty, normalized))

    if not ranked:
        return []
    return min(ranked, key=lambda item: item[0])[1]


def repair_caption_pages(caption_units, settings=None):
    repaired = []
    cursor = 0
    while cursor < len(caption_units):
        best = None
        max_end = min(len(caption_units) - 1, cursor + 5)
        for end in range(max_end, cursor - 1, -1):
            text = "".join(caption_units[i]["text"] for i in range(cursor, end + 1))
            lines = valid_lines_for_text(text, settings)
            if lines:
                best = (end, lines)
                break
        if not best:
            return []
        end, lines = best
        repaired.append({"start": cursor, "end": end, "lines": lines})
        cursor = end + 1
    return repaired


def sanitize_caption_lines(lines):
    return [batch.display_line(line) for line in lines if batch.display_line(line)]


def caption_buffer_seconds(settings):
    return bounded_number((settings or {}).get("captionBufferSeconds"), 0.12, 0.0, 0.5)


def line_time_for_offset(spans, offset, prefer_start=False):
    if not spans:
        return 0.0
    offset = max(0, int(offset))
    first = spans[0]
    if offset <= first["text_start"]:
        return float(first["unit"].get("start", 0.0))
    for index, span in enumerate(spans):
        text_start = int(span["text_start"])
        text_end = int(span["text_end"])
        if prefer_start and offset == text_end and index + 1 < len(spans) and spans[index + 1]["text_start"] == offset:
            return float(spans[index + 1]["unit"].get("start", span["unit"].get("end", 0.0)))
        if offset <= text_start:
            return float(span["unit"].get("start", 0.0))
        if offset < text_end:
            duration = float(span["unit"].get("end", span["unit"].get("start", 0.0))) - float(span["unit"].get("start", 0.0))
            ratio = (offset - text_start) / max(1, text_end - text_start)
            return float(span["unit"].get("start", 0.0)) + duration * ratio
        if offset == text_end:
            return float(span["unit"].get("end", span["unit"].get("start", 0.0)))
    return float(spans[-1]["unit"].get("end", spans[-1]["unit"].get("start", 0.0)))


def unit_index_for_offset(spans, offset, prefer_start=False):
    if not spans:
        return 0
    offset = max(0, int(offset))
    if offset <= spans[0]["text_start"]:
        return int(spans[0]["index"])
    for index, span in enumerate(spans):
        text_start = int(span["text_start"])
        text_end = int(span["text_end"])
        if prefer_start and offset == text_end and index + 1 < len(spans) and spans[index + 1]["text_start"] == offset:
            return int(spans[index + 1]["index"])
        if text_start <= offset <= text_end:
            return int(span["index"])
    return int(spans[-1]["index"])


def caption_line_segments(page, caption_units):
    try:
        start = int(page["start"])
        end = int(page["end"])
    except Exception:
        return None
    units = caption_units[start:end + 1]
    if not units:
        return None
    spans = []
    cursor = 0
    for offset, unit in enumerate(units):
        text = batch.display_line(unit.get("text", ""))
        if not text:
            continue
        spans.append({
            "index": start + offset,
            "unit": unit,
            "text_start": cursor,
            "text_end": cursor + len(text),
        })
        cursor += len(text)
    full_text = "".join(batch.display_line(unit.get("text", "")) for unit in units)
    lines = sanitize_caption_lines(page.get("lines") or [])
    if not full_text or "".join(lines) != full_text:
        return None

    line_segments = []
    line_cursor = 0
    for line_index, line in enumerate(lines):
        text = batch.display_line(line)
        if not text:
            return None
        expected_end = line_cursor + len(text)
        if full_text[line_cursor:expected_end] != text:
            found = full_text.find(text, line_cursor)
            if found < 0:
                return None
            line_cursor = found
            expected_end = line_cursor + len(text)
        line_start = line_time_for_offset(spans, line_cursor, prefer_start=True)
        line_end = line_time_for_offset(spans, expected_end, prefer_start=False)
        start_index = unit_index_for_offset(spans, line_cursor, prefer_start=True)
        end_index = unit_index_for_offset(spans, expected_end, prefer_start=False)
        line_segments.append({
            "line_index": line_index,
            "text": text,
            "start": start_index,
            "end": end_index,
            "time_start": round(line_start, 3),
            "time_end": round(line_end, 3),
        })
        line_cursor = expected_end
    return line_segments


def page_sentence_indices(page, caption_units):
    try:
        start = int(page["start"])
        end = int(page["end"])
    except Exception:
        return set()
    return {
        unit.get("sentence_index")
        for unit in caption_units[start:end + 1]
        if unit.get("sentence_index") is not None
    }


def filter_text_effect_specs_by_blocked_sentences(specs, pages, caption_units, blocked_sentence_indices):
    blocked_sentence_indices = set(blocked_sentence_indices or [])
    if not specs or not blocked_sentence_indices:
        return specs or []
    filtered = []
    for spec in specs:
        try:
            page = pages[int(spec.get("page"))]
        except Exception:
            continue
        if page_sentence_indices(page, caption_units) & blocked_sentence_indices:
            continue
        filtered.append(spec)
    return filtered


def isolate_text_effect_caption_pages(pages, caption_units, specs):
    if not specs:
        return pages, specs
    selected = {}
    for spec in specs:
        try:
            selected[(int(spec.get("page")), int(spec.get("line")))] = spec
        except Exception:
            continue
    if not selected:
        return pages, specs

    new_pages = []
    spec_mapping = {}
    isolated_count = 0
    failed_count = 0
    for page_index, page in enumerate(pages or []):
        lines = sanitize_caption_lines(page.get("lines") or [])
        selected_lines = [line for source_page, line in selected if source_page == page_index]
        if not selected_lines or len(lines) <= 1:
            new_index = len(new_pages)
            new_pages.append(page)
            for line_index in selected_lines:
                spec_mapping[(page_index, line_index)] = (new_index, line_index)
            continue

        line_segments = caption_line_segments(page, caption_units)
        if not line_segments or len(line_segments) != len(lines):
            failed_count += 1
            new_index = len(new_pages)
            new_pages.append(page)
            for line_index in selected_lines:
                spec_mapping[(page_index, line_index)] = (new_index, line_index)
            continue

        selected_line_set = set(selected_lines)
        for segment in line_segments:
            new_index = len(new_pages)
            new_pages.append({
                "start": segment["start"],
                "end": segment["end"],
                "lines": [segment["text"]],
                "time_start": segment["time_start"],
                "time_end": segment["time_end"],
                "source_page": page_index,
                "source_line": segment["line_index"],
            })
            if segment["line_index"] in selected_line_set:
                spec_mapping[(page_index, segment["line_index"])] = (new_index, 0)
                isolated_count += 1

    new_specs = []
    for spec in specs:
        try:
            key = (int(spec.get("page")), int(spec.get("line")))
        except Exception:
            continue
        mapped = spec_mapping.get(key)
        if not mapped:
            continue
        updated = dict(spec)
        updated["page"], updated["line"] = mapped
        new_specs.append(updated)
    if isolated_count or failed_count:
        log_json("text_effect_caption_pages_isolated", isolated=isolated_count, failed=failed_count)
    return new_pages, new_specs


def caption_display_events(pages, caption_units, title_end, duration, settings=None):
    title_clear_time = min(duration, title_end + 0.12)
    transition_gap = caption_buffer_seconds(settings)
    events = []
    for page_index, page in enumerate(pages):
        group = caption_units[page["start"]:page["end"] + 1]
        if not group:
            continue
        raw_start = page.get("time_start")
        raw_end = page.get("time_end")
        start = max(float(raw_start) if raw_start is not None else group[0]["start"], title_clear_time)
        end = float(raw_end) if raw_end is not None else group[-1]["end"]
        if end <= title_clear_time:
            continue
        if end - start < 0.25:
            end = min(duration, start + 0.35)
        caption_lines = sanitize_caption_lines(page["lines"])
        if caption_lines and end > start:
            sentence_indices = sorted(
                {
                    unit.get("sentence_index")
                    for unit in group
                    if unit.get("sentence_index") is not None
                },
                key=lambda value: str(value),
            )
            events.append({
                "start": start,
                "end": end,
                "lines": caption_lines,
                "page_index": page_index,
                "sentence_indices": sentence_indices,
            })

    for current, following in zip(events, events[1:]):
        if current["end"] > following["start"] - transition_gap:
            current["end"] = max(current["start"] + 0.18, following["start"] - transition_gap)
    return [event for event in events if event["end"] > event["start"]]


def supervise_caption_breaks(settings, item):
    hook, units = batch.build_spoken_units(item["text"])
    caption_units = subtitle_units(units, settings)
    if not caption_units:
        return []
    initial_pages = auto_caption_pages(caption_units, settings)
    unit_payload = [
        {
            "index": index,
            "source": unit.get("source"),
            "text": batch.display_line(unit["text"]),
        }
        for index, unit in enumerate(caption_units)
    ]
    prompt = {
        "task": "审查并修正中文口播字幕换行",
        "rules": [
            "必须返回 JSON 数组，不要解释。",
            "每个元素格式为 {\"start\":数字,\"end\":数字,\"lines\":[\"第一行\",\"第二行可省略\"]}。",
            "start/end 必须引用给定字幕单元 index，按顺序完整覆盖所有单元，不能重叠、不能跳过。",
            "每页最多两行；你要先像人一样读一遍，再判断断行是否顺口，不能只按固定分词。",
            "每一行必须能在 1080x1920 竖屏中用 96 号字幕字完整显示，宁可拆成两行或拆成相邻两页，也不要输出超宽长行。",
            "单行尽量 7-10 个中文字符，最长不要超过 12 个中文字符；遇到大家好我是北京特聘基层、专攻二型糖尿疒调理方向、可只要它和皿糖反复一起出现这类长行必须拆开。",
            "不能出现饭后高背/后、胰岛修/复、一吃/饭、糖尿/疒、二型糖尿/疒这类读起来别扭或把词拆碎的断法。",
            "不能改字、不能漏字、不能添加标点；每一行字幕结尾都不要带逗号、句号、问号、感叹号、顿号、分号、冒号等标点；可以把连续单元合成一页。",
            "显示替换已经执行：医显示为醫，药显示为藥，病显示为疒，血显示为皿。",
            "CTA 也要显示字幕。",
        ],
        "caption_units": unit_payload,
        "current_pages": initial_pages,
    }
    if caption_single_line(settings):
        prompt["rules"][1] = "每个元素格式为 {\"start\":数字,\"end\":数字,\"lines\":[\"单行字幕\"]}。"
        prompt["rules"][3] = "单行字幕已开启：每页只能有一行 lines，不能输出第二行；如果太长就拆成相邻两页。"
        prompt["rules"][5] = "单行尽量 7-10 个中文字符，最长不要超过 12 个中文字符；遇到长句必须拆成相邻单行字幕页。"
    if hide_cta_captions(settings):
        prompt["rules"][-1] = "CTA 已按剪辑配置隐藏，给定字幕单元里不包含 CTA；不要自行补回评论区、留下需要、后台来找我等 CTA 字幕。"
    messages = [
        {
            "role": "system",
            "content": "你是短视频中文口播字幕审查员。你只输出合法 JSON。",
        },
        {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
    ]
    last_issues = []
    for attempt in range(1, 5):
        content = chat_completion(settings, messages)
        try:
            pages = extract_json(content)
            issues, normalized = validate_pages(pages, caption_units, settings)
        except Exception as exc:
            issues, normalized = [f"JSON 解析失败：{exc}"], []
        if not issues:
            log_json("caption_review_ok", slug=item["slug"], pages=len(normalized), attempt=attempt)
            return normalized
        last_issues = issues
        messages.append({"role": "assistant", "content": content})
        overflow_instruction = (
            "如果问题里有“单行超宽”，必须把这一页拆成前后相邻的单行字幕页；不能拆成两行，也不能再次输出同样的长行。"
            if caption_single_line(settings)
            else "如果问题里有“单行超宽”，必须把那一行拆成两行，或者把这一页拆成前后相邻两页；不能再次输出同样的长行。"
        )
        messages.append({
            "role": "user",
            "content": (
                "上一次返回不合格，请只返回修正后的 JSON。\n"
                f"{overflow_instruction}\n"
                "修正后仍然不能改字、漏字、加标点，每行结尾也不能带标点。\n"
                "问题：\n" + "\n".join(issues)
            ),
        })
    repaired = repair_caption_pages(caption_units, settings)
    if repaired:
        repair_issues, normalized = validate_pages(repaired, caption_units, settings)
        if not repair_issues:
            log_json(
                "caption_review_repaired",
                slug=item["slug"],
                pages=len(normalized),
                model_attempts=4,
                model_issues=last_issues[:8],
            )
            return normalized
        last_issues = last_issues + ["本地兜底仍未通过："] + repair_issues
    raise SystemExit(f"{item['slug']} 字幕换行模型审查失败：\n" + "\n".join(last_issues))


def write_reviewed_subtitles(item, timed_units, hook, pages, duration, ass_path, srt_path, settings, hidden_caption_lines=None):
    hidden_caption_lines = set(hidden_caption_lines or [])
    title_end = batch.title_end_for_units(timed_units)
    show_title = clip_enabled(settings, "clipTitle", True)
    show_caption = clip_enabled(settings, "clipCaption", True)
    item_title = item.get("title") or batch.title_lines(hook)
    item_title = list(item_title) + ["", "", ""]
    red, yellow, blue = [batch.display_line(t) for t in item_title[:3]]
    title_box = preview_layout_box(settings, "previewTitle", {"x": 80, "y": 980, "w": 920, "h": 500, "min_w": 260, "min_h": 170})
    caption_box = preview_layout_box(settings, "previewCaption", {"x": 100, "y": 1385, "w": 880, "h": 220, "min_w": 280, "min_h": 90})
    disclaimer_box = preview_layout_box(settings, "previewDisclaimer", {"x": 90, "y": 1735, "w": 900, "h": 150, "min_w": 280, "min_h": 70})
    title_center_x, _ = box_center(title_box)
    caption_x, caption_y = box_center(caption_box)
    disclaimer_x, disclaimer_y = box_center(disclaimer_box)
    title_base_size = int(round(bounded_number(title_box["h"] * 0.30, 144, 72, 180)))
    caption_size = int(round(bounded_number(caption_box["h"] * 0.44, batch.CAPTION_FONT_SIZE, 48, 128)))
    disclaimer_size = int(round(bounded_number(disclaimer_box["h"] * 0.29, 43, 24, 64)))
    title_font_fallback = settings.get("titleFontPath") or settings.get("titleTopFontPath")
    title_top_font = Path(settings.get("titleTopFontPath") or title_font_fallback)
    title_middle_font = Path(settings.get("titleMiddleFontPath") or title_font_fallback)
    title_bottom_font = Path(settings.get("titleBottomFontPath") or title_font_fallback)
    title_top_family = getattr(batch, "TITLE_TOP_ASS_FONT_FAMILY", batch.TITLE_ASS_FONT_FAMILY)
    title_middle_family = getattr(batch, "TITLE_MIDDLE_ASS_FONT_FAMILY", batch.TITLE_ASS_FONT_FAMILY)
    title_bottom_family = getattr(batch, "TITLE_BOTTOM_ASS_FONT_FAMILY", batch.TITLE_ASS_FONT_FAMILY)
    title_top_spacing = style_spacing(settings, "titleTopLetterSpacing", 0)
    title_middle_spacing = style_spacing(settings, "titleMiddleLetterSpacing", 0)
    title_bottom_spacing = style_spacing(settings, "titleBottomLetterSpacing", 0)
    title_line_spacing = int(round(bounded_number(settings.get("titleLineSpacing"), title_box["h"] * 0.33, 60, 420)))
    title_middle_y = title_line_y(title_box, 0.49)
    title_top_y = title_middle_y - title_line_spacing
    title_bottom_y = title_middle_y + title_line_spacing
    red_size = fit_font_size_for_path([red], title_top_font, title_base_size, batch.TITLE_MIN_FONT_SIZE, spacing=title_top_spacing)
    yellow_size = fit_font_size_for_path([yellow], title_middle_font, title_base_size, batch.TITLE_MIN_FONT_SIZE, spacing=title_middle_spacing)
    blue_size = fit_font_size_for_path([blue], title_bottom_font, int(round(title_base_size * 0.92)), batch.TITLE_MIN_FONT_SIZE, spacing=title_bottom_spacing)
    disclaimer_opacity = bounded_number(settings.get("disclaimerOpacityPercent"), 50, 0, 100)
    caption_spacing = style_spacing(settings, "captionLetterSpacing", 0)

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{batch.CAPTION_ASS_FONT_FAMILY},{caption_size},{ass_color(settings.get("captionColor"), "#ffffff")},&H000000FF,{ass_color(settings.get("captionOutlineColor"), "#000000")},&H00000000,1,0,0,0,100,100,{caption_spacing},0,1,{style_outline(settings, "captionOutlineSize", 8)},0,5,40,40,40,1
Style: Disclaimer,{batch.DISCLAIMER_ASS_FONT_FAMILY},{disclaimer_size},{ass_color(settings.get("disclaimerColor"), "#ffffff", disclaimer_opacity)},&H000000FF,{ass_color(settings.get("disclaimerOutlineColor"), "#000000")},&H00000000,1,0,0,0,100,100,0,0,1,{style_outline(settings, "disclaimerOutlineSize", 0)},0,5,30,30,30,1
Style: TitleTopBg,Arial,1,{ass_color(settings.get("titleTopBgColor"), "#000000", settings.get("titleTopBgOpacityPercent", 85))},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: TitleMiddleBg,Arial,1,{ass_color(settings.get("titleMiddleBgColor"), "#000000", settings.get("titleMiddleBgOpacityPercent", 85))},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: TitleBottomBg,Arial,1,{ass_color(settings.get("titleBottomBgColor"), "#000000", settings.get("titleBottomBgOpacityPercent", 85))},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: TitleRed,{title_top_family},{title_base_size},{ass_color(settings.get("titleTopColor"), "#ffffff")},&H000000FF,{ass_color(settings.get("titleTopOutlineColor"), "#000000")},&H00000000,1,0,0,0,100,100,{title_top_spacing},0,1,{style_outline(settings, "titleTopOutlineSize", 8)},0,5,20,20,20,1
Style: TitleYellow,{title_middle_family},{title_base_size},{ass_color(settings.get("titleMiddleColor"), "#ffde00")},&H000000FF,{ass_color(settings.get("titleMiddleOutlineColor"), "#000000")},&H00000000,1,0,0,0,100,100,{title_middle_spacing},0,1,{style_outline(settings, "titleMiddleOutlineSize", 8)},0,5,20,20,20,1
Style: TitleBlue,{title_bottom_family},{int(round(title_base_size * 0.92))},{ass_color(settings.get("titleBottomColor"), "#ff2a00")},&H000000FF,{ass_color(settings.get("titleBottomOutlineColor"), "#ffffff")},&H00000000,1,0,0,0,100,100,{title_bottom_spacing},0,1,{style_outline(settings, "titleBottomOutlineSize", 8)},0,5,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header.rstrip()]
    lines.append(batch.ass_dialogue(
        1,
        0,
        duration,
        "Disclaimer",
        f"{{\\pos({disclaimer_x},{disclaimer_y})\\fs{disclaimer_size}}}{batch.ass_escape(batch.display_text(batch.DISCLAIMER))}",
    ))
    if show_title:
        for bg_line in (
            title_background_dialogue("TitleTopBg", red, title_top_font, red_size, title_top_spacing, title_center_x, title_top_y, settings, title_end, "titleTopBgEnabled"),
            title_background_dialogue("TitleMiddleBg", yellow, title_middle_font, yellow_size, title_middle_spacing, title_center_x, title_middle_y, settings, title_end, "titleMiddleBgEnabled"),
            title_background_dialogue("TitleBottomBg", blue, title_bottom_font, blue_size, title_bottom_spacing, title_center_x, title_bottom_y, settings, title_end, "titleBottomBgEnabled"),
        ):
            if bg_line:
                lines.append(bg_line)
        lines.append(batch.ass_dialogue(4, 0, title_end, "TitleRed", f"{{\\pos({title_center_x},{title_top_y})\\fs{red_size}}}{batch.ass_escape(red)}"))
        lines.append(batch.ass_dialogue(4, 0, title_end, "TitleYellow", f"{{\\pos({title_center_x},{title_middle_y})\\fs{yellow_size}}}{batch.ass_escape(yellow)}"))
        lines.append(batch.ass_dialogue(4, 0, title_end, "TitleBlue", f"{{\\pos({title_center_x},{title_bottom_y})\\fs{blue_size}}}{batch.ass_escape(blue)}"))

    caption_units = subtitle_units(timed_units, settings)
    srt_blocks = []
    caption_events = caption_display_events(pages, caption_units, title_end, duration, settings) if show_caption else []
    srt_i = 1
    for event in caption_events:
        page_index = int(event.get("page_index", -1))
        visible_caption_lines = [
            line
            for line_index, line in enumerate(event["lines"])
            if (page_index, line_index) not in hidden_caption_lines
        ]
        if not visible_caption_lines:
            continue
        text = batch.ass_escape("\\N".join(visible_caption_lines))
        lines.append(batch.ass_dialogue(
            3,
            event["start"],
            event["end"],
            "Caption",
            f"{{\\pos({caption_x},{caption_y})\\fs{caption_size}}}{text}",
        ))
        srt_blocks.append(
            f"{srt_i}\n{batch.srt_time(event['start'])} --> {batch.srt_time(event['end'])}\n"
            f"{chr(10).join(visible_caption_lines)}"
        )
        srt_i += 1

    ass_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    srt_path.write_text("\n\n".join(srt_blocks) + "\n", encoding="utf-8")
    return title_end


def tighten_and_mix_selected_bgm(
    input_path,
    final_path,
    report_path,
    title_end,
    bgm_file,
    bgm_start_mode="after_title",
    bgm_enabled=True,
    sfx_file=None,
    sfx_starts_original=None,
    settings=None,
    report_extra=None,
):
    no_bgm = final_path.with_name(final_path.stem + "_no_bgm_tmp.mp4")
    settings = settings or {}
    sfx_starts_original = sorted(float(start) for start in (sfx_starts_original or []))
    total = batch.duration(input_path)
    trim_silence_enabled = settings.get("trimSilenceEnabled", True) is not False
    silence_min_seconds = bounded_number(settings.get("silenceMinSeconds"), 0.18, 0.05, 2.0)
    silence_keep_buffer = bounded_number(settings.get("silenceKeepBufferSeconds"), 0.04, 0.0, 0.5)
    if trim_silence_enabled:
        previous_min_silence = getattr(batch, "MIN_SILENCE", "0.18")
        previous_middle_keep = getattr(batch, "MIDDLE_KEEP", 0.08)
        previous_edge_keep = getattr(batch, "EDGE_KEEP", 0.04)
        batch.MIN_SILENCE = f"{silence_min_seconds:.3f}"
        batch.EDGE_KEEP = silence_keep_buffer
        batch.MIDDLE_KEEP = silence_keep_buffer * 2
        try:
            silences = batch.detect_silences(input_path)
            keep, cuts = batch.build_keep_segments(total, silences)
        finally:
            batch.MIN_SILENCE = previous_min_silence
            batch.MIDDLE_KEEP = previous_middle_keep
            batch.EDGE_KEEP = previous_edge_keep
        batch.render_tight_no_bgm(input_path, no_bgm, keep)
    else:
        silences = []
        cuts = []
        keep = [(0.0, total)]
        shutil.copy2(input_path, no_bgm)
    bgm_start_mode = str(bgm_start_mode or "after_title").strip()
    if bgm_start_mode not in {"full", "after_title"}:
        bgm_start_mode = "after_title"
    bgm_start_original = 0.0 if bgm_start_mode == "full" else title_end
    bgm_start = 0.0 if bgm_start_mode == "full" else batch.map_original_to_tight(title_end, keep)
    sfx_starts_tight = [
        batch.map_original_to_tight(start, keep)
        for start in sfx_starts_original
        if 0.0 <= start <= total + 0.1
    ]
    bgm_volume = volume_percent_to_gain(settings, "bgmVolumePercent", 22)
    sfx_volume = volume_percent_to_gain(settings, "sfxVolumePercent", 85)
    previous_bgm_volume = getattr(batch, "BGM_VOLUME", None)
    previous_sfx_volume = getattr(batch, "KEYWORD_SFX_VOLUME", None)
    if previous_bgm_volume is not None:
        batch.BGM_VOLUME = bgm_volume
    if previous_sfx_volume is not None:
        batch.KEYWORD_SFX_VOLUME = sfx_volume
    if bgm_enabled and bgm_file:
        try:
            batch.add_bgm(
                no_bgm,
                final_path,
                bgm_start,
                Path(bgm_file),
                keyword_sfx_path=Path(sfx_file) if sfx_file and sfx_starts_tight and sfx_volume > 0 else None,
                keyword_sfx_starts=sfx_starts_tight if sfx_volume > 0 else [],
            )
        finally:
            if previous_bgm_volume is not None:
                batch.BGM_VOLUME = previous_bgm_volume
            if previous_sfx_volume is not None:
                batch.KEYWORD_SFX_VOLUME = previous_sfx_volume
    else:
        try:
            shutil.copy2(no_bgm, final_path)
        finally:
            if previous_bgm_volume is not None:
                batch.BGM_VOLUME = previous_bgm_volume
            if previous_sfx_volume is not None:
                batch.KEYWORD_SFX_VOLUME = previous_sfx_volume
    new_total = batch.duration(final_path)
    report = [
        f"input={input_path}",
        f"output={final_path}",
        f"original_duration={total:.3f}",
        f"tight_duration={new_total:.3f}",
        f"removed={total - new_total:.3f}",
        f"trim_silence_enabled={trim_silence_enabled}",
        f"silence_min_seconds={silence_min_seconds:.3f}",
        f"silence_keep_buffer_seconds={silence_keep_buffer:.3f}",
        f"silence_middle_keep_seconds={silence_keep_buffer * 2:.3f}",
        f"silence_count={len(silences)}",
        f"cut_count={len(cuts)}",
        f"bgm_enabled={bool(bgm_enabled and bgm_file)}",
        f"bgm={bgm_file or ''}",
        f"bgm_volume_percent={bgm_volume * 100:.0f}",
        f"bgm_start_mode={bgm_start_mode}",
        f"bgm_start_original={bgm_start_original:.3f}",
        f"bgm_start_tight={bgm_start:.3f}",
        f"text_effect_sfx={sfx_file or ''}",
        f"text_effect_sfx_volume_percent={sfx_volume * 100:.0f}",
        "text_effect_sfx_starts_original=" + ",".join(f"{start:.3f}" for start in sfx_starts_original),
        "text_effect_sfx_starts_tight=" + ",".join(f"{start:.3f}" for start in sfx_starts_tight),
    ]
    for key, value in (report_extra or {}).items():
        report.append(f"{key}={value}")
    report_path.write_text("\n".join(report) + "\n", encoding="utf-8")


def load_state(path):
    if path.exists():
        try:
            state = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            state = {}
    else:
        state = {}
    if not isinstance(state, dict):
        state = {}
    state.setdefault("items", {})
    state.setdefault("meta", {})
    return state


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    state.setdefault("meta", {})["updated_at"] = int(time.time())
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def raw_path_for_task(task_id, slug):
    return batch.GENERATED_DIR / f"{task_id}_{slug}_raw.mp4"


def selected_chanjing_asset(settings, assets):
    raw_index = settings.get("chanjingAssetIndex")
    try:
        index = int(raw_index or 0)
    except (TypeError, ValueError):
        index = 0
    if index <= 0:
        return None
    if index > len(assets):
        raise SystemExit(f"数字人资产{index}不存在，当前只有 {len(assets)} 个")
    overrides = settings.get("chanjingAssetOverrides")
    if isinstance(overrides, dict):
        override = overrides.get(str(index)) or overrides.get(index)
        if isinstance(override, dict) and override.get("enabled") is False:
            raise SystemExit(f"数字人资产{index}已停用")
    return dict(assets[index - 1])


def normalize_asset_selection_mode(value):
    text = str(value or "custom").strip().lower()
    if text == "custom":
        return "random_account"
    if text == "rotate":
        return "rotate_account"
    if text == "random":
        return "random_all"
    return text if text in {"rotate_account", "random_account", "random_all", "fixed_template"} else "random_account"


def account_count_for_settings(settings):
    accounts = settings.get("chanjingAccounts")
    account_count = len(accounts) if isinstance(accounts, list) else 0
    account_map = settings.get("accountTemplates")
    if isinstance(account_map, dict):
        for key in account_map:
            try:
                account_count = max(account_count, int(key))
            except Exception:
                continue
    return max(1, account_count)


def parse_account_index_list(value, fallback, max_count):
    if isinstance(value, list):
        raw_items = value
    else:
        raw_items = re.split(r"[,，\s]+", str(value or ""))
    indexes = []
    for item in raw_items:
        try:
            index = int(item)
        except Exception:
            continue
        if 1 <= index <= max_count and index not in indexes:
            indexes.append(index)
    if indexes:
        return indexes
    try:
        fallback_index = int(fallback or 1)
    except Exception:
        fallback_index = 1
    return [min(max(1, fallback_index), max_count)]


def asset_enabled(settings, index):
    overrides = settings.get("chanjingAssetOverrides")
    if not isinstance(overrides, dict):
        return True
    override = overrides.get(str(index)) or overrides.get(index)
    return not (isinstance(override, dict) and override.get("enabled") is False)


def enabled_asset_indexes(settings, assets):
    return [
        index
        for index in range(1, len(assets) + 1)
        if asset_enabled(settings, index)
    ]


def template_config(value):
    if not isinstance(value, dict):
        return {}
    config = value.get("config")
    if isinstance(config, dict):
        return dict(config)
    return {
        key: item
        for key, item in value.items()
        if key not in {"id", "name", "assetIndex", "asset", "chanjingAssetIndex", "enabled"}
    }


def normalize_template_definition(value, account_index, position):
    if not isinstance(value, dict):
        return None
    try:
        asset_index = int(value.get("assetIndex") or value.get("chanjingAssetIndex") or value.get("asset") or 0)
    except Exception:
        asset_index = 0
    if asset_index <= 0:
        return None
    template_id = str(value.get("id") or f"tpl_{account_index}_{position}_{asset_index}").strip()
    if not template_id:
        return None
    return {
        "id": template_id,
        "name": str(value.get("name") or f"Template {position}").strip() or f"Template {position}",
        "assetIndex": asset_index,
        "enabled": value.get("enabled") is not False,
        "config": template_config(value),
    }


def account_templates(settings, account_index, include_disabled=False):
    raw = settings.get("accountTemplates")
    templates = []
    if isinstance(raw, dict):
        rows = raw.get(str(account_index)) or raw.get(account_index) or []
        if isinstance(rows, list):
            for position, row in enumerate(rows, start=1):
                template = normalize_template_definition(row, account_index, position)
                if template and (include_disabled or template.get("enabled", True)):
                    templates.append(template)
    return templates


def legacy_asset_templates(settings, account_index, assets):
    templates = []
    legacy = settings.get("accountAssetTemplates")
    if not isinstance(legacy, dict):
        legacy = {}
    for asset_index in enabled_asset_indexes(settings, assets):
        raw_config = legacy.get(f"{account_index}:{asset_index}")
        config = dict(raw_config) if isinstance(raw_config, dict) else {}
        templates.append({
            "id": f"asset_{asset_index}",
            "name": f"Asset {asset_index}",
            "assetIndex": asset_index,
            "enabled": True,
            "config": config,
        })
    return templates


def enabled_templates_for_account(settings, account_index, assets):
    all_templates = account_templates(settings, account_index, include_disabled=True)
    templates = [
        template
        for template in all_templates
        if template.get("enabled", True)
        if 1 <= int(template.get("assetIndex") or 0) <= len(assets)
        and asset_enabled(settings, int(template.get("assetIndex") or 0))
    ]
    if all_templates:
        return templates
    account_template_map = settings.get("accountTemplates")
    if isinstance(account_template_map, dict) and account_template_map:
        return []
    return legacy_asset_templates(settings, account_index, assets)


def enabled_template_entries(settings, assets, account_indexes=None):
    account_count = account_count_for_settings(settings)
    if account_indexes:
        indexes = [index for index in account_indexes if 1 <= int(index) <= account_count]
    else:
        indexes = list(range(1, account_count + 1))
    entries = []
    for account_index in indexes:
        for template in enabled_templates_for_account(settings, account_index, assets):
            item = dict(template)
            item["_accountIndex"] = account_index
            entries.append(item)
    return entries


def template_assignments(job):
    raw = job.get("templateAssignments")
    if not isinstance(raw, dict):
        raw = job.get("assetAssignments")
    if not isinstance(raw, dict):
        return {}
    assignments = {}
    for key, value in raw.items():
        try:
            row_index = int(key)
        except Exception:
            continue
        template_id = str(value or "").strip()
        if row_index > 0 and template_id:
            assignments[row_index] = template_id
    return assignments


def find_template(templates, template_id):
    wanted = str(template_id or "").strip()
    if not wanted:
        return None
    for template in templates:
        if str(template.get("id") or "") == wanted:
            return template
    try:
        legacy_asset_index = int(wanted)
    except Exception:
        legacy_asset_index = 0
    if legacy_asset_index > 0:
        for template in templates:
            if int(template.get("assetIndex") or 0) == legacy_asset_index:
                return template
    return None


def parse_template_assignment(value, fallback_account_index):
    text = str(value or "").strip()
    account_index = max(1, int(fallback_account_index or 1))
    if ":" not in text:
        return account_index, text
    account_raw, template_id = text.split(":", 1)
    try:
        parsed_account = int(account_raw)
    except Exception:
        parsed_account = account_index
    return max(1, parsed_account), template_id.strip()


def template_for_item(settings, item, ordinal, assets, job):
    account_index = account_index_for_job(settings)
    row_index = int(item.get("index") or 0)
    assigned = template_assignments(job).get(row_index)
    if assigned:
        account_index, assigned_id = parse_template_assignment(assigned, account_index)
        templates = enabled_templates_for_account(settings, account_index, assets)
        if not templates:
            raise SystemExit(f"Row {row_index} selected account has no templates: {account_index}")
        template = find_template(templates, assigned_id)
        if not template:
            raise SystemExit(f"Row {row_index} selected template is missing: {assigned}")
        template = dict(template)
        template["_accountIndex"] = account_index
        return template

    templates = enabled_templates_for_account(settings, account_index, assets)
    if not templates:
        raise SystemExit("No account templates")

    mode = normalize_asset_selection_mode(settings.get("assetSelectionMode"))
    if mode == "random_all":
        entries = enabled_template_entries(settings, assets)
        if not entries:
            raise SystemExit("No account templates")
        return dict(random.choice(entries))
    if mode == "random_account":
        account_indexes = parse_account_index_list(
            settings.get("runRandomAccountIndexes"),
            account_index,
            account_count_for_settings(settings),
        )
        entries = enabled_template_entries(settings, assets, account_indexes)
        if not entries:
            raise SystemExit("No account templates")
        return dict(random.choice(entries))
    if mode == "rotate_account":
        account_indexes = parse_account_index_list(
            settings.get("runRotateAccountIndexes"),
            settings.get("runRandomAccountIndexes") or account_index,
            account_count_for_settings(settings),
        )
        entries = enabled_template_entries(settings, assets, account_indexes)
        if not entries:
            raise SystemExit("No account templates")
        return dict(entries[(max(1, int(ordinal or 1)) - 1) % len(entries)])
    if mode == "fixed_template":
        try:
            fixed_account_index = int(settings.get("runFixedAccountIndex") or account_index)
        except Exception:
            fixed_account_index = account_index
        templates = enabled_templates_for_account(settings, fixed_account_index, assets)
        if not templates:
            raise SystemExit(f"Selected account has no templates: {fixed_account_index}")
        template = find_template(templates, settings.get("runFixedTemplateId") or settings.get("currentTemplateId"))
        if not template:
            raise SystemExit(f"Selected template is missing: {settings.get('runFixedTemplateId') or settings.get('currentTemplateId')}")
        template = dict(template)
        template["_accountIndex"] = fixed_account_index
        return template
    if mode == "rotate":
        template = dict(templates[(max(1, int(ordinal or 1)) - 1) % len(templates)])
        template["_accountIndex"] = account_index
        return template

    current = find_template(templates, settings.get("currentTemplateId"))
    template = dict(current or templates[0])
    template["_accountIndex"] = account_index
    return template


def job_asset_assignments(job):
    raw = job.get("assetAssignments")
    if not isinstance(raw, dict):
        return {}
    assignments = {}
    for key, value in raw.items():
        try:
            row_index = int(key)
            asset_index = int(value)
        except Exception:
            continue
        if row_index > 0 and asset_index > 0:
            assignments[row_index] = asset_index
    return assignments


def asset_index_for_item(settings, item, ordinal, assets, job):
    enabled = enabled_asset_indexes(settings, assets)
    if not enabled:
        raise SystemExit("没有启用的数字人资产")

    assignments = job_asset_assignments(job)
    row_index = int(item.get("index") or 0)
    assigned = assignments.get(row_index)
    if assigned:
        if assigned not in enabled:
            raise SystemExit(f"第 {row_index} 行选择的数字人资产{assigned}未启用或不存在")
        return assigned

    mode = normalize_asset_selection_mode(settings.get("assetSelectionMode"))
    if mode in {"random_account", "rotate_account", "random_all"}:
        return random.choice(enabled)
    if mode == "rotate":
        return enabled[(max(1, int(ordinal or 1)) - 1) % len(enabled)]

    fallback = int(settings.get("chanjingAssetIndex") or enabled[0])
    return fallback if fallback in enabled else enabled[0]


def account_index_for_job(settings):
    try:
        index = int(settings.get("runChanjingAccountIndex") or settings.get("chanjingAccountIndex") or 1)
    except Exception:
        index = 1
    return max(1, index)


def account_asset_template(settings, account_index, asset_index):
    templates = settings.get("accountAssetTemplates")
    if not isinstance(templates, dict):
        return {}
    template = templates.get(f"{account_index}:{asset_index}")
    return dict(template) if isinstance(template, dict) else {}


def settings_for_item(settings, item, ordinal, assets, job):
    template = template_for_item(settings, item, ordinal, assets, job)
    account_index = int(template.get("_accountIndex") or account_index_for_job(settings))
    asset_index = int(template.get("assetIndex") or 0)
    template_settings = dict(template.get("config") or {})
    merged = {
        **settings,
        **template_settings,
        "runChanjingAccountIndex": account_index,
        "chanjingAccountIndex": account_index,
        "chanjingAssetIndex": asset_index,
        "currentTemplateId": template.get("id", ""),
        "activeTemplateId": template.get("id", ""),
        "activeTemplateName": template.get("name", ""),
        "activeTemplateAssetIndex": asset_index,
        "activeTemplateKey": f"{account_index}:{template.get('id', '')}",
    }
    return merged


def same_chanjing_asset(left, right):
    if not isinstance(left, dict) or not isinstance(right, dict):
        return False
    left_key = (left.get("person_id"), left.get("file"), left.get("audio_man_id"))
    right_key = (right.get("person_id"), right.get("file"), right.get("audio_man_id"))
    return left_key == right_key


def asset_with_fixed_voice(asset, assets=None):
    updated = dict(asset)
    previous_audio = updated.get("audio_man_id")
    updated["audio_man_id"] = FIXED_VOICE_AUDIO_MAN_ID
    updated["voice_policy"] = "fixed_api_1_1"
    updated["audio_source_name"] = FIXED_VOICE_SOURCE_NAME
    updated["audio_source_file"] = FIXED_VOICE_SOURCE_FILE
    updated["audio_source_person_id"] = FIXED_VOICE_SOURCE_PERSON_ID
    if previous_audio and previous_audio != FIXED_VOICE_AUDIO_MAN_ID:
        updated["blocked_audio_man_id"] = previous_audio
        updated["audio_replaced"] = True
    return updated


def asset_with_allowed_voice(asset, assets):
    return asset_with_fixed_voice(asset, assets)


def recover_entry_from_previous_runs(slug, item, state_path, requested_asset=None):
    work_dir = state_path.parent
    if not work_dir.exists():
        return None

    state_files = sorted(
        [path for path in work_dir.glob("*_state.json") if path != state_path],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for path in state_files:
        try:
            previous = load_state(path)
        except Exception:
            continue
        entry = previous.get("items", {}).get(slug)
        if not isinstance(entry, dict) or not entry.get("task_id"):
            continue
        previous_hash = entry.get("text_hash")
        if previous_hash != item["text_hash"]:
            continue
        if requested_asset and not same_chanjing_asset(entry.get("asset"), requested_asset):
            continue
        task_id = str(entry["task_id"])
        raw_video = raw_path_for_task(task_id, slug)
        reusable = raw_video.exists() or entry.get("video_url") or entry.get("queue_status") in {"completed", "processing", "waiting"}
        reusable = reusable or str(entry.get("status", "")) in {"10", "20", "30", "40"}
        if not reusable:
            continue
        recovered = {
            key: value
            for key, value in entry.items()
            if key
            in {
                "asset",
                "task_id",
                "created_at",
                "status",
                "progress",
                "queue_status",
                "video_url",
                "completed_at",
            }
        }
        recovered["text_hash"] = item["text_hash"]
        recovered["recovered_from_state"] = str(path)
        return recovered

    return None


def is_chanjing_token_expired_error(error):
    try:
        payload = json.loads(str(error))
    except Exception:
        return "AccessToken" in str(error) and "失效" in str(error)
    return payload.get("code") == 10400 or payload.get("msg") == "AccessToken已失效"


def ensure_raw_video(item, index, assets, state_path, state, settings, force_fresh=False):
    slug = item["slug"]
    entry = state["items"].setdefault(slug, {})
    requested_asset = selected_chanjing_asset(settings, assets)
    if requested_asset:
        requested_asset = asset_with_fixed_voice(requested_asset, assets)
    if force_fresh:
        entry = {}
        state["items"][slug] = entry
    stored_hash = entry.get("text_hash")
    if entry.get("task_id") and stored_hash != item["text_hash"]:
        reason = "changed" if stored_hash else "unverified"
        log_json("state_text_changed", slug=slug, reason=reason)
        entry = {}
        state["items"][slug] = entry
    entry["text_hash"] = item["text_hash"]
    task_id = entry.get("task_id")
    if requested_asset and task_id and not same_chanjing_asset(entry.get("asset"), requested_asset):
        log_json(
            "state_asset_changed",
            slug=slug,
            from_asset=(entry.get("asset") or {}).get("name", ""),
            to_asset=requested_asset.get("name", ""),
        )
        entry = {"text_hash": item["text_hash"]}
        state["items"][slug] = entry
        task_id = None
    asset = requested_asset or (None if force_fresh else entry.get("asset")) or assets[(index - 1) % len(assets)]
    asset = asset_with_allowed_voice(asset, assets)
    if task_id and not same_chanjing_asset(entry.get("asset"), asset):
        log_json(
            "state_asset_voice_changed",
            slug=slug,
            from_audio=(entry.get("asset") or {}).get("audio_man_id", ""),
            to_audio=asset.get("audio_man_id", ""),
        )
        entry = {"text_hash": item["text_hash"]}
        state["items"][slug] = entry
        task_id = None
    entry["asset"] = asset
    raw_video = None
    if task_id:
        raw_video = raw_path_for_task(task_id, slug)
        if raw_video.exists():
            log_json("raw_reuse", slug=slug, task_id=task_id, raw=str(raw_video))
            return task_id, raw_video

    if not task_id and not force_fresh:
        recovered = recover_entry_from_previous_runs(slug, item, state_path, requested_asset=requested_asset)
        if recovered:
            entry.update(recovered)
            task_id = entry.get("task_id")
            if not entry.get("asset"):
                entry["asset"] = asset
            save_state(state_path, state)
            log_json(
                "chanjing_recovered",
                slug=slug,
                task_id=task_id,
                from_state=entry.get("recovered_from_state", ""),
                from_raw=entry.get("recovered_from_raw", ""),
            )
            raw_video = raw_path_for_task(task_id, slug)
            if raw_video.exists():
                log_json("raw_reuse", slug=slug, task_id=task_id, raw=str(raw_video))
                return task_id, raw_video

    token = batch.get_token()
    if not task_id:
        if asset.get("audio_replaced"):
            log_json(
                "voice_replaced",
                slug=slug,
                person_id=asset.get("person_id"),
                blocked_audio_man_id=asset.get("blocked_audio_man_id"),
                audio_man_id=asset.get("audio_man_id"),
                audio_source_name=asset.get("audio_source_name"),
            )
        log_json("chanjing_create", slug=slug, index=index)
        task_id = batch.create_video(token, asset, item["text"])
        entry["task_id"] = task_id
        entry["created_at"] = int(time.time())
        save_state(state_path, state)
        log_json("chanjing_created", slug=slug, task_id=task_id)

    raw_video = raw_path_for_task(task_id, slug)
    deadline = time.time() + int(settings.get("timeoutMinutes") or 45) * 60
    poll_interval = max(5, int(settings.get("pollIntervalSeconds") or 20))
    while True:
        try:
            status = batch.video_status(token, task_id)
        except RuntimeError as error:
            if not is_chanjing_token_expired_error(error):
                raise
            log_json("chanjing_token_refresh", slug=slug, task_id=task_id)
            token = batch.get_token()
            continue
        entry["status"] = status.get("status")
        entry["progress"] = status.get("progress")
        entry["queue_status"] = status.get("queue_status")
        save_state(state_path, state)
        log_json(
            "chanjing_status",
            slug=slug,
            task_id=task_id,
            status=entry["status"],
            queue_status=entry["queue_status"],
            progress=entry["progress"],
        )
        if status.get("video_url"):
            entry["video_url"] = status["video_url"]
            entry["completed_at"] = entry.get("completed_at") or int(time.time())
            save_state(state_path, state)
            break
        if time.time() > deadline:
            raise SystemExit(f"{slug} 等待蝉镜超时")
        time.sleep(poll_interval)

    if force_fresh or not raw_video.exists():
        log_json("download_raw", slug=slug, raw=str(raw_video))
        batch.download(entry["video_url"], raw_video)
    return task_id, raw_video


def process_item(item, index, assets, state_path, state, settings, runtime, job):
    slug = item["slug"]
    if apply_item_content_override(item, index, load_content_overrides(job)):
        log_json("content_override_applied", index=index, slug=slug, chars=len(item["text"]))
    started_at = time.time()
    log_json(
        "item_start",
        index=index,
        slug=slug,
        topic=item.get("topic", ""),
        started_at=started_at,
        template_key=settings.get("activeTemplateKey", ""),
        template_id=settings.get("activeTemplateId", ""),
        template_name=settings.get("activeTemplateName", ""),
        chanjing_asset_index=settings.get("chanjingAssetIndex", ""),
    )
    try:
        show_caption = clip_enabled(settings, "clipCaption", True)
        reviewed_pages = supervise_caption_breaks(settings, item) if show_caption else []
        task_id, raw_video = ensure_raw_video(
            item,
            index,
            assets,
            state_path,
            state,
            settings,
            force_fresh=bool(job.get("forceFreshChanjing", False)),
        )

        output_dir = runtime["bundle"] / "outputs" / state_path.stem.replace("_state", "")
        output_dir.mkdir(parents=True, exist_ok=True)
        prefix = f"{index:02d}_{task_id}_{slug}"
        transcript_path = batch.GENERATED_DIR / f"{task_id}_{slug}.json"
        ass_path = output_dir / f"{prefix}.ass"
        srt_path = output_dir / f"{prefix}.srt"
        text_effect_plan_path = output_dir / f"{prefix}_text_effects.json"
        remotion_image_plan_path = output_dir / f"{prefix}_image_effects.json"
        remotion_image_layer = output_dir / f"{prefix}_image_effects.mov"
        packaged = output_dir / f"{prefix}_packaged.mp4"
        packaged_with_images = output_dir / f"{prefix}_packaged_image_effects.mp4"
        packaged_with_logo = output_dir / f"{prefix}_packaged_logo.mp4"
        final = output_dir / f"{prefix}_final.mp4"
        report = output_dir / f"{prefix}_report.txt"
        opening_replaced = output_dir / f"{prefix}_opening_replaced_tmp.mp4"

        transcript = batch.load_or_transcribe(raw_video, transcript_path)
        hook, units = batch.build_spoken_units(item["text"])
        timed_units = batch.assign_timings(units, transcript)
        duration = batch.duration(raw_video)
        if apply_item_title_override(item, index, load_title_overrides(job)):
            log_json("title_override_applied", index=index, slug=slug, title=item["title"])
        title_end = batch.title_end_for_units(timed_units)
        caption_units = subtitle_units(timed_units, settings)
        backing_exclusive_sentence_indices = backing_exclusive_sentence_indices_for_text(item.get("text", ""))
        text_effect_specs = review_text_effect_specs(settings, item, reviewed_pages)
        text_effect_specs = filter_text_effect_specs_by_blocked_sentences(
            text_effect_specs,
            reviewed_pages,
            caption_units,
            backing_exclusive_sentence_indices,
        )
        render_pages, text_effect_specs = isolate_text_effect_caption_pages(reviewed_pages, caption_units, text_effect_specs)
        caption_events = caption_display_events(render_pages, caption_units, title_end, duration, settings) if show_caption else []
        source_for_packaging = raw_video
        report_extra = {
            "clip_title": clip_enabled(settings, "clipTitle", True),
            "clip_caption": show_caption,
            "clip_bgm": clip_enabled(settings, "clipBgm", True),
            "hide_cta_captions": hide_cta_captions(settings),
            "clip_title_motion": title_motion_enabled(settings),
            "clip_intro": effect_enabled(settings, "clipIntro"),
            "clip_patent": effect_enabled(settings, "clipPatent"),
            "clip_pip": effect_enabled(settings, "clipPip"),
            "clip_text_effects": effect_enabled(settings, "clipTextEffects"),
            "clip_logo": clip_enabled(settings, "clipLogo", False),
            "template_key": str(settings.get("activeTemplateKey", "")),
            "template_id": str(settings.get("activeTemplateId", "")),
            "template_name": str(settings.get("activeTemplateName", "")),
            "template_asset_index": str(settings.get("activeTemplateAssetIndex", "")),
            "chanjing_account_index": str(settings.get("chanjingAccountIndex", "")),
            "chanjing_asset_index": str(settings.get("chanjingAssetIndex", "")),
            "caption_buffer_seconds": f"{caption_buffer_seconds(settings):.3f}",
            "pip_duration_seconds": f"{pip_duration_seconds(settings):.3f}",
            "pip_close_at_sentence_end": pip_close_at_sentence_end(settings),
            "effect_priority_policy": "user_configured_0_to_10_lower_number_wins",
            "effect_conflict_policy": "skip_whole_lower_priority_event",
            "priority_title_motion": setting_priority(settings, "titleMotionPriority"),
            "priority_inheritance": setting_priority(settings, "inheritancePriority"),
            "priority_patent": setting_priority(settings, "patentPriority"),
            "priority_pip": setting_priority(settings, "pipPriority"),
            "priority_text_effect": setting_priority(settings, "textEffectPriority"),
            "backing_exclusive_sentence_indices": ",".join(str(value) for value in sorted(backing_exclusive_sentence_indices)),
            "backing_exclusive_sentence_policy": "only_backing_effects_when_xinhuo_or_patent_sentence_ends_with_period",
        }

        effect_candidates = []
        if title_motion_enabled(settings):
            title_event = effect_event("title_motion", 0.0, title_end, priority=setting_priority(settings, "titleMotionPriority"))
            if title_event:
                effect_candidates.append(title_event)
        effect_candidates.extend(build_backing_image_effect_events(settings, timed_units, duration, title_end))
        effect_candidates.extend(build_pip_effect_events(settings, timed_units, duration, title_end, backing_exclusive_sentence_indices))
        effect_candidates.extend(build_text_effect_events(settings, render_pages, caption_events, text_effect_specs, backing_exclusive_sentence_indices))
        selected_effects, skipped_effects = select_effect_events(effect_candidates)
        selected_effects, skipped_effects = enforce_single_pip_event(selected_effects, skipped_effects)
        selected_title_motion = any(event.get("effect_type") == "title_motion" for event in selected_effects)
        selected_pip_events = [
            event["pip"]
            for event in selected_effects
            if event.get("pip")
        ]
        selected_image_events = [
            event["image_event"]
            for event in selected_effects
            if event.get("image_event")
        ]
        image_effect_offset = 0.0
        image_effect_duration = 0.0
        shifted_image_events = []
        if selected_image_events:
            image_effect_start, image_effect_end = remotion_image_event_window(selected_image_events, duration)
            image_effect_offset = image_effect_start
            image_effect_duration = max(0.0, image_effect_end - image_effect_start)
            shifted_image_events = shift_remotion_image_events(selected_image_events, image_effect_offset)
        selected_text_effect_events = [
            event
            for event in selected_effects
            if event.get("effect_type") == "text_effect"
        ]
        text_effect_sfx_file = None
        text_effect_sfx_mode = "none"
        text_effect_sfx_starts = [float(event["start"]) for event in selected_text_effect_events]
        keyword_sfx_starts, keyword_sfx_after = keyword_sfx_starts_after_intro(settings, timed_units, title_end)
        combined_sfx_starts = sorted({
            round(float(start), 3)
            for start in [*text_effect_sfx_starts, *keyword_sfx_starts]
        })
        if combined_sfx_starts:
            text_effect_sfx_file, text_effect_sfx_mode = choose_text_effect_sfx(settings)
        hidden_caption_lines = {
            (int(event["page_index"]), int(event["line_index"]))
            for event in selected_text_effect_events
            if event.get("page_index") is not None and event.get("line_index") is not None
        }
        report_extra.update({
            "effect_selected": format_effect_ranges(selected_effects),
            "effect_skipped": format_effect_ranges(skipped_effects),
            "image_effect_plan": str(remotion_image_plan_path),
            "image_effect_selected_count": len(selected_image_events),
            "image_effect_short_render": bool(selected_image_events),
            "image_effect_offset_seconds": f"{image_effect_offset:.3f}",
            "image_effect_duration_seconds": f"{image_effect_duration:.3f}",
            "image_effect_render_frames": int(round(image_effect_duration * 25)) if selected_image_events else 0,
            "text_effect_plan": str(text_effect_plan_path),
            "text_effect_selected_count": len(selected_text_effect_events),
            "text_effect_hidden_caption_lines": ",".join(f"{page}:{line}" for page, line in sorted(hidden_caption_lines)),
            "text_effect_sfx_mode": text_effect_sfx_mode,
            "text_effect_sfx": str(text_effect_sfx_file or ""),
            "text_effect_sfx_starts_original": ",".join(f"{start:.3f}" for start in text_effect_sfx_starts),
            "keyword_sfx_enabled": clip_enabled(settings, "keywordSfxEnabled", True),
            "keyword_sfx_terms": ",".join(keyword_sfx_terms(settings)),
            "keyword_sfx_after_original": f"{keyword_sfx_after:.3f}",
            "keyword_sfx_starts_original": ",".join(f"{start:.3f}" for start in keyword_sfx_starts),
            "combined_sfx_starts_original": ",".join(f"{start:.3f}" for start in combined_sfx_starts),
        })
        write_text_effect_plan(text_effect_plan_path, selected_effects, skipped_effects)
        for skipped in skipped_effects:
            log_json(
                "effect_skipped",
                index=index,
                slug=slug,
                effect_type=skipped.get("effect_type"),
                start=skipped.get("start"),
                end=skipped.get("end"),
                skipped_by=skipped.get("skipped_by"),
            )

        write_reviewed_subtitles(
            item,
            timed_units,
            hook,
            render_pages,
            duration,
            ass_path,
            srt_path,
            settings,
            hidden_caption_lines=hidden_caption_lines,
        )

        if selected_title_motion:
            opening_video, opening_mode = choose_opening_video(settings)
            replaced_seconds = replace_opening_visual(raw_video, opening_video, opening_replaced, title_end)
            source_for_packaging = opening_replaced
            report_extra.update({
                "opening_video_mode": opening_mode,
                "opening_video": str(opening_video),
                "opening_replace_seconds": f"{replaced_seconds:.3f}",
            })
            log_json(
                "opening_video_applied",
                index=index,
                slug=slug,
                mode=opening_mode,
                opening_video=str(opening_video),
                replace_seconds=round(replaced_seconds, 3),
            )
        render_packaged_without_builtin_logo(source_for_packaging, ass_path, packaged, pip_events=selected_pip_events)
        packaged_for_tighten = packaged
        if selected_image_events:
            write_remotion_image_plan(
                remotion_image_plan_path,
                shifted_image_events,
                duration,
                offset_seconds=image_effect_offset,
                source_duration=image_effect_duration,
            )
            batch.render_remotion_effects(remotion_image_plan_path, remotion_image_layer)
            overlay_remotion_effects_at_offset(
                packaged_for_tighten,
                remotion_image_layer,
                packaged_with_images,
                image_effect_offset,
                image_effect_duration,
            )
            packaged_for_tighten = packaged_with_images
            log_json(
                "image_effect_applied",
                index=index,
                slug=slug,
                effects=len(selected_image_events),
                offset=round(image_effect_offset, 3),
                duration=round(image_effect_duration, 3),
                output=str(packaged_with_images),
            )
        if selected_text_effect_events:
            text_effect_layers_dir = output_dir / f"{prefix}_text_effect_layers"
            text_effect_packaged = output_dir / f"{prefix}_packaged_text_effects.mp4"
            rendered_text_effects = render_text_effect_clips(text_effect_plan_path, text_effect_layers_dir)
            report_extra.update({
                "text_effect_layers_dir": str(text_effect_layers_dir),
                "text_effect_rendered_clips": len(rendered_text_effects),
            })
            if rendered_text_effects:
                overlay_text_effect_clips(packaged_for_tighten, rendered_text_effects, text_effect_packaged)
                packaged_for_tighten = text_effect_packaged
                log_json(
                    "text_effect_applied",
                    index=index,
                    slug=slug,
                    clips=len(rendered_text_effects),
                    output=str(text_effect_packaged),
                )
        if clip_enabled(settings, "clipLogo", False):
            logo_box = preview_layout_box(settings, "previewLogo", {"x": 90, "y": 88, "w": 180, "h": 180, "min_w": 48, "min_h": 48})
            logo_file, logo_mode = choose_logo_file(settings)
            overlay_logo_full_video(packaged_for_tighten, logo_file, settings, packaged_with_logo)
            packaged_for_tighten = packaged_with_logo
            report_extra.update({
                "logo_mode": logo_mode,
                "logo_file": str(logo_file),
                "logo_box": json.dumps(logo_box, ensure_ascii=False),
                "logo_opacity_percent": str(settings.get("logoOpacityPercent", 100)),
            })
            log_json(
                "logo_applied",
                index=index,
                slug=slug,
                output=str(packaged_with_logo),
            )
        report_extra["bgm_mode"] = runtime.get("bgm_mode", "")
        tighten_and_mix_selected_bgm(
            packaged_for_tighten,
            final,
            report,
            title_end,
            runtime["bgm_file"],
            settings.get("bgmStartMode"),
            bgm_enabled=clip_enabled(settings, "clipBgm", True),
            sfx_file=text_effect_sfx_file,
            sfx_starts_original=combined_sfx_starts,
            settings=settings,
            report_extra=report_extra,
        )

        copied = runtime["output_dir"] / final.name
        shutil.copy2(final, copied)
        completed_at = time.time()
        state["items"].setdefault(slug, {})["final_path"] = str(copied)
        state["items"][slug]["processed_at"] = int(completed_at)
        save_state(state_path, state)
        log_json(
            "item_done",
            index=index,
            slug=slug,
            output=str(copied),
            started_at=started_at,
            completed_at=completed_at,
            elapsed_seconds=round(completed_at - started_at, 3),
        )
        log(f"DONE {index:02d} {slug} -> {copied}")
    except BaseException as exc:
        if isinstance(exc, KeyboardInterrupt):
            raise
        failed_at = time.time()
        traceback_text = traceback.format_exc()
        error_text = str(exc)
        if traceback_text and traceback_text.strip() and traceback_text.strip() != "NoneType: None":
            error_text = f"{error_text}\n{traceback_text}"
        entry = state["items"].setdefault(slug, {})
        entry["failed_at"] = int(failed_at)
        entry["error"] = error_text
        save_state(state_path, state)
        log_json(
            "item_failed",
            index=index,
            slug=slug,
            error=error_text,
            started_at=started_at,
            failed_at=failed_at,
            elapsed_seconds=round(failed_at - started_at, 3),
        )
        raise


def run_job(job):
    settings = dict(job["settings"])
    batch_output_name = safe_output_subdir(job.get("batchOutputName"))
    if batch_output_name:
        settings["outputSubdir"] = batch_output_name
    input_path = Path(require(job.get("inputJsonPath"), "任务 JSON"))
    if not input_path.exists():
        raise SystemExit(f"任务 JSON 不存在：{input_path}")
    bundle = import_batch(require(settings.get("bundlePath"), "素材包目录"))

    data = json.loads(input_path.read_text(encoding="utf-8"))
    items = normalize_items(data)
    apply_content_overrides(items, job.get("contentOverrides"))
    apply_title_overrides(items, job.get("titleOverrides"))
    chosen_indexes = selected_indexes(job)
    if chosen_indexes:
        items = [item for item in items if item["index"] in chosen_indexes]
        if not items:
            raise SystemExit("没有匹配到勾选行")
    max_items = int(settings.get("maxItems") or 0)
    if max_items > 0:
        items = items[:max_items]

    assets_path = bundle / "openapi" / "hu_teacher_api_assets.json"
    assets = json.loads(assets_path.read_text(encoding="utf-8"))
    if not assets:
        raise SystemExit(f"蝉镜数字人资产为空：{assets_path}")

    batch_name = stable_job_name(input_path)
    state_path = bundle / "work" / f"{batch_name}_state.json"
    state = load_state(state_path)
    state["meta"].update({
        "batch_name": batch_name,
        "input_json": str(input_path),
        "updated_at": int(time.time()),
        "run_account_index": account_index_for_job(settings),
        "asset_selection_mode": normalize_asset_selection_mode(settings.get("assetSelectionMode")),
    })
    save_state(state_path, state)
    random.seed()

    log_json(
        "job_start",
        name=data.get("meta", {}).get("name", ""),
        count=len(items),
        state=str(state_path),
        force_fresh_chanjing=bool(job.get("forceFreshChanjing", False)),
        run_account_index=account_index_for_job(settings),
        asset_selection_mode=normalize_asset_selection_mode(settings.get("assetSelectionMode")),
    )
    succeeded = 0
    failed = 0
    consecutive_errors = 0
    last_runtime = None
    for ordinal, item in enumerate(items, start=1):
        setup_started_at = time.time()
        try:
            try:
                item_settings = settings_for_item(settings, item, ordinal, assets, job)
                runtime = apply_settings(item_settings, bundle)
                last_runtime = runtime
            except BaseException as setup_exc:
                failed_at = time.time()
                traceback_text = traceback.format_exc()
                error_text = str(setup_exc)
                if traceback_text and traceback_text.strip() and traceback_text.strip() != "NoneType: None":
                    error_text = f"{error_text}\n{traceback_text}"
                log_json(
                    "item_failed",
                    index=item.get("index"),
                    slug=item.get("slug", ""),
                    error=error_text,
                    started_at=setup_started_at,
                    failed_at=failed_at,
                    elapsed_seconds=round(failed_at - setup_started_at, 3),
                )
                raise
            process_item(item, item["index"], assets, state_path, state, item_settings, runtime, job)
            succeeded += 1
            consecutive_errors = 0
        except BaseException as exc:
            if isinstance(exc, KeyboardInterrupt):
                raise
            failed += 1
            consecutive_errors += 1
            if consecutive_errors >= 3:
                log_json(
                    "job_failed",
                    count=len(items),
                    succeeded=succeeded,
                    failed=failed,
                    consecutive_errors=consecutive_errors,
                    error=str(exc),
                )
                raise SystemExit(f"连续 {consecutive_errors} 条任务失败，已停止：{exc}")
            continue
    output_dir = last_runtime["output_dir"] if last_runtime else Path(settings.get("outputDir") or "")
    log_json("job_done", count=len(items), succeeded=succeeded, failed=failed, output_dir=str(output_dir))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job", required=True)
    args = parser.parse_args()
    try:
        job = json.loads(Path(args.job).read_text(encoding="utf-8"))
        run_job(job)
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)


if __name__ == "__main__":
    main()
