import assert from 'node:assert';

export { assert };

class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.suiteName = '';
  }

  suite(name) {
    this.suiteName = name;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\n=== Running Suite: ${this.suiteName || 'Unnamed Suite'} ===`);
    const startTime = Date.now();

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        this.passed++;
        console.log(`  ✔ PASS: ${name}`);
      } catch (err) {
        this.failed++;
        console.error(`  ✖ FAIL: ${name}`);
        console.error(`    ${err.message}`);
        if (err.stack) {
          const stackLines = err.stack.split('\n').slice(1, 4).join('\n');
          console.error(`    ${stackLines}`);
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`--- Result: ${this.passed} passed, ${this.failed} failed (${duration}s) ---\n`);

    if (this.failed > 0) {
      return false;
    }
    return true;
  }
}

export function createTestSuite(name) {
  const runner = new TestRunner();
  runner.suite(name);
  return runner;
}
