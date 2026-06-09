#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import hashlib
import json
import os
import random
import re
import shutil
import sys
import time
import traceback
import urllib.request
from pathlib import Path


batch = None

BAD_VOICE_PERSON_IDS = {
    "C-29530f42cc1e483a9cb4c3327af3e41e": "胡老师_API_21",
}


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


def ass_color(value, default="#ffffff", opacity_percent=100):
    color = normalized_hex_color(value, default)
    opacity = bounded_number(opacity_percent, 100, 0, 100)
    alpha = round(255 * (1 - opacity / 100))
    red, green, blue = color[0:2], color[2:4], color[4:6]
    return f"&H{alpha:02X}{blue.upper()}{green.upper()}{red.upper()}"


def style_outline(settings, key, default):
    value = bounded_number(settings.get(key), default, 0, 80)
    return int(value) if value.is_integer() else round(value, 2)


def apply_settings(settings, bundle):
    title_font = Path(require(settings.get("titleFontPath"), "标题字体文件"))
    caption_font = Path(require(settings.get("captionFontPath"), "字幕字体文件"))
    bgm_file = Path(require(settings.get("bgmFile"), "BGM 文件"))
    output_dir = Path(require(settings.get("outputDir"), "输出目录"))
    if not title_font.exists():
        raise SystemExit(f"标题字体不存在：{title_font}")
    if not caption_font.exists():
        raise SystemExit(f"字幕字体不存在：{caption_font}")
    if not bgm_file.exists():
        raise SystemExit(f"BGM 文件不存在：{bgm_file}")

    batch.BASE_URL = settings.get("chanjingBaseUrl") or batch.BASE_URL
    os.environ["CHANJING_APP_ID"] = require(settings.get("chanjingAppId"), "蝉镜 AK / App ID")
    os.environ["CHANJING_SECRET_KEY"] = require(settings.get("chanjingSecretKey"), "蝉镜 SK / Secret Key")

    batch.TITLE_FONT_PATH = title_font
    batch.CAPTION_FONT_PATH = caption_font
    batch.FONT_PATH = caption_font
    batch.TITLE_ASS_FONT_FAMILY = ass_family_for_path(title_font, batch.TITLE_FONT_FAMILY)
    batch.CAPTION_ASS_FONT_FAMILY = ass_family_for_path(caption_font, batch.CAPTION_FONT_FAMILY)
    batch.DISCLAIMER_ASS_FONT_FAMILY = batch.CAPTION_ASS_FONT_FAMILY
    batch.create_font_asset(required_roles=("caption", "title"))

    output_dir.mkdir(parents=True, exist_ok=True)
    batch.GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    return {
        "title_font": title_font,
        "caption_font": caption_font,
        "bgm_file": bgm_file,
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


def auto_caption_pages(caption_units):
    pages = []
    cursor = 0
    for group in batch.build_caption_pages(caption_units):
        start = cursor
        end = cursor + len(group) - 1
        lines = [batch.display_line(line) for line in batch.caption_group_lines(group)]
        pages.append({"start": start, "end": end, "lines": [line for line in lines if line]})
        cursor = end + 1
    return pages


def validate_pages(pages, caption_units):
    issues = []
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
        if not lines or len(lines) > 2:
            issues.append(f"第 {page_index} 页必须是 1-2 行")
            continue
        expected = batch.display_line("".join(caption_units[i]["text"] for i in range(start, end + 1)))
        actual = batch.display_line("".join(lines))
        if actual != expected:
            issues.append(f"第 {page_index} 页改字或漏字：期望 {expected}，实际 {actual}")
        for line in lines:
            if not batch.caption_fits(line):
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


def valid_lines_for_text(text):
    expected = batch.display_line(text)
    if not expected:
        return []

    candidates = []
    if batch.caption_fits(expected):
        candidates.append([expected])

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
        if key in seen or not (1 <= len(normalized) <= 2):
            continue
        seen.add(key)
        if "".join(normalized) != expected:
            continue
        if not all(batch.caption_fits(line) for line in normalized):
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


def repair_caption_pages(caption_units):
    repaired = []
    cursor = 0
    while cursor < len(caption_units):
        best = None
        max_end = min(len(caption_units) - 1, cursor + 5)
        for end in range(max_end, cursor - 1, -1):
            text = "".join(caption_units[i]["text"] for i in range(cursor, end + 1))
            lines = valid_lines_for_text(text)
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


def caption_display_events(pages, caption_units, title_end, duration):
    title_clear_time = min(duration, title_end + 0.12)
    events = []
    for page in pages:
        group = caption_units[page["start"]:page["end"] + 1]
        if not group:
            continue
        start = max(group[0]["start"], title_clear_time)
        end = group[-1]["end"]
        if end <= title_clear_time:
            continue
        if end - start < 0.25:
            end = min(duration, start + 0.35)
        caption_lines = sanitize_caption_lines(page["lines"])
        if caption_lines and end > start:
            events.append({"start": start, "end": end, "lines": caption_lines})

    for current, following in zip(events, events[1:]):
        if current["end"] > following["start"] - 0.02:
            current["end"] = max(current["start"] + 0.18, following["start"] - 0.02)
    return [event for event in events if event["end"] > event["start"]]


def supervise_caption_breaks(settings, item):
    hook, units = batch.build_spoken_units(item["text"])
    caption_units = [unit for unit in units if unit.get("source") != "title" and unit.get("visible")]
    initial_pages = auto_caption_pages(caption_units)
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
            "单行尽量 7-10 个中文字符，最长不要超过 12 个中文字符；遇到大家好我是北京特聘基层、专攻二型糖尿疒调理方向、可只要它和血糖反复一起出现这类长行必须拆开。",
            "不能出现饭后高背/后、胰岛修/复、一吃/饭、糖尿/疒、二型糖尿/疒这类读起来别扭或把词拆碎的断法。",
            "不能改字、不能漏字、不能添加标点；每一行字幕结尾都不要带逗号、句号、问号、感叹号、顿号、分号、冒号等标点；可以把连续单元合成一页。",
            "显示替换已经执行：医显示为醫，药显示为藥，病显示为疒。",
            "CTA 也要显示字幕。",
        ],
        "caption_units": unit_payload,
        "current_pages": initial_pages,
    }
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
            issues, normalized = validate_pages(pages, caption_units)
        except Exception as exc:
            issues, normalized = [f"JSON 解析失败：{exc}"], []
        if not issues:
            log_json("caption_review_ok", slug=item["slug"], pages=len(normalized), attempt=attempt)
            return normalized
        last_issues = issues
        messages.append({"role": "assistant", "content": content})
        messages.append({
            "role": "user",
            "content": (
                "上一次返回不合格，请只返回修正后的 JSON。\n"
                "如果问题里有“单行超宽”，必须把那一行拆成两行，或者把这一页拆成前后相邻两页；不能再次输出同样的长行。\n"
                "修正后仍然不能改字、漏字、加标点，每行结尾也不能带标点。\n"
                "问题：\n" + "\n".join(issues)
            ),
        })
    repaired = repair_caption_pages(caption_units)
    if repaired:
        repair_issues, normalized = validate_pages(repaired, caption_units)
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


