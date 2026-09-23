type RGB = { r: number; g: number; b: number };

function rgbToHsl({ r, g, b }: RGB) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const hn = h / 360;
  const sn = s / 100;
  const ln = l / 100;
  let r: number;
  let g: number;
  let b: number;

  if (sn === 0) {
    r = g = b = ln;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = hue2rgb(p, q, hn + 1 / 3);
    g = hue2rgb(p, q, hn);
    b = hue2rgb(p, q, hn - 1 / 3);
  }

  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

export type ThemeAccent = {
  accent: string;
  accentSoft: string;
  gradientTop: string;
  gradientBottom: string;
};

const FALLBACK_THEME: ThemeAccent = {
  accent: "rgb(30, 215, 96)",
  accentSoft: "rgba(30, 215, 96, 0.24)",
  gradientTop: "rgba(30, 215, 96, 0.32)",
  gradientBottom: "rgba(18, 18, 18, 0.94)",
};

export function extractThemeFromImage(imageUrl: string): Promise<ThemeAccent> {
  return new Promise((resolve) => {
    if (!imageUrl || typeof window === "undefined") {
      resolve(FALLBACK_THEME);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    let settled = false;

    const finish = (theme: ThemeAccent) => {
      if (settled) return;
      settled = true;
      resolve(theme);
    };

    const timer = window.setTimeout(() => finish(FALLBACK_THEME), 4000);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        const size = 40;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          finish(FALLBACK_THEME);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        let bestHue = 0;
        let bestWeight = -1;
        let bestS = 60;
        let bestL = 50;

        const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue;
          const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
          const existing = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
          existing.count += 1;
          existing.r += r;
          existing.g += g;
          existing.b += b;
          buckets.set(key, existing);
        }

        buckets.forEach((bucket) => {
          const r = bucket.r / bucket.count;
          const g = bucket.g / bucket.count;
          const b = bucket.b / bucket.count;
          const { h, s, l } = rgbToHsl({ r, g, b });
          if (s < 18 || l < 12 || l > 90) return;
          const weight = s * (1 - Math.abs(l - 55) / 55) * Math.log(bucket.count + 1);
          if (weight > bestWeight) {
            bestWeight = weight;
            bestHue = h;
            bestS = Math.max(45, Math.min(85, s));
            bestL = Math.max(40, Math.min(60, l));
          }
        });

        if (bestWeight < 0) {
          finish(FALLBACK_THEME);
          return;
        }

        const accentRgb = hslToRgb(bestHue, bestS, bestL);
        const accentSoftRgb = hslToRgb(bestHue, bestS, Math.min(75, bestL + 16));
        const gradientTopRgb = hslToRgb(bestHue, bestS, Math.max(28, bestL - 12));

        finish({
          accent: `rgb(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b})`,
          accentSoft: `rgba(${accentSoftRgb.r}, ${accentSoftRgb.g}, ${accentSoftRgb.b}, 0.28)`,
          gradientTop: `rgba(${gradientTopRgb.r}, ${gradientTopRgb.g}, ${gradientTopRgb.b}, 0.55)`,
          gradientBottom: "rgba(18, 18, 18, 0.94)",
        });
      } catch {
        finish(FALLBACK_THEME);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      finish(FALLBACK_THEME);
    };

    img.src = imageUrl;
  });
}
