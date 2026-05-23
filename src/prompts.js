export async function fetchRealGames(dateStr) {
  // Format date as YYYY-MM-DD for MLB API
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const year = d.getFullYear()
  const formatted = `${year}-${month}-${day}`

  const resp = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mlb: true, date: formatted }),
  })
  const data = await resp.json()

  const games = []
  const dates = data?.dates || []
  for (const dateObj of dates) {
    for (const game of dateObj.games || []) {
      const away = game.teams?.away
      const home = game.teams?.home
      const gameTime = new Date(game.gameDate)
      const timeStr = gameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'
      games.push({
        gameId: String(game.gamePk),
        time: timeStr,
        awayAbbr: away?.team?.abbreviation || '',
        homeAbbr: home?.team?.abbreviation || '',
        awayTeam: away?.team?.name || '',
        homeTeam: home?.team?.name || '',
        venue: game.venue?.name || '',
        awayPitcher: away?.probablePitcher?.fullName || null,
        awayHand: away?.probablePitcher?.pitchHand?.code || 'R',
        homePitcher: home?.probablePitcher?.fullName || null,
        homeHand: home?.probablePitcher?.pitchHand?.code || 'R',
      })
    }
  }
  return games
}

export function pitcherPrompt(game, pitcher, isAway, dateStr) {
  const role = isAway ? 'Away' : 'Home'
  const opposingTeam = isAway ? game.homeTeam : game.awayTeam
  const opposingAbbr = isAway ? game.homeAbbr : game.awayAbbr

  return `You are an MLB strikeout prop analyst. Date: ${dateStr}.
Game: ${game.awayTeam} @ ${game.homeTeam} at ${game.venue}.
Pitcher: ${pitcher.name} (${pitcher.hand}HP, ${role} SP) vs ${opposingTeam}.

Return ONLY raw JSON with accurate 2025 season stats for ${pitcher.name}.

{
  "name": "${pitcher.name}",
  "hand": "${pitcher.hand}",
  "era": "3.12",
  "xEra": "3.44",
  "kPer9": "10.4",
  "kPct": "27.8",
  "swStrPct": "14.1",
  "cswPct": "29.4",
  "whip": "1.02",
  "seasonIP": "61.2",
  "projectedIP": 6.0,
  "isFirstStartBack": false,
  "daysRest": 5,
  "parkKFactor": 1.0,
  "umpireKFactor": 1.0,
  "platoonVsR": {"kPct": "31.2", "bbPct": "6.8", "avgAgainst": "0.198", "slgAgainst": "0.291"},
  "platoonVsL": {"kPct": "26.1", "bbPct": "8.2", "avgAgainst": "0.221", "slgAgainst": "0.334"},
  "platoonNote": "one sentence on dominant split tonight",
  "last5": [
    {"date": "May 18", "opp": "HOU", "oppKRank": 3, "ip": "7.0", "k": 10, "h": 4, "er": 1, "bb": 1, "pitches": 98},
    {"date": "May 12", "opp": "TEX", "oppKRank": 12, "ip": "6.0", "k": 8, "h": 6, "er": 2, "bb": 2, "pitches": 94},
    {"date": "May 7", "opp": "LAA", "oppKRank": 22, "ip": "7.0", "k": 9, "h": 5, "er": 1, "bb": 0, "pitches": 101},
    {"date": "May 1", "opp": "DET", "oppKRank": 8, "ip": "5.1", "k": 6, "h": 7, "er": 4, "bb": 3, "pitches": 96},
    {"date": "Apr 25", "opp": "MIN", "oppKRank": 5, "ip": "6.2", "k": 8, "h": 4, "er": 2, "bb": 1, "pitches": 92}
  ],
  "last10AvgK": 7.8,
  "last10AvgH": 5.5,
  "last10AvgER": 2.3,
  "last10AvgBB": 1.7,
  "last10AvgPitches": 94,
  "last10AvgOppKRank": 9,
  "pitchMix": "brief note on primary swing-and-miss pitches",
  "recentFormNote": "one sentence on trajectory",
  "projectedPitches": 96,
  "projectedOuts": 19,
  "projectedER": 2,
  "projectedH": 5,
  "projectedBB": 2,
  "opposing": {
    "team": "${opposingTeam}",
    "abbr": "${opposingAbbr}",
    "lineupKRankVsHand": 14,
    "kPctVsHand": "23.4",
    "overallKPct": "21.8",
    "chaseRate": "28.1",
    "contactRate": "77.2",
    "kPctLast14": "21.8",
    "rhbCount": 5,
    "lhbCount": 4,
    "platoonNote": "one sentence on lineup handedness matchup",
    "lineupNote": "one sentence on notable lineup factors",
    "lineup": [
      {"order":1,"name":"Player Name","bats":"L","kRank":6,"projH":0.31,"projTB":0.52,"projK":0.38,"projBB":0.09},
      {"order":2,"name":"Player Name","bats":"R","kRank":14,"projH":0.26,"projTB":0.38,"projK":0.28,"projBB":0.07},
      {"order":3,"name":"Player Name","bats":"L","kRank":9,"projH":0.28,"projTB":0.41,"projK":0.34,"projBB":0.10},
      {"order":4,"name":"Player Name","bats":"L","kRank":11,"projH":0.24,"projTB":0.39,"projK":0.36,"projBB":0.12},
      {"order":5,"name":"Player Name","bats":"R","kRank":7,"projH":0.27,"projTB":0.40,"projK":0.35,"projBB":0.08},
      {"order":6,"name":"Player Name","bats":"R","kRank":19,"projH":0.21,"projTB":0.29,"projK":0.41,"projBB":0.06},
      {"order":7,"name":"Player Name","bats":"R","kRank":16,"projH":0.22,"projTB":0.31,"projK":0.39,"projBB":0.07},
      {"order":8,"name":"Player Name","bats":"R","kRank":21,"projH":0.19,"projTB":0.27,"projK":0.44,"projBB":0.05},
      {"order":9,"name":"Player Name","bats":"R","kRank":18,"projH":0.20,"projTB":0.29,"projK":0.42,"projBB":0.06}
    ]
  }
}`
}
