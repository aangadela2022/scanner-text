import jsPDF from 'jspdf';

/**
 * Export an array of pages (text) to a single PDF document.
 * @param {Array<string>} pages - Array of extracted text from each page.
 * @param {string} fileName - Destination filename.
 */
export const exportToPdf = async (pages, fileName = 'scanned_document.pdf') => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 7;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  pages.forEach((pageText, index) => {
    // If NOT the first page, add a new page to the PDF
    if (index > 0) {
      doc.addPage();
    }

    let cursorY = margin;
    
    // Header for the page
    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${index + 1}`, margin, cursorY);
    doc.setFont('helvetica', 'normal');
    cursorY += 10;

    // Split text into lines that fit the width
    const splitText = doc.splitTextToSize(pageText, maxWidth);
    
    splitText.forEach(line => {
      // Check if we need a new internal page for long text within one "scanned page"
      if (cursorY + lineHeight > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }
      
      doc.text(line, margin, cursorY);
      cursorY += lineHeight;
    });
  });

  doc.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
};
