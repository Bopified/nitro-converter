import ByteBuffer from 'bytebuffer';
import { compress as zstdCompress, decompress as zstdDecompress } from '@mongodb-js/zstd';
import { inflate as pakoInflate } from 'pako';
import { BinaryReader } from '../utils';

export class NitroBundle
{
    private readonly _files: Map<string, Buffer>;

    constructor()
    {
        this._files = new Map<string, Buffer>();
    }

    public static async from(buffer: ArrayBuffer): Promise<NitroBundle>
    {
        const nitroBundle = new NitroBundle();
        const binaryReader = new BinaryReader(buffer);

        let fileCount = binaryReader.readShort();

        while(fileCount > 0)
        {
            const fileNameLength = binaryReader.readShort();
            const fileName = binaryReader.readBytes(fileNameLength).toString();
            const fileLength = binaryReader.readInt();
            const buffer = binaryReader.readBytes(fileLength);

            let decompressed: Buffer;

            // Try zstd first (new format), fall back to pako (old format)
            // This allows reading both old and new .nitro files during migration
            try
            {
                decompressed = await zstdDecompress(Buffer.from(buffer.toArrayBuffer()));
            }
            catch(zstdError)
            {
                // Fall back to pako for backward compatibility
                try
                {
                    const pakoDecompressed = pakoInflate(new Uint8Array(buffer.toArrayBuffer()));
                    decompressed = Buffer.from(pakoDecompressed.buffer);
                }
                catch(pakoError)
                {
                    throw new Error(`Failed to decompress ${fileName}: Neither zstd nor pako worked. Zstd: ${zstdError.message}, Pako: ${pakoError.message}`);
                }
            }

            nitroBundle.addFile(fileName, decompressed);

            fileCount--;
        }

        return nitroBundle;
    }

    public addFile(name: string, data: Buffer): void
    {
        this._files.set(name, data);
    }

    public async toBufferAsync(): Promise<Buffer>
    {
        const buffer = new ByteBuffer();

        buffer.writeUint16(this._files.size);

        for(const file of this._files.entries())
        {
            const fileName = file[0];
            const fileBuffer = file[1];

            buffer.writeUint16(fileName.length);
            buffer.writeString(fileName);

            // Use zstd compression (level 10 = balanced speed/ratio, max is 22)
            // Level 10 provides excellent compression with fast decompression
            const compressed = await zstdCompress(fileBuffer, 10);
            buffer.writeUint32(compressed.length);
            buffer.append(compressed);
        }

        buffer.flip();

        return buffer.toBuffer();
    }

    public get files(): Map<string, Buffer>
    {
        return this._files;
    }

    public get totalFiles(): number
    {
        return this._files.size;
    }
}
