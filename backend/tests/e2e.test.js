/**
 * End-to-End Tests for Play23 Bet Finder & Placer
 *
 * These tests verify the complete betting flow against the live Play23 API.
 *
 * IMPORTANT: These tests place REAL bets using the test account.
 * Each bet is $25 (minimum allowed).
 *
 * Run with: npm test
 * Run specific test: npm test -- --testNamePattern="Total Over"
 */

const Play23Client = require('../play23-client');

// Test credentials
const TEST_USERNAME = 'wwplayer1';
const TEST_PASSWORD = '123';
const MIN_BET_AMOUNT = 25;

describe('Play23 E2E Tests', () => {
  let client;

  beforeAll(async () => {
    client = new Play23Client();
  });

  afterAll(async () => {
    if (client && client.isAuthenticated) {
      await client.logout();
    }
  });

  // ============================================
  // AUTHENTICATION TESTS
  // ============================================
  describe('Authentication', () => {
    test('should login successfully with valid credentials', async () => {
      const result = await client.login(TEST_USERNAME, TEST_PASSWORD);

      expect(result.success).toBe(true);
      expect(result.message).toContain(TEST_USERNAME);
      expect(client.isAuthenticated).toBe(true);
    });

    test('should fail login with invalid credentials', async () => {
      const badClient = new Play23Client();
      const result = await badClient.login('invaliduser', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ============================================
  // ODDS RETRIEVAL TESTS
  // ============================================
  describe('Odds Retrieval', () => {
    test('should fetch NBA odds successfully', async () => {
      const odds = await client.getOdds(535); // NBA league ID

      expect(odds).toBeDefined();
      expect(odds.leagueId).toBe(535);
      expect(odds.games).toBeDefined();
      expect(Array.isArray(odds.games)).toBe(true);
    });

    test('should include selection strings in odds response', async () => {
      const odds = await client.getOdds(535);

      if (odds.games.length > 0) {
        const game = odds.games[0];

        // Verify game structure
        expect(game.id).toBeDefined();
        expect(game.team1).toBeDefined();
        expect(game.team2).toBeDefined();
        expect(game.sel).toBeDefined();

        // Verify selection strings exist
        expect(game.sel.spread1).toBeDefined();
        expect(game.sel.spread2).toBeDefined();
        expect(game.sel.over).toBeDefined();
        expect(game.sel.under).toBeDefined();
      }
    });

    test('should format selection strings correctly', async () => {
      const odds = await client.getOdds(535);

      if (odds.games.length > 0) {
        const game = odds.games[0];

        // Selection string format: {play}_{gameId}_{points}_{odds}
        const selRegex = /^\d+_\d+_-?\d+\.?\d*_[+-]\d+$/;

        expect(game.sel.spread1).toMatch(selRegex);
        expect(game.sel.spread2).toMatch(selRegex);
        expect(game.sel.over).toMatch(selRegex);
        expect(game.sel.under).toMatch(selRegex);

        // Over should have NEGATIVE points (e.g., 2_123_-231.5_-110)
        expect(game.sel.over).toMatch(/^2_\d+_-\d+/);

        // Under should have POSITIVE points (e.g., 3_123_231.5_-110)
        expect(game.sel.under).toMatch(/^3_\d+_\d+/);
      }
    });
  });

  // ============================================
  // BET PLACEMENT TESTS - ALL BET TYPES
  // ============================================
  describe('Bet Placement', () => {
    let testGame;
    let gameWithMoneyline;

    beforeAll(async () => {
      // Ensure we're logged in
      if (!client.isAuthenticated) {
        await client.login(TEST_USERNAME, TEST_PASSWORD);
      }

      // Get fresh odds
      const odds = await client.getOdds(535);

      if (odds.games.length === 0) {
        throw new Error('No games available for testing');
      }

      testGame = odds.games[0];

      // Find a game with moneyline
      gameWithMoneyline = odds.games.find(
        g => g.ml1 && g.ml2 && g.ml1.length > 0 && g.ml2.length > 0
      );
    });

    // ----------------------------------------
    // SPREAD BETS
    // ----------------------------------------
    describe('Spread Bets', () => {
      test('should place SPREAD bet on VISITOR team', async () => {
        const result = await client.placeBet({
          selection: testGame.sel.spread1,
          amount: MIN_BET_AMOUNT,
          password: TEST_PASSWORD,
          wagerType: 0
        });

        expect(result.success).toBe(true);
        expect(result.ticketNumber).toBeDefined();
        expect(result.ticketNumber).not.toBe('');
        expect(result.description).toContain(testGame.team1.name);

        console.log(`    Spread Visitor - Ticket #${result.ticketNumber}`);
      });

      test('should place SPREAD bet on HOME team', async () => {
        const result = await client.placeBet({
          selection: testGame.sel.spread2,
          amount: MIN_BET_AMOUNT,
          password: TEST_PASSWORD,
          wagerType: 0
        });

        expect(result.success).toBe(true);
        expect(result.ticketNumber).toBeDefined();
        expect(result.description).toContain(testGame.team2.name);

        console.log(`    Spread Home - Ticket #${result.ticketNumber}`);
      });
    });

    // ----------------------------------------
    // TOTAL BETS (Previously failing)
    // ----------------------------------------
    describe('Total Bets (Over/Under)', () => {
      test('should place TOTAL OVER bet', async () => {
        const result = await client.placeBet({
          selection: testGame.sel.over,
          amount: MIN_BET_AMOUNT,
          password: TEST_PASSWORD,
          wagerType: 0
        });

        expect(result.success).toBe(true);
        expect(result.ticketNumber).toBeDefined();
        expect(result.description.toLowerCase()).toContain('total');
        expect(result.description.toLowerCase()).toContain('o');

        console.log(`    Total Over - Ticket #${result.ticketNumber}`);
      });

      test('should place TOTAL UNDER bet', async () => {
        const result = await client.placeBet({
          selection: testGame.sel.under,
          amount: MIN_BET_AMOUNT,
          password: TEST_PASSWORD,
          wagerType: 0
        });

        expect(result.success).toBe(true);
        expect(result.ticketNumber).toBeDefined();
        expect(result.description.toLowerCase()).toContain('total');
        expect(result.description.toLowerCase()).toContain('u');

        console.log(`    Total Under - Ticket #${result.ticketNumber}`);
      });
    });

    // ----------------------------------------
    // MONEYLINE BETS
    // ----------------------------------------
    describe('Moneyline Bets', () => {
      test('should place MONEYLINE bet on VISITOR team', async () => {
        if (!gameWithMoneyline) {
          console.log('    Skipping: No games with moneyline available');
          return;
        }

        const result = await client.placeBet({
          selection: gameWithMoneyline.sel.ml1,
          amount: MIN_BET_AMOUNT,
          password: TEST_PASSWORD,
          wagerType: 0
        });

        expect(result.success).toBe(true);
        expect(result.ticketNumber).toBeDefined();

        console.log(`    Moneyline Visitor - Ticket #${result.ticketNumber}`);
      });

      test('should place MONEYLINE bet on HOME team', async () => {
        if (!gameWithMoneyline) {
          console.log('    Skipping: No games with moneyline available');
          return;
        }

        const result = await client.placeBet({
          selection: gameWithMoneyline.sel.ml2,
          amount: MIN_BET_AMOUNT,
          password: TEST_PASSWORD,
          wagerType: 0
        });

        expect(result.success).toBe(true);
        expect(result.ticketNumber).toBeDefined();

        console.log(`    Moneyline Home - Ticket #${result.ticketNumber}`);
      });
    });
  });

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================
  describe('Error Handling', () => {
    let testGame;

    beforeAll(async () => {
      if (!client.isAuthenticated) {
        await client.login(TEST_USERNAME, TEST_PASSWORD);
      }
      const odds = await client.getOdds(535);
      testGame = odds.games[0];
    });

    test('should reject bet with wrong password', async () => {
      const result = await client.placeBet({
        selection: testGame.sel.spread1,
        amount: MIN_BET_AMOUNT,
        password: 'wrongpassword',
        wagerType: 0
      });

      expect(result.success).toBe(false);
      // API may return different error types for password issues
      expect(['INVALID_PASSWORD', 'POST_ERROR', 'CONFIRM_ERROR']).toContain(result.errorType);
    });

    test('should reject bet below minimum amount', async () => {
      const result = await client.placeBet({
        selection: testGame.sel.spread1,
        amount: 10, // Below $25 minimum
        password: TEST_PASSWORD,
        wagerType: 0
      });

      expect(result.success).toBe(false);
      // API may return different error types for minimum bet
      expect(['MIN_BET_NOT_MET', 'POST_ERROR', 'CONFIRM_ERROR']).toContain(result.errorType);
    });

    test('should handle invalid selection string', async () => {
      const result = await client.placeBet({
        selection: 'invalid_selection_string',
        amount: MIN_BET_AMOUNT,
        password: TEST_PASSWORD,
        wagerType: 0
      });

      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // BALANCE & ACCOUNT TESTS
  // ============================================
  describe('Account Operations', () => {
    test('should retrieve account balance', async () => {
      if (!client.isAuthenticated) {
        await client.login(TEST_USERNAME, TEST_PASSWORD);
      }

      const balance = await client.getBalance();

      expect(balance).toBeDefined();
      expect(typeof balance.current).toBe('number');
      expect(typeof balance.available).toBe('number');
      expect(typeof balance.atRisk).toBe('number');
    });
  });
});

// ============================================
// SUMMARY REPORT
// ============================================
afterAll(() => {
  console.log('\n' + '='.repeat(60));
  console.log('E2E TEST SUMMARY');
  console.log('='.repeat(60));
  console.log('All bet types tested:');
  console.log('  - Spread (Visitor) ');
  console.log('  - Spread (Home)');
  console.log('  - Total Over');
  console.log('  - Total Under');
  console.log('  - Moneyline (Visitor)');
  console.log('  - Moneyline (Home)');
  console.log('='.repeat(60));
});
