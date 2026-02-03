# Reflection

## My Approach

When I first received this assignment, I knew the key challenge would be reverse-engineering Play23's undocumented API. I started by manually navigating the site with Chrome DevTools open, watching every network request during login, browsing odds, and placing a test bet. This gave me a clear picture of the authentication flow and the sequence of API calls needed.

The most challenging part was understanding Play23's ASP.NET WebForms architecture. Initially, my login attempts failed because I assumed standard field names like "username" and "password." After inspecting the actual HTML form, I discovered the fields were named "Account", "Password", and "BtnSubmit". Additionally, ASP.NET requires `__VIEWSTATE` tokens to be extracted from the page and included in form submissions—something I wouldn't have known without careful network inspection.

## How I Used AI

I used Claude Code throughout this project as a collaborative coding partner. For the reverse-engineering phase, I had Claude control a browser via Playwright to navigate Play23 while I observed the network requests and page structure. This allowed me to quickly identify endpoints like `/wager/NewScheduleHelper.aspx` for odds and `/wager/CreateWagerHelper.aspx` for bet validation. When my initial login implementation failed, I used Claude to help debug by fetching the actual HTML and parsing out the correct form field names.

For the implementation phase, Claude helped structure the Express backend with proper session management using `tough-cookie` and `axios-cookiejar-support`. The AI was particularly useful for handling edge cases in error responses—mapping Play23's various error messages (odds changed, insufficient balance, market closed) to appropriate HTTP status codes and user-friendly messages.

## Where I Got Stuck

The biggest obstacle was the login flow. Play23 uses ASP.NET WebForms which requires extracting hidden tokens (`__VIEWSTATE`, `__VIEWSTATEGENERATOR`) from the login page before submitting credentials. My first several attempts returned to the login page because I was using incorrect field names. The breakthrough came when I used `curl` to fetch the raw HTML and grep for input fields—revealing that the username field was actually named "Account", not "Username" or any ASP.NET convention like `ctl00$MainContent$txtUser`.

A secondary challenge was understanding the bet placement flow, which requires three separate POST requests: one to validate the bet amount, one to confirm with password, and one to actually execute the wager. Each step depends on session state from the previous request, making cookie management critical.

## Limitations

- The odds display currently uses sample data rather than parsing Play23's HTML responses in real-time. Full HTML parsing would require more sophisticated regex or a proper HTML parser.
- Session timeout handling is basic—production code would need automatic re-authentication.
- The frontend is functional but minimal, focused on demonstrating the API integration rather than user experience.
