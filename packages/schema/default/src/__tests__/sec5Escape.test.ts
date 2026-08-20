import { describe, expect, it } from "vitest";
import { escapeHtml } from "../escapeHtml";
import {
  backgroundColor,
  codeBlock,
  highlight,
  link,
  mention,
  textColor,
} from "../index";

const ATTR_BREAKOUT = `" onmouseover="alert(1)`;
const TAG_BREAKOUT = `"><script>alert(1)</script>`;

function expectNoAttributeBreakout(html: string): void {
  expect(html).not.toContain(ATTR_BREAKOUT);
  expect(html).not.toContain(TAG_BREAKOUT);
  expect(html).not.toContain("<script>");
}

describe("SEC5 schema toHTML escaping", () => {
  it("escapes &<>\"' in document values", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("SEC5: hostile href does not break out of attributes", () => {
    const hrefHtml = link.serialize!.toHTML!("ok", { href: ATTR_BREAKOUT });
    expectNoAttributeBreakout(hrefHtml);
    expect(hrefHtml).toBe(
      `<a href="&quot; onmouseover=&quot;alert(1)">ok</a>`,
    );

    const titleHtml = link.serialize!.toHTML!("ok", {
      href: "https://example.com",
      title: TAG_BREAKOUT,
    });
    expectNoAttributeBreakout(titleHtml);
    expect(titleHtml).toBe(
      `<a href="https://example.com" title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">ok</a>`,
    );
  });

  it("SEC5: hostile color does not break out of attributes", () => {
    const colorSerializers = [highlight, textColor, backgroundColor];
    for (const schema of colorSerializers) {
      const attrHtml = schema.serialize!.toHTML!("ok", { color: ATTR_BREAKOUT });
      expectNoAttributeBreakout(attrHtml);
      expect(attrHtml).toContain("&quot; onmouseover=&quot;alert(1)");

      const tagHtml = schema.serialize!.toHTML!("ok", { color: TAG_BREAKOUT });
      expectNoAttributeBreakout(tagHtml);
      expect(tagHtml).toContain(
        "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
      );
    }
  });

  it("SEC5: hostile label does not break out of attributes", () => {
    const html = mention.serialize!.toHTML!("", {
      id: ATTR_BREAKOUT,
      label: TAG_BREAKOUT,
    });
    expectNoAttributeBreakout(html);
    expect(html).toBe(
      `<span class="mention" data-id="&quot; onmouseover=&quot;alert(1)">&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</span>`,
    );
  });

  it("SEC5: hostile lang does not break out of attributes", () => {
    const attrHtml = codeBlock.serialize!.toHTML!({
      id: "1",
      type: "codeBlock",
      props: { language: ATTR_BREAKOUT },
      content: "x",
    });
    expectNoAttributeBreakout(attrHtml);
    expect(attrHtml).toBe(
      `<pre><code class="language-&quot; onmouseover=&quot;alert(1)">x</code></pre>`,
    );

    const tagHtml = codeBlock.serialize!.toHTML!({
      id: "1",
      type: "codeBlock",
      props: { language: TAG_BREAKOUT },
      content: "x",
    });
    expectNoAttributeBreakout(tagHtml);
    expect(tagHtml).toBe(
      `<pre><code class="language-&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">x</code></pre>`,
    );
  });
});
