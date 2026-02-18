# Zybra Subgraph - Complete GraphQL Schema Reference

## API Endpoint
```
POST https://api.studio.thegraph.com/query/99410/zybra-money/version/latest
Content-Type: application/json
Body: { "query": "YOUR_GRAPHQL_QUERY" }
```

---

## Entity: Protocol

**Description**: Protocol-wide statistics. Single entity with ID "protocol".

```graphql
type Protocol {
  id: ID!                      # Always "protocol"
  totalGroups: BigInt!         # Total number of groups created
  activeGroups: BigInt!        # Groups that haven't ended
  endedGroups: BigInt!         # Groups that have ended
  totalUsers: BigInt!          # Total unique users
  totalContributions: BigInt!  # Sum of all contributions (in wei)
  totalYieldGenerated: BigInt! # Total yield generated (in wei)
  totalYieldClaimed: BigInt!   # Total yield claimed (in wei)
  totalProtocolFees: BigInt!   # Total protocol fees collected (in wei)
  factoryAddress: Bytes!       # Factory contract address
  createdAt: BigInt!           # Unix timestamp of first group
  updatedAt: BigInt!           # Unix timestamp of last update
}
```

**Example Query**:
```graphql
{
  protocols(first: 1) {
    id
    totalGroups
    activeGroups
    totalUsers
    totalContributions
    totalYieldGenerated
    totalYieldClaimed
  }
}
```

---

## Entity: User

**Description**: Global user entity aggregating data across ALL groups.

```graphql
type User {
  id: ID!                      # User address (lowercase)
  address: Bytes!              # User address as bytes
  
  # Aggregated stats across ALL groups (including ended)
  totalContributed: BigInt!    # Total ever contributed
  totalYieldEarned: BigInt!    # Total yield ever earned
  totalYieldClaimed: BigInt!   # Total yield ever claimed
  totalWithdrawn: BigInt!      # Total withdrawn (capital + yield)
  totalCapitalWithdrawn: BigInt! # Total capital withdrawn
  
  # Active stats (excludes ended groups)
  activeCapital: BigInt!       # Current capital in active groups
  pendingYield: BigInt!        # Unclaimed yield in active groups
  
  # Group participation
  activeGroupsCount: Int!      # Number of active groups
  endedGroupsCount: Int!       # Number of ended groups
  totalGroupsJoined: Int!      # Total groups ever joined
  
  # Relationships
  memberships: [Member!]!      # All group memberships
  contributions: [Contribution!]! # All contributions
  yieldClaims: [YieldClaim!]!  # All yield claims
  withdrawals: [Withdrawal!]!  # All withdrawals
  dailySnapshots: [UserDailySnapshot!]! # Daily stats for charts
  hourlyYieldSnapshots: [UserHourlyYield!]! # Hourly yield data
  
  # Timestamps
  firstSeenAt: BigInt!         # First activity timestamp
  lastActivityAt: BigInt!      # Last activity timestamp
}
```

**Example Query - Get User Stats**:
```graphql
{
  user(id: "0x1234...") {
    address
    totalContributed
    totalYieldEarned
    totalYieldClaimed
    activeCapital
    pendingYield
    activeGroupsCount
    totalGroupsJoined
  }
}
```

---

## Entity: Group

**Description**: ROSCA Group entity representing a single savings group.

