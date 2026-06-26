#!/usr/bin/env python3
import argparse
import difflib
import hashlib
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets"
OPENAPI_ROOT = ROOT / "openapi"
ENV_PATH = ROOT / "work" / "chanjing.env"
ASSETS_PATH = OPENAPI_ROOT / "hu_teacher_api_assets.json"
BASE_URL = "https://www.chanjing.cc/api"

_AUDIO_EXTS = {".aac", ".m4a", ".mp3", ".wav"}
_IMAGE_EXTS = {".jpeg", ".jpg", ".png", ".webp"}
_VIDEO_EXTS = {".avi", ".m4v", ".mkv", ".mov", ".mp4", ".webm"}


def _first_existing(*paths):
    for path in paths:
        if path and path.exists():
            return path
    return paths[0] if paths else Path("")


def _first_existing_optional(*paths):
    for path in paths:
        if path and path.exists():
            return path
    return None


def _windows_long_path(path):
    resolved = str(Path(path).resolve())
    if os.name != "nt" or resolved.startswith("\\\\?\\"):
        return resolved
    if resolved.startswith("\\\\"):
        return "\\\\?\\UNC\\" + resolved.lstrip("\\")
    return "\\\\?\\" + resolved


def _path_exists(path):
    return Path(_windows_long_path(path)).exists() if os.name == "nt" else Path(path).exists()


def _copy_file(src, dst):
    dst = Path(dst)
    Path(_windows_long_path(dst.parent)).mkdir(parents=True, exist_ok=True)
    shutil.copy2(_windows_long_path(src), _windows_long_path(dst))


def _copy_tree(src, dst):
    if not _path_exists(src):
        return
    shutil.copytree(_windows_long_path(src), _windows_long_path(dst), dirs_exist_ok=True)


def _remove_tree(path):
    if _path_exists(path):
        shutil.rmtree(_windows_long_path(path))


def _cli_path(path):
    return str(Path(path).resolve()).replace("\\", "/")


_FONT_SUFFIXES = {".ttf", ".otf", ".ttc"}


def _normalize_font_name(value):
    return re.sub(r"[\s_\-().=]+", "", value).casefold()


def _font_search_dirs():
    return [
        ASSET_ROOT / "font",
        FONT_DIR,
        LOCAL_FONT_DIR,
        LOCAL_FONT_DIR_2,
        WINDOWS_FONT_DIR,
    ]


def _find_font_file(*aliases):
    exact_candidates = []
    for directory in _font_search_dirs():
        for alias in aliases:
            alias_path = Path(alias)
            if alias_path.suffix.lower() in _FONT_SUFFIXES:
                exact_candidates.append(directory / alias_path.name)
            else:
                exact_candidates.extend(directory / f"{alias}{suffix}" for suffix in sorted(_FONT_SUFFIXES))
    found = _first_existing_optional(*exact_candidates)
    if found:
        return found

    normalized_aliases = [_normalize_font_name(alias) for alias in aliases if alias]
    for directory in _font_search_dirs():
        if not directory.exists():
            continue
        for child in sorted(directory.iterdir()):
            if not child.is_file() or child.suffix.lower() not in _FONT_SUFFIXES:
                continue
            normalized_name = _normalize_font_name(child.stem)
            if any(alias and alias in normalized_name for alias in normalized_aliases):
                return child
    return None


def _direct_files(path, suffixes):
    if not path.exists():
        return []
    return [child for child in path.iterdir() if child.is_file() and child.suffix.lower() in suffixes]


def _asset_dir_matching(predicate, fallback_name):
    if ASSET_ROOT.exists():
        for path in ASSET_ROOT.iterdir():
            if path.is_dir() and predicate(path):
                return path
    return ASSET_ROOT / fallback_name


def _chrome_executable():
    candidates = []
    env_path = os.environ.get("CHROME_EXECUTABLE")
    if env_path:
        candidates.append(Path(env_path))
    candidates.extend([
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Google" / "Chrome" / "Application" / "chrome.exe",
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Google" / "Chrome" / "Application" / "chrome.exe",
    ])
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        candidates.append(Path(local_app_data) / "Google" / "Chrome" / "Application" / "chrome.exe")
    candidates.append(Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Microsoft" / "Edge" / "Application" / "msedge.exe")
    return _first_existing(*candidates)


def _node_executable():
    candidates = []
    env_path = os.environ.get("NODE_EXECUTABLE") or os.environ.get("NODE_EXE")
    if env_path:
        candidates.append(Path(env_path))
    npm_path = shutil.which("npm.cmd") or shutil.which("npm")
    if npm_path:
        candidates.append(Path(npm_path).parent / "node.exe")
    candidates.extend([
        Path(sys.executable).resolve().parents[1] / "nodejs" / "node.exe",
        Path(sys.executable).resolve().parent / "node.exe",
    ])
    found = _first_existing_optional(*candidates)
    if found:
        return found
    return Path(shutil.which("node.exe") or shutil.which("node") or "node")

FONT_DIR = ASSET_ROOT / "template_assets" / "fonts"
LOCAL_FONT_DIR = Path(os.environ.get("USERPROFILE", r"C:\Users\Administrator")) / "Desktop" / "字体"
LOCAL_FONT_DIR_2 = Path(os.environ.get("USERPROFILE", r"C:\Users\Administrator")) / "Desktop" / "字体2"
WINDOWS_FONT_DIR = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
TITLE_FONT_FAMILY = "尔雅新大黑"
CAPTION_FONT_FAMILY = "优设书华体"
DISCLAIMER_FONT_FAMILY = CAPTION_FONT_FAMILY
SOURCE_HAN_FONT_PATH = _first_existing(
    ASSET_ROOT / "font" / "SourceHanSerifCN-Bold.otf",
    ASSET_ROOT / "template_assets" / "fonts" / "SourceHanSerifCN-Bold.otf",
)
TITLE_FONT_PATH = _find_font_file("尔雅新大黑", "尔雅新大", "EryaXinDaHei", "Erya")
CAPTION_FONT_PATH = _find_font_file("优设书华体", "优设书华", "YouSheShuHuaTi", "YousheShuHuaTi")
FONT_PATH = CAPTION_FONT_PATH or SOURCE_HAN_FONT_PATH


def _ass_font_family(font_path, fallback):
    if font_path and font_path.name == "优设书华体.ttf":
        return "YouSheShuHaTi"
    if font_path and "尔雅新大黑" in font_path.stem and "试用版" in font_path.stem:
        return "EYXDH_3500ZSYB Regular"
    return fallback


TITLE_ASS_FONT_FAMILY = _ass_font_family(TITLE_FONT_PATH, TITLE_FONT_FAMILY)
CAPTION_ASS_FONT_FAMILY = _ass_font_family(CAPTION_FONT_PATH, CAPTION_FONT_FAMILY)
DISCLAIMER_ASS_FONT_FAMILY = CAPTION_ASS_FONT_FAMILY
LOGO_PATH = ASSET_ROOT / "template_assets" / "medical_logo_ref_1080.png"
LOGO_SOURCE = LOGO_PATH
BGM_DIR = Path("/Users/cjj/素材/BGM")
KEYWORD_SFX_DIR = Path("/Users/cjj/素材/关键词音效")
REMOTION_EFFECTS_DIR = ROOT / "work" / "remotion_effects"
REMOTION_PUBLIC_DIR = REMOTION_EFFECTS_DIR / "public"
CHROME_EXECUTABLE = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
PIP_MATERIAL_DIR = Path("/Users/cjj/素材/看诊素材")
ISLET_MATERIAL_DIR = Path("/Users/cjj/素材/胰岛")
BACKGROUND_MATERIAL_DIR = Path("/Users/cjj/素材/背景")

BGM_DIR = ASSET_ROOT / "BGM"
KEYWORD_SFX_DIR = _asset_dir_matching(
    lambda path: path.name.lower() not in {"bgm", "template_assets"} and bool(_direct_files(path, _AUDIO_EXTS)),
    "keyword_sfx",
)
REMOTION_EFFECTS_DIR = ASSET_ROOT / "remotion_effects"
REMOTION_PUBLIC_DIR = REMOTION_EFFECTS_DIR / "public"
CHROME_EXECUTABLE = _chrome_executable()
PIP_MATERIAL_DIR = _asset_dir_matching(
    lambda path: any(file.name.upper().startswith("DJI_") for file in _direct_files(path, _VIDEO_EXTS)),
    "pip_materials",
)
ISLET_MATERIAL_DIR = _asset_dir_matching(
    lambda path: any(not file.name.upper().startswith("DJI_") for file in _direct_files(path, _VIDEO_EXTS)),
    "islet",
)
BACKGROUND_MATERIAL_DIR = _asset_dir_matching(
    lambda path: path.name not in {"remotion_effects", "template_assets"} and bool(_direct_files(path, _IMAGE_EXTS)),
    "background",
)
NODE_EXECUTABLE = _node_executable()

GENERATED_DIR = ROOT / "work" / "generated"
DEFAULT_BATCH_NAME = "batch_20260601"
OUTPUT_DIR = ROOT / "outputs" / DEFAULT_BATCH_NAME
STATE_PATH = ROOT / "work" / f"{DEFAULT_BATCH_NAME}_state.json"

CHANJING_MODEL = 0
CHANJING_RESOLUTION_RATE = 0
DISCLAIMER = "所有内容来自官方信息公示\\N仅做咨询分享无不良引导\\N如有不适请及时就医"
DISPLAY_REPLACEMENTS = str.maketrans({"医": "醫", "药": "藥", "病": "疒", "血": "皿"})
DISCLAIMER_POS_Y = 1810
SAFE_TEXT_WIDTH = 980
CAPTION_FONT_SIZE = 96
TITLE_MIN_FONT_SIZE = 72
TITLE_TOP_Y = 1060
TITLE_CORE_Y = 1225
TITLE_BOTTOM_Y = 1390
TITLE_CORE_BG_MARGIN_X = 34
TITLE_CORE_BG_PAD_X = 0
TITLE_CORE_BG_MIN_WIDTH = 0
TITLE_CORE_BG_MAX_WIDTH_RATIO = 0.86
TITLE_CORE_BG_HEIGHT_RATIO = 0.86
TITLE_CORE_BG_VISUAL_WIDTH_RATIOS = (
    (5, 0.72),
    (7, 0.78),
    (99, 0.84),
)
KEY_EFFECT_ENABLED = True
USE_REMOTION_EFFECT_LAYER = True
KEY_EFFECT_MIN_COUNT = 3
KEY_EFFECT_MAX_COUNT = 3
KEY_EFFECT_MIN_CHARS = 6
KEY_EFFECT_GAP_UNITS = 2
KEY_EFFECT_FALLBACK_VARIANTS = (
    "reliable-orange",
    "keypoint-yellow",
)
KEY_EFFECT_CAUSE_TERMS = ("病因", "疒因", "原因", "不是", "不代表", "不一定", "根源", "问题", "关键")
KEY_EFFECT_RESULT_TERMS = ("结果", "只是结果", "只会", "只是在", "血糖高", "还是高", "怎么还", "怎么又", "真的", "竟然", "就往上冲", "压不住", "难看")
ISLET_PIP_TERMS = ("胰岛功能", "自身胰岛功能", "胰岛素抵抗", "胰岛素", "胰岛")
ISLET_PIP_LEAD_SECONDS = 2.5
ISLET_FUNCTION_TERMS = ("胰岛功能", "自身胰岛功能")
ISLET_DAMAGE_TERMS = ("受损", "损伤", "损害", "坏了")
MAX_PIP_EVENTS_PER_VIDEO = 1
PIP_WIDTH = 660
PIP_HEIGHT = 372
PIP_X = 210
PIP_Y = 980
PIP_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
PIP_VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}
PIP_AUDIO_MUTED = True
BACKING_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
BACKING_EVENT_TERMS = {
    "xinhuo": (
        "薪火传承3+3工程",
        "薪火传承3加3工程",
        "薪火传承三加三工程",
        "薪火传承3+3",
        "薪火传承3加3",
        "薪火传承三加三",
        "3+3工程",
        "3加3工程",
        "三加三工程",
        "薪火3+3",
        "薪火3加3",
        "薪火三加三",
        "薪火传承",
        "薪火",
        "传承人",
        "传承",
    ),
    "patent": ("发明专利", "拥有专利", "专利证书", "专利"),
}
BACKING_EVENT_HOLD_SECONDS = {
    "xinhuo": 2.0,
    "patent": 2.0,
}
BACKING_EVENT_LEAD_SECONDS = {
    "patent": 0.5,
}
BACKING_EVENT_CLAMP_TO_SENTENCE = {
    "xinhuo": True,
    "patent": True,
}
BACKING_ASSET_TERMS = {
    "xinhuo": ("薪火",),
    "patent": ("专利",),
}
BACKING_EVENT_LAYOUT = {
    "x": 210,
    "y": 980,
    "width": 660,
    "height": 372,
}
BACKING_EVENT_KIND_LAYOUT = {
    "patent": {
        "x": 330,
        "y": 785,
        "width": 420,
        "height": 600,
    },
    "xinhuo": {
        "x": 240,
        "y": 925,
        "width": 600,
        "height": 404,
    },
}
VISUAL_EVENT_PRIORITY = {
    "patent": 100,
    "xinhuo": 95,
    "islet_function": 90,
    "self_intro": 80,
}
PIP_SELF_INTRO_TERMS = (
    "大家好",
    "我是",
    "胡天宝",
    "北京",
    "中医",
    "醫",
    "名老",
    "特聘",
    "进京",
    "来到北京",
    "管理局",
    "医生",
    "醫生",
    "专攻",
    "领域",
    "一线",
    "多年",
    "糖尿病",
)
CTA_SENTENCE_TERMS = (
    "评论",
    "私信",
    "留言",
    "回复",
    "留下需要",
    "留下支持",
    "留下评论",
    "后台来找我",
    "后台找我",
    "点击卡片",
    "点卡片",
    "点击头像",
    "点头像",
    "点击右侧头像",
    "点右侧头像",
    "右侧头像",
    "点击右边头像",
    "点右边头像",
    "右边头像",
    "和我聊聊",
    "跟我聊聊",
    "找我聊聊",
    "和我打招呼",
    "跟我打招呼",
    "打个招呼",
    "来打个招呼",
    "主页来找我",
    "主页找我",
    "到主页",
    "关注",
)
DISPLAY_PUNCT_RE = re.compile(r"[，,。！？!?；;：:“”\"'、（）()《》〈〉【】\[\]{}…—\-·\\s]+")
CLAUSE_RE = re.compile(r"[^，,。！？!?；;：:“”\"'、]+[，,。！？!?；;：:“”\"'、]?")
KEY_EFFECT_SCORE_TERMS = {
    "别": 7,
    "不要": 8,
    "不能": 8,
    "不是": 7,
    "不代表": 8,
    "病因": 9,
    "疒因": 9,
    "原因": 7,
    "结果": 8,
    "问题": 6,
    "关键": 8,
    "就得": 7,
    "回头看": 8,
    "血糖": 5,
    "胰岛": 6,
    "胰岛素": 6,
    "抵抗": 6,
    "功能": 6,
    "受损": 6,
    "自己": 5,
    "乱": 5,
    "高": 4,
    "稳": 4,
}

