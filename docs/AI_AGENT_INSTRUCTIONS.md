# AI Agent Integration Instructions

## CRITICAL: Read This First

You are integrating the Zybra Money Subgraph into an existing backend system. This document provides all the information you need to complete the integration without missing anything.

---

## Quick Reference

### API Endpoint
```
POST https://api.studio.thegraph.com/query/99410/zybra-money/version/latest
Content-Type: application/json
Body: { "query": "YOUR_GRAPHQL_QUERY" }
```

**NO AUTHENTICATION REQUIRED**

---

## Tasks Overview

1. ✅ Create subgraph service file
2. ✅ Create/update API routes for user yield data
3. ✅ Create/update API routes for group yield data  
4. ✅ Create/update API routes for chart data
5. ✅ Remove database queries for yield data
6. ✅ Add proper error handling
7. ✅ Add caching (optional)

---

## STEP 1: Create Subgraph Service

Create a new service file that handles all subgraph queries.

**File: `services/subgraph.service.ts` (or `.js`)**

See [BACKEND_INTEGRATION.md](./BACKEND_INTEGRATION.md) for the complete service code.

Key functions to implement:
- `getUserStats(userAddress)` - User's overall yield stats
- `getUserGroupPositions(userAddress)` - User's yield per group
- `getUserYieldChart(userAddress, days)` - User's daily snapshots for charts
- `getGroupDetails(groupAddress)` - Group info with yield stats
- `getGroupMembers(groupAddress)` - Group members with their yields
- `getGroupYieldChart(groupAddress, days)` - Group daily snapshots
- `getMemberPosition(groupAddress, userAddress)` - Specific member's yield in group

---

## STEP 2: Update User Routes

### 2.1 User Dashboard Endpoint

**Purpose**: Get user's overall yield statistics

**Endpoint**: `GET /api/user/:address/dashboard`

**Replace database query like**:
```sql
SELECT total_contributed, total_yield_earned, total_yield_claimed, pending_yield
FROM users WHERE address = ?
```

**With subgraph query**:
```graphql
{
  user(id: "0xlowercaseaddress") {
    totalContributed
    totalYieldEarned
    totalYieldClaimed
    pendingYield
    activeCapital
    activeGroupsCount
    totalGroupsJoined
  }
}
```

### 2.2 User's Groups (Yield Per Group)

**Purpose**: Show yield breakdown per group the user is in

**Endpoint**: `GET /api/user/:address/groups`

**Replace database query like**:
```sql
SELECT g.*, m.capital_in_group, m.yield_earned, m.pending_yield
FROM memberships m JOIN groups g ON m.group_id = g.id
WHERE m.user_address = ?
```

**With subgraph query**:
```graphql
{
  members(where: { user: "0xuseraddress" }) {
    capitalInGroup
    totalContributedAmount
    totalYieldEarned
    totalYieldClaimed
    pendingYield
    isActive
    group {
      address
      contributionAmount
      currentCycle
      totalCycles
      groupEnded
      totalYieldGenerated
      membersCount
    }
  }
}
```

### 2.3 User Yield Chart

**Purpose**: Time-series data for yield chart on dashboard

**Endpoint**: `GET /api/user/:address/yield-chart?days=30`

**Replace database query like**:
```sql
SELECT * FROM user_daily_stats 
WHERE user_address = ? AND date >= DATE_SUB(NOW(), INTERVAL ? DAY)
```

**With subgraph query**:
```graphql
{
  userDailySnapshots(
    where: { user: "0xuseraddress", dayTimestamp_gte: "startTimestamp" }
    orderBy: dayTimestamp
    orderDirection: asc
  ) {
    dayTimestamp
    totalYieldEarned
    totalYieldClaimed
    dailyYieldEarned
    dailyYieldClaimed
    activeCapital
    pendingYield
  }
}
```

---

## STEP 3: Update Group Routes

### 3.1 Group Details

**Purpose**: Show group info including yield statistics

**Endpoint**: `GET /api/group/:address`

**Subgraph query**:
```graphql
{
  group(id: "0xgroupaddress") {
    address
    admin
    asset
    contributionAmount
    cycleDuration
    totalCycles
    currentCycle
    groupStarted
    groupEnded
    totalCapitalInGroup
    totalYieldGenerated
    totalYieldClaimed
    membersCount
    activeMembers
  }
}
```

### 3.2 Group Members with Yields

**Purpose**: Show all members in a group with their individual yields

**Endpoint**: `GET /api/group/:address/members`

**Subgraph query**:
```graphql
{
  members(where: { group: "0xgroupaddress" }) {
    user { address }
    capitalInGroup
    totalContributedAmount
    totalYieldEarned
    totalYieldClaimed
    pendingYield
    isActive
    joinedAt
  }
}
```

### 3.3 Group Yield Chart

**Purpose**: Time-series data for group yield chart

**Endpoint**: `GET /api/group/:address/yield-chart?days=30`

**Subgraph query**:
```graphql
{
  groupDailySnapshots(
    where: { group: "0xgroupaddress", dayTimestamp_gte: "startTimestamp" }
    orderBy: dayTimestamp
    orderDirection: asc
  ) {
    dayTimestamp
    totalCapital
    totalYieldGenerated
    totalYieldClaimed
    dailyYieldGenerated
    dailyYieldClaimed
    membersCount
  }
}
```

