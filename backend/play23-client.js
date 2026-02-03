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
   * Play23 returns HTML tables with game data
   */
  parseOddsHtml(html, leagueId) {
    const games = [];

    try {
      // Play23 uses table rows for each team in a game
      // Pattern: ROT number, Team name, Spread, Total, Moneyline

      // Extract all rotation numbers (3-4 digit numbers that identify teams)
      const rotMatches = html.match(/>(\d{3,4})</g) || [];
      const rotNumbers = rotMatches.map(m => m.replace(/[><]/g, ''));

      // Extract team names - usually in bold or specific cells
      const teamMatches = html.match(/<b>([A-Z][A-Z0-9\s\.]+?)<\/b>/gi) ||
                          html.match(/>([A-Z]{2,4}\s+[A-Z]+)</gi) || [];
      const teamNames = teamMatches.map(m => m.replace(/<\/?b>/gi, '').replace(/[><]/g, '').trim());

      // Extract spreads (format: +7½ or -3.5 followed by odds like -110)
      const spreadMatches = html.match(/([+-]?\d+[½\.]?\d*)\s*(?:<[^>]*>)?\s*([+-]\d{3})/g) || [];

      // Extract totals (format: o221½ -110 or u221½ -110)
      const totalMatches = html.match(/([ou])(\d+[½\.]?\d*)\s*(?:<[^>]*>)?\s*([+-]\d{3})/gi) || [];

      // Extract moneylines (standalone odds like +150 or -200)
      const mlMatches = html.match(/>([+-]\d{3})</g) || [];
      const moneylines = mlMatches.map(m => m.replace(/[><]/g, ''));

      // Extract game times
      const timeMatches = html.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/gi) || [];
      const dateMatches = html.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/gi) || [];

      // Build games from paired data
      // Teams come in pairs (away team, home team)
      for (let i = 0; i < rotNumbers.length - 1; i += 2) {
        const awayRot = rotNumbers[i];
        const homeRot = rotNumbers[i + 1];

        // Find corresponding team names
        const awayTeam = teamNames[i] || `Team ${awayRot}`;
        const homeTeam = teamNames[i + 1] || `Team ${homeRot}`;

        // Extract spread values for this game
        const spreadIdx = Math.floor(i / 2) * 2;
        let awaySpread = '', awaySpreadOdds = '-110';
        let homeSpread = '', homeSpreadOdds = '-110';

        if (spreadMatches[spreadIdx]) {
          const parts = spreadMatches[spreadIdx].match(/([+-]?\d+[½\.]?\d*)\s*(?:<[^>]*>)?\s*([+-]\d{3})/);
          if (parts) {
            awaySpread = parts[1];
            awaySpreadOdds = parts[2];
          }
        }
        if (spreadMatches[spreadIdx + 1]) {
          const parts = spreadMatches[spreadIdx + 1].match(/([+-]?\d+[½\.]?\d*)\s*(?:<[^>]*>)?\s*([+-]\d{3})/);
          if (parts) {
            homeSpread = parts[1];
            homeSpreadOdds = parts[2];
          }
        }

        // Extract total
        let totalLine = '220', overOdds = '-110', underOdds = '-110';
        const gameTotal = totalMatches[Math.floor(i / 2)];
        if (gameTotal) {
          const totalParts = gameTotal.match(/([ou])(\d+[½\.]?\d*)\s*(?:<[^>]*>)?\s*([+-]\d{3})/i);
          if (totalParts) {
            totalLine = totalParts[2];
            if (totalParts[1].toLowerCase() === 'o') {
              overOdds = totalParts[3];
            } else {
              underOdds = totalParts[3];
            }
          }
        }

        // Extract moneylines for this game
        const mlIdx = Math.floor(i / 2) * 2;
        const awayML = moneylines[mlIdx] || '+100';
        const homeML = moneylines[mlIdx + 1] || '-100';

        // Get date/time
        const gameDate = dateMatches[Math.floor(i / 2)] || 'Today';
        const gameTime = timeMatches[Math.floor(i / 2)] || 'TBD';

        // Generate game ID from rotation numbers
        const gameId = `${awayRot}${homeRot}`;

        games.push({
          id: gameId,
          date: gameDate,
          time: gameTime,
          team1: { name: awayTeam.toUpperCase(), rot: awayRot },
          team2: { name: homeTeam.toUpperCase(), rot: homeRot },
          spread1: awaySpread || '-0',
          spreadOdds1: awaySpreadOdds,
          spread2: homeSpread || '+0',
          spreadOdds2: homeSpreadOdds,
          total: totalLine,
          totalOver: overOdds,
          totalUnder: underOdds,
          ml1: awayML,
          ml2: homeML
        });
      }

      // If parsing failed, return sample data as fallback
      if (games.length === 0) {
        console.log('HTML parsing returned no games, using fallback data');
        return this.getFallbackGames(leagueId);
      }

      console.log(`Parsed ${games.length} games from Play23 HTML`);
      return { leagueId, games, source: 'live' };

    } catch (error) {
      console.error('Error parsing odds HTML:', error.message);
      return this.getFallbackGames(leagueId);
    }
  }

  /**
   * Fallback games when live parsing fails
   */
  getFallbackGames(leagueId) {
    // Return league-appropriate sample data
    const nbaGames = [
      {
        id: '5421295',
        date: 'Today',
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
        date: 'Today',
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
        date: 'Today',
        time: '7:10 PM',
        team1: { name: 'DEN NUGGETS', rot: '561' },
        team2: { name: 'DET PISTONS', rot: '562' },
        spread1: '-9', spreadOdds1: '-110',
        spread2: '+9', spreadOdds2: '-110',
        total: '224½', totalOver: '-110', totalUnder: '-110',
        ml1: '-400', ml2: '+320'
      }
    ];

    const nflGames = [
      {
        id: '4021001',
        date: 'Sunday',
        time: '1:00 PM',
        team1: { name: 'KC CHIEFS', rot: '101' },
        team2: { name: 'BUF BILLS', rot: '102' },
        spread1: '-3', spreadOdds1: '-110',
        spread2: '+3', spreadOdds2: '-110',
        total: '51½', totalOver: '-110', totalUnder: '-110',
        ml1: '-150', ml2: '+130'
      },
      {
        id: '4021002',
        date: 'Sunday',
        time: '4:25 PM',
        team1: { name: 'SF 49ERS', rot: '103' },
        team2: { name: 'PHI EAGLES', rot: '104' },
        spread1: '+1½', spreadOdds1: '-110',
        spread2: '-1½', spreadOdds2: '-110',
        total: '47', totalOver: '-110', totalUnder: '-110',
        ml1: '+105', ml2: '-125'
      }
    ];

    const collegeGames = [
      {
        id: '4301001',
        date: 'Today',
        time: '7:00 PM',
        team1: { name: 'DUKE', rot: '501' },
        team2: { name: 'UNC', rot: '502' },
        spread1: '-4½', spreadOdds1: '-110',
        spread2: '+4½', spreadOdds2: '-110',
        total: '145½', totalOver: '-110', totalUnder: '-110',
        ml1: '-180', ml2: '+155'
      },
      {
        id: '4301002',
        date: 'Today',
        time: '9:00 PM',
        team1: { name: 'KANSAS', rot: '503' },
        team2: { name: 'KENTUCKY', rot: '504' },
        spread1: '-2', spreadOdds1: '-110',
        spread2: '+2', spreadOdds2: '-110',
        total: '152', totalOver: '-110', totalUnder: '-110',
        ml1: '-130', ml2: '+110'
      }
    ];

    let games;
    if (leagueId == 4029) {
      games = nflGames;
    } else if (leagueId == 43) {
      games = collegeGames;
    } else {
      games = nbaGames;
    }

    return { leagueId, games, source: 'fallback' };
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
