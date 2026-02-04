# Play23 Bet Finder & Placer

**Winworks Take-Home Assignment**

A web application that allows users to browse available bets and place wagers on Play23.ag through direct API communication—no browser automation.

## Quick Start

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Start the server
npm start

# 3. Open browser
open http://localhost:3001

# 4. Login with test credentials
Username: wwplayer1
Password: 123
```

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│    Backend      │────▶│   Play23 API    │
│   (HTML/JS)     │     │  (Node/Express) │     │ backend.play23  │
│                 │     │   Port 3001     │     │     .ag         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │    REST API           │    HTTP + Cookies
        └───────────────────────┘
```

---

## How I Figured Out the API

### Step 1: Login Flow Discovery

I opened Chrome DevTools and navigated to `play23.ag`. The login redirects to `backend.play23.ag/Login.aspx`, revealing an ASP.NET WebForms application.

Inspecting the HTML form, I found:
```html
<input name="Account" type="text">      <!-- NOT "username" -->
<input name="Password" type="password">
<button name="BtnSubmit">Sign in</button>
```

ASP.NET also requires hidden tokens:
- `__VIEWSTATE` - Server-side state token
- `__VIEWSTATEGENERATOR` - Token generator ID

**Key Learning:** Always inspect actual HTML, don't assume field names.

### Step 2: Odds/Schedule Endpoints

After login, I navigated to the sportsbook and watched network requests:

```
GET /wager/NewScheduleHelper.aspx?WT=0&lg=535
```

**Key Discovery:** The API returns **JSON**, not HTML! Structure:
```json
{
  "result": {
    "listLeagues": [[
      {
        "Description": "NBA - GAME LINES",
        "Games": [{
          "idgm": 5421290,
          "vtm": "PHI 76ERS",
          "htm": "GS WARRIORS",
          "vnum": 575,
          "hnum": 576,
          "GameLines": [{
            "vsprdh": "+4½-108",
            "hsprdh": "-4½-112",
            "ovh": "o222-110",
            "voddsh": "+150",
            "hoddsh": "-180"
          }]
        }]
      }
    ]]
  }
}
```

Parameters discovered:
- `WT` = Wager Type (0=straight, 1=parlay, 2=teaser)
- `lg` = League ID (535=NBA, 43=CBB, 4029=NFL)

### Step 3: Bet Selection Format

By analyzing the minified React frontend (3.8MB), I discovered the selection encoding:

```
sel=0_5421290_4.5_-108
    │  │       │    │
    │  │       │    └── Odds
    │  │       └── Points/Spread value
    │  └── Game ID (idgm)
    └── Play (0=visitor, 1=home)
```

### Step 4: Bet Placement Flow (JSON API)

Placing a bet requires THREE sequential POST requests using `application/x-www-form-urlencoded`:

1. **Compile:** `POST /wager/CreateWagerHelper.aspx`
   ```
   open=0&WT=0&sel=0_5421290_4.5_-108
   ```
   - Returns `WagerCompile` with bet details and IDWT

2. **Confirm:** `POST /wager/ConfirmWagerHelper.aspx`
   ```
   WT=0&IDWT=966101&sel=...&detailData=[...]&password=123&amount=25
   ```
   - Validates amount and password

3. **Post:** `POST /wager/PostWagerMultipleHelper.aspx`
   ```
   postWagerRequests=[{"WT":0,"IDWT":966101,"sel":"...","confirmPassword":"123",...}]
   ```
   - Actually places the bet
   - Returns ticket number (e.g., `207810485`)

---

## API Endpoints Reference

| Endpoint | Method | Content-Type | Purpose |
|----------|--------|--------------|---------|
| `/Login.aspx` | POST | form-urlencoded | Authentication with ViewState tokens |
| `/wager/NewScheduleHelper.aspx` | GET | - | Fetch odds (returns JSON) |
| `/wager/CreateWagerHelper.aspx` | POST | form-urlencoded | Compile wager (validate selection) |
| `/wager/ConfirmWagerHelper.aspx` | POST | form-urlencoded | Confirm with password & amount |
| `/wager/PostWagerMultipleHelper.aspx` | POST | form-urlencoded | Execute bet (returns ticket) |
| `/wager/PlayerInfoHelper.aspx` | GET | - | Account info |
| `/Logout.aspx` | GET | - | End session |

### Key API Discoveries (Gotchas)

During reverse-engineering, several non-obvious details were discovered:

