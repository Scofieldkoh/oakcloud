from pathlib import Path

path = Path('src/components/documents/a4-page-editor.tsx')
s = path.read_text()

# Structural selections are nullable at session initialization. Native edit paths
# must refuse to mutate until a concrete revision-qualified selection exists.
s = s.replace(
    "if (!target.ok || target.selection.collapsed) return;",
    "if (!target.ok || !target.selection || target.selection.collapsed) return;",
)
s = s.replace(
    "if (!target.ok) return;\n        const result = replaceLogicalSelection(\n          session.getState().internalHtml,\n          target.selection,",
    "if (!target.ok || !target.selection) return;\n        const result = replaceLogicalSelection(\n          session.getState().internalHtml,\n          target.selection,",
)
s = s.replace(
    "if (!target.ok) {\n          if (inputEvent.cancelable) inputEvent.preventDefault();",
    "if (!target.ok || !target.selection) {\n          if (inputEvent.cancelable) inputEvent.preventDefault();",
)

path.write_text(s)
print('tightened nullable structural selection guards')
