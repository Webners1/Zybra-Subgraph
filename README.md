# Zybra ROSCA Subgraph

**Live Endpoint:** `https://api.studio.thegraph.com/query/99410/zybra-money/v1.0.0`

Subgraph for indexing Zybra ROSCA (Rotating Savings and Credit Association) smart contracts. This subgraph tracks:

- User yield across all groups
- Individual contributions
- Claimed yield
- Withdrawals (capital + yield)
- Group lifecycle events
- Protocol-wide statistics

## Prerequisites

- Node.js v18+
- npm or yarn
- Graph CLI: `npm install -g @graphprotocol/graph-cli`

## Setup

1. **Install dependencies:**
   ```bash
   cd subgraph
   npm install
   ```

2. **Update contract addresses in `subgraph.yaml`:**
   - Set your factory contract address
   - Set the correct network (mainnet, base, arbitrum-one, polygon, etc.)
   - Set the start block (block when factory was deployed)

## Build & Deploy

### Deploy to The Graph Studio (Hosted)

1. **Create a subgraph on The Graph Studio:**
   - Go to https://thegraph.com/studio/
   - Create a new subgraph
   - Get your deploy key

2. **Authenticate:**
   ```bash
   graph auth --studio <YOUR_DEPLOY_KEY>
   ```

3. **Generate code and build:**
   ```bash
   npm run codegen
   npm run build
   ```

4. **Deploy:**
   ```bash
   graph deploy --studio zybra-rosca
   ```

### Deploy to Local Graph Node

1. **Start a local Graph node** (requires Docker):
   ```bash
   docker-compose up -d
   ```

2. **Create and deploy:**
   ```bash
   npm run create:local
   npm run deploy:local
   ```

## GraphQL API Queries

Once deployed, you can query the subgraph. Here are example queries for your backend integration:

### Get User's Overall Yield and Investment

```graphql
query GetUserOverall($userAddress: ID!) {
  user(id: $userAddress) {
    address
    totalContributed
    totalYieldEarned
    totalYieldClaimed
    totalWithdrawn
    pendingYield
    activeGroupsCount
    totalGroupsJoined
    memberships {
      group {
        id
        address
      }
      capitalInGroup
      totalYieldEarned
      totalYieldClaimed
      pendingYield
      isActive
    }
  }
}
```

### Get User's Yield in a Specific Group

```graphql
query GetUserGroupYield($memberId: ID!) {
  # memberId format: "groupAddress_userAddress"
  member(id: $memberId) {
    capitalInGroup
    capitalSeconds
    totalYieldEarned
    totalYieldClaimed
    pendingYield
    contributionsCount
    isActive
    contributions(orderBy: timestamp, orderDirection: desc) {
      amount
      cycle
      timestamp
    }
    yieldClaims(orderBy: timestamp, orderDirection: desc) {
      amount
      timestamp
    }
  }
}
```

### Get All User Contributions

```graphql
query GetUserContributions($userAddress: ID!, $first: Int!, $skip: Int!) {
  contributions(
    where: { user: $userAddress }
    orderBy: timestamp
    orderDirection: desc
    first: $first
    skip: $skip
  ) {
    amount
    cycle
    timestamp
    group {
      id
      contributionAmount
      asset
    }
  }
}
```

### Get User's Yield Claims History

```graphql
query GetUserYieldClaims($userAddress: ID!) {
  yieldClaims(
    where: { user: $userAddress }
    orderBy: timestamp
    orderDirection: desc
  ) {
    amount
    timestamp
    group {
      id
      address
    }
  }
}
```

### Get Group Statistics

```graphql
query GetGroupStats($groupAddress: ID!) {
  group(id: $groupAddress) {
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
    totalContributions
    totalYieldGenerated
    totalYieldDistributed
    totalYieldClaimed
    membersCount
    activeMembers
    members {
      user {
        address
      }
      capitalInGroup
      totalYieldEarned
      isActive
    }
  }
}
```

### Get All Groups for a User

```graphql
query GetUserGroups($userAddress: ID!) {
  members(where: { user: $userAddress }) {
    group {
      id
      address
      contributionAmount
      totalCycles
      currentCycle
      groupStarted
      groupEnded
    }
    capitalInGroup
    totalYieldEarned
    totalYieldClaimed
    isActive
  }
}
```

### Get Protocol-Wide Statistics

```graphql
query GetProtocolStats {
  protocol(id: "protocol") {
    totalGroups
    totalUsers
    totalContributions
    totalYieldGenerated
    totalYieldClaimed
    totalProtocolFees
  }
}
```

### Get Historical Yield Data (Daily Snapshots)

```graphql
query GetUserYieldHistory($userAddress: ID!, $startTime: BigInt!) {
  userDailySnapshots(
    where: { user: $userAddress, dayTimestamp_gte: $startTime }
    orderBy: dayTimestamp
    orderDirection: asc
  ) {
    dayTimestamp
    totalContributed
    totalYieldEarned
    totalYieldClaimed
    activeGroups
  }
}
```

### Get Cycle-by-Cycle Yield Data

```graphql
query GetGroupCycleData($groupAddress: ID!) {
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
  }
}
```

### Search Users by Address Pattern

```graphql
query SearchUsers($addressPattern: String!) {
  users(
    where: { id_contains: $addressPattern }
    first: 10
  ) {
    address
    totalContributed
    totalYieldEarned
    activeGroupsCount
  }
}
```

## Entity Relationships

```
Protocol
└── Groups[]
    ├── Members[]
    │   ├── User
    │   ├── Contributions[]
    │   └── YieldClaims[]
    ├── Cycles[]
    ├── YieldEvents[]
    └── Withdrawals[]

User
├── Memberships[] (across groups)
├── Contributions[]
├── YieldClaims[]
├── Withdrawals[]
└── DailySnapshots[]
```

## Backend Integration Example

```javascript
// Example using Apollo Client
const GET_USER_YIELD = gql`
  query GetUserYield($address: ID!) {
    user(id: $address) {
      totalYieldEarned
      totalYieldClaimed
      pendingYield
      memberships {
        group { id }
        capitalInGroup
        totalYieldEarned
      }
    }
  }
`;

async function getUserYield(userAddress) {
  const { data } = await client.query({
    query: GET_USER_YIELD,
    variables: { address: userAddress.toLowerCase() }
  });
  return data.user;
}
```

## Networks Supported

Update the `network` field in `subgraph.yaml` to match your deployment:

- `mainnet` - Ethereum Mainnet
- `base` - Base
- `arbitrum-one` - Arbitrum One
- `polygon` - Polygon
- `optimism` - Optimism
- `avalanche` - Avalanche C-Chain

## Development

```bash
# Generate types from schema
npm run codegen

# Build the subgraph
npm run build

# Run tests (if configured)
npm run test
```

## File Structure

```
subgraph/
├── abis/
│   ├── ZybraGroupFactoryV2.json
│   └── ZybraGroupV2.json
├── src/
│   ├── factory.ts    # Factory event handlers
│   └── group.ts      # Group event handlers
├── schema.graphql    # GraphQL schema
├── subgraph.yaml     # Subgraph manifest
└── package.json
```
