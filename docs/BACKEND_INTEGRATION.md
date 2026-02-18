# Zybra Backend Integration Guide

## Overview

This guide provides step-by-step instructions to integrate the Zybra Subgraph into your existing backend system. The goal is to **replace database-stored yield/contribution data** with real-time blockchain-indexed data from The Graph.

---

## Prerequisites

- Node.js backend (Express, NestJS, or similar)
- Existing user authentication system
- Frontend that displays yield data

---

## Step 1: Install GraphQL Client

```bash
npm install graphql graphql-request
# OR
npm install @apollo/client
# OR
npm install axios  # Simple HTTP client works too
```

---

## Step 2: Create Subgraph Service

### Create: `services/subgraph.service.ts`

```typescript
import { GraphQLClient, gql } from 'graphql-request';

const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/99410/zybra-money/version/latest';

const client = new GraphQLClient(SUBGRAPH_URL);

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface UserStats {
  address: string;
  totalContributed: string;
  totalYieldEarned: string;
  totalYieldClaimed: string;
  totalWithdrawn: string;
  totalCapitalWithdrawn: string;
  activeCapital: string;
  pendingYield: string;
  activeGroupsCount: number;
  endedGroupsCount: number;
  totalGroupsJoined: number;
  firstSeenAt: string;
  lastActivityAt: string;
}

export interface MemberPosition {
  id: string;
  capitalInGroup: string;
  totalContributedAmount: string;
  totalYieldEarned: string;
  totalYieldClaimed: string;
  pendingYield: string;
  contributionsCount: number;
  isActive: boolean;
  hasWithdrawn: boolean;
  inEndedGroup: boolean;
  joinedAt: string;
  lastActivityAt: string;
  group: {
    id: string;
    address: string;
    asset: string;
    contributionAmount: string;
    cycleDuration: string;
    totalCycles: string;
    currentCycle: string;
    groupStarted: boolean;
    groupEnded: boolean;
    totalYieldGenerated: string;
    membersCount: number;
  };
}

export interface GroupDetails {
  id: string;
  address: string;
  admin: string;
  asset: string;
  vault: string;
  contributionAmount: string;
  cycleDuration: string;
  totalCycles: string;
  groupStarted: boolean;
  groupEnded: boolean;
  paused: boolean;
  startTime: string | null;
  endTime: string | null;
  currentCycle: string;
  totalCapitalInGroup: string;
  totalContributions: string;
  totalYieldGenerated: string;
  totalYieldDistributed: string;
  totalYieldClaimed: string;
  totalProtocolFees: string;
  membersCount: number;
  activeMembers: number;
  createdAt: string;
  updatedAt: string;
}

export interface DailySnapshot {
  dayTimestamp: string;
  totalYieldEarned: string;
  totalYieldClaimed: string;
  activeCapital: string;
  pendingYield: string;
  dailyYieldEarned: string;
  dailyYieldClaimed: string;
  dailyContributions: string;
}

export interface GroupDailySnapshot {
  dayTimestamp: string;
  totalCapital: string;
  totalYieldGenerated: string;
  totalYieldClaimed: string;
  dailyContributions: string;
  dailyYieldGenerated: string;
  dailyYieldClaimed: string;
  dailyWithdrawals: string;
  membersCount: number;
  currentCycle: string;
}

// =============================================================================
// QUERY FUNCTIONS
// =============================================================================

/**
 * Get user's overall stats across all groups
 */
export async function getUserStats(userAddress: string): Promise<UserStats | null> {
  const query = gql`
    query GetUserStats($id: ID!) {
      user(id: $id) {
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
  `;

  const data = await client.request<{ user: UserStats | null }>(query, {
    id: userAddress.toLowerCase(),
  });

  return data.user;
}

/**
 * Get user's yield per group (all group memberships)
 */
export async function getUserGroupPositions(userAddress: string): Promise<MemberPosition[]> {
  const query = gql`
    query GetUserGroups($userAddress: String!) {
      members(
        where: { user: $userAddress }
        orderBy: totalYieldEarned
        orderDirection: desc
      ) {
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
      }
    }
  `;

  const data = await client.request<{ members: MemberPosition[] }>(query, {
    userAddress: userAddress.toLowerCase(),
  });

  return data.members;
}

/**
 * Get user's daily snapshots for yield chart
 */
export async function getUserYieldChart(
  userAddress: string,
  days: number = 30
): Promise<DailySnapshot[]> {
  const startTime = Math.floor(Date.now() / 1000) - days * 86400;

  const query = gql`
    query GetUserYieldChart($userAddress: String!, $startTime: BigInt!) {
      userDailySnapshots(
        where: { user: $userAddress, dayTimestamp_gte: $startTime }
        orderBy: dayTimestamp
        orderDirection: asc
        first: 100
      ) {
        dayTimestamp
        totalYieldEarned
        totalYieldClaimed
        activeCapital
        pendingYield
        dailyYieldEarned
        dailyYieldClaimed
        dailyContributions
      }
    }
  `;

  const data = await client.request<{ userDailySnapshots: DailySnapshot[] }>(query, {
    userAddress: userAddress.toLowerCase(),
    startTime: startTime.toString(),
  });

  return data.userDailySnapshots;
}

/**
 * Get group details
 */
export async function getGroupDetails(groupAddress: string): Promise<GroupDetails | null> {
  const query = gql`
    query GetGroupDetails($id: ID!) {
      group(id: $id) {
        id
        address
        admin
        asset
        vault
        contributionAmount
        cycleDuration
        totalCycles
        groupStarted
        groupEnded
        paused
        startTime
        endTime
        currentCycle
        totalCapitalInGroup
        totalContributions
        totalYieldGenerated
        totalYieldDistributed
        totalYieldClaimed
        totalProtocolFees
        membersCount
        activeMembers
        createdAt
        updatedAt
      }
    }
  `;

  const data = await client.request<{ group: GroupDetails | null }>(query, {
    id: groupAddress.toLowerCase(),
  });

  return data.group;
}

/**
 * Get group members with their yields
 */
export async function getGroupMembers(groupAddress: string): Promise<MemberPosition[]> {
  const query = gql`
    query GetGroupMembers($groupAddress: String!) {
      members(
        where: { group: $groupAddress }
        orderBy: capitalInGroup
        orderDirection: desc
        first: 100
      ) {
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
        user {
          id
          address
        }
      }
    }
  `;

  const data = await client.request<{ members: any[] }>(query, {
    groupAddress: groupAddress.toLowerCase(),
  });

  return data.members;
}

/**
 * Get group daily snapshots for chart
 */
export async function getGroupYieldChart(
  groupAddress: string,
  days: number = 30
): Promise<GroupDailySnapshot[]> {
  const startTime = Math.floor(Date.now() / 1000) - days * 86400;

  const query = gql`
    query GetGroupYieldChart($groupAddress: String!, $startTime: BigInt!) {
      groupDailySnapshots(
        where: { group: $groupAddress, dayTimestamp_gte: $startTime }
        orderBy: dayTimestamp
        orderDirection: asc
        first: 100
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
  `;

  const data = await client.request<{ groupDailySnapshots: GroupDailySnapshot[] }>(query, {
    groupAddress: groupAddress.toLowerCase(),
    startTime: startTime.toString(),
  });

  return data.groupDailySnapshots;
}

/**
 * Get specific member's position in a group
 */
export async function getMemberPosition(
  groupAddress: string,
  userAddress: string
): Promise<MemberPosition | null> {
  const memberId = `${groupAddress.toLowerCase()}_${userAddress.toLowerCase()}`;

  const query = gql`
    query GetMemberPosition($id: ID!) {
      member(id: $id) {
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
      }
    }
  `;

  const data = await client.request<{ member: MemberPosition | null }>(query, {
    id: memberId,
  });

  return data.member;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

const USDC_DECIMALS = 6;

/**
 * Convert wei amount to human readable (USDC = 6 decimals)
 */
export function formatAmount(weiAmount: string, decimals: number = USDC_DECIMALS): number {
  return Number(weiAmount) / Math.pow(10, decimals);
}

/**
 * Convert unix timestamp to Date
 */
export function formatTimestamp(unixSeconds: string): Date {
  return new Date(Number(unixSeconds) * 1000);
}

/**
 * Format for display with currency
 */
export function formatCurrency(weiAmount: string, decimals: number = USDC_DECIMALS): string {
  const amount = formatAmount(weiAmount, decimals);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
```

---

## Step 3: Update API Routes

### Example: User Dashboard Route

```typescript
// routes/user.routes.ts
import { Router } from 'express';
import * as SubgraphService from '../services/subgraph.service';

const router = Router();

/**
 * GET /api/user/:address/dashboard
 * Returns user's overall yield stats
 */
router.get('/:address/dashboard', async (req, res) => {
  try {
    const { address } = req.params;
    
    const stats = await SubgraphService.getUserStats(address);
    
    if (!stats) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Format for frontend
    res.json({
      address: stats.address,
      totalContributed: SubgraphService.formatAmount(stats.totalContributed),
      totalYieldEarned: SubgraphService.formatAmount(stats.totalYieldEarned),
      totalYieldClaimed: SubgraphService.formatAmount(stats.totalYieldClaimed),
      pendingYield: SubgraphService.formatAmount(stats.pendingYield),
      activeCapital: SubgraphService.formatAmount(stats.activeCapital),
      activeGroupsCount: stats.activeGroupsCount,
      totalGroupsJoined: stats.totalGroupsJoined,
      firstSeenAt: SubgraphService.formatTimestamp(stats.firstSeenAt),
      lastActivityAt: SubgraphService.formatTimestamp(stats.lastActivityAt),
    });
  } catch (error) {
    console.error('Error fetching user dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

/**
 * GET /api/user/:address/groups
 * Returns user's yield per group breakdown
 */
router.get('/:address/groups', async (req, res) => {
  try {
    const { address } = req.params;
    
    const positions = await SubgraphService.getUserGroupPositions(address);

    res.json(positions.map(pos => ({
      groupId: pos.group.id,
      groupAddress: pos.group.address,
      // User's position in this group
      capitalInGroup: SubgraphService.formatAmount(pos.capitalInGroup),
      totalContributed: SubgraphService.formatAmount(pos.totalContributedAmount),
      totalYieldEarned: SubgraphService.formatAmount(pos.totalYieldEarned),
      totalYieldClaimed: SubgraphService.formatAmount(pos.totalYieldClaimed),
      pendingYield: SubgraphService.formatAmount(pos.pendingYield),
      contributionsCount: pos.contributionsCount,
      isActive: pos.isActive,
      hasWithdrawn: pos.hasWithdrawn,
      // Group info
      group: {
        contributionAmount: SubgraphService.formatAmount(pos.group.contributionAmount),
        currentCycle: Number(pos.group.currentCycle),
        totalCycles: Number(pos.group.totalCycles),
        groupEnded: pos.group.groupEnded,
        totalYieldGenerated: SubgraphService.formatAmount(pos.group.totalYieldGenerated),
        membersCount: pos.group.membersCount,
      },
      joinedAt: SubgraphService.formatTimestamp(pos.joinedAt),
    })));
  } catch (error) {
    console.error('Error fetching user groups:', error);
    res.status(500).json({ error: 'Failed to fetch user groups' });
  }
});

/**
 * GET /api/user/:address/yield-chart
 * Returns daily yield data for charts
 */
router.get('/:address/yield-chart', async (req, res) => {
  try {
    const { address } = req.params;
    const days = parseInt(req.query.days as string) || 30;
    
    const snapshots = await SubgraphService.getUserYieldChart(address, days);

    res.json(snapshots.map(snap => ({
      date: SubgraphService.formatTimestamp(snap.dayTimestamp).toISOString().split('T')[0],
      timestamp: Number(snap.dayTimestamp),
      // Cumulative values
      totalYieldEarned: SubgraphService.formatAmount(snap.totalYieldEarned),
      totalYieldClaimed: SubgraphService.formatAmount(snap.totalYieldClaimed),
      activeCapital: SubgraphService.formatAmount(snap.activeCapital),
      pendingYield: SubgraphService.formatAmount(snap.pendingYield),
      // Daily values
      dailyYieldEarned: SubgraphService.formatAmount(snap.dailyYieldEarned),
      dailyYieldClaimed: SubgraphService.formatAmount(snap.dailyYieldClaimed),
      dailyContributions: SubgraphService.formatAmount(snap.dailyContributions),
    })));
  } catch (error) {
    console.error('Error fetching yield chart:', error);
    res.status(500).json({ error: 'Failed to fetch yield chart data' });
  }
});

export default router;
```

### Example: Group Routes

```typescript
// routes/group.routes.ts
import { Router } from 'express';
import * as SubgraphService from '../services/subgraph.service';

const router = Router();

/**
 * GET /api/group/:address
 * Returns group details with yield stats
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    const group = await SubgraphService.getGroupDetails(address);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({
      id: group.id,
      address: group.address,
      admin: group.admin,
      asset: group.asset,
      vault: group.vault,
      // Configuration
      contributionAmount: SubgraphService.formatAmount(group.contributionAmount),
      cycleDuration: Number(group.cycleDuration),
      totalCycles: Number(group.totalCycles),
      // State
      groupStarted: group.groupStarted,
      groupEnded: group.groupEnded,
      paused: group.paused,
      currentCycle: Number(group.currentCycle),
      startTime: group.startTime ? SubgraphService.formatTimestamp(group.startTime) : null,
      endTime: group.endTime ? SubgraphService.formatTimestamp(group.endTime) : null,
      // Financial stats
      totalCapitalInGroup: SubgraphService.formatAmount(group.totalCapitalInGroup),
      totalContributions: SubgraphService.formatAmount(group.totalContributions),
      totalYieldGenerated: SubgraphService.formatAmount(group.totalYieldGenerated),
      totalYieldDistributed: SubgraphService.formatAmount(group.totalYieldDistributed),
      totalYieldClaimed: SubgraphService.formatAmount(group.totalYieldClaimed),
      // Members
      membersCount: group.membersCount,
      activeMembers: group.activeMembers,
      // Timestamps
      createdAt: SubgraphService.formatTimestamp(group.createdAt),
      updatedAt: SubgraphService.formatTimestamp(group.updatedAt),
    });
  } catch (error) {
    console.error('Error fetching group:', error);
    res.status(500).json({ error: 'Failed to fetch group data' });
  }
});

/**
 * GET /api/group/:address/members
 * Returns all members with their individual yields
 */
router.get('/:address/members', async (req, res) => {
  try {
    const { address } = req.params;
    
    const members = await SubgraphService.getGroupMembers(address);

    res.json(members.map(member => ({
      userId: member.user?.id,
      userAddress: member.user?.address,
      capitalInGroup: SubgraphService.formatAmount(member.capitalInGroup),
      totalContributed: SubgraphService.formatAmount(member.totalContributedAmount),
      totalYieldEarned: SubgraphService.formatAmount(member.totalYieldEarned),
      totalYieldClaimed: SubgraphService.formatAmount(member.totalYieldClaimed),
      pendingYield: SubgraphService.formatAmount(member.pendingYield),
      contributionsCount: member.contributionsCount,
      isActive: member.isActive,
      hasWithdrawn: member.hasWithdrawn,
      joinedAt: SubgraphService.formatTimestamp(member.joinedAt),
    })));
  } catch (error) {
    console.error('Error fetching group members:', error);
    res.status(500).json({ error: 'Failed to fetch group members' });
  }
});

/**
 * GET /api/group/:address/yield-chart
 * Returns daily yield data for group chart
 */
router.get('/:address/yield-chart', async (req, res) => {
  try {
    const { address } = req.params;
    const days = parseInt(req.query.days as string) || 30;
    
    const snapshots = await SubgraphService.getGroupYieldChart(address, days);

    res.json(snapshots.map(snap => ({
      date: SubgraphService.formatTimestamp(snap.dayTimestamp).toISOString().split('T')[0],
      timestamp: Number(snap.dayTimestamp),
      // Cumulative
      totalCapital: SubgraphService.formatAmount(snap.totalCapital),
      totalYieldGenerated: SubgraphService.formatAmount(snap.totalYieldGenerated),
      totalYieldClaimed: SubgraphService.formatAmount(snap.totalYieldClaimed),
      // Daily
      dailyContributions: SubgraphService.formatAmount(snap.dailyContributions),
      dailyYieldGenerated: SubgraphService.formatAmount(snap.dailyYieldGenerated),
      dailyYieldClaimed: SubgraphService.formatAmount(snap.dailyYieldClaimed),
      dailyWithdrawals: SubgraphService.formatAmount(snap.dailyWithdrawals),
      membersCount: snap.membersCount,
      currentCycle: Number(snap.currentCycle),
    })));
  } catch (error) {
    console.error('Error fetching group yield chart:', error);
    res.status(500).json({ error: 'Failed to fetch group chart data' });
  }
});

/**
 * GET /api/group/:groupAddress/member/:userAddress
 * Returns specific user's position in the group
 */
router.get('/:groupAddress/member/:userAddress', async (req, res) => {
  try {
    const { groupAddress, userAddress } = req.params;
    
    const member = await SubgraphService.getMemberPosition(groupAddress, userAddress);
    
    if (!member) {
      return res.status(404).json({ error: 'Member not found in this group' });
    }

    res.json({
      capitalInGroup: SubgraphService.formatAmount(member.capitalInGroup),
      totalContributed: SubgraphService.formatAmount(member.totalContributedAmount),
      totalYieldEarned: SubgraphService.formatAmount(member.totalYieldEarned),
      totalYieldClaimed: SubgraphService.formatAmount(member.totalYieldClaimed),
      pendingYield: SubgraphService.formatAmount(member.pendingYield),
      contributionsCount: member.contributionsCount,
      isActive: member.isActive,
      hasWithdrawn: member.hasWithdrawn,
      inEndedGroup: member.inEndedGroup,
      joinedAt: SubgraphService.formatTimestamp(member.joinedAt),
      lastActivityAt: SubgraphService.formatTimestamp(member.lastActivityAt),
    });
  } catch (error) {
    console.error('Error fetching member position:', error);
    res.status(500).json({ error: 'Failed to fetch member data' });
  }
});

export default router;
```

---

## Step 4: Caching (Optional but Recommended)

```typescript
// services/cache.service.ts
import NodeCache from 'node-cache';

const cache = new NodeCache({
  stdTTL: 30, // 30 seconds default
  checkperiod: 60,
});

export function getCached<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function setCache<T>(key: string, value: T, ttl?: number): void {
  cache.set(key, value, ttl);
}

// Usage in subgraph service:
export async function getUserStatsWithCache(userAddress: string): Promise<UserStats | null> {
  const cacheKey = `user_stats_${userAddress.toLowerCase()}`;
  
  const cached = getCached<UserStats>(cacheKey);
  if (cached) return cached;
  
  const stats = await getUserStats(userAddress);
  if (stats) {
    setCache(cacheKey, stats, 30); // Cache for 30 seconds
  }
  
  return stats;
}
```

---

## Step 5: Error Handling

```typescript
// middleware/subgraph-error.middleware.ts

export class SubgraphError extends Error {
  constructor(
    message: string,
    public readonly query: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'SubgraphError';
  }
}

export function handleSubgraphError(error: any): never {
  if (error.response?.errors) {
    const messages = error.response.errors.map((e: any) => e.message).join(', ');
    throw new SubgraphError(`Subgraph query failed: ${messages}`, '', error);
  }
  throw new SubgraphError('Failed to query subgraph', '', error);
}
```

---

## Step 6: Health Check Endpoint

```typescript
// routes/health.routes.ts
router.get('/subgraph', async (req, res) => {
  try {
    const query = gql`
      {
        _meta {
          block { number timestamp }
          hasIndexingErrors
        }
      }
    `;
    
    const data = await client.request(query);
    
    res.json({
      status: 'healthy',
      block: data._meta.block.number,
      timestamp: data._meta.block.timestamp,
      hasIndexingErrors: data._meta.hasIndexingErrors,
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});
```

---

## Summary: API Endpoints

| Endpoint | Description | Replaces DB Query |
|----------|-------------|-------------------|
| `GET /api/user/:address/dashboard` | User overall stats | `SELECT * FROM user_yields WHERE user_id = ?` |
| `GET /api/user/:address/groups` | User's yield per group | `SELECT * FROM group_memberships WHERE user_id = ?` |
| `GET /api/user/:address/yield-chart` | Daily yield snapshots | `SELECT * FROM user_daily_stats WHERE user_id = ?` |
| `GET /api/group/:address` | Group details | `SELECT * FROM groups WHERE address = ?` |
| `GET /api/group/:address/members` | Group members with yields | `SELECT * FROM members WHERE group_id = ?` |
| `GET /api/group/:address/yield-chart` | Group daily snapshots | `SELECT * FROM group_daily_stats WHERE group_id = ?` |
| `GET /api/group/:groupAddress/member/:userAddress` | Specific member position | `SELECT * FROM members WHERE group_id = ? AND user_id = ?` |
