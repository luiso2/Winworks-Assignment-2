/**
 * Play23 Bet Finder - Frontend Application
 * Winworks Take-Home Assignment
 */

// Configuration
const API_BASE = 'http://localhost:3001/api';
let sessionId = null;
let selectedBet = null;

// Sample games data (based on real Play23 structure)
const sampleGames = [
  {
    id: '5421295',
    date: 'Feb 03',
    time: '7:40 PM',
    team1: { name: 'LA LAKERS', rot: '565' },
    team2: { name: 'BRK NETS', rot: '566' },
    spread1: '-7½', spreadOdds1: '-115',
    spread2: '+7½', spreadOdds2: '-105',
    total: '221½', totalOver: '-110', totalUnder: '-110',
    ml1: '-300', ml2: '+250'
  },
  {
    id: '5421296',
    date: 'Feb 03',
    time: '8:10 PM',
    team1: { name: 'BOS CELTICS', rot: '569' },
    team2: { name: 'DAL MAVERICKS', rot: '570' },
    spread1: '-5½', spreadOdds1: '-110',
    spread2: '+5½', spreadOdds2: '-110',
    total: '218', totalOver: '-110', totalUnder: '-110',
    ml1: '-220', ml2: '+180'
  },
  {
    id: '5421297',
    date: 'Feb 03',
    time: '7:10 PM',
    team1: { name: 'DEN NUGGETS', rot: '561' },
    team2: { name: 'DET PISTONS', rot: '562' },
    spread1: '-9', spreadOdds1: '-110',
    spread2: '+9', spreadOdds2: '-110',
    total: '224½', totalOver: '-110', totalUnder: '-110',
    ml1: '-400', ml2: '+320'
  },
  {
    id: '5421298',
    date: 'Feb 03',
    time: '8:10 PM',
    team1: { name: 'CHI BULLS', rot: '571' },
    team2: { name: 'MIL BUCKS', rot: '572' },
    spread1: '+8', spreadOdds1: '-110',
    spread2: '-8', spreadOdds2: '-110',
    total: '231', totalOver: '-110', totalUnder: '-110',
    ml1: '+280', ml2: '-350'
  }
];

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
const loginForm = document.getElementById('login-form');
const loginStatus = document.getElementById('login-status');
const appStatus = document.getElementById('app-status');
const gamesList = document.getElementById('games-list');
const gamesLoading = document.getElementById('games-loading');

// Initialize event listeners
function init() {
  loginForm.addEventListener('submit', handleLogin);
  document.getElementById('stake-amount').addEventListener('input', updateBetSummary);
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('place-bet-btn').addEventListener('click', placeBet);
  document.getElementById('clear-bet-btn').addEventListener('click', clearBetSlip);
  document.getElementById('league-select').addEventListener('change', loadGames);
  document.getElementById('search-btn').addEventListener('click', searchGames);
}

// Login Handler
async function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  showLoginStatus('Logging in...', 'info');

  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.success) {
      sessionId = data.sessionId;
      document.getElementById('display-username').textContent = username;

      // Update balance
      if (data.balance) {
        updateBalanceDisplay(data.balance);
      }

      // Show main app
      loginScreen.classList.add('hidden');
      mainApp.classList.remove('hidden');

      // Load initial games
      loadGames();
    } else {
      showLoginStatus(data.error || 'Login failed', 'error');
    }
  } catch (error) {
    showLoginStatus('Connection error: ' + error.message, 'error');
  }
}

// Update balance display
function updateBalanceDisplay(balance) {
  document.getElementById('balance-current').textContent = '$' + balance.current.toLocaleString();
  document.getElementById('balance-available').textContent = '$' + balance.available.toLocaleString();
  document.getElementById('balance-risk').textContent = '$' + balance.atRisk.toLocaleString();
}

// Load Games
async function loadGames() {
  const leagueId = document.getElementById('league-select').value;

  gamesLoading.classList.remove('hidden');
  gamesList.textContent = '';

  try {
    const response = await fetch(`${API_BASE}/odds/${leagueId}`, {
      headers: { 'X-Session-Id': sessionId }
    });

    await response.json();

    gamesLoading.classList.add('hidden');

    // Render games using safe DOM methods
    renderGames(sampleGames);

  } catch (error) {
    gamesLoading.classList.add('hidden');
    showAppStatus('Failed to load games: ' + error.message, 'error');
  }
}

