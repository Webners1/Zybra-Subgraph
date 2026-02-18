import { BigInt, Address, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  Joined,
  Left,
  Contributed,
  Withdrawn,
  YieldClaimed,
  GroupStarted,
  GroupEnded,
  TreasuryUpdated,
  FeesCollected,
  Paused,
  Unpaused,
  ZybraGroupV2,
} from "../generated/templates/ZybraGroupV2/ZybraGroupV2";
import {
  Protocol,
  User,
  Group,
  Member,
  Contribution,
  YieldClaim,
  Withdrawal,
  Cycle,
  FeeCollection,
  UserDailySnapshot,
  GroupDailySnapshot,
  ProtocolDailySnapshot,
  Treasury,
} from "../generated/schema";

// Constants
const PROTOCOL_ID = "protocol";
const SECONDS_PER_DAY = 86400;
const ZERO = BigInt.fromI32(0);
const ONE = BigInt.fromI32(1);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getOrCreateUser(address: Address, timestamp: BigInt): User {
  let userId = address.toHexString().toLowerCase();
  let user = User.load(userId);

  if (user == null) {
    user = new User(userId);
    user.address = address;
    user.totalContributed = ZERO;
    user.totalYieldClaimed = ZERO;
    user.totalYieldAccrued = ZERO;
    user.totalWithdrawn = ZERO;
    user.totalCapitalWithdrawn = ZERO;
    user.activeCapital = ZERO;
    user.pendingYield = ZERO;
    user.activeGroupsCount = 0;
    user.endedGroupsCount = 0;
    user.totalGroupsJoined = 0;
    user.firstSeenAt = timestamp;
    user.lastActivityAt = timestamp;

    // Update protocol stats
    let protocol = Protocol.load(PROTOCOL_ID);
    if (protocol != null) {
      protocol.totalUsers = protocol.totalUsers.plus(ONE);
      protocol.updatedAt = timestamp;
      protocol.save();
    }

    // Update protocol daily snapshot
    updateProtocolDailySnapshot(timestamp, ZERO, ZERO, ZERO, ONE, ZERO);
  }

  return user;
}

function getOrCreateMember(
  group: Group,
  user: User,
  timestamp: BigInt
): Member {
  let memberId = group.id + "_" + user.id;
  let member = Member.load(memberId);

  if (member == null) {
    member = new Member(memberId);
    member.user = user.id;
    member.group = group.id;
    member.capitalInGroup = ZERO;
    member.capitalSeconds = ZERO;
    member.lastUpdateTime = timestamp;
    member.pendingYield = ZERO;
    member.lastContributedCycle = ZERO;
    member.contributionsCount = 0;
    member.totalContributedAmount = ZERO;
    member.totalYieldClaimed = ZERO;
    member.totalYieldAccrued = ZERO;
    member.totalCapitalWithdrawn = ZERO;
    member.totalYieldWithdrawn = ZERO;
    member.lastYieldClaimAt = null;
    member.isActive = false;
    member.hasWithdrawn = false;
    member.inEndedGroup = group.groupEnded;
    member.joinedAt = timestamp;
    member.leftAt = null;
    member.lastActivityAt = timestamp;
  }

  return member;
}

function getOrCreateCycle(group: Group, cycleNumber: BigInt): Cycle {
  let cycleId = group.id + "_" + cycleNumber.toString();
  let cycle = Cycle.load(cycleId);

  if (cycle == null) {
    cycle = new Cycle(cycleId);
    cycle.group = group.id;
    cycle.cycleNumber = cycleNumber;
    cycle.totalContributions = ZERO;
    cycle.contributorsCount = 0;
    cycle.startTime = null;
    cycle.endTime = null;
  }

  return cycle;
}

function getDayTimestamp(timestamp: BigInt): BigInt {
  return timestamp.div(BigInt.fromI32(SECONDS_PER_DAY)).times(BigInt.fromI32(SECONDS_PER_DAY));
}

function createEventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString() + "_" + event.logIndex.toString();
}