PROTECTED_PHRASES = sorted({
    "北京中医管理局",
    "被北京中医管理局",
    "北京名老中医",
    "糖尿病中医医生胡天宝",
    "糖尿病中医医生",
    "中医医生胡天宝",
    "中医医生",
    "中醫醫生",
    "中医药",
    "中醫藥",
    "专攻糖尿病这个领域",
    "专攻糖尿病",
    "专攻",
    "3+3工程",
    "3加3工程",
    "三加三工程",
    "胡天宝",
    "特聘来到北京",
    "特聘进京的",
    "特聘进京",
    "胰岛素抵抗",
    "胰岛功能",
    "受损的胰岛功能",
    "受损胰岛功能",
    "受损胰岛和胰岛素抵抗",
    "受损胰岛",
    "自身胰岛功能",
    "胰岛还有没有功能",
    "胰岛有没有功能",
    "还有没有功能",
    "还能不能重新干活",
    "会不会自己干活",
    "还会不会自己干活",
    "自己干活",
    "是不是一直没接上",
    "一直没接上",
    "如果一直没恢复",
    "胰岛有没有劲",
    "看胰岛有没有劲",
    "有没有劲接住",
    "还有没有恢复机会",
    "没有恢复机会",
    "有没有功能",
    "看看胰岛还有没有功能",
    "看胰岛还有没有功能",
    "看看胰岛有没有功能",
    "看胰岛有没有功能",
    "胰岛还有没有劲",
    "自己的胰岛",
    "看看胰岛还有没有劲",
    "还有没有劲",
    "还能不能接上",
    "餐后一小时",
    "两小时血糖",
    "餐后血糖",
    "一吃饭",
    "一吃饭就往上冲",
    "饭后高背后的",
    "胰岛修复问题",
    "背后",
    "背后的",
    "血糖怎么波动",
    "一线三十多年",
    "基层老中医传承工作室",
    "基层老中醫传承工作室",
    "老中医传承工作室",
    "老中醫传承工作室",
    "相关方向获批专利",
    "方向获批专利",
    "获批专利",
    "二二年我们科研出的",
    "我们科研出的",
    "科研出的",
    "这样的糖友",
    "不少这样的糖友",
    "见过不少",
    "见过",
    "身体自己调糖的劲",
    "身体自己调糖",
    "调糖的劲",
    "前几年",
    "只盯糖化",
    "不是一天两天",
    "一天两天",
    "自己一看",
    "最怕自己一看",
    "糖化好一点",
    "该出劲",
    "该出劲的时候",
    "出劲的时候",
    "时候",
    "跟不上",
    "重新干活",
    "主食",
}, key=len, reverse=True)

ATOMIC_LINE_PHRASES = {
    "不管",
    "不是",
    "不要",
    "不能",
    "不会",
    "不敢",
    "不够",
    "不稳",
    "不高",
    "不忌口",
    "如果",
    "没管",
    "没有",
    "没底",
    "没劲",
    "别只",
    "先别",
    "也别",
    "千万别",
    "自己",
    "乱改",
    "乱减",
    "乱加",
    "乱停",
    "停药",
    "加药",
    "减药",
    "换药",
    "吃药",
    "药方",
    "打针",
    "减针",
    "多打",
    "少打",
    "三加三",
    "3加3",
    "3+3",
    "血糖",
    "糖化",
    "胰岛",
    "空腹",
    "饭前",
    "饭后",
    "糖友",
    "二糖",
    "二型",
    "老糖友",
    "刚发现",
    "前几年",
    "一天两天",
    "自己一看",
    "一看",
    "时候",
    "先看看",
    "你要先看看",
    "看看",
    "看看胰岛",
    "先看看胰岛",
    "很多人",
    "很多糖友",
    "有些糖友",
    "这样的糖友",
    "越来越",
    "一直",
    "更明显",
    "真该",
    "该出劲",
    "听一下",
    "名老中医",
    "名老中醫",
    "特聘名中医",
    "特聘名中醫",
}

LINE_PROTECTED_SKIP = {
    "薪火传承3+3工程",
    "薪火传承3加3工程",
    "薪火传承三加三工程",
    "薪火传承3+3",
    "薪火传承3加3",
    "薪火传承三加三",
    "薪火3+3",
    "薪火3加3",
    "薪火三加三",
}

for _term in (
    *ISLET_PIP_TERMS,
    *ISLET_FUNCTION_TERMS,
    *BACKING_EVENT_TERMS.get("xinhuo", ()),
    *BACKING_EVENT_TERMS.get("patent", ()),
):
    if _term in LINE_PROTECTED_SKIP:
        continue
    if len(_term) >= 3 and _term not in PROTECTED_PHRASES:
        PROTECTED_PHRASES.append(_term)

for _term in ATOMIC_LINE_PHRASES:
    if _term not in PROTECTED_PHRASES:
        PROTECTED_PHRASES.append(_term)

for _term in KEY_EFFECT_SCORE_TERMS:
    if len(_term) >= 3 and _term not in PROTECTED_PHRASES:
        PROTECTED_PHRASES.append(_term)

PROTECTED_PHRASES = sorted(set(PROTECTED_PHRASES), key=len, reverse=True)

BAD_LINE_ENDINGS = (
    "不",
    "没",
    "别",
    "先",
    "也",
    "还",
    "都",
    "再",
    "又",
    "越",
    "被",
    "让",
    "把",
    "只",
    "有没有",
    "还有没有",
    "能不能",
    "是不是",
    "不代表",
    "不一定",
    "看看",
    "发明",
    "专",
    "如",
    "前",
    "一",
    "该",
    "时",
)
BAD_LINE_STARTS = (
    "管",
    "功能",
    "抵抗",
    "医生",
    "醫生",
    "劲",
    "接上",
    "干活",
    "结果",
    "原因",
    "问题",
    "专利",
    "传承",
    "攻",
    "工程",
    "建设",
    "果",
    "几年",
    "天两天",
    "看糖化",
    "的时候",
    "时候",
    "候",
    "该",
)

ALIGN_EQUIV_GROUPS = [
    "医醫",
    "药藥耀",
    "胰移遗已",
    "岛導导倒到道",
    "素速书苏输",
    "糖堂",
    "友有",
    "型行",
    "针真",
    "饭犯",
    "测侧",
    "减检",
    "劲境",
    "接街介",
    "控空",
    "复腹",
    "聘晋",
    "进晋",
    "抵低",
    "抗扣扛",
    "重中",
    "后後",
    "里裏历",
    "老劳",
    "困睏",
]

ALIGN_CHAR_MAP = {
    "0": "零",
    "1": "一",
    "2": "二",
    "3": "三",
    "4": "四",
    "5": "五",
    "6": "六",
    "7": "七",
    "8": "八",
    "9": "九",
}
for group in ALIGN_EQUIV_GROUPS:
    canonical = group[0]
    for char in group:
        ALIGN_CHAR_MAP[char] = canonical

NOISE = "-35dB"
MIN_SILENCE = "0.18"
MIDDLE_KEEP = 0.08
EDGE_KEEP = 0.04
MAIN_AUDIO_VOLUME = 1.20
BGM_VOLUME = 0.22
BGM_FADE_IN = 0.80
BGM_FADE_OUT = 1.20
KEYWORD_SFX_VOLUME = 0.85
KEYWORD_SFX_MAX_SECONDS = 1.40
KEYWORD_SFX_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}

COPIES = [
    {
        "slug": "fasting_morning_high",
        "text": "早上空腹又糖化八九点？睡前明明还行，醒来又变高？二型糖友，先别自己加药！大家好，我是胡天宝，北京名老中医，专攻糖尿病这个领域一线三十多年。不管你是刚查出来，还是吃药很多年，空腹老反复，别上来就问药是不是不够。夜里到清晨这一段，胰岛该接的时候没接上，早上糖化就容易难看。有些糖友夜里口渴，一夜起来好几次，白天还犯困，心里也没底。我这些年科研看的，就是受损胰岛还能不能重新干活，不是让你自己乱加药。这个顺序别弄反，也别拿别人药方套自己。留下“需要”，把睡前糖化、早上空腹糖化、现在吃什么药说清楚，后台来找我。",
    },
    {
        "slug": "postmeal_ten_plus",
        "text": "饭后一测糖化十几？少吃也高，走路也高？糖友们，别光怪这一顿饭！大家好，我是胡天宝，北京中医管理局特聘进京的糖尿病中医医生。不管你二糖三五年，还是拖了十多年，饭前还可以，饭后就往上冲，很多人心里都慌。有些糖友越吃越少，人也没劲，晚上也睡不好，糖化还是压不住。饭后这一段，胰岛该出劲的时候跟不上，再加上胰岛素抵抗重，就容易反复。我这些年科研看的，就是受损胰岛还能不能重新干活，不是让你自己乱减药。别硬扛，也别照着别人那一套来。愿意听我继续讲的糖友，留下“支持”两个字，点击头像来找我。",
    },
    {
        "slug": "medicine_boxes_more",
        "text": "药盒子越来越多了？一种变两种，两种变三种？老糖友，这条真该听一下！大家好，我是胡天宝，北京特聘名中医。不管你吃药五年，还是十几年，糖化一会儿高，一会儿低，心里越来越没底。还有人今天换一种，明天加一点，越折腾越慌，家里人也跟着着急。很多糖友不是没管，也不是不忌口，是胰岛这股劲一直没接上，身体自己调糖越来越吃力。二二年我们科研出的相关方向获批专利，看的就是受损胰岛和胰岛素抵抗。药别自己停，针也别乱改，先把情况说清楚。有问题的糖友，评论“问题”两个字，点击头像来找我，我看到后回答你。",
    },
    {
        "slug": "insulin_still_unstable",
        "text": "胰岛素都打上了，糖化还是乱？饭前打了，饭后还高？二型糖友，别自己改针！大家好，我是胡天宝，二零年被北京中医管理局特聘来到北京。不管你打针几个月，还是已经好几年，都别自己多打一针，少打一针。有些人今天怕高多打，明天怕低又不敢打，这样更乱，心里更没底。外面补进去的胰岛素，只是帮你顶一段，不代表自己的胰岛就有劲了。很多糖友越打越没底，就是没回头看，受损胰岛还能不能接上。针量不是自己试出来的，顺序别弄反，更别自己停针乱来。把每天打几次、一次多少、糖化怎么波动说清楚，留下“需要”，后台来找我。",
    },
    {
        "slug": "feet_numb_cold",
        "text": "脚底发麻发凉？晚上睡觉更明显？糖尿病朋友，别一直拖着！大家好，我是胡天宝，北京中医药薪火传承“三加三”工程建设单位的名老中医。不管你的二糖是刚发现，还是已经很多年，手脚麻这件事，别只看脚。你还得往前看，糖化反复多久了，胰岛这股劲是不是一直没接上。有些人麻了还忍着，等晚上疼醒才害怕，白天走路也不踏实。受损胰岛如果一直没恢复，人就容易越来越不踏实，药吃着，针打着，心里也怕。千万别自己停药，也别乱试偏方，先把情况说清楚，别硬扛。留下“支持”两个字，点击头像来找我，感谢各位糖友支持。",
    },
    {
        "slug": "night_thirst_urination",
        "text": "晚上总口渴？一夜起来好几次？二型糖友，别只怪水喝多了！大家好，我是胡天宝，专攻糖尿病这个领域一线三十多年。不管你是新糖友，还是老糖友，晚上这一段最容易被忽略。白天看着还行，一到夜里口干、起夜，早上一测糖化又高，这时候就要看胰岛有没有劲接住。我在科研门诊里见过不少这样的糖友，药没少吃，饭也控了，可夜里到清晨还是乱，第二天人也没精神。中医调理也讲顺序，不是让你自己乱停药，也别乱加药，先别一直拖着，别硬扛了。把睡前糖化、夜里起几次、早上空腹糖化说清楚，留下“需要”，我看到后回复你。",
    },
    {
        "slug": "new_diagnosis_panic",
        "text": "刚查出糖尿病就慌了？网上一搜更害怕？家里有二型糖友的，先别乱来！大家好，我是胡天宝，北京名老中医，同时设立胡天宝基层老中医传承工作室。刚发现的时候，很多人只问吃什么降得快，我告诉你，别只盯这个数。你要先看看胰岛还会不会自己干活，饭后能不能跟上，夜里能不能稳住。有些糖友刚开始不重视，等药越吃越多，糖化越来越乱，才后悔。先把胰岛这件事弄明白，心里才不慌，也别照着别人药方乱吃。别自己停药，也别乱试偏方，先别慌，别乱来。留下“需要”，把糖化空腹、糖化餐后、查出来多久说清楚，后台来找我。",
    },
    {
        "slug": "blurry_vision",
        "text": "看东西开始模糊？眼前雾蒙蒙的？糖尿病朋友，别只问眼睛！大家好，我是胡天宝，北京特聘名中医。不管你二糖几年，只要眼睛开始不舒服，就别一直拖。很多糖友前几年只盯糖化，高了压一压，低了松一松，时间久了，身体自己调糖的劲越来越弱。你要回头看，胰岛是不是一直没接上，受损胰岛还有没有恢复机会。眼睛问题背后，常常不是一天两天形成的，早上高，饭后高，时间久了都要重视。药别自己停，针也别乱减，别等问题多了才害怕，先别硬扛，也别乱来。愿意听我继续讲的糖友，留下“支持”两个字，有问题点击头像来找我。",
    },
    {
        "slug": "belly_postmeal_high",
        "text": "肚子大，饭后还高？明明吃得不多，数还是不好看？二型糖友，要小心胰岛太累了！大家好，我是胡天宝，北京中医管理局特聘进京的糖尿病中医医生。不管你现在是一种药，还是几种药一起吃，肚子大、饭后高，这类糖友要看胰岛素抵抗。身体对胰岛素不灵，胰岛就得拼命干活，时间久了它也扛不住。有些糖友腰围越来越大，饭后糖化越来越难压，还以为只是胖，其实胰岛已经很累了。我的专利方向，就是看胰岛还有没有劲，也看抵抗能不能往下走。别只想着少吃一顿，也别自己乱换药。把体重、腰围、糖化空腹、糖化餐后发来，评论“需要”，后台来找我。",
    },
    {
        "slug": "reduce_meds_injections",
        "text": "想少吃点药，少打点针？先别自己动！二型糖友，先看看胰岛还有没有劲！大家好，我是胡天宝，北京中医药薪火传承“三加三”名老中医。不管你吃药多久，打针多久，最怕自己一看糖化好一点，就偷偷减药减针。胰岛接不上，光想着少吃药，顺序就反了。有些糖友今天减一点，明天停一下，最后糖化更乱，自己也害怕。团队多年研究下来，很多糖友不是没管，是胰岛没接上。先把胰岛这股劲看明白，再说后面怎么调，别自己硬试，也别自己停针，先把情况说清楚。有问题的糖友，可以评论“支持”两个字，点击头像来找我，我忙完后回答问题。",
    },
]


