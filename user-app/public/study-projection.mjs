// draft by Codex (D1-A), imported by PC Claude Code
// resume recommends an entered location; V24 END/receipt/pending/revision checks are excluded.

const SUBJECTS = ['K', 'M', 'E', 'H', 'S', 'C'];
const STATES = ['PROPOSED', 'PREPARED', 'STARTED', 'ATTEMPTED', 'COMPLETED', 'VERIFIED'];
const DAY_MS = 86400000;

function requireValue(condition, field) {
  if (!condition) throw new TypeError(`Invalid ${field}`);
}

function object(value, field) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), field);
}

function string(value, field) {
  requireValue(typeof value === 'string', field);
  return value;
}

function dateDay(value, field) {
  requireValue(typeof value === 'string' && value.length === 10
    && /^\d{4}-\d{2}-\d{2}$/.test(value), field);
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  requireValue(month >= 1 && month <= 12 && day >= 1 && day <= lengths[month - 1], field);
  // A 400-year shift avoids the special 1900 offset applied to UTC years 00..99.
  const shifted = year < 100;
  return Date.UTC(shifted ? year + 400 : year, month - 1, day) / DAY_MS
    - (shifted ? 146097 : 0);
}

function optionalDate(value, field) {
  if (value === undefined || value === null) return null;
  dateDay(value, field);
  return value;
}

function completionTime(value) {
  if (value === null) return null;
  requireValue(typeof value === 'string' && value.length === 24
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value), 'review.doneAt');
  dateDay(value.slice(0, 10), 'review.doneAt date');
  requireValue(Number(value.slice(11, 13)) <= 23
    && Number(value.slice(14, 16)) <= 59
    && Number(value.slice(17, 19)) <= 59, 'review.doneAt time');
  return value;
}

function subject(value) {
  requireValue(SUBJECTS.includes(value), 'subject');
  return value;
}

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const dueOrder = (a, b) => compare(a.due, b.due)
  || compare(a.date, b.date) || compare(a.mistakeId, b.mistakeId);

function removeDuplicates(records, kind, duplicates) {
  const counts = new Map();
  for (const row of records) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (count > 1) duplicates.push({ kind, id });
  }
  return records.filter(row => counts.get(row.id) === 1);
}

export function projectStudy(cards, baseDate) {
  requireValue(Array.isArray(cards), 'cards');
  const baseDay = dateDay(baseDate, 'baseDate');
  const sessions = [], mistakes = [], reviews = [];

  // Read only projection fields. Whole-item schema validation belongs to study-model.
  for (const card of cards) {
    object(card, 'card');
    const date = card.date;
    const dayNumber = dateDay(date, 'card.date');
    const cardSessions = card.sessions, cardMistakes = card.mistakes, cardReviews = card.reviews;
    requireValue(Array.isArray(cardSessions), 'card.sessions');
    requireValue(Array.isArray(cardMistakes), 'card.mistakes');
    requireValue(Array.isArray(cardReviews), 'card.reviews');
    for (const row of cardSessions) {
      object(row, 'session');
      const id = string(row.id, 'session.id');
      const code = subject(row.subject), state = row.state, confirmedMin = row.confirmedMin;
      requireValue(STATES.includes(state), 'session.state');
      requireValue(Number.isInteger(confirmedMin) && confirmedMin >= 0 && confirmedMin <= 1440,
        'session.confirmedMin');
      const restartLocator = string(row.restartLocator, 'session.restartLocator');
      sessions.push({ id, subject: code, state, confirmedMin, restartLocator, date, dayNumber });
    }
    for (const row of cardMistakes) {
      object(row, 'mistake');
      mistakes.push({
        id: string(row.id, 'mistake.id'), subject: subject(row.subject),
        itemRef: string(row.itemRef, 'mistake.itemRef'),
        reviewDue: optionalDate(row.reviewDue, 'mistake.reviewDue'), date,
      });
    }
    for (const row of cardReviews) {
      object(row, 'review');
      reviews.push({
        id: string(row.id, 'review.id'), mistakeId: string(row.mistakeId, 'review.mistakeId'),
        doneAt: completionTime(row.doneAt), nextDue: optionalDate(row.nextDue, 'review.nextDue'), date,
      });
    }
  }

  const duplicates = [];
  const knownMistakeIds = new Set(mistakes.map(row => row.id));
  const uniqueSessions = removeDuplicates(sessions, 'session', duplicates);
  const uniqueMistakes = removeDuplicates(mistakes, 'mistake', duplicates);
  const uniqueReviews = removeDuplicates(reviews, 'review', duplicates);
  const orphanReviews = [], latestCompleted = new Map();
  for (const review of uniqueReviews) {
    if (!knownMistakeIds.has(review.mistakeId)) {
      orphanReviews.push({ reviewId: review.id, mistakeId: review.mistakeId, date: review.date });
      continue;
    }
    if (review.doneAt === null) continue;
    const previous = latestCompleted.get(review.mistakeId);
    if (!previous || compare(review.doneAt, previous.doneAt) > 0
      || (review.doneAt === previous.doneAt && compare(review.id, previous.id) > 0)) {
      latestCompleted.set(review.mistakeId, review);
    }
  }

  // Packet 2: snapshot-wide latest completion is a STUDY_DAY rule, not a V24 occurrence chain.
  const dueToday = [], overdue = [];
  for (const mistake of uniqueMistakes) {
    const completed = latestCompleted.get(mistake.id);
    const due = completed ? completed.nextDue : mistake.reviewDue;
    if (due === null || due > baseDate) continue;
    const row = { mistakeId: mistake.id, date: mistake.date, subject: mistake.subject,
      itemRef: mistake.itemRef, due };
    if (due === baseDate) dueToday.push(row);
    else overdue.push({ ...row, daysLate: baseDay - dateDay(due, 'effective due') });
  }

  const minutes = {
    w7: Object.fromEntries(SUBJECTS.map(code => [code, 0])),
    w30: Object.fromEntries(SUBJECTS.map(code => [code, 0])),
  };
  let selected = null;
  for (const session of uniqueSessions) {
    const age = baseDay - session.dayNumber;
    if (age < 0) continue;
    if (age <= 6) minutes.w7[session.subject] += session.confirmedMin;
    if (age <= 29) minutes.w30[session.subject] += session.confirmedMin;
    if (session.state === 'COMPLETED' || session.state === 'VERIFIED'
      || session.restartLocator.trim().length === 0) continue;
    if (!selected || compare(session.date, selected.date) > 0
      || (session.date === selected.date && compare(session.id, selected.id) > 0)) {
      selected = session;
    }
  }
  const resume = selected ? { date: selected.date, subject: selected.subject,
    restartLocator: selected.restartLocator } : null;
  dueToday.sort(dueOrder);
  overdue.sort(dueOrder);
  orphanReviews.sort((a, b) => compare(a.date, b.date) || compare(a.reviewId, b.reviewId));
  duplicates.sort((a, b) => compare(a.kind, b.kind) || compare(a.id, b.id));
  return { baseDate, dueToday, overdue, minutes, resume, orphanReviews, duplicates };
}
