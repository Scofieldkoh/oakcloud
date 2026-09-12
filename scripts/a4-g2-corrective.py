from __future__ import annotations

from pathlib import Path
import subprocess


def reapply_v2_corrections() -> None:
    source = Path('.github/workflows/a4-g2-correction-v2.yml').read_text()
    start_marker = "      - name: Apply G2 corrections\n        shell: bash\n        run: |\n"
    end_marker = "      - name: S2 focused regression\n"
    if start_marker not in source or end_marker not in source:
        raise SystemExit('Unable to locate the validated v2 corrective patch block.')
    block = source.split(start_marker, 1)[1].split(end_marker, 1)[0]
    lines = [line[10:] if line.startswith('          ') else line for line in block.splitlines()]
    script = Path('/tmp/a4-g2-v2-apply.sh')
    script.write_text('\n'.join(lines) + '\n')
    subprocess.run(['bash', str(script)], check=True)


def correct_list_toggle_mapping() -> None:
    path = Path('src/components/documents/a4-page-editor.tsx')
    text = path.read_text()
    old = """        if (command.type === 'list') {
          const listType = command.value;
          if (listType === 'none') {
            applyCurrentSemanticCommand({ type: 'clear-list-type' });
          } else {
            applyCurrentSemanticCommand({ type: 'set-list-type', listType });
          }
          return;
        }
"""
    new = """        if (command.type === 'list') {
          const listType = command.value;
          const surface = documentSurfaceRef.current;
          if (!surface) return;
          if (!selectionIsWithinPageContents(surface) && !restoreSelection()) return;
          const bookmark = captureFlowSelection(surface);
          if (!bookmark) return;
          const currentList = readLogicalFormatState(
            surface,
            bookmark,
            effectiveLayout,
          ).list;
          if (listType === 'none' || currentList === listType) {
            applyCurrentSemanticCommand({ type: 'clear-list-type' });
          } else {
            applyCurrentSemanticCommand({ type: 'set-list-type', listType });
          }
          return;
        }
"""
    if old not in text:
        raise SystemExit('List command mapping marker is missing.')
    text = text.replace(old, new, 1)
    old_deps = "      [applyCurrentS2NestToggle, applyCurrentSemanticCommand, applySelectionTransaction, handleCommand],\n"
    new_deps = """      [
        applyCurrentS2NestToggle,
        applyCurrentSemanticCommand,
        applySelectionTransaction,
        effectiveLayout,
        handleCommand,
        restoreSelection,
      ],
"""
    if old_deps not in text:
        raise SystemExit('Toolbar callback dependency marker is missing.')
    path.write_text(text.replace(old_deps, new_deps, 1))


if __name__ == '__main__':
    reapply_v2_corrections()
    correct_list_toggle_mapping()
