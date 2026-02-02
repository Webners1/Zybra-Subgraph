import { BigInt, Address, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  Joined,
  Left,
  Contributed,
  Withdrawn,
  YieldClaimed,
  YieldAccrued,
  YieldDistributed,
  BatchYieldDistributed,
  GroupStartedEvent,
  GroupEndedEvent,
  AdminChanged,
  ProtocolFeeCollected,
  ProtocolFeeRecipientChanged,
  Paused,
  Unpaused,
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
  YieldEvent,
  ProtocolFeeCollection,
  UserDailySnapshot,
  UserHourlyYield,
  GroupDailySnapshot,
  GroupHourlySnapshot,
  MemberYieldSnapshot,
  ProtocolDailySnapshot,
  AdminChange,
} from "../generated/schema";

// Constants
const PROTOCOL_ID = "protocol";
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;
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
    user.totalYieldEarned = ZERO;
    user.totalYieldClaimed = ZERO;
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
    member.yieldDebt = ZERO;
    member.lastContributedCycle = ZERO;
    member.contributionsCount = 0;
    member.totalContributedAmount = ZERO;
    member.totalYieldEarned = ZERO;
    member.totalYieldClaimed = ZERO;
    member.pendingYield = ZERO;
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
    cycle.eligibleCapital = ZERO;
    cycle.totalContributions = ZERO;
    cycle.contributorsCount = 0;
    cycle.yieldGenerated = ZERO;
    cycle.yieldDistributed = false;
    cycle.protocolFee = ZERO;
    cycle.startTime = null;
    cycle.endTime = null;
    cycle.distributedAt = null;
  }

  return cycle;
}

function getDayTimestamp(timestamp: BigInt): BigInt {
  return timestamp.div(BigInt.fromI32(SECONDS_PER_DAY)).times(BigInt.fromI32(SECONDS_PER_DAY));
}

function getHourTimestamp(timestamp: BigInt): BigInt {
  return timestamp.div(BigInt.fromI32(SECONDS_PER_HOUR)).times(BigInt.fromI32(SECONDS_PER_HOUR));
}

function createEventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString() + "_" + event.logIndex.toString();
}

// ============================================================================
// SNAPSHOT FUNCTIONS - For Chart Data
// ============================================================================

function updateUserDailySnapshot(
  user: User,
  timestamp: BigInt,
  contributionDelta: BigInt,
  yieldEarnedDelta: BigInt,
  yieldClaimedDelta: BigInt
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
    snapshot.dailyYieldEarned = ZERO;
    snapshot.dailyYieldClaimed = ZERO;
  }

  // Update cumulative totals
  snapshot.totalContributed = user.totalContributed;
  snapshot.totalYieldEarned = user.totalYieldEarned;
  snapshot.totalYieldClaimed = user.totalYieldClaimed;
  snapshot.activeCapital = user.activeCapital;
  snapshot.pendingYield = user.pendingYield;
  snapshot.activeGroups = user.activeGroupsCount;

  // Update daily deltas
  snapshot.dailyContributions = snapshot.dailyContributions.plus(contributionDelta);
  snapshot.dailyYieldEarned = snapshot.dailyYieldEarned.plus(yieldEarnedDelta);
  snapshot.dailyYieldClaimed = snapshot.dailyYieldClaimed.plus(yieldClaimedDelta);

  snapshot.save();
}

