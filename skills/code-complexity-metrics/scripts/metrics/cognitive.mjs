import { complexityEvents } from './complexity.mjs';
export function cognitiveEvents(fn) { return complexityEvents(fn).filter(event => event.metric === 'cognitive_complexity'); }
