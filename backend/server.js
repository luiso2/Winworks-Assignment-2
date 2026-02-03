/**
 * Play23 Bet Placer - Backend API
 * Winworks Take-Home Assignment
 *
 * This server handles direct API communication with Play23.ag
 * NO browser automation - pure HTTP requests
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const Play23Client = require('./play23-client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// Store client sessions (in production, use Redis or similar)
const sessions = new Map();

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Login to Play23
 * POST /api/login
 * Body: { username, password }
 */
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      });
    }

    const client = new Play23Client();
    const result = await client.login(username, password);

    if (result.success) {
      // Store session
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessions.set(sessionId, { client, username, loginTime: new Date() });

      res.json({
        success: true,
        sessionId,
        balance: result.balance,
        message: `Welcome back, ${username}!`
      });
    } else {
      res.status(401).json({
        success: false,
        error: result.error || 'Login failed'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during login'
    });
  }
});

/**
 * Get available sports/leagues
 * GET /api/sports
 */
app.get('/api/sports', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const sports = await session.client.getSports();
    res.json({ success: true, sports });
  } catch (error) {
    console.error('Get sports error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sports' });
  }
});

/**
 * Get games/odds for a specific league
 * GET /api/odds/:leagueId
 */
app.get('/api/odds/:leagueId', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { leagueId } = req.params;
    const { wagerType = 0 } = req.query; // 0=straight, 1=parlay, 2=teaser

    const odds = await session.client.getOdds(leagueId, wagerType);
    res.json({ success: true, odds });
  } catch (error) {
    console.error('Get odds error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch odds' });
  }
});

/**
 * Search for a specific game/team
 * GET /api/search?q=lakers
 */
app.get('/api/search', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { q, leagueId = 535 } = req.query; // Default to NBA
    const results = await session.client.searchGames(q, leagueId);
    res.json({ success: true, results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Failed to search games' });
  }
});

/**
 * Place a bet
 * POST /api/bet
 * Body: { selection, amount, password }
 *
 * selection format: "0_5421295_-7.5_-115" (type_gameId_spread_odds)
 */
app.post('/api/bet', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { selection, amount, password, wagerType = 0, leagueId = 535 } = req.body;

    // Validate input
    if (!selection) {
      return res.status(400).json({ success: false, error: 'Selection is required' });
    }
    if (!amount || amount < 25) {
      return res.status(400).json({ success: false, error: 'Minimum bet amount is $25' });
    }
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required to confirm bet' });
    }

    const result = await session.client.placeBet({
      selection,
      amount,
      password,
      wagerType,
      leagueId
    });

    if (result.success) {
      res.json({
        success: true,
        ticketNumber: result.ticketNumber,
        risking: result.risking,
        toWin: result.toWin,
        message: 'Bet placed successfully!'
      });
    } else {
      // Handle specific error types
      const errorResponse = {
        success: false,
        error: result.error,
        errorType: result.errorType
      };

      // Map error types for frontend handling
      if (result.errorType === 'ODDS_CHANGED') {
        errorResponse.newOdds = result.newOdds;
        return res.status(409).json(errorResponse); // Conflict
      } else if (result.errorType === 'INSUFFICIENT_BALANCE') {
        return res.status(402).json(errorResponse); // Payment Required
      } else if (result.errorType === 'MARKET_CLOSED') {
        return res.status(410).json(errorResponse); // Gone
      } else if (result.errorType === 'MIN_BET_NOT_MET') {
        return res.status(400).json(errorResponse);
      } else if (result.errorType === 'INVALID_PASSWORD') {
        return res.status(401).json(errorResponse);
      }

      res.status(400).json(errorResponse);
    }
  } catch (error) {
    console.error('Place bet error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while placing bet',
      errorType: 'SERVER_ERROR'
    });
  }
});

/**
 * Get account balance
 * GET /api/balance
 */
app.get('/api/balance', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const balance = await session.client.getBalance();
    res.json({ success: true, balance });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch balance' });
  }
});

/**
 * Get open bets
 * GET /api/open-bets
 */
app.get('/api/open-bets', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const openBets = await session.client.getOpenBets();
    res.json({ success: true, openBets });
  } catch (error) {
    console.error('Get open bets error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch open bets' });
  }
});

/**
 * Logout
 * POST /api/logout
 */
app.post('/api/logout', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    const session = sessions.get(sessionId);

    if (session) {
      await session.client.logout();
      sessions.delete(sessionId);
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, error: 'Failed to logout' });
  }
});

// Serve frontend at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║       Play23 Bet Placer - Winworks Assignment             ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}                  ║
║                                                           ║
║  Frontend: http://localhost:${PORT}                          ║
║                                                           ║
║  API Endpoints:                                           ║
║    POST /api/login     - Authenticate with Play23         ║
║    GET  /api/odds/:lg  - Get odds for a league            ║
║    POST /api/bet       - Place a bet                      ║
║    GET  /api/balance   - Get account balance              ║
║    POST /api/logout    - End session                      ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
