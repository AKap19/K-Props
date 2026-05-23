import { useState, useEffect, useCallback } from 'react'
import { callClaude } from './claude.js'
import { buildKLines, buildStatLine, findOutliers, projectK } from './math.js'
import { gamesPrompt, pitcherPrompt } from './prompts.js'

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getDateStr(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
function getShortDate(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ─── Style helpers ────────────────────────────────────────────────────────────
const mono = "'DM Mono', monospace"
const display = "'Bebas Neue', sans-serif"

function gc(g) {
  const n = parseInt(g)
  if (isNaN(n)) return '#4a6080'
  if (n >= 8) return '#00e5a0'
  if (n >= 6) return '#7b61ff'
  if (n >= 4) return '#f5c842'
  return '#ff4560'
}
function gl(g) {
  const n = parseInt(g)
  if (isNaN(n)) return '—'
  if (n >= 9) return 'ELITE'
  if (n >= 7) return 'STRONG'
  if (n >= 5) return 'LEAN'
  return 'PASS'
}
function oddsColor(o) {
  if (!o) return '#5a7090'
  return o < 0 ? '#f5c842' : '#00e5a0'
}

// ─── Small components ─────────────────────────────────────────────────────────
function Spinner({ small }) {
  return <div style={{ display: 'inline-block', width: small ? 13 : 22, height: small ? 13 : 22, border: '2px solid #1e2d42', borderTopColor: '#7b61ff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
}

function OddsCell({ pct, odds }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: '#c0d4f0', fontFamily: mono }}>{pct}%</div>
      <div style={{ fontSize: 11, color: oddsColor(odds), fontFamily: mono }}>{odds > 0 ? '+' : ''}{odds}</div>
    </div>
  )
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 9, color: '#2a3a50', fontFamily: mono, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6, marginTop: 14 }}>{children}</div>
}

