/**
 * Play23 API Client
 * Handles direct HTTP communication with Play23.ag backend
 *
 * Reverse-engineered endpoints:
 * - POST /Login.aspx (form) - Authentication
 * - GET /wager/NewScheduleHelper.aspx - Get odds/games
 * - POST /wager/CreateWagerHelper.aspx - Validate bet
 * - POST /wager/ConfirmWagerHelper.aspx - Confirm with password
 * - POST /wager/PostWagerMultipleHelper.aspx - Execute bet
 * - GET /wager/PlayerInfoHelper.aspx - Account info
 */

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const BASE_URL = 'https://backend.play23.ag';

class Play23Client {
  constructor() {
    // Create cookie jar for session management
    this.cookieJar = new CookieJar();

    // Create axios instance with cookie support
    this.client = wrapper(axios.create({
      baseURL: BASE_URL,
      jar: this.cookieJar,
      withCredentials: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      maxRedirects: 5,
      timeout: 30000
    }));

    this.isAuthenticated = false;
    this.username = null;
    this.viewState = null;
    this.eventValidation = null;
  }

  /**
   * Login to Play23
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{success: boolean, balance?: object, error?: string}>}
   */
  async login(username, password) {
    try {
      // Step 1: Get the login page to extract form tokens and field names
      const loginPageResponse = await this.client.get('/Login.aspx');
      const loginPageHtml = loginPageResponse.data;

      // Extract ASP.NET form tokens
      const viewStateMatch = loginPageHtml.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
      const eventValidationMatch = loginPageHtml.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);
      const viewStateGenMatch = loginPageHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);

      // Play23 uses these specific field names:
      // Account, Password, BtnSubmit
      console.log('Submitting login form...');

      // Step 2: Submit login form
      const formData = new URLSearchParams();

      if (viewStateMatch) formData.append('__VIEWSTATE', viewStateMatch[1]);
      if (viewStateGenMatch) formData.append('__VIEWSTATEGENERATOR', viewStateGenMatch[1]);
      if (eventValidationMatch) formData.append('__EVENTVALIDATION', eventValidationMatch[1]);

      // Use the actual Play23 field names
      formData.append('Account', username);
      formData.append('Password', password);
      formData.append('BtnSubmit', 'Sign in');

