import { createWorker } from 'tesseract.js';

/**
 * Preprocesses an image to improve OCR accuracy.
 * Handles resizing for performance and contrast enhancement.
 * @param {string} imageBase64 - The input base64 image string.
 * @returns {Promise<string>} - The preprocessed base64 image.
 */
const preprocessImage = (imageBase64) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const MAX_WIDTH = 2000;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height *= MAX_WIDTH / width;
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        let val = avg;
        if (avg < 110) val = 0;
        else if (avg > 180) val = 255;
        else val = (avg - 110) * (255 / (180 - 110));
        data[i] = data[i+1] = data[i+2] = val;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
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
 * @returns {Promise<string>} - The extracted text or Markdown table
 */
export const performOCR = async (image, lang = 'ind+eng+deu', onProgress = () => {}, tableMode = false) => {
  onProgress(5);
  const processedImage = typeof image === 'string' ? await preprocessImage(image) : image;
  onProgress(10);

  const worker = await createWorker(lang, 1, {
    logger: m => {
      if (m.status === 'recognizing text') {
        const progress = 10 + Math.round(m.progress * 85);
        onProgress(progress);
      }
    }
  });

  try {
    const { data } = await worker.recognize(processedImage);
    
    let resultText = "";
    if (tableMode) {
      // Automatic Table Detection Mode
      resultText = reconstructTable(data.words);
    } else {
      // Standard Layout Mode
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
    await worker.terminate();
    throw error;
  }
};
