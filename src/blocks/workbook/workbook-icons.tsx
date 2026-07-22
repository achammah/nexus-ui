// adapted from Univer (@univerjs, Apache-2.0) — icon-language swap. Univer resolves
// every menu/toolbar icon by NAME through its ComponentManager (each stock name is
// bulk-registered at construction and `register` overwrites), so re-registering the
// same names with app-language components right after createUniver retints the whole
// chrome — toolbar, dropdowns, context menus, popups — at the registry, with zero
// vendor patching. Glyphs come from lucide (the app's icon set); families lucide
// does not carry (border variants, text rotation, freeze) are generated here in
// lucide grammar: 24-box, stroke-2 round caps, currentColor, no fills.
import * as React from "react";
import {
  AArrowDown, AArrowUp, AlignCenter, AlignJustify, AlignLeft, AlignRight,
  AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart,
  ArrowDownFromLine, ArrowDownToLine, ArrowLeftFromLine, ArrowLeftToLine,
  ArrowRightFromLine, ArrowRightToLine, ArrowUpFromLine, ArrowUpToLine, Ban, Bold,
  ClipboardPaste, Copy, DollarSign, Eye, EyeOff, FoldHorizontal, FoldVertical,
  Grid3x3, Hash, IndentDecrease, Italic, Keyboard, List, ListOrdered, ListTodo,
  Lock, Menu, MoveHorizontal, MoveVertical, PaintBucket, Paintbrush, PanelTop,
  Percent, Plus, Redo2, RemoveFormatting, Scissors, Settings2, Sigma,
  Strikethrough, Subscript, Superscript, TableCellsMerge, TableCellsSplit, Trash2,
  Type, Underline, Undo2, WrapText,
  type LucideIcon,
} from "lucide-react";

/* Every icon Univer renders receives these: `className` carries the size context
   (font-size, icon = 1em) and `extend.colorChannel1` carries the live color for
   two-tone icons (font color / fill). The wrappers swallow `extend` (not a DOM
   prop) and keep the 1em sizing contract. */
export interface UniverIconProps extends React.SVGAttributes<SVGElement> {
  className?: string;
  extend?: { colorChannel1?: string };
}
type UniverIconComponent = React.ForwardRefExoticComponent<
  UniverIconProps & React.RefAttributes<SVGSVGElement>
>;

const lucideIcon = (Icon: LucideIcon): UniverIconComponent =>
  React.forwardRef<SVGSVGElement, UniverIconProps>(function NxUniverIcon(
    { extend: _extend, className, ...rest },
    ref,
  ) {
    return <Icon ref={ref} size="1em" className={className} aria-hidden {...rest} />;
  });

/* Two-tone (font color / fill color): the command glyph above a rounded color
   strip fed by Univer's live colorChannel1 — the picker affordance kept, drawn in
   the app's geometry instead of the stock "letter with a paint bar" look. */
const twoTone = (Icon: LucideIcon): UniverIconComponent =>
  React.forwardRef<SVGSVGElement, UniverIconProps>(function NxUniverTwoTone(
    { extend, className, ...rest },
    ref,
  ) {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="none"
        className={className}
        aria-hidden
        {...rest}
      >
        <Icon x={3.5} y={0.5} width={17} height={17} />
        <rect x={4.5} y={19.5} width={15} height={3} rx={1.5} fill={extend?.colorChannel1 ?? "currentColor"} stroke="none" />
      </svg>
    );
  });

/* Generated families — one factory per family so all variants stay geometrically
   coherent. Shared grammar: viewBox 24, stroke currentColor, width 2, round. */
const glyph = (children: React.ReactNode): UniverIconComponent =>
  React.forwardRef<SVGSVGElement, UniverIconProps>(function NxUniverGlyph(
    { extend: _extend, className, ...rest },
    ref,
  ) {
    return (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
        {...rest}
      >
        {children}
      </svg>
    );
  });

/* Border pickers: a ghost frame + ghost inner cross carry the cell metaphor; the
   edges the command paints are drawn at full stroke. */