// Render games using safe DOM methods
function renderGames(games) {
  gamesList.textContent = '';

  games.forEach(game => {
    const gameItem = document.createElement('div');
    gameItem.className = 'game-item';
    gameItem.dataset.gameId = game.id;

    // Teams header
    const teamsDiv = document.createElement('div');
    teamsDiv.className = 'game-teams';

    // Team 1
    const team1Div = document.createElement('div');
    const team1Name = document.createElement('div');
    team1Name.className = 'team';
    team1Name.textContent = game.team1.name;
    const team1Rot = document.createElement('div');
    team1Rot.className = 'team-rot';
    team1Rot.textContent = '#' + game.team1.rot;
    team1Div.appendChild(team1Name);
    team1Div.appendChild(team1Rot);

    // Date/Time
    const dateDiv = document.createElement('div');
    dateDiv.style.textAlign = 'center';
    dateDiv.style.color = 'rgba(255,255,255,0.3)';
    const dateText = document.createElement('div');
    dateText.textContent = game.date;
    const timeText = document.createElement('div');
    timeText.textContent = game.time;
    dateDiv.appendChild(dateText);
    dateDiv.appendChild(timeText);

    // Team 2
    const team2Div = document.createElement('div');
    team2Div.style.textAlign = 'right';
    const team2Name = document.createElement('div');
    team2Name.className = 'team';
    team2Name.textContent = game.team2.name;
    const team2Rot = document.createElement('div');
    team2Rot.className = 'team-rot';
    team2Rot.textContent = '#' + game.team2.rot;
    team2Div.appendChild(team2Name);
    team2Div.appendChild(team2Rot);

    teamsDiv.appendChild(team1Div);
    teamsDiv.appendChild(dateDiv);
    teamsDiv.appendChild(team2Div);

    // Odds grid
    const oddsDiv = document.createElement('div');
    oddsDiv.className = 'game-odds';

    // Create odds buttons
    const oddsButtons = [
      { team: game.team1.name, type: 'spread', line: game.spread1, odds: game.spreadOdds1, rot: game.team1.rot, label: 'Spread' },
      { team: 'OVER', type: 'total', line: 'o' + game.total, odds: game.totalOver, rot: game.team1.rot, label: 'Total' },
      { team: game.team1.name, type: 'ml', line: game.ml1, odds: '', rot: game.team1.rot, label: 'ML' },
      { team: game.team2.name, type: 'spread', line: game.spread2, odds: game.spreadOdds2, rot: game.team2.rot, label: 'Spread' },
      { team: 'UNDER', type: 'total', line: 'u' + game.total, odds: game.totalUnder, rot: game.team2.rot, label: 'Total' },
      { team: game.team2.name, type: 'ml', line: game.ml2, odds: '', rot: game.team2.rot, label: 'ML' }
    ];

    oddsButtons.forEach(btn => {
      const oddsBtn = document.createElement('div');
      oddsBtn.className = 'odds-btn';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'odds-label';
      labelSpan.textContent = btn.label;

      const oddsText = document.createTextNode(btn.line + ' ' + btn.odds);

      oddsBtn.appendChild(labelSpan);
      oddsBtn.appendChild(oddsText);

      oddsBtn.addEventListener('click', () => {
        selectBet(game.id, btn.team, btn.type, btn.line, btn.odds || btn.line, btn.rot, oddsBtn);
      });

      oddsDiv.appendChild(oddsBtn);
    });

    gameItem.appendChild(teamsDiv);
    gameItem.appendChild(oddsDiv);
    gamesList.appendChild(gameItem);
  });
}

// Select a bet
function selectBet(gameId, team, type, line, odds, rot, btnElement) {
  selectedBet = {
    gameId,
    team,
    type,
    line,
    odds: odds,
    rot,
    selection: '0_' + gameId + '_' + line.replace('½', '.5') + '_' + odds
  };

  // Update UI
  document.getElementById('bet-slip-empty').classList.add('hidden');
  document.getElementById('bet-slip-content').classList.remove('hidden');

  document.getElementById('slip-team').textContent = team + ' ' + line;
  document.getElementById('slip-details').textContent = type.toUpperCase() + ' - ROT #' + rot;
  document.getElementById('summary-odds').textContent = odds;

  // Clear previous selection
  document.querySelectorAll('.odds-btn.selected').forEach(el => el.classList.remove('selected'));
  btnElement.classList.add('selected');

  updateBetSummary();
}

