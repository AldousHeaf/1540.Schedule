const path = require('path');

module.exports = {
  // toggles / globals
  useCachedSchedule: false,
  csvPath: path.join(__dirname, '2026 Wilsonville Roles Form (Responses) - Form Responses 1 (1).csv'),

  compStart: '08:00',
  compEnd: '20:00',
  blkMins: 30,
  nDays: 2,

  // 0 = Sat, 1 = Sun
  showOnlyDay: 0,
  optIters: 2000,

  // nexus opts (optional)
  // old local key var was here
  nexusEventKey: null,
  nexusApiKey: null,

  daySchedule: [
    { label: 'Saturday', start: '08:00', end: '19:30', lunch: ['13:00', '14:00'] }, // sat
    { label: 'Sunday', start: '08:00', end: '16:00', lunch: ['11:30', '12:30'], scoutEnd: '12:30' }, // sun
  ],

  // form header map
  colMap: {
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

  /* keep these alias keys for compat
     scheduler still accepts old key names */
  competitionStartTime: '08:00',
  competitionEndTime: '20:00',
  blockDurationMinutes: 30,
  numberOfDays: 2,
  optimizationIterations: 2000,
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
