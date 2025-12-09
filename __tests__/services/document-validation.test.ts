/**
 * Document Validation Service Tests
 *
 * Tests for the document validation service used in document generation.
 * Tests placeholder detection, category assignment, and extraction.
 */

import { describe, it, expect } from 'vitest';
import { extractSections } from '@/services/document-validation.service';

describe('Document Validation Service', () => {
  describe('extractSections', () => {
    it('should extract h1 sections from HTML content', () => {
      const html = `
        <h1>Introduction</h1>
        <p>Some content here.</p>
        <h1>Main Section</h1>
        <p>More content.</p>
      `;

      const sections = extractSections(html);

      expect(sections).toHaveLength(2);
      expect(sections[0].title).toBe('Introduction');
      expect(sections[0].level).toBe(1);
      expect(sections[1].title).toBe('Main Section');
      expect(sections[1].level).toBe(1);
    });

    it('should extract h2 sections from HTML content', () => {
      const html = `
        <h2>First Subsection</h2>
        <p>Content.</p>
        <h2>Second Subsection</h2>
        <p>More content.</p>
      `;

      const sections = extractSections(html);

      expect(sections).toHaveLength(2);
      expect(sections[0].title).toBe('First Subsection');
      expect(sections[0].level).toBe(2);
      expect(sections[1].title).toBe('Second Subsection');
      expect(sections[1].level).toBe(2);
    });

    it('should extract mixed heading levels', () => {
      const html = `
        <h1>Chapter 1</h1>
        <h2>Section 1.1</h2>
        <h3>Subsection 1.1.1</h3>
        <h2>Section 1.2</h2>
        <h1>Chapter 2</h1>
      `;

      const sections = extractSections(html);

      expect(sections).toHaveLength(5);
      expect(sections[0].title).toBe('Chapter 1');
      expect(sections[0].level).toBe(1);
      expect(sections[1].title).toBe('Section 1.1');
      expect(sections[1].level).toBe(2);
      expect(sections[2].title).toBe('Subsection 1.1.1');
      expect(sections[2].level).toBe(3);
      expect(sections[3].title).toBe('Section 1.2');
      expect(sections[3].level).toBe(2);
      expect(sections[4].title).toBe('Chapter 2');
      expect(sections[4].level).toBe(1);
    });

    it('should handle headings with attributes', () => {
      const html = `
        <h1 class="title">Title with Class</h1>
        <h2 id="section-id" style="color: blue;">Styled Section</h2>
      `;

      const sections = extractSections(html);

      expect(sections).toHaveLength(2);
      expect(sections[0].title).toBe('Title with Class');
      expect(sections[1].title).toBe('Styled Section');
    });

    it('should return empty array for content without headings', () => {
      const html = `
        <p>Just a paragraph.</p>
        <div>A div element.</div>
        <span>Some text.</span>
      `;

      const sections = extractSections(html);

      expect(sections).toHaveLength(0);
    });

    it('should handle empty content', () => {
      const sections = extractSections('');
      expect(sections).toHaveLength(0);
    });

    it('should strip HTML tags from heading content', () => {
      const html = `
        <h1><strong>Bold</strong> and <em>italic</em> text</h1>
        <h2><span class="highlight">Highlighted</span> heading</h2>
      `;

      const sections = extractSections(html);

      expect(sections).toHaveLength(2);
      expect(sections[0].title).toBe('Bold and italic text');
      expect(sections[1].title).toBe('Highlighted heading');
    });

    it('should generate unique IDs for sections', () => {
      const html = `
        <h1>First Section</h1>
        <h1>Second Section</h1>
        <h1>Third Section</h1>
      `;

      const sections = extractSections(html);

      const ids = sections.map(s => s.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should handle headings up to h6', () => {
      const html = `
        <h1>Level 1</h1>
        <h2>Level 2</h2>
        <h3>Level 3</h3>
        <h4>Level 4</h4>
        <h5>Level 5</h5>
        <h6>Level 6</h6>
      `;

      const sections = extractSections(html);

      expect(sections).toHaveLength(6);
      for (let i = 0; i < 6; i++) {
        expect(sections[i].level).toBe(i + 1);
        expect(sections[i].title).toBe(`Level ${i + 1}`);
      }
    });
  });
});
