# Zybra Subgraph - Query Examples for All Use Cases

## API Endpoint
```
POST https://api.studio.thegraph.com/query/99410/zybra-money/version/latest
Content-Type: application/json
```

---

## 1. User Dashboard - Overall Yield Stats

### Get User's Complete Stats
```graphql
query GetUserDashboard($userAddress: ID!) {
  user(id: $userAddress) {
    address
    # Overall stats
    totalContributed
    totalYieldEarned
    totalYieldClaimed
    totalWithdrawn
    totalCapitalWithdrawn
    # Active stats
    activeCapital
    pendingYield
    # Group counts
    activeGroupsCount
    endedGroupsCount
    totalGroupsJoined
    # Timestamps
    firstSeenAt
    lastActivityAt
  }
}
```

**Variables**:
```json
{
  "userAddress": "0x9c0fbdd79cc1b68b6be7b0dadfa377930e9c9f68"
}
```

**⚠️ IMPORTANT**: User address MUST be lowercase!

---

## 2. User Yield Chart - Time Series Data

### Get Daily Snapshots for Chart (Last 30 Days)
```graphql
query GetUserYieldChart($userAddress: String!, $startTime: BigInt!) {
  userDailySnapshots(
    where: { 
      user: $userAddress,
      dayTimestamp_gte: $startTime
    }
    orderBy: dayTimestamp
    orderDirection: asc
    first: 100
  ) {
    dayTimestamp
    dayStartTimestamp
    # Cumulative values (for total line)
    totalYieldEarned
    totalYieldClaimed
    activeCapital
    pendingYield
    # Daily deltas (for bar chart)
    dailyYieldEarned
    dailyYieldClaimed
    dailyContributions
    activeGroups
  }
}
```

**Variables** (30 days ago):
```json
{
  "userAddress": "0x9c0fbdd79cc1b68b6be7b0dadfa377930e9c9f68",
  "startTime": "1767225600"
}
```

**JavaScript to Calculate Start Time**:
```javascript
const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
```

---

## 3. User's Yield Per Group (Breakdown)

### Get All Groups User is In with Individual Yields
```graphql
query GetUserGroupBreakdown($userAddress: String!) {
  members(
    where: { user: $userAddress }
    orderBy: totalYieldEarned
    orderDirection: desc
  ) {
    id
    group {
      id
      address
      asset
      contributionAmount
      cycleDuration
      totalCycles
      currentCycle
      groupStarted
      groupEnded
      totalYieldGenerated
      membersCount
    }
    # User's position in this specific group
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
  }
}
```

**Variables**:
```json
{
  "userAddress": "0x9c0fbdd79cc1b68b6be7b0dadfa377930e9c9f68"
}
```

---

## 4. Group Page - Group Details with All Members

### Get Complete Group Info
```graphql
query GetGroupDetails($groupAddress: ID!) {
  group(id: $groupAddress) {
    id
    address
    admin
    # Configuration
    asset
    vault
    contributionAmount
    cycleDuration
    totalCycles
    # State
    groupStarted
    groupEnded
    paused
    startTime
    endTime
    currentCycle
    # Financial stats
    totalCapitalInGroup
    totalContributions
    totalYieldGenerated
    totalYieldDistributed
    totalYieldClaimed
    totalProtocolFees
    # Member stats
    membersCount
    activeMembers
    # Timestamps
    createdAt
    updatedAt
  }
}
```

### Get Group Members with Their Yields
```graphql
query GetGroupMembers($groupAddress: String!) {
  members(
    where: { group: $groupAddress }
    orderBy: capitalInGroup
    orderDirection: desc
    first: 100
  ) {
    id
    user {
      id
      address
    }
    capitalInGroup
    totalContributedAmount
    totalYieldEarned
    totalYieldClaimed
    pendingYield
    contributionsCount
    isActive
    hasWithdrawn
    joinedAt
    lastActivityAt
  }
}
```

---

## 5. Group Yield Chart

### Get Group Daily Stats for Chart
```graphql
query GetGroupYieldChart($groupAddress: String!, $startTime: BigInt!) {
  groupDailySnapshots(
    where: {
      group: $groupAddress,
      dayTimestamp_gte: $startTime
    }
    orderBy: dayTimestamp
    orderDirection: asc
    first: 100
  ) {
    dayTimestamp
    # Cumulative
    totalCapital
    totalYieldGenerated
    totalYieldClaimed
    # Daily
    dailyContributions
    dailyYieldGenerated
    dailyYieldClaimed
    dailyWithdrawals
    membersCount
    currentCycle
  }
}
```

---

## 6. Specific Member's Yield in a Group

### Get Member's Position and Yield in Specific Group
```graphql
query GetMemberInGroup($memberId: ID!) {
  member(id: $memberId) {
    capitalInGroup
    totalContributedAmount
    totalYieldEarned
    totalYieldClaimed
    pendingYield
    lastYieldClaimAt
    contributionsCount
    isActive
    hasWithdrawn
    inEndedGroup
    joinedAt
    lastActivityAt
    # Group info
    group {
      address
      contributionAmount
      currentCycle
      totalCycles
      groupEnded
    }
    # User info
    user {
      address
      totalYieldEarned
    }
  }
}
```

**Member ID Format**: `{groupAddress}_{userAddress}` (both lowercase)