def run(cmd, **kwargs):
    kwargs.setdefault("text", True)
    kwargs.setdefault("encoding", "utf-8")
    kwargs.setdefault("errors", "replace")
    kwargs.setdefault("capture_output", True)
    return subprocess.run(cmd, check=True, **kwargs)


def load_env():
    if not ENV_PATH.exists():
        raise SystemExit(f"missing env: {ENV_PATH}")
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def api_request(method, path, token=None, body=None, query=None):
    url = BASE_URL + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["access_token"] = token
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=90) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def get_token():
    app_id = os.environ.get("CHANJING_APP_ID")
    secret_key = os.environ.get("CHANJING_SECRET_KEY")
    if not app_id or not secret_key:
        raise SystemExit("Missing CHANJING_APP_ID or CHANJING_SECRET_KEY")
    res = api_request("POST", "/open/v1/access_token", body={
        "app_id": app_id,
        "secret_key": secret_key,
    })
    if res.get("code") != 0:
        raise SystemExit(json.dumps(res, ensure_ascii=False, indent=2))
    return res["data"]["access_token"]


def create_video(token, asset, text):
    payload = {
        "person": {
            "id": asset["person_id"],
            "x": 0,
            "y": 0,
            "width": 1080,
            "height": 1920,
            "figure_type": "whole_body",
        },
        "audio": {
            "type": "tts",
            "volume": 100,
            "language": "cn",
            "tts": {
                "text": [text],
                "speed": 1,
                "audio_man": asset["audio_man_id"],
            },
        },
        "bg_color": "#EDEDED",
        "screen_width": 1080,
        "screen_height": 1920,
        "model": CHANJING_MODEL,
        "resolution_rate": CHANJING_RESOLUTION_RATE,
    }
    res = api_request("POST", "/open/v1/create_video", token, body=payload)
    if res.get("code") != 0:
        raise SystemExit(json.dumps(res, ensure_ascii=False, indent=2))
    data = res.get("data")
    if isinstance(data, dict):
        return str(data.get("id") or data.get("task_id") or data.get("video_id"))
    return str(data)


def video_status(token, task_id):
    res = api_request("GET", "/open/v1/video", token, query={"id": task_id})
    if res.get("code") != 0:
        raise RuntimeError(json.dumps(res, ensure_ascii=False, indent=2))
    return res["data"]


def is_token_expired_error(error):
    try:
        payload = json.loads(str(error))
    except Exception:
        return "AccessToken" in str(error) and "失效" in str(error)
    return payload.get("code") == 10400 or payload.get("msg") == "AccessToken已失效"


def download(url, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".download")
    last_error = None
    for attempt in range(1, 6):
        try:
            if tmp.exists():
                tmp.unlink()
            with urllib.request.urlopen(url, timeout=180) as resp, tmp.open("wb") as f:
                shutil.copyfileobj(resp, f)
            tmp.replace(path)
            return
        except Exception as exc:
            last_error = exc
            if tmp.exists():
                tmp.unlink()
            time.sleep(min(20, attempt * 3))
    raise last_error


def create_logo_asset():
    LOGO_PATH.parent.mkdir(parents=True, exist_ok=True)
    if LOGO_PATH.exists():
        return
    source = Image.open(LOGO_SOURCE).convert("RGBA")
    logo = source.crop((68, 51, 156, 139)).resize((132, 132), Image.Resampling.LANCZOS)
    mask = Image.new("L", logo.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, 131, 131), radius=15, fill=255)
    logo.putalpha(mask)
    logo.save(LOGO_PATH)


def required_font_paths(required_roles=("caption", "title")):
    role_map = {
        "caption": (CAPTION_FONT_FAMILY, CAPTION_FONT_PATH),
        "title": (TITLE_FONT_FAMILY, TITLE_FONT_PATH),
    }
    return [role_map[role] for role in required_roles if role in role_map]


def font_path_for_role(role="caption"):
    if role == "title":
        return TITLE_FONT_PATH or SOURCE_HAN_FONT_PATH
    return CAPTION_FONT_PATH or SOURCE_HAN_FONT_PATH


def create_font_asset(required_roles=("caption", "title")):
    missing = [family for family, path in required_font_paths(required_roles) if not path]
    if missing:
        names = "、".join(missing)
        raise SystemExit(
            f"font missing: {names}. Put the font files in {FONT_DIR} "
            f"or {LOCAL_FONT_DIR} / {LOCAL_FONT_DIR_2} before rendering."
        )
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    font_paths = {
        path
        for path in (SOURCE_HAN_FONT_PATH, CAPTION_FONT_PATH, TITLE_FONT_PATH)
        if path and path.exists()
    }
    for font_path in font_paths:
        asset_path = FONT_DIR / font_path.name
        if asset_path.resolve() == font_path.resolve():
            continue
        needs_copy = True
        if asset_path.exists() and not asset_path.is_symlink():
            src_stat = font_path.stat()
            dst_stat = asset_path.stat()
            needs_copy = src_stat.st_size != dst_stat.st_size or src_stat.st_mtime > dst_stat.st_mtime
        if asset_path.is_symlink() or needs_copy:
            if asset_path.exists() or asset_path.is_symlink():
                asset_path.unlink()
            shutil.copy2(font_path, asset_path)
    REMOTION_PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for font_path in font_paths:
        public_path = REMOTION_PUBLIC_DIR / font_path.name
        needs_copy = True
        if public_path.exists() and not public_path.is_symlink():
            src_stat = font_path.stat()
            dst_stat = public_path.stat()
            needs_copy = src_stat.st_size != dst_stat.st_size or src_stat.st_mtime > dst_stat.st_mtime
        if public_path.is_symlink() or needs_copy:
            if public_path.exists() or public_path.is_symlink():
                public_path.unlink()
            shutil.copy2(font_path, public_path)


def display_text(text):
    return text.translate(DISPLAY_REPLACEMENTS)


def display_line(text):
    return display_text(DISPLAY_PUNCT_RE.sub("", text)).strip()


FONT_CACHE = {}


def font_for_size(size, role="caption"):
    key = (role, size)
    if key not in FONT_CACHE:
        FONT_CACHE[key] = ImageFont.truetype(str(font_path_for_role(role)), size)
    return FONT_CACHE[key]


def text_width(text, size, role="caption"):
    line = display_line(text)
    if not line:
        return 0
    bbox = font_for_size(size, role).getbbox(line)
    return bbox[2] - bbox[0]


def caption_fits(text):
    return text_width(text, CAPTION_FONT_SIZE) <= SAFE_TEXT_WIDTH


def fit_font_size(lines, max_size, min_size, max_width=SAFE_TEXT_WIDTH, role="caption"):
    visible = [line for line in lines if line]
    if not visible:
        return max_size
    for size in range(max_size, min_size - 1, -2):
        font = font_for_size(size, role)
        if all(font.getbbox(line)[2] - font.getbbox(line)[0] <= max_width for line in visible):
            return size
    for size in range(min_size - 2, 23, -2):
        font = font_for_size(size, role)
        if all(font.getbbox(line)[2] - font.getbbox(line)[0] <= max_width for line in visible):
            return size
    return 24


def ass_escape(text):
    return text.replace("{", "\\{").replace("}", "\\}")


