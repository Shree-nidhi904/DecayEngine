// A picture of parts of the page, made in the browser: each part is copied with its computed
// styles into an SVG <foreignObject>, drawn on a canvas and returned as a PNG data URL.
// Nothing leaves the device. Fonts that are not installed fall back to the system's.
// Rejects when the browser cannot draw it (the caller keeps a fallback).

export interface SnapshotOptions {
  /** Canvas background colour. */
  background: string;
  /** A line of text drawn above the parts. */
  title?: string;
  titleColor?: string;
  titleFont?: string;
  /** Space around the parts, in CSS pixels. Default 24. */
  padding?: number;
  /** Space between parts. Default 16. */
  gap?: number;
  /** Pixel ratio. Default 2. */
  scale?: number;
  /** Smaller text under the parts. */
  footer?: string;
  footerColor?: string;
  /** A frame colour: draws a warm light rising from the bottom, a double border and a rule under the title. */
  accent?: string;
}

/** Copies the computed style of `source` and its descendants onto `target` as inline styles. */
function inlineStyles(source: Element, target: Element): void {
  const style = getComputedStyle(source);
  let css = "";
  for (let i = 0; i < style.length; i++) {
    const name = style.item(i);
    css += `${name}:${style.getPropertyValue(name)};`;
  }
  target.setAttribute("style", css);
  // Animations would restart in the copy; the picture is a still.
  (target as HTMLElement).style.animation = "none";
  (target as HTMLElement).style.transition = "none";
  const from = source.children;
  const to = target.children;
  for (let i = 0; i < from.length && i < to.length; i++) inlineStyles(from[i]!, to[i]!);
}

function loadImage(href: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The picture could not be drawn."));
    image.src = href;
  });
}

async function drawPart(element: HTMLElement): Promise<{ image: HTMLImageElement; width: number; height: number }> {
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);
  const copy = element.cloneNode(true) as HTMLElement;
  inlineStyles(element, copy);
  copy.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  copy.style.margin = "0";
  copy.style.width = `${width}px`;
  copy.style.height = `${height}px`;
  copy.style.boxSizing = "border-box";
  const body = new XMLSerializer().serializeToString(copy);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${body}</foreignObject></svg>`;
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  return { image, width, height };
}

export async function snapshotElements(elements: readonly HTMLElement[], options: SnapshotOptions): Promise<string> {
  if (elements.length === 0) throw new Error("Nothing to draw.");
  const padding = options.padding ?? 24;
  const gap = options.gap ?? 16;
  const scale = options.scale ?? 2;
  const parts = [];
  for (const element of elements) parts.push(await drawPart(element));
  const titleH = options.title === undefined ? 0 : 68;
  const footerH = options.footer === undefined ? 0 : 36;
  const innerW = Math.max(...parts.map((p) => p.width));
  const width = innerW + padding * 2;
  const height = padding * 2 + titleH + parts.reduce((sum, p) => sum + p.height, 0) + gap * (parts.length - 1) + footerH;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("No canvas.");
  ctx.scale(scale, scale);
  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, width, height);
  const accent = options.accent;
  if (accent !== undefined) {
    const light = ctx.createRadialGradient(width / 2, height * 1.05, 10, width / 2, height * 1.05, Math.max(width, height) * 0.8);
    light.addColorStop(0, accent + "40");
    light.addColorStop(1, accent + "00");
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, width - 12, height - 12);
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    ctx.strokeRect(11, 11, width - 22, height - 22);
    ctx.globalAlpha = 1;
  }
  let y = padding;
  if (options.title !== undefined) {
    ctx.fillStyle = options.titleColor ?? "#fff";
    ctx.font = options.titleFont ?? "36px serif";
    ctx.textBaseline = "top";
    ctx.textAlign = accent === undefined ? "left" : "center";
    ctx.fillText(options.title, accent === undefined ? padding : width / 2, y);
    ctx.textAlign = "left";
    if (accent !== undefined) {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(width / 2 - 60, y + titleH - 10, 120, 2);
      ctx.globalAlpha = 1;
    }
    y += titleH;
  }
  for (const part of parts) {
    ctx.drawImage(part.image, padding + (innerW - part.width) / 2, y, part.width, part.height);
    y += part.height + gap;
  }
  if (options.footer !== undefined) {
    ctx.fillStyle = options.footerColor ?? "#aaa";
    ctx.font = "13px monospace";
    ctx.textBaseline = "top";
    ctx.textAlign = accent === undefined ? "left" : "center";
    ctx.fillText(options.footer, accent === undefined ? padding : width / 2, y - gap + 12);
  }
  return canvas.toDataURL("image/png");
}
