#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import argparse
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}
FIXED_VOICE_AUDIO_MAN_ID = "C-74273aa7d0674244a2c6842dc7abc1a1"


def log(message):
    print(message, flush=True)


def app_settings_path():
    return Path(os.environ["APPDATA"]) / "hu-teacher-video-app" / "settings.json"


def read_json(path, default):
    path = Path(path)
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def api_request(base_url, method, path, token=None, body=None, query=None, timeout=120):
    url = base_url.rstrip("/") + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["access_token"] = token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def get_token(settings):
    res = api_request(
        settings.get("chanjingBaseUrl") or "https://www.chanjing.cc/api",
        "POST",
        "/open/v1/access_token",
        body={
            "app_id": settings.get("chanjingAppId"),
            "secret_key": settings.get("chanjingSecretKey"),
        },
    )
    if res.get("code") != 0:
        raise RuntimeError(f"access_token failed: {json.dumps(res, ensure_ascii=False)}")
    return res["data"]["access_token"]


def video_files(source_dir=None, selected_files=None):
    if selected_files:
        files = []
        for item in selected_files:
            path = Path(item)
            if not path.exists():
                raise SystemExit(f"video file not found: {path}")
            if not path.is_file() or path.suffix.lower() not in VIDEO_EXTS:
                raise SystemExit(f"unsupported video file: {path}")
            files.append(path)
        return files

    source = Path(source_dir)
    if not source.exists():
        raise SystemExit(f"source dir not found: {source}")
    return sorted(
        [path for path in source.iterdir() if path.is_file() and path.suffix.lower() in VIDEO_EXTS],
        key=lambda path: path.name,
    )


def next_api_number(bundle_path):
    asset_path = Path(bundle_path) / "openapi" / "hu_teacher_api_assets.json"
    assets = read_json(asset_path, [])
    max_number = 0
    for asset in assets if isinstance(assets, list) else []:
        name = str(asset.get("name") or "")
        if not name.startswith("胡老师_API_"):
            continue
        suffix = name.rsplit("_", 1)[-1]
        if "-" in suffix:
            suffix = suffix.split("-", 1)[0]
        try:
            max_number = max(max_number, int(suffix))
        except ValueError:
            pass
    return max_number + 1


def load_state(state_path, files, bundle_path, names=None):
    state = read_json(state_path, {"items": []})
    by_file = {item.get("file"): item for item in state.get("items", []) if item.get("file")}
    items = []
    next_number = next_api_number(bundle_path)
    names = list(names or [])
    if names and len(names) != len(files):
        raise SystemExit(f"--name count ({len(names)}) must match video count ({len(files)})")
    for index, path in enumerate(files):
        item = dict(by_file.get(path.name) or {})
        item.setdefault("file", path.name)
        item["path"] = str(path)
        if names:
            item["name"] = names[index]
        else:
            item.setdefault("name", f"胡老师_API_{next_number}")
        item.setdefault("status", "pending")
        items.append(item)
        next_number += 1
    state["items"] = items
    state["source_dir"] = str(Path(files[0].parent) if files else "")
    write_json(state_path, state)
    return state


def upload_file(settings, token, item):
    if item.get("file_id"):
        return
    base_url = settings.get("chanjingBaseUrl") or "https://www.chanjing.cc/api"
    file_path = Path(item["path"])
    log(f"[upload-url] {file_path.name}")
    res = api_request(base_url, "GET", "/open/v1/common/create_upload_url", token=token, query={
        "service": "customised_person",
        "name": file_path.name,
    })
    if res.get("code") != 0:
        item["status"] = "upload_url_failed"
        item["upload_url_response"] = res
        raise RuntimeError(f"create_upload_url failed for {file_path.name}: {res}")
    data = res["data"]
    content_type = data.get("mime_type") or mimetypes.guess_type(str(file_path))[0] or "video/mp4"
    log(f"[upload] {file_path.name} -> {data.get('file_id')}")
    with file_path.open("rb") as handle:
        req = urllib.request.Request(
            data["sign_url"],
            data=handle,
            headers={"Content-Type": content_type},
            method="PUT",
        )
        with urllib.request.urlopen(req, timeout=900) as resp:
            item["upload_http_status"] = resp.status
            resp.read()
    item["file_id"] = data["file_id"]
    item["file_url"] = data.get("full_path")
    item["upload_mime_type"] = content_type
    item["status"] = "uploaded"


