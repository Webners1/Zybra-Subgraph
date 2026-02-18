# Zybra Subgraph Data Contract

## 1. High-Level Overview

### What this subgraph indexes
- ZybraGroupFactoryV2 deployments and group-level lifecycle events.
- ZybraGroupV2 group events: membership, contributions, yield claims, withdrawals, treasury changes, fee collections, pause/unpause.
- Time-series daily snapshots for users, groups, and protocol-wide aggregates.

### What this subgraph intentionally does not index
- Morpho/MetaMorpho vault internals (no vault-level accounting, no ERC4626 events).
- ERC20 token metadata (name/symbol/decimals) unless emitted by Zybra contracts (not present).
- Most on-chain state that is not emitted by events (view calls only for yield snapshots).
- Time-derived values without explicit events (e.g., real-time current cycle).

### Design philosophy
- Event-driven; deterministic IDs.
- Limited on-chain view calls used at event time for yield snapshots.
- Metrics reflect event history plus best-effort view snapshots.

---

## 2. Entity Reference

### Protocol
**Purpose:** Global aggregate across all groups created by the factory.

**Lifecycle:**
- Created on first `GroupDeployed`.
- Mutated by group and user event handlers.
- No terminal state.

**Primary ID:** `"protocol"`.

**Fields:**
- `id: ID` — constant `"protocol"`. Authoritative.
- `totalGroups: BigInt` — incremented on `GroupDeployed`. Authoritative.
- `activeGroups: BigInt` — incremented on `GroupDeployed`, decremented on `GroupEnded`. Authoritative.
- `endedGroups: BigInt` — incremented on `GroupEnded`. Authoritative.
- `totalUsers: BigInt` — incremented when a new `User` is created. Authoritative.
- `totalContributions: BigInt` — sum of `Contributed.amount`. Authoritative.
- `totalYieldClaimed: BigInt` — sum of `YieldClaimed.amount` and `Withdrawn.yield`. Authoritative.
- `totalProtocolFees: BigInt` — sum of `FeesCollected.amount`. Authoritative.
- `factoryAddress: Bytes` — factory address from `GroupDeployed`. Authoritative.
- `createdAt: BigInt` — block timestamp at first creation. Authoritative.
- `updatedAt: BigInt` — last mutation timestamp. Derived.

**Relationships:** none.

---

### Group
**Purpose:** Represents a single Zybra group/pool.

**Lifecycle:**
- Created on `GroupDeployed`.
- Mutated by group events.
- Terminal state when `groupEnded = true` (no explicit deletion).

**Primary ID:** group address lowercase.

**Fields:**
- `id: ID` — group address lowercase. Authoritative.
- `address: Bytes` — group address. Authoritative.
- `admin: Bytes` — factory `GroupDeployed.admin`. Authoritative (no admin-change event in v2).
- `asset: Bytes` — factory `GroupDeployed.asset`. Authoritative.
- `vault: Bytes` — factory `GroupDeployed.vault`. Authoritative.
- `treasury: Treasury` — set on `TreasuryUpdated` or `FeesCollected`. Authoritative when set; null otherwise.
- `contributionAmount: BigInt` — factory `GroupDeployed.contributionAmount`. Authoritative.
- `cycleDuration: BigInt` — factory `GroupDeployed.cycleDuration`. Authoritative.
- `totalCycles: BigInt` — factory `GroupDeployed.totalCycles`. Authoritative.
- `groupStarted: Boolean` — set true on `GroupStarted`. Authoritative.
- `groupEnded: Boolean` — set true on `GroupEnded`. Authoritative.
- `paused: Boolean` — set true on `Paused`, false on `Unpaused`. Authoritative.
- `startTime: BigInt` — `GroupStarted.timestamp`. Authoritative.
- `endTime: BigInt` — `GroupEnded.timestamp`. Authoritative.
- `currentCycle: BigInt` — last `Contributed.cycle` or set to 1 on `GroupStarted`. Best-effort (not time-derived).
- `totalCapitalInGroup: BigInt` — increment on `Contributed.amount`, decrement on `Withdrawn.capital`. Authoritative.
- `totalContributions: BigInt` — sum of `Contributed.amount`. Authoritative.
- `totalYieldGenerated: BigInt` — from `getGroupStatus().totalYield` at event time. Best-effort.
- `totalYieldClaimed: BigInt` — sum of `YieldClaimed.amount` and `Withdrawn.yield`. Authoritative.
- `totalProtocolFees: BigInt` — sum of `FeesCollected.amount`. Authoritative.
- `pendingYieldNet: BigInt` — `max(totalYieldGenerated − totalYieldClaimed − feesAccumulated, 0)` from `getGroupStatus()`. Best-effort.
- `totalCapitalWithdrawn: BigInt` — sum of `Withdrawn.capital`. Authoritative.
- `totalYieldWithdrawn: BigInt` — sum of `Withdrawn.yield`. Authoritative.
- `totalCapitalSeconds: BigInt` — time-weighted capital; updated on events only. Best-effort (event-timestamp based).
- `lastGlobalUpdateTime: BigInt` — updated on any event that mutates capital seconds. Authoritative.
- `membersCount: Int` — increments on `Joined`. Total-ever members (not decremented). Authoritative for total-ever.
- `activeMembers: Int` — increment on `Joined`, decrement on `Left`/`Withdrawn`. Best-effort; relies on correct event ordering.
- `createdAt: BigInt` — block timestamp at creation. Authoritative.
- `updatedAt: BigInt` — last mutation timestamp. Derived.