function updateUserHourlyYield(
  user: User,
  timestamp: BigInt,
  yieldEarnedDelta: BigInt,
  yieldClaimedDelta: BigInt
): void {
  let hourTimestamp = getHourTimestamp(timestamp);
  let snapshotId = user.id + "_" + hourTimestamp.toString();
  let snapshot = UserHourlyYield.load(snapshotId);

  if (snapshot == null) {
    snapshot = new UserHourlyYield(snapshotId);
    snapshot.user = user.id;
    snapshot.hourTimestamp = hourTimestamp;
    snapshot.hourlyYieldEarned = ZERO;
    snapshot.hourlyYieldClaimed = ZERO;
  }

  snapshot.cumulativeYieldEarned = user.totalYieldEarned;
  snapshot.cumulativeYieldClaimed = user.totalYieldClaimed;
  snapshot.hourlyYieldEarned = snapshot.hourlyYieldEarned.plus(yieldEarnedDelta);
  snapshot.hourlyYieldClaimed = snapshot.hourlyYieldClaimed.plus(yieldClaimedDelta);

  snapshot.save();
}

function updateGroupDailySnapshot(
  group: Group,
  timestamp: BigInt,
  contributionDelta: BigInt,
  yieldGeneratedDelta: BigInt,
  yieldClaimedDelta: BigInt,
  withdrawalDelta: BigInt
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
    snapshot.dailyYieldGenerated = ZERO;
    snapshot.dailyYieldClaimed = ZERO;
    snapshot.dailyWithdrawals = ZERO;
  }

  snapshot.totalCapital = group.totalCapitalInGroup;
  snapshot.totalYieldGenerated = group.totalYieldGenerated;
  snapshot.totalYieldClaimed = group.totalYieldClaimed;
  snapshot.membersCount = group.membersCount;
  snapshot.currentCycle = group.currentCycle;

  snapshot.dailyContributions = snapshot.dailyContributions.plus(contributionDelta);
  snapshot.dailyYieldGenerated = snapshot.dailyYieldGenerated.plus(yieldGeneratedDelta);
  snapshot.dailyYieldClaimed = snapshot.dailyYieldClaimed.plus(yieldClaimedDelta);
  snapshot.dailyWithdrawals = snapshot.dailyWithdrawals.plus(withdrawalDelta);

  snapshot.save();
}

function updateGroupHourlySnapshot(
  group: Group,
  timestamp: BigInt,
  contributionDelta: BigInt,
  yieldGeneratedDelta: BigInt
): void {
  let hourTimestamp = getHourTimestamp(timestamp);
  let snapshotId = group.id + "_" + hourTimestamp.toString();
  let snapshot = GroupHourlySnapshot.load(snapshotId);

  if (snapshot == null) {
    snapshot = new GroupHourlySnapshot(snapshotId);
    snapshot.group = group.id;
    snapshot.hourTimestamp = hourTimestamp;
    snapshot.hourlyContributions = ZERO;
    snapshot.hourlyYieldGenerated = ZERO;
  }

  snapshot.totalCapital = group.totalCapitalInGroup;
  snapshot.totalYieldGenerated = group.totalYieldGenerated;
  snapshot.hourlyContributions = snapshot.hourlyContributions.plus(contributionDelta);
  snapshot.hourlyYieldGenerated = snapshot.hourlyYieldGenerated.plus(yieldGeneratedDelta);

  snapshot.save();
}

function updateMemberYieldSnapshot(
  member: Member,
  timestamp: BigInt,
  yieldEarnedDelta: BigInt,
  yieldClaimedDelta: BigInt
): void {
  let dayTimestamp = getDayTimestamp(timestamp);
  let snapshotId = member.id + "_" + dayTimestamp.toString();
  let snapshot = MemberYieldSnapshot.load(snapshotId);

  if (snapshot == null) {
    snapshot = new MemberYieldSnapshot(snapshotId);
    snapshot.member = member.id;
    snapshot.dayTimestamp = dayTimestamp;
    snapshot.dailyYieldEarned = ZERO;
    snapshot.dailyYieldClaimed = ZERO;
  }

  snapshot.capitalInGroup = member.capitalInGroup;
  snapshot.cumulativeYieldEarned = member.totalYieldEarned;
  snapshot.cumulativeYieldClaimed = member.totalYieldClaimed;
  snapshot.pendingYield = member.pendingYield;
  snapshot.dailyYieldEarned = snapshot.dailyYieldEarned.plus(yieldEarnedDelta);
  snapshot.dailyYieldClaimed = snapshot.dailyYieldClaimed.plus(yieldClaimedDelta);

  snapshot.save();
}

