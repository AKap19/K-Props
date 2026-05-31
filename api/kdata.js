// ============================================================
// K PROPS SCOUT - Vercel Serverless Function
// Pulls: MLB schedule → probable starters → L10 game logs → real K lines
// Zero manual work per slate
// ============================================================

const MLB_API = 'https://statsapi.mlb.com/api/v1';
const ODDS_API = 'https://api.the-odds-api.com/v4';

// ---- CONFIG: adjust these per your preferences ----
const TARGET_DATE = null; // null = today, or set '2026-05-31' for next day
const MIN_STARTS_FOR_PLAY = 4; // pitcher must have at least this many 2026 starts
const UNDER_EDGE_THRESHOLD = -1.2; // avg must be this far BELOW line to flag as Lean Under
// ---------------------------------------------------

function getDateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function fetchJSON(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'KPropsScout/2.0', 'Accept': 'application/json', ...headers }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// 1. Get today's probable starters from MLB schedule
async function getProbableStarters(date) {
  const url = `${MLB_API}/schedule?sportId=1&date=${date}&hydrate=probablePitcher(note),team,venue,weather`;
  const data = await fetchJSON(url);
  
  const starters = [];
  for (const dateObj of (data.dates || [])) {
    for (const game of (dateObj.games || [])) {
      const gameTime = game.gameDate;
      const venue = game.venue?.name || '';
      const weather = game.weather || {};
      
      for (const side of ['home', 'away']) {
        const team = game.teams[side];
        const opp = game.teams[side === 'home' ? 'away' : 'home'];
        const pitcher = team.probablePitcher;
        if (!pitcher) continue;
        
        starters.push({
          id: pitcher.id,
          name: pitcher.fullName,
          team: team.team?.abbreviation || '',
          opponent: opp.team?.abbreviation || '',
          gameTime,
          venue,
          weather,
          isHome: side === 'home',
        });
      }
    }
  }
  return starters;
}

// Cache for game team lookups
const gameTeamCache = {};

async function getGameTeams(gamePk) {
  if (!gamePk) return { home: '', away: '' };
  if (gameTeamCache[gamePk]) return gameTeamCache[gamePk];
  try {
    const data = await fetchJSON(`${MLB_API}/game/${gamePk}/linescore`);
    const result = {
      home: data?.teams?.home?.team?.abbreviation || '',
      away: data?.teams?.away?.team?.abbreviation || '',
    };
    gameTeamCache[gamePk] = result;
    return result;
  } catch(e) {
    return { home: '', away: '' };
  }
}

// 2. Get pitcher's 2026 game log - last N starts
async function getPitcherLog(pitcherId, numStarts = 10) {
  const url = `${MLB_API}/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=2026&gameType=R`;
  try {
    const data = await fetchJSON(url);
    const splits = data?.stats?.[0]?.splits || [];
    
    const starts = splits
      .filter(s => parseInt(s.stat.gamesStarted || 0) > 0)
      .slice(-numStarts)
      .reverse(); // most recent first
    
    // Fetch game teams in parallel for all starts
    const teams = await Promise.all(
      starts.map(s => getGameTeams(s.game?.gamePk || s.gamePk))
    );

    return starts.map((s, i) => {
      const pitcherTeam = s.team?.abbreviation || '';
      const { home, away } = teams[i];
      let opp = '?';
      if (home && away) {
        opp = pitcherTeam === home ? away : home;
      }
      return {
        k:       parseInt(s.stat.strikeOuts || 0),
        opp,
        date:    s.date || '?',
        ip:      s.stat.inningsPitched || '0',
        era:     parseFloat(s.stat.era || 0),
        pitches: parseInt(s.stat.numberOfPitches || 0),
        outs:    parseInt(s.stat.outsPitched || 0),
      };
    });
  } catch(e) {
    return [];
  }
}