**Relationships:**
- `members`, `contributions`, `yieldClaims`, `withdrawals`, `cycles`, `feeCollections`, `dailySnapshots`.

---

### User
**Purpose:** Aggregate across groups for a wallet address.

**Lifecycle:**
- Created on first interaction (`Joined` or `Contributed`).
- Mutated by contributions, claims, withdrawals.
- No terminal state.

**Primary ID:** user address lowercase.

**Fields:**
- `id: ID` — user address lowercase. Authoritative.
- `address: Bytes` — original address. Authoritative.
- `totalContributed: BigInt` — sum of `Contributed.amount`. Authoritative.
- `totalYieldClaimed: BigInt` — sum of `YieldClaimed.amount` and `Withdrawn.yield`. Authoritative.
- `totalYieldAccrued: BigInt` — `totalYieldClaimed + pendingYield`. Best-effort.
- `totalWithdrawn: BigInt` — sum of `Withdrawn.capital + Withdrawn.yield`. Authoritative.
- `totalCapitalWithdrawn: BigInt` — sum of `Withdrawn.capital`. Authoritative.
- `activeCapital: BigInt` — sum of active `Member.capitalInGroup` from events. Best-effort.
- `pendingYield: BigInt` — from `getMemberInfo().pendingYieldAmount` at event time. Best-effort.
- `activeGroupsCount: Int` — increments on `Joined`, decrements on `Left`/`Withdrawn`. Best-effort.
- `endedGroupsCount: Int` — not updated in current mappings. Non-authoritative (do not use).
- `totalGroupsJoined: Int` — increments on `Joined`. Authoritative.
- `firstSeenAt: BigInt` — first interaction timestamp. Authoritative.
- `lastActivityAt: BigInt` — updated on any user event. Derived.

**Relationships:**
- `memberships`, `contributions`, `yieldClaims`, `withdrawals`, `dailySnapshots`.

---

### Member
**Purpose:** Per-user position within a group.

**Lifecycle:**
- Created on first `Joined` or `Contributed`.
- Mutated on contributions, yield claims, withdrawals, leave.
- Terminal when `isActive = false`.

**Primary ID:** `${groupAddress}_${userAddress}` lowercase.