      const loginResponse = await this.client.post('/Login.aspx', formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': BASE_URL,
          'Referer': `${BASE_URL}/Login.aspx`
        },
        maxRedirects: 10,
        validateStatus: (status) => status < 500 // Accept redirects
      });

      // Check response URL for successful redirect
      const finalUrl = loginResponse.request?.res?.responseUrl ||
                       loginResponse.headers?.location ||
                       loginResponse.config?.url;

      console.log('Login response URL:', finalUrl);
      console.log('Response status:', loginResponse.status);

      // Check if login was successful
      const isLoggedIn = finalUrl?.includes('Welcome.aspx') ||
                         finalUrl?.includes('wager') ||
                         loginResponse.data?.includes('Welcome Back') ||
                         loginResponse.data?.includes('HELLO,') ||
                         loginResponse.data?.includes('Logout');

      if (isLoggedIn) {
        this.isAuthenticated = true;
        this.username = username;

        // Get the welcome page to extract balance
        let balance = { current: 0, available: 0, atRisk: 0 };
        try {
          const welcomeResponse = await this.client.get('/wager/Welcome.aspx');
          balance = this.parseBalanceFromHtml(welcomeResponse.data);
        } catch (e) {
          balance = this.parseBalanceFromHtml(loginResponse.data);
        }

        return {
          success: true,
          balance,
          message: `Logged in as ${username}`
        };
      } else {
        // Check for error messages
        if (loginResponse.data?.includes('Invalid') || loginResponse.data?.includes('incorrect')) {
          return { success: false, error: 'Invalid username or password' };
        }

        // Log for debugging
        console.log('Login may have failed. Response snippet:', loginResponse.data?.substring(0, 500));

        return { success: false, error: 'Login failed - please check credentials' };
      }
    } catch (error) {
      console.error('Login error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse balance information from HTML
   */
  parseBalanceFromHtml(html) {
    const balance = {
      current: 0,
      available: 0,
      atRisk: 0
    };

    // Try to extract balance values
    const currentMatch = html.match(/Current Balance[:\s]*<[^>]*>?\s*([0-9,]+)/i);
    const availableMatch = html.match(/Available Balance[:\s]*<[^>]*>?\s*([0-9,]+)/i);
    const atRiskMatch = html.match(/Amount at Risk[:\s]*<[^>]*>?\s*([0-9,]+)/i);

    if (currentMatch) balance.current = parseInt(currentMatch[1].replace(/,/g, ''));
    if (availableMatch) balance.available = parseInt(availableMatch[1].replace(/,/g, ''));
    if (atRiskMatch) balance.atRisk = parseInt(atRiskMatch[1].replace(/,/g, ''));

    return balance;
  }

  /**
   * Get available sports (predefined list based on Play23 structure)
   */
  async getSports() {
    // These are the common league IDs from Play23
    return [
      { id: 535, name: 'NBA', sport: 'Basketball' },
      { id: 43, name: 'College Basketball', sport: 'Basketball' },
      { id: 4029, name: 'NFL', sport: 'Football' },
      { id: 430, name: 'NFL 1st Half', sport: 'Football' },
      { id: 1, name: 'MLB', sport: 'Baseball' },
      { id: 2, name: 'NHL', sport: 'Hockey' },
      { id: 3, name: 'Soccer - Premier League', sport: 'Soccer' },
      { id: 1278, name: 'Soccer - Argentina', sport: 'Soccer' },
      { id: 1566, name: 'Soccer - Costa Rica', sport: 'Soccer' },
      { id: 1729, name: 'Brazil Basketball', sport: 'Basketball' }
    ];
  }

  /**
   * Get odds for a specific league
   * @param {number} leagueId
   * @param {number} wagerType - 0=straight, 1=parlay, 2=teaser
   */
  async getOdds(leagueId, wagerType = 0) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.client.get('/wager/NewScheduleHelper.aspx', {
        params: {
          WT: wagerType,
          lg: leagueId
        },
        headers: {
          'Accept': 'text/html, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${BASE_URL}/wager/NewSchedule.aspx`
        }
      });

      return this.parseOddsHtml(response.data, leagueId);
    } catch (error) {
      console.error('Get odds error:', error.message);
      throw error;
    }
  }

  /**
   * Parse odds HTML response into structured data
   */
  parseOddsHtml(html, leagueId) {
    const games = [];

    // Regex patterns to extract game data
    // Format: ROT# Team Spread Total MoneyLine
    const gamePattern = /(\d{3,6})\s*<\/[^>]+>\s*<[^>]+>\s*(?:<img[^>]*>)?\s*([A-Z0-9\s]+?)\s*<\/[^>]+>\s*<[^>]+[^>]*>\s*([+-]?\d+½?[+-]\d+)\s*<\/[^>]+>\s*<[^>]+[^>]*>\s*([ou]\d+½?[+-]?\d+)\s*<\/[^>]+>\s*<[^>]+[^>]*>\s*([+-]\d+)/gi;

    // Simplified parsing - extract key betting lines
    const rowPattern = /<div[^>]*class="[^"]*game-row[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;

    // For now, return a simplified structure based on known patterns
    // In production, you'd want more robust HTML parsing

    // Extract basic game info using a simpler approach
    const rotNumbers = html.match(/>\s*"?(\d{3,6})"?\s*</g) || [];
    const spreads = html.match(/([+-]?\d+½?)-?\d{3}/g) || [];
    const moneylines = html.match(/"([+-]\d{3})"/g) || [];

    // Build game objects from extracted data
    // This is a simplified version - the actual implementation would
    // need more sophisticated HTML parsing

    return {
      leagueId,
      games: [],
      rawHtml: html.substring(0, 500) + '...' // For debugging
    };
  }

  /**
   * Search for games by team name
   * @param {string} query
   * @param {number} leagueId
   */
  async searchGames(query, leagueId = 535) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    try {
      // Navigate to schedule page with quickfilter
      const response = await this.client.get('/wager/NewScheduleHelper.aspx', {
        params: {
          WT: 0,
          lg: leagueId,
          quickfilter: query
        },
        headers: {
          'Accept': 'text/html, */*',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      return this.parseOddsHtml(response.data, leagueId);
    } catch (error) {
      console.error('Search games error:', error.message);
      throw error;
    }
  }

  /**
   * Place a bet
   * @param {object} betDetails
   * @param {string} betDetails.selection - Format: "0_gameId_spread_odds"
   * @param {number} betDetails.amount
   * @param {string} betDetails.password
   * @param {number} betDetails.wagerType
   * @param {number} betDetails.leagueId
   */
  async placeBet({ selection, amount, password, wagerType = 0, leagueId = 535 }) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    try {
      // Step 1: Load the CreateWager page to set up session state
      const createWagerUrl = `/wager/CreateWager.aspx?sel=${selection}&WT=${wagerType}&lg=${leagueId}`;
      console.log('Loading bet slip page:', createWagerUrl);

      const createPageResponse = await this.client.get(createWagerUrl);
      const pageData = createPageResponse.data;

      // Extract ASP.NET form tokens
      const viewStateMatch = pageData.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
      const viewStateGenMatch = pageData.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);
      const eventValidationMatch = pageData.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);

      if (!viewStateMatch) {
        console.log('Warning: Could not extract __VIEWSTATE');
      }

      // Step 2: Submit the bet amount through the page form
      // Looking for the amount input and continue button
      const formData = new URLSearchParams();
      if (viewStateMatch) formData.append('__VIEWSTATE', viewStateMatch[1]);
      if (viewStateGenMatch) formData.append('__VIEWSTATEGENERATOR', viewStateGenMatch[1]);
      if (eventValidationMatch) formData.append('__EVENTVALIDATION', eventValidationMatch[1]);

      // Find the actual input field names from the page
      const amountFieldMatch = pageData.match(/name="([^"]*(?:amount|Amount|txtAmount)[^"]*)"/i);
      const amountField = amountFieldMatch ? amountFieldMatch[1] : 'ctl00$MainContent$txtAmount';

      formData.append(amountField, amount.toString());
      formData.append('ctl00$MainContent$ddlAmountType', 'W'); // W=Wager amount
      formData.append('ctl00$MainContent$chkSame', 'on');
      formData.append('ctl00$MainContent$btnContinue', 'Continue');

      console.log('Submitting bet amount:', amount);

      const submitResponse = await this.client.post(createWagerUrl, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': BASE_URL,
          'Referer': `${BASE_URL}${createWagerUrl}`
        },
        maxRedirects: 5
      });

      const submitData = submitResponse.data;

      // Check for validation errors
      if (submitData.includes('Min Wager') || submitData.includes('minimum')) {
        return {
          success: false,
          error: 'Minimum bet amount not reached. Minimum is $25.',
          errorType: 'MIN_BET_NOT_MET'
        };
      }

      if (submitData.includes('Insufficient') || submitData.includes('balance')) {
        return {
          success: false,
          error: 'Insufficient balance',
          errorType: 'INSUFFICIENT_BALANCE'
        };
      }

      // Check if we got to confirmation page (asks for password)
      if (submitData.includes('password') || submitData.includes('Please Confirm')) {
        console.log('Got to confirmation page, submitting password...');

        // Extract new form tokens
        const confirmViewState = submitData.match(/id="__VIEWSTATE"\s+value="([^"]+)"/);
        const confirmViewStateGen = submitData.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/);
        const confirmEventVal = submitData.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/);

        // Find password field name
        const pwdFieldMatch = submitData.match(/name="([^"]*(?:password|Password|txtPassword)[^"]*)"/i);
        const pwdField = pwdFieldMatch ? pwdFieldMatch[1] : 'ctl00$MainContent$txtPassword';

        const confirmForm = new URLSearchParams();
        if (confirmViewState) confirmForm.append('__VIEWSTATE', confirmViewState[1]);
        if (confirmViewStateGen) confirmForm.append('__VIEWSTATEGENERATOR', confirmViewStateGen[1]);
        if (confirmEventVal) confirmForm.append('__EVENTVALIDATION', confirmEventVal[1]);
        confirmForm.append(pwdField, password);
        confirmForm.append('ctl00$MainContent$btnConfirm', 'Confirm Wager');

        const confirmResponse = await this.client.post(createWagerUrl, confirmForm.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': BASE_URL,
            'Referer': `${BASE_URL}${createWagerUrl}`
          },
          maxRedirects: 5
        });

        const confirmData = confirmResponse.data;

        // Check for password error
        if (confirmData.includes('Invalid') || confirmData.includes('incorrect')) {
          return {
            success: false,
            error: 'Invalid password',
            errorType: 'INVALID_PASSWORD'
          };
        }

        // Check for success
        if (confirmData.includes('Confirmed') || confirmData.includes('Ticket')) {
          const ticketMatch = confirmData.match(/(\d{9,})/);
          const riskMatch = confirmData.match(/(\d+)\s*\/\s*(\d+)/);

          return {
            success: true,
            ticketNumber: ticketMatch ? ticketMatch[1] : 'Unknown',
            risking: riskMatch ? parseInt(riskMatch[1]) : Math.round(amount * 1.15),
            toWin: riskMatch ? parseInt(riskMatch[2]) : amount
          };
        }

        // Check for odds changed
        if (confirmData.includes('odds') || confirmData.includes('changed') || confirmData.includes('line')) {
          return {
            success: false,
            error: 'Odds have changed. Please try again.',
            errorType: 'ODDS_CHANGED'
          };
        }

        // Check for market closed
        if (confirmData.includes('closed') || confirmData.includes('unavailable')) {
          return {
            success: false,
            error: 'Market is closed',
            errorType: 'MARKET_CLOSED'
          };
        }

        console.log('Confirm response snippet:', confirmData.substring(0, 500));
      }

      // If we didn't get to confirmation, check what error we got
      console.log('Submit response snippet:', submitData.substring(0, 500));

      return {
        success: false,
        error: 'Could not complete bet placement - check game availability',
        errorType: 'UNKNOWN'
      };
    } catch (error) {
      console.error('Place bet error:', error.message);
      return {
        success: false,
        error: error.message,
        errorType: 'NETWORK_ERROR'
      };
    }
  }

  /**
   * Get account balance
   */
  async getBalance() {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.client.get('/wager/PlayerInfoHelper.aspx', {
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      return this.parseBalanceFromHtml(response.data);
    } catch (error) {
      console.error('Get balance error:', error.message);
      throw error;
    }
  }

  /**
   * Get open bets
   */
  async getOpenBets() {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.client.get('/wager/OpenBets.aspx');
      // Parse open bets from HTML
      // This would need proper HTML parsing in production
      return {
        bets: [],
        rawHtml: response.data.substring(0, 500)
      };
    } catch (error) {
      console.error('Get open bets error:', error.message);
      throw error;
    }
  }

  /**
   * Logout
   */
  async logout() {
    try {
      await this.client.get('/Logout.aspx');
      this.isAuthenticated = false;
      this.username = null;
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = Play23Client;
