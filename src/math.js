// ─── Poisson Core ─────────────────────────────────────────────────────────────

function poissonPMF(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0
  let logP = -lambda + k * Math.log(lambda)
  for (let i = 1; i <= k; i++) logP -= Math.log(i)
  return Math.exp(logP)
}

export function poissonOver(lambda, line) {
  const k = Math.ceil(line)
  let cumulative = 0
  for (let i = 0; i < k; i++) cumulative += poissonPMF(lambda, i)
  return Math.max(0, Math.min(1, 1 - cumulative))
}

export function probToAmerican(prob) {
  if (prob <= 0.01) return 9900
  if (prob >= 0.99) return -9900
  if (prob >= 0.5) return Math.round(-(prob / (1 - prob)) * 100)
  return Math.round(((1 - prob) / prob) * 100)
}

// ─── K Projection Model ───────────────────────────────────────────────────────
//
// Weighted blend of five independent signals:
//
//  1. STUFF SIGNAL (30%)
//     Best predictor of true strikeout talent, park/defense-independent.
//     Uses SwStr% (swing-and-miss) as primary, CSW% if available.
//     SwStr% → expected K% via league calibration: K% ≈ SwStr% × 1.85
//     Then K% × expected BF (from IP projection) = stuff-based K estimate
//
//  2. RECENT FORM — L5 ADJUSTED (25%)
//     Last 5 starts K/game, adjusted for opponent difficulty.
//     Each start's Ks scaled: adjustedK = rawK × (leagueAvgOppRank / oppRank)
//     LeagueAvgOppRank = 15 (midpoint of 1–30 scale)
//     Caps extreme adjustments at 1.4× to prevent overcorrection
//
//  3. SEASON RATE (20%)
//     K/9 converted to K per start via projected IP.
//     Most stable over large samples but slowest to update.
//
//  4. OPPONENT MATCHUP (15%)
//     Lineup K% vs pitcher's hand, adjusted for platoon composition.
//     vs leagueAvg (22%): multiplier = lineupKPct / 22
//     Then applied to the blended K rate from signals 1–3.
//     Further refined by platoon exposure: if pitcher is weaker vs LHB
//     and lineup has >5 LHB, apply a 3–6% reduction.
//
//  5. PARK & CONTEXT (10%)
//     Park K-factor (1.0 = neutral, >1.0 = K-friendly, <1.0 = K-suppressing)
//     Days rest factor: short rest (3 days) = 0.93×, normal = 1.0×
//     Umpire tendency if known: high-K umpires +4%, low-K umpires -4%
//
// Final blend: (stuff×0.30 + L5adj×0.25 + seasonRate×0.20) × matchupMult × parkFactor
//
// Confidence scoring:
//   HIGH:   IP >= 60, L5 opp rank variance < 8, matchup rank known
//   MEDIUM: IP 30–59, or high L5 variance, or uncertain platoon data
//   LOW:    IP < 30, first start back from injury, debut

