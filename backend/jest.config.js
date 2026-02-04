module.exports = {
  testEnvironment: 'node',
  testTimeout: 60000, // 60 seconds for API calls
  verbose: true,
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.e2e.js'
  ],
  collectCoverageFrom: [
    '*.js',
    '!jest.config.js'
  ],
  coverageDirectory: 'coverage',
  // Run tests sequentially to avoid rate limiting
  maxWorkers: 1
};
