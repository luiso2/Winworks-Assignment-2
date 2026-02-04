# Bug Fix Report: "Odds Changed" Error on Totals and Moneylines

**Date:** February 4, 2026
**Author:** Jose Hernandez
**Status:** RESOLVED

---

## Executive Summary

A critical bug was identified where betting on **Totals (Over/Under)** and **Moneylines** consistently returned an "Odds Changed" error, even when the odds displayed in the UI matched the actual odds on Play23.ag. The root cause was an incorrect format in the bet selection string sent to the Play23 API.

---

## Problem Description

### Symptoms
- Spread bets worked correctly
- Total Over bets failed with "GAMELINECHANGE" error
- Total Under bets failed with "GAMELINECHANGE" error
- Moneyline bets failed with "GAMELINECHANGE" error
- Error occurred at the final POST step, after successful compile and confirm steps

### Error Message
```
ErrorMsgKey: GAMELINECHANGE
ErrorMsg: GAMELINECHANGE
```

---

## Root Cause Analysis

### The Selection String Format

Play23's API uses a selection string format to identify bets:

```
{play}_{gameId}_{points}_{odds}
```

Where `play` is a numeric code indicating the bet type:

| Play Code | Bet Type |
|-----------|----------|
| 0 | Spread - Visitor |
| 1 | Spread - Home |
| 2 | Total Over |
| 3 | Total Under |
| 4 | Moneyline - Visitor |
| 5 | Moneyline - Home |

### The Bug

The original code constructed selection strings for **Totals** using the wrong sign for the points value.

**Original (Incorrect) Code:**
```javascript
const over = parseTotal(line.ovh, line.unt);  // Used unt (positive) for OVER
const under = parseTotal(line.unh, line.unt); // Used unt (positive) for UNDER

// Generated selections:
over: `2_${game.idgm}_231.5_-110`   // WRONG: positive value
under: `3_${game.idgm}_231.5_-110`  // Correct: positive value
```

### Discovery Through API Analysis

By examining the raw Play23 API response, I discovered two distinct fields for totals:

```json
{
  "ovh": "o231½-110",    // Display string for Over
  "ovt": "-231.5",       // Numeric value for Over (NEGATIVE)
  "unh": "u231½-110",    // Display string for Under
  "unt": "231.5"         // Numeric value for Under (POSITIVE)
}
```

**Key Insight:** The API uses:
- `ovt` (NEGATIVE value) for Over bets
- `unt` (POSITIVE value) for Under bets

This sign difference is how Play23's backend distinguishes between Over and Under bets when processing the wager.

### Why Spreads Worked

Spread bets used the correct fields (`vsprdt` and `hsprdt`) which already contained the proper signed values:
- Visitor spread: `vsprdt: "1"` (positive for underdog)
- Home spread: `hsprdt: "-1"` (negative for favorite)

---

## Solution

### Code Changes

**File:** `backend/play23-client.js`

**Before (Lines 281-282):**
```javascript
const over = parseTotal(line.ovh, line.unt);  // WRONG
const under = parseTotal(line.unh, line.unt);
```

**After (Lines 283-286):**
```javascript
// IMPORTANT: ovt is NEGATIVE for over, unt is POSITIVE for under
// This is required for correct bet placement
const over = parseTotal(line.ovh, line.ovt);  // ovt is negative (e.g., -231.5)
const under = parseTotal(line.unh, line.unt); // unt is positive (e.g., 231.5)
```

### Resulting Selection Strings

| Bet Type | Before (Broken) | After (Fixed) |
|----------|-----------------|---------------|
| Total Over | `2_5421901_231.5_-110` | `2_5421901_-231.5_-110` |
| Total Under | `3_5421901_231.5_-110` | `3_5421901_231.5_-110` |

---

## Complete Selection String Reference

| Bet Type | Format | Example |
|----------|--------|---------|
| Spread Visitor | `0_{idgm}_{vsprdt}_{odds}` | `0_5421901_-2_-110` |
| Spread Home | `1_{idgm}_{hsprdt}_{odds}` | `1_5421901_2_-110` |
| Total Over | `2_{idgm}_{ovt}_{odds}` | `2_5421901_-223_-110` |
| Total Under | `3_{idgm}_{unt}_{odds}` | `3_5421901_223_-110` |
| Moneyline Visitor | `4_{idgm}_0_{voddsh}` | `4_5421901_0_-133` |
| Moneyline Home | `5_{idgm}_0_{hoddsh}` | `5_5421901_0_+113` |

---

## Verification

All bet types were tested successfully after the fix:

| Test | Selection | Ticket # | Result |
|------|-----------|----------|--------|
| Spread Visitor | `0_5421901_-2_-110` | 207833030 | SUCCESS |
| Spread Home | `1_5421901_2_-110` | 207833032 | SUCCESS |
| Total Over | `2_5421901_-223_-110` | 207833033 | SUCCESS |
| Total Under | `3_5421901_223_-110` | 207833034 | SUCCESS |
| Moneyline Visitor | `4_5421901_0_-133` | 207833035 | SUCCESS |
| Moneyline Home | `5_5421901_0_+113` | 207833036 | SUCCESS |

---

## Lessons Learned

1. **API field names matter:** `ovt` vs `unt` have different signs for a reason - they encode the bet direction.

2. **Test all bet types:** The original implementation only tested spread bets thoroughly. Comprehensive testing of all bet types would have caught this earlier.

3. **Analyze raw API responses:** The fix was discovered by examining the raw JSON response from Play23's API, not by guessing formats.

4. **Error messages can be misleading:** "GAMELINECHANGE" suggested odds changed, but the real issue was an invalid selection format that the server couldn't match to any valid line.

---

## Files Modified

- `backend/play23-client.js` - Fixed selection string generation for totals (lines 283-286)

---

## Testing Recommendations

For future changes, always test:
1. Spread bets (both visitor and home)
2. Total Over bets
3. Total Under bets
4. Moneyline bets (both visitor and home, when available)
5. Bets on different leagues (NBA, NFL, College Basketball)
6. Bets with half-point lines (e.g., 231.5 vs 231)