function updateGroupCapitalSeconds(group: Group, timestamp: BigInt): void {
  let elapsed = timestamp.minus(group.lastGlobalUpdateTime);
  if (elapsed.gt(ZERO) && group.totalCapitalInGroup.gt(ZERO)) {
    group.totalCapitalSeconds = group.totalCapitalSeconds.plus(group.totalCapitalInGroup.times(elapsed));
  }
  group.lastGlobalUpdateTime = timestamp;
}

function updateMemberCapitalSeconds(member: Member, timestamp: BigInt): void {
  let elapsed = timestamp.minus(member.lastUpdateTime);
  if (elapsed.gt(ZERO) && member.capitalInGroup.gt(ZERO)) {
    member.capitalSeconds = member.capitalSeconds.plus(member.capitalInGroup.times(elapsed));
  }
  member.lastUpdateTime = timestamp;
}

function updateGroupYieldFromChain(
  group: Group,
  contract: ZybraGroupV2,
  timestamp: BigInt
): void {
  let statusResult = contract.try_getGroupStatus();
  if (statusResult.reverted) return;

  let status = statusResult.value;
  let totalYield = status.value5;
  let feesAccumulated = status.value6;

  group.totalYieldGenerated = totalYield;
  group.currentCycle = status.value2;

  let claimedPlusFees = group.totalYieldClaimed.plus(feesAccumulated);
  if (totalYield.gt(claimedPlusFees)) {
    group.pendingYieldNet = totalYield.minus(claimedPlusFees);
  } else {
    group.pendingYieldNet = ZERO;
  }

  group.updatedAt = timestamp;
}

function updateMemberPendingFromChain(
  user: User,
  member: Member,
  contract: ZybraGroupV2
): void {
  let oldPending = member.pendingYield;
  let userAddress = Address.fromString(user.id);
  let infoResult = contract.try_getMemberInfo(userAddress);
  if (infoResult.reverted) return;

  let info = infoResult.value;
  let newPending = info.value1;

  member.pendingYield = newPending;
  member.totalYieldAccrued = member.totalYieldClaimed.plus(newPending);
  if (user.pendingYield.ge(oldPending)) {
    user.pendingYield = user.pendingYield.minus(oldPending).plus(newPending);
  } else {
    user.pendingYield = newPending;
  }
  user.totalYieldAccrued = user.totalYieldClaimed.plus(user.pendingYield);
}

// ============================================================================
// SNAPSHOT FUNCTIONS - For Chart Data
// ============================================================================

function updateUserDailySnapshot(
  user: User,
  timestamp: BigInt,
  contributionDelta: BigInt,
  yieldClaimedDelta: BigInt,
  withdrawalDelta: BigInt
): void {
  let dayTimestamp = getDayTimestamp(timestamp);
  let snapshotId = user.id + "_" + dayTimestamp.toString();
  let snapshot = UserDailySnapshot.load(snapshotId);

  if (snapshot == null) {
    snapshot = new UserDailySnapshot(snapshotId);
    snapshot.user = user.id;
    snapshot.dayTimestamp = dayTimestamp;
    snapshot.dayStartTimestamp = dayTimestamp;
    snapshot.dailyContributions = ZERO;
    snapshot.dailyYieldClaimed = ZERO;
    snapshot.dailyWithdrawals = ZERO;
  }

  // Update cumulative totals
  snapshot.totalContributed = user.totalContributed;
  snapshot.totalYieldClaimed = user.totalYieldClaimed;
  snapshot.totalYieldAccrued = user.totalYieldAccrued;
  snapshot.activeCapital = user.activeCapital;
  snapshot.pendingYield = user.pendingYield;
  snapshot.totalWithdrawn = user.totalWithdrawn;
  snapshot.activeGroups = user.activeGroupsCount;

  // Update daily deltas
  snapshot.dailyContributions = snapshot.dailyContributions.plus(contributionDelta);
  snapshot.dailyYieldClaimed = snapshot.dailyYieldClaimed.plus(yieldClaimedDelta);
  snapshot.dailyWithdrawals = snapshot.dailyWithdrawals.plus(withdrawalDelta);

  snapshot.save();
}