// 3. Get pitcher's season stats for ERA, K/9, K%, whiff
async function getPitcherSeasonStats(pitcherId) {
  const url = `${MLB_API}/people/${pitcherId}/stats?stats=season&group=pitching&season=2026&gameType=R`;
  try {
    const data = await fetchJSON(url);
    const stat = data?.stats?.[0]?.splits?.[0]?.stat || {};
    return {
      era:   parseFloat(stat.era || 0).toFixed(2),
      k9:    parseFloat(stat.strikeoutsPer9Inn || 0).toFixed(1),
      kPct:  stat.strikeoutPercentage || '0%',
      bb9:   parseFloat(stat.walksPer9Inn || 0).toFixed(1),
      whip:  parseFloat(stat.whip || 0).toFixed(2),
      ip:    parseFloat(stat.inningsPitched || 0).toFixed(1),
      starts: parseInt(stat.gamesStarted || 0),
      hand:  stat.pitcherHand || '',
    };
  } catch(e) {
    return { era: '?', k9: '?', kPct: '?', bb9: '?', whip: '?', ip: '0', starts: 0 };
  }
}

// 4. Get real K prop lines from The Odds API
async function getKPropLines(oddsApiKey) {
  if (!oddsApiKey) return {};
  
  try {
    const url = `${ODDS_API}/sports/baseball_mlb/events?apiKey=${oddsApiKey}&dateFormat=iso`;
    const events = await fetchJSON(url);
    
    if (!events || events.length === 0) return {};
    
    // Get pitcher strikeout props for all events
    const eventIds = events.slice(0, 20).map(e => e.id).join(',');
    const propsUrl = `${ODDS_API}/sports/baseball_mlb/events/${events[0].id}/odds?apiKey=${oddsApiKey}&regions=us&markets=pitcher_strikeouts&oddsFormat=american&bookmakers=fanduel`;
    
    // Fetch props per event (batch to save API calls)
    const lines = {};
    
    for (const event of events.slice(0, 16)) {
      try {
        const propsUrl = `${ODDS_API}/sports/baseball_mlb/events/${event.id}/odds?apiKey=${oddsApiKey}&regions=us&markets=pitcher_strikeouts&oddsFormat=american&bookmakers=fanduel`;
        const props = await fetchJSON(propsUrl);
        
        for (const bookmaker of (props.bookmakers || [])) {
          for (const market of (bookmaker.markets || [])) {
            if (market.key !== 'pitcher_strikeouts') continue;
            for (const outcome of (market.outcomes || [])) {
              // outcome.description = pitcher name, outcome.name = Over/Under, outcome.point = line
              const name = outcome.description || '';
              if (!lines[name]) lines[name] = { over: null, under: null, line: null, book: bookmaker.key };
              if (outcome.name === 'Over') {
                lines[name].over = outcome.price;
                lines[name].line = outcome.point;
              } else if (outcome.name === 'Under') {
                lines[name].under = outcome.price;
              }
            }
          }
        }
      } catch(e) {
        // Skip events where props aren't available yet
      }
    }
    
    return lines;
  } catch(e) {
    console.error('Odds API error:', e.message);
    return {};
  }
}

// 5. Estimate line from K/9 if no real line available
function estimateLine(k9) {
  const k9f = parseFloat(k9) || 5.0;
  // Rough model: K/9 → expected Ks in ~5.5 IP outing
  const expectedKs = (k9f / 9) * 5.5;
  // Round to nearest 0.5
  return Math.round(expectedKs * 2) / 2;
}

// 6. Calculate tier and edge
function calcTier(avg, line, direction, starts) {
  if (starts < MIN_STARTS_FOR_PLAY) return { tier: 'pass', label: 'Insufficient Data' };
  
  const edge = avg - line;
  
  if (direction === 'UNDER') {
    if (edge <= UNDER_EDGE_THRESHOLD) return { tier: 'under', label: 'Lean Under' };
    return { tier: 'pass', label: 'Pass' };
  }
  
  if (edge >= 1.5) return { tier: 'strong', label: 'Strong Edge' };
  if (edge >= 0.5) return { tier: 'mod', label: 'Moderate' };
  if (edge >= 0.0) return { tier: 'mod', label: 'Thin Edge' };
  return { tier: 'pass', label: 'Pass' };
}

