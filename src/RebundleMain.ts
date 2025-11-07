import 'reflect-metadata';
import { container } from 'tsyringe';
import { RebundleWithWebP } from './converters/RebundleWithWebP';

(async () =>
{
    try
    {
        console.log('='.repeat(60));
        console.log('WebP Rebundler for Nitro Assets');
        console.log('='.repeat(60));
        console.log('This script will:');
        console.log('1. Extract existing .nitro files from ./assets/bundled/');
        console.log('2. Convert all PNG images to WebP format');
        console.log('3. Rebundle with maximum compression');
        console.log('4. Save optimized files to ./assets/reprocessed/');
        console.log('='.repeat(60));
        console.log('');

        const rebundler = container.resolve(RebundleWithWebP);
        await rebundler.rebundleWithWebP();

        console.log('');
        console.log('='.repeat(60));
        console.log('IMPORTANT: Review the files in ./assets/reprocessed/');
        console.log('Then run: node copy-rebundled.js to replace old files');
        console.log('='.repeat(60));

        process.exit(0);
    }
    catch (e)
    {
        console.error('Fatal Error:', e);
        process.exit(1);
    }
})();
