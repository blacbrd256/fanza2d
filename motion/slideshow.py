"""サンプル画像 → 自動でめくれるスライドショー動画（MP4、音声なし）。

1枚ずつ全体を見せ、ゆっくり寄りながら少しだけ流す。画像の端は一切切らない
（サンプルは端まで文字が入っていることがあるため）。次の画像は読む向き（右→左）に
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


def canvas_size(images, style):
    """画面サイズを決める。tour は常に縦型（スマホで大きく映る）。gentle は画像の向きの多数派に合わせる。"""
    if style == 'tour':
        return 1080, 1350
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


def bar_band(W):
    """上部の進み具合バー用に空けておく帯の高さ。画像はこの帯の下にだけ置く。"""
    return int(W * 0.045)


class Slide:
    """1枚ぶんの見せ方。

    gentle: 少し引いた状態から、画像全体がちょうど収まる大きさまで寄る。端は一切切らない。
    tour:   まず全体を見せ、画面いっぱいまで寄ってから読む向きに流す（横長なら右→左、縦長なら上→下）。
            流している間は画面外の部分が出るが、最初の全体表示と流しで全部が映る。
            画像と画面の縦横比が近く、寄る余地が無いときは gentle と同じ動きになる。
    """
    ZOOM = 0.05

    def __init__(self, im, W, H, index, style):
        self.W, self.H = W, H
        self.bg = backdrop(im, W, H)
        self.top = bar_band(W)
        self.aw, self.ah = W, H - self.top  # 画像を置ける領域
        self.ih, self.iw = im.shape[:2]
        self.fit = min(self.aw / self.iw, self.ah / self.ih)
        fill = min(max(self.aw / self.iw, self.ah / self.ih), self.fit * 2.2)
        self.tour = style == 'tour' and fill >= self.fit * 1.2
        self.fill = fill if self.tour else self.fit
        self.wide = self.aw / self.iw < self.ah / self.ih  # 横にはみ出す＝横に流す
        s = self.fill
        self.big = cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_LANCZOS4 if s > 1 else cv2.INTER_AREA)
        if s > 1.25:  # 拡大でぼやける分を軽く締める
            blur = cv2.GaussianBlur(self.big, (0, 0), 1.2)
            self.big = cv2.addWeighted(self.big, 1.3, blur, -0.3, 0)

    def camera(self, t):
        """(倍率, 画面中央に置く画像上の位置 fx, fy) を返す。fx, fy は 0〜1。"""
        if not self.tour:
            return self.fit * (1 - self.ZOOM * (1 - t)), 0.5, 0.5
        # 0.00-0.16 全体を見せる / 0.16-0.32 寄る / 0.32-0.94 流す / 0.94-1.00 止める
        zoom_in = ease((t - 0.16) / 0.16)
        pan = ease((t - 0.32) / 0.62)
        scale = self.fit + (self.fill - self.fit) * zoom_in
        start, end = (1.0, 0.0) if self.wide else (0.0, 1.0)  # 横は右→左、縦は上→下
        pos = 0.5 + (start - 0.5) * zoom_in + (end - start) * pan
        return (scale, pos, 0.5) if self.wide else (scale, 0.5, pos)

    def frame(self, t, offset_x=0.0):
        """t: 0〜1（この画像の表示の進み具合）。offset_x: めくり中の横ずれ（px）。"""
        scale, fx, fy = self.camera(t)
        sw, sh = self.iw * scale, self.ih * scale

        def place(size, area, f):  # 画像が領域より大きければ端を越えて余白を出さない。小さければ中央
            if size <= area:
                return (area - size) / 2
            return min(0.0, max(area - size, area / 2 - f * size))

        x0 = place(sw, self.aw, fx)
        y0 = self.top + place(sh, self.ah, fy)
        z = scale / self.fill
        M = np.float32([[z, 0, x0 + offset_x], [0, z, y0]])
        out = self.bg.copy()
        cv2.warpAffine(self.big, M, (self.W, self.H), dst=out, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_TRANSPARENT)
        if y0 < self.top:  # 縦に流すとき、バーの帯に画像がかからないようにする
            out[:self.top] = self.bg[:self.top]
        return out


def progress_bar(frame, n, index, t):
    """上部の進み具合バー（画像の枚数ぶんの区切り）。"""
    W = frame.shape[1]
    h = max(5, int(W * 0.005))
    pad, gap, y = int(W * 0.03), int(W * 0.008), (bar_band(W) - h) // 2
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


def build(paths, title, circle, cta, seconds, max_seconds, style):
    images = [im for im in (cv2.imread(p) for p in paths) if im is not None]
    if not images:
        raise SystemExit('画像を読めませんでした')
    W, H = canvas_size(images, style)
    card_sec, turn = 2.6, int(0.42 * FPS)
    slides = [Slide(im, W, H, i, style) for i, im in enumerate(images)]
    n = len(slides)
    # 流す画像は、流す距離のぶん長く見せる
    secs = [seconds * (1.7 if s.tour else 1.0) for s in slides]
    k = min(1.0, (max_seconds - card_sec) / sum(secs))
    for i, s in enumerate(slides):
        hold = max(int(secs[i] * k * FPS), turn * 2)
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
    ap.add_argument('--seconds', type=float, default=3.2, help='1枚あたりの表示秒数（流す画像は1.7倍）')
    ap.add_argument('--style', choices=['tour', 'gentle'], default='tour')
    ap.add_argument('--max-seconds', type=float, default=60, help='動画全体の上限秒数')
    ap.add_argument('images', nargs='+')
    a = ap.parse_args()
    count, (w, h) = encode(build(a.images, a.title, a.circle, a.cta, a.seconds, a.max_seconds, a.style), a.out)
    print(f'{a.out}: {len(a.images)}枚, {w}x{h}, {count / FPS:.1f}秒, {os.path.getsize(a.out) / 1e6:.1f}MB')
