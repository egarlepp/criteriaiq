import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownContent } from '../MarkdownContent';

const render = (content: string) => renderToStaticMarkup(<MarkdownContent content={content} />);

describe('MarkdownContent', () => {
  it('renders Markdown as formatted content', () => {
    const html = render('## Plan\n\n- one\n- **two**');
    expect(html).toContain('<h2>Plan</h2>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<strong>two</strong>');
  });

  it('renders legacy HTML plans instead of showing the tags', () => {
    const html = render('<h3>Discovery</h3>\n<ul>\n<li>Kickoff</li>\n</ul>');
    expect(html).toContain('<h3>Discovery</h3>');
    expect(html).toContain('<li>Kickoff</li>');
    expect(html).not.toContain('&lt;h3&gt;');
  });

  it('strips script, event handlers, unsafe URLs and app classes', () => {
    const html = render(
      '<p class="fixed inset-0" onclick="x()">hi</p><script>alert(1)</script>' +
        '<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">l</a><iframe src="https://e.com"></iframe>',
    );
    expect(html).toContain('hi');
    expect(html).not.toMatch(/script|onerror|onclick|javascript:|iframe|inset-0/i);
  });

  it('keeps admonition blocks styled', () => {
    const html = render(':::warning\nCareful\n:::');
    expect(html).toContain('data-admonition="warning"');
    expect(html).toContain('Careful');
  });

  it('renders nothing for empty content', () => {
    expect(render('')).toBe('');
  });
});
