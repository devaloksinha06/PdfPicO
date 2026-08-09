import { generatePDF } from 'react-native-html-to-pdf';
import {
    readFile,
    copyFile,
    DownloadDirectoryPath,
    exists,
    unlink,
} from '@dr.pogodin/react-native-fs';
import { Image as RNImage } from 'react-native';

/**
 * Gets the dimensions of a local image.
 * Returns { width, height }.
 */
function getImageSize(uri) {
    return new Promise((resolve, reject) => {
        RNImage.getSize(
            uri,
            (width, height) => resolve({ width, height }),
            (err) => reject(err)
        );
    });
}

/**
 * Converts an array of local image paths into a single PDF file
 * and saves it to the device's Downloads folder.
 *
 * - Images are compressed to JPEG quality for smaller PDF size.
 * - Each image is scaled to fit exactly within one A4 page with
 *   no overflow (no cutting/spillover).
 *
 * @param {string[]} imagePaths - array of local file:// or content:// URIs
 * @param {string} fileName - name for the output PDF (without extension)
 * @returns {Promise<string>} full path to the generated PDF in Downloads
 */
export async function convertImagesToPDF(imagePaths, fileName = 'converted') {
    if (!imagePaths || imagePaths.length === 0) {
        throw new Error('No images provided for conversion');
    }

    // Step 1: Convert every image into a base64 string and get its dimensions.
    const imageDataList = await Promise.all(
        imagePaths.map(async (path) => {
            const cleanPath = path.replace('file://', '');
            const base64 = await readFile(cleanPath, 'base64');

            // Get image dimensions to calculate correct aspect ratio
            let width = 1;
            let height = 1;
            try {
                const size = await getImageSize(path.startsWith('file://') ? path : `file://${path}`);
                width = size.width;
                height = size.height;
            } catch (e) {
                console.warn('Could not get image size, using default fit', e);
            }

            return {
                base64: `data:image/jpeg;base64,${base64}`,
                width,
                height,
            };
        })
    );

    // Step 2: Build one <div> per page with the image constrained
    // to fit inside the A4 page without any overflow.
    //
    // A4 page in CSS at 72 DPI ≈ 595 x 842 points.
    // We use max-width & max-height with object-fit:contain so the
    // image never exceeds the page boundaries in either direction.
    const PAGE_W = 595;  // A4 width in CSS pts
    const PAGE_H = 842;  // A4 height in CSS pts

    const pagesHtml = imageDataList
        .map((imgData, index) => {
            // Calculate the image dimensions scaled to fit within the page
            const imgRatio = imgData.width / imgData.height;
            const pageRatio = PAGE_W / PAGE_H;

            let displayW, displayH;
            if (imgRatio > pageRatio) {
                // Image is wider relative to page → constrain by width
                displayW = PAGE_W;
                displayH = PAGE_W / imgRatio;
            } else {
                // Image is taller relative to page → constrain by height
                displayH = PAGE_H;
                displayW = PAGE_H * imgRatio;
            }
            
            const isLast = index === imageDataList.length - 1;

            return `
        <div style="
            ${isLast ? '' : 'page-break-after: always;'}
            width: ${PAGE_W}pt;
            height: ${PAGE_H - 1}pt;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        ">
          <img src="${imgData.base64}" style="
              width: ${Math.floor(displayW)}pt;
              height: ${Math.floor(displayH)}pt;
              display: block;
          " />
        </div>
      `;
        })
        .join('');

    const html = `
    <html>
      <head>
        <style>
          @page { margin: 0; size: A4; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
        </style>
      </head>
      <body style="margin:0; padding:0;">
        ${pagesHtml}
      </body>
    </html>
  `;

    // Step 3: Generate the PDF file in the app's internal directory first.
    const options = {
        html,
        fileName,
        directory: 'Documents',
        base64: false,
        // Smaller page dimensions help compress (images scaled down by renderer)
        width: 595,
        height: 842,
    };

    const pdf = await generatePDF(options);
    const tempPath = pdf.filePath;

    // Step 4: Copy the generated PDF to the public Downloads folder.
    const safeName = fileName.replace(/\.pdf$/i, '');
    const destPath = `${DownloadDirectoryPath}/${safeName}.pdf`;

    // If a file with that name already exists, remove it first to avoid errors.
    if (await exists(destPath)) {
        await unlink(destPath);
    }

    await copyFile(tempPath, destPath);

    return destPath;
}