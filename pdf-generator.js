const PDFDocument = require('pdfkit');
const fs = require('fs').promises;

/**
 * Module for generating PDFs from submitted forms
 * @module pdf-generator
 */

class PDFGenerator {
  /**
   * Generates a PDF document from form data
   * @param {Object} formData - Submitted form data
   * @param {Array} signatures - Signatures metadata
   * @param {string} outputPath - Output path for the PDF file
   * @returns {Promise<string>} Path to the generated PDF file
   */
  static async generate(formData, signatures = {}, outputPath = null) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const fileName = outputPath || `generated/form_${Date.now()}.pdf`;
        
        // Create output directory if it does not exist
        fs.mkdir('generated', { recursive: true }).then(() => {
          const stream = fs.createWriteStream(fileName);
          doc.pipe(stream);

          // Document heading
          doc.fontSize(20)
             .fillColor('#667eea')
             .text('PDF Generator', { align: 'center' })
             .moveDown();

          // Creation timestamp
          doc.fontSize(10)
             .fillColor('#64748b')
             .text(`Created: ${new Date().toLocaleString('en-US')}`, { align: 'center' })
             .moveDown(2);

          // Form content
          doc.fontSize(14)
             .fillColor('#000000')
             .text('Form content:', { underline: true })
             .moveDown();

          // Render scalar fields
          for (const [key, value] of Object.entries(formData)) {
            if (key.startsWith('signature_')) continue;
            
            const fieldLabel = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            doc.fontSize(12)
               .fillColor('#334155')
               .text(fieldLabel + ':', { continued: true })
               .fillColor('#1e293b')
               .text(JSON.stringify(value));
            
            doc.moveDown(0.5);
          }

          // Render signatures
          if (signatures && Object.keys(signatures).length > 0) {
            doc.moveDown(2);
            doc.fontSize(14)
               .fillColor('#000000')
               .text('Signatures:', { underline: true })
               .moveDown();

            const signatureTime = new Date().toLocaleString('en-US');
            
            for (const [signer, signatureData] of Object.entries(signatures)) {
              doc.fontSize(12)
                 .fillColor('#334155')
                 .text(`${signer}:`)
                 .moveDown(0.3);

              // Render signature image if available
              if (signatureData && signatureData.startsWith('data:image')) {
                try {
                  const base64Data = signatureData.split(',')[1];
                  const buffer = Buffer.from(base64Data, 'base64');
                  doc.image(buffer, {
                    fit: [200, 80],
                    align: 'left'
                  });
                } catch (err) {
                  console.error('Failed to embed signature image:', err);
                }
              }

              doc.fontSize(10)
                 .fillColor('#94a3b8')
                 .text(`Signed at: ${signatureTime}`);
              
              doc.moveDown(2);
            }
          }

          // Finalise the PDF output
          doc.end();

          stream.on('finish', () => {
            resolve(fileName);
          });

          stream.on('error', (err) => {
            reject(err);
          });
        }).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Checks that the generated PDF file exists and is not empty
   * @param {string} filePath - Path to the PDF file
   * @returns {Promise<boolean>}
   */
  static async validatePDF(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return stats.size > 0;
    } catch (error) {
      return false;
    }
  }
}

module.exports = PDFGenerator;

