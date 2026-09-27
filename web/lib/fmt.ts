export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const usd = (x: number, d = 3) => `$${x.toFixed(d)}`;
export const int = (x: number) => Math.round(x).toLocaleString("en-US");