type BorderPart = "top" | "right" | "bottom" | "left" | "h" | "v" | "slash" | "backslash" | "diag2l" | "diag2r" | "diag3";
const B = { x1: 4, y1: 4, x2: 20, y2: 20, mid: 12 };
const borderPart = (p: BorderPart, ghost: boolean): React.ReactNode => {
  const s = ghost ? { opacity: 0.28, strokeWidth: 1.5 } : {};
  switch (p) {
    case "top": return <line key={p} x1={B.x1} y1={B.y1} x2={B.x2} y2={B.y1} {...s} />;
    case "bottom": return <line key={p} x1={B.x1} y1={B.y2} x2={B.x2} y2={B.y2} {...s} />;
    case "left": return <line key={p} x1={B.x1} y1={B.y1} x2={B.x1} y2={B.y2} {...s} />;
    case "right": return <line key={p} x1={B.x2} y1={B.y1} x2={B.x2} y2={B.y2} {...s} />;
    case "h": return <line key={p} x1={B.x1} y1={B.mid} x2={B.x2} y2={B.mid} {...s} />;
    case "v": return <line key={p} x1={B.mid} y1={B.y1} x2={B.mid} y2={B.y2} {...s} />;
    case "slash": return <line key={p} x1={B.x1} y1={B.y2} x2={B.x2} y2={B.y1} {...s} />;
    case "backslash": return <line key={p} x1={B.x1} y1={B.y1} x2={B.x2} y2={B.y2} {...s} />;
    case "diag2l": return <g key={p} {...s}><line x1={B.x1} y1={14} x2={14} y2={B.y1} /><line x1={10} y1={B.y2} x2={B.x2} y2={10} /></g>;
    case "diag2r": return <g key={p} {...s}><line x1={10} y1={B.y1} x2={B.x2} y2={14} /><line x1={B.x1} y1={10} x2={14} y2={B.y2} /></g>;
    case "diag3": return <g key={p} {...s}><line x1={B.x1} y1={11} x2={11} y2={B.y1} /><line x1={B.x1} y1={18} x2={18} y2={B.y1} /><line x1={9} y1={B.y2} x2={B.x2} y2={9} /></g>;
  }
};
const FRAME: BorderPart[] = ["top", "right", "bottom", "left"];
const CROSS: BorderPart[] = ["h", "v"];
const borderIcon = (solid: BorderPart[], extraGhost: BorderPart[] = []): UniverIconComponent => {
  const ghost = [...FRAME, ...CROSS, ...extraGhost].filter((p) => !solid.includes(p));
  return glyph(<>{ghost.map((p) => borderPart(p, true))}{solid.map((p) => borderPart(p, false))}</>);
};

/* Text rotation: the arrow shows the run direction over a constant baseline. */
const rotationIcon = (angle: number, vertical = false): UniverIconComponent =>
  glyph(
    <>
      <g transform={`rotate(${angle} 11 11)`}>
        <line x1={4} y1={11} x2={17} y2={11} />
        <polyline points="13,7 17,11 13,15" />
      </g>
      {vertical
        ? <line x1={21} y1={4} x2={21} y2={18} opacity={0.4} strokeWidth={1.5} />
        : <line x1={4} y1={21} x2={20} y2={21} opacity={0.4} strokeWidth={1.5} />}
    </>,
  );

/* Freeze panes: the pane rectangle with the frozen band at full stroke. */
const freezeIcon = (kind: "row" | "col" | "sel" | "off"): UniverIconComponent =>
  glyph(
    <>
      <rect x={4} y={4} width={16} height={16} rx={2} opacity={0.28} strokeWidth={1.5} />
      {kind !== "off" && (kind === "row" || kind === "sel") && <line x1={4} y1={9} x2={20} y2={9} />}
      {kind !== "off" && (kind === "col" || kind === "sel") && <line x1={9} y1={4} x2={9} y2={20} />}
      {kind === "off" && <line x1={5} y1={19} x2={19} y2={5} />}
    </>,
  );

/* Decimal digits (.0+ / .0-): the numeric dot-and-zero with the operation badge. */
const digitsIcon = (op: "add" | "reduce"): UniverIconComponent =>
  glyph(
    <>
      <circle cx={4.6} cy={17.4} r={0.9} fill="currentColor" stroke="none" />
      <ellipse cx={11} cy={13.5} rx={3.6} ry={5.9} />
      <line x1={17.5} y1={6.5} x2={22.5} y2={6.5} strokeWidth={1.8} />
      {op === "add" && <line x1={20} y1={4} x2={20} y2={9} strokeWidth={1.8} />}
    </>,
  );

