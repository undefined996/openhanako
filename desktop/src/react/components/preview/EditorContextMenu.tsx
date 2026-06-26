/**
 * EditorContextMenu — markdown 编辑器专属右键菜单
 *
 * 上半部分：剪切/复制/粘贴/全选/撤销/重做（竖排标准菜单项）
 * 下半部分：格式化按钮横排（B I S </> | H1 H2 H3 | 引用 代码块 分隔线 列表）
 *
 * 挂在 PreviewPanel 内，仅 markdown 编辑模式可见。
 * 通过 stopPropagation 阻止全局 InputContextMenu 重复弹出；
 * view 不可用时事件透传，由 InputContextMenu 兜底。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { undo, redo } from '@codemirror/commands';
import { spring } from '../../ui/motion';
import { useStore } from '../../stores';
import {
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleInlineCode,
  setHeading,
  toggleBlockquote,
  insertCodeBlock,
  insertHorizontalRule,
  toggleList,
} from '../../editor/markdown-commands';
import type { EditorView } from '@codemirror/view';
import type { PreviewEditorHandle } from '../PreviewEditor';

declare function t(key: string): string;

interface MenuState {
  position: { x: number; y: number };
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

function editorHasSelection(view: EditorView): boolean {
  return view.state.selection.ranges.some(r => !r.empty);
}

function editorCanUndo(view: EditorView): boolean {
  return undo({ state: view.state, dispatch: () => {} });
}

function editorCanRedo(view: EditorView): boolean {
  return redo({ state: view.state, dispatch: () => {} });
}

interface Props {
  editorRef: React.RefObject<PreviewEditorHandle | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function EditorContextMenu({ editorRef, containerRef }: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const handleContextMenu = (e: MouseEvent) => {
      const view = editorRef.current?.getView();
      if (!view) return;

      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!container.contains(target)) return;

      e.preventDefault();
      e.stopPropagation();

      useStore.getState().clearQuoteCandidate();

      setMenu({
        position: { x: e.clientX, y: e.clientY },
        hasSelection: editorHasSelection(view),
        canUndo: editorCanUndo(view),
        canRedo: editorCanRedo(view),
      });
    };

    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
  }, [editorRef, containerRef]);

  // 位置修正
  useEffect(() => {
    if (!menu || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    let { x, y } = menu.position;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
    if (x < 0) x = 4;
    if (y < 0) y = 4;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }, [menu]);

  // 关闭逻辑
  useEffect(() => {
    if (!menu) return undefined;

    const close = () => setMenu(null);
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const handleScroll = () => close();

    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick, true);
      document.addEventListener('contextmenu', handleContextMenu, true);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('scroll', handleScroll, true);
    });

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menu]);

  const close = useCallback(() => setMenu(null), []);

  const getView = useCallback((): EditorView | null => {
    return editorRef.current?.getView() ?? null;
  }, [editorRef]);

  const runEditCommand = useCallback(async (command: 'cut' | 'copy' | 'paste' | 'selectAll') => {
    const view = getView();
    if (!view) return;
    view.focus();
    try {
      await window.platform?.runEditCommand?.(command);
    } catch (err) {
      console.warn('[EditorContextMenu] edit command failed:', err);
    }
  }, [getView]);

  const handleUndo = useCallback(() => {
    const view = getView();
    if (view) { undo(view); view.focus(); }
  }, [getView]);

  const handleRedo = useCallback(() => {
    const view = getView();
    if (view) { redo(view); view.focus(); }
  }, [getView]);

  if (!menu) return null;

  const isMac = navigator.platform?.startsWith('Mac') || navigator.userAgent?.includes('Mac');
  const mod = isMac ? '⌘' : 'Ctrl+';

  return createPortal(
    <motion.div
      className="context-menu"
      ref={menuRef}
      style={{ left: menu.position.x, top: menu.position.y }}
      initial={{ opacity: 0, scale: 0.95, y: -2 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={spring.paperSnap}
    >
      {/* ── 标准编辑命令 ── */}
      <MenuItem
        label={t('ctx.cut')}
        shortcut={`${mod}X`}
        disabled={!menu.hasSelection}
        onClick={() => { close(); void runEditCommand('cut'); }}
      />
      <MenuItem
        label={t('ctx.copy')}
        shortcut={`${mod}C`}
        disabled={!menu.hasSelection}
        onClick={() => { close(); void runEditCommand('copy'); }}
      />
      <MenuItem
        label={t('ctx.paste')}
        shortcut={`${mod}V`}
        onClick={() => { close(); void runEditCommand('paste'); }}
      />
      <div className="context-menu-divider" />
      <MenuItem
        label={t('ctx.selectAll')}
        shortcut={`${mod}A`}
        onClick={() => { close(); void runEditCommand('selectAll'); }}
      />
      <div className="context-menu-divider" />
      <MenuItem
        label={t('ctx.undo')}
        shortcut={`${mod}Z`}
        disabled={!menu.canUndo}
        onClick={() => { close(); handleUndo(); }}
      />
      <MenuItem
        label={t('ctx.redo')}
        shortcut={isMac ? '⇧⌘Z' : 'Ctrl+Y'}
        disabled={!menu.canRedo}
        onClick={() => { close(); handleRedo(); }}
      />

      {/* ── 格式化工具栏 ── */}
      <div className="context-menu-divider" />
      <div className="context-menu-fmt-row">
        <FmtButton title={t('ctx.bold')} onClick={() => { close(); const v = getView(); if (v) toggleBold(v); }}>
          <span className="context-menu-fmt-text" style={{ fontWeight: 700 }}>B</span>
        </FmtButton>
        <FmtButton title={t('ctx.italic')} onClick={() => { close(); const v = getView(); if (v) toggleItalic(v); }}>
          <span className="context-menu-fmt-text" style={{ fontStyle: 'italic' }}>I</span>
        </FmtButton>
        <FmtButton title={t('ctx.strikethrough')} onClick={() => { close(); const v = getView(); if (v) toggleStrikethrough(v); }}>
          <span className="context-menu-fmt-text" style={{ textDecoration: 'line-through' }}>S</span>
        </FmtButton>
        <FmtButton title={t('ctx.inlineCode')} onClick={() => { close(); const v = getView(); if (v) toggleInlineCode(v); }}>
          <svg viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
        </FmtButton>

        <div className="context-menu-fmt-sep" />

        <FmtButton title={t('ctx.heading1')} onClick={() => { close(); const v = getView(); if (v) setHeading(v, 1); }}>
          <span className="context-menu-fmt-text" style={{ fontSize: '0.8em', fontWeight: 600 }}>H<sub>1</sub></span>
        </FmtButton>
        <FmtButton title={t('ctx.heading2')} onClick={() => { close(); const v = getView(); if (v) setHeading(v, 2); }}>
          <span className="context-menu-fmt-text" style={{ fontSize: '0.75em', fontWeight: 500 }}>H<sub>2</sub></span>
        </FmtButton>
        <FmtButton title={t('ctx.heading3')} onClick={() => { close(); const v = getView(); if (v) setHeading(v, 3); }}>
          <span className="context-menu-fmt-text" style={{ fontSize: '0.7em', fontWeight: 500 }}>H<sub>3</sub></span>
        </FmtButton>

        <div className="context-menu-fmt-sep" />

        <FmtButton title={t('ctx.blockquote')} onClick={() => { close(); const v = getView(); if (v) toggleBlockquote(v); }}>
          <svg viewBox="0 0 24 24">
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="7" y1="6" x2="7" y2="14" />
            <line x1="3" y1="14" x2="21" y2="14" />
          </svg>
        </FmtButton>
        <FmtButton title={t('ctx.codeBlock')} onClick={() => { close(); const v = getView(); if (v) insertCodeBlock(v); }}>
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <polyline points="9 8 7 12 9 16" />
            <polyline points="15 8 17 12 15 16" />
          </svg>
        </FmtButton>
        <FmtButton title={t('ctx.horizontalRule')} onClick={() => { close(); const v = getView(); if (v) insertHorizontalRule(v); }}>
          <svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12" /></svg>
        </FmtButton>
        <FmtButton title={t('ctx.list')} onClick={() => { close(); const v = getView(); if (v) toggleList(v); }}>
          <svg viewBox="0 0 24 24">
            <line x1="9" y1="6" x2="20" y2="6" />
            <line x1="9" y1="12" x2="20" y2="12" />
            <line x1="9" y1="18" x2="20" y2="18" />
            <circle cx="4.5" cy="6" r="1.2" />
            <circle cx="4.5" cy="12" r="1.2" />
            <circle cx="4.5" cy="18" r="1.2" />
          </svg>
        </FmtButton>
      </div>
    </motion.div>,
    document.body,
  );
}

/* ── 子组件 ── */

function MenuItem({ label, shortcut, disabled, onClick }: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`context-menu-item${disabled ? ' disabled' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        if (disabled) { e.preventDefault(); e.stopPropagation(); return; }
        e.stopPropagation();
        onClick();
      }}
    >
      <span className="context-menu-label">{label}</span>
      {shortcut && <span className="context-menu-shortcut">{shortcut}</span>}
    </div>
  );
}

function FmtButton({ title, onClick, children }: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="context-menu-fmt-btn"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </div>
  );
}
