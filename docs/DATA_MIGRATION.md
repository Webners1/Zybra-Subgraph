# Data Migration: Database to Subgraph

## Overview

This document maps your existing database fields to the new subgraph data source. Use this as a reference when updating your backend code.

---

## Fields to REMOVE from Database

The following data should **NO LONGER be stored or computed** in your database. Get it from the subgraph instead.

### User Table Fields to Remove

| Old DB Field | New Subgraph Field | Entity | Notes |
|--------------|-------------------|--------|-------|
| `total_contributed` | `totalContributed` | User | Wei format (divide by 10^6 for USDC) |
| `total_yield_earned` | `totalYieldEarned` | User | Aggregated across all groups |
| `total_yield_claimed` | `totalYieldClaimed` | User | Aggregated across all groups |
| `total_withdrawn` | `totalWithdrawn` | User | Capital + yield |
| `active_capital` | `activeCapital` | User | Only from non-ended groups |
| `pending_yield` | `pendingYield` | User | Unclaimed yield |
| `active_groups_count` | `activeGroupsCount` | User | Auto-calculated |
| `groups_joined_count` | `totalGroupsJoined` | User | Auto-calculated |

### Group Table Fields to Remove

| Old DB Field | New Subgraph Field | Entity | Notes |
|--------------|-------------------|--------|-------|
| `total_capital` | `totalCapitalInGroup` | Group | Total from all members |
| `total_contributions` | `totalContributions` | Group | Sum of all contributions |
| `total_yield_generated` | `totalYieldGenerated` | Group | From Morpho vault |
| `total_yield_distributed` | `totalYieldDistributed` | Group | Distributed to members |
| `total_yield_claimed` | `totalYieldClaimed` | Group | Claimed by members |
| `members_count` | `membersCount` | Group | Auto-calculated |
| `active_members_count` | `activeMembers` | Group | Auto-calculated |
| `current_cycle` | `currentCycle` | Group | From blockchain |
| `is_started` | `groupStarted` | Group | Boolean |
| `is_ended` | `groupEnded` | Group | Boolean |
| `is_paused` | `paused` | Group | Boolean |

### Membership/Position Table Fields to Remove

| Old DB Field | New Subgraph Field | Entity | Notes |
|--------------|-------------------|--------|-------|
| `capital_in_group` | `capitalInGroup` | Member | User's capital in specific group |
| `total_contributed` | `totalContributedAmount` | Member | In this specific group |
| `yield_earned` | `totalYieldEarned` | Member | In this specific group |
| `yield_claimed` | `totalYieldClaimed` | Member | In this specific group |
| `pending_yield` | `pendingYield` | Member | In this specific group |
| `contribution_count` | `contributionsCount` | Member | Auto-calculated |
| `is_active` | `isActive` | Member | Boolean |
| `has_withdrawn` | `hasWithdrawn` | Member | Boolean |
| `joined_at` | `joinedAt` | Member | Unix timestamp |

### Daily Stats Tables to Remove

**Remove these entire tables:**
- `user_daily_stats` → Use `UserDailySnapshot` entity
- `group_daily_stats` → Use `GroupDailySnapshot` entity
- `protocol_daily_stats` → Use `ProtocolDailySnapshot` entity

---

## What to KEEP in Database

Keep these in your database (NOT available in subgraph):

1. **User authentication data** (email, password hash, etc.)
2. **User profile data** (name, avatar, preferences)
3. **User notification settings**
4. **Group metadata** (description, name if custom)
5. **Off-chain data** (user comments, ratings, etc.)
6. **Admin/moderation data**

---

## Field Type Conversions

### BigInt (Wei) to Number

All financial values come as strings representing wei:

```typescript
// Subgraph returns: "1000000" (1 USDC in wei)
// Convert to number:
const amount = Number(subgraphValue) / 1e6; // = 1.0

// Helper function:
function weiToUsdc(wei: string): number {
  return Number(wei) / 1_000_000;
}
```

### Timestamps

Subgraph returns Unix seconds as strings:

```typescript
// Subgraph returns: "1700000000"
// Convert to Date:
const date = new Date(Number(subgraphValue) * 1000);

// Helper function:
function unixToDate(unix: string): Date {
  return new Date(Number(unix) * 1000);
}
```

### Addresses

Always lowercase in subgraph:

```typescript
// Your DB might have: "0xAbC123..."
// Subgraph expects: "0xabc123..."
const normalizedAddress = address.toLowerCase();
```

### Booleans

Subgraph returns actual booleans (not 0/1):

```typescript
// Subgraph returns: true/false
// No conversion needed if your DB uses boolean type
```

---

## Query Mapping Examples

### Old: Get User Total Yield

**Before (Database):**
```sql
SELECT 
  total_yield_earned,
  total_yield_claimed,
  (total_yield_earned - total_yield_claimed) as pending_yield
FROM users 
WHERE address = '0x123...';
```

**After (Subgraph):**
```graphql
{
  user(id: "0x123...") {
    totalYieldEarned
    totalYieldClaimed
    pendingYield  # Already calculated!
  }
}
```

---

### Old: Get User's Groups with Yields

