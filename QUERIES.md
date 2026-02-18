# Zybra ROSCA Subgraph - Query Documentation

## Endpoint

**Studio (Development):**
```
https://api.studio.thegraph.com/query/99410/zybra-money/v1.0.0
```

**Making Requests:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query": "YOUR_QUERY_HERE"}' \
  https://api.studio.thegraph.com/query/99410/zybra-money/v1.0.0
```

---

## Data Flow

```
ZybraGroupFactoryV2 (deploys) → ZybraGroupV2 (groups)
                                     ↓
                              Members join groups
                                     ↓
                              Contributions made
                                     ↓
                              Yield generated & claimed
                                     ↓
                              Withdrawals (capital + yield)
```

**Important:** Groups are indexed AFTER they are deployed by the factory. Each group is a separate contract that emits its own events.

---

## 1. PROTOCOL STATISTICS

### Get Protocol Overview
```graphql
query GetProtocolStats {
  protocol(id: "protocol") {
    totalGroups
    activeGroups
    endedGroups
    totalUsers
    totalContributions
    totalYieldGenerated
    totalYieldClaimed
    totalProtocolFees
    createdAt
    updatedAt
  }
}
```

---

## 2. GROUP QUERIES

### Get All Active Groups (Exclude Ended)
```graphql
query GetActiveGroups($first: Int!, $skip: Int!) {
  groups(
    where: { groupEnded: false }
    orderBy: createdAt
    orderDirection: desc
    first: $first
    skip: $skip
  ) {
    id
    address
    admin
    asset
    contributionAmount
    cycleDuration
    totalCycles
    currentCycle
    groupStarted
    groupEnded
    paused
    membersCount
    activeMembers
    totalCapitalInGroup
    totalContributions
    totalYieldGenerated
    totalYieldClaimed
    startTime
    createdAt
  }
}
```

### Get Single Group Details
```graphql
query GetGroupDetails($groupId: ID!) {
  group(id: $groupId) {
    id
    address
    admin
    asset
    vault
    contributionAmount
    cycleDuration
    totalCycles
    currentCycle
    groupStarted
    groupEnded
    paused
    startTime
    endTime
    membersCount
    activeMembers
    totalCapitalInGroup
    totalContributions
    totalYieldGenerated
    totalYieldDistributed
    totalYieldClaimed
    totalProtocolFees
    totalCapitalSeconds
    accumulatedYieldPerCapSec
    createdAt
    updatedAt
  }
}
```
**Note:** `groupId` is the group contract address in lowercase.

### Get Started Groups Only
```graphql
query GetStartedGroups {
  groups(
    where: { groupStarted: true, groupEnded: false }
    orderBy: startTime
    orderDirection: desc
  ) {
    id
    address
    currentCycle
    totalCycles
    membersCount
    totalCapitalInGroup
    totalYieldGenerated
  }
}
```

### Get Ended Groups (Historical)
```graphql
query GetEndedGroups {
  groups(
    where: { groupEnded: true }
    orderBy: endTime
    orderDirection: desc
  ) {
    id
    address
    totalCycles
    totalContributions
    totalYieldGenerated
    totalYieldClaimed
    endTime
  }
}
```

### Get Groups by Admin
```graphql
query GetGroupsByAdmin($adminAddress: Bytes!) {
  groups(where: { admin: $adminAddress }) {
    id
    address
    contributionAmount
    membersCount
    groupStarted
    groupEnded
  }
}
```

---

## 3. USER QUERIES

### Get User Overall Stats (Aggregate Across All Groups)
```graphql
query GetUserOverall($userId: ID!) {
  user(id: $userId) {
    id
    address
    totalContributed
    totalYieldEarned
    totalYieldClaimed
    totalWithdrawn
    totalCapitalWithdrawn
    activeCapital
    pendingYield
    activeGroupsCount
    endedGroupsCount
    totalGroupsJoined
    firstSeenAt
    lastActivityAt
  }
}
```
**Note:** `userId` is the user's wallet address in lowercase.

### Get User's Group Memberships
```graphql
query GetUserMemberships($userId: ID!) {
  user(id: $userId) {
    memberships {
      id
      capitalInGroup
      totalContributedAmount
      totalYieldEarned
      totalYieldClaimed
      pendingYield
      contributionsCount
      isActive
      hasWithdrawn
      inEndedGroup
      joinedAt
      lastActivityAt
      group {
        id
        address
        contributionAmount
        totalCycles
        currentCycle
        groupStarted
        groupEnded
      }
    }
  }
}
```

### Get User's Active Memberships Only
```graphql
query GetUserActiveMemberships($userId: ID!) {
  members(
    where: {
      user: $userId,
      isActive: true,
      inEndedGroup: false
    }
  ) {
    id
    capitalInGroup
    totalYieldEarned
    pendingYield
    group {
      id
      address
      currentCycle
      totalCycles
    }
  }
}
```

---

## 4. MEMBER QUERIES (User in Specific Group)

### Get Member Details
```graphql
query GetMemberDetails($memberId: ID!) {
  member(id: $memberId) {
    id
    capitalInGroup
    capitalSeconds
    yieldDebt
    lastContributedCycle
    contributionsCount
    totalContributedAmount
    totalYieldEarned
    totalYieldClaimed
    pendingYield
    lastYieldClaimAt
    isActive
    hasWithdrawn
    inEndedGroup
    joinedAt
    leftAt
    lastActivityAt
    user {
      id
      address
    }
    group {
      id
      address
      contributionAmount
      currentCycle
    }
  }
}
```
**Note:** `memberId` format is `groupAddress_userAddress` (both lowercase).

### Get All Members of a Group
```graphql
query GetGroupMembers($groupId: ID!) {
  members(where: { group: $groupId }) {
    id
    capitalInGroup
    totalYieldEarned
    totalYieldClaimed
    pendingYield
    isActive
    hasWithdrawn
    user {
      id
      address
    }
  }
}
```

---

## 5. CONTRIBUTION QUERIES

### Get User's All Contributions
```graphql
query GetUserContributions($userId: ID!, $first: Int!, $skip: Int!) {
  contributions(
    where: { user: $userId }
    orderBy: timestamp
    orderDirection: desc
    first: $first
    skip: $skip
  ) {
    id
    amount
    cycle
    timestamp
    userTotalContributed
    memberTotalContributed
    txHash
    group {
      id
      address
      contributionAmount
    }
  }
}
```

### Get Contributions for Specific Group
```graphql
query GetGroupContributions($groupId: ID!, $first: Int!) {
  contributions(
    where: { group: $groupId }
    orderBy: timestamp
    orderDirection: desc
    first: $first
  ) {
    id
    amount
    cycle
    timestamp
    user {
      id
      address
    }
  }
}
```

### Get Contributions by Cycle
```graphql
query GetContributionsByCycle($groupId: ID!, $cycle: BigInt!) {
  contributions(
    where: { group: $groupId, cycle: $cycle }
    orderBy: timestamp
  ) {
    id
    amount
    timestamp
    user {
      id
      address
    }
  }
}
```

---

## 6. YIELD QUERIES

### Get User's Yield Claims
```graphql
query GetUserYieldClaims($userId: ID!) {
  yieldClaims(
    where: { user: $userId }
    orderBy: timestamp
    orderDirection: desc
  ) {
    id
    amount
    timestamp
    userTotalYieldClaimed
    memberTotalYieldClaimed
    txHash
    group {
      id
      address
    }
  }
}
```

### Get Group Yield Events
```graphql
query GetGroupYieldEvents($groupId: ID!) {
  yieldEvents(
    where: { group: $groupId }
    orderBy: timestamp
    orderDirection: desc
  ) {
    id
    eventType
    amount
    newYieldPerCapSec
    cycle
    totalYield
    eligibleCapital
    timestamp
    txHash
  }
}
```

### Get Yield Distribution by Cycle
```graphql
query GetCycleYield($groupId: String!, $cycleNumber: BigInt!) {
  cycles(where: { group: $groupId, cycleNumber: $cycleNumber }) {
    cycleNumber
    eligibleCapital
    yieldGenerated
    yieldDistributed
    protocolFee
    totalContributions
    contributorsCount
    distributedAt
  }
}
```

---

## 7. WITHDRAWAL QUERIES

### Get User's Withdrawals
```graphql
query GetUserWithdrawals($userId: ID!) {
  withdrawals(
    where: { user: $userId }
    orderBy: timestamp
    orderDirection: desc
  ) {
    id
    capitalAmount
    yieldAmount
    totalAmount
    timestamp
    txHash
    group {
      id
      address
    }
  }
}
```

---

## 8. CHART DATA QUERIES (Time Series)

### User Daily Snapshots (For Charts)
```graphql
query GetUserDailyChart($userId: ID!, $startTime: BigInt!) {
  userDailySnapshots(
    where: { user: $userId, dayTimestamp_gte: $startTime }
    orderBy: dayTimestamp
    orderDirection: asc
  ) {
    dayTimestamp
    dayStartTimestamp
    totalContributed
    totalYieldEarned
    totalYieldClaimed
    activeCapital
    pendingYield
    dailyContributions
    dailyYieldEarned
    dailyYieldClaimed
    activeGroups
  }
}
```

### User Hourly Yield (Detailed Charts)
```graphql
query GetUserHourlyYield($userId: ID!, $startTime: BigInt!) {
  userHourlyYields(
    where: { user: $userId, hourTimestamp_gte: $startTime }
    orderBy: hourTimestamp
    orderDirection: asc
  ) {
    hourTimestamp
    cumulativeYieldEarned
    cumulativeYieldClaimed
    hourlyYieldEarned
    hourlyYieldClaimed
  }
}
```

### Group Daily Snapshots
```graphql
query GetGroupDailyChart($groupId: ID!, $startTime: BigInt!) {
  groupDailySnapshots(
    where: { group: $groupId, dayTimestamp_gte: $startTime }
    orderBy: dayTimestamp
    orderDirection: asc
  ) {
    dayTimestamp
    totalCapital
    totalYieldGenerated
    totalYieldClaimed
    dailyContributions
    dailyYieldGenerated
    dailyYieldClaimed
    dailyWithdrawals
    membersCount
    currentCycle
  }
}
```

### Member Yield Snapshots (Individual Group Charts)
```graphql
query GetMemberYieldChart($memberId: ID!, $startTime: BigInt!) {
  memberYieldSnapshots(
    where: { member: $memberId, dayTimestamp_gte: $startTime }
    orderBy: dayTimestamp
    orderDirection: asc
  ) {
    dayTimestamp
    capitalInGroup
    cumulativeYieldEarned
    cumulativeYieldClaimed
    pendingYield
    dailyYieldEarned
    dailyYieldClaimed
  }
}
```

### Protocol Daily Stats
```graphql
query GetProtocolDailyChart($startTime: BigInt!) {
  protocolDailySnapshots(
    where: { dayTimestamp_gte: $startTime }
    orderBy: dayTimestamp
    orderDirection: asc
  ) {
    dayTimestamp
    totalGroups
    activeGroups
    totalUsers
    totalContributions
    totalYieldGenerated
    totalYieldClaimed
    dailyContributions
    dailyYieldGenerated
    dailyYieldClaimed
    dailyNewUsers
    dailyNewGroups
  }
}
```

---

## 9. CYCLE DATA QUERIES

### Get All Cycles for a Group
```graphql
query GetGroupCycles($groupId: ID!) {
  cycles(
    where: { group: $groupId }
    orderBy: cycleNumber
    orderDirection: asc
  ) {
    cycleNumber
    eligibleCapital
    totalContributions
    contributorsCount
    yieldGenerated
    yieldDistributed
    protocolFee
    startTime
    endTime
    distributedAt
  }
}
```

---

## 10. ADMIN QUERIES

### Get Admin Changes
```graphql
query GetAdminChanges($groupId: ID!) {
  adminChanges(
    where: { group: $groupId }
    orderBy: timestamp
    orderDirection: desc
  ) {
    oldAdmin
    newAdmin
    timestamp
    txHash
  }
}
```

### Get Protocol Fee Collections
```graphql
query GetProtocolFees($groupId: ID!) {
  protocolFeeCollections(
    where: { group: $groupId }
    orderBy: timestamp
    orderDirection: desc
  ) {
    amount
    cycle
    recipient
    timestamp
    txHash
  }
}
```

---

## 11. METADATA QUERY

### Check Subgraph Sync Status
```graphql
{
  _meta {
    block {
      number
      hash
      timestamp
    }
    deployment
    hasIndexingErrors
  }
}
```

---

## Variable Types Reference

| Variable | Type | Example |
|----------|------|---------|
| `$userId` | ID! | `"0x9c0fbdd79cc1b68b6be7b0dadfa377930e9c9f68"` |
| `$groupId` | ID! | `"0x07e1208e193b5c884ae57f8ea78c42d56510e8ae"` |
| `$memberId` | ID! | `"0x07e1208e193b5c884ae57f8ea78c42d56510e8ae_0x9c0fbdd79cc1b68b6be7b0dadfa377930e9c9f68"` |
| `$adminAddress` | Bytes! | `"0x9c0fbdd79cc1b68b6be7b0dadfa377930e9c9f68"` |
| `$startTime` | BigInt! | `"1704067200"` (Unix timestamp) |
| `$cycle` | BigInt! | `"1"` |
| `$first` | Int! | `10` |
| `$skip` | Int! | `0` |

**Important:** All addresses must be lowercase!

---

## Backend Integration Example (JavaScript)

```javascript
const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/99410/zybra-money/v1.0.0';

