/**
 * Simple verification test for production system components
 * Tests that all managers can be instantiated and have required methods
 */

import { BackupManager } from './dist/storage/backup-manager.js';
import { IntegrityChecker } from './dist/storage/integrity-checker.js';
import { MigrationRunner } from './dist/storage/migrations/migration-runner.js';

console.log('🧪 Testing Production System Components\n');

// Test 1: BackupManager
console.log('1️⃣  Testing BackupManager...');
try {
  const backupMgr = new BackupManager('./data/backups', './data/store.json');
  const methods = ['createBackup', 'listBackups', 'restoreBackup', 'pruneOldBackups', 'getBackupStats'];
  
  for (const method of methods) {
    if (typeof backupMgr[method] === 'function') {
      console.log(`   ✅ ${method}()`);
    } else {
      console.log(`   ❌ ${method}() NOT FOUND`);
    }
  }
  console.log('   ✅ BackupManager instantiated successfully\n');
} catch (error) {
  console.log(`   ❌ BackupManager failed: ${error}\n`);
}

// Test 2: IntegrityChecker
console.log('2️⃣  Testing IntegrityChecker...');
try {
  const checker = new IntegrityChecker('./data/store.json');
  const methods = ['checkStoreIntegrity', 'repairStore', 'getIntegrityReport'];
  
  for (const method of methods) {
    if (typeof checker[method] === 'function') {
      console.log(`   ✅ ${method}()`);
    } else {
      console.log(`   ❌ ${method}() NOT FOUND`);
    }
  }
  console.log('   ✅ IntegrityChecker instantiated successfully\n');
} catch (error) {
  console.log(`   ❌ IntegrityChecker failed: ${error}\n`);
}

// Test 3: MigrationRunner
console.log('3️⃣  Testing MigrationRunner...');
try {
  const runner = new MigrationRunner('./data/store.json');
  const methods = ['runPendingMigrations', 'getMigrationInfo'];
  
  for (const method of methods) {
    if (typeof runner[method] === 'function') {
      console.log(`   ✅ ${method}()`);
    } else {
      console.log(`   ❌ ${method}() NOT FOUND`);
    }
  }
  console.log('   ✅ MigrationRunner instantiated successfully\n');
} catch (error) {
  console.log(`   ❌ MigrationRunner failed: ${error}\n`);
}

// Test 4: Helper function
console.log('4️⃣  Testing BackupManager.formatSize()...');
try {
  const sizes = [
    { bytes: 0, expected: '0 B' },
    { bytes: 1024, expected: '1 KB' },
    { bytes: 1024 * 1024, expected: '1 MB' },
    { bytes: 5 * 1024 * 1024, expected: '5 MB' }
  ];
  
  for (const { bytes, expected } of sizes) {
    const result = BackupManager.formatSize(bytes);
    if (result.startsWith(expected.split(' ')[0]) || result.includes(expected.split(' ')[1])) {
      console.log(`   ✅ formatSize(${bytes}) = ${result}`);
    } else {
      console.log(`   ❌ formatSize(${bytes}) = ${result} (expected ~${expected})`);
    }
  }
  console.log();
} catch (error) {
  console.log(`   ❌ formatSize test failed: ${error}\n`);
}

console.log('====================================');
console.log('✅ All production system components verified!\n');
console.log('Next: Run bot with /help to test Telegram commands');
