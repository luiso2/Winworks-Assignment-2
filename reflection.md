# Reflection

## My Approach

When I first received this assignment, I recognized that the core challenge wasn't just building a betting interface—it was reverse-engineering an undocumented API without any browser automation tools. I approached this systematically: first mapping the authentication flow, then the data retrieval endpoints, and finally the complete bet placement sequence.

I started by manually navigating Play23.ag with Chrome DevTools open, watching every network request during login, browsing odds, and placing a test bet. This reconnaissance phase took about 30 minutes but gave me a clear mental model of the system architecture. I discovered that Play23 uses an ASP.NET WebForms backend—a technology choice that has specific implications for API interaction, particularly the requirement to extract and echo back `__VIEWSTATE` tokens with every form submission.

The most challenging part was understanding Play23's three-step bet placement flow. Unlike modern REST APIs where a single POST might suffice, Play23 requires: (1) validating the stake amount, (2) confirming with the user's password, and (3) executing the wager—each step depending on session state from the previous request. This pattern is typical of WebForms applications where the server maintains page state, but it meant my implementation needed robust cookie management to maintain session continuity across requests.

## How I Used AI

I used Claude Code throughout this project as a collaborative partner for both investigation and implementation. For the reverse-engineering phase, I had Claude control a browser via Playwright to navigate Play23 while I observed the network requests and page structure. This allowed me to quickly iterate on hypotheses—"what happens if I click this?" or "what parameters does this endpoint expect?"—without manually typing commands.

The AI proved invaluable for debugging. When my initial login implementation failed, I asked Claude to fetch the raw HTML and parse out the actual form field names. This revealed that Play23 uses `Account` for the username field, not `Username` or the typical ASP.NET convention `ctl00$MainContent$txtUser`. A human might have spent considerable time trying variations; the AI systematically extracted all input names in seconds.

For the implementation phase, Claude helped structure the Express backend with proper session management. I specified the architecture I wanted—separate client class for Play23 API calls, Express routes that map cleanly to frontend needs—and Claude generated the boilerplate while I focused on the business logic. The AI was particularly useful for error handling: I described the error conditions I'd observed (odds changed, insufficient balance, minimum bet not met), and Claude helped map these to appropriate HTTP status codes and user-friendly messages.

## Where I Got Stuck

The biggest obstacle was the login flow. My first several attempts returned to the login page because I was making incorrect assumptions about field names. I initially tried `username`/`password`, then ASP.NET conventions like `ctl00$MainContent$txtUser`, before discovering the fields were simply named `Account` and `Password`. The breakthrough came when I used `curl` to fetch the raw HTML and grep for input fields, revealing the actual form structure.

The second major obstacle was the bet placement confirmation step. The API kept returning "Input string was not in a correct format" with no indication of which parameter was wrong. I had to systematically test different parameter variations until I discovered that `amountType` must be an integer (`1`) instead of a string (`'W'`). This took significant debugging time because the error message was completely unhelpful.

A third challenge was discovering the correct post endpoint. `PostWagerHelper.aspx` (which seemed logical) didn't work—it returned "Value cannot be null." I had to analyze Play23's minified React frontend (3.8MB of JavaScript) to discover that the actual endpoint is `PostWagerMultipleHelper.aspx` with a completely different payload structure: the wager request must be wrapped in an array and JSON-stringified into a `postWagerRequests` parameter. Additionally, the password field is named `confirmPassword` in this step, not `password`.

The balance endpoint also had a subtle bug—it returns JSON, not HTML, but our code was trying to parse HTML. This caused 500 errors until fixed.

Additional hardening was required after initial testing:

1. **String type validation**: Several endpoints returned numeric fields that could be `null` or numbers instead of strings. Calling `.substring()` on these values caused "Cannot read properties of undefined (reading 'substring')" errors. The fix was to wrap all values with `String()` and validate length before calling string methods.

2. **nestedDetail validation**: The compile response structure wasn't always consistent. Added explicit validation: `if (!nestedDetail || !nestedDetail.IdGame)` before accessing nested properties.

3. **Frontend selection validation**: The frontend could send "undefined" as the selection string if the `sel` property wasn't properly passed through the button click handler. Added validation in `placeBet()` to check `selectedBet.selection` exists and contains valid format (includes underscore separator).

## What I Would Do Differently

Given more time, I would:

1. **Build a parameter testing harness first**: Before implementing, I would create a systematic test harness that tries multiple parameter variations automatically. This would have found the `amountType` issue much faster.

2. **Download and deobfuscate the frontend JS earlier**: Analyzing the minified React frontend revealed the exact API contracts. Doing this first would have prevented many debugging dead-ends.

3. **Add real-time odds updates**: The current implementation fetches odds once; a production system would use polling or WebSockets if available.

4. **Build comprehensive test coverage**: Unit tests for the Play23Client class mocking various server responses would increase confidence in error handling.

5. **Handle odds changes gracefully**: The 409 "Odds Changed" error could trigger an automatic refresh and re-selection prompt instead of just showing an error.

6. **Add request/response logging**: A middleware that logs all API requests and responses would make debugging much easier.

## Key Learnings

1. **Never assume field names**: Always inspect actual HTML, especially with legacy systems like WebForms. Field names can be `Account` instead of `username`, `confirmPassword` instead of `password`.

2. **Cookie management is critical**: Session-based APIs require careful cookie handling across multiple requests.

3. **Parameter types matter**: `amountType: 1` (integer) works, but `amountType: 'W'` (string) fails silently with a generic error. When debugging API issues, test both string and integer versions of numeric parameters.

4. **Endpoint names can be misleading**: `PostWagerHelper.aspx` seems like the right endpoint, but `PostWagerMultipleHelper.aspx` is the actual one that works. Always verify endpoints by analyzing the actual frontend behavior.

5. **Minified JavaScript is your friend**: When stuck, downloading and analyzing the frontend JavaScript (even when minified) can reveal the exact parameter formats and endpoint sequences that the API expects.

6. **JSON vs HTML responses vary by endpoint**: Some endpoints return JSON, others return HTML. Don't assume consistency—verify each endpoint's response format.

7. **Systematic variation testing**: When an API returns unhelpful errors, create test scripts that try multiple parameter variations systematically. This approach found the `amountType` issue after manual debugging failed.

8. **Defensive string handling**: Always validate types before calling string methods. Use `String(value)` conversion and length checks before `.substring()`. API responses may return `null`, numbers, or undefined where strings are expected.

9. **Validate data flow end-to-end**: A bug in the frontend (not passing `sel` to click handler) manifested as a backend error. Testing the backend with curl confirmed it worked, which isolated the bug to the frontend. Always test each layer independently.

10. **Console logging for debugging**: Strategic `console.log()` statements in event handlers helped identify that `sel` was undefined. Remove these logs before production, but they're invaluable during development.

This project reinforced that reverse-engineering isn't about guessing—it's about systematic observation and verification. The AI accelerated both the discovery process and the implementation, but the engineering judgment about architecture, error handling, and edge cases remained human decisions. The critical fixes (amountType, endpoint, field names) were discovered through methodical testing, not intuition.