def write_reviewed_subtitles(item, timed_units, hook, pages, duration, ass_path, srt_path, settings):
    title_end = batch.title_end_for_units(timed_units)
    item_title = item.get("title") or batch.title_lines(hook)
    item_title = list(item_title) + ["", "", ""]
    red, yellow, blue = [batch.display_line(t) for t in item_title[:3]]
    red_size = batch.fit_font_size([red], 144, batch.TITLE_MIN_FONT_SIZE, role="title")
    yellow_size = batch.fit_font_size([yellow], 144, batch.TITLE_MIN_FONT_SIZE, role="title")
    blue_size = batch.fit_font_size([blue], 132, batch.TITLE_MIN_FONT_SIZE, role="title")
    disclaimer_opacity = bounded_number(settings.get("disclaimerOpacityPercent"), 50, 0, 100)

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{batch.CAPTION_ASS_FONT_FAMILY},96,{ass_color(settings.get("captionColor"), "#ffffff")},&H000000FF,{ass_color(settings.get("captionOutlineColor"), "#000000")},&H00000000,1,0,0,0,100,100,0,0,1,{style_outline(settings, "captionOutlineSize", 8)},0,5,40,40,40,1
Style: Disclaimer,{batch.DISCLAIMER_ASS_FONT_FAMILY},43,{ass_color(settings.get("disclaimerColor"), "#ffffff", disclaimer_opacity)},&H000000FF,{ass_color(settings.get("disclaimerOutlineColor"), "#000000")},&H00000000,1,0,0,0,100,100,0,0,1,{style_outline(settings, "disclaimerOutlineSize", 0)},0,5,30,30,30,1
Style: TitleRed,{batch.TITLE_ASS_FONT_FAMILY},144,{ass_color(settings.get("titleTopColor"), "#ffffff")},&H000000FF,{ass_color(settings.get("titleTopOutlineColor"), "#000000")},&H00000000,1,0,0,0,100,100,0,0,1,{style_outline(settings, "titleTopOutlineSize", 8)},0,5,20,20,20,1
Style: TitleYellow,{batch.TITLE_ASS_FONT_FAMILY},144,{ass_color(settings.get("titleMiddleColor"), "#ffde00")},&H000000FF,{ass_color(settings.get("titleMiddleOutlineColor"), "#000000")},&H00000000,1,0,0,0,100,100,0,0,1,{style_outline(settings, "titleMiddleOutlineSize", 8)},0,5,20,20,20,1
Style: TitleBlue,{batch.TITLE_ASS_FONT_FAMILY},132,{ass_color(settings.get("titleBottomColor"), "#ff2a00")},&H000000FF,{ass_color(settings.get("titleBottomOutlineColor"), "#ffffff")},&H00000000,1,0,0,0,100,100,0,0,1,{style_outline(settings, "titleBottomOutlineSize", 8)},0,5,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header.rstrip()]
    lines.append(batch.ass_dialogue(
        1,
        0,
        duration,
        "Disclaimer",
        f"{{\\pos(540,{batch.DISCLAIMER_POS_Y})}}{batch.ass_escape(batch.display_text(batch.DISCLAIMER))}",
    ))
    lines.append(batch.ass_dialogue(4, 0, title_end, "TitleRed", f"{{\\pos(540,{batch.TITLE_TOP_Y})\\fs{red_size}}}{batch.ass_escape(red)}"))
    lines.append(batch.ass_dialogue(4, 0, title_end, "TitleYellow", f"{{\\pos(540,{batch.TITLE_CORE_Y})\\fs{yellow_size}}}{batch.ass_escape(yellow)}"))
    lines.append(batch.ass_dialogue(4, 0, title_end, "TitleBlue", f"{{\\pos(540,{batch.TITLE_BOTTOM_Y})\\fs{blue_size}}}{batch.ass_escape(blue)}"))

    caption_units = [unit for unit in timed_units if unit.get("source") != "title" and unit.get("visible")]
    srt_blocks = []
    for srt_i, event in enumerate(caption_display_events(pages, caption_units, title_end, duration), start=1):
        text = batch.ass_escape("\\N".join(event["lines"]))
        lines.append(batch.ass_dialogue(
            3,
            event["start"],
            event["end"],
            "Caption",
            f"{{\\pos(540,1495)\\fs{batch.CAPTION_FONT_SIZE}}}{text}",
        ))
        srt_blocks.append(
            f"{srt_i}\n{batch.srt_time(event['start'])} --> {batch.srt_time(event['end'])}\n"
            f"{chr(10).join(event['lines'])}"
        )

    ass_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    srt_path.write_text("\n\n".join(srt_blocks) + "\n", encoding="utf-8")
    return title_end


