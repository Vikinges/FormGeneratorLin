const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const fsp = fs.promises;

const DEFAULT_OUTPUT_DIR = 'generated';
const MM_PER_POINT = 25.4 / 72;
const POINTS_PER_MM = 72 / 25.4;
const PX_TO_POINT = 72 / 96; // 96px == 72pt at 1in
const CANVAS_WIDTH_PX = 795;
const CANVAS_HEIGHT_PX = Math.round(CANVAS_WIDTH_PX * Math.sqrt(2));
const PDF_MARGIN_MM = 15;
const PDF_MARGIN_PT = PDF_MARGIN_MM * POINTS_PER_MM;

const formatBoolean = (value) => (value ? 'Yes' : 'No');
const formatArray = (arr) =>
  arr
    .filter(Boolean)
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        return item.originalname || item.name || item.path || JSON.stringify(item);
      }
      return String(item);
    })
    .join(', ');

/**
 * Module for generating PDFs from submitted forms.
 */
class PDFGenerator {
  /**
   * Generates a PDF document from form data.
   * @param {Object} formData - Submitted form data.
   * @param {Array|Object} signatures - Signatures metadata.
   * @param {Object} options
   * @param {string} [options.outputPath]
   * @param {Array} [options.template]
   * @param {Object} [options.meta]
   * @returns {Promise<string>} Path to the generated PDF file.
   */
  static async generate(formData, signatures = {}, options = {}) {
    const {
      outputPath = null,
      template = [],
      meta = {}
    } = options || {};

    const targetPath =
      outputPath ||
      path.join(DEFAULT_OUTPUT_DIR, `form_${Date.now()}.pdf`);
    const outputDir = path.dirname(targetPath);

    await fsp.mkdir(outputDir, { recursive: true });

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 0
        });
        const stream = fs.createWriteStream(targetPath);
        doc.pipe(stream);
        doc.font('Helvetica');

        const title = meta.templateName || 'PDF Generator';

        const templateFields = Array.isArray(template) ? template : [];
        const renderedKeys = new Set();

        const printableWidth = doc.page.width - PDF_MARGIN_PT * 2;
        const printableHeight = doc.page.height - PDF_MARGIN_PT * 2;
        const scale = Math.min(
          printableWidth / CANVAS_WIDTH_PX,
          printableHeight / CANVAS_HEIGHT_PX
        );
        const canvasWidthPt = CANVAS_WIDTH_PX * scale;
        const canvasHeightPt = CANVAS_HEIGHT_PX * scale;
        const originX = PDF_MARGIN_PT + (printableWidth - canvasWidthPt) / 2;
        const originY = PDF_MARGIN_PT;

        const px = (value) => value * scale;
        const scaledFont = (size) => Math.max(size * scale, size * 0.85);
        const scaledSpacing = (value, minimum = value) => Math.max(value * scale, minimum);

        const safeText = (value) => {
          if (value === undefined || value === null) {
            return '';
          }
          if (typeof value === 'boolean') {
            return formatBoolean(value);
          }
          if (typeof value === 'string') {
            return value;
          }
          if (Array.isArray(value)) {
            return formatArray(value);
          }
          if (typeof value === 'object') {
            return JSON.stringify(value);
          }
          return String(value);
        };

        const parseNumeric = (value, fallback) => {
          if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
          }
          if (typeof value === 'string') {
            const parsed = parseFloat(value);
            if (!Number.isNaN(parsed)) {
              return parsed;
            }
          }
          return fallback;
        };

        const drawRequiredBadge = (x, y) => {
          const badgeText = 'REQUIRED';
          const badgeFont = scaledFont(8);
          const paddingX = scaledSpacing(6, 4);
          const paddingY = scaledSpacing(3, 2);
          doc.save();
          doc.font('Helvetica-Bold').fontSize(badgeFont);
          const textWidth = doc.widthOfString(badgeText);
          const badgeWidth = textWidth + paddingX * 2;
          const badgeHeight = badgeFont + paddingY * 2;
          doc.fillColor('#fee2e2').strokeColor('#fca5a5');
          doc.roundedRect(x - badgeWidth, y, badgeWidth, badgeHeight, scaledSpacing(6, 4)).fillAndStroke();
          doc.fillColor('#b91c1c').text(
            badgeText,
            x - badgeWidth + paddingX,
            y + paddingY / 2,
            { width: textWidth, align: 'center' }
          );
          doc.restore();
        };

        const drawFieldFrame = (field, rect) => {
          const padding = scaledSpacing(16, 12);
          const radius = scaledSpacing(14, 8);
          doc.save();
          doc.lineWidth(Math.max(1, 1.1 * scale));
          doc.fillColor('#fbfdff');
          doc.strokeColor('#cbd5f5');
          doc.roundedRect(rect.x, rect.y, rect.width, rect.height, radius).fillAndStroke('#fbfdff', '#cbd5f5');
          doc.restore();

          const label = field.label || `Field ${field.id}`;
          const labelOptions = {
            width: rect.width - padding * 2
          };
          doc.font('Helvetica-Bold').fontSize(scaledFont(11)).fillColor('#1e1b4b');
          doc.text(label, rect.x + padding, rect.y + padding, labelOptions);
          const labelHeight = doc.heightOfString(label, labelOptions);

          if (field.required) {
            drawRequiredBadge(rect.x + rect.width - padding, rect.y + padding / 2);
          }

          const contentTop = rect.y + padding + labelHeight + scaledSpacing(8, 6);
          const contentHeight = Math.max(rect.height - (contentTop - rect.y) - padding, scaledSpacing(28, 20));
          const contentRect = {
            x: rect.x + padding,
            y: contentTop,
            width: rect.width - padding * 2,
            height: contentHeight
          };

          doc.font('Helvetica').fontSize(scaledFont(10)).fillColor('#1f2937');
          return contentRect;
        };

        const drawInputSurface = (contentRect, options = {}) => {
          const {
            radius = scaledSpacing(10, 6),
            dashed = false
          } = options;
          doc.save();
          doc.lineWidth(Math.max(1, 1 * scale));
          doc.fillColor('#ffffff');
          doc.strokeColor('#dbeafe');
          if (dashed) {
            doc.dash(4 * scale, { space: 3 * scale });
          }
          doc.roundedRect(contentRect.x, contentRect.y, contentRect.width, contentRect.height, radius).fillAndStroke('#ffffff', '#dbeafe');
          if (dashed) {
            doc.undash();
          }
          doc.restore();
        };

        // Canvas backdrop
        doc.save();
        doc.fillColor('#f8fafc');
        doc.strokeColor('#e2e8f0');
        doc.roundedRect(originX, originY, canvasWidthPt, canvasHeightPt, scaledSpacing(18, 12)).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.restore();

        if (title || meta.templateDescription) {
          const headingY = originY - scaledSpacing(40, 32);
          doc.font('Helvetica-Bold').fontSize(scaledFont(18)).fillColor('#1e1b4b');
          doc.text(title, originX, headingY, {
            width: canvasWidthPt,
            align: 'center'
          });
          if (meta.templateDescription) {
            doc.font('Helvetica').fontSize(scaledFont(10)).fillColor('#475569');
            doc.text(meta.templateDescription, originX, headingY + scaledSpacing(18, 14), {
              width: canvasWidthPt,
              align: 'center'
            });
          }
        }

        templateFields.forEach((field) => {
          const key = String(field.id);
          const value = formData[key];
          renderedKeys.add(key);

          const fieldX = originX + px(parseNumeric(field.position?.x, 0));
          const fieldY = originY + px(parseNumeric(field.position?.y, 0));
          const fieldWidth = px(parseNumeric(field.size?.width ?? field.width, 240));
          const fieldHeight = px(parseNumeric(field.size?.height ?? field.height, 72));

          const frame = drawFieldFrame(field, {
            x: fieldX,
            y: fieldY,
            width: fieldWidth,
            height: fieldHeight
          });

          const bodyPadding = scaledSpacing(10, 8);

          if (field.type === 'checkbox') {
            const boxSize = Math.min(frame.height, scaledSpacing(24, 14));
            drawInputSurface(
              {
                x: frame.x,
                y: frame.y + (frame.height - boxSize) / 2,
                width: boxSize,
                height: boxSize
              },
              { radius: scaledSpacing(6, 4) }
            );
            if (value) {
              const checkInset = Math.max(3, 2 * scale);
              doc.save();
              doc.strokeColor('#4338ca').lineWidth(Math.max(2, 1.2 * scale));
              doc.moveTo(frame.x + checkInset, frame.y + frame.height / 2);
              doc.lineTo(frame.x + boxSize / 2, frame.y + frame.height - checkInset);
              doc.lineTo(frame.x + boxSize - checkInset, frame.y + checkInset);
              doc.stroke();
              doc.restore();
            }

            doc.font('Helvetica').fontSize(scaledFont(11)).fillColor('#1f2937').text(
              field.checkboxLabel || 'Option',
              frame.x + boxSize + bodyPadding,
              frame.y + (frame.height - scaledFont(11)) / 2,
              {
                width: frame.width - boxSize - bodyPadding,
                height: frame.height,
                align: 'left'
              }
            );
            return;
          }

          if (field.type === 'signature') {
            const signatureArea = {
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frame.height - scaledSpacing(18, 14)
            };
            drawInputSurface(signatureArea, { dashed: true });

            const signatureData = signatures[key];
            if (signatureData && signatureData.startsWith('data:image')) {
              try {
                const base64Data = signatureData.split(',')[1];
                const buffer = Buffer.from(base64Data, 'base64');
                doc.image(buffer, signatureArea.x, signatureArea.y, {
                  fit: [signatureArea.width, signatureArea.height],
                  align: 'center',
                  valign: 'center'
                });
              } catch (err) {
                console.error('Failed to embed signature image:', err);
              }
            } else {
              doc.font('Helvetica-Oblique').fontSize(scaledFont(10)).fillColor('#94a3b8').text(
                'Sign inside the box',
                signatureArea.x,
                signatureArea.y + (signatureArea.height - scaledFont(10)) / 2,
                {
                  width: signatureArea.width,
                  align: 'center'
                }
              );
            }

            doc.font('Helvetica').fontSize(scaledFont(9)).fillColor('#94a3b8').text(
              'Sign inside the box',
              frame.x,
              signatureArea.y + signatureArea.height + scaledSpacing(6, 4),
              {
                width: frame.width,
                align: 'center'
              }
            );
            return;
          }

          if (field.type === 'photo') {
            drawInputSurface(frame, { dashed: true });
            const files = Array.isArray(value) ? value : [];
            if (files.length > 0) {
              const names = files
                .map((file, index) => `${index + 1}. ${file.originalname || file.name || file.path || 'Attachment'}`)
                .join('\n');
              doc.font('Helvetica').fontSize(scaledFont(10)).fillColor('#1f2937').text(
                names,
                frame.x + bodyPadding,
                frame.y + bodyPadding,
                {
                  width: frame.width - bodyPadding * 2,
                  height: frame.height - bodyPadding * 2,
                  lineBreak: true
                }
              );
            } else {
              doc.font('Helvetica-Oblique').fontSize(scaledFont(10)).fillColor('#94a3b8').text(
                'No files uploaded',
                frame.x + bodyPadding,
                frame.y + (frame.height - scaledFont(10)) / 2,
                {
                  width: frame.width - bodyPadding * 2,
                  align: 'center'
                }
              );
            }
            return;
          }

          // Text & Paragraph fields
          drawInputSurface(frame);
          const hasValue = value !== undefined && value !== null && String(value).trim() !== '';
          const placeholderText = field.placeholder || '';
          doc.font('Helvetica').fontSize(scaledFont(field.type === 'textarea' ? 11 : 12)).fillColor(
            hasValue ? '#0f172a' : '#94a3b8'
          ).text(
            hasValue ? safeText(value) : placeholderText,
            frame.x + bodyPadding,
            frame.y + bodyPadding,
            {
              width: frame.width - bodyPadding * 2,
              height: frame.height - bodyPadding * 2,
              lineBreak: true
            }
          );
        });

        let footerCursor = originY + canvasHeightPt + scaledSpacing(40, 32);
        const footerWidth = doc.page.width - PDF_MARGIN_PT * 2;

        Object.entries(formData || {})
          .filter(([key]) => !renderedKeys.has(key) && !String(key).startsWith('signature_'))
          .forEach(([key, value], index) => {
            const label = key
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (letter) => letter.toUpperCase());
            if (index === 0) {
              doc.font('Helvetica-Bold').fontSize(scaledFont(12)).fillColor('#1e1b4b');
              doc.text('Additional data', PDF_MARGIN_PT, footerCursor, {
                width: footerWidth
              });
              footerCursor = doc.y + scaledSpacing(8, 6);
            }
            doc.font('Helvetica').fontSize(scaledFont(10)).fillColor('#334155');
            doc.text(`${label}: ${safeText(value)}`, PDF_MARGIN_PT, footerCursor, {
              width: footerWidth
            });
            footerCursor = doc.y + scaledSpacing(4, 4);
          });

        doc.font('Helvetica').fontSize(scaledFont(9)).fillColor('#94a3b8').text(
          `Generated on ${new Date().toLocaleString()}`,
          PDF_MARGIN_PT,
          doc.page.height - PDF_MARGIN_PT - scaledSpacing(14, 10),
          { width: footerWidth, align: 'right' }
        );

        doc.end();

        stream.on('finish', () => resolve(targetPath));
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Checks that the generated PDF file exists and is not empty.
   * @param {string} filePath - Path to the PDF file.
   * @returns {Promise<boolean>}
   */
  static async validatePDF(filePath) {
    try {
      const stats = await fsp.stat(filePath);
      return stats.size > 0;
    } catch (error) {
      return false;
    }
  }
}

module.exports = PDFGenerator;