def ass_time(seconds):
    seconds = max(0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs == 100:
        s += 1
        cs = 0
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def srt_time(seconds):
    seconds = max(0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    if ms == 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def clean_for_len(text):
    return DISPLAY_PUNCT_RE.sub("", text)


def token_len(text):
    return len(clean_for_len(text))


def strip_end_punct(text):
    return re.sub(r"[，,。！？!?；;：:“”\"'、]+$", "", text.strip())


def split_sentences(text):
    text = re.sub(r"\s+", "", text.strip())
    return re.findall(r"[^。！？!?]+[。！？!?]?", text)


def split_caption_clauses(text):
    text = re.sub(r"\s+", "", text.strip())
    text = text.translate(str.maketrans({"“": "", "”": "", '"': "", "'": ""}))
    clauses = [strip_end_punct(part) for part in CLAUSE_RE.findall(text)]
    units = []
    for clause in clauses:
        if clean_for_len(clause):
            units.extend(split_long_unit(clause))
    return units


def protected_tokens(text):
    tokens = []
    i = 0
    while i < len(text):
        match = None
        for phrase in PROTECTED_PHRASES:
            if text.startswith(phrase, i):
                match = phrase
                break
        if match:
            tokens.append(match)
            i += len(match)
        else:
            tokens.append(text[i])
            i += 1
    return tokens


def chunk_by_tokens(text, max_chars):
    chunks = []
    current = []
    current_len = 0
    for token in protected_tokens(text.strip()):
        length = token_len(token)
        if length == 0:
            if current:
                current.append(token)
            continue
        if current and current_len + length > max_chars:
            chunks.append("".join(current).strip("，,；;：: "))
            current = [token]
            current_len = length
        else:
            current.append(token)
            current_len += length
    if current:
        chunks.append("".join(current).strip("，,；;：: "))
    chunks = [chunk for chunk in chunks if chunk]
    if len(chunks) >= 2 and token_len(chunks[-1]) <= 2:
        prev_tokens = protected_tokens(chunks[-2])
        last_tokens = protected_tokens(chunks[-1])
        while token_len("".join(last_tokens)) < 4 and len(prev_tokens) > 1:
            token = prev_tokens.pop()
            candidate = "".join([token] + last_tokens)
            if token_len(candidate) > max_chars:
                prev_tokens.append(token)
                break
            last_tokens.insert(0, token)
        chunks[-2] = "".join(prev_tokens).strip("，,；;：: ")
        chunks[-1] = "".join(last_tokens).strip("，,；;：: ")
        chunks = [chunk for chunk in chunks if chunk]
    return chunks


def split_oversize_token(token):
    if caption_fits(token):
        return [token]
    chunks = []
    current = ""
    for char in token:
        candidate = current + char
        if current and not caption_fits(candidate):
            chunks.append(current)
            current = char
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def chunk_by_caption_width(text):
    chunks = []
    current = ""
    for token in protected_tokens(text.strip()):
        if token_len(token) == 0:
            continue
        for part in split_oversize_token(token):
            candidate = current + part
            if current and not caption_fits(candidate):
                chunks.append(current.strip("，,；;：: "))
                current = part
            else:
                current = candidate
    if current:
        chunks.append(current.strip("，,；;：: "))
    chunks = [chunk for chunk in chunks if chunk]
    if len(chunks) >= 2 and token_len(chunks[-1]) <= 2:
        prev_tokens = protected_tokens(chunks[-2])
        last_tokens = protected_tokens(chunks[-1])
        while token_len("".join(last_tokens)) < 4 and len(prev_tokens) > 1:
            token = prev_tokens.pop()
            candidate_prev = "".join(prev_tokens).strip("，,；;：: ")
            candidate_last = "".join([token] + last_tokens).strip("，,；;：: ")
            if not candidate_prev or not caption_fits(candidate_prev) or not caption_fits(candidate_last):
                prev_tokens.append(token)
                break
            last_tokens.insert(0, token)
        chunks[-2] = "".join(prev_tokens).strip("，,；;：: ")
        chunks[-1] = "".join(last_tokens).strip("，,；;：: ")
        chunks = [chunk for chunk in chunks if chunk]
    return chunks


def split_breaks_protected_phrase(left, right):
    left_clean = clean_for_len(left)
    joined = left_clean + clean_for_len(right)
    boundary = len(left_clean)
    if boundary <= 0:
        return False
    for phrase in PROTECTED_PHRASES:
        phrase_clean = clean_for_len(phrase)
        if len(phrase_clean) < 2:
            continue
        start = joined.find(phrase_clean)
        while start >= 0:
            end = start + len(phrase_clean)
            if start < boundary < end:
                return True
            start = joined.find(phrase_clean, start + 1)
    return False


def caption_break_penalty(left, right):
    left_clean = clean_for_len(left)
    right_clean = clean_for_len(right)
    if not left_clean or not right_clean:
        return 100000
    penalty = abs(len(left_clean) - len(right_clean)) * 2
    if not caption_fits(left) or not caption_fits(right):
        penalty += 100000
    if split_breaks_protected_phrase(left, right):
        penalty += 50000
    if any(left_clean.endswith(term) for term in BAD_LINE_ENDINGS):
        penalty += 2500
    if any(right_clean.startswith(term) for term in BAD_LINE_STARTS):
        penalty += 1800
    if len(left_clean) <= 3 or len(right_clean) <= 3:
        penalty += 120
    if re.search(r"[，,；;：:]$", left.strip()):
        penalty -= 40
    return penalty


def split_by_readability(text):
    tokens = protected_tokens(text.strip())
    candidates = []
    for index in range(1, len(tokens)):
        left = "".join(tokens[:index]).strip("，,；;：: ")
        right = "".join(tokens[index:]).strip("，,；;：: ")
        if not left or not right:
            continue
        penalty = caption_break_penalty(left, right)
        if penalty >= 100000:
            continue
        candidates.append((penalty, left, right))
    if not candidates:
        return None
    _, left, right = min(candidates, key=lambda item: item[0])
    return [left, right]


def smooth_caption_lines(raw_lines):
    lines = [line for line in raw_lines if clean_for_len(line)]
    if len(lines) != 2:
        return lines
    if caption_break_penalty(lines[0], lines[1]) < 600:
        return lines
    improved = split_by_readability("".join(lines))
    return improved or lines


def caption_group_lines(group):
    texts = [unit["text"] for unit in group if clean_for_len(unit["text"])]
    if len(texts) <= 2:
        if all(caption_fits(text) for text in texts):
            return texts
        return smooth_caption_lines(texts)

    candidates = []
    for split in range(1, len(texts)):
        left = "".join(texts[:split]).strip("，,；;：: ")
        right = "".join(texts[split:]).strip("，,；;：: ")
        penalty = caption_break_penalty(left, right)
        if penalty < 100000:
            candidates.append((penalty, left, right))
    if not candidates:
        return []
    _, left, right = min(candidates, key=lambda item: item[0])
    return [left, right]


def should_absorb_next_caption_unit(group, next_unit):
    if len(group) != 2:
        return False
    sentence_indexes = {unit.get("sentence_index") for unit in group}
    if len(sentence_indexes) != 1 or next_unit.get("sentence_index") not in sentence_indexes:
        return False
    if caption_break_penalty(group[-1]["text"], next_unit["text"]) < 600:
        return False
    return bool(caption_group_lines([*group, next_unit]))


def should_keep_caption_units_together(left_unit, right_unit):
    if left_unit.get("sentence_index") != right_unit.get("sentence_index"):
        return False
    left = left_unit["text"]
    right = right_unit["text"]
    left_clean = clean_for_len(left)
    right_clean = clean_for_len(right)
    if left_clean.endswith("胡天宝") and right_clean.startswith(("基层老中医", "基层老中醫")):
        return True
    if split_breaks_protected_phrase(left, right):
        return True
    if left_clean and any(left_clean.endswith(term) for term in BAD_LINE_ENDINGS):
        return True
    if right_clean and any(right_clean.startswith(term) for term in BAD_LINE_STARTS):
        return True
    return False


def build_caption_pages(units):
    pages = []
    index = 0
    while index < len(units):
        group = units[index:index + 2]
        index += len(group)
        if (
            len(group) == 2
            and index < len(units)
            and should_keep_caption_units_together(group[-1], units[index])
            and caption_group_lines([group[-1], units[index]])
        ):
            pages.append([group[0]])
            index -= 1
            continue
        if index < len(units) and should_absorb_next_caption_unit(group, units[index]):
            group = [*group, units[index]]
            index += 1
        pages.append(group)
    return pages


def caption_line_issues(lines):
    issues = []
    visible = [line for line in lines if clean_for_len(line)]
    if len(visible) > 2:
        issues.append("超过两行")
    for line in visible:
        if not caption_fits(line):
            issues.append(f"单行超宽: {display_line(line)}")
    for left, right in zip(visible, visible[1:]):
        left_clean = clean_for_len(left)
        right_clean = clean_for_len(right)
        if split_breaks_protected_phrase(left, right):
            issues.append(f"拆开固定词: {display_line(left)} / {display_line(right)}")
        if left_clean and any(left_clean.endswith(term) for term in BAD_LINE_ENDINGS):
            issues.append(f"左行结尾不完整: {display_line(left)} / {display_line(right)}")
        if right_clean and any(right_clean.startswith(term) for term in BAD_LINE_STARTS):
            issues.append(f"右行开头不完整: {display_line(left)} / {display_line(right)}")
    return issues


def caption_page_boundary_issues(left, right):
    issues = []
    if split_breaks_protected_phrase(left, right):
        issues.append(f"跨页拆开固定词: {display_line(left)} / {display_line(right)}")
    return issues


def audit_caption_breaks(items, only=None):
    only = set(only or [])
    failures = []
    for item in items:
        if only and item["slug"] not in only:
            continue
        hook, units = build_spoken_units(item["text"])
        _ = hook
        caption_units = [unit for unit in units if unit["source"] != "title" and unit["visible"]]
        print(f"\n## {item['slug']}")
        previous_last_line = None
        for page_index, group in enumerate(build_caption_pages(caption_units), start=1):
            lines = caption_group_lines(group)
            shown = " | ".join(display_line(line) for line in lines)
            issues = caption_line_issues(lines)
            visible_lines = [line for line in lines if clean_for_len(line)]
            if previous_last_line and visible_lines:
                issues.extend(caption_page_boundary_issues(previous_last_line, visible_lines[0]))
            marker = " !! " if issues else "    "
            print(f"{page_index:02d}{marker}{shown}")
            for issue in issues:
                failures.append((item["slug"], page_index, issue))
                print(f"      - {issue}")
            if visible_lines:
                previous_last_line = visible_lines[-1]
    if failures:
        print("\ncaption audit failed:")
        for slug, page_index, issue in failures:
            print(f"- {slug} page {page_index}: {issue}")
        return False
    print("\ncaption audit passed")
    return True


def incomplete_key_effect_text(text):
    clean = clean_for_len(text)
    if not clean:
        return True
    if clean.endswith(BAD_LINE_ENDINGS):
        return True
    if clean.endswith(("是", "的", "该", "不能", "不让", "不是让你自己", "受损胰岛还能不能")):
        return True
    if clean.startswith(BAD_LINE_STARTS):
        return True
    return False


def split_long_unit(text):
    if caption_fits(text):
        return [text]
    parts = re.findall(r"[^，,；;：:]+[，,；;：:]?", text)
    units = []
    cur = ""
    for part in parts:
        if not caption_fits(part):
            if cur:
                units.append(cur)
                cur = ""
            units.extend(split_by_readability(part) or chunk_by_caption_width(part))
            continue
        if cur and not caption_fits(cur + part):
            units.append(cur)
            cur = part
        else:
            cur += part
    if cur:
        units.append(cur)
    return [strip_end_punct(unit) for unit in units if strip_end_punct(unit)]


def key_effect_score(unit, index, total, allow_fallback=False):
    if unit.get("source") != "body" or not unit.get("visible"):
        return -1
    text = clean_for_len(unit["text"])
    if len(text) < KEY_EFFECT_MIN_CHARS:
        return -1
    if text.startswith(("大家好", "我是", "不管")):
        return -1
    if incomplete_key_effect_text(text):
        return -1
    if any(term in text for term in ("胡天宝", "中医医生", "北京中医管理局", "北京名老中医", "特聘")):
        return -1
    if any(marker in text for marker in ("留下", "后台来找我", "点击头像")):
        return -1

    score = 0
    matched_keyword = False
    for term, weight in KEY_EFFECT_SCORE_TERMS.items():
        if term in text:
            score += weight
            matched_keyword = True
    if not matched_keyword:
        if not allow_fallback:
            return -1
        score += 1.0
    score += min(16, len(text)) * 0.35
    if 7 <= len(text) <= 15:
        score += 4
    if index < total * 0.25:
        score += 1.5
    if index > total * 0.82:
        score -= 3
    return score


def forced_key_effect_score(unit, index, total, boost):
    score = key_effect_score(unit, index, total, allow_fallback=True)
    if score <= 0:
        text = clean_for_len(unit.get("text", ""))
        if unit.get("source") != "body" or not unit.get("visible") or not text:
            return -1
        if incomplete_key_effect_text(text):
            return -1
        if any(marker in text for marker in ("留下", "后台来找我", "点击头像")):
            return -1
        score = 1.0 + min(16, len(text)) * 0.35
    return score + boost


def choose_key_effect_indexes(
    units,
    blocked_sentence_indexes=None,
    forced_effect_unit_indexes=None,
    forced_variant_indexes=None,
):
    if not KEY_EFFECT_ENABLED:
        return set()
    blocked_sentence_indexes = set(blocked_sentence_indexes or [])
    forced_effect_unit_indexes = set(forced_effect_unit_indexes or [])
    forced_variant_indexes = set(forced_variant_indexes or [])

    def is_allowed(index):
        sentence_index = units[index].get("sentence_index")
        return sentence_index not in blocked_sentence_indexes

    candidate_scores = {}
    total = len(units)
    for index, unit in enumerate(units):
        if not is_allowed(index):
            continue
        score = key_effect_score(unit, index, total)
        if score > 0:
            candidate_scores[index] = score
        if index in forced_effect_unit_indexes:
            candidate_scores[index] = max(
                candidate_scores.get(index, -1),
                forced_key_effect_score(unit, index, total, 24),
            )
        if index in forced_variant_indexes:
            candidate_scores[index] = max(
                candidate_scores.get(index, -1),
                forced_key_effect_score(unit, index, total, 36),
            )

    candidates = [(index, score) for index, score in candidate_scores.items() if score > 0]
    candidates.sort(key=lambda item: item[1], reverse=True)

    selected = [index for index, _score in candidates[:KEY_EFFECT_MAX_COUNT]]

    if len(selected) < KEY_EFFECT_MIN_COUNT:
        for index, _score in candidates:
            if len(selected) >= min(KEY_EFFECT_MIN_COUNT, KEY_EFFECT_MAX_COUNT):
                break
            if index not in selected:
                selected.append(index)

    if len(selected) < KEY_EFFECT_MIN_COUNT:
        fallback_candidates = [
            (index, key_effect_score(unit, index, len(units), allow_fallback=True))
            for index, unit in enumerate(units)
            if is_allowed(index) and index not in selected
        ]
        fallback_candidates = [(index, score) for index, score in fallback_candidates if score > 0]
        fallback_candidates.sort(key=lambda item: item[1], reverse=True)
        for index, _score in fallback_candidates:
            if len(selected) >= min(KEY_EFFECT_MIN_COUNT, KEY_EFFECT_MAX_COUNT):
                break
            selected.append(index)

    return set(selected[:KEY_EFFECT_MAX_COUNT])


def key_effect_variant(text, fallback_index=0):
    if not KEY_EFFECT_FALLBACK_VARIANTS:
        return "reliable-orange"
    return random.choice(KEY_EFFECT_FALLBACK_VARIANTS)


def has_islet_function(text):
    clean = clean_for_len(text)
    return any(term in clean for term in ISLET_FUNCTION_TERMS)


def has_islet_pip_trigger(text):
    clean = clean_for_len(text)
    return any(term in clean for term in ISLET_PIP_TERMS)


def keyword_start_for_terms(group, terms):
    sorted_terms = sorted(terms, key=lambda term: len(clean_for_len(term)), reverse=True)
    for unit in group.get("visible_units", []):
        clean_text = clean_for_len(unit["text"])
        if not clean_text:
            continue
        for term in sorted_terms:
            clean_term = clean_for_len(term)
            if not clean_term:
                continue
            pos = clean_text.find(clean_term)
            if pos < 0:
                continue
            unit_start = float(unit["start"])
            unit_end = float(unit["end"])
            unit_duration = max(0.12, unit_end - unit_start)
            unit_len = max(1, len(clean_text))
            return unit_start + unit_duration * (pos / unit_len)
    return float(group["start"])


def islet_pip_window(group):
    keyword_start = keyword_start_for_terms(group, ISLET_PIP_TERMS)
    return max(0.0, keyword_start - ISLET_PIP_LEAD_SECONDS), float(group["end"])


def has_islet_damage(text):
    clean = clean_for_len(text)
    return any(term in clean for term in ISLET_DAMAGE_TERMS)


def mark_key_effect_units(units, blocked_sentence_indexes=None, forced_effect_unit_indexes=None):
    blocked_sentence_indexes = set(blocked_sentence_indexes or [])
    forced_effect_unit_indexes = set(forced_effect_unit_indexes or [])
    special_forced_indexes = set()
    islet_function_count = 0
    for index, unit in enumerate(units):
        blocked = unit.get("sentence_index") in blocked_sentence_indexes
        if has_islet_function(unit["text"]):
            islet_function_count += 1
            if not blocked and islet_function_count == 2 and has_islet_damage(unit["text"]):
                special_forced_indexes.add(index)

    selected = choose_key_effect_indexes(
        units,
        blocked_sentence_indexes,
        forced_effect_unit_indexes | special_forced_indexes,
        special_forced_indexes,
    )
    marked = []
    effect_i = 0
    for index, unit in enumerate(units):
        copy = dict(unit)
        blocked = unit.get("sentence_index") in blocked_sentence_indexes

        if not blocked and index in selected:
            copy["effect"] = True
            copy["effect_variant"] = key_effect_variant(unit["text"], effect_i)
            effect_i += 1
        else:
            copy["effect"] = False
        marked.append(copy)
    return marked


def forced_effect_indexes_for_texts(units, forced_effect_texts, blocked_sentence_indexes=None):
    forced_effect_texts = [text for text in (forced_effect_texts or []) if clean_for_len(text)]
    if not forced_effect_texts:
        return []
    blocked_sentence_indexes = set(blocked_sentence_indexes or [])
    selected = []
    for wanted in forced_effect_texts:
        wanted_clean = clean_for_len(wanted)
        wanted_display = display_line(wanted)
        for index, unit in enumerate(units):
            if index in selected:
                continue
            if unit.get("sentence_index") in blocked_sentence_indexes:
                continue
            if unit.get("source") != "body" or not unit.get("visible"):
                continue
            unit_clean = clean_for_len(unit.get("text", ""))
            unit_display = display_line(unit.get("text", ""))
            if not unit_clean:
                continue
            clean_match = wanted_clean in unit_clean or unit_clean in wanted_clean
            display_match = wanted_display in unit_display or unit_display in wanted_display
            if clean_match or display_match:
                selected.append(index)
                break
    return selected[:KEY_EFFECT_MAX_COUNT]


def apply_forced_effect_indexes(marked_units, forced_indexes):
    forced_indexes = list(forced_indexes or [])[:KEY_EFFECT_MAX_COUNT]
    if not forced_indexes:
        return marked_units
    forced_set = set(forced_indexes)
    result = []
    effect_i = 0
    for index, unit in enumerate(marked_units):
        copy = dict(unit)
        if index in forced_set:
            copy["effect"] = True
            copy["effect_variant"] = key_effect_variant(unit["text"], effect_i)
            effect_i += 1
        else:
            copy["effect"] = False
        result.append(copy)
    return result


def is_self_intro_text(text):
    text = clean_for_len(text)
    if not text:
        return False
    if text.startswith(("不管", "还是", "有些", "很多", "你", "别", "不要", "把")):
        return False
    return any(term in text for term in PIP_SELF_INTRO_TERMS)


def is_self_intro_unit(unit):
    if unit.get("source") != "body" or not unit.get("visible"):
        return False
    return is_self_intro_text(unit["text"])


def pip_sources(material_dir=PIP_MATERIAL_DIR):
    if not material_dir.exists():
        return []
    suffixes = PIP_IMAGE_EXTS | PIP_VIDEO_EXTS
    return sorted(path for path in material_dir.rglob("*") if path.is_file() and path.suffix.lower() in suffixes)


def source_play_end(source, start, end):
    if source.suffix.lower() not in PIP_VIDEO_EXTS:
        return end
    try:
        res = run([
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(source),
        ])
        source_duration = float(res.stdout.strip())
    except Exception:
        return end
    return min(end, start + source_duration)


def make_pip_event(source, start, end, video_duration, kind, sentence_index=None, min_start=0.0):
    start = max(0.0, min_start, start)
    end = source_play_end(source, start, min(video_duration, end))
    if end <= start:
        return None
    event = {
        "source": str(source),
        "start": round(start, 3),
        "end": round(end, 3),
        "x": PIP_X,
        "y": PIP_Y,
        "width": PIP_WIDTH,
        "height": PIP_HEIGHT,
        "muted": PIP_AUDIO_MUTED,
        "avoid": "face_neck",
        "kind": kind,
    }
    if sentence_index is not None:
        event["sentenceIndex"] = sentence_index
    return event


def build_self_intro_pip_event(timed_units, duration):
    intro_units = []
    started = False
    for unit in timed_units:
        if unit.get("source") == "title":
            continue
        if not started:
            if is_self_intro_unit(unit) and "大家好" in clean_for_len(unit["text"]):
                intro_units.append(unit)
                started = True
            continue
        if is_self_intro_unit(unit):
            intro_units.append(unit)
            continue
        break

    if not intro_units:
        return None

    sources = pip_sources(PIP_MATERIAL_DIR)
    if not sources:
        return None

    source = random.choice(sources)
    return make_pip_event(source, intro_units[0]["start"] - 0.05, intro_units[-1]["end"] + 0.12, duration, "self_intro")


def build_islet_function_pip_event(timed_units, duration):
    for unit in timed_units:
        if unit.get("source") == "title" or not unit.get("visible"):
            continue
        if has_islet_pip_trigger(unit["text"]):
            sources = pip_sources(ISLET_MATERIAL_DIR)
            if not sources:
                return None
            source = random.choice(sources)
            return make_pip_event(source, unit["start"] - 0.05, unit["end"] + 0.12, duration, "islet_function")
    return None


def build_pip_events(timed_units, duration):
    pip_events, _image_events, _blocked_sentence_indexes, _forced_effect_unit_indexes = build_visual_events(timed_units, duration)
    return pip_events


def backing_image_sources():
    if not BACKGROUND_MATERIAL_DIR.exists():
        return []
    return sorted(
        path for path in BACKGROUND_MATERIAL_DIR.rglob("*")
        if path.is_file() and path.suffix.lower() in BACKING_IMAGE_EXTS
    )


def backing_asset_sources(kind):
    sources = backing_image_sources()
    if not sources:
        return []
    terms = BACKING_ASSET_TERMS.get(kind, ())
    matched = [source for source in sources if any(term in source.stem for term in terms)]
    return matched or sources


def backing_asset(kind):
    sources = backing_asset_sources(kind)
    return sources[0] if sources else None


def ensure_remotion_public_asset(source, folder):
    target_dir = REMOTION_EFFECTS_DIR / "public" / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / source.name
    needs_copy = True
    if target.exists():
        src_stat = source.stat()
        dst_stat = target.stat()
        needs_copy = src_stat.st_size != dst_stat.st_size or src_stat.st_mtime > dst_stat.st_mtime
    if needs_copy:
        shutil.copy2(source, target)
    return f"{folder}/{target.name}"


def backing_kinds(text):
    clean = clean_for_len(text)
    kinds = []
    for kind, terms in BACKING_EVENT_TERMS.items():
        if any(term in clean for term in terms):
            kinds.append(kind)
    return kinds


def backing_terms_for_kind(kind):
    return sorted(BACKING_EVENT_TERMS.get(kind, ()), key=lambda term: len(clean_for_len(term)), reverse=True)


def backing_keyword_window(group, kind):
    terms = backing_terms_for_kind(kind)
    for unit in group.get("visible_units", []):
        clean_text = clean_for_len(unit["text"])
        if not clean_text:
            continue
        for term in terms:
            clean_term = clean_for_len(term)
            if not clean_term:
                continue
            pos = clean_text.find(clean_term)
            if pos < 0:
                continue
            unit_start = float(unit["start"])
            unit_end = float(unit["end"])
            unit_duration = max(0.12, unit_end - unit_start)
            unit_len = max(1, len(clean_text))
            keyword_start = unit_start + unit_duration * (pos / unit_len)
            lead_seconds = BACKING_EVENT_LEAD_SECONDS.get(kind, 0.0)
            start = max(float(group["start"]), keyword_start - lead_seconds)
            hold_seconds = BACKING_EVENT_HOLD_SECONDS.get(kind)
            if hold_seconds:
                end = start + hold_seconds
                if BACKING_EVENT_CLAMP_TO_SENTENCE.get(kind):
                    end = min(float(group["end"]), end)
                return start, end
            end = unit_start + unit_duration * ((pos + len(clean_term)) / unit_len)
            end = max(end, start + 0.75)
            end = min(unit_end, end + 0.18)
            if end <= start:
                end = min(unit_end, start + 0.75)
            return start, end
    hold_seconds = BACKING_EVENT_HOLD_SECONDS.get(kind)
    if hold_seconds:
        end = float(group["start"]) + hold_seconds
        if BACKING_EVENT_CLAMP_TO_SENTENCE.get(kind):
            end = min(float(group["end"]), end)
        return float(group["start"]), end
    return group["start"], group["end"]


def make_backing_image_event(kind, source, start, end, video_duration, sentence_index=None):
    start = max(0.0, start)
    end = min(video_duration, end)
    if end <= start:
        return None
    start_frame = int(round(start * 25))
    end_frame = max(start_frame + 12, int(round(end * 25)))
    remotion_source = ensure_remotion_public_asset(source, "backing")
    layout = {**BACKING_EVENT_LAYOUT, **BACKING_EVENT_KIND_LAYOUT.get(kind, {})}
    event = {
        "kind": kind,
        "source": remotion_source,
        "originalSource": str(source),
        "start": round(start, 3),
        "end": round(end, 3),
        "startFrame": start_frame,
        "endFrame": end_frame,
        "animation": "page-flip" if kind == "patent" else "slide-left",
        "avoid": "face_neck",
        **layout,
    }
    if sentence_index is not None:
        event["sentenceIndex"] = sentence_index
    return event


def build_backing_image_events(timed_units, duration):
    events = []
    for unit in timed_units:
        if unit.get("source") == "title" or not unit.get("visible"):
            continue
        kinds = backing_kinds(unit["text"])
        if not kinds:
            continue

        start = unit["start"]
        end = unit["end"]
        kind = max(kinds, key=lambda value: VISUAL_EVENT_PRIORITY.get(value, 0))
        source = backing_asset(kind)
        if not source:
            continue
        event = make_backing_image_event(kind, source, start, end, duration, unit.get("sentence_index"))
        if event:
            events.append(event)
    return events


def sentence_groups(timed_units):
    groups = []
    by_index = {}
    for order, unit in enumerate(timed_units):
        if unit.get("source") == "title":
            continue
        sentence_index = unit.get("sentence_index", f"unit-{order}")
        if sentence_index not in by_index:
            group = {
                "sentence_index": sentence_index,
                "order": order,
                "units": [],
                "unit_orders": [],
            }
            by_index[sentence_index] = group
            groups.append(group)
        by_index[sentence_index]["units"].append(unit)
        by_index[sentence_index]["unit_orders"].append(order)

    prepared = []
    for group in groups:
        units = group["units"]
        visible_pairs = [
            (order, unit) for order, unit in zip(group["unit_orders"], units)
            if unit.get("visible") and unit.get("source") == "body"
        ]
        if not visible_pairs:
            continue
        visible_units = [unit for _order, unit in visible_pairs]
        group["visible_units"] = visible_units
        group["visible_unit_orders"] = [order for order, _unit in visible_pairs]
        group["text"] = "".join(unit["text"] for unit in visible_units)
        group["start"] = min(unit["start"] for unit in units)
        group["end"] = max(unit["end"] for unit in units)
        prepared.append(group)
    return prepared


def material_source_key(source):
    try:
        return str(Path(source).expanduser().resolve())
    except Exception:
        return str(source)


def add_visual_candidate(candidates_by_sentence, group, kind, event_type, source, source_pool=None):
    if not source:
        return
    candidates_by_sentence.setdefault(group["sentence_index"], []).append({
        "kind": kind,
        "event_type": event_type,
        "source": source,
        "source_pool": list(source_pool or [source]),
        "group": group,
        "priority": VISUAL_EVENT_PRIORITY.get(kind, 0),
    })


def forced_effect_unit_index_for_visual(group, kind):
    pairs = list(zip(group.get("visible_unit_orders", []), group.get("visible_units", [])))
    if kind == "islet_function":
        for order, unit in pairs:
            if has_islet_pip_trigger(unit["text"]):
                return order
    if kind == "self_intro":
        for order, unit in pairs:
            if is_self_intro_text(unit["text"]):
                return order
    return pairs[0][0] if pairs else None


def choose_unused_visual_source(candidate, used_material_sources):
    sources = [source for source in candidate.get("source_pool", []) if source]
    if not sources:
        sources = [candidate["source"]]
    sources = list(sources)
    if len(sources) > 1:
        random.shuffle(sources)
    for source in sources:
        key = material_source_key(source)
        if key not in used_material_sources:
            copy = dict(candidate)
            copy["source"] = source
            return copy, key
    return None, None


def build_visual_events(timed_units, video_duration, title_end=0.0):
    groups = sentence_groups(timed_units)
    candidates_by_sentence = {}

    self_intro_sources = pip_sources(PIP_MATERIAL_DIR)
    for group in groups:
        if is_self_intro_text(group["text"]) and self_intro_sources:
            add_visual_candidate(
                candidates_by_sentence,
                group,
                "self_intro",
                "pip",
                random.choice(self_intro_sources),
                self_intro_sources,
            )

    islet_sources = pip_sources(ISLET_MATERIAL_DIR)
    if islet_sources:
        for group in groups:
            if has_islet_pip_trigger(group["text"]):
                add_visual_candidate(
                    candidates_by_sentence,
                    group,
                    "islet_function",
                    "pip",
                    random.choice(islet_sources),
                    islet_sources,
                )

    for group in groups:
        for kind in backing_kinds(group["text"]):
            sources = backing_asset_sources(kind)
            if not sources:
                continue
            add_visual_candidate(
                candidates_by_sentence,
                group,
                kind,
                "image",
                random.choice(sources),
                sources,
            )

    pip_events = []
    image_events = []
    blocked_sentence_indexes = set()
    forced_effect_unit_indexes = set()
    used_material_sources = set()
    for group in groups:
        candidates = candidates_by_sentence.get(group["sentence_index"], [])
        if not candidates:
            continue
        candidates.sort(key=lambda candidate: candidate["priority"], reverse=True)
        candidate = None
        source_key = None
        skipped_candidates = []
        for raw_candidate in candidates:
            if raw_candidate["event_type"] == "pip" and len(pip_events) >= MAX_PIP_EVENTS_PER_VIDEO:
                skipped_candidates.append(raw_candidate)
                continue
            candidate, source_key = choose_unused_visual_source(raw_candidate, used_material_sources)
            if candidate:
                break
            skipped_candidates.append(raw_candidate)
        if candidate is None:
            for skipped in skipped_candidates:
                forced_index = forced_effect_unit_index_for_visual(group, skipped["kind"])
                if forced_index is not None:
                    forced_effect_unit_indexes.add(forced_index)
            continue
        start = group["start"]
        end = group["end"]
        if candidate["event_type"] == "pip":
            if candidate["kind"] == "islet_function":
                start, end = islet_pip_window(group)
            event = make_pip_event(
                candidate["source"],
                start,
                end,
                video_duration,
                candidate["kind"],
                group["sentence_index"],
                title_end,
            )
            if event:
                pip_events.append(event)
                used_material_sources.add(source_key)
                blocked_sentence_indexes.add(group["sentence_index"])
            else:
                forced_index = forced_effect_unit_index_for_visual(group, candidate["kind"])
                if forced_index is not None:
                    forced_effect_unit_indexes.add(forced_index)
        else:
            image_start, image_end = backing_keyword_window(group, candidate["kind"])
            event = make_backing_image_event(
                candidate["kind"],
                candidate["source"],
                image_start,
                image_end,
                video_duration,
                group["sentence_index"],
            )
            if event:
                image_events.append(event)
                used_material_sources.add(source_key)
                blocked_sentence_indexes.add(group["sentence_index"])
            else:
                forced_index = forced_effect_unit_index_for_visual(group, candidate["kind"])
                if forced_index is not None:
                    forced_effect_unit_indexes.add(forced_index)

    return pip_events, image_events, blocked_sentence_indexes, forced_effect_unit_indexes


def build_spoken_units(text):
    sentences = split_sentences(text)
    units = []
    cta_started = False
    for index, sentence in enumerate(sentences):
        is_cta = index >= 3 and (cta_started or any(term in sentence for term in CTA_SENTENCE_TERMS))
        if is_cta:
            cta_started = True

        source = "title" if index < 3 else ("cta" if is_cta else "body")
        if source == "title":
            units.append({"text": sentence, "visible": True, "source": source, "sentence_index": index})
        else:
            for part in split_caption_clauses(sentence):
                units.append({"text": part, "visible": True, "source": source, "sentence_index": index})
    return sentences[:3], units


def title_lines(hook_sentences):
    padded = list(hook_sentences) + ["", "", ""]
    first, second, third = padded[:3]
    first_parts = re.split(r"[，,]", first, maxsplit=1)
    if len(first_parts) == 2 and len(clean_for_len(first_parts[0])) >= 4:
        red = strip_end_punct(first_parts[0])
        yellow = first_parts[1].strip()
    else:
        red = strip_end_punct(first)
        second_parts = re.split(r"[，,]", second)
        yellow = second_parts[-1].strip() if len(second_parts) > 1 else second.strip()

    third_parts = re.split(r"[，,]", third)
    blue = third_parts[-1].strip() if len(third_parts) > 1 and len(clean_for_len(third_parts[0])) <= 4 else third.strip()
    return red, yellow, blue


def load_or_transcribe(raw_video, json_path):
    if json_path.exists():
        data = json.loads(json_path.read_text(encoding="utf-8"))
        if any(seg.get("words") for seg in data.get("segments", [])):
            return data
    import whisper
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = whisper.load_model("small", device=device)
    result = model.transcribe(
        str(raw_video),
        language="Chinese",
        fp16=device == "cuda",
        verbose=False,
        word_timestamps=True,
        condition_on_previous_text=False,
    )
    json_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result


def clean_for_align(text):
    return clean_for_len(text)


def align_key(char):
    return ALIGN_CHAR_MAP.get(char, char)


def word_char_items(segments):
    chars = []
    for seg in segments:
        for word in seg.get("words", []):
            text = clean_for_align(word.get("word", ""))
            if not text:
                continue
            start = float(word["start"])
            end = float(word["end"])
            step = (end - start) / max(1, len(text))
            for i, char in enumerate(text):
                chars.append({
                    "char": char,
                    "start": start + step * i,
                    "end": start + step * (i + 1),
                })
    return chars


def word_char_boundaries(segments):
    chars = word_char_items(segments)
    if not chars:
        return []
    return [chars[0]["start"], *[(prev["end"] + cur["start"]) / 2 for prev, cur in zip(chars, chars[1:])], chars[-1]["end"]]


def boundary_time(pos, boundaries):
    if not boundaries:
        return 0.0
    if pos <= 0:
        return boundaries[0]
    max_pos = len(boundaries) - 1
    if pos >= max_pos:
        return boundaries[-1]
    low = int(pos)
    frac = pos - low
    return boundaries[low] + (boundaries[low + 1] - boundaries[low]) * frac


def assign_timings(units, transcript):
    segments = [s for s in transcript.get("segments", []) if s.get("end", 0) > s.get("start", 0)]
    if not segments:
        raise RuntimeError("no whisper segments")

    asr_chars = word_char_items(segments)
    if not asr_chars:
        raise RuntimeError("no word timestamps")

    script_chars = []
    unit_ranges = []
    for unit in units:
        start = len(script_chars)
        script_chars.extend(clean_for_align(unit["text"]))
        unit_ranges.append((start, len(script_chars)))

    if not script_chars:
        return [{**u, "start": 0.0, "end": 0.35} for u in units]

    script_keys = "".join(align_key(char) for char in script_chars)
    asr_keys = "".join(align_key(item["char"]) for item in asr_chars)
    matcher = difflib.SequenceMatcher(None, script_keys, asr_keys, autojunk=False)

    script_to_asr = [None] * len(script_chars)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag != "equal":
            continue
        for offset in range(min(i2 - i1, j2 - j1)):
            script_to_asr[i1 + offset] = j1 + offset

    char_starts = [None] * len(script_chars)
    char_ends = [None] * len(script_chars)
    for i, asr_index in enumerate(script_to_asr):
        if asr_index is None:
            continue
        char_starts[i] = asr_chars[asr_index]["start"]
        char_ends[i] = asr_chars[asr_index]["end"]

    asr_start = asr_chars[0]["start"]
    asr_end = asr_chars[-1]["end"]
    avg_char_duration = max(0.08, (asr_end - asr_start) / max(1, len(script_chars)))
    mapped = [i for i, start in enumerate(char_starts) if start is not None]
    if not mapped:
        boundaries = word_char_boundaries(segments)
        total_chars = sum(max(1, len(clean_for_align(u["text"]))) for u in units)
        scale = (len(boundaries) - 1) / max(1, total_chars)
        cursor = 0
        timed = []
        for unit in units:
            length = max(1, len(clean_for_align(unit["text"])))
            start = boundary_time(cursor * scale, boundaries)
            end = boundary_time((cursor + length) * scale, boundaries)
            timed.append({**unit, "start": start, "end": max(end, start + 0.35)})
            cursor += length
        return timed

    def fill_run(start_i, end_i, left_time, right_time):
        if end_i <= start_i:
            return
        if right_time <= left_time:
            right_time = left_time + avg_char_duration * (end_i - start_i)
        step = (right_time - left_time) / (end_i - start_i)
        for offset, idx in enumerate(range(start_i, end_i)):
            char_starts[idx] = left_time + step * offset
            char_ends[idx] = left_time + step * (offset + 1)

    first = mapped[0]
    if first > 0:
        left = max(asr_start, char_starts[first] - avg_char_duration * first)
        fill_run(0, first, left, char_starts[first])

    for left_i, right_i in zip(mapped, mapped[1:]):
        fill_run(left_i + 1, right_i, char_ends[left_i], char_starts[right_i])

    last = mapped[-1]
    if last < len(script_chars) - 1:
        right = min(asr_end, char_ends[last] + avg_char_duration * (len(script_chars) - last - 1))
        fill_run(last + 1, len(script_chars), char_ends[last], right)

    timed = []
    for unit, (start_i, end_i) in zip(units, unit_ranges):
        if end_i <= start_i:
            start = timed[-1]["end"] if timed else asr_start
            end = start + 0.35
        else:
            start = char_starts[start_i]
            end = char_ends[end_i - 1]
        start = max(0.0, start - 0.03)
        end = min(asr_end, end + 0.08)
        if end - start < 0.35:
            end = min(asr_end, start + 0.35)
        timed.append({**unit, "start": start, "end": end})

    for prev, cur in zip(timed, timed[1:]):
        if prev["end"] > cur["start"] - 0.02:
            prev["end"] = max(prev["start"] + 0.25, cur["start"] - 0.02)
    return timed


def wrap_zh(text, max_chars=13):
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return "\\N".join(chunk_by_tokens(text, max_chars))


def ass_dialogue(layer, start, end, style, text):
    return f"Dialogue: {layer},{ass_time(start)},{ass_time(end)}, {style},,0,0,0,,{text}".replace(", ", ",")


def title_core_highlight_ass(text, font_size):
    text_w = text_width(text, font_size, role="title")
    visible_len = len(display_line(text))
    visual_ratio = next(ratio for max_len, ratio in TITLE_CORE_BG_VISUAL_WIDTH_RATIOS if visible_len <= max_len)
    max_width = int((1080 - TITLE_CORE_BG_MARGIN_X * 2) * TITLE_CORE_BG_MAX_WIDTH_RATIO)
    width = int(min(max_width, max(TITLE_CORE_BG_MIN_WIDTH, text_w * visual_ratio + TITLE_CORE_BG_PAD_X * 2)))
    height = int(max(88, font_size * TITLE_CORE_BG_HEIGHT_RATIO))
    left = int((1080 - width) / 2)
    top = int(TITLE_CORE_Y - height / 2)
    return f"{{\\an7\\pos({left},{top})\\p1\\bord0\\shad0\\c&H0000E9FF&}}m 0 0 l {width} 0 l {width} {height} l 0 {height}"


def title_end_for_units(timed_units):
    return max((u["end"] for u in timed_units if u["source"] == "title"), default=8.0) + 0.25


def write_subtitles(
    item,
    timed_units,
    hook_sentences,
    duration,
    ass_path,
    srt_path,
    effects_path=None,
    pip_events=None,
    image_events=None,
):
    title_end = title_end_for_units(timed_units)
    item_title = item.get("title") or item.get("title_lines") or title_lines(hook_sentences)
    item_title = list(item_title) + ["", "", ""]
    red, yellow, blue = [display_line(t) for t in item_title[:3]]
    red_size = fit_font_size([red], 144, TITLE_MIN_FONT_SIZE, role="title")
    yellow_size = fit_font_size([yellow], 144, TITLE_MIN_FONT_SIZE, role="title")
    blue_size = fit_font_size([blue], 132, TITLE_MIN_FONT_SIZE, role="title")

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{CAPTION_ASS_FONT_FAMILY},96,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,8,0,5,40,40,40,1
Style: EffectCaption,Source Han Serif CN,96,&H00FFFFFF,&H000000FF,&H002EDFFF,&HAA000000,1,0,0,0,100,100,0,0,1,8,4,5,30,30,30,1
Style: EffectCause,Source Han Serif CN,104,&H00FFF7F0,&H000000FF,&H000A20D8,&HAA000000,1,0,0,0,100,100,0,0,1,8,5,5,30,30,30,1
Style: EffectResult,Source Han Serif CN,104,&H00FFF7F0,&H000000FF,&H000A55FF,&HAA000000,1,0,0,0,100,100,0,0,1,8,5,5,30,30,30,1
Style: EffectDamage,Source Han Serif CN,108,&H00F8F0F0,&H000000FF,&H00080808,&HAA000000,1,0,0,0,100,100,0,0,1,8,5,5,30,30,30,1
Style: Disclaimer,{DISCLAIMER_ASS_FONT_FAMILY},43,&H80FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,30,30,30,1
Style: TitleHighlight,{TITLE_ASS_FONT_FAMILY},144,&H0000DEFF,&H000000FF,&H0000DEFF,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,20,20,20,1
Style: TitleRed,{TITLE_ASS_FONT_FAMILY},144,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,8,0,5,20,20,20,1
Style: TitleYellow,{TITLE_ASS_FONT_FAMILY},144,&H0000DEFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,8,0,5,20,20,20,1
Style: TitleBlue,{TITLE_ASS_FONT_FAMILY},132,&H00002AFF,&H000000FF,&H00FFFFFF,&H00000000,1,0,0,0,100,100,0,0,1,8,0,5,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header.rstrip()]
    lines.append(ass_dialogue(1, 0, duration, "Disclaimer", f"{{\\pos(540,{DISCLAIMER_POS_Y})}}{ass_escape(display_text(DISCLAIMER))}"))
    lines.append(ass_dialogue(4, 0, title_end, "TitleRed", f"{{\\pos(540,{TITLE_TOP_Y})\\fs{red_size}}}{ass_escape(red)}"))
    lines.append(ass_dialogue(4, 0, title_end, "TitleYellow", f"{{\\pos(540,{TITLE_CORE_Y})\\fs{yellow_size}}}{ass_escape(yellow)}"))
    lines.append(ass_dialogue(4, 0, title_end, "TitleBlue", f"{{\\pos(540,{TITLE_BOTTOM_Y})\\fs{blue_size}}}{ass_escape(blue)}"))

    srt_blocks = []
    srt_i = 1
    effect_events = []

    def add_srt_block(start, end, text_lines):
        nonlocal srt_i
        srt_blocks.append(
            f"{srt_i}\n{srt_time(start)} --> {srt_time(end)}\n"
            f"{chr(10).join(text_lines)}"
        )
        srt_i += 1

    def add_caption_group(group):
        if not group:
            return
        text_lines = [display_line(line) for line in caption_group_lines(group)]
        text_lines = [line for line in text_lines if line]
        if not text_lines:
            return
        text = ass_escape("\\N".join(text_lines))
        start = group[0]["start"]
        end = group[-1]["end"]
        lines.append(ass_dialogue(3, start, end, "Caption", f"{{\\pos(540,1495)\\fs{CAPTION_FONT_SIZE}}}{text}"))
        add_srt_block(start, end, text_lines)

    def flush_normal(buffer):
        for page in build_caption_pages(buffer):
            add_caption_group(page)
        buffer.clear()

    caption_units = [unit for unit in timed_units if unit["source"] != "title" and unit["visible"]]
    normal_buffer = []
    for unit in caption_units:
        if unit.get("effect"):
            flush_normal(normal_buffer)
            text = display_line(unit["text"])
            if not text:
                continue
            start = unit["start"]
            end = unit["end"]
            variant = unit.get("effect_variant", "yellow-pop")
            style = (
                "EffectDamage" if variant == "damaged-function"
                else "EffectCause" if variant == "cause-alert"
                else "EffectResult" if variant == "result-burst"
                else "EffectCaption"
            )
            prefix = "⚠" if variant == "cause-alert" else "!" if variant == "result-burst" else ""
            suffix = "!" if variant == "result-burst" else ""
            if not USE_REMOTION_EFFECT_LAYER:
                lines.append(ass_dialogue(5, start, end, style, f"{{\\pos(540,1390)\\fs104}}{ass_escape(prefix + text + suffix)}"))
            add_srt_block(start, end, [text])
            start_frame = int(round(start * 25))
            end_frame = max(start_frame + 12, int(round(end * 25)))
            effect_events.append({
                "text": text,
                "start": round(start, 3),
                "end": round(end, 3),
                "startFrame": start_frame,
                "endFrame": end_frame,
                "variant": unit.get("effect_variant", "yellow-pop"),
            })
        else:
            normal_buffer.append(unit)
    flush_normal(normal_buffer)

    ass_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    srt_path.write_text("\n\n".join(srt_blocks) + "\n", encoding="utf-8")
    if effects_path is not None:
        effects_payload = {
            "composition": "CaptionEffects",
            "width": 1080,
            "height": 1920,
            "fps": 25,
            "durationInFrames": int(round(duration * 25)),
            "events": effect_events,
            "pip": pip_events[0] if pip_events else None,
            "pips": pip_events or [],
            "imageEvents": image_events or [],
            "remotionDir": str(REMOTION_EFFECTS_DIR),
        }
        effects_path.write_text(json.dumps(effects_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return title_end


def duration(path):
    res = run([
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path),
    ])
    return float(res.stdout.strip())


def ffmpeg_filter_path(path):
    text = Path(path).resolve().as_posix()
    return (
        text
        .replace("\\", "/")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace(",", "\\,")
        .replace("[", "\\[")
        .replace("]", "\\]")
    )


def render_packaged(raw_video, ass_path, packaged_path, pip_events=None):
    pip_events = pip_events or []
    cmd = [
        "ffmpeg", "-y",
        "-i", str(raw_video),
        "-an",
        "-i", str(LOGO_PATH),
    ]

    valid_pips = [event for event in pip_events if event and event.get("source")]
    for event in valid_pips:
        pip_source = Path(event["source"])
        suffix = pip_source.suffix.lower()
        if suffix in PIP_IMAGE_EXTS:
            cmd.extend(["-loop", "1", "-i", str(pip_source)])
        else:
            cmd.extend(["-an", "-i", str(pip_source)])

    filter_parts = ["[0:v][1:v]overlay=102:77[vbase0]"]
    base_label = "vbase0"
    for index, event in enumerate(valid_pips, start=2):
        event_i = index - 2
        start = float(event["start"])
        end = float(event["end"])
        width = int(event.get("width", PIP_WIDTH))
        height = int(event.get("height", PIP_HEIGHT))
        x = int(event.get("x", PIP_X))
        y = int(event.get("y", PIP_Y))
        pip_label = f"pip{event_i}"
        out_label = f"vbase{event_i + 1}"
        filter_parts.append(
            f"[{index}:v]setpts=PTS-STARTPTS+{start:.3f}/TB,"
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},setsar=1[{pip_label}]"
        )
        filter_parts.append(
            f"[{base_label}][{pip_label}]overlay={x}:{y}:eof_action=pass:enable='between(t,{start:.3f},{end:.3f})'[{out_label}]"
        )
        base_label = out_label

    ass_filter_path = ffmpeg_filter_path(ass_path)
    font_filter_path = ffmpeg_filter_path(FONT_DIR)
    filter_parts.append(f"[{base_label}]ass=filename='{ass_filter_path}':fontsdir='{font_filter_path}'[v]")
    filter_complex = ";".join(filter_parts)

    cmd.extend([
        "-filter_complex", filter_complex,
        "-map", "[v]",
        # Only keep the main digital-human audio; picture-in-picture material is always silent.
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


def remotion_runtime_dir():
    base = os.environ.get("HU_TEACHER_REMOTION_CACHE")
    cache_root = Path(base) if base else Path(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()) / "DoctorVideoRemotion"
    source_key = hashlib.sha1(str(REMOTION_EFFECTS_DIR.resolve()).encode("utf-8", errors="ignore")).hexdigest()[:10]
    return cache_root / f"remotion_effects_{source_key}"


def ensure_remotion_runtime():
    if not _path_exists(REMOTION_EFFECTS_DIR):
        raise RuntimeError(f"Remotion project missing: {REMOTION_EFFECTS_DIR}")

    runtime_dir = remotion_runtime_dir()
    runtime_compositor = runtime_dir / "node_modules" / "@remotion" / "compositor-win32-x64-msvc" / "remotion.exe"
    if not _path_exists(runtime_compositor):
        _remove_tree(runtime_dir)
        _copy_tree(REMOTION_EFFECTS_DIR, runtime_dir)
    else:
        for file_name in ("package.json", "package-lock.json", "tsconfig.json"):
            src = REMOTION_EFFECTS_DIR / file_name
            if _path_exists(src):
                _copy_file(src, runtime_dir / file_name)
        _copy_tree(REMOTION_EFFECTS_DIR / "src", runtime_dir / "src")
        _copy_tree(REMOTION_EFFECTS_DIR / "public", runtime_dir / "public")

    if os.name == "nt" and not _path_exists(runtime_compositor):
        raise RuntimeError(f"Remotion compositor missing after cache copy: {runtime_compositor}")
    return runtime_dir


def remotion_error_message(error, command, cwd):
    stdout = (getattr(error, "stdout", "") or "").strip()
    stderr = (getattr(error, "stderr", "") or "").strip()
    details = "\n".join(part for part in (stdout, stderr) if part)
    if len(details) > 6000:
        details = details[-6000:]
    command_text = " ".join(str(part) for part in command)
    return (
        f"Remotion render failed, exit code {getattr(error, 'returncode', '?')}\n"
        f"cwd: {cwd}\n"
        f"command: {command_text}\n"
        f"{details}"
    ).strip()


def render_remotion_effects(effects_path, effect_layer_path):
    if not _path_exists(CHROME_EXECUTABLE):
        raise RuntimeError(f"Chrome executable missing: {CHROME_EXECUTABLE}")

    runtime_dir = ensure_remotion_runtime()
    remotion_cli = runtime_dir / "node_modules" / "@remotion" / "cli" / "remotion-cli.js"
    if not _path_exists(NODE_EXECUTABLE):
        raise RuntimeError(f"Node executable missing: {NODE_EXECUTABLE}")
    if not _path_exists(remotion_cli):
        raise RuntimeError(f"Remotion CLI missing: {remotion_cli}")

    props_path = runtime_dir / "props" / Path(effects_path).name
    render_output = runtime_dir / "renders" / Path(effect_layer_path).name
    _copy_file(effects_path, props_path)
    render_output.parent.mkdir(parents=True, exist_ok=True)
    if _path_exists(render_output):
        Path(_windows_long_path(render_output)).unlink()

    cmd = [
        str(Path(NODE_EXECUTABLE).resolve()),
        _cli_path(remotion_cli),
        "render",
        "src/index.ts",
        "CaptionEffects",
        f"--props={_cli_path(props_path)}",
        f"--browser-executable={_cli_path(CHROME_EXECUTABLE)}",
        "--codec=prores",
        "--prores-profile=4444",
        "--image-format=png",
        "--pixel-format=yuva444p10le",
        "--concurrency=1",
        _cli_path(render_output),
    ]
    try:
        subprocess.run(cmd, cwd=runtime_dir, check=True, text=True, encoding="utf-8", capture_output=True, errors="replace")
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(remotion_error_message(exc, cmd, runtime_dir)) from exc

    if not _path_exists(render_output):
        raise RuntimeError(f"Remotion render produced no output: {render_output}")
    _copy_file(render_output, effect_layer_path)


def overlay_remotion_effects(base_path, effect_layer_path, output_path):
    subprocess.run([
        "ffmpeg", "-y",
        "-i", str(base_path),
        "-an",
        "-i", str(effect_layer_path),
        "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto:eof_action=pass[v]",
        "-map", "[v]",
        "-map", "0:a?",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(output_path),
    ], check=True)


def detect_silences(path):
    proc = subprocess.run([
        "ffmpeg", "-hide_banner",
        "-i", str(path),
        "-af", f"silencedetect=noise={NOISE}:d={MIN_SILENCE}",
        "-f", "null", "-",
    ], text=True, encoding="utf-8", errors="replace", capture_output=True, check=True)
    starts = []
    pairs = []
    for line in (proc.stderr or "").splitlines():
        m = re.search(r"silence_start: ([0-9.]+)", line)
        if m:
            starts.append(float(m.group(1)))
            continue
        m = re.search(r"silence_end: ([0-9.]+)", line)
        if m and starts:
            pairs.append((starts.pop(0), float(m.group(1))))
    return pairs


def build_keep_segments(total, silences):
    cuts = []
    for start, end in silences:
        if start <= 0.02:
            cut_start = 0.0
            cut_end = max(0.0, end - EDGE_KEEP)
        elif end >= total - 0.02:
            cut_start = min(total, start + EDGE_KEEP)
            cut_end = total
        else:
            keep_each_side = MIDDLE_KEEP / 2
            cut_start = start + keep_each_side
            cut_end = end - keep_each_side
        if cut_end > cut_start:
            cuts.append((cut_start, cut_end))

    keep = []
    cursor = 0.0
    for cut_start, cut_end in cuts:
        if cut_start > cursor:
            keep.append((cursor, cut_start))
        cursor = max(cursor, cut_end)
    if cursor < total:
        keep.append((cursor, total))
    return keep, cuts


def map_original_to_tight(seconds, keep_segments):
    elapsed = 0.0
    for start, end in keep_segments:
        if seconds < start:
            return elapsed
        if start <= seconds <= end:
            return elapsed + seconds - start
        elapsed += end - start
    return elapsed


def render_tight_no_bgm(input_path, output_path, keep_segments):
    filter_parts = []
    concat_inputs = []
    for i, (start, end) in enumerate(keep_segments):
        filter_parts.append(f"[0:v]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS[v{i}]")
        filter_parts.append(f"[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS[a{i}]")
        concat_inputs.append(f"[v{i}][a{i}]")
    filter_complex = ";".join(filter_parts)
    filter_complex += ";" + "".join(concat_inputs)
    filter_complex += f"concat=n={len(keep_segments)}:v=1:a=1[outv][outa]"
    subprocess.run([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-map", "[outa]",
        "-r", "25",
        "-fps_mode", "cfr",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "160k",
        "-movflags", "+faststart",
        "-video_track_timescale", "12800",
        str(output_path),
    ], check=True)


def add_bgm(input_path, output_path, bgm_start, bgm_path, keyword_sfx_path=None, keyword_sfx_starts=None):
    total = duration(input_path)
    bgm_ms = int(round(bgm_start * 1000))
    remaining = max(0.1, total - bgm_start)
    fade_out_start = max(0.0, remaining - BGM_FADE_OUT)
    filter_parts = [
        f"[0:a]volume={MAIN_AUDIO_VOLUME}[maina]",
        f"[1:a]atrim=0:{remaining + 0.25:.3f},asetpts=PTS-STARTPTS,"
        f"volume={BGM_VOLUME},"
        f"afade=t=in:st=0:d={BGM_FADE_IN},"
        f"afade=t=out:st={fade_out_start:.3f}:d={BGM_FADE_OUT},"
        f"adelay={bgm_ms}:all=1[bgm]"
    ]
    mix_inputs = ["[maina]", "[bgm]"]
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-i", str(bgm_path),
    ]
    keyword_sfx_starts = keyword_sfx_starts or []
    if keyword_sfx_path and keyword_sfx_starts:
        starts = [max(0.0, start) for start in keyword_sfx_starts if 0.0 <= start <= total + 0.1]
        starts = sorted(starts)
        if starts:
            cmd.extend(["-i", str(keyword_sfx_path)])
            if len(starts) == 1:
                delay_ms = int(round(starts[0] * 1000))
                filter_parts.append(
                    f"[2:a]atrim=0:{KEYWORD_SFX_MAX_SECONDS:.3f},asetpts=PTS-STARTPTS,"
                    f"volume={KEYWORD_SFX_VOLUME},adelay={delay_ms}:all=1[sfx0]"
                )
                mix_inputs.append("[sfx0]")
            else:
                split_labels = "".join(f"[sfxsrc{i}]" for i in range(len(starts)))
                filter_parts.append(
                    f"[2:a]atrim=0:{KEYWORD_SFX_MAX_SECONDS:.3f},asetpts=PTS-STARTPTS,"
                    f"volume={KEYWORD_SFX_VOLUME},asplit={len(starts)}{split_labels}"
                )
                for i, start in enumerate(starts):
                    delay_ms = int(round(start * 1000))
                    filter_parts.append(f"[sfxsrc{i}]adelay={delay_ms}:all=1[sfx{i}]")
                    mix_inputs.append(f"[sfx{i}]")
    filter_parts.append(
        f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:duration=first:dropout_transition=0:normalize=0,"
        f"alimiter=limit=0.98,"
        f"aresample=48000[aout]"
    )
    filter_complex = ";".join(filter_parts)
    cmd.extend([
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        str(output_path),
    ])
    subprocess.run(cmd, check=True)


def keyword_sfx_files():
    if not KEYWORD_SFX_DIR.exists():
        return []
    return sorted(
        path for path in KEYWORD_SFX_DIR.glob("*")
        if path.is_file() and path.suffix.lower() in KEYWORD_SFX_EXTS
    )


def tighten_and_mix(input_path, final_path, report_path, title_end, keyword_effect_starts=None):
    no_bgm = final_path.with_name(final_path.stem + "_no_bgm_tmp.mp4")
    keyword_effect_starts = keyword_effect_starts or []
    total = duration(input_path)
    silences = detect_silences(input_path)
    keep, cuts = build_keep_segments(total, silences)
    render_tight_no_bgm(input_path, no_bgm, keep)
    bgm_start = map_original_to_tight(title_end, keep)
    bgms = sorted(BGM_DIR.glob("*.mp3"))
    if not bgms:
        raise SystemExit(f"bgm library is empty: {BGM_DIR}")
    bgm_path = random.choice(bgms)
    sfxs = keyword_sfx_files()
    keyword_sfx_path = random.choice(sfxs) if keyword_effect_starts and sfxs else None
    keyword_sfx_starts = [map_original_to_tight(start, keep) for start in keyword_effect_starts]
    add_bgm(
        no_bgm,
        final_path,
        bgm_start,
        bgm_path,
        keyword_sfx_path=keyword_sfx_path,
        keyword_sfx_starts=keyword_sfx_starts,
    )
    new_total = duration(final_path)
    report = [
        f"input={input_path}",
        f"output={final_path}",
        f"original_duration={total:.3f}",
        f"tight_duration={new_total:.3f}",
        f"removed={total - new_total:.3f}",
        f"silence_count={len(silences)}",
        f"cut_count={len(cuts)}",
        f"bgm={bgm_path}",
        f"bgm_start_original={title_end:.3f}",
        f"bgm_start_tight={bgm_start:.3f}",
        f"keyword_sfx={keyword_sfx_path or ''}",
        "keyword_sfx_starts_original=" + ",".join(f"{start:.3f}" for start in keyword_effect_starts),
        "keyword_sfx_starts_tight=" + ",".join(f"{start:.3f}" for start in keyword_sfx_starts),
    ]
    report_path.write_text("\n".join(report) + "\n", encoding="utf-8")


def load_state():
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"items": {}}


def save_state(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def local_time(ts):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(ts))


def write_batch_timing(batch_name, batch_started_at, batch_ended_at, state, only=None, exit_code=0):
    only = set(only or [])
    timing_path = ROOT / "outputs" / f"{batch_name}_timing.json"
    text_path = ROOT / "outputs" / f"{batch_name}_timing.txt"
    timing_path.parent.mkdir(parents=True, exist_ok=True)

    items = []
    for index, copy_item in enumerate(COPIES, start=1):
        slug = copy_item["slug"]
        if only and slug not in only:
            continue
        entry = state.get("items", {}).get(slug, {})
        created_at = entry.get("created_at")
        completed_at = entry.get("completed_at")
        processed_at = entry.get("processed_at")
        remote_seconds = round(completed_at - created_at, 3) if created_at and completed_at else None
        total_from_create = round(processed_at - created_at, 3) if created_at and processed_at else None
        items.append({
            "index": index,
            "slug": slug,
            "task_id": entry.get("task_id"),
            "asset_file": entry.get("asset_file"),
            "created_at": local_time(created_at) if created_at else None,
            "completed_at": local_time(completed_at) if completed_at else None,
            "processed_at": local_time(processed_at) if processed_at else None,
            "remote_seconds": remote_seconds,
            "process_seconds": entry.get("process_seconds"),
            "total_seconds_from_create": total_from_create,
            "duration": entry.get("duration"),
            "final_path": entry.get("final_path"),
        })

    total_seconds = round(batch_ended_at - batch_started_at, 3)
    result = {
        "batch_name": batch_name,
        "started_at": local_time(batch_started_at),
        "ended_at": local_time(batch_ended_at),
        "total_seconds": total_seconds,
        "total_minutes": round(total_seconds / 60, 3),
        "count": len(items),
        "average_seconds_per_item_wall": round(total_seconds / max(1, len(items)), 3),
        "average_minutes_per_item_wall": round(total_seconds / 60 / max(1, len(items)), 3),
        "output_dir": str(OUTPUT_DIR),
        "state_path": str(STATE_PATH),
        "timing_path": str(timing_path),
        "exit_code": exit_code,
        "items": items,
    }
    timing_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        f"batch_name={batch_name}",
        f"started_at={result['started_at']}",
        f"ended_at={result['ended_at']}",
        f"total_seconds={result['total_seconds']}",
        f"total_minutes={result['total_minutes']}",
        f"count={result['count']}",
        f"average_seconds_per_item_wall={result['average_seconds_per_item_wall']}",
        f"output_dir={result['output_dir']}",
        f"state_path={result['state_path']}",
        f"timing_path={result['timing_path']}",
        "",
    ]
    for item in items:
        lines.append(
            f"{item['index']:02d} {item['slug']} "
            f"remote_seconds={item['remote_seconds']} "
            f"process_seconds={item['process_seconds']} "
            f"total_seconds_from_create={item['total_seconds_from_create']} "
            f"final={item['final_path']}"
        )
    text_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return timing_path, text_path


