fs = require('fs')
const moment = require('moment');
const readline = require('readline');
const { parse } = require('json2csv');

function wait(query = 'Press any key...') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }))
}

const RESULT = {
  HOME: 'HOME',
  AWAY: 'AWAY',
  TIE: 'TIE'
}

const KEYS = {
  AT: 'AT',
  HT: 'HT',
  LEAGUE: 'League',
  SEASON: 'Season',
  DATE: 'Date',
  A_GOALS: '1. GS', // Buts Away
  H_GOALS: '2. GA', // Buts Home
  H_xGOALS: '5. xGA', // XG Away
  A_xGOALS: '4. xG', // XG Home,
  WINNER: 'Winner',
  A_PTS: 'A Pts', // Points gagné sur le match
  A_xPTS: 'A_xPTS', // Points expected gagné sur la match
  H_xPTS: 'H_xPTS',
  H_PTS: 'H Pts',

  A_RANK: 'A_RANK', // Classement avant le match
  A_xRANK: 'A_xRANK', // Classement expected avant le match
  H_RANK: 'H_RANK',
  H_xRANK: 'H_xRANK',

  H_BUTS_MARQUES: 'H_BP',
  H_BUTS_CONCEDE: 'H_BC',
  H_WIN: 'H_W',
  H_LOSE: 'H_L',
  H_TIE: 'H_T',

  H_xBUTS_MARQUES: 'H_xBP',
  H_xBUTS_CONCEDE: 'H_xBC',
  H_xWIN: 'H_xW',
  H_xLOSE: 'H_xL',
  H_xTIE: 'H_xT',

  A_BUTS_MARQUES: 'A_BP',
  A_BUTS_CONCEDE: 'A_BC',
  A_WIN: 'A_W',
  A_LOSE: 'A_L',
  A_TIE: 'A_T',

  A_xBUTS_MARQUES: 'A_xBP',
  A_xBUTS_CONCEDE: 'A_xBC',
  A_xWIN: 'A_xW',
  A_xLOSE: 'A_xL',
  A_xTIE: 'A_xT',

  RESULT: 'RESULT',

  H_REST: 'H_REST',
  A_REST: 'A_REST',
};

const REMOVE_BEFORE_EXPORT = [
    KEYS.A_GOALS,
    KEYS.H_GOALS,
    KEYS.H_xGOALS,
    KEYS.A_xGOALS,
    KEYS.A_PTS,
    KEYS.A_xPTS,
    KEYS.H_xPTS,
    KEYS.H_PTS,
]

const INDEXES_KEYS = Object.keys(KEYS);

function formatCsv(data) {
  let result = data.split(/\r?\n/);

  for (let i = 0; i < result.length; i++) {
    result[i] = result[i].split('\t');
  }

  const headers = result[0];

  for (let i = 0; i < result.length; i++) {
    const line = result[i];
    result[i] = [];
    for (let j = 0; j < headers.length; j++) {
      result[i][headers[j]] = line[j]
    }
  }

  result.shift();
  return result;
}

function keepIndexIncludes(key) {
  for (let i = 0; i < INDEXES_KEYS.length; i++) {
    if (KEYS[INDEXES_KEYS[i]] === key) {
      return true;
    }
  }
  return false;
}

function setResult(line, fromExpected = false) {
  const awayGoalKey = fromExpected ? KEYS.A_xGOALS : KEYS.A_GOALS;
  const homeGoalKey = fromExpected ? KEYS.H_xGOALS : KEYS.H_GOALS;
  const homePointKey = fromExpected ? KEYS.H_xPTS : KEYS.H_PTS;
  const awayPointKey = fromExpected ? KEYS.A_xPTS : KEYS.A_PTS;

  if (line[awayGoalKey] === line[homeGoalKey]) {
    line[homePointKey] = 1;
    line[awayPointKey] = 1;
    line[KEYS.RESULT] = RESULT.TIE;
  } else if (line[awayGoalKey] < line[homeGoalKey]) {
    line[homePointKey] = 3;
    line[awayPointKey] = 0;
    line[KEYS.RESULT] = RESULT.HOME;
  } else {
    line[homePointKey] = 0;
    line[awayPointKey] = 3;
    line[KEYS.RESULT] = RESULT.AWAY;
  }

}

