/**
 * Verify Zstd Compression in Reprocessed Assets
 * Checks if .nitro files in assets/reprocessed are using zstd compression
 */

const fs = require('fs').promises;
const path = require('path');
const { decompress: zstdDecompress } = require('@mongodb-js/zstd');
const { inflate: pakoInflate } = require('pako');

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

async function checkFileCompression(filePath) {
    try {
        const fileBuffer = await fs.readFile(filePath);
        const reader = new BinaryReader(fileBuffer.buffer);

        let fileCount = reader.readShort();
        let zstdCount = 0;
        let pakoCount = 0;
        let failedCount = 0;

        while (fileCount > 0) {
            const fileNameLength = reader.readShort();
            const fileName = reader.readString(fileNameLength);
            const fileLength = reader.readInt();
            const compressedData = reader.readBytes(fileLength);

            // Try zstd first
            try {
                await zstdDecompress(Buffer.from(compressedData));
                zstdCount++;
            } catch (zstdError) {
                // Try pako
                try {
                    pakoInflate(compressedData);
                    pakoCount++;
                } catch (pakoError) {
                    failedCount++;
                }
            }

            fileCount--;
        }

        return { zstdCount, pakoCount, failedCount };
    } catch (error) {
        return { error: error.message };
    }
}

async function verifyAssets() {
    console.log('='.repeat(80));
    console.log('ZSTD COMPRESSION VERIFICATION');
    console.log('Checking assets/reprocessed/ directory');
    console.log('='.repeat(80));
    console.log('');

    const reprocessedDir = path.join(__dirname, 'assets', 'reprocessed');

    try {
        await fs.access(reprocessedDir);
    } catch {
        console.error('❌ Error: assets/reprocessed directory not found!');
        console.error('Have you run "npm run rebundle:webp" yet?');
        process.exit(1);
    }

    const types = ['furniture', 'figure', 'effect', 'pet', 'generic'];

    let totalFiles = 0;
    let totalZstd = 0;
    let totalPako = 0;
    let totalFailed = 0;
    let totalFilesChecked = 0;

    const maxFilesPerType = 10; // Check 10 files per type

    for (const type of types) {
        try {
            const typeDir = path.join(reprocessedDir, type);
            const files = await fs.readdir(typeDir);
            const nitroFiles = files.filter(f => f.endsWith('.nitro'));

            if (nitroFiles.length === 0) {
                console.log(`\n📁 ${type.toUpperCase()}: No files found (may not be rebundled yet)`);
                continue;
            }

            console.log(`\n📁 ${type.toUpperCase()}: Found ${nitroFiles.length} files, checking ${Math.min(maxFilesPerType, nitroFiles.length)}...`);

            let typeZstd = 0;
            let typePako = 0;
            let typeFailed = 0;

            for (let i = 0; i < Math.min(maxFilesPerType, nitroFiles.length); i++) {
                const file = nitroFiles[i];
                const filePath = path.join(typeDir, file);

                const result = await checkFileCompression(filePath);

                if (result.error) {
                    console.log(`  ❌ ${file}: Error - ${result.error}`);
                    typeFailed++;
                } else {
                    const { zstdCount, pakoCount, failedCount } = result;

                    if (zstdCount > 0 && pakoCount === 0 && failedCount === 0) {
                        console.log(`  ✅ ${file}: All files using ZSTD (${zstdCount} files)`);
                        typeZstd++;
                    } else if (pakoCount > 0 && zstdCount === 0) {
                        console.log(`  ⚠️  ${file}: Still using PAKO (${pakoCount} files)`);
                        typePako++;
                    } else if (failedCount > 0) {
                        console.log(`  ❌ ${file}: Failed to decompress (${failedCount} files)`);
                        typeFailed++;
                    } else {
                        console.log(`  ⚠️  ${file}: Mixed (${zstdCount} zstd, ${pakoCount} pako)`);
                        if (zstdCount > pakoCount) typeZstd++;
                        else typePako++;
                    }
                }

                totalFilesChecked++;
            }

            totalFiles += nitroFiles.length;
            totalZstd += typeZstd;
            totalPako += typePako;
            totalFailed += typeFailed;

            console.log(`  Summary: ${typeZstd} zstd, ${typePako} pako, ${typeFailed} failed`);

        } catch (error) {
            console.log(`\n📁 ${type.toUpperCase()}: Skipped - ${error.message}`);
        }
    }

    console.log('\n');
    console.log('='.repeat(80));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total .nitro files in reprocessed: ${totalFiles}`);
    console.log(`Files checked: ${totalFilesChecked}`);
    console.log('');
    console.log(`✅ Using ZSTD: ${totalZstd} files (${((totalZstd / totalFilesChecked) * 100).toFixed(1)}%)`);
    console.log(`⚠️  Using PAKO: ${totalPako} files (${((totalPako / totalFilesChecked) * 100).toFixed(1)}%)`);
    console.log(`❌ Failed: ${totalFailed} files (${((totalFailed / totalFilesChecked) * 100).toFixed(1)}%)`);
    console.log('');

    if (totalZstd === totalFilesChecked) {
        console.log('🎉 SUCCESS! All checked files are using ZSTD compression!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Run: node copy-rebundled.js');
        console.log('2. Deploy the rebundled assets to your server');
        console.log('3. Enjoy 2-3x faster asset decompression! 🚀');
    } else if (totalPako > 0) {
        console.log('⚠️  WARNING: Some files are still using PAKO compression!');
        console.log('');
        console.log('This means the rebundle process may have failed or not completed.');
        console.log('Check the rebundle output for errors.');
    } else if (totalFailed > 0) {
        console.log('❌ ERROR: Some files failed to decompress!');
        console.log('');
        console.log('This indicates corrupted or invalid .nitro files.');
        console.log('Re-run the rebundle process.');
    }

    console.log('='.repeat(80));
}

verifyAssets().catch(console.error);