async function querySubgraph(query, variables = {}) {
  const response = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const { data, errors } = await response.json();
  if (errors) throw new Error(errors[0].message);
  return data;
}

// Example: Get user's yield data
async function getUserYield(userAddress) {
  const query = `
    query GetUserYield($userId: ID!) {
      user(id: $userId) {
        totalContributed
        totalYieldEarned
        totalYieldClaimed
        activeCapital
        pendingYield
        activeGroupsCount
      }
    }
  `;
  return querySubgraph(query, { userId: userAddress.toLowerCase() });
}

// Example: Get active groups
async function getActiveGroups(first = 10, skip = 0) {
  const query = `
    query GetActiveGroups($first: Int!, $skip: Int!) {
      groups(
        where: { groupEnded: false }
        orderBy: createdAt
        orderDirection: desc
        first: $first
        skip: $skip
      ) {
        id
        address
        membersCount
        totalCapitalInGroup
        totalYieldGenerated
        groupStarted
      }
    }
  `;
  return querySubgraph(query, { first, skip });
}
```

---

## Filtering Patterns

### Filter by Multiple Conditions
```graphql
{
  groups(where: {
    groupStarted: true,
    groupEnded: false,
    membersCount_gt: 0
  }) {
    id
    membersCount
  }
}
```

### Filter with Range
```graphql
{
  contributions(where: {
    timestamp_gte: "1704067200",
    timestamp_lt: "1706745600"
  }) {
    id
    amount
    timestamp
  }
}
```

### Search by Partial Address
```graphql
{
  users(where: { id_contains: "0x9c0f" }) {
    id
    totalContributed
  }
}
```