**Fields:**
- `id: ID` — composite ID. Authoritative.
- `user: User` — owner. Authoritative.
- `group: Group` — parent. Authoritative.
- `capitalInGroup: BigInt` — increment on `Contributed`, set to 0 on `Withdrawn`. Authoritative.
- `capitalSeconds: BigInt` — updated on events via elapsed time. Best-effort.
- `lastUpdateTime: BigInt` — event timestamp of last update. Authoritative.
- `pendingYield: BigInt` — from `getMemberInfo().pendingYieldAmount` at event time. Best-effort.
- `lastContributedCycle: BigInt` — set on `Contributed.cycle`. Authoritative.
- `contributionsCount: Int` — increment on `Contributed`. Authoritative.
- `totalContributedAmount: BigInt` — sum of contributions in this group. Authoritative.
- `totalYieldClaimed: BigInt` — sum of `YieldClaimed.amount` and `Withdrawn.yield`. Authoritative.
- `totalYieldAccrued: BigInt` — `totalYieldClaimed + pendingYield`. Best-effort.
- `totalCapitalWithdrawn: BigInt` — sum of `Withdrawn.capital`. Authoritative.
- `totalYieldWithdrawn: BigInt` — sum of `Withdrawn.yield`. Authoritative.
- `lastYieldClaimAt: BigInt` — timestamp of last claim. Authoritative.
- `isActive: Boolean` — true on `Joined`, false on `Left`/`Withdrawn`. Authoritative.
- `hasWithdrawn: Boolean` — true on `Withdrawn`. Authoritative.
- `inEndedGroup: Boolean` — set only on interactions after group end. Best-effort; do not use as primary filter.
- `joinedAt: BigInt` — set on first creation. Authoritative.
- `leftAt: BigInt` — set on `Left`. Authoritative.
- `lastActivityAt: BigInt` — updated on any member event. Derived.

**Relationships:** `contributions`, `yieldClaims`.

---

### Contribution
**Purpose:** Immutable record of a single contribution event.

**Lifecycle:**
- Created on `Contributed`.
- No mutation.

**Primary ID:** `${txHash}_${logIndex}`.

**Fields:**
- `amount: BigInt` — event `Contributed.amount`. Authoritative.
- `cycle: BigInt` — event `Contributed.cycle`. Authoritative.
- `userTotalContributed: BigInt` — snapshot after update. Derived from subgraph state.
- `memberTotalContributed: BigInt` — snapshot after update. Derived from subgraph state.
- `txHash`, `blockNumber`, `timestamp`, `logIndex` — event metadata.

---

### YieldClaim
**Purpose:** Immutable record of a yield claim event.

**Lifecycle:**
- Created on `YieldClaimed`.
- No mutation.

**Primary ID:** `${txHash}_${logIndex}`.

**Fields:**
- `amount: BigInt` — event `YieldClaimed.amount`. Authoritative.
- `userTotalYieldClaimed`, `memberTotalYieldClaimed` — snapshots after update. Derived.
- `txHash`, `blockNumber`, `timestamp`, `logIndex` — event metadata.

---

### Withdrawal
**Purpose:** Immutable record of a capital + yield withdrawal.

**Lifecycle:**
- Created on `Withdrawn`.
- No mutation.

**Primary ID:** `${txHash}_${logIndex}`.

**Fields:**
- `capitalAmount: BigInt` — event `Withdrawn.capital`. Authoritative.
- `yieldAmount: BigInt` — event `Withdrawn.yield`. Authoritative.
- `totalAmount: BigInt` — `capitalAmount + yieldAmount`. Derived.
- `txHash`, `blockNumber`, `timestamp`, `logIndex` — event metadata.

---

### Cycle
**Purpose:** Per-cycle aggregate based on contribution events only.

**Lifecycle:**
- Created on first `Contributed` in a cycle.
- Mutated by subsequent contributions.
- No explicit terminal state.

**Primary ID:** `${groupAddress}_${cycleNumber}`.

**Fields:**
- `totalContributions: BigInt` — sum of `Contributed.amount` in the cycle. Authoritative.
- `contributorsCount: Int` — increment per contribution event (not unique). Best-effort.
- `startTime`, `endTime` — not populated by events; always null. Non-authoritative (do not use).

---

### FeeCollection
**Purpose:** Immutable protocol fee collection record.

**Lifecycle:**
- Created on `FeesCollected`.
- No mutation.

**Primary ID:** `${txHash}_${logIndex}`.

**Fields:**
- `treasury: Treasury` — event `FeesCollected.treasury`. Authoritative.
- `amount: BigInt` — event `FeesCollected.amount`. Authoritative.
- `txHash`, `blockNumber`, `timestamp`, `logIndex` — event metadata.

---

### Treasury
**Purpose:** Fee receiver entity.

**Lifecycle:**
- Created on `TreasuryUpdated` or `FeesCollected`.
- Mutated when fees are collected.

**Primary ID:** treasury address lowercase.

