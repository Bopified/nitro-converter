/**
 * Verify Assets Being Served (bundled folder)
 * Checks if .nitro files in assets/bundled are using zstd compression
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
                    // Failed both
                }
            }

            fileCount--;
        }

        return { zstdCount, pakoCount };
    } catch (error) {
        return { error: error.message };
    }
}

async function verifyServedAssets() {
    console.log('='.repeat(80));
    console.log('SERVED ASSETS VERIFICATION');
    console.log('Checking assets/bundled/ directory (what your server serves)');
    console.log('='.repeat(80));
    console.log('');

    const bundledDir = path.join(__dirname, 'assets', 'bundled');

    try {
        await fs.access(bundledDir);
    } catch {
        console.error('❌ Error: assets/bundled directory not found!');
        process.exit(1);
    }

    const types = ['furniture', 'figure', 'effect', 'pet', 'generic'];

    let totalZstd = 0;
    let totalPako = 0;
    let totalFilesChecked = 0;

    const maxFilesPerType = 10;

    for (const type of types) {
        try {
            const typeDir = path.join(bundledDir, type);
            const files = await fs.readdir(typeDir);
            const nitroFiles = files.filter(f => f.endsWith('.nitro'));

            if (nitroFiles.length === 0) {
                console.log(`\n📁 ${type.toUpperCase()}: No files found`);
                continue;
            }

            console.log(`\n📁 ${type.toUpperCase()}: Found ${nitroFiles.length} files, checking ${Math.min(maxFilesPerType, nitroFiles.length)}...`);

            let typeZstd = 0;
            let typePako = 0;

            for (let i = 0; i < Math.min(maxFilesPerType, nitroFiles.length); i++) {
                const file = nitroFiles[i];
                const filePath = path.join(typeDir, file);

                const result = await checkFileCompression(filePath);

                if (result.error) {
                    console.log(`  ❌ ${file}: Error - ${result.error}`);
                } else {
                    const { zstdCount, pakoCount } = result;

                    if (zstdCount > 0 && pakoCount === 0) {
                        console.log(`  ✅ ${file}: ZSTD`);
                        typeZstd++;
                    } else if (pakoCount > 0 && zstdCount === 0) {
                        console.log(`  ⚠️  ${file}: PAKO (OLD)`);
                        typePako++;
                    } else {
                        console.log(`  ⚠️  ${file}: Mixed`);
                    }
                }

                totalFilesChecked++;
            }

            totalZstd += typeZstd;
            totalPako += typePako;

            console.log(`  Summary: ${typeZstd} zstd, ${typePako} pako`);

        } catch (error) {
            console.log(`\n📁 ${type.toUpperCase()}: Skipped - ${error.message}`);
        }
    }

    console.log('\n');
    console.log('='.repeat(80));
    console.log('RESULTS');
    console.log('='.repeat(80));
    console.log(`Files checked: ${totalFilesChecked}`);
    console.log(`✅ Using ZSTD: ${totalZstd} files (${((totalZstd / totalFilesChecked) * 100).toFixed(1)}%)`);
    console.log(`⚠️  Using PAKO: ${totalPako} files (${((totalPako / totalFilesChecked) * 100).toFixed(1)}%)`);
    console.log('');

    if (totalPako > 0) {
        console.log('❌ PROBLEM FOUND!');
        console.log('');
        console.log('Your server is serving OLD Pako-compressed assets from assets/bundled/');
        console.log('But you have NEW Zstd-compressed assets in assets/reprocessed/');
        console.log('');
        console.log('SOLUTION: Copy reprocessed assets to bundled folder');
        console.log('Run: node copy-rebundled.js');
        console.log('');
    } else if (totalZstd === totalFilesChecked) {
        console.log('🎉 SUCCESS!');
        console.log('');
        console.log('Your server is serving ZSTD-compressed assets!');
        console.log('The Pako fallback can now be safely removed from Vibe-Renderer.');
        console.log('');
    }

    console.log('='.repeat(80));
}

verifyServedAssets().catch(console.error);
