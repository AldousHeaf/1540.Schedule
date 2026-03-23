const fs = require('fs').promises;
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.js');
const REQUIREMENTS_PATH = path.join(ROOT, 'requirements.js');
const DOCS_SCHEDULE_PATH = path.join(ROOT, 'docs', 'schedule.json');

function runBuild() {
  const res = spawnSync('node', ['build-static.js'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    const out = [res.stdout || '', res.stderr || ''].join('\n');
    throw new Error(`build failed\n${out}`);
  }
}

function countRoleInBlock(day, roleName, blockIndex) {
  return (day.people || []).reduce((n, p) => {
    return n + (((p.schedule || [])[blockIndex] === roleName) ? 1 : 0);
  }, 0);
}

function makeConfigFixture(csvFileName) {
  return `const path = require('path');

module.exports = {
  useCachedSchedule: false,
  csvPath: path.join(__dirname, ${JSON.stringify(csvFileName)}),
  competitionStartTime: '08:00',
  competitionEndTime: '10:00',
  blockDurationMinutes: 60,
  numberOfDays: 1,
  showOnlyDay: 0,
  optimizationIterations: 1,
  nexusEventKey: null,
  nexusApiKey: null,
  daySchedule: [
    { label: 'TestDay', start: '08:00', end: '10:00', lunch: null },
  ],
  columnMap: {
    email: 'Email Address',
    wantsPits: 'Are you interested in being on pit crew?',
    otherRoles: 'What other roles are you interested in?',
    whichDays: 'Which days will you be attending?',
    nametag: 'Nametag',
    anythingElse: 'Anything else about your availability or preferences?',
    pitCrewUnderstand: 'Do you understand that pit crew will require working with a manager ahead of time to prepare for the role?',
    pitWorkType: 'What type of pit work are you interested in?',
    timesOfDay: 'What times of day are you interested in?',
  },
};
`;
}

const REQUIREMENTS_FIXTURE = `module.exports = {
  Drive: { min: 1, max: 1 },
  'Pits': { min: 0, max: 3 },
  'Pit Lead': { min: 0, max: 2 },
  Journalist: { min: 0, max: 1 },
  Strategy: { min: 0, max: 3 },
  Media: { min: 0, max: 1 },
};
`;

async function main() {
  const originalConfig = await fs.readFile(CONFIG_PATH, 'utf8');
  const originalRequirements = await fs.readFile(REQUIREMENTS_PATH, 'utf8');

  // pick whichever csv is present in repo
  const primaryCsv = '2026 Wilsonville Roles Form (Responses) - Form Responses 1 (1).csv';
  const fallbackCsv = 'responses.csv';
  let csvFileName = primaryCsv;
  try {
    await fs.access(path.join(ROOT, primaryCsv));
  } catch (_) {
    csvFileName = fallbackCsv;
  }

  try {
    await fs.writeFile(REQUIREMENTS_PATH, REQUIREMENTS_FIXTURE);
    await fs.writeFile(CONFIG_PATH, makeConfigFixture(csvFileName));

    runBuild();

    const docsScheduleRaw = await fs.readFile(DOCS_SCHEDULE_PATH, 'utf8');
    const docsSchedule = JSON.parse(docsScheduleRaw);
    const day = (docsSchedule.days || [])[0];

    assert(day, 'expected one day in docs/schedule.json');
    assert.strictEqual(day.label, 'TestDay', 'config change should update day label');
    assert.deepStrictEqual(
      day.timeBlocks,
      ['08:00-09:00', '09:00-10:00'],
      'config change should update generated time blocks'
    );
    assert.strictEqual(
      docsSchedule.blockDurationMinutes,
      60,
      'config change should update block duration in docs output'
    );

    // requirements fixture sets Drive max to 1, scheduler should respect that per block
    for (let i = 0; i < day.timeBlocks.length; i++) {
      const driveCount = countRoleInBlock(day, 'Drive', i);
      assert(
        driveCount <= 1,
        `requirements change should cap Drive at 1 per block (block ${i}, got ${driveCount})`
      );
    }

    console.log('OK: config + requirements smoke test passed');
  } finally {
    await fs.writeFile(CONFIG_PATH, originalConfig);
    await fs.writeFile(REQUIREMENTS_PATH, originalRequirements);

    // rebuild once so repo output matches normal config again
    runBuild();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