**Variables**:
```json
{
  "memberId": "0x86443dd832cdeac575cdb67ff1b47cd9d2e11d19_0x9c0fbdd79cc1b68b6be7b0dadfa377930e9c9f68"
}
```

---

## 7. Member's Yield History in a Group (For Chart)

### Get Member Yield Snapshots
```graphql
query GetMemberYieldHistory($memberId: String!, $startTime: BigInt!) {
  memberYieldSnapshots(
    where: {
      member: $memberId,
      dayTimestamp_gte: $startTime
    }
    orderBy: dayTimestamp
    orderDirection: asc
    first: 100
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

---

## 8. List All Active Groups

```graphql
query GetActiveGroups($first: Int!, $skip: Int!) {
  groups(
    where: { groupEnded: false }
    orderBy: totalCapitalInGroup
    orderDirection: desc
    first: $first
    skip: $skip
  ) {
    id
    address
    asset
    contributionAmount
    cycleDuration
    totalCycles
    currentCycle
    groupStarted
    paused
    totalCapitalInGroup
    totalYieldGenerated
    membersCount
    activeMembers
    createdAt
  }
}
```

---

## 9. User's Contribution History

```graphql
query GetUserContributions($userAddress: String!, $first: Int!, $skip: Int!) {
  contributions(
    where: { user: $userAddress }
    orderBy: timestamp
    orderDirection: desc
    first: $first
    skip: $skip
  ) {
    id
    amount
    cycle
    timestamp
    txHash
    group {
      id
      address
      contributionAmount
    }
    userTotalContributed
    memberTotalContributed
  }
}
```

---

## 10. User's Yield Claim History

```graphql
query GetUserYieldClaims($userAddress: String!, $first: Int!, $skip: Int!) {
  yieldClaims(
    where: { user: $userAddress }
    orderBy: timestamp
    orderDirection: desc
    first: $first
    skip: $skip
  ) {
    id
    amount
    timestamp
    txHash
    group {
      id
      address
    }
    userTotalYieldClaimed
    memberTotalYieldClaimed
  }
}
```

---

## 11. Protocol Overview (Admin Dashboard)

```graphql
query GetProtocolOverview {
  protocols(first: 1) {
    totalGroups
    activeGroups
    endedGroups
    totalUsers
    totalContributions
    totalYieldGenerated
    totalYieldClaimed
    totalProtocolFees
    factoryAddress
    createdAt
    updatedAt
  }
}
```

---

## 12. Protocol Daily Stats for Dashboard Chart

```graphql
query GetProtocolDailyStats($startTime: BigInt!) {
  protocolDailySnapshots(
    where: { dayTimestamp_gte: $startTime }
    orderBy: dayTimestamp
    orderDirection: asc
    first: 100
  ) {
    dayTimestamp
    totalGroups
    activeGroups
    totalUsers
    # Cumulative
    totalContributions
    totalYieldGenerated
    totalYieldClaimed
    # Daily
    dailyContributions
    dailyYieldGenerated
    dailyYieldClaimed
    dailyNewUsers
    dailyNewGroups
  }
}
```

---

## 13. Check if User Exists

```graphql
query CheckUserExists($userAddress: ID!) {
  user(id: $userAddress) {
    id
    firstSeenAt
  }
}
```

Returns `null` if user doesn't exist.

---

## 14. Get Group's Cycle History

```graphql
query GetGroupCycles($groupAddress: String!) {
  cycles(
    where: { group: $groupAddress }
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

## 15. Recent Activity Feed

### Get Recent Contributions Across All Groups
```graphql
query GetRecentContributions($limit: Int!) {
  contributions(
    orderBy: timestamp
    orderDirection: desc
    first: $limit
  ) {
    id
    amount
    cycle
    timestamp
    txHash
    user { address }
    group { address }
  }
}
```

### Get Recent Yield Claims
```graphql
query GetRecentYieldClaims($limit: Int!) {
  yieldClaims(
    orderBy: timestamp
    orderDirection: desc
    first: $limit
  ) {
    id
    amount
    timestamp
    txHash
    user { address }
    group { address }
  }
}
```

---

## JavaScript/TypeScript Helper Functions

### Format Amount (USDC has 6 decimals)
```typescript
function formatAmount(weiAmount: string, decimals: number = 6): number {
  return Number(weiAmount) / Math.pow(10, decimals);
}
```

### Format Timestamp
```typescript
function formatTimestamp(unixSeconds: string): Date {
  return new Date(Number(unixSeconds) * 1000);
}
```

### Build Member ID
```typescript
function buildMemberId(groupAddress: string, userAddress: string): string {
  return `${groupAddress.toLowerCase()}_${userAddress.toLowerCase()}`;
}
```

### Calculate Day Timestamp
```typescript
function getDayTimestamp(date: Date): number {
  const SECONDS_PER_DAY = 86400;
  return Math.floor(date.getTime() / 1000 / SECONDS_PER_DAY) * SECONDS_PER_DAY;
}
```

### Get Start Time for Last N Days
```typescript
function getStartTimeForDays(days: number): string {
  const now = Math.floor(Date.now() / 1000);
  return String(now - days * 86400);
}
```

---

## Error Handling

The API returns errors in this format:
```json
{
  "errors": [
    {
      "message": "Error description",
      "locations": [{ "line": 1, "column": 1 }]
    }
  ]
}
```

Always check for `errors` in the response before accessing `data`.