```graphql
type Group {
  id: ID!                      # Group contract address (lowercase)
  address: Bytes!              # Group contract address
  admin: Bytes!                # Admin address
  
  # Configuration (immutable)
  asset: Bytes!                # ERC20 token address (e.g., USDC)
  vault: Bytes!                # Morpho vault address
  contributionAmount: BigInt!  # Required contribution per cycle
  cycleDuration: BigInt!       # Cycle duration in seconds
  totalCycles: BigInt!         # Total number of cycles
  
  # State - USE FOR FILTERING
  groupStarted: Boolean!       # Has the group started?
  groupEnded: Boolean!         # Has the group ended? (filter active groups)
  paused: Boolean!             # Is the group paused?
  startTime: BigInt            # Group start timestamp (null if not started)
  endTime: BigInt              # Group end timestamp (null if not ended)
  currentCycle: BigInt!        # Current cycle number
  
  # Financial stats
  totalCapitalInGroup: BigInt! # Total capital from all members
  totalContributions: BigInt!  # Sum of all contributions
  totalYieldGenerated: BigInt! # Total yield from vault
  totalYieldDistributed: BigInt! # Total yield distributed
  totalYieldClaimed: BigInt!   # Total yield claimed by members
  totalProtocolFees: BigInt!   # Protocol fees collected
  
  # Time-weighted stats (for yield calculation)
  totalCapitalSeconds: BigInt! # Accumulated capital × time
  accumulatedYieldPerCapSec: BigInt! # Yield per capital-second
  
  # Member stats
  membersCount: Int!           # Total members
  activeMembers: Int!          # Currently active members
  
  # Relationships
  members: [Member!]!          # All members
  contributions: [Contribution!]! # All contributions
  cycles: [Cycle!]!            # All cycles
  yieldClaims: [YieldClaim!]!  # All yield claims
  withdrawals: [Withdrawal!]!  # All withdrawals
  yieldEvents: [YieldEvent!]!  # All yield events
  dailySnapshots: [GroupDailySnapshot!]! # Daily stats
  hourlySnapshots: [GroupHourlySnapshot!]! # Hourly stats
  
  # Timestamps
  createdAt: BigInt!           # Group creation timestamp
  updatedAt: BigInt!           # Last update timestamp
}
```

**Example Query - Get Group with Members**:
```graphql
{
  group(id: "0xabc123...") {
    address
    contributionAmount
    cycleDuration
    totalCycles
    currentCycle
    groupStarted
    groupEnded
    totalCapitalInGroup
    totalYieldGenerated
    membersCount
    members {
      user { address }
      capitalInGroup
      totalYieldEarned
      pendingYield
      isActive
    }
  }
}
```

---

## Entity: Member

**Description**: User's membership in a specific group. Tracks individual yield and capital per group.

```graphql
type Member {
  id: ID!                      # "{groupId}_{userId}"
  user: User!                  # Reference to User entity
  group: Group!                # Reference to Group entity
  
  # Capital tracking - INDIVIDUAL PER GROUP
  capitalInGroup: BigInt!      # Current capital in this group
  capitalSeconds: BigInt!      # Time-weighted capital
  yieldDebt: BigInt!           # Yield already claimed (for calculation)
  
  # Activity tracking
  lastContributedCycle: BigInt! # Last cycle contributed
  contributionsCount: Int!     # Number of contributions
  totalContributedAmount: BigInt! # Sum of all contributions in this group
  
  # Yield tracking - INDIVIDUAL PER GROUP
  totalYieldEarned: BigInt!    # Total yield earned in this group
  totalYieldClaimed: BigInt!   # Total yield claimed from this group
  pendingYield: BigInt!        # Unclaimed yield in this group
  lastYieldClaimAt: BigInt     # Last yield claim timestamp
  
  # Status
  isActive: Boolean!           # Is member currently active?
  hasWithdrawn: Boolean!       # Has member withdrawn?
  inEndedGroup: Boolean!       # Is the group ended?
  
  # Relationships
  contributions: [Contribution!]! # Contributions in this group
  yieldClaims: [YieldClaim!]!  # Yield claims from this group
  yieldSnapshots: [MemberYieldSnapshot!]! # Daily yield snapshots
  
  # Timestamps
  joinedAt: BigInt!            # When user joined this group
  leftAt: BigInt               # When user left (null if still active)
  lastActivityAt: BigInt!      # Last activity timestamp
}
```

**Example Query - Get User's Position in a Group**:
```graphql
{
  member(id: "0xgroupAddress_0xuserAddress") {
    capitalInGroup
    totalContributedAmount
    totalYieldEarned
    totalYieldClaimed
    pendingYield
    isActive
    contributionsCount
    joinedAt
    lastActivityAt
  }
}
```

