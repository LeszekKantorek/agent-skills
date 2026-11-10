import { complexityEvents } from './complexity.mjs';
export function cyclomaticEvents(fn) { return complexityEvents(fn).filter(event => event.metric === 'cyclomatic_complexity'); }
