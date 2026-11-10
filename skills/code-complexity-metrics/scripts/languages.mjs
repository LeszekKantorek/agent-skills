import { javascript } from './languages/javascript.mjs';
import { rust } from './languages/rust.mjs';
export function adapter(language) {
 if (language === 'javascript') return javascript;
 if (language === 'rust') return rust;
 throw new Error('Unsupported language');
}
export function languageOfFunction(node) { return rust.function.has(node.type) ? 'rust' : 'javascript'; }