function updateProtocolDailySnapshot(
  timestamp: BigInt,
  contributionDelta: BigInt,
  yieldGeneratedDelta: BigInt,
  yieldClaimedDelta: BigInt,
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
    snapshot.dailyYieldGenerated = ZERO;
    snapshot.dailyYieldClaimed = ZERO;
    snapshot.dailyNewUsers = ZERO;
    snapshot.dailyNewGroups = ZERO;
  }

  snapshot.totalGroups = protocol.totalGroups;
  snapshot.activeGroups = protocol.activeGroups;
  snapshot.totalUsers = protocol.totalUsers;
  snapshot.totalContributions = protocol.totalContributions;
  snapshot.totalYieldGenerated = protocol.totalYieldGenerated;
  snapshot.totalYieldClaimed = protocol.totalYieldClaimed;

  snapshot.dailyContributions = snapshot.dailyContributions.plus(contributionDelta);
  snapshot.dailyYieldGenerated = snapshot.dailyYieldGenerated.plus(yieldGeneratedDelta);
  snapshot.dailyYieldClaimed = snapshot.dailyYieldClaimed.plus(yieldClaimedDelta);
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
  updateGroupHourlySnapshot(group, event.block.timestamp, amount, ZERO);
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

  // Update member FIRST (individual tracking per group)
  member.totalYieldClaimed = member.totalYieldClaimed.plus(amount);
  member.totalYieldEarned = member.totalYieldEarned.plus(amount);
  member.yieldDebt = member.yieldDebt.plus(amount);
  member.lastYieldClaimAt = event.block.timestamp;
  member.lastActivityAt = event.block.timestamp;
  member.save();

  // Update user (aggregate)
  user.totalYieldClaimed = user.totalYieldClaimed.plus(amount);
  user.totalYieldEarned = user.totalYieldEarned.plus(amount);
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

  // Update protocol
  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol != null) {
    protocol.totalYieldClaimed = protocol.totalYieldClaimed.plus(amount);
    protocol.updatedAt = event.block.timestamp;
    protocol.save();
  }

  // Update all snapshots for charts
  updateUserDailySnapshot(user, event.block.timestamp, ZERO, amount, amount);
  updateUserHourlyYield(user, event.block.timestamp, amount, amount);
  updateMemberYieldSnapshot(member, event.block.timestamp, amount, amount);
  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, ZERO, amount, ZERO);
  updateProtocolDailySnapshot(event.block.timestamp, ZERO, ZERO, amount, ZERO, ZERO);
}

export function handleYieldAccrued(event: YieldAccrued): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  let yieldAmount = event.params.totalYield;

  // Create yield event entity
  let yieldEventId = createEventId(event);
  let yieldEvent = new YieldEvent(yieldEventId);
  yieldEvent.group = group.id;
  yieldEvent.eventType = "ACCRUED";
  yieldEvent.amount = yieldAmount;
  yieldEvent.newYieldPerCapSec = event.params.newYieldPerCapital;
  yieldEvent.cycle = null;
  yieldEvent.totalYield = yieldAmount;
  yieldEvent.eligibleCapital = null;
  yieldEvent.txHash = event.transaction.hash;
  yieldEvent.blockNumber = event.block.number;
  yieldEvent.timestamp = event.block.timestamp;
  yieldEvent.logIndex = event.logIndex;
  yieldEvent.save();

  // Calculate yield delta
  let yieldDelta = yieldAmount.minus(group.totalYieldGenerated);
  if (yieldDelta.lt(ZERO)) {
    yieldDelta = ZERO;
  }

  // Update group
  group.accumulatedYieldPerCapSec = event.params.newYieldPerCapital;
  group.totalYieldGenerated = yieldAmount;
  group.updatedAt = event.block.timestamp;
  group.save();

  // Update protocol
  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol != null) {
    protocol.totalYieldGenerated = protocol.totalYieldGenerated.plus(yieldDelta);
    protocol.updatedAt = event.block.timestamp;
    protocol.save();
  }

  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, yieldDelta, ZERO, ZERO);
  updateGroupHourlySnapshot(group, event.block.timestamp, ZERO, yieldDelta);
  updateProtocolDailySnapshot(event.block.timestamp, ZERO, yieldDelta, ZERO, ZERO, ZERO);
}

