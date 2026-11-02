// Break-only games. Each game exports mount(el, ctx) and returns a cleanup function.
import breathing from "./breathing.js";
import memory from "./memory.js";
import g2048 from "./g2048.js";
import reaction from "./reaction.js";
import doodle from "./doodle.js";
import scramble from "./scramble.js";
import stretch from "./stretch.js";
import flashcards from "./flashcards.js";

export const GAMES = [breathing, memory, g2048, reaction, doodle, scramble, stretch, flashcards];
