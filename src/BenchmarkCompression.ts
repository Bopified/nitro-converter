import { readFile } from 'fs/promises';
import { deflate } from 'pako';
import { compress as zstdCompress } from '@mongodb-js/zstd';
import { File, FileUtilities, NitroBundle } from './common';

async function benchmarkCompression(): Promise<void>
{
    console.log('='.repeat(80));
    console.log('COMPRESSION BENCHMARK: Pako (Deflate) vs Zstandard (zstd)');
    console.log('='.repeat(80));
    console.log('');

    const bundledBaseDirectory = await FileUtilities.getDirectory('./assets/bundled');
    const types = ['furniture', 'figure', 'effect', 'pet', 'generic'];

    let totalOriginalSize = 0;
    let totalPakoSize = 0;
    let totalZstdSize = 0;
    let totalPakoTime = 0;
    let totalZstdTime = 0;
    let filesTested = 0;

    // Test up to 10 files from each type
    const maxFilesPerType = 10;

    for(const type of types)
    {
        try
        {
            const bundledTypeDirectory = await FileUtilities.getDirectory(`${bundledBaseDirectory.path}/${type}`);
            const files = await bundledTypeDirectory.getFileList();

            let filesInType = 0;

            for(const name of files)
            {
                if(filesInType >= maxFilesPerType) break;

                const [className, extension] = name.split('.');
                if(extension !== 'nitro') continue;

                try
                {
                    filesInType++;
                    filesTested++;

                    const nitroFile = new File(`${bundledTypeDirectory.path}/${name}`);
                    const nitroBuffer = await nitroFile.getContentsAsBuffer();

                    // Extract the bundle to get individual files
                    const nitroBundle = await NitroBundle.from(nitroBuffer.buffer);

                    console.log(`\nTesting: ${type}/${className}`);
                    console.log('-'.repeat(80));

                    // For each file in the bundle, test compression
                    for(const [fileName, fileBuffer] of nitroBundle.files.entries())
                    {
                        const originalSize = fileBuffer.length;
                        totalOriginalSize += originalSize;

                        // Benchmark Pako (Deflate Level 9)
                        const pakoStart = performance.now();
                        const pakoCompressed = deflate(fileBuffer, { level: 9 });
                        const pakoTime = performance.now() - pakoStart;
                        totalPakoTime += pakoTime;
                        totalPakoSize += pakoCompressed.length;

                        // Benchmark Zstd (Level 10)
                        const zstdStart = performance.now();
                        const zstdCompressed = await zstdCompress(fileBuffer, 10);
                        const zstdTime = performance.now() - zstdStart;
                        totalZstdTime += zstdTime;
                        totalZstdSize += zstdCompressed.length;

                        const pakoRatio = ((originalSize - pakoCompressed.length) / originalSize * 100).toFixed(1);
                        const zstdRatio = ((originalSize - zstdCompressed.length) / originalSize * 100).toFixed(1);
                        const sizeComparisonNum = (zstdCompressed.length / pakoCompressed.length - 1) * 100;
                        const sizeComparison = sizeComparisonNum.toFixed(1);

                        console.log(`  ${fileName}:`);
                        console.log(`    Original: ${(originalSize / 1024).toFixed(2)} KB`);
                        console.log(`    Pako:     ${(pakoCompressed.length / 1024).toFixed(2)} KB (-${pakoRatio}%) in ${pakoTime.toFixed(2)}ms`);
                        console.log(`    Zstd:     ${(zstdCompressed.length / 1024).toFixed(2)} KB (-${zstdRatio}%) in ${zstdTime.toFixed(2)}ms`);
                        console.log(`    Size diff: ${sizeComparisonNum > 0 ? '+' : ''}${sizeComparison}% | Speed: ${(pakoTime / zstdTime).toFixed(2)}x faster`);
                    }
                }
                catch(error)
                {
                    console.error(`    Error testing ${name}: ${error.message}`);
                }
            }
        }
        catch(error)
        {
            console.log(`Skipping type ${type}: ${error.message}`);
        }
    }

    // Print summary
    console.log('\n');
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Files Tested: ${filesTested}`);
    console.log('');
    console.log(`Total Original Size:    ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('');
    console.log(`Pako (Deflate Lv9):`);
    console.log(`  Compressed Size:      ${(totalPakoSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Compression Ratio:    ${((totalOriginalSize - totalPakoSize) / totalOriginalSize * 100).toFixed(1)}%`);
    console.log(`  Total Time:           ${totalPakoTime.toFixed(2)}ms`);
    console.log('');
    console.log(`Zstandard (Level 10):`);
    console.log(`  Compressed Size:      ${(totalZstdSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Compression Ratio:    ${((totalOriginalSize - totalZstdSize) / totalOriginalSize * 100).toFixed(1)}%`);
    console.log(`  Total Time:           ${totalZstdTime.toFixed(2)}ms`);
    console.log('');
    console.log(`Comparison:`);
    const sizeDiffNum = (totalZstdSize / totalPakoSize - 1) * 100;
    const sizeDiff = sizeDiffNum.toFixed(1);
    console.log(`  File Size Difference: ${sizeDiffNum > 0 ? '+' : ''}${sizeDiff}%`);
    console.log(`  Compression Speed:    ${(totalPakoTime / totalZstdTime).toFixed(2)}x faster`);
    console.log('');
    console.log('Note: Client-side decompression with Zstd is typically 2-3x faster than Pako!');
    console.log('='.repeat(80));
}

benchmarkCompression().catch(console.error);