---

## Entity: Contribution

**Description**: Individual contribution transaction.

```graphql
type Contribution {
  id: ID!                      # "{txHash}_{logIndex}"
  user: User!                  # User who contributed
  group: Group!                # Group contributed to
  member: Member!              # Member entity
  
  amount: BigInt!              # Contribution amount
  cycle: BigInt!               # Cycle number
  
  # Running totals at time of contribution
  userTotalContributed: BigInt! # User's total after this contribution
  memberTotalContributed: BigInt! # Member's total in group after this
  
  # Transaction info
  txHash: Bytes!               # Transaction hash
  blockNumber: BigInt!         # Block number
  timestamp: BigInt!           # Unix timestamp
  logIndex: BigInt!            # Log index
}
```

---

## Entity: YieldClaim

**Description**: Yield claimed by a member.

```graphql
type YieldClaim {
  id: ID!                      # "{txHash}_{logIndex}"
  user: User!                  # User who claimed
  group: Group!                # Group claimed from
  member: Member!              # Member entity
  
  amount: BigInt!              # Amount claimed
  
  # Running totals at time of claim
  userTotalYieldClaimed: BigInt! # User's total claimed after this
  memberTotalYieldClaimed: BigInt! # Member's total in group after this
  
  # Transaction info
  txHash: Bytes!
  blockNumber: BigInt!
  timestamp: BigInt!
  logIndex: BigInt!
}
```

---

## Entity: Withdrawal

**Description**: Capital + yield withdrawal.

```graphql
type Withdrawal {
  id: ID!                      # "{txHash}_{logIndex}"
  user: User!                  # User who withdrew
  group: Group!                # Group withdrawn from
  
  capitalAmount: BigInt!       # Capital portion
  yieldAmount: BigInt!         # Yield portion
  totalAmount: BigInt!         # Total (capital + yield)
  
  # Transaction info
  txHash: Bytes!
  blockNumber: BigInt!
  timestamp: BigInt!
  logIndex: BigInt!
}
```

---

## Entity: Cycle

**Description**: Per-cycle data for a group.

```graphql
type Cycle {
  id: ID!                      # "{groupId}_{cycleNumber}"
  group: Group!                # Group reference
  cycleNumber: BigInt!         # Cycle number
  
  eligibleCapital: BigInt!     # Capital eligible for yield
  totalContributions: BigInt!  # Contributions this cycle
  contributorsCount: Int!      # Number of contributors
  
  yieldGenerated: BigInt!      # Yield generated this cycle
  yieldDistributed: Boolean!   # Has yield been distributed?
  protocolFee: BigInt!         # Protocol fee for this cycle
  
  startTime: BigInt            # Cycle start timestamp
  endTime: BigInt              # Cycle end timestamp
  distributedAt: BigInt        # When yield was distributed
}
```

---

## Entity: YieldEvent

**Description**: Tracks yield accrual and distribution events.

```graphql
type YieldEvent {
  id: ID!                      # "{txHash}_{logIndex}"
  group: Group!                # Group reference
  eventType: YieldEventType!   # ACCRUED | DISTRIBUTED | BATCH_DISTRIBUTED
  
  amount: BigInt!              # Yield amount
  newYieldPerCapSec: BigInt    # New yield per capital-second (for ACCRUED)
  cycle: BigInt                # Cycle number (for DISTRIBUTED)
  totalYield: BigInt           # Total yield
  eligibleCapital: BigInt      # Eligible capital (for DISTRIBUTED)
  
  # Transaction info
  txHash: Bytes!
  blockNumber: BigInt!
  timestamp: BigInt!
  logIndex: BigInt!
}

enum YieldEventType {
  ACCRUED
  DISTRIBUTED
  BATCH_DISTRIBUTED
}
```

---

## Chart Entities (Time-Series Data)