function updateGroupDailySnapshot(
  group: Group,
  timestamp: BigInt,
  contributionDelta: BigInt,
  yieldClaimedDelta: BigInt,
  withdrawalDelta: BigInt,
  feesCollectedDelta: BigInt
): void {
  let dayTimestamp = getDayTimestamp(timestamp);
  let snapshotId = group.id + "_" + dayTimestamp.toString();
  let snapshot = GroupDailySnapshot.load(snapshotId);

  if (snapshot == null) {
    snapshot = new GroupDailySnapshot(snapshotId);
    snapshot.group = group.id;
    snapshot.dayTimestamp = dayTimestamp;
    snapshot.dayStartTimestamp = dayTimestamp;
    snapshot.dailyContributions = ZERO;
    snapshot.dailyYieldClaimed = ZERO;
    snapshot.dailyWithdrawals = ZERO;
    snapshot.dailyFeesCollected = ZERO;
  }

  snapshot.totalCapital = group.totalCapitalInGroup;
  snapshot.totalYieldGenerated = group.totalYieldGenerated;
  snapshot.totalYieldClaimed = group.totalYieldClaimed;
  snapshot.totalProtocolFees = group.totalProtocolFees;
  snapshot.pendingYieldNet = group.pendingYieldNet;
  snapshot.totalCapitalWithdrawn = group.totalCapitalWithdrawn;
  snapshot.totalYieldWithdrawn = group.totalYieldWithdrawn;
  snapshot.membersCount = group.membersCount;
  snapshot.currentCycle = group.currentCycle;

  snapshot.dailyContributions = snapshot.dailyContributions.plus(contributionDelta);
  snapshot.dailyYieldClaimed = snapshot.dailyYieldClaimed.plus(yieldClaimedDelta);
  snapshot.dailyWithdrawals = snapshot.dailyWithdrawals.plus(withdrawalDelta);
  snapshot.dailyFeesCollected = snapshot.dailyFeesCollected.plus(feesCollectedDelta);

  snapshot.save();
}

function updateProtocolDailySnapshot(
  timestamp: BigInt,
  contributionDelta: BigInt,
  yieldClaimedDelta: BigInt,
  feesCollectedDelta: BigInt,
  newUsersDelta: BigInt,
  newGroupsDelta: BigInt
): void {
  let dayTimestamp = getDayTimestamp(timestamp);
  let snapshotId = "protocol_" + dayTimestamp.toString();
  let snapshot = ProtocolDailySnapshot.load(snapshotId);

  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol == null) return;

  if (snapshot == null) {
    snapshot = new ProtocolDailySnapshot(snapshotId);
    snapshot.dayTimestamp = dayTimestamp;
    snapshot.dayStartTimestamp = dayTimestamp;
    snapshot.dailyContributions = ZERO;
    snapshot.dailyYieldClaimed = ZERO;
    snapshot.dailyFeesCollected = ZERO;
    snapshot.dailyNewUsers = ZERO;
    snapshot.dailyNewGroups = ZERO;
  }

  snapshot.totalGroups = protocol.totalGroups;
  snapshot.activeGroups = protocol.activeGroups;
  snapshot.totalUsers = protocol.totalUsers;
  snapshot.totalContributions = protocol.totalContributions;
  snapshot.totalYieldClaimed = protocol.totalYieldClaimed;
  snapshot.totalProtocolFees = protocol.totalProtocolFees;

  snapshot.dailyContributions = snapshot.dailyContributions.plus(contributionDelta);
  snapshot.dailyYieldClaimed = snapshot.dailyYieldClaimed.plus(yieldClaimedDelta);
  snapshot.dailyFeesCollected = snapshot.dailyFeesCollected.plus(feesCollectedDelta);
  snapshot.dailyNewUsers = snapshot.dailyNewUsers.plus(newUsersDelta);
  snapshot.dailyNewGroups = snapshot.dailyNewGroups.plus(newGroupsDelta);

  snapshot.save();
}

