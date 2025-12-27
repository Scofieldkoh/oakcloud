'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
export type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Link as TiptapLink } from '@tiptap/extension-link';
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import DOMPurify from 'dompurify';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Unlink,
  Strikethrough,
  ALargeSmall,
  Palette,
  ChevronDown,
  Heading1,
  Minus,
  RemoveFormatting,
} from 'lucide-react';

// ============================================================================
// Types & Constants
// ============================================================================

interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: number;
  className?: string;
  /** Hide the built-in toolbar (for external toolbar usage) */
  hideToolbar?: boolean;
  /** Render prop for external toolbar */
  renderToolbar?: (editor: Editor | null) => React.ReactNode;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
  /** For toggle buttons, indicates if the button controls a pressed state */
  isToggle?: boolean;
}

const FONT_SIZES = [
  '8', '9', '10', '11', '12', '14', '16', '18', '20', '22', '24', '26', '28', '36'
];

const TEXT_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Purple', value: '#9333ea' },
];

// ============================================================================
// Toolbar Components
// ============================================================================

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  children,
  title,
  isToggle = false,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={isToggle ? isActive : undefined}
      className={`p-1.5 rounded transition-colors ${
        isActive
          ? 'bg-background-tertiary text-text-primary'
          : 'text-text-muted hover:bg-background-secondary hover:text-text-primary'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );
}

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

function Dropdown({ trigger, children, isOpen, onToggle, onClose }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-0.5 p-1.5 rounded text-text-muted hover:bg-background-secondary hover:text-text-primary transition-colors"
      >
        {trigger}
        <ChevronDown className="w-3 h-3" />
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 py-1 bg-background-elevated border border-border-primary rounded-md shadow-elevation-2 z-10 min-w-[100px]">
          {children}
        </div>
      )}
    </div>
  );
}

export interface EditorToolbarProps {
  editor: Editor | null;
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showFontSize, setShowFontSize] = useState(false);
  const [showColor, setShowColor] = useState(false);

  const setLink = useCallback(() => {
    if (!editor) return;

    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: url })
        .run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  const handleLinkClick = () => {
    if (!editor) return;

    const previousUrl = editor.getAttributes('link').href;
    if (previousUrl) {
      setLinkUrl(previousUrl);
    }
    setShowLinkInput(true);
  };

  const setFontSize = (size: string) => {
    if (!editor) return;
    editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
    setShowFontSize(false);
  };

  const setColor = (color: string) => {
    if (!editor) return;
    if (color === '') {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
    setShowColor(false);
  };

  const applyH1Style = () => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .setBold()
      .setMark('textStyle', { fontSize: '24px' })
      .setColor('#2563eb')
      .run();
  };

  const resetToNormal = () => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .unsetBold()
      .unsetItalic()
      .unsetUnderline()
      .unsetStrike()
      .unsetColor()
      .unsetMark('textStyle')
      .run();
  };

  const insertDivider = () => {
    if (!editor) return;
    editor.chain().focus().setHorizontalRule().run();
  };

  if (!editor) return null;

  return (
    <div className="flex items-center gap-0.5 p-1 border-b border-border-primary bg-background-secondary flex-wrap">
      {/* Font Size */}
      <Dropdown
        trigger={<ALargeSmall className="w-4 h-4" />}
        isOpen={showFontSize}
        onToggle={() => setShowFontSize(!showFontSize)}
        onClose={() => setShowFontSize(false)}
      >
        <div className="grid grid-cols-7 gap-0.5 p-1 w-[168px]">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setFontSize(`${size}px`)}
              className="w-5 h-5 text-2xs text-center hover:bg-background-tertiary transition-colors rounded"
            >
              {size}
            </button>
          ))}
        </div>
      </Dropdown>

      {/* Text Color */}
      <Dropdown
        trigger={
          <div className="flex items-center">
            <Palette className="w-4 h-4" />
            <div
              className="w-2 h-2 rounded-full ml-0.5 border border-border-primary"
              style={{
                backgroundColor: editor.getAttributes('textStyle').color || 'currentColor',
              }}
            />
          </div>
        }
        isOpen={showColor}
        onToggle={() => setShowColor(!showColor)}
        onClose={() => setShowColor(false)}
      >
        {TEXT_COLORS.map((color) => (
          <button
            key={color.value || 'default'}
            type="button"
            onClick={() => setColor(color.value)}
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-background-tertiary transition-colors flex items-center gap-2"
          >
            <div
              className="w-3 h-3 rounded-full border border-border-primary"
              style={{ backgroundColor: color.value || 'var(--text-primary)' }}
            />
            {color.label}
          </button>
        ))}
      </Dropdown>

      {/* H1 Style */}
      <ToolbarButton
        onClick={applyH1Style}
        title="Heading Style (24px Blue)"
      >
        <Heading1 className="w-4 h-4" />
      </ToolbarButton>

      {/* Divider */}
      <ToolbarButton
        onClick={insertDivider}
        title="Insert Divider"
      >
        <Minus className="w-4 h-4" />
      </ToolbarButton>

      {/* Reset to Normal */}
      <ToolbarButton
        onClick={resetToNormal}
        title="Reset to Normal Text"
      >
        <RemoveFormatting className="w-4 h-4" />
      </ToolbarButton>

      <div className="w-px h-5 bg-border-primary mx-1" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        isToggle
        title="Bold (Ctrl+B)"
      >
        <Bold className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        isToggle
        title="Italic (Ctrl+I)"
      >
        <Italic className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        isToggle
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        isToggle
        title="Strikethrough"
      >
        <Strikethrough className="w-4 h-4" />
      </ToolbarButton>

      <div className="w-px h-5 bg-border-primary mx-1" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        isToggle
        title="Bullet List"
      >
        <List className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        isToggle
        title="Numbered List"
      >
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>

      <div className="w-px h-5 bg-border-primary mx-1" />

      {showLinkInput ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Enter URL..."
            className="px-2 py-1 text-xs border border-border-primary rounded bg-background-elevated text-text-primary w-40"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setLink();
              } else if (e.key === 'Escape') {
                setShowLinkInput(false);
                setLinkUrl('');
              }
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={setLink}
            className="px-2 py-1 text-xs bg-accent-primary text-white rounded hover:bg-accent-primary/90"
          >
            Set
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLinkInput(false);
              setLinkUrl('');
            }}
            className="px-2 py-1 text-xs text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <ToolbarButton
            onClick={handleLinkClick}
            isActive={editor.isActive('link')}
            isToggle
            title="Add Link"
          >
            <LinkIcon className="w-4 h-4" />
          </ToolbarButton>

          {editor.isActive('link') && (
            <ToolbarButton
              onClick={() => editor.chain().focus().unsetLink().run()}
              title="Remove Link"
            >
              <Unlink className="w-4 h-4" />
            </ToolbarButton>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Font Size Extension
// ============================================================================

const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
});

// ============================================================================
// Main Editor Component
// ============================================================================

export function RichTextEditor({
  value = '',
  onChange,
  readOnly = false,
  minHeight = 100,
  className = '',
  hideToolbar = false,
  renderToolbar,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
      }),
      Underline,
      FontSize,
      Color,
      TiptapLink.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: 'text-accent-primary underline',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    ],
    content: value,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: `rich-text-content focus:outline-none px-3 py-2 text-text-primary text-sm`,
        style: `min-height: ${minHeight}px`,
      },
    },
    immediatelyRender: false,
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [readOnly, editor]);

  if (readOnly) {
    return (
      <div
        className={`border border-border-primary rounded-md bg-background-elevated overflow-hidden ${className}`}
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>
    );
  }

  // If renderToolbar is provided, call it (external toolbar mode)
  if (renderToolbar) {
    return (
      <>
        {renderToolbar(editor)}
        <div className={`bg-background-elevated ${className}`}>
          <EditorContent editor={editor} />
        </div>
      </>
    );
  }

  // If hideToolbar is true, render content only
  if (hideToolbar) {
    return (
      <div className={`bg-background-elevated ${className}`}>
        <EditorContent editor={editor} />
      </div>
    );
  }

  // Default: render with built-in toolbar
  return (
    <div
      className={`border border-border-primary rounded-md bg-background-elevated flex flex-col focus-within:border-accent-primary focus-within:ring-1 focus-within:ring-accent-primary ${className}`}
    >
      <EditorToolbar editor={editor} />
      <div className="flex-1">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ============================================================================
// Read-only Display Component
// ============================================================================

/**
 * Sanitize HTML content to prevent XSS attacks
 * Allows safe formatting tags while stripping potentially dangerous content
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike',
      'ul', 'ol', 'li', 'a', 'span', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}

export function RichTextDisplay({
  content,
  className = '',
}: {
  content: string;
  className?: string;
}) {
  // Memoize sanitized content to avoid re-sanitizing on every render
  const sanitizedContent = useMemo(() => sanitizeHtml(content), [content]);

  return (
    <div
      className={`rich-text-content text-text-primary text-sm ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
}