def process_item(index, item, task_id, force=False):
    slug = item["slug"]
    raw_video = GENERATED_DIR / f"{task_id}_{slug}_raw.mp4"
    transcript_path = GENERATED_DIR / f"{task_id}_{slug}.json"
    ass_path = OUTPUT_DIR / f"{index:02d}_{task_id}_{slug}.ass"
    srt_path = OUTPUT_DIR / f"{index:02d}_{task_id}_{slug}.srt"
    effects_path = OUTPUT_DIR / f"{index:02d}_{task_id}_{slug}_effects.json"
    packaged = OUTPUT_DIR / f"{index:02d}_{task_id}_{slug}_packaged.mp4"
    effect_layer = OUTPUT_DIR / f"{index:02d}_{task_id}_{slug}_effects.mov"
    remotion_packaged = OUTPUT_DIR / f"{index:02d}_{task_id}_{slug}_packaged_effects.mp4"
    final = OUTPUT_DIR / f"{index:02d}_{task_id}_{slug}_final.mp4"
    report = OUTPUT_DIR / f"{index:02d}_{task_id}_{slug}_report.txt"

    if final.exists() and not force:
        return final

    transcript = load_or_transcribe(raw_video, transcript_path)
    hook, units = build_spoken_units(item["text"])
    timed_units = assign_timings(units, transcript)
    video_duration = duration(raw_video)
    title_end = title_end_for_units(timed_units)
    pip_events, image_events, blocked_sentence_indexes, forced_effect_unit_indexes = build_visual_events(
        timed_units,
        video_duration,
        title_end,
    )
    manual_effect_indexes = forced_effect_indexes_for_texts(
        timed_units,
        item.get("force_effect_texts"),
        blocked_sentence_indexes,
    )
    forced_effect_unit_indexes = set(forced_effect_unit_indexes) | set(manual_effect_indexes)
    timed_units = mark_key_effect_units(timed_units, blocked_sentence_indexes, forced_effect_unit_indexes)
    timed_units = apply_forced_effect_indexes(timed_units, manual_effect_indexes)
    title_end = write_subtitles(
        item,
        timed_units,
        hook,
        video_duration,
        ass_path,
        srt_path,
        effects_path,
        pip_events,
        image_events,
    )
    render_packaged(raw_video, ass_path, packaged, pip_events)
    has_remotion_effects = bool(image_events) or any(unit.get("effect") for unit in timed_units)
    keyword_effect_starts = [unit["start"] for unit in timed_units if unit.get("effect")]
    source_for_tighten = packaged
    if USE_REMOTION_EFFECT_LAYER and has_remotion_effects:
        render_remotion_effects(effects_path, effect_layer)
        overlay_remotion_effects(packaged, effect_layer, remotion_packaged)
        source_for_tighten = remotion_packaged
    tighten_and_mix(source_for_tighten, final, report, title_end, keyword_effect_starts)
    return final