// ============================================================================
// HELPER: Mark all members when group ends
// ============================================================================

function markMembersInEndedGroup(group: Group): void {
  // Note: In AssemblyScript, we can't iterate over derived fields
  // Members will be marked when they next interact with the contract
  // The inEndedGroup flag is updated in handleGroupEnded for new queries
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Member Events
export function handleJoined(event: Joined): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  let user = getOrCreateUser(event.params.member, event.block.timestamp);
  let member = getOrCreateMember(group, user, event.block.timestamp);

  // Update member
  member.isActive = true;
  member.inEndedGroup = group.groupEnded;
  member.lastUpdateTime = event.block.timestamp;
  member.lastActivityAt = event.block.timestamp;
  member.save();

  // Update user
  user.activeGroupsCount = user.activeGroupsCount + 1;
  user.totalGroupsJoined = user.totalGroupsJoined + 1;
  user.lastActivityAt = event.block.timestamp;
  user.save();

  // Update group
  group.membersCount = group.membersCount + 1;
  group.activeMembers = group.activeMembers + 1;
  group.updatedAt = event.block.timestamp;
  group.save();

  updateUserDailySnapshot(user, event.block.timestamp, ZERO, ZERO, ZERO);
  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, ZERO, ZERO, ZERO);
}

export function handleLeft(event: Left): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  let user = User.load(event.params.member.toHexString().toLowerCase());
  if (user == null) return;

  let memberId = group.id + "_" + user.id;
  let member = Member.load(memberId);
  if (member == null) return;

  // Update user active capital
  user.activeCapital = user.activeCapital.minus(member.capitalInGroup);

  // Update member
  member.isActive = false;
  member.lastUpdateTime = event.block.timestamp;
  member.leftAt = event.block.timestamp;
  member.lastActivityAt = event.block.timestamp;
  member.save();

  // Update user
  user.activeGroupsCount = user.activeGroupsCount - 1;
  user.lastActivityAt = event.block.timestamp;
  user.save();

  // Update group
  group.activeMembers = group.activeMembers - 1;
  group.updatedAt = event.block.timestamp;
  group.save();

  updateUserDailySnapshot(user, event.block.timestamp, ZERO, ZERO, ZERO);
  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, ZERO, ZERO, ZERO);
}

// Contribution Events - CRITICAL FOR TRACKING
export function handleContributed(event: Contributed): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  let user = getOrCreateUser(event.params.member, event.block.timestamp);
  let member = getOrCreateMember(group, user, event.block.timestamp);
  let cycle = getOrCreateCycle(group, event.params.cycle);

  let amount = event.params.amount;

  // Update time-weighted capital before changing balances
  updateGroupCapitalSeconds(group, event.block.timestamp);
  updateMemberCapitalSeconds(member, event.block.timestamp);

  // Update member FIRST (individual tracking per group)
  member.capitalInGroup = member.capitalInGroup.plus(amount);
  member.lastContributedCycle = event.params.cycle;
  member.contributionsCount = member.contributionsCount + 1;
  member.totalContributedAmount = member.totalContributedAmount.plus(amount);
  member.lastActivityAt = event.block.timestamp;
  member.save();

  // Update user (aggregate across groups)
  user.totalContributed = user.totalContributed.plus(amount);
  user.activeCapital = user.activeCapital.plus(amount);
  user.lastActivityAt = event.block.timestamp;
  user.save();

  // Create contribution entity with running totals
  let contributionId = createEventId(event);
  let contribution = new Contribution(contributionId);
  contribution.user = user.id;
  contribution.group = group.id;
  contribution.member = member.id;
  contribution.amount = amount;
  contribution.cycle = event.params.cycle;
  contribution.userTotalContributed = user.totalContributed;
  contribution.memberTotalContributed = member.totalContributedAmount;
  contribution.txHash = event.transaction.hash;
  contribution.blockNumber = event.block.number;
  contribution.timestamp = event.block.timestamp;
  contribution.logIndex = event.logIndex;
  contribution.save();

  // Update cycle
  cycle.totalContributions = cycle.totalContributions.plus(amount);
  cycle.contributorsCount = cycle.contributorsCount + 1;
  cycle.save();

  // Update group
  group.totalCapitalInGroup = group.totalCapitalInGroup.plus(amount);
  group.totalContributions = group.totalContributions.plus(amount);
  group.currentCycle = event.params.cycle;
  group.updatedAt = event.block.timestamp;
  group.save();

  let contract = ZybraGroupV2.bind(event.address);
  updateGroupYieldFromChain(group, contract, event.block.timestamp);
  updateMemberPendingFromChain(user, member, contract);
  user.totalYieldAccrued = user.totalYieldClaimed.plus(user.pendingYield);
  group.save();
  member.save();
  user.save();

  // Update protocol
  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol != null) {
    protocol.totalContributions = protocol.totalContributions.plus(amount);
    protocol.updatedAt = event.block.timestamp;
    protocol.save();
  }

  // Update all snapshots for charts
  updateUserDailySnapshot(user, event.block.timestamp, amount, ZERO, ZERO);
  updateGroupDailySnapshot(group, event.block.timestamp, amount, ZERO, ZERO, ZERO);
  updateProtocolDailySnapshot(event.block.timestamp, amount, ZERO, ZERO, ZERO, ZERO);
}

