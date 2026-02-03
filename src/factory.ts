import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import { GroupDeployed } from "../generated/ZybraGroupFactoryV2/ZybraGroupFactoryV2";
import { ZybraGroupV2 as ZybraGroupV2Template } from "../generated/templates";
import { Protocol, Group, ProtocolDailySnapshot } from "../generated/schema";

// Constants
const PROTOCOL_ID = "protocol";
const ZERO = BigInt.fromI32(0);
const ONE = BigInt.fromI32(1);
const SECONDS_PER_DAY = 86400;

function getDayTimestamp(timestamp: BigInt): BigInt {
  return timestamp.div(BigInt.fromI32(SECONDS_PER_DAY)).times(BigInt.fromI32(SECONDS_PER_DAY));
}

function updateProtocolDailySnapshot(timestamp: BigInt, protocol: Protocol): void {
  let dayTimestamp = getDayTimestamp(timestamp);
  let snapshotId = "protocol_" + dayTimestamp.toString();
  let snapshot = ProtocolDailySnapshot.load(snapshotId);

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
  snapshot.dailyNewGroups = snapshot.dailyNewGroups.plus(ONE);

  snapshot.save();
}

export function handleGroupDeployed(event: GroupDeployed): void {
  // Get or create Protocol entity
  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol == null) {
    protocol = new Protocol(PROTOCOL_ID);
    protocol.totalGroups = ZERO;
    protocol.activeGroups = ZERO;
    protocol.endedGroups = ZERO;
    protocol.totalUsers = ZERO;
    protocol.totalContributions = ZERO;
    protocol.totalYieldClaimed = ZERO;
    protocol.totalProtocolFees = ZERO;
    protocol.factoryAddress = event.address;
    protocol.createdAt = event.block.timestamp;
    protocol.updatedAt = event.block.timestamp;
  }

  protocol.totalGroups = protocol.totalGroups.plus(ONE);
  protocol.activeGroups = protocol.activeGroups.plus(ONE); // New groups are active
  protocol.updatedAt = event.block.timestamp;
  protocol.save();

  // Create Group entity
  let groupId = event.params.groupAddress.toHexString().toLowerCase();
  let group = new Group(groupId);

  group.address = event.params.groupAddress;
  group.admin = event.params.admin;
  group.asset = event.params.asset;
  group.vault = event.params.vault;
  group.treasury = null;
  group.contributionAmount = event.params.contributionAmount;
  group.cycleDuration = event.params.cycleDuration;
  group.totalCycles = event.params.totalCycles;

  // Initialize state - GROUP IS ACTIVE BY DEFAULT
  group.groupStarted = false;
  group.groupEnded = false; // NOT ENDED
  group.paused = false;
  group.startTime = null;
  group.endTime = null;
  group.currentCycle = ZERO;

  // Initialize financial stats
  group.totalCapitalInGroup = ZERO;
  group.totalContributions = ZERO;
  group.totalYieldGenerated = ZERO;
  group.totalYieldClaimed = ZERO;
  group.totalProtocolFees = ZERO;
  group.pendingYieldNet = ZERO;
  group.totalCapitalWithdrawn = ZERO;
  group.totalYieldWithdrawn = ZERO;

  // Initialize time-weighted stats
  group.totalCapitalSeconds = ZERO;
  group.lastGlobalUpdateTime = event.block.timestamp;

  // Initialize member stats
  group.membersCount = 0;
  group.activeMembers = 0;

  // Timestamps
  group.createdAt = event.block.timestamp;
  group.updatedAt = event.block.timestamp;

  group.save();

  // Update protocol daily snapshot
  updateProtocolDailySnapshot(event.block.timestamp, protocol);

  // Create data source from template to start indexing this group
  ZybraGroupV2Template.create(event.params.groupAddress);
}