**Before (Database):**
```sql
SELECT 
  g.address,
  g.name,
  m.capital_in_group,
  m.yield_earned,
  m.pending_yield
FROM memberships m
JOIN groups g ON m.group_id = g.id
WHERE m.user_address = '0x123...';
```

**After (Subgraph):**
```graphql
{
  members(where: { user: "0x123..." }) {
    capitalInGroup
    totalYieldEarned
    pendingYield
    group {
      id
      address
      contributionAmount
      currentCycle
    }
  }
}
```

---

### Old: Get Group Members

**Before (Database):**
```sql
SELECT 
  u.address,
  m.capital_in_group,
  m.yield_earned,
  m.pending_yield
FROM memberships m
JOIN users u ON m.user_id = u.id
WHERE m.group_address = '0xabc...';
```

**After (Subgraph):**
```graphql
{
  members(where: { group: "0xabc..." }) {
    user {
      address
    }
    capitalInGroup
    totalYieldEarned
    pendingYield
  }
}
```

---

### Old: Get User Daily Stats for Chart

**Before (Database):**
```sql
SELECT 
  date,
  total_yield_earned,
  total_yield_claimed,
  daily_yield_earned,
  daily_yield_claimed
FROM user_daily_stats
WHERE user_address = '0x123...'
  AND date >= NOW() - INTERVAL 30 DAY
ORDER BY date ASC;
```

**After (Subgraph):**
```graphql
{
  userDailySnapshots(
    where: { 
      user: "0x123...",
      dayTimestamp_gte: "1700000000"
    }
    orderBy: dayTimestamp
    orderDirection: asc
  ) {
    dayTimestamp
    totalYieldEarned
    totalYieldClaimed
    dailyYieldEarned
    dailyYieldClaimed
  }
}
```

---

## Backend Service Changes

### Before (Database-based)

```typescript
// OLD CODE - REMOVE THIS
async function getUserYieldStats(userId: string) {
  const result = await db.query(`
    SELECT * FROM users WHERE address = $1
  `, [userId]);
  return result.rows[0];
}

async function updateUserYield(userId: string, yieldAmount: number) {
  await db.query(`
    UPDATE users 
    SET total_yield_earned = total_yield_earned + $1,
        pending_yield = pending_yield + $1
    WHERE address = $2
  `, [yieldAmount, userId]);
}
```

### After (Subgraph-based)

```typescript
// NEW CODE - USE THIS
import * as SubgraphService from './subgraph.service';

async function getUserYieldStats(userAddress: string) {
  // Just fetch from subgraph - no need to store/update!
  return SubgraphService.getUserStats(userAddress);
}

// No need for updateUserYield - subgraph auto-indexes blockchain events!
```

---

## Database Migration Steps

### Step 1: Add New API Endpoints

Keep old endpoints working while adding new subgraph-based endpoints:

```typescript
// OLD - Keep temporarily
app.get('/api/v1/user/:address/yield', oldController.getUserYield);

// NEW - Add alongside
app.get('/api/v2/user/:address/yield', subgraphController.getUserYield);
```

### Step 2: Update Frontend

Update frontend to use new v2 endpoints:

```typescript
// OLD
const response = await fetch('/api/v1/user/${address}/yield');

// NEW
const response = await fetch('/api/v2/user/${address}/yield');
```

### Step 3: Remove Old Code

Once verified, remove:
1. Old database columns
2. Old API endpoints
3. Background jobs that sync yield data
4. Any cron jobs calculating yields

### Step 4: Clean Database

```sql
-- Remove yield-related columns from users table
ALTER TABLE users 
  DROP COLUMN total_contributed,
  DROP COLUMN total_yield_earned,
  DROP COLUMN total_yield_claimed,
  DROP COLUMN pending_yield,
  DROP COLUMN active_capital;

-- Remove yield-related columns from groups table
ALTER TABLE groups
  DROP COLUMN total_capital,
  DROP COLUMN total_yield_generated,
  DROP COLUMN total_yield_claimed;

-- Drop daily stats tables
DROP TABLE user_daily_stats;
DROP TABLE group_daily_stats;

-- Drop membership yield columns
ALTER TABLE memberships
  DROP COLUMN capital_in_group,
  DROP COLUMN yield_earned,
  DROP COLUMN pending_yield;
```

---

## Verification Checklist

Before removing database fields, verify:

- [ ] All API endpoints return correct data from subgraph
- [ ] Frontend displays correct values
- [ ] Yield charts work correctly
- [ ] User dashboard shows correct totals
- [ ] Group pages show correct member yields
- [ ] Edge cases handled (new users, empty groups, etc.)
- [ ] Error handling works for subgraph downtime
- [ ] Caching is implemented for performance

---

## Rollback Plan

If issues arise:

1. Keep database columns marked as deprecated for 30 days
2. Log both old and new values for comparison
3. Have feature flag to switch between sources
4. Monitor for discrepancies

```typescript
// Feature flag example
const USE_SUBGRAPH = process.env.USE_SUBGRAPH === 'true';

async function getUserYield(address: string) {
  if (USE_SUBGRAPH) {
    return SubgraphService.getUserStats(address);
  } else {
    return DatabaseService.getUserStats(address);
  }
}
```