def tighten_and_mix_selected_bgm(input_path, final_path, report_path, title_end, bgm_file):
    no_bgm = final_path.with_name(final_path.stem + "_no_bgm_tmp.mp4")
    total = batch.duration(input_path)
    silences = batch.detect_silences(input_path)
    keep, cuts = batch.build_keep_segments(total, silences)
    batch.render_tight_no_bgm(input_path, no_bgm, keep)
    bgm_start = batch.map_original_to_tight(title_end, keep)
    batch.add_bgm(no_bgm, final_path, bgm_start, Path(bgm_file), keyword_sfx_path=None, keyword_sfx_starts=[])
    new_total = batch.duration(final_path)
    report = [
        f"input={input_path}",
        f"output={final_path}",
        f"original_duration={total:.3f}",
        f"tight_duration={new_total:.3f}",
        f"removed={total - new_total:.3f}",
        f"silence_count={len(silences)}",
        f"cut_count={len(cuts)}",
        f"bgm={bgm_file}",
        f"bgm_start_original={title_end:.3f}",
        f"bgm_start_tight={bgm_start:.3f}",
        "keyword_sfx=",
        "keyword_sfx_starts_original=",
        "keyword_sfx_starts_tight=",
    ]
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


def asset_with_allowed_voice(asset, assets):
    if asset.get("person_id") not in BAD_VOICE_PERSON_IDS:
        return asset

    candidates = [
        candidate
        for candidate in assets
        if candidate.get("person_id") != asset.get("person_id")
        and candidate.get("audio_man_id")
        and candidate.get("audio_man_id") != asset.get("audio_man_id")
    ]
    if not candidates:
        raise SystemExit(f"{asset.get('name') or asset.get('person_id')} 没有可替换的声音资产")

    voice_source = random.choice(candidates)
    updated = dict(asset)
    updated["blocked_audio_man_id"] = asset.get("audio_man_id")
    updated["audio_man_id"] = voice_source["audio_man_id"]
    updated["audio_replaced"] = True
    updated["audio_source_name"] = voice_source.get("name", "")
    updated["audio_source_file"] = voice_source.get("file", "")
    updated["audio_source_person_id"] = voice_source.get("person_id", "")
    return updated


