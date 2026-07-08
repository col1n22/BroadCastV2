# -*- coding: utf-8 -*-
import argparse
import json
import mimetypes
import pathlib
import time
import urllib.parse
import urllib.request


REPO = pathlib.Path(__file__).resolve().parents[1]
BUNDLE = REPO / "resources_bundle" / "hu_teacher_resource_bundle_20260602"
ASSETS_PATH = BUNDLE / "openapi" / "hu_teacher_api_assets.json"
STATE_PATH = BUNDLE / "work" / "xie_doctor_customize_batch.json"
DEFAULT_SETTINGS_PATH = REPO / "defaults" / "settings.json"
SOURCE_DIR = pathlib.Path(r"C:\Users\Administrator\Desktop\谢医生")
SOURCE_TAG = "xie_doctor_templates"
BASE_URL = "https://www.chanjing.cc/api"
TOKEN_CACHE = {"value": "", "created_at": 0.0}


def load_settings():
    return json.loads(DEFAULT_SETTINGS_PATH.read_text(encoding="utf-8"))


def request(method, path, token=None, body=None, query=None, timeout=120):
    url = BASE_URL + path
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


def get_token(force=False):
    if not force and TOKEN_CACHE["value"] and time.time() - TOKEN_CACHE["created_at"] < 90:
        return TOKEN_CACHE["value"]
    settings = load_settings()
    app_id = settings.get("chanjingAppId")
    secret_key = settings.get("chanjingSecretKey")
    if not app_id or not secret_key:
        raise SystemExit("defaults/settings.json 里没有蝉镜 AK/SK")
    res = request("POST", "/open/v1/access_token", body={
        "app_id": app_id,
        "secret_key": secret_key,
    })
    if res.get("code") != 0:
        raise RuntimeError(f"token failed: {json.dumps(res, ensure_ascii=False)}")
    TOKEN_CACHE["value"] = res["data"]["access_token"]
    TOKEN_CACHE["created_at"] = time.time()
    return TOKEN_CACHE["value"]


def auth_request(method, path, body=None, query=None, timeout=120):
    res = request(method, path, token=get_token(), body=body, query=query, timeout=timeout)
    if res.get("code") == 10400:
        res = request(method, path, token=get_token(force=True), body=body, query=query, timeout=timeout)
    return res


def save_state(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE_PATH)


def load_state(files):
    if STATE_PATH.exists():
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    else:
        state = {"items": []}
    by_file = {item.get("file"): item for item in state.get("items", [])}
    items = []
    for index, path in enumerate(files, 1):
        item = dict(by_file.get(path.name, {}))
        item.setdefault("file", path.name)
        item.setdefault("path", str(path))
        item["name"] = f"谢医生{index}"
        item["order"] = index
        item.setdefault("status", "pending")
        items.append(item)
    state["items"] = items
    state["source_dir"] = str(SOURCE_DIR)
    state["source_tag"] = SOURCE_TAG
    state["updated_at"] = int(time.time())
    save_state(state)
    return state


def source_files():
    if not SOURCE_DIR.exists():
        raise SystemExit(f"找不到视频目录：{SOURCE_DIR}")
    files = [
        path for path in SOURCE_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in {".mp4", ".mov", ".webm"}
    ]
    return sorted(files, key=lambda path: path.name)


