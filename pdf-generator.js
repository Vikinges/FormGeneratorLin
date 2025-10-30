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

    const attachments = Array.isArray(formData?.files) ? formData.files : [];
    const attachmentsByField = new Map();
    attachments.forEach((file) => {
      const fieldKey = file?.field || file?.fieldId;
      if (!fieldKey) {
        return;
      }
      const key = String(fieldKey);
      if (!attachmentsByField.has(key)) {
        attachmentsByField.set(key, []);
      }
      attachmentsByField.get(key).push(file);
    });

    const serialisedData = { ...(formData || {}) };
    delete serialisedData.files;

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

    const safeText = (value) => {
      if (value === undefined || value === null || value === '') {
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

    const resolveAssetPath = (assetPath) => {
      if (!assetPath || typeof assetPath !== 'string') {
        return null;
      }
      if (path.isAbsolute(assetPath)) {
        return assetPath;
      }
      const normalised = assetPath.replace(/^[/\\]+/, '');
      return path.resolve(__dirname, normalised);
    };

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

        const layoutBounds = templateFields.reduce(
          (acc, field) => {
            const width = parseNumeric(field.size?.width ?? field.width, 240);
            const height = parseNumeric(field.size?.height ?? field.height, 72);
            const x = parseNumeric(field.position?.x, 0);
            const y = parseNumeric(field.position?.y, 0);
            return {
              width: Math.max(acc.width, x + width),
              height: Math.max(acc.height, y + height)
            };
          },
          { width: CANVAS_WIDTH_PX, height: CANVAS_HEIGHT_PX }
        );

        const printableWidth = doc.page.width - PDF_MARGIN_PT * 2;
        const printableHeight = doc.page.height - PDF_MARGIN_PT * 2;
        const headingBlock = title || meta.templateDescription ? 72 : 24;
        const availableHeight = printableHeight - headingBlock;

        const scale = Math.min(
          printableWidth / layoutBounds.width,
          availableHeight / layoutBounds.height
        );

        const canvasWidthPt = layoutBounds.width * scale;
        const canvasHeightPt = layoutBounds.height * scale;
        const originX = PDF_MARGIN_PT + (printableWidth - canvasWidthPt) / 2;
        const originY =
          PDF_MARGIN_PT + headingBlock + (availableHeight - canvasHeightPt) / 2;

        if (title || meta.templateDescription) {
          doc.font('Helvetica-Bold')
            .fontSize(18)
            .fillColor('#1e1b4b')
            .text(title, PDF_MARGIN_PT, PDF_MARGIN_PT, {
              width: printableWidth,
              align: 'center'
            });

          if (meta.templateDescription) {
            doc.font('Helvetica')
              .fontSize(10)
              .fillColor('#475569')
              .text(meta.templateDescription, PDF_MARGIN_PT, PDF_MARGIN_PT + 24, {
                width: printableWidth,
                align: 'center'
              });
          }
        }

        doc.save();
        doc.translate(originX, originY);
        doc.scale(scale, scale);

        const CARD_RADIUS = 18;
        const CARD_PADDING = 18;
        const INPUT_RADIUS = 12;
        const INPUT_PADDING = 14;
        const REQUIRED_BADGE = {
          paddingX: 8,
          paddingY: 4,
          font: 9,
          radius: 8
        };

        const drawRequiredBadge = (x, y) => {
          const label = 'REQUIRED';
          doc.save();
          doc.font('Helvetica-Bold').fontSize(REQUIRED_BADGE.font);
          const textWidth = doc.widthOfString(label);
          const badgeWidth = textWidth + REQUIRED_BADGE.paddingX * 2;
          const badgeHeight = REQUIRED_BADGE.font + REQUIRED_BADGE.paddingY * 2;
          doc.fillColor('#fee2e2').strokeColor('#fca5a5');
          doc
            .roundedRect(
              x - badgeWidth,
              y,
              badgeWidth,
              badgeHeight,
              REQUIRED_BADGE.radius
            )
            .fillAndStroke('#fee2e2', '#fca5a5');
          doc.fillColor('#b91c1c').text(label, x - badgeWidth + REQUIRED_BADGE.paddingX, y + REQUIRED_BADGE.paddingY / 2, {
            width: textWidth,
            align: 'center'
          });
          doc.restore();
        };

        const drawCard = (field, rect) => {
          doc.save();
          doc.lineWidth(2);
          doc.fillColor('#fbfdff');
          doc.strokeColor('#cbd5f5');
          doc
            .roundedRect(rect.x, rect.y, rect.width, rect.height, CARD_RADIUS)
            .fillAndStroke('#fbfdff', '#cbd5f5');
          doc.restore();

          const label = field.label || `Field ${field.id}`;
          const textWidth = rect.width - CARD_PADDING * 2;

          doc.font('Helvetica-Bold').fontSize(16).fillColor('#1e1b4b');
          const labelHeight = doc.heightOfString(label, { width: textWidth });
          doc.text(label, rect.x + CARD_PADDING, rect.y + CARD_PADDING, {
            width: textWidth,
            lineBreak: true
          });

          if (field.required) {
            drawRequiredBadge(rect.x + rect.width - CARD_PADDING, rect.y + CARD_PADDING / 2);
          }

          const contentY = rect.y + CARD_PADDING + labelHeight + 10;
          const contentHeight = Math.max(rect.height - (contentY - rect.y) - CARD_PADDING, 24);

          return {
            x: rect.x + CARD_PADDING,
            y: contentY,
            width: rect.width - CARD_PADDING * 2,
            height: contentHeight
          };
        };

        const drawInputSurface = (rect, { dashed = false } = {}) => {
          doc.save();
          doc.lineWidth(1.4);
          doc.fillColor('#ffffff');
          doc.strokeColor('#dbeafe');
          if (dashed) {
            doc.dash(6, { space: 4 });
          }
          doc
            .roundedRect(rect.x, rect.y, rect.width, rect.height, INPUT_RADIUS)
            .fillAndStroke('#ffffff', '#dbeafe');
          if (dashed) {
            doc.undash();
          }
          doc.restore();
        };

        doc.save();
        doc.fillColor('#f8fafc');
        doc.strokeColor('#e2e8f0');
        doc.roundedRect(0, 0, layoutBounds.width, layoutBounds.height, 24).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.restore();

        templateFields.forEach((field) => {
          const key = String(field.id);
          const rawValue = serialisedData[key];
          renderedKeys.add(key);

          const x = parseNumeric(field.position?.x, 0);
          const y = parseNumeric(field.position?.y, 0);
          const width = parseNumeric(field.size?.width ?? field.width, 240);
          const height = parseNumeric(field.size?.height ?? field.height, 72);

          const cardRect = { x, y, width, height };
          const inputRect = drawCard(field, cardRect);

          if (field.type === 'checkbox') {
            const boxSize = Math.min(inputRect.height, 24);
            const boxRect = {
              x: inputRect.x,
              y: inputRect.y + (inputRect.height - boxSize) / 2,
              width: boxSize,
              height: boxSize
            };
            drawInputSurface(boxRect);
            if (rawValue) {
              doc.save();
              doc.strokeColor('#4338ca').lineWidth(2);
              doc
                .moveTo(boxRect.x + 3, boxRect.y + boxRect.height / 2)
                .lineTo(boxRect.x + boxRect.width / 2, boxRect.y + boxRect.height - 4)
                .lineTo(boxRect.x + boxRect.width - 3, boxRect.y + 4)
                .stroke();
              doc.restore();
            }
            doc.font('Helvetica').fontSize(14).fillColor('#1f2937');
            doc.text(
              field.checkboxLabel || 'Option',
              boxRect.x + boxRect.width + 10,
              inputRect.y + (inputRect.height - 14) / 2,
              {
                width: inputRect.width - boxRect.width - 10
              }
            );
            return;
          }

          if (field.type === 'signature') {
            drawInputSurface(inputRect, { dashed: true });
            const signatureData = signatures[key];
            if (signatureData && signatureData.startsWith('data:image')) {
              try {
                const buffer = Buffer.from(signatureData.split(',')[1], 'base64');
                doc.image(buffer, inputRect.x + 6, inputRect.y + 6, {
                  fit: [inputRect.width - 12, inputRect.height - 24],
                  align: 'center',
                  valign: 'center'
                });
              } catch (err) {
                console.error('Failed to embed signature image:', err);
              }
            } else {
              doc.font('Helvetica-Oblique').fontSize(12).fillColor('#94a3b8');
              doc.text('Sign inside the box', inputRect.x, inputRect.y + (inputRect.height - 12) / 2, {
                width: inputRect.width,
                align: 'center'
              });
            }
            doc.font('Helvetica').fontSize(10).fillColor('#94a3b8');
            doc.text('Sign inside the box', inputRect.x, inputRect.y + inputRect.height + 6, {
              width: inputRect.width,
              align: 'center'
            });
            return;
          }

          if (field.type === 'photo') {
            drawInputSurface(inputRect, { dashed: true });
            const fieldAttachments = attachmentsByField.get(key) || [];
            if (fieldAttachments.length) {
              const columns = fieldAttachments.length > 1 ? 2 : 1;
              const rows = Math.ceil(fieldAttachments.length / columns);
              const cellGap = 12;
              const innerWidth = inputRect.width - INPUT_PADDING * 2 - cellGap * (columns - 1);
              const innerHeight = inputRect.height - INPUT_PADDING * 2 - cellGap * (rows - 1);
              const cellWidth = innerWidth / columns;
              const cellHeight = innerHeight / rows;

              fieldAttachments.forEach((asset, index) => {
                const column = index % columns;
                const row = Math.floor(index / columns);
                const cellX = inputRect.x + INPUT_PADDING + column * (cellWidth + cellGap);
                const cellY = inputRect.y + INPUT_PADDING + row * (cellHeight + cellGap);
                const resolvedPath = resolveAssetPath(asset.diskPath || asset.path);

                doc.save();
                doc.lineWidth(1.2);
                doc.strokeColor('#cbd5f5');
                doc.rect(cellX, cellY, cellWidth, cellHeight).stroke();
                if (resolvedPath && fs.existsSync(resolvedPath)) {
                  try {
                    doc.image(resolvedPath, cellX + 6, cellY + 6, {
                      fit: [cellWidth - 12, cellHeight - 28],
                      align: 'center',
                      valign: 'center'
                    });
                  } catch (err) {
                    console.error('Failed to embed photo:', err);
                  }
                }
                doc.font('Helvetica').fontSize(10).fillColor('#1f2937');
                doc.text(asset.originalname || asset.name || 'Attachment', cellX + 6, cellY + cellHeight - 18, {
                  width: cellWidth - 12,
                  align: 'center'
                });
                doc.restore();
              });
              return;
            }

            if (Array.isArray(rawValue) && rawValue.length) {
              const names = rawValue
                .map((file, index) => `${index + 1}. ${file.name || file.originalname || 'Attachment'}`)
                .join('\n');
              doc.font('Helvetica').fontSize(12).fillColor('#1f2937');
              doc.text(names, inputRect.x + INPUT_PADDING, inputRect.y + INPUT_PADDING, {
                width: inputRect.width - INPUT_PADDING * 2,
                height: inputRect.height - INPUT_PADDING * 2,
                lineBreak: true
              });
            } else {
              doc.font('Helvetica-Oblique').fontSize(12).fillColor('#94a3b8');
              doc.text('Drop photos here', inputRect.x, inputRect.y + (inputRect.height - 12) / 2, {
                width: inputRect.width,
                align: 'center'
              });
            }
            return;
          }

          drawInputSurface(inputRect);
          const hasValue = rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '';
          const placeholder = field.placeholder || '';
          doc.font('Helvetica')
            .fontSize(field.type === 'textarea' ? 14 : 16)
            .fillColor(hasValue ? '#0f172a' : '#94a3b8')
            .text(
              hasValue ? safeText(rawValue) : placeholder,
              inputRect.x + INPUT_PADDING,
              inputRect.y + INPUT_PADDING,
              {
                width: inputRect.width - INPUT_PADDING * 2,
                height: inputRect.height - INPUT_PADDING * 2,
                lineBreak: true
              }
            );
        });

        doc.restore();

        const canvasBottom = originY + canvasHeightPt;
        const footerWidth = doc.page.width - PDF_MARGIN_PT * 2;
        let footerCursor = canvasBottom + 24;

        Object.entries(serialisedData || {})
          .filter(([key]) => !renderedKeys.has(key) && !String(key).startsWith('signature_'))
          .forEach(([key, value], index) => {
            const label = key
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (letter) => letter.toUpperCase());
            if (index === 0) {
              doc.font('Helvetica-Bold').fontSize(12).fillColor('#1e1b4b');
              doc.text('Additional data', PDF_MARGIN_PT, footerCursor, {
                width: footerWidth
              });
              footerCursor = doc.y + 8;
            }
            doc.font('Helvetica').fontSize(10).fillColor('#334155');
            doc.text(`${label}: ${safeText(value)}`, PDF_MARGIN_PT, footerCursor, {
              width: footerWidth
            });
            footerCursor = doc.y + 4;
          });

        doc.font('Helvetica')
          .fontSize(9)
          .fillColor('#94a3b8')
          .text(
            `Generated on ${new Date().toLocaleString()}`,
            PDF_MARGIN_PT,
            doc.page.height - PDF_MARGIN_PT - 12,
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
