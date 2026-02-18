# Zybra Subgraph Schema + Yield Data Notes (for Contract Repo Verification)

## 1. Purpose
This document explains how the Zybra subgraph records **schema data** with a focus on **yield-related fields**, so the contract repo can verify that the subgraph’s yield data matches on-chain intent. It is written as a prompt/checklist for contract-side review.

## 2. Data Sources and Guarantees (High-Level)
The subgraph is **event-driven** and only does **limited view calls at event time**. Yield fields are therefore **best-effort snapshots** unless explicitly emitted by events.

**Authoritative (event-derived):**
- `YieldClaim.amount` (from `YieldClaimed` event)
- `Withdrawal.yieldAmount` (from `Withdrawn` event)
- `Group.totalYieldClaimed` (sum of claimed + withdrawn yield)
- `User.totalYieldClaimed` and `Member.totalYieldClaimed` (event sums)

**Best-effort (view call snapshots):**
- `Group.totalYieldGenerated` from `getGroupStatus().totalYield` sampled at event time
- `Group.pendingYieldNet` derived from `getGroupStatus()` snapshot
- `User.pendingYield` and `Member.pendingYield` from `getMemberInfo().pendingYieldAmount` sampled at event time
- `User.totalYieldAccrued` and `Member.totalYieldAccrued` derived from claim + pending snapshots

## 3. Yield Data Flow by Entity

### 3.1 Group
**Fields:**
- `totalYieldGenerated`: sampled via `getGroupStatus().totalYield` on any group event (best-effort)
- `totalYieldClaimed`: sum of `YieldClaimed.amount` + `Withdrawn.yield`
- `pendingYieldNet`: `max(totalYieldGenerated - totalYieldClaimed - feesAccumulated, 0)` from `getGroupStatus()` snapshot

**Expected behavior:**
- `totalYieldClaimed` must strictly equal the sum of `YieldClaimed.amount` and `Withdrawn.yield` for this group.
- `totalYieldGenerated` and `pendingYieldNet` only update on events (not continuous).

### 3.2 User
**Fields:**
- `totalYieldClaimed`: sum of user’s `YieldClaimed.amount` + `Withdrawn.yield`
- `pendingYield`: `getMemberInfo().pendingYieldAmount` sampled at event time for the user’s membership(s)
- `totalYieldAccrued`: `totalYieldClaimed + pendingYield`

**Expected behavior:**
- `totalYieldClaimed` is authoritative, event-derived.
- `pendingYield` may be stale between events.

### 3.3 Member
**Fields:**
- `totalYieldClaimed`: sum of member’s `YieldClaimed.amount` + `Withdrawn.yield`
- `pendingYield`: `getMemberInfo().pendingYieldAmount` sampled at event time
- `totalYieldAccrued`: `totalYieldClaimed + pendingYield`

**Expected behavior:**
- `totalYieldClaimed` is authoritative.
- `pendingYield` is a snapshot, not real-time.

### 3.4 YieldClaim (event entity)
**Fields:**
- `amount`: from `YieldClaimed.amount`
- `userTotalYieldClaimed`, `memberTotalYieldClaimed`: snapshots after update

**Expected behavior:**
- `amount` should match event logs exactly.
- Snapshot totals should equal entity totals at that event.

### 3.5 Withdrawal (event entity)
**Fields:**
- `yieldAmount`: from `Withdrawn.yield`
- `totalAmount`: `capitalAmount + yieldAmount`

**Expected behavior:**
- `yieldAmount` should match event logs exactly.

## 4. Contract-to-Subgraph Verification Checklist
Use this list inside the contract repo review to verify correctness:

1. **Events**
   - `YieldClaimed.amount` and `Withdrawn.yield` are emitted in ZybraGroupV2.
   - `FeesCollected.amount` is emitted (for pending yield net calculation).

2. **View Calls**
   - `getGroupStatus()` returns `totalYield` and `feesAccumulated` (or equivalent fields used in calculations).
   - `getMemberInfo(address)` returns `pendingYieldAmount`.

3. **Yield Sums**
   - `Group.totalYieldClaimed` = sum of `YieldClaimed.amount` + `Withdrawn.yield` (per group).
   - `User.totalYieldClaimed` = sum of user claim events + user withdrawn yield.
   - `Member.totalYieldClaimed` = sum of member claim events + member withdrawn yield.

