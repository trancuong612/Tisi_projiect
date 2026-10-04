import { createEmptyCard, fsrs, Rating, State } from "ts-fsrs";

const scheduler = fsrs();

const stateMap = {
  [State.New]: "NEW",
  [State.Learning]: "LEARNING",
  [State.Review]: "REVIEWING",
  [State.Relearning]: "RELEARNING",
};

export function toFsrsCard(memory) {
  if (!memory || memory.totalReviews === 0 || memory.state === "NEW") {
    return createEmptyCard(memory?.due || new Date());
  }

  const fsrsState = {
    LEARNING: State.Learning,
    REVIEWING: State.Review,
    RELEARNING: State.Relearning,
    MATURE: State.Review,
    MASTERED: State.Review,
  }[memory.state] || State.Review;

  return {
    due: memory.due,
    stability: memory.stability,
    difficulty: memory.difficulty,
    elapsed_days: memory.elapsedDays,
    scheduled_days: memory.scheduledDays,
    reps: memory.reps,
    lapses: memory.lapses,
    learning_steps: memory.learningSteps || 0,
    state: fsrsState,
    last_review: memory.lastReview || undefined,
  };
}

export function scheduleReview(memory, ratingValue, now = new Date()) {
  const card = toFsrsCard(memory);
  const rating = Number(ratingValue);
  const result = scheduler.repeat(card, now)[rating];
  if (!result) throw new Error("Invalid FSRS rating");
  const next = result.card;
  return {
    rating,
    state: stateMap[next.state] || "REVIEWING",
    due: next.due,
    stability: next.stability,
    difficulty: next.difficulty,
    elapsedDays: next.elapsed_days,
    scheduledDays: next.scheduled_days,
    reps: next.reps,
    lapses: next.lapses,
    learningSteps: next.learning_steps || 0,
    lastReview: next.last_review || now,
    isCorrect: rating !== Rating.Again,
  };
}

export { Rating };