1. **`amountType` must be integer `1`, not string `'W'`**
   - The frontend sends `amountType: 1` (meaning "wager amount")
   - Sending `'W'` or `'0'` causes "Input string was not in a correct format" error

2. **Post endpoint is `PostWagerMultipleHelper.aspx`, not `PostWagerHelper.aspx`**
   - The payload is wrapped in `postWagerRequests: JSON.stringify([{...}])`
   - Password field must be `confirmPassword`, not `password`

3. **`detailData` must include proper `Points` object**
   ```javascript
   detailData: [{
     IdGame: 5421290,
     Play: 0,
     Amount: 25,
     RiskWin: 0,  // Integer, not string
     Points: { BuyPoints: 0, BuyPointsDesc: '', LineDesc: '', selected: true }
   }]
   ```

4. **Selection string format from API**
   - The API returns pre-built `sel` strings in the odds response
   - Format: `{play}_{idgm}_{points}_{odds}` (e.g., `0_5421290_5_-110`)

---

## Project Structure

```
winworks-assignment-2/
├── backend/
│   ├── server.js           # Express API server
│   ├── play23-client.js    # Play23 HTTP client
│   ├── package.json        # Dependencies
│   └── .env.example        # Environment template
├── frontend/
│   ├── index.html          # Main UI
│   └── app.js              # Frontend logic
├── transcripts/
│   ├── 01-api-reverse-engineering.md
│   └── 02-implementation-build.md
├── README.md               # This file
├── REFLECTION.md           # Project reflection
└── .gitignore
```

---

## Features

### Part 1: Bet Finder (Frontend)
- ✅ Login with Play23 credentials
- ✅ Browse available games by league (NBA, NFL, College BB)
- ✅ **Live odds from Play23 JSON API** (with fallback data)
- ✅ View spread, total, and moneyline odds
- ✅ Select bet and specify stake amount
- ✅ Real-time payout calculation (American odds)
- ✅ Place bet button with password confirmation
- ✅ Pre-built selection strings for accurate bet placement

### Part 2: Bet Placer (Backend)
- ✅ Direct JSON API communication (no browser automation)
- ✅ Cookie-based session management
- ✅ ASP.NET ViewState token handling
- ✅ **Three-step bet placement flow** (Compile → Confirm → Post)
- ✅ Session expiration detection
- ✅ Error handling:
  - Odds changed (409)
  - Insufficient balance (402)
  - Market closed (410)
  - Minimum bet not met (400)
  - Invalid password (401)
  - Session expired (401)

---

## Error Handling

| Error Type | HTTP Code | Description |
|------------|-----------|-------------|
| `ODDS_CHANGED` | 409 | Odds changed since selection |
| `INSUFFICIENT_BALANCE` | 402 | Not enough funds |
| `MARKET_CLOSED` | 410 | Betting closed |
| `MIN_BET_NOT_MET` | 400 | Below $25 minimum |
| `INVALID_PASSWORD` | 401 | Wrong confirmation password |

---

## Limitations

1. **Odds Parsing:** Uses Play23's JSON API. Falls back to sample data if the API response format changes.

2. **Session Timeout:** Detects expired sessions and prompts re-login. Production would benefit from automatic refresh.

3. **Real-time Updates:** Odds fetched on page load and league change—not WebSocket live updates.

4. **League Support:** NBA, NFL, and College Basketball have dedicated fallback data. Other leagues depend on live API.

---

## Dependencies

```json
{
  "express": "^4.18.2",
  "axios": "^1.6.0",
  "cors": "^2.8.5",
  "tough-cookie": "^4.1.3",
  "axios-cookiejar-support": "^5.0.0",
  "dotenv": "^16.3.1"
}
```

Install with: `npm install`

---

## Testing

```bash
# Health check
curl http://localhost:3001/api/health

# Login test
curl -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"wwplayer1","password":"123"}'

# Expected response:
{
  "success": true,
  "sessionId": "session_xxx",
  "message": "Welcome back, wwplayer1!"
}
```

---

## Verified Working

Bets successfully placed via the API (February 3, 2026):

| Ticket # | Bet Description | Risk | Win |
|----------|-----------------|------|-----|
| 207810253 | [575] PHI 76ERS +5-110 | $28 | $25 |
| 207810333 | [575] PHI 76ERS +5-110 | $28 | $25 |
| 207810429 | [575] PHI 76ERS +5-110 | $28 | $25 |
| 207810485 | [575] PHI 76ERS +5-110 | $28 | $25 |

---

## Author

Jose Hernandez
Winworks Take-Home Assignment
February 2026