def upload_file(token, item):
    if item.get("file_id"):
        return
    file_path = pathlib.Path(item["path"])
    print(f"[upload-url] {item['name']} {file_path.name}", flush=True)
    res = auth_request("GET", "/open/v1/common/create_upload_url", query={
        "service": "customised_person",
        "name": file_path.name,
    })
    item["upload_url_response"] = res
    if res.get("code") != 0:
        item["status"] = "upload_url_failed"
        raise RuntimeError(f"create_upload_url failed for {file_path.name}: {res}")
    data = res["data"]
    content_type = data.get("mime_type") or mimetypes.guess_type(str(file_path))[0] or "video/mp4"
    print(f"[upload] {file_path.name} -> {data.get('file_id')}", flush=True)
    with file_path.open("rb") as f:
        req = urllib.request.Request(
            data["sign_url"],
            data=f,
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


def wait_file_ready(token, item):
    if item.get("file_ready"):
        return
    for attempt in range(1, 49):
        res = auth_request("GET", "/open/v1/common/file_detail", query={"id": item["file_id"]})
        item["file_detail_response"] = res
        data = res.get("data") or {}
        if res.get("code") == 0 and data.get("status") == 1:
            item["file_ready"] = True
            return
        print(f"[wait-file] {item['name']} attempt {attempt}: {data.get('status')} {data.get('msg', '')}", flush=True)
        time.sleep(5)
    raise RuntimeError(f"file not ready: {item['file']} {item.get('file_detail_response')}")


def create_person(token, item):
    if item.get("person_id"):
        return
    print(f"[create] {item['name']} from {item['file']}", flush=True)
    res = auth_request("POST", "/open/v1/create_customised_person", body={
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
        item["submitted_at"] = int(time.time())
    else:
        item["status"] = "create_failed"
        raise RuntimeError(f"create failed for {item['file']}: {res}")


def refresh_person(token, item):
    if not item.get("person_id"):
        return
    res = auth_request("GET", "/open/v1/customised_person", query={"id": item["person_id"]})
    item["detail_response"] = res
    data = res.get("data") or {}
    if res.get("code") == 0 and data.get("id"):
        for key in [
            "name", "pic_url", "preview_url", "width", "height", "audio_man_id",
            "status", "err_reason", "progress", "create_time",
        ]:
            if key in data:
                item[key] = data[key]
        item["detail_checked_at"] = int(time.time())


def create_all(state, token):
    last_create = 0.0
    for index, item in enumerate(state["items"], 1):
        print(f"\n== {index}/{len(state['items'])} {item['name']} {item['file']} ==", flush=True)
        upload_file(token, item)
        save_state(state)
        wait_file_ready(token, item)
        save_state(state)
        elapsed = time.time() - last_create
        if elapsed < 7:
            time.sleep(7 - elapsed)
        create_person(token, item)
        save_state(state)
        refresh_person(token, item)
        save_state(state)
        last_create = time.time()


def status_code(item):
    try:
        return int(item.get("status") or 0)
    except (TypeError, ValueError):
        return 0


def wait_all_ready(state, token, timeout_seconds):
    deadline = time.time() + timeout_seconds
    while True:
        complete = 0
        failed = []
        for item in state["items"]:
            refresh_person(token, item)
            status = status_code(item)
            if status == 2 and item.get("audio_man_id"):
                complete += 1
            elif status in {3, 4, 5} or item.get("err_reason"):
                failed.append(item)
        save_state(state)
        print(f"[poll] ready {complete}/{len(state['items'])}", flush=True)
        if complete == len(state["items"]):
            return
        if failed:
            names = ", ".join(f"{item.get('name')}:{item.get('err_reason') or item.get('status')}" for item in failed)
            raise RuntimeError(f"customised person failed: {names}")
        if time.time() >= deadline:
            raise TimeoutError(f"等待蝉镜训练完成超时，状态已保存：{STATE_PATH}")
        time.sleep(30)


def upsert_assets(state):
    assets = json.loads(ASSETS_PATH.read_text(encoding="utf-8"))
    existing_by_person = {item.get("person_id") for item in state["items"] if item.get("person_id")}
    assets = [
        asset for asset in assets
        if asset.get("source") != SOURCE_TAG and asset.get("person_id") not in existing_by_person
    ]
    new_assets = []
    for item in sorted(state["items"], key=lambda value: int(value.get("order") or 0)):
        if status_code(item) != 2 or not item.get("audio_man_id"):
            raise RuntimeError(f"{item.get('name')} 还没训练完成，不能写入资产列表")
        new_assets.append({
            "file": item["file"],
            "name": item["name"],
            "person_id": item["person_id"],
            "audio_man_id": item["audio_man_id"],
            "status": item.get("status"),
            "progress": item.get("progress", 100),
            "width": item.get("width") or 720,
            "height": item.get("height") or 1280,
            "preview_url": item.get("preview_url", ""),
            "pic_url": item.get("pic_url", ""),
            "err_reason": item.get("err_reason", ""),
            "source": SOURCE_TAG,
            "voice_policy": "own_uploaded_video",
            "preserve_own_voice": True,
            "created_at": item.get("create_time") or item.get("submitted_at") or int(time.time()),
        })
    tmp = ASSETS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(assets + new_assets, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(ASSETS_PATH)
    print(f"[assets] wrote {len(new_assets)} 谢医生 assets -> {ASSETS_PATH}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--wait", type=int, default=3600, help="wait seconds for Chanjing training")
    parser.add_argument("--status-only", action="store_true")
    parser.add_argument("--write-assets-only", action="store_true")
    args = parser.parse_args()

    files = source_files()
    if not files:
        raise SystemExit(f"目录里没有视频：{SOURCE_DIR}")
    state = load_state(files)
    token = get_token()
    if not args.status_only and not args.write_assets_only:
        create_all(state, token)
    if not args.write_assets_only:
        wait_all_ready(state, token, args.wait)
    upsert_assets(state)
    print(json.dumps([
        {
            "name": item.get("name"),
            "file": item.get("file"),
            "person_id": item.get("person_id"),
            "audio_man_id": item.get("audio_man_id"),
            "status": item.get("status"),
            "progress": item.get("progress"),
        }
        for item in state["items"]
    ], ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
