"""漫画ページからコマを切り出し、読む順（右→左、上→下）に並べる。

白（または黒）の余白帯でページを縦横に再帰分割する。余白が斜め・絵が枠をはみ出すなどで
分割できない領域は、ひとつの大きなコマとして扱う（誤って細切れにするより安全なため）。
"""
import cv2
import numpy as np


def _bands(is_gutter_line, min_len):
    """True が min_len 以上続く区間 [(start, end), ...] を返す。"""
    out, start = [], None
    for i, v in enumerate(is_gutter_line):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    if start is not None and len(is_gutter_line) - start >= min_len:
        out.append((start, len(is_gutter_line)))
    return out


def _thin_lines(dark_frac, max_thick):
    """枠線だけで仕切られたコマ用: ほぼ全長が黒い、細い線の位置を返す。"""
    out = []
    for a, b in _bands(dark_frac >= 0.9, 1):
        if b - a <= max_thick:
            lo, hi = max(0, a - 3 * max_thick), min(len(dark_frac), b + 3 * max_thick)
            around = np.concatenate([dark_frac[lo:a], dark_frac[b:hi]])
            if len(around) and around.mean() < 0.6:  # 周囲まで真っ黒ならベタ塗りであって枠線ではない
                out.append((a, b))
    return out


def _split(mask, dark, x0, y0, x1, y1, min_gap, min_size, depth=0):
    """mask: 余白=1、dark: 黒=1 の2値画像。領域を余白帯と枠線で分割し、読む順のコマ矩形リストを返す。"""
    sub = mask[y0:y1, x0:x1]
    h, w = sub.shape
    if h < min_size or w < min_size or depth > 6:
        return [(x0, y0, x1, y1)]
    # 余白帯での分割を優先し、無ければ枠線での分割。各々、上下に分ける → 左右に分ける の順
    for use_lines in (False, True):
        for axis in (1, 0):
            size = h if axis == 1 else w
            if use_lines:
                bands = _thin_lines(dark[y0:y1, x0:x1].mean(axis=axis), max(2, min_gap * 2))
            else:
                bands = _bands(sub.mean(axis=axis) >= 0.96, min_gap)
            cuts = [(a + b) // 2 for a, b in bands if a > min_size // 2 and b < size - min_size // 2]
            if not cuts:
                continue
            edges = [0] + cuts + [size]
            parts = []
            for a, b in zip(edges[:-1], edges[1:]):
                if b - a < min_size // 2:
                    continue
                if axis == 1:
                    parts.append(_split(mask, dark, x0, y0 + a, x1, y0 + b, min_gap, min_size, depth + 1))
                else:
                    parts.append(_split(mask, dark, x0 + a, y0, x0 + b, y1, min_gap, min_size, depth + 1))
            if axis == 0:
                parts.reverse()  # 左右に並ぶコマは右から読む
            if len(parts) > 1:
                return [r for p in parts for r in p]
    return [(x0, y0, x1, y1)]


def _trim(mask, r):
    x0, y0, x1, y1 = r
    ink = 1 - mask[y0:y1, x0:x1]
    ys = np.where(ink.mean(axis=1) > 0.004)[0]
    xs = np.where(ink.mean(axis=0) > 0.004)[0]
    if len(ys) == 0 or len(xs) == 0:
        return None
    return (x0 + xs[0], y0 + ys[0], x0 + xs[-1] + 1, y0 + ys[-1] + 1)


def detect_panels(img):
    """BGR画像 → [(x0, y0, x1, y1), ...]（読む順）。"""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    H, W = gray.shape
    best = None
    for gutter in ('white', 'black'):
        mask = (gray > 215).astype(np.uint8) if gutter == 'white' else (gray < 30).astype(np.uint8)
        dark = (gray < 90).astype(np.uint8) if gutter == 'white' else (gray > 200).astype(np.uint8)
        rects = _split(mask, dark, 0, 0, W, H, max(2, int(min(H, W) * 0.0035)), int(min(H, W) * 0.12))
        rects = [t for t in (_trim(mask, r) for r in rects) if t]
        rects = [r for r in rects if (r[2] - r[0]) * (r[3] - r[1]) >= 0.03 * H * W and min(r[2] - r[0], r[3] - r[1]) >= 0.08 * min(H, W)]
        if best is None or len(rects) > len(best):
            best = rects
    if not best:
        best = [(0, 0, W, H)]
    return best


if __name__ == '__main__':
    import sys
    for path in sys.argv[2:]:
        im = cv2.imread(path)
        rects = detect_panels(im)
        for i, (x0, y0, x1, y1) in enumerate(rects):
            cv2.rectangle(im, (x0, y0), (x1, y1), (40, 40, 230), 4)
            cv2.putText(im, str(i + 1), (x0 + 10, y0 + 46), cv2.FONT_HERSHEY_SIMPLEX, 1.6, (40, 40, 230), 4)
        out = f"{sys.argv[1]}/{path.rsplit('/', 1)[-1]}"
        cv2.imwrite(out, im)
        print(path.rsplit('/', 1)[-1], len(rects), 'panels')