function getPreviousMatch(result, team, index) {
  for (let i = index - 1; i >= 0; i--) {
    if (result[i][KEYS.AT] === team || result[i][KEYS.HT] === team) {
      return result[i];
    }
  }

  return undefined;
}

function getRank(ranking, team, xRanking, season) {
  if (!ranking[season]) { ranking[season] = []; }
  if (!xRanking[season]) { xRanking[season] = []; }

  let rank = ranking[season].find((el) => el.team === team);
  let xRank = xRanking[season].find((el) => el.team === team);

  if (!rank) {
    rank = {team: team, point: 0, matchCount: 0, win: 0, lose: 0, tie: 0, bp: 0, bc: 0};
    ranking[season].push(rank);
  }

  if (!xRank) {
    xRank = {team: team, point: 0, matchCount: 0, win: 0, lose: 0, tie: 0, bp: 0, bc: 0};
    xRanking[season].push(xRank);
  }
  return {rank, xRank};
}

function updateRankStats(result, i, wasHome, rank, xRank) {
  if (result[i][wasHome ? KEYS.H_PTS : KEYS.A_PTS] === 3) {
    rank.win += 1;
  } else if (result[i][wasHome ? KEYS.H_PTS : KEYS.A_PTS] === 1) {
    rank.tie += 1;
  } else {
    rank.lose += 1;
  }

  rank.bp += parseInt(result[i][wasHome ? KEYS.H_GOALS : KEYS.A_GOALS]);
  rank.bc += parseInt(result[i][wasHome ? KEYS.A_GOALS : KEYS.H_GOALS]);

  if (result[i][wasHome ? KEYS.H_xPTS : KEYS.A_xPTS] === 3) {
    xRank.win += 1;
  } else if (result[i][wasHome ? KEYS.H_xPTS : KEYS.A_xPTS] === 1) {
    xRank.tie += 1;
  } else {
    xRank.lose += 1;
  }

  xRank.bp += parseInt(result[i][wasHome ? KEYS.H_xGOALS : KEYS.A_xGOALS]);
  xRank.bc += parseInt(result[i][wasHome ? KEYS.A_xGOALS : KEYS.H_xGOALS]);
}

// Stats de l'équipe avant le match
function updateMatchStats(result, i, wasHome, rank, xRank) {
  result[i][wasHome ? KEYS.H_WIN : KEYS.A_WIN] = rank.win;
  result[i][wasHome ? KEYS.H_LOSE : KEYS.A_LOSE] = rank.lose;
  result[i][wasHome ? KEYS.H_TIE : KEYS.A_TIE] = rank.tie;

  result[i][wasHome ? KEYS.H_BUTS_MARQUES : KEYS.A_BUTS_MARQUES] = rank.bp;
  result[i][wasHome ? KEYS.H_BUTS_CONCEDE : KEYS.A_BUTS_CONCEDE] = rank.bc;

  result[i][wasHome ? KEYS.H_xWIN : KEYS.A_xWIN] = xRank.win;
  result[i][wasHome ? KEYS.H_xLOSE : KEYS.A_xLOSE] = xRank.lose;
  result[i][wasHome ? KEYS.H_xTIE : KEYS.A_xTIE] = xRank.tie;

  result[i][wasHome ? KEYS.H_xBUTS_MARQUES : KEYS.A_xBUTS_MARQUES] = xRank.bp;
  result[i][wasHome ? KEYS.H_xBUTS_CONCEDE : KEYS.A_xBUTS_CONCEDE] = xRank.bc;
}