export function handleYieldDistributed(event: YieldDistributed): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  let cycle = getOrCreateCycle(group, event.params.cycle);

  // Create yield event entity
  let yieldEventId = createEventId(event);
  let yieldEvent = new YieldEvent(yieldEventId);
  yieldEvent.group = group.id;
  yieldEvent.eventType = "DISTRIBUTED";
  yieldEvent.amount = event.params.totalYield;
  yieldEvent.newYieldPerCapSec = null;
  yieldEvent.cycle = event.params.cycle;
  yieldEvent.totalYield = event.params.totalYield;
  yieldEvent.eligibleCapital = event.params.eligibleCapital;
  yieldEvent.txHash = event.transaction.hash;
  yieldEvent.blockNumber = event.block.number;
  yieldEvent.timestamp = event.block.timestamp;
  yieldEvent.logIndex = event.logIndex;
  yieldEvent.save();

  // Update cycle
  cycle.yieldGenerated = event.params.totalYield;
  cycle.eligibleCapital = event.params.eligibleCapital;
  cycle.yieldDistributed = true;
  cycle.distributedAt = event.block.timestamp;
  cycle.save();

  // Update group
  group.totalYieldDistributed = group.totalYieldDistributed.plus(event.params.totalYield);
  group.updatedAt = event.block.timestamp;
  group.save();

  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, ZERO, ZERO, ZERO);
}

export function handleBatchYieldDistributed(event: BatchYieldDistributed): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  // Create yield event entity
  let yieldEventId = createEventId(event);
  let yieldEvent = new YieldEvent(yieldEventId);
  yieldEvent.group = group.id;
  yieldEvent.eventType = "BATCH_DISTRIBUTED";
  yieldEvent.amount = event.params.totalYield;
  yieldEvent.newYieldPerCapSec = null;
  yieldEvent.cycle = null;
  yieldEvent.totalYield = event.params.totalYield;
  yieldEvent.eligibleCapital = null;
  yieldEvent.txHash = event.transaction.hash;
  yieldEvent.blockNumber = event.block.number;
  yieldEvent.timestamp = event.block.timestamp;
  yieldEvent.logIndex = event.logIndex;
  yieldEvent.save();

  // Update group
  group.totalYieldDistributed = group.totalYieldDistributed.plus(event.params.totalYield);
  group.updatedAt = event.block.timestamp;
  group.save();

  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, ZERO, ZERO, ZERO);
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
  member.hasWithdrawn = true;
  member.isActive = false;
  member.totalYieldEarned = member.totalYieldEarned.plus(yieldAmount);
  member.totalYieldClaimed = member.totalYieldClaimed.plus(yieldAmount);
  member.capitalInGroup = ZERO;
  member.pendingYield = ZERO;
  member.lastActivityAt = event.block.timestamp;
  member.save();

  // Update user (aggregate)
  user.totalWithdrawn = user.totalWithdrawn.plus(totalAmount);
  user.totalCapitalWithdrawn = user.totalCapitalWithdrawn.plus(capitalAmount);
  user.totalYieldEarned = user.totalYieldEarned.plus(yieldAmount);
  user.totalYieldClaimed = user.totalYieldClaimed.plus(yieldAmount);
  user.activeCapital = user.activeCapital.minus(capitalAmount);
  user.activeGroupsCount = user.activeGroupsCount - 1;
  user.lastActivityAt = event.block.timestamp;
  user.save();

  // Update group
  group.totalCapitalInGroup = group.totalCapitalInGroup.minus(capitalAmount);
  group.totalYieldClaimed = group.totalYieldClaimed.plus(yieldAmount);
  group.activeMembers = group.activeMembers - 1;
  group.updatedAt = event.block.timestamp;
  group.save();

  // Update protocol
  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol != null) {
    protocol.totalYieldClaimed = protocol.totalYieldClaimed.plus(yieldAmount);
    protocol.updatedAt = event.block.timestamp;
    protocol.save();
  }

  // Update snapshots
  updateUserDailySnapshot(user, event.block.timestamp, ZERO, yieldAmount, yieldAmount);
  updateUserHourlyYield(user, event.block.timestamp, yieldAmount, yieldAmount);
  updateMemberYieldSnapshot(member, event.block.timestamp, yieldAmount, yieldAmount);
  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, ZERO, yieldAmount, totalAmount);
  updateProtocolDailySnapshot(event.block.timestamp, ZERO, ZERO, yieldAmount, ZERO, ZERO);
}