def recover_entry_from_previous_runs(slug, item, state_path):
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
        if previous_hash and previous_hash != item["text_hash"]:
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

    raws = sorted(batch.GENERATED_DIR.glob(f"*_{slug}_raw.mp4"), key=lambda path: path.stat().st_mtime, reverse=True)
    if raws:
        match = re.match(rf"(.+?)_{re.escape(slug)}_raw\.mp4$", raws[0].name)
        if match:
            return {
                "task_id": match.group(1),
                "text_hash": item["text_hash"],
                "recovered_from_raw": str(raws[0]),
            }
    return None


def ensure_raw_video(item, index, assets, state_path, state, settings, force_fresh=False):
    slug = item["slug"]
    entry = state["items"].setdefault(slug, {})
    if force_fresh:
        entry = {}
        state["items"][slug] = entry
    if entry.get("text_hash") and entry.get("text_hash") != item["text_hash"]:
        log_json("state_text_changed", slug=slug)
        entry = {}
        state["items"][slug] = entry
    entry["text_hash"] = item["text_hash"]
    task_id = entry.get("task_id")
    asset = (None if force_fresh else entry.get("asset")) or assets[(index - 1) % len(assets)]
    if not task_id:
        asset = asset_with_allowed_voice(asset, assets)
    entry["asset"] = asset
    raw_video = None
    if task_id:
        raw_video = raw_path_for_task(task_id, slug)
        if raw_video.exists():
            log_json("raw_reuse", slug=slug, task_id=task_id, raw=str(raw_video))
            return task_id, raw_video

    if not task_id and not force_fresh:
        recovered = recover_entry_from_previous_runs(slug, item, state_path)
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
        status = batch.video_status(token, task_id)
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
    log_json("item_start", index=index, slug=slug, topic=item.get("topic", ""), started_at=started_at)
    try:
        reviewed_pages = supervise_caption_breaks(settings, item)
        task_id, raw_video = ensure_raw_video(
            item,
            index,
            assets,
            state_path,
            state,
            settings,
            force_fresh=bool(job.get("forceFreshChanjing", True)),
        )

        output_dir = runtime["bundle"] / "outputs" / state_path.stem.replace("_state", "")
        output_dir.mkdir(parents=True, exist_ok=True)
        prefix = f"{index:02d}_{task_id}_{slug}"
        transcript_path = batch.GENERATED_DIR / f"{task_id}_{slug}.json"
        ass_path = output_dir / f"{prefix}.ass"
        srt_path = output_dir / f"{prefix}.srt"
        packaged = output_dir / f"{prefix}_packaged.mp4"
        final = output_dir / f"{prefix}_final.mp4"
        report = output_dir / f"{prefix}_report.txt"

        transcript = batch.load_or_transcribe(raw_video, transcript_path)
        hook, units = batch.build_spoken_units(item["text"])
        timed_units = batch.assign_timings(units, transcript)
        duration = batch.duration(raw_video)
        if apply_item_title_override(item, index, load_title_overrides(job)):
            log_json("title_override_applied", index=index, slug=slug, title=item["title"])
        title_end = write_reviewed_subtitles(item, timed_units, hook, reviewed_pages, duration, ass_path, srt_path, settings)
        batch.render_packaged(raw_video, ass_path, packaged, pip_events=[])
        tighten_and_mix_selected_bgm(packaged, final, report, title_end, runtime["bgm_file"])

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
        entry = state["items"].setdefault(slug, {})
        entry["failed_at"] = int(failed_at)
        entry["error"] = str(exc)
        save_state(state_path, state)
        log_json(
            "item_failed",
            index=index,
            slug=slug,
            error=str(exc),
            started_at=started_at,
            failed_at=failed_at,
            elapsed_seconds=round(failed_at - started_at, 3),
        )
        raise


def run_job(job):
    settings = job["settings"]
    input_path = Path(require(job.get("inputJsonPath"), "任务 JSON"))
    if not input_path.exists():
        raise SystemExit(f"任务 JSON 不存在：{input_path}")
    bundle = import_batch(require(settings.get("bundlePath"), "素材包目录"))
    runtime = apply_settings(settings, bundle)

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
    })
    save_state(state_path, state)
    random.seed()

    log_json(
        "job_start",
        name=data.get("meta", {}).get("name", ""),
        count=len(items),
        state=str(state_path),
        force_fresh_chanjing=bool(job.get("forceFreshChanjing", True)),
    )
    succeeded = 0
    failed = 0
    consecutive_errors = 0
    for item in items:
        try:
            process_item(item, item["index"], assets, state_path, state, settings, runtime, job)
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
    log_json("job_done", count=len(items), succeeded=succeeded, failed=failed, output_dir=str(runtime["output_dir"]))


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
