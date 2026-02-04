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

    // Try multiple patterns to extract balance values
    // Pattern 1: class="current-balance">653
    const currentMatch = html.match(/current-balance[^>]*>([0-9,]+)/i) ||
                         html.match(/Current Balance[:\s]*<[^>]*>?\s*([0-9,]+)/i);

    // Pattern 2: class="real-avail-balance">100,172
    const availableMatch = html.match(/avail-balance[^>]*>([0-9,]+)/i) ||
                           html.match(/Available Balance[:\s]*<[^>]*>?\s*([0-9,]+)/i);

    // Pattern 3: at risk amount
    const atRiskMatch = html.match(/at-risk[^>]*>([0-9,]+)/i) ||
                        html.match(/Amount at Risk[:\s]*<[^>]*>?\s*([0-9,]+)/i);

    if (currentMatch) balance.current = parseInt(currentMatch[1].replace(/,/g, ''));
    if (availableMatch) balance.available = parseInt(availableMatch[1].replace(/,/g, ''));
    if (atRiskMatch) balance.atRisk = parseInt(atRiskMatch[1].replace(/,/g, ''));

    return balance;
  }

  /**
   * Get available sports (predefined list based on Play23 structure)
   * Note: Only includes leagues with active betting lines
   */
  async getSports() {
    // These are the leagues currently available on Play23
    // MLB and NHL removed - not currently available per site inspection
    return [
      { id: 535, name: 'NBA', sport: 'Basketball' },
      { id: 43, name: 'College Basketball', sport: 'Basketball' },
      { id: 4029, name: 'NFL', sport: 'Football' },
      { id: 430, name: 'NFL 1st Half', sport: 'Football' },
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
          'Accept': 'application/json, text/html, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${BASE_URL}/wager/NewSchedule.aspx`
        }
      });

      // Play23 returns JSON, not HTML
      return this.parseOddsJson(response.data, leagueId);
    } catch (error) {
      console.error('Get odds error:', error.message);
      throw error;
    }
  }

  /**
   * Parse odds from JSON response
   * Play23 API returns structured JSON with game data
   */
  parseOddsJson(data, leagueId) {
    const games = [];

    try {
      // Parse if string
      const json = typeof data === 'string' ? JSON.parse(data) : data;

      if (!json.result?.listLeagues?.[0]) {
        console.log('No leagues data in response');
        return this.getFallbackGames(leagueId);
      }

      // Find the GAME LINES section
      for (const section of json.result.listLeagues[0]) {
        if (section.Description?.includes('GAME LINES') && section.Games) {
          for (const game of section.Games) {
            const line = game.GameLines?.[0];
            if (!line) continue;

            // Parse spread values (handle HTML entities)
            const parseSpread = (str, numericValue) => {
              if (!str) return { line: '0', odds: '-110', display: '0' };
              // Replace HTML entity first
              let cleanStr = str.replace(/&frac12;/g, '.5').replace(/½/g, '.5');
              // Format: "+4.5-108" or "-3-108"
              const match = cleanStr.match(/([+-]?\d+\.?\d*)([+-]\d+)/);
              if (match) {
                // Use numericValue if available (more accurate)
                const lineValue = numericValue || match[1];
                return {
                  line: lineValue.toString(),
                  display: str.replace('&frac12;', '½'),
                  odds: match[2]
                };
              }
              return { line: '0', odds: '-110', display: '0' };
            };

            // Parse total (format: "o222-110" or "u222-110")
            const parseTotal = (str, numericValue) => {
              if (!str) return { line: '220', odds: '-110', display: '220' };
              let cleanStr = str.replace(/&frac12;/g, '.5').replace(/½/g, '.5');
              const match = cleanStr.match(/[ou]?(\d+\.?\d*)([+-]\d+)/i);
              if (match) {
                const lineValue = numericValue || match[1];
                return {
                  line: lineValue.toString(),
                  display: str.replace(/&frac12;/g, '½').replace(/^[ou]/i, ''),
                  odds: match[2]
                };
              }
              return { line: '220', odds: '-110', display: '220' };
            };

            // Use numeric values from API when available
            const vSpread = parseSpread(line.vsprdh, line.vsprdt);
            const hSpread = parseSpread(line.hsprdh, line.hsprdt);
            const over = parseTotal(line.ovh, line.unt); // unt is the total number
            const under = parseTotal(line.unh, line.unt);

            // Format date - ensure values are strings before using substring
            const dateStr = game.gmdt ? String(game.gmdt) : null; // "20260203"
            const timeStr = game.gmtm ? String(game.gmtm) : null; // "22:10:00"
            const formattedDate = dateStr && dateStr.length >= 8 ?
              `${dateStr.substring(4,6)}/${dateStr.substring(6,8)}` : 'Today';
            const formattedTime = timeStr && timeStr.length >= 5 ?
              timeStr.substring(0, 5) : 'TBD';

            games.push({
              id: game.idgm.toString(),
              idgp: game.idgp,
              date: formattedDate,
              time: formattedTime,
              team1: { name: game.vtm, rot: game.vnum.toString() },
              team2: { name: game.htm, rot: game.hnum.toString() },
              // Spread data with selection format
              spread1: vSpread.display || vSpread.line,
              spreadOdds1: vSpread.odds,
              spread1Value: vSpread.line,
              spread2: hSpread.display || hSpread.line,
              spreadOdds2: hSpread.odds,
              spread2Value: hSpread.line,
              // Total data
              total: over.display || over.line,
              totalValue: over.line,
              totalOver: over.odds,
              totalUnder: under.odds,
              // Moneyline
              ml1: line.voddsh || '+100',
              ml2: line.hoddsh || '-100',
              // Selection strings for bet placement (format: play_idgm_points_odds)
              sel: {
                spread1: `0_${game.idgm}_${vSpread.line}_${vSpread.odds}`,
                spread2: `1_${game.idgm}_${hSpread.line}_${hSpread.odds}`,
                over: `0_${game.idgm}_${over.line}_${over.odds}`,
                under: `1_${game.idgm}_${under.line}_${under.odds}`,
                ml1: `0_${game.idgm}_0_${line.voddsh || '+100'}`,
                ml2: `1_${game.idgm}_0_${line.hoddsh || '-100'}`
              }
            });
          }
          break; // Only process GAME LINES section
        }
      }

      if (games.length === 0) {
        console.log('No games found in JSON, using fallback');
        return this.getFallbackGames(leagueId);
      }

      console.log(`Parsed ${games.length} games from Play23 JSON API`);
      return { leagueId, games, source: 'live' };

    } catch (error) {
      console.error('Error parsing odds JSON:', error.message);
      return this.getFallbackGames(leagueId);
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
   * Generate selection strings for a game
   */
  generateSelStrings(game) {
    const parseSpreadValue = (spread) => {
      if (!spread) return '0';
      return spread.replace('½', '.5').replace('+', '').replace('-', '-');
    };

    const spread1Value = parseSpreadValue(game.spread1);
    const spread2Value = parseSpreadValue(game.spread2);
    const totalValue = game.total?.replace('½', '.5') || '220';

    return {
      spread1: `0_${game.id}_${spread1Value}_${game.spreadOdds1}`,
      spread2: `1_${game.id}_${spread2Value}_${game.spreadOdds2}`,
      over: `0_${game.id}_${totalValue}_${game.totalOver}`,
      under: `1_${game.id}_${totalValue}_${game.totalUnder}`,
      ml1: `0_${game.id}_0_${game.ml1}`,
      ml2: `1_${game.id}_0_${game.ml2}`
    };
  }

  /**
   * Fallback when live parsing fails - returns empty array with helpful message
   * IMPORTANT: Never return fake/hardcoded data - only real Play23 data
   */
  getFallbackGames(leagueId) {
    const leagueIdNum = parseInt(leagueId);
    let message = 'No games currently available for this league';

    // Empty games array - we never show fake data
    const games = [];

    // Provide helpful messages based on league
    if (leagueIdNum === 4029) {
      message = 'No NFL games available (check if off-season)';
    } else if (leagueIdNum === 535) {
      message = 'No NBA games available at this time';
    } else if (leagueIdNum === 43) {
      message = 'No College Basketball games available at this time';
    } else if (leagueIdNum === 430) {
      message = 'No NFL 1st Half games available';
    } else if (leagueIdNum === 3 || leagueIdNum === 1278 || leagueIdNum === 1566) {
      message = 'No soccer games available';
    } else {
      message = `No games available for league ${leagueIdNum}`;
    }

    // Add selection strings to each game
    const gamesWithSel = games.map(game => ({
      ...game,
      sel: this.generateSelStrings(game)
    }));

    return { leagueId, games: gamesWithSel, source: 'fallback', message };
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
   * Place a bet using Play23's JSON API
   * @param {object} betDetails
   * @param {string} betDetails.selection - Format: "play_gameId_points_odds" (e.g., "0_5421290_4.5_-108")
   * @param {number} betDetails.amount
   * @param {string} betDetails.password
   * @param {number} betDetails.wagerType - 0=straight, 1=parlay, 2=teaser
   * @param {number} betDetails.leagueId
   */
  async placeBet({ selection, amount, password, wagerType = 0, leagueId = 535 }) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    try {
      // Step 1: Compile the wager (validate selection and get bet details)
      console.log('Step 1: Compiling wager with selection:', selection);

      const compilePayload = new URLSearchParams({
        open: 0,
        WT: wagerType,
        sel: selection
      }).toString();

      const compileResponse = await this.client.post('/wager/CreateWagerHelper.aspx', compilePayload, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      const compileData = compileResponse.data;

      if (compileData.result?.ErrorMessage) {
        return {
          success: false,
          error: compileData.result.ErrorMessage,
          errorType: 'COMPILE_ERROR'
        };
      }

      if (!compileData.result?.WagerCompile) {
        return {
          success: false,
          error: 'Could not compile wager - invalid selection',
          errorType: 'COMPILE_ERROR'
        };
      }

      const wagerCompile = compileData.result.WagerCompile;
      const betDescription = wagerCompile.details?.[0]?.details?.[0]?.Description || 'Unknown bet';
      const nestedDetail = wagerCompile.details?.[0]?.details?.[0];
      const IDWT = wagerCompile.details[0]?.IDWT || '';
      console.log('Bet compiled:', betDescription);

      // Validate nestedDetail exists
      if (!nestedDetail || !nestedDetail.IdGame) {
        console.log('Invalid compile response structure:', JSON.stringify(wagerCompile.details?.[0], null, 2).substring(0, 500));
        return {
          success: false,
          error: 'Invalid bet selection - please refresh odds and try again',
          errorType: 'INVALID_SELECTION'
        };
      }

      // Step 2: Confirm the wager with amount and password
      console.log('Step 2: Confirming wager with amount:', amount);

      // Build detailData with correct format (discovered by reverse-engineering frontend)
      const detailData = [{
        IdGame: nestedDetail.IdGame,
        Play: nestedDetail.Play,
        Amount: amount,
        RiskWin: 0,  // Must be integer, not string
        Pitcher: nestedDetail.Pitcher || 0,
        TeaserPointsPurchased: 0,
        Points: { BuyPoints: 0, BuyPointsDesc: '', LineDesc: '', selected: true }
      }];

      const confirmPayload = new URLSearchParams({
        WT: wagerType,
        open: 0,
        IDWT: IDWT,
        sel: selection,
        amountType: 1,  // KEY: Must be integer (1=wager amount), NOT string 'W'
        sameAmount: true,
        detailData: JSON.stringify(detailData),
        sameAmountNumber: amount.toString(),
        useFreePlayAmount: false,
        roundRobinCombinations: '0',
        password: password
      }).toString();

      const confirmResponse = await this.client.post('/wager/ConfirmWagerHelper.aspx', confirmPayload, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      const confirmData = confirmResponse.data;
      console.log('Confirm response:', JSON.stringify(confirmData).substring(0, 300));

      // Check if session expired (redirected to login page)
      if (typeof confirmData === 'string' && confirmData.includes('Login')) {
        return {
          success: false,
          error: 'Session expired. Please login again.',
          errorType: 'SESSION_EXPIRED'
        };
      }

      if (confirmData.result?.ErrorMessage) {
        const errorMsg = confirmData.result.ErrorMessage;

        // Map common errors
        if (errorMsg.toLowerCase().includes('password')) {
          return { success: false, error: 'Invalid password', errorType: 'INVALID_PASSWORD' };
        }
        if (errorMsg.toLowerCase().includes('balance') || errorMsg.toLowerCase().includes('insufficient')) {
          return { success: false, error: 'Insufficient balance', errorType: 'INSUFFICIENT_BALANCE' };
        }
        if (errorMsg.toLowerCase().includes('minimum')) {
          return { success: false, error: 'Minimum bet is $25', errorType: 'MIN_BET_NOT_MET' };
        }
        if (errorMsg.toLowerCase().includes('odds') || errorMsg.toLowerCase().includes('changed')) {
          return { success: false, error: 'Odds have changed', errorType: 'ODDS_CHANGED' };
        }
        if (errorMsg.toLowerCase().includes('closed') || errorMsg.toLowerCase().includes('unavailable')) {
          return { success: false, error: 'Market is closed', errorType: 'MARKET_CLOSED' };
        }

        return { success: false, error: errorMsg, errorType: 'CONFIRM_ERROR' };
      }

      // Get confirmed amounts
      const confirmedRisk = confirmData.result?.details?.[0]?.Risk || amount;
      const confirmedWin = confirmData.result?.details?.[0]?.Win || Math.round(amount * 0.91);

      // Step 3: Post the wager using PostWagerMultipleHelper.aspx
      console.log('Step 3: Posting wager...');

      // Build postWagerRequest (format discovered by reverse-engineering frontend)
      const postWagerRequest = {
        WT: wagerType,
        open: 0,
        IDWT: IDWT,
        sel: selection,
        sameAmount: true,
        amountType: 1,  // Must be integer
        detailData: JSON.stringify(detailData),
        confirmPassword: password,  // KEY: Use 'confirmPassword', not 'password'
        sameAmountNumber: amount.toString(),
        useFreePlayAmount: false,
        roundRobinCombinations: '0'
      };

      const postPayload = new URLSearchParams({
        postWagerRequests: JSON.stringify([postWagerRequest])
      }).toString();

      const postResponse = await this.client.post('/wager/PostWagerMultipleHelper.aspx', postPayload, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      const postData = postResponse.data;
      console.log('Post response:', JSON.stringify(postData).substring(0, 300));

      // Check if session expired
      if (typeof postData === 'string' && postData.includes('Login')) {
        return {
          success: false,
          error: 'Session expired. Please login again.',
          errorType: 'SESSION_EXPIRED'
        };
      }

      // Extract result from array response
      const postResult = postData.result?.[0]?.WagerPostResult || postData[0]?.WagerPostResult || postData.result?.WagerPostResult;

      if (postResult?.ErrorMsgKey && postResult.ErrorMsgKey !== '') {
        const errorKey = postResult.ErrorMsgKey;
        if (errorKey === 'GAMELINECHANGE') {
          return { success: false, error: 'Odds have changed', errorType: 'ODDS_CHANGED' };
        }
        return { success: false, error: errorKey, errorType: 'POST_ERROR' };
      }

      // Extract ticket information
      const ticketNumber = postResult?.details?.[0]?.TicketNumber || 'Unknown';
      const risking = postResult?.details?.[0]?.Risk || confirmedRisk;
      const toWin = postResult?.details?.[0]?.Win || confirmedWin;

      console.log('Bet placed successfully! Ticket:', ticketNumber);

      return {
        success: true,
        ticketNumber: ticketNumber.toString(),
        risking: risking,
        toWin: toWin,
        description: betDescription
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

      // API returns JSON, not HTML
      const data = response.data;
      if (data.result) {
        const parseAmount = (str) => {
          if (!str) return 0;
          return parseInt(String(str).replace(/,/g, '').trim()) || 0;
        };
        return {
          current: parseAmount(data.result.CurrentBalance),
          available: parseAmount(data.result.RealAvailBalance),
          atRisk: parseAmount(data.result.AmountAtRisk)
        };
      }

      // Fallback to HTML parsing if not JSON
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
      const rawData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      return {
        bets: [],
        rawHtml: rawData.substring(0, 500)
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