/* Truncate ("clip past the cell edge"): the text run stops dead at the wall. */
const truncationIcon: UniverIconComponent = glyph(
  <>
    <line x1={3} y1={12} x2={14} y2={12} />
    <line x1={18} y1={5} x2={18} y2={19} />
    <line x1={14} y1={8.5} x2={14} y2={15.5} opacity={0.4} strokeWidth={1.5} />
  </>,
);

/* Vertical merge = the merge glyph turned 90°, so the pair reads as one family. */
const rotated = (Icon: LucideIcon, angle: number): UniverIconComponent =>
  glyph(<g transform={`rotate(${angle} 12 12)`}><Icon x={0} y={0} width={24} height={24} /></g>);

/* name -> component. Keys are Univer's registry names (verified against the 0.25
   preset bundles: every `icon:` string the sheets-core menus reference). */
export const NX_UNIVER_ICONS: Record<string, UniverIconComponent> = {
  // history + clipboard + format painter
  UndoIcon: lucideIcon(Undo2),
  RedoIcon: lucideIcon(Redo2),
  BrushIcon: lucideIcon(Paintbrush),
  ClearFormatDoubleIcon: lucideIcon(RemoveFormatting),
  CopyDoubleIcon: lucideIcon(Copy),
  CutIcon: lucideIcon(Scissors),
  PasteSpecialDoubleIcon: lucideIcon(ClipboardPaste),
  DeleteIcon: lucideIcon(Trash2),
  InsertDoubleIcon: lucideIcon(Plus),

  // type styling
  BoldIcon: lucideIcon(Bold),
  ItalicIcon: lucideIcon(Italic),
  UnderlineIcon: lucideIcon(Underline),
  StrikethroughIcon: lucideIcon(Strikethrough),
  SubscriptIcon: lucideIcon(Subscript),
  SuperscriptIcon: lucideIcon(Superscript),
  FontSizeIncreaseIcon: lucideIcon(AArrowUp),
  FontSizeReduceIcon: lucideIcon(AArrowDown),
  TextTypeIcon: lucideIcon(Type),
  FontColorDoubleIcon: twoTone(Type),
  PaintBucketDoubleIcon: twoTone(PaintBucket),
  NoColorDoubleIcon: lucideIcon(Ban),

  // number formats
  DollarIcon: lucideIcon(DollarSign),
  PercentIcon: lucideIcon(Percent),
  AddDigitsIcon: digitsIcon("add"),
  ReduceDigitsIcon: digitsIcon("reduce"),
  PipingIcon: lucideIcon(Hash),
  FunctionIcon: lucideIcon(Sigma),

  // borders
  AllBorderIcon: borderIcon([...FRAME, ...CROSS]),
  NoBorderIcon: borderIcon([]),
  OuterBorderDoubleIcon: borderIcon(FRAME),
  InnerBorderDoubleIcon: borderIcon(CROSS),
  UpBorderDoubleIcon: borderIcon(["top"]),
  DownBorderDoubleIcon: borderIcon(["bottom"]),
  LeftBorderDoubleIcon: borderIcon(["left"]),
  RightBorderDoubleIcon: borderIcon(["right"]),
  HorizontalBorderDoubleIcon: borderIcon(["h"]),
  VerticalBorderDoubleIcon: borderIcon(["v"]),
  SlashDoubleIcon: borderIcon(["slash"]),
  BackSlashDoubleIcon: borderIcon(["backslash"]),
  LeftDoubleDiagonalDoubleIcon: borderIcon(["diag2l"]),
  RightDoubleDiagonalDoubleIcon: borderIcon(["diag2r"]),
  LeftTridiagonalDoubleIcon: borderIcon(["diag3"]),

  // merge
  MergeAllIcon: lucideIcon(TableCellsMerge),
  HorizontalMergeIcon: lucideIcon(TableCellsMerge),
  VerticalIntegrationIcon: rotated(TableCellsMerge, 90),
  CancelMergeIcon: lucideIcon(TableCellsSplit),

  // alignment + wrap + rotation
  LeftJustifyingIcon: lucideIcon(AlignLeft),
  HorizontallyIcon: lucideIcon(AlignCenter),
  RightJustifyingIcon: lucideIcon(AlignRight),
  AlignTextBothIcon: lucideIcon(AlignJustify),
  AlignTopIcon: lucideIcon(AlignVerticalJustifyStart),
  VerticalCenterIcon: lucideIcon(AlignVerticalJustifyCenter),
  AlignBottomIcon: lucideIcon(AlignVerticalJustifyEnd),
  AutowrapIcon: lucideIcon(WrapText),
  OverflowIcon: lucideIcon(ArrowRightFromLine),
  TruncationIcon: truncationIcon,
  NoRotationIcon: rotationIcon(0),
  LeftRotationFortyFiveDegreesIcon: rotationIcon(-45),
  RightRotationFortyFiveDegreesIcon: rotationIcon(45),
  LeftRotationNinetyDegreesIcon: rotationIcon(-90),
  RightRotationNinetyDegreesIcon: rotationIcon(90),
  VerticalTextIcon: rotationIcon(90, true),

  // rows / columns / cells
  InsertRowAboveDoubleIcon: lucideIcon(ArrowUpToLine),
  InsertRowBelowDoubleIcon: lucideIcon(ArrowDownToLine),
  LeftInsertColumnDoubleIcon: lucideIcon(ArrowLeftToLine),
  RightInsertColumnDoubleIcon: lucideIcon(ArrowRightToLine),
  InsertCellDownDoubleIcon: lucideIcon(ArrowDownFromLine),
  InsertCellShiftRightDoubleIcon: lucideIcon(ArrowRightFromLine),
  DeleteCellShiftUpDoubleIcon: lucideIcon(ArrowUpFromLine),
  DeleteCellShiftLeftDoubleIcon: lucideIcon(ArrowLeftFromLine),
  DeleteRowDoubleIcon: lucideIcon(Trash2),
  DeleteColumnDoubleIcon: lucideIcon(Trash2),
  AdjustHeightDoubleIcon: lucideIcon(MoveVertical),
  AdjustWidthDoubleIcon: lucideIcon(MoveHorizontal),
  AutoHeightDoubleIcon: lucideIcon(FoldVertical),
  AutoWidthDoubleIcon: lucideIcon(FoldHorizontal),
  HideDoubleIcon: lucideIcon(EyeOff),
  EyeOutlineIcon: lucideIcon(Eye),

  // freeze
  FreezeRowIcon: freezeIcon("row"),
  FreezeColumnIcon: freezeIcon("col"),
  FreezeToSelectedIcon: freezeIcon("sel"),
  CancelFreezeIcon: freezeIcon("off"),

  // sheet + workbench chrome
  GridIcon: lucideIcon(Grid3x3),
  HideGridlinesDoubleIcon: lucideIcon(Grid3x3),
  MenuIcon: lucideIcon(Menu),
  ProtectIcon: lucideIcon(Lock),
  KeyboardIcon: lucideIcon(Keyboard),
  ShortcutIcon: lucideIcon(Keyboard),
  DocumentSettingIcon: lucideIcon(Settings2),
  HeaderFooterIcon: lucideIcon(PanelTop),

  // in-cell editor lists (docs-ui inside the cell editor)
  OrderIcon: lucideIcon(ListOrdered),
  UnorderIcon: lucideIcon(List),
  TodoListDoubleIcon: lucideIcon(ListTodo),
  ReduceDoubleIcon: lucideIcon(IndentDecrease),
};

/* The ComponentManager surface this module needs (structural, so the block does
   not import types from @univerjs/ui — the caller passes the live instance). */
export interface IconRegistry {
  delete: (name: string) => void;
  register: (name: string, component: unknown, options?: { framework?: string }) => unknown;
}

/* Re-register the app-language set over the stock names. delete-first keeps the
   console clean (register warns on duplicates); registrations die with the Univer
   instance, so a remount re-applies from scratch. */
export function registerNxIcons(componentManager: IconRegistry): void {
  for (const [name, component] of Object.entries(NX_UNIVER_ICONS)) {
    componentManager.delete(name);
    componentManager.register(name, component);
  }
}
