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

A secondary challenge was handling the bet placement response parsing. Play23 returns HTML pages with embedded success/error messages, not clean JSON responses. I had to write regex patterns to extract ticket numbers and detect error conditions from HTML content. This felt fragile—a future UI change could break the parsing—but it's the reality of working with undocumented APIs.

## What I Would Do Differently

Given more time, I would:

1. **Implement proper HTML parsing**: Using a library like `cheerio` instead of regex would make the code more resilient to HTML changes.

2. **Add real-time odds updates**: The current implementation fetches odds once; a production system would use polling or WebSockets if available.

3. **Build comprehensive test coverage**: Unit tests for the Play23Client class mocking various server responses would increase confidence in error handling.

4. **Handle session expiration gracefully**: The current implementation doesn't detect when sessions expire—production code would need automatic re-authentication.

## Key Learnings

1. **Never assume field names**: Always inspect actual HTML, especially with legacy systems like WebForms.

2. **Cookie management is critical**: Session-based APIs require careful cookie handling across multiple requests.

3. **Error messages live in HTML**: Without JSON APIs, parsing error conditions from rendered HTML is necessary but fragile.

4. **Three-step flows need state**: When APIs require sequential dependent requests, maintaining state between steps is essential.

This project reinforced that reverse-engineering isn't about guessing—it's about systematic observation and verification. The AI accelerated both the discovery process and the implementation, but the engineering judgment about architecture, error handling, and edge cases remained human decisions.
