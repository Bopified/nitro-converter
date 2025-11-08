/**
 * Real Asset Decompression Benchmark
 * Tests actual .nitro files from your assets/bundled directory
 * Compares Pako (old) vs Zstandard (new) decompression performance
 */

const fs = require('fs').promises;
const path = require('path');
const { inflate: pakoInflate } = require('pako');
const { decompress: zstdDecompress } = require('fzstd');

class BinaryReader {
    constructor(buffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.offset = 0;
    }

    readShort() {
        const value = this.view.getUint16(this.offset, false);
        this.offset += 2;
        return value;
    }

    readInt() {
        const value = this.view.getUint32(this.offset, false);
        this.offset += 4;
        return value;
    }

    readBytes(length) {
        const bytes = new Uint8Array(this.buffer, this.offset, length);
        this.offset += length;
        return bytes;
    }

    readString(length) {
        const bytes = this.readBytes(length);
        return Buffer.from(bytes).toString('utf-8');
    }
}

function parseNitroBundle(arrayBuffer) {
    const reader = new BinaryReader(arrayBuffer);
    let fileCount = reader.readShort();
    const files = [];

    while (fileCount > 0) {
        const fileNameLength = reader.readShort();
        const fileName = reader.readString(fileNameLength);
        const fileLength = reader.readInt();
        const compressedData = reader.readBytes(fileLength);

        files.push({ fileName, compressedData });
        fileCount--;
    }

    return files;
}

async function benchmarkFile(filePath) {
    const fileName = path.basename(filePath);
    const fileBuffer = await fs.readFile(filePath);
    const files = parseNitroBundle(fileBuffer.buffer);

    let pakoTime = 0;
    let zstdTime = 0;
    let decompressedSize = 0;
    let compressedSize = 0;

    // Warm up
    for (const { compressedData } of files.slice(0, 1)) {
        try { pakoInflate(compressedData); } catch (e) {}
        try { zstdDecompress(compressedData); } catch (e) {}
    }

    // Benchmark Pako
    try {
        const pakoStart = process.hrtime.bigint();
        for (const { compressedData } of files) {
            const decompressed = pakoInflate(compressedData);
            decompressedSize += decompressed.length;
            compressedSize += compressedData.length;
        }
        const pakoEnd = process.hrtime.bigint();
        pakoTime = Number(pakoEnd - pakoStart) / 1000000; // Convert to ms
    } catch (error) {
        console.error(`Pako failed for ${fileName}:`, error.message);
        pakoTime = -1;
    }

    // Benchmark Zstd
    try {
        const zstdStart = process.hrtime.bigint();
        for (const { compressedData } of files) {
            zstdDecompress(compressedData);
        }
        const zstdEnd = process.hrtime.bigint();
        zstdTime = Number(zstdEnd - zstdStart) / 1000000; // Convert to ms
    } catch (error) {
        console.error(`Zstd failed for ${fileName}:`, error.message);
        zstdTime = -1;
    }

    return {
        fileName,
        fileSize: fileBuffer.length,
        compressedSize,
        decompressedSize,
        filesInBundle: files.length,
        pakoTime,
        zstdTime
    };
}

async function getAllNitroFiles(directory) {
    const files = [];
    const types = ['furniture', 'figure', 'effect', 'pet', 'generic'];

    for (const type of types) {
        try {
            const typeDir = path.join(directory, type);
            const dirFiles = await fs.readdir(typeDir);

            for (const file of dirFiles) {
                if (file.endsWith('.nitro')) {
                    files.push({
                        type,
                        path: path.join(typeDir, file)
                    });
                }
            }
        } catch (error) {
            // Directory might not exist
        }
    }

    return files;
}

