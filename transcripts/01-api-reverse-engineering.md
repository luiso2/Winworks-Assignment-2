# AI Transcript: API Reverse Engineering Session

## Session Info
- **Date:** February 3, 2026
- **Tool:** Claude Code (Opus 4.5)
- **Objective:** Reverse-engineer Play23.ag betting API without browser automation
- **Duration:** ~45 minutes
- **Outcome:** Successfully mapped complete authentication and bet placement flows

---

## Context

The assignment explicitly prohibited browser automation tools like Puppeteer or Selenium. This meant I needed to understand the raw HTTP requests that power Play23's betting system. My approach was to use Playwright purely for observation—watching network traffic while manually navigating—then replicate those requests programmatically with axios.

---

## Prompt 1: Initial Site Exploration

**User:** Navigate to play23.ag and find the login page structure

**Claude:** I'll use Playwright to navigate to the site and inspect the structure.

```javascript
// Navigated to https://play23.ag
// Found login link pointing to: https://backend.play23.ag/Login.aspx
```

**Discovery:** The main site redirects to a backend subdomain for authentication. This is an ASP.NET application based on the .aspx extension.

**Why This Matters:** ASP.NET WebForms has specific requirements for form submissions (ViewState tokens) that differ from modern REST APIs. This immediately told me I'd need to handle server-side state tokens.

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

**Technical Insight:** The `__VIEWSTATE` is a serialized representation of the page's server-side state. ASP.NET uses this for postback validation—without it, the server rejects form submissions.

---

## Prompt 3: Test Login with Credentials

**User:** Login with wwplayer1/123 and capture the session flow

**Claude:** I'll submit the login form with proper fields and track redirects.

### Initial Attempt (Failed)
```javascript
// First attempt using assumed field names:
formData.append('username', 'wwplayer1');
formData.append('password', '123');
// Result: Returned to login page (authentication failed)
```

### Debugging Process
```bash
# Fetched raw HTML to verify field names
curl -s https://backend.play23.ag/Login.aspx | grep -oP 'name="[^"]*"' | sort -u

# Output revealed:
# name="Account"
# name="Password"
# name="BtnSubmit"
# name="__VIEWSTATE"
# name="__VIEWSTATEGENERATOR"
```

### Corrected Attempt (Success)
```javascript
// Built form data with correct field names:
formData.append('__VIEWSTATE', extractedViewState);
formData.append('__VIEWSTATEGENERATOR', extractedGenerator);
formData.append('Account', 'wwplayer1');
formData.append('Password', '123');
formData.append('BtnSubmit', 'Sign in');

// POST to /Login.aspx
// Result: Redirect to /wager/Welcome.aspx?login=1
```

**Discovery:** Successful login redirects to Welcome.aspx with `?login=1` parameter. Session is maintained via cookies (ASP.NET_SessionId, .ASPXAUTH).

**Lesson Learned:** Never assume field names. Always inspect the actual HTML source.

---

## Prompt 4: Explore Odds/Schedule Pages

**User:** Navigate to the sportsbook and understand how odds are loaded

**Claude:** I'll browse the NBA section and monitor network requests.

```javascript
// Clicked "Straight" bet type
// Main URL: /wager/NewSchedule.aspx?WT=0&lg=535

// Observed AJAX call that loads the actual odds:
// GET /wager/NewScheduleHelper.aspx?WT=0&lg=535
```

**Parameter Discovery:**
| Parameter | Meaning | Values Observed |
|-----------|---------|-----------------|
| `WT` | Wager Type | 0=Straight, 1=Parlay, 2=Teaser |
| `lg` | League ID | 535=NBA, 43=College BB, 4029=NFL |

**Technical Note:** The .aspx page loads a shell, then fetches odds via the Helper.aspx endpoint (AJAX pattern common in WebForms).

---

## Prompt 5: Understand Bet Selection Format

**User:** Click on a bet and see how selections are encoded

**Claude:** I'll select Lakers -7½ spread and observe the URL.

```javascript
// Clicked on Lakers -7½ -115
// Navigated to: /wager/CreateWager.aspx?sel=0_5421295_-7.5_-115&WT=0&lg=535
```

**Discovery - Selection Format Decoded:**
```
sel=0_5421295_-7.5_-115
    │  │       │     │
    │  │       │     └── Odds (-115, American format)
    │  │       └── Line/Spread (-7.5 points)
    │  └── Game ID (unique identifier)
    └── Selection Type (0=spread, 1=total, 2=moneyline)
```

**This is Critical:** The `sel` parameter encodes everything needed to identify a bet. This format must be replicated exactly when placing bets programmatically.

