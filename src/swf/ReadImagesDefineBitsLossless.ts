import sharp from 'sharp';
import { promisify } from 'util';
import { unzip } from 'zlib';
import { ISWFTag } from './common';

export interface IImageData
{
    code: number;
    characterId: number;
    imgType: string;
    imgData: Buffer;
    bitmapWidth?: number;
    bitmapHeight?: number;
}

export const ReadImagesDefineBitsLossless = async (tag: Partial<ISWFTag>): Promise<IImageData | null> =>
{
    const { characterId, bitmapFormat, bitmapWidth, bitmapHeight, bitmapColorTableSize, zlibBitmapData } = tag;

    const dataBuf = await promisify(unzip)(zlibBitmapData);

    if(!dataBuf) return null;
    const output = Buffer.alloc(bitmapWidth * bitmapHeight * 4);

    let index = 0;
    let ptr = 0;

    switch(bitmapFormat)
    {
        case 5: {
            for(let y = 0; y < bitmapHeight; ++y)
            {
                for(let x = 0; x < bitmapWidth; ++x)
                {
                    const alpha = dataBuf[ptr];
                    output[index] = dataBuf[ptr + 1] * (255 / alpha);
                    output[index + 1] = dataBuf[ptr + 2] * (255 / alpha);
                    output[index + 2] = dataBuf[ptr + 3] * (255 / alpha);
                    output[index + 3] = alpha;
                    index += 4;
                    ptr += 4;
                }
            }

            break;
        }
        case 3: {
            // 8-bit colormapped image
            const colorMap = [];

            for(let i = 0; i < bitmapColorTableSize + 1; ++i)
            {
                colorMap.push([dataBuf[ptr], dataBuf[ptr + 1], dataBuf[ptr + 2], dataBuf[ptr + 3]]);

                ptr += 4;
            }

            for(let _y2 = 0; _y2 < bitmapHeight; ++_y2)
            {
                for(let _x2 = 0; _x2 < bitmapWidth; ++_x2)
                {
                    const idx = dataBuf[ptr];
                    const color = idx < colorMap.length ? colorMap[idx] : [0, 0, 0, 0];
                    output[index] = color[0];
                    output[index + 1] = color[1];
                    output[index + 2] = color[2];
                    output[index + 3] = color[3];
                    ptr += 1;
                    index += 4;
                }

                // skip padding
                ptr += (4 - bitmapWidth % 4) % 4;
            }

            break;
        }
        default:
            // reject(new Error('unhandled bitmapFormat: ' + bitmapFormat));
            break;
    }

    // Convert to WebP using sharp with high quality and lossless compression
    const webpBuffer = await sharp(output, {
        raw: {
            width: bitmapWidth,
            height: bitmapHeight,
            channels: 4
        }
    })
    .webp({ quality: 95, lossless: false, effort: 6 })
    .toBuffer();

    return {
        code: 36,
        characterId: characterId,
        imgType: 'webp',
        imgData: webpBuffer,
        bitmapWidth: bitmapWidth,
        bitmapHeight: bitmapHeight
    };
};
