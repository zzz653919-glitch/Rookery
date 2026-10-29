// The full curriculum: 6 + 6 + 6 + 6 + 5 = 29 lessons (see js/data/levels.js for the level definitions).
import { BEGINNER } from './lessons-beginner.js';
import { ELEMENTARY } from './lessons-elementary.js';
import { INTERMEDIATE } from './lessons-intermediate.js';
import { ADVANCED } from './lessons-advanced.js';
import { EXPERT } from './lessons-expert.js';
export const LESSONS = [...BEGINNER, ...ELEMENTARY, ...INTERMEDIATE, ...ADVANCED, ...EXPERT];