export function projectK(data) {
  const {
    kPer9, kPct, swStrPct, cswPct,
    projectedIP,          // expected innings tonight
    last5,                // [{k, ip, oppKRank}]
    last10AvgK, last10AvgOppKRank,
    seasonIP,             // total IP on the season
    platoonVsR, platoonVsL, hand,
    opposing: {
      lineupKRankVsHand,  // 1=hardest, 30=easiest
      kPctVsHand,         // e.g. 22.4
      chaseRate,
      rhbCount, lhbCount,
    },
    parkKFactor = 1.0,    // 1.0 = neutral
    daysRest = 4,
    umpireKFactor = 1.0,  // 1.0 = neutral
    isFirstStartBack = false,
  } = data

  const LEAGUE_AVG_OPP_RANK = 15
  const LEAGUE_AVG_K_PCT = 22.0

  // ── Signal 1: Stuff (30%) ──────────────────────────────────────────────────
  // SwStr% is the most park/defense independent K predictor
  // Empirical: K% ≈ SwStr% × 1.85 (MLB calibration)
  const swStr = parseFloat(swStrPct) || 0
  const csw = parseFloat(cswPct) || 0
  // Use CSW if available (stronger signal), else SwStr only
  const stuffKPct = csw > 0
    ? (csw * 1.20)           // CSW → K% conversion
    : (swStr * 1.85)         // SwStr → K% conversion
  // Convert K% to K per start via projected BF (BF ≈ IP × 4.3 + outs/3)
  const projBF = (projectedIP || 6) * 4.3
  const stuffSignal = (stuffKPct / 100) * projBF

  // ── Signal 2: L5 Adjusted Form (25%) ──────────────────────────────────────
  let l5Signal = 0
  if (last5 && last5.length > 0) {
    const adjKs = last5.map(s => {
      const rawK = s.k || 0
      const rank = s.oppKRank || LEAGUE_AVG_OPP_RANK
      // Higher rank = easier lineup = scale down, lower rank = harder = scale up
      // Cap multiplier between 0.72 and 1.40 to prevent wild swings
      const mult = Math.min(1.40, Math.max(0.72, LEAGUE_AVG_OPP_RANK / rank))
      return rawK * mult
    })
    l5Signal = adjKs.reduce((a, b) => a + b, 0) / adjKs.length
  } else if (last10AvgK) {
    // Fall back to L10 if L5 not available
    const rankMult = Math.min(1.40, Math.max(0.72, LEAGUE_AVG_OPP_RANK / (last10AvgOppKRank || LEAGUE_AVG_OPP_RANK)))
    l5Signal = last10AvgK * rankMult
  }

  // ── Signal 3: Season K Rate (20%) ─────────────────────────────────────────
  const kPer9Val = parseFloat(kPer9) || 0
  const seasonSignal = kPer9Val * ((projectedIP || 6) / 9)

  // ── Blend signals 1–3 ─────────────────────────────────────────────────────
  const w1 = 0.30, w2 = 0.25, w3 = 0.20
  // If missing data, redistribute weights
  const hasStuff = stuffSignal > 0
  const hasL5 = l5Signal > 0
  const hasSeason = seasonSignal > 0
  let totalW = (hasStuff ? w1 : 0) + (hasL5 ? w2 : 0) + (hasSeason ? w3 : 0)
  if (totalW === 0) totalW = 1
  const blendedK = (
    (hasStuff ? stuffSignal * w1 : 0) +
    (hasL5 ? l5Signal * w2 : 0) +
    (hasSeason ? seasonSignal * w3 : 0)
  ) / totalW

  // ── Signal 4: Opponent Matchup (15%) ──────────────────────────────────────
  const lineupKPct = parseFloat(kPctVsHand) || LEAGUE_AVG_K_PCT
  // Base multiplier: how does this lineup K% compare to league average
  let matchupMult = lineupKPct / LEAGUE_AVG_K_PCT

  // Platoon adjustment: if pitcher has significant platoon split and lineup skews that way
  const lhbRatio = (lhbCount || 4) / ((rhbCount || 5) + (lhbCount || 4))
  if (hand === 'R' && platoonVsL && platoonVsR) {
    const kDiff = parseFloat(platoonVsR.kPct) - parseFloat(platoonVsL.kPct)
    if (kDiff > 5 && lhbRatio > 0.5) {
      // Significant RHP weakness vs LHB, lineup is LHB-heavy
      matchupMult *= (1 - (kDiff / 100) * lhbRatio * 0.6)
    }
  } else if (hand === 'L' && platoonVsR && platoonVsL) {
    const kDiff = parseFloat(platoonVsL.kPct) - parseFloat(platoonVsR.kPct)
    const rhbRatio = 1 - lhbRatio
    if (kDiff > 5 && rhbRatio > 0.5) {
      matchupMult *= (1 - (kDiff / 100) * rhbRatio * 0.6)
    }
  }

  // Chase rate bonus: above-average chase (>30%) gives small boost
  const chaseVal = parseFloat(chaseRate) || 28
  const chaseFactor = 1 + Math.max(-0.06, Math.min(0.06, (chaseVal - 28) / 100))

  // ── Signal 5: Park & Context (10%) ────────────────────────────────────────
  const restFactor = daysRest <= 3 ? 0.93 : 1.0
  const contextFactor = parkKFactor * restFactor * umpireKFactor

  // ── Final projection ──────────────────────────────────────────────────────
  // Remaining 25% weight distributed to matchup (15%) and context (10%)
  const finalK = blendedK * matchupMult * chaseFactor * contextFactor

  // ── Confidence scoring ─────────────────────────────────────────────────────
  const ip = parseFloat(seasonIP) || 0
  const l5Variance = last5 && last5.length >= 3
    ? Math.max(...last5.map(s => s.oppKRank || 15)) - Math.min(...last5.map(s => s.oppKRank || 15))
    : 20
  let confidence = 'high'
  if (isFirstStartBack || ip < 20) confidence = 'low'
  else if (ip < 50 || l5Variance > 15 || !swStrPct) confidence = 'medium'

  return {
    projectedK: Math.round(finalK * 10) / 10, // 1 decimal place
    confidence,
    breakdown: {
      stuffSignal: Math.round(stuffSignal * 10) / 10,
      l5Signal: Math.round(l5Signal * 10) / 10,
      seasonSignal: Math.round(seasonSignal * 10) / 10,
      matchupMult: Math.round(matchupMult * 100) / 100,
      contextFactor: Math.round(contextFactor * 100) / 100,
    }
  }
}

// ─── K Lines Builder ──────────────────────────────────────────────────────────
export function buildKLines(projectedK) {
  const base = Math.round(projectedK * 2) / 2
  const lines = []
  for (let offset = 2; offset >= -2; offset--) {
    const line = base + offset - 0.5
    if (line < 0.5) continue
    const overP = poissonOver(projectedK, line)
    const underP = 1 - overP
    lines.push({
      line,
      displayLine: line.toFixed(1),
      isProjected: offset === 0,
      overPct: Math.round(overP * 100),
      underPct: Math.round(underP * 100),
      overOdds: probToAmerican(overP),
      underOdds: probToAmerican(underP),
    })
  }
  return lines
}

// ─── Stat Line Builder ────────────────────────────────────────────────────────
export function buildStatLine(projected) {
  const line = Math.round(projected)
  const overP = poissonOver(projected, line - 0.5)
  const underP = 1 - overP
  return {
    line,
    overPct: Math.round(overP * 100),
    underPct: Math.round(underP * 100),
    overOdds: probToAmerican(overP),
    underOdds: probToAmerican(underP),
  }
}

// ─── Outlier Detection ────────────────────────────────────────────────────────
export function findOutliers(values) {
  if (values.length < 4) return []
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const iqr = q3 - q1
  return values.map((v, i) => ({
    index: i,
    value: v,
    isHigh: v > q3 + 1.5 * iqr,
    isLow: v < q1 - 1.5 * iqr,
  })).filter(o => o.isHigh || o.isLow)
}
