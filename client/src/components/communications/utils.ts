// Shared utility functions for Communications components

/**
 * Formats a trigger key into a human-readable display format
 * Example: "step.completion" or "step_completion" -> "Step Completion"
 * Example: "phase.started" -> "Phase Started"
 */
export function formatTriggerKey(key: string): string {
  if (!key) return '';
  
  // Split by periods or underscores
  const parts = key.split(/[._]/);
  
  // Capitalize each part
  const capitalized = parts.map(part => 
    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  );
  
  return capitalized.join(' ');
}

/**
 * Resolve an email-asset filename to the URL that should appear in the
 * rendered email's <img src>. Inputs:
 *   - empty/null       → empty string (caller can fall back to a default)
 *   - already a full URL (http:// or https://) → returned verbatim
 *   - already an /api/files/... path           → returned verbatim
 *   - legacy /attached_assets/...              → returned verbatim (still
 *     served by /api/files's disk fallback chain on installs that haven't
 *     migrated yet)
 *   - bare filename                            → resolves through the
 *     canonical /api/files/system/email-assets/<filename> path, which
 *     the cloud-storage abstraction maps to the active provider (files
 *     DB / cloud / disk). Replaces the old hardcoded
 *     /attached_assets/uploads_email/<filename> prefix.
 */
export function getAssetPath(filename: string): string {
  if (!filename) return '';
  if (filename.startsWith('http://') || filename.startsWith('https://')) return filename;
  if (filename.startsWith('/')) return filename;
  return `/api/files/system/email-assets/${filename}`;
}

/**
 * Variant of getAssetPath that qualifies same-origin relative URLs to
 * absolute ones using `window.location.origin`. Used only by the in-app
 * preview path: `sanitizeEmailHtml` strips <img src> values whose scheme
 * isn't http(s)/mailto/tel/data, so a bare /api/files/... URL would
 * silently disappear from the rendered preview. The real email-send
 * path embeds images as base64 data URLs server-side, so it doesn't
 * need this — only the in-browser preview does.
 */
export function getAssetPathForPreview(filename: string): string {
  const raw = getAssetPath(filename);
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (typeof window !== 'undefined' && raw.startsWith('/')) {
    return `${window.location.origin}${raw}`;
  }
  return raw;
}

/**
 * Default design variables for email designs
 */
export const DEFAULT_DESIGN_VARIABLES = {
  headerBg: '#1e3a8a',
  rightTitle: 'CriteriaIQ',
  logoSrc: '',
  logoAlt: 'CriteriaIQ',
  logoWidth: '160',
  logoHeight: '48',
  graphic1: '',
  graphic2: '',
  graphic3: '',
  footerLine1: 'This email was sent from the CriteriaIQ Technical Validation',
  footerLine2: '© CriteriaIQ. All rights reserved.'
};

/**
 * Sample body content for email design previews
 */
export const SAMPLE_BODY_CONTENT = '<h2>Sample Email Content</h2><p>This is where your text content will appear when the design is used in an email template.</p><div style="margin: 20px 0;"><h3>Sample Data Table</h3><table style="width: 100%; border-collapse: collapse; margin: 10px 0;"><tr style="background-color: #f5f5f5;"><th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Project Name</th><th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Status</th><th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Engineer</th><th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Customer</th></tr><tr><td style="border: 1px solid #ddd; padding: 8px;">CriteriaIQ Implementation</td><td style="border: 1px solid #ddd; padding: 8px;">Active</td><td style="border: 1px solid #ddd; padding: 8px;">John Doe</td><td style="border: 1px solid #ddd; padding: 8px;">Test Customer</td></tr><tr style="background-color: #f9f9f9;"><td style="border: 1px solid #ddd; padding: 8px;">Security Assessment</td><td style="border: 1px solid #ddd; padding: 8px;">Complete</td><td style="border: 1px solid #ddd; padding: 8px;">Jane Smith</td><td style="border: 1px solid #ddd; padding: 8px;">Demo Corp</td></tr></table></div>';

/**
 * Default HTML template for new email designs with button reference guide
 */