---

## Prompt 6: Complete Bet Placement Flow

**User:** Go through the entire bet placement process and capture all API calls

**Claude:** I'll enter a stake amount and complete the bet to map the full flow.

### Step 1: Validate Bet Amount
```javascript
// Filled stake: $25
// Clicked Continue button
// POST /wager/CreateWagerHelper.aspx
//
// Form Data:
// - __VIEWSTATE: [token from page]
// - Amount: 25
//
// Response HTML shows:
// "Risking: 29 / To Win: 25"
```

### Step 2: Confirm with Password
```javascript
// Page displays: "Please enter your password and click the button to confirm"
// Entered password: 123
// Clicked "Confirm Wager" button
// POST /wager/ConfirmWagerHelper.aspx
//
// Form Data:
// - Password: 123
// - [ViewState tokens]
```

### Step 3: Execute the Wager
```javascript
// POST /wager/PostWagerMultipleHelper.aspx
//
// Response HTML shows:
// "Wager(s) Confirmed"
// "Ticket#: 207795955"
```

**Complete Flow Diagram:**
```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ CreateWager      │────▶│ ConfirmWager     │────▶│ PostWager        │
│ Helper.aspx      │     │ Helper.aspx      │     │ MultipleHelper   │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ Validates amount │     │ Validates pwd    │     │ Executes bet     │
│ Returns preview  │     │ Returns confirm  │     │ Returns ticket#  │
└──────────────────┘     └──────────────────┘     └──────────────────┘
```

**Key Insight:** Each step depends on session state from the previous. Cookies must persist across all three requests. This is why I chose `tough-cookie` with axios for the implementation.

---

## Prompt 7: Error Handling Discovery

**User:** Test with invalid amounts to see error responses

**Claude:** I'll try placing bets with various invalid inputs to catalog error responses.

### Test 1: Below Minimum Bet
```javascript
// Entered $5 stake
// POST CreateWagerHelper.aspx
// Response: "Min Wager Online not reached. Your Current Wager Limit is 25 USD."
```

### Test 2: Insufficient Balance
```javascript
// Entered $10000 stake
// POST CreateWagerHelper.aspx
// Response: "Not enough available balance."
```

### Test 3: Invalid Password
```javascript
// Entered wrong password at confirmation
// POST ConfirmWagerHelper.aspx
// Response: "Invalid Password"
```

**Error Response Mapping:**
| Error Text | Condition | HTTP Code I'll Use |
|------------|-----------|-------------------|
| "Min Wager Online not reached" | Stake < $25 | 400 Bad Request |
| "Not enough available balance" | Stake > balance | 402 Payment Required |
| "Invalid Password" | Wrong confirmation | 401 Unauthorized |
| "Odds have changed" | Line movement | 409 Conflict |
| Market/game removed | Game started | 410 Gone |

---

## API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/Login.aspx` | POST | Authentication (form-based with ViewState) |
| `/wager/Welcome.aspx` | GET | Dashboard after login |
| `/wager/NewScheduleHelper.aspx?WT=0&lg=535` | GET | Fetch odds/games for league |
| `/wager/CreateWager.aspx?sel=...` | GET | Load bet slip page |
| `/wager/CreateWagerHelper.aspx` | POST | Step 1: Validate bet amount |
| `/wager/ConfirmWagerHelper.aspx` | POST | Step 2: Confirm with password |
| `/wager/PostWagerMultipleHelper.aspx` | POST | Step 3: Execute bet |
| `/wager/PlayerInfoHelper.aspx` | GET | Account balance/info |
| `/wager/OpenBets.aspx` | GET | View pending bets |
| `/Logout.aspx` | GET | End session |

---

## Session Conclusion

### What I Learned
Successfully reverse-engineered the complete betting flow:
1. **Authentication:** ASP.NET WebForms with ViewState tokens
2. **Odds Retrieval:** Helper.aspx endpoints with league/wager type params
3. **Bet Selection:** Encoded in URL as `type_gameId_line_odds`
4. **Bet Placement:** Three-step POST sequence with password confirmation
5. **Error Handling:** HTML responses contain error messages in text form

### Why No Browser Automation Was Needed
By understanding the raw HTTP requests, I can replicate the entire flow with:
- `axios` for HTTP requests
- `tough-cookie` for session management
- Simple regex for ViewState extraction
- String parsing for error detection

This approach is faster, more reliable, and easier to maintain than browser automation.

### Verified Working
- Successfully placed a real test bet (Ticket #207795955)
- Confirmed error handling for minimum bet validation
- Verified session persistence across multi-step flow