def wait_file_ready(settings, token, item):
    if item.get("file_ready"):
        return
    base_url = settings.get("chanjingBaseUrl") or "https://www.chanjing.cc/api"
    for attempt in range(1, 49):
        res = api_request(base_url, "GET", "/open/v1/common/file_detail", token=token, query={"id": item["file_id"]})
        item["file_detail_response"] = res
        data = res.get("data") or {}
        if res.get("code") == 0 and data.get("status") == 1:
            item["file_ready"] = True
            item["status"] = "file_ready"
            return
        log(f"[wait-file] {item['file']} attempt {attempt}: {data.get('status')} {data.get('msg', '')}")
        time.sleep(5)
    raise RuntimeError(f"file not ready: {item['file']} {item.get('file_detail_response')}")


def create_person(settings, token, item):
    if item.get("person_id"):
        return
    base_url = settings.get("chanjingBaseUrl") or "https://www.chanjing.cc/api"
    log(f"[create] {item['file']} name={item['name']}")
    res = api_request(base_url, "POST", "/open/v1/create_customised_person", token=token, body={
        "name": item["name"],
        "callback": "",
        "train_type": "both",
        "language": "cn",
        "file_id": item["file_id"],
        "error_skip": False,
        "resolution_rate": 0,
    })
    item["create_response"] = res
    if res.get("code") == 0:
        item["person_id"] = res.get("data")
        item["status"] = "submitted"
        return
    item["status"] = "create_failed"
    raise RuntimeError(f"create failed for {item['file']}: {res}")


def media_dimensions(path):
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return 1080, 1920
    try:
        raw = subprocess.check_output([
            ffprobe,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "json",
            str(path),
        ], stderr=subprocess.STDOUT, text=True, timeout=30)
        info = json.loads(raw)
        stream = (info.get("streams") or [{}])[0]
        return int(stream.get("width") or 1080), int(stream.get("height") or 1920)
    except Exception:
        return 1080, 1920


