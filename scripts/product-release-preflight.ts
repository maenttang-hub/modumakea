import { validateProductEnvironment } from '@/lib/product-environment';
import { PRODUCT_NAME, PRODUCT_RELEASE_VERSION } from '@/lib/product-config';

const issues = validateProductEnvironment(process.env);
const errors = issues.filter(issue => issue.severity === 'error');
const warnings = issues.filter(issue => issue.severity === 'warning');

console.log(`${PRODUCT_NAME} product preflight`);
console.log(`Release version: ${PRODUCT_RELEASE_VERSION}`);

for (const warning of warnings) {
  console.warn(`[warning:${warning.code}] ${warning.message}`);
}

for (const error of errors) {
  console.error(`[error:${error.code}] ${error.message}`);
}

if (errors.length > 0) {
  process.exitCode = 1;
} else {
  console.log('Product environment preflight passed.');
}