// ─── Pitcher Card ─────────────────────────────────────────────────────────────
function PitcherCard({ name, hand, data, loading, side }) {
  const [showLineup, setShowLineup] = useState(false)

  if (!data && !loading) return (
    <div style={{ background: '#080f1a', border: '1px solid #111d2e', borderRadius: 16, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 9, color: '#2a3a50', fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{side}</div>
      <div style={{ fontSize: 15, color: '#2a3a50', fontFamily: display, marginTop: 4 }}>{name || 'TBD'}</div>
    </div>
  )

  if (loading) return (
    <div style={{ background: '#080f1a', border: '1px solid #111d2e', borderRadius: 16, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 9, color: '#2a3a50', fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{side}</div>
      <div style={{ fontSize: 15, color: '#6080a0', fontFamily: display, marginBottom: 10 }}>{name || 'TBD'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Spinner small /><span style={{ fontSize: 11, color: '#2a3a50', fontFamily: mono }}>Analyzing matchup…</span></div>
    </div>
  )

  const d = data

  // ── Run the proper weighted projection model ──────────────────────────────
  // Claude provides all raw data inputs; math.js runs the actual calculation
  const modelResult = projectK({
    kPer9: d.kPer9,
    kPct: d.kPct,
    swStrPct: d.swStrPct,
    cswPct: d.cswPct,
    projectedIP: d.projectedIP || 6,
    last5: d.last5,
    last10AvgK: d.last10AvgK,
    last10AvgOppKRank: d.last10AvgOppKRank,
    seasonIP: d.seasonIP,
    platoonVsR: d.platoonVsR,
    platoonVsL: d.platoonVsL,
    hand: d.hand,
    opposing: d.opposing || {},
    parkKFactor: d.parkKFactor || 1.0,
    daysRest: d.daysRest || 4,
    umpireKFactor: d.umpireKFactor || 1.0,
    isFirstStartBack: d.isFirstStartBack || false,
  })
  const projectedK = modelResult.projectedK
  const modelConfidence = modelResult.confidence
  const modelBreakdown = modelResult.breakdown

  const kLines = buildKLines(projectedK)
  const projLine = kLines.find(l => l.isProjected)
  const gradeVal = projLine ? (projLine.overPct >= 55 ? 8 : projLine.overPct >= 50 ? 7 : projLine.overPct >= 45 ? 6 : projLine.overPct >= 40 ? 5 : 4) : 5
  const color = gc(gradeVal)

  // Stat lines
  const pitchLine = buildStatLine(d.projectedPitches, d.projectedPitches)
  const outsLine = buildStatLine(d.projectedOuts, d.projectedOuts)
  const erLine = buildStatLine(d.projectedER, d.projectedER)
  const hLine = buildStatLine(d.projectedH, d.projectedH)
  const bbLine = buildStatLine(d.projectedBB, d.projectedBB)

  // Last 5 outlier detection
  const l5Ks = (d.last5 || []).map(s => s.k)
  const l5Ranks = (d.last5 || []).map(s => s.oppKRank)
  const kOutliers = findOutliers(l5Ks)
  const rankOutliers = findOutliers(l5Ranks)

  const l5Avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : '—'
  const l5 = d.last5 || []
  const l5IPs = l5.map(s => parseFloat(s.ip))

  // Lineup totals
  const lineup = d.opposing?.lineup || []
  const lineupTotalK = lineup.reduce((a, b) => a + (b.projK || 0), 0).toFixed(2)
  const lineupTotalH = lineup.reduce((a, b) => a + (b.projH || 0), 0).toFixed(2)
  const lineupTotalBB = lineup.reduce((a, b) => a + (b.projBB || 0), 0).toFixed(2)
  const lineupTotalTB = lineup.reduce((a, b) => a + (b.projTB || 0), 0).toFixed(2)

  const tougherThanAvg = d.opposing?.lineupKRankVsHand && d.last5?.length
    ? d.opposing.lineupKRankVsHand < parseFloat(l5Avg(l5Ranks))
    : null

  const lean = projLine?.overPct > 52 ? 'OVER' : projLine?.overPct < 48 ? 'UNDER' : 'NEUTRAL'
  const leanColor = lean === 'OVER' ? '#00e5a0' : lean === 'UNDER' ? '#ff4560' : '#8899bb'

  return (
    <div style={{ background: '#080f1a', border: `1px solid ${color}33`, borderRadius: 16, padding: 14, marginBottom: 12, animation: 'fadeUp 0.3s ease' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: '#2a3a50', fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{side}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#d0e4ff', fontFamily: display, letterSpacing: '0.05em', lineHeight: 1 }}>{d.name}</div>
          <div style={{ fontSize: 10, color: '#3a5070', fontFamily: mono, marginTop: 2 }}>{d.hand}HP · ERA {d.era} · K/9 {d.kPer9} · K% {d.kPct}% · SwStr% {d.swStrPct}% · WHIP {d.whip}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: `${color}18`, border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 800, color, fontFamily: display }}>{gradeVal}</span>
          </div>
          <div style={{ fontSize: 9, color: color, fontFamily: mono, letterSpacing: '0.08em' }}>{gl(gradeVal)}</div>
          <div style={{ padding: '2px 8px', borderRadius: 7, fontSize: 10, fontFamily: mono, fontWeight: 700, background: `${leanColor}11`, border: `1px solid ${leanColor}33`, color: leanColor }}>{lean}</div>
        </div>
      </div>

      {/* Platoon */}
      <div style={{ background: '#ffffff05', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
        <SectionLabel>Platoon Splits</SectionLabel>
        <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
          {[['vs RHB', d.platoonVsR], ['vs LHB', d.platoonVsL]].map(([label, p]) => p && (
            <div key={label} style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: '#3a5070', fontFamily: mono, marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 10, color: '#6080a0', fontFamily: mono }}>AVG {p.avgAgainst} · K% {p.kPct}% · BB% {p.bbPct}% · SLG {p.slgAgainst}</div>
            </div>
          ))}
        </div>
        {d.platoonNote && <div style={{ fontSize: 10, color: '#3a5060', fontFamily: mono, fontStyle: 'italic', lineHeight: 1.4 }}>⚡ {d.platoonNote}</div>}
      </div>

      {/* Last 5 */}
      <SectionLabel>Last 5 Starts</SectionLabel>
      <div style={{ overflowX: 'auto', marginBottom: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: mono }}>
          <thead>
            <tr>
              {['Date', 'Opp', 'Rank', 'IP', 'K', 'H', 'ER', 'BB', 'P'].map(h => (
                <th key={h} style={{ color: '#2a3a50', fontWeight: 400, textAlign: 'center', paddingBottom: 4, paddingRight: 6, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {l5.map((s, i) => {
              const kOut = kOutliers.find(o => o.index === i)
              const rOut = rankOutliers.find(o => o.index === i)
              return (
                <tr key={i} style={{ borderTop: '1px solid #0d1a28' }}>
                  <td style={{ color: '#3a5070', padding: '4px 6px 4px 0', whiteSpace: 'nowrap' }}>{s.date}</td>
                  <td style={{ color: '#5a7090', padding: '4px 6px', textAlign: 'center' }}>{s.opp}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                    <span style={{ color: rOut ? '#f5c842' : '#4a6080' }}>{s.oppKRank}{rOut ? ' ⚠' : ''}</span>
                  </td>
                  <td style={{ color: '#5a7090', padding: '4px 6px', textAlign: 'center' }}>{s.ip}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                    <span style={{ color: kOut?.isHigh ? '#00e5a0' : kOut?.isLow ? '#ff4560' : '#8899bb', fontWeight: kOut ? 700 : 400 }}>{s.k}{kOut ? (kOut.isHigh ? '↑' : '↓') : ''}</span>
                  </td>
                  <td style={{ color: '#5a7090', padding: '4px 6px', textAlign: 'center' }}>{s.h}</td>
                  <td style={{ color: '#5a7090', padding: '4px 6px', textAlign: 'center' }}>{s.er}</td>
                  <td style={{ color: '#5a7090', padding: '4px 6px', textAlign: 'center' }}>{s.bb}</td>
                  <td style={{ color: '#5a7090', padding: '4px 6px', textAlign: 'center' }}>{s.pitches}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Averages */}
      <div style={{ background: '#ffffff04', borderRadius: 8, padding: '7px 10px', marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: '#3a5060', fontFamily: mono }}>
          <span style={{ color: '#2a3a50' }}>L5 avg: </span>
          {l5Avg(l5IPs)} IP · <span style={{ color: '#8899bb' }}>{l5Avg(l5Ks)} K</span> · {l5Avg(l5.map(s => s.h))} H · {l5Avg(l5.map(s => s.er))} ER · {l5Avg(l5.map(s => s.bb))} BB · {l5Avg(l5.map(s => s.pitches))} P · Opp Rank avg {l5Avg(l5Ranks)}
        </div>
      </div>
      <div style={{ background: '#ffffff04', borderRadius: 8, padding: '7px 10px', marginBottom: 4 }}>
        <div style={{ fontSize: 10, color: '#3a5060', fontFamily: mono }}>
          <span style={{ color: '#2a3a50' }}>L10 avg: </span>
          — IP · <span style={{ color: '#8899bb' }}>{d.last10AvgK} K</span> · {d.last10AvgH} H · {d.last10AvgER} ER · {d.last10AvgBB} BB · {d.last10AvgPitches} P · Opp Rank avg {d.last10AvgOppKRank}
        </div>
      </div>

      {/* Opposing team */}
      {d.opposing && (
        <div style={{ background: '#ffffff05', borderRadius: 10, padding: '8px 10px', marginBottom: 10, marginTop: 10 }}>
          <SectionLabel>vs {d.opposing.team}</SectionLabel>
          <div style={{ fontSize: 11, color: '#5a7090', fontFamily: mono, marginBottom: 4 }}>
            K% vs {d.hand}HP: <span style={{ color: '#c0d4f0' }}>{d.opposing.kPctVsHand}%</span>
            {' '}· Rank: <span style={{ color: d.opposing.lineupKRankVsHand <= 5 ? '#ff4560' : d.opposing.lineupKRankVsHand >= 20 ? '#00e5a0' : '#c0d4f0' }}>#{d.opposing.lineupKRankVsHand} hardest</span>
            {' '}· Chase: {d.opposing.chaseRate}% · Contact: {d.opposing.contactRate}%
          </div>
          <div style={{ fontSize: 10, color: '#3a5060', fontFamily: mono, marginBottom: 4 }}>
            L14 K% vs {d.hand}HP: {d.opposing.kPctLast14}% · {d.opposing.rhbCount} RHB / {d.opposing.lhbCount} LHB
          </div>
          {tougherThanAvg !== null && (
            <div style={{ fontSize: 10, fontFamily: mono, color: tougherThanAvg ? '#f5c842' : '#00e5a090', fontStyle: 'italic' }}>
              {tougherThanAvg
                ? `⚠ Tougher than L5 avg opponent (Rank #${d.opposing.lineupKRankVsHand} vs avg #${l5Avg(l5Ranks)}) — K suppression expected`
                : `✓ Easier than L5 avg opponent (Rank #${d.opposing.lineupKRankVsHand} vs avg #${l5Avg(l5Ranks)}) — K upside expected`}
            </div>
          )}
          {d.opposing.platoonNote && <div style={{ fontSize: 10, color: '#3a5060', fontFamily: mono, marginTop: 4, fontStyle: 'italic' }}>⚡ {d.opposing.platoonNote}</div>}
        </div>
      )}

      {/* Projections table */}
      <SectionLabel>Projections</SectionLabel>
      <div style={{ overflowX: 'auto', marginBottom: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: mono }}>
          <thead>
            <tr>
              {['Stat', 'Proj', 'Line', 'Over%', 'O-Odds', 'Under%', 'U-Odds'].map(h => (
                <th key={h} style={{ color: '#2a3a50', fontWeight: 400, textAlign: 'center', paddingBottom: 4, paddingRight: 4, whiteSpace: 'nowrap', fontSize: 10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['Pitches', d.projectedPitches, pitchLine],
              ['Outs', d.projectedOuts, outsLine],
              ['Runs', d.projectedER, erLine],
              ['Hits', d.projectedH, hLine],
              ['Walks', d.projectedBB, bbLine],
            ].map(([label, proj, sl]) => (
              <tr key={label} style={{ borderTop: '1px solid #0d1a28' }}>
                <td style={{ color: '#4a6080', padding: '5px 4px 5px 0' }}>{label}</td>
                <td style={{ color: '#c0d4f0', textAlign: 'center', padding: '5px 4px' }}>{proj}</td>
                <td style={{ color: '#7b61ff', textAlign: 'center', padding: '5px 4px' }}>{sl.line}</td>
                <td style={{ textAlign: 'center', padding: '5px 4px' }}><OddsCell pct={sl.overPct} odds={sl.overOdds} /></td>
                <td style={{ textAlign: 'center', padding: '5px 4px' }}></td>
                <td style={{ textAlign: 'center', padding: '5px 4px' }}><OddsCell pct={sl.underPct} odds={sl.underOdds} /></td>
                <td style={{ textAlign: 'center', padding: '5px 4px' }}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* K table */}
      <SectionLabel>Strikeout Lines · Proj {Math.round(d.projectedK)} K</SectionLabel>
      <div style={{ overflowX: 'auto', marginBottom: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: mono }}>
          <thead>
            <tr>
              {['Line', 'Over%', 'O-Odds', 'Under%', 'U-Odds'].map(h => (
                <th key={h} style={{ color: '#2a3a50', fontWeight: 400, textAlign: 'center', paddingBottom: 4, fontSize: 10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kLines.map((kl, i) => (
              <tr key={i} style={{
                borderTop: '1px solid #0d1a28',
                background: kl.isProjected ? '#7b61ff0d' : 'transparent',
              }}>
                <td style={{ padding: '5px 8px 5px 4px', textAlign: 'center' }}>
                  <span style={{ color: kl.isProjected ? '#7b61ff' : '#4a6080', fontWeight: kl.isProjected ? 700 : 400 }}>
                    {kl.displayLine}{kl.isProjected ? ' ←' : ''}
                  </span>
                </td>
                <td style={{ textAlign: 'center', padding: '5px 4px' }}><OddsCell pct={kl.overPct} odds={kl.overOdds} /></td>
                <td></td>
                <td style={{ textAlign: 'center', padding: '5px 4px' }}><OddsCell pct={kl.underPct} odds={kl.underOdds} /></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lineup toggle */}
      {lineup.length > 0 && (
        <>
          <button onClick={() => setShowLineup(v => !v)} style={{
            width: '100%', background: '#ffffff06', border: '1px solid #1a2840', borderRadius: 10,
            padding: '9px 12px', color: '#4a6080', fontSize: 11, fontFamily: mono,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: showLineup ? 10 : 0,
          }}>
            <span>Batter Projections vs {d.name}</span>
            <span>{showLineup ? '▲ Hide' : '▼ Show lineup'}</span>
          </button>

          {showLineup && (
            <div style={{ overflowX: 'auto', animation: 'fadeUp 0.2s ease' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: mono, minWidth: 380 }}>
                <thead>
                  <tr>
                    {['#', 'Batter', 'B', 'K Rnk', 'H', 'TB', 'K', 'BB'].map(h => (
                      <th key={h} style={{ color: '#2a3a50', fontWeight: 400, textAlign: 'center', paddingBottom: 4, paddingRight: 4, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineup.map((b, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #0d1a28' }}>
                      <td style={{ color: '#2a3a50', padding: '4px', textAlign: 'center' }}>{b.order}</td>
                      <td style={{ color: '#8090a8', padding: '4px 6px', whiteSpace: 'nowrap' }}>{b.name}</td>
                      <td style={{ color: '#3a5070', padding: '4px', textAlign: 'center' }}>{b.bats}</td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        <span style={{ color: b.kRank <= 5 ? '#ff4560' : b.kRank >= 20 ? '#00e5a0' : '#4a6080' }}>
                          {b.kRank <= 5 ? '⚠ ' : ''}{b.kRank}
                        </span>
                      </td>
                      <td style={{ color: '#7090b0', padding: '4px', textAlign: 'center' }}>{b.projH?.toFixed(2)}</td>
                      <td style={{ color: '#7090b0', padding: '4px', textAlign: 'center' }}>{b.projTB?.toFixed(2)}</td>
                      <td style={{ color: '#8899bb', padding: '4px', textAlign: 'center', fontWeight: 600 }}>{b.projK?.toFixed(2)}</td>
                      <td style={{ color: '#7090b0', padding: '4px', textAlign: 'center' }}>{b.projBB?.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px solid #1a2840', background: '#ffffff04' }}>
                    <td colSpan={4} style={{ color: '#2a3a50', padding: '5px 4px', fontSize: 10 }}>Lineup totals</td>
                    <td style={{ color: '#c0d4f0', padding: '5px 4px', textAlign: 'center', fontWeight: 700 }}>{lineupTotalH}</td>
                    <td style={{ color: '#c0d4f0', padding: '5px 4px', textAlign: 'center', fontWeight: 700 }}>{lineupTotalTB}</td>
                    <td style={{ color: '#c0d4f0', padding: '5px 4px', textAlign: 'center', fontWeight: 700 }}>{lineupTotalK}</td>
                    <td style={{ color: '#c0d4f0', padding: '5px 4px', textAlign: 'center', fontWeight: 700 }}>{lineupTotalBB}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Game Card ────────────────────────────────────────────────────────────────
function GameCard({ game }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div style={{ background: '#0a1220', border: '1px solid #111d2e', borderRadius: 18, marginBottom: 12, overflow: 'hidden', animation: 'fadeUp 0.3s ease' }}>
      <button onClick={() => setExpanded(v => !v)} style={{
        width: '100%', background: 'none', border: 'none', cursor: 'pointer',
        padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#bdd0ee', fontFamily: display, letterSpacing: '0.07em' }}>
          {game.awayAbbr} <span style={{ color: '#1a2840' }}>@</span> {game.homeAbbr}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#3a5070', fontFamily: mono }}>{game.time}</div>
            <div style={{ fontSize: 9, color: '#1e2d42', fontFamily: mono }}>{game.venue}</div>
          </div>
          <div style={{ fontSize: 12, color: '#2a3a50' }}>{expanded ? '▲' : '▼'}</div>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          <PitcherCard name={game.awayPitcher} hand={game.awayHand} data={game.awayData} loading={game.awayLoading} side={`${game.awayAbbr} Away SP`} />
          <PitcherCard name={game.homePitcher} hand={game.homeHand} data={game.homeData} loading={game.homeLoading} side={`${game.homeAbbr} Home SP`} />
        </div>
      )}
    </div>
  )
}

// ─── Top Picks Strip ──────────────────────────────────────────────────────────
function TopPicks({ games }) {
  const picks = games.flatMap(g => {
    const results = []
    for (const [data, name] of [[g.awayData, g.awayPitcher], [g.homeData, g.homePitcher]]) {
      if (!data) continue
      const kLines = buildKLines(data.projectedK)
      const proj = kLines.find(l => l.isProjected)
      if (proj?.overPct >= 55) results.push({ name, pct: proj.overPct, odds: proj.overOdds, proj: Math.round(data.projectedK), lean: 'OVER', rank: data.opposing?.lineupKRankVsHand })
    }
    return results
  }).sort((a, b) => b.pct - a.pct).slice(0, 6)

  if (picks.length === 0) return null

  return (
    <div style={{ marginBottom: 14, padding: '12px 14px', background: '#00e5a008', border: '1px solid #00e5a018', borderRadius: 14, animation: 'fadeUp 0.4s ease' }}>
      <div style={{ fontSize: 9, color: '#00e5a0', fontFamily: mono, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>⚡ Top K Props Today</div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {picks.map((p, i) => (
          <div key={i} style={{ background: '#00e5a00d', border: '1px solid #00e5a02a', borderRadius: 10, padding: '5px 10px' }}>
            <div style={{ fontSize: 13, color: '#00e5a0', fontFamily: display, letterSpacing: '0.04em' }}>{p.name}</div>
            <div style={{ fontSize: 9, color: '#2a3a50', fontFamily: mono }}>Proj {p.proj}K · {p.pct}% over · {p.odds > 0 ? '+' : ''}{p.odds} · Opp #{p.rank}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('today')
  const [slates, setSlates] = useState({ today: null, tomorrow: null })
  const [status, setStatus] = useState({ today: 'idle', tomorrow: 'idle' })
  const [errorMsg, setErrorMsg] = useState({ today: '', tomorrow: '' })

  const updateGame = useCallback((which, gameId, key, value) => {
    setSlates(s => ({
      ...s,
      [which]: {
        games: (s[which]?.games || []).map(g =>
          g.gameId === gameId ? { ...g, [key]: value } : g
        )
      }
    }))
  }, [])

  const loadSlate = useCallback(async (which) => {
    setStatus(s => ({ ...s, [which]: 'loading' }))
    setErrorMsg(e => ({ ...e, [which]: '' }))
    setSlates(s => ({ ...s, [which]: null }))
    const offset = which === 'today' ? 0 : 1
    const dateStr = getDateStr(offset)

    try {
      const games = await callClaude(gamesPrompt(dateStr, getDateStr(0)))
      if (!Array.isArray(games) || games.length === 0) throw new Error('No games returned')

      const initialGames = games.map(g => ({ ...g, awayData: null, homeData: null, awayLoading: false, homeLoading: false }))
      setSlates(s => ({ ...s, [which]: { games: initialGames } }))
      setStatus(s => ({ ...s, [which]: 'analyzing' }))

      // Analyze each pitcher individually
      for (const game of games) {
        // Away pitcher
        if (game.awayPitcher) {
          updateGame(which, game.gameId, 'awayLoading', true)
          try {
            const data = await callClaude(pitcherPrompt(game, { name: game.awayPitcher, hand: game.awayHand }, true, dateStr), 4000)
            updateGame(which, game.gameId, 'awayData', data)
          } catch (e) { console.warn('Away pitcher failed', e) }
          updateGame(which, game.gameId, 'awayLoading', false)
        }
        // Home pitcher
        if (game.homePitcher) {
          updateGame(which, game.gameId, 'homeLoading', true)
          try {
            const data = await callClaude(pitcherPrompt(game, { name: game.homePitcher, hand: game.homeHand }, false, dateStr), 4000)
            updateGame(which, game.gameId, 'homeData', data)
          } catch (e) { console.warn('Home pitcher failed', e) }
          updateGame(which, game.gameId, 'homeLoading', false)
        }
      }
      setStatus(s => ({ ...s, [which]: 'done' }))
    } catch (e) {
      setErrorMsg(err => ({ ...err, [which]: e.message || 'Failed to load' }))
      setStatus(s => ({ ...s, [which]: 'error' }))
    }
  }, [updateGame])

  useEffect(() => { loadSlate('today') }, [])

  const handleTab = (t) => {
    setTab(t)
    if (!slates[t] && status[t] === 'idle') loadSlate(t)
  }

  const activeGames = slates[tab]?.games || []
  const activeStatus = status[tab]
  const activeError = errorMsg[tab]
  const isLoading = activeStatus === 'loading' || activeStatus === 'analyzing'
  const analyzedCount = activeGames.filter(g => g.awayData || g.homeData).length

  return (
    <div style={{ minHeight: '100vh', background: '#060c14', maxWidth: 520, margin: '0 auto' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 0; height: 4px; }
        ::-webkit-scrollbar-track { background: #0a1220; }
        ::-webkit-scrollbar-thumb { background: #1e2d42; border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        body { background: #060c14; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '24px 18px 0', background: 'linear-gradient(180deg, #0b1626 0%, transparent 100%)', position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: '#2a3a50', fontFamily: mono, letterSpacing: '0.14em', textTransform: 'uppercase' }}>MLB · Strikeout Scout</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: '#deeeff', fontFamily: display, letterSpacing: '0.06em', lineHeight: 1 }}>K PROPS</div>
          </div>
          <button onClick={() => loadSlate(tab)} disabled={isLoading} style={{
            background: '#0d1a2a', border: '1px solid #1a2d42', borderRadius: 12, padding: '8px 14px',
            color: isLoading ? '#2a3a50' : '#7b61ff', fontSize: 11, fontFamily: mono, cursor: isLoading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {isLoading ? <><Spinner small />{activeStatus === 'loading' ? 'Pulling slate…' : `${analyzedCount}/${activeGames.length} analyzed`}</> : '↻ Refresh'}
          </button>
        </div>
        <div style={{ display: 'flex', background: '#0a1220', borderRadius: 14, padding: 4, marginBottom: 0 }}>
          {[{ id: 'today', label: `Today · ${getShortDate(0)}` }, { id: 'tomorrow', label: `Tomorrow · ${getShortDate(1)}` }].map(t => (
            <button key={t.id} onClick={() => handleTab(t.id)} style={{
              flex: 1, padding: '9px 8px', borderRadius: 11, border: 'none', cursor: 'pointer',
              background: tab === t.id ? '#192840' : 'transparent',
              color: tab === t.id ? '#c0d4f0' : '#2a3a50',
              fontSize: 11, fontFamily: mono, transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              {t.label}
              {slates[t.id]?.games?.length > 0 && (
                <span style={{ background: tab === t.id ? '#7b61ff22' : '#ffffff08', borderRadius: 6, padding: '1px 6px', fontSize: 10, color: tab === t.id ? '#7b61ff' : '#2a3a50' }}>
                  {slates[t.id].games.length}
                </span>
              )}
              {(status[t.id] === 'loading' || status[t.id] === 'analyzing') && <Spinner small />}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 18px 60px' }}>
        {activeError && (
          <div onClick={() => loadSlate(tab)} style={{ padding: '12px 14px', background: '#ff456011', border: '1px solid #ff456033', borderRadius: 12, fontSize: 12, color: '#ff4560', fontFamily: mono, marginBottom: 14, cursor: 'pointer', lineHeight: 1.5 }}>
            ⚠ {activeError}<br /><span style={{ fontSize: 10, color: '#7b2030' }}>Tap to retry</span>
          </div>
        )}

        {activeStatus === 'loading' && !activeGames.length && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '70px 0', gap: 14 }}>
            <Spinner />
            <div style={{ fontSize: 12, color: '#2a3a50', fontFamily: mono, textAlign: 'center', lineHeight: 1.8 }}>
              Pulling {tab === 'today' ? "today's" : "tomorrow's"} slate…
            </div>
          </div>
        )}

        <TopPicks games={activeGames} />

        {activeGames.map(g => <GameCard key={g.gameId} game={g} />)}

        {activeStatus === 'analyzing' && activeGames.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', justifyContent: 'center' }}>
            <Spinner small />
            <span style={{ fontSize: 11, color: '#2a3a50', fontFamily: mono }}>
              Analyzing pitchers ({analyzedCount * 2}/{activeGames.length * 2})
            </span>
          </div>
        )}

        {activeStatus === 'done' && activeGames.length === 0 && (
          <div style={{ textAlign: 'center', padding: '50px 0', color: '#2a3a50', fontFamily: mono, fontSize: 12 }}>No games on this slate</div>
        )}
      </div>
    </div>  
    function GameScreen({ game, onBack }) {
  const [activePitcher, setActivePitcher] = useState('away')

  const getGradeData = (d) => {
    if (!d) return { grade: null, projK: null }
    const r = projectK({ kPer9: d.kPer9, kPct: d.kPct, swStrPct: d.swStrPct, cswPct: d.cswPct, projectedIP: d.projectedIP || 6, last5: d.last5, last10AvgK: d.last10AvgK, last10AvgOppKRank: d.last10AvgOppKRank, seasonIP: d.seasonIP, platoonVsR: d.platoonVsR, platoonVsL: d.platoonVsL, hand: d.hand, opposing: d.opposing || {}, parkKFactor: d.parkKFactor || 1.0, daysRest: d.daysRest || 4, umpireKFactor: d.umpireKFactor || 1.0, isFirstStartBack: d.isFirstStartBack || false })
    const kl = buildKLines(r.projectedK)
    const pl = kl.find(l => l.isProjected)
    const grade = pl ? (pl.overPct >= 58 ? 9 : pl.overPct >= 54 ? 8 : pl.overPct >= 50 ? 7 : pl.overPct >= 46 ? 6 : pl.overPct >= 42 ? 5 : 4) : null
    return { grade, projK: Math.round(r.projectedK), overPct: pl?.overPct }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, maxWidth: 520, margin: '0 auto' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:0;height:3px}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        body{background:#000}
        button{-webkit-tap-highlight-color:transparent}
      `}</style>

      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.border}`, padding: '12px 16px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 13, fontFamily: sans, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: 0 }}>
          ← Back to slate
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: display, fontSize: 28, color: '#fff', letterSpacing: '0.06em', lineHeight: 1 }}>
              {game.awayAbbr} <span style={{ color: C.faint }}>@</span> {game.homeAbbr}
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: mono, marginTop: 2 }}>{game.time} · {game.venue}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ key: 'away', d: game.awayData, loading: game.awayLoading, abbr: game.awayAbbr },
              { key: 'home', d: game.homeData, loading: game.homeLoading, abbr: game.homeAbbr }
            ].map(({ key, d, loading, abbr }) => {
              const { grade } = getGradeData(d)
              const gc = grade ? gradeColor(grade) : C.faint
              return (
                <button key={key} onClick={() => setActivePitcher(key)} style={{ width: 44, height: 44, borderRadius: 12, border: `2px solid ${activePitcher === key ? gc : C.border}`, background: activePitcher === key ? `${gc}18` : C.surface, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  {loading ? <Spinner small color={gc} /> : grade ? (
                    <><span style={{ fontFamily: display, fontSize: 18, color: gc, lineHeight: 1 }}>{grade}</span><span style={{ fontSize: 8, color: gc, fontFamily: mono }}>{abbr}</span></>
                  ) : <span style={{ fontSize: 9, color: C.faint, fontFamily: mono }}>{abbr}</span>}
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', background: C.surface, borderRadius: 10, padding: 3 }}>
          {[{ key: 'away', label: game.awayPitcher || `${game.awayAbbr} SP`, sub: 'Away SP' },
            { key: 'home', label: game.homePitcher || `${game.homeAbbr} SP`, sub: 'Home SP' }
          ].map(({ key, label, sub }) => (
            <button key={key} onClick={() => setActivePitcher(key)} style={{ flex: 1, padding: '8px 6px', borderRadius: 8, border: 'none', cursor: 'pointer', background: activePitcher === key ? C.surface2 : 'transparent' }}>
              <div style={{ fontSize: 9, color: activePitcher === key ? C.muted : C.faint, fontFamily: mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 1 }}>{sub}</div>
              <div style={{ fontSize: 13, color: activePitcher === key ? C.text : C.faint, fontFamily: sans, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px 60px' }}>
        {activePitcher === 'away' ? (
          <PitcherDetail data={game.awayData} name={game.awayPitcher} hand={game.awayHand} side={`Away SP · ${game.awayTeam}`} loading={game.awayLoading} />
        ) : (
          <PitcherDetail data={game.homeData} name={game.homePitcher} hand={game.homeHand} side={`Home SP · ${game.homeTeam}`} loading={game.homeLoading} />
        )}
      </div>
    </div>
  )
}

function GameCard({ game, onSelect }) {
  const getGrade = (d) => {
    if (!d) return null
    const r = projectK({ kPer9: d.kPer9, kPct: d.kPct, swStrPct: d.swStrPct, cswPct: d.cswPct, projectedIP: d.projectedIP || 6, last5: d.last5, last10AvgK: d.last10AvgK, last10AvgOppKRank: d.last10AvgOppKRank, seasonIP: d.seasonIP, platoonVsR: d.platoonVsR, platoonVsL: d.platoonVsL, hand: d.hand, opposing: d.opposing || {}, parkKFactor: d.parkKFactor || 1.0, daysRest: d.daysRest || 4, umpireKFactor: d.umpireKFactor || 1.0, isFirstStartBack: d.isFirstStartBack || false })
    const kl = buildKLines(r.projectedK)
    const pl = kl.find(l => l.isProjected)
    return pl ? (pl.overPct >= 58 ? 9 : pl.overPct >= 54 ? 8 : pl.overPct >= 50 ? 7 : pl.overPct >= 46 ? 6 : pl.overPct >= 42 ? 5 : 4) : null
  }
  const getLean = (d) => {
    if (!d) return null
    const r = projectK({ kPer9: d.kPer9, kPct: d.kPct, swStrPct: d.swStrPct, cswPct: d.cswPct, projectedIP: d.projectedIP || 6, last5: d.last5, last10AvgK: d.last10AvgK, last10AvgOppKRank: d.last10AvgOppKRank, seasonIP: d.seasonIP, platoonVsR: d.platoonVsR, platoonVsL: d.platoonVsL, hand: d.hand, opposing: d.opposing || {}, parkKFactor: d.parkKFactor || 1.0, daysRest: d.daysRest || 4, umpireKFactor: d.umpireKFactor || 1.0, isFirstStartBack: d.isFirstStartBack || false })
    const kl = buildKLines(r.projectedK)
    const pl = kl.find(l => l.isProjected)
    return pl ? (pl.overPct > 52 ? 'OVER' : pl.overPct < 48 ? 'UNDER' : null) : null
  }

  const awayGrade = getGrade(game.awayData)
  const homeGrade = getGrade(game.homeData)
  const awayLean = getLean(game.awayData)
  const homeLean = getLean(game.homeData)
  const hasTopPick = (awayGrade >= 8 && awayLean === 'OVER') || (homeGrade >= 8 && homeLean === 'OVER')

  return (
    <button onClick={() => onSelect(game)} style={{ width: '100%', background: C.surface, border: `1px solid ${hasTopPick ? `${C.green}33` : C.border}`, borderRadius: 14, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', marginBottom: 8, display: 'block', animation: 'fadeUp 0.3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: display, fontSize: 22, color: '#fff', letterSpacing: '0.07em', lineHeight: 1 }}>
            {game.awayAbbr} <span style={{ color: C.faint }}>@</span> {game.homeAbbr}
          </div>
          <div style={{ fontSize: 11, color: C.faint, fontFamily: mono, marginTop: 2 }}>{game.time} · {game.venue}</div>
        </div>
        {hasTopPick && <div style={{ background: `${C.green}14`, border: `1px solid ${C.green}33`, borderRadius: 8, padding: '3px 8px', fontSize: 10, color: C.green, fontFamily: mono }}>⚡ TOP PICK</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { name: game.awayPitcher, hand: game.awayHand, grade: awayGrade, lean: awayLean, loading: game.awayLoading, role: 'Away' },
          { name: game.homePitcher, hand: game.homeHand, grade: homeGrade, lean: homeLean, loading: game.homeLoading, role: 'Home' },
        ].map(({ name, hand, grade, lean, loading: l, role }) => {
          const gc = grade ? gradeColor(grade) : C.faint
          const lc = lean === 'OVER' ? C.green : lean === 'UNDER' ? C.red : C.muted
          return (
            <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.surface2, borderRadius: 9, padding: '8px 10px' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${gc}18`, border: `1px solid ${gc}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {l ? <Spinner small color={gc} /> : grade ? <span style={{ fontFamily: display, fontSize: 17, color: gc }}>{grade}</span> : <span style={{ fontSize: 10, color: C.faint, fontFamily: mono }}>—</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: name ? C.text : C.faint, fontFamily: sans, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || 'TBD'}</div>
                <div style={{ fontSize: 10, color: C.faint, fontFamily: mono }}>{role} SP{hand ? ` · ${hand}HP` : ''}</div>
              </div>
              {lean && <div style={{ padding: '2px 7px', borderRadius: 6, background: `${lc}12`, border: `1px solid ${lc}28`, fontSize: 10, color: lc, fontFamily: mono, fontWeight: 700 }}>{lean}</div>}
              {l && <div style={{ fontSize: 10, color: C.faint, fontFamily: mono }}>analyzing…</div>}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 11, color: C.faint, fontFamily: mono, marginTop: 8, textAlign: 'right' }}>Tap for full analysis →</div>
    </button>
  )
}

export default function App() {
  const [screen, setScreen] = useState('slate')
  const [selectedGame, setSelectedGame] = useState(null)
  const [tab, setTab] = useState('today')
  const [slates, setSlates] = useState({ today: null, tomorrow: null })
  const [status, setStatus] = useState({ today: 'idle', tomorrow: 'idle' })
  const [errorMsg, setErrorMsg] = useState({ today: '', tomorrow: '' })
  const [lastLoaded, setLastLoaded] = useState(null)

  useEffect(() => {
    const cached = loadCache()
    if (cached) {
      setSlates(cached.slates || { today: null, tomorrow: null })
      setLastLoaded(cached.ts ? new Date(cached.ts) : null)
    }
  }, [])

  const updateGame = useCallback((which, gameId, key, value) => {
    setSlates(s => {
      const updated = { ...s, [which]: { games: (s[which]?.games || []).map(g => g.gameId === gameId ? { ...g, [key]: value } : g) } }
      saveCache({ slates: updated, ts: Date.now() })
      return updated
    })
  }, [])

  const loadSlate = useCallback(async (which) => {
    setStatus(s => ({ ...s, [which]: 'loading' }))
    setErrorMsg(e => ({ ...e, [which]: '' }))
    setSlates(s => ({ ...s, [which]: null }))
    const offset = which === 'today' ? 0 : 1
    const dateStr = getDateStr(offset)
    try {
      const games = await callClaude(gamesPrompt(dateStr, getDateStr(0)))
      if (!Array.isArray(games) || games.length === 0) throw new Error('No games returned')
      const initialGames = games.map(g => ({ ...g, awayData: null, homeData: null, awayLoading: false, homeLoading: false }))
      setSlates(s => ({ ...s, [which]: { games: initialGames } }))
      setStatus(s => ({ ...s, [which]: 'analyzing' }))
      setLastLoaded(new Date())
      for (const game of games) {
        if (game.awayPitcher) {
          updateGame(which, game.gameId, 'awayLoading', true)
          try {
            const data = await callClaude(pitcherPrompt(game, { name: game.awayPitcher, hand: game.awayHand }, true, dateStr), 4000)
            updateGame(which, game.gameId, 'awayData', data)
          } catch (e) { console.warn('Away pitcher failed', e) }
          updateGame(which, game.gameId, 'awayLoading', false)
        }
        if (game.homePitcher) {
          updateGame(which, game.gameId, 'homeLoading', true)
          try {
            const data = await callClaude(pitcherPrompt(game, { name: game.homePitcher, hand: game.homeHand }, false, dateStr), 4000)
            updateGame(which, game.gameId, 'homeData', data)
          } catch (e) { console.warn('Home pitcher failed', e) }
          updateGame(which, game.gameId, 'homeLoading', false)
        }
      }
      setStatus(s => ({ ...s, [which]: 'done' }))
    } catch (e) {
      setErrorMsg(err => ({ ...err, [which]: e.message || 'Failed to load' }))
      setStatus(s => ({ ...s, [which]: 'error' }))
    }
  }, [updateGame])

  const handleTab = (t) => {
    setTab(t)
    if (!slates[t] && status[t] === 'idle') loadSlate(t)
  }

  if (screen === 'game' && selectedGame) {
    const currentGame = slates[tab]?.games?.find(g => g.gameId === selectedGame.gameId) || selectedGame
    return <GameScreen game={currentGame} onBack={() => setScreen('slate')} />
  }

  const activeGames = slates[tab]?.games || []
  const activeStatus = status[tab]
  const activeError = errorMsg[tab]
  const isLoading = activeStatus === 'loading' || activeStatus === 'analyzing'
  const analyzedCount = activeGames.filter(g => g.awayData || g.homeData).length

  const topPicks = activeGames.filter(g => {
    const check = (d) => {
      if (!d) return false
      const r = projectK({ kPer9: d.kPer9, kPct: d.kPct, swStrPct: d.swStrPct, cswPct: d.cswPct, projectedIP: d.projectedIP || 6, last5: d.last5, last10AvgK: d.last10AvgK, last10AvgOppKRank: d.last10AvgOppKRank, seasonIP: d.seasonIP, platoonVsR: d.platoonVsR, platoonVsL: d.platoonVsL, hand: d.hand, opposing: d.opposing || {}, parkKFactor: d.parkKFactor || 1.0, daysRest: d.daysRest || 4, umpireKFactor: d.umpireKFactor || 1.0, isFirstStartBack: d.isFirstStartBack || false })
      const kl = buildKLines(r.projectedK)
      const pl = kl.find(l => l.isProjected)
      return pl?.overPct >= 54
    }
    return check(g.awayData) || check(g.homeData)
  })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, maxWidth: 520, margin: '0 auto' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:0;height:3px}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        body{background:#000}
        button{-webkit-tap-highlight-color:transparent}
      `}</style>

      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.border}`, padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: C.faint, fontFamily: mono, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 2 }}>MLB · Strikeout Scout</div>
            <div style={{ fontFamily: display, fontSize: 38, color: '#fff', letterSpacing: '0.06em', lineHeight: 1 }}>K PROPS</div>
            {lastLoaded && !isLoading && (
              <div style={{ fontSize: 10, color: C.faint, fontFamily: mono, marginTop: 3 }}>
                Updated {lastLoaded.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </div>
            )}
          </div>
          <button onClick={() => loadSlate(tab)} disabled={isLoading} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 14px', color: isLoading ? C.faint : C.purple, fontSize: 12, fontFamily: mono, cursor: isLoading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isLoading ? <><Spinner small color={C.purple} />{activeStatus === 'loading' ? 'Loading…' : `${analyzedCount}/${activeGames.length}`}</> : activeGames.length > 0 ? '↻ Refresh' : '↻ Load Slate'}
          </button>
        </div>
        <div style={{ display: 'flex', background: C.surface, borderRadius: 12, padding: 3, marginBottom: 0 }}>
          {[{ id: 'today', label: `Today · ${getShortDate(0)}` }, { id: 'tomorrow', label: `Tomorrow · ${getShortDate(1)}` }].map(t => (
            <button key={t.id} onClick={() => handleTab(t.id)} style={{ flex: 1, padding: '9px 8px', borderRadius: 10, border: 'none', cursor: 'pointer', background: tab === t.id ? C.surface2 : 'transparent', color: tab === t.id ? C.text : C.muted, fontSize: 12, fontFamily: mono, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {t.label}
              {slates[t.id]?.games?.length > 0 && <span style={{ background: tab === t.id ? `${C.purple}22` : C.border, borderRadius: 6, padding: '1px 6px', fontSize: 10, color: tab === t.id ? C.purple : C.faint }}>{slates[t.id].games.length}</span>}
              {(status[t.id] === 'loading' || status[t.id] === 'analyzing') && <Spinner small />}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px 60px' }}>
        {activeError && (
          <div onClick={() => loadSlate(tab)} style={{ padding: '12px 14px', background: `${C.red}0a`, border: `1px solid ${C.red}22`, borderRadius: 12, fontSize: 13, color: '#a04050', fontFamily: mono, marginBottom: 14, cursor: 'pointer', lineHeight: 1.5 }}>
            ⚠ {activeError.slice(0, 120)}<br /><span style={{ fontSize: 11, color: '#6a2030' }}>Tap to retry</span>
          </div>
        )}

        {!isLoading && activeGames.length === 0 && !activeError && (
          <div style={{ textAlign: 'center', padding: '70px 0', animation: 'fadeUp 0.4s ease' }}>
            <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.3 }}>⚾</div>
            <div style={{ fontSize: 16, color: C.muted, fontFamily: sans, fontWeight: 500, marginBottom: 8 }}>No slate loaded</div>
            <div style={{ fontSize: 13, color: C.faint, fontFamily: mono, marginBottom: 24 }}>Tap Load Slate to pull today's games and run projections</div>
            <button onClick={() => loadSlate(tab)} style={{ background: `${C.purple}18`, border: `1px solid ${C.purple}44`, borderRadius: 12, padding: '12px 24px', color: C.purple, fontSize: 14, fontFamily: sans, fontWeight: 600, cursor: 'pointer' }}>
              Load {tab === 'today' ? "Today's" : "Tomorrow's"} Slate
            </button>
          </div>
        )}

        {activeStatus === 'loading' && activeGames.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '70px 0', gap: 16 }}>
            <Spinner />
            <div style={{ fontSize: 13, color: C.muted, fontFamily: mono, textAlign: 'center', lineHeight: 1.8 }}>Pulling {tab === 'today' ? "today's" : "tomorrow's"} slate…</div>
          </div>
        )}

        {topPicks.length > 0 && (
          <div style={{ background: `${C.green}08`, border: `1px solid ${C.green}18`, borderRadius: 12, padding: '12px 14px', marginBottom: 14, animation: 'fadeUp 0.4s ease' }}>
            <div style={{ fontSize: 10, color: C.green, fontFamily: mono, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>⚡ Top K Props Today</div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {topPicks.slice(0, 4).map((g, i) => {
                const getPick = (d, name) => {
                  if (!d) return null
                  const r = projectK({ kPer9: d.kPer9, kPct: d.kPct, swStrPct: d.swStrPct, cswPct: d.cswPct, projectedIP: d.projectedIP || 6, last5: d.last5, last10AvgK: d.last10AvgK, last10AvgOppKRank: d.last10AvgOppKRank, seasonIP: d.seasonIP, platoonVsR: d.platoonVsR, platoonVsL: d.platoonVsL, hand: d.hand, opposing: d.opposing || {}, parkKFactor: d.parkKFactor || 1.0, daysRest: d.daysRest || 4, umpireKFactor: d.umpireKFactor || 1.0, isFirstStartBack: d.isFirstStartBack || false })
                  const kl = buildKLines(r.projectedK)
                  const pl = kl.find(l => l.isProjected)
                  if (!pl || pl.overPct < 54) return null
                  return { name: d.name || name, proj: Math.round(r.projectedK), pct: pl.overPct, odds: pl.overOdds }
                }
                const pick = getPick(g.awayData, g.awayPitcher) || getPick(g.homeData, g.homePitcher)
                if (!pick) return null
                return (
                  <button key={i} onClick={() => { setSelectedGame(g); setScreen('game') }} style={{ background: `${C.green}0d`, border: `1px solid ${C.green}22`, borderRadius: 9, padding: '5px 10px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ fontFamily: display, fontSize: 13, color: C.green, letterSpacing: '0.04em' }}>{pick.name}</div>
                    <div style={{ fontSize: 10, color: '#1a4030', fontFamily: mono }}>Proj {pick.proj}K · {pick.pct}% · {fmt(pick.odds)}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {activeGames.map(g => <GameCard key={g.gameId} game={g} onSelect={(game) => { setSelectedGame(game); setScreen('game') }} />)}

        {activeStatus === 'analyzing' && activeGames.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', justifyContent: 'center' }}>
            <Spinner small />
            <span style={{ fontSize: 12, color: C.faint, fontFamily: mono }}>Analyzing pitchers ({analyzedCount * 2}/{activeGames.length * 2})</span>
          </div>
        )}
      </div>
    </div>
  )
}

    
    
  )
}