// 7. Calculate confidence %
function calcConf(avg, line, tier) {
  if (tier === 'strong') return Math.min(92, Math.round(72 + (avg - line) * 8));
  if (tier === 'mod') return Math.min(74, Math.round(58 + (avg - line) * 6));
  if (tier === 'under') return Math.min(85, Math.round(70 + (line - avg) * 6));
  return 50;
}

// 8. Trend label
function calcTrend(starts) {
  if (starts.length < 3) return { txt: '→ Limited data', color: '#8e94aa' };
  const last3avg = starts.slice(0, 3).reduce((a,b) => a+b.k, 0) / 3;
  const rest = starts.slice(3);
  const restAvg = rest.length > 0 ? rest.reduce((a,b) => a+b.k, 0) / rest.length : last3avg;
  if (last3avg >= restAvg + 1.0) return { txt: '↑ Hot', color: '#3dffa0' };
  if (last3avg <= restAvg - 1.0) return { txt: '↓ Cooling', color: '#ff5a5a' };
  if (Math.max(...starts.map(s=>s.k)) - Math.min(...starts.map(s=>s.k)) >= 5) 
    return { txt: '→ Volatile', color: '#ffb83d' };
  return { txt: '→ Consistent', color: '#ffb83d' };
}

// Main handler
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=43200'); // cache 12 hours

  const oddsApiKey = process.env.ODDS_API_KEY || null;
  const date = TARGET_DATE || getDateStr(parseInt(req.query.offset || 0));

  try {
    // Step 1: Get probable starters
    const starters = await getProbableStarters(date);
    if (starters.length === 0) {
      return res.status(200).json({ success: true, date, pitchers: [], message: 'No games found for this date' });
    }

    // Step 2: Get real lines (if key available)
    const realLines = await getKPropLines(oddsApiKey);

    // Step 3: Fetch game logs + season stats for all starters in parallel
    const pitcherData = await Promise.allSettled(
      starters.map(async starter => {
        const [starts, seasonStats] = await Promise.all([
          getPitcherLog(starter.id, 10),
          getPitcherSeasonStats(starter.id),
        ]);

        const avg = starts.length > 0 
          ? starts.reduce((a,b) => a+b.k, 0) / starts.length 
          : 0;

        // Find real line or estimate
        const realLine = realLines[starter.name];
        const line = realLine?.line || estimateLine(seasonStats.k9);
        const lineSource = realLine ? '✓' : '~est';
        const overOdds = realLine?.over || null;
        const underOdds = realLine?.under || null;

        // Determine direction
        const direction = avg < line - 0.7 ? 'UNDER' : 'OVER';
        
        const { tier, label: tierLabel } = calcTier(avg, line, direction, seasonStats.starts);
        const conf = calcConf(avg, line, tier);
        const trend = calcTrend(starts);
        const edge = avg - line;

        return {
          ...starter,
          starts,
          seasonStats,
          avg: parseFloat(avg.toFixed(1)),
          line,
          lineSource,
          overOdds,
          underOdds,
          direction,
          tier,
          tierLabel,
          conf,
          trend,
          edge: parseFloat(edge.toFixed(2)),
          projK: parseFloat((avg + 0.5).toFixed(1)),
        };
      })
    );

    // Step 4: Filter and rank
    const allPitchers = pitcherData
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(p => p.seasonStats.starts >= 1); // must have at least 1 start this year

    // Sort: strong first, then mod, then under, then pass — within each by edge desc
    const tierOrder = { strong: 0, mod: 1, under: 2, pass: 3 };
    allPitchers.sort((a, b) => {
      const to = tierOrder[a.tier] - tierOrder[b.tier];
      if (to !== 0) return to;
      return b.edge - a.edge;
    });

    // Assign ranks
    allPitchers.forEach((p, i) => { p.rank = i + 1; });

    // Separate plays from passes
    const plays = allPitchers.filter(p => p.tier !== 'pass');
    const passes = allPitchers.filter(p => p.tier === 'pass');

    res.status(200).json({
      success: true,
      date,
      linesSource: Object.keys(realLines).length > 0 ? 'The Odds API ✓' : 'Estimated ~',
      totalGames: starters.length / 2,
      plays,
      passes,
      all: allPitchers,
    });

  } catch(err) {
    console.error('kdata error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