### UserDailySnapshot
**For user yield charts**

```graphql
type UserDailySnapshot {
  id: ID!                      # "{userId}_{dayTimestamp}"
  user: User!
  dayTimestamp: BigInt!        # Start of day (Unix)
  dayStartTimestamp: BigInt!   # Same as above
  
  # Cumulative totals
  totalContributed: BigInt!
  totalYieldEarned: BigInt!
  totalYieldClaimed: BigInt!
  activeCapital: BigInt!
  pendingYield: BigInt!
  
  # Daily deltas
  dailyContributions: BigInt!  # Contributions that day
  dailyYieldEarned: BigInt!    # Yield earned that day
  dailyYieldClaimed: BigInt!   # Yield claimed that day
  
  activeGroups: Int!
}
```

### GroupDailySnapshot
**For group TVL and yield charts**

```graphql
type GroupDailySnapshot {
  id: ID!                      # "{groupId}_{dayTimestamp}"
  group: Group!
  dayTimestamp: BigInt!
  dayStartTimestamp: BigInt!
  
  # Cumulative totals
  totalCapital: BigInt!
  totalYieldGenerated: BigInt!
  totalYieldClaimed: BigInt!
  
  # Daily deltas
  dailyContributions: BigInt!
  dailyYieldGenerated: BigInt!
  dailyYieldClaimed: BigInt!
  dailyWithdrawals: BigInt!
  
  membersCount: Int!
  currentCycle: BigInt!
}
```

### ProtocolDailySnapshot
**For protocol-wide dashboard charts**

```graphql
type ProtocolDailySnapshot {
  id: ID!                      # "protocol_{dayTimestamp}"
  dayTimestamp: BigInt!
  dayStartTimestamp: BigInt!
  
  totalGroups: BigInt!
  activeGroups: BigInt!
  totalUsers: BigInt!
  
  # Cumulative
  totalContributions: BigInt!
  totalYieldGenerated: BigInt!
  totalYieldClaimed: BigInt!
  
  # Daily
  dailyContributions: BigInt!
  dailyYieldGenerated: BigInt!
  dailyYieldClaimed: BigInt!
  dailyNewUsers: BigInt!
  dailyNewGroups: BigInt!
}
```

### MemberYieldSnapshot
**For individual member yield tracking within a group**

```graphql
type MemberYieldSnapshot {
  id: ID!                      # "{memberId}_{dayTimestamp}"
  member: Member!
  dayTimestamp: BigInt!
  
  capitalInGroup: BigInt!
  cumulativeYieldEarned: BigInt!
  cumulativeYieldClaimed: BigInt!
  pendingYield: BigInt!
  
  dailyYieldEarned: BigInt!
  dailyYieldClaimed: BigInt!
}
```

---

## Filtering and Sorting

### Common Filters

```graphql
# Filter active groups only
groups(where: { groupEnded: false }) { ... }

# Filter by user address
user(id: "0xlowercaseaddress") { ... }

# Filter contributions by group
contributions(where: { group: "0xgroupaddress" }) { ... }

# Filter by date range
userDailySnapshots(
  where: { 
    user: "0xuseraddress",
    dayTimestamp_gte: "1700000000",
    dayTimestamp_lte: "1710000000"
  }
) { ... }
```

### Sorting

```graphql
# Sort by most recent
contributions(orderBy: timestamp, orderDirection: desc) { ... }

# Sort by amount
members(orderBy: capitalInGroup, orderDirection: desc) { ... }
```

### Pagination

```graphql
# First 10
groups(first: 10) { ... }

# Skip first 10, get next 10
groups(first: 10, skip: 10) { ... }
```

---

## Important Notes

1. **All addresses MUST be lowercase** when querying by ID
2. **All amounts are in wei** (divide by 10^decimals for display)
3. **USDC has 6 decimals** - divide by 1,000,000
4. **Timestamps are Unix seconds** - multiply by 1000 for JS Date
5. **BigInt fields** are returned as strings in JSON responses
