# AI Transcript: API Reverse Engineering Session

## Session Info
- **Date:** February 3, 2026
- **Tool:** Claude Code (Opus 4.5)
- **Objective:** Reverse-engineer Play23.ag betting API

---

## Prompt 1: Initial Site Exploration

**User:** Navigate to play23.ag and find the login page structure

**Claude:** I'll use Playwright to navigate to the site and inspect the structure.

```javascript
// Navigated to https://play23.ag
// Found login link pointing to: https://backend.play23.ag/Login.aspx
```

**Discovery:** The main site redirects to a backend subdomain for authentication. This is an ASP.NET application based on the .aspx extension.

---

## Prompt 2: Login Form Analysis

**User:** Analyze the login form to understand the required fields

**Claude:** I'll fetch the login page HTML and inspect the form structure.

```bash
curl -s https://backend.play23.ag/Login.aspx | grep -i "input"
```

**Response:**
```html
<input type="hidden" name="__VIEWSTATE" value="/wEPDwUJ..." />
<input type="hidden" name="__VIEWSTATEGENERATOR" value="C2EE9ABB" />
<input name="Account" type="text" placeholder="Username" />
<input name="Password" type="password" placeholder="Password" />
<button type="submit" name="BtnSubmit">Sign in</button>
```

**Key Discovery:**
- Field names are `Account` and `Password` (NOT "username"/"password")
- ASP.NET requires `__VIEWSTATE` token extraction
- Submit button is `BtnSubmit`

---

## Prompt 3: Test Login with Credentials

**User:** Login with wwplayer1/123 and capture the session flow

**Claude:** I'll submit the login form with proper fields and track redirects.

```javascript
// Built form data:
formData.append('__VIEWSTATE', extractedViewState);
formData.append('__VIEWSTATEGENERATOR', extractedGenerator);
formData.append('Account', 'wwplayer1');
formData.append('Password', '123');
formData.append('BtnSubmit', 'Sign in');

// POST to /Login.aspx
// Result: Redirect to /wager/Welcome.aspx?login=1
```

**Discovery:** Successful login redirects to Welcome.aspx with `?login=1` parameter. Session is maintained via cookies.

---

## Prompt 4: Explore Odds/Schedule Pages

**User:** Navigate to the sportsbook and understand how odds are loaded

**Claude:** I'll browse the NBA section and monitor network requests.

```javascript
// Clicked "Straight" bet type
// URL: /wager/NewSchedule.aspx?WT=0&lg=535

// Observed AJAX call:
// GET /wager/NewScheduleHelper.aspx?WT=0&lg=535
```

**Discovery:**
- `WT` parameter = Wager Type (0=straight, 1=parlay, 2=teaser)
- `lg` parameter = League ID (535=NBA, 43=College BB, 4029=NFL)
- Odds loaded via Helper.aspx endpoints (AJAX)

---

## Prompt 5: Understand Bet Selection Format

**User:** Click on a bet and see how selections are encoded

**Claude:** I'll select Lakers -7½ spread and observe the URL.

```javascript
// Clicked on Lakers -7½ -115
// Navigated to: /wager/CreateWager.aspx?sel=0_5421295_-7.5_-115&WT=0&lg=535
```

**Discovery - Selection Format:**
```
sel=0_5421295_-7.5_-115
    │  │       │     │
    │  │       │     └── Odds (-115)
    │  │       └── Line (-7.5 spread)
    │  └── Game ID (5421295)
    └── Selection Type (0=spread)
```

---

## Prompt 6: Complete Bet Placement Flow

**User:** Go through the entire bet placement process and capture all API calls

**Claude:** I'll enter a stake amount and complete the bet.

### Step 1: Enter Amount
```javascript
// Filled stake: $25
// Clicked Continue
// POST /wager/CreateWagerHelper.aspx
// Response: Shows confirmation page with "Risking: 29 / To Win: 25"
```

### Step 2: Confirm with Password
```javascript
// Page shows "Please enter your password and click the button to confirm"
// Entered password: 123
// Clicked "Confirm Wager"
// POST /wager/ConfirmWagerHelper.aspx
```

### Step 3: Execute Bet
```javascript
// POST /wager/PostWagerMultipleHelper.aspx
// Response: "Wager(s) Confirmed"
// Ticket#: 207795955
```

**Complete Flow:**
1. `POST CreateWagerHelper.aspx` - Validate bet amount
2. `POST ConfirmWagerHelper.aspx` - Submit password confirmation
3. `POST PostWagerMultipleHelper.aspx` - Execute the wager

---

## Prompt 7: Error Handling Discovery

**User:** Test with invalid amounts to see error responses

**Claude:** I'll try placing a $5 bet to trigger validation.

```javascript
// Entered $5 stake
// POST CreateWagerHelper.aspx
// Response: "Min Wager Online not reached. Your Current Wager Limit is 25 USD."
```

**Discovery:** Minimum bet is $25 USD. Error messages are returned in HTML response body.

---

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/Login.aspx` | POST | Authentication (form-based) |
| `/wager/Welcome.aspx` | GET | Dashboard after login |
| `/wager/NewScheduleHelper.aspx?WT=0&lg=535` | GET | Fetch odds/games |
| `/wager/CreateWager.aspx?sel=...` | GET | Load bet slip page |
| `/wager/CreateWagerHelper.aspx` | POST | Validate bet amount |
| `/wager/ConfirmWagerHelper.aspx` | POST | Confirm with password |
| `/wager/PostWagerMultipleHelper.aspx` | POST | Execute bet |
| `/wager/PlayerInfoHelper.aspx` | GET | Account balance |
| `/wager/OpenBets.aspx` | GET | View pending bets |
| `/Logout.aspx` | GET | End session |

---

## Session Conclusion

Successfully reverse-engineered the complete betting flow:
1. **Authentication:** ASP.NET WebForms with ViewState tokens
2. **Odds Retrieval:** Helper.aspx endpoints with league/wager type params
3. **Bet Selection:** Encoded in URL as `type_gameId_line_odds`
4. **Bet Placement:** Three-step POST sequence with password confirmation
5. **Error Handling:** HTML responses contain error messages