function updateRank(result, team, i, ranking, xRanking) {
  const season = `${result[i][KEYS.LEAGUE]} ${result[i][KEYS.SEASON]}`;
  const match = result[i];

  let {rank, xRank} = getRank(ranking, team, xRanking, season);

  const wasHome = match[KEYS.HT] === team;
  match[wasHome ? KEYS.H_RANK : KEYS.A_RANK] = ranking[season].indexOf(rank) + 1;
  match[wasHome ? KEYS.H_xRANK : KEYS.A_xRANK] = xRanking[season].indexOf(xRank) + 1;

  updateMatchStats(result, i, wasHome, rank, xRank);

  rank.matchCount = rank.matchCount + 1;

  updateRankStats(result, i, wasHome, rank, xRank);

  rank.point += match[wasHome ? KEYS.H_PTS : KEYS.A_PTS];
  xRank.point += match[wasHome ? KEYS.H_xPTS : KEYS.A_xPTS];

  const previous = getPreviousMatch(result, team, i);

  if (previous) {
    const rest = match[KEYS.DATE].diff(previous[KEYS.DATE], 'days');

    match[wasHome ? KEYS.H_REST : KEYS.A_REST] = rest;
  } else {
    match[wasHome ? KEYS.H_REST : KEYS.A_REST] = 3;
  }
}

function makeRanking(result) {
  const ranking = [];
  const xRanking = [];

  for (let i = 0; i < result.length; i++) {
    const line = result[i];
    const season = `${result[i][KEYS.LEAGUE]} ${result[i][KEYS.SEASON]}`

    updateRank(result, line[KEYS.HT], i, ranking, xRanking);
    updateRank(result, line[KEYS.AT], i, ranking, xRanking);

    ranking[season].sort((a, b) => b.point - a.point);
    xRanking[season].sort((a, b) => b.point - a.point);

    // const ans = await askQuestion("Are you sure you want to deploy to PRODUCTION? ");
  }

  printRanking(ranking);
  console.log('');
  console.log('Expected: ');
  printRanking(xRanking);
}

function printRanking(ranking) {
  Object.keys(ranking).forEach((key) => {
    console.log(key);
    const rank = ranking[key];
    for (let i = 0; i < rank.length; i++) {
      console.log((i + 1), rank[i].team, 'PTS', rank[i].point, 'W',rank[i].win, 'T', rank[i].tie, 'L', rank[i].lose, 'BP', rank[i].bp, 'BC', rank[i].bc);
    }
  });
}

function extractData(result) {
  for (let i = 0; i < result.length; i++) {
    Object.keys(result[i]).forEach((key) => {
      if (!keepIndexIncludes(key)) {
        delete result[i][key];
      }

      result[i][KEYS.DATE] = moment(result[i][KEYS.DATE], 'DD/MM/YYYY');

      setResult(result[i], false);
      setResult(result[i], true);
    });
  }

  result = result.sort((la, lb) => la[KEYS.DATE] - lb[KEYS.DATE]);
}

function clearBeforeExport(result) {
  for (let i = 0; i < result.length; i++) {
    Object.keys(result[i]).forEach((key) => {
      if (REMOVE_BEFORE_EXPORT.includes(key)) {
        delete result[i][key];
      }
    });
  }
}

fs.readFile('very_full.csv', 'utf16le', function (err,data) {
  if (err) {
    return console.log(err);
  }

  let result = formatCsv(data).filter((line) => line[KEYS.DATE] && line['Home Away'] === 'Away');
  extractData(result);
  makeRanking(result);
  clearBeforeExport(result);

  try {
    let csv = parse(result);
    csv = csv.replace(/"(\d+),(\d+)"/gm, "\"$1.$2\"");
    const path='export.csv';
    fs.writeFile(path, csv, function(err,data) {
      if (err) {throw err;}
    });
  } catch (err) {
  }
});