// Update bet summary calculations
function updateBetSummary() {
  const stake = parseFloat(document.getElementById('stake-amount').value) || 0;
  document.getElementById('summary-stake').textContent = '$' + stake;

  if (selectedBet) {
    let oddsValue = parseInt(selectedBet.odds);
    let toWin = 0;

    if (oddsValue < 0) {
      toWin = (stake * 100) / Math.abs(oddsValue);
    } else {
      toWin = (stake * oddsValue) / 100;
    }

    document.getElementById('summary-towin').textContent = '$' + toWin.toFixed(2);
  }
}

// Clear bet slip
function clearBetSlip() {
  selectedBet = null;
  document.getElementById('bet-slip-empty').classList.remove('hidden');
  document.getElementById('bet-slip-content').classList.add('hidden');
  document.querySelectorAll('.odds-btn.selected').forEach(el => el.classList.remove('selected'));
}

// Place bet
async function placeBet() {
  if (!selectedBet) {
    showAppStatus('Please select a bet first', 'error');
    return;
  }

  const amount = parseFloat(document.getElementById('stake-amount').value);
  const password = document.getElementById('confirm-password').value;

  if (amount < 25) {
    showAppStatus('Minimum bet amount is $25', 'error');
    return;
  }

  if (!password) {
    showAppStatus('Please enter your password to confirm', 'error');
    return;
  }

  showAppStatus('Placing bet...', 'info');

  try {
    const response = await fetch(`${API_BASE}/bet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId
      },
      body: JSON.stringify({
        selection: selectedBet.selection,
        amount,
        password,
        wagerType: 0,
        leagueId: document.getElementById('league-select').value
      })
    });

    const data = await response.json();

    if (data.success) {
      showAppStatus('Bet placed! Ticket #' + data.ticketNumber + ' - Risking $' + data.risking + ' to win $' + data.toWin, 'success');
      clearBetSlip();
      refreshBalance();
    } else {
      let errorMsg = data.error;
      if (data.errorType === 'ODDS_CHANGED') {
        errorMsg = 'Odds have changed! Please re-select your bet.';
      } else if (data.errorType === 'INSUFFICIENT_BALANCE') {
        errorMsg = 'Insufficient balance for this bet.';
      } else if (data.errorType === 'MARKET_CLOSED') {
        errorMsg = 'This market is closed.';
      }
      showAppStatus(errorMsg, 'error');
    }
  } catch (error) {
    showAppStatus('Connection error: ' + error.message, 'error');
  }
}

// Refresh balance
async function refreshBalance() {
  try {
    const response = await fetch(`${API_BASE}/balance`, {
      headers: { 'X-Session-Id': sessionId }
    });
    const data = await response.json();

    if (data.success && data.balance) {
      updateBalanceDisplay(data.balance);
    }
  } catch (error) {
    console.error('Failed to refresh balance:', error);
  }
}

// Search games
function searchGames() {
  const query = document.getElementById('search-input').value.toLowerCase();
  if (!query) {
    loadGames();
    return;
  }

  const filteredGames = sampleGames.filter(game =>
    game.team1.name.toLowerCase().includes(query) ||
    game.team2.name.toLowerCase().includes(query)
  );

  renderGames(filteredGames);
}

// Logout
async function logout() {
  try {
    await fetch(`${API_BASE}/logout`, {
      method: 'POST',
      headers: { 'X-Session-Id': sessionId }
    });
  } catch (e) {
    // Ignore logout errors
  }

  sessionId = null;
  selectedBet = null;
  mainApp.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  loginStatus.textContent = '';
}

// Show login status
function showLoginStatus(message, type) {
  const div = document.createElement('div');
  div.className = 'status ' + type;
  div.textContent = message;
  loginStatus.textContent = '';
  loginStatus.appendChild(div);
}

// Show app status
function showAppStatus(message, type) {
  const div = document.createElement('div');
  div.className = 'status ' + type;
  div.textContent = message;
  appStatus.textContent = '';
  appStatus.appendChild(div);

  if (type === 'success' || type === 'info') {
    setTimeout(() => { appStatus.textContent = ''; }, 5000);
  }
}

// Initialize on load
init();
