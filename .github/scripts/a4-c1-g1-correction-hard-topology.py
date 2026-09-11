from pathlib import Path

path = Path("src/components/documents/a4-page-editor.tsx")
text = path.read_text()

old = """          const beforeRevision = session.getState().revision;
          commitUserTransaction(repaired, 'insert-text');
          if (session.getState().revision !== beforeRevision) {"""
new = """          const hardSectionTopologyChanged =
            !bookmark.collapsed &&
            splitHardSections(canonical).length !==
              splitHardSections(repaired.html).length;
          const beforeRevision = session.getState().revision;
          commitUserTransaction(
            repaired,
            'insert-text',
            hardSectionTopologyChanged,
          );
          if (session.getState().revision !== beforeRevision) {"""
count = text.count(old)
if count != 1:
    raise SystemExit(f"hard topology replacement: expected one match, got {count}")
text = text.replace(old, new, 1)
path.write_text(text)
