"""サンプル画像 → 自動でめくれるスライドショー動画（MP4、音声なし）。

1枚ずつ全体を見せ、ゆっくり寄りながら少しだけ流す。次の画像は読む向き（右→左）に
合わせて左から入る。上部に進み具合のバー、最後に作品名と誘導文のカードを出す。
画面の向きは画像に合わせる（横長が多ければ横、縦長が多ければ縦）。

使い方:
  python3 motion/slideshow.py --out out.mp4 --title "作品名" --circle "サークル名" 001.jpg 002.jpg ...
"""
import argparse
import os
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FPS = 30
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_BLACK = os.path.join(HERE, 'fonts/ZenKakuGothicNew-Black.ttf')
FONT_BOLD = os.path.join(HERE, 'fonts/ZenKakuGothicNew-Bold.ttf')
ACCENT = (44, 69, 224)  # BGR


def ease(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def canvas_size(images):
    """画像の向きの多数派に合わせて画面サイズを決める。"""
    ratios = sorted(im.shape[1] / im.shape[0] for im in images)
    r = ratios[len(ratios) // 2]
    if r >= 1.6:
        return 1920, 1080
    if r >= 1.15:
        return 1440, 1080
    if r >= 0.9:
        return 1080, 1080
    return 1080, 1350


def backdrop(im, W, H):
    """画像をぼかして暗くした背景（画面と縦横比が合わない画像の余白を埋める）。"""
    s = max(W / im.shape[1], H / im.shape[0])
    big = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    y, x = (big.shape[0] - H) // 2, (big.shape[1] - W) // 2
    bg = cv2.GaussianBlur(big[y:y + H, x:x + W], (0, 0), 30)
    return (bg.astype(np.float32) * 0.3 + 8).clip(0, 255).astype(np.uint8)


class Slide:
    ZOOM = 0.06  # 表示中に寄る量

    def __init__(self, im, W, H, index):
        self.W, self.H = W, H
        self.bg = backdrop(im, W, H)
        fit = min(W / im.shape[1], H / im.shape[0])
        s = fit * (1 + self.ZOOM)
        self.big = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_LANCZOS4 if s > 1 else cv2.INTER_AREA)
        if s > 1.25:  # 拡大でぼやける分を軽く締める
            blur = cv2.GaussianBlur(self.big, (0, 0), 1.2)
            self.big = cv2.addWeighted(self.big, 1.3, blur, -0.3, 0)
        # 寄りながら流す向きを1枚ごとに変える
        self.drift = [(-1, -0.6), (1, 0.6), (-1, 0.6), (1, -0.6)][index % 4]

    def frame(self, t, offset_x=0.0):
        """t: 0〜1（この画像の表示の進み具合）。offset_x: めくり中の横ずれ（px）。"""
        W, H = self.W, self.H
        z = (1 + self.ZOOM * t) / (1 + self.ZOOM)
        bh, bw = self.big.shape[:2]
        sw, sh = bw * z, bh * z
        # はみ出した分の範囲内でだけ流す（画像の端より外は見せない）
        dx = max(0.0, sw - W) / 2 * self.drift[0] * t
        dy = max(0.0, sh - H) / 2 * self.drift[1] * t
        M = np.float32([[z, 0, (W - sw) / 2 + dx + offset_x], [0, z, (H - sh) / 2 + dy]])
        out = self.bg.copy()
        cv2.warpAffine(self.big, M, (W, H), dst=out, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_TRANSPARENT)
        return out


def progress_bar(frame, n, index, t):
    """上部の進み具合バー（画像の枚数ぶんの区切り）。"""
    W = frame.shape[1]
    pad, gap, h, y = int(W * 0.03), int(W * 0.008), max(5, int(W * 0.005)), int(W * 0.022)
    seg = (W - pad * 2 - gap * (n - 1)) / n
    ov = frame.copy()
    for i in range(n):
        x0 = int(pad + i * (seg + gap))
        x1 = int(x0 + seg)
        cv2.rectangle(ov, (x0, y), (x1, y + h), (90, 90, 90), -1)
        fill = 1.0 if i < index else (t if i == index else 0.0)
        if fill > 0:
            cv2.rectangle(ov, (x0, y), (int(x0 + seg * fill), y + h), (255, 255, 255), -1)
    cv2.addWeighted(ov, 0.85, frame, 0.15, 0, dst=frame)


def wrap(draw, text, font, max_w):
    """幅で折り返す。行頭に閉じ括弧や句読点が来ないようにする。"""
    lines, cur = [], ''
    for ch in text:
        if draw.textlength(cur + ch, font=font) > max_w and cur and ch not in '）」』】、。！？…ー～)]':
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines


def end_card(bg, title, circle, cta, count):
    H, W = bg.shape[:2]
    u = min(W, H) / 1080
    im = Image.fromarray(cv2.cvtColor((bg.astype(np.float32) * 0.5).astype(np.uint8), cv2.COLOR_BGR2RGB))
    d = ImageDraw.Draw(im)
    blocks = []  # (行, フォント, 色, 行送り)
    if circle:
        blocks.append(([circle], ImageFont.truetype(FONT_BOLD, int(40 * u)), (255, 196, 180), 1.9))
    if title:
        size = int(72 * u)
        while True:
            font = ImageFont.truetype(FONT_BLACK, size)
            lines = wrap(d, title, font, W - 200 * u)
            if len(lines) <= 3 or size <= 34 * u:
                break
            size -= int(6 * u) or 1
        if len(lines) > 3:
            lines = lines[:3]
            lines[2] = lines[2][:-1] + '…'
        blocks.append((lines, font, (255, 255, 255), 1.38))
    note = ImageFont.truetype(FONT_BOLD, int(34 * u))
    blocks.append(([''], ImageFont.truetype(FONT_BOLD, int(22 * u)), (0, 0, 0), 1.0))  # 題名との間隔
    blocks.append(([f'サンプル {count} 枚はここまで'], note, (205, 205, 205), 1.6))
    cta_font = ImageFont.truetype(FONT_BLACK, int(52 * u))
    btn_h = int(112 * u)
    total = sum(len(ls) * f.size * lh for ls, f, _, lh in blocks) + 50 * u + btn_h
    y = (H - total) / 2
    for lines, font, color, lh in blocks:
        for ln in lines:
            d.text((W / 2, y), ln, font=font, fill=color, anchor='ma')
            y += font.size * lh
    y += 50 * u
    tw = d.textlength(cta, font=cta_font)
    d.rounded_rectangle((W / 2 - tw / 2 - 56 * u, y, W / 2 + tw / 2 + 56 * u, y + btn_h), radius=btn_h / 2, fill=(224, 69, 44))
    d.text((W / 2, y + btn_h / 2), cta, font=cta_font, fill=(255, 255, 255), anchor='mm')
    return cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)


