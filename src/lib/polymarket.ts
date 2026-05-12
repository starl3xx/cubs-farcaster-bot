const CLOB_BASE = "https://clob.polymarket.com";

// Cubs YES token IDs
const CUBS_TOKENS = {
  worldSeries: {
    tokenId: "11940406787186341071755148448116745833167346421729699368674725740151230699960",
    conditionId: "0xae0363bfe26b7de87f4526c47d5de9b324bab3d14690112bd89b34c9ed3552fc",
    eventSlug: "mlb-world-series-champion-2026",
    label: "World Series",
  },
  nlCentral: {
    tokenId: "114565230829601788755964312477837992956349279356180560516273901270134191853105",
    conditionId: "0x199f7cf57ee904becec07d6f3668ade524d66dfe8d6415c46a6c15258fe149df",
    eventSlug: "pro-baseball-2026-nl-central-champion",
    label: "NL Central",
  },
} as const;

export interface CubsOdds {
  worldSeries: number; // 0-1 decimal (e.g., 0.035 = 3.5%)
  nlCentral: number;
}

/**
 * Fetch current Cubs odds from Polymarket CLOB API.
 * Uses the midpoint endpoint (no auth required).
 */
export async function fetchCubsOdds(): Promise<CubsOdds> {
  const [wsRes, nlcRes] = await Promise.all([
    fetch(`${CLOB_BASE}/midpoint?token_id=${CUBS_TOKENS.worldSeries.tokenId}`),
    fetch(`${CLOB_BASE}/midpoint?token_id=${CUBS_TOKENS.nlCentral.tokenId}`),
  ]);

  if (!wsRes.ok) throw new Error(`CLOB WS midpoint error: ${wsRes.status}`);
  if (!nlcRes.ok) throw new Error(`CLOB NLC midpoint error: ${nlcRes.status}`);

  const wsData = await wsRes.json();
  const nlcData = await nlcRes.json();

  return {
    worldSeries: parseFloat(wsData.mid),
    nlCentral: parseFloat(nlcData.mid),
  };
}

/**
 * Format odds as a percentage string (e.g., 0.035 → "3.5%")
 */
function formatPct(value: number): string {
  const pct = value * 100;
  // Show one decimal for values under 10%, whole number otherwise
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

/**
 * Format a delta string (e.g., +1.2%, -0.5%, or "—" if no previous data)
 */
function formatDelta(current: number, previous: number | null): string {
  if (previous === null) return "";
  const delta = (current - previous) * 100;
  if (Math.abs(delta) < 0.05) return " (=)";
  const sign = delta > 0 ? "+" : "";
  const formatted = Math.abs(delta) < 1 ? delta.toFixed(1) : Math.round(delta).toString();
  return ` (${sign}${formatted}%)`;
}

/**
 * Build the Polymarket URL for a market, with optional referral code.
 */
function marketUrl(eventSlug: string): string {
  const ref = process.env.POLYMARKET_REFERRAL;
  const base = `https://polymarket.com/event/${eventSlug}`;
  return ref ? `${base}?ref=${ref}` : base;
}

export interface OddsCastData {
  text: string;
  embeds: string[];
}

/**
 * Format the weekly odds update cast.
 */
export function formatOddsCast(
  current: CubsOdds,
  previous: CubsOdds | null
): OddsCastData {
  const wsDelta = formatDelta(current.worldSeries, previous?.worldSeries ?? null);
  const nlcDelta = formatDelta(current.nlCentral, previous?.nlCentral ?? null);

  const lines = [
    "Cubs 2026 @polymarket odds update",
    "",
    `World Series: ${formatPct(current.worldSeries)}${wsDelta}`,
    `NL Central: ${formatPct(current.nlCentral)}${nlcDelta}`,
  ];

  // Include market URL as text (not embed — Polymarket embeds trigger a broken Frame)
  lines.push("", marketUrl(CUBS_TOKENS.worldSeries.eventSlug));

  const text = lines.join("\n");

  return { text, embeds: [] };
}
