"""サンプルページ画像 → コマ送りの縦型動画（MP4）。

各コマを読む順に1枚ずつ見せ、ゆっくり寄る／長いコマは読む向きにパンする。
最後に作品名と誘導文のカードを出す。音声なし。

使い方:
  python3 motion/render.py --out out.mp4 --title "作品名" --circle "サークル名" page1.jpg page2.jpg ...
"""
import argparse
import os
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from panels import detect_panels

W, H, FPS = 1080, 1350, 30
MARGIN = 56
FADE = 7  # コマ切り替えのフレーム数
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_BLACK = os.path.join(HERE, 'fonts/ZenKakuGothicNew-Black.ttf')
FONT_BOLD = os.path.join(HERE, 'fonts/ZenKakuGothicNew-Bold.ttf')


def ease(t):
    return t * t * (3 - 2 * t)


def background(page):
    """ページをぼかして暗くした背景。"""
    s = max(W / page.shape[1], H / page.shape[0])
    big = cv2.resize(page, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    y, x = (big.shape[0] - H) // 2, (big.shape[1] - W) // 2
    bg = cv2.GaussianBlur(big[y:y + H, x:x + W], (0, 0), 28)
    return (bg.astype(np.float32) * 0.28 + 10).clip(0, 255).astype(np.uint8)


def upscale(panel, scale):
    out = cv2.resize(panel, None, fx=scale, fy=scale, interpolation=cv2.INTER_LANCZOS4 if scale > 1 else cv2.INTER_AREA)
    if scale > 1.2:  # 拡大でぼやける分を軽く締める
        blur = cv2.GaussianBlur(out, (0, 0), 1.2)
        out = cv2.addWeighted(out, 1.35, blur, -0.35, 0)
    return out


def shot_frames(panel, bg, seconds):
    """1コマぶんのフレーム列を返す。"""
    ph, pw = panel.shape[:2]
    aw, ah = W - MARGIN * 2, H - MARGIN * 2
    fit = min(aw / pw, ah / ph)
    # 枠に対して極端に細長いコマは、はみ出すまで拡大して読む向きにパンする
    cover = min(max(aw / pw, ah / ph), fit * 1.7)
    pan = cover > fit * 1.25
    base = cover if pan else fit
    big = upscale(panel, base * 1.08)
    bh, bw = big.shape[:2]
    n = max(int(seconds * FPS), FADE + 4)
    frames = []
    for i in range(n):
        t = i / (n - 1)
        z = (1.0 + 0.06 * t) / 1.08  # ゆっくり寄る
        sw, sh = bw * z, bh * z
        if pan and sw > aw:  # 横長: 右→左
            cx = MARGIN + (aw - sw) * (1 - ease(t)) + sw / 2
        else:
            cx = W / 2
        if pan and sh > ah:  # 縦長: 上→下
            cy = MARGIN + sh / 2 - (sh - ah) * ease(t)
        else:
            cy = H / 2
        M = np.float32([[z, 0, cx - sw / 2], [0, z, cy - sh / 2]])
        frame = bg.copy()
        # 影
        x0, y0, x1, y1 = int(cx - sw / 2), int(cy - sh / 2), int(cx + sw / 2), int(cy + sh / 2)
        cv2.rectangle(frame, (x0 + 6, y0 + 10), (x1 + 6, y1 + 10), (0, 0, 0), -1)
        cv2.warpAffine(big, M, (W, H), dst=frame, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_TRANSPARENT)
        frames.append(frame)
    return frames


def fit_text(draw, text, font_path, size, max_w, max_lines):
    """幅に収まるよう折り返し、収まらなければ文字を小さくする。"""
    while size > 28:
        font = ImageFont.truetype(font_path, size)
        lines, cur = [], ''
        for ch in text:
            if draw.textlength(cur + ch, font=font) > max_w:
                lines.append(cur)
                cur = ch
            else:
                cur += ch
        lines.append(cur)
        if len(lines) <= max_lines:
            return font, lines
        size -= 6
    return font, lines[:max_lines - 1] + [lines[max_lines - 1][:-1] + '…']


def end_card(bg, title, circle, cta):
    im = Image.fromarray(cv2.cvtColor((bg.astype(np.float32) * 0.55).astype(np.uint8), cv2.COLOR_BGR2RGB))
    d = ImageDraw.Draw(im)
    y = 420
    if circle:
        f = ImageFont.truetype(FONT_BOLD, 40)
        d.text((W / 2, y), circle, font=f, fill=(255, 190, 170), anchor='ma')
        y += 80
    font, lines = fit_text(d, title, FONT_BLACK, 76, W - 160, 4)
    for ln in lines:
        d.text((W / 2, y), ln, font=font, fill=(255, 255, 255), anchor='ma')
        y += int(font.size * 1.35)
    y += 60
    f = ImageFont.truetype(FONT_BLACK, 50)
    tw = d.textlength(cta, font=f)
    d.rounded_rectangle((W / 2 - tw / 2 - 48, y, W / 2 + tw / 2 + 48, y + 108), radius=54, fill=(224, 69, 44))
    d.text((W / 2, y + 54), cta, font=f, fill=(255, 255, 255), anchor='mm')
    return cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)


def build(pages, title, circle, cta, max_seconds):
    shots = []  # (panel画像, 背景, 面積比)
    for path in pages:
        page = cv2.imread(path)
        if page is None:
            continue
        bg = background(page)
        area = page.shape[0] * page.shape[1]
        for x0, y0, x1, y1 in detect_panels(page):
            shots.append((page[y0:y1, x0:x1], bg, (x1 - x0) * (y1 - y0) / area))
    if not shots:
        raise SystemExit('ページ画像を読めませんでした')
    secs = [1.3 + 2.2 * (a ** 0.5) for _, _, a in shots]
    budget = max_seconds - 2.2
    while sum(secs) > budget and len(shots) > 3:  # 長すぎるなら後ろのコマから削る
        shots.pop()
        secs.pop()
    k = min(1.0, budget / sum(secs))
    frames, prev = [], None
    for (panel, bg, _), s in zip(shots, secs):
        fs = shot_frames(panel, bg, max(1.0, s * k))
        if prev is not None:
            for i in range(FADE):
                a = (i + 1) / (FADE + 1)
                fs[i] = cv2.addWeighted(prev, 1 - a, fs[i], a, 0)
        frames += fs
        prev = fs[-1]
    card = end_card(shots[-1][1], title, circle, cta)
    for i in range(int(2.2 * FPS)):
        a = min(1.0, (i + 1) / 10)
        frames.append(cv2.addWeighted(prev, 1 - a, card, a, 0))
    return frames, len(shots)


def encode(frames, out):
    p = subprocess.Popen(
        ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
        stdin=subprocess.PIPE)
    for f in frames:
        p.stdin.write(f.tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise SystemExit('ffmpeg が失敗しました')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--title', default='')
    ap.add_argument('--circle', default='')
    ap.add_argument('--cta', default='続きは商品ページで')
    ap.add_argument('--max-seconds', type=float, default=28)
    ap.add_argument('pages', nargs='+')
    a = ap.parse_args()
    frames, n = build(a.pages, a.title, a.circle, a.cta, a.max_seconds)
    encode(frames, a.out)
    print(f'{a.out}: {n}コマ, {len(frames) / FPS:.1f}秒, {os.path.getsize(a.out) / 1e6:.1f}MB')
