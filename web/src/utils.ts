// Helpers de formato compartidos por todas las páginas.

export const usd = (n: number) => "$" + (n ?? 0).toFixed(2);

export const compact = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n ?? 0);

export const pct = (n: number) => (n * 100).toFixed(0) + "%";
