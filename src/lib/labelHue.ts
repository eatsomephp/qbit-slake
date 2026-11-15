const hueCache = new Map<string, number>();

export function labelHue(label: string): number {
  let hue = hueCache.get(label);
  if (hue === undefined) {
    let hash = 2166136261;
    for (let i = 0; i < label.length; i++) hash = Math.imul(hash ^ label.charCodeAt(i), 16777619);
    hue = (hash >>> 0) % 360;
    hueCache.set(label, hue);
  }
  return hue;
}