async function runBenchmark() {
    console.log('='.repeat(80));
    console.log('REAL ASSET DECOMPRESSION BENCHMARK');
    console.log('Comparing Pako (Deflate) vs Zstandard (zstd)');
    console.log('='.repeat(80));
    console.log('');

    const bundledDir = path.join(__dirname, 'assets', 'bundled');

    try {
        await fs.access(bundledDir);
    } catch {
        console.error('Error: assets/bundled directory not found!');
        console.error('Please run this script from the nitro-converter directory.');
        process.exit(1);
    }

    const allFiles = await getAllNitroFiles(bundledDir);

    if (allFiles.length === 0) {
        console.error('No .nitro files found in assets/bundled/');
        process.exit(1);
    }

    console.log(`Found ${allFiles.length} .nitro files`);
    console.log('Testing up to 20 files (5 per type)...\n');

    // Limit to 5 files per type (max 25 total)
    const filesToTest = [];
    const filesByType = {};

    for (const file of allFiles) {
        if (!filesByType[file.type]) filesByType[file.type] = [];
        if (filesByType[file.type].length < 5) {
            filesByType[file.type].push(file);
            filesToTest.push(file);
        }
    }

    const results = [];
    let current = 0;

    for (const file of filesToTest) {
        current++;
        process.stdout.write(`\rProcessing: ${current}/${filesToTest.length}`);
        const result = await benchmarkFile(file.path);
        results.push({ ...result, type: file.type });
    }

    console.log('\n');

    // Display results by type
    const groupedResults = {};
    for (const result of results) {
        if (!groupedResults[result.type]) groupedResults[result.type] = [];
        groupedResults[result.type].push(result);
    }

    for (const [type, typeResults] of Object.entries(groupedResults)) {
        console.log(`\n${type.toUpperCase()}`);
        console.log('-'.repeat(80));

        for (const result of typeResults) {
            const improvement = result.pakoTime > 0 && result.zstdTime > 0
                ? (result.pakoTime / result.zstdTime).toFixed(2)
                : 'N/A';

            console.log(`  ${result.fileName}`);
            console.log(`    Files in bundle: ${result.filesInBundle}`);
            console.log(`    Compressed size: ${(result.compressedSize / 1024).toFixed(2)} KB`);
            console.log(`    Decompressed size: ${(result.decompressedSize / 1024).toFixed(2)} KB`);
            console.log(`    Pako time: ${result.pakoTime.toFixed(3)}ms`);
            console.log(`    Zstd time: ${result.zstdTime.toFixed(3)}ms`);
            console.log(`    Speedup: ${improvement}x faster`);
        }
    }

    // Overall summary
    console.log('\n');
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));

    const validResults = results.filter(r => r.pakoTime > 0 && r.zstdTime > 0);
    const totalPakoTime = validResults.reduce((sum, r) => sum + r.pakoTime, 0);
    const totalZstdTime = validResults.reduce((sum, r) => sum + r.zstdTime, 0);
    const totalDecompressedSize = validResults.reduce((sum, r) => sum + r.decompressedSize, 0);
    const avgImprovement = (totalPakoTime / totalZstdTime).toFixed(2);

    console.log(`Files Tested: ${validResults.length}`);
    console.log(`Total Data Decompressed: ${(totalDecompressedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('');
    console.log(`Total Pako (Deflate) Time: ${totalPakoTime.toFixed(2)}ms`);
    console.log(`Total Zstd Time: ${totalZstdTime.toFixed(2)}ms`);
    console.log('');
    console.log(`Average Speedup: ${avgImprovement}x faster`);
    console.log(`Time Saved: ${(totalPakoTime - totalZstdTime).toFixed(2)}ms`);
    console.log('');

    const timeSavedPercent = ((1 - totalZstdTime / totalPakoTime) * 100).toFixed(1);
    console.log(`Performance Improvement: ${timeSavedPercent}% faster decompression`);
    console.log('');
    console.log('Result: Switching to Zstandard will make client-side asset loading');
    console.log(`        ${avgImprovement}x faster for your players!`);
    console.log('='.repeat(80));
}

runBenchmark().catch(console.error);
