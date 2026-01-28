/**
 * Database Schema Verification Script
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  console.log('=== VERIFYING DATABASE SCHEMA ===\n');

  try {
    const user = await prisma.user.findFirst({
      select: {
        username: true,
        lastLoginAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });

    console.log('✓ New fields exist and are queryable\n');
    
    if (user) {
      console.log('Sample Data:');
      console.log(`  User: ${user.username}`);
      console.log(`  lastLoginAt: ${user.lastLoginAt || 'null'}`);
      console.log(`  failedLoginAttempts: ${user.failedLoginAttempts}`);
      console.log(`  lockedUntil: ${user.lockedUntil || 'null'}`);
    }

    console.log('\n✅ SCHEMA UPDATE SUCCESSFUL!');
    console.log('\nReady for Phase 3.3: JWT Utilities\n');

  } catch (error: any) {
    console.error('\n❌ VERIFICATION FAILED');
    if (error.message?.includes('Unknown')) {
      console.error('Fields not found - migration may not be applied');
    } else {
      console.error(error.message);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verify();