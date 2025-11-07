const fs = require('fs');
const path = require('path');

const TYPES = ['furniture', 'figure', 'effect', 'pet', 'generic'];

console.log('='.repeat(60));
console.log('Copying Rebundled Files to Production');
console.log('='.repeat(60));

let totalCopied = 0;
let totalErrors = 0;

for (const type of TYPES) {
    const sourceDir = path.join(__dirname, 'assets', 'reprocessed', type);
    const destDir = path.join(__dirname, 'assets', 'bundled', type);

    if (!fs.existsSync(sourceDir)) {
        console.log(`Skipping ${type} - no reprocessed files found`);
        continue;
    }

    const files = fs.readdirSync(sourceDir);
    console.log(`\nProcessing ${type}: ${files.length} files`);

    for (const file of files) {
        if (!file.endsWith('.nitro')) continue;

        try {
            const sourcePath = path.join(sourceDir, file);
            const destPath = path.join(destDir, file);

            // Get file sizes for comparison
            const sourceSize = fs.statSync(sourcePath).size;
            const destSize = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;

            // Copy file
            fs.copyFileSync(sourcePath, destPath);

            const reduction = destSize > 0
                ? Math.round((1 - sourceSize / destSize) * 100)
                : 0;

            console.log(`  ✓ ${file} - ${(sourceSize / 1024).toFixed(1)}KB (${reduction}% reduction)`);
            totalCopied++;
        } catch (error) {
            console.error(`  ✗ ${file} - Error: ${error.message}`);
            totalErrors++;
        }
    }
}

console.log('\n' + '='.repeat(60));
console.log(`Complete! Copied ${totalCopied} files with ${totalErrors} errors`);
console.log('='.repeat(60));

if (totalErrors > 0) {
    process.exit(1);
}