def build(paths, title, circle, cta, seconds, max_seconds):
    images = [im for im in (cv2.imread(p) for p in paths) if im is not None]
    if not images:
        raise SystemExit('画像を読めませんでした')
    W, H = canvas_size(images)
    card_sec, turn = 2.6, int(0.42 * FPS)
    seconds = min(seconds, (max_seconds - card_sec) / len(images))
    hold = max(int(seconds * FPS), turn * 2)
    slides = [Slide(im, W, H, i) for i, im in enumerate(images)]
    n = len(slides)
    for i, s in enumerate(slides):
        for f in range(hold):
            t = f / hold
            if i > 0 and f < turn:  # めくり: 前の画像が右へ出て、次の画像が左から入る
                e = ease((f + 1) / (turn + 1))
                prev = slides[i - 1].frame(1.0, offset_x=W * e)
                cur = s.frame(t, offset_x=-W * (1 - e))
                frame = np.where(np.arange(W)[None, :, None] < W * e, cur, prev)
            else:
                frame = s.frame(t)
            progress_bar(frame, n, i, t)
            yield frame
    last = slides[-1].frame(1.0)
    card = end_card(slides[-1].bg, title, circle, cta, n)
    for f in range(int(card_sec * FPS)):
        a = ease((f + 1) / 12)
        yield cv2.addWeighted(last, 1 - a, card, a, 0)


def encode(frames, out):
    p, count = None, 0
    for f in frames:
        if p is None:
            h, w = f.shape[:2]
            p = subprocess.Popen(
                ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', str(FPS), '-i', '-',
                 '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
                stdin=subprocess.PIPE)
        p.stdin.write(np.ascontiguousarray(f).tobytes())
        count += 1
    p.stdin.close()
    if p.wait() != 0:
        raise SystemExit('ffmpeg が失敗しました')
    return count, (w, h)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--title', default='')
    ap.add_argument('--circle', default='')
    ap.add_argument('--cta', default='続きは商品ページで')
    ap.add_argument('--seconds', type=float, default=3.2, help='1枚あたりの表示秒数')
    ap.add_argument('--max-seconds', type=float, default=60, help='動画全体の上限秒数')
    ap.add_argument('images', nargs='+')
    a = ap.parse_args()
    count, (w, h) = encode(build(a.images, a.title, a.circle, a.cta, a.seconds, a.max_seconds), a.out)
    print(f'{a.out}: {len(a.images)}枚, {w}x{h}, {count / FPS:.1f}秒, {os.path.getsize(a.out) / 1e6:.1f}MB')
