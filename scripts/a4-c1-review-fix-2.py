from pathlib import Path

path = Path('src/components/documents/a4-page-editor.tsx')
s = path.read_text()

old = """              if (
                session &&
                projectionRevision &&
                !session.publishProjection(projectionRevision)
              ) {
                return;
              }
"""
new = """              if (session && canonicalSessionRef.current !== session) {
                return;
              }
              if (
                session &&
                projectionRevision &&
                !session.publishProjection(projectionRevision)
              ) {
                return;
              }
"""
if s.count(old) != 1:
    raise SystemExit(f'projection publication guard: expected 1 match, got {s.count(old)}')
s = s.replace(old, new, 1)

path.write_text(s)
print('added active-session guard to async projection publication')
