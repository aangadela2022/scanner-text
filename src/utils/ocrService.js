/**
 * Advanced image preprocessing for OCR.
 * Implements Adaptive Thresholding to handle uneven lighting and shadows.
 * @param {string} imageBase64 
 * @param {boolean} handwritingMode
 */
const preprocessImage = (imageBase64, handwritingMode = false) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Target Resolution: ~300 DPI (roughly 2500px height for A4)
      const TARGET_HEIGHT = handwritingMode ? 3000 : 2500; 
      let scale = TARGET_HEIGHT / img.height;
      if (scale > 2) scale = 2; // Prevent excessive scaling
      
      const width = img.width * scale;
      const height = img.height * scale;
      
      canvas.width = width;
      canvas.height = height;
      
      // 1. Draw and Grayscale
      ctx.filter = `contrast(${handwritingMode ? 1.4 : 1.2}) grayscale(1)`;
      ctx.drawImage(img, 0, 0, width, height);
      
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const grey = new Uint8ClampedArray(width * height);
      
      for (let i = 0; i < data.length; i += 4) {
        grey[i / 4] = data[i]; // Since it's already grayscaled by filter
      }

      // 2. Adaptive Thresholding (Bradley-Roth algorithm)
      const threshold = 15; // Percentage below mean
      const s = Math.floor(width / 8); // Window size
      const integralImage = new Int32Array(width * height);
      
      // Calculate Integral Image
      for (let i = 0; i < width; i++) {
        let sum = 0;
        for (let j = 0; j < height; j++) {
          const idx = j * width + i;
          sum += grey[idx];
          if (i === 0) integralImage[idx] = sum;
          else integralImage[idx] = integralImage[idx - 1] + sum;
        }
      }

      // Perform Thresholding
      for (let i = 0; i < width; i++) {
        for (let j = 0; j < height; j++) {
          const idx = j * width + i;
          const x1 = Math.max(0, i - s / 2);
          const x2 = Math.min(width - 1, i + s / 2);
          const y1 = Math.max(0, j - s / 2);
          const y2 = Math.min(height - 1, j + s / 2);
          
          const count = (x2 - x1) * (y2 - y1);
          const sum = integralImage[y2 * width + x2] - 
                      integralImage[y1 * width + x2] - 
                      integralImage[y2 * width + x1] + 
                      integralImage[y1 * width + x1];
          
          if (grey[idx] * count < sum * (100 - threshold) / 100) {
            data[i * 4 + j * width * 4] = data[i * 4 + j * width * 4 + 1] = data[i * 4 + j * width * 4 + 2] = 0;
          } else {
            data[i * 4 + j * width * 4] = data[i * 4 + j * width * 4 + 1] = data[i * 4 + j * width * 4 + 2] = 255;
          }
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png')); // PNG preferred to avoid artifacts
    };
    img.src = imageBase64;
  });
};

/**
 * Reconstructs a table from OCR word data using spatial clustering.
 * @param {Array} words - Array of word objects from Tesseract result.
 * @returns {string} - Markdown formatted table.
 */
const reconstructTable = (words) => {
  if (!words || words.length === 0) return "";

  // 1. Group words into rows based on Y-coordinate overlap
  const rows = [];
  const rowThreshold = 10; // Pixels of tolerance for row alignment

  words.sort((a, b) => a.bbox.y0 - b.bbox.y0);

  words.forEach(word => {
    let foundRow = rows.find(r => Math.abs(r.y - word.bbox.y0) < rowThreshold);
    if (!foundRow) {
      foundRow = { y: word.bbox.y0, words: [] };
      rows.push(foundRow);
    }
    foundRow.words.push(word);
  });

  // 2. Sort words within each row by X-coordinate
  rows.forEach(row => {
    row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
  });

  // 3. Detect column boundaries by analyzing horizontal gaps across all rows
  // This is a simplified version: Use a fixed set of columns based on the row with most items
  // or use a gap-detection approach. Let's use the row with the most items as a baseline.
  const baselineRow = [...rows].sort((a, b) => b.words.length - a.words.length)[0];
  const colCount = baselineRow.words.length;

  let markdown = "";
  
  // Create Header (assuming first row is header if valid)
  rows.forEach((row, idx) => {
    const cells = row.words.map(w => w.text.trim());
    // Pad or trim to match baseline column count (simplified)
    const normalizedCells = cells.slice(0, colCount);
    while (normalizedCells.length < colCount) normalizedCells.push("");
    
    markdown += `| ${normalizedCells.join(" | ")} |\n`;
    
    if (idx === 0) {
      markdown += `| ${Array(colCount).fill("---").join(" | ")} |\n`;
    }
  });

  return markdown;
};

/**
 * Perform OCR on an image with layout analysis.
 * @param {string|Blob|File} image - Image data to process
 * @param {string} lang - Language code
 * @param {function} onProgress - Callback for progress updates
 * @param {boolean} tableMode - Whether to attempt table reconstruction
 * @param {boolean} handwritingMode - Whether to optimize for handwriting
 * @returns {Promise<string>} - The extracted text or Markdown table
 */
export const performOCR = async (image, lang = 'ind+eng', onProgress = () => {}, tableMode = false, handwritingMode = false) => {
  onProgress(5);
  const processedImage = typeof image === 'string' ? await preprocessImage(image, handwritingMode) : image;
  onProgress(15);

  const worker = await createWorker(lang, 1, {
    logger: m => {
      if (m.status === 'recognizing text') {
        const progress = 15 + Math.round(m.progress * 80);
        onProgress(progress);
      }
    }
  });

  try {
    // Tesseract Settings for Accuracy
    await worker.setParameters({
      tessedit_pageseg_mode: handwritingMode ? '3' : '1', // 3 = Auto, 1 = Auto with OSD
      tessedit_ocr_engine_mode: '1', // LSTM only
      // If handwriting, we disable dictionaries which can cause weird results for messy text
      load_system_dawg: handwritingMode ? '0' : '1',
      load_freq_dawg: handwritingMode ? '0' : '1',
      textord_heavy_nr: handwritingMode ? '1' : '0', // Extra noise removal for handwriting
    });

    const { data } = await worker.recognize(processedImage);
    
    let resultText = "";
    if (tableMode) {
      resultText = reconstructTable(data.words);
    } else {
      if (data.blocks && data.blocks.length > 0) {
        data.blocks.forEach(block => {
          resultText += block.text.trim() + "\n\n";
        });
      } else {
        resultText = data.text;
      }
    }

    await worker.terminate();
    return resultText.trim();
  } catch (error) {
    console.error('OCR Error:', error);
    if (worker) await worker.terminate();
    throw error;
  }
};
