# @input/pen-interop

## .

`./dist/index.d.ts`

### value

- admitProviderImageUrl
- ALLOWED_DATA_PEN_ATTRS
- applyHtmlImageSrcPolicy
- DEFAULT_HTML_IMAGE_SRC_POLICY
- exportEditorToJson
- exportEditorToText
- exportMarkdownForBlocks
- exportMarkdownRange
- exportPenDocumentToText
- exportPlainText
- htmlExporter
- HtmlExportViewMode
- HtmlImageSrcPolicy
- htmlImporter
- HtmlImporter
- HtmlImportOptions
- isIngestibleImageSrc
- isSupportedPenDocumentVersion
- jsonDocumentImporter
- jsonExporter
- jsonImporter
- MarkdownExportConfig
- markdownExporter
- MarkdownExportRange
- MarkdownExportViewMode
- markdownImporter
- parseHtmlToBlocks
- parseHtmlWithReport
- parseJsonDocument
- parseJsonToBlocks
- parseJsonWithReport
- parseMarkdownToBlocks
- parseMarkdownWithReport
- parseXmlDocument
- PEN_DOCUMENT_JSON_VERSION
- PenBlockJSON
- PenDocumentJSON
- PenInlineContentJSON
- PenInlineNodeSegmentJSON
- PenInlineSegmentJSON
- PenInlineTextSegmentJSON
- PenJsonExportExtraOptions
- PenMarkJSON
- PenTextExportExtraOptions
- PenXmlDocument
- sanitizeHTML
- serializePenDocumentToXml
- textExporter
- xmlExporter
- XmlExporterExtraOptions
- xmlImporter
- XmlImporter
- XmlImportResult

## ./html

`./dist/html.d.ts`

### function

- admitProviderImageUrl
- applyHtmlImageSrcPolicy
- isIngestibleImageSrc
- parseHtmlToBlocks
- parseHtmlWithReport
- sanitizeHTML

### value

- ALLOWED_DATA_PEN_ATTRS
- DEFAULT_HTML_IMAGE_SRC_POLICY
- htmlExporter
- htmlImporter
- INGEST_FORBIDDEN_KEYS
- INGEST_MAX_IMAGE_COUNT
- INGEST_MAX_NESTING_DEPTH
- INGEST_MAX_NODE_COUNT
- INGEST_MAX_TEXT_SIZE
- INGEST_TIME_BUDGET_MS

### type

- HtmlExportViewMode
- HtmlImageSrcPolicy
- HtmlImporter
- HtmlImportOptions
- IngestDroppedByReason
- IngestDropReason
- IngestReport

## ./markdown

`./dist/markdown.d.ts`

### function

- exportMarkdownForBlocks
- exportMarkdownRange
- parseMarkdownToBlocks
- parseMarkdownWithReport

### value

- INGEST_FORBIDDEN_KEYS
- INGEST_MAX_IMAGE_COUNT
- INGEST_MAX_NESTING_DEPTH
- INGEST_MAX_NODE_COUNT
- INGEST_MAX_TEXT_SIZE
- INGEST_TIME_BUDGET_MS
- MarkdownExportConfig
- markdownExporter
- MarkdownExportRange
- MarkdownExportViewMode
- markdownImporter

### type

- IngestDroppedByReason
- IngestDropReason
- IngestReport

## ./json

`./dist/json.d.ts`

### function

- exportEditorToJson
- exportEditorToText
- exportPenDocumentToText
- exportPlainText
- parseJsonDocument
- parseJsonToBlocks
- parseJsonWithReport

### guard

- isSupportedPenDocumentVersion

### value

- INGEST_FORBIDDEN_KEYS
- INGEST_MAX_IMAGE_COUNT
- INGEST_MAX_NESTING_DEPTH
- INGEST_MAX_NODE_COUNT
- INGEST_MAX_TEXT_SIZE
- INGEST_TIME_BUDGET_MS
- jsonDocumentImporter
- jsonExporter
- jsonImporter
- PEN_DOCUMENT_JSON_VERSION
- PenBlockJSON
- PenDocumentJSON
- PenInlineContentJSON
- PenInlineNodeSegmentJSON
- PenInlineSegmentJSON
- PenInlineTextSegmentJSON
- PenJsonExportExtraOptions
- PenMarkJSON
- textExporter

### type

- IngestDroppedByReason
- IngestDropReason
- IngestReport
- PenTextExportExtraOptions

## ./xml

`./dist/xml.d.ts`

### function

- parseXmlDocument
- serializePenDocumentToXml

### value

- xmlExporter
- xmlImporter

### type

- PenXmlDocument
- XmlExporterExtraOptions
- XmlImporter
- XmlImportResult
