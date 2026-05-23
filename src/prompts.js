export function gamesPrompt(dateStr, todayStr) {
  return `MLB schedule for ${dateStr}. Today is ${todayStr}. Real 2026 probable pitchers. Return array: [{"gameId":"g1","time":"7:05 PM ET","awayAbbr":"NYY","homeAbbr":"BOS","awayTeam":"New York Yankees","homeTeam":"Boston Red Sox","venue":"Fenway Park","awayPitcher":"Gerrit Cole","awayHand":"R","homePitcher":"Brayan Bello","homeHand":"R"}] All games. No other text.`
}

export function pitcherPrompt(game, pitcher, isAway, dateStr) {
  const role = isAway ? 'Away' : 'Home'
  const opposingTeam = isAway ? game.homeTeam : game.awayTeam
  const opposingAbbr = isAway ? game.homeAbbr : game.awayAbbr

  return `You are an MLB strikeout prop analyst providing raw data inputs for a weighted projection model.
Date: ${dateStr}. Game: ${game.awayTeam} @ ${game.homeTeam} at ${game.venue}.
Pitcher: ${pitcher.name} (${pitcher.hand}HP, ${role} SP) vs ${opposingTeam}.

Return ONLY this exact JSON object with REAL accurate 2026 season data through the most recent start.
Every number must be accurate — this feeds a mathematical projection model, not a display.

Key data points needed and why:
- swStrPct: swing-and-miss % — strongest stuff indicator, used as primary projection input
- cswPct: called strikes + whiffs % — if known, overrides swStrPct in model
- seasonIP: total innings pitched — used for confidence scoring
- last5: each start with oppKRank so model can opponent-adjust recent form
- oppKRank: 1=hardest lineup to K, 30=easiest — critical for L5 adjustment
- platoonVsR/L: actual K% splits — used to adjust projection for tonight's lineup handedness
- lineupKRankVsHand: how hard tonight's specific lineup is to K vs this pitcher's hand
- kPctVsHand: tonight's lineup K% vs this pitcher's hand (not overall K%)
- chaseRate: lineup chase rate out of zone — feeds small chase-rate bonus in model
- rhbCount/lhbCount: tonight's projected lineup composition
- parkKFactor: 1.0=neutral, >1=K-friendly (e.g. Petco=0.97, Wrigley wind-in=0.94, COL=1.08)
- projectedIP: expected innings tonight based on recent workload and pitch count trajectory
- isFirstStartBack: true only if returning from IL/surgery this start

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
  "platoonNote": "one sentence on dominant split or weakness tonight",
  "last5": [
    {"date": "May 18", "opp": "HOU", "oppKRank": 3, "ip": "7.0", "k": 10, "h": 4, "er": 1, "bb": 1, "pitches": 98},
    {"date": "May 12", "opp": "TEX", "oppKRank": 12, "ip": "6.0", "k": 8, "h": 6, "er": 2, "bb": 2, "pitches": 94},
    {"date": "May 7",  "opp": "LAA", "oppKRank": 22, "ip": "7.0", "k": 9, "h": 5, "er": 1, "bb": 0, "pitches": 101},
    {"date": "May 1",  "opp": "DET", "oppKRank": 8,  "ip": "5.1", "k": 6, "h": 7, "er": 4, "bb": 3, "pitches": 96},
    {"date": "Apr 25", "opp": "MIN", "oppKRank": 5,  "ip": "6.2", "k": 8, "h": 4, "er": 2, "bb": 1, "pitches": 92}
  ],
  "last10AvgK": 7.8,
  "last10AvgH": 5.5,
  "last10AvgER": 2.3,
  "last10AvgBB": 1.7,
  "last10AvgPitches": 94,
  "last10AvgOppKRank": 9,
  "pitchMix": "brief note on primary swing-and-miss pitches and current effectiveness",
  "recentFormNote": "one sentence on trajectory — improving, declining, or stable over last 3 starts",
  "projectedPitches": 96,
  "projectedOuts": 19,
  "projectedER": 2,
  "projectedH": 5,
  "projectedBB": 2,
  "opposing": {
    "team": "${opposingTeam}",
    "abbr": "${opposingAbbr}",
    "lineupKRankVsHand": 4,
    "kPctVsHand": "23.4",
    "overallKPct": "21.8",
    "chaseRate": "28.1",
    "contactRate": "77.2",
    "kPctLast14": "21.8",
    "rhbCount": 5,
    "lhbCount": 4,
    "platoonNote": "one sentence on how lineup handedness affects this specific matchup tonight",
    "lineupNote": "one sentence on any notable lineup factors — hot/cold bats, injuries, lineup position changes",
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