**Fields:**
- `address: Bytes` — treasury address. Authoritative.
- `totalFeesCollected: BigInt` — sum of `FeesCollected.amount`. Authoritative.
- `groups` — derived from `Group.treasury`.

---

### Snapshots (UserDailySnapshot, GroupDailySnapshot, ProtocolDailySnapshot)
**Purpose:** Daily time-series for dashboards. These are event-derived and update only on events; they are not guaranteed to be current between events.

**Fields:**
- All fields are either copied from parent entity at event time (authoritative snapshot) or are daily deltas accumulated from events (derived).

---

## 3. Metric Definitions

### TVL
Not indexed. There is no vault accounting or ERC4626 event ingestion. Do not compute TVL from this subgraph.

### Fees
- **Protocol fees (group-level):** `Group.totalProtocolFees = Σ FeesCollected.amount`.
- **Protocol fees (protocol-level):** `Protocol.totalProtocolFees = Σ FeesCollected.amount`.

### Balances
- **User active capital:** `User.activeCapital` (event-derived). Best-effort.
- **Group capital:** `Group.totalCapitalInGroup = Σ Contributed.amount − Σ Withdrawn.capital`.
- **Member capital:** `Member.capitalInGroup` (event-derived).

### Yield (best-effort)
- **Group gross yield:** `Group.totalYieldGenerated = getGroupStatus().totalYield` sampled on events.
- **Group net pending yield:** `Group.pendingYieldNet = max(totalYieldGenerated − totalYieldClaimed − feesAccumulated, 0)` sampled on events.
- **User pending yield:** `User.pendingYield` derived from member-level `getMemberInfo()` calls at event time.
- **User total accrued yield:** `User.totalYieldAccrued = User.totalYieldClaimed + User.pendingYield`.

### Revenue
Same as fees; no net revenue metrics computed.

### Utilization / Rates
Not indexed. No APY/ARP/Utilization metrics provided.

---

## 4. Query Patterns

### Group overview
Use group address as ID.

### User positions
Query `User` with derived `memberships`.

### Treasury / protocol revenue
Query `Treasury` and `FeeCollection` for event-level breakdown.

### Historical tracking
Use daily snapshots for time-series. These are event-driven and update only on event days.

### Pagination
- Always use `first` + `skip` or cursor-based pagination.
- Sort by `timestamp` or `blockNumber` where available.

### Safe filters
- `groupEnded` (on Group)
- `isActive` (on Member)

### Unsafe filters
- `currentCycle` (best-effort; not time-accurate)
- `inEndedGroup` (stale unless member interacted post-end)

---

## 5. Consistency & Guarantees

### Always correct
- Immutable event entities: `Contribution`, `YieldClaim`, `Withdrawal`, `FeeCollection`.
- Protocol totals derived from event sums.

### Eventually consistent
- Aggregates on `User`, `Group`, `Member` (event-driven updates).

### Best-effort
- `currentCycle`, `activeGroupsCount`, `activeMembers`, `capitalSeconds` values are event-derived and can be stale between events.

### Reorg behavior
- Handlers are idempotent and keyed by deterministic IDs (`txHash_logIndex`).
- Reorgs may revert latest events; reprocessing will restore correct state.

---

## 6. Versioning & Compatibility

- Schema changes require a new subgraph version (Studio version label).
- No backward-compatibility guarantees unless explicitly stated.
- Deprecated fields will be removed in a major version bump.

---

## 7. Anti-Patterns & Warnings

- Do not compute TVL or vault yield from this subgraph.
- Do not trust `currentCycle` as real-time cycle index.
- Do not use `inEndedGroup` for filtering without cross-checking `Group.groupEnded`.
- Do not assume `contributorsCount` is unique; it is increment-per-event.
- Do not compare metrics across versions without schema diff review.

---

## What is NOT Available from Subgraph (Must Use On-Chain)
| Data | Reason | Solution |
|------|--------|----------|
| Real-time `pendingYield` | Only sampled at event time | Call `getMemberInfo(address)` on the group |
| Real-time `totalYield` | Only sampled at event time | Call `getGroupStatus()` on the group |
| `TVL` | Vault accounting not indexed | Query vault directly |
| `APY` | Not computed | Compute externally |
| Real-time `currentCycle` | Only sampled at event time | Call `getCurrentCycle()` on the group |