// Yield Events - CRITICAL FOR TRACKING
export function handleYieldClaimed(event: YieldClaimed): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  let user = User.load(event.params.member.toHexString().toLowerCase());
  if (user == null) return;

  let memberId = group.id + "_" + user.id;
  let member = Member.load(memberId);
  if (member == null) return;

  let amount = event.params.amount;

  // Update time-weighted capital before accounting
  updateGroupCapitalSeconds(group, event.block.timestamp);
  updateMemberCapitalSeconds(member, event.block.timestamp);

  // Update member FIRST (individual tracking per group)
  member.totalYieldClaimed = member.totalYieldClaimed.plus(amount);
  member.lastYieldClaimAt = event.block.timestamp;
  member.lastActivityAt = event.block.timestamp;
  member.save();

  // Update user (aggregate)
  user.totalYieldClaimed = user.totalYieldClaimed.plus(amount);
  user.lastActivityAt = event.block.timestamp;
  user.save();

  // Create yield claim entity with running totals
  let claimId = createEventId(event);
  let yieldClaim = new YieldClaim(claimId);
  yieldClaim.user = user.id;
  yieldClaim.group = group.id;
  yieldClaim.member = member.id;
  yieldClaim.amount = amount;
  yieldClaim.userTotalYieldClaimed = user.totalYieldClaimed;
  yieldClaim.memberTotalYieldClaimed = member.totalYieldClaimed;
  yieldClaim.txHash = event.transaction.hash;
  yieldClaim.blockNumber = event.block.number;
  yieldClaim.timestamp = event.block.timestamp;
  yieldClaim.logIndex = event.logIndex;
  yieldClaim.save();

  // Update group
  group.totalYieldClaimed = group.totalYieldClaimed.plus(amount);
  group.updatedAt = event.block.timestamp;
  group.save();

  let contract = ZybraGroupV2.bind(event.address);
  updateGroupYieldFromChain(group, contract, event.block.timestamp);
  updateMemberPendingFromChain(user, member, contract);
  user.totalYieldAccrued = user.totalYieldClaimed.plus(user.pendingYield);
  group.save();
  member.save();
  user.save();

  // Update protocol
  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol != null) {
    protocol.totalYieldClaimed = protocol.totalYieldClaimed.plus(amount);
    protocol.updatedAt = event.block.timestamp;
    protocol.save();
  }

  // Update all snapshots for charts
  updateUserDailySnapshot(user, event.block.timestamp, ZERO, amount, ZERO);
  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, amount, ZERO, ZERO);
  updateProtocolDailySnapshot(event.block.timestamp, ZERO, amount, ZERO, ZERO, ZERO);
}