4. **Snapshot Semantics**
   - `Group.totalYieldGenerated` is **only** a snapshot taken at event time, not continuous.
   - `Group.pendingYieldNet` uses the latest snapshot and should not be treated as real-time.
   - `User.pendingYield` and `Member.pendingYield` are snapshots and can be stale.

5. **Non-Indexed**
   - No vault accounting or ERC4626 events are indexed.
   - TVL, APY, and utilization are **not** derived from this subgraph.

## 5. Suggested Prompt for Contract Repo Review
Use this exact prompt in the contract repo to validate yield correctness:

```
Please confirm that the subgraph’s yield data is consistent with ZybraGroupV2:

1) Events
- YieldClaimed emits amount (yield claimed).
- Withdrawn emits yield (yield withdrawn).
- FeesCollected emits amount (protocol fees).

2) View calls used by subgraph
- getGroupStatus() returns totalYield and feesAccumulated (or equivalent fields used to compute pending yield).
- getMemberInfo(address) returns pendingYieldAmount.

3) Subgraph calculations
- Group.totalYieldClaimed = sum(YieldClaimed.amount + Withdrawn.yield) for the group.
- User/Member totalYieldClaimed = sum(YieldClaimed.amount + Withdrawn.yield) for that user/member.
- Group.totalYieldGenerated = getGroupStatus().totalYield snapshot at event time.
- Group.pendingYieldNet = max(totalYieldGenerated - totalYieldClaimed - feesAccumulated, 0) snapshot at event time.
- User/Member pendingYield = getMemberInfo().pendingYieldAmount snapshot at event time.

If any field names differ in the contract, please list the exact names and return values so we can align the subgraph mappings.
```

## 6. Thorough Consistency Prompt (Deep Audit)
Use this when you want a more exhaustive, adversarial check across events, view calls, and invariants:

```
Please perform a deep consistency review between ZybraGroupV2 and the subgraph mappings for yield and related aggregates:

A) Contract APIs and events
- List the exact event signatures for YieldClaimed, Withdrawn, FeesCollected, and any yield-related events.
- Confirm the parameter names and their units (raw token units, 1e18 scaled, etc.).
- Confirm that getGroupStatus() returns totalYield and feesAccumulated (or equivalents), including their units and scaling.
- Confirm that getMemberInfo(address) returns pendingYieldAmount and its units/scaling.

B) Event-to-entity mapping correctness
- YieldClaimed.amount -> YieldClaim.amount and affects Group/User/Member totalYieldClaimed.
- Withdrawn.yield -> Withdrawal.yieldAmount and affects Group/User/Member totalYieldClaimed.
- FeesCollected.amount -> Group.totalProtocolFees and affects pendingYieldNet calculation inputs.
- If any naming mismatch exists, provide the exact field names to update in mappings.

C) Aggregate invariants to validate
- For each group: Group.totalYieldClaimed equals sum of YieldClaimed.amount + Withdrawn.yield for that group.
- For each user: User.totalYieldClaimed equals sum of YieldClaimed.amount + Withdrawn.yield for that user.
- For each member: Member.totalYieldClaimed equals sum of YieldClaimed.amount + Withdrawn.yield for that member.
- Withdrawal.totalAmount equals Withdrawal.capitalAmount + Withdrawal.yieldAmount.

D) Snapshot semantics and staleness
- Confirm that totalYieldGenerated and pendingYieldNet are only sampled at event time, not continuously.
- Confirm that pendingYield for User/Member is a snapshot from getMemberInfo() and may be stale between events.

E) Edge cases
- Reorg behavior: ensure mappings are idempotent and replays restore correct totals.
- Event ordering: confirm that totals remain correct even if multiple events occur in the same block.
- Paused/unpaused: confirm no yield data is mutated outside event handlers.

Please report any mismatch between contract outputs and subgraph assumptions, including exact field names, return types, and units.
```

## 7. Notes and Warnings
- All yield snapshot fields are **best-effort** and may be stale between events.
- Event-derived totals are **authoritative** and should be used for audits.
- Reorgs are handled by deterministic IDs and event reprocessing.

---

Source: subgraph data contract (`docs/DATA_CONTRACT.md`).
