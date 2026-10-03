import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { CLINIC_NAME } from "@pedia/shared";
import type { DocBlock, DocContent } from "../content";

/** react-pdf can't read CSS variables: these mirror --color-ink, --color-ink-muted, --color-line, --color-line-strong, --color-brand-soft. */
const INK = "#16282b";
const MUTED = "#4c6265";
const LINE = "#d6e6e6";
const LINE_STRONG = "#b2cccc";
const BRAND_SOFT = "#7ec4c6";

// Helvetica has no ₱ glyph; Noto Sans does (public/fonts, plan Q2).
Font.register({ family: "Noto Sans", fonts: [{ src: "/fonts/NotoSans-Regular.ttf" }, { src: "/fonts/NotoSans-Bold.ttf", fontWeight: 700 }] });
Font.registerHyphenationCallback((word) => [word]); // never hyphenate a child's name

const s = StyleSheet.create({
  page: { fontFamily: "Noto Sans", fontSize: 10, lineHeight: 1.45, color: INK, padding: 48, paddingBottom: 64 },
  header: { borderBottomWidth: 2, borderBottomColor: BRAND_SOFT, paddingBottom: 8, marginBottom: 16 },
  logo: { width: 150, marginBottom: 6 },
  title: { fontSize: 12, fontWeight: 700, marginTop: 4, textTransform: "uppercase" },
  muted: { color: MUTED },
  block: { marginBottom: 12 },
  heading: { fontWeight: 700, marginBottom: 4 },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: "32%", color: MUTED },
  value: { width: "68%" },
  thead: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE_STRONG, fontWeight: 700 },
  trow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE },
  cell: { flex: 1, paddingVertical: 3, paddingRight: 6 },
  signatures: { flexDirection: "row", gap: 32, marginTop: 40 },
  sign: { flex: 1, borderTopWidth: 1, borderTopColor: INK, paddingTop: 4 },
  footnote: { position: "absolute", bottom: 28, left: 48, right: 48, fontSize: 8, color: MUTED },
});

function Table({ block }: { block: Extract<DocBlock, { kind: "table" }> }) {
  const align = (i: number) => (block.numeric?.includes(i) ? { textAlign: "right" as const } : {});
  const line = (cells: string[], style: typeof s.trow) => (
    <View style={style} wrap={false}>
      {cells.map((c, i) => <Text key={i} style={[s.cell, align(i)]}>{c}</Text>)}
    </View>
  );
  return (
    <>
      {line(block.head, s.thead)}
      {block.rows.map((r, i) => <View key={i}>{line(r, s.trow)}</View>)}
      {block.foot && line(block.foot, s.thead)}
    </>
  );
}

function Block({ block }: { block: DocBlock }) {
  if (block.kind === "signatures") {
    return (
      <View style={s.signatures} wrap={false}>
        {block.lines.map((l) => (
          <View key={l.label} style={s.sign}>
            <Text>{l.name ?? " "}</Text>
            <Text style={s.muted}>{l.detail ? `${l.label} · ${l.detail}` : l.label}</Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={s.block}>
      {block.heading && <Text style={s.heading}>{block.heading}</Text>}
      {block.kind === "rows" &&
        block.rows.map(([label, value]) => (
          <View key={label} style={s.row} wrap={false}>
            <Text style={s.label}>{label}</Text>
            <Text style={s.value}>{value}</Text>
          </View>
        ))}
      {block.kind === "text" && block.paragraphs.map((p, i) => <Text key={i} style={{ marginBottom: 4 }}>{p}</Text>)}
      {block.kind === "table" && <Table block={block} />}
    </View>
  );
}

/** The PDF for any document. Returns the <Document> element so pdf() gets the type it expects. */
export function documentPdf(content: DocContent) {
  return (
    <Document title={content.title} author={CLINIC_NAME} creator={CLINIC_NAME}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          {/* The logo carries the clinic's name; alt text isn't supported, the document metadata names it. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src="/brand/kidsmile-logo.png" style={s.logo} />
          <Text style={s.title}>{content.title}</Text>
          <Text style={s.muted}>{content.subtitle}</Text>
        </View>
        {content.blocks.map((b, i) => <Block key={i} block={b} />)}
        {content.footnote && <Text style={s.footnote} fixed>{content.footnote}</Text>}
      </Page>
    </Document>
  );
}
