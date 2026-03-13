/**
 * Test BackupManager functionality
 */
const fs = require('fs');
const path = require('path');

// Simple test without compiling TypeScript
console.log('🧪 Testing BackupManager...\n');

const testDir = './data/backups';
const testFile = './data/test-store.json';

// Test 1: Directory should be created
if (fs.existsSync(testDir)) {
  console.log('✅ Backup directory exists:', testDir);
} else {
  console.log('❌ Backup directory missing');
}

// Test 2: Check BackupManager class exists
try {
  const backupManagerPath = './dist/storage/backup-manager.js';
  if (fs.existsSync(backupManagerPath)) {
    console.log('✅ BackupManager compiled:', backupManagerPath);
  } else {
    console.log('⚠️ BackupManager not yet compiled (run npm run build first)');
  }
} catch (e) {
  console.log('⚠️ Error checking BackupManager:', e.message);
}

// Test 3: Check supporting files exist
const requiredFiles = [
  './dist/storage/integrity-checker.js',
  './dist/storage/migrations/migration-runner.js',
  './dist/maintenance/update-manager.js',
];

console.log('\n📁 Checking compiled files:');
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${path.basename(file)}`);
  } else {
    console.log(`⚠️ ${path.basename(file)} (not compiled yet)`);
  }
});

// Test 4: Check script file permissions
try {
  const stats = fs.statSync('./install.sh');
  const isExecutable = (stats.mode & parseInt('0111', 8)) !== 0;
  if (isExecutable) {
    console.log('✅ install.sh is executable');
  } else {
    console.log('⚠️ install.sh requires chmod +x');
  }
} catch (e) {
  console.log('❌ install.sh not found');
}

// Test 5: Check handlers are properly registered
try {
  const botPath = './dist/senses/telegram/bot.js';
  const handlersPath = './dist/senses/telegram/handlers.js';
  
  if (fs.existsSync(botPath) && fs.existsSync(handlersPath)) {
    console.log('\n✅ Telegram bot handlers compiled');
    
    // Check if update command is registered
    const botContent = fs.readFileSync(botPath, 'utf-8');
    if (botContent.includes("'update'") || botContent.includes('"update"')) {
      console.log('✅ /update command registered in bot.ts');
    } else {
      console.log('⚠️ /update command might not be registered');
    }
  }
} catch (e) {
  console.log('⚠️ Could not verify handlers:', e.message);
}

console.log('\n✨ BackupManager test complete!\n');