def main():
    global OUTPUT_DIR, STATE_PATH

    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-name", default=DEFAULT_BATCH_NAME)
    parser.add_argument("--create-only", action="store_true")
    parser.add_argument("--poll-interval", type=int, default=20)
    parser.add_argument("--timeout-minutes", type=int, default=45)
    parser.add_argument("--force-render", action="store_true")
    parser.add_argument("--only", action="append", help="Process only matching slug(s). Can be repeated.")
    parser.add_argument("--audit-captions", action="store_true", help="Print and validate caption line breaks without rendering.")
    args = parser.parse_args()

    batch_name = args.batch_name
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", batch_name):
        raise SystemExit(f"invalid batch name: {batch_name}")
    OUTPUT_DIR = ROOT / "outputs" / batch_name
    STATE_PATH = ROOT / "work" / f"{batch_name}_state.json"
    batch_started_at = time.time()

    if args.audit_captions:
        create_font_asset()
        ok = audit_caption_breaks(COPIES, only=args.only)
        raise SystemExit(0 if ok else 2)

    random.seed()
    load_env()
    token = get_token()
    create_logo_asset()
    create_font_asset()
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    assets = json.loads(ASSETS_PATH.read_text(encoding="utf-8"))
    chosen_assets = random.sample(assets, k=len(COPIES))
    state = load_state()

    only = set(args.only or [])
    for i, (copy_item, asset) in enumerate(zip(COPIES, chosen_assets), start=1):
        if only and copy_item["slug"] not in only:
            continue
        key = copy_item["slug"]
        entry = state["items"].setdefault(key, {})
        entry.setdefault("asset_file", asset["file"])
        entry.setdefault("person_id", asset["person_id"])
        entry.setdefault("audio_man_id", asset["audio_man_id"])
        if not entry.get("task_id"):
            create_started_at = time.time()
            task_id = create_video(token, asset, copy_item["text"])
            entry["task_id"] = task_id
            entry["created_at"] = int(time.time())
            entry["create_api_seconds"] = round(time.time() - create_started_at, 3)
            save_state(state)
            print(f"created {i}: {task_id} {key}", flush=True)
            time.sleep(4)

    if args.create_only:
        print(json.dumps(state, ensure_ascii=False, indent=2))
        return

    deadline = time.time() + args.timeout_minutes * 60
    while True:
        all_done = True
        for key, entry in state["items"].items():
            if only and key not in only:
                continue
            try:
                status = video_status(token, entry["task_id"])
            except RuntimeError as error:
                if not is_token_expired_error(error):
                    raise
                token = get_token()
                print(f"refreshed token for {key}", flush=True)
                continue
            entry["status"] = status.get("status")
            entry["progress"] = status.get("progress")
            entry["queue_status"] = status.get("queue_status")
            if status.get("video_url"):
                entry["video_url"] = status["video_url"]
                entry["preview_url"] = status.get("preview_url", "")
                entry["duration"] = status.get("duration", 0)
            if status.get("queue_status") != "completed" and status.get("status") != 30:
                all_done = False
            elif not entry.get("completed_at"):
                entry["completed_at"] = int(time.time())
        save_state(state)
        print("status " + " ".join(
            f"{k}:{v.get('queue_status')}/{v.get('progress')}" for k, v in state["items"].items()
        ), flush=True)
        if all_done:
            break
        if time.time() > deadline:
            raise SystemExit("timeout waiting for Chanjing jobs")
        time.sleep(args.poll_interval)

    finals = []
    for i, copy_item in enumerate(COPIES, start=1):
        if only and copy_item["slug"] not in only:
            continue
        entry = state["items"][copy_item["slug"]]
        raw_video = GENERATED_DIR / f"{entry['task_id']}_{copy_item['slug']}_raw.mp4"
        if not raw_video.exists():
            download(entry["video_url"], raw_video)
        process_started_at = time.time()
        final = process_item(i, copy_item, entry["task_id"], force=args.force_render)
        process_ended_at = time.time()
        entry["process_seconds"] = round(process_ended_at - process_started_at, 3)
        entry["processed_at"] = int(process_ended_at)
        entry["final_path"] = str(final)
        finals.append(final)
        save_state(state)
        print(f"final {i}: {final}", flush=True)

    timing_path, text_path = write_batch_timing(
        batch_name,
        batch_started_at,
        time.time(),
        state,
        only=only,
        exit_code=0,
    )
    print(f"timing: {text_path}", flush=True)
    print(f"timing_json: {timing_path}", flush=True)
    print(json.dumps([str(p) for p in finals], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
