import * as concatFrames from 'concat-frames';
import decoder from 'jpg-stream/decoder';
import sharp from 'sharp';
import { PassThrough } from 'stream';
import { promisify } from 'util';
import { unzip } from 'zlib';
import { SlicedToArray } from '../common';
import { ISWFTag } from './common';
import { IImageData } from './ReadImagesDefineBitsLossless';
import { RecognizeImageHeader } from './RecognizeImageHeader';

export const ReadImagesJPEG3or4 = async (code: number, tag: Partial<ISWFTag>): Promise<IImageData> =>
{
    const { characterId, imgData, bitmapAlphaData } = tag;
    const imgType = RecognizeImageHeader(imgData);

    if(imgType !== 'jpeg') return { code, characterId, imgType, imgData };

    const alphaBufPre = await promisify(unzip)(bitmapAlphaData);

    let alphaBuffer: Buffer = null;

    if(alphaBufPre.length > 0) alphaBuffer = alphaBufPre;

    const bufferStream = new PassThrough();

    bufferStream.end(imgData);

    return new Promise((resolve, reject) =>
    {
        bufferStream
            .pipe(new decoder())
            .pipe(concatFrames.default(async (data: any) =>
            {
                try
                {
                    const _ref2 = SlicedToArray.slicedToArray(data, 1);
                    const frame = _ref2[0];

                    const input = frame.pixels;
                    const pCount = frame.width * frame.height;
                    const output = Buffer.alloc(pCount * 4);

                    if(alphaBuffer !== null && alphaBuffer.length !== pCount)
                    {
                        console.error('expect alphaBuf to have size ' + pCount + ' while getting ' + alphaBuffer.length);
                    }

                    const getAlphaBuffer = (i: any) =>
                    {
                        if(!alphaBuffer) return 0xFF;

                        return alphaBuffer[i];
                    };

                    for(let i = 0; i < pCount; ++i)
                    {
                        output[4 * i] = input[3 * i];
                        output[4 * i + 1] = input[3 * i + 1];
                        output[4 * i + 2] = input[3 * i + 2];
                        output[4 * i + 3] = getAlphaBuffer(i);
                    }

                    // Convert to WebP using sharp with high quality
                    const webpBuffer = await sharp(output, {
                        raw: {
                            width: frame.width,
                            height: frame.height,
                            channels: 4
                        }
                    })
                    .webp({ quality: 95, lossless: false, effort: 6 })
                    .toBuffer();

                    bufferStream.end();

                    resolve({
                        code: code,
                        characterId: characterId,
                        imgType: 'webp',
                        imgData: webpBuffer
                    });
                }
                catch(error)
                {
                    reject(error);
                }
            }));
    });
};