// Group Lifecycle Events
export function handleGroupStarted(event: GroupStartedEvent): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  group.groupStarted = true;
  group.startTime = event.params.timestamp;
  group.currentCycle = ONE;
  group.updatedAt = event.block.timestamp;
  group.save();

  updateGroupDailySnapshot(group, event.block.timestamp, ZERO, ZERO, ZERO, ZERO);
}

export function handleGroupEnded(event: GroupEndedEvent): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  // Mark group as ended - THIS IS KEY FOR FILTERING
  group.groupEnded = true;
  group.endTime = event.params.timestamp;
  group.updatedAt = event.block.timestamp;
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

// Admin Events
export function handleAdminChanged(event: AdminChanged): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  // Create admin change entity
  let adminChangeId = createEventId(event);
  let adminChange = new AdminChange(adminChangeId);
  adminChange.group = group.id;
  adminChange.oldAdmin = event.params.oldAdmin;
  adminChange.newAdmin = event.params.newAdmin;
  adminChange.txHash = event.transaction.hash;
  adminChange.blockNumber = event.block.number;
  adminChange.timestamp = event.block.timestamp;
  adminChange.save();

  // Update group
  group.admin = event.params.newAdmin;
  group.updatedAt = event.block.timestamp;
  group.save();
}

export function handleProtocolFeeCollected(event: ProtocolFeeCollected): void {
  let group = Group.load(event.address.toHexString().toLowerCase());
  if (group == null) return;

  let cycle = getOrCreateCycle(group, event.params.cycle);

  // Create protocol fee collection entity
  let feeId = createEventId(event);
  let feeCollection = new ProtocolFeeCollection(feeId);
  feeCollection.group = group.id;
  feeCollection.amount = event.params.amount;
  feeCollection.cycle = event.params.cycle;
  feeCollection.recipient = group.admin;
  feeCollection.txHash = event.transaction.hash;
  feeCollection.blockNumber = event.block.number;
  feeCollection.timestamp = event.block.timestamp;
  feeCollection.logIndex = event.logIndex;
  feeCollection.save();

  // Update cycle
  cycle.protocolFee = event.params.amount;
  cycle.save();

  // Update group
  group.totalProtocolFees = group.totalProtocolFees.plus(event.params.amount);
  group.updatedAt = event.block.timestamp;
  group.save();

  // Update protocol
  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol != null) {
    protocol.totalProtocolFees = protocol.totalProtocolFees.plus(event.params.amount);
    protocol.updatedAt = event.block.timestamp;
    protocol.save();
  }
}

export function handleProtocolFeeRecipientChanged(
  event: ProtocolFeeRecipientChanged
): void {
  // This event is primarily for off-chain tracking
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