// Withdrawal Events
export function handleWithdrawn(event: Withdrawn): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  let user = User.load(event.params.member.toHexString().toLowerCase());
  if (user == null) return;

  let memberId = group.id + "_" + user.id;
  let member = Member.load(memberId);
  if (member == null) return;

  let capitalAmount = event.params.capital;
  let yieldAmount = event.params.yieldAmount;
  let totalAmount = capitalAmount.plus(yieldAmount);

  // Update time-weighted capital before changing balances
  updateGroupCapitalSeconds(group, event.block.timestamp);
  updateMemberCapitalSeconds(member, event.block.timestamp);

  // Create withdrawal entity
  let withdrawalId = createEventId(event);
  let withdrawal = new Withdrawal(withdrawalId);
  withdrawal.user = user.id;
  withdrawal.group = group.id;
  withdrawal.capitalAmount = capitalAmount;
  withdrawal.yieldAmount = yieldAmount;
  withdrawal.totalAmount = totalAmount;
  withdrawal.txHash = event.transaction.hash;
  withdrawal.blockNumber = event.block.number;
  withdrawal.timestamp = event.block.timestamp;
  withdrawal.logIndex = event.logIndex;
  withdrawal.save();

  // Update member (individual tracking)
  let oldPending = member.pendingYield;
  member.hasWithdrawn = true;
  member.isActive = false;
  member.totalYieldClaimed = member.totalYieldClaimed.plus(yieldAmount);
  member.totalYieldAccrued = member.totalYieldClaimed.plus(member.pendingYield);
  member.totalCapitalWithdrawn = member.totalCapitalWithdrawn.plus(capitalAmount);
  member.totalYieldWithdrawn = member.totalYieldWithdrawn.plus(yieldAmount);
  member.capitalInGroup = ZERO;
  member.pendingYield = ZERO;
  member.totalYieldAccrued = member.totalYieldClaimed;
  member.lastActivityAt = event.block.timestamp;
  member.save();

  // Update user (aggregate)
  user.totalWithdrawn = user.totalWithdrawn.plus(totalAmount);
  user.totalCapitalWithdrawn = user.totalCapitalWithdrawn.plus(capitalAmount);
  user.totalYieldClaimed = user.totalYieldClaimed.plus(yieldAmount);
  user.activeCapital = user.activeCapital.minus(capitalAmount);
  if (user.pendingYield.ge(oldPending)) {
    user.pendingYield = user.pendingYield.minus(oldPending);
  } else {
    user.pendingYield = ZERO;
  }
  user.totalYieldAccrued = user.totalYieldClaimed.plus(user.pendingYield);
  user.activeGroupsCount = user.activeGroupsCount - 1;
  user.lastActivityAt = event.block.timestamp;
  user.save();

  // Update group
  group.totalCapitalInGroup = group.totalCapitalInGroup.minus(capitalAmount);
  group.totalYieldClaimed = group.totalYieldClaimed.plus(yieldAmount);
  group.totalCapitalWithdrawn = group.totalCapitalWithdrawn.plus(capitalAmount);
  group.totalYieldWithdrawn = group.totalYieldWithdrawn.plus(yieldAmount);
  group.activeMembers = group.activeMembers - 1;
  group.updatedAt = event.block.timestamp;
  group.save();

  let contract = ZybraGroupV2.bind(event.address);
  updateGroupYieldFromChain(group, contract, event.block.timestamp);
  group.save();

  // Update protocol
  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol != null) {
    protocol.totalYieldClaimed = protocol.totalYieldClaimed.plus(yieldAmount);
    protocol.updatedAt = event.block.timestamp;
    protocol.save();
  }

  // Update snapshots
  updateUserDailySnapshot(user, event.block.timestamp, ZERO, yieldAmount, totalAmount);
  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, yieldAmount, totalAmount, ZERO);
  updateProtocolDailySnapshot(event.block.timestamp, ZERO, yieldAmount, ZERO, ZERO, ZERO);
}