export const DEFAULT_EMAIL_DESIGN_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Design</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
  <table width="735" cellpadding="0" cellspacing="0" border="0" style="width: 735px !important; max-width: 735px !important; margin: 0 auto; background-color: #ffffff; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
    <tr>
      <td style="width: 735px !important;">

        <!-- Header -->
        <table width="735" cellpadding="0" cellspacing="0" border="0" style="width: 735px !important; background-color: {{HEADER_BG}} !important; margin: 0 0 30px 0; border-collapse: collapse; table-layout: fixed; height: 52px !important;">
          <tr style="height: 52px !important;">

            <!-- Logo area -->
            <td style="padding: 0; background-color: {{HEADER_BG}} !important; vertical-align: middle; width: 180px; height: 52px !important; position: relative;">
              <table width="180" cellpadding="0" cellspacing="0" border="0" style="height: 52px;">
                <tr>
                  <td style="padding: 2px 0 0 20px; vertical-align: middle; height: 52px;">
                    <img src="{{LOGO_SRC}}" alt="{{LOGO_ALT}}" width="{{LOGO_WIDTH}}" height="{{LOGO_HEIGHT}}" style="height: {{LOGO_HEIGHT}}px !important; width: {{LOGO_WIDTH}}px !important; display: block;">
                  </td>
                </tr>
              </table>
            </td>

            <!-- Right title -->
            <td style="padding: 0; background-color: {{HEADER_BG}} !important; vertical-align: bottom; text-align: right; width: 555px; height: 52px !important; position: relative;">
              <table width="555" cellpadding="0" cellspacing="0" border="0" style="height: 52px;">
                <tr>
                  <td style="padding: 0 20px 4px 0; vertical-align: bottom; text-align: right; height: 52px;">
                    <span style="color: #ffffff; font-size: 14px; font-weight: bold; line-height: 14px;">{{RIGHT_TITLE}}</span>
                  </td>
                </tr>
              </table>
            </td>

          </tr>
        </table>
        <!-- /Header -->

      </td>
    </tr>

    <!-- Body (injected by app) -->
    <tr>
      <td style="padding: 0 30px 30px 30px; width: 735px !important;">
        {{BODY_TEXT_CONTENT}}
      </td>
    </tr>
    <!-- /Body -->

    <!-- Footer -->
    <tr>
      <td style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #e9ecef; text-align: center; font-size: 12px; color: #6c757d; width: 735px !important;">
        <p style="margin: 0;">{{FOOTER_LINE1}}</p>
        <p style="margin: 5px 0 0 0;">{{FOOTER_LINE2}}</p>
      </td>
    </tr>
    <!-- /Footer -->

  </table>
</body>
</html>`;

/**
 * Processes HTML with design variables for preview
 */
export function processHtmlWithVariables(
  htmlRaw: string,
  designVariables: Record<string, any>,
  includeBodyContent = true
): string {
  let processedHtml = htmlRaw;

  // Qualify same-origin /api/files/ URLs to absolute https URLs so the
  // shared sanitizer (which only allows http/https/mailto/tel/data
  // schemes in <img src>) doesn't strip them from the rendered preview.
  // Server-side email rendering converts these to base64 data URLs in
  // its own path, so it doesn't need the qualification.
  const tokens: Record<string, string> = {
    '{{HEADER_BG}}': designVariables.headerBg || DEFAULT_DESIGN_VARIABLES.headerBg,
    '{{RIGHT_TITLE}}': designVariables.rightTitle || DEFAULT_DESIGN_VARIABLES.rightTitle,
    '{{LOGO_SRC}}': getAssetPathForPreview(designVariables.logoSrc) || getAssetPathForPreview('/attached_assets/system/branding/criteriaiq-logo-light.png'),
    '{{LOGO_ALT}}': designVariables.logoAlt || DEFAULT_DESIGN_VARIABLES.logoAlt,
    '{{LOGO_WIDTH}}': designVariables.logoWidth || DEFAULT_DESIGN_VARIABLES.logoWidth,
    '{{LOGO_HEIGHT}}': designVariables.logoHeight || DEFAULT_DESIGN_VARIABLES.logoHeight,
    '{{GRAPHIC1}}': getAssetPathForPreview(designVariables.graphic1) || '',
    '{{GRAPHIC2}}': getAssetPathForPreview(designVariables.graphic2) || '',
    '{{GRAPHIC3}}': getAssetPathForPreview(designVariables.graphic3) || '',
    '{{FOOTER_LINE1}}': designVariables.footerLine1 || DEFAULT_DESIGN_VARIABLES.footerLine1,
    '{{FOOTER_LINE2}}': designVariables.footerLine2 || DEFAULT_DESIGN_VARIABLES.footerLine2,
  };

  if (includeBodyContent) {
    tokens['{{BODY_TEXT_CONTENT}}'] = SAMPLE_BODY_CONTENT;
  }

  Object.entries(tokens).forEach(([token, value]) => {
    const regex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    processedHtml = processedHtml.replace(regex, value);
  });

  return processedHtml;
}