### 3.4 Specific Member in Group

**Purpose**: Show a specific user's position in a group (for group page)

**Endpoint**: `GET /api/group/:groupAddress/member/:userAddress`

**Subgraph query**:
```graphql
{
  member(id: "0xgroupaddress_0xuseraddress") {
    capitalInGroup
    totalYieldEarned
    totalYieldClaimed
    pendingYield
    isActive
  }
}
```

**⚠️ IMPORTANT**: Member ID format is `{groupAddress}_{userAddress}` with both lowercase!

---

## STEP 4: Data Formatting

### Amount Conversion (Wei to USDC)

All amounts from subgraph are in wei (as strings). USDC has 6 decimals:

```typescript
function formatAmount(weiAmount: string): number {
  return Number(weiAmount) / 1_000_000;
}

// Example: "1000000" → 1.0 USDC
```

### Timestamp Conversion

Timestamps are Unix seconds (as strings):

```typescript
function formatTimestamp(unixSeconds: string): Date {
  return new Date(Number(unixSeconds) * 1000);
}

// For chart date labels:
function formatDateLabel(unixSeconds: string): string {
  return new Date(Number(unixSeconds) * 1000).toISOString().split('T')[0];
}
```

### Address Normalization

**ALWAYS lowercase addresses before querying**:

```typescript
function normalizeAddress(address: string): string {
  return address.toLowerCase();
}
```

---

## STEP 5: Remove Old Database Code

### Remove these database queries:
- Queries fetching user yield totals
- Queries fetching user pending yield
- Queries fetching group yield stats
- Queries fetching member yields
- Queries from daily stats tables

### Remove these database updates:
- Updates to user yield columns on contribution events
- Updates to user yield columns on claim events
- Background jobs calculating yields
- Cron jobs syncing yield data

### Remove these tables/columns:
- `user_daily_stats` table
- `group_daily_stats` table
- User table: `total_yield_earned`, `total_yield_claimed`, `pending_yield`, `active_capital`
- Group table: `total_yield_generated`, `total_yield_claimed`
- Membership table: `yield_earned`, `pending_yield`, `capital_in_group`

---

## STEP 6: Error Handling

Always check for errors in subgraph responses:

```typescript
async function querySubgraph(query: string, variables: any) {
  const response = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  
  const json = await response.json();
  
  if (json.errors) {
    console.error('Subgraph error:', json.errors);
    throw new Error('Subgraph query failed');
  }
  
  return json.data;
}
```

Handle user not found:

```typescript
const user = await getUserStats(address);
if (!user) {
  // User hasn't interacted with any group yet
  return { totalYieldEarned: 0, pendingYield: 0, ... };
}
```

---

## STEP 7: Response Formats

### User Dashboard Response
```json
{
  "address": "0x...",
  "totalContributed": 1000.00,
  "totalYieldEarned": 50.25,
  "totalYieldClaimed": 25.00,
  "pendingYield": 25.25,
  "activeCapital": 1000.00,
  "activeGroupsCount": 3,
  "totalGroupsJoined": 5
}
```

### User Groups Response
```json
[
  {
    "groupId": "0x...",
    "groupAddress": "0x...",
    "capitalInGroup": 500.00,
    "totalYieldEarned": 25.00,
    "pendingYield": 10.00,
    "isActive": true,
    "group": {
      "contributionAmount": 100.00,
      "currentCycle": 5,
      "totalCycles": 10,
      "groupEnded": false
    }
  }
]
```

### Yield Chart Response
```json
[
  {
    "date": "2026-01-01",
    "timestamp": 1735689600,
    "totalYieldEarned": 10.00,
    "dailyYieldEarned": 2.00,
    "pendingYield": 5.00
  },
  {
    "date": "2026-01-02",
    "timestamp": 1735776000,
    "totalYieldEarned": 12.50,
    "dailyYieldEarned": 2.50,
    "pendingYield": 7.50
  }
]
```

---

## Testing Checklist

After integration, verify:

- [ ] User dashboard shows correct total yield
- [ ] User dashboard shows correct pending yield
- [ ] User's groups list shows individual yields per group
- [ ] Yield chart displays with correct data points
- [ ] Group page shows total yield generated
- [ ] Group members list shows each member's yield
- [ ] New users (no subgraph data) handled gracefully
- [ ] Empty groups handled gracefully
- [ ] Error responses when subgraph is down

---

## Common Mistakes to Avoid

1. **Not lowercasing addresses** - Subgraph IDs are always lowercase
2. **Not dividing by decimals** - All amounts are in wei
3. **Not multiplying timestamps** - Unix seconds, not milliseconds
4. **Wrong member ID format** - Must be `{groupAddress}_{userAddress}`
5. **Not handling null responses** - Users may not exist yet
6. **Not removing old DB updates** - Don't update DB on blockchain events anymore

---

## Support Documents

For more details, see:
- [SCHEMA_REFERENCE.md](./SCHEMA_REFERENCE.md) - Complete GraphQL schema
- [QUERY_EXAMPLES.md](./QUERY_EXAMPLES.md) - Copy-paste queries
- [BACKEND_INTEGRATION.md](./BACKEND_INTEGRATION.md) - Full service code
- [DATA_MIGRATION.md](./DATA_MIGRATION.md) - DB field mapping
