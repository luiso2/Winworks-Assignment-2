# AI Transcript: Implementation Build Session

## Session Info
- **Date:** February 3, 2026
- **Tool:** Claude Code (Opus 4.5)
- **Objective:** Build frontend and backend for Play23 bet placement

---

## Prompt 1: Project Setup

**User:** Create the project structure for the Play23 bet finder

**Claude:** I'll create a Node.js project with Express backend and vanilla JS frontend.

```bash
mkdir -p winworks-assignment-2/{backend,frontend,transcripts}
cd winworks-assignment-2/backend
npm init -y
```

**Created Structure:**
```
winworks-assignment-2/
├── backend/
│   ├── server.js
│   ├── play23-client.js
│   └── package.json
├── frontend/
│   ├── index.html
│   └── app.js
└── transcripts/
```

---

## Prompt 2: Backend - Express Server

**User:** Create the Express server with API endpoints for login, odds, and bet placement

**Claude:** I'll create server.js with RESTful endpoints.

```javascript
// server.js - Key endpoints
app.post('/api/login', async (req, res) => {
  // Authenticate with Play23
});

app.get('/api/odds/:leagueId', async (req, res) => {
  // Fetch available bets
});

app.post('/api/bet', async (req, res) => {
  // Place bet via Play23 API
});
```

**Dependencies:**
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "axios": "^1.6.0",
    "cors": "^2.8.5",
    "tough-cookie": "^4.1.3",
    "axios-cookiejar-support": "^5.0.0",
    "dotenv": "^16.3.1"
  }
}
```

---

## Prompt 3: Play23 API Client

**User:** Create a client class that handles all Play23 API communication with cookie management

**Claude:** I'll create play23-client.js with axios and cookie jar support.

```javascript
// play23-client.js
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

class Play23Client {
  constructor() {
    this.cookieJar = new CookieJar();
    this.client = wrapper(axios.create({
      baseURL: 'https://backend.play23.ag',
      jar: this.cookieJar,
      withCredentials: true
    }));
  }

  async login(username, password) {
    // Extract __VIEWSTATE from login page
    // Submit form with Account, Password, BtnSubmit
  }

  async placeBet({ selection, amount, password }) {
    // POST to CreateWagerHelper
    // POST to ConfirmWagerHelper
    // POST to PostWagerMultipleHelper
  }
}
```

---

## Prompt 4: Debug Login Failure

**User:** The login is returning "Login failed - unknown error". Debug this.

**Claude:** Let me inspect what fields Play23 actually expects.

```bash
curl -s https://backend.play23.ag/Login.aspx | grep -i "name="
```

**Discovery:**
```html
<input name="Account" ...>   <!-- NOT "Username" -->
<input name="Password" ...>
<button name="BtnSubmit" ...>
```

**Fix Applied:**
```javascript
// Changed from:
formData.append('ctl00$MainContent$txtUser', username);

// To:
formData.append('Account', username);
formData.append('Password', password);
formData.append('BtnSubmit', 'Sign in');
```

**Result:** Login now redirects to Welcome.aspx - SUCCESS!

---

## Prompt 5: Frontend - Bet Finder UI

**User:** Create a simple frontend with login, game browsing, and bet slip

**Claude:** I'll create index.html with a dark theme and app.js for logic.

```html
<!-- index.html structure -->
<div id="login-screen">
  <!-- Username/password form -->
</div>

<div id="main-app">
  <!-- Balance display -->
  <!-- Bet slip (left column) -->
  <!-- Games list (right column) -->
</div>
```

```javascript
// app.js - Key functions
async function handleLogin(e) {
  const response = await fetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

function selectBet(gameId, team, type, line, odds, rot) {
  selectedBet = { gameId, team, type, line, odds, rot };
  updateBetSummary();
}

async function placeBet() {
  const response = await fetch('/api/bet', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId },
    body: JSON.stringify({ selection, amount, password })
  });
}
```

---

## Prompt 6: Error Handling

**User:** Implement proper error handling for common bet placement failures

**Claude:** I'll add error type mapping in the backend and user-friendly messages in the frontend.

```javascript
// Backend - Error type mapping
if (result.errorType === 'ODDS_CHANGED') {
  return res.status(409).json(errorResponse); // Conflict
} else if (result.errorType === 'INSUFFICIENT_BALANCE') {
  return res.status(402).json(errorResponse); // Payment Required
} else if (result.errorType === 'MARKET_CLOSED') {
  return res.status(410).json(errorResponse); // Gone
}

// Frontend - Error display
if (data.errorType === 'ODDS_CHANGED') {
  showAppStatus('Odds have changed! Please re-select your bet.', 'error');
} else if (data.errorType === 'INSUFFICIENT_BALANCE') {
  showAppStatus('Insufficient balance for this bet.', 'error');
}
```

---

## Prompt 7: American Odds Calculator

**User:** Add payout calculation for American odds

**Claude:** I'll implement the standard American odds formula.

```javascript
function updateBetSummary() {
  const stake = parseFloat(document.getElementById('stake-amount').value);
  let oddsValue = parseInt(selectedBet.odds);
  let toWin = 0;

  if (oddsValue < 0) {
    // Favorite: risk |odds| to win 100
    // Example: -115 means risk $115 to win $100
    toWin = (stake * 100) / Math.abs(oddsValue);
  } else {
    // Underdog: risk 100 to win odds
    // Example: +150 means risk $100 to win $150
    toWin = (stake * oddsValue) / 100;
  }

  document.getElementById('summary-towin').textContent = '$' + toWin.toFixed(2);
}
```

---

## Prompt 8: Serve Frontend from Backend

**User:** Make the backend serve the frontend so we only need one server

**Claude:** I'll add static file serving to Express.

```javascript
// server.js
const path = require('path');

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});
```

**Result:** Single server at `http://localhost:3001` serves both API and UI.

---

## Final Testing

```bash
# Start server
cd backend && npm start

# Test login
curl -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"wwplayer1","password":"123"}'

# Response:
{
  "success": true,
  "sessionId": "session_1770156297420_2uptw22zz",
  "message": "Welcome back, wwplayer1!"
}
```

**Build Complete!** Frontend + Backend working together.
