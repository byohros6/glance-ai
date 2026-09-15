import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Complete test catalog categorized by Tier per TEST_INFRA.md
const testCatalog = [
  // Tier 1: Feature Coverage
  {
    tier: 'Tier 1',
    category: 'Feature Coverage',
    name: 'Store & Settings Defaults',
    file: 'unit/store_defaults.test.js'
  },
  {
    tier: 'Tier 1',
    category: 'Feature Coverage',
    name: 'Stealth Window Flags & Native OS Integration',
    file: 'window/stealth_flags.test.js'
  },
  {
    tier: 'Tier 1',
    category: 'Feature Coverage',
    name: 'Global Shortcuts Registration',
    file: 'window/shortcuts_registration.test.js'
  },
  {
    tier: 'Tier 1',
    category: 'Feature Coverage',
    name: 'Chrome UA Spoofing & Webdriver Masking',
    file: 'injection/stealth_masking.test.js'
  },
  {
    tier: 'Tier 1',
    category: 'Feature Coverage',
    name: 'Window Bounds Persistence',
    file: 'window/bounds_persistence.test.js'
  },
  {
    tier: 'Tier 1',
    category: 'Feature Coverage',
    name: 'Multi-Provider Detection, Injection & Fallback',
    file: 'injection/multi_provider.test.js'
  },

  // Tier 2: Boundary & Corner Cases
  {
    tier: 'Tier 2',
    category: 'Boundary & Corner Cases',
    name: 'Corrupt Store Recovery',
    file: 'unit/store_corrupt_recovery.test.js'
  },
  {
    tier: 'Tier 2',
    category: 'Boundary & Corner Cases',
    name: 'Opacity Range Clamping [0.15, 1.0]',
    file: 'unit/opacity_clamping.test.js'
  },
  {
    tier: 'Tier 2',
    category: 'Boundary & Corner Cases',
    name: 'High-DPI scaleFactor Math',
    file: 'unit/dpi_scaling.test.js'
  },
  {
    tier: 'Tier 2',
    category: 'Boundary & Corner Cases',
    name: 'Off-Screen Coordinates Clamping',
    file: 'unit/coordinates_boundary.test.js'
  },
  {
    tier: 'Tier 2',
    category: 'Boundary & Corner Cases',
    name: 'WebRTC Failure & PowerShell Fallback',
    file: 'window/webrtc_fallback.test.js'
  },
  {
    tier: 'Tier 2',
    category: 'Boundary & Corner Cases',
    name: 'Single Instance Lock Enforcement',
    file: 'window/single_instance.test.js'
  },
  {
    tier: 'Tier 2',
    category: 'Boundary & Corner Cases',
    name: 'Double Ctrl+S Debounce & Concurrency',
    file: 'unit/debounce_concurrency.test.js'
  },
  {
    tier: 'Tier 2',
    category: 'Boundary & Corner Cases',
    name: 'Direct Input & Synthetic Paste Fallback',
    file: 'injection/paste_fallback.test.js'
  },
  {
    tier: 'Tier 2',
    category: 'Boundary & Corner Cases',
    name: 'Message Submit Engine & Fallback',
    file: 'injection/submit_engine.test.js'
  },

  // Tier 3: Cross-Feature Interactions
  {
    tier: 'Tier 3',
    category: 'Cross-Feature Interactions',
    name: 'Click-Through ON + Toolbar Hover',
    file: 'injection/click_through_hover.test.js'
  },
  {
    tier: 'Tier 3',
    category: 'Cross-Feature Interactions',
    name: 'Non-Activating Focus Mode Interaction',
    file: 'window/non_activating_focus.test.js'
  },
  {
    tier: 'Tier 3',
    category: 'Cross-Feature Interactions',
    name: 'Pre-Roll Hide Delay + Boss Key Interaction',
    file: 'window/preroll_bosskey.test.js'
  },
  {
    tier: 'Tier 3',
    category: 'Cross-Feature Interactions',
    name: 'OAuth Popup & External URL Routing',
    file: 'window/oauth_popup.test.js'
  },
  {
    tier: 'Tier 3',
    category: 'Cross-Feature Interactions',
    name: 'DOM Trigger Sequence & Click Interceptor',
    file: 'injection/trigger_sequence.test.js'
  },

  // Tier 4: Real-World Scenarios
  {
    tier: 'Tier 4',
    category: 'Real-World Scenarios',
    name: 'Full Real-World Simulated Workflow Flow',
    file: 'e2e/simulated_flow.test.js'
  }
];

function runTestFile(testItem) {
  return new Promise((resolve) => {
    const testPath = path.join(__dirname, testItem.file);
    const startTime = Date.now();

    const child = spawn(electronPath, [testPath], {
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('exit', (code) => {
      const durationMs = Date.now() - startTime;
      resolve({
        ...testItem,
        code,
        passed: (code === 0 || (stdout.includes('0 failed') && !stdout.includes('FAIL'))) && !stdout.includes('FAIL:'),
        durationMs,
        stdout,
        stderr
      });
    });

    child.on('error', (err) => {
      const durationMs = Date.now() - startTime;
      resolve({
        ...testItem,
        code: 1,
        passed: false,
        durationMs,
        stdout,
        stderr: err.message
      });
    });
  });
}

async function main() {
  console.log('\n===============================================================');
  console.log('       UndecGPT Automated Test Suite (Tiers 1 - 4)             ');
  console.log('===============================================================\n');

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;
  const overallStart = Date.now();

  for (let i = 0; i < testCatalog.length; i++) {
    const item = testCatalog[i];
    process.stdout.write(`[${i + 1}/${testCatalog.length}] [${item.tier}] ${item.name} ... `);

    const res = await runTestFile(item);
    results.push(res);

    if (res.passed) {
      totalPassed++;
      console.log(`PASS (${(res.durationMs / 1000).toFixed(2)}s)`);
    } else {
      totalFailed++;
      console.log(`FAIL (${(res.durationMs / 1000).toFixed(2)}s)`);
      if (res.stdout) console.log(res.stdout);
      if (res.stderr) console.error(res.stderr);
    }
  }

  const overallDuration = ((Date.now() - overallStart) / 1000).toFixed(2);

  // Summary Table
  console.log('\n===============================================================');
  console.log('                     TEST EXECUTION SUMMARY                    ');
  console.log('===============================================================');
  console.log('| Tier   | Test Suite                                | Status | Time   |');
  console.log('|--------|-------------------------------------------|:------:|-------:|');

  for (const r of results) {
    const tierPadded = r.tier.padEnd(6, ' ');
    const namePadded = r.name.padEnd(41, ' ');
    const status = r.passed ? ' PASS ' : ' FAIL ';
    const timePadded = `${(r.durationMs / 1000).toFixed(2)}s`.padStart(6, ' ');
    console.log(`| ${tierPadded} | ${namePadded} | ${status} | ${timePadded} |`);
  }

  console.log('===============================================================');
  console.log(`Total Suites : ${testCatalog.length}`);
  console.log(`Passed       : ${totalPassed}`);
  console.log(`Failed       : ${totalFailed}`);
  console.log(`Duration     : ${overallDuration}s`);
  console.log('===============================================================\n');

  if (totalFailed > 0) {
    console.error(`💥 Test run failed with ${totalFailed} failing suite(s).`);
    process.exit(1);
  } else {
    console.log(`✨ All ${totalPassed} test suites across Tiers 1-4 passed cleanly!`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
