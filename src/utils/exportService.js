import { Document, Packer, Paragraph, TextRun, AlignmentType, PageBreak } from 'docx';
import { saveAs } from 'file-saver';

/**
 * Export an array of text pages to a Word document
 * @param {Array<string>} pages - Array of extracted text strings
 * @param {string} fileName - Destination filename
 */
export const exportToDocx = async (pages, fileName = 'scanned_documents.docx') => {
  const children = [];

  pages.forEach((pageContent, index) => {
    // Add text from current page
    const lines = pageContent.split('\n');
    lines.forEach(line => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              size: 24, // 12pt
              font: 'Inter'
            })
          ],
          spacing: {
            after: 200,
          }
        })
      );
    });

    // If not the last page, add a page break
    if (index < pages.length - 1) {
      children.push(new Paragraph({
        children: [new PageBreak()]
      }));
    }
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName.endsWith('.docx') ? fileName : `${fileName}.docx`);
};
