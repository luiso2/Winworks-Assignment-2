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

Parameters discovered:
- `WT` = Wager Type (0=straight, 1=parlay, 2=teaser)
- `lg` = League ID (535=NBA, 43=CBB, 4029=NFL)

### Step 3: Bet Selection Format

Clicking on a bet line revealed the selection encoding:

```
/wager/CreateWager.aspx?sel=0_5421295_-7.5_-115&WT=0&lg=535
                            │  │       │     │
                            │  │       │     └── Odds
                            │  │       └── Spread/Line
                            │  └── Game ID
                            └── Selection Type
```

### Step 4: Bet Placement Flow

Placing a bet requires THREE sequential POST requests:

1. **Validate:** `POST /wager/CreateWagerHelper.aspx`
   - Sends stake amount
   - Returns bet details (risking/to-win)

2. **Confirm:** `POST /wager/ConfirmWagerHelper.aspx`
   - Sends password confirmation
   - Validates user authorization

3. **Execute:** `POST /wager/PostWagerMultipleHelper.aspx`
   - Actually places the bet
   - Returns ticket number

---

## API Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/Login.aspx` | POST | Authentication (form) |
| `/wager/NewScheduleHelper.aspx` | GET | Fetch odds |
| `/wager/CreateWagerHelper.aspx` | POST | Validate bet |
| `/wager/ConfirmWagerHelper.aspx` | POST | Confirm with password |
| `/wager/PostWagerMultipleHelper.aspx` | POST | Execute bet |
| `/wager/PlayerInfoHelper.aspx` | GET | Account info |
| `/Logout.aspx` | GET | End session |

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
- ✅ Live odds fetched from Play23 API (with fallback data)
- ✅ View spread, total, and moneyline odds
- ✅ Select bet and specify stake amount
- ✅ Real-time payout calculation (American odds)
- ✅ Place bet button with password confirmation

### Part 2: Bet Placer (Backend)
- ✅ Direct API communication (no browser automation)
- ✅ Cookie-based session management
- ✅ ASP.NET ViewState token handling
- ✅ Three-step bet placement flow
- ✅ Error handling:
  - Odds changed (409)
  - Insufficient balance (402)
  - Market closed (410)
  - Minimum bet not met (400)
  - Invalid password (401)

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

1. **Odds Display:** Attempts to parse live odds from Play23 HTML responses. Falls back to league-specific sample data if parsing fails (Play23's HTML structure can vary).

2. **Session Timeout:** Basic handling—production would need automatic re-authentication.

3. **Real-time Updates:** Odds are fetched on page load and league change, not continuously live-updated.

4. **League Support:** NBA, NFL, and College Basketball have dedicated fallback data. Other leagues may show empty if live parsing fails.

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

## Author

Jose Hernandez
Winworks Take-Home Assignment
February 2026