// Group Lifecycle Events
export function handleGroupStarted(event: GroupStarted): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  group.groupStarted = true;
  group.startTime = event.params.timestamp;
  group.currentCycle = ONE;
  group.lastGlobalUpdateTime = event.block.timestamp;
  group.updatedAt = event.block.timestamp;
  group.save();

  let contract = ZybraGroupV2.bind(event.address);
  updateGroupYieldFromChain(group, contract, event.block.timestamp);
  group.save();

  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, ZERO, ZERO, ZERO);
}

export function handleGroupEnded(event: GroupEnded): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  // Mark group as ended - THIS IS KEY FOR FILTERING
  group.groupEnded = true;
  group.endTime = event.params.timestamp;
  group.updatedAt = event.block.timestamp;
  group.save();

  let contract = ZybraGroupV2.bind(event.address);
  updateGroupYieldFromChain(group, contract, event.block.timestamp);
  group.save();

  // Update protocol - decrease active groups
  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol != null) {
    protocol.activeGroups = protocol.activeGroups.minus(ONE);
    protocol.endedGroups = protocol.endedGroups.plus(ONE);
    protocol.updatedAt = event.block.timestamp;
    protocol.save();
  }

  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, ZERO, ZERO, ZERO);
}

// Treasury / Fee Events
export function handleTreasuryUpdated(event: TreasuryUpdated): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  let treasuryId = event.params.newTreasury.toHexString().toLowerCase();
  let treasury = Treasury.load(treasuryId);
  if (treasury == null) {
    treasury = new Treasury(treasuryId);
    treasury.address = event.params.newTreasury;
    treasury.totalFeesCollected = ZERO;
  }
  treasury.save();

  group.treasury = treasury.id;
  group.updatedAt = event.block.timestamp;
  group.save();

  let contract = ZybraGroupV2.bind(event.address);
  updateGroupYieldFromChain(group, contract, event.block.timestamp);
  group.save();
}

export function handleFeesCollected(event: FeesCollected): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  let treasuryId = event.params.treasury.toHexString().toLowerCase();
  let treasury = Treasury.load(treasuryId);
  if (treasury == null) {
    treasury = new Treasury(treasuryId);
    treasury.address = event.params.treasury;
    treasury.totalFeesCollected = ZERO;
  }

  let amount = event.params.amount;

  let feeId = createEventId(event);
  let feeCollection = new FeeCollection(feeId);
  feeCollection.group = group.id;
  feeCollection.treasury = treasury.id;
  feeCollection.amount = amount;
  feeCollection.txHash = event.transaction.hash;
  feeCollection.blockNumber = event.block.number;
  feeCollection.timestamp = event.block.timestamp;
  feeCollection.logIndex = event.logIndex;
  feeCollection.save();

  treasury.totalFeesCollected = treasury.totalFeesCollected.plus(amount);
  treasury.save();

  group.totalProtocolFees = group.totalProtocolFees.plus(amount);
  group.treasury = treasury.id;
  group.updatedAt = event.block.timestamp;
  group.save();

  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol != null) {
    protocol.totalProtocolFees = protocol.totalProtocolFees.plus(amount);
    protocol.updatedAt = event.block.timestamp;
    protocol.save();
  }

  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, ZERO, ZERO, amount);
  updateProtocolDailySnapshot(event.block.timestamp, ZERO, ZERO, amount, ZERO, ZERO);

  let contract = ZybraGroupV2.bind(event.address);
  updateGroupYieldFromChain(group, contract, event.block.timestamp);
  group.save();
}

// Pause Events
export function handlePaused(event: Paused): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  group.paused = true;
  group.updatedAt = event.block.timestamp;
  group.save();
}

export function handleUnpaused(event: Unpaused): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  group.paused = false;
  group.updatedAt = event.block.timestamp;
  group.save();
}
