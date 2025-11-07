import { unlink } from 'fs/promises';
import ora from 'ora';
import sharp from 'sharp';
import { singleton } from 'tsyringe';
import { File, FileUtilities, NitroBundle } from '../common';

@singleton()
export class RebundleWithWebP
{
    private static BUNDLE_TYPES: string[] = [ 'furniture', 'figure', 'effect', 'pet', 'generic' ];

    constructor() {}

    public async rebundleWithWebP(): Promise<void>
    {
        const now = Date.now();
        const spinner = ora('Preparing WebP Rebundler').start();

        // Extract from assets/bundled to assets/extracted
        const bundledBaseDirectory = await FileUtilities.getDirectory('./assets/bundled');
        const extractedBaseDirectory = await FileUtilities.getDirectory('./assets/extracted');
        const reprocessedBaseDirectory = await FileUtilities.getDirectory('./assets/reprocessed');

        for await (const type of RebundleWithWebP.BUNDLE_TYPES)
        {
            const bundledTypeDirectory = await FileUtilities.getDirectory(`${ bundledBaseDirectory.path }/${ type }`);
            const extractedTypeDirectory = await FileUtilities.getDirectory(`${ extractedBaseDirectory.path }/${ type }`);
            const reprocessedTypeDirectory = await FileUtilities.getDirectory(`${ reprocessedBaseDirectory.path }/${ type }`);

            // Ensure reprocessed directory exists
            await reprocessedTypeDirectory.createDirectory();

            const files = await bundledTypeDirectory.getFileList();
            const totalFiles = files.length;
            let processed = 0;
            let skipped = 0;

            for await (const name of files)
            {
                const [ className, extension, ...rest ] = name.split('.');

                if(extension !== 'nitro') continue;

                try
                {
                    processed++;

                    // Check if already reprocessed (skip if exists)
                    const reprocessedFile = new File(`${ reprocessedTypeDirectory.path }/${ className }.nitro`);
                    if(reprocessedFile.exists())
                    {
                        skipped++;
                        spinner.text = `Skipping: ${ className } (${ processed } / ${ totalFiles }) - Already processed`;
                        spinner.render();
                        continue;
                    }

                    spinner.text = `Processing: ${ className } (${ processed } / ${ totalFiles }) - Extracting`;
                    spinner.render();

                    // Step 1: Extract .nitro file
                    const nitroFile = new File(`${ bundledTypeDirectory.path }/${ name }`);
                    const extractedDirectory = await FileUtilities.getDirectory(`${ extractedTypeDirectory.path }/${ className }`);

                    // Ensure extracted directory exists
                    await extractedDirectory.createDirectory();

                    const nitroBundle = NitroBundle.from((await nitroFile.getContentsAsBuffer()).buffer);

                    // Extract files
                    let jsonFileName: string = null;
                    let imageFileName: string = null;

                    for await (const [ bundleName, bundleBuffer ] of nitroBundle.files.entries())
                    {
                        const extractedFile = new File(`${ extractedDirectory.path }/${ bundleName }`);
                        await extractedFile.writeData(bundleBuffer);

                        if(bundleName.endsWith('.json'))
                        {
                            jsonFileName = bundleName;
                        }
                        else if(bundleName.endsWith('.png') || bundleName.endsWith('.jpg') || bundleName.endsWith('.jpeg'))
                        {
                            imageFileName = bundleName;
                        }
                    }

                    // Step 2: Convert PNG to WebP
                    if(imageFileName)
                    {
                        spinner.text = `Processing: ${ className } (${ processed } / ${ totalFiles }) - Converting to WebP`;
                        spinner.render();

                        const imageFile = new File(`${ extractedDirectory.path }/${ imageFileName }`);
                        const imageBuffer = await imageFile.getContentsAsBuffer();

                        // Convert to WebP
                        const webpBuffer = await sharp(imageBuffer)
                            .webp({ quality: 95, lossless: false, effort: 6 })
                            .toBuffer();

                        // Save as .webp
                        const webpFileName = imageFileName.replace(/\.(png|jpg|jpeg)$/, '.webp');
                        const webpFile = new File(`${ extractedDirectory.path }/${ webpFileName }`);
                        await webpFile.writeData(webpBuffer);

                        // Delete old PNG/JPG using fs.unlink
                        await unlink(imageFile.path);

                        // Update JSON reference
                        if(jsonFileName)
                        {
                            const jsonFile = new File(`${ extractedDirectory.path }/${ jsonFileName }`);
                            const jsonBuffer = await jsonFile.getContentsAsBuffer();
                            let jsonContent = jsonBuffer.toString('utf8');

                            // Replace image references
                            jsonContent = jsonContent.replace(
                                new RegExp(imageFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                                webpFileName
                            );

                            await jsonFile.writeData(Buffer.from(jsonContent));
                        }
                    }

                    // Step 3: Rebundle with maximum compression
                    spinner.text = `Processing: ${ className } (${ processed } / ${ totalFiles }) - Rebundling`;
                    spinner.render();

                    const newBundle = new NitroBundle();
                    const extractedFiles = await extractedDirectory.getFileList();

                    for await (const extractedName of extractedFiles)
                    {
                        const extractedFile = new File(`${ extractedDirectory.path }/${ extractedName }`);
                        newBundle.addFile(extractedName, await extractedFile.getContentsAsBuffer());
                    }

                    // Save rebundled file
                    const saveFile = new File(`${ reprocessedTypeDirectory.path }/${ className }.nitro`);
                    await saveFile.writeData(await newBundle.toBufferAsync());

                    spinner.text = `Processed: ${ className } (${ processed } / ${ totalFiles })`;
                    spinner.render();
                }
                catch (error)
                {
                    console.log();
                    console.error(`Error Processing: ${ name } - ${ error.message }`);
                }
            }

            if(skipped > 0)
            {
                console.log();
                console.log(`${ type }: Skipped ${ skipped } already processed files`);
            }
        }

        spinner.succeed(`WebP Rebundler: Finished in ${ Date.now() - now }ms`);
        console.log('\nRebundled files saved to: ./assets/reprocessed/');
        console.log('To use them, move them to ./assets/bundled/ and overwrite the old files.');
    }
}
