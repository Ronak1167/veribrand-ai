#!/usr/bin/env node
// VeriBrand AI — Organization Onboarding & Member Management Test Suite
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  createOrganization,
  updateOrganization,
  getOrganizationMembers,
  addOrganizationMember,
  updateOrganizationMemberRole,
  removeOrganizationMember,
  createOrganizationInvitation,
  getOrganizationInvitationByToken,
  acceptOrganizationInvitation,
  revokeOrganizationInvitation,
  createUser,
} from '../src/lib/db/database.ts';

console.log('='.repeat(70));
console.log('  VERIBRAND AI — ORGANIZATION & MEMBER MANAGEMENT TEST SUITE');
console.log('='.repeat(70));

// Create mock users for testing
const ownerUser = createUser({
  email: `owner-${crypto.randomUUID().slice(0, 6)}@acme.com`,
  name: 'Alice Owner',
  role: 'admin',
  password: 'SecurePassword123!',
});
const memberUser = createUser({
  email: `member-${crypto.randomUUID().slice(0, 6)}@acme.com`,
  name: 'Bob Member',
  role: 'creator',
  password: 'SecurePassword123!',
});
const invitedUser = createUser({
  email: `invited-${crypto.randomUUID().slice(0, 6)}@acme.com`,
  name: 'Charlie Invite',
  role: 'reviewer',
  password: 'SecurePassword123!',
});

// TEST 1: Organization Creation & Owner Assignment
console.log('\n[TEST 1] Organization Creation & Owner Membership Assignment...');
const testOrg = createOrganization({
  name: 'Acme Robotics',
  slug: `acme-robotics-${crypto.randomUUID().slice(0, 6)}`,
  userId: ownerUser.id,
  brandName: 'Acme Robotics Enterprise',
  settings: {
    brandColors: ['#4F46E5', '#06B6D4'],
    headingFont: 'Plus Jakarta Sans',
  },
});
assert.ok(testOrg.id.startsWith('ORG-'));
assert.equal(testOrg.name, 'Acme Robotics');
console.log(`  ✓ Organization created: ${testOrg.name} (${testOrg.id})`);

const initialMembers = getOrganizationMembers(testOrg.id);
assert.equal(initialMembers.length, 1);
assert.equal(initialMembers[0].userId, ownerUser.id);
assert.equal(initialMembers[0].role, 'owner');
console.log(`  ✓ Creator ${ownerUser.name} automatically assigned "owner" role.`);

// TEST 2: Add Team Member with Role
console.log('\n[TEST 2] Adding Team Member with "creator" Role...');
const addRes = addOrganizationMember({
  orgId: testOrg.id,
  userId: memberUser.id,
  role: 'creator',
  actorId: ownerUser.id,
});
assert.ok(addRes);
const updatedMembers = getOrganizationMembers(testOrg.id);
assert.equal(updatedMembers.length, 2);
const addedMember = updatedMembers.find((m) => m.userId === memberUser.id);
assert.equal(addedMember?.role, 'creator');
console.log(`  ✓ Successfully added member ${memberUser.name} with "creator" role.`);

// TEST 3: Role Update
console.log('\n[TEST 3] Updating Member Role (creator -> reviewer)...');
const roleUpdateRes = updateOrganizationMemberRole({
  orgId: testOrg.id,
  targetUserId: memberUser.id,
  role: 'reviewer',
  actorId: ownerUser.id,
});
assert.ok(roleUpdateRes);
const afterRoleUpdate = getOrganizationMembers(testOrg.id);
assert.equal(afterRoleUpdate.find((m) => m.userId === memberUser.id)?.role, 'reviewer');
console.log(`  ✓ Member role promoted to "reviewer" successfully.`);

// TEST 4: Owner Escalation Protection (Sole Owner Demotion/Removal Prevention)
console.log('\n[TEST 4] Owner Escalation Protection (Sole Owner Defense)...');
assert.throws(
  () => {
    removeOrganizationMember({
      orgId: testOrg.id,
      targetUserId: ownerUser.id,
      actorId: ownerUser.id,
    });
  },
  /Cannot remove the only owner of the organization/,
  'Must prevent removing the sole owner'
);
console.log('  ✓ Protection confirmed: Sole owner cannot be removed from organization.');

// TEST 5: Invitation Lifecycle (Create -> Validate -> Accept)
console.log('\n[TEST 5] Invitation Lifecycle (Create -> Token Validation -> Accept)...');
const invite = createOrganizationInvitation({
  orgId: testOrg.id,
  email: invitedUser.email,
  role: 'reviewer',
  invitedBy: ownerUser.id,
});
assert.ok(invite.token);

const validatedInvite = getOrganizationInvitationByToken(invite.token);
assert.ok(validatedInvite);
assert.equal(validatedInvite.email, invitedUser.email);
assert.equal(validatedInvite.role, 'reviewer');

const acceptRes = acceptOrganizationInvitation({
  token: invite.token,
  userId: invitedUser.id,
  email: invitedUser.email,
});
assert.ok(acceptRes);

const membersAfterAccept = getOrganizationMembers(testOrg.id);
assert.equal(membersAfterAccept.length, 3);
assert.ok(membersAfterAccept.some((m) => m.userId === invitedUser.id && m.role === 'reviewer'));
console.log(`  ✓ Invitation for ${invitedUser.email} validated and accepted into organization.`);

// TEST 6: Invitation Revocation
console.log('\n[TEST 6] Invitation Revocation...');
const revokeInvite = createOrganizationInvitation({
  orgId: testOrg.id,
  email: 'revoked@acme.com',
  role: 'readonly',
  invitedBy: ownerUser.id,
});
const revoked = revokeOrganizationInvitation({
  token: revokeInvite.token,
  actorId: ownerUser.id,
});
assert.ok(revoked);

const checkRevoked = getOrganizationInvitationByToken(revokeInvite.token);
assert.equal(checkRevoked, null, 'Revoked invitation must not be retrievable for acceptance');
console.log('  ✓ Invitation revoked cleanly; cannot be claimed.');

// TEST 7: Brand Profile Update
console.log('\n[TEST 7] Updating Organization Brand Profile & Settings...');
const updatedOrg = updateOrganization({
  id: testOrg.id,
  name: 'Acme Robotics Global',
  brandName: 'Acme Robotics NextGen',
  logoUrl: 'https://cdn.acme.com/logo-v2.svg',
  settings: {
    brandColors: ['#0066FF', '#10B981'],
    headingFont: 'Geist',
  },
  actorId: ownerUser.id,
});
assert.equal(updatedOrg?.name, 'Acme Robotics Global');
assert.equal(updatedOrg?.brandName, 'Acme Robotics NextGen');
assert.equal(updatedOrg?.logoUrl, 'https://cdn.acme.com/logo-v2.svg');
assert.equal(updatedOrg?.settings?.headingFont, 'Geist');
console.log(`  ✓ Brand profile updated: ${updatedOrg?.name} (Font: ${updatedOrg?.settings?.headingFont})`);

console.log('\n' + '='.repeat(70));
console.log('  ALL ORGANIZATION & MEMBER MANAGEMENT TESTS PASSED CLEANLY (7/7)');
console.log('='.repeat(70));