def make_cover(video_path, cover_path):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return ""
    cover_path = Path(cover_path)
    if cover_path.exists():
        return cover_path.resolve().as_uri()
    cover_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run([
            ffmpeg,
            "-y",
            "-ss", "0.5",
            "-i", str(video_path),
            "-frames:v", "1",
            "-q:v", "3",
            str(cover_path),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        return cover_path.resolve().as_uri()
    except Exception:
        return ""


def register_assets(bundle_path, items, fixed_voice_id, voice_mode, source_label):
    asset_path = Path(bundle_path) / "openapi" / "hu_teacher_api_assets.json"
    assets = read_json(asset_path, [])
    if not isinstance(assets, list):
        raise RuntimeError(f"asset json is not a list: {asset_path}")
    by_person = {asset.get("person_id"): index for index, asset in enumerate(assets) if asset.get("person_id")}
    by_file = {asset.get("file"): index for index, asset in enumerate(assets) if asset.get("file")}
    covers_dir = Path(bundle_path) / "openapi" / "new_template_covers"
    added = 0
    updated = 0
    for item in items:
        person_id = item.get("person_id")
        if not person_id:
            continue
        source = Path(item["path"])
        width, height = media_dimensions(source)
        preview_url = source.resolve().as_uri()
        make_cover(source, covers_dir / f"{source.stem}.jpg")
        pic_url = f"openapi/new_template_covers/{source.stem}.jpg"
        audio_man_id = person_id if voice_mode == "own" else fixed_voice_id
        entry = {
            "file": source.name,
            "name": item.get("name") or f"新数字人模板_{source.stem}",
            "person_id": person_id,
            "audio_man_id": audio_man_id,
            "status": item.get("status") or "submitted",
            "progress": 0 if item.get("status") == "submitted" else item.get("progress", 0),
            "width": width,
            "height": height,
            "preview_url": preview_url,
            "pic_url": pic_url,
            "err_reason": "",
            "source": source_label,
            "voice_policy": "own_uploaded_video" if voice_mode == "own" else "fixed_api_1_1",
            "preserve_own_voice": voice_mode == "own",
            "created_at": int(time.time()),
        }
        index = by_person.get(person_id)
        if index is None:
            index = by_file.get(source.name)
        if index is None:
            assets.append(entry)
            by_person[person_id] = len(assets) - 1
            by_file[source.name] = len(assets) - 1
            added += 1
        else:
            assets[index] = {**assets[index], **entry}
            updated += 1
    write_json(asset_path, assets)
    return {"asset_path": str(asset_path), "asset_count": len(assets), "added": added, "updated": updated}


def sync_asset_json(source_bundle, target_bundle):
    source_path = Path(source_bundle) / "openapi" / "hu_teacher_api_assets.json"
    target_path = Path(target_bundle) / "openapi" / "hu_teacher_api_assets.json"
    if source_path.resolve() == target_path.resolve():
        return False
    if not target_path.exists():
        return False
    shutil.copy2(source_path, target_path)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", default=str(Path.home() / "Desktop" / "新数字人模板"))
    parser.add_argument("--video", action="append", default=[], help="explicit video file; repeat to preserve order")
    parser.add_argument("--name", action="append", default=[], help="asset display name; repeat once per video")
    parser.add_argument("--settings", default=str(app_settings_path()))
    parser.add_argument("--repo-bundle", default="")
    parser.add_argument("--fixed-voice-id", default=FIXED_VOICE_AUDIO_MAN_ID)
    parser.add_argument("--voice-mode", choices=["fixed", "own"], default="fixed")
    parser.add_argument("--source-label", default="new_digital_person_templates")
    parser.add_argument("--state-name", default="new_digital_person_templates_state.json")
    args = parser.parse_args()

    settings = read_json(args.settings, {})
    if not settings.get("chanjingAppId") or not settings.get("chanjingSecretKey"):
        raise SystemExit("missing chanjingAppId or chanjingSecretKey in settings")
    bundle_path = Path(settings.get("bundlePath") or "").resolve()
    if not bundle_path.exists():
        raise SystemExit(f"bundlePath not found: {bundle_path}")
    state_path = bundle_path / "work" / args.state_name
    files = video_files(args.source_dir, args.video)
    state = load_state(state_path, files, bundle_path, args.name)
    state["updated_at"] = int(time.time())
    state["fixed_voice_id"] = args.fixed_voice_id
    state["voice_mode"] = args.voice_mode
    state["source_label"] = args.source_label
    write_json(state_path, state)

    token = get_token(settings)
    last_create = 0.0
    for index, item in enumerate(state["items"], start=1):
        log(f"\n== {index}/{len(state['items'])} {item['file']} ==")
        upload_file(settings, token, item)
        write_json(state_path, state)
        wait_file_ready(settings, token, item)
        write_json(state_path, state)
        wait_seconds = 7 - (time.time() - last_create)
        if wait_seconds > 0:
            time.sleep(wait_seconds)
        create_person(settings, token, item)
        last_create = time.time()
        item["updated_at"] = int(last_create)
        write_json(state_path, state)

    result = register_assets(bundle_path, state["items"], args.fixed_voice_id, args.voice_mode, args.source_label)
    state["asset_register_result"] = result
    state["updated_at"] = int(time.time())
    if args.repo_bundle:
        state["repo_asset_json_synced"] = sync_asset_json(bundle_path, args.repo_bundle)
    write_json(state_path, state)
    log("\nDone.")
    log(json.dumps({
        "state_path": str(state_path),
        **result,
        "items": [
            {"file": item.get("file"), "name": item.get("name"), "person_id": item.get("person_id"), "status": item.get("status")}
            for item in state["items"]
        ],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
