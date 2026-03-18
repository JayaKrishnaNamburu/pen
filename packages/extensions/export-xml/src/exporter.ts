import { exportEditorToJson } from "@pen/export-json";
import type { Editor, Exporter, ExportOptions } from "@pen/types";
import { serializePenDocumentToXml } from "./serializer";
import type { XmlExporterExtraOptions } from "./types";

export const xmlExporter: Exporter<string, XmlExporterExtraOptions> = {
  name: "xml",
  mimeType: "application/xml",
  fileExtension: ".xml",

  export(
    editor: Editor,
    options?: ExportOptions<XmlExporterExtraOptions>,
  ): string {
    const document = exportEditorToJson(editor, options);
    return serializePenDocumentToXml(document);
  },
};
