import { packAsync } from 'free-tex-packer-core';
import sharp from 'sharp';
import { ImageBundle, SpriteBundle } from '../common';

export const PackImages = async (documentClass: string, imageBundle: ImageBundle, convertCase: boolean = false) =>
{
    const files = await packAsync(imageBundle.images, {
        textureName: (convertCase ? documentClass.substring(1) : documentClass),
        width: 10240,
        height: 4320,
        fixedSize: false,
        allowRotation: false,
        detectIdentical: true,
        allowTrim: true,
        //@ts-ignore
        exporter: 'Pixi'
    });

    const bundle = new SpriteBundle();

    for(const item of files)
    {
        if(item.name.endsWith('.json'))
        {
            bundle.spritesheet = JSON.parse(item.buffer.toString('utf8'));

            delete bundle.spritesheet.meta.app;
            delete bundle.spritesheet.meta.version;
        }
        else
        {
            // Convert PNG to WebP for better compression
            const webpBuffer = await sharp(item.buffer)
                .webp({ quality: 95, lossless: false, effort: 6 })
                .toBuffer();

            const newName = item.name.replace(/\.png$/, '.webp');

            bundle.imageData = {
                name: newName,
                buffer: webpBuffer
            };

            if(convertCase) bundle.imageData.name = (documentClass.replace(/(?:^|\.?)([A-Z])/g, (x,y) => ('_' + y.toLowerCase().replace(/^_/, '')))).substring(1) + '.webp';
        }
    }

    if((bundle.spritesheet !== undefined) && (bundle.imageData !== undefined))
    {
        // Update the image reference to .webp
        bundle.spritesheet.meta.image = bundle.imageData.name;
    }

    return bundle;
};
